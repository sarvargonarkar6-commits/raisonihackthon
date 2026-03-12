import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- GLOBAL VARIABLES ---
const API_KEY = "apload api key".trim();
const MODEL = "llama-3.3-70b-versatile";

let currentUser = null;
let profileData = {};
let targetRole = "Software Engineer";
let userSkills = ""; // Array of skills from Firebase

// Interview State
let currentLevel = 1;
let maxLevelUnlocked = 1;
let currentQuestionNum = 1;
const MAX_QUESTIONS_PER_LEVEL = 5;
let currentScore = 0;
let chatHistory = [];
let warnings = 0;
let isInterviewActive = false;

// Audio Variables
let recognition;
let synth = window.speechSynthesis;
let premiumVoice = null;

// Face Tracking Variables
let faceTrackingInterval;
let baselineFrameData = null; // Used to detect movement

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    setupSpeechRecognition();
    loadVoices();
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);
            
            if (docSnap.exists()) {
                profileData = docSnap.data();
            } else {
                profileData = { name: user.displayName || "Student", activityLog: {} };
            }

            // Sync UI with Profile from Firebase
            targetRole = profileData.headline || profileData.targetRole || "Software Engineer";
            userSkills = profileData.skills || "general software engineering concepts"; // Extract Skills
            const fullName = profileData.name || user.displayName || "Student";
            
            if(document.getElementById('ui-name')) document.getElementById('ui-name').innerText = fullName;
            if(document.getElementById('ui-role')) document.getElementById('ui-role').innerText = targetRole;
            if(document.getElementById('dropdown-name')) document.getElementById('dropdown-name').innerText = fullName;

            if (profileData.photoURL && document.getElementById('nav-profile-img-container')) {
                document.getElementById('nav-profile-img-container').innerHTML = `<img src="${profileData.photoURL}" class="w-full h-full object-cover">`;
            }

            maxLevelUnlocked = profileData.maxInterviewLevel || 1;
            currentLevel = maxLevelUnlocked;
            
            renderLevelMap();
            
            // Wait for camera setup, then force start the level even if camera fails
            await setupCamera();
            startLevel(currentLevel);

        } catch (error) {
            console.error("Firebase Error:", error);
            startLevel(currentLevel); // Fallback start
        }
    } else {
        window.location.href = "index.html";
    }
});

window.logoutUser = () => {
    if(confirm("Are you sure you want to logout?")) {
        signOut(auth).then(() => {
            window.location.href = "index.html"; 
        });
    }
};

// --- SECURITY / ANTI-CHEAT (STRICT CAMERA TRACKING) ---
async function setupCamera() {
    try {
        const video = document.getElementById('webcam');
        if (!video) return;

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            video.play();
            startStrictFaceTracking(video);
        };
        
        const camText = document.getElementById('cam-status-text');
        const camDot = document.getElementById('cam-status-dot');
        if(camText) camText.innerText = "Monitoring Active";
        if(camDot) camDot.classList.replace('bg-red-500', 'bg-green-400');
    } catch (e) {
        console.warn("Camera access denied or device missing.", e);
        const camText = document.getElementById('cam-status-text');
        const camDot = document.getElementById('cam-status-dot');
        if(camText) camText.innerText = "Cam Disabled";
        if(camDot) camDot.classList.replace('bg-green-400', 'bg-red-500');
        triggerWarning("Camera access is MANDATORY for this proctored interview. Please allow it.");
    }
}

// Strict movement/face absence detection logic
function startStrictFaceTracking(videoElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if(faceTrackingInterval) clearInterval(faceTrackingInterval);

    // Check every 2.5 seconds
    faceTrackingInterval = setInterval(() => {
        if (!isInterviewActive || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) return;

        try {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            
            const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            
            // Initial Baseline frame
            if (!baselineFrameData) {
                baselineFrameData = currentFrame;
                return;
            }

            let diffCount = 0;
            let darkPixels = 0;
            
            for (let i = 0; i < currentFrame.length; i += 4) {
                // Check if camera is covered (too dark)
                const avg = (currentFrame[i] + currentFrame[i + 1] + currentFrame[i + 2]) / 3;
                if (avg < 25) darkPixels++;

                // Check pixel difference (movement)
                const diff = Math.abs(currentFrame[i] - baselineFrameData[i]) + 
                             Math.abs(currentFrame[i+1] - baselineFrameData[i+1]) + 
                             Math.abs(currentFrame[i+2] - baselineFrameData[i+2]);
                
                if (diff > 80) diffCount++; 
            }
            
            const totalPixels = currentFrame.length / 4;
            const darkRatio = darkPixels / totalPixels;
            const diffRatio = diffCount / totalPixels;

            const faceFrame = document.getElementById('face-frame');
            const camText = document.getElementById('cam-status-text');
            const camDot = document.getElementById('cam-status-dot');

            // 1. Camera Covered or Very Dark
            if (darkRatio > 0.85) {
                triggerWarning("Camera covered or too dark! Ensure your face is visible.");
                if(faceFrame) faceFrame.classList.replace('border-transparent', 'border-red-500');
                if(camText) camText.innerText = "Camera Covered!";
                if(camDot) camDot.classList.replace('bg-green-400', 'bg-red-500');
            } 
            // 2. High Movement (Looking away / Leaving seat) -> 35% pixel change
            else if (diffRatio > 0.35) {
                triggerWarning("Suspicious movement detected! Do not look around or leave your seat.");
                if(faceFrame) faceFrame.classList.replace('border-transparent', 'border-red-500');
                if(camText) camText.innerText = "Movement Detected!";
                if(camDot) camDot.classList.replace('bg-green-400', 'bg-red-500');
                
                // Update baseline so it doesn't trigger continuously if they just adjusted posture
                baselineFrameData = currentFrame; 
            } 
            // 3. Normal State
            else {
                if(faceFrame) faceFrame.classList.replace('border-red-500', 'border-transparent');
                if(camText) camText.innerText = "Monitoring Active";
                if(camDot) camDot.classList.replace('bg-red-500', 'bg-green-400');
            }
        } catch(e) {
            // Ignore temporary canvas read errors
        }
    }, 2500);
}

// Tab Switch Prevention
document.addEventListener("visibilitychange", () => {
    if (document.hidden && isInterviewActive) {
        triggerWarning("Tab switch detected. Do not leave the interview screen.");
    }
});

// Warning Logic (Max 5 warnings, 6th terminates)
function triggerWarning(reason) {
    if (!isInterviewActive) return;
    
    warnings++;
    const warnBox = document.getElementById('warning-box');
    const warnCount = document.getElementById('warning-count');
    const warnText = document.getElementById('warning-text');
    
    if(warnCount) warnCount.innerText = warnings;
    if(warnText) warnText.innerText = reason;
    if(warnBox) warnBox.classList.remove('hidden');
    
    setTimeout(() => { if(warnBox) warnBox.classList.add('hidden'); }, 4000);

    // 6 times = Terminate
    if (warnings >= 6) {
        isInterviewActive = false;
        clearInterval(faceTrackingInterval);
        showLevelResult(false, "Interview Terminated. You exceeded the maximum limit of 5 security warnings.");
    }
}

// --- CORE LOGIC ---
function renderLevelMap() {
    const map = document.getElementById('level-map');
    if(!map) return;
    map.innerHTML = '';
    for(let i=1; i<=10; i++) {
        let cls = "level-locked";
        if(i < currentLevel) cls = "level-passed";
        else if (i === currentLevel) cls = "level-active";
        
        map.innerHTML += `<div class="aspect-square flex items-center justify-center rounded-xl font-bold text-sm ${cls}">${i}</div>`;
    }
}

function updateTopUI() {
    if(document.getElementById('top-level-text')) document.getElementById('top-level-text').innerText = `Level ${currentLevel}`;
    if(document.getElementById('top-q-text')) document.getElementById('top-q-text').innerText = `Q: ${currentQuestionNum}/${MAX_QUESTIONS_PER_LEVEL}`;
    if(document.getElementById('score-counter')) document.getElementById('score-counter').innerText = `${currentScore} / 100`;
    if(document.getElementById('progress-bar')) document.getElementById('progress-bar').style.width = `${currentScore}%`;
}

function scrollToBottom() {
    const box = document.getElementById('chat-box');
    if(box) box.scrollTop = box.scrollHeight;
}

// --- AI COMMUNICATION (SKILL-BASED & BULLETPROOF PARSING) ---
async function fetchAI(prompt) {
    const body = {
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
    };

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) throw new Error("API request failed");

        const data = await res.json();
        let content = data.choices[0].message.content;
        
        // Bulletproof JSON extraction
        try {
            const start = content.indexOf('{');
            const end = content.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                content = content.substring(start, end + 1);
            }
            return JSON.parse(content);
        } catch(parseErr) {
            console.error("JSON Parse Error:", parseErr);
            return { score: currentScore, reply: "Please elaborate on that point a bit more." };
        }
        
    } catch (error) {
        console.error("AI Fetch Error:", error);
        return { score: currentScore, reply: "I am experiencing a slight network delay. Please type your answer again." };
    }
}

async function startLevel(level) {
    isInterviewActive = true;
    currentLevel = level;
    currentQuestionNum = 1;
    currentScore = 0;
    warnings = 0; // Reset warnings on new level
    baselineFrameData = null; // Reset camera baseline
    chatHistory = [];
    
    if(document.getElementById('chat-box')) document.getElementById('chat-box').innerHTML = '';
    
    updateTopUI();

    const loaderId = addAILoader();
    
    // --- EDITED BY AI: Injecting Targeted Role and Level Logic ---
    const prompt = `You are a strict Senior Technical Interviewer. I am applying for the specific role of: "${targetRole}". 
    We are at Interview Level ${currentLevel} out of 10.
    My reported skills are: [${userSkills}].

    DIFFICULTY LOGIC:
    - Level 1-3: Basic syntax, fundamental concepts of ${targetRole}, and simple problem-solving based on [${userSkills}].
    - Level 4-6: Intermediate concepts, real-world application, and debugging.
    - Level 7-8: Advanced optimization, architecture, and security.
    - Level 9-10: Expert-level system design, edge cases, and high-level leadership scenarios for ${targetRole}.

    TASK:
    1. Acknowledge the Job Role and the Level difficulty briefly.
    2. Ask exactly ONE technical question that fits this specific level for a ${targetRole}, strictly based on their skills.
    
    Return ONLY a JSON object exactly like this format: {"score": 0, "reply": "Welcome to Level X... Here is your first question..."}`;

    const response = await fetchAI(prompt);
    chatHistory.push({ role: "system", content: `Level ${currentLevel} context initialized for role ${targetRole} with skills: ${userSkills}.` });
    chatHistory.push({ role: "assistant", content: response.reply });
    
    removeAILoader(loaderId);
    appendMessage("ai", response.reply);
    playVoice(response.reply);
}

const sendBtn = document.getElementById('send-btn');
if(sendBtn) sendBtn.addEventListener('click', handleUserMessage);

const userInput = document.getElementById('user-input');
if(userInput) {
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserMessage();
    });
}

async function handleUserMessage() {
    if (!isInterviewActive) return;
    
    const input = document.getElementById('user-input');
    if(!input) return;

    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    appendMessage("user", msg);
    chatHistory.push({ role: "user", content: msg });

    if (currentQuestionNum >= MAX_QUESTIONS_PER_LEVEL) {
        evaluateLevelFinal(msg);
        return;
    }

    currentQuestionNum++;
    updateTopUI();
    
    const loaderId = addAILoader();

    // --- EDITED BY AI: Dynamic Evaluation & Next Question for Targeted Role ---
    const prompt = `You are the technical interviewer for the "${targetRole}" position. 
    Current State: Level ${currentLevel}, Question ${currentQuestionNum}/${MAX_QUESTIONS_PER_LEVEL}.
    Candidate's Skills: [${userSkills}].
    
    The candidate just answered: "${msg}".

    TASK:
    1. Evaluate the answer's accuracy and depth for a ${targetRole} at Level ${currentLevel}.
    2. Adjust the current running score (0-100) based on their performance.
    3. Ask the next technical question suitable for Level ${currentLevel} for a ${targetRole}, aligning with their skills.
    
    Return ONLY JSON exactly like this format: {"score": <integer 0-100>, "reply": "<Your feedback on the previous answer + your next question>"}`;

    const response = await fetchAI(prompt);
    
    currentScore = response.score !== undefined ? response.score : currentScore;
    updateTopUI();
    
    chatHistory.push({ role: "assistant", content: response.reply });
    
    removeAILoader(loaderId);
    appendMessage("ai", response.reply);
    playVoice(response.reply);
}

async function evaluateLevelFinal(lastMsg) {
    isInterviewActive = false;
    const loaderId = addAILoader();

    // --- EDITED BY AI: Final evaluation based on Targeted Role ---
    const prompt = `You are the interviewer for the "${targetRole}" position. The candidate just gave their final answer: "${lastMsg}".
    Evaluate their overall performance for Level ${currentLevel} based on their skills: [${userSkills}]. 
    Return JSON EXACTLY like this: 
    {"score": <final_integer_0_to_100>, "reply": "<Brief final feedback on their performance for this level and role>"}`;

    const response = await fetchAI(prompt);
    currentScore = response.score !== undefined ? response.score : currentScore;
    updateTopUI();
    
    removeAILoader(loaderId);
    
    const passed = currentScore >= 70;
    setTimeout(() => {
        showLevelResult(passed, response.reply);
    }, 1000);
}

// --- UI CHAT HELPERS ---
function appendMessage(sender, text) {
    const box = document.getElementById('chat-box');
    if(!box) return;
    const div = document.createElement('div');
    div.className = sender === 'ai' ? 'ai-msg chat-bubble' : 'user-msg chat-bubble';
    div.innerHTML = sender === 'ai' ? `<strong><i class="fas fa-robot"></i> AI Evaluator:</strong> ${text}` : text;
    box.appendChild(div);
    scrollToBottom();
}

function addAILoader() {
    const box = document.getElementById('chat-box');
    if(!box) return '';
    const id = 'loader-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'ai-msg chat-bubble typing-indicator';
    div.innerHTML = `<strong><i class="fas fa-robot"></i> AI Evaluator:</strong> <span></span><span></span><span></span>`;
    box.appendChild(div);
    scrollToBottom();
    return id;
}

function removeAILoader(id) {
    const loader = document.getElementById(id);
    if(loader) loader.remove();
}

// --- RESULT MODAL ---
function showLevelResult(isPass, feedback) {
    document.getElementById('result-modal').classList.remove('hidden');
    document.getElementById('analyzing-state').classList.add('hidden');
    document.getElementById('done-state').classList.remove('hidden');
    document.getElementById('done-state').classList.add('flex');

    document.getElementById('level-final-score').innerText = `${currentScore}%`;
    document.getElementById('level-result-msg').innerText = feedback;

    if (isPass) {
        document.getElementById('level-result-icon').innerText = "🏆";
        document.getElementById('level-result-title').innerText = `Level ${currentLevel} Passed!`;
        document.getElementById('level-final-score').className = "text-5xl font-black mt-4 text-green-600";
        document.getElementById('next-level-btn').innerText = currentLevel === 10 ? "Finish Journey" : "Start Next Level";
        
        // Save Progress to Firebase
        if(currentLevel === maxLevelUnlocked && currentLevel < 10) {
            maxLevelUnlocked++;
            if(currentUser) {
                setDoc(doc(db, "users", currentUser.uid), { maxInterviewLevel: maxLevelUnlocked }, { merge: true });
            }
        }
    } else {
        document.getElementById('level-result-icon').innerText = "⚠️";
        document.getElementById('level-result-title').innerText = "Level Failed";
        document.getElementById('level-final-score').className = "text-5xl font-black mt-4 text-red-500";
        document.getElementById('next-level-btn').innerText = "Retry Level";
    }
}

window.goToNextLevelOrRetry = function() {
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('done-state').classList.add('hidden');
    document.getElementById('done-state').classList.remove('flex');
    document.getElementById('analyzing-state').classList.remove('hidden');
    
    if(currentScore >= 70 && currentLevel < 10) {
        startLevel(currentLevel + 1);
    } else if (currentScore < 70) {
        startLevel(currentLevel); // Retry
    } else {
        alert("Congratulations! You have completed all 10 Levels.");
        window.location.href = "dashboard.html";
    }
    renderLevelMap();
};

window.endInterviewEarly = function() {
    if(confirm("Are you sure you want to end this session early? Progress for this level will be lost.")) {
        window.location.href = "dashboard.html";
    }
};

// --- VOICE INTEGRATION ---
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

function loadVoices() {
    let voices = synth.getVoices();
    premiumVoice = voices.find(v => v.lang === 'en-US' && v.name.includes('Female')) || voices[0];
}

function playVoice(text) {
    try {
        if(synth.speaking) synth.cancel();
        let cleanText = text.replace(/[*_#`]/g, '');
        const utter = new SpeechSynthesisUtterance(cleanText);
        if(premiumVoice) utter.voice = premiumVoice;
        utter.rate = 1.0;
        synth.speak(utter);
    } catch(e) {
        console.warn("Autoplay policy prevented audio playback without user interaction.");
    }
}

function setupSpeechRecognition() {
    const micBtn = document.getElementById('mic-btn');
    if(!micBtn) return;

    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
            micBtn.classList.add('mic-active');
            document.getElementById('mic-status-text').classList.remove('hidden');
        };
        
        recognition.onresult = (e) => {
            const text = e.results[0][0].transcript;
            document.getElementById('user-input').value = text;
            handleUserMessage(); 
            
            micBtn.classList.remove('mic-active');
            document.getElementById('mic-status-text').classList.add('hidden');
        };

        recognition.onerror = (e) => {
            micBtn.classList.remove('mic-active');
            document.getElementById('mic-status-text').classList.add('hidden');
        }
    }
    
    micBtn.addEventListener('click', () => {
        if(synth.speaking) synth.cancel(); 
        if(recognition) recognition.start();
    });
}

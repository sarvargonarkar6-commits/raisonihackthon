import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const API_KEY = "apload api key "; 
const MODEL_NAME = "llama-3.3-70b-versatile"; 
const TOTAL_QUESTIONS = 10; 
const CODING_QUESTIONS = [3, 7]; 

let state = { qIndex: 0, history: [], isCoding: false, warnings: 0 };
let userSkills = "General"; 
let targetSkill = "General"; // Jis skill ka interview ho raha hai
let currentUser = null; 

const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const codePanel = document.getElementById('code-panel');
const chatPanel = document.getElementById('chat-panel');
const codeEditor = document.getElementById('code-editor');
const micBtn = document.getElementById('mic-btn');

// --- TTS Setup (AI Voice) ---
let synth = window.speechSynthesis;
let premiumVoice = null;

function loadVoices() {
    let voices = synth.getVoices();
    premiumVoice = voices.find(v => v.name.includes('Google UK English Female')) || 
                   voices.find(v => v.name.includes('Zira')) || 
                   voices.find(v => v.name.includes('Samantha')) || 
                   voices.find(v => v.lang === 'en-US' && v.name.includes('Female')) ||
                   voices[0];
}
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

function speakText(text) {
    if(synth.speaking) synth.cancel();
    
    // Clean text for speech (remove asterisks, quotes etc.)
    let cleanText = text.replace(/[*_#`]/g, '');
    
    const utter = new SpeechSynthesisUtterance(cleanText);
    if(premiumVoice) utter.voice = premiumVoice;
    utter.rate = 1.0;
    
    utter.onstart = () => document.getElementById('ai-speaking-status').classList.remove('hidden');
    utter.onend = () => document.getElementById('ai-speaking-status').classList.add('hidden');
    
    synth.speak(utter);
}

// --- STT Setup (User Mic) ---
let recognition;
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
        micBtn.classList.replace('bg-slate-100', 'bg-red-500');
        micBtn.classList.replace('text-slate-600', 'text-white');
        micBtn.classList.add('animate-pulse');
        userInput.placeholder = "Listening... Speak now";
    };
    
    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        userInput.value = text;
        resetMicUI();
        // Auto send after speaking
        sendBtn.click();
    };
    
    recognition.onerror = () => resetMicUI();
    recognition.onend = () => resetMicUI();
}

function resetMicUI() {
    micBtn.classList.replace('bg-red-500', 'bg-slate-100');
    micBtn.classList.replace('text-white', 'text-slate-600');
    micBtn.classList.remove('animate-pulse');
    userInput.placeholder = "Type or speak your answer...";
}

micBtn.onclick = () => {
    if(synth.speaking) synth.cancel(); // Stop AI voice if user starts speaking
    if(recognition) recognition.start();
    else alert("Microphone not supported in this browser. Please use Chrome.");
};

// --- INITIALIZATION (FIREBASE & USER DATA) ---
window.onload = async () => {
    // 1. Authenticate and Load Data
    onAuthStateChanged(auth, async (user) => {
        let profileData = JSON.parse(localStorage.getItem('studentProfile')) || { name: "Student", headline: "Developer", skills: "General" };
        
        // Retrieve specific skill selected in Profile page
        targetSkill = localStorage.getItem('target_interview_skill') || profileData.skills || "General";

        if (user) {
            currentUser = user;
            try {
                // Get exact details from DB
                const userRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(userRef);
                if (docSnap.exists()) {
                    profileData = docSnap.data();
                    localStorage.setItem('studentProfile', JSON.stringify(profileData)); // Backup
                }
            } catch(e) { console.error("Firebase fetch error", e); }
        }
        
        document.getElementById('ui-name').innerText = profileData.name || "Student";
        document.getElementById('ui-role').innerText = profileData.headline || 'Developer';
        // Display the specific skill being tested
        userSkills = targetSkill; 

        // Wait for auth to finish before starting interview
        startInterview(profileData.name);
    });

    // Camera Setup
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        document.getElementById('webcam').srcObject = stream;
    } catch (e) {}
};

async function startInterview(userName) {
    // --- STRICT PROMPT (No previous answers allowed) ---
    state.history = [{
        role: "system",
        content: `You are a STRICT Technical Interviewer.
        CRITICAL RULES:
        1. The candidate is being tested specifically on: ${userSkills}. Ask strictly related to this.
        2. Ask exactly ONE question at a time.
        3. DO NOT reveal the correct answer to the previous question. Simply acknowledge their response briefly (e.g., "Noted", "Moving on") and immediately ask the next question.
        4. Keep your responses short (1-2 sentences). Do not use markdown since this text will be read aloud.`
    }];

    const firstName = userName ? userName.split(' ')[0] : 'there';
    const firstMsg = `Hello ${firstName}! I will assess your skills in ${userSkills}. Let's begin.`;
    addMessage("bot", firstMsg);
    speakText(firstMsg);
    
    // Start with Question 1
    await processNextStep();
}

// --- LOGIC LOOP ---
async function processNextStep() {
    state.qIndex++;
    updateProgress();

    // Loop until Question 10 is asked
    if (state.qIndex > TOTAL_QUESTIONS) {
        await generateFinalAnalysis();
        return;
    }

    let instruction = "";
    if (CODING_QUESTIONS.includes(state.qIndex)) {
        state.isCoding = true;
        instruction = `Question ${state.qIndex} (IMPORTANT): Give a hands-on CODING PROBLEM based strictly on: ${userSkills}. Ask them to write the code. Do NOT give answers to previous questions.`;
    } else {
        state.isCoding = false;
        instruction = `Question ${state.qIndex}: Ask a scenario-based question based on: ${userSkills}. Do NOT give the answer to the previous question.`;
    }

    const loadingId = addMessage("bot", "Thinking...");
    const aiMsg = await callGroq([...state.history, { role: "system", content: instruction }]);
    
    document.getElementById(loadingId).remove();
    
    // Clean markdown for UI display
    const cleanMsg = aiMsg.replace(/[*_`#]/g, '');
    addMessage("bot", cleanMsg);
    speakText(cleanMsg); // Voice output
    
    state.history.push({ role: "assistant", content: cleanMsg });

    if (state.isCoding) {
        setTimeout(() => {
            toggleCodePanel(true);
            addMessage("system", "⚠️ Code Editor Opened. Please write your solution on the right.");
        }, 1000);
    } else {
        toggleCodePanel(false);
    }
}

// --- API CALL ---
async function callGroq(messages) {
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: MODEL_NAME, messages: messages, temperature: 0.2 })
        });
        const data = await res.json();
        return data.choices[0].message.content;
    } catch (e) { return "Network Error. Please retry."; }
}

// --- UI ACTIONS ---
sendBtn.addEventListener('click', async () => {
    const text = userInput.value.trim();
    if (!text) return;
    if(synth.speaking) synth.cancel(); // Stop speaking if user interrupts
    
    addMessage("user", text);
    userInput.value = "";
    state.history.push({ role: "user", content: text });
    await processNextStep();
});

window.submitCode = async function() {
    const code = codeEditor.value.trim();
    if (!code) { alert("Write code first!"); return; }
    if(synth.speaking) synth.cancel();

    toggleCodePanel(false);
    addMessage("user", `[Code Submitted]:\n${code}`);
    state.history.push({ role: "user", content: `My Code Solution:\n${code}` });
    await processNextStep();
}

function addMessage(type, text) {
    const id = "msg-" + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = `flex w-full mb-4 ${type === 'user' ? 'justify-end' : 'justify-start'}`;
    
    const bubble = document.createElement('div');
    if (type === 'user') bubble.className = "msg-bubble msg-user";
    else if (type === 'bot') bubble.className = "msg-bubble msg-ai";
    else bubble.className = "text-center text-xs text-slate-400 w-full italic my-2";

    bubble.innerHTML = text.replace(/\n/g, '<br>');
    div.appendChild(bubble);
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return id;
}

function toggleCodePanel(show) {
    if (show) {
        codePanel.style.display = 'flex';
        chatPanel.classList.add('chat-shrunk');
    } else {
        codePanel.style.display = 'none';
        chatPanel.classList.remove('chat-shrunk');
    }
}

function updateProgress() {
    // Logic to prevent progress bar exceeding 100%
    const currentQ = Math.min(state.qIndex, TOTAL_QUESTIONS); 
    const pct = (currentQ / TOTAL_QUESTIONS) * 100;
    document.getElementById('progress-bar').style.width = `${pct}%`;
    document.getElementById('q-counter').innerText = `Q: ${currentQ}/${TOTAL_QUESTIONS}`;
}

userInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendBtn.click(); });

// ==========================================
// FINAL ANALYSIS & DATABASE SAVE (REPORT LOGIC)
// ==========================================
async function generateFinalAnalysis() {
    document.getElementById('result-modal').classList.remove('hidden');
    
    // 1. AI se Report generate karwao
    const analysisPrompt = {
        role: "system",
        content: `The technical interview for skill '${targetSkill}' is over.
        Analyze the conversation history.
        Count how many answers were correct/valid out of ${TOTAL_QUESTIONS}.
        
        Return ONLY valid JSON in this exact format (no markdown):
        { 
            "correct_count": number, 
            "total_questions": ${TOTAL_QUESTIONS}
        }`
    };
    
    let correctCount = 0;
    let percentage = 0;
    
    try {
        const resultRaw = await callGroq([...state.history, analysisPrompt]);
        // Extract JSON string carefully
        const jsonMatch = resultRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const resultData = JSON.parse(jsonMatch[0]);
            correctCount = resultData.correct_count || 0;
            percentage = Math.round((correctCount / TOTAL_QUESTIONS) * 100);
        }
    } catch (e) {
        console.error("AI parsing error, using fallback score.", e);
        // Fallback score if AI fails
        percentage = 70;
        correctCount = 7;
    }

    // 2. Save Data (Specifically for the target Skill)
    // LocalStorage Update
    let localScores = JSON.parse(localStorage.getItem('skillScores')) || {};
    localScores[targetSkill] = percentage;
    localStorage.setItem('skillScores', JSON.stringify(localScores));
    
    // Firebase Update
    if (currentUser) {
        try {
            const userRef = doc(db, "users", currentUser.uid);
            // Pehle current data fetch karo taaki existing scores na ud jaye
            const docSnap = await getDoc(userRef);
            let dbScores = {};
            
            if (docSnap.exists() && docSnap.data().skillScores) {
                dbScores = docSnap.data().skillScores;
            }
            
            // Score update karo
            dbScores[targetSkill] = percentage;

            // Wapas save karo
            await setDoc(userRef, { 
                skillScores: dbScores 
            }, { merge: true });
            
            console.log("Skill score saved to Firebase successfully!");
        } catch (error) {
            console.error("Failed to save score to Firebase:", error);
        }
    }

    // 3. Update UI Modal (Report Card)
    document.getElementById('analyzing-state').classList.add('hidden');
    const doneState = document.getElementById('done-state');
    doneState.classList.remove('hidden');

    // Modal Content Update (Javascript se content inject kar rahe hai taaki UI file change na karni pade)
    doneState.innerHTML = `
        <div class="text-6xl mb-4">📊</div>
        <h2 class="text-2xl font-bold text-slate-800 mb-2">Result: ${targetSkill}</h2>
        
        <div class="flex justify-center gap-4 mb-6 mt-4">
            <div class="bg-green-50 p-3 rounded-lg border border-green-200 w-24">
                <p class="text-[10px] font-bold text-green-600 uppercase">Correct</p>
                <p class="text-2xl font-extrabold text-green-700">${correctCount}</p>
            </div>
            <div class="bg-red-50 p-3 rounded-lg border border-red-200 w-24">
                <p class="text-[10px] font-bold text-red-600 uppercase">Wrong</p>
                <p class="text-2xl font-extrabold text-red-700">${TOTAL_QUESTIONS - correctCount}</p>
            </div>
        </div>

        <p class="text-slate-500 mb-6 text-sm">Your score has been updated in your profile.</p>
        
        <button onclick="window.location.href='profile.html'" class="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg transform hover:scale-105 flex items-center justify-center gap-2">
            <i class="fas fa-save"></i> Save & Return to Profile
        </button>
    `;
}

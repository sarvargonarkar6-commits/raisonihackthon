import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const API_KEY = "apload you api key"; 

let currentUser = null;
let userProfile = {};

// Roadmap Array Logic (Max 2)
let roadmapsList = []; 
let activeRoadmapIdx = 0; 

let globalStages = [];
let stageProgress = []; 
let currentStageIndex = 0; 
let maxUnlockedIndex = 0;
let isFinalGoal = false;

let projectVerified = false;
let examQuestions = [];
let currentQIndex = 0;
let userScore = 0;
let examActive = false;
let currentExamType = ""; 
let warnings = 0; 
let submittedCodeData = ""; 

// --- ANTI-CHEAT ---
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden' && examActive) {
        warnings++;
        const warningDiv = document.getElementById('anti-cheat-warning');
        warningDiv.classList.remove('hidden');
        setTimeout(() => warningDiv.classList.add('hidden'), 3000);

        if (warnings >= 3) {
            alert("Exam Terminated due to suspicious activity.");
            document.exitFullscreen().catch(()=>{});
            document.getElementById('exam-interface').style.display = 'none';
            examActive = false;
            showResult(false, "Failed: Multiple tab switches detected. Please be honest.");
        }
    }
});

// --- FIREBASE AUTH & PROFILE SYNC (NO LOCALSTORAGE) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);
            
            if (docSnap.exists()) {
                userProfile = docSnap.data();
                if(userProfile.roadmapsList) {
                    roadmapsList = userProfile.roadmapsList;
                }
            } else {
                // If new user, create an empty profile object tied to Firebase Auth
                userProfile = { name: user.displayName || "Student", roadmapsList: [] };
            }
            
            // STRICTLY FIREBASE PHOTO LOGIC
            const savedProfilePic = userProfile.photoURL;
            const imgContainer = document.getElementById('nav-profile-img-container');
            if (imgContainer) {
                if (savedProfilePic && savedProfilePic.trim() !== "") {
                    imgContainer.innerHTML = `<img src="${savedProfilePic}" class="w-full h-full object-cover">`;
                } else {
                    imgContainer.innerHTML = `<i class="fas fa-user text-slate-400"></i>`;
                }
            }

            loadRoadmapToUI(0); // Load first tab by default
        } catch (error) { console.error("Firebase Error:", error); }
    } else { 
        window.location.href = "index.html"; 
    }
});

async function saveProgressToFirebase() {
    if (!currentUser) return;
    
    // Save current active roadmap data into array
    if(roadmapsList[activeRoadmapIdx]) {
        roadmapsList[activeRoadmapIdx].targetRole = document.getElementById('input-target-role').value;
        roadmapsList[activeRoadmapIdx].stages = globalStages;
        roadmapsList[activeRoadmapIdx].stageProgress = stageProgress;
        roadmapsList[activeRoadmapIdx].maxUnlockedIndex = maxUnlockedIndex;
    }

    try {
        await setDoc(doc(db, "users", currentUser.uid), { roadmapsList: roadmapsList }, { merge: true });
        updateTopBadges();
    } catch (e) { console.error("Error saving roadmaps:", e); }
}

function updateTopBadges() {
    let activeCount = roadmapsList.filter(r => r.status !== 'completed').length;
    document.getElementById('roadmap-count-badge').innerText = `${activeCount}/2 Active`;
}

// --- TABS LOGIC ---
window.switchRoadmap = function(idx) {
    activeRoadmapIdx = idx;
    
    document.getElementById('tab-0').className = idx === 0 ? "flex-1 py-1.5 rounded-md text-sm font-bold bg-white shadow text-brand-600 transition" : "flex-1 py-1.5 rounded-md text-sm font-bold text-slate-500 hover:text-slate-700 transition";
    document.getElementById('tab-1').className = idx === 1 ? "flex-1 py-1.5 rounded-md text-sm font-bold bg-white shadow text-brand-600 transition" : "flex-1 py-1.5 rounded-md text-sm font-bold text-slate-500 hover:text-slate-700 transition";

    loadRoadmapToUI(idx);
}

function loadRoadmapToUI(idx) {
    const rm = roadmapsList[idx];
    const inputSec = document.getElementById('roadmap-input-section');
    const lockMsg = document.getElementById('roadmap-locked-msg');
    
    if (rm) {
        globalStages = rm.stages || [];
        
        if(rm.stageProgress && rm.stageProgress.length === globalStages.length) {
            stageProgress = rm.stageProgress;
        } else {
            stageProgress = Array.from({length: globalStages.length}, () => ({theoryPassed: false, projectPassed: false}));
        }
        
        maxUnlockedIndex = rm.maxUnlockedIndex || 0;
        document.getElementById('input-target-role').value = rm.targetRole || "";
        
        if(rm.status !== 'completed') {
            inputSec.classList.add('hidden');
            lockMsg.classList.remove('hidden');
            lockMsg.innerHTML = `<i class="fas fa-lock"></i> Roadmap Locked. Complete it to unlock new one.`;
        } else {
            inputSec.classList.add('hidden');
            lockMsg.classList.remove('hidden');
            lockMsg.className = "text-xs text-green-600 font-bold bg-green-50 p-2 rounded border border-green-200 mt-2 text-center";
            lockMsg.innerHTML = `<i class="fas fa-check-circle"></i> This Roadmap is Completed!`;
        }
        
        renderStages();
    } else {
        globalStages = [];
        stageProgress = [];
        maxUnlockedIndex = 0;
        document.getElementById('input-target-role').value = "";
        
        inputSec.classList.remove('hidden');
        lockMsg.classList.add('hidden');
        
        document.getElementById('stages-timeline').innerHTML = `<div class="road-bg"></div><div class="road-dashed"></div><div class="text-center text-sm text-slate-400 mt-10 relative z-10 bg-white inline-block px-4 ml-[50%] transform -translate-x-1/2 rounded-full border border-slate-200">Start a new Journey!</div>`;
    }
    updateTopBadges();
}

// --- GENERATE ROADMAP ---
window.generateNewRoadmap = async function() {
    const targetRole = document.getElementById('input-target-role').value.trim();
    if(!targetRole) { alert("Please enter a Target Job Role!"); return; }

    const btn = document.getElementById('generate-btn');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating...`;
    
    const userSkills = userProfile.skills || "Absolute Beginner";

    const prompt = `
    Create a 4-stage practical learning roadmap to become a "${targetRole}". 
    User current skills: "${userSkills}".
    Start from basics. Return ONLY valid JSON array with 4 stages.
    [{"title": "Week 1", "desc": "Basics", "project": "Build X", "subjects": [{"name": "HTML", "yt_query": "HTML tutorial", "doc_query": "HTML docs"}]}]
    `;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: prompt }], temperature: 0.5 })
        });

        const data = await response.json();
        const jsonResponse = data.choices[0].message.content;
        const startIdx = jsonResponse.indexOf('[');
        const endIdx = jsonResponse.lastIndexOf(']') + 1;
        
        globalStages = JSON.parse(jsonResponse.substring(startIdx, endIdx));
        
        stageProgress = Array.from({length: globalStages.length}, () => ({theoryPassed: false, projectPassed: false}));
        maxUnlockedIndex = 0; 
        
        roadmapsList[activeRoadmapIdx] = {
            targetRole: targetRole,
            stages: globalStages,
            stageProgress: stageProgress,
            maxUnlockedIndex: maxUnlockedIndex,
            status: 'active'
        };

        loadRoadmapToUI(activeRoadmapIdx);
        await saveProgressToFirebase();

    } catch (e) {
        console.error("Groq Error:", e);
        alert("Failed to generate roadmap.");
    } finally {
        btn.innerHTML = `<i class="fas fa-magic"></i> Generate Road`;
    }
}

// --- WINDING ROAD TIMELINE RENDERER ---
function renderStages() {
    const container = document.getElementById('stages-timeline');
    let html = `<div class="road-bg"></div><div class="road-dashed"></div>`;

    globalStages.forEach((stage, index) => {
        const isLocked = index > maxUnlockedIndex;
        const isCompleted = index < maxUnlockedIndex;
        
        let pinClass = isLocked ? 'pin-locked' : (isCompleted ? 'pin-completed' : 'pin-active');
        
        html += `
        <div class="timeline-item">
            <div class="timeline-content">
                <h4 class="font-bold text-slate-800">${stage.title}</h4>
                <p class="text-xs text-slate-500 mt-1">${stage.desc}</p>
                ${!isLocked ? `<button onclick="openStageModal(${index}, false)" class="mt-3 text-xs bg-brand-100 text-brand-700 px-3 py-1.5 rounded font-bold hover:bg-brand-600 hover:text-white transition">View Tasks</button>` : ''}
            </div>
            <div class="pin ${pinClass}"><span>${index + 1}</span></div>
            <div style="width: 40%;"></div> 
        </div>
        `;
    });

    // FINAL GOAL NODE
    let finalLocked = maxUnlockedIndex < globalStages.length;
    let finalPinClass = finalLocked ? 'pin-locked' : 'pin-final';
    
    html += `
    <div class="timeline-item mt-10">
        <div class="timeline-content border-red-200">
            <h4 class="font-black text-red-600 uppercase">Final Evaluation</h4>
            <p class="text-xs text-slate-500 mt-1">Prove your skills to complete the roadmap.</p>
            ${!finalLocked ? `<button onclick="openStageModal(0, true)" class="mt-3 text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded font-bold hover:bg-red-600 hover:text-white transition">Take Final Exam</button>` : ''}
        </div>
        <div class="pin ${finalPinClass}"><span><i class="fas fa-flag-checkered"></i></span></div>
        <div style="width: 40%;"></div>
    </div>
    `;

    container.innerHTML = html;
}

// --- MODAL LOGIC ---
window.openStageModal = function(index, isFinal) {
    isFinalGoal = isFinal;
    currentStageIndex = index;
    
    const rm = roadmapsList[activeRoadmapIdx] || {};
    const progress = isFinal ? (rm.finalProgress || {theoryPassed: false, projectPassed: false}) : (stageProgress[index] || {theoryPassed: false, projectPassed: false});

    if(isFinal) {
        document.getElementById('modal-title').innerText = "Final Goal Evaluation";
        document.getElementById('modal-subtitle').innerText = "Complete this to finish the roadmap!";
        document.getElementById('theory-section').classList.remove('hidden');
        document.getElementById('modules-container').innerHTML = '<p class="text-sm text-slate-500 italic">No resources here. This is purely a test of everything you learned.</p>';
        document.getElementById('modal-project-task').innerText = "Build a complete mini-product combining all stages.";
    } else {
        const stage = globalStages[index];
        document.getElementById('modal-title').innerText = stage.title;
        document.getElementById('modal-subtitle').innerText = "Dual AI Verification System";
        document.getElementById('modal-project-task').innerText = stage.project;
        
        const modulesContainer = document.getElementById('modules-container');
        modulesContainer.innerHTML = ''; 
        if (stage.subjects) {
            stage.subjects.forEach(sub => {
                modulesContainer.innerHTML += `<div class="bg-slate-50 border border-slate-200 p-3 rounded-lg flex justify-between items-center mb-2"><h4 class="font-bold text-slate-700 text-sm"><i class="fas fa-graduation-cap text-brand-500 mr-2"></i> ${sub.name}</h4><div class="flex gap-2"><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(sub.yt_query)}" target="_blank" class="text-red-600 text-xs font-bold border border-red-200 bg-red-50 px-2 py-1 rounded hover:bg-red-600 hover:text-white transition">Watch</a></div></div>`;
            });
        }
    }

    // Theory Btn State
    const theoryBtn = document.getElementById('theory-exam-btn');
    if(progress.theoryPassed) {
        theoryBtn.innerHTML = '<i class="fas fa-check"></i> Theory Passed';
        theoryBtn.className = "bg-green-100 text-green-700 px-5 py-2 rounded-lg font-bold shadow-sm text-sm cursor-not-allowed";
        theoryBtn.disabled = true;
        document.getElementById('project-section').classList.remove('opacity-50', 'pointer-events-none');
        document.getElementById('project-lock-icon').classList.add('hidden');
    } else {
        theoryBtn.innerHTML = 'Take Theory Exam';
        theoryBtn.className = "bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold transition shadow-sm text-sm";
        theoryBtn.disabled = false;
        document.getElementById('project-section').classList.add('opacity-50', 'pointer-events-none');
        document.getElementById('project-lock-icon').classList.remove('hidden');
    }

    // Project Btn State
    const projBtn = document.getElementById('project-exam-btn');
    if(progress.projectPassed) {
        projBtn.innerHTML = '<i class="fas fa-check"></i> Project Verified';
        projBtn.className = "bg-green-100 text-green-700 px-5 py-2 rounded-lg font-bold shadow-sm text-sm cursor-not-allowed";
        projBtn.disabled = true;
    } else {
        projBtn.innerHTML = 'Take Project Interview';
        projBtn.className = "bg-slate-300 text-slate-500 px-5 py-2 rounded-lg font-bold transition shadow-sm text-sm cursor-not-allowed";
        projBtn.disabled = true;
    }

    projectVerified = false;
    document.getElementById('upload-content').classList.remove('hidden');
    document.getElementById('upload-success').classList.add('hidden');
    document.getElementById('code-paste-section').classList.add('hidden');
    document.getElementById('project-file').value = "";
    document.getElementById('project-code-input').value = "";
    document.getElementById('learning-modal').style.display = 'block';
}

window.handleFileUpload = function() {
    if(document.getElementById('project-file').files.length > 0) {
        document.getElementById('upload-content').classList.add('hidden');
        document.getElementById('upload-success').classList.remove('hidden');
        document.getElementById('upload-success').style.display = 'flex';
        document.getElementById('code-paste-section').classList.remove('hidden');
    }
}

window.verifyProjectCode = function() {
    submittedCodeData = document.getElementById('project-code-input').value.trim();
    if(submittedCodeData.length < 20) { alert("Please paste logic for analysis."); return; }
    alert("Logic mapped. Unlock Project Interview.");
    projectVerified = true;
    const projBtn = document.getElementById('project-exam-btn');
    projBtn.disabled = false;
    projBtn.className = "bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-lg font-bold transition shadow-sm text-sm";
}

// --- DYNAMIC EXAM GENERATOR ---
window.startExamSetup = async function(examType) {
    currentExamType = examType; 
    const btn = document.getElementById(examType === 'theory' ? 'theory-exam-btn' : 'project-exam-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
    btn.disabled = true;

    // 1. CAMERA CHECK
    let stream = null;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch(err) {
        console.error("Camera Error:", err);
        alert("❌ Exam failed!\nCamera access is required for proctoring. Please allow the camera.\n(Note: Ensure you are running this via Live Server / localhost)");
        btn.innerHTML = examType === 'theory' ? 'Take Theory Exam' : 'Take Project Interview';
        btn.disabled = false;
        return; 
    }

    let prompt = "";
    if (examType === 'theory') {
        const topics = isFinalGoal ? roadmapsList[activeRoadmapIdx].targetRole + " fundamentals" : globalStages[currentStageIndex].subjects.map(s=>s.name).join(", ");
        prompt = `Generate EXACTLY 15 Multiple Choice Questions testing theory of: "${topics}". \nCRITICAL: Output ONLY a valid JSON array. No extra text, no markdown block.\nJSON Format: [{"type":"mcq", "q":"?", "opts":["A","B","C","D"], "a":0}]`;
    } else {
        prompt = `User submitted project code: "${submittedCodeData.substring(0, 500)}".\nGenerate EXACTLY 15 questions to verify authenticity. 12 MCQs analyzing logic, 3 "code" type asking to rewrite small logic.\nCRITICAL: Output ONLY a valid JSON array. No extra text, no markdown block.\nJSON Format: [{"type":"mcq", "q":"?", "opts":["A","B","C","D"], "a":0}, {"type":"code", "q":"?"}]`;
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: prompt }], temperature: 0.1 })
        });
        
        if(!response.ok) throw new Error("API Limit or Network Issue.");

        const jsonResponse = (await response.json()).choices[0].message.content;
        
        const startIdx = jsonResponse.indexOf('[');
        const endIdx = jsonResponse.lastIndexOf(']') + 1;
        
        if (startIdx === -1 || endIdx === 0) throw new Error("AI did not return valid JSON format.");
        
        const validJsonString = jsonResponse.substring(startIdx, endIdx);
        examQuestions = JSON.parse(validJsonString);

        if (examQuestions.length < 5) throw new Error("Not enough questions generated by AI.");

        document.getElementById('exam-type-badge').innerText = examType === 'theory' ? "Theory Exam" : "Project Interview";
        document.getElementById('webcam').srcObject = stream;
        document.getElementById('learning-modal').style.display = 'none';
        document.getElementById('exam-interface').style.display = 'flex';
        document.documentElement.requestFullscreen().catch(()=>{});
        
        examActive = true; warnings = 0; currentQIndex = 0; userScore = 0;
        showQuestion();
    } catch(e) { 
        console.error("Setup Error:", e);
        alert(`Setup failed: ${e.message}\nPlease try again.`); 
        btn.innerHTML = examType === 'theory' ? 'Take Theory Exam' : 'Take Project Interview';
        btn.disabled = false;
        if(stream) { stream.getTracks().forEach(t => t.stop()); }
    }
}

function showQuestion() {
    const q = examQuestions[currentQIndex];
    document.getElementById('q-number').innerText = `${currentQIndex + 1}/${examQuestions.length}`;
    document.getElementById('exam-question').innerText = q.q;
    const optsCont = document.getElementById('exam-options-container');
    const compCont = document.getElementById('compiler-container');

    if (q.type === "mcq") {
        compCont.classList.add('hidden'); optsCont.classList.remove('hidden');
        optsCont.innerHTML = q.opts.map((o, i) => `<button onclick="checkAnswer(${i})" class="w-full text-left p-4 bg-slate-700 hover:bg-brand-600 rounded-lg text-white mb-2">${o}</button>`).join('');
    } else {
        optsCont.classList.add('hidden'); compCont.classList.remove('hidden');
        document.getElementById('code-compiler').value = "";
    }
}

window.checkAnswer = function(idx) { if(idx === examQuestions[currentQIndex].a) userScore++; nextQuestion(); }
window.submitCodeAnswer = function() { if(document.getElementById('code-compiler').value.trim().length > 5) userScore++; nextQuestion(); }
function nextQuestion() { currentQIndex++; if(currentQIndex < examQuestions.length) showQuestion(); else finishExam(); }

async function finishExam() {
    document.exitFullscreen().catch(()=>{});
    document.getElementById('exam-interface').style.display = 'none';
    const video = document.getElementById('webcam');
    if(video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); }
    examActive = false;
    
    const passingScore = Math.ceil(examQuestions.length * 0.25); // 25%

    if(userScore >= passingScore) {
        if(isFinalGoal) {
            let fp = roadmapsList[activeRoadmapIdx].finalProgress || {theoryPassed: false, projectPassed: false};
            if(currentExamType === 'theory') fp.theoryPassed = true;
            if(currentExamType === 'project') { fp.projectPassed = true; roadmapsList[activeRoadmapIdx].status = 'completed'; }
            roadmapsList[activeRoadmapIdx].finalProgress = fp;
        } else {
            let cp = stageProgress[currentStageIndex]; 
            if(currentExamType === 'theory') cp.theoryPassed = true;
            if(currentExamType === 'project') cp.projectPassed = true;
            stageProgress[currentStageIndex] = cp;
            
            if(cp.theoryPassed && cp.projectPassed && currentStageIndex === maxUnlockedIndex) maxUnlockedIndex++;
        }
        
        showResult(true, `Scored ${userScore}/${examQuestions.length}. Excellent work!`);
        renderStages(); await saveProgressToFirebase(); loadRoadmapToUI(activeRoadmapIdx);
    } else {
        showResult(false, `Scored ${userScore}/${examQuestions.length}. Need at least ${passingScore} to pass.`);
    }
}

window.showResult = function(p, msg) {
    document.getElementById('result-modal').style.display = 'block';
    document.getElementById('result-icon').innerText = p ? "🏆" : "⚠️";
    document.getElementById('result-title').innerText = p ? "Cleared!" : "Failed";
    document.getElementById('result-title').className = p ? "text-xl font-bold mb-2 text-green-600" : "text-xl font-bold mb-2 text-red-600";
    document.getElementById('result-msg').innerHTML = msg;
}
window.closeModal = id => { document.getElementById(id).style.display = 'none'; loadRoadmapToUI(activeRoadmapIdx); };
window.closeResult = () => document.getElementById('result-modal').style.display = 'none';

// --- CHATBOT MENTOR ---
window.handleChatEnter = function(e) { if(e.key === 'Enter') sendChatMessage(); }

window.sendChatMessage = async function() {
    const input = document.getElementById('chat-input');
    const val = input.value.trim();
    if(!val) return;
    
    const chatCont = document.getElementById('chat-container');
    chatCont.innerHTML += `<div class="chat-bubble-user text-sm text-slate-800">${val}</div>`;
    input.value = "";
    chatCont.scrollTop = chatCont.scrollHeight;
    
    const aiLoader = document.createElement('div');
    aiLoader.className = "chat-bubble-ai text-sm text-slate-500 italic";
    aiLoader.innerText = "Typing...";
    chatCont.appendChild(aiLoader);

    const rm = roadmapsList[activeRoadmapIdx];
    const role = rm ? rm.targetRole : "General tech";
    
    // UPDATED PROMPT: AI will answer in user's language and restrict to roadmaps/careers
    const prompt = `Act as a professional tech mentor. Strictly answer ONLY questions related to career roadmaps, technical skills, learning paths, and jobs. If the question is off-topic, politely decline. CRITICAL: You MUST reply in the exact same language the user used in their question (e.g., if they ask in Hindi, reply in Hindi; if English, reply in English). Keep it short and practical. User goal: ${role}. Question: ${val}`;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: prompt }] })
        });
        const data = await response.json();
        chatCont.removeChild(aiLoader);
        chatCont.innerHTML += `<div class="chat-bubble-ai text-sm text-slate-700">${data.choices[0].message.content}</div>`;
        chatCont.scrollTop = chatCont.scrollHeight;
    } catch(e) { chatCont.removeChild(aiLoader); chatCont.innerHTML += `<div class="chat-bubble-ai text-sm text-red-500">Sorry, connection issue.</div>`; }
}

window.startDictation = function() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.start();
        document.getElementById('chat-input').placeholder = "Listening...";
        recognition.onresult = (event) => {
            document.getElementById('chat-input').value = event.results[0][0].transcript;
            document.getElementById('chat-input').placeholder = "Ask your doubt here...";
        };
        recognition.onerror = () => document.getElementById('chat-input').placeholder = "Ask your doubt here...";
    } else { alert("Speech Recognition not supported in this browser."); }
}

// --- YOUTUBE & NOTES ---
window.loadYTVideo = function() {
    const url = document.getElementById('yt-link-input').value;
    const videoId = url.split('v=')[1]?.split('&')[0] || url.split('youtu.be/')[1];
    if(videoId) {
        document.getElementById('yt-placeholder').style.display = 'none';
        document.getElementById('yt-iframe').src = `https://www.youtube.com/embed/${videoId}`;
    } else { alert("Invalid YouTube URL"); }
}

window.downloadNotesPDF = function() {
    const notes = document.getElementById('notes-area').value;
    if(!notes.trim()) { alert("Notes empty hain bhai!"); return; }
    
    const formattedNotes = notes.replace(/\n/g, '<br>');
    
    const content = document.createElement('div');
    content.innerHTML = `
        <div style="padding: 30px; font-family: Arial, sans-serif; background-color: #ffffff; color: #000000; width: 100%;">
            <h2 style="color: #16a34a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px;">BridgeAI Short Notes</h2>
            <div style="font-size: 16px; line-height: 1.6;">${formattedNotes}</div>
        </div>
    `;
    
    const opt = {
        margin:       0.5,
        filename:     'BridgeAI_Notes.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(content).save();
}

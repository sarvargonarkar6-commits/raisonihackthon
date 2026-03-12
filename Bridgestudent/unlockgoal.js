// --- PROFILE SETUP ON LOAD ---
window.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem("studentProfile")) || { name: "Student" };
    document.getElementById('dropdown-name').innerText = user.name;

    // Load Nav Profile Image dynamically
    const savedProfilePic = localStorage.getItem('tempProfileImage');
    if (savedProfilePic) {
        const imgContainer = document.getElementById('nav-profile-img-container');
        if(imgContainer) imgContainer.innerHTML = `<img src="${savedProfilePic}" alt="Profile" class="w-full h-full object-cover">`;
    }
});

window.logoutUser = function() {
    if(confirm("Are you sure you want to log out?")) {
        window.location.href = "index.html";
    }
}

// --- GLOBAL VARIABLES & CONFIG ---
const API_KEY = "apload api key ";
const MODEL = "llama-3.3-70b-versatile";

let company = "", role = "";
let aptData = [], currentAptQ = 0, aptAnswers = [];
let editor;
let interviewData = { aptScore: 0, techCode: "", sitAnswer: "", hrLog: [] };

let hrQCount = 0;
let recognition;
let synth = window.speechSynthesis;
let premiumVoice = null;

// Initialize Monaco Editor path
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.33.0/min/vs' }});

// --- LOAD HIGH QUALITY VOICES ---
function loadVoices() {
    let voices = synth.getVoices();
    // Look for high-quality female voices built into the OS/Browser
    premiumVoice = voices.find(v => v.name.includes('Google UK English Female')) || 
                   voices.find(v => v.name.includes('Zira')) || 
                   voices.find(v => v.name.includes('Samantha')) || 
                   voices.find(v => v.lang === 'en-US' && v.name.includes('Female')) ||
                   voices[0];
}
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

// --- GLOBAL API CALLER ---
async function fetchAI(prompt, jsonFormat = true) {
    const body = {
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
    };
    if(jsonFormat) body.response_format = { type: "json_object" };

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) throw new Error("API Limit or Network Issue");
        
        const data = await res.json();
        let content = data.choices[0].message.content;

        if (jsonFormat) {
            const start = content.indexOf('{');
            const end = content.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                content = content.substring(start, end + 1);
            }
            return JSON.parse(content);
        }
        
        return content;
    } catch (error) {
        console.error("AI Error:", error);
        throw error;
    }
}

// --- PHASE 1: SETUP & START ---
window.startFullInterview = function() {
    company = document.getElementById('target-company').value.trim() || "Google";
    role = document.getElementById('target-role').value.trim() || "Software Engineer";
    
    // Show Loading Pattern
    document.getElementById('start-btn').classList.add('hidden');
    const loadingPattern = document.getElementById('loading-pattern');
    loadingPattern.classList.remove('hidden');
    loadingPattern.classList.add('flex');

    setTimeout(() => {
        document.getElementById('comp-disp').innerText = `${company} - ${role}`;
        document.getElementById('setup-phase').classList.add('hidden');
        document.getElementById('interview-phase').classList.remove('hidden');
        
        startAptitudeRound();
    }, 1200); 
}

// --- ROUND 1: APTITUDE ---
async function startAptitudeRound() {
    showPanel('panel-aptitude');
    updateSidebar(1);
    
    let timeLeft = 600; 
    const tInt = setInterval(() => {
        timeLeft--;
        let m = Math.floor(timeLeft/60), s = timeLeft%60;
        document.getElementById('apt-timer').innerText = `${m}:${s<10?'0':''}${s}`;
        if(timeLeft <= 0) { clearInterval(tInt); window.finishAptitude(); }
    }, 1000);

    const prompt = `Generate exactly 10 multiple choice questions for a ${role} at ${company} focusing on Aptitude, Logic, and Basic CS.
    Return ONLY JSON format: {"questions": [{"q":"Question text?", "options":["A", "B", "C", "D"], "answer": 0}]}`;
    
    try {
        const res = await fetchAI(prompt);
        aptData = res.questions.slice(0, 10);
        aptAnswers = new Array(aptData.length).fill(null);
        renderAptitudePalette();
        window.loadAptQuestion(0);
    } catch (e) {
        alert("Failed to load Aptitude test. Please check API key or internet.");
    }
}

function renderAptitudePalette() {
    const pal = document.getElementById('apt-palette');
    pal.innerHTML = "";
    aptData.forEach((_, i) => {
        let cls = "q-box";
        if(i === currentAptQ) cls += " active";
        else if(aptAnswers[i] !== null) cls += " answered";
        pal.innerHTML += `<div class="${cls}" onclick="loadAptQuestion(${i})">${i+1}</div>`;
    });
}

window.loadAptQuestion = function(i) {
    if(!aptData || aptData.length === 0) return;
    currentAptQ = i;
    renderAptitudePalette();
    const q = aptData[i];
    
    let html = `
        <h3 class="text-base sm:text-lg font-bold text-slate-800 mb-6">Q${i+1}. ${q.q}</h3>
        <div class="space-y-3">
    `;
    q.options.forEach((opt, idx) => {
        const checked = aptAnswers[i] === idx ? 'checked' : '';
        const bg = aptAnswers[i] === idx ? 'bg-primary-50 border-primary-500' : 'bg-white border-slate-200';
        html += `
            <label class="flex items-center gap-3 p-3 sm:p-4 border rounded-xl cursor-pointer hover:bg-slate-50 transition ${bg}">
                <input type="radio" name="qopt" value="${idx}" class="w-4 h-4 text-primary-600" ${checked} onchange="selectAptOption(${i}, ${idx})">
                <span class="text-xs sm:text-sm font-medium text-slate-700">${opt}</span>
            </label>
        `;
    });
    html += `</div>
        <div class="mt-8 flex justify-between">
            <button onclick="loadAptQuestion(${Math.max(0, i-1)})" class="px-5 sm:px-6 py-2 bg-slate-200 rounded font-bold text-slate-600 text-xs sm:text-sm ${i===0?'opacity-50 pointer-events-none':''}">Previous</button>
            <button onclick="loadAptQuestion(${Math.min(aptData.length-1, i+1)})" class="px-5 sm:px-6 py-2 bg-primary-600 rounded font-bold text-white text-xs sm:text-sm ${i===aptData.length-1?'opacity-50 pointer-events-none':''}">Next</button>
        </div>
    `;
    document.getElementById('apt-q-area').innerHTML = html;
}

window.selectAptOption = function(qIdx, optIdx) {
    aptAnswers[qIdx] = optIdx;
    window.loadAptQuestion(qIdx); 
}

window.finishAptitude = function() {
    let score = 0;
    aptAnswers.forEach((ans, i) => { if(ans === aptData[i].answer) score++; });
    interviewData.aptScore = Math.round((score / aptData.length) * 100) || 0;
    startTechnicalRound();
}

// --- ROUND 2: TECHNICAL (CODING) ---
async function startTechnicalRound() {
    showPanel('panel-technical');
    updateSidebar(2);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        document.getElementById('tech-cam').srcObject = stream;
    } catch(e) {
        console.warn("Camera access denied or unavailable.");
    }

    document.addEventListener('visibilitychange', () => {
        if(document.hidden && document.getElementById('panel-technical').classList.contains('flex')) {
            document.getElementById('tab-warning').classList.remove('hidden');
        }
    });

    const prompt = `Give a coding problem for a ${role} at ${company}. MUST be solvable using HTML and JS to run in an iframe.
    Format JSON EXACTLY: 
    {
        "title": "Problem Title", 
        "desc_html": "<p>Detailed instructions.</p>", 
        "starter_code": "\\n<div id='output'></div>\\n<script>\\n// Logic\\n<\\/script>"
    }`;
    
    try {
        const res = await fetchAI(prompt);
        document.getElementById('tech-problem').innerHTML = `
            <h2 class="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-slate-800">${res.title}</h2>
            <div class="text-xs sm:text-sm text-slate-700 space-y-3 sm:space-y-4 leading-relaxed">${res.desc_html}</div>
        `;
        
        let formattedCode = res.starter_code;
        if(typeof formattedCode === 'string') formattedCode = formattedCode.replace(/\\n/g, '\n');

        if(!editor) {
            require(['vs/editor/editor.main'], function() {
                editor = monaco.editor.create(document.getElementById('monaco-container'), {
                    value: formattedCode,
                    language: 'html',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: {enabled: false},
                    fontSize: window.innerWidth < 768 ? 12 : 14
                });
            });
        } else {
            editor.setValue(formattedCode);
            setTimeout(() => editor.layout(), 200); 
        }
    } catch(e) {
        document.getElementById('tech-problem').innerHTML = "<p class='text-red-500 font-medium'>Failed to load problem. Please refresh the page or check your internet.</p>";
    }
}

window.runTechCode = function() {
    if(!editor) return;
    const code = editor.getValue();
    const iframe = document.getElementById('tech-preview');
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(code);
    iframe.contentWindow.document.close();
}

window.finishTechnical = function() {
    interviewData.techCode = editor ? editor.getValue() : "";
    const stream = document.getElementById('tech-cam').srcObject;
    if(stream) stream.getTracks().forEach(t => t.stop());
    startSituationalRound();
}

// --- ROUND 3: SITUATIONAL ---
async function startSituationalRound() {
    showPanel('panel-situational');
    updateSidebar(3);

    const prompt = `Give a real-world urgent bug or situational scenario for ${role} at ${company}. Return JSON: {"scenario":"Text describing issue"}`;
    try {
        const res = await fetchAI(prompt);
        document.getElementById('sit-scenario').innerHTML = `
            <h3 class="font-bold text-orange-700 mb-2 flex items-center gap-2"><i class="fas fa-fire"></i> Urgent Ticket</h3>
            <p class="text-sm sm:text-base leading-relaxed">${res.scenario}</p>
        `;
    } catch (e) {
        document.getElementById('sit-scenario').innerHTML = `<p class="font-medium">Production server is down. How do you troubleshoot? Please write your approach.</p>`;
    }
}

window.finishSituational = function() {
    interviewData.sitAnswer = document.getElementById('sit-answer').value;
    startHRRound();
}

// --- ROUND 4: HR VOICE ---
function startHRRound() {
    showPanel('panel-hr');
    updateSidebar(4);
    
    // Initialization for Speech Recognition
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
            const btn = document.getElementById('hr-mic-btn');
            btn.classList.add('bg-red-500', 'text-white', 'border-red-500', 'animate-pulse');
            document.getElementById('hr-mic-hint').innerText = "Listening... Speak now";
        };
        
        recognition.onresult = (e) => {
            const text = e.results[0][0].transcript;
            const btn = document.getElementById('hr-mic-btn');
            
            // Show User message
            document.getElementById('hr-chat-log').innerHTML += `<p class="bg-blue-50 p-3 rounded-xl text-xs sm:text-sm text-blue-900 border border-blue-100 mb-3 border-l-4 border-l-blue-500 ml-8 shadow-sm"><strong>You:</strong> ${text}</p>`;
            scrollToBottom('hr-chat-log');
            
            // Add to log
            interviewData.hrLog.push({role: "user", content: text});
            
            // Reset UI
            btn.classList.remove('bg-red-500', 'text-white', 'border-red-500', 'animate-pulse');
            btn.disabled = true; 
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            
            document.getElementById('hr-mic-hint').innerText = "Sarah is processing your answer...";
            
            askHRQuestion(); // Trigger AI response
        };

        recognition.onerror = (e) => {
            const btn = document.getElementById('hr-mic-btn');
            btn.classList.remove('bg-red-500', 'text-white', 'border-red-500', 'animate-pulse');
            document.getElementById('hr-mic-hint').innerText = "Click Mic to Answer (Try again)";
        }
    } else {
        document.getElementById('hr-mic-hint').innerText = "Mic not supported in this browser.";
    }

    // Assign click handler to mic
    document.getElementById('hr-mic-btn').onclick = () => { 
        if(synth.speaking) synth.cancel(); 
        try { if(recognition) recognition.start(); } catch(err) {} 
    };
}

window.initiateHRVoice = function() {
    if(!premiumVoice) loadVoices(); 
    
    document.getElementById('start-hr-btn').classList.add('hidden');
    document.getElementById('hr-chat-log').classList.remove('hidden');
    document.getElementById('hr-controls').classList.remove('hidden');
    document.getElementById('hr-controls').classList.add('flex');
    
    interviewData.hrLog = [{
        role: "system", 
        content: `You are Sarah, a highly professional HR Manager at ${company}. You are interviewing the candidate for the ${role} position. 
        RULES:
        1. Always keep responses under 2 sentences. Very concise.
        2. Do NOT use any markdown.
        3. Ask exactly one behavioral question at a time.`
    }];
    
    interviewData.hrLog.push({role: "user", content: "Hi Sarah, I am ready for the HR round. Please introduce yourself briefly and ask the first question."});
    
    askHRQuestion(true);
}

async function askHRQuestion(isFirst = false) {
    hrQCount++;
    if(hrQCount > 3) { 
        // End HR round naturally, SHOW SUBMIT BUTTON
        document.getElementById('hr-controls').classList.remove('flex');
        document.getElementById('hr-controls').classList.add('hidden');
        
        document.getElementById('hr-finish-container').classList.remove('hidden');
        document.getElementById('hr-finish-container').classList.add('flex');
        
        document.getElementById('hr-status').innerText = "Interview finished. Please submit to view your report.";
        document.getElementById('hr-glow').style.display = "none";
        return;
    }

    document.getElementById('hr-status').innerText = "Sarah is thinking...";
    document.getElementById('hr-glow').style.display = "block"; 
    
    const bodyData = {
        model: MODEL,
        messages: interviewData.hrLog,
        temperature: 0.5
    };

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(bodyData)
        });
        
        const data = await response.json();
        let aiResponse = data.choices[0].message.content;
        
        aiResponse = aiResponse.replace(/[*_#`]/g, '');
        
        interviewData.hrLog.push({role: "assistant", content: aiResponse});
        
        document.getElementById('hr-chat-log').innerHTML += `<p class="bg-slate-50 p-3 rounded-xl text-xs sm:text-sm text-slate-800 border border-slate-200 mb-3 border-l-4 border-l-primary-500 mr-8 shadow-sm"><strong>Sarah:</strong> ${aiResponse}</p>`;
        scrollToBottom('hr-chat-log');

        document.getElementById('hr-status').innerText = "Sarah is speaking...";
        
        if(synth.speaking) synth.cancel();
        const utter = new SpeechSynthesisUtterance(aiResponse);
        if(premiumVoice) utter.voice = premiumVoice;
        utter.rate = 0.95; 
        utter.pitch = 1.1; 
        
        utter.onend = () => { 
            document.getElementById('hr-status').innerText = "Waiting for your answer..."; 
            document.getElementById('hr-glow').style.display = "none"; 
            
            const btn = document.getElementById('hr-mic-btn');
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('hr-mic-hint').innerText = "Click Mic to Answer";
        };
        
        synth.speak(utter);

    } catch(e) {
        console.error("HR Round Error:", e);
        // If error occurs, let them submit
        document.getElementById('hr-controls').classList.add('hidden');
        document.getElementById('hr-finish-container').classList.remove('hidden');
        document.getElementById('hr-finish-container').classList.add('flex');
    }
}

// --- FINAL REPORT (UPDATED WITH ROUND-WISE SCORES) ---
window.generateFinalReport = async function() {
    document.getElementById('interview-phase').classList.add('hidden');
    const reportPhase = document.getElementById('report-phase');
    reportPhase.classList.remove('hidden');
    reportPhase.classList.add('flex');

    const prompt = `
        Evaluate candidate for ${role} at ${company}.
        Aptitude Score: ${interviewData.aptScore}%
        Code Written: ${interviewData.techCode.substring(0,300)}
        Situation Answer: ${interviewData.sitAnswer}
        HR Interaction Log: ${JSON.stringify(interviewData.hrLog)}
        
        Evaluate each round strictly out of 100. Provide realistic scores based on the input.
        Return ONLY a JSON Format EXACTLY like this:
        {
            "scores": {
                "technical": 70,
                "situational": 80,
                "hr": 85,
                "overall": 78
            },
            "feedback": "Overall performance summary and key weak areas.",
            "roadmap": [
                {"title": "Phase 1: Concept Building", "tasks": ["Task 1", "Task 2"]}
            ]
        }
    `;

    try {
        const res = await fetchAI(prompt);

        // Update Round-wise Scores in UI
        document.getElementById('score-apt').innerText = interviewData.aptScore + "%";
        document.getElementById('score-tech').innerText = (res.scores?.technical || 0) + "%";
        document.getElementById('score-sit').innerText = (res.scores?.situational || 0) + "%";
        document.getElementById('score-hr').innerText = (res.scores?.hr || 0) + "%";

        // Update Overall Score
        const overall = res.scores?.overall || res.overall_score || 0;
        document.getElementById('final-score').innerText = overall + "%";
        
        // Dynamic color styling for final score based on performance
        const finalScoreEl = document.getElementById('final-score');
        finalScoreEl.className = "text-4xl sm:text-5xl font-black"; // Reset classes
        if(overall >= 75) finalScoreEl.classList.add('text-green-600');
        else if(overall < 50) finalScoreEl.classList.add('text-red-500');
        else finalScoreEl.classList.add('text-orange-500');

        document.getElementById('final-feedback').innerText = res.feedback;
        
        const rmContainer = document.getElementById('custom-roadmap-container');
        rmContainer.innerHTML = "";
        res.roadmap.forEach((step, i) => {
            const tasks = step.tasks.map(t => `<li class="flex items-start gap-2 text-xs sm:text-sm text-slate-600"><i class="fas fa-check-circle text-blue-500 mt-1"></i> <span>${t}</span></li>`).join('');
            rmContainer.innerHTML += `
                <div class="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl relative ml-4 mb-4">
                    <div class="absolute -left-4 top-4 w-8 h-8 bg-blue-600 text-white rounded-full flex justify-center items-center font-bold border-4 border-white text-sm shadow-sm">${i+1}</div>
                    <h3 class="font-bold text-slate-800 ml-4 mb-2 text-sm sm:text-base">${step.title}</h3>
                    <ul class="space-y-1.5 ml-4">${tasks}</ul>
                </div>
            `;
        });
    } catch(e) {
        document.getElementById('final-feedback').innerText = "Failed to compile report. Please try the simulation again.";
        document.getElementById('custom-roadmap-container').innerHTML = "";
    }
}

// --- HELPERS ---
function showPanel(id) {
    ['panel-aptitude', 'panel-technical', 'panel-situational', 'panel-hr'].forEach(p => {
        document.getElementById(p).classList.add('hidden');
        document.getElementById(p).classList.remove('flex');
    });
    const pnl = document.getElementById(id);
    pnl.classList.remove('hidden');
    pnl.classList.add('flex');
    
    if(id === 'panel-technical' && editor) {
        setTimeout(() => { editor.layout(); }, 100);
    }
}

function updateSidebar(rnd) {
    for(let i=1; i<=4; i++) {
        const el = document.getElementById('rnd-'+i);
        el.className = "round-item " + (i < rnd ? "round-done" : (i === rnd ? "round-active" : "opacity-50"));
    }
}

function scrollToBottom(id) {
    const el = document.getElementById(id);
    if(el) el.scrollTop = el.scrollHeight;
}

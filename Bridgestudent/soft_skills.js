const API_KEY = "apload api key";
const HINDI_FILLERS = ["matlab", "acha", "hai", "karna", "hua", "mtlb", "kaise", "bhai", "theek", "woh", "haan", "nahi", "hmm"];

let recognition, isSessionActive = false, isAiSpeaking = false, transcriptBuffer = "", hindiCount = 0, chartInstance = null;
let conversationHistory = [{ role: "system", content: "You are a professional HR Manager. Ask 1 SHORT question at a time. Be formal. Wait for answer." }];
let realVisibility = 0, realVolume = 0, totalConf = 0, countConf = 0, totalVis = 0, countVis = 0;

async function startSession() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('webcam').srcObject = stream;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        startVideoSensor(stream);
        startAudioSensor(stream, audioContext);
        document.getElementById('start-overlay').classList.add('hidden');
        document.getElementById('initial-ui').classList.add('hidden');
        document.getElementById('face-box').classList.remove('hidden');
        document.getElementById('session-badge').innerText = "Live";
        document.getElementById('session-badge').className = "bg-green-100 text-green-600 px-3 py-1 rounded-full text-xs font-bold animate-pulse";
        setupSpeechRecognition();
        isSessionActive = true;
        const intro = "Good morning. Please introduce yourself briefly.";
        conversationHistory.push({ role: "assistant", content: intro });
        addLog("HR", intro); speakText(intro);
    } catch(e) { alert("Camera/Mic Permission Required."); }
}

function startVideoSensor(stream) {
    const video = document.getElementById('webcam'), canvas = document.getElementById('sensor-canvas'), ctx = canvas.getContext('2d'), faceBox = document.getElementById('face-box');
    setInterval(() => {
        if(!isSessionActive || video.paused) return;
        canvas.width = 64; canvas.height = 64; ctx.drawImage(video, 0, 0, 64, 64);
        const frame = ctx.getImageData(0,0,64,64).data;
        let brightness = 0;
        for(let i=0; i<frame.length; i+=4) brightness += (frame[i]+frame[i+1]+frame[i+2])/3;
        brightness /= (frame.length/4);
        if(brightness < 15) {
            realVisibility = 0; document.getElementById('light-status').innerText = "⚠️ FACE NOT VISIBLE";
            faceBox.style.opacity = "0";
        } else {
            realVisibility = Math.min(100, brightness * 1.8);
            document.getElementById('light-status').innerText = "✅ EYE CONTACT ACTIVE";
            faceBox.style.opacity = "1"; faceBox.classList.add('active');
        }
        document.getElementById('bar-focus').style.width = realVisibility + "%";
        document.getElementById('score-focus').innerText = Math.round(realVisibility) + "%";
        totalVis += realVisibility; countVis++;
        updateConfidence();
    }, 200);
}

function startAudioSensor(stream, ctx) {
    const analyser = ctx.createAnalyser(), src = ctx.createMediaStreamSource(stream), processor = ctx.createScriptProcessor(2048, 1, 1);
    src.connect(analyser); analyser.connect(processor); processor.connect(ctx.destination);
    processor.onaudioprocess = () => {
        if(!isSessionActive || isAiSpeaking) return;
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let avg = array.reduce((a,b)=>a+b)/array.length;
        realVolume = avg < 5 ? 0 : Math.min(100, avg * 3);
        document.getElementById('bar-aud').style.width = realVolume + "%";
        document.getElementById('score-aud').innerText = Math.round(realVolume) + "%";
        if(realVolume > 10) { totalConf += (realVisibility*0.7 + realVolume*0.3); countConf++; }
        updateConfidence();
    };
}

function updateConfidence() {
    let combined = realVisibility < 15 ? 0 : Math.round((realVisibility * 0.7) + (realVolume * 0.3));
    document.getElementById('bar-conf').style.width = combined + "%";
    document.getElementById('score-conf').innerText = combined + "%";
}

function setupSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
        recognition.onend = () => { if (isSessionActive && !isAiSpeaking) recognition.start(); };
        recognition.onresult = (event) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    transcriptBuffer += event.results[i][0].transcript + " ";
                    checkHindi(event.results[i][0].transcript);
                } else { interim += event.results[i][0].transcript; }
            }
            document.getElementById('live-transcript').innerText = interim || transcriptBuffer || "...";
        };
        recognition.start();
    }
}

function checkHindi(text) {
    const words = text.toLowerCase().split(" ");
    words.forEach(w => { if(HINDI_FILLERS.includes(w)) { hindiCount++; document.getElementById('hindi-count').innerText = hindiCount; }});
}

async function sendAnswer() {
    if (!transcriptBuffer.trim()) return;
    document.getElementById('user-speaking-ui').classList.add('hidden');
    document.getElementById('processing-ui').classList.remove('hidden');
    const text = transcriptBuffer;
    conversationHistory.push({ role: "user", content: text });
    addLog("You", text); transcriptBuffer = "";
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: conversationHistory, max_tokens: 150 })
        });
        const reply = (await res.json()).choices[0].message.content;
        conversationHistory.push({ role: "assistant", content: reply });
        addLog("HR", reply);
        document.getElementById('processing-ui').classList.add('hidden');
        speakText(reply);
    } catch(e) { document.getElementById('user-speaking-ui').classList.remove('hidden'); }
}

function speakText(text) {
    isAiSpeaking = true; if(recognition) recognition.stop();
    document.getElementById('ai-speaking-ui').classList.remove('hidden');
    document.getElementById('user-speaking-ui').classList.add('hidden');
    const utt = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const female = voices.find(v => v.name.includes("Google US English") || v.name.includes("Samantha"));
    if(female) utt.voice = female;
    utt.onend = () => {
        isAiSpeaking = false;
        document.getElementById('ai-speaking-ui').classList.add('hidden');
        document.getElementById('user-speaking-ui').classList.remove('hidden');
        if(isSessionActive) recognition.start();
    };
    window.speechSynthesis.speak(utt);
}

function addLog(role, text) {
    const div = document.createElement('div');
    div.innerHTML = `<span class="${role==='HR'?'text-brand-600':'text-blue-600'} font-bold">${role}:</span> ${text}`;
    document.getElementById('chat-log').prepend(div);
}

async function endSession() {
    isSessionActive = false; window.speechSynthesis.cancel(); if(recognition) recognition.stop();
    document.getElementById('report-modal').style.display = 'block';
    document.getElementById('report-loading').classList.remove('hidden');
    document.getElementById('report-content').classList.add('hidden');

    const finalVis = countVis > 0 ? Math.round(totalVis/countVis) : 50;
    const finalConf = countConf > 0 ? Math.round(totalConf/countConf) : 50;

    const prompt = `Evaluate candidate. History: ${JSON.stringify(conversationHistory)}. Data: Conf=${finalConf}%, Eye=${finalVis}%, Hindi=${hindiCount}. Return JSON ONLY: {"scores":[Prof, Clarity, Conf, Content], "suggestions":["Point 1", "Point 2", "Point 3"]}`;

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } })
        });
        const result = JSON.parse((await res.json()).choices[0].message.content);

        // SAVE TO DASHBOARD
        localStorage.setItem('bridgeAI_softSkills', JSON.stringify({ score: Math.round(result.scores.reduce((a,b)=>a+b)/4), date: new Date().toLocaleDateString() }));

        document.getElementById('final-conf-score').innerText = finalConf + "%";
        document.getElementById('final-eye-score').innerText = finalVis + "%";
        const list = document.getElementById('suggestions-list'); list.innerHTML = "";
        result.suggestions.forEach(p => { const li = document.createElement('li'); li.innerText = p; list.appendChild(li); });

        document.getElementById('report-loading').classList.add('hidden');
        document.getElementById('report-content').classList.remove('hidden');
        
        // FINAL FIX: Delay Graph rendering so Modal is fully visible
        setTimeout(() => renderGraph(result.scores), 600);
    } catch (e) { document.getElementById('report-loading').innerText = "Report Error."; }
}

function renderGraph(data) {
    const ctx = document.getElementById('skillsGraph').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Professionalism', 'Clarity', 'Confidence', 'Content'],
            datasets: [{ label: 'Performance', data: data, backgroundColor: 'rgba(34, 197, 94, 0.2)', borderColor: '#16a34a', borderWidth: 2 }]
        },
        options: { scales: { r: { beginAtZero: true, max: 100 } }, maintainAspectRatio: false }
    });
}

function closeReport() { document.getElementById('report-modal').style.display = 'none'; }

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- API & GLOBALS ---
const API_KEY = "apload_api key ";
const MODEL_NAME = "llama-3.3-70b-versatile";

let editor;
let userProfile = {};
let currentDay = 0;
const TOTAL_DAYS = 5;
let activeTask = null; 

document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Monaco Editor First
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.33.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: '',
            language: 'html',
            theme: 'vs-dark',
            fontSize: 14,
            fontFamily: 'Fira Code, monospace',
            minimap: { enabled: false },
            padding: { top: 20 },
            automaticLayout: true
        });

        // 2. Authenticate and Fetch Firebase Data (NO LOCALSTORAGE)
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userRef = doc(db, "users", user.uid);
                    const docSnap = await getDoc(userRef);
                    
                    if (docSnap.exists()) {
                        userProfile = docSnap.data();
                    } else {
                        userProfile = { name: user.displayName || "Intern", headline: "Web Developer", skills: "HTML, CSS, JS" };
                    }
                    
                    // Update UI with Firebase Data
                    document.getElementById('dropdown-name').innerText = userProfile.name || "Student";
                    document.getElementById('role-val').innerText = userProfile.headline || "Web Developer";

                    // Load Profile Image from Firebase
                    const savedProfilePic = userProfile.photoURL;
                    const imgContainer = document.getElementById('nav-profile-img-container');
                    if (imgContainer) {
                        if (savedProfilePic && savedProfilePic.trim() !== "") {
                            imgContainer.innerHTML = `<img src="${savedProfilePic}" alt="Profile" class="w-full h-full object-cover">`;
                        } else {
                            imgContainer.innerHTML = `<i class="fas fa-user text-slate-400"></i>`;
                        }
                    }

                    // Start Dynamic Internship after data is loaded
                    fetchNextTask();

                } catch (error) {
                    console.error("Error fetching user data from Firebase:", error);
                }
            } else {
                window.location.href = "index.html"; // Redirect if not logged in
            }
        });
    });
});

// --- GROQ API HELPER ---
async function callGroqAI(prompt, systemMsg) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: MODEL_NAME,
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: prompt }
            ],
            temperature: 0.2,
            response_format: { type: "json_object" } // Force JSON output
        })
    });
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

// --- AI TASK GENERATOR ---
window.fetchNextTask = async function() {
    const succModal = document.getElementById('succ-modal');
    if(succModal) succModal.classList.add('hidden');
    
    if (currentDay >= TOTAL_DAYS) {
        addAiMessage("<strong>🎉 Internship Completed!</strong><br>You've cleared all tickets dynamically. Excellent work!");
        document.getElementById('sub-btn').disabled = true;
        return;
    }

    currentDay++;
    document.getElementById('day-val').innerText = currentDay;
    document.getElementById('prog-bar').style.width = `${((currentDay - 1) / TOTAL_DAYS) * 100}%`;
    
    document.getElementById('ticket-status').innerText = `● Generating Ticket #${100 + currentDay}...`;
    const typingId = showTyping();
    
    const subBtn = document.getElementById('sub-btn');
    subBtn.disabled = true;
    subBtn.classList.add('opacity-50', 'cursor-not-allowed');
    editor.setValue('');

    const systemMsg = "You are Alex, a Tech Lead. Generate a coding task for an intern. Output JSON format only.";
    
    // Ensure we have fallbacks just in case skills/headline are empty in DB
    const internRole = userProfile.headline || "Web Developer";
    const internSkills = userProfile.skills || "HTML, CSS, JS";

    // STRICTER PROMPT FOR NEWLINES
    const prompt = `
        The intern's target role is: ${internRole}.
        Their skills are: ${internSkills}.
        
        Generate task number ${currentDay} out of ${TOTAL_DAYS}.
        The task MUST be solvable using standard HTML, inline CSS, and vanilla JavaScript so it runs directly in an iframe preview. Do NOT require external bundlers.
        
        Return ONLY a valid JSON object with the following structure:
        {
            "ticket_title": "Ticket #10X: Task Name",
            "instructions_html": "HTML formatted instructions (use <strong>, <ul>, <li>, <code>). Write it as if you are talking to the intern.",
            "initial_code": "The starting HTML/JS boilerplate code. MUST use proper indentation and exact newline characters (\\n) so it formats beautifully in a code editor across multiple lines.",
            "file_name": "index.html"
        }
    `;

    try {
        activeTask = await callGroqAI(prompt, systemMsg);
        
        removeTyping(typingId);
        document.getElementById('ticket-status').innerText = `● Active: ${activeTask.ticket_title}`;
        document.getElementById('file-name').innerText = activeTask.file_name;
        
        addAiMessage(activeTask.instructions_html);
        
        // FORMATTING FIX: Replace literal string "\n" with actual line breaks just in case AI messes up JSON escaping
        let formattedCode = activeTask.initial_code;
        if (typeof formattedCode === 'string') {
            formattedCode = formattedCode.replace(/\\n/g, '\n');
        }
        
        editor.setValue(formattedCode);
        
        let lang = 'html';
        if(activeTask.file_name.endsWith('.js')) lang = 'javascript';
        if(activeTask.file_name.endsWith('.css')) lang = 'css';
        monaco.editor.setModelLanguage(editor.getModel(), lang);

        updatePreview("<div style='display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; color:#94a3b8;'>Write code and click Run</div>");
        
        subBtn.disabled = false;
        subBtn.classList.remove('opacity-50', 'cursor-not-allowed');

    } catch (error) {
        console.error(error);
        removeTyping(typingId);
        addAiMessage("<strong>⚠️ System Error</strong><br>Failed to fetch the ticket from Jira. Please refresh the page.");
    }
}

// --- AI CODE EVALUATOR ---
window.submitCode = async function() {
    const userCode = editor.getValue();
    addUserMessage("Submitting code for PR review...");
    
    const subBtn = document.getElementById('sub-btn');
    subBtn.disabled = true;
    subBtn.classList.add('opacity-50', 'cursor-not-allowed');

    const typingId = showTyping();
    document.getElementById('ticket-status').innerText = `● Reviewing PR...`;

    const systemMsg = "You are Alex, a Tech Lead reviewing code. Be strict but helpful.";
    const prompt = `
        You assigned this ticket: ${activeTask.ticket_title}.
        Instructions were: ${activeTask.instructions_html}.
        
        The intern submitted this code:
        \`\`\`
        ${userCode}
        \`\`\`

        Evaluate if the code correctly implements the instructions.
        Return ONLY a valid JSON object:
        {
            "passed": true or false,
            "feedback": "Short HTML formatted feedback explaining what is good or what needs fixing."
        }
    `;

    try {
        const evaluation = await callGroqAI(prompt, systemMsg);
        removeTyping(typingId);

        if (evaluation.passed) {
            runCode(); 
            document.getElementById('succ-fb').innerHTML = evaluation.feedback;
            document.getElementById('succ-modal').classList.remove('hidden');
            document.getElementById('prog-bar').style.width = `${(currentDay / TOTAL_DAYS) * 100}%`;
            document.getElementById('ticket-status').innerText = `● PR Approved!`;
        } else {
            addAiMessage(`<strong>⚠️ PR Rejected</strong><br>${evaluation.feedback}`);
            runCode(); 
            document.getElementById('ticket-status').innerText = `● Changes Requested`;
            subBtn.disabled = false;
            subBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }

    } catch (error) {
        removeTyping(typingId);
        addAiMessage("<strong>⚠️ Review Failed</strong><br>GitHub actions timed out. Please try submitting again.");
        subBtn.disabled = false;
        subBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// --- LIVE PREVIEW ---
window.runCode = function() {
    const code = editor.getValue();
    updatePreview("<div style='display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; color:#3b82f6; font-weight:bold;'>Compiling <i class='fas fa-spinner fa-spin ml-2'></i></div>");

    setTimeout(() => {
        updatePreview(code);
    }, 800); 
}

function updatePreview(html) {
    const iframe = document.getElementById('preview-frame');
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();
}

// --- CHAT UI UTILS ---
const chatBox = document.getElementById('chat-box');

function showTyping() {
    const id = 'typing-' + Date.now();
    const html = `
        <div id="${id}" class="ai-msg w-16 h-8 flex items-center justify-center gap-1 typing-indicator message-anim">
            <span style="animation-delay: 0s"></span>
            <span style="animation-delay: 0.2s"></span>
            <span style="animation-delay: 0.4s"></span>
        </div>`;
    chatBox.insertAdjacentHTML('beforeend', html);
    chatBox.scrollTop = chatBox.scrollHeight;
    return id;
}

function removeTyping(id) {
    const el = document.getElementById(id);
    if(el) el.remove();
}

function addAiMessage(htmlContent) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-msg message-anim';
    msgDiv.innerHTML = htmlContent; 
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addUserMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'user-msg message-anim';
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Firebase Logout implementation
window.logoutUser = function() {
    if(confirm("Are you sure you want to logout?")) {
        signOut(auth).then(() => {
            window.location.href = "index.html"; 
        }).catch((error) => {
            console.error("Logout Error:", error);
        });
    }
}

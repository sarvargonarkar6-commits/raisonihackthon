import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const API_KEY = "aload_api_key";
let extractedResumeText = "";
let currentUserProfile = null; // Firebase se data yahan store hoga

// --- 0. FIREBASE AUTH & PROFILE FETCH ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(userRef);
                
                if (docSnap.exists()) {
                    currentUserProfile = docSnap.data();
                } else {
                    currentUserProfile = { name: user.displayName || "Student" };
                }

                // Update Name
                const dropdownName = document.getElementById('dropdown-name');
                if (dropdownName) {
                    dropdownName.innerText = currentUserProfile.name || "Student";
                }

                // Update Profile Image STRICTLY from Firebase
                const imgContainer = document.getElementById('nav-profile-img-container');
                if (imgContainer) {
                    if (currentUserProfile.photoURL && currentUserProfile.photoURL.trim() !== "") {
                        imgContainer.innerHTML = `<img src="${currentUserProfile.photoURL}" alt="Profile" class="w-full h-full object-cover">`;
                    } else {
                        imgContainer.innerHTML = `<i class="fas fa-user text-slate-400"></i>`;
                    }
                }

            } catch (error) {
                console.error("Error fetching profile from Firebase:", error);
            }
        } else {
            // Agar user logged in nahi hai, toh index.html par bhej do
            window.location.href = "index.html";
        }
    });
});

// --- 1. HANDLE PDF UPLOAD ---
window.handleFileSelect = async function(input) {
    const file = input.files[0];
    if (!file) return;

    document.getElementById('upload-label').classList.add('hidden');
    document.getElementById('file-info').classList.remove('hidden');
    document.getElementById('filename').innerText = file.name;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            fullText += pageText + " ";
        }

        extractedResumeText = fullText;
    } catch (error) {
        alert("Error reading PDF. Please ensure it's a valid text-based PDF.");
    }
}

// --- 2. AI RESUME BUILDER (UPDATED LOGIC WITH LENGTH & TOKEN FIX) ---
window.generateResumeFromProfile = async function() {
    const profile = currentUserProfile;
    const jd = document.getElementById('jd-text').value.trim();
    
    // Check Profile
    if (!profile || !profile.name || !profile.skills) {
        alert("You need to complete your Profile setup first! We need your Skills, Target Role, and Details.");
        window.location.href = "profile.html";
        return;
    }

    // Check Job Description - Mandatory for matching!
    if (!jd) {
        alert("Please paste the Job Description first! AI needs it to tailor your resume and check your skills.");
        return;
    }

    // Open Modal in Loading State
    document.getElementById('resume-builder-modal').style.display = 'block';
    document.getElementById('resume-loading').classList.remove('hidden');
    document.getElementById('generated-resume-area').classList.add('hidden');

    // 🔥 NAYA CODE: Sirf resume ke liye kaam ka data extract karo, kachra hatao!
    const safeProfile = {
        name: profile.name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        skills: profile.skills || "",
        targetRole: profile.targetRole || "",
        education: profile.education || "",
        experience: profile.experience || "",
        projects: profile.projects || ""
    };
    
    // Convert to String aur length ko zabardasti control karo (max 2500 chars)
    const profileString = JSON.stringify(safeProfile).substring(0, 2500);

    const prompt = `
        You are an expert ATS-friendly Resume format generator.
        Create a professional, clean, single-page HTML resume using the candidate JSON data.
        
        **IMPORTANT INSTRUCTION:** Tailor this resume SPECIFICALLY to the following Job Description (JD). 
        Highlight the skills from the candidate's profile that match the JD. 
        DO NOT invent or add skills that the candidate does not have in their JSON profile.
        
        JOB DESCRIPTION:
        "${jd.substring(0, 1500)}"
        
        CANDIDATE DATA:
        ${profileString}

        REQUIREMENTS:
        1. Return ONLY valid HTML code. No markdown formatting (like \`\`\`html).
        2. Do NOT include <html>, <head>, or <body> tags. Just the internal structure (<div>, <h1>, <p>, <ul>).
        3. Use inline CSS for styling. Make it look like a classic Harvard-style ATS-friendly resume.
        4. Sections to include: Header (Name, Contact), Professional Summary, Skills, Education.
    `;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 2500 // 🔥 FIX: Ye explicitly limit set karega taaki completion length error na aaye
            })
        });

        const data = await response.json();

        // Error Handling for API rejection (Status 400)
        if (!response.ok) {
            console.error("❌ Groq API Error Details:", data);
            throw new Error(data.error?.message || "Groq API ne request reject kar di. Check console for details.");
        }

        let htmlContent = data.choices[0].message.content;
        
        // Clean up any markdown blocks
        htmlContent = htmlContent.replace(/```html/g, '').replace(/```/g, '');

        document.getElementById('generated-resume-content').innerHTML = htmlContent;
        
        // Set the generated text as the text to be analyzed for ATS scanning!
        extractedResumeText = document.getElementById('generated-resume-content').innerText;
        
        // Change Upload UI to show generated state
        document.getElementById('upload-label').classList.add('hidden');
        document.getElementById('file-info').classList.remove('hidden');
        document.getElementById('filename').innerText = "AI_Generated_Resume.pdf";
        document.getElementById('file-info').querySelector('.text-green-600').innerText = "Generated from Profile!";

        // Update Modal UI
        document.getElementById('resume-loading').classList.add('hidden');
        document.getElementById('generated-resume-area').classList.remove('hidden');

        // 🔥 AUTO-RUN ATS SCANNER AFTER GENERATING 🔥
        processAndAnalyze(true); 

    } catch (error) {
        console.error("Resume Generation Error:", error);
        alert(`Failed to generate resume: ${error.message}`);
        window.closeResumeModal();
    }
}

window.closeResumeModal = function() {
    document.getElementById('resume-builder-modal').style.display = 'none';
}

window.printResume = function() {
    const printContent = document.getElementById('generated-resume-content').innerHTML;
    const originalContents = document.body.innerHTML;

    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload(); 
}

// --- 3. ATS ANALYZE PROCESS (UPDATED LOGIC) ---
window.processAndAnalyze = async function(isAutoRun = false) {
    const jd = document.getElementById('jd-text').value.trim();

    if (!jd) return alert("Please paste the Job Description.");
    if (!extractedResumeText) return alert("Please Upload a PDF or Auto-Generate a Resume first.");

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('results-panel').classList.add('hidden');
    document.getElementById('results-panel').classList.remove('flex');
    document.getElementById('loading-panel').classList.remove('hidden');
    document.getElementById('loading-panel').classList.add('flex');
    
    document.getElementById('analyze-btn').disabled = true;
    document.getElementById('btn-text').innerText = "Scanning...";

    const prompt = `
        You are a strict ATS (Applicant Tracking System) Scanner API.
        Compare the provided Resume against the Job Description.
        
        JOB DESCRIPTION:
        "${jd.substring(0, 1500)}"
        
        RESUME TEXT:
        "${extractedResumeText.substring(0, 2000)}"
        
        **CRITICAL INSTRUCTION FOR TIPS:** If the resume is missing key skills required in the Job Description, you MUST explicitly tell the user to learn them. 
        Example tip format: "You are missing [Skill Name]. Since it's required for this job, you should learn it."
        
        **IMPORTANT:** Return ONLY a valid JSON object. Do not include any text outside the JSON.
        
        JSON Format:
        {
            "score": 0-100 (number only, be realistic based on match),
            "summary": "Short 1 sentence verdict.",
            "missing_keywords": ["keyword1", "keyword2"],
            "matched_count": 5,
            "tips": ["Tip 1 about missing skills", "Tip 2"]
        }
    `;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                max_tokens: 1000, // 🔥 FIX: Scan ke liye sirf 1000 tokens bahut hain
                response_format: { type: "json_object" } 
            })
        });

        const data = await response.json();
        
        // Error Handling for Scan API
        if (!response.ok) {
            console.error("❌ Groq API Error Details (Scan):", data);
            throw new Error(data.error?.message || "Groq API reject request. Check console.");
        }

        let content = data.choices[0].message.content;
        
        // Safety cleanup just in case
        const jsonStartIndex = content.indexOf('{');
        const jsonEndIndex = content.lastIndexOf('}');
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
            content = content.substring(jsonStartIndex, jsonEndIndex + 1);
        }
        
        const result = JSON.parse(content);
        displayResults(result);

        // Agar background mein auto-run hua tha aur modal open hai, 
        // toh console log kar do. Result UI update ho chuka hai peeche.
        if(isAutoRun) {
            console.log("ATS Scan auto-completed for built resume!");
        }

    } catch (error) {
        console.error("Parsing Error or API Fail:", error);
        if(!isAutoRun) alert(`Error processing AI response: ${error.message}`);
        document.getElementById('loading-panel').classList.add('hidden');
        document.getElementById('loading-panel').classList.remove('flex');
        document.getElementById('empty-state').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('flex');
    } finally {
        document.getElementById('analyze-btn').disabled = false;
        document.getElementById('btn-text').innerText = "Run ATS Scan";
    }
}

// --- 4. DISPLAY RESULTS ---
function displayResults(data) {
    document.getElementById('loading-panel').classList.add('hidden');
    document.getElementById('loading-panel').classList.remove('flex');
    document.getElementById('results-panel').classList.remove('hidden');
    document.getElementById('results-panel').classList.add('flex');

    const score = data.score;
    document.getElementById('score-text').innerText = score + "%";
    document.getElementById('score-summary').innerText = data.summary;
    
    const offset = 251.2 - (251.2 * score) / 100;
    setTimeout(() => {
        document.getElementById('score-ring').style.strokeDashoffset = offset;
        const ring = document.getElementById('score-ring');
        ring.classList.remove('text-red-500', 'text-yellow-500', 'text-brand-500'); 
        
        if(score > 75) ring.classList.add('text-brand-500'); 
        else if(score > 50) ring.classList.add('text-yellow-500');
        else ring.classList.add('text-red-500');
    }, 100);

    document.getElementById('skills-found').innerText = `${data.matched_count} Matched`;
    document.getElementById('skills-missing').innerText = `${data.missing_keywords.length} Missing`;

    const container = document.getElementById('missing-keywords-container');
    container.innerHTML = "";
    if (data.missing_keywords.length === 0) {
         container.innerHTML = `<span class="px-3 py-1 bg-green-50 text-green-600 border border-green-100 text-xs rounded-full font-bold">No missing keywords! Excellent!</span>`;
    } else {
        data.missing_keywords.forEach(kw => {
            container.innerHTML += `<span class="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 text-xs rounded-md font-bold shadow-sm">${kw}</span>`;
        });
    }

    const tipsContainer = document.getElementById('tips-list');
    tipsContainer.innerHTML = "";
    data.tips.forEach(tip => {
        tipsContainer.innerHTML += `
            <li class="flex gap-3 items-start">
                <i class="fas fa-check-circle text-brand-500 mt-0.5"></i>
                <span>${tip}</span>
            </li>`;
    });
}

window.logoutUser = function() {
    if(confirm("Are you sure you want to log out?")) {
        signOut(auth).then(() => {
            window.location.href = "index.html";
        }).catch((err) => console.error(err));
    }
}

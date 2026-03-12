import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let skillsArray = [];
let skillScores = {};
let base64ProfilePic = "", base64BannerPic = "", base64Resume = "", base64Cert = "";

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);
            
            let savedData = {};
            if (docSnap.exists()) {
                savedData = docSnap.data();
                console.log("Data loaded from Firebase");
            } else {
                savedData = JSON.parse(localStorage.getItem('studentProfile')) || {};
                console.log("No Firebase data, loaded from LocalStorage");
            }
            
            if(savedData.skills) {
                skillsArray = typeof savedData.skills === 'string' ? savedData.skills.split(',').map(s => s.trim()).filter(s => s) : [];
            }
            
            skillScores = savedData.skillScores || JSON.parse(localStorage.getItem('skillScores')) || {};

            base64ProfilePic = savedData.photoURL || "";
            base64BannerPic = savedData.bannerURL || "";
            base64Resume = savedData.resumeBase64 || "";
            base64Cert = savedData.certBase64 || "";

            populateProfileFields(savedData, user);
            renderSkills();
        } catch (error) { 
            console.error("Load Error:", error); 
        }
    } else { 
        window.location.href = "index.html"; 
    }
});

window.addSkillTag = async function() {
    const input = document.getElementById('skill-input');
    const val = input.value.trim();
    if(val) {
        if(!skillsArray.includes(val)) {
            skillsArray.push(val);
            input.value = "";
            renderSkills();
            await saveProfileToDatabase(true); 
        } else {
            alert("This skill is already added!");
        }
    } else {
        alert("Please enter a skill first!");
    }
};

function renderSkills() {
    const container = document.getElementById('skills-tags-container');
    const hiddenInp = document.getElementById('inp-skills');
    if(!container) return;

    hiddenInp.value = skillsArray.join(',');
    
    if (skillsArray.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center text-slate-400 text-sm italic py-4">No skills added yet.</div>';
        return;
    }

    container.innerHTML = ''; 
    skillsArray.forEach((skill, index) => {
        const tag = document.createElement('div');
        tag.className = "relative group bg-white border border-indigo-100 p-3 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all flex items-center justify-between";
        
        let foundKey = Object.keys(skillScores).find(key => key.toLowerCase() === skill.toLowerCase());
        let scoreText = foundKey ? `${skillScores[foundKey]}%` : "Not Tested";
        let scoreClass = foundKey ? "text-green-600 font-extrabold" : "text-indigo-600";

        tag.innerHTML = `
            <div class="flex items-center gap-3 w-full">
                <div class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg shrink-0">${skill.charAt(0).toUpperCase()}</div>
                <div class="flex flex-col overflow-hidden">
                    <span class="text-sm font-bold text-slate-800 truncate">${skill}</span>
                    <span class="text-[10px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded w-fit mt-0.5">
                        Score: <span class="${scoreClass}">${scoreText}</span>
                    </span>
                </div>
            </div>
            <div class="flex items-center gap-1">
                <button onclick="testSpecificSkill('${skill}')" class="text-indigo-400 hover:text-indigo-600 p-2"><i class="fas fa-play"></i></button>
                <button onclick="removeSkill(${index})" class="text-slate-300 hover:text-red-500 p-2"><i class="fas fa-times"></i></button>
            </div>`;
        container.appendChild(tag);
    });
}

window.removeSkill = function(index) {
    const skillToRemove = skillsArray[index];
    skillsArray.splice(index, 1);
    let foundKey = Object.keys(skillScores).find(key => key.toLowerCase() === skillToRemove.toLowerCase());
    if(foundKey) delete skillScores[foundKey];
    renderSkills();
    saveProfileToDatabase(true);
};

window.testSpecificSkill = async function(skillName) {
    localStorage.setItem('target_interview_skill', skillName);
    await saveProfileToDatabase(true);
    window.location.href = "ai-practice.html";
};

function populateProfileFields(savedData, user) {
    document.getElementById('inp-name').value = savedData.name || user?.displayName || '';
    document.getElementById('inp-email').value = savedData.email || user?.email || '';
    document.getElementById('inp-phone').value = savedData.phone || '';
    document.getElementById('inp-location').value = savedData.address || '';
    document.getElementById('inp-bio').value = savedData.bio || '';
    document.getElementById('inp-university').value = savedData.university || '';
    document.getElementById('inp-college').value = savedData.college || '';
    document.getElementById('inp-branch').value = savedData.branch || '';
    document.getElementById('inp-cgpa').value = savedData.cgpa || '';
    document.getElementById('inp-linkedin').value = savedData.linkedin || '';
    document.getElementById('inp-github').value = savedData.github || '';
    document.getElementById('inp-portfolio').value = savedData.portfolio || '';
    document.getElementById('inp-cert-name').value = savedData.certName || '';
    
    if(savedData.resumeName) document.getElementById('resume-name').innerText = savedData.resumeName;
    if(savedData.photoURL) document.getElementById('profile-pic').src = savedData.photoURL;
    if(savedData.bannerURL) document.getElementById('banner-bg').style.backgroundImage = `url(${savedData.bannerURL})`;

    updateDisplay(savedData);
    calculateProgress(savedData);
}

function getFormData() {
    return {
        name: document.getElementById('inp-name').value,
        email: document.getElementById('inp-email').value,
        phone: document.getElementById('inp-phone').value,
        address: document.getElementById('inp-location').value,
        bio: document.getElementById('inp-bio').value,
        university: document.getElementById('inp-university').value,
        college: document.getElementById('inp-college').value,
        branch: document.getElementById('inp-branch').value,
        cgpa: document.getElementById('inp-cgpa').value,
        skills: skillsArray.join(','),
        skillScores: skillScores,
        linkedin: document.getElementById('inp-linkedin').value,
        github: document.getElementById('inp-github').value,
        portfolio: document.getElementById('inp-portfolio').value,
        certName: document.getElementById('inp-cert-name').value,
        resumeName: document.getElementById('resume-name').innerText !== "Select PDF" ? document.getElementById('resume-name').innerText : "",
        photoURL: base64ProfilePic,
        bannerURL: base64BannerPic,
        resumeBase64: base64Resume,
        certBase64: base64Cert,
        headline: "Candidate",
        updatedAt: new Date().toISOString()
    };
}

window.saveProfileToDatabase = async function(isSilent = false) {
    if (!currentUser) {
        alert("User not logged in!");
        return;
    }

    const profileData = getFormData();
    
    // Backup in LocalStorage
    localStorage.setItem('studentProfile', JSON.stringify(profileData));
    localStorage.setItem('skillScores', JSON.stringify(skillScores));
    
    updateDisplay(profileData);
    calculateProgress(profileData);

    try {
        const userRef = doc(db, "users", currentUser.uid);
        await setDoc(userRef, profileData, { merge: true });
        console.log("Firebase Save Successful");
        if(!isSilent) alert("✅ Profile & Skills Saved to Firebase!");
    } catch (e) { 
        console.error("Firebase Error:", e);
        if (e.code === 'out-of-range' || e.message.includes('too large')) {
            alert("❌ Error: Files are too large! Please upload smaller images/PDF (Max 1MB total).");
        } else {
            alert("❌ Firebase Error: " + e.message);
        }
    }
};

window.handleImageUpload = async function(event, targetId, isBackground) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 500000) { // 500KB check for single image
            alert("Image too large! Please select an image under 500KB.");
            return;
        }
        const base64 = await fileToBase64(file);
        if (isBackground) {
            document.getElementById(targetId).style.backgroundImage = `url(${base64})`;
            base64BannerPic = base64;
        } else {
            document.getElementById(targetId).src = base64;
            base64ProfilePic = base64;
        }
    }
};

window.updateFileName = async function(inputId, displayId) {
    const file = document.getElementById(inputId).files[0];
    if(file) {
        if (file.size > 800000) {
            alert("File is too large! Please upload under 800KB.");
            return;
        }
        document.getElementById(displayId).innerText = file.name;
        const base64 = await fileToBase64(file);
        if(inputId === 'inp-resume-file') base64Resume = base64;
        else base64Cert = base64;
    }
};

function updateDisplay(data) {
    document.getElementById('display-name').innerText = data.name || 'Student';
    document.getElementById('display-location').innerText = data.address || 'Location';
    document.getElementById('display-college').innerText = data.college || 'University';
}

function calculateProgress(data) {
    let filled = 0;
    const fields = ['name', 'email', 'phone', 'address', 'bio', 'university', 'college', 'branch', 'cgpa', 'skills', 'resumeName'];
    fields.forEach(field => { if(data[field] && data[field].toString().trim() !== '') filled++; });
    const pct = Math.round((filled / fields.length) * 100);
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-text').innerText = pct + '%';
}

window.logoutUser = () => signOut(auth).then(() => window.location.href = "index.html");

// ---------------------------------------------------------
// AI JOB SUGGESTIONS LOGIC
// ---------------------------------------------------------
window.getAIJobSuggestions = async function() {
    const container = document.getElementById('job-suggestions-container');
    
    // Check if user has added any skills
    if (skillsArray.length === 0) {
        container.innerHTML = '<div class="text-center text-red-500 text-sm font-bold py-4">Please add some skills first to get suggestions!</div>';
        return;
    }

    // Show loading state
    container.innerHTML = '<div class="text-center text-slate-500 text-sm py-8"><i class="fas fa-spinner fa-spin mr-2 text-2xl mb-3 text-green-500"></i><br>AI is analyzing your profile and scores to find the best jobs...</div>';

    // Build skill context for the AI
    let skillDetails = skillsArray.map(skill => {
        let foundKey = Object.keys(skillScores).find(key => key.toLowerCase() === skill.toLowerCase());
        let score = foundKey ? skillScores[foundKey] : "Not Tested";
        return `${skill} (Score: ${score}%)`;
    }).join(', ');

    // Prompt for the AI
    const prompt = `You are a career counselor AI. Based on the user's following skills and their test scores: ${skillDetails}. 
    Suggest 3 highly suitable real-world job roles or internships. 
    For each role, provide: 
    1. Job Title 
    2. Estimated Salary Range (in INR) 
    3. Short Job Description (2 lines) 
    4. Why this fits their current skill scores. 
    Format the output purely as HTML using Tailwind CSS classes for a clean UI. Use simple structural classes like <div class="bg-white border border-slate-200 p-4 rounded-xl shadow-sm mb-4"> for each job card, text-lg font-bold text-slate-800 for titles, text-green-600 font-bold for salary, and text-sm text-slate-600 for descriptions. Do not include markdown tags like \`\`\`html, just output raw valid HTML.`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer Apload_api_key `,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // UPDATED MODEL HERE
                messages: [
                    { role: "system", content: "You output only valid, stylized HTML without markdown formatting." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        // Agar response theek nahi aaya, toh server ka exact error message dekho
        if (!response.ok) {
            const errorText = await response.text();
            console.error("GROQ API EXACT ERROR:", errorText);
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            let aiHtml = data.choices[0].message.content;
            // Clean up any markdown AI might accidentally add
            aiHtml = aiHtml.replace(/```html/g, '').replace(/```/g, '');
            container.innerHTML = aiHtml;
        } else {
            container.innerHTML = '<div class="text-center text-red-500 text-sm py-4">Could not fetch suggestions. Please try again.</div>';
        }
    } catch (error) {
        console.error("AI API Error:", error);
        container.innerHTML = `<div class="text-center text-red-500 text-sm py-4 p-4 bg-red-50 rounded-xl"><b>Error Details:</b><br>${error.message}</div>`;
    }
};

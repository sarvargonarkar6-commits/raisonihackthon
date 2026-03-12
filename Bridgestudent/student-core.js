import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Puraana Firebase Config Jo Aapne Bheja Tha ---
const firebaseConfig = {
    apiKey: "AIzaSyCesoo8lmApp9rUuThHIInUGr9Qdc7twUM",
    authDomain: "bridge-ai-1de4a.firebaseapp.com",
    databaseURL: "https://bridge-ai-1de4a-default-rtdb.firebaseio.com",
    projectId: "bridge-ai-1de4a",
    storageBucket: "bridge-ai-1de4a.firebasestorage.app",
    messagingSenderId: "354527665479",
    appId: "1:354527665479:web:dd2932d710f9f5aae20062",
    measurementId: "G-Q7M430F0G7"
};

// Initialize Firebase (SAFE WAY to prevent duplicate-app error)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
// ---------------------------------------------------

let jobs = [];
let selectedJob = null;
let currentUser = null;
let userProfile = {};

// --- 1. TRACK USER & GET THEIR COLLEGE INFO ---
onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        // Student ki profile se uska college fetch karte hain (e.g., YCCE)
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if(userSnap.exists()){
            userProfile = userSnap.data();
            // User profile load hone ke baad hi Jobs load karenge
            loadJobsFromHRDatabase();
        }
    } else {
        window.location.href = "index.html";
    }
});

// --- 2. FETCH JOBS POSTED BY HR FROM "Jobs" COLLECTION ---
async function loadJobsFromHRDatabase() {
    try {
        const container = document.getElementById('jobs-container');
        if(!container) return;

        // HR portal "Jobs" (Capital 'J') collection mein data save kar raha hai
        // Hum filter laga rahe hain: Status 'Active' ho aur Target Campus 'YCCE' ya 'All India' ho
        const q = query(
            collection(db, "Jobs"), 
            where("status", "==", "Active")
        );

        const querySnapshot = await getDocs(q);
        jobs = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // COLLEGE FILTER LOGIC: 
            // Agar HR ne specifically YCCE ke liye dala hai ya Open Hiring hai
            if (data.targetCampus === "YCCE" || data.targetCampus === "All India" || data.targetCampus === userProfile.college) {
                jobs.push({ 
                    id: doc.id, 
                    title: data.jobTitle,
                    company: data.companyName || "BridgeAI Partner",
                    skills: data.requiredSkills,
                    degree: data.targetCampus,
                    package: `₹${data.salaryLPA} LPA`,
                    location: data.location,
                    desc: data.aiPrompt, // HR ka AI Instruction
                    minAiScore: data.passingScore || 70
                });
            }
        });

        renderJobs();
    } catch (error) {
        console.error("HR Database Fetch Error:", error);
    }
}

function renderJobs() {
    const container = document.getElementById('jobs-container');
    if(!container) return;
    container.innerHTML = "";
    
    if(jobs.length === 0) {
        container.innerHTML = `<div class="col-span-full py-10 text-center text-slate-500">No active jobs found for your campus (YCCE) yet.</div>`;
        return;
    }

    [...jobs].reverse().forEach(job => {
        container.innerHTML += `
            <div class="glass-card p-6 flex flex-col justify-between h-full border-t-4 border-brand-500">
                <div>
                    <div class="flex justify-between items-start mb-4">
                        <div class="w-12 h-12 bg-slate-100 text-brand-600 rounded-xl flex items-center justify-center text-xl shadow-sm"><i class="fas fa-briefcase"></i></div>
                        <span class="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Live Post</span>
                    </div>
                    <h3 class="text-xl font-bold text-slate-900 mb-1">${job.title}</h3>
                    <p class="text-brand-600 font-bold text-sm mb-4 uppercase">${job.company}</p>
                    
                    <div class="space-y-2 text-sm text-slate-600 mb-6">
                        <p class="flex items-center gap-2"><i class="fas fa-map-marker-alt w-5 text-slate-400 text-center"></i> ${job.location}</p>
                        <p class="flex items-center gap-2"><i class="fas fa-money-bill-wave w-5 text-slate-400 text-center"></i> ${job.package}</p>
                        <p class="flex items-center gap-2"><i class="fas fa-graduation-cap w-5 text-slate-400 text-center"></i> ${job.degree}</p>
                    </div>
                </div>
                <button onclick="viewJob('${job.id}')" class="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-brand-600 transition shadow-md">View Details</button>
            </div>
        `;
    });
}

window.viewJob = function(id) {
    selectedJob = jobs.find(j => j.id === id);
    if(!selectedJob) return;

    document.getElementById('m-title').innerText = selectedJob.title;
    document.getElementById('m-company').innerText = selectedJob.company;
    document.getElementById('m-package').innerText = selectedJob.package;
    document.getElementById('m-location').innerText = selectedJob.location;
    document.getElementById('m-degree').innerText = selectedJob.degree;
    document.getElementById('m-skills').innerText = selectedJob.skills;
    document.getElementById('m-desc').innerText = selectedJob.desc;
    
    document.getElementById('jobModal').style.display = 'flex';
}

window.closeModal = function() { 
    document.getElementById('jobModal').style.display = 'none'; 
}

window.applyForJob = async function() {
    if (!currentUser || !selectedJob) return alert("System Error: Re-login and try.");

    try {
        // Assessment shuru karne se pehle current job ki details user doc mein save karte hain
        await setDoc(doc(db, "users", currentUser.uid), { 
            currentApplyingJob: selectedJob,
            assessmentStarted: true 
        }, { merge: true });

        window.location.href = "job-interview.html"; 
    } catch(e) {
        alert("Connection Error. Try again.");
    }
}
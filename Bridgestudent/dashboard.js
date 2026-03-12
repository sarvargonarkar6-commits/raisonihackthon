import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let myRealityChart;

// --- Helper: Get Local Date String (YYYY-MM-DD) to fix timezone bugs ---
function getLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

document.addEventListener("DOMContentLoaded", () => {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
    
    if(document.getElementById('greeting')) {
        document.getElementById('greeting').innerText = greeting;
    }

    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    if(document.getElementById('date-display')) {
        document.getElementById('date-display').innerText = new Date().toLocaleDateString('en-US', options).toUpperCase();
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);
            
            let profileData = {};
            
            // SIRF FIREBASE SE DATA LO, LOCALSTORAGE HATA DIYA
            if (docSnap.exists()) {
                profileData = docSnap.data();
            } else {
                profileData = { name: user.displayName || "Student", activityLog: {} };
            }

            // --- HEATMAP & STREAK LOGIC (Firebase Only) ---
            const todayKey = getLocalDateString(new Date());
            let activityLog = profileData.activityLog || {};
            
            // Add +1 activity for today
            activityLog[todayKey] = (activityLog[todayKey] || 0) + 1;
            
            // Background me Firebase update kar do
            await setDoc(userRef, { activityLog: activityLog }, { merge: true });
            profileData.activityLog = activityLog;
            // -----------------------------------------------------
            
            renderDashboard(profileData, user);
            generateHeatmap(activityLog); 
            calculateStreak(activityLog); 
        } catch (error) {
            console.error("Error fetching Firestore data:", error);
            // Agar internet issue ho, toh khali page na dikhe isliye basic render
            renderDashboard({ name: user.displayName || "Student" }, user);
        }
    } else {
        // Redirect if not logged in
        window.location.href = "index.html";
    }
});

// Calculate Actual Streak from Activity Log
function calculateStreak(activityLog) {
    if(!document.getElementById('user-streak')) return;
    
    let streak = 0;
    let current = new Date();
    
    // Pehle aaj check karo
    let todayKey = getLocalDateString(current);
    
    if (activityLog[todayKey]) {
        streak = 1;
        current.setDate(current.getDate() - 1);
    } else {
        // Agar aaj activity nahi hai, kal check karo (streak nahi tuti hogi)
        current.setDate(current.getDate() - 1);
        if (!activityLog[getLocalDateString(current)]) {
            document.getElementById('user-streak').innerHTML = `<i class="fas fa-fire"></i> 0 Day Streak`;
            return;
        }
    }

    // Piche jaate hue consecutive days count karo
    while (true) {
        let dateKey = getLocalDateString(current);
        if (activityLog[dateKey]) {
            streak++;
            current.setDate(current.getDate() - 1);
        } else {
            break;
        }
    }
    document.getElementById('user-streak').innerHTML = `<i class="fas fa-fire"></i> ${streak} Day Streak`;
}

function renderDashboard(profile, authUser) {
    const fullName = profile.name || authUser.displayName || "Student";
    const firstName = fullName.split(' ')[0];
    
    if(document.getElementById('user-name')) document.getElementById('user-name').innerText = firstName;
    if(document.getElementById('dropdown-name')) document.getElementById('dropdown-name').innerText = fullName;

    // SIRF FIREBASE KI PHOTO URL LO
    const savedProfilePic = profile.photoURL;
    const imgContainer = document.getElementById('nav-profile-img-container');
    if (imgContainer) {
        if (savedProfilePic) {
            imgContainer.innerHTML = `<img src="${savedProfilePic}" alt="Profile" class="w-full h-full object-cover">`;
        } else {
            // Agar firebase me photo nahi hai, toh default icon dikhao
            imgContainer.innerHTML = `<i class="fas fa-user"></i>`;
        }
    }

    let userCgpa = parseFloat(profile.cgpa) || 0.0;
    if(profile.cgpa && document.getElementById('stat-cgpa')) {
        document.getElementById('stat-cgpa').innerHTML = `${profile.cgpa} <span class="text-xs text-slate-400 font-medium">CGPA</span>`;
    } else if (document.getElementById('stat-cgpa')) {
        document.getElementById('stat-cgpa').innerHTML = `0.0 <span class="text-xs text-slate-400 font-medium">CGPA</span>`;
    }

    // SIRF FIREBASE KA AI SCORE (LocalStorage Removed completely)
    const aiScoreRaw = profile.aiScore || 0;
    const aiScore = parseInt(aiScoreRaw);
    let aiBadge = aiScore >= 80 ? "Excellent" : (aiScore >= 60 ? "Good" : (aiScore > 0 ? "Needs Work" : "Not Taken"));
    let aiColor = aiScore >= 80 ? "green" : (aiScore >= 60 ? "blue" : (aiScore > 0 ? "red" : "slate"));
    
    if(document.getElementById('stat-ai-score')) {
        document.getElementById('stat-ai-score').innerHTML = `${aiScore}% <span class="text-[10px] sm:text-xs text-${aiColor}-600 bg-${aiColor}-50 px-1.5 py-0.5 rounded font-medium ml-1">${aiBadge}</span>`;
    }

    let atsScore = calculateATS(profile);
    let atsBadge = atsScore >= 80 ? "Strong" : (atsScore >= 60 ? "Average" : "Weak");
    let atsColor = atsScore >= 80 ? "green" : (atsScore >= 60 ? "indigo" : "red");
    
    if(document.getElementById('stat-ats-score')) {
        document.getElementById('stat-ats-score').innerHTML = `${atsScore}% <span class="text-[10px] sm:text-xs text-${atsColor}-600 bg-${atsColor}-50 px-1.5 py-0.5 rounded font-medium ml-1">${atsBadge}</span>`;
    }

    let calculatedRank = profile.campusRank;
    if (!calculatedRank) {
        if (aiScore === 0) calculatedRank = "-";
        else {
            let combinedScore = (aiScore * 0.6) + ((userCgpa * 10) * 0.4); 
            calculatedRank = Math.max(1, Math.floor(1000 - (combinedScore * 8))); 
        }
    }
    
    // Safely updating Campus Rank
    const trophyIcon = document.querySelector('.fa-trophy');
    if(trophyIcon) {
        const rankCard = trophyIcon.closest('.glass-card') || trophyIcon.closest('.glass-panel');
        if(rankCard) {
            const rankElement = rankCard.querySelector('.text-2xl') || rankCard.querySelector('.text-xl');
            if(rankElement) {
                if(calculatedRank !== "-") {
                     rankElement.innerHTML = `#${calculatedRank} <span class="text-[10px] sm:text-xs text-green-600 font-medium ml-1"><i class="fas fa-arrow-up"></i></span>`;
                } else {
                     rankElement.innerHTML = `N/A <span class="text-[10px] sm:text-xs text-slate-400 font-medium ml-1">Take Interview</span>`;
                }
            }
        }
    }

    updateDynamicLists(profile);
    setTimeout(() => initChart(profile), 100);
}

function generateHeatmap(activityLog) {
    const grid = document.getElementById('heatmap-grid');
    const monthsRow = document.getElementById('heatmap-months');
    if (!grid || !monthsRow) return;

    // Total Days Active count setup
    const totalActiveDays = Object.keys(activityLog).length;
    const headers = document.querySelectorAll('h2');
    headers.forEach(h2 => {
        if (h2.innerText.includes('Learning Consistency')) {
            const p = h2.nextElementSibling;
            if (p && p.tagName === 'P') {
                p.innerHTML = `Total Active Days: <span class="font-bold text-brand-600">${totalActiveDays}</span> • Daily activity monitoring`;
            }
        }
    });

    const weeksToDisplay = 52;
    const daysInWeek = 7;
    const today = new Date();
    
    let html = '';
    let monthHtml = '';
    let lastMonth = -1;

    // Set Start Date to exactly 52 weeks ago, starting on a Monday
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (weeksToDisplay * 7) + 1);
    while(startDate.getDay() !== 1) {
        startDate.setDate(startDate.getDate() - 1);
    }

    for (let i = 0; i < weeksToDisplay; i++) {
        let colHtml = '<div class="heatmap-column">';
        for (let j = 0; j < daysInWeek; j++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + (i * 7) + j);
            
            const dateKey = getLocalDateString(currentDate);
            const activityCount = activityLog[dateKey] || 0; 
            
            let level = 0;
            if(activityCount > 0) level = 1;
            if(activityCount > 2) level = 2;
            if(activityCount > 5) level = 3;
            if(activityCount > 8) level = 4;

            const dateString = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            colHtml += `<div class="heatmap-cell level-${level}" title="${activityCount} activities on ${dateString}"></div>`;
            
            if (j === 0) {
                const currentMonth = currentDate.getMonth();
                if (currentMonth !== lastMonth) {
                    const monthName = currentDate.toLocaleString('default', { month: 'short' });
                    monthHtml += `<span style="width: 15px">${monthName}</span>`;
                    lastMonth = currentMonth;
                } else {
                    monthHtml += `<span style="width: 1px"></span>`;
                }
            }
        }
        colHtml += '</div>';
        html += colHtml;
    }

    grid.innerHTML = html;
    monthsRow.innerHTML = monthHtml;

    // Auto-scroll to the latest date (rightmost)
    setTimeout(() => {
        const scrollContainer = grid.closest('.overflow-x-auto');
        if (scrollContainer) scrollContainer.scrollLeft = scrollContainer.scrollWidth;
    }, 100);
}

function calculateATS(profile) {
    let score = 0; 
    if(profile.name) score += 10;
    if(profile.email) score += 10;
    if(profile.phone) score += 10;
    if(profile.skills && profile.skills.split(',').length >= 3) score += 20;
    // Firebase se URL aayega instead of local storage string
    if(profile.resumeURL || profile.resumeName) score += 20;
    if(profile.github) score += 10;
    if(profile.linkedin) score += 10;
    if(profile.headline && profile.bio) score += 10;
    return Math.min(score, 100);
}

function updateDynamicLists(profile) {
    const headline = profile.headline || 'Software Engineering';
    const primarySkill = profile.skills ? profile.skills.split(',')[0].trim() : 'Tech';
    
    const hackathonContainer = document.getElementById('hackathon-list');
    if (hackathonContainer) {
        hackathonContainer.innerHTML = `
            <div class="border border-gray-100 rounded-lg p-3 hover:bg-slate-50 transition cursor-pointer">
                <div class="flex justify-between items-start mb-1">
                    <h3 class="text-sm font-bold text-slate-800">Global ${headline} Challenge</h3>
                    <span class="text-[10px] bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded">Live Now</span>
                </div>
                <p class="text-xs text-slate-500">Apply your ${primarySkill} skills in this real-world contest.</p>
            </div>
            <div class="border border-gray-100 rounded-lg p-3 hover:bg-slate-50 transition cursor-pointer">
                <div class="flex justify-between items-start mb-1">
                    <h3 class="text-sm font-bold text-slate-800">BridgeAI ${primarySkill} Sprint</h3>
                    <span class="text-[10px] bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded">Next Week</span>
                </div>
                <p class="text-xs text-slate-500">Exclusive hiring sprint tailored for ${headline}s.</p>
            </div>
            <button class="w-full py-2 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-md transition mt-2">View All Events</button>
        `;
    }

    const recoContainer = document.getElementById('recommendations-list');
    if (recoContainer) {
        recoContainer.innerHTML = `
            <li class="flex items-center gap-3 group cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition">
                <div class="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition"><i class="fas fa-sitemap text-xs"></i></div>
                <div>
                    <h4 class="text-sm font-semibold text-slate-800 group-hover:text-brand-600 transition">System Design for ${headline}s</h4>
                    <p class="text-[10px] text-slate-500">Article • Based on your target role</p>
                </div>
            </li>
            <li class="flex items-center gap-3 group cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition">
                <div class="w-8 h-8 rounded bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition"><i class="fas fa-database text-xs"></i></div>
                <div>
                    <h4 class="text-sm font-semibold text-slate-800 group-hover:text-brand-600 transition">Advanced ${primarySkill} Concepts</h4>
                    <p class="text-[10px] text-slate-500">Practice • To improve your AI Score</p>
                </div>
            </li>
        `;
    }
}

// DYNAMIC CHART LOGIC
function initChart(profile) {
    const canvas = document.getElementById('realityChart');
    if(!canvas) return; 
    
    const ctx = canvas.getContext('2d');
    if (myRealityChart) myRealityChart.destroy();

    const gradientBlue = ctx.createLinearGradient(0, 0, 0, 400);
    gradientBlue.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
    gradientBlue.addColorStop(1, 'rgba(59, 130, 246, 0.2)');

    // Fetch skills from user profile (Firebase only)
    let rawSkills = profile.skills ? profile.skills.split(',').map(s => s.trim()).filter(s => s) : [];
    let skillScores = profile.skillScores || {};

    // Top 5-6 skills (If empty, it will be an empty array)
    let chartLabels = rawSkills.slice(0, 6); 

    // Match skills with their scores, default to 0 if not tested
    let chartData = chartLabels.map(skill => {
        let foundKey = Object.keys(skillScores).find(key => key.toLowerCase() === skill.toLowerCase());
        return foundKey ? skillScores[foundKey] : 0; 
    });

    myRealityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels, // Will be empty if no skills
            datasets: [{
                label: 'AI Assessed Score (%)',
                data: chartData, // Will be empty if no skills
                backgroundColor: gradientBlue,
                borderRadius: 6,
                barPercentage: 0.6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    max: 100, 
                    grid: { borderDash: [4, 4], color: '#E2E8F0' },
                    ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 } }
                },
                x: { 
                    grid: { display: false },
                    ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600', size: 10 } }
                }
            }
        }
    });
}

window.logoutUser = () => {
    if(confirm("Are you sure you want to logout?")) {
        signOut(auth).then(() => {
            // Optional: clear localstorage keys manually just to be safe on logout
            localStorage.removeItem('studentProfile');
            localStorage.removeItem('tempProfileImage');
            localStorage.removeItem('aiInterviewScore');
            window.location.href = "index.html"; 
        }).catch((error) => {
            console.error("Logout error", error);
        });
    }
}

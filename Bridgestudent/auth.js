import { auth, db } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Database Check Helper
async function checkUserProfile(user, nameStr) {
    try {
        const userRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
            console.log("User found, going to Dashboard...");
            localStorage.setItem('studentProfile', JSON.stringify(docSnap.data()));
            window.location.href = "dashboard.html";
        } else {
            console.log("New User, creating profile block...");
            const initProfile = { 
                name: nameStr || user.email.split('@')[0], 
                email: user.email, 
                role: 'Student' 
            };
            // Naya data Firebase me add kar rahe hain
            await setDoc(userRef, initProfile);
            localStorage.setItem('studentProfile', JSON.stringify(initProfile));
            
            window.location.href = "profile.html";
        }
    } catch (error) {
        console.error("Database check failed:", error);
        alert("Wait! Database connection error: " + error.message);
    }
}

// Ensure DOM is fully loaded before attaching events
document.addEventListener("DOMContentLoaded", () => {
    // Icons Load
    if(typeof lucide !== 'undefined') lucide.createIcons();

    // ------------------------------------------
    // UI FORM TOGGLE LOGIC
    // ------------------------------------------
    const loginSection = document.getElementById('loginSection');
    const signupSection = document.getElementById('signupSection');
    const title = document.getElementById('formTitle');
    const subtitle = document.getElementById('formSubtitle');

    const btnGoToSignup = document.getElementById('goToSignup');
    const btnGoToLogin = document.getElementById('goToLogin');

    if(btnGoToSignup) {
        btnGoToSignup.addEventListener('click', () => {
            loginSection.classList.remove('active-form');
            loginSection.classList.add('hidden-form');
            signupSection.classList.remove('hidden-form');
            signupSection.classList.add('active-form');
            title.innerText = "Create an account";
            subtitle.innerText = "Start your journey with BridgeAI today.";
        });
    }

    if(btnGoToLogin) {
        btnGoToLogin.addEventListener('click', () => {
            signupSection.classList.remove('active-form');
            signupSection.classList.add('hidden-form');
            loginSection.classList.remove('hidden-form');
            loginSection.classList.add('active-form');
            title.innerText = "Welcome back";
            subtitle.innerText = "Enter your details to access your workspace.";
        });
    }

    // ------------------------------------------
    // SIGNUP LOGIC 
    // ------------------------------------------
    const signupForm = document.getElementById('signupForm');
    if(signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const name = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPass').value;

            // UI Loading State
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Setting up...';
            btn.classList.add('opacity-80', 'cursor-not-allowed');
            btn.disabled = true;

            try {
                // Firebase Sign Up
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Update Display Name
                await updateProfile(user, { displayName: name });
                
                // Go to next step
                await checkUserProfile(user, name);

            } catch (error) {
                console.error("Signup Error:", error);
                // Agar password chota ho ya email already used ho toh alert aayega
                alert("Error: " + error.message);
                
                // Restore Button
                btn.innerHTML = originalText;
                btn.classList.remove('opacity-80', 'cursor-not-allowed');
                btn.disabled = false;
            }
        });
    }

    // ------------------------------------------
    // LOGIN LOGIC 
    // ------------------------------------------
    const loginForm = document.getElementById('loginForm');
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPass').value;

            // UI Loading State
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Authenticating...';
            btn.classList.add('opacity-80', 'cursor-not-allowed');
            btn.disabled = true;

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                await checkUserProfile(userCredential.user, "");

            } catch (error) {
                console.error("Login Error:", error);
                alert("Login Failed: Invalid Email or Password!");
                
                // Restore Button
                btn.innerHTML = originalText;
                btn.classList.remove('opacity-80', 'cursor-not-allowed');
                btn.disabled = false;
            }
        });
    }
});

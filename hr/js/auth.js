// File: js/auth.js

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- Puraana Firebase Config ---
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
// ---------------------------------------------------

// DOM Elements
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authBtn = document.getElementById("auth-btn");
const toggleModeBtn = document.getElementById("toggle-mode"); // Pura paragraph select kiya hai
const formTitle = document.getElementById("form-title");
const errorMsg = document.getElementById("error-msg");

let isLoginMode = true;

// ==========================================
// 1. AUTH STATE OBSERVER (Redirect Logic)
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User logged in, redirecting...");
        // ✅ CORRECT PATH: Folder 'pages' ke andar dashboard hai
        window.location.href = "pages/dashboard.html"; 
    }
});

// ==========================================
// 2. TOGGLE LOGIN / SIGNUP MODE
// ==========================================
if (toggleModeBtn) {
    toggleModeBtn.addEventListener("click", (e) => {
        // Check karte hain ki kya user ne "Sign up/Login" text (span) par click kiya?
        if (e.target.tagName === 'SPAN') {
            isLoginMode = !isLoginMode;
            errorMsg.innerText = ""; // Purani errors saaf karo
            
            if (isLoginMode) {
                // Login Mode UI
                formTitle.innerText = "HR Login";
                authBtn.innerHTML = `<span>Login</span> <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>`;
                toggleModeBtn.innerHTML = `Don't have an account? <span class="text-brand-600 font-extrabold hover:text-brand-700 cursor-pointer transition-colors ml-1">Sign up</span>`;
            } else {
                // Signup Mode UI
                formTitle.innerText = "Create Account";
                authBtn.innerHTML = `<span>Sign Up</span> <i class="fas fa-user-plus text-xs group-hover:translate-x-1 transition-transform"></i>`;
                toggleModeBtn.innerHTML = `Already have an account? <span class="text-brand-600 font-extrabold hover:text-brand-700 cursor-pointer transition-colors ml-1">Login</span>`;
            }
        }
    });
}

// ==========================================
// 3. HANDLE BUTTON CLICK (Login/Signup)
// ==========================================
if (authBtn) {
    authBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            errorMsg.innerText = "Please enter both email and password.";
            return;
        }

        // Button Loading State
        const originalBtnText = authBtn.innerHTML;
        authBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Processing...`;
        authBtn.disabled = true;
        errorMsg.innerText = "";

        try {
            if (isLoginMode) {
                // --- LOGIN ---
                await signInWithEmailAndPassword(auth, email, password);
                // Redirect onAuthStateChanged handle karega
            } else {
                // --- SIGNUP ---
                await createUserWithEmailAndPassword(auth, email, password);
                // Redirect onAuthStateChanged handle karega
            }
        } catch (error) {
            console.error("Auth Error:", error);
            
            // Error Messages ko saaf dikhana
            if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found") {
                errorMsg.innerText = "Email ya Password galat hai.";
            } else if (error.code === "auth/email-already-in-use") {
                errorMsg.innerText = "Ye Email pehle se registered hai. Login karein.";
            } else if (error.code === "auth/weak-password") {
                errorMsg.innerText = "Password kam se kam 6 characters ka rakhein.";
            } else {
                errorMsg.innerText = error.message;
            }

            // Button Reset (Error aane par wapas purana button lao)
            authBtn.disabled = false;
            authBtn.innerHTML = originalBtnText;
        }
    });
}

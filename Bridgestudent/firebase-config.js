// firebase-config.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider };

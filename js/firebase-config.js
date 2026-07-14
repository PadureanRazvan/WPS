// js/firebase-config.js

// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import { getFirebaseConfig, getFirebaseEnvironmentName } from './firebase-environments.js';

export const firebaseEnvironment = getFirebaseEnvironmentName();
const environmentConfig = getFirebaseConfig(firebaseEnvironment);
const { appCheckSiteKey, ...firebaseConfig } = environmentConfig;

console.info(`[Firebase] Using ${firebaseEnvironment} project: ${firebaseConfig.projectId}`);

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// App Check is activated once the public reCAPTCHA Enterprise site key is configured.
if (appCheckSiteKey) {
    initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true
    });
}

// Initialize Cloud Firestore
export const db = getFirestore(app);

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const functions = getFunctions(app, 'europe-west8');
export { signInWithPopup, signOut, onAuthStateChanged };

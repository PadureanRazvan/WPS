// Authentication can become ready without downloading the workforce data SDKs.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js';
import { getFirebaseConfig, getFirebaseEnvironmentName } from './firebase-environments.js';

export const firebaseEnvironment = getFirebaseEnvironmentName();
const { appCheckSiteKey, ...firebaseConfig } = getFirebaseConfig(firebaseEnvironment);
export const app = initializeApp(firebaseConfig);
if (appCheckSiteKey) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export { signInWithPopup, signOut, onAuthStateChanged };
console.info(`[Firebase] Using ${firebaseEnvironment} project: ${firebaseConfig.projectId}`);

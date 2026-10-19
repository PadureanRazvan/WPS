// The session owns the single Firebase app and its original App Check policy.
import { app } from './firebase-session.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
export { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, firebaseEnvironment } from './firebase-session.js';
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west8');

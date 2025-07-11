// js/firebase-config.js

// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCZqJeajOlCekhzXgHAhf4ZIpCMKJxW8qs",
  authDomain: "wps-sherpa-database.firebaseapp.com",
  projectId: "wps-sherpa-database",
  storageBucket: "wps-sherpa-database.appspot.com",
  messagingSenderId: "897978989234",
  appId: "1:897978989234:web:f2869963eb261af70ce7ab",
  measurementId: "G-NBPVK629X4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// === THIS IS THE CORRECT CODE ===
// Initialize Cloud Firestore, get a reference to the service,
// and export it so other files can import and use it.
export const db = getFirestore(app);
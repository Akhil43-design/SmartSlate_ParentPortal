/* Shared Firebase Configuration & Client Initialization */

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBOgNWBVqSYfMypeZS8NwRLOYpq7DY3-ls",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "smartslate-bd117.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "smartslate-bd117",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "smartslate-bd117.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "352727705984",
    appId: process.env.FIREBASE_APP_ID || "1:352727705984:web:dd0876229378cd82deb965",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-BJ6ET2BPNF"
};

module.exports = { firebaseConfig };

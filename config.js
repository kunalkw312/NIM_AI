// config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: Replace with your actual Firebase Project Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDTSqJMQHY_m2RNZ1bd1T7c6EDwK5Mg824",
  authDomain: "nim-ai-312.firebaseapp.com",
  databaseURL: "https://nim-ai-312-default-rtdb.firebaseio.com",
  projectId: "nim-ai-312",
  storageBucket: "nim-ai-312.firebasestorage.app",
  messagingSenderId: "262868092330",
  appId: "1:262868092330:web:7c1edc6173900f16fa17d3",
  measurementId: "G-LHPE6P5JMY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

export { db };

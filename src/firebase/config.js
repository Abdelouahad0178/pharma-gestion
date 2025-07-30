import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ⚠️ Remplace par ta propre configuration Firebase :
const firebaseConfig = {
 apiKey: "AIzaSyBHQSPXwED7W-FQMMs1D-OZcjW-5AP8A-w",
  authDomain: "anapharmo.firebaseapp.com",
  projectId: "anapharmo",
  storageBucket: "anapharmo.firebasestorage.app",
  messagingSenderId: "1097322827362",
  appId: "1:1097322827362:web:fd19a67d9af135dcbf4b3b",
  measurementId: "G-JX6HCRX075"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

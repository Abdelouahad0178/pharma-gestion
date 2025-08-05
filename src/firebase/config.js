import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Ta configuration Firebase (ne partage jamais ça publiquement !)
export const firebaseConfig = { // <= EXPORT AJOUTÉ
  apiKey: "AIzaSyBHQSPXwED7W-FQMMs1D-OZcjW-5AP8A-w",
  authDomain: "anapharmo.firebaseapp.com",
  projectId: "anapharmo",
  storageBucket: "anapharmo.appspot.com", // <= .appspot.com pour Firestore/Storage !
  messagingSenderId: "1097322827362",
  appId: "1:1097322827362:web:fd19a67d9af135dcbf4b3b",
  measurementId: "G-JX6HCRX075"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;

// src/firebase/config.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  // optional: connectAuthEmulator,
} from "firebase/auth";
import {
  initializeFirestore,
  // Persistance locale (IndexedDB)
  persistentLocalCache,
  persistentMultipleTabManager,
  // Fallback en mémoire si IndexedDB indisponible
  memoryLocalCache,
  // optional: connectFirestoreEmulator,
} from "firebase/firestore";

// ⚠️ Clés client Firebase = publiques par conception (OK côté web)
export const firebaseConfig = {
  apiKey: "AIzaSyBHQSPXwED7W-FQMMs1D-OZcjW-5AP8A-w",
  authDomain: "anapharmo.firebaseapp.com",
  projectId: "anapharmo",
  storageBucket: "anapharmo.appspot.com",
  messagingSenderId: "1097322827362",
  appId: "1:1097322827362:web:fd19a67d9af135dcbf4b3b",
  measurementId: "G-JX6HCRX075",
};

const app = initializeApp(firebaseConfig);

/* --------------------------
   AUTH avec persistance locale
--------------------------- */
export const auth = getAuth(app);
auth.useDeviceLanguage?.();

// Force la persistance "locale" (survit au refresh/reload)
setPersistence(auth, browserLocalPersistence).catch((err) => {
  // En cas d'environnement exotique, on ne bloque pas l'app
  console.warn("[auth] setPersistence failed:", err);
});

/* --------------------------
   FIRESTORE avec cache persistant
   + fallback mémoire si IndexedDB KO
--------------------------- */
let db;
try {
  // Persistance IndexedDB + gestion multi-onglets
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    // Si vous avez des websockets bloqués par le réseau, décommentez:
    // experimentalForceLongPolling: true,
  });
} catch (e) {
  console.warn(
    "[firestore] persistentLocalCache indisponible, fallback mémoire:",
    e?.message || e
  );
  db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    // experimentalForceLongPolling: true,
  });
}

export { db };
export default app;

/* -----------------------------------------
   (Optionnel) Emulators pour dev local
------------------------------------------ */
// if (import.meta?.env?.VITE_USE_EMULATORS === "true") {
//   connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
//   connectFirestoreEmulator(db, "localhost", 8080);
// }

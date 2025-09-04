// src/firebase/config.js
/* eslint-disable no-console */
import { initializeApp, getApps, getApp } from "firebase/app";

import {
  // Auth
  initializeAuth,
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver, // ✅ resolver pour popup/redirect/getRedirectResult
} from "firebase/auth";

import {
  // Firestore
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  enableNetwork as fsEnableNetwork,
  disableNetwork as fsDisableNetwork,
} from "firebase/firestore";

/* =========================================
   🔐 Config Firebase (clés côté client OK)
   - Possibilité d'override de authDomain :
     1) window.__AUTH_DOMAIN__
     2) import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
     3) fallback (anapharmo.firebaseapp.com)
========================================= */
function resolveAuthDomain() {
  try {
    if (typeof window !== "undefined" && window.__AUTH_DOMAIN__) {
      return String(window.__AUTH_DOMAIN__);
    }
  } catch {}
  try {
    // Vite / CRA (avec plugin env) → adapter si besoin
    const v = import.meta?.env?.VITE_FIREBASE_AUTH_DOMAIN;
    if (v) return String(v);
  } catch {}
  return "anapharmo.firebaseapp.com";
}

export const firebaseConfig = {
  apiKey: "AIzaSyBHQSPXwED7W-FQMMs1D-OZcjW-5AP8A-w",
  authDomain: resolveAuthDomain(),
  projectId: "anapharmo",
  storageBucket: "anapharmo.appspot.com",
  messagingSenderId: "1097322827362",
  appId: "1:1097322827362:web:fd19a67d9af135dcbf4b3b",
  measurementId: "G-JX6HCRX075",
};

if (typeof window !== "undefined") {
  console.log("[firebase] authDomain utilisé:", firebaseConfig.authDomain);
}

/* =========================================
   ⚙️ App: idempotent (anti re-init / HMR)
========================================= */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* =========================================
   🔑 Auth avec persistance + resolver Google
   - initializeAuth (meilleur contrôle)
   - fallback getAuth + setPersistence
   - export authReady pour await avant login
========================================= */
let auth;
let authReady;

try {
  // initializeAuth lève si déjà initialisé (HMR) → try/catch
  auth = initializeAuth(app, {
    // Ordre de fallback: IndexedDB → LocalStorage
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    // ✅ indispensable pour signInWithRedirect / getRedirectResult
    //   (et pour signInWithPopup si tu le réactives plus tard)
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  authReady = Promise.resolve();
} catch (e) {
  // Déjà initialisé → réutiliser l'instance
  auth = getAuth(app);
  // S'assurer d'une persistance minimale
  authReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("[auth] setPersistence failed:", err?.message || err);
  });
}

auth.useDeviceLanguage?.();

/* =========================================
   🔥 Firestore avec cache persistant
   - AutoDetect long-polling (utile si websockets bloqués)
   - Fallback mémoire si IndexedDB indisponible
   - Idempotent via drapeau pour éviter double init
========================================= */
const FIRESTORE_INIT_FLAG = "__fs_inited__";
let db;
let persistenceEnabled = false;

function initFirestoreWith(options) {
  return initializeFirestore(app, {
    ...options,
    // Réseau capricieux (proxy/4G) → aide à se connecter
    experimentalAutoDetectLongPolling: true,
    // Pour forcer si besoin :
    // experimentalForceLongPolling: true,
  });
}

try {
  if (!app[FIRESTORE_INIT_FLAG]) {
    db = initFirestoreWith({
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
    app[FIRESTORE_INIT_FLAG] = true;
    persistenceEnabled = true;
    console.log("[firestore] Persistance IndexedDB + multi-onglets activée");
  } else {
    // ✅ Déjà initialisé (HMR) → réutiliser
    db = getFirestore(app);
  }
} catch (e) {
  console.warn("[firestore] IndexedDB indisponible, fallback mémoire:", e?.message || e);
  try {
    db = initFirestoreWith({ localCache: memoryLocalCache() });
    console.log("[firestore] Fallback mémoire activé");
  } catch (fallbackError) {
    console.error("[firestore] Échec initialisation Firestore:", fallbackError);
    throw fallbackError;
  }
}

/* =========================================
   🌐 Gestion réseau / Offline
========================================= */
let isOnlineState =
  typeof navigator !== "undefined" && "onLine" in navigator ? navigator.onLine : true;

const networkListeners = new Set();

/** Écoute les changements d’état réseau */
export function onNetworkStateChange(callback) {
  networkListeners.add(callback);
  return () => networkListeners.delete(callback);
}

function notifyNetworkStateChange(isOnline) {
  isOnlineState = isOnline;
  for (const cb of networkListeners) {
    try {
      cb(isOnline);
    } catch (err) {
      console.warn("[network] Listener error:", err);
    }
  }
}

/** Utilitaire: promesse résolue dès qu’on est en ligne */
export function whenOnline(timeoutMs = 15000) {
  if (isOnlineState) return Promise.resolve(true);
  return new Promise((resolve) => {
    let resolved = false;
    const onUp = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(true);
      }
    };
    const cleanup = () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onUp);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onUp, { once: true });
    }
    if (timeoutMs > 0) {
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, timeoutMs);
    }
  });
}

export function isOnline() {
  return isOnlineState;
}
export function isOffline() {
  return !isOnlineState;
}

/** Firestore: activer/désactiver le réseau explicitement */
export async function enableFirestoreNetwork() {
  try {
    await fsEnableNetwork(db);
    console.log("[firestore] Réseau activé");
    return true;
  } catch (error) {
    console.warn("[firestore] enableNetwork a échoué:", error);
    return false;
  }
}
export async function disableFirestoreNetwork() {
  try {
    await fsDisableNetwork(db);
    console.log("[firestore] Réseau désactivé");
    return true;
  } catch (error) {
    console.warn("[firestore] disableNetwork a échoué:", error);
    return false;
  }
}

/* Attache les listeners navigateur (idempotent) */
if (typeof window !== "undefined" && !window.__NET_LISTENERS_ATTACHED__) {
  window.addEventListener("online", () => {
    console.log("[network] Connexion rétablie");
    notifyNetworkStateChange(true);
    enableFirestoreNetwork();
  });

  window.addEventListener("offline", () => {
    console.log("[network] Connexion perdue (offline)");
    notifyNetworkStateChange(false);
    // Firestore reste accessible via cache
  });

  window.__NET_LISTENERS_ATTACHED__ = true;
}

/* =========================================
   🧰 Utilitaires persistance & cache
========================================= */
export function isPersistenceEnabled() {
  return persistenceEnabled;
}

export async function getCacheSize() {
  if (typeof navigator?.storage?.estimate === "function") {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      return {
        used,
        available: quota,
        usedMB: (used / (1024 * 1024)).toFixed(2),
        availableMB: (quota / (1024 * 1024)).toFixed(2),
      };
    } catch (error) {
      console.warn("[storage] Estimation indisponible:", error);
    }
  }
  return null;
}

/**
 * Nettoyer le cache du navigateur (optionnel)
 * @param {Object} options
 *  - skipConfirmation: ne pas afficher confirm()
 *  - onlyBackups: vider uniquement les sauvegardes locales (localStorage)
 *  - onProgress: (pct, msg) => void
 */
export async function clearCache(options = {}) {
  const { skipConfirmation = false, onlyBackups = false, onProgress = null } = options;

  // Confirmation simple (si UI dispo)
  if (!skipConfirmation && typeof window !== "undefined" && window.confirm) {
    const ok = window.confirm("Vider le cache local ? Les données non synchronisées seront perdues.");
    if (!ok) return false;
  }

  try {
    if (onProgress) onProgress(0, "Démarrage du nettoyage...");

    if (onlyBackups) {
      const keys = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("backup_") || k === "backups_list")) {
            keys.push(k);
          }
        }
        keys.forEach((k) => localStorage.removeItem(k));
        if (onProgress) onProgress(100, "Backups supprimés");
        console.log("[cache] Backups locaux supprimés");
        return true;
      } catch (err) {
        console.error("[cache] Erreur suppression backups:", err);
        return false;
      }
    }

    let step = 0;
    const totalSteps = 4;

    // 1) Désactiver réseau Firestore (évite bruits)
    if (onProgress) onProgress((++step / totalSteps) * 100, "Pause réseau...");
    try {
      await fsDisableNetwork(db);
    } catch (err) {
      console.warn("[cache] disableNetwork:", err);
    }

    // 2) Vider caches PWA (si présents)
    if (onProgress) onProgress((++step / totalSteps) * 100, "Caches navigateur...");
    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const names = await caches.keys();
        await Promise.all(
          names.map(async (name) => {
            try {
              return await caches.delete(name);
            } catch (err) {
              console.warn(`[cache] Suppression ${name} impossible:`, err);
              return false;
            }
          })
        );
      } catch (err) {
        console.warn("[cache] Erreur suppression caches:", err);
      }
    }

    // 3) Vider sauvegardes locales (localStorage)
    if (onProgress) onProgress((++step / totalSteps) * 100, "Sauvegardes locales...");
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("backup_") || k === "backups_list")) {
          keys.push(k);
        }
      }
      keys.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch (err) {
          console.warn(`[cache] Impossible de supprimer ${k}:`, err);
        }
      });
    } catch (err) {
      console.warn("[cache] Erreur localStorage:", err);
    }

    // 4) Réactiver réseau Firestore
    if (onProgress) onProgress((++step / totalSteps) * 100, "Réactivation réseau...");
    try {
      await fsEnableNetwork(db);
    } catch (err) {
      console.warn("[cache] enableNetwork:", err);
    }

    if (onProgress) onProgress(100, "Nettoyage terminé");
    console.log("[cache] Cache vidé avec succès");
    return true;
  } catch (error) {
    console.error("[cache] Échec nettoyage:", error);
    try {
      await fsEnableNetwork(db);
    } catch (e2) {
      console.error("[cache] Impossible de réactiver le réseau:", e2);
    }
    return false;
  }
}

/* =========================================
   🩺 Monitoring basique des erreurs réseau
========================================= */
export function monitorConnectionErrors() {
  if (console.__patchedForNetwork__) return;
  const originalError = console.error;
  console.error = (...args) => {
    try {
      const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      if (
        msg.includes("auth/network-request-failed") ||
        msg.includes("unavailable") ||
        msg.includes("deadline-exceeded") ||
        msg.includes("network-request-failed")
      ) {
        // Bascule état offline (utile pour UI)
        notifyNetworkStateChange(false);
      }
    } catch {
      /* ignore JSON stringify issues */
    } finally {
      originalError.apply(console, args);
    }
  };
  console.__patchedForNetwork__ = true;
}

// Auto-start monitoring
monitorConnectionErrors();

/* =========================================
   🚀 État initial
========================================= */
(async () => {
  // Attendre persistance Auth (plus propre)
  try {
    await authReady;
  } catch (_) {
    /* ignore */
  }

  // Si on démarre online → activer réseau Firestore
  if (isOnlineState) {
    try {
      await fsEnableNetwork(db);
    } catch (e) {
      console.warn("[init] enableNetwork au démarrage a échoué:", e);
    }
  } else {
    console.log("[init] Démarrage en mode offline");
  }

  // Diagnostic stockage (non bloquant)
  setTimeout(async () => {
    const est = await getCacheSize();
    if (est) {
      console.log("[storage] Utilisé:", est.usedMB, "MB /", est.availableMB, "MB");
    }
  }, 2000);
})();

/* =========================================
   📦 Exports principaux
========================================= */
export { db, auth, authReady };
export default app;

/* eslint-disable no-console */
import { initializeApp, getApps, getApp } from "firebase/app";

import {
  // Auth
  initializeAuth,
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
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
========================================= */
function resolveAuthDomain() {
  try {
    if (typeof window !== "undefined" && window.__AUTH_DOMAIN__) {
      return String(window.__AUTH_DOMAIN__);
    }
  } catch {}
  try {
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
   🔑 Auth (singleton, persistance ordonnée)
========================================= */
let auth;
let authReady;

try {
  // initializeAuth doit être appelé au plus 1 fois
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  authReady = Promise.resolve();
} catch {
  // Déjà initialisé → réutiliser
  auth = getAuth(app);
  // S’assurer d’une persistance minimale
  authReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("[auth] setPersistence failed:", err?.message || err);
  });
}

auth.useDeviceLanguage?.();

/* =========================================
   🔥 Firestore (singleton strict)
   - Un seul initializeFirestore
   - Persistance IndexedDB + multi-onglets
   - Fallback mémoire si besoin
========================================= */
const DB_SINGLETON_KEY = "__FS_DB_SINGLETON__";
const FIRESTORE_INIT_FLAG = "__FS_INITED__";

let db;
let persistenceEnabled = false;

function initFirestoreWith(options) {
  return initializeFirestore(app, {
    ...options,
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
    // experimentalForceLongPolling: true, // à activer si réseau très capricieux
  });
}

try {
  if (app[DB_SINGLETON_KEY]) {
    // ✅ Déjà initialisé (HMR/SSR)
    db = app[DB_SINGLETON_KEY];
  } else {
    // Première init
    db = initFirestoreWith({
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
    app[DB_SINGLETON_KEY] = db;
    app[FIRESTORE_INIT_FLAG] = true;
    persistenceEnabled = true;
    console.log("[firestore] Persistance IndexedDB + multi-onglets activée");
  }
} catch (e) {
  console.warn("[firestore] IndexedDB indisponible, fallback mémoire:", e?.message || e);
  try {
    // ⚠️ Fallback mémoire: pas de persistance entre sessions
    db = initFirestoreWith({ localCache: memoryLocalCache() });
    app[DB_SINGLETON_KEY] = db;
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

export function isOnline() {
  return isOnlineState;
}
export function isOffline() {
  return !isOnlineState;
}

/** Firestore: activer/désactiver le réseau explicitement */
let enableNetOnce = null;
export async function enableFirestoreNetwork() {
  try {
    if (!enableNetOnce) enableNetOnce = fsEnableNetwork(db).catch(() => {});
    await enableNetOnce;
    console.log("[firestore] Réseau activé");
    return true;
  } catch (error) {
    console.warn("[firestore] enableNetwork a échoué:", error);
    return false;
  }
}
export async function disableFirestoreNetwork() {
  try {
    // On ne met PAS de memo ici ; on veut forcer réellement le disable
    await fsDisableNetwork(db);
    // Reset le memo pour pouvoir réactiver plus tard
    enableNetOnce = null;
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
      // reset pour une future réactivation propre
      enableNetOnce = null;
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
      await enableFirestoreNetwork();
    } catch (err) {
      console.warn("[cache] enableNetwork:", err);
    }

    if (onProgress) onProgress(100, "Nettoyage terminé");
    console.log("[cache] Cache vidé avec succès");
    return true;
  } catch (error) {
    console.error("[cache] Échec nettoyage:", error);
    try {
      await enableFirestoreNetwork();
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
      const msg = args
        .map((a) => {
          try {
            return typeof a === "string" ? a : JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" ");
      if (
        msg.includes("auth/network-request-failed") ||
        msg.includes("unavailable") ||
        msg.includes("deadline-exceeded") ||
        msg.includes("network-request-failed")
      ) {
        notifyNetworkStateChange(false);
      }
    } catch {
      /* ignore */
    } finally {
      originalError.apply(console, args);
    }
  };
  console.__patchedForNetwork__ = true;
}

// Auto-start monitoring (idempotent)
monitorConnectionErrors();

/* =========================================
   🚀 État initial
========================================= */
(async () => {
  try {
    await authReady;
  } catch (_) {}

  // Active le réseau une seule fois (memoisé)
  if (isOnlineState) {
    try {
      await enableFirestoreNetwork();
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

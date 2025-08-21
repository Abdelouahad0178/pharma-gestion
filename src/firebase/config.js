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
  // Gestion réseau pour mode offline
  enableNetwork,
  disableNetwork,
  // Utilitaires
  onSnapshot,
  enableIndexedDbPersistence,
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
let persistenceEnabled = false;

try {
  // Persistance IndexedDB + gestion multi-onglets
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    // Si vous avez des websockets bloqués par le réseau, décommentez:
    // experimentalForceLongPolling: true,
  });
  persistenceEnabled = true;
  console.log("[firestore] Persistance locale activée avec multi-onglets");
} catch (e) {
  console.warn(
    "[firestore] persistentLocalCache indisponible, fallback mémoire:",
    e?.message || e
  );
  try {
    db = initializeFirestore(app, {
      localCache: memoryLocalCache(),
      // experimentalForceLongPolling: true,
    });
    console.log("[firestore] Fallback mémoire activé");
  } catch (fallbackError) {
    console.error("[firestore] Impossible d'initialiser Firestore:", fallbackError);
    throw fallbackError;
  }
}

/* --------------------------
   Gestion réseau et offline
--------------------------- */

// État de connexion
let isOnlineState = navigator.onLine;
let networkListeners = new Set();

// Fonction pour écouter les changements d'état réseau
export function onNetworkStateChange(callback) {
  networkListeners.add(callback);
  
  // Retourner une fonction de nettoyage
  return () => {
    networkListeners.delete(callback);
  };
}

// Notifier tous les listeners des changements d'état
function notifyNetworkStateChange(isOnline) {
  isOnlineState = isOnline;
  networkListeners.forEach(callback => {
    try {
      callback(isOnline);
    } catch (error) {
      console.warn("Erreur dans listener réseau:", error);
    }
  });
}

// Écouter les événements réseau du navigateur
window.addEventListener('online', () => {
  console.log("[network] Connexion rétablie");
  notifyNetworkStateChange(true);
  enableFirestoreNetwork();
});

window.addEventListener('offline', () => {
  console.log("[network] Connexion perdue - mode offline");
  notifyNetworkStateChange(false);
});

// Fonctions de gestion réseau Firestore
export async function enableFirestoreNetwork() {
  try {
    await enableNetwork(db);
    console.log("[firestore] Réseau activé");
    return true;
  } catch (error) {
    console.warn("[firestore] Impossible d'activer le réseau:", error);
    return false;
  }
}

export async function disableFirestoreNetwork() {
  try {
    await disableNetwork(db);
    console.log("[firestore] Réseau désactivé");
    return true;
  } catch (error) {
    console.warn("[firestore] Impossible de désactiver le réseau:", error);
    return false;
  }
}

// Vérifier l'état de connexion
export function isOnline() {
  return isOnlineState;
}

export function isOffline() {
  return !isOnlineState;
}

/* --------------------------
   Utilitaires pour la persistance
--------------------------- */

// Vérifier si la persistance est disponible
export function isPersistenceEnabled() {
  return persistenceEnabled;
}

// Estimer la taille du cache local
export async function getCacheSize() {
  if (typeof navigator.storage?.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: estimate.quota || 0,
        usedMB: ((estimate.usage || 0) / (1024 * 1024)).toFixed(2),
        availableMB: ((estimate.quota || 0) / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      console.warn("Impossible d'estimer le stockage:", error);
    }
  }
  return null;
}

// Nettoyer le cache (attention: perte de données offline)
export async function clearCache(options = {}) {
  const { 
    skipConfirmation = false, 
    onlyBackups = false,
    onProgress = null 
  } = options;
  
  // Vérification de confirmation (peut être désactivée)
  if (!skipConfirmation) {
    try {
      // Utiliser une approche plus moderne si disponible
      if (typeof window !== 'undefined' && window.confirm) {
        const confirmResult = window.confirm(
          "Êtes-vous sûr de vouloir vider le cache local ? Vous perdrez les données non synchronisées."
        );
        if (!confirmResult) {
          return false;
        }
      } else {
        console.warn("[cache] Confirmation non disponible - opération annulée");
        return false;
      }
    } catch (error) {
      console.warn("[cache] Erreur de confirmation:", error);
      return false;
    }
  }

  try {
    if (onProgress) onProgress(0, "Démarrage du nettoyage...");

    // Si on ne vide que les backups
    if (onlyBackups) {
      const keysToRemove = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('backup_') || key === 'backups_list')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        if (onProgress) onProgress(100, "Backups supprimés");
        console.log("[cache] Backups locaux supprimés");
        return true;
      } catch (error) {
        console.error("[cache] Erreur suppression backups:", error);
        return false;
      }
    }

    // Nettoyage complet
    let step = 0;
    const totalSteps = 4;

    // Étape 1: Désactiver le réseau Firestore
    if (onProgress) onProgress((++step / totalSteps) * 100, "Désactivation réseau...");
    try {
      await disableFirestoreNetwork();
    } catch (error) {
      console.warn("[cache] Impossible de désactiver le réseau:", error);
    }

    // Étape 2: Vider les caches du navigateur
    if (onProgress) onProgress((++step / totalSteps) * 100, "Suppression caches navigateur...");
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(async (cacheName) => {
            try {
              return await caches.delete(cacheName);
            } catch (err) {
              console.warn(`[cache] Impossible de supprimer ${cacheName}:`, err);
              return false;
            }
          })
        );
      } catch (error) {
        console.warn("[cache] Erreur lors de la suppression des caches:", error);
      }
    }

    // Étape 3: Vider localStorage des backups
    if (onProgress) onProgress((++step / totalSteps) * 100, "Suppression sauvegardes locales...");
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('backup_') || key === 'backups_list')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (err) {
          console.warn(`[cache] Impossible de supprimer ${key}:`, err);
        }
      });
    } catch (error) {
      console.warn("[cache] Erreur lors de la suppression localStorage:", error);
    }

    // Étape 4: Réactiver le réseau
    if (onProgress) onProgress((++step / totalSteps) * 100, "Réactivation réseau...");
    try {
      await enableFirestoreNetwork();
    } catch (error) {
      console.warn("[cache] Impossible de réactiver le réseau:", error);
    }

    if (onProgress) onProgress(100, "Nettoyage terminé");
    console.log("[cache] Cache vidé avec succès");
    return true;

  } catch (error) {
    console.error("[cache] Erreur lors du nettoyage:", error);
    if (onProgress) onProgress(0, "Erreur: " + error.message);
    
    // Tenter de réactiver le réseau en cas d'erreur
    try {
      await enableFirestoreNetwork();
    } catch (networkError) {
      console.error("[cache] Impossible de réactiver le réseau après erreur:", networkError);
    }
    
    return false;
  }
}

/* --------------------------
   Utilitaires de monitoring
--------------------------- */

// Surveiller les erreurs de connexion
export function monitorConnectionErrors() {
  const originalConsoleError = console.error;
  
  console.error = (...args) => {
    const message = args.join(' ');
    
    // Détecter les erreurs de connexion Firebase
    if (message.includes('network-request-failed') || 
        message.includes('unavailable') ||
        message.includes('deadline-exceeded')) {
      console.warn("[connection] Erreur réseau détectée - basculement offline possible");
      notifyNetworkStateChange(false);
    }
    
    // Appeler la fonction originale
    originalConsoleError.apply(console, args);
  };
}

// Démarrer le monitoring automatiquement
monitorConnectionErrors();

/* --------------------------
   État initial
--------------------------- */

// Vérifier l'état initial du réseau
if (navigator.onLine) {
  enableFirestoreNetwork().catch(console.warn);
} else {
  console.log("[init] Démarrage en mode offline");
}

/* --------------------------
   Exports principaux
--------------------------- */

export { 
  db,
  enableNetwork,
  disableNetwork,
  onSnapshot
};

export default app;

/* -----------------------------------------
   (Optionnel) Emulators pour dev local
------------------------------------------ */
// if (import.meta?.env?.VITE_USE_EMULATORS === "true") {
//   connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
//   connectFirestoreEmulator(db, "localhost", 8080);
// }

/* --------------------------
   Diagnostics de démarrage
--------------------------- */

// Log des informations de configuration au démarrage
console.log("[firebase] Configuration chargée:", {
  persistenceEnabled,
  online: isOnlineState,
  projectId: firebaseConfig.projectId
});

// Diagnostic de la persistance après un court délai
setTimeout(async () => {
  const cacheInfo = await getCacheSize();
  if (cacheInfo) {
    console.log("[storage] Espace utilisé:", cacheInfo.usedMB, "MB /", cacheInfo.availableMB, "MB");
  }
}, 2000);
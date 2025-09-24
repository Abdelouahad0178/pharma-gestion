// src/contexts/UserRoleContext.js
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db, disableFirestoreNetwork, enableFirestoreNetwork } from "../firebase/config";
import permissions, { DOCTOR_ONLY_PERMISSIONS } from "../utils/permissions";

// Création du contexte
const UserRoleContext = createContext();

// Hook custom pour accès direct
export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (!context) {
    throw new Error("useUserRole doit être utilisé dans un UserRoleProvider");
  }
  return context;
}

// Provider du contexte
export function UserRoleProvider({ children }) {
  // --- États principaux ---
  const [role, setRole] = useState(null);
  const [user, setUser] = useState(null);
  const [societeId, setSocieteId] = useState(null);
  const [societeName, setSocieteName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // --- États sécurité / statut ---
  const [isLocked, setIsLocked] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // --- Notifications ---
  const [adminPopup, setAdminPopup] = useState(null);
  const [paymentWarning, setPaymentWarning] = useState(null);

  // --- NOUVEAU : Permissions personnalisées ---
  const [customPermissions, setCustomPermissions] = useState([]);

  // --- Refs pour garantir 1 seul listener actif ---
  const authUnsubRef = useRef(null);
  const userUnsubRef = useRef(null);
  const socUnsubRef = useRef(null);

  // Utilitaire : reset réseau si "Target ID already exists"
  const tryRecoverWatchError = async (err) => {
    const msg = String(err?.message || "");
    if (msg.includes("Target ID already exists")) {
      try {
        await disableFirestoreNetwork();
        await enableFirestoreNetwork();
      } catch (_) {
        /* ignore */
      }
    }
  };

  // =========================
  // Écoute de l'auth Firebase
  // =========================
  useEffect(() => {
    const auth = getAuth();

    // Évite multi-subscription si HMR/StrictMode
    if (authUnsubRef.current) {
      authUnsubRef.current();
      authUnsubRef.current = null;
    }

    authUnsubRef.current = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthReady(true);

      // Toujours nettoyer l'ancienne écoute user avant de (re)créer
      if (userUnsubRef.current) {
        userUnsubRef.current();
        userUnsubRef.current = null;
      }
      // Nettoyer écoute société si on change d'utilisateur ou déconnexion
      if (socUnsubRef.current) {
        socUnsubRef.current();
        socUnsubRef.current = null;
      }

      if (firebaseUser) {
        try {
          const userRef = doc(db, "users", firebaseUser.uid);

          // Unique onSnapshot utilisateur
          userUnsubRef.current = onSnapshot(
            userRef,
            async (snap) => {
              if (snap.exists()) {
                const data = snap.data();

                if (data.deleted === true) {
                  console.log("[auth] Utilisateur marqué comme supprimé");
                  setIsDeleted(true);
                } else {
                  setIsDeleted(false);
                }

                // Mettre à jour états
                setRole(data.role || "vendeuse");
                setSocieteId(data.societeId || null);
                setIsLocked(data.locked === true || data.isLocked === true);
                setIsOwner(data.isOwner === true);
                setIsActive(data.active !== false && data.isActive !== false);
                setAdminPopup(data.adminPopup || null);
                setPaymentWarning(data.paymentWarning || null);
                
                // NOUVEAU : Charger les permissions personnalisées
                setCustomPermissions(data.customPermissions || []);

                // Objet utilisateur enrichi
                setUser({
                  ...firebaseUser,
                  ...data,
                  societeId: data.societeId || null,
                  role: data.role || "vendeuse",
                  locked: data.locked === true || data.isLocked === true,
                  deleted: data.deleted === true,
                  isOwner: data.isOwner === true,
                  active: data.active !== false && data.isActive !== false,
                  adminPopup: data.adminPopup || null,
                  paymentWarning: data.paymentWarning || null,
                  customPermissions: data.customPermissions || [], // NOUVEAU
                });
              } else {
                // Document utilisateur absent → valeurs par défaut
                console.log("[auth] Document utilisateur absent → défauts");
                const defaultData = {
                  role: "vendeuse",
                  societeId: null,
                  locked: false,
                  deleted: false,
                  isOwner: false,
                  active: true,
                  adminPopup: null,
                  paymentWarning: null,
                  customPermissions: [], // NOUVEAU
                };

                setRole(defaultData.role);
                setSocieteId(defaultData.societeId);
                setIsLocked(defaultData.locked);
                setIsDeleted(defaultData.deleted);
                setIsOwner(defaultData.isOwner);
                setIsActive(defaultData.active);
                setAdminPopup(defaultData.adminPopup);
                setPaymentWarning(defaultData.paymentWarning);
                setCustomPermissions(defaultData.customPermissions); // NOUVEAU

                setUser({
                  ...firebaseUser,
                  ...defaultData,
                });
              }

              setLoading(false);
            },
            async (error) => {
              console.error("Erreur lors de l'écoute du document utilisateur:", error);

              // Permissions refusées → valeurs restrictives mais pas de déconnexion
              if (error?.code === "permission-denied") {
                setRole("vendeuse");
                setSocieteId(null);
                setIsLocked(true);
                setIsDeleted(false);
                setIsOwner(false);
                setIsActive(false);
                setAdminPopup("Erreur de permissions - contactez l'administrateur");
                setPaymentWarning(null);
                setCustomPermissions([]); // NOUVEAU

                setUser({
                  ...firebaseUser,
                  societeId: null,
                  role: "vendeuse",
                  locked: true,
                  deleted: false,
                  isOwner: false,
                  active: false,
                  adminPopup: "Erreur de permissions - contactez l'administrateur",
                  paymentWarning: null,
                  customPermissions: [], // NOUVEAU
                });
              } else {
                console.warn("[auth] Erreur réseau ou autre, valeurs par défaut");
                setRole("vendeuse");
                setSocieteId(null);
                setIsLocked(false);
                setIsDeleted(false);
                setIsOwner(false);
                setIsActive(true);
                setAdminPopup(null);
                setPaymentWarning(null);
                setCustomPermissions([]); // NOUVEAU

                setUser({
                  ...firebaseUser,
                  societeId: null,
                  role: "vendeuse",
                  locked: false,
                  deleted: false,
                  isOwner: false,
                  active: true,
                  adminPopup: null,
                  paymentWarning: null,
                  customPermissions: [], // NOUVEAU
                });
              }

              setLoading(false);
              await tryRecoverWatchError(error);
            }
          );
        } catch (e) {
          console.error("Erreur init écoute utilisateur:", e);

          // Valeurs par défaut en cas d'erreur init
          setRole("vendeuse");
          setSocieteId(null);
          setIsLocked(false);
          setIsDeleted(false);
          setIsOwner(false);
          setIsActive(true);
          setAdminPopup(null);
          setPaymentWarning(null);
          setCustomPermissions([]); // NOUVEAU

          setUser({
            ...firebaseUser,
            societeId: null,
            role: "vendeuse",
            locked: false,
            deleted: false,
            isOwner: false,
            active: true,
            adminPopup: null,
            paymentWarning: null,
            customPermissions: [], // NOUVEAU
          });

          setLoading(false);
          await tryRecoverWatchError(e);
        }
      } else {
        // Déconnexion réelle
        console.log("[auth] Utilisateur déconnecté de Firebase Auth");

        // Nettoyage listeners associés
        if (userUnsubRef.current) {
          userUnsubRef.current();
          userUnsubRef.current = null;
        }
        if (socUnsubRef.current) {
          socUnsubRef.current();
          socUnsubRef.current = null;
        }

        setRole(null);
        setSocieteId(null);
        setUser(null);
        setIsLocked(false);
        setIsDeleted(false);
        setIsOwner(false);
        setIsActive(true);
        setAdminPopup(null);
        setPaymentWarning(null);
        setSocieteName(null);
        setCustomPermissions([]); // NOUVEAU
        setLoading(false);
      }
    });

    // Cleanup global de l'écoute auth
    return () => {
      if (authUnsubRef.current) {
        authUnsubRef.current();
        authUnsubRef.current = null;
      }
      if (userUnsubRef.current) {
        userUnsubRef.current();
        userUnsubRef.current = null;
      }
      if (socUnsubRef.current) {
        socUnsubRef.current();
        socUnsubRef.current = null;
      }
    };
  }, []);

  // =========================
  // Écoute du document société
  // =========================
  useEffect(() => {
    // Toujours nettoyer l'ancien listener société
    if (socUnsubRef.current) {
      socUnsubRef.current();
      socUnsubRef.current = null;
    }
    setSocieteName(null);

    if (!user || !societeId || isDeleted) {
      return () => {
        if (socUnsubRef.current) {
          socUnsubRef.current();
          socUnsubRef.current = null;
        }
      };
    }

    try {
      const ref = doc(db, "societe", societeId);

      // Unique onSnapshot société
      socUnsubRef.current = onSnapshot(
        ref,
        async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setSocieteName(data?.nom || data?.name || "Société");
          } else {
            // Fallback (ancienne collection "societes")
            try {
              const oldRef = doc(db, "societes", societeId);
              const oldSnap = await getDoc(oldRef);
              if (oldSnap.exists()) {
                const d = oldSnap.data();
                setSocieteName(d?.nom || d?.name || "Société");
              } else {
                setSocieteName("Société inconnue");
              }
            } catch {
              setSocieteName("Société inconnue");
            }
          }
        },
        async (err) => {
          console.warn("Erreur écoute société:", err);
          setSocieteName("Société (erreur de chargement)");
          await tryRecoverWatchError(err);
        }
      );
    } catch (e) {
      console.warn("Erreur init écoute société:", e);
      setSocieteName("Société (erreur)");
    }

    // Cleanup
    return () => {
      if (socUnsubRef.current) {
        socUnsubRef.current();
        socUnsubRef.current = null;
      }
    };
  }, [user, societeId, isDeleted]);

  // =========================
  // Permissions & Helpers
  // =========================

  // FONCTION can() MODIFIÉE pour le contrôle complet des permissions
  const can = (permission) => {
    if (isDeleted || !user || !authReady) return false;
    if (isLocked && !isOwner) return false;
    if (!isActive && !isOwner) return false;

    const ownerOnlyPermissions = [
      "gerer_utilisateurs",
      "modifier_roles",
      "voir_gestion_utilisateurs",
      "promouvoir_utilisateur",
      "retrograder_utilisateur",
    ];

    if (ownerOnlyPermissions.includes(permission)) {
      return isOwner && role === "docteur" && !isDeleted && isActive && authReady;
    }

    if (isOwner && user && !isDeleted) return true;

    // NOUVELLE LOGIQUE : Contrôle complet des permissions
    if (role === "vendeuse") {
      // Vérifier que la permission n'est pas dans les permissions exclusives au docteur
      if (DOCTOR_ONLY_PERMISSIONS.includes(permission)) {
        return false;
      }
      
      // CHANGEMENT PRINCIPAL : Si customPermissions existe, l'utiliser EXCLUSIVEMENT
      if (customPermissions.length > 0) {
        // Mode personnalisé : utiliser UNIQUEMENT les permissions personnalisées
        return customPermissions.includes(permission);
      } else {
        // Mode par défaut : utiliser les permissions par défaut du rôle
        const defaultPermissions = permissions.vendeuse || [];
        return defaultPermissions.includes(permission);
      }
    }

    // Logique pour le docteur (inchangée)
    if (role === "docteur") {
      // Les docteurs peuvent aussi avoir des permissions personnalisées
      if (customPermissions.length > 0) {
        return customPermissions.includes(permission);
      } else {
        return (permissions.docteur || []).includes(permission);
      }
    }

    return false;
  };

  // NOUVELLE FONCTION getUserPermissions() pour le contrôle complet
  const getUserPermissions = () => {
    if (role === "docteur") {
      // Si le docteur a des permissions personnalisées, les utiliser
      if (customPermissions.length > 0) {
        return customPermissions;
      } else {
        return permissions.docteur || [];
      }
    } else if (role === "vendeuse") {
      // Si la vendeuse a des permissions personnalisées, les utiliser EXCLUSIVEMENT
      if (customPermissions.length > 0) {
        return customPermissions;
      } else {
        return permissions.vendeuse || [];
      }
    }
    return [];
  };

  // NOUVELLE FONCTION hasCustomPermissions() - détecte si des permissions personnalisées sont actives
  const hasCustomPermissions = () => customPermissions.length > 0;

  // NOUVELLE FONCTION getExtraPermissions() - permissions ajoutées par rapport aux permissions par défaut
  const getExtraPermissions = () => {
    if (!role || customPermissions.length === 0) return [];
    
    const defaultPermissions = permissions[role] || [];
    return customPermissions.filter(p => !defaultPermissions.includes(p));
  };

  // NOUVELLE FONCTION getRemovedPermissions() - permissions retirées par rapport aux permissions par défaut
  const getRemovedPermissions = () => {
    if (!role || customPermissions.length === 0) return [];
    
    const defaultPermissions = permissions[role] || [];
    return defaultPermissions.filter(p => !customPermissions.includes(p));
  };

  // NOUVELLE FONCTION getPermissionChanges() - résumé complet des changements
  const getPermissionChanges = () => {
    if (!hasCustomPermissions()) {
      return {
        hasChanges: false,
        added: [],
        removed: [],
        total: getUserPermissions().length
      };
    }

    const added = getExtraPermissions();
    const removed = getRemovedPermissions();

    return {
      hasChanges: added.length > 0 || removed.length > 0,
      added,
      removed,
      total: getUserPermissions().length
    };
  };

  // Fonction pour recharger les permissions personnalisées
  const refreshCustomPermissions = async (userId = null) => {
    const targetUserId = userId || user?.uid;
    if (!targetUserId) return;

    try {
      const userDoc = await getDoc(doc(db, 'users', targetUserId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setCustomPermissions(userData.customPermissions || []);
      }
    } catch (error) {
      console.error('Erreur lors du rechargement des permissions:', error);
    }
  };

  // Fonctions existantes inchangées
  const canAccessApp = () => {
    if (!user || !authReady) return false;
    if (isDeleted) return false;
    if (!isActive && !isOwner) return false;
    if (isLocked && !isOwner) return false;
    return true;
  };

  const canManageUsers = () => {
    return isOwner && user && !isDeleted && isActive && authReady && role === "docteur";
  };
  const canChangeRoles = () => {
    return isOwner && user && !isDeleted && isActive && authReady && role === "docteur";
  };
  const canDeleteSociete = () => {
    return isOwner && user && !isDeleted && isActive && authReady && role === "docteur";
  };
  const canPromoteToOwner = () => false;
  const canDeleteOwner = () => false;
  const canLockOwner = () => false;

  const canModifyUser = (targetUserId, targetUserIsOwner = false) => {
    if (!canManageUsers()) return false;
    if (targetUserIsOwner) return false;
    if (targetUserId === user?.uid) return false;
    return true;
  };

  const canChangeUserRole = (targetUserId, targetUserIsOwner = false, currentRole, newRole) => {
    if (!canChangeRoles()) return false;
    if (targetUserIsOwner) return false;
    if (targetUserId === user?.uid) return false;
    if (!["docteur", "vendeuse"].includes(newRole)) return false;
    return true;
  };

  const canPromoteToDoctor = (targetUserId, targetUserIsOwner = false, currentRole) => {
    if (!canChangeRoles()) return false;
    if (targetUserIsOwner) return false;
    if (targetUserId === user?.uid) return false;
    if (currentRole !== "vendeuse") return false;
    return true;
  };

  const canDemoteToVendeuse = (targetUserId, targetUserIsOwner = false, currentRole) => {
    if (!canChangeRoles()) return false;
    if (targetUserIsOwner) return false;
    if (targetUserId === user?.uid) return false;
    if (currentRole !== "docteur") return false;
    return true;
  };

  const getBlockMessage = () => {
    if (!user || !authReady) return "Connexion en cours...";
    if (isDeleted) return "Ce compte a été supprimé par l'administrateur";
    if (!isActive && !isOwner) return "Compte désactivé par l'administrateur";
    if (isLocked && !isOwner) return "Compte temporairement verrouillé";
    return null;
  };

  const isAdmin = () => role === "docteur" && canAccessApp();
  const isSuperAdmin = () => isOwner && canAccessApp();

  // getUserStats() MODIFIÉ pour inclure les nouvelles informations
  const getUserStats = () => {
    const changes = getPermissionChanges();
    
    return {
      isConnected: !!user && authReady,
      isActive,
      isLocked,
      isDeleted,
      isOwner,
      role,
      societeId,
      hasAccess: canAccessApp(),
      blockReason: getBlockMessage(),
      authReady,
      customPermissions,
      hasCustomPermissions: hasCustomPermissions(),
      extraPermissions: getExtraPermissions(),
      removedPermissions: getRemovedPermissions(),
      permissionChanges: changes,
      totalPermissions: getUserPermissions().length,
      privileges: {
        canManageUsers: canManageUsers(),
        canChangeRoles: canChangeRoles(),
        canDeleteSociete: canDeleteSociete(),
        isUntouchable: isOwner,
        canPromoteUsers: canChangeRoles(),
        canDemoteUsers: canChangeRoles(),
      },
    };
  };

  // getPermissionMessages() MODIFIÉ pour les nouvelles informations
  const getPermissionMessages = () => {
    const messages = [];
    if (!authReady) {
      messages.push({ type: "info", text: "Vérification des permissions en cours..." });
      return messages;
    }
    if (isOwner) {
      messages.push({ type: "success", text: "👑 Vous êtes le propriétaire permanent de cette pharmacie" });
    }
    if (isDeleted) {
      messages.push({ type: "error", text: "⚠️ Ce compte a été supprimé par l'administrateur" });
    } else if (isLocked && !isOwner) {
      messages.push({ type: "warning", text: "🔒 Votre compte est temporairement verrouillé" });
    } else if (!isActive && !isOwner) {
      messages.push({ type: "warning", text: "⏸️ Votre compte est désactivé" });
    }
    
    // NOUVEAUX MESSAGES pour les permissions personnalisées
    if (hasCustomPermissions()) {
      const changes = getPermissionChanges();
      
      if (changes.added.length > 0 && changes.removed.length > 0) {
        messages.push({ 
          type: "info", 
          text: `🔧 Permissions personnalisées : +${changes.added.length} ajoutées, -${changes.removed.length} retirées` 
        });
      } else if (changes.added.length > 0) {
        messages.push({ 
          type: "info", 
          text: `✨ Vous avez ${changes.added.length} permission(s) supplémentaire(s) accordée(s)` 
        });
      } else if (changes.removed.length > 0) {
        messages.push({ 
          type: "warning", 
          text: `⚠️ ${changes.removed.length} permission(s) de base ont été retirées` 
        });
      }
    }
    
    if (adminPopup) messages.push({ type: "info", text: "📢 " + adminPopup });
    if (paymentWarning) messages.push({ type: "warning", text: "💳 " + paymentWarning });
    return messages;
  };

  // getUserRoleDisplay() MODIFIÉ pour les nouvelles informations
  const getUserRoleDisplay = () => {
    if (!role) return "Non défini";
    
    let baseDisplay = role === "docteur" ? "Docteur" : "Vendeuse";
    if (isOwner) baseDisplay += " (👑 Propriétaire)";
    
    // NOUVELLES INFORMATIONS sur les permissions personnalisées
    if (hasCustomPermissions()) {
      const changes = getPermissionChanges();
      
      if (changes.added.length > 0 && changes.removed.length > 0) {
        baseDisplay += ` (±${changes.added.length}/${changes.removed.length})`;
      } else if (changes.added.length > 0) {
        baseDisplay += ` (+${changes.added.length})`;
      } else if (changes.removed.length > 0) {
        baseDisplay += ` (-${changes.removed.length})`;
      }
    }
    
    return baseDisplay;
  };

  const getOwnershipStatus = () => {
    if (!user) return "Non connecté";
    if (isOwner) return "Propriétaire";
    if (role === "docteur") return "Docteur";
    return "Utilisateur standard";
  };

  // Valeur du contexte avec TOUTES les nouvelles fonctions
  const contextValue = {
    // États de base
    role,
    user,
    societeId,
    societeName,
    loading,
    authReady,

    // États de sécurité
    isLocked,
    isDeleted,
    isActive,
    isOwner,

    // Notifications
    adminPopup,
    paymentWarning,

    // NOUVEAU : Permissions personnalisées complètes
    customPermissions,
    hasCustomPermissions,
    getExtraPermissions,
    getRemovedPermissions,
    getPermissionChanges,
    getUserPermissions,
    refreshCustomPermissions,

    // Permissions / helpers existants
    can,
    canAccessApp,
    getBlockMessage,
    isAdmin,
    isSuperAdmin,
    getUserStats,
    canManageUsers,
    canChangeRoles,
    canDeleteSociete,
    canPromoteToOwner: () => false,
    canDeleteOwner: () => false,
    canLockOwner: () => false,
    canModifyUser,
    canChangeUserRole,
    canPromoteToDoctor,
    canDemoteToVendeuse,
    getPermissionMessages,
    getUserRoleDisplay,
    getOwnershipStatus,
  };

  return (
    <UserRoleContext.Provider value={contextValue}>
      {children}
    </UserRoleContext.Provider>
  );
}
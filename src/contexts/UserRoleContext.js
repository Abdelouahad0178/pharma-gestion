// src/contexts/UserRoleContext.js - VERSION CORRIGÉE
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

const UserRoleContext = createContext();

export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (!context) {
    throw new Error("useUserRole doit être utilisé dans un UserRoleProvider");
  }
  return context;
}

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

  // --- Permissions personnalisées ---
  const [customPermissions, setCustomPermissions] = useState([]);

  // ✅ Refs pour garantir 1 seul listener actif
  const authUnsubRef = useRef(null);
  const userUnsubRef = useRef(null);
  const socUnsubRef = useRef(null);
  const currentUserIdRef = useRef(null); // ✅ Tracker l'utilisateur actuel
  const currentSocieteIdRef = useRef(null); // ✅ Tracker la société actuelle

  // Utilitaire : reset réseau si "Target ID already exists"
  const tryRecoverWatchError = async (err) => {
    const msg = String(err?.message || "");
    if (msg.includes("Target ID already exists")) {
      console.warn("[UserRoleContext] Tentative de récupération Target ID error");
      try {
        await disableFirestoreNetwork();
        await new Promise(resolve => setTimeout(resolve, 100));
        await enableFirestoreNetwork();
      } catch (_) {
        console.error("[UserRoleContext] Échec récupération réseau");
      }
    }
  };

  // =========================
  // Écoute de l'auth Firebase
  // =========================
  useEffect(() => {
    console.log("[UserRoleContext] Initialisation listener Auth");
    const auth = getAuth();

    // ✅ Cleanup préventif si listener existe déjà
    if (authUnsubRef.current) {
      console.log("[UserRoleContext] Cleanup listener Auth existant");
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

    // ✅ Listener Auth unique
    authUnsubRef.current = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("[UserRoleContext] Auth state changed:", firebaseUser?.uid || "null");
      setAuthReady(true);

      if (!firebaseUser) {
        // Déconnexion
        console.log("[auth] Utilisateur déconnecté de Firebase Auth");

        // Cleanup listeners
        if (userUnsubRef.current) {
          userUnsubRef.current();
          userUnsubRef.current = null;
        }
        if (socUnsubRef.current) {
          socUnsubRef.current();
          socUnsubRef.current = null;
        }

        // Reset états
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
        setCustomPermissions([]);
        setLoading(false);
        currentUserIdRef.current = null;
        currentSocieteIdRef.current = null;
        return;
      }

      // ✅ Éviter réattachement si même utilisateur
      if (currentUserIdRef.current === firebaseUser.uid) {
        console.log("[UserRoleContext] Même utilisateur, skip réattachement");
        return;
      }

      // Nouvel utilisateur - cleanup ancien listener
      if (userUnsubRef.current) {
        console.log("[UserRoleContext] Cleanup ancien listener user");
        userUnsubRef.current();
        userUnsubRef.current = null;
      }
      if (socUnsubRef.current) {
        console.log("[UserRoleContext] Cleanup ancien listener société");
        socUnsubRef.current();
        socUnsubRef.current = null;
      }

      currentUserIdRef.current = firebaseUser.uid;
      console.log("[UserRoleContext] Attachement listener user:", firebaseUser.uid);

      try {
        const userRef = doc(db, "users", firebaseUser.uid);

        // ✅ Listener utilisateur unique
        userUnsubRef.current = onSnapshot(
          userRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();

              // Mettre à jour états
              setIsDeleted(data.deleted === true);
              setRole(data.role || "vendeuse");
              setSocieteId(data.societeId || null);
              setIsLocked(data.locked === true || data.isLocked === true);
              setIsOwner(data.isOwner === true);
              setIsActive(data.active !== false && data.isActive !== false);
              setAdminPopup(data.adminPopup || null);
              setPaymentWarning(data.paymentWarning || null);
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
                customPermissions: data.customPermissions || [],
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
                customPermissions: [],
              };

              setRole(defaultData.role);
              setSocieteId(defaultData.societeId);
              setIsLocked(defaultData.locked);
              setIsDeleted(defaultData.deleted);
              setIsOwner(defaultData.isOwner);
              setIsActive(defaultData.active);
              setAdminPopup(defaultData.adminPopup);
              setPaymentWarning(defaultData.paymentWarning);
              setCustomPermissions(defaultData.customPermissions);

              setUser({
                ...firebaseUser,
                ...defaultData,
              });
            }

            setLoading(false);
          },
          async (error) => {
            console.error("[UserRoleContext] Erreur listener user:", error.message);

            // Permissions refusées
            if (error?.code === "permission-denied") {
              setRole("vendeuse");
              setSocieteId(null);
              setIsLocked(true);
              setIsDeleted(false);
              setIsOwner(false);
              setIsActive(false);
              setAdminPopup("Erreur de permissions - contactez l'administrateur");
              setPaymentWarning(null);
              setCustomPermissions([]);

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
                customPermissions: [],
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
              setCustomPermissions([]);

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
                customPermissions: [],
              });
            }

            setLoading(false);
            await tryRecoverWatchError(error);
          }
        );
      } catch (e) {
        console.error("[UserRoleContext] Erreur init listener user:", e);

        // Valeurs par défaut en cas d'erreur init
        setRole("vendeuse");
        setSocieteId(null);
        setIsLocked(false);
        setIsDeleted(false);
        setIsOwner(false);
        setIsActive(true);
        setAdminPopup(null);
        setPaymentWarning(null);
        setCustomPermissions([]);

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
          customPermissions: [],
        });

        setLoading(false);
        await tryRecoverWatchError(e);
      }
    });

    // ✅ Cleanup global
    return () => {
      console.log("[UserRoleContext] Cleanup global Auth");
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
  }, []); // ✅ Dépendances vides - ne s'exécute qu'une fois

  // =========================
  // Écoute du document société
  // =========================
  useEffect(() => {
    // ✅ Skip si pas d'utilisateur ou société supprimée
    if (!user || !societeId || isDeleted) {
      if (socUnsubRef.current) {
        console.log("[UserRoleContext] Cleanup listener société (conditions invalides)");
        socUnsubRef.current();
        socUnsubRef.current = null;
      }
      setSocieteName(null);
      currentSocieteIdRef.current = null;
      return;
    }

    // ✅ Éviter réattachement si même société
    if (currentSocieteIdRef.current === societeId) {
      console.log("[UserRoleContext] Même société, skip réattachement");
      return;
    }

    // Nouvelle société - cleanup ancien listener
    if (socUnsubRef.current) {
      console.log("[UserRoleContext] Cleanup ancien listener société");
      socUnsubRef.current();
      socUnsubRef.current = null;
    }

    currentSocieteIdRef.current = societeId;
    console.log("[UserRoleContext] Attachement listener société:", societeId.slice(0, 10) + "...");

    try {
      const ref = doc(db, "societe", societeId);

      // ✅ Listener société unique
      socUnsubRef.current = onSnapshot(
        ref,
        async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setSocieteName(data?.nom || data?.name || "Société");
          } else {
            // Fallback ancienne collection
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
          console.warn("[UserRoleContext] Erreur listener société:", err.message);
          setSocieteName("Société (erreur de chargement)");
          await tryRecoverWatchError(err);
        }
      );
    } catch (e) {
      console.warn("[UserRoleContext] Erreur init listener société:", e);
      setSocieteName("Société (erreur)");
    }

    // ✅ Cleanup
    return () => {
      if (socUnsubRef.current) {
        console.log("[UserRoleContext] Cleanup listener société");
        socUnsubRef.current();
        socUnsubRef.current = null;
      }
    };
  }, [user?.uid, societeId, isDeleted]); // ✅ Dépendances primitives

  // =========================
  // Permissions & Helpers
  // =========================

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

    if (role === "vendeuse") {
      if (DOCTOR_ONLY_PERMISSIONS.includes(permission)) {
        return false;
      }
      
      if (customPermissions.length > 0) {
        return customPermissions.includes(permission);
      } else {
        const defaultPermissions = permissions.vendeuse || [];
        return defaultPermissions.includes(permission);
      }
    }

    if (role === "docteur") {
      if (customPermissions.length > 0) {
        return customPermissions.includes(permission);
      } else {
        return (permissions.docteur || []).includes(permission);
      }
    }

    return false;
  };

  const getUserPermissions = () => {
    if (role === "docteur") {
      if (customPermissions.length > 0) {
        return customPermissions;
      } else {
        return permissions.docteur || [];
      }
    } else if (role === "vendeuse") {
      if (customPermissions.length > 0) {
        return customPermissions;
      } else {
        return permissions.vendeuse || [];
      }
    }
    return [];
  };

  const hasCustomPermissions = () => customPermissions.length > 0;

  const getExtraPermissions = () => {
    if (!role || customPermissions.length === 0) return [];
    const defaultPermissions = permissions[role] || [];
    return customPermissions.filter(p => !defaultPermissions.includes(p));
  };

  const getRemovedPermissions = () => {
    if (!role || customPermissions.length === 0) return [];
    const defaultPermissions = permissions[role] || [];
    return defaultPermissions.filter(p => !customPermissions.includes(p));
  };

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
      console.error('[UserRoleContext] Erreur rechargement permissions:', error);
    }
  };

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

  const getPermissionMessages = () => {
    const messages = [];
    if (!authReady) {
      messages.push({ type: "info", text: "Vérification des permissions en cours..." });
      return messages;
    }
    if (isOwner) {
      messages.push({ type: "success", text: "Vous êtes le propriétaire permanent de cette pharmacie" });
    }
    if (isDeleted) {
      messages.push({ type: "error", text: "Ce compte a été supprimé par l'administrateur" });
    } else if (isLocked && !isOwner) {
      messages.push({ type: "warning", text: "Votre compte est temporairement verrouillé" });
    } else if (!isActive && !isOwner) {
      messages.push({ type: "warning", text: "Votre compte est désactivé" });
    }
    
    if (hasCustomPermissions()) {
      const changes = getPermissionChanges();
      
      if (changes.added.length > 0 && changes.removed.length > 0) {
        messages.push({ 
          type: "info", 
          text: `Permissions personnalisées : +${changes.added.length} ajoutées, -${changes.removed.length} retirées` 
        });
      } else if (changes.added.length > 0) {
        messages.push({ 
          type: "info", 
          text: `Vous avez ${changes.added.length} permission(s) supplémentaire(s) accordée(s)` 
        });
      } else if (changes.removed.length > 0) {
        messages.push({ 
          type: "warning", 
          text: `${changes.removed.length} permission(s) de base ont été retirées` 
        });
      }
    }
    
    if (adminPopup) messages.push({ type: "info", text: adminPopup });
    if (paymentWarning) messages.push({ type: "warning", text: paymentWarning });
    return messages;
  };

  const getUserRoleDisplay = () => {
    if (!role) return "Non défini";
    
    let baseDisplay = role === "docteur" ? "Docteur" : "Vendeuse";
    if (isOwner) baseDisplay += " (Propriétaire)";
    
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

  const contextValue = {
    role,
    user,
    societeId,
    societeName,
    loading,
    authReady,
    isLocked,
    isDeleted,
    isActive,
    isOwner,
    adminPopup,
    paymentWarning,
    customPermissions,
    hasCustomPermissions,
    getExtraPermissions,
    getRemovedPermissions,
    getPermissionChanges,
    getUserPermissions,
    refreshCustomPermissions,
    can,
    canAccessApp,
    getBlockMessage,
    isAdmin,
    isSuperAdmin,
    getUserStats,
    canManageUsers,
    canChangeRoles,
    canDeleteSociete,
    canPromoteToOwner,
    canDeleteOwner,
    canLockOwner,
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
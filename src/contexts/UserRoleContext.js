// src/contexts/UserRoleContext.js — VERSION SANS OVERRIDES
// Logique inversée conservée : la vendeuse a TOUS les droits par défaut (sauf retraits explicites)

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db, disableFirestoreNetwork, enableFirestoreNetwork } from "../firebase/config";

import permissions, {
  DOCTOR_ONLY_PERMISSIONS,
  normalizePermissions,
} from "../utils/permissions";

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

  // Permissions retirées (logique inversée)
  const [removedPermissions, setRemovedPermissions] = useState([]);

  // Refs listeners & états courants
  const authUnsubRef = useRef(null);
  const userUnsubRef = useRef(null);
  const socUnsubRef = useRef(null);
  const currentUserIdRef = useRef(null);
  const currentSocieteIdRef = useRef(null);
  const currentRoleRef = useRef(null);
  const currentUserRef = useRef(null);

  // Utilitaire : reset réseau si "Target ID already exists"
  const tryRecoverWatchError = async (err) => {
    const msg = String(err?.message || "");
    if (msg.includes("Target ID already exists")) {
      try {
        await disableFirestoreNetwork();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await enableFirestoreNetwork();
      } catch {
        /* noop */
      }
    }
  };

  // =========================
  // Écoute de l'auth Firebase
  // =========================
  useEffect(() => {
    const auth = getAuth();

    // Cleanup préventif
    if (authUnsubRef.current) { authUnsubRef.current(); authUnsubRef.current = null; }
    if (userUnsubRef.current) { userUnsubRef.current(); userUnsubRef.current = null; }
    if (socUnsubRef.current)  { socUnsubRef.current();  socUnsubRef.current  = null; }

    authUnsubRef.current = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthReady(true);

      if (!firebaseUser) {
        // Déconnexion → reset
        if (userUnsubRef.current) { userUnsubRef.current(); userUnsubRef.current = null; }
        if (socUnsubRef.current)  { socUnsubRef.current();  socUnsubRef.current  = null; }

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
        setRemovedPermissions([]);
        currentUserIdRef.current = null;
        currentSocieteIdRef.current = null;
        currentRoleRef.current = null;
        currentUserRef.current = null;
        setLoading(false);
        return;
      }

      if (currentUserIdRef.current === firebaseUser.uid) return; // évite double attachement

      // Cleanup ancien listener
      if (userUnsubRef.current) { userUnsubRef.current(); userUnsubRef.current = null; }
      if (socUnsubRef.current)  { socUnsubRef.current();  socUnsubRef.current  = null; }

      currentUserIdRef.current = firebaseUser.uid;

      try {
        const userRef = doc(db, "users", firebaseUser.uid);

        userUnsubRef.current = onSnapshot(
          userRef,
          (snap) => {
            let base;

            if (snap.exists()) {
              const data = snap.data() || {};
              const userRole = (data.role || "vendeuse").toLowerCase();

              const normalizedRemoved = normalizePermissions(data.removedPermissions || []);
              base = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || "",
                displayName: firebaseUser.displayName || "",
                role: userRole,
                societeId: data.societeId || null,
                locked: data.locked === true || data.isLocked === true,
                deleted: data.deleted === true,
                isOwner: data.isOwner === true,
                active: data.active !== false && data.isActive !== false,
                adminPopup: data.adminPopup || null,
                paymentWarning: data.paymentWarning || null,
                removedPermissions: normalizedRemoved,
                // on conserve les champs du user auth
                ...firebaseUser,
              };
            } else {
              // Document utilisateur absent → valeurs par défaut DOCTEUR
              const defaultRole = "docteur";
              console.warn(
                `[UserRoleContext] Pas de document pour ${firebaseUser.uid} - Rôle par défaut: ${defaultRole}`
              );

              base = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || "",
                displayName: firebaseUser.displayName || "",
                role: defaultRole,
                societeId: null,
                locked: false,
                deleted: false,
                isOwner: false,
                active: true,
                adminPopup: null,
                paymentWarning: null,
                removedPermissions: [],
                ...firebaseUser,
              };
            }

            // Répercute dans les states (plus d'overrides)
            setRole(base.role || null);
            setSocieteId(base.societeId || null);
            setIsLocked(!!base.locked);
            setIsDeleted(!!base.deleted);
            setIsOwner(!!base.isOwner);
            setIsActive(base.active !== false);
            setAdminPopup(base.adminPopup || null);
            setPaymentWarning(base.paymentWarning || null);
            setRemovedPermissions(normalizePermissions(base.removedPermissions || []));

            currentRoleRef.current = base.role || null;
            currentUserRef.current = base;
            setUser(base);
            setLoading(false);
          },
          async (error) => {
            console.error("[UserRoleContext] Erreur listener user:", error);

            // Fallback docteur (sans override)
            const base = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || "",
              displayName: firebaseUser.displayName || "",
              role: "docteur",
              societeId: null,
              locked: false,
              deleted: false,
              isOwner: false,
              active: true,
              adminPopup: null,
              paymentWarning: null,
              removedPermissions: [],
              ...firebaseUser,
            };

            setRole(base.role);
            setSocieteId(base.societeId || null);
            setIsLocked(!!base.locked);
            setIsDeleted(!!base.deleted);
            setIsOwner(!!base.isOwner);
            setIsActive(base.active !== false);
            setAdminPopup(base.adminPopup || null);
            setPaymentWarning(base.paymentWarning || null);
            setRemovedPermissions(normalizePermissions(base.removedPermissions || []));
            currentRoleRef.current = base.role;
            currentUserRef.current = base;
            setUser(base);
            setLoading(false);

            await tryRecoverWatchError(error);
          }
        );
      } catch (e) {
        console.error("[UserRoleContext] Erreur attachement listener:", e);

        const base = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          displayName: firebaseUser.displayName || "",
          role: "docteur",
          societeId: null,
          locked: false,
          deleted: false,
          isOwner: false,
          active: true,
          adminPopup: null,
          paymentWarning: null,
          removedPermissions: [],
          ...firebaseUser,
        };

        setRole(base.role);
        setSocieteId(base.societeId || null);
        setIsLocked(!!base.locked);
        setIsDeleted(!!base.deleted);
        setIsOwner(!!base.isOwner);
        setIsActive(base.active !== false);
        setAdminPopup(base.adminPopup || null);
        setPaymentWarning(base.paymentWarning || null);
        setRemovedPermissions(normalizePermissions(base.removedPermissions || []));
        currentRoleRef.current = base.role;
        currentUserRef.current = base;
        setUser(base);
        setLoading(false);

        await tryRecoverWatchError(e);
      }
    });

    // Cleanup global
    return () => {
      if (authUnsubRef.current) { authUnsubRef.current(); authUnsubRef.current = null; }
      if (userUnsubRef.current) { userUnsubRef.current(); userUnsubRef.current = null; }
      if (socUnsubRef.current)  { socUnsubRef.current();  socUnsubRef.current  = null; }
    };
  }, []);

  // =========================
  // Écoute du document société
  // =========================
  useEffect(() => {
    if (!user || !societeId || isDeleted) {
      if (socUnsubRef.current) { socUnsubRef.current(); socUnsubRef.current = null; }
      setSocieteName(null);
      currentSocieteIdRef.current = null;
      return;
    }

    if (currentSocieteIdRef.current === societeId) return;

    if (socUnsubRef.current) { socUnsubRef.current(); socUnsubRef.current = null; }

    currentSocieteIdRef.current = societeId;

    try {
      const ref = doc(db, "societe", societeId);

      socUnsubRef.current = onSnapshot(
        ref,
        async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setSocieteName(data?.nom || data?.name || "Société");
          } else {
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
          setSocieteName("Société (erreur de chargement)");
          await tryRecoverWatchError(err);
        }
      );
    } catch (e) {
      setSocieteName("Société (erreur)");
    }

    return () => {
      if (socUnsubRef.current) { socUnsubRef.current(); socUnsubRef.current = null; }
    };
  }, [user?.uid, societeId, isDeleted]);

  // =========================
  // Permissions (logique inversée)
  // =========================
  const effectivePermissions = useMemo(() => {
    if (isOwner || (role || "").toLowerCase() === "docteur") {
      return permissions.docteur || [];
    }

    const allAvailable = (permissions.docteur || []).filter(
      (p) => !DOCTOR_ONLY_PERMISSIONS.includes(p)
    );

    if (!removedPermissions || removedPermissions.length === 0) {
      return allAvailable;
    }
    return allAvailable.filter((p) => !removedPermissions.includes(p));
  }, [role, isOwner, removedPermissions]);

  const can = (permission) => {
    if (isDeleted || !user || !authReady) return false;
    if (isLocked && !isOwner) return false;
    if (!isActive && !isOwner) return false;

    const ownerOnly = [
      "gerer_utilisateurs",
      "modifier_roles",
      "voir_gestion_utilisateurs",
      "promouvoir_utilisateur",
      "retrograder_utilisateur",
    ];
    if (ownerOnly.includes(permission)) {
      return (
        isOwner &&
        (role || "").toLowerCase() === "docteur" &&
        !isDeleted &&
        isActive &&
        authReady
      );
    }

    if (isOwner && user && !isDeleted) return true;

    if (DOCTOR_ONLY_PERMISSIONS.includes(permission)) {
      return (role || "").toLowerCase() === "docteur";
    }

    if (removedPermissions && removedPermissions.includes(permission)) {
      return false;
    }

    return true;
  };

  const getUserPermissions = () => [...effectivePermissions];
  const hasRestrictions = () => removedPermissions && removedPermissions.length > 0;
  const hasCustomPermissions = () => hasRestrictions();
  const getRemovedPermissions = () => removedPermissions || [];
  const getExtraPermissions = () => [];
  const hasFullAccess = () => {
    if (isOwner || (role || "").toLowerCase() === "docteur") return true;
    return !hasRestrictions();
  };

  const getPermissionStatus = (permission) => {
    if (DOCTOR_ONLY_PERMISSIONS.includes(permission)) return "doctor_only";
    if (!removedPermissions || removedPermissions.length === 0) return "allowed_full_access";
    if (removedPermissions.includes(permission)) return "removed";
    return "allowed";
  };

  const getPermissionChanges = () => {
    const allAvailable = (permissions.docteur || []).filter(
      (p) => !DOCTOR_ONLY_PERMISSIONS.includes(p)
    );
    const removed = getRemovedPermissions();
    const allowed = allAvailable.length - removed.length;
    return {
      hasChanges: removed.length > 0,
      total: allAvailable.length,
      allowed,
      removed: removed.length,
      removedList: removed,
    };
  };

  const refreshRemovedPermissions = async (userId = null) => {
    const targetUserId = userId || user?.uid;
    if (!targetUserId) return;
    try {
      const userDoc = await getDoc(doc(db, "users", targetUserId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setRemovedPermissions(normalizePermissions(userData.removedPermissions || []));
      }
    } catch (error) {
      console.error("[UserRoleContext] Erreur rechargement permissions:", error);
    }
  };
  const refreshCustomPermissions = refreshRemovedPermissions;

  const canAccessApp = () => {
    if (!user || !authReady) return false;
    if (isDeleted) return false;
    if (!isActive && !isOwner) return false;
    if (isLocked && !isOwner) return false;
    return true;
  };

  const canManageUsers = () =>
    isOwner && user && !isDeleted && isActive && authReady && (role || "").toLowerCase() === "docteur";

  const canChangeRoles = () => canManageUsers();
  const canDeleteSociete = () => canManageUsers();
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
    if ((currentRole || "").toLowerCase() !== "vendeuse") return false;
    return true;
  };

  const canDemoteToVendeuse = (targetUserId, targetUserIsOwner = false, currentRole) => {
    if (!canChangeRoles()) return false;
    if (targetUserIsOwner) return false;
    if (targetUserId === user?.uid) return false;
    if ((currentRole || "").toLowerCase() !== "docteur") return false;
    return true;
  };

  const getBlockMessage = () => {
    if (!user || !authReady) return "Connexion en cours...";
    if (isDeleted) return "Ce compte a été supprimé par l'administrateur";
    if (!isActive && !isOwner) return "Compte désactivé par l'administrateur";
    if (isLocked && !isOwner) return "Compte temporairement verrouillé";
    return null;
  };

  const isAdmin = () => (role || "").toLowerCase() === "docteur" && canAccessApp();
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
      removedPermissions: getRemovedPermissions(),
      hasRestrictions: hasRestrictions(),
      hasFullAccess: hasFullAccess(),
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
    if (isOwner) messages.push({ type: "success", text: "Vous êtes le propriétaire permanent de cette pharmacie" });
    if (isDeleted) {
      messages.push({ type: "error", text: "Ce compte a été supprimé par l'administrateur" });
    } else if (isLocked && !isOwner) {
      messages.push({ type: "warning", text: "Votre compte est temporairement verrouillé" });
    } else if (!isActive && !isOwner) {
      messages.push({ type: "warning", text: "Votre compte est désactivé" });
    }

    if (hasRestrictions()) {
      const changes = getPermissionChanges();
      messages.push({
        type: "warning",
        text: `${changes.removed} permission(s) ont été retirées par l'administrateur`,
      });
    } else if ((role || "").toLowerCase() === "vendeuse") {
      messages.push({ type: "success", text: "Vous avez un accès complet à toutes les fonctionnalités" });
    }

    if (adminPopup) messages.push({ type: "info", text: adminPopup });
    if (paymentWarning) messages.push({ type: "warning", text: paymentWarning });
    return messages;
  };

  const getUserRoleDisplay = () => {
    if (!role) return "Non défini";
    let base = (role || "").toLowerCase() === "docteur" ? "Pharmacien" : "Vendeuse";
    if (isOwner) base += " (Propriétaire)";
    if (hasRestrictions()) {
      const changes = getPermissionChanges();
      base += ` (-${changes.removed})`;
    } else if ((role || "").toLowerCase() === "vendeuse") {
      base += " (Accès complet)";
    }
    return base;
  };

  const getOwnershipStatus = () => {
    if (!user) return "Non connecté";
    if (isOwner) return "Propriétaire";
    if ((role || "").toLowerCase() === "docteur") return "Pharmacien";
    return "Utilisateur standard";
  };

  const getCurrentRole = () => currentRoleRef.current || role;
  const getCurrentUser = () => currentUserRef.current || user;

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

    // Permissions
    removedPermissions,
    hasRestrictions,
    getRemovedPermissions,
    hasFullAccess,
    getPermissionStatus,
    getPermissionChanges,
    getUserPermissions,
    refreshRemovedPermissions,
    refreshCustomPermissions,
    can,
    canAccessApp,

    // Rétrocompatibilité
    hasCustomPermissions,
    getExtraPermissions,

    // Infos & stats
    getBlockMessage,
    isAdmin,
    isSuperAdmin,
    getUserStats,
    getPermissionMessages,
    getUserRoleDisplay,
    getOwnershipStatus,

    // Gestion
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

    // Getters courants
    getCurrentRole,
    getCurrentUser,
  };

  return (
    <UserRoleContext.Provider value={contextValue}>
      {children}
    </UserRoleContext.Provider>
  );
}

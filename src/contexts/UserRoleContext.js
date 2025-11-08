// src/contexts/UserRoleContext.js — VERSION AVEC AUTO-PROVISION (setDoc d'abord)
// Logique inversée : la vendeuse a TOUS les droits par défaut (sauf retraits explicites)

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
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

/* ============================================================
   AUTO-PROVISION : crée/patch users/{uid} sans lecture préalable
   (moins d'évaluations de règles -> moins d'erreurs 403)
============================================================ */
async function ensureUserDoc(firebaseUser) {
  if (!firebaseUser?.uid) return null;

  const ref = doc(db, "users", firebaseUser.uid);
  const defaults = {
    role: "docteur",        // ou "vendeuse" si tu préfères
    societeId: null,        // pourra être rempli ensuite via l'UI
    isOwner: false,
    active: true,
    locked: false,
    deleted: false,
    email: firebaseUser.email || null,
    displayName: firebaseUser.displayName || null,
    removedPermissions: [],
    createdAt: serverTimestamp(),   // si doc existait déjà, Firestore garde l’ancienne valeur
    updatedAt: serverTimestamp(),
  };

  // 1) Écrire d’abord (CREATE ou UPDATE “soi-même”) — autorisé par tes règles
  await setDoc(ref, defaults, { merge: true });

  // 2) Lire ensuite (maintenant que le doc existe/est patché)
  try {
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : defaults;
  } catch (e) {
    console.error("[ensureUserDoc] getDoc after setDoc failed:", e);
    return defaults; // on continue quand même avec des valeurs sûres
  }
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

  // Flag: on autorise l’accès pendant l’auto-provision
  const [provisioning, setProvisioning] = useState(false);

  // Utilitaire : reset réseau si "Target ID already exists"
  const tryRecoverWatchError = async (err) => {
    const msg = String(err?.message || "");
    if (msg.includes("Target ID already exists")) {
      try {
        await disableFirestoreNetwork();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await enableFirestoreNetwork();
      } catch { /* noop */ }
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
        setProvisioning(false);

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
        // 👉 Auto-provision AVANT d’écouter le doc
        setProvisioning(true);
        await ensureUserDoc(firebaseUser);
        setProvisioning(false);

        const userRef = doc(db, "users", firebaseUser.uid);

        userUnsubRef.current = onSnapshot(
          userRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data() || {};
              const userRole = (data.role || "vendeuse").toLowerCase();

              const normalizedRemoved = normalizePermissions(data.removedPermissions || []);
              const applied = {
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
                // champs auth
                ...firebaseUser,
              };

              // Répercute dans les states
              setRole(applied.role || null);
              setSocieteId(applied.societeId || null);
              setIsLocked(!!applied.locked);
              setIsDeleted(!!applied.deleted);
              setIsOwner(!!applied.isOwner);
              setIsActive(applied.active !== false);
              setAdminPopup(applied.adminPopup || null);
              setPaymentWarning(applied.paymentWarning || null);
              setRemovedPermissions(normalizePermissions(applied.removedPermissions || []));

              currentRoleRef.current = applied.role || null;
              currentUserRef.current = applied;
              setUser(applied);
              setLoading(false);
            } else {
              // Course condition rare : reprovision + laisser entrer
              console.info(`[UserRoleContext] Doc utilisateur manquant -> fallback "docteur" + provisioning`);
              setProvisioning(true);
              ensureUserDoc(firebaseUser).finally(() => setProvisioning(false));

              const applied = {
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

              setRole(applied.role);
              setSocieteId(applied.societeId);
              setIsLocked(false);
              setIsDeleted(false);
              setIsOwner(false);
              setIsActive(true);
              setRemovedPermissions([]);
              currentRoleRef.current = applied.role;
              currentUserRef.current = applied;
              setUser(applied);
              setLoading(false);
            }
          },
          async (error) => {
            console.error("[UserRoleContext] Erreur listener user:", error);

            // Fallback docteur + accès autorisé
            const applied = {
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
            setRole(applied.role);
            setSocieteId(applied.societeId);
            setIsLocked(false);
            setIsDeleted(false);
            setIsOwner(false);
            setIsActive(true);
            setRemovedPermissions([]);
            currentRoleRef.current = applied.role;
            currentUserRef.current = applied;
            setUser(applied);
            setLoading(false);

            await tryRecoverWatchError(error);
          }
        );
      } catch (e) {
        console.error("[UserRoleContext] Erreur attachement/provision:", e);

        // Fallback docteur + accès autorisé
        const applied = {
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
        setRole(applied.role);
        setSocieteId(applied.societeId);
        setIsLocked(false);
        setIsDeleted(false);
        setIsOwner(false);
        setIsActive(true);
        setRemovedPermissions([]);
        currentRoleRef.current = applied.role;
        currentUserRef.current = applied;
        setUser(applied);
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
            setSocieteName("Société inconnue");
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
    // 👉 Autoriser pendant provisioning pour ne pas bloquer l’entrée
    if (provisioning) return true;

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
    // 👉 Autoriser pendant provisioning (pas de blocage à l’entrée)
    if (provisioning) return true;

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
    if (provisioning) return "Initialisation de votre profil...";
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
    if (provisioning) {
      messages.push({ type: "info", text: "Initialisation de votre profil..." });
      return messages;
    }
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

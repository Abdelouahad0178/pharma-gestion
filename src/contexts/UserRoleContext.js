// src/contexts/UserRoleContext.js — VERSION STABLE + RÉTRO-COMPAT
// Hiérarchie: Propriétaire (SuperAdmin) > Admin > Docteur > Vendeuse/Assistant
// Logique inversée conservée pour vendeuse: accès large sauf retraits explicites.
// Ajouts: hasCustomPermissions() (function) + hasCustomPermissionsFlag (boolean) + getExtraPermissions()

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
  const ctx = useContext(UserRoleContext);
  if (!ctx) throw new Error("useUserRole doit être utilisé dans un UserRoleProvider");
  return ctx;
}

export function UserRoleProvider({ children }) {
  // ---------- États principaux ----------
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [societeId, setSocieteId] = useState(null);
  const [societeName, setSocieteName] = useState(null);

  // ---------- États de statut ----------
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  // ---------- Notifications ----------
  const [adminPopup, setAdminPopup] = useState(null);
  const [paymentWarning, setPaymentWarning] = useState(null);

  // ---------- Permissions retirées (logique inversée) ----------
  const [removedPermissions, setRemovedPermissions] = useState([]);

  // ---------- Refs listeners ----------
  const authUnsubRef = useRef(null);
  const userUnsubRef = useRef(null);
  const socUnsubRef = useRef(null);
  const currentUserIdRef = useRef(null);
  const currentSocieteIdRef = useRef(null);
  const currentUserRef = useRef(null);
  const currentRoleRef = useRef(null);

  const safeLower = (s) => (typeof s === "string" ? s.toLowerCase() : "");

  const tryRecoverWatchError = async (err) => {
    const msg = String(err?.message || "");
    if (msg.includes("Target ID already exists")) {
      try {
        await disableFirestoreNetwork();
        await new Promise((r) => setTimeout(r, 120));
        await enableFirestoreNetwork();
      } catch {}
    }
  };

  // =========================
  // Écoute de l'auth Firebase
  // =========================
  useEffect(() => {
    const auth = getAuth();

    // Cleanups
    if (authUnsubRef.current) { authUnsubRef.current(); authUnsubRef.current = null; }
    if (userUnsubRef.current) { userUnsubRef.current(); userUnsubRef.current = null; }
    if (socUnsubRef.current)  { socUnsubRef.current();  socUnsubRef.current  = null; }

    authUnsubRef.current = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthReady(true);

      // Déconnexion → reset total
      if (!firebaseUser) {
        if (userUnsubRef.current) { userUnsubRef.current(); userUnsubRef.current = null; }
        if (socUnsubRef.current)  { socUnsubRef.current();  socUnsubRef.current  = null; }
        currentUserIdRef.current = null;
        currentSocieteIdRef.current = null;
        currentRoleRef.current = null;
        currentUserRef.current = null;

        setUser(null);
        setRole(null);
        setSocieteId(null);
        setSocieteName(null);
        setIsOwner(false);
        setIsActive(true);
        setIsLocked(false);
        setIsDeleted(false);
        setRemovedPermissions([]);
        setAdminPopup(null);
        setPaymentWarning(null);
        setLoading(false);
        return;
      }

      // Évite double attachement si même UID
      if (currentUserIdRef.current === firebaseUser.uid) {
        setLoading(false);
        return;
      }

      // Cleanup anciens listeners
      if (userUnsubRef.current) { userUnsubRef.current(); userUnsubRef.current = null; }
      if (socUnsubRef.current)  { socUnsubRef.current();  socUnsubRef.current  = null; }

      currentUserIdRef.current = firebaseUser.uid;

      // Attacher listener sur users/{uid}
      try {
        const userRef = doc(db, "users", firebaseUser.uid);
        userUnsubRef.current = onSnapshot(
          userRef,
          (snap) => {
            let base;
            if (snap.exists()) {
              const data = snap.data() || {};
              const userRole = safeLower(data.role || "vendeuse");
              const normalizedRemoved = normalizePermissions(data.removedPermissions || []);

              base = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || "",
                displayName: firebaseUser.displayName || "",
                role: userRole,
                societeId: data.societeId || null,
                isOwner: data.isOwner === true,
                active: data.active !== false && data.isActive !== false,
                locked: data.locked === true || data.isLocked === true,
                deleted: data.deleted === true,
                adminPopup: data.adminPopup || null,
                paymentWarning: data.paymentWarning || null,
                removedPermissions: normalizedRemoved,
              };
            } else {
              console.warn(
                `[UserRoleContext] Pas de document pour ${firebaseUser.uid} - Rôle par défaut: docteur`
              );
              base = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || "",
                displayName: firebaseUser.displayName || "",
                role: "docteur",
                societeId: null,
                isOwner: false,
                active: true,
                locked: false,
                deleted: false,
                adminPopup: null,
                paymentWarning: null,
                removedPermissions: [],
              };
            }

            currentUserRef.current = base;
            currentRoleRef.current = base.role;

            setUser(base);
            setRole(base.role);
            setSocieteId(base.societeId);
            setIsOwner(!!base.isOwner);
            setIsActive(base.active !== false);
            setIsLocked(!!base.locked);
            setIsDeleted(!!base.deleted);
            setAdminPopup(base.adminPopup || null);
            setPaymentWarning(base.paymentWarning || null);
            setRemovedPermissions(normalizePermissions(base.removedPermissions || []));
            setLoading(false);
          },
          async (error) => {
            console.error("[UserRoleContext] Erreur listener user:", error);

            const fb = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || "",
              displayName: firebaseUser.displayName || "",
              role: "docteur",
              societeId: null,
              isOwner: false,
              active: true,
              locked: false,
              deleted: false,
              adminPopup: null,
              paymentWarning: null,
              removedPermissions: [],
            };
            currentUserRef.current = fb;
            currentRoleRef.current = fb.role;

            setUser(fb);
            setRole(fb.role);
            setSocieteId(fb.societeId);
            setIsOwner(false);
            setIsActive(true);
            setIsLocked(false);
            setIsDeleted(false);
            setRemovedPermissions([]);
            setAdminPopup(null);
            setPaymentWarning(null);
            setLoading(false);

            await tryRecoverWatchError(error);
          }
        );
      } catch (e) {
        console.error("[UserRoleContext] Erreur attachement listener:", e);
        const fb = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          displayName: firebaseUser.displayName || "",
          role: "docteur",
          societeId: null,
          isOwner: false,
          active: true,
          locked: false,
          deleted: false,
          adminPopup: null,
          paymentWarning: null,
          removedPermissions: [],
        };
        currentUserRef.current = fb;
        currentRoleRef.current = fb.role;

        setUser(fb);
        setRole(fb.role);
        setSocieteId(null);
        setIsOwner(false);
        setIsActive(true);
        setIsLocked(false);
        setIsDeleted(false);
        setRemovedPermissions([]);
        setAdminPopup(null);
        setPaymentWarning(null);
        setLoading(false);

        await tryRecoverWatchError(e);
      }
    });

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
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setSocieteName(data?.nom || data?.name || "Pharmacie");
          } else {
            setSocieteName("Pharmacie");
          }
        },
        async (err) => {
          console.warn("[UserRoleContext] Erreur chargement société:", err);
          setSocieteName("Pharmacie");
          await tryRecoverWatchError(err);
        }
      );
    } catch (e) {
      console.warn("[UserRoleContext] Erreur attachement société:", e);
      setSocieteName("Pharmacie");
    }

    return () => {
      if (socUnsubRef.current) { socUnsubRef.current(); socUnsubRef.current = null; }
    };
  }, [user?.uid, societeId, isDeleted]);

  // =========================
  // Permissions (logique inversée)
  // =========================
  const effectivePermissions = useMemo(() => {
    const r = safeLower(role);
    if (isOwner || r === "docteur" || r === "admin") {
      return permissions.docteur || [];
    }
    const all = (permissions.docteur || []).filter(
      (p) => !DOCTOR_ONLY_PERMISSIONS.includes(p)
    );
    if (!removedPermissions?.length) return all;
    return all.filter((p) => !removedPermissions.includes(p));
  }, [role, isOwner, removedPermissions]);

  // ---------- Helpers d'accès ----------
  const canAccessApp = () => {
    if (!authReady) return false;
    if (!user) return false;
    if (isDeleted) return false;
    if (isLocked && !isOwner) return false;
    if (!isActive && !isOwner) return false;
    return true;
  };

  const isAdmin = () => {
    const r = safeLower(role);
    return (r === "admin" || r === "docteur" || isOwner) && canAccessApp();
  };

  const isSuperAdmin = () => !!isOwner && canAccessApp();

  const canManageUsers = () => isAdmin();

  const canChangeRoles = () => isAdmin();

  const canDeleteSociete = () => isSuperAdmin();

  const canPromoteToOwner = () => false;
  const canDeleteOwner = () => false;
  const canLockOwner = () => false;

  // ---------- API logique hiérarchique ----------
  const canModifyUser = (targetUserId, targetUserIsOwner = false, targetUserRole = "vendeuse") => {
    if (!canManageUsers()) return false;
    if (!targetUserId || targetUserId === user?.uid) return false;

    if (isSuperAdmin()) return !targetUserIsOwner;

    const t = safeLower(targetUserRole);
    if (t === "admin" || t === "docteur") return false;
    if (targetUserIsOwner) return false;

    return true;
  };

  const canChangeUserRole = (targetUserId, targetUserIsOwner = false, currentRole, newRole) => {
    if (!canModifyUser(targetUserId, targetUserIsOwner, currentRole)) return false;
    const rNew = safeLower(newRole);
    if (!["docteur", "admin", "vendeuse", "assistant"].includes(rNew)) return false;

    if ((rNew === "admin" || rNew === "docteur") && !isSuperAdmin()) return false;
    return true;
  };

  const canPromoteToDoctor = (targetUserId, targetUserIsOwner = false, currentRole) => {
    if (!isSuperAdmin()) return false;
    return canModifyUser(targetUserId, targetUserIsOwner, currentRole) &&
           ["vendeuse", "assistant"].includes(safeLower(currentRole));
  };

  const canDemoteToVendeuse = (targetUserId, targetUserIsOwner = false, currentRole) => {
    if (!canModifyUser(targetUserId, targetUserIsOwner, currentRole)) return false;
    const t = safeLower(currentRole);
    if (targetUserIsOwner) return false;
    return t === "admin" || t === "docteur";
  };

  // ---------- Introspection ----------
  const can = (permission) => {
    if (!canAccessApp()) return false;

    const ownerOnly = new Set([
      "gerer_utilisateurs",
      "modifier_roles",
      "voir_gestion_utilisateurs",
      "promouvoir_utilisateur",
      "retrograder_utilisateur",
    ]);
    if (ownerOnly.has(permission)) {
      return isSuperAdmin();
    }

    if (isOwner) return true;

    if (DOCTOR_ONLY_PERMISSIONS.includes(permission)) {
      const r = safeLower(role);
      return r === "docteur" || r === "admin";
    }

    if (removedPermissions?.includes?.(permission)) return false;
    return true;
  };

  const getUserPermissions = () => [...effectivePermissions];

  const hasRestrictions = () => !!(removedPermissions && removedPermissions.length > 0);

  const getRemovedPermissions = () => removedPermissions || [];

  const hasFullAccess = () => {
    const r = safeLower(role);
    if (isOwner || r === "docteur" || r === "admin") return true;
    return !hasRestrictions();
  };

  const getPermissionStatus = (permission) => {
    if (DOCTOR_ONLY_PERMISSIONS.includes(permission)) return "doctor_only";
    if (!hasRestrictions()) return "allowed_full_access";
    return removedPermissions.includes(permission) ? "removed" : "allowed";
  };

  const getPermissionChanges = () => {
    const all = (permissions.docteur || []).filter(
      (p) => !DOCTOR_ONLY_PERMISSIONS.includes(p)
    );
    const removed = getRemovedPermissions();
    return {
      hasChanges: removed.length > 0,
      total: all.length,
      allowed: all.length - removed.length,
      removed: removed.length,
      removedList: removed,
    };
  };

  // Live refresh des retraits
  const refreshRemovedPermissions = async (userId = null) => {
    const target = userId || user?.uid;
    if (!target) return;
    try {
      const snap = await getDoc(doc(db, "users", target));
      if (snap.exists()) {
        const d = snap.data();
        setRemovedPermissions(normalizePermissions(d.removedPermissions || []));
      }
    } catch (e) {
      console.error("[UserRoleContext] Erreur rechargement permissions:", e);
    }
  };
  const refreshCustomPermissions = refreshRemovedPermissions;

  // --------- RÉTRO-COMPAT: helpers attendus ailleurs ----------
  const hasCustomPermissions = () => hasRestrictions(); // fonction (nouvelle API)
  const getExtraPermissions = () => [];                 // placeholder si utilisé par d'autres vues
  const hasCustomPermissionsFlag = hasCustomPermissions(); // booléen (anciens composants)

  // ---------- Messages et stats ----------
  const getBlockMessage = () => {
    if (!user || !authReady) return "Connexion en cours...";
    if (isDeleted) return "Ce compte a été supprimé par l'administrateur";
    if (isLocked && !isOwner) return "Compte temporairement verrouillé";
    if (!isActive && !isOwner) return "Compte désactivé par l'administrateur";
    return null;
  };

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
    const msgs = [];
    if (!authReady) {
      msgs.push({ type: "info", text: "Vérification des permissions en cours..." });
      return msgs;
    }
    if (isOwner) msgs.push({ type: "success", text: "Vous êtes le propriétaire de cette pharmacie" });
    if (isDeleted) msgs.push({ type: "error", text: "Ce compte a été supprimé par l'administrateur" });
    else if (isLocked && !isOwner) msgs.push({ type: "warning", text: "Votre compte est temporairement verrouillé" });
    else if (!isActive && !isOwner) msgs.push({ type: "warning", text: "Votre compte est désactivé" });

    if (hasRestrictions()) {
      const changes = getPermissionChanges();
      msgs.push({ type: "warning", text: `${changes.removed} permission(s) ont été retirées` });
    } else if (safeLower(role) === "vendeuse" || safeLower(role) === "assistant") {
      msgs.push({ type: "success", text: "Vous avez un accès complet (aucun retrait)" });
    }

    if (adminPopup) msgs.push({ type: "info", text: adminPopup });
    if (paymentWarning) msgs.push({ type: "warning", text: paymentWarning });
    return msgs;
  };

  const getUserRoleDisplay = () => {
    const r = safeLower(role);
    let base = "Utilisateur";
    if (r === "docteur") base = "Pharmacien";
    if (r === "admin") base = "Administrateur";
    if (r === "vendeuse") base = "Vendeuse";
    if (r === "assistant") base = "Assistant(e)";
    if (isOwner) base += " (Propriétaire)";
    if (hasRestrictions() && (r === "vendeuse" || r === "assistant")) {
      const ch = getPermissionChanges();
      base += ` (-${ch.removed})`;
    } else if (r === "vendeuse" || r === "assistant") {
      base += " (Accès complet)";
    }
    return base;
  };

  const getOwnershipStatus = () => {
    if (!user) return "Non connecté";
    if (isOwner) return "Propriétaire";
    const r = safeLower(role);
    if (r === "docteur") return "Pharmacien";
    if (r === "admin") return "Administrateur";
    return "Utilisateur standard";
  };

  const getCurrentRole = () => currentRoleRef.current || role;
  const getCurrentUser = () => currentUserRef.current || user;

  const contextValue = {
    // États principaux
    role,
    user,
    societeId,
    societeName,
    loading,
    authReady,

    // Statuts
    isOwner,
    isActive,
    isLocked,
    isDeleted,
    adminPopup,
    paymentWarning,

    // Permissions (logique inversée)
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

    // === RÉTRO-COMPAT ===
    hasCustomPermissions,           // fonction
    hasCustomPermissionsFlag: hasCustomPermissions(), // booléen
    getExtraPermissions,            // placeholder

    // Rôles / hiérarchie
    isAdmin,
    isSuperAdmin,
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

    // Infos UI
    getBlockMessage,
    getUserStats,
    getPermissionMessages,
    getUserRoleDisplay,
    getOwnershipStatus,

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

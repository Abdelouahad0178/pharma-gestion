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

  // --- Refs pour garantir 1 seul listener actif ---
  const authUnsubRef = useRef(null);
  const userUnsubRef = useRef(null);
  const socUnsubRef = useRef(null);

  // Utilitaire : reset réseau si “Target ID already exists”
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
                };

                setRole(defaultData.role);
                setSocieteId(defaultData.societeId);
                setIsLocked(defaultData.locked);
                setIsDeleted(defaultData.deleted);
                setIsOwner(defaultData.isOwner);
                setIsActive(defaultData.active);
                setAdminPopup(defaultData.adminPopup);
                setPaymentWarning(defaultData.paymentWarning);

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
                });
              }

              setLoading(false);
              await tryRecoverWatchError(error);
            }
          );
        } catch (e) {
          console.error("Erreur init écoute utilisateur:", e);

          // Valeurs par défaut en cas d’erreur init
          setRole("vendeuse");
          setSocieteId(null);
          setIsLocked(false);
          setIsDeleted(false);
          setIsOwner(false);
          setIsActive(true);
          setAdminPopup(null);
          setPaymentWarning(null);

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
        setLoading(false);
      }
    });

    // Cleanup global de l’écoute auth
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

    const rolePermissions = {
      docteur: [
        "voir_achats",
        "voir_ventes",
        "ajouter_stock",
        "parametres",
        "modifier_stock",
        "supprimer_stock",
        "voir_devis_factures",
        "voir_paiements",
        "voir_dashboard",
        "voir_invitations",
      ],
      vendeuse: ["voir_ventes", "ajouter_vente", "voir_stock", "voir_invitations", "voir_dashboard"],
    };

    if (!role) return false;
    return (rolePermissions[role] || []).includes(permission);
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

  const getUserStats = () => ({
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
    privileges: {
      canManageUsers: canManageUsers(),
      canChangeRoles: canChangeRoles(),
      canDeleteSociete: canDeleteSociete(),
      isUntouchable: isOwner,
      canPromoteUsers: canChangeRoles(),
      canDemoteUsers: canChangeRoles(),
    },
  });

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
    if (adminPopup) messages.push({ type: "info", text: "📢 " + adminPopup });
    if (paymentWarning) messages.push({ type: "warning", text: "💳 " + paymentWarning });
    return messages;
  };

  const getUserRoleDisplay = () => {
    if (!role) return "Non défini";
    if (isOwner) return `${role === "docteur" ? "Docteur" : "Vendeuse"} (👑 Propriétaire)`;
    return role === "docteur" ? "Docteur" : "Vendeuse";
  };

  const getOwnershipStatus = () => {
    if (!user) return "Non connecté";
    if (isOwner) return "Propriétaire";
    if (role === "docteur") return "Docteur";
    return "Utilisateur standard";
  };

  // Valeur du contexte
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

    // Permissions / helpers
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

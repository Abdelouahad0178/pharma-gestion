// src/contexts/UserRoleContext.js
import React, { createContext, useContext, useState, useEffect } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

// Création du contexte
const UserRoleContext = createContext();

// Hook custom pour accès direct
export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (!context) {
    throw new Error('useUserRole doit être utilisé dans un UserRoleProvider');
  }
  return context;
}

// Provider du contexte
export function UserRoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [user, setUser] = useState(null);
  const [societeId, setSocieteId] = useState(null);
  const [societeName, setSocieteName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [adminPopup, setAdminPopup] = useState(null);
  const [paymentWarning, setPaymentWarning] = useState(null);
  const [isActive, setIsActive] = useState(true);

  // État pour éviter les déconnexions intempestives
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    let unsubscribeUser = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Marquer que Firebase Auth est prêt
      setAuthReady(true);
      
      // Nettoyer l'ancien listener s'il existe
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
      }

      if (firebaseUser) {
        try {
          // Écouter les changements du document utilisateur en temps réel
          const userRef = doc(db, "users", firebaseUser.uid);

          unsubscribeUser = onSnapshot(
            userRef,
            async (snap) => {
              if (snap.exists()) {
                const data = snap.data();

                // ⚠️ CRITIQUE: Ne pas déconnecter automatiquement si deleted
                // Laisser l'admin gérer la déconnexion manuellement
                if (data.deleted === true) {
                  console.log("[auth] Utilisateur marqué comme supprimé");
                  setIsDeleted(true);
                  // ❌ NE PAS FAIRE: await signOut(auth); 
                  // Laisser l'utilisateur connecté mais avec accès restreint
                } else {
                  setIsDeleted(false);
                }

                // Mise à jour des états utilisateur
                setRole(data.role || "vendeuse");
                setSocieteId(data.societeId || null);
                setIsLocked(data.locked === true || data.isLocked === true);
                setIsOwner(data.isOwner === true); // ✅ État propriétaire
                setIsActive(data.active !== false && data.isActive !== false);
                setAdminPopup(data.adminPopup || null);
                setPaymentWarning(data.paymentWarning || null);

                // Construire l'objet utilisateur enrichi
                setUser({
                  ...firebaseUser,
                  ...data,
                  societeId: data.societeId || null,
                  role: data.role || "vendeuse",
                  locked: data.locked === true || data.isLocked === true,
                  deleted: data.deleted === true,
                  isOwner: data.isOwner === true, // ✅ Propriétaire
                  active: data.active !== false && data.isActive !== false,
                  adminPopup: data.adminPopup || null,
                  paymentWarning: data.paymentWarning || null,
                });
              } else {
                // Document n'existe pas - créer avec des valeurs par défaut
                console.log("[auth] Document utilisateur n'existe pas, création avec défauts");
                const defaultData = {
                  role: "vendeuse",
                  societeId: null,
                  locked: false,
                  deleted: false,
                  isOwner: false, // ✅ Pas propriétaire par défaut
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
              
              // ✅ IMPORTANT: Marquer le chargement comme terminé SEULEMENT ici
              setLoading(false);
            },
            (error) => {
              console.error("Erreur lors de l'écoute du document utilisateur:", error);
              
              // En cas d'erreur de permissions, ne pas déconnecter
              if (error.code === 'permission-denied') {
                console.warn("[auth] Permission refusée - accès restreint mais pas de déconnexion");
                // Définir des valeurs par défaut restrictives
                setRole("vendeuse");
                setSocieteId(null);
                setIsLocked(true); // Verrouillé par sécurité
                setIsDeleted(false);
                setIsOwner(false); // ✅ Pas propriétaire en cas d'erreur
                setIsActive(false); // Désactivé par sécurité
                setAdminPopup("Erreur de permissions - contactez l'administrateur");
                setPaymentWarning(null);
                
                setUser({
                  ...firebaseUser,
                  societeId: null,
                  role: "vendeuse",
                  locked: true,
                  deleted: false,
                  isOwner: false, // ✅ Pas propriétaire en cas d'erreur
                  active: false,
                  adminPopup: "Erreur de permissions - contactez l'administrateur",
                  paymentWarning: null,
                });
              } else {
                // Pour d'autres erreurs, définir des valeurs par défaut normales
                console.warn("[auth] Erreur réseau ou autre, valeurs par défaut");
                setRole("vendeuse");
                setSocieteId(null);
                setIsLocked(false);
                setIsDeleted(false);
                setIsOwner(false); // ✅ Pas propriétaire par défaut
                setIsActive(true);
                setAdminPopup(null);
                setPaymentWarning(null);
                
                setUser({
                  ...firebaseUser,
                  societeId: null,
                  role: "vendeuse",
                  locked: false,
                  deleted: false,
                  isOwner: false, // ✅ Pas propriétaire par défaut
                  active: true,
                  adminPopup: null,
                  paymentWarning: null,
                });
              }
              
              setLoading(false);
            }
          );
        } catch (e) {
          console.error("Erreur lors de l'initialisation de l'écoute utilisateur:", e);
          
          // Valeurs par défaut en cas d'erreur critique
          setRole("vendeuse");
          setSocieteId(null);
          setIsLocked(false);
          setIsDeleted(false);
          setIsOwner(false); // ✅ Pas propriétaire par défaut
          setIsActive(true);
          setAdminPopup(null);
          setPaymentWarning(null);
          
          setUser({
            ...firebaseUser,
            societeId: null,
            role: "vendeuse",
            locked: false,
            deleted: false,
            isOwner: false, // ✅ Pas propriétaire par défaut
            active: true,
            adminPopup: null,
            paymentWarning: null,
          });
          
          setLoading(false);
        }
      } else {
        // ✅ Utilisateur vraiment déconnecté (pas de token Firebase)
        console.log("[auth] Utilisateur déconnecté de Firebase Auth");
        setRole(null);
        setSocieteId(null);
        setUser(null);
        setIsLocked(false);
        setIsDeleted(false);
        setIsOwner(false); // ✅ Pas propriétaire si déconnecté
        setIsActive(true);
        setAdminPopup(null);
        setPaymentWarning(null);
        setSocieteName(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) {
        unsubscribeUser();
      }
    };
  }, []);

  // Résoudre le nom de la société
  useEffect(() => {
    let unsubscribeSociete = null;
    setSocieteName(null);

    if (!user || !societeId || isDeleted) {
      return () => {
        if (unsubscribeSociete) unsubscribeSociete();
      };
    }

    try {
      const ref = doc(db, "societe", societeId);
      unsubscribeSociete = onSnapshot(
        ref,
        async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setSocieteName(data?.nom || data?.name || "Société");
          } else {
            // Fallback pour anciens projets
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
        (err) => {
          console.warn("Erreur écoute société:", err);
          setSocieteName("Société (erreur de chargement)");
        }
      );
    } catch (e) {
      console.warn("Erreur init écoute société:", e);
      setSocieteName("Société (erreur)");
    }

    return () => {
      if (unsubscribeSociete) unsubscribeSociete();
    };
  }, [user, societeId, isDeleted]);

  // ✅ Permissions avec vérifications de sécurité et gestion propriétaire
  const can = (permission) => {
    // Si l'utilisateur est supprimé, aucune permission
    if (isDeleted || !user || !authReady) return false;
    
    // Si compte verrouillé et pas propriétaire, aucune permission
    if (isLocked && !isOwner) return false;
    
    // Si compte inactif et pas propriétaire, aucune permission  
    if (!isActive && !isOwner) return false;
    
    // 🔑 PERMISSIONS SPÉCIALES PROPRIÉTAIRE UNIQUEMENT
    const ownerOnlyPermissions = [
      "gerer_utilisateurs",
      "modifier_roles", 
      "voir_gestion_utilisateurs",
      "promouvoir_utilisateur",
      "retrograder_utilisateur"
    ];
    
    // Si c'est une permission propriétaire, vérifier strictement
    if (ownerOnlyPermissions.includes(permission)) {
      return isOwner && role === "docteur" && !isDeleted && isActive && authReady;
    }
    
    // Le propriétaire peut TOUT faire (même si techniquement verrouillé par erreur)
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
        // ❌ RETIRÉ: "gerer_utilisateurs" maintenant réservé au propriétaire
      ],
      vendeuse: [
        "voir_ventes", 
        "ajouter_vente", 
        "voir_stock", 
        "voir_invitations",
        "voir_dashboard"
      ],
    };
    
    if (!role) return false;
    return (rolePermissions[role] || []).includes(permission);
  };

  // ✅ Vérifier l'accès global à l'application
  const canAccessApp = () => {
    if (!user || !authReady) return false;
    if (isDeleted) return false; // Compte supprimé = pas d'accès
    if (!isActive && !isOwner) return false; // Compte inactif (sauf propriétaire)
    if (isLocked && !isOwner) return false; // Compte verrouillé (sauf propriétaire)
    return true;
  };

  // 🔑 PERMISSIONS DE GESTION STRICTEMENT PROPRIÉTAIRE
  const canManageUsers = () => {
    return isOwner && user && !isDeleted && isActive && authReady && role === "docteur";
  };

  const canChangeRoles = () => {
    return isOwner && user && !isDeleted && isActive && authReady && role === "docteur";
  };

  const canDeleteSociete = () => {
    return isOwner && user && !isDeleted && isActive && authReady && role === "docteur";
  };

  // ❌ Impossible de promouvoir quelqu'un d'autre propriétaire
  const canPromoteToOwner = () => {
    return false;
  };

  // ❌ Impossible de supprimer le propriétaire
  const canDeleteOwner = () => {
    return false;
  };

  // ❌ Impossible de verrouiller le propriétaire
  const canLockOwner = () => {
    return false;
  };

  // ✅ Contrôle strict des modifications utilisateur
  const canModifyUser = (targetUserId, targetUserIsOwner = false) => {
    if (!canManageUsers()) return false;
    if (targetUserIsOwner) return false; // Propriétaire intouchable
    if (targetUserId === user?.uid) return false; // Pas d'auto-modification
    return true;
  };

  const canChangeUserRole = (targetUserId, targetUserIsOwner = false, currentRole, newRole) => {
    if (!canChangeRoles()) return false;
    if (targetUserIsOwner) return false;
    if (targetUserId === user?.uid) return false;
    if (!["docteur", "vendeuse"].includes(newRole)) return false;
    return true;
  };

  // 🔑 FONCTIONS SPÉCIFIQUES GESTION DES RÔLES
  const canPromoteToDoctor = (targetUserId, targetUserIsOwner = false, currentRole) => {
    if (!canChangeRoles()) return false;
    if (targetUserIsOwner) return false;
    if (targetUserId === user?.uid) return false;
    if (currentRole !== "vendeuse") return false; // Seulement vendeuse → docteur
    return true;
  };

  const canDemoteToVendeuse = (targetUserId, targetUserIsOwner = false, currentRole) => {
    if (!canChangeRoles()) return false;
    if (targetUserIsOwner) return false; // Propriétaire ne peut pas être rétrogradé
    if (targetUserId === user?.uid) return false;
    if (currentRole !== "docteur") return false; // Seulement docteur → vendeuse
    return true;
  };

  // ✅ Messages informatifs
  const getBlockMessage = () => {
    if (!user || !authReady) return "Connexion en cours...";
    if (isDeleted) return "Ce compte a été supprimé par l'administrateur";
    if (!isActive && !isOwner) return "Compte désactivé par l'administrateur";
    if (isLocked && !isOwner) return "Compte temporairement verrouillé";
    return null;
  };

  const isAdmin = () => {
    return role === "docteur" && canAccessApp();
  };

  const isSuperAdmin = () => {
    return isOwner && canAccessApp();
  };

  const getUserStats = () => {
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
      privileges: {
        canManageUsers: canManageUsers(),
        canChangeRoles: canChangeRoles(),
        canDeleteSociete: canDeleteSociete(),
        isUntouchable: isOwner,
        canPromoteUsers: canChangeRoles(),
        canDemoteUsers: canChangeRoles(),
      }
    };
  };

  const getPermissionMessages = () => {
    const messages = [];
    
    if (!authReady) {
      messages.push({
        type: "info",
        text: "Vérification des permissions en cours..."
      });
      return messages;
    }
    
    if (isOwner) {
      messages.push({
        type: "success",
        text: "👑 Vous êtes le propriétaire permanent de cette pharmacie"
      });
    }
    
    if (isDeleted) {
      messages.push({
        type: "error",
        text: "⚠️ Ce compte a été supprimé par l'administrateur"
      });
    } else if (isLocked && !isOwner) {
      messages.push({
        type: "warning", 
        text: "🔒 Votre compte est temporairement verrouillé"
      });
    } else if (!isActive && !isOwner) {
      messages.push({
        type: "warning",
        text: "⏸️ Votre compte est désactivé"
      });
    }
    
    if (adminPopup) {
      messages.push({
        type: "info",
        text: "📢 " + adminPopup
      });
    }
    
    if (paymentWarning) {
      messages.push({
        type: "warning",
        text: "💳 " + paymentWarning
      });
    }
    
    return messages;
  };

  // 🔑 FONCTIONS D'AIDE POUR UI
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

  // ✅ Valeur du contexte
  const contextValue = {
    // États de base
    role,
    user,
    societeId,
    societeName,
    loading,
    authReady, // ✅ Indique si Firebase Auth est initialisé
    
    // États de sécurité  
    isLocked,
    isDeleted,
    isActive,
    isOwner, // ✅ État propriétaire
    
    // Notifications
    adminPopup,
    paymentWarning,
    
    // Vérifications de base
    can,
    canAccessApp,
    getBlockMessage,
    isAdmin,
    isSuperAdmin,
    getUserStats,
    
    // 🔑 GESTIONS STRICTES PROPRIÉTAIRE
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
    
    // Utilitaires UI
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
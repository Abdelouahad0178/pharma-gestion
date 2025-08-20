// src/contexts/UserRoleContext.js
import React, { createContext, useContext, useState, useEffect } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

// Création du contexte
const UserRoleContext = createContext();

// Hook custom pour accès direct
export function useUserRole() {
  return useContext(UserRoleContext);
}

// Provider du contexte
export function UserRoleProvider({ children }) {
  const [role, setRole] = useState(null);           // ex: "docteur", "vendeuse"
  const [user, setUser] = useState(null);           // Utilisateur Firebase enrichi
  const [societeId, setSocieteId] = useState(null); // Id de la société partagée
  const [societeName, setSocieteName] = useState(null); // ✅ Nom lisible de la société
  const [loading, setLoading] = useState(true);     // Etat de chargement
  const [isLocked, setIsLocked] = useState(false);  // Compte verrouillé
  const [adminPopup, setAdminPopup] = useState(null); // Popup admin
  const [paymentWarning, setPaymentWarning] = useState(null); // Avertissement paiement
  const [isActive, setIsActive] = useState(true);   // Compte actif

  useEffect(() => {
    const auth = getAuth();
    let unsubscribeUser = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);

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
            (snap) => {
              if (snap.exists()) {
                const data = snap.data();

                // Mise à jour des états
                setRole(data.role || "vendeuse");
                setSocieteId(data.societeId || null);
                setIsLocked(data.locked === true);
                setIsActive(data.active !== false);
                setAdminPopup(data.adminPopup || null);
                setPaymentWarning(data.paymentWarning || null);

                setUser({
                  ...firebaseUser,
                  ...data,
                  societeId: data.societeId || null,
                  role: data.role || "vendeuse",
                  locked: data.locked === true,
                  active: data.active !== false,
                  adminPopup: data.adminPopup || null,
                  paymentWarning: data.paymentWarning || null,
                });
              } else {
                // Document n'existe pas, valeurs par défaut
                const defaultData = {
                  role: "vendeuse",
                  societeId: null,
                  locked: false,
                  active: true,
                  adminPopup: null,
                  paymentWarning: null,
                };

                setRole(defaultData.role);
                setSocieteId(defaultData.societeId);
                setIsLocked(defaultData.locked);
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
            (error) => {
              console.error("Erreur lors de l'écoute du document utilisateur:", error);
              // En cas d'erreur, définir des valeurs par défaut
              setRole("vendeuse");
              setSocieteId(null);
              setIsLocked(false);
              setIsActive(true);
              setAdminPopup(null);
              setPaymentWarning(null);
              setUser({
                ...firebaseUser,
                societeId: null,
                role: "vendeuse",
                locked: false,
                active: true,
                adminPopup: null,
                paymentWarning: null,
              });
              setLoading(false);
            }
          );
        } catch (e) {
          console.error("Erreur lors de l'initialisation de l'écoute utilisateur:", e);
          setRole("vendeuse");
          setSocieteId(null);
          setIsLocked(false);
          setIsActive(true);
          setAdminPopup(null);
          setPaymentWarning(null);
          setUser({
            ...firebaseUser,
            societeId: null,
            role: "vendeuse",
            locked: false,
            active: true,
            adminPopup: null,
            paymentWarning: null,
          });
          setLoading(false);
        }
      } else {
        // Utilisateur déconnecté
        setRole(null);
        setSocieteId(null);
        setUser(null);
        setIsLocked(false);
        setIsActive(true);
        setAdminPopup(null);
        setPaymentWarning(null);
        setSocieteName(null);
        setLoading(false);
      }
    });

    // Cleanup function
    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) {
        unsubscribeUser();
      }
    };
  }, []);

  // ✅ Résoudre le nom lisible de la société à partir de societeId
  useEffect(() => {
    let unsubscribeSociete = null;
    setSocieteName(null);

    if (!user || !societeId) {
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
            // Priorité au champ 'nom', fallback 'name'
            setSocieteName(data?.nom || data?.name || null);
          } else {
            // Fallback pour anciens projets utilisant la collection 'societes'
            try {
              const oldRef = doc(db, "societes", societeId);
              const oldSnap = await getDoc(oldRef);
              if (oldSnap.exists()) {
                const d = oldSnap.data();
                setSocieteName(d?.nom || d?.name || null);
              } else {
                setSocieteName(null);
              }
            } catch {
              setSocieteName(null);
            }
          }
        },
        (err) => {
          console.warn("Erreur écoute société:", err);
          setSocieteName(null);
        }
      );
    } catch (e) {
      console.warn("Erreur init écoute société:", e);
      setSocieteName(null);
    }

    return () => {
      if (unsubscribeSociete) unsubscribeSociete();
    };
  }, [user, societeId]);

  const can = (permission) => {
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
        "gerer_utilisateurs",
        "voir_invitations",
      ],
      vendeuse: ["voir_ventes", "ajouter_vente", "voir_stock", "voir_invitations"],
    };
    if (!role) return false;
    if (role === "docteur") return true;
    return (rolePermissions[role] || []).includes(permission);
  };

  // Vérifier si l'utilisateur peut accéder à l'application
  const canAccessApp = () => {
    return user && isActive && !isLocked;
  };

  // Obtenir le message de blocage approprié
  const getBlockMessage = () => {
    if (!user) return "Non connecté";
    if (!isActive) return "Compte désactivé par l'administrateur";
    if (isLocked) return "Compte verrouillé par l'administrateur";
    return null;
  };

  const contextValue = {
    role,
    user,
    societeId,
    societeName,   // ✅ Utilise ceci dans l'UI au lieu de societeId
    loading,
    isLocked,
    isActive,
    adminPopup,
    paymentWarning,
    can,
    canAccessApp,
    getBlockMessage,
  };

  return (
    <UserRoleContext.Provider value={contextValue}>
      {children}
    </UserRoleContext.Provider>
  );
}

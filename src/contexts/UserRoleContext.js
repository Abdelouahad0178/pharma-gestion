import React, { createContext, useContext, useState, useEffect } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

// Création du contexte
const UserRoleContext = createContext();

// Hook custom pour accès direct
export function useUserRole() {
  return useContext(UserRoleContext);
}

// Provider du contexte
export function UserRoleProvider({ children }) {
  const [role, setRole] = useState(null);         // ex: "docteur", "vendeuse"
  const [user, setUser] = useState(null);         // Utilisateur Firebase enrichi (avec societeId)
  const [societeId, setSocieteId] = useState(null); // Id de la société partagée
  const [societeInfo, setSocieteInfo] = useState(null); // Infos de la société
  const [loading, setLoading] = useState(true);   // Etat de chargement
  const [userActive, setUserActive] = useState(true); // Statut actif de l'utilisateur

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          // Va chercher le document user (avec role + societeId + active)
          const userRef = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(userRef);
          
          if (snap.exists()) {
            const userData = snap.data();
            
            // Vérifier si l'utilisateur est actif
            const isActive = userData.active !== false; // Par défaut true si le champ n'existe pas
            
            if (!isActive) {
              // L'utilisateur est désactivé, le déconnecter immédiatement
              await signOut(auth);
              setRole(null);
              setSocieteId(null);
              setSocieteInfo(null);
              setUser(null);
              setUserActive(false);
              setLoading(false);
              return;
            }
            
            setRole(userData.role || "vendeuse");
            setSocieteId(userData.societeId || null);
            setUserActive(isActive);
            
            // Charger les informations de la société si disponible
            if (userData.societeId) {
              try {
                const societeRef = doc(db, "societes", userData.societeId);
                const societeSnap = await getDoc(societeRef);
                if (societeSnap.exists()) {
                  setSocieteInfo(societeSnap.data());
                } else {
                  setSocieteInfo(null);
                }
              } catch (societeError) {
                console.error("Erreur lors du chargement des infos société:", societeError);
                setSocieteInfo(null);
              }
            } else {
              setSocieteInfo(null);
            }
            
            setUser({
              ...firebaseUser,
              societeId: userData.societeId || null,
              role: userData.role || "vendeuse",
              active: isActive,
              isCompanyOwner: userData.isCompanyOwner || false,
              invitedBy: userData.invitedBy || null
            });
          } else {
            // Utilisateur sans document = problème, déconnecter
            console.warn("Utilisateur sans document user associé");
            await signOut(auth);
            setRole(null);
            setSocieteId(null);
            setSocieteInfo(null);
            setUser(null);
            setUserActive(false);
          }
        } catch (e) {
          console.error("Erreur lors de la vérification du statut utilisateur:", e);
          // En cas d'erreur, déconnecter par sécurité
          await signOut(auth);
          setRole(null);
          setSocieteId(null);
          setSocieteInfo(null);
          setUser(null);
          setUserActive(false);
        }
      } else {
        setRole(null);
        setSocieteId(null);
        setSocieteInfo(null);
        setUser(null);
        setUserActive(true);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Gestion des permissions
  const can = (permission) => {
    // Si l'utilisateur n'est pas actif, aucune permission
    if (!userActive) return false;
    
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
        "gerer_utilisateurs", // Gestion des utilisateurs
        "gerer_invitations",  // Gestion des invitations
        "gerer_societe",      // Gestion des paramètres de société
      ],
      vendeuse: [
        "voir_ventes",
        "ajouter_vente",
        "voir_stock",
        "voir_dashboard",
        "voir_devis_factures",
        "voir_paiements",
      ],
    };
    if (!role) return false;
    if (role === "docteur") return true;
    return (rolePermissions[role] || []).includes(permission);
  };

  // Fonction utilitaire pour vérifier si l'utilisateur est propriétaire de la société
  const isCompanyOwner = () => {
    return user?.isCompanyOwner === true;
  };

  // Fonction utilitaire pour obtenir le nom de la société
  const getSocieteName = () => {
    return societeInfo?.name || societeId || "Société inconnue";
  };

  return (
    <UserRoleContext.Provider value={{ 
      role, 
      user, 
      societeId, 
      societeInfo,
      loading, 
      userActive, 
      can,
      isCompanyOwner,
      getSocieteName
    }}>
      {children}
    </UserRoleContext.Provider>
  );
}
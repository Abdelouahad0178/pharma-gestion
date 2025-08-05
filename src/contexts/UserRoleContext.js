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
  const [role, setRole] = useState(null);         // ex: "docteur", "vendeuse"
  const [user, setUser] = useState(null);         // Utilisateur Firebase enrichi
  const [societeId, setSocieteId] = useState(null); // Id de la société partagée
  const [loading, setLoading] = useState(true);   // État de chargement
  const [userDocListener, setUserDocListener] = useState(null); // Pour le listener Firestore

  // Fonction de log pour debug
  const log = (message, data = null) => {
    console.log(`[UserRoleContext] ${message}`, data || "");
  };

  // Fonction pour rafraîchir les données utilisateur
  const refreshUserData = async () => {
    const auth = getAuth();
    const firebaseUser = auth.currentUser;
    
    if (firebaseUser) {
      log("Rafraîchissement des données utilisateur", firebaseUser.uid);
      try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
          const data = snap.data();
          setRole(data.role || "vendeuse");
          setSocieteId(data.societeId || null);
          setUser({
            ...firebaseUser,
            societeId: data.societeId || null,
            role: data.role || "vendeuse"
          });
          log("Données rafraîchies", { role: data.role, societeId: data.societeId });
        }
      } catch (e) {
        log("Erreur lors du rafraîchissement", e);
      }
    }
  };

  useEffect(() => {
    log("Initialisation du contexte utilisateur");
    const auth = getAuth();
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      log("Changement d'état d'authentification", firebaseUser?.uid);
      setLoading(true);
      
      // Nettoyer l'ancien listener si existe
      if (userDocListener) {
        log("Nettoyage de l'ancien listener");
        userDocListener();
        setUserDocListener(null);
      }
      
      if (firebaseUser) {
        try {
          log("Utilisateur connecté, récupération des données", firebaseUser.uid);
          
          // Configurer un listener en temps réel sur le document utilisateur
          const userRef = doc(db, "users", firebaseUser.uid);
          
          const unsubscribeUser = onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              log("Données utilisateur mises à jour", data);
              
              const userRole = data.role || "vendeuse";
              const userSocieteId = data.societeId || null;
              
              setRole(userRole);
              setSocieteId(userSocieteId);
              setUser({
                ...firebaseUser,
                societeId: userSocieteId,
                role: userRole
              });
              
              if (!userSocieteId) {
                log("Aucune société assignée");
              } else {
                log("Société assignée", userSocieteId);
              }
              
              log("Utilisateur configuré avec succès", {
                uid: firebaseUser.uid,
                role: userRole,
                societeId: userSocieteId
              });
            } else {
              log("Document utilisateur inexistant, valeurs par défaut");
              setRole("vendeuse");
              setSocieteId(null);
              setUser({
                ...firebaseUser,
                societeId: null,
                role: "vendeuse"
              });
            }
            setLoading(false);
            log("Chargement terminé");
          }, (error) => {
            log("Erreur listener Firestore", error);
            setRole("vendeuse");
            setSocieteId(null);
            setUser({
              ...firebaseUser,
              societeId: null,
              role: "vendeuse"
            });
            setLoading(false);
          });
          
          setUserDocListener(() => unsubscribeUser);
          
        } catch (e) {
          log("Erreur lors de la récupération des données", e);
          setRole("vendeuse");
          setSocieteId(null);
          setUser({
            ...firebaseUser,
            societeId: null,
            role: "vendeuse"
          });
          setLoading(false);
        }
      } else {
        log("Utilisateur déconnecté");
        setRole(null);
        setSocieteId(null);
        setUser(null);
        setLoading(false);
      }
    });
    
    return () => {
      log("Nettoyage de l'abonnement");
      unsubscribeAuth();
      if (userDocListener) {
        userDocListener();
      }
    };
  }, []);

  // Gestion des permissions
  const can = (permission) => {
    const rolePermissions = {
      docteur: [
        "voir_achats",
        "ajouter_achat",
        "modifier_achat",
        "supprimer_achat",
        "voir_ventes",
        "ajouter_vente",
        "modifier_vente",
        "supprimer_vente",
        "voir_stock",
        "ajouter_stock",
        "modifier_stock",
        "supprimer_stock",
        "voir_retours",
        "ajouter_retour",
        "annuler_retour",
        "parametres",
        "gerer_societe",
        "voir_devis_factures",
        "voir_paiements",
        "voir_dashboard",
      ],
      vendeuse: [
        "voir_ventes",
        "ajouter_vente",
        "voir_stock",
        "ajouter_stock",
        "voir_retours",
        "ajouter_retour",
        "voir_devis_factures",
        "voir_paiements",
        "voir_dashboard",
      ],
    };
    
    if (!role) {
      log("Permission refusée - pas de rôle:", permission);
      return false;
    }
    
    // Si docteur, toutes les permissions
    if (role === "docteur") {
      log(`Permission ${permission} pour rôle ${role}: true`);
      return true;
    }
    
    // Sinon vérifier dans la liste des permissions du rôle
    const hasPermission = (rolePermissions[role] || []).includes(permission);
    log(`Permission ${permission} pour rôle ${role}: ${hasPermission}`);
    return hasPermission;
  };

  // Fonction pour vérifier si l'utilisateur a une société
  const hasSociete = () => {
    return societeId !== null && societeId !== undefined && societeId !== "";
  };

  // Fonctions helper pour les permissions courantes
  const canModify = () => {
    // Seul le docteur peut modifier
    return role === "docteur";
  };

  const canDelete = () => {
    // Seul le docteur peut supprimer
    return role === "docteur";
  };

  const canViewAchats = () => {
    return can("voir_achats");
  };

  const canViewVentes = () => {
    return can("voir_ventes");
  };

  const canAddVente = () => {
    return can("ajouter_vente");
  };

  const value = {
    role,
    user,
    societeId,
    loading,
    can,
    hasSociete,
    refreshUserData,
    canModify,
    canDelete,
    canViewAchats,
    canViewVentes,
    canAddVente
  };

  log("Rendu du contexte", {
    role,
    societeId,
    loading,
    userUid: user?.uid
  });

  return (
    <UserRoleContext.Provider value={value}>
      {children}
    </UserRoleContext.Provider>
  );
}
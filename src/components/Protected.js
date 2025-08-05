import React from "react";
import { useUserRole } from "../contexts/UserRoleContext";

export default function Protected({ permission, children }) {
  const { loading, user, can, error } = useUserRole();

  // En cours de chargement
  if (loading) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center",
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      }}>
        <div style={{ fontSize: "1.2rem", color: "#1c355e", marginBottom: "10px" }}>
          Chargement...
        </div>
        <div style={{ fontSize: "0.9rem", color: "#7a8fa8" }}>
          Vérification des permissions...
        </div>
      </div>
    );
  }

  // Si erreur
  if (error) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center", 
        color: "#a32",
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      }}>
        <div style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
          ⚠️ Erreur de chargement
        </div>
        <div style={{ fontSize: "0.9rem" }}>
          {error}
        </div>
        <button 
          onClick={() => window.location.reload()} 
          style={{
            marginTop: "20px",
            padding: "10px 20px",
            backgroundColor: "#3272e0",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer"
          }}
        >
          Recharger la page
        </button>
      </div>
    );
  }

  // Si non connecté
  if (!user) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center", 
        color: "#a32",
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      }}>
        <div style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
          🔒 Non connecté
        </div>
        <div style={{ fontSize: "0.9rem" }}>
          Veuillez vous connecter pour accéder à cette page.
        </div>
      </div>
    );
  }

  // Si pas la permission
  if (permission && !can(permission)) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center", 
        color: "#bc3453",
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      }}>
        <div style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
          🚫 Accès refusé
        </div>
        <div style={{ fontSize: "0.9rem" }}>
          Vous n'avez pas l'autorisation d'accéder à cette page.
        </div>
        <div style={{ fontSize: "0.8rem", marginTop: "10px", color: "#7a8fa8" }}>
          Permission requise: {permission}
        </div>
      </div>
    );
  }

  // Affiche le contenu si tout est ok
  return <>{children}</>;
}
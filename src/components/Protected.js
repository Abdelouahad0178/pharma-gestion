// src/components/Protected.js
import React from "react";
import { useUserRole } from "../contexts/UserRoleContext";

export default function Protected({ permission, children }) {
  const { loading, user, userActive, can } = useUserRole();

  // En cours de chargement
  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Chargement...</div>;

  // Si non connecté
  if (!user) return <div style={{ padding: 40, textAlign: "center", color: "#a32" }}>Non connecté.</div>;

  // Si l'utilisateur n'est pas actif
  if (!userActive) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center", 
        color: "#bc3453",
        background: "#ffebee",
        border: "2px solid #f44336",
        borderRadius: 8,
        margin: 20,
        maxWidth: 600,
        marginLeft: "auto",
        marginRight: "auto"
      }}>
        <h2 style={{ color: "#d32f2f", marginBottom: 15 }}>🚫 Compte désactivé</h2>
        <p style={{ fontSize: "1.1em", lineHeight: 1.6 }}>
          Votre compte a été désactivé par un administrateur. 
          Vous ne pouvez plus accéder aux fonctionnalités de l'application.
        </p>
        <p style={{ fontSize: "0.9em", color: "#666", marginTop: 20 }}>
          Si vous pensez qu'il s'agit d'une erreur, contactez votre responsable ou l'administrateur du système.
        </p>
      </div>
    );
  }

  // Si pas la permission
  if (!can(permission)) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#bc3453" }}>
        Accès refusé : vous n'avez pas l'autorisation d'accéder à cette page.
      </div>
    );
  }

  // Affiche le contenu si tout est ok
  return <>{children}</>;
}
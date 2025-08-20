// src/components/Protected.js
import React from "react";
import { useUserRole } from "../contexts/UserRoleContext";

export default function Protected({ permission, children }) {
  const { loading, user, can, canAccessApp, getBlockMessage } = useUserRole();

  // En cours de chargement
  if (loading) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center",
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        color: '#e5eeff'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
        <div style={{ fontSize: '18px' }}>Chargement...</div>
      </div>
    );
  }

  // Si non connecté
  if (!user) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center", 
        color: "#dc2626",
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚫</div>
        <div style={{ fontSize: '18px' }}>Non connecté.</div>
        <div style={{ marginTop: '10px', fontSize: '14px', color: '#8892b0' }}>
          Veuillez vous connecter pour accéder à cette page.
        </div>
      </div>
    );
  }

  // Si le compte ne peut pas accéder à l'application (verrouillé/désactivé)
  if (!canAccessApp()) {
    return (
      <div style={{
        padding: 40,
        textAlign: "center",
        color: "#dc2626",
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>
          Accès refusé
        </div>
        <div style={{ fontSize: '14px', color: '#8892b0' }}>
          {getBlockMessage()}
        </div>
      </div>
    );
  }

  // Si pas la permission spécifique
  if (permission && !can(permission)) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: "center", 
        color: "#f59e0b",
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>
          Permission insuffisante
        </div>
        <div style={{ fontSize: '14px', color: '#8892b0' }}>
          Vous n'avez pas l'autorisation d'accéder à cette page.
        </div>
      </div>
    );
  }

  // Affiche le contenu si tout est ok
  return <>{children}</>;
}
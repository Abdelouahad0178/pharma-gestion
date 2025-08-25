// src/components/Protected.js
import React from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";

export default function Protected({ permission, children }) {
  const { 
    loading, 
    user, 
    can, 
    canAccessApp, 
    getBlockMessage, 
    isDeleted,
    isLocked,
    isActive,
    role 
  } = useUserRole();
  
  const navigate = useNavigate();

  // Fonction pour gérer la déconnexion
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  };

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
        color: '#e5eeff',
        background: 'linear-gradient(120deg, #223049 0%, #344060 100%)'
      }}>
        <div style={{ 
          fontSize: '48px', 
          marginBottom: '20px',
          animation: 'pulse 2s infinite'
        }}>⏳</div>
        <div style={{ fontSize: '18px', fontWeight: 600 }}>Chargement...</div>
        <div style={{ fontSize: '14px', color: '#8892b0', marginTop: '10px' }}>
          Vérification des permissions en cours
        </div>
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
        flexDirection: 'column',
        background: 'linear-gradient(120deg, #2d1b1b 0%, #3d2020 100%)'
      }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🚫</div>
        <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '10px' }}>
          Non connecté
        </div>
        <div style={{ fontSize: '16px', color: '#8892b0', marginBottom: '20px' }}>
          Veuillez vous connecter pour accéder à cette page.
        </div>
        <button
          onClick={() => navigate("/login")}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.target.style.transform = 'scale(1)'}
        >
          Se connecter
        </button>
      </div>
    );
  }

  // NOUVEAU: Vérification spécifique pour utilisateur supprimé
  if (isDeleted) {
    return (
      <div style={{
        padding: 40,
        textAlign: "center",
        color: "#dc2626",
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        background: 'linear-gradient(120deg, #2d1b1b 0%, #3d2020 100%)'
      }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🗑️</div>
        <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '10px' }}>
          Compte supprimé
        </div>
        <div style={{ fontSize: '16px', color: '#8892b0', marginBottom: '10px' }}>
          Ce compte a été supprimé par l'administrateur.
        </div>
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
          Contactez l'administrateur si vous pensez qu'il s'agit d'une erreur.
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  // Si le compte ne peut pas accéder à l'application (verrouillé/désactivé)
  if (!canAccessApp()) {
    const getStatusInfo = () => {
      if (isLocked) {
        return {
          icon: '🔒',
          title: 'Compte verrouillé',
          subtitle: 'Votre compte a été temporairement verrouillé',
          color: '#f59e0b',
          background: 'linear-gradient(120deg, #2d2416 0%, #3d3020 100%)'
        };
      }
      if (!isActive) {
        return {
          icon: '⏸️',
          title: 'Compte désactivé',
          subtitle: 'Votre compte a été désactivé par l\'administrateur',
          color: '#dc2626',
          background: 'linear-gradient(120deg, #2d1b1b 0%, #3d2020 100%)'
        };
      }
      return {
        icon: '🚫',
        title: 'Accès refusé',
        subtitle: 'Accès à l\'application refusé',
        color: '#dc2626',
        background: 'linear-gradient(120deg, #2d1b1b 0%, #3d2020 100%)'
      };
    };

    const statusInfo = getStatusInfo();

    return (
      <div style={{
        padding: 40,
        textAlign: "center",
        color: statusInfo.color,
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        background: statusInfo.background
      }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>
          {statusInfo.icon}
        </div>
        <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '10px' }}>
          {statusInfo.title}
        </div>
        <div style={{ fontSize: '16px', color: '#8892b0', marginBottom: '10px' }}>
          {statusInfo.subtitle}
        </div>
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
          {getBlockMessage()}
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            onClick={handleLogout}
            style={{
              background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Se déconnecter
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Actualiser
          </button>
        </div>
      </div>
    );
  }

  // Si pas la permission spécifique
  if (permission && !can(permission)) {
    const getPermissionInfo = () => {
      const permissionMessages = {
        'voir_achats': 'Seul le pharmacien peut accéder aux achats',
        'gerer_utilisateurs': 'Seul le pharmacien peut gérer les utilisateurs',
        'parametres': 'Seul le pharmacien peut accéder aux paramètres',
        'voir_ventes': 'Vous n\'avez pas accès aux ventes',
        'ajouter_stock': 'Vous n\'avez pas accès à la gestion du stock'
      };
      
      return permissionMessages[permission] || 'Permission insuffisante pour cette action';
    };

    return (
      <div style={{
        padding: 40,
        textAlign: "center",
        color: "#f59e0b",
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        background: 'linear-gradient(120deg, #2d2416 0%, #3d3020 100%)'
      }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>⚠️</div>
        <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '10px' }}>
          Permission insuffisante
        </div>
        <div style={{ fontSize: '16px', color: '#8892b0', marginBottom: '10px' }}>
          {getPermissionInfo()}
        </div>
        <div style={{ 
          fontSize: '14px', 
          color: '#6b7280', 
          marginBottom: '10px',
          background: 'rgba(0,0,0,0.3)',
          padding: '8px 16px',
          borderRadius: '20px'
        }}>
          Votre rôle: <strong>{role}</strong>
        </div>
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
          Contactez l'administrateur pour plus d'informations.
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Retour au Dashboard
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  // Affiche le contenu si tout est ok
  return <>{children}</>;
}
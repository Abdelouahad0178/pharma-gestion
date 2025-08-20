// src/components/AccountLocked.js
import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useUserRole } from '../contexts/UserRoleContext';

export default function AccountLocked() {
  const { user, isLocked, isActive, getBlockMessage } = useUserRole();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };

  const getIcon = () => {
    if (isLocked) return '🔒';
    if (!isActive) return '🚫';
    return '⚠️';
  };

  const getTitle = () => {
    if (isLocked) return 'Compte Verrouillé';
    if (!isActive) return 'Compte Désactivé';
    return 'Accès Restreint';
  };

  const getMessage = () => {
    if (isLocked) {
      return 'Votre compte a été temporairement verrouillé par l\'administrateur. Cette mesure peut être due à des raisons de sécurité ou de conformité.';
    }
    if (!isActive) {
      return 'Votre compte a été désactivé par l\'administrateur. Vous ne pouvez plus accéder aux fonctionnalités de l\'application.';
    }
    return 'L\'accès à votre compte est actuellement restreint.';
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Inter, Arial, sans-serif'
    },
    card: {
      background: '#2b3951',
      borderRadius: '20px',
      padding: '40px',
      maxWidth: '500px',
      width: '100%',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      border: '2px solid',
      borderColor: isLocked ? '#dc2626' : '#f59e0b',
      textAlign: 'center',
      color: '#e5eeff'
    },
    icon: {
      fontSize: '80px',
      marginBottom: '20px',
      display: 'block'
    },
    title: {
      fontSize: '28px',
      fontWeight: '700',
      marginBottom: '20px',
      color: isLocked ? '#ef4444' : '#f59e0b'
    },
    message: {
      fontSize: '16px',
      lineHeight: '1.6',
      marginBottom: '30px',
      color: '#cbd5e1'
    },
    userInfo: {
      background: 'rgba(0, 0, 0, 0.2)',
      borderRadius: '10px',
      padding: '15px',
      marginBottom: '30px',
      fontSize: '14px'
    },
    contactInfo: {
      background: 'rgba(59, 130, 246, 0.1)',
      border: '1px solid #3b82f6',
      borderRadius: '10px',
      padding: '20px',
      marginBottom: '30px'
    },
    contactTitle: {
      fontSize: '16px',
      fontWeight: '600',
      marginBottom: '10px',
      color: '#60a5fa'
    },
    contactText: {
      fontSize: '14px',
      lineHeight: '1.5'
    },
    logoutButton: {
      background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      padding: '15px 30px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      width: '100%'
    },
    refreshButton: {
      background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      padding: '12px 25px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      marginBottom: '15px',
      width: '100%'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <span style={styles.icon}>{getIcon()}</span>
        
        <h1 style={styles.title}>{getTitle()}</h1>
        
        <p style={styles.message}>{getMessage()}</p>
        
        {user && (
          <div style={styles.userInfo}>
            <strong>Compte:</strong> {user.email}
            <br />
            <strong>Statut:</strong> {getBlockMessage()}
          </div>
        )}
        
        <div style={styles.contactInfo}>
          <div style={styles.contactTitle}>
            📞 Support Client
          </div>
          <div style={styles.contactText}>
            Pour toute question concernant votre compte ou pour une réactivation, 
            veuillez contacter notre équipe support :
            <br /><br />
            <strong>Email:</strong> support@anapharmo.com
            <br />
            <strong>Téléphone:</strong> +212 66 11 12 540
          </div>
        </div>
        
        <button
          style={styles.refreshButton}
          onClick={() => window.location.reload()}
          onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
          onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
        >
          🔄 Actualiser la page
        </button>
        
        <button
          style={styles.logoutButton}
          onClick={handleLogout}
          onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
          onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
        >
          🚪 Se déconnecter
        </button>
      </div>
    </div>
  );
}
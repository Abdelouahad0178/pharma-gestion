// src/components/AccountLocked.js
import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useUserRole } from '../contexts/UserRoleContext';

export default function AccountLocked() {
  const { user, isLocked, isActive, isDeleted, getBlockMessage } = useUserRole();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };

  const getAccountStatus = () => {
    if (isDeleted) {
      return {
        icon: '🗑️',
        title: 'Compte Supprimé',
        message: 'Votre compte a été définitivement supprimé par l\'administrateur. Cette action est généralement irréversible et peut être due à une violation des conditions d\'utilisation ou à une demande de suppression.',
        color: '#dc2626',
        bgColor: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
        borderColor: '#dc2626',
        isDefinitive: true
      };
    }
    
    if (isLocked) {
      return {
        icon: '🔒',
        title: 'Compte Verrouillé',
        message: 'Votre compte a été temporairement verrouillé par l\'administrateur. Cette mesure peut être due à des raisons de sécurité ou de conformité et peut être réversible.',
        color: '#f59e0b',
        bgColor: 'linear-gradient(135deg, #92400e 0%, #b45309 100%)',
        borderColor: '#f59e0b',
        isDefinitive: false
      };
    }
    
    if (!isActive) {
      return {
        icon: '⏸️',
        title: 'Compte Désactivé',
        message: 'Votre compte a été désactivé par l\'administrateur. Vous ne pouvez plus accéder aux fonctionnalités de l\'application jusqu\'à réactivation.',
        color: '#6b7280',
        bgColor: 'linear-gradient(135deg, #374151 0%, #4b5563 100%)',
        borderColor: '#6b7280',
        isDefinitive: false
      };
    }
    
    return {
      icon: '⚠️',
      title: 'Accès Restreint',
      message: 'L\'accès à votre compte est actuellement restreint pour des raisons indéterminées.',
      color: '#ef4444',
      bgColor: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
      borderColor: '#ef4444',
      isDefinitive: false
    };
  };

  const accountStatus = getAccountStatus();

  const formatDeletedDate = () => {
    if (!isDeleted || !user?.deletedAt) return '';
    
    try {
      const deletedDate = user.deletedAt.toDate ? 
        user.deletedAt.toDate() : 
        new Date(user.deletedAt);
      
      return deletedDate.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Date inconnue';
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: accountStatus.bgColor,
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
      borderColor: accountStatus.borderColor,
      textAlign: 'center',
      color: '#e5eeff',
      position: 'relative'
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
      color: accountStatus.color
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
      fontSize: '14px',
      textAlign: 'left'
    },
    deletedInfo: {
      background: 'rgba(220, 38, 38, 0.1)',
      border: '1px solid #dc2626',
      borderRadius: '10px',
      padding: '15px',
      marginBottom: '20px',
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
    urgentNotice: {
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid #ef4444',
      borderRadius: '10px',
      padding: '15px',
      marginBottom: '20px',
      fontSize: '14px',
      color: '#fca5a5'
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
    },
    disabledButton: {
      background: '#4b5563',
      cursor: 'not-allowed',
      opacity: 0.6
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <span style={styles.icon}>{accountStatus.icon}</span>
        
        <h1 style={styles.title}>{accountStatus.title}</h1>
        
        <p style={styles.message}>{accountStatus.message}</p>
        
        {user && (
          <div style={styles.userInfo}>
            <strong>Compte:</strong> {user.email}
            <br />
            <strong>Statut:</strong> {getBlockMessage()}
            {user.role && (
              <>
                <br />
                <strong>Rôle:</strong> {user.role}
              </>
            )}
          </div>
        )}

        {isDeleted && (
          <div style={styles.deletedInfo}>
            <strong>Information importante:</strong>
            <br />
            Date de suppression: {formatDeletedDate()}
            <br />
            {user?.deletedBy && (
              <>
                Supprimé par: Administrateur
                <br />
              </>
            )}
            Ce compte ne peut plus être utilisé pour accéder aux services.
          </div>
        )}

        {accountStatus.isDefinitive && (
          <div style={styles.urgentNotice}>
            <strong>⚠️ Action Définitive</strong>
            <br />
            Cette suppression est généralement irréversible. 
            Si vous pensez qu'il s'agit d'une erreur, contactez immédiatement le support.
          </div>
        )}
        
        <div style={styles.contactInfo}>
          <div style={styles.contactTitle}>
            📞 Support Client
          </div>
          <div style={styles.contactText}>
            {isDeleted ? (
              <>
                Pour contester une suppression de compte ou pour plus d'informations :
                <br /><br />
                <strong>Email:</strong> support@anapharmo.com
                <br />
                <strong>Téléphone:</strong> +212 66 11 12 540
                <br />
                <strong>Urgence:</strong> Mentionnez "COMPTE SUPPRIMÉ" en objet
              </>
            ) : (
              <>
                Pour toute question concernant votre compte ou pour une réactivation :
                <br /><br />
                <strong>Email:</strong> support@anapharmo.com
                <br />
                <strong>Téléphone:</strong> +212 66 11 12 540
              </>
            )}
          </div>
        </div>
        
        {!accountStatus.isDefinitive && (
          <button
            style={styles.refreshButton}
            onClick={() => window.location.reload()}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            🔄 Vérifier le statut du compte
          </button>
        )}

        {accountStatus.isDefinitive && (
          <button
            style={{...styles.refreshButton, ...styles.disabledButton}}
            disabled
            title="La vérification n'est pas disponible pour les comptes supprimés"
          >
            ❌ Compte définitivement supprimé
          </button>
        )}
        
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
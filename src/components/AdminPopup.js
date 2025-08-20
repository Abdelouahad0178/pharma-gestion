// src/components/AdminPopup.js
import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { useUserRole } from '../contexts/UserRoleContext';

export default function AdminPopup() {
  const { user, adminPopup, paymentWarning } = useUserRole();
  const [showPopup, setShowPopup] = useState(false);
  const [showPaymentWarning, setShowPaymentWarning] = useState(false);

  // Vérifier si les popups doivent être affichés
  useEffect(() => {
    if (adminPopup?.status === 'active') {
      const expiry = new Date(adminPopup.expiryDate);
      if (expiry > new Date()) {
        setShowPopup(true);
      } else {
        // Popup expiré, le nettoyer
        clearAdminPopup();
      }
    }
  }, [adminPopup]);

  useEffect(() => {
    if (paymentWarning?.status === 'active') {
      const expiry = new Date(paymentWarning.expiryDate);
      if (expiry > new Date()) {
        setShowPaymentWarning(true);
      } else {
        // Avertissement expiré, le nettoyer
        clearPaymentWarning();
      }
    }
  }, [paymentWarning]);

  const clearAdminPopup = async () => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        adminPopup: deleteField()
      });
    } catch (error) {
      console.error('Erreur lors de la suppression du popup admin:', error);
    }
  };

  const clearPaymentWarning = async () => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        paymentWarning: deleteField()
      });
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'avertissement:', error);
    }
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    clearAdminPopup();
  };

  const handleClosePaymentWarning = () => {
    setShowPaymentWarning(false);
    clearPaymentWarning();
  };

  const getPopupIcon = (type) => {
    switch (type) {
      case 'lockNotice': return '🔒';
      case 'unlockNotice': return '✅';
      default: return 'ℹ️';
    }
  };

  const getPopupColor = (type) => {
    switch (type) {
      case 'lockNotice': return '#dc2626';
      case 'unlockNotice': return '#059669';
      default: return '#3b82f6';
    }
  };

  const modalStyles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    },
    modal: {
      backgroundColor: '#2b3951',
      borderRadius: '15px',
      padding: '30px',
      maxWidth: '500px',
      width: '100%',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      border: '2px solid',
      animation: 'slideIn 0.3s ease-out'
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      marginBottom: '20px',
      fontSize: '24px',
      fontWeight: '700'
    },
    message: {
      fontSize: '16px',
      lineHeight: '1.6',
      marginBottom: '20px',
      color: '#e5eeff'
    },
    details: {
      fontSize: '14px',
      color: '#8892b0',
      marginBottom: '25px',
      fontStyle: 'italic'
    },
    button: {
      backgroundColor: '#3272e0',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '12px 24px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      width: '100%',
      transition: 'background-color 0.2s'
    },
    warningModal: {
      backgroundColor: '#2b3951',
      border: '2px solid #f59e0b'
    },
    warningButton: {
      backgroundColor: '#f59e0b'
    },
    issuedBy: {
      fontSize: '12px',
      color: '#8892b0',
      textAlign: 'right',
      marginTop: '15px'
    }
  };

  return (
    <>
      {/* Popup Administratif */}
      {showPopup && adminPopup && (
        <div style={modalStyles.overlay} onClick={handleClosePopup}>
          <div 
            style={{
              ...modalStyles.modal,
              borderColor: getPopupColor(adminPopup.type)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              ...modalStyles.header,
              color: getPopupColor(adminPopup.type)
            }}>
              <span style={{ fontSize: '36px' }}>
                {getPopupIcon(adminPopup.type)}
              </span>
              <span>{adminPopup.title || 'Notification Administrateur'}</span>
            </div>
            
            <div style={modalStyles.message}>
              {adminPopup.message || 'Message administrateur'}
            </div>
            
            {adminPopup.details && (
              <div style={modalStyles.details}>
                {adminPopup.details}
              </div>
            )}
            
            <button
              style={{
                ...modalStyles.button,
                backgroundColor: getPopupColor(adminPopup.type)
              }}
              onClick={handleClosePopup}
              onMouseOver={(e) => e.target.style.opacity = '0.9'}
              onMouseOut={(e) => e.target.style.opacity = '1'}
            >
              J'ai compris
            </button>
            
            {adminPopup.issuedBy && (
              <div style={modalStyles.issuedBy}>
                Émis par: {adminPopup.issuedBy}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Avertissement de Paiement */}
      {showPaymentWarning && paymentWarning && (
        <div style={modalStyles.overlay} onClick={handleClosePaymentWarning}>
          <div 
            style={{
              ...modalStyles.modal,
              ...modalStyles.warningModal
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              ...modalStyles.header,
              color: '#f59e0b'
            }}>
              <span style={{ fontSize: '36px' }}>💰</span>
              <span>Avertissement de Paiement</span>
            </div>
            
            <div style={modalStyles.message}>
              Votre abonnement nécessite une mise à jour de paiement. 
              Veuillez contacter l'administrateur pour régulariser votre situation.
            </div>
            
            <div style={modalStyles.details}>
              Pour continuer à utiliser le service sans interruption, 
              merci de vous mettre en contact avec le support.
            </div>
            
            <button
              style={{
                ...modalStyles.button,
                ...modalStyles.warningButton
              }}
              onClick={handleClosePaymentWarning}
              onMouseOver={(e) => e.target.style.opacity = '0.9'}
              onMouseOut={(e) => e.target.style.opacity = '1'}
            >
              J'ai compris
            </button>
            
            {paymentWarning.issuedBy && (
              <div style={modalStyles.issuedBy}>
                Émis par: {paymentWarning.issuedBy}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-50px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
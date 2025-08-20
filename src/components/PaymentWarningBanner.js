// src/components/PaymentWarningBanner.js
import React, { useState, useEffect } from 'react';
import { useUserRole } from '../contexts/UserRoleContext';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function PaymentWarningBanner() {
  const { user, paymentWarning } = useUserRole();
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (paymentWarning?.status === 'active') {
      const expiry = new Date(paymentWarning.expiryDate);
      if (expiry > new Date()) {
        setIsVisible(true);
      } else {
        // Avertissement expiré, le nettoyer
        clearPaymentWarning();
      }
    } else {
      setIsVisible(false);
    }
  }, [paymentWarning]);

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

  const handleDismiss = () => {
    setIsVisible(false);
    clearPaymentWarning();
  };

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  if (!isVisible || !paymentWarning) return null;

  const styles = {
    banner: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
      color: 'white',
      zIndex: 1000,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      transition: 'all 0.3s ease-in-out',
      transform: isMinimized ? 'translateY(-75%)' : 'translateY(0)',
    },
    content: {
      display: 'flex',
      alignItems: 'center',
      justify: 'space-between',
      padding: isMinimized ? '8px 16px' : '12px 16px',
      maxWidth: '1200px',
      margin: '0 auto',
    },
    leftSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flex: 1,
    },
    icon: {
      fontSize: isMinimized ? '18px' : '24px',
      flexShrink: 0,
    },
    textContainer: {
      flex: 1,
      minWidth: 0, // Pour permettre le text overflow
    },
    title: {
      fontSize: isMinimized ? '14px' : '16px',
      fontWeight: '700',
      marginBottom: isMinimized ? '0' : '4px',
      display: isMinimized ? 'none' : 'block',
    },
    message: {
      fontSize: isMinimized ? '12px' : '14px',
      opacity: 0.95,
      lineHeight: 1.4,
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexShrink: 0,
    },
    button: {
      background: 'rgba(255, 255, 255, 0.2)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      color: 'white',
      borderRadius: '6px',
      padding: isMinimized ? '4px 8px' : '6px 12px',
      fontSize: isMinimized ? '11px' : '12px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      whiteSpace: 'nowrap',
    },
    dismissButton: {
      background: 'rgba(220, 38, 38, 0.8)',
      border: '1px solid rgba(220, 38, 38, 0.9)',
    },
    minimizeButton: {
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    // Style pour décaler le contenu de la page
    spacer: {
      height: isMinimized ? '32px' : '60px',
      transition: 'height 0.3s ease-in-out',
    }
  };

  return (
    <>
      <div style={styles.banner}>
        <div style={styles.content}>
          <div style={styles.leftSection}>
            <span style={styles.icon}>💰</span>
            <div style={styles.textContainer}>
              {!isMinimized && (
                <div style={styles.title}>
                  Avertissement de Paiement
                </div>
              )}
              <div style={styles.message}>
                {isMinimized 
                  ? "Paiement requis - Cliquez pour plus d'infos"
                  : "Votre abonnement nécessite une mise à jour. Contactez l'administrateur pour régulariser votre situation."
                }
              </div>
            </div>
          </div>
          
          <div style={styles.actions}>
            <button
              style={{...styles.button, ...styles.minimizeButton}}
              onClick={handleMinimize}
              onMouseOver={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
              onMouseOut={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
              title={isMinimized ? "Agrandir" : "Réduire"}
            >
              {isMinimized ? '▲' : '▼'}
            </button>
            
            <button
              style={{...styles.button, ...styles.dismissButton}}
              onClick={handleDismiss}
              onMouseOver={(e) => e.target.style.background = 'rgba(220, 38, 38, 0.9)'}
              onMouseOut={(e) => e.target.style.background = 'rgba(220, 38, 38, 0.8)'}
            >
              ✕ Masquer
            </button>
          </div>
        </div>
      </div>
      
      {/* Spacer pour éviter que le contenu soit masqué */}
      <div style={styles.spacer}></div>
    </>
  );
}
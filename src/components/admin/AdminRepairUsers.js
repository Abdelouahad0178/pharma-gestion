// src/components/admin/AdminRepairUsers.js
import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useUserRole } from '../../contexts/UserRoleContext';

export default function AdminRepairUsers() {
  const { user, societeId, role } = useUserRole();
  const [brokenUsers, setBrokenUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState({});

  // Vérifier les permissions d'accès
  const canRepair = role === 'docteur' || role === 'pharmacien' || role === 'admin';

  useEffect(() => {
    if (!canRepair) return;
    
    const findBrokenUsers = async () => {
      try {
        setLoading(true);
        
        // Récupérer tous les utilisateurs
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const broken = [];
        
        usersSnapshot.forEach(doc => {
          const userData = doc.data();
          const userId = doc.id;
          
          // Identifier les utilisateurs "cassés"
          const issues = [];
          
          if (!userData.societeId) {
            issues.push('Aucune société assignée');
          }
          
          if (!userData.role) {
            issues.push('Aucun rôle défini');
          }
          
          if (!userData.email) {
            issues.push('Email manquant');
          }
          
          if (userData.needsSetup) {
            issues.push('Configuration incomplète');
          }
          
          if (issues.length > 0) {
            broken.push({
              id: userId,
              ...userData,
              issues
            });
          }
        });
        
        setBrokenUsers(broken);
        
      } catch (error) {
        console.error('Erreur lors de la recherche:', error);
      } finally {
        setLoading(false);
      }
    };
    
    findBrokenUsers();
  }, [canRepair]);

  // Réparer un utilisateur
  const repairUser = async (brokenUser) => {
    if (!societeId) {
      alert('Impossible de réparer: votre société n\'est pas définie');
      return;
    }

    setRepairing(prev => ({ ...prev, [brokenUser.id]: true }));

    try {
      const updates = {
        modifieLe: Timestamp.now(),
        modifiePar: user.uid,
        repairedBy: 'admin-tool'
      };

      // Assigner la société si manquante
      if (!brokenUser.societeId) {
        updates.societeId = societeId;
      }

      // Assigner un rôle si manquant
      if (!brokenUser.role) {
        updates.role = 'vendeuse'; // Rôle par défaut
      }

      // Marquer comme configuré
      if (brokenUser.needsSetup) {
        updates.needsSetup = false;
      }

      // Activer si inactif
      updates.actif = true;

      await updateDoc(doc(db, 'users', brokenUser.id), updates);

      // Retirer de la liste des utilisateurs cassés
      setBrokenUsers(prev => prev.filter(u => u.id !== brokenUser.id));

      alert(`Utilisateur ${brokenUser.email} réparé avec succès !`);

    } catch (error) {
      console.error('Erreur réparation:', error);
      alert('Erreur lors de la réparation: ' + error.message);
    } finally {
      setRepairing(prev => ({ ...prev, [brokenUser.id]: false }));
    }
  };

  const styles = {
    container: {
      padding: '20px',
      maxWidth: '1000px',
      margin: '0 auto',
      fontFamily: 'Inter, Arial, sans-serif'
    },
    header: {
      background: 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)',
      color: 'white',
      padding: '20px',
      borderRadius: '15px',
      marginBottom: '20px',
      textAlign: 'center'
    },
    card: {
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '15px',
      padding: '20px',
      marginBottom: '15px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
    },
    userInfo: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '15px'
    },
    issues: {
      background: '#fed7d7',
      border: '1px solid #f56565',
      borderRadius: '8px',
      padding: '10px',
      marginBottom: '15px'
    },
    button: {
      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '10px 20px',
      cursor: 'pointer',
      fontWeight: '600'
    },
    noAccess: {
      textAlign: 'center',
      padding: '40px',
      color: '#e53e3e',
      fontSize: '1.2em'
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px',
      color: '#48bb78',
      fontSize: '1.2em'
    }
  };

  if (!canRepair) {
    return (
      <div style={styles.container}>
        <div style={styles.noAccess}>
          Accès refusé. Seuls les administrateurs peuvent utiliser cet outil.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: '40px', fontSize: '1.2em' }}>
          Recherche d'utilisateurs à réparer...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>Outil de Réparation d'Utilisateurs</h1>
        <p>Répare automatiquement les comptes utilisateurs avec des données manquantes</p>
      </div>

      {brokenUsers.length === 0 ? (
        <div style={styles.emptyState}>
          Tous les utilisateurs sont correctement configurés !
        </div>
      ) : (
        <>
          <div style={{ 
            marginBottom: '20px', 
            padding: '15px', 
            background: '#fff3cd', 
            border: '1px solid #ffeaa7',
            borderRadius: '8px',
            color: '#856404'
          }}>
            <strong>{brokenUsers.length} utilisateur(s)</strong> nécessitent une réparation.
          </div>

          {brokenUsers.map(brokenUser => (
            <div key={brokenUser.id} style={styles.card}>
              <div style={styles.userInfo}>
                <div>
                  <h3 style={{ margin: '0 0 5px 0', color: '#2d3748' }}>
                    {brokenUser.email || 'Email manquant'}
                  </h3>
                  <div style={{ fontSize: '0.9em', color: '#6b7280' }}>
                    ID: {brokenUser.id}
                  </div>
                  {brokenUser.nom && brokenUser.prenom && (
                    <div style={{ fontSize: '0.9em', color: '#4a5568' }}>
                      {brokenUser.prenom} {brokenUser.nom}
                    </div>
                  )}
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8em', color: '#6b7280' }}>
                    Rôle: {brokenUser.role || 'Non défini'}
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#6b7280' }}>
                    Société: {brokenUser.societeId || 'Non assignée'}
                  </div>
                </div>
              </div>

              <div style={styles.issues}>
                <strong style={{ color: '#c53030' }}>Problèmes détectés:</strong>
                <ul style={{ margin: '5px 0 0 20px', color: '#c53030' }}>
                  {brokenUser.issues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  style={{
                    ...styles.button,
                    opacity: repairing[brokenUser.id] ? 0.6 : 1,
                    cursor: repairing[brokenUser.id] ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => repairUser(brokenUser)}
                  disabled={repairing[brokenUser.id]}
                >
                  {repairing[brokenUser.id] ? 'Réparation...' : 'Réparer automatiquement'}
                </button>
              </div>
            </div>
          ))}

          <div style={{
            marginTop: '30px',
            padding: '15px',
            background: '#e6fffa',
            border: '1px solid #81e6d9',
            borderRadius: '8px',
            fontSize: '0.9em',
            color: '#234e52'
          }}>
            <strong>Actions de réparation automatique:</strong>
            <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
              <li>Assigne votre société aux utilisateurs sans société</li>
              <li>Attribue le rôle "vendeuse" par défaut</li>
              <li>Active les comptes inactifs</li>
              <li>Marque les comptes comme configurés</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
// src/components/admin/GestionUtilisateurs.js
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy 
} from 'firebase/firestore';
import { useUserRole } from '../../contexts/UserRoleContext';

export default function GestionUtilisateurs() {
  const { user, role, societeId } = useUserRole();
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'deleted'

  // Charger les utilisateurs
  const fetchUtilisateurs = async () => {
    if (!societeId) return;
    
    setIsLoading(true);
    try {
      let q;
      
      if (filter === 'active') {
        q = query(
          collection(db, 'users'),
          where('societeId', '==', societeId),
          where('deleted', '!=', true),
          orderBy('deleted'),
          orderBy('email')
        );
      } else if (filter === 'deleted') {
        q = query(
          collection(db, 'users'),
          where('societeId', '==', societeId),
          where('deleted', '==', true),
          orderBy('deletedAt', 'desc')
        );
      } else {
        // Tous les utilisateurs
        q = query(
          collection(db, 'users'),
          where('societeId', '==', societeId),
          orderBy('email')
        );
      }

      const snapshot = await getDocs(q);
      const users = [];
      
      snapshot.forEach(doc => {
        const userData = doc.data();
        users.push({
          id: doc.id,
          ...userData
        });
      });
      
      setUtilisateurs(users);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
      alert('Erreur lors du chargement des utilisateurs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'docteur' && societeId) {
      fetchUtilisateurs();
    }
  }, [role, societeId, filter]);

  // Supprimer un utilisateur (marquage)
  const handleDeleteUser = async (userToDelete) => {
    // Vérifications de sécurité
    if (!user || role !== 'docteur') {
      alert('Seul le pharmacien peut supprimer des utilisateurs');
      return;
    }

    if (userToDelete.id === user.uid) {
      alert('Vous ne pouvez pas supprimer votre propre compte');
      return;
    }

    // Confirmation renforcée
    const confirmMessage = `⚠️ ATTENTION ⚠️\n\nVous êtes sur le point de supprimer l'utilisateur :\n\n📧 Email: ${userToDelete.email}\n👤 Rôle: ${userToDelete.role}\n\nCette action va :\n- Bloquer l'accès de cet utilisateur\n- Marquer le compte comme supprimé\n- Conserver les données pour l'historique\n\nÊtes-vous absolument sûr ?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsLoading(true);
    try {
      // Marquer comme supprimé et désactiver
      await updateDoc(doc(db, 'users', userToDelete.id), {
        deleted: true,
        deletedAt: new Date(),
        deletedBy: user.uid,
        isActive: false,
        isLocked: true,
        deletionReason: 'Supprimé par le pharmacien'
      });

      // Recharger la liste
      fetchUtilisateurs();
      
      alert(`✅ Utilisateur "${userToDelete.email}" supprimé avec succès`);
      
    } catch (error) {
      console.error('Erreur suppression utilisateur:', error);
      alert('❌ Erreur lors de la suppression: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Restaurer un utilisateur supprimé
  const handleRestoreUser = async (userToRestore) => {
    if (!user || role !== 'docteur') {
      alert('Seul le pharmacien peut restaurer des utilisateurs');
      return;
    }

    const confirmMessage = `Restaurer l'utilisateur "${userToRestore.email}" ?\n\nIl pourra à nouveau accéder au système.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsLoading(true);
    try {
      await updateDoc(doc(db, 'users', userToRestore.id), {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
        isActive: true,
        isLocked: false,
        restoredAt: new Date(),
        restoredBy: user.uid
      });

      fetchUtilisateurs();
      alert(`✅ Utilisateur "${userToRestore.email}" restauré avec succès`);
      
    } catch (error) {
      console.error('Erreur restauration utilisateur:', error);
      alert('❌ Erreur lors de la restauration: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Supprimer définitivement (Firestore seulement)
  const handlePermanentDelete = async (userToDelete) => {
    if (!user || role !== 'docteur') {
      alert('Action non autorisée');
      return;
    }

    const confirmMessage = `🚨 SUPPRESSION DÉFINITIVE 🚨\n\nCette action va SUPPRIMER DÉFINITIVEMENT :\n\n📧 ${userToDelete.email}\n\n⚠️ IMPOSSIBLE À ANNULER ⚠️\n\nTapez "SUPPRIMER" pour confirmer :`;
    
    const confirmation = prompt(confirmMessage);
    if (confirmation !== 'SUPPRIMER') {
      alert('Suppression annulée');
      return;
    }

    setIsLoading(true);
    try {
      // Supprimer de Firestore
      await deleteDoc(doc(db, 'users', userToDelete.id));

      fetchUtilisateurs();
      alert(`✅ Utilisateur supprimé définitivement`);
      
    } catch (error) {
      console.error('Erreur suppression définitive:', error);
      alert('❌ Erreur lors de la suppression définitive: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Changer le rôle d'un utilisateur
  const handleChangeRole = async (userId, newRole) => {
    if (!user || role !== 'docteur') {
      alert('Seul le pharmacien peut modifier les rôles');
      return;
    }

    setIsLoading(true);
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
        roleChangedAt: new Date(),
        roleChangedBy: user.uid
      });

      fetchUtilisateurs();
      alert(`✅ Rôle modifié avec succès`);
      
    } catch (error) {
      console.error('Erreur modification rôle:', error);
      alert('❌ Erreur lors de la modification du rôle: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (role !== 'docteur') {
    return (
      <div className="fullscreen-table-wrap">
        <div style={{ padding: 40, textAlign: 'center', color: '#bc3453' }}>
          Accès refusé. Seul le pharmacien peut gérer les utilisateurs.
        </div>
      </div>
    );
  }

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Utilisateurs</div>
      
      {/* Filtres */}
      <div className="paper-card" style={{ display: 'flex', gap: 15, alignItems: 'center', flexWrap: 'wrap' }}>
        <label><strong>Affichage :</strong></label>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          className="input"
          style={{ minWidth: 150 }}
        >
          <option value="all">Tous les utilisateurs</option>
          <option value="active">Utilisateurs actifs</option>
          <option value="deleted">Utilisateurs supprimés</option>
        </select>
        
        <button 
          onClick={fetchUtilisateurs} 
          className="btn"
          disabled={isLoading}
        >
          {isLoading ? '🔄 Chargement...' : '🔄 Actualiser'}
        </button>
        
        <div style={{ marginLeft: 'auto', color: '#4a5568' }}>
          <strong>{utilisateurs.length}</strong> utilisateur(s)
        </div>
      </div>

      {/* Tableau des utilisateurs */}
      <div className="table-pro-full">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Dernière connexion</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((utilisateur) => (
              <tr 
                key={utilisateur.id}
                style={{
                  backgroundColor: utilisateur.deleted ? '#ffebee' : 
                                   utilisateur.id === user.uid ? '#e8f5e8' : 'inherit',
                  opacity: utilisateur.deleted ? 0.7 : 1
                }}
              >
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: utilisateur.id === user.uid ? 'bold' : 'normal' }}>
                      {utilisateur.email}
                      {utilisateur.id === user.uid && <span style={{ color: '#2e7d32' }}> (Vous)</span>}
                    </span>
                    {utilisateur.deleted && (
                      <small style={{ color: '#d32f2f' }}>
                        Supprimé le {formatDate(utilisateur.deletedAt)}
                      </small>
                    )}
                  </div>
                </td>
                <td>
                  {utilisateur.deleted ? (
                    <span style={{ color: '#666' }}>{utilisateur.role}</span>
                  ) : (
                    <select
                      value={utilisateur.role}
                      onChange={(e) => handleChangeRole(utilisateur.id, e.target.value)}
                      disabled={utilisateur.id === user.uid || isLoading}
                      style={{ 
                        border: 'none', 
                        background: 'transparent',
                        fontWeight: 'bold',
                        color: utilisateur.role === 'docteur' ? '#1976d2' : '#9c27b0'
                      }}
                    >
                      <option value="docteur">Docteur</option>
                      <option value="vendeuse">Vendeuse</option>
                    </select>
                  )}
                </td>
                <td>
                  <span className={`status-chip ${
                    utilisateur.deleted ? 'danger' : 
                    utilisateur.isActive === false ? 'danger' :
                    utilisateur.isLocked ? 'danger' : 'success'
                  }`}>
                    {utilisateur.deleted ? 'Supprimé' :
                     utilisateur.isActive === false ? 'Inactif' :
                     utilisateur.isLocked ? 'Bloqué' : 'Actif'}
                  </span>
                </td>
                <td>
                  {formatDate(utilisateur.lastLoginAt)}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {utilisateur.deleted ? (
                      // Actions pour utilisateurs supprimés
                      <>
                        <button
                          onClick={() => handleRestoreUser(utilisateur)}
                          className="btn success"
                          disabled={isLoading}
                          style={{ minWidth: 80 }}
                        >
                          🔄 Restaurer
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(utilisateur)}
                          className="btn danger"
                          disabled={isLoading}
                          style={{ minWidth: 80 }}
                        >
                          🗑️ Définitif
                        </button>
                      </>
                    ) : (
                      // Actions pour utilisateurs actifs
                      <>
                        {utilisateur.id !== user.uid && (
                          <button
                            onClick={() => handleDeleteUser(utilisateur)}
                            className="btn danger"
                            disabled={isLoading}
                            style={{ minWidth: 80 }}
                          >
                            🗑️ Supprimer
                          </button>
                        )}
                        {utilisateur.id === user.uid && (
                          <span style={{ 
                            color: '#666', 
                            fontSize: '0.9em',
                            fontStyle: 'italic',
                            padding: '8px'
                          }}>
                            Votre compte
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {utilisateurs.length === 0 && !isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          Aucun utilisateur trouvé pour ce filtre
        </div>
      )}
    </div>
  );
}
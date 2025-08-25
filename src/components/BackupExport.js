// src/components/BackupExport.js
import React, { useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { useUserRole } from '../contexts/UserRoleContext';

export default function BackupExport() {
  const { user, societeId, isOwner, role, societeName } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [exportStats, setExportStats] = useState(null);

  // Utilitaire pour convertir les Timestamps Firestore
  const convertFirestoreData = (data) => {
    return JSON.parse(JSON.stringify(data, (key, value) => {
      // Conversion des Timestamps Firestore
      if (value && typeof value === 'object' && value.seconds && value.nanoseconds !== undefined) {
        return new Date(value.seconds * 1000).toISOString();
      }
      // Conversion des dates JavaScript
      if (value instanceof Date) {
        return value.toISOString();
      }
      // Gérer les valeurs null/undefined
      if (value === undefined) {
        return null;
      }
      return value;
    }));
  };

  // Fonction pour formater les tailles de fichiers
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Exporter toutes les données de la société
  const exportAllData = async () => {
    if (!user) {
      setStatus('❌ Utilisateur non connecté');
      return;
    }

    if (!societeId) {
      setStatus('❌ Aucune société assignée');
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatus('🔄 Initialisation de l\'export...');
    setExportStats(null);

    try {
      const startTime = Date.now();
      
      // Métadonnées de la sauvegarde
      const backup = {
        metadata: {
          exportDate: new Date().toISOString(),
          exportDateFr: new Date().toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          societeId: societeId,
          societeName: societeName || 'Pharmacie',
          exportedBy: user.email,
          exportedByRole: role,
          exportedByName: user.displayName || user.email,
          isOwner: isOwner,
          version: '1.2',
          appName: 'Pharma Gestion',
          type: 'complete_backup'
        },
        data: {},
        statistics: {
          totalDocuments: 0,
          totalCollections: 0,
          collectionsDetails: {},
          exportDuration: 0,
          fileSize: 0
        }
      };

      // Collections selon les permissions
      let collections = [];
      
      if (isOwner || role === 'docteur') {
        collections = [
          { name: 'achats', label: '🛒 Achats', priority: 'high' },
          { name: 'ventes', label: '💰 Ventes', priority: 'high' },
          { name: 'stock', label: '📦 Stock', priority: 'high' },
          { name: 'devisFactures', label: '📄 Devis & Factures', priority: 'medium' },
          { name: 'paiements', label: '💳 Paiements', priority: 'medium' },
          { name: 'retours', label: '↩️ Retours', priority: 'low' },
          { name: 'parametres', label: '⚙️ Paramètres', priority: 'low' }
        ];
      } else {
        collections = [
          { name: 'ventes', label: '💰 Ventes', priority: 'high' },
          { name: 'stock', label: '📦 Stock (lecture)', priority: 'medium' }
        ];
      }

      const totalCollections = collections.length;
      let currentCollection = 0;
      let totalDocuments = 0;

      // Exporter chaque collection
      for (const coll of collections) {
        const collectionProgress = Math.round((currentCollection / totalCollections) * 100);
        setProgress(collectionProgress);
        setStatus(`🔄 Export ${coll.label}...`);

        try {
          const collectionRef = collection(db, 'societe', societeId, coll.name);
          const snapshot = await getDocs(collectionRef);
          
          backup.data[coll.name] = [];
          let collectionDocCount = 0;

          snapshot.forEach(docSnap => {
            try {
              const data = docSnap.data();
              const cleanData = convertFirestoreData(data);

              backup.data[coll.name].push({
                id: docSnap.id,
                ...cleanData,
                _exportedAt: new Date().toISOString(),
                _collection: coll.name
              });
              
              collectionDocCount++;
              totalDocuments++;
            } catch (docError) {
              console.warn(`⚠️ Erreur document ${docSnap.id}:`, docError);
            }
          });

          // Statistiques de la collection
          backup.statistics.collectionsDetails[coll.name] = {
            label: coll.label,
            count: collectionDocCount,
            priority: coll.priority,
            exported: true,
            exportedAt: new Date().toISOString()
          };

          console.log(`✅ ${coll.label}: ${collectionDocCount} documents exportés`);
          
        } catch (collError) {
          console.error(`❌ Erreur collection ${coll.name}:`, collError);
          backup.data[coll.name] = [];
          backup.statistics.collectionsDetails[coll.name] = {
            label: coll.label,
            count: 0,
            priority: coll.priority,
            exported: false,
            error: collError.message,
            exportedAt: new Date().toISOString()
          };
        }

        currentCollection++;
      }

      // Exporter les informations utilisateurs (si propriétaire)
      if (isOwner) {
        setStatus('🔄 Export utilisateurs...');
        try {
          const usersRef = collection(db, 'users');
          const usersSnapshot = await getDocs(usersRef);
          backup.data.users = [];
          
          usersSnapshot.forEach(userDoc => {
            const userData = userDoc.data();
            if (userData.societeId === societeId) { // Seulement les utilisateurs de cette société
              const cleanUserData = convertFirestoreData(userData);
              backup.data.users.push({
                id: userDoc.id,
                ...cleanUserData,
                // Masquer les données sensibles
                password: undefined,
                _exportedAt: new Date().toISOString()
              });
              totalDocuments++;
            }
          });

          backup.statistics.collectionsDetails.users = {
            label: '👥 Utilisateurs',
            count: backup.data.users.length,
            priority: 'high',
            exported: true,
            exportedAt: new Date().toISOString()
          };
        } catch (userError) {
          console.warn('⚠️ Erreur export utilisateurs:', userError);
          backup.data.users = [];
        }
      }

      // Exporter les informations de la société
      if (societeId) {
        setStatus('🔄 Export informations société...');
        try {
          const societeRef = doc(db, 'societe', societeId);
          const societeSnap = await getDoc(societeRef);
          
          if (societeSnap.exists()) {
            const societeData = convertFirestoreData(societeSnap.data());
            backup.data.societeInfo = {
              id: societeId,
              ...societeData,
              _exportedAt: new Date().toISOString()
            };
            totalDocuments++;

            backup.statistics.collectionsDetails.societeInfo = {
              label: '🏥 Société',
              count: 1,
              priority: 'high',
              exported: true,
              exportedAt: new Date().toISOString()
            };
          }
        } catch (societeError) {
          console.warn('⚠️ Erreur export société:', societeError);
        }
      }

      // Finaliser les statistiques
      const endTime = Date.now();
      backup.statistics.totalDocuments = totalDocuments;
      backup.statistics.totalCollections = Object.keys(backup.data).length;
      backup.statistics.exportDuration = endTime - startTime;

      setProgress(100);
      setStatus('📁 Génération du fichier JSON...');

      // Créer le fichier JSON
      const jsonString = JSON.stringify(backup, null, 2);
      const fileSize = new Blob([jsonString]).size;
      backup.statistics.fileSize = fileSize;

      // Nom du fichier avec timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const societeName_clean = (societeName || 'pharma').replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
      const fileName = `backup-${societeName_clean}-${timestamp}.json`;
      
      // Télécharger le fichier
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Statistiques finales
      setExportStats({
        fileName: fileName,
        totalDocuments: totalDocuments,
        totalCollections: backup.statistics.totalCollections,
        fileSize: formatFileSize(fileSize),
        duration: Math.round(backup.statistics.exportDuration / 1000),
        collections: backup.statistics.collectionsDetails
      });

      setStatus(`✅ Sauvegarde créée : ${fileName}`);
      
    } catch (error) {
      console.error('❌ Erreur export complète:', error);
      setStatus(`❌ Erreur: ${error.message}`);
    }

    setLoading(false);
    setTimeout(() => {
      setStatus('');
      setProgress(0);
    }, 10000);
  };

  // Export rapide (données essentielles)
  const exportQuickBackup = async () => {
    if (!user || !societeId) {
      setStatus('❌ Données utilisateur manquantes');
      return;
    }

    setLoading(true);
    setStatus('🚀 Export rapide en cours...');

    try {
      const quickBackup = {
        metadata: {
          type: 'quick_backup',
          exportDate: new Date().toISOString(),
          exportDateFr: new Date().toLocaleDateString('fr-FR'),
          societeId: societeId,
          societeName: societeName || 'Pharmacie',
          exportedBy: user.email,
          version: '1.2'
        },
        data: {},
        statistics: {
          totalDocuments: 0,
          priority: 'essential_only'
        }
      };

      // Collections essentielles
      const essentialCollections = [
        { name: 'ventes', label: 'Ventes' },
        { name: 'stock', label: 'Stock' }
      ];
      
      let totalDocs = 0;

      for (const coll of essentialCollections) {
        try {
          const collectionRef = collection(db, 'societe', societeId, coll.name);
          const snapshot = await getDocs(collectionRef);
          quickBackup.data[coll.name] = [];

          snapshot.forEach(docSnap => {
            const data = convertFirestoreData(docSnap.data());
            quickBackup.data[coll.name].push({
              id: docSnap.id,
              ...data
            });
            totalDocs++;
          });
        } catch (error) {
          console.warn(`Erreur ${coll.name}:`, error);
          quickBackup.data[coll.name] = [];
        }
      }

      quickBackup.statistics.totalDocuments = totalDocs;

      // Télécharger
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `quick-backup-${timestamp}.json`;
      
      const blob = new Blob([JSON.stringify(quickBackup, null, 2)], { 
        type: 'application/json' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatus(`✅ Sauvegarde rapide créée : ${fileName} (${totalDocs} documents)`);
      
    } catch (error) {
      console.error('❌ Erreur export rapide:', error);
      setStatus(`❌ Erreur: ${error.message}`);
    }

    setLoading(false);
    setTimeout(() => setStatus(''), 5000);
  };

  // Vérifier les permissions
  if (!user) {
    return (
      <div className="paper-card" style={{ maxWidth: 500, margin: '20px auto', textAlign: 'center' }}>
        <h3>❌ Accès refusé</h3>
        <p>Vous devez être connecté pour accéder aux sauvegardes.</p>
      </div>
    );
  }

  if (!societeId) {
    return (
      <div className="paper-card" style={{ maxWidth: 500, margin: '20px auto', textAlign: 'center' }}>
        <h3>⚠️ Aucune société assignée</h3>
        <p>Vous devez être assigné à une société pour créer des sauvegardes.</p>
        <p style={{ fontSize: '0.9rem', color: '#666', marginTop: 15 }}>
          Contactez l'administrateur pour vous assigner une pharmacie.
        </p>
      </div>
    );
  }

  // Interface utilisateur
  return (
    <div className="paper-card" style={{ maxWidth: 700, margin: '20px auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 25 }}>
        <h3 style={{ color: '#e4edfa', marginBottom: 10 }}>💾 Sauvegarde des Données</h3>
        <p style={{ color: '#99b2d4', fontSize: '0.95rem' }}>
          Exportez vos données de <strong>{societeName || 'votre pharmacie'}</strong> en format JSON
        </p>
      </div>

      {/* Informations utilisateur */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: 20,
        padding: 15,
        background: '#2b3951',
        borderRadius: 8,
        fontSize: '0.9rem'
      }}>
        <div>
          <span style={{ color: '#99b2d4' }}>👤 Utilisateur : </span>
          <span style={{ color: '#e4edfa', fontWeight: 600 }}>{user.email}</span>
        </div>
        <div>
          <span style={{ color: '#99b2d4' }}>🔑 Rôle : </span>
          <span style={{ 
            color: isOwner ? '#28a745' : role === 'docteur' ? '#ffc107' : '#17a2b8',
            fontWeight: 600 
          }}>
            {isOwner ? '👑 Propriétaire' : role === 'docteur' ? '⚕️ Docteur' : '👩‍💼 Vendeuse'}
          </span>
        </div>
      </div>

      {/* Barre de progression */}
      {loading && progress > 0 && (
        <div style={{ marginBottom: 25 }}>
          <div style={{ 
            background: '#34518b', 
            borderRadius: 12, 
            height: 10, 
            overflow: 'hidden',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #28a745, #20c997)',
              height: '100%',
              width: `${progress}%`,
              transition: 'width 0.3s ease',
              borderRadius: '12px'
            }} />
          </div>
          <p style={{ 
            textAlign: 'center', 
            margin: '10px 0', 
            fontSize: '0.85rem', 
            color: '#99b2d4',
            fontWeight: 600
          }}>
            {progress}% terminé
          </p>
        </div>
      )}

      {/* Boutons d'export */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        
        {/* Export complet */}
        <button 
          onClick={exportAllData}
          disabled={loading}
          className="btn"
          style={{ 
            width: '100%', 
            background: loading ? '#555' : 'linear-gradient(90deg, #28a745, #20c997)',
            fontSize: '1.1rem',
            padding: '16px',
            position: 'relative',
            boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)'
          }}
        >
          {loading ? '🔄 Export en cours...' : '💾 Sauvegarde Complète'}
        </button>

        {/* Export rapide */}
        <button 
          onClick={exportQuickBackup}
          disabled={loading}
          className="btn"
          style={{ 
            width: '100%', 
            background: loading ? '#555' : 'linear-gradient(90deg, #007bff, #17a2b8)',
            fontSize: '1rem',
            padding: '14px',
            boxShadow: '0 4px 15px rgba(0, 123, 255, 0.3)'
          }}
        >
          {loading ? '⏳ Patientez...' : '🚀 Sauvegarde Rapide (Essentiel)'}
        </button>
      </div>

      {/* Status */}
      {status && (
        <div style={{ 
          marginTop: 20, 
          padding: 15, 
          background: status.includes('✅') ? '#155724' : 
                     status.includes('❌') ? '#721c24' : 
                     '#0c5460',
          borderRadius: 10,
          color: '#fff',
          borderLeft: `5px solid ${
            status.includes('✅') ? '#28a745' : 
            status.includes('❌') ? '#dc3545' : 
            '#17a2b8'
          }`,
          fontWeight: 500
        }}>
          {status}
        </div>
      )}

      {/* Statistiques d'export */}
      {exportStats && (
        <div style={{ 
          marginTop: 20, 
          padding: 20, 
          background: '#155724', 
          borderRadius: 10,
          color: '#fff'
        }}>
          <h4 style={{ marginBottom: 15, color: '#28a745' }}>📊 Statistiques d'export</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <span style={{ color: '#d4edda' }}>📁 Fichier : </span>
              <span style={{ fontWeight: 600 }}>{exportStats.fileName}</span>
            </div>
            <div>
              <span style={{ color: '#d4edda' }}>📄 Documents : </span>
              <span style={{ fontWeight: 600 }}>{exportStats.totalDocuments}</span>
            </div>
            <div>
              <span style={{ color: '#d4edda' }}>📂 Collections : </span>
              <span style={{ fontWeight: 600 }}>{exportStats.totalCollections}</span>
            </div>
            <div>
              <span style={{ color: '#d4edda' }}>💾 Taille : </span>
              <span style={{ fontWeight: 600 }}>{exportStats.fileSize}</span>
            </div>
            <div>
              <span style={{ color: '#d4edda' }}>⏱️ Durée : </span>
              <span style={{ fontWeight: 600 }}>{exportStats.duration}s</span>
            </div>
          </div>
          
          {/* Détail des collections */}
          <div style={{ marginTop: 15 }}>
            <h5 style={{ color: '#d4edda', marginBottom: 10 }}>📋 Détail des collections :</h5>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
              {Object.entries(exportStats.collections).map(([name, info]) => (
                <div key={name} style={{ 
                  background: info.exported ? '#1e7e34' : '#721c24', 
                  padding: '8px 12px', 
                  borderRadius: 6,
                  fontSize: '0.85rem'
                }}>
                  <span>{info.label} : </span>
                  <span style={{ fontWeight: 600 }}>
                    {info.exported ? `${info.count} docs ✅` : 'Erreur ❌'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Informations détaillées */}
      <div style={{ 
        marginTop: 25, 
        padding: 20, 
        background: '#2b3951', 
        borderRadius: 10,
        fontSize: '0.9rem',
        color: '#99b2d4'
      }}>
        <h4 style={{ color: '#e4edfa', marginBottom: 15 }}>📋 Contenu des sauvegardes</h4>
        
        <div style={{ display: 'grid', gap: 15 }}>
         {/* Sauvegarde complète */}
<div>
  <h5 style={{ color: '#28a745', marginBottom: 8 }}>💾 Sauvegarde Complète</h5>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
    {((isOwner || role === 'docteur') ? [
      '🛒 Achats', '💰 Ventes', '📦 Stock', 
      '📄 Devis/Factures', '💳 Paiements', '↩️ Retours', 
      '⚙️ Paramètres', '👥 Utilisateurs', '🏥 Société'
    ] : ['💰 Ventes', '📦 Stock (lecture)']).map((item, index) => (
      <div key={index} style={{ 
        background: '#34518b', 
        padding: '8px 10px', 
        borderRadius: 6, 
        textAlign: 'center',
        fontSize: '0.8rem',
        fontWeight: 500
      }}>
        {item}
      </div>
    ))}
  </div>
</div>

          {/* Sauvegarde rapide */}
          <div>
            <h5 style={{ color: '#17a2b8', marginBottom: 8 }}>🚀 Sauvegarde Rapide</h5>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['💰 Ventes', '📦 Stock'].map((item, index) => (
                <div key={index} style={{ 
                  background: '#0c5460', 
                  padding: '8px 12px', 
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 500
                }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ 
          marginTop: 20, 
          padding: 15, 
          background: '#1c3353', 
          borderRadius: 8,
          borderLeft: '4px solid #17a2b8'
        }}>
          <p style={{ margin: 0, fontStyle: 'italic', color: '#7aa3ff' }}>
            💡 <strong>Conseils :</strong>
          </p>
          <ul style={{ margin: '8px 0', paddingLeft: 20, color: '#99b2d4' }}>
            <li>Sauvegarde complète : 1x par semaine</li>
            <li>Sauvegarde rapide : quotidienne</li>
            <li>Gardez au moins 3 sauvegardes récentes</li>
            <li>Stockez vos backups sur un cloud (Drive, Dropbox...)</li>
          </ul>
        </div>
      </div>

      {/* Permissions */}
      {!isOwner && role !== 'docteur' && (
        <div style={{ 
          marginTop: 20, 
          padding: 15, 
          background: '#856404', 
          borderRadius: 8, 
          color: '#fff3cd',
          fontSize: '0.9rem',
          borderLeft: '4px solid #ffc107'
        }}>
          ⚠️ <strong>Accès limité :</strong> En tant que vendeuse, vous pouvez exporter uniquement les ventes et le stock.
        </div>
      )}
    </div>
  );
}
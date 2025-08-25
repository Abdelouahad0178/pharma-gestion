// src/components/DataRestore.js
import React, { useState } from 'react';
import { db } from '../firebase/config';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { useUserRole } from '../contexts/UserRoleContext';

export default function DataRestore() {
  const { isOwner, societeId } = useUserRole();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [restoring, setRestoring] = useState(false);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/json') {
      setFile(selectedFile);
      setStatus(`📁 Fichier sélectionné : ${selectedFile.name}`);
    } else {
      setStatus('❌ Veuillez sélectionner un fichier JSON valide');
    }
  };

  const restoreData = async () => {
    if (!file || !isOwner) {
      setStatus('❌ Fichier manquant ou permissions insuffisantes');
      return;
    }

    setRestoring(true);
    setProgress(0);
    setStatus('🔄 Lecture du fichier de sauvegarde...');

    try {
      // Lire le fichier JSON
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      setStatus('📊 Validation des données...');
      
      // Vérifier la structure
      if (!backupData.data || !backupData.metadata) {
        throw new Error('Structure de sauvegarde invalide');
      }

      const collections = Object.keys(backupData.data);
      const totalCollections = collections.length;
      let currentCollection = 0;

      setStatus(`🔄 Restauration de ${totalCollections} collections...`);

      // Restaurer chaque collection
      for (const collectionName of collections) {
        const collectionData = backupData.data[collectionName];
        
        if (!Array.isArray(collectionData)) {
          console.warn(`Collection ${collectionName} ignorée (format invalide)`);
          continue;
        }

        setStatus(`🔄 Restauration ${collectionName} (${collectionData.length} documents)...`);

        // Traitement par lots (batch) pour de meilleures performances
        const batchSize = 50;
        for (let i = 0; i < collectionData.length; i += batchSize) {
          const batch = writeBatch(db);
          const currentBatch = collectionData.slice(i, i + batchSize);

          for (const docData of currentBatch) {
            if (!docData.id) continue;

            // Nettoyer les données avant restauration
            const cleanData = { ...docData };
            delete cleanData.id;
            delete cleanData._exportedAt;
            delete cleanData._collection;

            // Convertir les dates ISO en Timestamps Firestore
            const processedData = convertDatesToFirestore(cleanData);

            // Définir le chemin de collection
            let docRef;
            if (collectionName === 'users') {
              docRef = doc(db, 'users', docData.id);
            } else if (collectionName === 'societeInfo') {
              docRef = doc(db, 'societe', docData.id || societeId);
            } else {
              docRef = doc(db, 'societe', societeId, collectionName, docData.id);
            }

            batch.set(docRef, processedData);
          }

          await batch.commit();
        }

        currentCollection++;
        setProgress(Math.round((currentCollection / totalCollections) * 100));
      }

      setStatus(`✅ Restauration terminée ! ${backupData.statistics?.totalDocuments || 'Nombreux'} documents restaurés`);

    } catch (error) {
      console.error('Erreur restauration:', error);
      setStatus(`❌ Erreur : ${error.message}`);
    }

    setRestoring(false);
    setTimeout(() => {
      setProgress(0);
      setStatus('');
    }, 8000);
  };

  // Convertir les dates ISO en Timestamps Firestore
  const convertDatesToFirestore = (data) => {
    return JSON.parse(JSON.stringify(data, (key, value) => {
      // Reconnaître les dates ISO (format 2024-01-15T14:30:00.000Z)
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value); // Firebase convertira automatiquement en Timestamp
      }
      return value;
    }));
  };

  if (!isOwner) {
    return (
      <div className="paper-card" style={{ textAlign: 'center', maxWidth: 500, margin: '20px auto' }}>
        <h3>❌ Accès Refusé</h3>
        <p>Seul le propriétaire peut restaurer des données.</p>
      </div>
    );
  }

  return (
    <div className="paper-card" style={{ maxWidth: 600, margin: '20px auto' }}>
      <h3 style={{ textAlign: 'center', color: '#e4edfa', marginBottom: 20 }}>
        🔄 Restauration des Données
      </h3>

      <div style={{ 
        padding: 15, 
        background: '#721c24', 
        borderRadius: 8, 
        marginBottom: 20,
        borderLeft: '4px solid #dc3545'
      }}>
        <strong>⚠️ ATTENTION :</strong> Cette opération remplacera toutes les données existantes !
        <br />Assurez-vous d'avoir créé une sauvegarde récente avant de continuer.
      </div>

      {/* Sélection de fichier */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 10, fontWeight: 600 }}>
          📁 Sélectionner un fichier de sauvegarde JSON :
        </label>
        <input
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          disabled={restoring}
          style={{
            width: '100%',
            padding: '10px',
            border: '2px dashed #34518b',
            borderRadius: 8,
            background: '#2b3951',
            color: '#e4edfa',
            cursor: restoring ? 'not-allowed' : 'pointer'
          }}
        />
      </div>

      {/* Barre de progression */}
      {restoring && progress > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            background: '#34518b',
            borderRadius: 10,
            height: 8,
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #007bff, #17a2b8)',
              height: '100%',
              width: `${progress}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
          <p style={{ textAlign: 'center', margin: '8px 0', fontSize: '0.8rem' }}>
            {progress}% restauré
          </p>
        </div>
      )}

      {/* Status */}
      {status && (
        <div style={{
          padding: 12,
          background: status.includes('✅') ? '#155724' : 
                     status.includes('❌') ? '#721c24' : '#0c5460',
          borderRadius: 8,
          marginBottom: 20,
          color: '#fff'
        }}>
          {status}
        </div>
      )}

      {/* Bouton de restauration */}
      <button
        onClick={restoreData}
        disabled={!file || restoring}
        className="btn"
        style={{
          width: '100%',
          padding: '14px',
          background: (!file || restoring) ? '#555' : 'linear-gradient(90deg, #007bff, #17a2b8)',
          fontSize: '1.1rem'
        }}
      >
        {restoring ? '🔄 Restauration en cours...' : '🔄 Restaurer les Données'}
      </button>

      {/* Instructions */}
      <div style={{ 
        marginTop: 25,
        padding: 15,
        background: '#2b3951',
        borderRadius: 8,
        fontSize: '0.85rem',
        color: '#99b2d4'
      }}>
        <h4 style={{ color: '#e4edfa', marginBottom: 10 }}>📋 Instructions :</h4>
        <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
          <li>Sélectionner un fichier JSON de sauvegarde</li>
          <li>Vérifier le nom et la date du fichier</li>
          <li>Cliquer sur "Restaurer les Données"</li>
          <li>Attendre la fin de la restauration</li>
          <li>Recharger la page pour voir les données restaurées</li>
        </ol>
      </div>
    </div>
  );
}
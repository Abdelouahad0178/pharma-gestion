// src/components/ImportBackup.js
import React, { useState } from 'react';
import { db } from '../firebase/config';
import {
  collection,
  doc,
  writeBatch,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { useUserRole } from '../contexts/UserRoleContext';

/* =========================
   🔧 Helpers dates & utils
========================= */

// Détection très permissive d'une chaîne ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
// On évite de convertir les simples dates locales ambiguës.
const isIsoDateString = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v);

// Conversion récursive: ISO → Date
// - Convertit UNIQUEMENT les chaînes ISO 8601 en Date
// - Laisse les nombres/strings non-ISO intacts (ne touche pas aux prix/quantités)
const convertDatesDeep = (val) => {
  if (val === null || val === undefined) return val;

  if (Array.isArray(val)) {
    return val.map(convertDatesDeep);
  }

  if (typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val)) {
      const v = val[k];
      if (isIsoDateString(v)) {
        const d = new Date(v);
        out[k] = isNaN(d.getTime()) ? v : d;
      } else if (Array.isArray(v) || (v && typeof v === 'object')) {
        out[k] = convertDatesDeep(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  if (isIsoDateString(val)) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : d;
  }

  return val;
};

// Taille de fichier lisible
const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export default function ImportBackup() {
  const { isOwner, societeId, user } = useUserRole();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [backupPreview, setBackupPreview] = useState(null);
  const [replaceMode, setReplaceMode] = useState(true); // remplacement complet par défaut

  // Prévisualisation du fichier
  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/json') {
      setStatus('❌ Veuillez sélectionner un fichier JSON valide');
      return;
    }

    setFile(selectedFile);
    setStatus(`📁 Analyse du fichier: ${selectedFile.name}...`);

    try {
      const text = await selectedFile.text();
      const backup = JSON.parse(text);

      if (!backup?.data || !backup?.metadata) {
        throw new Error('Structure de sauvegarde invalide');
      }

      const collections = Object.keys(backup.data).map((key) => ({
        name: key,
        count: Array.isArray(backup.data[key]) ? backup.data[key].length : (backup.data[key] ? 1 : 0),
        type: Array.isArray(backup.data[key]) ? 'collection' : 'document',
      }));

      const preview = {
        metadata: backup.metadata,
        statistics: backup.statistics || {},
        collections,
      };

      setBackupPreview(preview);
      setStatus(
        `✅ Fichier analysé: ${preview.statistics.totalDocuments ?? 'N/A'} documents dans ${collections.length} collections`
      );
    } catch (err) {
      console.error('Erreur analyse fichier:', err);
      setStatus(`❌ Erreur lors de l'analyse: ${err.message || String(err)}`);
      setFile(null);
      setBackupPreview(null);
    }
  };

  // Suppression (remplacement)
  const clearExistingData = async () => {
    setStatus('🗑️ Suppression des données existantes...');

    const collectionsToClean = [
      'achats', 'ventes', 'stock', 'devisFactures',
      'paiements', 'retours', 'parametres',
      'fournisseurs', 'clients', 'produits',
    ];

    let deletedCount = 0;

    for (const name of collectionsToClean) {
      try {
        const ref = collection(db, 'societe', societeId, name);
        const snap = await getDocs(ref);
        if (snap.empty) continue;

        const docs = snap.docs;
        const batchSize = 500;

        for (let i = 0; i < docs.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + batchSize);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          deletedCount += chunk.length;
        }

        console.log(`✅ ${name}: ${docs.length} documents supprimés`);
      } catch (err) {
        console.warn(`⚠️ Erreur suppression ${name}:`, err);
      }
    }

    setStatus(`🗑️ ${deletedCount} documents supprimés`);
    return deletedCount;
  };

  // Import principal
  const importBackup = async () => {
    if (!file || !isOwner || !backupPreview) {
      setStatus('❌ Fichier manquant, permissions insuffisantes ou analyse incomplète');
      return;
    }

    const confirmMessage = replaceMode
      ? "⚠️ ATTENTION: Cette opération va SUPPRIMER toutes les données existantes et les remplacer par celles de la sauvegarde. Action IRRÉVERSIBLE. Continuer ?"
      : "Cette opération va AJOUTER les données de la sauvegarde aux données existantes (fusion). Continuer ?";
    if (!window.confirm(confirmMessage)) return;

    setImporting(true);
    setProgress(0);

    try {
      // Lecture du fichier
      setStatus('📖 Lecture du fichier de sauvegarde...');
      const text = await file.text();
      const backup = JSON.parse(text);

      // Compter les opérations pour le progress
      let totalOps = 0;
      Object.entries(backup.data).forEach(([_, docsOrObj]) => {
        if (Array.isArray(docsOrObj)) totalOps += docsOrObj.length;
        else if (docsOrObj && typeof docsOrObj === 'object') totalOps += 1;
      });
      if (totalOps === 0) totalOps = 1;

      // Supprimer l'existant si remplacement
      if (replaceMode) await clearExistingData();

      setStatus('📥 Import des nouvelles données...');
      const batchSize = 500;
      let batch = writeBatch(db);
      let batchCount = 0;
      let done = 0;

      const commitBatch = async () => {
        if (batchCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      };

      // Parcourir chaque "collection" de la sauvegarde
      for (const [collectionName, docsOrObj] of Object.entries(backup.data)) {
        setStatus(`📥 Import ${collectionName}...`);

        if (collectionName === 'societeInfo' && docsOrObj && typeof docsOrObj === 'object') {
          // Document unique: infos société
          const societeData = { ...docsOrObj };
          delete societeData.id;
          delete societeData._exportedAt;

          const processed = convertDatesDeep(societeData);
          const sRef = doc(db, 'societe', societeId);
          batch.set(sRef, processed, { merge: true });
          batchCount++;
          done++;
          setProgress(Math.round((done / totalOps) * 100));
          if (batchCount >= batchSize) await commitBatch();
          continue;
        }

        if (collectionName === 'users' && Array.isArray(docsOrObj)) {
          // Utilisateurs (seulement si propriétaire; ici on est owner)
          // En mode "ajout/fusion", on merge; en mode "remplacement", on écrase.
          for (const u of docsOrObj) {
            if (!u?.id) continue;
            const data = { ...u };
            delete data.id;
            delete data._exportedAt;
            delete data.password; // ne jamais réimporter
            const processed = convertDatesDeep(data);
            const uRef = doc(db, 'users', u.id);
            batch.set(uRef, processed, { merge: !replaceMode ? true : false });
            batchCount++;
            done++;
            setProgress(Math.round((done / totalOps) * 100));
            if (batchCount >= batchSize) await commitBatch();
          }
          continue;
        }

        // Collections "normales" (tableaux de docs)
        if (Array.isArray(docsOrObj)) {
          for (const d of docsOrObj) {
            if (!d?.id) continue;
            const clean = { ...d };
            delete clean.id;
            delete clean._exportedAt;
            delete clean._collection;

            const processed = convertDatesDeep(clean);
            const ref = doc(db, 'societe', societeId, collectionName, d.id);
            batch.set(ref, processed, { merge: !replaceMode ? true : false });
            batchCount++;
            done++;
            setProgress(Math.round((done / totalOps) * 100));
            if (batchCount >= batchSize) await commitBatch();
          }
        }
      }

      // Commit final
      await commitBatch();

      setProgress(100);
      setStatus(`✅ Import terminé ! ${done} documents importés avec succès`);

      setTimeout(() => {
        if (window.confirm('Import terminé ! Recharger la page pour voir les nouvelles données ?')) {
          window.location.reload();
        }
      }, 1500);
    } catch (err) {
      console.error('Erreur import:', err);
      setStatus(`❌ Erreur lors de l'import: ${err.message || String(err)}`);
    } finally {
      setImporting(false);
      setTimeout(() => {
        setProgress(0);
        if (!status.includes('✅')) setStatus('');
      }, 8000);
    }
  };

  if (!isOwner) {
    return (
      <div className="paper-card" style={{ textAlign: 'center', maxWidth: 500, margin: '20px auto' }}>
        <h3>❌ Accès Refusé</h3>
        <p>Seul le propriétaire peut importer des sauvegardes.</p>
      </div>
    );
  }

  // UI
  const exportDateForPreview = (() => {
    const m = backupPreview?.metadata;
    if (!m) return '';
    if (m.exportDateIso) return m.exportDateIso;
    if (m.exportDate) return m.exportDate;
    if (m.exportDateMs) return new Date(m.exportDateMs).toISOString();
    return '';
  })();

  return (
    <div className="paper-card" style={{ maxWidth: 700, margin: '20px auto' }}>
      <h3 style={{ textAlign: 'center', color: '#e4edfa', marginBottom: 20 }}>
        📥 Import de Sauvegarde JSON
      </h3>

      {/* Upload */}
      <div style={{
        border: '2px dashed #4CAF50',
        borderRadius: 10,
        padding: 20,
        textAlign: 'center',
        marginBottom: 20,
        background: '#1a4d1a'
      }}>
        <input
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          disabled={importing}
          style={{
            marginBottom: 10,
            padding: 8,
            background: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: 5
          }}
        />
        <br />
        <small style={{ color: '#aaa' }}>
          Sélectionnez un fichier généré par la fonction d’export
        </small>
      </div>

      {/* Options */}
      {backupPreview && (
        <div style={{ background: '#2d3748', padding: 15, borderRadius: 8, marginBottom: 20 }}>
          <h4 style={{ color: '#e4edfa', marginBottom: 10 }}>Options d'import :</h4>

          <label style={{ display: 'block', marginBottom: 10, color: '#fff' }}>
            <input
              type="radio"
              name="importMode"
              checked={replaceMode}
              onChange={() => setReplaceMode(true)}
              disabled={importing}
              style={{ marginRight: 8 }}
            />
            <strong>Remplacement complet</strong> — supprime tout et remplace
          </label>

          <label style={{ display: 'block', color: '#fff' }}>
            <input
              type="radio"
              name="importMode"
              checked={!replaceMode}
              onChange={() => setReplaceMode(false)}
              disabled={importing}
              style={{ marginRight: 8 }}
            />
            <strong>Ajout / Fusion</strong> — ajoute/merge sans supprimer
          </label>
        </div>
      )}

      {/* Aperçu */}
      {backupPreview && (
        <div style={{ background: '#2d3748', padding: 15, borderRadius: 8, marginBottom: 20 }}>
          <h4 style={{ color: '#e4edfa', marginBottom: 10 }}>Aperçu de la sauvegarde :</h4>

          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: '#4CAF50' }}>Date d'export :</strong>{' '}
            <span style={{ color: '#fff' }}>
              {exportDateForPreview
                ? new Date(exportDateForPreview).toLocaleString('fr-FR')
                : (backupPreview.metadata?.exportDateFr || '—')}
            </span>
          </div>

          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: '#4CAF50' }}>Société :</strong>{' '}
            <span style={{ color: '#fff' }}>
              {backupPreview.metadata?.societeName || 'Non spécifiée'}
            </span>
          </div>

          <div style={{ marginBottom: 15 }}>
            <strong style={{ color: '#4CAF50' }}>Statistiques :</strong>
            <ul style={{ margin: '5px 0', paddingLeft: 20, color: '#fff' }}>
              <li>{backupPreview.statistics?.totalDocuments ?? 'N/A'} documents au total</li>
              <li>{backupPreview.collections.length} collections</li>
              <li>Taille: {formatFileSize(file?.size || 0)}</li>
            </ul>
          </div>

          <details>
            <summary style={{ color: '#4CAF50', cursor: 'pointer', marginBottom: 10 }}>
              Détail des collections
            </summary>
            <div style={{ paddingLeft: 15 }}>
              {backupPreview.collections.map((col) => (
                <div
                  key={col.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '5px 0',
                    borderBottom: '1px solid #444',
                  }}
                >
                  <span style={{ color: '#fff' }}>{col.name}</span>
                  <span style={{ color: '#4CAF50' }}>
                    {col.count} {col.type === 'collection' ? 'documents' : 'document'}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Warning remplacement */}
      {replaceMode && backupPreview && (
        <div style={{
          padding: 15, background: '#721c24', borderRadius: 8, marginBottom: 20,
          borderLeft: '4px solid #dc3545'
        }}>
          <strong>⚠️ ATTENTION — MODE REMPLACEMENT :</strong>
          <ul style={{ margin: '10px 0', paddingLeft: 20 }}>
            <li>Toutes les données actuelles seront définitivement supprimées</li>
            <li>Opération irréversible</li>
            <li>Vérifiez votre sauvegarde avant de continuer</li>
          </ul>
        </div>
      )}

      {/* Import */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <button
          onClick={importBackup}
          disabled={!backupPreview || importing}
          style={{
            padding: '12px 24px',
            background: backupPreview && !importing ? '#4CAF50' : '#666',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: backupPreview && !importing ? 'pointer' : 'not-allowed',
            fontSize: 16,
            fontWeight: 'bold',
          }}
        >
          {importing ? '⏳ Import en cours...' : `📥 ${replaceMode ? 'Remplacer' : 'Importer'} les données`}
        </button>
      </div>

      {/* Progress */}
      {importing && (
        <div style={{ background: '#2d3748', borderRadius: 10, padding: 3, marginBottom: 15 }}>
          <div
            style={{
              background: 'linear-gradient(90deg, #4CAF50, #45a049)',
              height: 20,
              borderRadius: 7,
              width: `${progress}%`,
              transition: 'width 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <small style={{ color: '#fff', fontWeight: 'bold' }}>{progress}%</small>
          </div>
        </div>
      )}

      {/* Statut */}
      {status && (
        <div
          style={{
            padding: 12,
            background: status.includes('❌') ? '#721c24' :
                       status.includes('✅') ? '#1a4d1a' : '#2d3748',
            borderRadius: 8,
            textAlign: 'center',
            color: '#fff',
            fontWeight: 'bold',
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}

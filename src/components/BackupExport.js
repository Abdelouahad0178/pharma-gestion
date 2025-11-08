// src/components/BackupExport.js
import React, { useState } from 'react';
import { db } from '../firebase/config';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
} from 'firebase/firestore';
import { useUserRole } from '../contexts/UserRoleContext';

/* =========================
   🔧 Helpers dates & JSON
========================= */
// Détecte un Timestamp Firestore (v9+) ou un objet {seconds, nanoseconds}
const isFirestoreTimestamp = (v) =>
  !!v && typeof v === 'object' &&
  (
    typeof v.toDate === 'function' ||
    (typeof v.seconds === 'number' && typeof v.nanoseconds === 'number')
  );

// Convertit en Date JS (ou null si impossible)
const toJsDate = (value) => {
  try {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (isFirestoreTimestamp(value)) {
      if (typeof value.toDate === 'function') return value.toDate();
      // Objet “timestamp-like”
      return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
    }
    return null;
  } catch {
    return null;
  }
};

// Normalisation profonde: Dates/Timestamps → ISO8601 ; undefined → null ; obj/array traités récursivement
const normalizeForExport = (data) => {
  const seen = new WeakSet();

  const _walk = (val) => {
    if (val === null) return null;
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') return val;
    if (val === undefined) return null;

    const asDate = toJsDate(val);
    if (asDate) return asDate.toISOString();

    if (Array.isArray(val)) return val.map((item) => _walk(item));

    if (t === 'object') {
      if (seen.has(val)) return null;
      seen.add(val);
      const out = {};
      for (const k of Object.keys(val)) out[k] = _walk(val[k]);
      return out;
    }

    return val;
  };

  return _walk(data);
};

// Format lisible taille fichier
const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/* =========================
   🔎 Fetch helpers
========================= */
/**
 * Lis la collection "stock_entries" de la société en n’exportant
 * que les articles qui ont réellement du stock.
 *
 * Stratégie :
 *   1) Requête serveur: where('quantite','>',0)
 *   2) Fallback (anciens docs sans 'quantite') :
 *      - where('stock1','>',0)
 *      - where('stock2','>',0)
 *   3) Merge par id et filtrage de sécurité côté client
 */
async function fetchInStockEntries(db, societeId) {
  const baseCol = collection(db, 'societe', societeId, 'stock_entries');
  const resultsMap = new Map();

  // 1) quantite > 0
  try {
    const q1 = query(baseCol, where('quantite', '>', 0));
    const snap1 = await getDocs(q1);
    snap1.forEach(d => resultsMap.set(d.id, { id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('⚠️ stock_entries (quantite>0) échoué:', e?.message || e);
  }

  // 2a) stock1 > 0
  try {
    const q2 = query(baseCol, where('stock1', '>', 0));
    const snap2 = await getDocs(q2);
    snap2.forEach(d => resultsMap.set(d.id, { id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('⚠️ stock_entries (stock1>0) échoué:', e?.message || e);
  }

  // 2b) stock2 > 0
  try {
    const q3 = query(baseCol, where('stock2', '>', 0));
    const snap3 = await getDocs(q3);
    snap3.forEach(d => resultsMap.set(d.id, { id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('⚠️ stock_entries (stock2>0) échoué:', e?.message || e);
  }

  // 3) Filtrage de sécurité
  const rows = Array.from(resultsMap.values()).filter(r => {
    const q = Number(r?.quantite || 0);
    const s1 = Number(r?.stock1 || 0);
    const s2 = Number(r?.stock2 || 0);
    return (q > 0) || (s1 > 0) || (s2 > 0);
  });

  return rows;
}

export default function BackupExport() {
  const { user, societeId, isOwner, role, societeName } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [exportStats, setExportStats] = useState(null);

  // Export complet (opérations + documents + métadonnées)
  const exportAllData = async () => {
    if (!user) { setStatus('❌ Utilisateur non connecté'); return; }
    if (!societeId) { setStatus('❌ Aucune société assignée'); return; }

    setLoading(true);
    setProgress(0);
    setStatus('🔄 Initialisation de l\'export...');
    setExportStats(null);

    try {
      const start = Date.now();
      const exportDate = new Date();

      const backup = {
        metadata: {
          exportDateIso: exportDate.toISOString(),
          exportDateFr: exportDate.toLocaleDateString('fr-FR', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          }),
          exportDateMs: exportDate.getTime(),
          societeId,
          societeName: societeName || 'Pharmacie',
          exportedBy: user.email,
          exportedByRole: role,
          exportedByName: user.displayName || user.email,
          isOwner: !!isOwner,
          version: '1.4',
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
          { name: 'achats',           label: '🛒 Achats',                     priority: 'high',   kind: 'plain' },
          { name: 'ventes',           label: '💰 Ventes',                     priority: 'high',   kind: 'plain' },
          // ⬇️ remplacé "stock" par "stock_entries" et filtrage "en stock"
          { name: 'stock_entries',    label: '📦 Stock (en stock)',           priority: 'high',   kind: 'stock' },
          { name: 'devisFactures',    label: '📄 Devis & Factures',           priority: 'medium', kind: 'plain' },
          { name: 'paiements',        label: '💳 Paiements',                  priority: 'medium', kind: 'plain' },
          { name: 'retours',          label: '↩️ Retours',                    priority: 'low',    kind: 'plain' },
          { name: 'parametres',       label: '⚙️ Paramètres',                 priority: 'low',    kind: 'plain' },
        ];
      } else {
        collections = [
          { name: 'ventes',           label: '💰 Ventes',                     priority: 'high',   kind: 'plain' },
          { name: 'stock_entries',    label: '📦 Stock (en stock) (lecture)', priority: 'medium', kind: 'stock' },
        ];
      }

      const totalCollections = collections.length;
      let currentCollection = 0;
      let totalDocuments = 0;

      // Exporter chaque collection
      for (const coll of collections) {
        setProgress(Math.round((currentCollection / totalCollections) * 100));
        setStatus(`🔄 Export ${coll.label}...`);

        try {
          let rows = [];

          if (coll.kind === 'stock') {
            // 🔥 Seulement les articles en stock (stock_entries)
            rows = await fetchInStockEntries(db, societeId);
          } else {
            // Collections "plain"
            const ref = collection(db, 'societe', societeId, coll.name);
            const snap = await getDocs(ref);
            snap.forEach((docSnap) => {
              rows.push({ id: docSnap.id, ...docSnap.data() });
            });
          }

          backup.data[coll.name] = rows.map((raw) => {
            const clean = normalizeForExport(raw);
            return {
              ...clean,
              _exportedAt: new Date().toISOString(),
              _collection: coll.name,
            };
          });

          const count = rows.length;
          totalDocuments += count;

          backup.statistics.collectionsDetails[coll.name] = {
            label: coll.label,
            count,
            priority: coll.priority,
            exported: true,
            exportedAt: new Date().toISOString(),
            filter: coll.kind === 'stock' ? 'in-stock-only' : undefined,
          };

          console.log(`✅ ${coll.label}: ${count} doc(s) exporté(s)`);
        } catch (err) {
          console.error(`❌ Erreur collection ${coll.name}:`, err);
          backup.data[coll.name] = [];
          backup.statistics.collectionsDetails[coll.name] = {
            label: coll.label,
            count: 0,
            priority: coll.priority,
            exported: false,
            error: err?.message || String(err),
            exportedAt: new Date().toISOString(),
          };
        }

        currentCollection++;
      }

      // Export utilisateurs — propriétaire OU docteur (conforme aux règles)
      if (isOwner || role === 'docteur') {
        setStatus('🔄 Export utilisateurs...');
        try {
          const usersQ = query(collection(db, 'users'), where('societeId', '==', societeId));
          const usersSnap = await getDocs(usersQ);

          backup.data.users = [];
          let count = 0;

          usersSnap.forEach((userDoc) => {
            const clean = normalizeForExport(userDoc.data());
            backup.data.users.push({
              id: userDoc.id,
              ...clean,
              password: undefined, // sera supprimé au stringify
              _exportedAt: new Date().toISOString(),
            });
            count++;
            totalDocuments++;
          });

          backup.statistics.collectionsDetails.users = {
            label: '👥 Utilisateurs',
            count,
            priority: 'high',
            exported: true,
            exportedAt: new Date().toISOString(),
          };

          console.log(`✅ 👥 Utilisateurs: ${count} doc(s) exporté(s)`);
        } catch (err) {
          console.warn('⚠️ Erreur export utilisateurs:', err);
          backup.data.users = [];
          backup.statistics.collectionsDetails.users = {
            label: '👥 Utilisateurs',
            count: 0,
            priority: 'high',
            exported: false,
            error: err?.message || String(err),
            exportedAt: new Date().toISOString(),
          };
        }
      }

      // Export infos société
      if (societeId) {
        setStatus('🔄 Export informations société...');
        try {
          const sRef = doc(db, 'societe', societeId);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) {
            const clean = normalizeForExport(sSnap.data());
            backup.data.societeInfo = {
              id: societeId,
              ...clean,
              _exportedAt: new Date().toISOString(),
            };
            totalDocuments++;

            backup.statistics.collectionsDetails.societeInfo = {
              label: '🏥 Société',
              count: 1,
              priority: 'high',
              exported: true,
              exportedAt: new Date().toISOString(),
            };
          }
        } catch (err) {
          console.warn('⚠️ Erreur export société:', err);
          backup.data.societeInfo = null;
          backup.statistics.collectionsDetails.societeInfo = {
            label: '🏥 Société',
            count: 0,
            priority: 'high',
            exported: false,
            error: err?.message || String(err),
            exportedAt: new Date().toISOString(),
          };
        }
      }

      // Stats finales
      const end = Date.now();
      backup.statistics.totalDocuments = totalDocuments;
      backup.statistics.totalCollections = Object.keys(backup.data).length;
      backup.statistics.exportDuration = end - start;

      setProgress(100);
      setStatus('📁 Génération du fichier JSON...');

      // JSON final
      const jsonString = JSON.stringify(backup, (k, v) => (v === undefined ? null : v), 2);
      const fileSize = new Blob([jsonString]).size;
      backup.statistics.fileSize = fileSize;

      // Nom de fichier
      const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const safeName = (societeName || 'pharma').replace(/[^a-zA-Z0-9]/g, '').substring(0, 18) || 'pharma';
      const fileName = `backup-${safeName}-${ts}.json`;

      // Téléchargement
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

      // Statistiques à l’écran
      setExportStats({
        fileName,
        totalDocuments,
        totalCollections: backup.statistics.totalCollections,
        fileSize: formatFileSize(fileSize),
        duration: Math.round(backup.statistics.exportDuration / 1000),
        collections: backup.statistics.collectionsDetails,
      });

      setStatus(`✅ Sauvegarde créée : ${fileName}`);
    } catch (error) {
      console.error('❌ Erreur export complète:', error);
      setStatus(`❌ Erreur: ${error.message || String(error)}`);
    }

    setLoading(false);
    setTimeout(() => { setStatus(''); setProgress(0); }, 10000);
  };

  // Export rapide (essentiel)
  const exportQuickBackup = async () => {
    if (!user || !societeId) {
      setStatus('❌ Données utilisateur manquantes');
      return;
    }

    setLoading(true);
    setStatus('🚀 Export rapide en cours...');

    try {
      const quick = {
        metadata: {
          type: 'quick_backup',
          exportDateIso: new Date().toISOString(),
          exportDateFr: new Date().toLocaleDateString('fr-FR'),
          exportDateMs: Date.now(),
          societeId,
          societeName: societeName || 'Pharmacie',
          exportedBy: user.email,
          version: '1.4',
        },
        data: {},
        statistics: {
          totalDocuments: 0,
          priority: 'essential_only',
        },
      };

      let totalDocs = 0;

      // Ventes (complet)
      try {
        const ventesRef = collection(db, 'societe', societeId, 'ventes');
        const ventesSnap = await getDocs(ventesRef);
        quick.data.ventes = ventesSnap.docs.map(d => ({ id: d.id, ...normalizeForExport(d.data()) }));
        totalDocs += quick.data.ventes.length;
      } catch (e) {
        console.warn('Erreur ventes:', e);
        quick.data.ventes = [];
      }

      // Stock (en stock seulement)
      try {
        const rows = await fetchInStockEntries(db, societeId);
        quick.data.stock_entries = rows.map(r => normalizeForExport(r));
        totalDocs += quick.data.stock_entries.length;
      } catch (e) {
        console.warn('Erreur stock_entries:', e);
        quick.data.stock_entries = [];
      }

      quick.statistics.totalDocuments = totalDocs;

      const day = new Date().toISOString().split('T')[0];
      const fileName = `quick-backup-${day}.json`;

      const blob = new Blob([JSON.stringify(quick, (k, v) => (v === undefined ? null : v), 2)], { type: 'application/json' });
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
      setStatus(`❌ Erreur: ${error.message || String(error)}`);
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

  // UI
  return (
    <div className="paper-card" style={{ maxWidth: 700, margin: '20px auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 25 }}>
        <h3 style={{ color: '#e4edfa', marginBottom: 10 }}>💾 Sauvegarde des Données</h3>
        <p style={{ color: '#99b2d4', fontSize: '0.95rem' }}>
          Exportez vos données de <strong>{societeName || 'votre pharmacie'}</strong> en format JSON
        </p>
      </div>

      {loading && progress > 0 && (
        <div style={{ marginBottom: 25 }}>
          <div style={{
            background: '#34518b', borderRadius: 12, height: 10, overflow: 'hidden',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #28a745, #20c997)',
              height: '100%', width: `${progress}%`, transition: 'width 0.3s ease', borderRadius: '12px'
            }} />
          </div>
          <p style={{ textAlign: 'center', margin: '10px 0', fontSize: '0.85rem', color: '#99b2d4', fontWeight: 600 }}>
            {progress}% terminé
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
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

      {status && (
        <div style={{
          marginTop: 20, padding: 15,
          background: status.includes('✅') ? '#155724' :
                     status.includes('❌') ? '#721c24' : '#0c5460',
          borderRadius: 10, color: '#fff',
          borderLeft: `5px solid ${
            status.includes('✅') ? '#28a745' :
            status.includes('❌') ? '#dc3545' : '#17a2b8'
          }`,
          fontWeight: 500
        }}>
          {status}
        </div>
      )}

      {exportStats && (
        <div style={{ marginTop: 20, padding: 20, background: '#155724', borderRadius: 10, color: '#fff' }}>
          <h4 style={{ marginBottom: 15, color: '#28a745' }}>📊 Statistiques d'export</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><span style={{ color: '#d4edda' }}>📁 Fichier : </span><span style={{ fontWeight: 600 }}>{exportStats.fileName}</span></div>
            <div><span style={{ color: '#d4edda' }}>📄 Documents : </span><span style={{ fontWeight: 600 }}>{exportStats.totalDocuments}</span></div>
            <div><span style={{ color: '#d4edda' }}>📂 Collections : </span><span style={{ fontWeight: 600 }}>{exportStats.totalCollections}</span></div>
            <div><span style={{ color: '#d4edda' }}>💾 Taille : </span><span style={{ fontWeight: 600 }}>{exportStats.fileSize}</span></div>
            <div><span style={{ color: '#d4edda' }}>⏱️ Durée : </span><span style={{ fontWeight: 600 }}>{exportStats.duration}s</span></div>
          </div>

          <div style={{ marginTop: 15 }}>
            <h5 style={{ color: '#d4edda', marginBottom: 10 }}>📋 Détail des collections :</h5>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
              {Object.entries(exportStats.collections).map(([name, info]) => (
                <div key={name} style={{
                  background: info.exported ? '#1e7e34' : '#721c24',
                  padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem'
                }}>
                  <span>{info.label} : </span>
                  <span style={{ fontWeight: 600 }}>
                    {info.exported ? `${info.count} docs ✅` : 'Erreur ❌'}
                    {info.filter === 'in-stock-only' ? ' (filtré en stock)' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 25, padding: 20, background: '#2b3951', borderRadius: 10, fontSize: '0.9rem', color: '#99b2d4' }}>
        <h4 style={{ color: '#e4edfa', marginBottom: 15 }}>📋 Contenu des sauvegardes</h4>

        <div style={{ display: 'grid', gap: 15 }}>
          <div>
            <h5 style={{ color: '#28a745', marginBottom: 8 }}>💾 Sauvegarde Complète</h5>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {((isOwner || role === 'docteur') ? [
                '🛒 Achats', '💰 Ventes', '📦 Stock (en stock)',
                '📄 Devis/Factures', '💳 Paiements', '↩️ Retours',
                '⚙️ Paramètres', '👥 Utilisateurs', '🏥 Société'
              ] : ['💰 Ventes', '📦 Stock (en stock) (lecture)']).map((item, i) => (
                <div key={i} style={{ background: '#34518b', padding: '8px 10px', borderRadius: 6, textAlign: 'center', fontSize: '0.8rem', fontWeight: 500 }}>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h5 style={{ color: '#17a2b8', marginBottom: 8 }}>🚀 Sauvegarde Rapide</h5>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['💰 Ventes', '📦 Stock (en stock)'].map((item, i) => (
                <div key={i} style={{ background: '#0c5460', padding: '8px 12px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 500 }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, padding: 15, background: '#1c3353', borderRadius: 8, borderLeft: '4px solid #17a2b8' }}>
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

      {!isOwner && role !== 'docteur' && (
        <div style={{
          marginTop: 20, padding: 15, background: '#856404', borderRadius: 8,
          color: '#fff3cd', fontSize: '0.9rem', borderLeft: '4px solid #ffc107'
        }}>
          ⚠️ <strong>Accès limité :</strong> En tant que vendeuse, vous pouvez exporter uniquement les ventes et le stock (en stock).
        </div>
      )}
    </div>
  );
}

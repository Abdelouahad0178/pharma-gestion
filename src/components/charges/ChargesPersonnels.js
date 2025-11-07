// src/components/charges/ChargesPersonnels.js
// Design moderne + Responsive + Temps réel + Réconciliation paiements
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Grid,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Alert,
  Stack,
  useMediaQuery,
  Autocomplete,
  Collapse,
  Tooltip,
  Badge
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Description as DescriptionIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  AttachMoney as MoneyIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { db } from '../../firebase/config';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  where,
  Timestamp,
  writeBatch,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { useUserRole } from '../../contexts/UserRoleContext';

/* ====================== Utils ====================== */
const tryGetCollection = async (societeId, names, orderField = 'createdAt', orderDir = 'desc', max = 200) => {
  for (const name of names) {
    try {
      const q = query(
        collection(db, 'societe', societeId, name),
        orderBy(orderField, orderDir),
        limit(max)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (_e) {
      // Essayer le prochain alias
    }
  }
  return [];
};

const toFloat = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Extrait l'URL "Create index" depuis un message d'erreur Firestore
function extractIndexUrlFromError(err) {
  const msg = String(err?.message || '');
  const m = msg.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : '';
}

export default function ChargesPersonnels() {
  const { user, societeId } = useUserRole();

  // Détection responsive
  const isMobile = useMediaQuery('(max-width:768px)');
  const isTablet = useMediaQuery('(min-width:769px) and (max-width:1024px)');
  const isDesktop = useMediaQuery('(min-width:1025px)');
  const fontScale = isMobile ? 0.95 : isTablet ? 0.98 : 1; // réduit légèrement sur desktop

  const [charges, setCharges] = useState([]);
  const [filteredCharges, setFilteredCharges] = useState([]);
  const [loading, setLoading] = useState(true);

  // Lien "Create index" si manquant
  const [missingIndexUrl, setMissingIndexUrl] = useState('');

  // Employés
  const [employes, setEmployes] = useState([]);
  const [loadingEmployes, setLoadingEmployes] = useState(false);

  // Dialogues
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const [editingCharge, setEditingCharge] = useState(null);
  const [selectedCharge, setSelectedCharge] = useState(null);
  const [currentTab, setCurrentTab] = useState(0);

  // Filtres
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    searchText: '',
    dateDebut: '',
    dateFin: '',
    poste: '',
    typeDocument: ''
  });

  // Form CHARGE
  const today = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    employe: '',
    employeId: '',
    cin: '',
    telephone: '',
    adresse: '',
    numeroSecuriteSociale: '',
    poste: '',
    dateEmbauche: '',
    salaire: '',
    prime: '',
    heuresSupplementaires: '',
    tauxHoraire: '',
    indemnites: '',
    date: today,
    typeDocument: '',
    numeroDocument: '',
    dateDocument: today,
    pieceJointe: '',
    description: '',
    notes: '',
    modePaiement: '',
    referenceVirement: ''
  });

  // Mode création rapide employé
  const [newEmployeeMode, setNewEmployeeMode] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    nom: '',
    cin: '',
    telephone: '',
    adresse: '',
    numeroSecuriteSociale: '',
    poste: '',
    dateEmbauche: ''
  });

  const typesDocuments = [
    'Bulletin de paie',
    'Quittance de salaire',
    'Contrat de travail',
    'Avenant',
    'Attestation',
    'Ordre de virement',
    'Reçu',
    'Autre'
  ];

  const typesPostes = [
    'Pharmacien',
    'Préparateur',
    'Vendeuse',
    'Comptable',
    'Responsable stock',
    "Agent d'entretien",
    'Stagiaire',
    'Autre'
  ];

  const modesPaiement = [
    'Espèces',
    'Chèque',
    'Virement bancaire',
    'Carte bancaire',
    'Prélèvement',
    'Autre'
  ];

  /* =================== Charges en TEMPS RÉEL =================== */
  useEffect(() => {
    if (!user || !societeId) return;
    setLoading(true);

    const qCharges = query(
      collection(db, 'societe', societeId, 'chargesPersonnels'),
      orderBy('date', 'desc')
    );

    const unsub = onSnapshot(
      qCharges,
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCharges(data);
        setLoading(false);
      },
      (err) => {
        console.error('Erreur listener charges:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, societeId]);

  /* =================== Employés (chargement ponctuel) =================== */
  const loadEmployes = async () => {
    if (!societeId) return;
    setLoadingEmployes(true);
    try {
      const rows = await tryGetCollection(
        societeId,
        ['employes', 'Employes', 'salaries', 'Salaries', 'personnels'],
        'createdAt',
        'desc',
        500
      );
      const normalized = rows.map(r => ({
        id: r.id,
        nom: r.nom || r.name || r.employe || '',
        cin: r.cin || '',
        telephone: r.telephone || r.tel || '',
        adresse: r.adresse || r.address || '',
        numeroSecuriteSociale: r.numeroSecuriteSociale || r.nss || '',
        poste: r.poste || '',
        dateEmbauche: r.dateEmbauche || '',
        createdAt: r.createdAt || null
      }));
      setEmployes(normalized);
    } catch (e) {
      console.error('Erreur chargement employes:', e);
      setEmployes([]);
    } finally {
      setLoadingEmployes(false);
    }
  };

  useEffect(() => {
    if (!societeId) return;
    loadEmployes();
  }, [societeId]);

  /* =================== Préchargement dernière charge d'un salarié =================== */
  const preloadLastCharge = async (employeId) => {
    try {
      const qLast = query(
        collection(db, 'societe', societeId, 'chargesPersonnels'),
        where('employeId', '==', employeId),
        orderBy('date', 'desc'),
        limit(1)
      );
      const snap = await getDocs(qLast);
      if (snap.empty) return;

      const last = { id: snap.docs[0].id, ...snap.docs[0].data() };

      setFormData(prev => ({
        ...prev,
        salaire: last.salaire ?? prev.salaire ?? '',
        prime: last.prime ?? prev.prime ?? '',
        heuresSupplementaires: last.heuresSupplementaires ?? prev.heuresSupplementaires ?? '',
        tauxHoraire: last.tauxHoraire ?? prev.tauxHoraire ?? '',
        indemnites: last.indemnites ?? prev.indemnites ?? '',
        typeDocument: last.typeDocument ?? prev.typeDocument ?? '',
        numeroDocument: last.numeroDocument ?? prev.numeroDocument ?? '',
        dateDocument: last.dateDocument || prev.dateDocument || today,
        pieceJointe: last.pieceJointe ?? prev.pieceJointe ?? '',
        description: last.description ?? prev.description ?? '',
        notes: last.notes ?? prev.notes ?? '',
        modePaiement: last.modePaiement ?? prev.modePaiement ?? '',
        referenceVirement: last.referenceVirement ?? prev.referenceVirement ?? ''
      }));
      if (missingIndexUrl) setMissingIndexUrl('');
    } catch (e) {
      console.error('Erreur preload dernière charge:', e);
      const url = extractIndexUrlFromError(e);
      if (url) setMissingIndexUrl(url);
    }
  };

  /* =================== Filtres =================== */
  useEffect(() => {
    let result = [...charges];

    if (filters.searchText) {
      const s = filters.searchText.toLowerCase();
      result = result.filter(charge =>
        (String(charge.employe || '').toLowerCase().includes(s)) ||
        (String(charge.employeName || '').toLowerCase().includes(s)) ||
        (String(charge.cin || '').toLowerCase().includes(s)) ||
        (String(charge.poste || '').toLowerCase().includes(s)) ||
        (String(charge.description || '').toLowerCase().includes(s)) ||
        (String(charge.numeroDocument || '').toLowerCase().includes(s))
      );
    }
    if (filters.dateDebut) result = result.filter(c => (c.date || '') >= filters.dateDebut);
    if (filters.dateFin)   result = result.filter(c => (c.date || '') <= filters.dateFin);
    if (filters.poste)     result = result.filter(c => (c.poste || '') === filters.poste);
    if (filters.typeDocument) result = result.filter(c => (c.typeDocument || '') === filters.typeDocument);

    setFilteredCharges(result);
  }, [filters, charges]);

  const activeFiltersCount = useMemo(
    () => Object.values(filters).filter(v => v !== '').length,
    [filters]
  );

  const handleResetFilters = () => {
    setFilters({
      searchText: '',
      dateDebut: '',
      dateFin: '',
      poste: '',
      typeDocument: ''
    });
  };

  const resetForm = () => {
    setFormData({
      employe: '',
      employeId: '',
      cin: '',
      telephone: '',
      adresse: '',
      numeroSecuriteSociale: '',
      poste: '',
      dateEmbauche: '',
      salaire: '',
      prime: '',
      heuresSupplementaires: '',
      tauxHoraire: '',
      indemnites: '',
      date: today,
      typeDocument: '',
      numeroDocument: '',
      dateDocument: today,
      pieceJointe: '',
      description: '',
      notes: '',
      modePaiement: '',
      referenceVirement: ''
    });
    setEditingCharge(null);
    setCurrentTab(0);
    setNewEmployeeMode(false);
    setNewEmployee({
      nom: '',
      cin: '',
      telephone: '',
      adresse: '',
      numeroSecuriteSociale: '',
      poste: '',
      dateEmbauche: ''
    });
  };

  /* ============== Auto-fill employé sélectionné ============== */
  const applyEmployeeToForm = (emp) => {
    if (!emp) return;
    setFormData(prev => ({
      ...prev,
      employe: emp.nom || '',
      employeId: emp.id || '',
      cin: emp.cin || '',
      telephone: emp.telephone || '',
      adresse: emp.adresse || '',
      numeroSecuriteSociale: emp.numeroSecuriteSociale || '',
      poste: emp.poste || '',
      dateEmbauche: emp.dateEmbauche || ''
    }));
  };

  const calculerTotal = (data = formData) => {
    const salaire = toFloat(data.salaire);
    const prime = toFloat(data.prime);
    const hs = toFloat(data.heuresSupplementaires) * toFloat(data.tauxHoraire);
    const indemnites = toFloat(data.indemnites);
    return salaire + prime + hs + indemnites;
    };

  const handleOpenDialog = (charge = null) => {
    if (charge) {
      setEditingCharge(charge);
      setFormData({
        employe: charge.employe || charge.employeName || '',
        employeId: charge.employeId || '',
        cin: charge.cin || '',
        telephone: charge.telephone || '',
        adresse: charge.adresse || '',
        numeroSecuriteSociale: charge.numeroSecuriteSociale || '',
        poste: charge.poste || '',
        dateEmbauche: charge.dateEmbauche || '',
        salaire: charge.salaire ?? '',
        prime: charge.prime ?? '',
        heuresSupplementaires: charge.heuresSupplementaires ?? '',
        tauxHoraire: charge.tauxHoraire ?? '',
        indemnites: charge.indemnites ?? '',
        date: charge.date || today,
        typeDocument: charge.typeDocument || '',
        numeroDocument: charge.numeroDocument || '',
        dateDocument: charge.dateDocument || today,
        pieceJointe: charge.pieceJointe || '',
        description: charge.description || '',
        notes: charge.notes || '',
        modePaiement: charge.modePaiement || '',
        referenceVirement: charge.referenceVirement || ''
      });
      setNewEmployeeMode(false);
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleViewDetails = (charge) => {
    setSelectedCharge(charge);
    setDetailsDialogOpen(true);
  };

  /* =================== Save (avec réconciliation paiements) =================== */
  const handleSave = async () => {
    try {
      let employeId = formData.employeId || '';
      let employeName = formData.employe || '';

      // 1) Création rapide salarié si demandé
      if (newEmployeeMode) {
        if (!newEmployee.nom.trim()) {
          alert("Veuillez saisir le nom du nouveau salarié.");
          return;
        }
        const empDoc = await addDoc(collection(db, 'societe', societeId, 'employes'), {
          nom: newEmployee.nom.trim(),
          cin: (newEmployee.cin || '').trim(),
          telephone: (newEmployee.telephone || '').trim(),
          adresse: (newEmployee.adresse || '').trim(),
          numeroSecuriteSociale: (newEmployee.numeroSecuriteSociale || '').trim(),
          poste: (newEmployee.poste || '').trim(),
          dateEmbauche: (newEmployee.dateEmbauche || '').trim(),
          createdAt: Timestamp.now(),
          createdBy: user.uid
        });
        employeId = empDoc.id;
        employeName = newEmployee.nom.trim();
        await loadEmployes();
      } else {
        const exists = employes.find(e => e.id === employeId);
        if (!exists && !employeName) {
          alert("Veuillez sélectionner un salarié existant ou créer un nouveau.");
          return;
        }
      }

      // 2) Données calculées
      const total = calculerTotal();
      const montantHS = toFloat(formData.heuresSupplementaires) * toFloat(formData.tauxHoraire);

      // 3) Données charge
      const chargeData = {
        employe: employeName,
        employeName,
        employeId: employeId || '',
        cin: (newEmployeeMode ? newEmployee.cin : formData.cin) || '',
        telephone: (newEmployeeMode ? newEmployee.telephone : formData.telephone) || '',
        adresse: (newEmployeeMode ? newEmployee.adresse : formData.adresse) || '',
        numeroSecuriteSociale: (newEmployeeMode ? newEmployee.numeroSecuriteSociale : formData.numeroSecuriteSociale) || '',
        poste: (newEmployeeMode ? newEmployee.poste : formData.poste) || '',
        dateEmbauche: (newEmployeeMode ? newEmployee.dateEmbauche : formData.dateEmbauche) || '',
        salaire: toFloat(formData.salaire),
        prime: toFloat(formData.prime),
        heuresSupplementaires: toFloat(formData.heuresSupplementaires),
        tauxHoraire: toFloat(formData.tauxHoraire),
        indemnites: toFloat(formData.indemnites),
        montantHS,
        total,
        date: formData.date,
        typeDocument: formData.typeDocument || '',
        numeroDocument: formData.numeroDocument || '',
        dateDocument: formData.dateDocument || '',
        pieceJointe: formData.pieceJointe || '',
        description: formData.description || '',
        notes: formData.notes || '',
        modePaiement: formData.modePaiement || '',
        referenceVirement: formData.referenceVirement || '',
        updatedAt: Timestamp.now(),
        updatedBy: user.uid
      };

      // 4) Création / MAJ charge
      let chargeId;
      if (editingCharge) {
        await updateDoc(doc(db, 'societe', societeId, 'chargesPersonnels', editingCharge.id), chargeData);
        chargeId = editingCharge.id;
      } else {
        const payload = { ...chargeData, createdAt: Timestamp.now(), createdBy: user.uid };
        const ref = await addDoc(collection(db, 'societe', societeId, 'chargesPersonnels'), payload);
        chargeId = ref.id;
      }

      // 5) Réconcilier les paiements liés à cette charge
      const qPaiementsLinked = query(
        collection(db, 'societe', societeId, 'paiements'),
        where('chargePersonnelId', '==', chargeId)
      );
      const oldPaysSnap = await getDocs(qPaiementsLinked);
      if (!oldPaysSnap.empty) {
        const batch = writeBatch(db);
        oldPaysSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // 6) Recréer le paiement uniquement si un mode est défini et total > 0
      if (formData.modePaiement && total > 0) {
        const paiementData = {
          type: 'chargePersonnel',
          category: 'chargePersonnel',
          relatedTo: 'chargePersonnel',
          montant: total,
          mode: formData.modePaiement,
          moyen: formData.modePaiement,
          paymentMode: formData.modePaiement,
          typePaiement: formData.modePaiement,
          date: formData.date,
          timestamp: Timestamp.now(),
          description: `Charge personnel: ${employeName} - ${(newEmployeeMode ? newEmployee.poste : formData.poste) || 'N/A'}`,
          reference: formData.referenceVirement || '',
          chargePersonnelId: chargeId,
          employe: employeName,
          poste: (newEmployeeMode ? newEmployee.poste : formData.poste) || '',
          createdAt: Timestamp.now(),
          createdBy: user.uid
        };
        await addDoc(collection(db, 'societe', societeId, 'paiements'), paiementData);
      }

      handleCloseDialog();
    } catch (error) {
      console.error('Erreur enregistrement:', error);
      alert("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (charge) => {
    if (!window.confirm(`Supprimer la charge de ${charge.employe || charge.employeName} ?`)) return;
    try {
      const qPaiements = query(
        collection(db, 'societe', societeId, 'paiements'),
        where('chargePersonnelId', '==', charge.id)
      );
      const snapP = await getDocs(qPaiements);

      const batch = writeBatch(db);
      snapP.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'societe', societeId, 'chargesPersonnels', charge.id));
      await batch.commit();
    } catch (e) {
      console.error('Erreur suppression:', e);
      alert('Erreur lors de la suppression');
    }
  };

  /* =================== UI helpers =================== */
  const stats = {
    total: filteredCharges.reduce((s, c) => s + (c.total || 0), 0),
    count: filteredCharges.length,
    salaires: filteredCharges.reduce((s, c) => s + (c.salaire || 0), 0),
    primes: filteredCharges.reduce((s, c) => s + (c.prime || 0), 0)
  };

  const getPosteColor = (poste) => {
    const colors = {
      Pharmacien: '#8b5cf6',
      Préparateur: '#06b6d4',
      Vendeuse: '#ec4899',
      Comptable: '#10b981',
      'Responsable stock': '#f59e0b',
      "Agent d'entretien": '#64748b',
      Stagiaire: '#3b82f6',
      Autre: '#64748b'
    };
    return colors[poste] || '#64748b';
  };

  // Styles modernes alignés avec le site (tailles ajustées)
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 100%)',
      padding: isMobile ? '10px' : isTablet ? '20px' : '24px',
      fontFamily: 'Inter, Arial, sans-serif'
    },
    mainCard: {
      background: 'white',
      borderRadius: isMobile ? '14px' : isTablet ? '18px' : '18px',
      boxShadow: '0 24px 48px rgba(0,0,0,0.12)',
      overflow: 'hidden',
      margin: '0 auto',
      maxWidth: isDesktop ? '1280px' : '100%'
    },
    header: {
      background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
      padding: isMobile ? '16px 14px' : isTablet ? '20px 18px' : '22px',
      textAlign: 'center',
      color: 'white'
    },
    title: {
      fontSize: `${1.6 * fontScale}rem`,
      fontWeight: 800,
      margin: 0,
      lineHeight: 1.2
    },
    subtitle: {
      marginTop: '6px',
      opacity: 0.9,
      fontSize: `${0.92 * fontScale}rem`
    },
    content: {
      padding: isMobile ? '12px' : isTablet ? '18px' : '22px'
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
      gap: isMobile ? '10px' : '14px',
      marginBottom: isMobile ? '14px' : '18px'
    },
    statCard: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
      padding: isMobile ? '12px' : '14px',
      borderRadius: isMobile ? '10px' : '12px',
      border: '1px solid #e2e8f0',
      textAlign: 'center'
    },
    statIcon: {
      fontSize: isMobile ? '1.6rem' : '1.8rem',
      marginBottom: '6px'
    },
    statLabel: {
      color: '#64748b',
      fontSize: `${0.78 * fontScale}rem`,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.4px',
      marginBottom: '3px'
    },
    statValue: {
      color: '#2d3748',
      fontSize: `${1.15 * fontScale}rem`,
      fontWeight: 800
    },
    actionBar: {
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: isMobile ? 'stretch' : 'center',
      gap: isMobile ? '8px' : '10px',
      marginBottom: isMobile ? '14px' : '18px'
    },
    button: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      border: 'none',
      borderRadius: '9px',
      padding: '10px 14px',
      color: 'white',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: `${0.95 * fontScale}rem`,
      transition: 'all 0.25s ease',
      minHeight: '40px',
      width: isMobile ? '100%' : 'auto'
    },
    filterButton: {
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '9px',
      padding: '10px 14px',
      color: '#2d3748',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: `${0.95 * fontScale}rem`,
      transition: 'all 0.25s ease',
      minHeight: '40px'
    },
    chargesGrid: {
      display: 'grid',
      gap: isMobile ? '12px' : '14px'
    },
    chargeCard: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
      padding: isMobile ? '12px' : '14px',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      transition: 'all 0.25s ease',
      cursor: 'pointer'
    }
  };

  /* =================== Render =================== */
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.mainCard, padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>⏳</div>
          <div style={{ fontSize: '1rem', color: '#64748b', fontWeight: 600 }}>
            Chargement des charges du personnel...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>💼 Charges du Personnel</h1>
          <p style={styles.subtitle}>Gestion complète de la paie et des charges sociales</p>
        </div>

        <div style={styles.content}>
          {/* Alerte index manquant */}
          {missingIndexUrl && (
            <div
              style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                padding: '12px',
                borderRadius: '10px',
                marginBottom: '14px',
                border: '1px solid #fbbf24',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <span style={{ color: '#92400e', fontWeight: 600, fontSize: `${0.95 * fontScale}rem` }}>
                ⚠️ Cette page nécessite un index Firestore pour charger les données
              </span>
              <button
                style={{
                  ...styles.button,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  padding: '8px 12px',
                  fontSize: `${0.9 * fontScale}rem`,
                  width: 'auto'
                }}
                onClick={() => window.open(missingIndexUrl, '_blank', 'noopener')}
              >
                Créer l'index maintenant
              </button>
            </div>
          )}

          {/* Stats Cards */}
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={{ ...styles.statIcon, color: '#667eea' }}>💰</div>
              <div style={styles.statLabel}>Total Charges</div>
              <div style={{ ...styles.statValue, color: '#667eea' }}>{stats.total.toFixed(2)} DHS</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statIcon, color: '#10b981' }}>📊</div>
              <div style={styles.statLabel}>Entrées</div>
              <div style={{ ...styles.statValue, color: '#10b981' }}>{stats.count}</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statIcon, color: '#3b82f6' }}>💵</div>
              <div style={styles.statLabel}>Total Salaires</div>
              <div style={{ ...styles.statValue, color: '#3b82f6' }}>{stats.salaires.toFixed(2)} DHS</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statIcon, color: '#f59e0b' }}>🎁</div>
              <div style={styles.statLabel}>Total Primes</div>
              <div style={{ ...styles.statValue, color: '#f59e0b' }}>{stats.primes.toFixed(2)} DHS</div>
            </div>
          </div>

          {/* Action Bar */}
          <div style={styles.actionBar}>
            <button style={styles.filterButton} onClick={() => setFiltersOpen(v => !v)}>
              <Badge badgeContent={activeFiltersCount} color="error">
                <FilterListIcon fontSize="small" />{' '}
                <span style={{ marginLeft: 6, fontSize: `${0.95 * fontScale}rem` }}>Filtres</span>
              </Badge>
            </button>
            <button style={styles.button} onClick={() => handleOpenDialog()}>
              <AddIcon fontSize="small" />{' '}
              <span style={{ marginLeft: 6, fontSize: `${0.95 * fontScale}rem` }}>Nouvelle charge</span>
            </button>
          </div>

          {/* Filtres */}
          <Collapse in={filtersOpen} unmountOnExit>
            <div
              style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                padding: isMobile ? '12px' : '14px',
                borderRadius: '10px',
                marginBottom: '14px',
                border: '1px solid #e2e8f0'
              }}
            >
              <Grid container spacing={1.5}>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Rechercher"
                    value={filters.searchText}
                    onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
                    fullWidth
                    size="small"
                    placeholder="Nom, CIN, poste..."
                    InputProps={{
                      endAdornment: <SearchIcon fontSize="small" />,
                      sx: { backgroundColor: 'white', fontSize: `${0.92 * fontScale}rem` }
                    }}
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    label="Date début"
                    type="date"
                    value={filters.dateDebut}
                    onChange={(e) => setFilters({ ...filters, dateDebut: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true, sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { backgroundColor: 'white', fontSize: `${0.92 * fontScale}rem` } }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    label="Date fin"
                    type="date"
                    value={filters.dateFin}
                    onChange={(e) => setFilters({ ...filters, dateFin: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true, sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { backgroundColor: 'white', fontSize: `${0.92 * fontScale}rem` } }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontSize: `${0.9 * fontScale}rem` }}>Poste</InputLabel>
                    <Select
                      value={filters.poste}
                      onChange={(e) => setFilters({ ...filters, poste: e.target.value })}
                      label="Poste"
                      sx={{ backgroundColor: 'white', '& .MuiSelect-select': { fontSize: `${0.92 * fontScale}rem` } }}
                    >
                      <MenuItem value="">Tous</MenuItem>
                      {typesPostes.map(poste => (
                        <MenuItem key={poste} value={poste}>{poste}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontSize: `${0.9 * fontScale}rem` }}>Type document</InputLabel>
                    <Select
                      value={filters.typeDocument}
                      onChange={(e) => setFilters({ ...filters, typeDocument: e.target.value })}
                      label="Type document"
                      sx={{ backgroundColor: 'white', '& .MuiSelect-select': { fontSize: `${0.92 * fontScale}rem` } }}
                    >
                      <MenuItem value="">Tous</MenuItem>
                      {typesDocuments.map(type => (
                        <MenuItem key={type} value={type}>{type}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={1}>
                  <button
                    style={{
                      ...styles.filterButton,
                      width: '100%',
                      minHeight: '36px',
                      padding: '8px'
                    }}
                    onClick={handleResetFilters}
                  >
                    <ClearIcon fontSize="small" />{' '}
                    {activeFiltersCount > 0 && <span style={{ marginLeft: 4 }}>({activeFiltersCount})</span>}
                  </button>
                </Grid>
              </Grid>
            </div>
          </Collapse>

          {/* Liste des charges */}
          <div style={styles.chargesGrid}>
            {filteredCharges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 14px', color: '#64748b' }}>
                <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📋</div>
                <div style={{ fontSize: `${1 * fontScale}rem`, fontWeight: 600 }}>Aucune charge trouvée</div>
                <div style={{ marginTop: '6px', fontSize: `${0.9 * fontScale}rem` }}>
                  Commencez par ajouter une charge du personnel
                </div>
              </div>
            ) : (
              filteredCharges.map((charge) => (
                <div
                  key={charge.id}
                  style={styles.chargeCard}
                  onClick={() => handleViewDetails(charge)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      marginBottom: '10px',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div
                        style={{
                          fontSize: `${1.05 * fontScale}rem`,
                          fontWeight: 800,
                          color: '#2d3748',
                          marginBottom: '4px'
                        }}
                      >
                        {charge.employe || charge.employeName}
                      </div>
                      <div style={{ fontSize: `${0.86 * fontScale}rem`, color: '#64748b', fontWeight: 600 }}>
                        {charge.date} {charge.cin && `• CIN: ${charge.cin}`}
                      </div>
                    </div>
                    <Chip
                      label={charge.poste || 'N/A'}
                      size="small"
                      sx={{
                        bgcolor: `${getPosteColor(charge.poste)}20`,
                        color: getPosteColor(charge.poste),
                        fontWeight: 700,
                        borderRadius: '18px',
                        px: 1.5,
                        fontSize: `${0.8 * fontScale}rem`
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                      gap: '12px',
                      marginBottom: '10px',
                      paddingTop: '10px',
                      borderTop: '1px solid #e2e8f0'
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: `${0.72 * fontScale}rem`,
                          color: '#64748b',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          marginBottom: '4px'
                        }}
                      >
                        Salaire
                      </div>
                      <div style={{ fontSize: `${0.96 * fontScale}rem`, fontWeight: 700, color: '#2d3748' }}>
                        {(charge.salaire ?? 0).toFixed(2)} DHS
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: `${0.72 * fontScale}rem`,
                          color: '#64748b',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          marginBottom: '4px'
                        }}
                      >
                        Prime
                      </div>
                      <div style={{ fontSize: `${0.96 * fontScale}rem`, fontWeight: 700, color: '#2d3748' }}>
                        {(charge.prime ?? 0).toFixed(2)} DHS
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: `${0.72 * fontScale}rem`,
                          color: '#64748b',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          marginBottom: '4px'
                        }}
                      >
                        Total
                      </div>
                      <div style={{ fontSize: `${1 * fontScale}rem`, fontWeight: 800, color: '#667eea' }}>
                        {(charge.total ?? 0).toFixed(2)} DHS
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: `${0.72 * fontScale}rem`,
                          color: '#64748b',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          marginBottom: '4px'
                        }}
                      >
                        Paiement
                      </div>
                      <div style={{ fontSize: `${0.85 * fontScale}rem`, fontWeight: 700, color: '#2d3748' }}>
                        {charge.modePaiement || 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'flex-end',
                      paddingTop: '8px',
                      borderTop: '1px solid #e2e8f0'
                    }}
                  >
                    <Tooltip title="Voir les détails">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(charge);
                        }}
                        size="small"
                        sx={{ bgcolor: '#667eea', color: 'white', width: 34, height: 34, '&:hover': { bgcolor: '#5a67d8' } }}
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Modifier">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(charge);
                        }}
                        size="small"
                        sx={{ bgcolor: '#10b981', color: 'white', width: 34, height: 34, '&:hover': { bgcolor: '#059669' } }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Supprimer">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(charge);
                        }}
                        size="small"
                        sx={{ bgcolor: '#ef4444', color: 'white', width: 34, height: 34, '&:hover': { bgcolor: '#dc2626' } }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Dialog Formulaire */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        fullScreen={isMobile}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : '12px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
            color: 'white',
            fontWeight: 800,
            fontSize: isMobile ? '1.05rem' : '1.15rem',
            py: isMobile ? 1.5 : 2,
            px: isMobile ? 1.5 : 2.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{editingCharge ? 'Modifier la charge' : 'Nouvelle charge'}</span>
          {isMobile && (
            <IconButton onClick={handleCloseDialog} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>

        <DialogContent sx={{ p: isMobile ? 1.5 : 2.5 }}>
          <Tabs
            value={currentTab}
            onChange={(e, v) => setCurrentTab(v)}
            variant={isMobile ? 'scrollable' : 'fullWidth'}
            scrollButtons={isMobile ? 'auto' : false}
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              mb: 2,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: isMobile ? '0.83rem' : '0.9rem',
                minHeight: isMobile ? 40 : 42,
                px: isMobile ? 1 : 2
              },
              '& .Mui-selected': { color: '#667eea !important' },
              '& .MuiTabs-indicator': { backgroundColor: '#667eea', height: 3 }
            }}
          >
            <Tab icon={<PersonIcon fontSize="small" />} iconPosition="start" label="Employé" />
            <Tab icon={<MoneyIcon fontSize="small" />} iconPosition="start" label="Rémunération" />
            <Tab icon={<DescriptionIcon fontSize="small" />} iconPosition="start" label="Document" />
            <Tab icon={<MoneyIcon fontSize="small" />} iconPosition="start" label="Paiement" />
          </Tabs>

          {/* EMPLOYÉ */}
          {currentTab === 0 && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Alert
                severity="info"
                sx={{
                  background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                  border: '1px solid #60a5fa',
                  borderRadius: '10px',
                  fontSize: `${0.92 * fontScale}rem`
                }}
              >
                Sélectionnez un salarié existant : ses infos + la dernière rémunération seront chargées.
              </Alert>

              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} md={8}>
                  <Autocomplete
                    options={employes}
                    loading={loadingEmployes}
                    getOptionLabel={(opt) => opt?.nom || ''}
                    isOptionEqualToValue={(opt, val) => opt.id === val.id}
                    value={
                      formData.employeId
                        ? (employes.find(e => e.id === formData.employeId) || null)
                        : null
                    }
                    onChange={async (_e, value) => {
                      if (value && value.id) {
                        applyEmployeeToForm(value);
                        setNewEmployeeMode(false);
                        await preloadLastCharge(value.id);
                      } else {
                        setFormData(prev => ({ ...prev, employeId: '', employe: '' }));
                      }
                    }}
                    size="small"
                    noOptionsText="Aucun salarié"
                    slotProps={{
                      paper: {
                        sx: {
                          '& .MuiAutocomplete-option': {
                            fontSize: `${0.92 * fontScale}rem`,
                            py: 0.75
                          }
                        }
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Chercher salarié existant"
                        placeholder="Tapez un nom..."
                        size="small"
                        disabled={newEmployeeMode}
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{
                          ...params.InputProps,
                          sx: {
                            ...params.InputProps?.sx,
                            height: 40,
                            fontSize: `${0.95 * fontScale}rem`,
                            bgcolor: 'white'
                          }
                        }}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <button
                    style={{
                      ...styles.button,
                      width: '100%',
                      background: newEmployeeMode
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    }}
                    onClick={() => {
                      setNewEmployeeMode((v) => !v);
                      if (!newEmployeeMode) {
                        setFormData(prev => ({ ...prev, employeId: '', employe: '' }));
                      }
                    }}
                  >
                    {newEmployeeMode ? 'Choisir salarié existant' : '➕ Créer nouveau salarié'}
                  </button>
                </Grid>
              </Grid>

              {newEmployeeMode ? (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                    padding: isMobile ? '12px' : '14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1, color: '#2d3748', fontSize: `${0.98 * fontScale}rem` }}>
                    Nouveau salarié
                  </Typography>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Nom *"
                        value={newEmployee.nom}
                        onChange={(e) => setNewEmployee({ ...newEmployee, nom: e.target.value })}
                        fullWidth
                        required
                        size="small"
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { bgcolor: 'white', fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="CIN"
                        value={newEmployee.cin}
                        onChange={(e) => setNewEmployee({ ...newEmployee, cin: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { bgcolor: 'white', fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Téléphone"
                        value={newEmployee.telephone}
                        onChange={(e) => setNewEmployee({ ...newEmployee, telephone: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { bgcolor: 'white', fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel sx={{ fontSize: `${0.9 * fontScale}rem` }}>Poste</InputLabel>
                        <Select
                          value={newEmployee.poste}
                          onChange={(e) => setNewEmployee({ ...newEmployee, poste: e.target.value })}
                          label="Poste"
                          sx={{ bgcolor: 'white', '& .MuiSelect-select': { fontSize: `${0.95 * fontScale}rem` } }}
                        >
                          {typesPostes.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        label="Adresse"
                        value={newEmployee.adresse}
                        onChange={(e) => setNewEmployee({ ...newEmployee, adresse: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { bgcolor: 'white', fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="N° Sécurité Sociale"
                        value={newEmployee.numeroSecuriteSociale}
                        onChange={(e) => setNewEmployee({ ...newEmployee, numeroSecuriteSociale: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { bgcolor: 'white', fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Date d'embauche"
                        type="date"
                        value={newEmployee.dateEmbauche}
                        onChange={(e) => setNewEmployee({ ...newEmployee, dateEmbauche: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ shrink: true, sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { bgcolor: 'white', fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                  </Grid>
                </div>
              ) : (
                <>
                  <TextField
                    label="Nom de l'employé *"
                    value={formData.employe}
                    onChange={(e) => setFormData({ ...formData, employe: e.target.value })}
                    fullWidth
                    required
                    size="small"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                  />
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="CIN"
                        value={formData.cin}
                        onChange={(e) => setFormData({ ...formData, cin: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Téléphone"
                        value={formData.telephone}
                        onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Adresse"
                    value={formData.adresse}
                    onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                    fullWidth
                    multiline
                    rows={2}
                    size="small"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                  />
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="N° Sécurité Sociale"
                        value={formData.numeroSecuriteSociale}
                        onChange={(e) => setFormData({ ...formData, numeroSecuriteSociale: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel sx={{ fontSize: `${0.9 * fontScale}rem` }}>Poste</InputLabel>
                        <Select
                          value={formData.poste}
                          onChange={(e) => setFormData({ ...formData, poste: e.target.value })}
                          label="Poste"
                          sx={{ '& .MuiSelect-select': { fontSize: `${0.95 * fontScale}rem` } }}
                        >
                          {typesPostes.map(poste => (
                            <MenuItem key={poste} value={poste}>{poste}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Date d'embauche"
                        type="date"
                        value={formData.dateEmbauche}
                        onChange={(e) => setFormData({ ...formData, dateEmbauche: e.target.value })}
                        fullWidth
                        size="small"
                        InputLabelProps={{ shrink: true, sx: { fontSize: `${0.9 * fontScale}rem` } }}
                        InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                      />
                    </Grid>
                  </Grid>
                </>
              )}
            </Stack>
          )}

          {/* RÉMUNÉRATION */}
          {currentTab === 1 && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Alert
                severity="info"
                icon={<MoneyIcon fontSize="small" />}
                sx={{
                  background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                  border: '1px solid #22c55e',
                  borderRadius: '10px',
                  fontSize: `${0.92 * fontScale}rem`
                }}
              >
                Tous les montants sont en DHS.
              </Alert>
              <Grid container spacing={1.5}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Salaire de base *"
                    type="number"
                    value={formData.salaire}
                    onChange={(e) => setFormData({ ...formData, salaire: e.target.value })}
                    fullWidth
                    required
                    size="small"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` }, endAdornment: <Typography variant="caption"> DHS</Typography> }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Prime"
                    type="number"
                    value={formData.prime}
                    onChange={(e) => setFormData({ ...formData, prime: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` }, endAdornment: <Typography variant="caption"> DHS</Typography> }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Heures supplémentaires"
                    type="number"
                    value={formData.heuresSupplementaires}
                    onChange={(e) => setFormData({ ...formData, heuresSupplementaires: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` }, endAdornment: <Typography variant="caption"> h</Typography> }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Taux horaire"
                    type="number"
                    value={formData.tauxHoraire}
                    onChange={(e) => setFormData({ ...formData, tauxHoraire: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` }, endAdornment: <Typography variant="caption"> DHS/h</Typography> }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Indemnités"
                    type="number"
                    value={formData.indemnites}
                    onChange={(e) => setFormData({ ...formData, indemnites: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` }, endAdornment: <Typography variant="caption"> DHS</Typography> }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Date de la charge"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true, sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                  />
                </Grid>
              </Grid>

              <div
                style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <Grid container spacing={0.5}>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      H. Supp. :
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" sx={{ fontWeight: 700 }}>
                      {(toFloat(formData.heuresSupplementaires) * toFloat(formData.tauxHoraire)).toFixed(2)} DHS
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sx={{ my: 1 }}>
                    <Divider />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      Total :
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2" align="right" sx={{ fontWeight: 800, color: '#667eea' }}>
                      {calculerTotal().toFixed(2)} DHS
                    </Typography>
                  </Grid>
                </Grid>
              </div>
            </Stack>
          )}

          {/* DOCUMENT */}
          {currentTab === 2 && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Grid container spacing={1.5}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontSize: `${0.9 * fontScale}rem` }}>Type de document</InputLabel>
                    <Select
                      value={formData.typeDocument}
                      onChange={(e) => setFormData({ ...formData, typeDocument: e.target.value })}
                      label="Type de document"
                      sx={{ '& .MuiSelect-select': { fontSize: `${0.95 * fontScale}rem` } }}
                    >
                      {typesDocuments.map(type => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Numéro du document"
                    value={formData.numeroDocument}
                    onChange={(e) => setFormData({ ...formData, numeroDocument: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Date du document"
                    type="date"
                    value={formData.dateDocument}
                    onChange={(e) => setFormData({ ...formData, dateDocument: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true, sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Pièce jointe (URL)"
                    value={formData.pieceJointe}
                    onChange={(e) => setFormData({ ...formData, pieceJointe: e.target.value })}
                    fullWidth
                    size="small"
                    placeholder="https://..."
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                  />
                </Grid>
              </Grid>
              <TextField
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                fullWidth
                multiline
                rows={3}
                size="small"
                InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
              />
              <TextField
                label="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                fullWidth
                multiline
                rows={2}
                size="small"
                InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
              />
            </Stack>
          )}

          {/* PAIEMENT */}
          {currentTab === 3 && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Alert
                severity="info"
                icon={<MoneyIcon fontSize="small" />}
                sx={{
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  border: '1px solid #fbbf24',
                  borderRadius: '10px',
                  fontSize: `${0.92 * fontScale}rem`
                }}
              >
                Le mode de paiement impacte la caisse (Espèces ⇒ déduction).
              </Alert>
              <Grid container spacing={1.5}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontSize: `${0.9 * fontScale}rem` }}>Mode de paiement</InputLabel>
                    <Select
                      value={formData.modePaiement}
                      onChange={(e) => setFormData({ ...formData, modePaiement: e.target.value })}
                      label="Mode de paiement"
                      sx={{ '& .MuiSelect-select': { fontSize: `${0.95 * fontScale}rem` } }}
                    >
                      {modesPaiement.map(mode => (
                        <MenuItem key={mode} value={mode}>
                          {mode}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Référence virement/chèque"
                    value={formData.referenceVirement}
                    onChange={(e) => setFormData({ ...formData, referenceVirement: e.target.value })}
                    fullWidth
                    size="small"
                    placeholder="Ex: CHQ-123456 ou VIR-789012"
                    InputLabelProps={{ sx: { fontSize: `${0.9 * fontScale}rem` } }}
                    InputProps={{ sx: { fontSize: `${0.95 * fontScale}rem` } }}
                  />
                </Grid>
              </Grid>

              {formData.modePaiement === 'Espèces' && (
                <Alert
                  severity="success"
                  sx={{
                    background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                    border: '1px solid #22c55e',
                    borderRadius: '10px',
                    fontSize: `${0.92 * fontScale}rem`
                  }}
                >
                  ✅ Ce paiement en espèces sera déduit de la caisse
                </Alert>
              )}

              <div
                style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <Grid container>
                  <Grid item xs={6}>
                    <Typography variant="body2">Montant total :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" style={{ fontWeight: 800 }}>
                      {calculerTotal().toFixed(2)} DHS
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Mode de paiement :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" style={{ fontWeight: 700 }}>
                      {formData.modePaiement || 'Non spécifié'}
                    </Typography>
                  </Grid>
                </Grid>
              </div>
            </Stack>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            p: isMobile ? 1.5 : 2,
            gap: 1,
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0'
          }}
        >
          <button
            style={{
              ...styles.filterButton,
              flex: isMobile ? 1 : 'none',
              minWidth: isMobile ? 'auto' : 110
            }}
            onClick={handleCloseDialog}
          >
            Annuler
          </button>
          <button
            style={{
              ...styles.button,
              flex: isMobile ? 1 : 'none',
              minWidth: isMobile ? 'auto' : 110,
              opacity: (newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire ? 0.5 : 1,
              cursor:
                (newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire
                  ? 'not-allowed'
                  : 'pointer'
            }}
            onClick={handleSave}
            disabled={(newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire}
          >
            {editingCharge ? 'Modifier' : 'Enregistrer'}
          </button>
        </DialogActions>
      </Dialog>

      {/* Dialog Détails */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : '12px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
            color: 'white',
            fontWeight: 800,
            fontSize: isMobile ? '1.05rem' : '1.15rem',
            py: isMobile ? 1.5 : 2,
            px: isMobile ? 1.5 : 2.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>Détails de la charge</span>
          {isMobile && (
            <IconButton onClick={() => setDetailsDialogOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>

        <DialogContent sx={{ p: isMobile ? 1.5 : 2.5 }}>
          {selectedCharge && (
            <Box sx={{ mt: 0.5 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <Chip
                  icon={<PersonIcon />}
                  label={selectedCharge.poste || 'Non spécifié'}
                  sx={{
                    bgcolor: `${getPosteColor(selectedCharge.poste)}20`,
                    color: getPosteColor(selectedCharge.poste),
                    fontWeight: 800,
                    px: 1.5,
                    borderRadius: '18px',
                    fontSize: `${0.82 * fontScale}rem`
                  }}
                />
              </Stack>

              <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5, color: '#2d3748', fontSize: `${1.02 * fontScale}rem` }}>
                {selectedCharge.employe || selectedCharge.employeName}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                {selectedCharge.date}
              </Typography>

              <Divider sx={{ my: 1.5 }} />

              <Grid container spacing={1.2}>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>CIN</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedCharge.cin || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>Téléphone</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedCharge.telephone || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>Poste</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedCharge.poste || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>N° Sécu</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedCharge.numeroSecuriteSociale || '-'}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>Adresse</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedCharge.adresse || '-'}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 1.5 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: '#2d3748' }}>
                Rémunération
              </Typography>
              <div
                style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <Grid container spacing={0.5}>
                  <Grid item xs={6}><Typography variant="body2">Salaire :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" style={{ fontWeight: 700 }}>{(selectedCharge.salaire ?? 0).toFixed(2)} DHS</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Prime :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" style={{ fontWeight: 700 }}>{(selectedCharge.prime ?? 0).toFixed(2)} DHS</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Heures supp. :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" style={{ fontWeight: 700 }}>{(selectedCharge.montantHS ?? 0).toFixed(2)} DHS</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Indemnités :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" style={{ fontWeight: 700 }}>{(selectedCharge.indemnites ?? 0).toFixed(2)} DHS</Typography></Grid>
                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <Grid item xs={6}><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Total :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="subtitle2" align="right" sx={{ fontWeight: 800, color: '#667eea' }}>{(selectedCharge.total ?? 0).toFixed(2)} DHS</Typography></Grid>
                </Grid>
              </div>

              {selectedCharge.modePaiement && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: '#2d3748' }}>
                    Paiement
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Mode : {selectedCharge.modePaiement}</Typography>
                  {selectedCharge.referenceVirement && (
                    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700 }}>
                      Référence : {selectedCharge.referenceVirement}
                    </Typography>
                  )}
                  {selectedCharge.modePaiement === 'Espèces' && (
                    <Alert
                      severity="info"
                      sx={{
                        mt: 1,
                        background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                        border: '1px solid #60a5fa',
                        borderRadius: '10px'
                      }}
                    >
                      💰 Ce montant a été déduit de la caisse
                    </Alert>
                  )}
                </>
              )}

              {selectedCharge.typeDocument && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: '#2d3748' }}>
                    Document
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Type : {selectedCharge.typeDocument}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700 }}>
                    N° : {selectedCharge.numeroDocument || '-'}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700 }}>
                    Date : {selectedCharge.dateDocument || '-'}
                  </Typography>
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700 }}>
                      Fichier :{' '}
                      <a href={selectedCharge.pieceJointe} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>
                        Voir
                      </a>
                    </Typography>
                  )}
                </>
              )}

              {selectedCharge.description && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: '#2d3748' }}>
                    Description
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedCharge.description}</Typography>
                </>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            p: isMobile ? 1.5 : 2,
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0'
          }}
        >
          <button
            style={{
              ...styles.button,
              width: isMobile ? '100%' : 'auto',
              minWidth: 110
            }}
            onClick={() => setDetailsDialogOpen(false)}
          >
            Fermer
          </button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

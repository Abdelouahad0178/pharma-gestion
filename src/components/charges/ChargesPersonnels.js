// src/components/charges/ChargesPersonnels.js
// Design moderne aligné avec le reste du site + Responsive + TEMPS RÉEL
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
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
  Close as CloseIcon,
  Inventory2 as Inventory2Icon,
  ReceiptLong as ReceiptLongIcon
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
      // On essaie le prochain alias
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
    'Agent d\'entretien',
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
        createdAt: r.createdAt || null,
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

  /* =================== Save =================== */
  const handleSave = async () => {
    try {
      let employeId = formData.employeId || '';
      let employeName = formData.employe || '';

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

      const total = calculerTotal();
      const montantHS = toFloat(formData.heuresSupplementaires) * toFloat(formData.tauxHoraire);

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

      let chargeId;
      if (editingCharge) {
        await updateDoc(doc(db, 'societe', societeId, 'chargesPersonnels', editingCharge.id), chargeData);
        chargeId = editingCharge.id;
      } else {
        const payload = { ...chargeData, createdAt: Timestamp.now(), createdBy: user.uid };
        const ref = await addDoc(collection(db, 'societe', societeId, 'chargesPersonnels'), payload);
        chargeId = ref.id;
      }

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
      'Pharmacien': '#8b5cf6',
      'Préparateur': '#06b6d4',
      'Vendeuse': '#ec4899',
      'Comptable': '#10b981',
      'Responsable stock': '#f59e0b',
      'Agent d\'entretien': '#64748b',
      'Stagiaire': '#3b82f6',
      'Autre': '#64748b'
    };
    return colors[poste] || '#64748b';
  };

  // Styles modernes alignés avec le site
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 100%)',
      padding: isMobile ? '10px' : isTablet ? '20px' : '30px',
      fontFamily: 'Inter, Arial, sans-serif'
    },
    mainCard: {
      background: 'white',
      borderRadius: isMobile ? '15px' : isTablet ? '20px' : '25px',
      boxShadow: '0 30px 60px rgba(0,0,0,0.15)',
      overflow: 'hidden',
      margin: '0 auto',
      maxWidth: isDesktop ? '1400px' : '100%'
    },
    header: {
      background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
      padding: isMobile ? '20px 15px' : isTablet ? '30px 20px' : '40px',
      textAlign: 'center',
      color: 'white'
    },
    title: {
      fontSize: isMobile ? '1.8em' : isTablet ? '2.2em' : '2.5em',
      fontWeight: 800,
      margin: 0
    },
    subtitle: {
      marginTop: '10px',
      opacity: 0.9,
      fontSize: isMobile ? '0.9em' : '1em'
    },
    content: {
      padding: isMobile ? '15px' : isTablet ? '25px' : '40px'
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
      gap: isMobile ? '15px' : '20px',
      marginBottom: isMobile ? '20px' : '30px'
    },
    statCard: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
      padding: isMobile ? '15px' : '20px',
      borderRadius: isMobile ? '10px' : '15px',
      border: '2px solid #e2e8f0',
      textAlign: 'center'
    },
    statIcon: {
      fontSize: isMobile ? '2em' : '2.5em',
      marginBottom: '10px'
    },
    statLabel: {
      color: '#64748b',
      fontSize: isMobile ? '0.8em' : '0.9em',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '5px'
    },
    statValue: {
      color: '#2d3748',
      fontSize: isMobile ? '1.5em' : '1.8em',
      fontWeight: 800
    },
    actionBar: {
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: isMobile ? 'stretch' : 'center',
      gap: isMobile ? '10px' : '15px',
      marginBottom: isMobile ? '20px' : '25px'
    },
    button: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      border: 'none',
      borderRadius: isMobile ? '8px' : '10px',
      padding: isMobile ? '12px 16px' : '12px 20px',
      color: 'white',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: isMobile ? '0.9em' : '1em',
      transition: 'all 0.3s ease',
      minHeight: isMobile ? '44px' : 'auto',
      width: isMobile ? '100%' : 'auto'
    },
    filterButton: {
      background: '#f8fafc',
      border: '2px solid #e2e8f0',
      borderRadius: isMobile ? '8px' : '10px',
      padding: isMobile ? '12px 16px' : '12px 20px',
      color: '#2d3748',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: isMobile ? '0.9em' : '1em',
      transition: 'all 0.3s ease',
      minHeight: isMobile ? '44px' : 'auto'
    },
    chargesGrid: {
      display: 'grid',
      gap: isMobile ? '15px' : '20px'
    },
    chargeCard: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
      padding: isMobile ? '15px' : '20px',
      borderRadius: isMobile ? '10px' : '15px',
      border: '2px solid #e2e8f0',
      transition: 'all 0.3s ease',
      cursor: 'pointer'
    }
  };

  /* =================== Render =================== */
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{...styles.mainCard, padding: '40px', textAlign: 'center'}}>
          <div style={{ fontSize: '3em', marginBottom: '20px' }}>⏳</div>
          <div style={{ fontSize: '1.2em', color: '#64748b', fontWeight: 600 }}>
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
          <p style={styles.subtitle}>
            Gestion complète de la paie et des charges sociales
          </p>
        </div>

        <div style={styles.content}>
          {/* Alerte index manquant */}
          {missingIndexUrl && (
            <div style={{
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              padding: '15px',
              borderRadius: '10px',
              marginBottom: '20px',
              border: '2px solid #fbbf24',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <span style={{ color: '#92400e', fontWeight: 600 }}>
                ⚠️ Cette page nécessite un index Firestore pour charger les données
              </span>
              <button
                style={{
                  ...styles.button,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  padding: '8px 16px',
                  fontSize: '0.9em',
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
              <div style={{...styles.statIcon, color: '#667eea'}}>💰</div>
              <div style={styles.statLabel}>Total Charges</div>
              <div style={{...styles.statValue, color: '#667eea'}}>
                {stats.total.toFixed(2)} MAD
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={{...styles.statIcon, color: '#10b981'}}>📊</div>
              <div style={styles.statLabel}>Entrées</div>
              <div style={{...styles.statValue, color: '#10b981'}}>
                {stats.count}
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={{...styles.statIcon, color: '#3b82f6'}}>💵</div>
              <div style={styles.statLabel}>Total Salaires</div>
              <div style={{...styles.statValue, color: '#3b82f6'}}>
                {stats.salaires.toFixed(2)} MAD
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={{...styles.statIcon, color: '#f59e0b'}}>🎁</div>
              <div style={styles.statLabel}>Total Primes</div>
              <div style={{...styles.statValue, color: '#f59e0b'}}>
                {stats.primes.toFixed(2)} MAD
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div style={styles.actionBar}>
            <button
              style={styles.filterButton}
              onClick={() => setFiltersOpen(v => !v)}
            >
              <Badge badgeContent={activeFiltersCount} color="error">
                <FilterListIcon /> Filtres
              </Badge>
            </button>
            <button
              style={styles.button}
              onClick={() => handleOpenDialog()}
            >
              <AddIcon /> Nouvelle charge
            </button>
          </div>

          {/* Filtres */}
          <Collapse in={filtersOpen} unmountOnExit>
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
              padding: isMobile ? '15px' : '20px',
              borderRadius: '10px',
              marginBottom: '20px',
              border: '2px solid #e2e8f0'
            }}>
              <Grid container spacing={2}>
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
                      style: { background: 'white' }
                    }}
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
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ style: { background: 'white' } }}
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
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ style: { background: 'white' } }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Poste</InputLabel>
                    <Select
                      value={filters.poste}
                      onChange={(e) => setFilters({ ...filters, poste: e.target.value })}
                      label="Poste"
                      style={{ background: 'white' }}
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
                    <InputLabel>Type document</InputLabel>
                    <Select
                      value={filters.typeDocument}
                      onChange={(e) => setFilters({ ...filters, typeDocument: e.target.value })}
                      label="Type document"
                      style={{ background: 'white' }}
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
                      minHeight: '40px',
                      padding: '8px'
                    }}
                    onClick={handleResetFilters}
                  >
                    <ClearIcon /> {activeFiltersCount > 0 && `(${activeFiltersCount})`}
                  </button>
                </Grid>
              </Grid>
            </div>
          </Collapse>

          {/* Liste des charges */}
          <div style={styles.chargesGrid}>
            {filteredCharges.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#64748b'
              }}>
                <div style={{ fontSize: '4em', marginBottom: '20px' }}>📋</div>
                <div style={{ fontSize: '1.2em', fontWeight: 600 }}>
                  Aucune charge trouvée
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.9em' }}>
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
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '15px',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{
                        fontSize: isMobile ? '1.1em' : '1.2em',
                        fontWeight: 800,
                        color: '#2d3748',
                        marginBottom: '5px'
                      }}>
                        {charge.employe || charge.employeName}
                      </div>
                      <div style={{
                        fontSize: '0.85em',
                        color: '#64748b',
                        fontWeight: 600
                      }}>
                        {charge.date} {charge.cin && `• CIN: ${charge.cin}`}
                      </div>
                    </div>
                    <Chip
                      label={charge.poste || 'N/A'}
                      size="small"
                      style={{
                        background: getPosteColor(charge.poste) + '20',
                        color: getPosteColor(charge.poste),
                        fontWeight: 700,
                        borderRadius: '20px',
                        padding: '5px 12px'
                      }}
                    />
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                    gap: '15px',
                    marginBottom: '15px',
                    paddingTop: '15px',
                    borderTop: '2px solid #e2e8f0'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '0.75em',
                        color: '#64748b',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        marginBottom: '5px'
                      }}>
                        Salaire
                      </div>
                      <div style={{
                        fontSize: '1em',
                        fontWeight: 700,
                        color: '#2d3748'
                      }}>
                        {(charge.salaire ?? 0).toFixed(2)} MAD
                      </div>
                    </div>
                    <div>
                      <div style={{
                        fontSize: '0.75em',
                        color: '#64748b',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        marginBottom: '5px'
                      }}>
                        Prime
                      </div>
                      <div style={{
                        fontSize: '1em',
                        fontWeight: 700,
                        color: '#2d3748'
                      }}>
                        {(charge.prime ?? 0).toFixed(2)} MAD
                      </div>
                    </div>
                    <div>
                      <div style={{
                        fontSize: '0.75em',
                        color: '#64748b',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        marginBottom: '5px'
                      }}>
                        Total
                      </div>
                      <div style={{
                        fontSize: '1.1em',
                        fontWeight: 800,
                        color: '#667eea'
                      }}>
                        {(charge.total ?? 0).toFixed(2)} MAD
                      </div>
                    </div>
                    <div>
                      <div style={{
                        fontSize: '0.75em',
                        color: '#64748b',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        marginBottom: '5px'
                      }}>
                        Paiement
                      </div>
                      <div style={{
                        fontSize: '0.85em',
                        fontWeight: 700,
                        color: '#2d3748'
                      }}>
                        {charge.modePaiement || 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end',
                    paddingTop: '10px',
                    borderTop: '2px solid #e2e8f0'
                  }}>
                    <Tooltip title="Voir les détails">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(charge);
                        }}
                        size="small"
                        style={{
                          background: '#667eea',
                          color: 'white',
                          width: '36px',
                          height: '36px'
                        }}
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
                        style={{
                          background: '#10b981',
                          color: 'white',
                          width: '36px',
                          height: '36px'
                        }}
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
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          width: '36px',
                          height: '36px'
                        }}
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

      {/* Dialog Formulaire - reste identique */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        fullScreen={isMobile}
        maxWidth="md"
        fullWidth
        PaperProps={{
          style: {
            borderRadius: isMobile ? 0 : '15px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        }}
      >
        <DialogTitle style={{
          background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
          color: 'white',
          fontWeight: 800,
          fontSize: isMobile ? '1.3em' : '1.5em',
          padding: isMobile ? '15px' : '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{editingCharge ? 'Modifier la charge' : 'Nouvelle charge'}</span>
          {isMobile && (
            <IconButton onClick={handleCloseDialog} style={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>

        <DialogContent style={{ padding: isMobile ? '15px' : '25px' }}>
          <Tabs
            value={currentTab}
            onChange={(e, v) => setCurrentTab(v)}
            variant={isMobile ? "scrollable" : "fullWidth"}
            scrollButtons={isMobile ? "auto" : false}
            sx={{
              borderBottom: 2,
              borderColor: 'divider',
              mb: 3,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: isMobile ? '0.85em' : '0.95em',
                minHeight: isMobile ? '44px' : '48px'
              },
              '& .Mui-selected': {
                color: '#667eea !important'
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#667eea',
                height: '3px'
              }
            }}
          >
            <Tab icon={<PersonIcon />} iconPosition="start" label="Employé" />
            <Tab icon={<MoneyIcon />} iconPosition="start" label="Rémunération" />
            <Tab icon={<DescriptionIcon />} iconPosition="start" label="Document" />
            <Tab icon={<MoneyIcon />} iconPosition="start" label="Paiement" />
          </Tabs>

          {/* EMPLOYÉ */}
          {currentTab === 0 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert
                severity="info"
                style={{
                  background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                  border: '2px solid #60a5fa',
                  borderRadius: '10px'
                }}
              >
                Sélectionnez un salarié existant : ses infos + la dernière rémunération seront chargées.
              </Alert>

              <Grid container spacing={2} alignItems="center">
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
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Chercher salarié existant"
                        placeholder="Tapez un nom..."
                        size="small"
                        disabled={newEmployeeMode}
                      />
                    )}
                    noOptionsText="Aucun salarié"
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
                <div style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                  padding: isMobile ? '15px' : '20px',
                  borderRadius: '10px',
                  border: '2px solid #e2e8f0'
                }}>
                  <Typography variant="subtitle1" style={{ fontWeight: 800, marginBottom: '15px', color: '#2d3748' }}>
                    Nouveau salarié
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Nom *"
                        value={newEmployee.nom}
                        onChange={(e) => setNewEmployee({ ...newEmployee, nom: e.target.value })}
                        fullWidth
                        required
                        size="small"
                        style={{ background: 'white' }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="CIN"
                        value={newEmployee.cin}
                        onChange={(e) => setNewEmployee({ ...newEmployee, cin: e.target.value })}
                        fullWidth
                        size="small"
                        style={{ background: 'white' }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Téléphone"
                        value={newEmployee.telephone}
                        onChange={(e) => setNewEmployee({ ...newEmployee, telephone: e.target.value })}
                        fullWidth
                        size="small"
                        style={{ background: 'white' }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Poste</InputLabel>
                        <Select
                          value={newEmployee.poste}
                          onChange={(e) => setNewEmployee({ ...newEmployee, poste: e.target.value })}
                          label="Poste"
                          style={{ background: 'white' }}
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
                        style={{ background: 'white' }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="N° Sécurité Sociale"
                        value={newEmployee.numeroSecuriteSociale}
                        onChange={(e) => setNewEmployee({ ...newEmployee, numeroSecuriteSociale: e.target.value })}
                        fullWidth
                        size="small"
                        style={{ background: 'white' }}
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
                        InputLabelProps={{ shrink: true }}
                        style={{ background: 'white' }}
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
                  />
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="CIN"
                        value={formData.cin}
                        onChange={(e) => setFormData({ ...formData, cin: e.target.value })}
                        fullWidth
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Téléphone"
                        value={formData.telephone}
                        onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                        fullWidth
                        size="small"
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
                  />
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="N° Sécurité Sociale"
                        value={formData.numeroSecuriteSociale}
                        onChange={(e) => setFormData({ ...formData, numeroSecuriteSociale: e.target.value })}
                        fullWidth
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Poste</InputLabel>
                        <Select
                          value={formData.poste}
                          onChange={(e) => setFormData({ ...formData, poste: e.target.value })}
                          label="Poste"
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
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                  </Grid>
                </>
              )}
            </Stack>
          )}

          {/* RÉMUNÉRATION */}
          {currentTab === 1 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info" icon={<MoneyIcon />} style={{
                background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                border: '2px solid #22c55e',
                borderRadius: '10px'
              }}>
                Tous les montants sont en MAD.
              </Alert>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Salaire de base *"
                    type="number"
                    value={formData.salaire}
                    onChange={(e) => setFormData({ ...formData, salaire: e.target.value })}
                    fullWidth
                    required
                    size="small"
                    InputProps={{ endAdornment: <Typography variant="caption"> MAD</Typography> }}
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
                    InputProps={{ endAdornment: <Typography variant="caption"> MAD</Typography> }}
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
                    InputProps={{ endAdornment: <Typography variant="caption"> h</Typography> }}
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
                    InputProps={{ endAdornment: <Typography variant="caption"> MAD/h</Typography> }}
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
                    InputProps={{ endAdornment: <Typography variant="caption"> MAD</Typography> }}
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
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>

              <div style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                padding: '20px',
                borderRadius: '10px',
                border: '2px solid #e2e8f0'
              }}>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="caption" style={{ color: '#64748b' }}>H. Supp. :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" style={{ fontWeight: 700 }}>
                      {(toFloat(formData.heuresSupplementaires) * toFloat(formData.tauxHoraire)).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sx={{ my: 1 }}><Divider /></Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2" style={{ fontWeight: 800 }}>Total :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2" align="right" style={{ fontWeight: 800, color: '#667eea' }}>
                      {calculerTotal().toFixed(2)} MAD
                    </Typography>
                  </Grid>
                </Grid>
              </div>
            </Stack>
          )}

          {/* DOCUMENT */}
          {currentTab === 2 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Type de document</InputLabel>
                    <Select
                      value={formData.typeDocument}
                      onChange={(e) => setFormData({ ...formData, typeDocument: e.target.value })}
                      label="Type de document"
                    >
                      {typesDocuments.map(type => (
                        <MenuItem key={type} value={type}>{type}</MenuItem>
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
                    InputLabelProps={{ shrink: true }}
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
              />
              <TextField
                label="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                fullWidth
                multiline
                rows={2}
                size="small"
              />
            </Stack>
          )}

          {/* PAIEMENT */}
          {currentTab === 3 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info" icon={<MoneyIcon />} style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                border: '2px solid #fbbf24',
                borderRadius: '10px'
              }}>
                Le mode de paiement impacte la caisse (Espèces ⇒ déduction).
              </Alert>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Mode de paiement</InputLabel>
                    <Select
                      value={formData.modePaiement}
                      onChange={(e) => setFormData({ ...formData, modePaiement: e.target.value })}
                      label="Mode de paiement"
                    >
                      {modesPaiement.map(mode => (
                        <MenuItem key={mode} value={mode}>{mode}</MenuItem>
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
                  />
                </Grid>
              </Grid>

              {formData.modePaiement === 'Espèces' && (
                <Alert severity="success" style={{
                  background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                  border: '2px solid #22c55e',
                  borderRadius: '10px'
                }}>
                  ✅ Ce paiement en espèces sera déduit de la caisse
                </Alert>
              )}

              <div style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                padding: '20px',
                borderRadius: '10px',
                border: '2px solid #e2e8f0'
              }}>
                <Grid container>
                  <Grid item xs={6}>
                    <Typography variant="body2">Montant total :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" style={{ fontWeight: 800 }}>
                      {calculerTotal().toFixed(2)} MAD
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

        <DialogActions style={{
          padding: isMobile ? '15px' : '20px',
          gap: '10px',
          background: '#f8fafc',
          borderTop: '2px solid #e2e8f0'
        }}>
          <button
            style={{
              ...styles.filterButton,
              flex: isMobile ? 1 : 'none',
              minWidth: isMobile ? 'auto' : '120px'
            }}
            onClick={handleCloseDialog}
          >
            Annuler
          </button>
          <button
            style={{
              ...styles.button,
              flex: isMobile ? 1 : 'none',
              minWidth: isMobile ? 'auto' : '120px',
              opacity: (newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire ? 0.5 : 1,
              cursor: (newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire ? 'not-allowed' : 'pointer'
            }}
            onClick={handleSave}
            disabled={(newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire}
          >
            {editingCharge ? 'Modifier' : 'Enregistrer'}
          </button>
        </DialogActions>
      </Dialog>

      {/* Dialog Détails - simplifié pour le style moderne */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          style: {
            borderRadius: isMobile ? 0 : '15px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        }}
      >
        <DialogTitle style={{
          background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
          color: 'white',
          fontWeight: 800,
          fontSize: isMobile ? '1.3em' : '1.5em',
          padding: isMobile ? '15px' : '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Détails de la charge</span>
          {isMobile && (
            <IconButton onClick={() => setDetailsDialogOpen(false)} style={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>

        <DialogContent style={{ padding: isMobile ? '15px' : '25px' }}>
          {selectedCharge && (
            <Box sx={{ mt: 1 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Chip
                  icon={<PersonIcon />}
                  label={selectedCharge.poste || 'Non spécifié'}
                  style={{
                    background: getPosteColor(selectedCharge.poste) + '20',
                    color: getPosteColor(selectedCharge.poste),
                    fontWeight: 800,
                    padding: '8px 12px',
                    borderRadius: '20px'
                  }}
                />
              </Stack>

              <Typography variant="h6" style={{ fontWeight: 800, marginBottom: '5px', color: '#2d3748' }}>
                {selectedCharge.employe || selectedCharge.employeName}
              </Typography>
              <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>
                {selectedCharge.date}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>CIN</Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>{selectedCharge.cin || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>Téléphone</Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>{selectedCharge.telephone || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>Poste</Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>{selectedCharge.poste || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>N° Sécu</Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>{selectedCharge.numeroSecuriteSociale || '-'}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>Adresse</Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>{selectedCharge.adresse || '-'}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: '10px', color: '#2d3748' }}>
                Rémunération
              </Typography>
              <div style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                padding: '15px',
                borderRadius: '10px',
                border: '2px solid #e2e8f0'
              }}>
                <Grid container spacing={1}>
                  <Grid item xs={6}><Typography variant="body2">Salaire :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" style={{ fontWeight: 700 }}>{(selectedCharge.salaire ?? 0).toFixed(2)} MAD</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Prime :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" style={{ fontWeight: 700 }}>{(selectedCharge.prime ?? 0).toFixed(2)} MAD</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Heures supp. :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" style={{ fontWeight: 700 }}>{(selectedCharge.montantHS ?? 0).toFixed(2)} MAD</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Indemnités :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" style={{ fontWeight: 700 }}>{(selectedCharge.indemnites ?? 0).toFixed(2)} MAD</Typography></Grid>
                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <Grid item xs={6}><Typography variant="subtitle2" style={{ fontWeight: 800 }}>Total :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="subtitle2" align="right" style={{ fontWeight: 800, color: '#667eea' }}>{(selectedCharge.total ?? 0).toFixed(2)} MAD</Typography></Grid>
                </Grid>
              </div>

              {selectedCharge.modePaiement && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: '10px', color: '#2d3748' }}>
                    Paiement
                  </Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>Mode : {selectedCharge.modePaiement}</Typography>
                  {selectedCharge.referenceVirement && (
                    <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                      Référence : {selectedCharge.referenceVirement}
                    </Typography>
                  )}
                  {selectedCharge.modePaiement === 'Espèces' && (
                    <Alert severity="info" sx={{ mt: 1 }} style={{
                      background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                      border: '2px solid #60a5fa',
                      borderRadius: '10px'
                    }}>
                      💰 Ce montant a été déduit de la caisse
                    </Alert>
                  )}
                </>
              )}

              {selectedCharge.typeDocument && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: '10px', color: '#2d3748' }}>
                    Document
                  </Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>Type : {selectedCharge.typeDocument}</Typography>
                  <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                    N° : {selectedCharge.numeroDocument || '-'}
                  </Typography>
                  <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                    Date : {selectedCharge.dateDocument || '-'}
                  </Typography>
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                      Fichier : <a href={selectedCharge.pieceJointe} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>Voir</a>
                    </Typography>
                  )}
                </>
              )}

              {selectedCharge.description && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: '10px', color: '#2d3748' }}>
                    Description
                  </Typography>
                  <Typography variant="body2" style={{ fontWeight: 600 }}>{selectedCharge.description}</Typography>
                </>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions style={{
          padding: isMobile ? '15px' : '20px',
          background: '#f8fafc',
          borderTop: '2px solid #e2e8f0'
        }}>
          <button
            style={{
              ...styles.button,
              width: isMobile ? '100%' : 'auto',
              minWidth: '120px'
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
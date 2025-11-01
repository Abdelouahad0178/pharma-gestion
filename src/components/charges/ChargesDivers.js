// src/components/charges/ChargesDivers.js
// Design moderne aligné avec ChargesPersonnels + Responsive + TEMPS RÉEL
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
  Badge,
  Collapse,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  Description as DescriptionIcon,
  Visibility as VisibilityIcon,
  Business as BusinessIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  Close as CloseIcon,
  AttachMoney as MoneyIcon
} from '@mui/icons-material';
import { db } from '../../firebase/config';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  orderBy,
  where,
  Timestamp,
  writeBatch,
  onSnapshot,
  increment
} from 'firebase/firestore';
import { useUserRole } from '../../contexts/UserRoleContext';

/* ====================== Utils ====================== */
const toFloat = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Normalisation robuste (accents/casse/espaces)
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/* ===== Helpers Caisse ===== */
async function ensureCaisseDoc(societeId) {
  const ref = doc(db, 'societe', societeId, 'caisse', 'solde');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { balance: 0, updatedAt: Timestamp.now() }, { merge: true });
  }
  return ref;
}

/**
 * Applique un delta sur la caisse et enregistre un mouvement.
 * @param {string} societeId
 * @param {number} delta   (positif = entrée, négatif = sortie)
 * @param {object} meta    métadonnées du mouvement (label, chargeDiversId, etc.)
 */
async function applyCaisseDelta(societeId, delta, meta = {}) {
  const soldeRef = await ensureCaisseDoc(societeId);

  // Update solde
  await updateDoc(soldeRef, { balance: increment(delta), updatedAt: Timestamp.now() });

  // Historique mouvement
  const mv = {
    delta,                              // ex: -500 = sortie
    type: delta >= 0 ? 'in' : 'out',
    at: Timestamp.now(),
    ...meta
  };
  await addDoc(collection(db, 'societe', societeId, 'caisseMovements'), mv);
}

/**
 * Annule (revert) tous les mouvements de caisse liés à une charge donnée
 * en appliquant le delta inverse de la somme des mouvements, puis supprime les docs.
 * @return {number} totalReverted
 */
async function revertCaisseMovementsForCharge(societeId, chargeId) {
  const qMov = query(
    collection(db, 'societe', societeId, 'caisseMovements'),
    where('chargeDiversId', '==', chargeId)
  );
  const snap = await getDocs(qMov);
  if (snap.empty) return 0;

  let sum = 0;
  snap.docs.forEach(d => { sum += toFloat(d.data().delta ?? d.data().amount); });

  if (sum !== 0) {
    const soldeRef = await ensureCaisseDoc(societeId);
    await updateDoc(soldeRef, { balance: increment(-sum), updatedAt: Timestamp.now() });
  }

  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();

  return -sum;
}

/**
 * Réconcilie la caisse selon le mode/statut/montant d'une charge.
 * - Si mode === 'Espèces' et statut === 'Payé' => sortie de caisse = -montant
 * - Sinon => aucun impact caisse
 */
async function reconcileCaisseForCharge(societeId, chargeId, form) {
  await revertCaisseMovementsForCharge(societeId, chargeId);

  const montant = toFloat(form.montant);
  const mode = norm(form.modePaiement);
  const statut = norm(form.statut);
  const isCashImpact = mode === 'especes' && statut === 'paye';

  if (isCashImpact && montant > 0) {
    const delta = -montant; // sortie de caisse
    await applyCaisseDelta(societeId, delta, {
      label: `Charge diverse: ${form.libelle || ''} (${form.categorie || '-'})`,
      modePaiement: form.modePaiement,
      statut: form.statut,
      chargeDiversId: chargeId,
      reference: form.referenceVirement || '',
      date: form.date || null,
      createdFor: 'chargeDivers'
    });
  }
}

export default function ChargesDivers() {
  const { user, societeId } = useUserRole();
  
  // Responsive
  const isMobile = useMediaQuery('(max-width:768px)');
  const isTablet = useMediaQuery('(min-width:769px) and (max-width:1024px)');
  const isDesktop = useMediaQuery('(min-width:1025px)');

  const [charges, setCharges] = useState([]);
  const [filteredCharges, setFilteredCharges] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
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
    categorie: '',
    statut: '',
    typeDocument: ''
  });

  // Form
  const today = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    categorie: '',
    libelle: '',
    montant: '',
    date: today,
    fournisseur: '',
    contactFournisseur: '',
    adresseFournisseur: '',
    typeDocument: '',
    numeroDocument: '',
    numeroFacture: '',
    dateDocument: today,
    dateEcheance: '',
    pieceJointe: '',
    description: '',
    notes: '',
    modePaiement: '',
    referenceVirement: '',
    statut: 'Payé'
  });

  // Solde caisse (affichage/diagnostic)
  const [caisseSolde, setCaisseSolde] = useState(null);
  useEffect(() => {
    if (!societeId) return;
    const soldeRef = doc(db, 'societe', societeId, 'caisse', 'solde');
    const unsub = onSnapshot(
      soldeRef,
      (snap) => setCaisseSolde(snap.exists() ? Number(snap.data().balance || 0) : 0),
      (err) => console.error('Listener caisse/solde:', err)
    );
    return () => unsub && unsub();
  }, [societeId]);

  const categories = [
    'Loyer',
    'Électricité',
    'Eau',
    'Téléphone',
    'Internet',
    'Assurance',
    'Taxes',
    'Fournitures',
    'Maintenance',
    'Transport',
    'Marketing',
    'Formation',
    'Autre'
  ];

  const typesDocuments = [
    'Facture',
    'Facture proforma',
    'Quittance',
    'Reçu',
    'Bon de commande',
    'Bon de livraison',
    'Contrat',
    'Attestation',
    'Ordre de virement',
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

  const statuts = [
    'Payé',
    'En attente',
    'Impayé',
    'Annulé'
  ];

  /* =================== Charges en TEMPS RÉEL =================== */
  useEffect(() => {
    if (!user || !societeId) return;
    setLoading(true);

    const qCharges = query(
      collection(db, 'societe', societeId, 'chargesDivers'),
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

  /* =================== Filtres =================== */
  useEffect(() => {
    let result = [...charges];

    if (filters.searchText) {
      const s = filters.searchText.toLowerCase();
      result = result.filter(charge =>
        (String(charge.libelle || '').toLowerCase().includes(s)) ||
        (String(charge.fournisseur || '').toLowerCase().includes(s)) ||
        (String(charge.description || '').toLowerCase().includes(s)) ||
        (String(charge.numeroFacture || '').toLowerCase().includes(s)) ||
        (String(charge.numeroDocument || '').toLowerCase().includes(s))
      );
    }
    if (filters.dateDebut) result = result.filter(c => (c.date || '') >= filters.dateDebut);
    if (filters.dateFin)   result = result.filter(c => (c.date || '') <= filters.dateFin);
    if (filters.categorie)     result = result.filter(c => (c.categorie || '') === filters.categorie);
    if (filters.statut) result = result.filter(c => (c.statut || '') === filters.statut);
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
      categorie: '',
      statut: '',
      typeDocument: ''
    });
  };

  const resetForm = () => {
    setFormData({
      categorie: '',
      libelle: '',
      montant: '',
      date: today,
      fournisseur: '',
      contactFournisseur: '',
      adresseFournisseur: '',
      typeDocument: '',
      numeroDocument: '',
      numeroFacture: '',
      dateDocument: today,
      dateEcheance: '',
      pieceJointe: '',
      description: '',
      notes: '',
      modePaiement: '',
      referenceVirement: '',
      statut: 'Payé'
    });
    setEditingCharge(null);
    setCurrentTab(0);
  };

  /* ============== Statistiques ============== */
  const stats = useMemo(() => {
    const total = filteredCharges.reduce((s, c) => s + toFloat(c.montant), 0);
    const count = filteredCharges.length;
    const payes = filteredCharges.filter(c => c.statut === 'Payé').reduce((s, c) => s + toFloat(c.montant), 0);
    const enAttente = filteredCharges.filter(c => c.statut === 'En attente').reduce((s, c) => s + toFloat(c.montant), 0);
    return { total, count, payes, enAttente };
  }, [filteredCharges]);

  /* ============== Couleurs ============== */
  const getCategorieColor = (categorie) => {
    const colors = {
      'Loyer': '#8b5cf6',
      'Électricité': '#f59e0b',
      'Eau': '#06b6d4',
      'Téléphone': '#10b981',
      'Internet': '#3b82f6',
      'Assurance': '#ec4899',
      'Taxes': '#ef4444',
      'Fournitures': '#84cc16',
      'Maintenance': '#f97316',
      'Transport': '#14b8a6',
      'Marketing': '#a855f7',
      'Formation': '#6366f1',
      'Autre': '#64748b'
    };
    return colors[categorie] || '#64748b';
  };

  const getStatutColor = (statut) => {
    const colors = {
      'Payé': '#10b981',
      'En attente': '#f59e0b',
      'Impayé': '#ef4444',
      'Annulé': '#64748b'
    };
    return colors[statut] || '#64748b';
  };

  const handleOpenDialog = (charge = null) => {
    if (charge) {
      setEditingCharge(charge);
      setFormData({
        categorie: charge.categorie || '',
        libelle: charge.libelle || '',
        montant: charge.montant || '',
        date: charge.date || today,
        fournisseur: charge.fournisseur || '',
        contactFournisseur: charge.contactFournisseur || '',
        adresseFournisseur: charge.adresseFournisseur || '',
        typeDocument: charge.typeDocument || '',
        numeroDocument: charge.numeroDocument || '',
        numeroFacture: charge.numeroFacture || '',
        dateDocument: charge.dateDocument || today,
        dateEcheance: charge.dateEcheance || '',
        pieceJointe: charge.pieceJointe || '',
        description: charge.description || '',
        notes: charge.notes || '',
        modePaiement: charge.modePaiement || '',
        referenceVirement: charge.referenceVirement || '',
        statut: charge.statut || 'Payé'
      });
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

  /* =================== Save (paiements + caisse) =================== */
  const handleSave = async () => {
    try {
      if (!formData.categorie || !formData.libelle || !formData.montant) {
        alert("Veuillez remplir les champs obligatoires (Catégorie, Libellé, Montant).");
        return;
      }
      if (!societeId) {
        alert('Société introuvable.');
        return;
      }

      const montant = toFloat(formData.montant);

      const chargeData = {
        categorie: formData.categorie,
        libelle: formData.libelle,
        montant,
        date: formData.date,
        fournisseur: formData.fournisseur,
        contactFournisseur: formData.contactFournisseur,
        adresseFournisseur: formData.adresseFournisseur,
        typeDocument: formData.typeDocument,
        numeroDocument: formData.numeroDocument,
        numeroFacture: formData.numeroFacture,
        dateDocument: formData.dateDocument,
        dateEcheance: formData.dateEcheance,
        pieceJointe: formData.pieceJointe,
        description: formData.description,
        notes: formData.notes,
        modePaiement: formData.modePaiement,
        referenceVirement: formData.referenceVirement,
        statut: formData.statut,
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid || null
      };

      // 1) Créer / Mettre à jour la charge
      let chargeId;
      if (editingCharge) {
        await updateDoc(doc(db, 'societe', societeId, 'chargesDivers', editingCharge.id), chargeData);
        chargeId = editingCharge.id;
      } else {
        const payload = { ...chargeData, createdAt: Timestamp.now(), createdBy: user?.uid || null };
        const ref = await addDoc(collection(db, 'societe', societeId, 'chargesDivers'), payload);
        chargeId = ref.id;
      }

      // 2) Supprimer anciens paiements liés
      const qLinked = query(
        collection(db, 'societe', societeId, 'paiements'),
        where('chargeDiversId', '==', chargeId)
      );
      const oldPaysSnap = await getDocs(qLinked);
      if (!oldPaysSnap.empty) {
        const batch = writeBatch(db);
        oldPaysSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // 3) Créer paiement (lu par Dashboard)
      if (formData.modePaiement && montant > 0) {
        const isCashImpact = norm(formData.modePaiement) === 'especes' && norm(formData.statut) === 'paye';

        const paiementData = {
          // ⚠️ Le Dashboard teste "chargediverse"
          type: 'chargediverse',
          category: 'chargediverse',
          relatedTo: 'chargediverse',

          chargeDiversId: chargeId,
          montant,
          date: formData.date,

          // Le Dashboard teste isCash() sur ces clés:
          mode: formData.modePaiement,
          paymentMode: formData.modePaiement,
          moyen: formData.modePaiement,
          typePaiement: formData.modePaiement,

          statut: formData.statut,
          description: `Charge diverse: ${formData.libelle} (${formData.categorie})`,
          reference: formData.referenceVirement || '',
          fournisseur: formData.fournisseur || '',

          // Indices supplémentaires
          isCashOut: isCashImpact,
          sign: isCashImpact ? -1 : 0,

          timestamp: Timestamp.now(),
          createdAt: Timestamp.now(),
          createdBy: user?.uid || null
        };

        await addDoc(collection(db, 'societe', societeId, 'paiements'), paiementData);
      }

      // 4) 🔥 Caisse (revert + ré-application si espèces+payé)
      await reconcileCaisseForCharge(societeId, chargeId, formData);

      handleCloseDialog();
    } catch (e) {
      console.error('Erreur sauvegarde:', e);
      alert('Erreur lors de la sauvegarde');
    }
  };

  /* =================== Suppression (cascade paiements + caisse) =================== */
  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette charge ?')) return;
    try {
      // supprimer paiements liés
      const qLinked = query(
        collection(db, 'societe', societeId, 'paiements'),
        where('chargeDiversId', '==', id)
      );
      const snap = await getDocs(qLinked);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      // revert caisse
      await revertCaisseMovementsForCharge(societeId, id);

      // supprimer la charge
      await deleteDoc(doc(db, 'societe', societeId, 'chargesDivers', id));
    } catch (e) {
      console.error('Erreur suppression:', e);
      alert('Erreur lors de la suppression');
    }
  };

  // Styles modernes
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
            Chargement des charges diverses...
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
          <h1 style={styles.title}>💼 Charges Diverses</h1>
          <p style={styles.subtitle}>
            Gestion complète des charges et dépenses diverses
          </p>
          {caisseSolde !== null && (
            <p style={{ marginTop: 8, color: '#d1fae5', fontWeight: 800 }}>
              💵 Solde caisse : {Number(caisseSolde).toFixed(2)} MAD
            </p>
          )}
        </div>

        <div style={styles.content}>
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
              <div style={{...styles.statIcon, color: '#3b82f6'}}>✅</div>
              <div style={styles.statLabel}>Payées</div>
              <div style={{...styles.statValue, color: '#3b82f6'}}>
                {stats.payes.toFixed(2)} MAD
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={{...styles.statIcon, color: '#f59e0b'}}>⏳</div>
              <div style={styles.statLabel}>En attente</div>
              <div style={{...styles.statValue, color: '#f59e0b'}}>
                {stats.enAttente.toFixed(2)} MAD
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
                    placeholder="Libellé, fournisseur..."
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
                    <InputLabel>Catégorie</InputLabel>
                    <Select
                      value={filters.categorie}
                      onChange={(e) => setFilters({ ...filters, categorie: e.target.value })}
                      label="Catégorie"
                      style={{ background: 'white' }}
                    >
                      <MenuItem value="">Toutes</MenuItem>
                      {categories.map(cat => (
                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Statut</InputLabel>
                    <Select
                      value={filters.statut}
                      onChange={(e) => setFilters({ ...filters, statut: e.target.value })}
                      label="Statut"
                      style={{ background: 'white' }}
                    >
                      <MenuItem value="">Tous</MenuItem>
                      {statuts.map(st => (
                        <MenuItem key={st} value={st}>{st}</MenuItem>
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

          {/* Liste */}
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
                  Commencez par ajouter une charge diverse
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
                        {charge.libelle}
                      </div>
                      <div style={{
                        fontSize: '0.85em',
                        color: '#64748b',
                        fontWeight: 600
                      }}>
                        {charge.date} {charge.fournisseur && `• ${charge.fournisseur}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <Chip
                        label={charge.categorie || 'N/A'}
                        size="small"
                        style={{
                          background: getCategorieColor(charge.categorie) + '20',
                          color: getCategorieColor(charge.categorie),
                          fontWeight: 700,
                          borderRadius: '20px',
                          padding: '5px 12px'
                        }}
                      />
                      <Chip
                        label={charge.statut || 'Payé'}
                        size="small"
                        style={{
                          background: getStatutColor(charge.statut) + '20',
                          color: getStatutColor(charge.statut),
                          fontWeight: 700,
                          borderRadius: '20px',
                          padding: '5px 12px'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
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
                        Montant
                      </div>
                      <div style={{
                        fontSize: '1.1em',
                        fontWeight: 800,
                        color: '#667eea'
                      }}>
                        {toFloat(charge.montant).toFixed(2)} MAD
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
                        Type doc
                      </div>
                      <div style={{
                        fontSize: '0.9em',
                        fontWeight: 700,
                        color: '#2d3748'
                      }}>
                        {charge.typeDocument || '-'}
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
                        fontSize: '0.9em',
                        fontWeight: 700,
                        color: '#2d3748'
                      }}>
                        {charge.modePaiement || '-'}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    paddingTop: '10px',
                    borderTop: '2px solid #e2e8f0'
                  }}>
                    <Tooltip title="Voir">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(charge);
                        }}
                        size="small"
                        style={{
                          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
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
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
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
                          handleDelete(charge.id);
                        }}
                        size="small"
                        style={{
                          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
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

      {/* Dialog Formulaire */}
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
            <Tab icon={<ReceiptIcon />} iconPosition="start" label="Général" />
            <Tab icon={<BusinessIcon />} iconPosition="start" label="Fournisseur" />
            <Tab icon={<DescriptionIcon />} iconPosition="start" label="Document" />
            <Tab icon={<MoneyIcon />} iconPosition="start" label="Paiement" />
          </Tabs>

          {/* GÉNÉRAL */}
          {currentTab === 0 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Catégorie *</InputLabel>
                    <Select
                      value={formData.categorie}
                      onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                      label="Catégorie *"
                      style={{ background: 'white' }}
                    >
                      {categories.map(cat => (
                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Statut</InputLabel>
                    <Select
                      value={formData.statut}
                      onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                      label="Statut"
                      style={{ background: 'white' }}
                    >
                      {statuts.map(st => (
                        <MenuItem key={st} value={st}>{st}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <TextField
                label="Libellé *"
                value={formData.libelle}
                onChange={(e) => setFormData({ ...formData, libelle: e.target.value })}
                fullWidth
                required
                size="small"
                style={{ background: 'white' }}
              />

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Montant *"
                    type="number"
                    value={formData.montant}
                    onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
                    fullWidth
                    required
                    size="small"
                    style={{ background: 'white' }}
                    InputProps={{
                      endAdornment: <span style={{ marginLeft: '8px', color: '#64748b' }}>MAD</span>
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Date *"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    fullWidth
                    required
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    style={{ background: 'white' }}
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
                style={{ background: 'white' }}
                placeholder="Décrivez la charge..."
              />
            </Stack>
          )}

          {/* FOURNISSEUR */}
          {currentTab === 1 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Nom du fournisseur"
                value={formData.fournisseur}
                onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                fullWidth
                size="small"
                style={{ background: 'white' }}
              />

              <TextField
                label="Contact"
                value={formData.contactFournisseur}
                onChange={(e) => setFormData({ ...formData, contactFournisseur: e.target.value })}
                fullWidth
                size="small"
                style={{ background: 'white' }}
                placeholder="Téléphone, email..."
              />

              <TextField
                label="Adresse"
                value={formData.adresseFournisseur}
                onChange={(e) => setFormData({ ...formData, adresseFournisseur: e.target.value })}
                fullWidth
                multiline
                rows={2}
                size="small"
                style={{ background: 'white' }}
              />
            </Stack>
          )}

          {/* DOCUMENT */}
          {currentTab === 2 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Type de document</InputLabel>
                <Select
                  value={formData.typeDocument}
                  onChange={(e) => setFormData({ ...formData, typeDocument: e.target.value })}
                  label="Type de document"
                  style={{ background: 'white' }}
                >
                  {typesDocuments.map(type => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="N° Document"
                    value={formData.numeroDocument}
                    onChange={(e) => setFormData({ ...formData, numeroDocument: e.target.value })}
                    fullWidth
                    size="small"
                    style={{ background: 'white' }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="N° Facture"
                    value={formData.numeroFacture}
                    onChange={(e) => setFormData({ ...formData, numeroFacture: e.target.value })}
                    fullWidth
                    size="small"
                    style={{ background: 'white' }}
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Date document"
                    type="date"
                    value={formData.dateDocument}
                    onChange={(e) => setFormData({ ...formData, dateDocument: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    style={{ background: 'white' }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Date échéance"
                    type="date"
                    value={formData.dateEcheance}
                    onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    style={{ background: 'white' }}
                  />
                </Grid>
              </Grid>

              <TextField
                label="Pièce jointe (URL)"
                value={formData.pieceJointe}
                onChange={(e) => setFormData({ ...formData, pieceJointe: e.target.value })}
                fullWidth
                size="small"
                style={{ background: 'white' }}
                placeholder="https://..."
              />

              <TextField
                label="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                fullWidth
                multiline
                rows={3}
                size="small"
                style={{ background: 'white' }}
                placeholder="Notes additionnelles..."
              />
            </Stack>
          )}

          {/* PAIEMENT */}
          {currentTab === 3 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Mode de paiement</InputLabel>
                <Select
                  value={formData.modePaiement}
                  onChange={(e) => setFormData({ ...formData, modePaiement: e.target.value })}
                  label="Mode de paiement"
                  style={{ background: 'white' }}
                >
                  {modesPaiement.map(mode => (
                    <MenuItem key={mode} value={mode}>{mode}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Référence virement/chèque"
                value={formData.referenceVirement}
                onChange={(e) => setFormData({ ...formData, referenceVirement: e.target.value })}
                fullWidth
                size="small"
                style={{ background: 'white' }}
                placeholder="Ex: CHQ-123456 ou VIR-789012"
              />

              {norm(formData.modePaiement) === 'especes' && norm(formData.statut) === 'paye' && (
                <Alert
                  severity="success"
                  style={{
                    background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                    border: '2px solid #10b981',
                    borderRadius: '10px'
                  }}
                >
                  ✅ Ce paiement en espèces sera automatiquement déduit de la caisse
                </Alert>
              )}

              <div style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                padding: '15px',
                borderRadius: '10px',
                border: '2px solid #e2e8f0',
                marginTop: '10px'
              }}>
                <Typography variant="body2" style={{ fontWeight: 700, marginBottom: '10px', color: '#2d3748' }}>
                  Récapitulatif
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}><Typography variant="body2">Montant :</Typography></Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" style={{ fontWeight: 800, color: '#667eea' }}>
                      {toFloat(formData.montant).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={6}><Typography variant="body2">Statut :</Typography></Grid>
                  <Grid item xs={6}>
                    <Chip
                      label={formData.statut}
                      size="small"
                      style={{
                        float: 'right',
                        background: getStatutColor(formData.statut) + '20',
                        color: getStatutColor(formData.statut),
                        fontWeight: 700
                      }}
                    />
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
              opacity: (!formData.categorie || !formData.libelle || !formData.montant) ? 0.5 : 1,
              cursor: (!formData.categorie || !formData.libelle || !formData.montant) ? 'not-allowed' : 'pointer'
            }}
            onClick={handleSave}
            disabled={!formData.categorie || !formData.libelle || !formData.montant}
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
                  label={selectedCharge.categorie || 'N/A'}
                  style={{
                    background: getCategorieColor(selectedCharge.categorie) + '20',
                    color: getCategorieColor(selectedCharge.categorie),
                    fontWeight: 800,
                    padding: '8px 12px',
                    borderRadius: '20px'
                  }}
                />
                <Chip
                  label={selectedCharge.statut || 'Payé'}
                  style={{
                    background: getStatutColor(selectedCharge.statut) + '20',
                    color: getStatutColor(selectedCharge.statut),
                    fontWeight: 800,
                    padding: '8px 12px',
                    borderRadius: '20px'
                  }}
                />
              </Stack>

              <Typography variant="h6" style={{ fontWeight: 800, marginBottom: '5px', color: '#2d3748' }}>
                {selectedCharge.libelle}
              </Typography>
              <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>
                {selectedCharge.date}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>Montant</Typography>
                  <Typography variant="h6" style={{ fontWeight: 800, color: '#667eea' }}>
                    {toFloat(selectedCharge.montant).toFixed(2)} MAD
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" style={{ color: '#64748b', fontWeight: 600 }}>Catégorie</Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>{selectedCharge.categorie}</Typography>
                </Grid>
              </Grid>

              {selectedCharge.fournisseur && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: '10px', color: '#2d3748' }}>
                    Fournisseur
                  </Typography>
                  <Typography variant="body2" style={{ fontWeight: 700 }}>{selectedCharge.fournisseur}</Typography>
                  {selectedCharge.contactFournisseur && (
                    <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                      Contact : {selectedCharge.contactFournisseur}
                    </Typography>
                  )}
                  {selectedCharge.adresseFournisseur && (
                    <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                      Adresse : {selectedCharge.adresseFournisseur}
                    </Typography>
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
                  {selectedCharge.numeroFacture && (
                    <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                      N° Facture : {selectedCharge.numeroFacture}
                    </Typography>
                  )}
                  {selectedCharge.numeroDocument && (
                    <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                      N° Document : {selectedCharge.numeroDocument}
                    </Typography>
                  )}
                  <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                    Date : {selectedCharge.dateDocument || '-'}
                  </Typography>
                  {selectedCharge.dateEcheance && (
                    <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                      Échéance : {selectedCharge.dateEcheance}
                    </Typography>
                  )}
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2" style={{ marginTop: '5px', fontWeight: 700 }}>
                      Fichier : <a href={selectedCharge.pieceJointe} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>Voir</a>
                    </Typography>
                  )}
                </>
              )}

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
                  {norm(selectedCharge.modePaiement) === 'especes' && norm(selectedCharge.statut) === 'paye' && (
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

              {selectedCharge.description && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: '10px', color: '#2d3748' }}>
                    Description
                  </Typography>
                  <Typography variant="body2" style={{ fontWeight: 600 }}>{selectedCharge.description}</Typography>
                </>
              )}

              {selectedCharge.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: '10px', color: '#2d3748' }}>
                    Notes
                  </Typography>
                  <Typography variant="body2" style={{ fontWeight: 600 }}>{selectedCharge.notes}</Typography>
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

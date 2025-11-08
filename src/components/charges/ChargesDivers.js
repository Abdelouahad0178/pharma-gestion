// src/components/charges/ChargesDivers.js
// Design PRO 2025 — Sidebar Stepper + Résumé collant + TEMPS RÉEL
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
  Alert,
  Stack,
  useMediaQuery,
  Badge,
  Collapse,
  Tooltip,
  Stepper,
  Step,
  StepLabel,
  Paper,
  Avatar,
  Card,
  CardContent
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
  AttachMoney as MoneyIcon,
  Inventory2 as InventoryIcon
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

// Date helpers
function toDate(v) {
  if (!v) return null;
  try {
    if (v?.toDate && typeof v.toDate === 'function') return v.toDate();
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
    if (v instanceof Date) return isNaN(v) ? null : v;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  } catch {
    return null;
  }
}
function sameLocalDay(a, b = new Date()) {
  const da = toDate(a), dbb = toDate(b);
  if (!da || !dbb) return false;
  return (
    da.getFullYear() === dbb.getFullYear() &&
    da.getMonth() === dbb.getMonth() &&
    da.getDate() === dbb.getDate()
  );
}

// Paiements: même détection que Dashboard
function isCash(mode) {
  const m = norm(mode);
  return ['especes', 'espèces', 'espece', 'espèce', 'cash', 'liquide'].includes(m);
}
function isSalePayment(p) {
  const t = norm(p?.type || p?.relatedTo || p?.for || p?.category);
  return ['vente','ventes','sale','sales','reglementclient','reglement_client'].includes(t);
}
function isSupplierPayment(p) {
  const t = norm(p?.type || p?.relatedTo || p?.for || p?.category);
  return [
    'achat','achats','fournisseur','fournisseurs','supplier','suppliers','purchase','purchases',
    'reglementfournisseur','reglement_fournisseur','chargepersonnel','chargediverse'
  ].includes(t);
}

/* ===== Helpers Caisse (persistance) ===== */
async function ensureCaisseDoc(societeId) {
  const ref = doc(db, 'societe', societeId, 'caisse', 'solde');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { balance: 0, updatedAt: Timestamp.now() }, { merge: true });
  }
  return ref;
}

async function applyCaisseDelta(societeId, delta, meta = {}) {
  const soldeRef = await ensureCaisseDoc(societeId);
  await updateDoc(soldeRef, { balance: increment(delta), updatedAt: Timestamp.now() });
  const mv = { delta, type: delta >= 0 ? 'in' : 'out', at: Timestamp.now(), ...meta };
  await addDoc(collection(db, 'societe', societeId, 'caisseMovements'), mv);
}

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

async function reconcileCaisseForCharge(societeId, chargeId, form) {
  await revertCaisseMovementsForCharge(societeId, chargeId);

  const montant = toFloat(form.montant);
  const mode = norm(form.modePaiement);
  const statut = norm(form.statut);
  const isCashImpact = mode === 'especes' && statut === 'paye';

  if (isCashImpact && montant > 0) {
    const delta = -montant; // sortie
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
  const isTablet = useMediaQuery('(min-width:769px) and (max-width:1200px)');
  const isDesktop = useMediaQuery('(min-width:1201px)');

  const [charges, setCharges] = useState([]);
  const [filteredCharges, setFilteredCharges] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const [editingCharge, setEditingCharge] = useState(null);
  const [selectedCharge, setSelectedCharge] = useState(null);

  // Stepper (0→3)
  const steps = ['Général', 'Fournisseur', 'Document', 'Paiement'];
  const [activeStep, setActiveStep] = useState(0);

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

  /* ======== Caisse du JOUR (identique Dashboard) ======== */
  const [caisseToday, setCaisseToday] = useState({ in: 0, out: 0, solde: 0 });

  useEffect(() => {
    if (!societeId) return;
    const qPaiements = query(
      collection(db, 'societe', societeId, 'paiements'),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(
      qPaiements,
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pToday = all.filter(p => sameLocalDay(p.date || p.timestamp, new Date()));

        const encaissements = pToday
          .filter(p => isSalePayment(p) && isCash(p?.mode ?? p?.paymentMode ?? p?.moyen ?? p?.typePaiement))
          .reduce((s, p) => s + (Number(p?.montant) || 0), 0);

        const decaissements = pToday
          .filter(p => isSupplierPayment(p) && isCash(p?.mode ?? p?.paymentMode ?? p?.moyen ?? p?.typePaiement))
          .reduce((s, p) => s + (Number(p?.montant) || 0), 0);

        setCaisseToday({ in: encaissements, out: decaissements, solde: encaissements - decaissements });
      },
      (err) => {
        console.error('Listener paiements (caisseToday):', err);
        setCaisseToday({ in: 0, out: 0, solde: 0 });
      }
    );
    return () => unsub && unsub();
  }, [societeId]);

  /* =================== Charges TEMPS RÉEL =================== */
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
    setActiveStep(0);
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

      // 1) Create/Update
      let chargeId;
      if (editingCharge) {
        await updateDoc(doc(db, 'societe', societeId, 'chargesDivers', editingCharge.id), chargeData);
        chargeId = editingCharge.id;
      } else {
        const payload = { ...chargeData, createdAt: Timestamp.now(), createdBy: user?.uid || null };
        const ref = await addDoc(collection(db, 'societe', societeId, 'chargesDivers'), payload);
        chargeId = ref.id;
      }

      // 2) Remove old linked payments
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

      // 3) Create new paiement (readable by Dashboard)
      if (formData.modePaiement && montant > 0) {
        const isCashImpact = norm(formData.modePaiement) === 'especes' && norm(formData.statut) === 'paye';

        const paiementData = {
          type: 'chargediverse',
          category: 'chargediverse',
          relatedTo: 'chargediverse',

          chargeDiversId: chargeId,
          montant,
          date: formData.date,

          mode: formData.modePaiement,
          paymentMode: formData.modePaiement,
          moyen: formData.modePaiement,
          typePaiement: formData.modePaiement,

          statut: formData.statut,
          description: `Charge diverse: ${formData.libelle} (${formData.categorie})`,
          reference: formData.referenceVirement || '',
          fournisseur: formData.fournisseur || '',

          isCashOut: isCashImpact,
          sign: isCashImpact ? -1 : 0,

          timestamp: Timestamp.now(),
          createdAt: Timestamp.now(),
          createdBy: user?.uid || null
        };

        await addDoc(collection(db, 'societe', societeId, 'paiements'), paiementData);
      }

      // 4) Caisse persistée
      await reconcileCaisseForCharge(societeId, chargeId, formData);

      handleCloseDialog();
    } catch (e) {
      console.error('Erreur sauvegarde:', e);
      alert('Erreur lors de la sauvegarde');
    }
  };

  /* =================== Suppression (cascade) =================== */
  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette charge ?')) return;
    try {
      // paiements liés
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

  // Styles
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F5F7FF 0%, #FDF7FF 100%)',
      padding: isMobile ? '10px' : '30px',
      fontFamily: 'Inter, Arial, sans-serif'
    },
    mainCard: {
      background: 'white',
      borderRadius: 24,
      boxShadow: '0 30px 60px rgba(0,0,0,0.12)',
      overflow: 'hidden',
      margin: '0 auto',
      maxWidth: 1400
    },
    header: {
      background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
      padding: isMobile ? '22px 16px' : '36px 32px',
      color: 'white'
    },
    titleRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    },
    title: { fontSize: isMobile ? 24 : 28, fontWeight: 900, margin: 0 },
    subtitle: { marginTop: 6, opacity: 0.85, fontSize: isMobile ? 13 : 14 },
    chipsRow: {
      display: 'flex',
      gap: 8,
      marginTop: 12,
      flexWrap: 'wrap'
    },
    content: { padding: isMobile ? 16 : 28 },
    button: {
      background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
      border: 'none',
      borderRadius: 12,
      padding: '12px 18px',
      color: 'white',
      fontWeight: 800,
      cursor: 'pointer',
      fontSize: 14,
      transition: 'all 0.25s ease',
      minHeight: 44
    },
    filterButton: {
      background: '#f8fafc',
      border: '2px solid #e2e8f0',
      borderRadius: 12,
      padding: '12px 16px',
      color: '#111827',
      fontWeight: 800,
      cursor: 'pointer',
      fontSize: 14,
      transition: 'all 0.25s ease',
      minHeight: 44
    },
    statCard: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      padding: 18,
      borderRadius: 16,
      border: '2px solid #e2e8f0',
      textAlign: 'center'
    },
    chargeCard: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
      padding: 18,
      borderRadius: 16,
      border: '2px solid #e2e8f0',
      transition: 'transform .15s ease, box-shadow .15s ease',
      cursor: 'pointer'
    },
    stepSidebar: {
      background: 'linear-gradient(180deg, #0b1220 0%, #111827 100%)',
      color: '#e5e7eb',
      borderRadius: 16,
      padding: 16,
      height: '100%'
    },
    stickySummary: {
      position: 'sticky',
      top: 0,
      borderRadius: 16,
      padding: 16,
      border: '2px solid #e2e8f0',
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
    },
    actionBar: {
      display: 'flex',
      gap: 12,
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  };

  /* =================== Render =================== */
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{...styles.mainCard, padding: '40px', textAlign: 'center'}}>
          <div style={{ fontSize: '3em', marginBottom: '20px' }}>⏳</div>
          <div style={{ fontSize: '1.2em', color: '#64748b', fontWeight: 700 }}>
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
          <div style={styles.titleRow}>
            <Avatar sx={{ bgcolor: '#1d4ed8', width: 40, height: 40 }}>
              <InventoryIcon />
            </Avatar>
            <h1 style={styles.title}>💼 Charges Diverses</h1>
          </div>
          <p style={styles.subtitle}>
            Suivi précis des dépenses hors achats/ventes, avec impact caisse en temps réel.
          </p>

          {/* KPI Caisse Today */}
          <div style={styles.chipsRow}>
            <Chip label={`Caisse (AUJOURD'HUI): ${caisseToday.solde.toFixed(2)} DHS`} sx={{
              bgcolor: caisseToday.solde >= 0 ? '#064e3b' : '#7f1d1d',
              color: '#ecfeff',
              fontWeight: 800
            }}/>
            <Chip label={`IN: ${caisseToday.in.toFixed(2)} DHS`} sx={{ bgcolor: '#0f766e', color: 'white', fontWeight: 800 }}/>
            <Chip label={`OUT: ${caisseToday.out.toFixed(2)} DHS`} sx={{ bgcolor: '#7c2d12', color: 'white', fontWeight: 800 }}/>
          </div>
        </div>

        <div style={styles.content}>
          {/* Stats */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={3}>
              <div style={styles.statCard}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5 }}>
                  Total Charges
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#1e3a8a', marginTop: 4 }}>
                  {stats.total.toFixed(2)} DHS
                </div>
              </div>
            </Grid>
            <Grid item xs={12} md={3}>
              <div style={styles.statCard}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5 }}>
                  Entrées
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#065f46', marginTop: 4 }}>
                  {stats.count}
                </div>
              </div>
            </Grid>
            <Grid item xs={12} md={3}>
              <div style={styles.statCard}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5 }}>
                  Payées
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', marginTop: 4 }}>
                  {stats.payes.toFixed(2)} DHS
                </div>
              </div>
            </Grid>
            <Grid item xs={12} md={3}>
              <div style={styles.statCard}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5 }}>
                  En attente
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#b45309', marginTop: 4 }}>
                  {stats.enAttente.toFixed(2)} DHS
                </div>
              </div>
            </Grid>
          </Grid>

          {/* Actions */}
          <div style={styles.actionBar}>
            <button style={styles.filterButton} onClick={() => setFiltersOpen(v => !v)}>
              <Badge badgeContent={activeFiltersCount} color="error">
                <FilterListIcon />&nbsp;FILTRES
              </Badge>
            </button>
            <button style={styles.button} onClick={() => handleOpenDialog()}>
              <AddIcon />&nbsp;NOUVELLE CHARGE
            </button>
          </div>

          {/* Filtres */}
          <Collapse in={filtersOpen} unmountOnExit>
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
              padding: 16,
              borderRadius: 16,
              marginBottom: 18,
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
                      {['Loyer','Électricité','Eau','Téléphone','Internet','Assurance','Taxes','Fournitures','Maintenance','Transport','Marketing','Formation','Autre'].map(cat => (
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
                      {['Payé','En attente','Impayé','Annulé'].map(st => (
                        <MenuItem key={st} value={st}>{st}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={1}>
                  <button
                    style={{ ...styles.filterButton, width: '100%', minHeight: 40, padding: 10 }}
                    onClick={handleResetFilters}
                  >
                    <ClearIcon /> {activeFiltersCount > 0 && `(${activeFiltersCount})`}
                  </button>
                </Grid>
              </Grid>
            </div>
          </Collapse>

          {/* Liste */}
          <Grid container spacing={2}>
            {filteredCharges.length === 0 ? (
              <Grid item xs={12}>
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: '#64748b',
                  border: '2px dashed #e2e8f0',
                  borderRadius: 16
                }}>
                  <div style={{ fontSize: '3.2em', marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    Aucune charge trouvée
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14 }}>
                    Cliquez sur “Nouvelle charge” pour commencer
                  </div>
                </div>
              </Grid>
            ) : (
              filteredCharges.map((charge) => (
                <Grid key={charge.id} item xs={12}>
                  <div
                    style={styles.chargeCard}
                    onClick={() => handleViewDetails(charge)}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 220 }}>
                        <Avatar sx={{ bgcolor: '#111827' }}><ReceiptIcon /></Avatar>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>{charge.libelle}</div>
                          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                            {charge.date} {charge.fournisseur && `• ${charge.fournisseur}`}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          label={charge.categorie || 'N/A'}
                          size="small"
                          sx={{
                            bgcolor: getCategorieColor(charge.categorie) + '20',
                            color: getCategorieColor(charge.categorie),
                            fontWeight: 800,
                            borderRadius: '20px',
                            px: 1.2
                          }}
                        />
                        <Chip
                          label={charge.statut || 'Payé'}
                          size="small"
                          sx={{
                            bgcolor: getStatutColor(charge.statut) + '20',
                            color: getStatutColor(charge.statut),
                            fontWeight: 800,
                            borderRadius: '20px',
                            px: 1.2
                          }}
                        />
                        <Tooltip title="Voir">
                          <IconButton
                            onClick={(e) => { e.stopPropagation(); handleViewDetails(charge); }}
                            size="small"
                            sx={{ bgcolor: '#1d4ed8', color: 'white', width: 36, height: 36, '&:hover': { bgcolor: '#1e40af' } }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Modifier">
                          <IconButton
                            onClick={(e) => { e.stopPropagation(); handleOpenDialog(charge); }}
                            size="small"
                            sx={{ bgcolor: '#059669', color: 'white', width: 36, height: 36, '&:hover': { bgcolor: '#047857' } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Supprimer">
                          <IconButton
                            onClick={(e) => { e.stopPropagation(); handleDelete(charge.id); }}
                            size="small"
                            sx={{ bgcolor: '#dc2626', color: 'white', width: 36, height: 36, '&:hover': { bgcolor: '#b91c1c' } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </div>
                    </div>

                    <Divider sx={{ my: 1.5 }} />

                    <Grid container spacing={2}>
                      <Grid item xs={12} md={4}>
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                              Montant
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 900, color: '#1d4ed8' }}>
                              {toFloat(charge.montant).toFixed(2)} DHS
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={6} md={4}>
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                              Type doc
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 800 }}>{charge.typeDocument || '-'}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={6} md={4}>
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                              Paiement
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 800 }}>{charge.modePaiement || '-'}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  </div>
                </Grid>
              ))
            )}
          </Grid>
        </div>
      </div>

      {/* ===== Dialog — NOUVEAU DESIGN ===== */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        fullScreen={isMobile}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          style: {
            borderRadius: isMobile ? 0 : 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{
          background: 'linear-gradient(135deg, #0b1220 0%, #111827 100%)',
          color: 'white',
          fontWeight: 900,
          fontSize: isMobile ? 18 : 20,
          px: isMobile ? 2 : 3,
          py: isMobile ? 1.5 : 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1
        }}>
          <span>{editingCharge ? 'Modifier la charge' : 'Nouvelle charge'}</span>
          <Chip
            icon={<MoneyIcon sx={{ color: 'inherit' }} />}
            label={`Caisse (Aujourd'hui): ${caisseToday.solde.toFixed(2)} DHS`}
            sx={{ bgcolor: '#0f172a', color: '#e2e8f0', fontWeight: 800 }}
          />
          {isMobile && (
            <IconButton onClick={handleCloseDialog} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>

        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <Grid container spacing={2}>
            {/* Sidebar étapes */}
            <Grid item xs={12} md={3}>
              <Paper elevation={0} sx={styles.stepSidebar}>
                <Typography sx={{ fontWeight: 900, mb: 1.5, color: '#e5e7eb' }}>
                  Étapes
                </Typography>
                <Stepper activeStep={activeStep} orientation="vertical" sx={{
                  '& .MuiStepLabel-label': { color: '#cbd5e1' },
                  '& .MuiStepIcon-root.Mui-active': { color: '#22d3ee' },
                  '& .MuiStepIcon-root.Mui-completed': { color: '#10b981' }
                }}>
                  {steps.map((label, index) => (
                    <Step key={label} onClick={() => setActiveStep(index)}>
                      <StepLabel>
                        <Typography sx={{ fontWeight: 800, color: index === activeStep ? '#e5e7eb' : '#94a3b8' }}>
                          {label}
                        </Typography>
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Paper>
            </Grid>

            {/* Form sections */}
            <Grid item xs={12} md={6}>
              {/* Étape 0: Général */}
              {activeStep === 0 && (
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Catégorie *</InputLabel>
                    <Select
                      value={formData.categorie}
                      onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                      label="Catégorie *"
                      sx={{ bgcolor: 'white', borderRadius: 2 }}
                    >
                      {['Loyer','Électricité','Eau','Téléphone','Internet','Assurance','Taxes','Fournitures','Maintenance','Transport','Marketing','Formation','Autre'].map(cat => (
                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    label="Libellé *"
                    value={formData.libelle}
                    onChange={(e) => setFormData({ ...formData, libelle: e.target.value })}
                    fullWidth
                    required
                    size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
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
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
                        InputProps={{
                          endAdornment: <span style={{ marginLeft: 8, color: '#64748b', fontWeight: 800 }}>DHS</span>
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
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                  </Grid>

                  <FormControl fullWidth size="small">
                    <InputLabel>Statut</InputLabel>
                    <Select
                      value={formData.statut}
                      onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                      label="Statut"
                      sx={{ bgcolor: 'white', borderRadius: 2 }}
                    >
                      {['Payé','En attente','Impayé','Annulé'].map(st => (
                        <MenuItem key={st} value={st}>{st}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    label="Description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    fullWidth
                    multiline
                    rows={3}
                    size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
                    placeholder="Décrivez la charge..."
                  />
                </Stack>
              )}

              {/* Étape 1: Fournisseur */}
              {activeStep === 1 && (
                <Stack spacing={2}>
                  <TextField
                    label="Nom du fournisseur"
                    value={formData.fournisseur}
                    onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                    fullWidth
                    size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
                  />
                  <TextField
                    label="Contact"
                    value={formData.contactFournisseur}
                    onChange={(e) => setFormData({ ...formData, contactFournisseur: e.target.value })}
                    fullWidth
                    size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
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
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
                  />
                  <TextField
                    label="Notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    fullWidth
                    multiline
                    rows={2}
                    size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
                    placeholder="Notes internes..."
                  />
                </Stack>
              )}

              {/* Étape 2: Document */}
              {activeStep === 2 && (
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Type de document</InputLabel>
                    <Select
                      value={formData.typeDocument}
                      onChange={(e) => setFormData({ ...formData, typeDocument: e.target.value })}
                      label="Type de document"
                      sx={{ bgcolor: 'white', borderRadius: 2 }}
                    >
                      {['Facture','Facture proforma','Quittance','Reçu','Bon de commande','Bon de livraison','Contrat','Attestation','Ordre de virement','Autre'].map(type => (
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
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="N° Facture"
                        value={formData.numeroFacture}
                        onChange={(e) => setFormData({ ...formData, numeroFacture: e.target.value })}
                        fullWidth
                        size="small"
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
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
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
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
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                  </Grid>

                  <TextField
                    label="Pièce jointe (URL)"
                    value={formData.pieceJointe}
                    onChange={(e) => setFormData({ ...formData, pieceJointe: e.target.value })}
                    fullWidth
                    size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
                    placeholder="https://..."
                  />
                </Stack>
              )}

              {/* Étape 3: Paiement */}
              {activeStep === 3 && (
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Mode de paiement</InputLabel>
                    <Select
                      value={formData.modePaiement}
                      onChange={(e) => setFormData({ ...formData, modePaiement: e.target.value })}
                      label="Mode de paiement"
                      sx={{ bgcolor: 'white', borderRadius: 2 }}
                    >
                      {['Espèces','Chèque','Virement bancaire','Carte bancaire','Prélèvement','Autre'].map(mode => (
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
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
                    placeholder="Ex: CHQ-123456 ou VIR-789012"
                  />

                  {norm(formData.modePaiement) === 'especes' && norm(formData.statut) === 'paye' && (
                    <Alert
                      severity="success"
                      sx={{
                        background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                        border: '2px solid #10b981',
                        borderRadius: 2
                      }}
                    >
                      ✅ Ce paiement en espèces sera <strong>déduit de la caisse</strong>
                    </Alert>
                  )}

                  <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '2px solid #e2e8f0', background: '#fafafa' }}>
                    <Typography variant="body2" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                      Récapitulatif de l’étape
                    </Typography>
                    <Grid container spacing={1}>
                      <Grid item xs={6}><Typography variant="body2">Montant :</Typography></Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" align="right" sx={{ fontWeight: 900, color: '#1d4ed8' }}>
                          {toFloat(formData.montant).toFixed(2)} DHS
                        </Typography>
                      </Grid>
                      <Grid item xs={6}><Typography variant="body2">Statut :</Typography></Grid>
                      <Grid item xs={6} sx={{ textAlign: 'right' }}>
                        <Chip
                          label={formData.statut}
                          size="small"
                          sx={{
                            bgcolor: getStatutColor(formData.statut) + '20',
                            color: getStatutColor(formData.statut),
                            fontWeight: 800
                          }}
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                </Stack>
              )}

              {/* Navigation étapes */}
              <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
                <button
                  onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                  style={{
                    ...styles.filterButton,
                    opacity: activeStep === 0 ? 0.6 : 1,
                    cursor: activeStep === 0 ? 'not-allowed' : 'pointer'
                  }}
                  disabled={activeStep === 0}
                >
                  ⬅️ Précédent
                </button>
                <button
                  onClick={() => setActiveStep((s) => Math.min(3, s + 1))}
                  style={{
                    ...styles.button,
                    opacity: activeStep === steps.length - 1 ? 0.6 : 1,
                    cursor: activeStep === steps.length - 1 ? 'not-allowed' : 'pointer'
                  }}
                  disabled={activeStep === steps.length - 1}
                >
                  Suivant ➡️
                </button>
              </Stack>
            </Grid>

            {/* Résumé collant */}
            <Grid item xs={12} md={3}>
              <div style={styles.stickySummary}>
                <Typography sx={{ fontWeight: 900, mb: 1.5, color: '#111827' }}>
                  Résumé
                </Typography>

                <Stack spacing={1.2}>
                  <Chip
                    icon={<ReceiptIcon />}
                    label={formData.categorie || 'Catégorie'}
                    sx={{
                      bgcolor: getCategorieColor(formData.categorie) + '20',
                      color: getCategorieColor(formData.categorie),
                      fontWeight: 900
                    }}
                  />
                  <Typography variant="body2" sx={{ color: '#334155', fontWeight: 800 }}>
                    {formData.libelle || 'Libellé…'}
                  </Typography>

                  <Divider />

                  <Grid container spacing={1}>
                    <Grid item xs={6}><Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Montant</Typography></Grid>
                    <Grid item xs={6} sx={{ textAlign: 'right' }}>
                      <Typography variant="body1" sx={{ fontWeight: 900, color: '#1d4ed8' }}>
                        {toFloat(formData.montant || 0).toFixed(2)} DHS
                      </Typography>
                    </Grid>

                    <Grid item xs={6}><Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Date</Typography></Grid>
                    <Grid item xs={6} sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>{formData.date || '-'}</Typography>
                    </Grid>

                    <Grid item xs={6}><Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Statut</Typography></Grid>
                    <Grid item xs={6} sx={{ textAlign: 'right' }}>
                      <Chip
                        label={formData.statut}
                        size="small"
                        sx={{
                          bgcolor: getStatutColor(formData.statut) + '20',
                          color: getStatutColor(formData.statut),
                          fontWeight: 800
                        }}
                      />
                    </Grid>

                    <Grid item xs={6}><Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Paiement</Typography></Grid>
                    <Grid item xs={6} sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>
                        {formData.modePaiement || '-'}
                      </Typography>
                    </Grid>
                  </Grid>

                  {norm(formData.modePaiement) === 'especes' && norm(formData.statut) === 'paye' && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      💰 Impact caisse : <strong>sortie</strong> de {toFloat(formData.montant || 0).toFixed(2)} DHS
                    </Alert>
                  )}
                </Stack>
              </div>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{
          px: isMobile ? 2 : 3,
          py: isMobile ? 1.5 : 2,
          gap: 1.5,
          background: '#f8fafc',
          borderTop: '2px solid #e2e8f0'
        }}>
          <button
            style={{ ...styles.filterButton, minWidth: isMobile ? 'auto' : 140 }}
            onClick={handleCloseDialog}
          >
            Annuler
          </button>
          <button
            style={{
              ...styles.button,
              minWidth: isMobile ? 'auto' : 160,
              opacity: (!formData.categorie || !formData.libelle || !formData.montant) ? 0.5 : 1,
              cursor: (!formData.categorie || !formData.libelle || !formData.montant) ? 'not-allowed' : 'pointer'
            }}
            onClick={handleSave}
            disabled={!formData.categorie || !formData.libelle || !formData.montant}
          >
            {editingCharge ? 'Enregistrer les modifications' : 'Enregistrer'}
          </button>
        </DialogActions>
      </Dialog>

      {/* Dialog Détails (inchangé, densifié) */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          style: {
            borderRadius: isMobile ? 0 : 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        }}
      >
        <DialogTitle sx={{
          background: 'linear-gradient(135deg, #0b1220 0%, #111827 100%)',
          color: 'white',
          fontWeight: 900,
          fontSize: isMobile ? 18 : 20,
          px: isMobile ? 2 : 3,
          py: isMobile ? 1.5 : 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Détails de la charge</span>
          {isMobile && (
            <IconButton onClick={() => setDetailsDialogOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>

        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          {selectedCharge && (
            <Box sx={{ mt: 1 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Chip
                  label={selectedCharge.categorie || 'N/A'}
                  sx={{
                    bgcolor: getCategorieColor(selectedCharge.categorie) + '20',
                    color: getCategorieColor(selectedCharge.categorie),
                    fontWeight: 900
                  }}
                />
                <Chip
                  label={selectedCharge.statut || 'Payé'}
                  sx={{
                    bgcolor: getStatutColor(selectedCharge.statut) + '20',
                    color: getStatutColor(selectedCharge.statut),
                    fontWeight: 900
                  }}
                />
              </Stack>

              <Typography variant="h6" sx={{ fontWeight: 900, mb: .5, color: '#111827' }}>
                {selectedCharge.libelle}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>
                {selectedCharge.date}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Montant</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: '#1d4ed8' }}>
                    {toFloat(selectedCharge.montant).toFixed(2)} DHS
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Catégorie</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedCharge.categorie}</Typography>
                </Grid>
              </Grid>

              {selectedCharge.fournisseur && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                    Fournisseur
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedCharge.fournisseur}</Typography>
                  {selectedCharge.contactFournisseur && (
                    <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                      Contact : {selectedCharge.contactFournisseur}
                    </Typography>
                  )}
                  {selectedCharge.adresseFournisseur && (
                    <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                      Adresse : {selectedCharge.adresseFournisseur}
                    </Typography>
                  )}
                </>
              )}

              {selectedCharge.typeDocument && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                    Document
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>Type : {selectedCharge.typeDocument}</Typography>
                  {selectedCharge.numeroFacture && (
                    <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                      N° Facture : {selectedCharge.numeroFacture}
                    </Typography>
                  )}
                  {selectedCharge.numeroDocument && (
                    <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                      N° Document : {selectedCharge.numeroDocument}
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                    Date : {selectedCharge.dateDocument || '-'}
                  </Typography>
                  {selectedCharge.dateEcheance && (
                    <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                      Échéance : {selectedCharge.dateEcheance}
                    </Typography>
                  )}
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                      Fichier : <a href={selectedCharge.pieceJointe} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', fontWeight: 900 }}>Voir</a>
                    </Typography>
                  )}
                </>
              )}

              {selectedCharge.modePaiement && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                    Paiement
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>Mode : {selectedCharge.modePaiement}</Typography>
                  {selectedCharge.referenceVirement && (
                    <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                      Référence : {selectedCharge.referenceVirement}
                    </Typography>
                  )}
                  {norm(selectedCharge.modePaiement) === 'especes' && norm(selectedCharge.statut) === 'paye' && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      💰 Ce montant a été déduit de la caisse
                    </Alert>
                  )}
                </>
              )}

              {selectedCharge.description && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                    Description
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedCharge.description}</Typography>
                </>
              )}

              {selectedCharge.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                    Notes
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedCharge.notes}</Typography>
                </>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{
          px: isMobile ? 2 : 3,
          py: isMobile ? 1.5 : 2,
          background: '#f8fafc',
          borderTop: '2px solid #e2e8f0'
        }}>
          <button
            style={{ ...styles.button, background: 'linear-gradient(135deg, #4b5563 0%, #111827 100%)' }}
            onClick={() => setDetailsDialogOpen(false)}
          >
            Fermer
          </button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

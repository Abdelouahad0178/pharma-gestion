// src/components/charges/ChargesPersonnels.js
// Design PRO 2025 — Sidebar Stepper + Résumé collant + Caisse persistée + TEMPS RÉEL
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
  Autocomplete,
  Collapse,
  Tooltip,
  Badge,
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
  Person as PersonIcon,
  Description as DescriptionIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  AttachMoney as MoneyIcon,
  Close as CloseIcon,
  Work as WorkIcon
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
  limit,
  onSnapshot,
  increment
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

const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/* ===== Helpers Caisse (persistée) ===== */
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

async function revertCaisseMovementsForPersonnel(societeId, chargeId) {
  const qMov = query(
    collection(db, 'societe', societeId, 'caisseMovements'),
    where('chargePersonnelId', '==', chargeId)
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

async function reconcileCaisseForPersonnel(societeId, chargeId, form, total, employeName) {
  // Annuler les anciens mouvements liés
  await revertCaisseMovementsForPersonnel(societeId, chargeId);

  // Déduire uniquement si espèces
  const isCash = norm(form.modePaiement) === 'especes';
  if (isCash && total > 0) {
    const delta = -total; // sortie
    await applyCaisseDelta(societeId, delta, {
      label: `Charge personnel: ${employeName || ''} (${form.poste || '-'})`,
      modePaiement: form.modePaiement,
      chargePersonnelId: chargeId,
      date: form.date || null,
      createdFor: 'chargePersonnel'
    });
  }
}

export default function ChargesPersonnels() {
  const { user, societeId } = useUserRole();

  // Responsive
  const isMobile = useMediaQuery('(max-width:768px)');

  const [charges, setCharges] = useState([]);
  const [filteredCharges, setFilteredCharges] = useState([]);
  const [loading, setLoading] = useState(true);

  // Employés
  const [employes, setEmployes] = useState([]);
  const [loadingEmployes, setLoadingEmployes] = useState(false);

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const [editingCharge, setEditingCharge] = useState(null);
  const [selectedCharge, setSelectedCharge] = useState(null);

  // Stepper
  const steps = ['Employé', 'Rémunération', 'Document', 'Paiement'];
  const [activeStep, setActiveStep] = useState(0);

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

  /* =================== Charges TEMPS RÉEL =================== */
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
        console.error('Erreur listener charges personnels:', err);
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
    } catch (e) {
      console.error('Erreur preload dernière charge:', e);
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
    setActiveStep(0);
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

  /* =================== Save (paiements + caisse) =================== */
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

      // 5) Réconcilier paiements liés
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

      // 6) Recréer le paiement (lisible par Dashboard)
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
          // flags utiles (facultatif)
          isCashOut: norm(formData.modePaiement) === 'especes',
          sign: norm(formData.modePaiement) === 'especes' ? -1 : 0,
          createdAt: Timestamp.now(),
          createdBy: user.uid
        };
        await addDoc(collection(db, 'societe', societeId, 'paiements'), paiementData);
      }

      // 7) Caisse persistée (mouvements + solde)
      await reconcileCaisseForPersonnel(societeId, chargeId, formData, total, employeName);

      handleCloseDialog();
    } catch (error) {
      console.error('Erreur enregistrement:', error);
      alert("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (charge) => {
    if (!window.confirm(`Supprimer la charge de ${charge.employe || charge.employeName} ?`)) return;
    try {
      // Supprimer paiements liés
      const qPaiements = query(
        collection(db, 'societe', societeId, 'paiements'),
        where('chargePersonnelId', '==', charge.id)
      );
      const snapP = await getDocs(qPaiements);
      const batch = writeBatch(db);
      snapP.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      // Revert caisse
      await revertCaisseMovementsForPersonnel(societeId, charge.id);

      // Supprimer la charge
      await deleteDoc(doc(db, 'societe', societeId, 'chargesPersonnels', charge.id));
    } catch (e) {
      console.error('Erreur suppression:', e);
      alert('Erreur lors de la suppression');
    }
  };

  /* =================== UI helpers =================== */
  const stats = {
    total: filteredCharges.reduce((s, c) => s + (toFloat(c.total) || 0), 0),
    count: filteredCharges.length,
    salaires: filteredCharges.reduce((s, c) => s + (toFloat(c.salaire) || 0), 0),
    primes: filteredCharges.reduce((s, c) => s + (toFloat(c.prime) || 0), 0)
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

  /* ============== Styles ============== */
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 100%)',
      padding: isMobile ? 10 : 24,
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
      padding: isMobile ? '20px 16px' : '32px',
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
    content: { padding: isMobile ? 16 : 28 },
    statCard: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      padding: 18,
      borderRadius: 16,
      border: '2px solid #e2e8f0',
      textAlign: 'center'
    },
    actionBar: {
      display: 'flex',
      gap: 12,
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      justifyContent: 'space-between',
      marginBottom: 18
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
    }
  };

  /* =================== Render =================== */
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{...styles.mainCard, padding: '40px', textAlign: 'center'}}>
          <div style={{ fontSize: '3em', marginBottom: '20px' }}>⏳</div>
          <div style={{ fontSize: '1.2em', color: '#64748b', fontWeight: 700 }}>
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
          <div style={styles.titleRow}>
            <Avatar sx={{ bgcolor: '#1d4ed8', width: 40, height: 40 }}>
              <WorkIcon />
            </Avatar>
            <h1 style={styles.title}>💼 Charges du Personnel</h1>
          </div>
          <p style={styles.subtitle}>Gestion complète de la paie et des charges sociales, avec impact caisse.</p>
        </div>

        <div style={styles.content}>
          {/* Stats */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={3}>
              <div style={styles.statCard}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                  Total Charges
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#1e3a8a', marginTop: 4 }}>
                  {stats.total.toFixed(2)} DHS
                </div>
              </div>
            </Grid>
            <Grid item xs={12} md={3}>
              <div style={styles.statCard}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                  Entrées
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#065f46', marginTop: 4 }}>
                  {stats.count}
                </div>
              </div>
            </Grid>
            <Grid item xs={12} md={3}>
              <div style={styles.statCard}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                  Total Salaires
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', marginTop: 4 }}>
                  {stats.salaires.toFixed(2)} DHS
                </div>
              </div>
            </Grid>
            <Grid item xs={12} md={3}>
              <div style={styles.statCard}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                  Total Primes
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#b45309', marginTop: 4 }}>
                  {stats.primes.toFixed(2)} DHS
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
                        <Avatar sx={{ bgcolor: '#111827' }}><PersonIcon /></Avatar>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>
                            {charge.employe || charge.employeName}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                            {charge.date} {charge.cin && `• CIN: ${charge.cin}`}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          label={charge.poste || 'N/A'}
                          size="small"
                          sx={{
                            bgcolor: getPosteColor(charge.poste) + '20',
                            color: getPosteColor(charge.poste),
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
                            onClick={(e) => { e.stopPropagation(); handleDelete(charge); }}
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
                              Total
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 900, color: '#1d4ed8' }}>
                              {toFloat(charge.total || 0).toFixed(2)} DHS
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={6} md={4}>
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                              Salaire
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 800 }}>
                              {toFloat(charge.salaire || 0).toFixed(2)} DHS
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={6} md={4}>
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                              Paiement
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 800 }}>
                              {charge.modePaiement || '-'}
                            </Typography>
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

      {/* ===== Dialog — NOUVEAU DESIGN (Stepper + Résumé) ===== */}
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
              {/* Étape 0: Employé */}
              {activeStep === 0 && (
                <Stack spacing={2}>
                  <Alert
                    severity="info"
                    sx={{
                      background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                      border: '1px solid #60a5fa',
                      borderRadius: 2
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
                        size="small"
                        noOptionsText="Aucun salarié"
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Chercher salarié existant"
                            placeholder="Tapez un nom..."
                            size="small"
                            disabled={newEmployeeMode}
                            InputProps={{
                              ...params.InputProps,
                              sx: { ...params.InputProps?.sx, height: 40, bgcolor: 'white' }
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
                            : 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)'
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
                      background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                      padding: 16,
                      borderRadius: 16,
                      border: '2px solid #e2e8f0'
                    }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                        Nouveau salarié
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <TextField label="Nom *" value={newEmployee.nom}
                            onChange={(e) => setNewEmployee({ ...newEmployee, nom: e.target.value })}
                            fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField label="CIN" value={newEmployee.cin}
                            onChange={(e) => setNewEmployee({ ...newEmployee, cin: e.target.value })}
                            fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField label="Téléphone" value={newEmployee.telephone}
                            onChange={(e) => setNewEmployee({ ...newEmployee, telephone: e.target.value })}
                            fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Poste</InputLabel>
                            <Select
                              value={newEmployee.poste}
                              onChange={(e) => setNewEmployee({ ...newEmployee, poste: e.target.value })}
                              label="Poste"
                              sx={{ bgcolor: 'white', borderRadius: 2 }}
                            >
                              {typesPostes.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                          <TextField label="Adresse" value={newEmployee.adresse}
                            onChange={(e) => setNewEmployee({ ...newEmployee, adresse: e.target.value })}
                            fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField label="N° Sécurité Sociale" value={newEmployee.numeroSecuriteSociale}
                            onChange={(e) => setNewEmployee({ ...newEmployee, numeroSecuriteSociale: e.target.value })}
                            fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField label="Date d'embauche" type="date" value={newEmployee.dateEmbauche}
                            onChange={(e) => setNewEmployee({ ...newEmployee, dateEmbauche: e.target.value })}
                            fullWidth size="small" InputLabelProps={{ shrink: true }}
                            sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                      </Grid>
                    </div>
                  ) : (
                    <>
                      <TextField
                        label="Nom de l'employé *"
                        value={formData.employe}
                        onChange={(e) => setFormData({ ...formData, employe: e.target.value })}
                        fullWidth required size="small" sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <TextField label="CIN" value={formData.cin}
                            onChange={(e) => setFormData({ ...formData, cin: e.target.value })}
                            fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField label="Téléphone" value={formData.telephone}
                            onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                            fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                      </Grid>
                      <TextField
                        label="Adresse"
                        value={formData.adresse}
                        onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                        fullWidth multiline rows={2} size="small" sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <TextField label="N° Sécurité Sociale" value={formData.numeroSecuriteSociale}
                            onChange={(e) => setFormData({ ...formData, numeroSecuriteSociale: e.target.value })}
                            fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Poste</InputLabel>
                            <Select
                              value={formData.poste}
                              onChange={(e) => setFormData({ ...formData, poste: e.target.value })}
                              label="Poste"
                              sx={{ bgcolor: 'white', borderRadius: 2 }}
                            >
                              {typesPostes.map(poste => (
                                <MenuItem key={poste} value={poste}>{poste}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField label="Date d'embauche" type="date" value={formData.dateEmbauche}
                            onChange={(e) => setFormData({ ...formData, dateEmbauche: e.target.value })}
                            fullWidth size="small" InputLabelProps={{ shrink: true }}
                            sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>
                      </Grid>
                    </>
                  )}
                </Stack>
              )}

              {/* Étape 1: Rémunération */}
              {activeStep === 1 && (
                <Stack spacing={2}>
                  <Alert
                    severity="info"
                    icon={<MoneyIcon fontSize="small" />}
                    sx={{
                      background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                      border: '1px solid #22c55e',
                      borderRadius: 2
                    }}
                  >
                    Tous les montants sont en DHS.
                  </Alert>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Salaire de base *"
                        type="number"
                        value={formData.salaire}
                        onChange={(e) => setFormData({ ...formData, salaire: e.target.value })}
                        fullWidth required size="small" sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Prime"
                        type="number"
                        value={formData.prime}
                        onChange={(e) => setFormData({ ...formData, prime: e.target.value })}
                        fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Heures supplémentaires"
                        type="number"
                        value={formData.heuresSupplementaires}
                        onChange={(e) => setFormData({ ...formData, heuresSupplementaires: e.target.value })}
                        fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Taux horaire"
                        type="number"
                        value={formData.tauxHoraire}
                        onChange={(e) => setFormData({ ...formData, tauxHoraire: e.target.value })}
                        fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Indemnités"
                        type="number"
                        value={formData.indemnites}
                        onChange={(e) => setFormData({ ...formData, indemnites: e.target.value })}
                        fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Date de la charge"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        fullWidth size="small" InputLabelProps={{ shrink: true }}
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                  </Grid>

                  <div style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                    padding: 16, borderRadius: 16, border: '2px solid #e2e8f0'
                  }}>
                    <Grid container spacing={0.5}>
                      <Grid item xs={6}><Typography variant="caption" sx={{ color: '#64748b' }}>H. Supp. :</Typography></Grid>
                      <Grid item xs={6}><Typography variant="body2" align="right" sx={{ fontWeight: 700 }}>
                        {(toFloat(formData.heuresSupplementaires) * toFloat(formData.tauxHoraire)).toFixed(2)} DHS
                      </Typography></Grid>
                      <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                      <Grid item xs={6}><Typography variant="subtitle2" sx={{ fontWeight: 900 }}>Total :</Typography></Grid>
                      <Grid item xs={6}><Typography variant="subtitle2" align="right" sx={{ fontWeight: 900, color: '#1d4ed8' }}>
                        {calculerTotal().toFixed(2)} DHS
                      </Typography></Grid>
                    </Grid>
                  </div>
                </Stack>
              )}

              {/* Étape 2: Document */}
              {activeStep === 2 && (
                <Stack spacing={2}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Type de document</InputLabel>
                        <Select
                          value={formData.typeDocument}
                          onChange={(e) => setFormData({ ...formData, typeDocument: e.target.value })}
                          label="Type de document"
                          sx={{ bgcolor: 'white', borderRadius: 2 }}
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
                        fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Date du document"
                        type="date"
                        value={formData.dateDocument}
                        onChange={(e) => setFormData({ ...formData, dateDocument: e.target.value })}
                        fullWidth size="small" InputLabelProps={{ shrink: true }}
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Pièce jointe (URL)"
                        value={formData.pieceJointe}
                        onChange={(e) => setFormData({ ...formData, pieceJointe: e.target.value })}
                        fullWidth size="small" placeholder="https://..."
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    fullWidth multiline rows={3} size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
                  />
                  <TextField
                    label="Notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    fullWidth multiline rows={2} size="small"
                    sx={{ bgcolor: 'white', borderRadius: 2 }}
                  />
                </Stack>
              )}

              {/* Étape 3: Paiement */}
              {activeStep === 3 && (
                <Stack spacing={2}>
                  <Alert
                    severity="info"
                    icon={<MoneyIcon fontSize="small" />}
                    sx={{
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      border: '1px solid #fbbf24',
                      borderRadius: 2
                    }}
                  >
                    Le mode de paiement impacte la caisse (<strong>Espèces</strong> ⇒ déduction).
                  </Alert>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Mode de paiement</InputLabel>
                        <Select
                          value={formData.modePaiement}
                          onChange={(e) => setFormData({ ...formData, modePaiement: e.target.value })}
                          label="Mode de paiement"
                          sx={{ bgcolor: 'white', borderRadius: 2 }}
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
                        fullWidth size="small" placeholder="Ex: CHQ-123456 ou VIR-789012"
                        sx={{ bgcolor: 'white', borderRadius: 2 }}
                      />
                    </Grid>
                  </Grid>

                  {norm(formData.modePaiement) === 'especes' && (
                    <Alert
                      severity="success"
                      sx={{
                        background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                        border: '1px solid #22c55e',
                        borderRadius: 2
                      }}
                    >
                      ✅ Ce paiement en espèces sera <strong>déduit de la caisse</strong>
                    </Alert>
                  )}

                  <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '2px solid #e2e8f0', background: '#fafafa' }}>
                    <Typography variant="body2" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                      Récapitulatif
                    </Typography>
                    <Grid container spacing={1}>
                      <Grid item xs={6}><Typography variant="body2">Montant total :</Typography></Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" align="right" sx={{ fontWeight: 800, color: '#1d4ed8' }}>
                          {calculerTotal().toFixed(2)} DHS
                        </Typography>
                      </Grid>
                      <Grid item xs={6}><Typography variant="body2">Mode de paiement :</Typography></Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" align="right" sx={{ fontWeight: 800 }}>
                          {formData.modePaiement || 'Non spécifié'}
                        </Typography>
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
                    icon={<PersonIcon />}
                    label={formData.poste || 'Poste'}
                    sx={{
                      bgcolor: getPosteColor(formData.poste) + '20',
                      color: getPosteColor(formData.poste),
                      fontWeight: 900
                    }}
                  />
                  <Typography variant="body2" sx={{ color: '#334155', fontWeight: 800 }}>
                    {formData.employe || 'Nom…'}
                  </Typography>

                  <Divider />

                  <Grid container spacing={1}>
                    <Grid item xs={6}><Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Total</Typography></Grid>
                    <Grid item xs={6} sx={{ textAlign: 'right' }}>
                      <Typography variant="body1" sx={{ fontWeight: 900, color: '#1d4ed8' }}>
                        {calculerTotal().toFixed(2)} DHS
                      </Typography>
                    </Grid>

                    <Grid item xs={6}><Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Date</Typography></Grid>
                    <Grid item xs={6} sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>{formData.date || '-'}</Typography>
                    </Grid>

                    <Grid item xs={6}><Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Paiement</Typography></Grid>
                    <Grid item xs={6} sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>
                        {formData.modePaiement || '-'}
                      </Typography>
                    </Grid>
                  </Grid>

                  {norm(formData.modePaiement) === 'especes' && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      💰 Impact caisse : <strong>sortie</strong> de {calculerTotal().toFixed(2)} DHS
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
              opacity: (newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire ? 0.5 : 1,
              cursor:
                (newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire
                  ? 'not-allowed'
                  : 'pointer'
            }}
            onClick={handleSave}
            disabled={(newEmployeeMode ? !newEmployee.nom : !formData.employe) || !formData.salaire}
          >
            {editingCharge ? 'Enregistrer les modifications' : 'Enregistrer'}
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
                  icon={<PersonIcon />}
                  label={selectedCharge.poste || 'Non spécifié'}
                  sx={{
                    bgcolor: getPosteColor(selectedCharge.poste) + '20',
                    color: getPosteColor(selectedCharge.poste),
                    fontWeight: 900,
                    px: 1.5,
                    borderRadius: '18px'
                  }}
                />
              </Stack>

              <Typography variant="h6" sx={{ fontWeight: 900, mb: .5, color: '#111827' }}>
                {selectedCharge.employe || selectedCharge.employeName}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>
                {selectedCharge.date}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>CIN</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedCharge.cin || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Téléphone</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedCharge.telephone || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Poste</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedCharge.poste || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>N° Sécu</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedCharge.numeroSecuriteSociale || '-'}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>Adresse</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{selectedCharge.adresse || '-'}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1, color: '#111827' }}>
                Rémunération
              </Typography>
              <div style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                padding: 12, borderRadius: 10, border: '2px solid #e2e8f0'
              }}>
                <Grid container spacing={0.5}>
                  <Grid item xs={6}><Typography variant="body2">Salaire :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" sx={{ fontWeight: 800 }}>{toFloat(selectedCharge.salaire || 0).toFixed(2)} DHS</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Prime :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" sx={{ fontWeight: 800 }}>{toFloat(selectedCharge.prime || 0).toFixed(2)} DHS</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Heures supp. :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" sx={{ fontWeight: 800 }}>{toFloat(selectedCharge.montantHS || 0).toFixed(2)} DHS</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2">Indemnités :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="body2" align="right" sx={{ fontWeight: 800 }}>{toFloat(selectedCharge.indemnites || 0).toFixed(2)} DHS</Typography></Grid>
                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <Grid item xs={6}><Typography variant="subtitle2" sx={{ fontWeight: 900 }}>Total :</Typography></Grid>
                  <Grid item xs={6}><Typography variant="subtitle2" align="right" sx={{ fontWeight: 900, color: '#1d4ed8' }}>{toFloat(selectedCharge.total || 0).toFixed(2)} DHS</Typography></Grid>
                </Grid>
              </div>

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
                  {norm(selectedCharge.modePaiement) === 'especes' && (
                    <Alert
                      severity="info"
                      sx={{ mt: 1, background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', border: '1px solid #60a5fa', borderRadius: 2 }}
                    >
                      💰 Ce montant a été déduit de la caisse
                    </Alert>
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
                  <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                    N° : {selectedCharge.numeroDocument || '-'}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                    Date : {selectedCharge.dateDocument || '-'}
                  </Typography>
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2" sx={{ mt: .5, fontWeight: 800 }}>
                      Fichier : <a href={selectedCharge.pieceJointe} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', fontWeight: 900 }}>Voir</a>
                    </Typography>
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

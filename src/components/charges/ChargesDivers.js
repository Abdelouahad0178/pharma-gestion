// src/components/charges/ChargesDivers.js - Version 4.0 - Gestion complète de la caisse (création, modification, suppression) avec intégration caisse
import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Grid,
  Tabs,
  Tab,
  Alert,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails
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
  ExpandMore as ExpandMoreIcon
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
  writeBatch
} from 'firebase/firestore';
import { useUserRole } from '../../contexts/UserRoleContext';

export default function ChargesDivers() {
  const { user, societeId } = useUserRole();
  const [charges, setCharges] = useState([]);
  const [filteredCharges, setFilteredCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [selectedCharge, setSelectedCharge] = useState(null);
  const [currentTab, setCurrentTab] = useState(0);
  
  // Filtres
  const [filters, setFilters] = useState({
    searchText: '',
    dateDebut: '',
    dateFin: '',
    categorie: '',
    statut: '',
    typeDocument: ''
  });

  // Formulaire
  const [formData, setFormData] = useState({
    categorie: '',
    libelle: '',
    montant: '',
    date: new Date().toISOString().split('T')[0],
    fournisseur: '',
    contactFournisseur: '',
    adresseFournisseur: '',
    typeDocument: '',
    numeroDocument: '',
    numeroFacture: '',
    dateDocument: new Date().toISOString().split('T')[0],
    dateEcheance: '',
    pieceJointe: '',
    description: '',
    notes: '',
    modePaiement: '',
    referenceVirement: '',
    statut: 'Payé'
  });

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

  // Charger les charges
  useEffect(() => {
    if (!user || !societeId) return;
    
    const fetchCharges = async () => {
      try {
        const q = query(
          collection(db, 'societe', societeId, 'chargesDivers'),
          orderBy('date', 'desc')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setCharges(data);
        setFilteredCharges(data);
      } catch (error) {
        console.error('Erreur chargement charges:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCharges();
  }, [user, societeId]);

  // Appliquer les filtres
  useEffect(() => {
    let result = [...charges];

    // Filtre texte
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      result = result.filter(charge =>
        (charge.libelle?.toLowerCase().includes(searchLower)) ||
        (charge.fournisseur?.toLowerCase().includes(searchLower)) ||
        (charge.description?.toLowerCase().includes(searchLower)) ||
        (charge.numeroFacture?.toLowerCase().includes(searchLower)) ||
        (charge.numeroDocument?.toLowerCase().includes(searchLower))
      );
    }

    // Filtre date début
    if (filters.dateDebut) {
      result = result.filter(charge => charge.date >= filters.dateDebut);
    }

    // Filtre date fin
    if (filters.dateFin) {
      result = result.filter(charge => charge.date <= filters.dateFin);
    }

    // Filtre catégorie
    if (filters.categorie) {
      result = result.filter(charge => charge.categorie === filters.categorie);
    }

    // Filtre statut
    if (filters.statut) {
      result = result.filter(charge => charge.statut === filters.statut);
    }

    // Filtre type document
    if (filters.typeDocument) {
      result = result.filter(charge => charge.typeDocument === filters.typeDocument);
    }

    setFilteredCharges(result);
  }, [filters, charges]);

  // Réinitialiser les filtres
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

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      categorie: '',
      libelle: '',
      montant: '',
      date: new Date().toISOString().split('T')[0],
      fournisseur: '',
      contactFournisseur: '',
      adresseFournisseur: '',
      typeDocument: '',
      numeroDocument: '',
      numeroFacture: '',
      dateDocument: new Date().toISOString().split('T')[0],
      dateEcheance: '',
      pieceJointe: '',
      description: '',
      notes: '',
      modePaiement: '',
      referenceVirement: '',
      statut: 'Payé'
    });
  };

  const handleOpenDialog = (charge = null) => {
    if (charge) {
      setEditingCharge(charge);
      setFormData({
        categorie: charge.categorie || '',
        libelle: charge.libelle || '',
        montant: charge.montant || '',
        date: charge.date || new Date().toISOString().split('T')[0],
        fournisseur: charge.fournisseur || '',
        contactFournisseur: charge.contactFournisseur || '',
        adresseFournisseur: charge.adresseFournisseur || '',
        typeDocument: charge.typeDocument || '',
        numeroDocument: charge.numeroDocument || '',
        numeroFacture: charge.numeroFacture || '',
        dateDocument: charge.dateDocument || new Date().toISOString().split('T')[0],
        dateEcheance: charge.dateEcheance || '',
        pieceJointe: charge.pieceJointe || '',
        description: charge.description || '',
        notes: charge.notes || '',
        modePaiement: charge.modePaiement || '',
        referenceVirement: charge.referenceVirement || '',
        statut: charge.statut || 'Payé'
      });
    } else {
      setEditingCharge(null);
      resetForm();
    }
    setCurrentTab(0);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCharge(null);
    resetForm();
  };

  const handleOpenDetails = (charge) => {
    setSelectedCharge(charge);
    setDetailsDialogOpen(true);
  };
  const handleSave = async () => {
    try {
      const montant = parseFloat(formData.montant) || 0;
      
      const data = {
        ...formData,
        montant,
        modifieLe: Timestamp.now(),
        modifiePar: user.email
      };

      if (editingCharge) {
        // ============================================================
        // MODIFICATION D'UNE CHARGE EXISTANTE
        // ============================================================
        
        const isEspecesNow = formData.modePaiement === 'Espèces';
        const isPayeNow = formData.statut === 'Payé';
        const shouldHavePaiementNow = isEspecesNow && isPayeNow;
        
        const wasEspecesBefore = editingCharge.modePaiement === 'Espèces';
        const wasPayeBefore = editingCharge.statut === 'Payé';
        const hadPaiementBefore = wasEspecesBefore && wasPayeBefore;
        
        // Chercher si un paiement existe déjà pour cette charge
        const paiementsQuery = query(
          collection(db, 'societe', societeId, 'paiements'),
          where('referenceCharge', '==', editingCharge.id)
        );
        const paiementsSnapshot = await getDocs(paiementsQuery);
        const existingPaiement = paiementsSnapshot.docs[0];
        
        const batch = writeBatch(db);
        
        // 1. Mettre à jour la charge
        batch.update(
          doc(db, 'societe', societeId, 'chargesDivers', editingCharge.id),
          data
        );
        
        // 2. Gérer le paiement selon les cas
        if (hadPaiementBefore && !shouldHavePaiementNow) {
          // CAS 1: Avait un paiement → Ne devrait plus en avoir : SUPPRIMER
          // (changement de mode de paiement ou de statut)
          if (existingPaiement) {
            batch.delete(existingPaiement.ref);
          }
        } else if (!hadPaiementBefore && shouldHavePaiementNow && montant > 0) {
          // CAS 2: N'avait pas de paiement → Devrait en avoir : CRÉER
          const paiementData = {
            type: 'chargeDiverse',
            relatedTo: 'chargeDiverse',
            category: 'chargeDiverse',
            montant: montant,
            mode: 'Espèces',
            paymentMode: 'Espèces',
            moyen: 'Espèces',
            date: Timestamp.fromDate(new Date(formData.date + 'T12:00:00')),
            timestamp: Timestamp.now(),
            description: `Charge Diverse: ${formData.categorie} - ${formData.libelle}`,
            categorie: formData.categorie,
            fournisseur: formData.fournisseur || null,
            referenceCharge: editingCharge.id,
            creeLe: Timestamp.now(),
            creePar: user.email
          };
          
          if (formData.referenceVirement) {
            paiementData.reference = formData.referenceVirement;
          }
          
          const paiementRef = doc(collection(db, 'societe', societeId, 'paiements'));
          batch.set(paiementRef, paiementData);
        } else if (hadPaiementBefore && shouldHavePaiementNow && montant > 0) {
          // CAS 3: Avait un paiement → Devrait toujours en avoir : METTRE À JOUR
          if (existingPaiement) {
            const paiementData = {
              montant: montant,
              date: Timestamp.fromDate(new Date(formData.date + 'T12:00:00')),
              description: `Charge Diverse: ${formData.categorie} - ${formData.libelle}`,
              categorie: formData.categorie,
              fournisseur: formData.fournisseur || null,
              modifieLe: Timestamp.now(),
              modifiePar: user.email
            };
            
            if (formData.referenceVirement) {
              paiementData.reference = formData.referenceVirement;
            }
            
            batch.update(existingPaiement.ref, paiementData);
          } else {
            // Le paiement n'existe pas mais devrait exister, le créer
            const paiementData = {
              type: 'chargeDiverse',
              relatedTo: 'chargeDiverse',
              category: 'chargeDiverse',
              montant: montant,
              mode: 'Espèces',
              paymentMode: 'Espèces',
              moyen: 'Espèces',
              date: Timestamp.fromDate(new Date(formData.date + 'T12:00:00')),
              timestamp: Timestamp.now(),
              description: `Charge Diverse: ${formData.categorie} - ${formData.libelle}`,
              categorie: formData.categorie,
              fournisseur: formData.fournisseur || null,
              referenceCharge: editingCharge.id,
              creeLe: Timestamp.now(),
              creePar: user.email
            };
            
            if (formData.referenceVirement) {
              paiementData.reference = formData.referenceVirement;
            }
            
            const paiementRef = doc(collection(db, 'societe', societeId, 'paiements'));
            batch.set(paiementRef, paiementData);
          }
        } else if (hadPaiementBefore && shouldHavePaiementNow && montant === 0) {
          // CAS 4: Montant devient 0 : SUPPRIMER le paiement
          if (existingPaiement) {
            batch.delete(existingPaiement.ref);
          }
        }
        // CAS 5: N'avait pas de paiement → Ne devrait toujours pas en avoir : rien à faire
        
        await batch.commit();
        setCharges(charges.map(c => c.id === editingCharge.id ? { ...c, ...data } : c));
        
      } else {
        // ============================================================
        // NOUVELLE CHARGE
        // ============================================================
        data.creeLe = Timestamp.now();
        data.creePar = user.email;
        
        const isEspeces = formData.modePaiement === 'Espèces';
        const isPaye = formData.statut === 'Payé';
        
        if (isEspeces && isPaye && montant > 0) {
          // Utiliser un batch pour créer les deux documents en même temps
          const batch = writeBatch(db);
          
          // 1. Créer la charge diverse
          const chargeRef = doc(collection(db, 'societe', societeId, 'chargesDivers'));
          batch.set(chargeRef, data);
          
          // 2. Créer le paiement dans la caisse
          const paiementData = {
            type: 'chargeDiverse',
            relatedTo: 'chargeDiverse',
            category: 'chargeDiverse',
            montant: montant,
            mode: 'Espèces',
            paymentMode: 'Espèces',
            moyen: 'Espèces',
            date: Timestamp.fromDate(new Date(formData.date + 'T12:00:00')),
            timestamp: Timestamp.now(),
            description: `Charge Diverse: ${formData.categorie} - ${formData.libelle}`,
            categorie: formData.categorie,
            fournisseur: formData.fournisseur || null,
            referenceCharge: chargeRef.id,
            creeLe: Timestamp.now(),
            creePar: user.email
          };
          
          if (formData.referenceVirement) {
            paiementData.reference = formData.referenceVirement;
          }
          
          const paiementRef = doc(collection(db, 'societe', societeId, 'paiements'));
          batch.set(paiementRef, paiementData);
          
          // Commit le batch
          await batch.commit();
          
          setCharges([{ id: chargeRef.id, ...data }, ...charges]);
        } else {
          // Pas de paiement en espèces OU pas payé, juste créer la charge
          const docRef = await addDoc(
            collection(db, 'societe', societeId, 'chargesDivers'),
            data
          );
          setCharges([{ id: docRef.id, ...data }, ...charges]);
        }
      }

      handleCloseDialog();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette charge ?')) return;

    try {
      // Chercher si un paiement existe pour cette charge
      const paiementsQuery = query(
        collection(db, 'societe', societeId, 'paiements'),
        where('referenceCharge', '==', id)
      );
      const paiementsSnapshot = await getDocs(paiementsQuery);
      
      const batch = writeBatch(db);
      
      // Supprimer la charge
      batch.delete(doc(db, 'societe', societeId, 'chargesDivers', id));
      
      // Supprimer le paiement associé s'il existe
      paiementsSnapshot.docs.forEach(paiementDoc => {
        batch.delete(paiementDoc.ref);
      });
      
      await batch.commit();
      setCharges(charges.filter(c => c.id !== id));
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression: ' + error.message);
    }
  };

  const totalCharges = filteredCharges.reduce((sum, c) => sum + (c.montant || 0), 0);
  const chargesParCategorie = filteredCharges.reduce((acc, charge) => {
    const cat = charge.categorie || 'Autre';
    acc[cat] = (acc[cat] || 0) + (charge.montant || 0);
    return acc;
  }, {});
  const chargesParStatut = filteredCharges.reduce((acc, charge) => {
    const stat = charge.statut || 'Payé';
    acc[stat] = (acc[stat] || 0) + (charge.montant || 0);
    return acc;
  }, {});

  const getCategorieColor = (categorie) => {
    const colors = {
      'Loyer': '#ef4444',
      'Électricité': '#f59e0b',
      'Eau': '#3b82f6',
      'Téléphone': '#8b5cf6',
      'Internet': '#06b6d4',
      'Assurance': '#10b981',
      'Taxes': '#f43f5e',
      'Fournitures': '#6366f1',
      'Maintenance': '#f97316',
      'Transport': '#14b8a6',
      'Marketing': '#ec4899',
      'Formation': '#a855f7',
      'Autre': '#64748b'
    };
    return colors[categorie] || colors['Autre'];
  };

  const getStatutColor = (statut) => {
    const colors = {
      'Payé': '#10b981',
      'En attente': '#f59e0b',
      'Impayé': '#ef4444',
      'Annulé': '#64748b'
    };
    return colors[statut] || colors['Payé'];
  };

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography>Chargement...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, background: '#f8fafc', minHeight: '100vh' }}>
      {/* En-tête */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ReceiptIcon sx={{ fontSize: 40, color: '#764ba2' }} />
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b' }}>
            Charges Diverses
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            fontWeight: 600,
            px: 3,
            py: 1.5
          }}
        >
          Nouvelle charge
        </Button>
      </Box>

      {/* Filtres */}
      <Accordion sx={{ mb: 3, boxShadow: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterListIcon sx={{ color: '#667eea' }} />
            <Typography sx={{ fontWeight: 600 }}>Filtres de recherche</Typography>
            {(filters.searchText || filters.dateDebut || filters.dateFin || filters.categorie || filters.statut || filters.typeDocument) && (
              <Chip label="Actifs" size="small" color="primary" />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            {/* Recherche texte */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Rechercher par libellé, fournisseur, n° facture..."
                value={filters.searchText}
                onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: '#64748b' }} />
                }}
              />
            </Grid>

            {/* Filtre catégorie */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Catégorie</InputLabel>
                <Select
                  value={filters.categorie}
                  onChange={(e) => setFilters({ ...filters, categorie: e.target.value })}
                  label="Catégorie"
                >
                  <MenuItem value="">Toutes les catégories</MenuItem>
                  {categories.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Date début */}
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                type="date"
                label="Date de début"
                value={filters.dateDebut}
                onChange={(e) => setFilters({ ...filters, dateDebut: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Date fin */}
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                type="date"
                label="Date de fin"
                value={filters.dateFin}
                onChange={(e) => setFilters({ ...filters, dateFin: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Filtre statut */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={filters.statut}
                  onChange={(e) => setFilters({ ...filters, statut: e.target.value })}
                  label="Statut"
                >
                  <MenuItem value="">Tous les statuts</MenuItem>
                  {statuts.map(stat => (
                    <MenuItem key={stat} value={stat}>{stat}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Filtre type document */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Type de document</InputLabel>
                <Select
                  value={filters.typeDocument}
                  onChange={(e) => setFilters({ ...filters, typeDocument: e.target.value })}
                  label="Type de document"
                >
                  <MenuItem value="">Tous les documents</MenuItem>
                  {typesDocuments.map(type => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Bouton réinitialiser */}
            <Grid item xs={12}>
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleResetFilters}
              >
                Réinitialiser les filtres
              </Button>
            </Grid>
          </Grid>

          {/* Résultats filtrés */}
          <Box sx={{ mt: 2, p: 2, bgcolor: '#f1f5f9', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              📊 {filteredCharges.length} résultat(s) sur {charges.length} charge(s)
              {filters.dateDebut && filters.dateFin && (
                <> • Période : {filters.dateDebut} → {filters.dateFin}</>
              )}
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Statistiques */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #667eea15, #764ba215)' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', mb: 1 }}>
              Total des charges (filtrées)
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#667eea' }}>
              {totalCharges.toFixed(2)} MAD
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #10b98115, #06b6d415)' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', mb: 1 }}>
              Nombre de charges (filtrées)
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#10b981' }}>
              {filteredCharges.length}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #f59e0b15, #f9731615)' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', mb: 1 }}>
              Catégories actives (filtrées)
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#f59e0b' }}>
              {Object.keys(chargesParCategorie).length}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #ef444415, #f4333515)' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', mb: 1 }}>
              Impayés (filtrés)
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#ef4444' }}>
              {(chargesParStatut['Impayé'] || 0).toFixed(2)} MAD
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Tableau */}
      <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Catégorie</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Libellé</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Fournisseur</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Montant</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Document</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Statut</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCharges.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    {charges.length === 0 ? 'Aucune charge enregistrée' : 'Aucun résultat pour ces filtres'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredCharges.map(charge => (
                <TableRow key={charge.id} hover>
                  <TableCell>
                    <Chip
                      label={charge.categorie}
                      size="small"
                      sx={{
                        fontWeight: 600,
                        bgcolor: getCategorieColor(charge.categorie) + '20',
                        color: getCategorieColor(charge.categorie),
                        borderLeft: `4px solid ${getCategorieColor(charge.categorie)}`
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{charge.libelle}</TableCell>
                  <TableCell>
                    {charge.fournisseur ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon fontSize="small" />
                        <Typography variant="body2">{charge.fournisseur}</Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>{charge.date}</TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontWeight: 700, color: '#667eea' }}>
                      {charge.montant?.toFixed(2)} MAD
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {charge.typeDocument ? (
                      <Chip
                        icon={<DescriptionIcon />}
                        label={charge.typeDocument}
                        size="small"
                        sx={{ bgcolor: '#fef3c7', color: '#92400e' }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={charge.statut || 'Payé'}
                      size="small"
                      sx={{
                        bgcolor: getStatutColor(charge.statut) + '20',
                        color: getStatutColor(charge.statut),
                        fontWeight: 600
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDetails(charge)}
                      sx={{ color: '#06b6d4' }}
                      title="Voir détails"
                    >
                      <VisibilityIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(charge)}
                      sx={{ color: '#667eea' }}
                      title="Modifier"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(charge.id)}
                      sx={{ color: '#ef4444' }}
                      title="Supprimer"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialogue d'ajout/modification */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', pb: 1 }}>
          {editingCharge ? 'Modifier la charge' : 'Nouvelle charge diverse'}
        </DialogTitle>
        
        <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Informations" />
          <Tab label="Fournisseur" />
          <Tab label="Documents" />
          <Tab label="Paiement" />
        </Tabs>

        <DialogContent>
          {/* Onglet 1 : Informations */}
          {currentTab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Alert severity="info">
                Informations générales sur la charge
              </Alert>
              
              <FormControl fullWidth required>
                <InputLabel>Catégorie</InputLabel>
                <Select
                  value={formData.categorie}
                  onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                  label="Catégorie"
                >
                  {categories.map(cat => (
                    <MenuItem key={cat} value={cat}>
                      <Chip
                        label={cat}
                        size="small"
                        sx={{
                          bgcolor: getCategorieColor(cat) + '20',
                          color: getCategorieColor(cat)
                        }}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Libellé *"
                value={formData.libelle}
                onChange={(e) => setFormData({ ...formData, libelle: e.target.value })}
                fullWidth
                required
                placeholder="Ex: Loyer mensuel janvier 2025"
              />

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Date *"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Montant (MAD) *"
                    type="number"
                    value={formData.montant}
                    onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
                    fullWidth
                    required
                  />
                </Grid>
              </Grid>

              <TextField
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                multiline
                rows={3}
                fullWidth
              />
            </Box>
          )}

          {/* Onglet 2 : Fournisseur */}
          {currentTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Alert severity="success" icon={<BusinessIcon />}>
                Informations sur le fournisseur ou prestataire
              </Alert>
              
              <TextField
                label="Nom du fournisseur/prestataire"
                value={formData.fournisseur}
                onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                fullWidth
                placeholder="Ex: LYDEC, Maroc Telecom, etc."
              />

              <TextField
                label="Contact (Téléphone/Email)"
                value={formData.contactFournisseur}
                onChange={(e) => setFormData({ ...formData, contactFournisseur: e.target.value })}
                fullWidth
                placeholder="Ex: 0522-123456 ou contact@fournisseur.ma"
              />

              <TextField
                label="Adresse du fournisseur"
                value={formData.adresseFournisseur}
                onChange={(e) => setFormData({ ...formData, adresseFournisseur: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Box>
          )}

          {/* Onglet 3 : Documents */}
          {currentTab === 2 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Alert severity="warning" icon={<DescriptionIcon />}>
                Références des documents justificatifs
              </Alert>
              
              <FormControl fullWidth>
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

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Numéro du document"
                    value={formData.numeroDocument}
                    onChange={(e) => setFormData({ ...formData, numeroDocument: e.target.value })}
                    fullWidth
                    placeholder="Ex: DOC-2025-001"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Numéro de facture"
                    value={formData.numeroFacture}
                    onChange={(e) => setFormData({ ...formData, numeroFacture: e.target.value })}
                    fullWidth
                    placeholder="Ex: FA-2025-001"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Date du document"
                    type="date"
                    value={formData.dateDocument}
                    onChange={(e) => setFormData({ ...formData, dateDocument: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Date d'échéance"
                    type="date"
                    value={formData.dateEcheance}
                    onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>

              <TextField
                label="Référence/Lien pièce jointe"
                value={formData.pieceJointe}
                onChange={(e) => setFormData({ ...formData, pieceJointe: e.target.value })}
                fullWidth
                placeholder="URL ou référence du fichier"
                helperText="Vous pouvez indiquer un lien Google Drive, Dropbox, etc."
              />

              <TextField
                label="Notes supplémentaires"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                multiline
                rows={4}
                fullWidth
              />
            </Box>
          )}

          {/* Onglet 4 : Paiement */}
          {currentTab === 3 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Alert severity="info">
                Informations sur le paiement
              </Alert>
              
              <FormControl fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={formData.statut}
                  onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                  label="Statut"
                >
                  {statuts.map(stat => (
                    <MenuItem key={stat} value={stat}>
                      <Chip
                        label={stat}
                        size="small"
                        sx={{
                          bgcolor: getStatutColor(stat) + '20',
                          color: getStatutColor(stat)
                        }}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
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

              <TextField
                label="Référence virement/chèque"
                value={formData.referenceVirement}
                onChange={(e) => setFormData({ ...formData, referenceVirement: e.target.value })}
                fullWidth
                placeholder="Ex: CHQ-123456 ou VIR-789012"
              />

              {formData.modePaiement === 'Espèces' && formData.statut === 'Payé' && (
                <Alert severity="success">
                  ✅ Ce paiement en espèces sera automatiquement déduit de la caisse dans le Dashboard
                </Alert>
              )}

              <Paper sx={{ p: 2, bgcolor: '#f8fafc', mt: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Récapitulatif
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="body2">Montant :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" sx={{ fontWeight: 700 }}>
                      {(parseFloat(formData.montant) || 0).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Statut :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Chip
                      label={formData.statut}
                      size="small"
                      sx={{
                        float: 'right',
                        bgcolor: getStatutColor(formData.statut) + '20',
                        color: getStatutColor(formData.statut)
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 2 }}>
          <Button onClick={handleCloseDialog}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!formData.categorie || !formData.libelle || !formData.montant}
            sx={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
          >
            {editingCharge ? 'Modifier' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue de détails */}
      <Dialog open={detailsDialogOpen} onClose={() => setDetailsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#1e293b' }}>
          Détails de la charge
        </DialogTitle>
        <DialogContent>
          {selectedCharge && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Chip
                  label={selectedCharge.categorie}
                  sx={{
                    bgcolor: getCategorieColor(selectedCharge.categorie) + '20',
                    color: getCategorieColor(selectedCharge.categorie),
                    fontWeight: 700
                  }}
                />
                <Chip
                  label={selectedCharge.statut || 'Payé'}
                  sx={{
                    bgcolor: getStatutColor(selectedCharge.statut) + '20',
                    color: getStatutColor(selectedCharge.statut),
                    fontWeight: 700
                  }}
                />
              </Box>
              
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                {selectedCharge.libelle}
              </Typography>
              
              <Divider sx={{ my: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Date</Typography>
                  <Typography variant="body2">{selectedCharge.date}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Montant</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#667eea' }}>
                    {selectedCharge.montant?.toFixed(2)} MAD
                  </Typography>
                </Grid>
              </Grid>

              {selectedCharge.fournisseur && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Fournisseur</Typography>
                  <Typography variant="body2">{selectedCharge.fournisseur}</Typography>
                  {selectedCharge.contactFournisseur && (
                    <Typography variant="body2">Contact : {selectedCharge.contactFournisseur}</Typography>
                  )}
                  {selectedCharge.adresseFournisseur && (
                    <Typography variant="body2">Adresse : {selectedCharge.adresseFournisseur}</Typography>
                  )}
                </>
              )}

              {selectedCharge.typeDocument && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Document</Typography>
                  <Typography variant="body2">Type : {selectedCharge.typeDocument}</Typography>
                  {selectedCharge.numeroFacture && (
                    <Typography variant="body2">N° Facture : {selectedCharge.numeroFacture}</Typography>
                  )}
                  {selectedCharge.numeroDocument && (
                    <Typography variant="body2">N° Document : {selectedCharge.numeroDocument}</Typography>
                  )}
                  <Typography variant="body2">Date : {selectedCharge.dateDocument || '-'}</Typography>
                  {selectedCharge.dateEcheance && (
                    <Typography variant="body2">Échéance : {selectedCharge.dateEcheance}</Typography>
                  )}
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2">
                      Fichier : <a href={selectedCharge.pieceJointe} target="_blank" rel="noopener noreferrer">Voir</a>
                    </Typography>
                  )}
                </>
              )}

              {selectedCharge.modePaiement && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Paiement</Typography>
                  <Typography variant="body2">Mode : {selectedCharge.modePaiement}</Typography>
                  {selectedCharge.referenceVirement && (
                    <Typography variant="body2">Référence : {selectedCharge.referenceVirement}</Typography>
                  )}
                </>
              )}

              {selectedCharge.description && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Description</Typography>
                  <Typography variant="body2">{selectedCharge.description}</Typography>
                </>
              )}

              {selectedCharge.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Notes</Typography>
                  <Typography variant="body2">{selectedCharge.notes}</Typography>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
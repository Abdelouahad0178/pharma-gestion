// src/components/charges/ChargesPersonnels.js - Version 5.0 - Gestion complète de la caisse (création, modification, suppression) avec intégration caisse
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
  Grid,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails
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
  ExpandMore as ExpandMoreIcon,
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
  query,
  orderBy,
  where,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { useUserRole } from '../../contexts/UserRoleContext';

export default function ChargesPersonnels() {
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
    poste: '',
    typeDocument: ''
  });

  // Formulaire
  const [formData, setFormData] = useState({
    employe: '',
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
    date: new Date().toISOString().split('T')[0],
    typeDocument: '',
    numeroDocument: '',
    dateDocument: new Date().toISOString().split('T')[0],
    pieceJointe: '',
    description: '',
    notes: '',
    // Mode de paiement
    modePaiement: '',
    referenceVirement: ''
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

  // Modes de paiement
  const modesPaiement = [
    'Espèces',
    'Chèque',
    'Virement bancaire',
    'Carte bancaire',
    'Prélèvement',
    'Autre'
  ];

  // Charger les charges
  useEffect(() => {
    if (!user || !societeId) return;
    
    const fetchCharges = async () => {
      try {
        const q = query(
          collection(db, 'societe', societeId, 'chargesPersonnels'),
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

    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      result = result.filter(charge =>
        (charge.employe?.toLowerCase().includes(searchLower)) ||
        (charge.cin?.toLowerCase().includes(searchLower)) ||
        (charge.poste?.toLowerCase().includes(searchLower)) ||
        (charge.description?.toLowerCase().includes(searchLower)) ||
        (charge.numeroDocument?.toLowerCase().includes(searchLower))
      );
    }

    if (filters.dateDebut) {
      result = result.filter(charge => charge.date >= filters.dateDebut);
    }

    if (filters.dateFin) {
      result = result.filter(charge => charge.date <= filters.dateFin);
    }

    if (filters.poste) {
      result = result.filter(charge => charge.poste === filters.poste);
    }

    if (filters.typeDocument) {
      result = result.filter(charge => charge.typeDocument === filters.typeDocument);
    }

    setFilteredCharges(result);
  }, [filters, charges]);

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
      date: new Date().toISOString().split('T')[0],
      typeDocument: '',
      numeroDocument: '',
      dateDocument: new Date().toISOString().split('T')[0],
      pieceJointe: '',
      description: '',
      notes: '',
      modePaiement: '',
      referenceVirement: ''
    });
  };

  const handleOpenDialog = (charge = null) => {
    if (charge) {
      setEditingCharge(charge);
      setFormData({
        employe: charge.employe || '',
        cin: charge.cin || '',
        telephone: charge.telephone || '',
        adresse: charge.adresse || '',
        numeroSecuriteSociale: charge.numeroSecuriteSociale || '',
        poste: charge.poste || '',
        dateEmbauche: charge.dateEmbauche || '',
        salaire: charge.salaire || '',
        prime: charge.prime || '',
        heuresSupplementaires: charge.heuresSupplementaires || '',
        tauxHoraire: charge.tauxHoraire || '',
        indemnites: charge.indemnites || '',
        date: charge.date || new Date().toISOString().split('T')[0],
        typeDocument: charge.typeDocument || '',
        numeroDocument: charge.numeroDocument || '',
        dateDocument: charge.dateDocument || new Date().toISOString().split('T')[0],
        pieceJointe: charge.pieceJointe || '',
        description: charge.description || '',
        notes: charge.notes || '',
        modePaiement: charge.modePaiement || '',
        referenceVirement: charge.referenceVirement || ''
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
      const salaire = parseFloat(formData.salaire) || 0;
      const prime = parseFloat(formData.prime) || 0;
      const heuresSupplementaires = parseFloat(formData.heuresSupplementaires) || 0;
      const tauxHoraire = parseFloat(formData.tauxHoraire) || 0;
      const indemnites = parseFloat(formData.indemnites) || 0;
      
      const montantHS = heuresSupplementaires * tauxHoraire;
      const total = salaire + prime + montantHS + indemnites;

      const data = {
        ...formData,
        salaire,
        prime,
        heuresSupplementaires,
        tauxHoraire,
        indemnites,
        montantHS,
        total,
        modifieLe: Timestamp.now(),
        modifiePar: user.email
      };

      if (editingCharge) {
        // ============================================================
        // MODIFICATION D'UNE CHARGE EXISTANTE
        // ============================================================
        
        const isEspecesNow = formData.modePaiement === 'Espèces';
        const wasEspecesBefore = editingCharge.modePaiement === 'Espèces';
        
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
          doc(db, 'societe', societeId, 'chargesPersonnels', editingCharge.id),
          data
        );
        
        // 2. Gérer le paiement selon les cas
        if (wasEspecesBefore && !isEspecesNow) {
          // CAS 1: Était espèces → N'est plus espèces : SUPPRIMER le paiement
          if (existingPaiement) {
            batch.delete(existingPaiement.ref);
          }
        } else if (!wasEspecesBefore && isEspecesNow && total > 0) {
          // CAS 2: N'était pas espèces → Est maintenant espèces : CRÉER un paiement
          const paiementData = {
            type: 'chargePersonnel',
            relatedTo: 'chargePersonnel',
            category: 'chargePersonnel',
            montant: total,
            mode: 'Espèces',
            paymentMode: 'Espèces',
            moyen: 'Espèces',
            date: Timestamp.fromDate(new Date(formData.date + 'T12:00:00')),
            timestamp: Timestamp.now(),
            description: `Charge Personnel: ${formData.employe} - ${formData.poste || 'Personnel'}`,
            employe: formData.employe,
            referenceCharge: editingCharge.id,
            creeLe: Timestamp.now(),
            creePar: user.email
          };
          
          if (formData.referenceVirement) {
            paiementData.reference = formData.referenceVirement;
          }
          
          const paiementRef = doc(collection(db, 'societe', societeId, 'paiements'));
          batch.set(paiementRef, paiementData);
        } else if (wasEspecesBefore && isEspecesNow && total > 0) {
          // CAS 3: Était espèces → Est toujours espèces : METTRE À JOUR le paiement
          if (existingPaiement) {
            const paiementData = {
              montant: total,
              date: Timestamp.fromDate(new Date(formData.date + 'T12:00:00')),
              description: `Charge Personnel: ${formData.employe} - ${formData.poste || 'Personnel'}`,
              employe: formData.employe,
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
              type: 'chargePersonnel',
              relatedTo: 'chargePersonnel',
              category: 'chargePersonnel',
              montant: total,
              mode: 'Espèces',
              paymentMode: 'Espèces',
              moyen: 'Espèces',
              date: Timestamp.fromDate(new Date(formData.date + 'T12:00:00')),
              timestamp: Timestamp.now(),
              description: `Charge Personnel: ${formData.employe} - ${formData.poste || 'Personnel'}`,
              employe: formData.employe,
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
        } else if (wasEspecesBefore && isEspecesNow && total === 0) {
          // CAS 4: Montant devient 0 : SUPPRIMER le paiement
          if (existingPaiement) {
            batch.delete(existingPaiement.ref);
          }
        }
        // CAS 5: N'était pas espèces → N'est toujours pas espèces : rien à faire
        
        await batch.commit();
        setCharges(charges.map(c => c.id === editingCharge.id ? { ...c, ...data } : c));
        
      } else {
        // ============================================================
        // NOUVELLE CHARGE
        // ============================================================
        data.creeLe = Timestamp.now();
        data.creePar = user.email;
        
        const isEspeces = formData.modePaiement === 'Espèces';
        
        if (isEspeces && total > 0) {
          // Utiliser un batch pour créer les deux documents en même temps
          const batch = writeBatch(db);
          
          // 1. Créer la charge du personnel
          const chargeRef = doc(collection(db, 'societe', societeId, 'chargesPersonnels'));
          batch.set(chargeRef, data);
          
          // 2. Créer le paiement dans la caisse
          const paiementData = {
            type: 'chargePersonnel',
            relatedTo: 'chargePersonnel',
            category: 'chargePersonnel',
            montant: total,
            mode: 'Espèces',
            paymentMode: 'Espèces',
            moyen: 'Espèces',
            date: Timestamp.fromDate(new Date(formData.date + 'T12:00:00')),
            timestamp: Timestamp.now(),
            description: `Charge Personnel: ${formData.employe} - ${formData.poste || 'Personnel'}`,
            employe: formData.employe,
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
          // Pas de paiement en espèces, juste créer la charge
          const docRef = await addDoc(
            collection(db, 'societe', societeId, 'chargesPersonnels'),
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
      batch.delete(doc(db, 'societe', societeId, 'chargesPersonnels', id));
      
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
  const totalCharges = filteredCharges.reduce((sum, c) => sum + (c.total || 0), 0);
  const nombreEmployes = [...new Set(filteredCharges.map(c => c.employe))].length;
  const totalEspeces = filteredCharges
    .filter(c => c.modePaiement === 'Espèces')
    .reduce((sum, c) => sum + (c.total || 0), 0);

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
          <PersonIcon sx={{ fontSize: 40, color: '#667eea' }} />
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b' }}>
            Charges du Personnel
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
            {(filters.searchText || filters.dateDebut || filters.dateFin || filters.poste || filters.typeDocument) && (
              <Chip label="Actifs" size="small" color="primary" />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Rechercher par employé, CIN, poste, description..."
                value={filters.searchText}
                onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: '#64748b' }} />
                }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Poste</InputLabel>
                <Select
                  value={filters.poste}
                  onChange={(e) => setFilters({ ...filters, poste: e.target.value })}
                  label="Poste"
                >
                  <MenuItem value="">Tous les postes</MenuItem>
                  {typesPostes.map(poste => (
                    <MenuItem key={poste} value={poste}>{poste}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

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

            <Grid item xs={12} md={4}>
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

            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleResetFilters}
                sx={{ height: '56px' }}
              >
                Réinitialiser
              </Button>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Statistiques */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2.5, background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Total Charges</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
              {totalCharges.toFixed(2)} MAD
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2.5, background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Employés</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
              {nombreEmployes}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2.5, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Total Espèces</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
              {totalEspeces.toFixed(2)} MAD
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9, mt: 0.5, display: 'block' }}>
              💡 Déduit automatiquement de la caisse
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Tableau des charges */}
      <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#1e293b' }}>
            <TableRow>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Date</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Employé</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Poste</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Salaire</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Total</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mode Paiement</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCharges.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Aucune charge trouvée</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredCharges.map((charge) => (
                <TableRow key={charge.id} hover>
                  <TableCell>{charge.date}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{charge.employe}</TableCell>
                  <TableCell>
                    <Chip label={charge.poste || '-'} size="small" sx={{ bgcolor: '#e2e8f0' }} />
                  </TableCell>
                  <TableCell>{charge.salaire?.toFixed(2)} MAD</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>
                    {charge.total?.toFixed(2)} MAD
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={charge.modePaiement || 'Non spécifié'} 
                      size="small"
                      sx={{ 
                        bgcolor: charge.modePaiement === 'Espèces' ? '#dcfce7' : '#e2e8f0',
                        color: charge.modePaiement === 'Espèces' ? '#16a34a' : '#64748b',
                        fontWeight: 600
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDetails(charge)}
                      sx={{ color: '#667eea', mr: 1 }}
                    >
                      <VisibilityIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(charge)}
                      sx={{ color: '#06b6d4', mr: 1 }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(charge.id)}
                      sx={{ color: '#ef4444' }}
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
        <DialogTitle sx={{ fontWeight: 700, color: '#1e293b' }}>
          {editingCharge ? 'Modifier la charge' : 'Nouvelle charge du personnel'}
        </DialogTitle>
        <DialogContent>
          <Tabs
            value={currentTab}
            onChange={(e, newValue) => setCurrentTab(newValue)}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="👤 Informations employé" />
            <Tab label="💰 Rémunération" />
            <Tab label="📄 Documents" />
            <Tab label="💳 Paiement" />
          </Tabs>

          {/* Onglet 1 : Informations employé */}
          {currentTab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <TextField
                label="Nom de l'employé"
                value={formData.employe}
                onChange={(e) => setFormData({ ...formData, employe: e.target.value })}
                fullWidth
                required
                autoFocus
              />

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="CIN"
                    value={formData.cin}
                    onChange={(e) => setFormData({ ...formData, cin: e.target.value })}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Téléphone"
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    fullWidth
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
              />

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="N° Sécurité Sociale"
                    value={formData.numeroSecuriteSociale}
                    onChange={(e) => setFormData({ ...formData, numeroSecuriteSociale: e.target.value })}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
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
              </Grid>

              <TextField
                label="Date d'embauche"
                type="date"
                value={formData.dateEmbauche}
                onChange={(e) => setFormData({ ...formData, dateEmbauche: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                label="Description du poste"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                multiline
                rows={3}
                fullWidth
              />
            </Box>
          )}

          {/* Onglet 2 : Rémunération */}
          {currentTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Alert severity="info">
                Renseignez les éléments de rémunération. Le total sera calculé automatiquement.
              </Alert>
              
              <TextField
                label="Date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                label="Salaire de base"
                type="number"
                value={formData.salaire}
                onChange={(e) => setFormData({ ...formData, salaire: e.target.value })}
                fullWidth
                required
                InputProps={{ endAdornment: 'MAD' }}
              />

              <TextField
                label="Prime"
                type="number"
                value={formData.prime}
                onChange={(e) => setFormData({ ...formData, prime: e.target.value })}
                fullWidth
                InputProps={{ endAdornment: 'MAD' }}
              />

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Heures supplémentaires"
                    type="number"
                    value={formData.heuresSupplementaires}
                    onChange={(e) => setFormData({ ...formData, heuresSupplementaires: e.target.value })}
                    fullWidth
                    InputProps={{ endAdornment: 'h' }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Taux horaire"
                    type="number"
                    value={formData.tauxHoraire}
                    onChange={(e) => setFormData({ ...formData, tauxHoraire: e.target.value })}
                    fullWidth
                    InputProps={{ endAdornment: 'MAD/h' }}
                  />
                </Grid>
              </Grid>

              <TextField
                label="Indemnités diverses"
                type="number"
                value={formData.indemnites}
                onChange={(e) => setFormData({ ...formData, indemnites: e.target.value })}
                fullWidth
                InputProps={{ endAdornment: 'MAD' }}
              />

              <Paper sx={{ p: 2, bgcolor: '#f8fafc', mt: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Récapitulatif de la rémunération
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="body2">Salaire de base :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {(parseFloat(formData.salaire) || 0).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Prime :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {(parseFloat(formData.prime) || 0).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Heures supplémentaires :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {((parseFloat(formData.heuresSupplementaires) || 0) * (parseFloat(formData.tauxHoraire) || 0)).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Indemnités :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {(parseFloat(formData.indemnites) || 0).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <Grid item xs={6}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>Total :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body1" align="right" sx={{ fontWeight: 700, color: '#667eea' }}>
                      {(
                        (parseFloat(formData.salaire) || 0) +
                        (parseFloat(formData.prime) || 0) +
                        ((parseFloat(formData.heuresSupplementaires) || 0) * (parseFloat(formData.tauxHoraire) || 0)) +
                        (parseFloat(formData.indemnites) || 0)
                      ).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          )}

          {/* Onglet 3 : Documents */}
          {currentTab === 2 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Alert severity="info" icon={<DescriptionIcon />}>
                Documents justificatifs et pièces jointes
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
                    placeholder="Ex: BP-2025-001"
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
              <Alert severity="info" icon={<MoneyIcon />}>
                Mode de paiement (important pour la caisse)
              </Alert>
              
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

              {formData.modePaiement === 'Espèces' && (
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
                    <Typography variant="body2">Montant total :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" sx={{ fontWeight: 700 }}>
                      {(
                        (parseFloat(formData.salaire) || 0) +
                        (parseFloat(formData.prime) || 0) +
                        ((parseFloat(formData.heuresSupplementaires) || 0) * (parseFloat(formData.tauxHoraire) || 0)) +
                        (parseFloat(formData.indemnites) || 0)
                      ).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Mode de paiement :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" sx={{ fontWeight: 600 }}>
                      {formData.modePaiement || 'Non spécifié'}
                    </Typography>
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
            disabled={!formData.employe || !formData.salaire}
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
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                {selectedCharge.employe}
              </Typography>
              
              <Divider sx={{ my: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">CIN</Typography>
                  <Typography variant="body2">{selectedCharge.cin || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Téléphone</Typography>
                  <Typography variant="body2">{selectedCharge.telephone || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Poste</Typography>
                  <Typography variant="body2">{selectedCharge.poste || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">N° Sécu</Typography>
                  <Typography variant="body2">{selectedCharge.numeroSecuriteSociale || '-'}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Adresse</Typography>
                  <Typography variant="body2">{selectedCharge.adresse || '-'}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Rémunération</Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}><Typography variant="body2">Salaire :</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2" align="right">{selectedCharge.salaire?.toFixed(2)} MAD</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2">Prime :</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2" align="right">{selectedCharge.prime?.toFixed(2)} MAD</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2">Heures supp. :</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2" align="right">{selectedCharge.montantHS?.toFixed(2)} MAD</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2">Indemnités :</Typography></Grid>
                <Grid item xs={6}><Typography variant="body2" align="right">{selectedCharge.indemnites?.toFixed(2)} MAD</Typography></Grid>
                <Grid item xs={12}><Divider /></Grid>
                <Grid item xs={6}><Typography variant="body1" sx={{ fontWeight: 700 }}>Total :</Typography></Grid>
                <Grid item xs={6}><Typography variant="body1" align="right" sx={{ fontWeight: 700, color: '#667eea' }}>{selectedCharge.total?.toFixed(2)} MAD</Typography></Grid>
              </Grid>

              {selectedCharge.modePaiement && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Paiement</Typography>
                  <Typography variant="body2">Mode : {selectedCharge.modePaiement}</Typography>
                  {selectedCharge.referenceVirement && (
                    <Typography variant="body2">Référence : {selectedCharge.referenceVirement}</Typography>
                  )}
                  {selectedCharge.modePaiement === 'Espèces' && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      💰 Ce montant a été déduit de la caisse
                    </Alert>
                  )}
                </>
              )}

              {selectedCharge.typeDocument && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Document</Typography>
                  <Typography variant="body2">Type : {selectedCharge.typeDocument}</Typography>
                  <Typography variant="body2">N° : {selectedCharge.numeroDocument || '-'}</Typography>
                  <Typography variant="body2">Date : {selectedCharge.dateDocument || '-'}</Typography>
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2">
                      Fichier : <a href={selectedCharge.pieceJointe} target="_blank" rel="noopener noreferrer">Voir</a>
                    </Typography>
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
// src/components/charges/ChargesPersonnels.js - Version Responsive avec intégration Caisse
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
  AccordionDetails,
  Card,
  CardContent,
  CardActions,
  Stack,
  useMediaQuery,
  useTheme,
  Drawer,
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
  ExpandMore as ExpandMoreIcon,
  AttachMoney as MoneyIcon,
  Close as CloseIcon,
  Work as WorkIcon,
  Phone as PhoneIcon
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const [charges, setCharges] = useState([]);
  const [filteredCharges, setFilteredCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [selectedCharge, setSelectedCharge] = useState(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  
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

  // Compter les filtres actifs
  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;

  // Réinitialiser les filtres
  const handleResetFilters = () => {
    setFilters({
      searchText: '',
      dateDebut: '',
      dateFin: '',
      poste: '',
      typeDocument: ''
    });
  };

  // Réinitialiser le formulaire
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
    setEditingCharge(null);
    setCurrentTab(0);
  };

  // Calculer le montant total
  const calculerTotal = (data = formData) => {
    const salaire = parseFloat(data.salaire) || 0;
    const prime = parseFloat(data.prime) || 0;
    const heuresSupp = parseFloat(data.heuresSupplementaires) || 0;
    const tauxHoraire = parseFloat(data.tauxHoraire) || 0;
    const indemnites = parseFloat(data.indemnites) || 0;
    const montantHS = heuresSupp * tauxHoraire;
    return salaire + prime + montantHS + indemnites;
  };

  // Ouvrir le dialogue
  const handleOpenDialog = (charge = null) => {
    if (charge) {
      setEditingCharge(charge);
      setFormData({ ...charge });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  // Fermer le dialogue
  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  // Voir les détails
  const handleViewDetails = (charge) => {
    setSelectedCharge(charge);
    setDetailsDialogOpen(true);
  };

  // ========== FONCTION MODIFIÉE POUR INTÉGRATION CAISSE ==========
  const handleSave = async () => {
    try {
      const total = calculerTotal();
      const montantHS = (parseFloat(formData.heuresSupplementaires) || 0) * (parseFloat(formData.tauxHoraire) || 0);

      const chargeData = {
        ...formData,
        salaire: parseFloat(formData.salaire) || 0,
        prime: parseFloat(formData.prime) || 0,
        heuresSupplementaires: parseFloat(formData.heuresSupplementaires) || 0,
        tauxHoraire: parseFloat(formData.tauxHoraire) || 0,
        indemnites: parseFloat(formData.indemnites) || 0,
        montantHS,
        total,
        updatedAt: Timestamp.now(),
        updatedBy: user.uid
      };

      let chargeId;
      
      if (editingCharge) {
        // Mise à jour d'une charge existante
        await updateDoc(doc(db, 'societe', societeId, 'chargesPersonnels', editingCharge.id), chargeData);
        chargeId = editingCharge.id;
      } else {
        // Création d'une nouvelle charge
        chargeData.createdAt = Timestamp.now();
        chargeData.createdBy = user.uid;
        const docRef = await addDoc(collection(db, 'societe', societeId, 'chargesPersonnels'), chargeData);
        chargeId = docRef.id;
      }

      // ========== CRÉATION AUTOMATIQUE DU PAIEMENT POUR LA CAISSE ==========
      // Si un mode de paiement est spécifié, créer un enregistrement dans la collection "paiements"
      if (formData.modePaiement && formData.modePaiement !== '' && total > 0) {
        const paiementData = {
          type: 'chargePersonnel',  // Identifiant pour le Dashboard
          category: 'chargePersonnel',
          relatedTo: 'chargePersonnel',
          montant: total,
          mode: formData.modePaiement,
          moyen: formData.modePaiement,
          paymentMode: formData.modePaiement,
          typePaiement: formData.modePaiement,
          date: formData.date,
          timestamp: Timestamp.now(),
          description: `Charge personnel: ${formData.employe} - ${formData.poste || 'N/A'}`,
          reference: formData.referenceVirement || '',
          chargePersonnelId: chargeId,
          employe: formData.employe,
          poste: formData.poste || '',
          createdAt: Timestamp.now(),
          createdBy: user.uid
        };

        // Créer le document de paiement
        await addDoc(collection(db, 'societe', societeId, 'paiements'), paiementData);
      }

      // Recharger les charges
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

      handleCloseDialog();
    } catch (error) {
      console.error('Erreur enregistrement:', error);
      alert('Erreur lors de l\'enregistrement');
    }
  };

  // Supprimer
  const handleDelete = async (charge) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer la charge de ${charge.employe} ?`)) return;

    try {
      // Supprimer aussi les paiements liés
      const qPaiements = query(
        collection(db, 'societe', societeId, 'paiements'),
        where('chargePersonnelId', '==', charge.id)
      );
      const paiementsSnapshot = await getDocs(qPaiements);
      
      const batch = writeBatch(db);
      paiementsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Supprimer la charge
      batch.delete(doc(db, 'societe', societeId, 'chargesPersonnels', charge.id));
      
      await batch.commit();

      // Recharger les charges
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
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // Statistiques
  const stats = {
    total: filteredCharges.reduce((sum, c) => sum + (c.total || 0), 0),
    count: filteredCharges.length,
    salaires: filteredCharges.reduce((sum, c) => sum + (c.salaire || 0), 0),
    primes: filteredCharges.reduce((sum, c) => sum + (c.prime || 0), 0)
  };

  // Couleur par poste
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

  // Composant de filtres
  const FiltersContent = () => (
    <Box sx={{ p: isMobile ? 2 : 0 }}>
      {isMobile && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Filtres</Typography>
          <IconButton onClick={() => setFilterDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
      )}

      <Stack spacing={2}>
        <TextField
          label="Rechercher"
          value={filters.searchText}
          onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
          fullWidth
          InputProps={{
            endAdornment: <SearchIcon />
          }}
          placeholder="Nom, CIN, poste..."
        />
        
        <TextField
          label="Date début"
          type="date"
          value={filters.dateDebut}
          onChange={(e) => setFilters({ ...filters, dateDebut: e.target.value })}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
        
        <TextField
          label="Date fin"
          type="date"
          value={filters.dateFin}
          onChange={(e) => setFilters({ ...filters, dateFin: e.target.value })}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />
        
        <FormControl fullWidth>
          <InputLabel>Poste</InputLabel>
          <Select
            value={filters.poste}
            onChange={(e) => setFilters({ ...filters, poste: e.target.value })}
            label="Poste"
          >
            <MenuItem value="">Tous</MenuItem>
            {typesPostes.map(poste => (
              <MenuItem key={poste} value={poste}>{poste}</MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <FormControl fullWidth>
          <InputLabel>Type de document</InputLabel>
          <Select
            value={filters.typeDocument}
            onChange={(e) => setFilters({ ...filters, typeDocument: e.target.value })}
            label="Type de document"
          >
            <MenuItem value="">Tous</MenuItem>
            {typesDocuments.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {activeFiltersCount > 0 && (
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleResetFilters}
            fullWidth
          >
            Réinitialiser ({activeFiltersCount})
          </Button>
        )}
      </Stack>
    </Box>
  );

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Chargement...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      p: { xs: 1, sm: 2, md: 3 }
    }}>
      <Paper sx={{ 
        maxWidth: 1400, 
        margin: '0 auto',
        borderRadius: { xs: 2, sm: 3 },
        overflow: 'hidden'
      }}>
        {/* En-tête */}
        <Box sx={{ 
          background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
          color: 'white',
          p: { xs: 2, sm: 3 }
        }}>
          <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 700, mb: 1 }}>
            💼 Charges du Personnel
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            Gestion des salaires et charges sociales
          </Typography>
        </Box>

        {/* Statistiques */}
        <Box sx={{ p: { xs: 2, sm: 3 }, borderBottom: '2px solid #e2e8f0' }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5 }}>Total Charges</Typography>
                  <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 800 }}>
                    {stats.total.toFixed(2)} MAD
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: '#f8fafc' }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Nombre d'employés</Typography>
                  <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 700, color: '#06b6d4' }}>
                    {stats.count}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: '#f8fafc' }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Total Salaires</Typography>
                  <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 700, color: '#10b981' }}>
                    {stats.salaires.toFixed(2)} MAD
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: '#f8fafc' }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Total Primes</Typography>
                  <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 700, color: '#f59e0b' }}>
                    {stats.primes.toFixed(2)} MAD
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Actions et filtres */}
        <Box sx={{ 
          p: { xs: 2, sm: 3 },
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between'
        }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            sx={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              fontWeight: 700
            }}
            fullWidth={isMobile}
          >
            Nouvelle Charge
          </Button>

          {isMobile ? (
            <Badge badgeContent={activeFiltersCount} color="error">
              <Button
                variant="outlined"
                startIcon={<FilterListIcon />}
                onClick={() => setFilterDrawerOpen(true)}
                fullWidth
              >
                Filtres
              </Button>
            </Badge>
          ) : (
            <Box sx={{ minWidth: 300 }}>
              {FiltersContent()}
            </Box>
          )}
        </Box>

        {/* Table responsive */}
        {isDesktop ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Employé</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Poste</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Salaire</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Prime</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Total</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Mode paiement</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCharges.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Aucune charge trouvée</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCharges.map((charge) => (
                    <TableRow key={charge.id} hover>
                      <TableCell>
                        <Box>
                          <Typography sx={{ fontWeight: 600 }}>{charge.employe}</Typography>
                          {charge.cin && (
                            <Typography variant="caption" color="text.secondary">
                              CIN: {charge.cin}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={charge.poste || 'N/A'}
                          size="small"
                          sx={{
                            bgcolor: getPosteColor(charge.poste) + '20',
                            color: getPosteColor(charge.poste),
                            fontWeight: 600
                          }}
                        />
                      </TableCell>
                      <TableCell>{charge.date}</TableCell>
                      <TableCell align="right">{charge.salaire?.toFixed(2)} MAD</TableCell>
                      <TableCell align="right">{charge.prime?.toFixed(2)} MAD</TableCell>
                      <TableCell align="right">
                        <Typography sx={{ fontWeight: 700, color: '#667eea' }}>
                          {charge.total?.toFixed(2)} MAD
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {charge.modePaiement ? (
                          <Chip 
                            label={charge.modePaiement} 
                            size="small"
                            color={charge.modePaiement === 'Espèces' ? 'success' : 'default'}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">N/A</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton onClick={() => handleViewDetails(charge)} size="small">
                          <VisibilityIcon />
                        </IconButton>
                        <IconButton onClick={() => handleOpenDialog(charge)} size="small">
                          <EditIcon />
                        </IconButton>
                        <IconButton onClick={() => handleDelete(charge)} size="small" color="error">
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ p: { xs: 1, sm: 2 } }}>
            {filteredCharges.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">Aucune charge trouvée</Typography>
              </Box>
            ) : (
              filteredCharges.map((charge) => (
                <Card key={charge.id} sx={{ mb: 2 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {charge.employe}
                      </Typography>
                      <Chip
                        label={charge.poste || 'N/A'}
                        size="small"
                        sx={{
                          bgcolor: getPosteColor(charge.poste) + '20',
                          color: getPosteColor(charge.poste),
                          fontWeight: 600
                        }}
                      />
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {charge.date} {charge.cin && `• CIN: ${charge.cin}`}
                    </Typography>

                    <Divider sx={{ my: 1 }} />

                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">Salaire</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {charge.salaire?.toFixed(2)} MAD
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">Prime</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {charge.prime?.toFixed(2)} MAD
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">Total</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: '#667eea' }}>
                          {charge.total?.toFixed(2)} MAD
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">Mode paiement</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {charge.modePaiement ? (
                            <Chip 
                              label={charge.modePaiement} 
                              size="small"
                              color={charge.modePaiement === 'Espèces' ? 'success' : 'default'}
                            />
                          ) : (
                            'N/A'
                          )}
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                  <CardActions sx={{ justifyContent: 'flex-end', p: 1 }}>
                    <IconButton onClick={() => handleViewDetails(charge)} size="small">
                      <VisibilityIcon />
                    </IconButton>
                    <IconButton onClick={() => handleOpenDialog(charge)} size="small">
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDelete(charge)} size="small" color="error">
                      <DeleteIcon />
                    </IconButton>
                  </CardActions>
                </Card>
              ))
            )}
          </Box>
        )}
      </Paper>

      {/* Drawer pour les filtres sur mobile */}
      <Drawer
        anchor="bottom"
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '80vh'
          }
        }}
      >
        {FiltersContent()}
      </Drawer>

      {/* Dialog de formulaire avec tabs */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog}
        fullScreen={isMobile}
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : 2
          }
        }}
      >
        <DialogTitle sx={{ 
          fontWeight: 700,
          color: '#1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: { xs: 2, sm: 3 }
        }}>
          <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
            {editingCharge ? 'Modifier la charge' : 'Nouvelle charge'}
          </Typography>
          {isMobile && (
            <IconButton onClick={handleCloseDialog}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        
        <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Tabs 
            value={currentTab} 
            onChange={(e, v) => setCurrentTab(v)}
            variant={isMobile ? "scrollable" : "fullWidth"}
            scrollButtons={isMobile ? "auto" : false}
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
          >
            <Tab icon={<PersonIcon />} label="Employé" />
            <Tab icon={<MoneyIcon />} label="Rémunération" />
            <Tab icon={<DescriptionIcon />} label="Document" />
            <Tab icon={<MoneyIcon />} label="Paiement" />
          </Tabs>

          {/* Tab 0: Informations employé */}
          {currentTab === 0 && (
            <Stack spacing={2} sx={{ mt: 2 }}>
              <TextField
                label="Nom de l'employé *"
                value={formData.employe}
                onChange={(e) => setFormData({ ...formData, employe: e.target.value })}
                fullWidth
                required
              />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="CIN"
                    value={formData.cin}
                    onChange={(e) => setFormData({ ...formData, cin: e.target.value })}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
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

              <TextField
                label="N° Sécurité Sociale"
                value={formData.numeroSecuriteSociale}
                onChange={(e) => setFormData({ ...formData, numeroSecuriteSociale: e.target.value })}
                fullWidth
              />

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

              <TextField
                label="Date d'embauche"
                type="date"
                value={formData.dateEmbauche}
                onChange={(e) => setFormData({ ...formData, dateEmbauche: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          )}

          {/* Tab 1: Rémunération */}
          {currentTab === 1 && (
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Alert severity="info" icon={<MoneyIcon />}>
                Tous les montants en MAD (Dirhams Marocains)
              </Alert>

              <TextField
                label="Salaire de base *"
                type="number"
                value={formData.salaire}
                onChange={(e) => setFormData({ ...formData, salaire: e.target.value })}
                fullWidth
                required
                InputProps={{
                  endAdornment: <Typography variant="body2">MAD</Typography>
                }}
              />

              <TextField
                label="Prime"
                type="number"
                value={formData.prime}
                onChange={(e) => setFormData({ ...formData, prime: e.target.value })}
                fullWidth
                InputProps={{
                  endAdornment: <Typography variant="body2">MAD</Typography>
                }}
              />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Heures supplémentaires"
                    type="number"
                    value={formData.heuresSupplementaires}
                    onChange={(e) => setFormData({ ...formData, heuresSupplementaires: e.target.value })}
                    fullWidth
                    InputProps={{
                      endAdornment: <Typography variant="body2">h</Typography>
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Taux horaire"
                    type="number"
                    value={formData.tauxHoraire}
                    onChange={(e) => setFormData({ ...formData, tauxHoraire: e.target.value })}
                    fullWidth
                    InputProps={{
                      endAdornment: <Typography variant="body2">MAD/h</Typography>
                    }}
                  />
                </Grid>
              </Grid>

              <TextField
                label="Indemnités"
                type="number"
                value={formData.indemnites}
                onChange={(e) => setFormData({ ...formData, indemnites: e.target.value })}
                fullWidth
                InputProps={{
                  endAdornment: <Typography variant="body2">MAD</Typography>
                }}
              />

              <Paper sx={{ p: 2, bgcolor: '#f8fafc' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Calcul automatique
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">H. Supp. :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right" sx={{ fontWeight: 600 }}>
                      {((parseFloat(formData.heuresSupplementaires) || 0) * (parseFloat(formData.tauxHoraire) || 0)).toFixed(2)} MAD
                    </Typography>
                  </Grid>
                  <Grid item xs={12}><Divider /></Grid>
                  <Grid item xs={6}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>Total :</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body1" align="right" sx={{ fontWeight: 700, color: '#667eea' }}>
                      {calculerTotal().toFixed(2)} MAD
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              <TextField
                label="Date de la charge"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          )}

          {/* Tab 2: Document */}
          {currentTab === 2 && (
            <Stack spacing={2} sx={{ mt: 2 }}>
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

              <TextField
                label="Numéro du document"
                value={formData.numeroDocument}
                onChange={(e) => setFormData({ ...formData, numeroDocument: e.target.value })}
                fullWidth
              />

              <TextField
                label="Date du document"
                type="date"
                value={formData.dateDocument}
                onChange={(e) => setFormData({ ...formData, dateDocument: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                label="Pièce jointe (URL)"
                value={formData.pieceJointe}
                onChange={(e) => setFormData({ ...formData, pieceJointe: e.target.value })}
                fullWidth
                placeholder="https://..."
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />

              <TextField
                label="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Stack>
          )}

          {/* Tab 3: Paiement - IMPORTANT POUR LA CAISSE */}
          {currentTab === 3 && (
            <Stack spacing={2} sx={{ mt: 2 }}>
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
                      {calculerTotal().toFixed(2)} MAD
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
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ 
          p: { xs: 2, sm: 3 }, 
          pt: 2,
          flexDirection: { xs: 'column-reverse', sm: 'row' },
          gap: { xs: 1, sm: 0 }
        }}>
          <Button 
            onClick={handleCloseDialog}
            fullWidth={isMobile}
          >
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!formData.employe || !formData.salaire}
            fullWidth={isMobile}
            sx={{ 
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              ml: { sm: 1 }
            }}
          >
            {editingCharge ? 'Modifier' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue de détails */}
      <Dialog 
        open={detailsDialogOpen} 
        onClose={() => setDetailsDialogOpen(false)}
        fullScreen={isMobile}
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : 2
          }
        }}
      >
        <DialogTitle sx={{ 
          fontWeight: 700, 
          color: '#1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: { xs: 2, sm: 3 }
        }}>
          <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
            Détails de la charge
          </Typography>
          {isMobile && (
            <IconButton onClick={() => setDetailsDialogOpen(false)}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        
        <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
          {selectedCharge && (
            <Box sx={{ mt: 1 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Chip
                  icon={<PersonIcon />}
                  label={selectedCharge.poste || 'Non spécifié'}
                  sx={{
                    bgcolor: getPosteColor(selectedCharge.poste) + '20',
                    color: getPosteColor(selectedCharge.poste),
                    fontWeight: 700
                  }}
                />
              </Stack>

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
                    <Typography variant="body2" sx={{ mt: 0.5 }}>Référence : {selectedCharge.referenceVirement}</Typography>
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
                  <Typography variant="body2" sx={{ mt: 0.5 }}>N° : {selectedCharge.numeroDocument || '-'}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>Date : {selectedCharge.dateDocument || '-'}</Typography>
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
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
        
        <DialogActions sx={{ p: { xs: 2, sm: 3 }, pt: 1 }}>
          <Button 
            onClick={() => setDetailsDialogOpen(false)}
            fullWidth={isMobile}
          >
            Fermer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
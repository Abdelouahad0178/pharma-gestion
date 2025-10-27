// src/components/charges/ChargesDivers.js - Version Responsive - PC, Tablette, Mobile
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
  AccordionDetails,
  Card,
  CardContent,
  CardActions,
  Stack,
  useMediaQuery,
  useTheme,
  Drawer,
  Badge,
  Snackbar
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
  ExpandMore as ExpandMoreIcon,
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
  writeBatch
} from 'firebase/firestore';
import { useUserRole } from '../../contexts/UserRoleContext';

export default function ChargesDivers() {
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
  
  // État pour les notifications
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'success' // 'success', 'error', 'info', 'warning'
  });

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

  // Fonction pour afficher une notification
  const showNotification = (message, severity = 'success') => {
    setNotification({
      open: true,
      message,
      severity
    });
  };

  // Fermer la notification
  const handleCloseNotification = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setNotification({ ...notification, open: false });
  };

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
        showNotification('Erreur lors du chargement des charges', 'error');
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
        (charge.libelle?.toLowerCase().includes(searchLower)) ||
        (charge.fournisseur?.toLowerCase().includes(searchLower)) ||
        (charge.description?.toLowerCase().includes(searchLower)) ||
        (charge.numeroFacture?.toLowerCase().includes(searchLower)) ||
        (charge.numeroDocument?.toLowerCase().includes(searchLower))
      );
    }

    if (filters.dateDebut) {
      result = result.filter(charge => charge.date >= filters.dateDebut);
    }

    if (filters.dateFin) {
      result = result.filter(charge => charge.date <= filters.dateFin);
    }

    if (filters.categorie) {
      result = result.filter(charge => charge.categorie === filters.categorie);
    }

    if (filters.statut) {
      result = result.filter(charge => charge.statut === filters.statut);
    }

    if (filters.typeDocument) {
      result = result.filter(charge => charge.typeDocument === filters.typeDocument);
    }

    setFilteredCharges(result);
  }, [filters, charges]);

  // Compter les filtres actifs
  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;

  // Fonctions utilitaires
  const getCategorieColor = (cat) => {
    const colors = {
      'Loyer': '#8b5cf6',
      'Électricité': '#eab308',
      'Eau': '#3b82f6',
      'Téléphone': '#06b6d4',
      'Internet': '#6366f1',
      'Assurance': '#14b8a6',
      'Taxes': '#f59e0b',
      'Fournitures': '#84cc16',
      'Maintenance': '#f97316',
      'Transport': '#ec4899',
      'Marketing': '#a855f7',
      'Formation': '#10b981',
      'Autre': '#64748b'
    };
    return colors[cat] || '#64748b';
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
    setEditingCharge(null);
    setCurrentTab(0);
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


  // Enregistrer - VERSION MODIFIÉE AVEC INTÉGRATION CAISSE ET NOTIFICATIONS
  const handleSave = async () => {
    try {
      const chargeData = {
        ...formData,
        montant: parseFloat(formData.montant),
        updatedAt: Timestamp.now(),
        updatedBy: user.uid
      };

      let chargeId;  // Stocker l'ID de la charge pour créer le paiement lié
      let isNewCharge = !editingCharge;
      
      if (editingCharge) {
        // Mise à jour d'une charge existante
        await updateDoc(doc(db, 'societe', societeId, 'chargesDivers', editingCharge.id), chargeData);
        chargeId = editingCharge.id;
        showNotification('✅ Charge modifiée avec succès', 'success');
      } else {
        // Création d'une nouvelle charge
        chargeData.createdAt = Timestamp.now();
        chargeData.createdBy = user.uid;
        const docRef = await addDoc(collection(db, 'societe', societeId, 'chargesDivers'), chargeData);
        chargeId = docRef.id;  // Récupérer l'ID du nouveau document
      }

      // ========== INTÉGRATION CAISSE : CRÉATION AUTOMATIQUE DU PAIEMENT ==========
      // Si un mode de paiement est spécifié et le statut est "Payé",
      // créer automatiquement un enregistrement dans la collection "paiements"
      if (formData.modePaiement && 
          formData.modePaiement !== '' && 
          formData.statut === 'Payé' && 
          parseFloat(formData.montant) > 0) {
        
        const paiementData = {
          // Identifiants pour le Dashboard (permet de reconnaître ce type de paiement)
          type: 'chargeDiverse',
          category: 'chargeDiverse',
          relatedTo: 'chargeDiverse',
          
          // Montant et mode de paiement (Dashboard les utilise pour calculer la caisse)
          montant: parseFloat(formData.montant),
          mode: formData.modePaiement,
          moyen: formData.modePaiement,
          paymentMode: formData.modePaiement,
          typePaiement: formData.modePaiement,
          
          // Dates
          date: formData.date,
          timestamp: Timestamp.now(),
          
          // Description et référence
          description: `Charge diverse: ${formData.categorie || 'N/A'} - ${formData.libelle || 'N/A'}`,
          reference: formData.referenceVirement || '',
          
          // Lien vers la charge originale (pour suppression en cascade)
          chargeDiverseId: chargeId,
          
          // Informations supplémentaires
          categorie: formData.categorie || '',
          libelle: formData.libelle || '',
          fournisseur: formData.fournisseur || '',
          
          // Métadonnées
          createdAt: Timestamp.now(),
          createdBy: user.uid
        };

        // Créer le document de paiement dans la collection "paiements"
        await addDoc(collection(db, 'societe', societeId, 'paiements'), paiementData);
        
        console.log('✅ Paiement créé automatiquement pour la charge diverse');
        
        // Notification spécifique pour nouvelle charge avec paiement
        if (isNewCharge) {
          if (formData.modePaiement === 'Espèces') {
            showNotification(`✅ Charge créée avec succès ! Le montant de ${parseFloat(formData.montant).toFixed(2)} MAD a été déduit de la caisse`, 'success');
          } else {
            showNotification(`✅ Charge créée avec succès ! Paiement ${formData.modePaiement} enregistré`, 'success');
          }
        }
      } else if (isNewCharge) {
        // Notification pour nouvelle charge sans paiement
        showNotification('✅ Charge créée avec succès', 'success');
      }
      // ===========================================================================

      // Recharger les charges
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

      handleCloseDialog();
    } catch (error) {
      console.error('Erreur enregistrement:', error);
      showNotification('❌ Erreur lors de l\'enregistrement de la charge', 'error');
    }
  };

  // Supprimer - VERSION MODIFIÉE AVEC SUPPRESSION DES PAIEMENTS LIÉS
  const handleDelete = async (charge) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette charge ?')) return;

    try {
      // ========== SUPPRESSION DES PAIEMENTS LIÉS ==========
      // Supprimer aussi les paiements liés à cette charge
      const qPaiements = query(
        collection(db, 'societe', societeId, 'paiements'),
        where('chargeDiverseId', '==', charge.id)
      );
      const paiementsSnapshot = await getDocs(qPaiements);
      
      // Utiliser un batch pour supprimer tout atomiquement
      const batch = writeBatch(db);
      
      // Supprimer tous les paiements liés
      paiementsSnapshot.docs.forEach(paiementDoc => {
        batch.delete(paiementDoc.ref);
      });
      
      // Supprimer la charge
      batch.delete(doc(db, 'societe', societeId, 'chargesDivers', charge.id));
      
      // Exécuter toutes les suppressions
      await batch.commit();
      
      console.log('✅ Charge et paiements liés supprimés');
      showNotification('✅ Charge supprimée avec succès', 'success');
      // ====================================================

      // Recharger les charges
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
      console.error('Erreur suppression:', error);
      showNotification('❌ Erreur lors de la suppression', 'error');
    }
  };

  // Statistiques
  const stats = {
    total: filteredCharges.reduce((sum, c) => sum + (c.montant || 0), 0),
    count: filteredCharges.length,
    paye: filteredCharges.filter(c => c.statut === 'Payé').length,
    enAttente: filteredCharges.filter(c => c.statut === 'En attente').length
  };

  // Composant de filtres (pour drawer sur mobile)
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
          label="Recherche"
          placeholder="Libellé, fournisseur, N° facture..."
          value={filters.searchText}
          onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
          fullWidth
          size="small"
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
          }}
        />

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Date début"
              type="date"
              value={filters.dateDebut}
              onChange={(e) => setFilters({ ...filters, dateDebut: e.target.value })}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Date fin"
              type="date"
              value={filters.dateFin}
              onChange={(e) => setFilters({ ...filters, dateFin: e.target.value })}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>

        <FormControl fullWidth size="small">
          <InputLabel>Catégorie</InputLabel>
          <Select
            value={filters.categorie}
            onChange={(e) => setFilters({ ...filters, categorie: e.target.value })}
            label="Catégorie"
          >
            <MenuItem value="">Toutes</MenuItem>
            {categories.map(cat => (
              <MenuItem key={cat} value={cat}>{cat}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel>Statut</InputLabel>
          <Select
            value={filters.statut}
            onChange={(e) => setFilters({ ...filters, statut: e.target.value })}
            label="Statut"
          >
            <MenuItem value="">Tous</MenuItem>
            {statuts.map(stat => (
              <MenuItem key={stat} value={stat}>{stat}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel>Type document</InputLabel>
          <Select
            value={filters.typeDocument}
            onChange={(e) => setFilters({ ...filters, typeDocument: e.target.value })}
            label="Type document"
          >
            <MenuItem value="">Tous</MenuItem>
            {typesDocuments.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          startIcon={<ClearIcon />}
          onClick={handleResetFilters}
          fullWidth
          sx={{ mt: 1 }}
        >
          Réinitialiser
        </Button>
      </Stack>
    </Box>
  );

  // Affichage en carte pour mobile/tablette
  const ChargeCard = ({ charge }) => (
    <Card sx={{ mb: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
              <Chip
                label={charge.categorie}
                size="small"
                sx={{
                  bgcolor: getCategorieColor(charge.categorie) + '20',
                  color: getCategorieColor(charge.categorie),
                  fontWeight: 600,
                  mb: 0.5
                }}
              />
              <Chip
                label={charge.statut || 'Payé'}
                size="small"
                sx={{
                  bgcolor: getStatutColor(charge.statut) + '20',
                  color: getStatutColor(charge.statut),
                  fontWeight: 600,
                  mb: 0.5
                }}
              />
            </Stack>
            
            <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.5 }}>
              {charge.libelle}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {charge.date}
              {charge.fournisseur && ` • ${charge.fournisseur}`}
            </Typography>
            
            <Typography variant="h6" sx={{ color: '#667eea', fontWeight: 700 }}>
              {charge.montant?.toFixed(2)} MAD
            </Typography>
          </Box>
        </Box>
      </CardContent>
      
      <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
        <IconButton 
          size="small" 
          onClick={() => handleViewDetails(charge)}
          sx={{ color: '#667eea' }}
        >
          <VisibilityIcon />
        </IconButton>
        <IconButton 
          size="small" 
          onClick={() => handleOpenDialog(charge)}
          sx={{ color: '#f59e0b' }}
        >
          <EditIcon />
        </IconButton>
        <IconButton 
          size="small" 
          onClick={() => handleDelete(charge)}
          sx={{ color: '#ef4444' }}
        >
          <DeleteIcon />
        </IconButton>
      </CardActions>
    </Card>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Typography>Chargement...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      p: { xs: 1, sm: 2, md: 3 },
      maxWidth: '1400px',
      mx: 'auto'
    }}>
      {/* En-tête responsive */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 2,
        mb: 3 
      }}>
        <Box>
          <Typography 
            variant={isMobile ? "h5" : "h4"} 
            sx={{ 
              fontWeight: 800,
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 0.5
            }}
          >
            Charges Diverses
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gérez toutes vos charges et dépenses
          </Typography>
        </Box>
        
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          fullWidth={isMobile}
          sx={{ 
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            fontWeight: 600,
            px: 3,
            py: 1.5,
            '&:hover': {
              background: 'linear-gradient(135deg, #5568d3, #6941a0)'
            }
          }}
        >
          Nouvelle charge
        </Button>
      </Box>

      {/* Statistiques */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ 
            p: 2, 
            background: 'linear-gradient(135deg, #667eea20, #764ba220)',
            border: '1px solid #667eea40'
          }}>
            <Typography variant="caption" color="text.secondary">Total</Typography>
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700, color: '#667eea' }}>
              {stats.total.toFixed(2)}
            </Typography>
            <Typography variant="caption">MAD</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ p: 2, bgcolor: '#f8fafc' }}>
            <Typography variant="caption" color="text.secondary">Nombre</Typography>
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
              {stats.count}
            </Typography>
            <Typography variant="caption">charges</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ p: 2, bgcolor: '#f0fdf4' }}>
            <Typography variant="caption" color="text.secondary">Payées</Typography>
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700, color: '#10b981' }}>
              {stats.paye}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ p: 2, bgcolor: '#fffbeb' }}>
            <Typography variant="caption" color="text.secondary">En attente</Typography>
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700, color: '#f59e0b' }}>
              {stats.enAttente}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filtres - Desktop */}
      {isDesktop && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Filtres</Typography>
            {activeFiltersCount > 0 && (
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={handleResetFilters}
              >
                Réinitialiser ({activeFiltersCount})
              </Button>
            )}
          </Box>
          <FiltersContent />
        </Paper>
      )}

      {/* Filtres - Mobile/Tablette (Button) */}
      {!isDesktop && (
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setFilterDrawerOpen(true)}
            fullWidth
            sx={{ justifyContent: 'flex-start' }}
          >
            <Badge badgeContent={activeFiltersCount} color="primary" sx={{ ml: 1, mr: 'auto' }}>
              Filtres
            </Badge>
          </Button>
        </Box>
      )}

      {/* Drawer pour filtres mobile */}
      <Drawer
        anchor="right"
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        PaperProps={{
          sx: { width: isMobile ? '85%' : '400px' }
        }}
      >
        <FiltersContent />
      </Drawer>

      {/* Liste des charges - Responsive */}
      {!isDesktop ? (
        // Vue Mobile/Tablette - Cartes
        <Box>
          {filteredCharges.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                Aucune charge trouvée
              </Typography>
            </Paper>
          ) : (
            filteredCharges.map(charge => (
              <ChargeCard key={charge.id} charge={charge} />
            ))
          )}
        </Box>
      ) : (
        // Vue Desktop - Tableau
        <TableContainer component={Paper} sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <Table>
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Catégorie</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Libellé</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Fournisseur</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Montant</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Statut</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCharges.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      Aucune charge trouvée
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCharges.map((charge) => (
                  <TableRow key={charge.id} hover>
                    <TableCell>{charge.date}</TableCell>
                    <TableCell>
                      <Chip
                        label={charge.categorie}
                        size="small"
                        sx={{
                          bgcolor: getCategorieColor(charge.categorie) + '20',
                          color: getCategorieColor(charge.categorie),
                          fontWeight: 600
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{charge.libelle}</TableCell>
                    <TableCell>{charge.fournisseur || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#667eea' }}>
                      {charge.montant?.toFixed(2)} MAD
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
                        onClick={() => handleViewDetails(charge)}
                        sx={{ color: '#667eea' }}
                      >
                        <VisibilityIcon />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        onClick={() => handleOpenDialog(charge)}
                        sx={{ color: '#f59e0b' }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        onClick={() => handleDelete(charge)}
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
      )}

      {/* Dialogue de création/modification responsive */}
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
          background: 'linear-gradient(135deg, #667eea20, #764ba220)',
          p: { xs: 2, sm: 3 },
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
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
          {/* Tabs pour organiser le formulaire */}
          <Tabs 
            value={currentTab} 
            onChange={(e, v) => setCurrentTab(v)}
            sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
            variant={isMobile ? "fullWidth" : "standard"}
          >
            <Tab label="Informations" />
            <Tab label="Fournisseur" />
            <Tab label="Document" />
            <Tab label="Paiement" />
          </Tabs>

          {/* Onglet 1: Informations principales */}
          {currentTab === 0 && (
            <Stack spacing={2}>
              <FormControl fullWidth required>
                <InputLabel>Catégorie</InputLabel>
                <Select
                  value={formData.categorie}
                  onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                  label="Catégorie"
                >
                  {categories.map(cat => (
                    <MenuItem key={cat} value={cat}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: getCategorieColor(cat)
                          }}
                        />
                        {cat}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Libellé"
                value={formData.libelle}
                onChange={(e) => setFormData({ ...formData, libelle: e.target.value })}
                required
                fullWidth
                placeholder="Ex: Facture électricité janvier"
              />

              <TextField
                label="Montant (MAD)"
                type="number"
                value={formData.montant}
                onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
                required
                fullWidth
                inputProps={{ step: "0.01", min: "0" }}
              />

              <TextField
                label="Date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                fullWidth
                multiline
                rows={3}
                placeholder="Description détaillée de la charge..."
              />

              <TextField
                label="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                fullWidth
                multiline
                rows={2}
                placeholder="Notes internes..."
              />
            </Stack>
          )}

          {/* Onglet 2: Fournisseur */}
          {currentTab === 1 && (
            <Stack spacing={2}>
              <TextField
                label="Nom du fournisseur"
                value={formData.fournisseur}
                onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                fullWidth
                placeholder="Ex: Lydec, Maroc Telecom..."
              />

              <TextField
                label="Contact fournisseur"
                value={formData.contactFournisseur}
                onChange={(e) => setFormData({ ...formData, contactFournisseur: e.target.value })}
                fullWidth
                placeholder="Téléphone ou email"
              />

              <TextField
                label="Adresse fournisseur"
                value={formData.adresseFournisseur}
                onChange={(e) => setFormData({ ...formData, adresseFournisseur: e.target.value })}
                fullWidth
                multiline
                rows={2}
                placeholder="Adresse complète"
              />
            </Stack>
          )}

          {/* Onglet 3: Document */}
          {currentTab === 2 && (
            <Stack spacing={2}>
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
                label="N° Facture"
                value={formData.numeroFacture}
                onChange={(e) => setFormData({ ...formData, numeroFacture: e.target.value })}
                fullWidth
                placeholder="Ex: FAC-2024-001"
              />

              <TextField
                label="N° Document"
                value={formData.numeroDocument}
                onChange={(e) => setFormData({ ...formData, numeroDocument: e.target.value })}
                fullWidth
                placeholder="Autre numéro de référence"
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
                label="Date d'échéance"
                type="date"
                value={formData.dateEcheance}
                onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
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
            </Stack>
          )}

          {/* Onglet 4: Paiement */}
          {currentTab === 3 && (
            <Stack spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Statut</InputLabel>
                <Select
                  value={formData.statut}
                  onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                  label="Statut"
                >
                  {statuts.map(stat => (
                    <MenuItem key={stat} value={stat}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: getStatutColor(stat)
                          }}
                        />
                        {stat}
                      </Box>
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
                  ✅ Ce paiement en espèces sera automatiquement déduit de la caisse
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
            disabled={!formData.categorie || !formData.libelle || !formData.montant}
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

      {/* Dialogue de détails responsive */}
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
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
                <Chip
                  label={selectedCharge.categorie}
                  sx={{
                    bgcolor: getCategorieColor(selectedCharge.categorie) + '20',
                    color: getCategorieColor(selectedCharge.categorie),
                    fontWeight: 700,
                    mb: 0.5
                  }}
                />
                <Chip
                  label={selectedCharge.statut || 'Payé'}
                  sx={{
                    bgcolor: getStatutColor(selectedCharge.statut) + '20',
                    color: getStatutColor(selectedCharge.statut),
                    fontWeight: 700,
                    mb: 0.5
                  }}
                />
              </Stack>
              
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
                    <Typography variant="body2" sx={{ mt: 0.5 }}>Contact : {selectedCharge.contactFournisseur}</Typography>
                  )}
                  {selectedCharge.adresseFournisseur && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>Adresse : {selectedCharge.adresseFournisseur}</Typography>
                  )}
                </>
              )}

              {selectedCharge.typeDocument && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Document</Typography>
                  <Typography variant="body2">Type : {selectedCharge.typeDocument}</Typography>
                  {selectedCharge.numeroFacture && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>N° Facture : {selectedCharge.numeroFacture}</Typography>
                  )}
                  {selectedCharge.numeroDocument && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>N° Document : {selectedCharge.numeroDocument}</Typography>
                  )}
                  <Typography variant="body2" sx={{ mt: 0.5 }}>Date : {selectedCharge.dateDocument || '-'}</Typography>
                  {selectedCharge.dateEcheance && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>Échéance : {selectedCharge.dateEcheance}</Typography>
                  )}
                  {selectedCharge.pieceJointe && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
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
                    <Typography variant="body2" sx={{ mt: 0.5 }}>Référence : {selectedCharge.referenceVirement}</Typography>
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
        
        <DialogActions sx={{ p: { xs: 2, sm: 3 }, pt: 1 }}>
          <Button 
            onClick={() => setDetailsDialogOpen(false)}
            fullWidth={isMobile}
          >
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar pour les notifications */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification.severity}
          sx={{ width: '100%' }}
          variant="filled"
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
// src/components/CustomPermissionsManager.js
// VERSION FONCTIONNELLE - Logique inversée avec switch qui marche

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  FormGroup, 
  FormControlLabel, 
  Checkbox, 
  Typography,
  Box,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import permissions, { 
  PERMISSION_LABELS,
  PERMISSION_GROUPS,
  DOCTOR_ONLY_PERMISSIONS
} from '../utils/permissions';

const CustomPermissionsManager = ({ 
  open, 
  onClose, 
  userId, 
  userName, 
  societeId,
  onPermissionsUpdated 
}) => {
  // Liste des permissions RETIRÉES (ce que la vendeuse NE PEUT PAS faire)
  const [removedPermissions, setRemovedPermissions] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useRestrictions, setUseRestrictions] = useState(false);

  // Toutes les permissions disponibles (sauf celles réservées pharmacien)
  const allPermissions = permissions.docteur || [];
  const assignablePermissions = allPermissions.filter(p => 
    !DOCTOR_ONLY_PERMISSIONS.includes(p)
  );

  useEffect(() => {
    console.log('🔍 CustomPermissionsManager mount - open:', open, 'userId:', userId);
    if (open && userId) {
      loadUserPermissions();
    }
  }, [open, userId]);

  const loadUserPermissions = async () => {
    try {
      setInitializing(true);
      console.log('🔍 Chargement permissions pour:', userId);
      
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('🔍 User data:', userData);
        
        // Vérifier s'il y a des restrictions (permissions retirées)
        const restrictions = userData.removedPermissions || [];
        console.log('🔍 Restrictions trouvées:', restrictions);
        
        if (restrictions.length > 0) {
          // Il y a des restrictions personnalisées
          setUseRestrictions(true);
          setRemovedPermissions(restrictions);
          console.log('✅ Mode restrictions activé avec', restrictions.length, 'permissions retirées');
        } else {
          // Aucune restriction = accès complet
          setUseRestrictions(false);
          setRemovedPermissions([]);
          console.log('✅ Mode accès complet (aucune restriction)');
        }
      }
    } catch (error) {
      console.error('❌ Erreur chargement:', error);
      alert('Erreur: ' + error.message);
    } finally {
      setInitializing(false);
    }
  };

  // ✅ Gérer le retrait/ajout d'une permission
  const handlePermissionToggle = (permission, isChecked) => {
    console.log('🔍 Toggle permission:', permission, 'checked:', isChecked);
    
    if (isChecked) {
      // Permission COCHÉE = La vendeuse PEUT faire cette action
      // → On la RETIRE de la liste des permissions retirées
      setRemovedPermissions(prev => {
        const newRemoved = prev.filter(p => p !== permission);
        console.log('✅ Permission autorisée:', permission);
        console.log('   Nouvelles restrictions:', newRemoved);
        return newRemoved;
      });
    } else {
      // Permission DÉCOCHÉE = La vendeuse NE PEUT PAS faire cette action
      // → On l'AJOUTE à la liste des permissions retirées
      setRemovedPermissions(prev => {
        const newRemoved = [...new Set([...prev, permission])];
        console.log('❌ Permission retirée:', permission);
        console.log('   Nouvelles restrictions:', newRemoved);
        return newRemoved;
      });
    }
  };

  const handleSelectGroup = (groupPermissions, allowAll) => {
    console.log('🔍 Toggle groupe:', groupPermissions, 'allowAll:', allowAll);
    
    const assignableInGroup = groupPermissions.filter(p => 
      assignablePermissions.includes(p)
    );
    
    if (allowAll) {
      // Tout autoriser = retirer toutes ces permissions de la liste des retirées
      setRemovedPermissions(prev => {
        const newRemoved = prev.filter(p => !assignableInGroup.includes(p));
        console.log('✅ Groupe autorisé');
        return newRemoved;
      });
    } else {
      // Tout interdire = ajouter toutes ces permissions à la liste des retirées
      setRemovedPermissions(prev => {
        const newRemoved = [...new Set([...prev, ...assignableInGroup])];
        console.log('❌ Groupe interdit');
        return newRemoved;
      });
    }
  };

  const handleToggleRestrictions = (checked) => {
    console.log('🔍 Toggle restrictions switch:', checked);
    setUseRestrictions(checked);
    
    if (!checked) {
      // Désactiver les restrictions = tout autoriser
      setRemovedPermissions([]);
      console.log('✅ Accès complet activé - toutes restrictions supprimées');
    } else {
      console.log('🔒 Mode restrictions activé - permissions modifiables');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      console.log('💾 Sauvegarde...');
      console.log('   useRestrictions:', useRestrictions);
      console.log('   removedPermissions:', removedPermissions);
      
      const updateData = {
        removedPermissions: useRestrictions ? removedPermissions : [],
        lastPermissionUpdate: new Date(),
        updatedBy: 'doctor'
      };
      
      console.log('💾 Data à sauvegarder:', updateData);
      
      await updateDoc(doc(db, 'users', userId), updateData);

      console.log('✅ Sauvegarde réussie');

      if (onPermissionsUpdated) {
        onPermissionsUpdated();
      }

      alert('✅ Permissions sauvegardées avec succès !');
      onClose();
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    console.log('🔄 Reset vers accès complet');
    setRemovedPermissions([]);
    setUseRestrictions(false);
  };

  const getPermissionStats = () => {
    const totalAssignable = assignablePermissions.length;
    const allowed = totalAssignable - removedPermissions.length;
    const removed = removedPermissions.length;
    
    return {
      total: totalAssignable,
      allowed: allowed,
      removed: removed
    };
  };

  console.log('🔍 Render - open:', open, 'initializing:', initializing);

  if (!open) {
    console.log('❌ Dialog fermé (open=false)');
    return null;
  }

  if (initializing) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
          <Typography>Chargement des permissions...</Typography>
        </DialogContent>
      </Dialog>
    );
  }

  const stats = getPermissionStats();

  console.log('✅ Render dialog principal');
  console.log('   Stats:', stats);
  console.log('   useRestrictions:', useRestrictions);
  console.log('   removedPermissions:', removedPermissions);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      scroll="paper"
    >
      <DialogTitle>
        <Box>
          <Typography variant="h6" component="h2">
            Gérer les permissions de {userName}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            {useRestrictions 
              ? "🔒 Mode restrictions : décochez les actions que la vendeuse NE PEUT PAS faire"
              : "✅ Mode complet : la vendeuse a accès à tout (comme le pharmacien)"
            }
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            <Chip 
              label={`${stats.allowed} permissions autorisées`}
              color="success" 
              size="small" 
            />
            {useRestrictions && stats.removed > 0 && (
              <Chip 
                label={`${stats.removed} permissions retirées`}
                color="error"
                size="small" 
              />
            )}
            {!useRestrictions && (
              <Chip 
                label="Accès complet"
                color="primary"
                size="small" 
              />
            )}
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {/* Bascule mode restrictions - VERSION ULTRA VISIBLE */}
        <Box sx={{ 
          mb: 2, 
          p: 3, 
          border: '3px solid',
          borderColor: useRestrictions ? 'error.main' : 'success.main',
          borderRadius: 2,
          background: useRestrictions 
            ? 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)'
            : 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                {useRestrictions ? '🔒 Mode Restrictions' : '✅ Accès Complet'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {useRestrictions 
                  ? "La vendeuse peut tout faire SAUF ce que vous décochez"
                  : "La vendeuse peut TOUT faire (comme le pharmacien)"
                }
              </Typography>
            </Box>
            
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center',
              gap: 2,
              background: 'white',
              padding: '12px 20px',
              borderRadius: 3,
              border: '2px solid',
              borderColor: useRestrictions ? 'error.main' : 'success.main',
              boxShadow: 3,
              cursor: 'pointer'
            }}
            onClick={() => {
              const newValue = !useRestrictions;
              console.log('🔍 BOX clicked, toggle to:', newValue);
              handleToggleRestrictions(newValue);
            }}
            >
              <Typography variant="h6" sx={{ 
                fontWeight: 900,
                color: useRestrictions ? 'error.main' : 'success.main',
                minWidth: 140
              }}>
                {useRestrictions ? 'RESTRICTIONS' : 'ACCÈS COMPLET'}
              </Typography>
              <Switch
                checked={useRestrictions}
                onChange={(e) => {
                  console.log('🔍 Switch clicked, new value:', e.target.checked);
                  e.stopPropagation();
                  handleToggleRestrictions(e.target.checked);
                }}
                color={useRestrictions ? 'error' : 'success'}
                size="medium"
                sx={{
                  '& .MuiSwitch-thumb': {
                    width: 24,
                    height: 24,
                  },
                  '& .MuiSwitch-track': {
                    height: 16,
                  }
                }}
              />
            </Box>
          </Box>

          {/* Instructions selon le mode */}
          <Alert severity={useRestrictions ? 'warning' : 'success'} sx={{ mt: 2 }}>
            <Typography variant="body2">
              {useRestrictions ? (
                <>
                  <strong>⚠️ Comment ça marche :</strong> Toutes les checkboxes ci-dessous sont cochées par défaut.
                  <br/>
                  <strong>Décochez</strong> les actions que vous voulez INTERDIRE à la vendeuse.
                  <br/>
                  <strong>Exemple :</strong> Décochez "Modifier les achats" → elle ne pourra pas modifier.
                </>
              ) : (
                <>
                  <strong>✅ Mode actif :</strong> La vendeuse a accès à toutes les fonctionnalités (sauf admin/suppression).
                  <br/>
                  <strong>Pour restreindre :</strong> Cliquez sur le bouton ci-dessus pour activer le mode restrictions.
                </>
              )}
            </Typography>
          </Alert>
        </Box>

        {/* Permissions par groupe */}
        {Object.entries(PERMISSION_GROUPS).map(([groupName, groupPermissions]) => {
          const assignableInGroup = groupPermissions.filter(p => 
            assignablePermissions.includes(p)
          );
          
          if (assignableInGroup.length === 0) return null;
          
          // Compter les permissions AUTORISÉES (non retirées)
          const allowedInGroup = assignableInGroup.filter(p => 
            !removedPermissions.includes(p)
          ).length;
          const allAllowed = allowedInGroup === assignableInGroup.length;
          const someAllowed = allowedInGroup > 0 && allowedInGroup < assignableInGroup.length;

          return (
            <Accordion key={groupName} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="h6" component="h3" sx={{ flexGrow: 1, minWidth: '150px' }}>
                    {groupName}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip 
                      label={`${allowedInGroup}/${assignableInGroup.length} autorisées`}
                      size="small"
                      color={allAllowed ? 'success' : someAllowed ? 'warning' : 'error'}
                    />
                  </Box>
                  {useRestrictions && (
                    <Typography
                      component="span"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('🔍 Click groupe toggle');
                        handleSelectGroup(assignableInGroup, !allAllowed);
                      }}
                      sx={{
                        cursor: 'pointer',
                        color: 'primary.main',
                        textDecoration: 'underline',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        padding: '4px 8px',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'primary.main',
                        '&:hover': {
                          backgroundColor: 'primary.main',
                          color: 'white'
                        }
                      }}
                    >
                      {allAllowed ? '☐ Tout interdire' : '☑ Tout autoriser'}
                    </Typography>
                  )}
                </Box>
              </AccordionSummary>
              
              <AccordionDetails>
                <FormGroup>
                  {assignableInGroup.map(permission => {
                    const isAllowed = !removedPermissions.includes(permission);
                    const isDoctorOnly = DOCTOR_ONLY_PERMISSIONS.includes(permission);
                    
                    return (
                      <FormControlLabel
                        key={permission}
                        control={
                          <Checkbox
                            checked={isAllowed}
                            onChange={(e) => {
                              console.log('🔍 Checkbox click:', permission, e.target.checked);
                              handlePermissionToggle(permission, e.target.checked);
                            }}
                            color="primary"
                            disabled={!useRestrictions || isDoctorOnly}
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography 
                              variant="body2"
                              sx={{ 
                                fontWeight: isAllowed ? 'bold' : 'normal',
                                color: isAllowed ? 'success.main' : 'error.main',
                                textDecoration: isAllowed ? 'none' : 'line-through'
                              }}
                            >
                              {PERMISSION_LABELS[permission] || permission}
                            </Typography>
                            {isDoctorOnly && (
                              <Chip 
                                label="Pharmacien uniquement" 
                                size="small" 
                                color="error"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                            {isAllowed && useRestrictions && (
                              <Chip 
                                label="✅ Autorisée" 
                                size="small" 
                                color="success"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                            {!isAllowed && useRestrictions && (
                              <Chip 
                                label="🚫 Interdite" 
                                size="small" 
                                color="error"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                            {!useRestrictions && (
                              <Chip 
                                label="Par défaut ✓" 
                                size="small" 
                                color="default"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                          </Box>
                        }
                        sx={{ mb: 0.5 }}
                      />
                    );
                  })}
                </FormGroup>
              </AccordionDetails>
            </Accordion>
          );
        })}
        
        {/* Note de sécurité */}
        <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
          <Typography variant="body2">
            <strong>🔒 Sécurité :</strong> Les actions de suppression et l'administration 
            restent exclusives au pharmacien et ne peuvent pas être données aux vendeuses.
          </Typography>
        </Box>

        {/* Exemple pratique */}
        {useRestrictions && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
            <Typography variant="body2">
              <strong>💡 Exemple :</strong> Pour qu'une vendeuse puisse voir les achats mais PAS les modifier,
              laissez coché "Consulter les achats" et décochez "Modifier les achats".
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button 
          onClick={onClose} 
          disabled={saving}
        >
          Annuler
        </Button>
        <Button 
          onClick={handleReset} 
          color="warning" 
          disabled={saving}
        >
          Donner accès complet
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={saving}
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder les permissions'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomPermissionsManager;
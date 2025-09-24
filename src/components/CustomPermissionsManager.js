// src/components/CustomPermissionsManager.js
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
  Divider,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel as MuiFormControlLabel
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import permissions, { 
  ASSIGNABLE_PERMISSIONS, 
  PERMISSION_LABELS,
  PERMISSION_GROUPS
} from '../utils/permissions';

const CustomPermissionsManager = ({ 
  open, 
  onClose, 
  userId, 
  userName, 
  societeId,
  onPermissionsUpdated 
}) => {
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState('vendeuse');
  
  // NOUVEAU : Mode personnalisé vs permissions par défaut
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);

  useEffect(() => {
    if (open && userId) {
      loadUserPermissions();
    }
  }, [open, userId]);

  const loadUserPermissions = async () => {
    try {
      setInitializing(true);
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserRole(userData.role || 'vendeuse');
        
        // NOUVELLE LOGIQUE : Vérifier si l'utilisateur a des permissions personnalisées
        const customPermissions = userData.customPermissions || [];
        const hasCustomPermissions = customPermissions.length > 0;
        
        if (hasCustomPermissions) {
          // L'utilisateur a des permissions personnalisées -> les utiliser
          setUseCustomPermissions(true);
          setSelectedPermissions(customPermissions.filter(p => ASSIGNABLE_PERMISSIONS.includes(p)));
        } else {
          // L'utilisateur utilise les permissions par défaut
          setUseCustomPermissions(false);
          const defaultPermissions = permissions[userData.role] || permissions.vendeuse || [];
          setSelectedPermissions(defaultPermissions.filter(p => ASSIGNABLE_PERMISSIONS.includes(p)));
        }
      } else {
        // Utilisateur n'existe pas -> permissions par défaut vendeuse
        setUserRole('vendeuse');
        setUseCustomPermissions(false);
        setSelectedPermissions((permissions.vendeuse || []).filter(p => ASSIGNABLE_PERMISSIONS.includes(p)));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des permissions:', error);
      setUserRole('vendeuse');
      setUseCustomPermissions(false);
      setSelectedPermissions((permissions.vendeuse || []).filter(p => ASSIGNABLE_PERMISSIONS.includes(p)));
    } finally {
      setInitializing(false);
    }
  };

  const handlePermissionChange = (permission, checked) => {
    if (checked) {
      setSelectedPermissions(prev => [...new Set([...prev, permission])]);
    } else {
      setSelectedPermissions(prev => prev.filter(p => p !== permission));
    }
  };

  const handleSelectGroup = (groupPermissions, selectAll) => {
    const assignableGroupPermissions = groupPermissions.filter(p => 
      ASSIGNABLE_PERMISSIONS.includes(p)
    );
    
    if (selectAll) {
      setSelectedPermissions(prev => [...new Set([...prev, ...assignableGroupPermissions])]);
    } else {
      setSelectedPermissions(prev => prev.filter(p => !assignableGroupPermissions.includes(p)));
    }
  };

  // NOUVELLE FONCTION : Basculer entre permissions par défaut et personnalisées
  const handleToggleCustomPermissions = (useCustom) => {
    setUseCustomPermissions(useCustom);
    
    if (useCustom) {
      // Passer en mode personnalisé : garder les permissions actuelles
      // (ne rien changer aux permissions sélectionnées)
    } else {
      // Revenir aux permissions par défaut
      const defaultPermissions = permissions[userRole] || permissions.vendeuse || [];
      setSelectedPermissions(defaultPermissions.filter(p => ASSIGNABLE_PERMISSIONS.includes(p)));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Filtrer pour ne garder que les permissions assignables
      const validPermissions = selectedPermissions.filter(p => 
        ASSIGNABLE_PERMISSIONS.includes(p)
      );
      
      let updateData;
      
      if (useCustomPermissions) {
        // Mode personnalisé : sauvegarder TOUTES les permissions sélectionnées
        updateData = {
          customPermissions: validPermissions,
          lastPermissionUpdate: new Date(),
          updatedBy: 'doctor'
        };
      } else {
        // Mode par défaut : supprimer les permissions personnalisées
        updateData = {
          customPermissions: [], // Vider les permissions personnalisées
          lastPermissionUpdate: new Date(),
          updatedBy: 'doctor'
        };
      }
      
      // Sauvegarder dans Firestore
      await updateDoc(doc(db, 'users', userId), updateData);

      if (onPermissionsUpdated) {
        onPermissionsUpdated();
      }

      onClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des permissions:', error);
      alert('Erreur lors de la sauvegarde des permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaultPermissions = permissions[userRole] || permissions.vendeuse || [];
    setSelectedPermissions(defaultPermissions.filter(p => ASSIGNABLE_PERMISSIONS.includes(p)));
    setUseCustomPermissions(false);
  };

  const getPermissionStats = () => {
    const defaultPermissions = (permissions[userRole] || permissions.vendeuse || [])
      .filter(p => ASSIGNABLE_PERMISSIONS.includes(p));
    const currentPermissions = selectedPermissions.filter(p => ASSIGNABLE_PERMISSIONS.includes(p));
    
    if (!useCustomPermissions) {
      return {
        total: defaultPermissions.length,
        default: defaultPermissions.length,
        extra: 0,
        removed: 0
      };
    }
    
    const extraPermissions = currentPermissions.filter(p => !defaultPermissions.includes(p));
    const removedPermissions = defaultPermissions.filter(p => !currentPermissions.includes(p));
    
    return {
      total: currentPermissions.length,
      default: defaultPermissions.length,
      extra: extraPermissions.length,
      removed: removedPermissions.length
    };
  };

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
  const defaultPermissions = (permissions[userRole] || permissions.vendeuse || [])
    .filter(p => ASSIGNABLE_PERMISSIONS.includes(p));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box>
          <Typography variant="h6" component="h2">
            Gérer les permissions de {userName}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            {useCustomPermissions 
              ? "Contrôle complet : vous pouvez ajouter ou retirer toutes les permissions"
              : "Mode standard : utilise les permissions par défaut du rôle"
            }
          </Typography>
          
          {/* Statistiques */}
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            <Chip 
              label={`${stats.total} permissions actives`}
              color="primary" 
              size="small" 
            />
            {useCustomPermissions && stats.extra > 0 && (
              <Chip 
                label={`+${stats.extra} ajoutées`}
                color="success"
                size="small" 
              />
            )}
            {useCustomPermissions && stats.removed > 0 && (
              <Chip 
                label={`-${stats.removed} retirées`}
                color="error"
                size="small" 
              />
            )}
            {!useCustomPermissions && (
              <Chip 
                label="Permissions par défaut"
                color="default"
                size="small" 
              />
            )}
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {/* NOUVEAU : Bascule mode personnalisé */}
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="body2">
                <strong>Mode de gestion des permissions :</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {useCustomPermissions 
                  ? "Permissions personnalisées : vous contrôlez chaque permission individuellement"
                  : "Permissions par défaut : utilise les permissions standard du rôle " + (userRole === 'docteur' ? 'Pharmacien' : 'Vendeuse')
                }
              </Typography>
            </Box>
            <MuiFormControlLabel
              control={
                <Switch
                  checked={useCustomPermissions}
                  onChange={(e) => handleToggleCustomPermissions(e.target.checked)}
                  color="primary"
                />
              }
              label={useCustomPermissions ? "Personnalisées" : "Par défaut"}
            />
          </Box>
        </Alert>

        {/* Message d'avertissement si mode personnalisé */}
        {useCustomPermissions && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>⚠️ Mode avancé activé :</strong> Vous pouvez maintenant retirer des permissions de base 
              ou ajouter des permissions supplémentaires. Décocher une permission empêchera l'utilisateur 
              d'accéder à cette fonctionnalité.
            </Typography>
          </Alert>
        )}

        {/* Permissions par groupe */}
        {Object.entries(PERMISSION_GROUPS).map(([groupName, groupPermissions]) => {
          const availablePermissions = groupPermissions.filter(p => 
            ASSIGNABLE_PERMISSIONS.includes(p)
          );
          
          if (availablePermissions.length === 0) return null;
          
          const selectedInGroup = availablePermissions.filter(p => 
            selectedPermissions.includes(p)
          ).length;
          const allSelected = selectedInGroup === availablePermissions.length;
          const someSelected = selectedInGroup > 0 && selectedInGroup < availablePermissions.length;
          
          // NOUVELLE LOGIQUE : Calculer les permissions ajoutées/retirées
          const addedPermissions = availablePermissions.filter(p => 
            !defaultPermissions.includes(p) && selectedPermissions.includes(p)
          );
          const removedPermissions = availablePermissions.filter(p => 
            defaultPermissions.includes(p) && !selectedPermissions.includes(p)
          );

          return (
            <Accordion key={groupName} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <Typography variant="h6" component="h3" sx={{ flexGrow: 1 }}>
                    {groupName}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
                    <Chip 
                      label={`${selectedInGroup}/${availablePermissions.length}`}
                      size="small"
                      color={allSelected ? 'success' : someSelected ? 'warning' : 'default'}
                    />
                    {useCustomPermissions && addedPermissions.length > 0 && (
                      <Chip 
                        label={`+${addedPermissions.length}`}
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    )}
                    {useCustomPermissions && removedPermissions.length > 0 && (
                      <Chip 
                        label={`-${removedPermissions.length}`}
                        size="small"
                        color="error"
                        variant="outlined"
                      />
                    )}
                  </Box>
                  <Typography
                    component="span"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (useCustomPermissions) {
                        handleSelectGroup(availablePermissions, !allSelected);
                      }
                    }}
                    sx={{
                      cursor: useCustomPermissions ? 'pointer' : 'not-allowed',
                      color: useCustomPermissions ? 'primary.main' : 'text.disabled',
                      textDecoration: useCustomPermissions ? 'underline' : 'none',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: 1,
                      '&:hover': useCustomPermissions ? {
                        backgroundColor: 'primary.light',
                        color: 'white'
                      } : {}
                    }}
                  >
                    {allSelected ? 'Tout décocher' : 'Tout cocher'}
                  </Typography>
                </Box>
              </AccordionSummary>
              
              <AccordionDetails>
                <FormGroup>
                  {availablePermissions.map(permission => {
                    const isDefault = defaultPermissions.includes(permission);
                    const isSelected = selectedPermissions.includes(permission);
                    const isAdded = !isDefault && isSelected;
                    const isRemoved = isDefault && !isSelected && useCustomPermissions;
                    
                    return (
                      <FormControlLabel
                        key={permission}
                        control={
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => handlePermissionChange(permission, e.target.checked)}
                            color="primary"
                            disabled={!useCustomPermissions}
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography 
                              variant="body2"
                              sx={{ 
                                fontWeight: (isAdded || isRemoved) ? 'bold' : 'normal',
                                color: isAdded ? 'success.main' : isRemoved ? 'error.main' : 'text.primary',
                                textDecoration: isRemoved ? 'line-through' : 'none'
                              }}
                            >
                              {PERMISSION_LABELS[permission] || permission}
                            </Typography>
                            {isDefault && !useCustomPermissions && (
                              <Chip 
                                label="Par défaut" 
                                size="small" 
                                variant="outlined" 
                                color="default"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                            {useCustomPermissions && isDefault && isSelected && (
                              <Chip 
                                label="Par défaut ✓" 
                                size="small" 
                                color="primary"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                            {isAdded && (
                              <Chip 
                                label="Ajoutée ✨" 
                                size="small" 
                                color="success"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                            {isRemoved && (
                              <Chip 
                                label="Retirée ❌" 
                                size="small" 
                                color="error"
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
            <strong>🔒 Sécurité :</strong> Les permissions administratives dangereuses 
            (gestion utilisateurs, suppression de données) restent exclusives au pharmacien 
            et ne peuvent pas être accordées aux vendeuses.
          </Typography>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button 
          onClick={onClose} 
          disabled={loading || saving}
        >
          Annuler
        </Button>
        <Button 
          onClick={handleReset} 
          color="warning" 
          disabled={loading || saving}
        >
          Remettre par défaut
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={loading || saving}
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder les permissions'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomPermissionsManager;
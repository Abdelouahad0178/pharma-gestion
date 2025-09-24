// src/components/UserPermissionsDisplay.js
import React from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Chip, 
  Box, 
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Check as CheckIcon,
  Star as StarIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  AdminPanelSettings as AdminIcon
} from '@mui/icons-material';
import permissions, { PERMISSION_LABELS, PERMISSION_GROUPS } from '../utils/permissions';

/**
 * Composant pour afficher les permissions d'un utilisateur de manière détaillée
 * @param {Object} props
 * @param {Object} props.user - Données utilisateur avec role et customPermissions
 * @param {string} props.userName - Nom d'affichage de l'utilisateur
 * @param {boolean} props.showDetails - Afficher les détails complets (défaut: true)
 * @param {boolean} props.compact - Mode compact (défaut: false)
 * @param {string} props.variant - Variante d'affichage: 'card', 'inline', 'dialog' (défaut: 'card')
 */
const UserPermissionsDisplay = ({ 
  user, 
  userName = null,
  showDetails = true,
  compact = false,
  variant = 'card'
}) => {
  // Calculer les permissions de l'utilisateur
  const getUserPermissions = (userData) => {
    if (!userData || !userData.role) return [];
    
    const defaultPermissions = permissions[userData.role] || [];
    const customPermissions = userData.customPermissions || [];
    
    return [...new Set([...defaultPermissions, ...customPermissions])];
  };

  const getExtraPermissions = (userData) => {
    if (!userData || userData.role !== 'vendeuse') return [];
    
    const defaultPermissions = permissions.vendeuse || [];
    const customPermissions = userData.customPermissions || [];
    
    return customPermissions.filter(p => !defaultPermissions.includes(p));
  };

  const getPermissionsByGroup = (userPermissions) => {
    const grouped = {};
    
    Object.entries(PERMISSION_GROUPS).forEach(([groupName, groupPermissions]) => {
      const userPermissionsInGroup = groupPermissions.filter(p => 
        userPermissions.includes(p)
      );
      
      if (userPermissionsInGroup.length > 0) {
        grouped[groupName] = userPermissionsInGroup;
      }
    });
    
    return grouped;
  };

  if (!user) {
    return (
      <Alert severity="warning">
        Aucune donnée utilisateur fournie
      </Alert>
    );
  }

  const userPermissions = getUserPermissions(user);
  const extraPermissions = getExtraPermissions(user);
  const permissionGroups = getPermissionsByGroup(userPermissions);
  const displayName = userName || user.displayName || user.email || 'Utilisateur';

  // Mode compact pour affichage inline
  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Chip 
          label={user.role === 'docteur' ? 'Pharmacien' : 'Vendeuse'} 
          color={user.role === 'docteur' ? 'primary' : 'secondary'}
          size="small"
          icon={user.role === 'docteur' ? <AdminIcon /> : <PersonIcon />}
        />
        <Chip 
          label={`${userPermissions.length} permissions`}
          size="small"
          variant="outlined"
        />
        {extraPermissions.length > 0 && (
          <Chip
            label={`+${extraPermissions.length} supplémentaires`}
            color="success"
            size="small"
            icon={<StarIcon />}
          />
        )}
      </Box>
    );
  }

  // Contenu principal
  const mainContent = (
    <>
      {/* En-tête avec informations utilisateur */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="h2">
            {variant === 'dialog' ? `Permissions de ${displayName}` : displayName}
          </Typography>
          {variant !== 'dialog' && (
            <Typography variant="body2" color="text.secondary">
              Permissions utilisateur
            </Typography>
          )}
        </Box>
        <Chip 
          label={user.role === 'docteur' ? 'Pharmacien' : 'Vendeuse'} 
          color={user.role === 'docteur' ? 'primary' : 'secondary'}
          icon={user.role === 'docteur' ? <AdminIcon /> : <PersonIcon />}
        />
      </Box>

      {/* Statistiques des permissions */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip 
          label={`${userPermissions.length} permissions actives`}
          color="primary" 
          size="small" 
        />
        {extraPermissions.length > 0 && (
          <Chip 
            label={`${extraPermissions.length} permissions supplémentaires`}
            color="success"
            size="small" 
            icon={<StarIcon />}
          />
        )}
      </Box>

      {/* Alerte pour les permissions supplémentaires */}
      {extraPermissions.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>✨ Permissions étendues :</strong> Cette {user.role === 'vendeuse' ? 'vendeuse' : 'personne'} a 
            {' '}<strong>{extraPermissions.length}</strong> permission(s) supplémentaire(s) accordée(s) par le pharmacien.
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {extraPermissions.map(permission => (
              <Chip
                key={permission}
                label={PERMISSION_LABELS[permission] || permission}
                size="small"
                color="success"
                variant="outlined"
              />
            ))}
          </Box>
        </Alert>
      )}

      {/* Détails des permissions si demandé */}
      {showDetails && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
            Détail des permissions par catégorie
          </Typography>

          {/* Permissions groupées par catégorie */}
          {Object.entries(permissionGroups).map(([groupName, groupPermissions]) => {
            const defaultPermissions = permissions[user.role] || [];
            const extraInGroup = groupPermissions.filter(p => 
              !defaultPermissions.includes(p)
            );

            return (
              <Accordion key={groupName} defaultExpanded={extraInGroup.length > 0}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography variant="subtitle2" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
                      {groupName}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip 
                        label={groupPermissions.length}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                      {extraInGroup.length > 0 && (
                        <Chip 
                          label={`+${extraInGroup.length}`}
                          size="small"
                          color="success"
                        />
                      )}
                    </Box>
                  </Box>
                </AccordionSummary>
                
                <AccordionDetails>
                  <List dense>
                    {groupPermissions.map(permission => {
                      const isDefault = (permissions[user.role] || []).includes(permission);
                      const isExtra = !isDefault;
                      
                      return (
                        <ListItem key={permission} sx={{ py: 0.25 }}>
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <CheckIcon 
                              color={isExtra ? 'success' : 'primary'} 
                              fontSize="small" 
                            />
                          </ListItemIcon>
                          <ListItemText 
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontWeight: isExtra ? 'bold' : 'normal',
                                    color: isExtra ? 'success.main' : 'text.primary'
                                  }}
                                >
                                  {PERMISSION_LABELS[permission] || permission}
                                </Typography>
                                {isDefault && (
                                  <Chip 
                                    label="Par défaut" 
                                    size="small" 
                                    variant="outlined" 
                                    color="default"
                                    sx={{ fontSize: '0.7rem', height: 18 }}
                                  />
                                )}
                                {isExtra && (
                                  <Chip 
                                    label="Supplémentaire ✨" 
                                    size="small" 
                                    color="success"
                                    sx={{ fontSize: '0.7rem', height: 18 }}
                                  />
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </>
      )}

      {/* Résumé final */}
      <Box sx={{ mt: 2, p: 1.5, bgcolor: 'grey.100', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Résumé :</strong> {userPermissions.length} permission(s) active(s)
          {extraPermissions.length > 0 && (
            <span> • <strong>{extraPermissions.length}</strong> permission(s) supplémentaire(s)</span>
          )}
          {user.role === 'docteur' && ' • Accès administrateur complet'}
        </Typography>
      </Box>
    </>
  );

  // Mode card (défaut)
  if (variant === 'card') {
    return (
      <Card sx={{ maxWidth: 600, margin: 2 }}>
        <CardContent>
          {mainContent}
        </CardContent>
      </Card>
    );
  }

  // Mode inline ou dialog
  return (
    <Box sx={{ width: '100%' }}>
      {mainContent}
    </Box>
  );
};

export default UserPermissionsDisplay;
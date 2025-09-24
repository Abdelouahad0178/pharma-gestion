// src/components/PermissionsSummaryCard.js
import React, { useState } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Chip, 
  Box, 
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Button,
  Dialog
} from '@mui/material';
import {
  Security as SecurityIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Star as StarIcon,
  AdminPanelSettings as AdminIcon,
  Person as PersonIcon,
  Visibility as VisibilityIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { usePermissions } from './hooks/usePermissions';
import { useUserRole } from '../contexts/UserRoleContext';
import { PERMISSION_LABELS } from '../utils/permissions';
import UserPermissionsDisplay from './UserPermissionsDisplay';

/**
 * Carte résumé des permissions utilisateur pour le tableau de bord
 * Affiche un aperçu rapide avec possibilité d'expansion pour voir les détails
 */
const PermissionsSummaryCard = ({ 
  showExpandButton = true, 
  elevation = 1,
  sx = {} 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const { 
    role, 
    hasCustomPermissions, 
    getExtraPermissions, 
    getAllPermissions,
    getPermissionStats,
    getPermissionDescription
  } = usePermissions();
  
  const { user, getUserRoleDisplay } = useUserRole();

  const stats = getPermissionStats();
  const extraPermissions = getExtraPermissions();

  // Si pas d'utilisateur connecté
  if (!user || !role) {
    return (
      <Card elevation={elevation} sx={{ ...sx }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <SecurityIcon color="disabled" sx={{ mr: 1 }} />
            <Typography variant="h6" color="text.secondary">
              Permissions
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Connexion requise
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  return (
    <>
      <Card elevation={elevation} sx={{ ...sx }}>
        <CardContent>
          {/* En-tête */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <SecurityIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="h6">
                Mes Permissions
              </Typography>
            </Box>
            
            {showExpandButton && (
              <Box>
                <Tooltip title="Voir détails complets">
                  <IconButton size="small" onClick={handleOpenDialog}>
                    <VisibilityIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={expanded ? "Réduire" : "Développer"}>
                  <IconButton size="small" onClick={handleToggleExpand}>
                    {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>

          {/* Informations de base */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Chip 
              label={getUserRoleDisplay()}
              color={role === 'docteur' ? 'primary' : 'secondary'}
              icon={role === 'docteur' ? <AdminIcon /> : <PersonIcon />}
              size="small"
            />
            <Chip 
              label={`${stats.total} permissions`}
              variant="outlined"
              size="small"
            />
            {stats.extra > 0 && (
              <Chip
                label={`+${stats.extra} étendues`}
                color="success"
                icon={<StarIcon />}
                size="small"
              />
            )}
          </Box>

          {/* Description */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {getPermissionDescription()}
          </Typography>

          {/* Message pour permissions étendues */}
          {hasCustomPermissions() && (
            <Box sx={{ 
              mt: 1, 
              p: 1, 
              bgcolor: 'success.light', 
              borderRadius: 1,
              borderLeft: 3,
              borderColor: 'success.main'
            }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.dark' }}>
                ✨ Permissions étendues actives
              </Typography>
              <Typography variant="caption" color="success.dark">
                Vous avez des permissions supplémentaires accordées par le pharmacien
              </Typography>
            </Box>
          )}

          {/* Section développable */}
          <Collapse in={expanded}>
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Aperçu des permissions :
              </Typography>
              
              {/* Permissions principales */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  Accès de base :
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {['voir_dashboard', 'voir_ventes', 'voir_stock'].map(permission => {
                    if (getAllPermissions().includes(permission)) {
                      return (
                        <Chip
                          key={permission}
                          label={PERMISSION_LABELS[permission]?.replace('Consulter ', '').replace('Voir ', '') || permission}
                          size="small"
                          variant="outlined"
                          color="primary"
                        />
                      );
                    }
                    return null;
                  })}
                </Box>
              </Box>

              {/* Permissions supplémentaires si présentes */}
              {extraPermissions.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5, color: 'success.main' }}>
                    Permissions supplémentaires :
                  </Typography>
                  <List dense sx={{ py: 0 }}>
                    {extraPermissions.slice(0, 4).map(permission => (
                      <ListItem key={permission} sx={{ py: 0.25, px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 24 }}>
                          <CheckIcon color="success" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={
                            <Typography variant="body2" color="success.dark">
                              {PERMISSION_LABELS[permission] || permission}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                    {extraPermissions.length > 4 && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 3 }}>
                        ... et {extraPermissions.length - 4} autre(s)
                      </Typography>
                    )}
                  </List>
                </Box>
              )}

              {/* Bouton voir tout */}
              <Button 
                variant="outlined" 
                size="small" 
                onClick={handleOpenDialog}
                sx={{ mt: 1 }}
              >
                Voir toutes les permissions
              </Button>
            </Box>
          </Collapse>

          {/* Indicateurs de statut */}
          <Box sx={{ 
            mt: 2, 
            pt: 1, 
            borderTop: 1, 
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Typography variant="caption" color="text.secondary">
              Dernière vérification : maintenant
            </Typography>
            
            {role === 'vendeuse' && (
              <Typography variant="caption" color={hasCustomPermissions() ? 'success.main' : 'text.secondary'}>
                {hasCustomPermissions() ? 'Permissions personnalisées' : 'Permissions standard'}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Dialog détaillé */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog}
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <UserPermissionsDisplay 
          user={user} 
          userName="Mes permissions"
          variant="dialog"
          showDetails={true}
        />
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={handleCloseDialog}>
            Fermer
          </Button>
        </Box>
      </Dialog>
    </>
  );
};

/**
 * Version mini de la carte pour les espaces restreints
 */
export const PermissionsSummaryMini = ({ sx = {} }) => {
  const { role, getPermissionStats, hasCustomPermissions } = usePermissions();
  const stats = getPermissionStats();

  if (!role) return null;

  return (
    <Card variant="outlined" sx={{ p: 1, ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SecurityIcon color="primary" fontSize="small" />
        <Chip 
          label={role === 'docteur' ? 'Admin' : 'Vendeuse'}
          size="small"
          color={role === 'docteur' ? 'primary' : 'secondary'}
        />
        <Chip 
          label={stats.total}
          size="small"
          variant="outlined"
        />
        {hasCustomPermissions() && (
          <StarIcon color="success" fontSize="small" />
        )}
      </Box>
    </Card>
  );
};

export default PermissionsSummaryCard;
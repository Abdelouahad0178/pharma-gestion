// src/components/Navbar.js - Version complète avec gestion rôles propriétaire et sauvegardes

import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Button,
  Divider,
  Badge,
  Chip
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  ShoppingCart as ShoppingCartIcon,
  LocalPharmacy as LocalPharmacyIcon,
  PointOfSale as PointOfSaleIcon,
  Description as DescriptionIcon,
  AttachMoney as AttachMoneyIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  CloudDownload as BackupIcon,
  People as PeopleIcon,
  SupervisorAccount as SupervisorAccountIcon,
  ManageAccounts as ManageAccountsIcon,
} from "@mui/icons-material";

import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";

export default function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  const { 
    role, 
    loading, 
    authReady,
    canAccessApp,
    isDeleted,
    isLocked,
    isActive,
    isOwner,
    getUserRoleDisplay,
    getOwnershipStatus 
  } = useUserRole();

  // Menus avec hiérarchie des permissions et badges appropriés
  const menuItems = [
    { 
      text: "Dashboard", 
      icon: <DashboardIcon />, 
      path: "/dashboard", 
      allowed: ["docteur", "vendeuse"],
      description: "Tableau de bord principal"
    },
    { 
      text: "Achats", 
      icon: <ShoppingCartIcon />, 
      path: "/achats", 
      allowed: ["docteur"],
      description: "Gestion des achats fournisseurs"
    },
    { 
      text: "Ventes", 
      icon: <PointOfSaleIcon />, 
      path: "/ventes", 
      allowed: ["docteur", "vendeuse"],
      description: "Gestion des ventes clients"
    },
    { 
      text: "Stock", 
      icon: <LocalPharmacyIcon />, 
      path: "/stock", 
      allowed: ["docteur", "vendeuse"],
      description: "Gestion du stock pharmacie"
    },
    { 
      text: "Devis & Factures", 
      icon: <DescriptionIcon />, 
      path: "/devis-factures", 
      allowed: ["docteur", "vendeuse"],
      description: "Gestion devis et factures"
    },
    { 
      text: "Paiements", 
      icon: <AttachMoneyIcon />, 
      path: "/paiements", 
      allowed: ["docteur", "vendeuse"],
      description: "Suivi des paiements"
    },
    
    // SAUVEGARDES avec permissions étendues pour propriétaire
    { 
      text: "Sauvegardes", 
      icon: <BackupIcon />, 
      path: "/backup", 
      allowed: ["docteur", "vendeuse"],
      description: "Sauvegarde des données",
      isNew: true,
      hasOwnerBonus: true // Propriétaire a accès complet
    },
    
    // GESTION UTILISATEURS (votre version existante) - Docteurs
    { 
      text: "Utilisateurs", 
      icon: <PeopleIcon />, 
      path: "/users", 
      allowed: ["docteur"],
      description: "Gestion des invitations et utilisateurs",
      isAdmin: true
    },
    
    // 🔑 GESTION DES RÔLES - PROPRIÉTAIRE UNIQUEMENT
    { 
      text: "👑 Gestion Rôles", 
      icon: <ManageAccountsIcon />, 
      path: "/gestion-utilisateurs", 
      allowed: ["docteur"], 
      ownerOnly: true,
      description: "Promotion/rétrogradation des utilisateurs",
      isOwnerSpecial: true
    },
    
    { 
      text: "Paramètres", 
      icon: <SettingsIcon />, 
      path: "/parametres", 
      allowed: ["docteur"],
      description: "Configuration système"
    },
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  };

  // Affichage conditionnel strict
  if (loading || !authReady) return null;
  if (!canAccessApp()) return null;

  const drawer = (
    <Box
      sx={{
        width: 285,
        height: "100%",
        background: "linear-gradient(135deg,#122058,#315aac 120%)",
        color: "#fff"
      }}
      role="presentation"
      onClick={() => setDrawerOpen(false)}
      onKeyDown={() => setDrawerOpen(false)}
    >
      {/* En-tête application */}
      <Typography
        variant="h6"
        align="center"
        sx={{
          my: 2,
          fontFamily: "'Montserrat', 'Segoe UI', Arial, sans-serif",
          fontWeight: 700,
          letterSpacing: "2px"
        }}
      >
        💊 Pharma Gestion
      </Typography>
      
      {/* Statut utilisateur principal */}
      <Box sx={{ textAlign: "center", mb: 2, px: 2 }}>
        {isOwner ? (
          <Chip
            icon={<SupervisorAccountIcon />}
            label="👑 PROPRIÉTAIRE"
            sx={{
              background: "linear-gradient(90deg, #ffd700, #ffed4a)",
              color: "#1a2332",
              fontWeight: "bold",
              fontSize: "0.75rem",
              height: "30px",
              "& .MuiChip-icon": { color: "#1a2332" }
            }}
          />
        ) : (
          <Chip
            label={getUserRoleDisplay()}
            sx={{
              background: role === "docteur" 
                ? "linear-gradient(90deg, #4caf50, #81c784)" 
                : "linear-gradient(90deg, #2196f3, #64b5f6)",
              color: "white",
              fontWeight: "600",
              fontSize: "0.75rem",
              height: "28px"
            }}
          />
        )}
      </Box>

      {/* Indicateurs d'état si problèmes */}
      {(isDeleted || isLocked || !isActive) && (
        <Box sx={{ textAlign: "center", mb: 1, px: 2 }}>
          <Chip
            label={
              isDeleted ? "🗑️ Supprimé" 
              : isLocked ? "🔒 Verrouillé" 
              : "⏸️ Désactivé"
            }
            size="small"
            sx={{
              background: "linear-gradient(90deg, #f44336, #e57373)",
              color: "white",
              fontSize: "0.7rem"
            }}
          />
        </Box>
      )}
      
      <Divider sx={{ bgcolor: "#fff3", mb: 2 }} />
      
      {/* Menu principal avec badges et permissions */}
      <List>
        {menuItems
          .filter(item => {
            // Vérifier permissions de base
            if (!item.allowed.includes(role)) return false;
            // Vérifier permission propriétaire uniquement
            if (item.ownerOnly && !isOwner) return false;
            return true;
          })
          .map((item) => (
            <ListItemButton
              key={item.text}
              component={Link}
              to={item.path}
              selected={location.pathname === item.path}
              sx={{
                color: location.pathname === item.path ? "#1976d2" : "#fff",
                background: location.pathname === item.path ? "#fff" : "transparent",
                my: 0.5,
                mx: 1,
                borderRadius: 2,
                position: 'relative',
                "&:hover": {
                  background: location.pathname === item.path ? "#fff" : "#fff3",
                  color: location.pathname === item.path ? "#1976d2" : "#1c3db1"
                }
              }}
            >
              <ListItemIcon sx={{ color: "inherit" }}>
                {item.isOwnerSpecial ? (
                  <Badge
                    badgeContent="👑"
                    sx={{
                      "& .MuiBadge-badge": {
                        fontSize: "10px",
                        height: "16px",
                        minWidth: "16px",
                        background: "transparent"
                      }
                    }}
                  >
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              
              <ListItemText 
                primary={item.text}
                secondary={item.description}
                sx={{ 
                  "& .MuiTypography-root": { 
                    fontSize: item.isOwnerSpecial ? "0.95rem" : "1rem",
                    fontWeight: item.isOwnerSpecial ? "700" : "500"
                  },
                  "& .MuiListItemText-secondary": {
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "0.7rem"
                  }
                }}
              />
              
              {/* Badge "NEW" pour Sauvegardes */}
              {item.isNew && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 6,
                    right: 10,
                    background: '#ff4757',
                    color: '#fff',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    lineHeight: 1
                  }}
                >
                  NEW
                </Box>
              )}
              
              {/* Badge "ADMIN" pour Gestion Utilisateurs classique */}
              {item.isAdmin && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 6,
                    right: 10,
                    background: '#9c27b0',
                    color: '#fff',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    lineHeight: 1
                  }}
                >
                  ADMIN
                </Box>
              )}
              
              {/* Badge "OWNER" pour Gestion Rôles */}
              {item.isOwnerSpecial && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 6,
                    right: 10,
                    background: 'linear-gradient(90deg, #ffd700, #ffed4a)',
                    color: '#1a2332',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    lineHeight: 1
                  }}
                >
                  OWNER
                </Box>
              )}
              
              {/* Badge "FULL" pour propriétaire sur Sauvegardes */}
              {item.hasOwnerBonus && isOwner && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 6,
                    right: 10,
                    background: '#2ed573',
                    color: '#fff',
                    fontSize: '0.55rem',
                    fontWeight: 600,
                    padding: '1px 5px',
                    borderRadius: '8px',
                    lineHeight: 1
                  }}
                >
                  FULL
                </Box>
              )}
            </ListItemButton>
          ))}
      </List>
      
      <Divider sx={{ bgcolor: "#fff3", mt: 3, mb: 2 }} />
      
      {/* Section informations utilisateur */}
      <Box sx={{ px: 2, mb: 2 }}>
        <Typography variant="caption" sx={{ color: "#b3c5d7", display: "block" }}>
          Statut: {getOwnershipStatus()}
        </Typography>
        {isOwner && (
          <Typography variant="caption" sx={{ color: "#ffd700", display: "block", fontWeight: "bold" }}>
            ⚡ Droits étendus activés
          </Typography>
        )}
      </Box>
      
      {/* Bouton déconnexion */}
      <Box sx={{ textAlign: "center", mb: 2 }}>
        <Button
          variant="contained"
          color="error"
          startIcon={<LogoutIcon />}
          onClick={handleLogout}
          sx={{
            fontWeight: 600,
            boxShadow: "0 2px 16px #d32f2f30",
            borderRadius: 2,
            minWidth: 140,
            py: 1
          }}
        >
          Déconnexion
        </Button>
      </Box>
    </Box>
  );

  return (
    <>
      <AppBar
        position="sticky"
        elevation={6}
        sx={{
          background: "linear-gradient(90deg, #122058 60%, #3366ff 130%)",
          color: "#fff",
          fontFamily: "'Montserrat', 'Segoe UI', Arial, sans-serif",
          boxShadow: "0 8px 32px #2030a425"
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontFamily: "'Montserrat', 'Segoe UI', Arial, sans-serif",
              fontWeight: 700,
              letterSpacing: "1.5px",
              textShadow: "0 1px 10px #0003"
            }}
          >
            💊 Pharma Gestion
            
            {/* Badge propriétaire dans la barre principale */}
            {isOwner && (
              <Chip
                icon={<SupervisorAccountIcon />}
                label="👑 PROPRIÉTAIRE"
                size="small"
                sx={{
                  marginLeft: "16px",
                  background: "linear-gradient(90deg, #ffd700, #ffed4a)",
                  color: "#1a2332",
                  fontSize: "0.7rem",
                  fontWeight: "bold",
                  height: "24px",
                  "& .MuiChip-icon": { 
                    color: "#1a2332",
                    fontSize: "14px"
                  }
                }}
              />
            )}
          </Typography>
          
          {/* Indicateur de rôle dans la barre */}
          <Box sx={{ mr: 2 }}>
            <Typography variant="caption" sx={{ 
              color: "rgba(255,255,255,0.8)",
              fontSize: "0.75rem" 
            }}>
              {role === "docteur" ? "👨‍⚕️ Docteur" : "👩‍💼 Vendeuse"}
            </Typography>
          </Box>

          {/* Accès rapide Backup dans la barre */}
          <IconButton
            color="inherit"
            onClick={() => navigate('/backup')}
            sx={{
              bgcolor: "#fff2",
              borderRadius: 2,
              mr: 1,
              "&:hover": { bgcolor: "#fff3" }
            }}
            title="Sauvegardes rapides"
          >
            <BackupIcon />
          </IconButton>
          
          <Button
            color="inherit"
            onClick={handleLogout}
            startIcon={<LogoutIcon />}
            sx={{
              fontWeight: 600,
              bgcolor: "#fff2",
              borderRadius: 2,
              px: 2,
              transition: "background 0.2s",
              "&:hover": { bgcolor: "#fff5", color: "#1976d2" }
            }}
          >
            Déconnexion
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            borderTopRightRadius: 18,
            borderBottomRightRadius: 18,
            background: "linear-gradient(135deg,#122058,#315aac 120%)"
          }
        }}
      >
        {drawer}
      </Drawer>
    </>
  );
}
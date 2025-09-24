// src/components/Navbar.js - Version complète avec gestion permissions personnalisées

import React, { useState, useEffect } from "react";
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
  Star as StarIcon
} from "@mui/icons-material";

import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";
import { usePermissions } from "./hooks/usePermissions"; // NOUVEAU IMPORT

export default function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
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
    getOwnershipStatus,
    hasCustomPermissions, // NOUVEAU
    getExtraPermissions   // NOUVEAU
  } = useUserRole();

  // NOUVEAU : Utiliser le hook permissions
  const { can } = usePermissions();

  // Mise à jour de l'heure actuelle en temps réel
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formattedTime = now.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      setCurrentTime(formattedTime);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // ================= MENU MODIFIÉ ==================
  // ANCIEN système : basé sur les rôles
  // NOUVEAU système : basé sur les permissions avec can()
  const menuItems = [
    { 
      text: "Dashboard", 
      icon: <DashboardIcon />, 
      path: "/dashboard", 
      permission: "voir_dashboard", // NOUVEAU
      description: "Tableau de bord principal" 
    },
    { 
      text: "Achats", 
      icon: <ShoppingCartIcon />, 
      path: "/achats", 
      permission: "voir_achats", // NOUVEAU
      description: "Gestion des achats fournisseurs" 
    },
    { 
      text: "Ventes", 
      icon: <PointOfSaleIcon />, 
      path: "/ventes", 
      permission: "voir_ventes", // NOUVEAU
      description: "Gestion des ventes clients" 
    },
    { 
      text: "Stock", 
      icon: <LocalPharmacyIcon />, 
      path: "/stock", 
      permission: "voir_stock", // NOUVEAU
      description: "Gestion du stock pharmacie" 
    },
    { 
      text: "Devis & Factures", 
      icon: <DescriptionIcon />, 
      path: "/devis-factures", 
      permission: "voir_devis_factures", // NOUVEAU
      description: "Gestion devis et factures" 
    },
    { 
      text: "Paiements", 
      icon: <AttachMoneyIcon />, 
      path: "/paiements", 
      permission: "voir_paiements", // NOUVEAU
      description: "Suivi des paiements" 
    },
    { 
      text: "Sauvegardes", 
      icon: <BackupIcon />, 
      path: "/backup", 
      permission: "voir_dashboard", // Accessible à tous (utilise permission dashboard)
      description: "Sauvegarde des données", 
      isNew: true, 
      hasOwnerBonus: true 
    },
    { 
      text: "Utilisateurs", 
      icon: <PeopleIcon />, 
      path: "/users", 
      permission: "gerer_utilisateurs", // NOUVEAU
      description: "Gestion des invitations et utilisateurs", 
      isAdmin: true 
    },
    { 
      text: "👑 Gestion Rôles", 
      icon: <ManageAccountsIcon />, 
      path: "/gestion-utilisateurs", 
      permission: "gerer_utilisateurs", // NOUVEAU
      ownerOnly: true, 
      description: "Promotion/rétrogradation des utilisateurs", 
      isOwnerSpecial: true 
    },
    { 
      text: "Paramètres", 
      icon: <SettingsIcon />, 
      path: "/parametres", 
      permission: "parametres", // NOUVEAU
      description: "Configuration système" 
    },
  ];

  // Déconnexion
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  };

  if (loading || !authReady) return null;
  if (!canAccessApp()) return null;

  // Calculer les permissions supplémentaires pour l'affichage
  const extraPermissions = hasCustomPermissions() ? getExtraPermissions() : [];

  // ================= DRAWER MODIFIÉ ==================
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
        
        {/* NOUVEAU : Affichage permissions supplémentaires */}
        {role === "vendeuse" && extraPermissions.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Chip
              icon={<StarIcon />}
              label={`+${extraPermissions.length} permissions étendues`}
              size="small"
              sx={{
                background: "linear-gradient(90deg, #ff9800, #ffb74d)",
                color: "white",
                fontWeight: "600",
                fontSize: "0.7rem",
                height: "24px",
                "& .MuiChip-icon": { color: "white", fontSize: "12px" }
              }}
            />
          </Box>
        )}
      </Box>

      {/* Indicateurs d'état */}
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
      
      {/* Menu principal MODIFIÉ */}
      <List>
        {menuItems
          .filter(item => {
            // NOUVELLE LOGIQUE : Utiliser can() au lieu de allowed
            if (!can(item.permission)) return false;
            if (item.ownerOnly && !isOwner) return false;
            return true;
          })
          .map((item) => {
            // NOUVEAU : Déterminer si c'est une permission supplémentaire pour cette vendeuse
            const isExtraPermission = role === "vendeuse" && 
              extraPermissions.some(p => 
                // Vérifier si cette permission fait partie des permissions qui permettent d'accéder à cet item
                p === item.permission
              );

            return (
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
                  // NOUVEAU : Bordure dorée pour permissions supplémentaires
                  ...(isExtraPermission && {
                    border: "1px solid #ffd700",
                    boxShadow: "0 0 8px rgba(255, 215, 0, 0.3)"
                  }),
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
                  ) : isExtraPermission ? (
                    // NOUVEAU : Badge étoile pour permissions supplémentaires
                    <Badge
                      badgeContent="✨"
                      sx={{
                        "& .MuiBadge-badge": {
                          fontSize: "8px",
                          height: "14px",
                          minWidth: "14px",
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
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {item.text}
                      {/* NOUVEAU : Indicateur pour permissions supplémentaires */}
                      {isExtraPermission && (
                        <Chip
                          label="Étendue"
                          size="small"
                          sx={{
                            background: "linear-gradient(90deg, #ffd700, #ffed4a)",
                            color: "#1a2332",
                            fontSize: "0.6rem",
                            height: "16px",
                            fontWeight: "bold",
                            "& .MuiChip-label": { px: 0.5 }
                          }}
                        />
                      )}
                    </Box>
                  }
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
              </ListItemButton>
            );
          })}
      </List>
      
      <Divider sx={{ bgcolor: "#fff3", mt: 3, mb: 2 }} />
      
      {/* Infos utilisateur MODIFIÉE */}
      <Box sx={{ px: 2, mb: 2 }}>
        <Typography variant="caption" sx={{ color: "#b3c5d7", display: "block" }}>
          Statut: {getOwnershipStatus()}
        </Typography>
        {isOwner && (
          <Typography variant="caption" sx={{ color: "#ffd700", display: "block", fontWeight: "bold" }}>
            ⚡ Droits étendus activés
          </Typography>
        )}
        {/* NOUVEAU : Info permissions personnalisées */}
        {role === "vendeuse" && extraPermissions.length > 0 && (
          <Typography variant="caption" sx={{ color: "#ffd700", display: "block", fontWeight: "bold" }}>
            ✨ {extraPermissions.length} permission(s) supplémentaire(s)
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

  // ================= RENDU FINAL ==================
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
                  "& .MuiChip-icon": { color: "#1a2332", fontSize: "14px" }
                }}
              />
            )}
            {/* NOUVEAU : Chip permissions étendues dans la navbar */}
            {role === "vendeuse" && extraPermissions.length > 0 && (
              <Chip
                icon={<StarIcon />}
                label={`+${extraPermissions.length} étendues`}
                size="small"
                sx={{
                  marginLeft: "12px",
                  background: "linear-gradient(90deg, #ff9800, #ffb74d)",
                  color: "white",
                  fontSize: "0.7rem",
                  fontWeight: "bold",
                  height: "24px",
                  "& .MuiChip-icon": { color: "white", fontSize: "12px" }
                }}
              />
            )}
          </Typography>

          {/* Heure actuelle en haut à droite */}
          <Box sx={{ mr: 3 }}>
            <Typography
              variant="body1"
              sx={{
                fontWeight: "bold",
                fontSize: "0.9rem",
                color: "#fff",
                textShadow: "0 0 5px #0006"
              }}
            >
              🕒 {currentTime}
            </Typography>
          </Box>

          {/* Accès rapide Backup - MODIFIÉ avec vérification permission */}
          {can("voir_dashboard") && (
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
          )}
          
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
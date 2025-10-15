// src/components/Navbar.js - Version complète avec gestion permissions personnalisées + Analytics
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
  Star as StarIcon,
  BarChart as BarChartIcon, // Analytics
  Gavel as GavelIcon        // Documents légaux
} from "@mui/icons-material";

import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";
import { usePermissions } from "./hooks/usePermissions";

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
    hasCustomPermissions,
    getExtraPermissions
  } = useUserRole();

  const { can } = usePermissions();

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  // ================= MENU (Documents légaux déplacé sous Paramètres) ==================
  const menuItems = [
    { text: "Dashboard", icon: <DashboardIcon />, path: "/dashboard", permission: "voir_dashboard", description: "Tableau de bord principal" },
    { text: "Achats", icon: <ShoppingCartIcon />, path: "/achats", permission: "voir_achats", description: "Gestion des achats fournisseurs" },
    { text: "Ventes", icon: <PointOfSaleIcon />, path: "/ventes", permission: "voir_ventes", description: "Gestion des ventes clients" },
    { text: "Clients", icon: <PeopleIcon />, path: "/clients", permission: "voir_ventes", description: "Gestion des clients, commandes & paiements" },
    { text: "Stock", icon: <LocalPharmacyIcon />, path: "/stock", permission: "voir_stock", description: "Gestion du stock pharmacie" },
    { text: "Devis & Factures", icon: <DescriptionIcon />, path: "/devis-factures", permission: "voir_devis_factures", description: "Gestion devis et factures" },
    { text: "Paiements", icon: <AttachMoneyIcon />, path: "/paiements", permission: "voir_paiements", description: "Suivi des paiements" },
    { text: "Statistiques", icon: <BarChartIcon />, path: "/analytics", permission: "voir_dashboard", description: "Analyses et graphiques de performance", isNew: true },
    { text: "Sauvegardes", icon: <BackupIcon />, path: "/backup", permission: "voir_dashboard", description: "Sauvegarde des données", isNew: true, hasOwnerBonus: true },
    { text: "Utilisateurs", icon: <PeopleIcon />, path: "/users", permission: "gerer_utilisateurs", description: "Gestion des invitations et utilisateurs", isAdmin: true },
    { text: "👑 Gestion Rôles", icon: <ManageAccountsIcon />, path: "/gestion-utilisateurs", permission: "gerer_utilisateurs", ownerOnly: true, description: "Promotion/rétrogradation des utilisateurs", isOwnerSpecial: true },
    { text: "Paramètres", icon: <SettingsIcon />, path: "/parametres", permission: "parametres", description: "Configuration système" },

    // 👇👇 Déplacé ici : juste après Paramètres
    { text: "Documents légaux", icon: <GavelIcon />, path: "/legal", permission: "voir_dashboard", description: "CGU, Confidentialité, Mentions, SLA" },
  ];

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

  const extraPermissions = hasCustomPermissions() ? getExtraPermissions() : [];

  const drawer = (
    <Box
      sx={{
        width: 285,
        height: "100%",
        
        color: "#fff"
      }}
      role="presentation"
      onClick={() => setDrawerOpen(false)}
      onKeyDown={() => setDrawerOpen(false)}
    >
      {/* En-tête */}
      <Typography
        variant="h6"
        align="center"
        sx={{
          my: 2,
          fontFamily: "'Montserrat','Segoe UI',Arial,sans-serif",
          fontWeight: 700,
          letterSpacing: "2px",
        }}
      >
        💊 Pharma Gestion
      </Typography>

      {/* Statut rôle */}
      <Box sx={{ textAlign: "center", mb: 2, px: 2 }}>
        {isOwner ? (
          <Chip
            icon={<SupervisorAccountIcon />}
            label="👑 PROPRIÉTAIRE"
            sx={{
              background: "linear-gradient(90deg,#ffd700,#ffed4a)",
              color: "#1a2332",
              fontWeight: "bold",
              fontSize: "0.75rem",
              height: "30px",
              "& .MuiChip-icon": { color: "#1a2332" },
            }}
          />
        ) : (
          <Chip
            label={getUserRoleDisplay()}
            sx={{
              background:
                role === "docteur"
                  ? "linear-gradient(90deg,#4caf50,#81c784)"
                  : "linear-gradient(90deg,#2196f3,#64b5f6)",
              color: "white",
              fontWeight: 600,
              fontSize: "0.75rem",
              height: "28px",
            }}
          />
        )}

        {role === "vendeuse" && extraPermissions.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Chip
              icon={<StarIcon />}
              label={`+${extraPermissions.length} permissions étendues`}
              size="small"
              sx={{
                background: "linear-gradient(90deg,#ff9800,#ffb74d)",
                color: "white",
                fontWeight: 600,
                fontSize: "0.7rem",
                height: "24px",
                "& .MuiChip-icon": { color: "white", fontSize: "12px" },
              }}
            />
          </Box>
        )}
      </Box>

      {(isDeleted || isLocked || !isActive) && (
        <Box sx={{ textAlign: "center", mb: 1, px: 2 }}>
          <Chip
            label={
              isDeleted ? "🗑️ Supprimé" : isLocked ? "🔒 Verrouillé" : "⏸️ Désactivé"
            }
            size="small"
            sx={{
              background: "linear-gradient(90deg,#f44336,#e57373)",
              color: "white",
              fontSize: "0.7rem",
            }}
          />
        </Box>
      )}

      <Divider sx={{ bgcolor: "#fff3", mb: 2 }} />

      {/* Menu */}
      <List>
        {menuItems
          .filter((item) => {
            if (!can(item.permission)) return false;
            if (item.ownerOnly && !isOwner) return false;
            return true;
          })
          .map((item) => {
            const isExtra =
              role === "vendeuse" && extraPermissions.some((p) => p === item.permission);

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
                  position: "relative",
                  ...(isExtra && {
                    border: "1px solid #ffd700",
                    boxShadow: "0 0 8px rgba(255,215,0,0.3)",
                  }),
                  "&:hover": {
                    background:
                      location.pathname === item.path ? "#fff" : "#fff3",
                    color:
                      location.pathname === item.path ? "#1976d2" : "#1c3db1",
                  },
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
                          background: "transparent",
                        },
                      }}
                    >
                      {item.icon}
                    </Badge>
                  ) : isExtra ? (
                    <Badge
                      badgeContent="✨"
                      sx={{
                        "& .MuiBadge-badge": {
                          fontSize: "8px",
                          height: "14px",
                          minWidth: "14px",
                          background: "transparent",
                        },
                      }}
                    >
                      {item.icon}
                    </Badge>
                  ) : item.isNew ? (
                    <Badge
                      badgeContent="NEW"
                      sx={{
                        "& .MuiBadge-badge": {
                          fontSize: "7px",
                          height: "14px",
                          minWidth: "28px",
                          background:
                            "linear-gradient(90deg,#10b981,#059669)",
                          color: "white",
                          fontWeight: "bold",
                        },
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
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {item.text}
                      {isExtra && (
                        <Chip
                          label="Étendue"
                          size="small"
                          sx={{
                            background:
                              "linear-gradient(90deg,#ffd700,#ffed4a)",
                            color: "#1a2332",
                            fontSize: "0.6rem",
                            height: "16px",
                            fontWeight: "bold",
                            "& .MuiChip-label": { px: 0.5 },
                          }}
                        />
                      )}
                    </Box>
                  }
                  secondary={item.description}
                  sx={{
                    "& .MuiTypography-root": {
                      fontSize: item.isOwnerSpecial ? "0.95rem" : "1rem",
                      fontWeight: item.isOwnerSpecial ? 700 : 500,
                    },
                    "& .MuiListItemText-secondary": {
                      color: "rgba(255,255,255,0.7)",
                      fontSize: "0.7rem",
                    },
                  }}
                />
              </ListItemButton>
            );
          })}
      </List>

      <Divider sx={{ bgcolor: "#fff3", mt: 3, mb: 2 }} />

      {/* Infos + Déconnexion */}
      <Box sx={{ px: 2, mb: 2 }}>
        <Typography variant="caption" sx={{ color: "#b3c5d7", display: "block" }}>
          Statut: {getOwnershipStatus()}
        </Typography>
        {isOwner && (
          <Typography
            variant="caption"
            sx={{ color: "#ffd700", display: "block", fontWeight: "bold" }}
          >
            ⚡ Droits étendus activés
          </Typography>
        )}
        {role === "vendeuse" && extraPermissions.length > 0 && (
          <Typography
            variant="caption"
            sx={{ color: "#ffd700", display: "block", fontWeight: "bold" }}
          >
            ✨ {extraPermissions.length} permission(s) supplémentaire(s)
          </Typography>
        )}
      </Box>

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
            py: 1,
          }}
        >
          Déconnexion
        </Button>
      </Box>
    </Box>
  );

  // ================= APP BAR =================
  return (
    <>
      <AppBar
        position="sticky"
        elevation={6}
        sx={{
          background: "linear-gradient(90deg,#122058 60%,#3366ff 130%)",
          color: "#fff",
          fontFamily: "'Montserrat','Segoe UI',Arial,sans-serif",
          boxShadow: "0 8px 32px #2030a425",
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
              fontFamily: "'Montserrat','Segoe UI',Arial,sans-serif",
              fontWeight: 700,
              letterSpacing: "1.5px",
              textShadow: "0 1px 10px #0003",
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            💊 Pharma Gestion
            {isOwner && (
              <Chip
                icon={<SupervisorAccountIcon />}
                label="👑 PROPRIÉTAIRE"
                size="small"
                sx={{
                  background: "linear-gradient(90deg,#ffd700,#ffed4a)",
                  color: "#1a2332",
                  fontWeight: "bold",
                  height: 22,
                }}
              />
            )}
            {role === "vendeuse" && extraPermissions.length > 0 && (
              <Chip
                icon={<StarIcon />}
                label={`+${extraPermissions.length} étendues`}
                size="small"
                sx={{
                  background: "linear-gradient(90deg,#ff9800,#ffb74d)",
                  color: "white",
                  fontWeight: "bold",
                  height: 22,
                }}
              />
            )}
          </Typography>

          {/* Heure actuelle */}
          <Box sx={{ mr: 3 }}>
            <Typography variant="body1" sx={{ fontWeight: "bold", fontSize: "0.9rem", color: "#fff", textShadow: "0 0 5px #0006" }}>
              🕒 {currentTime}
            </Typography>
          </Box>

          {/* Accès rapide Analytics */}
          {can("voir_dashboard") && (
            <IconButton
              color="inherit"
              onClick={() => navigate('/analytics')}
              sx={{ bgcolor: "#fff2", borderRadius: 2, mr: 1, "&:hover": { bgcolor: "#fff3" } }}
              title="Statistiques et graphiques"
            >
              <BarChartIcon />
            </IconButton>
          )}

          {/* Accès rapide Backup */}
          {can("voir_dashboard") && (
            <IconButton
              color="inherit"
              onClick={() => navigate('/backup')}
              sx={{ bgcolor: "#fff2", borderRadius: 2, mr: 1, "&:hover": { bgcolor: "#fff3" } }}
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

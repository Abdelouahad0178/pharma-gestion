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
  Divider
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
  People as PeopleIcon,          // Icône pour gestion utilisateurs
  PersonAdd as PersonAddIcon,     // NOUVEAU: Icône pour invitations
  Logout as LogoutIcon,
} from "@mui/icons-material";

import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";

export default function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { role, loading, isOwner } = useUserRole(); // NOUVEAU: Récupérer isOwner

  // Menus visibles selon le rôle ET le statut de propriétaire
  const menuItems = [
    { 
      text: "Dashboard", 
      icon: <DashboardIcon />, 
      path: "/dashboard", 
      allowed: ["docteur", "vendeuse"],
      ownerOnly: false 
    },
    { 
      text: "Achats", 
      icon: <ShoppingCartIcon />, 
      path: "/achats", 
      allowed: ["docteur"],
      ownerOnly: false 
    },
    { 
      text: "Ventes", 
      icon: <PointOfSaleIcon />, 
      path: "/ventes", 
      allowed: ["docteur", "vendeuse"],
      ownerOnly: false 
    },
    { 
      text: "Stock", 
      icon: <LocalPharmacyIcon />, 
      path: "/stock", 
      allowed: ["docteur", "vendeuse"],
      ownerOnly: false 
    },
    { 
      text: "Devis & Factures", 
      icon: <DescriptionIcon />, 
      path: "/devis-factures", 
      allowed: ["docteur", "vendeuse"],
      ownerOnly: false 
    },
    { 
      text: "Paiements", 
      icon: <AttachMoneyIcon />, 
      path: "/paiements", 
      allowed: ["docteur", "vendeuse"],
      ownerOnly: false 
    },
    { 
      text: "Paramètres", 
      icon: <SettingsIcon />, 
      path: "/parametres", 
      allowed: ["docteur"],
      ownerOnly: false 
    },
    { 
      text: "Invitations", 
      icon: <PersonAddIcon />, 
      path: "/invitations", 
      allowed: ["docteur", "vendeuse"], // NOUVEAU: Accessible à tous
      ownerOnly: false 
    },
    { 
      text: "Gestion Utilisateurs", 
      icon: <PeopleIcon />, 
      path: "/gestion-utilisateurs", 
      allowed: ["docteur"], 
      ownerOnly: true  // Réservé au propriétaire uniquement
    },
  ];

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  // Affiche rien tant que rôle non chargé
  if (loading) return null;

  const drawer = (
    <Box
      sx={{
        width: 260,
        height: "100%",
        background: "linear-gradient(135deg,#122058,#315aac 120%)",
        color: "#fff"
      }}
      role="presentation"
      onClick={() => setDrawerOpen(false)}
      onKeyDown={() => setDrawerOpen(false)}
    >
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
        {isOwner ? "👑" : "💊"} Pharma Gestion {/* NOUVEAU: Couronne pour le propriétaire */}
      </Typography>
      
      {/* NOUVEAU: Indication du statut utilisateur */}
      {isOwner && (
        <Box sx={{ 
          textAlign: "center", 
          mb: 1,
          px: 2,
          py: 1,
          bgcolor: "rgba(255,215,0,0.2)",
          mx: 1,
          borderRadius: 1
        }}>
          <Typography sx={{ 
            fontSize: "0.8rem", 
            color: "#FFD700",
            fontWeight: 600
          }}>
            Propriétaire de la société
          </Typography>
        </Box>
      )}
      
      <Divider sx={{ bgcolor: "#fff3", mb: 2 }} />
      <List>
        {menuItems
          .filter(item => {
            // Vérifier le rôle
            if (!item.allowed.includes(role)) return false;
            // Vérifier si c'est réservé au propriétaire
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
                borderRadius: 2,
                "&:hover": {
                  background: "#fff3",
                  color: "#1c3db1"
                },
                // NOUVEAU: Style spécial pour les options propriétaire
                ...(item.ownerOnly && {
                  borderLeft: "3px solid #FFD700",
                  paddingLeft: "13px"
                })
              }}
            >
              <ListItemIcon sx={{ color: "inherit" }}>{item.icon}</ListItemIcon>
              <ListItemText 
                primary={item.text}
                secondary={item.ownerOnly ? "Propriétaire uniquement" : null}
                secondaryTypographyProps={{
                  sx: { fontSize: "0.7rem", color: "#FFD700" }
                }}
              />
            </ListItemButton>
          ))}
      </List>
      <Divider sx={{ bgcolor: "#fff3", mt: 2 }} />
      <Box sx={{ textAlign: "center", my: 2 }}>
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
          background: isOwner 
            ? "linear-gradient(90deg, #B8860B 60%, #FFD700 130%)" // NOUVEAU: Dégradé doré pour le propriétaire
            : "linear-gradient(90deg, #122058 60%, #3366ff 130%)",
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
            {isOwner ? "👑" : "💊"} Pharma Gestion
            {/* NOUVEAU: Indicateur de statut dans la barre principale */}
            {isOwner && (
              <Typography 
                component="span" 
                sx={{ 
                  fontSize: "0.7rem", 
                  ml: 2, 
                  opacity: 0.8,
                  fontWeight: 400
                }}
              >
                (Propriétaire)
              </Typography>
            )}
          </Typography>
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
              "&:hover": { 
                bgcolor: "#fff5", 
                color: isOwner ? "#B8860B" : "#1976d2" 
              }
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
// src/components/Navbar.js
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
  Business as BusinessIcon,
} from "@mui/icons-material";

import { signOut } from "firebase/auth";
import { auth, db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { useUserRole } from "../contexts/UserRoleContext";

export default function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [societeNom, setSocieteNom] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { role, loading, societeId } = useUserRole();

  // Charger le nom de la société
  useEffect(() => {
    const fetchSocieteNom = async () => {
      if (societeId) {
        try {
          const societeDoc = await getDoc(doc(db, "societes", societeId));
          if (societeDoc.exists()) {
            setSocieteNom(societeDoc.data().nom || "Société");
          }
        } catch (e) {
          console.error("Erreur chargement société:", e);
        }
      } else {
        setSocieteNom("");
      }
    };
    fetchSocieteNom();
  }, [societeId]);

  // Menus visibles selon le rôle
  const menuItems = [
    { text: "Dashboard", icon: <DashboardIcon />, path: "/dashboard", allowed: ["docteur", "vendeuse"] },
    { text: "Achats", icon: <ShoppingCartIcon />, path: "/achats", allowed: ["docteur"] },
    { text: "Ventes", icon: <PointOfSaleIcon />, path: "/ventes", allowed: ["docteur", "vendeuse"] },
    { text: "Stock", icon: <LocalPharmacyIcon />, path: "/stock", allowed: ["docteur", "vendeuse"] },
    { text: "Devis & Factures", icon: <DescriptionIcon />, path: "/devis-factures", allowed: ["docteur", "vendeuse"] },
    { text: "Paiements", icon: <AttachMoneyIcon />, path: "/paiements", allowed: ["docteur", "vendeuse"] },
    { text: "Paramètres", icon: <SettingsIcon />, path: "/parametres", allowed: ["docteur"] },
    { text: "Ma Société", icon: <BusinessIcon />, path: "/societe", allowed: ["docteur", "vendeuse"] },
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
        💊 Pharma Gestion
      </Typography>
      
      {/* Affichage de la société */}
      {societeNom && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Chip
            icon={<BusinessIcon />}
            label={societeNom}
            sx={{
              width: "100%",
              background: "rgba(255,255,255,0.15)",
              color: "#7ee4e6",
              fontWeight: 600,
              '& .MuiChip-icon': {
                color: "#7ee4e6"
              }
            }}
          />
        </Box>
      )}
      
      <Divider sx={{ bgcolor: "#fff3", mb: 2 }} />
      
      <List>
        {menuItems
          .filter(item => item.allowed.includes(role))
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
                "&:hover": {
                  background: "#fff3",
                  color: "#1c3db1"
                }
              }}
            >
              <ListItemIcon sx={{ color: "inherit" }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          ))}
      </List>
      
      <Divider sx={{ bgcolor: "#fff3", mt: 2 }} />
      
      {/* Affichage du rôle */}
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="caption" sx={{ color: "#98c4f9" }}>
          Connecté en tant que :
        </Typography>
        <Typography variant="body2" sx={{ color: "#fff", fontWeight: 600 }}>
          {role === "docteur" ? "Pharmacien (Admin)" : "Vendeuse"}
        </Typography>
      </Box>
      
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
              textShadow: "0 1px 10px #0003",
              display: "flex",
              alignItems: "center",
              gap: 2
            }}
          >
            💊 Pharma Gestion
            {societeNom && (
              <Chip
                icon={<BusinessIcon />}
                label={societeNom}
                size="small"
                sx={{
                  background: "rgba(255,255,255,0.2)",
                  color: "#fff",
                  fontWeight: 600,
                  '& .MuiChip-icon': {
                    color: "#7ee4e6"
                  }
                }}
              />
            )}
          </Typography>
          
          {/* Bouton pour gérer la société */}
          {societeId && (
            <Button
              color="inherit"
              onClick={() => navigate("/societe")}
              startIcon={<BusinessIcon />}
              sx={{
                fontWeight: 600,
                bgcolor: "#fff2",
                borderRadius: 2,
                px: 2,
                mr: 1,
                transition: "background 0.2s",
                "&:hover": { bgcolor: "#fff5", color: "#1976d2" }
              }}
            >
              Ma Société
            </Button>
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
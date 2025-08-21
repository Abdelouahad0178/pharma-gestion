// src/components/Navbar.js
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
  People as PeopleIcon,
  GroupAdd as GroupAddIcon,
  Logout as LogoutIcon,
} from "@mui/icons-material";

import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";

export default function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { role, loading, societeName } = useUserRole();

  // Menus visibles selon le rôle (Dashboard retiré de la liste normale)
  const menuItems = [
    { text: "Achats", icon: <ShoppingCartIcon />, path: "/achats", allowed: ["docteur"] },
    { text: "Ventes", icon: <PointOfSaleIcon />, path: "/ventes", allowed: ["docteur", "vendeuse"] },
    { text: "Stock", icon: <LocalPharmacyIcon />, path: "/stock", allowed: ["docteur", "vendeuse"] },
    { text: "Devis & Factures", icon: <DescriptionIcon />, path: "/devis-factures", allowed: ["docteur", "vendeuse"] },
    { text: "Paiements", icon: <AttachMoneyIcon />, path: "/paiements", allowed: ["docteur", "vendeuse"] },
    { text: "Invitations", icon: <GroupAddIcon />, path: "/invitations", allowed: ["docteur", "vendeuse"] },
    { text: "Gestion Utilisateurs", icon: <PeopleIcon />, path: "/gestion-utilisateurs", allowed: ["docteur"] },
    { text: "Paramètres", icon: <SettingsIcon />, path: "/parametres", allowed: ["docteur"] },
  ];

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

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

      {/* Bandeau nom de la pharmacie */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
          mb: 1,
          color: "#e8f0ff",
          bgcolor: "#00000022",
          borderTop: "1px solid #ffffff22",
          borderBottom: "1px solid #ffffff22",
        }}
      >
        <LocalPharmacyIcon fontSize="small" />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "190px",
          }}
          title={societeName || "—"}
        >
          {societeName || "—"}
        </Typography>
      </Box>

      {/* DASHBOARD PROÉMINENT EN HAUT */}
      <Box sx={{ px: 2, mb: 2 }}>
        <ListItemButton
          component={Link}
          to="/dashboard"
          selected={location.pathname === "/dashboard"}
          sx={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "#fff",
            borderRadius: 3,
            mb: 1,
            py: 1.5,
            "&:hover": {
              background: "linear-gradient(135deg, #764ba2 0%, #667eea 100%)",
            },
            "&.Mui-selected": {
              background: "linear-gradient(135deg, #61c7ef 0%, #3272e0 100%)",
            }
          }}
        >
          <ListItemIcon sx={{ color: "#fff", minWidth: "40px" }}>
            <DashboardIcon />
          </ListItemIcon>
          <ListItemText 
            primary="📊 DASHBOARD" 
            sx={{ 
              "& .MuiTypography-root": { 
                fontWeight: 800, 
                fontSize: "1.1em",
                letterSpacing: "1px"
              } 
            }} 
          />
        </ListItemButton>
      </Box>

      <Divider sx={{ bgcolor: "#fff3", mb: 2 }} />

      <List>
        {menuItems
          .filter(item => item.allowed.includes(role))
          .map((item) => {
            const selected = location.pathname === item.path;
            return (
              <ListItemButton
                key={item.text}
                component={Link}
                to={item.path}
                selected={selected}
                sx={{
                  color: selected ? "#1976d2" : "#fff",
                  background: selected ? "#fff" : "transparent",
                  my: 0.5,
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
            );
          })}
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

          {/* BOUTON DASHBOARD DANS LA NAVBAR */}
          <Button
            component={Link}
            to="/dashboard"
            startIcon={<DashboardIcon />}
            sx={{
              color: location.pathname === "/dashboard" ? "#61c7ef" : "#fff",
              fontWeight: 800,
              fontSize: "1.1em",
              bgcolor: location.pathname === "/dashboard" ? "#fff2" : "transparent",
              borderRadius: 2,
              px: 2,
              mr: 2,
              transition: "all 0.2s",
              "&:hover": { 
                bgcolor: "#fff3", 
                color: "#61c7ef",
                transform: "scale(1.05)"
              }
            }}
          >
            📊 DASHBOARD
          </Button>

          {/* Titre + nom de la pharmacie */}
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{
                fontFamily: "'Montserrat', 'Segoe UI', Arial, sans-serif",
                fontWeight: 700,
                letterSpacing: "1.5px",
                textShadow: "0 1px 10px #0003",
                whiteSpace: "nowrap"
              }}
            >
              💊 Pharma Gestion
            </Typography>
            {societeName && (
              <Typography
                variant="subtitle2"
                sx={{
                  opacity: 0.95,
                  maxWidth: "50vw",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
                title={societeName}
              >
                | {societeName}
              </Typography>
            )}
          </Box>

          <Button
            color="inherit"
            onClick={handleLogout}
            startIcon={<LogoutIcon />}
            sx={{
              fontWeight: 600,
              bgcolor: "#ffffff22",
              borderRadius: 2,
              px: 2,
              transition: "background 0.2s",
              "&:hover": { bgcolor: "#ffffff55", color: "#1976d2" }
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
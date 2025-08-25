import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Dashboard from './components/dashboard/Dashboard';
import Achats from './components/achats/Achats';
import Stock from './components/stock/Stock';
import Ventes from './components/ventes/Ventes';
import Navbar from './components/Navbar';
import Parametres from './components/parametres/Parametres';
import DevisFactures from './components/devisFactures/DevisFactures';
import Paiements from './components/paiements/Paiements';
import SecureUserManagement from './components/admin/SecureUserManagement';
import Invitations from './components/invitations/Invitations';
import FloatingDashboardButton from './components/common/FloatingDashboardButton'; // CORRIGÉ
import { UserRoleProvider } from './contexts/UserRoleContext';
import Protected from './components/Protected';
import './styles/main.css';

// Wrapper pour masquer la Navbar sur Login/Register
function AppWrapper() {
  const location = useLocation();
  const hideNavbar = location.pathname === "/login" || location.pathname === "/register";

  return (
    <>
      {!hideNavbar && <Navbar />}
      <div style={{ minHeight: "100vh", background: "#f6f8fa" }}>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Routes protégées (avec permissions) */}
          <Route
            path="/achats"
            element={
              <Protected permission="voir_achats">
                <Achats />
              </Protected>
            }
          />
          <Route
            path="/ventes"
            element={
              <Protected permission="voir_ventes">
                <Ventes />
              </Protected>
            }
          />
          <Route
            path="/stock"
            element={
              <Protected permission="ajouter_stock">
                <Stock />
              </Protected>
            }
          />

          {/* Modules secondaires */}
          <Route
            path="/devis-factures"
            element={
              <Protected permission="voir_ventes">
                <DevisFactures />
              </Protected>
            }
          />
          <Route
            path="/paiements"
            element={
              <Protected permission="voir_ventes">
                <Paiements />
              </Protected>
            }
          />
          <Route
            path="/parametres"
            element={
              <Protected permission="parametres">
                <Parametres />
              </Protected>
            }
          />

          {/* NOUVEAU: Gestion sécurisée des utilisateurs - PROPRIÉTAIRE UNIQUEMENT */}
          <Route
            path="/gestion-utilisateurs"
            element={
              <Protected permission="gerer_utilisateurs">
                <SecureUserManagement />
              </Protected>
            }
          />

          {/* NOUVEAU: Invitations - Accessible à tous les utilisateurs connectés */}
          <Route
            path="/invitations"
            element={
              <Protected permission="voir_invitations">
                <Invitations />
              </Protected>
            }
          />

          {/* Redirection par défaut */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>

        {/* NOUVEAU: Bouton flottant Dashboard - Visible sur toutes les pages sauf dashboard/auth */}
        <FloatingDashboardButton />
      </div>
    </>
  );
}

function App() {
  // Le Provider englobe tout pour permettre l'accès au contexte partout
  return (
    <UserRoleProvider>
      <Router>
        <AppWrapper />
      </Router>
    </UserRoleProvider>
  );
}

export default App;
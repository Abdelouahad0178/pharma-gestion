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
import GestionUtilisateurs from './components/admin/GestionUtilisateurs'; // NOUVEAU
import GestionInvitations from './components/admin/GestionInvitations'; // NOUVEAU  
import MigrationUtilisateurs from './components/admin/MigrationUtilisateurs'; // NOUVEAU
import MigrationVersSocietes from './components/admin/MigrationVersSocietes'; // NOUVEAU SAAS
import { UserRoleProvider } from './contexts/UserRoleContext';
import Protected from './components/Protected';
import AddSocieteIdToAllUsers from './components/admin/AddSocieteIdToAllUsers';
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

          {/* NOUVELLE ROUTE : Gestion des utilisateurs (Docteur uniquement) */}
          <Route
            path="/gestion-utilisateurs"
            element={
              <Protected permission="gerer_utilisateurs">
                <GestionUtilisateurs />
              </Protected>
            }
          />

          {/* NOUVELLE ROUTE : Gestion des invitations (Docteur uniquement) */}
          <Route
            path="/gestion-invitations"
            element={
              <Protected permission="gerer_utilisateurs">
                <GestionInvitations />
              </Protected>
            }
          />

          {/* ROUTE ADMIN TEMPORAIRE */}
          <Route path="/admin-update-societe" element={<AddSocieteIdToAllUsers />} />
          <Route path="/migration-utilisateurs" element={<MigrationUtilisateurs />} />
          <Route path="/migration-societes" element={<MigrationVersSocietes />} />

          {/* Redirection par défaut */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
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
// src/App.js
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
import SocieteManager from './components/SocieteManager';
import { UserRoleProvider, useUserRole } from './contexts/UserRoleContext';
import Protected from './components/Protected';
import './styles/main.css';

// Composant pour rediriger si pas de société
function RequireSociete({ children }) {
  const { societeId, loading, user } = useUserRole();
  
  if (loading) {
    return (
      <div style={{ 
        padding: 50, 
        textAlign: "center", 
        color: "#7ee4e6",
        fontSize: "1.2em"
      }}>
        Chargement...
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (!societeId) {
    return <Navigate to="/societe" />;
  }
  
  return <>{children}</>;
}

// Wrapper pour masquer la Navbar sur Login/Register et gérer les redirections
function AppWrapper() {
  const location = useLocation();
  const { user, loading, societeId } = useUserRole();
  
  const hideNavbar = 
    location.pathname === "/login" || 
    location.pathname === "/register" ||
    location.pathname === "/societe";

  // Si en cours de chargement
  if (loading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        background: "#223049",
        color: "#7ee4e6",
        fontSize: "1.4em"
      }}>
        Chargement de l'application...
      </div>
    );
  }

  return (
    <>
      {!hideNavbar && <Navbar />}
      <div style={{ minHeight: "100vh", background: "#f6f8fa" }}>
        <Routes>
          {/* Auth - Accessible sans société */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Gestion société - Accessible si connecté */}
          <Route 
            path="/societe" 
            element={
              user ? <SocieteManager /> : <Navigate to="/login" />
            } 
          />

          {/* Dashboard - Nécessite société */}
          <Route 
            path="/dashboard" 
            element={
              <RequireSociete>
                <Dashboard />
              </RequireSociete>
            } 
          />

          {/* Routes protégées (nécessitent société + permissions) */}
          <Route
            path="/achats"
            element={
              <RequireSociete>
                <Protected permission="voir_achats">
                  <Achats />
                </Protected>
              </RequireSociete>
            }
          />
          <Route
            path="/ventes"
            element={
              <RequireSociete>
                <Protected permission="voir_ventes">
                  <Ventes />
                </Protected>
              </RequireSociete>
            }
          />
          <Route
            path="/stock"
            element={
              <RequireSociete>
                <Protected permission="voir_stock">
                  <Stock />
                </Protected>
              </RequireSociete>
            }
          />

          {/* Modules secondaires - Nécessitent société */}
          <Route
            path="/devis-factures"
            element={
              <RequireSociete>
                <Protected permission="voir_devis_factures">
                  <DevisFactures />
                </Protected>
              </RequireSociete>
            }
          />
          <Route
            path="/paiements"
            element={
              <RequireSociete>
                <Protected permission="voir_paiements">
                  <Paiements />
                </Protected>
              </RequireSociete>
            }
          />
          <Route
            path="/parametres"
            element={
              <RequireSociete>
                <Protected permission="parametres">
                  <Parametres />
                </Protected>
              </RequireSociete>
            }
          />

          {/* Redirection par défaut */}
          <Route 
            path="/" 
            element={
              user ? (
                societeId ? <Navigate to="/dashboard" /> : <Navigate to="/societe" />
              ) : (
                <Navigate to="/login" />
              )
            } 
          />
          <Route path="*" element={<Navigate to="/" />} />
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
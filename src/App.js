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
import Invitations from './components/invitations/Invitations'; // NOUVEAU IMPORT
import { UserRoleProvider } from './contexts/UserRoleContext';
import Protected from './components/Protected';
import AddSocieteIdToAllUsers from './components/admin/AddSocieteIdToAllUsers';
import GestionUtilisateurs from './components/admin/GestionUtilisateurs';
import AdminPopup from './components/AdminPopup';
import AccountLocked from './components/AccountLocked';
import PaymentWarningBanner from './components/PaymentWarningBanner';
import { useUserRole } from './contexts/UserRoleContext';
import './styles/main.css';


// Composant pour vérifier l'état du compte
function AccountChecker({ children }) {
  const { loading, user, canAccessApp, isLocked, isActive } = useUserRole();

  // Affichage pendant le chargement
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(120deg, #223049 0%, #344060 100%)',
        color: '#f1f5fb',
        fontSize: '18px'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: '#2b3951',
          borderRadius: '15px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
          <div>Chargement...</div>
        </div>
      </div>
    );
  }

  // Si l'utilisateur est connecté mais ne peut pas accéder (verrouillé/désactivé)
  if (user && !canAccessApp()) {
    return <AccountLocked />;
  }

  // Sinon, afficher le contenu normal
  return (
    <>
      {children}
      {/* Afficher les popups admin si l'utilisateur est connecté et peut accéder */}
      {user && canAccessApp() && <AdminPopup />}
      {/* Afficher la bannière d'avertissement si nécessaire */}
      {user && canAccessApp() && <PaymentWarningBanner />}
    </>
  );
}

// Wrapper pour masquer la Navbar sur Login/Register et pages de blocage
function AppWrapper() {
  const location = useLocation();
  const { user, canAccessApp } = useUserRole();
  
  const hideNavbar = location.pathname === "/login" || 
                    location.pathname === "/register" ||
                    (user && !canAccessApp());

  return (
    <AccountChecker>
      {!hideNavbar && <Navbar />}
      <div style={{ minHeight: "100vh", background: "#f6f8fa" }}>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={
            <Protected>
              <Dashboard />
            </Protected>
          } />

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
          
          {/* NOUVELLE ROUTE - Invitations */}
          <Route
            path="/invitations"
            element={
              <Protected permission="voir_invitations">
                <Invitations />
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

          {/* ROUTE - Gestion des utilisateurs */}
          <Route
            path="/gestion-utilisateurs"
            element={
              <Protected permission="gerer_utilisateurs">
                <GestionUtilisateurs />
              </Protected>
            }
          />

          {/* ROUTE ADMIN TEMPORAIRE */}
          <Route path="/admin-update-societe" element={<AddSocieteIdToAllUsers />} />

          {/* Redirection par défaut */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </AccountChecker>
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
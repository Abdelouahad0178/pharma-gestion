// src/App.js - Version avec page d'accueil au démarrage

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import AcceptInvitation from './components/auth/AcceptInvitation';
import Dashboard from './components/dashboard/Dashboard';
import Achats from './components/achats/Achats';
import Stock from './components/stock/Stock';
import Ventes from './components/ventes/Ventes';
import Navbar from './components/Navbar';
import Parametres from './components/parametres/Parametres';
import DevisFactures from './components/devisFactures/DevisFactures';
import Paiements from './components/paiements/Paiements';
import BackupExport from './components/BackupExport';
import UsersManagement from './components/users/UsersManagement';
import GestionUtilisateurs from './components/admin/GestionUtilisateurs';
import Homepage from './components/Homepage'; // Nouveau composant
import { UserRoleProvider } from './contexts/UserRoleContext';
import Protected from './components/Protected';
import AddSocieteIdToAllUsers from './components/admin/AddSocieteIdToAllUsers';
import InitOwner from './components/admin/InitOwner';
import './styles/main.css';

// Page dédiée aux sauvegardes
function BackupPage() {
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">💾 Gestion des Sauvegardes</div>
      <BackupExport />
      
      <div className="paper-card" style={{ maxWidth: 700, margin: '20px auto' }}>
        <h4 style={{ color: '#e4edfa', marginBottom: 15 }}>📋 Guide d'utilisation</h4>
        <div style={{ color: '#99b2d4', lineHeight: 1.8 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>🔒</span>
              <span><strong>Sécurité :</strong> Seul le propriétaire peut créer des sauvegardes complètes de toutes les données.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>📁</span>
              <span><strong>Localisation :</strong> Les fichiers JSON sont téléchargés dans votre dossier "Téléchargements".</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>📅</span>
              <span><strong>Fréquence :</strong> Sauvegarde complète 1x/semaine, sauvegarde rapide quotidienne recommandée.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>💾</span>
              <span><strong>Format :</strong> Données exportées en JSON (lisible, réimportable, compatible).</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>🔄</span>
              <span><strong>Restauration :</strong> Gardez vos fichiers de sauvegarde en sécurité pour une restauration future.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Page dédiée à la gestion des utilisateurs (votre version existante)
function UsersPage() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <UsersManagement />
    </div>
  );
}

// Page dédiée à la gestion des rôles propriétaire
function GestionRolesPage() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #223049 0%, #344060 100%)" }}>
      <GestionUtilisateurs />
    </div>
  );
}

// Wrapper pour masquer la Navbar sur les pages d'auth, admin et homepage
function AppWrapper() {
  const location = useLocation();
  
  // Pages où la navbar doit être masquée
  const hideNavbar = [
    "/",                    // Page d'accueil
    "/login", 
    "/register", 
    "/accept-invitation"
  ].includes(location.pathname) || location.pathname.startsWith("/admin-");

  return (
    <>
      {!hideNavbar && <Navbar />}
      <div style={{ minHeight: "100vh", background: hideNavbar && location.pathname === "/" ? "transparent" : "#f6f8fa" }}>
        <Routes>
          {/* ========== PAGE D'ACCUEIL ========== */}
          <Route 
            path="/" 
            element={
              <Homepage 
                onLogin={() => window.location.href = '/login'}
                onRegister={() => window.location.href = '/register'}
              />
            } 
          />

          {/* ========== ROUTES D'AUTHENTIFICATION ========== */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/accept-invitation" element={<AcceptInvitation />} />

          {/* ========== DASHBOARD PRINCIPAL (PROTÉGÉ) ========== */}
          <Route 
            path="/dashboard" 
            element={
              <Protected permission="voir_dashboard">
                <Dashboard />
              </Protected>
            } 
          />

          {/* ========== MODULES PRINCIPAUX (PROTÉGÉS) ========== */}
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

          {/* ========== MODULES SECONDAIRES (PROTÉGÉS) ========== */}
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

          {/* ========== GESTION ET ADMINISTRATION (PROTÉGÉS) ========== */}
          
          {/* Paramètres système */}
          <Route
            path="/parametres"
            element={
              <Protected permission="parametres">
                <Parametres />
              </Protected>
            }
          />

          {/* Gestion des sauvegardes */}
          <Route
            path="/backup"
            element={
              <Protected permission="voir_dashboard">
                <BackupPage />
              </Protected>
            }
          />

          {/* Gestion des rôles - PROPRIÉTAIRE UNIQUEMENT */}
          <Route
            path="/gestion-utilisateurs"
            element={
              <Protected permission="gerer_utilisateurs">
                <GestionRolesPage />
              </Protected>
            }
          />

          {/* Gestion utilisateurs (votre version existante) - Docteurs */}
          <Route
            path="/users"
            element={
              <Protected permission="parametres">
                <UsersPage />
              </Protected>
            }
          />

          {/* ========== ROUTES ADMINISTRATIVES TEMPORAIRES ========== */}
          
          {/* Initialisation propriétaire (première fois) */}
          <Route path="/admin-init-owner" element={<InitOwner />} />
          
          {/* Migration société (existant) */}
          <Route path="/admin-update-societe" element={<AddSocieteIdToAllUsers />} />

          {/* ========== REDIRECTIONS ========== */}
          
          {/* Toute autre route non définie redirige vers la page d'accueil */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <UserRoleProvider>
      <Router>
        <AppWrapper />
      </Router>
    </UserRoleProvider>
  );
}

export default App;
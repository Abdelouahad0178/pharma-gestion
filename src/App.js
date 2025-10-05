// src/App.js - Version avec synchro temps réel globale Ventes -> Stock (CORRIGÉE)

import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Pages / composants
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import AcceptInvitation from './components/auth/AcceptInvitation';
import Dashboard from './components/dashboard/Dashboard';
import Achats from './components/achats/Achats';
import StockManagement from './components/stock/StockManagement';
import OrderManagement from './components/stock/OrderManagement';
import Ventes from './components/ventes/Ventes';
import Navbar from './components/Navbar';
import Parametres from './components/parametres/Parametres';
import DevisFactures from './components/devisFactures/DevisFactures';
import Paiements from './components/paiements/Paiements';
import BackupExport from './components/BackupExport';
import ImportBackup from './components/ImportBackup';
import UsersManagement from './components/users/UsersManagement';
import GestionUtilisateurs from './components/admin/GestionUtilisateurs';
import Homepage from './components/Homepage';
import Protected from './components/Protected';
import AddSocieteIdToAllUsers from './components/admin/AddSocieteIdToAllUsers';
import InitOwner from './components/admin/InitOwner';

// Contexte & styles
import { UserRoleProvider, useUserRole } from './contexts/UserRoleContext';
import './styles/main.css';

// 🔗 Synchro temps réel ventes -> stock
import { db } from './firebase/config';
import { attachRealtimeSalesSync } from './lib/realtimeSalesSync';

/* -------------------------------------------
 * Loader de démarrage (UI uniquement)
 * -----------------------------------------*/
const AppLoader = ({ onLoadingComplete, minLoadingTime = 2500 }) => {
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initialisation...');

  const loadingSteps = [
    { progress: 20, text: 'Chargement des ressources...' },
    { progress: 40, text: 'Configuration Firebase...' },
    { progress: 60, text: 'Synchronisation des données...' },
    { progress: 80, text: 'Préparation de l\'interface...' },
    { progress: 100, text: 'Prêt !' }
  ];

  useEffect(() => {
    let currentStep = 0;
    const startTime = Date.now();

    const updateProgress = () => {
      if (currentStep < loadingSteps.length) {
        const step = loadingSteps[currentStep];
        setProgress(step.progress);
        setLoadingText(step.text);
        currentStep++;
        const delay = currentStep === loadingSteps.length ? 500 : Math.random() * 800 + 400;
        setTimeout(updateProgress, delay);
      } else {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minLoadingTime - elapsed);
        setTimeout(() => onLoadingComplete?.(), remaining);
      }
    };

    const t = setTimeout(updateProgress, 300);
    return () => clearTimeout(t);
  }, [minLoadingTime, onLoadingComplete, loadingSteps]);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, color: '#fff', fontFamily: '"Inter",-apple-system,BlinkMacSystemFont,sans-serif'
    }}>
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{
          fontSize: window.innerWidth < 768 ? 28 : 42, fontWeight: 800,
          background: 'linear-gradient(45deg,#fff,#f0f9ff)', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 8,
          textShadow: '0 2px 4px rgba(0,0,0,.1)'
        }}>
          Stock & Gestion
        </div>
        <div style={{ fontSize: window.innerWidth < 768 ? 14 : 16, opacity: .9, fontWeight: 500 }}>
          Synchronisation Avancée
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 30 }}>
        <div style={{
          width: 80, height: 80, border: '4px solid rgba(255,255,255,.3)',
          borderTop: '4px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite'
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 50, height: 50, border: '3px solid rgba(255,255,255,.2)',
          borderRight: '3px solid #fff', borderRadius: '50%', animation: 'spinReverse 1.5s linear infinite'
        }} />
      </div>

      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, minHeight: 25, opacity: .95, textAlign: 'center' }}>
        {loadingText}
      </div>

      <div style={{
        width: window.innerWidth < 768 ? 280 : 350, height: 6,
        background: 'rgba(255,255,255,.2)', borderRadius: 3, overflow: 'hidden', marginBottom: 20
      }}>
        <div style={{
          height: '100%', background: 'linear-gradient(90deg,#fff,#f0f9ff)', borderRadius: 3,
          width: `${progress}%`, transition: 'width .5s ease-out', boxShadow: '0 0 10px rgba(255,255,255,.3)'
        }} />
      </div>

      <div style={{ fontSize: 14, opacity: .8, marginBottom: 30 }}>{progress}%</div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 10, height: 10, background: 'rgba(255,255,255,.7)', borderRadius: '50%',
            animation: `pulse 1.5s ease-in-out ${i * .3}s infinite`
          }} />
        ))}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes spin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
          @keyframes spinReverse { 0%{transform:translate(-50%,-50%) rotate(360deg)} 100%{transform:translate(-50%,-50%) rotate(0)} }
          @keyframes pulse { 0%,100%{transform:scale(1);opacity:.7} 50%{transform:scale(1.3);opacity:1} }
        `
        }}
      />
    </div>
  );
};

/* -------------------------------------------
 * Navigation Stock (onglets)
 * -----------------------------------------*/
function StockPage() {
  const [activeTab, setActiveTab] = useState('stock');

  return (
    <div style={{ minHeight: '100vh' }}>
      <div
        style={{
          background: 'linear-gradient(135deg,#1f2937,#111827)', padding: '16px 20px',
          display: 'flex', gap: 12, boxShadow: '0 4px 6px rgba(0,0,0,.1)', position: 'sticky', top: 0, zIndex: 100
        }}
      >
        <button
          onClick={() => setActiveTab('stock')}
          style={{
            padding: '12px 24px', borderRadius: 12, border: '2px solid transparent',
            background: activeTab === 'stock' ? 'linear-gradient(135deg,#6366f1,#a855f7)' : 'rgba(255,255,255,.1)',
            color: '#fff', fontWeight: 700, cursor: 'pointer', transition: 'all .2s',
            fontSize: window.innerWidth < 768 ? 14 : 16
          }}
          onMouseEnter={(e) => { if (activeTab !== 'stock') e.currentTarget.style.background = 'rgba(255,255,255,.15)'; }}
          onMouseLeave={(e) => { if (activeTab !== 'stock') e.currentTarget.style.background = 'rgba(255,255,255,.1)'; }}
        >
          Gestion du Stock
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          style={{
            padding: '12px 24px', borderRadius: 12, border: '2px solid transparent',
            background: activeTab === 'orders' ? 'linear-gradient(135deg,#6366f1,#a855f7)' : 'rgba(255,255,255,.1)',
            color: '#fff', fontWeight: 700, cursor: 'pointer', transition: 'all .2s',
            fontSize: window.innerWidth < 768 ? 14 : 16
          }}
          onMouseEnter={(e) => { if (activeTab !== 'orders') e.currentTarget.style.background = 'rgba(255,255,255,.15)'; }}
          onMouseLeave={(e) => { if (activeTab !== 'orders') e.currentTarget.style.background = 'rgba(255,255,255,.1)'; }}
        >
          Commandes à Passer
        </button>
      </div>

      {activeTab === 'stock' && <StockManagement />}
      {activeTab === 'orders' && <OrderManagement />}
    </div>
  );
}

/* -------------------------------------------
 * Pages annexes
 * -----------------------------------------*/
function BackupPage() {
  const [currentTab, setCurrentTab] = useState('export');

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Sauvegardes</div>

      <div style={{
        display: 'flex', justifyContent: 'center', marginBottom: 20,
        background: '#2d3748', borderRadius: 10, padding: 5, maxWidth: 400, margin: '0 auto 20px'
      }}>
        <button
          onClick={() => setCurrentTab('export')}
          style={{
            flex: 1, padding: '12px 20px', background: currentTab === 'export' ? '#4CAF50' : 'transparent',
            color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
            fontWeight: currentTab === 'export' ? 'bold' : 'normal', transition: 'all .3s ease'
          }}
        >
          Export
        </button>
        <button
          onClick={() => setCurrentTab('import')}
          style={{
            flex: 1, padding: '12px 20px', background: currentTab === 'import' ? '#2196F3' : 'transparent',
            color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
            fontWeight: currentTab === 'import' ? 'bold' : 'normal', transition: 'all .3s ease'
          }}
        >
          Import
        </button>
      </div>

      {currentTab === 'export' ? (
        <>
          <BackupExport />
          <div className="paper-card" style={{ maxWidth: 700, margin: '20px auto' }}>
            <h4 style={{ color: '#e4edfa', marginBottom: 15 }}>Guide Export</h4>
            <div style={{ color: '#99b2d4', lineHeight: 1.8 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>Sécurité :</span>
                  <span>Seul le propriétaire peut créer des sauvegardes complètes.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>Localisation :</span>
                  <span>Fichiers JSON téléchargés dans "Téléchargements".</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>Fréquence :</span>
                  <span>Sauvegarde complète hebdomadaire recommandée.</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <ImportBackup />
          <div className="paper-card" style={{ maxWidth: 700, margin: '20px auto' }}>
            <h4 style={{ color: '#e4edfa', marginBottom: 15 }}>Guide Import</h4>
            <div style={{ color: '#99b2d4', lineHeight: 1.8 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>Attention :</span>
                  <span>L'import modifie les données selon le mode choisi.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>Format :</span>
                  <span>Fichiers JSON générés par cette application.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>Recommandation :</span>
                  <span>Sauvegarde avant import en mode remplacement.</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UsersPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' }}>
      <UsersManagement />
    </div>
  );
}

function GestionRolesPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#223049 0%,#344060 100%)' }}>
      <GestionUtilisateurs />
    </div>
  );
}

/* -------------------------------------------
 * ✅ Démarrage GLOBAL de la synchro ventes→stock
 *  - S'attache UNE SEULE FOIS dès que user + societeId sont prêts
 *  - Utilise user?.uid comme dépendance (primitive stable)
 *  - Nettoyage automatique au changement de session
 * -----------------------------------------*/
function RealtimeSyncBoot() {
  const { user, societeId, loading } = useUserRole();
  const detachRef = useRef(null);
  const userId = user?.uid; // ✅ Extraction primitive stable

  useEffect(() => {
    // Cleanup immédiat si loading ou pas de session
    if (loading || !userId || !societeId) {
      if (detachRef.current) {
        console.log('[App] 🔌 Détachement sync (session invalide)');
        try { detachRef.current(); } catch {}
        detachRef.current = null;
      }
      return;
    }

    // Éviter double attachement
    if (detachRef.current) {
      console.log('[App] ⚠️ Listener déjà actif, skip re-attachment');
      return;
    }

    // ✅ Attachement unique du listener global
    console.log(`[App] 🔗 Démarrage sync ventes→stock (société: ${societeId.slice(0, 8)}...)`);
    detachRef.current = attachRealtimeSalesSync(db, {
      societeId,
      user: { uid: userId, email: user?.email }, // Passer seulement ce qui est nécessaire
      enabled: true
    });

    // Cleanup au démontage
    return () => {
      if (detachRef.current) {
        console.log('[App] 🔌 Détachement sync (unmount/session change)');
        try { detachRef.current(); } catch {}
        detachRef.current = null;
      }
    };
  }, [userId, societeId, loading, user?.email]); // ✅ Dépendances primitives stables

  return null;
}

/* -------------------------------------------
 * Wrapper Routes (Navbar)
 * -----------------------------------------*/
function AppWrapper() {
  const location = useLocation();

  const hideNavbar = [
    '/',
    '/login',
    '/register',
    '/accept-invitation'
  ].includes(location.pathname) || location.pathname.startsWith('/admin-');

  return (
    <>
      {/* ⚡️ Synchro ventes→stock attachée UNE SEULE FOIS pour toute l'app */}
      <RealtimeSyncBoot />

      {!hideNavbar && <Navbar />}
      <div style={{ minHeight: '100vh', background: hideNavbar && location.pathname === '/' ? 'transparent' : '#f6f8fa' }}>
        <Routes>
          <Route
            path="/"
            element={
              <Homepage
                onLogin={() => (window.location.href = '/login')}
                onRegister={() => (window.location.href = '/register')}
              />
            }
          />

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/accept-invitation" element={<AcceptInvitation />} />

          <Route
            path="/dashboard"
            element={
              <Protected permission="voir_dashboard">
                <Dashboard />
              </Protected>
            }
          />

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

          {/* Stock avec onglets */}
          <Route
            path="/stock"
            element={
              <Protected permission="ajouter_stock">
                <StockPage />
              </Protected>
            }
          />

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

          <Route
            path="/backup"
            element={
              <Protected permission="voir_dashboard">
                <BackupPage />
              </Protected>
            }
          />

          <Route
            path="/import"
            element={
              <Protected permission="voir_dashboard">
                <div className="fullscreen-table-wrap">
                  <div className="fullscreen-table-title">Import de Sauvegarde</div>
                  <ImportBackup />
                </div>
              </Protected>
            }
          />

          <Route
            path="/gestion-utilisateurs"
            element={
              <Protected permission="gerer_utilisateurs">
                <GestionRolesPage />
              </Protected>
            }
          />

          <Route
            path="/users"
            element={
              <Protected permission="parametres">
                <UsersPage />
              </Protected>
            }
          />

          <Route path="/admin-init-owner" element={<InitOwner />} />
          <Route path="/admin-update-societe" element={<AddSocieteIdToAllUsers />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

/* -------------------------------------------
 * App racine
 * -----------------------------------------*/
function App() {
  const [isLoading, setIsLoading] = useState(true);
  const handleLoadingComplete = () => setIsLoading(false);

  if (isLoading) {
    return <AppLoader onLoadingComplete={handleLoadingComplete} minLoadingTime={2500} />;
  }

  return (
    <UserRoleProvider>
      <Router>
        <AppWrapper />
      </Router>
    </UserRoleProvider>
  );
}

export default App;
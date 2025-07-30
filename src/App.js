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

          {/* Modules principaux */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/achats" element={<Achats />} />
          <Route path="/ventes" element={<Ventes />} />
          <Route path="/stock" element={<Stock />} />

          {/* Modules secondaires */}
          <Route path="/devis-factures" element={<DevisFactures />} />
          <Route path="/paiements" element={<Paiements />} />
          <Route path="/parametres" element={<Parametres />} />

          {/* Redirection par défaut */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppWrapper />
    </Router>
  );
}

export default App;

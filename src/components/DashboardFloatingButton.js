// src/components/DashboardFloatingButton.js
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function DashboardFloatingButton() {
  const navigate = useNavigate();
  const location = useLocation();

  // Masquer le bouton sur la page dashboard et login/register
  if (location.pathname === "/dashboard" || 
      location.pathname === "/login" || 
      location.pathname === "/register") {
    return null;
  }

  return (
    <button
      onClick={() => navigate("/dashboard")}
      style={{
        position: "fixed",
        bottom: "25px",
        right: "25px",
        width: "60px",
        height: "60px",
        borderRadius: "50%",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        border: "none",
        boxShadow: "0 8px 25px rgba(102, 126, 234, 0.4)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.5em",
        color: "white",
        zIndex: 1000,
        transition: "all 0.3s ease",
        fontWeight: "bold"
      }}
      onMouseEnter={(e) => {
        e.target.style.transform = "scale(1.1)";
        e.target.style.boxShadow = "0 12px 35px rgba(102, 126, 234, 0.6)";
      }}
      onMouseLeave={(e) => {
        e.target.style.transform = "scale(1)";
        e.target.style.boxShadow = "0 8px 25px rgba(102, 126, 234, 0.4)";
      }}
      title="Retour au Dashboard"
      aria-label="Retour au Dashboard"
    >
      📊
    </button>
  );
}
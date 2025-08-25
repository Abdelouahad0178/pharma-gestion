// src/components/common/FloatingDashboardButton.js
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserRole } from "../../contexts/UserRoleContext";

export default function FloatingDashboardButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, canAccessApp } = useUserRole();

  // Ne pas afficher si :
  // - Utilisateur non connecté ou sans accès
  // - Déjà sur le dashboard
  // - Sur pages auth (login/register)
  const shouldHide = 
    !user || 
    !canAccessApp() || 
    location.pathname === "/dashboard" ||
    location.pathname === "/login" ||
    location.pathname === "/register";

  if (shouldHide) return null;

  const handleClick = () => {
    navigate("/dashboard");
  };

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={handleClick}
        className="floating-dashboard-btn"
        title="Aller au tableau de bord"
        aria-label="Aller au tableau de bord"
        style={{
          position: "fixed",
          bottom: "25px",
          right: "25px",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          border: "none",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          fontSize: "24px",
          cursor: "pointer",
          boxShadow: "0 8px 25px rgba(102, 126, 234, 0.4)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: "scale(1)",
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = "scale(1.1)";
          e.target.style.boxShadow = "0 12px 35px rgba(102, 126, 234, 0.6)";
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = "scale(1)";
          e.target.style.boxShadow = "0 8px 25px rgba(102, 126, 234, 0.4)";
        }}
        onMouseDown={(e) => {
          e.target.style.transform = "scale(0.95)";
        }}
        onMouseUp={(e) => {
          e.target.style.transform = "scale(1.1)";
        }}
      >
        {/* Icône Dashboard */}
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"
            fill="currentColor"
          />
        </svg>
      </button>

      {/* Styles CSS intégrés */}
      <style jsx>{`
        .floating-dashboard-btn {
          animation: float 3s ease-in-out infinite;
        }

        .floating-dashboard-btn:active {
          transform: scale(0.95) !important;
        }

        @keyframes float {
          0% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-3px) scale(1);
          }
          100% {
            transform: translateY(0px) scale(1);
          }
        }

        /* Animation d'apparition */
        @keyframes slideInUp {
          from {
            transform: translateY(100px) scale(0.8);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }

        .floating-dashboard-btn {
          animation: slideInUp 0.5s ease-out, float 3s ease-in-out infinite 0.5s;
        }

        /* Responsive mobile */
        @media (max-width: 768px) {
          .floating-dashboard-btn {
            bottom: 20px !important;
            right: 20px !important;
            width: 56px !important;
            height: 56px !important;
          }
          
          .floating-dashboard-btn svg {
            width: 24px !important;
            height: 24px !important;
          }
        }

        @media (max-width: 480px) {
          .floating-dashboard-btn {
            bottom: 15px !important;
            right: 15px !important;
            width: 50px !important;
            height: 50px !important;
          }
          
          .floating-dashboard-btn svg {
            width: 20px !important;
            height: 20px !important;
          }
        }

        /* Effet de pulsation pour attirer l'attention (optionnel) */
        @keyframes pulse {
          0% {
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
          }
          50% {
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.7);
          }
          100% {
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
          }
        }

        /* Appliquer la pulsation sur certaines pages si nécessaire */
        .floating-dashboard-btn.pulse {
          animation: slideInUp 0.5s ease-out, pulse 2s ease-in-out infinite 0.5s;
        }
      `}</style>
    </>
  );
}
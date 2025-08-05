// src/components/admin/AdminDashboard.js
import React from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "../../contexts/UserRoleContext";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { role, user } = useUserRole();

  // Seuls les docteurs peuvent accéder à cette page
  if (role !== "docteur") {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#a32" }}>
        ⛔ Accès réservé aux administrateurs (Docteur)
      </div>
    );
  }

  const adminTools = [
    {
      title: "🏢 Définir la société",
      description: "Ajouter un ID de société à tous les utilisateurs",
      path: "/admin-update-societe",
      color: "#1976d2"
    },
    {
      title: "🔄 Migration des données",
      description: "Migrer les données vers la structure société partagée",
      path: "/admin-migrate-data",
      color: "#388e3c"
    },
    {
      title: "👥 Gestion des noms",
      description: "Définir ou modifier les noms d'affichage des utilisateurs",
      path: "/admin-update-names",
      color: "#f57c00"
    }
  ];

  return (
    <div style={{ 
      padding: 40, 
      maxWidth: 1000, 
      margin: "0 auto",
      minHeight: "100vh",
      background: "#f5f5f5"
    }}>
      <h1 style={{ 
        color: "#1976d2", 
        marginBottom: 40,
        textAlign: "center",
        fontSize: 36
      }}>
        🛠️ Administration du système
      </h1>

      <div style={{ 
        background: "#e3f2fd", 
        padding: 20, 
        borderRadius: 12, 
        marginBottom: 40,
        border: "2px solid #1976d2"
      }}>
        <p style={{ margin: 0, color: "#0d47a1", fontSize: 18, textAlign: "center" }}>
          👤 Connecté en tant que : <strong>{user?.displayName || user?.email}</strong>
        </p>
      </div>

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 30
      }}>
        {adminTools.map((tool, index) => (
          <div
            key={index}
            onClick={() => navigate(tool.path)}
            style={{
              background: "white",
              borderRadius: 12,
              padding: 30,
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              cursor: "pointer",
              transition: "all 0.3s ease",
              border: `3px solid ${tool.color}20`,
              position: "relative",
              overflow: "hidden"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-5px)";
              e.currentTarget.style.boxShadow = "0 8px 30px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 6,
              background: tool.color
            }} />
            
            <h3 style={{ 
              fontSize: 24, 
              marginBottom: 15,
              color: tool.color
            }}>
              {tool.title}
            </h3>
            
            <p style={{ 
              fontSize: 16, 
              color: "#666",
              lineHeight: 1.6
            }}>
              {tool.description}
            </p>
            
            <div style={{
              marginTop: 20,
              fontSize: 14,
              color: tool.color,
              fontWeight: 600,
              textAlign: "right"
            }}>
              Accéder →
            </div>
          </div>
        ))}
      </div>

      <div style={{ 
        marginTop: 60, 
        padding: 30, 
        background: "#fff3cd", 
        borderRadius: 12,
        border: "2px solid #ffc107"
      }}>
        <h3 style={{ color: "#ff6f00", marginBottom: 15 }}>
          ⚠️ Zone d'administration
        </h3>
        <p style={{ color: "#795548", margin: 0, lineHeight: 1.8 }}>
          Ces outils modifient la structure de votre base de données. 
          Assurez-vous de comprendre l'impact de chaque action avant de l'exécuter. 
          Il est recommandé de faire une sauvegarde de vos données avant toute modification majeure.
        </p>
      </div>

      <div style={{
        marginTop: 40,
        textAlign: "center"
      }}>
        <button
          onClick={() => navigate("/dashboard")}
          style={{
            padding: "12px 30px",
            fontSize: 16,
            background: "#e0e0e0",
            color: "#333",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          ← Retour au tableau de bord
        </button>
      </div>
    </div>
  );
}
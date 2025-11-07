// src/components/Protected.js
import React from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";

/**
 * Protected
 * Props :
 * - permission?: string      → exige une permission
 * - allOf?: string[]         → exige TOUTES ces permissions
 * - anyOf?: string[]         → exige AU MOINS UNE de ces permissions
 * - children: ReactNode
 *
 * Priorité: allOf > anyOf > permission
 */
export default function Protected({ permission, allOf, anyOf, children }) {
  const {
    // états/auth
    authReady,
    loading,
    user,
    role,
    // statuts
    isDeleted,
    isLocked,
    isActive,
    isOwner,
    // helpers
    can,
    canAccessApp,
    getBlockMessage,
  } = useUserRole();

  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  };

  // -------- Helpers permission sets ----------
  const hasAll = (perms) => Array.isArray(perms) && perms.every((p) => can(p));
  const hasAny = (perms) => Array.isArray(perms) && perms.some((p) => can(p));

  const isAllowed = () => {
    if (Array.isArray(allOf) && allOf.length > 0) return hasAll(allOf);
    if (Array.isArray(anyOf) && anyOf.length > 0) return hasAny(anyOf);
    if (typeof permission === "string" && permission.trim()) return can(permission.trim());
    return true; // aucune contrainte explicite
  };

  /* ================== GARDES D’ACCÈS ==================
     1) On attend que l’auth Firebase soit prête (authReady)
     2) On attend que le profil utilisateur (role) soit chargé
     3) On bloque si non connecté / supprimé / verrouillé / inactif
     4) On vérifie la/les permission(s) demandées
  ===================================================== */

  // 1) Auth pas prête → gate
  if (!authReady || loading) {
    return <FullScreenGate text="Initialisation de la session..." />;
  }

  // 2) Non connecté → renvoi login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3) Profil pas encore lu (évite l’accès au Dashboard avant users/{uid})
  if (role == null) {
    return <FullScreenGate text="Chargement de votre profil..." />;
  }

  // 4) Comptes bloqués / inactifs (si pas Owner)
  if (isDeleted || (!isActive && !isOwner) || (isLocked && !isOwner)) {
    return (
      <BlockedCard
        icon={isLocked ? "🔒" : !isActive ? "⏸️" : "🚫"}
        title={
          isLocked
            ? "Compte verrouillé"
            : !isActive
            ? "Compte désactivé"
            : "Accès refusé"
        }
        subtitle={
          getBlockMessage?.() ||
          (isLocked
            ? "Votre compte a été temporairement verrouillé."
            : !isActive
            ? "Votre compte a été désactivé par l'administrateur."
            : "Accès à l'application refusé.")
        }
        onLogout={handleLogout}
      />
    );
  }

  // 5) Permissions
  if (!isAllowed()) {
    return (
      <PermissionDeniedCard
        role={role}
        isOwner={isOwner}
        permission={permission}
        allOf={allOf}
        anyOf={anyOf}
        onBack={() => navigate(-1)}
        onDashboard={() => navigate("/dashboard")}
      />
    );
  }

  // 6) OK
  return <>{children}</>;
}

/* ================== UI Helpers ================== */

function FullScreenGate({ text = "Chargement..." }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg,#0b1220,#1a2540)",
        color: "#e1e6ef",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#0f1b33",
          border: "1px solid #2a3b55",
          borderRadius: 14,
          padding: "22px 26px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: "3px solid rgba(255,255,255,.25)",
            borderTop: "3px solid #7ee4e6",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <div style={{ fontWeight: 700 }}>{text}</div>
      </div>

      <style>{`@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function BlockedCard({ icon = "🚫", title, subtitle, onLogout }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(120deg, #2d1b1b 0%, #3d2020 100%)",
        padding: 24,
        color: "#dc2626",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: "96vw",
          background: "#111f39",
          color: "#ffd1d1",
          border: "1px solid #dc2626",
          borderRadius: 14,
          padding: "22px 26px",
          boxShadow: "0 12px 38px rgba(0,0,0,.45)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 10 }}>{icon}</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{title}</div>
        <div style={{ lineHeight: 1.6, color: "#fca5a5", marginBottom: 16 }}>{subtitle}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={onLogout}
            style={{
              background: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "10px 18px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Se déconnecter
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "10px 18px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Actualiser
          </button>
        </div>
      </div>
    </div>
  );
}

function PermissionDeniedCard({ role, isOwner, permission, allOf, anyOf, onBack, onDashboard }) {
  const buildMessage = () => {
    const map = {
      voir_achats: "Seul le pharmacien peut accéder aux achats",
      gerer_utilisateurs: "Seul le propriétaire peut gérer les utilisateurs",
      parametres: "Seul le pharmacien peut accéder aux paramètres",
      voir_ventes: "Vous n'avez pas accès aux ventes",
      ajouter_stock: "Vous n'avez pas accès à la gestion du stock",
      modifier_roles: "Seul le propriétaire peut modifier les rôles",
    };
    if (Array.isArray(allOf) && allOf.length) {
      return `Permissions requises : toutes (${allOf.join(", ")})`;
    }
    if (Array.isArray(anyOf) && anyOf.length) {
      return `Permissions requises : au moins une parmi (${anyOf.join(", ")})`;
    }
    if (typeof permission === "string" && permission.trim()) {
      return map[permission] || "Permission insuffisante pour cette action";
    }
    return "Permission insuffisante pour cette action";
  };

  // Cas spécial gestion utilisateurs
  if (permission === "gerer_utilisateurs") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(120deg, #2d2416 0%, #3d3020 100%)",
          padding: 24,
          color: "#fbbf24",
        }}
      >
        <div
          style={{
            maxWidth: 640,
            width: "96vw",
            background: "#111f39",
            border: "1px solid rgba(251, 191, 36, 0.4)",
            borderRadius: 14,
            padding: "22px 26px",
            boxShadow: "0 12px 38px rgba(0,0,0,.45)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 10 }}>👑</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Accès restreint — Propriétaire uniquement
          </div>
          <div style={{ lineHeight: 1.6, color: "#fde68a", marginBottom: 14 }}>
            Seul le propriétaire de la société peut gérer les utilisateurs.
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#eab308",
              marginBottom: 16,
              background: "rgba(0,0,0,0.35)",
              padding: "8px 16px",
              borderRadius: 999,
              display: "inline-block",
            }}
          >
            Votre rôle : <strong>{role}</strong> {isOwner ? "(👑 Propriétaire)" : ""}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={onDashboard}
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "10px 18px",
                fontSize: "16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Retour au Dashboard
            </button>
            <button
              onClick={onBack}
              style={{
                background: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "10px 18px",
                fontSize: "16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(120deg, #2d2416 0%, #3d3020 100%)",
        padding: 24,
        color: "#f59e0b",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          width: "96vw",
          background: "#111f39",
          border: "1px solid rgba(245, 158, 11, 0.4)",
          borderRadius: 14,
          padding: "22px 26px",
          boxShadow: "0 12px 38px rgba(0,0,0,.45)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          Permission insuffisante
        </div>
        <div style={{ lineHeight: 1.6, color: "#fcd34d", marginBottom: 12 }}>
          {buildMessage()}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "#fcd34d",
            marginBottom: 16,
            background: "rgba(0,0,0,0.35)",
            padding: "8px 16px",
            borderRadius: 999,
            display: "inline-block",
          }}
        >
          Votre rôle : <strong>{role}</strong> {isOwner ? "(👑 Propriétaire)" : ""}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={onDashboard}
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "10px 18px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retour au Dashboard
          </button>
          <button
            onClick={onBack}
            style={{
              background: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "10px 18px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}

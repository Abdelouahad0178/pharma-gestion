// src/components/auth/Login.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { doc, getDoc } from "firebase/firestore";

const GRACE_MS = 48 * 60 * 60 * 1000; // 48h

function toDateSafe(v) {
  try {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate();
    if (v?.seconds) return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function fmtCountdown(msLeft) {
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function buildPaymentMessage(data) {
  const pw = data?.paymentWarning;
  const isPaid = data?.isPaid === true;
  if (!pw || pw.status !== "active") return null;
  const sentAt = toDateSafe(pw.sentAt);
  if (!sentAt) {
    return "⚠️ Avertissement de paiement actif (48h). Veuillez régler votre facture.";
  }
  const dueAt = new Date(sentAt.getTime() + GRACE_MS);
  const msLeft = Math.max(0, dueAt.getTime() - Date.now());
  const dueTxt = dueAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  if (msLeft > 0) {
    return `⚠️ Avertissement paiement — ${isPaid ? "Payé" : "Impayé"} • échéance ${dueTxt}`;
  }
  return "⛔ Délai 48h dépassé (compte non verrouillé) — régularisez le paiement au plus vite.";
}

function dismissKeyFor(uid, sentAt) {
  const key = sentAt ? String(sentAt.getTime()) : "nosent";
  return `paymentWarning:dismissed:${uid}:${key}`;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [notice, setNotice] = useState(""); // messages généraux (verrouillé/supprimé/inactif/infos)
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Modal d'avertissement paiement (géré SEULEMENT dans Login.js) ---
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState("");
  const [paymentDueAt, setPaymentDueAt] = useState(null);
  const [paymentMsLeft, setPaymentMsLeft] = useState(0);
  const [paymentDismissKey, setPaymentDismissKey] = useState("");
  const [postLoginPath, setPostLoginPath] = useState("/dashboard");
  const navigate = useNavigate();

  // message forcé (verrouillage, etc.)
  useEffect(() => {
    const msg = localStorage.getItem("forcedSignOutMessage");
    if (msg) {
      setNotice(msg);
      localStorage.removeItem("forcedSignOutMessage");
    }
  }, []);

  // tick de compte à rebours quand le modal est ouvert
  useEffect(() => {
    if (!showPaymentModal || !paymentDueAt) return;
    setPaymentMsLeft(Math.max(0, paymentDueAt.getTime() - Date.now()));
    const id = setInterval(() => {
      setPaymentMsLeft(Math.max(0, paymentDueAt.getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [showPaymentModal, paymentDueAt]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      // Connexion Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // Doc Firestore de l'utilisateur
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        setPostLoginPath("/societe");
        navigate("/societe");
        return;
      }

      const data = snap.data();

      // 1) Compte supprimé - STRICT COMME AVANT
      if (data?.deleted === true) {
        const deletedAt = data?.deletedAt
          ? toDateSafe(data.deletedAt)?.toLocaleDateString("fr-FR") ?? "récemment"
          : "récemment";
        const title = "🗑️ Compte supprimé";
        const msg = `Ce compte a été supprimé par l'administrateur le ${deletedAt}. Contactez le support pour plus d'informations.`;
        try { localStorage.setItem("forcedSignOutMessage", `${title} — ${msg}`); } catch {}
        await signOut(auth);
        setNotice(`${title} — ${msg}`);
        setError("Accès refusé : ce compte a été supprimé.");
        setLoading(false);
        return;
      }

      // 2) Compte verrouillé - RENFORCER LA LOGIQUE
      const isLocked = 
        data?.locked === true || 
        data?.isLocked === true || 
        data?.status === "disabled" ||
        data?.actif === false; // Ajouter cette condition pour les vendeuses

      if (isLocked) {
        const title = data?.adminPopup?.title || "🔒 Compte verrouillé";
        const msg = data?.adminPopup?.message || 
          "Votre compte a été verrouillé par l'administrateur. Vous ne pouvez plus accéder à l'application. Veuillez contacter le support.";
        
        try { localStorage.setItem("forcedSignOutMessage", `${title} — ${msg}`); } catch {}
        await signOut(auth);
        setNotice(`${title} — ${msg}`);
        setError("Accès refusé : votre compte est verrouillé.");
        setLoading(false);
        return;
      }

      // 3) Compte inactif - STRICT
      const isInactive = 
        data?.active === false || 
        data?.isActive === false;
        
      if (isInactive) {
        const title = "⏸️ Compte inactif";
        const msg = "Votre compte a été désactivé par l'administrateur. Contactez le support pour réactivation.";
        try { localStorage.setItem("forcedSignOutMessage", `${title} — ${msg}`); } catch {}
        await signOut(auth);
        setNotice(`${title} — ${msg}`);
        setError("Accès refusé : votre compte est inactif.");
        setLoading(false);
        return;
      }

      // 4) Vérification spécifique pour les vendeuses
      const userRole = (data?.role || "").toLowerCase();
      if (["vendeuse", "assistant", "employee"].includes(userRole)) {
        // Vérifications supplémentaires pour les vendeuses
        const hasAccess = 
          data?.actif !== false && // doit être actif
          data?.locked !== true && // pas verrouillé
          data?.isLocked !== true && // pas verrouillé (autre champ)
          data?.status !== "disabled" && // statut non désactivé
          data?.active !== false && // actif
          data?.isActive !== false; // actif (autre champ)

        if (!hasAccess) {
          const title = "🔒 Accès refusé";
          const msg = "Votre compte vendeuse a été désactivé. Contactez votre pharmacien ou administrateur.";
          try { localStorage.setItem("forcedSignOutMessage", `${title} — ${msg}`); } catch {}
          await signOut(auth);
          setNotice(`${title} — ${msg}`);
          setError("Accès refusé : compte vendeuse désactivé.");
          setLoading(false);
          return;
        }
      }

      // Chemin post-login
      const nextPath = data?.societeId ? "/dashboard" : "/societe";
      setPostLoginPath(nextPath);

      // --- Avertissement paiement actif (NON bloquant par lock, mais on affiche le modal ici) ---
      const pw = data?.paymentWarning;
      const isPaid = data?.isPaid === true;
      const isActiveWarning = pw?.status === "active" && !isPaid;

      if (isActiveWarning) {
        const sentAt = toDateSafe(pw?.sentAt);
        const dueAt = sentAt ? new Date(sentAt.getTime() + GRACE_MS) : null;

        // message
        const msg = buildPaymentMessage(data);
        setPaymentMsg(msg || "⚠️ Avertissement de paiement actif (48h).");
        setPaymentDueAt(dueAt);

        // mémorisation fermeture par envoi
        const dKey = dismissKeyFor(uid, sentAt);
        setPaymentDismissKey(dKey);

        const alreadyDismissed = localStorage.getItem(dKey) === "1";
        if (!alreadyDismissed) {
          // garder la main sur la navigation jusqu'à fermeture manuelle
          try {
            localStorage.setItem(
              "paymentNotice",
              JSON.stringify({
                message: msg,
                createdAt: Date.now(),
                user: data?.email || email.trim(),
              })
            );
          } catch {}
          setShowPaymentModal(true);
          setLoading(false);
          return; // STOP: on attend que l'utilisateur ferme manuellement
        }
      } else {
        // Nettoyage éventuel
        try { localStorage.removeItem("paymentNotice"); } catch {}
      }

      // Si tout est OK, on navigue
      navigate(nextPath);
      
    } catch (err) {
      console.error("[Login] Erreur:", err);
      if (err.code === "auth/user-not-found") {
        setError("Aucun compte trouvé avec cet email !");
      } else if (err.code === "auth/wrong-password") {
        setError("Mot de passe incorrect !");
      } else if (err.code === "auth/invalid-email") {
        setError("Email invalide !");
      } else if (err.code === "auth/user-disabled") {
        setError("Ce compte a été désactivé !");
      } else if (err.code === "auth/too-many-requests") {
        setError("Trop de tentatives de connexion. Réessayez plus tard.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Erreur de connexion réseau. Vérifiez votre connexion internet.");
      } else {
        setError("Email ou mot de passe incorrect !");
      }
    } finally {
      setLoading(false);
    }
  };

  // Style du panneau de notice - AJOUTER STYLE POUR VENDEUSE
  const getNoticeStyle = () => {
    const n = (notice || "").toLowerCase();
    if (n.includes("supprimé")) {
      return { border: "1px solid #dc2626", color: "#dc2626", background: "rgba(220, 38, 38, 0.15)", icon: "🗑️" };
    }
    if (n.includes("verrouillé") || n.includes("désactivé")) {
      return { border: "1px solid #f59e0b", color: "#f59e0b", background: "rgba(245, 158, 11, 0.15)", icon: "🔒" };
    }
    if (n.includes("inactif")) {
      return { border: "1px solid #6b7280", color: "#6b7280", background: "rgba(107, 114, 128, 0.15)", icon: "⏸️" };
    }
    if (n.includes("paiement")) {
      return { border: "1px solid #f59e0b", color: "#f59e0b", background: "rgba(245,158,11,0.15)", icon: "⚠️" };
    }
    if (n.includes("refusé")) {
      return { border: "1px solid #dc2626", color: "#dc2626", background: "rgba(220, 38, 38, 0.15)", icon: "🚫" };
    }
    return { border: "1px solid #ffd93d", color: "#ffd93d", background: "rgba(255,217,61,0.15)", icon: "ℹ️" };
  };
  const noticeStyle = getNoticeStyle();

  // Fermer le modal manuellement => mémoriser + naviguer
  const handleClosePaymentModal = () => {
    if (paymentDismissKey) {
      try { localStorage.setItem(paymentDismissKey, "1"); } catch {}
    }
    setShowPaymentModal(false);
    if (postLoginPath) navigate(postLoginPath);
  };

  const expired = useMemo(() => {
    if (!paymentDueAt) return false;
    return paymentDueAt.getTime() - Date.now() <= 0;
  }, [paymentDueAt, paymentMsLeft]);

  return (
    <div
      className="fullscreen-table-wrap"
      style={{
        minHeight: "100vh",
        justifyContent: "center",
        alignItems: "center",
        display: "flex",
        background: "linear-gradient(120deg, #1a2340 0%, #253060 100%)",
      }}
    >
      {/* MODAL: Avertissement de paiement (persiste jusqu'à fermeture manuelle) */}
      {showPaymentModal && (
        <div
          aria-live="polite"
          role="dialog"
          aria-label="Avertissement de paiement"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(600px, 96vw)",
              background: "#0f1b33",
              color: "#ffdd66",
              border: "1px solid #f59e0b",
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
              padding: "18px 18px 14px 18px",
              position: "relative",
            }}
          >
            <button
              onClick={handleClosePaymentModal}
              aria-label="Fermer l'avertissement"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "transparent",
                border: "none",
                color: "#ffd93d",
                fontSize: 20,
                cursor: "pointer",
              }}
            >
              ✕
            </button>

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ fontSize: 26, lineHeight: 1 }}>⚠️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, marginBottom: 6, color: "#ffd93d" }}>
                  Avertissement de paiement
                </div>
                <div style={{ lineHeight: 1.6, color: "#ffeaa7" }}>{paymentMsg}</div>

                {paymentDueAt && (
                  <div
                    style={{
                      marginTop: 10,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid #f59e0b",
                      background: expired ? "rgba(220,38,38,0.15)" : "rgba(245,158,11,0.15)",
                      color: expired ? "#ffb4b4" : "#ffd93d",
                      fontWeight: 700,
                    }}
                  >
                    {expired ? "⛔ Délai dépassé" : "⏳ Temps restant"}
                    {!expired && <span style={{ color: "#fff" }}>{fmtCountdown(paymentMsLeft)}</span>}
                  </div>
                )}

                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a
                    href="#/paiement"
                    style={{
                      textDecoration: "none",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "#ff8b00",
                      color: "#0b1220",
                      fontWeight: 800,
                      border: "1px solid #ff8b00",
                    }}
                  >
                    Régler maintenant
                  </a>

                  <button
                    onClick={handleClosePaymentModal}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "transparent",
                      color: "#ffd93d",
                      border: "1px solid #f59e0b",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    type="button"
                  >
                    J'ai compris
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "#9fb5e1" }}>
                  Cet avertissement restera visible jusqu'à fermeture manuelle. Il réapparaîtra si un nouvel
                  avertissement est envoyé par l'administrateur.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Carte de login */}
      <div
        className="paper-card"
        style={{
          maxWidth: 450,
          width: "96%",
          margin: "0 auto",
          borderRadius: 18,
          padding: "30px 28px 26px 28px",
          position: "relative",
        }}
      >
        {/* Indicateur de statut en haut à droite */}
        {notice && (
          <div
            style={{ position: "absolute", top: "15px", right: "15px", fontSize: "24px" }}
            aria-hidden
          >
            {noticeStyle.icon}
          </div>
        )}

        <div
          className="fullscreen-table-title"
          style={{
            background: "#2d3d56",
            color: "#f1f5fb",
            fontSize: "1.45rem",
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          💊 Gestion Pharmacie
        </div>

        <h3
          style={{
            color: "#7ee4e6",
            textAlign: "center",
            marginBottom: 25,
            fontSize: "1.2rem",
            fontWeight: 600,
          }}
        >
          Connexion à votre compte
        </h3>

        {/* Notice (verrouillage / suppression / inactif / infos) */}
        {notice && (
          <div
            style={{
              margin: "14px auto",
              padding: "12px 15px",
              fontSize: "0.95em",
              borderRadius: 8,
              lineHeight: 1.4,
              ...noticeStyle,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ fontSize: "16px", marginTop: "2px" }}>{noticeStyle.icon}</span>
              <div>{notice}</div>
            </div>
          </div>
        )}

        {/* Erreurs d'auth */}
        {error && (
          <div
            className="status-chip danger"
            style={{
              margin: "14px auto",
              padding: "12px 15px",
              fontSize: "0.95em",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>❌</span>
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleLogin}
          style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 22 }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                color: "#98c4f9",
                fontSize: "0.95em",
                fontWeight: 600,
              }}
            >
              Adresse e-mail
            </label>
            <input
              className="input"
              type="email"
              placeholder="votre@email.com"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{ width: "100%", opacity: loading ? 0.7 : 1 }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 5,
                color: "#98c4f9",
                fontSize: "0.95em",
                fontWeight: 600,
              }}
            >
              Mot de passe
            </label>
            <input
              className="input"
              type="password"
              placeholder="Votre mot de passe"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={{ width: "100%", opacity: loading ? 0.7 : 1 }}
            />
          </div>

          <button
            className="btn"
            style={{
              width: "100%",
              fontSize: "1.1rem",
              marginTop: 10,
              padding: "12px",
              background: loading ? "#4a5a7a" : undefined,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
            }}
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <span>⏳</span>
                <span>Connexion en cours...</span>
              </div>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <div
          style={{
            marginTop: 20,
            color: "#e1e6ef",
            textAlign: "center",
            fontSize: "1.04rem",
          }}
        >
          Pas encore inscrit ?
          <button
            className="btn-neumorph"
            style={{
              background: "transparent",
              color: "#70d6ff",
              border: "none",
              marginLeft: 9,
              fontWeight: 700,
              boxShadow: "none",
              padding: 0,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
            onClick={() => !loading && navigate("/register")}
            onMouseOver={(e) => !loading && (e.target.style.textDecoration = "underline")}
            onMouseOut={(e) => (e.target.style.textDecoration = "none")}
            type="button"
            disabled={loading}
          >
            Créez un compte
          </button>
        </div>

        {/* Section d'aide renforcée pour tous les cas de blocage */}
        {(notice.includes("supprimé") || notice.includes("verrouillé") || notice.includes("inactif") || notice.includes("désactivé") || notice.includes("refusé")) && (
          <div
            style={{
              marginTop: 25,
              padding: 15,
              background: "#1a2b45",
              borderRadius: 10,
              border: "1px solid #dc2626",
            }}
          >
            <h4
              style={{
                color: "#ff6b6b",
                fontSize: "0.95em",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              🆘 Besoin d'aide ?
            </h4>
            <div style={{ color: "#e1e6ef", fontSize: "0.85em", lineHeight: 1.6 }}>
              <strong>Si vous pensez qu'il s'agit d'une erreur :</strong>
              <br />
              • Contactez votre pharmacien ou administrateur
              <br />
              • Vérifiez que vous utilisez le bon email
              <br />
              • Attendez la réactivation par l'administrateur
              <br />
              {notice.includes("vendeuse") && (
                <>
                  <br />
                  <strong>Pour les vendeuses :</strong>
                  <br />
                  • Votre accès peut être géré par votre pharmacien
                  <br />
                  • Contactez directement votre équipe ou pharmacie
                </>
              )}
            </div>
          </div>
        )}

        {!notice && (
          <div
            style={{
              marginTop: 30,
              padding: 15,
              background: "#1a2b45",
              borderRadius: 10,
              border: "1px solid #2a3b55",
            }}
          >
            <h4 style={{ color: "#7ee4e6", fontSize: "0.95em", marginBottom: 10 }}>
              ℹ️ Informations de connexion :
            </h4>
            <div style={{ color: "#e1e6ef", fontSize: "0.85em", lineHeight: 1.6 }}>
              <strong>Première connexion ?</strong>
              <br />
              Vous serez redirigé vers la page de gestion de société pour :
              <br />• Créer votre société (si vous êtes pharmacien)
              <br />• Rejoindre une société (si vous êtes vendeuse)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
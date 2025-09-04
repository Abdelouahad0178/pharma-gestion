// src/components/auth/Login.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
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

  const [notice, setNotice] = useState(""); // messages généraux (info/lock/etc.)
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Modal d'avertissement paiement ---
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState("");
  const [paymentDueAt, setPaymentDueAt] = useState(null);
  const [paymentMsLeft, setPaymentMsLeft] = useState(0);
  const [paymentDismissKey, setPaymentDismissKey] = useState("");
  const [postLoginPath, setPostLoginPath] = useState("/dashboard");

  // --- Modal mot de passe oublié ---
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const navigate = useNavigate();

  // Récupérer un message forcé (ex: lock) placé par d'autres pages
  useEffect(() => {
    try {
      const msg = localStorage.getItem("forcedSignOutMessage");
      if (msg) {
        setNotice(msg);
        localStorage.removeItem("forcedSignOutMessage");
      }
    } catch {}
  }, []);

  // Countdown du modal paiement
  useEffect(() => {
    if (!showPaymentModal || !paymentDueAt) return;
    setPaymentMsLeft(Math.max(0, paymentDueAt.getTime() - Date.now()));
    const id = setInterval(() => {
      setPaymentMsLeft(Math.max(0, paymentDueAt.getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [showPaymentModal, paymentDueAt]);

  const safeSetForcedMessage = (title, msg) => {
    try {
      localStorage.setItem("forcedSignOutMessage", `${title} — ${msg}`);
    } catch {}
  };

  const hardSignOut = async (title, msg, uiError) => {
    try {
      safeSetForcedMessage(title, msg);
      await signOut(auth);
    } catch {}
    setNotice(`${title} — ${msg}`);
    setError(uiError);
    setLoading(false);
  };

  // ================= Post-auth: vérifs, routage, paiement =================
  const runChecksAndMaybeShowPayment = useCallback(
    async (uid, emailFromAuth) => {
      // 1) Charger doc user
      let data = null;
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) data = snap.data() || null;
      } catch (e) {
        console.warn("[Login] Firestore getDoc error:", e);
        data = null;
      }

      // Pas de doc → onboarding société
      if (!data) {
        setPostLoginPath("/societe");
        navigate("/societe");
        setLoading(false);
        return;
      }

      // (a) supprimé
      if (data?.deleted === true) {
        const deletedAtStr =
          data?.deletedAt ? toDateSafe(data.deletedAt)?.toLocaleDateString("fr-FR") ?? "récemment" : "récemment";
        const title = "🗑️ Compte supprimé";
        const msg = `Ce compte a été supprimé par l'administrateur le ${deletedAtStr}. Contactez le support pour plus d'informations.`;
        await hardSignOut(title, msg, "Accès refusé : ce compte a été supprimé.");
        return;
      }

      // (b) verrouillé / désactivé / inactif
      const isLocked =
        data?.locked === true ||
        data?.isLocked === true ||
        data?.status === "disabled" ||
        data?.actif === false;
      if (isLocked) {
        const title = data?.adminPopup?.title || "🔒 Compte verrouillé";
        const msg =
          data?.adminPopup?.message ||
          "Votre compte a été verrouillé par l'administrateur. Veuillez contacter le support.";
        await hardSignOut(title, msg, "Accès refusé : votre compte est verrouillé.");
        return;
      }

      const isInactive = data?.active === false || data?.isActive === false;
      if (isInactive) {
        const title = "⏸️ Compte inactif";
        const msg = "Votre compte a été désactivé par l'administrateur. Contactez le support pour réactivation.";
        await hardSignOut(title, msg, "Accès refusé : votre compte est inactif.");
        return;
      }

      // (c) règles employé(e)
      const role = (data?.role || "").toLowerCase();
      const isEmployee = ["vendeuse", "assistant", "employee", "employe", "employée"].includes(role);
      if (isEmployee) {
        const okAccess =
          data?.actif !== false &&
          data?.locked !== true &&
          data?.isLocked !== true &&
          data?.status !== "disabled" &&
          data?.active !== false &&
          data?.isActive !== false;
        if (!okAccess) {
          const title = "🔒 Accès refusé";
          const msg = "Votre compte employé a été désactivé. Contactez votre pharmacien ou administrateur.";
          await hardSignOut(title, msg, "Accès refusé : compte employé désactivé.");
          return;
        }
      }

      // Routage: pas de société
      let nextPath = "/dashboard";
      if (!data?.societeId) {
        nextPath = isEmployee ? "/invitations" : "/societe";
      }
      setPostLoginPath(nextPath);

      // Avertissement paiement (non-bloquant)
      const pw = data?.paymentWarning;
      const isPaid = data?.isPaid === true;
      const isActiveWarning = pw?.status === "active" && !isPaid;

      if (isActiveWarning) {
        const sentAt = toDateSafe(pw?.sentAt);
        const dueAt = sentAt ? new Date(sentAt.getTime() + GRACE_MS) : null;

        const msg = buildPaymentMessage(data);
        setPaymentMsg(msg || "⚠️ Avertissement de paiement actif (48h).");
        setPaymentDueAt(dueAt);

        const dKey = dismissKeyFor(uid, sentAt);
        setPaymentDismissKey(dKey);

        let alreadyDismissed = false;
        try {
          alreadyDismissed = localStorage.getItem(dKey) === "1";
        } catch {
          alreadyDismissed = false;
        }

        if (!alreadyDismissed) {
          try {
            localStorage.setItem(
              "paymentNotice",
              JSON.stringify({
                message: msg,
                createdAt: Date.now(),
                user: data?.email || emailFromAuth || "",
              })
            );
          } catch {}
          setShowPaymentModal(true);
          setLoading(false);
          return; // attendre fermeture manuelle du modal
        }
      } else {
        try {
          localStorage.removeItem("paymentNotice");
        } catch {}
      }

      // OK → navigate
      navigate(nextPath);
      setLoading(false);
    },
    [navigate]
  );

  // ===================== Email/Password Login =====================
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;
      await runChecksAndMaybeShowPayment(uid, userCredential.user.email || email.trim());
    } catch (err) {
      console.error("[Login] Erreur:", err);
      const c = err?.code;
      if (c === "auth/user-not-found") {
        setError("Aucun compte trouvé avec cet email !");
      } else if (c === "auth/wrong-password") {
        setError("Mot de passe incorrect !");
      } else if (c === "auth/invalid-email") {
        setError("Email invalide !");
      } else if (c === "auth/user-disabled") {
        setError("Ce compte a été désactivé !");
      } else if (c === "auth/too-many-requests") {
        setError("Trop de tentatives de connexion. Réessayez plus tard.");
      } else if (c === "auth/network-request-failed") {
        setError("Erreur de connexion réseau. Vérifiez votre connexion internet.");
      } else {
        setError("Email ou mot de passe incorrect !");
      }
      setLoading(false);
    }
  };

  // ===================== Mot de passe oublié =====================
  const openResetModal = () => {
    setResetEmail(email.trim());
    setShowResetModal(true);
  };

  const handleSendReset = async () => {
    setError("");
    if (!resetEmail) {
      setError("Veuillez saisir votre email pour réinitialiser le mot de passe.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setNotice("📧 Email de réinitialisation envoyé. Vérifiez votre boîte mail.");
      setShowResetModal(false);
    } catch (e) {
      console.error("[Reset Password] error:", e);
      const c = e?.code;
      if (c === "auth/invalid-email") setError("Email invalide.");
      else if (c === "auth/user-not-found") setError("Aucun compte trouvé avec cet email.");
      else setError("Échec d'envoi de l'email de réinitialisation.");
    }
  };

  // Fermer modal paiement → mémoriser dismissal & router
  const handleClosePaymentModal = () => {
    if (paymentDismissKey) {
      try {
        localStorage.setItem(paymentDismissKey, "1");
      } catch {}
    }
    setShowPaymentModal(false);
    if (postLoginPath) navigate(postLoginPath);
  };

  const expired = useMemo(() => {
    if (!paymentDueAt) return false;
    return paymentDueAt.getTime() - Date.now() <= 0;
  }, [paymentDueAt, paymentMsLeft]);

  // Style de la notice (icône + couleurs)
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
      {/* MODAL: Avertissement de paiement */}
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
                    {!expired && <span style={{ color: "#fff", marginLeft: 6 }}>{fmtCountdown(paymentMsLeft)}</span>}
                  </div>
                )}

                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      navigate("/paiement");
                    }}
                    style={{
                      textDecoration: "none",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "#ff8b00",
                      color: "#0b1220",
                      fontWeight: 800,
                      border: "1px solid #ff8b00",
                      cursor: "pointer",
                    }}
                    type="button"
                  >
                    Régler maintenant
                  </button>

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

      {/* MODAL: Mot de passe oublié */}
      {showResetModal && (
        <div
          role="dialog"
          aria-label="Réinitialiser le mot de passe"
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
              width: "min(480px, 96vw)",
              background: "#0f1b33",
              color: "#e1e6ef",
              border: "1px solid #2a3b55",
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
              padding: "18px",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowResetModal(false)}
              aria-label="Fermer"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "transparent",
                border: "none",
                color: "#9fb5e1",
                fontSize: 20,
                cursor: "pointer",
              }}
            >
              ✕
            </button>

            <h3 style={{ marginBottom: 10, color: "#7ee4e6" }}>Réinitialiser le mot de passe</h3>
            <p style={{ marginBottom: 12, fontSize: "0.95em", color: "#cfe0ff" }}>
              Entrez votre adresse e-mail. Nous vous enverrons un lien de réinitialisation.
            </p>

            <input
              type="email"
              placeholder="votre@email.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #2a3b55",
                background: "#0b1220",
                color: "#e1e6ef",
                outline: "none",
                marginBottom: 12,
              }}
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowResetModal(false)}
                type="button"
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "transparent",
                  color: "#9fb5e1",
                  border: "1px solid #2a3b55",
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleSendReset}
                type="button"
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#2dd4bf",
                  color: "#0b1220",
                  border: "1px solid #2dd4bf",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carte de login */}
      <div
        className="paper-card"
        style={{
          maxWidth: 480,
          width: "96%",
          margin: "0 auto",
          borderRadius: 18,
          padding: "30px 28px 26px 28px",
          position: "relative",
        }}
      >
        {/* Icône statut */}
        {notice && (
          <div style={{ position: "absolute", top: "15px", right: "15px", fontSize: "24px" }} aria-hidden>
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

        {/* Notice */}
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

        {/* Erreurs */}
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
              background: "rgba(220, 38, 38, 0.15)",
              color: "#fecaca",
              borderRadius: 8,
              border: "1px solid #dc2626",
            }}
          >
            <span>❌</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 22 }}>
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              className="btn"
              style={{
                flex: 1,
                fontSize: "1.05rem",
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
                  <span>Connexion...</span>
                </div>
              ) : (
                "Se connecter"
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={openResetModal}
            disabled={loading}
            style={{
              marginTop: 8,
              alignSelf: "flex-start",
              background: "transparent",
              border: "none",
              color: "#70d6ff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
              padding: 0,
            }}
            onMouseOver={(e) => !loading && (e.target.style.textDecoration = "underline")}
            onMouseOut={(e) => (e.target.style.textDecoration = "none")}
          >
            Mot de passe oublié ?
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

        {(notice.includes("supprimé") ||
          notice.includes("verrouillé") ||
          notice.includes("inactif") ||
          notice.includes("désactivé") ||
          notice.includes("refusé")) && (
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
            <h4 style={{ color: "#7ee4e6", fontSize: "0.95em", marginBottom: 10 }}>ℹ️ Informations de connexion :</h4>
            <div style={{ color: "#e1e6ef", fontSize: "0.85em", lineHeight: 1.6 }}>
              <strong>Première connexion ?</strong>
              <br />
              Vous serez redirigé vers la page de gestion de société pour :
              <br />• Créer votre société (si vous êtes pharmacien)
              <br />• Rejoindre une société (si vous êtes vendeuse via code d’invitation)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

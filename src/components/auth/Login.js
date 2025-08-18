// src/components/auth/Login.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { doc, getDoc } from "firebase/firestore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(""); // messages d'info/avertissement (ex: verrouillage)
  const [error, setError] = useState("");   // erreurs d'auth (mauvais mdp, etc.)
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Affiche le message si l'utilisateur a été déconnecté automatiquement (verrouillage)
  useEffect(() => {
    const msg = localStorage.getItem("forcedSignOutMessage");
    if (msg) {
      setNotice(msg);
      localStorage.removeItem("forcedSignOutMessage");
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      // Connexion Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // Vérifier l'état "verrouillé" dans Firestore
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        // Pas de doc user => on te laisse créer/associer une société
        navigate("/societe");
        return;
      }

      const data = snap.data();
      const isLocked = data?.locked === true || data?.status === "disabled";
      if (isLocked) {
        // Préparer un message explicite pour l'écran de login
        const title = data?.adminPopup?.title || "🔒 Compte verrouillé";
        const msg =
          data?.adminPopup?.message ||
          "Votre compte a été verrouillé par l’administrateur. Veuillez contacter le support.";
        try {
          localStorage.setItem("forcedSignOutMessage", `${title} — ${msg}`);
        } catch {}

        // Sortir immédiatement et bloquer l'accès
        await signOut(auth);
        setNotice(`${title} — ${msg}`);
        setError("Accès refusé : votre compte est verrouillé.");
        setLoading(false);
        return;
      }

      // Si non verrouillé, continuer le flux d'origine (societeId => dashboard sinon /societe)
      if (data.societeId) {
        navigate("/dashboard");
      } else {
        navigate("/societe");
      }
    } catch (err) {
      console.error("[Login] Erreur:", err);
      // Messages d'erreur personnalisés
      if (err.code === "auth/user-not-found") {
        setError("Aucun compte trouvé avec cet email !");
      } else if (err.code === "auth/wrong-password") {
        setError("Mot de passe incorrect !");
      } else if (err.code === "auth/invalid-email") {
        setError("Email invalide !");
      } else if (err.code === "auth/user-disabled") {
        // Désactivation côté Firebase Auth (cas différent du verrouillage Firestore)
        setError("Ce compte a été désactivé !");
      } else {
        setError("Email ou mot de passe incorrect !");
      }
    } finally {
      setLoading(false);
    }
  };

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
      <div
        className="paper-card"
        style={{
          maxWidth: 450,
          width: "96%",
          margin: "0 auto",
          borderRadius: 18,
          padding: "30px 28px 26px 28px",
        }}
      >
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

        {/* Notice (verrouillage / info admin) */}
        {notice && (
          <div
            className="status-chip warning"
            style={{
              margin: "14px auto",
              padding: "10px 15px",
              fontSize: "0.95em",
              border: "1px solid #ffd93d",
              color: "#ffd93d",
              background: "rgba(255,217,61,0.15)",
              borderRadius: 8,
            }}
          >
            {notice}
          </div>
        )}

        {/* Erreurs d'auth */}
        {error && (
          <div
            className="status-chip danger"
            style={{
              margin: "14px auto",
              padding: "10px 15px",
              fontSize: "0.95em",
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleLogin}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 15,
            marginTop: 22,
          }}
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
              style={{ width: "100%" }}
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
              style={{ width: "100%" }}
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
            }}
            type="submit"
            disabled={loading}
          >
            {loading ? "Connexion en cours..." : "Se connecter"}
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
            }}
            onClick={() => navigate("/register")}
            onMouseOver={(e) => (e.target.style.textDecoration = "underline")}
            onMouseOut={(e) => (e.target.style.textDecoration = "none")}
            type="button"
          >
            Créez un compte
          </button>
        </div>

        <div
          style={{
            marginTop: 30,
            padding: 15,
            background: "#1a2b45",
            borderRadius: 10,
            border: "1px solid #2a3b55",
          }}
        >
          <h4
            style={{
              color: "#7ee4e6",
              fontSize: "0.95em",
              marginBottom: 10,
            }}
          >
            ℹ️ Informations de connexion :
          </h4>
          <div
            style={{
              color: "#e1e6ef",
              fontSize: "0.85em",
              lineHeight: 1.6,
            }}
          >
            <strong>Première connexion ?</strong>
            <br />
            Vous serez redirigé vers la page de gestion de société pour :
            <br />• Créer votre société (si vous êtes pharmacien)
            <br />• Rejoindre une société (si vous êtes vendeuse)
          </div>
        </div>
      </div>
    </div>
  );
}

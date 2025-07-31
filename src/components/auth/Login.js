import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase/config";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Email ou mot de passe incorrect !");
    }
  };

  return (
    <div className="fullscreen-table-wrap" style={{
      minHeight: "100vh", justifyContent: "center", alignItems: "center", display: "flex",
      background: "linear-gradient(120deg, #1a2340 0%, #253060 100%)"
    }}>
      <div className="paper-card" style={{
        maxWidth: 410,
        width: "96%",
        margin: "0 auto",
        borderRadius: 18,
        padding: "30px 28px 26px 28px"
      }}>
        <div className="fullscreen-table-title" style={{
          background: "#2d3d56",
          color: "#f1f5fb",
          fontSize: "1.45rem",
          textAlign: "center"
        }}>
          Connexion à la Gestion Pharmacie
        </div>

        {error &&
          <div className="status-chip danger" style={{ margin: "18px auto" }}>
            {error}
          </div>
        }

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 22 }}>
          <input
            className="input"
            type="email"
            placeholder="Adresse e-mail"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Mot de passe"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button className="btn" style={{ width: "100%", fontSize: "1.1rem" }}>
            Se connecter
          </button>
        </form>

        <div style={{ marginTop: 16, color: "#e1e6ef", textAlign: "center", fontSize: "1.04rem" }}>
          Pas encore inscrit ?
          <button className="btn-neumorph" style={{
            background: "transparent", color: "#70d6ff", border: "none", marginLeft: 9, fontWeight: 700, boxShadow: "none", padding: 0
          }}
            onClick={() => navigate("/register")}
            onMouseOver={e => (e.target.style.textDecoration = "underline")}
            onMouseOut={e => (e.target.style.textDecoration = "none")}
            type="button"
          >
            Créez un compte
          </button>
        </div>
      </div>
    </div>
  );
}

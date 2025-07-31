import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase/config";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas !");
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Erreur lors de la création du compte !");
    }
  };

  return (
    <div className="fullscreen-table-wrap" style={{
      minHeight: "100vh", justifyContent: "center", alignItems: "center", display: "flex",
      background: "linear-gradient(120deg, #19392a 0%, #1e6939 100%)"
    }}>
      <div className="paper-card" style={{
        maxWidth: 410,
        width: "96%",
        margin: "0 auto",
        borderRadius: 18,
        padding: "30px 28px 26px 28px"
      }}>
        <div className="fullscreen-table-title" style={{
          background: "#224d32",
          color: "#f1f5fb",
          fontSize: "1.38rem",
          textAlign: "center"
        }}>
          Créer un compte
        </div>

        {error &&
          <div className="status-chip danger" style={{ margin: "18px auto" }}>
            {error}
          </div>
        }

        <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 22 }}>
          <input
            className="input"
            type="email"
            placeholder="Adresse e-mail"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Mot de passe"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Confirmer le mot de passe"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
          />
          <button className="btn" style={{ width: "100%", fontSize: "1.1rem" }}>
            S'inscrire
          </button>
        </form>

        <div style={{ marginTop: 16, color: "#e1e6ef", textAlign: "center", fontSize: "1.04rem" }}>
          Vous avez déjà un compte ?
          <button className="btn-neumorph" style={{
            background: "transparent", color: "#5bed98", border: "none", marginLeft: 9, fontWeight: 700, boxShadow: "none", padding: 0
          }}
            onClick={() => navigate("/login")}
            onMouseOver={e => (e.target.style.textDecoration = "underline")}
            onMouseOut={e => (e.target.style.textDecoration = "none")}
            type="button"
          >
            Connectez-vous
          </button>
        </div>
      </div>
    </div>
  );
}

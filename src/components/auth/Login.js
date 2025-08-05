// src/components/auth/Login.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { doc, getDoc } from "firebase/firestore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      // Connexion avec Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Vérifier si l'utilisateur a une société
      const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log("[Login] Connexion réussie, données utilisateur:", userData);
        
        if (userData.societeId) {
          // L'utilisateur a une société, aller au dashboard
          console.log("[Login] Société trouvée, redirection vers dashboard");
          navigate("/dashboard");
        } else {
          // Pas de société, aller à la page de gestion société
          console.log("[Login] Pas de société, redirection vers /societe");
          navigate("/societe");
        }
      } else {
        // Document utilisateur n'existe pas (ne devrait pas arriver)
        console.log("[Login] Document utilisateur introuvable, redirection vers /societe");
        navigate("/societe");
      }
    } catch (err) {
      console.error("[Login] Erreur:", err);
      
      // Messages d'erreur personnalisés
      if (err.code === 'auth/user-not-found') {
        setError("Aucun compte trouvé avec cet email !");
      } else if (err.code === 'auth/wrong-password') {
        setError("Mot de passe incorrect !");
      } else if (err.code === 'auth/invalid-email') {
        setError("Email invalide !");
      } else if (err.code === 'auth/user-disabled') {
        setError("Ce compte a été désactivé !");
      } else {
        setError("Email ou mot de passe incorrect !");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fullscreen-table-wrap" style={{
      minHeight: "100vh", 
      justifyContent: "center", 
      alignItems: "center", 
      display: "flex",
      background: "linear-gradient(120deg, #1a2340 0%, #253060 100%)"
    }}>
      <div className="paper-card" style={{
        maxWidth: 450,
        width: "96%",
        margin: "0 auto",
        borderRadius: 18,
        padding: "30px 28px 26px 28px"
      }}>
        <div className="fullscreen-table-title" style={{
          background: "#2d3d56",
          color: "#f1f5fb",
          fontSize: "1.45rem",
          textAlign: "center",
          marginBottom: 20
        }}>
          💊 Gestion Pharmacie
        </div>
        
        {/* Titre secondaire */}
        <h3 style={{
          color: "#7ee4e6",
          textAlign: "center",
          marginBottom: 25,
          fontSize: "1.2rem",
          fontWeight: 600
        }}>
          Connexion à votre compte
        </h3>

        {error && (
          <div className="status-chip danger" style={{ 
            margin: "18px auto",
            padding: "10px 15px",
            fontSize: "0.95em"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ 
          display: "flex", 
          flexDirection: "column", 
          gap: 15, 
          marginTop: 22 
        }}>
          <div>
            <label style={{ 
              display: "block", 
              marginBottom: 5, 
              color: "#98c4f9",
              fontSize: "0.95em",
              fontWeight: 600
            }}>
              Adresse e-mail
            </label>
            <input
              className="input"
              type="email"
              placeholder="votre@email.com"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{ width: "100%" }}
            />
          </div>
          
          <div>
            <label style={{ 
              display: "block", 
              marginBottom: 5, 
              color: "#98c4f9",
              fontSize: "0.95em",
              fontWeight: 600
            }}>
              Mot de passe
            </label>
            <input
              className="input"
              type="password"
              placeholder="Votre mot de passe"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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
              background: loading ? "#4a5a7a" : undefined
            }}
            type="submit"
            disabled={loading}
          >
            {loading ? "Connexion en cours..." : "Se connecter"}
          </button>
        </form>

        <div style={{ 
          marginTop: 20, 
          color: "#e1e6ef", 
          textAlign: "center", 
          fontSize: "1.04rem" 
        }}>
          Pas encore inscrit ?
          <button className="btn-neumorph" style={{
            background: "transparent", 
            color: "#70d6ff", 
            border: "none", 
            marginLeft: 9, 
            fontWeight: 700, 
            boxShadow: "none", 
            padding: 0
          }}
            onClick={() => navigate("/register")}
            onMouseOver={e => (e.target.style.textDecoration = "underline")}
            onMouseOut={e => (e.target.style.textDecoration = "none")}
            type="button"
          >
            Créez un compte
          </button>
        </div>
        
        {/* Informations d'aide */}
        <div style={{ 
          marginTop: 30, 
          padding: 15, 
          background: "#1a2b45", 
          borderRadius: 10,
          border: "1px solid #2a3b55"
        }}>
          <h4 style={{ 
            color: "#7ee4e6", 
            fontSize: "0.95em", 
            marginBottom: 10 
          }}>
            ℹ️ Informations de connexion :
          </h4>
          <div style={{ 
            color: "#e1e6ef", 
            fontSize: "0.85em",
            lineHeight: 1.6
          }}>
            <strong>Première connexion ?</strong><br/>
            Vous serez redirigé vers la page de gestion de société pour :<br/>
            • Créer votre société (si vous êtes pharmacien)<br/>
            • Rejoindre une société (si vous êtes vendeuse)
          </div>
        </div>
      </div>
    </div>
  );
}
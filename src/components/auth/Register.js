// src/components/auth/Register.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { doc, setDoc } from "firebase/firestore";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    
    // Validation
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas !");
      return;
    }
    
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères !");
      return;
    }
    
    setLoading(true);
    
    try {
      // Créer le compte Firebase Auth
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      
      // Créer le document utilisateur dans Firestore
      // Pas de rôle ni de société définis à ce stade
      await setDoc(doc(db, "users", userCred.user.uid), {
        email,
        role: null, // Le rôle sera défini lors de la création/jonction de société
        societeId: null, // Pas de société par défaut
        createdAt: new Date()
      });
      
      console.log("[Register] Compte créé avec succès, redirection vers /societe");
      
      // Rediriger vers la page de gestion de société
      navigate("/societe");
    } catch (err) {
      console.error("[Register] Erreur:", err);
      
      // Messages d'erreur plus explicites
      if (err.code === 'auth/email-already-in-use') {
        setError("Cette adresse email est déjà utilisée !");
      } else if (err.code === 'auth/invalid-email') {
        setError("Adresse email invalide !");
      } else if (err.code === 'auth/weak-password') {
        setError("Mot de passe trop faible !");
      } else {
        setError("Erreur lors de la création du compte. Veuillez réessayer.");
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
      background: "linear-gradient(120deg, #19392a 0%, #1e6939 100%)"
    }}>
      <div className="paper-card" style={{
        maxWidth: 450,
        width: "96%",
        margin: "0 auto",
        borderRadius: 18,
        padding: "30px 28px 26px 28px"
      }}>
        <div className="fullscreen-table-title" style={{
          background: "#224d32",
          color: "#f1f5fb",
          fontSize: "1.38rem",
          textAlign: "center",
          marginBottom: 10
        }}>
          Créer un compte
        </div>
        
        {/* Information sur le processus */}
        <div style={{ 
          background: "#1a3a2a", 
          borderRadius: 10, 
          padding: 15, 
          marginBottom: 20,
          border: "1px solid #2a5a3a"
        }}>
          <p style={{ 
            color: "#98c4f9", 
            fontSize: "0.9em", 
            margin: 0,
            lineHeight: 1.5
          }}>
            ℹ️ <strong>Information importante :</strong><br/>
            Après la création de votre compte, vous pourrez :<br/>
            • <strong>Créer une société</strong> si vous êtes pharmacien<br/>
            • <strong>Rejoindre une société</strong> si vous êtes vendeuse
          </p>
        </div>

        {error && (
          <div className="status-chip danger" style={{ 
            margin: "18px auto",
            padding: "10px 15px",
            fontSize: "0.95em"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} style={{ 
          display: "flex", 
          flexDirection: "column", 
          gap: 13, 
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
              autoComplete="email"
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
              placeholder="Minimum 6 caractères"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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
              Confirmer le mot de passe
            </label>
            <input
              className="input"
              type="password"
              placeholder="Retapez le mot de passe"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
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
              padding: "12px"
            }}
            type="submit"
            disabled={loading}
          >
            {loading ? "Création en cours..." : "S'inscrire"}
          </button>
        </form>

        <div style={{ 
          marginTop: 20, 
          color: "#e1e6ef", 
          textAlign: "center", 
          fontSize: "1.04rem" 
        }}>
          Vous avez déjà un compte ?
          <button className="btn-neumorph" style={{
            background: "transparent", 
            color: "#5bed98", 
            border: "none", 
            marginLeft: 9, 
            fontWeight: 700, 
            boxShadow: "none", 
            padding: 0
          }}
            onClick={() => navigate("/login")}
            onMouseOver={e => (e.target.style.textDecoration = "underline")}
            onMouseOut={e => (e.target.style.textDecoration = "none")}
            type="button"
          >
            Connectez-vous
          </button>
        </div>
        
        {/* Guide d'utilisation */}
        <div style={{ 
          marginTop: 25, 
          padding: 15, 
          background: "#1a2b3a", 
          borderRadius: 10,
          border: "1px solid #2a3b4a"
        }}>
          <h4 style={{ 
            color: "#7ee4e6", 
            fontSize: "0.95em", 
            marginBottom: 10 
          }}>
            📚 Guide rapide :
          </h4>
          <div style={{ 
            color: "#e1e6ef", 
            fontSize: "0.85em",
            lineHeight: 1.6
          }}>
            <strong>👨‍⚕️ Pharmaciens :</strong> Après inscription, créez votre société<br/>
            <strong>👩‍💼 Vendeuses :</strong> Après inscription, rejoignez avec le code fourni
          </div>
        </div>
      </div>
    </div>
  );
}
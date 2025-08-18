// src/pages/Societe.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth"; // Très utile pour avoir l'état de l'utilisateur
import { auth, db } from "../firebase/config";
import {
  doc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

// Helper pour générer un code simple et lisible
const generateJoinCode = () => {
  return (Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8)).substring(0, 6).toUpperCase();
};

export default function Societe() {
  const [user, loadingAuth] = useAuthState(auth); // Hook pour obtenir l'utilisateur actuel
  const [view, setView] = useState("choice"); // 'choice', 'create', 'join'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // États pour les formulaires
  const [nomSociete, setNomSociete] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const navigate = useNavigate();

  // Fonction pour le pharmacien qui crée sa société
  const handleCreateSociete = async (e) => {
    e.preventDefault();
    if (!nomSociete.trim()) {
      setError("Le nom de la pharmacie est requis.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const newCode = generateJoinCode();
      
      // 1. Créer la nouvelle société dans la collection "societes"
      const societeRef = await addDoc(collection(db, "societes"), {
        nom: nomSociete.trim(),
        ownerId: user.uid,
        codeAdhesion: newCode,
        createdAt: new Date(),
      });

      // 2. Mettre à jour le document de l'utilisateur (pharmacien)
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { 
        role: "pharmacien", 
        societeId: societeRef.id 
      });

      navigate("/dashboard"); // Redirection vers le tableau de bord
    } catch (err) {
      console.error("Erreur création société:", err);
      setError("Impossible de créer la société. Veuillez réessayer.");
      setLoading(false);
    }
  };

  // Fonction pour la vendeuse qui rejoint une société
  const handleJoinSociete = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
        setError("Veuillez entrer un code d'invitation.");
        return;
    }
    setLoading(true);
    setError("");

    try {
      // 1. Chercher la société avec ce code
      const q = query(collection(db, "societes"), where("codeAdhesion", "==", joinCode.trim().toUpperCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError("Code invalide. Vérifiez le code et réessayez.");
        setLoading(false);
        return;
      }

      // 2. Société trouvée, on met à jour le document de l'utilisateur
      const societeDoc = querySnapshot.docs[0];
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { 
        role: "vendeuse", 
        societeId: societeDoc.id 
      });

      navigate("/dashboard");

    } catch (err) {
        console.error("Erreur pour rejoindre société:", err);
        setError("Une erreur est survenue. Veuillez réessayer.");
        setLoading(false);
    }
  };
  
  // Affichage pendant le chargement de l'état d'authentification
  if (loadingAuth) {
    return <p>Chargement...</p>;
  }

  // Si l'utilisateur n'est pas connecté pour une raison quelconque
  if (!user) {
    navigate("/login");
    return null;
  }
  
  // Le JSX pour l'interface (similaire à votre style de Register.js)
  return (
    <div className="fullscreen-table-wrap" style={{ /* ... même style que Register.js ... */ }}>
      <div className="paper-card" style={{ maxWidth: 500, /* ... etc ... */ }}>
        {view === 'choice' && (
          <div>
            <h3>Bienvenue, {user.email} !</h3>
            <p>Veuillez choisir votre rôle pour finaliser votre inscription.</p>
            <button className="btn" onClick={() => setView('create')}>Je suis Pharmacien (Créer une société)</button>
            <button className="btn" onClick={() => setView('join')} style={{marginTop: 15}}>Je suis Vendeuse (Rejoindre une société)</button>
          </div>
        )}

        {view === 'create' && (
           <form onSubmit={handleCreateSociete}>
              <h3>Créer votre pharmacie</h3>
              <input className="input" type="text" value={nomSociete} onChange={(e) => setNomSociete(e.target.value)} placeholder="Nom de la pharmacie" required />
              <button className="btn" type="submit" disabled={loading}>{loading ? "Création..." : "Valider et Créer"}</button>
              <button type="button" onClick={() => setView("choice")}>Retour</button>
           </form>
        )}

        {view === 'join' && (
           <form onSubmit={handleJoinSociete}>
              <h3>Rejoindre une pharmacie</h3>
              <p>Entrez le code à 6 caractères fourni par votre pharmacien.</p>
              <input className="input" type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="CODE123" required />
              <button className="btn" type="submit" disabled={loading}>{loading ? "Vérification..." : "Rejoindre"}</button>
              <button type="button" onClick={() => setView("choice")}>Retour</button>
           </form>
        )}

        {error && <div className="status-chip danger" style={{marginTop: 20}}>{error}</div>}
      </div>
    </div>
  );
}
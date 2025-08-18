// src/components/admin/GestionSociete.js
import React, { useState, useEffect, useCallback } from "react";
import { db } from "../../firebase/config";
import { doc, getDoc, updateDoc } from "firebase/firestore";

// Réutiliser la même fonction de génération
const generateJoinCode = () => {
  return (Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8)).substring(0, 6).toUpperCase();
};

export default function GestionSociete({ userData }) { // On passe les données de l'utilisateur en props
  const [societe, setSociete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchSocieteData = useCallback(async () => {
    if (!userData || !userData.societeId) return;
    try {
      const societeRef = doc(db, "societes", userData.societeId);
      const docSnap = await getDoc(societeRef);
      if (docSnap.exists()) {
        setSociete({ id: docSnap.id, ...docSnap.data() });
      } else {
        setError("Données de la société introuvables.");
      }
    } catch (err) {
      setError("Erreur de chargement des données de la société.");
    } finally {
      setLoading(false);
    }
  }, [userData]);

  useEffect(() => {
    fetchSocieteData();
  }, [fetchSocieteData]);

  const handleGenerateNewCode = async () => {
    if (!societe) return;
    setLoading(true);
    const newCode = generateJoinCode();
    try {
      const societeRef = doc(db, "societes", societe.id);
      await updateDoc(societeRef, { codeAdhesion: newCode });
      setSociete(prev => ({ ...prev, codeAdhesion: newCode })); // Mise à jour instantanée de l'UI
    } catch (err) {
      setError("Impossible de générer un nouveau code.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Chargement des informations de la société...</p>;
  if (error) return <p className="status-chip danger">{error}</p>;
  if (!societe) return null;

  return (
    <div style={{ /* Style de votre choix pour une carte dans le dashboard */ }}>
      <h3>Gestion de la Société</h3>
      <p><strong>Nom :</strong> {societe.nom}</p>
      <hr/>
      <h4>Code d'invitation actuel</h4>
      <p>Partagez ce code avec les nouvelles vendeuses pour qu'elles rejoignent votre pharmacie.</p>
      
      <div style={{ background: "#eef", padding: "15px", borderRadius: "8px", textAlign: "center", border: "1px solid #ccd" }}>
        <strong style={{ fontSize: "1.5em", letterSpacing: "3px" }}>{societe.codeAdhesion}</strong>
      </div>

      <button onClick={handleGenerateNewCode} disabled={loading} style={{marginTop: 15}}>
        {loading ? "Génération..." : "Générer un nouveau code"}
      </button>

      <p style={{fontSize: "0.9em", color: "gray", marginTop: 10}}>
        ℹ️ Si une vendeuse quitte la société, générez un nouveau code pour invalider l'ancien.
      </p>
    </div>
  );
}
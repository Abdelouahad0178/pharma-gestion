// src/components/admin/InitOwner.js
import React, { useState } from "react";
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../../firebase/config";

// Pour être sûr qu'on a bien l'instance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function InitOwner() {
  const [status, setStatus] = useState("");
  const [societeId, setSocieteId] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInitOwner = async () => {
    if (!societeId || !ownerEmail) {
      setStatus("Veuillez renseigner l'ID de société et l'email du propriétaire.");
      return;
    }
    
    setLoading(true);
    try {
      // Rechercher l'utilisateur par email et societeId
      const q = query(
        collection(db, "users"), 
        where("email", "==", ownerEmail),
        where("societeId", "==", societeId)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setStatus(`Aucun utilisateur trouvé avec l'email ${ownerEmail} dans la société ${societeId}`);
        setLoading(false);
        return;
      }

      // Mettre à jour le premier utilisateur trouvé comme propriétaire
      const userDoc = snapshot.docs[0];
      await updateDoc(doc(db, "users", userDoc.id), { 
        isOwner: true,
        role: "docteur" // S'assurer qu'il est docteur
      });

      setStatus(`✅ ${ownerEmail} a été défini comme propriétaire de la société ${societeId}`);
    } catch (e) {
      setStatus("❌ Erreur : " + e.message);
    }
    setLoading(false);
  };

  const handleResetAllOwners = async () => {
    if (!window.confirm("⚠️ ATTENTION: Ceci va retirer le statut de propriétaire à TOUS les utilisateurs. Êtes-vous sûr ?")) {
      return;
    }

    setLoading(true);
    try {
      const usersCol = collection(db, "users");
      const snapshot = await getDocs(usersCol);
      let count = 0;
      for (const userDoc of snapshot.docs) {
        await updateDoc(doc(db, "users", userDoc.id), { isOwner: false });
        count++;
      }
      setStatus(`🔄 Statut propriétaire retiré pour ${count} utilisateurs.`);
    } catch (e) {
      setStatus("❌ Erreur : " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: "50px auto", background: "#fff", borderRadius: 8 }}>
      <h2>🔧 Initialiser le Propriétaire</h2>
      
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
          ID de la Société :
        </label>
        <input
          placeholder="ex: my-pharma-1"
          value={societeId}
          onChange={e => setSocieteId(e.target.value)}
          style={{ width: "100%", marginBottom: 15, padding: 10, fontSize: 16 }}
          disabled={loading}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>
          Email du Propriétaire :
        </label>
        <input
          type="email"
          placeholder="proprietaire@exemple.com"
          value={ownerEmail}
          onChange={e => setOwnerEmail(e.target.value)}
          style={{ width: "100%", marginBottom: 15, padding: 10, fontSize: 16 }}
          disabled={loading}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button 
          className="btn" 
          onClick={handleInitOwner} 
          disabled={loading || !societeId || !ownerEmail}
          style={{ flex: 1 }}
        >
          {loading ? "Traitement..." : "🏆 Définir comme Propriétaire"}
        </button>
        
        <button 
          className="btn danger" 
          onClick={handleResetAllOwners} 
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? "Traitement..." : "🔄 Reset Tous Propriétaires"}
        </button>
      </div>

      {status && (
        <div style={{ 
          marginTop: 20, 
          color: status.includes("❌") ? "#d32f2f" : "#2e7d32",
          backgroundColor: status.includes("❌") ? "#ffebee" : "#e8f5e8",
          padding: 15,
          borderRadius: 8,
          border: `1px solid ${status.includes("❌") ? "#ffcdd2" : "#c8e6c9"}`
        }}>
          {status}
        </div>
      )}

      <div style={{ marginTop: 30, fontSize: 14, color: "#666", lineHeight: 1.5 }}>
        <h4>ℹ️ Instructions :</h4>
        <ol>
          <li><strong>Première utilisation :</strong> Définissez le premier docteur de chaque société comme propriétaire</li>
          <li><strong>Le propriétaire pourra :</strong> Promouvoir des vendeuses au rang de docteur</li>
          <li><strong>Les docteurs promus :</strong> Auront les mêmes droits qu'un docteur, mais ne pourront pas gérer les utilisateurs</li>
          <li><strong>Reset :</strong> Utilisez le bouton reset uniquement en cas d'erreur</li>
        </ol>
      </div>
    </div>
  );
}
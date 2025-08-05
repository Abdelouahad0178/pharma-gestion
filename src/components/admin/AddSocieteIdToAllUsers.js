// src/components/admin/AddSocieteIdToAllUsers.js
import React, { useState } from "react";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../../firebase/config"; // Ajuste l'import si nécessaire

// Pour être sûr qu'on a bien l'instance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function AddSocieteIdToAllUsers() {
  const [status, setStatus] = useState("");
  const [societeId, setSocieteId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    if (!societeId) {
      setStatus("Veuillez renseigner un societeId commun.");
      return;
    }
    setLoading(true);
    try {
      const usersCol = collection(db, "users");
      const snapshot = await getDocs(usersCol);
      let count = 0;
      for (const userDoc of snapshot.docs) {
        await updateDoc(doc(db, "users", userDoc.id), { societeId });
        count++;
      }
      setStatus(`Mise à jour terminée : ${count} utilisateurs modifiés.`);
    } catch (e) {
      setStatus("Erreur : " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: "50px auto", background: "#fff", borderRadius: 8 }}>
      <h2>🛠 Ajouter <code>societeId</code> à tous les utilisateurs</h2>
      <input
        placeholder="societeId commun (ex : my-pharma-1)"
        value={societeId}
        onChange={e => setSocieteId(e.target.value)}
        style={{ width: "100%", marginBottom: 15, padding: 7, fontSize: 18 }}
        disabled={loading}
      />
      <button className="btn" onClick={handleUpdate} disabled={loading || !societeId}>
        {loading ? "Mise à jour..." : "Lancer la mise à jour"}
      </button>
      <div style={{ marginTop: 20, color: "#bc3453" }}>{status}</div>
      <div style={{ marginTop: 30, fontSize: 14, color: "#888" }}>
        <b>⚠️ Attention</b> : Cette action mettra le même <code>societeId</code> sur <b>tous</b> tes utilisateurs.
      </div>
    </div>
  );
}

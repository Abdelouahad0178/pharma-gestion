import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { doc, setDoc, getDoc } from "firebase/firestore";

export default function Parametres() {
  const [entete, setEntete] = useState("");
  const [pied, setPied] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchParams = async () => {
      const ref = doc(db, "parametres", "documents");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setEntete(data.entete || "");
        setPied(data.pied || "");
      }
    };
    fetchParams();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    await setDoc(doc(db, "parametres", "documents"), { entete, pied });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Paramètres des Documents</div>
      <div className="paper-card" style={{ maxWidth: 650, margin: "35px auto" }}>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <label style={{ fontWeight: 700, marginBottom: 2, color: "#98c4f9" }}>Entête du document :</label>
          <textarea
            className="input"
            style={{ minHeight: 62, resize: "vertical" }}
            rows={3}
            value={entete}
            onChange={(e) => setEntete(e.target.value)}
            placeholder="Ex : Pharmacie ABC, RC 12345, Adresse..."
            required
          />
          <label style={{ fontWeight: 700, marginBottom: 2, color: "#98c4f9" }}>Pied de page du document :</label>
          <textarea
            className="input"
            style={{ minHeight: 62, resize: "vertical" }}
            rows={3}
            value={pied}
            onChange={(e) => setPied(e.target.value)}
            placeholder="Ex : Merci pour votre confiance !"
            required
          />
          <button type="submit" className="btn" style={{ marginTop: 16, width: 180 }}>Enregistrer</button>
          {saved && (
            <div className="status-chip success" style={{ marginTop: 8, alignSelf: "center" }}>
              ✅ Paramètres enregistrés !
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

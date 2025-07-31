import React, { useEffect, useState, useCallback } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  addDoc,
  Timestamp,
  query,
  where,
} from "firebase/firestore";

export default function Paiements() {
  const [relatedTo, setRelatedTo] = useState("achats");
  const [paiements, setPaiements] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFiltres, setShowFiltres] = useState(false);
  const [totalBonSelectionne, setTotalBonSelectionne] = useState(0);
  const [selectedPhone, setSelectedPhone] = useState("");

  // Charger docs achats/ventes selon type choisi
  const fetchDocuments = useCallback(async () => {
    const col = relatedTo === "achats" ? "achats" : "ventes";
    const snap = await getDocs(collection(db, col));
    let arr = [];
    snap.forEach((doc) => {
      const data = doc.data();
      if (Array.isArray(data.articles) && data.articles.some(a => (typeof a.quantite === "number" && (a.prixAchat || a.prixUnitaire)))) {
        arr.push({ id: doc.id, ...data });
      }
    });
    setDocuments(arr);
  }, [relatedTo]);

  // Charger paiements liés au type
  const fetchPaiements = useCallback(async () => {
    const q = query(collection(db, "paiements"), where("type", "==", relatedTo));
    const snap = await getDocs(q);
    let arr = [];
    snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
    setPaiements(arr);
  }, [relatedTo]);

  useEffect(() => {
    fetchDocuments();
    fetchPaiements();
    setSelectedDoc("");
    setTotalBonSelectionne(0);
    setSelectedPhone("");
  }, [relatedTo, fetchDocuments, fetchPaiements]);

  // Calcul du total d'un doc (articles)
  const getTotalDoc = (doc) => {
    if (!doc || !Array.isArray(doc.articles) || doc.articles.length === 0) return 0;
    return doc.articles.reduce((sum, a) => {
      const prix = relatedTo === "achats" ? Number(a.prixAchat || 0) : Number(a.prixUnitaire || 0);
      const quantite = Number(a.quantite || 0);
      const remise = Number(a.remise || 0);
      return sum + (prix * quantite - remise);
    }, 0);
  };

  // Paiements regroupés par document
  const paiementsByDoc = {};
  paiements.forEach((p) => {
    if (!paiementsByDoc[p.docId]) paiementsByDoc[p.docId] = [];
    paiementsByDoc[p.docId].push(p);
  });

  // Liste de docs affichés (filtrage par statut)
  const docsAffiches = documents.filter((doc) => {
    const total = getTotalDoc(doc);
    const paid = (paiementsByDoc[doc.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
    const solde = total - paid;
    if (filterStatus === "paid") return solde <= 0;
    if (filterStatus === "due") return solde > 0;
    return true;
  });

  // Sélection du doc (affiche total et téléphone)
  const handleSelectDoc = (docId) => {
    setSelectedDoc(docId);
    const doc = documents.find((d) => d.id === docId);
    if (doc) {
      const total = getTotalDoc(doc);
      setTotalBonSelectionne(total);
      setSelectedPhone(
        (relatedTo === "achats" ? doc.telephone : doc.telephoneClient) ||
        doc.telephone ||
        ""
      );
    } else {
      setTotalBonSelectionne(0);
      setSelectedPhone("");
    }
  };

  // Ajout paiement
  const handleAddPaiement = async (e) => {
    e.preventDefault();
    if (!selectedDoc || !montant) return;
    await addDoc(collection(db, "paiements"), {
      docId: selectedDoc,
      montant: Number(montant),
      mode,
      type: relatedTo,
      date: Timestamp.now(),
    });
    setSelectedDoc("");
    setMontant("");
    setTotalBonSelectionne(0);
    setSelectedPhone("");
    fetchPaiements();
  };

  // Pour couleurs badges
  const getStatusChip = (solde) => {
    if (solde <= 0) return <span className="status-chip success">Payé</span>;
    return <span className="status-chip danger">{solde} DH dû</span>;
  };

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Paiements</div>

      {/* Choix type (Achats/Ventes) */}
      <div className="paper-card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label>Type:</label>
        <select className="input" value={relatedTo} onChange={e => setRelatedTo(e.target.value)}>
          <option value="achats">Paiements Achats (Fournisseurs)</option>
          <option value="ventes">Paiements Ventes (Clients)</option>
        </select>
      </div>

      <div className="paper-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, marginBottom: 8 }}>
        <form style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }} onSubmit={handleAddPaiement}>
          <div>
            <label>{relatedTo === "achats" ? "Bon d'Achat" : "Bon de Vente"}</label>
            <select className="input"
              value={selectedDoc}
              onChange={e => handleSelectDoc(e.target.value)}
              required
            >
              <option value="">Sélectionner...</option>
              {documents.map((d) => {
                const total = getTotalDoc(d);
                const paid = (paiementsByDoc[d.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
                if (total - paid <= 0) return null;
                return (
                  <option key={d.id} value={d.id}>
                    {(relatedTo === "achats" ? d.fournisseur : d.client) || "N/A"} - {d.date?.toDate().toLocaleDateString()} (Total: {total} DH | Payé: {paid} DH)
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label>Montant payé</label>
            <input className="input" type="number" value={montant} onChange={e => setMontant(e.target.value)} required min={1} />
          </div>
          <div>
            <label>Mode de paiement</label>
            <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="Espèces">Espèces</option>
              <option value="Carte">Carte</option>
              <option value="Virement">Virement</option>
              <option value="Chèque">Chèque</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <button className="btn success" type="submit">Ajouter Paiement</button>
        </form>
      </div>

      {/* Infos doc sélectionné */}
      {selectedDoc && (
        <div className="paper-card" style={{ marginBottom: 5 }}>
          <b>Total du bon sélectionné : </b>{totalBonSelectionne} DH
          {selectedPhone &&
            <span style={{ marginLeft: 18 }}>
              <b>{relatedTo === "achats" ? "Téléphone Fournisseur" : "Téléphone Client"} : </b>{selectedPhone}
            </span>
          }
        </div>
      )}

      {/* Toggle Filtres Statut */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginTop:14,marginBottom:0}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1.28em",
            padding:"2px 13px",
            minWidth:35,
            background:showFiltres
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={()=>setShowFiltres(v=>!v)}
          aria-label="Afficher/Masquer les filtres statut"
          title="Afficher/Masquer les filtres"
        >
          {showFiltres ? "➖" : "➕"}
        </button>
        <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Filtrer par statut</span>
      </div>
      {showFiltres && (
        <div className="paper-card" style={{ display: "flex", alignItems: "center", gap: 10, marginTop:7, marginBottom:5 }}>
          <label>Statut :</label>
          <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Tous</option>
            <option value="paid">Payé</option>
            <option value="due">Dû</option>
          </select>
        </div>
      )}

      {/* Historique des paiements */}
      <div className="fullscreen-table-title" style={{ marginTop: 26, marginBottom: 0, fontSize: "1.3rem" }}>Historique des Paiements</div>
      <div className="table-pro-full" style={{ marginTop: 3 }}>
        <table>
          <thead>
            <tr>
              <th>Date(s)</th>
              <th>{relatedTo === "achats" ? "Fournisseur" : "Client"}</th>
              <th>Total</th>
              <th>Paiement(s)</th>
              <th>Solde</th>
            </tr>
          </thead>
          <tbody>
            {docsAffiches.map((doc) => {
              const paiementsDoc = paiementsByDoc[doc.id] || [];
              if (paiementsDoc.length === 0) return null;
              const total = getTotalDoc(doc);
              const paid = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
              const solde = total - paid;
              return (
                <tr key={doc.id}>
                  <td>
                    {paiementsDoc.map((p) => p.date?.toDate().toLocaleDateString()).join(" / ")}
                  </td>
                  <td>
                    {(relatedTo === "achats" ? doc.fournisseur : doc.client) || "N/A"}
                    {((relatedTo === "achats" ? doc.telephone : doc.telephoneClient) || doc.telephone) &&
                      <div style={{ fontSize: "0.85em", color: "#39d8fa" }}>
                        <b>📞 {((relatedTo === "achats" ? doc.telephone : doc.telephoneClient) || doc.telephone)}</b>
                      </div>
                    }
                  </td>
                  <td>{total} DH</td>
                  <td>
                    {paiementsDoc.map((p, i) =>
                      <span key={p.id || i}>
                        <b>{p.montant} DH</b> <i>{p.mode}</i>{i < paiementsDoc.length - 1 ? " + " : ""}
                      </span>
                    )}
                  </td>
                  <td>{getStatusChip(solde)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

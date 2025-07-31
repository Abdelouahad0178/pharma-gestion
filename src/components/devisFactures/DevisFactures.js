import React, { useEffect, useState } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";

// Génération automatique du numéro
function generateNumero(docs, type) {
  const prefix = type === "FACT" ? "FACT" : "DEV";
  const nums = docs
    .filter((d) => d.type === type)
    .map((d) => parseInt((d.numero || "").replace(prefix, "")))
    .filter((n) => !isNaN(n));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

export default function DevisFactures() {
  // État général
  const [documents, setDocuments] = useState([]);
  const [type, setType] = useState("FACT");
  const [client, setClient] = useState("");
  const [date, setDate] = useState("");
  const [articles, setArticles] = useState([]);
  const [produit, setProduit] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState(0);
  const [remise, setRemise] = useState(0);
  const [ventes, setVentes] = useState([]);
  const [selectedBons, setSelectedBons] = useState([]);
  const [parametres, setParametres] = useState({ entete: "", pied: "" });

  // CRUD édition
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  // Filtres
  const [filtreType, setFiltreType] = useState("");
  const [filtreClient, setFiltreClient] = useState("");
  const [filtreDateMin, setFiltreDateMin] = useState("");
  const [filtreDateMax, setFiltreDateMax] = useState("");
  const [showFiltres, setShowFiltres] = useState(false);

  // Récupération Firestore (devis, factures, ventes, paramètres)
  const fetchAll = async () => {
    const snap = await getDocs(collection(db, "devisFactures"));
    let arr = [];
    snap.forEach((docu) => arr.push({ id: docu.id, ...docu.data() }));
    setDocuments(arr);
    // Bons de vente pour factures groupées
    const ventesSnap = await getDocs(collection(db, "ventes"));
    setVentes(ventesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    // Paramètres (entête, pied)
    const paramsSnap = await getDocs(collection(db, "parametres"));
    if (!paramsSnap.empty) {
      const data = paramsSnap.docs[0].data();
      setParametres({ entete: data.entete || "", pied: data.pied || "" });
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line
  }, []);

  const numeroAuto = generateNumero(documents, type);

  // Identification des bons déjà facturés
  const bonsFactures = documents
    .filter((d) => d.type === "FACT" && d.bonsAssocies && !d.annulee)
    .flatMap((d) => d.bonsAssocies || []);

  // Ajout d’un article temporaire au tableau du haut
  const handleAddArticle = (e) => {
    e.preventDefault();
    if (!produit || !quantite || !prixUnitaire) return;
    setArticles([
      ...articles,
      {
        produit,
        quantite: Number(quantite),
        prixUnitaire: Number(prixUnitaire),
        remise: Number(remise) || 0,
      },
    ]);
    setProduit("");
    setQuantite(1);
    setPrixUnitaire(0);
    setRemise(0);
  };

  // Suppression d’un article dans le formulaire
  const handleRemoveArticle = (idx) => setArticles(articles.filter((_, i) => i !== idx));

  // Ajout/modification d’un devis/facture
  const handleSaveDoc = async () => {
    if (!client || !date || articles.length === 0) return;
    if (isEditing && editId) {
      await updateDoc(doc(db, "devisFactures", editId), {
        type,
        numero: numeroAuto,
        client,
        date: Timestamp.fromDate(new Date(date)),
        articles,
      });
    } else {
      await addDoc(collection(db, "devisFactures"), {
        type,
        numero: numeroAuto,
        client,
        date: Timestamp.fromDate(new Date(date)),
        articles,
        annulee: false,
      });
    }
    resetForm();
    fetchAll();
  };

  // Remplir formulaire pour édition
  const handleEditDoc = (docData) => {
    setEditId(docData.id);
    setType(docData.type);
    setClient(docData.client);
    setDate(docData.date?.toDate ? docData.date.toDate().toISOString().split("T")[0] : "");
    setArticles(docData.articles || []);
    setIsEditing(true);
  };

  // Suppression d’un devis/facture
  const handleDeleteDoc = async (id) => {
    if (!window.confirm("Supprimer ce document ?")) return;
    await deleteDoc(doc(db, "devisFactures", id));
    fetchAll();
    resetForm();
  };

  // Annuler l’édition ou vider le formulaire
  const resetForm = () => {
    setIsEditing(false);
    setEditId(null);
    setType("FACT");
    setClient("");
    setDate("");
    setArticles([]);
    setProduit("");
    setQuantite(1);
    setPrixUnitaire(0);
    setRemise(0);
  };

  // Impression (avec cachet)
  const handlePrintDoc = (docData) => {
    const articles = Array.isArray(docData.articles) ? docData.articles : [];
    const total = articles.reduce(
      (s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)),
      0
    );
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>${docData.type === "FACT" ? "Facture" : "Devis"}</title>
      <style>
        body { font-family: Arial; margin: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #000; padding: 8px; text-align: center; }
        .footer { margin-top: 50px; text-align: right; }
        .cachet { display: inline-block; border: 2px solid #1976d2; color: #1976d2; border-radius: 50%; padding: 20px 35px; font-size: 18px; font-weight: bold; }
      </style>
      </head><body>
        <div style="text-align:center">${parametres.entete || "Pharmacie"}</div>
        <h2>${docData.type === "FACT" ? "Facture" : "Devis"} N° ${docData.numero}</h2>
        <p><strong>Client:</strong> ${docData.client}</p>
        <p><strong>Date:</strong> ${docData.date?.toDate().toLocaleDateString()}</p>
        <table>
          <thead><tr><th>Produit</th><th>Qté</th><th>Prix Unitaire</th><th>Remise</th><th>Total</th></tr></thead>
          <tbody>
            ${articles
              .map(
                (a) => `
              <tr>
                <td>${a.produit}</td>
                <td>${a.quantite}</td>
                <td>${a.prixUnitaire} DH</td>
                <td>${a.remise || 0} DH</td>
                <td>${a.quantite * a.prixUnitaire - (a.remise || 0)} DH</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        <h3>Total : ${total} DH</h3>
        <div class="footer">
          <span class="cachet">Cachet Société</span><br/>
          <span>${parametres.pied || ""}</span>
        </div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Annuler une facture
  const handleAnnuleFacture = async (docData) => {
    if (!window.confirm("Confirmer l'annulation de la facture ?")) return;
    await updateDoc(doc(db, "devisFactures", docData.id), { annulee: true });
    fetchAll();
  };

  // Sélection de bons pour facturation groupée
  const toggleBonSelection = (bonId) => {
    setSelectedBons((prev) =>
      prev.includes(bonId)
        ? prev.filter((id) => id !== bonId)
        : [...prev, bonId]
    );
  };

  // Générer une facture groupée à partir de bons
  const handleGenerateFacture = async () => {
    if (selectedBons.length === 0) return alert("Sélectionnez des bons !");
    const bons = ventes.filter((v) => selectedBons.includes(v.id));
    if (!bons.length) return;
    const client = bons[0].client;
    const articles = bons.flatMap((b) => b.articles || []);
    const total = articles.reduce(
      (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
      0
    );
    // Numéro
    const snap = await getDocs(collection(db, "devisFactures"));
    let arr = [];
    snap.forEach((docu) => arr.push({ id: docu.id, ...docu.data() }));
    const numero = generateNumero(arr, "FACT");
    const newFacture = {
      type: "FACT",
      numero,
      client,
      date: Timestamp.now(),
      bonsAssocies: selectedBons,
      articles,
      total,
      annulee: false,
    };
    await addDoc(collection(db, "devisFactures"), newFacture);
    setSelectedBons([]);
    fetchAll();
    handlePrintDoc(newFacture);
  };

  // Filtres sur l’historique
  const filteredDocuments = documents.filter((doc) => {
    let pass = true;
    if (filtreType && doc.type !== filtreType) pass = false;
    if (filtreClient && !doc.client?.toLowerCase().includes(filtreClient.toLowerCase())) pass = false;
    if (filtreDateMin) {
      const d = doc.date?.toDate ? doc.date.toDate() : new Date(doc.date);
      if (d < new Date(filtreDateMin)) pass = false;
    }
    if (filtreDateMax) {
      const d = doc.date?.toDate ? doc.date.toDate() : new Date(doc.date);
      if (d > new Date(filtreDateMax)) pass = false;
    }
    return pass;
  });

  // Rendu
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion Devis, Bons et Factures</div>

      {/* CRUD Formulaire principal */}
      <div className="paper-card" style={{ marginBottom: 0 }}>
        <form
          onSubmit={handleAddArticle}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "13px",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <select className="input" style={{ minWidth: 120 }} value={type} onChange={e => setType(e.target.value)}>
            <option value="FACT">Facture</option>
            <option value="DEV">Devis</option>
          </select>
          <input
            className="input"
            type="text"
            placeholder="Client"
            value={client}
            onChange={e => setClient(e.target.value)}
            required
          />
          <input
            className="input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
          />
        </form>
        <form
          onSubmit={handleAddArticle}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <input
            className="input"
            type="text"
            placeholder="Produit"
            value={produit}
            onChange={e => setProduit(e.target.value)}
            required
          />
          <input
            className="input"
            type="number"
            placeholder="Quantité"
            value={quantite}
            onChange={e => setQuantite(e.target.value)}
            min={1}
            required
          />
          <input
            className="input"
            type="number"
            placeholder="Prix Unitaire"
            value={prixUnitaire}
            onChange={e => setPrixUnitaire(e.target.value)}
            min={0}
            required
          />
          <input
            className="input"
            type="number"
            placeholder="Remise"
            value={remise}
            onChange={e => setRemise(e.target.value)}
            min={0}
          />
          <button className="btn info" type="submit">
            Ajouter Article
          </button>
        </form>
        {(articles || []).length > 0 && (
          <div className="table-pro-full" style={{ marginTop: 10, maxHeight: "27vh", marginBottom: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Qté</th>
                  <th>Prix Unitaire</th>
                  <th>Remise</th>
                  <th>Total</th>
                  <th>Supprimer</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a, i) => (
                  <tr key={i}>
                    <td>{a.produit}</td>
                    <td>{a.quantite}</td>
                    <td>{a.prixUnitaire} DH</td>
                    <td>{a.remise || 0} DH</td>
                    <td>{a.quantite * a.prixUnitaire - (a.remise || 0)} DH</td>
                    <td>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => handleRemoveArticle(i)}
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 13 }}>
          <button
            className="btn info"
            type="button"
            onClick={handleSaveDoc}
          >
            {isEditing ? "Enregistrer la modification" : `Enregistrer ${type === "FACT" ? "Facture" : "Devis"}`}
          </button>
          {isEditing && (
            <button className="btn danger" type="button" onClick={resetForm} style={{ marginLeft: 9 }}>
              Annuler
            </button>
          )}
        </div>
      </div>

      {/* Toggle Filtres */}
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
          aria-label="Afficher/Masquer les filtres"
          title="Afficher/Masquer les filtres"
        >
          {showFiltres ? "➖" : "➕"}
        </button>
        <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Filtres Historique</span>
      </div>
      {showFiltres && (
        <div className="paper-card" style={{marginBottom: 10, marginTop: 9}}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <select className="input" style={{ minWidth: 100 }} value={filtreType} onChange={e => setFiltreType(e.target.value)}>
              <option value="">Type : Tous</option>
              <option value="FACT">Facture</option>
              <option value="DEV">Devis</option>
            </select>
            <input
              className="input"
              type="text"
              placeholder="Client"
              value={filtreClient}
              onChange={e => setFiltreClient(e.target.value)}
            />
            <span>Du :</span>
            <input
              className="input"
              type="date"
              value={filtreDateMin}
              onChange={e => setFiltreDateMin(e.target.value)}
            />
            <span>Au :</span>
            <input
              className="input"
              type="date"
              value={filtreDateMax}
              onChange={e => setFiltreDateMax(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="fullscreen-table-title" style={{ fontSize: "1.3rem", margin: 0 }}>Historique Devis et Factures</div>
      <div className="table-pro-full" style={{flex:'1 1 0%', minHeight:'34vh'}}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Numéro</th>
              <th>Client</th>
              <th>Date</th>
              <th>Total</th>
              <th>Statut</th>
              <th colSpan={3}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((docData) => (
              <tr key={docData.id}>
                <td>{docData.type === "FACT" ? "Facture" : "Devis"}</td>
                <td>{docData.numero}</td>
                <td>{docData.client}</td>
                <td>{docData.date?.toDate().toLocaleDateString()}</td>
                <td>
                  {(docData.articles || []).reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0)} DH
                </td>
                <td>
                  {docData.annulee ? <span style={{ color: "red" }}>Annulée</span> : ""}
                </td>
                <td>
                  <button className="btn print" onClick={() => handlePrintDoc(docData)}>Imprimer</button>
                </td>
                <td>
                  {!docData.annulee && (
                    <button className="btn info" onClick={() => handleEditDoc(docData)}>Modifier</button>
                  )}
                </td>
                <td>
                  {!docData.annulee && (
                    <button className="btn danger" onClick={() => handleDeleteDoc(docData.id)}>Supprimer</button>
                  )}
                  {docData.type === "FACT" && !docData.annulee && (
                    <button className="btn" style={{background:'#ffc107', color:'#212121'}}
                      onClick={() => handleAnnuleFacture(docData)}
                    >
                      Annuler
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bons de vente sélection pour facture */}
      <div className="fullscreen-table-title" style={{ marginTop: 26, fontSize: "1.1rem" }}>
        Sélectionner des Bons de Vente pour Facture
      </div>
      <div className="table-pro-full" style={{maxHeight:'26vh',marginBottom:13}}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Client</th>
              <th>Date</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ventes
              .filter((v) => !bonsFactures.includes(v.id))
              .map((v) => (
                <tr key={v.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedBons.includes(v.id)}
                      onChange={() => toggleBonSelection(v.id)}
                    />
                  </td>
                  <td>{v.client}</td>
                  <td>{v.date?.toDate().toLocaleDateString()}</td>
                  <td>
                    {(v.articles || []).reduce(
                      (sum, a) => sum + (a.prixUnitaire * a.quantite - (a.remise || 0)),
                      0
                    )} DH
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <button className="btn" style={{marginBottom:30}} onClick={handleGenerateFacture}>Générer Facture Groupée</button>
    </div>
  );
}

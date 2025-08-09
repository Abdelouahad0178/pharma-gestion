import React, { useEffect, useState } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
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
  const { user, societeId, loading } = useUserRole();

  // États
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

  // États de chargement
  const [waiting, setWaiting] = useState(true);

  // Vérification du chargement
  React.useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // Charger Firestore (devis/factures/ventes/paramètres) PAR SOCIÉTÉ
  const fetchAll = async () => {
    if (!societeId) return;
    
    const snap = await getDocs(collection(db, "societe", societeId, "devisFactures"));
    let arr = [];
    snap.forEach((docu) => arr.push({ id: docu.id, ...docu.data() }));
    setDocuments(arr);

    const ventesSnap = await getDocs(collection(db, "societe", societeId, "ventes"));
    setVentes(ventesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

    const paramsSnap = await getDocs(collection(db, "societe", societeId, "parametres"));
    if (!paramsSnap.empty) {
      const data = paramsSnap.docs[0].data();
      setParametres({ entete: data.entete || "", pied: data.pied || "" });
    }
  };

  useEffect(() => { fetchAll(); }, [societeId]);

  const numeroAuto = generateNumero(documents, type);

  // Identification des bons déjà facturés
  const bonsFactures = documents
    .filter((d) => d.type === "FACT" && d.bonsAssocies && !d.annulee)
    .flatMap((d) => d.bonsAssocies || []);

  // Ajouter article temporaire
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
    setProduit(""); setQuantite(1); setPrixUnitaire(0); setRemise(0);
  };

  const handleRemoveArticle = (idx) => setArticles(articles.filter((_, i) => i !== idx));

  // Enregistrer/modifier devis/facture ✅ AVEC TRAÇABILITÉ
  const handleSaveDoc = async () => {
    if (!user || !societeId) return;
    if (!client || !date || articles.length === 0) return;
    
    if (isEditing && editId) {
      // ✅ MODIFICATION AVEC TRAÇABILITÉ
      await updateDoc(doc(db, "societe", societeId, "devisFactures", editId), {
        type,
        numero: numeroAuto,
        client,
        timestamp: Timestamp.now(),
        articles,
        // 🔧 CHAMPS DE TRAÇABILITÉ MODIFICATION
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
    } else {
      // ✅ CRÉATION AVEC TRAÇABILITÉ
      await addDoc(collection(db, "societe", societeId, "devisFactures"), {
        type,
        numero: numeroAuto,
        client,
       timestamp: Timestamp.now(),
        articles,
        annulee: false,
        // 🔧 CHAMPS DE TRAÇABILITÉ CRÉATION
        creePar: user.uid,
        creeParEmail: user.email,
        creeLe: Timestamp.now(),
        societeId: societeId
      });
    }
    resetForm();
    fetchAll();
  };

  const handleEditDoc = (docData) => {
    setEditId(docData.id);
    setType(docData.type);
    setClient(docData.client);
    setDate(docData.date?.toDate ? docData.date.toDate().toISOString().split("T")[0] : "");
    setArticles(docData.articles || []);
    setIsEditing(true);
  };

  const handleDeleteDoc = async (id) => {
    if (!user || !societeId) return;
    if (!window.confirm("Supprimer ce document ?")) return;
    await deleteDoc(doc(db, "societe", societeId, "devisFactures", id));
    fetchAll();
    resetForm();
  };

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

  // Impression
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

  // Sélection de bons pour facturation groupée
  const toggleBonSelection = (bonId) => {
    setSelectedBons((prev) =>
      prev.includes(bonId)
        ? prev.filter((id) => id !== bonId)
        : [...prev, bonId]
    );
  };

  // Générer une facture groupée à partir de bons ✅ AVEC TRAÇABILITÉ
  const handleGenerateFacture = async () => {
    if (!user || !societeId) return;
    if (selectedBons.length === 0) return alert("Sélectionnez des bons !");
    
    const bons = ventes.filter((v) => selectedBons.includes(v.id));
    if (!bons.length) return;
    
    const client = bons[0].client;
    const articles = bons.flatMap((b) => b.articles || []);
    const total = articles.reduce(
      (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
      0
    );
    
    const snap = await getDocs(collection(db, "societe", societeId, "devisFactures"));
    let arr = [];
    snap.forEach((docu) => arr.push({ id: docu.id, ...docu.data() }));
    const numero = generateNumero(arr, "FACT");
    
    // ✅ CRÉATION FACTURE GROUPÉE AVEC TRAÇABILITÉ
    const newFacture = {
      type: "FACT",
      numero,
      client,
      date: Timestamp.now(),
      bonsAssocies: selectedBons,
      articles,
      total,
      annulee: false,
      // 🔧 CHAMPS DE TRAÇABILITÉ CRÉATION
      creePar: user.uid,
      creeParEmail: user.email,
      creeLe: Timestamp.now(),
      societeId: societeId
    };
    
    await addDoc(collection(db, "societe", societeId, "devisFactures"), newFacture);
    setSelectedBons([]);
    fetchAll();
    handlePrintDoc(newFacture);
  };

  // Filtres historique
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

  // AFFICHAGE conditionnel
  if (waiting) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#1c355e" }}>
        Chargement...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Non connecté.
      </div>
    );
  }

  if (!societeId) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Aucune société sélectionnée.
      </div>
    );
  }

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
          <span
            onClick={handleAddArticle}
            style={{ cursor: "pointer", fontSize: 22, color: "#2196f3", marginLeft: 10 }}
            title="Ajouter Article"
          >➕</span>
        </form>
        {(articles || []).length > 0 && (
          <div className="table-pro-full" style={{ marginTop: 10, maxHeight: "27vh", marginBottom: 0 }}>
            <table style={{width:"100%"}}>
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
                      <span
                        onClick={() => handleRemoveArticle(i)}
                        style={{ cursor: "pointer", fontSize: 22, color: "#f44336" }}
                        title="Supprimer"
                      >🗑️</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 13 }}>
          <span
            onClick={handleSaveDoc}
            style={{
              cursor: "pointer", fontSize: 22, color: "#388e3c", marginRight: 12,
              borderRadius: 7, padding: "4px 10px", verticalAlign: "middle"
            }}
            title={isEditing ? "Enregistrer la modification" : `Enregistrer ${type === "FACT" ? "Facture" : "Devis"}`}
          >✅</span>
          {isEditing && (
            <span
              onClick={resetForm}
              style={{ cursor: "pointer", fontSize: 22, color: "#f44336", borderRadius: 7, padding: "4px 10px" }}
              title="Annuler"
            >❌</span>
          )}
        </div>
      </div>

      {/* Toggle Filtres */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginTop:14,marginBottom:0}}>
        <span
          style={{
            cursor: "pointer",
            fontSize: "1.28em",
            padding: "2px 13px",
            minWidth: 35,
            background: showFiltres
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)",
            borderRadius: 8
          }}
          onClick={()=>setShowFiltres(v=>!v)}
          aria-label="Afficher/Masquer les filtres"
          title="Afficher/Masquer les filtres"
        >
          {showFiltres ? "➖" : "➕"}
        </span>
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
      <div style={{
        width: "100%",
        flex: "1 1 0%",
        minHeight: '34vh',
        maxHeight: '44vh',
        overflowX: "auto",
        overflowY: "auto",
        marginBottom: 22,
        background: "inherit"
      }}>
        <table style={{ width: "100%", minWidth: 1040 }}>
          <thead>
            <tr>
              <th style={{minWidth:85}}>Type</th>
              <th style={{minWidth:120}}>Numéro</th>
              <th style={{minWidth:110}}>Date</th>
              <th style={{minWidth:140}}>Client</th>
              <th style={{minWidth:110}}>Total</th>
              <th style={{minWidth:65}} title="Imprimer"></th>
              <th style={{minWidth:65}} title="Modifier"></th>
              <th style={{minWidth:65}} title="Supprimer"></th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((docData) => (
              <tr key={docData.id}>
                <td>{docData.type === "FACT" ? "Facture" : "Devis"}</td>
                <td>{docData.numero}</td>
                <td>{docData.date?.toDate().toLocaleDateString()}</td>
                <td>{docData.client}</td>
                <td style={{fontWeight:"bold"}}>{(docData.articles || []).reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0)} DH</td>
                <td>
                  <span
                    style={{cursor:"pointer",fontSize:22,background:"#33e6b7",color:"#222",borderRadius:18,padding:"5px 15px",display:"inline-block"}}
                    title="Imprimer"
                    onClick={() => handlePrintDoc(docData)}
                  >🖨️</span>
                </td>
                <td>
                  {!docData.annulee && (
                    <span
                      style={{cursor:"pointer",fontSize:22,background:"#49a4fd",color:"#222",borderRadius:18,padding:"5px 15px",display:"inline-block"}}
                      title="Modifier"
                      onClick={() => handleEditDoc(docData)}
                    >✏️</span>
                  )}
                </td>
                <td>
                  {!docData.annulee && (
                    <span
                      style={{cursor:"pointer",fontSize:22,background:"#fc7980",color:"#222",borderRadius:18,padding:"5px 15px",display:"inline-block"}}
                      title="Supprimer"
                      onClick={() => handleDeleteDoc(docData.id)}
                    >🗑️</span>
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
        <table style={{width:"100%",minWidth:600}}>
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
      <span
        onClick={handleGenerateFacture}
        style={{
          display: "inline-block",
          cursor: "pointer",
          fontSize: 22,
          background: "#1976d2",
          color: "#fff",
          borderRadius: 7,
          padding: "8px 16px",
          marginBottom: 30,
          textAlign: "center",
        }}
        title="Générer Facture Groupée"
      >🧾 Générer Facture Groupée</span>
    </div>
  );
}
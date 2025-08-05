import React, { useEffect, useState, useCallback } from "react";
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
import { useUserRole } from "../../contexts/UserRoleContext";

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
  const { role, loading, societeId, user } = useUserRole();

  // Chargement synchronisé
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // États
  const [documents, setDocuments] = useState([]);
  const [type, setType] = useState("FACT");
  const [client, setClient] = useState("");
  const [telephoneClient, setTelephoneClient] = useState("");
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
  const [filtreStatut, setFiltreStatut] = useState("");
  const [showFiltres, setShowFiltres] = useState(false);

  // Toggle formulaire
  const [showForm, setShowForm] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalDevis: 0,
    totalFactures: 0,
    montantFactures: 0,
    montantDevis: 0
  });

  // Charger Firestore (devis/factures/ventes/paramètres) PAR SOCIÉTÉ
  const fetchAll = useCallback(async () => {
    if (!societeId) return;
    
    try {
      // Charger devis/factures
      const snap = await getDocs(collection(db, "societe", societeId, "devisFactures"));
      let arr = [];
      snap.forEach((docu) => {
        const data = docu.data();
        arr.push({ id: docu.id, ...data });
      });
      
      // Trier par date décroissante
      arr.sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dateB - dateA;
      });
      
      setDocuments(arr);

      // Calculer stats
      const devis = arr.filter(d => d.type === "DEV" && !d.annulee);
      const factures = arr.filter(d => d.type === "FACT" && !d.annulee);
      
      const montantDevis = devis.reduce((sum, d) => {
        return sum + (Array.isArray(d.articles) ? d.articles.reduce((s, a) => 
          s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0) : 0);
      }, 0);
      
      const montantFactures = factures.reduce((sum, d) => {
        return sum + (Array.isArray(d.articles) ? d.articles.reduce((s, a) => 
          s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0) : 0);
      }, 0);

      setStats({
        totalDevis: devis.length,
        totalFactures: factures.length,
        montantDevis,
        montantFactures
      });

      // Charger ventes
      const ventesSnap = await getDocs(collection(db, "societe", societeId, "ventes"));
      const ventesArr = [];
      ventesSnap.forEach((d) => {
        const data = d.data();
        ventesArr.push({ id: d.id, ...data });
      });
      setVentes(ventesArr);

      // Charger paramètres
      const paramsSnap = await getDocs(collection(db, "societe", societeId, "parametres"));
      if (!paramsSnap.empty) {
        const docParam = paramsSnap.docs.find(d => d.id === "documents");
        if (docParam) {
          const data = docParam.data();
          setParametres({ entete: data.entete || "", pied: data.pied || "" });
        }
      }
      
    } catch (err) {
      console.error("Erreur fetch all:", err);
    }
  }, [societeId]);

  useEffect(() => { 
    fetchAll(); 
  }, [fetchAll]);

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
        produit: produit.trim(),
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

  const handleRemoveArticle = (idx) => setArticles(articles.filter((_, i) => i !== idx));

  // Enregistrer/modifier devis/facture
  const handleSaveDoc = async () => {
    if (!societeId) return alert("Aucune société sélectionnée !");
    if (!client || !date || articles.length === 0) return;

    try {
      const docData = {
        type,
        numero: numeroAuto,
        client: client.trim(),
        telephoneClient: telephoneClient.trim() || "",
        date: Timestamp.fromDate(new Date(date)),
        articles: articles.filter(a => a.produit && a.quantite > 0 && a.prixUnitaire >= 0),
        annulee: false,
        total: articles.reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0)
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "societe", societeId, "devisFactures", editId), {
          ...docData,
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now()
        });
      } else {
        await addDoc(collection(db, "societe", societeId, "devisFactures"), {
          ...docData,
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now()
        });
      }
      
      resetForm();
      fetchAll();
    } catch (err) {
      console.error("Erreur sauvegarde doc:", err);
      alert("Erreur lors de la sauvegarde");
    }
  };

  const handleEditDoc = (docData) => {
    if (role !== "docteur") {
      alert("Seul le pharmacien peut modifier les documents");
      return;
    }

    setEditId(docData.id);
    setType(docData.type);
    setClient(docData.client || "");
    setTelephoneClient(docData.telephoneClient || "");
    setDate(docData.date?.toDate ? docData.date.toDate().toISOString().split("T")[0] : "");
    setArticles(Array.isArray(docData.articles) ? docData.articles : []);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleDeleteDoc = async (docData) => {
    if (role !== "docteur") {
      alert("Seul le pharmacien peut supprimer les documents");
      return;
    }
    if (!societeId) return;
    if (!window.confirm("Supprimer ce document ?")) return;
    
    try {
      await deleteDoc(doc(db, "societe", societeId, "devisFactures", docData.id));
      fetchAll();
      resetForm();
    } catch (err) {
      console.error("Erreur suppression:", err);
      alert("Erreur lors de la suppression");
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditId(null);
    setType("FACT");
    setClient("");
    setTelephoneClient("");
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
      <html>
        <head>
          <title>${docData.type === "FACT" ? "Facture" : "Devis"} ${docData.numero}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .header { text-align: center; margin-bottom: 30px; }
            .footer { margin-top: 50px; text-align: center; }
            .totals { text-align: right; margin-top: 20px; }
            .info-section { display: flex; justify-content: space-between; margin: 20px 0; }
            .info-box { border: 1px solid #ddd; padding: 10px; border-radius: 5px; width: 45%; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${parametres.entete || "PHARMACIE"}</h1>
          </div>
          
          <h2 style="text-align: center;">
            ${docData.type === "FACT" ? "FACTURE" : "DEVIS"} N° ${docData.numero}
          </h2>
          
          <div class="info-section">
            <div class="info-box">
              <strong>CLIENT</strong><br/>
              ${docData.client}<br/>
              ${docData.telephoneClient ? `Tél: ${docData.telephoneClient}` : ""}
            </div>
            <div class="info-box" style="text-align: right;">
              <strong>Date:</strong> ${docData.date?.toDate().toLocaleDateString()}<br/>
              <strong>Document N°:</strong> ${docData.numero}
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 40%;">Produit</th>
                <th style="width: 15%; text-align: center;">Quantité</th>
                <th style="width: 15%; text-align: right;">Prix Unit.</th>
                <th style="width: 15%; text-align: right;">Remise</th>
                <th style="width: 15%; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${articles.map((a) => `
                <tr>
                  <td>${a.produit}</td>
                  <td style="text-align: center;">${a.quantite}</td>
                  <td style="text-align: right;">${a.prixUnitaire.toFixed(2)} DH</td>
                  <td style="text-align: right;">${(a.remise || 0).toFixed(2)} DH</td>
                  <td style="text-align: right;">${(a.quantite * a.prixUnitaire - (a.remise || 0)).toFixed(2)} DH</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          
          <div class="totals">
            <h3>TOTAL : ${total.toFixed(2)} DH</h3>
          </div>
          
          <div class="footer">
            <div style="margin-bottom: 50px;">
              <div style="display: inline-block; border: 2px solid #333; border-radius: 50%; padding: 30px; margin: 20px;">
                Cachet et Signature
              </div>
            </div>
            <div>${parametres.pied || ""}</div>
            <div style="margin-top: 20px; font-size: 11px; color: #666;">
              Document généré le ${new Date().toLocaleString()}
            </div>
          </div>
        </body>
      </html>
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

  // Générer une facture groupée à partir de bons
  const handleGenerateFacture = async () => {
    if (!societeId) return alert("Aucune société sélectionnée !");
    if (selectedBons.length === 0) return alert("Sélectionnez des bons !");
    
    try {
      const bons = ventes.filter((v) => selectedBons.includes(v.id));
      if (!bons.length) return;
      
      // Vérifier que tous les bons sont du même client
      const clients = [...new Set(bons.map(b => b.client))];
      if (clients.length > 1) {
        alert("Les bons sélectionnés doivent être du même client !");
        return;
      }
      
      const client = bons[0].client;
      const telephoneClient = bons[0].telephoneClient || "";
      const articles = bons.flatMap((b) => b.articles || []);
      const total = articles.reduce(
        (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
        0
      );
      
      const snap = await getDocs(collection(db, "societe", societeId, "devisFactures"));
      let arr = [];
      snap.forEach((docu) => {
        arr.push({ id: docu.id, ...docu.data() });
      });
      
      const numero = generateNumero(arr, "FACT");
      const newFacture = {
        type: "FACT",
        numero,
        client,
        telephoneClient,
        date: Timestamp.now(),
        bonsAssocies: selectedBons,
        articles,
        total,
        annulee: false,
        creePar: user.uid,
        creeParEmail: user.email,
        creeLe: Timestamp.now()
      };
      
      await addDoc(collection(db, "societe", societeId, "devisFactures"), newFacture);
      setSelectedBons([]);
      fetchAll();
      handlePrintDoc(newFacture);
    } catch (err) {
      console.error("Erreur génération facture:", err);
      alert("Erreur lors de la génération");
    }
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
      if (d > new Date(filtreDateMax + "T23:59:59")) pass = false;
    }
    if (filtreStatut) {
      if (filtreStatut === "annule" && !doc.annulee) pass = false;
      if (filtreStatut === "actif" && doc.annulee) pass = false;
    }
    return pass;
  });

  // Affichages conditionnels
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
        Aucune société sélectionnée. Veuillez d'abord rejoindre ou créer une société.
      </div>
    );
  }

  // Rendu principal
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">
        Gestion Devis et Factures
      </div>

      {/* Statistiques rapides */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: "15px", 
        margin: "0 18px 20px 18px" 
      }}>
        <div style={{ 
          background: "#283c55", 
          padding: "20px", 
          borderRadius: "10px", 
          textAlign: "center",
          border: "1px solid #334568"
        }}>
          <div style={{ color: "#61c7ef", fontSize: "2rem", fontWeight: "800" }}>
            {stats.totalDevis}
          </div>
          <div style={{ color: "#b5c3d8", fontSize: "1rem", marginTop: 5 }}>Devis</div>
          <div style={{ color: "#90a4b8", fontSize: "0.9rem", marginTop: 5 }}>
            {stats.montantDevis.toLocaleString()} DH
          </div>
        </div>
        <div style={{ 
          background: "#283c55", 
          padding: "20px", 
          borderRadius: "10px", 
          textAlign: "center",
          border: "1px solid #334568"
        }}>
          <div style={{ color: "#2bd2a6", fontSize: "2rem", fontWeight: "800" }}>
            {stats.totalFactures}
          </div>
          <div style={{ color: "#b5c3d8", fontSize: "1rem", marginTop: 5 }}>Factures</div>
          <div style={{ color: "#90a4b8", fontSize: "0.9rem", marginTop: 5 }}>
            {stats.montantFactures.toLocaleString()} DH
          </div>
        </div>
      </div>

      {/* Toggle formulaire */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginTop:12,marginBottom:0}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1.32em",
            padding:"2px 13px",
            minWidth:35,
            background:showForm
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={()=>setShowForm(v=>!v)}
          aria-label="Afficher/Masquer le formulaire"
          title="Afficher/Masquer le formulaire"
        >
          {showForm ? "➖" : "➕"}
        </button>
        <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>
          Formulaire {isEditing ? "modification" : "création"}
        </span>
      </div>

      {/* CRUD Formulaire principal */}
      {showForm && (
        <div className="paper-card" style={{ marginBottom: 10 }}>
          {/* Informations du document */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15, marginBottom: 20 }}>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Type de document</label>
              <select className="input" style={{width: "100%"}} value={type} onChange={e => setType(e.target.value)}>
                <option value="FACT">Facture</option>
                <option value="DEV">Devis</option>
              </select>
            </div>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Client *</label>
              <input
                className="input"
                style={{width: "100%"}}
                type="text"
                placeholder="Nom du client"
                value={client}
                onChange={e => setClient(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Téléphone Client</label>
              <input
                className="input"
                style={{width: "100%"}}
                type="tel"
                placeholder="06xxxxxxxx"
                value={telephoneClient}
                onChange={e => setTelephoneClient(e.target.value)}
              />
            </div>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Date *</label>
              <input
                className="input"
                style={{width: "100%"}}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>
          </div>
          
          {/* Ajout d'articles */}
          <div style={{ background: "#1a2535", borderRadius: "8px", padding: "15px", marginBottom: "15px" }}>
            <h4 style={{ color: "#7ee4e6", marginBottom: "15px" }}>Ajouter des articles</h4>
            <form onSubmit={handleAddArticle} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "end" }}>
              <div>
                <label style={{ color: "#98c4f9", fontSize: "0.9rem" }}>Produit *</label>
                <input
                  className="input"
                  style={{width: "100%"}}
                  type="text"
                  placeholder="Nom du produit"
                  value={produit}
                  onChange={e => setProduit(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ color: "#98c4f9", fontSize: "0.9rem" }}>Quantité *</label>
                <input
                  className="input"
                  style={{width: "100%"}}
                  type="number"
                  value={quantite}
                  onChange={e => setQuantite(e.target.value)}
                  min={1}
                  required
                />
              </div>
              <div>
                <label style={{ color: "#98c4f9", fontSize: "0.9rem" }}>Prix Unit. *</label>
                <input
                  className="input"
                  style={{width: "100%"}}
                  type="number"
                  step="0.01"
                  value={prixUnitaire}
                  onChange={e => setPrixUnitaire(e.target.value)}
                  min={0}
                  required
                />
              </div>
              <div>
                <label style={{ color: "#98c4f9", fontSize: "0.9rem" }}>Remise</label>
                <input
                  className="input"
                  style={{width: "100%"}}
                  type="number"
                  step="0.01"
                  value={remise}
                  onChange={e => setRemise(e.target.value)}
                  min={0}
                />
              </div>
              <button 
                type="submit" 
                className="btn"
                disabled={!produit || !quantite || !prixUnitaire}
              >
                ➕ Ajouter
              </button>
            </form>
          </div>

          {/* Liste des articles */}
          {articles.length > 0 && (
            <div className="table-pro-full" style={{ marginTop: 10, maxHeight: "250px", marginBottom: 15 }}>
              <table style={{width:"100%"}}>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Qté</th>
                    <th>Prix Unit.</th>
                    <th>Remise</th>
                    <th>Total</th>
                    <th>Actions</th>
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
                          type="button"
                          className="btn danger"
                          onClick={() => handleRemoveArticle(i)}
                          style={{ padding: "4px 10px" }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#1a2535", fontWeight: "bold" }}>
                    <td colSpan={4} style={{ textAlign: "right" }}>
                      Total Document :
                    </td>
                    <td colSpan={2} style={{ color: "#2bd2a6" }}>
                      {articles.reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0)} DH
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          {/* Boutons de sauvegarde */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button 
                type="button"
                className="btn"
                onClick={handleSaveDoc}
                disabled={!client || !date || articles.length === 0}
              >
                {isEditing ? "🔄 Modifier" : "💾 Enregistrer"} {type === "FACT" ? "Facture" : "Devis"}
              </button>
              {isEditing && (
                <button 
                  type="button"
                  className="btn info" 
                  onClick={resetForm}
                >
                  ❌ Annuler
                </button>
              )}
            </div>
            <div style={{ color: "#98c4f9", fontSize: "1rem" }}>
              Prochain numéro : <strong>{numeroAuto}</strong>
            </div>
          </div>
        </div>
      )}

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Type</label>
              <select className="input" style={{width: "100%"}} value={filtreType} onChange={e => setFiltreType(e.target.value)}>
                <option value="">Tous</option>
                <option value="FACT">Factures</option>
                <option value="DEV">Devis</option>
              </select>
            </div>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Client</label>
              <input
                className="input"
                style={{width: "100%"}}
                type="text"
                placeholder="Rechercher..."
                value={filtreClient}
                onChange={e => setFiltreClient(e.target.value)}
              />
            </div>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Du</label>
              <input
                className="input"
                style={{width: "100%"}}
                type="date"
                value={filtreDateMin}
                onChange={e => setFiltreDateMin(e.target.value)}
              />
            </div>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Au</label>
              <input
                className="input"
                style={{width: "100%"}}
                type="date"
                value={filtreDateMax}
                onChange={e => setFiltreDateMax(e.target.value)}
              />
            </div>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>Statut</label>
              <select className="input" style={{width: "100%"}} value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}>
                <option value="">Tous</option>
                <option value="actif">Actifs</option>
                <option value="annule">Annulés</option>
              </select>
            </div>
          </div>
          {(filtreType || filtreClient || filtreDateMin || filtreDateMax || filtreStatut) && (
            <div style={{ marginTop: "15px" }}>
              <button className="btn danger" onClick={() => {
                setFiltreType(""); setFiltreClient(""); setFiltreDateMin(""); setFiltreDateMax(""); setFiltreStatut("");
              }}>
                🗑️ Effacer tous les filtres
              </button>
            </div>
          )}
        </div>
      )}

      {/* Historique */}
      <div className="fullscreen-table-title" style={{ fontSize: "1.3rem", margin: "15px 0 0 0" }}>
        Historique Devis et Factures ({filteredDocuments.length})
      </div>
      <div className="table-pro-full" style={{ flex: "1 1 0%", minHeight: "40vh", marginBottom: 22 }}>
        <table style={{ width: "100%", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{width: "80px"}}>Type</th>
              <th style={{width: "120px"}}>Numéro</th>
              <th style={{width: "100px"}}>Date</th>
              <th>Client</th>
              <th style={{width: "120px"}}>Total</th>
              <th style={{width: "150px"}}>Créé par</th>
              <th style={{width: "200px"}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((docData) => (
              <tr key={docData.id} style={{
                opacity: docData.annulee ? 0.6 : 1,
                backgroundColor: docData.annulee ? '#2a1a1a' : 'inherit'
              }}>
                <td>
                  <span className={`status-chip ${docData.type === 'FACT' ? 'success' : 'info'}`}>
                    {docData.type === "FACT" ? "FACT" : "DEV"}
                  </span>
                </td>
                <td style={{ fontFamily: "monospace", fontWeight: "600" }}>{docData.numero}</td>
                <td>{docData.date?.toDate().toLocaleDateString()}</td>
                <td>
                  <div>{docData.client}</div>
                  {docData.telephoneClient && (
                    <div style={{ fontSize: "0.85em", color: "#7ee4e6" }}>
                      📞 {docData.telephoneClient}
                    </div>
                  )}
                </td>
                <td style={{fontWeight:"bold", color: "#2bd2a6"}}>
                  {(docData.articles || []).reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0)} DH
                </td>
                <td style={{ fontSize: "0.85em", color: "#99b2d4" }}>
                  {docData.creeParEmail || "N/A"}
                  {docData.modifieLe && (
                    <div style={{ fontSize: "0.8em", color: "#7ee4e6" }}>
                      Modifié le {docData.modifieLe.toDate().toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td>
                  <button
                    className="btn print"
                    title="Imprimer"
                    onClick={() => handlePrintDoc(docData)}
                    style={{ padding: "4px 10px", marginRight: 5 }}
                  >
                    🖨️
                  </button>
                  {!docData.annulee && role === "docteur" && (
                    <>
                      <button
                        className="btn info"
                        title="Modifier"
                        onClick={() => handleEditDoc(docData)}
                        style={{ padding: "4px 10px", marginRight: 5 }}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn danger"
                        title="Supprimer"
                        onClick={() => handleDeleteDoc(docData)}
                        style={{ padding: "4px 10px" }}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bons de vente sélection pour facture */}
      {ventes.length > 0 && (
        <>
          <div className="fullscreen-table-title" style={{ marginTop: 26, fontSize: "1.1rem" }}>
            Sélectionner des Bons de Vente pour Facture Groupée
          </div>
          <div className="table-pro-full" style={{maxHeight:'26vh',marginBottom:13}}>
            <table style={{width:"100%",minWidth:600}}>
              <thead>
                <tr>
                  <th style={{width: "40px"}}></th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {ventes
                  .filter((v) => !bonsFactures.includes(v.id))
                  .map((v) => (
                    <tr key={v.id}>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedBons.includes(v.id)}
                          onChange={() => toggleBonSelection(v.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td>
                        <div>{v.client}</div>
                        {v.telephoneClient && (
                          <div style={{ fontSize: "0.85em", color: "#7ee4e6" }}>
                            📞 {v.telephoneClient}
                          </div>
                        )}
                      </td>
                      <td>{v.date?.toDate().toLocaleDateString()}</td>
                      <td style={{ fontWeight: "bold" }}>
                        {(v.articles || []).reduce(
                          (sum, a) => sum + (a.prixUnitaire * a.quantite - (a.remise || 0)),
                          0
                        )} DH
                      </td>
                      <td>
                        <span className={`status-chip ${
                          v.statutPaiement === 'payé' ? 'success' : 
                          v.statutPaiement === 'partiel' ? 'info' : 'danger'
                        }`}>
                          {v.statutPaiement}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <button
              className="btn"
              onClick={handleGenerateFacture}
              disabled={selectedBons.length === 0}
              style={{
                fontSize: "1.1rem",
                padding: "12px 24px",
                opacity: selectedBons.length === 0 ? 0.5 : 1,
                cursor: selectedBons.length === 0 ? "not-allowed" : "pointer"
              }}
            >
              🧾 Générer Facture Groupée ({selectedBons.length} bon{selectedBons.length > 1 ? 's' : ''})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
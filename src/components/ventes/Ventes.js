import React, { useEffect, useState } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

export default function Ventes() {
  // Formulaires
  const [client, setClient] = useState("");
  const [dateVente, setDateVente] = useState("");
  const [statutPaiement, setStatutPaiement] = useState("payé");

  const [produit, setProduit] = useState("");
  const [produitNouveau, setProduitNouveau] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [remiseArticle, setRemiseArticle] = useState(0);

  const [articles, setArticles] = useState([]);
  const [ventes, setVentes] = useState([]);
  const [medicaments, setMedicaments] = useState([]);
  const [parametres, setParametres] = useState({ entete: "", pied: "" });

  const [editId, setEditId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Filtres historiques
  const [filterClient, setFilterClient] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [showFiltres, setShowFiltres] = useState(false);

  // Charger paramètres impression
  const fetchParametres = async () => {
    const snap = await getDocs(collection(db, "parametres"));
    if (!snap.empty) {
      const data = snap.docs[0].data();
      setParametres({ entete: data.entete || "", pied: data.pied || "" });
    }
  };

  // Auto-remplissage prix vente
  const handleProduitChange = (value) => {
    setProduit(value);
    if (value !== "_new_") {
      const med = medicaments.find((m) => m.nom === value);
      if (med) setPrixUnitaire(med.prixVente || 0);
    } else setPrixUnitaire("");
  };

  // Ajouter un article temporaire à la vente en cours
  const handleAddArticle = (e) => {
    e.preventDefault();
    const nomProduitFinal = produit === "_new_" ? produitNouveau : produit;
    if (!nomProduitFinal || !quantite || !prixUnitaire) return;
    setArticles([
      ...articles,
      {
        produit: nomProduitFinal,
        quantite: Number(quantite),
        prixUnitaire: Number(prixUnitaire),
        remise: Number(remiseArticle),
      },
    ]);
    setProduit(""); setProduitNouveau(""); setQuantite(1); setPrixUnitaire(""); setRemiseArticle(0);
  };

  const handleRemoveArticle = (idx) => setArticles(articles.filter((_, i) => i !== idx));

  // Enregistrer ou modifier une vente
  const handleAddVente = async (e) => {
    e.preventDefault();
    if (!client || !dateVente || articles.length === 0) return;

    let venteRef = null;
    if (isEditing && editId) {
      const oldVente = ventes.find((v) => v.id === editId);
      await updateStockOnCancel(oldVente);
      await updateDoc(doc(db, "ventes", editId), {
        client,
        date: Timestamp.fromDate(new Date(dateVente)),
        statutPaiement,
        articles,
      });
      venteRef = { id: editId };
      await updateStockOnSell({ client, articles });
      setIsEditing(false); setEditId(null);
    } else {
      const added = await addDoc(collection(db, "ventes"), {
        client,
        date: Timestamp.fromDate(new Date(dateVente)),
        statutPaiement,
        articles,
      });
      venteRef = added;
      await updateStockOnSell({ client, articles });
    }

    // Paiement automatique si "payé"
    if (statutPaiement === "payé" && venteRef) {
      const total = articles.reduce((sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise), 0);
      await addDoc(collection(db, "paiements"), {
        docId: venteRef.id,
        montant: total,
        mode: "Espèces",
        type: "ventes",
        date: Timestamp.fromDate(new Date(dateVente)),
      });
    }

    resetForm();
    fetchVentes();
    fetchMedicaments();
  };

  const resetForm = () => {
    setClient(""); setDateVente(""); setStatutPaiement("payé");
    setArticles([]); setEditId(null); setIsEditing(false);
  };

  // Impression Bon de Vente
  const handlePrintVente = (vente) => {
    const articles = Array.isArray(vente.articles) ? vente.articles : [];
    const total = articles.reduce((sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)), 0);
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Bon de Vente</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: center; }
            h2 { text-align: center; }
            .totals { text-align: right; font-size: 16px; margin-top: 20px; }
            .header, .footer { text-align: center; margin-bottom: 20px; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">${parametres.entete || "<strong>Pharmacie - Bon de Vente</strong>"}</div>
          <h2>BON DE VENTE</h2>
          <p><strong>Client :</strong> ${vente.client || ""}</p>
          <p><strong>Date :</strong> ${vente.date?.toDate().toLocaleDateString() || ""}</p>
          <p><strong>Statut Paiement :</strong> ${vente.statutPaiement || ""}</p>
          <table>
            <thead>
              <tr>
                <th>Produit</th><th>Qté</th><th>Prix Vente</th><th>Remise</th><th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${articles.map(a => `
                <tr>
                  <td>${a.produit || ""}</td>
                  <td>${a.quantite || 0}</td>
                  <td>${a.prixUnitaire || 0} DH</td>
                  <td>${a.remise || 0} DH</td>
                  <td>${((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0))} DH</td>
                </tr>`).join("")}
            </tbody>
          </table>
          <div class="totals">
            <p><strong>Total : ${total} DH</strong></p>
          </div>
          <p style="margin-top:40px; text-align:center;">Signature du Vendeur : __________________</p>
          <div class="footer">${parametres.pied || ""}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Modifier / Supprimer
  const handleEditVente = (vente) => {
    setEditId(vente.id);
    setIsEditing(true);
    setClient(vente.client || "");
    setDateVente(vente.date?.toDate().toISOString().split("T")[0] || "");
    setStatutPaiement(vente.statutPaiement || "payé");
    setArticles(vente.articles || []);
  };

  const handleDeleteVente = async (vente) => {
    if (window.confirm("Supprimer cette vente ?")) {
      await updateStockOnCancel(vente);
      await deleteDoc(doc(db, "ventes", vente.id));
      fetchVentes();
    }
  };

  // Gestion du stock
  const updateStockOnSell = async (vente) => {
    const stockRef = collection(db, "stock");
    for (const art of vente.articles || []) {
      const q = query(stockRef, where("nom", "==", art.produit || ""));
      const stockSnap = await getDocs(q);
      if (!stockSnap.empty) {
        const docId = stockSnap.docs[0].id;
        const current = stockSnap.docs[0].data();
        await updateDoc(doc(db, "stock", docId), {
          quantite: Math.max(0, Number(current.quantite || 0) - Number(art.quantite || 0)),
        });
      }
    }
  };

  const updateStockOnCancel = async (vente) => {
    const stockRef = collection(db, "stock");
    for (const art of vente.articles || []) {
      const q = query(stockRef, where("nom", "==", art.produit || ""));
      const stockSnap = await getDocs(q);
      if (!stockSnap.empty) {
        const docId = stockSnap.docs[0].id;
        const current = stockSnap.docs[0].data();
        await updateDoc(doc(db, "stock", docId), {
          quantite: Number(current.quantite || 0) + Number(art.quantite || 0),
        });
      }
    }
  };

  // Charger ventes/stock
  const fetchVentes = async () => {
    const snap = await getDocs(collection(db, "ventes"));
    let arr = [];
    snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
    setVentes(arr);
  };

  const fetchMedicaments = async () => {
    const snap = await getDocs(collection(db, "stock"));
    let arr = [];
    snap.forEach((doc) => arr.push(doc.data()));
    setMedicaments(arr);
  };

  useEffect(() => { fetchVentes(); }, []);
  useEffect(() => { fetchMedicaments(); fetchParametres(); }, []);

  const totalVenteCourante = (articles || []).reduce(
    (t, a) => t + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)), 0);

  // -- Filtrage historique ventes
  const uniqueClients = Array.from(new Set(ventes.map(v => v.client).filter(Boolean)));
  const ventesFiltrees = ventes.filter((v) => {
    let keep = true;
    if (filterClient && v.client !== filterClient) keep = false;
    if (filterDateMin) {
      const vd = v.date?.toDate?.() || null;
      if (!vd || vd < new Date(filterDateMin)) keep = false;
    }
    if (filterDateMax) {
      const vd = v.date?.toDate?.() || null;
      if (!vd || vd > new Date(filterDateMax + "T23:59:59")) keep = false;
    }
    return keep;
  });

  // ---- RENDER ----
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Ventes</div>

      {/* Form ajout article */}
      <form onSubmit={handleAddArticle} className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:18,justifyContent:'flex-start'}}>
        <div style={{minWidth:180}}>
          <label>Médicament</label>
          <select className="w-full" value={produit} onChange={(e) => handleProduitChange(e.target.value)} required>
            <option value="">Choisir...</option>
            {medicaments.map(m => <option key={m.nom} value={m.nom}>{m.nom}</option>)}
            <option value="_new_">+ Nouveau médicament</option>
          </select>
        </div>
        {produit === "_new_" && (
          <div style={{minWidth:180}}>
            <label>Nouveau médicament</label>
            <input className="w-full" value={produitNouveau} onChange={(e) => setProduitNouveau(e.target.value)} required />
          </div>
        )}
        <div><label>Quantité</label>
          <input type="number" className="w-full" value={quantite} onChange={(e) => setQuantite(e.target.value)} required min={1} /></div>
        <div><label>Prix Vente</label>
          <input type="number" className="w-full" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} required min={0} /></div>
        <div><label>Remise</label>
          <input type="number" className="w-full" value={remiseArticle} onChange={(e) => setRemiseArticle(e.target.value)} min={0} /></div>
        <button type="submit" className="btn">Ajouter</button>
      </form>

      {/* Tableau articles (vente en cours) */}
      {articles.length > 0 && (
        <div className="table-pro-full" style={{ maxHeight: "33vh", marginBottom: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Produit</th>
                <th>Qté</th>
                <th>Prix Vente</th>
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
                  <td>{a.remise} DH</td>
                  <td>{(a.prixUnitaire * a.quantite) - a.remise} DH</td>
                  <td>
                    <button className="btn danger" type="button" onClick={() => handleRemoveArticle(i)}>X</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ textAlign: "right" }}><strong>Total Vente</strong></td>
                <td colSpan={2}><strong>{totalVenteCourante} DH</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Formulaire infos vente */}
      <form onSubmit={handleAddVente} className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:18,justifyContent:'flex-start'}}>
        <div>
          <label>Client</label>
          <input className="w-full" type="text" value={client} onChange={(e) => setClient(e.target.value)} required />
        </div>
        <div>
          <label>Date Vente</label>
          <input className="w-full" type="date" value={dateVente} onChange={(e) => setDateVente(e.target.value)} required />
        </div>
        <div>
          <label>Statut</label>
          <select className="w-full" value={statutPaiement} onChange={(e) => setStatutPaiement(e.target.value)}>
            <option value="payé">Payé</option>
            <option value="partiel">Partiel</option>
            <option value="impayé">Impayé</option>
          </select>
        </div>
        <button type="submit" className="btn">{isEditing ? "Modifier Vente" : "Enregistrer Vente"}</button>
        {isEditing && <button type="button" className="btn info" onClick={resetForm}>Annuler</button>}
      </form>

      {/* Toggle filtres */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginTop:15,marginBottom:0}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1.32em",
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
        <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Filtres historiques</span>
      </div>

      {showFiltres && (
        <div className="paper-card" style={{display:"flex",gap:18,alignItems:'center',marginTop:7,marginBottom:7,flexWrap:"wrap"}}>
          <div>
            <label>Client&nbsp;</label>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{minWidth:110}}>
              <option value="">Tous</option>
              {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>Du&nbsp;</label>
            <input type="date" value={filterDateMin} onChange={e => setFilterDateMin(e.target.value)} />
          </div>
          <div>
            <label>Au&nbsp;</label>
            <input type="date" value={filterDateMax} onChange={e => setFilterDateMax(e.target.value)} />
          </div>
          {(filterClient || filterDateMin || filterDateMax) && (
            <button className="btn danger" type="button" onClick={() => {
              setFilterClient(""); setFilterDateMin(""); setFilterDateMax("");
            }}>Effacer filtres</button>
          )}
        </div>
      )}

      <div className="fullscreen-table-title" style={{marginTop:15, fontSize:'1.45rem'}}>Historique des Ventes</div>
      <div className="table-pro-full" style={{flex: '1 1 0%', minHeight:'40vh'}}>
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Date</th>
              <th>Statut</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ventesFiltrees.map((v) => (
              <tr key={v.id}>
                <td>{v.client}</td>
                <td>{v.date?.toDate().toLocaleDateString()}</td>
                <td>{v.statutPaiement}</td>
                <td>
                  {(Array.isArray(v.articles) ? v.articles : [])
                    .reduce((sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise), 0)} DH
                </td>
                <td>
                  <button className="btn info" onClick={() => handleEditVente(v)}>Modifier</button>
                  <button className="btn danger" onClick={() => handleDeleteVente(v)}>Supprimer</button>
                  <button className="btn print" onClick={() => handlePrintVente(v)}>Imprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

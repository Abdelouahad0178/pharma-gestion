import React, { useEffect, useState, useCallback } from "react";
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

export default function Achats() {
  // Formulaire
  const [fournisseur, setFournisseur] = useState("");
  const [dateAchat, setDateAchat] = useState("");
  const [statutPaiement, setStatutPaiement] = useState("payé");
  const [remiseGlobale, setRemiseGlobale] = useState(0);

  // Article courant
  const [produit, setProduit] = useState("");
  const [produitNouveau, setProduitNouveau] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [remiseArticle, setRemiseArticle] = useState(0);
  const [datePeremption, setDatePeremption] = useState("");

  const [articles, setArticles] = useState([]);
  const [achats, setAchats] = useState([]);
  const [medicaments, setMedicaments] = useState([]);

  const [editId, setEditId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Filtres historiques
  const [filterFournisseur, setFilterFournisseur] = useState("");
  const [filterMedicament, setFilterMedicament] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [showFiltres, setShowFiltres] = useState(false);

  // Prix auto-rempli
  const handleProduitChange = (value) => {
    setProduit(value);
    if (value !== "_new_") {
      const med = medicaments.find((m) => m.nom === value);
      if (med) {
        setPrixUnitaire(med.prixAchat || 0);
        setPrixVente(med.prixVente || 0);
      }
    } else {
      setPrixUnitaire("");
      setPrixVente("");
    }
  };

  // Ajouter un article à la liste temporaire
  const handleAddArticle = (e) => {
    e.preventDefault();
    const nomProduitFinal = produit === "_new_" ? produitNouveau : produit;
    if (!nomProduitFinal || !quantite || !prixUnitaire || !datePeremption) return;
    setArticles([
      ...articles,
      {
        produit: nomProduitFinal,
        quantite: Number(quantite),
        prixUnitaire: Number(prixUnitaire),
        prixAchat: Number(prixUnitaire),
        prixVente: Number(prixVente) || 0,
        remise: Number(remiseArticle),
        datePeremption,
      },
    ]);
    setProduit(""); setProduitNouveau(""); setQuantite(1); setPrixUnitaire("");
    setPrixVente(""); setRemiseArticle(0); setDatePeremption("");
  };

  const handleRemoveArticle = (idx) => setArticles(articles.filter((_, i) => i !== idx));

  // Enregistrer ou modifier un bon
  const handleAddBon = async (e) => {
    e.preventDefault();
    if (!fournisseur || !dateAchat || articles.length === 0) return;
    const articlesValid = articles.filter(a => a.produit && a.quantite > 0 && a.prixUnitaire > 0);
    if (articlesValid.length === 0) return;

    if (isEditing && editId) {
      // Update stock d'abord (remettre l'ancien état)
      const oldBon = achats.find((b) => b.id === editId);
      if (oldBon) {
        await updateStockOnDelete(oldBon);
      }
      await updateDoc(doc(db, "achats", editId), {
        fournisseur,
        date: Timestamp.fromDate(new Date(dateAchat)),
        statutPaiement,
        remiseGlobale: Number(remiseGlobale),
        articles: articlesValid,
      });
      await updateStockOnAdd({ fournisseur, articles: articlesValid });
      setIsEditing(false); setEditId(null);
    } else {
      await addDoc(collection(db, "achats"), {
        fournisseur,
        date: Timestamp.fromDate(new Date(dateAchat)),
        statutPaiement,
        remiseGlobale: Number(remiseGlobale),
        articles: articlesValid,
      });
      await updateStockOnAdd({ fournisseur, articles: articlesValid });
    }
    resetForm();
    fetchAchats();
    fetchMedicaments();
  };

  const resetForm = () => {
    setFournisseur(""); setDateAchat(""); setStatutPaiement("payé"); setRemiseGlobale(0);
    setArticles([]); setEditId(null); setIsEditing(false);
  };

  const handlePrintBon = (bon) => {
    const articles = Array.isArray(bon.articles) ? bon.articles : [];
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Bon de Commande</title>
          <style>
            body { font-family: 'Inter', Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: center; }
          </style>
        </head>
        <body>
          <h2>Bon de Commande</h2>
          <p><strong>Fournisseur:</strong> ${bon.fournisseur || ""}</p>
          <p><strong>Date:</strong> ${bon.date?.toDate().toLocaleDateString() || ""}</p>
          <p><strong>Statut:</strong> ${bon.statutPaiement || ""}</p>
          <table>
            <thead>
              <tr>
                <th>Produit</th><th>Qté</th><th>Prix Achat</th><th>Prix Vente</th><th>Remise</th><th>Date Exp.</th><th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${articles.map(a => `
                <tr>
                  <td>${a.produit || ""}</td>
                  <td>${a.quantite || 0}</td>
                  <td>${a.prixUnitaire || 0} DH</td>
                  <td>${a.prixVente || 0} DH</td>
                  <td>${a.remise || 0} DH</td>
                  <td>${a.datePeremption || ""}</td>
                  <td>${((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0))} DH</td>
                </tr>`).join("")}
            </tbody>
          </table>
          <h3>Total : ${articles.reduce((sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)), 0)} DH</h3>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleEditBon = (bon) => {
    setEditId(bon.id);
    setIsEditing(true);
    setFournisseur(bon.fournisseur || "");
    setDateAchat(bon.date?.toDate().toISOString().split("T")[0] || "");
    setStatutPaiement(bon.statutPaiement || "payé");
    setRemiseGlobale(bon.remiseGlobale || 0);
    setArticles(bon.articles || []);
  };

  const handleDeleteBon = async (bon) => {
    if (window.confirm("Supprimer ce bon ?")) {
      await updateStockOnDelete(bon);
      await deleteDoc(doc(db, "achats", bon.id));
      fetchAchats();
    }
  };

  // Gestion du stock
  const updateStockOnAdd = async (bon) => {
    const stockRef = collection(db, "stock");
    for (const art of bon.articles || []) {
      const q = query(stockRef, where("nom", "==", art.produit || ""));
      const stockSnap = await getDocs(q);
      if (!stockSnap.empty) {
        const docId = stockSnap.docs[0].id;
        const current = stockSnap.docs[0].data();
        await updateDoc(doc(db, "stock", docId), {
          quantite: Number(current.quantite || 0) + Number(art.quantite || 0),
          prixAchat: art.prixUnitaire || 0,
          prixVente: art.prixVente || current.prixVente || art.prixUnitaire,
          datePeremption: art.datePeremption || current.datePeremption,
        });
      } else {
        await addDoc(stockRef, {
          nom: art.produit || "",
          quantite: Number(art.quantite || 0),
          prixAchat: art.prixUnitaire || 0,
          prixVente: art.prixVente || art.prixUnitaire || 0,
          seuil: 5,
          datePeremption: art.datePeremption || "",
        });
      }
    }
  };

  const updateStockOnDelete = async (bon) => {
    const stockRef = collection(db, "stock");
    for (const art of bon.articles || []) {
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

  // Fetch Achats et Médicaments
  const fetchAchats = useCallback(async () => {
    const snap = await getDocs(collection(db, "achats"));
    let arr = [];
    snap.forEach((doc) => {
      const data = doc.data();
      if (
        Array.isArray(data.articles) &&
        data.articles.length > 0 &&
        data.articles.some(a => a.produit && a.quantite > 0 && a.prixUnitaire > 0)
      ) {
        arr.push({ id: doc.id, ...data });
      }
    });
    setAchats(arr);
  }, []);

  const fetchMedicaments = useCallback(async () => {
    const snap = await getDocs(collection(db, "stock"));
    let arr = [];
    snap.forEach((doc) => arr.push(doc.data()));
    setMedicaments(arr);
  }, []);

  useEffect(() => { fetchAchats(); }, [fetchAchats]);
  useEffect(() => { fetchMedicaments(); }, [fetchMedicaments]);

  const totalBonCourant = (articles || []).reduce((t, a) => t + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)), 0);

  // Filtres uniques
  const fournisseursUniques = Array.from(new Set(achats.map(a => a.fournisseur).filter(Boolean)));
  const medicamentsUniques = Array.from(
    new Set(
      achats
        .flatMap(a => Array.isArray(a.articles) ? a.articles.map(art => art.produit) : [])
        .filter(Boolean)
    )
  );

  // Application des filtres dynamiquement
  const achatsFiltres = achats.filter((b) => {
    let keep = true;
    if (filterFournisseur && b.fournisseur !== filterFournisseur) keep = false;
    if (filterMedicament) {
      const hasMedicament = (Array.isArray(b.articles) ? b.articles : []).some(a => a.produit === filterMedicament);
      if (!hasMedicament) keep = false;
    }
    if (filterDateMin) {
      const bd = b.date?.toDate?.() || null;
      if (!bd || bd < new Date(filterDateMin)) keep = false;
    }
    if (filterDateMax) {
      const bd = b.date?.toDate?.() || null;
      if (!bd || bd > new Date(filterDateMax + "T23:59:59")) keep = false;
    }
    return keep;
  });

  // ---- RENDER ----
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Achats</div>
      {/* Formulaire ajout article */}
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
          <input type="number" className="w-full" value={quantite} onChange={(e) => setQuantite(e.target.value)} required /></div>
        <div><label>Prix Achat</label>
          <input type="number" className="w-full" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} required /></div>
        <div><label>Prix Vente</label>
          <input type="number" className="w-full" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} /></div>
        <div><label>Remise</label>
          <input type="number" className="w-full" value={remiseArticle} onChange={(e) => setRemiseArticle(e.target.value)} /></div>
        <div><label>Date Exp.</label>
          <input type="date" className="w-full" value={datePeremption} onChange={(e) => setDatePeremption(e.target.value)} required /></div>
        <button type="submit" className="btn">Ajouter</button>
      </form>

      {/* Tableau des articles */}
      {articles.length > 0 && (
        <div className="table-pro-full" style={{height:'36vh', minHeight:'200px', marginBottom:20}}>
          <table>
            <thead>
              <tr>
                <th>Produit</th><th>Qté</th><th>Prix Achat</th>
                <th>Prix Vente</th><th>Remise</th><th>Date Exp.</th>
                <th>Total</th><th>Supprimer</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a, i) => (
                <tr key={i}>
                  <td>{a.produit}</td>
                  <td>{a.quantite}</td>
                  <td>{a.prixUnitaire} DH</td>
                  <td>{a.prixVente} DH</td>
                  <td>{a.remise} DH</td>
                  <td>{a.datePeremption}</td>
                  <td>{(a.prixUnitaire * a.quantite) - a.remise} DH</td>
                  <td>
                    <button type="button" className="btn danger" onClick={() => handleRemoveArticle(i)}>X</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={6} align="right"><strong>Total Bon</strong></td>
                <td colSpan={2}><strong>{totalBonCourant} DH</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Formulaire d'enregistrement du bon */}
      <form onSubmit={handleAddBon} className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:18,justifyContent:'flex-start'}}>
        <div><label>Fournisseur</label>
          <input className="w-full" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} required /></div>
        <div><label>Date Achat</label>
          <input type="date" className="w-full" value={dateAchat} onChange={(e) => setDateAchat(e.target.value)} required /></div>
        <div>
          <label>Statut</label>
          <select className="w-full" value={statutPaiement} onChange={(e) => setStatutPaiement(e.target.value)}>
            <option value="payé">Payé</option>
            <option value="partiel">Partiel</option>
            <option value="impayé">Impayé</option>
          </select>
        </div>
        <div><label>Remise Globale</label>
          <input type="number" className="w-full" value={remiseGlobale} onChange={(e) => setRemiseGlobale(e.target.value)} /></div>
        <button type="submit" className="btn">{isEditing ? "Modifier Bon" : "Enregistrer Bon"}</button>
        {isEditing && <button type="button" className="btn info" onClick={resetForm}>Annuler</button>}
      </form>

      {/* Toggle filtres historiques */}
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

      {/* Filtres historiques */}
      {showFiltres && (
        <div className="paper-card" style={{display:"flex",gap:20,alignItems:'center',marginTop:7,marginBottom:7,flexWrap:"wrap"}}>
          <div>
            <label>Fournisseur&nbsp;</label>
            <select value={filterFournisseur} onChange={e => setFilterFournisseur(e.target.value)} style={{minWidth:110}}>
              <option value="">Tous</option>
              {fournisseursUniques.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Médicament&nbsp;</label>
            <select value={filterMedicament} onChange={e => setFilterMedicament(e.target.value)} style={{minWidth:110}}>
              <option value="">Tous</option>
              {medicamentsUniques.map(m => <option key={m} value={m}>{m}</option>)}
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
          {(filterFournisseur || filterMedicament || filterDateMin || filterDateMax) && (
            <button className="btn danger" type="button" onClick={() => {
              setFilterFournisseur(""); setFilterMedicament(""); setFilterDateMin(""); setFilterDateMax("");
            }}>Effacer filtres</button>
          )}
        </div>
      )}

      <div className="fullscreen-table-title" style={{marginTop:15, fontSize:'1.45rem'}}>Historique des Achats</div>
      <div className="table-pro-full" style={{flex: '1 1 0%', minHeight:'46vh'}}>
        <table>
          <thead>
            <tr>
              <th>Fournisseur</th>
              <th>Date</th>
              <th>Statut</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {achatsFiltres.map((b) => (
              <tr key={b.id}>
                <td>{b.fournisseur}</td>
                <td>{b.date?.toDate().toLocaleDateString()}</td>
                <td>{b.statutPaiement}</td>
                <td>
                  {(Array.isArray(b.articles) ? b.articles : [])
                    .reduce((sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise), 0)} DH
                </td>
                <td>
                  <button className="btn info" onClick={() => handleEditBon(b)}>Modifier</button>
                  <button className="btn danger" onClick={() => handleDeleteBon(b)}>Supprimer</button>
                  <button className="btn print" onClick={() => handlePrintBon(b)}>Imprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

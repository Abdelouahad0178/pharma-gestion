import React, { useEffect, useState } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";

export default function Stock() {
  const [stock, setStock] = useState([]);
  const [filteredStock, setFilteredStock] = useState([]);
  const [retours, setRetours] = useState([]);
  const [filteredRetours, setFilteredRetours] = useState([]);

  const [nom, setNom] = useState("");
  const [quantite, setQuantite] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [datePeremption, setDatePeremption] = useState("");
  const [editId, setEditId] = useState(null);

  const [openRetour, setOpenRetour] = useState(false);
  const [selectedProduit, setSelectedProduit] = useState(null);
  const [quantiteRetour, setQuantiteRetour] = useState("");
  const [motifRetour, setMotifRetour] = useState("");
  const motifs = ["Expiration", "Destruction", "Cadeau", "Autre"];

  // Filtres Stock
  const [filterStockNom, setFilterStockNom] = useState("");
  const [filterStockDateExp, setFilterStockDateExp] = useState("");
  const [filterStockQuantiteMin, setFilterStockQuantiteMin] = useState("");
  const [filterStockQuantiteMax, setFilterStockQuantiteMax] = useState("");
  const [showFiltresStock, setShowFiltresStock] = useState(false);

  // Filtres Retours
  const [filterProduit, setFilterProduit] = useState("");
  const [filterMotif, setFilterMotif] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [showFiltresRetours, setShowFiltresRetours] = useState(false);

  // Charger Stock et Retours
  const fetchStock = async () => {
    const snap = await getDocs(collection(db, "stock"));
    let arr = [];
    snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
    arr.sort((a, b) => a.nom.localeCompare(b.nom));
    setStock(arr);
    setFilteredStock(arr);
  };

  const fetchRetours = async () => {
    const snap = await getDocs(collection(db, "retours"));
    let arr = [];
    snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
    arr.sort((a, b) => new Date(b.date.seconds * 1000) - new Date(a.date.seconds * 1000));
    setRetours(arr);
    setFilteredRetours(arr);
  };

  useEffect(() => {
    fetchStock();
    fetchRetours();
  }, []);

  // Filtrage Stock
  useEffect(() => {
    let filtered = stock;
    if (filterStockNom) filtered = filtered.filter((s) => s.nom.toLowerCase().includes(filterStockNom.toLowerCase()));
    if (filterStockDateExp) filtered = filtered.filter((s) => s.datePeremption && new Date(s.datePeremption) <= new Date(filterStockDateExp));
    if (filterStockQuantiteMin) filtered = filtered.filter((s) => s.quantite >= Number(filterStockQuantiteMin));
    if (filterStockQuantiteMax) filtered = filtered.filter((s) => s.quantite <= Number(filterStockQuantiteMax));
    setFilteredStock(filtered);
  }, [filterStockNom, filterStockDateExp, filterStockQuantiteMin, filterStockQuantiteMax, stock]);

  // Filtrage Retours
  useEffect(() => {
    let filtered = retours;
    if (filterProduit) filtered = filtered.filter((r) => r.produit?.toLowerCase().includes(filterProduit.toLowerCase()));
    if (filterMotif) filtered = filtered.filter((r) => r.motif === filterMotif);
    if (filterDateMin) filtered = filtered.filter((r) => new Date(r.date.seconds * 1000) >= new Date(filterDateMin));
    if (filterDateMax) filtered = filtered.filter((r) => new Date(r.date.seconds * 1000) <= new Date(filterDateMax));
    setFilteredRetours(filtered);
  }, [filterProduit, filterMotif, filterDateMin, filterDateMax, retours]);

  // Ajouter / Modifier Stock
  const handleSave = async (e) => {
    e.preventDefault();
    if (!nom || !quantite || !prixAchat || !prixVente) return;
    const data = { nom, quantite: Number(quantite), prixAchat: Number(prixAchat), prixVente: Number(prixVente), datePeremption };
    if (editId) {
      await updateDoc(doc(db, "stock", editId), data);
      setEditId(null);
    } else {
      await addDoc(collection(db, "stock"), data);
    }
    setNom(""); setQuantite(""); setPrixAchat(""); setPrixVente(""); setDatePeremption("");
    fetchStock();
  };

  const handleEdit = (prod) => {
    setEditId(prod.id);
    setNom(prod.nom);
    setQuantite(prod.quantite);
    setPrixAchat(prod.prixAchat);
    setPrixVente(prod.prixVente);
    setDatePeremption(prod.datePeremption || "");
  };

  const handleDelete = async (prod) => {
    if (window.confirm("Supprimer ce médicament ?")) {
      await deleteDoc(doc(db, "stock", prod.id));
      fetchStock();
    }
  };

  // Retour
  const handleOpenRetour = (prod) => {
    setSelectedProduit(prod);
    setQuantiteRetour("");
    setMotifRetour("");
    setOpenRetour(true);
  };

  const handleRetour = async () => {
    if (!quantiteRetour || quantiteRetour <= 0 || quantiteRetour > selectedProduit.quantite) return alert("Quantité invalide !");
    if (!motifRetour) return alert("Sélectionnez un motif !");
    const newQuantite = selectedProduit.quantite - Number(quantiteRetour);
    await updateDoc(doc(db, "stock", selectedProduit.id), { quantite: newQuantite });
    await addDoc(collection(db, "retours"), { produit: selectedProduit.nom, quantite: Number(quantiteRetour), motif: motifRetour, date: new Date() });
    setOpenRetour(false);
    fetchStock();
    fetchRetours();
  };

  const handleCancelRetour = async (retour) => {
    if (!window.confirm("Annuler ce retour et réinjecter dans le stock si possible ?")) return;
    if (retour?.produit && retour.produit.trim() !== "") {
      const stockQuery = query(collection(db, "stock"), where("nom", "==", retour.produit));
      const stockSnap = await getDocs(stockQuery);
      if (!stockSnap.empty) {
        const stockDoc = stockSnap.docs[0];
        const stockData = stockDoc.data();
        await updateDoc(doc(db, "stock", stockDoc.id), {
          quantite: Number(stockData.quantite) + Number(retour.quantite),
        });
      }
    }
    await deleteDoc(doc(db, "retours", retour.id));
    fetchStock();
    fetchRetours();
  };

  const handlePrintStock = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Stock</title></head><body>
      <h2>Inventaire Stock</h2>
      <table border="1" cellspacing="0" cellpadding="5">
        <tr><th>Médicament</th><th>Qté</th><th>Prix Achat</th><th>Prix Vente</th><th>Date Exp.</th></tr>
        ${filteredStock.map((p) => `<tr><td>${p.nom}</td><td>${p.quantite}</td><td>${p.prixAchat} DH</td><td>${p.prixVente} DH</td><td>${p.datePeremption || "N/A"}</td></tr>`).join("")}
      </table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrintRetours = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Retours</title></head><body>
      <h2>Historique des Retours</h2>
      <table border="1" cellspacing="0" cellpadding="5">
        <tr><th>Produit</th><th>Quantité</th><th>Motif</th><th>Date</th></tr>
        ${filteredRetours.map((r) => `<tr><td>${r.produit || "Non spécifié"}</td><td>${r.quantite}</td><td>${r.motif}</td><td>${new Date(r.date.seconds * 1000).toLocaleDateString()}</td></tr>`).join("")}
      </table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // --- RENDER ---
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion du Stock</div>

      {/* Formulaire ajout/modif */}
      <form onSubmit={handleSave} className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:14,justifyContent:'flex-start'}}>
        <div><label>Médicament</label>
          <input className="w-full" value={nom} onChange={(e) => setNom(e.target.value)} required />
        </div>
        <div><label>Quantité</label>
          <input className="w-full" type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} required />
        </div>
        <div><label>Prix Achat</label>
          <input className="w-full" type="number" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} required />
        </div>
        <div><label>Prix Vente</label>
          <input className="w-full" type="number" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} required />
        </div>
        <div><label>Date Exp.</label>
          <input className="w-full" type="date" value={datePeremption} onChange={(e) => setDatePeremption(e.target.value)} />
        </div>
        <button className="btn" type="submit">{editId ? "Modifier" : "Ajouter"}</button>
        {editId && <button className="btn info" type="button" onClick={() => setEditId(null)}>Annuler</button>}
      </form>

      {/* Toggle filtres Stock */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginTop:16,marginBottom:0}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1.32em",
            padding:"2px 13px",
            minWidth:35,
            background:showFiltresStock
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={()=>setShowFiltresStock(v=>!v)}
          aria-label="Afficher/Masquer les filtres Stock"
          title="Afficher/Masquer les filtres Stock"
        >
          {showFiltresStock ? "➖" : "➕"}
        </button>
        <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Filtres Stock</span>
      </div>
      {showFiltresStock && (
        <div className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:11,alignItems:'center',marginBottom:8,marginTop:7}}>
          <div><label>Nom</label>
            <input value={filterStockNom} onChange={(e) => setFilterStockNom(e.target.value)} />
          </div>
          <div><label>Date Exp. max</label>
            <input type="date" value={filterStockDateExp} onChange={(e) => setFilterStockDateExp(e.target.value)} />
          </div>
          <div><label>Qté min</label>
            <input type="number" value={filterStockQuantiteMin} onChange={(e) => setFilterStockQuantiteMin(e.target.value)} />
          </div>
          <div><label>Qté max</label>
            <input type="number" value={filterStockQuantiteMax} onChange={(e) => setFilterStockQuantiteMax(e.target.value)} />
          </div>
          <button className="btn info" type="button" onClick={handlePrintStock}>🖨 Imprimer le Stock filtré</button>
        </div>
      )}

      {/* Tableau Stock */}
      <div className="table-pro-full" style={{marginTop:2, marginBottom:24}}>
        <table>
          <thead>
            <tr>
              <th>Médicament</th>
              <th>Quantité</th>
              <th>Prix Achat</th>
              <th>Prix Vente</th>
              <th>Date Exp.</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStock.map((p) => (
              <tr key={p.id}>
                <td>{p.nom}</td>
                <td>{p.quantite}</td>
                <td>{p.prixAchat} DH</td>
                <td>{p.prixVente} DH</td>
                <td>{p.datePeremption || "N/A"}</td>
                <td>
                  <button className="btn info" type="button" onClick={() => handleEdit(p)}>Modifier</button>
                  <button className="btn danger" type="button" onClick={() => handleDelete(p)}>Supprimer</button>
                  <button className="btn print" type="button" onClick={() => handleOpenRetour(p)}>Retour</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Toggle filtres Retours */}
      <div className="fullscreen-table-title" style={{marginTop:24, fontSize:'1.35rem', display:'flex',alignItems:"center",gap:9}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1.32em",
            padding:"2px 13px",
            minWidth:35,
            background:showFiltresRetours
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={()=>setShowFiltresRetours(v=>!v)}
          aria-label="Afficher/Masquer les filtres Retours"
          title="Afficher/Masquer les filtres Retours"
        >
          {showFiltresRetours ? "➖" : "➕"}
        </button>
        Historique des retours
      </div>
      {showFiltresRetours && (
        <div className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',marginBottom:8,marginTop:7}}>
          <div><label>Produit</label>
            <input value={filterProduit} onChange={(e) => setFilterProduit(e.target.value)} />
          </div>
          <div><label>Motif</label>
            <select value={filterMotif} onChange={(e) => setFilterMotif(e.target.value)}>
              <option value="">Tous</option>
              {motifs.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><label>Date min</label>
            <input type="date" value={filterDateMin} onChange={(e) => setFilterDateMin(e.target.value)} />
          </div>
          <div><label>Date max</label>
            <input type="date" value={filterDateMax} onChange={(e) => setFilterDateMax(e.target.value)} />
          </div>
          <button className="btn print" type="button" onClick={handlePrintRetours}>🖨 Imprimer Retours filtrés</button>
        </div>
      )}

      {/* Tableau Retours */}
      <div className="table-pro-full" style={{marginTop:2}}>
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Quantité</th>
              <th>Motif</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRetours.map((r) => (
              <tr key={r.id}>
                <td>{r.produit || "Non spécifié"}</td>
                <td>{r.quantite}</td>
                <td>{r.motif}</td>
                <td>{new Date(r.date.seconds * 1000).toLocaleDateString()}</td>
                <td>
                  <button className="btn success" type="button" onClick={() => handleCancelRetour(r)}>Annuler Retour</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialog retour */}
      {openRetour && (
        <div className="modal-overlay">
          <div className="paper-card" style={{ maxWidth: 380, margin: "0 auto", background: "#213054" }}>
            <h3 style={{color:"#fff"}}>Retour - {selectedProduit?.nom}</h3>
            <form onSubmit={e => {e.preventDefault(); handleRetour();}} style={{display:'flex', flexDirection:'column', gap:10}}>
              <label>Quantité à retourner</label>
              <input type="number" value={quantiteRetour} onChange={e => setQuantiteRetour(e.target.value)} min={1} max={selectedProduit?.quantite || 1} required />
              <label>Motif</label>
              <select value={motifRetour} onChange={e => setMotifRetour(e.target.value)} required>
                <option value="">Choisir un motif</option>
                {motifs.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <div style={{marginTop:10, display:'flex', gap:7}}>
                <button className="btn info" type="button" onClick={() => setOpenRetour(false)}>Annuler</button>
                <button className="btn print" type="submit">Valider</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
} from "@mui/material";

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

  // Filtres Retours
  const [filterProduit, setFilterProduit] = useState("");
  const [filterMotif, setFilterMotif] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");

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

  // Annuler Retour (produit vide accepté)
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
        console.log(`Réinjecté dans stock: ${retour.produit}`);
      } else {
        console.warn("Produit non trouvé en stock. Suppression uniquement.");
      }
    } else {
      console.warn("Produit vide. Suppression uniquement.");
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

  return (
    <Box sx={{ maxWidth: 1200, margin: "30px auto" }}>
      <Typography variant="h4" gutterBottom>Gestion du Stock</Typography>

      {/* Formulaire ajout/modif */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <form onSubmit={handleSave} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TextField label="Médicament" value={nom} onChange={(e) => setNom(e.target.value)} required />
          <TextField label="Quantité" type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} required />
          <TextField label="Prix Achat" type="number" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} required />
          <TextField label="Prix Vente" type="number" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} required />
          <TextField label="Date Exp." type="date" InputLabelProps={{ shrink: true }} value={datePeremption} onChange={(e) => setDatePeremption(e.target.value)} />
          <Button type="submit" variant="contained">{editId ? "Modifier" : "Ajouter"}</Button>
          {editId && <Button onClick={() => setEditId(null)}>Annuler</Button>}
        </form>
      </Paper>

      {/* Filtres Stock */}
      <Typography variant="h6">Filtres du stock</Typography>
      <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField label="Nom" value={filterStockNom} onChange={(e) => setFilterStockNom(e.target.value)} />
        <TextField label="Date Exp. max" type="date" InputLabelProps={{ shrink: true }} value={filterStockDateExp} onChange={(e) => setFilterStockDateExp(e.target.value)} />
        <TextField label="Qté min" type="number" value={filterStockQuantiteMin} onChange={(e) => setFilterStockQuantiteMin(e.target.value)} />
        <TextField label="Qté max" type="number" value={filterStockQuantiteMax} onChange={(e) => setFilterStockQuantiteMax(e.target.value)} />
      </Paper>
      <Button variant="outlined" onClick={handlePrintStock}>🖨 Imprimer le Stock filtré</Button>

      {/* Tableau Stock */}
      <TableContainer component={Paper} sx={{ mt: 2, mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Médicament</TableCell>
              <TableCell>Quantité</TableCell>
              <TableCell>Prix Achat</TableCell>
              <TableCell>Prix Vente</TableCell>
              <TableCell>Date Exp.</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredStock.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.nom}</TableCell>
                <TableCell>{p.quantite}</TableCell>
                <TableCell>{p.prixAchat} DH</TableCell>
                <TableCell>{p.prixVente} DH</TableCell>
                <TableCell>{p.datePeremption || "N/A"}</TableCell>
                <TableCell>
                  <Button onClick={() => handleEdit(p)}>Modifier</Button>
                  <Button color="error" onClick={() => handleDelete(p)}>Supprimer</Button>
                  <Button color="warning" onClick={() => handleOpenRetour(p)}>Retour</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Filtres Retours */}
      <Typography variant="h5" gutterBottom>Historique des retours</Typography>
      <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField label="Produit" value={filterProduit} onChange={(e) => setFilterProduit(e.target.value)} />
        <TextField select label="Motif" value={filterMotif} onChange={(e) => setFilterMotif(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Tous</MenuItem>
          {motifs.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
        </TextField>
        <TextField label="Date min" type="date" InputLabelProps={{ shrink: true }} value={filterDateMin} onChange={(e) => setFilterDateMin(e.target.value)} />
        <TextField label="Date max" type="date" InputLabelProps={{ shrink: true }} value={filterDateMax} onChange={(e) => setFilterDateMax(e.target.value)} />
      </Paper>
      <Button variant="outlined" color="secondary" onClick={handlePrintRetours}>🖨 Imprimer Retours filtrés</Button>

      {/* Tableau Retours */}
      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Produit</TableCell>
              <TableCell>Quantité</TableCell>
              <TableCell>Motif</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRetours.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.produit || "Non spécifié"}</TableCell>
                <TableCell>{r.quantite}</TableCell>
                <TableCell>{r.motif}</TableCell>
                <TableCell>{new Date(r.date.seconds * 1000).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button color="success" onClick={() => handleCancelRetour(r)}>Annuler Retour</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog retour */}
      <Dialog open={openRetour} onClose={() => setOpenRetour(false)}>
        <DialogTitle>Retour - {selectedProduit?.nom}</DialogTitle>
        <DialogContent>
          <TextField label="Quantité" type="number" fullWidth value={quantiteRetour} onChange={(e) => setQuantiteRetour(e.target.value)} sx={{ mt: 2 }} />
          <TextField select label="Motif" fullWidth value={motifRetour} onChange={(e) => setMotifRetour(e.target.value)} sx={{ mt: 2 }}>
            {motifs.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRetour(false)}>Annuler</Button>
          <Button variant="contained" color="warning" onClick={handleRetour}>Valider</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

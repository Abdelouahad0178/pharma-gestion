import React, { useEffect, useState } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import {
  Box, Typography, Paper, TextField, Button, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, MenuItem, Select, FormControl, InputLabel
} from "@mui/material";

// Numérotation automatique
function generateNumero(docs, type) {
  const prefix = type === "FACT" ? "FACT" : "DEV";
  const nums = docs.filter(d => d.type === type)
    .map(d => parseInt((d.numero || '').replace(prefix, '')))
    .filter(n => !isNaN(n));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export default function DevisFactures() {
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

  // Récupération Firestore (devis, factures, ventes, paramètres)
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "devisFactures"));
      let arr = [];
      snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
      setDocuments(arr);
      // Bons de vente pour factures groupées
      const ventesSnap = await getDocs(collection(db, "ventes"));
      setVentes(ventesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      // Paramètres (entête, pied)
      const paramsSnap = await getDocs(collection(db, "parametres"));
      if (!paramsSnap.empty) {
        const data = paramsSnap.docs[0].data();
        setParametres({ entete: data.entete || "", pied: data.pied || "" });
      }
    })();
  }, []);

  const numeroAuto = generateNumero(documents, type);

  // Identification des bons déjà facturés (par une facture non annulée)
  const bonsFactures = documents
    .filter(d => d.type === "FACT" && d.bonsAssocies && !d.annulee)
    .flatMap(d => d.bonsAssocies || []);

  // Ajout article à la saisie
  const handleAddArticle = (e) => {
    e.preventDefault();
    if (!produit || !quantite || !prixUnitaire) return;
    setArticles([...articles, {
      produit,
      quantite: Number(quantite),
      prixUnitaire: Number(prixUnitaire),
      remise: Number(remise) || 0,
    }]);
    setProduit(""); setQuantite(1); setPrixUnitaire(0); setRemise(0);
  };

  // Enregistrement devis/facture manuelle
  const handleAddDoc = async (e) => {
    e.preventDefault();
    if (!client || !date || articles.length === 0) return;
    await addDoc(collection(db, "devisFactures"), {
      type,
      numero: numeroAuto,
      client,
      date: Timestamp.fromDate(new Date(date)),
      articles,
      annulee: false,
    });
    setClient(""); setDate(""); setArticles([]);
    // refresh
    const snap = await getDocs(collection(db, "devisFactures"));
    let arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    setDocuments(arr);
  };

  // Impression (avec cachet)
  const handlePrintDoc = (doc) => {
    const articles = Array.isArray(doc.articles) ? doc.articles : [];
    const total = articles.reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0);
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>${doc.type === "FACT" ? "Facture" : "Devis"}</title>
      <style>
        body { font-family: Arial; margin: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #000; padding: 8px; text-align: center; }
        .footer { margin-top: 50px; text-align: right; }
        .cachet { display: inline-block; border: 2px solid #1976d2; color: #1976d2; border-radius: 50%; padding: 20px 35px; font-size: 18px; font-weight: bold; }
      </style>
      </head><body>
        <div style="text-align:center">${parametres.entete || "Pharmacie"}</div>
        <h2>${doc.type === "FACT" ? "Facture" : "Devis"} N° ${doc.numero}</h2>
        <p><strong>Client:</strong> ${doc.client}</p>
        <p><strong>Date:</strong> ${doc.date?.toDate().toLocaleDateString()}</p>
        <table>
          <thead><tr><th>Produit</th><th>Qté</th><th>Prix Unitaire</th><th>Remise</th><th>Total</th></tr></thead>
          <tbody>
            ${articles.map(a => `
              <tr>
                <td>${a.produit}</td>
                <td>${a.quantite}</td>
                <td>${a.prixUnitaire} DH</td>
                <td>${a.remise || 0} DH</td>
                <td>${a.quantite * a.prixUnitaire - (a.remise || 0)} DH</td>
              </tr>
            `).join("")}
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
    setSelectedBons(prev =>
      prev.includes(bonId) ? prev.filter(id => id !== bonId) : [...prev, bonId]
    );
  };

  // Générer une facture groupée à partir de bons
  const handleGenerateFacture = async () => {
    if (selectedBons.length === 0) return alert("Sélectionnez des bons !");
    const bons = ventes.filter(v => selectedBons.includes(v.id));
    if (!bons.length) return;
    const client = bons[0].client;
    const articles = bons.flatMap(b => b.articles || []);
    const total = articles.reduce((sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)), 0);
    // Numéro
    const snap = await getDocs(collection(db, "devisFactures"));
    let arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
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
    // refresh & impression
    getDocs(collection(db, "devisFactures")).then(snap2 => {
      let arr2 = [];
      snap2.forEach(doc => arr2.push({ id: doc.id, ...doc.data() }));
      setDocuments(arr2);
      handlePrintDoc(newFacture);
    });
  };

  // Annuler une facture
  const handleAnnuleFacture = async (docData) => {
    if (!window.confirm("Confirmer l'annulation de la facture ?")) return;
    await updateDoc(doc(db, "devisFactures", docData.id), { annulee: true });
    // Refresh documents
    const snap = await getDocs(collection(db, "devisFactures"));
    let arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    setDocuments(arr);
  };

  return (
    <Box sx={{ maxWidth: 1200, margin: "30px auto" }}>
      <Typography variant="h4" gutterBottom>Gestion Devis, Bons et Factures</Typography>

      {/* Création devis/facture manuelle */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <form onSubmit={handleAddArticle} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <FormControl sx={{ minWidth: 140 }}>
            <InputLabel>Type</InputLabel>
            <Select value={type} onChange={e => setType(e.target.value)}>
              <MenuItem value="FACT">Facture</MenuItem>
              <MenuItem value="DEV">Devis</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Client" value={client} onChange={e => setClient(e.target.value)} required />
          <TextField label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} required />
        </form>
        <form onSubmit={handleAddArticle} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 15 }}>
          <TextField label="Produit" value={produit} onChange={e => setProduit(e.target.value)} required />
          <TextField label="Quantité" type="number" value={quantite} onChange={e => setQuantite(e.target.value)} required />
          <TextField label="Prix Unitaire" type="number" value={prixUnitaire} onChange={e => setPrixUnitaire(e.target.value)} required />
          <TextField label="Remise" type="number" value={remise} onChange={e => setRemise(e.target.value)} />
          <Button type="submit" variant="contained">Ajouter Article</Button>
        </form>
        {(articles || []).length > 0 && (
          <TableContainer sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Produit</TableCell>
                  <TableCell>Qté</TableCell>
                  <TableCell>Prix Unitaire</TableCell>
                  <TableCell>Remise</TableCell>
                  <TableCell>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {articles.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell>{a.produit}</TableCell>
                    <TableCell>{a.quantite}</TableCell>
                    <TableCell>{a.prixUnitaire} DH</TableCell>
                    <TableCell>{a.remise || 0} DH</TableCell>
                    <TableCell>{a.quantite * a.prixUnitaire - (a.remise || 0)} DH</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Button
          type="button"
          variant="contained"
          color="success"
          onClick={handleAddDoc}
          sx={{ mt: 2 }}
        >
          Enregistrer {type === "FACT" ? "Facture" : "Devis"}
        </Button>
      </Paper>

      {/* Historique */}
      <Typography variant="h5" sx={{ mt: 3 }}>Historique</Typography>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Numéro</TableCell>
              <TableCell>Client</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Total</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>{doc.type === "FACT" ? "Facture" : "Devis"}</TableCell>
                <TableCell>{doc.numero}</TableCell>
                <TableCell>{doc.client}</TableCell>
                <TableCell>{doc.date?.toDate().toLocaleDateString()}</TableCell>
                <TableCell>{(doc.articles || []).reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0)} DH</TableCell>
                <TableCell>
                  {doc.annulee ? <span style={{ color: "red" }}>Annulée</span> : ""}
                </TableCell>
                <TableCell>
                  <Button onClick={() => handlePrintDoc(doc)}>Imprimer</Button>
                  {doc.type === "FACT" && !doc.annulee && (
                    <Button color="error" onClick={() => handleAnnuleFacture(doc)}>Annuler</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Bons de vente sélection pour facture */}
      <Typography variant="h6" sx={{ mt: 4 }}>Sélectionner des Bons de Vente pour Facture</Typography>
      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell></TableCell>
              <TableCell>Client</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ventes
              .filter(v => !bonsFactures.includes(v.id))
              .map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <Checkbox checked={selectedBons.includes(v.id)} onChange={() => toggleBonSelection(v.id)} />
                  </TableCell>
                  <TableCell>{v.client}</TableCell>
                  <TableCell>{v.date?.toDate().toLocaleDateString()}</TableCell>
                  <TableCell>
                    {(v.articles || []).reduce((sum, a) => sum + (a.prixUnitaire * a.quantite - (a.remise || 0)), 0)} DH
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Button variant="contained" color="primary" onClick={handleGenerateFacture}>Générer Facture</Button>
    </Box>
  );
}

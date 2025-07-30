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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
} from "@mui/material";

export default function Paiements() {
  const [relatedTo, setRelatedTo] = useState("achats");
  const [paiements, setPaiements] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [filterStatus, setFilterStatus] = useState("all");
  const [totalBonSelectionne, setTotalBonSelectionne] = useState(0);
  const [selectedPhone, setSelectedPhone] = useState("");

  // Fetch docs achats/ventes selon type choisi
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

  // Fetch paiements liés au type
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
      // Chercher le téléphone (clé "telephone" pour fournisseur/client si dispo)
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
  const handleAddPaiement = async () => {
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

  return (
    <Box sx={{ maxWidth: 1000, margin: "30px auto" }}>
      <Typography variant="h4" gutterBottom>
        Gestion des Paiements
      </Typography>

      {/* Choix type */}
      <FormControl sx={{ mb: 3, minWidth: 260 }}>
        <InputLabel>Choisir le type de Paiement</InputLabel>
        <Select
          value={relatedTo}
          onChange={(e) => setRelatedTo(e.target.value)}
        >
          <MenuItem value="achats">Paiements Achats (Fournisseurs)</MenuItem>
          <MenuItem value="ventes">Paiements Ventes (Clients)</MenuItem>
        </Select>
      </FormControl>

      <Typography variant="h6" gutterBottom>
        Total du bon sélectionné : <strong>{totalBonSelectionne} DH</strong>
      </Typography>
      {selectedDoc && selectedPhone && (
        <Typography color="info.main" sx={{ mb: 2 }}>
          {relatedTo === "achats" ? "Téléphone Fournisseur" : "Téléphone Client"}: <b>{selectedPhone}</b>
        </Typography>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>{relatedTo === "achats" ? "Bon d'Achat" : "Bon de Vente"}</InputLabel>
          <Select value={selectedDoc} onChange={(e) => handleSelectDoc(e.target.value)} required>
            {documents.map((d) => {
              const total = getTotalDoc(d);
              const paid = (paiementsByDoc[d.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
              if (total - paid <= 0) return null; // Bon déjà totalement payé, masquer
              return (
                <MenuItem key={d.id} value={d.id}>
                  {relatedTo === "achats" ? d.fournisseur : d.client} - {d.date?.toDate().toLocaleDateString()} (Total: {total} DH | Payé: {paid} DH)
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        <TextField
          label="Montant payé"
          type="number"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        />
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Mode de paiement</InputLabel>
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <MenuItem value="Espèces">Espèces</MenuItem>
            <MenuItem value="Carte">Carte</MenuItem>
            <MenuItem value="Virement">Virement</MenuItem>
            <MenuItem value="Chèque">Chèque</MenuItem>
            <MenuItem value="Autre">Autre</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" onClick={handleAddPaiement}>
          Ajouter Paiement
        </Button>
      </Paper>

      <FormControl sx={{ mb: 2, minWidth: 200 }}>
        <InputLabel>Filtrer par statut</InputLabel>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <MenuItem value="all">Tous</MenuItem>
          <MenuItem value="paid">Payé</MenuItem>
          <MenuItem value="due">Dû</MenuItem>
        </Select>
      </FormControl>

      <Typography variant="h6" sx={{ mt: 2 }}>Historique des Paiements</Typography>
      <TableContainer component={Paper} sx={{ mt: 1 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date(s)</TableCell>
              <TableCell>{relatedTo === "achats" ? "Fournisseur" : "Client"}</TableCell>
              <TableCell>Total</TableCell>
              <TableCell>Paiement(s)</TableCell>
              <TableCell>Solde</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {docsAffiches.map((doc) => {
              const paiementsDoc = paiementsByDoc[doc.id] || [];
              if (paiementsDoc.length === 0) return null;
              const total = getTotalDoc(doc);
              const paid = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
              const solde = total - paid;
              return (
                <TableRow key={doc.id}>
                  <TableCell>
                    {paiementsDoc.map((p) => p.date?.toDate().toLocaleDateString()).join(" / ")}
                  </TableCell>
                  <TableCell>
                    {relatedTo === "achats" ? doc.fournisseur : doc.client}
                    {/* Affichage téléphone dans l'historique si présent */}
                    {((relatedTo === "achats" ? doc.telephone : doc.telephoneClient) || doc.telephone) &&
                      <div style={{ fontSize: "0.85em", color: "#1985A1" }}>
                        <b>📞 {(relatedTo === "achats" ? doc.telephone : doc.telephoneClient) || doc.telephone}</b>
                      </div>
                    }
                  </TableCell>
                  <TableCell>{total} DH</TableCell>
                  <TableCell>
                    {paiementsDoc.map((p, i) =>
                      <span key={p.id || i}>
                        <b>{p.montant} DH</b> <i>{p.mode}</i>{i < paiementsDoc.length - 1 ? " + " : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={solde <= 0 ? "Payé" : `${solde} DH dû`}
                      color={solde <= 0 ? "success" : "error"}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { collection, getDocs } from "firebase/firestore";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Select,
  MenuItem
} from "@mui/material";

export default function Dashboard() {
  const [totalVentes, setTotalVentes] = useState(0);
  const [totalAchats, setTotalAchats] = useState(0);
  const [produitsStock, setProduitsStock] = useState(0);
  const [alertes, setAlertes] = useState([]);
  const [periode, setPeriode] = useState("jour");

  // ➡ Charger données Firestore
  const fetchData = async () => {
    const ventesSnap = await getDocs(collection(db, "ventes"));
    const achatsSnap = await getDocs(collection(db, "achats"));
    const stockSnap = await getDocs(collection(db, "stock"));

    // Tableaux sécurisés
    let ventesArr = [];
    ventesSnap.forEach((doc) => ventesArr.push(doc.data()));

    let achatsArr = [];
    achatsSnap.forEach((doc) => achatsArr.push(doc.data()));

    let stockArr = [];
    stockSnap.forEach((doc) => stockArr.push(doc.data()));

    setProduitsStock(stockArr.length);

    // ➡ Filtrer par période
    const filteredVentes = filterByPeriode(ventesArr, periode);
    const filteredAchats = filterByPeriode(achatsArr, periode);

    // ➡ Totaux sécurisés
    setTotalVentes(
      filteredVentes.reduce((total, vente) => {
        const articles = Array.isArray(vente.articles) ? vente.articles : [];
        return total + articles.reduce((sum, a) =>
          sum + (((a.prixUnitaire || 0) * (a.quantite || 0)) - (a.remise || 0)), 0);
      }, 0)
    );

    setTotalAchats(
      filteredAchats.reduce((total, achat) => {
        const articles = Array.isArray(achat.articles) ? achat.articles : [];
        return total + articles.reduce((sum, a) =>
          sum + (((a.prixUnitaire || 0) * (a.quantite || 0)) - (a.remise || 0)), 0);
      }, 0)
    );

    // ➡ Alertes stock bas / péremption
    const alertList = [];
    const today = new Date();
    stockArr.forEach((item) => {
      if ((item.quantite || 0) <= (item.seuil || 0)) {
        alertList.push({ type: "Stock bas", message: `${item.nom || ""} (Qté: ${item.quantite || 0})` });
      }
      if (item.datePeremption) {
        const diffDays = (new Date(item.datePeremption) - today) / (1000 * 3600 * 24);
        if (diffDays <= 30) {
          alertList.push({ type: "Péremption proche", message: `${item.nom || ""} (${Math.ceil(diffDays)} j)` });
        }
      }
    });
    setAlertes(alertList);
  };

  // ➡ Filtrer par période
  const filterByPeriode = (data, period) => {
    const now = new Date();
    return data.filter((item) => {
      if (!item.date) return false;
      const d = item.date.toDate ? item.date.toDate() : new Date(item.date);
      switch (period) {
        case "jour": return d.toDateString() === now.toDateString();
        case "semaine": {
          const start = new Date(now); start.setDate(now.getDate() - 7);
          return d >= start;
        }
        case "mois": return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        case "annee": return d.getFullYear() === now.getFullYear();
        default: return true;
      }
    });
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  return (
    <Box sx={{ maxWidth: 1200, margin: "30px auto" }}>
      <Typography variant="h4" gutterBottom>Tableau de bord</Typography>

      {/* Filtres */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
        <Typography>Filtrer par :</Typography>
        <Select value={periode} onChange={(e) => setPeriode(e.target.value)}>
          <MenuItem value="jour">Jour</MenuItem>
          <MenuItem value="semaine">Semaine</MenuItem>
          <MenuItem value="mois">Mois</MenuItem>
          <MenuItem value="annee">Année</MenuItem>
        </Select>
        <Button variant="outlined" onClick={fetchData}>Actualiser</Button>
      </Box>

      {/* Statistiques */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2, textAlign: "center", bgcolor: "#e3f2fd" }}>
            <Typography variant="h6">Ventes</Typography>
            <Typography variant="h5" color="primary">{totalVentes} DH</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2, textAlign: "center", bgcolor: "#e8f5e9" }}>
            <Typography variant="h6">Achats</Typography>
            <Typography variant="h5" color="success.main">{totalAchats} DH</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2, textAlign: "center", bgcolor: "#fffde7" }}>
            <Typography variant="h6">Produits en stock</Typography>
            <Typography variant="h5">{produitsStock}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2, textAlign: "center", bgcolor: "#ffebee" }}>
            <Typography variant="h6">Alertes</Typography>
            <Typography variant="h5" color="error">{alertes.length}</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Alertes */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Alertes</Typography>
        {alertes.length === 0 ? (
          <Typography>Aucune alerte actuellement.</Typography>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Détail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alertes.map((a, i) => (
                <TableRow key={i} style={{ background: a.type === "Stock bas" ? "#ffebee" : "#fff3e0" }}>
                  <TableCell>{a.type}</TableCell>
                  <TableCell>{a.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Box>
  );
}

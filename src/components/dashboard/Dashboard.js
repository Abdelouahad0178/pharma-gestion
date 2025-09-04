// src/components/Dashboard.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";
import { useNavigate } from "react-router-dom";

/* =========================
   Utils Dates & Formats
========================= */

// Accepte Timestamp Firestore, {seconds}, Date, ISO string, number
function parseDate(dateInput) {
  if (!dateInput) return null;
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === "function") {
      return dateInput.toDate();
    }
    if (dateInput?.seconds) {
      return new Date(dateInput.seconds * 1000);
    }
    if (dateInput instanceof Date) return dateInput;
    if (typeof dateInput === "string" || typeof dateInput === "number") {
      const d = new Date(dateInput);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}

// Période/intervalle (dateMin/dateMax au format YYYY-MM-DD)
function isDateInPeriod(dateInput, period, minDate = null, maxDate = null) {
  const d = parseDate(dateInput);
  if (!d) return false;
  try {
    if (minDate && d < new Date(minDate)) return false;
    if (maxDate && d > new Date(`${maxDate}T23:59:59`)) return false;

    if (!minDate && !maxDate) {
      const now = new Date();
      switch (period) {
        case "jour":
          return d.toDateString() === now.toDateString();
        case "semaine": {
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 7);
          return d >= weekAgo;
        }
        case "mois":
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        case "annee":
          return d.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Source de date pour un achat (conservé au cas où)
function getAchatDate(a) {
  return a?.dateReception ?? a?.dateAchat ?? a?.date ?? a?.timestamp ?? a?.createdAt ?? null;
}

// Jours restants avant péremption (si date dispo), sinon null
function daysToExpiration(datePeremption) {
  const d = parseDate(datePeremption);
  if (!d) return null;
  const today = new Date();
  return Math.ceil((d - today) / 86400000);
}

/* =========================
   Dashboard
========================= */

export default function Dashboard() {
  const { user, societeId, role, loading } = useUserRole();
  const navigate = useNavigate();

  // États data
  const [societeInfo, setSocieteInfo] = useState(null);
  const [societeLoading, setSocieteLoading] = useState(false);

  const [ventes, setVentes] = useState([]);
  const [achats, setAchats] = useState([]);
  const [stock, setStock] = useState([]);
  const [stockEntries, setStockEntries] = useState([]); // multi-lots
  const [paiements, setPaiements] = useState([]);
  const [retours, setRetours] = useState([]);

  const [dataLoading, setDataLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // UI & responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Filtres
  const [periode, setPeriode] = useState("mois");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");

  // Stats
  const [totalVentes, setTotalVentes] = useState(0);
  const [totalAchats, setTotalAchats] = useState(0);
  const [totalPaiements, setTotalPaiements] = useState(0);
  const [produitsStock, setProduitsStock] = useState(0);
  const [documentsImpayes, setDocumentsImpayes] = useState(0);
  const [soldeCaisse, setSoldeCaisse] = useState(0);
  const [alertes, setAlertes] = useState([]);

  /* =========================
     Responsive
  ========================= */
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w < 1024);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* =========================
     Helpers
  ========================= */
  const showNotification = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Montant d’un achat si pas de total pré-calculé
  const computeMontantAchat = useCallback((achat) => {
    try {
      if (achat?.montantTotal && !isNaN(achat.montantTotal)) {
        return Number(achat.montantTotal);
      }
      const articles = Array.isArray(achat?.articles) ? achat.articles : [];
      const totalArticles = articles.reduce((sum, a) => {
        const base = (a && (a.recu || a.commandee)) ? (a.recu || a.commandee) : a || {};
        const qte = Number(base?.quantite) || 0;
        const pu = Number(base?.prixUnitaire ?? base?.prixAchat ?? 0) || 0;
        const remise = Number(base?.remise) || 0;
        return sum + (qte * pu - remise);
      }, 0);
      const remiseGlobale = Number(achat?.remiseGlobale) || 0;
      return Math.max(0, totalArticles - remiseGlobale);
    } catch {
      return 0;
    }
  }, []);

  /* =========================
     Fetch Société & Données
  ========================= */
  const fetchSocieteInfo = useCallback(async () => {
    if (!societeId) {
      setSocieteInfo(null);
      return;
    }
    try {
      setSocieteLoading(true);
      const ref = doc(db, "societe", societeId);
      const snap = await getDoc(ref);
      setSocieteInfo(snap.exists() ? snap.data() : { nom: "Société inconnue" });
    } catch {
      setSocieteInfo({ nom: "Erreur de chargement" });
    } finally {
      setSocieteLoading(false);
    }
  }, [societeId]);

  const cleanImportedData = (data) => {
    const cleaned = { ...data };
    delete cleaned._exportedAt;
    delete cleaned._collection;
    return cleaned;
  };

  const fetchAllData = useCallback(async () => {
    if (!societeId) {
      setVentes([]); setAchats([]); setStock([]); setStockEntries([]);
      setPaiements([]); setRetours([]); setDataLoading(false);
      return;
    }
    try {
      setDataLoading(true);

      const [
        ventesSnap,
        achatsSnap,
        stockSnap,
        stockEntriesSnap,
        paiementsSnap,
        retoursSnap,
      ] = await Promise.all([
        getDocs(collection(db, "societe", societeId, "ventes")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "achats")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "stock")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "stock_entries")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "paiements")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "retours")).catch(() => ({ docs: [] })),
      ]);

      const ventesArr = [];
      const achatsArr = [];
      const stockArr = [];
      const stockEntriesArr = [];
      const paiementsArr = [];
      const retoursArr = [];

      ventesSnap.docs.forEach((d) => ventesArr.push({ id: d.id, ...cleanImportedData(d.data()) }));
      achatsSnap.docs.forEach((d) => achatsArr.push({ id: d.id, ...cleanImportedData(d.data()) }));
      stockSnap.docs.forEach((d) => stockArr.push({ id: d.id, ...cleanImportedData(d.data()) }));
      stockEntriesSnap.docs.forEach((d) => stockEntriesArr.push({ id: d.id, ...cleanImportedData(d.data()) }));
      paiementsSnap.docs.forEach((d) => paiementsArr.push({ id: d.id, ...cleanImportedData(d.data()) }));
      retoursSnap.docs.forEach((d) => retoursArr.push({ id: d.id, ...cleanImportedData(d.data()) }));

      // Trie Achats du plus récent au plus ancien (garde si jamais on réaffiche)
      achatsArr.sort((a, b) => {
        const da = parseDate(getAchatDate(a)) || new Date(0);
        const dbb = parseDate(getAchatDate(b)) || new Date(0);
        return dbb - da;
      });

      setVentes(ventesArr);
      setAchats(achatsArr);
      setStock(stockArr);
      setStockEntries(stockEntriesArr);
      setPaiements(paiementsArr);
      setRetours(retoursArr);

      setNotification({ message: "Données chargées avec succès !", type: "success" });
      setTimeout(() => setNotification(null), 2500);
    } catch {
      showNotification("Erreur lors du chargement des données", "error");
    } finally {
      setDataLoading(false);
    }
  }, [societeId, showNotification]);

  // Initial load
  useEffect(() => {
    if (!loading && user && societeId) {
      fetchSocieteInfo();
      fetchAllData();
    }
  }, [loading, user, societeId, fetchSocieteInfo, fetchAllData]);

  /* =========================
     Calculs Statistiques
  ========================= */
  useEffect(() => {
    if (dataLoading) return;
    try {
      const fVentes = ventes.filter((v) =>
        isDateInPeriod(v.date || v.timestamp, periode, dateMin, dateMax)
      );
      const fAchats = achats.filter((a) =>
        isDateInPeriod(getAchatDate(a), periode, dateMin, dateMax)
      );
      const fPaiements = paiements.filter((p) =>
        isDateInPeriod(p.date || p.timestamp, periode, dateMin, dateMax)
      );

      const stockTraditional = stock.length;
      const stockLots = stockEntries.filter((e) => (Number(e.quantite) || 0) > 0).length;
      setProduitsStock(stockTraditional + stockLots);

      const ventesTotal = fVentes.reduce((sum, v) => {
        if (v.montantTotal && !isNaN(v.montantTotal)) return sum + Number(v.montantTotal);
        const arts = Array.isArray(v.articles) ? v.articles : [];
        const t = arts.reduce((s, a) => {
          const q = Number(a.quantite) || 0;
          const pu = Number(a.prixUnitaire) || 0;
          const r = Number(a.remise) || 0;
          return s + (q * pu - r);
        }, 0);
        const rg = Number(v.remiseGlobale) || 0;
        return sum + Math.max(0, t - rg);
      }, 0);

      const achatsTotal = fAchats.reduce((sum, a) => sum + computeMontantAchat(a), 0);

      const paiementsTotal = fPaiements.reduce(
        (sum, p) => sum + (Number(p.montant) || 0),
        0
      );

      setTotalVentes(ventesTotal);
      setTotalAchats(achatsTotal);
      setTotalPaiements(paiementsTotal);

      // Solde de caisse du jour (ventes espèces)
      const todayStr = new Date().toDateString();
      const ventesAuj = ventes.filter((v) => {
        const d = parseDate(v.date || v.timestamp);
        return d && d.toDateString() === todayStr;
      });
      const solde = ventesAuj.reduce((sum, v) => {
        const mode = (v.modePaiement || "").toLowerCase();
        const isCash = !v.modePaiement || ["especes", "espèces", "cash", ""].includes(mode);
        if (!isCash) return sum;
        if (v.montantTotal && !isNaN(v.montantTotal)) return sum + Number(v.montantTotal);
        const arts = Array.isArray(v.articles) ? v.articles : [];
        const t = arts.reduce((s, a) => {
          const q = Number(a.quantite) || 0;
          const pu = Number(a.prixUnitaire) || 0;
          const r = Number(a.remise) || 0;
          return s + (q * pu - r);
        }, 0);
        const rg = Number(v.remiseGlobale) || 0;
        return sum + Math.max(0, t - rg);
      }, 0);
      setSoldeCaisse(solde);

      // Impayés (ventes + achats)
      let impayes = 0;
      [...ventes, ...achats].forEach((d) => {
        if (d?.statutPaiement && (d.statutPaiement === "impayé" || d.statutPaiement === "partiel")) {
          impayes++;
        }
      });
      setDocumentsImpayes(impayes);

      // Alertes synthétiques (stock bas, lots, péremption)
      const alerts = [];
      const today = new Date();
      stock.forEach((item) => {
        const q = Number(item.quantite) || 0;
        const seuil = Number(item.seuil) || 5;
        if (q <= seuil && q > 0) {
          alerts.push({ type: "Stock bas", message: `${item.nom || "Produit"} (Qté: ${q})`, severity: "warning", icon: "📦" });
        }
        if (item.datePeremption) {
          const exp = parseDate(item.datePeremption);
          if (exp) {
            const diffDays = Math.ceil((exp - today) / 86400000);
            if (diffDays <= 0) alerts.push({ type: "Produit périmé", message: `${item.nom || "Produit"} périmé !`, severity: "critical", icon: "🚫" });
            else if (diffDays <= 180) alerts.push({ type: "Péremption proche", message: `${item.nom || "Produit"} (${diffDays} j)`, severity: "danger", icon: "⚠️" });
          }
        }
      });
      stockEntries.forEach((lot) => {
        const q = Number(lot.quantite) || 0;
        const seuil = Number(lot.seuil) || 5;
        if (q <= seuil && q > 0) {
          alerts.push({ type: "Stock bas (Lot)", message: `${lot.nom || "Produit"} - Lot ${lot.numeroLot || "N/A"} (Qté: ${q})`, severity: "warning", icon: "🏷️" });
        }
        if (lot.datePeremption) {
          const exp = parseDate(lot.datePeremption);
          if (exp) {
            const diffDays = Math.ceil((exp - today) / 86400000);
            if (diffDays <= 0) alerts.push({ type: "Lot périmé", message: `${lot.nom || "Produit"} - Lot ${lot.numeroLot || "N/A"} périmé !`, severity: "critical", icon: "🚫" });
            else if (diffDays <= 180) alerts.push({ type: "Lot péremption proche", message: `${lot.nom || "Produit"} - Lot ${lot.numeroLot || "N/A"} (${diffDays} j)`, severity: "danger", icon: "⚠️" });
          }
        }
      });
      // Retours 24h
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const ret24 = retours.filter((r) => {
        const d = parseDate(r.date || r.timestamp);
        return d && d >= since;
      });
      if (ret24.length > 0) {
        const q = ret24.reduce((s, r) => s + (Number(r.quantite) || 0), 0);
        alerts.push({ type: "Retours récents", message: `${ret24.length} retours (${q} unités) dans les 24h`, severity: "info", icon: "↩️" });
      }
      setAlertes(alerts);
    } catch {
      // no-op
    }
  }, [dataLoading, ventes, achats, stock, stockEntries, paiements, retours, periode, dateMin, dateMax]);

  const getSocieteDisplayName = () =>
    societeLoading ? "Chargement…" :
    !societeInfo ? "Société inconnue" :
    (societeInfo.nom || societeInfo.nomSociete || societeInfo.name || societeInfo.raison_sociale || societeInfo.denomination || "Société");

  /* =========================
     Ruptures en alerte (stock & lots)
  ========================= */
  const ruptures = useMemo(() => {
    const rows = [];

    // Produits "stock"
    (Array.isArray(stock) ? stock : []).forEach((p) => {
      const q = Number(p.quantite) || 0;
      const seuil = Number(p.seuil) || 0;
      if (q <= 0 || (seuil > 0 && q <= seuil)) {
        rows.push({
          type: "Produit",
          nom: p.nom || p.designation || p.libelle || "Produit",
          lot: "—",
          quantite: q,
          seuil,
          dluoJours: p.datePeremption ? daysToExpiration(p.datePeremption) : null,
        });
      }
    });

    // Lots "stock_entries"
    (Array.isArray(stockEntries) ? stockEntries : []).forEach((lot) => {
      const q = Number(lot.quantite) || 0;
      const seuil = Number(lot.seuil) || 0;
      if (q <= 0 || (seuil > 0 && q <= seuil)) {
        rows.push({
          type: "Lot",
          nom: lot.nom || lot.designation || lot.libelle || "Produit",
          lot: lot.numeroLot || lot.lot || "N/A",
          quantite: q,
          seuil,
          dluoJours: lot.datePeremption ? daysToExpiration(lot.datePeremption) : null,
        });
      }
    });

    // Tri: quantité croissante, puis dluo proche
    rows.sort((a, b) => {
      if (a.quantite !== b.quantite) return a.quantite - b.quantite;
      const ax = a.dluoJours ?? Number.POSITIVE_INFINITY;
      const bx = b.dluoJours ?? Number.POSITIVE_INFINITY;
      return ax - bx;
    });

    return rows;
  }, [stock, stockEntries]);

  /* =========================
     Styles
  ========================= */
  const styles = useMemo(
    () => ({
      container: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        minHeight: "100vh",
        padding: isMobile ? "10px" : isTablet ? "15px" : "20px",
        fontFamily: "'Inter', Arial, sans-serif",
      },
      mainCard: {
        background: "white",
        borderRadius: isMobile ? "15px" : "25px",
        boxShadow: isMobile ? "0 15px 30px rgba(0,0,0,0.1)" : "0 30px 60px rgba(0,0,0,0.15)",
        overflow: "hidden",
        margin: "0 auto",
        maxWidth: isMobile ? "100%" : isTablet ? "95%" : "1500px",
      },
      header: {
        background: "linear-gradient(135deg, #4a5568 0%, #2d3748 100%)",
        padding: isMobile ? "20px 15px" : isTablet ? "30px 25px" : "40px",
        textAlign: "center",
        color: "white",
        position: "relative",
      },
      title: {
        fontSize: isMobile ? "1.8em" : isTablet ? "2.3em" : "2.8em",
        fontWeight: 800,
        margin: 0,
        textShadow: "3px 3px 6px rgba(0,0,0,0.3)",
        letterSpacing: isMobile ? "1px" : "2px",
      },
      subtitle: {
        fontSize: isMobile ? "0.9em" : isTablet ? "1em" : "1.2em",
        opacity: 0.9,
        marginTop: "15px",
        letterSpacing: "1px",
      },
      content: {
        padding: isMobile ? "20px 15px" : isTablet ? "35px 25px" : "50px",
      },
      actionsRow: {
        display: "grid",
        gap: isMobile ? 12 : 18,
        gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0,1fr))",
        marginBottom: 24,
      },
      actionBtn: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        border: "none",
        borderRadius: isMobile ? "15px" : "20px",
        padding: isMobile ? "20px 15px" : "25px 20px",
        color: "white",
        fontWeight: 800,
        fontSize: isMobile ? "1.1em" : "1.2em",
        cursor: "pointer",
        transition: "all 0.3s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
      },
      statsGrid: {
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
        gap: isMobile ? 15 : 25,
        marginBottom: isMobile ? 20 : 30,
      },
      statCard: {
        background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)",
        borderRadius: isMobile ? "15px" : "25px",
        padding: isMobile ? "20px 15px" : "30px 25px",
        textAlign: "center",
        border: "3px solid #e2e8f0",
        boxShadow: "0 15px 40px rgba(0,0,0,0.08)",
        transition: "all 0.3s ease",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
      },
      sectionTitle: {
        fontWeight: 800,
        fontSize: isMobile ? "1.2em" : "1.4em",
        margin: "20px 0 10px",
        color: "#2d3748",
      },
      table: {
        width: "100%",
        borderCollapse: "collapse",
        borderRadius: 12,
        overflow: "hidden",
        fontSize: isMobile ? "0.9em" : "1em",
      },
      th: {
        background: "linear-gradient(135deg, #2d3748 0%, #1a202c 100%)",
        color: "white",
        textAlign: "left",
        padding: isMobile ? "10px" : "12px 14px",
        fontWeight: 700,
      },
      td: {
        background: "white",
        borderBottom: "1px solid #e2e8f0",
        padding: isMobile ? "10px" : "12px 14px",
        fontWeight: 600,
        color: "#1a202c",
      },
      badge: (bg, color = "white") => ({
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 800,
        background: bg,
        color,
      }),
      notification: {
        position: "fixed",
        top: isMobile ? "15px" : "30px",
        right: isMobile ? "15px" : "30px",
        padding: isMobile ? "15px 20px" : "20px 30px",
        borderRadius: isMobile ? "10px" : "15px",
        color: "white",
        fontWeight: 700,
        zIndex: 1000,
        boxShadow: "0 15px 40px rgba(0,0,0,0.2)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.25)",
      },
      chipCritical: {
        ...this?.badge,
      },
    }),
    [isMobile, isTablet]
  );

  /* =========================
     Rendu
  ========================= */
  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        <div style={styles.header}>
          <h1 style={styles.title}>Tableau de Bord</h1>
          <div style={styles.subtitle}>{getSocieteDisplayName()}</div>

          {/* ==== Boutons d’action ==== */}
          <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {/* Nouvelle vente */}
            <button
              onClick={() => navigate("/ventes")}
              style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" }}
              title="Aller à la création de vente"
            >
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>🧾</div>
              <div>Nouvelle vente</div>
            </button>

            {/* Gérer stock & lots */}
            <button
              onClick={() => navigate("/stock")}
              style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
            >
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>📦</div>
              <div>Gérer Stock & Lots</div>
            </button>

            {/* Nouvel achat (rôle docteur) */}
            {role === "docteur" && (
              <>
                <button
                  onClick={() => navigate("/achats")}
                  style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)" }}
                >
                  <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>🛒</div>
                  <div>Nouvel Achat</div>
                </button>
                <button
                  onClick={() => navigate("/parametres")}
                  style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #718096 0%, #4a5568 100%)" }}
                >
                  <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>⚙️</div>
                  <div>Paramètres & Sauvegarde</div>
                </button>
              </>
            )}

            {/* Caisse d’aujourd’hui */}
            <button
              onClick={() => navigate("/caisse")}
              style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }}
              title="Ventes en espèces du même jour"
            >
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>💶</div>
              <div>Caisse d’aujourd’hui</div>
              <div style={{ fontSize: "0.9em", opacity: 0.9, fontWeight: 700 }}>
                {soldeCaisse.toFixed(2)} DH (espèces)
              </div>
            </button>
          </div>
        </div>

        <div style={styles.content}>
          {/* Cartes stats */}
          <div style={styles.statsGrid}>
            <div style={{ ...styles.statCard, borderLeft: "5px solid #667eea" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>💰</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#667eea", marginBottom: 6 }}>
                {totalVentes.toFixed(2)} DH
              </div>
              <div>Ventes ({periode})</div>
            </div>

            <div style={{ ...styles.statCard, borderLeft: "5px solid #4299e1" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>🛒</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#4299e1", marginBottom: 6 }}>
                {totalAchats.toFixed(2)} DH
              </div>
              <div>Achats ({periode})</div>
            </div>

            <div style={{ ...styles.statCard, borderLeft: "5px solid #16a34a" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>💵</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#16a34a", marginBottom: 6 }}>
                {totalPaiements.toFixed(2)} DH
              </div>
              <div>Paiements ({periode})</div>
            </div>

            <div style={{ ...styles.statCard, borderLeft: "5px solid #06b6d4" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>📚</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#06b6d4", marginBottom: 6 }}>
                {produitsStock}
              </div>
              <div>Produits (stock + lots)</div>
            </div>
          </div>

          {/* Filtres période */}
          <div style={{ margin: "10px 0 20px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select value={periode} onChange={(e) => setPeriode(e.target.value)}>
              <option value="jour">Jour</option>
              <option value="semaine">Semaine</option>
              <option value="mois">Mois</option>
              <option value="annee">Année</option>
              <option value="toutes">Toutes</option>
            </select>
            <input type="date" value={dateMin} onChange={(e) => setDateMin(e.target.value)} />
            <input type="date" value={dateMax} onChange={(e) => setDateMax(e.target.value)} />
          </div>

          {/* =========================
              Ruptures en alerte
          ========================= */}
          <h3 style={styles.sectionTitle}>Ruptures en alerte</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Produit</th>
                  <th style={styles.th}>Lot</th>
                  <th style={styles.th}>Quantité</th>
                  <th style={styles.th}>Seuil</th>
                  <th style={styles.th}>Jours avant péremption</th>
                </tr>
              </thead>
              <tbody>
                {ruptures.slice(0, 15).map((r, idx) => {
                  const qtyBadge =
                    r.quantite <= 0
                      ? { ...styles.badge("linear-gradient(135deg,#ef4444,#dc2626)") }
                      : { ...styles.badge("linear-gradient(135deg,#f59e0b,#d97706)") };

                return (
                  <tr key={idx}>
                    <td style={styles.td}>{r.type}</td>
                    <td style={styles.td}>{r.nom}</td>
                    <td style={styles.td}>{r.lot}</td>
                    <td style={styles.td}>
                      <span style={qtyBadge}>{r.quantite}</span>
                    </td>
                    <td style={styles.td}>{r.seuil}</td>
                    <td style={styles.td}>
                      {r.dluoJours === null ? "—"
                        : r.dluoJours <= 0 ? "Périmé"
                        : `${r.dluoJours} j`}
                    </td>
                  </tr>
                );})}
                {ruptures.length === 0 && (
                  <tr>
                    <td style={styles.td} colSpan={6}>Aucune rupture ou seuil atteint 🎉</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Alertes (rappel rapide) */}
          {alertes.length > 0 && (
            <>
              <h3 style={styles.sectionTitle}>Alertes</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {alertes.slice(0, 10).map((al, i) => (
                  <li key={i} style={{ margin: "8px 0", fontWeight: 700 }}>
                    <span style={{ marginRight: 8 }}>{al.icon}</span>
                    {al.type}: {al.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div
          style={{
            ...styles.notification,
            background:
              notification.type === "success"
                ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
                : notification.type === "error"
                ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                : "linear-gradient(135deg, #64748b 0%, #475569 100%)",
          }}
        >
          {notification.message}
        </div>
      )}
    </div>
  );
}

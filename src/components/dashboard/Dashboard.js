// src/components/Dashboard.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../firebase/config";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";
import { Link } from "react-router-dom";

/* =========================
   Constantes & Utils
========================= */

const EXPIRY_THRESHOLD_DAYS = 180; // Afficher aussi si dluo <= 180 jours
const DEFAULT_SEUIL = 10;          // 🔔 Seuil de stock par défaut = 10

// Parse Firestore Timestamp, {seconds}, Date, ISO string, or number
function parseDate(dateInput) {
  if (!dateInput) return null;
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === "function") {
      return dateInput.toDate(); // Firestore Timestamp
    }
    if (dateInput?.seconds != null) {
      return new Date(dateInput.seconds * 1000); // Firestore {seconds, nanoseconds}
    }
    if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
    if (typeof dateInput === "string" || typeof dateInput === "number") {
      const d = new Date(dateInput);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}

// Compare two dates by LOCAL day
function isSameLocalDay(a, b = new Date()) {
  const da = parseDate(a);
  const dbb = parseDate(b);
  if (!da || !dbb) return false;
  return (
    da.getFullYear() === dbb.getFullYear() &&
    da.getMonth() === dbb.getMonth() &&
    da.getDate() === dbb.getDate()
  );
}

// Check if date is in period (dateMin/dateMax in YYYY-MM-DD) — LOCAL time
function isDateInPeriod(dateInput, period, minDate = null, maxDate = null) {
  const d = parseDate(dateInput);
  if (!d) return false;

  try {
    // Bounds first
    if (minDate) {
      const min = new Date(`${minDate}T00:00:00`);
      if (d < min) return false;
    }
    if (maxDate) {
      const max = new Date(`${maxDate}T23:59:59`);
      if (d > max) return false;
    }

    // If custom bounds given, inclusion already tested
    if (minDate || maxDate) return true;

    // Relative ranges (local)
    const now = new Date();
    switch (period) {
      case "jour":
        return isSameLocalDay(d, now);
      case "semaine": {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      }
      case "mois":
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      case "annee":
        return d.getFullYear() === now.getFullYear();
      case "toutes":
      default:
        return true;
    }
  } catch {
    return false;
  }
}

// Get date for an achat
function getAchatDate(a) {
  return a?.dateReception ?? a?.dateAchat ?? a?.date ?? a?.timestamp ?? a?.createdAt ?? null;
}

// Days until expiration, or null if no date
function daysToExpiration(datePeremption) {
  const d = parseDate(datePeremption);
  if (!d) return null;
  const today = new Date();
  return Math.ceil((d - today) / 86400000);
}

function formatDH(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(2)} DH`;
}

// Normalize text (remove accents, trim, lowercase)
function normalizeText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Check if payment mode is cash
function isCashMode(mode) {
  const m = normalizeText(mode);
  return ["especes", "espece", "cash", "liquide"].includes(m);
}

/* =========================
   Helpers affichage utilisateur
========================= */
function roleDisplay(role) {
  const r = (role || "").toLowerCase();
  if (r === "docteur") return "Docteur";
  if (r === "vendeuse") return "Vendeuse";
  if (r === "vendeur") return "Vendeur";
  if (!r) return "Utilisateur";
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function userDisplayName(user) {
  if (!user) return "—";
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  if (user.email) return user.email.split("@")[0];
  return "Utilisateur";
}

/* =========================
   Dashboard
========================= */

export default function Dashboard() {
  const { user, societeId, role, loading } = useUserRole();

  // Data states
  const [societeInfo, setSocieteInfo] = useState(null);
  const [societeLoading, setSocieteLoading] = useState(false);

  const [ventes, setVentes] = useState([]);
  const [achats, setAchats] = useState([]);
  const [stock, setStock] = useState([]); // stock traditionnel (si utilisé ailleurs)
  const [stockEntries, setStockEntries] = useState([]); // multi-lots
  const [paiements, setPaiements] = useState([]);
  const [retours, setRetours] = useState([]);

  const [dataLoading, setDataLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // UI & responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Filters
  const [periode, setPeriode] = useState("mois");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");

  /* =========================
      Responsive (throttled)
  ========================= */
  useEffect(() => {
    let rafId = null;
    const onResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = window.innerWidth;
        setIsMobile(w < 768);
        setIsTablet(w >= 768 && w < 1024);
      });
    };
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  /* =========================
      Helpers
  ========================= */
  const showNotification = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Compute achat amount if no pre-calculated total
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

  // Compute vente amount if no pre-calculated total
  const computeMontantVente = useCallback((vente) => {
    try {
      if (vente?.montantTotal && !isNaN(vente.montantTotal)) {
        return Number(vente.montantTotal);
      }
      const articles = Array.isArray(vente?.articles) ? vente.articles : [];
      const totalArticles = articles.reduce((sum, a) => {
        const q = Number(a?.quantite) || 0;
        const pu = Number(a?.prixUnitaire) || 0;
        const r = Number(a?.remise) || 0;
        return sum + (q * pu - r);
      }, 0);
      const remiseGlobale = Number(vente?.remiseGlobale) || 0;
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
        getDocs(collection(db, "societe", societeId, "stock")).catch(() => ({ docs: [] })),             // stock traditionnel (si existant)
        getDocs(collection(db, "societe", societeId, "stock_entries")).catch(() => ({ docs: [] })),     // multi-lots
        getDocs(collection(db, "societe", societeId, "paiements")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "retours")).catch(() => ({ docs: [] })),
      ]);

      const ventesArr = ventesSnap.docs.map((d) => ({ id: d.id, ...cleanImportedData(d.data()) }));
      const achatsArr = achatsSnap.docs.map((d) => ({ id: d.id, ...cleanImportedData(d.data()) }));
      const stockArr = stockSnap.docs.map((d) => ({ id: d.id, ...cleanImportedData(d.data()) }));
      const stockEntriesArr = stockEntriesSnap.docs.map((d) => ({ id: d.id, ...cleanImportedData(d.data()) }));
      const paiementsArr = paiementsSnap.docs.map((d) => ({ id: d.id, ...cleanImportedData(d.data()) }));
      const retoursArr = retoursSnap.docs.map((d) => ({ id: d.id, ...cleanImportedData(d.data()) }));

      // Sort achats by date (newest first)
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

      showNotification("Données chargées avec succès !", "success");
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
      Calculs Statistiques (mémo)
  ========================= */
  const stats = useMemo(() => {
    if (dataLoading) {
      return {
        totalVentes: 0,
        totalAchats: 0,
        totalPaiements: 0,
        produitsStock: 0,
        soldeCaisse: 0,
        documentsImpayes: 0,
        alertes: [],
      };
    }

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
    const produitsStock = stockTraditional + stockLots;

    const totalVentes = fVentes.reduce((sum, v) => {
      if (v.montantTotal && !isNaN(v.montantTotal)) return sum + Number(v.montantTotal);
      const arts = Array.isArray(v.articles) ? v.articles : [];
      const t = arts.reduce((s, a) => {
        const q = Number(a?.quantite) || 0;
        const pu = Number(a?.prixUnitaire) || 0;
        const r = Number(a?.remise) || 0;
        return s + (q * pu - r);
      }, 0);
      const rg = Number(v?.remiseGlobale) || 0;
      return sum + Math.max(0, t - rg);
    }, 0);

    const totalAchats = fAchats.reduce((sum, a) => sum + computeMontantAchat(a), 0);
    const totalPaiements = fPaiements.reduce((sum, p) => sum + (Number(p?.montant) || 0), 0);

    /* ======= Caisse du jour = SEULEMENT ventes en espèces ======= */
    let soldeCaisse = 0;
    const ventesAuj = ventes.filter((v) => isSameLocalDay(v?.date ?? v?.timestamp));

    for (const v of ventesAuj) {
      let cashFromRegs = 0;

      if (Array.isArray(v?.reglements) && v.reglements.length > 0) {
        const regsCashToday = v.reglements.filter((r) => {
          const isCash = isCashMode(
            r?.mode ?? r?.type ?? r?.moyen ?? r?.modePaiement ?? r?.typePaiement ?? r?.paymentMode
          );
          const isToday = isSameLocalDay(r?.date ?? r?.timestamp);
          return isCash && isToday;
        });
        cashFromRegs = regsCashToday.reduce((s, r) => s + (Number(r?.montant) || 0), 0);
      }

      if (cashFromRegs > 0) {
        soldeCaisse += cashFromRegs;
        continue;
      }

      const modeGlobal = v?.modePaiement ?? v?.typePaiement ?? v?.paymentMode ?? "";
      if (isCashMode(modeGlobal)) {
        soldeCaisse += computeMontantVente(v);
      }
    }

    // Impayés (ventes + achats)
    let documentsImpayes = 0;
    [...ventes, ...achats].forEach((d) => {
      if (d?.statutPaiement && (d.statutPaiement === "impayé" || d.statutPaiement === "partiel")) {
        documentsImpayes++;
      }
    });

    // Alertes (stock & lots)
    const alertes = [];
    const todayLocal = new Date();

    // Produits (stock traditionnel) — seuil par défaut = 10
    stock.forEach((item) => {
      const q = Number(item.quantite) || 0;
      const rawSeuil = Number(item.seuil);
      const seuil = rawSeuil > 0 ? rawSeuil : DEFAULT_SEUIL;
      if (q <= seuil && q > 0) {
        alertes.push({ type: "Stock bas", message: `${item.nom || "Produit"} (Qté: ${q} ≤ seuil ${seuil})`, severity: "warning", icon: "📦" });
      }
      if (item.datePeremption) {
        const exp = parseDate(item.datePeremption);
        if (exp) {
          const diffDays = Math.ceil((exp - todayLocal) / 86400000);
          if (diffDays <= 0) alertes.push({ type: "Produit périmé", message: `${item.nom || "Produit"} périmé !`, severity: "critical", icon: "🚫" });
          else if (diffDays <= EXPIRY_THRESHOLD_DAYS) alertes.push({ type: "Péremption proche", message: `${item.nom || "Produit"} (${diffDays} j)`, severity: "danger", icon: "⚠️" });
        }
      }
    });

    // Lots (multi-lots)
    stockEntries.forEach((lot) => {
      const q = Number(lot.quantite) || 0;
      if (q <= 0) return;
      if (lot.datePeremption) {
        const exp = parseDate(lot.datePeremption);
        if (exp) {
          const diffDays = Math.ceil((exp - todayLocal) / 86400000);
          if (diffDays <= 0) alertes.push({ type: "Lot périmé", message: `${lot.nom || "Produit"} - Lot ${lot.numeroLot || "N/A"}`, severity: "critical", icon: "🚫" });
          else if (diffDays <= EXPIRY_THRESHOLD_DAYS) alertes.push({ type: "Péremption proche", message: `${lot.nom || "Produit"} - Lot ${lot.numeroLot || "N/A"} (${diffDays} j)`, severity: "danger", icon: "⚠️" });
        }
      }
    });

    return {
      totalVentes,
      totalAchats,
      totalPaiements,
      produitsStock,
      soldeCaisse,
      documentsImpayes,
      alertes,
    };
  }, [
    dataLoading,
    ventes, achats, stock, stockEntries, paiements,
    periode, dateMin, dateMax,
    computeMontantAchat, computeMontantVente
  ]);

  /* =========================
     Ruptures & péremptions (<= 180 j)
  ========================= */
  const ruptures = useMemo(() => {
    const rows = [];

    // Produits (stock traditionnel)
    (Array.isArray(stock) ? stock : []).forEach((p) => {
      const q = Number(p.quantite) || 0;
      const rawSeuil = Number(p.seuil);
      const seuil = rawSeuil > 0 ? rawSeuil : DEFAULT_SEUIL; // 🔔 défaut = 10
      const dluo = p.datePeremption ? daysToExpiration(p.datePeremption) : null;

      // Inclure si: rupture/seuil atteint OU expiration <= 180 jours
      const includeByQty = (q <= 0) || (q <= seuil);
      const includeByExpiry = dluo !== null && dluo <= EXPIRY_THRESHOLD_DAYS;

      if (includeByQty || includeByExpiry) {
        rows.push({
          type: "Produit",
          nom: p.nom || "Produit",
          lot: "—",
          quantite: q,
          seuil,
          dluoJours: dluo
        });
      }
    });

    // Lots (multi-lots)
    (Array.isArray(stockEntries) ? stockEntries : []).forEach((lot) => {
      const q = Number(lot.quantite) || 0;
      const rawSeuil = Number(lot.seuil);
      const seuil = rawSeuil > 0 ? rawSeuil : DEFAULT_SEUIL; // 🔔 défaut = 10
      const dluo = lot.datePeremption ? daysToExpiration(lot.datePeremption) : null;

      // Inclure si: rupture/seuil atteint OU expiration <= 180 jours
      const includeByQty = (q <= 0) || (q <= seuil);
      const includeByExpiry = dluo !== null && dluo <= EXPIRY_THRESHOLD_DAYS;

      if (includeByQty || includeByExpiry) {
        rows.push({
          type: "Lot",
          nom: lot.nom || "Produit",
          lot: lot.numeroLot || "N/A",
          quantite: q,
          seuil,
          dluoJours: dluo
        });
      }
    });

    rows.sort((a, b) => {
      // Priorité: périmé -> bientôt périmé -> faible quantité
      const aExpired = (a.dluoJours ?? 999999) <= 0;
      const bExpired = (b.dluoJours ?? 999999) <= 0;
      if (aExpired !== bExpired) return aExpired ? -1 : 1;

      const aSoon = (a.dluoJours ?? 999999);
      const bSoon = (b.dluoJours ?? 999999);
      if (aSoon !== bSoon) return aSoon - bSoon;

      if (a.quantite !== b.quantite) return a.quantite - b.quantite;
      return (a.seuil ?? 0) - (b.seuil ?? 0);
    });

    return rows;
  }, [stock, stockEntries]);

  const getSocieteDisplayName = () =>
    societeLoading ? "Chargement…" :
    !societeInfo ? "Société inconnue" :
    (societeInfo.nom || "Société");

  /* =========================
      Styles
  ========================= */
  const styles = useMemo(() => {
    const actionBtnSize = isMobile ? 140 : isTablet ? 170 : 200; // même largeur & hauteur
    return {
      container: { background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", minHeight: "100vh", padding: isMobile ? "10px" : isTablet ? "15px" : "20px", fontFamily: "'Inter', Arial, sans-serif" },
      mainCard: { background: "white", borderRadius: isMobile ? "15px" : "25px", boxShadow: isMobile ? "0 15px 30px rgba(0,0,0,0.1)" : "0 30px 60px rgba(0,0,0,0.15)", overflow: "hidden", margin: "0 auto", maxWidth: isMobile ? "100%" : isTablet ? "95%" : "1500px" },
      header: { background: "linear-gradient(135deg, #4a5568 0%, #2d3748 100%)", padding: isMobile ? "16px 12px" : isTablet ? "26px 22px" : "36px", color: "white" },

      // ✅ Rangée dédiée au chip utilisateur (jamais superposé)
      userChipRow: {
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: isMobile ? 10 : 14,
      },
      userChip: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(255, 255, 255, 0.08)",
        border: "1px solid rgba(255, 255, 255, 0.18)",
        padding: isMobile ? "8px 10px" : "10px 14px",
        borderRadius: 999,
        minWidth: 0,                 // important pour l'ellipsis
        maxWidth: isMobile ? "100%" : 420,
      },
      avatar: {
        width: isMobile ? 30 : 36, height: isMobile ? 30 : 36, borderRadius: "50%",
        background: "linear-gradient(135deg,#a78bfa,#60a5fa)", display: "grid", placeItems: "center",
        fontWeight: 800, color: "white", boxShadow: "0 6px 14px rgba(0,0,0,0.2)", flex: "0 0 auto"
      },
      userTexts: { display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 auto" },
      userName: { fontWeight: 800, fontSize: isMobile ? 12 : 14, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
      userRole: { fontWeight: 700, fontSize: isMobile ? 11 : 12, color: "#e2e8f0", background: "rgba(0,0,0,0.25)", padding: "2px 8px", borderRadius: 999, width: "fit-content" },

      // Bloc titre centré (jamais masqué)
      headerCenter: { textAlign: "center" },
      title: { fontSize: isMobile ? "1.8em" : isTablet ? "2.3em" : "2.8em", fontWeight: 800, margin: 0, textShadow: "3px 3px 6px rgba(0,0,0,0.3)", letterSpacing: isMobile ? "1px" : "2px", lineHeight: 1.2 },
      subtitle: { fontSize: isMobile ? "0.9em" : isTablet ? "1em" : "1.2em", opacity: 0.9, marginTop: "10px", letterSpacing: "1px", wordBreak: "break-word" },

      content: { padding: isMobile ? "20px 15px" : isTablet ? "35px 25px" : "50px" },
      actionBtn: {
        width: actionBtnSize,
        height: actionBtnSize,
        boxSizing: "border-box",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        border: "none",
        borderRadius: isMobile ? "15px" : "20px",
        padding: "14px",
        color: "white",
        fontWeight: 800,
        fontSize: isMobile ? "1.05em" : "1.15em",
        cursor: "pointer",
        transition: "transform .15s ease, box-shadow .15s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        textDecoration: "none",
        textAlign: "center",
        lineHeight: 1.2,
        overflow: "hidden",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
      },
      statsGrid: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))", gap: isMobile ? 15 : 25, marginBottom: isMobile ? 20 : 30 },
      statCard: { background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)", borderRadius: isMobile ? "15px" : "25px", padding: isMobile ? "20px 15px" : "30px 25px", textAlign: "center", border: "3px solid #e2e8f0", boxShadow: "0 15px 40px rgba(0,0,0,0.08)", transition: "all 0.3s ease", cursor: "pointer", position: "relative", overflow: "hidden" },
      sectionTitle: { fontWeight: 800, fontSize: isMobile ? "1.2em" : "1.4em", margin: "20px 0 10px", color: "#2d3748" },
      table: { width: "100%", borderCollapse: "collapse", borderRadius: 12, overflow: "hidden", fontSize: isMobile ? "0.9em" : "1em" },
      th: { background: "linear-gradient(135deg, #2d3748 0%, #1a202c 100%)", color: "white", textAlign: "left", padding: isMobile ? "10px" : "12px 14px", fontWeight: 700 },
      td: { background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "10px" : "12px 14px", fontWeight: 600, color: "#1a202c" },
      badge: (bg, color = "white") => ({ display: "inline-block", padding: "6px 10px", borderRadius: 999, fontWeight: 800, background: bg, color }),
      notification: { position: "fixed", top: isMobile ? "15px" : "30px", right: isMobile ? "15px" : "30px", padding: isMobile ? "15px 20px" : "20px 30px", borderRadius: isMobile ? "10px" : "15px", color: "white", fontWeight: 700, zIndex: 1000, boxShadow: "0 15px 40px rgba(0,0,0,0.2)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.25)" },
    };
  }, [isMobile, isTablet]);

  // Données user affichage
  const displayName = userDisplayName(user);
  const displayRole = roleDisplay(role);
  const userInitials = (displayName || "U")
    .split(" ")
    .map((p) => p.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        <div style={styles.header}>
          {/* ✅ Chip utilisateur dans sa propre rangée (jamais superposé) */}
          <div style={styles.userChipRow}>
            <div style={styles.userChip} title={`${displayRole} — ${displayName}`}>
              <div style={styles.avatar}>{userInitials}</div>
              <div style={styles.userTexts}>
                <div style={styles.userName}>{displayName}</div>
                <div style={styles.userRole}>{displayRole}</div>
              </div>
            </div>
          </div>

          {/* Titre et sous-titre toujours visibles */}
          <div style={styles.headerCenter}>
            <h1 style={styles.title}>Tableau de Bord</h1>
            <div style={styles.subtitle}>{getSocieteDisplayName()}</div>
          </div>

          {/* Boutons carrés (même largeur & hauteur) */}
          <div style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              to="/ventes"
              style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" }}
              title="Aller à la création de vente"
            >
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>🧾</div>
              <div>Nouvelle vente</div>
            </Link>

            <Link
              to="/stock"
              style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
              title="Gérer stock & lots"
            >
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>📦</div>
              <div>Gérer Stock & Lots</div>
            </Link>

            {role === "docteur" && (
              <>
                <Link
                  to="/achats"
                  style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)" }}
                  title="Créer un nouvel achat"
                >
                  <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>🛒</div>
                  <div>Nouvel Achat</div>
                </Link>

                <Link
                  to="/parametres"
                  style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #718096 0%, #4a5568 100%)" }}
                  title="Paramètres & sauvegarde"
                >
                  <div style={{ fontSize: isMobile ? "2.2em" : "2.6em" }}>⚙️</div>
                  <div>Paramètres & Sauvegarde</div>
                </Link>
              </>
            )}
          </div>
        </div>

        <div style={styles.content}>
          {/* Stats cards */}
          <div style={styles.statsGrid}>
            <div style={{ ...styles.statCard, borderLeft: "5px solid #667eea" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>💰</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#667eea", marginBottom: 6 }}>{formatDH(stats.totalVentes)}</div>
              <div>Ventes ({periode})</div>
            </div>
            <div style={{ ...styles.statCard, borderLeft: "5px solid #4299e1" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>🛒</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#4299e1", marginBottom: 6 }}>{formatDH(stats.totalAchats)}</div>
              <div>Achats ({periode})</div>
            </div>
            <div style={{ ...styles.statCard, borderLeft: "5px solid #16a34a" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>💵</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#16a34a", marginBottom: 6 }}>{formatDH(stats.totalPaiements)}</div>
              <div>Paiements ({periode})</div>
            </div>
            <div style={{ ...styles.statCard, borderLeft: "5px solid #06b6d4" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>📚</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#06b6d4", marginBottom: 6 }}>{stats.produitsStock}</div>
              <div>Produits (stock + lots)</div>
            </div>
            <div style={{ ...styles.statCard, borderLeft: "5px solid #f59e0b" }}>
              <div style={{ fontSize: isMobile ? "2.2em" : "2.6em", marginBottom: 12 }}>💶</div>
              <div style={{ fontSize: isMobile ? "1.6em" : "2.1em", fontWeight: 800, color: "#f59e0b", marginBottom: 6 }}>{formatDH(stats.soldeCaisse)}</div>
              <div>Ventes espèces (aujourd'hui)</div>
            </div>
          </div>

          {/* Filtres période */}
          <div style={{ margin: "10px 0 20px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select value={periode} onChange={(e) => setPeriode(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}>
              <option value="jour">Aujourd'hui</option>
              <option value="semaine">Cette Semaine</option>
              <option value="mois">Ce Mois</option>
              <option value="annee">Cette Année</option>
              <option value="toutes">Toutes les dates</option>
            </select>
            <input type="date" value={dateMin} onChange={(e) => setDateMin(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} />
            <input type="date" value={dateMax} onChange={(e) => setDateMax(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} />
          </div>

          <h3 style={styles.sectionTitle}>Ruptures & péremptions (≤ {EXPIRY_THRESHOLD_DAYS} jours)</h3>
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
                {ruptures.map((r, idx) => {
                  const qtyBadge =
                    r.quantite <= 0
                      ? { ...styles.badge("linear-gradient(135deg,#ef4444,#dc2626)") }
                      : (r.quantite <= r.seuil)
                      ? { ...styles.badge("linear-gradient(135deg,#f59e0b,#d97706)") }
                      : (r.dluoJours !== null && r.dluoJours <= EXPIRY_THRESHOLD_DAYS)
                      ? { ...styles.badge("linear-gradient(135deg,#fb7185,#f43f5e)") }
                      : { ...styles.badge("linear-gradient(135deg,#94a3b8,#64748b)") };
                  return (
                    <tr key={idx}>
                      <td style={styles.td}>{r.type}</td>
                      <td style={styles.td}>{r.nom}</td>
                      <td style={styles.td}>{r.lot}</td>
                      <td style={styles.td}><span style={qtyBadge}>{r.quantite}</span></td>
                      <td style={styles.td}>{r.seuil ?? "—"}</td>
                      <td style={styles.td}>
                        {r.dluoJours === null ? "—" : r.dluoJours <= 0 ? "Périmé" : `${r.dluoJours} j`}
                      </td>
                    </tr>
                  );
                })}
                {ruptures.length === 0 && (
                  <tr><td style={styles.td} colSpan={6}>Aucune rupture ni péremption proche 🎉</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {notification && (
        <div
          style={{
            ...styles.notification,
            background:
              notification.type === "success"
                ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
                : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
          }}
        >
          {notification.message}
        </div>
      )}
    </div>
  );
}

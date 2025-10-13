// src/components/dashboard/Dashboard.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";
import { usePermissions } from "../hooks/usePermissions";
import { Link } from "react-router-dom";

/* =========================
   Constantes & Utils
========================= */

const EXPIRY_THRESHOLD_DAYS = 180;
const DEFAULT_SEUIL = 10;

function toDate(v) {
  if (!v) return null;
  try {
    if (v?.toDate && typeof v.toDate === "function") return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    if (v instanceof Date) return isNaN(v) ? null : v;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  } catch {
    return null;
  }
}

function sameLocalDay(a, b = new Date()) {
  const da = toDate(a), dbb = toDate(b);
  if (!da || !dbb) return false;
  return (
    da.getFullYear() === dbb.getFullYear() &&
    da.getMonth() === dbb.getMonth() &&
    da.getDate() === dbb.getDate()
  );
}

function inPeriod(dateInput, period, minDate, maxDate) {
  const d = toDate(dateInput);
  if (!d) return false;

  if (minDate) {
    const min = new Date(`${minDate}T00:00:00`);
    if (d < min) return false;
  }
  if (maxDate) {
    const max = new Date(`${maxDate}T23:59:59`);
    if (d > max) return false;
  }
  if (minDate || maxDate) return true;

  const now = new Date();
  switch (period) {
    case "jour":    return sameLocalDay(d, now);
    case "semaine": return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case "mois":    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    case "annee":   return d.getFullYear() === now.getFullYear();
    default:         return true;
  }
}

function achatDate(a) {
  return a?.dateReception ?? a?.dateAchat ?? a?.date ?? a?.timestamp ?? a?.createdAt ?? null;
}

function daysToExp(per) {
  const d = toDate(per);
  if (!d) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

function formatDH(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(2)} DH`;
}

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();
}

function isCash(mode) {
  const m = norm(mode);
  return ["especes", "espèces", "espece", "espèce", "cash", "liquide"].includes(m);
}

/* =========================
   Détection du STOCK d'un document (S1/S2)
========================= */
const STOCK_KEYS = [
  "stockTag", "stock", "stockName", "stock_label", "depot", "magasin", "source",
  "stockId", "sourceStock", "originStock", "stockSource",
  "ligneStock", "store", "warehouse",
];

function normalizeStock(val) {
  if (val === undefined || val === null) return "unknown";
  if (typeof val === "number") return val === 1 ? "stock1" : val === 2 ? "stock2" : "unknown";
  const raw = String(val).toLowerCase().replace(/[\s_-]/g, "");
  if (["stock1","s1","magasin1","depot1","principal","primary","p","m1","1"].includes(raw)) return "stock1";
  if (["stock2","s2","magasin2","depot2","secondaire","secondary","s","m2","2"].includes(raw)) return "stock2";
  return "unknown";
}

function getDocStockTag(doc) {
  for (const k of STOCK_KEYS) {
    if (doc?.[k] !== undefined) {
      const tag = normalizeStock(doc[k]);
      if (tag !== "unknown") return tag;
    }
  }
  const lines = Array.isArray(doc?.articles) ? doc.articles
              : Array.isArray(doc?.mouvements) ? doc.mouvements
              : [];
  if (lines.length) {
    let c1 = 0, c2 = 0;
    for (const l of lines) {
      for (const k of STOCK_KEYS) {
        if (l?.[k] !== undefined) {
          const tag = normalizeStock(l[k]);
          if (tag === "stock1") c1++;
          if (tag === "stock2") c2++;
        }
      }
    }
    if (c1 > c2 && c1 > 0) return "stock1";
    if (c2 > c1 && c2 > 0) return "stock2";
  }
  return "stock1";
}
const isStock1 = (doc) => getDocStockTag(doc) === "stock1";

function getLineStockTag(line, parentDoc) {
  for (const k of STOCK_KEYS) {
    if (line?.[k] !== undefined) {
      const tag = normalizeStock(line[k]);
      if (tag !== "unknown") return tag;
    }
  }
  const parent = normalizeStock(getDocStockTag(parentDoc));
  return parent !== "unknown" ? parent : "stock1";
}

function normalizeLotNumber(lot) {
  if (!lot) return "-";
  return String(lot)
    .replace(/\[TRANSFERT\s+S\d+\]/gi, "")
    .replace(/-S\d+$/i, "")
    .replace(/-TRANSFERT.*$/i, "")
    .trim() || "-";
}

/* =========================
   Paiements – détection type
========================= */
function isSupplierPayment(p) {
  const t = norm(p?.type || p?.relatedTo || p?.for || p?.category);
  return [
    "achat","achats",
    "fournisseur","fournisseurs",
    "supplier","suppliers",
    "purchase","purchases",
    "reglementfournisseur","reglement_fournisseur"
  ].includes(t);
}

function isSalePayment(p) {
  const t = norm(p?.type || p?.relatedTo || p?.for || p?.category);
  return [
    "vente","ventes",
    "sale","sales",
    "reglementclient","reglement_client"
  ].includes(t);
}

/* =========================
   Détection ventes: espèces & annulée
========================= */
function getVenteId(v) {
  return v?.id || v?.venteId || v?.saleId || v?.reference || v?.numero || null;
}

function getVentePaymentMode(v) {
  return v?.modePaiement ?? v?.paymentMode ?? v?.moyen ?? v?.typePaiement ?? v?.mode ?? v?.paiement ?? v?.reglement ?? null;
}

function isCashSale(v) {
  return isCash(getVentePaymentMode(v));
}

function isCanceledSale(v) {
  const status = norm(v?.statut || v?.status || v?.etat || v?.state || v?.situation);
  const flags = [v?.annule, v?.annulée, v?.annulee, v?.canceled, v?.cancelled, v?.isCanceled, v?.active === false];
  if (["annulee","annule","annulée","cancelled","canceled"].includes(status)) return true;
  if (flags.some(Boolean)) return true;
  return false;
}

function getCancelDate(v) {
  return v?.dateAnnulation
    ?? v?.timestampAnnulation
    ?? v?.cancelledAt
    ?? v?.annuleAt
    ?? v?.dateCanceled
    ?? v?.dateCancel
    ?? v?.updatedAt
    ?? null;
}

function getSaleAmountFromLines(vente) {
  const arts = Array.isArray(vente?.articles) ? vente.articles : [];
  const subtotal = arts.reduce((sum, a) => {
    const q = Number(a?.quantite) || 0;
    const pu = Number(a?.prixUnitaire ?? a?.prix ?? 0) || 0;
    const r = Number(a?.remise) || 0;
    return sum + (q * pu - r);
  }, 0);
  const rTot = Number(vente?.remiseTotal ?? vente?.remiseGlobale ?? 0);
  return Math.max(0, subtotal - rTot);
}

/* =========================
   Affichage helpers
========================= */
function roleDisplay(role) {
  const r = (role || "").toLowerCase();
  if (r === "docteur") return "Docteur";
  if (r === "vendeuse") return "Vendeuse";
  if (r === "vendeur")  return "Vendeur";
  if (!r) return "Utilisateur";
  return r.charAt(0).toUpperCase() + r.slice(1);
}
function userDisplayName(user) {
  if (!user) return "—";
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  if (user.email) return user.email.split("@")[0];
  return "Utilisateur";
}

function getPeriodLabel(period) {
  switch(period) {
    case "jour": return "Aujourd'hui";
    case "semaine": return "Cette semaine";
    case "mois": return "Ce mois";
    case "annee": return "Cette année";
    case "toutes": return "Toutes périodes";
    default: return period;
  }
}

/* =========================
   Composant
========================= */

export default function Dashboard() {
  const { user, societeId, role, loading, hasCustomPermissions, getExtraPermissions } = useUserRole();
  const { can, isVendeuse } = usePermissions();

  const [societeInfo, setSocieteInfo] = useState(null);
  const [societeLoading, setSocieteLoading] = useState(false);

  const [ventes, setVentes] = useState([]);
  const [achats, setAchats] = useState([]);
  const [stock, setStock] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [paiements, setPaiements] = useState([]);

  const [notification, setNotification] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  const [periode, setPeriode] = useState("mois");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");

  const [showAllVentes, setShowAllVentes] = useState(false);
  const [showAllAchats, setShowAllAchats] = useState(false);
  const [showSalesPayments, setShowSalesPayments] = useState(false);

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

  const toast = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 2500);
  }, []);

  useEffect(() => {
    if (loading || !user || !societeId) return;
    const unsubs = [];

    (async () => {
      setSocieteLoading(true);
      const ref = doc(db, "societe", societeId);
      const unsub = onSnapshot(
        ref,
        (snap) => setSocieteInfo(snap.exists() ? snap.data() : { nom: "Société" }),
        async () => {
          const s = await getDoc(ref).catch(() => null);
          setSocieteInfo(s?.exists() ? s.data() : { nom: "Société" });
        }
      );
      unsubs.push(unsub);
      setSocieteLoading(false);
    })();

    const qVentes = query(collection(db, "societe", societeId, "ventes"), orderBy("date", "desc"));
    const qAchats = query(collection(db, "societe", societeId, "achats"), orderBy("timestamp", "desc"));
    const qStock = collection(db, "societe", societeId, "stock");
    const qStockEntries = query(collection(db, "societe", societeId, "stock_entries"), orderBy("nom"));
    const qPaiements = query(collection(db, "societe", societeId, "paiements"), orderBy("date", "desc"));

    unsubs.push(onSnapshot(qVentes,  s => setVentes(s.docs.map(d => ({ id:d.id, ...d.data() }))), () => setVentes([])));
    unsubs.push(onSnapshot(qAchats,  s => {
      const arr = s.docs.map(d => ({ id:d.id, ...d.data() }));
      arr.sort((a,b) => (toDate(achatDate(b))||0) - (toDate(achatDate(a))||0));
      setAchats(arr);
    }, () => setAchats([])));
    unsubs.push(onSnapshot(qStock,   s => setStock(s.docs.map(d => ({ id:d.id, ...d.data() }))), () => setStock([])));
    unsubs.push(onSnapshot(qStockEntries, s => setStockEntries(s.docs.map(d => ({ id:d.id, ...d.data() }))), () => setStockEntries([])));
    unsubs.push(onSnapshot(qPaiements, s => setPaiements(s.docs.map(d => ({ id:d.id, ...d.data() }))), () => setPaiements([])));

    toast("Données (temps réel) prêtes ✅");

    return () => { unsubs.forEach(u => { try { u && u(); } catch {} }); };
  }, [loading, user, societeId, toast]);

  /* =========================
     CALCULS VENTES (ligne S1/S2)
  ========================= */

  const computeMontantVenteAll = useCallback((vente) => {
    const m = Number(vente?.montantTotal) || 0;
    if (m > 0) return m;
    return getSaleAmountFromLines(vente);
  }, []);

  const computeMontantVenteByTag = useCallback((vente, tag = "stock1") => {
    const arts = Array.isArray(vente?.articles) ? vente.articles : [];
    if (arts.length === 0) return 0;

    const subtotalAllBefore = arts.reduce((sum, a) => {
      const q = Number(a?.quantite) || 0;
      const pu = Number(a?.prixUnitaire ?? a?.prix ?? 0) || 0;
      const r = Number(a?.remise) || 0;
      return sum + (q * pu - r);
    }, 0);

    const subtotalTag = arts.reduce((sum, a) => {
      if (getLineStockTag(a, vente) !== tag) return sum;
      const q = Number(a?.quantite) || 0;
      const pu = Number(a?.prixUnitaire ?? a?.prix ?? 0) || 0;
      const r = Number(a?.remise) || 0;
      return sum + (q * pu - r);
    }, 0);

    const rTot = Number(vente?.remiseTotal ?? vente?.remiseGlobale ?? 0);
    const partRemise = subtotalAllBefore > 0 ? (subtotalTag / subtotalAllBefore) * rTot : 0;

    return Math.max(0, subtotalTag - partRemise);
  }, []);

  const computeMontantAchat = useCallback((achat) => {
    const m = Number(achat?.montantTotal) || Number(achat?.montant) || 0;
    if (m > 0) return m;
    const arts = Array.isArray(achat?.articles) ? achat.articles : [];
    const subtotal = arts.reduce((sum, a) => {
      const base = (a && (a.recu || a.commandee)) ? (a.recu || a.commandee) : a || {};
      const q = Number(base?.quantite) || 0;
      const pu = Number(base?.prixUnitaire ?? base?.prixAchat ?? 0) || 0;
      const r = Number(base?.remise) || 0;
      return sum + (q * pu - r);
    }, 0);
    const rg = Number(achat?.remiseGlobale ?? achat?.remiseTotal ?? 0);
    return Math.max(0, subtotal - rg);
  }, []);

  const {
    totalVentes,
    totalAchats,
    totalPaiements,
    produitsStock,
    caisseEncaissements,
    caisseDecaissements,
    caisseSolde,
    ruptures,
  } = useMemo(() => {
    const vPer = ventes.filter(v => inPeriod(v.date || v.timestamp, periode, dateMin, dateMax));
    const aPer = achats.filter(a => inPeriod(achatDate(a), periode, dateMin, dateMax));
    const pPer = paiements.filter(p => inPeriod(p.date || p.timestamp, periode, dateMin, dateMax));

    // VENTES – S1 par défaut (somme des lignes S1), TOUS en double-clic
    const totalVentes = showAllVentes
      ? vPer.reduce((s,v) => s + computeMontantVenteAll(v), 0)
      : vPer.reduce((s,v) => s + computeMontantVenteByTag(v, "stock1"), 0);

    // ACHATS – filtre doc (inchangé)
    const aUsed = showAllAchats ? aPer : aPer.filter(isStock1);
    const totalAchats = aUsed.reduce((s,a) => s + computeMontantAchat(a), 0);

    // PAIEMENTS – Fournisseurs (def) ⇄ Ventes (tous modes)
    const totalPaiements = pPer
      .filter(p => showSalesPayments ? isSalePayment(p) : isSupplierPayment(p))
      .reduce((s,p) => s + (Number(p?.montant) || 0), 0);

    // ====== PRODUITS EN STOCK (S1+S2) – DÉDUPLIQUÉ ======
    const uniqueIds = new Set();

    const totalQtyOfStockItem = (item) => {
      const q = Number(item?.quantite);
      if (Number.isFinite(q) && q > 0) return q;
      const s1 = Number(item?.stock1) || 0;
      const s2 = Number(item?.stock2) || 0;
      return s1 + s2;
    };

    (Array.isArray(stock) ? stock : []).forEach((item) => {
      const nom = item?.nom || item?.name || "";
      const key = `p|${norm(nom)}`;
      const qty = totalQtyOfStockItem(item);
      if (qty > 0 && nom) uniqueIds.add(key);
    });

    (Array.isArray(stockEntries) ? stockEntries : []).forEach((lot) => {
      const nom = lot?.nom || "";
      const lotNum = normalizeLotNumber(lot?.numeroLot);
      const qty = (Number(lot?.stock1) || 0) + (Number(lot?.stock2) || 0);
      const key = `l|${norm(nom)}|${norm(lotNum)}`;
      if (qty > 0 && nom) uniqueIds.add(key);
    });

    const produitsStock = uniqueIds.size;

    /* ========================= CAISSE – CALCULÉE SUR LA PÉRIODE FILTRÉE =========================
       Objectif:
       - IN = tous les paiements "ventes" en espèces de la PÉRIODE (collection paiements)
       - OUT = tous les paiements "achats" en espèces de la PÉRIODE (collection paiements)
       - Solde = IN - OUT
    ============================================================================= */

    // 1) Paiements de la PÉRIODE filtrée
    const pPeriod = paiements.filter(p => inPeriod(p.date || p.timestamp, periode, dateMin, dateMax));

    // 2) IN: VENTES en espèces (encaissements)
    const pSaleCash = pPeriod.filter(p =>
      isSalePayment(p) && isCash(p?.mode ?? p?.paymentMode ?? p?.moyen ?? p?.typePaiement)
    );
    const caisseEncaissements = pSaleCash.reduce((s, p) => s + (Number(p?.montant) || 0), 0);

    // 3) OUT: ACHATS (règlements fournisseurs) en espèces (décaissements)
    const pSupplierCash = pPeriod.filter(p =>
      isSupplierPayment(p) && isCash(p?.mode ?? p?.paymentMode ?? p?.moyen ?? p?.typePaiement)
    );
    const caisseDecaissements = pSupplierCash.reduce((s, p) => s + (Number(p?.montant) || 0), 0);

    // 4) Solde caisse de la période = IN - OUT
    const caisseSolde = caisseEncaissements - caisseDecaissements;

    // Ruptures & péremptions
    let rows = [];
    (Array.isArray(stock) ? stock : []).forEach((item) => {
      const q = Number(item.quantite) || 0;
      const seuil = Number(item.seuil) > 0 ? Number(item.seuil) : DEFAULT_SEUIL;
      const dluo = item.datePeremption ? daysToExp(item.datePeremption) : null;
      const byQty = (q <= 0) || (q <= seuil);
      const byExp = dluo !== null && dluo <= EXPIRY_THRESHOLD_DAYS;
      if (byQty || byExp) {
        rows.push({ type:"Produit", nom:item.nom || "Produit", lot:"—", quantite:q, seuil, dluoJours:dluo });
      }
    });
    (Array.isArray(stockEntries) ? stockEntries : []).forEach((lot) => {
      const q = (Number(lot.stock1 || 0) + Number(lot.stock2 || 0));
      const seuil = Number(lot.seuil) > 0 ? Number(lot.seuil) : DEFAULT_SEUIL;
      const dluo = lot.datePeremption ? daysToExp(lot.datePeremption) : null;
      const byQty = (q <= 0) || (q <= seuil);
      const byExp = dluo !== null && dluo <= EXPIRY_THRESHOLD_DAYS;
      if (byQty || byExp) {
        rows.push({ type:"Lot", nom:lot.nom || "Produit", lot:lot.numeroLot || "N/A", quantite:q, seuil, dluoJours:dluo });
      }
    });
    rows.sort((a,b) => {
      const ax = (a.dluoJours ?? 999999) <= 0, bx = (b.dluoJours ?? 999999) <= 0;
      if (ax !== bx) return ax ? -1 : 1;
      const as = (a.dluoJours ?? 999999), bs = (b.dluoJours ?? 999999);
      if (as !== bs) return as - bs;
      if (a.quantite !== b.quantite) return a.quantite - b.quantite;
      return (a.seuil ?? 0) - (b.seuil ?? 0);
    });

    return { 
      totalVentes, 
      totalAchats, 
      totalPaiements, 
      produitsStock, 
      caisseEncaissements,
      caisseDecaissements,
      caisseSolde, 
      ruptures: rows 
    };
  }, [
    ventes, achats, paiements, stock, stockEntries,
    periode, dateMin, dateMax,
    showAllVentes, showAllAchats, showSalesPayments,
    computeMontantVenteAll, computeMontantVenteByTag,
    computeMontantAchat
  ]);

  /* Styles */
  const styles = useMemo(() => {
    const tile = isMobile ? 140 : isTablet ? 170 : 200;
    return {
      container: { background: "linear-gradient(135deg,#667eea,#764ba2)", minHeight: "100vh", padding: isMobile ? 10 : isTablet ? 15 : 20, fontFamily: "Inter,system-ui,Arial" },
      card: { background: "#fff", borderRadius: isMobile ? 14 : 22, boxShadow: "0 24px 60px rgba(0,0,0,.15)", overflow: "hidden", margin: "0 auto", maxWidth: isMobile ? "100%" : isTablet ? "95%" : 1500 },
      header: { background: "linear-gradient(135deg,#4a5568,#2d3748)", color: "#fff", padding: isMobile ? 14 : 28 },
      chipRow: { display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 10, flexWrap: "wrap" },
      chip: { display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", padding: "8px 12px", borderRadius: 999 },
      avatar: { width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#a78bfa,#60a5fa)", color: "#fff", fontWeight: 800, display: "grid", placeItems: "center" },
      title: { textAlign: "center", fontSize: isMobile ? "1.8em" : "2.6em", fontWeight: 800, margin: "6px 0 0" },
      subtitle: { textAlign: "center", opacity: .9, marginTop: 6 },
      actions: { marginTop: 16, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
      btn: { width: tile, height: tile, border: "none", borderRadius: isMobile ? 14 : 18, background: "linear-gradient(135deg,#667eea,#764ba2)", color:"#fff", fontWeight:800, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, textDecoration:"none", boxShadow:"0 16px 40px rgba(0,0,0,.2)", position: "relative" },
      extendedBadge: { position: "absolute", top: 8, right: 8, background: "linear-gradient(90deg, #ffd700, #ffed4a)", color: "#1a2332", fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" },
      content: { padding: isMobile ? 18 : 34 },
      grid: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(5,1fr)", gap: isMobile ? 14 : 22, marginBottom: isMobile ? 16 : 24 },
      kpiCard: { background: "linear-gradient(135deg,#f8fafc,#edf2f7)", border: "3px solid #e2e8f0", borderRadius: isMobile ? 14 : 20, padding: isMobile ? 16 : 24, position: "relative", cursor: "pointer" },
      badge: { position:"absolute", top:8, right:8, fontSize:12, fontWeight:800, padding:"4px 8px", borderRadius:999, background:"#e2e8f0", color:"#111827" },
      kpiValue: (c)=>({ fontSize: isMobile ? "1.5em" : "2em", fontWeight: 800, color:c, marginBottom: 6 }),
      kpiSubValue: { fontSize: isMobile ? "0.75em" : "0.85em", color: "#6b7280", marginTop: 4, fontWeight: 600 },
      table: { width:"100%", borderCollapse:"collapse", borderRadius:12, overflow:"hidden", fontSize: isMobile ? ".95em" : "1em" },
      th: { background:"linear-gradient(135deg,#2d3748,#1a202c)", color:"#fff", textAlign:"left", padding:"10px 12px" },
      td: { background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"10px 12px", fontWeight:600, color:"#1a202c" },
      pill: (bg)=>({ display:"inline-block", padding:"6px 10px", borderRadius:999, fontWeight:800, background:bg, color:"#fff" }),
      notif: (ok)=>({ position:"fixed", top:isMobile?14:24, right:isMobile?14:24, background: ok?"linear-gradient(135deg,#22c55e,#16a34a)":"linear-gradient(135deg,#ef4444,#dc2626)", color:"#fff", padding:"14px 18px", borderRadius:12, boxShadow:"0 18px 40px rgba(0,0,0,.2)", zIndex:1000 }),
    };
  }, [isMobile, isTablet]);

  const displayName = userDisplayName(user);
  const displayRole = roleDisplay(role);
  const initials = (displayName||"U").split(" ").map(p=>p.trim()[0]).filter(Boolean).slice(0,2).join("").toUpperCase();

  const extraPermissions = isVendeuse() && hasCustomPermissions() ? getExtraPermissions() : [];
  const isAchatsExtended = extraPermissions.includes("voir_achats");
  const isParametresExtended = extraPermissions.includes("parametres");

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.content}>Chargement...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.chipRow}>
            <div style={styles.chip} title={`${displayRole} — ${displayName}`}>
              <div style={styles.avatar}>{initials}</div>
              <div style={{display:"flex",flexDirection:"column"}}>
                <div style={{fontWeight:800, fontSize:13}}>{displayName}</div>
                <div style={{fontWeight:700, fontSize:12, opacity:.9}}>
                  {displayRole}
                  {isVendeuse() && extraPermissions.length > 0 && (
                    <span style={{
                      marginLeft: 6,
                      background: "linear-gradient(90deg, #ffd700, #ffed4a)",
                      color: "#1a2332",
                      fontSize: "9px",
                      fontWeight: "bold",
                      padding: "1px 4px",
                      borderRadius: "4px"
                    }}>
                      +{extraPermissions.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <h1 style={styles.title}>Tableau de Bord</h1>
          <div style={styles.subtitle}>{societeLoading ? "Chargement…" : (societeInfo?.nom || "Société")}</div>

          <div style={styles.actions}>
            {can("voir_ventes") && (
              <Link to="/ventes" style={{...styles.btn, background:"linear-gradient(135deg,#22c55e,#16a34a)"}} title="Nouvelle vente">
                <div style={{fontSize:isMobile?"2.1em":"2.4em"}}>🧾</div><div>Nouvelle vente</div>
              </Link>
            )}

            {can("voir_stock") && (
              <Link to="/stock" style={{...styles.btn, background:"linear-gradient(135deg,#06b6d4,#0891b2)"}} title="Gérer Stock & Lots">
                <div style={{fontSize:isMobile?"2.1em":"2.4em"}}>📦</div><div>Gérer Stock & Lots</div>
              </Link>
            )}

            {can("voir_achats") && (
              <Link to="/achats" style={{...styles.btn, background:"linear-gradient(135deg,#4299e1,#3182ce)"}} title="Nouvel achat">
                {isAchatsExtended && (
                  <div style={styles.extendedBadge}>✨ Étendue</div>
                )}
                <div style={{fontSize:isMobile?"2.1em":"2.4em"}}>🛒</div><div>Nouvel Achat</div>
              </Link>
            )}

            <Link
              to="/abonnement"
              style={{...styles.btn, background:"linear-gradient(135deg,#f59e0b,#d97706)"}}
              title="Souscrire un abonnement annuel"
            >
              <div style={{fontSize:isMobile?"2.1em":"2.4em"}}>🎟️</div>
              <div>Abonnement</div>
            </Link>

            {can("parametres") && (
              <Link to="/parametres" style={{...styles.btn, background:"linear-gradient(135deg,#718096,#4a5568)"}} title="Paramètres & sauvegarde">
                {isParametresExtended && (
                  <div style={styles.extendedBadge}>✨ Étendue</div>
                )}
                <div style={{fontSize:isMobile?"2.1em":"2.4em"}}>⚙️</div>
                <div style={{
                  whiteSpace: "nowrap",
                  textAlign: "center",
                  fontSize: isMobile ? "0.85em" : "1em",
                  lineHeight: "1.2"
                }}>
                  Paramètres/Sauve
                </div>
              </Link>
            )}
          </div>
        </div>

        <div style={styles.content}>
          <div style={styles.grid}>
            <div
              style={styles.kpiCard}
              onDoubleClick={() => setShowAllVentes(v => !v)}
              title="Double-clic: basculer S1 / S1+S2"
            >
              <div style={styles.badge}>{showAllVentes ? "TOUS" : "S1"}</div>
              <div style={{fontSize:isMobile?"2.1em":"2.4em", marginBottom:10}}>💰</div>
              <div style={styles.kpiValue("#667eea")}>{formatDH(totalVentes)}</div>
              <div>Ventes ({periode})</div>
            </div>

            <div
              style={styles.kpiCard}
              onDoubleClick={() => setShowAllAchats(v => !v)}
              title="Double-clic: basculer S1 / S1+S2"
            >
              <div style={styles.badge}>{showAllAchats ? "TOUS" : "S1"}</div>
              <div style={{fontSize:isMobile?"2.1em":"2.4em", marginBottom:10}}>🛒</div>
              <div style={styles.kpiValue("#4299e1")}>{formatDH(totalAchats)}</div>
              <div>Achats ({periode})</div>
            </div>

            <div
              style={styles.kpiCard}
              onDoubleClick={() => setShowSalesPayments(v => !v)}
              title="Double-clic: basculer Fournisseurs / Ventes (tous modes)"
            >
              <div style={styles.badge}>{showSalesPayments ? "VENTES" : "FOURNISSEURS"}</div>
              <div style={{fontSize:isMobile?"2.1em":"2.4em", marginBottom:10}}>💵</div>
              <div style={styles.kpiValue("#16a34a")}>{formatDH(totalPaiements)}</div>
              <div>Paiements ({showSalesPayments ? "Ventes" : "Fournisseurs"})</div>
            </div>

            <div style={{...styles.kpiCard, cursor:"default"}} title="Produits (stock + lots) – dédupliqué">
              <div style={{fontSize:isMobile?"2.1em":"2.4em", marginBottom:10}}>📚</div>
              <div style={styles.kpiValue("#06b6d4")}>{produitsStock}</div>
              <div>Médicaments(Stock)</div>
            </div>

            <div style={{...styles.kpiCard, cursor:"default"}} title={`Caisse espèces (${getPeriodLabel(periode)}) - Encaissements: ${formatDH(caisseEncaissements)} | Décaissements: ${formatDH(caisseDecaissements)}`}>
              <div style={{fontSize:isMobile?"2.1em":"2.4em", marginBottom:10}}>💶</div>
              <div style={styles.kpiValue(caisseSolde >= 0 ? "#10b981" : "#ef4444")}>{formatDH(caisseSolde)}</div>
              <div>Caisse - {getPeriodLabel(periode)}</div>
              <div style={styles.kpiSubValue}>
                IN: {formatDH(caisseEncaissements)} | OUT: {formatDH(caisseDecaissements)}
              </div>
            </div>
          </div>

          <div style={{ margin: "10px 0 20px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select value={periode} onChange={(e) => setPeriode(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}>
              <option value="jour">Aujourd'hui</option>
              <option value="semaine">Cette Semaine</option>
              <option value="mois">Ce Mois</option>
              <option value="annee">Cette Année</option>
              <option value="toutes">Toutes les dates</option>
            </select>
            <input
              type="date"
              value={dateMin}
              onChange={(e) => setDateMin(e.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
              placeholder="Date début"
            />
            <input
              type="date"
              value={dateMax}
              onChange={(e) => setDateMax(e.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
              placeholder="Date fin"
            />
          </div>

          <h3 style={{fontWeight:800, fontSize:isMobile?"1.15em":"1.35em", margin:"16px 0 10px", color:"#2d3748"}}>
            Ruptures &amp; péremptions (&le; {EXPIRY_THRESHOLD_DAYS} jours)
          </h3>
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
                {ruptures.length === 0 && (
                  <tr><td style={styles.td} colSpan={6}>Aucune rupture ni péremption proche 🎉</td></tr>
                )}
                {ruptures.map((r, i) => {
                  const pill =
                    r.quantite <= 0
                      ? styles.pill("linear-gradient(135deg,#ef4444,#dc2626)")
                      : r.quantite <= r.seuil
                      ? styles.pill("linear-gradient(135deg,#f59e0b,#d97706)")
                      : r.dluoJours !== null && r.dluoJours <= EXPIRY_THRESHOLD_DAYS
                      ? styles.pill("linear-gradient(135deg,#fb7185,#f43f5e)")
                      : styles.pill("linear-gradient(135deg,#94a3b8,#64748b)");

                  const seuilDisp = r.quantite <= 0 ? "-" : (r.seuil ?? "-");
                  const dluoDisp  = r.quantite <= 0 ? "-" : (r.dluoJours === null ? "-" : r.dluoJours <= 0 ? "Périmé" : `${r.dluoJours} j`);

                  return (
                    <tr key={i}>
                      <td style={styles.td}>{r.type}</td>
                      <td style={styles.td}>{r.nom}</td>
                      <td style={styles.td}>{r.lot}</td>
                      <td style={styles.td}><span style={pill}>{r.quantite}</span></td>
                      <td style={styles.td}>{seuilDisp}</td>
                      <td style={styles.td}>{dluoDisp}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {notification && (
        <div style={styles.notif(notification.type === "success")}>
          {notification.message}
        </div>
      )}
    </div>
  );
}
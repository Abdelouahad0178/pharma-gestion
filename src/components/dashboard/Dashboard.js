// src/components/dashboard/Dashboard.js - DASHBOARD FUSION S1/S2 avec MODE SOMBRE/CLAIR et ANIMATIONS MAROCAINES
import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
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
    case "toutes":  return true;
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
  return `${v.toFixed(2)} DHS`;
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
   Nettoyage transferts (affichage)
========================= */
function cleanTransferTagName(name) {
  return String(name || "").replace(/\[transfert.*?\]/gi, "").replace(/\s{2,}/g, " ").trim();
}

function normalizedProductKey(name) {
  return norm(cleanTransferTagName(name));
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
   VALIDATION STRICTE DES ACHATS
========================= */
function isValidAchat(achat) {
  if (!achat || !achat.id || typeof achat.id !== "string") return false;

  const statut = norm(achat?.statut || achat?.status || achat?.etat || achat?.statutReception || "");
  const statutsInvalides = [
    "supprime", "supprimé", "deleted", "removed",
    "annule", "annulé", "cancelled", "canceled",
    "inactif", "inactive", "archived", "archive"
  ];
  if (statutsInvalides.includes(statut)) return false;

  const suppressionFlags = [
    achat.deleted, achat.isDeleted, achat.supprime, achat.supprimé,
    achat.removed, achat.isRemoved, achat.archived, achat.isArchived,
    achat.active === false, achat.actif === false
  ];
  if (suppressionFlags.some(Boolean)) return false;

  if (!Array.isArray(achat.articles) || achat.articles.length === 0) return false;

  const hasValidArticle = achat.articles.some(article => {
    const base = article?.recu || article?.commandee || article || {};
    const quantite = Number(base?.quantite || 0);
    const prixUnitaire = Number(base?.prixUnitaire || base?.prixAchat || 0);
    return quantite > 0 && prixUnitaire > 0;
  });

  return hasValidArticle;
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

/* =========================
   Paiements – détection type
========================= */
function isSupplierPayment(p) {
  const t = norm(p?.type || p?.relatedTo || p?.for || p?.category);
  return [
    "achat","achats","fournisseur","fournisseurs",
    "supplier","suppliers","purchase","purchases",
    "reglementfournisseur","reglement_fournisseur",
    "chargepersonnel","chargediverse"
  ].includes(t);
}

function isSalePayment(p) {
  const t = norm(p?.type || p?.relatedTo || p?.for || p?.category);
  return [
    "vente","ventes","sale","sales",
    "reglementclient","reglement_client"
  ].includes(t);
}

function getVentePaymentMode(v) {
  return v?.modePaiement ?? v?.paymentMode ?? v?.moyen ?? v?.typePaiement ?? v?.mode ?? v?.paiement ?? v?.reglement ?? null;
}

function isCashSale(v) {
  return isCash(getVentePaymentMode(v));
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
   ANIMATIONS MAROCAINES CSS
========================= */
const moroccanAnimations = `
@keyframes zellige-shine {
  0%, 100% { box-shadow: 0 0 20px rgba(212, 175, 55, 0.3), 0 0 40px rgba(212, 175, 55, 0.1); }
  50% { box-shadow: 0 0 30px rgba(212, 175, 55, 0.5), 0 0 60px rgba(212, 175, 55, 0.2); }
}

@keyframes moroccan-float {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(2deg); }
}

@keyframes lantern-swing {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}

@keyframes moroccan-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

@keyframes star-twinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

@keyframes magic-carpet {
  0% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-5px) rotate(1deg); }
  50% { transform: translateY(-8px) rotate(0deg); }
  75% { transform: translateY(-5px) rotate(-1deg); }
  100% { transform: translateY(0) rotate(0deg); }
}

@keyframes henna-draw {
  0% { stroke-dashoffset: 1000; }
  100% { stroke-dashoffset: 0; }
}

@keyframes tajine-steam {
  0% { opacity: 0.8; transform: translateY(0) scale(0.8); }
  100% { opacity: 0; transform: translateY(-20px) scale(1.2); }
}

.moroccan-pattern {
  position: relative;
  overflow: hidden;
}

.moroccan-pattern::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: 
    repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(212, 175, 55, 0.03) 10px, rgba(212, 175, 55, 0.03) 20px),
    repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(41, 128, 185, 0.03) 10px, rgba(41, 128, 185, 0.03) 20px);
  animation: moroccan-float 8s ease-in-out infinite;
  pointer-events: none;
}

.zellige-border {
  border: 3px solid;
  border-image: linear-gradient(45deg, #d4af37, #2980b9, #e74c3c, #d4af37) 1;
  animation: zellige-shine 3s ease-in-out infinite;
}

.lantern-effect {
  animation: lantern-swing 4s ease-in-out infinite;
  transform-origin: top center;
}

.magic-carpet-effect {
  animation: magic-carpet 6s ease-in-out infinite;
}

.star-decoration {
  animation: star-twinkle 2s ease-in-out infinite;
}

.moroccan-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.moroccan-hover:hover {
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 20px 40px rgba(212, 175, 55, 0.3) !important;
}
`;

/* =========================
   COMPOSANTS OPTIMISÉS
========================= */

const KPICard = memo(({ 
  badge, emoji, value, label, subValue,
  onDoubleClick, style, title, isMobile, darkMode 
}) => {
  return (
    <div 
      className="moroccan-hover moroccan-pattern" 
      style={style} 
      onDoubleClick={onDoubleClick} 
      title={title}
    >
      {badge && (
        <div className="star-decoration" style={{
          position:"absolute", top:8, right:8, fontSize:12, fontWeight:800,
          padding:"4px 8px", borderRadius:999, 
          background: darkMode ? "linear-gradient(135deg, #d4af37, #f4d03f)" : "#e2e8f0", 
          color: darkMode ? "#1a1a2e" : "#111827"
        }}>{badge}</div>
      )}
      <div className="magic-carpet-effect" style={{fontSize:isMobile?"2.1em":"2.4em", marginBottom:10}}>
        {emoji}
      </div>
      <div style={value.style}>{value.text}</div>
      <div>{label}</div>
      {subValue && (
        <div style={{
          fontSize: isMobile ? "0.75em" : "0.85em",
          color: darkMode ? "#a0aec0" : "#6b7280", 
          marginTop: 4, 
          fontWeight: 600
        }}>{subValue}</div>
      )}
    </div>
  );
});

/* =========================
   Toggle Mode Sombre/Clair
========================= */
const ThemeToggle = memo(({ darkMode, onToggle, isMobile }) => {
  return (
    <button
      onClick={onToggle}
      className="moroccan-hover lantern-effect"
      style={{
        background: darkMode 
          ? "linear-gradient(135deg, #2d3748, #1a202c)" 
          : "linear-gradient(135deg, #ffd700, #f4d03f)",
        border: darkMode ? "2px solid #d4af37" : "2px solid #2980b9",
        borderRadius: "50%",
        width: isMobile ? 50 : 60,
        height: isMobile ? 50 : 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: isMobile ? "1.5em" : "1.8em",
        cursor: "pointer",
        boxShadow: darkMode 
          ? "0 8px 20px rgba(212, 175, 55, 0.3)" 
          : "0 8px 20px rgba(41, 128, 185, 0.3)",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      title={darkMode ? "Mode clair ☀️" : "Mode sombre 🌙"}
    >
      {darkMode ? "🌙" : "☀️"}
    </button>
  );
});

/* =========================
   Composant Principal
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

  // 🌙 MODE SOMBRE/CLAIR
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("pharmacie-dark-mode");
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("pharmacie-dark-mode", darkMode);
  }, [darkMode]);

  const [periode, setPeriode] = useState("jour");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");

  const [showAllVentes, setShowAllVentes] = useState(false);
  const [showAllAchats, setShowAllAchats] = useState(false);
  const [showSalesPayments, setShowSalesPayments] = useState(false);

  // Injection CSS animations
  useEffect(() => {
    const styleId = "moroccan-animations-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = moroccanAnimations;
      document.head.appendChild(style);
    }
  }, []);

  // Debounce resize
  useEffect(() => {
    let rafId = null;
    let timeout = null;
    const onResize = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const w = window.innerWidth;
          setIsMobile(w < 768);
          setIsTablet(w >= 768 && w < 1024);
        });
      }, 150);
    };
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId) cancelAnimationFrame(rafId);
      if (timeout) clearTimeout(timeout);
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

    unsubs.push(onSnapshot(qVentes, s => setVentes(s.docs.map(d => ({ id:d.id, ...d.data() }))), () => setVentes([])));

    unsubs.push(onSnapshot(
      qAchats,
      (snapshot) => {
        const arr = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(isValidAchat);
        arr.sort((a,b) => (toDate(achatDate(b))||0) - (toDate(achatDate(a))||0));
        setAchats(arr);
      },
      () => setAchats([])
    ));

    unsubs.push(onSnapshot(qStock, s => setStock(s.docs.map(d => ({ id:d.id, ...d.data() }))), () => setStock([])));
    unsubs.push(onSnapshot(qStockEntries, s => setStockEntries(s.docs.map(d => ({ id:d.id, ...d.data() }))), () => setStockEntries([])));
    unsubs.push(onSnapshot(qPaiements, s => setPaiements(s.docs.map(d => ({ id:d.id, ...d.data() }))), () => setPaiements([])));

    toast("Données (temps réel) prêtes");

    return () => unsubs.forEach(u => { try { u && u(); } catch {} });
  }, [loading, user, societeId, toast]);

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
    if (!isValidAchat(achat)) return 0;
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

  const achatsValides = useMemo(() => achats.filter(isValidAchat), [achats]);

  const stats = useMemo(() => {
    const vPerAll = ventes.filter(v => inPeriod(v.date || v.timestamp, periode, dateMin, dateMax));
    const vPer = showAllVentes ? vPerAll : vPerAll.filter(v => isStock1(v));
    const aPer = achatsValides.filter(a => inPeriod(achatDate(a), periode, dateMin, dateMax));
    const pPer = paiements.filter(p => inPeriod(p.date || p.timestamp, periode, dateMin, dateMax));

    const totalVentes = vPer.reduce((s,v) => s + computeMontantVenteAll(v), 0);

    const aUsed = showAllAchats ? aPer : aPer.filter(isStock1);
    const totalAchats = aUsed.reduce((s,a) => s + computeMontantAchat(a), 0);

    const totalPaiements = pPer
      .filter(p => showSalesPayments ? isSalePayment(p) : isSupplierPayment(p))
      .reduce((s,p) => s + (Number(p?.montant) || 0), 0);

    const produitsSet = new Set();

    (Array.isArray(stock) ? stock : []).forEach((item) => {
      const rawName = item?.nom || item?.name || "";
      if (!rawName) return;

      const qGlobal = Number(item?.quantite);
      const s1 = Number(item?.stock1) || 0;
      const s2 = Number(item?.stock2) || 0;

      if ((Number.isFinite(qGlobal) && qGlobal > 0) || s1 > 0 || s2 > 0) {
        produitsSet.add(normalizedProductKey(rawName));
      }
    });

    (Array.isArray(stockEntries) ? stockEntries : []).forEach((lot) => {
      const rawName = lot?.nom || lot?.name || "";
      if (!rawName) return;
      const key = normalizedProductKey(rawName);
      if (produitsSet.has(key)) return;

      const s1 = Number(lot?.stock1) || 0;
      const s2 = Number(lot?.stock2) || 0;
      if (s1 > 0 || s2 > 0) {
        produitsSet.add(key);
      }
    });

    const produitsStock = produitsSet.size;

    const pPeriod = paiements.filter(p => inPeriod(p.date || p.timestamp, periode, dateMin, dateMax));
    const pSaleCash = pPeriod.filter(p => isSalePayment(p) && isCash(p?.mode ?? p?.paymentMode ?? p?.moyen ?? p?.typePaiement));
    const caisseEncaissements = pSaleCash.reduce((s, p) => s + (Number(p?.montant) || 0), 0);
    const pSupplierCash = pPeriod.filter(p => isSupplierPayment(p) && isCash(p?.mode ?? p?.paymentMode ?? p?.moyen ?? p?.typePaiement));
    const caisseDecaissements = pSupplierCash.reduce((s, p) => s + (Number(p?.montant) || 0), 0);
    const caisseSolde = caisseEncaissements - caisseDecaissements;

    let rows = [];

    (Array.isArray(stock) ? stock : []).forEach((item) => {
      const q = Number(item.quantite) || 0;
      if (q <= 0) return;

      const seuil = Number(item.seuil) > 0 ? Number(item.seuil) : DEFAULT_SEUIL;
      const dluo = item.datePeremption ? daysToExp(item.datePeremption) : null;
      const byQty = q <= seuil;
      const byExp = dluo !== null && dluo <= EXPIRY_THRESHOLD_DAYS;

      if (byQty || byExp) {
        rows.push({
          type: "Produit",
          nom: cleanTransferTagName(item.nom || "Produit"),
          lot: "—",
          quantite: q,
          seuil,
          dluoJours: dluo
        });
      }
    });

    (Array.isArray(stockEntries) ? stockEntries : []).forEach((lot) => {
      const q = (Number(lot.stock1 || 0) + Number(lot.stock2 || 0));
      if (q <= 0) return;

      const seuil = Number(lot.seuil) > 0 ? Number(lot.seuil) : DEFAULT_SEUIL;
      const dluo = lot.datePeremption ? daysToExp(lot.datePeremption) : null;
      const byQty = q <= seuil;
      const byExp = dluo !== null && dluo <= EXPIRY_THRESHOLD_DAYS;

      if (byQty || byExp) {
        rows.push({
          type: "Lot",
          nom: cleanTransferTagName(lot.nom || "Produit"),
          lot: normalizeLotNumber(lot.numeroLot || "N/A"),
          quantite: q,
          seuil,
          dluoJours: dluo
        });
      }
    });

    rows.sort((a, b) => {
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
    ventes, achatsValides, paiements, stock, stockEntries,
    periode, dateMin, dateMax,
    showAllVentes, showAllAchats, showSalesPayments,
    computeMontantVenteAll,
    computeMontantAchat
  ]);

  /* Styles avec MODE SOMBRE */
  const styles = useMemo(() => {
    const tile = isMobile ? 140 : isTablet ? 170 : 200;
    
    const theme = darkMode ? {
      // MODE SOMBRE - Couleurs marocaines
      bg: "linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)",
      cardBg: "#1f2937",
      headerBg: "linear-gradient(135deg, #2d3748, #1a202c)",
      text: "#e2e8f0",
      textSecondary: "#a0aec0",
      border: "#4a5568",
      tableBg: "#2d3748",
      tableHeaderBg: "linear-gradient(135deg, #4a5568, #2d3748)",
      tableRowBg: "#374151",
      kpiBg: "linear-gradient(135deg, #2d3748, #374151)",
      kpiBorder: "#4a5568",
    } : {
      // MODE CLAIR - Couleurs marocaines traditionnelles
      bg: "linear-gradient(135deg, #2980b9, #6dd5ed, #e74c3c)",
      cardBg: "#ffffff",
      headerBg: "linear-gradient(135deg, #d4af37, #f4d03f)",
      text: "#1a202c",
      textSecondary: "#718096",
      border: "#e2e8f0",
      tableBg: "#ffffff",
      tableHeaderBg: "linear-gradient(135deg, #d4af37, #f4d03f)",
      tableRowBg: "#ffffff",
      kpiBg: "linear-gradient(135deg, #fff5e6, #ffe6cc)",
      kpiBorder: "#d4af37",
    };

    return {
      container: { 
        background: theme.bg, 
        minHeight: "100vh", 
        padding: isMobile ? 10 : isTablet ? 15 : 20, 
        fontFamily: "Inter,system-ui,Arial", 
        contain:"content",
        transition: "background 0.5s ease"
      },
      card: { 
        background: theme.cardBg, 
        borderRadius: isMobile ? 14 : 22, 
        boxShadow: darkMode 
          ? "0 24px 60px rgba(212, 175, 55, 0.3)" 
          : "0 24px 60px rgba(0,0,0,.15)", 
        overflow: "hidden", 
        margin: "0 auto", 
        maxWidth: isMobile ? "100%" : isTablet ? "95%" : 1500, 
        contain:"content",
        transition: "all 0.5s ease"
      },
      header: { 
        background: theme.headerBg, 
        color: darkMode ? "#e2e8f0" : "#1a202c", 
        padding: isMobile ? 14 : 28,
        position: "relative",
        transition: "all 0.5s ease"
      },
      chipRow: { 
        display: "flex", 
        justifyContent: "space-between", 
        gap: 10, 
        marginBottom: 10, 
        flexWrap: "wrap",
        alignItems: "center"
      },
      chip: { 
        display: "flex", 
        alignItems: "center", 
        gap: 10, 
        background: darkMode 
          ? "rgba(212, 175, 55, 0.15)" 
          : "rgba(255,255,255,.9)", 
        border: darkMode 
          ? "2px solid #d4af37" 
          : "2px solid rgba(41, 128, 185, 0.3)", 
        padding: "8px 12px", 
        borderRadius: 999,
        boxShadow: darkMode 
          ? "0 4px 12px rgba(212, 175, 55, 0.2)" 
          : "0 4px 12px rgba(0,0,0,0.1)",
        transition: "all 0.3s ease"
      },
      avatar: { 
        width: 32, 
        height: 32, 
        borderRadius: "50%", 
        background: darkMode 
          ? "linear-gradient(135deg, #d4af37, #f4d03f)" 
          : "linear-gradient(135deg, #2980b9, #6dd5ed)", 
        color: darkMode ? "#1a1a2e" : "#fff", 
        fontWeight: 800, 
        display: "grid", 
        placeItems: "center",
        border: darkMode ? "2px solid #f4d03f" : "none"
      },
      title: { 
        textAlign: "center", 
        fontSize: isMobile ? "1.8em" : "2.6em", 
        fontWeight: 800, 
        margin: "6px 0 0",
        color: theme.text,
        textShadow: darkMode 
          ? "0 2px 10px rgba(212, 175, 55, 0.3)" 
          : "none"
      },
      subtitle: { 
        textAlign: "center", 
        opacity: .9, 
        marginTop: 6,
        color: theme.text
      },
      actions: { 
        marginTop: 16, 
        display: "flex", 
        gap: 12, 
        justifyContent: "center", 
        flexWrap: "wrap" 
      },
      btn: { 
        width: tile, 
        height: tile, 
        border: darkMode ? "2px solid #d4af37" : "none", 
        borderRadius: isMobile ? 14 : 18, 
        background: darkMode 
          ? "linear-gradient(135deg, #2d3748, #374151)" 
          : "linear-gradient(135deg, #2980b9, #6dd5ed)", 
        color: darkMode ? "#f4d03f" : "#fff", 
        fontWeight:800, 
        display:"flex", 
        flexDirection:"column", 
        alignItems:"center", 
        justifyContent:"center", 
        gap:10, 
        textDecoration:"none", 
        boxShadow: darkMode 
          ? "0 16px 40px rgba(212, 175, 55, 0.3)" 
          : "0 16px 40px rgba(0,0,0,.2)", 
        position: "relative", 
        transition:"all .3s cubic-bezier(0.4, 0, 0.2, 1)"
      },
      extendedBadge: { 
        position: "absolute", 
        top: 8, 
        right: 8, 
        background: "linear-gradient(90deg, #d4af37, #f4d03f)", 
        color: "#1a2332", 
        fontSize: "10px", 
        fontWeight: "bold", 
        padding: "2px 6px", 
        borderRadius: "8px", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)" 
      },
      content: { 
        padding: isMobile ? 18 : 34, 
        contain:"content",
        background: theme.cardBg,
        transition: "background 0.5s ease"
      },
      grid: { 
        display: "grid", 
        gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(5,1fr)", 
        gap: isMobile ? 14 : 22, 
        marginBottom: isMobile ? 16 : 24 
      },
      kpiCard: { 
        background: theme.kpiBg, 
        border: `3px solid ${theme.kpiBorder}`, 
        borderRadius: isMobile ? 14 : 20, 
        padding: isMobile ? 16 : 24, 
        position: "relative", 
        cursor: "pointer", 
        contain:"content", 
        transition:"all .3s cubic-bezier(0.4, 0, 0.2, 1)",
        color: theme.text
      },
      table: { 
        width:"100%", 
        borderCollapse:"collapse", 
        borderRadius:12, 
        overflow:"hidden", 
        fontSize: isMobile ? ".95em" : "1em", 
        tableLayout:"fixed",
        background: theme.tableBg,
        transition: "all 0.5s ease"
      },
      th: { 
        background: theme.tableHeaderBg, 
        color: darkMode ? "#1a1a2e" : "#fff", 
        textAlign:"left", 
        padding:"10px 12px",
        fontWeight: 800
      },
      td: { 
        background: theme.tableRowBg, 
        borderBottom: `1px solid ${theme.border}`, 
        padding:"10px 12px", 
        fontWeight:600, 
        color: theme.text, 
        wordWrap:"break-word",
        transition: "background 0.3s ease"
      },
      pill: (bg)=>({ 
        display:"inline-block", 
        padding:"6px 10px", 
        borderRadius:999, 
        fontWeight:800, 
        background:bg, 
        color:"#fff" 
      }),
      notif: (ok)=>({ 
        position:"fixed", 
        top:isMobile?14:24, 
        right:isMobile?14:24, 
        background: ok
          ? "linear-gradient(135deg,#22c55e,#16a34a)"
          : "linear-gradient(135deg,#ef4444,#dc2626)", 
        color:"#fff", 
        padding:"14px 18px", 
        borderRadius:12, 
        boxShadow:"0 18px 40px rgba(0,0,0,.2)", 
        zIndex:1000 
      }),
      filterContainer: {
        margin: "10px 0 20px",
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        padding: isMobile ? 12 : 16,
        background: darkMode 
          ? "rgba(212, 175, 55, 0.1)" 
          : "rgba(255, 255, 255, 0.7)",
        borderRadius: 12,
        border: darkMode 
          ? "2px solid rgba(212, 175, 55, 0.3)" 
          : "2px solid rgba(41, 128, 185, 0.2)",
        boxShadow: darkMode 
          ? "0 4px 12px rgba(212, 175, 55, 0.2)" 
          : "0 4px 12px rgba(0,0,0,0.05)"
      },
      filterInput: {
        padding: "8px 12px",
        borderRadius: "8px",
        border: darkMode 
          ? "2px solid #4a5568" 
          : "2px solid #cbd5e0",
        background: darkMode ? "#2d3748" : "#ffffff",
        color: theme.text,
        fontWeight: 600,
        transition: "all 0.3s ease",
        outline: "none"
      },
      sectionTitle: {
        fontWeight: 800,
        fontSize: isMobile ? "1.15em" : "1.35em",
        margin: "16px 0 10px",
        color: theme.text,
        textShadow: darkMode 
          ? "0 2px 8px rgba(212, 175, 55, 0.2)" 
          : "none",
        display: "flex",
        alignItems: "center",
        gap: 10
      }
    };
  }, [isMobile, isTablet, darkMode]);

  const displayName = userDisplayName(user);
  const displayRole = roleDisplay(role);
  const displayInitials = (displayName||"U").split(" ").map(p=>p.trim()[0]).filter(Boolean).slice(0,2).join("").toUpperCase();

  const extraPermissions = isVendeuse() && hasCustomPermissions() ? getExtraPermissions() : [];
  const isAchatsExtended = extraPermissions.includes("voir_achats");
  const isParametresExtended = extraPermissions.includes("parametres");

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.content}>
            <div className="magic-carpet-effect" style={{ textAlign: "center", fontSize: "2em" }}>
              ⏳ Chargement...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} className="moroccan-pattern">
      <div style={styles.card} className="zellige-border">
        <div style={styles.header}>
          <div style={styles.chipRow}>
            <div style={styles.chip} title={`${displayRole} – ${displayName}`} className="moroccan-hover">
              <div style={styles.avatar} className="star-decoration">{displayInitials}</div>
              <div style={{display:"flex",flexDirection:"column"}}>
                <div style={{fontWeight:800, fontSize:13}}>{displayName}</div>
                <div style={{fontWeight:700, fontSize:12, opacity:.9}}>
                  {displayRole}
                  {isVendeuse() && extraPermissions.length > 0 && (
                    <span style={{
                      marginLeft: 6,
                      background: "linear-gradient(90deg, #d4af37, #f4d03f)",
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

            <ThemeToggle 
              darkMode={darkMode} 
              onToggle={() => setDarkMode(d => !d)} 
              isMobile={isMobile}
            />
          </div>

          <h1 style={styles.title} className="magic-carpet-effect">
            👨‍⚕️ Tableau de Bord
          </h1>
          <div style={styles.subtitle}>
            {societeLoading ? "Chargement…" : (societeInfo?.nom || "Société")}
          </div>

          <div style={styles.actions}>
            {can("voir_ventes") && (
              <Link 
                to="/ventes" 
                style={{
                  ...styles.btn, 
                  background: darkMode 
                    ? "linear-gradient(135deg, #16a34a, #15803d)" 
                    : "linear-gradient(135deg, #22c55e, #16a34a)"
                }} 
                title="Nouvelle vente"
                className="moroccan-hover"
              >
                <div style={{fontSize:isMobile?"2.1em":"2.4em"}} className="lantern-effect">🧾</div>
                <div>Nouvelle vente</div>
              </Link>
            )}

            {can("voir_stock") && (
              <Link 
                to="/stock" 
                style={{
                  ...styles.btn, 
                  background: darkMode 
                    ? "linear-gradient(135deg, #0891b2, #0e7490)" 
                    : "linear-gradient(135deg, #06b6d4, #0891b2)"
                }} 
                title="Gérer Stock & Lots"
                className="moroccan-hover"
              >
                <div style={{fontSize:isMobile?"2.1em":"2.4em"}} className="lantern-effect">📦</div>
                <div>Gérer Stock & Lots</div>
              </Link>
            )}

            {can("voir_achats") && (
              <Link 
                to="/achats" 
                style={{
                  ...styles.btn, 
                  background: darkMode 
                    ? "linear-gradient(135deg, #3182ce, #2c5282)" 
                    : "linear-gradient(135deg, #4299e1, #3182ce)"
                }} 
                title="Nouvel achat"
                className="moroccan-hover"
              >
                {isAchatsExtended && (<div style={styles.extendedBadge}>✨ Étendue</div>)}
                <div style={{fontSize:isMobile?"2.1em":"2.4em"}} className="lantern-effect">🛒</div>
                <div>Nouvel Achat</div>
              </Link>
            )}

            <Link
              to="/abonnement"
              style={{
                ...styles.btn, 
                background: darkMode 
                  ? "linear-gradient(135deg, #d97706, #b45309)" 
                  : "linear-gradient(135deg, #f59e0b, #d97706)"
              }}
              title="Souscrire un abonnement annuel"
              className="moroccan-hover"
            >
              <div style={{fontSize:isMobile?"2.1em":"2.4em"}} className="lantern-effect">🎟️</div>
              <div>Abonnement</div>
            </Link>

            {can("parametres") && (
              <Link 
                to="/parametres" 
                style={{
                  ...styles.btn, 
                  background: darkMode 
                    ? "linear-gradient(135deg, #4a5568, #2d3748)" 
                    : "linear-gradient(135deg, #718096, #4a5568)"
                }} 
                title="Paramètres & sauvegarde"
                className="moroccan-hover"
              >
                {isParametresExtended && (<div style={styles.extendedBadge}>✨ Étendue</div>)}
                <div style={{fontSize:isMobile?"2.1em":"2.4em"}} className="lantern-effect">⚙️</div>
                <div style={{whiteSpace: "nowrap",textAlign: "center",fontSize: isMobile ? "0.85em" : "1em",lineHeight: "1.2"}}>
                  Paramètres/Sauve
                </div>
              </Link>
            )}
          </div>
        </div>

        <div style={styles.content}>
          <div style={styles.grid}>
            <KPICard
              badge={showAllVentes ? "2" : "1"}
              emoji="💰"
              value={{ 
                text: formatDH(stats.totalVentes),
                style: { 
                  fontSize: isMobile ? "1.5em" : "2em", 
                  fontWeight: 800, 
                  color: darkMode ? "#f4d03f" : "#2980b9", 
                  marginBottom: 6 
                }
              }}
              label={`Ventes (${periode})`}
              onDoubleClick={() => setShowAllVentes(v => !v)}
              style={styles.kpiCard}
              title="Double-clic: basculer 1 (S1) / 2 (Tous)"
              isMobile={isMobile}
              darkMode={darkMode}
            />

            <KPICard
              badge={showAllAchats ? "2" : "1"}
              emoji="🛒"
              value={{ 
                text: formatDH(stats.totalAchats),
                style: { 
                  fontSize: isMobile ? "1.5em" : "2em", 
                  fontWeight: 800, 
                  color: darkMode ? "#6dd5ed" : "#4299e1", 
                  marginBottom: 6 
                }
              }}
              label={`Achats (${periode})`}
              onDoubleClick={() => setShowAllAchats(v => !v)}
              style={styles.kpiCard}
              title="Double-clic: basculer 1 (S1) / 2 (Tous)"
              isMobile={isMobile}
              darkMode={darkMode}
            />

            <KPICard
              badge={showSalesPayments ? "VENTES" : "FOURNISSEURS"}
              emoji="💵"
              value={{ 
                text: formatDH(stats.totalPaiements),
                style: { 
                  fontSize: isMobile ? "1.5em" : "2em", 
                  fontWeight: 800, 
                  color: darkMode ? "#10b981" : "#16a34a", 
                  marginBottom: 6 
                }
              }}
              label={`Paiements (${showSalesPayments ? "Ventes" : "Fournisseurs"})`}
              onDoubleClick={() => setShowSalesPayments(v => !v)}
              style={styles.kpiCard}
              title="Double-clic: basculer Fournisseurs / Ventes"
              isMobile={isMobile}
              darkMode={darkMode}
            />

            <KPICard
              emoji="📚"
              value={{ 
                text: stats.produitsStock,
                style: { 
                  fontSize: isMobile ? "1.5em" : "2em", 
                  fontWeight: 800, 
                  color: darkMode ? "#06b6d4" : "#0891b2", 
                  marginBottom: 6 
                }
              }}
              label="Médicaments(Stock)"
              style={{...styles.kpiCard, cursor:"default"}}
              title="Comptage fusionné S1+S2 par NOM (transferts nettoyés)"
              isMobile={isMobile}
              darkMode={darkMode}
            />

            <KPICard
              emoji="💶"
              value={{ 
                text: formatDH(stats.caisseSolde),
                style: { 
                  fontSize: isMobile ? "1.5em" : "2em", 
                  fontWeight: 800, 
                  color: stats.caisseSolde >= 0 ? "#10b981" : "#ef4444", 
                  marginBottom: 6 
                }
              }}
              label={`Caisse - ${getPeriodLabel(periode)}`}
              subValue={`IN: ${formatDH(stats.caisseEncaissements)} | OUT: ${formatDH(stats.caisseDecaissements)}`}
              style={{...styles.kpiCard, cursor:"default"}}
              title={`Caisse espèces (${getPeriodLabel(periode)})`}
              isMobile={isMobile}
              darkMode={darkMode}
            />
          </div>

          <div style={styles.filterContainer} className="moroccan-pattern">
            <select 
              value={periode} 
              onChange={(e) => setPeriode(e.target.value)} 
              style={styles.filterInput}
            >
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
              style={styles.filterInput}
              placeholder="Date début"
            />
            <input
              type="date"
              value={dateMax}
              onChange={(e) => setDateMax(e.target.value)}
              style={styles.filterInput}
              placeholder="Date fin"
            />
          </div>

          <h3 style={styles.sectionTitle}>
            <span className="star-decoration">⚠️</span>
            Ruptures &amp; péremptions (&le; {EXPIRY_THRESHOLD_DAYS} jours)
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <colgroup>
                <col style={{ width:"10%" }} />
                <col style={{ width:"34%" }} />
                <col style={{ width:"16%" }} />
                <col style={{ width:"12%" }} />
                <col style={{ width:"12%" }} />
                <col style={{ width:"16%" }} />
              </colgroup>
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
                {stats.ruptures.length === 0 && (
                  <tr>
                    <td style={styles.td} colSpan={6}>
                      <span className="magic-carpet-effect">Aucune rupture ni péremption proche 🎉</span>
                    </td>
                  </tr>
                )}
                {stats.ruptures.map((r, i) => {
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
                    <tr key={i} className="moroccan-hover">
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
        <div style={styles.notif(notification.type === "success")} className="magic-carpet-effect">
          {notification.message}
        </div>
      )}
    </div>
  );
}

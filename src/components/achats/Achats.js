// src/components/achats/Achats.js
import React, { useEffect, useState, useCallback, useRef } from "react";
import useKeyboardWedge from "../hooks/useKeyboardWedge";
import { db } from "../../firebase/config";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

/**
 * Achats — Gestion bons d'achat (commande/réception) + impression
 * 🆕 DATES AUTOMATIQUES : Date=aujourd'hui, Paiement=impayé, Péremption=+2ans
 * ✨ Style moderne avec gradients et animations
 */

export default function Achats() {
  /* ===================== HELPERS DATES ===================== */
  const getTodayDate = useCallback(() => {
    return new Date().toISOString().split("T")[0];
  }, []);

  const getDatePlusTwoYears = useCallback((dateStr = null) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    date.setFullYear(date.getFullYear() + 2);
    return date.toISOString().split("T")[0];
  }, []);

  /* ===================== BIP SONORE (Web Audio API) ===================== */
  const __audioCtxRef = useRef(null);
  const __getAudioCtx = () => {
    if (!__audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        try {
          __audioCtxRef.current = new Ctx();
        } catch {}
      }
    }
    return __audioCtxRef.current;
  };
  const __playBeep = useCallback((freq = 880, dur = 120, type = "sine", volume = 0.15) => {
    try {
      const ctx = __getAudioCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume?.();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        try {
          osc.stop();
          osc.disconnect();
          gain.disconnect();
        } catch {}
      }, dur);
    } catch {}
  }, []);
  const beepSuccess = useCallback(() => {
    __playBeep(1175, 90, "sine", 0.15);
    setTimeout(() => __playBeep(1568, 110, "sine", 0.15), 100);
  }, [__playBeep]);
  const beepError = useCallback(() => __playBeep(220, 220, "square", 0.2), [__playBeep]);
  useEffect(() => {
    const unlock = () => {
      try { __getAudioCtx()?.resume?.(); } catch {}
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }, []);

  /* ===================== Styles ===================== */
  const injectStyles = useCallback(() => {
    if (document.getElementById("achats-styles")) return;
    const style = document.createElement("style");
    style.id = "achats-styles";
    style.textContent = `
      :root{
        --primary:#4F46E5; --primary-2:#06B6D4; --accent:#F472B6;
        --bg:#F8FAFC; --text:#0F172A; --muted:#64748B; --ring:#A5B4FC;
        --danger:#EF4444; --success:#22C55E; --warning:#F59E0B;
        --card:#FFFFFF; --border:#E5E7EB; --thead:#111827;
        --cta-grad: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
        --header-grad: linear-gradient(135deg, #0B1220 0%, var(--primary) 100%);
        --table-head-grad: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
        --danger-grad: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
        --success-grad: linear-gradient(135deg, #22C55E 0%, #10B981 100%);
        --outline-hover-grad: linear-gradient(135deg, #EEF2FF 0%, #E0F2FE 100%);
        --total-grad: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
        --print-grad: linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%);
        --edit-grad: linear-gradient(135deg, #F59E0B 0%, #EAB308 100%);
      }
      .achats-page{ max-width:1400px; margin:0 auto; padding:20px; }
      .card{ background:var(--card); border:1px solid var(--border); border-radius:16px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,.08); margin-bottom:20px; }
      .section-title{ margin:0 0 16px 0; font-weight:800; font-size:1.5em; color:var(--text); display:flex; align-items:center; gap:12px; }
      .section-title::before{ content:""; width:12px; height:12px; border-radius:50%; background:var(--cta-grad); display:inline-block; }
      .page-header{ background:var(--header-grad); color:#fff; padding:24px 32px; border-radius:16px; margin-bottom:24px; box-shadow:0 10px 40px rgba(79,70,229,.3); }
      .page-header h1{ margin:0; font-weight:900; font-size:2em; letter-spacing:.5px; }
      .page-sub{ opacity:.95; margin-top:8px; font-size:1.1em; }
      .form-grid{ display:grid; gap:16px; grid-template-columns:repeat(5,1fr); }
      @media (max-width:1280px){ .form-grid{ grid-template-columns:repeat(3,1fr);} }
      @media (max-width:640px){ .form-grid{ grid-template-columns:1fr;} }
      .article-grid{ display:grid; gap:12px; grid-template-columns:1.2fr .8fr .8fr .8fr .8fr 1fr 1fr 1fr 1fr 1fr 1fr; }
      @media (max-width:1280px){ .article-grid{ grid-template-columns:1fr 1fr 1fr; } }
      @media (max-width:640px){ .article-grid{ grid-template-columns:1fr; } }
      .field,.select{ font:inherit; border-radius:12px; border:2px solid var(--border); padding:12px 16px; outline:none; background:#fff; color:var(--text); transition: all .2s ease; font-weight:600; }
      .field::placeholder{ color:#94A3B8; }
      .field:focus,.select:focus{ border-color:var(--primary); box-shadow:0 0 0 4px rgba(79,70,229,.2); background:#fff; transform:translateY(-1px); }
      .btn{ padding:12px 31px 12px 12px; font-weight:700; font-size:0.65em; border:none; border-radius:12px; cursor:pointer; transition: all .2s ease; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,.15); }
      .btn:hover{ transform:translateY(-2px); box-shadow:0 8px 20px rgba(0,0,0,.2); }
      .btn:active{ transform:translateY(0); }
      .btn-primary{ color:#fff; background:var(--cta-grad); }
      .btn-outline{ background:#fff; color:var(--text); border:2px solid var(--border); box-shadow:0 2px 8px rgba(0,0,0,.08); }
      .btn-outline:hover{ border-color:var(--primary); }
      .btn-danger{ color:#fff; background:var(--danger-grad); }
      .btn-success{ color:#064E3B; background:linear-gradient(135deg,#ECFDF5 0%, #DCFCE7 100%); border:2px solid #86EFAC; font-weight:800; }
      .notice{ border-radius:12px; padding:16px 20px; font-weight:600; margin-bottom:16px; border:2px solid var(--border); animation:slideIn .3s ease; }
      @keyframes slideIn{ from{ opacity:0; transform:translateY(-10px);} to{ opacity:1; transform:translateY(0);} }
      .notice.success{ background:#ECFDF5; color:#065F46; border-color:#BBF7D0; }
      .notice.error{ background:#FEF2F2; color:#7F1D1D; border-color:#FECACA; }
      .notice.info{ background:#EEF2FF; color:#4338CA; border-color:#C7D2FE; }
      .notice.warning{ background:#FEF3C7; color:#92400E; border-color:#FDE68A; }
      .table-scroll{ width:100%; overflow-x:auto; border:1px solid var(--border); border-radius:16px; background:#fff; box-shadow:0 4px 16px rgba(0,0,0,.08); }
      .table{ width:100%; min-width:1100px; border-collapse:collapse; }
      .table thead th{ position:sticky; top:0; background:var(--table-head-grad); color:#F1F5F9; font-weight:800; text-transform:uppercase; font-size:13px; letter-spacing:1px; border-bottom:2px solid var(--border); padding:16px 12px; text-align:center; z-index:1; }
      .table tbody td{ padding:16px 12px; border-bottom:1px solid #F1F5F9; text-align:center; color:var(--text); font-weight:600; background:#fff; font-size:0.95em; }
      .table tbody tr{ transition:all .2s ease; }
      .table tbody tr:hover{ background:linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%); transform:scale(1.01); box-shadow:0 4px 12px rgba(0,0,0,.08); }
      .table .left{ text-align:left; }
      .table-total{ background:var(--total-grad); font-weight:800; font-size:1.1em; color:#92400E; border:2px solid #FDE68A; position:sticky; bottom:0; }
      .bon-transfere{ background:linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%); border-left:4px solid var(--primary-2); }
      .bon-original{ background:linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 100%); border-left:4px solid var(--accent); }
      .chip{ padding:6px 12px; border-radius:20px; font-weight:800; background:linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 100%); color:#BE185D; display:inline-block; border:2px solid #FBCFE8; font-size:0.85em; }
      .qty{ background:linear-gradient(135deg, rgba(79,70,229,.2) 0%, rgba(79,70,229,.15) 100%); color:var(--primary); border-radius:12px; padding:8px 16px; font-weight:800; border:2px solid rgba(79,70,229,.3); }
      .controls-bar{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
      .filters-panel,.form-panel{ overflow:hidden; transition:max-height .4s ease, opacity .3s ease; border:2px solid var(--border); border-radius:16px; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,.06); }
      .filters-panel-inner,.form-panel-inner{ padding:20px; }
      .filters-hidden,.form-hidden{ max-height:0; opacity:0; }
      .filters-shown{ max-height:900px; opacity:1; }
      .form-shown{ max-height:2500px; opacity:1; }
      .filters-badge{ background:linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%); color:#3730A3; border:2px solid #C7D2FE; border-radius:20px; padding:6px 16px; font-weight:800; font-size:0.85em; }
      .inline-delete{ margin-left:8px; font-weight:800; font-size:0.85em; color:#DC2626; cursor:pointer; background:transparent; border:none; padding:4px 8px; border-radius:6px; transition:all .2s ease; }
      .inline-delete:hover{ background:#FEE2E2; text-decoration:underline; }
      .action-btn{ padding:10px 20px; border-radius:12px; font-weight:700; font-size:0.7em; border:none; cursor:pointer; transition:all .2s ease; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,.15); }
      .action-btn:hover{ transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,.2); }
      .action-btn.print{ background:var(--print-grad); color:#fff; }
      .action-btn.reception{ background:linear-gradient(135deg, #10B981 0%, #059669 100%); color:#fff; }
      .action-btn.edit{ background:var(--edit-grad); color:#fff; }
      .action-btn.delete{ background:var(--danger-grad); color:#fff; }
      .action-btn.small{ padding:8px 16px; font-size:0.6em; }
      hr{ border:none; height:2px; background:linear-gradient(90deg, transparent, var(--border), transparent); margin:20px 0; }
    `;
    document.head.appendChild(style);
  }, []);
  useEffect(() => { injectStyles(); }, [injectStyles]);

  /* ===================== Contexte ===================== */
  const { loading, societeId, user } = useUserRole();

  /* ===================== Attente chargement ===================== */
  const [waiting, setWaiting] = useState(true);
  useEffect(() => { setWaiting(loading || !societeId || !user); }, [loading, societeId, user]);

  /* ===================== Etat formulaire bon ===================== */
  const [fournisseur, setFournisseur] = useState("");
  const [dateAchat, setDateAchat] = useState(getTodayDate()); // 🆕 Date d'aujourd'hui
  const [statutPaiement, setStatutPaiement] = useState("impayé"); // 🆕 impayé par défaut
  const [remiseGlobale, setRemiseGlobale] = useState(0);
  const [stockChoice, setStockChoice] = useState("stock1");

  /* ===================== Ligne article ===================== */
  const [numeroArticle, setNumeroArticle] = useState("");
  const [produit, setProduit] = useState("");
  const [produitNouveau, setProduitNouveau] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [remiseArticle, setRemiseArticle] = useState(0);
  const [datePeremption, setDatePeremption] = useState(getDatePlusTwoYears()); // 🆕 +2 ans
  const [numeroLot, setNumeroLot] = useState("");
  const [fournisseurArticle, setFournisseurArticle] = useState("");

  /* ===================== 🆕 Fournisseurs (liste existante) ===================== */
  const [fournisseurs, setFournisseurs] = useState([]);

  const normalizeFournisseurName = (obj, fallbackId = "") => {
    const n =
      obj?.nom ??
      obj?.name ??
      obj?.raisonSociale ??
      obj?.raison_sociale ??
      obj?.displayName ??
      obj?.titre ??
      "";
    const s = String(n || "").trim();
    return s || (fallbackId ? `Fournisseur-${fallbackId.slice(0, 6)}` : "");
  };

  const fetchFournisseurs = useCallback(async () => {
    if (!societeId) return setFournisseurs([]);
    try {
      const list = [];

      // 1) collection "fournisseurs"
      const snap1 = await getDocs(collection(db, "societe", societeId, "fournisseurs"));
      snap1.forEach((d) => {
        const data = d.data();
        const name = normalizeFournisseurName(data, d.id);
        if (name) list.push({ id: d.id, name, data });
      });

      // 2) fallback "suppliers" si la 1ère est vide
      if (list.length === 0) {
        const snap2 = await getDocs(collection(db, "societe", societeId, "suppliers"));
        snap2.forEach((d) => {
          const data = d.data();
          const name = normalizeFournisseurName(data, d.id);
          if (name) list.push({ id: d.id, name, data });
        });
      }

      // Uniques par nom + tri alpha
      const uniq = Array.from(new Map(list.map((x) => [x.name.toLowerCase(), x])).values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      setFournisseurs(uniq);
    } catch (e) {
      console.error("fetchFournisseurs:", e);
      setFournisseurs([]);
    }
  }, [societeId]);

  const onFournisseurChange = useCallback(
    (value) => {
      setFournisseur(value);
      // petit confort : si aucun fournisseurArticle renseigné, on aligne sur le bon
      if (!fournisseurArticle) setFournisseurArticle(value);
    },
    [fournisseurArticle]
  );

  /* ===================== 🆕 Recalcul auto date péremption ===================== */
  useEffect(() => {
    if (dateAchat) {
      setDatePeremption(getDatePlusTwoYears(dateAchat));
    }
  }, [dateAchat, getDatePlusTwoYears]);

  /* ===================== Collections locales ===================== */
  const [articles, setArticles] = useState([]);
  const [achats, setAchats] = useState([]);
  const [medicaments, setMedicaments] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [showScanner, setShowScanner] = useState(false);

  /* ===================== Paramètres impression ===================== */
  const [parametres, setParametres] = useState({
    entete: "",
    pied: "",
    cachetTexte: "Cachet Pharmacie",
    cachetImage: null,
    afficherCachet: true,
    typeCachet: "texte",
    tailleCachet: 120,
  });

  /* ===================== Edition / Réception ===================== */
  const [editId, setEditId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [receptionId, setReceptionId] = useState(null);
  const [receptionArticles, setReceptionArticles] = useState([]);

  /* ===================== UI / Notifications ===================== */
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const showNotification = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  /* ===================== Filtres liste bons ===================== */
  const [filterFournisseur, setFilterFournisseur] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterStatutPaiement, setFilterStatutPaiement] = useState("");
  const [filterStatutReception, setFilterStatutReception] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  useEffect(() => { if (isEditing) setShowCreateForm(true); }, [isEditing]);
  useEffect(() => { if (articles.length > 0) setShowCreateForm(true); }, [articles.length]);

  const activeFiltersCount =
    (filterFournisseur ? 1 : 0) +
    (filterDateStart ? 1 : 0) +
    (filterDateEnd ? 1 : 0) +
    (filterStatutPaiement ? 1 : 0) +
    (filterStatutReception ? 1 : 0);

  const resetFilters = useCallback(() => {
    setFilterFournisseur("");
    setFilterDateStart("");
    setFilterDateEnd("");
    setFilterStatutPaiement("");
    setFilterStatutReception("");
  }, []);

  /* ===================== Dates sûres ===================== */
  const toDateSafe = useCallback((v) => {
    try {
      if (!v) return null;
      if (typeof v?.toDate === "function") return v.toDate();
      if (v?.seconds != null) return new Date(v.seconds * 1000);
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
  }, []);

  /* ===================== Normalisation "stock" ===================== */
  const STOCK_KEYS = ["stock", "stockSource", "sourceStock", "originStock", "stockId", "stockName", "stock_label", "depot", "magasin", "source"];
  const normalizeStockValue = (val) => {
    if (val === undefined || val === null) return "unknown";
    if (typeof val === "number") return val === 1 ? "stock1" : val === 2 ? "stock2" : "unknown";
    const raw = String(val).toLowerCase().replace(/[\s_\-]/g, "");
    if (["stock1","s1","magasin1","depot1","principal","primary","p","m1","1"].includes(raw)) return "stock1";
    if (["stock2","s2","magasin2","depot2","secondaire","secondary","s","m2","2"].includes(raw)) return "stock2";
    return "unknown";
  };
  const pickDocStock = (docData) => {
    for (const k of STOCK_KEYS) {
      if (docData?.[k] !== undefined) {
        const tag = normalizeStockValue(docData[k]);
        if (tag !== "unknown") return tag;
      }
    }
    return "stock1";
  };

  /* ===================== Paramètres impression ===================== */
  const fetchParametres = useCallback(async () => {
    if (!societeId) return;
    try {
      const prefDoc = doc(db, "societe", societeId, "parametres", "documents");
      const s1 = await getDoc(prefDoc);
      if (s1.exists()) {
        const d = s1.data();
        setParametres({
          entete: d.entete || "PHARMACIE",
          pied: d.pied || "Merci pour votre confiance",
          cachetTexte: d.cachetTexte || "Cachet Pharmacie",
          cachetImage: d.cachetImage || d.cachet || null,
          afficherCachet: d.afficherCachet !== false,
          typeCachet: d.typeCachet || (d.cachet ? "image" : "texte"),
          tailleCachet: d.tailleCachet || 120,
        });
        return;
      }
      const prefGen = doc(db, "societe", societeId, "parametres", "general");
      const s2 = await getDoc(prefGen);
      if (s2.exists()) {
        const d = s2.data();
        setParametres({
          entete: d.entete || "PHARMACIE",
          pied: d.pied || "Merci pour votre confiance",
          cachetTexte: d.cachetTexte || "Cachet Pharmacie",
          cachetImage: d.cachetImage || d.cachet || null,
          afficherCachet: d.afficherCachet !== false,
          typeCachet: d.typeCachet || (d.cachet ? "image" : "texte"),
          tailleCachet: d.tailleCachet || 120,
        });
        return;
      }
    } catch (e) {
      console.warn("Paramètres impression fallback:", e);
    }
    setParametres((p) => ({ ...p, entete: p.entete || "Pharmacie", pied: p.pied || "Merci pour votre confiance" }));
  }, [societeId]);

  /* ===================== Achats ===================== */
  const fetchAchats = useCallback(async () => {
    if (!societeId) return setAchats([]);
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "achats"));
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (
          Array.isArray(data.articles) &&
          data.articles.some(
            (a) =>
              (a?.commandee?.quantite || 0) > 0 &&
              ((a?.commandee?.prixUnitaire || 0) > 0 ||
                (a?.commandee?.prixAchat || 0) > 0)
          )
        ) {
          list.push({ id: d.id, ...data });
        }
      });
      list.sort((a, b) => {
        const da = toDateSafe(a.timestamp) || toDateSafe(a.date) || new Date("2000-01-01");
        const dbb = toDateSafe(b.timestamp) || toDateSafe(b.date) || new Date("2000-01-01");
        return dbb - da;
      });
      setAchats(list);
    } catch (e) {
      console.error("fetchAchats:", e);
      setAchats([]);
    }
  }, [societeId, toDateSafe]);

  /* ===================== stock_entries (multi-lots) ===================== */
  const fetchStockEntries = useCallback(async () => {
    if (!societeId) return setStockEntries([]);
    try {
      const snap = await getDocs(query(collection(db, "societe", societeId, "stock_entries"), orderBy("nom")));
      const arr = [];
      snap.forEach((d) => {
        const e = d.data();
        const q = Number(e.quantite || 0);
        const s1 = Math.max(0, Number.isFinite(e.stock1) ? Number(e.stock1) : q);
        const s2 = Math.max(0, Number.isFinite(e.stock2) ? Number(e.stock2) : Math.max(0, q - s1));
        arr.push({ id: d.id, ...e, quantite: q, stock1: s1, stock2: s2 });
      });
      arr.sort((a, b) => {
        if ((a.nom || "") !== (b.nom || "")) return (a.nom || "").localeCompare(b.nom || "");
        const da = toDateSafe(a.datePeremption) || new Date(0);
        const dbb = toDateSafe(b.datePeremption) || new Date(0);
        return da - dbb;
      });
      setStockEntries(arr);
    } catch (e) {
      console.error("fetchStockEntries:", e);
      setStockEntries([]);
    }
  }, [societeId, toDateSafe]);

  /* ===================== Noms médicaments depuis stock_entries ===================== */
  const fetchMedicaments = useCallback(async () => {
    if (!societeId) return setMedicaments([]);
    try {
      const s2 = await getDocs(collection(db, "societe", societeId, "stock_entries"));
      const fromEntries = [];
      s2.forEach((d) => fromEntries.push(d.data()));
      const names = Array.from(new Set(fromEntries.map((m) => m.nom).filter(Boolean)));
      const result = names
        .map((nom) => ({ nom, exemples: fromEntries.filter((m) => m.nom === nom).slice(0, 3) }))
        .sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));
      setMedicaments(result);
    } catch (e) {
      console.error("fetchMedicaments:", e);
      setMedicaments([]);
    }
  }, [societeId]);

  useEffect(() => {
    if (!societeId) return;
    fetchParametres();
    fetchAchats();
    fetchStockEntries();
    fetchMedicaments();
    fetchFournisseurs(); // 🆕 charger la liste des fournisseurs
  }, [societeId, fetchParametres, fetchAchats, fetchStockEntries, fetchMedicaments, fetchFournisseurs]);

  /* ===================== Saisie produit -> auto-suggest ===================== */
  const handleProduitChange = useCallback((value) => {
    setProduit(value);
    if (value && value !== "_new_") {
      const existing = stockEntries.filter((e) => e.nom === value);
      if (existing.length > 0) {
        const last = existing[existing.length - 1];
        setPrixUnitaire(last.prixAchat || last.prixUnitaire || "");
        setPrixVente(last.prixVente || "");
        setFournisseurArticle(last.fournisseur || "");
      } else {
        const med = medicaments.find((m) => m.nom === value);
        if (med?.exemples?.length) {
          const ex = med.exemples[0];
          setPrixUnitaire(ex.prixAchat || ex.prixUnitaire || "");
          setPrixVente(ex.prixVente || "");
          setFournisseurArticle(ex.fournisseur || "");
        } else {
          setPrixUnitaire(""); setPrixVente(""); setFournisseurArticle("");
        }
      }
    }
  }, [stockEntries, medicaments]);

  /* ===================== Ajouter un article (commande) ===================== */
  const handleAddArticle = useCallback((e) => {
    e.preventDefault?.();
    const nomFinal = produit === "_new_" ? produitNouveau.trim() : produit;
    if (!nomFinal || !quantite || !prixUnitaire || !datePeremption) {
      showNotification("Veuillez remplir tous les champs obligatoires", "error"); return;
    }
    const qte = Number(quantite);
    const pAchat = Number(prixUnitaire);
    const pVente = Number(prixVente) || 0;
    if (qte <= 0 || pAchat <= 0) {
      showNotification("La quantité et le prix doivent être positifs", "error"); return;
    }
    const lot = (numeroLot || "").trim() || `LOT${Date.now().toString().slice(-6)}`;
    const four = (fournisseurArticle || "").trim() || fournisseur;

    const item = {
      produit: nomFinal,
      commandee: {
        quantite: qte,
        prixUnitaire: pAchat,
        prixAchat: pAchat,
        prixVente: pVente,
        remise: Number(remiseArticle) || 0,
        datePeremption,
        numeroLot: lot,
        numeroArticle: (numeroArticle || "").trim(),
        codeBarre: (numeroArticle || "").trim(),
        fournisseurArticle: four,
        stock: stockChoice, stockSource: stockChoice,
      },
      recu: null,
    };
    setArticles((prev) => [...prev, item]);
    setProduit(""); setProduitNouveau(""); setQuantite(1); setPrixUnitaire(""); setPrixVente("");
    setRemiseArticle(0); 
    setNumeroLot(""); setNumeroArticle(""); setFournisseurArticle("");
    showNotification("Article ajouté (commande) !", "success");
  }, [
    produit, produitNouveau, quantite, prixUnitaire, prixVente, remiseArticle,
    datePeremption, numeroLot, numeroArticle, fournisseurArticle, fournisseur, stockChoice, showNotification
  ]);

  const handleRemoveArticle = useCallback((idx) => {
    setArticles((prev) => prev.filter((_, i) => i !== idx));
    showNotification("Article supprimé du bon.", "info");
  }, [showNotification]);

  /* ===================== Mise à jour STOCK lors de la RÉCEPTION ===================== */
  const updateStockOnAdd = useCallback(async (payload) => {
    if (!societeId || !user || !payload?.articles?.length) return;
    const isStock1 = (payload.stock || "stock1") === "stock1";
    const ops = payload.articles.map(async (a) => {
      const nom = a.produit || "";
      const qte = Number(a.quantite || 0);
      const pA = Number(a.prixUnitaire || a.prixAchat || 0);
      const pV = Number(a.prixVente || 0);
      const dateP = a.datePeremption ? Timestamp.fromDate(new Date(a.datePeremption)) : null;
      try {
        await addDoc(collection(db, "societe", societeId, "stock_entries"), {
          nom,
          quantite: qte,
          stock1: isStock1 ? qte : 0,
          stock2: isStock1 ? 0 : qte,
          quantiteInitiale: qte,
          prixAchat: pA,
          prixVente: pV,
          datePeremption: dateP,
          numeroArticle: a.numeroArticle || a.codeBarre || null,
          codeBarre: a.codeBarre || a.numeroArticle || null,
          numeroLot: a.numeroLot || `LOT${Date.now().toString().slice(-6)}`,
          fournisseur: a.fournisseurArticle || payload.fournisseur || "",
          fournisseurPrincipal: payload.fournisseur || "",
          dateAchat: payload.date || Timestamp.now(),
          statut: "actif",
          createdAt: Timestamp.now(),
          createdBy: user.email || user.uid,
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          updatedAt: Timestamp.now(),
          updatedBy: user.email || user.uid,
          societeId,
          achatId: payload.id || null,
          stock: payload.stock || "stock1",
          stockSource: payload.stock || "stock1",
          magasin: payload.stock || "stock1",
          depot: payload.stock || "stock1",
        });
      } catch (e) {
        console.error("updateStockOnAdd ->", nom, e);
      }
    });
    await Promise.allSettled(ops);
  }, [societeId, user]);

  const updateStockOnDelete = useCallback(async (payload) => {
    try {
      if (!societeId || !payload?.id) return;
      const q = query(
        collection(db, "societe", societeId, "stock_entries"),
        where("achatId", "==", payload.id)
      );
      const snap = await getDocs(q);
      const ops = [];
      snap.forEach((d) => ops.push(deleteDoc(d.ref)));
      await Promise.all(ops);
      setStockEntries?.((prev) => prev.filter((e) => e.achatId !== payload.id));
    } catch (e) {
      console.error("updateStockOnDelete error:", e);
    }
  }, [societeId]);

  /* ===================== Scanner (clavier / caméra) ===================== */
  const onBarcodeDetected = useCallback((barcode) => {
    try {
      const fields = ["codeBarre", "barcode", "ean", "ean13", "upc", "gtin", "numeroArticle"];
      const isMatch = (obj) => fields.some((f) => String(obj?.[f] || "") === String(barcode));
      const fromEntry = stockEntries.find((p) => isMatch(p)) || null;
      const fromMed = !fromEntry ? medicaments.find((m) => isMatch(m)) : null;
      const found = fromEntry || fromMed;

      if (!found) {
        beepError?.();
        showNotification?.(`Aucun produit trouvé pour le code : ${barcode}`, "error");
        return;
      }
      const nom = found.nom || found.name || "";
      setProduit?.(nom || "");
      setQuantite?.(1);

      const pA = Number(found.prixAchat ?? found.prixUnitaire ?? found.prixVente ?? 0);
      if (pA > 0) setPrixUnitaire?.(pA);

      if (found.numeroLot) setNumeroLot?.(found.numeroLot);
      if (found.fournisseur) setFournisseurArticle?.(found.fournisseur);
      setNumeroArticle?.(found.numeroArticle || found.codeBarre || found.barcode || found.ean || found.ean13 || "");

      const d = toDateSafe?.(found.datePeremption) || (found.datePeremption ? new Date(found.datePeremption) : null);
      let iso = null;
      if (d && d instanceof Date && !isNaN(d)) {
        iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        setDatePeremption?.(iso);
      }
      const canAutoAdd = Boolean(nom && pA > 0 && (typeof datePeremption === "string" ? datePeremption : iso));
      if (canAutoAdd) {
        beepSuccess?.();
        setTimeout(() => { try { handleAddArticle({ preventDefault: () => {} }); } catch {} }, 60);
      } else {
        beepError?.();
        showNotification?.("Produit détecté, complétez les champs manquants (ex: date d'expiration).", "warning");
      }
    } catch (e) {
      console.error(e);
      beepError?.();
      showNotification?.("Erreur détecteur code-barres", "error");
    }
  }, [stockEntries, medicaments, handleAddArticle, showNotification, datePeremption, beepError, beepSuccess, toDateSafe]);

  useKeyboardWedge((code) => onBarcodeDetected(code), { minChars: 6, endKey: "Enter", timeoutMs: 100 });

  /* ===================== Helpers ===================== */
  function resetForm() {
    setFournisseur(""); 
    setDateAchat(getTodayDate()); 
    setStatutPaiement("impayé"); 
    setRemiseGlobale(0);
    setStockChoice("stock1"); 
    setArticles([]); 
    setEditId(null); 
    setIsEditing(false);
    setProduit(""); 
    setProduitNouveau(""); 
    setQuantite(1); 
    setPrixUnitaire(""); 
    setPrixVente("");
    setRemiseArticle(0); 
    setDatePeremption(getDatePlusTwoYears()); 
    setNumeroLot(""); 
    setNumeroArticle(""); 
    setFournisseurArticle("");
  }

  /* ===== Helper total bon ===== */
  const getTotalBon = useCallback((bon) => {
    const arr = bon?.articles || [];
    return arr.reduce((sum, a) => {
      const item = a?.recu || a?.commandee || {};
      const total = (item.prixUnitaire || item.prixAchat || 0) * (item.quantite || 0) - (item.remise || 0);
      return sum + total;
    }, 0) - (Number(bon?.remiseGlobale) || 0);
  }, []);

  /* ===================== Filtrage des achats ===================== */
  const filteredAchats = React.useMemo(() => {
    return achats.filter((b) => {
      if (filterFournisseur && !String(b.fournisseur || "").toLowerCase().includes(filterFournisseur.toLowerCase())) return false;
      const bonDate = toDateSafe(b.date || b.timestamp);
      if (filterDateStart && bonDate < new Date(filterDateStart)) return false;
      if (filterDateEnd && bonDate > new Date(filterDateEnd + "T23:59:59")) return false;
      if (filterStatutPaiement && b.statutPaiement !== filterStatutPaiement) return false;
      if (filterStatutReception && (b.statutReception || "en_attente") !== filterStatutReception) return false;
      return true;
    });
  }, [achats, filterFournisseur, filterDateStart, filterDateEnd, filterStatutPaiement, filterStatutReception, toDateSafe]);

  /* ===================== Enregistrer bon (création/édition) ===================== */
  const handleAddBon = useCallback(async (e) => {
    e.preventDefault?.();
    if (!societeId) return showNotification("Aucune société sélectionnée !", "error");
    if (!user) return showNotification("Utilisateur non connecté !", "error");
    if (!fournisseur.trim() || !dateAchat || articles.length === 0) {
      showNotification("Veuillez remplir tous les champs obligatoires", "error"); return;
    }
    const valid = articles.filter(
      (a) =>
        a?.produit &&
        (a?.commandee?.quantite || 0) > 0 &&
        ((a?.commandee?.prixUnitaire || 0) > 0 || (a?.commandee?.prixAchat || 0) > 0)
    );
    if (!valid.length) { showNotification("Aucun article valide trouvé", "error"); return; }
    setIsLoading(true);

    const articlesToSave = valid.map((a) => ({
      produit: a.produit,
      commandee: { ...a.commandee, stock: stockChoice, stockSource: stockChoice },
      recu: isEditing
        ? (achats.find((b) => b.id === editId)?.articles.find((x) => x.produit === a.produit)?.recu
            ? { ...achats.find((b) => b.id === editId)?.articles.find((x) => x.produit === a.produit)?.recu, stock: stockChoice, stockSource: stockChoice }
            : null)
        : null,
    }));

    const montantTotal =
      articlesToSave.reduce(
        (sum, a) =>
          sum + ((a.commandee.prixUnitaire || a.commandee.prixAchat || 0) * (a.commandee.quantite || 0) - (a.commandee.remise || 0)),
        0
      ) - (Number(remiseGlobale) || 0);

    try {
      if (isEditing && editId) {
        const achatRef = doc(db, "societe", societeId, "achats", editId);
        const achatSnap = await getDoc(achatRef);
        if (!achatSnap.exists()) { showNotification("Le bon d'achat n'existe pas ou a été supprimé.", "error"); return; }
        await updateDoc(achatRef, {
          fournisseur: fournisseur.trim(),
          date: Timestamp.fromDate(new Date(dateAchat)),
          timestamp: Timestamp.now(),
          statutPaiement,
          remiseGlobale: Number(remiseGlobale) || 0,
          articles: articlesToSave,
          stock: stockChoice, stockSource: stockChoice, magasin: stockChoice, depot: stockChoice,
          modifiePar: user.uid, modifieParEmail: user.email, modifieLe: Timestamp.now(),
        });
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "achat", userId: user.uid, userEmail: user.email, timestamp: Timestamp.now(),
          details: { fournisseur: fournisseur.trim(), montant: montantTotal, articles: articlesToSave.length, action: "modification", achatId: editId, statutPaiement, stock: stockChoice },
        });
        setIsEditing(false); setEditId(null);
        showNotification("Bon d'achat modifié avec succès !", "success");
      } else {
        const ref = await addDoc(collection(db, "societe", societeId, "achats"), {
          fournisseur: fournisseur.trim(),
          date: Timestamp.fromDate(new Date(dateAchat)),
          timestamp: Timestamp.now(),
          statutPaiement,
          remiseGlobale: Number(remiseGlobale) || 0,
          articles: articlesToSave,
          statutReception: "en_attente",
          creePar: user.uid, creeParEmail: user.email, creeLe: Timestamp.now(),
          societeId,
          stock: stockChoice, stockSource: stockChoice, magasin: stockChoice, depot: stockChoice,
        });
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "achat", userId: user.uid, userEmail: user.email, timestamp: Timestamp.now(),
          details: { 
            fournisseur: fournisseur.trim(), 
            montant: montantTotal, 
            articles: articlesToSave.length, 
            action: "création", 
            achatId: ref.id, 
            statutPaiement, 
            stock: stockChoice
          },
        });
        if (statutPaiement === "payé") {
          await addDoc(collection(db, "societe", societeId, "paiements"), {
            docId: ref.id, montant: montantTotal, mode: "Espèces", type: "achats", date: Timestamp.now(),
            createdBy: user.email, stock: stockChoice, stockSource: stockChoice, magasin: stockChoice, depot: stockChoice,
          });
          await addDoc(collection(db, "societe", societeId, "activities"), {
            type: "paiement", userId: user.uid, userEmail: user.email, timestamp: Timestamp.now(),
            details: { mode: "Espèces", type: "achats", montant: montantTotal, fournisseur: fournisseur.trim(), paiementAuto: true, stock: stockChoice },
          });
        }
        showNotification("Bon d'achat créé !", "success");
      }
      resetForm();
      await Promise.all([fetchAchats(), fetchMedicaments(), fetchStockEntries()]);
    } catch (e) {
      console.error("handleAddBon:", e);
      showNotification("Erreur lors de l'enregistrement: " + e.message, "error");
    } finally {
      setIsLoading(false);
    }
  }, [
    societeId, user, fournisseur, dateAchat, articles, isEditing, editId, statutPaiement, remiseGlobale,
    stockChoice, fetchAchats, fetchMedicaments, fetchStockEntries, achats, showNotification
  ]);

  /* ===================== Réception ===================== */
  const handleStartReception = useCallback((bon) => {
    if (bon?.statutReception !== "en_attente") { showNotification("Bon déjà traité.", "error"); return; }
    setStockChoice(pickDocStock(bon));
    setReceptionId(bon.id);
    setReceptionArticles(
      (bon.articles || []).map((a) => ({
        ...a,
        recu: { ...(a.commandee || {}), stock: pickDocStock(bon), stockSource: pickDocStock(bon) },
      }))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [showNotification]);

  const handleUpdateReceptionArticle = useCallback((index, field, value) => {
    setReceptionArticles((prev) => {
      const arr = [...prev];
      const recu = { ...(arr[index]?.recu || {}) };
      if (["quantite", "prixUnitaire", "prixVente", "remise"].includes(field)) {
        recu[field] = Number(value);
        if (field === "prixUnitaire") recu.prixAchat = Number(value);
      } else {
        recu[field] = value;
        if (field === "numeroArticle") recu.codeBarre = value;
        if (field === "codeBarre") recu.numeroArticle = value;
      }
      const qCmd = Number(arr[index]?.commandee?.quantite || 0);
      recu.quantite = Math.max(0, Math.min(qCmd, Number(recu.quantite || 0)));
      recu.stock = recu.stock || stockChoice;
      recu.stockSource = recu.stockSource || stockChoice;
      arr[index] = { ...arr[index], recu };
      return arr;
    });
  }, [stockChoice]);

  const handleSubmitReception = useCallback(async () => {
    if (!societeId || !user || !receptionId) return;
    setIsLoading(true);
    try {
      const achatRef = doc(db, "societe", societeId, "achats", receptionId);
      const achatSnap = await getDoc(achatRef);
      if (!achatSnap.exists()) { showNotification("Le bon d'achat n'existe pas ou a été supprimé.", "error"); return; }

      let isFull = true; let hasSome = false;
      receptionArticles.forEach((a) => {
        if ((a?.recu?.quantite || 0) < (a?.commandee?.quantite || 0)) isFull = false;
        if ((a?.recu?.quantite || 0) > 0) hasSome = true;
      });
      const statut = !hasSome ? "annulé" : isFull ? "reçu" : "partiel";

      await updateDoc(achatRef, {
        articles: receptionArticles,
        statutReception: statut,
        dateReception: Timestamp.now(),
        recuPar: user.uid, recuParEmail: user.email,
        stock: stockChoice, stockSource: stockChoice, magasin: stockChoice, depot: stockChoice,
      });

      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "reception_achat", userId: user.uid, userEmail: user.email, timestamp: Timestamp.now(),
        details: { achatId: receptionId, statut, action: "confirmation", stock: stockChoice },
      });

      if (hasSome) {
        const bon = achats.find((b) => b.id === receptionId) || {};
        await updateStockOnAdd({
          id: receptionId,
          fournisseur: bon.fournisseur || "",
          stock: pickDocStock(bon) || stockChoice,
          articles: receptionArticles
            .filter((a) => (a?.recu?.quantite || 0) > 0)
            .map((a) => ({ produit: a.produit, ...(a.recu || {}) })),
          date: Timestamp.now(),
        });
      }

      showNotification(`Réception confirmée (${statut}) !`, "success");
      setReceptionId(null); setReceptionArticles([]);
      await Promise.all([fetchAchats(), fetchStockEntries(), fetchMedicaments()]);
    } catch (e) {
      console.error("handleSubmitReception:", e);
      showNotification("Erreur lors de la confirmation", "error");
    } finally {
      setIsLoading(false);
    }
  }, [
    societeId, user, receptionId, receptionArticles, achats, updateStockOnAdd,
    showNotification, fetchAchats, fetchStockEntries, fetchMedicaments, stockChoice
  ]);

  const handleCancelReception = useCallback(() => { setReceptionId(null); setReceptionArticles([]); }, []);

  /* ===================== Edition bon ===================== */
  const handleEditBon = useCallback((bon) => {
    setEditId(bon.id); setIsEditing(true); setShowCreateForm(true);
    setFournisseur(bon.fournisseur || "");
    const d = toDateSafe(bon.date) || toDateSafe(bon.timestamp) || new Date();
    setDateAchat(d.toISOString().split("T")[0]);
    setStatutPaiement(bon.statutPaiement || "payé");
    setRemiseGlobale(Number(bon.remiseGlobale || 0));
    setStockChoice(pickDocStock(bon));
    setArticles(
      (bon.articles || []).map((a) => ({
        produit: a.produit,
        commandee: { ...(a.commandee || {}), stock: pickDocStock(bon), stockSource: pickDocStock(bon) },
        recu: a.recu ? { ...a.recu, stock: pickDocStock(bon), stockSource: pickDocStock(bon) } : null,
      }))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [toDateSafe]);

  /* ===================== SUPPRESSION BON AVEC CASCADE PAIEMENTS ===================== */
  const handleDeleteBon = useCallback(async (bon) => {
    if (!societeId) return showNotification("Aucune société sélectionnée !", "error");
    if (!user) return showNotification("Utilisateur non connecté !", "error");
    
    const confirmMsg = 
      `⚠️ ATTENTION : Supprimer ce bon d'achat ?\n\n` +
      `Cette action va également supprimer :\n` +
      `• Tous les paiements associés à cet achat\n` +
      `• Les entrées de stock liées (si réception effectuée)\n\n` +
      `Cette action est IRRÉVERSIBLE.\n\n` +
      `Voulez-vous vraiment continuer ?`;
    
    if (!window.confirm(confirmMsg)) return;
    
    setIsLoading(true);
    
    try {
      const paiementsQuery = query(
        collection(db, "societe", societeId, "paiements"),
        where("docId", "==", bon.id),
        where("type", "==", "achats")
      );
      
      const paiementsSnapshot = await getDocs(paiementsQuery);
      const batch = writeBatch(db);
      
      paiementsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      const receivedArticles = (bon.articles || [])
        .filter((a) => (a?.recu?.quantite || 0) > 0)
        .map((a) => ({ produit: a.produit, ...(a.recu || {}) }));

      const montantTotal =
        (receivedArticles.length
          ? receivedArticles.reduce(
              (sum, a) =>
                sum + ((a.prixUnitaire || a.prixAchat || 0) * (a.quantite || 0) - (a.remise || 0)),
              0
            )
          : 0) - (Number(bon.remiseGlobale) || 0);

      if (bon.statutReception && bon.statutReception !== "en_attente") {
        await updateStockOnDelete({ id: bon.id, fournisseur: bon.fournisseur || "", articles: receivedArticles });
      }
      
      const achatRef = doc(db, "societe", societeId, "achats", bon.id);
      batch.delete(achatRef);
      
      await batch.commit();
      
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "achat", 
        userId: user.uid, 
        userEmail: user.email, 
        timestamp: Timestamp.now(),
        details: { 
          fournisseur: bon.fournisseur, 
          montant: montantTotal, 
          action: "suppression", 
          achatId: bon.id, 
          stock: pickDocStock(bon),
          paiementsSupprimesCount: paiementsSnapshot.size,
          montantPaiementsSupprimés: paiementsSnapshot.docs.reduce((sum, doc) => sum + (Number(doc.data().montant) || 0), 0)
        },
      });

      await Promise.all([fetchAchats(), fetchMedicaments(), fetchStockEntries()]);
      
      showNotification(
        `Bon d'achat supprimé avec succès ! (${paiementsSnapshot.size} paiement(s) supprimé(s))`,
        "success"
      );
    } catch (e) {
      console.error("❌ Erreur handleDeleteBon:", e);
      showNotification("Erreur lors de la suppression: " + e.message, "error");
    } finally {
      setIsLoading(false);
    }
  }, [societeId, user, updateStockOnDelete, fetchAchats, fetchMedicaments, fetchStockEntries, showNotification]);

  /* ===================== TRANSFERT MENSUEL ===================== */
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferBonId, setTransferBonId] = useState("");
  const [transferArticleIndex, setTransferArticleIndex] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const transferEligibleBons = achats.filter(bon => 
    (bon.statutReception === "reçu" || bon.statutReception === "partiel") && 
    bon.articles?.some(a => (a?.recu?.quantite || 0) > 0)
  );

  const selectedTransferBon = achats.find(b => b.id === transferBonId) || null;
  const transferArticles = selectedTransferBon?.articles?.filter(a => (a?.recu?.quantite || 0) > 0) || [];

  const resetTransferForm = () => { 
    setTransferBonId(""); 
    setTransferArticleIndex(""); 
    setTransferQty(""); 
    setTransferNote(""); 
  };

  const handleTransfer = useCallback(async () => {
    try {
      if (!societeId || !user) { 
        showNotification("Session invalide.", "error"); 
        return; 
      }
      
      const bonOriginal = achats.find(b => b.id === transferBonId);
      if (!bonOriginal) { 
        showNotification("Bon original introuvable.", "error"); 
        return; 
      }

      const articleIndex = Number(transferArticleIndex);
      const articleOriginal = bonOriginal.articles[articleIndex];
      if (!articleOriginal || !articleOriginal.recu) {
        showNotification("Article introuvable.", "error");
        return;
      }

      const qtyToTransfer = Number(transferQty);
      const currentQty = Number(articleOriginal.recu.quantite || 0);
      
      if (!qtyToTransfer || qtyToTransfer <= 0) { 
        showNotification("Quantité invalide.", "error"); 
        return; 
      }
      
      if (qtyToTransfer > currentQty) { 
        showNotification(`Quantité > quantité reçue disponible (${currentQty}).`, "error"); 
        return; 
      }

      setIsLoading(true);

      const articleTransfere = {
        produit: articleOriginal.produit,
        commandee: {
          ...articleOriginal.commandee,
          quantite: qtyToTransfer,
          stock: "stock2",
          stockSource: "stock2"
        },
        recu: {
          ...articleOriginal.recu,
          quantite: qtyToTransfer,
          stock: "stock2",
          stockSource: "stock2"
        }
      };

      const prixAchatUnit = Number(articleOriginal.recu.prixUnitaire || articleOriginal.recu.prixAchat || 0);
      const remiseItem = Number(articleOriginal.recu.remise || 0);
      const remiseParUnite = currentQty > 0 ? (remiseItem / currentQty) : 0;
      const montantTransfere = qtyToTransfer * prixAchatUnit - qtyToTransfer * remiseParUnite;

      let totalOriginal = getTotalBon(bonOriginal);
      if (totalOriginal < 0) totalOriginal = 0;

      const paysSnap = await getDocs(
        query(
          collection(db, "societe", societeId, "paiements"),
          where("type", "==", "achats"),
          where("docId", "==", transferBonId)
        )
      );
      const paiementsOriginal = [];
      paysSnap.forEach((d) => paiementsOriginal.push({ id: d.id, ...d.data() }));
      const totalPayeOriginal = paiementsOriginal.reduce((s, p) => s + (Number(p.montant) || 0), 0);
      const lastMode = (paiementsOriginal[0]?.mode) || (paiementsOriginal[paiementsOriginal.length - 1]?.mode) || "Espèces";

      let montantPaiementNouveau = 0;
      let statutPaiementNouveau = "impayé";

      if (bonOriginal.statutPaiement === "payé") {
        montantPaiementNouveau = Math.max(0, Number(montantTransfere.toFixed(2)));
        statutPaiementNouveau = "payé";
      } else if (bonOriginal.statutPaiement === "partiel") {
        const ratio = totalOriginal > 0 ? (montantTransfere / totalOriginal) : 0;
        const proportion = Math.max(0, Math.min(1, ratio));
        montantPaiementNouveau = Math.min(montantTransfere, Number((totalPayeOriginal * proportion).toFixed(2)));
        if (montantPaiementNouveau <= 0.001) {
          statutPaiementNouveau = "impayé";
        } else if (Math.abs(montantPaiementNouveau - montantTransfere) < 0.01) {
          statutPaiementNouveau = "payé";
        } else {
          statutPaiementNouveau = "partiel";
        }
      } else {
        montantPaiementNouveau = 0;
        statutPaiementNouveau = "impayé";
      }

      const fournisseurTransfert = bonOriginal.fournisseur + " [TRANSFERT STOCK]";
      const nouveauBonRef = await addDoc(collection(db, "societe", societeId, "achats"), {
        fournisseur: fournisseurTransfert,
        date: Timestamp.now(),
        timestamp: Timestamp.now(),
        statutPaiement: statutPaiementNouveau,
        remiseGlobale: 0,
        articles: [articleTransfere],
        statutReception: "reçu",
        dateReception: Timestamp.now(),
        creePar: user.uid,
        creeParEmail: user.email,
        creeLe: Timestamp.now(),
        recuPar: user.uid,
        recuParEmail: user.email,
        societeId,
        stock: "stock2",
        stockSource: "stock2",
        magasin: "stock2",
        depot: "stock2",
        isTransferred: true,
        originalBonId: transferBonId,
        transferNote: transferNote || "Transfert mensuel Stock1 → Stock2",
        transferDate: Timestamp.now()
      });

      if (montantPaiementNouveau > 0.001) {
        await addDoc(collection(db, "societe", societeId, "paiements"), {
          docId: nouveauBonRef.id,
          montant: Number(montantPaiementNouveau.toFixed(2)),
          mode: lastMode || "Espèces",
          type: "achats",
          date: Timestamp.now(),
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          societeId,
        });
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "paiement",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            mode: lastMode || "Espèces",
            type: "achats",
            montant: Number(montantPaiementNouveau.toFixed(2)),
            fournisseur: fournisseurTransfert,
            paiementAuto: true,
            fromTransfer: true,
            originalBonId: transferBonId,
            newBonId: nouveauBonRef.id,
          },
        });
      }

      const articlesOriginalUpdated = [...bonOriginal.articles];
      articlesOriginalUpdated[articleIndex] = {
        ...articleOriginal,
        recu: {
          ...articleOriginal.recu,
          quantite: currentQty - qtyToTransfer
        }
      };

      const bonOriginalRef = doc(db, "societe", societeId, "achats", transferBonId);
      await updateDoc(bonOriginalRef, {
        articles: articlesOriginalUpdated,
        lastTransferDate: Timestamp.now(),
        lastTransferNote: transferNote || "Transfert mensuel Stock1 → Stock2"
      });

      await updateStockOnAdd({
        id: nouveauBonRef.id,
        fournisseur: fournisseurTransfert,
        stock: "stock2",
        articles: [{ 
          produit: articleOriginal.produit, 
          ...articleTransfere.recu 
        }],
        date: Timestamp.now(),
      });

      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "transfert_mensuel",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          from: "stock1",
          to: "stock2",
          produit: articleOriginal.produit,
          quantite: qtyToTransfer,
          originalBonId: transferBonId,
          newBonId: nouveauBonRef.id,
          note: transferNote || "",
          montantTransfere: Number(montantTransfere.toFixed(2)),
          statutPaiementNouveau,
        },
      });

      showNotification(`Transfert réussi : ${qtyToTransfer} unités → Stock2. Nouveau bon créé (${statutPaiementNouveau}).`, "success");
      resetTransferForm();
      await Promise.all([fetchAchats(), fetchStockEntries()]);
    } catch (e) {
      console.error("handleTransfer:", e);
      showNotification("Erreur lors du transfert.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [societeId, user, achats, transferBonId, transferArticleIndex, transferQty, transferNote, updateStockOnAdd, fetchAchats, fetchStockEntries, showNotification, getTotalBon]);

  /* ===================== Affichage utilitaires ===================== */
  const formatDateDisplay = useCallback((dateField) => {
    const d = toDateSafe(dateField);
    if (!d) return "Date non spécifiée";
    try { return d.toLocaleDateString("fr-FR"); } catch { return d.toISOString().split("T")[0].split("-").reverse().join("/"); }
  }, [toDateSafe]);

  /* ===================== Impression (améliorée) ===================== */
  const buildBonHTML = (bon, entete, pied) => {
    const rows = (bon.articles || []).map((a, idx) => {
      const item = a.recu || a.commandee || {};
      const exp = item?.datePeremption
        ? (typeof item.datePeremption?.toDate === "function"
            ? item.datePeremption.toDate().toLocaleDateString("fr-FR")
            : (typeof item.datePeremption === "string"
                ? item.datePeremption.split("-").reverse().join("/")
                : formatDateDisplay(item.datePeremption)))
        : "";
      const total = ((item.prixUnitaire || item.prixAchat || 0) * (item.quantite || 0)) - (item.remise || 0);
      return `
        <tr>
          <td class="left">${idx + 1}</td>
          <td class="left">${a.produit || ""}</td>
          <td>${item.numeroLot || ""}</td>
          <td>${item.numeroArticle || ""}</td>
          <td>${Number(item.quantite || 0)}</td>
          <td>${Number(item.prixUnitaire || item.prixAchat || 0).toFixed(2)}</td>
          <td>${Number(item.prixVente || 0).toFixed(2)}</td>
          <td>${exp || ""}</td>
          <td>${Number(item.remise || 0).toFixed(2)}</td>
          <td><strong>${total.toFixed(2)}</strong></td>
        </tr>
      `;
    }).join("");

    const totalGeneral = Number(getTotalBon(bon) || 0).toFixed(2);

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Bon d'achat #${String(bon.id).slice(0,8)}</title>
  <style>
    *{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial}
    body{padding:24px;color:#0F172A}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
    .title{font-size:22px;font-weight:900}
    .badge{padding:6px 12px;border-radius:999px;font-weight:800;border:2px solid #E5E7EB;background:#F8FAFC}
    .meta{margin:6px 0;color:#334155}
    .table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #E5E7EB;padding:8px 10px;text-align:center}
    th{background:#0F172A;color:#F8FAFC;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
    td.left,th.left{text-align:left}
    .tot{margin-top:12px;text-align:right;font-weight:900}
    .footer{display:flex;justify-content:space-between;align-items:center;margin-top:24px}
    .cachet{opacity:.9}
    @media print {.no-print{display:none}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${entete || "PHARMACIE"}</div>
      <div class="meta">Fournisseur : <strong>${bon.fournisseur || ""}</strong></div>
      <div class="meta">Date : <strong>${(bon.date ? (typeof bon.date.toDate === "function" ? bon.date.toDate() : new Date(bon.date)) : new Date()).toLocaleDateString("fr-FR")}</strong></div>
      <div class="meta">Paiement : <strong>${bon.statutPaiement || "—"}</strong> | Réception : <strong>${bon.statutReception || "en_attente"}</strong> | Stock : <strong>${bon.stock || "stock1"}</strong></div>
    </div>
    <div class="badge">Bon #${String(bon.id).slice(0,8).toUpperCase()}</div>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th class="left">#</th>
        <th class="left">Produit</th>
        <th>Lot</</th>
        <th>Code</th>
        <th>Qté</th>
        <th>PA</th>
        <th>PV</th>
        <th>Exp.</th>
        <th>Remise</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="tot">TOTAL GÉNÉRAL : <span style="color:#1D4ED8">${totalGeneral} DH</span></div>

  <div class="footer">
    <div class="cachet">
      ${bon?.afficherCachet === false ? "" : (`
        ${(bon?.typeCachet || "").toString() === "image" && bon?.cachetImage
          ? `<img src="${bon.cachetImage}" alt="Cachet" style="height:${Number(bon.tailleCachet || 120)}px">`
          : `<div style="border:2px dashed #CBD5E1;border-radius:8px;padding:10px 14px;display:inline-block">${(bon.cachetTexte || "Cachet Pharmacie")}</div>`
        }
      `)}
    </div>
    <div class="meta">${pied || ""}</div>
  </div>

  <button class="no-print" onclick="window.print()">🖨️ Imprimer</button>
</body>
</html>
    `;
  };

  const handlePrintBon = useCallback((bon) => {
    try {
      const enrichedBon = {
        ...bon,
        afficherCachet: parametres.afficherCachet,
        typeCachet: parametres.typeCachet,
        cachetImage: parametres.cachetImage,
        cachetTexte: parametres.cachetTexte,
        tailleCachet: parametres.tailleCachet,
      };
      const html = buildBonHTML(enrichedBon, parametres.entete, parametres.pied);
      const win = window.open("", "_blank");
      if (!win) { alert("Pop-up bloqué. Autorisez les fenêtres pop-up pour imprimer."); return; }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.onload = () => { try { win.focus(); win.print(); } catch {} };
    } catch (e) {
      console.error("handlePrintBon:", e);
      showNotification("Erreur lors de l'impression", "error");
    }
  }, [parametres, showNotification]);

  const handlePrintFilteredList = useCallback(() => {
    try {
      const rows = filteredAchats.map((b, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="left">${b.fournisseur || ""}</td>
          <td>${formatDateDisplay(b.date || b.timestamp)}</td>
          <td>${b.statutPaiement || ""}</td>
          <td>${b.statutReception || "en_attente"}</td>
          <td>${(b.stock || "stock1").toUpperCase()}</td>
          <td><strong>${Number(getTotalBon(b) || 0).toFixed(2)}</strong></td>
        </tr>
      `).join("");

      const total = filteredAchats.reduce((s, b) => s + getTotalBon(b), 0);

      const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Liste des bons d'achat</title>
  <style>
    body{padding:24px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#0F172A}
    h1{margin:0 0 12px 0}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #E5E7EB;padding:8px 10px;text-align:center}
    th{background:#0F172A;color:#F8FAFC;text-transform:uppercase;font-size:12px;letter-spacing:.06em}
    .left{text-align:left}
    .tot{margin-top:12px;text-align:right;font-weight:900}
    @media print {.no-print{display:none}}
  </style>
</head>
<body>
  <h1>Liste des bons d'achat (filtrés)</h1>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th class="left">Fournisseur</th>
        <th>Date</th>
        <th>Paiement</th>
        <th>Réception</th>
        <th>Stock</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="tot">TOTAL GÉNÉRAL : <span style="color:#1D4ED8">${Number(total).toFixed(2)} DH</span></div>
  <button class="no-print" onclick="window.print()">🖨️ Imprimer</button>
</body>
</html>
      `;
      const win = window.open("", "_blank");
      if (!win) { alert("Pop-up bloqué. Autorisez les fenêtres pop-up pour imprimer."); return; }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.onload = () => { try { win.focus(); win.print(); } catch {} };
    } catch (e) {
      console.error("handlePrintFilteredList:", e);
      showNotification("Erreur lors de l'impression", "error");
    }
  }, [filteredAchats, getTotalBon, formatDateDisplay, showNotification]);

  /* ===================== Calcul total des bons ===================== */
  const totalGeneral = React.useMemo(() => {
    return filteredAchats.reduce((sum, bon) => sum + getTotalBon(bon), 0);
  }, [filteredAchats, getTotalBon]);

  /* ===================== Rendu ===================== */
  if (waiting) {
    return (
      <div className="achats-page">
        <div className="card" style={{ background: "linear-gradient(135deg,#EEF2FF,#FFFFFF)", textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: "2em", marginBottom: "20px" }}>⏳</div>
          <div style={{ fontSize: "1.3em", fontWeight: "700", color: "var(--primary)" }}>Chargement des données…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="achats-page">
      {/* En-tête */}
      <div className="page-header">
        <h1>🛒 Gestion des Achats</h1>
        <div className="page-sub">✨ Dates automatiques : Aujourd'hui • Impayé • Péremption +2 ans</div>
      </div>

      {/* Notifications */}
      {notification && <div className={`notice ${notification.type || "success"}`}>{notification.message}</div>}

      {/* Formulaire nouveau / modifier bon */}
      <div className="card">
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>{isEditing ? "✏️ Modifier un Bon d'Achat" : "➕ Nouveau Bon d'Achat"}</span>
          <div className="controls-bar">
            <button className="btn btn-outline" onClick={() => setShowCreateForm((s) => !s)} aria-label="Afficher/Masquer le formulaire d'achat" title="Afficher/Masquer le formulaire">
              {showCreateForm ? "🔽 Masquer" : "🧾 Afficher Formulaire"}
            </button>
            {articles.length > 0 && <span className="filters-badge">{articles.length} article{articles.length > 1 ? "s" : ""}</span>}
          </div>
        </div>

        <div className={`form-panel ${showCreateForm ? "form-shown" : "form-hidden"}`}>
          <div className="form-panel-inner">
            <div className="form-grid">
              {/* 🆕 Fournisseur avec autocomplétion depuis la base */}
              <input
                className="field"
                placeholder="Fournisseur *"
                value={fournisseur}
                onChange={(e) => onFournisseurChange(e.target.value)}
                list="dlFournisseurs"
                title="Choisissez un fournisseur existant ou tapez un nouveau nom"
              />
              <datalist id="dlFournisseurs">
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.name} />
                ))}
              </datalist>

              <input className="field" type="date" value={dateAchat} onChange={(e) => setDateAchat(e.target.value)} title="📅 Date d'achat (aujourd'hui par défaut)" />
              <select className="select" value={statutPaiement} onChange={(e) => setStatutPaiement(e.target.value)} aria-label="Statut de paiement">
                <option value="impayé">💰 Impayé</option><option value="partiel">🟡 Partiel</option><option value="payé">✅ Payé</option>
              </select>
              <select className="select" value={stockChoice} onChange={(e) => setStockChoice(e.target.value)} aria-label="Choix du stock">
                <option value="stock1">🏪 Stock 1</option><option value="stock2">🏬 Stock 2</option>
              </select>
              <input className="field" type="number" step="0.01" placeholder="Remise globale (DH)" value={remiseGlobale} onChange={(e) => setRemiseGlobale(e.target.value)} />
            </div>

            <hr />

            {/* Ligne d'article */}
            <div className="article-grid">
              <input className="field" placeholder="Produit *" value={produit} onChange={(e) => handleProduitChange(e.target.value)} list="meds" />
              <datalist id="meds">
                {medicaments.map((m) => (<option key={m.nom} value={m.nom} />))}
                <option value="_new_">-- Nouveau produit --</option>
              </datalist>
              <input className="field" placeholder="Nouveau produit" value={produitNouveau} onChange={(e) => setProduitNouveau(e.target.value)} />
              <input className="field" type="number" min="1" placeholder="Quantité *" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
              <input className="field" type="number" step="0.01" placeholder="Prix Achat *" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} />
              <input className="field" type="number" step="0.01" placeholder="Prix Vente" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} />
              <input className="field" type="date" value={datePeremption} onChange={(e) => setDatePeremption(e.target.value)} title="📆 Péremption (+2 ans, recalcul auto)" />
              <input className="field" placeholder="N° Lot" value={numeroLot} onChange={(e) => setNumeroLot(e.target.value)} />
              <input className="field" placeholder="N° article" value={numeroArticle} onChange={(e) => setNumeroArticle(e.target.value)} />
              {/* 🆕 Fournisseur article avec la même liste */}
              <input
                className="field"
                placeholder="Fournisseur article"
                value={fournisseurArticle}
                onChange={(e) => setFournisseurArticle(e.target.value)}
                list="dlFournisseurs"
                title="Choisissez un fournisseur existant ou tapez un nouveau nom"
              />
              <input className="field" type="number" step="0.01" placeholder="Remise" value={remiseArticle} onChange={(e) => setRemiseArticle(e.target.value)} />
              <button className="btn btn-primary" onClick={handleAddArticle} aria-label="Ajouter l'article au bon">➕ Ajouter</button>
            </div>

            {/* Liste des articles ajoutés */}
            {articles.length > 0 && (
              <div className="table-scroll" style={{ marginTop: 20 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="left">Produit</th><th>Lot</th><th>Code</th><th>Qté</th><th>PA</th><th>PV</th><th>Exp.</th><th>Remise</th><th>Stock</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((a, i) => (
                      <tr key={i}>
                        <td className="left">{a.produit}</td>
                        <td><span className="chip">{a.commandee?.numeroLot || ""}</span></td>
                        <td>{a.commandee?.numeroArticle || ""}</td>
                        <td><span className="qty">{a.commandee?.quantite || 0}</span></td>
                        <td style={{ fontWeight: "800", color: "var(--primary)" }}>{Number(a.commandee?.prixUnitaire || 0).toFixed(2)} DH</td>
                        <td style={{ fontWeight: "800", color: "var(--success)" }}>{Number(a.commandee?.prixVente || 0).toFixed(2)} DH</td>
                        <td>{a.commandee?.datePeremption || ""}</td>
                        <td>{Number(a.commandee?.remise || 0).toFixed(2)} DH</td>
                        <td style={{ textTransform: "uppercase", fontWeight: "800" }}>{(a.commandee?.stock || stockChoice)}</td>
                        <td>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: "8px 16px" }}
                            onClick={() => handleRemoveArticle(i)}
                            aria-label={`Supprimer l'article ${a.produit}`}
                            title="Supprimer cet article"
                          >
                            🗑️ Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={handleAddBon} disabled={isLoading} aria-label={isEditing ? "Enregistrer les modifications du bon" : "Créer le bon d'achat"}>
                {isEditing ? "💾 Enregistrer les modifications" : "💾 Créer le bon d'achat"}
              </button>
              <button className="btn btn-outline" onClick={resetForm} disabled={isLoading} aria-label="Réinitialiser le formulaire">♻️ Réinitialiser</button>
            </div>
          </div>
        </div>
      </div>

      {/* Transfert Stock1 → Stock2 */}
      <div className="card" style={{ borderColor: "#D1FAE5", borderWidth: "2px" }}>
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>🔄 Transfert mensuel — Stock1 → Stock2</span>
          <button className="btn btn-outline" onClick={() => setShowTransfer((s) => !s)} aria-label="Afficher/Masquer le module de transfert">
            {showTransfer ? "🔽 Fermer" : "🔄 Ouvrir"}
          </button>
        </div>

        {showTransfer && (
          <div className="form-panel form-shown">
            <div className="form-panel-inner">
              <div className="notice warning">
                ⚠️ Le transfert créera un nouveau bon (Stock2) et diminuera les quantités du bon original. Fonctionne pour réceptions totales ET partielles.
              </div>
              
              <div className="form-grid">
                <select className="select" value={transferBonId} onChange={(e) => { setTransferBonId(e.target.value); setTransferArticleIndex(""); }} aria-label="Choisir un bon reçu">
                  <option value="">— Choisir un bon reçu —</option>
                  {transferEligibleBons.map((bon) => (
                    <option key={bon.id} value={bon.id}>
                      {bon.fournisseur} - {formatDateDisplay(bon.date)} (#{bon.id.slice(0, 8)})
                    </option>
                  ))}
                </select>

                <select className="select" value={transferArticleIndex} onChange={(e) => setTransferArticleIndex(e.target.value)} disabled={!transferBonId} aria-label="Choisir un article à transférer">
                  <option value="">— Choisir un article —</option>
                  {transferArticles.map((article, index) => (
                    <option key={index} value={index}>
                      {article.produit} • Qté: {article.recu?.quantite || 0}
                    </option>
                  ))}
                </select>

                <input 
                  className="field" 
                  type="number" 
                  min="1" 
                  placeholder="Quantité à transférer" 
                  value={transferQty} 
                  onChange={(e) => setTransferQty(e.target.value)} 
                  disabled={transferArticleIndex === ""} 
                  aria-label="Quantité à transférer"
                />
                
                <input className="field" placeholder="Note (optionnel)" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} aria-label="Note de transfert" />

                <button className="btn btn-success" onClick={handleTransfer} disabled={!transferBonId || transferArticleIndex === "" || !transferQty || isLoading} aria-label="Créer un bon de transfert vers Stock2">
                  🔄 Créer bon transfert Stock2
                </button>
                
                <button className="btn btn-outline" onClick={resetTransferForm} disabled={isLoading} aria-label="Réinitialiser le module de transfert">♻️ Réinitialiser</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Réception */}
      {receptionId && (
        <div className="card" style={{ borderColor: "#BFDBFE", borderWidth: "2px" }}>
          <h3 className="section-title">📥 Réception du bon #{String(receptionId).slice(0, 8).toUpperCase()}</h3>
          
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="left">Produit</th><th>Qté Commandée</th><th>Qté Reçue</th><th>PA</th><th>PV</th><th>Expiration</th>
                </tr>
              </thead>
              <tbody>
                {receptionArticles.map((a, idx) => (
                  <tr key={idx}>
                    <td className="left" style={{ fontWeight: "800" }}>{a.produit}</td>
                    <td><span className="qty">{a.commandee?.quantite || 0}</span></td>
                    <td><input className="field" type="number" min="0" max={a.commandee?.quantite || 0} value={a.recu?.quantite ?? 0} onChange={(e) => handleUpdateReceptionArticle(idx, "quantite", e.target.value)} style={{ width: 100 }} aria-label={`Quantité reçue pour ${a.produit}`} /></td>
                    <td><input className="field" type="number" step="0.01" value={a.recu?.prixUnitaire ?? 0} onChange={(e) => handleUpdateReceptionArticle(idx, "prixUnitaire", e.target.value)} style={{ width: 100 }} aria-label={`PA reçu pour ${a.produit}`} /></td>
                    <td><input className="field" type="number" step="0.01" value={a.recu?.prixVente ?? 0} onChange={(e) => handleUpdateReceptionArticle(idx, "prixVente", e.target.value)} style={{ width: 100 }} aria-label={`PV pour ${a.produit}`} /></td>
                    <td><input className="field" type="date" value={a.recu?.datePeremption || ""} onChange={(e) => handleUpdateReceptionArticle(idx, "datePeremption", e.target.value)} style={{ width: 150 }} aria-label={`Date d'expiration pour ${a.produit}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
            <button className="btn btn-success" style={{ fontSize: "1.1em", padding: "14px 28px" }} onClick={handleSubmitReception} disabled={isLoading} aria-label="Confirmer la réception">✅ Confirmer la réception</button>
            <button className="btn btn-outline" onClick={handleCancelReception} disabled={isLoading} aria-label="Annuler la réception">❌ Annuler</button>
          </div>
        </div>
      )}

      {/* Liste des bons */}
      <div className="card">
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>📋 Bons d'Achat</span>
          <div className="controls-bar">
            <button className="btn btn-outline" onClick={() => setShowFilters((s) => !s)} aria-label="Afficher/Masquer les filtres">
              {showFilters ? "🔽 Masquer filtres" : "🔎 Afficher filtres"}
            </button>
            {activeFiltersCount > 0 && <span className="filters-badge">{activeFiltersCount} actif{activeFiltersCount > 1 ? "s" : ""}</span>}
            <button className="btn btn-primary" onClick={handlePrintFilteredList} aria-label="Imprimer la liste filtrée">🖨️ Imprimer la liste</button>
          </div>
        </div>

        <div className={`filters-panel ${showFilters ? "filters-shown" : "filters-hidden"}`}>
          <div className="filters-panel-inner">
            <div className="form-grid" style={{ marginBottom: 16 }}>
              {/* 🆕 filtre Fournisseur branché sur la même liste */}
              <input
                className="field"
                placeholder="Fournisseur"
                value={filterFournisseur}
                onChange={(e) => setFilterFournisseur(e.target.value)}
                list="dlFournisseurs"
                title="Filtrer par fournisseur"
              />
              <input className="field" type="date" placeholder="Date début" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} />
              <input className="field" type="date" placeholder="Date fin" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} />
              <select className="select" value={filterStatutPaiement} onChange={(e) => setFilterStatutPaiement(e.target.value)} aria-label="Filtrer par paiement">
                <option value="">Tous paiements</option><option value="payé">Payé</option><option value="partiel">Partiel</option><option value="impayé">Impayé</option>
              </select>
              <select className="select" value={filterStatutReception} onChange={(e) => setFilterStatutReception(e.target.value)} aria-label="Filtrer par statut de réception">
                <option value="">Tous statuts</option><option value="en_attente">En attente</option><option value="partiel">Partiel</option><option value="reçu">Reçu</option><option value="annulé">Annulé</option>
              </select>
            </div>
            <button className="btn btn-outline" onClick={resetFilters} aria-label="Réinitialiser les filtres">♻️ Réinitialiser filtres</button>
          </div>
        </div>

        {filteredAchats.length === 0 ? (
          <div style={{ color: "var(--muted)", marginTop: 20, textAlign: "center", fontSize: "1.1em" }}>
            😕 Aucun bon d'achat trouvé.
          </div>
        ) : (
          <div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="left">FOURNISSEUR</th><th>DATE</th><th>PAIEMENT</th><th>RÉCEPTION</th><th>STOCK</th><th>TOTAL</th><th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredAchats.map((b) => (
                  <tr key={b.id} className={b.isTransferred ? "bon-transfere" : ""}>
                    <td className="left" style={{ fontWeight: "800" }}>
                      {b.fournisseur}
                      {b.isTransferred && (
                        <button className="inline-delete" onClick={() => handleDeleteBon(b)} aria-label="Supprimer ce bon (transfert)">
                          (supprimer)
                        </button>
                      )}
                    </td>
                    <td>{formatDateDisplay(b.date || b.timestamp)}</td>
                    <td>
                      <span style={{ 
                        padding: "6px 12px", 
                        borderRadius: "20px", 
                        fontWeight: "800",
                        background: b.statutPaiement === "payé" ? "#ECFDF5" : b.statutPaiement === "partiel" ? "#FEF3C7" : "#FEE2E2",
                        color: b.statutPaiement === "payé" ? "#065F46" : b.statutPaiement === "partiel" ? "#92400E" : "#7F1D1D",
                        border: `2px solid ${b.statutPaiement === "payé" ? "#BBF7D0" : b.statutPaiement === "partiel" ? "#FDE68A" : "#FECACA"}`
                      }}>
                        {b.statutPaiement}
                      </span>
                    </td>
                    <td>
                      <span style={{ 
                        padding: "6px 12px", 
                        borderRadius: "20px", 
                        fontWeight: "800",
                        background: b.statutReception === "reçu" ? "#ECFDF5" : b.statutReception === "partiel" ? "#FEF3C7" : "#EFF6FF",
                        color: b.statutReception === "reçu" ? "#065F46" : b.statutReception === "partiel" ? "#92400E" : "#1E40AF",
                        border: `2px solid ${b.statutReception === "reçu" ? "#BBF7D0" : b.statutReception === "partiel" ? "#FDE68A" : "#BFDBFE"}`
                      }}>
                        {b.statutReception || "en_attente"}
                      </span>
                    </td>
                    <td style={{ textTransform: "uppercase", fontWeight: "800", color: "var(--primary)" }}>
                      {(b.stock || "stock1")}
                    </td>
                    <td style={{ fontWeight: "900", fontSize: "1.05em", color: "var(--primary)" }}>
                      {Number(getTotalBon(b) || 0).toFixed(2)} DH
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                        <button
                          className="action-btn print small"
                          onClick={() => handlePrintBon(b)}
                          title="Imprimer le bon"
                          aria-label="Imprimer le bon"
                        >
                          🖨️ Imprimer
                        </button>

                        {b.statutReception === "en_attente" && !b.isTransferred && (
                          <>
                            <button
                              className="action-btn reception small"
                              onClick={() => handleStartReception(b)}
                              title="Réceptionner ce bon"
                              aria-label="Réceptionner ce bon"
                            >
                              📥 Réception
                            </button>
                            <button
                              className="action-btn edit small"
                              onClick={() => handleEditBon(b)}
                              title="Modifier ce bon"
                              aria-label="Modifier ce bon"
                            >
                              ✏️ Modifier
                            </button>
                          </>
                        )}

                        {!b.isTransferred && (
                          <button
                            className="action-btn delete small"
                            onClick={() => handleDeleteBon(b)}
                            title="Supprimer ce bon"
                            aria-label="Supprimer ce bon"
                          >
                            🗑️ Supprimer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="table-total">
                  <td colSpan={5} style={{ textAlign: "right", padding: "20px", fontSize: "1.2em" }}>
                    <strong>💰 TOTAL GÉNÉRAL :</strong>
                  </td>
                  <td style={{ padding: "20px", fontSize: "1.3em" }}>
                    <strong>{totalGeneral.toFixed(2)} DH</strong>
                  </td>
                  <td style={{ padding: "20px" }}>
                    <span style={{ fontSize: "0.9em", opacity: 0.8 }}>
                      {filteredAchats.length} bon{filteredAchats.length > 1 ? "s" : ""}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== Caméra / lecteur code-barres inline (placeholder) ===================== */
function CameraBarcodeInlineModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div style={{ 
      position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", 
      display: "grid", placeItems: "center", zIndex: 9999, backdropFilter: "blur(4px)"
    }}>
      <div style={{ 
        background: "#fff", borderRadius: 20, padding: 32, maxWidth: 500,
        boxShadow: "0 20px 60px rgba(0,0,0,.3)"
      }}>
        <h3 style={{ marginBottom: 16, fontSize: "1.5em", fontWeight: "800" }}>📷 Scanner de code-barres</h3>
        <p style={{ marginBottom: 24, color: "#64748B" }}>Fonction de scan simplifiée - À implémenter avec votre lecteur</p>
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

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
 * - Modèle d'article bon: { produit, commandee:{...}, recu:{...}|null }
 * - Réception multi-lots → création/MAJ des documents dans stock_entries (un lot = un doc)
 * - Transfert mensuel: crée un NOUVEAU BON avec les quantités transférées vers stock2
 * - Le bon original voit ses quantités diminuées
 * - Total affiché en bas du tableau des bons
 * - Transfert fonctionnel pour réceptions totales ET partielles
 * - 🆕 SUPPRESSION EN CASCADE : supprime automatiquement les paiements associés
 */

export default function Achats() {
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
        --table-head-grad: linear-gradient(135deg, #0B1220 0%, #1F2937 100%);
        --danger-grad: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
        --success-grad: linear-gradient(135deg, #22C55E 0%, #10B981 100%);
        --outline-hover-grad: linear-gradient(135deg, #EEF2FF 0%, #E0F2FE 100%);
        --total-grad: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
      }
      .achats-page{ max-width:1280px; margin:0 auto; }
      .card{ background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; box-shadow:0 10px 34px rgba(2,6,23,.08); }
      .card + .card{ margin-top:16px; }
      .section-title{ margin:0 0 12px 0; font-weight:800; color:var(--text); display:flex; align-items:center; gap:8px; }
      .section-title::before{ content:""; width:10px;height:10px;border-radius:50%; background:var(--cta-grad); display:inline-block; }
      .page-header{ background:var(--header-grad); color:#fff; padding:14px 16px; border-radius:14px; margin-bottom:12px; }
      .page-header h1{ margin:0; font-weight:900; letter-spacing:.3px; }
      .page-sub{ opacity:.95; margin-top:6px; }
      .form-grid{ display:grid; gap:12px; grid-template-columns:repeat(5,1fr); }
      @media (max-width:1280px){ .form-grid{ grid-template-columns:repeat(3,1fr);} }
      @media (max-width:640px){ .form-grid{ grid-template-columns:1fr;} }
      .article-grid{ display:grid; gap:10px; grid-template-columns:1.2fr .8fr .8fr .8fr .8fr 1fr 1fr 1fr 1fr 1fr 1fr; }
      @media (max-width:1280px){ .article-grid{ grid-template-columns:1fr 1fr 1fr; } }
      @media (max-width:640px){ .article-grid{ grid-template-columns:1fr; } }
      .field,.select{ font:inherit; border-radius:10px; border:1px solid var(--border); padding:10px 12px; outline:none; background:#fff; color:var(--text); transition: box-shadow .15s, border-color .15s, background .15s; }
      .field::placeholder{ color:black; }
      .field:focus,.select:focus{ border-color:var(--ring); box-shadow:0 0 0 4px rgba(165,180,252,.35); background:#fff; }
      .btn{ padding:10px 14px; font-weight:700; border:1px solid transparent; border-radius:12px; cursor:pointer; transition:.15s; display:inline-flex; align-items:center; gap:8px; }
      .btn-primary{ color:#fff; background:var(--cta-grad); box-shadow:0 10px 30px rgba(79,70,229,.25); }
      .btn-outline{ background:#fff; color:var(--text); border-color:var(--border); }
      .btn-danger{ color:#fff; background:var(--danger-grad); border:1px solid #FCA5A5; }
      .btn-success{ color:#064E3B; background:linear-gradient(135deg,#ECFDF5 0%, #DCFCE7 100%); border:1px solid #86EFAC; }
      .notice{ border-radius:12px; padding:12px; font-weight:600; margin-bottom:12px; border:1px solid var(--border); }
      .notice.success{ background:#ECFDF5; color:#065F46; border-color:#BBF7D0; }
      .notice.error{ background:#FEF2F2; color:#7F1D1D; border-color:#FECACA; }
      .notice.info{ background:#EEF2FF; color:#4338CA; border-color:#C7D2FE; }
      .notice.warning{ background:#FEF3C7; color:#92400E; border-color:#FDE68A; }
      .table-scroll{ width:100%; overflow-x:auto; border:1px solid var(--border); border-radius:12px; background:#fff; }
      .table{ width:100%; min-width:1100px; border-collapse:collapse; }
      .table thead th{ position:sticky; top:0; background:var(--table-head-grad); color:#E5E7EB; font-weight:800; text-transform:uppercase; font-size:12px; letter-spacing:.5px; border-bottom:1px solid var(--border); padding:12px 10px; text-align:center; z-index:1; }
      .table tbody td{ padding:12px 10px; border-bottom:1px solid var(--border); text-align:center; color:var(--text); font-weight:600; background:#fff; }
      .table tbody tr:hover td{ background:#F8FAFC; }
      .table .left{ text-align:left; }
      .table-total{ background:var(--total-grad); font-weight:800; font-size:14px; color:#92400E; border:2px solid #FDE68A; }
      .bon-transfere{ background:#E0F2FE; border-left:4px solid var(--primary-2); }
      .bon-original{ background:#FDF2F8; border-left:4px solid var(--accent); }
      .chip{ padding:4px 8px; border-radius:8px; font-weight:800; background:#FDF2F8; color:#BE185D; display:inline-block; border:1px solid #FBCFE8; }
      .qty{ background:rgba(79,70,229,.12); color:var(--primary); border-radius:8px; padding:6px 10px; font-weight:800; }
      .controls-bar{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
      .filters-panel,.form-panel{ overflow:hidden; transition:max-height .3s ease, opacity .25s ease; border:1px solid var(--border); border-radius:12px; background:#fff; }
      .filters-panel-inner,.form-panel-inner{ padding:12px; }
      .filters-hidden,.form-hidden{ max-height:0; opacity:0; }
      .filters-shown{ max-height:900px; opacity:1; }
      .form-shown{ max-height:2000px; opacity:1; }
      .filters-badge{ background:#EEF2FF; color:#3730A3; border:1px solid #C7D2FE; border-radius:999px; padding:4px 10px; font-weight:800; font-size:12px; }

      /* Lien "supprimer" inline dans la cellule fournisseur pour les transferts */
      .inline-delete{
        margin-left:8px; font-weight:800; font-size:12px; color:#DC2626; cursor:pointer;
        background:transparent; border:none; padding:0;
      }
      .inline-delete:hover{ text-decoration:underline; }
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
  const [dateAchat, setDateAchat] = useState("");
  const [statutPaiement, setStatutPaiement] = useState("payé");
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
  const [datePeremption, setDatePeremption] = useState("");
  const [numeroLot, setNumeroLot] = useState("");
  const [fournisseurArticle, setFournisseurArticle] = useState("");

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
  }, [societeId, fetchParametres, fetchAchats, fetchStockEntries, fetchMedicaments]);

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
    setRemiseArticle(0); setDatePeremption(""); setNumeroLot(""); setNumeroArticle(""); setFournisseurArticle("");
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
    setFournisseur(""); setDateAchat(""); setStatutPaiement("payé"); setRemiseGlobale(0);
    setStockChoice("stock1"); setArticles([]); setEditId(null); setIsEditing(false);
    setProduit(""); setProduitNouveau(""); setQuantite(1); setPrixUnitaire(""); setPrixVente("");
    setRemiseArticle(0); setDatePeremption(""); setNumeroLot(""); setNumeroArticle(""); setFournisseurArticle("");
  }

  /* ===== Helper total bon (reutilisé pour le transfert/paiements) ===== */
  const getTotalBon = useCallback((bon) => {
    const arr = bon?.articles || [];
    return arr.reduce((sum, a) => {
      const item = a?.recu || a?.commandee || {};
      const total = (item.prixUnitaire || item.prixAchat || 0) * (item.quantite || 0) - (item.remise || 0);
      return sum + total;
    }, 0) - (Number(bon?.remiseGlobale) || 0);
  }, []);

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

  /* ===================== Réception (préparer / modifier / confirmer) ===================== */
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

  /* ===================== 🆕 SUPPRESSION BON AVEC CASCADE PAIEMENTS ===================== */
  const handleDeleteBon = useCallback(async (bon) => {
    if (!societeId) return showNotification("Aucune société sélectionnée !", "error");
    if (!user) return showNotification("Utilisateur non connecté !", "error");
    
    // Confirmation avec avertissement sur les paiements
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
      console.log(`🗑️ Début suppression achat ${bon.id} avec cascade...`);
      
      // 1️⃣ Trouver tous les paiements liés à cet achat
      const paiementsQuery = query(
        collection(db, "societe", societeId, "paiements"),
        where("docId", "==", bon.id),
        where("type", "==", "achats")
      );
      
      const paiementsSnapshot = await getDocs(paiementsQuery);
      console.log(`📊 ${paiementsSnapshot.size} paiement(s) trouvé(s) pour l'achat ${bon.id}`);
      
      // 2️⃣ Utiliser un batch pour supprimer tous les paiements
      const batch = writeBatch(db);
      
      paiementsSnapshot.forEach((doc) => {
        console.log(`🗑️ Suppression du paiement ${doc.id} (${doc.data().montant} DH)`);
        batch.delete(doc.ref);
      });
      
      // 3️⃣ Supprimer les entrées de stock si réception effectuée
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
        console.log(`🔄 Suppression des entrées de stock pour l'achat ${bon.id}`);
        await updateStockOnDelete({ id: bon.id, fournisseur: bon.fournisseur || "", articles: receivedArticles });
      }
      
      // 4️⃣ Supprimer le bon d'achat
      const achatRef = doc(db, "societe", societeId, "achats", bon.id);
      batch.delete(achatRef);
      
      // 5️⃣ Exécuter toutes les suppressions
      await batch.commit();
      
      console.log(`✅ Achat ${bon.id} et ${paiementsSnapshot.size} paiement(s) supprimés avec succès`);
      
      // 6️⃣ Enregistrer l'activité
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

      // 7️⃣ Rafraîchir les données
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

  /* ===================== TRANSFERT MENSUEL (Stock1 → Stock2) — NOUVEAU BON ===================== */
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferBonId, setTransferBonId] = useState("");
  const [transferArticleIndex, setTransferArticleIndex] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferNote, setTransferNote] = useState("");

  // MODIFICATION ICI : Bons éligibles au transfert incluent maintenant "partiel" ET "reçu"
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

      // 1) Créer le nouvel article transféré (Stock2)
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

      // 2) Calcul du montant transféré (pour gérer paiements/statut)
      const prixAchatUnit = Number(articleOriginal.recu.prixUnitaire || articleOriginal.recu.prixAchat || 0);
      const remiseItem = Number(articleOriginal.recu.remise || 0);
      const remiseParUnite = currentQty > 0 ? (remiseItem / currentQty) : 0;
      const montantTransfere = qtyToTransfer * prixAchatUnit - qtyToTransfer * remiseParUnite;

      // 3) Récupérer paiements du bon original
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

      // 4) Déterminer le paiement du nouveau bon
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

      // 5) Créer le nouveau bon de transfert (Stock2) — libellé TRANSFERT STOCK + suppression plus visible
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
        // flags
        isTransferred: true,
        originalBonId: transferBonId,
        transferNote: transferNote || "Transfert mensuel Stock1 → Stock2",
        transferDate: Timestamp.now()
      });

      // 6) Paiement éventuel sur le nouveau bon
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

      // 7) Mise à jour du bon original (diminuer la quantité)
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

      // 8) Entrée stock pour le nouveau bon (Stock2)
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

      // 9) Enregistrer l'activité transfert
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

  /* ===================== Impression ===================== */
  const generateCachetHtml = useCallback(() => {
    if (!parametres?.afficherCachet) return "";
    const taille = Number(parametres.tailleCachet || 120);
    if (parametres.typeCachet === "image" && parametres.cachetImage) {
      return `
        <div style="position: relative; text-align: center; flex: 1;">
          <div class="signature-area"></div>
          <div class="signature-label">✍️ Signature Responsable</div>
          <img src="${parametres.cachetImage}" alt="Cachet" style="position:absolute;top:10px;left:50%;transform:translateX(-50%);max-width:${Math.min(taille,100)}px;max-height:${Math.min(taille,60)}px;opacity:.85;z-index:10;object-fit:contain;" onerror="this.style.display='none';"/>
        </div>`;
    }
    return `
      <div style="position: relative; text-align: center; flex: 1;">
        <div class="signature-area"></div>
        <div class="signature-label">✍️ Signature Responsable</div>
        <div style="position:absolute;top:15px;left:50%;transform:translateX(-50%);border:2px solid #4F46E5;color:#1E293B;border-radius:50%;padding:8px 15px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;background:rgba(79,70,229,.12);opacity:.92;z-index:10;max-width:${Math.min(taille,80)}px;text-align:center;line-height:1.2;">
          ${parametres.cachetTexte || "Cachet Pharmacie"}
        </div>
      </div>`;
  }, [parametres]);

  const printImplRef = useRef(null);
  const defaultFullPrintHTML = useCallback(
    (bon, arts, total, cachetHtml, isMobileDevice = false) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/><title>Bon</title></head>
<body><pre style="font-family:monospace">${JSON.stringify(
      { bonId: bon?.id, fournisseur: bon?.fournisseur, total },
      null,
      2
    )}</pre><p>Document prêt à imprimer.</p></body></html>`,
    []
  );
  const generatePrintHTML = useCallback((bon, arts, total, cachetHtml, isMobileDevice = false) => {
    const impl = printImplRef.current || defaultFullPrintHTML;
    return impl(bon, arts, total, cachetHtml, isMobileDevice);
  }, [defaultFullPrintHTML]);

  const fullPrintHTML = useCallback((bon, articlesPrint, total, cachetHtml, isMobileDevice = false) => {
    const primaryColor = "#4F46E5"; const secondaryColor = "#06B6D4"; const accentColor = "#F472B6";
    const dateStr = (toDateSafe(bon.timestamp) || toDateSafe(bon.date) || new Date()).toLocaleDateString("fr-FR");
    let titleDocument = bon.statutReception === "en_attente" ? "Bon de Commande Multi-Lots" : "Bon de Réception Multi-Lots";
    if (bon.isTransferred) titleDocument = "Bon de Transfert Stock2";
    
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${titleDocument} - ${bon.fournisseur || ""}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
* {margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',Arial,sans-serif;margin:0;padding:${isMobileDevice ? "5px" : "10px"};background:#fff;color:#0F172A;font-size:${isMobileDevice ? "10px" : "12px"};line-height:1.3;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.document-container{background:#fff;max-width:100%;margin:0 auto;position:relative;min-height:${isMobileDevice ? "calc(100vh - 10px)" : "calc(100vh - 20px)"};display:flex;flex-direction:column}
.header-section{background:linear-gradient(135deg,#0B1220 0%,${primaryColor} 100%);padding:${isMobileDevice ? "15px 10px" : "20px 15px"};text-align:center}
.company-title{color:#fff;font-size:${isMobileDevice ? "1.4em" : "1.8em"};font-weight:800;margin-bottom:${isMobileDevice ? "5px" : "8px"};text-shadow:2px 2px 4px rgba(0,0,0,.3)}
.document-badge{background:rgba(255,255,255,.92);color:${primaryColor};padding:${isMobileDevice ? "4px 12px" : "6px 16px"};border-radius:20px;font-size:${isMobileDevice ? ".8em" : "1em"};font-weight:700;text-transform:uppercase}
.document-number{color:#E2E8F0;font-size:${isMobileDevice ? ".7em" : ".8em"};font-weight:600;margin-top:${isMobileDevice ? "4px" : "6px"}}
.content-wrapper{padding:${isMobileDevice ? "15px 10px" : "20px 15px"};flex:1;overflow:auto;display:flex;flex-direction:column}
.info-section{display:grid;grid-template-columns:${isMobileDevice ? "1fr 1fr" : "1fr 1fr 1fr 1fr"};gap:${isMobileDevice ? "8px" : "12px"};margin-bottom:${isMobileDevice ? "12px" : "15px"}}
.info-card{background:linear-gradient(135deg,#F8FAFC 0%,#EFF6FF 100%);padding:${isMobileDevice ? "8px" : "12px"};border-radius:${isMobileDevice ? "6px" : "8px"};border-left:${isMobileDevice ? "2px" : "3px"} solid ${secondaryColor};box-shadow:0 2px 8px rgba(0,0,0,.05)}
.info-label{color:#475569;font-weight:700;font-size:${isMobileDevice ? ".6em" : ".7em"};text-transform:uppercase;letter-spacing:${isMobileDevice ? ".5px" : "1px"};margin-bottom:${isMobileDevice ? "3px" : "4px"}}
.info-value{color:#0F172A;font-weight:800;font-size:${isMobileDevice ? ".8em" : ".9em"};word-wrap:break-word;line-height:1.2}
.articles-section{margin:${isMobileDevice ? "10px" : "15px"}}
.section-title{color:${secondaryColor};font-size:${isMobileDevice ? "1em" : "1.2em"};font-weight:800;margin-bottom:${isMobileDevice ? "8px" : "10px"};text-align:center;text-transform:uppercase}
.articles-table{width:100%;border-collapse:collapse;overflow:hidden;margin:${isMobileDevice ? "8px" : "10px"} 0;font-size:${isMobileDevice ? ".75em" : ".85em"}}
.articles-table thead{background:linear-gradient(135deg,#0B1220 0%,#111827 100%)}
.articles-table th{padding:${isMobileDevice ? "8px 6px" : "12px 10px"};text-align:center;color:#fff;font-weight:700;font-size:${isMobileDevice ? ".8em" : ".9em"}}
.articles-table td{padding:${isMobileDevice ? "8px 6px" : "12px 10px"};text-align:center;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:${isMobileDevice ? ".85em" : "1em"};color:#0F172A}
.product-name{text-align:left;font-weight:800;color:#0F172A;max-width:${isMobileDevice ? "120px" : "200px"};word-wrap:break-word}
.lot-number{background:${accentColor}20;color:#BE185D;font-weight:800;font-size:${isMobileDevice ? ".8em" : ".9em"};padding:2px 6px;border-radius:4px}
.price-cell{color:${secondaryColor};font-weight:800}
.quantity-cell{background:${secondaryColor}20;color:${primaryColor};font-weight:800;border-radius:6px;padding:${isMobileDevice ? "4px 8px" : "8px 12px"}}
.grand-total-section{margin:${isMobileDevice ? "25px" : "40px"} 0;padding:${isMobileDevice ? "20px 15px" : "30px"};background:linear-gradient(135deg,${primaryColor} 0%,${secondaryColor} 100%);border-radius:${isMobileDevice ? "10px" : "20px"};color:#fff;text-align:center}
.total-amount{font-size:${isMobileDevice ? "2em" : "3em"};font-weight:900;text-shadow:2px 2px 4px rgba(0,0,0,.25)}
.signature-section{margin:${isMobileDevice ? "30px" : "40px"} 0;display:${isMobileDevice ? "block" : "flex"};gap:${isMobileDevice ? "20px" : "40px"}}
.signature-area{height:${isMobileDevice ? "50px" : "80px"};border-bottom:${isMobileDevice ? "2px" : "3px"} solid #CBD5E1;margin-bottom:${isMobileDevice ? "8px" : "15px"};background:linear-gradient(135deg,#F8FAFC 0%,#EFF6FF 100%);border-radius:8px 8px 0 0}
.footer-section{background:linear-gradient(135deg,#0B1220 0%,#111827 100%);padding:${isMobileDevice ? "10px 8px" : "12px 10px"};text-align:center;color:#fff}
.print-info{color:#A5B4FC;font-size:${isMobileDevice ? ".6em" : ".7em"};margin-top:${isMobileDevice ? "4px" : "6px"}}
@media print{
  @page{margin:.5cm;size:A4}
  body{background:#fff!important;padding:0!important;margin:0!important;font-size:11px!important}
  .articles-table th,.articles-table td{padding:6px 4px!important;font-size:8px!important;line-height:1.2!important}
  .product-name{max-width:80px!important;font-size:8px!important}
}
</style>
</head>
<body>
  <div class="document-container">
    <div class="header-section">
      <div class="company-title">${parametres.entete || "PHARMACIE"}</div>
      <div class="document-badge">${bon.isTransferred ? "🔄 " : "🛒 "}${titleDocument}</div>
      <div class="document-number">N° ${String(bon.id || "").substring(0, 8).toUpperCase()}</div>
      ${bon.isTransferred ? `<div class="document-number">Bon original: ${String(bon.originalBonId || "").substring(0, 8).toUpperCase()}</div>` : ""}
    </div>
    <div class="content-wrapper">
      <div class="info-section">
        <div class="info-card"><div class="info-label">🏢 Fournisseur</div><div class="info-value">${bon.fournisseur || ""}</div></div>
        <div class="info-card"><div class="info-label">📅 Date</div><div class="info-value">${dateStr}</div></div>
        <div class="info-card"><div class="info-label">🆔 Numéro de Bon</div><div class="info-value">#${String(bon.id || "").substring(0, 8).toUpperCase()}</div></div>
        <div class="info-card"><div class="info-label">🏷️ Stock</div><div class="info-value">${(bon.stock || bon.stockSource || bon.magasin || bon.depot || "stock1").toUpperCase()}</div></div>
      </div>
      <div class="articles-section">
        <h2 class="section-title">📦 Détail des Articles</h2>
        <table class="articles-table">
          <thead><tr><th>Produit</th><th>Lot</th><th>Code</th><th>Fournisseur</th><th>Qté</th><th>Prix Achat</th><th>Prix Vente</th><th>Date Exp.</th><th>Total</th></tr></thead>
          <tbody>
            ${articlesPrint.map((a) => {
              const item = a || {};
              const prixAchatFinal = Number(item.prixUnitaire || item.prixAchat || 0);
              const totalArticle = prixAchatFinal * Number(item.quantite || 0) - Number(item.remise || 0);
              const isExpSoon = item.datePeremption && new Date(item.datePeremption) < new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
              return `
                <tr>
                  <td class="product-name">${a.produit || ""}</td>
                  <td><span class="lot-number">${item.numeroLot || "N/A"}</span></td>
                  <td>${item.numeroArticle || item.codeBarre || ""}</td>
                  <td>${item.fournisseurArticle || bon.fournisseur || ""}</td>
                  <td><span class="quantity-cell">${item.quantite || 0}</span></td>
                  <td class="price-cell">${prixAchatFinal.toFixed(2)} DH</td>
                  <td class="price-cell">${Number(item.prixVente || 0).toFixed(2)} DH</td>
                  <td style="color:${isExpSoon ? "#EF4444" : "#475569"}">${item.datePeremption || ""}</td>
                  <td class="price-cell">${totalArticle.toFixed(2)} DH</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="grand-total-section">
        <div class="total-amount">${Number(total || 0).toFixed(2)} DH</div>
        <div class="print-info">Remise globale déduite : ${Number(bon.remiseGlobale || 0).toFixed(2)} DH</div>
        ${bon.isTransferred ? `<div class="print-info">Note transfert : ${bon.transferNote || ""}</div>` : ""}
      </div>
      <div class="signature-section">
        <div style="text-align:center;flex:1;max-width:${isMobileDevice ? "100%" : "200px"};margin-bottom:${isMobileDevice ? "20px" : "0"};">
          <div class="signature-area"></div>
          <div class="signature-label">✍️ Signature Fournisseur</div>
        </div>
        ${cachetHtml}
      </div>
    </div>
    <div class="footer-section">
      <div class="print-info">${titleDocument} généré le ${new Date().toLocaleDateString("fr-FR")} par ${user?.email || "Utilisateur"}</div>
      <div class="print-info">${parametres.pied || "Merci pour votre confiance !"}</div>
    </div>
  </div>
</body></html>`;
  }, [parametres, toDateSafe, user]);

  useEffect(() => {
    printImplRef.current = (bon, arts, total, cachetHtml, isMobileDevice = false) =>
      fullPrintHTML(bon, arts, total, cachetHtml, isMobileDevice);
  }, [fullPrintHTML]);

  /* ===================== Impression de la liste filtrée ===================== */
  const generateFilteredListPrintHTML = useCallback((filteredAchats, totalGeneral, isMobileDevice = false) => {
    const primaryColor = "#4F46E5"; const secondaryColor = "#06B6D4";
    const dateStr = new Date().toLocaleDateString("fr-FR");
    const filtersDescription = `
      Fournisseur: ${filterFournisseur || "Tous"} • 
      Date début: ${filterDateStart || "Aucune"} • 
      Date fin: ${filterDateEnd || "Aucune"} • 
      Paiement: ${filterStatutPaiement || "Tous"} • 
      Réception: ${filterStatutReception || "Tous"}
    `;

    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>État des Bons d'Achat Filtrés</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',Arial,sans-serif;margin:0;padding:${isMobileDevice ? "5px" : "10px"};background:#fff;color:#0F172A;font-size:${isMobileDevice ? "10px" : "12px"};line-height:1.3;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.document-container{background:#fff;max-width:100%;margin:0 auto;position:relative;min-height:${isMobileDevice ? "calc(100vh - 10px)" : "calc(100vh - 20px)"};display:flex;flex-direction:column}
.header-section{background:linear-gradient(135deg,#0B1220 0%,${primaryColor} 100%);padding:${isMobileDevice ? "15px 10px" : "20px 15px"};text-align:center}
.company-title{color:#fff;font-size:${isMobileDevice ? "1.4em" : "1.8em"};font-weight:800;margin-bottom:${isMobileDevice ? "5px" : "8px"};text-shadow:2px 2px 4px rgba(0,0,0,.3)}
.document-badge{background:rgba(255,255,255,.92);color:${primaryColor};padding:${isMobileDevice ? "4px 12px" : "6px 16px"};border-radius:20px;font-size:${isMobileDevice ? ".8em" : "1em"};font-weight:700;text-transform:uppercase}
.content-wrapper{padding:${isMobileDevice ? "15px 10px" : "20px 15px"};flex:1;overflow:auto;display:flex;flex-direction:column}
.info-section{display:grid;grid-template-columns:${isMobileDevice ? "1fr" : "1fr 1fr"};gap:${isMobileDevice ? "8px" : "12px"};margin-bottom:${isMobileDevice ? "12px" : "15px"}}
.info-card{background:linear-gradient(135deg,#F8FAFC 0%,#EFF6FF 100%);padding:${isMobileDevice ? "8px" : "12px"};border-radius:${isMobileDevice ? "6px" : "8px"};border-left:${isMobileDevice ? "2px" : "3px"} solid ${secondaryColor};box-shadow:0 2px 8px rgba(0,0,0,.05)}
.info-label{color:#475569;font-weight:700;font-size:${isMobileDevice ? ".6em" : ".7em"};text-transform:uppercase;letter-spacing:${isMobileDevice ? ".5px" : "1px"};margin-bottom:${isMobileDevice ? "3px" : "4px"}}
.info-value{color:#0F172A;font-weight:800;font-size:${isMobileDevice ? ".8em" : ".9em"};word-wrap:break-word;line-height:1.2}
.section-title{color:${secondaryColor};font-size:${isMobileDevice ? "1em" : "1.2em"};font-weight:800;margin-bottom:${isMobileDevice ? "8px" : "10px"};text-align:center;text-transform:uppercase}
.achats-table{width:100%;border-collapse:collapse;overflow:hidden;margin:${isMobileDevice ? "8px" : "10px"} 0;font-size:${isMobileDevice ? ".75em" : ".85em"}}
.achats-table thead{background:linear-gradient(135deg,#0B1220 0%,#111827 100%)}
.achats-table th{padding:${isMobileDevice ? "8px 6px" : "12px 10px"};text-align:center;color:#fff;font-weight:700;font-size:${isMobileDevice ? ".8em" : ".9em"}}
.achats-table td{padding:${isMobileDevice ? "8px 6px" : "12px 10px"};text-align:center;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:${isMobileDevice ? ".85em" : "1em"};color:#0F172A}
.grand-total-section{margin:${isMobileDevice ? "25px" : "40px"} 0;padding:${isMobileDevice ? "20px 15px" : "30px"};background:linear-gradient(135deg,${primaryColor} 0%,${secondaryColor} 100%);border-radius:${isMobileDevice ? "10px" : "20px"};color:#fff;text-align:center}
.total-amount{font-size:${isMobileDevice ? "2em" : "3em"};font-weight:900;text-shadow:2px 2px 4px rgba(0,0,0,.25)}
.footer-section{background:linear-gradient(135deg,#0B1220 0%,#111827 100%);padding:${isMobileDevice ? "10px 8px" : "12px 10px"};text-align:center;color:#fff}
.print-info{color:#A5B4FC;font-size:${isMobileDevice ? ".6em" : ".7em"};margin-top:${isMobileDevice ? "4px" : "6px"}}
@media print{
  @page{margin:.5cm;size:A4}
  body{background:#fff!important;padding:0!important;margin:0!important;font-size:11px!important}
  .achats-table th,.achats-table td{padding:6px 4px!important;font-size:8px!important;line-height:1.2!important}
}
</style>
</head>
<body>
  <div class="document-container">
    <div class="header-section">
      <div class="company-title">${parametres.entete || "PHARMACIE"}</div>
      <div class="document-badge">🗂️ État des Bons d'Achat Filtrés</div>
    </div>
    <div class="content-wrapper">
      <div class="info-section">
        <div class="info-card"><div class="info-label">📅 Date du rapport</div><div class="info-value">${dateStr}</div></div>
        <div class="info-card"><div class="info-label">🔎 Filtres appliqués</div><div class="info-value">${filtersDescription}</div></div>
      </div>
      <div class="section-title">📋 Liste des Bons</div>
      <table className="achats-table">
        <thead><tr><th>Fournisseur</th><th>Date</th><th>Paiement</th><th>Statut réception</th><th>Stock</th><th>Total</th></tr></thead>
        <tbody>
          ${filteredAchats.map((b) => `
            <tr>
              <td>${b.fournisseur}${b.isTransferred ? " 🔄" : ""}</td>
              <td>${formatDateDisplay(b.date || b.timestamp)}</td>
              <td>${b.statutPaiement}</td>
              <td>${b.statutReception || "en_attente"}</td>
              <td>${(b.stock || b.stockSource || b.magasin || b.depot || "stock1").toUpperCase()}</td>
              <td>${Number(getTotalBon(b) || 0).toFixed(2)} DH</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="grand-total-section">
        <div class="total-amount">${totalGeneral.toFixed(2)} DH</div>
        <div class="print-info">Total Général - ${filteredAchats.length} bons</div>
      </div>
    </div>
    <div class="footer-section">
      <div class="print-info">Rapport généré le ${dateStr} par ${user?.email || "Utilisateur"}</div>
      <div class="print-info">${parametres.pied || "Merci pour votre confiance !"}</div>
    </div>
  </div>
</body></html>`;
  }, [parametres, formatDateDisplay, getTotalBon, filterFournisseur, filterDateStart, filterDateEnd, filterStatutPaiement, filterStatutReception, user]);

  /* ===================== Impression orchestrée ===================== */
  function downloadPrintFile(htmlContent, titleDocument, numero) {
    try {
      const a = document.createElement("a");
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      a.href = URL.createObjectURL(blob);
      a.download = `${titleDocument.replace(/\s+/g, "_")}_${String(numero).slice(0, 8)}.html`;
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); document.body.removeChild(a);
    } catch (e) { console.error("downloadPrintFile:", e); }
  }
  function handleMobileNewWindow(htmlContent, _title, _numero) {
    try {
      const optimized = htmlContent.replace("<body>", `<body style="margin:0;padding:10px;font-size:12px;overflow:auto;height:auto;">`);
      const w = window.open("", "_blank", "width=device-width,height=device-height,scrollbars=yes,resizable=yes");
      if (w) {
        w.document.open(); w.document.write(optimized); w.document.close();
        w.onload = () => {
          const meta = w.document.createElement("meta");
          meta.setAttribute("name", "viewport");
          meta.setAttribute("content", "width=device-width, initial-scale=1.0, user-scalable=yes");
          w.document.head.appendChild(meta);
        };
        const btn = w.document.createElement("div");
        btn.innerHTML = `
          <div style="position:fixed;bottom:20px;right:20px;background:#4F46E5;color:#fff;padding:15px 25px;border-radius:25px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:9999;font-weight:bold;text-align:center;font-size:16px" onclick="window.print()">🖨️ Imprimer</div>
          <div style="position:fixed;bottom:80px;right:20px;background:#06B6D4;color:#fff;padding:10px 20px;border-radius:20px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:9999;font-weight:bold;text-align:center;font-size:14px" onclick="window.close()">✖️ Fermer</div>`;
        w.document.body.appendChild(btn);
        downloadPrintFile(htmlContent, _title, _numero);}
    } catch (e) { console.error("handleMobileNewWindow:", e); downloadPrintFile(htmlContent, _title, _numero); }
  }
  function showMobileDownloadOption(htmlContent, titleDocument, numero) {
    const modal = document.createElement("div");
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;";
    modal.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:30px;max-width:90%;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.3);">
        <h3 style="color:#0F172A;margin-bottom:20px;font-size:1.2em;">📱 Options d'impression mobile</h3>
        <p style="color:#475569;margin-bottom:25px;line-height:1.4;">Choisissez votre méthode d'impression :</p>
        <button id="mp_download" style="background:linear-gradient(135deg,#4F46E5 0%,#06B6D4 100%);color:#fff;border:none;padding:15px 25px;border-radius:15px;font-weight:bold;margin:10px;width:80%;font-size:1em;cursor:pointer;">💾 Télécharger</button>
        <button id="mp_newtab" style="background:linear-gradient(135deg,#06B6D4 0%,#67E8F9 100%);color:#0C4A6E;border:none;padding:15px 25px;border-radius:15px;font-weight:bold;margin:10px;width:80%;font-size:1em;cursor:pointer;">🌐 Ouvrir dans un onglet</button>
        <button id="mp_close" style="background:#E2E8F0;color:#0F172A;border:none;padding:10px 20px;border-radius:10px;font-weight:bold;margin-top:15px;cursor:pointer;">❌ Annuler</button>
      </div>`;
    document.body.appendChild(modal);
    const cleanup = () => { try { document.body.removeChild(modal); } catch {} };
    modal.querySelector("#mp_download")?.addEventListener("click", () => { downloadPrintFile(htmlContent, titleDocument, numero); cleanup(); });
    modal.querySelector("#mp_newtab")?.addEventListener("click", () => { handleMobileNewWindow(htmlContent, titleDocument, numero); cleanup(); });
    modal.querySelector("#mp_close")?.addEventListener("click", cleanup);
  }
  function handleDesktopPrint(htmlContent, _title, _numero) {
    try {
      const w = window.open("", "_blank", "width=900,height=700,scrollbars=yes,resizable=yes");
      if (w && w.document) {
        let closed = false;
        const safeClose = () => { if (!closed && w && !w.closed) { closed = true; try { w.close(); } catch {} } };
        w.document.open(); w.document.write(htmlContent); w.document.close();
        setTimeout(() => { try { if (!closed && w && !w.closed) { w.focus(); w.print(); setTimeout(safeClose, 800); } } catch { safeClose(); } }, 400);
        setTimeout(safeClose, 5000);
        showNotification("Popups bloquées - Téléchargement du document…", "info");
        downloadPrintFile(htmlContent, _title, _numero);
      }
    } catch (e) { console.error("handleDesktopPrint:", e); downloadPrintFile(htmlContent, _title, _numero); }
  }
  function handleMobilePrint(htmlContent, titleDocument, numero) {
    try {
      const agent = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(agent);
      const isAndroid = /android/.test(agent);
      const mobileOptimized = htmlContent
        .replace(/height: calc\(100vh[^)]*\)/g, "height: auto")
        .replace(/min-height: calc\(100vh[^)]*\)/g, "min-height: auto");
      if (isIOS || isAndroid) {
        showMobileDownloadOption(mobileOptimized, titleDocument, numero);
        handleMobileNewWindow(mobileOptimized, titleDocument, numero);
      }
    } catch (e) { console.error("handleMobilePrint:", e); downloadPrintFile(htmlContent, titleDocument, numero); }
  }
  const handlePrintBon = useCallback((bon) => {
    try {
      const articlesToPrint = (bon.articles || []).map((a) => ({ produit: a.produit, ...(a.recu || a.commandee || {}) }));
      const totalArticles = articlesToPrint.reduce(
        (sum, a) => sum + ((a.prixUnitaire || a.prixAchat || 0) * (a.quantite || 0) - (a.remise || 0)),
        0
      );
      const total = totalArticles - (Number(bon.remiseGlobale) || 0);
      const cachetHtml = generateCachetHtml();
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      const htmlContent = generatePrintHTML(bon, articlesToPrint, total, cachetHtml, isMobileDevice);
      
      let title = "Bon de Commande";
      if (bon.statutReception !== "en_attente") title = "Bon de Réception";
      if (bon.isTransferred) title = "Bon de Transfert";
      
      if (isMobileDevice) {
        handleMobilePrint(htmlContent, title, bon.id);
      } else {
        handleDesktopPrint(htmlContent, title, bon.id);
      }
      showNotification(`Document prêt ${isMobileDevice ? "(mobile)" : "(desktop)"}`, "success");
    } catch (e) {
      console.error("handlePrintBon:", e);
      showNotification("Erreur lors de la préparation d'impression", "error");
    }
  }, [generateCachetHtml, generatePrintHTML, showNotification]);

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

  /* ===================== Calcul total des bons ===================== */
  const totalGeneral = React.useMemo(() => {
    return filteredAchats.reduce((sum, bon) => sum + getTotalBon(bon), 0);
  }, [filteredAchats, getTotalBon]);

  /* ===================== Impression de la liste filtrée ===================== */
  const handlePrintFilteredList = useCallback(() => {
    try {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      const htmlContent = generateFilteredListPrintHTML(filteredAchats, totalGeneral, isMobileDevice);
      const title = "Etat_Bons_Filtres";
      
      if (isMobileDevice) {
        handleMobilePrint(htmlContent, title, Date.now());
      } else {
        handleDesktopPrint(htmlContent, title, Date.now());
      }
      showNotification(`Impression de l'état filtré prête ${isMobileDevice ? "(mobile)" : "(desktop)"}`, "success");
    } catch (e) {
      console.error("handlePrintFilteredList:", e);
      showNotification("Erreur lors de la préparation d'impression de la liste", "error");
    }
  }, [generateFilteredListPrintHTML, filteredAchats, totalGeneral, showNotification]);

  /* ===================== Rendu ===================== */
  if (waiting) {
    return (
      <div className="achats-page" style={{ padding: 16 }}>
        <div className="card" style={{ background: "linear-gradient(135deg,#EEF2FF,#FFFFFF)" }}>Chargement des données…</div>
      </div>
    );
  }

  return (
    <div className="achats-page" style={{ padding: 16, background: "var(--bg)" }}>
      {/* En-tête */}
      <div className="page-header">
        <h1>Gestion des Achats</h1>
        <div className="page-sub">Commandes, réceptions, transferts & traçabilité</div>
      </div>

      {/* Notifications */}
      {notification && <div className={`notice ${notification.type || "success"}`}>{notification.message}</div>}

      {/* Formulaire nouveau / modifier bon — REPLIABLE */}
      <div className="card">
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>{isEditing ? "Modifier un Bon d'Achat" : "Nouveau Bon d'Achat"}</span>
          <div className="controls-bar">
            <button className="btn btn-outline" onClick={() => setShowCreateForm((s) => !s)} aria-expanded={showCreateForm} aria-controls="create-form-panel" title="Afficher / masquer le formulaire">
              {showCreateForm ? "🔽 Masquer" : "🧾 Formulaire"}
            </button>
            {articles.length > 0 && <span className="filters-badge" title="Articles saisis">{articles.length} article{articles.length > 1 ? "s" : ""}</span>}
          </div>
        </div>

        <div id="create-form-panel" className={`form-panel ${showCreateForm ? "form-shown" : "form-hidden"}`} aria-hidden={!showCreateForm}>
          <div className="form-panel-inner">
            <div className="form-grid">
              <input className="field" placeholder="Fournisseur" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
              <input className="field" type="date" value={dateAchat} onChange={(e) => setDateAchat(e.target.value)} />
              <select className="select" value={statutPaiement} onChange={(e) => setStatutPaiement(e.target.value)}>
                <option value="payé">payé</option><option value="partiel">partiel</option><option value="impayé">impayé</option>
              </select>
              <select className="select" value={stockChoice} onChange={(e) => setStockChoice(e.target.value)} title="Stock cible du bon">
                <option value="stock1">Stock 1</option><option value="stock2">Stock 2</option>
              </select>
              <input className="field" type="number" step="0.01" placeholder="Remise globale (DH)" value={remiseGlobale} onChange={(e) => setRemiseGlobale(e.target.value)} />
            </div>

            <hr style={{ margin: "12px 0", borderColor: "var(--border)" }} />

            {/* Ligne d'article */}
            <div className="article-grid">
              <input className="field" placeholder="Produit (ou choisir)" value={produit} onChange={(e) => handleProduitChange(e.target.value)} list="meds" />
              <datalist id="meds">
                {medicaments.map((m) => (<option key={m.nom} value={m.nom} />))}
                <option value="_new_">-- Nouveau produit --</option>
              </datalist>
              <input className="field" placeholder="Nouveau produit (si _new_)" value={produitNouveau} onChange={(e) => setProduitNouveau(e.target.value)} />
              <input className="field" type="number" min="1" placeholder="Quantité" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
              <input className="field" type="number" step="0.01" placeholder="Prix Achat" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} />
              <input className="field" type="number" step="0.01" placeholder="Prix Vente" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} />
              <input className="field" type="date" value={datePeremption} onChange={(e) => setDatePeremption(e.target.value)} />
              <input className="field" placeholder="N° Lot" value={numeroLot} onChange={(e) => setNumeroLot(e.target.value)} />
              <input className="field" placeholder="N° article (code-barres)" value={numeroArticle} onChange={(e) => setNumeroArticle(e.target.value)} />
              <input className="field" placeholder="Fournisseur article" value={fournisseurArticle} onChange={(e) => setFournisseurArticle(e.target.value)} />
              <input className="field" type="number" step="0.01" placeholder="Remise article (DH)" value={remiseArticle} onChange={(e) => setRemiseArticle(e.target.value)} />

              <div style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "span 2" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowScanner(true)}>📷 Scanner avec caméra</button>
                <CameraBarcodeInlineModal
                  open={showScanner}
                  onClose={() => setShowScanner(false)}
                  onDetected={(code) => { onBarcodeDetected(code); setShowScanner(false); }}
                />
                <button className="btn btn-primary" onClick={handleAddArticle}>➕ Ajouter</button>
              </div>
            </div>

            {/* Liste des articles ajoutés */}
            {articles.length > 0 && (
              <div className="table-scroll" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="left">Produit</th><th>Lot</th><th>Code</th><th>Qté</th><th>PA</th><th>PV</th><th>Exp.</th><th>Remise</th><th>Stock</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((a, i) => (
                      <tr key={i}>
                        <td className="left">{a.produit}</td>
                        <td><span className="chip">{a.commandee?.numeroLot || ""}</span></td>
                        <td>{a.commandee?.numeroArticle || a.commandee?.codeBarre || ""}</td>
                        <td><span className="qty">{a.commandee?.quantite || 0}</span></td>
                        <td>{Number(a.commandee?.prixUnitaire || a.commandee?.prixAchat || 0).toFixed(2)}</td>
                        <td>{Number(a.commandee?.prixVente || 0).toFixed(2)}</td>
                        <td>{a.commandee?.datePeremption || ""}</td>
                        <td>{Number(a.commandee?.remise || 0).toFixed(2)}</td>
                        <td>{(a.commandee?.stock || stockChoice).toUpperCase()}</td>
                        <td><button className="btn btn-outline" onClick={() => handleRemoveArticle(i)}>Supprimer</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={handleAddBon} disabled={isLoading}>
                {isEditing ? "💾 Enregistrer les modifications" : "💾 Enregistrer le bon"}
              </button>
              <button className="btn btn-outline" onClick={resetForm} disabled={isLoading}>♻️ Réinitialiser</button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Transfert Stock1 → Stock2 (Nouveau Bon) ===== */}
      <div className="card" style={{ borderColor: "#D1FAE5" }}>
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>Transfert mensuel — Stock1 → Stock2 (Nouveau Bon)</span>
          <div className="controls-bar">
            <button className="btn btn-outline" onClick={() => setShowTransfer((s) => !s)}>
              {showTransfer ? "🔽 Fermer" : "🔄 Ouvrir le transfert"}
            </button>
          </div>
        </div>

        {showTransfer && (
          <div className="form-panel form-shown">
            <div className="form-panel-inner">
              <div className="notice warning" style={{ marginBottom: 12 }}>
                Le transfert créera un nouveau bon d'achat (Stock2) et diminuera les quantités du bon original. Le nouvel état de paiement est reproduit. Fonctionne pour les réceptions complètes ET partielles.
              </div>
              
              <div className="form-grid">
                <select className="select" value={transferBonId} onChange={(e) => { setTransferBonId(e.target.value); setTransferArticleIndex(""); }}>
                  <option value="">— Choisir un bon reçu (total ou partiel) —</option>
                  {transferEligibleBons.map((bon) => (
                    <option key={bon.id} value={bon.id}>
                      {bon.fournisseur} - {formatDateDisplay(bon.date)} (#{bon.id.slice(0, 8)}) [{bon.statutReception}]
                    </option>
                  ))}
                </select>

                <select className="select" value={transferArticleIndex} onChange={(e) => setTransferArticleIndex(e.target.value)} disabled={!transferBonId} title="Choisir l'article à transférer">
                  <option value="">— Choisir un article —</option>
                  {transferArticles.map((article, index) => (
                    <option key={index} value={index}>
                      {article.produit} • Lot: {article.recu?.numeroLot || "N/A"} • Qté: {article.recu?.quantite || 0}
                    </option>
                  ))}
                </select>

                <input 
                  className="field" 
                  type="number" 
                  min="1" 
                  placeholder={`Quantité à transférer (≤ ${transferArticleIndex !== "" ? (transferArticles[Number(transferArticleIndex)]?.recu?.quantite || 0) : 0})`} 
                  value={transferQty} 
                  onChange={(e) => setTransferQty(e.target.value)} 
                  disabled={transferArticleIndex === ""} 
                />
                
                <input className="field" placeholder="Note du transfert (optionnel)" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} />

                <button className="btn btn-success" onClick={handleTransfer} disabled={!transferBonId || transferArticleIndex === "" || !transferQty || isLoading}>
                  🔄 Créer bon transfert Stock2
                </button>
                
                <button className="btn btn-outline" onClick={resetTransferForm} disabled={isLoading}>♻️ Réinitialiser</button>
              </div>
              
              {transferBonId && transferArticleIndex !== "" && (
                <div style={{ marginTop: 8, color: "#065F46" }}>
                  Article sélectionné: <strong>{transferArticles[Number(transferArticleIndex)]?.produit}</strong> • 
                  Lot: <strong>{transferArticles[Number(transferArticleIndex)]?.recu?.numeroLot || "N/A"}</strong> • 
                  Qté disponible: <strong>{transferArticles[Number(transferArticleIndex)]?.recu?.quantite || 0}</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ÉDITEUR DE RÉCEPTION */}
      {receptionId && (
        <div className="card" style={{ borderColor: "#BFDBFE" }}>
          <h3 className="section-title">Réception du bon #{String(receptionId).slice(0, 8).toUpperCase()}</h3>
          <div style={{ color: "#0F172A", opacity: 0.8, marginBottom: 12 }}>
            Ajustez les quantités reçues (≤ commandées), prix, dates, lots, code-barres puis confirmez.
          </div>

          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="left">Produit</th><th>Qté Cmd</th><th>Qté Reçue</th><th>PA</th><th>PV</th><th>Remise</th>
                  <th>Exp.</th><th>Lot</th><th>Code</th><th>Fournisseur</th><th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {receptionArticles.map((a, idx) => (
                  <tr key={idx}>
                    <td className="left">{a.produit}</td>
                    <td>{a.commandee?.quantite || 0}</td>
                    <td><input className="field" type="number" min="0" max={a.commandee?.quantite || 0} value={a.recu?.quantite ?? 0} onChange={(e) => handleUpdateReceptionArticle(idx, "quantite", e.target.value)} style={{ width: 120 }} /></td>
                    <td><input className="field" type="number" step="0.01" value={a.recu?.prixUnitaire ?? a.recu?.prixAchat ?? 0} onChange={(e) => handleUpdateReceptionArticle(idx, "prixUnitaire", e.target.value)} style={{ width: 140 }} /></td>
                    <td><input className="field" type="number" step="0.01" value={a.recu?.prixVente ?? 0} onChange={(e) => handleUpdateReceptionArticle(idx, "prixVente", e.target.value)} style={{ width: 140 }} /></td>
                    <td><input className="field" type="number" step="0.01" value={a.recu?.remise ?? 0} onChange={(e) => handleUpdateReceptionArticle(idx, "remise", e.target.value)} style={{ width: 140 }} /></td>
                    <td><input className="field" type="date" value={a.recu?.datePeremption || ""} onChange={(e) => handleUpdateReceptionArticle(idx, "datePeremption", e.target.value)} style={{ width: 160 }} /></td>
                    <td><input className="field" value={a.recu?.numeroLot || ""} onChange={(e) => handleUpdateReceptionArticle(idx, "numeroLot", e.target.value)} style={{ width: 160 }} /></td>
                    <td><input className="field" value={a.recu?.numeroArticle || a.commandee?.numeroArticle || ""} onChange={(e) => handleUpdateReceptionArticle(idx, "numeroArticle", e.target.value)} style={{ width: 160 }} /></td>
                    <td><input className="field" value={a.recu?.fournisseurArticle || a.commandee?.fournisseurArticle || ""} onChange={(e) => handleUpdateReceptionArticle(idx, "fournisseurArticle", e.target.value)} style={{ width: 200 }} /></td>
                    <td>{(a.recu?.stock || stockChoice).toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-success" onClick={handleSubmitReception} disabled={isLoading}>✅ Confirmer la réception</button>
            <button className="btn btn-outline" onClick={handleCancelReception} disabled={isLoading}>❌ Annuler</button>
          </div>
        </div>
      )}

      {/* Liste des bons */}
      <div className="card">
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>Bons d'Achat</span>
          <div className="controls-bar">
            <button className="btn btn-outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="filters-panel" title="Afficher / masquer les filtres">
              {showFilters ? "🔽 Masquer" : "🔎 Filtres"}
            </button>
            {activeFiltersCount > 0 && <span className="filters-badge" title="Filtres actifs">{activeFiltersCount} actif{activeFiltersCount > 1 ? "s" : ""}</span>}
            <button className="btn btn-primary" onClick={handlePrintFilteredList} title="Imprimer l'état filtré">🖨️ Imprimer liste filtrée</button>
          </div>
        </div>

        <div id="filters-panel" className={`filters-panel ${showFilters ? "filters-shown" : "filters-hidden"}`} aria-hidden={!showFilters}>
          <div className="filters-panel-inner">
            <div className="form-grid" style={{ marginBottom: 8 }}>
              <input className="field" placeholder="Filtrer par Fournisseur" value={filterFournisseur} onChange={(e) => setFilterFournisseur(e.target.value)} />
              <input className="field" type="date" placeholder="Date début" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} />
              <input className="field" type="date" placeholder="Date fin" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} />
              <select className="select" value={filterStatutPaiement} onChange={(e) => setFilterStatutPaiement(e.target.value)}>
                <option value="">Tous paiements</option><option value="payé">Payé</option><option value="partiel">Partiel</option><option value="impayé">Impayé</option>
              </select>
              <select className="select" value={filterStatutReception} onChange={(e) => setFilterStatutReception(e.target.value)}>
                <option value="">Tous statuts réception</option><option value="en_attente">En attente</option><option value="partiel">Partiel</option><option value="reçu">Reçu</option><option value="annulé">Annulé</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-outline" onClick={resetFilters}>♻️ Réinitialiser les filtres</button>
              {activeFiltersCount > 0 && <div className="filters-badge">{filteredAchats.length} résultat{filteredAchats.length > 1 ? "s" : ""}</div>}
            </div>
          </div>
        </div>

        {filteredAchats.length === 0 ? (
          <div style={{ color: "var(--muted)", marginTop: 8 }}>Aucun bon correspondant {activeFiltersCount ? "aux filtres." : "aux critères."}</div>
        ) : (
          <>
            <div className="table-scroll" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th className="left">Fournisseur</th><th>Date</th><th>Paiement</th><th>Statut réception</th><th>Stock</th><th>Total</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAchats.map((b) => (
                    <tr key={b.id} className={b.isTransferred ? "bon-transfere" : (b.originalBonId ? "bon-original" : "")}>
                      <td className="left">
                        {/* Fournisseur + badge transfert + lien (supprimer) inline si TRANSFERT STOCK */}
                        {b.fournisseur}
                        {b.isTransferred && <span style={{ fontSize: "11px", color: "#06B6D4", marginLeft: 4 }}>🔄</span>}
                        {b.isTransferred && (
                          <button
                            className="inline-delete"
                            title="Supprimer ce bon de transfert"
                            onClick={() => handleDeleteBon(b)}
                          >
                            (supprimer)
                          </button>
                        )}
                      </td>
                      <td>{formatDateDisplay(b.date || b.timestamp)}</td>
                      <td>{b.statutPaiement}</td>
                      <td>{b.statutReception || "en_attente"}</td>
                      <td>{(b.stock || b.stockSource || b.magasin || b.depot || "stock1").toUpperCase()}</td>
                      <td>{Number(getTotalBon(b) || 0).toFixed(2)} DH</td>
                      <td style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                        <button className="btn btn-primary" onClick={() => handlePrintBon(b)}>🖨️ Imprimer</button>
                        {b.statutReception === "en_attente" && !b.isTransferred && (
                          <>
                            <button className="btn btn-outline" onClick={() => handleStartReception(b)}>📥 Réception</button>
                            <button className="btn btn-outline" onClick={() => handleEditBon(b)}>✏️ Modifier</button>
                          </>
                        )}
                        {!b.isTransferred && (
                          <button className="btn btn-danger" onClick={() => handleDeleteBon(b)}>🗑️ Supprimer</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="table-total">
                    <td colSpan="5" style={{ textAlign: "right", padding: "16px 12px" }}>
                      <strong>TOTAL GÉNÉRAL :</strong>
                    </td>
                    <td style={{ padding: "16px 12px" }}>
                      <strong>{totalGeneral.toFixed(2)} DH</strong>
                    </td>
                    <td style={{ padding: "16px 12px" }}>
                      <span style={{ fontSize: "12px" }}>{filteredAchats.length} bon{filteredAchats.length > 1 ? "s" : ""}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ===================== Caméra / lecteur code-barres inline ===================== */
function CameraBarcodeInlineModal({ open, onClose, onDetected }) {
  const videoRef = React.useRef(null);
  const [active, setActive] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let stream;
    let stopRequested = false;
    let rafId = null;
    let reader = null;
    let controls = null;

    const requestFrame = (cb) => (window.requestAnimationFrame ? window.requestAnimationFrame(cb) : setTimeout(cb, 80));
    const cancelFrame = (id) => (window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id));

    async function start() {
      setError("");
      try {
        if (!open) return;
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Caméra non supportée dans ce navigateur");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setActive(true);

        if ("BarcodeDetector" in window) {
          const supported =
            typeof window.BarcodeDetector.getSupportedFormats === "function"
              ? await window.BarcodeDetector.getSupportedFormats()
              : ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"];
          const detector = new window.BarcodeDetector({
            formats: supported && supported.length ? supported : ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"],
          });

          const scan = async () => {
            if (!open || stopRequested) return;
            try {
              const track = stream?.getVideoTracks?.()[0];
              if (!track) { rafId = requestFrame(scan); return; }
              let bitmap;
              if (window.ImageCapture) {
                const imageCapture = new ImageCapture(track);
                bitmap = await imageCapture.grabFrame();
              } else {
                const canvas = document.createElement("canvas");
                const settings = track.getSettings?.() || {};
                const w = settings.width || videoRef.current?.videoWidth || 640;
                const h = settings.height || videoRef.current?.videoHeight || 480;
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(videoRef.current, 0, 0, w, h);
                bitmap = await createImageBitmap(canvas);
              }
              const codes = await detector.detect(bitmap);
              if (codes && codes[0]?.rawValue) {
                onDetected?.(codes[0].rawValue);
              } else {
                rafId = requestFrame(scan);
              }
            } catch {
              rafId = requestFrame(scan);
            }
          };
          rafId = requestFrame(scan);
        } else {
          try {
            const lib = await import(/* webpackChunkName: "zxing" */ "@zxing/browser");
            const { BrowserMultiFormatReader } = lib;
            reader = new BrowserMultiFormatReader();
            controls = await reader.decodeFromVideoDevice(null, videoRef.current, (result) => {
              if (result?.getText) onDetected?.(result.getText());
            });
          } catch (e) {
            setError("ZXing non installé. Lance: npm i @zxing/browser");
          }
        }
      } catch (e) {
        console.error(e);
        setError(e.message || "Caméra indisponible");
      }
    }
    if (open) start();

    return () => {
      stopRequested = true;
      try { if (rafId) cancelFrame(rafId); } catch {}
      try { controls?.stop?.(); } catch {}
      try { reader?.reset?.(); } catch {}
      try { (stream?.getTracks?.() || []).forEach((t) => t.stop()); } catch {}
      setActive(false);
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 9999, padding: 16 }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "min(100%, 720px)", padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,.2)", position: "relative" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Scanner un code-barres</h3>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", borderRadius: 8, padding: "6px 10px", background: "#111827", color: "#fff", cursor: "pointer" }}>
            Fermer
          </button>
        </div>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: "15% 10%", border: "3px solid rgba(255,255,255,.8)", borderRadius: 12, boxShadow: "0 0 20px rgba(0,0,0,.5) inset" }} />
        </div>
        {error ? (
          <p style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : (
          <p style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>Astuce : place le code bien à plat et évite les reflets.</p>
        )}
      </div>
    </div>
  );
}

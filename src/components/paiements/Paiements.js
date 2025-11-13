// src/components/paiements/Paiements.js
// Version enrichie avec Charges + TOTAUX + LIEN VENTES + modePaiement normalisé
// 🚀 AJOUT DU MODE SOMBRE / CLAIR

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

/* ================= Utils ================= */
const toDateSafe = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "object" && typeof v?.seconds === "number")
    return new Date(v.seconds * 1000);
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const pad2 = (n) => String(n).padStart(2, "0");

/** Pour affichage date seule */
const formatDate = (v, locale = "fr-FR") => {
  const d = toDateSafe(v);
  return d ? d.toLocaleDateString(locale) : "—";
};

/** Pour affichage date + heure */
const formatDateTime = (v, locale = "fr-FR") => {
  const d = toDateSafe(v);
  return d
    ? `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "—";
};

/** Alimente <input type="date"> */
const getDateInputValue = (timestamp) => {
  const d = toDateSafe(timestamp);
  if (!d) return "";
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
};

/** Alimente <input type="datetime-local"> (préserve l'heure) */
const getDateTimeInputValue = (timestamp) => {
  const d = toDateSafe(timestamp);
  if (!d) return "";
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
};

/** Parse un string "YYYY-MM-DDTHH:mm" en Date locale (sans décalage UTC) */
const parseLocalDateTime = (value) => {
  if (!value) return null;
  const [date, time = "00:00"] = value.split("T");
  const [y, m, d] = (date || "").split("-").map((x) => Number(x));
  const [hh, mm] = (time || "").split(":").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(y, (m || 1) - 1, d, hh || 0, mm || 0, 0, 0);
};

const fmtDH = (n) => `${(Number(n) || 0).toFixed(2)} DHS`;
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const isModeWanted = (mode, wanted) => {
  if (!wanted || wanted === "all") return true;
  const m = norm(mode);
  const w = norm(wanted);
  if (w === "cheque" || w === "chèque") return m === "cheque" || m === "chèque";
  if (w === "especes" || w === "espèces") return m === "especes" || m === "espèces";
  return m === w;
};

const labelInstruments = (list = []) => {
  const n = Array.isArray(list) ? list.length : 0;
  if (n === 0) return "Aucun — à compléter";
  const kinds = new Set(
    list.map((x) => (norm(x?.type) === "traite" ? "traite" : "chèque"))
  );
  if (kinds.size === 1) {
    const t = [...kinds][0];
    return `${n} ${t}${n > 1 ? "s" : ""}`;
  }
  return `${n} chèques/traites`;
};

const getModeIcon = (mode) => {
  const m = norm(mode);
  if (m === "especes" || m === "espèces") return "💵";
  if (m === "cheque" || m === "chèque") return "🏦";
  if (m === "traite") return "📝";
  if (m === "virement bancaire" || m === "virement") return "🏧";
  if (m === "carte bancaire" || m === "carte") return "💳";
  if (m === "prelevement" || m === "prélèvement") return "🔄";
  return "💳";
};

const getModeColor = (mode) => {
  const m = norm(mode);
  if (m === "especes" || m === "espèces") return "#10b981";
  if (m === "cheque" || m === "chèque") return "#3b82f6";
  if (m === "traite") return "#8b5cf6";
  if (m === "virement bancaire" || m === "virement") return "#f59e0b";
  if (m === "carte bancaire" || m === "carte") return "#ec4899";
  if (m === "prelevement" || m === "prélèvement") return "#14b8a6";
  return "#6b7280";
};

/** ⭐ Normalisation forte des modes (étiquette + clé canonique) */
function normalizeMode(label) {
  const m = norm(label);
  if (m === "especes" || m === "espèces") return { label: "Espèces", key: "espece" };
  if (m === "cheque" || m === "chèque") return { label: "Chèque", key: "cheque" };
  if (m === "traite") return { label: "Traite", key: "traite" };
  // fallback:
  return { label: label || "Espèces", key: m || "espece" };
}

/* ================= 🆕 VALIDATION DES ACHATS ================= */
function isValidAchat(achat) {
  if (!achat || !achat.id || typeof achat.id !== "string") return false;
  const statut = norm(
    achat?.statut || achat?.status || achat?.etat || achat?.statutReception || ""
  );
  const statutsInvalides = [
    "supprime",
    "supprimé",
    "deleted",
    "removed",
    "annule",
    "annulé",
    "cancelled",
    "canceled",
    "inactif",
    "inactive",
    "archived",
    "archive",
  ];
  if (statutsInvalides.includes(statut)) return false;

  const suppressionFlags = [
    achat.deleted,
    achat.isDeleted,
    achat.supprime,
    achat.supprimé,
    achat.removed,
    achat.isRemoved,
    achat.archived,
    achat.isArchived,
    achat.active === false,
    achat.actif === false,
  ];
  if (suppressionFlags.some((f) => f === true)) return false;

  if (!Array.isArray(achat.articles) || achat.articles.length === 0) return false;

  const hasValidArticle = achat.articles.some((a) => {
    const base = a?.recu || a?.commandee || a || {};
    const q = Number(base?.quantite || 0);
    const pu = Number(base?.prixUnitaire || base?.prixAchat || 0);
    return q > 0 && pu > 0;
  });

  return !!hasValidArticle;
}

/* ================= Styles (injection) ================= */
// 🚀 MISE À JOUR POUR MODE SOMBRE / CLAIR
const useInjectStyles = () => {
  useEffect(() => {
    if (document.getElementById("paie-styles")) return;
    const style = document.createElement("style");
    style.id = "paie-styles";
    style.textContent = `
      :root, html[data-theme='light'] {
        /* Couleurs de base */
        --p: #6366f1;
        --p-light: #c7d2fe;
        --p2: #8b5cf6;
        --bg: #f8fafc;
        --card: #ffffff;
        --border: #e5e7eb;
        --text: #111827;
        --text-soft: #6b7280;
        --text-on-primary: #ffffff;
        
        /* Sémantique */
        --success: #10b981;
        --success-text: #ffffff;
        --warn: #f59e0b;
        --warn-text: #ffffff;
        --danger: #ef4444;
        --danger-text: #ffffff;
        --secondary: #6b7280;
        --secondary-text: #ffffff;
        
        /* Notices */
        --notice-success-bg: #dcfce7;
        --notice-success-text: #065f46;
        --notice-error-bg: #fee2e2;
        --notice-error-text: #7f1d1d;
        --notice-warning-bg: #fef3c7;
        --notice-warning-text: #92400e;
        --notice-info-bg: #dbeafe;
        --notice-info-text: #1e40af;

        /* Composants */
        --input-bg: #ffffff;
        --input-focus-border: var(--p);
        --input-focus-shadow: rgba(99, 102, 241, 0.1);
        --table-header-bg: linear-gradient(135deg, #f8fafc, #eef2ff);
        --table-header-text: #111827;
        --table-row-text: #0f172a;
        --table-row-bg-hover: #eef2ff;
        --table-footer-bg: #f8fafc;
        --subcard-bg: #f8fafc;
        --modal-overlay-bg: rgba(0, 0, 0, 0.5);
        --modal-content-bg: #ffffff;
        --modal-close-hover-bg: #f3f4f6;
        --modal-close-hover-text: #1f2937;
        --chip-bg: #eef2ff;
        --chip-text: var(--p);
      }
      
      html[data-theme='dark'] {
        /* Couleurs de base */
        --p: #6366f1;
        --p-light: #4f46e5;
        --p2: #8b5cf6;
        --bg: #111827;
        --card: #1f2937;
        --border: #374151;
        --text: #f3f4f6;
        --text-soft: #9ca3af;
        --text-on-primary: #ffffff;

        /* Sémantique (les couleurs restent vives) */
        --success: #10b981;
        --success-text: #ffffff;
        --warn: #f59e0b;
        --warn-text: #ffffff;
        --danger: #ef4444;
        --danger-text: #ffffff;
        --secondary: #6b7280;
        --secondary-text: #ffffff;
        
        /* Notices (inversées) */
        --notice-success-bg: #065f46;
        --notice-success-text: #dcfce7;
        --notice-error-bg: #7f1d1d;
        --notice-error-text: #fee2e2;
        --notice-warning-bg: #92400e;
        --notice-warning-text: #fef3c7;
        --notice-info-bg: #1e40af;
        --notice-info-text: #dbeafe;
        
        /* Composants */
        --input-bg: #374151;
        --input-focus-border: var(--p);
        --input-focus-shadow: rgba(99, 102, 241, 0.2);
        --table-header-bg: linear-gradient(135deg, #1f2937, #374151);
        --table-header-text: #f3f4f6;
        --table-row-text: #e5e7eb;
        --table-row-bg-hover: #374151;
        --table-footer-bg: #1f2937;
        --subcard-bg: #1f2937;
        --modal-overlay-bg: rgba(0, 0, 0, 0.7);
        --modal-content-bg: #1f2937;
        --modal-close-hover-bg: #4b5563;
        --modal-close-hover-text: #f3f4f6;
        --chip-bg: rgba(99, 102, 241, 0.2);
        --chip-text: #a5b4fc;
      }
      
      body {
        background: var(--bg);
        color: var(--text);
        transition: background 0.2s, color 0.2s;
      }
      .paie-wrap{ max-width:1280px; margin:0 auto; padding:16px; }
      .hdr{ 
        display:flex; 
        justify-content:space-between; 
        align-items:flex-start;
        background:linear-gradient(135deg,var(--p),var(--p2)); 
        color:var(--text-on-primary); 
        border-radius:16px; 
        padding:16px; 
        margin-bottom:16px; 
        box-shadow:0 12px 30px rgba(99,102,241,.25); 
      }
      .theme-toggle {
        background: rgba(255,255,255,0.2);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.3);
        font-size: 18px;
        width: 44px;
        height: 44px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .theme-toggle:hover {
        background: rgba(255,255,255,0.3);
        box-shadow: none;
        transform: translateY(0);
      }
      .card{ background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; box-shadow:0 6px 20px rgba(99,102,241,.06); }
      .controls{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .btn{ padding:8px 12px; border-radius:10px; border:1px solid var(--border); cursor:pointer; font-weight:700; transition:all 0.2s ease; background: var(--card); color: var(--text); }
      .btn:hover{ transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.1); }
      
      .btn.on{ background:var(--success); color:var(--success-text); border-color:var(--success); }
      .btn.primary{ background:linear-gradient(135deg,var(--p),var(--p2)); color:var(--text-on-primary); border:0; }
      .btn.warn{ background:var(--warn); color:var(--warn-text); border:0; }
      .btn.danger{ background:var(--danger); color:var(--danger-text); border:0; }
      .btn.secondary{ background:var(--secondary); color:var(--secondary-text); border:0; }
      
      .select,.field,.form-input{ padding:8px 10px; border-radius:10px; border:1px solid var(--border); background:var(--input-bg); color: var(--text); }
      
      .notice{ border-radius:12px; padding:12px; font-weight:600; margin-bottom:12px; }
      .notice.success{ background:var(--notice-success-bg); color:var(--notice-success-text); }
      .notice.error{ background:var(--notice-error-bg); color:var(--notice-error-text); }
      .notice.warning{ background:var(--notice-warning-bg); color:var(--notice-warning-text); }
      
      .tbl-wrap{ width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid var(--border); border-radius:12px; background:var(--card); }
      table.tbl{ width:100%; min-width:1100px; border-collapse:collapse; }
      .tbl thead th{ position:sticky; top:0; background:var(--table-header-bg); color:var(--table-header-text); font-weight:800; font-size:12px; letter-spacing:.5px; border-bottom:1px solid var(--border); padding:10px; text-align:center; z-index:1; }
      .tbl tbody tr { background: var(--card); }
      .tbl tbody tr.expanded-row { background: var(--table-row-bg-hover); }
      .tbl tbody td{ padding:10px; border-bottom:1px solid var(--border); text-align:center; color:var(--table-row-text); font-weight:600; }
      .tbl tbody td.expanded-content { padding: 0; background: var(--subcard-bg); }
      
      .left{text-align:left}
      .chip{ padding:4px 8px; border-radius:8px; background:var(--chip-bg); color:var(--chip-text); font-weight:800; display:inline-block; }
      .soft{ color:var(--text-soft); }
      .money{ color:var(--p); font-weight:800; }
      .tbl tfoot td{ padding:12px 10px; font-weight:900; border-top:2px solid var(--border); background:var(--table-footer-bg); color: var(--text); }
      .mode-summary{ display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; margin:2px; }
      
      .modal-overlay{ position:fixed; inset:0; background:var(--modal-overlay-bg); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px; backdrop-filter:blur(4px); }
      .modal-content{ background:var(--modal-content-bg); border-radius:16px; padding:24px; max-width:800px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
      .modal-header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:12px; border-bottom:2px solid var(--border); }
      .modal-close{ background:transparent; border:0; font-size:28px; cursor:pointer; color:var(--text-soft); padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:8px; }
      .modal-close:hover{ background:var(--modal-close-hover-bg); color:var(--modal-close-hover-text); }
      
      .form-group{ margin-bottom:16px; }
      .form-label{ display:block; font-size:13px; font-weight:700; color:var(--text); margin-bottom:6px; }
      .form-input:focus{ outline:none; border-color:var(--input-focus-border); box-shadow:0 0 0 3px var(--input-focus-shadow); }
      
      .main-tabs{ display:flex; gap:8px; margin-bottom:16px; border-bottom:3px solid var(--border); }
      .main-tab-btn{ padding:12px 24px; border:none; background:transparent; cursor:pointer; font-weight:700; color:var(--text-soft); border-bottom:3px solid transparent; transition:all 0.2s; font-size:15px; }
      .main-tab-btn:hover{ color:var(--p); }
      .main-tab-btn.active{ color:var(--p); border-bottom-color:var(--p); }
      
      .badge-type{ display:inline-block; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; }
      .mode-badge{ display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; font-weight:700; font-size:12px; box-shadow:0 2px 6px rgba(0,0,0,.08); }
      .subcard{ background:var(--subcard-bg); border:1px solid var(--border); border-radius:12px; padding:16px; margin-top:12px; }
      .grid-add{ display:grid; grid-template-columns:100px 150px 120px 130px 150px 120px 1fr 80px; gap:8px; align-items:center; }
      .grid-add > div { font-weight: 800; color: var(--text); }
      .rowbtn{ background:var(--p); color:var(--text-on-primary); border:0; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:700; font-size:12px; }
      .rowbtn:hover{ background:var(--p2); }
      @media print { 
        .no-print{ display:none !important; } 
        body, .card, .tbl, .tbl tbody tr, .tbl tfoot td, .subcard {
          background: #fff !important;
          color: #000 !important;
        }
        .hdr {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);
};

/* ================= Component ================= */
export default function Paiements() {
  useInjectStyles();
  const { societeId, user, role, loading } = useUserRole();

  // 🔽 NOUVEAU: Gestion du thème
  const [theme, setTheme] = useState(() => {
    // Lire le thème depuis localStorage, 'light' par défaut
    return localStorage.getItem("app-theme") || "light";
  });

  useEffect(() => {
    // Mettre à jour localStorage ET l'attribut <html>
    localStorage.setItem("app-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  }, []);
  // 🔼 FIN: Gestion du thème

  // 🆕 Onglet principal : documents, chargesPersonnels, chargesDivers
  const [mainTab, setMainTab] = useState("documents");

  const [relatedTo, setRelatedTo] = useState("ventes");
  const [notification, setNotification] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [paiements, setPaiements] = useState([]);
  
  // 🆕 États pour les charges
  const [chargesPersonnels, setChargesPersonnels] = useState([]);
  const [chargesDivers, setChargesDivers] = useState([]);

  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [expandedDocId, setExpandedDocId] = useState(null);
  const [selectedDocPay, setSelectedDocPay] = useState("");
  const [payMode, setPayMode] = useState("Espèces");
  const [cashAmount, setCashAmount] = useState("");
  const [createInstr, setCreateInstr] = useState([]);
  const [editingInstrumentsFor, setEditingInstrumentsFor] = useState(null);
  const [draftInstruments, setDraftInstruments] = useState([]);

  // États pour l'édition de paiement
  const [editingPayment, setEditingPayment] = useState(null);
  const [editPaymentDateTime, setEditPaymentDateTime] = useState(""); // <-- datetime-local
  const [editPaymentMode, setEditPaymentMode] = useState("Espèces");
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentInstruments, setEditPaymentInstruments] = useState([]);

  const unsubDocsRef = useRef(null);
  const unsubPaysRef = useRef(null);
  const unsubChargesPersoRef = useRef(null);
  const unsubChargesDiversRef = useRef(null);

  const showNote = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 2800);
  }, []);

  const getTotalDoc = useCallback(
    (d) => {
      if (!d || !Array.isArray(d.articles) || d.articles.length === 0) return 0;
      if (relatedTo === "achats") {
        const recues = d.articles
          .map((a) => a?.recu || null)
          .filter((r) => r && Number(r.quantite || 0) > 0);
        const total = recues.reduce((s, r) => {
          const q = Number(r.quantite || 0);
          const pa = Number(r.prixAchat || r.prixUnitaire || 0);
          const rem = Number(r.remise || 0);
          return s + (q * pa - rem);
        }, 0);
        return total - (Number(d.remiseGlobale) || 0);
      }
      const total = d.articles.reduce((s, a) => {
        const q = Number(a.quantite || 0);
        const pv = Number(a.prixUnitaire || a.prixVente || 0);
        const rem = Number(a.remise || 0);
        return s + (q * pv - rem);
      }, 0);
      return total - (Number(d.remiseGlobale) || 0);
    },
    [relatedTo]
  );

  const paiementsByDoc = useMemo(() => {
    const m = {};
    paiements.forEach((p) => {
      if (!m[p.docId]) m[p.docId] = [];
      m[p.docId].push(p);
    });
    return m;
  }, [paiements]);

  const docIndex = useMemo(() => {
    const idx = {};
    documents.forEach((d) => {
      const name =
        relatedTo === "achats"
          ? d.fournisseur || "Fournisseur inconnu"
          : d.client || d.patient || "Client inconnu";
      const total = getTotalDoc(d);
      const paid = (paiementsByDoc[d.id] || []).reduce(
        (s, p) => s + (Number(p.montant) || 0),
        0
      );
      const rawSolde = total - paid;
      const solde = rawSolde > 0.01 ? rawSolde : 0;

      const paymentModes = new Set();
      (paiementsByDoc[d.id] || []).forEach((p) => {
        if (p.mode) paymentModes.add(p.mode);
      });

      idx[d.id] = {
        id: d.id,
        name,
        total,
        paid,
        solde,
        paymentModes: Array.from(paymentModes),
        dateStr:
          (d.date && formatDate(d.date)) ||
          (d.timestamp && formatDate(d.timestamp)) ||
          "—",
        numberStr: `#${String(d.id).slice(0, 8).toUpperCase()}`,
        raw: d,
      };
    });
    return idx;
  }, [documents, paiementsByDoc, getTotalDoc, relatedTo]);

  // 🔥 CHARGEMENT DES DOCUMENTS
  const loadDocuments = useCallback(() => {
    if (!societeId) return;
    if (unsubDocsRef.current) unsubDocsRef.current();
    const c = collection(db, "societe", societeId, relatedTo);
    unsubDocsRef.current = onSnapshot(
      c,
      (snap) => {
        const arr = [];
        snap.forEach((d) => {
          const data = d.data();
          const docWithId = { id: d.id, ...data };
          if (!Array.isArray(data.articles) || data.articles.length === 0) return;

          if (relatedTo === "achats") {
            if (!isValidAchat(docWithId)) return;
            const st = (data.statutReception || "en_attente").toLowerCase();
            if (!["reçu", "recu", "partiel"].includes(st)) return;
          }

          arr.push(docWithId);
        });

        arr.sort((a, b) => {
          const da =
            toDateSafe(a.date)?.getTime() ||
            toDateSafe(a.timestamp)?.getTime() ||
            0;
          const dbb =
            toDateSafe(b.date)?.getTime() ||
            toDateSafe(b.timestamp)?.getTime() ||
            0;
          return dbb - da;
        });

        setDocuments(arr);
      },
      (e) => {
        console.error("❌ Paiements - Erreur loadDocuments:", e);
        setDocuments([]);
      }
    );
  }, [societeId, relatedTo]);

  const loadPaiements = useCallback(() => {
    if (!societeId) return;
    if (unsubPaysRef.current) unsubPaysRef.current();
    const qy = query(
      collection(db, "societe", societeId, "paiements"),
      where("type", "==", relatedTo)
    );
    unsubPaysRef.current = onSnapshot(
      qy,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        arr.sort(
          (a, b) =>
            (toDateSafe(b.date)?.getTime() || 0) -
            (toDateSafe(a.date)?.getTime() || 0)
        );
        setPaiements(arr);
      },
      (e) => console.error("pays", e)
    );
  }, [societeId, relatedTo]);

  // 🆕 CHARGEMENT DES CHARGES PERSONNELS (NON-ESPÈCES)
  const loadChargesPersonnels = useCallback(() => {
    if (!societeId) return;
    if (unsubChargesPersoRef.current) unsubChargesPersoRef.current();
    const c = collection(db, "societe", societeId, "chargesPersonnels");
    unsubChargesPersoRef.current = onSnapshot(
      c,
      (snap) => {
        const arr = [];
        snap.forEach((d) => {
          const data = d.data();
          const mode = norm(data.modePaiement || "");
          const isEspeces = mode === "especes" || mode === "espèces";
          if (mode && !isEspeces) {
            arr.push({ id: d.id, ...data });
          }
        });
        setChargesPersonnels(arr);
      },
      (e) => console.error("❌ Erreur charges personnels:", e)
    );
  }, [societeId]);

  // 🆕 CHARGEMENT DES CHARGES DIVERS (NON-ESPÈCES)
  const loadChargesDivers = useCallback(() => {
    if (!societeId) return;
    if (unsubChargesDiversRef.current) unsubChargesDiversRef.current();
    const c = collection(db, "societe", societeId, "chargesDivers");
    unsubChargesDiversRef.current = onSnapshot(
      c,
      (snap) => {
        const arr = [];
        snap.forEach((d) => {
          const data = d.data();
          const mode = norm(data.modePaiement || "");
          const statut = norm(data.statut || "");
          const isEspeces = mode === "especes" || mode === "espèces";
          const isPaid = !statut || statut === "paye" || statut === "payé";
          if (mode && !isEspeces && isPaid) {
            arr.push({ id: d.id, ...data });
          }
        });
        setChargesDivers(arr);
      },
      (e) => console.error("❌ Erreur charges divers:", e)
    );
  }, [societeId]);

  useEffect(() => {
    if (!societeId) return;
    loadDocuments();
    loadPaiements();
    loadChargesPersonnels();
    loadChargesDivers();
    return () => {
      if (unsubDocsRef.current) unsubDocsRef.current();
      if (unsubPaysRef.current) unsubPaysRef.current();
      if (unsubChargesPersoRef.current) unsubChargesPersoRef.current();
      if (unsubChargesDiversRef.current) unsubChargesDiversRef.current();
    };
  }, [societeId, relatedTo, loadDocuments, loadPaiements, loadChargesPersonnels, loadChargesDivers]);

  useEffect(() => {
    if (role === "vendeuse") {
      setRelatedTo("ventes");
    }
  }, [role]);

  // 🆕 FILTRAGE DES CHARGES PERSONNELS
  const filteredChargesPersonnels = useMemo(() => {
    let result = [...chargesPersonnels];

    if (filterMode !== "all") {
      result = result.filter((c) => isModeWanted(c.modePaiement, filterMode));
    }

    if (filterName) {
      const searchTerm = norm(filterName);
      result = result.filter((c) => {
        const emp = norm(c.employe || "");
        const poste = norm(c.poste || "");
        const cin = norm(c.cin || "");
        return emp.includes(searchTerm) || poste.includes(searchTerm) || cin.includes(searchTerm);
      });
    }

    if (dateFrom || dateTo) {
      result = result.filter((c) => {
        const dateStr = c.date || "";
        if (dateFrom && dateStr < dateFrom) return false;
        if (dateTo && dateStr > dateTo) return false;
        return true;
      });
    }

    return result;
  }, [chargesPersonnels, filterMode, filterName, dateFrom, dateTo]);

  // 🆕 FILTRAGE DES CHARGES DIVERS
  const filteredChargesDivers = useMemo(() => {
    let result = [...chargesDivers];

    if (filterMode !== "all") {
      result = result.filter((c) => isModeWanted(c.modePaiement, filterMode));
    }

    if (filterName) {
      const searchTerm = norm(filterName);
      result = result.filter((c) => {
        const lib = norm(c.libelle || "");
        const frs = norm(c.fournisseur || "");
        const cat = norm(c.categorie || "");
        return lib.includes(searchTerm) || frs.includes(searchTerm) || cat.includes(searchTerm);
      });
    }

    if (dateFrom || dateTo) {
      result = result.filter((c) => {
        const dateStr = c.date || "";
        if (dateFrom && dateStr < dateFrom) return false;
        if (dateTo && dateStr > dateTo) return false;
        return true;
      });
    }

    return result;
  }, [chargesDivers, filterMode, filterName, dateFrom, dateTo]);

  const filteredDocs = useMemo(() => {
    const nameTerm = norm(filterName);
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return documents.filter((d) => {
      const meta = docIndex[d.id];
      if (!meta) return false;

      if (nameTerm && !norm(meta.name).includes(nameTerm)) {
        const numStr = norm(meta.numberStr);
        if (!numStr.includes(nameTerm)) return false;
      }

      if (filterStatus === "paid" && meta.solde > 0.01) return false;
      if (filterStatus === "due" && meta.solde <= 0.01) return false;

      if (filterMode !== "all") {
        const pays = paiementsByDoc[d.id] || [];
        const hasMode = pays.some((p) => isModeWanted(p.mode, filterMode));
        if (!hasMode) return false;
      }

      if (from || to) {
        const pays = paiementsByDoc[d.id] || [];
        const inRange = pays.some((p) => {
          const pd = toDateSafe(p.date);
          if (!pd) return false;
          if (from && pd < from) return false;
          if (to && pd > to) return false;
          return true;
        });
        if (!inRange) return false;
      }

      return true;
    });
  }, [documents, filterName, filterStatus, filterMode, dateFrom, dateTo, docIndex, paiementsByDoc]);

  const filteredPaymentsForDoc = useCallback(
    (docId) => {
      const all = paiementsByDoc[docId] || [];
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

      return all.filter((p) => {
        if (filterMode !== "all" && !isModeWanted(p.mode, filterMode)) return false;
        if (from || to) {
          const pd = toDateSafe(p.date);
          if (!pd) return false;
          if (from && pd < from) return false;
          if (to && pd > to) return false;
        }
        return true;
      });
    },
    [paiementsByDoc, filterMode, dateFrom, dateTo]
  );

  const paymentsTotals = useMemo(() => {
    const totals = { Espèces: 0, Chèque: 0, Traite: 0 };
    filteredDocs.forEach((d) => {
      const pays = filteredPaymentsForDoc(d.id);
      pays.forEach((p) => {
        const m = p.mode || "Espèces";
        totals[m] = (totals[m] || 0) + (Number(p.montant) || 0);
      });
    });
    return totals;
  }, [filteredDocs, filteredPaymentsForDoc]);

  const docsTotals = useMemo(() => {
    let total = 0;
    let paid = 0;
    let solde = 0;
    filteredDocs.forEach((d) => {
      const meta = docIndex[d.id];
      if (!meta) return;
      total += meta.total;
      paid += meta.paid;
      solde += meta.solde;
    });
    return { total, paid, solde };
  }, [filteredDocs, docIndex]);

  // 🆕 Totaux (table Charges Personnels filtrée)
  const totalsChargesPersonnels = useMemo(() => {
    const byMode = {};
    let salaire = 0;
    let total = 0;
    filteredChargesPersonnels.forEach((c) => {
      const s = Number(c.salaire || 0);
      const t = Number(c.total || 0);
      salaire += s;
      total += t;
      const m = c.modePaiement || "—";
      byMode[m] = (byMode[m] || 0) + t;
    });
    return { salaire, total, byMode };
  }, [filteredChargesPersonnels]);

  // 🆕 Totaux (table Charges Divers filtrée)
  const totalsChargesDivers = useMemo(() => {
    const byMode = {};
    let montant = 0;
    filteredChargesDivers.forEach((c) => {
      const t = Number(c.montant || 0);
      montant += t;
      const m = c.modePaiement || "—";
      byMode[m] = (byMode[m] || 0) + t;
    });
    return { montant, byMode };
  }, [filteredChargesDivers]);

  /** ⭐ Met à jour le document (vente/achat) côté statut + (reste pour ventes) */
  const updateDocStatus = useCallback(
    async (docId, newPaidTotal, total) => {
      if (!societeId) return;
      const isFullyPaid = newPaidTotal >= total - 0.01;
      const status = isFullyPaid ? "payé" : "partiel";
      const docRef = doc(db, "societe", societeId, relatedTo, docId);

      const patch = {
        statutPaiement: status,
        montantPaye: newPaidTotal,
        updatedAt: Timestamp.now(),
      };

      // Pour VENTES on alimente aussi "reste"
      if (relatedTo === "ventes") {
        const reste = Math.max(0, Number(total || 0) - Number(newPaidTotal || 0));
        patch.reste = Number(reste.toFixed(2));
      }

      try {
        await updateDoc(docRef, patch);
      } catch (e) {
        console.error("Erreur updateDocStatus:", e);
      }
    },
    [societeId, relatedTo]
  );

  const handleSelectDocPay = useCallback(
    (val) => {
      setSelectedDocPay(val);
      if (!val) {
        setCashAmount("");
        setCreateInstr([]);
        return;
      }
      const meta = docIndex[val];
      if (!meta) return;
      if (payMode === "Espèces") {
        setCashAmount(meta.solde > 0 ? String(meta.solde.toFixed(2)) : "");
      } else {
        setCashAmount("");
      }
      setCreateInstr([]);
    },
    [docIndex, payMode]
  );

  const addCreateInstrument = useCallback(() => {
    setCreateInstr((prev) => [
      ...prev,
      {
        type: norm(payMode) === "traite" ? "traite" : "chèque",
        banque: "",
        numero: "",
        echeance: "",
        montant: "",
        titulaire: "",
      },
    ]);
  }, [payMode]);

  const updateCreateInstrument = useCallback((idx, key, val) => {
    setCreateInstr((prev) => {
      const cp = [...prev];
      cp[idx] = { ...cp[idx], [key]: val };
      return cp;
    });
  }, []);

  const removeCreateInstrument = useCallback((idx) => {
    setCreateInstr((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const createInstrTotal = useMemo(
    () =>
      (createInstr || []).reduce((s, it) => s + (Number(it?.montant) || 0), 0),
    [createInstr]
  );

  /** ⭐ Création paiement : écrit venteId/linkedSaleId + modePaiement normalisé */
  const handleCreatePayment = useCallback(async () => {
    if (!societeId || !user || !selectedDocPay) return;
    const meta = docIndex[selectedDocPay];
    if (!meta) return;

    try {
      let amount = 0;
      let payloadExtra = {};

      const normMode = normalizeMode(payMode); // => {label:"Espèces", key:"espece"}

      if (norm(payMode) === "especes" || norm(payMode) === "espèces") {
        amount = Number(cashAmount);
        if (!(amount > 0)) return showNote("Montant espèces invalide", "error");
      } else {
        const clean = (createInstr || [])
          .map((x) => ({
            type: norm(payMode) === "traite" ? "traite" : "chèque",
            banque: String(x?.banque || "").trim(),
            numero: String(x?.numero || "").trim(),
            echeance: x?.echeance || "",
            montant: Number(x?.montant || 0) || 0,
            titulaire: String(x?.titulaire || "").trim(),
          }))
          .filter((x) => x.montant > 0 && (x.numero || x.banque));

        amount = clean.reduce((s, it) => s + (Number(it.montant) || 0), 0);
        if (!(amount > 0))
          return showNote("Saisir au moins un instrument valide", "error");

        payloadExtra.instruments = clean;
      }

      if (amount > meta.solde + 0.001)
        return showNote("Montant > solde restant", "error");

      const now = new Date();
      const basePayload = {
        docId: selectedDocPay,
        montant: amount,
        mode: normMode.label,        // "Espèces" | "Chèque" | "Traite"
        modeKey: normMode.key,       // "espece" | "cheque" | "traite"
        modePaiement: normMode.key,  // duplicata pour compatibilité ClotureCaisse
        statut: "payé",
        type: relatedTo,             // "ventes" | "achats"
        date: Timestamp.fromDate(now),
        paidAt: Timestamp.fromDate(now),
        creePar: user.uid,
        creeParEmail: user.email,
        creeParRole: role,
        creeLe: Timestamp.fromDate(now),
        societeId,
        createdFrom: "Paiements.js",
        ...payloadExtra,
      };

      // 🔗 Lier explicitement
      if (relatedTo === "ventes") {
        basePayload.venteId = selectedDocPay;
        basePayload.linkedSaleId = selectedDocPay; // clé alternative souvent utilisée
      } else {
        basePayload.achatId = selectedDocPay;
      }

      await addDoc(collection(db, "societe", societeId, "paiements"), basePayload);

      // Mise à jour du statut/solde (et reste pour ventes)
      const newPaid = (meta.paid || 0) + amount;
      await updateDocStatus(selectedDocPay, newPaid, meta.total);

      // Pour VENTES uniquement : garder un dernier mode côté vente (utile en affichage)
      if (relatedTo === "ventes") {
        const reste = Math.max(0, Number(meta.total || 0) - Number(newPaid || 0));
        const patchVente = {
          lastPaymentMode: normMode.label,
          updatedAt: Timestamp.fromDate(now),
        };
        patchVente.reste = Number(reste.toFixed(2));
        if (reste <= 0.001) {
          patchVente.paidAt = Timestamp.fromDate(now);
          patchVente.modePaiementFinal = normMode.label;
        }
        try {
          await updateDoc(doc(db, "societe", societeId, "ventes", selectedDocPay), patchVente);
        } catch (e) {
          // Non bloquant si la collection s'appelle différemment chez toi
          console.warn("Patch vente lastPaymentMode/reste non appliqué:", e?.message);
        }
      }

      setSelectedDocPay("");
      setCashAmount("");
      setCreateInstr([]);
      showNote("Paiement enregistré ✅");
    } catch (e) {
      console.error(e);
      showNote("Erreur lors de l'enregistrement", "error");
    }
  }, [
    societeId,
    user,
    role,
    selectedDocPay,
    payMode,
    cashAmount,
    createInstr,
    docIndex,
    updateDocStatus,
    relatedTo,
    showNote,
  ]);

  /* ========== ÉDITION DE PAIEMENT ========== */
  const handleEditPayment = useCallback((payment) => {
    setEditingPayment(payment);
    // ✅ on garde la date + l'heure pour l'input datetime-local
    setEditPaymentDateTime(getDateTimeInputValue(payment.date));
    setEditPaymentMode(payment.mode || "Espèces");

    const isCheque = norm(payment.mode) === "cheque" || norm(payment.mode) === "chèque";
    const isTraite = norm(payment.mode) === "traite";

    if (isCheque || isTraite) {
      setEditPaymentAmount("");
      setEditPaymentInstruments(Array.isArray(payment.instruments) ? payment.instruments : []);
    } else {
      setEditPaymentAmount(String(payment.montant || ""));
      setEditPaymentInstruments([]);
    }
  }, []);

  const handleCancelEditPayment = useCallback(() => {
    setEditingPayment(null);
    setEditPaymentDateTime("");
    setEditPaymentMode("Espèces");
    setEditPaymentAmount("");
    setEditPaymentInstruments([]);
  }, []);

  const handleSaveEditPayment = useCallback(async () => {
    if (!societeId || !user || !editingPayment) return;

    try {
      let newAmount = 0;

      // ✅ reconstruire un Date local sans décalage fuseau
      const newDate = parseLocalDateTime(editPaymentDateTime) || new Date();

      const normMode = normalizeMode(editPaymentMode);

      let updateData = {
        mode: normMode.label,
        modeKey: normMode.key,
        modePaiement: normMode.key,
        date: Timestamp.fromDate(newDate),
        modifieLe: Timestamp.now(),
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieParRole: role,
      };

      const isCheque = norm(editPaymentMode) === "cheque" || norm(editPaymentMode) === "chèque";
      const isTraite = norm(editPaymentMode) === "traite";

      if (isCheque || isTraite) {
        const clean = editPaymentInstruments
          .map((x) => ({
            type: norm(editPaymentMode) === "traite" ? "traite" : "chèque",
            banque: String(x?.banque || "").trim(),
            numero: String(x?.numero || "").trim(),
            echeance: x?.echeance || "",
            montant: Number(x?.montant || 0) || 0,
            titulaire: String(x?.titulaire || "").trim(),
          }))
          .filter((x) => x.montant > 0 && (x.numero || x.banque));

        newAmount = clean.reduce((s, it) => s + (Number(it.montant) || 0), 0);
        if (!(newAmount > 0))
          return showNote("Saisir au moins un instrument valide", "error");

        updateData.instruments = clean;
      } else {
        newAmount = Number(editPaymentAmount);
        if (!(newAmount > 0))
          return showNote("Montant espèces invalide", "error");
        updateData.instruments = [];
      }

      updateData.montant = newAmount;

      await updateDoc(
        doc(db, "societe", societeId, "paiements", editingPayment.id),
        updateData
      );

      // Recalculer le total payé pour le document
      const docId = editingPayment.docId;
      const allPayments = paiementsByDoc[docId] || [];
      const oldAmount = Number(editingPayment.montant) || 0;
      const currentPaid = allPayments.reduce(
        (s, p) => s + (Number(p.montant) || 0),
        0
      );
      const newPaidTotal = currentPaid - oldAmount + newAmount;

      const meta = docIndex[docId];
      if (meta) {
        await updateDocStatus(docId, newPaidTotal, meta.total);
        // Optionnel: si espèces, mets à jour "lastPaymentMode" sur ventes
        if (normMode.key === "espece" && relatedTo === "ventes") {
          try {
            await updateDoc(doc(db, "societe", societeId, "ventes", docId), {
              lastPaymentMode: normMode.label,
              updatedAt: Timestamp.now(),
            });
          } catch (e) {}
        }
      }

      showNote("Paiement modifié ✅");
      handleCancelEditPayment();
    } catch (e) {
      console.error(e);
      showNote("Erreur lors de la modification", "error");
    }
  }, [
    societeId,
    user,
    role,
    editingPayment,
    editPaymentMode,
    editPaymentDateTime,
    editPaymentAmount,
    editPaymentInstruments,
    paiementsByDoc,
    docIndex,
    updateDocStatus,
    handleCancelEditPayment,
    showNote,
    relatedTo,
  ]);

  const addEditInstrument = useCallback(() => {
    const baseType = norm(editPaymentMode) === "traite" ? "traite" : "chèque";
    setEditPaymentInstruments((prev) => [
      ...prev,
      {
        type: baseType,
        banque: "",
        numero: "",
        echeance: "",
        montant: "",
        titulaire: "",
      },
    ]);
  }, [editPaymentMode]);

  const updateEditInstrument = useCallback((idx, key, val) => {
    setEditPaymentInstruments((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: val };
      return copy;
    });
  }, []);

  const removeEditInstrument = useCallback((idx) => {
    setEditPaymentInstruments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // SUPPRESSION DE PAIEMENT
  const handleDeletePayment = useCallback(
    async (payment) => {
      if (!societeId || !user || !payment) return;

      const confirmMsg = `Supprimer ce paiement de ${fmtDH(
        payment.montant
      )} (${payment.mode}) ?\n\nLe statut du document sera mis à jour automatiquement.`;
      if (!window.confirm(confirmMsg)) return;

      try {
        await deleteDoc(doc(db, "societe", societeId, "paiements", payment.id));

        const docId = payment.docId;
        const allPayments = paiementsByDoc[docId] || [];
        const deletedAmount = Number(payment.montant) || 0;
        const currentPaid = allPayments.reduce(
          (s, p) => s + (Number(p.montant) || 0),
          0
        );
        const newPaidTotal = Math.max(0, currentPaid - deletedAmount);

        const meta = docIndex[docId];
        if (meta) {
          await updateDocStatus(docId, newPaidTotal, meta.total);
        }

        showNote("Paiement supprimé ✅");
      } catch (e) {
        console.error(e);
        showNote("Erreur lors de la suppression", "error");
      }
    },
    [societeId, user, paiementsByDoc, docIndex, updateDocStatus, showNote]
  );

  const openInstrumentsEditor = useCallback((p) => {
    setEditingInstrumentsFor(p);
    setDraftInstruments(Array.isArray(p.instruments) ? p.instruments : []);
  }, []);

  const closeInstrumentsEditor = useCallback(() => {
    setEditingInstrumentsFor(null);
    setDraftInstruments([]);
  }, []);

  const addInstrument = useCallback(() => {
    const baseType =
      norm(editingInstrumentsFor?.mode) === "traite" ? "traite" : "chèque";
    setDraftInstruments((prev) => [
      ...prev,
      {
        type: baseType,
        banque: "",
        numero: "",
        echeance: "",
        montant: "",
        titulaire: "",
      },
    ]);
  }, [editingInstrumentsFor]);

  const updateInstrument = useCallback((idx, key, val) => {
    setDraftInstruments((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: val };
      return copy;
    });
  }, []);

  const removeInstrument = useCallback((idx) => {
    setDraftInstruments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const saveInstruments = useCallback(async () => {
    if (!societeId || !editingInstrumentsFor) return;
    try {
      const clean = draftInstruments
        .map((x) => ({
          type: norm(x?.type) === "traite" ? "traite" : "chèque",
          banque: String(x?.banque || "").trim(),
          numero: String(x?.numero || "").trim(),
          echeance: x?.echeance || "",
          montant: Number(x?.montant || 0) || 0,
          titulaire: String(x?.titulaire || "").trim(),
        }))
        .filter((x) => x.montant > 0 && (x.numero || x.banque));

      const newTotal = clean.reduce((s, it) => s + it.montant, 0);

      await updateDoc(
        doc(db, "societe", societeId, "paiements", editingInstrumentsFor.id),
        {
          instruments: clean,
          montant: newTotal,
          modifieLe: Timestamp.now(),
          modifieParRole: role,
        }
      );

      const docId = editingInstrumentsFor.docId;
      const allPayments = paiementsByDoc[docId] || [];
      const oldAmount = Number(editingInstrumentsFor.montant) || 0;
      const currentPaid = allPayments.reduce(
        (s, p) => s + (Number(p.montant) || 0),
        0
      );
      const newPaidTotal = currentPaid - oldAmount + newTotal;

      const meta = docIndex[docId];
      if (meta) {
        await updateDocStatus(docId, newPaidTotal, meta.total);
      }

      showNote("Instruments enregistrés ✅");
      closeInstrumentsEditor();
    } catch (e) {
      console.error(e);
      showNote("Erreur d'enregistrement des instruments", "error");
    }
  }, [
    societeId,
    role,
    draftInstruments,
    editingInstrumentsFor,
    paiementsByDoc,
    docIndex,
    updateDocStatus,
    closeInstrumentsEditor,
    showNote,
  ]);

  const docsWithBalance = useMemo(() => {
    return documents
      .filter((d) => {
        const meta = docIndex[d.id];
        return meta && meta.solde > 0.01;
      })
      .sort((a, b) => {
        const sa =
          toDateSafe(a.date)?.getTime() ||
          toDateSafe(a.timestamp)?.getTime() ||
          0;
        const sb =
          toDateSafe(b.date)?.getTime() ||
          toDateSafe(b.timestamp)?.getTime() ||
          0;
        return sb - sa;
      });
  }, [documents, docIndex]);

  const toggleExpand = useCallback((docId) => {
    setExpandedDocId((prev) => (prev === docId ? null : docId));
  }, []);

  const buildFilterSummary = () => {
    const parts = [];
    parts.push(`Type: ${relatedTo === "ventes" ? "Ventes" : "Achats"}`);
    if (filterName) parts.push(`Recherche: "${filterName}"`);
    if (filterStatus !== "all")
      parts.push(`Statut: ${filterStatus === "paid" ? "Payés" : "Avec solde"}`);
    if (filterMode !== "all") parts.push(`Mode: ${filterMode}`);
    if (dateFrom || dateTo)
      parts.push(`Période paiements: ${dateFrom || "—"} → ${dateTo || "—"}`);
    return parts.join(" • ");
  };

  const handlePrint = useCallback(() => {
    const now = new Date();
    const title =
      "Etat " + (relatedTo === "ventes" ? "Ventes" : "Achats") + " — Filtré";
    const filterSummary = buildFilterSummary();

    const rowsDocs = filteredDocs
      .map((d) => {
        const meta = docIndex[d.id];
        if (!meta) return "";
        const statut = meta.solde > 0.01 ? "Partiel/Impayé" : "Payé";
        const modesList =
          meta.paymentModes.length > 0
            ? meta.paymentModes.map((m) => `${getModeIcon(m)} ${m}`).join(", ")
            : "—";
        return `
          <tr>
            <td class="left">${escapeHtml(meta.name)}</td>
            <td>${escapeHtml(meta.numberStr)}</td>
            <td>${escapeHtml(meta.dateStr)}</td>
            <td class="money">${fmtDH(meta.total)}</td>
            <td>${fmtDH(meta.paid)}</td>
            <td class="${meta.solde > 0.01 ? "neg" : "pos"}">${fmtDH(meta.solde)}</td>
            <td>${statut}</td>
            <td style="font-size:11px">${modesList}</td>
          </tr>
        `;
      })
      .join("");

    const details = filteredDocs
      .map((d) => {
        const meta = docIndex[d.id];
        if (!meta) return "";
        const pays = filteredPaymentsForDoc(d.id);
        const inner =
          pays.length === 0
            ? `<div class="muted">Aucun paiement correspondant aux filtres.</div>`
            : `
              <table class="inner">
                <thead>
                  <tr><th class="left">Date</th><th>Mode</th><th>Montant</th><th>Instruments</th></tr>
                </thead>
                <tbody>
                  ${pays
                    .map((p) => {
                      const isCheque =
                        norm(p.mode) === "cheque" || norm(p.mode) === "chèque";
                      const isTraite = norm(p.mode) === "traite";
                      const canLabel = isCheque || isTraite;
                      return `
                        <tr>
                          <td class="left">${formatDateTime(p.date)}</td>
                          <td>${getModeIcon(p.mode)} ${escapeHtml(p.mode)}</td>
                          <td>${fmtDH(p.montant)}</td>
                          <td class="soft">${escapeHtml(canLabel ? labelInstruments(p.instruments) : "—")}</td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            `;
        return `
          <div class="doc-detail">
            <div class="detail-title">${escapeHtml(meta.name)} — ${escapeHtml(meta.numberStr)}</div>
            ${inner}
          </div>
        `;
      })
      .join("");

    const recapModes = Object.keys(paymentsTotals)
      .map((m) => {
        const t = paymentsTotals[m];
        if (t === 0) return "";
        return `<div><b>${m}:</b> ${fmtDH(t)}</div>`;
      })
      .filter((x) => x)
      .join("");
    const recap =
      recapModes || `<div class="muted">Aucun paiement correspondant aux filtres.</div>`;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    @page { margin:15mm; }
    body{ font-family:Arial,sans-serif; font-size:12px; color:#111; }
    .header{ text-align:center; margin-bottom:20px; }
    .title{ font-size:20px; font-weight:900; margin-bottom:4px; }
    .subtitle{ font-size:12px; color:#666; margin-bottom:10px; }
    .filterSummary{ font-size:11px; color:#444; font-style:italic; }
    .section{ margin-bottom:30px; }
    .section-title{ font-size:14px; font-weight:700; margin-bottom:8px; border-bottom:2px solid #333; padding-bottom:4px; }
    table{ width:100%; border-collapse:collapse; margin-top:6px; }
    table thead th{ background:#eee; text-align:center; font-weight:700; padding:8px 6px; border:1px solid #aaa; }
    table tbody td{ border:1px solid #ddd; padding:6px; text-align:center; }
    td.left{ text-align:left; }
    td.money{ color:#6366f1; font-weight:700; }
    td.neg{ color:#e11d48; font-weight:700; }
    td.pos{ color:#10b981; font-weight:700; }
    tfoot td{ background:#f9f9f9; font-weight:900; padding:8px; border:1px solid #aaa; }
    .muted{ color:#999; font-size:11px; }
    .doc-detail{ margin:12px 0; }
    .detail-title{ font-weight:700; margin-bottom:4px; }
    .inner{ width:100%; border-collapse:collapse; margin-top:4px; }
    .inner td,.inner th{ border:1px solid #ddd; padding:5px; }
    .soft{ font-size:10px; color:#666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">${title}</div>
    <div class="subtitle">Édité le ${formatDateTime(now)}</div>
    <div class="filterSummary">${filterSummary}</div>
  </div>

  <section class="section">
    <div class="section-title">Résumé des documents (filtrés)</div>
    <table>
      <thead>
        <tr>
          <th class="left">${relatedTo === "ventes" ? "Client" : "Fournisseur"}</th>
          <th>N°</th>
          <th>Date</th>
          <th>Total</th>
          <th>Payé</th>
          <th>Solde</th>
          <th>Statut</th>
          <th>Modes</th>
        </tr>
      </thead>
      <tbody>
        ${rowsDocs}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align:left">TOTAL</td>
          <td>${fmtDH(docsTotals.total)}</td>
          <td>${fmtDH(docsTotals.paid)}</td>
          <td class="${docsTotals.solde > 0.01 ? "neg" : "pos"}">${fmtDH(
      docsTotals.solde
    )}</td>
          <td colspan="2">—</td>
        </tr>
      </tfoot>
    </table>
  </section>

  <section>
    <div class="section-title">Détail des paiements (filtrés)</div>
    ${
      details ||
      `<div class="muted">Aucun paiement correspondant aux filtres.</div>`
    }
  </section>

  <section>
    <div class="section-title">Récapitulatif des paiements (docs filtrés)</div>
    ${recap}
  </section>

  <script>
    window.addEventListener('load', () => { setTimeout(() => { window.print(); }, 50); });
  </script>
</body>
</html>
    `;

    try {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);

      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (w && typeof w.addEventListener === "function") {
        const revoke = () => URL.revokeObjectURL(url);
        w.addEventListener("beforeunload", revoke, { once: true });
        return;
      }

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.setAttribute("sandbox", "allow-modals allow-same-origin");
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(iframe);
          }, 500);
        }
      };
    } catch (err) {
      console.error("Erreur impression:", err);
      alert(
        "Impossible d'ouvrir l'aperçu d'impression. Désactivez le bloqueur de pop-up ou essayez un autre navigateur."
      );
    }
  }, [
    relatedTo,
    filteredDocs,
    docIndex,
    paymentsTotals,
    filteredPaymentsForDoc,
    docsTotals,
    buildFilterSummary,
  ]);

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  if (loading) return <div style={{ padding: 16 }}>Chargement…</div>;
  if (!user) return <div style={{ padding: 16, color: "var(--danger)" }}>Non connecté.</div>;
  if (!societeId) return <div style={{ padding: 16, color: "var(--danger)" }}>Aucune société.</div>;

  const isVendeuse = role === "vendeuse";

  return (
    <div className="paie-wrap">
      {/* 🔽 MODIFIÉ: Ajout de flex et du bouton de thème 🔽 */}
      <div className="hdr">
        <div>
          <h1 style={{ margin: 0, fontWeight: 900 }}>💰 Gestion des Paiements</h1>
          <div style={{ opacity: 0.9, marginTop: 6 }}>
            Suivi complet : Documents, Charges Personnels, Charges Divers
          </div>
        </div>
        <button 
          className="btn theme-toggle no-print" 
          onClick={toggleTheme}
          title={theme === 'light' ? 'Passer au mode sombre' : 'Passer au mode clair'}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
      {/* 🔼 FIN MODIFIÉ 🔼 */}

      {notification && (
        <div className={`notice ${notification.type || "success"}`} role="alert">
          {notification.message}
        </div>
      )}

      {/* 🆕 ONGLETS PRINCIPAUX */}
      <div className="main-tabs">
        <button
          className={`main-tab-btn ${mainTab === "documents" ? "active" : ""}`}
          onClick={() => setMainTab("documents")}
        >
          📋 Documents ({filteredDocs.length})
        </button>
        <button
          className={`main-tab-btn ${mainTab === "chargesPersonnels" ? "active" : ""}`}
          onClick={() => setMainTab("chargesPersonnels")}
        >
          👤 Charges Personnels ({filteredChargesPersonnels.length})
        </button>
        <button
          className={`main-tab-btn ${mainTab === "chargesDivers" ? "active" : ""}`}
          onClick={() => setMainTab("chargesDivers")}
        >
          📊 Charges Divers ({filteredChargesDivers.length})
        </button>
      </div>

      {/* ========== ONGLET DOCUMENTS ========== */}
      {mainTab === "documents" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="controls" style={{ marginBottom: 10 }}>
              <button
                className={`btn ${relatedTo === "ventes" ? "on" : ""}`}
                onClick={() => {
                  setRelatedTo("ventes");
                  setExpandedDocId(null);
                  setSelectedDocPay("");
                  setCashAmount("");
                  setPayMode("Espèces");
                  setCreateInstr([]);
                }}
              >
                📊 Ventes
              </button>
              {!isVendeuse && (
                <button
                  className={`btn ${relatedTo === "achats" ? "on" : ""}`}
                  onClick={() => {
                    setRelatedTo("achats");
                    setExpandedDocId(null);
                    setSelectedDocPay("");
                    setCashAmount("");
                    setPayMode("Espèces");
                    setCreateInstr([]);
                  }}
                >
                  🛒 Achats
                </button>
              )}

              <input
                className="field"
                placeholder={
                  relatedTo === "ventes" ? "Filtrer client/N°…" : "Filtrer fournisseur/N°…"
                }
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                style={{ minWidth: 220 }}
              />

              <input
                className="field"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Date paiement - début"
              />
              <input
                className="field"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Date paiement - fin"
              />

              <select
                className="select"
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                title="Mode paiement (filtre sur paiements)"
              >
                <option value="all">Tous modes</option>
                <option value="Espèces">💵 Espèces</option>
                <option value="Cheque">🏦 Chèque</option>
                <option value="Traite">📝 Traite</option>
              </select>

              <select
                className="select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                title="Statut document"
              >
                <option value="all">Tous statuts</option>
                <option value="paid">Payés</option>
                <option value="due">Avec solde</option>
              </select>

              <button className="btn primary no-print" onClick={handlePrint} title="Imprimer l'état filtré">
                🖨️ Imprimer
              </button>
            </div>

            <div className="subcard">
              <h3 style={{ margin: "0 0 10px 0" }}>
                {relatedTo === "ventes" ? "➕ Régler une vente" : "➕ Régler un achat"}
              </h3>

              <div className="controls" style={{ marginBottom: 8 }}>
                <select
                  className="select"
                  value={selectedDocPay}
                  onChange={(e) => handleSelectDocPay(e.target.value)}
                  style={{ minWidth: 360 }}
                >
                  <option value="">
                    -- Choisir un {relatedTo === "ventes" ? "document de vente" : "bon d'achat"} avec solde --
                  </option>
                  {docsWithBalance.map((d) => {
                    const meta = docIndex[d.id];
                    const label = `${meta.name} • ${meta.numberStr} • Reste: ${fmtDH(
                      meta.solde
                    )}`;
                    return (
                      <option key={d.id} value={d.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>

                <select
                  className="select"
                  value={payMode}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPayMode(val);
                    if (val === "Espèces") {
                      const meta = docIndex[selectedDocPay];
                      setCashAmount(
                        meta && meta.solde > 0 ? String(meta.solde.toFixed(2)) : ""
                      );
                      setCreateInstr([]);
                    } else {
                      setCashAmount("");
                      setCreateInstr([]);
                    }
                  }}
                >
                  <option>Espèces</option>
                  <option>Chèque</option>
                  <option>Traite</option>
                </select>

                {payMode === "Espèces" ? (
                  <>
                    <input
                      className="field"
                      type="number"
                      step="0.01"
                      placeholder="Montant espèces"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      style={{ width: 160 }}
                    />
                    <button className="btn primary" onClick={handleCreatePayment}>
                      ✅ Enregistrer (Espèces)
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn" onClick={addCreateInstrument}>
                      ➕ Ajouter {payMode.toLowerCase()}
                    </button>
                    <div className="soft">
                      Total instruments : <b>{fmtDH(createInstrTotal)}</b>
                    </div>
                    <button className="btn primary" onClick={handleCreatePayment}>
                      ✅ Enregistrer ({payMode})
                    </button>
                  </>
                )}
              </div>

              {payMode !== "Espèces" && createInstr.length > 0 && (
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <div className="grid-add" style={{ minWidth: 900 }}>
                    <div>Type</div>
                    <div>Banque</div>
                    <div>N°</div>
                    <div>Échéance</div>
                    <div>Titulaire</div>
                    <div>Montant</div>
                    <div>Résumé</div>
                    <div>—</div>

                    {createInstr.map((it, i) => (
                      <React.Fragment key={i}>
                        <select
                          className="select"
                          value={it.type}
                          onChange={(e) => updateCreateInstrument(i, "type", e.target.value)}
                        >
                          <option value="chèque">Chèque</option>
                          <option value="traite">Traite</option>
                        </select>

                        <input
                          className="field"
                          placeholder="Banque"
                          value={it.banque || ""}
                          onChange={(e) => updateCreateInstrument(i, "banque", e.target.value)}
                        />

                        <input
                          className="field"
                          placeholder="Numéro"
                          value={it.numero || ""}
                          onChange={(e) => updateCreateInstrument(i, "numero", e.target.value)}
                        />

                        <input
                          className="field"
                          type="date"
                          value={it.echeance || ""}
                          onChange={(e) => updateCreateInstrument(i, "echeance", e.target.value)}
                        />

                        <input
                          className="field"
                          placeholder="Titulaire"
                          value={it.titulaire || ""}
                          onChange={(e) => updateCreateInstrument(i, "titulaire", e.target.value)}
                        />

                        <input
                          className="field"
                          type="number"
                          step="0.01"
                          placeholder="Montant"
                          value={it.montant || ""}
                          onChange={(e) => updateCreateInstrument(i, "montant", e.target.value)}
                        />

                        <div className="soft">
                          {`${(it.type || "chèque").toUpperCase()} • ${
                            it.numero || "—"
                          } • ${it.banque || "—"}`}
                        </div>

                        <div>
                          <button className="btn warn" onClick={() => removeCreateInstrument(i)}>
                            🗑️ Supprimer
                          </button>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 10px 0" }}>
              {relatedTo === "ventes" ? "📋 Documents de Vente" : "📋 Bons d'Achat (Reçus)"}
            </h3>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="left">
                      {relatedTo === "ventes" ? "Client" : "Fournisseur"}
                    </th>
                    <th>N°</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Payé</th>
                    <th>Solde</th>
                    <th>Statut</th>
                    <th>Modes paiement</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((d) => {
                    const meta = docIndex[d.id];
                    if (!meta) return null;
                    const expanded = expandedDocId === d.id;
                    const pays = paiementsByDoc[d.id] || [];
                    const paysFiltered = filteredPaymentsForDoc(d.id);
                    const subTotal = paysFiltered.reduce(
                      (s, p) => s + (Number(p.montant) || 0),
                      0
                    );
                    return (
                      <React.Fragment key={d.id}>
                        {/* 🔽 MODIFIÉ: Remplacement de style en ligne par className 🔽 */}
                        <tr className={expanded ? "expanded-row" : ""}>
                        {/* 🔼 FIN MODIFIÉ 🔼 */}
                          <td className="left">{meta.name}</td>
                          <td>{meta.numberStr}</td>
                          <td className="soft">{meta.dateStr}</td>
                          <td className="money">{fmtDH(meta.total)}</td>
                          <td>{fmtDH(meta.paid)}</td>
                          <td
                            style={{
                              color: meta.solde > 0.01 ? "var(--danger)" : "var(--success)",
                              fontWeight: 800,
                            }}
                          >
                            {fmtDH(meta.solde)}
                          </td>
                          <td>
                            <span
                              className="chip"
                              style={{
                                background: meta.solde > 0.01 ? "var(--warn)" : "var(--success)",
                                color: "#fff",
                              }}
                            >
                              {meta.solde > 0.01 ? "Partiel/Impayé" : "Payé"}
                            </span>
                          </td>
                          <td>
                            {meta.paymentModes.length > 0 ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  flexWrap: "wrap",
                                  justifyContent: "center",
                                }}
                              >
                                {meta.paymentModes.map((mode, idx) => (
                                  <span
                                    key={idx}
                                    className="mode-summary"
                                    style={{
                                      background: getModeColor(mode),
                                      color: "#fff",
                                    }}
                                  >
                                    {getModeIcon(mode)} {mode}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="soft">—</span>
                            )}
                          </td>
                          <td>
                            <button
                              className="rowbtn"
                              onClick={() => toggleExpand(d.id)}
                              title="Voir paiements"
                            >
                              {expanded ? "⬆️ Masquer" : "⬇️ Voir"} ({pays.length})
                            </button>
                          </td>
                        </tr>

                        {expanded && (
                          // 🔽 MODIFIÉ: Remplacement de style en ligne par className 🔽
                          <tr>
                            <td colSpan="9" className="expanded-content">
                            {/* 🔼 FIN MODIFIÉ 🔼 */}
                              <div style={{ padding: 16 }}>
                                <h4 style={{ margin: "0 0 8px 0" }}>Paiements enregistrés</h4>
                                {paysFiltered.length === 0 ? (
                                  <div className="soft">Aucun paiement (selon filtres).</div>
                                ) : (
                                  <table className="tbl" style={{ marginTop: 8 }}>
                                    <thead>
                                      <tr>
                                        <th>Date</th>
                                        <th>Mode</th>
                                        <th>Montant</th>
                                        <th>Instruments</th>
                                        <th>Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {paysFiltered.map((p) => {
                                        const isCheque =
                                          norm(p.mode) === "cheque" || norm(p.mode) === "chèque";
                                        const isTraite = norm(p.mode) === "traite";
                                        return (
                                          <tr key={p.id}>
                                            <td>{formatDateTime(p.date)}</td>
                                            <td>
                                              <span
                                                className="mode-summary"
                                                style={{
                                                  background: getModeColor(p.mode),
                                                  color: "#fff",
                                                }}
                                              >
                                                {getModeIcon(p.mode)} {p.mode}
                                              </span>
                                            </td>
                                            <td style={{ fontWeight: 800 }}>{fmtDH(p.montant)}</td>
                                            <td className="soft">
                                              {isCheque || isTraite
                                                ? labelInstruments(p.instruments)
                                                : "—"}
                                            </td>
                                            <td>
                                              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                                <button
                                                  className="btn"
                                                  onClick={() => handleEditPayment(p)}
                                                  style={{ padding: "4px 8px", fontSize: 11 }}
                                                >
                                                  ✏️ Modifier
                                                </button>
                                                {(isCheque || isTraite) && (
                                                  <button
                                                    className="btn warn"
                                                    onClick={() => openInstrumentsEditor(p)}
                                                    style={{ padding: "4px 8px", fontSize: 11 }}
                                                  >
                                                    🔧 Instruments
                                                  </button>
                                                )}
                                                <button
                                                  className="btn danger"
                                                  onClick={() => handleDeletePayment(p)}
                                                  style={{ padding: "4px 8px", fontSize: 11 }}
                                                >
                                                  🗑️
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    {/* 🆕 SOUS-TOTAL des paiements affichés pour CE document */}
                                    <tfoot>
                                      <tr>
                                        <td className="left">TOTAL (paiements affichés)</td>
                                        <td>—</td>
                                        <td style={{ fontWeight: 900 }}>{fmtDH(subTotal)}</td>
                                        <td colSpan="2">—</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                {/* 🆕 TFOOT GLOBAL POUR LA TABLE DOCUMENTS */}
                <tfoot>
                  <tr>
                    <td className="left" colSpan={3}>TOTAL (docs filtrés)</td>
                    <td className="money">{fmtDH(docsTotals.total)}</td>
                    <td style={{ fontWeight: 900 }}>{fmtDH(docsTotals.paid)}</td>
                    <td style={{ fontWeight: 900, color: docsTotals.solde > 0.01 ? "var(--danger)" : "var(--success)" }}>
                      {fmtDH(docsTotals.solde)}
                    </td>
                    <td colSpan={3} style={{ textAlign: "left" }}>
                      {/* Récap modes sur docs filtrés */}
                      {Object.entries(paymentsTotals).map(([m, v]) =>
                        v > 0 ? (
                          <span
                            key={m}
                            className="mode-summary"
                            style={{ background: getModeColor(m), color: "#fff" }}
                          >
                            {getModeIcon(m)} {m}: {fmtDH(v)}
                          </span>
                        ) : null
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========== ONGLET CHARGES PERSONNELS ========== */}
      {mainTab === "chargesPersonnels" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="controls">
              <input
                className="field"
                placeholder="🔍 Rechercher employé, poste, CIN..."
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                style={{ minWidth: 280 }}
              />

              <input
                className="field"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Date début"
              />
              <input
                className="field"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Date fin"
              />

              <select
                className="select"
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
              >
                <option value="all">Tous modes</option>
                <option value="Chèque">🏦 Chèque</option>
                <option value="Virement bancaire">🏧 Virement</option>
                <option value="Carte bancaire">💳 Carte</option>
                <option value="Prélèvement">🔄 Prélèvement</option>
              </select>

              <button
                className="btn secondary"
                onClick={() => {
                  setFilterName("");
                  setDateFrom("");
                  setDateTo("");
                  setFilterMode("all");
                }}
              >
                🔄 Réinitialiser
              </button>
            </div>
            
            {/* 🔽 MODIFIÉ: Remplacement de style en ligne par variables CSS 🔽 */}
            <div 
              className="notice" 
              style={{ 
                background: "var(--notice-info-bg)", 
                color: "var(--notice-info-text)", 
                marginTop: 12 
              }}
            >
            {/* 🔼 FIN MODIFIÉ 🔼 */}
              👤 Total charges personnels chargées : <strong>{chargesPersonnels.length}</strong>
              {" • "}Filtrées : <strong>{filteredChargesPersonnels.length}</strong>
              {" • "}💡 Les paiements en espèces sont gérés directement dans la page Charges Personnels
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>👤 Charges Personnels (Non-Espèces)</h3>
            <p className="soft" style={{ marginBottom: 12 }}>
              Liste des charges du personnel payées par modes non-espèces (chèque, virement, carte, etc.)
            </p>

            {chargesPersonnels.length === 0 ? (
              <div className="notice warning">
                <strong>⚠️ Aucune charge personnel trouvée</strong>
                <p style={{ margin: "8px 0 0 0", fontSize: 13 }}>
                  Vérifiez que vous avez bien créé des charges du personnel avec un mode de paiement autre qu'espèces dans la page "Charges Personnels".
                </p>
              </div>
            ) : filteredChargesPersonnels.length === 0 ? (
              <div className="notice warning">
                <strong>🔍 Aucune charge personnel correspondant aux filtres</strong>
                <p style={{ margin: "8px 0 0 0", fontSize: 13 }}>
                  Total de charges personnels disponibles : {chargesPersonnels.length}. Essayez de modifier les filtres.
                </p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Employé</th>
                      <th>Poste</th>
                      <th>Date</th>
                      <th>Salaire</th>
                      <th>Total</th>
                      <th>Mode de paiement</th>
                      <th>Référence</th>
                      <th>Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChargesPersonnels.map((charge) => (
                      <tr key={charge.id}>
                        <td className="left">{charge.employe || "—"}</td>
                        <td>{charge.poste || "—"}</td>
                        <td>{charge.date || "—"}</td>
                        <td className="money">{fmtDH(charge.salaire || 0)}</td>
                        <td style={{ fontWeight: 700, color: "var(--p)" }}>
                          {fmtDH(charge.total || 0)}
                        </td>
                        <td>
                          <span
                            className="mode-badge"
                            style={{
                              background: `${getModeColor(charge.modePaiement)}15`,
                              color: getModeColor(charge.modePaiement),
                            }}
                          >
                            {getModeIcon(charge.modePaiement)} {charge.modePaiement}
                          </span>
                        </td>
                        <td className="soft">{charge.referenceVirement || "—"}</td>
                        <td className="soft">{charge.typeDocument || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  {/* 🆕 TFOOT: Totaux séparés (salaire / total) + récap par mode */}
                  <tfoot>
                    <tr>
                      <td className="left" colSpan={3}>TOTAL (charges personnels filtrées)</td>
                      <td className="money">{fmtDH(totalsChargesPersonnels.salaire)}</td>
                      <td style={{ fontWeight: 900, color: "var(--p)" }}>{fmtDH(totalsChargesPersonnels.total)}</td>
                      <td colSpan={3} style={{ textAlign: "left" }}>
                        {Object.entries(totalsChargesPersonnels.byMode).map(([m, v]) =>
                          v > 0 ? (
                            <span
                              key={m}
                              className="mode-badge"
                              style={{
                                background: `${getModeColor(m)}15`,
                                color: getModeColor(m),
                                marginRight: 6
                              }}
                            >
                              {getModeIcon(m)} {m}: {fmtDH(v)}
                            </span>
                          ) : null
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========== ONGLET CHARGES DIVERS ========== */}
      {mainTab === "chargesDivers" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="controls">
              <input
                className="field"
                placeholder="🔍 Rechercher libellé, fournisseur, catégorie..."
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                style={{ minWidth: 320 }}
              />

              <input
                className="field"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Date début"
              />
              <input
                className="field"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Date fin"
              />

              <select
                className="select"
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
              >
                <option value="all">Tous modes</option>
                <option value="Chèque">🏦 Chèque</option>
                <option value="Virement bancaire">🏧 Virement</option>
                <option value="Carte bancaire">💳 Carte</option>
                <option value="Prélèvement">🔄 Prélèvement</option>
              </select>

              <button
                className="btn secondary"
                onClick={() => {
                  setFilterName("");
                  setDateFrom("");
                  setDateTo("");
                  setFilterMode("all");
                }}
              >
                🔄 Réinitialiser
              </button>
            </div>
            
            {/* 🔽 MODIFIÉ: Remplacement de style en ligne par variables CSS 🔽 */}
            <div 
              className="notice" 
              style={{ 
                background: "var(--notice-info-bg)", 
                color: "var(--notice-info-text)", 
                marginTop: 12 
              }}
            >
            {/* 🔼 FIN MODIFIÉ 🔼 */}
              📊 Total charges divers chargées : <strong>{chargesDivers.length}</strong> 
              {" • "}Filtrées : <strong>{filteredChargesDivers.length}</strong>
              {" • "}💡 Les paiements en espèces sont gérés directement dans la page Charges Divers
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>📊 Charges Divers (Non-Espèces)</h3>
            <p className="soft" style={{ marginBottom: 12 }}>
              Liste des charges diverses payées par modes non-espèces (chèque, virement, carte, etc.)
            </p>

            {chargesDivers.length === 0 ? (
              <div className="notice warning">
                <strong>⚠️ Aucune charge diverse trouvée</strong>
                <p style={{ margin: "8px 0 0 0", fontSize: 13 }}>
                  Vérifiez que vous avez bien créé des charges diverses avec un mode de paiement autre qu'espèces dans la page "Charges Divers".
                </p>
              </div>
            ) : filteredChargesDivers.length === 0 ? (
              <div className="notice warning">
                <strong>🔍 Aucune charge diverse correspondant aux filtres</strong>
                <p style={{ margin: "8px 0 0 0", fontSize: 13 }}>
                  Total de charges divers disponibles : {chargesDivers.length}. Essayez de modifier les filtres.
                </p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Catégorie</th>
                      <th>Libellé</th>
                      <th>Fournisseur</th>
                      <th>Date</th>
                      <th>Montant</th>
                      <th>Mode de paiement</th>
                      <th>Référence</th>
                      <th>N° Facture</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChargesDivers.map((charge) => (
                      <tr key={charge.id}>
                        <td>
                          <span
                            className="badge-type"
                            style={{
                              background: "var(--subcard-bg)",
                              color: "var(--text-soft)",
                              border: "1px solid var(--border)"
                            }}
                          >
                            {charge.categorie || "—"}
                          </span>
                        </td>
                        <td className="left">{charge.libelle || "—"}</td>
                        <td className="left">{charge.fournisseur || "—"}</td>
                        <td>{charge.date || "—"}</td>
                        <td style={{ fontWeight: 700, color: "var(--p)" }}>
                          {fmtDH(charge.montant || 0)}
                        </td>
                        <td>
                          <span
                            className="mode-badge"
                            style={{
                              background: `${getModeColor(charge.modePaiement)}15`,
                              color: getModeColor(charge.modePaiement),
                            }}
                          >
                            {getModeIcon(charge.modePaiement)} {charge.modePaiement}
                          </span>
                        </td>
                        <td className="soft">{charge.referenceVirement || "—"}</td>
                        <td className="soft">{charge.numeroFacture || "—"}</td>
                        <td>
                          <span
                            className="chip"
                            style={{
                              background: "var(--success)",
                              color: "var(--success-text)",
                              fontSize: 10,
                            }}
                          >
                            {charge.statut || "Payé"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* 🆕 TFOOT: Total + récap par mode */}
                  <tfoot>
                    <tr>
                      <td className="left" colSpan={4}>TOTAL (charges divers filtrées)</td>
                      <td style={{ fontWeight: 900, color: "var(--p)" }}>{fmtDH(totalsChargesDivers.montant)}</td>
                      <td colSpan={4} style={{ textAlign: "left" }}>
                        {Object.entries(totalsChargesDivers.byMode).map(([m, v]) =>
                          v > 0 ? (
                            <span
                              key={m}
                              className="mode-badge"
                              style={{
                                background: `${getModeColor(m)}15`,
                                color: getModeColor(m),
                                marginRight: 6
                              }}
                            >
                              {getModeIcon(m)} {m}: {fmtDH(v)}
                            </span>
                          ) : null
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL ÉDITION PAIEMENT (uniquement pour documents) */}
      {editingPayment && mainTab === "documents" && (
        <div
          className="card"
          style={{
            marginTop: 16,
            borderColor: "var(--warn)", // 🚀 MODIFIÉ
            boxShadow: "0 8px 20px rgba(251,191,36,.12)",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            ✏️ Modifier le paiement
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            <div>
              <label className="form-label">Date et heure du paiement</label>
              <input
                className="field"
                type="datetime-local"
                value={editPaymentDateTime}
                onChange={(e) => setEditPaymentDateTime(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label className="form-label">Mode de paiement</label>
              <select
                className="select"
                value={editPaymentMode}
                onChange={(e) => setEditPaymentMode(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="Espèces">Espèces</option>
                <option value="Chèque">Chèque</option>
                <option value="Traite">Traite</option>
              </select>
            </div>

            {(norm(editPaymentMode) === "cheque" || norm(editPaymentMode) === "chèque" || norm(editPaymentMode) === "traite") ? (
              <div>
                <div className="controls" style={{ marginBottom: 8 }}>
                  <button className="btn" onClick={addEditInstrument}>
                    ➕ Ajouter instrument
                  </button>
                  <span className="soft">{labelInstruments(editPaymentInstruments)}</span>
                </div>

                {editPaymentInstruments.length > 0 && (
                  <div style={{ width: "100%", overflowX: "auto" }}>
                    <div className="grid-add" style={{ minWidth: 900 }}>
                      <div>Type</div>
                      <div>Banque</div>
                      <div>N°</div>
                      <div>Échéance</div>
                      <div>Titulaire</div>
                      <div>Montant</div>
                      <div>Résumé</div>
                      <div>—</div>

                      {editPaymentInstruments.map((it, i) => (
                        <React.Fragment key={i}>
                          <select
                            className="select"
                            value={it.type}
                            onChange={(e) => updateEditInstrument(i, "type", e.target.value)}
                          >
                            <option value="chèque">Chèque</option>
                            <option value="traite">Traite</option>
                          </select>

                          <input
                            className="field"
                            placeholder="Banque"
                            value={it.banque || ""}
                            onChange={(e) => updateEditInstrument(i, "banque", e.target.value)}
                          />

                          <input
                            className="field"
                            placeholder="Numéro"
                            value={it.numero || ""}
                            onChange={(e) => updateEditInstrument(i, "numero", e.target.value)}
                          />

                          <input
                            className="field"
                            type="date"
                            value={it.echeance || ""}
                            onChange={(e) => updateEditInstrument(i, "echeance", e.target.value)}
                          />

                          <input
                            className="field"
                            placeholder="Titulaire"
                            value={it.titulaire || ""}
                            onChange={(e) => updateEditInstrument(i, "titulaire", e.target.value)}
                          />

                          <input
                            className="field"
                            type="number"
                            step="0.01"
                            placeholder="Montant"
                            value={it.montant || ""}
                            onChange={(e) => updateEditInstrument(i, "montant", e.target.value)}
                          />

                          <div className="soft">
                            {`${(it.type || "chèque").toUpperCase()} • ${it.numero || "—"} • ${
                              it.banque || "—"
                            }`}
                          </div>

                          <div>
                            <button className="btn warn" onClick={() => removeEditInstrument(i)}>
                              🗑️
                            </button>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-soft)" }}>
                  <strong>Total instruments:</strong>{" "}
                  {fmtDH(
                    editPaymentInstruments.reduce(
                      (s, it) => s + (Number(it.montant) || 0),
                      0
                    )
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="form-label">Montant (DHS)</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  value={editPaymentAmount}
                  onChange={(e) => setEditPaymentAmount(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn secondary" onClick={handleCancelEditPayment}>
                ❌ Annuler
              </button>
              <button className="btn primary" onClick={handleSaveEditPayment}>
                ✅ Enregistrer les modifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ÉDITEUR D'INSTRUMENTS (uniquement pour documents) */}
      {editingInstrumentsFor && mainTab === "documents" && (
        <div
          className="card"
          style={{
            marginTop: 16,
            borderColor: "var(--p-light)", // 🚀 MODIFIÉ
            boxShadow: "0 8px 20px rgba(99,102,241,.12)",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            🔧 Instruments pour {editingInstrumentsFor.mode} —{" "}
            <span style={{ color: "var(--text-soft)" }}>
              Paiement de {docIndex[editingInstrumentsFor.docId]?.name || "—"} •{" "}
              {docIndex[editingInstrumentsFor.docId]?.numberStr || "—"}
            </span>
          </h3>

          <div className="controls" style={{ margin: "8px 0 12px 0" }}>
            <button className="btn" onClick={() => addInstrument()}>
              ➕ Ajouter instrument
            </button>
            <span className="soft">Saisissez plusieurs chèques/traites si nécessaire.</span>
          </div>

          {draftInstruments.length === 0 ? (
            <div className="soft">Aucun instrument. Cliquez sur "Ajouter".</div>
          ) : (
            <div style={{ width: "100%", overflowX: "auto" }}>
              <div className="grid-add" style={{ minWidth: 900 }}>
                <div>Type</div>
                <div>Banque</div>
                <div>N°</div>
                <div>Échéance</div>
                <div>Titulaire</div>
                <div>Montant</div>
                <div>Résumé</div>
                <div>—</div>

                {draftInstruments.map((it, i) => (
                  <React.Fragment key={i}>
                    <select
                      className="select"
                      value={it.type}
                      onChange={(e) => updateInstrument(i, "type", e.target.value)}
                    >
                      <option value="chèque">Chèque</option>
                      <option value="traite">Traite</option>
                    </select>

                    <input
                      className="field"
                      placeholder="Banque"
                      value={it.banque || ""}
                      onChange={(e) => updateInstrument(i, "banque", e.target.value)}
                    />

                    <input
                      className="field"
                      placeholder="Numéro"
                      value={it.numero || ""}
                      onChange={(e) => updateInstrument(i, "numero", e.target.value)}
                    />

                    <input
                      className="field"
                      type="date"
                      value={it.echeance || ""}
                      onChange={(e) => updateInstrument(i, "echeance", e.target.value)}
                    />

                    <input
                      className="field"
                      placeholder="Titulaire"
                      value={it.titulaire || ""}
                      onChange={(e) => updateInstrument(i, "titulaire", e.target.value)}
                    />

                    <input
                      className="field"
                      type="number"
                      step="0.01"
                      placeholder="Montant"
                      value={it.montant || ""}
                      onChange={(e) => updateInstrument(i, "montant", e.target.value)}
                    />

                    <div className="soft">
                      {`${(it.type || "chèque").toUpperCase()} • ${it.numero || "—"} • ${
                        it.banque || "—"
                      }`}
                    </div>

                    <div>
                      <button className="btn warn" onClick={() => removeInstrument(i)}>
                        🗑️ Supprimer
                      </button>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          <div className="controls" style={{ marginTop: 12 }}>
            <button className="btn" onClick={closeInstrumentsEditor}>
              ❌ Fermer
            </button>
            <button className="btn primary" onClick={saveInstruments}>
              ✅ Enregistrer les instruments
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
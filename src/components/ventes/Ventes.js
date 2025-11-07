// src/components/ventes/Ventes.js
import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
  where,
  setDoc,
  runTransaction,
  addDoc,
} from "firebase/firestore";

const ITEMS_PER_PAGE = 50;

/* ======================================================
   ⚙️ Assurer l'appartenance utilisateur → société
====================================================== */
async function ensureMembership(user, societeId) {
  try {
    if (!user || !societeId) return;
    const uRef = doc(db, "users", user.uid);
    const snap = await getDoc(uRef);

    const base = {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      updatedAt: Timestamp.now(),
    };

    if (!snap.exists()) {
      await setDoc(
        uRef,
        {
          ...base,
          createdAt: Timestamp.now(),
          societeId,
          role: "vendeuse",
        },
        { merge: true }
      );
      return;
    }

    const data = snap.data() || {};
    if (data.societeId !== societeId || !data.societeId) {
      await setDoc(
        uRef,
        {
          ...base,
          societeId,
        },
        { merge: true }
      );
    }
  } catch (e) {
    console.warn("[ensureMembership] ", e?.message || e);
  }
}

/* ======================================================
   Constantes / helpers temps-réel
====================================================== */
const APPLIED_SALES_COLL = "sales_applied";
const DISMISSED_COLL = "order_dismissed";
const newOpKey = () =>
  `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/* ===================== Normalisation Stock ===================== */
const STOCK_KEYS = [
  "stock",
  "stockSource",
  "originStock",
  "stockId",
  "stockName",
  "stock_label",
  "depot",
  "magasin",
  "source",
];
const normalizeStockValue = (val) => {
  if (val === undefined || val === null) return "unknown";
  if (typeof val === "number") return val === 1 ? "stock1" : val === 2 ? "stock2" : "unknown";
  const raw = String(val).toLowerCase().replace(/[\s_\-]/g, "");
  if (["stock1", "s1", "magasin1", "depot1", "principal", "primary", "p", "m1", "1"].includes(raw)) return "stock1";
  if (["stock2", "s2", "magasin2", "depot2", "secondaire", "secondary", "s", "m2", "2"].includes(raw)) return "stock2";
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
const pickLotStock = (lot) => {
  if (!lot) return "stock1";
  const s1 = Number(lot.stock1 || 0);
  const s2 = Number(lot.stock2 || 0);
  if (s1 > 0 && s2 <= 0) return "stock1";
  if (s2 > 0 && s1 <= 0) return "stock2";
  if (s1 > 0 && s2 > 0) return "stock1";
  return pickDocStock(lot);
};

/* ===================== Utils dates & nombres ===================== */
const safeParseDate = (dateInput) => {
  if (!dateInput) return null;
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === "function") return dateInput.toDate();
    if (dateInput?.seconds != null) return new Date(dateInput.seconds * 1000);
    if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};
const formatDateSafe = (dateInput, { withTime = false } = {}) => {
  const d = safeParseDate(dateInput);
  if (!d) return "";
  return withTime ? d.toLocaleString("fr-FR") : d.toLocaleDateString("fr-FR");
};
const getDateInputValue = (dateInput) => {
  const d = safeParseDate(dateInput);
  if (!d) return "";
  try {
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
};
const getTodayDateString = () => new Date().toISOString().split("T")[0];
const safeNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const safeToFixed = (v, dec = 2) => safeNumber(v).toFixed(dec);

/* ===================== Codes-barres (aligné catalogue) ===================== */
const BARCODE_FIELDS = ["codeBarre", "barcode", "ean", "ean13", "upc", "gtin"];
const findAnyBarcode = (obj) => {
  for (const f of BARCODE_FIELDS) {
    const val = obj?.[f];
    if (val != null && String(val).trim() !== "") return String(val);
  }
  return "";
};

/* ========== Helpers PRODUIT UNIQUE (compteurs distincts) ========== */
const normalizeName = (s) => String(s || "").trim().toLowerCase();
const distinctCountByProduit = (list) => {
  const set = new Set();
  (Array.isArray(list) ? list : []).forEach((a) => {
    set.add(normalizeName(a?.produit));
  });
  return set.size;
};

/* ====== Realtime indicator ====== */
function RealtimeBeat({ lastRealtimeBeat }) {
  return (
    <span style={{ fontSize: 12, color: "#059669" }}>
      {lastRealtimeBeat ? `Sync: ${lastRealtimeBeat.toLocaleTimeString("fr-FR")}` : "Sync..."}
    </span>
  );
}

/* ====== Scanner caméra (optionnel) ====== */
function CameraBarcodeInlineModal({ open, onClose, onDetected }) {
  const videoRef = React.useRef(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let stream;
    let stopRequested = false;
    let rafId = null;
    let reader = null;
    let controls = null;

    async function start() {
      setError("");
      try {
        if (!open) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if ("BarcodeDetector" in window) {
          const supported = await window.BarcodeDetector.getSupportedFormats?.();
          const detector = new window.BarcodeDetector({
            formats: supported && supported.length ? supported : ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"],
          });
          const scan = async () => {
            if (!open || stopRequested) return;
            try {
              const track = stream.getVideoTracks?.()[0];
              if (!track) return;
              const imageCapture = new ImageCapture(track);
              const bitmap = await imageCapture.grabFrame();
              const codes = await detector.detect(bitmap);
              if (codes && codes[0]?.rawValue) {
                onDetected?.(codes[0].rawValue);
              } else {
                rafId = requestAnimationFrame(scan);
              }
            } catch {
              rafId = requestAnimationFrame(scan);
            }
          };
          rafId = requestAnimationFrame(scan);
        } else {
          try {
            const lib = await import(/* webpackChunkName: "zxing" */ "@zxing/browser");
            const { BrowserMultiFormatReader } = lib;
            reader = new BrowserMultiFormatReader();
            controls = await reader.decodeFromVideoDevice(null, videoRef.current, (result) => {
              const txt = result?.getText?.();
              if (txt) onDetected?.(txt);
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
      if (rafId) cancelAnimationFrame(rafId);
      try { controls?.stop(); } catch {}
      try { reader?.reset(); } catch {}
      try { const tracks = stream?.getTracks?.() || []; tracks.forEach((t) => t.stop()); } catch {}
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
      <div style={{ background: "#fff", borderRadius: 14, width: "min(100%, 680px)", padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,.2)", position: "relative" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>Scanner un code-barres</h3>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", borderRadius: 8, padding: "6px 10px", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 13 }}>
            Fermer
          </button>
        </div>

        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: "15% 10%", border: "3px solid rgba(255,255,255,.8)", borderRadius: 12, boxShadow: "0 0 20px rgba(0,0,0,.5) inset" }} />
        </div>

        {error ? (
          <p style={{ marginTop: 8, color: "#b91c1c", fontSize: 12 }}>{error}</p>
        ) : (
          <p style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>Astuce : place le code bien à plat et évite les reflets.</p>
        )}
      </div>
    </div>
  );
}

/* 🆕 ===================== COMPOSANT PAGINATION ===================== */
const Pagination = memo(({ currentPage, totalPages, onPageChange }) => {
  const pages = [];
  const maxVisible = 5;

  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        padding: "20px 0",
        flexWrap: "wrap",
      }}
    >
      <button
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: currentPage === 1 ? "#f3f4f6" : "white",
          cursor: currentPage === 1 ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: currentPage === 1 ? 0.5 : 1,
        }}
      >
        ⏮️
      </button>

      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: currentPage === 1 ? "#f3f4f6" : "white",
          cursor: currentPage === 1 ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: currentPage === 1 ? 0.5 : 1,
        }}
      >
        ◀️
      </button>

      {startPage > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "2px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            1
          </button>
          {startPage > 2 && <span style={{ padding: "0 8px" }}>...</span>}
        </>
      )}

      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "2px solid #e5e7eb",
            background:
              page === currentPage
                ? "linear-gradient(135deg,#667eea,#764ba2)"
                : "white",
            color: page === currentPage ? "white" : "#0f172a",
            cursor: "pointer",
            fontWeight: 700,
            minWidth: 40,
          }}
        >
          {page}
        </button>
      ))}

      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span style={{ padding: "0 8px" }}>...</span>}
          <button
            onClick={() => onPageChange(totalPages)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "2px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: currentPage === totalPages ? "#f3f4f6" : "white",
          cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: currentPage === totalPages ? 0.5 : 1,
        }}
      >
        ▶️
      </button>

      <button
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: currentPage === totalPages ? "#f3f4f6" : "white",
          cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: currentPage === totalPages ? 0.5 : 1,
        }}
      >
        ⏭️
      </button>

      <span style={{ marginLeft: 16, color: "#64748b", fontSize: 14 }}>
        Page {currentPage} sur {totalPages}
      </span>
    </div>
  );
});

Pagination.displayName = "Pagination";

/* 🆕 ===================== COMPOSANT VENTE ROW MÉMOÏSÉ ===================== */
const VenteRow = memo(({ 
  vente, 
  index, 
  appliedSet, 
  dismissedSet,
  onViewDetails,
  onEdit,
  onPrint,
  onDelete
}) => {
  const total =
    vente.montantTotal ||
    (Array.isArray(vente.articles) ? vente.articles : []).reduce((sum, a) =>
      sum + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise || 0)), 0
    );

  const distinctInVente = distinctCountByProduit(vente.articles || []);

  const stockCounts = { stock1: 0, stock2: 0, unknown: 0 };
  (vente.articles || []).forEach((a) => {
    const source = a.stockSource || "unknown";
    if (source === "stock1") stockCounts.stock1++;
    else if (source === "stock2") stockCounts.stock2++;
    else stockCounts.unknown++;
  });

  let applied = 0, dismissed = 0;
  (vente.articles || []).forEach((_, idx) => {
    const opId = `${vente.id}#${idx}`;
    if (appliedSet.has(opId)) applied++;
    if (dismissedSet.has(opId)) dismissed++;
  });
  const pending = (vente.articles || []).length - applied - dismissed;

  const principalStock = vente.stockSource || vente.stock || "stock1";

  return (
    <tr style={{borderBottom:"1px solid #f1f5f9",transition:"all 0.3s ease",background: index % 2 === 0 ? "rgba(248, 250, 252, 0.5)" : "white",borderLeft: principalStock === "stock2" ? "4px solid #10b981" : "4px solid #3b82f6"}}>
      <td style={{ padding: 16, borderRight: "1px solid #f1f5f9" }}>
        <div style={{background: principalStock === "stock2" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#3b82f6,#2563eb)", color: "white", padding: "5px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, letterSpacing: "0.3px", display: "inline-block"}}>
          #{(vente.id || "").slice(-6).toUpperCase()}
        </div>
      </td>
      <td style={{ padding: 16, borderRight: "1px solid #f1f5f9" }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "#1f2937", marginBottom: 3 }}>{vente.client}</div>
        <div style={{ fontSize: 11, color: "#6b7280", background: "#f8fafc", padding: "2px 7px", borderRadius: 8, display: "inline-block" }}>{vente.modePaiement || "Espèces"}</div>
      </td>
      <td style={{ padding: 16, textAlign: "center", borderRight: "1px solid #f1f5f9" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{formatDateSafe(vente.date)}</div>
      </td>
      <td style={{ padding: 16, textAlign: "center", borderRight: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "white", padding: "3px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700 }} title="Produits distincts (S1 et S2 considérés comme le même produit)">
            {distinctInVente} prod.
          </span>
          {stockCounts.stock1 > 0 && (<span style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white", padding: "2px 5px", borderRadius: 8, fontSize: 9, fontWeight: 600 }} title={`${stockCounts.stock1} lignes depuis Stock1`}>S1:{stockCounts.stock1}</span>)}
          {stockCounts.stock2 > 0 && (<span style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white", padding: "2px 5px", borderRadius: 8, fontSize: 9, fontWeight: 600 }} title={`${stockCounts.stock2} lignes depuis Stock2`}>S2:{stockCounts.stock2}</span>)}
          {applied > 0 && (<span style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "white", padding: "2px 6px", borderRadius: 8, fontSize: 9, fontWeight: 700 }} title="Lignes appliquées au stock">✓ {applied}</span>)}
          {dismissed > 0 && (<span style={{ background: "linear-gradient(135deg, #6b7280, #4b5563)", color: "white", padding: "2px 6px", borderRadius: 8, fontSize: 9, fontWeight: 700 }} title="Lignes ignorées">⊗ {dismissed}</span>)}
          {pending > 0 && (<span style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white", padding: "2px 6px", borderRadius: 8, fontSize: 9, fontWeight: 700 }} title="En attente d'application">… {pending}</span>)}
        </div>
      </td>
      <td style={{ padding: 16, textAlign: "center", borderRight: "1px solid #f1f5f9" }}>
        <span style={{background: vente.statutPaiement === "payé" ? "linear-gradient(135deg,#22c55e,#16a34a)" : vente.statutPaiement === "partiel" ? "linear-gradient(135deg,#eab308,#ca8a04)" : "linear-gradient(135deg,#ef4444,#dc2626)", color:"white", padding:"5px 14px", borderRadius:16, fontSize:11, fontWeight:600, textTransform:"capitalize"}}>
          {vente.statutPaiement}
        </span>
      </td>
      <td style={{ padding: 16, textAlign: "right", borderRight: "1px solid #f1f5f9" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#16a34a" }}>{safeToFixed(total)} DHS</div>
      </td>
      <td style={{ padding: 16, textAlign: "center" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <span onClick={() => onViewDetails(vente)} style={{ cursor: "pointer", fontSize: 17 }} title="Voir les détails">👁️</span>
          <span onClick={() => onEdit(vente)} style={{ cursor: "pointer", fontSize: 17 }} title="Modifier">✏️</span>
          <span onClick={() => onPrint(vente)} style={{ cursor: "pointer", fontSize: 17 }} title="Imprimer">🖨️</span>
          <span onClick={() => onDelete(vente)} style={{ cursor: "pointer", fontSize: 17 }} title="Supprimer (stock restauré auto)">🗑️</span>
        </div>
      </td>
    </tr>
  );
});

VenteRow.displayName = "VenteRow";

/* ======================================================
   Composant principal (avec Lazy On/Off)
====================================================== */
export default function Ventes() {
  /* ===== Lazy: activation manuelle ===== */
  const [active, setActive] = useState(() => {
    try {
      const saved = localStorage.getItem("ventes_active");
      return saved === "1" ? true : false;
    } catch {
      return false;
    }
  });
  const toggleActive = useCallback(() => {
    setActive((v) => {
      const next = !v;
      try { localStorage.setItem("ventes_active", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  /* 🆕 ===== PAGINATION STATE ===== */
  const [currentPage, setCurrentPage] = useState(1);

  /* ===== Audio (bip) ===== */
  const audioCtxRef = useRef(null);
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        try { audioCtxRef.current = new Ctx(); } catch {}
      }
    }
    return audioCtxRef.current;
  }, []);
  const playBeep = useCallback((freq = 880, dur = 120, type = "sine", volume = 0.15) => {
    try {
      if (!active) return;
      const ctx = getAudioCtx();
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
        try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch {}
      }, dur);
    } catch {}
  }, [getAudioCtx, active]);
  const beepSuccess = useCallback(() => { playBeep(1175, 90); setTimeout(()=>playBeep(1568,110), 100); }, [playBeep]);
  const beepError   = useCallback(() => playBeep(220, 220, "square", 0.2), [playBeep]);

  useEffect(() => {
    if (!active) return;
    const unlock = () => { try { getAudioCtx()?.resume?.(); } catch {} };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [getAudioCtx, active]);

  /* ===== Contexte utilisateur ===== */
  const { user, societeId, loading } = useUserRole();

  /* ===== Etats ===== */
  const [client, setClient] = useState("(passant)");
  const [dateVente, setDateVente] = useState(getTodayDateString());
  const [statutPaiement, setStatutPaiement] = useState("payé");
  const [modePaiement, setModePaiement] = useState("Espèces");
  const [notesVente, setNotesVente] = useState("");

  const [produit, setProduit] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [remiseArticle, setRemiseArticle] = useState(0);
  const [selectedLot, setSelectedLot] = useState("");
  const [availableLots, setAvailableLots] = useState([]);
  const [numeroArticle, setNumeroArticle] = useState("");

  const [articles, setArticles] = useState([]);
  const [ventes, setVentes] = useState([]);
  const [medicaments, setMedicaments] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);

  const [parametres, setParametres] = useState({
    entete: "PHARMACIE - BON DE VENTE",
    pied: "Merci de votre confiance",
    cachetTexte: "Cachet Société",
    cachetImage: null,
    afficherCachet: true,
    typeCachet: "texte",
    tailleCachet: 120,
  });

  const [clients, setClients] = useState([]);
  const [editId, setEditId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedVente, setSelectedVente] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showFinalizationSection, setShowFinalizationSection] = useState(false);

  const [appliedSet, setAppliedSet] = useState(new Set());
  const [dismissedSet, setDismissedSet] = useState(new Set());

  const [lastRealtimeBeat, setLastRealtimeBeat] = useState(null);
  const lastAddTsRef = useRef(0);

  /* ===== CHARGEMENT (lié à active) ===== */
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  useEffect(() => {
    if (!active) return;
    if (user && societeId) { ensureMembership(user, societeId); }
  }, [user, societeId, active]);

  /* ===== DATA (temps réel) — ACTIVÉS SEULEMENT SI active === true ===== */
  useEffect(() => {
    if (!active || !societeId) return;

    const unsubs = [];

    const paramRef = doc(db, "societe", societeId, "parametres", "documents");
    unsubs.push(
      onSnapshot(paramRef, (snap) => {
        if (snap.exists()) setParametres(snap.data() || {});
      }, (e)=>console.error("fetchParametres error:", e))
    );

    const qVentes = query(collection(db, "societe", societeId, "ventes"), orderBy("date", "desc"), limit(300));
    unsubs.push(
      onSnapshot(qVentes, (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setVentes(arr);
        setClients([...new Set(arr.map((v) => v.client).filter(Boolean))]);
        setLastRealtimeBeat(new Date());
      }, (e)=>{ console.error("Erreur chargement ventes:", e); setError("Erreur lors du chargement des ventes"); })
    );

    const qStockEntries = collection(db, "societe", societeId, "stock_entries");
    unsubs.push(
      onSnapshot(qStockEntries, (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        arr.sort((a,b)=> {
          const nameA = String(a.nom||a.name||"");
          const nameB = String(b.nom||b.name||"");
          if (nameA !== nameB) return nameA.localeCompare(nameB);
          const da = safeParseDate(a.datePeremption);
          const dbb = safeParseDate(b.datePeremption);
          if (da && dbb) return da - dbb;
          if (da && !dbb) return -1;
          if (!da && dbb) return 1;
          return 0;
        });
        setStockEntries(arr);
        setLastRealtimeBeat(new Date());
      },(e)=>{ console.error("fetchStockEntries error:", e); setStockEntries([]); })
    );

    const qMedic = query(collection(db, "societe", societeId, "stock"), orderBy("nom", "asc"));
    unsubs.push(
      onSnapshot(qMedic, (snap)=> {
        const arr = [];
        snap.forEach((d)=> {
          const data = d.data() || {};
          arr.push({
            id: d.id,
            nom: String(data?.nom ?? data?.name ?? ""),
            name: String(data?.nom ?? data?.name ?? ""),
            prixVente: safeNumber(data?.prixVente ?? data?.price ?? 0),
            price: safeNumber(data?.prixVente ?? data?.price ?? 0),
            quantite: safeNumber(data?.quantite ?? data?.qty ?? 0),
            qty: safeNumber(data?.quantite ?? data?.qty ?? 0),
            ...Object.fromEntries(
              BARCODE_FIELDS
                .filter((k) => data?.[k] != null && String(data[k]).trim() !== "")
                .map((k) => [k, String(data[k])])
            ),
          });
        });
        setMedicaments(arr);
      }, (e)=> console.error("Erreur chargement médicaments:", e))
    );

    unsubs.push(
      onSnapshot(collection(db, "societe", societeId, APPLIED_SALES_COLL), (snap)=> {
        const s = new Set();
        snap.forEach((d)=> { const data = d.data(); if (data?.applied) s.add(d.id); });
        setAppliedSet(s);
      }, (e)=> console.error("Erreur listener applied:", e))
    );

    unsubs.push(
      onSnapshot(collection(db, "societe", societeId, DISMISSED_COLL), (snap)=> {
        const s = new Set();
        snap.forEach((d)=> { const data = d.data(); if (data?.dismissed) s.add(d.id); });
        setDismissedSet(s);
      }, (e)=> console.error("Erreur listener dismissed:", e))
    );

    return () => { unsubs.forEach((u) => { try { u(); } catch {} }); };
  }, [societeId, active]);

  /* ===== 🆕 Agrégation catalogue (SEULEMENT LES MÉDICAMENTS EN STOCK > 0) ===== */
  const getAllAvailableMedicaments = useMemo(() => {
    const num = (v) => {
      if (typeof v === "number") return v || 0;
      if (v == null) return 0;
      const n = parseFloat(String(v).replace(",", "."));
      return isNaN(n) ? 0 : n;
    };
    const map = new Map();

    (Array.isArray(medicaments) ? medicaments : []).forEach((m) => {
      const key = m?.nom ?? m?.name ?? "";
      if (!key) return;
      map.set(key, {
        nom: key,
        quantiteTotal: num(m?.quantite ?? m?.qty ?? 0),
        hasLots: false,
        lastPrice: num(m?.prixVente ?? m?.price ?? 0),
        barcode: findAnyBarcode(m),
      });
    });

    (Array.isArray(stockEntries) ? stockEntries : []).forEach((lot) => {
      const key = lot?.nom ?? lot?.name ?? "";
      if (!key) return;
      const qLot = num(lot?.stock1 ?? 0) + num(lot?.stock2 ?? 0);
      const prixLot = num(lot?.prixVente ?? lot?.price ?? 0);

      if (!map.has(key)) map.set(key, { nom: key, quantiteTotal: 0, hasLots: false, lastPrice: 0, barcode: "" });
      const item = map.get(key);
      item.quantiteTotal += qLot;
      if (qLot > 0) item.hasLots = true;
      if (!item.lastPrice && prixLot) item.lastPrice = prixLot;
      if (!item.barcode) item.barcode = findAnyBarcode(lot);
    });

    // 🆕 FILTRE : Ne garder que les médicaments avec quantiteTotal > 0
    return Array.from(map.values())
      .filter((m) => m.quantiteTotal > 0)
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [medicaments, stockEntries]);

  /* ===== Totaux / filtres ===== */
  const totalVenteCourante = useMemo(
    () => articles.reduce((t, a) =>
      t + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise)), 0),
    [articles]
  );

  const distinctPanierCount = useMemo(() => distinctCountByProduit(articles), [articles]);

  const ventesFiltrees = useMemo(() => {
    if (!active) return [];
    return ventes.filter((v) => {
      let keep = true;
      if (filterStatut && v.statutPaiement !== filterStatut) keep = false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const clientMatch = v.client?.toLowerCase().includes(s);
        const produitMatch = v.articles?.some((a) => {
          const lot = (a.numeroLot || "").toString().toLowerCase();
          const code = (a.numeroArticle || "").toString().toLowerCase();
          return a.produit?.toLowerCase().includes(s) || lot.includes(s) || code.includes(s);
        });
        keep = keep && (clientMatch || produitMatch);
      }
      return keep;
    });
  }, [ventes, filterStatut, searchTerm, active]);

  /* 🆕 ===== RÉINITIALISER LA PAGE LORS DU CHANGEMENT DE FILTRES ===== */
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatut]);

  /* 🆕 ===== PAGINATION DES VENTES ===== */
  const totalPages = Math.ceil(ventesFiltrees.length / ITEMS_PER_PAGE);
  const paginatedVentes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return ventesFiltrees.slice(startIndex, endIndex);
  }, [ventesFiltrees, currentPage]);

  /* ===================== Formulaire ===================== */
  const handleProduitChange = useCallback((value) => {
    setProduit(value);
    setSelectedLot("");
    setAvailableLots([]);
    if (!value) { setNumeroArticle(""); return; }

    const lotsForProduct = (stockEntries || []).filter((entry) => {
      const nomMatch = (entry.nom || entry.name) === value;
      const hasStock = (safeNumber(entry.stock1) + safeNumber(entry.stock2)) > 0;
      return nomMatch && hasStock;
    });
    setAvailableLots(lotsForProduct);

    if (lotsForProduct.length > 0) {
      const firstLot = lotsForProduct[0];
      setSelectedLot(firstLot.id);
      setPrixUnitaire(safeNumber(firstLot.prixVente ?? firstLot.price));
      const code = findAnyBarcode(firstLot);
      setNumeroArticle(String(code || ""));
    } else {
      const med = (medicaments || []).find((m) => (m.nom || m.name) === value);
      if (med) {
        setPrixUnitaire(safeNumber(med.prixVente ?? med.price));
        const code = findAnyBarcode(med);
        setNumeroArticle(String(code || ""));
      }
    }
  }, [stockEntries, medicaments]);

  const handleLotSelection = useCallback((lotId) => {
    setSelectedLot(lotId);
    const selectedLotData = (availableLots || []).find((lot) => lot.id === lotId);
    if (selectedLotData) {
      setPrixUnitaire(safeNumber(selectedLotData.prixVente ?? selectedLotData.price));
      const code = findAnyBarcode(selectedLotData);
      setNumeroArticle(String(code || ""));
    }
  }, [availableLots]);

  /* ===================== Ajouter article ===================== */
  const handleAddArticle = useCallback((e) => {
    e?.preventDefault?.();
    if (!active) return;

    const now = Date.now();
    if (now - lastAddTsRef.current < 400) return;
    lastAddTsRef.current = now;

    if (!produit || !quantite || (!prixUnitaire && prixUnitaire !== 0)) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }

    let selectedLotData = null;
    let stockSource = "stock1";
    let stockEntryId = null;

    if (selectedLot) {
      selectedLotData = (availableLots || []).find((lot) => lot.id === selectedLot);
      stockEntryId = selectedLot;
    } else if (availableLots.length > 0) {
      selectedLotData = availableLots[0];
      stockEntryId = selectedLotData.id;
    }

    if (selectedLotData) {
      stockSource = pickLotStock(selectedLotData);
      const stockDisponible =
        stockSource === "stock1" ? safeNumber(selectedLotData.stock1) : safeNumber(selectedLotData.stock2);

      if (stockDisponible < safeNumber(quantite)) {
        setError(`Stock ${stockSource} insuffisant ! Disponible: ${stockDisponible}`);
        beepError();
        return;
      }
    } else {
      const medStock = getAllAvailableMedicaments.find((m) => m.nom === produit);
      if (!medStock || medStock.quantiteTotal < safeNumber(quantite)) {
        setError(`Stock insuffisant ! Disponible: ${medStock?.quantiteTotal || 0}`);
        beepError();
        return;
      }
    }

    const articleData = {
      produit,
      quantite: safeNumber(quantite),
      prixUnitaire: safeNumber(prixUnitaire),
      remise: safeNumber(remiseArticle),
      numeroArticle: String(numeroArticle || ""),
      opKey: newOpKey(),
      stockSource,
      stockEntryId,
    };

    if (selectedLotData) {
      articleData.numeroLot = selectedLotData.numeroLot;
      articleData.fournisseur = selectedLotData.fournisseur;
      articleData.datePeremption = selectedLotData.datePeremption;
      if (!articleData.numeroArticle) articleData.numeroArticle = findAnyBarcode(selectedLotData) || "";
    } else if (!articleData.numeroArticle) {
      const medStock = (medicaments || []).find((m) => (m.nom || m.name) === produit);
      if (medStock) articleData.numeroArticle = findAnyBarcode(medStock) || "";
    }

    setArticles((prev) => [...prev, articleData]);
    setProduit("");
    setQuantite(1);
    setPrixUnitaire("");
    setRemiseArticle(0);
    setSelectedLot("");
    setAvailableLots([]);
    setNumeroArticle("");
    setError("");
    beepSuccess();

    setSuccess("✓ Article ajouté ! Vous pouvez ajouter d'autres articles ou finaliser la vente.");
    setTimeout(() => setSuccess(""), 2000);
  }, [
    produit, quantite, prixUnitaire, remiseArticle, selectedLot, availableLots,
    getAllAvailableMedicaments, medicaments, numeroArticle, beepError, beepSuccess, active
  ]);

  const handleRemoveArticle = useCallback((idx) => {
    if (!active) return;
    setArticles((prev) => prev.filter((_, i) => i !== idx));
  }, [active]);

  /* ===================== Enregistrement vente ===================== */
  const logActivity = useCallback(async (type, details) => {
    if (!active || !societeId || !user) return;
    try {
      await ensureMembership(user, societeId);
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type,
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          ...details,
          action: type,
        },
      });
      console.log(`✅ Activité enregistrée: ${type}`);
    } catch (e) {
      console.error("Erreur logging activity:", e);
    }
  }, [societeId, user, active]);

  const handleAddVente = useCallback(async (e) => {
    e.preventDefault();
    if (!active) return;

    if (!user || !societeId || !client || !dateVente || articles.length === 0) {
      setError("Veuillez remplir tous les champs et ajouter au moins un article");
      return;
    }
    setIsSaving(true);
    setError("");

    try {
      await ensureMembership(user, societeId);

      await runTransaction(db, async (transaction) => {
        const montantTotal = articles.reduce(
          (sum, a) => sum + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise)), 0
        );
        const remiseTotal = articles.reduce((sum, a) => sum + safeNumber(a.remise), 0);

        const normalizedArticles = articles.map((a) => ({ ...a, opKey: a?.opKey || newOpKey() }));

        const counts = { stock1: 0, stock2: 0 };
        normalizedArticles.forEach((a) => {
          const s = a.stockSource || "stock1";
          if (s === "stock1") counts.stock1++; else if (s === "stock2") counts.stock2++;
        });
        const ventePrincipalStock = counts.stock1 >= counts.stock2 ? "stock1" : "stock2";

        const parsedDate = (() => {
          const d = new Date(dateVente);
          return isNaN(d.getTime()) ? new Date() : d;
        })();

        const venteRef = isEditing && editId
          ? doc(db, "societe", societeId, "ventes", editId)
          : doc(collection(db, "societe", societeId, "ventes"));

        const lotSnapshots = [];
        for (const article of normalizedArticles) {
          if (article.stockEntryId) {
            const lotRef = doc(db, "societe", societeId, "stock_entries", article.stockEntryId);
            const lotSnap = await transaction.get(lotRef);
            lotSnapshots.push({ lotRef, lotSnap, article });
          } else {
            lotSnapshots.push({ lotRef: null, lotSnap: null, article });
          }
        }

        for (const { lotRef, lotSnap, article } of lotSnapshots) {
          if (lotRef && lotSnap && lotSnap.exists()) {
            const lotData = lotSnap.data();
            const s1 = safeNumber(lotData.stock1);
            const s2 = safeNumber(lotData.stock2);
            const qte = safeNumber(article.quantite);

            let newS1 = s1, newS2 = s2;
            if (article.stockSource === "stock1") {
              const takeS1 = Math.min(s1, qte);
              const rest   = qte - takeS1;
              const takeS2 = Math.min(s2, rest);
              newS1 = s1 - takeS1; newS2 = s2 - takeS2;
            } else if (article.stockSource === "stock2") {
              const takeS2 = Math.min(s2, qte);
              const rest   = qte - takeS2;
              const takeS1 = Math.min(s1, rest);
              newS1 = s1 - takeS1; newS2 = s2 - takeS2;
            } else {
              const takeS1 = Math.min(s1, qte);
              const rest   = qte - takeS1;
              const takeS2 = Math.min(s2, rest);
              newS1 = s1 - takeS1; newS2 = s2 - takeS2;
            }

            const newQ = Math.max(0, newS1 + newS2);
            transaction.update(lotRef, {
              stock1: newS1,
              stock2: newS2,
              quantite: newQ,
              updatedAt: Timestamp.now(),
              updatedBy: user.email || user.uid,
              lastSaleImpact: {
                venteId: venteRef.id,
                produit: article.produit,
                quantite: qte,
                at: Timestamp.now(),
              },
            });
          }
        }

        const venteData = {
          client,
          date: Timestamp.fromDate(parsedDate),
          statutPaiement,
          modePaiement,
          articles: normalizedArticles,
          montantTotal,
          remiseTotal,
          notes: notesVente,
          updatedAt: Timestamp.now(),
          updatedBy: user.email || user.uid,
          stockSource: ventePrincipalStock,
          stock: ventePrincipalStock,
          stockTag: ventePrincipalStock,
          articlesStock1: counts.stock1,
          articlesStock2: counts.stock2,
        };

        if (isEditing && editId) {
          transaction.update(venteRef, venteData);
        } else {
          venteData.createdAt = Timestamp.now();
          venteData.createdBy = user.email || user.uid;
          transaction.set(venteRef, venteData);
        }

        if (statutPaiement === "payé" && !isEditing) {
          const paiementRef = doc(collection(db, "societe", societeId, "paiements"));
          transaction.set(paiementRef, {
            docId: venteRef.id,
            montant: montantTotal,
            mode: modePaiement,
            type: "ventes",
            date: Timestamp.now(),
            createdBy: user.email || user.uid,
            stockSource: ventePrincipalStock,
            stock: ventePrincipalStock,
          });
        }

        for (let i = 0; i < normalizedArticles.length; i++) {
          const opId = `${venteRef.id}#${i}`;
          const appliedRef = doc(db, "societe", societeId, APPLIED_SALES_COLL, opId);
          transaction.set(appliedRef, {
            applied: true,
            venteId: venteRef.id,
            lineIndex: i,
            opId,
            produit: normalizedArticles[i].produit,
            quantite: normalizedArticles[i].quantite,
            stockEntryId: normalizedArticles[i].stockEntryId,
            stockSource: normalizedArticles[i].stockSource,
            appliedAt: Timestamp.now(),
            appliedBy: user.uid,
          });
        }
      });

      const hasLots = articles.some((a) => a.numeroLot);
      const nombreLots = new Set(articles.map((a) => a.numeroLot).filter(Boolean)).size;
      const montantTotal = articles.reduce(
        (sum, a) => sum + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise)), 0
      );

      await logActivity(isEditing ? "vente_modifiee" : "vente", {
        client,
        montant: montantTotal,
        articles: articles.length,
        statutPaiement,
        modePaiement,
        hasLots,
        nombreLots: nombreLots > 0 ? nombreLots : 0,
      });

      setSuccess(isEditing ? "Vente modifiée avec succès !" : "Vente enregistrée avec succès !");
      resetForm();
      setTimeout(() => { setShowForm(false); setSuccess(""); }, 1200);
    } catch (err) {
      console.error("Erreur enregistrement vente:", err);
      setError("Erreur lors de l'enregistrement de la vente");
    } finally {
      setIsSaving(false);
    }
  }, [user, societeId, client, dateVente, articles, isEditing, editId, statutPaiement, modePaiement, notesVente, logActivity, active]);

  const handleEditVente = useCallback((vente) => {
    if (!active) return;
    setEditId(vente.id);
    setIsEditing(true);
    setClient(vente.client || "(passant)");
    setDateVente(getDateInputValue(vente.date));
    setStatutPaiement(vente.statutPaiement || "payé");
    setModePaiement(vente.modePaiement || "Espèces");
    setNotesVente(vente.notes || "");
    setArticles(vente.articles || []);
    setShowForm(true);
    setShowFinalizationSection(true);
  }, [active]);

  /* ===================== Suppression ===================== */
  const handleDeleteVente = useCallback(async (vente) => {
    if (!active) return;
    if (!window.confirm(`Supprimer la vente de ${vente.client} ?

Le stock sera automatiquement restauré pour tous les articles de cette vente.`)) return;

    setIsSaving(true);
    setError("");

    try {
      await ensureMembership(user, societeId);

      // ✅ CORRECTION : Faire TOUTES les lectures AVANT la transaction
      const arts = vente.articles || [];
      
      // 1️⃣ Préparer toutes les lectures de lots
      const lotReadsPromises = arts
        .filter(article => article.stockEntryId)
        .map(article => {
          const lotRef = doc(db, "societe", societeId, "stock_entries", article.stockEntryId);
          return getDoc(lotRef).then(snap => ({
            lotRef,
            lotSnap: snap,
            article
          }));
        });

      // 2️⃣ Préparer la lecture des paiements
      const paiementsPromise = getDocs(
        query(
          collection(db, "societe", societeId, "paiements"),
          where("docId", "==", vente.id),
          where("type", "==", "ventes")
        )
      ).catch(e => {
        console.warn("Erreur lecture paiements:", e);
        return { docs: [] };
      });

      // 3️⃣ Exécuter TOUTES les lectures en parallèle
      const [lotReads, paiementsSnapshot] = await Promise.all([
        Promise.all(lotReadsPromises),
        paiementsPromise
      ]);

      // 4️⃣ Maintenant faire la transaction avec SEULEMENT des écritures
      await runTransaction(db, async (transaction) => {
        // Restaurer le stock pour chaque lot
        lotReads.forEach(({ lotRef, lotSnap, article }) => {
          if (lotSnap.exists()) {
            const lotData = lotSnap.data();
            const s1 = safeNumber(lotData.stock1);
            const s2 = safeNumber(lotData.stock2);
            const qte = safeNumber(article.quantite);

            let newS1 = s1, newS2 = s2;
            if (article.stockSource === "stock1") newS1 = s1 + qte;
            else if (article.stockSource === "stock2") newS2 = s2 + qte;
            else newS1 = s1 + qte;

            transaction.update(lotRef, {
              stock1: newS1,
              stock2: newS2,
              quantite: newS1 + newS2,
              updatedAt: Timestamp.now(),
              updatedBy: user.email || user.uid,
              lastStockRestoration: {
                venteId: vente.id,
                produit: article.produit,
                quantite: qte,
                at: Timestamp.now(),
                reason: "vente_supprimee",
              },
            });
          }
        });

        // Supprimer les markers de sync
        for (let i = 0; i < arts.length; i++) {
          const opId = `${vente.id}#${i}`;
          transaction.delete(doc(db, "societe", societeId, APPLIED_SALES_COLL, opId));
          transaction.delete(doc(db, "societe", societeId, DISMISSED_COLL, opId));
        }

        // Supprimer la vente
        transaction.delete(doc(db, "societe", societeId, "ventes", vente.id));

        // Supprimer les paiements liés
        paiementsSnapshot.docs.forEach((pDoc) => {
          transaction.delete(pDoc.ref);
        });
      });

      await logActivity("vente_supprimee", {
        client: vente.client,
        montant: vente.montantTotal,
        articles: (vente.articles || []).length,
      });

      beepSuccess();
      setSuccess("Vente supprimée et stock restauré avec succès !");
      setTimeout(() => setSuccess(""), 2400);
    } catch (err) {
      console.error("Erreur suppression:", err);
      setError("Erreur lors de la suppression de la vente");
      beepError();
    } finally {
      setIsSaving(false);
    }
  }, [societeId, beepSuccess, beepError, user, logActivity, active]);

  const handleViewDetails = useCallback((vente) => {
    if (!active) return;
    setSelectedVente(vente); setShowDetails(true);
  }, [active]);

  /* ===================== Dismiss / Undismiss ===================== */
  const toggleDismissLine = useCallback(async (venteId, lineIndex, dismiss) => {
    if (!active) return;
    if (!societeId || !venteId) return;
    const opId = `${venteId}#${lineIndex}`;
    const ref = doc(db, "societe", societeId, DISMISSED_COLL, opId);
    try {
      await ensureMembership(user, societeId);
      if (dismiss) {
        await setDoc(ref, { dismissed: true, by: user?.email || user?.uid || "user", at: Timestamp.now() }, { merge: true });
        setSuccess("Ligne ignorée pour la sync stock.");
      } else {
        await setDoc(ref, { dismissed: false, at: Timestamp.now() }, { merge: true });
        setSuccess("Ligne réactivée pour la sync stock.");
      }
      setTimeout(() => setSuccess(""), 1500);
    } catch (e) {
      console.error(e);
      setError("Impossible de modifier le statut de sync de la ligne.");
    }
  }, [societeId, user, active]);

  /* ===================== Impression ===================== */
  const generateCachetHtml = useCallback(() => {
    if (!parametres.afficherCachet) return "";
    const taille = parametres.tailleCachet || 120;
    if (parametres.typeCachet === "image" && parametres.cachetImage) {
      return `<div style="text-align: center; flex: 1;"><img src="${parametres.cachetImage}" alt="Cachet" style="max-width: ${taille}px; max-height: ${taille}px; border-radius: 8px;" /></div>`;
    }
    return `<div style="text-align: center; flex: 1;"><div style="display: inline-block; border: 3px solid #1976d2; color: #1976d2; border-radius: 50%; padding: 25px 40px; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; background: rgba(25,118,210,.05); box-shadow: 0 4px 8px rgba(25,118,210,.2); transform: rotate(-5deg); max-width: ${taille}px;">${parametres.cachetTexte || "Cachet Société"}</div></div>`;
  }, [parametres]);

  const handlePrintVente = useCallback((vente) => {
    if (!active) return;
    const articlesV = Array.isArray(vente.articles) ? vente.articles : [];
    const total =
      vente.montantTotal ||
      articlesV.reduce((s, a) => s + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise)), 0);
    const cachetHtml = generateCachetHtml();
    const w = window.open("", "_blank");
    w.document.write(`
    <html><head><title>Bon de Vente N°${(vente.id || "").slice(-6).toUpperCase()}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:20px}
    .header{text-align:center;margin-bottom:30px;padding:20px;border-bottom:3px solid #2563eb}
    .header h1{color:#2563eb;margin-bottom:10px;font-size:24px}
    .info-section{display:flex;justify-content:space-between;margin-bottom:30px}
    table{width:100%;border-collapse:collapse;margin:20px 0}
    th{background:#2563eb;color:#fff;padding:12px;text-align:left}
    td{padding:10px;border-bottom:1px solid #e5e7eb}
    .lot-info{font-size:11px;color:#6b7280;margin-top:4px;padding:4px;background:#f3f4f6}
    .totals{margin-top:20px;padding:20px;background:#2563eb;color:#fff;text-align:right}
    .signature-section{margin-top:50px;display:flex;justify-content:space-between}
    .signature-box{text-align:center;width:200px}.signature-line{border-bottom:2px solid #333;margin-bottom:8px;height:50px}
    .footer{text-align:center;margin-top:30px;padding:20px;border-top:2px solid #2563eb}
    </style></head><body>
    <div class="header"><h1>${parametres.entete}</h1><h2>BON DE VENTE N°${(vente.id || "").slice(-6).toUpperCase()}</h2></div>
    <div class="info-section"><div><p><strong>Client:</strong> ${vente.client || ""}</p><p><strong>Date:</strong> ${formatDateSafe(vente.date)}</p></div><div><p><strong>Statut:</strong> ${vente.statutPaiement || ""}</p><p><strong>Mode:</strong> ${vente.modePaiement || "Espèces"}</p></div></div>
    <table><thead><tr><th>Produit / Traçabilité</th><th>Qté</th><th>Prix Unit.</th><th>Remise</th><th>Total</th></tr></thead><tbody>
    ${articlesV.map((a) => {
      const isExpired = a.datePeremption && safeParseDate(a.datePeremption) < new Date();
      const stockBadge = a.stockSource
        ? `<span style="background:${a.stockSource === "stock1" ? "#3b82f6" : "#10b981"};color:#fff;padding:2px 6px;border-radius:8px;font-size:10px;margin-right:4px;">${a.stockSource === "stock1" ? "S1" : "S2"}</span>`
        : "";
      return `<tr><td><strong>${a.produit || ""}</strong>${
        (a.numeroArticle || a.numeroLot || a.fournisseur || a.datePeremption || a.stockSource)
          ? `<div class="lot-info">${stockBadge}${
              a.numeroArticle ? `<span style="background:#e0e7ff;color:#4f46e5;padding:2px 6px;border-radius:8px;font-size:10px;margin-right:4px;">N° article: ${a.numeroArticle}</span>` : ""
            }${
              a.numeroLot ? `<span style="background:#dcfce7;color:#16a34a;padding:2px 6px;border-radius:8px;font-size:10px;margin-right:4px;">Lot: ${a.numeroLot}</span>` : ""
            }${
              a.fournisseur ? `<span style="background:#dbeafe;color:#2563eb;padding:2px 6px;border-radius:8px;font-size:10px;margin-right:4px;">Fournisseur: ${a.fournisseur}</span>` : ""
            }${
              a.datePeremption ? `<div style="margin-top:4px;">Expiration: <span style="color:${isExpired ? "#dc2626" : "#6b7280"};font-weight:600;">${formatDateSafe(a.datePeremption)}${isExpired ? " ⚠️ EXPIRÉ" : ""}</span></div>` : ""
            }</div>` : ""
      }</td><td>${safeNumber(a.quantite)}</td><td>${safeToFixed(a.prixUnitaire)} DHS</td><td>${safeToFixed(a.remise)} DHS</td><td style="font-weight:600;">${safeToFixed(safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise))} DHS</td></tr>`;
    }).join("")}
    </tbody></table>
    <div class="totals"><div style="font-size:20px;font-weight:bold;">TOTAL: ${safeToFixed(total)} DHS</div></div>
    ${vente.notes ? `<div style="margin-top:20px;padding:15px;background:#fef3c7;border-left:5px solid #f59e0b;"><strong>Notes:</strong> ${vente.notes}</div>` : ""}
    <div class="signature-section"><div class="signature-box"><div class="signature-line"></div><p>Signature Client</p></div>${cachetHtml}<div class="signature-box"><div class="signature-line"></div><p>Signature Vendeur</p></div></div>
    <div class="footer"><p>${parametres.pied}</p><p style="font-size:12px;color:#6b7280;margin-top:10px;">Document imprimé le ${new Date().toLocaleString("fr-FR")} par ${user?.email || "Utilisateur"}</p></div>
    </body></html>`);
    w.document.close(); w.print();
  }, [generateCachetHtml, parametres.entete, parametres.pied, user?.email, active]);

  /* ===================== Utils ===================== */
  const resetForm = useCallback(() => {
    setClient("(passant)");
    setDateVente(getTodayDateString());
    setStatutPaiement("payé");
    setModePaiement("Espèces");
    setNotesVente("");
    setArticles([]);
    setProduit("");
    setQuantite(1);
    setPrixUnitaire("");
    setRemiseArticle(0);
    setSelectedLot("");
    setAvailableLots([]);
    setNumeroArticle("");
    setEditId(null);
    setIsEditing(false);
    setError("");
    setShowFinalizationSection(false);
  }, []);

  /* ===================== Scan (douchette) seulement si actif ===================== */
  const onBarcodeDetected = useCallback((barcode) => {
    if (!active) return;
    try {
      const isMatch = (obj) => BARCODE_FIELDS.some((f) => String(obj?.[f] || "") === String(barcode));
      setNumeroArticle(String(barcode || ""));

      const fromEntry = (Array.isArray(stockEntries) ? stockEntries : []).find((p) => isMatch(p)) || null;
      const fromMed   = !fromEntry ? (Array.isArray(medicaments) ? medicaments : []).find((m) => isMatch(m)) : null;
      const found = fromEntry || fromMed;
      if (!found) { beepError(); setError(`Aucun produit trouvé pour le code : ${barcode}`); return; }

      const nom = found.nom || found.name || "";
      setProduit(nom || ""); setQuantite(1);

      const pV = safeNumber(found.prixVente ?? found.price ?? 0);
      if (pV > 0) setPrixUnitaire(pV);

      const lotsForProduct = (Array.isArray(stockEntries) ? stockEntries : [])
        .filter((e) => (e.nom || e.name) === nom && (safeNumber(e.stock1) + safeNumber(e.stock2)) > 0);
      setAvailableLots(lotsForProduct || []);

      if (lotsForProduct?.length === 1) {
        setSelectedLot(lotsForProduct[0]?.id || lotsForProduct[0]?.numeroLot || "");
        const code = findAnyBarcode(lotsForProduct[0]) || "";
        setNumeroArticle(String(code || barcode || ""));
      } else if (lotsForProduct?.length > 0) {
        setSelectedLot(lotsForProduct[0]?.id || "");
      }

      const canAutoAdd = Boolean(nom && pV > 0 && (lotsForProduct?.length > 0));
      if (canAutoAdd) {
        beepSuccess();
        setTimeout(()=>{ try { handleAddArticle?.({ preventDefault: () => {} }); } catch {} }, 40);
      }
    } catch (e) {
      console.error(e); beepError(); setError("Erreur détecteur code-barres");
    }
  }, [stockEntries, medicaments, handleAddArticle, beepSuccess, beepError, active]);

  useEffect(() => {
    if (!active) return;
    const opts = { minChars: 6, endKey: "Enter", timeoutMs: 250 };
    const state = { buf: "", timer: null };

    const onKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === opts.endKey) {
        const code = state.buf; state.buf = ""; clearTimeout(state.timer);
        if (code && code.length >= opts.minChars) onBarcodeDetected(code);
        return;
      }
      if (e.key && e.key.length === 1) {
        state.buf += e.key; clearTimeout(state.timer);
        state.timer = setTimeout(() => {
          const code = state.buf; state.buf = "";
          if (code && code.length >= opts.minChars) onBarcodeDetected(code);
        }, opts.timeoutMs);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); clearTimeout(state.timer); };
  }, [onBarcodeDetected, active]);

  /* ===================== Rendu ===================== */
  if (waiting) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#667eea 0%,#764ba2 100%)",color:"white"}}>
        <div style={{textAlign:"center",padding:40,borderRadius:16,background:"rgba(255,255,255,0.1)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.2)"}}>
          <div style={{width:50,height:50,border:"4px solid rgba(255,255,255,0.3)",borderTop:"4px solid white",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 20px"}}/>
          <h3 style={{margin:0,fontSize:18}}>Chargement en cours...</h3>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!user || !societeId) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#f093fb 0%,#f5576c 100%)",color:"white"}}>
        <div style={{textAlign:"center",padding:40,borderRadius:16,background:"rgba(255,255,255,0.1)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.2)"}}>
          <h3 style={{margin:"0 0 10px",fontSize:18}}>Accès non autorisé</h3>
          <p style={{margin:0,opacity:0.9}}>Utilisateur non connecté ou société non sélectionnée.</p>
        </div>
      </div>
    );
  }

  /* ====== Vue "Veille" quand inactive ====== */
  if (!active) {
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#fafafa 0%,#f1f5f9 100%)",padding:20,fontFamily:'"Inter",-apple-system,BlinkMacSystemFont,sans-serif'}}>
        <div style={{background:"white",borderRadius:24,padding:24,margin:"40px auto",maxWidth:900,boxShadow:"0 20px 40px rgba(0,0,0,0.06)",border:"1px solid #e5e7eb"}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
            <div style={{width:44,height:44,borderRadius:12,display:"grid",placeItems:"center",background:"linear-gradient(135deg,#667eea,#764ba2)",color:"#fff",fontSize:22}}>🛍️</div>
            <div>
              <h1 style={{margin:0,fontSize:26,fontWeight:800,letterSpacing:.2,color:"#111827"}}>Ventes — Mode veille</h1>
              <p style={{margin:"6px 0 0",color:"#6b7280"}}>
                Cette page est en pause pour économiser les ressources. Activez-la pour afficher le tableau des ventes,
                le panier et la synchronisation temps réel.
              </p>
            </div>
            <button
              onClick={toggleActive}
              style={{marginLeft:"auto",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",border:"none",padding:"12px 20px",borderRadius:12,fontWeight:800,cursor:"pointer",boxShadow:"0 8px 24px rgba(16,185,129,0.35)"}}
            >
              Activer la page Ventes
            </button>
          </div>

          <div style={{marginTop:16,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
            <div style={{padding:16,borderRadius:16,background:"#f8fafc",border:"1px dashed #cbd5e1"}}>
              <div style={{fontWeight:700,color:"#0f172a"}}>Listeners Firestore</div>
              <div style={{fontSize:13,color:"#64748b"}}>Non démarrés</div>
            </div>
            <div style={{padding:16,borderRadius:16,background:"#f8fafc",border:"1px dashed #cbd5e1"}}>
              <div style={{fontWeight:700,color:"#0f172a"}}>Scanner / Douchette</div>
              <div style={{fontSize:13,color:"#64748b"}}>Désactivé</div>
            </div>
            <div style={{padding:16,borderRadius:16,background:"#f8fafc",border:"1px dashed #cbd5e1"}}>
              <div style={{fontWeight:700,color:"#0f172a"}}>Consommation mémoire</div>
              <div style={{fontSize:13,color:"#64748b"}}>Minimale</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ====== Vue ACTIVE ====== */
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#667eea 0%,#764ba2 100%)",padding:20,fontFamily:'"Inter",-apple-system,BlinkMacSystemFont,sans-serif'}}>
      {/* Header */}
      <div style={{background:"rgba(255,255,255,0.95)",backdropFilter:"blur(20px)",borderRadius:24,padding:24,marginBottom:16,border:"1px solid rgba(255,255,255,0.2)",boxShadow:"0 20px 40px rgba(0,0,0,0.1)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
          <div>
            <h1 style={{margin:0,fontSize:32,fontWeight:800,background:"linear-gradient(135deg,#667eea,#764ba2)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Gestion des Ventes Multi-Articles</h1>
            <p style={{margin:"6px 0 0",color:"#6b7280",fontSize:16}}>Catalogue aligné (nom/prixVente/quantite + codes-barres) et lots FIFO.</p>
            <div style={{marginTop:6}}><RealtimeBeat lastRealtimeBeat={lastRealtimeBeat} /></div>
          </div>

          <div style={{display:"flex",gap:8}}>
            <button
              onClick={() => { setShowForm((v) => !v); if (!showForm) resetForm(); }}
              style={{background:showForm?"linear-gradient(135deg,#ef4444,#dc2626)":"linear-gradient(135deg,#3b82f6,#2563eb)",color:"white",border:"none",padding:"14px 28px",borderRadius:16,fontSize:16,fontWeight:600,cursor:"pointer",transition:"all 0.3s ease",boxShadow:"0 8px 25px rgba(59,130,246,0.3)"}}
            >
              {showForm ? "✕ Fermer" : "+ Nouvelle Vente"}
            </button>
            <button
              onClick={toggleActive}
              title="Mettre la page en veille (arrête les flux temps réel)"
              style={{background:"linear-gradient(135deg,#6b7280,#4b5563)",color:"#fff",border:"none",padding:"14px 18px",borderRadius:16,fontSize:14,fontWeight:700,cursor:"pointer"}}
            >
              Mettre en veille
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{background:"rgba(254,226,226,0.95)",backdropFilter:"blur(10px)",color:"#dc2626",padding:16,borderRadius:16,marginBottom:16,border:"1px solid rgba(220,38,38,0.2)",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 8px 25px rgba(220,38,38,0.1)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:"#dc2626",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600}}>!</div>
            <span style={{fontSize:15,fontWeight:500}}>{error}</span>
          </div>
          <button onClick={()=>setError("")} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:22,padding:4,borderRadius:8}}>×</button>
        </div>
      )}

      {success && (
        <div style={{background:"rgba(220,252,231,0.95)",backdropFilter:"blur(10px)",color:"#16a34a",padding:16,borderRadius:16,marginBottom:16,border:"1px solid rgba(22,163,74,0.2)",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 8px 25px rgba(22,163,74,0.1)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:"#16a34a",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600}}>✓</div>
            <span style={{fontSize:15,fontWeight:500}}>{success}</span>
          </div>
          <button onClick={()=>setSuccess("")} style={{background:"none",border:"none",color:"#16a34a",cursor:"pointer",fontSize:22,padding:4,borderRadius:8}}>×</button>
        </div>
      )}

      {/* Formulaire */}
      {showForm && (
        <div style={{background:"rgba(255,255,255,0.95)",backdropFilter:"blur(20px)",borderRadius:20,padding:20,marginBottom:16,border:"1px solid rgba(255,255,255,0.2)",boxShadow:"0 20px 40px rgba(0,0,0,0.1)"}}>
          <h2 style={{margin:"0 0 16px",fontSize:22,fontWeight:700,color:"#1f2937",textAlign:"center"}}>
            {isEditing ? "Modifier la vente" : "Nouvelle vente - Ajoutez vos articles"}
          </h2>

          {/* Indicateur panier */}
          {articles.length > 0 && (
            <div style={{background:"linear-gradient(135deg,#dcfce7,#bbf7d0)",borderRadius:12,padding:12,marginBottom:16,border:"2px solid #16a34a",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800,color:"#15803d",marginBottom:4}}>
                🛒 {distinctPanierCount} produit{distinctPanierCount > 1 ? "s" : ""} distinct{distinctPanierCount > 1 ? "s" : ""}
              </div>
              <div style={{fontSize:14,color:"#16a34a"}}>
                Total actuel: <span style={{fontWeight:700,fontSize:16}}>{safeToFixed(totalVenteCourante)} DHS</span>
              </div>
            </div>
          )}

          {/* Zone scan */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setShowScanner(true)} style={{ borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 14, border: "2px solid #3b82f6" }}>
              📷 Scanner avec caméra
            </button>
            <CameraBarcodeInlineModal
              open={showScanner}
              onClose={() => setShowScanner(false)}
              onDetected={(code) => { onBarcodeDetected(code); setShowScanner(false); }}
            />
            <span style={{ color: "#6b7280", fontSize: 12 }}>(Ou scannez avec votre douchette : validation via <b>Entrée</b>)</span>
          </div>

          {/* Étape 1 */}
          <div style={{background:"linear-gradient(135deg,#f0f9ff,#e0f2fe)",borderRadius:16,padding:16,marginBottom:12,border:"2px solid #0ea5e9"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <h3 style={{margin:0,color:"#0c4a6e",fontSize:18,fontWeight:700}}>
                📦 Étape 1 : Ajoutez vos articles
              </h3>
              <span style={{background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"white",padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700}}>
                ARTICLES : {distinctPanierCount}
              </span>
            </div>
            <p style={{margin:"0 0 12px",fontSize:13,color:"#0369a1"}}>
              💡 Ajoutez autant d'articles que nécessaire. Chaque article sera ajouté au panier ci-dessous.
            </p>

            <form onSubmit={handleAddArticle}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:10,marginBottom:12}}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                    Médicament * {getAllAvailableMedicaments.length > 0 && (
                      <span style={{ color: "#059669", fontSize: 11 }}>({getAllAvailableMedicaments.length} en stock)</span>
                    )}
                  </label>
                  <select
                    value={produit}
                    onChange={(e) => handleProduitChange(e.target.value)}
                    required
                    style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white"}}
                  >
                    <option value="">-- Sélectionner un médicament --</option>
                    {getAllAvailableMedicaments.map((m) => (
                      <option key={m.nom} value={m.nom}>{m.nom} ({m.hasLots ? "Lots" : "Stock"}: {m.quantiteTotal})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Quantité *</label>
                  <input type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} required min={1}
                         style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:15,background:"white"}} />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Prix unitaire (DHS) *</label>
                  <input type="number" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} required min={0} step="0.01"
                         style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white"}} />
                </div>

                <div>
                  <label style={{display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:4}}>Remise (DHS)</label>
                  <input type="number" value={remiseArticle} onChange={(e) => setRemiseArticle(e.target.value)} min={0} step="0.01"
                         style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white"}}/>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>N° article (code-barres)</label>
                  <input type="text" value={numeroArticle} onChange={(e) => setNumeroArticle(e.target.value)} placeholder="Scannez ou saisissez"
                         style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white"}} />
                </div>
              </div>

              {/* Lots */}
              {availableLots.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{display:"block",fontSize:13,fontWeight:600,color:"#374151",marginBottom:8}}>Sélectionner un lot spécifique (FIFO recommandé)</label>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))",gap:10}}>
                    {availableLots.map((lot) => {
                      const lotDate = safeParseDate(lot.datePeremption);
                      const isExpired = lotDate && lotDate < new Date();
                      const isExpSoon = lotDate && !isExpired && lotDate <= new Date(Date.now() + 30*24*60*60*1000);
                      const s1 = safeNumber(lot.stock1);
                      const s2 = safeNumber(lot.stock2);
                      const primaryStock = s1 > 0 ? "stock1" : s2 > 0 ? "stock2" : "stock1";
                      return (
                        <div key={lot.id} onClick={()=>handleLotSelection(lot.id)}
                             style={{padding:12,borderRadius:12,cursor:"pointer",transition:"all 0.3s ease",
                                     border: selectedLot === lot.id ? "3px solid #10b981" : "2px solid #e5e7eb",
                                     background: selectedLot === lot.id ? "linear-gradient(135deg,#dcfce7,#bbf7d0)" :
                                                isExpired ? "linear-gradient(135deg,#fee2e2,#fecaca)" :
                                                isExpSoon ? "linear-gradient(135deg,#fef3c7,#fed7aa)" :
                                                "linear-gradient(135deg,#f9fafb,#f3f4f6)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <span style={{fontWeight:700,fontSize:13,color:"#1f2937"}}>Lot: {lot.numeroLot}</span>
                            <span style={{background:primaryStock==="stock1"?"#3b82f6":"#10b981",color:"#fff",padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:600}}>
                              S1: {s1} | S2: {s2}
                            </span>
                          </div>
                          <div style={{fontSize:11,color:"#6b7280",marginBottom:4}}>
                            <span style={{background:"#dbeafe",color:"#2563eb",padding:"2px 6px",borderRadius:8,marginRight:4,fontSize:10,fontWeight:500}}>
                              {lot.fournisseur}
                            </span>
                            <span style={{background:"#f3e8ff",color:"#7c3aed",padding:"2px 6px",borderRadius:8,fontSize:10,fontWeight:600}}>
                              {safeToFixed(lot.prixVente ?? lot.price)} DHS
                            </span>
                            <span style={{background:primaryStock==="stock1"?"#dbeafe":"#dcfce7",color:primaryStock==="stock1"?"#2563eb":"#16a34a",padding:"2px 6px",borderRadius:8,marginLeft:4,fontSize:10,fontWeight:600}}>
                              → {primaryStock.toUpperCase()}
                            </span>
                          </div>
                          <div style={{fontSize:11,fontWeight:600,color:isExpired?"#dc2626":isExpSoon?"#d97706":"#16a34a"}}>
                            Exp: {formatDateSafe(lot.datePeremption)} {isExpired && "⚠️ EXPIRÉ"} {isExpSoon && " ⏰ Expire bientôt"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button type="submit" disabled={isSaving}
                        style={{background:"linear-gradient(135deg,#10b981,#059669)",color:"white",border:"none",padding:"12px 32px",borderRadius:12,fontSize:15,fontWeight:700,cursor:isSaving?"not-allowed":"pointer",opacity:isSaving?0.7:1,boxShadow:"0 8px 20px rgba(16,185,129,0.4)"}}>
                  {isSaving ? "Ajout..." : "➕ Ajouter au panier"}
                </button>
              </div>
            </form>
          </div>

          {/* Panier */}
          {articles.length > 0 && (
            <div style={{background:"linear-gradient(135deg,#fff7ed,#fed7aa)",borderRadius:16,padding:16,marginBottom:12,border:"2px solid #f97316"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <h3 style={{margin:0,color:"#c2410c",fontSize:18,fontWeight:700}}>
                  🛍️ Produits du panier ({distinctPanierCount})
                </h3>
                <button
                  onClick={() => setArticles([])}
                  style={{background:"linear-gradient(135deg,#ef4444,#dc2626)",color:"white",border:"none",padding:"6px 14px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer"}}
                >
                  🗑️ Vider le panier
                </button>
              </div>

              <div style={{background:"white",borderRadius:12,overflow:"hidden",boxShadow:"0 6px 16px rgba(0,0,0,0.1)"}}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "white" }}>
                        <th style={{ padding: 10, textAlign: "left", fontWeight: 600, fontSize: 12 }}>Produit / Traçabilité</th>
                        <th style={{ padding: 10, textAlign: "center", fontWeight: 600, fontSize: 12 }}>Qté</th>
                        <th style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 12 }}>Prix unit.</th>
                        <th style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 12 }}>Remise</th>
                        <th style={{ padding: 10, textAlign: "right", fontWeight: 600, fontSize: 12 }}>Total</th>
                        <th style={{ padding: 10, textAlign: "center", fontWeight: 600, fontSize: 12, width: 60 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articles.map((a, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: 10 }}>
                            <div style={{ fontWeight: 600, color: "#1f2937", marginBottom: 2, fontSize: 13 }}>{a.produit}</div>
                            {(a.numeroArticle || a.numeroLot || a.fournisseur || a.datePeremption || a.stockSource) && (
                              <div style={{ fontSize: 10, color: "#6b7280", background: "#f8fafc", padding: 4, borderRadius: 6, border: "1px solid #e5e7eb" }}>
                                {a.stockSource && (
                                  <span style={{ background: a.stockSource === "stock1" ? "#3b82f6" : "#10b981", color: "white", padding: "2px 5px", borderRadius: 5, fontSize: 9, fontWeight: 600, marginRight: 4 }}>
                                    {a.stockSource === "stock1" ? "S1" : "S2"}
                                  </span>
                                )}
                                {a.numeroArticle && (<span style={{ background: "#e0e7ff", color: "#4f46e5", padding: "2px 5px", borderRadius: 5, fontSize: 9, fontWeight: 600, marginRight: 4 }}>N° article: {a.numeroArticle}</span>)}
                                {a.numeroLot && (<span style={{ background: "#dcfce7", color: "#16a34a", padding: "2px 5px", borderRadius: 5, fontSize: 9, fontWeight: 500, marginRight: 4 }}>Lot: {a.numeroLot}</span>)}
                                {a.fournisseur && (<span style={{ background: "#dbeafe", color: "#2563eb", padding: "2px 5px", borderRadius: 5, fontSize: 9, fontWeight: 500, marginRight: 4 }}>{a.fournisseur}</span>)}
                                {a.datePeremption && (<div style={{ marginTop: 2, fontSize: 9 }}>Exp: {formatDateSafe(a.datePeremption)}</div>)}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 10, textAlign: "center", fontWeight: 600, fontSize: 13 }}>{safeNumber(a.quantite)}</td>
                          <td style={{ padding: 10, textAlign: "right", fontWeight: 500, fontSize: 13 }}>{safeToFixed(a.prixUnitaire)} DHS</td>
                          <td style={{ padding: 10, textAlign: "right", fontWeight: 500, fontSize: 13, color: safeNumber(a.remise) > 0 ? "#dc2626" : "#6b7280" }}>{safeToFixed(a.remise)} DH</td>
                          <td style={{ padding: 10, textAlign: "right", fontWeight: 700, fontSize: 13, color: "#16a34a" }}>
                            {safeToFixed(safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise))} DHS
                          </td>
                          <td style={{ padding: 10, textAlign: "center" }}>
                            <button onClick={() => handleRemoveArticle(i)} style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "white", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", borderTop: "2px solid #16a34a" }}>
                        <td colSpan={4} style={{ padding: 12, textAlign: "right", fontSize: 15, fontWeight: 700, color: "#15803d" }}>TOTAL DE LA VENTE</td>
                        <td style={{ padding: 12, textAlign: "right", fontSize: 18, fontWeight: 800, color: "#16a34a" }}>{safeToFixed(totalVenteCourante)} DHS</td>
                        <td style={{ padding: 12 }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bouton finalisation */}
              <div style={{marginTop:16,textAlign:"center"}}>
                <button
                  onClick={() => setShowFinalizationSection(true)}
                  style={{background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"white",border:"none",padding:"14px 40px",borderRadius:12,fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:"0 8px 24px rgba(139,92,246,0.4)"}}
                >
                  ✓ Passer à l'étape 2 : Finaliser la vente →
                </button>
              </div>
            </div>
          )}

          {/* Étape 2 */}
          {showFinalizationSection && articles.length > 0 && (
            <div style={{background:"linear-gradient(135deg,#f3e8ff,#e9d5ff)",borderRadius:16,padding:16,border:"2px solid #8b5cf6"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <h3 style={{ margin:0, color: "#581c87", fontSize: 18, fontWeight: 700 }}>
                  ✅ Étape 2 : Finaliser la vente
                </h3>
                <button
                  onClick={() => setShowFinalizationSection(false)}
                  style={{background:"transparent",border:"2px solid #8b5cf6",color:"#7c3aed",padding:"4px 10px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer"}}
                >
                  ← Retour à l'étape 1
                </button>
              </div>
              <p style={{margin:"0 0 12px",fontSize:13,color:"#6b21a8"}}>
                💡 Complétez les informations de la vente et enregistrez votre transaction.
              </p>

              <form onSubmit={handleAddVente}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Client *</label>
                    <input type="text" value={client} onChange={(e) => setClient(e.target.value)} required placeholder="Nom du client" list="clients-list"
                           style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white"}} />
                    <datalist id="clients-list">{clients.map((c) => (<option key={c} value={c} />))}</datalist>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Date de vente *</label>
                    <input type="date" value={dateVente} onChange={(e) => setDateVente(e.target.value)} required
                           style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white"}} />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Statut de paiement</label>
                    <select value={statutPaiement} onChange={(e) => setStatutPaiement(e.target.value)}
                            style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white"}}>
                      <option value="payé">Payé</option>
                      <option value="partiel">Partiel</option>
                      <option value="impayé">Impayé</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Mode de paiement</label>
                    <select value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}
                            style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white"}}>
                      <option value="Espèces">Espèces</option>
                      <option value="Carte">Carte bancaire</option>
                      <option value="Chèque">Chèque</option>
                      <option value="Virement">Virement</option>
                      <option value="Crédit">Crédit</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Notes / Observations</label>
                  <textarea value={notesVente} onChange={(e) => setNotesVente(e.target.value)} rows={2} placeholder="Notes optionnelles..."
                            style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"2px solid #e5e7eb",fontSize:14,background:"white",resize:"vertical",fontFamily:"inherit"}} />
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  {isEditing && (
                    <button type="button" onClick={resetForm}
                            style={{background:"linear-gradient(135deg,#6b7280,#4b5563)",color:"white",border:"none",padding:"10px 24px",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 6px 16px rgba(107,114,128,0.3)"}}>
                      Annuler
                    </button>
                  )}
                  <button type="submit" disabled={isSaving || articles.length === 0}
                          style={{background:isEditing?"linear-gradient(135deg,#f59e0b,#d97706)":"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"white",border:"none",padding:"14px 40px",borderRadius:12,fontSize:16,fontWeight:700,cursor:(isSaving||articles.length===0)?"not-allowed":"pointer",opacity:(isSaving||articles.length===0)?0.6:1,boxShadow:"0 10px 30px rgba(139,92,246,0.5)"}}>
                    {isSaving ? "Enregistrement..." : isEditing ? "💾 Modifier la vente" : "💾 Enregistrer la vente"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Filtres */}
      <div style={{background:"rgba(255,255,255,0.95)",backdropFilter:"blur(20px)",borderRadius:16,padding:18,marginBottom:16,border:"1px solid rgba(255,255,255,0.2)",boxShadow:"0 10px 25px rgba(0,0,0,0.08)"}}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1", minWidth: 240 }}>
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher client, produit, lot ou N° article..."
                   style={{width:"100%",padding:"11px 18px",borderRadius:20,border:"2px solid #e5e7eb",fontSize:15,background:"white"}} />
          </div>

          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}
                  style={{padding:"11px 18px",borderRadius:20,border:"2px solid #e5e7eb",fontSize:15,background:"white",minWidth:170}}>
            <option value="">Tous les statuts</option>
            <option value="payé">Payé</option>
            <option value="partiel">Partiel</option>
            <option value="impayé">Impayé</option>
          </select>

          {(searchTerm || filterStatut) && (
            <button onClick={() => { setSearchTerm(""); setFilterStatut(""); }}
                    style={{background:"linear-gradient(135deg,#ef4444,#dc2626)",color:"white",border:"none",padding:"11px 18px",borderRadius:20,fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 6px 18px rgba(239,68,68,0.3)"}}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Indicateur résultats */}
      {ventesFiltrees.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              background: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
              border: "2px solid #86efac",
              borderRadius: 10,
              color: "#166534",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            📊 {ventesFiltrees.length} vente(s) • Page {currentPage}/{totalPages}
          </div>
        </div>
      )}

      {/* Tableau des ventes avec PAGINATION */}
      <div style={{background:"rgba(255,255,255,0.95)",backdropFilter:"blur(20px)",borderRadius:20,overflow:"hidden",border:"1px solid rgba(255,255,255,0.2)",boxShadow:"0 20px 40px rgba(0,0,0,0.1)"}}>
        <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
          <table style={{ width: "100%", minWidth: 1000, borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "linear-gradient(135deg, #1e293b, #334155)", color: "white", zIndex: 10 }}>
              <tr>
                <th style={{ padding: 16, textAlign: "left", fontWeight: 700, fontSize: 13, borderRight: "1px solid rgba(255,255,255,0.1)" }}>N° VENTE</th>
                <th style={{ padding: 16, textAlign: "left", fontWeight: 700, fontSize: 13, borderRight: "1px solid rgba(255,255,255,0.1)" }}>CLIENT</th>
                <th style={{ padding: 16, textAlign: "center", fontWeight: 700, fontSize: 13, borderRight: "1px solid rgba(255,255,255,0.1)" }}>DATE</th>
                <th style={{ padding: 16, textAlign:  "center", fontWeight: 700, fontSize: 13, borderRight: "1px solid rgba(255,255,255,0.1)" }}>ARTICLES / STOCK / SYNC</th>
                <th style={{ padding: 16, textAlign: "center", fontWeight: 700, fontSize: 13, borderRight: "1px solid rgba(255,255,255,0.1)" }}>STATUT</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700, fontSize: 13, borderRight: "1px solid rgba(255,255,255,0.1)" }}>TOTAL</th>
                <th style={{ padding: 16, textAlign: "center", fontWeight: 700, fontSize: 13, width: 220 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {paginatedVentes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "50px 20px", textAlign: "center", color: "#6b7280", fontSize: 17, fontWeight: 500 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #e5e7eb, #d1d5db)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📊</div>
                      <div>
                        <h3 style={{ margin: "0 0 6px", color: "#374151" }}>{ventes.length === 0 ? "Aucune vente enregistrée" : "Aucun résultat"}</h3>
                        <p style={{ margin: 0, color: "#9ca3af" }}>{ventes.length === 0 ? "Commencez par créer votre première vente" : "Aucune vente ne correspond aux critères de filtrage"}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedVentes.map((v, index) => (
                  <VenteRow
                    key={v.id}
                    vente={v}
                    index={index}
                    appliedSet={appliedSet}
                    dismissedSet={dismissedSet}
                    onViewDetails={handleViewDetails}
                    onEdit={handleEditVente}
                    onPrint={handlePrintVente}
                    onDelete={handleDeleteVente}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modal de détails via Portal */}
      {showDetails && selectedVente && createPortal(
        <div role="dialog" aria-modal="true"
             aria-label={`Détails de la vente ${(selectedVente?.id || "").slice(-6).toUpperCase()}`}
             onClick={(e) => { if (e.target === e.currentTarget) setShowDetails(false); }}
             style={{position:"fixed",inset:0,background:"rgba(0, 0, 0, 0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20000,backdropFilter:"blur(5px)",padding:16}}>
          <div style={{background:"linear-gradient(135deg,#ffffff,#f9fafb)",borderRadius:18,padding:20,width:"min(100%, 900px)",maxHeight:"90vh",overflowY:"auto",overflowX:"hidden",boxShadow:"0 20px 50px rgba(0,0,0,0.2)",border:"1px solid rgba(0,0,0,0.05)",position:"relative"}}
               onKeyDown={(e) => { if (e.key === "Escape") setShowDetails(false); }} tabIndex={-1}>
            <div style={{position:"sticky",top:0,zIndex:2,background:"linear-gradient(135deg,#ffffff,#f9fafb)",padding:"10px 36px 10px 0",margin:"-20px -20px 16px",borderBottom:"1px solid rgba(0,0,0,0.06)",display:"flex",alignItems:"center",minHeight:44}}>
              <h2 style={{margin:0,fontSize:"clamp(17px, 2.5vw, 24px)",fontWeight:700,color:"#1f2937",lineHeight:1.2,flex:1}}>
                Détails de la vente #{(selectedVente?.id || "").slice(-6).toUpperCase()}
                {selectedVente?.stockSource && (
                  <span style={{marginLeft:10,background:selectedVente.stockSource === "stock2" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#3b82f6,#2563eb)",color:"white",padding:"3px 10px",borderRadius:10,fontSize:"clamp(11px,1.5vw,14px)",fontWeight:600}}>
                    {selectedVente.stockSource === "stock2" ? "STOCK 2" : "STOCK 1"}
                  </span>
                )}
              </h2>
              <button onClick={() => setShowDetails(false)} aria-label="Fermer"
                      style={{position:"absolute",right:10,top:10,width:32,height:32,display:"grid",placeItems:"center",border:"none",borderRadius:8,fontSize:22,lineHeight:1,color:"#111827",cursor:"pointer"}}>×</button>
            </div>

            {/* résumé vente */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:10,marginBottom:18}}>
              <div style={{background:"linear-gradient(135deg,#dbeafe,#bfdbfe)",borderRadius:12,padding:14}}>
                <h4 style={{margin:"0 0 4px",color:"#1d4ed8",fontSize:13,fontWeight:600}}>Client</h4>
                <p style={{margin:0,fontSize:15,fontWeight:700,color:"#1f2937",wordBreak:"break-word"}}>{selectedVente?.client || "-"}</p>
              </div>
              <div style={{background:"linear-gradient(135deg,#dcfce7,#bbf7d0)",borderRadius:12,padding:14}}>
                <h4 style={{margin:"0 0 4px",color:"#15803d",fontSize:13,fontWeight:600}}>Date</h4>
                <p style={{margin:0,fontSize:15,fontWeight:700,color:"#1f2937"}}>{formatDateSafe(selectedVente?.date)}</p>
              </div>
              <div style={{background:"linear-gradient(135deg,#fef3c7,#fde68a)",borderRadius:12,padding:14}}>
                <h4 style={{margin:"0 0 4px",color:"#b45309",fontSize:13,fontWeight:600}}>Statut</h4>
                <p style={{margin:0,fontSize:15,fontWeight:700,color:"#1f2937"}}>{selectedVente?.statutPaiement || "-"}</p>
              </div>
              <div style={{background:"linear-gradient(135deg,#f3e8ff,#e9d5ff)",borderRadius:12,padding:14}}>
                <h4 style={{margin:"0 0 4px",color:"#7e22ce",fontSize:13,fontWeight:600}}>Mode</h4>
                <p style={{margin:0,fontSize:15,fontWeight:700,color:"#1f2937"}}>{selectedVente?.modePaiement || "Espèces"}</p>
              </div>
              <div style={{background:"linear-gradient(135deg,#d1fae5,#a7f3d0)",borderRadius:12,padding:14}}>
                <h4 style={{margin:"0 0 4px",color:"#065f46",fontSize:13,fontWeight:600}}>Total</h4>
                <p style={{margin:0,fontSize:15,fontWeight:800,color:"#1f2937"}}>{safeToFixed(selectedVente?.montantTotal)} DHS</p>
              </div>
            </div>

            <h3 style={{margin:"0 0 10px",fontSize:"clamp(15px, 2.2vw, 18px)",fontWeight:600,color:"#374151"}}>
              Produits distincts ({distinctCountByProduit(selectedVente?.articles || [])})
            </h3>

            <div style={{background:"#fff",borderRadius:12,boxShadow:"0 8px 20px rgba(0, 0, 0, 0.05)",marginBottom:16,overflowX:"auto"}}>
              <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #6d28d9, #5b21b6)", color: "white" }}>
                    <th style={{ padding: 11, textAlign: "left", fontSize: 12 }}>Produit / Traçabilité</th>
                    <th style={{ padding: 11, textAlign: "center", fontSize: 12 }}>Qté</th>
                    <th style={{ padding: 11, textAlign: "right", fontSize: 12 }}>Prix Unit.</th>
                    <th style={{ padding: 11, textAlign: "right", fontSize: 12 }}>Remise</th>
                    <th style={{ padding: 11, textAlign: "right", fontSize: 12 }}>Total</th>
                    <th style={{ padding: 11, textAlign: "center", fontSize: 12 }}>Stock</th>
                    <th style={{ padding: 11, textAlign: "center", fontSize: 12 }}>Sync</th>
                    <th style={{ padding: 11, textAlign: "center", fontSize: 12 }}>Ignore</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedVente?.articles || []).map((a, i) => {
                    const opId = `${selectedVente.id}#${i}`;
                    const isApplied = appliedSet.has(opId);
                    const isDismissed = dismissedSet.has(opId);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 11, verticalAlign: "top" }}>
                          <strong style={{ fontSize: 13 }}>{a?.produit || "-"}</strong>
                          {(a?.numeroArticle || a?.numeroLot || a?.fournisseur || a?.datePeremption) && (
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                              {a?.numeroArticle ? `N° article: ${a.numeroArticle}` : ""}
                              {a?.numeroLot ? `${a?.numeroArticle ? " | " : ""}Lot: ${a.numeroLot}` : ""}
                              {a?.fournisseur ? `${a?.numeroArticle || a?.numeroLot ? " | " : ""}Fournisseur: ${a.fournisseur}` : ""}
                              {a?.datePeremption ? `${a?.numeroArticle || a?.numeroLot || a?.fournisseur ? " | " : ""}Exp: ${formatDateSafe(a.datePeremption)}` : ""}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: 11, textAlign: "center", fontSize: 13 }}>{safeNumber(a?.quantite)}</td>
                        <td style={{ padding: 11, textAlign: "right", fontSize: 13 }}>{safeToFixed(a?.prixUnitaire)} DHS</td>
                        <td style={{ padding: 11, textAlign: "right", fontSize: 13 }}>{safeToFixed(a?.remise)} DHS</td>
                        <td style={{ padding: 11, textAlign: "right", fontWeight: 600, fontSize: 13 }}>
                          {safeToFixed(safeNumber(a?.prixUnitaire) * safeNumber(a?.quantite) - safeNumber(a?.remise))} DHS
                        </td>
                        <td style={{ padding: 11, textAlign: "center" }}>
                          <span style={{background:a?.stockSource === "stock2" ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #3b82f6, #2563eb)", color:"white", padding:"3px 7px", borderRadius:10, fontSize:10, fontWeight:600}}>
                            {a?.stockSource === "stock2" ? "S2" : "S1"}
                          </span>
                        </td>
                        <td style={{ padding: 11, textAlign: "center" }}>
                          {isApplied ? (
                            <span title="Appliquée au stock" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "white", padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>✓ appliquée</span>
                          ) : isDismissed ? (
                            <span title="Ignorée" style={{ background: "linear-gradient(135deg, #6b7280, #4b5563)", color: "white", padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>⊗ ignorée</span>
                          ) : (
                            <span title="En attente" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white", padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>… attente</span>
                          )}
                        </td>
                        <td style={{ padding: 11, textAlign: "center" }}>
                          <button
                            onClick={() => toggleDismissLine(selectedVente.id, i, !dismissedSet.has(opId))}
                            style={{background: dismissedSet.has(opId) ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #6b7280, #4b5563)", color:"white", border:"none", padding:"6px 10px", borderRadius:8, fontSize:12, cursor:"pointer"}}
                            title={dismissedSet.has(opId) ? "Réactiver la sync pour cette ligne" : "Ignorer cette ligne pour la sync"}
                          >
                            {dismissedSet.has(opId) ? "Réactiver" : "Ignorer"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={() => { setShowDetails(false); handleEditVente?.(selectedVente); }}
                      style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"white",border:"none",padding:"9px 16px",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"}}>Modifier</button>
              <button onClick={() => { setShowDetails(false); handlePrintVente?.(selectedVente); }}
                      style={{background:"linear-gradient(135deg,#6d28d9,#5b21b6)",color:"white",border:"none",padding:"9px 16px",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"}}>Imprimer</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
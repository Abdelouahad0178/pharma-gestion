// ===================== Achats.js — VERSION COMPLÈTE CORRIGÉE =====================
import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from "react";
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
const BARCODE_FIELDS = ["codeBarre", "barcode", "ean", "ean13", "upc", "gtin"];
const ITEMS_PER_PAGE = 50;
/* ===================== NORMALISATION TEXTE ===================== */
const normalizeText = (text) => {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};
/* ===================== COMPOSANTS MÉMOÏSÉS ===================== */
const BonRow = memo(({ bon, index, onPrint, onReception, onEdit, onDelete, formatDateDisplay, getTotalBon }) => {
  return (
    <tr className={bon.isTransferred ? "bon-transfere" : ""}>
      <td className="left" style={{ fontWeight: "800" }}>
        {bon.fournisseur}
        {bon.isTransferred && (
          <button className="inline-delete" onClick={() => onDelete(bon)} aria-label="Supprimer">
            (supprimer)
          </button>
        )}
      </td>
      <td>{formatDateDisplay(bon.date || bon.timestamp)}</td>
      <td>
        <span
          style={{
            padding: "6px 12px",
            borderRadius: "20px",
            fontWeight: "800",
            background:
              bon.statutPaiement === "payé"
                ? "#ECFDF5"
                : bon.statutPaiement === "partiel"
                ? "#FEF3C7"
                : "#FEE2E2",
            color:
              bon.statutPaiement === "payé"
                ? "#065F46"
                : bon.statutPaiement === "partiel"
                ? "#92400E"
                : "#7F1D1D",
            border: `2px solid ${
              bon.statutPaiement === "payé"
                ? "#BBF7D0"
                : bon.statutPaiement === "partiel"
                ? "#FDE68A"
                : "#FECACA"
            }`,
          }}
        >
          {bon.statutPaiement}
        </span>
      </td>
      <td>
        <span
          style={{
            padding: "6px 12px",
            borderRadius: "20px",
            fontWeight: "800",
            background:
              bon.statutReception === "reçu"
                ? "#ECFDF5"
                : bon.statutReception === "partiel"
                ? "#FEF3C7"
                : "#EFF6FF",
            color:
              bon.statutReception === "reçu"
                ? "#065F46"
                : bon.statutReception === "partiel"
                ? "#92400E"
                : "#1E40AF",
            border: `2px solid ${
              bon.statutReception === "reçu"
                ? "#BBF7D0"
                : bon.statutReception === "partiel"
                ? "#FDE68A"
                : "#BFDBFE"
            }`,
          }}
        >
          {bon.statutReception || "en_attente"}
        </span>
      </td>
      <td style={{ textTransform: "uppercase", fontWeight: "800", color: "var(--primary)" }}>
        {bon.stock || "stock1"}
      </td>
      <td style={{ fontWeight: "900", fontSize: "1.05em", color: "var(--primary)" }}>
        {Number(getTotalBon(bon) || 0).toFixed(2)} DHS
      </td>
      <td>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            className="action-btn print small"
            onClick={() => onPrint(bon)}
            title="Imprimer"
            aria-label="Imprimer"
          >
            🖨️ Imprimer
          </button>
          {bon.statutReception === "en_attente" && !bon.isTransferred && (
            <>
              <button
                className="action-btn reception small"
                onClick={() => onReception(bon)}
                title="Réceptionner"
                aria-label="Réceptionner"
              >
                📥 Réception
              </button>
              <button
                className="action-btn edit small"
                onClick={() => onEdit(bon)}
                title="Modifier"
                aria-label="Modifier"
              >
                ✏️ Modifier
              </button>
            </>
          )}
          {!bon.isTransferred && (
            <button
              className="action-btn delete small"
              onClick={() => onDelete(bon)}
              title="Supprimer"
              aria-label="Supprimer"
            >
              🗑️ Supprimer
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
BonRow.displayName = "BonRow";
const CatalogueRow = memo(({ item, onPick, pickAnyBarcode }) => {
  const bc = pickAnyBarcode(item);
  return (
    <tr>
      <td className="left" style={{ fontWeight: 800 }}>
        {item.nom}
      </td>
      <td>
        {bc ? (
          <span className="chip">{bc}</span>
        ) : (
          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>
        )}
      </td>
      <td style={{ fontWeight: 800, color: "var(--primary)" }}>
        {Number(item.prixVente || 0).toFixed(2)} DHS
      </td>
      <td>
        <button
          className="btn btn-primary"
          onClick={() => onPick(item)}
          aria-label={`Choisir ${item.nom}`}
        >
          ✅ Choisir
        </button>
      </td>
    </tr>
  );
});
CatalogueRow.displayName = "CatalogueRow";
const Pagination = memo(({ currentPage, totalPages, onPageChange, loading }) => {
  const pages = [];
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  for (let i = startPage; i <= endPage; i++) pages.push(i);
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
        disabled={currentPage === 1 || loading}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: currentPage === 1 || loading ? "#f3f4f6" : "white",
          cursor: currentPage === 1 || loading ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: currentPage === 1 || loading ? 0.5 : 1,
        }}
      >
        ⏮️
      </button>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1 || loading}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: currentPage === 1 || loading ? "#f3f4f6" : "white",
          cursor: currentPage === 1 || loading ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: currentPage === 1 || loading ? 0.5 : 1,
        }}
      >
        ◀️
      </button>
      {startPage > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            disabled={loading}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "2px solid #e5e7eb",
              background: loading ? "#f3f4f6" : "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
              opacity: loading ? 0.5 : 1,
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
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "2px solid #e5e7eb",
            background:
              page === currentPage
                ? "linear-gradient(135deg,#6366f1,#4f46e5)"
                : loading
                ? "#f3f4f6"
                : "white",
            color: page === currentPage ? "white" : "#0f172a",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
            minWidth: 40,
            opacity: loading ? 0.7 : 1,
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
            disabled={loading}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "2px solid #e5e7eb",
              background: loading ? "#f3f4f6" : "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages || loading}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: currentPage === totalPages || loading ? "#f3f4f6" : "white",
          cursor: currentPage === totalPages || loading ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: currentPage === totalPages || loading ? 0.5 : 1,
        }}
      >
        ▶️
      </button>
      <button
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages || loading}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: currentPage === totalPages || loading ? "#f3f4f6" : "white",
          cursor: currentPage === totalPages || loading ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: currentPage === totalPages || loading ? 0.5 : 1,
        }}
      >
        ⏭️
      </button>
      <span style={{ marginLeft: 16, color: "#64748b", fontSize: 14 }}>
        {loading ? "Chargement..." : `Page ${currentPage} sur ${totalPages}`}
      </span>
    </div>
  );
});
Pagination.displayName = "Pagination";
export default function Achats() {
  /* ===================== HELPERS DATES ===================== */
  const getTodayDate = useCallback(() => new Date().toISOString().split("T")[0], []);
  const getDatePlusTwoYears = useCallback((dateStr = null) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    date.setFullYear(date.getFullYear() + 2);
    return date.toISOString().split("T")[0];
  }, []);
  /* ===================== TAUX DE MARGE (CONFIGURABLE) ===================== */
  const [tauxMarge, setTauxMarge] = useState(33);
  /* ===================== CALCULS AUTOMATIQUES P.P.H ↔ P.P.V ===================== */
  const calculerPPV = useCallback(
    (pph) => {
      const prix = Number(pph);
      if (!prix || prix <= 0) return "";
      const coefficient = 1 + tauxMarge / 100;
      return (prix * coefficient).toFixed(2);
    },
    [tauxMarge]
  );
  const calculerPPH = useCallback(
    (ppv) => {
      const prix = Number(ppv);
      if (!prix || prix <= 0) return "";
      const coefficient = 1 + tauxMarge / 100;
      return (prix / coefficient).toFixed(2);
    },
    [tauxMarge]
  );
  /* ===================== BIP SONORE ===================== */
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
      try {
        __getAudioCtx()?.resume?.();
      } catch {}
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }, []);
  /* ===================== STYLES ===================== */
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
      .scanner-modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.85); display:grid; place-items:center; z-index:9999; backdropFilter:blur(6px); animation:fadeIn .3s ease; }
      @keyframes fadeIn{ from{opacity:0} to{opacity:1} }
      .scanner-modal-content{ background:#fff; borderRadius:24px; padding:32px; maxWidth:600px; width:90%; boxShadow:0 25px 80px rgba(0,0,0,.4); position:relative; animation:slideUp .3s ease; }
      @keyframes slideUp{ from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
      .scanner-container{ width:100%; height:400px; border-radius:16px; overflow:hidden; background:#000; margin:20px 0; position:relative; }
      .scanner-info{ background:linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%); padding:16px; border-radius:12px; margin-bottom:16px; color:#3730A3; font-weight:600; border:2px solid #C7D2FE; }
      .scanner-success{ background:linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%); padding:16px; border-radius:12px; margin-top:16px; color:#065F46; font-weight:700; border:2px solid #86EFAC; animation:pulse .5s ease; }
      @keyframes pulse{ 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }
      .scanner-error{ background:linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%); padding:16px; border-radius:12px; margin-top:16px; color:#7F1D1D; font-weight:700; border:2px solid #FECACA; }
      .close-btn{ position:absolute; top:16px; right:16px; width:36px; height:36px; border-radius:50%; background:var(--danger-grad); color:#fff; border:none; cursor:pointer; display:grid; place-items:center; font-size:20px; font-weight:800; transition:all .2s ease; box-shadow:0 4px 12px rgba(239,68,68,.3); }
      .close-btn:hover{ transform:rotate(90deg) scale(1.1); box-shadow:0 6px 16px rgba(239,68,68,.4); }
    `;
    document.head.appendChild(style);
  }, []);
  useEffect(() => {
    injectStyles();
  }, [injectStyles]);
  /* ===================== CONTEXTE & ÉTATS ===================== */
  const { loading, societeId, user } = useUserRole();
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);
  const [showBons, setShowBons] = useState(true);
  const [currentPageBons, setCurrentPageBons] = useState(1);
  const [currentPageCatalogue, setCurrentPageCatalogue] = useState(1);
  /* ===================== ÉTAT FORMULAIRE BON ===================== */
  const [fournisseur, setFournisseur] = useState("");
  const [dateAchat, setDateAchat] = useState(getTodayDate());
  const [statutPaiement, setStatutPaiement] = useState("impayé");
  const [remiseGlobale, setRemiseGlobale] = useState(0);
  const [stockChoice, setStockChoice] = useState("stock1");
  /* ===================== LIGNE ARTICLE ===================== */
  const [numeroArticle, setNumeroArticle] = useState("");
  const [produit, setProduit] = useState("");
  const [produitNouveau, setProduitNouveau] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [remiseArticle, setRemiseArticle] = useState(0);
  const [datePeremption, setDatePeremption] = useState(getDatePlusTwoYears());
  const [numeroLot, setNumeroLot] = useState("");
  const [fournisseurArticle, setFournisseurArticle] = useState("");
  const [lastEditedPrice, setLastEditedPrice] = useState(null);
  /* ===================== HANDLERS CALCUL P.P.H/P.P.V ===================== */
  const handlePPHChange = useCallback(
    (value) => {
      setPrixUnitaire(value);
      setLastEditedPrice('pph');
      if (value && Number(value) > 0) setPrixVente(calculerPPV(value));
    },
    [calculerPPV]
  );
  const handlePPVChange = useCallback(
    (value) => {
      setPrixVente(value);
      setLastEditedPrice('ppv');
      if (value && Number(value) > 0) setPrixUnitaire(calculerPPH(value));
    },
    [calculerPPH]
  );
  /* ===================== MISE À JOUR AUTO SUR CHANGEMENT MARGE ===================== */
  useEffect(() => {
    const pph = Number(prixUnitaire);
    const ppv = Number(prixVente);
    if (lastEditedPrice === 'ppv' && ppv > 0) {
      setPrixUnitaire(calculerPPH(ppv));
    } else if (lastEditedPrice === 'pph' && pph > 0) {
      setPrixVente(calculerPPV(pph));
    }
  }, [tauxMarge, calculerPPV, calculerPPH]);
  /* ===================== FOURNISSEURS ===================== */
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
      const snap1 = await getDocs(collection(db, "societe", societeId, "fournisseurs"));
      snap1.forEach((d) => {
        const data = d.data();
        const name = normalizeFournisseurName(data, d.id);
        if (name) list.push({ id: d.id, name, data });
      });
      if (list.length === 0) {
        const snap2 = await getDocs(collection(db, "societe", societeId, "suppliers"));
        snap2.forEach((d) => {
          const data = d.data();
          const name = normalizeFournisseurName(data, d.id);
          if (name) list.push({ id: d.id, name, data });
        });
      }
      const uniq = Array.from(new Map(list.map((x) => [x.name.toLowerCase(), x])).values()).sort(
        (a, b) => a.name.localeCompare(b.name)
      );
      setFournisseurs(uniq);
    } catch (e) {
      console.error("fetchFournisseurs:", e);
      setFournisseurs([]);
    }
  }, [societeId]);
  
  // 🔥 MODIFICATION ICI : SYNCHRONISATION AUTOMATIQUE FOURNISSEUR → FOURNISSEUR ARTICLE
  const onFournisseurChange = useCallback(
    (value) => {
      setFournisseur(value);
      // ✅ TOUJOURS synchroniser les deux champs
      setFournisseurArticle(value);
    },
    [] // Pas de dépendance à fournisseurArticle, on écrase toujours
  );
  
  /* ===================== RECALCUL AUTO DATE PÉREMPTION ===================== */
  useEffect(() => {
    if (dateAchat) setDatePeremption(getDatePlusTwoYears(dateAchat));
  }, [dateAchat, getDatePlusTwoYears]);
  /* ===================== COLLECTIONS LOCALES ===================== */
  const [articles, setArticles] = useState([]);
  const [achats, setAchats] = useState([]);
  const [medicaments, setMedicaments] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  /* ===================== CATALOGUE ===================== */
  const [catalogue, setCatalogue] = useState([]);
  const [allCatalogue, setAllCatalogue] = useState([]);
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [showCatalogue, setShowCatalogue] = useState(false);
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [isSearchingCatalogue, setIsSearchingCatalogue] = useState(false);
  const handleLoadCatalogue = useCallback(async () => {
    if (!societeId || catalogueLoaded) return;
    try {
      setLoadingCatalogue(true);
      const qCat = query(collection(db, "societe", societeId, "stock"), orderBy("nom", "asc"));
      const snapshot = await getDocs(qCat);
      const arr = [];
      snapshot.forEach((d) => {
        const data = d.data() || {};
        const nom = String(data.nom ?? data.name ?? "").trim();
        const prixVente = Number(data.prixVente ?? data.price ?? 0) || 0;
        const quantite = Number(data.quantite ?? data.qty ?? 0) || 0;
        const bcs = {};
        for (const k of BARCODE_FIELDS)
          if (data[k] != null && String(data[k]).trim() !== "") bcs[k] = String(data[k]);
        arr.push({ id: d.id, nom, prixVente, quantite, ...bcs });
      });
      setCatalogue(arr);
      setCatalogueLoaded(true);
    } catch (e) {
      console.error("Erreur chargement catalogue:", e);
    } finally {
      setLoadingCatalogue(false);
    }
  }, [societeId, catalogueLoaded]);
  const loadAllCatalogueForSearch = useCallback(async () => {
    if (!societeId) return;
    try {
      setLoadingCatalogue(true);
      const qCat = query(collection(db, "societe", societeId, "stock"), orderBy("nom", "asc"));
      const snapshot = await getDocs(qCat);
      const arr = [];
      snapshot.forEach((d) => {
        const data = d.data() || {};
        const nom = String(data.nom ?? data.name ?? "").trim();
        const prixVente = Number(data.prixVente ?? data.price ?? 0) || 0;
        const quantite = Number(data.quantite ?? data.qty ?? 0) || 0;
        const bcs = {};
        for (const k of BARCODE_FIELDS)
          if (data[k] != null && String(data[k]).trim() !== "") bcs[k] = String(data[k]);
        arr.push({ id: d.id, nom, prixVente, quantite, ...bcs });
      });
      setAllCatalogue(arr);
      setIsSearchingCatalogue(true);
    } catch (e) {
      console.error("Erreur chargement complet catalogue:", e);
    } finally {
      setLoadingCatalogue(false);
    }
  }, [societeId]);
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!catalogueLoaded) return;
      if (catalogueSearch.trim()) {
        if (!isSearchingCatalogue) await loadAllCatalogueForSearch();
      } else {
        if (isSearchingCatalogue) {
          setIsSearchingCatalogue(false);
          setAllCatalogue([]);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [catalogueSearch, catalogueLoaded, isSearchingCatalogue, loadAllCatalogueForSearch]);
  const pickAnyBarcode = useCallback((obj) => {
    for (const k of BARCODE_FIELDS) {
      const v = obj?.[k];
      if (v != null && String(v).trim() !== "") return String(v);
    }
    return "";
  }, []);
  /* ===================== PARAMÈTRES IMPRESSION ===================== */
  const [parametres, setParametres] = useState({
    entete: "",
    pied: "",
    cachetTexte: "Cachet Pharmacie",
    cachetImage: null,
    afficherCachet: true,
    typeCachet: "texte",
    tailleCachet: 120,
  });
  /* ===================== EDITION / RÉCEPTION ===================== */
  const [editId, setEditId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [receptionId, setReceptionId] = useState(null);
  const [receptionArticles, setReceptionArticles] = useState([]);
  /* ===================== UI / NOTIFICATIONS ===================== */
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const showNotification = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);
  /* ===================== FILTRES LISTE BONS ===================== */
  const [filterFournisseur, setFilterFournisseur] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterStatutPaiement, setFilterStatutPaiement] = useState("");
  const [filterStatutReception, setFilterStatutReception] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  useEffect(() => {
    if (isEditing) setShowCreateForm(true);
  }, [isEditing]);
  useEffect(() => {
    if (articles.length > 0) setShowCreateForm(true);
  }, [articles.length]);
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
  /* ===================== DATES SÛRES ===================== */
  const toDateSafe = useCallback((v) => {
    try {
      if (!v) return null;
      if (typeof v?.toDate === "function") return v.toDate();
      if (v?.seconds != null) return new Date(v.seconds * 1000);
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }, []);
  /* ===================== NORMALISATION "STOCK" ===================== */
  const STOCK_KEYS = [
    "stock",
    "stockSource",
    "sourceStock",
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
    if (typeof val === "number")
      return val === 1 ? "stock1" : val === 2 ? "stock2" : "unknown";
    const raw = String(val)
      .toLowerCase()
      .replace(/[\s_\-]/g, "");
    if (
      ["stock1", "s1", "magasin1", "depot1", "principal", "primary", "p", "m1", "1"].includes(
        raw
      )
    )
      return "stock1";
    if (
      ["stock2", "s2", "magasin2", "depot2", "secondaire", "secondary", "s", "m2", "2"].includes(
        raw
      )
    )
      return "stock2";
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
  /* ===================== PARAMÈTRES IMPRESSION (FETCH) ===================== */
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
    setParametres((p) => ({
      ...p,
      entete: p.entete || "Pharmacie",
      pied: p.pied || "Merci pour votre confiance",
    }));
  }, [societeId]);
  /* ===================== ACHATS (FETCH) ===================== */
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
              ((a?.commandee?.prixUnitaire || 0) > 0 || (a?.commandee?.prixAchat || 0) > 0)
          )
        )
          list.push({ id: d.id, ...data });
      });
      list.sort((a, b) => {
        const da =
          toDateSafe(a.timestamp) || toDateSafe(a.date) || new Date("2000-01-01");
        const dbb =
          toDateSafe(b.timestamp) || toDateSafe(b.date) || new Date("2000-01-01");
        return dbb - da;
      });
      setAchats(list);
    } catch (e) {
      console.error("fetchAchats:", e);
      setAchats([]);
    }
  }, [societeId, toDateSafe]);
  /* ===================== STOCK_ENTRIES (MULTI-LOTS) ===================== */
  const fetchStockEntries = useCallback(async () => {
    if (!societeId) return setStockEntries([]);
    try {
      const snap = await getDocs(
        query(collection(db, "societe", societeId, "stock_entries"), orderBy("nom"))
      );
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
  /* ===================== NOMS MÉDICAMENTS ===================== */
  const fetchMedicaments = useCallback(async () => {
    if (!societeId) return setMedicaments([]);
    try {
      const s2 = await getDocs(collection(db, "societe", societeId, "stock_entries"));
      const fromEntries = [];
      s2.forEach((d) => fromEntries.push(d.data()));
      const names = Array.from(new Set(fromEntries.map((m) => m.nom).filter(Boolean)));
      const result = names
        .map((nom) => ({
          nom,
          exemples: fromEntries.filter((m) => m.nom === nom).slice(0, 3),
        }))
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
    fetchFournisseurs();
  }, [
    societeId,
    fetchParametres,
    fetchAchats,
    fetchStockEntries,
    fetchMedicaments,
    fetchFournisseurs,
  ]);
  /* ===================== SAISIE PRODUIT → AUTO-SUGGEST ===================== */
  const handleProduitChange = useCallback(
    (value) => {
      setProduit(value);
      if (value && value !== "_new_") {
        const cat = catalogue.find((c) => c.nom === value);
        if (cat) {
          const ppv = Number(cat.prixVente || 0) || "";
          setPrixVente(ppv);
          if (ppv) setPrixUnitaire(calculerPPH(ppv));
          setNumeroArticle(pickAnyBarcode(cat));
        }
        const existing = stockEntries.filter((e) => e.nom === value);
        if (existing.length > 0) {
          const last = existing[existing.length - 1];
          const pph = last.prixAchat || last.prixUnitaire || "";
          setPrixUnitaire(pph);
          if (pph && !cat) setPrixVente(calculerPPV(pph));
          setFournisseurArticle(last.fournisseur || "");
        } else {
          const med = medicaments.find((m) => m.nom === value);
          if (med?.exemples?.length) {
            const ex = med.exemples[0];
            const pph = ex.prixAchat || ex.prixUnitaire || "";
            setPrixUnitaire(pph);
            if (pph && !cat) setPrixVente(calculerPPV(pph));
            setFournisseurArticle(ex.fournisseur || "");
          } else {
            setPrixUnitaire("");
            if (!cat) setPrixVente("");
            setFournisseurArticle("");
          }
        }
      }
    },
    [stockEntries, medicaments, catalogue, pickAnyBarcode, calculerPPH, calculerPPV]
  );
  /* ===================== AJOUTER UN ARTICLE (COMMANDE) ===================== */
  const handleAddArticle = useCallback(
    (e) => {
      e?.preventDefault?.();
      const nomFinal = produit === "_new_" ? (produitNouveau || "").trim() : produit;
      if (!nomFinal || !quantite || !prixUnitaire || !datePeremption) {
        showNotification("Veuillez remplir tous les champs obligatoires", "error");
        return;
      }
      const qte = Number(quantite);
      const pAchat = Number(prixUnitaire);
      const pVente = Number(prixVente) || 0;
      if (qte <= 0 || pAchat <= 0) {
        showNotification("La quantité et le prix doivent être positifs", "error");
        return;
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
          stock: stockChoice,
          stockSource: stockChoice,
        },
        recu: null,
      };
      setArticles((prev) => [...prev, item]);
      setProduit("");
      setProduitNouveau("");
      setQuantite(1);
      setPrixUnitaire("");
      setPrixVente("");
      setRemiseArticle(0);
      setNumeroLot("");
      setNumeroArticle("");
      setFournisseurArticle("");
      showNotification("Article ajouté (commande) !", "success");
    },
    [
      produit,
      produitNouveau,
      quantite,
      prixUnitaire,
      prixVente,
      remiseArticle,
      datePeremption,
      numeroLot,
      numeroArticle,
      fournisseurArticle,
      fournisseur,
      stockChoice,
      showNotification,
    ]
  );
  const handleRemoveArticle = useCallback(
    (idx) => {
      setArticles((prev) => prev.filter((_, i) => i !== idx));
      showNotification("Article supprimé du bon.", "info");
    },
    [showNotification]
  );
  /* ===================== MISE À JOUR STOCK ===================== */
  const updateStockOnAdd = useCallback(
    async (payload) => {
      if (!societeId || !user || !payload?.articles?.length) return;
      const isStock1 = (payload.stock || "stock1") === "stock1";
      const ops = payload.articles.map(async (a) => {
        const nom = a.produit || "";
        const qte = Number(a.quantite || 0);
        const pA = Number(a.prixUnitaire || a.prixAchat || 0);
        const pV = Number(a.prixVente || 0);
        const dateP = a.datePeremption
          ? Timestamp.fromDate(new Date(a.datePeremption))
          : null;
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
    },
    [societeId, user]
  );
  const updateStockOnDelete = useCallback(
    async (payload) => {
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
    },
    [societeId]
  );
  /* ===================== SCANNER CLAVIER/CAMÉRA ===================== */
  const onBarcodeDetected = useCallback(
    (barcode) => {
      try {
        const fields = [...BARCODE_FIELDS, "numeroArticle", "ean13"];
        const isMatch = (obj) => fields.some((f) => String(obj?.[f] || "") === String(barcode));
        const fromCat = catalogue.find((p) => isMatch(p)) || null;
        if (fromCat) {
          setProduit(fromCat.nom || "");
          const ppv = Number(fromCat.prixVente || 0) || "";
          setPrixVente(ppv);
          if (ppv) setPrixUnitaire(calculerPPH(ppv));
          setNumeroArticle(pickAnyBarcode(fromCat));
        }
        const fromEntry = fromCat ? null : stockEntries.find((p) => isMatch(p)) || null;
        const found = fromCat || fromEntry;
        if (!found) {
          beepError?.();
          showNotification?.(`Aucun produit trouvé pour le code : ${barcode}`, "error");
          return;
        }
        if (fromEntry) {
          const pA = Number(fromEntry.prixAchat ?? fromEntry.prixUnitaire ?? 0);
          if (pA > 0) {
            setPrixUnitaire(pA);
            setPrixVente(calculerPPV(pA));
          }
          if (!fromCat && fromEntry.prixVente)
            setPrixVente(Number(fromEntry.prixVente ?? 0) || "");
          if (fromEntry.numeroLot) setNumeroLot(fromEntry.numeroLot);
          if (fromEntry.fournisseur) setFournisseurArticle(fromEntry.fournisseur);
          const d = toDateSafe(fromEntry.datePeremption) || null;
          if (d instanceof Date && !isNaN(d)) {
            const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 10);
            setDatePeremption(iso);
          }
        }
        setQuantite(1);
        const canAutoAdd = Boolean(
          (fromCat?.nom || fromEntry?.nom) &&
            (prixUnitaire || fromEntry) &&
            (typeof datePeremption === "string" ? datePeremption : true)
        );
        if (canAutoAdd) {
          beepSuccess?.();
          setTimeout(() => {
            try {
              handleAddArticle({ preventDefault: () => {} });
            } catch {}
          }, 60);
        } else {
          beepError?.();
          showNotification?.(
            "Produit détecté, complétez les champs manquants (ex: prix d'achat).",
            "warning"
          );
        }
      } catch (e) {
        console.error(e);
        beepError?.();
        showNotification?.("Erreur détecteur code-barres", "error");
      }
    },
    [
      catalogue,
      stockEntries,
      handleAddArticle,
      showNotification,
      beepError,
      beepSuccess,
      toDateSafe,
      datePeremption,
      prixUnitaire,
      pickAnyBarcode,
      calculerPPH,
      calculerPPV,
    ]
  );
  useKeyboardWedge((code) => onBarcodeDetected(code), {
    minChars: 6,
    endKey: "Enter",
    timeoutMs: 100,
  });
  /* ===================== HELPERS ===================== */
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
    setLastEditedPrice(null);
  }
  const getTotalBon = useCallback((bon) => {
    const arr = bon?.articles || [];
    return (
      arr.reduce((sum, a) => {
        const item = a?.recu || a?.commandee || {};
        const total =
          (item.prixUnitaire || item.prixAchat || 0) * (item.quantite || 0) -
          (item.remise || 0);
        return sum + total;
      }, 0) - (Number(bon?.remiseGlobale) || 0)
    );
  }, []);
  /* ===================== FILTRAGE & PAGINATION ACHATS ===================== */
  const filteredAchats = useMemo(() => {
    return achats.filter((b) => {
      if (
        filterFournisseur &&
        !String(b.fournisseur || "")
          .toLowerCase()
          .includes(filterFournisseur.toLowerCase())
      )
        return false;
      const bonDate = toDateSafe(b.date || b.timestamp);
      if (filterDateStart && bonDate < new Date(filterDateStart)) return false;
      if (filterDateEnd && bonDate > new Date(filterDateEnd + "T23:59:59")) return false;
      if (filterStatutPaiement && b.statutPaiement !== filterStatutPaiement) return false;
      if (
        filterStatutReception &&
        (b.statutReception || "en_attente") !== filterStatutReception
      )
        return false;
      return true;
    });
  }, [
    achats,
    filterFournisseur,
    filterDateStart,
    filterDateEnd,
    filterStatutPaiement,
    filterStatutReception,
    toDateSafe,
  ]);
  useEffect(() => {
    setCurrentPageBons(1);
  }, [
    filterFournisseur,
    filterDateStart,
    filterDateEnd,
    filterStatutPaiement,
    filterStatutReception,
  ]);
  const totalPagesBons = Math.ceil(filteredAchats.length / ITEMS_PER_PAGE);
  const paginatedBons = useMemo(() => {
    const startIndex = (currentPageBons - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredAchats.slice(startIndex, endIndex);
  }, [filteredAchats, currentPageBons]);
  /* ===================== FILTRAGE CATALOGUE ===================== */
  const filteredCatalogue = useMemo(() => {
    const sourceList = isSearchingCatalogue ? allCatalogue : catalogue;
    if (!catalogueSearch.trim()) return sourceList;
    const searchNormalized = normalizeText(catalogueSearch);
    return sourceList.filter((it) => normalizeText(it.nom).includes(searchNormalized));
  }, [catalogue, allCatalogue, catalogueSearch, isSearchingCatalogue]);
  useEffect(() => {
    setCurrentPageCatalogue(1);
  }, [catalogueSearch]);
  const totalPagesCatalogue = Math.ceil(filteredCatalogue.length / ITEMS_PER_PAGE);
  const paginatedCatalogue = useMemo(() => {
    const startIndex = (currentPageCatalogue - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredCatalogue.slice(startIndex, endIndex);
  }, [filteredCatalogue, currentPageCatalogue]);
  /* ===================== ENREGISTRER BON (CRÉATION/ÉDITION) ===================== */
  const handleAddBon = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!societeId) return showNotification("Aucune société sélectionnée !", "error");
      if (!user) return showNotification("Utilisateur non connecté !", "error");
      if (!fournisseur.trim() || !dateAchat || articles.length === 0) {
        showNotification("Veuillez remplir tous les champs obligatoires", "error");
        return;
      }
      const valid = articles.filter(
        (a) =>
          a?.produit &&
          (a?.commandee?.quantite || 0) > 0 &&
          ((a?.commandee?.prixUnitaire || 0) > 0 || (a?.commandee?.prixAchat || 0) > 0)
      );
      if (!valid.length) {
        showNotification("Aucun article valide trouvé", "error");
        return;
      }
      setIsLoading(true);
      const articlesToSave = valid.map((a) => ({
        produit: a.produit,
        commandee: { ...a.commandee, stock: stockChoice, stockSource: stockChoice },
        recu: isEditing
          ? achats
              .find((b) => b.id === editId)
              ?.articles.find((x) => x.produit === a.produit)?.recu
            ? {
                ...achats
                  .find((b) => b.id === editId)
                  ?.articles.find((x) => x.produit === a.produit)?.recu,
                stock: stockChoice,
                stockSource: stockChoice,
              }
            : null
          : null,
      }));
      const montantTotal =
        articlesToSave.reduce(
          (sum, a) =>
            sum +
            ((a.commandee.prixUnitaire || a.commandee.prixAchat || 0) *
              (a.commandee.quantite || 0) -
              (a.commandee.remise || 0)),
          0
        ) - (Number(remiseGlobale) || 0);
      try {
        if (isEditing && editId) {
          const achatRef = doc(db, "societe", societeId, "achats", editId);
          const achatSnap = await getDoc(achatRef);
          if (!achatSnap.exists()) {
            showNotification("Le bon d'achat n'existe pas ou a été supprimé.", "error");
            return;
          }
          await updateDoc(achatRef, {
            fournisseur: fournisseur.trim(),
            date: Timestamp.fromDate(new Date(dateAchat)),
            timestamp: Timestamp.now(),
            statutPaiement,
            remiseGlobale: Number(remiseGlobale) || 0,
            articles: articlesToSave,
            stock: stockChoice,
            stockSource: stockChoice,
            magasin: stockChoice,
            depot: stockChoice,
            modifiePar: user.uid,
            modifieParEmail: user.email,
            modifieLe: Timestamp.now(),
          });
          await addDoc(collection(db, "societe", societeId, "activities"), {
            type: "achat",
            userId: user.uid,
            userEmail: user.email,
            timestamp: Timestamp.now(),
            details: {
              fournisseur: fournisseur.trim(),
              montant: montantTotal,
              articles: articlesToSave.length,
              action: "modification",
              achatId: editId,
              statutPaiement,
              stock: stockChoice,
            },
          });
          setIsEditing(false);
          setEditId(null);
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
            creePar: user.uid,
            creeParEmail: user.email,
            creeLe: Timestamp.now(),
            societeId,
            stock: stockChoice,
            stockSource: stockChoice,
            magasin: stockChoice,
            depot: stockChoice,
          });
          await addDoc(collection(db, "societe", societeId, "activities"), {
            type: "achat",
            userId: user.uid,
            userEmail: user.email,
            timestamp: Timestamp.now(),
            details: {
              fournisseur: fournisseur.trim(),
              montant: montantTotal,
              articles: articlesToSave.length,
              action: "création",
              achatId: ref.id,
              statutPaiement,
              stock: stockChoice,
            },
          });
          if (statutPaiement === "payé") {
            await addDoc(collection(db, "societe", societeId, "paiements"), {
              docId: ref.id,
              montant: montantTotal,
              mode: "Espèces",
              type: "achats",
              date: Timestamp.now(),
              createdBy: user.email,
              stock: stockChoice,
              stockSource: stockChoice,
              magasin: stockChoice,
              depot: stockChoice,
            });
            await addDoc(collection(db, "societe", societeId, "activities"), {
              type: "paiement",
              userId: user.uid,
              userEmail: user.email,
              timestamp: Timestamp.now(),
              details: {
                mode: "Espèces",
                type: "achats",
                montant: montantTotal,
                fournisseur: fournisseur.trim(),
                paiementAuto: true,
                stock: stockChoice,
              },
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
    },
    [
      societeId,
      user,
      fournisseur,
      dateAchat,
      articles,
      isEditing,
      editId,
      statutPaiement,
      remiseGlobale,
      stockChoice,
      fetchAchats,
      fetchMedicaments,
      fetchStockEntries,
      achats,
      showNotification,
    ]
  );
  /* ===================== RÉCEPTION ===================== */
  const handleStartReception = useCallback(
    (bon) => {
      if (bon?.statutReception !== "en_attente") {
        showNotification("Bon déjà traité.", "error");
        return;
      }
      setStockChoice(pickDocStock(bon));
      setReceptionId(bon.id);
      setReceptionArticles(
        (bon.articles || []).map((a) => ({
          ...a,
          recu: {
            ...(a.commandee || {}),
            stock: pickDocStock(bon),
            stockSource: pickDocStock(bon),
          },
        }))
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [showNotification]
  );
  const handleUpdateReceptionArticle = useCallback(
    (index, field, value) => {
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
    },
    [stockChoice]
  );
  const handleSubmitReception = useCallback(async () => {
    if (!societeId || !user || !receptionId) return;
    setIsLoading(true);
    try {
      const achatRef = doc(db, "societe", societeId, "achats", receptionId);
      const achatSnap = await getDoc(achatRef);
      if (!achatSnap.exists()) {
        showNotification("Le bon d'achat n'existe pas ou a été supprimé.", "error");
        return;
      }
      let isFull = true;
      let hasSome = false;
      receptionArticles.forEach((a) => {
        if ((a?.recu?.quantite || 0) < (a?.commandee?.quantite || 0)) isFull = false;
        if ((a?.recu?.quantite || 0) > 0) hasSome = true;
      });
      const statut = !hasSome ? "annulé" : isFull ? "reçu" : "partiel";
      await updateDoc(achatRef, {
        articles: receptionArticles,
        statutReception: statut,
        dateReception: Timestamp.now(),
        recuPar: user.uid,
        recuParEmail: user.email,
        stock: stockChoice,
        stockSource: stockChoice,
        magasin: stockChoice,
        depot: stockChoice,
      });
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "reception_achat",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
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
      setReceptionId(null);
      setReceptionArticles([]);
      await Promise.all([fetchAchats(), fetchStockEntries(), fetchMedicaments()]);
    } catch (e) {
      console.error("handleSubmitReception:", e);
      showNotification("Erreur lors de la confirmation", "error");
    } finally {
      setIsLoading(false);
    }
  }, [
    societeId,
    user,
    receptionId,
    receptionArticles,
    achats,
    updateStockOnAdd,
    showNotification,
    fetchAchats,
    fetchStockEntries,
    fetchMedicaments,
    stockChoice,
  ]);
  const handleCancelReception = useCallback(() => {
    setReceptionId(null);
    setReceptionArticles([]);
  }, []);
  /* ===================== EDITION BON ===================== */
  const handleEditBon = useCallback(
    (bon) => {
      setEditId(bon.id);
      setIsEditing(true);
      setShowCreateForm(true);
      setFournisseur(bon.fournisseur || "");
      const d = toDateSafe(bon.date) || toDateSafe(bon.timestamp) || new Date();
      setDateAchat(d.toISOString().split("T")[0]);
      setStatutPaiement(bon.statutPaiement || "payé");
      setRemiseGlobale(Number(bon.remiseGlobale || 0));
      setStockChoice(pickDocStock(bon));
      setArticles(
        (bon.articles || []).map((a) => ({
          produit: a.produit,
          commandee: {
            ...(a.commandee || {}),
            stock: pickDocStock(bon),
            stockSource: pickDocStock(bon),
          },
          recu: a.recu
            ? { ...a.recu, stock: pickDocStock(bon), stockSource: pickDocStock(bon) }
            : null,
        }))
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [toDateSafe]
  );
  /* ===================== SUPPRESSION BON ===================== */
  const handleDeleteBon = useCallback(
    async (bon) => {
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
        paiementsSnapshot.forEach((d) => batch.delete(d.ref));
        const receivedArticles = (bon.articles || [])
          .filter((a) => (a?.recu?.quantite || 0) > 0)
          .map((a) => ({ produit: a.produit, ...(a.recu || {}) }));
        const montantTotal =
          (receivedArticles.length
            ? receivedArticles.reduce(
                (sum, a) =>
                  sum +
                  ((a.prixUnitaire || a.prixAchat || 0) * (a.quantite || 0) -
                    (a.remise || 0)),
                0
              )
            : 0) - (Number(bon.remiseGlobale) || 0);
        if (bon.statutReception && bon.statutReception !== "en_attente") {
          await updateStockOnDelete({
            id: bon.id,
            fournisseur: bon.fournisseur || "",
            articles: receivedArticles,
          });
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
            montantPaiementsSupprimés: paiementsSnapshot.docs.reduce(
              (sum, d) => sum + (Number(d.data().montant) || 0),
              0
            ),
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
    },
    [
      societeId,
      user,
      updateStockOnDelete,
      fetchAchats,
      fetchMedicaments,
      fetchStockEntries,
      showNotification,
    ]
  );
  /* ===================== TRANSFERT MENSUEL S1→S2 ===================== */
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferBonId, setTransferBonId] = useState("");
  const [transferArticleIndex, setTransferArticleIndex] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const transferEligibleBons = useMemo(
    () =>
      achats.filter(
        (bon) =>
          (bon.statutReception === "reçu" || bon.statutReception === "partiel") &&
          bon.articles?.some((a) => (a?.recu?.quantite || 0) > 0)
      ),
    [achats]
  );
  const selectedTransferBon = useMemo(
    () => achats.find((b) => b.id === transferBonId) || null,
    [achats, transferBonId]
  );
  const transferArticles = useMemo(
    () => selectedTransferBon?.articles?.filter((a) => (a?.recu?.quantite || 0) > 0) || [],
    [selectedTransferBon]
  );
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
      const bonOriginal = achats.find((b) => b.id === transferBonId);
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
        showNotification(
          `Quantité > quantité reçue disponible (${currentQty}).`,
          "error"
        );
        return;
      }
      setIsLoading(true);
      const articleTransfere = {
        produit: articleOriginal.produit,
        commandee: {
          ...articleOriginal.commandee,
          quantite: qtyToTransfer,
          stock: "stock2",
          stockSource: "stock2",
        },
        recu: {
          ...articleOriginal.recu,
          quantite: qtyToTransfer,
          stock: "stock2",
          stockSource: "stock2",
        },
      };
      const prixAchatUnit = Number(
        articleOriginal.recu.prixUnitaire || articleOriginal.recu.prixAchat || 0
      );
      const remiseItem = Number(articleOriginal.recu.remise || 0);
      const remiseParUnite = currentQty > 0 ? remiseItem / currentQty : 0;
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
      const totalPayeOriginal = paiementsOriginal.reduce(
        (s, p) => s + (Number(p.montant) || 0),
        0
      );
      const lastMode =
        paiementsOriginal[0]?.mode ||
        paiementsOriginal[paiementsOriginal.length - 1]?.mode ||
        "Espèces";
      let montantPaiementNouveau = 0;
      let statutPaiementNouveau = "impayé";
      if (bonOriginal.statutPaiement === "payé") {
        montantPaiementNouveau = Math.max(0, Number(montantTransfere.toFixed(2)));
        statutPaiementNouveau = "payé";
      } else if (bonOriginal.statutPaiement === "partiel") {
        const ratio = totalOriginal > 0 ? montantTransfere / totalOriginal : 0;
        const proportion = Math.max(0, Math.min(1, ratio));
        montantPaiementNouveau = Math.min(
          montantTransfere,
          Number((totalPayeOriginal * proportion).toFixed(2))
        );
        if (montantPaiementNouveau <= 0.001) statutPaiementNouveau = "impayé";
        else if (Math.abs(montantPaiementNouveau - montantTransfere) < 0.01)
          statutPaiementNouveau = "payé";
        else statutPaiementNouveau = "partiel";
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
        transferDate: Timestamp.now(),
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
        recu: { ...articleOriginal.recu, quantite: currentQty - qtyToTransfer },
      };
      const bonOriginalRef = doc(db, "societe", societeId, "achats", transferBonId);
      await updateDoc(bonOriginalRef, {
        articles: articlesOriginalUpdated,
        lastTransferDate: Timestamp.now(),
        lastTransferNote: transferNote || "Transfert mensuel Stock1 → Stock2",
      });
      await updateStockOnAdd({
        id: nouveauBonRef.id,
        fournisseur: fournisseurTransfert,
        stock: "stock2",
        articles: [{ produit: articleOriginal.produit, ...articleTransfere.recu }],
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
      showNotification(
        `Transfert réussi : ${qtyToTransfer} unités → Stock2. Nouveau bon créé (${statutPaiementNouveau}).`,
        "success"
      );
      resetTransferForm();
      await Promise.all([fetchAchats(), fetchStockEntries()]);
    } catch (e) {
      console.error("handleTransfer:", e);
      showNotification("Erreur lors du transfert.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [
    societeId,
    user,
    achats,
    transferBonId,
    transferArticleIndex,
    transferQty,
    transferNote,
    updateStockOnAdd,
    fetchAchats,
    fetchStockEntries,
    showNotification,
    getTotalBon,
  ]);
  /* ===================== AFFICHAGE UTILITAIRES ===================== */
  const formatDateDisplay = useCallback(
    (dateField) => {
      const d = toDateSafe(dateField);
      if (!d) return "Date non spécifiée";
      try {
        return d.toLocaleDateString("fr-FR");
      } catch {
        return d.toISOString().split("T")[0].split("-").reverse().join("/");
      }
    },
    [toDateSafe]
  );
  /* ===================== IMPRESSION (AMÉLIORÉE) ===================== */
  const buildBonHTML = (bon, entete, pied) => {
    const rows = (bon.articles || [])
      .map((a, idx) => {
        const item = a.recu || a.commandee || {};
        const exp = item?.datePeremption
          ? typeof item.datePeremption?.toDate === "function"
            ? item.datePeremption.toDate().toLocaleDateString("fr-FR")
            : typeof item.datePeremption === "string"
            ? item.datePeremption.split("-").reverse().join("/")
            : formatDateDisplay(item.datePeremption)
          : "";
        const total =
          (item.prixUnitaire || item.prixAchat || 0) * (item.quantite || 0) -
          (item.remise || 0);
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
        </tr>`;
      })
      .join("");
    const totalGeneral = Number(getTotalBon(bon) || 0).toFixed(2);
    return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><title>Bon d'achat #${String(bon.id).slice(0, 8)}</title>
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
</style></head>
<body>
  <div class="header">
    <div>
      <div class="title">${entete || "PHARMACIE"}</div>
      <div class="meta">Fournisseur : <strong>${bon.fournisseur || ""}</strong></div>
      <div class="meta">Date : <strong>${
        bon.date
          ? (typeof bon.date.toDate === "function"
              ? bon.date.toDate()
              : new Date(bon.date)
            ).toLocaleDateString("fr-FR")
          : new Date().toLocaleDateString("fr-FR")
      }</strong></div>
      <div class="meta">Paiement : <strong>${
        bon.statutPaiement || "—"
      }</strong> | Réception : <strong>${
      bon.statutReception || "en_attente"
    }</strong> | Stock : <strong>${bon.stock || "stock1"}</strong></div>
    </div>
    <div class="badge">Bon #${String(bon.id).slice(0, 8).toUpperCase()}</div>
  </div>
  <table class="table">
    <thead>
      <tr>
        <th class="left">#</th><th class="left">Produit</th><th>Lot</th><th>Code</th>
        <th>Qté</th><th>P.P.H</th><th>P.P.V</th><th>Exp.</th><th>Remise</th><th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="tot">TOTAL GÉNÉRAL : <span style="color:#1D4ED8">${totalGeneral} DHS</span></div>
  <div class="footer">
    <div class="cachet">${
      bon?.afficherCachet === false
        ? ""
        : (bon?.typeCachet || "").toString() === "image" && bon?.cachetImage
        ? `<img src="${bon.cachetImage}" alt="Cachet" style="height:${Number(
            bon.tailleCachet || 120
          )}px">`
        : `<div style="border:2px dashed #CBD5E1;border-radius:8px;padding:10px 14px;display:inline-block">${
            bon.cachetTexte || "Cachet Pharmacie"
          }</div>`
    }</div>
    <div class="meta">${pied || ""}</div>
  </div>
  <button class="no-print" onclick="window.print()">🖨️ Imprimer</button>
</body>
</html>`;
  };
  const handlePrintBon = useCallback(
    (bon) => {
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
        if (!win) {
          alert("Pop-up bloqué. Autorisez les fenêtres pop-up pour imprimer.");
          return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.onload = () => {
          try {
            win.focus();
            win.print();
          } catch {}
        };
      } catch (e) {
        console.error("handlePrintBon:", e);
        showNotification("Erreur lors de l'impression", "error");
      }
    },
    [parametres, showNotification]
  );
  const handlePrintFilteredList = useCallback(() => {
    try {
      const rows = filteredAchats
        .map(
          (b, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="left">${b.fournisseur || ""}</td>
          <td>${formatDateDisplay(b.date || b.timestamp)}</td>
          <td>${b.statutPaiement || ""}</td>
          <td>${b.statutReception || "en_attente"}</td>
          <td>${(b.stock || "stock1").toUpperCase()}</td>
          <td><strong>${Number(getTotalBon(b) || 0).toFixed(2)}</strong></td>
        </tr>`
        )
        .join("");
      const total = filteredAchats.reduce((s, b) => s + getTotalBon(b), 0);
      const html = `
<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" />
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
</style></head><body>
  <h1>Liste des bons d'achat (filtrés)</h1>
  <table><thead><tr>
    <th>#</th><th class="left">Fournisseur</th><th>Date</th><th>Paiement</th><th>Réception</th><th>Stock</th><th>Total</th>
  </tr></thead><tbody>${rows}</tbody></table>
  <div class="tot">TOTAL GÉNÉRAL : <span style="color:#1D4ED8">${Number(total).toFixed(
    2
  )} DHS</span></div>
  <button class="no-print" onclick="window.print()">🖨️ Imprimer</button>
</body></html>`;
      const win = window.open("", "_blank");
      if (!win) {
        alert("Pop-up bloqué. Autorisez les fenêtres pop-up pour imprimer.");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.onload = () => {
        try {
          win.focus();
          win.print();
        } catch {}
      };
    } catch (e) {
      console.error("handlePrintFilteredList:", e);
      showNotification("Erreur lors de l'impression", "error");
    }
  }, [filteredAchats, getTotalBon, formatDateDisplay, showNotification]);
  /* ===================== TOTAUX ===================== */
  const totalGeneral = useMemo(
    () => filteredAchats.reduce((sum, bon) => sum + getTotalBon(bon), 0),
    [filteredAchats, getTotalBon]
  );
  /* ===================== CATALOGUE → PICK LINES ===================== */
  const pickFromCatalogue = useCallback(
    (it) => {
      try {
        setProduit(it.nom || "");
        const ppv = Number(it.prixVente || 0) || "";
        setPrixVente(ppv);
        if (ppv) setPrixUnitaire(calculerPPH(ppv));
        setNumeroArticle(pickAnyBarcode(it));
        setQuantite(1);
        window.scrollTo({ top: 0, behavior: "smooth" });
        showNotification("Article du catalogue chargé dans la ligne de saisie.", "success");
      } catch (e) {
        console.error(e);
        showNotification("Impossible de charger l'article du catalogue.", "error");
      }
    },
    [showNotification, pickAnyBarcode, calculerPPH]
  );
  /* ===================== RENDU (DÉBUT) ===================== */
  if (waiting) {
    return (
      <div className="achats-page">
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg,#EEF2FF,#FFFFFF)",
            textAlign: "center",
            padding: "60px 20px",
          }}
        >
          <div style={{ fontSize: "2em", marginBottom: "20px" }}>⏳</div>
          <div style={{ fontSize: "1.3em", fontWeight: "700", color: "var(--primary)" }}>
            Chargement des données…
          </div>
        </div>
      </div>
    );
  }
  const datalistNames = Array.from(
    new Set([
      ...catalogue.map((c) => c.nom).filter(Boolean),
      ...stockEntries.map((e) => e.nom).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));
  return (
    <div className="achats-page">
      <div className="page-header">
        <h1>🛒 Gestion des Achats</h1>
        <div className="page-sub">
          ✨ Dates automatiques : Aujourd'hui • Impayé • Péremption +2 ans • Marge {tauxMarge}%
        </div>
      </div>
      {notification && (
        <div className={`notice ${notification.type || "success"}`}>{notification.message}</div>
      )}
      {/* ===================== FORMULAIRE NOUVEAU / MODIFIER BON ===================== */}
      <div className="card">
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>{isEditing ? "✏️ Modifier un Bon d'Achat" : "➕ Nouveau Bon d'Achat"}</span>
          <div className="controls-bar">
            <button
              className="btn btn-outline"
              onClick={() => setShowCreateForm((s) => !s)}
              aria-label="Afficher/Masquer le formulaire d'achat"
            >
              {showCreateForm ? "🔽 Masquer" : "🧾 Afficher Formulaire"}
            </button>
            {articles.length > 0 && (
              <span className="filters-badge">
                {articles.length} article{articles.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className={`form-panel ${showCreateForm ? "form-shown" : "form-hidden"}`}>
          <div className="form-panel-inner">
            <div className="form-grid">
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
              <input
                className="field"
                type="date"
                value={dateAchat}
                onChange={(e) => setDateAchat(e.target.value)}
                title="📅 Date d'achat"
              />
              <select
                className="select"
                value={statutPaiement}
                onChange={(e) => setStatutPaiement(e.target.value)}
                aria-label="Statut de paiement"
              >
                <option value="impayé">💰 Impayé</option>
                <option value="partiel">🟡 Partiel</option>
                <option value="payé">✅ Payé</option>
              </select>
              <select
                className="select"
                value={stockChoice}
                onChange={(e) => setStockChoice(e.target.value)}
                aria-label="Choix du stock"
              >
                <option value="stock1">🏪 Stock 1</option>
                <option value="stock2">🏬 Stock 2</option>
              </select>
              <input
                className="field"
                type="number"
                step="0.01"
                placeholder="Remise globale (DHS)"
                value={remiseGlobale}
                onChange={(e) => setRemiseGlobale(e.target.value)}
              />
            </div>
            <hr />
            <div className="article-grid">
              <input
                className="field"
                placeholder="Produit *"
                value={produit}
                onChange={(e) => handleProduitChange(e.target.value)}
                list="meds"
              />
              <datalist id="meds">
                {datalistNames.map((name) => (
                  <option key={name} value={name} />
                ))}
                <option value="_new_">-- Nouveau produit --</option>
              </datalist>
              <input
                className="field"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="Marge %"
                value={tauxMarge}
                onChange={(e) => setTauxMarge(Number(e.target.value) || 0)}
                title="Taux de marge pour calculer P.P.V depuis P.P.H"
                aria-label="Taux de marge"
              />
              <input
                className="field"
                type="number"
                min="1"
                placeholder="Quantité *"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
              />
              <input
                className="field"
                type="number"
                step="0.01"
                placeholder="P.P.H (Prix d'achat) *"
                value={prixUnitaire}
                onChange={(e) => handlePPHChange(e.target.value)}
                title={`Prix Public Hôpital • Marge ${tauxMarge}%`}
              />
              <input
                className="field"
                type="number"
                step="0.01"
                placeholder="P.P.V (Prix de vente)"
                value={prixVente}
                onChange={(e) => handlePPVChange(e.target.value)}
                title={`Prix Public Vente • Marge ${tauxMarge}%`}
              />
              <input
                className="field"
                type="date"
                value={datePeremption}
                onChange={(e) => setDatePeremption(e.target.value)}
                title="📆 Péremption"
              />
              <input
                className="field"
                placeholder="N° Lot"
                value={numeroLot}
                onChange={(e) => setNumeroLot(e.target.value)}
              />
              <input
                className="field"
                placeholder="Code-barres"
                value={numeroArticle}
                onChange={(e) => setNumeroArticle(e.target.value)}
              />
              <input
                className="field"
                placeholder="Fournisseur article"
                value={fournisseurArticle}
                onChange={(e) => setFournisseurArticle(e.target.value)}
                list="dlFournisseurs"
              />
              <input
                className="field"
                type="number"
                step="0.01"
                placeholder="Remise"
                value={remiseArticle}
                onChange={(e) => setRemiseArticle(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleAddArticle}
                aria-label="Ajouter l'article"
              >
                ➕ Ajouter
              </button>
            </div>
            {articles.length > 0 && (
              <div className="table-scroll" style={{ marginTop: 20 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="left">Produit</th>
                      <th>Lot</th>
                      <th>Code</th>
                      <th>Qté</th>
                      <th>P.P.H</th>
                      <th>P.P.V</th>
                      <th>Exp.</th>
                      <th>Remise</th>
                      <th>Stock</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((a, i) => (
                      <tr key={i}>
                        <td className="left">{a.produit}</td>
                        <td>
                          <span className="chip">{a.commandee?.numeroLot || ""}</span>
                        </td>
                        <td>{a.commandee?.numeroArticle || ""}</td>
                        <td>
                          <span className="qty">{a.commandee?.quantite || 0}</span>
                        </td>
                        <td style={{ fontWeight: "800", color: "var(--primary)" }}>
                          {Number(a.commandee?.prixUnitaire || 0).toFixed(2)} DHS
                        </td>
                        <td style={{ fontWeight: "800", color: "var(--success)" }}>
                          {Number(a.commandee?.prixVente || 0).toFixed(2)} DHS
                        </td>
                        <td>{a.commandee?.datePeremption || ""}</td>
                        <td>{Number(a.commandee?.remise || 0).toFixed(2)} DHS</td>
                        <td style={{ textTransform: "uppercase", fontWeight: "800" }}>
                          {a.commandee?.stock || stockChoice}
                        </td>
                        <td>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: "8px 16px" }}
                            onClick={() => handleRemoveArticle(i)}
                            aria-label={`Supprimer ${a.produit}`}
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
              <button
                className="btn btn-primary"
                onClick={handleAddBon}
                disabled={isLoading}
                aria-label={isEditing ? "Enregistrer modifications" : "Créer bon"}
              >
                {isEditing ? "💾 Enregistrer" : "💾 Créer bon"}
              </button>
              <button
                className="btn btn-outline"
                onClick={resetForm}
                disabled={isLoading}
                aria-label="Réinitialiser"
              >
                ♻️ Réinitialiser
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setShowScanner(true)}
                aria-label="Scanner"
              >
                📷 Scanner
              </button>
            </div>
          </div>
        </div>
      </div>
       {/* ===================== TRANSFERT STOCK1 → STOCK2 ===================== */}
      <div className="card" style={{ borderColor: "#D1FAE5", borderWidth: "2px" }}>
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>🔄 Transfert mensuel — Stock1 → Stock2</span>
          <button
            className="btn btn-outline"
            onClick={() => setShowTransfer((s) => !s)}
            aria-label="Toggle transfert"
          >
            {showTransfer ? "🔽 Fermer" : "🔄 Ouvrir"}
          </button>
        </div>
        {showTransfer && (
          <div className="form-panel form-shown">
            <div className="form-panel-inner">
              <div className="notice warning">
                ⚠️ Le transfert créera un nouveau bon (Stock2) et diminuera les quantités du bon
                original.
              </div>
              <div className="form-grid">
                <select
                  className="select"
                  value={transferBonId}
                  onChange={(e) => {
                    setTransferBonId(e.target.value);
                    setTransferArticleIndex("");
                  }}
                  aria-label="Bon"
                >
                  <option value="">— Choisir un bon reçu —</option>
                  {transferEligibleBons.map((bon) => (
                    <option key={bon.id} value={bon.id}>
                      {bon.fournisseur} - {formatDateDisplay(bon.date)} (#{bon.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={transferArticleIndex}
                  onChange={(e) => setTransferArticleIndex(e.target.value)}
                  disabled={!transferBonId}
                  aria-label="Article"
                >
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
                  placeholder="Quantité"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  disabled={transferArticleIndex === ""}
                  aria-label="Quantité"
                />
                <input
                  className="field"
                  placeholder="Note"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  aria-label="Note"
                />
                <button
                  className="btn btn-success"
                  onClick={handleTransfer}
                  disabled={
                    !transferBonId ||
                    transferArticleIndex === "" ||
                    !transferQty ||
                    isLoading
                  }
                  aria-label="Transférer"
                >
                  🔄 Créer transfert
                </button>
                <button
                  className="btn btn-outline"
                  onClick={resetTransferForm}
                  disabled={isLoading}
                  aria-label="Reset"
                >
                  ♻️ Réinitialiser
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* ===================== CATALOGUE RAPIDE ===================== */}
      <div className="card">
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>📚 Catalogue rapide</span>
          <div className="controls-bar">
            {!catalogueLoaded && (
              <button
                className="btn btn-success"
                onClick={handleLoadCatalogue}
                disabled={loadingCatalogue}
                aria-label="Charger catalogue"
              >
                {loadingCatalogue ? "⏳ Chargement..." : "📦 Charger le catalogue"}
              </button>
            )}
            {catalogueLoaded && (
              <>
                <button
                  className="btn btn-outline"
                  onClick={() => setShowCatalogue((v) => !v)}
                  aria-label="Toggle catalogue"
                >
                  {showCatalogue ? "🔽 Masquer" : "📚 Afficher"}
                </button>
                <span className="filters-badge">
                  {catalogue.length} article{catalogue.length > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>
        {catalogueLoaded && (
          <div
            style={{
              background: isSearchingCatalogue
                ? "linear-gradient(135deg,#fef3c7,#fde68a)"
                : "linear-gradient(135deg,#ecfeff,#cffafe)",
              border: isSearchingCatalogue ? "2px solid #fbbf24" : "2px solid #a5f3fc",
              color: isSearchingCatalogue ? "#78350f" : "#155e75",
              padding: 10,
              borderRadius: 12,
              marginTop: 12,
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 800 }}>
              {isSearchingCatalogue
                ? `🔍 Recherche globale active • ${filteredCatalogue.length} résultat(s) sur ${catalogue.length} médicament(s)`
                : `✅ Catalogue chargé • ${catalogue.length} article(s)`}
            </div>
          </div>
        )}
        {showCatalogue && catalogueLoaded && (
          <>
            <div className="controls-bar" style={{ marginTop: 12, marginBottom: 12 }}>
              <input
                className="field"
                style={{ minWidth: 260 }}
                placeholder="🔍 Rechercher dans tout le catalogue... (ignore majuscule/minuscule)"
                value={catalogueSearch}
                onChange={(e) => setCatalogueSearch(e.target.value)}
                aria-label="Recherche"
              />
              {filteredCatalogue.length > 0 && (
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
                  📊 {filteredCatalogue.length} résultat(s) • Page {currentPageCatalogue}/
                  {totalPagesCatalogue}
                </div>
              )}
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th className="left">Nom</th>
                    <th>Code-barres</th>
                    <th>P.P.V</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCatalogue ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: 28,
                          textAlign: "center",
                          color: "#6366f1",
                          fontWeight: 700,
                        }}
                      >
                        ⏳{" "}
                        {isSearchingCatalogue
                          ? "Recherche en cours..."
                          : "Chargement..."}
                      </td>
                    </tr>
                  ) : paginatedCatalogue.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{ padding: 28, textAlign: "center", color: "#64748b" }}
                      >
                        {catalogueSearch
                          ? `Aucun résultat pour "${catalogueSearch}"`
                          : "Aucun article"}
                      </td>
                    </tr>
                  ) : (
                    paginatedCatalogue.map((it) => (
                      <CatalogueRow
                        key={it.id}
                        item={it}
                        onPick={pickFromCatalogue}
                        pickAnyBarcode={pickAnyBarcode}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPageCatalogue}
              totalPages={totalPagesCatalogue}
              onPageChange={setCurrentPageCatalogue}
              loading={loadingCatalogue}
            />
          </>
        )}
      </div>
      {/* ===================== RÉCEPTION ===================== */}
      {receptionId && (
        <div className="card" style={{ borderColor: "#BFDBFE", borderWidth: "2px" }}>
          <h3 className="section-title">
            📥 Réception #{String(receptionId).slice(0, 8).toUpperCase()}
          </h3>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="left">Produit</th>
                  <th>Qté Cmd</th>
                  <th>Qté Reçue</th>
                  <th>P.P.H</th>
                  <th>P.P.V</th>
                  <th>Expiration</th>
                </tr>
              </thead>
              <tbody>
                {receptionArticles.map((a, idx) => (
                  <tr key={idx}>
                    <td className="left" style={{ fontWeight: "800" }}>
                      {a.produit}
                    </td>
                    <td>
                      <span className="qty">{a.commandee?.quantite || 0}</span>
                    </td>
                    <td>
                      <input
                        className="field"
                        type="number"
                        min="0"
                        max={a.commandee?.quantite || 0}
                        value={a.recu?.quantite ?? 0}
                        onChange={(e) =>
                          handleUpdateReceptionArticle(idx, "quantite", e.target.value)
                        }
                        style={{ width: 100 }}
                        aria-label={`Qté ${a.produit}`}
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        type="number"
                        step="0.01"
                        value={a.recu?.prixUnitaire ?? 0}
                        onChange={(e) =>
                          handleUpdateReceptionArticle(idx, "prixUnitaire", e.target.value)
                        }
                        style={{ width: 100 }}
                        aria-label={`P.P.H ${a.produit}`}
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        type="number"
                        step="0.01"
                        value={a.recu?.prixVente ?? 0}
                        onChange={(e) =>
                          handleUpdateReceptionArticle(idx, "prixVente", e.target.value)
                        }
                        style={{ width: 100 }}
                        aria-label={`P.P.V ${a.produit}`}
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        type="date"
                        value={a.recu?.datePeremption || ""}
                        onChange={(e) =>
                          handleUpdateReceptionArticle(idx, "datePeremption", e.target.value)
                        }
                        style={{ width: 150 }}
                        aria-label={`Exp ${a.produit}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
            <button
              className="btn btn-success"
              style={{ fontSize: "1.1em", padding: "14px 28px" }}
              onClick={handleSubmitReception}
              disabled={isLoading}
              aria-label="Confirmer"
            >
              ✅ Confirmer
            </button>
            <button
              className="btn btn-outline"
              onClick={handleCancelReception}
              disabled={isLoading}
              aria-label="Annuler"
            >
              ❌ Annuler
            </button>
          </div>
        </div>
      )}
      {/* ===================== LISTE DES BONS ===================== */}
      <div className="card">
        <div className="section-title" style={{ justifyContent: "space-between" }}>
          <span>🧾 Liste des bons d'achat</span>
          <div className="controls-bar">
            <button
              className="btn btn-outline"
              onClick={() => setShowBons((v) => !v)}
              aria-label="Afficher/Masquer la liste des bons"
            >
              {showBons ? "🔽 Masquer la liste" : "📋 Afficher la liste"}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => setShowFilters((v) => !v)}
              aria-label="Afficher/Masquer les filtres"
            >
              {showFilters ? "🎯 Masquer filtres" : "🎯 Filtres"}
            </button>
            <button
              className="btn btn-primary"
              onClick={handlePrintFilteredList}
              aria-label="Imprimer liste filtrée"
            >
              🖨️ Imprimer la liste filtrée
            </button>
            <span className="filters-badge">
              Total filtré : {Number(totalGeneral).toFixed(2)} DHS
            </span>
          </div>
        </div>
        {/* Filtres */}
        <div className={`filters-panel ${showFilters ? "filters-shown" : "filters-hidden"}`}>
          <div className="filters-panel-inner">
            <div className="form-grid">
              <input
                className="field"
                placeholder="Filtrer par fournisseur"
                value={filterFournisseur}
                onChange={(e) => setFilterFournisseur(e.target.value)}
              />
              <input
                className="field"
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                title="Date début"
              />
              <input
                className="field"
                type="date"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                title="Date fin"
              />
              <select
                className="select"
                value={filterStatutPaiement}
                onChange={(e) => setFilterStatutPaiement(e.target.value)}
                aria-label="Statut paiement"
              >
                <option value="">— Paiement (tous) —</option>
                <option value="impayé">Impayé</option>
                <option value="partiel">Partiel</option>
                <option value="payé">Payé</option>
              </select>
              <select
                className="select"
                value={filterStatutReception}
                onChange={(e) => setFilterStatutReception(e.target.value)}
                aria-label="Statut réception"
              >
                <option value="">— Réception (tous) —</option>
                <option value="en_attente">En attente</option>
                <option value="partiel">Partiel</option>
                <option value="reçu">Reçu</option>
              </select>
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span className="filters-badge">
                {activeFiltersCount} filtre{activeFiltersCount > 1 ? "s" : ""} actif
                {activeFiltersCount > 1 ? "s" : ""}
              </span>
              <button className="btn btn-outline" onClick={resetFilters}>
                ♻️ Réinitialiser
              </button>
            </div>
          </div>
        </div>
        {/* Tableau des bons */}
        {showBons && (
          <>
            <div className="table-scroll" style={{ marginTop: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th className="left">Fournisseur</th>
                    <th>Date</th>
                    <th>Paiement</th>
                    <th>Réception</th>
                    <th>Stock</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBons.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ padding: 28, textAlign: "center", color: "#64748b" }}
                      >
                        Aucun bon pour ces filtres.
                      </td>
                    </tr>
                  ) : (
                    paginatedBons.map((bon, idx) => (
                      <BonRow
                        key={bon.id || idx}
                        bon={bon}
                        index={idx}
                        onPrint={handlePrintBon}
                        onReception={handleStartReception}
                        onEdit={handleEditBon}
                        onDelete={handleDeleteBon}
                        formatDateDisplay={formatDateDisplay}
                        getTotalBon={getTotalBon}
                      />
                    ))
                  )}
                </tbody>
                {paginatedBons.length > 0 && (
                  <tfoot>
                    <tr className="table-total">
                      <td className="left" colSpan={5}>
                        TOTAL (page courante)
                      </td>
                      <td colSpan={2} style={{ textAlign: "center" }}>
                        {Number(paginatedBons.reduce((s, b) => s + getTotalBon(b), 0)).toFixed(
                          2
                        )}{" "}
                        DHS
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <Pagination
              currentPage={currentPageBons}
              totalPages={totalPagesBons}
              onPageChange={setCurrentPageBons}
              loading={isLoading}
            />
          </>
        )}
      </div>
      {/* ===================== MODALE SCAN ===================== */}
      {showScanner && (
        <div className="scanner-modal-overlay" role="dialog" aria-modal="true">
          <div className="scanner-modal-content">
            <button
              className="close-btn"
              onClick={() => setShowScanner(false)}
              aria-label="Fermer le scanner"
              title="Fermer"
            >
              ✖
            </button>
            <div className="section-title">📷 Scanner un code-barres</div>
            <div className="scanner-info">
              Astuce : Vous pouvez utiliser un lecteur type "keyboard wedge" (il tape le code et
              valide avec Entrée). La saisie rapide est déjà activée. Pour la caméra, si elle ne
              démarre pas, vérifiez les permissions navigateur.
            </div>
            <div id="reader" className="scanner-container" />
            <div className="scanner-success">
              Tout code détecté remplit la ligne d'article automatiquement. Vérifiez les
              prix/quantités avant d'ajouter.
            </div>
          </div>
        </div>
      )}
      {/* ===================== RÉCAPITULATIF GLOBAL ===================== */}
      <div className="card" style={{ borderColor: "#a5b4fc", borderWidth: "2px" }}>
        <div className="section-title">📊 Récapitulatif</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <div className="notice info" style={{ margin: 0 }}>
            Bons affichés&nbsp;: <strong>{filteredAchats.length}</strong>
          </div>
          <div className="notice success" style={{ margin: 0 }}>
            Total (filtres)&nbsp;: <strong>{Number(totalGeneral).toFixed(2)} DHS</strong>
          </div>
          <div className="notice warning" style={{ margin: 0 }}>
            Page&nbsp;:{" "}
            <strong>
              {currentPageBons}/{Math.max(1, totalPagesBons)}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
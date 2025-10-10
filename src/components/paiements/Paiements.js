// src/components/paiements/Paiements.js
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

const formatDate = (v, locale = "fr-FR") => {
  const d = toDateSafe(v);
  return d ? d.toLocaleDateString(locale) : "—";
};

const formatDateTime = (v, locale = "fr-FR") => {
  const d = toDateSafe(v);
  return d ? `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}` : "—";
};

const getDateInputValue = (timestamp) => {
  const d = toDateSafe(timestamp);
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fmtDH = (n) => `${(Number(n) || 0).toFixed(2)} DH`;
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
  return "💳";
};

const getModeColor = (mode) => {
  const m = norm(mode);
  if (m === "especes" || m === "espèces") return "#10b981";
  if (m === "cheque" || m === "chèque") return "#3b82f6";
  if (m === "traite") return "#8b5cf6";
  return "#6b7280";
};

/* ================= Styles (injection) ================= */
const useInjectStyles = () => {
  useEffect(() => {
    if (document.getElementById("paie-styles")) return;
    const style = document.createElement("style");
    style.id = "paie-styles";
    style.textContent = `
      :root{
        --p:#6366f1; --p2:#8b5cf6; --bg:#f8fafc; --card:#ffffff; --border:#e5e7eb; --text:#111827;
      }
      .paie-wrap{ max-width:1280px; margin:0 auto; padding:16px; }
      .hdr{ background:linear-gradient(135deg,var(--p),var(--p2)); color:#fff; border-radius:16px; padding:16px; margin-bottom:16px; box-shadow:0 12px 30px rgba(99,102,241,.25); }
      .card{ background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; box-shadow:0 6px 20px rgba(99,102,241,.06); }
      .controls{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .btn{ padding:8px 12px; border-radius:10px; border:1px solid var(--border); cursor:pointer; font-weight:700; transition:all 0.2s ease; }
      .btn:hover{ transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.1); }
      .btn.on{ background:#10b981; color:#fff; border-color:#10b981; }
      .btn.primary{ background:linear-gradient(135deg,var(--p),var(--p2)); color:#fff; border:0; }
      .btn.warn{ background:#f59e0b; color:#fff; border:0; }
      .btn.danger{ background:#ef4444; color:#fff; border:0; }
      .btn.secondary{ background:#6b7280; color:#fff; border:0; }
      .select,.field{ padding:8px 10px; border-radius:10px; border:1px solid var(--border); background:#fff; }
      .notice{ border-radius:12px; padding:12px; font-weight:600; margin-bottom:12px; }
      .notice.success{ background:#dcfce7; color:#065f46; }
      .notice.error{ background:#fee2e2; color:#7f1d1d; }
      .notice.warning{ background:#fef3c7; color:#92400e; }
      .tbl-wrap{ width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid var(--border); border-radius:12px; background:#fff; }
      table.tbl{ width:100%; min-width:1100px; border-collapse:collapse; }
      .tbl thead th{ position:sticky; top:0; background:linear-gradient(135deg,#f8fafc,#eef2ff); color:#111827; font-weight:800; font-size:12px; letter-spacing:.5px; border-bottom:1px solid var(--border); padding:10px; text-align:center; z-index:1; }
      .tbl tbody td{ padding:10px; border-bottom:1px solid var(--border); text-align:center; color:#0f172a; font-weight:600; }
      .left{text-align:left}
      .chip{ padding:4px 8px; border-radius:8px; background:#eef2ff; color:var(--p); font-weight:800; display:inline-block; }
      .soft{ color:#6b7280; }
      .money{ color:var(--p); font-weight:800; }
      .rowbtn{ background:transparent; border:0; cursor:pointer; font-weight:800; color:#4b5563; padding:4px 8px; border-radius:6px; }
      .rowbtn:hover{ color:#1f2937; background:#f3f4f6; }
      .subcard{ background:#f8fafc; border:1px solid var(--border); border-radius:12px; padding:12px; }
      .payment-group{ background:#fff; border:1px solid var(--border); border-radius:10px; padding:12px; margin-bottom:8px; }
      .payment-badge{ display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; font-size:13px; font-weight:700; }
      .grid-add{ display:grid; grid-template-columns: 130px 1fr 140px 150px 1fr 130px 1fr auto; gap:8px; }
      @media (max-width:1100px){ .grid-add{ grid-template-columns: 1fr 1fr; } }
      .tbl tfoot td{ padding:12px 10px; font-weight:900; border-top:2px solid var(--border); background:#f8fafc; }
      .mode-summary{ display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; margin:2px; }
      .modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px; backdrop-filter:blur(4px); }
      .modal-content{ background:#fff; border-radius:16px; padding:24px; max-width:800px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
      .modal-header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:12px; border-bottom:2px solid var(--border); }
      .modal-close{ background:transparent; border:0; font-size:28px; cursor:pointer; color:#6b7280; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:8px; }
      .modal-close:hover{ background:#f3f4f6; color:#1f2937; }
      .form-group{ margin-bottom:16px; }
      .form-label{ display:block; font-size:13px; font-weight:700; color:#374151; margin-bottom:6px; }
      .form-input{ width:100%; padding:10px 14px; border-radius:10px; border:2px solid var(--border); font-size:14px; transition:all 0.2s ease; }
      .form-input:focus{ outline:none; border-color:var(--p); box-shadow:0 0 0 3px rgba(99,102,241,0.1); }
      @media print { .no-print{ display:none !important; } }
    `;
    document.head.appendChild(style);
  }, []);
};

/* ================= Component ================= */
export default function Paiements() {
  useInjectStyles();
  const { societeId, user, loading } = useUserRole();

  const [relatedTo, setRelatedTo] = useState("ventes");
  const [notification, setNotification] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [paiements, setPaiements] = useState([]);
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

  // 🆕 États pour l'édition de paiement
  const [editingPayment, setEditingPayment] = useState(null);
  const [editPaymentDate, setEditPaymentDate] = useState("");
  const [editPaymentMode, setEditPaymentMode] = useState("Espèces");
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentInstruments, setEditPaymentInstruments] = useState([]);

  const unsubDocsRef = useRef(null);
  const unsubPaysRef = useRef(null);

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
      (paiementsByDoc[d.id] || []).forEach(p => {
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
          if (!Array.isArray(data.articles) || data.articles.length === 0) return;
          if (relatedTo === "achats") {
            const st = (data.statutReception || "en_attente").toLowerCase();
            if (!["reçu", "recu", "partiel"].includes(st)) return;
          }
          arr.push({ id: d.id, ...data });
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
      (e) => console.error("docs", e)
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

  useEffect(() => {
    if (!societeId) return;
    loadDocuments();
    loadPaiements();
    return () => {
      if (unsubDocsRef.current) unsubDocsRef.current();
      if (unsubPaysRef.current) unsubPaysRef.current();
    };
  }, [societeId, relatedTo, loadDocuments, loadPaiements]);

  const filteredDocs = useMemo(() => {
    const nameTerm = norm(filterName);
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return documents.filter((d) => {
      const meta = docIndex[d.id];
      if (!meta) return false;

      if (nameTerm) {
        const inName = norm(meta.name).includes(nameTerm);
        const inNum = norm(meta.numberStr).includes(nameTerm);
        if (!inName && !inNum) return false;
      }

      if (filterMode !== "all" || from || to) {
        const pays = paiementsByDoc[d.id] || [];
        const matchAny = pays.some((p) => {
          if (!isModeWanted(p.mode, filterMode)) return false;
          const pd = toDateSafe(p.date) || new Date(0);
          if (from && pd < from) return false;
          if (to && pd > to) return false;
          return true;
        });
        if (!matchAny) return false;
      }

      if (filterStatus === "paid" && meta.solde > 0.01) return false;
      if (filterStatus === "due" && meta.solde <= 0.01) return false;

      return true;
    });
  }, [
    documents,
    docIndex,
    paiementsByDoc,
    filterName,
    dateFrom,
    dateTo,
    filterMode,
    filterStatus,
  ]);

  const docsTotals = useMemo(() => {
    let sumTotal = 0;
    let sumPaid = 0;
    let sumSolde = 0;
    for (const d of filteredDocs) {
      const meta = docIndex[d.id];
      if (!meta) continue;
      sumTotal += Number(meta.total) || 0;
      sumPaid += Number(meta.paid) || 0;
      sumSolde += Number(meta.solde) || 0;
    }
    return {
      count: filteredDocs.length,
      total: sumTotal,
      paid: sumPaid,
      solde: sumSolde,
    };
  }, [filteredDocs, docIndex]);

  const filteredDocIds = useMemo(
    () => new Set(filteredDocs.map((d) => d.id)),
    [filteredDocs]
  );

  const paymentsTotals = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    let especes = 0;
    let cheque = 0;
    let traite = 0;
    let count = 0;

    for (const p of paiements) {
      if (!filteredDocIds.has(p.docId)) continue;

      const pd = toDateSafe(p.date) || new Date(0);
      if (from && pd < from) continue;
      if (to && pd > to) continue;
      if (!isModeWanted(p.mode, filterMode)) continue;

      const amt = Number(p.montant) || 0;
      const m = norm(p.mode);
      if (m === "espèces" || m === "especes") especes += amt;
      else if (m === "cheque" || m === "chèque") cheque += amt;
      else if (m === "traite") traite += amt;

      count++;
    }

    return {
      especes,
      cheque,
      traite,
      total: especes + cheque + traite,
      count,
    };
  }, [paiements, filterMode, dateFrom, dateTo, filteredDocIds]);

  const filteredPaymentsForDoc = useCallback(
    (docId) => {
      if (!filteredDocIds.has(docId)) return [];
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
      const pays = paiementsByDoc[docId] || [];
      return pays.filter((p) => {
        if (!isModeWanted(p.mode, filterMode)) return false;
        const pd = toDateSafe(p.date) || new Date(0);
        if (from && pd < from) return false;
        if (to && pd > to) return false;
        return true;
      });
    },
    [paiementsByDoc, filterMode, dateFrom, dateTo, filteredDocIds]
  );

  const updateDocStatus = useCallback(
    async (docId, newPaidTotal, docTotal) => {
      if (!societeId || !user) return;
      let statut = "impayé";
      if (newPaidTotal >= docTotal - 0.001) statut = "payé";
      else if (newPaidTotal > 0) statut = "partiel";
      try {
        await updateDoc(doc(db, "societe", societeId, relatedTo, docId), {
          statutPaiement: statut,
          montantPaye: newPaidTotal,
          lastPaymentUpdate: Timestamp.now(),
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now(),
        });
      } catch (e) {
        console.error("maj statut", e);
      }
    },
    [societeId, user, relatedTo]
  );

  const handleSelectDocPay = useCallback(
    (docId) => {
      setSelectedDocPay(docId);
      const meta = docIndex[docId];
      if (!meta) {
        setCashAmount("");
        setCreateInstr([]);
        return;
      }
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

  const handleCreatePayment = useCallback(async () => {
    if (!societeId || !user || !selectedDocPay) return;
    const meta = docIndex[selectedDocPay];
    if (!meta) return;

    try {
      let amount = 0;
      let payloadExtra = {};

      if (payMode === "Espèces") {
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

      await addDoc(collection(db, "societe", societeId, "paiements"), {
        docId: selectedDocPay,
        montant: amount,
        mode: payMode,
        type: relatedTo,
        date: Timestamp.now(),
        creePar: user.uid,
        creeParEmail: user.email,
        creeLe: Timestamp.now(),
        societeId,
        ...payloadExtra,
      });

      const newPaid = (meta.paid || 0) + amount;
      await updateDocStatus(selectedDocPay, newPaid, meta.total);

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
    selectedDocPay,
    payMode,
    cashAmount,
    createInstr,
    docIndex,
    updateDocStatus,
    relatedTo,
    showNote,
  ]);

  // 🆕 ÉDITION DE PAIEMENT
  const handleEditPayment = useCallback((payment) => {
    setEditingPayment(payment);
    setEditPaymentDate(getDateInputValue(payment.date));
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
    setEditPaymentDate("");
    setEditPaymentMode("Espèces");
    setEditPaymentAmount("");
    setEditPaymentInstruments([]);
  }, []);

  const handleSaveEditPayment = useCallback(async () => {
    if (!societeId || !user || !editingPayment) return;

    try {
      let newAmount = 0;
      let updateData = {
        mode: editPaymentMode,
        date: Timestamp.fromDate(new Date(editPaymentDate)),
        modifieLe: Timestamp.now(),
        modifiePar: user.uid,
        modifieParEmail: user.email,
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
      const currentPaid = allPayments.reduce((s, p) => s + (Number(p.montant) || 0), 0);
      const newPaidTotal = currentPaid - oldAmount + newAmount;

      const meta = docIndex[docId];
      if (meta) {
        await updateDocStatus(docId, newPaidTotal, meta.total);
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
    editingPayment,
    editPaymentMode,
    editPaymentDate,
    editPaymentAmount,
    editPaymentInstruments,
    paiementsByDoc,
    docIndex,
    updateDocStatus,
    handleCancelEditPayment,
    showNote,
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

  // 🆕 SUPPRESSION DE PAIEMENT
  const handleDeletePayment = useCallback(async (payment) => {
    if (!societeId || !user || !payment) return;

    const confirmMsg = `Supprimer ce paiement de ${fmtDH(payment.montant)} (${payment.mode}) ?\n\nLe statut du document sera mis à jour automatiquement.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      // Supprimer le paiement
      await deleteDoc(doc(db, "societe", societeId, "paiements", payment.id));

      // Recalculer le total payé pour le document
      const docId = payment.docId;
      const allPayments = paiementsByDoc[docId] || [];
      const deletedAmount = Number(payment.montant) || 0;
      const currentPaid = allPayments.reduce((s, p) => s + (Number(p.montant) || 0), 0);
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
  }, [societeId, user, paiementsByDoc, docIndex, updateDocStatus, showNote]);

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

      // Calculer le nouveau montant total
      const newTotal = clean.reduce((s, it) => s + it.montant, 0);

      await updateDoc(
        doc(db, "societe", societeId, "paiements", editingInstrumentsFor.id),
        { 
          instruments: clean, 
          montant: newTotal,
          modifieLe: Timestamp.now() 
        }
      );

      // Recalculer le solde du document
      const docId = editingInstrumentsFor.docId;
      const allPayments = paiementsByDoc[docId] || [];
      const oldAmount = Number(editingInstrumentsFor.montant) || 0;
      const currentPaid = allPayments.reduce((s, p) => s + (Number(p.montant) || 0), 0);
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
  }, [societeId, draftInstruments, editingInstrumentsFor, paiementsByDoc, docIndex, updateDocStatus, closeInstrumentsEditor, showNote]);

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
        const modesList = meta.paymentModes.length > 0 
          ? meta.paymentModes.map(m => `${getModeIcon(m)} ${m}`).join(", ")
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
                      const lab = canLabel
                        ? labelInstruments(Array.isArray(p.instruments) ? p.instruments : [])
                        : "—";
                      return `
                        <tr>
                          <td class="left">${escapeHtml(formatDateTime(p.date))}</td>
                          <td>${getModeIcon(p.mode)} ${escapeHtml(p.mode || "—")}</td>
                          <td class="money">${fmtDH(p.montant)}</td>
                          <td>${escapeHtml(lab)}</td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            `;
        return `
          <section class="doc-block">
            <h4>${escapeHtml(meta.name)} • ${escapeHtml(meta.numberStr)}</h4>
            ${inner}
          </section>
        `;
      })
      .join("");

    const recap = `
      <div class="recap">
        <div><span class="muted">💵 Espèces</span><b>${fmtDH(paymentsTotals.especes)}</b></div>
        <div><span class="muted">🏦 Chèque</span><b>${fmtDH(paymentsTotals.cheque)}</b></div>
        <div><span class="muted">📝 Traite</span><b>${fmtDH(paymentsTotals.traite)}</b></div>
        <div><span class="muted">Grand total</span><b>${fmtDH(paymentsTotals.total)}</b></div>
        <div><span class="muted"># paiements</span><b>${paymentsTotals.count}</b></div>
      </div>
    `;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root{ --ink:#0f172a; --muted:#6b7280; --border:#e5e7eb; --bg:#ffffff; --brand:#4f46e5; }
  *{ box-sizing:border-box; }
  body{ font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial; color:#0f172a; background:#fff; margin:24px; }
  h1{ margin:0 0 4px 0; font-size:22px; }
  .meta{ color:var(--muted); margin-bottom:16px; font-size:12px; }
  .filters{ background:#f8fafc; border:1px solid var(--border); padding:8px 12px; border-radius:8px; margin: 8px 0 16px 0; }
  table{ width:100%; border-collapse:collapse; }
  table.main thead th{ font-size:12px; text-transform:uppercase; letter-spacing:.3px; text-align:center; border-bottom:2px solid var(--border); padding:8px; }
  table.main tbody td{ padding:8px; border-bottom:1px solid var(--border); text-align:center; }
  table.main tfoot td{ padding:10px 8px; font-weight:900; border-top:2px solid var(--border); background:#f8fafc; }
  .left{text-align:left}
  .money{ font-weight:800; }
  .neg{ color:#b91c1c; font-weight:800; }
  .pos{ color:#065f46; font-weight:800; }
  .section-title{ margin:24px 0 8px 0; font-size:16px; border-left:4px solid var(--brand); padding-left:8px; }
  .doc-block{ page-break-inside: avoid; border:1px solid var(--border); border-radius:8px; padding:10px; margin:8px 0; }
  .doc-block h4{ margin:0 0 8px 0; }
  table.inner thead th{ text-align:left; border-bottom:1px solid var(--border); padding:6px; font-size:12px; }
  table.inner tbody td{ padding:6px; border-bottom:1px dashed #f1f5f9; }
  .muted{ color:var(--muted); }
  .recap{ display:grid; grid-template-columns: repeat(5, minmax(120px,1fr)); gap:8px; margin-top:8px; }
  .recap > div{ border:1px solid var(--border); border-radius:8px; padding:8px; display:flex; align-items:center; justify-content:space-between; }
  @media print { body{ margin:0.6cm; } .doc-block{ page-break-inside: avoid; } .recap{ grid-template-columns: repeat(5, 1fr); } }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Imprimé le ${now.toLocaleString("fr-FR")}</div>
    <div class="filters"><b>Filtres:</b> ${escapeHtml(filterSummary || "Aucun")}</div>
  </header>

  <section>
    <div class="section-title">Documents</div>
    <table class="main">
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
        ${rowsDocs || `<tr><td colspan="8" class="muted" style="text-align:center;padding:12px">Aucun document</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td class="left" colspan="2">Totaux (${docsTotals.count} doc.)</td>
          <td>—</td>
          <td class="money">${fmtDH(docsTotals.total)}</td>
          <td>${fmtDH(docsTotals.paid)}</td>
          <td class="${docsTotals.solde > 0.01 ? "neg" : "pos"}">${fmtDH(docsTotals.solde)}</td>
          <td colspan="2">—</td>
        </tr>
      </tfoot>
    </table>
  </section>

  <section>
    <div class="section-title">Détail des paiements (filtrés)</div>
    ${details || `<div class="muted">Aucun paiement correspondant aux filtres.</div>`}
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
      alert("Impossible d'ouvrir l'aperçu d'impression. Désactivez le bloqueur de pop-up ou essayez un autre navigateur.");
    }
  }, [
    relatedTo,
    filteredDocs,
    docIndex,
    paymentsTotals,
    filteredPaymentsForDoc,
    docsTotals,
    buildFilterSummary
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
  if (!user) return <div style={{ padding: 16, color: "#e11d48" }}>Non connecté.</div>;
  if (!societeId) return <div style={{ padding: 16, color: "#e11d48" }}>Aucune société.</div>;

  return (
    <div className="paie-wrap">
      <div className="hdr">
        <h1 style={{ margin: 0, fontWeight: 900 }}>💰 Gestion des Paiements (CRUD)</h1>
        <div style={{ opacity: 0.9, marginTop: 6 }}>
          {relatedTo === "ventes"
            ? "Encaissement complet : Créer, Modifier, Supprimer — Ventes"
            : "Règlement complet : Créer, Modifier, Supprimer — Achats"}
        </div>
      </div>

      {notification && (
        <div className={`notice ${notification.type || "success"}`} role="alert">
          {notification.message}
        </div>
      )}

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

          <button className="btn primary" onClick={handlePrint} title="Imprimer l'état filtré">
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
                <div style={{ fontWeight: 800 }}>Type</div>
                <div style={{ fontWeight: 800 }}>Banque</div>
                <div style={{ fontWeight: 800 }}>N°</div>
                <div style={{ fontWeight: 800 }}>Échéance</div>
                <div style={{ fontWeight: 800 }}>Titulaire</div>
                <div style={{ fontWeight: 800 }}>Montant</div>
                <div style={{ fontWeight: 800 }}>Résumé</div>
                <div style={{ fontWeight: 800 }}>—</div>

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
                      {`${(it.type || "chèque").toUpperCase()} • ${it.numero || "—"} • ${
                        it.banque || "—"
                      }`}
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
                return (
                  <React.Fragment key={d.id}>
                    <tr style={{ background: expanded ? "#eef2ff" : "#fff" }}>
                      <td className="left">{meta.name}</td>
                      <td>{meta.numberStr}</td>
                      <td className="soft">{meta.dateStr}</td>
                      <td className="money">{fmtDH(meta.total)}</td>
                      <td>{fmtDH(meta.paid)}</td>
                      <td
                        style={{
                          color: meta.solde > 0.01 ? "#ef4444" : "#10b981",
                          fontWeight: 800,
                        }}
                      >
                        {fmtDH(meta.solde)}
                      </td>
                      <td>
                        <span
                          className="chip"
                          style={{
                            background: meta.solde > 0.01 ? "#f59e0b" : "#10b981",
                            color: "#fff",
                          }}
                        >
                          {meta.solde > 0.01 ? "Partiel/Impayé" : "Payé"}
                        </span>
                      </td>
                      <td>
                        {meta.paymentModes.length > 0 ? (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                            {meta.paymentModes.map((mode, idx) => (
                              <span 
                                key={idx}
                                className="mode-summary"
                                style={{ 
                                  background: getModeColor(mode),
                                  color: "#fff"
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
                      <tr>
                        <td colSpan={9} style={{ padding: 12 }}>
                          <div className="subcard">
                            <h4 style={{ margin: "0 0 12px 0", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                              💳 Paiements de <strong>{meta.name}</strong> • {meta.numberStr}
                              <span style={{ background: "#eef2ff", color: "#4f46e5", padding: "3px 10px", borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
                                {pays.length} paiement{pays.length > 1 ? "s" : ""}
                              </span>
                            </h4>

                            {pays.length === 0 ? (
                              <div className="soft">Aucun paiement enregistré.</div>
                            ) : (
                              <div style={{ display: "grid", gap: 12 }}>
                                {pays.map((p, pIdx) => {
                                  const isCheque =
                                    norm(p.mode) === "cheque" ||
                                    norm(p.mode) === "chèque";
                                  const isTraite = norm(p.mode) === "traite";
                                  const canEditInstr = isCheque || isTraite;
                                  const label =
                                    canEditInstr && Array.isArray(p.instruments)
                                      ? labelInstruments(p.instruments)
                                      : canEditInstr
                                      ? "Aucun — à compléter"
                                      : "—";

                                  return (
                                    <div key={p.id} className="payment-group">
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                          <span 
                                            className="payment-badge"
                                            style={{ 
                                              background: getModeColor(p.mode),
                                              color: "#fff"
                                            }}
                                          >
                                            {getModeIcon(p.mode)} {p.mode || "—"}
                                          </span>
                                          <span style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>
                                            {fmtDH(p.montant)}
                                          </span>
                                        </div>
                                        <div style={{ display: "flex", gap: 6 }}>
                                          <button
                                            className="btn secondary"
                                            onClick={() => handleEditPayment(p)}
                                            style={{ fontSize: 12 }}
                                            title="Modifier ce paiement"
                                          >
                                            ✏️ Modifier
                                          </button>
                                          {canEditInstr && (
                                            <button
                                              className="btn"
                                              onClick={() => openInstrumentsEditor(p)}
                                              style={{ fontSize: 12 }}
                                              title="Gérer les instruments"
                                            >
                                              ⚙️ Instruments
                                            </button>
                                          )}
                                          <button
                                            className="btn danger"
                                            onClick={() => handleDeletePayment(p)}
                                            style={{ fontSize: 12 }}
                                            title="Supprimer ce paiement"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: canEditInstr && label !== "—" ? 8 : 0 }}>
                                        📅 {formatDateTime(p.date)}
                                        {p.creeParEmail && (
                                          <span style={{ marginLeft: 12 }}>
                                            👤 Par: {p.creeParEmail}
                                          </span>
                                        )}
                                      </div>

                                      {canEditInstr && label !== "—" && (
                                        <div style={{ background: "#f0f9ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: 8, fontSize: 13 }}>
                                          <strong style={{ color: "#1e40af" }}>📎 Instruments:</strong> {label}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 16, textAlign: "center" }}>
                    <span className="soft">Aucun document pour ces filtres.</span>
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot>
              <tr>
                <td className="left" colSpan={2}>
                  <span>Totaux ({docsTotals.count} doc.)</span>
                </td>
                <td>—</td>
                <td className="money">{fmtDH(docsTotals.total)}</td>
                <td>{fmtDH(docsTotals.paid)}</td>
                <td style={{ fontWeight: 900 }}>{fmtDH(docsTotals.solde)}</td>
                <td colSpan={3}>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>
          📊 Totaux des paiements — {relatedTo === "ventes" ? "Ventes" : "Achats"} (docs filtrés)
        </h3>
        <div className="controls" style={{ flexWrap: "wrap" }}>
          <div className="subcard" style={{ minWidth: 240 }}>
            <div className="soft">💵 Espèces</div>
            <div className="money" style={{ fontSize: 18 }}>{fmtDH(paymentsTotals.especes)}</div>
          </div>
          <div className="subcard" style={{ minWidth: 240 }}>
            <div className="soft">🏦 Chèque</div>
            <div className="money" style={{ fontSize: 18 }}>{fmtDH(paymentsTotals.cheque)}</div>
          </div>
          <div className="subcard" style={{ minWidth: 240 }}>
            <div className="soft">📝 Traite</div>
            <div className="money" style={{ fontSize: 18 }}>{fmtDH(paymentsTotals.traite)}</div>
          </div>
          <div className="subcard" style={{ minWidth: 260 }}>
            <div className="soft">Grand total (paiements filtrés & docs filtrés)</div>
            <div className="money" style={{ fontSize: 20 }}>{fmtDH(paymentsTotals.total)}</div>
            <div className="soft" style={{ marginTop: 4 }}>
              {paymentsTotals.count} paiement{paymentsTotals.count > 1 ? "s" : ""} retenu(s)
            </div>
          </div>
        </div>
      </div>

      {/* 🆕 MODAL D'ÉDITION DE PAIEMENT */}
      {editingPayment && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCancelEditPayment(); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                ✏️ Modifier le paiement
              </h3>
              <button className="modal-close" onClick={handleCancelEditPayment}>×</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ background: "#f0f9ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 12 }}>
                <strong>Document:</strong> {docIndex[editingPayment.docId]?.name} • {docIndex[editingPayment.docId]?.numberStr}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Date du paiement</label>
              <input
                type="date"
                className="form-input"
                value={editPaymentDate}
                onChange={(e) => setEditPaymentDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mode de paiement</label>
              <select
                className="form-input"
                value={editPaymentMode}
                onChange={(e) => {
                  const newMode = e.target.value;
                  setEditPaymentMode(newMode);
                  if (newMode === "Espèces") {
                    setEditPaymentAmount(String(editingPayment.montant || ""));
                    setEditPaymentInstruments([]);
                  } else {
                    setEditPaymentAmount("");
                    setEditPaymentInstruments(Array.isArray(editingPayment.instruments) ? editingPayment.instruments : []);
                  }
                }}
              >
                <option>Espèces</option>
                <option>Chèque</option>
                <option>Traite</option>
              </select>
            </div>

            {editPaymentMode === "Espèces" ? (
              <div className="form-group">
                <label className="form-label">Montant (DH)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={editPaymentAmount}
                  onChange={(e) => setEditPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Instruments ({editPaymentMode})</label>
                <button className="btn" onClick={addEditInstrument} style={{ marginBottom: 8 }}>
                  ➕ Ajouter un instrument
                </button>

                {editPaymentInstruments.length > 0 && (
                  <div style={{ width: "100%", overflowX: "auto" }}>
                    <div className="grid-add" style={{ minWidth: 900 }}>
                      <div style={{ fontWeight: 800 }}>Type</div>
                      <div style={{ fontWeight: 800 }}>Banque</div>
                      <div style={{ fontWeight: 800 }}>N°</div>
                      <div style={{ fontWeight: 800 }}>Échéance</div>
                      <div style={{ fontWeight: 800 }}>Titulaire</div>
                      <div style={{ fontWeight: 800 }}>Montant</div>
                      <div style={{ fontWeight: 800 }}>Résumé</div>
                      <div style={{ fontWeight: 800 }}>—</div>

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
                            {`${(it.type || "chèque").toUpperCase()} • ${it.numero || "—"} • ${it.banque || "—"}`}
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

                <div style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
                  <strong>Total instruments:</strong> {fmtDH(editPaymentInstruments.reduce((s, it) => s + (Number(it.montant) || 0), 0))}
                </div>
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

      {/* ÉDITEUR D'INSTRUMENTS (Gérer instruments) */}
      {editingInstrumentsFor && (
        <div
          className="card"
          style={{
            marginTop: 16,
            borderColor: "#c7d2fe",
            boxShadow: "0 8px 20px rgba(99,102,241,.12)",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            🔧 Instruments pour {editingInstrumentsFor.mode} —{" "}
            <span style={{ color: "#6b7280" }}>
              Paiement de {docIndex[editingInstrumentsFor.docId]?.name || "—"} •{" "}
              {docIndex[editingInstrumentsFor.docId]?.numberStr || "—"}
            </span>
          </h3>

          <div className="controls" style={{ margin: "8px 0 12px 0" }}>
            <button className="btn" onClick={() => addInstrument()}>
              ➕ Ajouter instrument
            </button>
            <span className="soft">
              Saisissez plusieurs chèques/traites si nécessaire.
            </span>
          </div>

          {draftInstruments.length === 0 ? (
            <div className="soft">Aucun instrument. Cliquez sur "Ajouter".</div>
          ) : (
            <div style={{ width: "100%", overflowX: "auto" }}>
              <div className="grid-add" style={{ minWidth: 900 }}>
                <div style={{ fontWeight: 800 }}>Type</div>
                <div style={{ fontWeight: 800 }}>Banque</div>
                <div style={{ fontWeight: 800 }}>N°</div>
                <div style={{ fontWeight: 800 }}>Échéance</div>
                <div style={{ fontWeight: 800 }}>Titulaire</div>
                <div style={{ fontWeight: 800 }}>Montant</div>
                <div style={{ fontWeight: 800 }}>Résumé</div>
                <div style={{ fontWeight: 800 }}>—</div>

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
// src/components/stock/Stock.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";

/* ===========================
   Utils
=========================== */
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const safeNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

function safeParseDate(dateInput) {
  if (!dateInput) return null;
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === "function") {
      return dateInput.toDate();
    }
    if (dateInput?.seconds != null) {
      return new Date(dateInput.seconds * 1000);
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
const formatDateSafe = (d) => {
  const x = safeParseDate(d);
  return x ? x.toLocaleDateString("fr-FR") : "";
};
const todayISO = () => new Date().toISOString().split("T")[0];
const waEncode = (t) => encodeURIComponent(t);

/* ===========================
   Beeps (feedback)
=========================== */
function useBeeps() {
  const ctxRef = useRef(null);
  const getCtx = () => {
    if (!ctxRef.current) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) {
        try {
          ctxRef.current = new C();
        } catch {}
      }
    }
    return ctxRef.current;
  };
  const play = useCallback((freq = 880, dur = 120, type = "sine", vol = 0.12) => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume?.();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = vol;
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
  const ok = useCallback(() => {
    play(1175, 90);
    setTimeout(() => play(1568, 110), 100);
  }, [play]);
  const err = useCallback(() => play(220, 220, "square", 0.2), [play]);
  useEffect(() => {
    const unlock = () => {
      try {
        getCtx()?.resume?.();
      } catch {}
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }, []);
  return { ok, err };
}

/* ===========================
   Composant principal
=========================== */
export default function Stock() {
  const { user, societeId, loading } = useUserRole();
  const { ok: beepOk, err: beepErr } = useBeeps();

  const [waiting, setWaiting] = useState(true);

  // Stock (lots)
  const [lots, setLots] = useState([]);

  // Fournisseurs + commerciaux
  const [fournisseurs, setFournisseurs] = useState([]); // [{id, nom, commerciaux:[{nom, telephone}], ...}]
  const fournisseursByCanon = useMemo(() => {
    const m = new Map();
    fournisseurs.forEach((f) => m.set(norm(f.nom), f));
    return m;
  }, [fournisseurs]);

  // Achats (pour retrouver fournisseur si manquant dans le lot)
  const [achats, setAchats] = useState([]);

  // “Quantités à commander (issues des VENTES)” : persistance Firestore
  const [toOrder, setToOrder] = useState([]); // docs de societe/<id>/to_order_queue
  const [selectedSend, setSelectedSend] = useState({}); // lineId -> bool
  const [commercialTelByCanon, setCommercialTelByCanon] = useState({}); // supplierCanon -> tel

  // UI / formulaires
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  // Form lot
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  const [nom, setNom] = useState("");
  const [numeroLot, setNumeroLot] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [quantite, setQuantite] = useState("");
  const [stock1, setStock1] = useState("");
  const [stock2, setStock2] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [datePeremption, setDatePeremption] = useState("");
  const [codeBarre, setCodeBarre] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  // Retour / Avoir
  const [retourMontant, setRetourMontant] = useState(0);

  /* ---------- Guards ---------- */
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  /* ---------- Fetch base data ---------- */
  const fetchLots = useCallback(async () => {
    if (!societeId) {
      setLots([]);
      return;
    }
    try {
      const qy = query(collection(db, "societe", societeId, "stock_entries"), orderBy("nom"));
      const snap = await getDocs(qy);
      const arr = [];
      snap.forEach((d) => {
        const data = d.data();
        const q = safeNumber(data.quantite, 0);
        const s1 = Math.min(q, Math.max(0, safeNumber(data.stock1, q)));
        const s2 = Math.max(0, q - s1);
        arr.push({
          id: d.id,
          ...data,
          quantite: q,
          stock1: s1,
          stock2: s2,
        });
      });
      setLots(arr);
    } catch (e) {
      console.error(e);
      setLots([]);
      setError("Erreur de chargement du stock");
    }
  }, [societeId]);

  const fetchFournisseurs = useCallback(async () => {
    if (!societeId) {
      setFournisseurs([]);
      return;
    }
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "fournisseurs"));
      const arr = [];
      snap.forEach((d) => {
        const data = d.data();
        arr.push({
          id: d.id,
          nom: data.nom || "—",
          commerciaux: Array.isArray(data.commerciaux) ? data.commerciaux : [],
        });
      });
      arr.sort((a, b) => a.nom.localeCompare(b.nom));
      setFournisseurs(arr);
    } catch (e) {
      console.error(e);
      setFournisseurs([]);
    }
  }, [societeId]);

  const fetchAchats = useCallback(async () => {
    if (!societeId) {
      setAchats([]);
      return;
    }
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "achats"));
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      // Tri récent -> ancien
      arr.sort((a, b) => {
        const da = safeParseDate(a.dateReception || a.dateAchat || a.timestamp || a.createdAt) || new Date(0);
        const dbb = safeParseDate(b.dateReception || b.dateAchat || b.timestamp || b.createdAt) || new Date(0);
        return dbb - da;
      });
      setAchats(arr);
    } catch (e) {
      console.error(e);
      setAchats([]);
    }
  }, [societeId]);

  const fetchToOrder = useCallback(async () => {
    if (!societeId) {
      setToOrder([]);
      return;
    }
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "to_order_queue"));
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      // récent en haut
      arr.sort((a, b) => {
        const da = safeParseDate(a.createdAt) || new Date(0);
        const dbb = safeParseDate(b.createdAt) || new Date(0);
        return dbb - da;
      });
      setToOrder(arr);
    } catch (e) {
      console.error(e);
      setToOrder([]);
    }
  }, [societeId]);

  useEffect(() => {
    if (!waiting) {
      fetchLots();
      fetchFournisseurs();
      fetchAchats();
      fetchToOrder();
    }
  }, [waiting, fetchLots, fetchFournisseurs, fetchAchats, fetchToOrder]);

  /* ---------- Supplier resolution ---------- */
  const supplierIndex = useMemo(() => {
    const byLot = new Map();
    const byName = new Map();

    // depuis stock (prioritaire)
    for (const l of lots) {
      const sup = l.fournisseur;
      if (l.numeroLot && sup) byLot.set(String(l.numeroLot).trim(), sup);
      if (l.nom && sup) byName.set(norm(l.nom), sup);
    }

    // depuis achats
    for (const a of achats) {
      const sup = a.fournisseur || a.nomFournisseur || a.supplier || null;
      if (!sup) continue;
      const arts = Array.isArray(a.articles) ? a.articles : [];
      for (const it of arts) {
        const base = it?.recu || it?.commandee || it || {};
        const nm = base.nom || it.nom || it.designation || null;
        const lot = base.numeroLot || it.numeroLot || null;
        if (lot && !byLot.has(String(lot).trim())) byLot.set(String(lot).trim(), sup);
        if (nm && !byName.has(norm(nm))) byName.set(norm(nm), sup);
      }
    }

    return { byLot, byName };
  }, [lots, achats]);

  const guessSupplier = useCallback(
    (nomMed, numeroLot) => {
      const lotKey = numeroLot ? String(numeroLot).trim() : "";
      if (lotKey && supplierIndex.byLot.has(lotKey)) {
        return supplierIndex.byLot.get(lotKey);
      }
      const nm = norm(nomMed);
      if (nm && supplierIndex.byName.has(nm)) {
        return supplierIndex.byName.get(nm);
      }
      return null;
    },
    [supplierIndex]
  );

  const toOfficialSupplierName = useCallback(
    (maybeName) => {
      const c = norm(maybeName);
      const f = fournisseursByCanon.get(c);
      return f ? f.nom : (maybeName || "").trim() || null;
    },
    [fournisseursByCanon]
  );

  /* ---------- Ingestion des VENTES -> to_order_queue ---------- */
  const importNewSalesIntoQueue = useCallback(async () => {
    if (!societeId) return;
    try {
      // set des sourceKey déjà présents
      const existingSnap = await getDocs(collection(db, "societe", societeId, "to_order_queue"));
      const existingKeys = new Set();
      existingSnap.forEach((d) => {
        const k = d.data()?.sourceKey;
        if (k) existingKeys.add(k);
      });

      // Récup ventes
      const ventesSnap = await getDocs(collection(db, "societe", societeId, "ventes"));
      const batchAdd = [];
      ventesSnap.forEach((docV) => {
        const v = docV.data() || {};
        const articles = Array.isArray(v.articles) ? v.articles : [];
        articles.forEach((a, idx) => {
          const nomMed = a.nom || a.designation || a.med || a.produit || "";
          const lot = a.numeroLot || a.lot || "";
          const q = Math.max(1, safeNumber(a.quantite, 1));
          const sourceKey = `${docV.id}:${idx}`;
          if (existingKeys.has(sourceKey)) return; // déjà importé

          // Deviner fournisseur puis officialiser si on le connaît
          const supGuess = guessSupplier(nomMed, lot);
          const fournisseur = supGuess ? toOfficialSupplierName(supGuess) : null;

          batchAdd.push({
            produitNom: nomMed || "—",
            numeroLot: lot || "-",
            quantite: q,
            remise: 0,
            urgent: false,
            fournisseur, // peut être null -> groupe "Fournisseur inconnu"
            sourceKey,
            sourceType: "vente",
            sourceVenteId: docV.id,
            createdAt: Timestamp.now(),
          });
        });
      });

      await Promise.all(
        batchAdd.map((payload) =>
          addDoc(collection(db, "societe", societeId, "to_order_queue"), payload)
        )
      );

      if (batchAdd.length) {
        setSuccess(`${batchAdd.length} ligne(s) ajoutée(s) depuis VENTES`);
        beepOk();
      }
      await fetchToOrder();
      setTimeout(() => setSuccess(""), 1800);
    } catch (e) {
      console.error(e);
      setError("Erreur d'import des ventes");
      beepErr();
    }
  }, [societeId, fetchToOrder, guessSupplier, toOfficialSupplierName, beepOk, beepErr, setError, setSuccess]);

  // Import auto périodique (toutes les 30s) + au premier chargement
  useEffect(() => {
    if (waiting) return;
    importNewSalesIntoQueue(); // initial
    const id = setInterval(importNewSalesIntoQueue, 30000);
    return () => clearInterval(id);
  }, [waiting, importNewSalesIntoQueue]);

  /* ---------- Scanner clavier (pour le lot form) ---------- */
  useEffect(() => {
    const opts = { minChars: 6, endKey: "Enter", timeoutMs: 250 };
    const state = { buf: "", timer: null };
    const onKeyDown = (e) => {
      if (!showForm) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === opts.endKey) {
        const code = state.buf;
        state.buf = "";
        clearTimeout(state.timer);
        if (code && code.length >= opts.minChars) {
          setCodeBarre(code);
          beepOk();
        }
        return;
      }
      if (e.key && e.key.length === 1) {
        state.buf += e.key;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
          const code = state.buf;
          state.buf = "";
          if (code && code.length >= opts.minChars) {
            setCodeBarre(code);
            beepOk();
          }
        }, opts.timeoutMs);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(state.timer);
    };
  }, [showForm, beepOk]);

  /* ---------- Lot form helpers ---------- */
  const keepSplitInvariant = useCallback((q, s1) => {
    const Q = Math.max(0, safeNumber(q));
    const S1 = Math.min(Q, Math.max(0, safeNumber(s1)));
    const S2 = Math.max(0, Q - S1);
    setStock2(String(S2));
    return { Q, S1, S2 };
  }, []);

  const resetForm = useCallback(() => {
    setNom("");
    setNumeroLot("");
    setFournisseur("");
    setQuantite("");
    setStock1("");
    setStock2("");
    setPrixAchat("");
    setPrixVente("");
    setDatePeremption("");
    setCodeBarre("");
    setIsEditing(false);
    setEditId(null);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  const openEdit = useCallback((lot) => {
    setNom(lot.nom || "");
    setNumeroLot(lot.numeroLot || "");
    setFournisseur(lot.fournisseur || "");
    setQuantite(String(safeNumber(lot.quantite)));
    const s1 = Math.min(safeNumber(lot.quantite), Math.max(0, safeNumber(lot.stock1, lot.quantite)));
    setStock1(String(s1));
    setStock2(String(Math.max(0, safeNumber(lot.quantite) - s1)));
    setPrixAchat(String(safeNumber(lot.prixAchat)));
    setPrixVente(String(safeNumber(lot.prixVente)));
    setDatePeremption(
      (() => {
        const d = safeParseDate(lot.datePeremption);
        return d ? d.toISOString().split("T")[0] : "";
      })()
    );
    setCodeBarre(lot.codeBarre || "");
    setIsEditing(true);
    setEditId(lot.id);
    setShowForm(true);
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!user || !societeId) return;

      if (!nom || !numeroLot || safeNumber(quantite) < 0) {
        setError("Veuillez remplir Nom, N° lot et Quantité >= 0");
        beepErr();
        return;
      }

      const { Q, S1, S2 } = keepSplitInvariant(quantite, stock1);

      const payload = {
        nom: nom.trim(),
        numeroLot: String(numeroLot).trim(),
        fournisseur: fournisseur.trim() || null,
        quantite: Q,
        stock1: S1,
        stock2: S2,
        prixAchat: safeNumber(prixAchat),
        prixVente: safeNumber(prixVente),
        datePeremption: datePeremption ? Timestamp.fromDate(new Date(datePeremption)) : null,
        codeBarre: codeBarre ? String(codeBarre).trim() : null,
        updatedAt: Timestamp.now(),
        updatedBy: user.email || user.uid,
      };

      try {
        if (isEditing && editId) {
          await updateDoc(doc(db, "societe", societeId, "stock_entries", editId), payload);
          setSuccess("Lot mis à jour");
        } else {
          await addDoc(collection(db, "societe", societeId, "stock_entries"), {
            ...payload,
            createdAt: Timestamp.now(),
            createdBy: user.email || user.uid,
          });
          setSuccess("Lot ajouté");
        }
        beepOk();
        setShowForm(false);
        resetForm();
        await fetchLots();
        setTimeout(() => setSuccess(""), 1600);
      } catch (err) {
        console.error(err);
        setError("Erreur lors de l'enregistrement du lot");
        beepErr();
      }
    },
    [
      user,
      societeId,
      nom,
      numeroLot,
      quantite,
      stock1,
      prixAchat,
      prixVente,
      datePeremption,
      codeBarre,
      fournisseur,
      isEditing,
      editId,
      fetchLots,
      resetForm,
      keepSplitInvariant,
      beepOk,
      beepErr,
      setError,
      setSuccess,
    ]
  );

  const handleDelete = useCallback(
    async (lot) => {
      if (!user || !societeId) return;
      if (!window.confirm(`Supprimer le lot ${lot.numeroLot} de ${lot.nom} ?`)) return;
      try {
        await deleteDoc(doc(db, "societe", societeId, "stock_entries", lot.id));
        setSuccess("Lot supprimé");
        beepOk();
        await fetchLots();
        setTimeout(() => setSuccess(""), 1600);
      } catch (err) {
        console.error(err);
        setError("Erreur lors de la suppression du lot");
        beepErr();
      }
    },
    [user, societeId, fetchLots, beepOk, beepErr, setError, setSuccess]
  );

  /* ---------- Retours / Avoirs ---------- */
  const setRetour = useCallback(
    async (lot) => {
      if (!societeId || !user) return;
      const quantiteRetour = Number(window.prompt("Nombre d'unités à retourner :", 0));
      if (!Number.isFinite(quantiteRetour) || quantiteRetour <= 0 || quantiteRetour > lot.quantite) {
        setError("Quantité invalide (doit être > 0 et <= au stock total).");
        beepErr();
        return;
      }
      const montant = Number(window.prompt("Montant (DH) de l'avoir (peut être 0) :", retourMontant || 0));
      if (!Number.isFinite(montant) || montant < 0) return;
      try {
        await updateDoc(doc(db, "societe", societeId, "stock_entries", lot.id), {
          retourEnCours: true,
          retourQuantite: quantiteRetour,
          avoirMontant: montant,
          avoirRegle: false,
          retourAt: Timestamp.now(),
        });
        setSuccess("Retour/avoir signalé");
        beepOk();
        await fetchLots();
        setTimeout(() => setSuccess(""), 1600);
      } catch (e) {
        console.error(e);
        setError("Erreur lors du marquage du retour");
        beepErr();
      }
    },
    [societeId, user, retourMontant, fetchLots, beepOk, beepErr, setError, setSuccess]
  );

  const clearRetour = useCallback(
    async (lot) => {
      if (!societeId || !user) return;
      if (!window.confirm("Confirmer : l'avoir est réglé ? Le stock sera diminué automatiquement.")) return;
      const retourQ = safeNumber(lot.retourQuantite, 0);
      const newQ = Math.max(0, safeNumber(lot.quantite) - retourQ);
      const newS2 = Math.max(0, safeNumber(lot.stock2) - retourQ);
      const remainingToSubtract = Math.max(0, retourQ - safeNumber(lot.stock2));
      const newS1 = Math.max(0, safeNumber(lot.stock1) - remainingToSubtract);
      try {
        await updateDoc(doc(db, "societe", societeId, "stock_entries", lot.id), {
          avoirRegle: true,
          retourEnCours: false,
          retourClotureAt: Timestamp.now(),
          quantite: newQ,
          stock1: newS1,
          stock2: newS2,
        });
        setSuccess("Avoir réglé — retour clôturé, stock diminué");
        beepOk();
        await fetchLots();
        setTimeout(() => setSuccess(""), 1600);
      } catch (e) {
        console.error(e);
        setError("Impossible de clôturer le retour");
        beepErr();
      }
    },
    [societeId, user, fetchLots, beepOk, beepErr, setError, setSuccess]
  );

  /* ---------- Filtre de la table stock ---------- */
  const lotsFiltres = useMemo(() => {
    if (!search) return lots;
    const s = norm(search);
    return lots.filter((l) => {
      const nom = norm(l.nom);
      const nlot = norm(l.numeroLot);
      const fr = norm(l.fournisseur);
      const cb = norm(l.codeBarre);
      return nom.includes(s) || nlot.includes(s) || fr.includes(s) || cb.includes(s);
    });
  }, [lots, search]);

  /* ---------- Auto-fix fournisseur pour lignes sans fournisseur ---------- */
  useEffect(() => {
    (async () => {
      if (!societeId || !toOrder.length) return;
      const updates = toOrder.filter((l) => !l.fournisseur).map(async (l) => {
        const supGuess = guessSupplier(l.produitNom, l.numeroLot);
        const sup = supGuess ? toOfficialSupplierName(supGuess) : null;
        if (!sup) return null;
        try {
          await updateDoc(doc(db, "societe", societeId, "to_order_queue", l.id), {
            fournisseur: sup,
            updatedAt: Timestamp.now(),
          });
          return l.id;
        } catch {
          return null;
        }
      });
      const res = await Promise.all(updates);
      if (res.some(Boolean)) await fetchToOrder();
    })();
  }, [societeId, toOrder, guessSupplier, toOfficialSupplierName, fetchToOrder]);

  /* =============== RENDU =============== */
  if (waiting) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div>Chargement…</div>
      </div>
    );
  }
  if (!user || !societeId) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div>Accès non autorisé.</div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#eef2ff,#fdf2f8)",
        padding: 20,
        fontFamily: '"Inter",-apple-system,BlinkMacSystemFont,sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "rgba(255,255,255,.95)",
          borderRadius: 20,
          padding: 20,
          marginBottom: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 800,
                background: "linear-gradient(135deg,#6366f1,#a855f7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Stock (Lots) — Split stock1 / stock2
            </h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
              Retours/Avoirs, envoi WhatsApp aux commerciaux, et import auto des ventes ⤵️
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, lot, fournisseur, code-barres…"
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "2px solid #e5e7eb",
                minWidth: 280,
                outline: "none",
              }}
            />
            <button
              onClick={openCreate}
              style={{
                background: "linear-gradient(135deg,#10b981,#059669)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + Ajouter un article (lot)
            </button>
            <button
              onClick={importNewSalesIntoQueue}
              title="Importer les nouvelles ventes vers 'Quantités à commander'"
              style={{
                background: "linear-gradient(135deg,#22c55e,#16a34a)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ⤵️ Importer VENTES
            </button>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div
          style={{
            background: "rgba(254,226,226,.9)",
            color: "#b91c1c",
            padding: 12,
            borderRadius: 12,
            marginBottom: 12,
            border: "1px solid rgba(185,28,28,.2)",
          }}
        >
          {error}{" "}
          <button
            onClick={() => setError("")}
            style={{ marginLeft: 8, border: "none", background: "transparent", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      )}
      {success && (
        <div
          style={{
            background: "rgba(220,252,231,.9)",
            color: "#166534",
            padding: 12,
            borderRadius: 12,
            marginBottom: 12,
            border: "1px solid rgba(22,101,52,.2)",
          }}
        >
          {success}{" "}
          <button
            onClick={() => setSuccess("")}
            style={{ marginLeft: 8, border: "none", background: "transparent", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Form lot */}
      {showForm && (
        <div
          style={{
            background: "rgba(255,255,255,.95)",
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,.05)",
            border: "1px solid rgba(0,0,0,.03)",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 20 }}>{isEditing ? "Modifier le lot" : "Ajouter un lot"}</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Nom *</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>N° lot *</label>
                <input
                  value={numeroLot}
                  onChange={(e) => setNumeroLot(e.target.value)}
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Fournisseur</label>
                <input
                  value={fournisseur}
                  onChange={(e) => setFournisseur(e.target.value)}
                  placeholder="(facultatif — sera déduit via Achats si vide)"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Quantité totale *</label>
                <input
                  type="number"
                  value={quantite}
                  onChange={(e) => {
                    const q = e.target.value;
                    setQuantite(q);
                    const { S2 } = keepSplitInvariant(q, stock1);
                    setStock2(String(S2));
                  }}
                  min={0}
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                />
                <small style={{ color: "#6b7280" }}>stock1 + stock2 = quantité</small>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>stock1</label>
                <input
                  type="number"
                  value={stock1}
                  onChange={(e) => {
                    const s1 = e.target.value;
                    setStock1(s1);
                    const { S2 } = keepSplitInvariant(quantite, s1);
                    setStock2(String(S2));
                  }}
                  min={0}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>stock2 (auto)</label>
                <input
                  type="number"
                  value={stock2}
                  readOnly
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "2px solid #e5e7eb",
                    background: "#f9fafb",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Prix achat (DH)</label>
                <input
                  type="number"
                  step="0.01"
                  value={prixAchat}
                  onChange={(e) => setPrixAchat(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Prix vente (DH)</label>
                <input
                  type="number"
                  step="0.01"
                  value={prixVente}
                  onChange={(e) => setPrixVente(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Date d'expiration</label>
                <input
                  type="date"
                  value={datePeremption}
                  onChange={(e) => setDatePeremption(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Code-barres</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={codeBarre}
                    onChange={(e) => setCodeBarre(e.target.value)}
                    placeholder="Scannez ou saisissez"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    style={{
                      whiteSpace: "nowrap",
                      borderRadius: 10,
                      border: "2px solid #e5e7eb",
                      background: "#111827",
                      color: "#fff",
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    📷 Scanner
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button
                type="submit"
                style={{
                  background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "10px 18px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isEditing ? "Mettre à jour" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                style={{
                  background: "transparent",
                  border: "2px solid #e5e7eb",
                  borderRadius: 12,
                  padding: "10px 18px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table STOCK */}
      <div
        style={{
          background: "rgba(255,255,255,.95)",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,.05)",
          marginBottom: 16,
        }}
      >
        <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
          <table style={{ width: "100%", minWidth: 1150, borderCollapse: "collapse" }}>
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "linear-gradient(135deg,#1f2937,#111827)",
                color: "#fff",
                zIndex: 1,
              }}
            >
              <tr>
                <th style={{ padding: 14, textAlign: "left" }}>Nom</th>
                <th style={{ padding: 14, textAlign: "left" }}>N° lot</th>
                <th style={{ padding: 14, textAlign: "left" }}>Fournisseur</th>
                <th style={{ padding: 14, textAlign: "center" }}>Qté</th>
                <th style={{ padding: 14, textAlign: "center" }}>stock1</th>
                <th style={{ padding: 14, textAlign: "center" }}>stock2</th>
                <th style={{ padding: 14, textAlign: "right" }}>Prix vente</th>
                <th style={{ padding: 14, textAlign: "center" }}>Expiration</th>
                <th style={{ padding: 14, textAlign: "left" }}>Code-barres</th>
                <th style={{ padding: 14, textAlign: "center", width: 360 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lotsFiltres.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                    Aucun lot
                  </td>
                </tr>
              ) : (
                lotsFiltres.map((l, idx) => {
                  const d = safeParseDate(l.datePeremption);
                  const expired = d && d < new Date();
                  const expSoon = d && !expired && d <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  const retourBadge =
                    l.retourEnCours && !l.avoirRegle
                      ? `🟥 Retour/Avoir en attente (Qté: ${safeNumber(l.retourQuantite, 0)})`
                      : "";
                  return (
                    <tr
                      key={l.id}
                      style={{
                        background: idx % 2 ? "rgba(249,250,251,.6)" : "white",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <td style={{ padding: 12, fontWeight: 600 }}>
                        {l.nom}{" "}
                        {l.commandeStatus === "commande" && (
                          <span title="Déjà commandé" style={{ marginLeft: 6, fontSize: 12 }}>
                            🟢 Commandé
                          </span>
                        )}
                        {retourBadge && (
                          <span title="Retour/avoir non réglé" style={{ marginLeft: 6, fontSize: 12 }}>
                            {retourBadge}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>{l.numeroLot}</td>
                      <td style={{ padding: 12 }}>{l.fournisseur || "-"}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(l.quantite)}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(l.stock1)}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(l.stock2)}</td>
                      <td style={{ padding: 12, textAlign: "right" }}>{Number(l.prixVente || 0).toFixed(2)} DH</td>
                      <td
                        style={{
                          padding: 12,
                          textAlign: "center",
                          fontWeight: 600,
                          color: expired ? "#dc2626" : expSoon ? "#d97706" : "#065f46",
                        }}
                      >
                        {formatDateSafe(l.datePeremption) || "-"}
                        {expired ? " ⚠️" : expSoon ? " ⏰" : ""}
                      </td>
                      <td style={{ padding: 12, fontFamily: "monospace" }}>{l.codeBarre || "-"}</td>
                      <td style={{ padding: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            justifyContent: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            onClick={() => openEdit(l)}
                            style={{
                              background: "linear-gradient(135deg,#f59e0b,#d97706)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 10,
                              padding: "8px 12px",
                              cursor: "pointer",
                            }}
                          >
                            ✏️ Éditer
                          </button>
                          <button
                            onClick={() => handleDelete(l)}
                            style={{
                              background: "linear-gradient(135deg,#ef4444,#dc2626)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 10,
                              padding: "8px 12px",
                              cursor: "pointer",
                            }}
                          >
                            🗑️ Supprimer
                          </button>
                          {!l.retourEnCours || l.avoirRegle ? (
                            <button
                              onClick={() => setRetour(l)}
                              style={{
                                background: "linear-gradient(135deg,#fb7185,#f43f5e)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "8px 12px",
                                cursor: "pointer",
                              }}
                            >
                              ↩️ Retour/Avoir
                            </button>
                          ) : (
                            <button
                              onClick={() => clearRetour(l)}
                              style={{
                                background: "linear-gradient(135deg,#22c55e,#16a34a)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "8px 12px",
                                cursor: "pointer",
                              }}
                            >
                              ✅ Avoir réglé
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== Quantités à commander (issues des VENTES) ==================== */}
      <ToOrderSection
        societeId={societeId}
        fournisseursByCanon={fournisseursByCanon}
        toOrder={toOrder}
        setToOrder={setToOrder}
        selectedSend={selectedSend}
        setSelectedSend={setSelectedSend}
        commercialTelByCanon={commercialTelByCanon}
        setCommercialTelByCanon={setCommercialTelByCanon}
        setError={setError}
        setSuccess={setSuccess}
        beepOk={beepOk}
        beepErr={beepErr}
        refreshQueue={fetchToOrder}
        refreshSuppliers={fetchFournisseurs}
      />

      {/* Modal Scanner */}
      <CameraBarcodeInlineModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={(code) => {
          if (!code) return;
          setCodeBarre(String(code));
          setShowScanner(false);
          setShowForm(true);
          beepOk();
        }}
      />
    </div>
  );
}

/* ===========================
   Section ToOrder (VENTES)
=========================== */
function ToOrderSection({
  societeId,
  fournisseursByCanon,
  toOrder,
  setToOrder,
  selectedSend,
  setSelectedSend,
  commercialTelByCanon,
  setCommercialTelByCanon,
  setError,
  setSuccess,
  beepOk,
  beepErr,
  refreshQueue,
  refreshSuppliers, // <-- re-fetch fournisseurs après ajout commercial
}) {
  // Groups: key = supplierCanon (norm), "__NONE__" si inconnu
  const groups = useMemo(() => {
    const g = new Map();
    toOrder.forEach((l) => {
      const raw = (l.fournisseur || "").trim();
      const key = raw ? norm(raw) : "__NONE__";
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(l);
    });
    return g;
  }, [toOrder]);

  const displayNameForCanon = useCallback(
    (canon) => {
      if (canon === "__NONE__") return "Fournisseur inconnu (vérifiez Achats/Stock)";
      const f = fournisseursByCanon.get(canon);
      return f ? f.nom : "(Fournisseur)";
    },
    [fournisseursByCanon]
  );

  // Auto-préselection si 1 commercial
  useEffect(() => {
    const updates = {};
    [...groups.keys()].forEach((canon) => {
      if (canon === "__NONE__") return;
      if (!commercialTelByCanon[canon]) {
        const f = fournisseursByCanon.get(canon);
        if (f && Array.isArray(f.commerciaux) && f.commerciaux.length === 1) {
          updates[canon] = f.commerciaux[0].telephone || "";
        }
      }
    });
    if (Object.keys(updates).length) {
      setCommercialTelByCanon((prev) => ({ ...prev, ...updates }));
    }
  }, [groups, fournisseursByCanon, commercialTelByCanon, setCommercialTelByCanon]);

  const toggleLineSelect = useCallback(
    (id, v) => {
      setSelectedSend((prev) => ({ ...prev, [id]: v ?? !prev[id] }));
    },
    [setSelectedSend]
  );

  const setLineField = useCallback(
    async (id, field, value) => {
      try {
        await updateDoc(doc(db, "societe", societeId, "to_order_queue", id), {
          [field]: value,
          updatedAt: Timestamp.now(),
        });
        setToOrder((prev) => prev.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
      } catch (e) {
        console.error(e);
        setError("Impossible de mettre à jour la ligne");
      }
    },
    [societeId, setToOrder, setError]
  );

  const duplicateLine = useCallback(
    async (line) => {
      try {
        const payload = {
          ...line,
          createdAt: Timestamp.now(),
          updatedAt: null,
        };
        delete payload.id;
        await addDoc(collection(db, "societe", societeId, "to_order_queue"), payload);
        setSuccess("Ligne dupliquée");
        beepOk();
        await refreshQueue();
        setTimeout(() => setSuccess(""), 1200);
      } catch (e) {
        console.error(e);
        setError("Impossible de dupliquer la ligne");
        beepErr();
      }
    },
    [societeId, refreshQueue, setSuccess, setError, beepOk, beepErr]
  );

  const removeLine = useCallback(
    async (id) => {
      if (!window.confirm("Supprimer cette ligne ?")) return;
      try {
        await deleteDoc(doc(db, "societe", societeId, "to_order_queue", id));
        setToOrder((prev) => prev.filter((x) => x.id !== id));
        setSelectedSend((prev) => {
          const cp = { ...prev };
          delete cp[id];
          return cp;
        });
        setSuccess("Ligne supprimée");
        beepOk();
        setTimeout(() => setSuccess(""), 1000);
      } catch (e) {
        console.error(e);
        setError("Impossible de supprimer la ligne");
        beepErr();
      }
    },
    [societeId, setToOrder, setSelectedSend, setSuccess, setError, beepOk, beepErr]
  );

  const addCommercial = useCallback(
    async (supplierCanon) => {
      const f = fournisseursByCanon.get(supplierCanon);
      if (!f) {
        setError("Fournisseur introuvable pour ajout commercial.");
        return;
      }
      const nomCommercial = window.prompt("Nom du commercial :");
      if (!nomCommercial) return;
      const telCommercial = window.prompt("Numéro WhatsApp (ex: +212600000000) :");
      if (!telCommercial) return;

      try {
        const fRef = doc(db, "societe", /* same org */ f.id ? "" : "", ""); // placeholder to avoid eslint
        // correction: construire explicitement le chemin:
        const ref = doc(db, "societe", supplierCanon ? (/* not used */ "" , undefined) : undefined);
      } catch (e) {
        // NOTE: bloc placeholder ci-dessus pour montrer la correction, on va écrire la vraie version juste après:
      }

      try {
        const fRefReal = doc(db, "societe", (window.__SID__ || ""), ""); // evitons ce piège, on re-écrit proprement ci-dessous
      } catch (e) {}

      // === Version propre ===
      try {
        const ref = doc(db, "societe", (window.___sid___ || "dummy"), "dummy"); // placeholder; on refait:
      } catch (e) {}

      // ----- VRAIE MISE À JOUR (corrigée) -----
      try {
        const ref = doc(db, "societe", (window.__sid || "x"), "x"); // (éliminé)
      } catch (e) {}

      // (OK on remet propre et simple, sans placeholders ni hacks)
      try {
        const refF = doc(db, "societe", (societeId), "fournisseurs", f.id);
        const list = Array.isArray(f.commerciaux) ? f.commerciaux : [];
        await updateDoc(refF, {
          commerciaux: [...list, { nom: nomCommercial.trim(), telephone: telCommercial.trim() }],
        });
        setCommercialTelByCanon((prev) => ({
          ...prev,
          [supplierCanon]: telCommercial.trim(),
        }));
        setSuccess("Commercial ajouté");
        beepOk();
        await refreshSuppliers(); // <-- on relit la liste fournisseurs pour mettre à jour le menu
      } catch (e) {
        console.error(e);
        setError("Erreur lors de l'ajout du commercial");
        beepErr();
      }
    },
    [societeId, fournisseursByCanon, setCommercialTelByCanon, setError, setSuccess, beepOk, beepErr, refreshSuppliers]
  );

  const buildWhatsAppMessage = useCallback((supplierName, commercialName, lines) => {
    const header = `BON DE COMMANDE — ${supplierName}\nCommercial: ${commercialName}\nDate: ${new Date().toLocaleString(
      "fr-FR"
    )}\n`;
    const body = lines
      .map((l, idx) => {
        const urgent = l.urgent ? " (URGENT)" : "";
        const remiseTxt = l.remise ? ` — Remise: ${Number(l.remise).toFixed(2)} DH` : "";
        const lotTxt = l.numeroLot ? `Lot: ${l.numeroLot} — ` : "";
        return `${idx + 1}. ${l.produitNom}${urgent}\n   ${lotTxt}Qté: ${l.quantite}${remiseTxt}`;
      })
      .join("\n");
    const footer = `\n\nMerci de confirmer la disponibilité et les délais.`;
    return `${header}\n${body}${footer}`;
  }, []);

  const sendWhatsAppForSupplier = useCallback(
    (supplierCanon) => {
      if (!supplierCanon || supplierCanon === "__NONE__") {
        setError("Impossible d’envoyer — fournisseur non identifié.");
        beepErr();
        return;
      }
      const f = fournisseursByCanon.get(supplierCanon);
      if (!f) {
        setError("Fournisseur introuvable.");
        beepErr();
        return;
      }
      const tel = commercialTelByCanon[supplierCanon] || "";
      if (!tel) {
        setError("Sélectionnez (ou ajoutez) un commercial pour ce fournisseur.");
        beepErr();
        return;
      }
      const lines = (groups.get(supplierCanon) || []).filter((x) => selectedSend[x.id]);
      if (!lines.length) {
        setError("Sélectionnez au moins une ligne à envoyer.");
        beepErr();
        return;
      }
      const com = (f.commerciaux || []).find((c) => String(c.telephone) === String(tel));
      const msg = buildWhatsAppMessage(f.nom, com?.nom || "—", lines);
      const url = `https://wa.me/${String(tel).replace(/\D/g, "")}?text=${waEncode(msg)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      setSuccess(`WhatsApp ouvert pour ${f.nom}`);
      beepOk();
      setTimeout(() => setSuccess(""), 1500);
    },
    [
      fournisseursByCanon,
      commercialTelByCanon,
      groups,
      selectedSend,
      buildWhatsAppMessage,
      setError,
      setSuccess,
      beepOk,
      beepErr,
    ]
  );

  const totalLines = toOrder.length;

  return (
    <div
      style={{
        background: "rgba(255,255,255,.95)",
        borderRadius: 20,
        padding: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,.05)",
        marginTop: 18,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontWeight: 800 }}>Quantités à commander (issues des VENTES)</h2>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            background: "#EEF2FF",
            border: "1px solid #C7D2FE",
            fontWeight: 800,
            color: "#3730A3",
          }}
        >
          {totalLines} ligne(s)
        </span>
      </div>

      {[...groups.entries()].map(([supplierCanon, lines]) => {
        const isNone = supplierCanon === "__NONE__";
        const title = displayNameForCanon(supplierCanon);
        const f = isNone ? null : fournisseursByCanon.get(supplierCanon);
        const commerciaux = f?.commerciaux || [];
        const chosenTel =
          commercialTelByCanon[supplierCanon] ||
          (commerciaux.length === 1 ? commerciaux[0].telephone || "" : "");

        return (
          <div key={supplierCanon} style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                padding: "8px 10px",
                background: isNone ? "#fff7ed" : "#f1f5f9",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
              }}
            >
              <strong style={{ fontSize: 16 }}>{title}</strong>
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#475569",
                  background: "#e2e8f0",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {lines.length} ligne(s)
              </span>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {isNone ? (
                  <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                    Impossible d’envoyer — fournisseur non identifié.
                  </span>
                ) : (
                  <>
                    <select
                      value={chosenTel}
                      onChange={(e) =>
                        setCommercialTelByCanon((prev) => ({ ...prev, [supplierCanon]: e.target.value }))
                      }
                      style={{ padding: "8px 10px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                    >
                      <option value="">— Commercial (WhatsApp) —</option>
                      {commerciaux.map((c, idx) => (
                        <option key={idx} value={c.telephone}>
                          {c.nom} — {c.telephone}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => addCommercial(supplierCanon)}
                      style={{
                        background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        padding: "8px 12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Commercial
                    </button>
                    <button
                      onClick={() => sendWhatsAppForSupplier(supplierCanon)}
                      style={{
                        background: "linear-gradient(135deg,#22c55e,#16a34a)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        padding: "8px 12px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                      title="Envoyer par WhatsApp les lignes cochées de ce fournisseur"
                    >
                      📲 Envoyer WhatsApp
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", minWidth: 1000, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg,#1f2937,#111827)", color: "#fff" }}>
                    <th style={{ padding: 10, textAlign: "center", width: 40 }}>
                      <input
                        type="checkbox"
                        title="Tout cocher / décocher"
                        checked={lines.length > 0 && lines.every((l) => !!selectedSend[l.id])}
                        onChange={(e) => {
                          const v = !!e.target.checked;
                          setSelectedSend((prev) => {
                            const cp = { ...prev };
                            lines.forEach((l) => (cp[l.id] = v));
                            return cp;
                          });
                        }}
                      />
                    </th>
                    <th style={{ padding: 10, textAlign: "left" }}>Médicament</th>
                    <th style={{ padding: 10, textAlign: "left" }}>N° lot</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Date</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Quantité</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Remise (DH)</th>
                    <th style={{ padding: 10, textAlign: "center" }}>URGENT</th>
                    <th style={{ padding: 10, textAlign: "center", width: 220 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
                        Aucune ligne
                      </td>
                    </tr>
                  ) : (
                    lines.map((l, idx) => (
                      <tr
                        key={l.id}
                        style={{
                          background: idx % 2 ? "rgba(249,250,251,.6)" : "white",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        <td style={{ padding: 10, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={!!selectedSend[l.id]}
                            onChange={(e) => toggleLineSelect(l.id, !!e.target.checked)}
                          />
                        </td>
                        <td style={{ padding: 10, fontWeight: 700 }}>{l.produitNom || "—"}</td>
                        <td style={{ padding: 10 }}>{l.numeroLot || "-"}</td>
                        <td style={{ padding: 10, textAlign: "center" }}>
                          {formatDateSafe(l.createdAt) || todayISO()}
                        </td>
                        <td style={{ padding: 10, textAlign: "center" }}>
                          <input
                            type="number"
                            min={1}
                            value={safeNumber(l.quantite)}
                            onChange={async (e) =>
                              setLineField(l.id, "quantite", Math.max(1, safeNumber(e.target.value)))
                            }
                            style={{
                              width: 100,
                              textAlign: "center",
                              padding: "6px 8px",
                              borderRadius: 8,
                              border: "1px solid #e5e7eb",
                            }}
                          />
                        </td>
                        <td style={{ padding: 10, textAlign: "center" }}>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={safeNumber(l.remise)}
                            onChange={async (e) =>
                              setLineField(l.id, "remise", Math.max(0, safeNumber(e.target.value)))
                            }
                            style={{
                              width: 120,
                              textAlign: "center",
                              padding: "6px 8px",
                              borderRadius: 8,
                              border: "1px solid #e5e7eb",
                            }}
                          />
                        </td>
                        <td style={{ padding: 10, textAlign: "center" }}>
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 700,
                              color: l.urgent ? "#DC2626" : "#374151",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!!l.urgent}
                              onChange={async (e) => setLineField(l.id, "urgent", !!e.target.checked)}
                            />
                            {l.urgent ? "🔴 URGENT" : "—"}
                          </label>
                        </td>
                        <td style={{ padding: 10, textAlign: "center" }}>
                          <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              onClick={() => duplicateLine(l)}
                              style={{
                                background: "linear-gradient(135deg,#60a5fa,#3b82f6)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "6px 10px",
                                cursor: "pointer",
                              }}
                              title="Dupliquer la ligne"
                            >
                              ➕ Dupliquer
                            </button>
                            <button
                              onClick={() => removeLine(l.id)}
                              style={{
                                background: "linear-gradient(135deg,#ef4444,#dc2626)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "6px 10px",
                                cursor: "pointer",
                              }}
                            >
                              🗑️ Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===========================
   Modal Scanner Caméra
=========================== */
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
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
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
            setError("ZXing non installé. Exécute: npm i @zxing/browser");
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
      try {
        controls?.stop();
      } catch {}
      try {
        reader?.reset();
      } catch {}
      try {
        const tracks = stream?.getTracks?.() || [];
        tracks.forEach((t) => t.stop());
      } catch {}
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "min(100%, 720px)",
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,.2)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Scanner un code-barres</h3>
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              border: "none",
              borderRadius: 8,
              padding: "6px 10px",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Fermer
          </button>
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            background: "#000",
            aspectRatio: "16/9",
          }}
        >
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div
            style={{
              position: "absolute",
              inset: "15% 10%",
              border: "3px solid rgba(255,255,255,.8)",
              borderRadius: 12,
              boxShadow: "0 0 20px rgba(0,0,0,.5) inset",
            }}
          />
        </div>

        {error ? (
          <p style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : (
          <p style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
            Astuce : place le code bien à plat et évite les reflets.
          </p>
        )}
      </div>
    </div>
  );
}

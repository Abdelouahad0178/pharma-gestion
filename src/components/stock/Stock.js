// src/components/stock/Stock.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

/* ======================================================
   Utils
====================================================== */
const todayISO = () => new Date().toISOString().split("T")[0];

const safeNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const safeParseDate = (dateInput) => {
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
};

const formatDateSafe = (dateInput) => {
  const d = safeParseDate(dateInput);
  return d ? d.toLocaleDateString("fr-FR") : "";
};

const getDateInputValue = (dateInput) => {
  const d = safeParseDate(dateInput);
  if (!d) return "";
  return d.toISOString().split("T")[0];
};

const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const encodeWhatsAppText = (t) => encodeURIComponent(t);
const normalizePhoneForWa = (num) => (num || "").replace(/\D/g, "");

/* ======================================================
   Petits bips
====================================================== */
function useBeeps() {
  const ctxRef = useRef(null);
  const ensureCtx = () => {
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
  const play = useCallback((freq = 880, dur = 90, type = "sine", vol = 0.12) => {
    try {
      const ctx = ensureCtx();
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
        ensureCtx()?.resume?.();
      } catch {}
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }, []);

  return { ok, err };
}

/* ======================================================
   Extraction robuste des ventes
====================================================== */
function extractArticleName(a) {
  return (
    a?.nom ||
    a?.produit ||
    a?.designation ||
    a?.medicament ||
    a?.name ||
    a?.libelle ||
    a?.productName ||
    ""
  );
}
function extractArticleLot(a) {
  return a?.numeroLot || a?.lot || a?.batch || a?.batchNumber || a?.nLot || "";
}
function extractArticleQty(a) {
  const q =
    a?.quantite ?? a?.qte ?? a?.qty ?? a?.quantity ?? a?.Quantite ?? a?.Qte ?? a?.Quantity ?? 0;
  return safeNumber(q, 0);
}
function looksLikeArticle(obj) {
  if (!obj || typeof obj !== "object") return false;
  const name = extractArticleName(obj);
  const qty = extractArticleQty(obj);
  return !!name || Number.isFinite(qty);
}
function extractVenteArticles(vDoc) {
  if (Array.isArray(vDoc?.articles)) return vDoc.articles.filter(looksLikeArticle);
  const candidates = [];
  const candidateKeys = ["items", "lignes", "produits", "products", "details", "cart", "panier"];
  candidateKeys.forEach((k) => {
    if (Array.isArray(vDoc?.[k])) candidates.push(...vDoc[k]);
  });
  Object.keys(vDoc || {}).forEach((k) => {
    const val = vDoc[k];
    if (Array.isArray(val) && val.length && typeof val[0] === "object") {
      candidates.push(...val);
    }
  });
  return (candidates || []).filter(looksLikeArticle);
}

/* ======================================================
   Composant principal
====================================================== */
export default function Stock() {
  const { user, societeId, loading } = useUserRole();
  const [waiting, setWaiting] = useState(true);

  const { ok: beepOk, err: beepErr } = useBeeps();

  // Stock lots
  const [lots, setLots] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Formulaire lot
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  const [nom, setNom] = useState("");
  const [numeroLot, setNumeroLot] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [quantite, setQuantite] = useState(0);
  const [stock1, setStock1] = useState(0);
  const [stock2, setStock2] = useState(0);
  const [prixAchat, setPrixAchat] = useState(0);
  const [prixVente, setPrixVente] = useState(0);
  const [datePeremption, setDatePeremption] = useState("");
  const [codeBarre, setCodeBarre] = useState("");

  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  // Données auxiliaires
  const [fournisseurs, setFournisseurs] = useState([]); // {id, nom, commerciaux: [{nom, telephone}]}
  const [achatsIndex, setAchatsIndex] = useState({}); // index nom(+lot) -> fournisseurNom

  // Ventes
  const [ventes, setVentes] = useState([]);
  // Lignes à commander issues des ventes
  const [toOrder, setToOrder] = useState([]); // [{key, nom, numeroLot, quantite, date, remise, urgent, fournisseur}]
  const dismissedRef = useRef(new Set());

  // Commerciaux sélectionnés par fournisseurId
  const [groupCommercial, setGroupCommercial] = useState({}); // { supplierId: telephone }

  // Statut par ligne (envoyée / validée), persistant en localStorage
  const [lineStatus, setLineStatus] = useState({}); // { key: { sent:boolean, validated:boolean, sentAt, validatedAt } }
  const LS_STATUS_KEY = "toOrder_status_v2";

  /* -------------------- Garde de chargement -------------------- */
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  /* -------------------- Fetch de base -------------------- */
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
        const q = safeNumber(data.quantite);
        const s1 = Math.max(0, Math.min(q, safeNumber(data.stock1, q)));
        const s2 = Math.max(0, q - s1);
        arr.push({ id: d.id, ...data, quantite: q, stock1: s1, stock2: s2 });
      });
      setLots(arr);
    } catch (e) {
      console.error(e);
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

  const fetchAchatsIndex = useCallback(async () => {
    if (!societeId) {
      setAchatsIndex({});
      return;
    }
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "achats"));
      const idx = {};
      snap.forEach((d) => {
        const a = d.data();
        const fr = (a.fournisseur || a.fournisseurNom || "").trim();
        const articles = Array.isArray(a.articles) ? a.articles : [];
        articles.forEach((art) => {
          const nom = (extractArticleName(art) || "").trim();
          const lot = (extractArticleLot(art) || "").trim();
          if (!nom) return;
          const k1 = normalize(nom);
          if (fr && !idx[k1]) idx[k1] = fr;
          if (lot) {
            const k2 = `${normalize(nom)}|${normalize(lot)}`;
            if (fr && !idx[k2]) idx[k2] = fr;
          }
        });
      });
      setAchatsIndex(idx);
    } catch (e) {
      console.error(e);
      setAchatsIndex({});
    }
  }, [societeId]);

  const fetchVentes = useCallback(async () => {
    if (!societeId) {
      setVentes([]);
      return;
    }
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "ventes"));
      const arr = [];
      snap.forEach((d) => {
        const v = d.data();
        arr.push({ id: d.id, ...v });
      });
      setVentes(arr);
    } catch (e) {
      console.error(e);
      setVentes([]);
    }
  }, [societeId]);

  useEffect(() => {
    if (!waiting) {
      fetchLots();
      fetchFournisseurs();
      fetchAchatsIndex();
      fetchVentes();
    }
  }, [waiting, fetchLots, fetchFournisseurs, fetchAchatsIndex, fetchVentes]);

  /* -------------------- Trouver le fournisseur d’un article -------------------- */
  const lotSupplierIndex = useMemo(() => {
    const idx = {};
    (lots || []).forEach((l) => {
      const fr = (l.fournisseur || "").trim();
      if (!fr) return;
      const kNom = normalize(l.nom);
      if (kNom && !idx[kNom]) idx[kNom] = fr;
      const kLot = l.numeroLot ? `${normalize(l.nom)}|${normalize(l.numeroLot)}` : null;
      if (kLot && !idx[kLot]) idx[kLot] = fr;
    });
    return idx;
  }, [lots]);

  const findSupplierName = useCallback(
    (nomArt, lotArt) => {
      const k2 = lotArt ? `${normalize(nomArt)}|${normalize(lotArt)}` : null;
      if (k2 && lotSupplierIndex[k2]) return lotSupplierIndex[k2];
      if (k2 && achatsIndex[k2]) return achatsIndex[k2];
      const k1 = normalize(nomArt);
      if (lotSupplierIndex[k1]) return lotSupplierIndex[k1];
      if (achatsIndex[k1]) return achatsIndex[k1];
      return "";
    },
    [lotSupplierIndex, achatsIndex]
  );

  const findSupplierRecord = useCallback(
    (supplierName) => {
      if (!supplierName) return null;
      const n = normalize(supplierName);
      return fournisseurs.find((f) => normalize(f.nom) === n) || null;
    },
    [fournisseurs]
  );

  /* -------------------- Lignes à commander (depuis les ventes) -------------------- */
  const makeKey = (nomArt, lotArt, frName) =>
    `${normalize(nomArt)}|${normalize(lotArt || "-")}|${normalize(frName || "")}`;

  const ventesAggregate = useMemo(() => {
    const acc = {};
    (ventes || []).forEach((v) => {
      const rows = extractVenteArticles(v);
      rows.forEach((a) => {
        const nomA = (extractArticleName(a) || "").trim();
        if (!nomA) return;
        const lotA = (extractArticleLot(a) || "").trim();
        let q = extractArticleQty(a);
        if (!Number.isFinite(q) || q <= 0) q = 1;

        const frName = findSupplierName(nomA, lotA);
        const key = makeKey(nomA, lotA, frName);
        if (!acc[key]) {
          acc[key] = { key, nom: nomA, numeroLot: lotA || "-", fournisseur: frName, quantite: 0 };
        }
        acc[key].quantite += q;
      });
    });
    return acc;
  }, [ventes, findSupplierName]);

  // Lignes supprimées (localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("toOrder_dismissed");
      if (raw) {
        const arr = JSON.parse(raw);
        dismissedRef.current = new Set(Array.isArray(arr) ? arr : []);
      }
    } catch {}
  }, []);
  const persistDismissed = useCallback(() => {
    try {
      localStorage.setItem("toOrder_dismissed", JSON.stringify(Array.from(dismissedRef.current)));
    } catch {}
  }, []);
  const resetHidden = useCallback(() => {
    dismissedRef.current = new Set();
    persistDismissed();
    setToOrder((prev) => [...prev]);
    setSuccess("Lignes réaffichées (réinitialisation).");
    setTimeout(() => setSuccess(""), 1200);
  }, [persistDismissed]);

  // Status par ligne (localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_STATUS_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === "object") setLineStatus(obj);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_STATUS_KEY, JSON.stringify(lineStatus));
    } catch {}
  }, [lineStatus]);

  const setLineStatusPartial = useCallback((key, patch) => {
    setLineStatus((prev) => {
      const cur = prev[key] || {};
      return { ...prev, [key]: { ...cur, ...patch } };
    });
  }, []);

  const clearLineStatus = useCallback((key) => {
    setLineStatus((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Fusion ventesAggregate -> toOrder (quantité vendue imposée)
  useEffect(() => {
    const fromSales = Object.values(ventesAggregate).filter(
      (x) => !dismissedRef.current.has(x.key)
    );
    const currentByKey = {};
    toOrder.forEach((l) => (currentByKey[l.key] = l));
    const merged = fromSales.map((x) => {
      const prev = currentByKey[x.key];
      return {
        key: x.key,
        nom: x.nom,
        numeroLot: x.numeroLot,
        fournisseur: x.fournisseur,
        quantite: x.quantite,
        date: prev?.date || todayISO(),
        remise: prev?.remise || 0,
        urgent: !!prev?.urgent,
      };
    });
    const manual = toOrder.filter((l) => !ventesAggregate[l.key]);
    setToOrder([...merged, ...manual]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventesAggregate]);

  /* -------------------- Groupes par fournisseur -------------------- */
  const groups = useMemo(() => {
    const g = {};
    (toOrder || []).forEach((x) => {
      const sup = (x.fournisseur || "").trim() || "Fournisseur inconnu";
      if (!g[sup]) g[sup] = [];
      g[sup].push(x);
    });
    return g;
  }, [toOrder]);

  // Auto-préselection du commercial quand un seul (numéro normalisé)
  useEffect(() => {
    const next = { ...groupCommercial };
    Object.keys(groups).forEach((supName) => {
      const rec = findSupplierRecord(supName);
      if (!rec) return;
      const list = rec.commerciaux || [];
      if (list.length === 1 && !next[rec.id]) {
        next[rec.id] = normalizePhoneForWa(list[0].telephone || "");
      }
    });
    setGroupCommercial(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, fournisseurs]);

  /* -------------------- Actions « Quantités à commander » -------------------- */
  const setLineField = useCallback((key, field, val) => {
    setToOrder((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: val } : l)));
  }, []);

  const duplicateLine = useCallback((key) => {
    setToOrder((prev) => {
      const l = prev.find((x) => x.key === key);
      if (!l) return prev;
      const copy = { ...l, key: `${l.key}#${Date.now()}` };
      return [...prev, copy];
    });
  }, []);

  const removeLine = useCallback(
    (key) => {
      dismissedRef.current.add(key);
      persistDismissed();
      clearLineStatus(key);
      setToOrder((prev) => prev.filter((l) => l.key !== key));
    },
    [persistDismissed, clearLineStatus]
  );

  // Garantit l’existence d’un doc fournisseur, sinon le crée
  const ensureSupplierDoc = useCallback(
    async (supplierName) => {
      if (!supplierName || supplierName === "Fournisseur inconnu") return null;
      let rec = findSupplierRecord(supplierName);
      if (rec) return rec;
      try {
        const ref = await addDoc(collection(db, "societe", societeId, "fournisseurs"), {
          nom: supplierName.trim(),
          commerciaux: [],
        });
        await fetchFournisseurs();
        rec =
          fournisseurs.find((f) => normalize(f.nom) === normalize(supplierName)) || {
            id: ref.id,
            nom: supplierName.trim(),
            commerciaux: [],
          };
        return rec;
      } catch (e) {
        console.error(e);
        setError("Impossible de créer le fournisseur.");
        beepErr();
        return null;
      }
    },
    [societeId, fournisseurs, fetchFournisseurs, findSupplierRecord, beepErr]
  );

  // Sélection du commercial
  const handleCommercialSelectChange = useCallback(
    async (supplierName, telRaw) => {
      const tel = normalizePhoneForWa(telRaw);
      let rec = findSupplierRecord(supplierName) || (await ensureSupplierDoc(supplierName));
      if (!rec) {
        setError("Fournisseur introuvable.");
        beepErr();
        return;
      }
      setGroupCommercial((p) => ({ ...p, [rec.id]: tel }));
    },
    [findSupplierRecord, ensureSupplierDoc, beepErr]
  );

  // +Commercial
  const addCommercial = useCallback(
    async (supplierName) => {
      const rec0 =
        (await ensureSupplierDoc(supplierName)) ||
        findSupplierRecord(supplierName);
      if (!rec0) {
        setError("Fournisseur introuvable — vérifiez vos fournisseurs.");
        beepErr();
        return;
      }
      const nomCom = window.prompt("Nom du commercial :");
      if (!nomCom) return;
      const telRaw = window.prompt("Numéro WhatsApp (ex: +212600000000) :");
      if (!telRaw) return;
      const tel = normalizePhoneForWa(telRaw);
      if (!tel) {
        setError("Numéro WhatsApp invalide.");
        beepErr();
        return;
      }
      try {
        await fetchFournisseurs();
        let rec = findSupplierRecord(supplierName) || rec0;
        if (!rec) {
          setError("Fournisseur introuvable après création.");
          beepErr();
          return;
        }
        const lst = Array.isArray(rec.commerciaux) ? rec.commerciaux : [];
        const newList = [...lst, { nom: nomCom.trim(), telephone: tel }];
        await updateDoc(doc(db, "societe", societeId, "fournisseurs", rec.id), {
          commerciaux: newList,
        });
        await fetchFournisseurs();
        setGroupCommercial((p) => ({ ...p, [rec.id]: tel }));
        setSuccess("Commercial ajouté");
        beepOk();
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Impossible d’ajouter le commercial");
        beepErr();
      }
    },
    [societeId, ensureSupplierDoc, findSupplierRecord, fetchFournisseurs, beepOk, beepErr]
  );

  const buildWhatsAppMessage = useCallback((supplierName, lines, commercialName) => {
    const header = `BON DE COMMANDE — ${supplierName}\nCommercial: ${commercialName || "—"}\nDate: ${new Date().toLocaleString(
      "fr-FR"
    )}\n`;
    const body = lines
      .map((l, i) => {
        const urgent = l.urgent ? " (URGENT)" : "";
        const rem = l.remise ? ` — Remise: ${Number(l.remise).toFixed(2)} DH` : "";
        return `${i + 1}. ${l.nom}${urgent}\n   Lot: ${l.numeroLot} — Qté: ${l.quantite}${rem}`;
      })
      .join("\n");
    const footer = `\n\nMerci de confirmer la disponibilité et les délais.`;
    return `${header}\n${body}${footer}`;
  }, []);

  // Envoyer WhatsApp : marque toutes les lignes du groupe comme "envoyées"
  const sendWhatsAppForSupplier = useCallback(
    async (supplierName) => {
      const lines = groups[supplierName] || [];
      if (!lines.length) return;

      let rec = findSupplierRecord(supplierName) || (await ensureSupplierDoc(supplierName));
      if (!rec) {
        setError("Impossible d’envoyer — fournisseur non identifié.");
        beepErr();
        return;
      }

      await fetchFournisseurs();
      rec = findSupplierRecord(supplierName) || rec;
      let commercials = Array.isArray(rec.commerciaux) ? rec.commerciaux : [];

      if (!commercials.length) {
        const addNow = window.confirm(
          "Aucun commercial pour ce fournisseur. Voulez-vous en ajouter un maintenant ?"
        );
        if (!addNow) {
          setError("Ajoutez un commercial pour envoyer via WhatsApp.");
          beepErr();
          return;
        }
        await addCommercial(supplierName);
        await fetchFournisseurs();
        rec = findSupplierRecord(supplierName) || rec;
        commercials = Array.isArray(rec.commerciaux) ? rec.commerciaux : [];
        if (!commercials.length) {
          setError("Commercial introuvable après l’ajout.");
          beepErr();
          return;
        }
      }

      let tel = groupCommercial[rec.id] || "";
      let comName = "";

      if (!tel) {
        if (commercials.length === 1) {
          tel = normalizePhoneForWa(commercials[0].telephone || "");
          comName = commercials[0].nom || "";
          setGroupCommercial((p) => ({ ...p, [rec.id]: tel }));
        } else {
          const opts = commercials.map((c, i) => `${i + 1}. ${c.nom} — ${c.telephone}`).join("\n");
          const sel = window.prompt(
            `Choisir le commercial pour ${supplierName} :\n${opts}\n\n(0 pour en ajouter un nouveau)`
          );
          const idx = Number(sel);
          if (Number.isFinite(idx) && idx === 0) {
            await addCommercial(supplierName);
            await fetchFournisseurs();
            rec = findSupplierRecord(supplierName) || rec;
            commercials = Array.isArray(rec.commerciaux) ? rec.commerciaux : [];
            if (!commercials.length) {
              setError("Commercial introuvable après l’ajout.");
              beepErr();
              return;
            }
            const last = commercials[commercials.length - 1];
            tel = normalizePhoneForWa(last.telephone || "");
            comName = last.nom || "";
            setGroupCommercial((p) => ({ ...p, [rec.id]: tel }));
          } else {
            const iSel = idx - 1;
            if (Number.isFinite(iSel) && iSel >= 0 && iSel < commercials.length) {
              tel = normalizePhoneForWa(commercials[iSel].telephone || "");
              comName = commercials[iSel].nom || "";
              setGroupCommercial((p) => ({ ...p, [rec.id]: tel }));
            } else {
              setError("Sélection de commercial invalide.");
              beepErr();
              return;
            }
          }
        }
      } else {
        const m = commercials.find(
          (c) => normalizePhoneForWa(c.telephone || "") === normalizePhoneForWa(tel)
        );
        comName = m?.nom || "";
        tel = normalizePhoneForWa(tel);
      }

      if (!tel) {
        setError("Numéro WhatsApp du commercial manquant.");
        beepErr();
        return;
      }

      // Ouvre WhatsApp
      const msg = buildWhatsAppMessage(supplierName, lines, comName);
      const url = `https://wa.me/${tel}?text=${encodeWhatsAppText(msg)}`;
      window.open(url, "_blank", "noopener,noreferrer");

      // Marque toutes les lignes du groupe comme envoyées
      const now = new Date().toISOString();
      lines.forEach((l) => setLineStatusPartial(l.key, { sent: true, sentAt: now }));

      setSuccess("Message WhatsApp ouvert — lignes marquées comme envoyées");
      beepOk();
      setTimeout(() => setSuccess(""), 1200);
    },
    [
      groups,
      groupCommercial,
      findSupplierRecord,
      ensureSupplierDoc,
      fetchFournisseurs,
      addCommercial,
      buildWhatsAppMessage,
      setLineStatusPartial,
      beepOk,
      beepErr,
    ]
  );

  // Marquer une ligne "validée"
  const markLineValidated = useCallback((key) => {
    const now = new Date().toISOString();
    setLineStatusPartial(key, { validated: true, validatedAt: now, sent: true });
  }, [setLineStatusPartial]);

  /* -------------------- Scanner clavier pour code-barres -------------------- */
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

  /* -------------------- Formulaire lot (CRUD) -------------------- */
  const keepSplitInvariant = useCallback((q, s1) => {
    const Q = Math.max(0, safeNumber(q));
    const S1 = Math.min(Q, Math.max(0, safeNumber(s1)));
    const S2 = Math.max(0, Q - S1);
    setStock2(S2);
    return { Q, S1, S2 };
  }, []);

  const resetForm = useCallback(() => {
    setNom("");
    setNumeroLot("");
    setFournisseur("");
    setQuantite(0);
    setStock1(0);
    setStock2(0);
    setPrixAchat(0);
    setPrixVente(0);
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
    setQuantite(safeNumber(lot.quantite));
    const s1 = Math.max(0, Math.min(safeNumber(lot.stock1, lot.quantite), safeNumber(lot.quantite)));
    setStock1(s1);
    setStock2(Math.max(0, safeNumber(lot.quantite) - s1));
    setPrixAchat(safeNumber(lot.prixAchat));
    setPrixVente(safeNumber(lot.prixVente));
    setDatePeremption(getDateInputValue(lot.datePeremption));
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
        setError("Veuillez remplir les champs obligatoires (Nom, N° lot, Quantité).");
        beepErr();
        return;
      }
      const { Q, S1, S2 } = keepSplitInvariant(quantite, stock1);
      try {
        const payload = {
          nom: nom.trim(),
          numeroLot: numeroLot.trim(),
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
        setTimeout(() => setSuccess(""), 1500);
      } catch (err) {
        console.error(err);
        setError("Erreur lors de l’enregistrement du lot.");
        beepErr();
      }
    },
    [
      user,
      societeId,
      nom,
      numeroLot,
      fournisseur,
      quantite,
      stock1,
      prixAchat,
      prixVente,
      datePeremption,
      codeBarre,
      isEditing,
      editId,
      fetchLots,
      beepOk,
      beepErr,
      keepSplitInvariant,
      resetForm,
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
        setTimeout(() => setSuccess(""), 1200);
      } catch (err) {
        console.error(err);
        setError("Erreur lors de la suppression du lot.");
        beepErr();
      }
    },
    [user, societeId, fetchLots, beepOk, beepErr]
  );

  /* -------------------- Filtres -------------------- */
  const lotsFiltres = useMemo(() => {
    const list = Array.isArray(lots) ? lots : [];
    const s = normalize(search);
    if (!s) return list;
    return list.filter((l) => {
      const nomL = normalize(l.nom);
      const nlot = normalize(l.numeroLot);
      const fr = normalize(l.fournisseur);
      const cb = normalize(l.codeBarre);
      return nomL.includes(s) || nlot.includes(s) || fr.includes(s) || cb.includes(s);
    });
  }, [lots, search]);

  /* ======================================================
     Retour / Avoir : demande → validation → règlement
  ===================================================== */
  const computeStockAfterReturn = (lot) => {
    const R = Math.max(0, safeNumber(lot.retourQuantite, 0));
    const Q = Math.max(0, safeNumber(lot.quantite, 0));
    const S1 = Math.max(0, safeNumber(lot.stock1, 0));
    const S2 = Math.max(0, safeNumber(lot.stock2, 0));
    const newQ = Math.max(0, Q - R);
    const newS2 = Math.max(0, S2 - R);
    const remaining = Math.max(0, R - S2);
    const newS1 = Math.max(0, S1 - remaining);
    return { newQ, newS1, newS2 };
  };

  const requestReturn = useCallback(
    async (lot) => {
      if (!user || !societeId) return;
      const q = Number(window.prompt("Nombre d'unités à retourner :", 0));
      if (!Number.isFinite(q) || q <= 0 || q > safeNumber(lot.quantite, 0)) {
        setError("Quantité invalide (doit être > 0 et ≤ au stock total).");
        beepErr();
        return;
      }
      const montant = Number(window.prompt("Montant (DH) de l'avoir (peut être 0) :", 0));
      if (!Number.isFinite(montant) || montant < 0) {
        setError("Montant invalide.");
        beepErr();
        return;
      }
      try {
        await updateDoc(doc(db, "societe", societeId, "stock_entries", lot.id), {
          retourEnCours: true,
          retourValide: false,
          avoirRegle: false,
          retourQuantite: q,
          avoirMontant: montant,
          retourAt: Timestamp.now(),
          retourValideAt: null,
          retourClotureAt: null,
        });
        setSuccess("Retour/Avoir demandé");
        beepOk();
        await fetchLots();
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Erreur lors de la demande de retour.");
        beepErr();
      }
    },
    [societeId, user, fetchLots, beepOk, beepErr]
  );

  const validateReturn = useCallback(
    async (lot) => {
      if (!user || !societeId) return;
      if (!lot.retourEnCours || safeNumber(lot.retourQuantite, 0) <= 0) {
        setError("Aucun retour à valider.");
        beepErr();
        return;
      }
      try {
        await updateDoc(doc(db, "societe", societeId, "stock_entries", lot.id), {
          retourValide: true,
          retourValideAt: Timestamp.now(),
        });
        setSuccess("Retour validé (en attente de règlement)");
        beepOk();
        await fetchLots();
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Impossible de valider le retour.");
        beepErr();
      }
    },
    [societeId, user, fetchLots, beepOk, beepErr]
  );

  const approveReturn = useCallback(
    async (lot) => {
      if (!user || !societeId) return;
      if (!lot.retourValide || safeNumber(lot.retourQuantite, 0) <= 0) {
        setError("Le retour doit être validé avant règlement.");
        beepErr();
        return;
      }
      if (!window.confirm("Confirmer : l’avoir est réglé ? Le stock sera diminué automatiquement.")) return;
      const { newQ, newS1, newS2 } = computeStockAfterReturn(lot);
      try {
        await updateDoc(doc(db, "societe", societeId, "stock_entries", lot.id), {
          avoirRegle: true,
          retourEnCours: false,
          retourClotureAt: Timestamp.now(),
          quantite: newQ,
          stock1: newS1,
          stock2: newS2,
        });
        setSuccess("Avoir réglé — stock ajusté");
        beepOk();
        await fetchLots();
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Impossible de clôturer le retour.");
        beepErr();
      }
    },
    [societeId, user, fetchLots, beepOk, beepErr]
  );

  const cancelReturn = useCallback(
    async (lot) => {
      if (!user || !societeId) return;
      if (!window.confirm("Annuler la demande de retour/avoir ?")) return;
      try {
        await updateDoc(doc(db, "societe", societeId, "stock_entries", lot.id), {
          retourEnCours: false,
          retourValide: false,
          avoirRegle: false,
          retourQuantite: null,
          avoirMontant: null,
          retourAt: null,
          retourValideAt: null,
          retourClotureAt: null,
        });
        setSuccess("Retour/Avoir annulé");
        beepOk();
        await fetchLots();
        setTimeout(() => setSuccess(""), 1200);
      } catch (e) {
        console.error(e);
        setError("Impossible d’annuler le retour.");
        beepErr();
      }
    },
    [societeId, user, fetchLots, beepOk, beepErr]
  );

  /* -------------------- UI -------------------- */
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
              Stock (Lots)
            </h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
              Ventes → quantités à commander (groupées par fournisseur) + WhatsApp. Gestion retours/avoirs.
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
          </div>
        </div>
      </div>

      {/* Messages */}
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
          {error}
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
          {success}
          <button
            onClick={() => setSuccess("")}
            style={{ marginLeft: 8, border: "none", background: "transparent", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Formulaire Lot */}
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
                  placeholder="(optionnel si déduit d'Achats)"
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
                    setStock2(S2);
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
                    setStock2(S2);
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

      {/* Tableau Stock */}
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
                <th style={{ padding: 14, textAlign: "center", width: 430 }}>Actions</th>
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

                  const qRet = safeNumber(l.retourQuantite, 0);
                  const badgeRetour =
                    l.retourEnCours && !l.retourValide
                      ? `🟥 Retour/Avoir demandé (Qté: ${qRet})`
                      : l.retourValide && !l.avoirRegle
                      ? `🟨 Retour validé (Qté: ${qRet})`
                      : l.avoirRegle
                      ? `🟩 Retour réglé`
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
                        {badgeRetour && (
                          <span style={{ marginLeft: 8, fontSize: 12 }} title="Statut retour/avoir">
                            {badgeRetour}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>{l.numeroLot}</td>
                      <td style={{ padding: 12 }}>{l.fournisseur || "-"}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(l.quantite)}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(l.stock1)}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(l.stock2)}</td>
                      <td style={{ padding: 12, textAlign: "right" }}>
                        {Number(l.prixVente || 0).toFixed(2)} DH
                      </td>
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

                          {/* Retour/Avoir actions */}
                          {!l.retourEnCours && !l.retourValide && !l.avoirRegle && (
                            <button
                              onClick={() => requestReturn(l)}
                              style={{
                                background: "linear-gradient(135deg,#fb7185,#f43f5e)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "8px 12px",
                                cursor: "pointer",
                              }}
                              title="Demander un retour/avoir"
                            >
                              ↩️ Retour/Avoir
                            </button>
                          )}
                          {l.retourEnCours && !l.retourValide && (
                            <>
                              <button
                                onClick={() => validateReturn(l)}
                                style={{
                                  background: "linear-gradient(135deg,#0ea5e9,#0284c7)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 10,
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                }}
                                title="Valider la demande de retour"
                              >
                                ✅ Valider
                              </button>
                              <button
                                onClick={() => cancelReturn(l)}
                                style={{
                                  background: "linear-gradient(135deg,#6b7280,#4b5563)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 10,
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                }}
                                title="Annuler la demande de retour"
                              >
                                ❌ Annuler
                              </button>
                            </>
                          )}
                          {l.retourValide && !l.avoirRegle && (
                            <button
                              onClick={() => approveReturn(l)}
                              style={{
                                background: "linear-gradient(135deg,#22c55e,#16a34a)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "8px 12px",
                                cursor: "pointer",
                              }}
                              title="Marquer l’avoir comme réglé et diminuer le stock"
                            >
                              💸 Avoir réglé
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
      <div
        style={{
          background: "rgba(255,255,255,.95)",
          borderRadius: 20,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
            {toOrder.length} ligne(s)
          </span>
          <button
            onClick={resetHidden}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px dashed #9ca3af",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
              color: "#4b5563",
            }}
            title="Réafficher les lignes supprimées"
          >
            ↺ Réinitialiser l’affichage
          </button>
        </div>

        {toOrder.length === 0 ? (
          <div style={{ padding: 14, color: "#6b7280" }}>
            En attente de ventes… Les articles vendus s’ajouteront ici automatiquement.
          </div>
        ) : (
          Object.keys(groups).map((supName) => {
            const lines = groups[supName];
            const rec = findSupplierRecord(supName);
            const supplierId = rec?.id || null;
            const commercials = rec?.commerciaux || [];
            const telSel = supplierId ? groupCommercial[supplierId] || "" : "";

            return (
              <div
                key={supName}
                style={{
                  marginTop: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 10,
                  }}
                >
                  <strong>
                    {supName === "Fournisseur inconnu" ? "Fournisseur inconnu (vérifiez Achats/Stock)" : supName}
                  </strong>

                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={telSel}
                      onChange={(e) => handleCommercialSelectChange(supName, e.target.value)}
                      style={{ padding: "8px 10px", borderRadius: 10, border: "2px solid #e5e7eb", minWidth: 240 }}
                      title="Sélection du commercial WhatsApp"
                    >
                      <option value="">— Commercial (WhatsApp) —</option>
                      {commercials.map((c, i) => (
                        <option key={i} value={normalizePhoneForWa(c.telephone || "")}>
                          {c.nom || "Commercial"} — {c.telephone || ""}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => addCommercial(supName)}
                      style={{
                        background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 10,
                        padding: "8px 12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Commercial
                    </button>

                    <button
                      onClick={() => sendWhatsAppForSupplier(supName)}
                      style={{
                        background: "linear-gradient(135deg,#22c55e,#16a34a)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 10,
                        padding: "8px 12px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                      title="Envoyer le bon de commande via WhatsApp"
                    >
                      📲 Envoyer WhatsApp
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "linear-gradient(135deg,#1f2937,#111827)", color: "#fff" }}>
                        <th style={{ padding: 10, textAlign: "left" }}>Médicament</th>
                        <th style={{ padding: 10, textAlign: "left" }}>N° lot</th>
                        <th style={{ padding: 10, textAlign: "center" }}>Date</th>
                        <th style={{ padding: 10, textAlign: "center" }}>Quantité</th>
                        <th style={{ padding: 10, textAlign: "center" }}>Remise (DH)</th>
                        <th style={{ padding: 10, textAlign: "center" }}>URGENT</th>
                        <th style={{ padding: 10, textAlign: "center" }}>Statut</th>
                        <th style={{ padding: 10, textAlign: "center", width: 260 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => {
                        const st = lineStatus[l.key] || {};
                        return (
                          <tr
                            key={l.key}
                            style={{
                              background: idx % 2 ? "rgba(249,250,251,.6)" : "white",
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            <td style={{ padding: 10, fontWeight: 700 }}>{l.nom}</td>
                            <td style={{ padding: 10 }}>{l.numeroLot}</td>
                            <td style={{ padding: 10, textAlign: "center" }}>
                              <input
                                type="date"
                                value={l.date}
                                onChange={(e) => setLineField(l.key, "date", e.target.value)}
                                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                              />
                            </td>
                            <td style={{ padding: 10, textAlign: "center" }}>
                              <input
                                type="number"
                                min={1}
                                value={l.quantite}
                                onChange={(e) =>
                                  setLineField(l.key, "quantite", Math.max(1, safeNumber(e.target.value)))
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
                                value={l.remise}
                                onChange={(e) =>
                                  setLineField(l.key, "remise", Math.max(0, safeNumber(e.target.value)))
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
                                  onChange={(e) => setLineField(l.key, "urgent", !!e.target.checked)}
                                />
                                {l.urgent ? "🔴 URGENT" : "—"}
                              </label>
                            </td>

                            {/* Statut (ENVOYÉ / VALIDÉ) */}
                            <td style={{ padding: 10, textAlign: "center" }}>
                              {st.sent ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: "#DBEAFE",
                                    border: "1px solid #93C5FD",
                                    fontSize: 12,
                                    marginRight: 6,
                                  }}
                                  title={st.sentAt ? `Envoyé le ${formatDateSafe(st.sentAt)}` : "Envoyé"}
                                >
                                  📤 Envoyé
                                </span>
                              ) : (
                                <span style={{ color: "#9CA3AF" }}>—</span>
                              )}

                              {st.validated && (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: "#DCFCE7",
                                    border: "1px solid #86EFAC",
                                    fontSize: 12,
                                  }}
                                  title={st.validatedAt ? `Validé le ${formatDateSafe(st.validatedAt)}` : "Validé"}
                                >
                                  ✅ Validé
                                </span>
                              )}
                            </td>

                            <td style={{ padding: 10, textAlign: "center" }}>
                              {!st.validated && st.sent && (
                                <button
                                  onClick={() => markLineValidated(l.key)}
                                  style={{
                                    marginRight: 8,
                                    background: "linear-gradient(135deg,#34d399,#10b981)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 10,
                                    padding: "6px 10px",
                                    cursor: "pointer",
                                  }}
                                  title="Marquer la commande de cette ligne comme validée"
                                >
                                  ✅ Valider
                                </button>
                              )}

                              <button
                                onClick={() => duplicateLine(l.key)}
                                style={{
                                  marginRight: 8,
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
                                onClick={() => removeLine(l.key)}
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
                            </td>
                          </tr>
                        );
                      })}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ padding: 12, textAlign: "center", color: "#6b7280" }}>
                            Aucune ligne pour ce fournisseur
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {supName === "Fournisseur inconnu" && (
                  <div style={{ marginTop: 8, color: "#b45309" }}>
                    Impossible d’envoyer — fournisseur non identifié. Complétez vos fournisseurs dans les achats/stock.
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

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

/* ======================================================
   Modal Scanner Caméra
====================================================== */
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
            formats:
              supported && supported.length
                ? supported
                : ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"],
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
            controls = await reader.decodeFromVideoDevice(
              null,
              videoRef.current,
              (result) => {
                const txt = result?.getText?.();
                if (txt) onDetected?.(txt);
              }
            );
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
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
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

// src/components/stock/OrderManagement.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  addDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

/* ======================================================
  Utils & Helpers
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

const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const encodeWhatsAppText = (t) => encodeURIComponent(t);
const normalizePhoneForWa = (num) => (num || "").replace(/\D/g, "");

/* ======================================================
  Détection transfert (on exclut des ventes)
====================================================== */
const isTransferOperation = (docx) => {
  return !!(
    docx?.isTransferred ||
    docx?.isStockTransfer ||
    docx?.transfert ||
    docx?.type === "transfert" ||
    docx?.type === "transfer" ||
    docx?.operationType === "transfert" ||
    docx?.operationType === "transfer" ||
    (docx?.note &&
      (String(docx.note).toLowerCase().includes("transfert") ||
        String(docx.note).toLowerCase().includes("transfer") ||
        (String(docx.note).toLowerCase().includes("stock1") &&
          String(docx.note).toLowerCase().includes("stock2"))))
  );
};

/* ======================================================
  Extraction robuste des ventes
====================================================== */
function extractArticleName(a) {
  return a?.nom || a?.produit || a?.designation || a?.medicament || a?.name || a?.libelle || a?.productName || "";
}
function extractArticleLot(a) {
  return a?.numeroLot || a?.lot || a?.batch || a?.batchNumber || a?.nLot || "";
}
function extractArticleQty(a) {
  const q = a?.quantite ?? a?.qte ?? a?.qty ?? a?.quantity ?? a?.Quantite ?? a?.Qte ?? a?.Quantity ?? 0;
  return safeNumber(q, 0);
}
function looksLikeArticle(obj) {
  if (!obj || typeof obj !== "object") return false;
  const name = extractArticleName(obj);
  const qty = extractArticleQty(obj);
  return !!name || Number.isFinite(qty);
}
function extractVenteArticles(vDoc) {
  if (isTransferOperation(vDoc)) return [];
  if (Array.isArray(vDoc?.articles)) return vDoc.articles.filter(looksLikeArticle);

  const candidates = [];
  const keys = ["items", "lignes", "produits", "products", "details", "cart", "panier"];
  keys.forEach((k) => {
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
  Composant OrderManagement
====================================================== */
export default function OrderManagement() {
  const { user, societeId, loading } = useUserRole();
  const [waiting, setWaiting] = useState(true);

  const [ventes, setVentes] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [achatsIndex, setAchatsIndex] = useState({});
  const [lots, setLots] = useState([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [toOrder, setToOrder] = useState([]);
  const [groupCommercial, setGroupCommercial] = useState({});
  const [lineStatus, setLineStatus] = useState({});

  // Lignes manuelles persistées
  const [manualLines, setManualLines] = useState([]);

  // Opérations ignorées (par id vente#index), persistées
  const [dismissedOps, setDismissedOps] = useState(new Set());

  const [manualSuppliers, setManualSuppliers] = useState({});

  const ORDER_STATUS_COLL = "order_status";
  const DISMISSED_COLL = "order_dismissed";
  const MANUAL_LINES_COLL = "order_manual_lines";

  // Refs de listeners temps réel
  const ventesListenerRef = useRef(null);
  const stockListenerRef = useRef(null);
  const orderStatusListenerRef = useRef(null);
  const manualLinesListenerRef = useRef(null);
  const dismissedListenerRef = useRef(null);

  const isProcessingRef = useRef(false);

  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  /* ================== LISTENERS TEMPS RÉEL ================== */

  const setupVentesListener = useCallback(() => {
    if (!societeId || ventesListenerRef.current) return;
    ventesListenerRef.current = onSnapshot(
      query(collection(db, "societe", societeId, "ventes"), orderBy("date", "desc")),
      (snapshot) => {
        const ventesData = [];
        snapshot.forEach((docx) => {
          const data = docx.data();
          if (!isTransferOperation(data)) ventesData.push({ id: docx.id, ...data });
        });
        setVentes(ventesData);
      },
      (err) => {
        console.error("Erreur listener ventes:", err);
        setError("Erreur de synchronisation avec les ventes");
      }
    );
  }, [societeId]);

  const setupStockListener = useCallback(() => {
    if (!societeId || stockListenerRef.current) return;
    stockListenerRef.current = onSnapshot(
      query(collection(db, "societe", societeId, "stock_entries"), orderBy("nom")),
      (snapshot) => {
        const stockData = [];
        snapshot.forEach((docx) => {
          const data = docx.data();
          const q = Math.max(0, safeNumber(data.quantite));
          const s1 = Math.min(q, Math.max(0, safeNumber(data.stock1, q)));
          const s2 = Math.max(0, q - s1);
          stockData.push({ id: docx.id, ...data, quantite: s1 + s2, stock1: s1, stock2: s2 });
        });
        setLots(stockData);
      },
      (err) => {
        console.error("Erreur listener stock:", err);
      }
    );
  }, [societeId]);

  const setupOrderStatusListener = useCallback(() => {
    if (!societeId || orderStatusListenerRef.current) return;
    orderStatusListenerRef.current = onSnapshot(
      collection(db, "societe", societeId, ORDER_STATUS_COLL),
      (snap) => {
        const obj = {};
        snap.forEach((d) => {
          const st = d.data() || {};
          obj[d.id] = {
            sent: !!st.sent,
            validated: !!st.validated,
            sentAt: st.sentAt || null,
            validatedAt: st.validatedAt || null,
            frozenOps: Array.isArray(st.frozenOps) ? st.frozenOps : [],
            frozenQuantity: st.frozenQuantity || 0,
            frozenDate: st.frozenDate || null,
            frozenRemise: st.frozenRemise || 0,
            frozenUrgent: !!st.frozenUrgent,
            frozenName: st.frozenName || null,
            frozenLot: st.frozenLot || null,
            frozenSupplier: st.frozenSupplier || null,
          };
        });
        setLineStatus(obj);
      },
      (err) => {
        console.error("Erreur listener order_status:", err);
      }
    );
  }, [societeId]);

  const setupManualLinesListener = useCallback(() => {
    if (!societeId || manualLinesListenerRef.current) return;
    manualLinesListenerRef.current = onSnapshot(
      query(collection(db, "societe", societeId, MANUAL_LINES_COLL), orderBy("createdAt", "desc")),
      (snap) => {
        const arr = [];
        snap.forEach((d) => {
          const x = d.data() || {};
          arr.push({
            ...x,
            key: x.key || d.id,
            manualId: d.id,
            isManual: true,
          });
        });
        setManualLines(arr);
      },
      (err) => {
        console.error("Erreur listener order_manual_lines:", err);
      }
    );
  }, [societeId]);

  const setupDismissedOpsListener = useCallback(() => {
    if (!societeId || dismissedListenerRef.current) return;
    dismissedListenerRef.current = onSnapshot(
      collection(db, "societe", societeId, DISMISSED_COLL),
      (snap) => {
        const s = new Set();
        snap.forEach((d) => {
          const data = d.data();
          if (data?.dismissed) s.add(d.id);
        });
        setDismissedOps(s);
      },
      (err) => {
        console.error("Erreur listener order_dismissed:", err);
      }
    );
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
        if (isTransferOperation(a)) return;
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

  useEffect(() => {
    if (!waiting) {
      setupVentesListener();
      setupStockListener();
      setupOrderStatusListener();   // ⏱️ temps réel
      setupManualLinesListener();   // ⏱️ temps réel
      setupDismissedOpsListener();  // ⏱️ temps réel
      fetchFournisseurs();
      fetchAchatsIndex();
    }
    return () => {
      if (ventesListenerRef.current) {
        ventesListenerRef.current();
        ventesListenerRef.current = null;
      }
      if (stockListenerRef.current) {
        stockListenerRef.current();
        stockListenerRef.current = null;
      }
      if (orderStatusListenerRef.current) {
        orderStatusListenerRef.current();
        orderStatusListenerRef.current = null;
      }
      if (manualLinesListenerRef.current) {
        manualLinesListenerRef.current();
        manualLinesListenerRef.current = null;
      }
      if (dismissedListenerRef.current) {
        dismissedListenerRef.current();
        dismissedListenerRef.current = null;
      }
    };
  }, [
    waiting,
    setupVentesListener,
    setupStockListener,
    setupOrderStatusListener,
    setupManualLinesListener,
    setupDismissedOpsListener,
    fetchFournisseurs,
    fetchAchatsIndex,
  ]);

  /* ================== INDEX FOURNISSEURS ================== */

  const lotSupplierIndex = useMemo(() => {
    const idx = {};
    (lots || []).forEach((lot) => {
      const fr = (lot.fournisseur || "").trim();
      if (!fr) return;
      const kNom = normalize(lot.nom);
      if (kNom && !idx[kNom]) idx[kNom] = fr;
      const kLot = lot.numeroLot ? `${normalize(lot.nom)}|${normalize(lot.numeroLot)}` : null;
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
      const partialMatchLot = Object.keys(lotSupplierIndex).find(
        (key) => key.includes(k1) || k1.includes(key.split("|")[0])
      );
      if (partialMatchLot) return lotSupplierIndex[partialMatchLot];
      const partialMatchAchat = Object.keys(achatsIndex).find(
        (key) => key.includes(k1) || k1.includes(key.split("|")[0])
      );
      if (partialMatchAchat) return achatsIndex[partialMatchAchat];
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

  const makeKey = (nomArt, lotArt) => `${normalize(nomArt)}|${normalize(lotArt || "-")}`;

  /* ================== AGRÉGATION VENTES → LIGNES À COMMANDER ================== */

  const ventesAggregate = useMemo(() => {
    const acc = {};
    (ventes || []).forEach((v) => {
      if (isTransferOperation(v)) return;
      const rows = extractVenteArticles(v);
      rows.forEach((a, idx) => {
        const opId = `${v.id}#${idx}`;
        if (dismissedOps.has(opId)) return;
        const nomA = (extractArticleName(a) || "").trim();
        if (!nomA) return;
        const lotA = (extractArticleLot(a) || "").trim();
        let q = extractArticleQty(a);
        if (!Number.isFinite(q) || q <= 0) q = 1;

        const key = makeKey(nomA, lotA);

        if (!acc[key]) {
          const frName = findSupplierName(nomA, lotA);
          acc[key] = {
            key,
            nom: nomA,
            numeroLot: lotA || "-",
            fournisseur: frName || "",
            quantite: 0,
            sourceOps: new Set(),
          };
        } else if (!acc[key].fournisseur) {
          const frName = findSupplierName(nomA, lotA);
          if (frName) acc[key].fournisseur = frName;
        }
        acc[key].quantite += q;
        acc[key].sourceOps.add(opId);
      });
    });

    const out = {};
    Object.keys(acc).forEach((k) => {
      out[k] = { ...acc[k], sourceOps: Array.from(acc[k].sourceOps) };
    });
    return out;
  }, [ventes, dismissedOps, findSupplierName]);

  const normalizeLotNumber = (lot) => {
    if (!lot) return "-";
    return lot
      .replace(/\[TRANSFERT\s+S\d+\]/gi, "")
      .replace(/-S\d+$/i, "")
      .replace(/-TRANSFERT.*$/i, "")
      .trim() || "-";
  };

  // ====== FUSION / RECONSTRUCTION ======
  useEffect(() => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const fromSales = Object.values(ventesAggregate);

    const lockedProductKeys = new Set();
    const allFrozenOps = new Set();

    Object.entries(lineStatus).forEach(([key, status]) => {
      if (status.sent || status.validated) {
        const [productPart] = key.split("|supplement");
        const normalizedProduct = productPart.replace(/\|copy-.*/, "").replace(/\|manual-.*/, "");
        lockedProductKeys.add(normalizedProduct);
        if (Array.isArray(status.frozenOps)) {
          status.frozenOps.forEach((op) => allFrozenOps.add(op));
        }
      }
    });

    const allLines = [];
    const processedKeys = new Set();
    const supplementCounts = new Map();

    fromSales.forEach((x) => {
      const normalizedLot = normalizeLotNumber(x.numeroLot);
      const productKey = `${normalize(x.nom)}|${normalize(normalizedLot)}`;
      const hasLockedLine = lockedProductKeys.has(productKey);
      const newOps = (x.sourceOps || []).filter((op) => !allFrozenOps.has(op) && !dismissedOps.has(op));

      if (newOps.length > 0) {
        let newQty = 0;
        newOps.forEach((opId) => {
          const [venteId, idxStr] = opId.split("#");
          const vente = ventes.find((v) => v.id === venteId);
          if (!vente) return;
          const articles = extractVenteArticles(vente);
          const art = articles[Number(idxStr)];
          if (!art) return;
          newQty += extractArticleQty(art);
        });

        if (hasLockedLine) {
          const supplementCount = supplementCounts.get(productKey) || 0;
          const versionNumber = supplementCount + 1;
          supplementCounts.set(productKey, versionNumber);
          const supplementKey = `${x.key}|supplement-v${versionNumber}-${Date.now()}`;

          allLines.push({
            key: supplementKey,
            nom: x.nom,
            numeroLot: x.numeroLot,
            fournisseur: x.fournisseur,
            quantite: newQty,
            date: todayISO(),
            remise: 0,
            urgent: false,
            sourceOps: newOps,
            isNewAfterSent: true,
            supplementVersion: versionNumber,
          });
          processedKeys.add(supplementKey);
        } else {
          const fournisseurFinal = manualSuppliers[x.key] || x.fournisseur || "";
          allLines.push({
            key: x.key,
            nom: x.nom,
            numeroLot: x.numeroLot,
            fournisseur: fournisseurFinal,
            quantite: newQty,
            date: todayISO(),
            remise: 0,
            urgent: false,
            sourceOps: newOps,
            isNewAfterSent: false,
          });
          processedKeys.add(x.key);
        }
      }
    });

    // reconstruction lignes envoyées/verrouillées
    Object.entries(lineStatus).forEach(([key, status]) => {
      if ((status.sent || status.validated) && !processedKeys.has(key)) {
        const [baseKey] = key.split("|supplement");
        const baseData = ventesAggregate[baseKey];

        const nom = status.frozenName || baseData?.nom || "Produit";
        const lot = status.frozenLot || baseData?.numeroLot || "-";
        const fournisseur = status.frozenSupplier || baseData?.fournisseur || "";

        allLines.push({
          key,
          nom,
          numeroLot: lot,
          fournisseur,
          quantite: status.frozenQuantity || 0,
          date: status.frozenDate || todayISO(),
          remise: status.frozenRemise || 0,
          urgent: status.frozenUrgent || false,
          sourceOps: status.frozenOps || [],
          isNewAfterSent: false,
        });
      }
    });

    // Injecter les lignes manuelles persistées non envoyées/validées
    const manualPending = (manualLines || []).filter((ml) => {
      const st = lineStatus[ml.key] || {};
      return !st?.sent && !st?.validated;
    });

    const newStateCandidate = [...allLines, ...manualPending];

    setToOrder((prev) => {
      const previousManual = prev.filter(
        (l) =>
          l.isManual &&
          !(lineStatus[l.key]?.sent || lineStatus[l.key]?.validated) &&
          !newStateCandidate.find((x) => x.key === l.key)
      );
      const newState = [...newStateCandidate, ...previousManual];

      setTimeout(() => {
        isProcessingRef.current = false;
      }, 50);

      return newState;
    });
  }, [ventesAggregate, lineStatus, manualSuppliers, ventes, dismissedOps, manualLines]);

  // Nettoyer les lignes orphelines si la vente disparait
  useEffect(() => {
    setToOrder((prev) =>
      prev.filter((line) => {
        if (!Array.isArray(line.sourceOps) || line.sourceOps.length === 0) return true;
        return line.sourceOps.some((opId) => {
          const venteId = opId.split("#")[0];
          return ventes.some((v) => v.id === venteId);
        });
      })
    );
  }, [ventes]);

  /* ================== GROUPES PAR FOURNISSEUR ================== */

  const groups = useMemo(() => {
    const g = {};
    (toOrder || []).forEach((x) => {
      const sup = (x.fournisseur || "").trim() || "Fournisseur inconnu";
      if (!g[sup]) g[sup] = [];
      g[sup].push(x);
    });
    return g;
  }, [toOrder]);

  useEffect(() => {
    setGroupCommercial((prev) => {
      const next = { ...prev };
      let hasChanges = false;

      Object.keys(groups).forEach((supName) => {
        const rec = findSupplierRecord(supName);
        if (!rec) return;
        const list = rec.commerciaux || [];
        if (list.length === 1 && !next[rec.id]) {
          next[rec.id] = normalizePhoneForWa(list[0].telephone || "");
          hasChanges = true;
        }
      });

      return hasChanges ? next : prev;
    });
  }, [groups, findSupplierRecord]);

  /* ================== ACTIONS LIGNES (écriture → reflétée en temps réel) ================== */

  const setLineStatusPartial = useCallback(
    (key, patch) => {
      // On laisse la source de vérité à Firestore → le listener mettra à jour `lineStatus` en temps réel
      if (!societeId) return;
      const ref = doc(db, "societe", societeId, ORDER_STATUS_COLL, key);
      const payload = {
        ...(patch.sent !== undefined ? { sent: !!patch.sent } : {}),
        ...(patch.validated !== undefined ? { validated: !!patch.validated } : {}),
        ...(patch.sentAt ? { sentAt: patch.sentAt } : {}),
        ...(patch.validatedAt ? { validatedAt: patch.validatedAt } : {}),
        ...(Array.isArray(patch.frozenOps) ? { frozenOps: patch.frozenOps } : {}),
        ...(patch.frozenQuantity !== undefined ? { frozenQuantity: patch.frozenQuantity } : {}),
        ...(patch.frozenDate !== undefined ? { frozenDate: patch.frozenDate } : {}),
        ...(patch.frozenRemise !== undefined ? { frozenRemise: patch.frozenRemise } : {}),
        ...(patch.frozenUrgent !== undefined ? { frozenUrgent: patch.frozenUrgent } : {}),
        ...(patch.frozenName !== undefined ? { frozenName: patch.frozenName } : {}),
        ...(patch.frozenLot !== undefined ? { frozenLot: patch.frozenLot } : {}),
        ...(patch.frozenSupplier !== undefined ? { frozenSupplier: patch.frozenSupplier } : {}),
        updatedAt: Timestamp.now(),
      };
      setDoc(ref, payload, { merge: true }).catch((e) => console.error(e));
    },
    [societeId]
  );

  const clearLineStatus = useCallback(
    (key) => {
      if (!societeId) return;
      deleteDoc(doc(db, "societe", societeId, ORDER_STATUS_COLL, key)).catch(() => {});
    },
    [societeId]
  );

  const persistDismissOps = useCallback(
    async (opIds = []) => {
      if (!societeId || !opIds.length) return;
      await Promise.all(
        opIds.map((id) =>
          setDoc(
            doc(db, "societe", societeId, DISMISSED_COLL, id),
            { dismissed: true, at: Timestamp.now() },
            { merge: true }
          ).catch(() => {})
        )
      );
    },
    [societeId]
  );

  const setLineField = useCallback(
    (key, field, val) => {
      setToOrder((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: val } : l)));
      // miroir en base si c'est une ligne manuelle persistée
      const ml = manualLines.find((m) => m.key === key);
      if (ml?.manualId && societeId) {
        setDoc(
          doc(db, "societe", societeId, MANUAL_LINES_COLL, ml.manualId),
          { [field]: val, updatedAt: Timestamp.now() },
          { merge: true }
        ).catch(() => {});
      }
    },
    [manualLines, societeId]
  );

  const duplicateLine = useCallback((key) => {
    setToOrder((prev) => {
      const l = prev.find((x) => x.key === key);
      if (!l) return prev;
      const copy = {
        ...l,
        key: `${l.key}#copy-${Date.now()}`,
        date: todayISO(),
        remise: 0,
        urgent: false,
        sourceOps: [],
        isNewAfterSent: false,
        isManual: l.isManual || false,
      };
      return [...prev, copy];
    });
  }, []);

  const removeLine = useCallback(
    async (line) => {
      const key = line.key;
      const ops = Array.isArray(line.sourceOps) ? line.sourceOps : [];

      // 1) ignorer définitivement les opérations ventes (si existantes)
      if (ops.length) await persistDismissOps(ops);

      // 2) si ligne manuelle → suppression du doc (listener mettra l'UI à jour)
      if (line.isManual && line.manualId && societeId) {
        await deleteDoc(doc(db, "societe", societeId, MANUAL_LINES_COLL, line.manualId)).catch(() => {});
      }

      // 3) nettoyer statut
      clearLineStatus(key);

      // UI : optimiste
      setToOrder((prev) => prev.filter((l) => l.key !== key));
      setSuccess("Ligne supprimée.");
      setTimeout(() => setSuccess(""), 1200);
    },
    [persistDismissOps, clearLineStatus, societeId]
  );

  /* ================== FOURNISSEURS & COMMERCIAUX ================== */

  const ensureSupplierDoc = useCallback(
    async (supplierName) => {
      if (!supplierName || supplierName === "Fournisseur inconnu") return null;
      let rec = findSupplierRecord(supplierName);
      if (rec) return rec;
      try {
        const ref = await addDoc(collection(db, "societe", societeId, "fournisseurs"), {
          nom: supplierName.trim(),
          commerciaux: [],
          createdAt: Timestamp.now(),
        });
        await fetchFournisseurs();
        return (
          fournisseurs.find((f) => normalize(f.nom) === normalize(supplierName)) || {
            id: ref.id,
            nom: supplierName.trim(),
            commerciaux: [],
          }
        );
      } catch (e) {
        console.error(e);
        setError("Impossible de créer le fournisseur.");
        return null;
      }
    },
    [societeId, fournisseurs, fetchFournisseurs, findSupplierRecord]
  );

  const handleCommercialSelectChange = useCallback(
    async (supplierName, telRaw) => {
      const tel = normalizePhoneForWa(telRaw);
      let rec = findSupplierRecord(supplierName) || (await ensureSupplierDoc(supplierName));
      if (!rec) {
        setError("Fournisseur introuvable.");
        return;
      }
      setGroupCommercial((p) => ({ ...p, [rec.id]: tel }));
    },
    [findSupplierRecord, ensureSupplierDoc]
  );

  const addCommercial = useCallback(
    async (supplierName) => {
      const rec0 = (await ensureSupplierDoc(supplierName)) || findSupplierRecord(supplierName);
      if (!rec0) {
        setError("Fournisseur introuvable.");
        return;
      }
      const nomCom = window.prompt("Nom du commercial :");
      if (!nomCom) return;
      const telRaw = window.prompt("Numéro WhatsApp (ex: +2126...):");
      if (!telRaw) return;
      const tel = normalizePhoneForWa(telRaw);
      if (!tel) {
        setError("Numéro WhatsApp invalide.");
        return;
      }
      try {
        await fetchFournisseurs();
        let rec = findSupplierRecord(supplierName) || rec0;
        if (!rec) {
          setError("Fournisseur introuvable après création.");
          return;
        }
        const newList = [...(rec.commerciaux || []), { nom: nomCom.trim(), telephone: tel }];
        await updateDoc(doc(db, "societe", societeId, "fournisseurs", rec.id), {
          commerciaux: newList,
        });
        await fetchFournisseurs();
        setGroupCommercial((p) => ({ ...p, [rec.id]: tel }));
        setSuccess("Commercial ajouté");
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Impossible d'ajouter le commercial");
      }
    },
    [societeId, ensureSupplierDoc, findSupplierRecord, fetchFournisseurs]
  );

  const deleteCommercial = useCallback(
    async (supplierName, commercialIndex) => {
      const rec = findSupplierRecord(supplierName);
      if (!rec) {
        setError("Fournisseur introuvable.");
        return;
      }
      const commercial = rec.commerciaux[commercialIndex];
      if (!window.confirm(`Supprimer le commercial "${commercial.nom}" ?`)) return;

      try {
        const newList = rec.commerciaux.filter((_, idx) => idx !== commercialIndex);
        await updateDoc(doc(db, "societe", societeId, "fournisseurs", rec.id), {
          commerciaux: newList,
        });
        await fetchFournisseurs();
        if (groupCommercial[rec.id] === normalizePhoneForWa(commercial.telephone)) {
          setGroupCommercial((p) => {
            const next = { ...p };
            delete next[rec.id];
            return next;
          });
        }
        setSuccess(`Commercial "${commercial.nom}" supprimé`);
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Impossible de supprimer le commercial");
      }
    },
    [societeId, findSupplierRecord, fetchFournisseurs, groupCommercial]
  );

  const buildWhatsAppMessage = useCallback((supplierName, lines, commercialName) => {
    const header = `BON DE COMMANDE — ${supplierName}\nCommercial: ${commercialName || "—"}\nDate: ${new Date().toLocaleString("fr-FR")}\n`;
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

  const sendWhatsAppForSupplier = useCallback(
    async (supplierName) => {
      const todayString = new Date().toISOString().split("T")[0];

      const lines = (groups[supplierName] || []).filter((l) => {
        const st = lineStatus[l.key] || {};
        const isToday = l.date === todayString;
        const notSent = !st.sent;
        const isNewAfterSent = l.isNewAfterSent === true;
        return (isToday && notSent) || (isNewAfterSent && notSent);
      });

      if (!lines.length) {
        setError("Aucune ligne à envoyer pour aujourd'hui");
        return;
      }

      let rec = findSupplierRecord(supplierName) || (await ensureSupplierDoc(supplierName));
      if (!rec) {
        setError("Impossible d'envoyer, fournisseur non identifié.");
        return;
      }
      await fetchFournisseurs();
      rec = findSupplierRecord(supplierName) || rec;
      let commercials = rec.commerciaux || [];
      if (!commercials.length) {
        if (window.confirm("Aucun commercial pour ce fournisseur. En ajouter un ?")) {
          await addCommercial(supplierName);
          await fetchFournisseurs();
          rec = findSupplierRecord(supplierName) || rec;
          commercials = rec.commerciaux || [];
          if (!commercials.length) {
            setError("Commercial introuvable après l'ajout.");
            return;
          }
        } else {
          setError("Ajoutez un commercial pour envoyer via WhatsApp.");
          return;
        }
      }
      let tel = groupCommercial[rec.id] || "";
      let comName = "";
      if (!tel && commercials.length === 1) {
        tel = normalizePhoneForWa(commercials[0].telephone);
        comName = commercials[0].nom || "";
        setGroupCommercial((p) => ({ ...p, [rec.id]: tel }));
      }
      if (!tel) {
        setError("Veuillez sélectionner un commercial.");
        return;
      }
      const m = commercials.find((c) => normalizePhoneForWa(c.telephone) === normalizePhoneForWa(tel));
      comName = m?.nom || "";

      const msg = buildWhatsAppMessage(supplierName, lines, comName);
      const url = `https://wa.me/${tel}?text=${encodeWhatsAppText(msg)}`;
      window.open(url, "_blank", "noopener,noreferrer");

      const now = Timestamp.now();

      // Geler le statut (écritures -> reflétées instantanément par le listener order_status)
      await Promise.all(
        lines.map(async (l) => {
          const frozenOps = Array.isArray(l.sourceOps) ? l.sourceOps : [];
          setLineStatusPartial(l.key, {
            sent: true,
            sentAt: now,
            frozenOps,
            frozenQuantity: l.quantite,
            frozenDate: l.date,
            frozenRemise: l.remise,
            frozenUrgent: l.urgent,
            frozenName: l.nom,
            frozenLot: l.numeroLot,
            frozenSupplier: l.fournisseur || supplierName,
          });

          // si ligne manuelle, on la retire de la collection (le listener mettra l'UI à jour)
          if (l.isManual && l.manualId && societeId) {
            await deleteDoc(doc(db, "societe", societeId, MANUAL_LINES_COLL, l.manualId)).catch(() => {});
          }
        })
      );

      setSuccess("Message WhatsApp prêt — lignes verrouillées (temps réel).");
      setTimeout(() => setSuccess(""), 1500);
    },
    [
      groups,
      lineStatus,
      groupCommercial,
      findSupplierRecord,
      ensureSupplierDoc,
      fetchFournisseurs,
      addCommercial,
      buildWhatsAppMessage,
      setLineStatusPartial,
      societeId,
    ]
  );

  const markLineValidated = useCallback(
    (key) => {
      const now = Timestamp.now();
      // L’UI se mettra à jour via le listener temps réel
      setLineStatusPartial(key, { validated: true, validatedAt: now, sent: true, sentAt: now });
    },
    [setLineStatusPartial]
  );

  // ========= Formulaire Ligne manuelle (persistée pour temps réel/reload) =========
  const addManualLine = useCallback(async () => {
    const nom = window.prompt("Nom du médicament :");
    if (!nom) return;
    const lot = window.prompt("Numéro de lot (optionnel) :") || "-";

    const existsList = fournisseurs.length
      ? `\n\nFournisseurs existants :\n- ${fournisseurs.map((f) => f.nom).join("\n- ")}\n\n`
      : "\n";
    const fournisseurInput =
      window.prompt("Nom du fournisseur : (laisser vide pour 'Fournisseur inconnu')" + existsList) || "";

    const fournisseurFinal = (fournisseurInput || "").trim() || "Fournisseur inconnu";

    const qtyStr = window.prompt("Quantité :");
    const qty = safeNumber(qtyStr, 1);
    if (qty <= 0) {
      setError("Quantité invalide");
      return;
    }

    const newLine = {
      key: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nom: nom.trim(),
      numeroLot: lot,
      fournisseur: fournisseurFinal,
      quantite: qty,
      date: todayISO(),
      remise: 0,
      urgent: false,
      sourceOps: [],
      isManual: true,
    };

    try {
      if (!societeId) throw new Error("Société inconnue");
      // Création -> le listener manual_lines chargera automatiquement l’UI
      await addDoc(collection(db, "societe", societeId, MANUAL_LINES_COLL), {
        ...newLine,
        societeId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      setSuccess("Ligne manuelle ajoutée (temps réel).");
      setTimeout(() => setSuccess(""), 1200);
    } catch (e) {
      console.error("addManualLine:", e);
      setError("Impossible d’enregistrer la ligne manuelle.");
    }
  }, [fournisseurs, societeId]);

  /* ================== UI ================== */

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
              Gestion des Commandes (Fournisseurs)
            </h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
              Tout est synchronisé en temps réel : envoi et validation apparaissent instantanément.
            </p>
          </div>
        </div>
      </div>

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
          <button onClick={() => setError("")} style={{ marginLeft: 8, border: "none", background: "transparent", cursor: "pointer" }}>
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
          <button onClick={() => setSuccess("")} style={{ marginLeft: 8, border: "none", background: "transparent", cursor: "pointer" }}>
            ×
          </button>
        </div>
      )}

      <div
        style={{
          background: "rgba(255,255,255,.95)",
          borderRadius: 20,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontWeight: 800 }}>Quantités à commander</h2>
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
            onClick={addManualLine}
            style={{
              background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
            title="Ajouter une ligne manuellement"
          >
            + Ligne manuelle
          </button>

          <button
            onClick={async () => {
              const keysToClean = Object.keys(lineStatus).filter((k) => lineStatus[k]?.validated);
              await Promise.all(
                keysToClean.map((k) => deleteDoc(doc(db, "societe", societeId, ORDER_STATUS_COLL, k)).catch(() => {}))
              );
              setSuccess("Nettoyage effectué : opérations validées retirées (temps réel).");
              setTimeout(() => setSuccess(""), 1400);
            }}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px dashed #9ca3af",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
              color: "#4b5563",
            }}
            title="Supprimer les opérations validées"
          >
            Nettoyer validées
          </button>
        </div>

        {Object.keys(groups).length === 0 ? (
          <div style={{ padding: 14, color: "#6b7280" }}>
            En attente de ventes… Les articles vendus s'ajouteront ici automatiquement.
          </div>
        ) : (
          Object.keys(groups).map((supName) => {
            const lines = [...groups[supName]];

            const rec = findSupplierRecord(supName);
            const supplierId = rec?.id || null;
            const commercials = rec?.commerciaux || [];
            const telSel = supplierId ? groupCommercial[supplierId] || "" : "";

            const todayString = new Date().toISOString().split("T")[0];

            const filteredLines = lines.filter((l) => {
              const st = lineStatus[l.key] || {};
              const isToday = l.date === todayString;
              const isSentButNotValidated = st.sent && !st.validated;
              const isNewAfterSent = l.isNewAfterSent === true;
              return isToday || isSentButNotValidated || isNewAfterSent;
            });

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

                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <select
                        value={telSel}
                        onChange={(e) => handleCommercialSelectChange(supName, e.target.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "2px solid #e5e7eb",
                          minWidth: 240,
                        }}
                        title="Sélection du commercial WhatsApp"
                      >
                        <option value="">— Commercial (WhatsApp) —</option>
                        {commercials.map((c, i) => (
                          <option key={i} value={normalizePhoneForWa(c.telephone || "")}>
                            {c.nom || "Commercial"} — {c.telephone || ""}
                          </option>
                        ))}
                      </select>

                      {commercials.length > 0 && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#6b7280",
                            background: "#f9fafb",
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>Commerciaux enregistrés :</div>
                          {commercials.map((c, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "4px 6px",
                                background: "#fff",
                                borderRadius: 6,
                                marginBottom: 4,
                                border: "1px solid #e5e7eb",
                              }}
                            >
                              <span style={{ flex: 1 }}>
                                <strong>{c.nom}</strong> - {c.telephone}
                              </span>
                              <button
                                onClick={() => deleteCommercial(supName, i)}
                                style={{
                                  padding: "4px 8px",
                                  background: "linear-gradient(135deg,#ef4444,#dc2626)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                                title={`Supprimer ${c.nom}`}
                              >
                                Supprimer
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

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
                      Envoyer WhatsApp
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
                        <th style={{ padding: 10, textAlign: "center", width: 360 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLines.map((l, idx) => {
                        const st = lineStatus[l.key] || {};
                        const isLocked = st.sent && !st.validated;
                        const isNewAfterSent = l.isNewAfterSent || false;

                        const displayNom = isLocked ? st.frozenName || l.nom : l.nom;
                        const displayLot = isLocked ? st.frozenLot || l.numeroLot : l.numeroLot;
                        const displaySupplier = isLocked ? st.frozenSupplier || l.fournisseur : l.fournisseur;

                        const displayQuantite = isLocked ? st.frozenQuantity || l.quantite : l.quantite;
                        const displayDate = isLocked ? st.frozenDate || l.date : l.date;
                        const displayRemise = isLocked ? st.frozenRemise || l.remise : l.remise;
                        const displayUrgent = isLocked ? st.frozenUrgent || l.urgent : l.urgent;

                        return (
                          <tr
                            key={l.key}
                            style={{
                              background: isLocked
                                ? "rgba(254,243,199,.4)"
                                : isNewAfterSent
                                ? "rgba(220,252,231,.4)"
                                : idx % 2
                                ? "rgba(249,250,251,.6)"
                                : "white",
                              borderBottom: "1px solid #f3f4f6",
                              borderLeft: isLocked ? "4px solid #f59e0b" : isNewAfterSent ? "4px solid #22c55e" : undefined,
                            }}
                          >
                            <td style={{ padding: 10, fontWeight: 700 }}>
                              {isNewAfterSent ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 20, fontWeight: 900 }}>➕</span>
                                  <span>{displayNom}</span>
                                  {l.supplementVersion && (
                                    <span
                                      style={{
                                        padding: "2px 6px",
                                        background: "#dcfce7",
                                        border: "2px solid #22c55e",
                                        borderRadius: 6,
                                        fontSize: 10,
                                        fontWeight: 800,
                                      }}
                                    >
                                      SUPPLÉMENT #{l.supplementVersion}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                displayNom
                              )}
                              {isLocked && (
                                <span
                                  style={{
                                    marginLeft: 8,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: "#fef3c7",
                                    border: "1px solid #f59e0b",
                                    fontSize: 11,
                                    fontWeight: 600,
                                  }}
                                  title="Ligne verrouillée - envoyée mais non validée"
                                >
                                  VERROUILLÉE
                                </span>
                              )}
                              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                                Fournisseur : <strong>{displaySupplier || "—"}</strong>
                              </div>
                            </td>

                            <td style={{ padding: 10 }}>{displayLot}</td>

                            <td style={{ padding: 10, textAlign: "center" }}>
                              <input
                                type="date"
                                value={displayDate}
                                onChange={(e) => !isLocked && setLineField(l.key, "date", e.target.value)}
                                disabled={isLocked}
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                  background: isLocked ? "#f9fafb" : "#fff",
                                  cursor: isLocked ? "not-allowed" : "text",
                                  opacity: isLocked ? 0.7 : 1,
                                }}
                              />
                            </td>

                            <td style={{ padding: 10, textAlign: "center" }}>
                              <input
                                type="number"
                                min={1}
                                value={displayQuantite}
                                onChange={(e) =>
                                  !isLocked && setLineField(l.key, "quantite", Math.max(1, safeNumber(e.target.value)))
                                }
                                disabled={isLocked}
                                style={{
                                  width: 100,
                                  textAlign: "center",
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                  background: isLocked ? "#f9fafb" : "#fff",
                                  cursor: isLocked ? "not-allowed" : "text",
                                  opacity: isLocked ? 0.7 : 1,
                                }}
                              />
                            </td>

                            <td style={{ padding: 10, textAlign: "center" }}>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={displayRemise}
                                onChange={(e) =>
                                  !isLocked && setLineField(l.key, "remise", Math.max(0, safeNumber(e.target.value)))
                                }
                                disabled={isLocked}
                                style={{
                                  width: 120,
                                  textAlign: "center",
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                  background: isLocked ? "#f9fafb" : "#fff",
                                  cursor: isLocked ? "not-allowed" : "text",
                                  opacity: isLocked ? 0.7 : 1,
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
                                  cursor: isLocked ? "not-allowed" : "pointer",
                                  opacity: isLocked ? 0.7 : 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={!!displayUrgent}
                                  onChange={(e) => !isLocked && setLineField(l.key, "urgent", !!e.target.checked)}
                                  disabled={isLocked}
                                />
                                {displayUrgent ? "URGENT" : "—"}
                              </label>
                            </td>

                            <td style={{ padding: 10, textAlign: "center" }}>
                              {st.sent ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: isLocked ? "#fef3c7" : "#DBEAFE",
                                    border: isLocked ? "1px solid #f59e0b" : "1px solid #93C5FD",
                                    fontSize: 12,
                                    marginRight: 6,
                                    fontWeight: isLocked ? 700 : 400,
                                  }}
                                  title={st.sentAt ? `Envoyé le ${formatDateSafe(st.sentAt)}` : "Envoyé"}
                                >
                                  Envoyé
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
                                  Validé
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
                                  title="Marquer la commande comme validée"
                                >
                                  Valider
                                </button>
                              )}

                              {!isLocked && (
                                <>
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
                                    Dupliquer
                                  </button>

                                  <button
                                    onClick={() => removeLine(l)}
                                    style={{
                                      background: "linear-gradient(135deg,#ef4444,#dc2626)",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 10,
                                      padding: "6px 10px",
                                      cursor: "pointer",
                                    }}
                                    title="Supprimer"
                                  >
                                    Supprimer
                                  </button>
                                </>
                              )}

                              {isLocked && <span style={{ fontSize: 12, fontWeight: 600 }}>Ligne verrouillée</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredLines.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ padding: 12, textAlign: "center", color: "#6b7280" }}>
                            Aucune ligne pour ce fournisseur (selon les filtres actuels)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
        
      </div>
    </div>
  );
}

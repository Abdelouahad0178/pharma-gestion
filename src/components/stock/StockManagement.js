// src/components/stock/StockManagement.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  where,
  onSnapshot,
  Timestamp,
  runTransaction,
  increment,
} from "firebase/firestore";

// 🔗 Sync ventes -> stock en temps réel
import { attachRealtimeSalesSync } from "../../lib/realtimeSalesSync";

/* ======================================================
  Utils & Helpers
====================================================== */
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

const formatDateTimeSafe = (dateInput) => {
  const d = safeParseDate(dateInput);
  return d ? d.toLocaleString("fr-FR") : "";
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
  if (["stock1", "s1", "magasin1", "depot1", "principal", "primary", "p", "m1", "1"].includes(raw))
    return "stock1";
  if (["stock2", "s2", "magasin2", "depot2", "secondaire", "secondary", "s", "m2", "2"].includes(raw))
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

const isTransferOperation = (doc) => {
  return !!(
    doc?.isTransferred ||
    doc?.isStockTransfer ||
    doc?.transfert ||
    doc?.type === "transfert" ||
    doc?.type === "transfer" ||
    doc?.operationType === "transfert" ||
    doc?.operationType === "transfer" ||
    (doc?.note &&
      (String(doc.note).toLowerCase().includes("transfert") ||
        String(doc.note).toLowerCase().includes("transfer") ||
        (String(doc.note).toLowerCase().includes("stock1") &&
          String(doc.note).toLowerCase().includes("stock2"))))
  );
};

/* ======================================================
  Audio (bips)
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
  Composant StockManagement
====================================================== */
export default function StockManagement() {
  const { user, societeId, loading } = useUserRole();
  const [waiting, setWaiting] = useState(true);
  const { ok: beepOk, err: beepErr } = useBeeps();

  const [lots, setLots] = useState([]);
  const [achats, setAchats] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [selectedLotId, setSelectedLotId] = useState(null);

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

  // Historique retours/avoirs
  const [showRetourHistory, setShowRetourHistory] = useState(false);
  const [retourHistoryRows, setRetourHistoryRows] = useState([]);
  const [historyLot, setHistoryLot] = useState(null);

  // Vue globale des retours
  const [showRetoursGlobaux, setShowRetoursGlobaux] = useState(false);
  const [filterRetourStatut, setFilterRetourStatut] = useState("tous");
  // 🆕 Filtres de date
  const [filterDateDebut, setFilterDateDebut] = useState("");
  const [filterDateFin, setFilterDateFin] = useState("");

  const [showScanner, setShowScanner] = useState(false);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFromLotId, setTransferFromLotId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const achatsListenerRef = useRef(null);
  const stockListenerRef = useRef(null);
  const salesSyncDetachRef = useRef(null);

  const hasFilter = normalize(search).length > 0;

  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  /* ================== SYNCHRONISATION VENTES → STOCK (TEMPS RÉEL) ================== */

  useEffect(() => {
    if (!societeId || !user) {
      if (salesSyncDetachRef.current) {
        salesSyncDetachRef.current();
        salesSyncDetachRef.current = null;
      }
      return;
    }
    if (salesSyncDetachRef.current) return;

    salesSyncDetachRef.current = attachRealtimeSalesSync(db, {
      societeId,
      user,
      enabled: true,
    });

    return () => {
      if (salesSyncDetachRef.current) {
        salesSyncDetachRef.current();
        salesSyncDetachRef.current = null;
      }
    };
  }, [societeId, user?.uid]);

  /* ================== SYNCHRONISATION ACHATS → STOCK ================== */

  const setupAchatsListener = useCallback(() => {
    if (!societeId || achatsListenerRef.current) return;

    achatsListenerRef.current = onSnapshot(
      query(collection(db, "societe", societeId, "achats"), orderBy("timestamp", "desc")),
      (snapshot) => {
        const achatsData = [];
        const changes = snapshot.docChanges();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (Array.isArray(data.articles) && data.articles.some((a) => (a?.commandee?.quantite || 0) > 0)) {
            achatsData.push({ id: docSnap.id, ...data });
          }
        });

        setAchats(achatsData);

        changes.forEach((change) => {
          if (change.type === "added" || change.type === "modified") {
            const achatData = { id: change.doc.id, ...change.doc.data() };
            syncStockFromAchat(achatData);
          }
        });

        setLastSyncTime(new Date());
      },
      (err) => {
        console.error("Erreur listener achats:", err);
        setError("Erreur de synchronisation avec les achats");
      }
    );
  }, [societeId]);

  const setupStockListener = useCallback(() => {
    if (!societeId || stockListenerRef.current) return;

    stockListenerRef.current = onSnapshot(
      query(collection(db, "societe", societeId, "stock_entries"), orderBy("nom")),
      (snapshot) => {
        const stockData = [];
        snapshot.forEach((dc) => {
          const data = dc.data();
          const s1 = Math.max(0, safeNumber(data.stock1));
          const s2 = Math.max(0, safeNumber(data.stock2));
          const q = s1 + s2;
          stockData.push({ id: dc.id, ...data, quantite: q, stock1: s1, stock2: s2 });
        });
        setLots(stockData);
        setLastSyncTime(new Date());
      },
      (err) => {
        console.error("Erreur listener stock:", err);
        setError("Erreur de synchronisation du stock");
      }
    );
  }, [societeId]);

  const computeNumeroLotFallback = (achatId, produit) => {
    const base = `${String(produit || "").trim()}_${String(achatId || "").slice(-6)}`;
    return `LOT_${base.replace(/[^A-Za-z0-9_]/g, "").toUpperCase()}`;
  };

  const syncStockFromAchat = useCallback(
    async (achatData) => {
      if (!societeId || !user || !achatData?.articles?.length) return;
      if (achatData.statutReception !== "reçu") return;
      if (isTransferOperation(achatData)) return;

      try {
        setIsSyncing(true);
        const isStock1 = pickDocStock(achatData) === "stock1";

        for (const article of achatData.articles) {
          const recu = article?.recu || {};
          const commandee = article?.commandee || {};
          const nom = article.produit || "";
          const qte = Number(recu.quantite || commandee.quantite || 0);
          if (qte <= 0) continue;

          const pA = Number(
            recu.prixUnitaire || recu.prixAchat || commandee.prixUnitaire || commandee.prixAchat || 0
          );
          const pV = Number(recu.prixVente || commandee.prixVente || 0);
          const numeroLot =
            recu.numeroLot || commandee.numeroLot || computeNumeroLotFallback(achatData.id, nom);
          const numeroArticle =
            recu.numeroArticle || recu.codeBarre || commandee.numeroArticle || commandee.codeBarre || null;
          const codeBarre =
            recu.codeBarre || recu.numeroArticle || commandee.codeBarre || commandee.numeroArticle || null;
          const dateP = recu.datePeremption
            ? Timestamp.fromDate(new Date(recu.datePeremption))
            : commandee.datePeremption
            ? Timestamp.fromDate(new Date(commandee.datePeremption))
            : null;

          let existingSnap;
          if (numeroLot) {
            existingSnap = await getDocs(
              query(
                collection(db, "societe", societeId, "stock_entries"),
                where("achatId", "==", achatData.id),
                where("nom", "==", nom),
                where("numeroLot", "==", numeroLot)
              )
            );
          } else {
            existingSnap = await getDocs(
              query(
                collection(db, "societe", societeId, "stock_entries"),
                where("achatId", "==", achatData.id),
                where("nom", "==", nom)
              )
            );
          }

          if (existingSnap.empty) {
            await addDoc(collection(db, "societe", societeId, "stock_entries"), {
              nom,
              numeroLot,
              fournisseur: recu.fournisseurArticle || achatData.fournisseur || "",
              quantite: qte,
              stock1: isStock1 ? qte : 0,
              stock2: isStock1 ? 0 : qte,
              quantiteInitiale: qte,
              prixAchat: pA,
              prixVente: pV,
              datePeremption: dateP,
              numeroArticle,
              codeBarre,
              dateAchat: achatData.date || Timestamp.now(),
              statut: "actif",
              createdAt: Timestamp.now(),
              createdBy: user.email || user.uid,
              creePar: user.uid,
              creeParEmail: user.email,
              updatedAt: Timestamp.now(),
              updatedBy: user.email || user.uid,
              societeId,
              achatId: achatData.id,
              stock: pickDocStock(achatData),
              stockSource: pickDocStock(achatData),
              syncedFromAchat: true,
              lastSyncAt: Timestamp.now(),
            });
          } else {
            for (const d of existingSnap.docs) {
              const cur = d.data();
              const prevInit = Number(cur.quantiteInitiale || 0);
              const delta = qte - prevInit;

              const metaUpdates = {
                prixAchat: pA,
                prixVente: pV,
                datePeremption: dateP,
                numeroArticle,
                codeBarre,
                updatedAt: Timestamp.now(),
                updatedBy: user.email || user.uid,
                lastSyncAt: Timestamp.now(),
              };

              if (delta > 0) {
                await updateDoc(d.ref, {
                  ...metaUpdates,
                  quantiteInitiale: qte,
                  quantite: increment(delta),
                  ...(isStock1 ? { stock1: increment(delta) } : { stock2: increment(delta) }),
                });
              } else if (delta === 0) {
                await updateDoc(d.ref, { ...metaUpdates });
              } else {
                await updateDoc(d.ref, { ...metaUpdates });
              }
            }
          }
        }
      } catch (e) {
        console.error("Erreur sync stock depuis achat:", e);
      } finally {
        setIsSyncing(false);
      }
    },
    [societeId, user?.uid]
  );

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

  useEffect(() => {
    if (!waiting) {
      setupAchatsListener();
      setupStockListener();
      fetchFournisseurs();
    }

    return () => {
      if (achatsListenerRef.current) {
        achatsListenerRef.current();
        achatsListenerRef.current = null;
      }
      if (stockListenerRef.current) {
        stockListenerRef.current();
        stockListenerRef.current = null;
      }
    };
  }, [waiting, setupAchatsListener, setupStockListener, fetchFournisseurs]);

  /* ================== TRANSFERTS ================== */

  const transferEligibleLots = lots.filter((lot) => safeNumber(lot.stock1, 0) > 0);

  const resetTransferForm = () => {
    setTransferFromLotId("");
    setTransferQty("");
    setTransferNote("");
  };

  const syncAchatFromStockTransfer = useCallback(
    async (originalLotId, newLotId, transferData) => {
      if (!societeId || !user) return;

      try {
        const originalLot = lots.find((l) => l.id === originalLotId);
        if (!originalLot?.achatId) return;

        const achatRef = doc(db, "societe", societeId, "achats", originalLot.achatId);
        const achatSnap = await getDoc(achatRef);
        if (!achatSnap.exists()) return;

        const achatData = achatSnap.data();

        const articleTransfere = {
          produit: originalLot.nom,
          commandee: {
            quantite: transferData.quantite,
            prixUnitaire: originalLot.prixAchat || 0,
            prixVente: originalLot.prixVente || 0,
            datePeremption: originalLot.datePeremption,
            numeroLot: (originalLot.numeroLot || "LOT") + "-S2",
            numeroArticle: originalLot.numeroArticle || originalLot.codeBarre || "",
            fournisseurArticle: originalLot.fournisseur || "",
            stock: "stock2",
            stockSource: "stock2",
          },
          recu: {
            quantite: transferData.quantite,
            prixUnitaire: originalLot.prixAchat || 0,
            prixVente: originalLot.prixVente || 0,
            datePeremption: originalLot.datePeremption,
            numeroLot: (originalLot.numeroLot || "LOT") + "-S2",
            numeroArticle: originalLot.numeroArticle || originalLot.codeBarre || "",
            fournisseurArticle: originalLot.fournisseur || "",
            stock: "stock2",
            stockSource: "stock2",
          },
        };

        const nouveauBonRef = await addDoc(collection(db, "societe", societeId, "achats"), {
          fournisseur: (achatData.fournisseur || "") + " [TRANSFERT STOCK]",
          date: Timestamp.now(),
          timestamp: Timestamp.now(),
          statutPaiement: achatData.statutPaiement || "payé",
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
          isTransferred: true,
          isStockTransfer: true,
          type: "transfert",
          operationType: "transfert",
          originalAchatId: originalLot.achatId,
          originalLotId: originalLotId,
          transferNote: transferData.note || "Stock1 → Stock2",
          transferDate: Timestamp.now(),
          syncedFromStock: true,
        });

        const updatedArticles = (achatData.articles || []).map((a) => {
          if (a.produit === originalLot.nom && a.recu?.numeroLot === originalLot.numeroLot) {
            return {
              ...a,
              recu: { ...a.recu, quantite: Math.max(0, (a.recu?.quantite || 0) - transferData.quantite) },
            };
          }
          return a;
        });

        await updateDoc(achatRef, {
          articles: updatedArticles,
          lastTransferDate: Timestamp.now(),
          lastTransferNote: transferData.note || "Stock1 → Stock2",
          lastTransferQuantity: transferData.quantite,
          transferredToAchatId: nouveauBonRef.id,
        });
      } catch (e) {
        console.error("Erreur sync achat depuis transfert stock:", e);
      }
    },
    [societeId, user, lots]
  );

  const handleTransferWithNewLot = useCallback(async () => {
    try {
      if (!societeId || !user) {
        setError("Session invalide.");
        beepErr();
        return;
      }

      const lotOriginal = lots.find((l) => l.id === transferFromLotId);
      if (!lotOriginal) {
        setError("Lot original introuvable.");
        beepErr();
        return;
      }

      const qtyToTransfer = Number(transferQty);
      const currentStock1 = Number(lotOriginal.stock1 || 0);

      if (!qtyToTransfer || qtyToTransfer <= 0) {
        setError("Quantité invalide.");
        beepErr();
        return;
      }
      if (qtyToTransfer > currentStock1) {
        setError(`Quantité > stock1 disponible (${currentStock1}).`);
        beepErr();
        return;
      }

      setError("");
      setIsSyncing(true);

      const nouveauLotData = {
        nom: lotOriginal.nom + " [TRANSFERT S2]",
        numeroLot: (lotOriginal.numeroLot || "LOT") + "-S2",
        fournisseur: lotOriginal.fournisseur || "",
        quantite: qtyToTransfer,
        stock1: 0,
        stock2: qtyToTransfer,
        quantiteInitiale: qtyToTransfer,
        prixAchat: lotOriginal.prixAchat || 0,
        prixVente: lotOriginal.prixVente || 0,
        datePeremption: lotOriginal.datePeremption || null,
        codeBarre: lotOriginal.codeBarre || null,
        statut: "actif",
        createdAt: Timestamp.now(),
        createdBy: user.email || user.uid,
        creePar: user.uid,
        creeParEmail: user.email,
        creeLe: Timestamp.now(),
        updatedAt: Timestamp.now(),
        updatedBy: user.email || user.uid,
        societeId,
        isTransferred: true,
        originalLotId: transferFromLotId,
        transferNote: transferNote || "Stock1 → Stock2",
        transferDate: Timestamp.now(),
        transferredBy: user.uid,
        transferredByEmail: user.email,
        stockSource: "stock1",
        stockDestination: "stock2",
        achatId: lotOriginal.achatId || null,
        syncedFromStock: true,
        lastSyncAt: Timestamp.now(),
      };

      const nouveauLotRef = await addDoc(collection(db, "societe", societeId, "stock_entries"), nouveauLotData);

      const newStock1 = currentStock1 - qtyToTransfer;
      const newQuantiteTotal = newStock1 + safeNumber(lotOriginal.stock2, 0);

      await updateDoc(doc(db, "societe", societeId, "stock_entries", transferFromLotId), {
        stock1: newStock1,
        quantite: newQuantiteTotal,
        lastTransferDate: Timestamp.now(),
        lastTransferNote: transferNote || "Stock1 → Stock2",
        lastTransferQuantity: qtyToTransfer,
        transferredToLotId: nouveauLotRef.id,
        updatedAt: Timestamp.now(),
        updatedBy: user.email || user.uid,
        lastSyncAt: Timestamp.now(),
      });

      await syncAchatFromStockTransfer(transferFromLotId, nouveauLotRef.id, {
        quantite: qtyToTransfer,
        note: transferNote || "Stock1 → Stock2",
      });

      setSuccess(`Transfert réussi : ${qtyToTransfer} → Stock2. Nouveau lot créé.`);
      beepOk();
      resetTransferForm();
      setShowTransferModal(false);
      setTimeout(() => setSuccess(""), 1500);
    } catch (e) {
      console.error("handleTransferWithNewLot:", e);
      setError("Erreur lors du transfert.");
      beepErr();
    } finally {
      setIsSyncing(false);
    }
  }, [
    societeId,
    user,
    lots,
    transferFromLotId,
    transferQty,
    transferNote,
    syncAchatFromStockTransfer,
    beepOk,
    beepErr,
  ]);

  /* ================== RETOURS/AVOIRS ================== */

  const computeStockAfterReturn = (lot) => {
    const R = Math.max(0, safeNumber(lot.retourQuantite, 0));
    const S1 = Math.max(0, safeNumber(lot.stock1, 0));
    const S2 = Math.max(0, safeNumber(lot.stock2, 0));
    const takeFromS1 = Math.min(S1, R);
    const remaining = Math.max(0, R - takeFromS1);
    const takeFromS2 = Math.min(S2, remaining);
    const newS1 = S1 - takeFromS1;
    const newS2 = S2 - takeFromS2;
    const newQ = newS1 + newS2;
    return { newQ, newS1, newS2, takeFromS1, takeFromS2 };
  };

  const requestReturn = useCallback(
    async (lot) => {
      if (!user || !societeId) return;
      const q = Number(window.prompt("Nombre d'unités à retourner :", 0));
      if (!Number.isFinite(q) || q <= 0 || q > safeNumber(lot.stock1 + lot.stock2, 0)) {
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
      const cause = window.prompt("Cause du retour/avoir :", "");
      try {
        await updateDoc(doc(db, "societe", societeId, "stock_entries", lot.id), {
          retourEnCours: true,
          retourValide: false,
          avoirRegle: false,
          retourQuantite: q,
          retourCause: cause || "",
          avoirMontant: montant,
          retourAt: Timestamp.now(),
          retourValideAt: null,
          retourClotureAt: null,
          syncBlocked: true,
          syncBlockedReason: "retour_en_cours",
          lastSyncAt: Timestamp.now(),
        });
        try {
          await addDoc(collection(db, "societe", societeId, "stock_entries", lot.id, "retours_avoir"), {
            step: "demande",
            lotId: lot.id,
            produit: lot.nom || lot.produit || "",
            numeroLot: lot.numeroLot || "",
            quantite: q,
            montant: montant,
            cause: cause || "",
            createdAt: Timestamp.now(),
            createdBy: user.email || user.uid,
            stockAvant: {
              quantite: safeNumber(lot.quantite, 0),
              stock1: safeNumber(lot.stock1, 0),
              stock2: safeNumber(lot.stock2, 0),
            },
          });
        } catch (e) {
          console.warn("Journal retour/avoir (demande) impossible:", e);
        }

        setSuccess("Retour/Avoir demandé");
        beepOk();
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Erreur lors de la demande de retour.");
        beepErr();
      }
    },
    [societeId, user, beepOk, beepErr]
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
          lastSyncAt: Timestamp.now(),
        });
        try {
          await addDoc(collection(db, "societe", societeId, "stock_entries", lot.id, "retours_avoir"), {
            step: "validation",
            lotId: lot.id,
            produit: lot.nom || lot.produit || "",
            numeroLot: lot.numeroLot || "",
            quantite: safeNumber(lot.retourQuantite, 0),
            montant: safeNumber(lot.avoirMontant, 0),
            cause: lot.retourCause || "",
            createdAt: Timestamp.now(),
            createdBy: user.email || user.uid,
          });
        } catch (e) {
          console.warn("Journal retour/avoir (validation) impossible:", e);
        }

        setSuccess("Retour validé (en attente de règlement)");
        beepOk();
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Impossible de valider le retour.");
        beepErr();
      }
    },
    [societeId, user, beepOk, beepErr]
  );

  const approveReturn = useCallback(
    async (lot) => {
      if (!user || !societeId) return;
      if (!lot.retourValide || safeNumber(lot.retourQuantite, 0) <= 0) {
        setError("Le retour doit être validé avant règlement.");
        beepErr();
        return;
      }
      if (!window.confirm("Confirmer : l'avoir est réglé ? Le stock sera diminué automatiquement.")) return;

      const { newQ, newS1, newS2, takeFromS1, takeFromS2 } = computeStockAfterReturn(lot);

      try {
        setIsSyncing(true);

        await runTransaction(db, async (transaction) => {
          const lotRef = doc(db, "societe", societeId, "stock_entries", lot.id);
          const lotSnap = await transaction.get(lotRef);
          if (!lotSnap.exists()) throw new Error("Lot introuvable");

          let achatSnap = null;
          let achatRef = null;
          if (lot.achatId) {
            achatRef = doc(db, "societe", societeId, "achats", lot.achatId);
            achatSnap = await transaction.get(achatRef);
          }

          const qtyReturned = safeNumber(lot.retourQuantite, 0);

          transaction.update(lotRef, {
            avoirRegle: true,
            retourEnCours: false,
            retourClotureAt: Timestamp.now(),
            quantite: newQ,
            stock1: newS1,
            stock2: newS2,
            syncBlocked: false,
            syncBlockedReason: null,
            manuallyAdjusted: true,
            manualAdjustmentReason: `Retour/Avoir réglé: -${takeFromS1}(S1) -${takeFromS2}(S2)`,
            lastManualAdjustment: Timestamp.now(),
            lastSyncAt: Timestamp.now(),
          });

          if (achatSnap && achatSnap.exists()) {
            transaction.update(achatRef, {
              lastReturn: {
                quantity: qtyReturned,
                date: Timestamp.now(),
                settled: true,
                lotId: lot.id,
                productName: lot.nom,
              },
              syncedFromStock: true,
            });
          }
        });

        try {
          await addDoc(collection(db, "societe", societeId, "stock_entries", lot.id, "retours_avoir"), {
            step: "avoir_regle",
            lotId: lot.id,
            produit: lot.nom || lot.produit || "",
            numeroLot: lot.numeroLot || "",
            quantite: safeNumber(lot.retourQuantite, 0),
            montant: safeNumber(lot.avoirMontant, 0),
            cause: lot.retourCause || "",
            createdAt: Timestamp.now(),
            createdBy: user.email || user.uid,
          });
        } catch (e) {
          console.warn("Journal retour/avoir (avoir_regle) impossible:", e);
        }

        setSuccess("Avoir réglé — stock ajusté (+ journal Achats)");
        beepOk();
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Impossible de clôturer le retour: " + e.message);
        beepErr();
      } finally {
        setIsSyncing(false);
      }
    },
    [societeId, user, beepOk, beepErr]
  );

  const validateAndSettleReturn = useCallback(
    async (lot) => {
      if (!user || !societeId) return;
      if (!lot.retourEnCours || safeNumber(lot.retourQuantite, 0) <= 0) {
        setError("Aucun retour en cours à valider.");
        beepErr();
        return;
      }
      if (
        !window.confirm(
          `Valider le retour (Qté: ${safeNumber(lot.retourQuantite)}) et déduire immédiatement du stock ?`
        )
      )
        return;

      const { newQ, newS1, newS2, takeFromS1, takeFromS2 } = computeStockAfterReturn(lot);

      try {
        setIsSyncing(true);

        await runTransaction(db, async (transaction) => {
          const lotRef = doc(db, "societe", societeId, "stock_entries", lot.id);
          const lotSnap = await transaction.get(lotRef);
          if (!lotSnap.exists()) throw new Error("Lot introuvable");

          let achatSnap = null;
          let achatRef = null;
          if (lot.achatId) {
            achatRef = doc(db, "societe", societeId, "achats", lot.achatId);
            achatSnap = await transaction.get(achatRef);
          }

          const qtyReturned = safeNumber(lot.retourQuantite, 0);

          transaction.update(lotRef, {
            retourValide: true,
            retourValideAt: Timestamp.now(),
            avoirRegle: true,
            retourEnCours: false,
            retourClotureAt: Timestamp.now(),
            quantite: newQ,
            stock1: newS1,
            stock2: newS2,
            syncBlocked: false,
            syncBlockedReason: null,
            manuallyAdjusted: true,
            manualAdjustmentReason: `Retour/Avoir immédiat: -${takeFromS1}(S1) -${takeFromS2}(S2)`,
            lastManualAdjustment: Timestamp.now(),
            lastSyncAt: Timestamp.now(),
          });

          if (achatSnap && achatSnap.exists()) {
            transaction.update(achatRef, {
              lastReturn: {
                quantity: qtyReturned,
                date: Timestamp.now(),
                settled: true,
                immediate: true,
                lotId: lot.id,
                productName: lot.nom,
              },
              syncedFromStock: true,
            });
          }
        });

        try {
          await addDoc(collection(db, "societe", societeId, "stock_entries", lot.id, "retours_avoir"), {
            step: "validation_et_reglement",
            lotId: lot.id,
            produit: lot.nom || lot.produit || "",
            numeroLot: lot.numeroLot || "",
            quantite: safeNumber(lot.retourQuantite, 0),
            montant: safeNumber(lot.avoirMontant, 0),
            cause: lot.retourCause || "",
            createdAt: Timestamp.now(),
            createdBy: user.email || user.uid,
          });
        } catch (e) {
          console.warn("Journal retour/avoir (validation_et_reglement) impossible:", e);
        }

        setSuccess("Retour validé + stock ajusté (+ journal Achats)");
        beepOk();
        setTimeout(() => setSuccess(""), 1500);
      } catch (e) {
        console.error(e);
        setError("Impossible de valider et d'ajuster le stock: " + e.message);
        beepErr();
      } finally {
        setIsSyncing(false);
      }
    },
    [societeId, user, beepOk, beepErr]
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
          lastSyncAt: Timestamp.now(),
        });
        try {
          await addDoc(collection(db, "societe", societeId, "stock_entries", lot.id, "retours_avoir"), {
            step: "annulation",
            lotId: lot.id,
            produit: lot.nom || lot.produit || "",
            numeroLot: lot.numeroLot || "",
            quantite: safeNumber(lot.retourQuantite, 0) || null,
            montant: safeNumber(lot.avoirMontant, 0) || null,
            cause: lot.retourCause || "",
            createdAt: Timestamp.now(),
            createdBy: user.email || user.uid,
          });
        } catch (e) {
          console.warn("Journal retour/avoir (annulation) impossible:", e);
        }

        setSuccess("Retour/Avoir annulé");
        beepOk();
        setTimeout(() => setSuccess(""), 1200);
      } catch (e) {
        console.error(e);
        setError("Impossible d'annuler le retour.");
        beepErr();
      }
    },
    [societeId, user, beepOk, beepErr]
  );

  /* ================== VUE GLOBALE DES RETOURS AVEC FILTRES ================== */

  const lotsAvecRetours = useMemo(() => {
    let filteredLots = lots.filter((lot) => {
      // Filtre par statut
      if (filterRetourStatut === "tous") {
        if (!(lot.retourEnCours || lot.retourValide || lot.avoirRegle)) return false;
      } else if (filterRetourStatut === "demandes") {
        if (!(lot.retourEnCours && !lot.retourValide)) return false;
      } else if (filterRetourStatut === "valides") {
        if (!(lot.retourValide && !lot.avoirRegle)) return false;
      } else if (filterRetourStatut === "regles") {
        if (!lot.avoirRegle) return false;
      }

      // 🆕 Filtre par date
      if (filterDateDebut || filterDateFin) {
        const retourDate = safeParseDate(lot.retourAt);
        if (!retourDate) return false;

        if (filterDateDebut) {
          const dateDebut = new Date(filterDateDebut);
          dateDebut.setHours(0, 0, 0, 0);
          if (retourDate < dateDebut) return false;
        }

        if (filterDateFin) {
          const dateFin = new Date(filterDateFin);
          dateFin.setHours(23, 59, 59, 999);
          if (retourDate > dateFin) return false;
        }
      }

      return true;
    });

    return filteredLots;
  }, [lots, filterRetourStatut, filterDateDebut, filterDateFin]);

  const statsRetours = useMemo(() => {
    const demandes = lots.filter((l) => l.retourEnCours && !l.retourValide).length;
    const valides = lots.filter((l) => l.retourValide && !l.avoirRegle).length;
    const regles = lots.filter((l) => l.avoirRegle).length;
    const total = demandes + valides + regles;

    const montantTotal = lots
      .filter((l) => l.retourEnCours || l.retourValide || l.avoirRegle)
      .reduce((sum, l) => sum + safeNumber(l.avoirMontant, 0), 0);

    const quantiteTotal = lots
      .filter((l) => l.retourEnCours || l.retourValide || l.avoirRegle)
      .reduce((sum, l) => sum + safeNumber(l.retourQuantite, 0), 0);

    return { demandes, valides, regles, total, montantTotal, quantiteTotal };
  }, [lots]);

  const resetFiltersDate = () => {
    setFilterDateDebut("");
    setFilterDateFin("");
  };

  /* ================== FORMULAIRE ================== */

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
    const s1 = Math.max(0, safeNumber(lot.stock1));
    const s2 = Math.max(0, safeNumber(lot.stock2));
    const q = s1 + s2;
    setQuantite(q);
    setStock1(s1);
    setStock2(s2);
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
      const { S1, S2 } = keepSplitInvariant(quantite, stock1);
      try {
        const payload = {
          nom: nom.trim(),
          numeroLot: numeroLot.trim(),
          fournisseur: fournisseur.trim() || null,
          quantite: S1 + S2,
          stock1: S1,
          stock2: S2,
          prixAchat: safeNumber(prixAchat),
          prixVente: safeNumber(prixVente),
          datePeremption: datePeremption ? Timestamp.fromDate(new Date(datePeremption)) : null,
          codeBarre: codeBarre ? String(codeBarre).trim() : null,
          updatedAt: Timestamp.now(),
          updatedBy: user.email || user.uid,
          lastSyncAt: Timestamp.now(),
          syncedFromStock: true,
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
        setTimeout(() => setSuccess(""), 1500);
      } catch (err) {
        console.error(err);
        setError("Erreur lors de l'enregistrement du lot.");
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
        if (lot.achatId) {
          const achatRef = doc(db, "societe", societeId, "achats", lot.achatId);
          const achatSnap = await getDoc(achatRef);
          if (achatSnap.exists()) {
            const achatData = achatSnap.data();
            const updatedArticles = (achatData.articles || []).filter(
              (art) => !(art.produit === lot.nom && art.recu?.numeroLot === lot.numeroLot)
            );
            await updateDoc(achatRef, {
              articles: updatedArticles,
              syncedFromStock: true,
              lastStockDeletion: Timestamp.now(),
            });
          }
        }

        await deleteDoc(doc(db, "societe", societeId, "stock_entries", lot.id));
        setSuccess("Lot supprimé (+ journal achat)");
        beepOk();
        setTimeout(() => setSuccess(""), 1200);
      } catch (err) {
        console.error(err);
        setError("Erreur lors de la suppression du lot.");
        beepErr();
      }
    },
    [user, societeId, beepOk, beepErr]
  );

  /* ================== SCANNER ================== */

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

  /* ================== FILTRES ================== */

  const lotsFiltres = useMemo(() => {
    const list = Array.isArray(lots) ? lots : [];
    const s = normalize(search);
    if (!s) return list;
    return list.filter((lot) => {
      const nomL = normalize(lot.nom);
      const nlot = normalize(lot.numeroLot);
      const fr = normalize(lot.fournisseur);
      const cb = normalize(lot.codeBarre);
      return nomL.includes(s) || nlot.includes(s) || fr.includes(s) || cb.includes(s);
    });
  }, [lots, search]);

  const openRetourHistory = useCallback(
    async (lot) => {
      try {
        if (!societeId) return;
        const colRef = collection(db, "societe", societeId, "stock_entries", lot.id, "retours_avoir");
        const snap = await getDocs(query(colRef, orderBy("createdAt", "desc")));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRetourHistoryRows(rows);
        setHistoryLot(lot);
        setShowRetourHistory(true);
      } catch (e) {
        console.error(e);
        setError("Impossible de charger l'historique de retour/avoir.");
        beepErr();
      }
    },
    [societeId, beepErr]
  );

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
              Gestion du Stock
            </h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
              Synchronisation automatique Achats ↔ Stock ↔ Ventes
            </p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
              {lastSyncTime && (
                <div style={{ fontSize: 12, color: "#059669" }}>
                  {isSyncing
                    ? "Synchronisation en cours..."
                    : `Dernière sync: ${lastSyncTime.toLocaleTimeString("fr-FR")}`}
                </div>
              )}
              <span
                title="Chaque vente impacte le stock instantanément"
                style={{
                  fontSize: 12,
                  color: "#065f46",
                  background: "#d1fae5",
                  padding: "4px 8px",
                  borderRadius: 8,
                  fontWeight: 700,
                }}
              >
                Sync ventes: temps réel ✓
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedLotId(null);
              }}
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
              onClick={() => setShowRetoursGlobaux(!showRetoursGlobaux)}
              style={{
                background: showRetoursGlobaux
                  ? "linear-gradient(135deg,#dc2626,#b91c1c)"
                  : "linear-gradient(135deg,#fb7185,#f43f5e)",
                color: "#ffffff",
                border: "2px solid transparent",
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 700,
                fontSize: "16px",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(220, 38, 38, 0.3)",
                transition: "all 0.2s ease-in-out",
                minWidth: "200px",
                whiteSpace: "nowrap",
                textShadow: "0 1px 2px rgba(0,0,0,0.2)",
                position: "relative",
              }}
            >
              {showRetoursGlobaux ? "Masquer retours" : "Voir tous les retours"}
              {statsRetours.total > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    background: "#fef3c7",
                    color: "#92400e",
                    borderRadius: "50%",
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    border: "2px solid #fff",
                  }}
                >
                  {statsRetours.total}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              style={{
                background: "linear-gradient(135deg,#1e40af,#1d4ed8)",
                color: "#ffffff",
                border: "2px solid transparent",
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 700,
                fontSize: "16px",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(30, 64, 175, 0.3)",
                transition: "all 0.2s ease-in-out",
                minWidth: "200px",
                whiteSpace: "nowrap",
                textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            >
              + Ajouter article
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

      {/* VUE GLOBALE DES RETOURS */}
      {showRetoursGlobaux && (
        <div
          style={{
            background: "rgba(255,255,255,.95)",
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,.05)",
            border: "2px solid #FED7AA",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 8px 0", fontWeight: 800, color: "#c2410c", fontSize: 24 }}>
              📦 Articles Retournés
            </h2>
            <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
              Vue d'ensemble des retours et avoirs en cours
            </p>
          </div>

          {/* Statistiques */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
            <div
              style={{
                background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                padding: 16,
                borderRadius: 12,
                border: "2px solid #fcd34d",
              }}
            >
              <div style={{ fontSize: 14, color: "#92400e", fontWeight: 600 }}>Total retours</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#b45309" }}>{statsRetours.total}</div>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #fed7aa, #fdba74)",
                padding: 16,
                borderRadius: 12,
                border: "2px solid #fb923c",
              }}
            >
              <div style={{ fontSize: 14, color: "#9a3412", fontWeight: 600 }}>En demande</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#c2410c" }}>{statsRetours.demandes}</div>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #bfdbfe, #93c5fd)",
                padding: 16,
                borderRadius: 12,
                border: "2px solid #60a5fa",
              }}
            >
              <div style={{ fontSize: 14, color: "#1e3a8a", fontWeight: 600 }}>Validés</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#1e40af" }}>{statsRetours.valides}</div>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #d1fae5, #a7f3d0)",
                padding: 16,
                borderRadius: 12,
                border: "2px solid #6ee7b7",
              }}
            >
              <div style={{ fontSize: 14, color: "#065f46", fontWeight: 600 }}>Réglés</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#047857" }}>{statsRetours.regles}</div>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
                padding: 16,
                borderRadius: 12,
                border: "2px solid #a5b4fc",
              }}
            >
              <div style={{ fontSize: 14, color: "#3730a3", fontWeight: 600 }}>Quantité totale</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#4338ca" }}>{statsRetours.quantiteTotal}</div>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #fce7f3, #fbcfe8)",
                padding: 16,
                borderRadius: 12,
                border: "2px solid #f9a8d4",
              }}
            >
              <div style={{ fontSize: 14, color: "#831843", fontWeight: 600 }}>Montant total</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#9f1239" }}>
                {statsRetours.montantTotal.toFixed(2)} DH
              </div>
            </div>
          </div>

          {/* 🆕 Filtres de date */}
          <div
            style={{
              background: "#f9fafb",
              padding: 16,
              borderRadius: 12,
              marginBottom: 16,
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14, color: "#374151" }}>
                  📅 Date de début
                </label>
                <input
                  type="date"
                  value={filterDateDebut}
                  onChange={(e) => setFilterDateDebut(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "2px solid #e5e7eb",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14, color: "#374151" }}>
                  📅 Date de fin
                </label>
                <input
                  type="date"
                  value={filterDateFin}
                  onChange={(e) => setFilterDateFin(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "2px solid #e5e7eb",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>
              <button
                onClick={resetFiltersDate}
                disabled={!filterDateDebut && !filterDateFin}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: filterDateDebut || filterDateFin ? "#fff" : "#f3f4f6",
                  color: filterDateDebut || filterDateFin ? "#374151" : "#9ca3af",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: filterDateDebut || filterDateFin ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                🔄 Réinitialiser dates
              </button>
            </div>
            {(filterDateDebut || filterDateFin) && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  background: "#dbeafe",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#1e40af",
                }}
              >
                <strong>Filtrage actif :</strong>{" "}
                {filterDateDebut && `Du ${new Date(filterDateDebut).toLocaleDateString("fr-FR")}`}
                {filterDateDebut && filterDateFin && " "}
                {filterDateFin && `au ${new Date(filterDateFin).toLocaleDateString("fr-FR")}`}
              </div>
            )}
          </div>

          {/* Filtres par statut */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => setFilterRetourStatut("tous")}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: filterRetourStatut === "tous" ? "2px solid #c2410c" : "1px solid #e5e7eb",
                background: filterRetourStatut === "tous" ? "#fed7aa" : "#fff",
                color: filterRetourStatut === "tous" ? "#9a3412" : "#6b7280",
                fontWeight: filterRetourStatut === "tous" ? 700 : 500,
                cursor: "pointer",
              }}
            >
              Tous ({statsRetours.total})
            </button>
            <button
              onClick={() => setFilterRetourStatut("demandes")}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: filterRetourStatut === "demandes" ? "2px solid #fb923c" : "1px solid #e5e7eb",
                background: filterRetourStatut === "demandes" ? "#fed7aa" : "#fff",
                color: filterRetourStatut === "demandes" ? "#c2410c" : "#6b7280",
                fontWeight: filterRetourStatut === "demandes" ? 700 : 500,
                cursor: "pointer",
              }}
            >
              Demandes ({statsRetours.demandes})
            </button>
            <button
              onClick={() => setFilterRetourStatut("valides")}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: filterRetourStatut === "valides" ? "2px solid #60a5fa" : "1px solid #e5e7eb",
                background: filterRetourStatut === "valides" ? "#bfdbfe" : "#fff",
                color: filterRetourStatut === "valides" ? "#1e40af" : "#6b7280",
                fontWeight: filterRetourStatut === "valides" ? 700 : 500,
                cursor: "pointer",
              }}
            >
              Validés ({statsRetours.valides})
            </button>
            <button
              onClick={() => setFilterRetourStatut("regles")}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: filterRetourStatut === "regles" ? "2px solid #6ee7b7" : "1px solid #e5e7eb",
                background: filterRetourStatut === "regles" ? "#d1fae5" : "#fff",
                color: filterRetourStatut === "regles" ? "#047857" : "#6b7280",
                fontWeight: filterRetourStatut === "regles" ? 700 : 500,
                cursor: "pointer",
              }}
            >
              Réglés ({statsRetours.regles})
            </button>
          </div>

          {/* Tableau des retours */}
          <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #e5e7eb" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={{ padding: 12, textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>Produit</th>
                  <th style={{ padding: 12, textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>N° Lot</th>
                  <th style={{ padding: 12, textAlign: "center", borderBottom: "2px solid #e5e7eb" }}>Qté retour</th>
                  <th style={{ padding: 12, textAlign: "right", borderBottom: "2px solid #e5e7eb" }}>Montant avoir</th>
                  <th style={{ padding: 12, textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>Cause</th>
                  <th style={{ padding: 12, textAlign: "center", borderBottom: "2px solid #e5e7eb" }}>Statut</th>
                  <th style={{ padding: 12, textAlign: "center", borderBottom: "2px solid #e5e7eb" }}>Date demande</th>
                  <th style={{ padding: 12, textAlign: "center", borderBottom: "2px solid #e5e7eb", width: 320 }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {lotsAvecRetours.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                      {filterDateDebut || filterDateFin
                        ? "Aucun retour pour la période sélectionnée"
                        : "Aucun retour pour le filtre sélectionné"}
                    </td>
                  </tr>
                ) : (
                  lotsAvecRetours.map((lot, idx) => {
                    const statutBadge =
                      lot.retourEnCours && !lot.retourValide
                        ? { bg: "#fed7aa", color: "#9a3412", text: "En demande" }
                        : lot.retourValide && !lot.avoirRegle
                        ? { bg: "#bfdbfe", color: "#1e40af", text: "Validé" }
                        : lot.avoirRegle
                        ? { bg: "#d1fae5", color: "#047857", text: "Réglé" }
                        : { bg: "#f3f4f6", color: "#6b7280", text: "—" };

                    return (
                      <tr
                        key={lot.id}
                        style={{
                          background: idx % 2 ? "#fff" : "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        <td style={{ padding: 12, fontWeight: 600 }}>{lot.nom}</td>
                        <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13 }}>{lot.numeroLot}</td>
                        <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>
                          {safeNumber(lot.retourQuantite)}
                        </td>
                        <td style={{ padding: 12, textAlign: "right", fontWeight: 600 }}>
                          {safeNumber(lot.avoirMontant).toFixed(2)} DH
                        </td>
                        <td style={{ padding: 12, fontSize: 13, color: "#6b7280", maxWidth: 200 }}>
                          {lot.retourCause || "—"}
                        </td>
                        <td style={{ padding: 12, textAlign: "center" }}>
                          <span
                            style={{
                              background: statutBadge.bg,
                              color: statutBadge.color,
                              padding: "4px 12px",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            {statutBadge.text}
                          </span>
                        </td>
                        <td style={{ padding: 12, textAlign: "center", fontSize: 13 }}>
                          {formatDateTimeSafe(lot.retourAt)}
                        </td>
                        <td style={{ padding: 12 }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                            <button
                              onClick={() => openRetourHistory(lot)}
                              style={{
                                background: "#e5e7eb",
                                color: "#111827",
                                border: "none",
                                borderRadius: 8,
                                padding: "6px 10px",
                                fontSize: 13,
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Historique
                            </button>

                            {lot.retourEnCours && !lot.retourValide && (
                              <>
                                <button
                                  onClick={() => validateReturn(lot)}
                                  style={{
                                    background: "linear-gradient(135deg,#22c55e,#16a34a)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    fontSize: 13,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                  }}
                                >
                                  Valider
                                </button>
                                <button
                                  onClick={() => validateAndSettleReturn(lot)}
                                  style={{
                                    background: "linear-gradient(135deg,#34d399,#10b981)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    fontSize: 13,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                  }}
                                >
                                  Valider + Déduire
                                </button>
                                <button
                                  onClick={() => cancelReturn(lot)}
                                  style={{
                                    background: "linear-gradient(135deg,#6b7280,#4b5563)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    fontSize: 13,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                  }}
                                >
                                  Annuler
                                </button>
                              </>
                            )}

                            {lot.retourValide && !lot.avoirRegle && (
                              <button
                                onClick={() => approveReturn(lot)}
                                style={{
                                  background: "linear-gradient(135deg,#22c55e,#16a34a)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  fontSize: 13,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                }}
                              >
                                Avoir réglé
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

          {lotsAvecRetours.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "#f9fafb",
                borderRadius: 8,
                fontSize: 13,
                color: "#6b7280",
                textAlign: "center",
              }}
            >
              Affichage de <strong>{lotsAvecRetours.length}</strong> retour(s)
              {(filterDateDebut || filterDateFin) && " pour la période sélectionnée"}
            </div>
          )}
        </div>
      )}

      {/* Transferts */}
      <div
        style={{
          background: "rgba(255,255,255,.95)",
          borderRadius: 20,
          padding: 16,
          marginBottom: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,.05)",
          border: "2px solid #D1FAE5",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontWeight: 800, color: "#059669" }}>Stock1 → Stock2</h2>
          <button
            onClick={() => setShowTransferModal(!showTransferModal)}
            style={{
              background: showTransferModal ? "rgba(239,68,68,.1)" : "linear-gradient(135deg,#059669,#047857)",
              color: showTransferModal ? "#dc2626" : "#fff",
              border: showTransferModal ? "1px solid #f87171" : "none",
              borderRadius: 12,
              padding: "8px 16px",
              fontWeight: 700,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            {showTransferModal ? "Fermer" : "Créer transfert"}
          </button>
        </div>

        {showTransferModal && (
          <div
            style={{
              border: "1px solid #d1fae5",
              borderRadius: 12,
              padding: 16,
              background: "rgba(236,253,245,.5)",
            }}
          >
            <div
              style={{
                background: "rgba(252,165,165,.3)",
                border: "1px solid #fca5a5",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                color: "#7f1d1d",
                fontWeight: 600,
              }}
            >
              ⚠️ Ce transfert créera un NOUVEAU lot pour Stock2, diminuera le stock1 du lot original ET synchronisera
              avec les achats correspondants.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Lot à transférer</label>
                <select
                  value={transferFromLotId}
                  onChange={(e) => {
                    setTransferFromLotId(e.target.value);
                    setTransferQty("");
                  }}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                  }}
                >
                  <option value="">— Choisir un lot avec stock1 &gt; 0 —</option>
                  {transferEligibleLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.nom} - Lot: {lot.numeroLot} (Stock1: {lot.stock1}) {lot.achatId ? " (lié achat)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>
                  Quantité à transférer{" "}
                  {transferFromLotId && (
                    <span style={{ color: "#6b7280", fontWeight: 400 }}>
                      (max: {lots.find((l) => l.id === transferFromLotId)?.stock1 || 0})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min="1"
                  max={transferFromLotId ? lots.find((l) => l.id === transferFromLotId)?.stock1 || 0 : undefined}
                  placeholder="Quantité"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  disabled={!transferFromLotId}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    opacity: transferFromLotId ? 1 : 0.6,
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Note (optionnel)</label>
                <input
                  type="text"
                  placeholder="Note du transfert"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                <button
                  onClick={handleTransferWithNewLot}
                  disabled={!transferFromLotId || !transferQty || isSyncing}
                  style={{
                    background:
                      transferFromLotId && transferQty && !isSyncing
                        ? "linear-gradient(135deg,#059669,#047857)"
                        : "#d1d5db",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontWeight: 700,
                    cursor: transferFromLotId && transferQty && !isSyncing ? "pointer" : "not-allowed",
                    flex: 1,
                  }}
                >
                  {isSyncing ? "Sync..." : "Créer lot Stock2"}
                </button>
                <button
                  onClick={resetTransferForm}
                  disabled={isSyncing}
                  style={{
                    background: "transparent",
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: "10px 16px",
                    cursor: isSyncing ? "not-allowed" : "pointer",
                    color: "#6b7280",
                    opacity: isSyncing ? 0.6 : 1,
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            {transferFromLotId && transferQty && (
              <div style={{ marginTop: 12, padding: 8, background: "#ecfdf5", borderRadius: 8, fontSize: 14 }}>
                <strong>Aperçu :</strong> Transfert de <strong>{transferQty}</strong> unité(s) de{" "}
                <strong>{lots.find((l) => l.id === transferFromLotId)?.nom}</strong> (Lot:{" "}
                {lots.find((l) => l.id === transferFromLotId)?.numeroLot}) vers un nouveau lot Stock2.
                {lots.find((l) => l.id === transferFromLotId)?.achatId && (
                  <span style={{ color: "#059669" }}> + Synchronisation automatique avec le bon d'achat lié.</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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
          <table style={{ width: "100%", minWidth: 1200, borderCollapse: "collapse" }}>
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
                <th style={{ padding: 14, textAlign: "center" }}>Sync</th>
                <th style={{ padding: 14, textAlign: "center", width: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lotsFiltres.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                    Aucun lot
                  </td>
                </tr>
              ) : (
                lotsFiltres.map((lot, idx) => {
                  const d = safeParseDate(lot.datePeremption);
                  const expired = d && d < new Date();
                  const expSoon = d && !expired && d <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                  const qRet = safeNumber(lot.retourQuantite, 0);
                  const badgeRetour =
                    lot.retourEnCours && !lot.retourValide
                      ? `Retour/Avoir demandé (Qté: ${qRet})`
                      : lot.retourValide && !lot.avoirRegle
                      ? `Retour validé (Qté: ${qRet})`
                      : lot.avoirRegle
                      ? `Retour réglé`
                      : "";

                  const showRowActions = hasFilter && selectedLotId === lot.id;

                  const isTransferredLot = lot.isTransferred;
                  const isLinkedToAchat = !!lot.achatId;
                  const badgeTransfert = isTransferredLot ? "Lot transféré (S2)" : "";

                  return (
                    <tr
                      key={lot.id}
                      onClick={() => setSelectedLotId((prev) => (prev === lot.id ? null : lot.id))}
                      style={{
                        background:
                          selectedLotId === lot.id
                            ? "rgba(219,234,254,.5)"
                            : isTransferredLot
                            ? "rgba(220,252,231,.3)"
                            : idx % 2
                            ? "rgba(249,250,251,.6)"
                            : "white",
                        borderBottom: "1px solid #f3f4f6",
                        cursor: hasFilter ? "pointer" : "default",
                        borderLeft: isTransferredLot
                          ? "4px solid #059669"
                          : isLinkedToAchat
                          ? "4px solid #3b82f6"
                          : undefined,
                      }}
                      title={hasFilter ? "Clique pour afficher/masquer les actions" : ""}
                    >
                      <td style={{ padding: 12, fontWeight: 600 }}>
                        {lot.nom}{" "}
                        {badgeTransfert && (
                          <span
                            style={{ marginLeft: 8, fontSize: 12, color: "#059669" }}
                            title="Lot créé par transfert"
                          >
                            {badgeTransfert}
                          </span>
                        )}
                        {badgeRetour && (
                          <span style={{ marginLeft: 8, fontSize: 12 }} title="Statut retour/avoir">
                            {badgeRetour}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>{lot.numeroLot}</td>
                      <td style={{ padding: 12 }}>{lot.fournisseur || "-"}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>
                        {safeNumber(lot.stock1 + lot.stock2)}
                      </td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>
                        {safeNumber(lot.stock1)}
                      </td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>
                        {safeNumber(lot.stock2)}
                      </td>
                      <td style={{ padding: 12, textAlign: "right" }}>
                        {Number(lot.prixVente || 0).toFixed(2)} DH
                      </td>
                      <td
                        style={{
                          padding: 12,
                          textAlign: "center",
                          fontWeight: 600,
                          color: expired ? "#dc2626" : expSoon ? "#d97706" : "#065f46",
                        }}
                      >
                        {formatDateSafe(lot.datePeremption) || "-"}
                        {expired ? " ⚠️" : expSoon ? " ⏰" : ""}
                      </td>
                      <td style={{ padding: 12, fontFamily: "monospace" }}>{lot.codeBarre || "-"}</td>
                      <td style={{ padding: 12, textAlign: "center" }}>
                        {isLinkedToAchat && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#3b82f6",
                              background: "#dbeafe",
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                            title={`Lié à l'achat ${String(lot.achatId || "").slice(0, 8)}`}
                          >
                            Achat
                          </span>
                        )}
                        {lot.syncedFromStock && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#059669",
                              background: "#dcfce7",
                              padding: "2px 6px",
                              borderRadius: 4,
                              marginLeft: 4,
                            }}
                            title="Synchronisé"
                          >
                            ✅
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>
                        <div
                          style={{
                            display: showRowActions ? "flex" : "none",
                            alignItems: "center",
                            gap: 8,
                            justifyContent: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(lot);
                            }}
                            style={{
                              background: "linear-gradient(135deg,#f59e0b,#d97706)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 10,
                              padding: "8px 12px",
                              cursor: "pointer",
                            }}
                          >
                            Éditer
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(lot);
                            }}
                            style={{
                              background: "linear-gradient(135deg,#ef4444,#dc2626)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 10,
                              padding: "8px 12px",
                              cursor: "pointer",
                            }}
                          >
                            Supprimer
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              requestReturn(lot);
                            }}
                            style={{
                              background: "linear-gradient(135deg,#fb7185,#f43f5e)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 10,
                              padding: "8px 12px",
                              cursor: "pointer",
                            }}
                            title="Demander un retour/avoir (avec journal achat)"
                          >
                            Retour/Avoir
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openRetourHistory(lot);
                            }}
                            style={{
                              background: "#e5e7eb",
                              color: "#111827",
                              border: "1px solid #e5e7eb",
                              borderRadius: 10,
                              padding: "8px 12px",
                              cursor: "pointer",
                              marginLeft: 8,
                            }}
                            title="Voir l'historique détaillé des retours/avoirs pour ce lot"
                          >
                            Historique
                          </button>

                          {lot.retourEnCours && !lot.retourValide && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  validateReturn(lot);
                                }}
                                style={{
                                  background: "linear-gradient(135deg,#22c55e,#16a34a)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 10,
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                }}
                                title="Valider la demande de retour"
                              >
                                Valider
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  validateAndSettleReturn(lot);
                                }}
                                style={{
                                  background: "linear-gradient(135deg,#34d399,#10b981)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 10,
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                }}
                                title="Valider et déduire du stock + journal achat"
                              >
                                Valider + déduire
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelReturn(lot);
                                }}
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
                                Annuler
                              </button>
                            </>
                          )}

                          {lot.retourValide && !lot.avoirRegle && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                approveReturn(lot);
                              }}
                              style={{
                                background: "linear-gradient(135deg,#22c55e,#16a34a)",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "8px 12px",
                                cursor: "pointer",
                              }}
                              title="Marquer l'avoir comme réglé et diminuer le stock + journal achat"
                            >
                              Avoir réglé
                            </button>
                          )}
                        </div>
                        {!showRowActions && hasFilter && (
                          <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center" }}>(clique la ligne)</div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historique retours/avoirs */}
      {showRetourHistory && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowRetourHistory(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              width: "95%",
              maxWidth: 900,
              maxHeight: "80vh",
              overflow: "auto",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800 }}>
                Historique — {historyLot?.nom || historyLot?.produit || "Lot"} (N°: {historyLot?.numeroLot || ""})
              </h3>
              <button
                onClick={() => setShowRetourHistory(false)}
                style={{ border: "none", fontSize: 24, cursor: "pointer" }}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            {retourHistoryRows.length === 0 ? (
              <div style={{ padding: 16, background: "#f9fafb", border: "1px dashed #e5e7eb", borderRadius: 12 }}>
                Aucun événement pour ce lot.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Date</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Étape</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Qté</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Montant</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Cause</th>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {retourHistoryRows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                        {row.createdAt?.toDate
                          ? new Date(row.createdAt.toDate()).toLocaleString()
                          : row.createdAt?.seconds
                          ? new Date(row.createdAt.seconds * 1000).toLocaleString()
                          : ""}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{row.step}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{row.quantite ?? ""}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{row.montant ?? ""}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{row.cause ?? ""}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{row.createdBy ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modales */}
      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 16,
              width: 680,
              maxHeight: "61vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>{isEditing ? "Modifier le lot" : "Ajouter un lot"}</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Nom *</label>
                  <input
                    type="text"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    required
                    style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>N° lot *</label>
                  <input
                    type="text"
                    value={numeroLot}
                    onChange={(e) => setNumeroLot(e.target.value)}
                    required
                    style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Fournisseur</label>
                  <input
                    type="text"
                    value={fournisseur}
                    onChange={(e) => setFournisseur(e.target.value)}
                    style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Code-barres</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={codeBarre}
                      onChange={(e) => setCodeBarre(e.target.value)}
                      style={{ flex: 1, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        
                        cursor: "pointer",
                      }}
                    >
                      Scanner
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 120 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Quantité totale *</label>
                  <input
                    type="number"
                    min="0"
                    value={quantite}
                    onChange={(e) => {
                      const v = safeNumber(e.target.value);
                      setQuantite(v);
                      keepSplitInvariant(v, stock1);
                    }}
                    required
                    style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  />
                </div>
                <div style={{ minWidth: 120 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Stock1</label>
                  <input
                    type="number"
                    min="0"
                    value={stock1}
                    onChange={(e) => {
                      const v = safeNumber(e.target.value);
                      setStock1(v);
                      keepSplitInvariant(quantite, v);
                    }}
                    style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  />
                </div>
                <div style={{ minWidth: 120 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Stock2 (calculé)</label>
                  <input
                    type="number"
                    value={stock2}
                    disabled
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      background: "#f9fafb",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Prix achat</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={prixAchat}
                    onChange={(e) => setPrixAchat(safeNumber(e.target.value))}
                    style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Prix vente</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={prixVente}
                    onChange={(e) => setPrixVente(safeNumber(e.target.value))}
                    style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Date péremption</label>
                  <input
                    type="date"
                    value={datePeremption}
                    onChange={(e) => setDatePeremption(e.target.value)}
                    style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                   
                    cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "1px solid transparent",
                    background: "linear-gradient(135deg,#10b981,#059669)",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {isEditing ? "Mettre à jour" : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

/* Modal Scanner Caméra */
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
            const lib = await import("@zxing/browser");
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
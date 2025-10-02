// src/components/stock/StockManagement.js
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
  where,
  onSnapshot,
  Timestamp,
  runTransaction,
} from "firebase/firestore";

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

const STOCK_KEYS = ["stock", "stockSource", "originStock", "stockId", "stockName", "stock_label", "depot", "magasin", "source"];

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

const isTransferOperation = (doc) => {
  return !!(
    doc?.isTransferred ||
    doc?.isStockTransfer ||
    doc?.transfert ||
    doc?.type === "transfert" ||
    doc?.type === "transfer" ||
    doc?.operationType === "transfert" ||
    doc?.operationType === "transfer" ||
    (doc?.note && (
      String(doc.note).toLowerCase().includes("transfert") ||
      String(doc.note).toLowerCase().includes("transfer") ||
      String(doc.note).toLowerCase().includes("stock1") && String(doc.note).toLowerCase().includes("stock2")
    ))
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
  const [ventes, setVentes] = useState([]);
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

  const [showScanner, setShowScanner] = useState(false);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFromLotId, setTransferFromLotId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const [appliedSales, setAppliedSales] = useState(new Set());
  const [dismissedOps, setDismissedOps] = useState(new Set());

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [autoApply, setAutoApply] = useState(true);

  const APPLIED_SALES_COLL = "sales_applied";
  const DISMISSED_COLL = "order_dismissed";

  const isApplyingRef = useRef(false);
  const achatsListenerRef = useRef(null);
  const stockListenerRef = useRef(null);
  const ventesListenerRef = useRef(null);

  const hasFilter = normalize(search).length > 0;

  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  /* ================== SYNCHRONISATION ================== */

  const setupAchatsListener = useCallback(() => {
    if (!societeId || achatsListenerRef.current) return;

    achatsListenerRef.current = onSnapshot(
      query(collection(db, "societe", societeId, "achats"), orderBy("timestamp", "desc")),
      (snapshot) => {
        const achatsData = [];
        const changes = snapshot.docChanges();
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (Array.isArray(data.articles) && data.articles.some(a => (a?.commandee?.quantite || 0) > 0)) {
            achatsData.push({ id: doc.id, ...data });
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
      (error) => {
        console.error("Erreur listener achats:", error);
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
        snapshot.forEach((doc) => {
          const data = doc.data();
          const q = Math.max(0, safeNumber(data.quantite));
          const s1 = Math.min(q, Math.max(0, safeNumber(data.stock1, q)));
          const s2 = Math.max(0, q - s1);
          stockData.push({ id: doc.id, ...data, quantite: s1 + s2, stock1: s1, stock2: s2 });
        });
        setLots(stockData);
      },
      (error) => {
        console.error("Erreur listener stock:", error);
        setError("Erreur de synchronisation du stock");
      }
    );
  }, [societeId]);

  const setupVentesListener = useCallback(() => {
    if (!societeId || ventesListenerRef.current) return;

    ventesListenerRef.current = onSnapshot(
      query(collection(db, "societe", societeId, "ventes"), orderBy("date", "desc")),
      (snapshot) => {
        const ventesData = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (!isTransferOperation(data)) {
            ventesData.push({ id: doc.id, ...data });
          }
        });
        
        setVentes(ventesData);
      },
      (error) => {
        console.error("Erreur listener ventes:", error);
        setError("Erreur de synchronisation avec les ventes");
      }
    );
  }, [societeId]);

  const syncStockFromAchat = useCallback(async (achatData) => {
    if (!societeId || !user || !achatData?.articles?.length) return;
    if (achatData.statutReception !== "reçu") return;
    if (isTransferOperation(achatData)) return;

    try {
      setIsSyncing(true);
      const isStock1 = pickDocStock(achatData) === "stock1";

      for (const article of achatData.articles) {
        if (!article.recu || (article.recu.quantite || 0) <= 0) continue;

        const nom = article.produit || "";
        const qte = Number(article.recu.quantite || 0);
        const pA = Number(article.recu.prixUnitaire || article.recu.prixAchat || 0);
        const pV = Number(article.recu.prixVente || 0);
        const dateP = article.recu.datePeremption ? Timestamp.fromDate(new Date(article.recu.datePeremption)) : null;

        const existingQuery = query(
          collection(db, "societe", societeId, "stock_entries"),
          where("achatId", "==", achatData.id),
          where("nom", "==", nom),
          where("numeroLot", "==", article.recu.numeroLot || `LOT${Date.now().toString().slice(-6)}`)
        );
        const existingSnap = await getDocs(existingQuery);

        if (existingSnap.empty) {
          await addDoc(collection(db, "societe", societeId, "stock_entries"), {
            nom,
            quantite: qte,
            stock1: isStock1 ? qte : 0,
            stock2: isStock1 ? 0 : qte,
            quantiteInitiale: qte,
            prixAchat: pA,
            prixVente: pV,
            datePeremption: dateP,
            numeroArticle: article.recu.numeroArticle || article.recu.codeBarre || null,
            codeBarre: article.recu.codeBarre || article.recu.numeroArticle || null,
            numeroLot: article.recu.numeroLot || `LOT${Date.now().toString().slice(-6)}`,
            fournisseur: article.recu.fournisseurArticle || achatData.fournisseur || "",
            fournisseurPrincipal: achatData.fournisseur || "",
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
          existingSnap.forEach(async (doc) => {
            await updateDoc(doc.ref, {
              quantite: qte,
              stock1: isStock1 ? qte : 0,
              stock2: isStock1 ? 0 : qte,
              prixAchat: pA,
              prixVente: pV,
              datePeremption: dateP,
              updatedAt: Timestamp.now(),
              updatedBy: user.email || user.uid,
              lastSyncAt: Timestamp.now(),
            });
          });
        }
      }
    } catch (e) {
      console.error("Erreur sync stock depuis achat:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [societeId, user]);

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

  const fetchAppliedSales = useCallback(async () => {
    if (!societeId) return;
    try {
      const snap = await getDocs(collection(db, "societe", societeId, APPLIED_SALES_COLL));
      const s = new Set();
      snap.forEach((d) => {
        const data = d.data();
        if (data?.applied) s.add(d.id);
      });
      setAppliedSales(s);
    } catch (e) {
      console.error(e);
    }
  }, [societeId]);

  const fetchDismissedOps = useCallback(async () => {
    if (!societeId) return;
    try {
      const snap = await getDocs(collection(db, "societe", societeId, DISMISSED_COLL));
      const s = new Set();
      snap.forEach((d) => {
        const data = d.data();
        if (data?.dismissed) s.add(d.id);
      });
      setDismissedOps(s);
    } catch (e) {
      console.error(e);
    }
  }, [societeId]);

  useEffect(() => {
    if (!waiting) {
      setupAchatsListener();
      setupStockListener();
      setupVentesListener();
      fetchFournisseurs();
      fetchAppliedSales();
      fetchDismissedOps();
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
      if (ventesListenerRef.current) {
        ventesListenerRef.current();
        ventesListenerRef.current = null;
      }
    };
  }, [waiting, setupAchatsListener, setupStockListener, setupVentesListener]);

  /* ================== APPLICATION VENTES AU STOCK ================== */

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
    if (isTransferOperation(vDoc)) {
      return [];
    }

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

  const applyPendingSalesToStock = useCallback(async () => {
    if (!societeId || !user || !lots.length || !ventes.length || isApplyingRef.current) {
      return;
    }

    isApplyingRef.current = true;
    console.log("🔄 Démarrage de l'application des ventes au stock...");

    try {
      const idxByNameLot = {};
      const idxByName = {};
      lots.forEach((l) => {
        const k1 = `${normalize(l.nom)}|${normalize(l.numeroLot || "-")}`;
        idxByNameLot[k1] = l;
        const kn = normalize(l.nom);
        if (!idxByName[kn]) idxByName[kn] = [];
        idxByName[kn].push(l);
      });

      const tasks = [];
      ventes.forEach((v) => {
        if (isTransferOperation(v)) return;

        const rows = extractVenteArticles(v);
        rows.forEach((a, idx) => {
          const opId = `${v.id || "sale"}#${idx}`;
          if (dismissedOps.has(opId) || appliedSales.has(opId)) return;

          const nomA = (extractArticleName(a) || "").trim();
          if (!nomA) return;
          const lotA = (extractArticleLot(a) || "").trim();
          let q = extractArticleQty(a);
          if (!Number.isFinite(q) || q <= 0) q = 1;

          const stockSource = pickDocStock(a) !== "unknown" ? pickDocStock(a) : pickDocStock(v);

          tasks.push({ opId, nom: nomA, numeroLot: lotA, qty: q, stockSource });
        });
      });

      if (!tasks.length) {
        console.log("ℹ️ Aucune vente en attente d'application");
        isApplyingRef.current = false;
        return;
      }

      console.log(`📋 ${tasks.length} opération(s) de vente à traiter`);
      let appliedCount = 0;
      const newAppliedSet = new Set(appliedSales);

      for (const t of tasks) {
        try {
          await runTransaction(db, async (transaction) => {
            const appliedRef = doc(db, "societe", societeId, APPLIED_SALES_COLL, t.opId);
            const appliedSnap = await transaction.get(appliedRef);

            if (appliedSnap.exists() && appliedSnap.data()?.applied) {
              return;
            }

            const kFull = `${normalize(t.nom)}|${normalize(t.numeroLot || "-")}`;
            let lot = idxByNameLot[kFull];

            if (!lot) {
              const arr = idxByName[normalize(t.nom)] || [];
              if (arr.length === 1) lot = arr[0];
            }
            if (!lot) return;

            const lotRef = doc(db, "societe", societeId, "stock_entries", lot.id);
            const lotSnap = await transaction.get(lotRef);
            if (!lotSnap.exists()) return;

            const lotData = lotSnap.data();

            let achatSnap = null;
            let achatRef = null;
            if (lotData.achatId) {
              achatRef = doc(db, "societe", societeId, "achats", lotData.achatId);
              achatSnap = await transaction.get(achatRef);
            }

            const s1 = Math.max(0, safeNumber(lotData.stock1, 0));
            const s2 = Math.max(0, safeNumber(lotData.stock2, 0));
            
            let takeFromS1 = 0, takeFromS2 = 0;
            let q = Math.max(0, safeNumber(t.qty, 0));
            
            if (t.stockSource === "stock1") {
              takeFromS1 = Math.min(s1, q);
              q -= takeFromS1;
              if (q > 0) takeFromS2 = Math.min(s2, q);
            } else if (t.stockSource === "stock2") {
              takeFromS2 = Math.min(s2, q);
              q -= takeFromS2;
              if (q > 0) takeFromS1 = Math.min(s1, q);
            } else {
              takeFromS1 = Math.min(s1, q);
              const rest = Math.max(0, q - takeFromS1);
              takeFromS2 = Math.min(s2, rest);
            }

            if (takeFromS1 === 0 && takeFromS2 === 0) return;

            const newS1 = s1 - takeFromS1;
            const newS2 = s2 - takeFromS2;
            const newQ = Math.max(0, newS1 + newS2);

            transaction.update(lotRef, {
              stock1: newS1,
              stock2: newS2,
              quantite: newQ,
              lastSaleNote: `-${takeFromS1} (s1) -${takeFromS2} (s2) via ventes [${t.stockSource}]`,
              updatedAt: Timestamp.now(),
              updatedBy: user.email || user.uid,
              lastSyncAt: Timestamp.now(),
            });

            if (achatSnap && achatSnap.exists()) {
              const achatData = achatSnap.data();
              const updatedArticles = (achatData.articles || []).map(art => {
                if (art.produit === lot.nom && art.recu?.numeroLot === lot.numeroLot) {
                  return {
                    ...art,
                    recu: {
                      ...art.recu,
                      quantite: Math.max(0, (art.recu?.quantite || 0) - (takeFromS1 + takeFromS2))
                    }
                  };
                }
                return art;
              });
              
              transaction.update(achatRef, {
                articles: updatedArticles,
                lastSaleDeduction: takeFromS1 + takeFromS2,
                lastSaleDate: Timestamp.now(),
                lastSaleStockSource: t.stockSource,
                syncedFromStock: true,
              });
            }

            transaction.set(
              appliedRef,
              {
                applied: true,
                at: Timestamp.now(),
                lotId: lot.id,
                qty: takeFromS1 + takeFromS2,
                tookS1: takeFromS1,
                tookS2: takeFromS2,
                stockSource: t.stockSource,
                syncedWithAchat: !!lotData.achatId,
              },
              { merge: true }
            );

            newAppliedSet.add(t.opId);
            appliedCount++;
          });
        } catch (err) {
          console.error(`❌ Erreur lors du traitement de l'opération ${t.opId}:`, err);
        }
      }

      if (appliedCount > 0) {
        setAppliedSales(newAppliedSet);
        setSuccess(`✅ ${appliedCount} vente(s) appliquée(s) au stock (+ sync achats)`);
        beepOk();
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch (err) {
      console.error("❌ Erreur globale durant l'application des ventes au stock:", err);
      setError("Une erreur est survenue lors de la synchronisation.");
      beepErr();
    } finally {
      isApplyingRef.current = false;
    }
  }, [
    societeId,
    user,
    lots,
    ventes,
    dismissedOps,
    appliedSales,
    beepOk,
    beepErr,
  ]);

  useEffect(() => {
    if (!waiting && lots.length && ventes.length && autoApply) {
      const timer = setTimeout(() => {
        applyPendingSalesToStock();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [waiting, lots.length, ventes.length, autoApply, applyPendingSalesToStock]);

  /* ================== TRANSFERTS ================== */

  const transferEligibleLots = lots.filter(lot => safeNumber(lot.stock1, 0) > 0);

  const resetTransferForm = () => { 
    setTransferFromLotId(""); 
    setTransferQty(""); 
    setTransferNote(""); 
  };

  const syncAchatFromStockTransfer = useCallback(async (originalLotId, newLotId, transferData) => {
    if (!societeId || !user) return;

    try {
      const originalLot = lots.find(l => l.id === originalLotId);
      if (!originalLot?.achatId) return;

      const achatRef = doc(db, "societe", societeId, "achats", originalLot.achatId);
      const achatSnap = await getDocs(query(collection(db, "societe", societeId, "achats"), where("__name__", "==", originalLot.achatId)));
      
      if (achatSnap.empty) return;

      const achatDoc = achatSnap.docs[0];
      const achatData = achatDoc.data();

      const articleTransfere = {
        produit: originalLot.nom,
        commandee: {
          quantite: transferData.quantite,
          prixUnitaire: originalLot.prixAchat || 0,
          prixVente: originalLot.prixVente || 0,
          datePeremption: originalLot.datePeremption,
          numeroLot: originalLot.numeroLot + "-S2",
          numeroArticle: originalLot.numeroArticle || originalLot.codeBarre || "",
          fournisseurArticle: originalLot.fournisseur || "",
          stock: "stock2",
          stockSource: "stock2"
        },
        recu: {
          quantite: transferData.quantite,
          prixUnitaire: originalLot.prixAchat || 0,
          prixVente: originalLot.prixVente || 0,
          datePeremption: originalLot.datePeremption,
          numeroLot: originalLot.numeroLot + "-S2",
          numeroArticle: originalLot.numeroArticle || originalLot.codeBarre || "",
          fournisseurArticle: originalLot.fournisseur || "",
          stock: "stock2",
          stockSource: "stock2"
        }
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

      const updatedArticles = achatData.articles.map(a => {
        if (a.produit === originalLot.nom && a.recu?.numeroLot === originalLot.numeroLot) {
          return {
            ...a,
            recu: {
              ...a.recu,
              quantite: Math.max(0, (a.recu?.quantite || 0) - transferData.quantite)
            }
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
  }, [societeId, user, lots]);

  const handleTransferWithNewLot = useCallback(async () => {
    try {
      if (!societeId || !user) { 
        setError("Session invalide."); 
        beepErr();
        return; 
      }
      
      const lotOriginal = lots.find(l => l.id === transferFromLotId);
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
        numeroLot: lotOriginal.numeroLot + "-S2",
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
        achatId: lotOriginal.achatId,
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
        note: transferNote || "Stock1 → Stock2"
      });

      setSuccess(`Transfert réussi avec sync achats : ${qtyToTransfer} unités → Stock2. Nouveau lot créé.`);
      beepOk();
      resetTransferForm();
      setShowTransferModal(false);
      setTimeout(() => setSuccess(""), 1500);
    } catch (e) {
      console.error("handleTransferWithNewLot:", e);
      setError("Erreur lors du transfert avec synchronisation.");
      beepErr();
    } finally {
      setIsSyncing(false);
    }
  }, [societeId, user, lots, transferFromLotId, transferQty, transferNote, syncAchatFromStockTransfer, beepOk, beepErr]);

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
          syncBlocked: true,
          syncBlockedReason: "retour_en_cours",
          lastSyncAt: Timestamp.now(),
        });
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
          
          if (!lotSnap.exists()) {
            throw new Error("Lot introuvable");
          }

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
            const achatData = achatSnap.data();
            
            const updatedArticles = (achatData.articles || []).map(art => {
              if (art.produit === lot.nom && art.recu?.numeroLot === lot.numeroLot) {
                return {
                  ...art,
                  recu: {
                    ...art.recu,
                    quantite: Math.max(0, (art.recu?.quantite || 0) - qtyReturned)
                  }
                };
              }
              return art;
            });

            transaction.update(achatRef, {
              articles: updatedArticles,
              lastReturn: { 
                quantity: qtyReturned, 
                date: Timestamp.now(), 
                settled: true,
                lotId: lot.id,
                productName: lot.nom 
              },
              syncedFromStock: true,
            });
          }
        });
        
        setSuccess("Avoir réglé — stock ajusté définitivement (+ sync achat)");
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
          
          if (!lotSnap.exists()) {
            throw new Error("Lot introuvable");
          }

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
            const achatData = achatSnap.data();
            
            const updatedArticles = (achatData.articles || []).map(art => {
              if (art.produit === lot.nom && art.recu?.numeroLot === lot.numeroLot) {
                return {
                  ...art,
                  recu: {
                    ...art.recu,
                    quantite: Math.max(0, (art.recu?.quantite || 0) - qtyReturned)
                  }
                };
              }
              return art;
            });

            transaction.update(achatRef, {
              articles: updatedArticles,
              lastReturn: { 
                quantity: qtyReturned, 
                date: Timestamp.now(), 
                settled: true, 
                immediate: true,
                lotId: lot.id,
                productName: lot.nom 
              },
              syncedFromStock: true,
            });
          }
        });
        
        setSuccess("Retour validé et stock ajusté définitivement (+ sync achat)");
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
    const q = Math.max(0, safeNumber(lot.quantite));
    const s1 = Math.min(q, Math.max(0, safeNumber(lot.stock1, q)));
    const s2 = Math.max(0, q - s1);
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
      const { Q, S1, S2 } = keepSplitInvariant(quantite, stock1);
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
          const achatSnap = await getDocs(query(collection(db, "societe", societeId, "achats"), where("__name__", "==", lot.achatId)));
          
          if (!achatSnap.empty) {
            const achatDoc = achatSnap.docs[0];
            const achatData = achatDoc.data();
            const updatedArticles = (achatData.articles || []).filter(art => 
              !(art.produit === lot.nom && art.recu?.numeroLot === lot.numeroLot)
            );
            
            await updateDoc(achatRef, {
              articles: updatedArticles,
              syncedFromStock: true,
              lastStockDeletion: Timestamp.now(),
            });
          }
        }

        await deleteDoc(doc(db, "societe", societeId, "stock_entries", lot.id));
        setSuccess("Lot supprimé (+ sync achat)");
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
                  {isSyncing ? "Synchronisation en cours..." : `Dernière sync: ${lastSyncTime.toLocaleTimeString("fr-FR")}`}
                </div>
              )}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={autoApply}
                  onChange={(e) => setAutoApply(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: autoApply ? "#059669" : "#6b7280" }}>
                  Application auto des ventes {autoApply ? "✓" : "✗"}
                </span>
              </label>
              {!autoApply && (
                <button
                  onClick={applyPendingSalesToStock}
                  disabled={isSyncing}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: isSyncing ? "#d1d5db" : "linear-gradient(135deg,#3b82f6,#2563eb)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isSyncing ? "not-allowed" : "pointer",
                  }}
                >
                  {isSyncing ? "Sync..." : "Appliquer ventes maintenant"}
                </button>
              )}
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
              onClick={openCreate}
              style={{
                background: "linear-gradient(135deg,#1e40af,#1d4ed8)",
                color: "#ffffff",
                border: "2px solid transparent",
                borderRadius: 12,
                padding: window.innerWidth < 768 ? "8px 12px" : "12px 20px",
                fontWeight: 700,
                fontSize: window.innerWidth < 768 ? "14px" : "16px",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(30, 64, 175, 0.3)",
                transition: "all 0.2s ease-in-out",
                minWidth: window.innerWidth < 768 ? "auto" : "200px",
                whiteSpace: "nowrap",
                textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            >
              {window.innerWidth < 480 ? "+ Article" : "+ Ajouter article"}
            </button>
          </div>
        </div>
        {hasFilter && (
          <div style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
            Filtre actif : <strong>{search}</strong> — <em>clique une ligne pour afficher ses actions.</em>
          </div>
        )}
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
          <h2 style={{ margin: 0, fontWeight: 800, color: "#059669" }}>
            Stock1 → Stock2
          </h2>
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
              ⚠️ Ce transfert créera un NOUVEAU lot pour Stock2, diminuera le stock1 du lot original ET synchronisera avec les achats correspondants.
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
                  Quantité à transférer
                  {transferFromLotId && (
                    <span style={{ color: "#6b7280", fontWeight: 400 }}>
                      (max: {lots.find(l => l.id === transferFromLotId)?.stock1 || 0})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min="1"
                  max={transferFromLotId ? lots.find(l => l.id === transferFromLotId)?.stock1 || 0 : undefined}
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
                    background: (transferFromLotId && transferQty && !isSyncing)
                      ? "linear-gradient(135deg,#059669,#047857)"
                      : "#d1d5db",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontWeight: 700,
                    cursor: (transferFromLotId && transferQty && !isSyncing) ? "pointer" : "not-allowed",
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
                <strong>{lots.find(l => l.id === transferFromLotId)?.nom}</strong> (Lot: {lots.find(l => l.id === transferFromLotId)?.numeroLot}) vers un nouveau lot Stock2.
                {lots.find(l => l.id === transferFromLotId)?.achatId && (
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
                        background: selectedLotId === lot.id 
                          ? "rgba(219,234,254,.5)" 
                          : isTransferredLot
                          ? "rgba(220,252,231,.3)"
                          : idx % 2 ? "rgba(249,250,251,.6)" : "white",
                        borderBottom: "1px solid #f3f4f6",
                        cursor: hasFilter ? "pointer" : "default",
                        borderLeft: isTransferredLot ? "4px solid #059669" : isLinkedToAchat ? "4px solid #3b82f6" : undefined,
                      }}
                      title={hasFilter ? "Clique pour afficher/masquer les actions" : ""}
                    >
                      <td style={{ padding: 12, fontWeight: 600 }}>
                        {lot.nom}{" "}
                        {badgeTransfert && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: "#059669" }} title="Lot créé par transfert">
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
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(lot.stock1 + lot.stock2)}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(lot.stock1)}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(lot.stock2)}</td>
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
                              borderRadius: 4 
                            }}
                            title={`Lié à l'achat ${lot.achatId?.slice(0, 8)}`}
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
                              marginLeft: 4 
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
                            title="Demander un retour/avoir (avec sync achat)"
                          >
                            Retour/Avoir
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
                                title="Valider et déduire du stock + sync achat"
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
                              title="Marquer l'avoir comme réglé et diminuer le stock + sync achat"
                            >
                              Avoir réglé
                            </button>
                          )}
                        </div>
                        {!showRowActions && hasFilter && (
                          <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                            (clique la ligne)
                          </div>
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
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              {isEditing ? "Modifier le lot" : "Ajouter un lot"}
            </h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Nom *</label>
                  <input
                    type="text"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>N° lot *</label>
                  <input
                    type="text"
                    value={numeroLot}
                    onChange={(e) => setNumeroLot(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                    }}
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
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Code-barres</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={codeBarre}
                      onChange={(e) => setCodeBarre(e.target.value)}
                      style={{
                        flex: 1,
                        padding: 10,
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Scanner
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth:120 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>
                    Quantité totale *
                  </label>
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
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                    }}
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
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                    }}
                  />
                </div>
                <div style={{ minWidth: 120 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>
                    Stock2 (calculé)
                  </label>
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
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                    }}
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
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>Date péremption</label>
                  <input
                    type="date"
                    value={datePeremption}
                    onChange={(e) => setDatePeremption(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                    }}
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
                    background: "#fff",
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
            const lib = await import("@zxing/browser");
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
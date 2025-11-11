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
  writeBatch,
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
  Normalisation Stock (comme dans Ventes.js)
====================================================== */
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
function extractArticleStock(a) {
  return pickDocStock(a);
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

  const [manualLines, setManualLines] = useState([]);
  const [dismissedOps, setDismissedOps] = useState(new Set());

  // Filtres
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // 🆕 État pour l'envoi WhatsApp en cours
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // 🆕 Gestion des commerciaux
  const [commerciaux, setCommerciaux] = useState({});
  const [showCommercialModal, setShowCommercialModal] = useState(false);
  const [selectedFournisseurForCommercial, setSelectedFournisseurForCommercial] = useState("");
  const [newCommercialNom, setNewCommercialNom] = useState("");
  const [newCommercialTel, setNewCommercialTel] = useState("");
  const [showCommercialSelect, setShowCommercialSelect] = useState("");
  const [selectedCommercial, setSelectedCommercial] = useState("");

  const ORDER_STATUS_COLL = "order_status";
  const DISMISSED_COLL = "order_dismissed";
  const MANUAL_LINES_COLL = "order_manual_lines";
  const COMMERCIAUX_COLL = "fournisseur_commerciaux";

  const ventesListenerRef = useRef(null);
  const stockListenerRef = useRef(null);
  const orderStatusListenerRef = useRef(null);
  const manualLinesListenerRef = useRef(null);
  const dismissedListenerRef = useRef(null);
  const commerciauxListenerRef = useRef(null);

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
        const achatIdx = {};
        snapshot.forEach((docx) => {
          const data = docx.data();
          stockData.push({ id: docx.id, ...data });
          const k = normalize(data.nom || "");
          if (k) achatIdx[k] = data;
        });
        setLots(stockData);
        setAchatsIndex(achatIdx);
      },
      (err) => {
        console.error("Erreur listener stock:", err);
        setError("Erreur de synchronisation avec le stock");
      }
    );
  }, [societeId]);

  const setupOrderStatusListener = useCallback(() => {
    if (!societeId || orderStatusListenerRef.current) return;
    orderStatusListenerRef.current = onSnapshot(
      collection(db, "societe", societeId, ORDER_STATUS_COLL),
      (snapshot) => {
        const statusMap = {};
        snapshot.forEach((docx) => {
          statusMap[docx.id] = docx.data();
        });
        setLineStatus(statusMap);
      },
      (err) => {
        console.error("Erreur listener order_status:", err);
      }
    );
  }, [societeId]);

  const setupManualLinesListener = useCallback(() => {
    if (!societeId || manualLinesListenerRef.current) return;
    manualLinesListenerRef.current = onSnapshot(
      collection(db, "societe", societeId, MANUAL_LINES_COLL),
      (snapshot) => {
        const lines = [];
        snapshot.forEach((docx) => {
          lines.push({ id: docx.id, ...docx.data() });
        });
        setManualLines(lines);
      },
      (err) => {
        console.error("Erreur listener manual_lines:", err);
      }
    );
  }, [societeId]);

  const setupDismissedListener = useCallback(() => {
    if (!societeId || dismissedListenerRef.current) return;
    dismissedListenerRef.current = onSnapshot(
      collection(db, "societe", societeId, DISMISSED_COLL),
      (snapshot) => {
        const set = new Set();
        snapshot.forEach((docx) => {
          set.add(docx.id);
        });
        setDismissedOps(set);
      },
      (err) => {
        console.error("Erreur listener dismissed:", err);
      }
    );
  }, [societeId]);

  const setupCommerciauxListener = useCallback(() => {
    if (!societeId || commerciauxListenerRef.current) return;
    commerciauxListenerRef.current = onSnapshot(
      collection(db, "societe", societeId, COMMERCIAUX_COLL),
      (snapshot) => {
        const comMap = {};
        snapshot.forEach((docx) => {
          const data = docx.data();
          const fName = data.fournisseur || "";
          if (!comMap[fName]) comMap[fName] = [];
          comMap[fName].push({ id: docx.id, ...data });
        });
        setCommerciaux(comMap);
      },
      (err) => {
        console.error("Erreur listener commerciaux:", err);
      }
    );
  }, [societeId]);

  const loadFournisseurs = useCallback(async () => {
    if (!societeId) return;
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "fournisseurs"));
      const arr = [];
      snap.forEach((docx) => {
        arr.push({ id: docx.id, ...docx.data() });
      });
      setFournisseurs(arr);
    } catch (e) {
      console.error("Erreur chargement fournisseurs:", e);
    }
  }, [societeId]);

  useEffect(() => {
    if (waiting) return;
    setupVentesListener();
    setupStockListener();
    setupOrderStatusListener();
    setupManualLinesListener();
    setupDismissedListener();
    setupCommerciauxListener();
    loadFournisseurs();

    return () => {
      ventesListenerRef.current?.();
      stockListenerRef.current?.();
      orderStatusListenerRef.current?.();
      manualLinesListenerRef.current?.();
      dismissedListenerRef.current?.();
      commerciauxListenerRef.current?.();
    };
  }, [
    waiting,
    setupVentesListener,
    setupStockListener,
    setupOrderStatusListener,
    setupManualLinesListener,
    setupDismissedListener,
    setupCommerciauxListener,
    loadFournisseurs,
  ]);

  /* ================== 🆕 AFFICHAGE AUTOMATIQUE DE TOUTES LES VENTES ================== */
  useEffect(() => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const rows = [];
      
      // 🆕 Afficher TOUTES les ventes automatiquement (pas seulement les manquants)
      ventes.forEach((v) => {
        const articles = extractVenteArticles(v);
        articles.forEach((a, idx) => {
          const opId = `${v.id}#${idx}`;
          if (dismissedOps.has(opId)) return;

          const nom = extractArticleName(a);
          const lot = extractArticleLot(a);
          const qty = extractArticleQty(a);
          const stockSource = extractArticleStock(a);

          if (!nom || qty <= 0) return;

          // Rechercher les infos du produit dans le stock
          const found = lots.find(
            (l) =>
              normalize(l.nom || "") === normalize(nom) &&
              (!lot || normalize(l.numeroLot || "") === normalize(lot))
          );

          // 🆕 Ajouter TOUTES les ventes (même si en stock)
          rows.push({
            key: opId,
            nom,
            lot: lot || found?.numeroLot || "",
            quantite: qty,
            fournisseur: found?.fournisseur || a?.fournisseur || "",
            achat: found || null,
            stockSource,
            date: todayISO(),
            remise: 0,
            urgent: false,
            venteId: v.id,
            venteDate: v.date,
            client: v.client || "",
          });
        });
      });

      // Ajouter les lignes manuelles
      manualLines.forEach((ml) => {
        rows.push({
          key: ml.id,
          nom: ml.nom || "",
          lot: ml.numeroLot || "",
          quantite: safeNumber(ml.quantite),
          fournisseur: ml.fournisseur || "",
          achat: null,
          stockSource: ml.stockSource || "stock1",
          date: ml.date || todayISO(),
          remise: safeNumber(ml.remise),
          urgent: !!ml.urgent,
          isManual: true,
        });
      });

      setToOrder(rows);
    } finally {
      isProcessingRef.current = false;
    }
  }, [ventes, lots, manualLines, dismissedOps]);

  /* ================== GROUPEMENT PAR FOURNISSEUR ================== */
  useEffect(() => {
    const grouped = {};
    toOrder.forEach((line) => {
      const fName = line.fournisseur || "Sans fournisseur";
      if (!grouped[fName]) grouped[fName] = [];
      grouped[fName].push(line);
    });
    setGroupCommercial(grouped);
  }, [toOrder]);

  /* ================== ACTIONS LIGNES ================== */
  const setLineField = useCallback(
    async (key, field, value) => {
      const line = toOrder.find((l) => l.key === key);
      if (!line) return;

      if (line.isManual) {
        try {
          await updateDoc(doc(db, "societe", societeId, MANUAL_LINES_COLL, key), {
            [field]: value,
          });
        } catch (e) {
          console.error("Erreur setLineField manual:", e);
        }
      } else {
        setToOrder((prev) =>
          prev.map((l) => {
            if (l.key === key) return { ...l, [field]: value };
            return l;
          })
        );
      }
    },
    [toOrder, societeId]
  );

  const removeLine = useCallback(
    async (line) => {
      if (line.isManual) {
        try {
          await deleteDoc(doc(db, "societe", societeId, MANUAL_LINES_COLL, line.key));
          setSuccess("Ligne manuelle supprimée");
        } catch (e) {
          console.error("Erreur suppression ligne manuelle:", e);
          setError("Erreur lors de la suppression");
        }
      } else {
        try {
          await setDoc(doc(db, "societe", societeId, DISMISSED_COLL, line.key), {
            dismissed: true,
            timestamp: Timestamp.now(),
          });
          setSuccess("Ligne ignorée");
        } catch (e) {
          console.error("Erreur dismiss:", e);
          setError("Erreur lors de l'opération");
        }
      }
    },
    [societeId]
  );

  const duplicateLine = useCallback(
    async (key) => {
      const line = toOrder.find((l) => l.key === key);
      if (!line) return;

      try {
        await addDoc(collection(db, "societe", societeId, MANUAL_LINES_COLL), {
          nom: line.nom,
          numeroLot: line.lot,
          quantite: line.quantite,
          fournisseur: line.fournisseur,
          stockSource: line.stockSource,
          date: line.date,
          remise: line.remise || 0,
          urgent: line.urgent || false,
          createdAt: Timestamp.now(),
        });
        setSuccess("Ligne dupliquée");
      } catch (e) {
        console.error("Erreur duplication:", e);
        setError("Erreur lors de la duplication");
      }
    },
    [toOrder, societeId]
  );

  const deleteLinePermanently = useCallback(
    async (lineKey) => {
      if (!window.confirm("⚠️ Supprimer définitivement cette ligne ?")) return;

      try {
        const batch = writeBatch(db);

        // Supprimer le statut
        const statusRef = doc(db, "societe", societeId, ORDER_STATUS_COLL, lineKey);
        batch.delete(statusRef);

        // Marquer comme dismissed
        const dismissedRef = doc(db, "societe", societeId, DISMISSED_COLL, lineKey);
        batch.set(dismissedRef, {
          dismissed: true,
          deletedAt: Timestamp.now(),
        });

        await batch.commit();
        setSuccess("Ligne supprimée définitivement");
      } catch (e) {
        console.error("Erreur suppression:", e);
        setError("Erreur lors de la suppression");
      }
    },
    [societeId]
  );

  const addManualLine = useCallback(async () => {
    try {
      await addDoc(collection(db, "societe", societeId, MANUAL_LINES_COLL), {
        nom: "",
        numeroLot: "",
        quantite: 1,
        fournisseur: "",
        stockSource: "stock1",
        date: todayISO(),
        remise: 0,
        urgent: false,
        createdAt: Timestamp.now(),
      });
      setSuccess("Nouvelle ligne ajoutée");
    } catch (e) {
      console.error("Erreur ajout ligne manuelle:", e);
      setError("Erreur lors de l'ajout");
    }
  }, [societeId]);

  /* ================== 🆕 GESTION DES COMMERCIAUX ================== */
  const addCommercial = useCallback(async () => {
    if (!newCommercialNom || !newCommercialTel || !selectedFournisseurForCommercial) {
      setError("Veuillez remplir tous les champs");
      return;
    }

    try {
      await addDoc(collection(db, "societe", societeId, COMMERCIAUX_COLL), {
        fournisseur: selectedFournisseurForCommercial,
        nom: newCommercialNom,
        telephone: newCommercialTel,
        createdAt: Timestamp.now(),
      });
      setSuccess("Commercial ajouté avec succès");
      setNewCommercialNom("");
      setNewCommercialTel("");
      setShowCommercialModal(false);
    } catch (e) {
      console.error("Erreur ajout commercial:", e);
      setError("Erreur lors de l'ajout du commercial");
    }
  }, [newCommercialNom, newCommercialTel, selectedFournisseurForCommercial, societeId]);

  const deleteCommercial = useCallback(
    async (commercialId) => {
      try {
        await deleteDoc(doc(db, "societe", societeId, COMMERCIAUX_COLL, commercialId));
        setSuccess("Commercial supprimé");
      } catch (e) {
        console.error("Erreur suppression commercial:", e);
        setError("Erreur lors de la suppression");
      }
    },
    [societeId]
  );

  /* ================== 🆕 ENVOI WHATSAPP & VERROUILLAGE ================== */
  /**
   * Envoie la commande via WhatsApp et marque toutes les lignes comme "envoyées" + verrouillées
   */
  const sendOrderViaWhatsApp = useCallback(
    async (fournisseurName, lines, commercialTel = null) => {
      if (!fournisseurName || !lines || lines.length === 0) {
        setError("Aucune ligne à envoyer");
        return;
      }

      setSendingWhatsApp(true);
      try {
        // 1. Trouver les infos du fournisseur
        const fournisseur = fournisseurs.find(
          (f) => normalize(f.nom || "") === normalize(fournisseurName)
        );

        let phoneToUse = commercialTel || fournisseur?.telephone;

        if (!phoneToUse) {
          setError(`Numéro de téléphone manquant pour ${fournisseurName}`);
          setSendingWhatsApp(false);
          return;
        }

        // 2. Construire le message WhatsApp
        let message = `🏥 *Commande Pharmacie*\n\n`;
        message += `📦 *Fournisseur:* ${fournisseurName}\n`;
        message += `📅 *Date commande:* ${formatDateSafe(new Date())}\n\n`;
        message += `*Articles à commander:*\n`;
        message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        let totalItems = 0;

        lines.forEach((line, idx) => {
          const displayNom = line.nom || "Produit";
          const displayLot = line.lot || "-";
          const displayQte = safeNumber(line.quantite);
          const displayRemise = safeNumber(line.remise);
          const displayUrgent = line.urgent ? " ⚡ *URGENT*" : "";
          const displayStock = line.stockSource === "stock2" ? " [Stock 2]" : " [Stock 1]";
          
          // 🆕 Ajouter infos de vente
          const venteInfo = line.client ? ` (Vente: ${line.client})` : "";

          message += `${idx + 1}. *${displayNom}*${displayUrgent}${displayStock}${venteInfo}\n`;
          if (displayLot !== "-") {
            message += `   Lot: ${displayLot}\n`;
          }
          message += `   Qté: ${displayQte}`;
          if (displayRemise > 0) {
            message += ` (Remise: ${displayRemise}%)`;
          }
          if (line.venteDate) {
            message += `\n   Date vente: ${formatDateSafe(line.venteDate)}`;
          }
          message += `\n\n`;

          totalItems += displayQte;
        });

        message += `━━━━━━━━━━━━━━━━━━━━\n`;
        message += `📊 *Total articles:* ${lines.length}\n`;
        message += `📦 *Quantité totale:* ${totalItems}\n\n`;
        message += `Merci de confirmer la disponibilité. ✅`;

        // 3. Marquer toutes les lignes comme "envoyées" et les verrouiller dans Firestore
        const batch = writeBatch(db);

        lines.forEach((line) => {
          const statusRef = doc(db, "societe", societeId, ORDER_STATUS_COLL, line.key);
          batch.set(
            statusRef,
            {
              sent: true,
              sentAt: Timestamp.now(),
              locked: true,
              validated: false,
            },
            { merge: true }
          );
        });

        await batch.commit();

        // 4. Ouvrir WhatsApp
        const phone = normalizePhoneForWa(phoneToUse);
        const waUrl = `https://wa.me/${phone}?text=${encodeWhatsAppText(message)}`;
        window.open(waUrl, "_blank");

        setSuccess(`Commande envoyée à ${fournisseurName} via WhatsApp! 📤`);
        setShowCommercialSelect("");
        setSelectedCommercial("");
      } catch (e) {
        console.error("Erreur envoi WhatsApp:", e);
        setError("Erreur lors de l'envoi WhatsApp");
      } finally {
        setSendingWhatsApp(false);
      }
    },
    [fournisseurs, societeId]
  );

  /* ================== 🆕 VALIDATION COMMANDE ================== */
  /**
   * Marque une ligne comme "validée" (la commande a été reçue)
   */
  const markLineValidated = useCallback(
    async (lineKey) => {
      try {
        const statusRef = doc(db, "societe", societeId, ORDER_STATUS_COLL, lineKey);
        await updateDoc(statusRef, {
          validated: true,
          validatedAt: Timestamp.now(),
        });
        setSuccess("✅ Commande validée!");
      } catch (e) {
        console.error("Erreur validation:", e);
        setError("Erreur lors de la validation");
      }
    },
    [societeId]
  );

  /* ================== FILTRAGE ================== */
  const filteredGroupCommercial = useMemo(() => {
    const searchLower = normalize(searchText);
    const filtered = {};

    Object.entries(groupCommercial).forEach(([fName, lines]) => {
      const matchingLines = lines.filter((line) => {
        // Filtre texte
        const matchText =
          !searchLower ||
          normalize(line.nom).includes(searchLower) ||
          normalize(line.lot).includes(searchLower) ||
          normalize(fName).includes(searchLower);

        // Filtre statut
        const st = lineStatus[line.key] || {};
        let matchStatus = true;
        if (statusFilter === "sent") matchStatus = st.sent && !st.validated;
        if (statusFilter === "validated") matchStatus = st.validated;
        if (statusFilter === "pending") matchStatus = !st.sent && !st.validated;

        return matchText && matchStatus;
      });

      if (matchingLines.length > 0) {
        filtered[fName] = matchingLines;
      }
    });

    return filtered;
  }, [groupCommercial, searchText, statusFilter, lineStatus]);

  /* ================== RENDU ================== */
  if (waiting) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p style={{ color: "#6b7280", fontSize: 18 }}>Chargement...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1600, margin: "0 auto" }}>
      {/* En-tête */}
      <div
        style={{
          background: "linear-gradient(135deg,#6366f1,#4f46e5)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          color: "#fff",
          boxShadow: "0 10px 30px rgba(99, 102, 241, 0.3)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>📦 Gestion des Commandes</h1>
        <p style={{ margin: "8px 0 0", opacity: 0.95, fontSize: 15 }}>
          Suivi automatique des besoins en stock avec envoi WhatsApp intégré
        </p>
      </div>

      {/* 🆕 Statistiques globales */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,#dbeafe,#bfdbfe)",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 4px 12px rgba(59, 130, 246, 0.15)",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#1e40af" }}>
            Total Commandes
          </h3>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: "#1e3a8a" }}>{toOrder.length}</p>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg,#fef3c7,#fde68a)",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 4px 12px rgba(251, 191, 36, 0.15)",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#b45309" }}>
            ⏳ En attente
          </h3>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: "#92400e" }}>
            {toOrder.filter((l) => !lineStatus[l.key]?.sent).length}
          </p>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg,#ddd6fe,#c4b5fd)",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 4px 12px rgba(139, 92, 246, 0.15)",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#6d28d9" }}>
            📤 Envoyés
          </h3>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: "#5b21b6" }}>
            {toOrder.filter((l) => lineStatus[l.key]?.sent && !lineStatus[l.key]?.validated).length}
          </p>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg,#dcfce7,#bbf7d0)",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 4px 12px rgba(34, 197, 94, 0.15)",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#15803d" }}>
            ✅ Validés
          </h3>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: "#166534" }}>
            {toOrder.filter((l) => lineStatus[l.key]?.validated).length}
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: "linear-gradient(135deg,#fecaca,#fca5a5)",
            border: "1px solid #f87171",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#7f1d1d" }}>{error}</span>
          <button
            onClick={() => setError("")}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 20,
              color: "#7f1d1d",
            }}
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: "linear-gradient(135deg,#d1fae5,#a7f3d0)",
            border: "1px solid #86efac",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#065f46" }}>{success}</span>
          <button
            onClick={() => setSuccess("")}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 20,
              color: "#065f46",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Barre d'outils */}
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 18,
          marginBottom: 24,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="🔍 Rechercher..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "10px 14px",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            fontSize: 14,
          }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "10px 14px",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <option value="all">📊 Tous les statuts</option>
          <option value="pending">⏳ En attente</option>
          <option value="sent">📤 Envoyés</option>
          <option value="validated">✅ Validés</option>
        </select>

        <button
          onClick={addManualLine}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg,#10b981,#059669)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ➕ Ajouter une ligne
        </button>
      </div>

      {/* Groupes par fournisseur */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {Object.keys(filteredGroupCommercial).length === 0 ? (
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 40,
              textAlign: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          >
            <p style={{ fontSize: 16, color: "#6b7280" }}>
              Aucune commande à afficher avec les filtres actuels.
            </p>
          </div>
        ) : (
          Object.entries(filteredGroupCommercial).map(([fName, lines]) => {
            // Stats du groupe
            const totalQty = lines.reduce((sum, l) => sum + safeNumber(l.quantite), 0);
            const sentCount = lines.filter((l) => lineStatus[l.key]?.sent).length;
            const validatedCount = lines.filter((l) => lineStatus[l.key]?.validated).length;
            const pendingCount = lines.length - sentCount;

            // Lignes non envoyées (pour le bouton WhatsApp)
            const unsent = lines.filter((l) => !lineStatus[l.key]?.sent);

            return (
              <div
                key={fName}
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  overflow: "hidden",
                }}
              >
                {/* En-tête fournisseur */}
                <div
                  style={{
                    background: "linear-gradient(135deg,#f3f4f6,#e5e7eb)",
                    padding: "16px 20px",
                    borderBottom: "2px solid #d1d5db",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827", flex: 1 }}>
                    🏢 {fName}
                  </h2>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
                      {lines.length} ligne{lines.length > 1 ? "s" : ""} · {totalQty} unités
                    </span>
                    {pendingCount > 0 && (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "#fef3c7",
                          border: "1px solid #fde047",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ⏳ {pendingCount}
                      </span>
                    )}
                    {sentCount > 0 && (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "#dbeafe",
                          border: "1px solid #93c5fd",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        📤 {sentCount}
                      </span>
                    )}
                    {validatedCount > 0 && (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          border: "1px solid #86efac",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ✅ {validatedCount}
                      </span>
                    )}
                  </div>

                  {/* 🆕 Bouton WhatsApp */}
                  {unsent.length > 0 && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={() => {
                          setSelectedFournisseurForCommercial(fName);
                          setShowCommercialModal(true);
                        }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          color: "#374151",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        title="Gérer les commerciaux"
                      >
                        👥 Commerciaux
                      </button>

                      {showCommercialSelect === fName ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select
                            value={selectedCommercial}
                            onChange={(e) => setSelectedCommercial(e.target.value)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              fontSize: 13,
                            }}
                          >
                            <option value="">Fournisseur principal</option>
                            {(commerciaux[fName] || []).map((com) => (
                              <option key={com.id} value={com.telephone}>
                                {com.nom} - {com.telephone}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => sendOrderViaWhatsApp(fName, unsent, selectedCommercial || null)}
                            disabled={sendingWhatsApp}
                            style={{
                              padding: "10px 18px",
                              borderRadius: 10,
                              border: "none",
                              background: sendingWhatsApp
                                ? "linear-gradient(135deg,#9ca3af,#6b7280)"
                                : "linear-gradient(135deg,#22c55e,#16a34a)",
                              color: "#fff",
                              fontSize: 14,
                              fontWeight: 700,
                              cursor: sendingWhatsApp ? "not-allowed" : "pointer",
                            }}
                          >
                            {sendingWhatsApp ? "⏳" : "📲 Envoyer"}
                          </button>
                          <button
                            onClick={() => {
                              setShowCommercialSelect("");
                              setSelectedCommercial("");
                            }}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              color: "#6b7280",
                              fontSize: 14,
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowCommercialSelect(fName)}
                          disabled={sendingWhatsApp}
                          style={{
                            padding: "10px 18px",
                            borderRadius: 10,
                            border: "none",
                            background: sendingWhatsApp
                              ? "linear-gradient(135deg,#9ca3af,#6b7280)"
                              : "linear-gradient(135deg,#22c55e,#16a34a)",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: sendingWhatsApp ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {sendingWhatsApp ? "⏳ Envoi..." : "📲 Envoyer via WhatsApp"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Tableau des lignes */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
                    <thead>
                      <tr style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff" }}>
                        <th style={{ padding: 12, textAlign: "left", fontSize: 13, fontWeight: 700 }}>
                          Produit / Lot
                        </th>
                        <th style={{ padding: 12, textAlign: "left", fontSize: 13, fontWeight: 700 }}>
                          Vente (Client)
                        </th>
                        <th style={{ padding: 12, textAlign: "center", fontSize: 13, fontWeight: 700 }}>
                          Date souhaitée
                        </th>
                        <th style={{ padding: 12, textAlign: "center", fontSize: 13, fontWeight: 700 }}>
                          Quantité
                        </th>
                        <th style={{ padding: 12, textAlign: "center", fontSize: 13, fontWeight: 700 }}>
                          Remise (%)
                        </th>
                        <th style={{ padding: 12, textAlign: "center", fontSize: 13, fontWeight: 700 }}>
                          Urgent
                        </th>
                        <th style={{ padding: 12, textAlign: "center", fontSize: 13, fontWeight: 700 }}>
                          Statut
                        </th>
                        <th style={{ padding: 12, textAlign: "center", fontSize: 13, fontWeight: 700 }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const st = lineStatus[l.key] || {};
                        const isLocked = st.sent || st.locked;

                        const displayNom = l.nom || "Produit";
                        const displayLot = l.lot || "-";
                        const displayDate = l.date || todayISO();
                        const displayQuantite = safeNumber(l.quantite);
                        const displayRemise = safeNumber(l.remise);
                        const displayUrgent = l.urgent;

                        // Vérifie si la ligne a été créée/modifiée après l'envoi
                        const isNewAfterSent = false; // À implémenter si besoin

                        return (
                          <tr
                            key={l.key}
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                              background: st.validated ? "#f0fdf4" : isLocked ? "#fefce8" : "#fff",
                            }}
                          >
                            <td style={{ padding: 10, fontWeight: 700 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span>{displayNom}</span>
                                {displayLot !== "-" && (
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>(Lot: {displayLot})</span>
                                )}
                                {l.stockSource === "stock2" && (
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      background: "linear-gradient(135deg,#10b981,#059669)",
                                      color: "#fff",
                                      borderRadius: 6,
                                      fontSize: 10,
                                      fontWeight: 800,
                                    }}
                                  >
                                    S2
                                  </span>
                                )}
                                {isNewAfterSent && (
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      background: "#dbeafe",
                                      border: "1px solid #93c5fd",
                                      borderRadius: 6,
                                      fontSize: 10,
                                      fontWeight: 800,
                                    }}
                                  >
                                    NOUVEAU
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: 10 }}>
                              {l.client || l.isManual ? (
                                <div style={{ fontSize: 12 }}>
                                  {l.isManual ? (
                                    <span style={{ color: "#6b7280", fontStyle: "italic" }}>Ligne manuelle</span>
                                  ) : (
                                    <>
                                      <div style={{ fontWeight: 600, color: "#374151" }}>{l.client || "-"}</div>
                                      {l.venteDate && (
                                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                                          {formatDateSafe(l.venteDate)}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: "#9ca3af" }}>-</span>
                              )}
                            </td>
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
                                  width: 80,
                                  textAlign: "center",
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                  background: isLocked ? "#f9fafb" : "#fff",
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
                                  width: 100,
                                  textAlign: "center",
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                  background: isLocked ? "#f9fafb" : "#fff",
                                }}
                              />
                            </td>
                            <td style={{ padding: 10, textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={!!displayUrgent}
                                onChange={(e) => !isLocked && setLineField(l.key, "urgent", !!e.target.checked)}
                                disabled={isLocked}
                                style={{ width: 18, height: 18, cursor: isLocked ? "not-allowed" : "pointer" }}
                              />
                            </td>
                            <td style={{ padding: 10, textAlign: "center" }}>
                              {st.validated ? (
                                <span
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: 999,
                                    background: "#dcfce7",
                                    border: "1px solid #86efac",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  ✅ Validé
                                </span>
                              ) : st.sent ? (
                                <span
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: 999,
                                    background: "#fef3c7",
                                    border: "1px solid #fde047",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  📤 Envoyé
                                </span>
                              ) : (
                                <span style={{ color: "#9ca3af", fontSize: 12 }}>⏳ En attente</span>
                              )}
                            </td>
                            <td style={{ padding: 10, textAlign: "center" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                                {!st.validated && st.sent && (
                                  <button
                                    onClick={() => markLineValidated(l.key)}
                                    style={{
                                      background: "linear-gradient(135deg,#22c55e,#16a34a)",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      cursor: "pointer",
                                      fontSize: 13,
                                      fontWeight: 700,
                                    }}
                                    title="Marquer comme validé"
                                  >
                                    ✅ Valider
                                  </button>
                                )}
                                {!isLocked && (
                                  <>
                                    <button
                                      onClick={() => duplicateLine(l.key)}
                                      style={{
                                        background: "linear-gradient(135deg,#60a5fa,#3b82f6)",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 8,
                                        padding: "6px 10px",
                                        cursor: "pointer",
                                        fontSize: 13,
                                      }}
                                      title="Dupliquer"
                                    >
                                      📋
                                    </button>
                                    <button
                                      onClick={() => removeLine(l)}
                                      style={{
                                        background: "linear-gradient(135deg,#ef4444,#dc2626)",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 8,
                                        padding: "6px 10px",
                                        cursor: "pointer",
                                        fontSize: 13,
                                      }}
                                      title="Supprimer"
                                    >
                                      🗑️
                                    </button>
                                  </>
                                )}
                                {isLocked && (
                                  <>
                                    <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>🔒 Verrouillé</span>
                                    <button
                                      onClick={() => deleteLinePermanently(l.key)}
                                      style={{
                                        background: "linear-gradient(135deg,#ef4444,#dc2626)",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 8,
                                        padding: "6px 10px",
                                        cursor: "pointer",
                                        fontSize: 13,
                                        fontWeight: 700,
                                      }}
                                      title="Supprimer définitivement"
                                    >
                                      🗑️ Supprimer
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 🆕 Modal Gestion des Commerciaux */}
      {showCommercialModal && (
        <div
          onClick={(e) => e.target === e.currentTarget && setShowCommercialModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "min(100%, 600px)",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
          >
            {/* En-tête */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "2px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>
                👥 Commerciaux - {selectedFournisseurForCommercial}
              </h2>
              <button
                onClick={() => setShowCommercialModal(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                ×
              </button>
            </div>

            {/* Contenu */}
            <div style={{ padding: 24 }}>
              {/* Formulaire ajout */}
              <div
                style={{
                  background: "linear-gradient(135deg,#f3f4f6,#e5e7eb)",
                  borderRadius: 12,
                  padding: 18,
                  marginBottom: 20,
                }}
              >
                <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "#374151" }}>
                  ➕ Ajouter un commercial
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <input
                    type="text"
                    placeholder="Nom du commercial"
                    value={newCommercialNom}
                    onChange={(e) => setNewCommercialNom(e.target.value)}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      fontSize: 14,
                    }}
                  />
                  <input
                    type="tel"
                    placeholder="Numéro de téléphone (ex: +212...)"
                    value={newCommercialTel}
                    onChange={(e) => setNewCommercialTel(e.target.value)}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      fontSize: 14,
                    }}
                  />
                  <button
                    onClick={addCommercial}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "none",
                      background: "linear-gradient(135deg,#10b981,#059669)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ➕ Ajouter
                  </button>
                </div>
              </div>

              {/* Liste des commerciaux */}
              <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#374151" }}>
                📋 Liste des commerciaux
              </h3>
              {(commerciaux[selectedFournisseurForCommercial] || []).length === 0 ? (
                <p style={{ color: "#6b7280", fontSize: 14, fontStyle: "italic" }}>
                  Aucun commercial enregistré
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(commerciaux[selectedFournisseurForCommercial] || []).map((com) => (
                    <div
                      key={com.id}
                      style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{com.nom}</div>
                        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{com.telephone}</div>
                      </div>
                      <button
                        onClick={() => deleteCommercial(com.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "none",
                          background: "linear-gradient(135deg,#ef4444,#dc2626)",
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        🗑️ Supprimer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// src/components/ventes/Ventes.js
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
  limit,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";

// util id court et stable
const newOpKey = () =>
  `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

/* =====================
   Normalisation Stock (comme dans Stock.js)
===================== */
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
  return "stock1"; // défaut pour compatibilité
};

const pickLotStock = (lot) => {
  if (!lot) return "stock1";
  
  // Priorité aux quantités réelles : si stock1 > 0, alors c'est une vente stock1
  const s1 = Number(lot.stock1 || 0);
  const s2 = Number(lot.stock2 || 0);
  
  if (s1 > 0 && s2 <= 0) return "stock1";
  if (s2 > 0 && s1 <= 0) return "stock2";
  if (s1 > 0 && s2 > 0) {
    // Si les deux stocks ont des quantités, on priorise stock1 (FIFO logique)
    return "stock1";
  }
  
  // Fallback sur les métadonnées du lot
  return pickDocStock(lot);
};

/* =====================
   Utils dates & nombres
===================== */
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

const safeNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const safeToFixed = (v, dec = 2) => safeNumber(v).toFixed(dec);

/* =====================
   Codes-barres
===================== */
const BARCODE_FIELDS = ["codeBarre", "barcode", "ean", "ean13", "upc", "gtin"];
const findAnyBarcode = (obj) => {
  for (const f of BARCODE_FIELDS) {
    const val = obj?.[f];
    if (val != null && String(val).trim() !== "") return String(val);
  }
  return "";
};

/**
 * Composant principal de gestion des ventes (multi-lots + scan + différenciation stock1/stock2)
 */
export default function Ventes() {
  /* ===== Audio (bip) ===== */
  const audioCtxRef = useRef(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        try {
          audioCtxRef.current = new Ctx();
        } catch {}
      }
    }
    return audioCtxRef.current;
  };
  const playBeep = useCallback((freq = 880, dur = 120, type = "sine", volume = 0.15) => {
    try {
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
        try {
          osc.stop();
          osc.disconnect();
          gain.disconnect();
        } catch {}
      }, dur);
    } catch {}
  }, []);
  const beepSuccess = useCallback(() => {
    playBeep(1175, 90);
    setTimeout(() => playBeep(1568, 110), 100);
  }, [playBeep]);
  const beepError = useCallback(() => playBeep(220, 220, "square", 0.2), [playBeep]);

  useEffect(() => {
    const unlock = () => {
      try {
        getAudioCtx()?.resume?.();
      } catch {}
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }, []);

  /* ===== Contexte utilisateur ===== */
  const { user, societeId, loading } = useUserRole();

  /* ===== Etats formulaire / page ===== */
  const [client, setClient] = useState("(passant)");
  const [dateVente, setDateVente] = useState(new Date().toISOString().split("T")[0]);
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

  // anti doublon d'ajout par scan/double clic (fenêtre 400ms)
  const lastAddTsRef = useRef(0);

  /* ===== CHARGEMENT ===== */
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  useEffect(() => {
    if (!societeId) return;

    // Paramètres
    const paramRef = doc(db, "societe", societeId, "parametres", "documents");
    const unsubParam = onSnapshot(
      paramRef,
      (snap) => {
        if (snap.exists()) setParametres(snap.data() || {});
      },
      (e) => console.error("fetchParametres error:", e)
    );

    // Ventes (liste)
    const qVentes = query(collection(db, "societe", societeId, "ventes"), orderBy("date", "desc"), limit(200));
    const unsubVentes = onSnapshot(
      qVentes,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setVentes(arr);
        setClients([...new Set(arr.map((v) => v.client).filter(Boolean))]);
      },
      (e) => {
        console.error("Erreur chargement ventes:", e);
        setError("Erreur lors du chargement des ventes");
      }
    );

    // Lots (stock_entries)
    const qStockEntries = collection(db, "societe", societeId, "stock_entries");
    const unsubStockEntries = onSnapshot(
      qStockEntries,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        // tri nom + exp
        arr.sort((a, b) => {
          const nameA = String(a.nom || a.name || "");
          const nameB = String(b.nom || b.name || "");
          if (nameA !== nameB) return nameA.localeCompare(nameB);
          const da = safeParseDate(a.datePeremption);
          const db = safeParseDate(b.datePeremption);
          if (da && db) return da - db;
          if (da && !db) return -1;
          if (!da && db) return 1;
          return 0;
        });
        setStockEntries(arr);
      },
      (e) => {
        console.error("fetchStockEntries error:", e);
        setStockEntries([]);
      }
    );

    // Stock "traditionnel"
    const qMedic = collection(db, "societe", societeId, "stock");
    const unsubMedic = onSnapshot(
      qMedic,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setMedicaments(arr);
      },
      (e) => console.error("Erreur chargement médicaments:", e)
    );

    return () => {
      unsubParam();
      unsubVentes();
      unsubStockEntries();
      unsubMedic();
    };
  }, [societeId]);

  /* ===== Agrégation "catalogue affiché" (stock + lots) ===== */
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
      });
    });

    (Array.isArray(stockEntries) ? stockEntries : []).forEach((lot) => {
      const key = lot?.nom ?? lot?.name ?? "";
      if (!key) return;
      // Quantité totale = stock1 + stock2
      const qLot = num(lot?.stock1 ?? 0) + num(lot?.stock2 ?? 0);
      const prixLot = num(lot?.prixVente ?? lot?.price ?? 0);

      if (!map.has(key)) map.set(key, { nom: key, quantiteTotal: 0, hasLots: false, lastPrice: 0 });
      const item = map.get(key);
      item.quantiteTotal += qLot;
      if (qLot > 0) item.hasLots = true;
      if (!item.lastPrice && prixLot) item.lastPrice = prixLot;
    });

    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [medicaments, stockEntries]);

  /* ===== Totaux / filtres (hooks au niveau supérieur !) ===== */
  const totalVenteCourante = useMemo(
    () =>
      articles.reduce(
        (t, a) => t + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise)),
        0
      ),
    [articles]
  );

  const ventesFiltrees = useMemo(() => {
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
  }, [ventes, filterStatut, searchTerm]);

  /* =====================
     Gestion formulaire avec détection automatique du stock
  ===================== */
  const handleProduitChange = (value) => {
    setProduit(value);
    setSelectedLot("");
    setAvailableLots([]);

    if (!value) {
      setNumeroArticle("");
      return;
    }

    // Filtrer les lots disponibles (qui ont du stock1 ou stock2 > 0)
    const lotsForProduct = (stockEntries || []).filter((entry) => {
      const nomMatch = (entry.nom || entry.name) === value;
      const hasStock = (safeNumber(entry.stock1) + safeNumber(entry.stock2)) > 0;
      return nomMatch && hasStock;
    });
    setAvailableLots(lotsForProduct);

    if (lotsForProduct.length > 0) {
      setPrixUnitaire(safeNumber(lotsForProduct[0]?.prixVente));
    } else {
      const med = (medicaments || []).find((m) => (m.nom || m.name) === value);
      if (med) setPrixUnitaire(safeNumber(med.prixVente));
    }

    let code = "";
    const lotWithCode = lotsForProduct.find((l) => findAnyBarcode(l));
    if (lotWithCode) code = findAnyBarcode(lotWithCode);
    else {
      const med = (medicaments || []).find((m) => (m.nom || m.name) === value);
      if (med) code = findAnyBarcode(med);
    }
    setNumeroArticle(String(code || ""));
  };

  const handleLotSelection = (lotId) => {
    setSelectedLot(lotId);
    const selectedLotData = (availableLots || []).find((lot) => lot.id === lotId);
    if (selectedLotData) {
      setPrixUnitaire(safeNumber(selectedLotData.prixVente));
      const code = findAnyBarcode(selectedLotData);
      setNumeroArticle(String(code || ""));
    }
  };

  const handleAddArticle = useCallback(
    (e) => {
      e?.preventDefault?.();

      // anti double clic/scan < 400ms
      const now = Date.now();
      if (now - lastAddTsRef.current < 400) return;
      lastAddTsRef.current = now;

      if (!produit || !quantite || (!prixUnitaire && prixUnitaire !== 0)) {
        setError("Veuillez remplir tous les champs obligatoires");
        return;
      }

      let selectedLotData = null;
      let stockSource = "stock1"; // défaut

      if (selectedLot) {
        selectedLotData = (availableLots || []).find((lot) => lot.id === selectedLot);
      } else if (availableLots.length > 0) {
        // Si lots présents mais non sélectionné → premier lot (FIFO UI)
        selectedLotData = availableLots[0];
      }

      // Détection automatique du stock source
      if (selectedLotData) {
        stockSource = pickLotStock(selectedLotData);
        
        // Vérification de la disponibilité dans le bon stock
        const stockDisponible = stockSource === "stock1" 
          ? safeNumber(selectedLotData.stock1) 
          : safeNumber(selectedLotData.stock2);
        
        if (stockDisponible < safeNumber(quantite)) {
          setError(`Stock ${stockSource} insuffisant ! Disponible: ${stockDisponible}`);
          beepError();
          return;
        }
      } else {
        // Pour les produits sans lots, on utilise le stock traditionnel
        const medStock = getAllAvailableMedicaments.find((m) => m.nom === produit);
        if (medStock && medStock.quantiteTotal < safeNumber(quantite)) {
          setError(`Stock insuffisant ! Disponible: ${medStock.quantiteTotal}`);
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
        stockSource: stockSource, // IMPORTANT: stockSource pour différencier les ventes
      };

      if (selectedLotData) {
        articleData.numeroLot = selectedLotData.numeroLot;
        articleData.fournisseur = selectedLotData.fournisseur;
        articleData.datePeremption = selectedLotData.datePeremption;
        articleData.stockEntryId = selectedLotData.id;
        if (!articleData.numeroArticle) {
          articleData.numeroArticle = findAnyBarcode(selectedLotData) || "";
        }
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
    },
    [
      produit,
      quantite,
      prixUnitaire,
      remiseArticle,
      selectedLot,
      availableLots,
      getAllAvailableMedicaments,
      medicaments,
      numeroArticle,
      beepError,
      beepSuccess,
    ]
  );

  const handleRemoveArticle = (idx) => {
    setArticles((prev) => prev.filter((_, i) => i !== idx));
  };

  /* =====================
     Enregistrement ventes avec stockSource
  ===================== */
  const handleAddVente = async (e) => {
    e.preventDefault();
    if (!user || !societeId || !client || !dateVente || articles.length === 0) {
      setError("Veuillez remplir tous les champs et ajouter au moins un article");
      return;
    }
    setIsSaving(true);
    setError("");

    try {
      const montantTotal = articles.reduce(
        (sum, a) => sum + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise)),
        0
      );
      const remiseTotal = articles.reduce((sum, a) => sum + safeNumber(a.remise), 0);

      // Normaliser les articles avec opKey et garder stockSource
      const normalizedArticles = articles.map(a => ({
        ...a,
        opKey: a?.opKey || newOpKey(),
      }));

      // Détermination du stock principal de la vente (majoritaire)
      const stockCounts = { stock1: 0, stock2: 0 };
      normalizedArticles.forEach(a => {
        const source = a.stockSource || "stock1";
        if (source === "stock1") stockCounts.stock1++;
        else if (source === "stock2") stockCounts.stock2++;
      });
      
      const ventePrincipalStock = stockCounts.stock1 >= stockCounts.stock2 ? "stock1" : "stock2";

      // Sécuriser la date (accepte "YYYY-MM-DD")
      const parsedDate = (() => {
        const d = new Date(dateVente);
        return isNaN(d.getTime()) ? new Date() : d;
      })();

      const venteData = {
        client,
        date: Timestamp.fromDate(parsedDate),
        statutPaiement,
        modePaiement,
        articles: normalizedArticles, // Garde stockSource dans chaque article
        montantTotal,
        remiseTotal,
        notes: notesVente,
        updatedAt: Timestamp.now(),
        updatedBy: user.email || user.uid,
        // IMPORTANT: Métadonnées de stock pour le dashboard
        stockSource: ventePrincipalStock,
        stock: ventePrincipalStock,
        stockTag: ventePrincipalStock,
        // Compteurs pour analytics
        articlesStock1: stockCounts.stock1,
        articlesStock2: stockCounts.stock2,
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "societe", societeId, "ventes", editId), venteData);
        setSuccess("Vente modifiée avec succès !");
      } else {
        venteData.createdAt = Timestamp.now();
        venteData.createdBy = user.email || user.uid;
        const added = await addDoc(collection(db, "societe", societeId, "ventes"), venteData);

        if (statutPaiement === "payé") {
          await addDoc(collection(db, "societe", societeId, "paiements"), {
            docId: added.id,
            montant: montantTotal,
            mode: modePaiement,
            type: "ventes",
            date: Timestamp.now(),
            createdBy: user.email || user.uid,
            // Métadonnées de stock pour les paiements aussi
            stockSource: ventePrincipalStock,
            stock: ventePrincipalStock,
          });
        }
        setSuccess("Vente enregistrée avec succès !");
      }

      resetForm();
      setTimeout(() => {
        setShowForm(false);
        setSuccess("");
      }, 1200);
    } catch (err) {
      console.error("Erreur enregistrement vente:", err);
      setError("Erreur lors de l'enregistrement de la vente");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditVente = (vente) => {
    setEditId(vente.id);
    setIsEditing(true);
    setClient(vente.client || "(passant)");
    setDateVente(getDateInputValue(vente.date));
    setStatutPaiement(vente.statutPaiement || "payé");
    setModePaiement(vente.modePaiement || "Espèces");
    setNotesVente(vente.notes || "");
    setArticles(vente.articles || []);
    setShowForm(true);
  };

  const handleDeleteVente = async (vente) => {
    if (
      !window.confirm(
        `Supprimer la vente de ${vente.client} ? ATTENTION : Le stock ne sera PAS restauré automatiquement par cette action.`
      )
    )
      return;
    try {
      await deleteDoc(doc(db, "societe", societeId, "ventes", vente.id));
      setSuccess(
        "Vente supprimée avec succès. Pensez à ajuster le stock manuellement si nécessaire."
      );
      setTimeout(() => setSuccess(""), 2400);
    } catch (err) {
      console.error("Erreur suppression:", err);
      setError("Erreur lors de la suppression");
    }
  };

  const handleViewDetails = (vente) => {
    setSelectedVente(vente);
    setShowDetails(true);
  };

  /* =====================
     Impression
  ===================== */
  const generateCachetHtml = () => {
    if (!parametres.afficherCachet) return "";
    const taille = parametres.tailleCachet || 120;
    if (parametres.typeCachet === "image" && parametres.cachetImage) {
      return `<div style="text-align: center; flex: 1;"><img src="${parametres.cachetImage}" alt="Cachet" style="max-width: ${taille}px; max-height: ${taille}px; border-radius: 8px;" /></div>`;
    }
    return `<div style="text-align: center; flex: 1;"><div style="display: inline-block; border: 3px solid #1976d2; color: #1976d2; border-radius: 50%; padding: 25px 40px; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; background: rgba(25,118,210,.05); box-shadow: 0 4px 8px rgba(25,118,210,.2); transform: rotate(-5deg); max-width: ${taille}px;">${parametres.cachetTexte || "Cachet Société"}</div></div>`;
  };

  const handlePrintVente = (vente) => {
    const articlesV = Array.isArray(vente.articles) ? vente.articles : [];
    const total =
      vente.montantTotal ||
      articlesV.reduce(
        (s, a) => s + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise)),
        0
      );
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
    ${articlesV
      .map((a) => {
        const isExpired = a.datePeremption && safeParseDate(a.datePeremption) < new Date();
        const stockBadge = a.stockSource ? 
          `<span style="background:${a.stockSource === 'stock1' ? '#3b82f6' : '#10b981'};color:#fff;padding:2px 6px;border-radius:8px;font-size:10px;margin-right:4px;">${a.stockSource === 'stock1' ? 'S1' : 'S2'}</span>` : '';
        
        return `<tr><td><strong>${a.produit || ""}</strong>
        ${
          a.numeroArticle || a.numeroLot || a.fournisseur || a.datePeremption || a.stockSource
            ? `<div class="lot-info">
          ${stockBadge}
          ${a.numeroArticle ? `<span style="background:#e0e7ff;color:#4f46e5;padding:2px 6px;border-radius:8px;font-size:10px;margin-right:4px;">N° article: ${a.numeroArticle}</span>` : ""}
          ${a.numeroLot ? `<span style="background:#dcfce7;color:#16a34a;padding:2px 6px;border-radius:8px;font-size:10px;margin-right:4px;">Lot: ${a.numeroLot}</span>` : ""}
          ${a.fournisseur ? `<span style="background:#dbeafe;color:#2563eb;padding:2px 6px;border-radius:8px;font-size:10px;margin-right:4px;">Fournisseur: ${a.fournisseur}</span>` : ""}
          ${a.datePeremption ? `<div style="margin-top:4px;">Expiration: <span style="color:${isExpired ? "#dc2626" : "#6b7280"};font-weight:600;">${formatDateSafe(a.datePeremption)}${isExpired ? " ⚠️ EXPIRÉ" : ""}</span></div>` : ""}
          </div>`
            : ""
        }
        </td><td>${safeNumber(a.quantite)}</td><td>${safeToFixed(a.prixUnitaire)} DH</td><td>${safeToFixed(a.remise)} DH</td><td style="font-weight:600;">${safeToFixed(
          safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise)
        )} DH</td></tr>`;
      })
      .join("")}
    </tbody></table>
    <div class="totals"><div style="font-size:20px;font-weight:bold;">TOTAL: ${safeToFixed(total)} DH</div></div>
    ${vente.notes ? `<div style="margin-top:20px;padding:15px;background:#fef3c7;border-left:5px solid #f59e0b;"><strong>Notes:</strong> ${vente.notes}</div>` : ""}
    <div class="signature-section"><div class="signature-box"><div class="signature-line"></div><p>Signature Client</p></div>${cachetHtml}<div class="signature-box"><div class="signature-line"></div><p>Signature Vendeur</p></div></div>
    <div class="footer"><p>${parametres.pied}</p><p style="font-size:12px;color:#6b7280;margin-top:10px;">Document imprimé le ${new Date().toLocaleString(
      "fr-FR"
    )} par ${user?.email || "Utilisateur"}</p></div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  /* =====================
     Utils
  ===================== */
  const resetForm = () => {
    setClient("(passant)");
    setDateVente(new Date().toISOString().split("T")[0]);
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
  };

  /* =====================
     Scan code-barres
  ===================== */
  const onBarcodeDetected = useCallback(
    (barcode) => {
      try {
        const isMatch = (obj) => BARCODE_FIELDS.some((f) => String(obj?.[f] || "") === String(barcode));

        setNumeroArticle(String(barcode || "")); // Remplit le champ

        // Priorité lots
        const fromEntry =
          (Array.isArray(stockEntries) ? stockEntries : []).find((p) => isMatch(p)) || null;
        const fromMed = !fromEntry
          ? (Array.isArray(medicaments) ? medicaments : []).find((m) => isMatch(m))
          : null;
        const found = fromEntry || fromMed;
        if (!found) {
          beepError();
          setError(`Aucun produit trouvé pour le code : ${barcode}`);
          return;
        }

        const nom = found.nom || found.name || "";
        setProduit(nom || "");
        setQuantite(1);

        const pV = safeNumber(found.prixVente ?? found.prixUnitaire ?? found.prixAchat ?? 0);
        if (pV > 0) setPrixUnitaire(pV);

        const lotsForProduct = (Array.isArray(stockEntries) ? stockEntries : []).filter(
          (e) => (e.nom || e.name) === nom && (safeNumber(e.stock1) + safeNumber(e.stock2)) > 0
        );
        setAvailableLots(lotsForProduct || []);

        // auto-sélection si un seul lot
        if (lotsForProduct?.length === 1) {
          setSelectedLot(lotsForProduct[0]?.id || lotsForProduct[0]?.numeroLot || "");
          const code = findAnyBarcode(lotsForProduct[0]) || "";
          setNumeroArticle(String(code || barcode || ""));
        }

        const multipleLots = Array.isArray(lotsForProduct) && lotsForProduct.length > 1;
        const canAutoAdd = Boolean(nom && pV > 0 && (!multipleLots || selectedLot));

        if (canAutoAdd) {
          beepSuccess();
          setTimeout(() => {
            try {
              handleAddArticle?.({ preventDefault: () => {} });
            } catch {}
          }, 40);
        } else if (multipleLots) {
          setError("Plusieurs lots disponibles. Choisissez un lot avant l'ajout.");
          beepError();
        }
      } catch (e) {
        console.error(e);
        beepError();
        setError("Erreur détecteur code-barres");
      }
    },
    [stockEntries, medicaments, selectedLot, handleAddArticle, beepSuccess, beepError]
  );

  // douchette USB (wedge)
  useEffect(() => {
    const opts = { minChars: 6, endKey: "Enter", timeoutMs: 250 };
    const state = { buf: "", timer: null };

    const onKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === opts.endKey) {
        const code = state.buf;
        state.buf = "";
        clearTimeout(state.timer);
        if (code && code.length >= opts.minChars) onBarcodeDetected(code);
        return;
      }
      if (e.key && e.key.length === 1) {
        state.buf += e.key;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
          const code = state.buf;
          state.buf = "";
          if (code && code.length >= opts.minChars) onBarcodeDetected(code);
        }, opts.timeoutMs);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(state.timer);
    };
  }, [onBarcodeDetected]);

  /* =====================
     Rendu (hooks déjà tous déclarés ci-dessus)
  ===================== */
  if (waiting) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: 40,
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              border: "4px solid rgba(255, 255, 255, 0.3)",
              borderTop: "4px solid white",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 20px",
            }}
          />
          <h3 style={{ margin: 0, fontSize: 18 }}>Chargement en cours...</h3>
          <style>
            {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
          </style>
        </div>
      </div>
    );
  }

  if (!user || !societeId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
          color: "white",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: 40,
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <h3 style={{ margin: "0 0 10px", fontSize: 18 }}>Accès non autorisé</h3>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Utilisateur non connecté ou société non sélectionnée.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: 20,
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          padding: 30,
          marginBottom: 30,
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 800,
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Gestion des Ventes
            </h1>
            <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 16 }}>
              Système de vente multi-lots.
            </p>
          </div>

          <button
            onClick={() => {
              setShowForm((v) => !v);
              if (!showForm) resetForm();
            }}
            style={{
              background: showForm
                ? "linear-gradient(135deg, #ef4444, #dc2626)"
                : "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "white",
              border: "none",
              padding: "16px 32px",
              borderRadius: 16,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 8px 25px rgba(59, 130, 246, 0.3)",
              transform: "translateY(0)",
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 12px 35px rgba(59, 130, 246, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 8px 25px rgba(59, 130, 246, 0.3)";
            }}
          >
            {showForm ? "✕ Fermer" : "+ Nouvelle Vente"}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          style={{
            background: "rgba(254, 226, 226, 0.95)",
            backdropFilter: "blur(10px)",
            color: "#dc2626",
            padding: 20,
            borderRadius: 16,
            marginBottom: 24,
            border: "1px solid rgba(220, 38, 38, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 8px 25px rgba(220, 38, 38, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "#dc2626",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              !
            </div>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            style={{
              background: "none",
              border: "none",
              color: "#dc2626",
              cursor: "pointer",
              fontSize: 24,
              padding: 4,
              borderRadius: 8,
              transition: "background 0.2s ease",
            }}
            onMouseEnter={(e) => (e.target.style.background = "rgba(220, 38, 38, 0.1)")}
            onMouseLeave={(e) => (e.target.style.background = "none")}
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div
          style={{
            background: "rgba(220, 252, 231, 0.95)",
            backdropFilter: "blur(10px)",
            color: "#16a34a",
            padding: 20,
            borderRadius: 16,
            marginBottom: 24,
            border: "1px solid rgba(22, 163, 74, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 8px 25px rgba(22, 163, 74, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "#16a34a",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              ✓
            </div>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{success}</span>
          </div>
          <button
            onClick={() => setSuccess("")}
            style={{
              background: "none",
              border: "none",
              color: "#16a34a",
              cursor: "pointer",
              fontSize: 24,
              padding: 4,
              borderRadius: 8,
              transition: "background 0.2s ease",
            }}
            onMouseEnter={(e) => (e.target.style.background = "rgba(22, 163, 74, 0.1)")}
            onMouseLeave={(e) => (e.target.style.background = "none")}
          >
            ×
          </button>
        </div>
      )}

      {/* Formulaire */}
      {showForm && (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(20px)",
            borderRadius: 24,
            padding: 32,
            marginBottom: 30,
            border: "1px solid rgba(255, 255, 255, 0.2)",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)",
          }}
        >
          <h2
            style={{
              margin: "0 0 32px",
              fontSize: 28,
              fontWeight: 700,
              color: "#1f2937",
              textAlign: "center",
            }}
          >
            {isEditing ? "Modifier la vente" : "Nouvelle vente"}
          </h2>

          {/* Zone scan */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0 18px" }}>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              style={{ borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
            >
              📷 Scanner avec caméra
            </button>
            <CameraBarcodeInlineModal
              open={showScanner}
              onClose={() => setShowScanner(false)}
              onDetected={(code) => {
                onBarcodeDetected(code);
                setShowScanner(false);
              }}
            />
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              (Ou scannez avec votre douchette : validation via <b>Entrée</b>)
            </span>
          </div>

          {/* Ajout d'articles */}
          <div
            style={{
              background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
              borderRadius: 20,
              padding: 24,
              marginBottom: 24,
              border: "2px solid #0ea5e9",
            }}
          >
            <h3 style={{ margin: "0 0 24px", color: "#0c4a6e", fontSize: 20, fontWeight: 600 }}>
              Ajouter des articles (détection automatique du stock)
            </h3>

            <form onSubmit={handleAddArticle}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: 20,
                  marginBottom: 24,
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    Médicament *
                  </label>
                  <select
                    value={produit}
                    onChange={(e) => handleProduitChange(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  >
                    <option value="">-- Sélectionner un médicament --</option>
                    {getAllAvailableMedicaments.map((m) => (
                      <option key={m.nom} value={m.nom}>
                        {m.nom} ({m.hasLots ? "Lots" : "Stock"}: {m.quantiteTotal})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    Quantité *
                  </label>
                  <input
                    type="number"
                    value={quantite}
                    onChange={(e) => setQuantite(e.target.value)}
                    required
                    min={1}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    Prix unitaire (DH) *
                  </label>
                  <input
                    type="number"
                    value={prixUnitaire}
                    onChange={(e) => setPrixUnitaire(e.target.value)}
                    required
                    min={0}
                    step="0.01"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    Remise (DH)
                  </label>
                  <input
                    type="number"
                    value={remiseArticle}
                    onChange={(e) => setRemiseArticle(e.target.value)}
                    min={0}
                    step="0.01"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    N° article (code-barres) — optionnel
                  </label>
                  <input
                    type="text"
                    value={numeroArticle}
                    onChange={(e) => setNumeroArticle(e.target.value)}
                    placeholder="Scannez ou saisissez le code-barres"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>
              </div>

              {/* Lots avec indication de stock */}
              {availableLots.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 16,
                    }}
                  >
                    Sélectionner un lot spécifique (FIFO recommandé)
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                      gap: 16,
                    }}
                  >
                    {availableLots.map((lot) => {
                      const lotDate = safeParseDate(lot.datePeremption);
                      const isExpired = lotDate && lotDate < new Date();
                      const isExpSoon =
                        lotDate && !isExpired && lotDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                      
                      // Indication des stocks
                      const s1 = safeNumber(lot.stock1);
                      const s2 = safeNumber(lot.stock2);
                      const stockInfo = `S1: ${s1} | S2: ${s2}`;
                      const primaryStock = s1 > 0 ? "stock1" : s2 > 0 ? "stock2" : "stock1";
                      
                      return (
                        <div
                          key={lot.id}
                          onClick={() => handleLotSelection(lot.id)}
                          style={{
                            padding: 16,
                            borderRadius: 16,
                            cursor: "pointer",
                            transition: "all 0.3s ease",
                            border: selectedLot === lot.id ? "3px solid #10b981" : "2px solid #e5e7eb",
                            background:
                              selectedLot === lot.id
                                ? "linear-gradient(135deg, #dcfce7, #bbf7d0)"
                                : isExpired
                                ? "linear-gradient(135deg, #fee2e2, #fecaca)"
                                : isExpSoon
                                ? "linear-gradient(135deg, #fef3c7, #fed7aa)"
                                : "linear-gradient(135deg, #f9fafb, #f3f4f6)",
                            transform: selectedLot === lot.id ? "scale(1.02)" : "scale(1)",
                            boxShadow:
                              selectedLot === lot.id
                                ? "0 12px 25px rgba(16, 185, 129, 0.2)"
                                : "0 4px 12px rgba(0, 0, 0, 0.05)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: "#1f2937" }}>
                              Lot: {lot.numeroLot}
                            </span>
                            <span
                              style={{
                                background: primaryStock === "stock1" ? "#3b82f6" : "#10b981",
                                color: "white",
                                padding: "4px 12px",
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {stockInfo}
                            </span>
                          </div>
                          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
                            <span
                              style={{
                                background: "#dbeafe",
                                color: "#2563eb",
                                padding: "2px 8px",
                                borderRadius: 12,
                                marginRight: 8,
                                fontSize: 12,
                                fontWeight: 500,
                              }}
                            >
                              {lot.fournisseur}
                            </span>
                            <span
                              style={{
                                background: "#f3e8ff",
                                color: "#7c3aed",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {safeToFixed(lot.prixVente)} DH
                            </span>
                            <span
                              style={{
                                background: primaryStock === "stock1" ? "#dbeafe" : "#dcfce7",
                                color: primaryStock === "stock1" ? "#2563eb" : "#16a34a",
                                padding: "2px 8px",
                                borderRadius: 12,
                                marginLeft: 8,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              → {primaryStock.toUpperCase()}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: isExpired ? "#dc2626" : isExpSoon ? "#d97706" : "#16a34a",
                            }}
                          >
                            Exp: {formatDateSafe(lot.datePeremption)}
                            {isExpired && " ⚠️ EXPIRÉ"}
                            {isExpSoon && " ⏰ Expire bientôt"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    color: "white",
                    border: "none",
                    padding: "14px 32px",
                    borderRadius: 16,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: isSaving ? "not-allowed" : "pointer",
                    opacity: isSaving ? 0.7 : 1,
                    transition: "all 0.3s ease",
                    boxShadow: "0 8px 25px rgba(16, 185, 129, 0.3)",
                    transform: "translateY(0)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving) {
                      e.target.style.transform = "translateY(-2px)";
                      e.target.style.boxShadow = "0 12px 35px rgba(16, 185, 129, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "0 8px 25px rgba(16, 185, 129, 0.3)";
                  }}
                >
                  {isSaving ? "Ajout..." : "Ajouter l'article"}
                </button>
              </div>
            </form>
          </div>

          {/* Liste des articles avec indication du stock source */}
          {articles.length > 0 && (
            <div
              style={{
                background: "linear-gradient(135deg, #fff7ed, #fed7aa)",
                borderRadius: 20,
                padding: 24,
                marginBottom: 24,
                border: "2px solid #f97316",
              }}
            >
              <h3
                style={{
                  margin: "0 0 20px",
                  color: "#c2410c",
                  fontSize: 20,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Articles de la vente ({articles.length})
              </h3>

              <div style={{ background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 25px rgba(0, 0, 0, 0.1)" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "white" }}>
                        <th style={{ padding: 16, textAlign: "left", fontWeight: 600, fontSize: 14, letterSpacing: "0.5px" }}>
                          Produit / Traçabilité
                        </th>
                        <th style={{ padding: 16, textAlign: "center", fontWeight: 600, fontSize: 14 }}>Qté</th>
                        <th style={{ padding: 16, textAlign: "right", fontWeight: 600, fontSize: 14 }}>Prix unit.</th>
                        <th style={{ padding: 16, textAlign: "right", fontWeight: 600, fontSize: 14 }}>Remise</th>
                        <th style={{ padding: 16, textAlign: "right", fontWeight: 600, fontSize: 14 }}>Total</th>
                        <th style={{ padding: 16, textAlign: "center", fontWeight: 600, fontSize: 14, width: 60 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articles.map((a, i) => (
                        <tr
                          key={i}
                          style={{ borderBottom: "1px solid #f3f4f6", transition: "background 0.2s ease" }}
                          onMouseEnter={(e) => (e.target.closest("tr").style.background = "#fafafa")}
                          onMouseLeave={(e) => (e.target.closest("tr").style.background = "white")}
                        >
                          <td style={{ padding: 16 }}>
                            <div style={{ fontWeight: 600, color: "#1f2937", marginBottom: 4 }}>{a.produit}</div>
                            {(a.numeroArticle || a.numeroLot || a.fournisseur || a.datePeremption || a.stockSource) && (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#6b7280",
                                  background: "#f8fafc",
                                  padding: 8,
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                }}
                              >
                                {a.stockSource && (
                                  <span
                                    style={{
                                      background: a.stockSource === "stock1" ? "#3b82f6" : "#10b981",
                                      color: "white",
                                      padding: "2px 6px",
                                      borderRadius: 8,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      marginRight: 6,
                                    }}
                                  >
                                    {a.stockSource === "stock1" ? "S1" : "S2"}
                                  </span>
                                )}
                                {a.numeroArticle && (
                                  <span
                                    style={{
                                      background: "#e0e7ff",
                                      color: "#4f46e5",
                                      padding: "2px 6px",
                                      borderRadius: 8,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      marginRight: 6,
                                    }}
                                  >
                                    N° article: {a.numeroArticle}
                                  </span>
                                )}
                                {a.numeroLot && (
                                  <span
                                    style={{
                                      background: "#dcfce7",
                                      color: "#16a34a",
                                      padding: "2px 6px",
                                      borderRadius: 8,
                                      fontSize: 11,
                                      fontWeight: 500,
                                      marginRight: 6,
                                    }}
                                  >
                                    Lot: {a.numeroLot}
                                  </span>
                                )}
                                {a.fournisseur && (
                                  <span
                                    style={{
                                      background: "#dbeafe",
                                      color: "#2563eb",
                                      padding: "2px 6px",
                                      borderRadius: 8,
                                      fontSize: 11,
                                      fontWeight: 500,
                                      marginRight: 6,
                                    }}
                                  >
                                    {a.fournisseur}
                                  </span>
                                )}
                                {a.datePeremption && (
                                  <div style={{ marginTop: 4, fontSize: 11 }}>Exp: {formatDateSafe(a.datePeremption)}</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 16, textAlign: "center", fontWeight: 600, fontSize: 16 }}>
                            {safeNumber(a.quantite)}
                          </td>
                          <td style={{ padding: 16, textAlign: "right", fontWeight: 500, fontSize: 15 }}>
                            {safeToFixed(a.prixUnitaire)} DH
                          </td>
                          <td
                            style={{
                              padding: 16,
                              textAlign: "right",
                              fontWeight: 500,
                              fontSize: 15,
                              color: safeNumber(a.remise) > 0 ? "#dc2626" : "#6b7280",
                            }}
                          >
                            {safeToFixed(a.remise)} DH
                          </td>
                          <td style={{ padding: 16, textAlign: "right", fontWeight: 700, fontSize: 16, color: "#16a34a" }}>
                            {safeToFixed(safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise))} DH
                          </td>
                          <td style={{ padding: 16, textAlign: "center" }}>
                            <button
                              onClick={() => handleRemoveArticle(i)}
                              style={{
                                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                color: "white",
                                border: "none",
                                borderRadius: 8,
                                padding: "6px 12px",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 600,
                                transition: "all 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.transform = "scale(1.05)";
                                e.target.style.boxShadow = "0 4px 12px rgba(239, 68, 68, 0.3)";
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.transform = "scale(1)";
                                e.target.style.boxShadow = "none";
                              }}
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", borderTop: "2px solid #16a34a" }}>
                        <td
                          colSpan={4}
                          style={{ padding: 20, textAlign: "right", fontSize: 18, fontWeight: 700, color: "#15803d" }}
                        >
                          TOTAL DE LA VENTE
                        </td>
                        <td style={{ padding: 20, textAlign: "right", fontSize: 22, fontWeight: 800, color: "#16a34a" }}>
                          {safeToFixed(totalVenteCourante)} DH
                        </td>
                        <td style={{ padding: 20 }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Finalisation */}
          <div
            style={{
              background: "linear-gradient(135deg, #f3e8ff, #e9d5ff)",
              borderRadius: 20,
              padding: 24,
              border: "2px solid #8b5cf6",
            }}
          >
            <h3 style={{ margin: "0 0 24px", color: "#581c87", fontSize: 20, fontWeight: 600 }}>
              Finaliser la vente
            </h3>

            <form onSubmit={handleAddVente}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: 20,
                  marginBottom: 24,
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    Client *
                  </label>
                  <input
                    type="text"
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    required
                    placeholder="Nom du client"
                    list="clients-list"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#8b5cf6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                  <datalist id="clients-list">{clients.map((c) => <option key={c} value={c} />)}</datalist>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    Date de vente *
                  </label>
                  <input
                    type="date"
                    value={dateVente}
                    onChange={(e) => setDateVente(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#8b5cf6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    Statut de paiement
                  </label>
                  <select
                    value={statutPaiement}
                    onChange={(e) => setStatutPaiement(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#8b5cf6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  >
                    <option value="payé">Payé</option>
                    <option value="partiel">Partiel</option>
                    <option value="impayé">Impayé</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                    Mode de paiement
                  </label>
                  <select
                    value={modePaiement}
                    onChange={(e) => setModePaiement(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "2px solid #e5e7eb",
                      fontSize: 16,
                      background: "white",
                      transition: "all 0.2s ease",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#8b5cf6")}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  >
                    <option value="Espèces">Espèces</option>
                    <option value="Carte">Carte bancaire</option>
                    <option value="Chèque">Chèque</option>
                    <option value="Virement">Virement</option>
                    <option value="Crédit">Crédit</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                  Notes / Observations
                </label>
                <textarea
                  value={notesVente}
                  onChange={(e) => setNotesVente(e.target.value)}
                  rows={3}
                  placeholder="Notes optionnelles sur la vente..."
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "2px solid #e5e7eb",
                    fontSize: 16,
                    background: "white",
                    transition: "all 0.2s ease",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#8b5cf6")}
                  onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                />
              </div>

              <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                {isEditing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    style={{
                      background: "linear-gradient(135deg, #6b7280, #4b5563)",
                      color: "white",
                      border: "none",
                      padding: "14px 32px",
                      borderRadius: 16,
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      boxShadow: "0 8px 25px rgba(107, 114, 128, 0.3)",
                      transform: "translateY(0)",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = "translateY(-2px)";
                      e.target.style.boxShadow = "0 12px 35px rgba(107, 114, 128, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = "translateY(0)";
                      e.target.style.boxShadow = "0 8px 25px rgba(107, 114, 128, 0.3)";
                    }}
                  >
                    Annuler
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isSaving || articles.length === 0}
                  style={{
                    background: isEditing ? "linear-gradient(135deg, #f59e0b, #d97706)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                    color: "white",
                    border: "none",
                    padding: "16px 40px",
                    borderRadius: 16,
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: isSaving || articles.length === 0 ? "not-allowed" : "pointer",
                    opacity: isSaving || articles.length === 0 ? 0.6 : 1,
                    transition: "all 0.3s ease",
                    boxShadow: "0 12px 35px rgba(139, 92, 246, 0.4)",
                    transform: "translateY(0)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving && articles.length > 0) {
                      e.target.style.transform = "translateY(-3px)";
                      e.target.style.boxShadow = "0 16px 45px rgba(139, 92, 246, 0.5)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "0 12px 35px rgba(139, 92, 246, 0.4)";
                  }}
                >
                  {isSaving ? "Enregistrement..." : isEditing ? "Modifier la vente" : "Enregistrer la vente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 12px 30px rgba(0, 0, 0, 0.08)",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1", minWidth: 250 }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher client, produit, numéro de lot ou N° article..."
              style={{
                width: "100%",
                padding: "12px 20px",
                borderRadius: 25,
                border: "2px solid #e5e7eb",
                fontSize: 16,
                background: "white",
                transition: "all 0.3s ease",
                outline: "none",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#3b82f6";
                e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e5e7eb";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            style={{
              padding: "12px 20px",
              borderRadius: 25,
              border: "2px solid #e5e7eb",
              fontSize: 16,
              background: "white",
              transition: "all 0.3s ease",
              outline: "none",
              minWidth: 180,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#3b82f6";
              e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.boxShadow = "none";
            }}
          >
            <option value="">Tous les statuts</option>
            <option value="payé">Payé</option>
            <option value="partiel">Partiel</option>
            <option value="impayé">Impayé</option>
          </select>

          {(searchTerm || filterStatut) && (
            <button
              onClick={() => {
                setSearchTerm("");
                setFilterStatut("");
              }}
              style={{
                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                color: "white",
                border: "none",
                padding: "12px 20px",
                borderRadius: 25,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: "0 6px 20px rgba(239, 68, 68, 0.3)",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 8px 25px rgba(239, 68, 68, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 6px 20px rgba(239, 68, 68, 0.3)";
              }}
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Tableau des ventes */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
          <table style={{ width: "100%", minWidth: 1000, borderCollapse: "collapse" }}>
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "linear-gradient(135deg, #1e293b, #334155)",
                color: "white",
                zIndex: 10,
              }}
            >
              <tr>
                <th style={{ padding: 20, textAlign: "left", fontWeight: 700, fontSize: 14, letterSpacing: "0.5px", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                  N° VENTE
                </th>
                <th style={{ padding: 20, textAlign: "left", fontWeight: 700, fontSize: 14, letterSpacing: "0.5px", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                  CLIENT
                </th>
                <th style={{ padding: 20, textAlign: "center", fontWeight: 700, fontSize: 14, letterSpacing: "0.5px", borderRight: '1px solid #f1f5f9' }}>
                  DATE
                </th>
                <th style={{ padding: 20, textAlign: "center", fontWeight: 700, fontSize: 14, letterSpacing: "0.5px", borderRight: '1px solid #f1f5f9' }}>
                  ARTICLES / STOCK
                </th>
                <th style={{ padding: 20, textAlign: "center", fontWeight: 700, fontSize: 14, letterSpacing: "0.5px", borderRight: '1px solid #f1f5f9' }}>
                  STATUT
                </th>
                <th style={{ padding: 20, textAlign: "right", fontWeight: 700, fontSize: 14, letterSpacing: "0.5px", borderRight: '1px solid #f1f5f9' }}>
                  TOTAL
                </th>
                <th style={{ padding: 20, textAlign: "center", fontWeight: 700, fontSize: 14, letterSpacing: "0.5px", width: 220 }}>
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {ventesFiltrees.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "60px 20px", textAlign: "center", color: "#6b7280", fontSize: 18, fontWeight: 500 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #e5e7eb, #d1d5db)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                        📊
                      </div>
                      <div>
                        <h3 style={{ margin: "0 0 8px", color: "#374151" }}>
                          {ventes.length === 0 ? "Aucune vente enregistrée" : "Aucun résultat"}
                        </h3>
                        <p style={{ margin: 0, color: "#9ca3af" }}>
                          {ventes.length === 0
                            ? "Commencez par créer votre première vente"
                            : "Aucune vente ne correspond aux critères de filtrage"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                ventesFiltrees.map((v, index) => {
                  const total =
                    v.montantTotal ||
                    (Array.isArray(v.articles) ? v.articles : []).reduce(
                      (sum, a) => sum + (safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise || 0)),
                      0
                    );
                  const articlesAvecLots = (v.articles || []).filter((a) => a.numeroLot || a.numeroArticle).length;
                  const totalArticles = (v.articles || []).length;
                  
                  // Comptage des articles par stock
                  const stockCounts = { stock1: 0, stock2: 0, unknown: 0 };
                  (v.articles || []).forEach(a => {
                    const source = a.stockSource || "unknown";
                    if (source === "stock1") stockCounts.stock1++;
                    else if (source === "stock2") stockCounts.stock2++;
                    else stockCounts.unknown++;
                  });
                  
                  const principalStock = v.stockSource || v.stock || "stock1";
                  
                  return (
                    <tr
                      key={v.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: "all 0.3s ease",
                        background: index % 2 === 0 ? "rgba(248, 250, 252, 0.5)" : "white",
                        borderLeft: principalStock === "stock2" ? "4px solid #10b981" : "4px solid #3b82f6",
                      }}
                      onMouseEnter={(e) => {
                        const tr = e.target.closest("tr");
                        tr.style.background = principalStock === "stock2" 
                          ? "linear-gradient(135deg, #f0fdf4, #dcfce7)" 
                          : "linear-gradient(135deg, #f0f9ff, #e0f2fe)";
                        tr.style.transform = "scale(1.001)";
                        tr.style.boxShadow = `0 4px 20px ${principalStock === "stock2" ? "rgba(16, 185, 129, 0.1)" : "rgba(59, 130, 246, 0.1)"}`;
                      }}
                      onMouseLeave={(e) => {
                        const tr = e.target.closest("tr");
                        tr.style.background = index % 2 === 0 ? "rgba(248, 250, 252, 0.5)" : "white";
                        tr.style.transform = "scale(1)";
                        tr.style.boxShadow = "none";
                      }}
                    >
                      <td style={{ padding: 20, borderRight: '1px solid #f1f5f9' }}>
                        <div
                          style={{
                            background: principalStock === "stock2" 
                              ? "linear-gradient(135deg, #10b981, #059669)"
                              : "linear-gradient(135deg, #3b82f6, #2563eb)",
                            color: "white",
                            padding: "6px 12px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: "0.5px",
                            display: "inline-block",
                          }}
                        >
                          #{(v.id || "").slice(-6).toUpperCase()}
                        </div>
                      </td>
                      <td style={{ padding: 20, borderRight: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: 600, fontSize: 16, color: "#1f2937", marginBottom: 4 }}>{v.client}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", background: "#f8fafc", padding: "2px 8px", borderRadius: 8, display: "inline-block" }}>
                          {v.modePaiement || "Espèces"}
                        </div>
                      </td>
                      <td style={{ padding: 20, textAlign: "center", borderRight: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{formatDateSafe(v.date)}</div>
                      </td>
                      <td style={{ padding: 20, textAlign: "center", borderRight: '1px solid #f1f5f9' }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                          <span
                            style={{
                              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                              color: "white",
                              padding: "4px 8px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {totalArticles} art.
                          </span>
                          {stockCounts.stock1 > 0 && (
                            <span
                              style={{
                                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                                color: "white",
                                padding: "2px 6px",
                                borderRadius: 8,
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                              title={`${stockCounts.stock1} articles depuis Stock1`}
                            >
                              S1:{stockCounts.stock1}
                            </span>
                          )}
                          {stockCounts.stock2 > 0 && (
                            <span
                              style={{
                                background: "linear-gradient(135deg, #10b981, #059669)",
                                color: "white",
                                padding: "2px 6px",
                                borderRadius: 8,
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                              title={`${stockCounts.stock2} articles depuis Stock2`}
                            >
                              S2:{stockCounts.stock2}
                            </span>
                          )}
                          {articlesAvecLots > 0 && (
                            <span
                              style={{
                                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                                color: "white",
                                padding: "2px 6px",
                                borderRadius: 8,
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                              title={`${articlesAvecLots} articles avec traçabilité`}
                            >
                              🏷️{articlesAvecLots}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: 20, textAlign: "center", borderRight: '1px solid #f1f5f9' }}>
                        <span
                          style={{
                            background:
                              v.statutPaiement === "payé"
                                ? "linear-gradient(135deg, #22c55e, #16a34a)"
                                : v.statutPaiement === "partiel"
                                ? "linear-gradient(135deg, #eab308, #ca8a04)"
                                : "linear-gradient(135deg, #ef4444, #dc2626)",
                            color: "white",
                            padding: "6px 16px",
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: "capitalize",
                          }}
                        >
                          {v.statutPaiement}
                        </span>
                      </td>
                      <td style={{ padding: 20, textAlign: "right", borderRight: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#16a34a" }}>{safeToFixed(total)} DH</div>
                      </td>
                      <td style={{ padding: 20, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          <span
                            onClick={() => handleViewDetails(v)}
                            style={{ cursor: "pointer", fontSize: 18, transition: "transform 0.2s ease" }}
                            onMouseEnter={(e) => (e.target.style.transform = "scale(1.2)")}
                            onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
                            title="Voir les détails"
                          >
                            👁️
                          </span>
                          <span
                            onClick={() => handleEditVente(v)}
                            style={{ cursor: "pointer", fontSize: 18, marginRight: 10, transition: "transform 0.2s ease" }}
                            onMouseEnter={(e) => (e.target.style.transform = "scale(1.2)")}
                            onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
                            title="Modifier"
                          >
                            ✏️
                          </span>
                          <span
                            onClick={() => handlePrintVente(v)}
                            style={{ cursor: "pointer", fontSize: 18, marginRight: 10, transition: "transform 0.2s ease" }}
                            onMouseEnter={(e) => (e.target.style.transform = "scale(1.2)")}
                            onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
                            title="Imprimer"
                          >
                            🖨️
                          </span>
                          <span
                            onClick={() => handleDeleteVente(v)}
                            style={{ cursor: "pointer", fontSize: 18, transition: "transform 0.2s ease" }}
                            onMouseEnter={(e) => (e.target.style.transform = "scale(1.2)")}
                            onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
                            title="Supprimer"
                          >
                            🗑️
                          </span>
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

      {/* Modal de détails via Portal */}
      {showDetails &&
        selectedVente &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Détails de la vente ${(selectedVente?.id || "").slice(-6).toUpperCase()}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowDetails(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20000,
              backdropFilter: "blur(5px)",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #ffffff, #f9fafb)",
                borderRadius: 20,
                padding: 16,
                width: "min(100%, 980px)",
                maxHeight: "90vh",
                overflowY: "auto",
                overflowX: "hidden",
                boxShadow: "0 20px 50px rgba(0, 0, 0, 0.2)",
                border: "1px solid rgba(0, 0, 0, 0.05)",
                position: "relative",
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowDetails(false);
              }}
              tabIndex={-1}
            >
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: "linear-gradient(135deg, #ffffff, #f9fafb)",
                  padding: "12px 40px 12px 12px",
                  margin: "-16px -16px 16px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  display: "flex",
                  alignItems: "center",
                  minHeight: 48,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: "clamp(18px, 2.5vw, 28px)",
                    fontWeight: 700,
                    color: "#1f2937",
                    lineHeight: 1.2,
                    flex: 1,
                  }}
                >
                  Détails de la vente #{(selectedVente?.id || "").slice(-6).toUpperCase()}
                  {selectedVente?.stockSource && (
                    <span
                      style={{
                        marginLeft: 12,
                        background: selectedVente.stockSource === "stock2" 
                          ? "linear-gradient(135deg, #10b981, #059669)"
                          : "linear-gradient(135deg, #3b82f6, #2563eb)",
                        color: "white",
                        padding: "4px 12px",
                        borderRadius: 12,
                        fontSize: "clamp(12px, 1.5vw, 16px)",
                        fontWeight: 600,
                      }}
                    >
                      {selectedVente.stockSource === "stock2" ? "STOCK 2" : "STOCK 1"}
                    </span>
                  )}
                </h2>
                <button
                  onClick={() => setShowDetails(false)}
                  aria-label="Fermer"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    width: 36,
                    height: 36,
                    display: "grid",
                    placeItems: "center",
                    background: "transparent",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 24,
                    lineHeight: 1,
                    color: "#111827",
                    cursor: "pointer",
                    transition: "background 0.2s ease, transform 0.1s ease",
                    zIndex: 3,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                <div style={{ background: "linear-gradient(135deg, #dbeafe, #bfdbfe)", borderRadius: 14, padding: 16, boxShadow: "0 4px 15px rgba(59, 130, 246, 0.08)" }}>
                  <h4 style={{ margin: "0 0 6px", color: "#1d4ed8", fontSize: 14, fontWeight: 600 }}>Client</h4>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1f2937", wordBreak: "break-word" }}>
                    {selectedVente?.client || "-"}
                  </p>
                </div>
                <div style={{ background: "linear-gradient(135deg, #dcfce7, #bbf7d0)", borderRadius: 14, padding: 16, boxShadow: "0 4px 15px rgba(34, 197, 94, 0.08)" }}>
                  <h4 style={{ margin: "0 0 6px", color: "#15803d", fontSize: 14, fontWeight: 600 }}>Date</h4>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1f2937" }}>{formatDateSafe(selectedVente?.date)}</p>
                </div>
                <div style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)", borderRadius: 14, padding: 16, boxShadow: "0 4px 15px rgba(245, 158, 11, 0.08)" }}>
                  <h4 style={{ margin: "0 0 6px", color: "#b45309", fontSize: 14, fontWeight: 600 }}>Statut</h4>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1f2937" }}>{selectedVente?.statutPaiement || "-"}</p>
                </div>
                <div style={{ background: "linear-gradient(135deg, #f3e8ff, #e9d5ff)", borderRadius: 14, padding: 16, boxShadow: "0 4px 15px rgba(168, 85, 247, 0.08)" }}>
                  <h4 style={{ margin: "0 0 6px", color: "#7e22ce", fontSize: 14, fontWeight: 600 }}>Mode</h4>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1f2937" }}>{selectedVente?.modePaiement || "Espèces"}</p>
                </div>
                <div style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)", borderRadius: 14, padding: 16, boxShadow: "0 4px 15px rgba(16, 185, 129, 0.08)" }}>
                  <h4 style={{ margin: "0 0 6px", color: "#065f46", fontSize: 14, fontWeight: 600 }}>Total</h4>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1f2937" }}>
                    {safeToFixed(selectedVente?.montantTotal)} DH
                  </p>
                </div>
              </div>

              <h3 style={{ margin: "0 0 12px", fontSize: "clamp(16px, 2.2vw, 20px)", fontWeight: 600, color: "#374151" }}>
                Articles ({selectedVente?.articles?.length || 0})
              </h3>
              <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 8px 25px rgba(0, 0, 0, 0.05)", marginBottom: 20, overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg, #6d28d9, #5b21b6)", color: "white" }}>
                      <th style={{ padding: 12, textAlign: "left" }}>Produit / Traçabilité</th>
                      <th style={{ padding: 12, textAlign: "center" }}>Qté</th>
                      <th style={{ padding: 12, textAlign: "right" }}>Prix Unit.</th>
                      <th style={{ padding: 12, textAlign: "right" }}>Remise</th>
                      <th style={{ padding: 12, textAlign: "right" }}>Total</th>
                      <th style={{ padding: 12, textAlign: "center" }}>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedVente?.articles || []).map((a, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 12, verticalAlign: "top" }}>
                          <strong>{a?.produit || "-"}</strong>
                          {(a?.numeroArticle || a?.numeroLot || a?.fournisseur || a?.datePeremption) && (
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                              {a?.numeroArticle ? `N° article: ${a.numeroArticle}` : ""}
                              {a?.numeroLot ? `${a?.numeroArticle ? " | " : ""}Lot: ${a.numeroLot}` : ""}
                              {a?.fournisseur ? `${(a?.numeroArticle || a?.numeroLot) ? " | " : ""}Fournisseur: ${a.fournisseur}` : ""}
                              {a?.datePeremption ? `${(a?.numeroArticle || a?.numeroLot || a?.fournisseur) ? " | " : ""}Exp: ${formatDateSafe(a.datePeremption)}` : ""}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: 12, textAlign: "center" }}>{safeNumber(a?.quantite)}</td>
                        <td style={{ padding: 12, textAlign: "right" }}>{safeToFixed(a?.prixUnitaire)} DH</td>
                        <td style={{ padding: 12, textAlign: "right" }}>{safeToFixed(a?.remise)} DH</td>
                        <td style={{ padding: 12, textAlign: "right", fontWeight: 600 }}>
                          {safeToFixed(safeNumber(a?.prixUnitaire) * safeNumber(a?.quantite) - safeNumber(a?.remise))} DH
                        </td>
                        <td style={{ padding: 12, textAlign: "center" }}>
                          <span
                            style={{
                              background: (a?.stockSource === "stock2") 
                                ? "linear-gradient(135deg, #10b981, #059669)"
                                : "linear-gradient(135deg, #3b82f6, #2563eb)",
                              color: "white",
                              padding: "4px 8px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {(a?.stockSource === "stock2") ? "S2" : "S1"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    setShowDetails(false);
                    handleEditVente?.(selectedVente);
                  }}
                  style={{
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    color: "white",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 20px rgba(245, 158, 11, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  Modifier
                </button>
                <button
                  onClick={() => {
                    setShowDetails(false);
                    handlePrintVente?.(selectedVente);
                  }}
                  style={{
                    background: "linear-gradient(135deg, #6d28d9, #5b21b6)",
                    color: "white",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 20px rgba(109, 40, 217, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  Imprimer
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/* ====== Composant modal de scan caméra ====== */
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
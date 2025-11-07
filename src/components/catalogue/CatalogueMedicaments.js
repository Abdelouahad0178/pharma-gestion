// src/components/catalogue/CatalogueMedicaments.js
import React, { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  orderBy,
  getDoc,
  getDocs,
  writeBatch,
  limit,
  startAfter,
  endBefore,
  limitToLast,
  getCountFromServer,
} from "firebase/firestore";
import useKeyboardWedge from "../hooks/useKeyboardWedge";
import { Html5QrcodeScanner } from "html5-qrcode";

const BARCODE_FIELDS = ["codeBarre", "barcode", "ean", "ean13", "upc", "gtin"];
const ITEMS_PER_PAGE = 50;

const safeNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const findAnyBarcode = (obj) => {
  for (const f of BARCODE_FIELDS) {
    const val = obj?.[f];
    if (val != null && String(val).trim() !== "") return String(val);
  }
  return "";
};

const normalizeMedForVentes = (raw, actorEmail) => {
  const nom = String(raw?.nom ?? raw?.name ?? "").trim();
  const prixVente = safeNumber(raw?.prixVente ?? raw?.price ?? 0);
  const quantite = safeNumber(raw?.quantite ?? raw?.qty ?? 0);

  let uni = String(raw?.__barcode ?? findAnyBarcode(raw) ?? "").trim();

  const isDigits = /^\d+$/.test(uni);
  const bc = {};
  if (uni) {
    if (isDigits && uni.length === 13) {
      bc.ean = uni;
      bc.ean13 = uni;
      bc.codeBarre = uni;
      bc.barcode = uni;
      bc.gtin = uni;
    } else if (isDigits && (uni.length === 12 || uni.length === 8)) {
      bc.upc = uni;
      bc.codeBarre = uni;
      bc.barcode = uni;
    } else {
      bc.codeBarre = uni;
      bc.barcode = uni;
    }
  } else {
    BARCODE_FIELDS.forEach((k) => {
      if (raw?.[k]) bc[k] = String(raw[k]);
    });
  }

  return {
    nom,
    name: nom,
    prixVente,
    price: prixVente,
    quantite,
    qty: quantite,
    ...bc,
    updatedAt: Timestamp.now(),
    updatedBy: actorEmail || "system",
  };
};

const toArr = (x) => (Array.isArray(x) ? x : []);
const pickFirstStr = (...vals) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
};
const pickFirstNum = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
};

const extractMedicinesFromBackup = (rootObj) => {
  const outMapByBC = new Map();
  const outMapByName = new Map();

  const pushOrMerge = (draft) => {
    const bc = findAnyBarcode(draft);
    const keyName = String(draft.nom || draft.name || "").trim().toLowerCase();

    if (bc) {
      const existing = outMapByBC.get(bc);
      if (!existing) {
        outMapByBC.set(bc, { ...draft });
        if (keyName) outMapByName.set(keyName, outMapByBC.get(bc));
      } else {
        existing.nom = pickFirstStr(existing.nom, draft.nom);
        existing.name = existing.nom;
        if (safeNumber(existing.prixVente) <= 0 && safeNumber(draft.prixVente) > 0) {
          existing.prixVente = safeNumber(draft.prixVente);
          existing.price = existing.prixVente;
        }
        existing.quantite = safeNumber(existing.quantite) + safeNumber(draft.quantite);
        existing.qty = existing.quantite;
        BARCODE_FIELDS.forEach((k) => {
          if (!existing[k] && draft[k]) existing[k] = String(draft[k]);
        });
      }
      return;
    }

    if (keyName) {
      const existing = outMapByName.get(keyName);
      if (!existing) {
        outMapByName.set(keyName, { ...draft });
      } else {
        existing.nom = pickFirstStr(existing.nom, draft.nom);
        existing.name = existing.nom;
        if (safeNumber(existing.prixVente) <= 0 && safeNumber(draft.prixVente) > 0) {
          existing.prixVente = safeNumber(draft.prixVente);
          existing.price = existing.prixVente;
        }
        existing.quantite = safeNumber(existing.quantite) + safeNumber(draft.quantite);
        existing.qty = existing.quantite;
        BARCODE_FIELDS.forEach((k) => {
          if (!existing[k] && draft[k]) existing[k] = String(draft[k]);
        });
      }
    }
  };

  const data = rootObj?.data || {};

  toArr(data.stock).forEach((it) => {
    const nom = pickFirstStr(it?.nom, it?.name);
    if (!nom) return;
    const prix = pickFirstNum(it?.prixVente, it?.price);
    const qty = pickFirstNum(it?.quantite, it?.qty);

    const draft = { nom, name: nom, prixVente: prix, price: prix, quantite: qty, qty: qty };
    BARCODE_FIELDS.forEach((k) => { if (it?.[k]) draft[k] = String(it[k]); });
    pushOrMerge(draft);
  });

  toArr(data.achats).forEach((ach) => {
    toArr(ach?.articles).forEach((art) => {
      const nom = pickFirstStr(art?.produit);
      if (!nom) return;
      const prix = pickFirstNum(
        art?.recu?.prixVente, art?.commandee?.prixVente,
        art?.recu?.prixUnitaire, art?.commandee?.prixUnitaire,
        art?.recu?.prixAchat, art?.commandee?.prixAchat
      );
      const qty = pickFirstNum(art?.recu?.quantite, art?.commandee?.quantite);
      const bc = pickFirstStr(art?.recu?.codeBarre, art?.commandee?.codeBarre);

      const draft = { nom, name: nom, prixVente: prix, price: prix, quantite: qty, qty: qty };
      if (bc) {
        const isDigits = /^\d+$/.test(bc);
        if (isDigits && bc.length === 13) {
          draft.ean = bc; draft.ean13 = bc; draft.codeBarre = bc; draft.barcode = bc; draft.gtin = bc;
        } else if (isDigits && (bc.length === 12 || bc.length === 8)) {
          draft.upc = bc; draft.codeBarre = bc; draft.barcode = bc;
        } else {
          draft.codeBarre = bc; draft.barcode = bc;
        }
      }
      pushOrMerge(draft);
    });
  });

  toArr(data.ventes).forEach((v) => {
    toArr(v?.articles).forEach((art) => {
      const nom = pickFirstStr(art?.produit);
      if (!nom) return;
      const prix = pickFirstNum(art?.prixUnitaire);
      const qty = pickFirstNum(art?.quantite);
      const draft = { nom, name: nom, prixVente: prix, price: prix, quantite: qty, qty: qty };
      pushOrMerge(draft);
    });
  });

  const merged = new Map();
  outMapByBC.forEach((v, k) => merged.set(k, v));
  outMapByName.forEach((v) => {
    const bc = findAnyBarcode(v);
    if (bc && merged.has(bc)) return;
    const kn = (v.nom || v.name || "").trim().toLowerCase();
    if (!merged.has(kn)) merged.set(kn, v);
  });

  return Array.from(merged.values());
};

const normalizeText = (text) => {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const TableRow = memo(({ item, index, onEdit, onDelete }) => {
  const bc = findAnyBarcode(item);
  
  return (
    <tr style={{ background: index % 2 ? "#f8fafc" : "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
      <td style={{ padding: 12, fontWeight: 700, color: "#0f172a" }}>{item.nom}</td>
      <td style={{ padding: 12, color: "#334155", fontSize: 13 }}>
        {bc ? (
          <span style={{ background: "#e0e7ff", color: "#4338ca", padding: "3px 8px", borderRadius: 999, fontWeight: 700, fontSize: 12 }}>
            {bc}
          </span>
        ) : (
          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>
        )}
      </td>
      <td style={{ padding: 12, textAlign: "right", fontWeight: 700 }}>{safeNumber(item.prixVente).toFixed(2)} DH</td>
      <td style={{ padding: 12, textAlign: "right" }}>{safeNumber(item.quantite)}</td>
      <td style={{ padding: 12, textAlign: "center" }}>
        <div style={{ display: "inline-flex", gap: 6, flexWrap: "nowrap", justifyContent: "center", alignItems: "center" }}>
          <button
            onClick={() => onEdit(item)}
            style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "white", border: "none", padding: "6px 10px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.8em" }}
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(item)}
            style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", border: "none", padding: "6px 10px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.8em" }}
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );
});

TableRow.displayName = 'TableRow';

const Pagination = memo(({ currentPage, totalPages, onPageChange, loading, canGoNext, canGoPrev }) => {
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
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "20px 0", flexWrap: "wrap" }}>
      <button
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1 || loading || !canGoPrev}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: (currentPage === 1 || loading || !canGoPrev) ? "#f3f4f6" : "white",
          cursor: (currentPage === 1 || loading || !canGoPrev) ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: (currentPage === 1 || loading || !canGoPrev) ? 0.5 : 1
        }}
      >
        ⏮️
      </button>
      
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1 || loading || !canGoPrev}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: (currentPage === 1 || loading || !canGoPrev) ? "#f3f4f6" : "white",
          cursor: (currentPage === 1 || loading || !canGoPrev) ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: (currentPage === 1 || loading || !canGoPrev) ? 0.5 : 1
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
              opacity: loading ? 0.5 : 1
            }}
          >
            1
          </button>
          {startPage > 2 && <span style={{ padding: "0 8px" }}>...</span>}
        </>
      )}
      
      {pages.map(page => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "2px solid #e5e7eb",
            background: page === currentPage ? "linear-gradient(135deg,#6366f1,#4f46e5)" : loading ? "#f3f4f6" : "white",
            color: page === currentPage ? "white" : "#0f172a",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
            minWidth: 40,
            opacity: loading ? 0.7 : 1
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
              opacity: loading ? 0.5 : 1
            }}
          >
            {totalPages}
          </button>
        </>
      )}
      
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages || loading || !canGoNext}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: (currentPage === totalPages || loading || !canGoNext) ? "#f3f4f6" : "white",
          cursor: (currentPage === totalPages || loading || !canGoNext) ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: (currentPage === totalPages || loading || !canGoNext) ? 0.5 : 1
        }}
      >
        ▶️
      </button>
      
      <button
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages || loading || !canGoNext}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "2px solid #e5e7eb",
          background: (currentPage === totalPages || loading || !canGoNext) ? "#f3f4f6" : "white",
          cursor: (currentPage === totalPages || loading || !canGoNext) ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: (currentPage === totalPages || loading || !canGoNext) ? 0.5 : 1
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

Pagination.displayName = 'Pagination';

export default function CatalogueMedicaments() {
  const { user, societeId, role, loading } = useUserRole();

  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ nom: "", prixVente: "", quantite: "", __barcode: "" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [totalCount, setTotalCount] = useState(0);
  const [loadingPage, setLoadingPage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // 🆕 Stockage des curseurs de pagination
  const [pageFirstDocs, setPageFirstDocs] = useState(new Map()); // Map<pageNumber, DocumentSnapshot>
  const [pageLastDocs, setPageLastDocs] = useState(new Map()); // Map<pageNumber, DocumentSnapshot>
  const [canGoNext, setCanGoNext] = useState(true);
  const [canGoPrev, setCanGoPrev] = useState(false);

  const fileInputRef = useRef(null);
  const [importStats, setImportStats] = useState(null);
  const [busyImport, setBusyImport] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const [busyExportBackup, setBusyExportBackup] = useState(false);
  const [busyDeleteAll, setBusyDeleteAll] = useState(false);

  const [scanEnabled, setScanEnabled] = useState(true);
  const lastScanRef = useRef("");
  const nameInputRef = useRef(null);
  const priceInputRef = useRef(null);

  const [showScanner, setShowScanner] = useState(false);

  const fetchTotalCount = useCallback(async () => {
    if (!societeId) return;
    try {
      const stockRef = collection(db, "societe", societeId, "stock");
      const snapshot = await getCountFromServer(stockRef);
      setTotalCount(snapshot.data().count);
    } catch (e) {
      console.error("Erreur comptage:", e);
      setTotalCount(0);
    }
  }, [societeId]);

  const loadAllForSearch = useCallback(async () => {
    if (!societeId) return;
    
    try {
      setLoadingPage(true);
      const stockRef = collection(db, "societe", societeId, "stock");
      const qy = query(stockRef, orderBy("nom", "asc"));
      const snapshot = await getDocs(qy);
      
      const arr = [];
      snapshot.forEach((d) => {
        const data = d.data();
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
          __barcode: findAnyBarcode(data),
          updatedAt: data?.updatedAt,
          updatedBy: data?.updatedBy,
          createdAt: data?.createdAt,
          createdBy: data?.createdBy,
        });
      });
      
      setAllItems(arr);
      setIsSearching(true);
      console.log(`[Catalogue] ✅ Chargé ${arr.length} médicaments pour recherche`);
      
    } catch (e) {
      console.error("Erreur chargement complet:", e);
      setError("Erreur lors du chargement pour la recherche");
    } finally {
      setLoadingPage(false);
    }
  }, [societeId]);

  // 🆕 PAGINATION AMÉLIORÉE
  const loadPage = useCallback(async (pageNumber, direction = 'direct') => {
    if (!societeId || pageNumber < 1) return;
    
    console.log(`[Catalogue] 📄 Chargement page ${pageNumber} (direction: ${direction})`);
    setLoadingPage(true);
    setError("");
    
    try {
      const stockRef = collection(db, "societe", societeId, "stock");
      let finalQuery;

      if (pageNumber === 1) {
        // Page 1 : requête simple
        finalQuery = query(
          stockRef,
          orderBy("nom", "asc"),
          limit(ITEMS_PER_PAGE)
        );
      } else if (direction === 'next' && pageLastDocs.has(pageNumber - 1)) {
        // Page suivante : utiliser le dernier doc de la page précédente
        const lastDoc = pageLastDocs.get(pageNumber - 1);
        finalQuery = query(
          stockRef,
          orderBy("nom", "asc"),
          startAfter(lastDoc),
          limit(ITEMS_PER_PAGE)
        );
        console.log(`[Catalogue] ➡️ Utilisation du curseur de la page ${pageNumber - 1}`);
      } else if (direction === 'prev' && pageFirstDocs.has(pageNumber + 1)) {
        // Page précédente : utiliser le premier doc de la page suivante
        const firstDoc = pageFirstDocs.get(pageNumber + 1);
        finalQuery = query(
          stockRef,
          orderBy("nom", "asc"),
          endBefore(firstDoc),
          limitToLast(ITEMS_PER_PAGE)
        );
        console.log(`[Catalogue] ⬅️ Utilisation du curseur de la page ${pageNumber + 1}`);
      } else {
        // Navigation directe : charger avec skip (moins efficace mais nécessaire)
        const skipCount = (pageNumber - 1) * ITEMS_PER_PAGE;
        console.log(`[Catalogue] 🔢 Navigation directe, skip ${skipCount} docs`);
        
        const skipQuery = query(stockRef, orderBy("nom", "asc"), limit(skipCount));
        const skipSnapshot = await getDocs(skipQuery);
        
        if (skipSnapshot.empty || skipSnapshot.docs.length < skipCount) {
          setError("Page introuvable");
          setLoadingPage(false);
          return;
        }
        
        const lastDoc = skipSnapshot.docs[skipSnapshot.docs.length - 1];
        finalQuery = query(
          stockRef,
          orderBy("nom", "asc"),
          startAfter(lastDoc),
          limit(ITEMS_PER_PAGE)
        );
      }

      const snapshot = await getDocs(finalQuery);
      
      if (snapshot.empty) {
        console.log(`[Catalogue] ⚠️ Page ${pageNumber} vide`);
        setItems([]);
        setCanGoNext(false);
        setLoadingPage(false);
        return;
      }

      const arr = [];
      snapshot.forEach((d) => {
        const data = d.data();
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
          __barcode: findAnyBarcode(data),
          updatedAt: data?.updatedAt,
          updatedBy: data?.updatedBy,
          createdAt: data?.createdAt,
          createdBy: data?.createdBy,
        });
      });
      
      // 🆕 Stocker les curseurs
      const firstDoc = snapshot.docs[0];
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      
      setPageFirstDocs(prev => {
        const newMap = new Map(prev);
        newMap.set(pageNumber, firstDoc);
        return newMap;
      });
      
      setPageLastDocs(prev => {
        const newMap = new Map(prev);
        newMap.set(pageNumber, lastDoc);
        return newMap;
      });
      
      // Déterminer si on peut continuer
      setCanGoNext(arr.length === ITEMS_PER_PAGE);
      setCanGoPrev(pageNumber > 1);
      
      setItems(arr);
      setCurrentPage(pageNumber);
      
      console.log(`[Catalogue] ✅ Page ${pageNumber} chargée: ${arr.length} items`);
      
    } catch (e) {
      console.error("Erreur chargement page:", e);
      setError("Erreur lors du chargement de la page");
    } finally {
      setLoadingPage(false);
    }
  }, [societeId, pageFirstDocs, pageLastDocs]);

  const handleClickLoad = useCallback(async () => {
    if (!societeId) {
      setError("Veuillez d'abord sélectionner une société.");
      return;
    }
    
    console.log("[Catalogue] 🚀 Chargement initial du catalogue");
    setError("");
    setOk("");
    setLoaded(true);
    setIsSearching(false);
    setPageFirstDocs(new Map());
    setPageLastDocs(new Map());
    
    await fetchTotalCount();
    await loadPage(1, 'direct');
    
    setOk("Page 1 chargée avec succès !");
    setTimeout(() => setOk(""), 2000);
  }, [societeId, fetchTotalCount, loadPage]);

  const handlePageChange = useCallback(async (pageNumber) => {
    if (pageNumber === currentPage || loadingPage) return;
    
    console.log(`[Catalogue] 🔄 Changement page ${currentPage} → ${pageNumber}`);
    
    let direction = 'direct';
    if (pageNumber === currentPage + 1) {
      direction = 'next';
    } else if (pageNumber === currentPage - 1) {
      direction = 'prev';
    }
    
    await loadPage(pageNumber, direction);
  }, [currentPage, loadingPage, loadPage]);

  const handleDetach = useCallback(() => {
    console.log("[Catalogue] 🧹 Détachement du catalogue");
    setLoaded(false);
    setItems([]);
    setAllItems([]);
    setCurrentPage(1);
    setTotalCount(0);
    setIsSearching(false);
    setSearch("");
    setPageFirstDocs(new Map());
    setPageLastDocs(new Map());
    setCanGoNext(true);
    setCanGoPrev(false);
    setOk("Catalogue détaché.");
    setTimeout(() => setOk(""), 1500);
  }, []);

  const resetForm = useCallback(() => {
    setForm({ nom: "", prixVente: "", quantite: "", __barcode: "" });
    setEditingId(null);
    setError("");
    setOk("");
  }, []);

  const focusName = () => { try { nameInputRef.current?.focus(); nameInputRef.current?.select?.(); } catch {} };
  const focusPrice = () => { try { priceInputRef.current?.focus(); priceInputRef.current?.select?.(); } catch {} };

  const onEdit = useCallback((it) => {
    setEditingId(it.id);
    setForm({
      nom: it.nom || "",
      prixVente: it.prixVente?.toString() ?? "",
      quantite: it.quantite?.toString() ?? "",
      __barcode: it.__barcode || "",
    });
    setOk("Médicament chargé en édition.");
    setError("");
    setShowForm(true);
    setTimeout(() => focusPrice(), 100);
  }, []);

  const onDelete = useCallback(async (it) => {
    if (!societeId) return;
    if (!window.confirm(`Supprimer « ${it.nom} » du catalogue ?`)) return;
    
    console.log(`[Catalogue] 🗑️ Suppression: ${it.nom}`);
    
    try {
      await deleteDoc(doc(db, "societe", societeId, "stock", it.id));
      
      if (isSearching) {
        await loadAllForSearch();
      } else {
        // Recharger la page courante
        await loadPage(currentPage, 'direct');
      }
      await fetchTotalCount();
      
      setOk("Médicament supprimé.");
      setTimeout(() => setOk(""), 1500);
    } catch (e) {
      console.error(e);
      setError("Suppression impossible.");
    }
  }, [societeId, loadPage, currentPage, fetchTotalCount, isSearching, loadAllForSearch]);

  const handleDeleteAll = async () => {
    if (!societeId || !user) return;
    
    const firstConfirm = window.confirm(
      `⚠️ ATTENTION ⚠️\n\nVous êtes sur le point de SUPPRIMER TOUT LE CATALOGUE (${totalCount} médicament(s)).\n\nCette action est IRRÉVERSIBLE !\n\nVoulez-vous vraiment continuer ?`
    );
    
    if (!firstConfirm) return;
    
    const secondConfirm = window.confirm(
      `🚨 DERNIÈRE CONFIRMATION 🚨\n\nTapez "SUPPRIMER" dans votre tête et cliquez sur OK pour confirmer la suppression définitive de ${totalCount} médicament(s).\n\nCette action NE PEUT PAS être annulée !`
    );
    
    if (!secondConfirm) return;

    try {
      setBusyDeleteAll(true);
      setError("");
      setOk("");

      const stockRef = collection(db, "societe", societeId, "stock");
      const snapshot = await getDocs(stockRef);

      if (snapshot.empty) {
        setOk("Le catalogue est déjà vide.");
        setBusyDeleteAll(false);
        return;
      }

      const batchSize = 500;
      let deletedCount = 0;
      
      const docs = snapshot.docs;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchDocs = docs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        deletedCount += batchDocs.length;
        
        setOk(`Suppression en cours... ${deletedCount}/${docs.length} médicament(s) supprimés.`);
      }

      setItems([]);
      setAllItems([]);
      setTotalCount(0);
      setCurrentPage(1);
      setLoaded(false);
      setIsSearching(false);
      setPageFirstDocs(new Map());
      setPageLastDocs(new Map());

      setOk(`✅ Catalogue entièrement supprimé ! ${deletedCount} médicament(s) supprimés avec succès.`);
      setTimeout(() => setOk(""), 3000);
      
    } catch (e) {
      console.error("Erreur lors de la suppression totale:", e);
      setError("Erreur lors de la suppression du catalogue. Certains éléments peuvent ne pas avoir été supprimés.");
    } finally {
      setBusyDeleteAll(false);
    }
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    if (!societeId || !user) return;
    const nom = String(form.nom || "").trim();
    if (!nom) { setError("Le champ « Nom » est obligatoire."); focusName(); return; }
    
    console.log(`[Catalogue] 💾 Sauvegarde: ${nom}`);
    setSaving(true); setError(""); setOk("");

    try {
      const base = {
        nom,
        prixVente: safeNumber(form.prixVente, 0),
        quantite: safeNumber(form.quantite, 0),
        __barcode: String(form.__barcode || "").trim(),
      };
      const toStore = normalizeMedForVentes(base, user.email || user.uid);

      if (editingId) {
        await updateDoc(doc(db, "societe", societeId, "stock", editingId), toStore);
        setOk("Médicament mis à jour.");
        
        if (loaded) {
          if (isSearching) {
            await loadAllForSearch();
          } else {
            await loadPage(currentPage, 'direct');
          }
          await fetchTotalCount();
        }
      } else {
        const scanned = String(base.__barcode || "").trim();
        if (scanned) {
          const searchList = isSearching ? allItems : items;
          const dup = searchList.find((it) => BARCODE_FIELDS.some((k) => String(it?.[k] || "") === scanned));
          if (dup) {
            setSaving(false);
            onEdit(dup);
            setError("Ce code-barres existe déjà. Édition du produit existant.");
            return;
          }
        }
        const ref = await addDoc(collection(db, "societe", societeId, "stock"), {
          ...toStore,
          createdAt: Timestamp.now(),
          createdBy: user.email || user.uid,
        });
        await setDoc(ref, { name: toStore.nom, price: toStore.prixVente, qty: toStore.quantite }, { merge: true });
        setOk("Médicament ajouté.");
        
        if (loaded) {
          if (isSearching) {
            await loadAllForSearch();
          } else {
            await loadPage(currentPage, 'direct');
          }
          await fetchTotalCount();
        }
      }
      resetForm();
      setTimeout(() => setOk(""), 1600);
    } catch (e) {
      console.error(e);
      setError("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const downloadJson = (obj, filename = "medicaments.json") => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  };

  const handleExport = async () => {
    if (!societeId) return;
    try {
      setBusyExport(true);
      
      const stockRef = collection(db, "societe", societeId, "stock");
      const snapshot = await getDocs(query(stockRef, orderBy("nom", "asc")));
      
      const payload = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const bc = {};
        BARCODE_FIELDS.forEach((k) => { if (data[k]) bc[k] = String(data[k]); });
        payload.push({
          nom: String(data?.nom ?? data?.name ?? ""),
          name: String(data?.nom ?? data?.name ?? ""),
          prixVente: safeNumber(data?.prixVente ?? data?.price),
          price: safeNumber(data?.prixVente ?? data?.price),
          quantite: safeNumber(data?.quantite ?? data?.qty),
          qty: safeNumber(data?.quantite ?? data?.qty),
          ...bc,
        });
      });
      
      downloadJson(payload, `medicaments_${societeId}_${new Date().toISOString().slice(0,10)}.json`);
      setOk(`Exporté ${payload.length} médicament(s).`);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Export impossible.");
    } finally {
      setBusyExport(false);
    }
  };

  const frDate = (d) => {
    try {
      const date = new Date(d);
      const jour = date.toLocaleDateString("fr-FR", { day: "numeric" });
      const mois = date.toLocaleDateString("fr-FR", { month: "long" });
      const annee = date.toLocaleDateString("fr-FR", { year: "numeric" });
      const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return `${jour} ${mois} ${annee} à ${time}`;
    } catch { return new Date().toISOString(); }
  };

  const handleExportBackup = async () => {
    if (!societeId) { setError("Société non définie."); return; }
    try {
      setBusyExportBackup(true);

      let societeName = "-";
      try {
        const snap = await getDoc(doc(db, "societe", societeId));
        societeName = String(snap?.data()?.nom || snap?.data()?.name || "-");
      } catch {}

      const stockRef = collection(db, "societe", societeId, "stock");
      const snapshot = await getDocs(query(stockRef, orderBy("nom", "asc")));
      
      const stockPayload = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const bc = {};
        BARCODE_FIELDS.forEach((k) => { if (data[k]) bc[k] = String(data[k]); });
        stockPayload.push({
          nom: String(data?.nom ?? data?.name ?? ""),
          name: String(data?.nom ?? data?.name ?? ""),
          prixVente: safeNumber(data?.prixVente ?? data?.price),
          price: safeNumber(data?.prixVente ?? data?.price),
          quantite: safeNumber(data?.quantite ?? data?.qty),
          qty: safeNumber(data?.quantite ?? data?.qty),
          ...bc,
        });
      });

      const now = new Date();
      const meta = {
        exportDateIso: now.toISOString(),
        exportDateFr: frDate(now),
        exportDateMs: now.getTime(),
        societeId,
        societeName,
        exportedBy: user?.email || user?.uid || "-",
        exportedByRole: role || "-",
        exportedByName: user?.displayName || user?.email?.split("@")[0] || "-",
        isOwner: !!(user?.isOwner || role === "owner" || role === "propriétaire"),
        version: "1.3",
        appName: "Pharma Gestion",
        type: "catalogue_stock_backup",
      };

      const data = {
        achats: [],
        ventes: [],
        stock: stockPayload,
        devisFactures: [],
        paiements: [],
        retours: [],
        parametres: [],
        users: [],
        societeInfo: {
          id: societeId,
          nom: societeName,
          active: true,
          _exportedAt: meta.exportDateIso,
        },
      };

      const details = {
        achats:       { label: "🛒 Achats",          count: 0,                    priority: "high",   exported: true, exportedAt: meta.exportDateIso },
        ventes:       { label: "💰 Ventes",          count: 0,                    priority: "high",   exported: true, exportedAt: meta.exportDateIso },
        stock:        { label: "📦 Stock",           count: stockPayload.length,  priority: "high",   exported: true, exportedAt: meta.exportDateIso },
        devisFactures:{ label: "📄 Devis & Factures",count: 0,                    priority: "medium", exported: true, exportedAt: meta.exportDateIso },
        paiements:    { label: "💳 Paiements",       count: 0,                    priority: "medium", exported: true, exportedAt: meta.exportDateIso },
        retours:      { label: "↩️ Retours",         count: 0,                    priority: "low",    exported: true, exportedAt: meta.exportDateIso },
        parametres:   { label: "⚙️ Paramètres",      count: 0,                    priority: "low",    exported: true, exportedAt: meta.exportDateIso },
        users:        { label: "👥 Utilisateurs",    count: 0,                    priority: "high",   exported: true, exportedAt: meta.exportDateIso },
        societeInfo:  { label: "🏥 Société",         count: 1,                    priority: "high",   exported: true, exportedAt: meta.exportDateIso },
      };

      const backup = {
        metadata: meta,
        data,
        statistics: {
          totalDocuments: Object.values(details).reduce((acc, v) => acc + (v?.count || 0), 0),
          totalCollections: Object.keys(details).length,
          collectionsDetails: details,
          exportDuration: 0,
          fileSize: 0,
        },
      };

      const jsonStr = JSON.stringify(backup);
      backup.statistics.fileSize = new Blob([jsonStr]).size;

      downloadJson(backup, `backup_stock_${societeId}_${now.toISOString().slice(0,10)}.json`);
      setOk(`Backup complet exporté (${stockPayload.length} article(s)).`);
      setError("");
    } catch (e) {
      console.error(e);
      setError("Export backup impossible.");
    } finally {
      setBusyExportBackup(false);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const parseJsonFlexible = (txt) => {
    try {
      const obj = JSON.parse(txt);
      if (obj && typeof obj === "object" && obj.data && (obj.metadata || obj.statistics)) {
        const meds = extractMedicinesFromBackup(obj);
        return { mode: "backup", rows: meds, totalInFile: (obj?.statistics?.totalDocuments ?? meds.length) };
      }
      if (Array.isArray(obj)) return { mode: "array", rows: obj, totalInFile: obj.length };
      if (obj && Array.isArray(obj.items)) return { mode: "array", rows: obj.items, totalInFile: obj.items.length };
      return { mode: "unknown", rows: [], totalInFile: 0 };
    } catch {
      return { mode: "invalid", rows: [], totalInFile: 0 };
    }
  };

  const buildIndexes = useCallback((list) => {
    const byBarcode = new Map();
    const byName = new Map();
    list.forEach((it) => {
      const bc = findAnyBarcode(it);
      if (bc) byBarcode.set(String(bc), it);
      const key = String(it.nom || "").trim().toLowerCase();
      if (key) byName.set(key, it);
    });
    return { byBarcode, byName };
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!societeId || !user) { setError("Session invalide."); return; }

    try {
      setBusyImport(true);
      setImportStats(null);
      setError(""); setOk("");

      const txt = await file.text();
      const parsed = parseJsonFlexible(txt);

      if (!parsed.rows.length) {
        setImportStats({ total: parsed.totalInFile, processed: 0, created: 0, updated: 0, skipped: 0, errors: [] });
        setOk("Fichier lu. Aucune donnée exploitable.");
        setBusyImport(false);
        return;
      }

      const searchList = isSearching ? allItems : items;
      const { byBarcode, byName } = buildIndexes(searchList);
      let created = 0, updated = 0, skipped = 0;
      const errors = [];

      const MAX = 10000;
      const slice = parsed.rows.slice(0, MAX);

      for (let i = 0; i < slice.length; i++) {
        const raw = slice[i] || {};
        try {
          const toStore = normalizeMedForVentes(raw, user.email || user.uid);
          const nom = String(toStore.nom || "").trim();
          if (!nom) { skipped++; continue; }

          const anyBC = findAnyBarcode(toStore);
          let existing = null;
          if (anyBC) existing = byBarcode.get(String(anyBC)) || null;
          if (!existing) existing = byName.get(nom.toLowerCase()) || null;

          if (existing?.id) {
            await setDoc(
              doc(db, "societe", societeId, "stock", existing.id),
              { ...toStore, name: toStore.nom, price: toStore.prixVente, qty: toStore.quantite },
              { merge: true }
            );
            updated++;
            const bc = findAnyBarcode({ ...existing, ...toStore }) || anyBC;
            if (bc) byBarcode.set(String(bc), { ...existing, ...toStore });
            byName.set(nom.toLowerCase(), { ...existing, ...toStore });
          } else {
            const ref = await addDoc(collection(db, "societe", societeId, "stock"), {
              ...toStore,
              createdAt: Timestamp.now(),
              createdBy: user.email || user.uid,
            });
            await setDoc(ref, { name: toStore.nom, price: toStore.prixVente, qty: toStore.quantite }, { merge: true });
            created++;
            const docObj = { id: ref.id, ...toStore };
            const bc = findAnyBarcode(docObj);
            if (bc) byBarcode.set(String(bc), docObj);
            byName.set(nom.toLowerCase(), docObj);
          }
        } catch (err) {
          console.error("IMPORT error @index", i, err);
          errors.push({ index: i, message: String(err?.message || err) });
        }
      }

      setImportStats({ total: parsed.totalInFile, processed: slice.length, created, updated, skipped, errors });
      setOk(
        `Import terminé: ${created} créés, ${updated} mis à jour, ${skipped} ignorés` +
        (errors.length ? `, ${errors.length} erreurs` : "") + "."
      );
      
      if (loaded) {
        await fetchTotalCount();
        if (isSearching) {
          await loadAllForSearch();
        } else {
          await loadPage(currentPage, 'direct');
        }
      }
    } catch (e2) {
      console.error(e2);
      setError("Échec de l'import.");
    } finally {
      setBusyImport(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!loaded) return;
      
      if (search.trim()) {
        if (!isSearching) {
          console.log("[Catalogue] 🔍 Activation mode recherche");
          await loadAllForSearch();
        }
      } else {
        if (isSearching) {
          console.log("[Catalogue] ❌ Désactivation mode recherche");
          setIsSearching(false);
          setAllItems([]);
          await loadPage(1, 'direct');
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, loaded, isSearching, loadAllForSearch, loadPage]);

  const filtered = useMemo(() => {
    const sourceList = isSearching ? allItems : items;
    
    if (!search.trim()) return sourceList;
    
    const searchNormalized = normalizeText(search);
    
    return sourceList.filter((it) => {
      const nameNormalized = normalizeText(it.nom);
      return nameNormalized.includes(searchNormalized);
    });
  }, [items, allItems, search, isSearching]);

  const totalPages = isSearching 
    ? Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1
    : Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;
  
  const paginatedItems = useMemo(() => {
    if (isSearching) {
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      return filtered.slice(startIndex, endIndex);
    }
    return filtered;
  }, [filtered, currentPage, isSearching]);

  useEffect(() => {
    if (search.trim() && isSearching) {
      setCurrentPage(1);
    }
  }, [search, isSearching]);

  const findItemByBarcode = useCallback(
    (code) => {
      const searchList = isSearching ? allItems : items;
      return searchList.find((it) => BARCODE_FIELDS.some((k) => String(it?.[k] || "") === String(code)));
    },
    [items, allItems, isSearching]
  );

  const handleScanned = useCallback(
    (code) => {
      if (!scanEnabled) return;
      const cleaned = String(code || "").trim();
      if (!cleaned) return;

      lastScanRef.current = cleaned;
      const existing = findItemByBarcode(cleaned);
      if (existing) {
        onEdit(existing);
        setOk(`Code-barres détecté (${cleaned}) • Produit chargé.`);
        return;
      }

      setEditingId(null);
      setForm((f) => ({ ...f, __barcode: cleaned }));
      setOk(`Code-barres détecté (${cleaned}). Entrez le nom et le prix.`);
      setError("");
      setShowForm(true);
      focusName();
    },
    [scanEnabled, findItemByBarcode, onEdit]
  );

  useKeyboardWedge(handleScanned, { minChars: 6, endKey: "Enter", timeoutMs: 100 });

  const handlePrint = () => {
    window.print();
  };

  if (loading) return null;
  if (!societeId) {
    return (
      <div style={{ padding: 24 }}>
        <h3>Catalogue médicaments</h3>
        <p>Veuillez d'abord sélectionner une société.</p>
      </div>
    );
  }

  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const total = filtered.reduce((sum, it) => sum + (safeNumber(it.prixVente) * safeNumber(it.quantite)), 0);

  return (
    <>
      <div className="print-only">
        <div style={{ padding: '10mm', fontFamily: 'Arial, sans-serif', fontSize: '10pt', color: '#000' }}>
          <div style={{ textAlign: 'center', marginBottom: '8mm', borderBottom: '2pt solid #6366f1', paddingBottom: '5mm' }}>
            <h1 style={{ margin: 0, fontSize: '18pt', color: '#6366f1', fontWeight: 'bold' }}>
              💊 Catalogue des Médicaments
            </h1>
            <p style={{ margin: '2mm 0 0', fontSize: '9pt', color: '#666' }}>
              Édité le {now}
            </p>
            <p style={{ margin: '1mm 0 0', fontSize: '9pt', color: '#666' }}>
              {filtered.length} article(s) {search ? `(recherche: "${search}")` : ''}
            </p>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#1e293b', color: 'white' }}>
                <th style={{ padding: '3mm 2mm', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt' }}>Médicament</th>
                <th style={{ padding: '3mm 2mm', textAlign: 'left', fontWeight: 'bold', fontSize: '9pt' }}>Code</th>
                <th style={{ padding: '3mm 2mm', textAlign: 'right', fontWeight: 'bold', fontSize: '9pt' }}>Prix</th>
                <th style={{ padding: '3mm 2mm', textAlign: 'right', fontWeight: 'bold', fontSize: '9pt' }}>Qté</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, idx) => {
                const bc = findAnyBarcode(it);
                return (
                  <tr key={it.id} style={{ backgroundColor: idx % 2 ? '#f8fafc' : '#ffffff', borderBottom: '0.5pt solid #e2e8f0' }}>
                    <td style={{ padding: '2mm', fontWeight: '600' }}>{it.nom}</td>
                    <td style={{ padding: '2mm', fontSize: '8pt' }}>
                      {bc ? (
                        <span style={{ backgroundColor: '#e0e7ff', color: '#4338ca', padding: '1mm 2mm', borderRadius: '2mm', fontWeight: 'bold', fontSize: '7pt' }}>
                          {bc}
                        </span>
                      ) : (
                        <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '2mm', textAlign: 'right', fontWeight: '600' }}>{safeNumber(it.prixVente).toFixed(2)}</td>
                    <td style={{ padding: '2mm', textAlign: 'right' }}>{safeNumber(it.quantite)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: '5mm', padding: '3mm', backgroundColor: '#f1f5f9', borderRadius: '2mm', textAlign: 'right', fontWeight: 'bold' }}>
            Total: {filtered.length} article(s) • Valeur: {total.toFixed(2)} DH
          </div>

          <div style={{ marginTop: '8mm', textAlign: 'center', fontSize: '8pt', color: '#666', borderTop: '0.5pt solid #e2e8f0', paddingTop: '3mm' }}>
            <p>Pharma Gestion © {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>

      <div className="no-print" style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eef2ff,#e0f2fe)", padding: 18, fontFamily: '"Inter",-apple-system,BlinkMacSystemFont,sans-serif' }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#6366f1,#22d3ee)", color: "#fff", fontSize: 22 }}>💊</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: 0.2, color: "#0f172a" }}>Catalogue des Médicaments</h1>
              <p style={{ margin: "6px 0 0", color: "#475569" }}>
                Ajout manuel / douchette / caméra 📷. Import/Export JSON. Recherche globale sur tout le catalogue.
              </p>
            </div>
          </header>

          {!loaded && (
            <div style={{ 
              background: "linear-gradient(135deg,#fff7ed,#fffbeb)", 
              border: "2px solid #fed7aa",
              color: "#7c2d12",
              padding: 14,
              borderRadius: 12,
              marginBottom: 12,
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap"
            }}>
              <div style={{ fontWeight: 800 }}>
                ⏳ Catalogue non chargé • Cliquez sur « Charger le catalogue » pour afficher la première page ({ITEMS_PER_PAGE} médicaments).
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleClickLoad}
                  style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                >
                  📦 Charger le catalogue
                </button>
              </div>
            </div>
          )}

          {loaded && (
            <div style={{ 
              background: isSearching 
                ? "linear-gradient(135deg,#fef3c7,#fde68a)" 
                : "linear-gradient(135deg,#ecfeff,#cffafe)", 
              border: isSearching ? "2px solid #fbbf24" : "2px solid #a5f3fc",
              color: isSearching ? "#78350f" : "#155e75",
              padding: 10,
              borderRadius: 12,
              marginBottom: 10,
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap"
            }}>
              <div style={{ fontWeight: 800 }}>
                {isSearching 
                  ? `🔍 Recherche globale active • ${filtered.length} résultat(s) sur ${totalCount} médicament(s)`
                  : `✅ Page ${currentPage}/${totalPages} • ${items.length} médicament(s) affichés sur ${totalCount} au total`
                }
              </div>
              <button
                onClick={handleDetach}
                style={{ background: "linear-gradient(135deg,#6b7280,#4b5563)", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                title="Détacher et vider"
              >
                🧹 Détacher
              </button>
            </div>
          )}

          <div style={{
            background: scanEnabled ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : "linear-gradient(135deg,#fee2e2,#ffe4e6)",
            border: `2px solid ${scanEnabled ? "#86efac" : "#fecaca"}`,
            color: scanEnabled ? "#064e3b" : "#7f1d1d",
            padding: 10, borderRadius: 12, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap"
          }}>
            <div style={{ fontWeight: 800 }}>
              {scanEnabled ? "📡 Mode douchette ACTIVÉ" : "⛔ Mode douchette DÉSACTIVÉ"}
              {lastScanRef.current ? ` • Dernier: ${lastScanRef.current}` : ""}
            </div>
            <button
              onClick={() => setScanEnabled((s) => !s)}
              style={{ background: scanEnabled ? "linear-gradient(135deg,#22c55e,#16a34a)" : "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
            >
              {scanEnabled ? "Désactiver" : "Activer"}
            </button>
          </div>

          {error && (
            <div style={{ background: "rgba(254,226,226,0.9)", border: "1px solid #fecaca", color: "#b91c1c", padding: 10, borderRadius: 10, marginBottom: 10 }}>
              {error} <button onClick={() => setError("")} style={{ marginLeft: 10, border: "none", background: "transparent", cursor: "pointer", color: "#b91c1c" }}>×</button>
            </div>
          )}
          {ok && (
            <div style={{ background: "rgba(220,252,231,0.9)", border: "1px solid #bbf7d0", color: "#166534", padding: 10, borderRadius: 10, marginBottom: 10 }}>
              {ok} <button onClick={() => setOk("")} style={{ marginLeft: 10, border: "none", background: "transparent", cursor: "pointer", color: "#166534" }}>×</button>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowForm(prev => !prev)}
              style={{
                width: "100%",
                background: showForm ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,#22c55e,#16a34a)",
                color: "white",
                border: "none",
                padding: "14px 20px",
                borderRadius: 12,
                fontWeight: 800,
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                transition: "all 0.3s ease"
              }}
            >
              <span style={{ fontSize: 20 }}>{showForm ? "➖" : "➕"}</span>
              <span>{showForm ? "Masquer le formulaire" : editingId ? "Afficher (Mode édition)" : "Ajouter un médicament"}</span>
            </button>
          </div>

          {showForm && (
            <form onSubmit={onSave} style={{ background: "white", borderRadius: 16, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.06)", marginBottom: 16, animation: "slideDown 0.3s ease" }}>
              <h3 style={{ margin: "0 0 12px", color: "#0f172a" }}>{editingId ? "Modifier" : "Ajouter"}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#334155" }}>Nom *</label>
                  <input
                    ref={nameInputRef}
                    value={form.nom}
                    onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                    required
                    placeholder="Ex: Paracétamol"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#334155" }}>Prix (DH)</label>
                  <input
                    ref={priceInputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.prixVente}
                    onChange={(e) => setForm((f) => ({ ...f, prixVente: e.target.value }))}
                    placeholder="0.00"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#334155" }}>Quantité</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.quantite}
                    onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))}
                    placeholder="0"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#334155" }}>Code-barres</label>
                  <input
                    value={form.__barcode}
                    onChange={(e) => setForm((f) => ({ ...f, __barcode: e.target.value }))}
                    placeholder="Ex: 3400930000000"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 14 }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={busyExport}
                    style={{ background: "linear-gradient(135deg,#0ea5e9,#2563eb)", color: "white", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 800, cursor: busyExport ? "not-allowed" : "pointer", opacity: busyExport ? 0.7 : 1 }}
                  >
                    {busyExport ? "..." : "⬇️ Export"}
                  </button>

                  <button
                    type="button"
                    onClick={handleExportBackup}
                    disabled={busyExportBackup}
                    style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "white", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 800, cursor: busyExportBackup ? "not-allowed" : "pointer", opacity: busyExportBackup ? 0.7 : 1 }}
                  >
                    {busyExportBackup ? "..." : "🧰 Backup"}
                  </button>

                  <button
                    type="button"
                    onClick={handleImportClick}
                    disabled={busyImport}
                    style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "white", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 800, cursor: busyImport ? "not-allowed" : "pointer", opacity: busyImport ? 0.7 : 1 }}
                  >
                    {busyImport ? "..." : "⬆️ Import"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    style={{ background: "linear-gradient(135deg,#f59e0b,#eab308)", color: "white", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                  >
                    📷 Scanner
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    disabled={busyDeleteAll || totalCount === 0}
                    title="Supprimer tout le catalogue"
                    style={{ 
                      background: busyDeleteAll ? "linear-gradient(135deg,#9ca3af,#6b7280)" : "linear-gradient(135deg,#dc2626,#991b1b)", 
                      color: "white", 
                      border: "none", 
                      padding: "10px 14px", 
                      borderRadius: 10, 
                      fontWeight: 800, 
                      cursor: (busyDeleteAll || totalCount === 0) ? "not-allowed" : "pointer", 
                      opacity: (busyDeleteAll || totalCount === 0) ? 0.5 : 1,
                      boxShadow: (busyDeleteAll || totalCount === 0) ? "none" : "0 4px 12px rgba(220,38,38,0.3)"
                    }}
                  >
                    {busyDeleteAll ? "⏳ Suppression..." : "🗑️ Supprimer tout"}
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {editingId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      style={{ background: "linear-gradient(135deg,#6b7280,#4b5563)", color: "white", border: "none", padding: "10px 16px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}
                    >
                      Annuler
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    style={{ background: "linear-gradient(135deg,#0ea5e9,#2563eb)", color: "white", border: "none", padding: "10px 18px", borderRadius: 10, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? "..." : editingId ? "💾 MAJ" : "💾 Ajouter"}
                  </button>
                </div>
              </div>

              {importStats && (
                <div style={{ marginTop: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Résumé import</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
                    <span>Total: <b>{importStats.total}</b></span>
                    <span>Traités: <b>{importStats.processed}</b></span>
                    <span>Créés: <b style={{ color: "#16a34a" }}>{importStats.created}</b></span>
                    <span>MAJ: <b style={{ color: "#2563eb" }}>{importStats.updated}</b></span>
                    <span>Ignorés: <b>{importStats.skipped}</b></span>
                    <span>Erreurs: <b style={{ color: "#dc2626" }}>{importStats.errors?.length || 0}</b></span>
                  </div>
                </div>
              )}
            </form>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Rechercher dans tout le catalogue... (ignore accents/majuscules)"
              style={{ flex: "1 1 280px", minWidth: 240, padding: "10px 14px", borderRadius: 999, border: "2px solid #e5e7eb", background: "#fff" }}
              disabled={!loaded}
            />
            
            <button
              onClick={handlePrint}
              disabled={!loaded}
              style={{
                background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: 10,
                fontWeight: 800,
                cursor: loaded ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(139,92,246,0.3)",
                opacity: loaded ? 1 : 0.5
              }}
              title="Imprimer le catalogue"
            >
              🖨️ Imprimer
            </button>
            
            <div style={{ 
              padding: "10px 16px", 
              background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", 
              border: "2px solid #86efac",
              borderRadius: 10, 
              color: "#166534", 
              fontWeight: 700,
              fontSize: 14,
              opacity: loaded ? 1 : 0.6
            }}>
              📊 {loaded ? `${filtered.length} résultat(s) • Page ${currentPage}/${totalPages}` : "Catalogue non chargé"}
            </div>
          </div>

          {!loaded ? (
            <div style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              padding: 24,
              textAlign: "center",
              color: "#475569",
              fontWeight: 700,
              boxShadow: "0 10px 25px rgba(0,0,0,0.06)"
            }}>
              Cliquez sur <span style={{ color: "#16a34a" }}>« Charger le catalogue »</span> pour afficher la première page.
            </div>
          ) : (
            <>
              <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "linear-gradient(135deg,#1e293b,#334155)", color: "white" }}>
                        <th style={{ textAlign: "left", padding: 12, fontSize: 13 }}>Nom</th>
                        <th style={{ textAlign: "left", padding: 12, fontSize: 13 }}>Code-barres</th>
                        <th style={{ textAlign: "right", padding: 12, fontSize: 13 }}>Prix</th>
                        <th style={{ textAlign: "right", padding: 12, fontSize: 13 }}>Qté</th>
                        <th style={{ textAlign: "center", padding: 12, fontSize: 13, width: 200 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingPage ? (
                        <tr>
                          <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "#6366f1", fontWeight: 700 }}>
                            ⏳ {isSearching ? "Recherche en cours..." : `Chargement de la page ${currentPage}...`}
                          </td>
                        </tr>
                      ) : paginatedItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "#64748b" }}>
                            {search ? `Aucun résultat pour "${search}"` : "Aucun médicament"}
                          </td>
                        </tr>
                      ) : (
                        paginatedItems.map((it, idx) => (
                          <TableRow 
                            key={it.id} 
                            item={it} 
                            index={idx} 
                            onEdit={onEdit} 
                            onDelete={onDelete} 
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                {isSearching ? (
                  <Pagination 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    loading={false}
                    canGoNext={currentPage < totalPages}
                    canGoPrev={currentPage > 1}
                  />
                ) : (
                  <Pagination 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                    loading={loadingPage}
                    canGoNext={canGoNext}
                    canGoPrev={canGoPrev}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <CameraBarcodeModal 
          open={showScanner} 
          onClose={() => setShowScanner(false)} 
          onDetected={handleScanned}
        />
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media screen {
          .print-only {
            display: none !important;
          }
          .no-print {
            display: block !important;
          }
        }

        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body {
            margin: 0 !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          tr {
            page-break-inside: avoid;
          }

          thead {
            display: table-header-group;
          }

          @media (max-width: 768px) {
            .print-only table {
              font-size: 7pt !important;
            }
            .print-only th, .print-only td {
              padding: 1mm !important;
            }
            .print-only h1 {
              font-size: 14pt !important;
            }
          }
        }
      `}</style>
    </>
  );
}

function CameraBarcodeModal({ open, onClose, onDetected }) {
  const [error, setError] = useState("");
  const [lastCode, setLastCode] = useState("");
  const scannerRef = useRef(null);
  const isCleaningRef = useRef(false);
  const lastDetectionTimeRef = useRef(0);
  const detectionCountRef = useRef({});
  const scannerDivId = "catalogue-scanner-region";

  const validateBarcode = (code) => {
    const cleaned = String(code).trim();
    
    if (cleaned.length < 6) return null;
    if (cleaned.length > 20) return null;
    
    if (/^\d{13}$/.test(cleaned)) {
      const digits = cleaned.split('').map(Number);
      const checksum = digits[12];
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += digits[i] * (i % 2 === 0 ? 1 : 3);
      }
      const calculatedChecksum = (10 - (sum % 10)) % 10;
      
      if (checksum === calculatedChecksum) {
        return cleaned;
      } else {
        return null;
      }
    }
    
    if (/^\d{8}$/.test(cleaned)) return cleaned;
    if (/^\d{12}$/.test(cleaned)) return cleaned;
    if (/^[A-Z0-9\-\.]+$/i.test(cleaned) && cleaned.length >= 6 && cleaned.length <= 20) return cleaned;
    
    return null;
  };

  const handleBarcodeDetected = useCallback((decodedText) => {
    const now = Date.now();
    const validated = validateBarcode(decodedText);
    
    if (!validated) return;
    
    if (lastDetectionTimeRef.current && (now - lastDetectionTimeRef.current) < 2000) return;
    
    if (!detectionCountRef.current[validated]) {
      detectionCountRef.current[validated] = 0;
    }
    detectionCountRef.current[validated]++;
    
    lastDetectionTimeRef.current = now;
    setLastCode(validated);
    
    if (onDetected) onDetected(validated);
    
    setTimeout(() => onClose?.(), 1000);
  }, [onDetected, onClose]);

  const cleanupScanner = useCallback(() => {
    if (isCleaningRef.current || !scannerRef.current) return;
    
    isCleaningRef.current = true;
    
    try {
      const scanner = scannerRef.current;
      if (scanner && typeof scanner.clear === 'function') {
        scanner.clear().catch(() => {});
      }
    } catch (e) {
      console.warn("Error during scanner cleanup:", e);
    } finally {
      scannerRef.current = null;
      isCleaningRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      cleanupScanner();
      setError("");
      setLastCode("");
      lastDetectionTimeRef.current = 0;
      detectionCountRef.current = {};
      return;
    }

    let mounted = true;
    let scanner = null;

    const initScanner = async () => {
      try {
        setError("");

        await new Promise(resolve => setTimeout(resolve, 150));

        if (!mounted) return;

        scanner = new Html5QrcodeScanner(
          scannerDivId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            formatsToSupport: [0, 9, 10, 14, 15, 5, 3, 4],
          },
          false
        );

        if (!mounted) {
          scanner.clear().catch(() => {});
          return;
        }

        scanner.render(
          (decodedText) => {
            if (!mounted) return;
            handleBarcodeDetected(decodedText);
          },
          () => {}
        );

        if (mounted) {
          scannerRef.current = scanner;
        }
      } catch (e) {
        if (mounted) {
          setError("Impossible d'accéder à la caméra.");
        }
      }
    };

    initScanner();

    return () => {
      mounted = false;
      if (scanner) {
        scanner.clear().catch(() => {});
      }
    };
  }, [open, handleBarcodeDetected, cleanupScanner]);

  if (!open) return null;

  return (
    <div 
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.85)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        backdropFilter: "blur(6px)",
        animation: "fadeIn .3s ease"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div 
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: 32,
          maxWidth: 600,
          width: "90%",
          boxShadow: "0 25px 80px rgba(0,0,0,.4)",
          position: "relative",
          animation: "slideUp .3s ease"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            fontSize: 20,
            fontWeight: 800
          }}
        >
          ×
        </button>
        
        <h3 style={{ marginBottom: 16, fontSize: "1.5em", fontWeight: 800, textAlign: "center", color: "#0f172a" }}>
          📷 Scanner
        </h3>

        {error && (
          <div style={{
            background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
            border: "2px solid #fecaca",
            color: "#7f1d1d",
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            fontWeight: 700
          }}>
            ⚠️ {error}
          </div>
        )}

        {lastCode && (
          <div style={{
            background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
            border: "2px solid #86efac",
            color: "#065f46",
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            fontWeight: 700
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: "1.5em" }}>✅</span>
              <span>Code détecté !</span>
            </div>
            <div style={{ 
              background: "#fff", 
              padding: "12px 16px", 
              borderRadius: 8, 
              fontFamily: "Monaco, monospace",
              fontSize: "1.2em",
              textAlign: "center",
              color: "#0f172a"
            }}>
              {lastCode}
            </div>
          </div>
        )}

        <div 
          id="catalogue-scanner-region"
          style={{ 
            width: "100%", 
            minHeight: 400,
            borderRadius: 16,
            overflow: "hidden",
            background: "#000",
            margin: "20px 0"
          }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button 
            onClick={onClose}
            style={{ 
              flex: 1,
              background: "linear-gradient(135deg, #6b7280, #4b5563)",
              color: "white",
              border: "none",
              padding: "12px 18px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            Fermer
          </button>
          
          {lastCode && (
            <button 
              onClick={() => {
                setLastCode("");
                lastDetectionTimeRef.current = 0;
                detectionCountRef.current = {};
              }}
              style={{ 
                flex: 1,
                background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
                color: "white",
                border: "none",
                padding: "12px 18px",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              🔄 Autre
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
/*
 * GESTION DES PAIEMENTS MULTI-LOTS - Version optimisée pour Firestore
 *
 * ✅ Correctifs majeurs inclus :
 * - Utilitaires de dates robustes (toDateSafe, formatDate, formatDateTime, …)
 * - Remplacement de tous les `.toDate()` non sûrs (évite "toDate is not a function")
 * - Tri par date sécurisé (secondsFromAnyDate)
 * - Affichages dates/horaires uniformes
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  query,
  where,
  onSnapshot
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

/* ===========================
   🔧 UTILITAIRES DE DATES
   =========================== */

/** Convertit n'importe quelle valeur en Date si possible, sinon null */
function toDateSafe(value) {
  if (!value) return null;

  // Firestore Timestamp
  if (typeof value?.toDate === "function") return value.toDate();

  // Objet {seconds, nanoseconds}
  if (typeof value === "object" && typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  // Déjà une Date
  if (value instanceof Date) return value;

  // String / number (ISO ou milliseconds)
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/** Retourne un entier "secondes" depuis epoch pour trier en sécurité */
function secondsFromAnyDate(value) {
  const d = toDateSafe(value);
  return d ? Math.floor(d.getTime() / 1000) : 0;
}

/** 31/08/2025, 14:32:15 */
function formatDateTime(value, locale = "fr-FR") {
  const d = toDateSafe(value);
  return d ? d.toLocaleString(locale) : "—";
}

/** 31/08/2025 */
function formatDate(value, locale = "fr-FR") {
  const d = toDateSafe(value);
  return d ? d.toLocaleDateString(locale) : "—";
}

/** 14:32:15 */
function formatTime(value, locale = "fr-FR") {
  const d = toDateSafe(value);
  return d ? d.toLocaleTimeString(locale) : "—";
}

export default function Paiements() {
  const { societeId, user, loading } = useUserRole();
  const [waiting, setWaiting] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // États principaux
  const [relatedTo, setRelatedTo] = useState("achats");
  const [paiements, setPaiements] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [stockEntries, setStockEntries] = useState([]); // 🆕 Pour multi-lots
  const [selectedDoc, setSelectedDoc] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFiltres, setShowFiltres] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showStockDetails, setShowStockDetails] = useState(false); // 🆕 Afficher détails multi-lots
  const [showHistorique, setShowHistorique] = useState(false);
  const [totalBonSelectionne, setTotalBonSelectionne] = useState(0);
  const [selectedPhone, setSelectedPhone] = useState("");
  const [editingPaiement, setEditingPaiement] = useState(null);

  // 📱 Responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [notification, setNotification] = useState(null);

  // Refs listeners
  const documentsUnsubscribeRef = useRef(null);
  const paiementsUnsubscribeRef = useRef(null);
  const stockEntriesUnsubscribeRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  // 📱 Hook taille d'écran
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Synchronisation du chargement
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // Notifications
  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Nettoyage listeners
  const cleanupListeners = useCallback(() => {
    if (documentsUnsubscribeRef.current) {
      documentsUnsubscribeRef.current();
      documentsUnsubscribeRef.current = null;
    }
    if (paiementsUnsubscribeRef.current) {
      paiementsUnsubscribeRef.current();
      paiementsUnsubscribeRef.current = null;
    }
    if (stockEntriesUnsubscribeRef.current) {
      stockEntriesUnsubscribeRef.current();
      stockEntriesUnsubscribeRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanupListeners(), [cleanupListeners]);

  // Retry avec backoff
  const retryConnection = useCallback(() => {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    retryTimeoutRef.current = setTimeout(() => {
      console.log(`Tentative de reconnexion ${retryCount + 1}...`);
      setRetryCount((prev) => prev + 1);
      setConnectionError(null);
    }, delay);
  }, [retryCount]);

  // 🆕 Chargement entrées stock multi-lots
  const loadStockEntries = useCallback(async () => {
    if (!societeId) return setStockEntries([]);

    try {
      const q = collection(db, "societe", societeId, "stock_entries");

      stockEntriesUnsubscribeRef.current = onSnapshot(
        q,
        (snapshot) => {
          const entries = [];
          snapshot.forEach((d) => entries.push({ id: d.id, ...d.data() }));

          // Tri client : nom puis date d'expiration (sécurisée)
          entries.sort((a, b) => {
            if (a.nom !== b.nom) return String(a.nom || "").localeCompare(String(b.nom || ""));
            return secondsFromAnyDate(a.datePeremption) - secondsFromAnyDate(b.datePeremption);
          });

          setStockEntries(entries);
          setConnectionError(null);
        },
        (error) => {
          console.error("Erreur listener stock entries:", error);
          loadStockEntriesFallback();
        }
      );
    } catch (error) {
      console.error("Erreur lors de l'établissement du listener stock entries:", error);
      loadStockEntriesFallback();
    }
  }, [societeId]);

  const loadStockEntriesFallback = useCallback(async () => {
    if (!societeId) return;
    try {
      const snapshot = await getDocs(collection(db, "societe", societeId, "stock_entries"));
      const entries = [];
      snapshot.forEach((d) => entries.push({ id: d.id, ...d.data() }));
      entries.sort((a, b) => {
        if (a.nom !== b.nom) return String(a.nom || "").localeCompare(String(b.nom || ""));
        return secondsFromAnyDate(a.datePeremption) - secondsFromAnyDate(b.datePeremption);
      });
      setStockEntries(entries);
    } catch (error) {
      console.error("Erreur fallback stock entries:", error);
    }
  }, [societeId]);

  // 🆕 Calcul du total d'un document
  const getTotalDoc = (docu) => {
    if (!docu || !Array.isArray(docu.articles) || docu.articles.length === 0) return 0;
    return (
      docu.articles.reduce((sum, a) => {
        const prix =
          relatedTo === "achats"
            ? Number(a.prixAchat || a.prixUnitaire || 0)
            : Number(a.prixUnitaire || a.prixVente || 0);
        const quantite = Number(a.quantite || 0);
        const remise = Number(a.remise || 0);
        return sum + (prix * quantite - remise);
      }, 0) - (Number(docu.remiseGlobale) || 0)
    );
  };

  // MAJ statut de paiement
  const updateDocumentStatus = async (docId, type, totalPaye, totalDoc) => {
    if (!societeId || !user) return;

    try {
      let nouveauStatut = "impayé";
      if (totalPaye >= totalDoc) nouveauStatut = "payé";
      else if (totalPaye > 0) nouveauStatut = "partiel";

      const docRef = doc(db, "societe", societeId, type, docId);
      await updateDoc(docRef, {
        statutPaiement: nouveauStatut,
        montantPaye: totalPaye,
        lastPaymentUpdate: Timestamp.now(),
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
    } catch (error) {
      console.error("Erreur lors de la mise à jour du statut:", error);
      setConnectionError("Erreur lors de la mise à jour du statut du document");
    }
  };

  // Chargement documents (listener)
  const loadDocuments = useCallback(async () => {
    if (!societeId) return;

    try {
      const q = collection(db, "societe", societeId, relatedTo);

      documentsUnsubscribeRef.current = onSnapshot(
        q,
        (snapshot) => {
          const docs = [];
          snapshot.forEach((dSnap) => {
            const data = dSnap.data();
            if (
              Array.isArray(data.articles) &&
              data.articles.some((a) => typeof a.quantite === "number" && (a.prixAchat || a.prixUnitaire))
            ) {
              docs.push({ id: dSnap.id, ...data });
            }
          });

          // Tri client par date (sécurisé)
          docs.sort((a, b) => {
            const sa = secondsFromAnyDate(a.date) || secondsFromAnyDate(a.timestamp);
            const sb = secondsFromAnyDate(b.date) || secondsFromAnyDate(b.timestamp);
            return sb - sa;
          });

          setDocuments(docs.slice(0, 100)); // perf
          setConnectionError(null);
          setRetryCount(0);
        },
        (error) => {
          console.error("Erreur listener documents:", error);
          setConnectionError("Connexion perdue. Tentative de reconnexion...");
          loadDocumentsFallback();
          retryConnection();
        }
      );
    } catch (error) {
      console.error("Erreur lors de l'établissement du listener documents:", error);
      loadDocumentsFallback();
    }
  }, [societeId, relatedTo, retryConnection]);

  // Fallback documents
  const loadDocumentsFallback = useCallback(async () => {
    if (!societeId) return;
    try {
      const snapshot = await getDocs(collection(db, "societe", societeId, relatedTo));
      const docs = [];
      snapshot.forEach((dSnap) => {
        const data = dSnap.data();
        if (
          Array.isArray(data.articles) &&
          data.articles.some((a) => typeof a.quantite === "number" && (a.prixAchat || a.prixUnitaire))
        ) {
          docs.push({ id: dSnap.id, ...data });
        }
      });

      docs.sort((a, b) => {
        const sa = secondsFromAnyDate(a.date) || secondsFromAnyDate(a.timestamp);
        const sb = secondsFromAnyDate(b.date) || secondsFromAnyDate(b.timestamp);
        return sb - sa;
      });

      setDocuments(docs.slice(0, 100));
      console.log("Documents chargés en mode fallback");
    } catch (error) {
      console.error("Erreur fallback documents:", error);
      setConnectionError("Impossible de charger les documents");
    }
  }, [societeId, relatedTo]);

  // Chargement paiements (listener)
  const loadPaiements = useCallback(async () => {
    if (!societeId) return;

    try {
      const qy = query(collection(db, "societe", societeId, "paiements"), where("type", "==", relatedTo));

      paiementsUnsubscribeRef.current = onSnapshot(
        qy,
        (snapshot) => {
          const paie = [];
          snapshot.forEach((d) => paie.push({ id: d.id, ...d.data() }));

          paie.sort((a, b) => secondsFromAnyDate(b.date) - secondsFromAnyDate(a.date));

          setPaiements(paie.slice(0, 200));
          setConnectionError(null);
          setRetryCount(0);
        },
        (error) => {
          console.error("Erreur listener paiements:", error);
          setConnectionError("Connexion perdue. Tentative de reconnexion...");
          loadPaiementsFallback();
          retryConnection();
        }
      );
    } catch (error) {
      console.error("Erreur lors de l'établissement du listener paiements:", error);
      loadPaiementsFallback();
    }
  }, [societeId, relatedTo, retryConnection]);

  // Fallback paiements
  const loadPaiementsFallback = useCallback(async () => {
    if (!societeId) return;
    try {
      const qy = query(collection(db, "societe", societeId, "paiements"), where("type", "==", relatedTo));
      const snapshot = await getDocs(qy);
      const paie = [];
      snapshot.forEach((d) => paie.push({ id: d.id, ...d.data() }));
      paie.sort((a, b) => secondsFromAnyDate(b.date) - secondsFromAnyDate(a.date));
      setPaiements(paie.slice(0, 200));
      console.log("Paiements chargés en mode fallback");
    } catch (error) {
      console.error("Erreur fallback paiements:", error);
      setConnectionError("Impossible de charger les paiements");
    }
  }, [societeId, relatedTo]);

  // Effets de chargement
  useEffect(() => {
    if (!societeId) return;
    if (documentsUnsubscribeRef.current) documentsUnsubscribeRef.current();
    loadDocuments();
    return () => {
      if (documentsUnsubscribeRef.current) {
        documentsUnsubscribeRef.current();
        documentsUnsubscribeRef.current = null;
      }
    };
  }, [societeId, relatedTo, loadDocuments]);

  useEffect(() => {
    if (!societeId) return;
    if (paiementsUnsubscribeRef.current) paiementsUnsubscribeRef.current();
    loadPaiements();
    return () => {
      if (paiementsUnsubscribeRef.current) {
        paiementsUnsubscribeRef.current();
        paiementsUnsubscribeRef.current = null;
      }
    };
  }, [societeId, relatedTo, loadPaiements]);

  useEffect(() => {
    if (!societeId) return;
    if (stockEntriesUnsubscribeRef.current) stockEntriesUnsubscribeRef.current();
    loadStockEntries();
    return () => {
      if (stockEntriesUnsubscribeRef.current) {
        stockEntriesUnsubscribeRef.current();
        stockEntriesUnsubscribeRef.current = null;
      }
    };
  }, [societeId, loadStockEntries]);

  // Réinit sur changement type
  useEffect(() => {
    setSelectedDoc("");
    setTotalBonSelectionne(0);
    setSelectedPhone("");
    setEditingPaiement(null);
    setConnectionError(null);
    setRetryCount(0);
  }, [relatedTo]);

  // Retry manuel
  const handleRetryConnection = () => {
    setConnectionError(null);
    setRetryCount(0);
    cleanupListeners();
    setTimeout(() => {
      loadDocuments();
      loadPaiements();
      loadStockEntries();
    }, 1000);
  };

  // Regroupement paiements par doc
  const paiementsByDoc = {};
  paiements.forEach((p) => {
    if (!paiementsByDoc[p.docId]) paiementsByDoc[p.docId] = [];
    paiementsByDoc[p.docId].push(p);
  });

  // Filtrage docs affichés
  const docsAffiches = documents.filter((docu) => {
    const total = getTotalDoc(docu);
    const paid = (paiementsByDoc[docu.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
    const solde = total - paid;
    if (filterStatus === "paid") return solde <= 0;
    if (filterStatus === "due") return solde > 0;
    return true;
  });

  // Sélection d'un document
  const handleSelectDoc = (docId) => {
    setSelectedDoc(docId);
    const d = documents.find((x) => x.id === docId);
    if (d) {
      const total = getTotalDoc(d);
      const paid = (paiementsByDoc[docId] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
      const restant = total - paid;
      setTotalBonSelectionne(total);
      setMontant(restant > 0 ? String(restant) : "");
      setSelectedPhone(
        (relatedTo === "achats" ? d.telephone : d.telephoneClient) || d.telephone || ""
      );
    } else {
      setTotalBonSelectionne(0);
      setSelectedPhone("");
      setMontant("");
    }
  };

  // Ajout / Modification paiement
  const handleSavePaiement = async (e) => {
    e.preventDefault();
    if (!societeId || !user || !selectedDoc || !montant) return;

    const montantNum = Number(montant);
    if (montantNum <= 0) {
      showNotification("Le montant doit être supérieur à 0", "error");
      return;
    }

    const docData = documents.find((d) => d.id === selectedDoc);
    const totalDoc = getTotalDoc(docData);
    const paiementsDoc = paiementsByDoc[selectedDoc] || [];
    const dejaPaye = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);

    try {
      if (editingPaiement) {
        const ancienMontant = Number(editingPaiement.montant);
        const nouveauTotal = dejaPaye - ancienMontant + montantNum;

        if (nouveauTotal > totalDoc) {
          showNotification(
            `Le montant total payé (${nouveauTotal} DH) dépasserait le total du document (${totalDoc} DH)`,
            "error"
          );
          return;
        }

        await updateDoc(doc(db, "societe", societeId, "paiements", editingPaiement.id), {
          montant: montantNum,
          mode,
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now(),
          modifiedBy: user.displayName || user.email || "Inconnu",
          modifiedAt: Timestamp.now()
        });

        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "paiement",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            docId: selectedDoc,
            montant: montantNum,
            mode: mode,
            type: relatedTo,
            action: "modification",
            paiementId: editingPaiement.id
          }
        });

        await updateDocumentStatus(selectedDoc, relatedTo, nouveauTotal, totalDoc);

        setEditingPaiement(null);
        showNotification("Paiement modifié avec succès!", "success");
      } else {
        const nouveauTotal = dejaPaye + montantNum;

        if (nouveauTotal > totalDoc) {
          showNotification(
            `Le montant total payé (${nouveauTotal} DH) dépasserait le total du document (${totalDoc} DH)`,
            "error"
          );
          return;
        }

        const addedPaiement = await addDoc(collection(db, "societe", societeId, "paiements"), {
          docId: selectedDoc,
          montant: montantNum,
          mode,
          type: relatedTo,
          date: Timestamp.now(),
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          societeId: societeId,
          createdBy: user.displayName || user.email || "Inconnu",
          createdByEmail: user.email
        });

        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "paiement",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            docId: selectedDoc,
            montant: montantNum,
            mode: mode,
            type: relatedTo,
            action: "création",
            paiementId: addedPaiement.id
          }
        });

        await updateDocumentStatus(selectedDoc, relatedTo, nouveauTotal, totalDoc);

        showNotification("Paiement enregistré avec succès!", "success");
      }

      // Reset form
      setSelectedDoc("");
      setMontant("");
      setMode("Espèces");
      setTotalBonSelectionne(0);
      setSelectedPhone("");
      setConnectionError(null);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du paiement:", error);
      setConnectionError("Erreur lors de la sauvegarde. Veuillez réessayer.");
      showNotification("Erreur lors de la sauvegarde", "error");
    }
  };

  // Suppression paiement
  const handleDeletePaiement = async (paiement) => {
    if (!societeId || !user) return;
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce paiement ?")) return;

    try {
      const docData = documents.find((d) => d.id === paiement.docId);
      const totalDoc = getTotalDoc(docData);
      const paiementsDoc = paiementsByDoc[paiement.docId] || [];
      const dejaPaye = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
      const nouveauTotal = dejaPaye - Number(paiement.montant);

      await deleteDoc(doc(db, "societe", societeId, "paiements", paiement.id));

      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "paiement",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          docId: paiement.docId,
          montant: paiement.montant,
          mode: paiement.mode,
          type: paiement.type,
          action: "suppression",
          paiementId: paiement.id
        }
      });

      await updateDocumentStatus(paiement.docId, relatedTo, nouveauTotal, totalDoc);
      setConnectionError(null);
      showNotification("Paiement supprimé avec succès!", "success");
    } catch (error) {
      console.error("Erreur lors de la suppression du paiement:", error);
      setConnectionError("Erreur lors de la suppression. Veuillez réessayer.");
      showNotification("Erreur lors de la suppression", "error");
    }
  };

  // Édition
  const handleEditPaiement = (paiement) => {
    setEditingPaiement(paiement);
    setSelectedDoc(paiement.docId);
    setMontant(String(paiement.montant));
    setMode(paiement.mode);
    handleSelectDoc(paiement.docId);
    setShowForm(true);
  };

  // Nom d'utilisateur
  const getUserDisplayName = (paiement) => {
    if (paiement.creeParEmail) return paiement.creeParEmail.split("@")[0];
    if (paiement.createdBy && paiement.createdBy !== "Inconnu") return paiement.createdBy;
    if (paiement.createdByEmail) return paiement.createdByEmail.split("@")[0];
    return "Non spécifié";
  };

  // Détails article
  const renderArticleDetails = (article, index) => {
    const hasLotInfo = article.numeroLot || article.fournisseurArticle || article.datePeremption;

    return (
      <div
        key={index}
        style={{
          background: index % 2 === 0 ? "#f8fafc" : "white",
          padding: isMobile ? "8px" : "12px",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
          marginBottom: "4px"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "8px"
          }}
        >
          <div style={{ flex: 1, minWidth: "150px" }}>
            <div style={{ fontWeight: 700, color: "#2d3748", fontSize: isMobile ? "0.9em" : "1em" }}>
              {article.produit || "Article non spécifié"}
            </div>
            {hasLotInfo && (
              <div style={{ fontSize: "0.8em", color: "#4a5568", marginTop: "4px" }}>
                {article.numeroLot && <span>🏷️ Lot: {article.numeroLot} • </span>}
                {article.fournisseurArticle && <span>🏢 {article.fournisseurArticle} • </span>}
                {article.datePeremption && <span>📅 Exp: {formatDate(article.datePeremption)}</span>}
              </div>
            )}
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#667eea", fontWeight: 700 }}>
              {article.quantite || 0} × {Number(article.prixAchat || article.prixUnitaire || 0).toFixed(2)} DH
            </div>
            <div style={{ color: "#48bb78", fontWeight: 700, fontSize: "1.1em" }}>
              =
              {(
                (Number(article.prixAchat || article.prixUnitaire || 0) * Number(article.quantite || 0)) -
                Number(article.remise || 0)
              ).toFixed(2)}{" "}
              DH
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Badges statut
  const getStatusChip = (solde) => {
    if (solde <= 0) {
      return (
        <span
          style={{
            background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
            color: "white",
            padding: isMobile ? "4px 8px" : "6px 12px",
            borderRadius: "15px",
            fontSize: isMobile ? "0.7em" : "0.8em",
            fontWeight: 600,
            textTransform: "uppercase"
          }}
        >
          ✅ Payé
        </span>
      );
    }
    return (
      <span
        style={{
          background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
          color: "white",
          padding: isMobile ? "4px 8px" : "6px 12px",
          borderRadius: "15px",
          fontSize: isMobile ? "0.7em" : "0.8em",
          fontWeight: 600,
          textTransform: "uppercase"
        }}
      >
        ❌ {solde.toFixed(2)} DH dû
      </span>
    );
  };

  // Styles
  const getResponsiveStyles = () => ({
    container: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      minHeight: "100vh",
      padding: isMobile ? "10px" : isTablet ? "15px" : "20px",
      fontFamily: "'Inter', Arial, sans-serif"
    },
    mainCard: {
      background: "white",
      borderRadius: isMobile ? "15px" : "25px",
      boxShadow: isMobile ? "0 15px 30px rgba(0,0,0,0.1)" : "0 30px 60px rgba(0,0,0,0.15)",
      overflow: "hidden",
      margin: "0 auto",
      maxWidth: isMobile ? "100%" : isTablet ? "95%" : "1500px"
    },
    header: {
      background: "linear-gradient(135deg, #4a5568 0%, #2d3748 100%)",
      padding: isMobile ? "20px 15px" : isTablet ? "30px 25px" : "40px",
      textAlign: "center",
      color: "white",
      position: "relative"
    },
    title: {
      fontSize: isMobile ? "1.8em" : isTablet ? "2.3em" : "2.8em",
      fontWeight: 800,
      margin: 0,
      textShadow: "3px 3px 6px rgba(0,0,0,0.3)",
      letterSpacing: isMobile ? "1px" : "2px"
    },
    subtitle: {
      fontSize: isMobile ? "0.9em" : isTablet ? "1em" : "1.2em",
      opacity: 0.9,
      marginTop: "15px",
      letterSpacing: "1px"
    },
    content: {
      padding: isMobile ? "20px 15px" : isTablet ? "35px 25px" : "50px"
    },
    formCard: {
      background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)",
      borderRadius: isMobile ? "15px" : "25px",
      padding: isMobile ? "20px 15px" : isTablet ? "30px 20px" : "40px",
      marginBottom: isMobile ? "20px" : "30px",
      border: "3px solid #e2e8f0",
      boxShadow: "0 15px 40px rgba(0,0,0,0.08)"
    },
    stockDetailsCard: {
      background: "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)",
      borderRadius: isMobile ? "15px" : "25px",
      padding: isMobile ? "15px" : "25px",
      marginBottom: isMobile ? "20px" : "30px",
      border: "2px solid #81e6d9",
      boxShadow: "0 10px 30px rgba(0,0,0,0.05)"
    },
    button: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      border: "none",
      borderRadius: isMobile ? "10px" : "15px",
      padding: isMobile ? "12px 20px" : isTablet ? "14px 25px" : "15px 30px",
      color: "white",
      fontWeight: 700,
      fontSize: isMobile ? "0.9em" : "1em",
      cursor: "pointer",
      boxShadow: "0 8px 25px rgba(102, 126, 234, 0.4)",
      transition: "all 0.3s ease",
      textTransform: "uppercase",
      letterSpacing: "1px"
    },
    successButton: {
      background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
      boxShadow: "0 8px 25px rgba(72, 187, 120, 0.4)"
    },
    warningButton: {
      background: "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)",
      boxShadow: "0 8px 25px rgba(237, 137, 54, 0.4)"
    },
    dangerButton: {
      background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
      boxShadow: "0 8px 25px rgba(245, 101, 101, 0.4)"
    },
    infoButton: {
      background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
      boxShadow: "0 8px 25px rgba(66, 153, 225, 0.4)"
    },
    notification: {
      position: "fixed",
      top: isMobile ? "15px" : "30px",
      right: isMobile ? "15px" : "30px",
      padding: isMobile ? "15px 20px" : "20px 30px",
      borderRadius: isMobile ? "10px" : "15px",
      color: "white",
      fontWeight: 700,
      zIndex: 1000,
      boxShadow: "0 15px 40px rgba(0,0,0,0.2)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.2)",
      fontSize: isMobile ? "0.85em" : "1em",
      maxWidth: isMobile ? "calc(100vw - 30px)" : "auto"
    }
  });

  const styles = getResponsiveStyles();

  // Gestion du chargement / connexions
  if (waiting) {
    return (
      <div
        style={{
          padding: isMobile ? 15 : 30,
          textAlign: "center",
          color: "#667eea",
          background: "linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isMobile ? "1.2em" : "1.5em",
          fontWeight: 600
        }}
      >
        🔄 Chargement des paiements multi-lots...
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          padding: isMobile ? 15 : 30,
          textAlign: "center",
          color: "#e53e3e",
          background: "linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isMobile ? "1.2em" : "1.5em",
          fontWeight: 600
        }}
      >
        ❌ Non connecté.
      </div>
    );
  }

  if (!societeId) {
    return (
      <div
        style={{
          padding: isMobile ? 15 : 30,
          textAlign: "center",
          color: "#e53e3e",
          background: "linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isMobile ? "1.2em" : "1.5em",
          fontWeight: 600
        }}
      >
        ❌ Aucune société sélectionnée.
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        <div style={styles.header}>
          <h1 style={styles.title}>💳 Gestion des Paiements - Multi-Lots</h1>
          <p style={styles.subtitle}>Système de paiements avec traçabilité des lots et fournisseurs</p>
        </div>

        <div style={styles.content}>
          {/* Indicateur */}
          <div
            style={{
              background: "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)",
              padding: "15px",
              borderRadius: "10px",
              marginBottom: "20px",
              border: "2px solid #81e6d9",
              textAlign: "center"
            }}
          >
            <p
              style={{
                color: "#2d3748",
                fontSize: "0.9em",
                fontWeight: 600,
                margin: "0 0 5px 0"
              }}
            >
              💳 <strong>Paiements Multi-Lots</strong> - Traçabilité complète des règlements
            </p>
            <p style={{ color: "#4a5568", fontSize: "0.8em", margin: 0 }}>
              📊 {stockEntries.length} entrées de stock • {documents.length} documents • {paiements.length} paiements
            </p>
          </div>

          {/* Notification */}
          {notification && (
            <div
              style={{
                ...styles.notification,
                background:
                  notification.type === "success"
                    ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)"
                    : notification.type === "error"
                    ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                    : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)"
              }}
            >
              {notification.message}
            </div>
          )}

          {/* Erreurs connexion */}
          {connectionError && (
            <div
              style={{
                background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
                color: "white",
                padding: "15px 20px",
                borderRadius: "10px",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px"
              }}
            >
              <span>{connectionError}</span>
              <button
                style={{
                  ...styles.button,
                  background: "rgba(255,255,255,0.2)",
                  padding: "8px 16px",
                  fontSize: "0.8em"
                }}
                onClick={handleRetryConnection}
              >
                🔄 Réessayer
              </button>
            </div>
          )}

          {/* Choix type */}
          <div style={styles.formCard}>
            <div
              style={{
                display: "flex",
                gap: "16px",
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "space-between"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <label style={{ fontWeight: 700, color: "#4a5568" }}>Type de Paiements:</label>
                <select
                  style={{
                    padding: "10px 15px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "8px",
                    fontWeight: 600,
                    background: "white",
                    minWidth: isMobile ? "200px" : "250px"
                  }}
                  value={relatedTo}
                  onChange={(e) => setRelatedTo(e.target.value)}
                >
                  <option value="achats">💰 Paiements Achats (Fournisseurs)</option>
                  <option value="ventes">🛒 Paiements Ventes (Clients)</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: connectionError ? "#f56565" : "#48bb78"
                  }}
                ></div>
                <span
                  style={{
                    fontSize: "0.8em",
                    color: connectionError ? "#f56565" : "#48bb78",
                    fontWeight: 600
                  }}
                >
                  {connectionError ? "Déconnecté" : "Connecté"}
                </span>
              </div>
            </div>
          </div>

          {/* Boutons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
              marginBottom: "20px",
              flexWrap: "wrap"
            }}
          >
            <button
              style={{
                ...styles.button,
                background: showForm
                  ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              }}
              onClick={() => {
                setShowForm((v) => !v);
                setEditingPaiement(null);
              }}
            >
              {showForm ? "➖ Masquer" : "➕ Nouveau"} Paiement
            </button>

            <button
              style={{
                ...styles.button,
                background: showStockDetails
                  ? "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)"
                  : "linear-gradient(135deg, #38a169 0%, #48bb78 100%)"
              }}
              onClick={() => setShowStockDetails((v) => !v)}
            >
              {showStockDetails ? "📦 Masquer" : "📦 Voir"} Stock Multi-Lots
            </button>

            <button
              style={{
                ...styles.button,
                background: showFiltres
                  ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                  : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)"
              }}
              onClick={() => setShowFiltres((v) => !v)}
            >
              {showFiltres ? "➖ Masquer" : "🔍 Afficher"} Filtres
            </button>
          </div>

          {/* Stock multi-lots */}
          {showStockDetails && (
            <div style={styles.stockDetailsCard}>
              <h3
                style={{
                  color: "#2d3748",
                  fontSize: isMobile ? "1.2em" : "1.5em",
                  fontWeight: 800,
                  marginBottom: isMobile ? "15px" : "25px",
                  textAlign: "center"
                }}
              >
                📦 Stock Multi-Lots - Vue d'ensemble
              </h3>

              {stockEntries.filter((entry) => Number(entry.quantite) > 0).length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    color: "#6b7280",
                    fontSize: isMobile ? "1em" : "1.2em",
                    fontStyle: "italic",
                    padding: "30px"
                  }}
                >
                  Aucune entrée de stock multi-lots disponible 📋
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: "15px",
                    maxHeight: "400px",
                    overflowY: "auto"
                  }}
                >
                  {stockEntries
                    .filter((entry) => Number(entry.quantite) > 0)
                    .slice(0, 20)
                    .map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          background: "white",
                          padding: "15px",
                          borderRadius: "10px",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#2d3748", marginBottom: "8px" }}>
                          {entry.nom}
                        </div>
                        <div style={{ fontSize: "0.8em", color: "#4a5568", lineHeight: "1.4" }}>
                          🏷️ <strong>Lot:</strong> {entry.numeroLot}
                          <br />
                          🏢 <strong>Fournisseur:</strong> {entry.fournisseur}
                          <br />
                          📦 <strong>Quantité:</strong> {entry.quantite}
                          <br />
                          💰 <strong>Prix Achat:</strong> {entry.prixAchat} DH
                          <br />
                          🏪 <strong>Prix Vente:</strong> {entry.prixVente} DH
                          <br />
                          📅 <strong>Expiration:</strong> {formatDate(entry.datePeremption)}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Formulaire */}
          {showForm && (
            <div style={styles.formCard}>
              <h3
                style={{
                  color: "#2d3748",
                  fontSize: isMobile ? "1.3em" : "1.6em",
                  fontWeight: 800,
                  marginBottom: isMobile ? "20px" : "30px",
                  textAlign: "center"
                }}
              >
                {editingPaiement ? "✏️ Modification" : "➕ Nouveau"} Paiement Multi-Lots
              </h3>

              <form onSubmit={handleSavePaiement}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: isMobile ? "15px" : "25px",
                    marginBottom: isMobile ? "20px" : "30px"
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "10px",
                        fontWeight: 700,
                        color: "#4a5568",
                        fontSize: "0.9em",
                        textTransform: "uppercase"
                      }}
                    >
                      {relatedTo === "achats" ? "Bon d'Achat" : "Bon de Vente"}
                    </label>
                    <select
                      style={{
                        width: "100%",
                        padding: "12px 15px",
                        border: "2px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "0.9em",
                        fontWeight: 600,
                        background: "white"
                      }}
                      value={selectedDoc}
                      onChange={(e) => handleSelectDoc(e.target.value)}
                      required
                      disabled={!!editingPaiement}
                    >
                      <option value="">Sélectionner un document...</option>
                      {documents.map((d) => {
                        const total = getTotalDoc(d);
                        const paid = (paiementsByDoc[d.id] || []).reduce(
                          (sum, p) => sum + (Number(p.montant) || 0),
                          0
                        );
                        const solde = total - paid;

                        if (!editingPaiement && solde <= 0) return null;

                        // Date du document (sécurisée)
                        const docDate = formatDate(d.date || d.timestamp);

                        return (
                          <option key={d.id} value={d.id}>
                            {(relatedTo === "achats" ? d.fournisseur : d.client) || "N/A"} - {docDate} (Total:{" "}
                            {total.toFixed(2)} DH | Payé: {paid.toFixed(2)} DH | Reste: {solde.toFixed(2)} DH)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "10px",
                        fontWeight: 700,
                        color: "#4a5568",
                        fontSize: "0.9em",
                        textTransform: "uppercase"
                      }}
                    >
                      Montant (DH)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      style={{
                        width: "100%",
                        padding: "12px 15px",
                        border: "2px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "0.9em",
                        fontWeight: 600,
                        background: "white"
                      }}
                      value={montant}
                      onChange={(e) => setMontant(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "10px",
                        fontWeight: 700,
                        color: "#4a5568",
                        fontSize: "0.9em",
                        textTransform: "uppercase"
                      }}
                    >
                      Mode de Paiement
                    </label>
                    <select
                      style={{
                        width: "100%",
                        padding: "12px 15px",
                        border: "2px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "0.9em",
                        fontWeight: 600,
                        background: "white"
                      }}
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="Espèces">💵 Espèces</option>
                      <option value="Carte">💳 Carte Bancaire</option>
                      <option value="Virement">🏦 Virement</option>
                      <option value="Chèque">📝 Chèque</option>
                      <option value="Autre">📋 Autre</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "15px",
                    justifyContent: "center",
                    flexWrap: "wrap"
                  }}
                >
                  <button
                    type="submit"
                    style={{
                      ...styles.button,
                      ...(editingPaiement ? styles.warningButton : styles.successButton),
                      width: isMobile ? "100%" : "auto"
                    }}
                    disabled={!!connectionError}
                  >
                    {editingPaiement ? "✏️ Modifier" : "💾 Enregistrer"} Paiement
                  </button>

                  {editingPaiement && (
                    <button
                      type="button"
                      style={{
                        ...styles.button,
                        ...styles.infoButton,
                        width: isMobile ? "100%" : "auto"
                      }}
                      onClick={() => {
                        setEditingPaiement(null);
                        setSelectedDoc("");
                        setMontant("");
                        setMode("Espèces");
                        setTotalBonSelectionne(0);
                        setSelectedPhone("");
                      }}
                    >
                      ❌ Annuler
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Détails document sélectionné */}
          {selectedDoc && showForm && (
            <div style={styles.formCard}>
              <h4
                style={{
                  color: "#2d3748",
                  fontSize: "1.1em",
                  fontWeight: 700,
                  marginBottom: "15px",
                  textAlign: "center"
                }}
              >
                📄 Détails du Document Sélectionné
              </h4>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "15px",
                  marginBottom: "20px"
                }}
              >
                <div>
                  <strong>💰 Total du document:</strong> {totalBonSelectionne.toFixed(2)} DH
                </div>
                {selectedPhone && (
                  <div>
                    <strong>📞 {relatedTo === "achats" ? "Fournisseur" : "Client"}:</strong> {selectedPhone}
                  </div>
                )}
                {paiementsByDoc[selectedDoc] && (
                  <div>
                    <strong>✅ Déjà payé:</strong>{" "}
                    {paiementsByDoc[selectedDoc]
                      .reduce((sum, p) => sum + Number(p.montant), 0)
                      .toFixed(2)}{" "}
                    DH
                  </div>
                )}
                <div>
                  <strong>⏳ Reste à payer:</strong>
                  <span style={{ color: "#f56565", fontWeight: 700 }}>
                    {(
                      totalBonSelectionne -
                      (paiementsByDoc[selectedDoc] || []).reduce((sum, p) => sum + Number(p.montant), 0)
                    ).toFixed(2)}{" "}
                    DH
                  </span>
                </div>
              </div>

              {/* Articles */}
              {(() => {
                const selectedDocument = documents.find((d) => d.id === selectedDoc);
                if (selectedDocument && Array.isArray(selectedDocument.articles) && selectedDocument.articles.length > 0) {
                  return (
                    <div>
                      <h5 style={{ color: "#4a5568", marginBottom: "10px" }}>
                        📦 Articles du Document ({selectedDocument.articles.length})
                      </h5>
                      <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                        {selectedDocument.articles.map((article, index) => renderArticleDetails(article, index))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Filtres */}
          {showFiltres && (
            <div style={styles.formCard}>
              <h4
                style={{
                  color: "#2d3748",
                  fontSize: "1.1em",
                  fontWeight: 700,
                  marginBottom: "20px",
                  textAlign: "center"
                }}
              >
                🔍 Filtres de Recherche
              </h4>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "15px",
                  flexWrap: "wrap",
                  justifyContent: "space-between"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <label style={{ fontWeight: 700, color: "#4a5568" }}>Statut :</label>
                  <select
                    style={{
                      padding: "8px 12px",
                      border: "2px solid #e2e8f0",
                      borderRadius: "6px",
                      fontWeight: 600,
                      background: "white"
                    }}
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="all">Tous les documents</option>
                    <option value="paid">✅ Entièrement payés</option>
                    <option value="due">❌ Avec solde dû</option>
                  </select>
                </div>

                <div style={{ fontSize: "0.8em", color: "#4a5568" }}>
                  📊 <strong>{docsAffiches.length}</strong> documents • <strong>{paiements.length}</strong> paiements
                  <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>Triés par date (côté client)</div>
                </div>
              </div>
            </div>
          )}

          {/* Tableau récapitulatif */}
          <div>
            <h2
              style={{
                color: "#2d3748",
                fontSize: isMobile ? "1.3em" : "1.8em",
                fontWeight: 800,
                marginBottom: "20px",
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: "2px"
              }}
            >
              📋 Gestion des {relatedTo === "achats" ? "Achats" : "Ventes"} Multi-Lots ({docsAffiches.length})
            </h2>

            <div
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                justifyContent: "space-between",
                alignItems: isMobile ? "stretch" : "center",
                gap: "15px",
                marginBottom: "20px",
                padding: "20px",
                background: "linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)",
                borderRadius: "15px",
                border: "2px solid #cbd5e0"
              }}
            >
              <div style={{ fontWeight: 700, color: "#4a5568" }}>
                💰 <strong>Total affiché:</strong>{" "}
                {docsAffiches.reduce((sum, bon) => sum + getTotalDoc(bon), 0).toFixed(2)} DH
              </div>
              <div style={{ fontWeight: 600, color: "#6b7280" }}>
                📊 {docsAffiches.filter((b) => b.statutPaiement === "payé").length} payés •{" "}
                {docsAffiches.filter((b) => b.statutPaiement === "impayé").length} impayés
              </div>
            </div>

            <div
              style={{
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
                borderRadius: "15px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 15px 40px rgba(0,0,0,0.1)"
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  background: "white"
                }}
              >
                <thead
                  style={{
                    background: "linear-gradient(135deg, #2d3748 0%, #1a202c 100%)",
                    color: "white"
                  }}
                >
                  <tr>
                    <th
                      style={{
                        padding: isMobile ? "12px 8px" : "18px 15px",
                        textAlign: "left",
                        fontWeight: 700,
                        fontSize: isMobile ? "0.8em" : "0.9em",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}
                    >
                      {relatedTo === "achats" ? "Fournisseur" : "Client"}
                    </th>
                    {!isMobile && (
                      <th
                        style={{
                          padding: "18px 15px",
                          textAlign: "center",
                          fontWeight: 700,
                          fontSize: "0.9em",
                          textTransform: "uppercase",
                          letterSpacing: "1px"
                        }}
                      >
                        Date
                      </th>
                    )}
                    <th
                      style={{
                        padding: isMobile ? "12px 8px" : "18px 15px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: isMobile ? "0.8em" : "0.9em",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}
                    >
                      Total
                    </th>
                    <th
                      style={{
                        padding: isMobile ? "12px 8px" : "18px 15px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: isMobile ? "0.8em" : "0.9em",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}
                    >
                      Payé
                    </th>
                    <th
                      style={{
                        padding: isMobile ? "12px 8px" : "18px 15px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: isMobile ? "0.8em" : "0.9em",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}
                    >
                      Reste
                    </th>
                    <th
                      style={{
                        padding: isMobile ? "12px 8px" : "18px 15px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: isMobile ? "0.8em" : "0.9em",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}
                    >
                      Statut
                    </th>
                    <th
                      style={{
                        padding: isMobile ? "12px 8px" : "18px 15px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: isMobile ? "0.8em" : "0.9em",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docsAffiches.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isMobile ? 6 : 7}
                        style={{
                          padding: "40px",
                          textAlign: "center",
                          color: "#6b7280",
                          fontSize: isMobile ? "1em" : "1.2em",
                          fontStyle: "italic"
                        }}
                      >
                        {connectionError
                          ? "❌ Erreur de connexion - Utilisez le bouton Réessayer"
                          : documents.length === 0
                          ? "📝 Aucun document créé pour le moment"
                          : "🔍 Aucun document ne correspond aux critères"}
                      </td>
                    </tr>
                  ) : (
                    docsAffiches.map((docu, index) => {
                      const total = getTotalDoc(docu);
                      const paiementsDoc = paiementsByDoc[docu.id] || [];
                      const paid = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
                      const solde = total - paid;

                      return (
                        <tr
                          key={docu.id}
                          style={{
                            background: index % 2 === 0 ? "#f8fafc" : "white",
                            transition: "all 0.3s ease"
                          }}
                        >
                          <td
                            style={{
                              padding: isMobile ? "12px 8px" : "18px 15px",
                              fontWeight: 600,
                              color: "#2d3748"
                            }}
                          >
                            <div>
                              {isMobile
                                ? ((relatedTo === "achats" ? docu.fournisseur : docu.client) || "N/A").substring(0, 20) +
                                  ((((relatedTo === "achats" ? docu.fournisseur : docu.client) || "").length > 20)
                                    ? "..."
                                    : "")
                                : (relatedTo === "achats" ? docu.fournisseur : docu.client) || "N/A"}
                            </div>
                            {((relatedTo === "achats" ? docu.telephone : docu.telephoneClient) || docu.telephone) && (
                              <div style={{ fontSize: "0.7em", color: "#4a5568", marginTop: "2px" }}>
                                📞 {(relatedTo === "achats" ? docu.telephone : docu.telephoneClient) || docu.telephone}
                              </div>
                            )}
                            {isMobile && (
                              <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>
                                📅 {formatDate(docu.date || docu.timestamp)}
                              </div>
                            )}
                            {isMobile && docu.articles && docu.articles.some((a) => a.numeroLot) && (
                              <div style={{ fontSize: "0.6em", color: "#667eea", marginTop: "2px" }}>🏷️ Multi-Lots</div>
                            )}
                          </td>

                          {!isMobile && (
                            <td
                              style={{
                                padding: "18px 15px",
                                textAlign: "center",
                                color: "#4a5568",
                                fontSize: "0.9em"
                              }}
                            >
                              {formatDate(docu.date || docu.timestamp)}
                              {docu.articles && docu.articles.some((a) => a.numeroLot) && (
                                <div style={{ fontSize: "0.7em", color: "#667eea", marginTop: "2px" }}>🏷️ Multi-Lots</div>
                              )}
                            </td>
                          )}

                          <td
                            style={{
                              padding: isMobile ? "12px 8px" : "18px 15px",
                              textAlign: "center",
                              color: "#667eea",
                              fontWeight: 700,
                              fontSize: isMobile ? "0.9em" : "1.1em"
                            }}
                          >
                            {total.toFixed(2)} DH
                          </td>
                          <td
                            style={{
                              padding: isMobile ? "12px 8px" : "18px 15px",
                              textAlign: "center",
                              color: "#48bb78",
                              fontWeight: 700,
                              fontSize: isMobile ? "0.9em" : "1.1em"
                            }}
                          >
                            {paid.toFixed(2)} DH
                          </td>
                          <td
                            style={{
                              padding: isMobile ? "12px 8px" : "18px 15px",
                              textAlign: "center",
                              color: solde > 0 ? "#f56565" : "#48bb78",
                              fontWeight: 700,
                              fontSize: isMobile ? "0.9em" : "1.1em"
                            }}
                          >
                            {solde.toFixed(2)} DH
                          </td>
                          <td
                            style={{
                              padding: isMobile ? "12px 8px" : "18px 15px",
                              textAlign: "center"
                            }}
                          >
                            {getStatusChip(solde)}
                          </td>
                          <td
                            style={{
                              padding: isMobile ? "12px 8px" : "18px 15px",
                              textAlign: "center"
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexDirection: isMobile ? "column" : "row",
                                gap: "8px",
                                justifyContent: "center",
                                alignItems: "center"
                              }}
                            >
                              {solde > 0 && (
                                <button
                                  style={{
                                    ...styles.button,
                                    ...styles.successButton,
                                    padding: isMobile ? "8px 12px" : "8px 12px",
                                    fontSize: "0.8em",
                                    minWidth: isMobile ? "80px" : "auto"
                                  }}
                                  onClick={() => {
                                    handleSelectDoc(docu.id);
                                    setShowForm(true);
                                  }}
                                  disabled={!!connectionError}
                                >
                                  💰 Payer
                                </button>
                              )}
                              {(paiementsByDoc[docu.id] || []).length > 0 && (
                                <button
                                  style={{
                                    ...styles.button,
                                    ...styles.infoButton,
                                    padding: isMobile ? "8px 12px" : "8px 12px",
                                    fontSize: "0.8em",
                                    minWidth: isMobile ? "80px" : "auto"
                                  }}
                                  onClick={() => {
                                    setSelectedDoc(docu.id);
                                    setShowHistorique(true);
                                  }}
                                >
                                  📋 Historique
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

          {/* Historique */}
          {showHistorique && selectedDoc && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                background: "rgba(0,0,0,0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: "20px"
              }}
              onClick={() => setShowHistorique(false)}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: "20px",
                  padding: isMobile ? "20px" : "30px",
                  maxWidth: isMobile ? "95%" : "800px",
                  maxHeight: "80vh",
                  overflow: "auto",
                  boxShadow: "0 30px 60px rgba(0,0,0,0.3)"
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3
                  style={{
                    color: "#2d3748",
                    marginBottom: "20px",
                    textAlign: "center",
                    fontSize: isMobile ? "1.2em" : "1.5em"
                  }}
                >
                  📋 Historique des Paiements Multi-Lots
                </h3>
                <p
                  style={{
                    color: "#4a5568",
                    textAlign: "center",
                    marginBottom: "25px",
                    fontSize: isMobile ? "0.9em" : "1em"
                  }}
                >
                  {documents.find((d) => d.id === selectedDoc)?.[relatedTo === "achats" ? "fournisseur" : "client"]}
                </p>

                <div style={{ overflow: "auto", maxHeight: "400px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th
                          style={{
                            padding: isMobile ? "8px" : "12px",
                            color: "#4a5568",
                            fontSize: isMobile ? "0.8em" : "0.9em",
                            textAlign: "left"
                          }}
                        >
                          Date
                        </th>
                        <th
                          style={{
                            padding: isMobile ? "8px" : "12px",
                            color: "#4a5568",
                            fontSize: isMobile ? "0.8em" : "0.9em",
                            textAlign: "center"
                          }}
                        >
                          Montant
                        </th>
                        <th
                          style={{
                            padding: isMobile ? "8px" : "12px",
                            color: "#4a5568",
                            fontSize: isMobile ? "0.8em" : "0.9em",
                            textAlign: "center"
                          }}
                        >
                          Mode
                        </th>
                        {!isMobile && (
                          <th
                            style={{
                              padding: "12px",
                              color: "#4a5568",
                              fontSize: "0.9em",
                              textAlign: "center"
                            }}
                          >
                            Créé par
                          </th>
                        )}
                        <th
                          style={{
                            padding: isMobile ? "8px" : "12px",
                            color: "#4a5568",
                            fontSize: isMobile ? "0.8em" : "0.9em",
                            textAlign: "center"
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(paiementsByDoc[selectedDoc] || []).map((p) => (
                        <tr key={p.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td
                            style={{
                              padding: isMobile ? "8px" : "12px",
                              color: "#2d3748",
                              fontSize: isMobile ? "0.8em" : "0.9em"
                            }}
                          >
                            {formatDateTime(p.date)}
                            {p.modifieLe && (
                              <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>
                                Modifié le {formatDateTime(p.modifieLe)}
                              </div>
                            )}
                            {isMobile && (
                              <div style={{ fontSize: "0.7em", color: "#4a5568", marginTop: "2px" }}>
                                Par: {getUserDisplayName(p)}
                              </div>
                            )}
                          </td>
                          <td
                            style={{
                              padding: isMobile ? "8px" : "12px",
                              color: "#48bb78",
                              fontWeight: "bold",
                              textAlign: "center",
                              fontSize: isMobile ? "0.9em" : "1.1em"
                            }}
                          >
                            {Number(p.montant).toFixed(2)} DH
                          </td>
                          <td
                            style={{
                              padding: isMobile ? "8px" : "12px",
                              color: "#2d3748",
                              textAlign: "center",
                              fontSize: isMobile ? "0.8em" : "0.9em"
                            }}
                          >
                            {p.mode}
                          </td>
                          {!isMobile && (
                            <td
                              style={{
                                padding: "12px",
                                color: "#2d3748",
                                textAlign: "center",
                                fontSize: "0.9em"
                              }}
                            >
                              <div>{getUserDisplayName(p)}</div>
                              {p.modifieParEmail && (
                                <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>
                                  Modifié par {p.modifieParEmail.split("@")[0]}
                                </div>
                              )}
                            </td>
                          )}
                          <td
                            style={{
                              padding: isMobile ? "8px" : "12px",
                              textAlign: "center"
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "5px",
                                justifyContent: "center",
                                flexDirection: isMobile ? "column" : "row"
                              }}
                            >
                              <button
                                style={{
                                  ...styles.button,
                                  ...styles.warningButton,
                                  padding: "6px 10px",
                                  fontSize: "0.7em"
                                }}
                                onClick={() => {
                                  handleEditPaiement(p);
                                  setShowHistorique(false);
                                }}
                                disabled={!!connectionError}
                              >
                                ✏️ Modifier
                              </button>
                              <button
                                style={{
                                  ...styles.button,
                                  ...styles.dangerButton,
                                  padding: "6px 10px",
                                  fontSize: "0.7em"
                                }}
                                onClick={() => {
                                  handleDeletePaiement(p);
                                  setShowHistorique(false);
                                }}
                                disabled={!!connectionError}
                              >
                                🗑️ Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ textAlign: "center", marginTop: "20px" }}>
                  <button style={{ ...styles.button, ...styles.infoButton }} onClick={() => setShowHistorique(false)}>
                    ❌ Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
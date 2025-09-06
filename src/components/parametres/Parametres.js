// src/components/parametres/Parametres.js
import React, { useState, useEffect, useCallback } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  doc,
  setDoc,
  getDoc,
  Timestamp,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  deleteDoc
} from "firebase/firestore";

export default function Parametres() {
  const { user, societeId, role, loading } = useUserRole();

  // --- États pour les paramètres de documents
  const [entete, setEntete] = useState("");
  const [pied, setPied] = useState("");

  // --- États pour cachet avancé
  const [typeCachet, setTypeCachet] = useState("texte");
  const [cachetTexte, setCachetTexte] = useState("Cachet Société");
  const [cachetImage, setCachetImage] = useState(null);
  const [afficherCachet, setAfficherCachet] = useState(true);
  const [tailleCachet, setTailleCachet] = useState(120);
  const [uploadingImage, setUploadingImage] = useState(false);

  // --- États pour les informations de la pharmacie
  const [nomPharmacie, setNomPharmacie] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [rc, setRc] = useState("");
  const [ice, setIce] = useState("");
  const [if_, setIf] = useState("");
  const [cnss, setCnss] = useState("");

  // --- États pour les paramètres de gestion
  const [seuilAlerteGlobal, setSeuilAlerteGlobal] = useState(10);
  const [delaiPeremptionAlerte, setDelaiPeremptionAlerte] = useState(30);
  const [tvaVente, setTvaVente] = useState(20);

  // --- États pour les paramètres multi-lots
  const [gestionMultiLots, setGestionMultiLots] = useState(true);
  const [alerteLotsExpires, setAlerteLotsExpires] = useState(true);
  const [delaiAlerteLots, setDelaiAlerteLots] = useState(7);
  const [generationAutomatiqueLots, setGenerationAutomatiqueLots] = useState(true);
  const [formatNumerotationLots, setFormatNumerotationLots] = useState("LOT{YYYY}{MM}{DD}{HH}{mm}");

  // --- États pour les activités utilisateurs
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [activites, setActivites] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showActivitesFilters, setShowActivitesFilters] = useState(false);

  // --- États pour sauvegarde/restauration
  const [backupProgress, setBackupProgress] = useState(0);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [backupData, setBackupData] = useState(null);
  const [backupPreview, setBackupPreview] = useState(null);
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupStats, setBackupStats] = useState(null);

  // --- États UI
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("documents");
  const [waiting, setWaiting] = useState(true);
  const [loadingActivites, setLoadingActivites] = useState(false);
  const [notification, setNotification] = useState(null);

  // --- États responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // ====== Utils & Helpers ======

  // Rôles autorisés (laisse passer "pharmacien", "admin", "ADMIN" et garde "docteur" si votre schéma l'utilise)
  const isRoleAutorise = (r) => ["pharmacien", "admin", "ADMIN", "docteur"].includes((r || "").toLowerCase());

  // Hook: détecter la taille d'écran
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

  // Notifications
  const showNotification = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Attente chargement
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // Upload image (cachet)
  const handleImageUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      showNotification("Veuillez sélectionner un fichier image valide (JPEG, PNG, GIF, WebP)", "error");
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      showNotification(`L'image est trop volumineuse (${fileSizeMB}MB). Max 5MB.`, "error");
      return;
    }

    setUploadingImage(true);
    setError("");

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Erreur lors de la lecture du fichier"));
        reader.readAsDataURL(file);
      });

      const img = new Image();
      img.onload = () => {
        setCachetImage(base64);
        setTypeCachet("image");
        showNotification("Image du cachet uploadée avec succès!", "success");
        setUploadingImage(false);
      };
      img.onerror = () => {
        showNotification("Le fichier sélectionné n'est pas une image valide", "error");
        setUploadingImage(false);
      };
      img.src = base64;
    } catch (err) {
      console.error("Erreur upload image:", err);
      showNotification("Erreur lors du téléchargement: " + err.message, "error");
      setUploadingImage(false);
    }
  }, [showNotification]);

  const handleRemoveImage = useCallback(() => {
    setCachetImage(null);
    setTypeCachet("texte");
    setError("");
    const fileInput = document.getElementById("cachet-upload");
    if (fileInput) fileInput.value = "";
    showNotification("Image du cachet supprimée", "info");
  }, [showNotification]);

  // ====== Fonctions de sauvegarde/restauration ======

  // Convertir un timestamp Firestore en objet sérialisable
  const serializeTimestamp = (value) => {
    if (value && typeof value.seconds === 'number') {
      return {
        _firebaseTimestamp: true,
        seconds: value.seconds,
        nanoseconds: value.nanoseconds || 0
      };
    }
    if (value instanceof Date) {
      return {
        _firebaseTimestamp: true,
        seconds: Math.floor(value.getTime() / 1000),
        nanoseconds: (value.getTime() % 1000) * 1000000
      };
    }
    return value;
  };

  // Restaurer un timestamp Firestore depuis un objet sérialisé
  const deserializeTimestamp = (value) => {
    if (value && value._firebaseTimestamp) {
      return Timestamp.fromMillis(value.seconds * 1000 + Math.floor(value.nanoseconds / 1000000));
    }
    return value;
  };

  // Sérialiser récursivement un objet
  const deepSerialize = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepSerialize);
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'id') continue; // On gère l'id séparément
      result[key] = deepSerialize(serializeTimestamp(value));
    }
    return result;
  };

  // Désérialiser récursivement un objet
  const deepDeserialize = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepDeserialize);
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepDeserialize(deserializeTimestamp(value));
    }
    return result;
  };

  // Créer une sauvegarde complète
  const createBackup = useCallback(async () => {
    if (!user || !societeId) return;

    setCreatingBackup(true);
    setBackupProgress(0);

    try {
      const backupData = {
        metadata: {
          societeId,
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
          version: "1.0",
          type: "emergency-restore-compatible"
        },
        data: {},
        statistics: {
          totalDocuments: 0,
          collectionsCount: 0
        }
      };

      const collections = [
        'produits', 'ventes', 'achats', 'stock_entries', 'fournisseurs', 
        'clients', 'paiements', 'activities', 'parametres'
      ];

      let totalDocuments = 0;
      let processedCollections = 0;

      // Sauvegarder les informations de la société
      setBackupProgress(5);
      try {
        const societeDoc = await getDoc(doc(db, "societe", societeId));
        if (societeDoc.exists()) {
          backupData.data.societeInfo = [{
            id: societeId,
            ...deepSerialize(societeDoc.data())
          }];
          totalDocuments += 1;
        }
      } catch (error) {
        console.warn("Erreur sauvegarde info société:", error);
      }

      // Sauvegarder les utilisateurs
      setBackupProgress(10);
      try {
        const usersQuery = query(collection(db, "users"), where("societeId", "==", societeId));
        const usersSnapshot = await getDocs(usersQuery);
        backupData.data.users = [];
        usersSnapshot.forEach(doc => {
          backupData.data.users.push({
            id: doc.id,
            ...deepSerialize(doc.data())
          });
          totalDocuments++;
        });
      } catch (error) {
        console.warn("Erreur sauvegarde utilisateurs:", error);
        backupData.data.users = [];
      }

      // Sauvegarder chaque collection de la société
      for (const collectionName of collections) {
        try {
          setBackupProgress(20 + (processedCollections / collections.length) * 70);
          
          const collectionRef = collection(db, "societe", societeId, collectionName);
          const snapshot = await getDocs(collectionRef);
          
          backupData.data[collectionName] = [];
          snapshot.forEach(doc => {
            backupData.data[collectionName].push({
              id: doc.id,
              ...deepSerialize(doc.data())
            });
            totalDocuments++;
          });

          if (backupData.data[collectionName].length > 0) {
            processedCollections++;
          }
          
        } catch (error) {
          console.warn(`Erreur sauvegarde ${collectionName}:`, error);
          backupData.data[collectionName] = [];
        }
      }

      backupData.statistics.totalDocuments = totalDocuments;
      backupData.statistics.collectionsCount = Object.keys(backupData.data).length;

      setBackupProgress(100);

      // Télécharger le fichier
      const fileName = `backup-pharma-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`;
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      
      URL.revokeObjectURL(url);

      setBackupStats(backupData.statistics);
      showNotification(`Sauvegarde créée: ${totalDocuments} documents sauvegardés`, "success");

    } catch (error) {
      console.error("Erreur création sauvegarde:", error);
      showNotification("Erreur lors de la création de la sauvegarde: " + error.message, "error");
    } finally {
      setCreatingBackup(false);
      setBackupProgress(0);
    }
  }, [user, societeId, showNotification]);

  // Upload et lecture d'un fichier de sauvegarde
  const handleBackupUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showNotification("Veuillez sélectionner un fichier JSON de sauvegarde", "error");
      return;
    }

    setUploadingBackup(true);

    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Erreur lors de la lecture du fichier"));
        reader.readAsText(file);
      });

      const data = JSON.parse(text);
      
      // Vérifier la structure
      if (!data.metadata || !data.data || !data.statistics) {
        throw new Error("Format de sauvegarde invalide");
      }

      setBackupData(data);
      setBackupPreview({
        fileName: file.name,
        createdAt: data.metadata.createdAt,
        societeId: data.metadata.societeId,
        createdBy: data.metadata.createdBy,
        totalDocuments: data.statistics.totalDocuments,
        collections: Object.keys(data.data).map(key => ({
          name: key,
          count: Array.isArray(data.data[key]) ? data.data[key].length : 0
        }))
      });

      showNotification("Fichier de sauvegarde chargé avec succès", "success");

    } catch (error) {
      console.error("Erreur lecture sauvegarde:", error);
      showNotification("Erreur lors de la lecture du fichier: " + error.message, "error");
    } finally {
      setUploadingBackup(false);
    }
  }, [showNotification]);

  // Restaurer depuis une sauvegarde
  const restoreFromBackup = useCallback(async () => {
    if (!backupData || !user || !societeId) return;

    const confirmation = window.confirm(
      "ATTENTION: Cette opération va remplacer toutes les données existantes par celles de la sauvegarde. Cette action est irréversible. Voulez-vous continuer ?"
    );

    if (!confirmation) return;

    setRestoring(true);
    setRestoreProgress(0);

    try {
      let processedDocs = 0;
      const totalDocs = backupData.statistics.totalDocuments;

      // Restaurer par lots de 500 documents (limite Firestore)
      const batchSize = 500;
      const batch = writeBatch(db);
      let batchCount = 0;

      const commitBatch = async () => {
        if (batchCount > 0) {
          await batch.commit();
          batchCount = 0;
        }
      };

      // Restaurer chaque collection
      for (const [collectionName, documents] of Object.entries(backupData.data)) {
        if (!Array.isArray(documents)) continue;

        console.log(`Restauration ${collectionName}: ${documents.length} documents`);

        for (const docData of documents) {
          if (!docData.id) continue;

          const deserializedData = deepDeserialize({ ...docData });
          delete deserializedData.id;

          let docRef;
          
          // Définir le chemin selon le type de collection
          if (collectionName === 'users') {
            docRef = doc(db, 'users', docData.id);
          } else if (collectionName === 'societeInfo') {
            docRef = doc(db, 'societe', docData.id);
          } else {
            docRef = doc(db, 'societe', societeId, collectionName, docData.id);
          }

          batch.set(docRef, deserializedData);
          batchCount++;
          processedDocs++;

          // Commit par lots
          if (batchCount >= batchSize) {
            await commitBatch();
            setRestoreProgress((processedDocs / totalDocs) * 100);
          }
        }
      }

      // Commit final
      await commitBatch();
      setRestoreProgress(100);

      // Rafraîchir les données après restauration
      window.location.reload();

      showNotification("Restauration terminée avec succès!", "success");

    } catch (error) {
      console.error("Erreur restauration:", error);
      showNotification("Erreur lors de la restauration: " + error.message, "error");
    } finally {
      setRestoring(false);
      setRestoreProgress(0);
    }
  }, [backupData, user, societeId, showNotification]);

  // Supprimer la prévisualisation
  const clearBackupPreview = useCallback(() => {
    setBackupData(null);
    setBackupPreview(null);
    const fileInput = document.getElementById('backup-upload');
    if (fileInput) fileInput.value = '';
  }, []);

  // Libellé type activité
  const getActivityTypeLabel = useCallback((type) => {
    const labels = {
      vente: "Vente",
      achat: "Achat",
      paiement: "Paiement",
      stock_ajout: "Ajout Stock",
      stock_modif: "Modification Stock",
      stock_retour: "Retour Stock",
      facture: "Facture",
      devis: "Devis",
      stock_entry: "Entrée Stock Multi-Lots",
      lot_creation: "Création Lot",
      lot_modification: "Modification Lot"
    };
    return labels[type] || type;
  }, []);

  // Détails activité
  const formatActivityDetails = useCallback((type, details) => {
    switch (type) {
      case "vente":
        return `Client: ${details.client || "N/A"}${
          details.hasLots ? ` (${details.nombreLots || 0} lots)` : ""
        }`;
      case "achat":
        return `Fournisseur: ${details.fournisseur || "N/A"}${
          details.hasLots ? ` (${details.nombreLots || 0} lots)` : ""
        }`;
      case "paiement":
        return `${details.mode || "Espèces"} - ${details.type || ""}`;
      case "stock_ajout":
      case "stock_modif":
        return `Produit: ${details.produit || "N/A"}${
          details.numeroLot ? ` (Lot: ${details.numeroLot})` : ""
        }`;
      case "stock_retour":
        return `Produit: ${details.produit || "N/A"} - Motif: ${details.motif || "N/A"}${
          details.numeroLot ? ` (Lot: ${details.numeroLot})` : ""
        }`;
      case "stock_entry":
        return `Produit: ${details.produit || "N/A"} - Lot: ${details.numeroLot || "N/A"}`;
      case "lot_creation":
      case "lot_modification":
        return `Produit: ${details.produit || "N/A"} - Lot: ${details.numeroLot || "N/A"} - Fournisseur: ${
          details.fournisseur || "N/A"
        }`;
      default:
        return (
          Object.entries(details)
            .filter(([key]) => key !== "montant" && key !== "action")
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ") || "N/A"
        );
    }
  }, []);

  // ====== Fetchers (mémorisés pour éviter les warnings deps) ======

  const fetchStockEntries = useCallback(async () => {
    if (!societeId) {
      setStockEntries([]);
      return;
    }
    try {
      const snapshot = await getDocs(collection(db, "societe", societeId, "stock_entries"));
      const entries = [];
      snapshot.forEach((d) => entries.push({ id: d.id, ...d.data() }));
      entries.sort((a, b) => {
        if (a.nom !== b.nom) return (a.nom || "").localeCompare(b.nom || "");
        return new Date(a.datePeremption) - new Date(b.datePeremption);
      });
      setStockEntries(entries);
    } catch (err) {
      console.error("Erreur chargement stock entries:", err);
      showNotification("Erreur lors du chargement du stock multi-lots", "error");
    }
  }, [societeId, showNotification]);

  const fetchUtilisateurs = useCallback(async () => {
    if (!societeId) return;
    try {
      const qUsers = query(collection(db, "users"), where("societeId", "==", societeId));
      const snapshot = await getDocs(qUsers);
      const usersList = [];
      snapshot.forEach((d) => {
        const userData = d.data();
        usersList.push({
          id: d.id,
          email: userData.email,
          role: userData.role || "vendeuse",
          createdAt: userData.createdAt,
          nom: userData.nom || "",
          prenom: userData.prenom || ""
        });
      });
      setUtilisateurs(usersList);
    } catch (err) {
      console.error("Erreur chargement utilisateurs:", err);
      showNotification("Erreur lors du chargement des utilisateurs", "error");
    }
  }, [societeId, showNotification]);

  const fetchActivites = useCallback(async () => {
    if (!societeId) return;
    setLoadingActivites(true);
    try {
      const activitesList = [];

      // 1) Collection "activities" (si existante)
      try {
        const activitiesSnap = await getDocs(
          query(
            collection(db, "societe", societeId, "activities"),
            orderBy("timestamp", "desc"),
            limit(100)
          )
        );
        if (!activitiesSnap.empty) {
          activitiesSnap.forEach((d) => {
            const data = d.data();
            const details = data.details || {};
            activitesList.push({
              id: d.id,
              type: getActivityTypeLabel(data.type),
              utilisateurId: data.userId || data.utilisateurId || user?.uid,
              utilisateurEmail: data.userEmail || data.utilisateurEmail || "",
              date: data.timestamp || data.date || Timestamp.now(),
              details: formatActivityDetails(data.type, details),
              montant: details.montant || 0,
              nombreArticles: details.articles || 0,
              statut: details.statutPaiement || details.action || "Effectué",
              action: details.action || "",
              collection: "activities",
              isFromActivities: true,
              hasLots: !!details.hasLots,
              nombreLots: details.nombreLots || 0,
              fournisseurPrincipal: details.fournisseur || details.fournisseurPrincipal || ""
            });
          });
        }
      } catch (e) {
        // Si pas d'index/orderBy dispo ou collection absente, on ignore sans casser
      }

      // 2) Ventes (compatibilité)
      try {
        const ventesSnap = await getDocs(
          query(collection(db, "societe", societeId, "ventes"), orderBy("timestamp", "desc"), limit(50))
        );
        ventesSnap.forEach((d) => {
          const data = d.data();
          const total = (data.articles || []).reduce(
            (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
            0
          );
          const dateField = data.timestamp || data.date || data.creeLe || data.createdAt;
          const hasLots = (data.articles || []).some((a) => a.numeroLot);
          const nombreLots = new Set((data.articles || []).map((a) => a.numeroLot).filter(Boolean)).size;

          activitesList.push({
            id: d.id,
            type: "Vente" + (hasLots ? " Multi-Lots" : ""),
            utilisateurId: data.creePar || data.userId || data.createdBy || user?.uid,
            utilisateurEmail: data.creeParEmail || data.userEmail || user?.email || "",
            date: dateField || Timestamp.now(),
            details: `Client: ${data.client || "N/A"}${hasLots ? ` (${nombreLots} lots)` : ""}`,
            montant: total,
            nombreArticles: (data.articles || []).length,
            statut: data.statutPaiement || "N/A",
            action: data.modifieLe ? "modification" : "création",
            collection: "ventes",
            hasLots,
            nombreLots
          });
        });
      } catch (e) {
        // ignore
      }

      // 3) Achats (compatibilité)
      try {
        const achatsSnap = await getDocs(
          query(collection(db, "societe", societeId, "achats"), orderBy("timestamp", "desc"), limit(50))
        );
        achatsSnap.forEach((d) => {
          const data = d.data();
          const total =
            (data.articles || []).reduce(
              (sum, a) => sum + ((a.prixAchat || a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
              0
            ) - (data.remiseGlobale || 0);
          const dateField = data.timestamp || data.date || data.creeLe || data.createdAt;
          const hasLots = (data.articles || []).some((a) => a.numeroLot || a.fournisseurArticle);
          const nombreLots = new Set((data.articles || []).map((a) => a.numeroLot).filter(Boolean)).size;

          activitesList.push({
            id: d.id,
            type: "Achat" + (hasLots ? " Multi-Lots" : ""),
            utilisateurId: data.creePar || data.userId || data.createdBy || user?.uid,
            utilisateurEmail: data.creeParEmail || data.userEmail || user?.email || "",
            date: dateField || Timestamp.now(),
            details: `Fournisseur: ${data.fournisseur || "N/A"}${hasLots ? ` (${nombreLots} lots)` : ""}`,
            montant: total,
            nombreArticles: (data.articles || []).length,
            statut: data.statutPaiement || "N/A",
            action: data.modifieLe ? "modification" : "création",
            collection: "achats",
            hasLots,
            nombreLots,
            fournisseurPrincipal: data.fournisseur
          });
        });
      } catch (e) {
        // ignore
      }

      // 4) Paiements (compatibilité)
      try {
        const paiementsSnap = await getDocs(
          query(collection(db, "societe", societeId, "paiements"), orderBy("date", "desc"), limit(50))
        );
        paiementsSnap.forEach((d) => {
          const data = d.data();
          const dateField = data.date || data.timestamp || data.createdAt;
          activitesList.push({
            id: d.id,
            type: "Paiement",
            utilisateurId: data.creePar || data.userId || data.createdBy || user?.uid,
            utilisateurEmail: data.creeParEmail || data.userEmail || user?.email || "",
            date: dateField || Timestamp.now(),
            details: `Type: ${data.type || "N/A"} - Mode: ${data.mode || "N/A"}`,
            montant: data.montant || 0,
            statut: "Enregistré",
            collection: "paiements"
          });
        });
      } catch (e) {
        // ignore
      }

      // Tri & dédoublonnage
      activitesList.sort((a, b) => {
        const dateA = a.date?.seconds || a.date?.getTime?.() / 1000 || 0;
        const dateB = b.date?.seconds || b.date?.getTime?.() / 1000 || 0;
        return dateB - dateA;
      });

      const dedup = [];
      const seen = new Set();
      activitesList.forEach((a) => {
        const key = `${a.type}-${a.montant}-${a.details}`;
        if (!seen.has(key) || a.isFromActivities) {
          dedup.push(a);
          seen.add(key);
        }
      });

      setActivites(dedup);
    } catch (err) {
      console.error("Erreur chargement activités:", err);
      showNotification("Erreur lors du chargement des activités", "error");
    } finally {
      setLoadingActivites(false);
    }
  }, [societeId, user, getActivityTypeLabel, formatActivityDetails, showNotification]);

  // ====== Chargement initial des paramètres ======
  useEffect(() => {
    if (!user || !societeId) return;

    let mounted = true;
    (async () => {
      try {
        // Documents
        const docRef = doc(db, "societe", societeId, "parametres", "documents");
        const docSnap = await getDoc(docRef);
        if (mounted && docSnap.exists()) {
          const data = docSnap.data();
          setEntete(data.entete || "");
          setPied(data.pied || "");
          setCachetTexte(data.cachetTexte || "Cachet Société");
          const imageData = data.cachetImage || data.cachet || null;
          setCachetImage(imageData);
          setAfficherCachet(data.afficherCachet !== false);
          setTypeCachet(data.typeCachet || (imageData ? "image" : "texte"));
          setTailleCachet(Number(data.tailleCachet) || 120);
        }

        // Informations
        const infoRef = doc(db, "societe", societeId, "parametres", "informations");
        const infoSnap = await getDoc(infoRef);
        if (mounted && infoSnap.exists()) {
          const data = infoSnap.data();
          setNomPharmacie(data.nomPharmacie || "");
          setAdresse(data.adresse || "");
          setTelephone(data.telephone || "");
          setEmail(data.email || "");
          setRc(data.rc || "");
          setIce(data.ice || "");
          setIf(data.if || "");
          setCnss(data.cnss || "");
        }

        // Gestion
        const gestionRef = doc(db, "societe", societeId, "parametres", "gestion");
        const gestionSnap = await getDoc(gestionRef);
        if (mounted && gestionSnap.exists()) {
          const data = gestionSnap.data();
          setSeuilAlerteGlobal(data.seuilAlerteGlobal ?? 10);
          setDelaiPeremptionAlerte(data.delaiPeremptionAlerte ?? 30);
          setTvaVente(data.tvaVente ?? 20);
        }

        // Multi-lots
        const multiLotsRef = doc(db, "societe", societeId, "parametres", "multilots");
        const multiLotsSnap = await getDoc(multiLotsRef);
        if (mounted && multiLotsSnap.exists()) {
          const data = multiLotsSnap.data();
          setGestionMultiLots(data.gestionMultiLots !== false);
          setAlerteLotsExpires(data.alerteLotsExpires !== false);
          setDelaiAlerteLots(data.delaiAlerteLots ?? 7);
          setGenerationAutomatiqueLots(data.generationAutomatiqueLots !== false);
          setFormatNumerotationLots(data.formatNumerotationLots || "LOT{YYYY}{MM}{DD}{HH}{mm}");
        }

        // Users + Stock entries
        await fetchUtilisateurs();
        await fetchStockEntries();
      } catch (err) {
        console.error("Erreur chargement paramètres:", err);
        showNotification("Erreur lors du chargement des paramètres: " + err.message, "error");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user, societeId, fetchUtilisateurs, fetchStockEntries, showNotification]);

  // Charger les activités lorsqu'on bascule sur l'onglet
  useEffect(() => {
    if (activeTab === "activites" && utilisateurs.length >= 0) {
      // on peut afficher même si 0 utilisateur (traçabilité ancienne)
      fetchActivites();
    }
  }, [activeTab, utilisateurs, fetchActivites]);

  // ====== Sauvegardes ======

  const handleSaveDocuments = useCallback(
    async (e) => {
      e.preventDefault();
      if (!user || !societeId) return;

      setSaving(true);
      setError("");

      try {
        if (typeCachet === "image" && !cachetImage) {
          showNotification("Veuillez télécharger une image pour le cachet ou choisir le mode texte", "error");
          setSaving(false);
          return;
        }
        if (typeCachet === "texte" && !cachetTexte.trim()) {
          showNotification("Veuillez saisir un texte pour le cachet", "error");
          setSaving(false);
          return;
        }

        const dataToSave = {
          entete: entete.trim(),
          pied: pied.trim(),
          cachetTexte: cachetTexte.trim(),
          cachetImage: cachetImage || null,
          afficherCachet: !!afficherCachet,
          typeCachet,
          tailleCachet: Number(tailleCachet) || 120,
          // compat
          cachet: cachetImage || null,
          // meta
          modifiePar: user.uid,
          modifieParEmail: user.email || "",
          modifieLe: Timestamp.now(),
          version: "2.0"
        };

        await setDoc(doc(db, "societe", societeId, "parametres", "documents"), dataToSave);
        showNotification("Paramètres documents sauvegardés avec succès!", "success");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        console.error("Erreur sauvegarde documents:", err);
        showNotification("Erreur lors de la sauvegarde: " + err.message, "error");
      } finally {
        setSaving(false);
      }
    },
    [user, societeId, typeCachet, cachetImage, cachetTexte, entete, pied, afficherCachet, tailleCachet, showNotification]
  );

  const handleSaveInformations = useCallback(
    async (e) => {
      e.preventDefault();
      if (!user || !societeId) return;
      setSaving(true);
      try {
        await setDoc(doc(db, "societe", societeId, "parametres", "informations"), {
          nomPharmacie: nomPharmacie.trim(),
          adresse: adresse.trim(),
          telephone: telephone.trim(),
          email: email.trim(),
          rc: rc.trim(),
          ice: ice.trim(),
          if: if_.trim(),
          cnss: cnss.trim(),
          modifiePar: user.uid,
          modifieParEmail: user.email || "",
          modifieLe: Timestamp.now()
        });
        showNotification("Informations pharmacie sauvegardées avec succès!", "success");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        console.error("Erreur sauvegarde informations:", err);
        showNotification("Erreur lors de la sauvegarde: " + err.message, "error");
      } finally {
        setSaving(false);
      }
    },
    [user, societeId, nomPharmacie, adresse, telephone, email, rc, ice, if_, cnss, showNotification]
  );

  const handleSaveGestion = useCallback(
    async (e) => {
      e.preventDefault();
      if (!user || !societeId) return;
      setSaving(true);
      try {
        await setDoc(doc(db, "societe", societeId, "parametres", "gestion"), {
          seuilAlerteGlobal: Number(seuilAlerteGlobal),
          delaiPeremptionAlerte: Number(delaiPeremptionAlerte),
          tvaVente: Number(tvaVente),
          modifiePar: user.uid,
          modifieParEmail: user.email || "",
          modifieLe: Timestamp.now()
        });
        showNotification("Paramètres de gestion sauvegardés avec succès!", "success");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        console.error("Erreur sauvegarde gestion:", err);
        showNotification("Erreur lors de la sauvegarde: " + err.message, "error");
      } finally {
        setSaving(false);
      }
    },
    [user, societeId, seuilAlerteGlobal, delaiPeremptionAlerte, tvaVente, showNotification]
  );

  const handleSaveMultiLots = useCallback(
    async (e) => {
      e.preventDefault();
      if (!user || !societeId) return;
      setSaving(true);
      try {
        await setDoc(doc(db, "societe", societeId, "parametres", "multilots"), {
          gestionMultiLots: !!gestionMultiLots,
          alerteLotsExpires: !!alerteLotsExpires,
          delaiAlerteLots: Number(delaiAlerteLots),
          generationAutomatiqueLots: !!generationAutomatiqueLots,
          formatNumerotationLots,
          modifiePar: user.uid,
          modifieParEmail: user.email || "",
          modifieLe: Timestamp.now()
        });
        showNotification("Paramètres multi-lots sauvegardés avec succès!", "success");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        console.error("Erreur sauvegarde multi-lots:", err);
        showNotification("Erreur lors de la sauvegarde: " + err.message, "error");
      } finally {
        setSaving(false);
      }
    },
    [
      user,
      societeId,
      gestionMultiLots,
      alerteLotsExpires,
      delaiAlerteLots,
      generationAutomatiqueLots,
      formatNumerotationLots,
      showNotification
    ]
  );

  // ====== Filtres / Stats / Divers ======

  const activitesFiltrees = activites.filter((activite) => {
    let keep = true;
    if (selectedUserId && activite.utilisateurId !== selectedUserId) keep = false;
    if (filterType && !activite.type.toLowerCase().includes(filterType.toLowerCase())) keep = false;

    if (filterDateMin) {
      const actDate = activite.date?.seconds
        ? new Date(activite.date.seconds * 1000)
        : activite.date?.toDate?.()
        ? activite.date.toDate()
        : null;
      if (!actDate || actDate < new Date(filterDateMin)) keep = false;
    }
    if (filterDateMax) {
      const actDate = activite.date?.seconds
        ? new Date(activite.date.seconds * 1000)
        : activite.date?.toDate?.()
        ? activite.date.toDate()
        : null;
      if (!actDate || actDate > new Date(filterDateMax + "T23:59:59")) keep = false;
    }
    return keep;
  });

  const getUserName = useCallback(
    (userId, userEmail = "") => {
      const u = utilisateurs.find((x) => x.id === userId);
      if (u) {
        if (u.nom && u.prenom) return `${u.prenom} ${u.nom}`;
        return u.email;
      }
      if (userEmail) return userEmail.split("@")[0];
      if (userId === user?.uid) return `${user?.email || "Vous"} (Vous)`;
      return "Utilisateur inconnu";
    },
    [utilisateurs, user]
  );

  const getUserRole = useCallback(
    (userId) => {
      const u = utilisateurs.find((x) => x.id === userId);
      if (u) return u.role;
      if (userId === user?.uid) return role || "N/A";
      return "N/A";
    },
    [utilisateurs, user, role]
  );

  const getTypeColor = useCallback((type) => {
    if ((type || "").includes("Multi-Lots")) return "#667eea";
    switch ((type || "").split(" ")[0]) {
      case "Vente":
        return "#48bb78";
      case "Achat":
        return "#4299e1";
      case "Stock":
        return "#ed8936";
      case "Retour":
        return "#f56565";
      case "Paiement":
        return "#38a169";
      case "Entrée":
        return "#805ad5";
      case "Lot":
        return "#d69e2e";
      default:
        return "#6b7280";
    }
  }, []);

  const getStatistiquesUtilisateur = useCallback(
    (userId) => {
      const activitesUser = activites.filter((a) => a.utilisateurId === userId);
      const ventes = activitesUser.filter((a) => a.type.includes("Vente"));
      const achats = activitesUser.filter((a) => a.type.includes("Achat"));
      const activitesMultiLots = activitesUser.filter((a) => a.hasLots || a.type.includes("Multi-Lots"));
      return {
        totalActivites: activitesUser.length,
        totalVentes: ventes.length,
        montantVentes: ventes.reduce((sum, v) => sum + (v.montant || 0), 0),
        totalAchats: achats.length,
        montantAchats: achats.reduce((sum, a) => sum + (a.montant || 0), 0),
        activitesMultiLots: activitesMultiLots.length,
        totalLots: activitesMultiLots.reduce((sum, a) => sum + (a.nombreLots || 0), 0),
        derniereActivite: activitesUser[0]?.date
      };
    },
    [activites]
  );

  const enableUserTracking = useCallback(async () => {
    if (!societeId || !user) return;
    try {
      const trackingRef = doc(db, "societe", societeId, "parametres", "tracking");
      await setDoc(trackingRef, {
        userTracking: true,
        enabledBy: user.uid,
        enabledAt: Timestamp.now()
      });
      showNotification(
        "Traçabilité activée ! Les nouvelles opérations seront correctement associées aux utilisateurs.",
        "success"
      );
    } catch (err) {
      console.error("Erreur activation traçabilité:", err);
      showNotification("Erreur lors de l'activation de la traçabilité", "error");
    }
  }, [societeId, user, showNotification]);

  const formatDate = useCallback((date) => {
    if (!date) return "Date inconnue";
    let dateObj;
    if (date.seconds) dateObj = new Date(date.seconds * 1000);
    else if (date.toDate && typeof date.toDate === "function") dateObj = date.toDate();
    else if (date instanceof Date) dateObj = date;
    else if (typeof date === "string") dateObj = new Date(date);
    else if (typeof date === "number") dateObj = new Date(date);
    else return "Date invalide";
    if (isNaN(dateObj.getTime())) return "Date invalide";
    const options = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false };
    return dateObj.toLocaleString("fr-FR", options);
  }, []);

  // ====== Styles ======
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
      maxWidth: isMobile ? "100%" : isTablet ? "95%" : activeTab === "activites" ? "1500px" : "1200px"
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
    tab: {
      background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
      border: "none",
      borderRadius: "15px 15px 0 0",
      padding: isMobile ? "12px 16px" : "16px 24px",
      color: "white",
      fontWeight: 700,
      fontSize: isMobile ? "0.8em" : "0.9em",
      cursor: "pointer",
      marginRight: "8px",
      marginBottom: "-2px",
      transition: "all 0.3s ease"
    },
    activeTab: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      transform: "translateY(-2px)",
      boxShadow: "0 8px 25px rgba(102, 126, 234, 0.4)"
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
      maxWidth: isMobile ? "calc(100vw - 30px)" : "auto",
      animation: "slideIn 0.3s ease"
    },
    input: {
      width: "100%",
      padding: "12px 15px",
      border: "2px solid #e2e8f0",
      borderRadius: "8px",
      fontSize: "0.9em",
      fontWeight: 600,
      background: "white",
      transition: "border-color 0.3s ease"
    },
    label: {
      display: "block",
      fontWeight: 700,
      marginBottom: "8px",
      color: "#4a5568",
      fontSize: "0.9em",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    progressBar: {
      width: "100%",
      height: "8px",
      background: "#e2e8f0",
      borderRadius: "4px",
      overflow: "hidden",
      marginTop: "10px"
    },
    progressFill: (progress) => ({
      height: "100%",
      background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
      width: `${progress}%`,
      transition: "width 0.3s ease"
    })
  });
  const styles = getResponsiveStyles();

  const animationStyle = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;

  // ====== Guards ======
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
        Chargement des paramètres...
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
        Non connecté.
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
        Aucune société sélectionnée.
      </div>
    );
  }

  if (!isRoleAutorise(role)) {
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
        Accès refusé. Seul le pharmacien (ou admin) peut accéder aux paramètres.
      </div>
    );
  }

  // ====== Render ======
  return (
    <>
      <style>{animationStyle}</style>
      <div style={styles.container}>
        <div style={styles.mainCard}>
          <div style={styles.header}>
            <h1 style={styles.title}>Paramètres Pharmacie</h1>
            <p style={styles.subtitle}>Configuration complète avec gestion avancée des lots et sauvegarde</p>
            {gestionMultiLots && !isMobile && (
              <div
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  padding: "6px 12px",
                  background: "rgba(102, 126, 234, 0.2)",
                  borderRadius: "15px",
                  fontSize: "0.8em",
                  fontWeight: 600,
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(102, 126, 234, 0.3)",
                  color: "#667eea"
                }}
              >
                Multi-Lots Activé
              </div>
            )}
          </div>

          <div style={styles.content}>
            {/* Bandeau résumé */}
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
                <strong>Paramètres Multi-Lots</strong> - Configuration avancée avec sauvegarde/restauration
              </p>
              <p style={{ color: "#4a5568", fontSize: "0.8em", margin: 0 }}>
                {stockEntries.length} entrées de stock • {utilisateurs.length} utilisateurs • {activites.length} activités
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

            {/* Onglets */}
            <div
              style={{
                display: "flex",
                gap: isMobile ? 5 : 10,
                marginBottom: "20px",
                borderBottom: "3px solid #667eea",
                paddingBottom: "10px",
                flexWrap: "wrap",
                justifyContent: isMobile ? "center" : "flex-start"
              }}
            >
              {[
                ["documents", "Documents"],
                ["informations", "Informations"],
                ["gestion", "Gestion"],
                ["multilots", "Multi-Lots"],
                ["activites", "Activités"],
               
              ].map(([key, label]) => (
                <button
                  key={key}
                  style={{ ...styles.tab, ...(activeTab === key ? styles.activeTab : {}) }}
                  onClick={() => setActiveTab(key)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Contenu */}
            <div style={styles.formCard}>
              {/* Documents */}
              {activeTab === "documents" && (
                <form onSubmit={handleSaveDocuments}>
                  <h3
                    style={{
                      color: "#2d3748",
                      fontSize: isMobile ? "1.3em" : "1.6em",
                      fontWeight: 800,
                      marginBottom: isMobile ? "20px" : "30px",
                      textAlign: "center"
                    }}
                  >
                    Personnalisation des Documents
                  </h3>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={styles.label}>Entête des documents (factures, devis, bons)</label>
                    <textarea
                      style={{ ...styles.input, minHeight: "100px", resize: "vertical", fontFamily: "monospace" }}
                      rows={4}
                      value={entete}
                      onChange={(e) => setEntete(e.target.value)}
                      placeholder={
                        "Ex : PHARMACIE CENTRALE\n123, Avenue Mohammed V\nCasablanca - Maroc\nTél: 05 22 XX XX XX"
                      }
                      disabled={saving}
                    />
                    <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                      Cet entête apparaîtra sur tous vos documents imprimés
                    </small>
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={styles.label}>Pied de page des documents</label>
                    <textarea
                      style={{ ...styles.input, minHeight: "80px", resize: "vertical", fontFamily: "monospace" }}
                      rows={3}
                      value={pied}
                      onChange={(e) => setPied(e.target.value)}
                      placeholder={"Ex : Merci pour votre confiance !\nHoraires : Lun-Sam 8h-20h"}
                      disabled={saving}
                    />
                    <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                      Ce pied de page apparaîtra en bas de tous vos documents
                    </small>
                  </div>

                  {/* Cachet */}
                  <div
                    style={{
                      background: "linear-gradient(135deg, #667eea20 0%, #764ba220 100%)",
                      borderRadius: "12px",
                      padding: "25px",
                      marginTop: "25px",
                      border: "2px solid #667eea30"
                    }}
                  >
                    <h4 style={{ color: "#667eea", marginBottom: "20px", fontSize: "1.2em", fontWeight: 700 }}>
                      Configuration du Cachet
                    </h4>

                    <div style={{ marginBottom: "20px" }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          cursor: "pointer",
                          fontSize: "1em",
                          fontWeight: 600
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={afficherCachet}
                          onChange={(e) => setAfficherCachet(e.target.checked)}
                          disabled={saving}
                          style={{ transform: "scale(1.2)" }}
                        />
                        <span style={{ color: "#2d3748" }}>Afficher le cachet sur les documents imprimés</span>
                      </label>
                    </div>

                    {afficherCachet && (
                      <>
                        <div style={{ marginBottom: "20px" }}>
                          <label style={styles.label}>Type de cachet</label>
                          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                cursor: "pointer",
                                padding: "10px 15px",
                                borderRadius: "8px",
                                border: typeCachet === "texte" ? "2px solid #667eea" : "1px solid #e2e8f0",
                                background: typeCachet === "texte" ? "#667eea10" : "white"
                              }}
                            >
                              <input
                                type="radio"
                                name="typeCachet"
                                value="texte"
                                checked={typeCachet === "texte"}
                                onChange={(e) => setTypeCachet(e.target.value)}
                                disabled={saving}
                              />
                              <span style={{ color: "#2d3748", fontWeight: 500 }}>Cachet texte</span>
                            </label>

                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                cursor: "pointer",
                                padding: "10px 15px",
                                borderRadius: "8px",
                                border: typeCachet === "image" ? "2px solid #667eea" : "1px solid #e2e8f0",
                                background: typeCachet === "image" ? "#667eea10" : "white"
                              }}
                            >
                              <input
                                type="radio"
                                name="typeCachet"
                                value="image"
                                checked={typeCachet === "image"}
                                onChange={(e) => setTypeCachet(e.target.value)}
                                disabled={saving}
                              />
                              <span style={{ color: "#2d3748", fontWeight: 500 }}>Cachet image</span>
                            </label>
                          </div>
                        </div>

                        {/* Cachet Texte */}
                        {typeCachet === "texte" && (
                          <div style={{ marginBottom: "20px" }}>
                            <label style={styles.label}>Texte du cachet</label>
                            <input
                              type="text"
                              style={styles.input}
                              value={cachetTexte}
                              onChange={(e) => setCachetTexte(e.target.value)}
                              placeholder="Ex: Cachet Société, Pharmacie Centrale..."
                              disabled={saving}
                              required
                            />
                            <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                              Ce texte apparaîtra dans un cachet circulaire
                            </small>
                          </div>
                        )}

                        {/* Cachet Image */}
                        {typeCachet === "image" && (
                          <div style={{ marginBottom: "20px" }}>
                            <label style={styles.label}>Image du cachet</label>

                            {!cachetImage ? (
                              <div
                                style={{
                                  border: "2px dashed #cbd5e0",
                                  borderRadius: "12px",
                                  padding: "30px",
                                  textAlign: "center",
                                  background: "#f7fafc",
                                  transition: "border-color 0.3s ease"
                                }}
                              >
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleImageUpload}
                                  disabled={saving || uploadingImage}
                                  style={{ display: "none" }}
                                  id="cachet-upload"
                                />
                                <label
                                  htmlFor="cachet-upload"
                                  style={{ cursor: uploadingImage ? "not-allowed" : "pointer", display: "block" }}
                                >
                                  {uploadingImage ? (
                                    <div style={{ color: "#667eea" }}>
                                      <div style={{ fontSize: "32px", marginBottom: "10px" }}>⏳</div>
                                      <div style={{ fontSize: "16px" }}>Téléchargement en cours...</div>
                                    </div>
                                  ) : (
                                    <div style={{ color: "#4a5568" }}>
                                      <div style={{ fontSize: "48px", marginBottom: "15px" }}>📤</div>
                                      <div style={{ fontSize: "16px", marginBottom: "8px" }}>
                                        Cliquez pour télécharger une image
                                      </div>
                                      <div style={{ fontSize: "13px", color: "#6b7280" }}>
                                        PNG, JPG, GIF, WebP (max 5MB)
                                      </div>
                                    </div>
                                  )}
                                </label>
                              </div>
                            ) : (
                              <div
                                style={{
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "12px",
                                  padding: "20px",
                                  background: "white"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
                                  <img
                                    src={cachetImage}
                                    alt="Aperçu du cachet"
                                    style={{
                                      width: "100px",
                                      height: "100px",
                                      objectFit: "contain",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: "8px",
                                      background: "#fff"
                                    }}
                                  />
                                  <div style={{ flex: 1, minWidth: "200px" }}>
                                    <div
                                      style={{
                                        fontWeight: 600,
                                        color: "#48bb78",
                                        marginBottom: "8px",
                                        fontSize: "1em"
                                      }}
                                    >
                                      Image du cachet téléchargée
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.9em",
                                        color: "#4a5568",
                                        marginBottom: "15px",
                                        lineHeight: "1.4"
                                      }}
                                    >
                                      Cette image sera utilisée sur tous vos documents
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleRemoveImage}
                                      disabled={saving}
                                      style={{
                                        ...styles.button,
                                        background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
                                        padding: "8px 16px",
                                        fontSize: "0.8em"
                                      }}
                                    >
                                      Supprimer l'image
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Taille du cachet */}
                        <div style={{ marginBottom: "20px" }}>
                          <label style={styles.label}>Taille du cachet (en pixels)</label>
                          <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                            <input
                              type="range"
                              min={50}
                              max={300}
                              value={tailleCachet}
                              onChange={(e) => setTailleCachet(e.target.value)}
                              disabled={saving}
                              style={{ flex: 1, minWidth: "200px" }}
                            />
                            <input
                              type="number"
                              style={{
                                width: "100px",
                                padding: "8px 12px",
                                border: "2px solid #e2e8f0",
                                borderRadius: "6px",
                                background: "white"
                              }}
                              value={tailleCachet}
                              onChange={(e) => setTailleCachet(e.target.value)}
                              min={50}
                              max={300}
                              disabled={saving}
                            />
                            <span style={{ color: "#6b7280", fontSize: "0.9em" }}>px</span>
                          </div>
                          <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                            Recommandé: 120px pour un équilibre optimal
                          </small>
                        </div>

                        {/* Aperçu cachet */}
                        <div
                          style={{
                            padding: "20px",
                            background: "#fff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "12px",
                            textAlign: "center"
                          }}
                        >
                          <div style={{ marginBottom: "15px", fontWeight: 600, color: "#2d3748", fontSize: "1em" }}>
                            Aperçu du cachet
                          </div>
                          {typeCachet === "image" && cachetImage ? (
                            <img
                              src={cachetImage}
                              alt="Aperçu cachet"
                              style={{
                                width: `${tailleCachet}px`,
                                height: `${tailleCachet}px`,
                                objectFit: "contain",
                                border: "1px solid #e5e7eb",
                                borderRadius: "8px",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                border: "3px solid #667eea",
                                color: "#667eea",
                                borderRadius: "50%",
                                padding: "20px 30px",
                                fontSize: Math.max(12, tailleCachet / 10),
                                fontWeight: "bold",
                                textTransform: "uppercase",
                                width: `${tailleCachet}px`,
                                height: `${tailleCachet}px`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "rgba(102, 126, 234, 0.05)",
                                transform: "rotate(-5deg)",
                                boxShadow: "0 2px 8px rgba(102, 126, 234, 0.2)"
                              }}
                            >
                              {cachetTexte || "Cachet Société"}
                            </div>
                          )}
                        </div>

                        {/* Conseils */}
                        <div
                          style={{
                            marginTop: "20px",
                            padding: "15px",
                            background: "linear-gradient(135deg, #48bb7820 0%, #38a16920 100%)",
                            borderRadius: "8px",
                            border: "1px solid #48bb7840"
                          }}
                        >
                          <div style={{ color: "#48bb78", fontSize: "0.9em", fontWeight: 600, marginBottom: "10px" }}>
                            Conseils pour votre cachet :
                          </div>
                          <ul style={{ color: "#4a5568", fontSize: "0.8em", lineHeight: "1.6", margin: 0, paddingLeft: 20 }}>
                            <li>Format recommandé : PNG avec fond transparent</li>
                            <li>Résolution optimale : 300x300 pixels</li>
                            <li>Le cachet apparaîtra entre les signatures sur les documents</li>
                            <li>Assurez-vous que le texte soit bien lisible</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button
                      type="submit"
                      style={{ ...styles.button, width: isMobile ? "100%" : "auto", minWidth: "250px" }}
                      disabled={saving}
                    >
                      {saving ? "Enregistrement..." : "Enregistrer les paramètres"}
                    </button>
                  </div>
                </form>
              )}

              {/* Informations */}
              {activeTab === "informations" && (
                <form onSubmit={handleSaveInformations}>
                  <h3
                    style={{
                      color: "#2d3748",
                      fontSize: isMobile ? "1.3em" : "1.6em",
                      fontWeight: 800,
                      marginBottom: isMobile ? "20px" : "30px",
                      textAlign: "center"
                    }}
                  >
                    Informations de la Pharmacie
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(250px, 1fr))",
                      gap: "20px"
                    }}
                  >
                    <div>
                      <label style={styles.label}>Nom de la pharmacie</label>
                      <input
                        type="text"
                        style={styles.input}
                        value={nomPharmacie}
                        onChange={(e) => setNomPharmacie(e.target.value)}
                        placeholder="Pharmacie Centrale"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Téléphone</label>
                      <input
                        type="tel"
                        style={styles.input}
                        value={telephone}
                        onChange={(e) => setTelephone(e.target.value)}
                        placeholder="05 22 XX XX XX"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Email</label>
                      <input
                        type="email"
                        style={styles.input}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="contact@pharmacie.ma"
                        disabled={saving}
                      />
                    </div>

                    <div style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
                      <label style={styles.label}>Adresse complète</label>
                      <textarea
                        style={{ ...styles.input, minHeight: "60px", resize: "vertical" }}
                        value={adresse}
                        onChange={(e) => setAdresse(e.target.value)}
                        placeholder="123, Avenue Mohammed V, Casablanca"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>RC (Registre Commerce)</label>
                      <input
                        type="text"
                        style={styles.input}
                        value={rc}
                        onChange={(e) => setRc(e.target.value)}
                        placeholder="123456"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>ICE</label>
                      <input
                        type="text"
                        style={styles.input}
                        value={ice}
                        onChange={(e) => setIce(e.target.value)}
                        placeholder="000000000000000"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>IF (Identifiant Fiscal)</label>
                      <input
                        type="text"
                        style={styles.input}
                        value={if_}
                        onChange={(e) => setIf(e.target.value)}
                        placeholder="12345678"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>CNSS</label>
                      <input
                        type="text"
                        style={styles.input}
                        value={cnss}
                        onChange={(e) => setCnss(e.target.value)}
                        placeholder="1234567"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button
                      type="submit"
                      style={{ ...styles.button, width: isMobile ? "100%" : "auto", minWidth: "200px" }}
                      disabled={saving}
                    >
                      {saving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </form>
              )}

              {/* Gestion */}
              {activeTab === "gestion" && (
                <form onSubmit={handleSaveGestion}>
                  <h3
                    style={{
                      color: "#2d3748",
                      fontSize: isMobile ? "1.3em" : "1.6em",
                      fontWeight: 800,
                      marginBottom: isMobile ? "20px" : "30px",
                      textAlign: "center"
                    }}
                  >
                    Paramètres de Gestion Générale
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))",
                      gap: "25px"
                    }}
                  >
                    <div>
                      <label style={styles.label}>Seuil d'alerte stock global (par défaut)</label>
                      <input
                        type="number"
                        style={styles.input}
                        value={seuilAlerteGlobal}
                        onChange={(e) => setSeuilAlerteGlobal(e.target.value)}
                        min="1"
                        disabled={saving}
                      />
                      <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                        Quantité minimum avant alerte (peut être personnalisé par produit)
                      </small>
                    </div>

                    <div>
                      <label style={styles.label}>Délai d'alerte péremption (jours)</label>
                      <input
                        type="number"
                        style={styles.input}
                        value={delaiPeremptionAlerte}
                        onChange={(e) => setDelaiPeremptionAlerte(e.target.value)}
                        min="1"
                        disabled={saving}
                      />
                      <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                        Nombre de jours avant péremption pour déclencher une alerte
                      </small>
                    </div>

                    <div>
                      <label style={styles.label}>TVA sur les ventes (%)</label>
                      <input
                        type="number"
                        style={styles.input}
                        value={tvaVente}
                        onChange={(e) => setTvaVente(e.target.value)}
                        min="0"
                        max="100"
                        step="0.1"
                        disabled={saving}
                      />
                      <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                        Taux de TVA appliqué sur les ventes (généralement 20% au Maroc)
                      </small>
                    </div>
                  </div>

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button
                      type="submit"
                      style={{ ...styles.button, width: isMobile ? "100%" : "auto", minWidth: "200px" }}
                      disabled={saving}
                    >
                      {saving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: "30px",
                      padding: "20px",
                      background: "linear-gradient(135deg, #4299e120 0%, #3182ce20 100%)",
                      borderRadius: "10px",
                      border: "1px solid #4299e140"
                    }}
                  >
                    <h4 style={{ color: "#4299e1", marginBottom: "10px", fontSize: "1.1em" }}>Informations importantes</h4>
                    <ul style={{ color: "#2d3748", marginLeft: "20px", lineHeight: "1.6" }}>
                      <li>Les paramètres de gestion s'appliquent à toute la société</li>
                      <li>Le seuil d'alerte peut être personnalisé pour chaque produit</li>
                      <li>Les alertes de péremption apparaissent dans le tableau de bord</li>
                      <li>La TVA est calculée automatiquement sur les factures</li>
                      <li>Ces paramètres affectent aussi la gestion multi-lots</li>
                    </ul>
                  </div>
                </form>
              )}

        {/* Multi-lots */}
              {activeTab === "multilots" && (
                <form onSubmit={handleSaveMultiLots}>
                  <h3
                    style={{
                      color: "#2d3748",
                      fontSize: isMobile ? "1.3em" : "1.6em",
                      fontWeight: 800,
                      marginBottom: isMobile ? "20px" : "30px",
                      textAlign: "center"
                    }}
                  >
                    Configuration Multi-Lots Avancée
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(350px, 1fr))",
                      gap: "25px"
                    }}
                  >
                    {/* Activation */}
                    <div
                      style={{
                        padding: "20px",
                        background: "linear-gradient(135deg, #667eea20 0%, #764ba220 100%)",
                        borderRadius: "12px",
                        border: "2px solid #667eea40"
                      }}
                    >
                      <h4 style={{ color: "#667eea", marginBottom: "15px", fontSize: "1.1em" }}>Activation Multi-Lots</h4>

                      <div style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            cursor: "pointer",
                            fontSize: "1em",
                            fontWeight: 600
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={gestionMultiLots}
                            onChange={(e) => setGestionMultiLots(e.target.checked)}
                            disabled={saving}
                            style={{ transform: "scale(1.2)" }}
                          />
                          <span style={{ color: "#2d3748" }}>Activer la gestion multi-lots</span>
                        </label>
                        <small style={{ color: "#6b7280", marginTop: "5px", display: "block", marginLeft: "32px" }}>
                          Permet de gérer plusieurs lots par produit avec traçabilité complète
                        </small>
                      </div>

                      <div style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            cursor: "pointer",
                            fontSize: "1em",
                            fontWeight: 600
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={generationAutomatiqueLots}
                            onChange={(e) => setGenerationAutomatiqueLots(e.target.checked)}
                            disabled={saving || !gestionMultiLots}
                            style={{ transform: "scale(1.2)" }}
                          />
                          <span style={{ color: gestionMultiLots ? "#2d3748" : "#9ca3af" }}>
                            Génération automatique des numéros de lots
                          </span>
                        </label>
                        <small style={{ color: "#6b7280", marginTop: "5px", display: "block", marginLeft: "32px" }}>
                          Génère automatiquement un numéro si non fourni lors de l'ajout
                        </small>
                      </div>
                    </div>

                    {/* Alertes */}
                    <div
                      style={{
                        padding: "20px",
                        background: "linear-gradient(135deg, #ed893620 0%, #dd6b2020 100%)",
                        borderRadius: "12px",
                        border: "2px solid #ed893640"
                      }}
                    >
                      <h4 style={{ color: "#ed8936", marginBottom: "15px", fontSize: "1.1em" }}>Alertes Multi-Lots</h4>

                      <div style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            cursor: "pointer",
                            fontSize: "1em",
                            fontWeight: 600
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={alerteLotsExpires}
                            onChange={(e) => setAlerteLotsExpires(e.target.checked)}
                            disabled={saving || !gestionMultiLots}
                            style={{ transform: "scale(1.2)" }}
                          />
                          <span style={{ color: gestionMultiLots ? "#2d3748" : "#9ca3af" }}>
                            Alertes lots bientôt expirés
                          </span>
                        </label>
                        <small style={{ color: "#6b7280", marginTop: "5px", display: "block", marginLeft: "32px" }}>
                          Affiche des alertes pour les lots approchant de leur date d'expiration
                        </small>
                      </div>

                      <div>
                        <label style={styles.label}>Délai d'alerte pour les lots (jours)</label>
                        <input
                          type="number"
                          style={{ ...styles.input, opacity: gestionMultiLots && alerteLotsExpires ? 1 : 0.6 }}
                          value={delaiAlerteLots}
                          onChange={(e) => setDelaiAlerteLots(e.target.value)}
                          min="1"
                          max="365"
                          disabled={saving || !gestionMultiLots || !alerteLotsExpires}
                        />
                        <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                          Nombre de jours avant expiration pour déclencher l'alerte
                        </small>
                      </div>
                    </div>

                    {/* Numérotation */}
                    <div
                      style={{
                        padding: "20px",
                        background: "linear-gradient(135deg, #48bb7820 0%, #38a16920 100%)",
                        borderRadius: "12px",
                        border: "2px solid #48bb7840",
                        gridColumn: isMobile ? "1" : "1 / -1"
                      }}
                    >
                      <h4 style={{ color: "#48bb78", marginBottom: "15px", fontSize: "1.1em" }}>
                        Format de Numérotation Automatique
                      </h4>

                      <div>
                        <label style={styles.label}>Format des numéros de lots</label>
                        <input
                          type="text"
                          style={{ ...styles.input, opacity: gestionMultiLots && generationAutomatiqueLots ? 1 : 0.6 }}
                          value={formatNumerotationLots}
                          onChange={(e) => setFormatNumerotationLots(e.target.value)}
                          placeholder="LOT{YYYY}{MM}{DD}{HH}{mm}"
                          disabled={saving || !gestionMultiLots || !generationAutomatiqueLots}
                        />
                        <small style={{ color: "#6b7280", marginTop: "5px", display: "block", lineHeight: "1.4" }}>
                          <strong>Variables :</strong>
                          <br />• {"{YYYY}"} année &nbsp;• {"{MM}"} mois &nbsp;• {"{DD}"} jour &nbsp;• {"{HH}"} heure &nbsp;• {"{mm}"} minutes &nbsp;• {"{ss}"} secondes
                          <br />
                          <strong>Exemple :</strong> LOT{"{YYYY}{MM}{DD}{HH}{mm}"} → LOT202412251430
                        </small>

                        <div
                          style={{
                            marginTop: "15px",
                            padding: "12px",
                            background: "white",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px"
                          }}
                        >
                          <div style={{ fontSize: "0.8em", color: "#6b7280", marginBottom: "5px" }}>
                            <strong>Aperçu avec la date actuelle :</strong>
                          </div>
                          <div
                            style={{ fontFamily: "monospace", fontSize: "1em", color: "#667eea", fontWeight: 700 }}
                          >
                            {formatNumerotationLots
                              .replace("{YYYY}", new Date().getFullYear())
                              .replace("{MM}", String(new Date().getMonth() + 1).padStart(2, "0"))
                              .replace("{DD}", String(new Date().getDate()).padStart(2, "0"))
                              .replace("{HH}", String(new Date().getHours()).padStart(2, "0"))
                              .replace("{mm}", String(new Date().getMinutes()).padStart(2, "0"))
                              .replace("{ss}", String(new Date().getSeconds()).padStart(2, "0"))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div
                    style={{
                      marginTop: "30px",
                      padding: "20px",
                      background: "linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <h4 style={{ color: "#2d3748", marginBottom: "15px", fontSize: "1.1em" }}>
                      Statistiques Multi-Lots Actuelles
                    </h4>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: "15px"
                      }}
                    >
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "2em", color: "#667eea", fontWeight: 800 }}>{stockEntries.length}</div>
                        <div style={{ fontSize: "0.8em", color: "#4a5568", fontWeight: 600 }}>Entrées de Stock</div>
                      </div>

                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "2em", color: "#48bb78", fontWeight: 800 }}>
                          {new Set(stockEntries.map((e) => e.numeroLot).filter(Boolean)).size}
                        </div>
                        <div style={{ fontSize: "0.8em", color: "#4a5568", fontWeight: 600 }}>Lots Uniques</div>
                      </div>

                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "2em", color: "#ed8936", fontWeight: 800 }}>
                          {new Set(stockEntries.map((e) => e.nom).filter(Boolean)).size}
                        </div>
                        <div style={{ fontSize: "0.8em", color: "#4a5568", fontWeight: 600 }}>Produits Différents</div>
                      </div>

                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "2em", color: "#805ad5", fontWeight: 800 }}>
                          {new Set(stockEntries.map((e) => e.fournisseur).filter(Boolean)).size}
                        </div>
                        <div style={{ fontSize: "0.8em", color: "#4a5568", fontWeight: 600 }}>Fournisseurs</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button
                      type="submit"
                      style={{
                        ...styles.button,
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        width: isMobile ? "100%" : "auto",
                        minWidth: "250px"
                      }}
                      disabled={saving}
                    >
                      {saving ? "Enregistrement..." : "Enregistrer Multi-Lots"}
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: "30px",
                      padding: "20px",
                      background: "linear-gradient(135deg, #667eea20 0%, #764ba220 100%)",
                      borderRadius: "10px",
                      border: "1px solid #667eea40"
                    }}
                  >
                    <h4 style={{ color: "#667eea", marginBottom: "10px", fontSize: "1.1em" }}>
                      Avantages de la Gestion Multi-Lots
                    </h4>
                    <ul style={{ color: "#2d3748", marginLeft: "20px", lineHeight: "1.6" }}>
                      <li>
                        <strong>Traçabilité complète :</strong> Suivi de chaque lot individuellement
                      </li>
                      <li>
                        <strong>Gestion des expirations :</strong> Alertes spécifiques par lot
                      </li>
                      <li>
                        <strong>Fournisseurs multiples :</strong> Même produit, différents fournisseurs
                      </li>
                      <li>
                        <strong>FIFO automatique :</strong> First In, First Out par date d'expiration
                      </li>
                      <li>
                        <strong>Reporting avancé :</strong> Analyses détaillées par lot et fournisseur
                      </li>
                      <li>
                        <strong>Conformité réglementaire :</strong> Respect des normes pharmaceutiques
                      </li>
                    </ul>
                  </div>
                </form>
              )}

              {/* Activités */}
              {activeTab === "activites" && (
                <div>
                  <h3
                    style={{
                      color: "#2d3748",
                      fontSize: isMobile ? "1.3em" : "1.6em",
                      fontWeight: 800,
                      marginBottom: isMobile ? "20px" : "30px",
                      textAlign: "center"
                    }}
                  >
                    Suivi des Activités Multi-Lots
                  </h3>

                  {/* Traçabilité info */}
                  <div
                    style={{
                      background: "linear-gradient(135deg, #ed893620 0%, #dd6b2020 100%)",
                      border: "2px solid #ed8936",
                      borderRadius: "10px",
                      padding: "15px",
                      marginBottom: "20px"
                    }}
                  >
                    <h4 style={{ color: "#ed8936", marginBottom: "10px", fontSize: "1.1em" }}>
                      Information sur la Traçabilité Multi-Lots
                    </h4>
                    <p style={{ color: "#2d3748", marginBottom: "10px", lineHeight: "1.5" }}>
                      Les activités affichées incluent maintenant les informations multi-lots quand disponibles. Les anciennes
                      opérations peuvent montrer "Utilisateur inconnu" car la traçabilité n'était pas encore activée.
                    </p>
                    <button
                      style={{ ...styles.button, background: "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)", marginTop: 10 }}
                      onClick={enableUserTracking}
                      type="button"
                    >
                      Activer la traçabilité complète
                    </button>
                  </div>

                  {loadingActivites && (
                    <div style={{ textAlign: "center", padding: "40px", color: "#667eea", fontSize: "1.2em" }}>
                      Chargement des activités multi-lots...
                    </div>
                  )}

                  {!loadingActivites && activites.length > 0 && (
                    <>
                      {/* Stats par utilisateur */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))",
                          gap: "15px",
                          marginBottom: "25px"
                        }}
                      >
                        {/* Utilisateur actuel */}
                        <div
                          style={{
                            background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                            padding: "20px",
                            borderRadius: "15px",
                            color: "white",
                            boxShadow: "0 10px 30px rgba(72, 187, 120, 0.3)"
                          }}
                        >
                          <h4 style={{ marginBottom: "15px", fontSize: "1.1em" }}>
                            {getUserName(user.uid, user.email)} (Vous)
                          </h4>
                          <div style={{ fontSize: "0.9em", lineHeight: "1.6" }}>
                            <div>
                              <strong>Rôle:</strong> {role}
                            </div>
                            {(() => {
                              const stats = getStatistiquesUtilisateur(user.uid);
                              return (
                                <>
                                  <div>
                                    <strong>Total activités:</strong> {stats.totalActivites}
                                  </div>
                                  <div>
                                    <strong>Ventes:</strong> {stats.totalVentes} ({stats.montantVentes.toFixed(2)} DH)
                                  </div>
                                  <div>
                                    <strong>Achats:</strong> {stats.totalAchats} ({stats.montantAchats.toFixed(2)} DH)
                                  </div>
                                  <div style={{ color: "#e6fffa" }}>
                                    <strong>Multi-Lots:</strong> {stats.activitesMultiLots} activités ({stats.totalLots} lots)
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Autres utilisateurs */}
                        {utilisateurs
                          .filter((u) => u.id !== user.uid)
                          .map((u) => {
                            const stats = getStatistiquesUtilisateur(u.id);
                            return (
                              <div
                                key={u.id}
                                style={{
                                  background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                                  padding: "20px",
                                  borderRadius: "15px",
                                  color: "white",
                                  boxShadow: "0 10px 30px rgba(66, 153, 225, 0.3)"
                                }}
                              >
                                <h4 style={{ marginBottom: "15px", fontSize: "1.1em" }}>{getUserName(u.id)}</h4>
                                <div style={{ fontSize: "0.9em", lineHeight: "1.6" }}>
                                  <div>
                                    <strong>Rôle:</strong> {u.role}
                                  </div>
                                  <div>
                                    <strong>Total activités:</strong> {stats.totalActivites}
                                  </div>
                                  <div>
                                    <strong>Ventes:</strong> {stats.totalVentes} ({stats.montantVentes.toFixed(2)} DH)
                                  </div>
                                  <div>
                                    <strong>Achats:</strong> {stats.totalAchats} ({stats.montantAchats.toFixed(2)} DH)
                                  </div>
                                  <div style={{ color: "#bee3f8" }}>
                                    <strong>Multi-Lots:</strong> {stats.activitesMultiLots} activités ({stats.totalLots} lots)
                                  </div>
                                  {stats.derniereActivite && (
                                    <div style={{ marginTop: "8px", fontSize: "0.8em", opacity: 0.9 }}>
                                      <strong>Dernière activité:</strong> {formatDate(stats.derniereActivite)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* Bouton filtres */}
                      <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "20px", flexWrap: "wrap" }}>
                        <button
                          style={{
                            ...styles.button,
                            background: showActivitesFilters
                              ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                              : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)"
                          }}
                          onClick={() => setShowActivitesFilters((v) => !v)}
                          type="button"
                        >
                          {showActivitesFilters ? "Masquer" : "Afficher"} Filtres
                        </button>
                      </div>

                      {/* Filtres */}
                      {showActivitesFilters && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: "15px",
                            alignItems: "end",
                            marginBottom: "20px",
                            padding: "20px",
                            background: "linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)",
                            borderRadius: "15px",
                            border: "2px solid #e2e8f0"
                          }}
                        >
                          <div>
                            <label style={styles.label}>Utilisateur</label>
                            <select
                              style={styles.input}
                              value={selectedUserId}
                              onChange={(e) => setSelectedUserId(e.target.value)}
                            >
                              <option value="">Tous les utilisateurs</option>
                              <option value={user.uid}>{getUserName(user.uid, user.email)} (Vous)</option>
                              {utilisateurs
                                .filter((u) => u.id !== user.uid)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {getUserName(u.id)} ({u.role})
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div>
                            <label style={styles.label}>Type d'activité</label>
                            <select
                              style={styles.input}
                              value={filterType}
                              onChange={(e) => setFilterType(e.target.value)}
                            >
                              <option value="">Tous les types</option>
                              <option value="Vente">Ventes</option>
                              <option value="Achat">Achats</option>
                              <option value="Multi-Lots">Activités Multi-Lots</option>
                              <option value="Stock">Modifications Stock</option>
                              <option value="Retour">Retours</option>
                              <option value="Paiement">Paiements</option>
                            </select>
                          </div>

                          <div>
                            <label style={styles.label}>Date début</label>
                            <input
                              type="date"
                              style={styles.input}
                              value={filterDateMin}
                              onChange={(e) => setFilterDateMin(e.target.value)}
                            />
                          </div>

                          <div>
                            <label style={styles.label}>Date fin</label>
                            <input
                              type="date"
                              style={styles.input}
                              value={filterDateMax}
                              onChange={(e) => setFilterDateMax(e.target.value)}
                            />
                          </div>

                          {(selectedUserId || filterType || filterDateMin || filterDateMax) && (
                            <div style={{ textAlign: "center" }}>
                              <button
                                style={{
                                  ...styles.button,
                                  background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
                                  padding: "10px 20px",
                                  fontSize: "0.9em",
                                  width: "100%"
                                }}
                                type="button"
                                onClick={() => {
                                  setSelectedUserId("");
                                  setFilterType("");
                                  setFilterDateMin("");
                                  setFilterDateMax("");
                                }}
                              >
                                Réinitialiser
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tableau */}
                      <div
                        style={{
                          overflow: "auto",
                          WebkitOverflowScrolling: "touch",
                          borderRadius: "15px",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 15px 40px rgba(0,0,0,0.1)",
                          maxHeight: "60vh"
                        }}
                      >
                        <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
                          <thead
                            style={{
                              background: "linear-gradient(135deg, #2d3748 0%, #1a202c 100%)",
                              color: "white",
                              position: "sticky",
                              top: 0,
                              zIndex: 10
                            }}
                          >
                            <tr>
                              <th
                                style={{
                                  padding: isMobile ? "12px 8px" : "18px 15px",
                                  textAlign: "left",
                                  fontWeight: 700,
                                  fontSize: isMobile ? "0.8em" : "0.9em",
                                  minWidth: isMobile ? "120px" : "150px"
                                }}
                              >
                                Date
                              </th>
                              <th
                                style={{
                                  padding: isMobile ? "12px 8px" : "18px 15px",
                                  textAlign: "left",
                                  fontWeight: 700,
                                  fontSize: isMobile ? "0.8em" : "0.9em",
                                  minWidth: isMobile ? "150px" : "180px"
                                }}
                              >
                                Utilisateur
                              </th>
                              <th
                                style={{
                                  padding: isMobile ? "12px 8px" : "18px 15px",
                                  textAlign: "center",
                                  fontWeight: 700,
                                  fontSize: isMobile ? "0.8em" : "0.9em",
                                  minWidth: isMobile ? "80px" : "100px"
                                }}
                              >
                                Type
                              </th>
                              <th
                                style={{
                                  padding: isMobile ? "12px 8px" : "18px 15px",
                                  textAlign: "left",
                                  fontWeight: 700,
                                  fontSize: isMobile ? "0.8em" : "0.9em",
                                  minWidth: isMobile ? "150px" : "200px"
                                }}
                              >
                                Détails
                              </th>
                              {!isMobile && (
                                <th
                                  style={{
                                    padding: "18px 15px",
                                    textAlign: "right",
                                    fontWeight: 700,
                                    fontSize: "0.9em",
                                    minWidth: "120px"
                                  }}
                                >
                                  Montant
                                </th>
                              )}
                              <th
                                style={{
                                  padding: isMobile ? "12px 8px" : "18px 15px",
                                  textAlign: "center",
                                  fontWeight: 700,
                                  fontSize: isMobile ? "0.8em" : "0.9em",
                                  minWidth: isMobile ? "80px" : "100px"
                                }}
                              >
                                Statut
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {activitesFiltrees.map((a, i) => (
                              <tr
                                key={`${a.type}-${a.id}-${i}`}
                                style={{ background: i % 2 === 0 ? "#f8fafc" : "white", transition: "all 0.3s ease" }}
                              >
                                <td
                                  style={{
                                    padding: isMobile ? "12px 8px" : "18px 15px",
                                    fontSize: isMobile ? "0.7em" : "0.9em",
                                    color: "#4a5568"
                                  }}
                                >
                                  {formatDate(a.date)}
                                </td>
                                <td style={{ padding: isMobile ? "12px 8px" : "18px 15px" }}>
                                  <div
                                    style={{ fontWeight: 600, color: "#2d3748", fontSize: isMobile ? "0.8em" : "0.9em" }}
                                  >
                                    {getUserName(a.utilisateurId, a.utilisateurEmail)}
                                    {a.utilisateurId === user.uid && (
                                      <span style={{ color: "#48bb78", fontSize: "0.8em" }}> (Vous)</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: "0.7em", color: "#6b7280" }}>{getUserRole(a.utilisateurId)}</div>
                                  {a.utilisateurEmail && !isMobile && (
                                    <div style={{ fontSize: "0.7em", color: "#9ca3af" }}>{a.utilisateurEmail}</div>
                                  )}
                                </td>
                                <td style={{ padding: isMobile ? "12px 8px" : "18px 15px", textAlign: "center" }}>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: isMobile ? "3px 6px" : "4px 8px",
                                      borderRadius: "6px",
                                      fontSize: isMobile ? "0.6em" : "0.7em",
                                      fontWeight: 700,
                                      background: getTypeColor(a.type) + "30",
                                      color: getTypeColor(a.type),
                                      border: `1px solid ${getTypeColor(a.type)}`,
                                      whiteSpace: "nowrap"
                                    }}
                                  >
                                    {isMobile ? a.type.split(" ")[0] : a.type}
                                    {a.hasLots && !a.type.includes("Multi-Lots") && <span style={{ marginLeft: 2 }}>🏷️</span>}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    padding: isMobile ? "12px 8px" : "18px 15px",
                                    fontSize: isMobile ? "0.8em" : "0.9em",
                                    color: "#2d3748"
                                  }}
                                >
                                  {a.details}
                                  {a.nombreArticles && (
                                    <div style={{ fontSize: "0.8em", color: "#6b7280" }}>({a.nombreArticles} articles)</div>
                                  )}
                                  {a.nombreLots > 0 && (
                                    <div style={{ fontSize: "0.8em", color: "#667eea", fontWeight: 600 }}>
                                      {a.nombreLots} lot{a.nombreLots > 1 ? "s" : ""}
                                    </div>
                                  )}
                                  {isMobile && a.montant > 0 && (
                                    <div style={{ fontSize: "0.8em", color: "#48bb78", fontWeight: 700 }}>
                                      {a.montant.toFixed(2)} DH
                                    </div>
                                  )}
                                  {a.collection && (
                                    <div style={{ fontSize: "0.7em", color: "#9ca3af", opacity: 0.7 }}>
                                      Source: {a.collection}
                                    </div>
                                  )}
                                </td>
                                {!isMobile && (
                                  <td style={{ padding: "18px 15px", textAlign: "right", fontWeight: 600 }}>
                                    {a.montant ? (
                                      <span style={{ color: "#48bb78", fontSize: "1em" }}>
                                        {a.montant.toFixed(2)} DH
                                      </span>
                                    ) : (
                                      <span style={{ color: "#9ca3af" }}>-</span>
                                    )}
                                  </td>
                                )}
                                <td style={{ padding: isMobile ? "12px 8px" : "18px 15px", textAlign: "center" }}>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: isMobile ? "3px 6px" : "4px 8px",
                                      borderRadius: "15px",
                                      fontSize: isMobile ? "0.6em" : "0.7em",
                                      fontWeight: 600,
                                      textTransform: "uppercase",
                                      background:
                                        a.statut === "payé" ||
                                        a.statut === "Enregistré" ||
                                        a.statut === "Effectué" ||
                                        a.statut === "Modifié"
                                          ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)"
                                          : a.statut === "impayé"
                                          ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                                          : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                                      color: "white"
                                    }}
                                  >
                                    {isMobile
                                      ? a.statut === "payé" || a.statut === "Enregistré" || a.statut === "Effectué"
                                        ? "✓"
                                        : a.statut === "impayé"
                                        ? "✗"
                                        : "ⓘ"
                                      : a.statut}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {activitesFiltrees.length === 0 && (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "40px",
                            color: "#6b7280",
                            background: "linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)",
                            borderRadius: "15px",
                            marginTop: "20px",
                            fontSize: isMobile ? "1em" : "1.2em"
                          }}
                        >
                          Aucune activité trouvée avec les filtres sélectionnés
                        </div>
                      )}
                    </>
                  )}

                  {!loadingActivites && activites.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px",
                        color: "#6b7280",
                        background: "linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)",
                        borderRadius: "15px",
                        fontSize: isMobile ? "1em" : "1.2em"
                      }}
                    >
                      Aucune activité enregistrée pour le moment
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button
                      style={{
                        ...styles.button,
                        background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                        width: isMobile ? "100%" : "auto"
                      }}
                      onClick={fetchActivites}
                      disabled={loadingActivites}
                      type="button"
                    >
                      {loadingActivites ? "Chargement..." : "Actualiser les activités"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

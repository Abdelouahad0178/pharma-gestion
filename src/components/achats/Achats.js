import React, { useEffect, useState, useCallback } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

export default function Achats() {
  // Accès contexte global utilisateur + société
  const { role, loading, societeId, user } = useUserRole();

  // Chargement synchronisé pour afficher "Chargement..." si attente user/société
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // États principaux
  const [fournisseur, setFournisseur] = useState("");
  const [dateAchat, setDateAchat] = useState("");
  const [statutPaiement, setStatutPaiement] = useState("payé");
  const [remiseGlobale, setRemiseGlobale] = useState(0);

  // États d'article à ajouter
  const [produit, setProduit] = useState("");
  const [produitNouveau, setProduitNouveau] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [remiseArticle, setRemiseArticle] = useState(0);
  const [datePeremption, setDatePeremption] = useState("");
  const [numeroLot, setNumeroLot] = useState("");
  const [fournisseurArticle, setFournisseurArticle] = useState("");

  // Listes
  const [articles, setArticles] = useState([]);
  const [achats, setAchats] = useState([]);
  const [medicaments, setMedicaments] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [parametres, setParametres] = useState({ 
    entete: "", 
    pied: "", 
    cachetTexte: "Cachet Pharmacie",
    cachetImage: null,
    afficherCachet: true,
    typeCachet: "texte",
    tailleCachet: 120
  });

  // Edition
  const [editId, setEditId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Réception
  const [receptionId, setReceptionId] = useState(null);
  const [receptionArticles, setReceptionArticles] = useState([]);

  // Filtres
  const [filterFournisseur, setFilterFournisseur] = useState("");
  const [filterMedicament, setFilterMedicament] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [showFiltres, setShowFiltres] = useState(false);

  // Toggle formulaire
  const [showForm, setShowForm] = useState(false);
  const [showStockDetails, setShowStockDetails] = useState(false);

  // Animation states
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // États pour responsive et impression optimisée
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isPrintReady, setIsPrintReady] = useState(false);

  // Hook pour détecter la taille d'écran
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Détection des capacités d'impression
  useEffect(() => {
    const checkPrintCapabilities = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      setIsPrintReady(true);
      
      if (isMobileDevice && !window.open) {
        console.log("Appareil mobile détecté - Mode impression optimisé activé");
      }
    };

    checkPrintCapabilities();
  }, []);

  // Fonction pour afficher les notifications
  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Chargement des paramètres de la société avec cachet étendu
  const fetchParametres = useCallback(async () => {
    if (!societeId) return;
    try {
      const docRef = doc(db, "societe", societeId, "parametres", "documents");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setParametres({
          entete: data.entete || "PHARMACIE",
          pied: data.pied || "Merci pour votre confiance",
          cachetTexte: data.cachetTexte || "Cachet Pharmacie",
          cachetImage: data.cachetImage || data.cachet || null,
          afficherCachet: data.afficherCachet !== false,
          typeCachet: data.typeCachet || (data.cachet ? "image" : "texte"),
          tailleCachet: data.tailleCachet || 120
        });
        return;
      }
      
      const generalRef = doc(db, "societe", societeId, "parametres", "general");
      const generalSnap = await getDoc(generalRef);
      if (generalSnap.exists()) {
        const data = generalSnap.data();
        setParametres({
          entete: data.entete || "PHARMACIE",
          pied: data.pied || "Merci pour votre confiance",
          cachetTexte: data.cachetTexte || "Cachet Pharmacie",
          cachetImage: data.cachetImage || data.cachet || null,
          afficherCachet: data.afficherCachet !== false,
          typeCachet: data.typeCachet || (data.cachet ? "image" : "texte"),
          tailleCachet: data.tailleCachet || 120
        });
        return;
      }
      
      const societeRef = doc(db, "societes", societeId);
      const societeSnap = await getDoc(societeRef);
      if (societeSnap.exists()) {
        const societeData = societeSnap.data();
        setParametres({
          entete: societeData.nom || "Pharmacie",
          pied: "Merci pour votre confiance",
          cachetTexte: "Cachet Pharmacie",
          cachetImage: null,
          afficherCachet: true,
          typeCachet: "texte",
          tailleCachet: 120
        });
      }
    } catch (error) {
      console.error("Erreur lors du chargement des paramètres:", error);
      setParametres({
        entete: "Pharmacie",
        pied: "Merci pour votre confiance",
        cachetTexte: "Cachet Pharmacie",
        cachetImage: null,
        afficherCachet: true,
        typeCachet: "texte",
        tailleCachet: 120
      });
    }
  }, [societeId]);

  // Chargement des achats (par société)
  const fetchAchats = useCallback(async () => {
    if (!societeId) return setAchats([]);
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "achats"));
      let arr = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (
          Array.isArray(data.articles) &&
          data.articles.length > 0 &&
          data.articles.some(a => a.commandee && a.commandee.quantite > 0 && (a.commandee.prixUnitaire > 0 || a.commandee.prixAchat > 0))
        ) {
          arr.push({ id: docSnap.id, ...data });
        }
      });
      // Trier par date décroissante
      arr.sort((a, b) => {
        const dateA = a.timestamp?.toDate?.() || a.date?.toDate?.() || new Date(0);
        const dateB = b.timestamp?.toDate?.() || b.date?.toDate?.() || new Date(0);
        return dateB - dateA;
      });
      setAchats(arr);
    } catch (error) {
      console.error("Erreur lors du chargement des achats:", error);
      setAchats([]);
    }
  }, [societeId]);

  // Chargement du stock avec gestion multi-lots
  const fetchStockEntries = useCallback(async () => {
    if (!societeId) return setStockEntries([]);
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "stock_entries"));
      let arr = [];
      snap.forEach((docSnap) => {
        arr.push({ id: docSnap.id, ...docSnap.data() });
      });
      setStockEntries(arr.sort((a, b) => {
        // Trier par nom puis par date d'expiration
        if (a.nom !== b.nom) return (a.nom || "").localeCompare(b.nom || "");
        return new Date(a.datePeremption || 0) - new Date(b.datePeremption || 0);
      }));
    } catch (error) {
      console.error("Erreur lors du chargement des entrées de stock:", error);
      setStockEntries([]);
    }
  }, [societeId]);

  // Chargement des médicaments (liste unique des noms)
  const fetchMedicaments = useCallback(async () => {
    if (!societeId) return setMedicaments([]);
    
    try {
      // Récupérer tous les médicaments du stock traditionnel
      const stockSnap = await getDocs(collection(db, "societe", societeId, "stock"));
      let stockMeds = [];
      stockSnap.forEach((docSnap) => stockMeds.push(docSnap.data()));
      
      // Récupérer tous les médicaments des entrées de stock
      const entriesSnap = await getDocs(collection(db, "societe", societeId, "stock_entries"));
      let entriesMeds = [];
      entriesSnap.forEach((docSnap) => entriesMeds.push(docSnap.data()));
      
      // Créer une liste unique des noms de médicaments
      const allMeds = [...stockMeds, ...entriesMeds];
      const uniqueNames = Array.from(new Set(allMeds.map(m => m.nom).filter(Boolean)));
      const medicamentsList = uniqueNames.map(nom => {
        const examples = allMeds.filter(m => m.nom === nom);
        return {
          nom,
          exemples: examples.slice(0, 3) // Garder quelques exemples pour référence
        };
      });
      
      setMedicaments(medicamentsList.sort((a, b) => (a.nom || "").localeCompare(b.nom || "")));
    } catch (error) {
      console.error("Erreur lors du chargement des médicaments:", error);
      setMedicaments([]);
    }
  }, [societeId]);

  useEffect(() => { 
    if (societeId) {
      fetchAchats(); 
      fetchParametres();
      fetchStockEntries();
      fetchMedicaments();
    }
  }, [societeId, fetchAchats, fetchParametres, fetchStockEntries, fetchMedicaments]);

  // Sélection médicament avec suggestion de prix basée sur les entrées existantes
  const handleProduitChange = useCallback((value) => {
    setProduit(value);
    if (value !== "_new_" && value) {
      // Chercher les dernières entrées pour ce médicament
      const existingEntries = stockEntries.filter(entry => entry.nom === value);
      if (existingEntries.length > 0) {
        // Prendre la dernière entrée comme suggestion
        const lastEntry = existingEntries[existingEntries.length - 1];
        setPrixUnitaire(lastEntry.prixAchat || "");
        setPrixVente(lastEntry.prixVente || "");
        setFournisseurArticle(lastEntry.fournisseur || "");
      } else {
        // Fallback sur les médicaments classiques
        const med = medicaments.find(m => m.nom === value);
        if (med && med.exemples.length > 0) {
          const example = med.exemples[0];
          setPrixUnitaire(example.prixAchat || example.prixUnitaire || "");
          setPrixVente(example.prixVente || "");
        }
      }
    } else {
      setPrixUnitaire("");
      setPrixVente("");
      setFournisseurArticle("");
    }
  }, [stockEntries, medicaments]);

  // Ajout d'un article avec informations étendues
  const handleAddArticle = useCallback((e) => {
    e.preventDefault();
    const nomProduitFinal = produit === "_new_" ? produitNouveau.trim() : produit;
    
    if (!nomProduitFinal || !quantite || !prixUnitaire || !datePeremption) {
      showNotification("Veuillez remplir tous les champs obligatoires", "error");
      return;
    }
    
    // Validation des nombres
    const qte = Number(quantite);
    const prix = Number(prixUnitaire);
    const prixV = Number(prixVente) || 0;
    
    if (qte <= 0 || prix <= 0) {
      showNotification("La quantité et le prix doivent être positifs", "error");
      return;
    }
    
    // Générer un numéro de lot automatique si non fourni
    const lotFinal = numeroLot.trim() || `LOT${Date.now().toString().slice(-6)}`;
    const fournisseurFinal = fournisseurArticle.trim() || fournisseur;
    
    const nouvelArticle = {
      produit: nomProduitFinal,
      commandee: {
        quantite: qte,
        prixUnitaire: prix,
        prixAchat: prix,
        prixVente: prixV,
        remise: Number(remiseArticle) || 0,
        datePeremption,
        numeroLot: lotFinal,
        fournisseurArticle: fournisseurFinal,
      },
      recu: null
    };
    
    setArticles(prev => [...prev, nouvelArticle]);
    
    // Réinitialiser les champs article
    setProduit(""); 
    setProduitNouveau(""); 
    setQuantite(1); 
    setPrixUnitaire("");
    setPrixVente(""); 
    setRemiseArticle(0); 
    setDatePeremption("");
    setNumeroLot("");
    setFournisseurArticle("");
    
    showNotification("Article ajouté avec informations détaillées!", "success");
  }, [produit, produitNouveau, quantite, prixUnitaire, prixVente, remiseArticle, datePeremption, numeroLot, fournisseurArticle, fournisseur, showNotification]);

  // Retrait d'article temporaire
  const handleRemoveArticle = useCallback((idx) => {
    setArticles(prev => prev.filter((_, i) => i !== idx));
    showNotification("Article supprimé", "info");
  }, [showNotification]);

  // Mise à jour du stock avec gestion multi-lots (ajout)
  const updateStockOnAdd = useCallback(async (bon) => {
    if (!societeId || !user || !bon.articles) return;
    
    const updatePromises = bon.articles.map(async (art) => {
      try {
        // Créer une nouvelle entrée de stock pour chaque article
        await addDoc(collection(db, "societe", societeId, "stock_entries"), {
          nom: bon.produit || art.produit || "",
          quantite: Number(art.quantite || 0),
          quantiteInitiale: Number(art.quantite || 0),
          prixAchat: Number(art.prixUnitaire || art.prixAchat || 0),
          prixVente: Number(art.prixVente || art.prixUnitaire || art.prixAchat || 0),
          datePeremption: art.datePeremption || "",
          numeroLot: art.numeroLot || `LOT${Date.now().toString().slice(-6)}`,
          fournisseur: art.fournisseurArticle || bon.fournisseur || "",
          fournisseurPrincipal: bon.fournisseur || "",
          dateAchat: bon.date || Timestamp.now(),
          statut: "actif",
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          societeId: societeId,
          achatId: bon.id // Référence vers le bon d'achat
        });

        // Mettre à jour ou créer l'entrée dans le stock traditionnel pour compatibilité
        const stockRef = collection(db, "societe", societeId, "stock");
        const q = query(stockRef, where("nom", "==", bon.produit || art.produit || ""));
        const stockSnap = await getDocs(q);
        
        if (!stockSnap.empty) {
          // Mettre à jour le stock existant
          const docId = stockSnap.docs[0].id;
          const current = stockSnap.docs[0].data();
          
          await updateDoc(doc(db, "societe", societeId, "stock", docId), {
            quantite: Number(current.quantite || 0) + Number(art.quantite || 0),
            prixAchat: Number(art.prixUnitaire || art.prixAchat || 0), // Prix le plus récent
            prixVente: Number(art.prixVente || current.prixVente || art.prixUnitaire || art.prixAchat),
            datePeremption: art.datePeremption || current.datePeremption || "",
            dernierFournisseur: art.fournisseurArticle || bon.fournisseur || "",
            modifiePar: user.uid,
            modifieParEmail: user.email,
            modifieLe: Timestamp.now()
          });
        } else {
          // Créer nouvelle entrée stock traditionnel
          await addDoc(stockRef, {
            nom: bon.produit || art.produit || "",
            quantite: Number(art.quantite || 0),
            prixAchat: Number(art.prixUnitaire || art.prixAchat || 0),
            prixVente: Number(art.prixVente || art.prixUnitaire || art.prixAchat || 0),
            seuil: 5,
            datePeremption: art.datePeremption || "",
            dernierFournisseur: art.fournisseurArticle || bon.fournisseur || "",
            creePar: user.uid,
            creeParEmail: user.email,
            creeLe: Timestamp.now(),
            societeId: societeId
          });
        }
      } catch (error) {
        console.error(`Erreur lors de l'ajout au stock de ${art.produit}:`, error);
      }
    });

    await Promise.allSettled(updatePromises);
  }, [societeId, user]);

  // Mise à jour du stock avec gestion multi-lots (suppression)
  const updateStockOnDelete = useCallback(async (bon) => {
    if (!societeId || !user || !bon.articles) return;
    
    const deletePromises = bon.articles.map(async (art) => {
      try {
        // Trouver et supprimer les entrées de stock correspondantes
        const entriesRef = collection(db, "societe", societeId, "stock_entries");
        const q = query(entriesRef, where("achatId", "==", bon.id), where("nom", "==", art.produit || ""));
        const entriesSnap = await getDocs(q);
        
        const deleteEntryPromises = entriesSnap.docs.map(async (entryDoc) => {
          await deleteDoc(doc(db, "societe", societeId, "stock_entries", entryDoc.id));
        });
        
        await Promise.all(deleteEntryPromises);

        // Mettre à jour le stock traditionnel
        const stockRef = collection(db, "societe", societeId, "stock");
        const stockQuery = query(stockRef, where("nom", "==", art.produit || ""));
        const stockSnap = await getDocs(stockQuery);
        
        if (!stockSnap.empty) {
          const docId = stockSnap.docs[0].id;
          const current = stockSnap.docs[0].data();
          
          await updateDoc(doc(db, "societe", societeId, "stock", docId), {
            quantite: Math.max(0, Number(current.quantite || 0) - Number(art.quantite || 0)),
            modifiePar: user.uid,
            modifieParEmail: user.email,
            modifieLe: Timestamp.now()
          });
        }
      } catch (error) {
        console.error(`Erreur lors de la suppression du stock de ${art.produit}:`, error);
      }
    });

    await Promise.allSettled(deletePromises);
  }, [societeId, user]);

  // Ajout ou modification d'un bon d'achat avec enregistrement d'activité
  const handleAddBon = async (e) => {
    e.preventDefault();
    if (!societeId) {
      showNotification("Aucune société sélectionnée !", "error");
      return;
    }
    if (!user) {
      showNotification("Utilisateur non connecté !", "error");
      return;
    }
    if (!fournisseur.trim() || !dateAchat || articles.length === 0) {
      showNotification("Veuillez remplir tous les champs obligatoires", "error");
      return;
    }
    
    const articlesValid = articles.filter(a => a.produit && a.commandee.quantite > 0 && (a.commandee.prixUnitaire > 0 || a.commandee.prixAchat > 0));
    if (articlesValid.length === 0) {
      showNotification("Aucun article valide trouvé", "error");
      return;
    }

    setIsLoading(true);

    const articlesToSave = articlesValid.map(art => ({
      produit: art.produit,
      commandee: art.commandee,
      recu: isEditing ? achats.find(b => b.id === editId)?.articles.find(ap => ap.produit === art.produit)?.recu || null : null
    }));

    const montantTotal = articlesToSave.reduce(
      (sum, a) => sum + (((a.commandee.prixUnitaire || a.commandee.prixAchat || 0) * (a.commandee.quantite || 0)) - (a.commandee.remise || 0)),
      0
    ) - (Number(remiseGlobale) || 0);

    try {
      if (isEditing && editId) {
        await updateDoc(doc(db, "societe", societeId, "achats", editId), {
          fournisseur: fournisseur.trim(),
          date: Timestamp.fromDate(new Date(dateAchat)),
          timestamp: Timestamp.now(),
          statutPaiement,
          remiseGlobale: Number(remiseGlobale) || 0,
          articles: articlesToSave,
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now()
        });
        
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "achat",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            fournisseur: fournisseur.trim(),
            montant: montantTotal,
            articles: articlesToSave.length,
            action: 'modification',
            achatId: editId,
            statutPaiement
          }
        });
        
        setIsEditing(false); 
        setEditId(null);
        showNotification("Bon d'achat modifié avec succès!", "success");
        
      } else {
        const achatRef = await addDoc(collection(db, "societe", societeId, "achats"), {
          fournisseur: fournisseur.trim(),
          date: Timestamp.fromDate(new Date(dateAchat)),
          timestamp: Timestamp.now(),
          statutPaiement,
          remiseGlobale: Number(remiseGlobale) || 0,
          articles: articlesToSave,
          statutReception: "en_attente",
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          societeId: societeId
        });
        
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "achat",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            fournisseur: fournisseur.trim(),
            montant: montantTotal,
            articles: articlesToSave.length,
            action: 'création',
            achatId: achatRef.id,
            statutPaiement
          }
        });
        
        if (statutPaiement === "payé") {
          await addDoc(collection(db, "societe", societeId, "paiements"), {
            docId: achatRef.id,
            montant: montantTotal,
            mode: "Espèces",
            type: "achats",
            date: Timestamp.now(),
            createdBy: user.email
          });
          
          await addDoc(collection(db, "societe", societeId, "activities"), {
            type: "paiement",
            userId: user.uid,
            userEmail: user.email,
            timestamp: Timestamp.now(),
            details: {
              mode: "Espèces",
              type: "achats",
              montant: montantTotal,
              fournisseur: fournisseur.trim(),
              paiementAuto: true
            }
          });
        }
        showNotification("Bon d'achat créé avec gestion multi-lots!", "success");
      }
      
      resetForm();
      await Promise.all([fetchAchats(), fetchMedicaments(), fetchStockEntries()]);
      
    } catch (error) {
      console.error("Erreur lors de l'enregistrement:", error);
      showNotification("Erreur lors de l'enregistrement: " + error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Début de la réception
  const handleStartReception = useCallback((bon) => {
    if (bon.statutReception !== "en_attente") {
      showNotification("Bon déjà traité", "error");
      return;
    }
    setReceptionId(bon.id);
    setReceptionArticles(bon.articles.map(a => ({
      ...a,
      recu: { ...a.commandee } // Copie par défaut pour édition
    })));
  }, [showNotification]);

  // Soumission de la réception
  const handleSubmitReception = useCallback(async () => {
    if (!societeId || !user) return;

    setIsLoading(true);
    try {
      let isFull = true;
      let hasSome = false;
      receptionArticles.forEach(a => {
        if (a.recu.quantite < a.commandee.quantite) isFull = false;
        if (a.recu.quantite > 0) hasSome = true;
      });
      const newStatut = !hasSome ? "annulé" : isFull ? "reçu" : "partiel";

      await updateDoc(doc(db, "societe", societeId, "achats", receptionId), {
        articles: receptionArticles,
        statutReception: newStatut,
        dateReception: Timestamp.now(),
        recuPar: user.uid,
        recuParEmail: user.email
      });

      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "reception_achat",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          achatId: receptionId,
          statut: newStatut,
          action: 'confirmation'
        }
      });

      if (hasSome) {
        await updateStockOnAdd({
          id: receptionId,
          fournisseur: achats.find(b => b.id === receptionId)?.fournisseur || "",
          articles: receptionArticles.filter(a => a.recu.quantite > 0).map(a => ({
            produit: a.produit,
            ...a.recu
          })),
          date: Timestamp.now()
        });
      }

      showNotification(`Réception confirmée (${newStatut}) !`, "success");
      setReceptionId(null);
      setReceptionArticles([]);
      await Promise.all([fetchAchats(), fetchStockEntries(), fetchMedicaments()]);
    } catch (error) {
      console.error("Erreur lors de la confirmation de réception:", error);
      showNotification("Erreur lors de la confirmation", "error");
    } finally {
      setIsLoading(false);
    }
  }, [receptionId, receptionArticles, societeId, user, achats, updateStockOnAdd, showNotification, fetchAchats, fetchStockEntries, fetchMedicaments]);

  // Mise à jour d'un article en réception
  const handleUpdateReceptionArticle = useCallback((index, field, value) => {
    const newArts = [...receptionArticles];
    newArts[index].recu = {
      ...newArts[index].recu,
      [field]: field === 'quantite' || field === 'prixUnitaire' || field === 'prixVente' || field === 'remise' ? Number(value) : value
    };
    if (field === 'prixUnitaire') {
      newArts[index].recu.prixAchat = Number(value);
    }
    if (field === 'quantite') {
      newArts[index].recu.quantite = Math.max(0, Math.min(newArts[index].commandee.quantite, Number(value)));
    }
    setReceptionArticles(newArts);
  }, [receptionArticles]);

  // Réinitialisation du formulaire
  const resetForm = useCallback(() => {
    setFournisseur(""); 
    setDateAchat(""); 
    setStatutPaiement("payé"); 
    setRemiseGlobale(0);
    setArticles([]); 
    setEditId(null); 
    setIsEditing(false);
    setNumeroLot("");
    setFournisseurArticle("");
    setProduit("");
    setProduitNouveau("");
    setQuantite(1);
    setPrixUnitaire("");
    setPrixVente("");
    setRemiseArticle(0);
    setDatePeremption("");
  }, []);

  // Génération du cachet HTML optimisé pour signature
  const generateCachetHtml = useCallback(() => {
    if (!parametres.afficherCachet) return '';
    
    const taille = parametres.tailleCachet || 120;
    
    if (parametres.typeCachet === "image" && parametres.cachetImage) {
      return `
        <div style="position: relative; text-align: center; flex: 1;">
          <div class="signature-area"></div>
          <div class="signature-label">✍️ Signature Responsable</div>
          <img 
            src="${parametres.cachetImage}" 
            alt="Cachet de la pharmacie"
            style="
              position: absolute;
              top: 10px;
              left: 50%;
              transform: translateX(-50%);
              max-width: ${Math.min(taille, 100)}px;
              max-height: ${Math.min(taille, 60)}px;
              opacity: 0.8;
              z-index: 10;
              object-fit: contain;
            "
            onerror="this.style.display='none';"
          />
        </div>
      `;
    } else {
      return `
        <div style="position: relative; text-align: center; flex: 1;">
          <div class="signature-area"></div>
          <div class="signature-label">✍️ Signature Responsable</div>
          <div class="cachet-overlay" style="
            position: absolute;
            top: 15px;
            left: 50%;
            transform: translateX(-50%);
            border: 2px solid #667eea;
            color: #667eea;
            border-radius: 50%;
            padding: 8px 15px;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            background: rgba(102, 126, 234, 0.1);
            opacity: 0.8;
            z-index: 10;
            max-width: ${Math.min(taille, 80)}px;
            text-align: center;
            line-height: 1.2;
          ">
            ${parametres.cachetTexte || "Cachet Pharmacie"}
          </div>
        </div>
      `;
    }
  }, [parametres]);

  // Fonction helper pour générer le HTML d'impression optimisé
  const generatePrintHTML = useCallback((bon, articles, total, cachetHtml, isMobileDevice = false) => {
    const primaryColor = "#667eea";
    const secondaryColor = "#764ba2";
    
    let dateStr = "";
    try {
      if (bon.timestamp?.toDate) {
        dateStr = bon.timestamp.toDate().toLocaleString('fr-FR');
      } else if (bon.date?.toDate) {
        dateStr = bon.date.toDate().toLocaleDateString('fr-FR');
      } else if (typeof bon.date === 'string') {
        dateStr = new Date(bon.date).toLocaleDateString('fr-FR');
      }
    } catch (dateError) {
      console.warn("Erreur formatage date:", dateError);
      dateStr = "Date non disponible";
    }

    let titleDocument = bon.statutReception === "en_attente" ? "Bon de Commande Multi-Lots" : "Bon de Réception Multi-Lots";
    
    // Adaptations pour les petites dimensions
    const mobileOptimizations = isMobileDevice ? {
      fontSize: "12px",
      headerPadding: "20px 15px",
      contentPadding: "25px 15px",
      titleSize: "1.8em",
      badgeSize: "1em",
      cardPadding: "15px",
      tablePadding: "8px 6px",
      sectionGap: "20px"
    } : {
      fontSize: "14px",
      headerPadding: "40px",
      contentPadding: "50px",
      titleSize: "2.8em",
      badgeSize: "1.4em",
      cardPadding: "30px",
      tablePadding: "18px 15px",
      sectionGap: "40px"
    };
    
    return `<!DOCTYPE html>
      <html lang="fr">
        <head>
          <title>${titleDocument} - ${bon.fournisseur}</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
            
            * { 
              margin: 0; 
              padding: 0; 
              box-sizing: border-box; 
            }
            
            body { 
              font-family: 'Inter', Arial, sans-serif; 
              margin: 0;
              padding: ${isMobileDevice ? '5px' : '10px'};
              background: white;
              color: #2d3748;
              font-size: ${isMobileDevice ? '10px' : '12px'};
              line-height: 1.3;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              height: auto;
              overflow: auto;
            }
            
            .document-container {
              background: white;
              max-width: 100%;
              margin: 0 auto;
              border-radius: 0;
              overflow: hidden;
              position: relative;
              height: auto;
              min-height: ${isMobileDevice ? 'calc(100vh - 10px)' : 'calc(100vh - 20px)'};
              display: flex;
              flex-direction: column;
            }
            
            .header-section {
              background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);
              padding: ${isMobileDevice ? '15px 10px' : '20px 15px'};
              text-align: center;
              position: relative;
              overflow: hidden;
              flex-shrink: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            .header-content {
              position: relative;
              z-index: 2;
            }
            
            .company-title {
              color: white;
              font-size: ${isMobileDevice ? '1.4em' : '1.8em'};
              font-weight: 800;
              margin-bottom: ${isMobileDevice ? '5px' : '8px'};
              text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
              letter-spacing: ${isMobileDevice ? '0.5px' : '1px'};
              word-wrap: break-word;
            }
            
            .document-badge {
              background: rgba(255,255,255,0.9);
              color: ${primaryColor};
              padding: ${isMobileDevice ? '4px 12px' : '6px 16px'};
              border-radius: 20px;
              font-size: ${isMobileDevice ? '0.8em' : '1em'};
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: ${isMobileDevice ? '0.5px' : '1px'};
              display: inline-block;
              border: 1px solid rgba(255,255,255,0.3);
            }
            
            .document-number {
              color: #e2e8f0;
              font-size: ${isMobileDevice ? '0.7em' : '0.8em'};
              font-weight: 600;
              margin-top: ${isMobileDevice ? '4px' : '6px'};
              letter-spacing: 0.5px;
            }
            
            .content-wrapper {
              padding: ${isMobileDevice ? '15px 10px' : '20px 15px'};
              flex: 1;
              overflow: auto;
              display: flex;
              flex-direction: column;
            }
            
            .info-section {
              display: grid;
              grid-template-columns: ${isMobileDevice ? '1fr 1fr' : '1fr 1fr 1fr 1fr'};
              gap: ${isMobileDevice ? '8px' : '12px'};
              margin-bottom: ${isMobileDevice ? '12px' : '15px'};
              flex-shrink: 0;
            }
            
            .info-card {
              background: linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%);
              padding: ${isMobileDevice ? '8px' : '12px'};
              border-radius: ${isMobileDevice ? '6px' : '8px'};
              border-left: ${isMobileDevice ? '2px' : '3px'} solid ${primaryColor};
              box-shadow: 0 2px 8px rgba(0,0,0,0.05);
              position: relative;
              overflow: hidden;
            }
            
            .info-label {
              color: #4a5568;
              font-weight: 700;
              font-size: ${isMobileDevice ? '0.6em' : '0.7em'};
              text-transform: uppercase;
              letter-spacing: ${isMobileDevice ? '0.5px' : '1px'};
              margin-bottom: ${isMobileDevice ? '3px' : '4px'};
              position: relative;
              z-index: 2;
            }
            
            .info-value {
              color: #1a202c;
              font-weight: 700;
              font-size: ${isMobileDevice ? '0.8em' : '0.9em'};
              position: relative;
              z-index: 2;
              word-wrap: break-word;
              line-height: 1.2;
            }
            
            .status-badge {
              display: inline-block;
              padding: ${isMobileDevice ? '6px 12px' : '10px 20px'};
              border-radius: 30px;
              font-weight: 700;
              font-size: ${isMobileDevice ? '0.8em' : '0.9em'};
              text-transform: uppercase;
              letter-spacing: 1px;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            .status-paye {
              background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
              color: white;
            }
            
            .status-partiel {
              background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%);
              color: white;
            }
            
            .status-impaye {
              background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
              color: white;
            }
            
            .articles-section {
              margin: ${isMobileDevice ? '10px 0' : '15px 0'};
              flex-shrink: 0;
              max-height: ${isMobileDevice ? '300px' : '400px'};
              overflow: auto;
            }
            
            .section-title {
              color: ${primaryColor};
              font-size: ${isMobileDevice ? '1em' : '1.2em'};
              font-weight: 800;
              margin-bottom: ${isMobileDevice ? '8px' : '10px'};
              text-align: center;
              text-transform: uppercase;
              letter-spacing: ${isMobileDevice ? '0.5px' : '1px'};
              position: relative;
              flex-shrink: 0;
            }
            
            .section-title::after {
              content: '';
              position: absolute;
              bottom: -2px;
              left: 50%;
              transform: translateX(-50%);
              width: ${isMobileDevice ? '40px' : '60px'};
              height: 2px;
              background: linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%);
              border-radius: 1px;
            }
            
            .articles-table {
              width: 100%;
              border-collapse: collapse;
              border-radius: ${isMobileDevice ? '4px' : '6px'};
              overflow: hidden;
              margin: ${isMobileDevice ? '8px 0' : '10px 0'};
              font-size: ${isMobileDevice ? '0.75em' : '0.85em'};
              max-height: ${isMobileDevice ? '250px' : '350px'};
            }
            
            .articles-table thead {
              background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            .articles-table th {
              padding: ${mobileOptimizations.tablePadding};
              text-align: center;
              color: white;
              font-weight: 700;
              font-size: ${isMobileDevice ? '0.8em' : '0.9em'};
              text-transform: uppercase;
              letter-spacing: 1px;
              border-right: 1px solid rgba(255,255,255,0.1);
              word-wrap: break-word;
            }
            
            .articles-table th:last-child {
              border-right: none;
            }
            
            .articles-table tbody tr {
              background: white;
              page-break-inside: avoid;
            }
            
            .articles-table tbody tr:nth-child(even) {
              background: #f8fafc;
            }
            
            .articles-table td {
              padding: ${mobileOptimizations.tablePadding};
              text-align: center;
              border-bottom: 1px solid #e2e8f0;
              font-weight: 600;
              word-wrap: break-word;
              font-size: ${isMobileDevice ? '0.85em' : '1em'};
              color: black;
            }
            
            .product-name {
              font-weight: 700;
              color: #2d3748;
              text-align: left;
              max-width: ${isMobileDevice ? '120px' : '200px'};
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            
            .lot-number {
              background: ${primaryColor}20;
              color: ${primaryColor};
              font-weight: 700;
              font-size: ${isMobileDevice ? '0.8em' : '0.9em'};
              padding: 2px 6px;
              border-radius: 4px;
            }
            
            .supplier-cell {
              color: #4a5568;
              font-weight: 600;
              font-size: ${isMobileDevice ? '0.8em' : '0.9em'};
            }
            
            .price-cell {
              color: ${primaryColor};
              font-weight: 800;
              font-size: ${isMobileDevice ? '0.9em' : '1.1em'};
            }
            
            .quantity-cell {
              background: ${primaryColor}20;
              color: ${primaryColor};
              font-weight: 800;
              border-radius: 6px;
              padding: ${isMobileDevice ? '4px 8px' : '8px 12px'};
            }
            
            .discount-cell {
              color: #e53e3e;
              font-weight: 700;
            }
            
            .total-cell {
              background: linear-gradient(135deg, ${primaryColor}20 0%, ${secondaryColor}20 100%);
              color: ${primaryColor};
              font-weight: 900;
              font-size: ${isMobileDevice ? '0.95em' : '1.15em'};
              border-radius: 6px;
            }
            
            .grand-total-section {
              margin: ${isMobileDevice ? '25px 0' : '40px 0'};
              padding: ${isMobileDevice ? '20px 15px' : '30px'};
              background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);
              border-radius: ${isMobileDevice ? '10px' : '20px'};
              color: white;
              text-align: center;
              position: relative;
              overflow: hidden;
              page-break-inside: avoid;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            .total-content {
              position: relative;
              z-index: 2;
            }
            
            .total-label {
              font-size: ${isMobileDevice ? '1.1em' : '1.4em'};
              font-weight: 600;
              margin-bottom: ${isMobileDevice ? '8px' : '15px'};
              text-transform: uppercase;
              letter-spacing: ${isMobileDevice ? '1px' : '2px'};
              opacity: 0.9;
            }
            
            .total-amount {
              font-size: ${isMobileDevice ? '2em' : '3em'};
              font-weight: 900;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
              margin-bottom: ${isMobileDevice ? '10px' : '20px'};
              word-wrap: break-word;
            }
            
            .total-note {
              font-size: ${isMobileDevice ? '0.85em' : '1em'};
              opacity: 0.8;
              font-style: italic;
              padding-top: ${isMobileDevice ? '10px' : '20px'};
              border-top: 2px solid rgba(255,255,255,0.3);
            }
            
            .signature-section {
              margin: ${isMobileDevice ? '30px 0' : '40px 0'};
              display: ${isMobileDevice ? 'block' : 'flex'};
              justify-content: space-between;
              align-items: flex-end;
              gap: ${isMobileDevice ? '20px' : '40px'};
              page-break-inside: avoid;
            }
            
            .signature-box {
              text-align: center;
              flex: 1;
              max-width: ${isMobileDevice ? '100%' : '200px'};
              margin-bottom: ${isMobileDevice ? '20px' : '0'};
            }
            
            .signature-area {
              height: ${isMobileDevice ? '50px' : '80px'};
              border-bottom: ${isMobileDevice ? '2px' : '3px'} solid #cbd5e0;
              margin-bottom: ${isMobileDevice ? '8px' : '15px'};
              position: relative;
              background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
              border-radius: 8px 8px 0 0;
            }
            
            .signature-label {
              font-weight: 700;
              color: #4a5568;
              font-size: ${isMobileDevice ? '0.8em' : '0.9em'};
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .footer-section {
              background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
              padding: ${isMobileDevice ? '10px 8px' : '12px 10px'};
              text-align: center;
              color: white;
              position: relative;
              flex-shrink: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            .footer-message {
              font-size: ${isMobileDevice ? '0.8em' : '0.9em'};
              font-weight: 600;
              margin-bottom: ${isMobileDevice ? '4px' : '6px'};
              font-style: italic;
              word-wrap: break-word;
              line-height: 1.2;
            }
            
            .print-info {
              color: #a0aec0;
              font-size: ${isMobileDevice ? '0.5em' : '0.6em'};
              margin-top: ${isMobileDevice ? '4px' : '6px'};
              line-height: 1.1;
            }
            
            .watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-20deg);
              font-size: ${isMobileDevice ? '60px' : '80px'};
              color: rgba(102, 126, 234, 0.02);
              font-weight: 900;
              z-index: 1;
              pointer-events: none;
              user-select: none;
            }
            
            .document-type-indicator {
              position: absolute;
              top: ${isMobileDevice ? '8px' : '10px'};
              right: ${isMobileDevice ? '8px' : '10px'};
              background: rgba(255,255,255,0.9);
              color: ${primaryColor};
              padding: ${isMobileDevice ? '3px 8px' : '4px 10px'};
              border-radius: 15px;
              font-size: ${isMobileDevice ? '0.5em' : '0.6em'};
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              border: 1px solid rgba(255,255,255,0.3);
            }
            
            /* Optimisations spéciales pour mobile */
            ${isMobileDevice ? `
              .info-section {
                grid-template-columns: 1fr !important;
              }
              
              .signature-section {
                display: block !important;
              }
              
              .signature-section .signature-box {
                margin-bottom: 25px;
              }
              
              .signature-section .signature-box:last-child {
                margin-bottom: 0;
              }
              
              .articles-table {
                font-size: 0.8em;
              }
              
              .articles-table th,
              .articles-table td {
                padding: 6px 4px;
              }
              
              .product-name {
                max-width: 100px;
                font-size: 0.85em;
              }
            ` : ''}
            
            /* Optimisations d'impression - TOUT SUR UNE PAGE */
            @media print {
              @page {
                margin: 0.5cm;
                size: A4;
              }
              
              body {
                background: white !important;
                padding: 0 !important;
                margin: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                height: auto !important;
                overflow: visible !important;
                font-size: 11px !important;
                width: 100% !important;
              }
              
              .document-container {
                box-shadow: none !important;
                border-radius: 0 !important;
                max-width: none !important;
                width: 100% !important;
                height: auto !important;
                max-height: none !important;
                page-break-inside: avoid !important;
                display: block !important;
                overflow: visible !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              
              .header-section {
                padding: 15px 10px !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                page-break-inside: avoid !important;
              }
              
              .content-wrapper {
                padding: 15px 10px !important;
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
              }
              
              .articles-section {
                margin: 15px 0 !important;
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                page-break-inside: avoid !important;
              }
              
              .articles-table {
                font-size: 9px !important;
                margin: 10px 0 !important;
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                page-break-inside: avoid !important;
              }
              
              .articles-table th,
              .articles-table td {
                padding: 6px 4px !important;
                font-size: 8px !important;
                line-height: 1.2 !important;
              }
              
              .product-name {
                font-size: 8px !important;
                max-width: 80px !important;
                word-wrap: break-word !important;
              }
              
              /* Masquer le filigrane en impression pour économiser l'encre */
              .watermark {
                display: none !important;
              }
              
              /* Optimisations spéciales pour impression mobile */
              ${isMobileDevice ? `
                body {
                  font-size: 9px !important;
                }
                
                .articles-table th,
                .articles-table td {
                  padding: 4px 2px !important;
                  font-size: 7px !important;
                }
                
                .product-name {
                  max-width: 60px !important;
                  font-size: 7px !important;
                }
              ` : ''}
            }
          </style>
        </head>
        <body>
          <div class="watermark">${titleDocument.toUpperCase()}</div>
          
          <div class="document-container">
            <div class="header-section">
              <div class="document-type-indicator">${titleDocument}</div>
              <div class="header-content">
                <h1 class="company-title">${parametres.entete || "PHARMACIE"}</h1>
                <div class="document-badge">🛒 ${titleDocument}</div>
                <div class="document-number">N° ${bon.id.substring(0, 8).toUpperCase()}</div>
              </div>
            </div>
            
            <div class="content-wrapper">
              <div class="info-section">
                <div class="info-card">
                  <div class="info-label">🏢 Fournisseur</div>
                  <div class="info-value">${bon.fournisseur || ""}</div>
                </div>
                
                <div class="info-card">
                  <div class="info-label">📅 Date & Heure</div>
                  <div class="info-value">${dateStr}</div>
                </div>
                
                <div class="info-card">
                  <div class="info-label">🆔 Numéro de Bon</div>
                  <div class="info-value">#${bon.id.substring(0, 8).toUpperCase()}</div>
                </div>
                
                <div class="info-card">
                  <div class="info-label">💳 Statut Paiement</div>
                  <div class="info-value">
                    <span class="status-badge status-${bon.statutPaiement || 'paye'}">${bon.statutPaiement || ""}</span>
                  </div>
                </div>
              </div>
              
              <div class="articles-section">
                <h2 class="section-title">📦 Détail des Articles avec Traçabilité</h2>
                
                <table class="articles-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Lot</th>
                      <th>Fournisseur</th>
                      <th>Qté</th>
                      <th>Prix Achat</th>
                      <th>Prix Vente</th>
                      <th>Date Exp.</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${articles.map((a, index) => {
                      const item = a.recu || a.commandee || {};
                      const prixAchatFinal = item.prixUnitaire || item.prixAchat || 0;
                      const totalArticle = (prixAchatFinal * (item.quantite || 0)) - (item.remise || 0);
                      const isExpiringSoon = item.datePeremption && new Date(item.datePeremption) < new Date(Date.now() + 30*24*60*60*1000);
                      
                      return `
                        <tr>
                          <td class="product-name">${a.produit || ""}</td>
                          <td><span class="lot-number">${item.numeroLot || "N/A"}</span></td>
                          <td class="supplier-cell">${item.fournisseurArticle || bon.fournisseur || ""}</td>
                          <td><span class="quantity-cell">${item.quantite || 0}</span></td>
                          <td class="price-cell">${prixAchatFinal.toFixed(2)} DH</td>
                          <td class="price-cell">${(item.prixVente || 0).toFixed(2)} DH</td>
                          <td style="color: ${isExpiringSoon ? '#e53e3e' : '#4a5568'};">
                            ${item.datePeremption || ""}
                          </td>
                          <td class="total-cell">
                            ${totalArticle.toFixed(2)} DH
                          </td>
                        </tr>`;
                    }).join("")}
                  </tbody>
                </table>
              </div>
              
              <div class="grand-total-section">
                <div class="total-content">
                  <div class="total-label">💰 Montant Total Commande Multi-Lots</div>
                  <div class="total-amount">${total.toFixed(2)} DH</div>
                  <div class="total-note">
                    📋 Bon de commande avec traçabilité • 📦 Livraison selon conditions convenues • 🏷️ Gestion multi-lots activée
                  </div>
                </div>
              </div>
              
              <div class="signature-section">
                <div class="signature-box">
                  <div class="signature-area"></div>
                  <div class="signature-label">✍️ Signature Fournisseur</div>
                </div>
                
                ${cachetHtml}
              </div>
            </div>
            
            <div class="footer-section">
              <div class="footer-message">
                ${parametres.pied || "Merci pour votre confiance ! 🙏"} - Gestion Multi-Lots Activée
              </div>
              <div class="print-info">
                ${titleDocument} généré le ${new Date().toLocaleString('fr-FR')} par ${user?.email || 'Utilisateur'}
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }, [parametres, user]);

  // Impression optimisée avec gestion d'erreurs améliorée
  const handlePrintBon = useCallback((bon) => {
    try {
      const articles = bon.articles.map(a => ({produit: a.produit, ...(a.recu || a.commandee)}));
      const totalArticles = articles.reduce(
        (sum, a) => sum + (((a.prixUnitaire || a.prixAchat || 0) * (a.quantite || 0)) - (a.remise || 0)),
        0
      );
      const totalApresRemiseGlobale = totalArticles - (bon.remiseGlobale || 0);
      
      const cachetHtml = generateCachetHtml();
      
      // Détection de l'environnement mobile pour optimiser l'impression
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      
      // Générer le HTML avec gestion d'erreur
      let htmlContent;
      try {
        htmlContent = generatePrintHTML(bon, articles, totalApresRemiseGlobale, cachetHtml, isMobileDevice);
      } catch (htmlError) {
        console.error("Erreur lors de la génération du HTML:", htmlError);
        showNotification("Erreur lors de la génération du document", "error");
        return;
      }
      
      if (isMobileDevice) {
        // Stratégie mobile avec fallback automatique
        handleMobilePrint(htmlContent, bon.statutReception === "en_attente" ? "Bon de Commande" : "Bon de Réception", bon.id);
      } else {
        // Stratégie desktop avec fallback automatique
        handleDesktopPrint(htmlContent, bon.statutReception === "en_attente" ? "Bon de Commande" : "Bon de Réception", bon.id);
      }
      
      showNotification(`Document préparé ! ${isMobileDevice ? 'Choisissez votre méthode d\'impression' : 'Envoyé vers l\'imprimante'}`, "success");
      
    } catch (error) {
      console.error("Erreur lors de la préparation d'impression:", error);
      showNotification("Erreur lors de la préparation d'impression", "error");
    }
  }, [generateCachetHtml, generatePrintHTML, showNotification]);

  // Gestion impression mobile optimisée
  const handleMobilePrint = useCallback((htmlContent, titleDocument, numero) => {
    try {
      // Détecter le type d'appareil mobile
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(userAgent);
      const isAndroid = /android/.test(userAgent);
      
      // Créer un contenu optimisé pour mobile avec moins de hauteur fixe
      const mobileOptimizedContent = htmlContent.replace(
        /height: calc\(100vh[^)]*\)/g, 
        'height: auto'
      ).replace(
        /min-height: calc\(100vh[^)]*\)/g, 
        'min-height: auto'
      );
      
      // Pour iOS et Android, utiliser une approche différente
      if (isIOS || isAndroid) {
        // Créer un bouton de téléchargement temporaire
        showMobileDownloadOption(mobileOptimizedContent, titleDocument, numero);
      } else {
        // Pour autres mobiles, essayer l'approche nouvelle fenêtre
        handleMobileNewWindow(mobileOptimizedContent, titleDocument, numero);
      }
      
    } catch (error) {
      console.error("Erreur dans handleMobilePrint:", error);
      downloadPrintFile(htmlContent, titleDocument, numero);
    }
  }, []);

  // Nouvelle fenêtre pour mobiles non iOS/Android
  const handleMobileNewWindow = useCallback((htmlContent, titleDocument, numero) => {
    try {
      // Optimiser le contenu pour mobile avant d'ouvrir la nouvelle fenêtre
      const optimizedContent = htmlContent.replace(
        '<body>',
        `<body style="margin: 0; padding: 10px; font-size: 12px; overflow: auto; height: auto;">`
      );
      
      // Créer une nouvelle fenêtre avec le contenu
      const printWindow = window.open('', '_blank', 'width=device-width,height=device-height,scrollbars=yes,resizable=yes');
      
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(optimizedContent);
        printWindow.document.close();
        
        // Attendre le chargement et ajuster la fenêtre
        printWindow.onload = () => {
          // Ajuster la vue pour mobile
          const viewport = printWindow.document.createElement('meta');
          viewport.setAttribute('name', 'viewport');
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, user-scalable=yes');
          printWindow.document.head.appendChild(viewport);
        };
        
        // Ajouter un bouton d'impression dans la nouvelle fenêtre
        const printButton = printWindow.document.createElement('div');
        printButton.innerHTML = `
          <div style="
            position: fixed; 
            bottom: 20px; 
            right: 20px; 
            background: #667eea; 
            color: white; 
            padding: 15px 25px; 
            border-radius: 25px; 
            cursor: pointer; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 9999;
            font-weight: bold;
            text-align: center;
            font-size: 16px;
            user-select: none;
          " onclick="window.print()">
            🖨️ Imprimer
          </div>
          <div style="
            position: fixed; 
            bottom: 80px; 
            right: 20px; 
            background: #48bb78; 
            color: white; 
            padding: 10px 20px; 
            border-radius: 20px; 
            cursor: pointer; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 9999;
            font-weight: bold;
            text-align: center;
            font-size: 14px;
            user-select: none;
          " onclick="window.close()">
            ✖️ Fermer
          </div>
        `;
        printWindow.document.body.appendChild(printButton);
        
        showNotification("Document ouvert dans un nouvel onglet. Utilisez le bouton d'impression.", "info");
      } else {
        downloadPrintFile(htmlContent, titleDocument, numero);
      }
      
    } catch (error) {
      console.error("Erreur nouvelle fenêtre mobile:", error);
      downloadPrintFile(htmlContent, titleDocument, numero);
    }
  }, []);

  // Afficher option de téléchargement pour iOS/Android
  const showMobileDownloadOption = useCallback((htmlContent, titleDocument, numero) => {
    // Créer un modal mobile pour les options
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    `;
    
    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 20px;
        padding: 30px;
        max-width: 90%;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      ">
        <h3 style="color: #2d3748; margin-bottom: 20px; font-size: 1.3em;">
          📱 Options d'impression mobile
        </h3>
        <p style="color: #4a5568; margin-bottom: 25px; line-height: 1.4;">
          Choisissez votre méthode d'impression préférée :
        </p>
        
        <button onclick="window.mobileprint_download()" style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 15px 25px;
          border-radius: 15px;
          font-weight: bold;
          margin: 10px;
          width: 80%;
          font-size: 1em;
          cursor: pointer;
        ">
          💾 Télécharger le document
        </button>
        
        <button onclick="window.mobileprint_newtab()" style="
          background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
          color: white;
          border: none;
          padding: 15px 25px;
          border-radius: 15px;
          font-weight: bold;
          margin: 10px;
          width: 80%;
          font-size: 1em;
          cursor: pointer;
        ">
          🌐 Ouvrir dans un nouvel onglet
        </button>
        
        <button onclick="window.mobileprint_close()" style="
          background: #e2e8f0;
          color: #4a5568;
          border: none;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: bold;
          margin-top: 15px;
          cursor: pointer;
        ">
          ❌ Annuler
        </button>
      </div>
    `;
    
    // Ajouter les fonctions globales temporaires
    window.mobileprint_download = () => {
      downloadPrintFile(htmlContent, titleDocument, numero);
      document.body.removeChild(modal);
      delete window.mobileprint_download;
      delete window.mobileprint_newtab;
      delete window.mobileprint_close;
    };
    
    window.mobileprint_newtab = () => {
      handleMobileNewWindow(htmlContent, titleDocument, numero);
      document.body.removeChild(modal);
      delete window.mobileprint_download;
      delete window.mobileprint_newtab;
      delete window.mobileprint_close;
    };
    
    window.mobileprint_close = () => {
      document.body.removeChild(modal);
      delete window.mobileprint_download;
      delete window.mobileprint_newtab;
      delete window.mobileprint_close;
    };
    
    document.body.appendChild(modal);
  }, []);

  // Gestion impression desktop améliorée
  const handleDesktopPrint = useCallback((htmlContent, titleDocument, numero) => {
    try {
      const printWindow = window.open("", "_blank", "width=800,height=600,scrollbars=yes,resizable=yes");
      
      if (printWindow && printWindow.document) {
        // Variable pour éviter les doubles fermetures
        let isWindowClosed = false;
        
        // Fonction de fermeture sécurisée
        const safeCloseWindow = () => {
          if (!isWindowClosed && printWindow && !printWindow.closed) {
            isWindowClosed = true;
            try {
              printWindow.close();
            } catch (error) {
              console.warn("Erreur lors de la fermeture de la fenêtre:", error);
            }
          }
        };
        
        try {
          // Utiliser write() de manière plus sécurisée
          printWindow.document.open();
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          
          // Attendre le chargement complet
          setTimeout(() => {
            try {
              if (!isWindowClosed && printWindow && !printWindow.closed) {
                printWindow.focus();
                printWindow.print();
                
                // Fermer après impression avec délai plus court
                setTimeout(safeCloseWindow, 800);
              }
              
            } catch (printError) {
              console.warn("Erreur d'impression:", printError);
              safeCloseWindow();
            }
          }, 400);
          
          // Timeout de sécurité plus court
          setTimeout(safeCloseWindow, 5000);
          
        } catch (writeError) {
          console.warn("Erreur d'écriture dans la fenêtre:", writeError);
          safeCloseWindow();
          downloadPrintFile(htmlContent, titleDocument, numero);
        }
        
      } else {
        // Fallback si popup bloquée
        showNotification("Popups bloquées - Téléchargement du document...", "info");
        downloadPrintFile(htmlContent, titleDocument, numero);
      }
      
    } catch (error) {
      console.error("Erreur dans handleDesktopPrint:", error);
      downloadPrintFile(htmlContent, titleDocument, numero);
    }
  }, []);

  // Fonction de téléchargement optimisée pour mobile
  const downloadPrintFile = useCallback((htmlContent, titleDocument, numero) => {
    try {
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(userAgent);
      const isAndroid = /android/.test(userAgent);
      
      if (isIOS) {
        // Pour iOS, créer un nouvel onglet avec le contenu
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.open();
          newWindow.document.write(htmlContent);
          newWindow.document.close();
          
          // Ajouter des instructions pour iOS
          const instructions = newWindow.document.createElement('div');
          instructions.innerHTML = `
            <div style="
              position: fixed; 
              top: 0; 
              left: 0; 
              right: 0; 
              background: #667eea; 
              color: white; 
              padding: 15px; 
              text-align: center; 
              z-index: 9999;
              font-weight: bold;
            ">
              📱 iOS: Utilisez Partage → Imprimer ou Partage → Fichiers pour sauvegarder
              <br>
              <button onclick="window.print()" style="
                background: white; 
                color: #667eea; 
                border: none; 
                padding: 8px 15px; 
                border-radius: 10px; 
                margin-top: 10px;
                font-weight: bold;
              ">
                🖨️ Essayer d'imprimer
              </button>
            </div>
          `;
          newWindow.document.body.insertBefore(instructions, newWindow.document.body.firstChild);
          
          showNotification("Document ouvert pour iOS. Utilisez Partage → Imprimer", "info");
        } else {
          showNotification("Veuillez autoriser les popups pour l'impression", "warning");
        }
        return;
      }
      
      // Pour Android et autres appareils
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      
      if (isAndroid && navigator.share) {
        // Utiliser l'API de partage native sur Android si disponible
        const file = new File([blob], `${titleDocument}_${numero}.html`, { type: 'text/html' });
        navigator.share({
          files: [file],
          title: `${titleDocument} - ${numero}`,
          text: 'Document de bon d\'achat à imprimer'
        }).then(() => {
          showNotification("Document partagé ! Choisissez votre application d'impression", "success");
        }).catch(() => {
          // Fallback vers téléchargement traditionnel
          downloadFileTraditional(blob, titleDocument, numero);
        });
      } else {
        // Téléchargement traditionnel
        downloadFileTraditional(blob, titleDocument, numero);
      }
      
    } catch (error) {
      console.error("Erreur dans downloadPrintFile:", error);
      showNotification("Erreur lors de la création du fichier", "error");
    }
  }, [showNotification]);

  // Fonction de téléchargement traditionnel
  const downloadFileTraditional = useCallback((blob, titleDocument, numero) => {
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.href = url;
      link.download = `${titleDocument}_${numero}_${new Date().toISOString().slice(0, 10)}.html`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      
      setTimeout(() => {
        try {
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
            } catch (urlError) {
              console.warn("Erreur lors de la libération de l'URL:", urlError);
            }
          }, 500);
          
          showNotification(`${titleDocument} téléchargé ! Ouvrez le fichier pour imprimer.`, "success");
          
        } catch (clickError) {
          console.error("Erreur lors du téléchargement:", clickError);
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showNotification("Erreur lors du téléchargement", "error");
        }
      }, 100);
      
    } catch (error) {
      console.error("Erreur dans downloadFileTraditional:", error);
      showNotification("Erreur lors de la création du fichier", "error");
    }
  }, [showNotification]);

  // Mode édition d'un bon
  const handleEditBon = useCallback((bon) => {
    if (bon.statutReception !== "en_attente") {
      showNotification("Impossible de modifier un bon déjà reçu", "error");
      return;
    }
    setEditId(bon.id);
    setIsEditing(true);
    setFournisseur(bon.fournisseur || "");
    
    try {
      if (bon.date?.toDate) {
        setDateAchat(bon.date.toDate().toISOString().split("T")[0]);
      } else if (bon.timestamp?.toDate) {
        setDateAchat(bon.timestamp.toDate().toISOString().split("T")[0]);
      } else if (typeof bon.date === 'string') {
        setDateAchat(new Date(bon.date).toISOString().split("T")[0]);
      } else {
        setDateAchat("");
      }
    } catch (error) {
      console.warn("Erreur formatage date pour édition:", error);
      setDateAchat("");
    }
    
    setStatutPaiement(bon.statutPaiement || "payé");
    setRemiseGlobale(bon.remiseGlobale || 0);
    setArticles(bon.articles.map(a => ({
      produit: a.produit,
      quantite: a.commandee.quantite,
      prixUnitaire: a.commandee.prixUnitaire,
      prixAchat: a.commandee.prixAchat,
      prixVente: a.commandee.prixVente,
      remise: a.commandee.remise,
      datePeremption: a.commandee.datePeremption,
      numeroLot: a.commandee.numeroLot,
      fournisseurArticle: a.commandee.fournisseurArticle,
    })));
    setShowForm(true);
  }, [showNotification]);

  // Suppression d'un bon avec enregistrement d'activité
  const handleDeleteBon = useCallback(async (bon) => {
    if (!societeId) {
      showNotification("Aucune société sélectionnée !", "error");
      return;
    }
    if (!user) {
      showNotification("Utilisateur non connecté !", "error");
      return;
    }
    
    if (window.confirm("Supprimer ce bon d'achat ? Cette action est irréversible.")) {
      setIsLoading(true);
      try {
        const receivedArticles = bon.articles.filter(a => a.recu && a.recu.quantite > 0).map(a => ({
          produit: a.produit,
          ...a.recu
        }));
        const montantTotal = receivedArticles.length > 0 ? receivedArticles.reduce(
          (sum, a) => sum + (((a.prixUnitaire || a.prixAchat || 0) * (a.quantite || 0)) - (a.remise || 0)),
          0
        ) - (bon.remiseGlobale || 0) : 0;
        
        if (bon.statutReception !== "en_attente") await updateStockOnDelete({ ...bon, articles: receivedArticles });
        await deleteDoc(doc(db, "societe", societeId, "achats", bon.id));
        
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "achat",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            fournisseur: bon.fournisseur,
            montant: montantTotal,
            action: 'suppression',
            achatId: bon.id
          }
        });
        
        await Promise.all([fetchAchats(), fetchMedicaments(), fetchStockEntries()]);
        showNotification("Bon d'achat supprimé avec succès!", "success");
        
      } catch (error) {
        console.error("Erreur lors de la suppression:", error);
        showNotification("Erreur lors de la suppression: " + error.message, "error");
      } finally {
        setIsLoading(false);
      }
    }
  }, [societeId, user, updateStockOnDelete, fetchAchats, fetchMedicaments, fetchStockEntries, showNotification]);

  // Fonction pour formater la date d'affichage
  const formatDateDisplay = useCallback((dateField) => {
    try {
      if (dateField?.toDate) {
        const date = dateField.toDate();
        return date.toLocaleDateString('fr-FR') + " " + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      } else if (typeof dateField === 'string') {
        return new Date(dateField).toLocaleDateString('fr-FR');
      }
      return "Date non spécifiée";
    } catch (error) {
      console.warn("Erreur formatage date:", error);
      return "Date invalide";
    }
  }, []);

  // Fonction pour obtenir le total d'un bon
  const getTotalBon = useCallback((bon) => {
    const arts = bon.articles || [];
    return arts.reduce((sum, a) => {
      const item = a.recu || a.commandee || {};
      return sum + ((item.prixUnitaire || item.prixAchat || 0) * (item.quantite || 0) - (item.remise || 0));
    }, 0) - (bon.remiseGlobale || 0);
  }, []);

  // Totaux/filtres
  const totalBonCourant = articles.reduce(
    (t, a) => t + (((a.commandee.prixUnitaire || a.commandee.prixAchat || 0) * (a.commandee.quantite || 0)) - (a.commandee.remise || 0)),
    0
  ) - Number(remiseGlobale || 0);

  const fournisseursUniques = Array.from(new Set(achats.map(a => a.fournisseur).filter(Boolean)));
  const medicamentsUniques = Array.from(
    new Set(
      achats
        .flatMap(a => Array.isArray(a.articles) ? a.articles.map(art => art.produit) : [])
        .filter(Boolean)
    )
  );

  const achatsFiltres = achats.filter((b) => {
    let keep = true;
    if (filterFournisseur && b.fournisseur !== filterFournisseur) keep = false;
    if (filterMedicament) {
      const hasMedicament = Array.isArray(b.articles)
        ? b.articles.some(a => a.produit === filterMedicament)
        : false;
      if (!hasMedicament) keep = false;
    }
    if (filterDateMin) {
      const bDate = b.timestamp?.toDate?.() || b.date?.toDate?.() || (typeof b.date === 'string' ? new Date(b.date) : null);
      if (!bDate || bDate < new Date(filterDateMin)) keep = false;
    }
    if (filterDateMax) {
      const bDate = b.timestamp?.toDate?.() || b.date?.toDate?.() || (typeof b.date === 'string' ? new Date(b.date) : null);
      if (!bDate || bDate > new Date(filterDateMax + "T23:59:59")) keep = false;
    }
    return keep;
  });

  // Styles CSS responsifs intégrés
  const getResponsiveStyles = useCallback(() => ({
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
    inputGroup: {
      marginBottom: isMobile ? "15px" : "25px"
    },
    label: {
      display: "block",
      marginBottom: "10px",
      fontWeight: 700,
      color: "#4a5568",
      fontSize: isMobile ? "0.8em" : "0.9em",
      textTransform: "uppercase",
      letterSpacing: "1px"
    },
    input: {
      width: "100%",
      padding: isMobile ? "12px 15px" : "15px 20px",
      border: "2px solid #e2e8f0",
      borderRadius: isMobile ? "8px" : "12px",
      fontSize: isMobile ? "0.9em" : "1em",
      fontWeight: 600,
      transition: "all 0.3s ease",
      background: "white"
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
    table: {
      width: "100%",
      borderCollapse: "collapse",
      borderRadius: isMobile ? "10px" : "20px",
      overflow: "hidden",
      boxShadow: "0 15px 40px rgba(0,0,0,0.1)",
      marginTop: isMobile ? "15px" : "25px"
    },
    tableHeader: {
      background: "linear-gradient(135deg, #2d3748 0%, #1a202c 100%)",
      color: "white"
    },
    tableCell: {
      padding: isMobile ? "10px 8px" : isTablet ? "14px 12px" : "18px 15px",
      textAlign: "center",
      borderBottom: "1px solid #e2e8f0",
      fontWeight: 600,
      fontSize: isMobile ? "0.8em" : "1em"
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
    },
    loadingOverlay: {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      color: "white",
      fontSize: isMobile ? "1.3em" : "1.8em",
      fontWeight: 700,
      backdropFilter: "blur(5px)",
      padding: "20px",
      textAlign: "center"
    },
    toggleButton: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      border: "none",
      borderRadius: isMobile ? "10px" : "15px",
      padding: isMobile ? "10px 20px" : "12px 25px",
      color: "white",
      fontWeight: 700,
      fontSize: isMobile ? "0.9em" : "1em",
      cursor: "pointer",
      boxShadow: "0 8px 25px rgba(102, 126, 234, 0.3)",
      transition: "all 0.3s ease",
      display: "flex",
      alignItems: "center",
      gap: "10px"
    },
    mobileFormGrid: {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
      gap: isMobile ? "15px" : "25px",
      marginBottom: isMobile ? "20px" : "30px"
    },
    mobileTableContainer: {
      overflow: "auto",
      WebkitOverflowScrolling: "touch",
      borderRadius: isMobile ? "10px" : "15px",
      border: "1px solid #e2e8f0"
    },
    mobileActionButtons: {
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      gap: isMobile ? "10px" : "8px",
      justifyContent: "center",
      alignItems: "stretch"
    },
    sectionTitle: {
      color: "#2d3748",
      fontSize: isMobile ? "1.3em" : isTablet ? "1.5em" : "1.8em",
      fontWeight: 800,
      marginBottom: isMobile ? "20px" : "30px",
      textAlign: "center",
      textTransform: "uppercase",
      letterSpacing: isMobile ? "1px" : "2px"
    }
  }), [isMobile, isTablet]);

  const styles = getResponsiveStyles();

  // AFFICHAGE conditionnel
  if (waiting) {
    return (
      <div style={{ 
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
      }}>
        🔄 Chargement en cours...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ 
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
      }}>
        ❌ Non connecté.
      </div>
    );
  }

  // RENDU PRINCIPAL avec les nouvelles fonctionnalités
  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        <div style={styles.header}>
          <h1 style={styles.title}>💊 Gestion des Achats - Multi-Lots</h1>
          <p style={styles.subtitle}>Interface de gestion avec traçabilité des lots et fournisseurs</p>
          {parametres.afficherCachet && !isMobile && (
            <div style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              padding: "6px 12px",
              background: "rgba(255,255,255,0.2)",
              borderRadius: "15px",
              fontSize: "0.8em",
              fontWeight: 600,
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.3)"
            }}>
              🖨️ Cachet: {parametres.typeCachet === "image" ? "Image" : "Texte"}
            </div>
          )}
        </div>

        <div style={styles.content}>
          {/* Indicateur du stock multi-lots */}
          <div style={{
            background: "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)",
            padding: "15px",
            borderRadius: "10px",
            marginBottom: "20px",
            border: "2px solid #81e6d9",
            textAlign: "center"
          }}>
            <p style={{ 
              color: "#2d3748", 
              fontSize: "0.9em", 
              fontWeight: 600,
              margin: "0 0 5px 0"
            }}>
              🏷️ <strong>Gestion Multi-Lots Activée</strong> - Traçabilité complète par lot et fournisseur
            </p>
            <p style={{ 
              color: "#4a5568", 
              fontSize: "0.8em", 
              margin: 0
            }}>
              📊 {stockEntries.length} entrées de stock • {medicaments.length} médicaments uniques
            </p>
          </div>

          {/* Aide contextuelle pour impression mobile */}
          {isMobile && isPrintReady && (
            <div style={{
              background: "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)",
              padding: "15px",
              borderRadius: "10px",
              marginBottom: "20px",
              border: "2px solid #81e6d9",
              textAlign: "center"
            }}>
              <p style={{ 
                color: "#2d3748", 
                fontSize: "0.9em", 
                fontWeight: 600,
                margin: "0 0 5px 0"
              }}>
                📱 <strong>Impression Mobile Optimisée</strong>
              </p>
              <p style={{ 
                color: "#4a5568", 
                fontSize: "0.8em", 
                margin: 0
              }}>
                Sur mobile, vous aurez le choix entre télécharger le document ou l'ouvrir dans un nouvel onglet pour imprimer.
              </p>
            </div>
          )}

          {/* Notification */}
          {notification && (
            <div style={{
              ...styles.notification,
              background: notification.type === 'success' ? 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)' :
                         notification.type === 'error' ? 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)' :
                         'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)'
            }}>
              {notification.message}
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div style={styles.loadingOverlay}>
              🔄 Traitement en cours...
            </div>
          )}

          {/* Boutons de contrôle */}
          <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "20px", flexWrap: "wrap" }}>
            <button
              style={{
                ...styles.toggleButton,
                background: showForm 
                  ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              }}
              onClick={() => setShowForm(v => !v)}
            >
              {showForm ? "➖ Masquer" : "➕ Afficher"} le formulaire
            </button>

            {/* Bouton pour afficher les détails de stock */}
            <button
              style={{
                ...styles.toggleButton,
                background: showStockDetails 
                  ? "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)"
                  : "linear-gradient(135deg, #38a169 0%, #48bb78 100%)"
              }}
              onClick={() => setShowStockDetails(v => !v)}
            >
              {showStockDetails ? "📦 Masquer" : "📦 Voir"} Stock Détaillé
            </button>
          </div>

          {/* Panneau des détails de stock */}
          {showStockDetails && (
            <div style={styles.stockDetailsCard}>
              <h3 style={{ 
                color: "#2d3748", 
                fontSize: isMobile ? "1.2em" : "1.5em", 
                fontWeight: 800, 
                marginBottom: isMobile ? "15px" : "25px",
                textAlign: "center"
              }}>
                📦 Stock Détaillé par Lots
              </h3>

              <div style={styles.mobileTableContainer}>
                <table style={styles.table}>
                  <thead style={styles.tableHeader}>
                    <tr>
                      <th style={styles.tableCell}>Médicament</th>
                      <th style={styles.tableCell}>Lot</th>
                      <th style={styles.tableCell}>Fournisseur</th>
                      <th style={styles.tableCell}>Qté</th>
                      <th style={styles.tableCell}>Prix Achat</th>
                      <th style={styles.tableCell}>Prix Vente</th>
                      <th style={styles.tableCell}>Date Exp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockEntries.filter(entry => entry.quantite > 0).length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ 
                          padding: isMobile ? "30px 15px" : "50px", 
                          textAlign: "center",
                          color: "#6b7280",
                          fontSize: isMobile ? "1em" : "1.2em",
                          fontStyle: "italic"
                        }}>
                          Aucune entrée de stock disponible 📋
                        </td>
                      </tr>
                    ) : (
                      stockEntries
                        .filter(entry => entry.quantite > 0)
                        .map((entry, index) => (
                          <tr key={entry.id} style={{ 
                            background: index % 2 === 0 ? "#f8fafc" : "white"
                          }}>
                            <td style={{...styles.tableCell, fontWeight: 700, color: "#2d3748", textAlign: "left"}}>
                              {entry.nom}
                            </td>
                            <td style={{...styles.tableCell, color: "#667eea", fontWeight: 600}}>
                              {entry.numeroLot}
                            </td>
                            <td style={{...styles.tableCell, color: "#4a5568"}}>
                              {entry.fournisseur}
                            </td>
                            <td style={{...styles.tableCell, color: "#48bb78", fontWeight: 700}}>
                              {entry.quantite}
                            </td>
                            <td style={{...styles.tableCell, color: "#667eea", fontWeight: 700}}>
                              {entry.prixAchat} DH
                            </td>
                            <td style={{...styles.tableCell, color: "#ed8936", fontWeight: 700}}>
                              {entry.prixVente} DH
                            </td>
                            <td style={{...styles.tableCell, color: entry.datePeremption && new Date(entry.datePeremption) < new Date(Date.now() + 30*24*60*60*1000) ? "#e53e3e" : "#4a5568"}}>
                              {entry.datePeremption}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Formulaire ajout/modif avec champs étendues */}
          {showForm && (
            <div style={styles.formCard}>
              <h3 style={{ 
                color: "#2d3748", 
                fontSize: isMobile ? "1.3em" : "1.6em", 
                fontWeight: 800, 
                marginBottom: isMobile ? "20px" : "30px",
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: isMobile ? "1px" : "2px"
              }}>
                {isEditing ? "✏️ Modification" : "➕ Création"} de Bon d'Achat Multi-Lots
              </h3>

              {/* Formulaire article avec champs étendus */}
              <div style={{
                background: "linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)",
                padding: isMobile ? "20px 15px" : "30px",
                borderRadius: isMobile ? "15px" : "20px",
                marginBottom: isMobile ? "20px" : "30px",
                border: "2px solid #cbd5e0"
              }}>
                <h4 style={{
                  color: "#2d3748",
                  fontSize: isMobile ? "1.1em" : "1.3em",
                  fontWeight: 700,
                  marginBottom: isMobile ? "15px" : "20px",
                  textAlign: "center"
                }}>
                  🛍️ Ajouter des Articles avec Traçabilité
                </h4>
                
                <form onSubmit={handleAddArticle}>
                  <div style={styles.mobileFormGrid}>
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Médicament</label>
                      <select 
                        style={styles.input} 
                        value={produit} 
                        onChange={e => handleProduitChange(e.target.value)} 
                        required
                      >
                        <option value="">Choisir...</option>
                        {medicaments.map(m => (
                          <option key={m.nom} value={m.nom}>
                            {m.nom} {m.exemples.length > 0 && `(${m.exemples.length} lots)`}
                          </option>
                        ))}
                        <option value="_new_">+ Nouveau médicament</option>
                      </select>
                    </div>
                    
                    {produit === "_new_" && (
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>Nouveau médicament</label>
                        <input 
                          style={styles.input} 
                          value={produitNouveau} 
                          onChange={e => setProduitNouveau(e.target.value)} 
                          required 
                          placeholder="Nom du nouveau médicament"
                        />
                      </div>
                    )}
                    
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Quantité</label>
                      <input 
                        type="number" 
                        min="1"
                        style={styles.input} 
                        value={quantite} 
                        onChange={e => setQuantite(e.target.value)} 
                        required 
                      />
                    </div>
                    
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Prix Achat (DH)</label>
                      <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        style={styles.input} 
                        value={prixUnitaire} 
                        onChange={e => setPrixUnitaire(e.target.value)} 
                        required 
                      />
                    </div>
                    
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Prix Vente (DH)</label>
                      <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        style={styles.input} 
                        value={prixVente} 
                        onChange={e => setPrixVente(e.target.value)} 
                        placeholder="Optionnel"
                      />
                    </div>
                    
                    {/* Nouveau champ : Fournisseur Article */}
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Fournisseur Article (optionnel)</label>
                      <input 
                        style={styles.input} 
                        value={fournisseurArticle} 
                        onChange={e => setFournisseurArticle(e.target.value)} 
                        placeholder="Laisser vide = fournisseur global"
                      />
                    </div>
                    
                    {/* Nouveau champ : Numéro de lot */}
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Numéro de Lot (optionnel)</label>
                      <input 
                        style={styles.input} 
                        value={numeroLot} 
                        onChange={e => setNumeroLot(e.target.value)} 
                        placeholder="Auto-généré si vide"
                      />
                    </div>
                    
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Remise (DH)</label>
                      <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        style={styles.input} 
                        value={remiseArticle} 
                        onChange={e => setRemiseArticle(e.target.value)} 
                        placeholder="0"
                      />
                    </div>
                    
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Date Expiration</label>
                      <input 
                        type="date" 
                        style={styles.input} 
                        value={datePeremption} 
                        onChange={e => setDatePeremption(e.target.value)} 
                        required 
                      />
                    </div>
                  </div>
                  
                  <div style={{ textAlign: "center" }}>
                    <button 
                      type="submit" 
                      style={{...styles.button, ...styles.successButton, width: isMobile ? "100%" : "auto"}}
                      title="Ajouter cet article avec traçabilité"
                    >
                      ➕ Ajouter avec Traçabilité
                    </button>
                  </div>
                </form>
              </div>

              {/* Tableau des articles avec informations étendues */}
              {articles.length > 0 && (
                <div style={{ marginBottom: isMobile ? "20px" : "30px" }}>
                  <h4 style={{
                    color: "#2d3748",
                    fontSize: isMobile ? "1.1em" : "1.3em",
                    fontWeight: 700,
                    marginBottom: isMobile ? "15px" : "20px",
                    textAlign: "center"
                  }}>
                    📦 Articles du Bon avec Traçabilité ({articles.length})
                  </h4>
                  
                  <div style={styles.mobileTableContainer}>
                    <table style={styles.table}>
                      <thead style={styles.tableHeader}>
                        <tr>
                          <th style={styles.tableCell}>Produit</th>
                          <th style={styles.tableCell}>Lot</th>
                          <th style={styles.tableCell}>Fournisseur</th>
                          <th style={styles.tableCell}>Qté</th>
                          {!isMobile && <th style={styles.tableCell}>Prix Achat</th>}
                          {!isMobile && <th style={styles.tableCell}>Prix Vente</th>}
                          {!isMobile && <th style={styles.tableCell}>Date Exp.</th>}
                          <th style={styles.tableCell}>Total</th>
                          <th style={styles.tableCell}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articles.map((a, i) => {
                          const item = a.commandee || {};
                          const prixAchatFinal = item.prixUnitaire || item.prixAchat || 0;
                          const totalArticle = (prixAchatFinal * (item.quantite || 0)) - (item.remise || 0);
                          
                          return (
                            <tr key={i} style={{ 
                              background: i % 2 === 0 ? "#f8fafc" : "white",
                              transition: "all 0.3s ease"
                            }}>
                              <td style={{...styles.tableCell, fontWeight: 700, color: "#2d3748", textAlign: "left"}}>
                                {a.produit}
                                {isMobile && (
                                  <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>
                                    Lot: {item.numeroLot}<br />
                                    {prixAchatFinal} DH × {item.quantite}<br />
                                    Exp: {item.datePeremption}
                                  </div>
                                )}
                              </td>
                              <td style={{...styles.tableCell, color: "#667eea", fontWeight: 600}}>
                                {item.numeroLot}
                              </td>
                              <td style={{...styles.tableCell, color: "#4a5568", fontSize: "0.8em"}}>
                                {item.fournisseurArticle || fournisseur}
                              </td>
                              <td style={{...styles.tableCell, color: "#667eea", fontWeight: 700}}>{item.quantite}</td>
                              {!isMobile && <td style={{...styles.tableCell, color: "#667eea", fontWeight: 700}}>{prixAchatFinal} DH</td>}
                              {!isMobile && <td style={{...styles.tableCell, color: "#667eea", fontWeight: 700}}>{item.prixVente} DH</td>}
                              {!isMobile && <td style={styles.tableCell}>{item.datePeremption}</td>}
                              <td style={{...styles.tableCell, color: "#48bb78", fontWeight: 800, fontSize: isMobile ? "0.9em" : "1.1em"}}>
                                {totalArticle.toFixed(2)} DH
                              </td>
                              <td style={styles.tableCell}>
                                <button 
                                  type="button" 
                                  style={{
                                    ...styles.button, 
                                    ...styles.dangerButton, 
                                    padding: isMobile ? "6px 12px" : "8px 16px", 
                                    fontSize: "0.8em",
                                    minWidth: isMobile ? "44px" : "auto",
                                    minHeight: isMobile ? "44px" : "auto"
                                  }}
                                  onClick={() => handleRemoveArticle(i)}
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr style={{ 
                          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", 
                          color: "white"
                        }}>
                          <td colSpan={isMobile ? 4 : 7} style={{...styles.tableCell, fontWeight: 800, fontSize: isMobile ? "1em" : "1.2em"}}>
                            💰 TOTAL BON
                          </td>
                          <td colSpan={2} style={{...styles.tableCell, fontWeight: 900, fontSize: isMobile ? "1.1em" : "1.3em"}}>
                            {totalBonCourant.toFixed(2)} DH
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Formulaire global du bon */}
              <form onSubmit={handleAddBon}>
                <div style={styles.mobileFormGrid}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Fournisseur Principal</label>
                    <input 
                      style={styles.input} 
                      value={fournisseur} 
                      onChange={e => setFournisseur(e.target.value)} 
                      required 
                      placeholder="Nom du fournisseur"
                    />
                  </div>
                  
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Date Achat</label>
                    <input 
                      type="date" 
                      style={styles.input} 
                      value={dateAchat} 
                      onChange={e => setDateAchat(e.target.value)} 
                      required 
                    />
                  </div>
                  
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Statut</label>
                    <select 
                      style={styles.input} 
                      value={statutPaiement} 
                      onChange={e => setStatutPaiement(e.target.value)}
                    >
                      <option value="payé">Payé</option>
                      <option value="partiel">Partiel</option>
                      <option value="impayé">Impayé</option>
                    </select>
                  </div>
                  
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Remise Globale (DH)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      style={styles.input} 
                      value={remiseGlobale} 
                      onChange={e => setRemiseGlobale(e.target.value)} 
                      placeholder="0"
                    />
                  </div>
                </div>
                
                <div style={styles.mobileActionButtons}>
                  <button 
                    type="submit" 
                    style={{
                      ...styles.button,
                      ...(isEditing ? styles.warningButton : styles.successButton),
                      width: isMobile ? "100%" : "auto"
                    }}
                    title={isEditing ? "Enregistrer les modifications" : "Créer le bon d'achat avec traçabilité"}
                    disabled={articles.length === 0}
                  >
                    {isEditing ? "✏️ Modifier Bon" : "💾 Enregistrer Bon Multi-Lots"}
                  </button>
                  
                  {isEditing && (
                    <button 
                      type="button" 
                      style={{
                        ...styles.button, 
                        ...styles.infoButton,
                        width: isMobile ? "100%" : "auto"
                      }}
                      onClick={resetForm}
                    >
                      ❌ Annuler
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Section de confirmation de réception */}
          {receptionId && (
            <div style={styles.formCard}>
              <h3 style={{ 
                color: "#2d3748", 
                fontSize: isMobile ? "1.3em" : "1.6em", 
                fontWeight: 800, 
                marginBottom: isMobile ? "20px" : "30px",
                textAlign: "center",
                textTransform: "uppercase",
                
              }}>
                ✅ Confirmer la Réception du Bon
              </h3>

              {receptionArticles.map((a, i) => (
                <div key={i} style={{
                  background: "linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)",
                  padding: isMobile ? "15px" : "20px",
                  borderRadius: "10px",
                  marginBottom: "15px",
                  border: "1px solid #cbd5e0"
                }}>
                  <h5 style={{ color: "#2d3748", fontWeight: 700, marginBottom: "10px" }}>{a.produit}</h5>
                  <p style={{ color: "#4a5568", marginBottom: "15px" }}>
                    Commandée: {a.commandee.quantite} unités à {a.commandee.prixUnitaire} DH, Lot: {a.commandee.numeroLot}, Exp: {a.commandee.datePeremption}
                  </p>

                  <div style={styles.mobileFormGrid}>
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Quantité Reçue (0 à {a.commandee.quantite})</label>
                      <input
                        type="number"
                        min="0"
                        max={a.commandee.quantite}
                        step="1"
                        style={styles.input}
                        value={a.recu.quantite}
                        onChange={e => handleUpdateReceptionArticle(i, 'quantite', e.target.value)}
                      />
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Prix Unitaire Reçu (DH)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        style={styles.input}
                        value={a.recu.prixUnitaire}
                        onChange={e => handleUpdateReceptionArticle(i, 'prixUnitaire', e.target.value)}
                      />
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Prix Vente Reçu (DH)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        style={styles.input}
                        value={a.recu.prixVente}
                        onChange={e => handleUpdateReceptionArticle(i, 'prixVente', e.target.value)}
                      />
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Date Expiration Reçue</label>
                      <input
                        type="date"
                        style={styles.input}
                        value={a.recu.datePeremption}
                        onChange={e => handleUpdateReceptionArticle(i, 'datePeremption', e.target.value)}
                      />
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Numéro de Lot Reçu</label>
                      <input
                        style={styles.input}
                        value={a.recu.numeroLot}
                        onChange={e => handleUpdateReceptionArticle(i, 'numeroLot', e.target.value)}
                      />
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Remise Reçue (DH)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        style={styles.input}
                        value={a.recu.remise}
                        onChange={e => handleUpdateReceptionArticle(i, 'remise', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div style={styles.mobileActionButtons}>
                <button 
                  style={{...styles.button, ...styles.successButton, width: isMobile ? "100%" : "auto"}}
                  onClick={handleSubmitReception}
                >
                  ✅ Soumettre Réception
                </button>
                <button 
                  style={{...styles.button, ...styles.dangerButton, width: isMobile ? "100%" : "auto"}}
                  onClick={() => {
                    setReceptionId(null);
                    setReceptionArticles([]);
                  }}
                >
                  ❌ Annuler
                </button>
              </div>
            </div>
          )}

          {/* Toggle filtres */}
          <div style={{ display: "flex", alignItems: "center", gap: "15px", marginTop: "30px", marginBottom: "20px", flexWrap: "wrap" }}>
            <button
              style={{
                ...styles.toggleButton,
                background: showFiltres 
                  ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                  : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)"
              }}
              onClick={() => setShowFiltres(v => !v)}
            >
              {showFiltres ? "➖ Masquer" : "🔍 Afficher"} les filtres
            </button>
          </div>

          {/* Filtres historiques */}
          {showFiltres && (
            <div style={styles.formCard}>
              <h4 style={{
                color: "#2d3748",
                fontSize: isMobile ? "1.1em" : "1.3em",
                fontWeight: 700,
                marginBottom: isMobile ? "20px" : "25px",
                textAlign: "center"
              }}>
                🔍 Filtres de Recherche
              </h4>
              
              <div style={styles.mobileFormGrid}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Fournisseur</label>
                  <select 
                    value={filterFournisseur} 
                    onChange={e => setFilterFournisseur(e.target.value)} 
                    style={styles.input}
                  >
                    <option value="">Tous</option>
                    {fournisseursUniques.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Médicament</label>
                  <select 
                    value={filterMedicament} 
                    onChange={e => setFilterMedicament(e.target.value)} 
                    style={styles.input}
                  >
                    <option value="">Tous</option>
                    {medicamentsUniques.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Date début</label>
                  <input 
                    type="date" 
                    value={filterDateMin} 
                    onChange={e => setFilterDateMin(e.target.value)} 
                    style={styles.input}
                  />
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Date fin</label>
                  <input 
                    type="date" 
                    value={filterDateMax} 
                    onChange={e => setFilterDateMax(e.target.value)} 
                    style={styles.input}
                  />
                </div>
              </div>
                
              {(filterFournisseur || filterMedicament || filterDateMin || filterDateMax) && (
                <div style={{ textAlign: "center", marginTop: "20px" }}>
                  <button 
                    style={{...styles.button, ...styles.dangerButton, width: isMobile ? "100%" : "auto"}}
                    type="button" 
                    onClick={() => {
                      setFilterFournisseur(""); setFilterMedicament(""); setFilterDateMin(""); setFilterDateMax("");
                    }}
                  >
                    🔄 Réinitialiser
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tableau historique */}
          <div style={{ marginTop: "30px" }}>
            <h2 style={styles.sectionTitle}>
              📋 Historique des Achats Multi-Lots ({achatsFiltres.length})
            </h2>
            
            <div style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "center",
              gap: isMobile ? "10px" : "0",
              marginBottom: "20px",
              padding: isMobile ? "15px" : "20px",
              background: "linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)",
              borderRadius: "15px",
              border: "2px solid #cbd5e0"
            }}>
              <span style={{ fontWeight: 700, color: "#4a5568", fontSize: isMobile ? "0.9em" : "1em" }}>
                💰 Total affiché: {achatsFiltres.reduce((sum, bon) => sum + getTotalBon(bon), 0).toFixed(2)} DH
              </span>
              <span style={{ fontWeight: 600, color: "#6b7280", fontSize: isMobile ? "0.8em" : "1em" }}>
                📊 {achatsFiltres.filter(b => b.statutPaiement === "payé").length} payés • {achatsFiltres.filter(b => b.statutPaiement === "impayé").length} impayés
              </span>
            </div>
            
            <div style={styles.mobileTableContainer}>
              <table style={styles.table}>
                <thead style={styles.tableHeader}>
                  <tr>
                    <th style={styles.tableCell}>Fournisseur</th>
                    {!isMobile && <th style={styles.tableCell}>Date & Heure</th>}
                    <th style={styles.tableCell}>Statut Paiement</th>
                    <th style={styles.tableCell}>Statut Réception</th>
                    <th style={styles.tableCell}>Total</th>
                    <th style={styles.tableCell}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {achatsFiltres.length === 0 ? (
                    <tr>
                      <td colSpan={isMobile ? 5 : 6} style={{ 
                        padding: isMobile ? "30px 15px" : "50px", 
                        textAlign: "center",
                        color: "#6b7280",
                        fontSize: isMobile ? "1em" : "1.2em",
                        fontStyle: "italic"
                      }}>
                        {achats.length === 0 
                          ? "Aucun bon d'achat créé pour le moment 📝"
                          : "Aucun bon ne correspond aux critères 🔍"}
                      </td>
                    </tr>
                  ) : (
                    achatsFiltres.map((b, index) => {
                      const montantTotal = getTotalBon(b);
                      
                      return (
                        <tr key={b.id} style={{ 
                          background: index % 2 === 0 ? "#f8fafc" : "white",
                          transition: "all 0.3s ease"
                        }}>
                          <td style={{...styles.tableCell, fontWeight: 600, color: "black", textAlign: "left"}}>
                            {isMobile ? (b.fournisseur || "").substring(0, 15) + ((b.fournisseur || "").length > 15 ? "..." : "") : b.fournisseur}
                            {isMobile && (
                              <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>
                                {formatDateDisplay(b.timestamp || b.date)}
                              </div>
                            )}
                          </td>
                          {!isMobile && (
                            <td style={{...styles.tableCell, color: "#4a5568", fontSize: "0.9em"}}>
                              {formatDateDisplay(b.timestamp || b.date)}
                            </td>
                          )}
                          <td style={styles.tableCell}>
                            <span style={{
                              padding: isMobile ? "4px 8px" : "6px 12px",
                              borderRadius: isMobile ? "15px" : "20px",
                              fontWeight: 600,
                              fontSize: isMobile ? "0.7em" : "0.8em",
                              textTransform: "uppercase",
                              background: b.statutPaiement === "payé" ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)" :
                                         b.statutPaiement === "partiel" ? "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)" :
                                         "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
                              color: "white"
                            }}>
                              {isMobile ? (
                                b.statutPaiement === "payé" ? "✅" : 
                                b.statutPaiement === "partiel" ? "⚠️" : "❌"
                              ) : b.statutPaiement}
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <span style={{
                              padding: isMobile ? "4px 8px" : "6px 12px",
                              borderRadius: isMobile ? "15px" : "20px",
                              fontWeight: 600,
                              fontSize: isMobile ? "0.7em" : "0.8em",
                              textTransform: "uppercase",
                              background: b.statutReception === "reçu" ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)" :
                                         b.statutReception === "partiel" ? "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)" :
                                         b.statutReception === "annulé" ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)" :
                                         "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                              color: "white"
                            }}>
                              {isMobile ? (
                                b.statutReception === "reçu" ? "✅" : 
                                b.statutReception === "partiel" ? "⚠️" : 
                                b.statutReception === "annulé" ? "❌" : "⌛"
                              ) : b.statutReception || "en_attente"}
                            </span>
                          </td>
                          <td style={{
                            ...styles.tableCell, 
                            color: "#667eea", 
                            fontWeight: 700, 
                            fontSize: isMobile ? "0.9em" : "1.1em",
                            textAlign: "right"
                          }}>
                            {montantTotal.toFixed(2)} DH
                          </td>
                          <td style={styles.tableCell}>
                            <div style={styles.mobileActionButtons}>
                              <button 
                                style={{
                                  ...styles.button, 
                                  background: "linear-gradient(135deg, #805ad5 0%, #6b46c1 100%)", 
                                  padding: isMobile ? "8px 12px" : "8px 12px", 
                                  fontSize: isMobile ? "0.8em" : "0.8em",
                                  minWidth: isMobile ? "44px" : "auto",
                                  minHeight: isMobile ? "44px" : "auto"
                                }}
                                title="Imprimer Bon d'Achat Multi-Lots"
                                onClick={() => handlePrintBon(b)}
                              >
                                🖨️
                              </button>
                              {b.statutReception === "en_attente" && (
                                <>
                                  <button 
                                    style={{
                                      ...styles.button, 
                                      ...styles.warningButton, 
                                      padding: isMobile ? "8px 12px" : "8px 12px", 
                                      fontSize: isMobile ? "0.8em" : "0.8em",
                                      minWidth: isMobile ? "44px" : "auto",
                                      minHeight: isMobile ? "44px" : "auto"
                                    }}
                                    title="Modifier"
                                    onClick={() => handleEditBon(b)}
                                  >
                                    ✏️
                                  </button>
                                  <button 
                                    style={{
                                      ...styles.button, 
                                      ...styles.successButton, 
                                      padding: isMobile ? "8px 12px" : "8px 12px", 
                                      fontSize: isMobile ? "0.8em" : "0.8em",
                                      minWidth: isMobile ? "44px" : "auto",
                                      minHeight: isMobile ? "44px" : "auto"
                                    }}
                                    title="Confirmer Réception"
                                    onClick={() => handleStartReception(b)}
                                  >
                                    ✅
                                  </button>
                                </>
                              )}
                              <button 
                                style={{
                                  ...styles.button, 
                                  ...styles.dangerButton, 
                                  padding: isMobile ? "8px 12px" : "8px 12px", 
                                  fontSize: isMobile ? "0.8em" : "0.8em",
                                  minWidth: isMobile ? "44px" : "auto",
                                  minHeight: isMobile ? "44px" : "auto"
                                }}
                                title="Supprimer"
                                onClick={() => handleDeleteBon(b)}
                              >
                                🗑️
                              </button>
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
        </div>
      </div>
    </div>
  );
}
import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  where,
  Timestamp,
  orderBy,
  limit,
  getDoc,
} from "firebase/firestore";

/**
 * Composant principal de gestion des ventes avec support multi-lots
 * Gère l'ajout, modification, suppression et l'impression des ventes avec cachet image
 * Intègre la gestion du stock multi-lots et la traçabilité
 */
export default function Ventes() {
  const { user, societeId, loading } = useUserRole();

  // ============ ÉTATS FORMULAIRES ============
  // Informations de la vente
  const [client, setClient] = useState("");
  const [dateVente, setDateVente] = useState("");
  const [statutPaiement, setStatutPaiement] = useState("payé");
  const [modePaiement, setModePaiement] = useState("Espèces");
  const [notesVente, setNotesVente] = useState("");

  // Article en cours d'ajout
  const [produit, setProduit] = useState("");
  const [produitNouveau, setProduitNouveau] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [remiseArticle, setRemiseArticle] = useState(0);
  const [selectedLot, setSelectedLot] = useState(""); // 🆕 Lot sélectionné
  const [showLotSelector, setShowLotSelector] = useState(false); // 🆕 Afficher sélecteur de lots

  // ============ ÉTATS DONNÉES ============
  const [articles, setArticles] = useState([]);
  const [ventes, setVentes] = useState([]);
  const [medicaments, setMedicaments] = useState([]);
  const [stockEntries, setStockEntries] = useState([]); // 🆕 Entrées multi-lots
  const [availableLots, setAvailableLots] = useState([]); // 🆕 Lots disponibles pour le produit sélectionné
  const [parametres, setParametres] = useState({ 
    entete: "", 
    pied: "",
    cachetTexte: "Cachet Société",
    cachetImage: null,
    afficherCachet: true,
    typeCachet: "texte",
    tailleCachet: 120
  });
  const [clients, setClients] = useState([]);

  // ============ ÉTATS CONTRÔLE ============
  const [editId, setEditId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ============ ÉTATS FILTRES ============
  const [filterClient, setFilterClient] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // ============ ÉTATS UI ============
  const [showForm, setShowForm] = useState(false);
  const [showFiltres, setShowFiltres] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [selectedVente, setSelectedVente] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [viewMode, setViewMode] = useState("auto"); // 🆕 "auto", "lots", "traditional"

  // ============ VÉRIFICATION CHARGEMENT ============
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // ============ FONCTIONS DE CHARGEMENT DONNÉES ============
  /**
   * Charge les paramètres d'impression et de cachet avec support d'images
   */
  const fetchParametres = useCallback(async () => {
    if (!societeId) return;
    try {
      // Charger les paramètres documents
      const docRef = doc(db, "societe", societeId, "parametres", "documents");
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setParametres({
          entete: data.entete || "PHARMACIE - BON DE VENTE",
          pied: data.pied || "Merci de votre confiance",
          cachetTexte: data.cachetTexte || "Cachet Société",
          cachetImage: data.cachetImage || null,
          afficherCachet: data.afficherCachet !== false,
          typeCachet: data.typeCachet || "texte",
          tailleCachet: data.tailleCachet || 120
        });
      } else {
        // Essayer l'ancienne méthode si le nouveau format n'existe pas
        const snap = await getDocs(collection(db, "societe", societeId, "parametres"));
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setParametres({ 
            entete: data.entete || "PHARMACIE - BON DE VENTE", 
            pied: data.pied || "Merci de votre confiance",
            cachetTexte: data.cachetTexte || "Cachet Société",
            cachetImage: data.cachetImage || null,
            afficherCachet: data.afficherCachet !== false,
            typeCachet: data.typeCachet || "texte",
            tailleCachet: data.tailleCachet || 120
          });
        }
      }
    } catch (err) {
      console.error("Erreur chargement paramètres:", err);
    }
  }, [societeId]);

  /**
   * Charge l'historique des ventes
   */
  const fetchVentes = useCallback(async () => {
    if (!societeId) return setVentes([]);
    try {
      const q = query(
        collection(db, "societe", societeId, "ventes"),
        orderBy("date", "desc"),
        limit(500)
      );
      const snap = await getDocs(q);
      const arr = [];
      snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      setVentes(arr);
      
      // Extraire les clients uniques
      const uniqueClients = [...new Set(arr.map(v => v.client).filter(Boolean))];
      setClients(uniqueClients);
    } catch (err) {
      console.error("Erreur chargement ventes:", err);
      setError("Erreur lors du chargement des ventes");
    }
  }, [societeId]);

  // 🆕 Charge les entrées de stock multi-lots
  const fetchStockEntries = useCallback(async () => {
    if (!societeId) return setStockEntries([]);
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "stock_entries"));
      const arr = [];
      snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      // Trier par nom puis par date d'expiration
      arr.sort((a, b) => {
        if (a.nom !== b.nom) return a.nom.localeCompare(b.nom);
        return new Date(a.datePeremption || 0) - new Date(b.datePeremption || 0);
      });
      setStockEntries(arr);
    } catch (err) {
      console.error("Erreur chargement stock entries:", err);
    }
  }, [societeId]);

  /**
   * Charge le stock de médicaments traditionnel
   */
  const fetchMedicaments = useCallback(async () => {
    if (!societeId) return setMedicaments([]);
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "stock"));
      const arr = [];
      snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      setMedicaments(arr);
    } catch (err) {
      console.error("Erreur chargement médicaments:", err);
      setError("Erreur lors du chargement du stock");
    }
  }, [societeId]);

  // 🔧 CORRECTION: Obtient tous les médicaments disponibles SANS DOUBLONS
  const getAllAvailableMedicaments = useMemo(() => {
    const medicamentMap = new Map();
    
    // D'abord, ajouter les médicaments avec lots (priorité aux lots)
    const lotMeds = stockEntries.filter(e => e.quantite > 0);
    const lotGroups = {};
    
    // Grouper les lots par nom de médicament
    lotMeds.forEach(entry => {
      if (!lotGroups[entry.nom]) {
        lotGroups[entry.nom] = [];
      }
      lotGroups[entry.nom].push(entry);
    });
    
    // Ajouter les médicaments avec lots
    Object.keys(lotGroups).forEach(nom => {
      const lots = lotGroups[nom];
      const totalQuantity = lots.reduce((sum, lot) => sum + lot.quantite, 0);
      const lastPrice = lots[0].prixVente || 0;
      
      medicamentMap.set(nom, {
        nom,
        quantiteTotal: totalQuantity,
        hasLots: true,
        hasTraditional: false,
        lastPrice,
        source: 'lots'
      });
    });
    
    // Ensuite, ajouter les médicaments traditionnels SEULEMENT s'ils n'ont pas de lots
    const traditionalMeds = medicaments.filter(m => m.quantite > 0);
    traditionalMeds.forEach(med => {
      if (!medicamentMap.has(med.nom)) {
        // Ce médicament n'a pas de lots, on l'ajoute depuis le stock traditionnel
        medicamentMap.set(med.nom, {
          nom: med.nom,
          quantiteTotal: med.quantite,
          hasLots: false,
          hasTraditional: true,
          lastPrice: med.prixVente || 0,
          source: 'traditional'
        });
      } else {
        // Le médicament a déjà des lots, on ne fait rien pour éviter le doublon
        // On peut éventuellement marquer qu'il existe aussi en traditionnel
        const existing = medicamentMap.get(med.nom);
        existing.hasTraditional = true;
        // On ne modifie PAS la quantité pour éviter le doublon
      }
    });
    
    // Convertir en tableau et trier par nom
    return Array.from(medicamentMap.values())
      .filter(m => m.quantiteTotal > 0)
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [medicaments, stockEntries]);

  // ============ GESTION DU FORMULAIRE ============
  /**
   * 🆕 Auto-remplissage du prix et gestion des lots lors de la sélection d'un produit
   */
  const handleProduitChange = (value) => {
    setProduit(value);
    setSelectedLot("");
    setAvailableLots([]);
    setShowLotSelector(false);
    
    if (value !== "_new_" && value) {
      // Récupérer les lots disponibles pour ce produit
      const lotsForProduct = stockEntries.filter(entry => 
        entry.nom === value && entry.quantite > 0
      );
      
      setAvailableLots(lotsForProduct);
      
      // Si des lots existent, afficher le sélecteur
      if (lotsForProduct.length > 0) {
        setShowLotSelector(true);
        // Prendre le prix du premier lot comme suggestion
        setPrixUnitaire(lotsForProduct[0].prixVente || 0);
      } else {
        // Fallback sur le stock traditionnel
        const med = medicaments.find((m) => m.nom === value);
        if (med) {
          setPrixUnitaire(med.prixVente || 0);
        }
      }
    } else {
      setPrixUnitaire("");
    }
  };

  // 🆕 Gestion de la sélection d'un lot spécifique
  const handleLotSelection = (lotId) => {
    setSelectedLot(lotId);
    const selectedLotData = availableLots.find(lot => lot.id === lotId);
    if (selectedLotData) {
      setPrixUnitaire(selectedLotData.prixVente || 0);
    }
  };

  /**
   * Ajoute un article à la vente en cours avec gestion multi-lots
   */
  const handleAddArticle = (e) => {
    e.preventDefault();
    const nomProduitFinal = produit === "_new_" ? produitNouveau : produit;
    
    // Validation
    if (!nomProduitFinal || !quantite || !prixUnitaire) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }

    let stockSource = null;
    let maxQuantity = 0;
    
    // Déterminer la source de stock et vérifier la disponibilité
    if (selectedLot) {
      // Vente depuis un lot spécifique
      const lotData = availableLots.find(lot => lot.id === selectedLot);
      if (lotData) {
        stockSource = { type: "lot", data: lotData };
        maxQuantity = lotData.quantite;
      }
    } else {
      // Vente depuis stock traditionnel ou auto-sélection
      const availableMed = getAllAvailableMedicaments.find(m => m.nom === nomProduitFinal);
      if (availableMed) {
        maxQuantity = availableMed.quantiteTotal;
        // Si des lots sont disponibles, prendre le premier (FIFO)
        if (availableMed.hasLots) {
          const firstLot = availableLots[0];
          if (firstLot) {
            stockSource = { type: "lot", data: firstLot };
            maxQuantity = firstLot.quantite;
          }
        } else {
          // Stock traditionnel
          const medStock = medicaments.find(m => m.nom === nomProduitFinal);
          if (medStock) {
            stockSource = { type: "traditional", data: medStock };
            maxQuantity = medStock.quantite;
          }
        }
      }
    }

    // Vérifier le stock disponible
    if (!stockSource || maxQuantity < quantite) {
      setError(`Stock insuffisant ! Disponible: ${maxQuantity}`);
      return;
    }

    const articleData = {
      produit: nomProduitFinal,
      quantite: Number(quantite),
      prixUnitaire: Number(prixUnitaire),
      remise: Number(remiseArticle),
      dateAjout: new Date().toISOString(),
      stockSource: stockSource, // 🆕 Informations sur la source du stock
    };

    // 🆕 Ajouter les informations de traçabilité si c'est un lot
    if (stockSource.type === "lot") {
      articleData.numeroLot = stockSource.data.numeroLot;
      articleData.fournisseur = stockSource.data.fournisseur;
      articleData.datePeremption = stockSource.data.datePeremption;
      articleData.stockEntryId = stockSource.data.id;
    }

    setArticles([...articles, articleData]);

    // Réinitialiser le formulaire article
    setProduit("");
    setProduitNouveau("");
    setQuantite(1);
    setPrixUnitaire("");
    setRemiseArticle(0);
    setSelectedLot("");
    setAvailableLots([]);
    setShowLotSelector(false);
    setError("");
  };

  /**
   * Retire un article de la vente en cours
   */
  const handleRemoveArticle = (idx) => {
    setArticles(articles.filter((_, i) => i !== idx));
  };

  /**
   * Modifie la quantité d'un article
   */
  const handleUpdateArticleQuantity = (idx, newQuantity) => {
    const updatedArticles = [...articles];
    const article = updatedArticles[idx];
    
    // Vérifier la disponibilité en stock
    if (article.stockSource) {
      const maxQuantity = article.stockSource.data.quantite;
      if (newQuantity > maxQuantity) {
        setError(`Quantité maximum pour cet article: ${maxQuantity}`);
        return;
      }
    }
    
    updatedArticles[idx].quantite = Number(newQuantity);
    setArticles(updatedArticles);
    setError("");
  };

  // ============ GESTION DES VENTES ============
  /**
   * Enregistre ou modifie une vente avec gestion multi-lots
   */
  const handleAddVente = async (e) => {
    e.preventDefault();
    
    // Validations
    if (!user || !societeId) {
      setError("Utilisateur ou société non connecté !");
      return;
    }
    
    if (!client || !dateVente || articles.length === 0) {
      setError("Veuillez remplir tous les champs et ajouter au moins un article");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      // Calculer les totaux
      const montantTotal = articles.reduce(
        (sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise),
        0
      );
      
      const remiseTotal = articles.reduce((sum, a) => sum + a.remise, 0);

      let venteRef = null;
      const venteData = {
        client,
        date: Timestamp.fromDate(new Date(dateVente)),
        statutPaiement,
        modePaiement,
        articles: articles.map(a => ({
          produit: a.produit,
          quantite: a.quantite,
          prixUnitaire: a.prixUnitaire,
          remise: a.remise,
          // 🆕 Informations de traçabilité multi-lots
          numeroLot: a.numeroLot || null,
          fournisseur: a.fournisseur || null,
          datePeremption: a.datePeremption || null,
          stockEntryId: a.stockEntryId || null,
          stockSourceType: a.stockSource?.type || null
        })),
        montantTotal,
        remiseTotal,
        notes: notesVente,
        updatedAt: Timestamp.now(),
        updatedBy: user.email,
      };

      if (isEditing && editId) {
        // ===== MODIFICATION D'UNE VENTE =====
        const oldVente = ventes.find((v) => v.id === editId);
        
        // Restaurer le stock de l'ancienne vente
        await updateStockOnCancel(oldVente);
        
        // Mettre à jour la vente
        await updateDoc(doc(db, "societe", societeId, "ventes", editId), venteData);
        venteRef = { id: editId };
        
        // Appliquer le nouveau stock
        await updateStockOnSell({ client, articles });
        
        // Traçabilité de la modification
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "vente",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            client,
            montant: montantTotal,
            articles: articles.length,
            action: "modification",
            venteId: editId,
            changes: "Modification complète de la vente",
            articlesAvecLots: articles.filter(a => a.numeroLot).length
          }
        });
        
        setSuccess("Vente modifiée avec succès !");
        
      } else {
        // ===== NOUVELLE VENTE =====
        venteData.createdAt = Timestamp.now();
        venteData.createdBy = user.email;
        
        const added = await addDoc(
          collection(db, "societe", societeId, "ventes"),
          venteData
        );
        venteRef = added;
        
        // Mettre à jour le stock
        await updateStockOnSell({ client, articles });
        
        // Traçabilité de la création
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "vente",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            client,
            montant: montantTotal,
            articles: articles.length,
            action: "création",
            venteId: added.id,
            articlesAvecLots: articles.filter(a => a.numeroLot).length
          }
        });
        
        setSuccess("Vente enregistrée avec succès !");
      }

      // Gestion du paiement automatique
      if (statutPaiement === "payé" && venteRef) {
        await addDoc(collection(db, "societe", societeId, "paiements"), {
          docId: venteRef.id,
          montant: montantTotal,
          mode: modePaiement,
          type: "ventes",
          date: Timestamp.now(),
          createdBy: user.email
        });

        // Traçabilité du paiement
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "paiement",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            mode: modePaiement,
            type: "ventes",
            montant: montantTotal,
            client,
            paiementAuto: true,
            action: "création"
          }
        });
      }

      // Réinitialiser et recharger
      resetForm();
      await fetchVentes();
      await fetchMedicaments();
      await fetchStockEntries(); // 🆕 Recharger les entrées
      
      // Fermer le formulaire après succès
      setTimeout(() => {
        setShowForm(false);
        setSuccess("");
      }, 2000);
      
    } catch (err) {
      console.error("Erreur lors de l'enregistrement:", err);
      setError("Erreur lors de l'enregistrement de la vente");
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Prépare la modification d'une vente
   */
  const handleEditVente = (vente) => {
    setEditId(vente.id);
    setIsEditing(true);
    setClient(vente.client || "");
    setDateVente(vente.date?.toDate().toISOString().split("T")[0] || "");
    setStatutPaiement(vente.statutPaiement || "payé");
    setModePaiement(vente.modePaiement || "Espèces");
    setNotesVente(vente.notes || "");
    
    // 🆕 Reconstituer les articles avec leurs informations de source
    const reconstructedArticles = (vente.articles || []).map(a => ({
      produit: a.produit,
      quantite: a.quantite,
      prixUnitaire: a.prixUnitaire,
      remise: a.remise || 0,
      numeroLot: a.numeroLot || null,
      fournisseur: a.fournisseur || null,
      datePeremption: a.datePeremption || null,
      stockEntryId: a.stockEntryId || null,
      stockSource: a.stockEntryId ? {
        type: "lot",
        data: stockEntries.find(e => e.id === a.stockEntryId) || {}
      } : {
        type: "traditional",
        data: medicaments.find(m => m.nom === a.produit) || {}
      }
    }));
    
    setArticles(reconstructedArticles);
    setShowForm(true);
    setError("");
    setSuccess("");
  };

  /**
   * Supprime une vente avec restauration du stock multi-lots
   */
  const handleDeleteVente = async (vente) => {
    if (!user || !societeId) {
      setError("Utilisateur non connecté !");
      return;
    }

    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer la vente de ${vente.client} ?`)) {
      return;
    }

    try {
      // Restaurer le stock
      await updateStockOnCancel(vente);
      
      // Supprimer la vente
      await deleteDoc(doc(db, "societe", societeId, "ventes", vente.id));
      
      // Calculer le montant pour la traçabilité
      const montant = (Array.isArray(vente.articles) ? vente.articles : [])
        .reduce((sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise), 0);
      
      // Traçabilité de la suppression
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "vente",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          client: vente.client,
          montant,
          articles: (vente.articles || []).length,
          action: "suppression",
          venteId: vente.id,
          articlesAvecLots: (vente.articles || []).filter(a => a.numeroLot).length
        }
      });

      setSuccess("Vente supprimée avec succès");
      await fetchVentes();
      await fetchStockEntries(); // 🆕 Recharger les entrées
      
      setTimeout(() => setSuccess(""), 3000);
      
    } catch (err) {
      console.error("Erreur lors de la suppression:", err);
      setError("Erreur lors de la suppression de la vente");
    }
  };

  /**
   * Duplique une vente
   */
  const handleDuplicateVente = (vente) => {
    setEditId(null);
    setIsEditing(false);
    setClient(vente.client || "");
    setDateVente(new Date().toISOString().split("T")[0]);
    setStatutPaiement("payé");
    setModePaiement(vente.modePaiement || "Espèces");
    setNotesVente("");
    
    // 🆕 Dupliquer les articles en vérifiant la disponibilité actuelle
    const duplicatedArticles = (vente.articles || []).map(a => {
      const baseArticle = {
        produit: a.produit,
        quantite: a.quantite,
        prixUnitaire: a.prixUnitaire,
        remise: a.remise || 0,
        numeroLot: a.numeroLot || null,
        fournisseur: a.fournisseur || null,
        datePeremption: a.datePeremption || null
      };
      
      // Essayer de retrouver la source de stock actuelle
      if (a.stockEntryId) {
        const entry = stockEntries.find(e => e.id === a.stockEntryId);
        if (entry && entry.quantite > 0) {
          baseArticle.stockSource = { type: "lot", data: entry };
          baseArticle.stockEntryId = entry.id;
        }
      }
      
      return baseArticle;
    });
    
    setArticles(duplicatedArticles);
    setShowForm(true);
    setSuccess("Vente dupliquée - Vérifiez la disponibilité des stocks");
  };

  // ============ GESTION DU STOCK MULTI-LOTS ============
  /**
   * 🆕 Met à jour le stock après une vente (multi-lots + traditionnel)
   */
  const updateStockOnSell = async (vente) => {
    if (!user || !societeId) return;
    
    for (const art of vente.articles || []) {
      try {
        if (art.stockSource?.type === "lot" && art.stockEntryId) {
          // Décrémenter du lot spécifique
          const entryRef = doc(db, "societe", societeId, "stock_entries", art.stockEntryId);
          const entrySnap = await getDoc(entryRef);
          
          if (entrySnap.exists()) {
            const currentEntry = entrySnap.data();
            const newQuantity = Math.max(0, Number(currentEntry.quantite || 0) - Number(art.quantite || 0));
            
            await updateDoc(entryRef, {
              quantite: newQuantity,
              modifiePar: user.uid,
              modifieParEmail: user.email,
              modifieLe: Timestamp.now(),
              derniereVente: Timestamp.now()
            });
          }
        } else if (art.stockSource?.type === "traditional") {
          // Décrémenter du stock traditionnel SEULEMENT si c'est vraiment traditionnel
          const stockRef = collection(db, "societe", societeId, "stock");
          const q = query(stockRef, where("nom", "==", art.produit || ""));
          const stockSnap = await getDocs(q);
          
          if (!stockSnap.empty) {
            const docId = stockSnap.docs[0].id;
            const current = stockSnap.docs[0].data();
            const newQuantity = Math.max(0, Number(current.quantite || 0) - Number(art.quantite || 0));
            
            await updateDoc(doc(db, "societe", societeId, "stock", docId), {
              quantite: newQuantity,
              modifiePar: user.uid,
              modifieParEmail: user.email,
              modifieLe: Timestamp.now(),
              derniereVente: Timestamp.now()
            });

            // Alerte stock faible
            if (newQuantity < (current.seuilAlerte || 10)) {
              await addDoc(collection(db, "societe", societeId, "alertes"), {
                type: "stock_faible",
                produit: art.produit,
                quantiteRestante: newQuantity,
                date: Timestamp.now(),
                lu: false
              });
            }
          }
        }
      } catch (error) {
        console.error(`Erreur lors de la mise à jour du stock pour ${art.produit}:`, error);
      }
    }
  };

  /**
   * 🆕 Restaure le stock après annulation d'une vente (multi-lots + traditionnel)
   */
  const updateStockOnCancel = async (vente) => {
    if (!user || !societeId) return;
    
    for (const art of vente.articles || []) {
      try {
        if (art.stockEntryId) {
          // Restaurer dans le lot spécifique
          const entryRef = doc(db, "societe", societeId, "stock_entries", art.stockEntryId);
          const entrySnap = await getDoc(entryRef);
          
          if (entrySnap.exists()) {
            const currentEntry = entrySnap.data();
            await updateDoc(entryRef, {
              quantite: Number(currentEntry.quantite || 0) + Number(art.quantite || 0),
              modifiePar: user.uid,
              modifieParEmail: user.email,
              modifieLe: Timestamp.now()
            });
          }
        } else if (art.stockSourceType === "traditional" || !art.stockEntryId) {
          // Restaurer dans le stock traditionnel SEULEMENT si c'était vraiment du stock traditionnel
          const stockRef = collection(db, "societe", societeId, "stock");
          const q = query(stockRef, where("nom", "==", art.produit || ""));
          const stockSnap = await getDocs(q);
          
          if (!stockSnap.empty) {
            const docId = stockSnap.docs[0].id;
            const current = stockSnap.docs[0].data();
            
            await updateDoc(doc(db, "societe", societeId, "stock", docId), {
              quantite: Number(current.quantite || 0) + Number(art.quantite || 0),
              modifiePar: user.uid,
              modifieParEmail: user.email,
              modifieLe: Timestamp.now()
            });
          }
        }
      } catch (error) {
        console.error(`Erreur lors de la restauration du stock pour ${art.produit}:`, error);
      }
    }
  };

  // ============ GÉNÉRATION DU CACHET ============
  /**
   * Génère le HTML du cachet selon le type (image ou texte)
   */
  const generateCachetHtml = () => {
    if (!parametres.afficherCachet) return '';
    
    const taille = parametres.tailleCachet || 120;
    
    if (parametres.typeCachet === "image" && parametres.cachetImage) {
      return `
        <div style="text-align: center; flex: 1;">
          <img 
            src="${parametres.cachetImage}" 
            alt="Cachet de l'entreprise"
            style="
              max-width: ${taille}px;
              max-height: ${taille}px;
              border-radius: 8px;
              box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
              object-fit: contain;
              background: white;
              padding: 5px;
            "
            onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"
          />
          <div class="cachet-fallback" style="
            display: none;
            border: 3px solid #1976d2;
            color: #1976d2;
            border-radius: 50%;
            padding: 20px 30px;
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            background: rgba(25, 118, 210, 0.05);
            box-shadow: 0 4px 8px rgba(25, 118, 210, 0.2);
            transform: rotate(-5deg);
            position: relative;
            max-width: ${taille}px;
            margin: 0 auto;
          ">
            ${parametres.cachetTexte || "Cachet Société"}
          </div>
        </div>
      `;
    } else {
      return `
        <div style="text-align: center; flex: 1;">
          <div class="cachet" style="
            display: inline-block;
            border: 3px solid #1976d2;
            color: #1976d2;
            border-radius: 50%;
            padding: 25px 40px;
            font-size: 16px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            background: rgba(25, 118, 210, 0.05);
            box-shadow: 0 4px 8px rgba(25, 118, 210, 0.2);
            transform: rotate(-5deg);
            position: relative;
            z-index: 2;
            max-width: ${taille}px;
          ">
            ${parametres.cachetTexte || "Cachet Société"}
          </div>
        </div>
      `;
    }
  };

  // ============ IMPRESSION AVEC CACHET ET MULTI-LOTS ============
  /**
   * 🆕 Imprime un bon de vente avec informations multi-lots et cachet professionnel
   */
  const handlePrintVente = (vente) => {
    const articles = Array.isArray(vente.articles) ? vente.articles : [];
    const total = vente.montantTotal || articles.reduce(
      (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
      0
    );
    
    const cachetHtml = generateCachetHtml();
    const hasLotInfo = articles.some(a => a.numeroLot || a.fournisseur);
    
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Bon de Vente Multi-Lots N°${vente.id.slice(-6).toUpperCase()}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              padding: 20px;
              color: #333;
              line-height: 1.6;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding: 20px;
              border-bottom: 3px solid #2563eb;
              background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
              border-radius: 8px;
            }
            .header h1 { 
              color: #2563eb;
              margin-bottom: 10px;
              font-size: 24px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .header h2 {
              color: #1e40af;
              font-size: 20px;
              margin-top: 10px;
            }
            ${hasLotInfo ? `
            .header .multi-lot-indicator {
              background: #dcfce7;
              color: #16a34a;
              padding: 8px 16px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: 600;
              margin-top: 10px;
              display: inline-block;
            }` : ''}
            .info-section {
              display: flex;
              justify-content: space-between;
              margin-bottom: 30px;
              padding: 20px;
              background: #f8f9fa;
              border-radius: 8px;
              border-left: 5px solid #2563eb;
            }
            .info-group {
              flex: 1;
            }
            .info-group p {
              margin: 8px 0;
              font-size: 15px;
            }
            .info-group strong {
              color: #2563eb;
              font-weight: 600;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            th {
              background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
              color: white;
              padding: 15px 12px;
              text-align: left;
              font-weight: 600;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            td {
              padding: 12px;
              border-bottom: 1px solid #e5e7eb;
              font-size: 14px;
            }
            tr:nth-child(even) {
              background: #f9fafb;
            }
            tr:hover {
              background: #f3f4f6;
            }
            .lot-info {
              font-size: 12px;
              color: #6b7280;
              margin-top: 4px;
              padding: 4px 8px;
              background: #f3f4f6;
              border-radius: 4px;
              border-left: 3px solid #10b981;
            }
            .lot-badge {
              background: #dcfce7;
              color: #16a34a;
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 600;
              margin-right: 4px;
            }
            .supplier-badge {
              background: #dbeafe;
              color: #2563eb;
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 600;
            }
            .expiry-warning {
              color: #dc2626;
              font-weight: 600;
            }
            .expiry-soon {
              color: #d97706;
              font-weight: 600;
            }
            .totals {
              margin-top: 30px;
              padding: 25px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border-radius: 8px;
              box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              margin: 12px 0;
              font-size: 16px;
            }
            .totals-row.grand-total {
              font-size: 22px;
              font-weight: bold;
              padding-top: 15px;
              border-top: 2px solid rgba(255,255,255,0.3);
              margin-top: 15px;
            }
            .signature-section {
              margin-top: 50px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .signature-box {
              text-align: center;
              width: 200px;
            }
            .signature-line {
              border-bottom: 2px solid #333;
              margin-bottom: 8px;
              height: 50px;
            }
            .signature-label {
              font-weight: 600;
              color: #4b5563;
              font-size: 14px;
            }
            .footer {
              text-align: center;
              margin-top: 50px;
              padding: 25px;
              border-top: 3px solid #2563eb;
              background: #f8fafc;
              border-radius: 8px;
              position: relative;
            }
            .notes-section {
              margin-top: 25px;
              padding: 20px;
              background: #fef3c7;
              border-left: 5px solid #f59e0b;
              border-radius: 0 8px 8px 0;
            }
            .notes-section strong {
              color: #92400e;
              display: block;
              margin-bottom: 8px;
            }
            .print-info {
              color: #6b7280;
              font-size: 12px;
              margin-top: 15px;
              font-style: italic;
            }
            .watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-45deg);
              font-size: 80px;
              color: rgba(37, 99, 235, 0.05);
              font-weight: bold;
              z-index: 0;
              pointer-events: none;
            }
            @media print {
              body { padding: 10px; }
              .no-print { display: none; }
              .header { break-inside: avoid; }
              table { break-inside: avoid; }
              .signature-section { page-break-inside: avoid; }
              .footer { page-break-inside: avoid; }
              img { 
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="watermark">VENTE ${hasLotInfo ? 'MULTI-LOTS' : ''}</div>
          
          <div class="header">
            <h1>${parametres.entete || "PHARMACIE - BON DE VENTE"}</h1>
            <h2>BON DE VENTE N°${vente.id.slice(-6).toUpperCase()}</h2>
            ${hasLotInfo ? '<div class="multi-lot-indicator">🏷️ Vente avec traçabilité multi-lots</div>' : ''}
          </div>
          
          <div class="info-section">
            <div class="info-group">
              <p><strong>Client:</strong> ${vente.client || "Client comptoir"}</p>
              <p><strong>Date de vente:</strong> ${vente.date?.toDate().toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</p>
            </div>
            <div class="info-group">
              <p><strong>Statut paiement:</strong> 
                <span style="color: ${vente.statutPaiement === 'payé' ? '#16a34a' : vente.statutPaiement === 'partiel' ? '#ea580c' : '#dc2626'};">
                  ${vente.statutPaiement === 'payé' ? '✅ Payé' : vente.statutPaiement === 'partiel' ? '⏳ Partiel' : '❌ Impayé'}
                </span>
              </p>
              <p><strong>Mode de paiement:</strong> ${vente.modePaiement || "Espèces"}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Produit${hasLotInfo ? ' / Traçabilité' : ''}</th>
                <th style="text-align: center; width: 80px;">Quantité</th>
                <th style="text-align: right; width: 100px;">Prix Unit.</th>
                <th style="text-align: right; width: 80px;">Remise</th>
                <th style="text-align: right; width: 100px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${articles.map((a, index) => {
                const isExpired = a.datePeremption && new Date(a.datePeremption) < new Date();
                const isExpiringSoon = a.datePeremption && !isExpired && 
                  new Date(a.datePeremption) <= new Date(Date.now() + 30*24*60*60*1000);
                
                return `
                <tr>
                  <td>
                    <strong>${a.produit || ""}</strong>
                    ${a.numeroLot || a.fournisseur || a.datePeremption ? `
                      <div class="lot-info">
                        ${a.numeroLot ? `<span class="lot-badge">Lot: ${a.numeroLot}</span>` : ''}
                        ${a.fournisseur ? `<span class="supplier-badge">Fournisseur: ${a.fournisseur}</span>` : ''}
                        ${a.datePeremption ? `
                          <div style="margin-top: 4px;">
                            📅 Expiration: 
                            <span class="${isExpired ? 'expiry-warning' : isExpiringSoon ? 'expiry-soon' : ''}">
                              ${a.datePeremption}
                              ${isExpired ? ' ⚠️ EXPIRÉ' : isExpiringSoon ? ' ⏰ Expire bientôt' : ''}
                            </span>
                          </div>
                        ` : ''}
                      </div>
                    ` : ''}
                  </td>
                  <td style="text-align: center; font-weight: 600;">${a.quantite || 0}</td>
                  <td style="text-align: right;">${(a.prixUnitaire || 0).toFixed(2)} DH</td>
                  <td style="text-align: right; color: #dc2626;">${(a.remise || 0).toFixed(2)} DH</td>
                  <td style="text-align: right; font-weight: 600; color: #059669;">
                    ${((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)).toFixed(2)} DH
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
          
          <div class="totals">
            <div class="totals-row">
              <span>Sous-total articles:</span>
              <span>${(total + (vente.remiseTotal || 0)).toFixed(2)} DH</span>
            </div>
            ${vente.remiseTotal ? `
              <div class="totals-row">
                <span>Remise totale:</span>
                <span>-${vente.remiseTotal.toFixed(2)} DH</span>
              </div>
            ` : ''}
            <div class="totals-row grand-total">
              <span>TOTAL À PAYER:</span>
              <span>${total.toFixed(2)} DH</span>
            </div>
          </div>
          
          ${vente.notes ? `
            <div class="notes-section">
              <strong>Notes / Observations:</strong>
              ${vente.notes}
            </div>
          ` : ''}
          
          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line"></div>
              <p class="signature-label">Signature Client</p>
            </div>
            
            ${cachetHtml}
            
            <div class="signature-box">
              <div class="signature-line"></div>
              <p class="signature-label">Signature Vendeur</p>
            </div>
          </div>
          
          <div class="footer">
            <p style="font-weight: 600; color: #2563eb; font-size: 16px;">
              ${parametres.pied || "Merci de votre confiance !"}
            </p>
            ${hasLotInfo ? `
              <p style="margin-top: 10px; color: #16a34a; font-size: 14px;">
                🏷️ Vente avec traçabilité multi-lots • Qualité et sécurité garanties
              </p>
            ` : ''}
            <p class="print-info">
              Document imprimé le ${new Date().toLocaleString('fr-FR')} par ${user.email || 'Utilisateur'}
              ${hasLotInfo ? ' • Système multi-lots activé' : ''}
            </p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  /**
   * Exporte les ventes en CSV avec informations multi-lots
   */
  const handleExportCSV = () => {
    const csvContent = [
      ["Date", "Client", "Produits", "Lots", "Fournisseurs", "Quantités", "Total", "Statut", "Mode Paiement"],
      ...ventesFiltrees.map(v => [
        v.date?.toDate().toLocaleDateString('fr-FR'),
        v.client,
        v.articles.map(a => a.produit).join("; "),
        v.articles.map(a => a.numeroLot || "N/A").join("; "),
        v.articles.map(a => a.fournisseur || "N/A").join("; "),
        v.articles.map(a => a.quantite).join("; "),
        v.montantTotal || v.articles.reduce((sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise), 0),
        v.statutPaiement,
        v.modePaiement || "Espèces"
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventes_multi_lots_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // ============ UTILITAIRES ============
  /**
   * Réinitialise le formulaire
   */
  const resetForm = () => {
    setClient("");
    setDateVente("");
    setStatutPaiement("payé");
    setModePaiement("Espèces");
    setNotesVente("");
    setArticles([]);
    setProduit("");
    setProduitNouveau("");
    setQuantite(1);
    setPrixUnitaire("");
    setRemiseArticle(0);
    setSelectedLot("");
    setAvailableLots([]);
    setShowLotSelector(false);
    setEditId(null);
    setIsEditing(false);
    setError("");
  };

  // ============ CALCULS ET FILTRAGE ============
  /**
   * Calcul du total de la vente en cours
   */
  const totalVenteCourante = useMemo(() => {
    return articles.reduce(
      (t, a) => t + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
      0
    );
  }, [articles]);

  /**
   * Filtrage des ventes
   */
  const ventesFiltrees = useMemo(() => {
    return ventes.filter((v) => {
      let keep = true;
      
      // Filtre par client
      if (filterClient && v.client !== filterClient) keep = false;
      
      // Filtre par date min
      if (filterDateMin) {
        const vd = v.date?.toDate?.() || null;
        if (!vd || vd < new Date(filterDateMin)) keep = false;
      }
      
      // Filtre par date max
      if (filterDateMax) {
        const vd = v.date?.toDate?.() || null;
        if (!vd || vd > new Date(filterDateMax + "T23:59:59")) keep = false;
      }
      
      // Filtre par statut
      if (filterStatut && v.statutPaiement !== filterStatut) keep = false;
      
      // Recherche textuelle
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const clientMatch = v.client?.toLowerCase().includes(search);
        const produitMatch = v.articles?.some(a => 
          a.produit?.toLowerCase().includes(search) ||
          a.numeroLot?.toLowerCase().includes(search) ||
          a.fournisseur?.toLowerCase().includes(search)
        );
        keep = keep && (clientMatch || produitMatch);
      }
      
      return keep;
    });
  }, [ventes, filterClient, filterDateMin, filterDateMax, filterStatut, searchTerm]);

  /**
   * Statistiques des ventes avec informations multi-lots
   */
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const ventesJour = ventesFiltrees.filter(v => {
      const vd = v.date?.toDate?.();
      return vd && vd >= today;
    });
    
    const totalJour = ventesJour.reduce((sum, v) => 
      sum + (v.montantTotal || v.articles.reduce((s, a) => 
        s + (a.prixUnitaire * a.quantite - a.remise), 0)), 0
    );
    
    const totalMois = ventesFiltrees.filter(v => {
      const vd = v.date?.toDate?.();
      return vd && vd.getMonth() === today.getMonth() && vd.getFullYear() === today.getFullYear();
    }).reduce((sum, v) => 
      sum + (v.montantTotal || v.articles.reduce((s, a) => 
        s + (a.prixUnitaire * a.quantite - a.remise), 0)), 0
    );
    
    // 🆕 Statistiques multi-lots
    const ventesAvecLots = ventesFiltrees.filter(v => 
      v.articles?.some(a => a.numeroLot)
    ).length;
    
    const totalArticlesAvecLots = ventesFiltrees.reduce((sum, v) => 
      sum + (v.articles?.filter(a => a.numeroLot).length || 0), 0
    );
    
    return {
      ventesJour: ventesJour.length,
      totalJour,
      totalMois,
      totalVentes: ventesFiltrees.length,
      ventesAvecLots,
      totalArticlesAvecLots
    };
  }, [ventesFiltrees]);

  // ============ HOOKS EFFECTS ============
  useEffect(() => {
    fetchVentes();
  }, [fetchVentes]);

  useEffect(() => {
    fetchMedicaments();
    fetchStockEntries(); // 🆕
    fetchParametres();
  }, [fetchMedicaments, fetchStockEntries, fetchParametres]);

  // ============ AFFICHAGE CONDITIONNEL ============
  if (waiting) {
    return (
      <div style={{ 
        padding: 30, 
        textAlign: "center", 
        color: "#1c355e",
        fontSize: "18px"
      }}>
        <div className="spinner"></div>
        Chargement en cours...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ 
        padding: 30, 
        textAlign: "center", 
        color: "#dc2626",
        fontSize: "18px",
        background: "#fee2e2",
        borderRadius: "8px",
        margin: "20px"
      }}>
        ⚠️ Utilisateur non connecté. Veuillez vous connecter pour accéder à cette page.
      </div>
    );
  }

  if (!societeId) {
    return (
      <div style={{ 
        padding: 30, 
        textAlign: "center", 
        color: "#dc2626",
        fontSize: "18px",
        background: "#fee2e2",
        borderRadius: "8px",
        margin: "20px"
      }}>
        ⚠️ Aucune société sélectionnée. Veuillez sélectionner une société.
      </div>
    );
  }

  // ============ RENDU PRINCIPAL ============
  return (
    <div className="fullscreen-table-wrap">
      {/* En-tête */}
      <div className="fullscreen-table-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>📊 Gestion des Ventes Multi-Lots</span>
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              className="btn success"
              onClick={handleExportCSV}
              style={{ fontSize: "14px" }}
            >
              📥 Exporter CSV
            </button>
          </div>
        </div>
      </div>

      {/* Messages d'erreur et de succès */}
      {error && (
        <div style={{
          padding: "12px 20px",
          background: "#fee2e2",
          color: "#dc2626",
          borderRadius: "6px",
          margin: "10px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>❌ {error}</span>
          <button 
            onClick={() => setError("")}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px" }}
          >
            ✕
          </button>
        </div>
      )}

      {success && (
        <div style={{
          padding: "12px 20px",
          background: "#dcfce7",
          color: "#16a34a",
          borderRadius: "6px",
          margin: "10px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>✅ {success}</span>
          <button 
            onClick={() => setSuccess("")}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 🆕 Statistiques multi-lots rapides */}
      {showStats && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "15px",
          marginBottom: "20px"
        }}>
          <div className="stat-card" style={{
            padding: "15px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            borderRadius: "8px"
          }}>
            <div style={{ fontSize: "14px", opacity: 0.9 }}>Ventes du jour</div>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>{stats.ventesJour}</div>
            <div style={{ fontSize: "16px" }}>{stats.totalJour.toFixed(2)} DH</div>
          </div>
          <div className="stat-card" style={{
            padding: "15px",
            background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            color: "white",
            borderRadius: "8px"
          }}>
            <div style={{ fontSize: "14px", opacity: 0.9 }}>Total du mois</div>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>{stats.totalMois.toFixed(2)} DH</div>
          </div>
          <div className="stat-card" style={{
            padding: "15px",
            background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            color: "white",
            borderRadius: "8px"
          }}>
            <div style={{ fontSize: "14px", opacity: 0.9 }}>Total ventes filtrées</div>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>{stats.totalVentes}</div>
          </div>
          <div className="stat-card" style={{
            padding: "15px",
            background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
            color: "white",
            borderRadius: "8px"
          }}>
            <div style={{ fontSize: "14px", opacity: 0.9 }}>Ventes avec traçabilité</div>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>{stats.ventesAvecLots}</div>
            <div style={{ fontSize: "12px", opacity: 0.8 }}>{stats.totalArticlesAvecLots} articles tracés</div>
          </div>
        </div>
      )}

      {/* Boutons de contrôle */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "15px", flexWrap: "wrap" }}>
        {/* Toggle Formulaire */}
        <button
          className="btn"
          type="button"
          style={{
            background: showForm
              ? "linear-gradient(90deg,#dc2626 60%,#fca5a5 100%)"
              : "linear-gradient(90deg,#2563eb 50%,#60a5fa 100%)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
          onClick={() => {
            setShowForm(!showForm);
            if (!showForm) resetForm();
          }}
        >
          {showForm ? "➖" : "➕"} 
          <span>{showForm ? "Masquer" : "Afficher"} le formulaire</span>
        </button>

        {/* Toggle Filtres */}
        <button
          className="btn"
          type="button"
          style={{
            background: showFiltres
              ? "linear-gradient(90deg,#dc2626 60%,#fca5a5 100%)"
              : "linear-gradient(90deg,#059669 50%,#34d399 100%)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
          onClick={() => setShowFiltres(!showFiltres)}
        >
          {showFiltres ? "➖" : "🔍"} 
          <span>{showFiltres ? "Masquer" : "Afficher"} les filtres</span>
        </button>

        {/* Toggle Stats */}
        <button
          className="btn"
          type="button"
          style={{
            background: showStats
              ? "linear-gradient(90deg,#dc2626 60%,#fca5a5 100%)"
              : "linear-gradient(90deg,#7c3aed 50%,#a78bfa 100%)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
          onClick={() => setShowStats(!showStats)}
        >
          {showStats ? "➖" : "📈"} 
          <span>{showStats ? "Masquer" : "Afficher"} les statistiques</span>
        </button>
      </div>

      {/* FORMULAIRE D'AJOUT/MODIFICATION AVEC GESTION MULTI-LOTS */}
      {showForm && (
        <div className="form-section" style={{
          background: "#f9fafb",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "20px",
          border: "1px solid #e5e7eb"
        }}>
          {/* Titre du formulaire */}
          <h3 style={{ marginBottom: "15px", color: "#1f2937", fontSize: "18px" }}>
            {isEditing ? "📝 Modifier la vente" : "➕ Nouvelle vente multi-lots"}
          </h3>

          {/* 🆕 Formulaire ajout article avec sélection de lots */}
          <form onSubmit={handleAddArticle} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px',
            marginBottom: '20px',
            padding: '15px',
            background: 'white',
            borderRadius: '6px',
            border: '2px solid #e6fffa'
          }}>
            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Médicament *
              </label>
              <select 
                className="w-full" 
                value={produit} 
                onChange={(e) => handleProduitChange(e.target.value)} 
                required
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              >
                <option value="">-- Sélectionner --</option>
                {getAllAvailableMedicaments.map(m => (
                  <option key={m.nom} value={m.nom}>
                    {m.nom} ({m.hasLots ? "Lots" : "Stock"}: {m.quantiteTotal})
                    {m.hasLots ? " 🏷️" : ""}
                  </option>
                ))}
                <option value="_new_">➕ Nouveau médicament</option>
              </select>
            </div>

            {/* 🆕 Sélecteur de lots */}
            {showLotSelector && availableLots.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "8px", display: "block" }}>
                  🏷️ Sélectionner un lot spécifique (FIFO recommandé)
                </label>
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: "10px"
                }}>
                  {availableLots.map(lot => {
                    const isExpired = lot.datePeremption && new Date(lot.datePeremption) < new Date();
                    const isExpiringSoon = lot.datePeremption && !isExpired && 
                      new Date(lot.datePeremption) <= new Date(Date.now() + 30*24*60*60*1000);
                    
                    return (
                      <div
                        key={lot.id}
                        onClick={() => handleLotSelection(lot.id)}
                        style={{
                          padding: "12px",
                          border: selectedLot === lot.id ? "2px solid #10b981" : "1px solid #d1d5db",
                          borderRadius: "8px",
                          cursor: "pointer",
                          background: selectedLot === lot.id ? "#dcfce7" : "#f9fafb",
                          transition: "all 0.2s",
                          ...(isExpired ? { borderColor: "#dc2626", background: "#fee2e2" } :
                              isExpiringSoon ? { borderColor: "#f59e0b", background: "#fef3c7" } : {})
                        }}
                      >
                        <div style={{ fontWeight: "600", color: "#1f2937" }}>
                          📦 Lot: {lot.numeroLot} • Qté: {lot.quantite}
                        </div>
                        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                          🏭 {lot.fournisseur} • 💰 {lot.prixVente} DH
                        </div>
                        <div style={{ fontSize: "12px", color: isExpired ? "#dc2626" : isExpiringSoon ? "#d97706" : "#6b7280" }}>
                          📅 Exp: {lot.datePeremption}
                          {isExpired && " ⚠️ EXPIRÉ"}
                          {isExpiringSoon && " ⏰ Expire bientôt"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
                  💡 Conseil: Sélectionnez le lot avec la date d'expiration la plus proche (FIFO - First In, First Out)
                </div>
              </div>
            )}

            {produit === "_new_" && (
              <div>
                <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                  Nom du nouveau médicament *
                </label>
                <input 
                  className="w-full" 
                  value={produitNouveau} 
                  onChange={(e) => setProduitNouveau(e.target.value)} 
                  required 
                  style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Quantité *
              </label>
              <input 
                type="number" 
                className="w-full" 
                value={quantite} 
                onChange={(e) => setQuantite(e.target.value)} 
                required 
                min={1}
                max={selectedLot ? availableLots.find(l => l.id === selectedLot)?.quantite : undefined}
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              />
              {selectedLot && (
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                  Max: {availableLots.find(l => l.id === selectedLot)?.quantite || 0}
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Prix unitaire (DH) *
              </label>
              <input 
                type="number" 
                className="w-full" 
                value={prixUnitaire} 
                onChange={(e) => setPrixUnitaire(e.target.value)} 
                required 
                min={0}
                step="0.01"
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Remise (DH)
              </label>
              <input 
                type="number" 
                className="w-full" 
                value={remiseArticle} 
                onChange={(e) => setRemiseArticle(e.target.value)} 
                min={0}
                step="0.01"
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button 
                type="submit" 
                className="btn"
                style={{ 
                  background: "linear-gradient(90deg, #10b981 0%, #34d399 100%)",
                  width: "100%"
                }}
                disabled={isSaving}
              >
                ➕ Ajouter l'article
              </button>
            </div>
          </form>

          {/* 🆕 Tableau des articles de la vente avec informations multi-lots */}
          {articles.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <h4 style={{ marginBottom: "10px", color: "#1f2937" }}>
                Articles de la vente ({articles.length})
                {articles.some(a => a.numeroLot) && (
                  <span style={{ 
                    fontSize: "12px", 
                    background: "#dcfce7", 
                    color: "#16a34a",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    marginLeft: "10px"
                  }}>
                    🏷️ {articles.filter(a => a.numeroLot).length} avec traçabilité
                  </span>
                )}
              </h4>
              <div className="table-pro-full" style={{ maxHeight: "300px", overflowY: "auto" }}>
                <table style={{ width: "100%" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f3f4f6" }}>
                    <tr>
                      <th style={{ padding: "10px", textAlign: "left" }}>Produit / Traçabilité</th>
                      <th style={{ padding: "10px", textAlign: "center" }}>Quantité</th>
                      <th style={{ padding: "10px", textAlign: "right" }}>Prix unit.</th>
                      <th style={{ padding: "10px", textAlign: "right" }}>Remise</th>
                      <th style={{ padding: "10px", textAlign: "right" }}>Total</th>
                      <th style={{ padding: "10px", textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((a, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "10px" }}>
                          <div style={{ fontWeight: "600" }}>{a.produit}</div>
                          {(a.numeroLot || a.fournisseur || a.datePeremption) && (
                            <div style={{ 
                              fontSize: "11px", 
                              color: "#6b7280", 
                              marginTop: "4px",
                              padding: "4px 8px",
                              background: "#f3f4f6",
                              borderRadius: "4px",
                              borderLeft: "3px solid #10b981"
                            }}>
                              {a.numeroLot && <span>🏷️ Lot: {a.numeroLot} • </span>}
                              {a.fournisseur && <span>🏭 {a.fournisseur} • </span>}
                              {a.datePeremption && <span>📅 Exp: {a.datePeremption}</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center" }}>
                          <input
                            type="number"
                            value={a.quantite}
                            onChange={(e) => handleUpdateArticleQuantity(i, e.target.value)}
                            min={1}
                            max={a.stockSource?.data?.quantite || undefined}
                            style={{ 
                              width: "80px", 
                              textAlign: "center",
                              padding: "4px",
                              borderRadius: "4px",
                              border: "1px solid #d1d5db"
                            }}
                          />
                        </td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{a.prixUnitaire.toFixed(2)} DH</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{a.remise.toFixed(2)} DH</td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: "600" }}>
                          {((a.prixUnitaire * a.quantite) - a.remise).toFixed(2)} DH
                        </td>
                        <td style={{ padding: "10px", textAlign: "center" }}>
                          <button 
                            className="btn danger" 
                            type="button" 
                            onClick={() => handleRemoveArticle(i)}
                            style={{ padding: "4px 8px", fontSize: "12px" }}
                          >
                            🗑️ Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: "#f9fafb", fontWeight: "bold" }}>
                      <td colSpan={4} style={{ padding: "12px", textAlign: "right" }}>
                        TOTAL DE LA VENTE
                      </td>
                      <td colSpan={2} style={{ 
                        padding: "12px", 
                        textAlign: "center",
                        fontSize: "18px",
                        color: "#059669"
                      }}>
                        {totalVenteCourante.toFixed(2)} DH
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Formulaire informations de la vente */}
          <form onSubmit={handleAddVente} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            padding: '20px',
            background: 'white',
            borderRadius: '6px'
          }}>
            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Client *
              </label>
              <input 
                className="w-full" 
                type="text" 
                value={client} 
                onChange={(e) => setClient(e.target.value)} 
                required
                placeholder="Nom du client"
                list="clients-list"
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              />
              <datalist id="clients-list">
                {clients.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Date de vente *
              </label>
              <input 
                className="w-full" 
                type="date" 
                value={dateVente} 
                onChange={(e) => setDateVente(e.target.value)} 
                required
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Statut de paiement
              </label>
              <select 
                className="w-full" 
                value={statutPaiement} 
                onChange={(e) => setStatutPaiement(e.target.value)}
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              >
                <option value="payé">✅ Payé</option>
                <option value="partiel">⏳ Partiel</option>
                <option value="impayé">❌ Impayé</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Mode de paiement
              </label>
              <select 
                className="w-full" 
                value={modePaiement} 
                onChange={(e) => setModePaiement(e.target.value)}
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              >
                <option value="Espèces">💵 Espèces</option>
                <option value="Carte">💳 Carte bancaire</option>
                <option value="Chèque">📝 Chèque</option>
                <option value="Virement">🏦 Virement</option>
                <option value="Crédit">📋 Crédit</option>
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Notes / Observations
              </label>
              <textarea
                className="w-full"
                value={notesVente}
                onChange={(e) => setNotesVente(e.target.value)}
                rows={2}
                placeholder="Notes optionnelles..."
                style={{ 
                  padding: "8px", 
                  borderRadius: "4px", 
                  border: "1px solid #d1d5db",
                  width: "100%",
                  resize: "vertical"
                }}
              />
            </div>

            <div style={{ 
              gridColumn: "1 / -1", 
              display: "flex", 
              gap: "10px", 
              justifyContent: "flex-end" 
            }}>
              {isEditing && (
                <button 
                  type="button" 
                  className="btn" 
                  onClick={resetForm}
                  style={{ background: "#6b7280" }}
                >
                  ❌ Annuler
                </button>
              )}
              <button 
                type="submit" 
                className="btn"
                disabled={isSaving || articles.length === 0}
                style={{ 
                  background: isEditing 
                    ? "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)"
                    : "linear-gradient(90deg, #2563eb 0%, #60a5fa 100%)",
                  opacity: (isSaving || articles.length === 0) ? 0.5 : 1,
                  cursor: (isSaving || articles.length === 0) ? "not-allowed" : "pointer"
                }}
              >
                {isSaving ? "⏳ Enregistrement..." : (isEditing ? "📝 Modifier la vente" : "💾 Enregistrer la vente multi-lots")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SECTION FILTRES */}
      {showFiltres && (
        <div className="filter-section" style={{
          background: "#f9fafb",
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px",
          border: "1px solid #e5e7eb"
        }}>
          <h3 style={{ marginBottom: "15px", color: "#1f2937", fontSize: "16px" }}>
            🔍 Filtrer les ventes multi-lots
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "15px",
            alignItems: "end"
          }}>
            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Recherche
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Client, produit, lot, fournisseur..."
                style={{ 
                  padding: "8px", 
                  borderRadius: "4px", 
                  border: "1px solid #d1d5db",
                  width: "100%"
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Client
              </label>
              <select 
                value={filterClient} 
                onChange={e => setFilterClient(e.target.value)}
                style={{ 
                  padding: "8px", 
                  borderRadius: "4px", 
                  border: "1px solid #d1d5db",
                  width: "100%"
                }}
              >
                <option value="">Tous les clients</option>
                {clients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Statut
              </label>
              <select 
                value={filterStatut} 
                onChange={e => setFilterStatut(e.target.value)}
                style={{ 
                  padding: "8px", 
                  borderRadius: "4px", 
                  border: "1px solid #d1d5db",
                  width: "100%"
                }}
              >
                <option value="">Tous les clients</option>
                {clients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Statut
              </label>
              <select 
                value={filterStatut} 
                onChange={e => setFilterStatut(e.target.value)}
                style={{ 
                  padding: "8px", 
                  borderRadius: "4px", 
                  border: "1px solid #d1d5db",
                  width: "100%"
                }}
              >
                <option value="">Tous les statuts</option>
                <option value="payé">✅ Payé</option>
                <option value="partiel">⏳ Partiel</option>
                <option value="impayé">❌ Impayé</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Date début
              </label>
              <input 
                type="date" 
                value={filterDateMin} 
                onChange={e => setFilterDateMin(e.target.value)}
                style={{ 
                  padding: "8px", 
                  borderRadius: "4px", 
                  border: "1px solid #d1d5db",
                  width: "100%"
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "14px", color: "#4b5563", marginBottom: "4px", display: "block" }}>
                Date fin
              </label>
              <input 
                type="date" 
                value={filterDateMax} 
                onChange={e => setFilterDateMax(e.target.value)}
                style={{ 
                  padding: "8px", 
                  borderRadius: "4px", 
                  border: "1px solid #d1d5db",
                  width: "100%"
                }}
              />
            </div>

            {(filterClient || filterDateMin || filterDateMax || filterStatut || searchTerm) && (
              <button 
                className="btn danger" 
                type="button" 
                onClick={() => {
                  setFilterClient("");
                  setFilterDateMin("");
                  setFilterDateMax("");
                  setFilterStatut("");
                  setSearchTerm("");
                }}
                style={{ alignSelf: "stretch" }}
              >
                🔄 Réinitialiser les filtres
              </button>
            )}
          </div>

          {ventesFiltrees.length !== ventes.length && (
            <div style={{ 
              marginTop: "10px", 
              padding: "8px", 
              background: "#dbeafe", 
              borderRadius: "4px",
              color: "#1e40af"
            }}>
              📊 {ventesFiltrees.length} vente(s) sur {ventes.length} au total
            </div>
          )}
        </div>
      )}

      {/* TABLEAU DES VENTES MULTI-LOTS */}
      <div className="fullscreen-table-title" style={{ 
        marginTop: "20px", 
        fontSize: '1.3rem',
       
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <span>📋 Historique des ventes multi-lots ({ventesFiltrees.length})</span>
        <span style={{ fontSize: "14px", color: "#6b7280" }}>
          Total affiché: {ventesFiltrees.reduce((sum, v) => 
            sum + (v.montantTotal || v.articles?.reduce((s, a) => 
              s + (a.prixUnitaire * a.quantite - a.remise), 0) || 0), 0
          ).toFixed(2)} DH
        </span>
      </div>

      <div className="table-pro-full" style={{ 
        flex: '1 1 0%', 
        minHeight: '400px',
        maxHeight: 'calc(100vh - 400px)',
        overflowY: 'auto',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        background: 'white'
      }}>
        <table style={{ width: "100%" }}>
          <thead style={{ 
            position: 'sticky', 
            top: 0, 
            background: 'linear-gradient(90deg, #1e40af 0%, #3b82f6 100%)',
            color: 'white'
          }}>
            <tr>
              <th style={{ padding: "12px", textAlign: "left" }}>N°</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Client</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Date</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Articles</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Traçabilité</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Statut</th>
              <th style={{ padding: "12px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "12px", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ventesFiltrees.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ 
                  padding: "40px", 
                  textAlign: "center",
                  color: "#6b7280",
                  fontSize: "16px"
                }}>
                  {ventes.length === 0 
                    ? "Aucune vente enregistrée pour le moment"
                    : "Aucune vente ne correspond aux critères de filtrage"}
                </td>
              </tr>
            ) : (
              ventesFiltrees.map((v, index) => {
                const total = v.montantTotal || (Array.isArray(v.articles) ? v.articles : [])
                  .reduce((sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise), 0);
                
                const articlesAvecLots = (v.articles || []).filter(a => a.numeroLot).length;
                const totalArticles = (v.articles || []).length;
                
                return (
                  <tr key={v.id} style={{ 
                    borderBottom: "1px solid #e5e7eb",
                    transition: "background 0.2s",
                    cursor: "pointer"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                  >
                    <td style={{ padding: "10px", fontWeight: "600", color: "#4b5563" }}>
                      #{v.id.slice(-6).toUpperCase()}
                    </td>
                    <td style={{ padding: "10px", fontWeight: "500" }}>{v.client}</td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      {v.date?.toDate().toLocaleDateString('fr-FR')}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <span style={{ 
                        background: "#e0e7ff",
                        color: "#3730a3",
                        padding: "6px 12px",
                        borderRadius: "12px",
                        fontSize: "13px"
                      }}>
                        {totalArticles} article(s)
                      </span>
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      {articlesAvecLots > 0 ? (
                        <span style={{ 
                          background: "#dcfce7",
                          color: "#16a34a",
                          padding: "6px 12px",
                          borderRadius: "12px",
                          fontSize: "13px",
                          fontWeight: "600"
                        }}>
                          🏷️ {articlesAvecLots}/{totalArticles} tracés
                        </span>
                      ) : (
                        <span style={{ 
                          background: "#f3f4f6",
                          color: "#6b7280",
                          padding: "6px 12px",
                          borderRadius: "12px",
                          fontSize: "13px"
                        }}>
                          📋 Standard
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: "4px",
                        fontSize: "13px",
                        fontWeight: "600",
                        ...(v.statutPaiement === "payé" ? {
                          background: "#dcfce7",
                          color: "#16a34a"
                        } : v.statutPaiement === "partiel" ? {
                          background: "#fed7aa",
                          color: "#ea580c"
                        } : {
                          background: "#fee2e2",
                          color: "#dc2626"
                        })
                      }}>
                        {v.statutPaiement === "payé" ? "✅ Payé" : 
                         v.statutPaiement === "partiel" ? "⏳ Partiel" : 
                         "❌ Impayé"}
                      </span>
                    </td>
                    <td style={{ 
                      padding: "10px", 
                      textAlign: "right",
                      fontSize: "16px",
                      fontWeight: "bold",
                      color: "#059669"
                    }}>
                      {total.toFixed(2)} DH
                    </td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ display: "flex", gap: "5px", justifyContent: "center", flexWrap: "wrap" }}>
                        <button 
                          className="btn info" 
                          onClick={() => {
                            setSelectedVente(v);
                            setShowDetails(true);
                          }}
                          style={{ padding: "4px 8px", fontSize: "12px" }}
                          title="Voir les détails"
                        >
                          👁️
                        </button>
                        <button 
                          className="btn" 
                          onClick={() => handleEditVente(v)}
                          style={{ 
                            padding: "4px 8px", 
                            fontSize: "12px",
                            background: "#f59e0b"
                          }}
                          title="Modifier"
                        >
                          ✏️
                        </button>
                        <button 
                          className="btn success" 
                          onClick={() => handleDuplicateVente(v)}
                          style={{ padding: "4px 8px", fontSize: "12px" }}
                          title="Dupliquer"
                        >
                          📋
                        </button>
                        <button 
                          className="btn print" 
                          onClick={() => handlePrintVente(v)}
                          style={{ 
                            padding: "4px 8px", 
                            fontSize: "12px",
                            background: "#8b5cf6"
                          }}
                          title={`Imprimer avec cachet ${parametres.typeCachet === "image" ? "image" : "texte"} et traçabilité`}
                        >
                          🖨️
                        </button>
                        <button 
                          className="btn danger" 
                          onClick={() => handleDeleteVente(v)}
                          style={{ padding: "4px 8px", fontSize: "12px" }}
                          title="Supprimer"
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

      {/* MODAL DÉTAILS VENTE MULTI-LOTS */}
      {showDetails && selectedVente && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            borderRadius: "12px",
            padding: "25px",
            maxWidth: "800px",
            width: "90%",
            maxHeight: "80vh",
            overflowY: "auto"
          }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "20px"
            }}>
              <h2 style={{ color: "#1f2937", fontSize: "20px" }}>
                📋 Détails de la vente multi-lots #{selectedVente.id.slice(-6).toUpperCase()}
              </h2>
              <button
                onClick={() => {
                  setShowDetails(false);
                  setSelectedVente(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#6b7280"
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "15px",
              marginBottom: "20px"
            }}>
              <div>
                <strong style={{ color: "#6b7280", fontSize: "14px" }}>Client:</strong>
                <p style={{ fontSize: "16px", marginTop: "4px" }}>{selectedVente.client}</p>
              </div>
              <div>
                <strong style={{ color: "#6b7280", fontSize: "14px" }}>Date:</strong>
                <p style={{ fontSize: "16px", marginTop: "4px" }}>
                  {selectedVente.date?.toDate().toLocaleString('fr-FR')}
                </p>
              </div>
              <div>
                <strong style={{ color: "#6b7280", fontSize: "14px" }}>Statut:</strong>
                <p style={{ fontSize: "16px", marginTop: "4px" }}>{selectedVente.statutPaiement}</p>
              </div>
              <div>
                <strong style={{ color: "#6b7280", fontSize: "14px" }}>Mode de paiement:</strong>
                <p style={{ fontSize: "16px", marginTop: "4px" }}>
                  {selectedVente.modePaiement || "Espèces"}
                </p>
              </div>
            </div>

            {/* 🆕 Indicateur de traçabilité */}
            {selectedVente.articles?.some(a => a.numeroLot) && (
              <div style={{
                background: "#dcfce7",
                padding: "12px",
                borderRadius: "6px",
                marginBottom: "20px",
                borderLeft: "4px solid #16a34a"
              }}>
                <strong style={{ color: "#16a34a" }}>🏷️ Vente avec traçabilité multi-lots:</strong>
                <span style={{ marginLeft: "8px" }}>
                  {selectedVente.articles.filter(a => a.numeroLot).length} article(s) tracé(s) sur {selectedVente.articles.length}
                </span>
              </div>
            )}

            {selectedVente.notes && (
              <div style={{
                background: "#fef3c7",
                padding: "12px",
                borderRadius: "6px",
                marginBottom: "20px",
                borderLeft: "4px solid #f59e0b"
              }}>
                <strong>Notes:</strong> {selectedVente.notes}
              </div>
            )}

            <h3 style={{ marginBottom: "10px", color: "#1f2937" }}>Articles vendus avec traçabilité:</h3>
            <table style={{ width: "100%", marginBottom: "20px" }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ padding: "8px", textAlign: "left" }}>Produit / Traçabilité</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>Qté</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Prix</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Remise</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedVente.articles?.map((a, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: "600", marginBottom: "4px" }}>{a.produit}</div>
                      {(a.numeroLot || a.fournisseur || a.datePeremption) && (
                        <div style={{ 
                          fontSize: "12px", 
                          color: "#6b7280",
                          padding: "6px 8px",
                          background: "#f3f4f6",
                          borderRadius: "4px",
                          borderLeft: "3px solid #10b981"
                        }}>
                          {a.numeroLot && (
                            <div>
                              <span style={{ 
                                background: "#dcfce7", 
                                color: "#16a34a", 
                                padding: "2px 6px", 
                                borderRadius: "8px",
                                marginRight: "6px",
                                fontSize: "10px",
                                fontWeight: "600"
                              }}>
                                LOT
                              </span>
                              {a.numeroLot}
                            </div>
                          )}
                          {a.fournisseur && (
                            <div style={{ marginTop: "2px" }}>
                              <span style={{ 
                                background: "#dbeafe", 
                                color: "#2563eb", 
                                padding: "2px 6px", 
                                borderRadius: "8px",
                                marginRight: "6px",
                                fontSize: "10px",
                                fontWeight: "600"
                              }}>
                                FOURN
                              </span>
                              {a.fournisseur}
                            </div>
                          )}
                          {a.datePeremption && (
                            <div style={{ marginTop: "2px" }}>
                              <span style={{ 
                                background: "#fef3c7", 
                                color: "#d97706", 
                                padding: "2px 6px", 
                                borderRadius: "8px",
                                marginRight: "6px",
                                fontSize: "10px",
                                fontWeight: "600"
                              }}>
                                EXP
                              </span>
                              {a.datePeremption}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{a.quantite}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{a.prixUnitaire} DH</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{a.remise} DH</td>
                    <td style={{ padding: "8px", textAlign: "right", fontWeight: "600" }}>
                      {(a.prixUnitaire * a.quantite - a.remise).toFixed(2)} DH
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              padding: "15px",
              borderRadius: "6px",
              textAlign: "right",
              fontSize: "18px",
              fontWeight: "bold"
            }}>
              Total: {(selectedVente.montantTotal || selectedVente.articles?.reduce(
                (sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise), 0
              ) || 0).toFixed(2)} DH
            </div>

            <div style={{ 
              display: "flex", 
              gap: "10px", 
              justifyContent: "flex-end",
              marginTop: "20px"
            }}>
              <button
                className="btn"
                onClick={() => handlePrintVente(selectedVente)}
                style={{ background: "#8b5cf6" }}
              >
                🖨️ Imprimer avec cachet {parametres.typeCachet === "image" ? "image" : "texte"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  handleEditVente(selectedVente);
                  setShowDetails(false);
                }}
                style={{ background: "#f59e0b" }}
              >
                ✏️ Modifier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
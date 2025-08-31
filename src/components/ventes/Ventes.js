import React, { useEffect, useState, useCallback, useMemo } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import { createPortal } from "react-dom";

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

// ========== FONCTIONS UTILITAIRES POUR DATES ==========
function safeParseDate(dateInput) {
  if (!dateInput) return null;
  
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === 'function') {
      return dateInput.toDate();
    }
    if (dateInput?.seconds) {
      return new Date(dateInput.seconds * 1000);
    }
    if (dateInput instanceof Date) {
      return dateInput;
    }
    if (typeof dateInput === 'string' || typeof dateInput === 'number') {
      const date = new Date(dateInput);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  } catch (error) {
    console.warn("Erreur parsing date:", dateInput, error);
    return null;
  }
}

function formatDateSafe(dateInput, options = {}) {
  const date = safeParseDate(dateInput);
  if (!date) return '';
  
  try {
    if (options.withTime) {
      return date.toLocaleString('fr-FR');
    }
    return date.toLocaleDateString('fr-FR');
  } catch (error) {
    console.warn("Erreur formatage date:", error);
    return '';
  }
}

function getDateInputValue(dateInput) {
  const date = safeParseDate(dateInput);
  if (!date) return '';
  
  try {
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.warn("Erreur conversion ISO:", error);
    return '';
  }
}






// ========== FONCTION UTILITAIRE POUR NOMBRES ==========
function safeNumber(value, defaultValue = 0) {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

function safeToFixed(value, decimals = 2) {
  return safeNumber(value).toFixed(decimals);
}













/**
 * Composant de gestion des ventes avec support multi-lots optimisé et compatible import/export
 */
export default function Ventes() {
  const { user, societeId, loading } = useUserRole();

  // ============ ÉTATS PRINCIPAUX ============
  const [client, setClient] = useState("(passant)");
  const [dateVente, setDateVente] = useState(new Date().toISOString().split('T')[0]);
  const [statutPaiement, setStatutPaiement] = useState("payé");
  const [modePaiement, setModePaiement] = useState("Espèces");
  const [notesVente, setNotesVente] = useState("");
  const [produit, setProduit] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [remiseArticle, setRemiseArticle] = useState(0);
  const [selectedLot, setSelectedLot] = useState("");
  const [articles, setArticles] = useState([]);
  const [ventes, setVentes] = useState([]);
  const [medicaments, setMedicaments] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [availableLots, setAvailableLots] = useState([]);
  const [parametres, setParametres] = useState({ 
    entete: "PHARMACIE - BON DE VENTE", 
    pied: "Merci de votre confiance",
    cachetTexte: "Cachet Société",
    cachetImage: null,
    afficherCachet: true,
    typeCachet: "texte",
    tailleCachet: 120
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

  // ============ CHARGEMENT ============
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  const fetchParametres = useCallback(async () => {
    if (!societeId) return;
    try {
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
      }
    } catch (err) {
      console.error("Erreur chargement paramètres:", err);
    }
  }, [societeId]);

  const fetchVentes = useCallback(async () => {
    if (!societeId) return setVentes([]);
    try {
      const q = query(
        collection(db, "societe", societeId, "ventes"),
        orderBy("date", "desc"),
        limit(200)
      );
      const snap = await getDocs(q);
      const arr = [];
      snap.forEach((doc) => {
        const data = doc.data();
        delete data._exportedAt;
        delete data._collection;
        arr.push({ id: doc.id, ...data });
      });
      setVentes(arr);
      const uniqueClients = [...new Set(arr.map(v => v.client).filter(Boolean))];
      setClients(uniqueClients);
    } catch (err) {
      console.error("Erreur chargement ventes:", err);
      setError("Erreur lors du chargement des ventes");
    }
  }, [societeId]);

  const fetchStockEntries = useCallback(async () => {
    if (!societeId) return setStockEntries([]);
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "stock_entries"));
      const arr = [];
      snap.forEach((doc) => {
        const data = doc.data();
        delete data._exportedAt;
        delete data._collection;
        arr.push({ id: doc.id, ...data });
      });
      arr.sort((a, b) => {
        if (a.nom !== b.nom) return a.nom.localeCompare(b.nom);
        const dateA = safeParseDate(a.datePeremption);
        const dateB = safeParseDate(b.datePeremption);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
      });
      setStockEntries(arr);
    } catch (err) {
      console.error("Erreur chargement stock entries:", err);
    }
  }, [societeId]);

  const fetchMedicaments = useCallback(async () => {
    if (!societeId) return setMedicaments([]);
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "stock"));
      const arr = [];
      snap.forEach((doc) => {
        const data = doc.data();
        delete data._exportedAt;
        delete data._collection;
        arr.push({ id: doc.id, ...data });
      });
      setMedicaments(arr);
    } catch (err) {
      console.error("Erreur chargement médicaments:", err);
    }
  }, [societeId]);

  const getAllAvailableMedicaments = useMemo(() => {
    const medicamentMap = new Map();
    
    const lotGroups = {};
    stockEntries.filter(e => safeNumber(e.quantite) > 0).forEach(entry => {
      if (!lotGroups[entry.nom]) {
        lotGroups[entry.nom] = [];
      }
      lotGroups[entry.nom].push(entry);
    });
    
    Object.keys(lotGroups).forEach(nom => {
      const lots = lotGroups[nom];
      const totalQuantity = lots.reduce((sum, lot) => sum + safeNumber(lot.quantite), 0);
      medicamentMap.set(nom, {
        nom,
        quantiteTotal: totalQuantity,
        hasLots: true,
       lastPrice: safeNumber(lots[0]?.prixVente)
      });
    });
    
   medicaments.filter(m => safeNumber(m.quantite) > 0).forEach(med => {
      if (!medicamentMap.has(med.nom)) {
        medicamentMap.set(med.nom, {
          nom: med.nom,
         quantiteTotal: safeNumber(med.quantite),
          hasLots: false,
          lastPrice: safeNumber(med.prixVente)
        });
      }
    });
    
    return Array.from(medicamentMap.values())
      .filter(m => m.quantiteTotal > 0)
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [medicaments, stockEntries]);

  // ============ GESTION FORMULAIRE ============
  const handleProduitChange = (value) => {
    setProduit(value);
    setSelectedLot("");
    setAvailableLots([]);
    
    if (value) {
      const lotsForProduct = stockEntries.filter(entry => 
       entry.nom === value && safeNumber(entry.quantite) > 0
      );
      
      setAvailableLots(lotsForProduct);
      
      if (lotsForProduct.length > 0) {
       setPrixUnitaire(safeNumber(lotsForProduct[0]?.prixVente));
      } else {
        const med = medicaments.find((m) => m.nom === value);
       if (med) setPrixUnitaire(safeNumber(med.prixVente));
      }
    }
  };

  const handleLotSelection = (lotId) => {
    setSelectedLot(lotId);
    const selectedLotData = availableLots.find(lot => lot.id === lotId);
    if (selectedLotData) {
     setPrixUnitaire(safeNumber(selectedLotData.prixVente));
    }
  };

  const handleAddArticle = (e) => {
    e.preventDefault();
    
    if (!produit || !quantite || !prixUnitaire) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }

    let stockSource = null;
    let maxQuantity = 0;
    
    if (selectedLot) {
      const lotData = availableLots.find(lot => lot.id === selectedLot);
      if (lotData) {
        stockSource = { type: "lot", data: lotData };
        maxQuantity = lotData.quantite;
      }
    } else {
      const availableMed = getAllAvailableMedicaments.find(m => m.nom === produit);
      if (availableMed && availableMed.hasLots) {
        const firstLot = availableLots[0];
        if (firstLot) {
          stockSource = { type: "lot", data: firstLot };
          maxQuantity = firstLot.quantite;
        }
      } else {
        const medStock = medicaments.find(m => m.nom === produit);
        if (medStock) {
          stockSource = { type: "traditional", data: medStock };
          maxQuantity = medStock.quantite;
        }
      }
    }

    if (!stockSource || maxQuantity < quantite) {
      setError(`Stock insuffisant ! Disponible: ${maxQuantity}`);
      return;
    }

    const articleData = {
      produit,
      quantite: Number(quantite),
      prixUnitaire: Number(prixUnitaire),
      remise: Number(remiseArticle),
      stockSource,
    };

    if (stockSource.type === "lot") {
      articleData.numeroLot = stockSource.data.numeroLot;
      articleData.fournisseur = stockSource.data.fournisseur;
      articleData.datePeremption = stockSource.data.datePeremption;
      articleData.stockEntryId = stockSource.data.id;
    }

    setArticles([...articles, articleData]);
    
    setProduit("");
    setQuantite(1);
    setPrixUnitaire("");
    setRemiseArticle(0);
    setSelectedLot("");
    setAvailableLots([]);
    setError("");
  };

  const handleRemoveArticle = (idx) => {
    setArticles(articles.filter((_, i) => i !== idx));
  };

  // ============ GESTION VENTES ============
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
        (sum, a) => sum + (a.prixUnitaire * a.quantite - a.remise),
        0
      );
      
      const remiseTotal = articles.reduce((sum, a) => sum + a.remise, 0);

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

      let venteRef = null;

      if (isEditing && editId) {
        const oldVente = ventes.find((v) => v.id === editId);
        await updateStockOnCancel(oldVente);
        await updateDoc(doc(db, "societe", societeId, "ventes", editId), venteData);
        venteRef = { id: editId };
        await updateStockOnSell({ client, articles });
        setSuccess("Vente modifiée avec succès !");
      } else {
        venteData.createdAt = Timestamp.now();
        venteData.createdBy = user.email;
        
        const added = await addDoc(
          collection(db, "societe", societeId, "ventes"),
          venteData
        );
        venteRef = added;
        await updateStockOnSell({ client, articles });
        setSuccess("Vente enregistrée avec succès !");
      }

      if (statutPaiement === "payé" && venteRef) {
        await addDoc(collection(db, "societe", societeId, "paiements"), {
          docId: venteRef.id,
          montant: montantTotal,
          mode: modePaiement,
          type: "ventes",
          date: Timestamp.now(),
          createdBy: user.email
        });
      }

      resetForm();
      await fetchVentes();
      await fetchMedicaments();
      await fetchStockEntries();
      
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

  const handleEditVente = (vente) => {
    setEditId(vente.id);
    setIsEditing(true);
    setClient(vente.client || "(passant)");
    setDateVente(getDateInputValue(vente.date));
    setStatutPaiement(vente.statutPaiement || "payé");
    setModePaiement(vente.modePaiement || "Espèces");
    setNotesVente(vente.notes || "");
    
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
  };

  const handleDeleteVente = async (vente) => {
    if (!window.confirm(`Supprimer la vente de ${vente.client} ?`)) return;

    try {
      await updateStockOnCancel(vente);
      await deleteDoc(doc(db, "societe", societeId, "ventes", vente.id));
      setSuccess("Vente supprimée avec succès");
      await fetchVentes();
      await fetchStockEntries();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Erreur suppression:", err);
      setError("Erreur lors de la suppression");
    }
  };

  const handleViewDetails = (vente) => {
    setSelectedVente(vente);
    setShowDetails(true);
  };

  // ============ GESTION STOCK ============
  const updateStockOnSell = async (vente) => {
    if (!user || !societeId) return;
    
    for (const art of vente.articles || []) {
      try {
        if (art.stockSource?.type === "lot" && art.stockEntryId) {
          const entryRef = doc(db, "societe", societeId, "stock_entries", art.stockEntryId);
          const entrySnap = await getDoc(entryRef);
          
          if (entrySnap.exists()) {
            const currentEntry = entrySnap.data();
            const newQuantity = Math.max(0, Number(currentEntry.quantite || 0) - Number(art.quantite || 0));
            
            await updateDoc(entryRef, {
              quantite: newQuantity,
              modifiePar: user.uid,
              modifieLe: Timestamp.now()
            });
          }
        } else {
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
              modifieLe: Timestamp.now()
            });
          }
        }
      } catch (error) {
        console.error(`Erreur stock ${art.produit}:`, error);
      }
    }
  };

  const updateStockOnCancel = async (vente) => {
    if (!user || !societeId) return;
    
    for (const art of vente.articles || []) {
      try {
        if (art.stockEntryId) {
          const entryRef = doc(db, "societe", societeId, "stock_entries", art.stockEntryId);
          const entrySnap = await getDoc(entryRef);
          
          if (entrySnap.exists()) {
            const currentEntry = entrySnap.data();
            await updateDoc(entryRef, {
              quantite: Number(currentEntry.quantite || 0) + Number(art.quantite || 0),
              modifiePar: user.uid,
              modifieLe: Timestamp.now()
            });
          }
        } else {
          const stockRef = collection(db, "societe", societeId, "stock");
          const q = query(stockRef, where("nom", "==", art.produit || ""));
          const stockSnap = await getDocs(q);
          
          if (!stockSnap.empty) {
            const docId = stockSnap.docs[0].id;
            const current = stockSnap.docs[0].data();
            
            await updateDoc(doc(db, "societe", societeId, "stock", docId), {
              quantite: Number(current.quantite || 0) + Number(art.quantite || 0),
              modifiePar: user.uid,
              modifieLe: Timestamp.now()
            });
          }
        }
      } catch (error) {
        console.error(`Erreur restauration ${art.produit}:`, error);
      }
    }
  };

  // ============ IMPRESSION ============
  const generateCachetHtml = () => {
    if (!parametres.afficherCachet) return '';
    
    const taille = parametres.tailleCachet || 120;
    
    if (parametres.typeCachet === "image" && parametres.cachetImage) {
      return `
        <div style="text-align: center; flex: 1;">
          <img 
            src="${parametres.cachetImage}" 
            alt="Cachet"
            style="max-width: ${taille}px; max-height: ${taille}px; border-radius: 8px;"
          />
        </div>
      `;
    } else {
      return `
        <div style="text-align: center; flex: 1;">
          <div style="
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
            max-width: ${taille}px;
          ">
            ${parametres.cachetTexte || "Cachet Société"}
          </div>
        </div>
      `;
    }
  };

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
          <title>Bon de Vente N°${vente.id.slice(-6).toUpperCase()}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; padding: 20px; border-bottom: 3px solid #2563eb; }
            .header h1 { color: #2563eb; margin-bottom: 10px; font-size: 24px; }
            .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #2563eb; color: white; padding: 12px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
            .lot-info { font-size: 11px; color: #6b7280; margin-top: 4px; padding: 4px; background: #f3f4f6; }
            .totals { margin-top: 20px; padding: 20px; background: #2563eb; color: white; text-align: right; }
            .signature-section { margin-top: 50px; display: flex; justify-content: space-between; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { border-bottom: 2px solid #333; margin-bottom: 8px; height: 50px; }
            .footer { text-align: center; margin-top: 30px; padding: 20px; border-top: 2px solid #2563eb; }
            ${hasLotInfo ? '.multi-lot-indicator { background: #dcfce7; color: #16a34a; padding: 8px 16px; border-radius: 20px; font-size: 14px; margin-top: 10px; display: inline-block; }' : ''}
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${parametres.entete}</h1>
            <h2>BON DE VENTE N°${vente.id.slice(-6).toUpperCase()}</h2>
            ${hasLotInfo ? '<div class="multi-lot-indicator">Vente avec traçabilité multi-lots</div>' : ''}
          </div>
          
          <div class="info-section">
            <div>
              <p><strong>Client:</strong> ${vente.client}</p>
              <p><strong>Date:</strong> ${formatDateSafe(vente.date)}</p>
            </div>
            <div>
              <p><strong>Statut:</strong> ${vente.statutPaiement}</p>
              <p><strong>Mode:</strong> ${vente.modePaiement || "Espèces"}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Produit${hasLotInfo ? ' / Traçabilité' : ''}</th>
                <th>Quantité</th>
                <th>Prix Unit.</th>
                <th>Remise</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${articles.map(a => {
                const isExpired = a.datePeremption && safeParseDate(a.datePeremption) < new Date();
                const isExpiringSoon = a.datePeremption && !isExpired && 
                  safeParseDate(a.datePeremption) <= new Date(Date.now() + 30*24*60*60*1000);
                
                return `
                <tr>
                  <td>
                    <strong>${a.produit}</strong>
                    ${a.numeroLot || a.fournisseur || a.datePeremption ? `
                      <div class="lot-info">
                        ${a.numeroLot ? `<span style="background: #dcfce7; color: #16a34a; padding: 2px 6px; border-radius: 8px; font-size: 10px; margin-right: 4px;">Lot: ${a.numeroLot}</span>` : ''}
                        ${a.fournisseur ? `<span style="background: #dbeafe; color: #2563eb; padding: 2px 6px; border-radius: 8px; font-size: 10px; margin-right: 4px;">Fournisseur: ${a.fournisseur}</span>` : ''}
                        ${a.datePeremption ? `
                          <div style="margin-top: 4px;">
                            Expiration: 
                            <span style="color: ${isExpired ? '#dc2626' : isExpiringSoon ? '#d97706' : '#6b7280'}; font-weight: 600;">
                              ${a.datePeremption}
                              ${isExpired ? ' ⚠️ EXPIRÉ' : isExpiringSoon ? ' ⏰ Expire bientôt' : ''}
                            </span>
                          </div>
                        ` : ''}
                      </div>
                    ` : ''}
                  </td>
                  <td>${a.quantite || 0}</td>
                  <td>${(a.prixUnitaire || 0).toFixed(2)} DH</td>
                  <td>${(a.remise || 0).toFixed(2)} DH</td>
                  <td style="font-weight: 600;">
                    ${((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)).toFixed(2)} DH
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            ${vente.remiseTotal ? `
              <div style="margin-bottom: 10px;">
                Sous-total: ${(total + vente.remiseTotal).toFixed(2)} DH
              </div>
              <div style="margin-bottom: 10px;">
                Remise totale: -${vente.remiseTotal.toFixed(2)} DH
              </div>
            ` : ''}
            <div style="font-size: 20px; font-weight: bold;">
              TOTAL: ${total.toFixed(2)} DH
            </div>
          </div>
          
          ${vente.notes ? `
            <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-left: 5px solid #f59e0b;">
              <strong>Notes:</strong> ${vente.notes}
            </div>
          ` : ''}
          
          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line"></div>
              <p>Signature Client</p>
            </div>
            ${cachetHtml}
            <div class="signature-box">
              <div class="signature-line"></div>
              <p>Signature Vendeur</p>
            </div>
          </div>
          
          <div class="footer">
            <p>${parametres.pied}</p>
            ${hasLotInfo ? '<p style="margin-top: 10px; color: #16a34a;">Vente avec traçabilité multi-lots • Qualité et sécurité garanties</p>' : ''}
            <p style="font-size: 12px; color: #6b7280; margin-top: 10px;">
              Document imprimé le ${new Date().toLocaleString('fr-FR')} par ${user.email || 'Utilisateur'}
            </p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // ============ UTILITAIRES ============
  const resetForm = () => {
    setClient("(passant)");
    setDateVente(new Date().toISOString().split('T')[0]);
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
    setEditId(null);
    setIsEditing(false);
    setError("");
  };

  const totalVenteCourante = useMemo(() => {
    return articles.reduce(
      (t, a) => t + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
      0
    );
  }, [articles]);

  const ventesFiltrees = useMemo(() => {
    return ventes.filter((v) => {
      let keep = true;
      
      if (filterStatut && v.statutPaiement !== filterStatut) keep = false;
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const clientMatch = v.client?.toLowerCase().includes(search);
        const produitMatch = v.articles?.some(a => 
          a.produit?.toLowerCase().includes(search) ||
          a.numeroLot?.toLowerCase().includes(search)
        );
        keep = keep && (clientMatch || produitMatch);
      }
      
      return keep;
    });
  }, [ventes, filterStatut, searchTerm]);

  // ============ HOOKS ============
  useEffect(() => {
    fetchVentes();
  }, [fetchVentes]);

  useEffect(() => {
    fetchMedicaments();
    fetchStockEntries();
    fetchParametres();
  }, [fetchMedicaments, fetchStockEntries, fetchParametres]);

  useEffect(() => {
    if (!isEditing) {
      resetForm();
    }
  }, []);

  // ============ RENDU ============
  if (waiting) {
    return (
      <div style={{ 
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '4px solid rgba(255, 255, 255, 0.3)',
            borderTop: '4px solid white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <h3 style={{ margin: 0, fontSize: '18px' }}>Chargement en cours...</h3>
          <style>
            {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
          </style>
        </div>
      </div>
    );
  }

  if (!user || !societeId) {
    return (
      <div style={{ 
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        color: 'white'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          borderRadius: '16px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '18px' }}>Accès non autorisé</h3>
          <p style={{ margin: 0, opacity: 0.9 }}>Utilisateur non connecté ou société non sélectionnée.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif'
    }}>
      {/* Header moderne */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        padding: '30px',
        marginBottom: '30px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px'
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '32px',
              fontWeight: '800',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              Gestion des Ventes
            </h1>
            <p style={{
              margin: '8px 0 0',
              color: '#6b7280',
              fontSize: '16px'
            }}>
              Système de vente multi-lots avec traçabilité complète
            </p>
          </div>
          
          <button
            onClick={() => {
              setShowForm(!showForm);
              if (!showForm) resetForm();
            }}
            style={{
              background: showForm 
                ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: 'white',
              border: 'none',
              padding: '16px 32px',
              borderRadius: '16px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 8px 25px rgba(59, 130, 246, 0.3)',
              transform: 'translateY(0)',
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 12px 35px rgba(59, 130, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.3)';
            }}
          >
            {showForm ? '✕ Fermer' : '+ Nouvelle Vente'}
          </button>
        </div>
      </div>

      {/* Notifications modernes */}
      {error && (
        <div style={{
          background: 'rgba(254, 226, 226, 0.95)',
          backdropFilter: 'blur(10px)',
          color: '#dc2626',
          padding: '20px',
          borderRadius: '16px',
          marginBottom: '24px',
          border: '1px solid rgba(220, 38, 38, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 8px 25px rgba(220, 38, 38, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#dc2626',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: '600'
            }}>!</div>
            <span style={{ fontSize: '16px', fontWeight: '500' }}>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            style={{
              background: 'none',
              border: 'none',
              color: '#dc2626',
              cursor: 'pointer',
              fontSize: '24px',
              padding: '4px',
              borderRadius: '8px',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(220, 38, 38, 0.1)'}
            onMouseLeave={(e) => e.target.style.background = 'none'}
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div style={{
          background: 'rgba(220, 252, 231, 0.95)',
          backdropFilter: 'blur(10px)',
          color: '#16a34a',
          padding: '20px',
          borderRadius: '16px',
          marginBottom: '24px',
          border: '1px solid rgba(22, 163, 74, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 8px 25px rgba(22, 163, 74, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#16a34a',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: '600'
            }}>✓</div>
            <span style={{ fontSize: '16px', fontWeight: '500' }}>{success}</span>
          </div>
          <button
            onClick={() => setSuccess("")}
            style={{
              background: 'none',
              border: 'none',
              color: '#16a34a',
              cursor: 'pointer',
              fontSize: '24px',
              padding: '4px',
              borderRadius: '8px',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(22, 163, 74, 0.1)'}
            onMouseLeave={(e) => e.target.style.background = 'none'}
          >
            ×
          </button>
        </div>
      )}

      {/* Formulaire moderne */}
      {showForm && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '32px',
          marginBottom: '30px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            margin: '0 0 32px',
            fontSize: '28px',
            fontWeight: '700',
            color: '#1f2937',
            textAlign: 'center'
          }}>
            {isEditing ? 'Modifier la vente' : 'Nouvelle vente multi-lots'}
          </h2>

          {/* Section ajout d'articles */}
          <div style={{
            background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
            borderRadius: '20px',
            padding: '24px',
            marginBottom: '32px',
            border: '2px solid #0ea5e9'
          }}>
            <h3 style={{
              margin: '0 0 24px',
              color: '#0c4a6e',
              fontSize: '20px',
              fontWeight: '600'
            }}>
              Ajouter des articles
            </h3>

            <form onSubmit={handleAddArticle}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '20px',
                marginBottom: '24px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Médicament *
                  </label>
                  <select 
                    value={produit} 
                    onChange={(e) => handleProduitChange(e.target.value)} 
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      fontSize: '16px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                    <option value="">-- Sélectionner un médicament --</option>
                    {getAllAvailableMedicaments.map(m => (
                      <option key={m.nom} value={m.nom}>
                        {m.nom} ({m.hasLots ? "Lots" : "Stock"}: {m.quantiteTotal})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Quantité *
                  </label>
                  <input 
                    type="number" 
                    value={quantite} 
                    onChange={(e) => setQuantite(e.target.value)} 
                    required 
                    min={1}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      fontSize: '16px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
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
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      fontSize: '16px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Remise (DH)
                  </label>
                  <input 
                    type="number" 
                    value={remiseArticle} 
                    onChange={(e) => setRemiseArticle(e.target.value)} 
                    min={0}
                    step="0.01"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      fontSize: '16px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              </div>

              {/* Sélection des lots */}
              {availableLots.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '16px'
                  }}>
                    Sélectionner un lot spécifique (FIFO recommandé)
                  </label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '16px'
                  }}>
                    {availableLots.map(lot => {
                      const lotDate = safeParseDate(lot.datePeremption);
                      const isExpired = lotDate && lotDate < new Date();
                      const isExpiringSoon = lotDate && !isExpired && 
                        lotDate <= new Date(Date.now() + 30*24*60*60*1000);
                      
                      return (
                        <div
                          key={lot.id}
                          onClick={() => handleLotSelection(lot.id)}
                          style={{
                            padding: '16px',
                            borderRadius: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            border: selectedLot === lot.id ? '3px solid #10b981' : '2px solid #e5e7eb',
                            background: selectedLot === lot.id 
                              ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' 
                              : isExpired 
                              ? 'linear-gradient(135deg, #fee2e2, #fecaca)'
                              : isExpiringSoon
                              ? 'linear-gradient(135deg, #fef3c7, #fed7aa)'
                              : 'linear-gradient(135deg, #f9fafb, #f3f4f6)',
                            transform: selectedLot === lot.id ? 'scale(1.02)' : 'scale(1)',
                            boxShadow: selectedLot === lot.id 
                              ? '0 12px 25px rgba(16, 185, 129, 0.2)' 
                              : '0 4px 12px rgba(0, 0, 0, 0.05)'
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '8px'
                          }}>
                            <span style={{
                              fontWeight: '700',
                              fontSize: '16px',
                              color: '#1f2937'
                            }}>
                              Lot: {lot.numeroLot}
                            </span>
                            <span style={{
                              background: selectedLot === lot.id ? '#10b981' : '#6b7280',
                              color: 'white',
                              padding: '4px 12px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              Qté: {lot.quantite}
                            </span>
                          </div>
                          
                          <div style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            marginBottom: '8px'
                          }}>
                            <span style={{
                              background: '#dbeafe',
                              color: '#2563eb',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              marginRight: '8px',
                              fontSize: '12px',
                              fontWeight: '500'
                            }}>
                              {lot.fournisseur}
                            </span>
                            <span style={{
                              background: '#f3e8ff',
                              color: '#7c3aed',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {lot.prixVente} DH
                            </span>
                          </div>
                          
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: isExpired ? '#dc2626' : isExpiringSoon ? '#d97706' : '#16a34a'
                          }}>
                            Exp: {lot.datePeremption}
                            {isExpired && ' ⚠️ EXPIRÉ'}
                            {isExpiringSoon && ' ⏰ Expire bientôt'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white',
                    border: 'none',
                    padding: '14px 32px',
                    borderRadius: '16px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.7 : 1,
                    transition: 'all 0.3s ease',
                    boxShadow: '0 8px 25px rgba(16, 185, 129, 0.3)',
                    transform: 'translateY(0)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 12px 35px rgba(16, 185, 129, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.3)';
                  }}
                >
                  {isSaving ? 'Ajout...' : 'Ajouter l\'article'}
                </button>
              </div>
            </form>
          </div>

          {/* Liste des articles */}
          {articles.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #fff7ed, #fed7aa)',
              borderRadius: '20px',
              padding: '24px',
              marginBottom: '32px',
              border: '2px solid #f97316'
            }}>
              <h3 style={{
                margin: '0 0 20px',
                color: '#c2410c',
                fontSize: '20px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                Articles de la vente ({articles.length})
              </h3>

              <div style={{
                background: 'white',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{
                        background: 'linear-gradient(135deg, #f97316, #ea580c)',
                        color: 'white'
                      }}>
                        <th style={{ 
                          padding: '16px',
                          textAlign: 'left',
                          fontWeight: '600',
                          fontSize: '14px',
                          letterSpacing: '0.5px'
                        }}>
                          Produit / Traçabilité
                        </th>
                        <th style={{ 
                          padding: '16px',
                          textAlign: 'center',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          Qté
                        </th>
                        <th style={{ 
                          padding: '16px',
                          textAlign: 'right',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          Prix unit.
                        </th>
                        <th style={{ 
                          padding: '16px',
                          textAlign: 'right',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          Remise
                        </th>
                        <th style={{ 
                          padding: '16px',
                          textAlign: 'right',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          Total
                        </th>
                        <th style={{ 
                          padding: '16px',
                          textAlign: 'center',
                          fontWeight: '600',
                          fontSize: '14px',
                          width: '60px'
                        }}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {articles.map((a, i) => (
                        <tr key={i} style={{
                          borderBottom: '1px solid #f3f4f6',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.target.closest('tr').style.background = '#fafafa'}
                        onMouseLeave={(e) => e.target.closest('tr').style.background = 'white'}>
                          <td style={{ padding: '16px' }}>
                            <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                              {a.produit}
                            </div>
                            {(a.numeroLot || a.fournisseur || a.datePeremption) && (
                              <div style={{
                                fontSize: '12px',
                                color: '#6b7280',
                                background: '#f8fafc',
                                padding: '8px',
                                borderRadius: '8px',
                                border: '1px solid #e5e7eb'
                              }}>
                                {a.numeroLot && (
                                  <span style={{
                                    background: '#dcfce7',
                                    color: '#16a34a',
                                    padding: '2px 6px',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    marginRight: '6px'
                                  }}>
                                    Lot: {a.numeroLot}
                                  </span>
                                )}
                                {a.fournisseur && (
                                  <span style={{
                                    background: '#dbeafe',
                                    color: '#2563eb',
                                    padding: '2px 6px',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    marginRight: '6px'
                                  }}>
                                    {a.fournisseur}
                                  </span>
                                )}
                                {a.datePeremption && (
                                  <div style={{ marginTop: '4px', fontSize: '11px' }}>
                                    Exp: {a.datePeremption}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'center',
                            fontWeight: '600',
                            fontSize: '16px'
                          }}>
                         {safeNumber(a.quantite)}
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'right',
                            fontWeight: '500',
                            fontSize: '15px'
                          }}>
                           {safeToFixed(a.prixUnitaire)} DH
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'right',
                            fontWeight: '500',
                            fontSize: '15px',
                            color: safeNumber(a.remise) > 0 ? '#dc2626' : '#6b7280'
                          }}>
                           {safeToFixed(a.remise)} DH
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'right',
                            fontWeight: '700',
                            fontSize: '16px',
                            color: '#16a34a'
                          }}>
                           {safeToFixed(safeNumber(a.prixUnitaire) * safeNumber(a.quantite) - safeNumber(a.remise))} DH
                          </td>
                          <td style={{
                            padding: '16px',
                            textAlign: 'center'
                          }}>
                            <button 
                              onClick={() => handleRemoveArticle(i)}
                              style={{
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.transform = 'scale(1.05)';
                                e.target.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.transform = 'scale(1)';
                                e.target.style.boxShadow = 'none';
                              }}
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{
                        background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                        borderTop: '2px solid #16a34a'
                      }}>
                        <td colSpan={4} style={{
                          padding: '20px',
                          textAlign: 'right',
                          fontSize: '18px',
                          fontWeight: '700',
                          color: '#15803d'
                        }}>
                          TOTAL DE LA VENTE
                        </td>
                        <td style={{
                          padding: '20px',
                          textAlign: 'right',
                          fontSize: '22px',
                          fontWeight: '800',
                          color: '#16a34a'
                        }}>
                          {safeToFixed(totalVenteCourante)} DH
                        </td>
                        <td style={{ padding: '20px' }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section finalisation de la vente */}
          <div style={{
            background: 'linear-gradient(135deg, #f3e8ff, #e9d5ff)',
            borderRadius: '20px',
            padding: '24px',
            border: '2px solid #8b5cf6'
          }}>
            <h3 style={{
              margin: '0 0 24px',
              color: '#581c87',
              fontSize: '20px',
              fontWeight: '600'
            }}>
              Finaliser la vente
            </h3>

            <form onSubmit={handleAddVente}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '20px',
                marginBottom: '24px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
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
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      fontSize: '16px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                  <datalist id="clients-list">
                    {clients.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Date de vente *
                  </label>
                  <input 
                    type="date" 
                    value={dateVente} 
                    onChange={(e) => setDateVente(e.target.value)} 
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      fontSize: '16px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Statut de paiement
                  </label>
                  <select 
                    value={statutPaiement} 
                    onChange={(e) => setStatutPaiement(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      fontSize: '16px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                    <option value="payé">Payé</option>
                    <option value="partiel">Partiel</option>
                    <option value="impayé">Impayé</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Mode de paiement
                  </label>
                  <select 
                    value={modePaiement} 
                    onChange={(e) => setModePaiement(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      fontSize: '16px',
                      background: 'white',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  >
                    <option value="Espèces">Espèces</option>
                    <option value="Carte">Carte bancaire</option>
                    <option value="Chèque">Chèque</option>
                    <option value="Virement">Virement</option>
                    <option value="Crédit">Crédit</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Notes / Observations
                </label>
                <textarea
                  value={notesVente}
                  onChange={(e) => setNotesVente(e.target.value)}
                  rows={3}
                  placeholder="Notes optionnelles sur la vente..."
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '2px solid #e5e7eb',
                    fontSize: '16px',
                    background: 'white',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div style={{
                display: 'flex',
                gap: '16px',
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}>
                {isEditing && (
                  <button 
                    type="button" 
                    onClick={resetForm}
                    style={{
                      background: 'linear-gradient(135deg, #6b7280, #4b5563)',
                      color: 'white',
                      border: 'none',
                      padding: '14px 32px',
                      borderRadius: '16px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 8px 25px rgba(107, 114, 128, 0.3)',
                      transform: 'translateY(0)'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 12px 35px rgba(107, 114, 128, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 8px 25px rgba(107, 114, 128, 0.3)';
                    }}
                  >
                    Annuler
                  </button>
                )}
                
                <button 
                  type="submit" 
                  disabled={isSaving || articles.length === 0}
                  style={{
                    background: isEditing 
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)' 
                      : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    color: 'white',
                    border: 'none',
                    padding: '16px 40px',
                    borderRadius: '16px',
                    fontSize: '18px',
                    fontWeight: '700',
                    cursor: (isSaving || articles.length === 0) ? 'not-allowed' : 'pointer',
                    opacity: (isSaving || articles.length === 0) ? 0.6 : 1,
                    transition: 'all 0.3s ease',
                    boxShadow: '0 12px 35px rgba(139, 92, 246, 0.4)',
                    transform: 'translateY(0)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving && articles.length > 0) {
                      e.target.style.transform = 'translateY(-3px)';
                      e.target.style.boxShadow = '0 16px 45px rgba(139, 92, 246, 0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 12px 35px rgba(139, 92, 246, 0.4)';
                  }}
                >
                  {isSaving ? 'Enregistrement...' : (isEditing ? 'Modifier la vente' : 'Enregistrer la vente')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Section des filtres */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        padding: '24px',
        marginBottom: '24px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.08)'
      }}>
        <div style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: '1', minWidth: '250px' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Rechercher client, produit, numéro de lot..."
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: '25px',
                border: '2px solid #e5e7eb',
                fontSize: '16px',
                background: 'white',
                transition: 'all 0.3s ease',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <select 
            value={filterStatut} 
            onChange={e => setFilterStatut(e.target.value)}
            style={{
              padding: '12px 20px',
              borderRadius: '25px',
              border: '2px solid #e5e7eb',
              fontSize: '16px',
              background: 'white',
              transition: 'all 0.3s ease',
              outline: 'none',
              minWidth: '180px'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#3b82f6';
              e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e5e7eb';
              e.target.style.boxShadow = 'none';
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
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: 'white',
                border: 'none',
                padding: '12px 20px',
                borderRadius: '25px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 6px 20px rgba(239, 68, 68, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 8px 25px rgba(239, 68, 68, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.3)';
              }}
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Tableau des ventes */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ 
          overflowX: 'auto',
          maxHeight: '70vh',
          overflowY: 'auto'
        }}>
          <table style={{ 
            width: '100%', 
            minWidth: '1000px',
            borderCollapse: 'collapse'
          }}>
            <thead style={{
              position: 'sticky',
              top: 0,
              background: 'linear-gradient(135deg, #1e293b, #334155)',
              color: 'white',
              zIndex: 10
            }}>
              <tr>
                <th style={{
                  padding: '20px',
                  textAlign: 'left',
                  fontWeight: '700',
                  fontSize: '14px',
                  letterSpacing: '0.5px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  N° VENTE
                </th>
                <th style={{
                  padding: '20px',
                  textAlign: 'left',
                  fontWeight: '700',
                  fontSize: '14px',
                  letterSpacing: '0.5px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  CLIENT
                </th>
                <th style={{
                  padding: '20px',
                  textAlign: 'center',
                  fontWeight: '700',
                  fontSize: '14px',
                  letterSpacing: '0.5px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  DATE
                </th>
                <th style={{
                  padding: '20px',
                  textAlign: 'center',
                  fontWeight: '700',
                  fontSize: '14px',
                  letterSpacing: '0.5px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  ARTICLES
                </th>
                <th style={{
                  padding: '20px',
                  textAlign: 'center',
                  fontWeight: '700',
                  fontSize: '14px',
                  letterSpacing: '0.5px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  STATUT
                </th>
                <th style={{
                  padding: '20px',
                  textAlign: 'right',
                  fontWeight: '700',
                  fontSize: '14px',
                  letterSpacing: '0.5px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  TOTAL
                </th>
                <th style={{
                  padding: '20px',
                  textAlign: 'center',
                  fontWeight: '700',
                  fontSize: '14px',
                  letterSpacing: '0.5px',
                  width: '220px'
                }}>
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {ventesFiltrees.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '18px',
                    fontWeight: '500'
                  }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px'
                    }}>
                      <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #e5e7eb, #d1d5db)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px'
                      }}>
                        📊
                      </div>
                      <div>
                        <h3 style={{ margin: '0 0 8px', color: '#374151' }}>
                          {ventes.length === 0 ? 'Aucune vente enregistrée' : 'Aucun résultat'}
                        </h3>
                        <p style={{ margin: 0, color: '#9ca3af' }}>
                          {ventes.length === 0 
                            ? 'Commencez par créer votre première vente'
                            : 'Aucune vente ne correspond aux critères de filtrage'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                ventesFiltrees.map((v, index) => {
                  const total = v.montantTotal || (Array.isArray(v.articles) ? v.articles : [])
                    .reduce((sum, a) => sum + (a.prixUnitaire * a.quantite - (a.remise || 0)), 0);
                  
                  const articlesAvecLots = (v.articles || []).filter(a => a.numeroLot).length;
                  const totalArticles = (v.articles || []).length;
                  
                  return (
                    <tr key={v.id} style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'all 0.3s ease',
                      background: index % 2 === 0 ? 'rgba(248, 250, 252, 0.5)' : 'white'
                    }}
                    onMouseEnter={(e) => {
                      const tr = e.target.closest('tr');
                      tr.style.background = 'linear-gradient(135deg, #f0f9ff, #e0f2fe)';
                      tr.style.transform = 'scale(1.001)';
                      tr.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      const tr = e.target.closest('tr');
                      tr.style.background = index % 2 === 0 ? 'rgba(248, 250, 252, 0.5)' : 'white';
                      tr.style.transform = 'scale(1)';
                      tr.style.boxShadow = 'none';
                    }}>
                      <td style={{ 
                        padding: '20px',
                        borderRight: '1px solid #f1f5f9'
                      }}>
                        <div style={{
                          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          letterSpacing: '0.5px',
                          display: 'inline-block'
                        }}>
                          #{v.id.slice(-6).toUpperCase()}
                        </div>
                      </td>
                      <td style={{ 
                        padding: '20px',
                        borderRight: '1px solid #f1f5f9'
                      }}>
                        <div style={{
                          fontWeight: '600',
                          fontSize: '16px',
                          color: '#1f2937',
                          marginBottom: '4px'
                        }}>
                          {v.client}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          background: '#f8fafc',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          display: 'inline-block'
                        }}>
                          {v.modePaiement || 'Espèces'}
                        </div>
                      </td>
                      <td style={{ 
                        padding: '20px',
                        textAlign: 'center',
                        borderRight: '1px solid #f1f5f9'
                      }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#374151'
                        }}>
                          {formatDateSafe(v.date)}
                        </div>
                      </td>
                      <td style={{ 
                        padding: '20px',
                        textAlign: 'center',
                        borderRight: '1px solid #f1f5f9'
                      }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                          <span style={{
                            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                            color: 'white',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {totalArticles}
                          </span>
                          {articlesAvecLots > 0 && (
                            <span style={{
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              {articlesAvecLots} tracés
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ 
                        padding: '20px',
                        textAlign: 'center',
                        borderRight: '1px solid #f1f5f9'
                      }}>
                        <span style={{
                          background: v.statutPaiement === 'payé' 
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)' 
                            : v.statutPaiement === 'partiel' 
                            ? 'linear-gradient(135deg, #eab308, #ca8a04)' 
                            : 'linear-gradient(135deg, #ef4444, #dc2626)',
                          color: 'white',
                          padding: '6px 16px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600',
                          textTransform: 'capitalize'
                        }}>
                          {v.statutPaiement}
                        </span>
                      </td>
                      <td style={{ 
                        padding: '20px',
                        textAlign: 'right',
                        borderRight: '1px solid #f1f5f9'
                      }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: '#16a34a'
                        }}>
                         {safeToFixed(total)} DH
                        </div>
                      </td>
                      <td style={{ 
                        padding: '20px',
                        textAlign: 'center'
                      }}>
                        <div style={{
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'center'
                        }}>
                         <span
  onClick={() => handleViewDetails(v)}
  style={{
    cursor: "pointer",
    fontSize: "18px",
    transition: "transform 0.2s ease"
  }}
  onMouseEnter={(e) => {
    e.target.style.transform = "scale(1.2)";
  }}
  onMouseLeave={(e) => {
    e.target.style.transform = "scale(1)";
  }}
>
  👁️
</span>

                        
<span
  onClick={() => handleEditVente(v)}
  style={{
    cursor: "pointer",
    fontSize: "18px",
    marginRight: "10px",
    transition: "transform 0.2s ease"
  }}
  onMouseEnter={(e) => {
    e.target.style.transform = "scale(1.2)";
  }}
  onMouseLeave={(e) => {
    e.target.style.transform = "scale(1)";
  }}
>
  ✏️
</span>

{/* Icône Imprimer 🖨️ */}
<span
  onClick={() => handlePrintVente(v)}
  style={{
    cursor: "pointer",
    fontSize: "18px",
    marginRight: "10px",
    transition: "transform 0.2s ease"
  }}
  onMouseEnter={(e) => {
    e.target.style.transform = "scale(1.2)";
  }}
  onMouseLeave={(e) => {
    e.target.style.transform = "scale(1)";
  }}
>
  🖨️
</span>

{/* Icône Supprimer 🗑️ */}
<span
  onClick={() => handleDeleteVente(v)}
  style={{
    cursor: "pointer",
    fontSize: "18px",
    transition: "transform 0.2s ease"
  }}
  onMouseEnter={(e) => {
    e.target.style.transform = "scale(1.2)";
  }}
  onMouseLeave={(e) => {
    e.target.style.transform = "scale(1)";
  }}
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

    {/* Modal de détails via Portal (ignore les parents overflow/transform) */}
{showDetails && selectedVente && createPortal(
  <div
    role="dialog"
    aria-modal="true"
    aria-label={`Détails de la vente ${selectedVente?.id?.slice?.(-6)?.toUpperCase?.() || ""}`}
    onClick={(e) => {
      if (e.target === e.currentTarget) setShowDetails(false);
    }}
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // z-index > MUI AppBar (1100) et Drawer (1200)
      zIndex: 20000,
      backdropFilter: 'blur(5px)',
      padding: '16px',
    }}
  >
    <div
      style={{
        background: 'linear-gradient(135deg, #ffffff, #f9fafb)',
        borderRadius: '20px',
        padding: '16px',
        width: 'min(100%, 980px)',
        maxHeight: '90vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(0, 0, 0, 0.05)',
        position: 'relative',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setShowDetails(false);
      }}
      tabIndex={-1}
    >
      {/* Header sticky (titre + bouton) */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'linear-gradient(135deg, #ffffff, #f9fafb)',
          padding: '12px 40px 12px 12px',
          margin: '-16px -16px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          minHeight: 48,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'clamp(18px, 2.5vw, 28px)',
            fontWeight: 700,
            color: '#1f2937',
            lineHeight: 1.2,
            flex: 1,
          }}
        >
          Détails de la vente #{selectedVente?.id?.slice?.(-6)?.toUpperCase?.() || "N/A"}
        </h2>

        {/* Bouton × visible et accessible */}
        <button
          onClick={() => setShowDetails(false)}
          aria-label="Fermer"
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            width: 36,
            height: 36,
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 10,
            fontSize: 24,
            lineHeight: 1,
            color: '#111827',
            cursor: 'pointer',
            transition: 'background 0.2s ease, transform 0.1s ease',
            zIndex: 3,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          ×
        </button>
      </div>

      {/* Cartes d'infos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 4px 15px rgba(59, 130, 246, 0.08)'
        }}>
          <h4 style={{ margin: '0 0 6px', color: '#1d4ed8', fontSize: '14px', fontWeight: 600 }}>Client</h4>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1f2937', wordBreak: 'break-word' }}>
            {selectedVente?.client || '-'}
          </p>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 4px 15px rgba(34, 197, 94, 0.08)'
        }}>
          <h4 style={{ margin: '0 0 6px', color: '#15803d', fontSize: '14px', fontWeight: 600 }}>Date</h4>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>
            {formatDateSafe?.(selectedVente?.date) || '-'}
          </p>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 4px 15px rgba(245, 158, 11, 0.08)'
        }}>
          <h4 style={{ margin: '0 0 6px', color: '#b45309', fontSize: '14px', fontWeight: 600 }}>Statut</h4>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>
            {selectedVente?.statutPaiement || '-'}
          </p>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #f3e8ff, #e9d5ff)',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 4px 15px rgba(168, 85, 247, 0.08)'
        }}>
          <h4 style={{ margin: '0 0 6px', color: '#7e22ce', fontSize: '14px', fontWeight: 600 }}>Mode</h4>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>
            {selectedVente?.modePaiement || 'Espèces'}
          </p>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 4px 15px rgba(16, 185, 129, 0.08)'
        }}>
          <h4 style={{ margin: '0 0 6px', color: '#065f46', fontSize: '14px', fontWeight: 600 }}>Total</h4>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1f2937' }}>
            {typeof safeToFixed === 'function'
              ? safeToFixed(selectedVente?.montantTotal)
              : (selectedVente?.montantTotal ?? 0)}
            {' '}DH
          </p>
        </div>
      </div>

      {/* Tableau des articles */}
      <h3 style={{
        margin: '0 0 12px',
        fontSize: 'clamp(16px, 2.2vw, 20px)',
        fontWeight: 600,
        color: '#374151'
      }}>
        Articles ({selectedVente?.articles?.length || 0})
      </h3>
      <div style={{
        background: '#fff',
        borderRadius: '14px',
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.05)',
        marginBottom: '20px',
        overflowX: 'auto'
      }}>
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{
              background: 'linear-gradient(135deg, #6d28d9, #5b21b6)',
              color: 'white'
            }}>
              <th style={{ padding: '12px', textAlign: 'left' }}>Produit / Traçabilité</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Qté</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Prix Unit.</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Remise</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(selectedVente?.articles || []).map((a, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', verticalAlign: 'top' }}>
                  <strong>{a?.produit || '-'}</strong>
                  {(a?.numeroLot || a?.fournisseur || a?.datePeremption) && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      {a?.numeroLot ? `Lot: ${a.numeroLot}` : ''}
                      {a?.fournisseur ? `${a?.numeroLot ? ' | ' : ''}Fournisseur: ${a.fournisseur}` : ''}
                      {a?.datePeremption ? `${(a?.numeroLot || a?.fournisseur) ? ' | ' : ''}Exp: ${a.datePeremption}` : ''}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  {typeof safeNumber === 'function' ? safeNumber(a?.quantite) : (a?.quantite ?? 0)}
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  {typeof safeToFixed === 'function' ? safeToFixed(a?.prixUnitaire) : (a?.prixUnitaire ?? 0)} DH
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  {typeof safeToFixed === 'function' ? safeToFixed(a?.remise) : (a?.remise ?? 0)} DH
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                  {typeof safeToFixed === 'function'
                    ? safeToFixed(
                        (typeof safeNumber === 'function' ? safeNumber(a?.prixUnitaire) : (a?.prixUnitaire ?? 0)) *
                        (typeof safeNumber === 'function' ? safeNumber(a?.quantite) : (a?.quantite ?? 0)) -
                        (typeof safeNumber === 'function' ? safeNumber(a?.remise) : (a?.remise ?? 0))
                      )
                    : (((a?.prixUnitaire ?? 0) * (a?.quantite ?? 0)) - (a?.remise ?? 0))}
                  {' '}DH
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {selectedVente?.notes && (
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <h4 style={{ margin: '0 0 6px', color: '#92400e', fontSize: '14px', fontWeight: 600 }}>Notes</h4>
          <p style={{ margin: 0, color: '#713f12', fontSize: '14px', lineHeight: 1.5 }}>{selectedVente.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => {
            setShowDetails(false);
            handleEditVente?.(selectedVente);
          }}
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: 'white',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(245, 158, 11, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
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
            background: 'linear-gradient(135deg, #6d28d9, #5b21b6)',
            color: 'white',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(109, 40, 217, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
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
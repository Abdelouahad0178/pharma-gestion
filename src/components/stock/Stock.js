import React, { useEffect, useState } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  Timestamp
} from "firebase/firestore";

export default function Stock() {
  const { user, societeId, loading } = useUserRole();

  // États principaux
  const [stock, setStock] = useState([]);
  const [filteredStock, setFilteredStock] = useState([]);
  const [stockEntries, setStockEntries] = useState([]); // 🆕 Entrées multi-lots
  const [filteredStockEntries, setFilteredStockEntries] = useState([]); // 🆕 Entrées filtrées
  const [retours, setRetours] = useState([]);
  const [filteredRetours, setFilteredRetours] = useState([]);

  // États formulaire stock traditionnel
  const [nom, setNom] = useState("");
  const [quantite, setQuantite] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [datePeremption, setDatePeremption] = useState("");
  const [editId, setEditId] = useState(null);

  // États retour
  const [openRetour, setOpenRetour] = useState(false);
  const [selectedProduit, setSelectedProduit] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null); // 🆕 Entrée sélectionnée pour retour
  const [quantiteRetour, setQuantiteRetour] = useState("");
  const [motifRetour, setMotifRetour] = useState("");
  const motifs = ["Expiration", "Destruction", "Cadeau", "Autre"];

  // Filtres Stock traditionnel
  const [filterStockNom, setFilterStockNom] = useState("");
  const [filterStockDateExp, setFilterStockDateExp] = useState("");
  const [filterStockQuantiteMin, setFilterStockQuantiteMin] = useState("");
  const [filterStockQuantiteMax, setFilterStockQuantiteMax] = useState("");
  const [showFiltresStock, setShowFiltresStock] = useState(false);

  // 🆕 Filtres Stock multi-lots
  const [filterEntryNom, setFilterEntryNom] = useState("");
  const [filterEntryFournisseur, setFilterEntryFournisseur] = useState("");
  const [filterEntryLot, setFilterEntryLot] = useState("");
  const [filterEntryDateExp, setFilterEntryDateExp] = useState("");
  const [filterEntryQuantiteMin, setFilterEntryQuantiteMin] = useState("");
  const [filterEntryQuantiteMax, setFilterEntryQuantiteMax] = useState("");
  const [showFiltresEntries, setShowFiltresEntries] = useState(false);

  // Filtres Retours
  const [filterProduit, setFilterProduit] = useState("");
  const [filterMotif, setFilterMotif] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [showFiltresRetours, setShowFiltresRetours] = useState(false);

  // États d'affichage
  const [showForm, setShowForm] = useState(false);
  const [showStockDetails, setShowStockDetails] = useState(true); // 🆕 Afficher détails multi-lots par défaut
  const [viewMode, setViewMode] = useState("entries"); // 🆕 "entries" ou "traditional"
  const [waiting, setWaiting] = useState(true);

  // Vérification du chargement
  React.useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // 🆕 Charger les entrées de stock multi-lots
  const fetchStockEntries = async () => {
    if (!societeId) return setStockEntries([]);
    const snap = await getDocs(collection(db, "societe", societeId, "stock_entries"));
    let arr = [];
    snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
    // Trier par nom puis par date d'expiration
    arr.sort((a, b) => {
      if (a.nom !== b.nom) return a.nom.localeCompare(b.nom);
      return new Date(a.datePeremption || 0) - new Date(b.datePeremption || 0);
    });
    setStockEntries(arr);
    setFilteredStockEntries(arr);
  };

  // Charger Stock traditionnel
  const fetchStock = async () => {
    if (!societeId) return setStock([]);
    const snap = await getDocs(collection(db, "societe", societeId, "stock"));
    let arr = [];
    snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
    arr.sort((a, b) => a.nom.localeCompare(b.nom));
    setStock(arr);
    setFilteredStock(arr);
  };

  const fetchRetours = async () => {
    if (!societeId) return setRetours([]);
    const snap = await getDocs(collection(db, "societe", societeId, "retours"));
    let arr = [];
    snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
    arr.sort((a, b) =>
      (b.date?.seconds || 0) - (a.date?.seconds || 0)
    );
    setRetours(arr);
    setFilteredRetours(arr);
  };

  useEffect(() => {
    fetchStock();
    fetchStockEntries(); // 🆕
    fetchRetours();
  }, [societeId]);

  // Filtrage Stock traditionnel
  useEffect(() => {
    let filtered = stock;
    if (filterStockNom)
      filtered = filtered.filter((s) => s.nom.toLowerCase().includes(filterStockNom.toLowerCase()));
    if (filterStockDateExp)
      filtered = filtered.filter((s) => s.datePeremption && new Date(s.datePeremption) <= new Date(filterStockDateExp));
    if (filterStockQuantiteMin)
      filtered = filtered.filter((s) => s.quantite >= Number(filterStockQuantiteMin));
    if (filterStockQuantiteMax)
      filtered = filtered.filter((s) => s.quantite <= Number(filterStockQuantiteMax));
    setFilteredStock(filtered);
  }, [filterStockNom, filterStockDateExp, filterStockQuantiteMin, filterStockQuantiteMax, stock]);

  // 🆕 Filtrage Stock multi-lots
  useEffect(() => {
    let filtered = stockEntries;
    if (filterEntryNom)
      filtered = filtered.filter((s) => s.nom?.toLowerCase().includes(filterEntryNom.toLowerCase()));
    if (filterEntryFournisseur)
      filtered = filtered.filter((s) => s.fournisseur?.toLowerCase().includes(filterEntryFournisseur.toLowerCase()));
    if (filterEntryLot)
      filtered = filtered.filter((s) => s.numeroLot?.toLowerCase().includes(filterEntryLot.toLowerCase()));
    if (filterEntryDateExp)
      filtered = filtered.filter((s) => s.datePeremption && new Date(s.datePeremption) <= new Date(filterEntryDateExp));
    if (filterEntryQuantiteMin)
      filtered = filtered.filter((s) => s.quantite >= Number(filterEntryQuantiteMin));
    if (filterEntryQuantiteMax)
      filtered = filtered.filter((s) => s.quantite <= Number(filterEntryQuantiteMax));
    setFilteredStockEntries(filtered);
  }, [filterEntryNom, filterEntryFournisseur, filterEntryLot, filterEntryDateExp, filterEntryQuantiteMin, filterEntryQuantiteMax, stockEntries]);

  // Filtrage Retours
  useEffect(() => {
    let filtered = retours;
    if (filterProduit) filtered = filtered.filter((r) => r.produit?.toLowerCase().includes(filterProduit.toLowerCase()));
    if (filterMotif) filtered = filtered.filter((r) => r.motif === filterMotif);
    if (filterDateMin) filtered = filtered.filter((r) => r.date?.seconds && (new Date(r.date.seconds * 1000) >= new Date(filterDateMin)));
    if (filterDateMax) filtered = filtered.filter((r) => r.date?.seconds && (new Date(r.date.seconds * 1000) <= new Date(filterDateMax)));
    setFilteredRetours(filtered);
  }, [filterProduit, filterMotif, filterDateMin, filterDateMax, retours]);

  // Ajouter / Modifier Stock traditionnel ✅ AVEC TRAÇABILITÉ
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    if (!nom || !quantite || !prixAchat || !prixVente) return;
    
    const data = {
      nom,
      quantite: Number(quantite),
      prixAchat: Number(prixAchat),
      prixVente: Number(prixVente),
      datePeremption
    };
    
    if (editId) {
      // ✅ MODIFICATION AVEC TRAÇABILITÉ
      await updateDoc(doc(db, "societe", societeId, "stock", editId), {
        ...data,
        // 🔧 CHAMPS DE TRAÇABILITÉ MODIFICATION
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });

      // Enregistrer l'activité de modification du stock
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "stock",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          produit: nom,
          quantite: Number(quantite),
          action: 'modification', // Spécifier l'action
          stockId: editId
        }
      });

      setEditId(null);
    } else {
      // ✅ CRÉATION AVEC TRAÇABILITÉ
      const newDocRef = await addDoc(collection(db, "societe", societeId, "stock"), {
        ...data,
        seuil: 5, // Valeur par défaut
        // 🔧 CHAMPS DE TRAÇABILITÉ CRÉATION
        creePar: user.uid,
        creeParEmail: user.email,
        creeLe: Timestamp.now(),
        societeId: societeId
      });

      // Enregistrer l'activité de création du stock
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "stock",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          produit: nom,
          quantite: Number(quantite),
          action: 'création', // Spécifier l'action
          stockId: newDocRef.id
        }
      });
    }
    
    setNom(""); setQuantite(""); setPrixAchat(""); setPrixVente(""); setDatePeremption("");
    fetchStock();
  };

  const handleEdit = (prod) => {
    setEditId(prod.id);
    setNom(prod.nom);
    setQuantite(prod.quantite);
    setPrixAchat(prod.prixAchat);
    setPrixVente(prod.prixVente);
    setDatePeremption(prod.datePeremption || "");
    setShowForm(true); // Ouvre le formulaire lors de la modification
  };

  const handleDelete = async (prod) => {
    if (!user || !societeId) return;
    if (window.confirm("Supprimer ce médicament ?")) {
      await deleteDoc(doc(db, "societe", societeId, "stock", prod.id));

      // Enregistrer l'activité de suppression du stock
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "stock",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          produit: prod.nom,
          quantite: prod.quantite,
          action: 'suppression', // Spécifier l'action
          stockId: prod.id
        }
      });

      fetchStock();
    }
  };

  // 🆕 Retour depuis une entrée spécifique (multi-lots)
  const handleOpenRetourEntry = (entry) => {
    setSelectedEntry(entry);
    setSelectedProduit(null);
    setQuantiteRetour("");
    setMotifRetour("");
    setOpenRetour(true);
  };

  // Retour depuis stock traditionnel ✅ AVEC TRAÇABILITÉ
  const handleOpenRetour = (prod) => {
    setSelectedProduit(prod);
    setSelectedEntry(null);
    setQuantiteRetour("");
    setMotifRetour("");
    setOpenRetour(true);
  };

  // 🆕 Gestion retour multi-lots
  const handleRetour = async () => {
    if (!user || !societeId) return;
    
    let produitNom, maxQuantite, sourceId, sourceType;
    
    if (selectedEntry) {
      // Retour depuis une entrée multi-lots
      produitNom = selectedEntry.nom;
      maxQuantite = selectedEntry.quantite;
      sourceId = selectedEntry.id;
      sourceType = "entry";
    } else if (selectedProduit) {
      // Retour depuis stock traditionnel
      produitNom = selectedProduit.nom;
      maxQuantite = selectedProduit.quantite;
      sourceId = selectedProduit.id;
      sourceType = "stock";
    } else {
      return alert("Erreur: aucun produit sélectionné !");
    }
    
    if (!quantiteRetour || quantiteRetour <= 0 || quantiteRetour > maxQuantite) {
      return alert("Quantité invalide !");
    }
    if (!motifRetour) return alert("Sélectionnez un motif !");
    
    const newQuantite = maxQuantite - Number(quantiteRetour);
    
    if (sourceType === "entry") {
      // ✅ MODIFICATION ENTRÉE MULTI-LOTS AVEC TRAÇABILITÉ
      await updateDoc(doc(db, "societe", societeId, "stock_entries", sourceId), { 
        quantite: newQuantite,
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
      
      // Mettre à jour le stock traditionnel correspondant
      const stockQuery = query(collection(db, "societe", societeId, "stock"), where("nom", "==", produitNom));
      const stockSnap = await getDocs(stockQuery);
      if (!stockSnap.empty) {
        const stockDoc = stockSnap.docs[0];
        const stockData = stockDoc.data();
        await updateDoc(doc(db, "societe", societeId, "stock", stockDoc.id), {
          quantite: Math.max(0, Number(stockData.quantite) - Number(quantiteRetour)),
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now()
        });
      }
    } else {
      // ✅ MODIFICATION STOCK TRADITIONNEL AVEC TRAÇABILITÉ
      await updateDoc(doc(db, "societe", societeId, "stock", sourceId), { 
        quantite: newQuantite,
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
    }
    
    // ✅ CRÉATION RETOUR AVEC TRAÇABILITÉ ÉTENDUE
    const retourData = {
      produit: produitNom,
      quantite: Number(quantiteRetour),
      motif: motifRetour,
      date: Timestamp.now(),
      creePar: user.uid,
      creeParEmail: user.email,
      creeLe: Timestamp.now(),
      societeId: societeId,
      // 🆕 Informations multi-lots
      sourceType: sourceType,
      sourceId: sourceId
    };
    
    if (selectedEntry) {
      retourData.numeroLot = selectedEntry.numeroLot;
      retourData.fournisseur = selectedEntry.fournisseur;
      retourData.datePeremption = selectedEntry.datePeremption;
    }
    
    const newRetourRef = await addDoc(collection(db, "societe", societeId, "retours"), retourData);

    // Enregistrer l'activité de création de retour
    await addDoc(collection(db, "societe", societeId, "activities"), {
      type: "retour",
      userId: user.uid,
      userEmail: user.email,
      timestamp: Timestamp.now(),
      details: {
        produit: produitNom,
        quantite: Number(quantiteRetour),
        motif: motifRetour,
        action: 'création',
        retourId: newRetourRef.id,
        numeroLot: selectedEntry?.numeroLot || null,
        fournisseur: selectedEntry?.fournisseur || null
      }
    });
    
    setOpenRetour(false);
    fetchStock();
    fetchStockEntries(); // 🆕
    fetchRetours();
  };

  // 🆕 Annulation retour améliorée pour multi-lots
  const handleCancelRetour = async (retour) => {
    if (!user || !societeId) return;
    if (!window.confirm("Annuler ce retour et réinjecter dans le stock si possible ?")) return;
    
    if (retour?.produit && retour.produit.trim() !== "") {
      if (retour.sourceType === "entry" && retour.sourceId) {
        // Réinjecter dans l'entrée spécifique
        try {
          await updateDoc(doc(db, "societe", societeId, "stock_entries", retour.sourceId), {
            quantite: Number(retour.quantite),
            modifiePar: user.uid,
            modifieParEmail: user.email,
            modifieLe: Timestamp.now()
          });
        } catch (error) {
          console.warn("Impossible de réinjecter dans l'entrée originale, tentative sur stock traditionnel");
        }
      }
      
      // Réinjecter dans le stock traditionnel
      const stockQuery = query(collection(db, "societe", societeId, "stock"), where("nom", "==", retour.produit));
      const stockSnap = await getDocs(stockQuery);
      if (!stockSnap.empty) {
        const stockDoc = stockSnap.docs[0];
        const stockData = stockDoc.data();
        
        await updateDoc(doc(db, "societe", societeId, "stock", stockDoc.id), {
          quantite: Number(stockData.quantite) + Number(retour.quantite),
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now()
        });
      }
    }
    
    await deleteDoc(doc(db, "societe", societeId, "retours", retour.id));

    // Enregistrer l'activité d'annulation de retour
    await addDoc(collection(db, "societe", societeId, "activities"), {
      type: "retour",
      userId: user.uid,
      userEmail: user.email,
      timestamp: Timestamp.now(),
      details: {
        produit: retour.produit,
        quantite: retour.quantite,
        motif: retour.motif,
        action: 'annulation_retour',
        retourId: retour.id,
        numeroLot: retour.numeroLot || null
      }
    });

    fetchStock();
    fetchStockEntries(); // 🆕
    fetchRetours();
  };

  // 🆕 Impression stock multi-lots
  const handlePrintStockEntries = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Stock Multi-Lots</title></head><body>
      <h2>Inventaire Stock Multi-Lots</h2>
      <table border="1" cellspacing="0" cellpadding="5">
        <tr><th>Médicament</th><th>Lot</th><th>Fournisseur</th><th>Qté</th><th>Prix Achat</th><th>Prix Vente</th><th>Date Exp.</th></tr>
        ${filteredStockEntries.map((p) => `<tr><td>${p.nom}</td><td>${p.numeroLot || "N/A"}</td><td>${p.fournisseur || "N/A"}</td><td>${p.quantite}</td><td>${p.prixAchat} DH</td><td>${p.prixVente} DH</td><td>${p.datePeremption || "N/A"}</td></tr>`).join("")}
      </table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrintStock = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Stock Traditionnel</title></head><body>
      <h2>Inventaire Stock Traditionnel</h2>
      <table border="1" cellspacing="0" cellpadding="5">
        <tr><th>Médicament</th><th>Qté</th><th>Prix Achat</th><th>Prix Vente</th><th>Date Exp.</th></tr>
        ${filteredStock.map((p) => `<tr><td>${p.nom}</td><td>${p.quantite}</td><td>${p.prixAchat} DH</td><td>${p.prixVente} DH</td><td>${p.datePeremption || "N/A"}</td></tr>`).join("")}
      </table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrintRetours = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Retours</title></head><body>
      <h2>Historique des Retours</h2>
      <table border="1" cellspacing="0" cellpadding="5">
        <tr><th>Produit</th><th>Quantité</th><th>Motif</th><th>Lot</th><th>Fournisseur</th><th>Date</th></tr>
        ${filteredRetours.map((r) => `<tr><td>${r.produit || "Non spécifié"}</td><td>${r.quantite}</td><td>${r.motif}</td><td>${r.numeroLot || "N/A"}</td><td>${r.fournisseur || "N/A"}</td><td>${r.date?.seconds ? new Date(r.date.seconds * 1000).toLocaleDateString() : ""}</td></tr>`).join("")}
      </table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // 🆕 Fonction pour obtenir les statistiques
  const getStats = () => {
    const totalMedicaments = new Set([...stock.map(s => s.nom), ...stockEntries.map(e => e.nom)]).size;
    const totalQuantiteTraditionnelle = stock.reduce((sum, s) => sum + s.quantite, 0);
    const totalQuantiteEntries = stockEntries.reduce((sum, e) => sum + e.quantite, 0);
    const totalFournisseurs = new Set(stockEntries.map(e => e.fournisseur).filter(Boolean)).size;
    const medicamentsExpires = stockEntries.filter(e => e.datePeremption && new Date(e.datePeremption) < new Date()).length;
    const medicamentsExpireSoon = stockEntries.filter(e => {
      if (!e.datePeremption) return false;
      const expDate = new Date(e.datePeremption);
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      return expDate <= soon && expDate >= new Date();
    }).length;

    return {
      totalMedicaments,
      totalQuantiteTraditionnelle,
      totalQuantiteEntries,
      totalFournisseurs,
      medicamentsExpires,
      medicamentsExpireSoon
    };
  };

  const stats = getStats();

  // AFFICHAGE conditionnel
  if (waiting) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#1c355e" }}>
        Chargement...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Non connecté.
      </div>
    );
  }

  if (!societeId) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Aucune société sélectionnée.
      </div>
    );
  }

  // --- RENDER ---
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion du Stock Multi-Lots</div>

      {/* 🆕 Statistiques du stock */}
      <div className="paper-card" style={{marginBottom: 20, padding: 20, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white'}}>
        <h3 style={{marginBottom: 15, textAlign: 'center', fontSize: '1.2rem'}}>📊 Tableau de Bord Stock</h3>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15}}>
          <div style={{textAlign: 'center', background: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 8}}>
            <div style={{fontSize: '1.5rem', fontWeight: 'bold'}}>{stats.totalMedicaments}</div>
            <div style={{fontSize: '0.9rem', opacity: 0.9}}>Médicaments uniques</div>
          </div>
          <div style={{textAlign: 'center', background: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 8}}>
            <div style={{fontSize: '1.5rem', fontWeight: 'bold'}}>{stats.totalQuantiteEntries}</div>
            <div style={{fontSize: '0.9rem', opacity: 0.9}}>Unités (Multi-lots)</div>
          </div>
          <div style={{textAlign: 'center', background: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 8}}>
            <div style={{fontSize: '1.5rem', fontWeight: 'bold'}}>{stats.totalFournisseurs}</div>
            <div style={{fontSize: '0.9rem', opacity: 0.9}}>Fournisseurs actifs</div>
          </div>
          <div style={{textAlign: 'center', background: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 8}}>
            <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: stats.medicamentsExpires > 0 ? '#ff6b6b' : 'white'}}>{stats.medicamentsExpires}</div>
            <div style={{fontSize: '0.9rem', opacity: 0.9}}>Lots expirés</div>
          </div>
          <div style={{textAlign: 'center', background: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 8}}>
            <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: stats.medicamentsExpireSoon > 0 ? '#feca57' : 'white'}}>{stats.medicamentsExpireSoon}</div>
            <div style={{fontSize: '0.9rem', opacity: 0.9}}>Expirent sous 180j</div>
          </div>
        </div>
      </div>

      {/* 🆕 Sélecteur de vue */}
      <div style={{display:"flex",alignItems:"center",gap:15,marginBottom:15,justifyContent:'center'}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1rem",
            padding:"8px 16px",
            background: viewMode === "entries" 
              ? "linear-gradient(90deg,#48bb78 50%,#38a169 100%)"
              : "linear-gradient(90deg,#cbd5e0 50%,#a0aec0 100%)",
            color: viewMode === "entries" ? "white" : "#2d3748"
          }}
          onClick={() => setViewMode("entries")}
        >
          📦 Vue Multi-Lots ({stockEntries.length} entrées)
        </button>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1rem",
            padding:"8px 16px",
            background: viewMode === "traditional" 
              ? "linear-gradient(90deg,#667eea 50%,#764ba2 100%)"
              : "linear-gradient(90deg,#cbd5e0 50%,#a0aec0 100%)",
            color: viewMode === "traditional" ? "white" : "#2d3748"
          }}
          onClick={() => setViewMode("traditional")}
        >
          📋 Vue Traditionnelle ({stock.length} produits)
        </button>
      </div>

      {/* Toggle FORMULAIRE ajout/modif (pour stock traditionnel) */}
      {viewMode === "traditional" && (
        <>
          <div style={{display:"flex",alignItems:"center",gap:11,marginTop:12,marginBottom:0}}>
            <button
              className="btn"
              type="button"
              style={{
                fontSize:"1.32em",
                padding:"2px 13px",
                minWidth:35,
                background:showForm
                  ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
                  : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
              }}
              onClick={()=>setShowForm(v=>!v)}
              aria-label="Afficher/Masquer le formulaire"
              title="Afficher/Masquer le formulaire"
            >
              {showForm ? "➖" : "➕"}
            </button>
            <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Formulaire ajout/modification (Stock traditionnel)</span>
          </div>

          {/* FORMULAIRE MASQUÉ par défaut */}
          {showForm && (
            <form onSubmit={handleSave} className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:14,justifyContent:'flex-start',marginBottom:10}}>
              <div><label>Médicament</label>
                <input className="w-full" value={nom} onChange={(e) => setNom(e.target.value)} required />
              </div>
              <div><label>Quantité</label>
                <input className="w-full" type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} required />
              </div>
              <div><label>Prix Achat</label>
                <input className="w-full" type="number" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} required />
              </div>
              <div><label>Prix Vente</label>
                <input className="w-full" type="number" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} required />
              </div>
              <div><label>Date Exp.</label>
                <input className="w-full" type="date" value={datePeremption} onChange={(e) => setDatePeremption(e.target.value)} />
              </div>
              <button className="btn" type="submit">{editId ? "Modifier" : "Ajouter"}</button>
              {editId && <button className="btn info" type="button" onClick={() => setEditId(null)}>Annuler</button>}
            </form>
          )}
        </>
      )}

      {/* VUE MULTI-LOTS */}
      {viewMode === "entries" && (
        <>
          {/* 🆕 Note explicative */}
          <div className="paper-card" style={{marginBottom: 15, padding: 15, background: '#e6fffa', border: '2px solid #81e6d9'}}>
            <p style={{margin: 0, color: '#2d3748', fontSize: '0.9rem', textAlign: 'center'}}>
              <strong>🏷️ Vue Multi-Lots :</strong> Chaque ligne représente un lot spécifique avec son fournisseur, numéro de lot et date d'expiration. 
              Les nouveaux lots sont créés automatiquement lors des achats.
            </p>
          </div>

          {/* Toggle filtres Entries */}
          <div style={{display:"flex",alignItems:"center",gap:11,marginTop:16,marginBottom:0}}>
            <button
              className="btn"
              type="button"
              style={{
                fontSize:"1.32em",
                padding:"2px 13px",
                minWidth:35,
                background:showFiltresEntries
                  ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
                  : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
              }}
              onClick={()=>setShowFiltresEntries(v=>!v)}
              aria-label="Afficher/Masquer les filtres Multi-Lots"
              title="Afficher/Masquer les filtres Multi-Lots"
            >
              {showFiltresEntries ? "➖" : "➕"}
            </button>
            <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Filtres Stock Multi-Lots</span>
          </div>
          {showFiltresEntries && (
            <div className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:11,alignItems:'center',marginBottom:8,marginTop:7}}>
              <div><label>Nom</label>
                <input value={filterEntryNom} onChange={(e) => setFilterEntryNom(e.target.value)} />
              </div>
              <div><label>Fournisseur</label>
                <input value={filterEntryFournisseur} onChange={(e) => setFilterEntryFournisseur(e.target.value)} />
              </div>
              <div><label>N° Lot</label>
                <input value={filterEntryLot} onChange={(e) => setFilterEntryLot(e.target.value)} />
              </div>
              <div><label>Date Exp. max</label>
                <input type="date" value={filterEntryDateExp} onChange={(e) => setFilterEntryDateExp(e.target.value)} />
              </div>
              <div><label>Qté min</label>
                <input type="number" value={filterEntryQuantiteMin} onChange={(e) => setFilterEntryQuantiteMin(e.target.value)} />
              </div>
              <div><label>Qté max</label>
                <input type="number" value={filterEntryQuantiteMax} onChange={(e) => setFilterEntryQuantiteMax(e.target.value)} />
              </div>
              <button className="btn info" type="button" onClick={handlePrintStockEntries}>🖨 Imprimer Multi-Lots</button>
            </div>
          )}

          {/* Tableau Stock Multi-Lots avec couleurs harmonisées */}
          <div className="table-pro-full" style={{marginTop:2, marginBottom:24}}>
            <table>
              <thead>
                <tr>
                  <th>Médicament</th>
                  <th>N° Lot</th>
                  <th style={{color: 'white', fontWeight: 'bold'}}>Fournisseur</th>
                  <th>Quantité</th>
                  <th>Prix Achat</th>
                  <th>Prix Vente</th>
                  <th style={{color: 'white', fontWeight: 'bold'}}>Date Exp.</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockEntries.filter(e => e.quantite > 0).map((entry) => {
                  const isExpired = entry.datePeremption && new Date(entry.datePeremption) < new Date();
                  const isExpiringSoon = entry.datePeremption && !isExpired && new Date(entry.datePeremption) <= new Date(Date.now() + 30*24*60*60*1000);
                  
                  return (
                    <tr key={entry.id} style={{
                      backgroundColor: isExpired ? '#fed7d7' : isExpiringSoon ? '#fefcbf' : 'white'
                    }}>
                      <td style={{fontWeight: 'bold'}}>{entry.nom}</td>
                      <td style={{fontFamily: 'monospace', fontSize: '0.9rem', color: '#667eea', fontWeight: 'bold'}}>
                        {entry.numeroLot || "N/A"}
                      </td>
                      <td style={{color: 'white', fontWeight: 'bold'}}>
                        {entry.fournisseur || "N/A"}
                      </td>
                      <td style={{fontWeight: 'bold', color: entry.quantite <= 5 ? '#e53e3e' : '#48bb78'}}>
                        {entry.quantite}
                      </td>
                      <td>{entry.prixAchat} DH</td>
                      <td style={{fontWeight: 'bold', color: '#667eea'}}>{entry.prixVente} DH</td>
                      <td style={{
                        color: isExpired ? '#e53e3e' : isExpiringSoon ? '#d69e2e' : 'white',
                        fontWeight: 'bold'
                      }}>
                        {entry.datePeremption || "N/A"}
                        {isExpired && " ⚠️"}
                        {isExpiringSoon && " ⏰"}
                      </td>
                      <td>
                        <button className="btn print" type="button" onClick={() => handleOpenRetourEntry(entry)}>
                          Retour Lot
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredStockEntries.filter(e => e.quantite > 0).length === 0 && (
                  <tr>
                    <td colSpan="8" style={{textAlign: 'center', padding: '50px', color: '#6b7280', fontStyle: 'italic'}}>
                      Aucune entrée de stock multi-lots disponible. Les entrées sont créées automatiquement lors des achats.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* VUE TRADITIONNELLE */}
      {viewMode === "traditional" && (
        <>
          {/* Toggle filtres Stock traditionnel */}
          <div style={{display:"flex",alignItems:"center",gap:11,marginTop:16,marginBottom:0}}>
            <button
              className="btn"
              type="button"
              style={{
                fontSize:"1.32em",
                padding:"2px 13px",
                minWidth:35,
                background:showFiltresStock
                  ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
                  : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
              }}
              onClick={()=>setShowFiltresStock(v=>!v)}
              aria-label="Afficher/Masquer les filtres Stock"
              title="Afficher/Masquer les filtres Stock"
            >
              {showFiltresStock ? "➖" : "➕"}
            </button>
            <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Filtres Stock Traditionnel</span>
          </div>
          {showFiltresStock && (
            <div className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:11,alignItems:'center',marginBottom:8,marginTop:7}}>
              <div><label>Nom</label>
                <input value={filterStockNom} onChange={(e) => setFilterStockNom(e.target.value)} />
              </div>
              <div><label>Date Exp. max</label>
                <input type="date" value={filterStockDateExp} onChange={(e) => setFilterStockDateExp(e.target.value)} />
              </div>
              <div><label>Qté min</label>
                <input type="number" value={filterStockQuantiteMin} onChange={(e) => setFilterStockQuantiteMin(e.target.value)} />
              </div>
              <div><label>Qté max</label>
                <input type="number" value={filterStockQuantiteMax} onChange={(e) => setFilterStockQuantiteMax(e.target.value)} />
              </div>
              <button className="btn info" type="button" onClick={handlePrintStock}>🖨 Imprimer Stock traditionnel</button>
            </div>
          )}

          {/* Tableau Stock traditionnel */}
          <div className="table-pro-full" style={{marginTop:2, marginBottom:24}}>
            <table>
              <thead>
                <tr>
                  <th>Médicament</th>
                  <th>Quantité</th>
                  <th>Prix Achat</th>
                  <th>Prix Vente</th>
                  <th>Date Exp.</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((p) => (
                  <tr key={p.id}>
                    <td style={{fontWeight: 'bold'}}>{p.nom}</td>
                    <td style={{fontWeight: 'bold', color: p.quantite <= 5 ? '#e53e3e' : '#48bb78'}}>
                      {p.quantite}
                    </td>
                    <td>{p.prixAchat} DH</td>
                    <td style={{fontWeight: 'bold', color: '#667eea'}}>{p.prixVente} DH</td>
                    <td>{p.datePeremption || "N/A"}</td>
                    <td>
                      <button className="btn info" type="button" onClick={() => handleEdit(p)}>Modifier</button>
                      <button className="btn danger" type="button" onClick={() => handleDelete(p)}>Supprimer</button>
                      <button className="btn print" type="button" onClick={() => handleOpenRetour(p)}>Retour</button>
                    </td>
                  </tr>
                ))}
                {filteredStock.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{textAlign: 'center', padding: '50px', color: '#6b7280', fontStyle: 'italic'}}>
                      Aucun médicament en stock traditionnel.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Toggle filtres Retours */}
      <div className="fullscreen-table-title" style={{marginTop:24, fontSize:'1.35rem', display:'flex',alignItems:"center",gap:9}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1.32em",
            padding:"2px 13px",
            minWidth:35,
            background:showFiltresRetours
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={()=>setShowFiltresRetours(v=>!v)}
          aria-label="Afficher/Masquer les filtres Retours"
          title="Afficher/Masquer les filtres Retours"
        >
          {showFiltresRetours ? "➖" : "➕"}
        </button>
        Historique des retours ({retours.length})
      </div>
      {showFiltresRetours && (
        <div className="paper-card" style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',marginBottom:8,marginTop:7}}>
          <div><label>Produit</label>
            <input value={filterProduit} onChange={(e) => setFilterProduit(e.target.value)} />
          </div>
          <div><label>Motif</label>
            <select value={filterMotif} onChange={(e) => setFilterMotif(e.target.value)}>
              <option value="">Tous</option>
              {motifs.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><label>Date min</label>
            <input type="date" value={filterDateMin} onChange={(e) => setFilterDateMin(e.target.value)} />
          </div>
          <div><label>Date max</label>
            <input type="date" value={filterDateMax} onChange={(e) => setFilterDateMax(e.target.value)} />
          </div>
          <button className="btn print" type="button" onClick={handlePrintRetours}>🖨 Imprimer Retours filtrés</button>
        </div>
      )}

      {/* Tableau Retours amélioré */}
      <div className="table-pro-full" style={{marginTop:2}}>
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Quantité</th>
              <th>Motif</th>
              <th>N° Lot</th>
              <th style={{color: '#2d3748', fontWeight: 'bold'}}>Fournisseur</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRetours.map((r) => (
              <tr key={r.id}>
                <td style={{fontWeight: 'bold'}}>{r.produit || "Non spécifié"}</td>
                <td style={{fontWeight: 'bold', color: '#e53e3e'}}>{r.quantite}</td>
                <td>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    color: 'white',
                    backgroundColor: r.motif === 'Expiration' ? '#e53e3e' : 
                                   r.motif === 'Destruction' ? '#dd6b20' :
                                   r.motif === 'Cadeau' ? '#38a169' : '#667eea'
                  }}>
                    {r.motif}
                  </span>
                </td>
                <td style={{fontFamily: 'monospace', fontSize: '0.9rem', color: '#667eea'}}>
                  {r.numeroLot || "N/A"}
                </td>
                <td style={{color: '#2d3748', fontWeight: 'bold'}}>
                  {r.fournisseur || "N/A"}
                </td>
                <td>{r.date?.seconds ? new Date(r.date.seconds * 1000).toLocaleDateString() : ""}</td>
                <td>
                  <button className="btn success" type="button" onClick={() => handleCancelRetour(r)}>
                    Annuler Retour
                  </button>
                </td>
              </tr>
            ))}
            {filteredRetours.length === 0 && (
              <tr>
                <td colSpan="7" style={{textAlign: 'center', padding: '50px', color: '#6b7280', fontStyle: 'italic'}}>
                  Aucun retour enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog retour amélioré */}
      {openRetour && (
        <div className="modal-overlay">
          <div className="paper-card" style={{ maxWidth: 450, margin: "0 auto", background: "#213054" }}>
            <h3 style={{color:"#fff"}}>
              Retour - {selectedEntry ? selectedEntry.nom : selectedProduit?.nom}
              {selectedEntry && (
                <div style={{fontSize: '0.8rem', opacity: 0.8, marginTop: 5}}>
                  Lot: {selectedEntry.numeroLot} • Fournisseur: {selectedEntry.fournisseur}
                </div>
              )}
            </h3>
            <form onSubmit={e => {e.preventDefault(); handleRetour();}} style={{display:'flex', flexDirection:'column', gap:10}}>
              <label>Quantité à retourner</label>
              <input 
                type="number" 
                value={quantiteRetour} 
                onChange={e => setQuantiteRetour(e.target.value)} 
                min={1} 
                max={selectedEntry ? selectedEntry.quantite : selectedProduit?.quantite || 1} 
                required 
              />
              <div style={{fontSize: '0.8rem', color: '#cbd5e0'}}>
                Max disponible: {selectedEntry ? selectedEntry.quantite : selectedProduit?.quantite || 0}
                {selectedEntry && selectedEntry.datePeremption && (
                  <div>Date d'expiration: {selectedEntry.datePeremption}</div>
                )}
              </div>
              <label>Motif</label>
              <select value={motifRetour} onChange={e => setMotifRetour(e.target.value)} required>
                <option value="">Choisir un motif</option>
                {motifs.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <div style={{marginTop:10, display:'flex', gap:7}}>
                <button className="btn info" type="button" onClick={() => setOpenRetour(false)}>Annuler</button>
                <button className="btn print" type="submit">Valider Retour</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
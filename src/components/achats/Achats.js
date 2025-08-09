import React, { useEffect, useState, useCallback } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,  // ← Ajouté pour charger les paramètres
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

  // Listes
  const [articles, setArticles] = useState([]);
  const [achats, setAchats] = useState([]);
  const [medicaments, setMedicaments] = useState([]);
  const [parametres, setParametres] = useState({ entete: "", pied: "" }); // ← Ajouté pour les paramètres

  // Edition
  const [editId, setEditId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Filtres
  const [filterFournisseur, setFilterFournisseur] = useState("");
  const [filterMedicament, setFilterMedicament] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [showFiltres, setShowFiltres] = useState(false);

  // Toggle formulaire
  const [showForm, setShowForm] = useState(false);

  // ← NOUVELLE FONCTION : Chargement des paramètres de la société
  const fetchParametres = async () => {
    if (!societeId) return;
    try {
      // Charger les paramètres documents
      const docRef = doc(db, "societe", societeId, "parametres", "documents");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setParametres({ 
          entete: data.entete || "", 
          pied: data.pied || "" 
        });
        return; // Si trouvé, pas besoin de chercher ailleurs
      }
      
      // Si pas de paramètres documents, essayer les paramètres généraux
      const generalRef = doc(db, "societe", societeId, "parametres", "general");
      const generalSnap = await getDoc(generalRef);
      if (generalSnap.exists()) {
        const data = generalSnap.data();
        setParametres({ 
          entete: data.entete || "", 
          pied: data.pied || "" 
        });
        return;
      }
      
      // Si toujours pas de paramètres, essayer de récupérer le nom de la société
      const societeRef = doc(db, "societes", societeId);
      const societeSnap = await getDoc(societeRef);
      if (societeSnap.exists()) {
        const societeData = societeSnap.data();
        setParametres({ 
          entete: societeData.nom || "Pharmacie", 
          pied: "Merci pour votre confiance" 
        });
      }
    } catch (error) {
      console.error("Erreur lors du chargement des paramètres:", error);
      // Paramètres par défaut en cas d'erreur
      setParametres({ 
        entete: "Pharmacie", 
        pied: "Merci pour votre confiance" 
      });
    }
  };

  // Chargement des achats (par société)
  const fetchAchats = useCallback(async () => {
    if (!societeId) return setAchats([]);
    const snap = await getDocs(collection(db, "societe", societeId, "achats"));
    let arr = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (
        Array.isArray(data.articles) &&
        data.articles.length > 0 &&
        data.articles.some(a => a.produit && a.quantite > 0 && a.prixUnitaire > 0)
      ) {
        arr.push({ id: docSnap.id, ...data });
      }
    });
    setAchats(arr);
  }, [societeId]);

  // Chargement des médicaments (stock société)
  const fetchMedicaments = useCallback(async () => {
    if (!societeId) return setMedicaments([]);
    const snap = await getDocs(collection(db, "societe", societeId, "stock"));
    let arr = [];
    snap.forEach((docSnap) => arr.push(docSnap.data()));
    setMedicaments(arr);
  }, [societeId]);

  // ← MODIFIÉ : Ajout de fetchParametres
  useEffect(() => { 
    fetchAchats(); 
    fetchParametres(); // ← Ajouter cette ligne
  }, [fetchAchats, societeId]);
  useEffect(() => { fetchMedicaments(); }, [fetchMedicaments]);

  // Sélection médicament ou nouveau
  const handleProduitChange = (value) => {
    setProduit(value);
    if (value !== "_new_") {
      const med = medicaments.find(m => m.nom === value);
      if (med) {
        setPrixUnitaire(med.prixAchat || 0);
        setPrixVente(med.prixVente || 0);
      }
    } else {
      setPrixUnitaire("");
      setPrixVente("");
    }
  };

  // Ajout d'un article
  const handleAddArticle = (e) => {
    e.preventDefault();
    const nomProduitFinal = produit === "_new_" ? produitNouveau : produit;
    if (!nomProduitFinal || !quantite || !prixUnitaire || !datePeremption) return;
    setArticles([
      ...articles,
      {
        produit: nomProduitFinal,
        quantite: Number(quantite),
        prixUnitaire: Number(prixUnitaire),
        prixAchat: Number(prixUnitaire),
        prixVente: Number(prixVente) || 0,
        remise: Number(remiseArticle) || 0,
        datePeremption,
      }
    ]);
    setProduit(""); setProduitNouveau(""); setQuantite(1); setPrixUnitaire("");
    setPrixVente(""); setRemiseArticle(0); setDatePeremption("");
  };

  // Retrait d'article temporaire
  const handleRemoveArticle = (idx) => setArticles(articles.filter((_, i) => i !== idx));

  // 🔥 FONCTION CORRIGÉE : Ajout ou modification d'un bon d'achat AVEC ENREGISTREMENT D'ACTIVITÉ
  const handleAddBon = async (e) => {
    e.preventDefault();
    if (!societeId) return alert("Aucune société sélectionnée !");
    if (!user) return alert("Utilisateur non connecté !");
    if (!fournisseur || !dateAchat || articles.length === 0) return;
    
    const articlesValid = articles.filter(a => a.produit && a.quantite > 0 && a.prixUnitaire > 0);
    if (articlesValid.length === 0) return;

    // Calculer le montant total
    const montantTotal = articlesValid.reduce(
      (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
      0
    ) - (Number(remiseGlobale) || 0);

    try {
      if (isEditing && editId) {
        // 🔧 MODIFICATION D'UN ACHAT EXISTANT
        const oldBon = achats.find(b => b.id === editId);
        if (oldBon) await updateStockOnDelete(oldBon);
        
        // Mettre à jour l'achat
        await updateDoc(doc(db, "societe", societeId, "achats", editId), {
          fournisseur,
          date: Timestamp.fromDate(new Date(dateAchat)),
          timestamp: Timestamp.now(), // Heure actuelle de modification
          statutPaiement,
          remiseGlobale: Number(remiseGlobale) || 0,
          articles: articlesValid,
          // Champs de traçabilité
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now()
        });
        
        // 🔥 ENREGISTRER L'ACTIVITÉ DE MODIFICATION
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "achat",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(), // ← IMPORTANT: Heure actuelle
          details: {
            fournisseur,
            montant: montantTotal,
            articles: articlesValid.length,
            action: 'modification',
            achatId: editId,
            statutPaiement
          }
        });
        
        await updateStockOnAdd({ fournisseur, articles: articlesValid });
        setIsEditing(false); 
        setEditId(null);
        
      } else {
        // 🔧 CRÉATION D'UN NOUVEL ACHAT
        const achatRef = await addDoc(collection(db, "societe", societeId, "achats"), {
          fournisseur,
          date: Timestamp.fromDate(new Date(dateAchat)),
          timestamp: Timestamp.now(), // Heure actuelle de création
          statutPaiement,
          remiseGlobale: Number(remiseGlobale) || 0,
          articles: articlesValid,
          // Champs de traçabilité
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          societeId: societeId
        });
        
        // 🔥 ENREGISTRER L'ACTIVITÉ DE CRÉATION
        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "achat",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(), // ← IMPORTANT: Heure actuelle
          details: {
            fournisseur,
            montant: montantTotal,
            articles: articlesValid.length,
            action: 'création',
            achatId: achatRef.id,
            statutPaiement
          }
        });
        
        await updateStockOnAdd({ fournisseur, articles: articlesValid });
        
        // Si paiement automatique (payé)
        if (statutPaiement === "payé") {
          // Enregistrer le paiement
          await addDoc(collection(db, "societe", societeId, "paiements"), {
            docId: achatRef.id,
            montant: montantTotal,
            mode: "Espèces",
            type: "achats",
            date: Timestamp.now(),
            createdBy: user.email
          });
          
          // 🔥 ENREGISTRER L'ACTIVITÉ DE PAIEMENT
          await addDoc(collection(db, "societe", societeId, "activities"), {
            type: "paiement",
            userId: user.uid,
            userEmail: user.email,
            timestamp: Timestamp.now(),
            details: {
              mode: "Espèces",
              type: "achats",
              montant: montantTotal,
              fournisseur,
              paiementAuto: true
            }
          });
        }
      }
      
      resetForm();
      fetchAchats();
      fetchMedicaments();
      
      // Message de succès
      console.log("✅ Achat et activité enregistrés avec succès");
      
    } catch (error) {
      console.error("❌ Erreur lors de l'enregistrement:", error);
      alert("Erreur lors de l'enregistrement de l'achat");
    }
  };

  // Réinit form
  const resetForm = () => {
    setFournisseur(""); setDateAchat(""); setStatutPaiement("payé"); setRemiseGlobale(0);
    setArticles([]); setEditId(null); setIsEditing(false);
  };

  // ← MODIFIÉ : Impression d'un bon avec nom de société
  const handlePrintBon = (bon) => {
    const articles = Array.isArray(bon.articles) ? bon.articles : [];
    const totalArticles = articles.reduce(
      (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
      0
    );
    const totalApresRemiseGlobale = totalArticles - (bon.remiseGlobale || 0);
    
    // Formater la date correctement
    let dateStr = "";
    if (bon.timestamp?.toDate) {
      dateStr = bon.timestamp.toDate().toLocaleString();
    } else if (bon.date?.toDate) {
      dateStr = bon.date.toDate().toLocaleDateString();
    }
    
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Bon de Commande</title>
          <style>
            body { font-family: 'Inter', Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: center; }
            h2 { text-align: center; }
            .header, .footer { text-align: center; margin-bottom: 20px; font-size: 14px; }
            .totals { text-align: right; font-size: 16px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">${parametres.entete || "Pharmacie"}</div>
          <h2>BON DE COMMANDE</h2>
          <p><strong>Fournisseur:</strong> ${bon.fournisseur || ""}</p>
          <p><strong>Date:</strong> ${dateStr}</p>
          <p><strong>Statut:</strong> ${bon.statutPaiement || ""}</p>
          <table>
            <thead>
              <tr>
                <th>Produit</th>
                <th>Qté</th>
                <th>Prix Achat</th>
                <th>Prix Vente</th>
                <th>Remise</th>
                <th>Date Exp.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${articles
                .map(
                  (a) => `
                <tr>
                  <td>${a.produit || ""}</td>
                  <td>${a.quantite || 0}</td>
                  <td>${a.prixUnitaire || 0} DH</td>
                  <td>${a.prixVente || 0} DH</td>
                  <td>${a.remise || 0} DH</td>
                  <td>${a.datePeremption || ""}</td>
                  <td>${(a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)} DH</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
          ${bon.remiseGlobale ? `<div class="totals"><p><strong>Remise Globale : ${bon.remiseGlobale} DH</strong></p></div>` : ""}
          <div class="totals">
            <p><strong>Total : ${totalApresRemiseGlobale} DH</strong></p>
          </div>
          <p style="margin-top:40px; text-align:center;">Signature du Responsable : __________________</p>
          <div class="footer">${parametres.pied || ""}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Mode édition d'un bon
  const handleEditBon = (bon) => {
    setEditId(bon.id);
    setIsEditing(true);
    setFournisseur(bon.fournisseur || "");
    
    // Gérer la date correctement
    if (bon.date?.toDate) {
      setDateAchat(bon.date.toDate().toISOString().split("T")[0]);
    } else if (bon.timestamp?.toDate) {
      setDateAchat(bon.timestamp.toDate().toISOString().split("T")[0]);
    } else {
      setDateAchat("");
    }
    
    setStatutPaiement(bon.statutPaiement || "payé");
    setRemiseGlobale(bon.remiseGlobale || 0);
    setArticles(Array.isArray(bon.articles) ? bon.articles : []);
    setShowForm(true);
  };

  // 🔥 FONCTION CORRIGÉE : Suppression d'un bon AVEC ENREGISTREMENT D'ACTIVITÉ
  const handleDeleteBon = async (bon) => {
    if (!societeId) return alert("Aucune société sélectionnée !");
    if (!user) return alert("Utilisateur non connecté !");
    
    if (window.confirm("Supprimer ce bon ?")) {
      try {
        // Calculer le montant pour l'activité
        const montantTotal = Array.isArray(bon.articles) 
          ? bon.articles.reduce(
              (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
              0
            ) - (bon.remiseGlobale || 0)
          : 0;
        
        // Mettre à jour le stock
        await updateStockOnDelete(bon);
        
        // Supprimer l'achat
        await deleteDoc(doc(db, "societe", societeId, "achats", bon.id));
        
        // 🔥 ENREGISTRER L'ACTIVITÉ DE SUPPRESSION
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
        
        fetchAchats();
        fetchMedicaments();
        
        console.log("✅ Achat supprimé et activité enregistrée");
      } catch (error) {
        console.error("❌ Erreur lors de la suppression:", error);
        alert("Erreur lors de la suppression de l'achat");
      }
    }
  };

  // Mise à jour du stock (ajout) - Pas besoin d'activité ici car déjà gérée dans handleAddBon
  const updateStockOnAdd = async (bon) => {
    if (!societeId || !user) return;
    const stockRef = collection(db, "societe", societeId, "stock");
    for (const art of bon.articles || []) {
      const q = query(stockRef, where("nom", "==", art.produit || ""));
      const stockSnap = await getDocs(q);
      if (!stockSnap.empty) {
        const docId = stockSnap.docs[0].id;
        const current = stockSnap.docs[0].data();
        
        await updateDoc(doc(db, "societe", societeId, "stock", docId), {
          quantite: Number(current.quantite || 0) + Number(art.quantite || 0),
          prixAchat: art.prixUnitaire || 0,
          prixVente: art.prixVente || current.prixVente || art.prixUnitaire,
          datePeremption: art.datePeremption || current.datePeremption || "",
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now()
        });
      } else {
        await addDoc(stockRef, {
          nom: art.produit || "",
          quantite: Number(art.quantite || 0),
          prixAchat: art.prixUnitaire || 0,
          prixVente: art.prixVente || art.prixUnitaire || 0,
          seuil: 5,
          datePeremption: art.datePeremption || "",
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          societeId: societeId
        });
      }
    }
  };

  // Mise à jour du stock (suppression) - Pas besoin d'activité ici
  const updateStockOnDelete = async (bon) => {
    if (!societeId || !user) return;
    const stockRef = collection(db, "societe", societeId, "stock");
    for (const art of bon.articles || []) {
      const q = query(stockRef, where("nom", "==", art.produit || ""));
      const stockSnap = await getDocs(q);
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
    }
  };

  // Fonction pour formater la date d'affichage
  const formatDateDisplay = (dateField) => {
    if (dateField?.toDate) {
      const date = dateField.toDate();
      return date.toLocaleDateString() + " " + date.toLocaleTimeString();
    }
    return "Date non spécifiée";
  };

  // Totaux/filtres
  const totalBonCourant =
    (articles || []).reduce(
      (t, a) => t + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
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
      const bDate = b.timestamp?.toDate?.() || b.date?.toDate?.() || null;
      if (!bDate || bDate < new Date(filterDateMin)) keep = false;
    }
    if (filterDateMax) {
      const bDate = b.timestamp?.toDate?.() || b.date?.toDate?.() || null;
      if (!bDate || bDate > new Date(filterDateMax + "T23:59:59")) keep = false;
    }
    return keep;
  });

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

  // RENDU PRINCIPAL
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Achats</div>
      {/* Toggle formulaire */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 12, marginBottom: 0 }}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize: "1.32em",
            padding: "2px 13px",
            minWidth: 35,
            background: showForm
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={() => setShowForm(v => !v)}
          aria-label="Afficher/Masquer le formulaire"
          title="Afficher/Masquer le formulaire"
        >
          {showForm ? "➖" : "➕"}
        </button>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: 0.02 }}>
          Formulaire d'ajout/modification
        </span>
      </div>

      {/* Formulaire ajout/modif */}
      {showForm && (
        <>
          {/* Formulaire article */}
          <form onSubmit={handleAddArticle} className="paper-card" style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "flex-start" }}>
            <div style={{ minWidth: 180 }}>
              <label>Médicament</label>
              <select className="w-full" value={produit} onChange={e => handleProduitChange(e.target.value)} required>
                <option value="">Choisir...</option>
                {medicaments.map(m => <option key={m.nom} value={m.nom}>{m.nom}</option>)}
                <option value="_new_">+ Nouveau médicament</option>
              </select>
            </div>
            {produit === "_new_" && (
              <div style={{ minWidth: 180 }}>
                <label>Nouveau médicament</label>
                <input className="w-full" value={produitNouveau} onChange={e => setProduitNouveau(e.target.value)} required />
              </div>
            )}
            <div style={{ minWidth: 100 }}>
              <label>Quantité</label>
              <input type="number" className="w-full" value={quantite} onChange={e => setQuantite(e.target.value)} required />
            </div>
            <div style={{ minWidth: 120 }}>
              <label>Prix Achat</label>
              <input type="number" className="w-full" value={prixUnitaire} onChange={e => setPrixUnitaire(e.target.value)} required />
            </div>
            <div style={{ minWidth: 120 }}>
              <label>Prix Vente</label>
              <input type="number" className="w-full" value={prixVente} onChange={e => setPrixVente(e.target.value)} />
            </div>
            <div style={{ minWidth: 100 }}>
              <label>Remise</label>
              <input type="number" className="w-full" value={remiseArticle} onChange={e => setRemiseArticle(e.target.value)} />
            </div>
            <div style={{ minWidth: 150 }}>
              <label>Date Exp.</label>
              <input type="date" className="w-full" value={datePeremption} onChange={e => setDatePeremption(e.target.value)} required />
            </div>
            <button type="submit" className="btn">Ajouter</button>
          </form>
          {/* Tableau des articles */}
          {articles.length > 0 && (
            <div className="table-pro-full" style={{ height: "36vh", minHeight: "200px", marginBottom: 20 }}>
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Qté</th>
                    <th>Prix Achat</th>
                    <th>Prix Vente</th>
                    <th>Remise</th>
                    <th>Date Exp.</th>
                    <th>Total</th>
                    <th>Supprimer</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a, i) => (
                    <tr key={i}>
                      <td>{a.produit}</td>
                      <td>{a.quantite}</td>
                      <td>{a.prixUnitaire} DH</td>
                      <td>{a.prixVente} DH</td>
                      <td>{a.remise} DH</td>
                      <td>{a.datePeremption}</td>
                      <td>{(a.prixUnitaire * a.quantite - a.remise) || 0} DH</td>
                      <td>
                        <button type="button" className="btn danger" onClick={() => handleRemoveArticle(i)}>
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={6} align="right"><strong>Total Bon</strong></td>
                    <td colSpan={2}><strong>{totalBonCourant} DH</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {/* Formulaire global du bon */}
          <form onSubmit={handleAddBon} className="paper-card" style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "flex-start" }}>
            <div style={{ minWidth: 180 }}>
              <label>Fournisseur</label>
              <input className="w-full" value={fournisseur} onChange={e => setFournisseur(e.target.value)} required />
            </div>
            <div style={{ minWidth: 150 }}>
              <label>Date Achat</label>
              <input type="date" className="w-full" value={dateAchat} onChange={e => setDateAchat(e.target.value)} required />
            </div>
            <div style={{ minWidth: 130 }}>
              <label>Statut</label>
              <select className="w-full" value={statutPaiement} onChange={e => setStatutPaiement(e.target.value)}>
                <option value="payé">Payé</option>
                <option value="partiel">Partiel</option>
                <option value="impayé">Impayé</option>
              </select>
            </div>
            <div style={{ minWidth: 130 }}>
              <label>Remise Globale</label>
              <input type="number" className="w-full" value={remiseGlobale} onChange={e => setRemiseGlobale(e.target.value)} />
            </div>
            <button type="submit" className="btn">{isEditing ? "Modifier Bon" : "Enregistrer Bon"}</button>
            {isEditing && (
              <button type="button" className="btn info" onClick={resetForm}>
                Annuler
              </button>
            )}
          </form>
        </>
      )}

      {/* Toggle filtres */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 15, marginBottom: 0 }}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize: "1.32em",
            padding: "2px 13px",
            minWidth: 35,
            background: showFiltres
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={() => setShowFiltres(v => !v)}
          aria-label="Afficher/Masquer les filtres"
          title="Afficher/Masquer les filtres"
        >
          {showFiltres ? "➖" : "➕"}
        </button>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: 0.02 }}>
          Filtres historiques
        </span>
      </div>
      {/* Filtres historiques */}
      {showFiltres && (
        <div className="paper-card" style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 7, marginBottom: 7, flexWrap: "wrap" }}>
          <div>
            <label>Fournisseur&nbsp;</label>
            <select value={filterFournisseur} onChange={e => setFilterFournisseur(e.target.value)} style={{ minWidth: 110 }}>
              <option value="">Tous</option>
              {fournisseursUniques.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Médicament&nbsp;</label>
            <select value={filterMedicament} onChange={e => setFilterMedicament(e.target.value)} style={{ minWidth: 110 }}>
              <option value="">Tous</option>
              {medicamentsUniques.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label>Du&nbsp;</label>
            <input type="date" value={filterDateMin} onChange={e => setFilterDateMin(e.target.value)} />
          </div>
          <div>
            <label>Au&nbsp;</label>
            <input type="date" value={filterDateMax} onChange={e => setFilterDateMax(e.target.value)} />
          </div>
          {(filterFournisseur || filterMedicament || filterDateMin || filterDateMax) && (
            <button className="btn danger" type="button" onClick={() => {
              setFilterFournisseur(""); setFilterMedicament(""); setFilterDateMin(""); setFilterDateMax("");
            }}>
              Effacer filtres
            </button>
          )}
        </div>
      )}

      {/* Tableau historique */}
      <div className="fullscreen-table-title" style={{ marginTop: 15, fontSize: "1.45rem" }}>Historique des Achats</div>
      <div className="table-pro-full" style={{ flex: "1 1 0%", minHeight: "46vh" }}>
        <table>
          <thead>
            <tr>
              <th>Fournisseur</th>
              <th>Date & Heure</th>
              <th>Statut</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {achatsFiltres.map((b) => (
              <tr key={b.id}>
                <td>{b.fournisseur}</td>
                <td>{formatDateDisplay(b.timestamp || b.date)}</td>
                <td>{b.statutPaiement}</td>
                <td>
                  {(
                    (Array.isArray(b.articles)
                      ? b.articles.reduce(
                        (sum, a) =>
                          sum +
                          ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
                        0
                      )
                      : 0) - (b.remiseGlobale || 0)
                  )} DH
                </td>
                <td>
                  <button className="btn info" onClick={() => handleEditBon(b)}>Modifier</button>
                  <button className="btn danger" onClick={() => handleDeleteBon(b)}>Supprimer</button>
                  <button className="btn print" onClick={() => handlePrintBon(b)}>Imprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
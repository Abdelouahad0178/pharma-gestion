import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  Timestamp, 
  collection, 
  getDocs, 
  query, 
  where,
  orderBy,
  limit
} from "firebase/firestore";

export default function Parametres() {
  const { user, societeId, role, loading } = useUserRole();

  // États pour les paramètres de documents
  const [entete, setEntete] = useState("");
  const [pied, setPied] = useState("");
  
  // États pour les informations de la pharmacie
  const [nomPharmacie, setNomPharmacie] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [rc, setRc] = useState("");
  const [ice, setIce] = useState("");
  const [if_, setIf] = useState("");
  const [cnss, setCnss] = useState("");
  
  // États pour les paramètres de gestion
  const [seuilAlerteGlobal, setSeuilAlerteGlobal] = useState(10);
  const [delaiPeremptionAlerte, setDelaiPeremptionAlerte] = useState(30);
  const [tvaVente, setTvaVente] = useState(20);
  
  // États pour les activités utilisateurs
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [activites, setActivites] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showActivitesFilters, setShowActivitesFilters] = useState(false);
  
  // États UI
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("documents");
  const [waiting, setWaiting] = useState(true);
  const [loadingActivites, setLoadingActivites] = useState(false);

  // Vérification du chargement
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // Chargement des utilisateurs de la société
  const fetchUtilisateurs = async () => {
    if (!societeId) return;
    
    try {
      const q = query(collection(db, "users"), where("societeId", "==", societeId));
      const snapshot = await getDocs(q);
      const usersList = [];
      
      snapshot.forEach((doc) => {
        const userData = doc.data();
        usersList.push({
          id: doc.id,
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
      setError("Erreur lors du chargement des utilisateurs");
    }
  };

 
// 🔥 SECTION CORRIGÉE : Chargement des activités avec timestamps corrects
const fetchActivites = async () => {
  if (!societeId) return;
  
  setLoadingActivites(true);
  try {
    const activitesList = [];
    
    // 1. D'ABORD vérifier s'il y a des activités dans la collection "activities"
    const activitiesSnap = await getDocs(
      query(
        collection(db, "societe", societeId, "activities"),
        orderBy("timestamp", "desc"),
        limit(100)
      )
    );
    
    // Si on a des activités dans la collection dédiée, les utiliser
    if (!activitiesSnap.empty) {
      activitiesSnap.forEach((doc) => {
        const data = doc.data();
        const details = data.details || {};
        
        activitesList.push({
          id: doc.id,
          type: getActivityTypeLabel(data.type),
          utilisateurId: data.userId || data.utilisateurId || user.uid,
          utilisateurEmail: data.userEmail || data.utilisateurEmail || "",
          date: data.timestamp || data.date || Timestamp.now(),
          details: formatActivityDetails(data.type, details),
          montant: details.montant || 0,
          nombreArticles: details.articles || 0,
          statut: details.statutPaiement || details.action || "Effectué",
          action: details.action || "",
          collection: "activities",
          isFromActivities: true // Marqueur pour savoir que ça vient de la collection activities
        });
      });
    }
    
    // 2. ENSUITE récupérer depuis les collections individuelles (pour compatibilité)
    // Récupérer les ventes
    const ventesSnap = await getDocs(
      query(
        collection(db, "societe", societeId, "ventes"),
        orderBy("timestamp", "desc"),
        limit(50)
      )
    );
    
    ventesSnap.forEach((doc) => {
      const data = doc.data();
      const total = (data.articles || []).reduce((sum, a) => 
        sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)), 0
      );
      
      // Utiliser timestamp en priorité, sinon date, sinon creeLe
      const dateField = data.timestamp || data.date || data.creeLe || data.createdAt;
      
      activitesList.push({
        id: doc.id,
        type: "Vente",
        utilisateurId: data.creePar || data.userId || data.createdBy || user.uid,
        utilisateurEmail: data.creeParEmail || data.userEmail || user.email,
        date: dateField || Timestamp.now(),
        details: `Client: ${data.client || "N/A"}`,
        montant: total,
        nombreArticles: (data.articles || []).length,
        statut: data.statutPaiement || "N/A",
        action: data.modifieLe ? "modification" : "création",
        collection: "ventes"
      });
    });
    
    // Récupérer les achats
    const achatsSnap = await getDocs(
      query(
        collection(db, "societe", societeId, "achats"),
        orderBy("timestamp", "desc"),
        limit(50)
      )
    );
    
    achatsSnap.forEach((doc) => {
      const data = doc.data();
      const total = (data.articles || []).reduce((sum, a) => 
        sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)), 0
      ) - (data.remiseGlobale || 0);
      
      const dateField = data.timestamp || data.date || data.creeLe || data.createdAt;
      
      activitesList.push({
        id: doc.id,
        type: "Achat",
        utilisateurId: data.creePar || data.userId || data.createdBy || user.uid,
        utilisateurEmail: data.creeParEmail || data.userEmail || user.email,
        date: dateField || Timestamp.now(),
        details: `Fournisseur: ${data.fournisseur || "N/A"}`,
        montant: total,
        nombreArticles: (data.articles || []).length,
        statut: data.statutPaiement || "N/A",
        action: data.modifieLe ? "modification" : "création",
        collection: "achats"
      });
    });
    
    // Récupérer les paiements
    const paiementsSnap = await getDocs(
      query(
        collection(db, "societe", societeId, "paiements"),
        orderBy("date", "desc"),
        limit(50)
      )
    );
    
    paiementsSnap.forEach((doc) => {
      const data = doc.data();
      const dateField = data.date || data.timestamp || data.createdAt;
      
      activitesList.push({
        id: doc.id,
        type: "Paiement",
        utilisateurId: data.creePar || data.userId || data.createdBy || user.uid,
        utilisateurEmail: data.creeParEmail || data.userEmail || data.createdBy || user.email,
        date: dateField || Timestamp.now(),
        details: `Type: ${data.type || "N/A"} - Mode: ${data.mode || "N/A"}`,
        montant: data.montant || 0,
        statut: "Enregistré",
        collection: "paiements"
      });
    });
    
    // Trier par date (plus récent d'abord)
    activitesList.sort((a, b) => {
      const dateA = a.date?.seconds || a.date?.getTime?.() / 1000 || 0;
      const dateB = b.date?.seconds || b.date?.getTime?.() / 1000 || 0;
      return dateB - dateA;
    });
    
    // Dédupliquer si nécessaire (garder celles de la collection activities en priorité)
    const deduplicatedList = [];
    const seenIds = new Set();
    
    activitesList.forEach(activity => {
      const key = `${activity.type}-${activity.montant}-${activity.details}`;
      if (!seenIds.has(key) || activity.isFromActivities) {
        deduplicatedList.push(activity);
        seenIds.add(key);
      }
    });
    
    setActivites(deduplicatedList);
  } catch (err) {
    console.error("Erreur chargement activités:", err);
    setError("Erreur lors du chargement des activités");
  } finally {
    setLoadingActivites(false);
  }
};

// 🔥 FONCTION HELPER : Convertir le type d'activité en label lisible
const getActivityTypeLabel = (type) => {
  const labels = {
    'vente': 'Vente',
    'achat': 'Achat',
    'paiement': 'Paiement',
    'stock_ajout': 'Ajout Stock',
    'stock_modif': 'Modification Stock',
    'stock_retour': 'Retour Stock',
    'facture': 'Facture',
    'devis': 'Devis'
  };
  return labels[type] || type;
};

// 🔥 FONCTION HELPER : Formater les détails selon le type
const formatActivityDetails = (type, details) => {
  switch(type) {
    case 'vente':
      return `Client: ${details.client || 'N/A'}`;
    case 'achat':
      return `Fournisseur: ${details.fournisseur || 'N/A'}`;
    case 'paiement':
      return `${details.mode || 'Espèces'} - ${details.type || ''}`;
    case 'stock_ajout':
    case 'stock_modif':
      return `Produit: ${details.produit || 'N/A'}`;
    case 'stock_retour':
      return `Produit: ${details.produit || 'N/A'} - Motif: ${details.motif || 'N/A'}`;
    default:
      return Object.entries(details)
        .filter(([key]) => key !== 'montant' && key !== 'action')
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ') || 'N/A';
  }
};


  // Chargement des paramètres
  useEffect(() => {
    if (!user || !societeId) return;
    
    const fetchParams = async () => {
      try {
        // Charger les paramètres documents
        const docRef = doc(db, "societe", societeId, "parametres", "documents");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setEntete(data.entete || "");
          setPied(data.pied || "");
        }
        
        // Charger les informations pharmacie
        const infoRef = doc(db, "societe", societeId, "parametres", "informations");
        const infoSnap = await getDoc(infoRef);
        if (infoSnap.exists()) {
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
        
        // Charger les paramètres de gestion
        const gestionRef = doc(db, "societe", societeId, "parametres", "gestion");
        const gestionSnap = await getDoc(gestionRef);
        if (gestionSnap.exists()) {
          const data = gestionSnap.data();
          setSeuilAlerteGlobal(data.seuilAlerteGlobal || 10);
          setDelaiPeremptionAlerte(data.delaiPeremptionAlerte || 30);
          setTvaVente(data.tvaVente || 20);
        }
        
        // Charger les utilisateurs
        await fetchUtilisateurs();
        
      } catch (err) {
        console.error("Erreur chargement paramètres:", err);
        setError("Erreur lors du chargement des paramètres");
      }
    };
    
    fetchParams();
  }, [user, societeId]);

  // Charger les activités quand on clique sur l'onglet
  useEffect(() => {
    if (activeTab === "activites" && utilisateurs.length > 0) {
      fetchActivites();
    }
  }, [activeTab, utilisateurs]);

  // Sauvegarde des paramètres documents
  const handleSaveDocuments = async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    
    setSaving(true);
    setError("");
    
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "documents"), {
        entete,
        pied,
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde documents:", err);
      setError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Sauvegarde des informations pharmacie
  const handleSaveInformations = async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    
    setSaving(true);
    setError("");
    
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "informations"), {
        nomPharmacie,
        adresse,
        telephone,
        email,
        rc,
        ice,
        if: if_,
        cnss,
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde informations:", err);
      setError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Sauvegarde des paramètres de gestion
  const handleSaveGestion = async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    
    setSaving(true);
    setError("");
    
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "gestion"), {
        seuilAlerteGlobal: Number(seuilAlerteGlobal),
        delaiPeremptionAlerte: Number(delaiPeremptionAlerte),
        tvaVente: Number(tvaVente),
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde gestion:", err);
      setError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Filtrage des activités
  const activitesFiltrees = activites.filter((activite) => {
    let keep = true;
    
    if (selectedUserId && activite.utilisateurId !== selectedUserId) keep = false;
    if (filterType && activite.type !== filterType) keep = false;
    
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

  // Obtenir le nom d'utilisateur (VERSION AMÉLIORÉE)
  const getUserName = (userId, userEmail = "") => {
    // D'abord chercher dans la liste des utilisateurs
    const utilisateur = utilisateurs.find(u => u.id === userId);
    if (utilisateur) {
      if (utilisateur.nom && utilisateur.prenom) {
        return `${utilisateur.prenom} ${utilisateur.nom}`;
      }
      return utilisateur.email;
    }
    
    // Si pas trouvé et on a un email, l'utiliser
    if (userEmail) {
      return userEmail.split('@')[0]; // Prendre la partie avant @
    }
    
    // Si c'est l'utilisateur actuel
    if (userId === user?.uid) {
      return `${user.email} (Vous)`;
    }
    
    return "Utilisateur inconnu";
  };

  // Obtenir le rôle d'un utilisateur
  const getUserRole = (userId) => {
    const utilisateur = utilisateurs.find(u => u.id === userId);
    if (utilisateur) return utilisateur.role;
    if (userId === user?.uid) return role || "N/A";
    return "N/A";
  };

  // Obtenir la couleur selon le type d'activité
  const getTypeColor = (type) => {
    switch (type) {
      case "Vente": return "#2bd2a6";
      case "Achat": return "#61c7ef";
      case "Stock": return "#e7e074";
      case "Retour": return "#ee4e61";
      case "Paiement": return "#7ee4e6";
      default: return "#98c4f9";
    }
  };

  // Statistiques par utilisateur (VERSION CORRIGÉE)
  const getStatistiquesUtilisateur = (userId) => {
    const activitesUser = activites.filter(a => a.utilisateurId === userId);
    const ventes = activitesUser.filter(a => a.type === "Vente");
    const achats = activitesUser.filter(a => a.type === "Achat");
    
    return {
      totalActivites: activitesUser.length,
      totalVentes: ventes.length,
      montantVentes: ventes.reduce((sum, v) => sum + (v.montant || 0), 0),
      totalAchats: achats.length,
      montantAchats: achats.reduce((sum, a) => sum + (a.montant || 0), 0),
      derniereActivite: activitesUser[0]?.date
    };
  };

  // Fonction pour ajouter la traçabilité aux futures opérations
  const enableUserTracking = async () => {
    try {
      const trackingRef = doc(db, "societe", societeId, "parametres", "tracking");
      await setDoc(trackingRef, {
        userTracking: true,
        enabledBy: user.uid,
        enabledAt: Timestamp.now()
      });
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
      alert("Traçabilité activée ! Les nouvelles opérations seront correctement associées aux utilisateurs.");
    } catch (err) {
      console.error("Erreur activation traçabilité:", err);
      setError("Erreur lors de l'activation de la traçabilité");
    }
  };

 
// 🔥 FONCTION CORRIGÉE : Formatage de date amélioré
const formatDate = (date) => {
  if (!date) return "Date inconnue";
  
  let dateObj;
  
  // Gérer tous les types de dates possibles
  if (date.seconds) {
    // Timestamp Firestore
    dateObj = new Date(date.seconds * 1000);
  } else if (date.toDate && typeof date.toDate === 'function') {
    // Timestamp Firestore avec méthode toDate
    dateObj = date.toDate();
  } else if (date instanceof Date) {
    // Objet Date JavaScript
    dateObj = date;
  } else if (typeof date === 'string') {
    // String ISO
    dateObj = new Date(date);
  } else if (typeof date === 'number') {
    // Timestamp en millisecondes
    dateObj = new Date(date);
  } else {
    return "Date invalide";
  }
  
  // Vérifier que la date est valide
  if (isNaN(dateObj.getTime())) {
    return "Date invalide";
  }
  
  // Formater la date avec l'heure CORRECTE
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false // Format 24h
  };
  
  return dateObj.toLocaleString('fr-FR', options);
};

// 🔥 FONCTION AMÉLIORÉE : Formatage relatif pour les activités récentes
const formatActivityTime = (date) => {
  if (!date) return "Date inconnue";
  
  let dateObj;
  
  // Gérer tous les types de dates
  if (date.seconds) {
    dateObj = new Date(date.seconds * 1000);
  } else if (date.toDate && typeof date.toDate === 'function') {
    dateObj = date.toDate();
  } else if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (typeof date === 'number') {
    dateObj = new Date(date);
  } else {
    return "Date invalide";
  }
  
  if (isNaN(dateObj.getTime())) {
    return "Date invalide";
  }
  
  const now = new Date();
  const diffMs = now - dateObj;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  // Format relatif
  if (diffMinutes < 1) {
    return "À l'instant";
  } else if (diffMinutes < 60) {
    return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  } else if (diffHours < 24) {
    return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  } else if (diffDays === 1) {
    return `Hier à ${dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return `Il y a ${diffDays} jours`;
  } else {
    return formatDate(dateObj);
  }
};


  // Vérifications
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

  if (role !== "docteur") {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Accès refusé. Seul le pharmacien peut accéder aux paramètres.
      </div>
    );
  }

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Paramètres de la Pharmacie</div>
      
      {/* Messages de statut */}
      {error && (
        <div className="status-chip danger" style={{ margin: "10px auto", maxWidth: 600 }}>
          {error}
        </div>
      )}
      
      {saved && (
        <div className="status-chip success" style={{ margin: "10px auto", maxWidth: 600 }}>
          ✅ Paramètres enregistrés avec succès !
        </div>
      )}
      
      {/* Onglets */}
      <div style={{ 
        display: "flex", 
        gap: 10, 
        marginBottom: 20,
        borderBottom: "2px solid #38507c",
        paddingBottom: 10,
        flexWrap: "wrap"
      }}>
        <button
          className={`btn ${activeTab === "documents" ? "" : "info"}`}
          onClick={() => setActiveTab("documents")}
          style={{ 
            borderRadius: "8px 8px 0 0",
            marginBottom: -10,
            paddingBottom: 20
          }}
        >
          📄 Documents
        </button>
        <button
          className={`btn ${activeTab === "informations" ? "" : "info"}`}
          onClick={() => setActiveTab("informations")}
          style={{ 
            borderRadius: "8px 8px 0 0",
            marginBottom: -10,
            paddingBottom: 20
          }}
        >
          🏥 Informations
        </button>
        <button
          className={`btn ${activeTab === "gestion" ? "" : "info"}`}
          onClick={() => setActiveTab("gestion")}
          style={{ 
            borderRadius: "8px 8px 0 0",
            marginBottom: -10,
            paddingBottom: 20
          }}
        >
          ⚙️ Gestion
        </button>
        <button
          className={`btn ${activeTab === "activites" ? "" : "info"}`}
          onClick={() => setActiveTab("activites")}
          style={{ 
            borderRadius: "8px 8px 0 0",
            marginBottom: -10,
            paddingBottom: 20
          }}
        >
          📊 Activités
        </button>
      </div>

      {/* Contenu des onglets */}
      <div className="paper-card" style={{ maxWidth: activeTab === "activites" ? "100%" : 800, margin: "0 auto" }}>
        
        {/* Onglet Documents */}
        {activeTab === "documents" && (
          <form onSubmit={handleSaveDocuments}>
            <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
              Personnalisation des Documents
            </h3>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                Entête des documents (factures, devis, bons)
              </label>
              <textarea
                className="input"
                style={{ 
                  width: "100%", 
                  minHeight: 100, 
                  resize: "vertical",
                  fontFamily: "monospace"
                }}
                rows={4}
                value={entete}
                onChange={(e) => setEntete(e.target.value)}
                placeholder="Ex : PHARMACIE CENTRALE&#10;123, Avenue Mohammed V&#10;Casablanca - Maroc&#10;Tél: 05 22 XX XX XX"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Cet entête apparaîtra sur tous vos documents imprimés
              </small>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                Pied de page des documents
              </label>
              <textarea
                className="input"
                style={{ 
                  width: "100%", 
                  minHeight: 80, 
                  resize: "vertical",
                  fontFamily: "monospace"
                }}
                rows={3}
                value={pied}
                onChange={(e) => setPied(e.target.value)}
                placeholder="Ex : Merci pour votre confiance !&#10;Horaires : Lun-Sam 8h-20h"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Ce pied de page apparaîtra en bas de tous vos documents
              </small>
            </div>
            
            <button 
              type="submit" 
              className="btn" 
              disabled={saving}
              style={{ width: 200 }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </form>
        )}
        
        {/* Onglet Informations */}
        {activeTab === "informations" && (
          <form onSubmit={handleSaveInformations}>
            <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
              Informations de la Pharmacie
            </h3>
            
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 20
            }}>
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  Nom de la pharmacie
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={nomPharmacie}
                  onChange={(e) => setNomPharmacie(e.target.value)}
                  placeholder="Pharmacie Centrale"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  Téléphone
                </label>
                <input
                  type="tel"
                  className="input"
                  style={{ width: "100%" }}
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="05 22 XX XX XX"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  Email
                </label>
                <input
                  type="email"
                  className="input"
                  style={{ width: "100%" }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@pharmacie.ma"
                  disabled={saving}
                />
              </div>
              
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  Adresse complète
                </label>
                <textarea
                  className="input"
                  style={{ width: "100%", minHeight: 60 }}
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="123, Avenue Mohammed V, Casablanca"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  RC (Registre Commerce)
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={rc}
                  onChange={(e) => setRc(e.target.value)}
                  placeholder="123456"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  ICE
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={ice}
                  onChange={(e) => setIce(e.target.value)}
                  placeholder="000000000000000"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  IF (Identifiant Fiscal)
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={if_}
                  onChange={(e) => setIf(e.target.value)}
                  placeholder="12345678"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  CNSS
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={cnss}
                  onChange={(e) => setCnss(e.target.value)}
                  placeholder="1234567"
                  disabled={saving}
                />
              </div>
            </div>
            
            <button 
              type="submit" 
              className="btn" 
              disabled={saving}
              style={{ width: 200, marginTop: 20 }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </form>
        )}
        
        {/* Onglet Gestion */}
        {activeTab === "gestion" && (
          <form onSubmit={handleSaveGestion}>
            <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
              Paramètres de Gestion
            </h3>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                Seuil d'alerte stock global (par défaut)
              </label>
              <input
                type="number"
                className="input"
                style={{ width: 200 }}
                value={seuilAlerteGlobal}
                onChange={(e) => setSeuilAlerteGlobal(e.target.value)}
                min="1"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Quantité minimum avant alerte (peut être personnalisé par produit)
              </small>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                Délai d'alerte péremption (jours)
              </label>
              <input
                type="number"
                className="input"
                style={{ width: 200 }}
                value={delaiPeremptionAlerte}
                onChange={(e) => setDelaiPeremptionAlerte(e.target.value)}
                min="1"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Nombre de jours avant péremption pour déclencher une alerte
              </small>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                TVA sur les ventes (%)
              </label>
              <input
                type="number"
                className="input"
                style={{ width: 200 }}
                value={tvaVente}
                onChange={(e) => setTvaVente(e.target.value)}
                min="0"
                max="100"
                step="0.1"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Taux de TVA appliqué sur les ventes (généralement 20% au Maroc)
              </small>
            </div>
            
            <button 
              type="submit" 
              className="btn" 
              disabled={saving}
              style={{ width: 200 }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            
            <div style={{ 
              marginTop: 30, 
              padding: 20, 
              background: "#1a2b45", 
              borderRadius: 10,
              border: "1px solid #2a3b55"
            }}>
              <h4 style={{ color: "#7ee4e6", marginBottom: 10 }}>
                ℹ️ Informations importantes
              </h4>
              <ul style={{ color: "#e8ecf4", marginLeft: 20 }}>
                <li>Les paramètres de gestion s'appliquent à toute la société</li>
                <li>Le seuil d'alerte peut être personnalisé pour chaque produit</li>
                <li>Les alertes de péremption apparaissent dans le tableau de bord</li>
                <li>La TVA est calculée automatiquement sur les factures</li>
              </ul>
            </div>
          </form>
        )}
        
        {/* Onglet Activités */}
        {activeTab === "activites" && (
          <div>
            <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
              Suivi des Activités des Utilisateurs
            </h3>
            
            {/* Alerte sur la traçabilité */}
            <div style={{
              background: "#2a1f0d",
              border: "2px solid #e7e074",
              borderRadius: 10,
              padding: 15,
              marginBottom: 20
            }}>
              <h4 style={{ color: "#e7e074", marginBottom: 10 }}>
                ⚠️ Information sur la Traçabilité
              </h4>
              <p style={{ color: "#f1f5fb", marginBottom: 10 }}>
                Les activités affichées peuvent montrer "Utilisateur inconnu" car la traçabilité 
                n'était pas encore activée sur les anciennes opérations.
              </p>
              <button 
                className="btn" 
                onClick={enableUserTracking}
                style={{ marginTop: 10 }}
              >
                🔧 Activer la traçabilité complète
              </button>
            </div>
            
            {loadingActivites && (
              <div style={{ textAlign: "center", padding: 20, color: "#7ee4e6" }}>
                Chargement des activités...
              </div>
            )}
            
            {!loadingActivites && activites.length > 0 && (
              <>
                {/* Statistiques globales */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 15,
                  marginBottom: 25
                }}>
                  {/* Carte pour utilisateur actuel */}
                  <div style={{
                    background: "#1a2b45",
                    padding: 15,
                    borderRadius: 10,
                    border: "2px solid #2bd2a6"
                  }}>
                    <h4 style={{ color: "#2bd2a6", marginBottom: 10 }}>
                      👤 {getUserName(user.uid, user.email)} (Vous)
                    </h4>
                    <div style={{ fontSize: "14px", color: "#e8ecf4" }}>
                      <div>Rôle: <span style={{ color: "#7ee4e6" }}>{role}</span></div>
                      {(() => {
                        const stats = getStatistiquesUtilisateur(user.uid);
                        return (
                          <>
                            <div>Total activités: <span style={{ color: "#2bd2a6" }}>{stats.totalActivites}</span></div>
                            <div>Ventes: <span style={{ color: "#2bd2a6" }}>{stats.totalVentes} ({stats.montantVentes.toFixed(2)} DH)</span></div>
                            <div>Achats: <span style={{ color: "#61c7ef" }}>{stats.totalAchats} ({stats.montantAchats.toFixed(2)} DH)</span></div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  
                  {/* Cartes pour autres utilisateurs */}
                  {utilisateurs.filter(u => u.id !== user.uid).map((utilisateur) => {
                    const stats = getStatistiquesUtilisateur(utilisateur.id);
                    return (
                      <div key={utilisateur.id} style={{
                        background: "#1a2b45",
                        padding: 15,
                        borderRadius: 10,
                        border: "1px solid #2a3b55"
                      }}>
                        <h4 style={{ color: "#98c4f9", marginBottom: 10 }}>
                          {getUserName(utilisateur.id)}
                        </h4>
                        <div style={{ fontSize: "14px", color: "#e8ecf4" }}>
                          <div>Rôle: <span style={{ color: "#7ee4e6" }}>{utilisateur.role}</span></div>
                          <div>Total activités: <span style={{ color: "#2bd2a6" }}>{stats.totalActivites}</span></div>
                          <div>Ventes: <span style={{ color: "#2bd2a6" }}>{stats.totalVentes} ({stats.montantVentes.toFixed(2)} DH)</span></div>
                          <div>Achats: <span style={{ color: "#61c7ef" }}>{stats.totalAchats} ({stats.montantAchats.toFixed(2)} DH)</span></div>
                          {stats.derniereActivite && (
                            <div style={{ marginTop: 5, fontSize: "12px", color: "#98c4f9" }}>
                              Dernière activité: {formatDate(stats.derniereActivite)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Toggle filtres */}
                <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:15}}>
                  <button
                    className="btn"
                    type="button"
                    style={{
                      fontSize:"1.28em",
                      padding:"2px 13px",
                      minWidth:35,
                      background:showActivitesFilters
                        ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
                        : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
                    }}
                    onClick={()=>setShowActivitesFilters(v=>!v)}
                  >
                    {showActivitesFilters ? "➖" : "➕"}
                  </button>
                  <span style={{fontWeight:700,fontSize:17}}>Filtres d'activités</span>
                </div>
                
                {/* Filtres */}
                {showActivitesFilters && (
                  <div style={{ 
                    display: "flex", 
                    gap: 15, 
                    flexWrap: "wrap", 
                    alignItems: "center",
                    marginBottom: 20,
                    padding: 15,
                    background: "#1a2b45",
                    borderRadius: 10
                  }}>
                    <div>
                      <label style={{ color: "#98c4f9", fontWeight: 700 }}>Utilisateur</label>
                      <select 
                        className="input" 
                        value={selectedUserId} 
                        onChange={(e) => setSelectedUserId(e.target.value)}
                      >
                        <option value="">Tous les utilisateurs</option>
                        <option value={user.uid}>{getUserName(user.uid, user.email)} (Vous)</option>
                        {utilisateurs.filter(u => u.id !== user.uid).map((u) => (
                          <option key={u.id} value={u.id}>
                            {getUserName(u.id)} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label style={{ color: "#98c4f9", fontWeight: 700 }}>Type d'activité</label>
                      <select 
                        className="input" 
                        value={filterType} 
                        onChange={(e) => setFilterType(e.target.value)}
                      >
                        <option value="">Tous les types</option>
                        <option value="Vente">Ventes</option>
                        <option value="Achat">Achats</option>
                        <option value="Stock">Modifications Stock</option>
                        <option value="Retour">Retours</option>
                        <option value="Paiement">Paiements</option>
                      </select>
                    </div>
                    
                    <div>
                      <label style={{ color: "#98c4f9", fontWeight: 700 }}>Du</label>
                      <input 
                        type="date" 
                        className="input" 
                        value={filterDateMin} 
                        onChange={(e) => setFilterDateMin(e.target.value)} 
                      />
                    </div>
                    
                    <div>
                      <label style={{ color: "#98c4f9", fontWeight: 700 }}>Au</label>
                      <input 
                        type="date" 
                        className="input" 
                        value={filterDateMax} 
                        onChange={(e) => setFilterDateMax(e.target.value)} 
                      />
                    </div>
                    
                    {(selectedUserId || filterType || filterDateMin || filterDateMax) && (
                      <button 
                        className="btn danger" 
                        type="button" 
                        onClick={() => {
                          setSelectedUserId("");
                          setFilterType("");
                          setFilterDateMin("");
                          setFilterDateMax("");
                        }}
                      >
                        Effacer filtres
                      </button>
                    )}
                  </div>
                )}
                
                {/* Tableau des activités */}
                <div className="table-pro-full" style={{ maxHeight: "60vh" }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 150 }}>Date</th>
                        <th style={{ minWidth: 180 }}>Utilisateur</th>
                        <th style={{ minWidth: 100 }}>Type</th>
                        <th style={{ minWidth: 200 }}>Détails</th>
                        <th style={{ minWidth: 120 }}>Montant</th>
                        <th style={{ minWidth: 100 }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activitesFiltrees.map((activite, index) => (
                        <tr key={`${activite.type}-${activite.id}-${index}`}>
                          <td style={{ fontSize: "13px" }}>
                            {formatDate(activite.date)}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>
                              {getUserName(activite.utilisateurId, activite.utilisateurEmail)}
                              {activite.utilisateurId === user.uid && (
                                <span style={{ color: "#2bd2a6", fontSize: "12px" }}> (Vous)</span>
                              )}
                            </div>
                            <div style={{ fontSize: "12px", color: "#98c4f9" }}>
                              {getUserRole(activite.utilisateurId)}
                            </div>
                            {activite.utilisateurEmail && (
                              <div style={{ fontSize: "11px", color: "#7ee4e6" }}>
                                {activite.utilisateurEmail}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 700,
                              background: getTypeColor(activite.type) + "30",
                              color: getTypeColor(activite.type),
                              border: `1px solid ${getTypeColor(activite.type)}`
                            }}>
                              {activite.type}
                            </span>
                          </td>
                          <td style={{ fontSize: "14px" }}>
                            {activite.details}
                            {activite.nombreArticles && (
                              <div style={{ fontSize: "12px", color: "#98c4f9" }}>
                                ({activite.nombreArticles} articles)
                              </div>
                            )}
                            {activite.motif && (
                              <div style={{ fontSize: "12px", color: "#98c4f9" }}>
                                Motif: {activite.motif}
                              </div>
                            )}
                            {activite.collection && (
                              <div style={{ fontSize: "11px", color: "#7ee4e6", opacity: 0.7 }}>
                                Source: {activite.collection}
                              </div>
                            )}
                          </td>
                          <td>
                            {activite.montant ? (
                              <span style={{ fontWeight: 600, color: "#2bd2a6" }}>
                                {activite.montant.toFixed(2)} DH
                              </span>
                            ) : (
                              <span style={{ color: "#98c4f9" }}>-</span>
                            )}
                          </td>
                          <td>
                            <span className={`status-chip ${
                              activite.statut === "payé" || activite.statut === "Enregistré" || activite.statut === "Effectué" || activite.statut === "Modifié"
                                ? "success" 
                                : activite.statut === "impayé" 
                                ? "danger" 
                                : "info"
                            }`}>
                              {activite.statut}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {activitesFiltrees.length === 0 && (
                  <div style={{ 
                    textAlign: "center", 
                    padding: 40, 
                    color: "#98c4f9",
                    background: "#1a2b45",
                    borderRadius: 10,
                    marginTop: 20
                  }}>
                    Aucune activité trouvée avec les filtres sélectionnés
                  </div>
                )}
              </>
            )}
            
            {!loadingActivites && activites.length === 0 && (
              <div style={{ 
                textAlign: "center", 
                padding: 40, 
                color: "#98c4f9",
                background: "#1a2b45",
                borderRadius: 10
              }}>
                Aucune activité enregistrée pour le moment
              </div>
            )}
            
            {/* Bouton de rafraîchissement */}
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button 
                className="btn info" 
                onClick={fetchActivites}
                disabled={loadingActivites}
              >
                {loadingActivites ? "Chargement..." : "🔄 Actualiser les activités"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
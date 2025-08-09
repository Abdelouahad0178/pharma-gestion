import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where, 
  Timestamp 
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import { useNavigate } from "react-router-dom";

// Fonction de formatage des dates CORRIGÉE
function formatActivityDate(dateInput) {
  let date;
  
  // Gérer tous les types de dates possibles
  if (!dateInput) {
    return "Date non spécifiée";
  }
  
  // Si c'est un Timestamp Firestore
  if (dateInput?.toDate && typeof dateInput.toDate === 'function') {
    date = dateInput.toDate();
  }
  // Si c'est un objet avec seconds (Firestore)
  else if (dateInput?.seconds) {
    date = new Date(dateInput.seconds * 1000);
  }
  // Si c'est déjà un objet Date
  else if (dateInput instanceof Date) {
    date = dateInput;
  }
  // Si c'est une string ISO
  else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  }
  // Si c'est un nombre (timestamp)
  else if (typeof dateInput === 'number') {
    date = new Date(dateInput);
  }
  else {
    return "Format de date invalide";
  }

  // Vérifier que la date est valide
  if (isNaN(date.getTime())) {
    return "Date invalide";
  }

  // Calculer la différence avec maintenant
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Fonction pour formater l'heure
  const formatTime = (d) => {
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Fonction pour formater la date complète
  const formatFullDate = (d) => {
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Retourner le format approprié
  if (diffSeconds < 60) {
    return "À l'instant";
  } else if (diffMinutes < 60) {
    return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  } else if (diffHours < 24 && diffDays === 0) {
    return `Aujourd'hui à ${formatTime(date)}`;
  } else if (diffDays === 1) {
    return `Hier à ${formatTime(date)}`;
  } else if (diffDays < 7) {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return `${days[date.getDay()]} à ${formatTime(date)}`;
  } else {
    return `${formatFullDate(date)} ${formatTime(date)}`;
  }
}

export default function Dashboard() {
  const { user, societeId, role, loading } = useUserRole();
  const navigate = useNavigate();
  
  // États principaux
  const [totalVentes, setTotalVentes] = useState(0);
  const [totalAchats, setTotalAchats] = useState(0);
  const [totalPaiements, setTotalPaiements] = useState(0);
  const [produitsStock, setProduitsStock] = useState(0);
  const [documentsImpayes, setDocumentsImpayes] = useState(0);
  const [alertes, setAlertes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [periode, setPeriode] = useState("mois");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showActivities, setShowActivities] = useState(true);
  const [activityFilter, setActivityFilter] = useState("all");

  // State for responsive design
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Effect to update isMobile on window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fonction de déconnexion
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  };

  // Charger les activités récentes - MODIFIÉ POUR AFFICHER SEULEMENT AUJOURD'HUI
  const fetchActivities = async () => {
    if (!societeId) return setActivities([]);
    
    try {
      // Calculer le début et la fin de la journée actuelle
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      
      // Convertir en Timestamp Firestore
      const startTimestamp = Timestamp.fromDate(startOfDay);
      const endTimestamp = Timestamp.fromDate(endOfDay);
      
      // Requête avec filtre sur la date d'aujourd'hui
      const q = query(
        collection(db, "societe", societeId, "activities"),
        where("timestamp", ">=", startTimestamp),
        where("timestamp", "<=", endTimestamp),
        orderBy("timestamp", "desc"),
        limit(50) // Augmenté car on filtre déjà par jour
      );
      
      const snapshot = await getDocs(q);
      const activitiesData = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        activitiesData.push({
          id: doc.id,
          ...data,
          // S'assurer que le timestamp est présent
          timestamp: data.timestamp || data.date || data.createdAt || Timestamp.now()
        });
      });
      
      console.log(`🔥 Activités d'aujourd'hui chargées: ${activitiesData.length}`);
      setActivities(activitiesData);
    } catch (error) {
      console.error("Erreur lors du chargement des activités d'aujourd'hui:", error);
      
      // Fallback: si l'erreur est due à l'index manquant, utiliser l'ancienne méthode avec filtre côté client
      try {
        console.log("🔄 Tentative avec méthode de fallback...");
        const q = query(
          collection(db, "societe", societeId, "activities"),
          orderBy("timestamp", "desc"),
          limit(100) // Plus d'activités pour le filtrage côté client
        );
        
        const snapshot = await getDocs(q);
        const allActivities = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          allActivities.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp || data.date || data.createdAt || Timestamp.now()
          });
        });
        
        // Filtrer côté client pour aujourd'hui seulement
        const now = new Date();
        const today = now.toDateString();
        
        const todayActivities = allActivities.filter(activity => {
          let activityDate;
          
          if (activity.timestamp?.toDate) {
            activityDate = activity.timestamp.toDate();
          } else if (activity.timestamp?.seconds) {
            activityDate = new Date(activity.timestamp.seconds * 1000);
          } else if (activity.date) {
            activityDate = new Date(activity.date);
          } else {
            return false;
          }
          
          return activityDate.toDateString() === today;
        });
        
        console.log(`📅 Activités filtrées pour aujourd'hui: ${todayActivities.length}`);
        setActivities(todayActivities);
        
      } catch (fallbackError) {
        console.error("Erreur même avec la méthode de fallback:", fallbackError);
        setActivities([]);
      }
    }
  };

  // Charger les données principales
  const fetchData = async () => {
    if (!societeId) return;

    try {
      // Ventes
      const ventesSnap = await getDocs(collection(db, "societe", societeId, "ventes"));
      let ventesArr = [];
      ventesSnap.forEach((doc) => ventesArr.push(doc.data()));
      
      // Achats
      const achatsSnap = await getDocs(collection(db, "societe", societeId, "achats"));
      let achatsArr = [];
      achatsSnap.forEach((doc) => achatsArr.push(doc.data()));
      
      // Stock
      const stockSnap = await getDocs(collection(db, "societe", societeId, "stock"));
      let stockArr = [];
      stockSnap.forEach((doc) => stockArr.push(doc.data()));
      
      // Paiements
      const paiementsSnap = await getDocs(collection(db, "societe", societeId, "paiements"));
      let paiementsArr = [];
      paiementsSnap.forEach((doc) => paiementsArr.push(doc.data()));

      setProduitsStock(stockArr.length);

      // Filtrer par période
      const filteredVentes = filterByPeriodeOuDates(ventesArr, periode, dateMin, dateMax);
      const filteredAchats = filterByPeriodeOuDates(achatsArr, periode, dateMin, dateMax);
      const filteredPaiements = filterByPeriodeOuDates(paiementsArr, periode, dateMin, dateMax);

      // Calculer les totaux
      setTotalVentes(
        filteredVentes.reduce((total, vente) => {
          const articles = Array.isArray(vente.articles) ? vente.articles : [];
          return total + articles.reduce((sum, a) =>
            sum + (((a.prixUnitaire || 0) * (a.quantite || 0)) - (a.remise || 0)), 0);
        }, 0)
      );
      
      setTotalAchats(
        filteredAchats.reduce((total, achat) => {
          const articles = Array.isArray(achat.articles) ? achat.articles : [];
          return total + articles.reduce((sum, a) =>
            sum + (((a.prixUnitaire || 0) * (a.quantite || 0)) - (a.remise || 0)), 0);
        }, 0)
      );

      setTotalPaiements(
        filteredPaiements.reduce((total, paiement) => 
          total + (paiement.montant || 0), 0)
      );

      // Calculer documents impayés
      let impayes = 0;
      // Ensure 'doc.statutPaiement' is checked for existence before comparison
      [...ventesArr, ...achatsArr].forEach(doc => {
        if (doc.statutPaiement && (doc.statutPaiement === 'impayé' || doc.statutPaiement === 'partiel')) {
          impayes++;
        }
      });
      setDocumentsImpayes(impayes);

      // Générer les alertes
      const alertList = [];
      const today = new Date();
      
      stockArr.forEach((item) => {
        // Stock bas
        if ((item.quantite || 0) <= (item.seuil || 5)) {
          alertList.push({ 
            type: "Stock bas", 
            message: `${item.nom || ""} (Qté: ${item.quantite || 0})`,
            severity: "warning",
            icon: "📦"
          });
        }
        
        // Péremption
        if (item.datePeremption) {
          const expDate = new Date(item.datePeremption);
          const diffDays = Math.ceil((expDate - today) / (1000 * 3600 * 24));
          
          if (diffDays <= 0) {
            alertList.push({ 
              type: "Produit périmé", 
              message: `${item.nom || ""} est périmé !`,
              severity: "critical",
              icon: "🚫"
            });
          } else if (diffDays <= 30) {
            alertList.push({ 
              type: "Péremption proche", 
              message: `${item.nom || ""} (${diffDays} j)`,
              severity: "danger",
              icon: "🟡"
            });
          }
        }
      });
      
      setAlertes(alertList);
    } catch (error) {
      console.error("Erreur lors du chargement des données:", error);
    }
  };

  // Filtrer par période
  const filterByPeriodeOuDates = (data, period, min, max) => {
    const now = new Date();
    return data.filter((item) => {
      if (!item.date && !item.timestamp) return false;
      
      const d = item.date?.toDate ? item.date.toDate() : 
                item.timestamp?.toDate ? item.timestamp.toDate() :
                new Date(item.date || item.timestamp);

      if (min && d < new Date(min)) return false;
      if (max && d > new Date(max + "T23:59:59")) return false;

      if (!min && !max) {
        switch (period) {
          case "jour": 
            return d.toDateString() === now.toDateString();
          case "semaine": 
            const weekAgo = new Date(now);
            weekAgo.setDate(now.getDate() - 7);
            return d >= weekAgo;
          case "mois": 
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          case "annee": 
            return d.getFullYear() === now.getFullYear();
          default: 
            return true;
        }
      }
      return true;
    });
  };

  useEffect(() => {
    if (societeId && !loading) {
      fetchData();
      fetchActivities();
    }
  }, [societeId, loading, periode, dateMin, dateMax]);

  // 🔥 FONCTION AMÉLIORÉE : Styles et labels pour les types d'activités avec actions
  const getActivityStyle = (type, action) => {
    // Définir les styles de base par type
    const baseStyles = {
      vente: { icon: '💰', color: '#2bd2a6', label: 'Vente' },
      achat: { icon: '📦', color: '#ee4e61', label: 'Achat' },
      paiement: { icon: '💳', color: '#61c7ef', label: 'Paiement' },
      stock: { icon: '📦', color: '#6ee9df', label: 'Stock' }, // Unified stock type
      retour: { icon: '↩️', color: '#ab47bc', label: 'Retour stock' }, // Unified retour type
      facture: { icon: '📄', color: '#5c6bc0', label: 'Facture' },
      devis: { icon: '📋', color: '#42a5f5', label: 'Devis' }
    };
    
    const style = baseStyles[type] || { icon: '📌', color: '#999', label: 'Activité' };
    
    // Modifier le label selon l'action
    if (action) {
      switch (action) {
        case 'modification':
          style.label = `Modification ${style.label.toLowerCase()}`;
          style.icon = '✏️ ' + style.icon;
          break;
        case 'suppression':
          style.label = `Suppression ${style.label.toLowerCase()}`;
          style.icon = '🗑️ ' + style.icon;
          break;
        case 'création':
          style.label = `Nouvelle ${style.label.toLowerCase()}`;
          style.icon = '✨ ' + style.icon;
          break;
        case 'annulation_retour': // Specific action for retour
          style.label = `Annulation de retour`;
          style.icon = '🔄 ' + style.icon;
          break;
      }
    }
    
    return style;
  };

  // Filtrer les activités
  const filteredActivities = activities.filter(activity => {
    if (activityFilter === "all") return true;
    // Handle stock_ajout, stock_modif, stock_retour from old types if they still exist
    if (activity.type === 'stock_ajout' || activity.type === 'stock_modif' || activity.type === 'stock_retour') {
      return activityFilter === 'stock' || activityFilter === 'retour';
    }
    return activity.type === activityFilter;
  }).slice(0, 15); // Afficher 15 activités

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#e3eaff" }}>
        Chargement...
      </div>
    );
  }

  if (!user || !societeId) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#ff6b6b" }}>
        Non connecté ou société non configurée.
      </div>
    );
  }

  // Styles
  const dashboardStyle = {
    maxWidth: 1250,
    margin: "30px auto 0 auto",
    padding: "0 20px",
    fontFamily: "'Inter', Arial, sans-serif",
    color: "#e8ecf4",
    minHeight: "92vh"
  };

  const cardStyle = {
    background: "linear-gradient(120deg, #223049 0%, #3a4c67 100%)",
    borderRadius: 16,
    boxShadow: "0 8px 48px #202a3c80",
    padding: "28px 26px 18px 26px",
    border: "1.5px solid #415377",
    color: "#e8ecf4",
    minHeight: 145,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.2s",
    cursor: "pointer"
  };

  return (
    <div style={dashboardStyle}>
      {/* En-tête */}
      <div style={{
        fontSize: "2.1rem",
        fontWeight: 800,
        color: "#e3eaff",
        padding: "26px 26px 20px 26px",
        background: "#293b53",
        borderRadius: "16px 16px 0 0",
        marginBottom: "20px",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "center" : "space-between",
        justifyContent: "space-between",
        gap: isMobile ? "20px" : "0"
      }}>
        {/* Section titre */}
        <div style={{ textAlign: isMobile ? "center" : "left" }}>
          <span>Tableau de bord</span>
          <div style={{ fontSize: "1rem", fontWeight: 400, marginTop: "5px", color: "#98c4f9" }}>
            👩‍💼 {role === 'docteur' ? 'Pharmacien' : 'Vendeuse'}
          </div>
        </div>
        
        {/* Section boutons */}
        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row", // Vertical sur mobile, horizontal sur desktop
          alignItems: "center",
          gap: isMobile ? "12px" : "15px"
        }}>
          {/* Bouton MA SOCIÉTÉ */}
          <button
            type="button"
            style={{
              background: "linear-gradient(90deg, #4a69bd 0%, #6c5ce7 100%)",
              color: "#fff",
              fontSize: isMobile ? "0.9rem" : "1rem",
              fontWeight: 600,
              borderRadius: 12,
              padding: isMobile ? "10px 20px" : "12px 24px",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",            
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.3s",
              minWidth: isMobile ? "200px" : "160px",
              boxShadow: "0 4px 12px rgba(74, 105, 189, 0.3)"
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 6px 16px rgba(74, 105, 189, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 12px rgba(74, 105, 189, 0.3)";
            }}
            onClick={() => {
              // Vous pouvez ajouter ici la logique pour gérer la société
              console.log("MA SOCIÉTÉ cliqué");
            }}
          >
            🏢 MA SOCIÉTÉ
          </button>

          {/* Bouton DÉCONNEXION */}
          <button
            type="button"
            style={{
              background: "linear-gradient(90deg, #ee5a52 0%, #ff6b6b 100%)",
              color: "#fff",
              fontSize: isMobile ? "0.9rem" : "1rem",
              fontWeight: 600,
              borderRadius: 12,
              padding: isMobile ? "10px 20px" : "12px 24px",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.3s",
              minWidth: isMobile ? "200px" : "160px",
              boxShadow: "0 4px 12px rgba(238, 90, 82, 0.3)"
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 6px 16px rgba(238, 90, 82, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 12px rgba(238, 90, 82, 0.3)";
            }}
            onClick={handleLogout}
          >
            🚪 DÉCONNEXION
          </button>

          {/* Bouton filtres */}
          <button
            type="button"
            style={{
              background: showFilters ? "#ee4e61" : "#2bd2a6",
              color: "#fff",
              fontSize: 20,
              borderRadius: 12,
              width: isMobile ? "50px" : "42px",
              height: isMobile ? "50px" : "42px",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.3s",
              boxShadow: "0 4px 12px rgba(43, 210, 166, 0.3)"
            }}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Filtres */}
      {showFilters && (
        <div style={{
          background: "#283c55",
          borderRadius: 11,
          padding: "17px 23px",
          marginBottom: "20px",
          display: "flex",
          flexWrap: "wrap",
          gap: "15px",
          alignItems: "center"
        }}>
          <select 
            value={periode} 
            onChange={e => setPeriode(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              background: "#1a2332",
              color: "#e3eaff",
              border: "1px solid #415377"
            }}
          >
            <option value="jour">Aujourd'hui</option>
            <option value="semaine">Cette semaine</option>
            <option value="mois">Ce mois</option>
            <option value="annee">Cette année</option>
          </select>
          
          <input 
            type="date" 
            value={dateMin} 
            onChange={e => setDateMin(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              background: "#1a2332",
              color: "#e3eaff",
              border: "1px solid #415377"
            }}
          />
          
          <input 
            type="date" 
            value={dateMax} 
            onChange={e => setDateMax(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              background: "#1a2332",
              color: "#e3eaff",
              border: "1px solid #415377"
            }}
          />
          
          <button 
            onClick={() => { fetchData(); fetchActivities(); }}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              background: "#3272e0",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Actualiser
          </button>
        </div>
      )}

      {/* Cartes statistiques */}
      <div style={{
        display: "grid",
        // Responsive grid columns: 1 column for mobile, auto-fit for desktop
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "20px",
        marginBottom: "30px"
      }}>
        <div style={cardStyle} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"} 
             onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
          <div style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Ventes</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#7ee4e6" }}>
            {totalVentes.toFixed(2)} DH
          </div>
        </div>
        
        <div style={cardStyle} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"} 
             onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
          <div style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Achats</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#90e0a0" }}>
            {totalAchats.toFixed(2)} DH
          </div>
        </div>
        
        <div style={cardStyle} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"} 
             onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
          <div style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Paiements</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#61c7ef" }}>
            {totalPaiements.toFixed(2)} DH
          </div>
        </div>
        
        <div style={cardStyle} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"} 
             onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
          <div style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Produits en stock</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#e7e074" }}>
            {produitsStock}
          </div>
        </div>
        
        <div style={cardStyle} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"} 
             onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
          <div style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Documents impayés</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#ffa726" }}>
            {documentsImpayes}
          </div>
        </div>
        
        <div style={cardStyle} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"} 
             onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
          <div style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Alertes</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#fd6565" }}>
            {alertes.length}
          </div>
        </div>
      </div>

      {/* Section Alertes */}
      {alertes.length > 0 && (
        <div style={{
          background: "#283c55",
          borderRadius: 13,
          marginBottom: 20,
          overflow: "hidden"
        }}>
          <div style={{
            padding: "14px 22px",
            background: "#233354",
            fontWeight: 700,
            fontSize: "1.17rem",
            color: "#fd6565"
          }}>
            🚨 Alertes ({alertes.length})
          </div>
          <div style={{ padding: "10px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: "10px 20px", textAlign: "left", color: "#98c4f9" }}>Type</th>
                  <th style={{ padding: "10px 20px", textAlign: "left", color: "#98c4f9" }}>Détail</th>
                </tr>
              </thead>
              <tbody>
                {alertes.map((alerte, i) => (
                  <tr key={i} style={{ 
                    background: i % 2 === 0 ? "transparent" : "#1a233240",
                    borderBottom: "1px solid #334568"
                  }}>
                    <td style={{ padding: "12px 20px", color: "#e3eaff" }}>
                      <span style={{ marginRight: "8px" }}>{alerte.icon}</span>
                      {alerte.type}
                    </td>
                    <td style={{ padding: "12px 20px", color: "#b5bed4" }}>
                      {alerte.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section Activités Récentes */}
      <div style={{
        background: "#283c55",
        borderRadius: 13,
        overflow: "hidden"
      }}>
        <div style={{
          padding: "14px 22px",
          background: "#233354",
          display: "flex",
          flexDirection: isMobile ? "column" : "row", // Responsive flex direction
          justifyContent: isMobile ? "flex-start" : "space-between", // Adjusted for column
          alignItems: isMobile ? "flex-start" : "center", // Adjusted for column
          gap: isMobile ? "10px" : "0", // Added gap for mobile
        }}>
          <span style={{ fontWeight: 700, fontSize: "1.17rem", color: "#a1e8e7" }}>
            📊 Activités d'aujourd'hui
          </span>
          <button
            onClick={() => setShowActivities(!showActivities)}
            style={{
              background: "transparent",
              border: "none",
              color: "#a1e8e7",
              cursor: "pointer",
              fontSize: "1.2rem",
              padding: "5px"
            }}
          >
            {showActivities ? "➖" : "➕"}
          </button>
        </div>

        {showActivities && (
          <>
            {/* Filtres d'activités */}
            <div style={{ 
              padding: "12px 22px", 
              borderBottom: "1px solid #334568",
              display: "flex",
              flexWrap: "wrap", 
              flexDirection: isMobile ? "column" : "row", // Make filter buttons vertical on mobile
              alignItems: isMobile ? "flex-start" : "center", // Align to start for column layout
              gap: "10px" // Add gap for vertical spacing
            }}>
              <button
                onClick={() => setActivityFilter("all")}
                style={{
                  padding: "6px 14px",
                  margin: isMobile ? "0" : "0 5px", // Remove horizontal margin if vertical
                  borderRadius: 8,
                  border: "none",
                  background: activityFilter === "all" ? "#3272e0" : "#334568",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: 500
                }}
              >
                Tout
              </button>
              {['vente', 'achat', 'paiement', 'stock', 'retour'].map(type => { // Simplified types based on new activity logging
                const style = getActivityStyle(type);
                return (
                  <button
                    key={type}
                    onClick={() => setActivityFilter(type)}
                    style={{
                      padding: "6px 14px",
                      margin: isMobile ? "0" : "0 5px", // Remove horizontal margin if vertical
                      borderRadius: 8,
                      border: "none",
                      background: activityFilter === type ? style.color : "#334568",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: 500
                    }}
                  >
                    {style.icon} {style.label}
                  </button>
                );
              })}
            </div>

            {/* Liste des activités */}
            <div style={{ maxHeight: "500px", overflowY: "auto" }}>
              {filteredActivities.length === 0 ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#b5bed4" }}>
                  📅 Aucune activité aujourd'hui
                  <div style={{ fontSize: "0.9em", marginTop: "8px", color: "#98c4f9" }}>
                    Les nouvelles activités apparaîtront ici
                  </div>
                </div>
              ) : (
                filteredActivities.map((activity) => {
                  const style = getActivityStyle(activity.type, activity.details?.action);
                  const details = activity.details || {};
                  
                  return (
                    <div 
                      key={activity.id}
                      style={{
                        padding: "15px 22px",
                        borderBottom: "1px solid #334568",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "background 0.2s",
                        cursor: "pointer"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#2a3d58"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                        {/* Icône */}
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: style.color + "20",
                          fontSize: "1.2rem"
                        }}>
                          {style.icon}
                        </div>
                        
                        {/* Détails */}
                        <div>
                          <div style={{ fontWeight: 600, color: "#e3eaff" }}>
                            {style.label}
                            <span style={{ fontSize: "0.85em", color: "#98c4f9", marginLeft: 8 }}>
                              par {activity.userEmail?.split('@')[0] || activity.userId || 'utilisateur'}
                            </span>
                            {/* Badge pour l'action */}
                            {details.action && (
                              <span style={{
                                marginLeft: 10,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.75em",
                                background: details.action === 'suppression' ? "#ee4e61" :
                                            details.action === 'modification' ? "#ffa726" :
                                            details.action === 'création' || details.action === 'annulation_retour' ? "#2bd2a6" : "#98c4f9", // Added annulation_retour to creation color
                                color: "#fff",
                                fontWeight: 600
                              }}>
                                {details.action.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.9em", color: "#b5bed4", marginTop: 2 }}>
                            {activity.type === 'vente' && `Client: ${details.client || 'N/A'}`}
                            {activity.type === 'achat' && `Fournisseur: ${details.fournisseur || 'N/A'}`}
                            {activity.type === 'paiement' && `${details.mode || 'Espèces'} - ${details.type || ''}`}
                            {activity.type === 'stock' && `Produit: ${details.produit || 'N/A'} (Qté: ${details.quantite || 'N/A'})`} {/* Consolidated stock details */}
                            {activity.type === 'retour' && `${details.produit || 'N/A'} - ${details.motif || ''}`} {/* Consolidated retour details */}
                            {details.articles && ` (${details.articles} articles)`}
                            {details.statutPaiement && (
                              <span style={{
                                marginLeft: 10,
                                padding: "2px 6px",
                                borderRadius: 6,
                                fontSize: "0.85em",
                                background: details.statutPaiement === 'payé' ? "#2bd2a640" :
                                            details.statutPaiement === 'impayé' ? "#ee4e6140" : "#ffa72640",
                                color: details.statutPaiement === 'payé' ? "#2bd2a6" :
                                       details.statutPaiement === 'impayé' ? "#ee4e61" : "#ffa726",
                                border: `1px solid ${details.statutPaiement === 'payé' ? "#2bd2a6" :
                                                    details.statutPaiement === 'impayé' ? "#ee4e61" : "#ffa726"}`
                              }}>
                                {details.statutPaiement}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.8em", color: "#7ee4e6", marginTop: 4 }}>
                            {formatActivityDate(activity.timestamp)}
                          </div>
                        </div>
                      </div>
                      
                      {/* Montant */}
                      {details.montant && (
                        <div style={{
                          fontWeight: 700,
                          fontSize: "1.2rem",
                          color: style.color
                        }}>
                          {details.montant} DH
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
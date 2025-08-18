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

// Fonction de formatage des dates OPTIMISÉE
function formatActivityDate(dateInput) {
  let date;
  
  if (!dateInput) {
    return "Date non spécifiée";
  }
  
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === 'function') {
      date = dateInput.toDate();
    } else if (dateInput?.seconds) {
      date = new Date(dateInput.seconds * 1000);
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'string') {
      date = new Date(dateInput);
    } else if (typeof dateInput === 'number') {
      date = new Date(dateInput);
    } else {
      return "Format de date invalide";
    }

    if (isNaN(date.getTime())) {
      return "Date invalide";
    }

    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    const formatTime = (d) => {
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const formatFullDate = (d) => {
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

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
  } catch (error) {
    console.error("Erreur de formatage de date:", error);
    return "Date invalide";
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
  const [lotsActifs, setLotsActifs] = useState(0); // 🆕 Nombre de lots actifs
  const [fournisseursActifs, setFournisseursActifs] = useState(0); // 🆕 Fournisseurs
  const [documentsImpayes, setDocumentsImpayes] = useState(0);
  const [soldeCaisse, setSoldeCaisse] = useState(0);
  const [alertes, setAlertes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [periode, setPeriode] = useState("mois");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showActivities, setShowActivities] = useState(true);
  const [activityFilter, setActivityFilter] = useState("all");

  // États pour responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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

  // Fonction pour afficher les notifications
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Fonction de déconnexion
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
      showNotification("Déconnexion réussie !", "success");
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
      showNotification("Erreur lors de la déconnexion", "error");
    }
  };

  // 🆕 Charger les activités récentes - OPTIMISÉ POUR MULTI-LOTS
  const fetchActivities = async () => {
    if (!societeId) {
      setActivities([]);
      return;
    }
    
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      
      const startTimestamp = Timestamp.fromDate(startOfDay);
      const endTimestamp = Timestamp.fromDate(endOfDay);
      
      const q = query(
        collection(db, "societe", societeId, "activities"),
        where("timestamp", ">=", startTimestamp),
        where("timestamp", "<=", endTimestamp),
        orderBy("timestamp", "desc"),
        limit(50)
      );
      
      const snapshot = await getDocs(q);
      const activitiesData = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        activitiesData.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp || data.date || data.createdAt || Timestamp.now()
        });
      });
      
      console.log(`🔥 Activités multi-lots d'aujourd'hui: ${activitiesData.length}`);
      setActivities(activitiesData);
    } catch (error) {
      console.error("Erreur lors du chargement des activités:", error);
      
      // Fallback strategy
      try {
        console.log("🔄 Tentative avec méthode de fallback...");
        const q = query(
          collection(db, "societe", societeId, "activities"),
          orderBy("timestamp", "desc"),
          limit(100)
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
        
        const now = new Date();
        const today = now.toDateString();
        
        const todayActivities = allActivities.filter(activity => {
          try {
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
          } catch (dateError) {
            console.warn("Erreur de traitement de date pour l'activité:", activity.id, dateError);
            return false;
          }
        });
        
        console.log(`📅 Activités filtrées pour aujourd'hui: ${todayActivities.length}`);
        setActivities(todayActivities);
        
      } catch (fallbackError) {
        console.error("Erreur même avec la méthode de fallback:", fallbackError);
        setActivities([]);
      }
    }
  };

  // 🆕 Charger les données principales - OPTIMISÉ POUR MULTI-LOTS
  const fetchData = async () => {
    if (!societeId) return;

    setIsLoading(true);
    try {
      console.log("🔄 Début du chargement des données multi-lots...");

      // Charger toutes les collections en parallèle
      const [ventesSnap, achatsSnap, stockSnap, stockEntriesSnap, paiementsSnap, retoursSnap] = await Promise.all([
        getDocs(collection(db, "societe", societeId, "ventes")),
        getDocs(collection(db, "societe", societeId, "achats")),
        getDocs(collection(db, "societe", societeId, "stock")),
        getDocs(collection(db, "societe", societeId, "stock_entries")), // 🆕 Multi-lots
        getDocs(collection(db, "societe", societeId, "paiements")),
        getDocs(collection(db, "societe", societeId, "retours")) // 🆕 Retours
      ]);

      // Convertir les snapshots en arrays
      const ventesArr = [];
      const achatsArr = [];
      const stockArr = [];
      const stockEntriesArr = [];
      const paiementsArr = [];
      const retoursArr = [];

      ventesSnap.forEach((doc) => ventesArr.push({ id: doc.id, ...doc.data() }));
      achatsSnap.forEach((doc) => achatsArr.push({ id: doc.id, ...doc.data() }));
      stockSnap.forEach((doc) => stockArr.push({ id: doc.id, ...doc.data() }));
      stockEntriesSnap.forEach((doc) => stockEntriesArr.push({ id: doc.id, ...doc.data() }));
      paiementsSnap.forEach((doc) => paiementsArr.push({ id: doc.id, ...doc.data() }));
      retoursSnap.forEach((doc) => retoursArr.push({ id: doc.id, ...doc.data() }));

      console.log(`📊 Données chargées: ${ventesArr.length} ventes, ${achatsArr.length} achats, ${stockArr.length} stock, ${stockEntriesArr.length} entrées multi-lots, ${paiementsArr.length} paiements, ${retoursArr.length} retours`);

      // 🆕 Statistiques multi-lots complètes
      const totalProduitsTraditionnels = stockArr.length;
      const lotsActifsList = stockEntriesArr.filter(entry => (entry.quantite || 0) > 0);
      const totalLotsActifs = lotsActifsList.length;
      const totalProduits = totalProduitsTraditionnels + totalLotsActifs;
      const fournisseurs = new Set(stockEntriesArr.map(e => e.fournisseur).filter(Boolean));
      
      setProduitsStock(totalProduits);
      setLotsActifs(totalLotsActifs);
      setFournisseursActifs(fournisseurs.size);

      // Filtrer par période
      const filteredVentes = filterByPeriodeOuDates(ventesArr, periode, dateMin, dateMax);
      const filteredAchats = filterByPeriodeOuDates(achatsArr, periode, dateMin, dateMax);
      const filteredPaiements = filterByPeriodeOuDates(paiementsArr, periode, dateMin, dateMax);

      // Calculer les totaux avec gestion d'erreur
      const calculateVentesTotal = () => {
        try {
          return filteredVentes.reduce((total, vente) => {
            const articles = Array.isArray(vente.articles) ? vente.articles : [];
            const totalArticles = articles.reduce((sum, a) => {
              const prixUnitaire = Number(a.prixUnitaire) || 0;
              const quantite = Number(a.quantite) || 0;
              const remise = Number(a.remise) || 0;
              return sum + (prixUnitaire * quantite - remise);
            }, 0);
            const remiseGlobale = Number(vente.remiseGlobale) || 0;
            return total + Math.max(0, totalArticles - remiseGlobale);
          }, 0);
        } catch (error) {
          console.error("Erreur calcul ventes:", error);
          return 0;
        }
      };

      const calculateAchatsTotal = () => {
        try {
          return filteredAchats.reduce((total, achat) => {
            const articles = Array.isArray(achat.articles) ? achat.articles : [];
            const totalArticles = articles.reduce((sum, a) => {
              const prixUnitaire = Number(a.prixUnitaire) || Number(a.prixAchat) || 0;
              const quantite = Number(a.quantite) || 0;
              const remise = Number(a.remise) || 0;
              return sum + (prixUnitaire * quantite - remise);
            }, 0);
            const remiseGlobale = Number(achat.remiseGlobale) || 0;
            return total + Math.max(0, totalArticles - remiseGlobale);
          }, 0);
        } catch (error) {
          console.error("Erreur calcul achats:", error);
          return 0;
        }
      };

      const calculatePaiementsTotal = () => {
        try {
          return filteredPaiements.reduce((total, paiement) => {
            const montant = Number(paiement.montant) || 0;
            return total + montant;
          }, 0);
        } catch (error) {
          console.error("Erreur calcul paiements:", error);
          return 0;
        }
      };

      setTotalVentes(calculateVentesTotal());
      setTotalAchats(calculateAchatsTotal());
      setTotalPaiements(calculatePaiementsTotal());

      // 🆕 CALCULER LE SOLDE DE CAISSE DE LA JOURNÉE (VENTES EN ESPÈCES)
      const calculateSoldeCaisse = () => {
        try {
          const today = new Date();
          const todayStr = today.toDateString();

          const ventesAujourdhui = ventesArr.filter(vente => {
            if (!vente.date && !vente.timestamp) return false;
            
            try {
              const venteDate = vente.date?.toDate ? vente.date.toDate() : 
                              vente.timestamp?.toDate ? vente.timestamp.toDate() :
                              new Date(vente.date || vente.timestamp);
              
              return venteDate.toDateString() === todayStr;
            } catch (dateError) {
              console.warn("Erreur de date pour vente:", vente.id, dateError);
              return false;
            }
          });

          console.log(`💵 Ventes d'aujourd'hui: ${ventesAujourdhui.length}`);

          const soldeCaisseJour = ventesAujourdhui.reduce((total, vente) => {
            try {
              const modePaiement = (vente.modePaiement || '').toLowerCase();
              const isEspeces = modePaiement === 'especes' || 
                              modePaiement === 'espèces' || 
                              modePaiement === 'cash' ||
                              modePaiement === '' || 
                              !vente.modePaiement;

              if (isEspeces) {
                const articles = Array.isArray(vente.articles) ? vente.articles : [];
                const totalArticles = articles.reduce((sum, a) => {
                  const prixUnitaire = Number(a.prixUnitaire) || 0;
                  const quantite = Number(a.quantite) || 0;
                  const remise = Number(a.remise) || 0;
                  return sum + (prixUnitaire * quantite - remise);
                }, 0);
                const remiseGlobale = Number(vente.remiseGlobale) || 0;
                const totalVente = Math.max(0, totalArticles - remiseGlobale);
                return total + totalVente;
              }
              return total;
            } catch (venteError) {
              console.warn("Erreur calcul vente caisse:", vente.id, venteError);
              return total;
            }
          }, 0);

          console.log(`💰 Solde caisse calculé: ${soldeCaisseJour.toFixed(2)} DH`);
          return soldeCaisseJour;
        } catch (error) {
          console.error("Erreur calcul solde caisse:", error);
          return 0;
        }
      };

      setSoldeCaisse(calculateSoldeCaisse());

      // Calculer documents impayés
      let impayes = 0;
      try {
        [...ventesArr, ...achatsArr].forEach(doc => {
          if (doc.statutPaiement && (doc.statutPaiement === 'impayé' || doc.statutPaiement === 'partiel')) {
            impayes++;
          }
        });
      } catch (error) {
        console.error("Erreur calcul documents impayés:", error);
      }
      setDocumentsImpayes(impayes);

      // 🆕 Générer les alertes multi-lots complètes
      const generateAlertes = () => {
        const alertList = [];
        const today = new Date();
        
        try {
          // 🆕 Alertes stock traditionnel
          stockArr.forEach((item) => {
            try {
              const quantite = Number(item.quantite) || 0;
              const seuil = Number(item.seuil) || 5;
              const nom = item.nom || "Produit sans nom";

              if (quantite <= seuil && quantite > 0) {
                alertList.push({ 
                  type: "Stock bas (Traditionnel)", 
                  message: `${nom} (Qté: ${quantite})`,
                  severity: "warning",
                  icon: "📦",
                  category: "stock"
                });
              }
              
              if (item.datePeremption) {
                try {
                  const expDate = new Date(item.datePeremption);
                  if (!isNaN(expDate.getTime())) {
                    const diffDays = Math.ceil((expDate - today) / (1000 * 3600 * 24));
                    
                    if (diffDays <= 0) {
                      alertList.push({ 
                        type: "Produit périmé", 
                        message: `${nom} est périmé !`,
                        severity: "critical",
                        icon: "🚫",
                        category: "expiration"
                      });
                    } else if (diffDays <= 30) {
                      alertList.push({ 
                        type: "Péremption proche", 
                        message: `${nom} (${diffDays} j)`,
                        severity: "danger",
                        icon: "⚠️",
                        category: "expiration"
                      });
                    }
                  }
                } catch (dateError) {
                  console.warn("Erreur date péremption stock:", item.id, dateError);
                }
              }
            } catch (itemError) {
              console.warn("Erreur traitement item stock:", item.id, itemError);
            }
          });

          // 🆕 Alertes stock multi-lots (spécifiques aux lots)
          stockEntriesArr.forEach((entry) => {
            try {
              const quantite = Number(entry.quantite) || 0;
              const nom = entry.nom || "Produit sans nom";
              const numeroLot = entry.numeroLot || 'N/A';
              const fournisseur = entry.fournisseur || 'N/A';

              if (quantite <= 5 && quantite > 0) {
                alertList.push({ 
                  type: "Stock bas (Lot)", 
                  message: `${nom} - Lot ${numeroLot} de ${fournisseur} (Qté: ${quantite})`,
                  severity: "warning",
                  icon: "📦🏷️",
                  category: "stock-multilots"
                });
              }
              
              if (entry.datePeremption) {
                try {
                  const expDate = new Date(entry.datePeremption);
                  if (!isNaN(expDate.getTime())) {
                    const diffDays = Math.ceil((expDate - today) / (1000 * 3600 * 24));
                    
                    if (diffDays <= 0) {
                      alertList.push({ 
                        type: "Lot périmé", 
                        message: `${nom} - Lot ${numeroLot} de ${fournisseur} est périmé !`,
                        severity: "critical",
                        icon: "🚫🏷️",
                        category: "expiration-multilots"
                      });
                    } else if (diffDays <= 30) {
                      alertList.push({ 
                        type: "Lot bientôt périmé", 
                        message: `${nom} - Lot ${numeroLot} de ${fournisseur} (${diffDays} j)`,
                        severity: "danger",
                        icon: "⚠️🏷️",
                        category: "expiration-multilots"
                      });
                    }
                  }
                } catch (dateError) {
                  console.warn("Erreur date péremption entrée:", entry.id, dateError);
                }
              }
            } catch (entryError) {
              console.warn("Erreur traitement entrée:", entry.id, entryError);
            }
          });

          // 🆕 Alertes retours récents (dernières 24h)
          const recent24h = new Date(Date.now() - 24*60*60*1000);
          const retoursRecents = retoursArr.filter(r => {
            try {
              const retourDate = r.date?.seconds ? new Date(r.date.seconds * 1000) : null;
              return retourDate && retourDate >= recent24h;
            } catch {
              return false;
            }
          });

          if (retoursRecents.length > 0) {
            const totalQuantiteRetours = retoursRecents.reduce((sum, r) => sum + (Number(r.quantite) || 0), 0);
            alertList.push({
              type: "Retours récents",
              message: `${retoursRecents.length} retours (${totalQuantiteRetours} unités) dans les 24h`,
              severity: "info",
              icon: "↩️",
              category: "retours"
            });
          }

        } catch (alertError) {
          console.error("Erreur génération alertes:", alertError);
        }
        
        return alertList;
      };
      
      setAlertes(generateAlertes());
      console.log("✅ Données multi-lots chargées avec succès !");
      showNotification("Données multi-lots actualisées avec succès !", "success");
    } catch (error) {
      console.error("Erreur lors du chargement des données:", error);
      showNotification("Erreur lors du chargement des données", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrer par période - OPTIMISÉ
  const filterByPeriodeOuDates = (data, period, min, max) => {
    const now = new Date();
    return data.filter((item) => {
      try {
        if (!item.date && !item.timestamp) return false;
        
        const d = item.date?.toDate ? item.date.toDate() : 
                  item.timestamp?.toDate ? item.timestamp.toDate() :
                  new Date(item.date || item.timestamp);

        if (isNaN(d.getTime())) return false;

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
      } catch (error) {
        console.warn("Erreur filtrage date:", item.id, error);
        return false;
      }
    });
  };

  // Effect principal pour charger les données
  useEffect(() => {
    if (societeId && !loading) {
      fetchData();
      fetchActivities();
    }
  }, [societeId, loading, periode, dateMin, dateMax]);

  // 🆕 FONCTION AMÉLIORÉE : Styles et labels pour les activités multi-lots
  const getActivityStyle = (type, action) => {
    const baseStyles = {
      vente: { icon: '💰', color: '#667eea', label: 'Vente' },
      achat: { icon: '🛒', color: '#48bb78', label: 'Achat' },
      paiement: { icon: '💳', color: '#4299e1', label: 'Paiement' },
      stock: { icon: '📦', color: '#ed8936', label: 'Stock' },
      retour: { icon: '↩️', color: '#ab47bc', label: 'Retour' },
      facture: { icon: '📄', color: '#5c6bc0', label: 'Facture' },
      devis: { icon: '📋', color: '#42a5f5', label: 'Devis' }
    };
    
    const style = baseStyles[type] || { icon: '📌', color: '#667eea', label: 'Activité' };
    
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
        case 'annulation_retour':
          style.label = `Annulation de retour`;
          style.icon = '🔄 ' + style.icon;
          break;
        default:
          break;
      }
    }
    
    return style;
  };

  // 🆕 Filtrer les activités avec support multi-lots
  const filteredActivities = activities.filter(activity => {
    if (activityFilter === "all") return true;
    
    if (activityFilter === "stock") {
      return ['stock', 'retour'].includes(activity.type);
    }
    
    if (activityFilter === "multilots") {
      return activity.details?.numeroLot || activity.details?.fournisseur;
    }
    
    return activity.type === activityFilter;
  }).slice(0, 20);

  // 📱 STYLES CSS RESPONSIFS
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
    statsGrid: {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(auto-fit, minmax(250px, 1fr))",
      gap: isMobile ? "15px" : "25px",
      marginBottom: isMobile ? "20px" : "30px"
    },
    statCard: {
      background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)",
      borderRadius: isMobile ? "15px" : "25px",
      padding: isMobile ? "20px 15px" : "30px 25px",
      textAlign: "center",
      border: "3px solid #e2e8f0",
      boxShadow: "0 15px 40px rgba(0,0,0,0.08)",
      transition: "all 0.3s ease",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden"
    },
    statIcon: {
      fontSize: isMobile ? "2.5em" : "3em",
      marginBottom: "15px"
    },
    statValue: {
      fontSize: isMobile ? "1.8em" : "2.3em",
      fontWeight: 800,
      color: "#2d3748",
      marginBottom: "8px"
    },
    statLabel: {
      fontSize: isMobile ? "0.9em" : "1em",
      fontWeight: 600,
      color: "#4a5568",
      textTransform: "uppercase",
      letterSpacing: "1px"
    },
    button: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      border: "none",
      borderRadius: isMobile ? "10px" : "15px",
      padding: isMobile ? "12px 20px" : "15px 30px",
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
      padding: isMobile ? "10px 8px" : "18px 15px",
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
    filtersCard: {
      background: "linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)",
      borderRadius: isMobile ? "15px" : "20px",
      padding: isMobile ? "20px 15px" : "25px",
      marginBottom: isMobile ? "20px" : "30px",
      border: "2px solid #cbd5e0"
    },
    inputGroup: {
      marginBottom: isMobile ? "15px" : "20px"
    },
    label: {
      display: "block",
      marginBottom: "8px",
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
    alertCard: {
      background: "linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%)",
      borderRadius: isMobile ? "15px" : "20px",
      padding: isMobile ? "20px 15px" : "25px",
      marginBottom: isMobile ? "20px" : "30px",
      border: "2px solid #fc8181"
    },
    activitiesCard: {
      background: "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)",
      borderRadius: isMobile ? "15px" : "20px",
      padding: isMobile ? "20px 15px" : "25px",
      marginBottom: isMobile ? "20px" : "30px",
      border: "2px solid #81e6d9"
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
    }
  });

  // Gestion des états de chargement et d'erreur
  if (loading) {
    return (
      <div style={{ 
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', Arial, sans-serif"
      }}>
        <div style={{
          background: "white",
          borderRadius: "25px",
          padding: "40px",
          textAlign: "center",
          boxShadow: "0 30px 60px rgba(0,0,0,0.15)"
        }}>
          <div style={{ 
            fontSize: "2em",
            marginBottom: "20px"
          }}>🔄</div>
          <div style={{ 
            color: "#667eea",
            fontSize: "1.3em",
            fontWeight: 600
          }}>Chargement du tableau de bord multi-lots...</div>
        </div>
      </div>
    );
  }

  if (!user || !societeId) {
    return (
      <div style={{ 
        background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', Arial, sans-serif"
      }}>
        <div style={{
          background: "white",
          borderRadius: "25px",
          padding: "40px",
          textAlign: "center",
          boxShadow: "0 30px 60px rgba(0,0,0,0.15)"
        }}>
          <div style={{ 
            fontSize: "2em",
            marginBottom: "20px"
          }}>❌</div>
          <div style={{ 
            color: "#e53e3e",
            fontSize: "1.3em",
            fontWeight: 600
          }}>Non connecté ou société non configurée.</div>
        </div>
      </div>
    );
  }

  const styles = getResponsiveStyles();

  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        {/* Loading Overlay */}
        {isLoading && (
          <div style={styles.loadingOverlay}>
            🔄 Actualisation des données multi-lots en cours...
          </div>
        )}

        {/* En-tête moderne */}
        <div style={styles.header}>
          <h1 style={styles.title}>📊 Tableau de Bord Multi-Lots</h1>
          <p style={styles.subtitle}>
            Interface de gestion avec traçabilité complète - 
            👩‍💼 {role === 'docteur' ? 'Pharmacien' : 'Vendeuse'}
          </p>
        </div>

        <div style={styles.content}>
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

          {/* 🆕 Indicateur Multi-Lots Amélioré */}
          <div style={{
            background: "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)",
            padding: "15px",
            borderRadius: "15px",
            marginBottom: "25px",
            border: "2px solid #81e6d9",
            textAlign: "center"
          }}>
            <p style={{ 
              color: "#2d3748", 
              fontSize: "1em", 
              fontWeight: 700,
              margin: "0 0 5px 0"
            }}>
              🏷️ <strong>Système Multi-Lots Activé</strong> - Traçabilité complète en temps réel
            </p>
            <p style={{ 
              color: "#4a5568", 
              fontSize: "0.9em", 
              margin: 0
            }}>
              📦 {produitsStock} produits • 🏷️ {lotsActifs} lots actifs • 🏭 {fournisseursActifs} fournisseurs • 🚨 {alertes.length} alertes • 📊 {activities.length} activités aujourd'hui • 💵 {soldeCaisse.toFixed(2)} DH en caisse
            </p>
          </div>

          {/* Boutons de contrôle */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "15px",
            marginBottom: "25px",
            flexWrap: "wrap"
          }}>
            <button
              style={{
                ...styles.button,
                background: showFilters 
                  ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                  : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
              onClick={() => setShowFilters(v => !v)}
            >
              {showFilters ? "➖ Masquer" : "🔍 Afficher"} Filtres
            </button>

            <button
              style={{
                ...styles.button,
                ...styles.successButton,
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
              onClick={() => { fetchData(); fetchActivities(); }}
              disabled={isLoading}
            >
              🔄 {isLoading ? "Actualisation..." : "Actualiser Données"}
            </button>
          </div>

          {/* Filtres */}
          {showFilters && (
            <div style={styles.filtersCard}>
              <h3 style={{
                color: "#2d3748",
                fontSize: isMobile ? "1.2em" : "1.4em",
                fontWeight: 800,
                marginBottom: isMobile ? "20px" : "25px",
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: "1px"
              }}>
                🔍 Filtres de Période Multi-Lots
              </h3>

              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
                gap: isMobile ? "15px" : "20px"
              }}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Période</label>
                  <select 
                    value={periode} 
                    onChange={e => setPeriode(e.target.value)}
                    style={styles.input}
                  >
                    <option value="jour">Aujourd'hui</option>
                    <option value="semaine">Cette semaine</option>
                    <option value="mois">Ce mois</option>
                    <option value="annee">Cette année</option>
                  </select>
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Date début</label>
                  <input 
                    type="date" 
                    value={dateMin} 
                    onChange={e => setDateMin(e.target.value)}
                    style={styles.input}
                  />
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Date fin</label>
                  <input 
                    type="date" 
                    value={dateMax} 
                    onChange={e => setDateMax(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              {(dateMin || dateMax) && (
                <div style={{ textAlign: "center", marginTop: "20px" }}>
                  <button 
                    style={{...styles.button, ...styles.warningButton}}
                    onClick={() => { setDateMin(""); setDateMax(""); }}
                  >
                    🔄 Réinitialiser Dates
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 🆕 Cartes statistiques multi-lots étendues */}
          <div style={styles.statsGrid}>
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #667eea"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={styles.statIcon}>💰</div>
              <div style={{...styles.statValue, color: "#667eea"}}>
                {totalVentes.toFixed(2)} DH
              </div>
              <div style={styles.statLabel}>Total Ventes Multi-Lots</div>
            </div>
            
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #48bb78"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={styles.statIcon}>🛒</div>
              <div style={{...styles.statValue, color: "#48bb78"}}>
                {totalAchats.toFixed(2)} DH
              </div>
              <div style={styles.statLabel}>Total Achats Multi-Lots</div>
            </div>
            
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #4299e1"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={styles.statIcon}>💳</div>
              <div style={{...styles.statValue, color: "#4299e1"}}>
                {totalPaiements.toFixed(2)} DH
              </div>
              <div style={styles.statLabel}>Total Paiements</div>
            </div>
            
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #ed8936"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={styles.statIcon}>📦</div>
              <div style={{...styles.statValue, color: "#ed8936"}}>
                {produitsStock}
              </div>
              <div style={styles.statLabel}>Produits & Lots</div>
            </div>

            {/* 🆕 Carte spécifique aux lots actifs */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #805ad5",
                background: "linear-gradient(135deg, #f7fafc 0%, #e9d8fd 100%)"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{...styles.statIcon, color: "#805ad5"}}>🏷️</div>
              <div style={{...styles.statValue, color: "#805ad5"}}>
                {lotsActifs}
              </div>
              <div style={styles.statLabel}>Lots Actifs</div>
            </div>

            {/* 🆕 Carte fournisseurs actifs */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #38a169",
                background: "linear-gradient(135deg, #f7fafc 0%, #c6f6d5 100%)"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{...styles.statIcon, color: "#38a169"}}>🏭</div>
              <div style={{...styles.statValue, color: "#38a169"}}>
                {fournisseursActifs}
              </div>
              <div style={styles.statLabel}>Fournisseurs Actifs</div>
            </div>
            
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #f56565"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={styles.statIcon}>⚠️</div>
              <div style={{...styles.statValue, color: "#f56565"}}>
                {documentsImpayes}
              </div>
              <div style={styles.statLabel}>Documents Impayés</div>
            </div>
            
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #ab47bc"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={styles.statIcon}>🚨</div>
              <div style={{...styles.statValue, color: "#ab47bc"}}>
                {alertes.length}
              </div>
              <div style={styles.statLabel}>Alertes Multi-Lots</div>
            </div>

            {/* 🆕 SOLDE CAISSE JOURNÉE - DESIGN PREMIUM */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #f6ad55",
                background: "linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%)",
                border: "3px solid #f6ad55",
                boxShadow: "0 20px 50px rgba(246, 173, 85, 0.3)"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-8px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{...styles.statIcon, color: "#f6ad55", fontSize: isMobile ? "3em" : "3.5em"}}>💵</div>
              <div style={{...styles.statValue, color: "#d69e2e", fontSize: isMobile ? "1.6em" : "2.1em"}}>
                {soldeCaisse.toFixed(2)} DH
              </div>
              <div style={{...styles.statLabel, color: "#744210", fontWeight: 800}}>
                💰 Solde Caisse Aujourd'hui
              </div>
              <div style={{
                fontSize: "0.75em", 
                color: "#744210", 
                marginTop: "8px",
                fontStyle: "italic",
                opacity: 0.8
              }}>
                🕐 Ventes espèces du jour
              </div>
            </div>
          </div>

          {/* 🆕 Section Alertes Multi-Lots Améliorée */}
          {alertes.length > 0 && (
            <div style={styles.alertCard}>
              <h3 style={{
                color: "#e53e3e",
                fontSize: isMobile ? "1.2em" : "1.4em",
                fontWeight: 800,
                marginBottom: isMobile ? "20px" : "25px",
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: "1px"
              }}>
                🚨 Alertes Multi-Lots ({alertes.length})
              </h3>
              
              <div style={{
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
                borderRadius: "10px"
              }}>
                <table style={styles.table}>
                  <thead style={styles.tableHeader}>
                    <tr>
                      <th style={styles.tableCell}>Type d'alerte</th>
                      <th style={styles.tableCell}>Détail du problème</th>
                      <th style={styles.tableCell}>Catégorie</th>
                      <th style={styles.tableCell}>Gravité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertes.map((alerte, i) => (
                      <tr key={i} style={{ 
                        background: i % 2 === 0 ? "#f8fafc" : "white"
                      }}>
                        <td style={{...styles.tableCell, textAlign: "left", fontWeight: 700}}>
                          <span style={{ marginRight: "8px" }}>{alerte.icon}</span>
                          {alerte.type}
                        </td>
                        <td style={{...styles.tableCell, textAlign: "left", color: "#4a5568"}}>
                          {alerte.message}
                        </td>
                        <td style={{...styles.tableCell, textAlign: "center"}}>
                          <span style={{
                            padding: "4px 8px",
                            borderRadius: "12px",
                            fontSize: "0.7em",
                            fontWeight: 600,
                            background: alerte.category?.includes("multilots") ? "#667eea20" : 
                                       alerte.category === "stock" ? "#ed893620" :
                                       alerte.category === "expiration" ? "#f5656520" : "#4299e120",
                            color: alerte.category?.includes("multilots") ? "#667eea" : 
                                   alerte.category === "stock" ? "#ed8936" :
                                   alerte.category === "expiration" ? "#f56565" : "#4299e1",
                            border: `1px solid ${alerte.category?.includes("multilots") ? "#667eea" : 
                                   alerte.category === "stock" ? "#ed8936" :
                                   alerte.category === "expiration" ? "#f56565" : "#4299e1"}`
                          }}>
                            {alerte.category?.includes("multilots") ? "MULTI-LOTS" :
                             alerte.category === "stock" ? "STOCK" :
                             alerte.category === "expiration" ? "EXPIRATION" :
                             alerte.category === "retours" ? "RETOURS" : "GÉNÉRAL"}
                          </span>
                        </td>
                        <td style={styles.tableCell}>
                          <span style={{
                            padding: "4px 12px",
                            borderRadius: "20px",
                            fontWeight: 600,
                            fontSize: "0.8em",
                            background: alerte.severity === "critical" ? "#f56565" :
                                       alerte.severity === "danger" ? "#ed8936" : 
                                       alerte.severity === "warning" ? "#ffa726" : "#4299e1",
                            color: "white"
                          }}>
                            {alerte.severity === "critical" ? "CRITIQUE" :
                             alerte.severity === "danger" ? "DANGER" : 
                             alerte.severity === "warning" ? "ATTENTION" : "INFO"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 🆕 Section Activités Multi-Lots Récentes */}
          <div style={styles.activitiesCard}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              flexWrap: "wrap",
              gap: "10px"
            }}>
              <h3 style={{
                color: "#2d3748",
                fontSize: isMobile ? "1.2em" : "1.4em",
                fontWeight: 800,
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "1px"
              }}>
                📊 Activités Multi-Lots d'Aujourd'hui
              </h3>
              <button
                style={{
                  ...styles.button,
                  background: showActivities 
                    ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                    : "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                  padding: isMobile ? "8px 15px" : "10px 20px",
                  fontSize: "0.9em"
                }}
                onClick={() => setShowActivities(!showActivities)}
              >
                {showActivities ? "➖ Masquer" : "➕ Afficher"}
              </button>
            </div>

            {showActivities && (
              <>
                {/* 🆕 Filtres d'activités multi-lots */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  marginBottom: "20px",
                  justifyContent: "center"
                }}>
                  <button
                    onClick={() => setActivityFilter("all")}
                    style={{
                      ...styles.button,
                      background: activityFilter === "all" ? 
                        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" :
                        "linear-gradient(135deg, #a0aec0 0%, #718096 100%)",
                      padding: "8px 16px",
                      fontSize: "0.8em"
                    }}
                  >
                    📋 Tout
                  </button>
                  {['vente', 'achat', 'paiement', 'stock', 'retour'].map(type => {
                    const style = getActivityStyle(type);
                    return (
                      <button
                        key={type}
                        onClick={() => setActivityFilter(type)}
                        style={{
                          ...styles.button,
                          background: activityFilter === type ? 
                            `linear-gradient(135deg, ${style.color} 0%, ${style.color}dd 100%)` :
                            "linear-gradient(135deg, #a0aec0 0%, #718096 100%)",
                          padding: "8px 16px",
                          fontSize: "0.8em"
                        }}
                      >
                        {style.icon} {style.label}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setActivityFilter("multilots")}
                    style={{
                      ...styles.button,
                      background: activityFilter === "multilots" ? 
                        "linear-gradient(135deg, #805ad5 0%, #6b46c1 100%)" :
                        "linear-gradient(135deg, #a0aec0 0%, #718096 100%)",
                      padding: "8px 16px",
                      fontSize: "0.8em"
                    }}
                  >
                    🏷️ Multi-Lots
                  </button>
                </div>

                {/* 🆕 Liste des activités multi-lots */}
                <div style={{
                  maxHeight: "400px",
                  overflowY: "auto",
                  backgroundColor: "rgba(255,255,255,0.5)",
                  borderRadius: "15px",
                  padding: "15px"
                }}>
                  {filteredActivities.length === 0 ? (
                    <div style={{
                      padding: "40px",
                      textAlign: "center",
                      color: "#4a5568",
                      fontSize: isMobile ? "1em" : "1.2em"
                    }}>
                      📅 Aucune activité aujourd'hui
                      <div style={{
                        fontSize: "0.9em",
                        marginTop: "10px",
                        color: "#6b7280"
                      }}>
                        Les nouvelles activités multi-lots apparaîtront ici
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
                            padding: "15px",
                            marginBottom: "10px",
                            borderRadius: "12px",
                            background: "white",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            transition: "all 0.3s ease",
                            cursor: "pointer",
                            border: `2px solid ${style.color}20`
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
                          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                            {/* Icône */}
                            <div style={{
                              width: 45,
                              height: 45,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: `linear-gradient(135deg, ${style.color}20 0%, ${style.color}40 100%)`,
                              border: `2px solid ${style.color}`,
                              fontSize: "1.2rem"
                            }}>
                              {style.icon}
                            </div>
                            
                            {/* Détails */}
                            <div>
                              <div style={{ fontWeight: 700, color: "#2d3748", fontSize: isMobile ? "0.9em" : "1em" }}>
                                {style.label}
                                <span style={{ fontSize: "0.8em", color: style.color, marginLeft: 8 }}>
                                  par {activity.userEmail?.split('@')[0] || 'utilisateur'}
                                </span>
                                {/* 🆕 Badge pour l'action */}
                                {details.action && (
                                  <span style={{
                                    marginLeft: 10,
                                    padding: "2px 8px",
                                    borderRadius: 12,
                                    fontSize: "0.7em",
                                    background: details.action === 'suppression' ? "#f56565" :
                                                details.action === 'modification' ? "#ed8936" :
                                                details.action === 'création' || details.action === 'annulation_retour' ? "#48bb78" : "#4299e1",
                                    color: "#fff",
                                    fontWeight: 600
                                  }}>
                                    {details.action.toUpperCase()}
                                  </span>
                                )}
                                {/* 🆕 Badge multi-lots */}
                                {(details.numeroLot || details.fournisseur) && (
                                  <span style={{
                                    marginLeft: 8,
                                    padding: "2px 6px",
                                    borderRadius: 8,
                                    fontSize: "0.6em",
                                    background: "#805ad5",
                                    color: "#fff",
                                    fontWeight: 600
                                  }}>
                                    🏷️ MULTI-LOTS
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.85em", color: "#6b7280", marginTop: 2 }}>
                                {activity.type === 'vente' && `Client: ${details.client || 'N/A'}`}
                                {activity.type === 'achat' && `Fournisseur: ${details.fournisseur || 'N/A'}`}
                                {activity.type === 'paiement' && `${details.mode || 'Espèces'} - ${details.type || ''}`}
                                {activity.type === 'stock' && `Produit: ${details.produit || 'N/A'} (Qté: ${details.quantite || 'N/A'})`}
                                {activity.type === 'retour' && `${details.produit || 'N/A'} - ${details.motif || ''}`}
                                {details.articles && ` (${details.articles} articles)`}
                                {/* 🆕 Informations lot spécifiques */}
                                {details.numeroLot && (
                                  <span style={{ marginLeft: 10, color: "#805ad5", fontWeight: 600 }}>
                                    Lot: {details.numeroLot}
                                  </span>
                                )}
                                {details.fournisseur && activity.type !== 'achat' && (
                                  <span style={{ marginLeft: 10, color: "#38a169", fontWeight: 600 }}>
                                    {details.fournisseur}
                                  </span>
                                )}
                                {details.statutPaiement && (
                                  <span style={{
                                    marginLeft: 10,
                                    padding: "2px 6px",
                                    borderRadius: 6,
                                    fontSize: "0.75em",
                                    background: details.statutPaiement === 'payé' ? "#48bb7820" :
                                                details.statutPaiement === 'impayé' ? "#f5656520" : "#ed893620",
                                    color: details.statutPaiement === 'payé' ? "#48bb78" :
                                           details.statutPaiement === 'impayé' ? "#f56565" : "#ed8936",
                                    border: `1px solid ${details.statutPaiement === 'payé' ? "#48bb78" :
                                                        details.statutPaiement === 'impayé' ? "#f56565" : "#ed8936"}`
                                  }}>
                                    {details.statutPaiement}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.75em", color: style.color, marginTop: 4, fontWeight: 600 }}>
                                {formatActivityDate(activity.timestamp)}
                              </div>
                            </div>
                          </div>
                          
                          {/* Montant */}
                          {details.montant && (
                            <div style={{
                              fontWeight: 800,
                              fontSize: isMobile ? "1em" : "1.2em",
                              color: style.color,
                              background: `${style.color}15`,
                              padding: "8px 15px",
                              borderRadius: "20px",
                              border: `2px solid ${style.color}30`
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
      </div>
    </div>
  );
}
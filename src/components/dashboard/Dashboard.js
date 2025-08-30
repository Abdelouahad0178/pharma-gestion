import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { 
  collection, 
  getDocs, 
  doc,
  getDoc,
  Timestamp 
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import { useNavigate } from "react-router-dom";

// ========== FONCTIONS UTILITAIRES POUR DATES ==========
// Fonction robuste pour convertir différents formats de date
function parseDate(dateInput) {
  if (!dateInput) return null;
  
  try {
    // Timestamp Firestore
    if (dateInput?.toDate && typeof dateInput.toDate === 'function') {
      return dateInput.toDate();
    }
    // Objet avec propriété seconds (Timestamp sérialisé)
    if (dateInput?.seconds) {
      return new Date(dateInput.seconds * 1000);
    }
    // Objet Date JavaScript
    if (dateInput instanceof Date) {
      return dateInput;
    }
    // String ISO ou timestamp
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

// Fonction de formatage des dates avec gestion robuste
function formatActivityDate(dateInput) {
  const date = parseDate(dateInput);
  if (!date) return "Date non spécifiée";

  try {
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
    console.error("Erreur formatage date:", error);
    return "Date invalide";
  }
}

// Fonction pour vérifier si une date correspond à une période
function isDateInPeriod(dateInput, period, minDate = null, maxDate = null) {
  const date = parseDate(dateInput);
  if (!date) return false;

  try {
    // Vérification des limites personnalisées
    if (minDate && date < new Date(minDate)) return false;
    if (maxDate && date > new Date(maxDate + "T23:59:59")) return false;

    // Si pas de dates personnalisées, utiliser la période
    if (!minDate && !maxDate) {
      const now = new Date();
      switch (period) {
        case "jour": 
          return date.toDateString() === now.toDateString();
        case "semaine": 
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 7);
          return date >= weekAgo;
        case "mois": 
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case "annee": 
          return date.getFullYear() === now.getFullYear();
        default: 
          return true;
      }
    }
    return true;
  } catch (error) {
    console.warn("Erreur vérification période:", dateInput, error);
    return false;
  }
}

export default function Dashboard() {
  const { 
    user, 
    societeId,
    role, 
    loading
  } = useUserRole();
  
  const navigate = useNavigate();
  
  // États statistiques
  const [totalVentes, setTotalVentes] = useState(0);
  const [totalAchats, setTotalAchats] = useState(0);
  const [totalPaiements, setTotalPaiements] = useState(0);
  const [produitsStock, setProduitsStock] = useState(0);
  const [documentsImpayes, setDocumentsImpayes] = useState(0);
  const [soldeCaisse, setSoldeCaisse] = useState(0);
  const [alertes, setAlertes] = useState([]);

  // États filtres
  const [periode, setPeriode] = useState("mois");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // États UI
  const [notification, setNotification] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // États données
  const [societeInfo, setSocieteInfo] = useState(null);
  const [societeLoading, setSocieteLoading] = useState(false);
  const [ventes, setVentes] = useState([]);
  const [achats, setAchats] = useState([]);
  const [stock, setStock] = useState([]);
  const [stockEntries, setStockEntries] = useState([]); // Stock multi-lots
  const [paiements, setPaiements] = useState([]);
  const [retours, setRetours] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  // Détection responsive
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

  // Notifications
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Déconnexion
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
      showNotification("Déconnexion réussie !", "success");
    } catch (error) {
      console.error("Erreur déconnexion:", error);
      showNotification("Erreur lors de la déconnexion", "error");
    }
  };

  // Chargement des informations société
  const fetchSocieteInfo = async () => {
    if (!societeId) {
      setSocieteInfo(null);
      return;
    }

    try {
      setSocieteLoading(true);
      console.log("Chargement société:", societeId);

      const societeDocRef = doc(db, "societe", societeId);
      const societeDocSnap = await getDoc(societeDocRef);

      if (societeDocSnap.exists()) {
        const societeData = societeDocSnap.data();
        setSocieteInfo(societeData);
        console.log("Société chargée:", societeData);
      } else {
        console.warn("Société introuvable:", societeId);
        setSocieteInfo({ nom: "Société inconnue" });
      }
    } catch (error) {
      console.error("Erreur chargement société:", error);
      setSocieteInfo({ nom: "Erreur de chargement" });
    } finally {
      setSocieteLoading(false);
    }
  };

  // Chargement des données avec gestion des imports JSON
  const fetchAllData = async () => {
    if (!societeId) {
      setVentes([]);
      setAchats([]);
      setStock([]);
      setStockEntries([]);
      setPaiements([]);
      setRetours([]);
      setDataLoading(false);
      return;
    }

    try {
      setDataLoading(true);
      setDataError(null);

      console.log("Chargement données société:", societeId);

      // Charger toutes les collections avec gestion d'erreur individuelle
      const [
        ventesSnap, 
        achatsSnap, 
        stockSnap, 
        stockEntriesSnap,
        paiementsSnap, 
        retoursSnap
      ] = await Promise.all([
        getDocs(collection(db, "societe", societeId, "ventes")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "achats")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "stock")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "stock_entries")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "paiements")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "societe", societeId, "retours")).catch(() => ({ docs: [] }))
      ]);

      // Conversion avec nettoyage des données importées
      const ventesArr = [];
      const achatsArr = [];
      const stockArr = [];
      const stockEntriesArr = [];
      const paiementsArr = [];
      const retoursArr = [];

      // Fonction pour nettoyer les données importées
      const cleanImportedData = (data) => {
        const cleaned = { ...data };
        // Supprimer les métadonnées d'export si présentes
        delete cleaned._exportedAt;
        delete cleaned._collection;
        return cleaned;
      };

      ventesSnap.docs.forEach((doc) => {
        ventesArr.push({ id: doc.id, ...cleanImportedData(doc.data()) });
      });
      
      achatsSnap.docs.forEach((doc) => {
        achatsArr.push({ id: doc.id, ...cleanImportedData(doc.data()) });
      });
      
      stockSnap.docs.forEach((doc) => {
        stockArr.push({ id: doc.id, ...cleanImportedData(doc.data()) });
      });

      stockEntriesSnap.docs.forEach((doc) => {
        stockEntriesArr.push({ id: doc.id, ...cleanImportedData(doc.data()) });
      });
      
      paiementsSnap.docs.forEach((doc) => {
        paiementsArr.push({ id: doc.id, ...cleanImportedData(doc.data()) });
      });
      
      retoursSnap.docs.forEach((doc) => {
        retoursArr.push({ id: doc.id, ...cleanImportedData(doc.data()) });
      });

      console.log(`Données chargées: ${ventesArr.length} ventes, ${achatsArr.length} achats, ${stockArr.length} stock, ${stockEntriesArr.length} lots, ${paiementsArr.length} paiements, ${retoursArr.length} retours`);

      // Mise à jour des états
      setVentes(ventesArr);
      setAchats(achatsArr);
      setStock(stockArr);
      setStockEntries(stockEntriesArr);
      setPaiements(paiementsArr);
      setRetours(retoursArr);

      showNotification("Données chargées avec succès !", "success");

    } catch (error) {
      console.error("Erreur chargement données:", error);
      setDataError(error);
      showNotification("Erreur lors du chargement des données", "error");
    } finally {
      setDataLoading(false);
    }
  };

  // Chargement initial
  useEffect(() => {
    if (!loading && user && societeId) {
      fetchSocieteInfo();
      fetchAllData();
    }
  }, [loading, user, societeId]);

  // Calcul des statistiques avec gestion robuste des dates
  useEffect(() => {
    if (dataLoading) return;

    try {
      console.log("Calcul statistiques...");

      // Filtrage des données par période avec gestion robuste
      const filteredVentes = ventes.filter(v => 
        isDateInPeriod(v.date || v.timestamp, periode, dateMin, dateMax)
      );
      
      const filteredAchats = achats.filter(a => 
        isDateInPeriod(a.date || a.timestamp, periode, dateMin, dateMax)
      );
      
      const filteredPaiements = paiements.filter(p => 
        isDateInPeriod(p.date || p.timestamp, periode, dateMin, dateMax)
      );

      // Calculer total stock (traditionnel + lots)
      const stockTraditional = stock.length;
      const stockLots = stockEntries.filter(e => e.quantite > 0).length;
      setProduitsStock(stockTraditional + stockLots);

      // Calculer les totaux avec gestion d'erreurs
      const calculateVentesTotal = () => {
        try {
          return filteredVentes.reduce((total, vente) => {
            if (vente.montantTotal && !isNaN(vente.montantTotal)) {
              return total + Number(vente.montantTotal);
            }
            
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
            if (achat.montantTotal && !isNaN(achat.montantTotal)) {
              return total + Number(achat.montantTotal);
            }
            
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

      // Calcul du solde de caisse avec gestion robuste des dates
      const calculateSoldeCaisse = () => {
        try {
          const today = new Date();
          const todayStr = today.toDateString();

          const ventesAujourdhui = ventes.filter(vente => {
            const venteDate = parseDate(vente.date || vente.timestamp);
            return venteDate && venteDate.toDateString() === todayStr;
          });

          return ventesAujourdhui.reduce((total, vente) => {
            try {
              const modePaiement = (vente.modePaiement || '').toLowerCase();
              const isEspeces = ['especes', 'espèces', 'cash', ''].includes(modePaiement) || !vente.modePaiement;

              if (isEspeces) {
                if (vente.montantTotal && !isNaN(vente.montantTotal)) {
                  return total + Number(vente.montantTotal);
                }
                
                const articles = Array.isArray(vente.articles) ? vente.articles : [];
                const totalArticles = articles.reduce((sum, a) => {
                  const prixUnitaire = Number(a.prixUnitaire) || 0;
                  const quantite = Number(a.quantite) || 0;
                  const remise = Number(a.remise) || 0;
                  return sum + (prixUnitaire * quantite - remise);
                }, 0);
                const remiseGlobale = Number(vente.remiseGlobale) || 0;
                return total + Math.max(0, totalArticles - remiseGlobale);
              }
              return total;
            } catch (venteError) {
              return total;
            }
          }, 0);
        } catch (error) {
          console.error("Erreur calcul solde caisse:", error);
          return 0;
        }
      };

      setSoldeCaisse(calculateSoldeCaisse());

      // Calculer documents impayés
      let impayes = 0;
      try {
        [...ventes, ...achats].forEach(doc => {
          if (doc.statutPaiement && (doc.statutPaiement === 'impayé' || doc.statutPaiement === 'partiel')) {
            impayes++;
          }
        });
      } catch (error) {
        console.error("Erreur calcul impayés:", error);
      }
      setDocumentsImpayes(impayes);

      // Générer alertes avec stock multi-lots
      const generateAlertes = () => {
        const alertList = [];
        const today = new Date();
        
        try {
          // Alertes stock traditionnel
          stock.forEach((item) => {
            try {
              const quantite = Number(item.quantite) || 0;
              const seuil = Number(item.seuil) || 5;
              const nom = item.nom || "Produit sans nom";

              if (quantite <= seuil && quantite > 0) {
                alertList.push({ 
                  type: "Stock bas", 
                  message: `${nom} (Qté: ${quantite})`,
                  severity: "warning",
                  icon: "📦"
                });
              }
              
              if (item.datePeremption) {
                const expDate = parseDate(item.datePeremption);
                if (expDate) {
                  const diffDays = Math.ceil((expDate - today) / (1000 * 3600 * 24));
                  
                  if (diffDays <= 0) {
                    alertList.push({ 
                      type: "Produit périmé", 
                      message: `${nom} est périmé !`,
                      severity: "critical",
                      icon: "🚫"
                    });
                  } else if (diffDays <= 180) {
                    alertList.push({ 
                      type: "Péremption proche", 
                      message: `${nom} (${diffDays} j)`,
                      severity: "danger",
                      icon: "⚠️"
                    });
                  }
                }
              }
            } catch (itemError) {
              console.warn("Erreur item stock:", item.id, itemError);
            }
          });

          // Alertes stock multi-lots
          stockEntries.forEach((entry) => {
            try {
              const quantite = Number(entry.quantite) || 0;
              const seuil = Number(entry.seuil) || 5;
              const nom = entry.nom || "Produit sans nom";

              if (quantite <= seuil && quantite > 0) {
                alertList.push({ 
                  type: "Stock bas (Lot)", 
                  message: `${nom} - Lot ${entry.numeroLot || 'N/A'} (Qté: ${quantite})`,
                  severity: "warning",
                  icon: "🏷️"
                });
              }
              
              if (entry.datePeremption) {
                const expDate = parseDate(entry.datePeremption);
                if (expDate) {
                  const diffDays = Math.ceil((expDate - today) / (1000 * 3600 * 24));
                  
                  if (diffDays <= 0) {
                    alertList.push({ 
                      type: "Lot périmé", 
                      message: `${nom} - Lot ${entry.numeroLot || 'N/A'} périmé !`,
                      severity: "critical",
                      icon: "🚫"
                    });
                  } else if (diffDays <= 180) {
                    alertList.push({ 
                      type: "Lot péremption proche", 
                      message: `${nom} - Lot ${entry.numeroLot || 'N/A'} (${diffDays} j)`,
                      severity: "danger",
                      icon: "⚠️"
                    });
                  }
                }
              }
            } catch (entryError) {
              console.warn("Erreur entry stock:", entry.id, entryError);
            }
          });

          // Alertes retours récents
          const recent24h = new Date(Date.now() - 24*60*60*1000);
          const retoursRecents = retours.filter(r => {
            const retourDate = parseDate(r.date || r.timestamp);
            return retourDate && retourDate >= recent24h;
          });

          if (retoursRecents.length > 0) {
            const totalQuantiteRetours = retoursRecents.reduce((sum, r) => sum + (Number(r.quantite) || 0), 0);
            alertList.push({
              type: "Retours récents",
              message: `${retoursRecents.length} retours (${totalQuantiteRetours} unités) dans les 24h`,
              severity: "info",
              icon: "↩️"
            });
          }

        } catch (alertError) {
          console.error("Erreur génération alertes:", alertError);
        }
        
        return alertList;
      };
      
      setAlertes(generateAlertes());
      console.log("Statistiques calculées avec succès !");
      
    } catch (error) {
      console.error("Erreur calcul statistiques:", error);
    }
  }, [ventes, achats, stock, stockEntries, paiements, retours, periode, dateMin, dateMax, dataLoading]);

  // Fonction refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchSocieteInfo(),
        fetchAllData()
      ]);
      showNotification("Données actualisées avec succès !", "success");
    } catch (error) {
      console.error("Erreur actualisation:", error);
      showNotification("Erreur lors de l'actualisation", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Nom d'affichage société
  const getSocieteDisplayName = () => {
    if (societeLoading) return "Chargement...";
    if (!societeInfo) return "Société inconnue";
    
    return societeInfo.nom || 
           societeInfo.nomSociete || 
           societeInfo.name || 
           societeInfo.raison_sociale ||
           societeInfo.denomination ||
           "Société sans nom";
  };

  // Styles responsifs
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

  // États de chargement et erreurs
  if (loading) {
    return (
      <div style={{ 
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div style={{
          background: "white",
          borderRadius: "25px",
          padding: "40px",
          textAlign: "center",
          boxShadow: "0 30px 60px rgba(0,0,0,0.15)"
        }}>
          <div style={{ fontSize: "2em", marginBottom: "20px" }}>🔄</div>
          <div style={{ color: "#667eea", fontSize: "1.3em", fontWeight: 600 }}>
            Chargement du tableau de bord...
          </div>
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
        justifyContent: "center"
      }}>
        <div style={{
          background: "white",
          borderRadius: "25px",
          padding: "40px",
          textAlign: "center",
          boxShadow: "0 30px 60px rgba(0,0,0,0.15)"
        }}>
          <div style={{ fontSize: "2em", marginBottom: "20px" }}>❌</div>
          <div style={{ color: "#e53e3e", fontSize: "1.3em", fontWeight: 600 }}>
            {!user ? "Utilisateur non connecté" : "Aucune société assignée"}
          </div>
          <button
            onClick={handleLogout}
            style={{
              marginTop: "20px",
              background: "#e53e3e",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "12px 24px",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            {!user ? "Se connecter" : "Contacter l'administrateur"}
          </button>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div style={{ 
        background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div style={{
          background: "white",
          borderRadius: "25px",
          padding: "40px",
          textAlign: "center",
          boxShadow: "0 30px 60px rgba(0,0,0,0.15)"
        }}>
          <div style={{ fontSize: "2em", marginBottom: "20px" }}>⚠️</div>
          <div style={{ color: "#e53e3e", fontSize: "1.3em", fontWeight: 600 }}>
            Erreur de chargement des données
          </div>
          <div style={{ color: "#6b7280", fontSize: "0.9em", marginTop: "10px" }}>
            {dataError.message}
          </div>
          <button
            onClick={handleRefresh}
            style={{
              marginTop: "20px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "12px 24px",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const styles = getResponsiveStyles();

  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        {/* Overlay de chargement */}
        {(isRefreshing || dataLoading) && (
          <div style={{
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
            backdropFilter: "blur(5px)"
          }}>
            🔄 {dataLoading ? "Chargement des données..." : "Actualisation en cours..."}
          </div>
        )}

        {/* En-tête */}
        <div style={styles.header}>
          <h1 style={styles.title}>📊 Tableau de Bord</h1>
          <p style={styles.subtitle}>
            Interface de gestion multi-société - 
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
                         notification.type === 'warning' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' :
                         'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)'
            }}>
              {notification.message}
            </div>
          )}

          {/* Indicateur société multi-lots */}
          <div style={{
            background: "linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)",
            padding: "15px",
            borderRadius: "15px",
            marginBottom: "25px",
            border: "2px solid #48bb78",
            textAlign: "center"
          }}>
            <p style={{ 
              color: "#2d3748", 
              fontSize: "1em", 
              fontWeight: 700,
              margin: "0 0 5px 0"
            }}>
              🏢 Structure Multi-Société & Multi-Lots Active
            </p>
            <p style={{ 
              color: "#4a5568", 
              fontSize: "0.9em", 
              margin: 0
            }}>
              🏢 Société: <strong>{getSocieteDisplayName()}</strong> • 
              👤 {user?.email} • 
              📦 {produitsStock} produits • 
              🚨 {alertes.length} alertes • 
              💵 {soldeCaisse.toFixed(2)} DH en caisse
            </p>
            {societeLoading && (
              <p style={{ 
                color: "#6b7280", 
                fontSize: "0.8em", 
                margin: "5px 0 0 0",
                fontStyle: "italic"
              }}>
                Chargement des informations société...
              </p>
            )}
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
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? "➖ Masquer" : "🔍 Afficher"} Filtres
            </button>

            <button
              style={{
                ...styles.button,
                background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
              onClick={handleRefresh}
              disabled={isRefreshing || dataLoading}
            >
              🔄 {isRefreshing ? "Actualisation..." : "Actualiser"}
            </button>
          </div>

          {/* Filtres */}
          {showFilters && (
            <div style={{
              background: "linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%)",
              borderRadius: isMobile ? "15px" : "20px",
              padding: isMobile ? "20px 15px" : "25px",
              marginBottom: isMobile ? "20px" : "30px",
              border: "2px solid #cbd5e0"
            }}>
              <h3 style={{
                color: "#2d3748",
                fontSize: isMobile ? "1.2em" : "1.4em",
                fontWeight: 800,
                marginBottom: isMobile ? "20px" : "25px",
                textAlign: "center"
              }}>
                🔍 Filtres de Période
              </h3>

              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
                gap: isMobile ? "15px" : "20px"
              }}>
                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: 700,
                    color: "#4a5568"
                  }}>Période</label>
                  <select 
                    value={periode} 
                    onChange={e => setPeriode(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 15px",
                      border: "2px solid #e2e8f0",
                      borderRadius: "12px",
                      fontSize: "1em",
                      fontWeight: 600,
                      background: "white"
                    }}
                  >
                    <option value="jour">Aujourd'hui</option>
                    <option value="semaine">Cette semaine</option>
                    <option value="mois">Ce mois</option>
                    <option value="annee">Cette année</option>
                  </select>
                </div>
                
                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: 700,
                    color: "#4a5568"
                  }}>Date début</label>
                  <input 
                    type="date" 
                    value={dateMin} 
                    onChange={e => setDateMin(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 15px",
                      border: "2px solid #e2e8f0",
                      borderRadius: "12px",
                      fontSize: "1em",
                      fontWeight: 600,
                      background: "white"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: 700,
                    color: "#4a5568"
                  }}>Date fin</label>
                  <input 
                    type="date" 
                    value={dateMax} 
                    onChange={e => setDateMax(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 15px",
                      border: "2px solid #e2e8f0",
                      borderRadius: "12px",
                      fontSize: "1em",
                      fontWeight: 600,
                      background: "white"
                    }}
                  />
                </div>
              </div>

              {(dateMin || dateMax) && (
                <div style={{ textAlign: "center", marginTop: "20px" }}>
                  <button 
                    style={{
                      ...styles.button,
                      background: "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)"
                    }}
                    onClick={() => { setDateMin(""); setDateMax(""); }}
                  >
                    🔄 Réinitialiser Dates
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Raccourcis rapides */}
          <div style={{
            background: "linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)",
            borderRadius: isMobile ? "15px" : "25px",
            padding: isMobile ? "25px 20px" : "35px 30px",
            marginBottom: isMobile ? "25px" : "35px",
            border: "3px solid #42a5f5"
          }}>
            <h3 style={{
              color: "#1565c0",
              fontSize: isMobile ? "1.4em" : "1.8em",
              fontWeight: 800,
              marginBottom: isMobile ? "25px" : "30px",
              textAlign: "center"
            }}>
              🚀 Raccourcis Rapides
            </h3>
            
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(auto-fit, minmax(280px, 1fr))",
              gap: isMobile ? "15px" : "20px"
            }}>
              {/* VENTE */}
              <button
                onClick={() => navigate('/ventes')}
                style={{
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  border: "none",
                  borderRadius: isMobile ? "15px" : "20px",
                  padding: isMobile ? "20px 15px" : "25px 20px",
                  color: "white",
                  fontWeight: 800,
                  fontSize: isMobile ? "1.1em" : "1.2em",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px"
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-8px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                <div style={{ fontSize: isMobile ? "2.5em" : "3em" }}>💰</div>
                <div>Nouvelle Vente Multi-Lots</div>
              </button>

              {/* STOCK */}
              <button
                onClick={() => navigate('/stock')}
                style={{
                  background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                  border: "none",
                  borderRadius: isMobile ? "15px" : "20px",
                  padding: isMobile ? "20px 15px" : "25px 20px",
                  color: "white",
                  fontWeight: 800,
                  fontSize: isMobile ? "1.1em" : "1.2em",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px"
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-8px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                <div style={{ fontSize: isMobile ? "2.5em" : "3em" }}>📦</div>
                <div>Gérer Stock & Lots</div>
              </button>

              {/* ACHATS */}
              {role === 'docteur' && (
                <button
                  onClick={() => navigate('/achats')}
                  style={{
                    background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                    border: "none",
                    borderRadius: isMobile ? "15px" : "20px",
                    padding: isMobile ? "20px 15px" : "25px 20px",
                    color: "white",
                    fontWeight: 800,
                    fontSize: isMobile ? "1.1em" : "1.2em",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px"
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = "translateY(-8px)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                >
                  <div style={{ fontSize: isMobile ? "2.5em" : "3em" }}>🛒</div>
                  <div>Nouvel Achat</div>
                </button>
              )}

              {/* PARAMÈTRES */}
              {role === 'docteur' && (
                <button
                  onClick={() => navigate('/parametres')}
                  style={{
                    background: "linear-gradient(135deg, #718096 0%, #4a5568 100%)",
                    border: "none",
                    borderRadius: isMobile ? "15px" : "20px",
                    padding: isMobile ? "20px 15px" : "25px 20px",
                    color: "white",
                    fontWeight: 800,
                    fontSize: isMobile ? "1.1em" : "1.2em",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px"
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = "translateY(-8px)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                >
                  <div style={{ fontSize: isMobile ? "2.5em" : "3em" }}>⚙️</div>
                  <div>Paramètres & Sauvegarde</div>
                </button>
              )}
            </div>
          </div>

          {/* Cartes statistiques */}
          <div style={styles.statsGrid}>
            {/* Total Ventes */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #667eea"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{ fontSize: isMobile ? "2.5em" : "3em", marginBottom: "15px" }}>💰</div>
              <div style={{
                fontSize: isMobile ? "1.8em" : "2.3em",
                fontWeight: 800,
                color: "#667eea",
                marginBottom: "8px"
              }}>
                {totalVentes.toFixed(2)} DH
              </div>
              <div style={{
                fontSize: isMobile ? "0.9em" : "1em",
                fontWeight: 600,
                color: "#4a5568"
              }}>Total Ventes</div>
            </div>
            
            {/* Total Achats */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #48bb78"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{ fontSize: isMobile ? "2.5em" : "3em", marginBottom: "15px" }}>🛒</div>
              <div style={{
                fontSize: isMobile ? "1.8em" : "2.3em",
                fontWeight: 800,
                color: "#48bb78",
                marginBottom: "8px"
              }}>
                {totalAchats.toFixed(2)} DH
              </div>
              <div style={{
                fontSize: isMobile ? "0.9em" : "1em",
                fontWeight: 600,
                color: "#4a5568"
              }}>Total Achats</div>
            </div>
            
            {/* Total Paiements */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #4299e1"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{ fontSize: isMobile ? "2.5em" : "3em", marginBottom: "15px" }}>💳</div>
              <div style={{
                fontSize: isMobile ? "1.8em" : "2.3em",
                fontWeight: 800,
                color: "#4299e1",
                marginBottom: "8px"
              }}>
                {totalPaiements.toFixed(2)} DH
              </div>
              <div style={{
                fontSize: isMobile ? "0.9em" : "1em",
                fontWeight: 600,
                color: "#4a5568"
              }}>Total Paiements</div>
            </div>
            
            {/* Stock */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #ed8936"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{ fontSize: isMobile ? "2.5em" : "3em", marginBottom: "15px" }}>📦</div>
              <div style={{
                fontSize: isMobile ? "1.8em" : "2.3em",
                fontWeight: 800,
                color: "#ed8936",
                marginBottom: "8px"
              }}>
                {produitsStock}
              </div>
              <div style={{
                fontSize: isMobile ? "0.9em" : "1em",
                fontWeight: 600,
                color: "#4a5568"
              }}>Produits + Lots</div>
            </div>
            
            {/* Documents impayés */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #f56565"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{ fontSize: isMobile ? "2.5em" : "3em", marginBottom: "15px" }}>⚠️</div>
              <div style={{
                fontSize: isMobile ? "1.8em" : "2.3em",
                fontWeight: 800,
                color: "#f56565",
                marginBottom: "8px"
              }}>
                {documentsImpayes}
              </div>
              <div style={{
                fontSize: isMobile ? "0.9em" : "1em",
                fontWeight: 600,
                color: "#4a5568"
              }}>Documents Impayés</div>
            </div>
            
            {/* Alertes */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #ab47bc"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-5px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{ fontSize: isMobile ? "2.5em" : "3em", marginBottom: "15px" }}>🚨</div>
              <div style={{
                fontSize: isMobile ? "1.8em" : "2.3em",
                fontWeight: 800,
                color: "#ab47bc",
                marginBottom: "8px"
              }}>
                {alertes.length}
              </div>
              <div style={{
                fontSize: isMobile ? "0.9em" : "1em",
                fontWeight: 600,
                color: "#4a5568"
              }}>Alertes Stock</div>
            </div>

            {/* Solde caisse */}
            <div 
              style={{
                ...styles.statCard,
                borderLeft: "5px solid #f6ad55",
                background: "linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%)",
                border: "3px solid #f6ad55"
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-8px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div style={{
                fontSize: isMobile ? "3em" : "3.5em",
                color: "#f6ad55",
                marginBottom: "15px"
              }}>💵</div>
              <div style={{
                fontSize: isMobile ? "1.6em" : "2.1em",
                fontWeight: 800,
                color: "#d69e2e",
                marginBottom: "8px"
              }}>
                {soldeCaisse.toFixed(2)} DH
              </div>
              <div style={{
                fontSize: isMobile ? "0.9em" : "1em",
                fontWeight: 800,
                color: "#744210"
              }}>
                💰 Solde Caisse Aujourd'hui
              </div>
            </div>
          </div>

          {/* Section Alertes */}
          {alertes.length > 0 && (
            <div style={{
              background: "linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%)",
              borderRadius: isMobile ? "15px" : "20px",
              padding: isMobile ? "20px 15px" : "25px",
              marginBottom: isMobile ? "20px" : "30px",
              border: "2px solid #fc8181"
            }}>
              <h3 style={{
                color: "#e53e3e",
                fontSize: isMobile ? "1.2em" : "1.4em",
                fontWeight: 800,
                marginBottom: isMobile ? "20px" : "25px",
                textAlign: "center"
              }}>
                🚨 Alertes Stock & Lots ({alertes.length})
              </h3>
              
              <div style={{ overflow: "auto" }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  borderRadius: "20px",
                  overflow: "hidden",
                  boxShadow: "0 15px 40px rgba(0,0,0,0.1)"
                }}>
                  <thead style={{
                    background: "linear-gradient(135deg, #2d3748 0%, #1a202c 100%)",
                    color: "white"
                  }}>
                    <tr>
                      <th style={{
                        padding: "18px 15px",
                        textAlign: "center",
                        fontWeight: 600
                      }}>Type d'alerte</th>
                      <th style={{
                        padding: "18px 15px",
                        textAlign: "center",
                        fontWeight: 600
                      }}>Détail du problème</th>
                      <th style={{
                        padding: "18px 15px",
                        textAlign: "center",
                        fontWeight: 600
                      }}>Gravité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertes.map((alerte, i) => (
                      <tr key={i} style={{ 
                        background: i % 2 === 0 ? "#f8fafc" : "white"
                      }}>
                        <td style={{
                          padding: "18px 15px",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "#2d3748"
                        }}>
                          <span style={{ marginRight: "8px" }}>{alerte.icon}</span>
                          {alerte.type}
                        </td>
                        <td style={{
                          padding: "18px 15px",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "#4a5568"
                        }}>
                          {alerte.message}
                        </td>
                        <td style={{
                          padding: "18px 15px",
                          textAlign: "center",
                          fontWeight: 600
                        }}>
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

          {/* Message si aucune donnée */}
          {ventes.length === 0 && achats.length === 0 && stock.length === 0 && stockEntries.length === 0 && (
            <div style={{
              background: "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)",
              borderRadius: isMobile ? "15px" : "20px",
              padding: isMobile ? "30px 20px" : "40px",
              marginBottom: isMobile ? "20px" : "30px",
              border: "2px solid #81e6d9",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "3em", marginBottom: "20px" }}>📝</div>
              <h3 style={{
                color: "#2d3748",
                fontSize: isMobile ? "1.3em" : "1.6em",
                fontWeight: 800,
                marginBottom: "15px"
              }}>
                Aucune donnée trouvée
              </h3>
              <p style={{
                color: "#4a5568",
                fontSize: isMobile ? "1em" : "1.1em",
                marginBottom: "25px"
              }}>
                Commencez par ajouter des ventes, achats ou du stock pour voir vos statistiques.
                Données compatibles avec sauvegarde/import JSON.
              </p>
              <div style={{
                display: "flex",
                gap: "15px",
                justifyContent: "center",
                flexWrap: "wrap"
              }}>
                <button
                  onClick={() => navigate('/ventes')}
                  style={{
                    ...styles.button,
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  }}
                >
                  💰 Ajouter une Vente
                </button>
                <button
                  onClick={() => navigate('/stock')}
                  style={{
                    ...styles.button,
                    background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)"
                  }}
                >
                  📦 Gérer le Stock
                </button>
                {role === 'docteur' && (
                  <>
                    <button
                      onClick={() => navigate('/achats')}
                      style={{
                        ...styles.button,
                        background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)"
                      }}
                    >
                      🛒 Ajouter un Achat
                    </button>
                    <button
                      onClick={() => navigate('/parametres')}
                      style={{
                        ...styles.button,
                        background: "linear-gradient(135deg, #718096 0%, #4a5568 100%)"
                      }}
                    >
                      ⚙️ Import/Export Données
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
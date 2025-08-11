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
  getDoc,
  Timestamp,
} from "firebase/firestore";

// Génération automatique du numéro
function generateNumero(docs, type) {
  const prefix = type === "FACT" ? "FACT" : "DEV";
  const nums = docs
    .filter((d) => d.type === type)
    .map((d) => parseInt((d.numero || "").replace(prefix, "")))
    .filter((n) => !isNaN(n));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

export default function DevisFactures() {
  const { user, societeId, loading } = useUserRole();

  // États
  const [documents, setDocuments] = useState([]);
  const [type, setType] = useState("FACT");
  const [client, setClient] = useState("");
  const [date, setDate] = useState("");
  const [articles, setArticles] = useState([]);
  const [produit, setProduit] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [prixUnitaire, setPrixUnitaire] = useState(0);
  const [remise, setRemise] = useState(0);
  const [ventes, setVentes] = useState([]);
  const [selectedBons, setSelectedBons] = useState([]);
  
  // ✨ PARAMÈTRES CACHET ÉTENDUS ✨
  const [parametres, setParametres] = useState({ 
    entete: "", 
    pied: "",
    cachetTexte: "Cachet Société",
    cachetImage: null,
    afficherCachet: true,
    typeCachet: "texte",
    tailleCachet: 120
  });

  // CRUD édition
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  // Filtres
  const [filtreType, setFiltreType] = useState("");
  const [filtreClient, setFiltreClient] = useState("");
  const [filtreDateMin, setFiltreDateMin] = useState("");
  const [filtreDateMax, setFiltreDateMax] = useState("");
  const [showFiltres, setShowFiltres] = useState(false);

  // États de chargement et animations
  const [waiting, setWaiting] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // 📱 États pour responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isPrintReady, setIsPrintReady] = useState(false);

  // 📱 Hook pour détecter la taille d'écran
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

  // 🔧 Détection des capacités d'impression
  useEffect(() => {
    const checkPrintCapabilities = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      setIsPrintReady(true);
      
      if (isMobileDevice && !window.open) {
        console.log("📱 Appareil mobile détecté - Mode impression optimisé activé");
      }
    };

    checkPrintCapabilities();
  }, []);

  // Fonction pour afficher les notifications
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Vérification du chargement
  React.useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // ✨ CHARGEMENT PARAMÈTRES CACHET AVANCÉ ✨
  const fetchParametres = async () => {
    if (!societeId) return;
    
    try {
      const docRef = doc(db, "societe", societeId, "parametres", "documents");
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setParametres({
          entete: data.entete || "PHARMACIE - DOCUMENT",
          pied: data.pied || "Merci de votre confiance",
          cachetTexte: data.cachetTexte || "Cachet Société",
          cachetImage: data.cachetImage || data.cachet || null,
          afficherCachet: data.afficherCachet !== false,
          typeCachet: data.typeCachet || (data.cachet ? "image" : "texte"),
          tailleCachet: data.tailleCachet || 120
        });
      } else {
        const snap = await getDocs(collection(db, "societe", societeId, "parametres"));
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setParametres({ 
            entete: data.entete || "PHARMACIE - DOCUMENT", 
            pied: data.pied || "Merci de votre confiance",
            cachetTexte: data.cachetTexte || "Cachet Société",
            cachetImage: data.cachetImage || data.cachet || null,
            afficherCachet: data.afficherCachet !== false,
            typeCachet: data.typeCachet || (data.cachet ? "image" : "texte"),
            tailleCachet: data.tailleCachet || 120
          });
        }
      }
    } catch (err) {
      console.error("Erreur chargement paramètres:", err);
    }
  };

  // Charger Firestore (devis/factures/ventes/paramètres) PAR SOCIÉTÉ
  const fetchAll = async () => {
    if (!societeId) return;
    
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, "societe", societeId, "devisFactures"));
      let arr = [];
      snap.forEach((docu) => arr.push({ id: docu.id, ...docu.data() }));
      setDocuments(arr);

      const ventesSnap = await getDocs(collection(db, "societe", societeId, "ventes"));
      setVentes(ventesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      await fetchParametres();
      showNotification("Données chargées avec succès!", "success");
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      showNotification("Erreur lors du chargement des données", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [societeId]);

  const numeroAuto = generateNumero(documents, type);

  // Identification des bons déjà facturés
  const bonsFactures = documents
    .filter((d) => d.type === "FACT" && d.bonsAssocies && !d.annulee)
    .flatMap((d) => d.bonsAssocies || []);

  // Ajouter article temporaire
  const handleAddArticle = (e) => {
    e.preventDefault();
    if (!produit || !quantite || !prixUnitaire) return;
    setArticles([
      ...articles,
      {
        produit,
        quantite: Number(quantite),
        prixUnitaire: Number(prixUnitaire),
        remise: Number(remise) || 0,
      },
    ]);
    setProduit(""); setQuantite(1); setPrixUnitaire(0); setRemise(0);
    showNotification("Article ajouté avec succès!", "success");
  };

  const handleRemoveArticle = (idx) => {
    setArticles(articles.filter((_, i) => i !== idx));
    showNotification("Article supprimé", "info");
  };

  // Enregistrer/modifier devis/facture ✅ AVEC TRAÇABILITÉ
  const handleSaveDoc = async () => {
    if (!user || !societeId) return;
    if (!client || !date || articles.length === 0) return;
    
    setIsLoading(true);
    
    try {
      if (isEditing && editId) {
        await updateDoc(doc(db, "societe", societeId, "devisFactures", editId), {
          type,
          numero: numeroAuto,
          client,
          date: Timestamp.fromDate(new Date(date)),
          articles,
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now()
        });
        showNotification(`${type === "FACT" ? "Facture" : "Devis"} modifié avec succès!`, "success");
      } else {
        await addDoc(collection(db, "societe", societeId, "devisFactures"), {
          type,
          numero: numeroAuto,
          client,
          date: Timestamp.fromDate(new Date(date)),
          articles,
          annulee: false,
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          societeId: societeId
        });
        showNotification(`${type === "FACT" ? "Facture" : "Devis"} créé avec succès!`, "success");
      }
      resetForm();
      fetchAll();
    } catch (error) {
      console.error("Erreur lors de l'enregistrement:", error);
      showNotification("Erreur lors de l'enregistrement", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditDoc = (docData) => {
    setEditId(docData.id);
    setType(docData.type);
    setClient(docData.client);
    setDate(docData.date?.toDate ? docData.date.toDate().toISOString().split("T")[0] : "");
    setArticles(docData.articles || []);
    setIsEditing(true);
    showNotification("Mode édition activé", "info");
  };

  const handleDeleteDoc = async (id) => {
    if (!user || !societeId) return;
    if (!window.confirm("Supprimer ce document ?")) return;
    
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, "societe", societeId, "devisFactures", id));
      fetchAll();
      resetForm();
      showNotification("Document supprimé avec succès!", "success");
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      showNotification("Erreur lors de la suppression", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditId(null);
    setType("FACT");
    setClient("");
    setDate("");
    setArticles([]);
    setProduit("");
    setQuantite(1);
    setPrixUnitaire(0);
    setRemise(0);
  };

  // ✨ GÉNÉRATION DU CACHET HTML OPTIMISÉ POUR SIGNATURE ✨
  const generateCachetHtml = (isFacture = false) => {
    if (!parametres.afficherCachet) return '';
    
    const taille = parametres.tailleCachet || 120;
    
    if (parametres.typeCachet === "image" && parametres.cachetImage) {
      return `
        <div style="position: relative; text-align: center; flex: 1;">
          <div class="signature-area"></div>
          <div class="signature-label">✍️ Signature ${isFacture ? "Pharmacien" : "Commercial"}</div>
          <img 
            src="${parametres.cachetImage}" 
            alt="Cachet de l'entreprise"
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
          <div class="signature-label">✍️ Signature ${isFacture ? "Pharmacien" : "Commercial"}</div>
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
            ${parametres.cachetTexte || "Cachet Société"}
          </div>
        </div>
      `;
    }
  };

  // ✨ IMPRESSION OPTIMISÉE POUR TOUTES DIMENSIONS ✨
  const handlePrintDoc = (docData) => {
    const articles = Array.isArray(docData.articles) ? docData.articles : [];
    const total = articles.reduce(
      (s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)),
      0
    );
    
    const isFacture = docData.type === "FACT";
    const cachetHtml = generateCachetHtml(isFacture);
    const titleDocument = isFacture ? "Facture" : "Devis";
    
    // 📱 Détection de l'environnement mobile pour optimiser l'impression
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    try {
      const htmlContent = generatePrintHTML(docData, articles, total, cachetHtml, isFacture, titleDocument, isMobileDevice);
      
      if (isMobileDevice) {
        // 📱 Stratégie spéciale pour mobile : utiliser un iframe caché
        handleMobilePrint(htmlContent, titleDocument, docData.numero);
      } else {
        // 💻 Stratégie desktop classique améliorée
        handleDesktopPrint(htmlContent, titleDocument, docData.numero);
      }
      
      showNotification(`${titleDocument} ${isMobileDevice ? 'préparé pour téléchargement/impression' : 'envoyé vers l\'imprimante'} !`, "success");
      
    } catch (error) {
      console.error("Erreur lors de la préparation d'impression:", error);
      showNotification("Erreur lors de la préparation d'impression", "error");
    }
  };

  // 📱 Gestion impression mobile optimisée - VERSION CORRIGÉE ROBUSTE
  const handleMobilePrint = (htmlContent, titleDocument, numero) => {
    try {
      // Créer un iframe caché pour l'impression mobile
      const iframe = document.createElement('iframe');
      iframe.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 794px;
        height: 1123px;
        border: none;
        z-index: -1;
        opacity: 0;
      `;
      
      // Fonction de nettoyage sécurisée
      const cleanupIframe = () => {
        try {
          if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch (error) {
          console.warn("Erreur lors du nettoyage de l'iframe:", error);
        }
      };
      
      document.body.appendChild(iframe);
      
      // Approche robuste pour écrire le contenu
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) {
        try {
          // Méthode 1: Essayer avec document.write() en premier (plus fiable pour iframe)
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();
          
          // Attendre que le contenu soit chargé
          setTimeout(() => {
            try {
              if (iframe.contentWindow) {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
              }
              
              // Nettoyer après impression
              setTimeout(cleanupIframe, 2000);
              
            } catch (printError) {
              console.warn("Impression iframe échouée, fallback vers téléchargement:", printError);
              cleanupIframe();
              downloadPrintFile(htmlContent, titleDocument, numero);
            }
          }, 1000);
          
        } catch (writeError) {
          console.warn("document.write() échoué, essai avec innerHTML:", writeError);
          
          // Méthode 2: Fallback avec innerHTML si document.write() échoue
          try {
            if (iframeDoc.documentElement) {
              iframeDoc.documentElement.innerHTML = htmlContent;
              
              setTimeout(() => {
                try {
                  if (iframe.contentWindow) {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                  }
                  setTimeout(cleanupIframe, 2000);
                } catch (printError) {
                  cleanupIframe();
                  downloadPrintFile(htmlContent, titleDocument, numero);
                }
              }, 1000);
              
            } else {
              // Si documentElement est null, créer le document manuellement
              iframeDoc.open();
              iframeDoc.write('<!DOCTYPE html><html><head></head><body></body></html>');
              iframeDoc.close();
              
              setTimeout(() => {
                if (iframeDoc.documentElement) {
                  iframeDoc.documentElement.innerHTML = htmlContent;
                  
                  setTimeout(() => {
                    try {
                      if (iframe.contentWindow) {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                      }
                      setTimeout(cleanupIframe, 2000);
                    } catch (printError) {
                      cleanupIframe();
                      downloadPrintFile(htmlContent, titleDocument, numero);
                    }
                  }, 500);
                } else {
                  cleanupIframe();
                  downloadPrintFile(htmlContent, titleDocument, numero);
                }
              }, 100);
            }
          } catch (innerError) {
            console.warn("innerHTML également échoué:", innerError);
            cleanupIframe();
            downloadPrintFile(htmlContent, titleDocument, numero);
          }
        }
        
      } else {
        cleanupIframe();
        downloadPrintFile(htmlContent, titleDocument, numero);
      }
      
      // Timeout de sécurité global
      setTimeout(() => {
        cleanupIframe();
      }, 10000);
      
    } catch (error) {
      console.error("Erreur dans handleMobilePrint:", error);
      downloadPrintFile(htmlContent, titleDocument, numero);
    }
  };

  // 💻 Gestion impression desktop améliorée - VERSION CORRIGÉE ROBUSTE
  const handleDesktopPrint = (htmlContent, titleDocument, numero) => {
    try {
      const printWindow = window.open("", "_blank", "width=800,height=600,scrollbars=yes,resizable=yes");
      
      if (printWindow && printWindow.document) {
        try {
          // Méthode 1: Essayer avec document.write() (plus fiable)
          printWindow.document.open();
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          
          // Attendre le chargement complet
          setTimeout(() => {
            try {
              printWindow.focus();
              printWindow.print();
              
              // Fermer après impression
              setTimeout(() => {
                if (printWindow && !printWindow.closed) {
                  printWindow.close();
                }
              }, 1000);
              
            } catch (printError) {
              console.warn("Erreur d'impression:", printError);
              if (printWindow && !printWindow.closed) {
                printWindow.close();
              }
            }
          }, 500);
          
        } catch (writeError) {
          console.warn("document.write() échoué pour popup, essai avec innerHTML:", writeError);
          
          // Méthode 2: Fallback avec innerHTML
          try {
            if (printWindow.document.documentElement) {
              printWindow.document.documentElement.innerHTML = htmlContent;
              
              setTimeout(() => {
                try {
                  printWindow.focus();
                  printWindow.print();
                  setTimeout(() => {
                    if (printWindow && !printWindow.closed) {
                      printWindow.close();
                    }
                  }, 1000);
                } catch (printError) {
                  if (printWindow && !printWindow.closed) {
                    printWindow.close();
                  }
                }
              }, 500);
            } else {
              if (printWindow && !printWindow.closed) {
                printWindow.close();
              }
              downloadPrintFile(htmlContent, titleDocument, numero);
            }
          } catch (innerError) {
            console.warn("innerHTML également échoué pour popup:", innerError);
            if (printWindow && !printWindow.closed) {
              printWindow.close();
            }
            downloadPrintFile(htmlContent, titleDocument, numero);
          }
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
  };

  // 💾 Fonction de téléchargement de secours
  const downloadPrintFile = (htmlContent, titleDocument, numero) => {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = `${titleDocument}_${numero}_${new Date().toISOString().slice(0, 10)}.html`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotification(`${titleDocument} téléchargé ! Ouvrez le fichier pour imprimer.`, "info");
  };

  // Fonction helper pour générer le HTML d'impression optimisé - VERSION CORRIGÉE
  const generatePrintHTML = (docData, articles, total, cachetHtml, isFacture, titleDocument, isMobileDevice = false) => {
    const primaryColor = isFacture ? "#667eea" : "#10b981";
    const secondaryColor = isFacture ? "#764ba2" : "#059669";
    
    // 📱 Adaptations pour les petites dimensions
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
          <title>${titleDocument} N°${docData.numero}</title>
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
              height: 100vh;
              overflow: hidden;
            }
            
            .document-container {
              background: white;
              max-width: 100%;
              margin: 0 auto;
              border-radius: 0;
              overflow: hidden;
              position: relative;
              height: ${isMobileDevice ? 'calc(100vh - 10px)' : 'calc(100vh - 20px)'};
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
              overflow: hidden;
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
              background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);
              color: white;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            .articles-section {
              margin: ${isMobileDevice ? '10px 0' : '15px 0'};
              flex: 1;
              overflow: hidden;
              display: flex;
              flex-direction: column;
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
              flex: 1;
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
            }
            
            .product-name {
              font-weight: 700;
              color: #2d3748;
              text-align: left;
              max-width: ${isMobileDevice ? '120px' : '200px'};
              word-wrap: break-word;
              overflow-wrap: break-word;
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
              margin: ${isMobileDevice ? '25px 0' : '50px 0'};
              padding: ${isMobileDevice ? '20px 15px' : '40px'};
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
              margin: ${isMobileDevice ? '30px 0' : '60px 0'};
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
            
            /* 📱 Optimisations spéciales pour mobile */
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
            
            /* 🖨️ Optimisations d'impression - TOUT SUR UNE PAGE */
            @media print {
              @page {
                margin: 0.3cm;
                size: A4;
              }
              
              body {
                background: white !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                height: 29.7cm !important;
                overflow: hidden !important;
                font-size: 10px !important;
              }
              
              .document-container {
                box-shadow: none !important;
                border-radius: 0 !important;
                max-width: none !important;
                height: 29.7cm !important;
                page-break-inside: avoid !important;
                display: flex !important;
                flex-direction: column !important;
              }
              
              .header-section {
                padding: 12px 10px !important;
                flex-shrink: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              
              .content-wrapper {
                padding: 15px 10px !important;
                flex: 1 !important;
                overflow: hidden !important;
              }
              
              .info-section {
                grid-template-columns: 1fr 1fr 1fr 1fr !important;
                gap: 8px !important;
                margin-bottom: 10px !important;
              }
              
              .info-card {
                padding: 6px !important;
                border-radius: 4px !important;
              }
              
              .articles-table {
                font-size: 9px !important;
                margin: 8px 0 !important;
              }
              
              .articles-table th,
              .articles-table td {
                padding: 3px 2px !important;
                font-size: 8px !important;
              }
              
              .product-name {
                font-size: 8px !important;
                max-width: 60px !important;
              }
              
              .grand-total-section {
                margin: 8px 0 !important;
                padding: 10px !important;
                flex-shrink: 0 !important;
              }
              
              .total-amount {
                font-size: 1.3em !important;
              }
              
              .signature-section {
                margin: 10px 0 5px 0 !important;
                flex-shrink: 0 !important;
              }
              
              .signature-area {
                height: 25px !important;
              }
              
              .footer-section {
                padding: 8px 6px !important;
                flex-shrink: 0 !important;
              }
              
              .footer-message {
                font-size: 0.7em !important;
              }
              
              .print-info {
                font-size: 0.5em !important;
              }
              
              /* Forcer les couleurs pour l'impression */
              .header-section,
              .grand-total-section,
              .footer-section,
              .articles-table thead,
              .status-badge,
              .quantity-cell,
              .total-cell {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              
              /* Empêcher les sauts de page */
              .header-section,
              .info-section,
              .articles-section,
              .grand-total-section,
              .signature-section,
              .footer-section {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              
              .articles-table {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              
              /* Masquer le filigrane en impression pour économiser l'encre */
              .watermark {
                display: none !important;
              }
            }
            
            /* 📱 Styles spéciaux pour très petits écrans */
            @media screen and (max-width: 480px) {
              body {
                font-size: 9px !important;
              }
              
              .company-title {
                font-size: 1.2em !important;
              }
              
              .info-section {
                grid-template-columns: 1fr !important;
                gap: 6px !important;
              }
              
              .articles-table {
                font-size: 0.7em !important;
              }
              
              .product-name {
                max-width: 60px !important;
                font-size: 0.7em !important;
              }
              
              .total-amount {
                font-size: 1.2em !important;
              }
              
              .signature-section {
                flex-direction: column !important;
                gap: 10px !important;
              }
              
              .signature-box {
                max-width: 100% !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="watermark">${titleDocument.toUpperCase()}</div>
          
          <div class="document-container">
            <div class="header-section">
              <div class="document-type-indicator">${titleDocument}</div>
              <div class="header-content">
                <h1 class="company-title">${parametres.entete || "PHARMACIE MODERNE"}</h1>
                <div class="document-badge">${titleDocument}</div>
                <div class="document-number">N° ${docData.numero}</div>
              </div>
            </div>
            
            <div class="content-wrapper">
              <div class="info-section">
                <div class="info-card">
                  <div class="info-label">👤 Client</div>
                  <div class="info-value">${docData.client || ""}</div>
                </div>
                
                <div class="info-card">
                  <div class="info-label">📅 Date d'émission</div>
                  <div class="info-value">${docData.date?.toDate().toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}</div>
                </div>
                
                <div class="info-card">
                  <div class="info-label">📋 Type de document</div>
                  <div class="info-value">
                    <span class="status-badge">${titleDocument}</span>
                  </div>
                </div>
                
                <div class="info-card">
                  <div class="info-label">🛍️ Nombre d'articles</div>
                  <div class="info-value">${articles.length} article${articles.length > 1 ? 's' : ''}</div>
                </div>
              </div>
              
              <div class="articles-section">
                <h2 class="section-title">📦 Détail des Articles</h2>
                
                <table class="articles-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Qté</th>
                      <th>Prix Unit.</th>
                      <th>Remise</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${articles.map((a, index) => `
                      <tr>
                        <td class="product-name">${a.produit || ""}</td>
                        <td><span class="quantity-cell">${a.quantite || 0}</span></td>
                        <td class="price-cell">${(a.prixUnitaire || 0).toFixed(2)} DH</td>
                        <td class="discount-cell">${(a.remise || 0).toFixed(2)} DH</td>
                        <td class="total-cell">
                          ${(a.quantite * a.prixUnitaire - (a.remise || 0)).toFixed(2)} DH
                        </td>
                      </tr>`).join("")}
                  </tbody>
                </table>
              </div>
              
              <div class="grand-total-section">
                <div class="total-content">
                  <div class="total-label">💰 Montant Total ${titleDocument}</div>
                  <div class="total-amount">${total.toFixed(2)} DH</div>
                  <div class="total-note">
                    ${isFacture ? 
                      "📋 Facture à conserver • 💳 Merci de régler dans les délais convenus" : 
                      "📋 Devis valable 30 jours • 💼 N'hésitez pas à nous contacter"}
                  </div>
                </div>
              </div>
              
              <div class="signature-section">
                <div class="signature-box">
                  <div class="signature-area"></div>
                  <div class="signature-label">✍️ Signature Client</div>
                </div>
                
                ${cachetHtml}
              </div>
            </div>
            
            <div class="footer-section">
              <div class="footer-message">
                ${parametres.pied || "Merci de votre confiance ! 🙏"}
              </div>
              <div class="print-info">
                ${titleDocument} généré${isFacture ? "e" : ""} le ${new Date().toLocaleString('fr-FR')} par ${user.email || 'Utilisateur'}
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Sélection de bons pour facturation groupée
  const toggleBonSelection = (bonId) => {
    setSelectedBons((prev) =>
      prev.includes(bonId)
        ? prev.filter((id) => id !== bonId)
        : [...prev, bonId]
    );
  };

  // Générer une facture groupée à partir de bons ✅ AVEC TRAÇABILITÉ
  const handleGenerateFacture = async () => {
    if (!user || !societeId) return;
    if (selectedBons.length === 0) return alert("Sélectionnez des bons !");
    
    setIsLoading(true);
    
    try {
      const bons = ventes.filter((v) => selectedBons.includes(v.id));
      if (!bons.length) return;
      
      const client = bons[0].client;
      const articles = bons.flatMap((b) => b.articles || []);
      const total = articles.reduce(
        (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
        0
      );
      
      const snap = await getDocs(collection(db, "societe", societeId, "devisFactures"));
      let arr = [];
      snap.forEach((docu) => arr.push({ id: docu.id, ...docu.data() }));
      const numero = generateNumero(arr, "FACT");
      
      const newFacture = {
        type: "FACT",
        numero,
        client,
        date: Timestamp.now(),
        bonsAssocies: selectedBons,
        articles,
        total,
        annulee: false,
        creePar: user.uid,
        creeParEmail: user.email,
        creeLe: Timestamp.now(),
        societeId: societeId
      };
      
      await addDoc(collection(db, "societe", societeId, "devisFactures"), newFacture);
      setSelectedBons([]);
      fetchAll();
      handlePrintDoc(newFacture);
      showNotification(`Facture groupée créée avec succès! (${selectedBons.length} bons)`, "success");
    } catch (error) {
      console.error("Erreur lors de la génération de facture:", error);
      showNotification("Erreur lors de la génération de facture", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Filtres historique
  const filteredDocuments = documents.filter((doc) => {
    let pass = true;
    if (filtreType && doc.type !== filtreType) pass = false;
    if (filtreClient && !doc.client?.toLowerCase().includes(filtreClient.toLowerCase())) pass = false;
    if (filtreDateMin) {
      const d = doc.date?.toDate ? doc.date.toDate() : new Date(doc.date);
      if (d < new Date(filtreDateMin)) pass = false;
    }
    if (filtreDateMax) {
      const d = doc.date?.toDate ? doc.date.toDate() : new Date(doc.date);
      if (d > new Date(filtreDateMax)) pass = false;
    }
    return pass;
  });

  // 📱 STYLES CSS RESPONSIFS INTÉGRÉS - Style Multi-Lots
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
    formCard: {
      background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)",
      borderRadius: isMobile ? "15px" : "25px",
      padding: isMobile ? "20px 15px" : isTablet ? "30px 20px" : "40px",
      marginBottom: isMobile ? "20px" : "30px",
      border: "3px solid #e2e8f0",
      boxShadow: "0 15px 40px rgba(0,0,0,0.08)"
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
      color: "black",
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
    // 📱 Styles spéciaux pour mobile
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
    // 📱 Bouton facturation groupée responsive
    groupedInvoiceButton: {
      background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
      border: "none",
      borderRadius: isMobile ? "15px" : "15px",
      padding: isMobile ? "18px 25px" : isTablet ? "18px 32px" : "20px 40px",
      color: "white",
      fontWeight: 700,
      fontSize: isMobile ? "1.1em" : isTablet ? "1.05em" : "1.1em",
      cursor: "pointer",
      boxShadow: "0 10px 30px rgba(72, 187, 120, 0.4)",
      transition: "all 0.3s ease",
      textTransform: "uppercase",
      letterSpacing: "1px",
      width: isMobile ? "100%" : "auto",
      minHeight: isMobile ? "56px" : "auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px"
    },
    // 📱 Section facturation groupée responsive
    groupedInvoiceSection: {
      background: "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)",
      borderRadius: isMobile ? "15px" : "25px",
      padding: isMobile ? "25px 15px" : isTablet ? "35px 25px" : "40px",
      border: "3px solid #81e6d9"
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
  });

  // AFFICHAGE conditionnel
  if (waiting) {
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
          }}>Chargement des devis & factures...</div>
        </div>
      </div>
    );
  }

  if (!user) {
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
          }}>Non connecté.</div>
        </div>
      </div>
    );
  }

  if (!societeId) {
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
          }}>Aucune société sélectionnée.</div>
        </div>
      </div>
    );
  }

  const styles = getResponsiveStyles();

  // RENDU PRINCIPAL
  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        {/* Loading Overlay */}
        {isLoading && (
          <div style={styles.loadingOverlay}>
            🔄 Traitement des documents en cours...
          </div>
        )}

        <div style={styles.header}>
          <h1 style={styles.title}>📋 Devis & Factures Multi-Lots</h1>
          <p style={styles.subtitle}>Gestion professionnelle avec cachet personnalisé et traçabilité</p>
         
        </div>

        <div style={styles.content}>
          {/* Indicateur Multi-Lots */}
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
              📋 <strong>Documents Multi-Lots Professionnels</strong> - Cachet personnalisé inclus
            </p>
            <p style={{ 
              color: "#4a5568", 
              fontSize: "0.9em", 
              margin: 0
            }}>
              📊 {documents.length} documents • Impression optimisée • Signature numérique
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
                📱 <strong>Mode Mobile Optimisé</strong>
              </p>
              <p style={{ 
                color: "#4a5568", 
                fontSize: "0.8em", 
                margin: 0
              }}>
                Sur mobile, l'impression téléchargera le document. Ouvrez-le ensuite pour imprimer.
              </p>
            </div>
          )}

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

          {/* Formulaire principal */}
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
              {isEditing ? "✏️ Modification" : "➕ Création"} de Document Multi-Lots
            </h3>

            {/* Informations générales */}
            <div style={styles.mobileFormGrid}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Type de document</label>
                <select 
                  style={styles.input}
                  value={type} 
                  onChange={e => setType(e.target.value)}
                >
                  <option value="FACT">📄 Facture</option>
                  <option value="DEV">📋 Devis</option>
                </select>
              </div>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>Nom du client</label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="Saisir le nom du client..."
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  required
                />
              </div>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>Date d'émission</label>
                <input
                  style={styles.input}
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
              </div>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>Numéro auto</label>
                <input
                  style={{...styles.input, background: "#f8fafc", color: "#4a5568"}}
                  type="text"
                  value={numeroAuto}
                  disabled
                />
              </div>
            </div>

            {/* Ajout d'articles */}
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
                🛍️ Ajouter des Articles Multi-Lots
              </h4>
              
              <form onSubmit={handleAddArticle}>
                <div style={styles.mobileFormGrid}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Nom du produit</label>
                    <input
                      style={styles.input}
                      type="text"
                      placeholder="Nom du produit..."
                      value={produit}
                      onChange={e => setProduit(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Quantité</label>
                    <input
                      style={styles.input}
                      type="number"
                      placeholder="Qté"
                      value={quantite}
                      onChange={e => setQuantite(e.target.value)}
                      min={1}
                      required
                    />
                  </div>
                  
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Prix Unitaire (DH)</label>
                    <input
                      style={styles.input}
                      type="number"
                      placeholder="Prix..."
                      value={prixUnitaire}
                      onChange={e => setPrixUnitaire(e.target.value)}
                      min={0}
                      step="0.01"
                      required
                    />
                  </div>
                  
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Remise (DH)</label>
                    <input
                      style={styles.input}
                      type="number"
                      placeholder="Remise..."
                      value={remise}
                      onChange={e => setRemise(e.target.value)}
                      min={0}
                      step="0.01"
                    />
                  </div>
                </div>
                
                <div style={{ textAlign: "center" }}>
                  <button 
                    type="submit" 
                    style={{...styles.button, ...styles.successButton, width: isMobile ? "100%" : "auto"}}
                    title="Ajouter cet article"
                  >
                    ➕ Ajouter Article
                  </button>
                </div>
              </form>
            </div>

            {/* Tableau des articles */}
            {articles.length > 0 && (
              <div style={{ marginBottom: isMobile ? "20px" : "30px" }}>
                <h4 style={{
                  color: "#2d3748",
                  fontSize: isMobile ? "1.1em" : "1.3em",
                  fontWeight: 700,
                  marginBottom: isMobile ? "15px" : "20px",
                  textAlign: "center"
                }}>
                  📦 Articles du Document Multi-Lots ({articles.length})
                </h4>
                
                <div style={styles.mobileTableContainer}>
                  <table style={styles.table}>
                    <thead style={styles.tableHeader}>
                      <tr>
                        <th style={{...styles.tableCell, color: 'white'}}>Produit</th>
                        <th style={{...styles.tableCell, color: 'white'}}>Qté</th>
                        {!isMobile && <th style={{...styles.tableCell, color: 'white'}}>Prix Unit.</th>}
                        {!isMobile && <th style={{...styles.tableCell, color: 'white'}}>Remise</th>}
                        <th style={{...styles.tableCell, color: 'white'}}>Total</th>
                        <th style={{...styles.tableCell, color: 'white'}}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articles.map((a, i) => (
                        <tr key={i} style={{ 
                          background: i % 2 === 0 ? "#f8fafc" : "white",
                          transition: "all 0.3s ease"
                        }}>
                          <td style={{...styles.tableCell, fontWeight: 700, color: "#2d3748", textAlign: "left"}}>
                            {a.produit}
                            {isMobile && (
                              <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>
                                {a.prixUnitaire.toFixed(2)} DH × {a.quantite}
                                {a.remise > 0 && ` - ${a.remise.toFixed(2)} DH`}
                              </div>
                            )}
                          </td>
                          <td style={{...styles.tableCell, color: "#667eea", fontWeight: 700}}>{a.quantite}</td>
                          {!isMobile && <td style={{...styles.tableCell, color: "#667eea", fontWeight: 700}}>{a.prixUnitaire.toFixed(2)} DH</td>}
                          {!isMobile && <td style={{...styles.tableCell, color: "#e53e3e", fontWeight: 700}}>{(a.remise || 0).toFixed(2)} DH</td>}
                          <td style={{...styles.tableCell, color: "#48bb78", fontWeight: 800, fontSize: isMobile ? "0.9em" : "1.1em"}}>
                            {(a.quantite * a.prixUnitaire - (a.remise || 0)).toFixed(2)} DH
                          </td>
                          <td style={styles.tableCell}>
                            <button
                              onClick={() => handleRemoveArticle(i)}
                              style={{
                                ...styles.button, 
                                ...styles.dangerButton, 
                                padding: isMobile ? "6px 12px" : "8px 16px", 
                                fontSize: "0.8em",
                                minWidth: isMobile ? "44px" : "auto",
                                minHeight: isMobile ? "44px" : "auto"
                              }}
                              title="Supprimer cet article"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ 
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", 
                        color: "white"
                      }}>
                        <td colSpan={isMobile ? 3 : 4} style={{...styles.tableCell, fontWeight: 800, fontSize: isMobile ? "1em" : "1.2em"}}>
                          💰 TOTAL {type === "FACT" ? "FACTURE" : "DEVIS"}
                        </td>
                        <td colSpan={2} style={{...styles.tableCell, fontWeight: 900, fontSize: isMobile ? "1.1em" : "1.3em"}}>
                          {articles.reduce((sum, a) => sum + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0).toFixed(2)} DH
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Boutons d'action */}
            <div style={styles.mobileActionButtons}>
              <button
                onClick={handleSaveDoc}
                disabled={!client || !date || articles.length === 0 || isLoading}
                style={{
                  ...styles.button,
                  ...(isEditing ? styles.warningButton : styles.successButton),
                  opacity: (articles.length > 0 && !isLoading) ? 1 : 0.5,
                  cursor: (articles.length > 0 && !isLoading) ? "pointer" : "not-allowed",
                  width: isMobile ? "100%" : "auto"
                }}
                title={isEditing ? "Enregistrer les modifications" : `Créer le ${type === "FACT" ? "facture" : "devis"}`}
              >
                {isLoading ? "⏳ Traitement..." : isEditing ? "✏️ Modifier" : "💾 Créer"} {type === "FACT" ? "Facture" : "Devis"}
              </button>
              
              {isEditing && (
                <button
                  onClick={resetForm}
                  style={{...styles.button, ...styles.infoButton, width: isMobile ? "100%" : "auto"}}
                  title="Annuler les modifications"
                >
                  ❌ Annuler
                </button>
              )}
            </div>
          </div>

          {/* Toggle Filtres */}
          <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "25px", flexWrap: "wrap" }}>
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

          {/* Filtres */}
          {showFiltres && (
            <div style={styles.formCard}>
              <h4 style={{
                color: "#2d3748",
                fontSize: isMobile ? "1.1em" : "1.3em",
                fontWeight: 700,
                marginBottom: isMobile ? "20px" : "25px",
                textAlign: "center"
              }}>
                🔍 Filtres de Recherche Multi-Lots
              </h4>
              
              <div style={styles.mobileFormGrid}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Type</label>
                  <select style={styles.input} value={filtreType} onChange={e => setFiltreType(e.target.value)}>
                    <option value="">📋 Tous</option>
                    <option value="FACT">📄 Factures</option>
                    <option value="DEV">📋 Devis</option>
                  </select>
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Client</label>
                  <input
                    style={styles.input}
                    type="text"
                    placeholder="Rechercher un client..."
                    value={filtreClient}
                    onChange={e => setFiltreClient(e.target.value)}
                  />
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Date début</label>
                  <input
                    style={styles.input}
                    type="date"
                    value={filtreDateMin}
                    onChange={e => setFiltreDateMin(e.target.value)}
                  />
                </div>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Date fin</label>
                  <input
                    style={styles.input}
                    type="date"
                    value={filtreDateMax}
                    onChange={e => setFiltreDateMax(e.target.value)}
                  />
                </div>
              </div>
                
              {(filtreType || filtreClient || filtreDateMin || filtreDateMax) && (
                <div style={{ textAlign: "center", marginTop: "20px" }}>
                  <button
                    onClick={() => {
                      setFiltreType("");
                      setFiltreClient("");
                      setFiltreDateMin("");
                      setFiltreDateMax("");
                    }}
                    style={{...styles.button, ...styles.dangerButton, width: isMobile ? "100%" : "auto"}}
                  >
                    🔄 Réinitialiser
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Historique des documents */}
          <div style={{ marginBottom: "40px" }}>
            <h2 style={styles.sectionTitle}>
              📋 Historique Multi-Lots ({filteredDocuments.length})
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
                💰 Total affiché: {filteredDocuments.reduce((sum, doc) => 
                  sum + (doc.articles || []).reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0), 0
                ).toFixed(2)} DH
              </span>
              <span style={{ fontWeight: 600, color: "#6b7280", fontSize: isMobile ? "0.8em" : "1em" }}>
                📊 {filteredDocuments.filter(d => d.type === "FACT").length} factures • {filteredDocuments.filter(d => d.type === "DEV").length} devis
              </span>
            </div>
            
            <div style={styles.mobileTableContainer}>
              <table style={styles.table}>
                <thead style={styles.tableHeader}>
                  <tr>
                    <th style={{...styles.tableCell, color: 'white'}}>Type</th>
                    {!isMobile && <th style={{...styles.tableCell, color: 'white'}}>Numéro</th>}
                    <th style={{...styles.tableCell, color: 'white'}}>Date</th>
                    <th style={{...styles.tableCell, color: 'white'}}>Client</th>
                    <th style={{...styles.tableCell, color: 'white'}}>Total</th>
                    <th style={{...styles.tableCell, color: 'white'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={isMobile ? 5 : 6} style={{ 
                        padding: isMobile ? "30px 15px" : "50px", 
                        textAlign: "center",
                        color: "#6b7280",
                        fontSize: isMobile ? "1em" : "1.2em",
                        fontStyle: "italic"
                      }}>
                        {documents.length === 0 
                          ? "Aucun document créé pour le moment 📝"
                          : "Aucun document ne correspond aux critères 🔍"}
                      </td>
                    </tr>
                  ) : (
                    filteredDocuments.map((docData, index) => (
                      <tr key={docData.id} style={{ 
                        background: index % 2 === 0 ? "#f8fafc" : "white",
                        transition: "all 0.3s ease"
                      }}>
                        <td style={styles.tableCell}>
                          <span style={{
                            padding: isMobile ? "4px 8px" : "8px 16px",
                            borderRadius: isMobile ? "15px" : "20px",
                            fontSize: isMobile ? "0.7em" : "0.85em",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                            background: docData.type === "FACT" 
                              ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
                              : "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                            color: "white"
                          }}>
                            {isMobile ? (docData.type === "FACT" ? "📄" : "📋") : (docData.type === "FACT" ? "📄 Facture" : "📋 Devis")}
                          </span>
                          {isMobile && (
                            <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>
                              N° {docData.numero}
                            </div>
                          )}
                        </td>
                        {!isMobile && <td style={{...styles.tableCell, fontWeight: 800, color: "#2d3748"}}>{docData.numero}</td>}
                        <td style={{...styles.tableCell, color: "#4a5568", fontSize: isMobile ? "0.8em" : "1em"}}>
                          {docData.date?.toDate().toLocaleDateString('fr-FR')}
                        </td>
                        <td style={{...styles.tableCell, fontWeight: 600, color: "#2d3748", textAlign: "left"}}>
                          {isMobile ? docData.client.substring(0, 15) + (docData.client.length > 15 ? "..." : "") : docData.client}
                        </td>
                        <td style={{ 
                          ...styles.tableCell, 
                          fontWeight: 800, 
                          textAlign: "right",
                          color: "#48bb78",
                          fontSize: isMobile ? "0.9em" : "1.1em"
                        }}>
                          {(docData.articles || []).reduce((s, a) => s + (a.quantite * a.prixUnitaire - (a.remise || 0)), 0).toFixed(2)} DH
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
                              title={`Imprimer ${docData.type === "FACT" ? "Facture" : "Devis"} avec cachet ${parametres.typeCachet === "image" ? "image" : "texte"}`}
                              onClick={() => handlePrintDoc(docData)}
                            >
                              🖨️
                            </button>
                            {!docData.annulee && (
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
                                onClick={() => handleEditDoc(docData)}
                              >
                                ✏️
                              </button>
                            )}
                            {!docData.annulee && (
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
                                onClick={() => handleDeleteDoc(docData.id)}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section facturation groupée */}
          <div style={styles.groupedInvoiceSection}>
            <h2 style={styles.sectionTitle}>
              🧾 Facturation Groupée Multi-Lots
            </h2>
            
            <div style={{
              background: "rgba(255,255,255,0.6)",
              padding: isMobile ? "15px" : "20px",
              borderRadius: "15px",
              marginBottom: "20px",
              textAlign: "center"
            }}>
              <p style={{ 
                color: "#2d3748", 
                fontSize: isMobile ? "0.9em" : "1em", 
                fontWeight: 600,
                margin: "0 0 5px 0"
              }}>
                📋 <strong>Génération de factures groupées</strong> à partir des bons de vente existants
              </p>
              <p style={{ 
                color: "#4a5568", 
                fontSize: isMobile ? "0.8em" : "0.9em", 
                margin: 0
              }}>
                Sélectionnez les bons de vente non facturés pour créer une facture groupée
              </p>
            </div>
            
            <div style={styles.mobileTableContainer}>
              <table style={styles.table}>
                <thead style={styles.tableHeader}>
                  <tr>
                    <th style={{...styles.tableCell, width: isMobile ? "40px" : "60px", color: 'white'}}>Sélection</th>
                    <th style={{...styles.tableCell, color: 'white'}}>Client</th>
                    {!isMobile && <th style={{...styles.tableCell, color: 'white'}}>Date</th>}
                    <th style={{...styles.tableCell, color: 'white'}}>Articles</th>
                    <th style={{...styles.tableCell, color: 'white'}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ventes
                    .filter((v) => !bonsFactures.includes(v.id))
                    .length === 0 ? (
                      <tr>
                        <td colSpan={isMobile ? 4 : 5} style={{ 
                          padding: isMobile ? "30px 15px" : "50px", 
                          textAlign: "center",
                          color: "#6b7280",
                          fontSize: isMobile ? "1em" : "1.2em",
                          fontStyle: "italic"
                        }}>
                          Aucun bon de vente disponible pour facturation 📋
                        </td>
                      </tr>
                    ) : (
                      ventes
                        .filter((v) => !bonsFactures.includes(v.id))
                        .map((v, index) => (
                          <tr key={v.id} style={{
                            background: selectedBons.includes(v.id) 
                              ? "linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%)"
                              : index % 2 === 0 ? "#f8fafc" : "white",
                            transition: "all 0.3s ease",
                            transform: selectedBons.includes(v.id) ? "scale(1.02)" : "scale(1)"
                          }}>
                            <td style={{...styles.tableCell, textAlign: "center"}}>
                              <input
                                type="checkbox"
                                checked={selectedBons.includes(v.id)}
                                onChange={() => toggleBonSelection(v.id)}
                                style={{ 
                                  transform: isMobile ? "scale(1.3)" : "scale(1.5)", 
                                  cursor: "pointer",
                                  accentColor: "#667eea"
                                }}
                              />
                            </td>
                            <td style={{...styles.tableCell, fontWeight: 600, color: "black", textAlign: "left"}}>
                              {isMobile ? v.client.substring(0, 12) + (v.client.length > 12 ? "..." : "") : v.client}
                              {isMobile && (
                                <div style={{ fontSize: "0.7em", color: "#6b7280", marginTop: "2px" }}>
                                  {v.date?.toDate().toLocaleDateString('fr-FR')}
                                </div>
                              )}
                            </td>
                            {!isMobile && <td style={styles.tableCell}>{v.date?.toDate().toLocaleDateString('fr-FR')}</td>}
                            <td style={styles.tableCell}>
                              <span style={{
                                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                color: "white",
                                padding: isMobile ? "4px 8px" : "6px 12px",
                                borderRadius: "15px",
                                fontSize: isMobile ? "0.7em" : "0.85em",
                                fontWeight: 600
                              }}>
                                {(v.articles || []).length} art{(v.articles || []).length > 1 ? 's' : ''}
                              </span>
                            </td>
                            <td style={{...styles.tableCell, textAlign: "right", fontWeight: 700, color: "#48bb78", fontSize: isMobile ? "0.9em" : "1.1em"}}>
                              {(v.articles || []).reduce(
                                (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
                                0
                              ).toFixed(2)} DH
                            </td>
                          </tr>
                        ))
                    )}
                </tbody>
              </table>
            </div>
            
            {selectedBons.length > 0 && (
              <div style={{ 
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", 
                padding: isMobile ? "20px 15px" : "25px", 
                borderRadius: isMobile ? "15px" : "20px", 
                marginBottom: isMobile ? "20px" : "25px",
                color: "white",
                textAlign: "center",
                boxShadow: "0 15px 40px rgba(102, 126, 234, 0.3)"
              }}>
                <p style={{ fontWeight: 700, fontSize: isMobile ? "1em" : "1.2em", marginBottom: "10px" }}>
                  📋 {selectedBons.length} bon{selectedBons.length > 1 ? 's' : ''} sélectionné{selectedBons.length > 1 ? 's' : ''} pour facturation groupée
                </p>
                <p style={{ fontSize: isMobile ? "1.2em" : "1.4em", fontWeight: 800 }}>
                  💰 Total à facturer: {ventes
                    .filter(v => selectedBons.includes(v.id))
                    .reduce((sum, v) => sum + (v.articles || []).reduce(
                      (s, a) => s + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)), 0
                    ), 0).toFixed(2)} DH
                </p>
                <div style={{ 
                  marginTop: "15px",
                  padding: "10px",
                  background: "rgba(255,255,255,0.2)",
                  borderRadius: "10px",
                  fontSize: isMobile ? "0.8em" : "0.9em"
                }}>
                  🏷️ Traçabilité multi-lots • 📄 Cachet personnalisé • 🖨️ Impression optimisée
                </div>
              </div>
            )}
            
            <div style={{ textAlign: "center" }}>
              <button
                onClick={handleGenerateFacture}
                disabled={selectedBons.length === 0 || isLoading}
                style={{
                  ...styles.groupedInvoiceButton,
                  background: (selectedBons.length > 0 && !isLoading)
                    ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)" 
                    : "linear-gradient(135deg, #a0aec0 0%, #718096 100%)",
                  cursor: (selectedBons.length > 0 && !isLoading) ? "pointer" : "not-allowed",
                  boxShadow: (selectedBons.length > 0 && !isLoading)
                    ? "0 10px 30px rgba(72, 187, 120, 0.4)" 
                    : "none",
                  opacity: (selectedBons.length > 0 && !isLoading) ? 1 : 0.6
                }}
                title="Générer une facture groupée multi-lots"
              >
                {isLoading ? "⏳ Génération..." : "🧾 Générer Facture Groupée"} ({selectedBons.length} bon{selectedBons.length > 1 ? 's' : ''})
              </button>
              
              {selectedBons.length > 0 && !isLoading && (
                <button
                  onClick={() => setSelectedBons([])}
                  style={{
                    ...styles.button,
                    ...styles.dangerButton,
                    marginTop: isMobile ? "15px" : "20px",
                    padding: isMobile ? "10px 20px" : "12px 25px",
                    fontSize: isMobile ? "0.9em" : "1em"
                  }}
                  title="Désélectionner tous les bons"
                >
                  ❌ Désélectionner Tout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
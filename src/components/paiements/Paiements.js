import React, { useEffect, useState, useCallback, useRef } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  Timestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

export default function Paiements() {
  const { role, loading, societeId, user, can, error } = useUserRole();

  // Chargement synchronisé
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  const [relatedTo, setRelatedTo] = useState("ventes");
  const [paiements, setPaiements] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [notes, setNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFiltres, setShowFiltres] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [totalBonSelectionne, setTotalBonSelectionne] = useState(0);
  const [selectedPhone, setSelectedPhone] = useState("");
  const [selectedClient, setSelectedClient] = useState("");

  // Stats en temps réel
  const [stats, setStats] = useState({
    totalPaiements: 0,
    totalDu: 0,
    nombreTransactions: 0,
    paiementsAujourdhui: 0
  });

  // Références pour les listeners
  const unsubscribeDocsRef = useRef(null);
  const unsubscribePaiementsRef = useRef(null);

  // Charger docs achats/ventes selon type choisi - TEMPS RÉEL
  const fetchDocuments = useCallback(() => {
    if (!societeId) {
      setDocuments([]);
      return;
    }
    
    // Vérifier les permissions selon le type
    if (relatedTo === "achats" && !can("voir_achats")) {
      setDocuments([]);
      return;
    }
    if (relatedTo === "ventes" && !can("voir_ventes")) {
      setDocuments([]);
      return;
    }

    // Nettoyer l'ancien listener
    if (unsubscribeDocsRef.current) {
      unsubscribeDocsRef.current();
      unsubscribeDocsRef.current = null;
    }

    const col = relatedTo === "achats" ? "achats" : "ventes";
    const docsRef = collection(db, "societe", societeId, col);
    
    const unsubscribe = onSnapshot(docsRef, (snapshot) => {
      let arr = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data._init && Array.isArray(data.articles) && 
            data.articles.some(a => (typeof a.quantite === "number" && (a.prixAchat || a.prixUnitaire)))) {
          arr.push({ id: docSnap.id, ...data });
        }
      });
      
      // Trier par date (plus récent en premier)
      arr.sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dateB - dateA;
      });
      
      setDocuments(arr);
    }, (error) => {
      console.error("Erreur écoute documents:", error);
    });

    unsubscribeDocsRef.current = unsubscribe;
  }, [relatedTo, societeId, can]);

  // Charger paiements liés au type - TEMPS RÉEL
  const fetchPaiements = useCallback(() => {
    if (!societeId) {
      setPaiements([]);
      return;
    }
    
    // Nettoyer l'ancien listener
    if (unsubscribePaiementsRef.current) {
      unsubscribePaiementsRef.current();
      unsubscribePaiementsRef.current = null;
    }

    const paiementsRef = collection(db, "societe", societeId, "paiements");
    const q = query(paiementsRef, where("type", "==", relatedTo));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let arr = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data._init) {
          arr.push({ id: docSnap.id, ...data });
        }
      });
      
      // Trier par date (plus récent en premier)
      arr.sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dateB - dateA;
      });
      
      setPaiements(arr);
      
      // Calculer les stats en temps réel
      const totalPaiements = arr.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
      
      // Paiements d'aujourd'hui
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const paiementsAujourdhui = arr
        .filter(p => {
          const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date);
          pDate.setHours(0, 0, 0, 0);
          return pDate.getTime() === today.getTime();
        })
        .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
      
      setStats(prevStats => ({
        ...prevStats,
        totalPaiements,
        nombreTransactions: arr.length,
        paiementsAujourdhui
      }));
      
    }, (error) => {
      console.error("Erreur écoute paiements:", error);
    });

    unsubscribePaiementsRef.current = unsubscribe;
  }, [relatedTo, societeId]);

  // Effect pour initialiser les listeners
  useEffect(() => {
    if (societeId && user) {
      fetchDocuments();
      fetchPaiements();
      setSelectedDoc("");
      setTotalBonSelectionne(0);
      setSelectedPhone("");
      setSelectedClient("");
    }
    
    // Cleanup fonction - IMPORTANT pour éviter les fuites mémoire
    return () => {
      if (unsubscribeDocsRef.current) {
        unsubscribeDocsRef.current();
        unsubscribeDocsRef.current = null;
      }
      if (unsubscribePaiementsRef.current) {
        unsubscribePaiementsRef.current();
        unsubscribePaiementsRef.current = null;
      }
    };
  }, [relatedTo, societeId, user, fetchDocuments, fetchPaiements]);

  // Effect de nettoyage lors du démontage du composant
  useEffect(() => {
    return () => {
      // Nettoyer tous les listeners lors du démontage
      if (unsubscribeDocsRef.current) {
        unsubscribeDocsRef.current();
        unsubscribeDocsRef.current = null;
      }
      if (unsubscribePaiementsRef.current) {
        unsubscribePaiementsRef.current();
        unsubscribePaiementsRef.current = null;
      }
      
      // Réinitialiser les états
      setDocuments([]);
      setPaiements([]);
      setSelectedDoc("");
      setTotalBonSelectionne(0);
      setSelectedPhone("");
      setSelectedClient("");
    };
  }, []); // Effect de nettoyage au démontage

  // Calcul du total d'un doc (articles)
  const getTotalDoc = useCallback((doc) => {
    if (!doc || !Array.isArray(doc.articles) || doc.articles.length === 0) return 0;
    return doc.articles.reduce((sum, a) => {
      const prix = relatedTo === "achats" ? Number(a.prixAchat || a.prixUnitaire || 0) : Number(a.prixUnitaire || 0);
      const quantite = Number(a.quantite || 0);
      const remise = Number(a.remise || 0);
      return sum + (prix * quantite - remise);
    }, 0) - (Number(doc.remiseGlobale) || 0);
  }, [relatedTo]);

  // Paiements regroupés par document
  const paiementsByDoc = React.useMemo(() => {
    const grouped = {};
    paiements.forEach((p) => {
      if (!grouped[p.docId]) grouped[p.docId] = [];
      grouped[p.docId].push(p);
    });
    return grouped;
  }, [paiements]);

  // Calculer le total dû en temps réel
  const totalDu = React.useMemo(() => {
    return documents.reduce((sum, doc) => {
      const total = getTotalDoc(doc);
      const paid = (paiementsByDoc[doc.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
      const solde = total - paid;
      return sum + Math.max(0, solde);
    }, 0);
  }, [documents, paiementsByDoc, getTotalDoc]);

  // Mettre à jour les stats avec le total dû (sans boucle)
  useEffect(() => {
    setStats(prevStats => ({
      ...prevStats,
      totalDu
    }));
  }, [totalDu]);

  // Liste de docs affichés (filtrage par statut)
  const docsAffiches = React.useMemo(() => {
    return documents.filter((doc) => {
      const total = getTotalDoc(doc);
      const paid = (paiementsByDoc[doc.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
      const solde = total - paid;
      
      if (filterStatus === "paid") return solde <= 0;
      if (filterStatus === "due") return solde > 0;
      if (filterStatus === "partial") {
        return paid > 0 && solde > 0;
      }
      return true;
    });
  }, [documents, paiementsByDoc, filterStatus, getTotalDoc]);

  // Sélection du doc (affiche total et infos)
  const handleSelectDoc = (docId) => {
    setSelectedDoc(docId);
    const documentSelected = documents.find((d) => d.id === docId);
    if (documentSelected) {
      const total = getTotalDoc(documentSelected);
      setTotalBonSelectionne(total);
      
      if (relatedTo === "achats") {
        setSelectedPhone(documentSelected.telephone || "");
        setSelectedClient(documentSelected.fournisseur || "");
      } else {
        setSelectedPhone(documentSelected.telephoneClient || documentSelected.telephone || "");
        setSelectedClient(documentSelected.client || "");
      }
    } else {
      setTotalBonSelectionne(0);
      setSelectedPhone("");
      setSelectedClient("");
    }
  };

  // Ajout paiement - CORRIGÉ POUR SAAS
  const handleAddPaiement = async (e) => {
    e.preventDefault();
    if (!societeId) return alert("Aucune société sélectionnée !");
    if (!can("voir_ventes") && !can("voir_achats")) return alert("Permission insuffisante !");
    if (!selectedDoc || !montant) return;
    
    const montantNum = Number(montant);
    if (montantNum <= 0) return alert("Le montant doit être positif !");
    
    // Vérifier que le montant ne dépasse pas le solde dû
    const documentSelected = documents.find(d => d.id === selectedDoc);
    if (documentSelected) {
      const total = getTotalDoc(documentSelected);
      const paid = (paiementsByDoc[selectedDoc] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
      const solde = total - paid;
      
      if (montantNum > solde) {
        return alert(`Le montant ne peut pas dépasser le solde dû (${solde} DH) !`);
      }
    }
    
    try {
      const paiementData = {
        docId: selectedDoc,
        montant: montantNum,
        mode,
        notes: notes.trim() || "",
        type: relatedTo,
        date: Timestamp.now(),
        creePar: user.uid,
        creeParNom: user.email,
        clientFournisseur: selectedClient,
        societeId
      };

      await addDoc(collection(db, "societe", societeId, "paiements"), paiementData);
      
      // Mettre à jour le statut du document si entièrement payé
      if (documentSelected) {
        const total = getTotalDoc(documentSelected);
        const newPaid = (paiementsByDoc[selectedDoc] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0) + montantNum;
        const newSolde = total - newPaid;
        
        let newStatut = "impayé";
        if (newSolde <= 0) newStatut = "payé";
        else if (newPaid > 0) newStatut = "partiel";
        
        const docRef = relatedTo === "achats" ? "achats" : "ventes";
        await updateDoc(doc(db, "societe", societeId, docRef, selectedDoc), {
          statutPaiement: newStatut,
          dernierPaiement: Timestamp.now(),
          modifiePar: user.uid,
          modifieLe: Timestamp.now()
        });
      }
      
      setSelectedDoc("");
      setMontant("");
      setNotes("");
      setTotalBonSelectionne(0);
      setSelectedPhone("");
      setSelectedClient("");
      
    } catch (err) {
      console.error("Erreur ajout paiement:", err);
      alert("Erreur lors de l'ajout du paiement");
    }
  };

  // Supprimer un paiement
  const handleDeletePaiement = async (paiement) => {
    if (!can("voir_ventes") && !can("voir_achats")) return alert("Permission insuffisante !");
    if (!window.confirm(`Supprimer ce paiement de ${paiement.montant} DH ?`)) return;
    
    try {
      await deleteDoc(doc(db, "societe", societeId, "paiements", paiement.id));
      
      // Mettre à jour le statut du document
      const documentFound = documents.find(d => d.id === paiement.docId);
      if (documentFound) {
        const total = getTotalDoc(documentFound);
        const newPaid = (paiementsByDoc[paiement.docId] || [])
          .filter(p => p.id !== paiement.id)
          .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
        const newSolde = total - newPaid;
        
        let newStatut = "impayé";
        if (newSolde <= 0) newStatut = "payé";
        else if (newPaid > 0) newStatut = "partiel";
        
        const docRef = relatedTo === "achats" ? "achats" : "ventes";
        await updateDoc(doc(db, "societe", societeId, docRef, paiement.docId), {
          statutPaiement: newStatut,
          modifiePar: user.uid,
          modifieLe: Timestamp.now()
        });
      }
      
    } catch (err) {
      console.error("Erreur suppression paiement:", err);
      alert("Erreur lors de la suppression");
    }
  };

  // Impression reçu de paiement
  const handlePrintReceipt = (paiement) => {
    const documentFound = documents.find(d => d.id === paiement.docId);
    const clientFournisseur = documentFound ? 
      (relatedTo === "achats" ? documentFound.fournisseur : documentFound.client) : 
      paiement.clientFournisseur || "N/A";
    
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Reçu de Paiement</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .content { margin: 20px 0; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>REÇU DE PAIEMENT</h2>
            <p>Société: ${user.societeNom || 'Pharmacie'}</p>
          </div>
          <div class="content">
            <p><strong>N° de reçu:</strong> ${paiement.id.substring(0, 8).toUpperCase()}</p>
            <p><strong>Date:</strong> ${paiement.date?.toDate().toLocaleDateString() || ""}</p>
            <p><strong>${relatedTo === "achats" ? "Fournisseur" : "Client"}:</strong> ${clientFournisseur}</p>
            <p><strong>Montant reçu:</strong> ${paiement.montant} DH</p>
            <p><strong>Mode de paiement:</strong> ${paiement.mode}</p>
            ${paiement.notes ? `<p><strong>Notes:</strong> ${paiement.notes}</p>` : ""}
            ${documentFound ? `<p><strong>Document lié:</strong> ${documentFound.date?.toDate().toLocaleDateString()}</p>` : ""}
          </div>
          <div class="footer">
            <p>Reçu généré le ${new Date().toLocaleString()}</p>
            <p>Signature: _________________________</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Pour couleurs badges
  const getStatusChip = (solde, paid = 0) => {
    if (solde <= 0) return <span className="status-chip success">Payé</span>;
    if (paid > 0) return <span className="status-chip info">Partiel ({solde} DH dû)</span>;
    return <span className="status-chip danger">{solde} DH dû</span>;
  };

  // Affichages conditionnels
  if (waiting) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#1c355e" }}>
        Chargement...
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Erreur: {error}
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

  if (!can("voir_ventes") && !can("voir_achats")) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Accès refusé : vous n'avez pas l'autorisation d'accéder aux paiements.
      </div>
    );
  }

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">
        Gestion des Paiements - {user.societeNom || 'Pharmacie'}
      </div>
      
      {/* Info société */}
      <div style={{ 
        padding: "8px 15px", 
        background: "#1a2535", 
        color: "#98c4f9", 
        fontSize: "0.9rem",
        borderRadius: "6px",
        margin: "0 18px 10px 18px"
      }}>
        <strong>Société:</strong> {user.societeNom || 'Non définie'} | 
        <strong> Rôle:</strong> {role} | 
        <strong> Type:</strong> {relatedTo === "achats" ? "Paiements Fournisseurs" : "Paiements Clients"}
      </div>

      {/* Statistiques rapides */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: "15px", 
        margin: "0 18px 20px 18px" 
      }}>
        <div style={{ 
          background: "#283c55", 
          padding: "15px", 
          borderRadius: "10px", 
          textAlign: "center",
          border: "1px solid #334568"
        }}>
          <div style={{ color: "#7ee4e6", fontSize: "1.5rem", fontWeight: "800" }}>
            {stats.totalPaiements.toLocaleString()} DH
          </div>
          <div style={{ color: "#b5c3d8", fontSize: "0.9rem" }}>Total Encaissé</div>
        </div>
        <div style={{ 
          background: "#283c55", 
          padding: "15px", 
          borderRadius: "10px", 
          textAlign: "center",
          border: "1px solid #334568"
        }}>
          <div style={{ color: "#fd6565", fontSize: "1.5rem", fontWeight: "800" }}>
            {stats.totalDu.toLocaleString()} DH
          </div>
          <div style={{ color: "#b5c3d8", fontSize: "0.9rem" }}>Total Dû</div>
        </div>
        <div style={{ 
          background: "#283c55", 
          padding: "15px", 
          borderRadius: "10px", 
          textAlign: "center",
          border: "1px solid #334568"
        }}>
          <div style={{ color: "#90e0a0", fontSize: "1.5rem", fontWeight: "800" }}>
            {stats.nombreTransactions}
          </div>
          <div style={{ color: "#b5c3d8", fontSize: "0.9rem" }}>Transactions</div>
        </div>
        <div style={{ 
          background: "#283c55", 
          padding: "15px", 
          borderRadius: "10px", 
          textAlign: "center",
          border: "1px solid #334568"
        }}>
          <div style={{ color: "#f39c12", fontSize: "1.5rem", fontWeight: "800" }}>
            {stats.paiementsAujourdhui.toLocaleString()} DH
          </div>
          <div style={{ color: "#b5c3d8", fontSize: "0.9rem" }}>Aujourd'hui</div>
        </div>
      </div>

      {/* Choix type (Achats/Ventes) */}
      <div className="paper-card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontWeight: "600", color: "#98c4f9" }}>Type de paiements :</label>
        <select className="input" value={relatedTo} onChange={e => setRelatedTo(e.target.value)}>
          <option value="ventes">💰 Paiements Ventes (Clients)</option>
          {can("voir_achats") && <option value="achats">🏪 Paiements Achats (Fournisseurs)</option>}
        </select>
      </div>

      {/* Toggle du formulaire */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginTop:14,marginBottom:0}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1.28em",
            padding:"2px 13px",
            minWidth:35,
            background:showForm
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={()=>setShowForm(v=>!v)}
          aria-label="Afficher/Masquer le formulaire de paiement"
          title="Afficher/Masquer le formulaire de paiement"
        >
          {showForm ? "➖" : "➕"}
        </button>
        <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Nouveau Paiement</span>
      </div>

      {/* Formulaire MASQUÉ PAR DÉFAUT */}
      {showForm && (
        <div className="paper-card">
          <form onSubmit={handleAddPaiement} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minWidth(220px, 1fr))", gap: 18 }}>
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>
                📋 {relatedTo === "achats" ? "Bon d'Achat" : "Bon de Vente"} *
              </label>
              <select 
                className="input"
                value={selectedDoc}
                onChange={e => handleSelectDoc(e.target.value)}
                required
              >
                <option value="">Sélectionner un document...</option>
                {documents
                  .filter(d => {
                    const total = getTotalDoc(d);
                    const paid = (paiementsByDoc[d.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
                    return total - paid > 0; // Seulement les docs avec solde > 0
                  })
                  .map((d) => {
                    const total = getTotalDoc(d);
                    const paid = (paiementsByDoc[d.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
                    const solde = total - paid;
                    const clientFournisseur = relatedTo === "achats" ? d.fournisseur : d.client;
                    return (
                      <option key={d.id} value={d.id}>
                        {clientFournisseur} - {d.date?.toDate().toLocaleDateString()} (Solde: {solde} DH)
                      </option>
                    );
                  })
                }
              </select>
            </div>
            
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>💵 Montant payé *</label>
              <input 
                className="input" 
                type="number" 
                step="0.01"
                value={montant} 
                onChange={e => setMontant(e.target.value)} 
                required 
                min={0.01}
                max={totalBonSelectionne || undefined}
                placeholder="0.00"
              />
            </div>
            
            <div>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>💳 Mode de paiement</label>
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="Espèces">💵 Espèces</option>
                <option value="Carte">💳 Carte Bancaire</option>
                <option value="Virement">🏪 Virement</option>
                <option value="Chèque">📄 Chèque</option>
                <option value="Mobile Money">📱 Mobile Money</option>
                <option value="Autre">❓ Autre</option>
              </select>
            </div>
            
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ color: "#98c4f9", fontWeight: "600" }}>📝 Notes (optionnel)</label>
              <input 
                className="input" 
                type="text" 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Référence chèque, commentaire..."
              />
            </div>
            
            <button className="btn success" type="submit" disabled={!selectedDoc || !montant}>
              💰 Enregistrer Paiement
            </button>
          </form>
        </div>
      )}

      {/* Infos doc sélectionné */}
      {selectedDoc && (
        <div className="paper-card" style={{ marginBottom: 5 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minWidth(200px, 1fr))", gap: 15 }}>
            <div>
              <strong style={{ color: "#98c4f9" }}>💰 Total du bon sélectionné :</strong>
              <div style={{ fontSize: "1.2rem", color: "#7ee4e6", fontWeight: "700" }}>{totalBonSelectionne} DH</div>
            </div>
            {selectedClient && (
              <div>
                <strong style={{ color: "#98c4f9" }}>
                  {relatedTo === "achats" ? "🏪 Fournisseur" : "👤 Client"} :
                </strong>
                <div style={{ fontSize: "1.1rem", fontWeight: "600" }}>{selectedClient}</div>
              </div>
            )}
            {selectedPhone && (
              <div>
                <strong style={{ color: "#98c4f9" }}>📞 Téléphone :</strong>
                <div style={{ fontSize: "1.1rem", color: "#39d8fa" }}>{selectedPhone}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle Filtres Statut */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginTop:14,marginBottom:0}}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize:"1.28em",
            padding:"2px 13px",
            minWidth:35,
            background:showFiltres
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={()=>setShowFiltres(v=>!v)}
          aria-label="Afficher/Masquer les filtres statut"
          title="Afficher/Masquer les filtres"
        >
          {showFiltres ? "➖" : "➕"}
        </button>
        <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>Filtrer par statut</span>
      </div>
      {showFiltres && (
        <div className="paper-card" style={{ display: "flex", alignItems: "center", gap: 10, marginTop:7, marginBottom:5 }}>
          <label style={{ color: "#98c4f9", fontWeight: "600" }}>📊 Statut :</label>
          <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">📋 Tous</option>
            <option value="paid">✅ Entièrement payé</option>
            <option value="partial">⚠️ Partiellement payé</option>
            <option value="due">❌ Non payé</option>
          </select>
        </div>
      )}

      {/* Historique des paiements */}
      <div className="fullscreen-table-title" style={{ marginTop: 26, marginBottom: 0, fontSize: "1.3rem" }}>
        📊 Suivi des Paiements ({docsAffiches.length} documents)
      </div>
      <div className="table-pro-full" style={{ marginTop: 3 }}>
        <table>
          <thead>
            <tr>
              <th>{relatedTo === "achats" ? "🏪 Fournisseur" : "👤 Client"}</th>
              <th>📅 Document</th>
              <th>💰 Total</th>
              <th>✅ Payé</th>
              <th>📊 Statut</th>
              <th>💳 Derniers paiements</th>
              <th>🔧 Actions</th>
            </tr>
          </thead>
          <tbody>
            {docsAffiches.map((document) => {
              const paiementsDoc = paiementsByDoc[document.id] || [];
              const total = getTotalDoc(document);
              const paid = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
              const solde = total - paid;
              const clientFournisseur = relatedTo === "achats" ? document.fournisseur : document.client;
              const telephone = relatedTo === "achats" ? document.telephone : (document.telephoneClient || document.telephone);
              
              return (
                <tr key={document.id}>
                  <td>
                    <div style={{ fontWeight: "600" }}>{clientFournisseur || "N/A"}</div>
                    {telephone && (
                      <div style={{ fontSize: "0.85em", color: "#39d8fa" }}>
                        📞 {telephone}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: "600" }}>{document.date?.toDate().toLocaleDateString()}</div>
                    <div style={{ fontSize: "0.8em", color: "#99b2d4" }}>
                      ID: {document.id.substring(0, 8)}
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: "#e8ecf4" }}>{total} DH</strong>
                  </td>
                  <td>
                    <strong style={{ color: "#2bd2a6" }}>{paid} DH</strong>
                    {paiementsDoc.length > 0 && (
                      <div style={{ fontSize: "0.8em", color: "#99b2d4" }}>
                        ({paiementsDoc.length} transaction{paiementsDoc.length > 1 ? 's' : ''})
                      </div>
                    )}
                  </td>
                  <td>{getStatusChip(solde, paid)}</td>
                  <td>
                    {paiementsDoc.length > 0 ? (
                      <div style={{ fontSize: "0.85em" }}>
                        {paiementsDoc
                          .slice(-2) // Les 2 derniers
                          .map((p, i) => (
                            <div key={p.id || i} style={{ marginBottom: "3px" }}>
                              <span style={{ color: "#2bd2a6", fontWeight: "600" }}>
                                💰 {p.montant} DH
                              </span>
                              <span style={{ color: "#99b2d4", marginLeft: "5px" }}>
                                {p.mode}
                              </span>
                              <div style={{ color: "#7a8fa8", fontSize: "0.8em" }}>
                                📅 {p.date?.toDate().toLocaleDateString()}
                                {p.notes && (
                                  <div style={{ fontStyle: "italic" }}>
                                    📝 {p.notes.substring(0, 30)}{p.notes.length > 30 ? "..." : ""}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        {paiementsDoc.length > 2 && (
                          <div style={{ color: "#99b2d4", fontSize: "0.8em" }}>
                            +{paiementsDoc.length - 2} autre{paiementsDoc.length - 2 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "#fd6565", fontSize: "0.9em" }}>
                        ❌ Aucun paiement
                      </span>
                    )}
                  </td>
                  <td>
                    {paiementsDoc.length > 0 && (
                      <>
                        <button 
                          className="btn danger" 
                          style={{ fontSize: "0.8em", padding: "4px 8px", marginBottom: "4px" }}
                          onClick={() => handleDeletePaiement(paiementsDoc[paiementsDoc.length - 1])}
                          title="Supprimer le dernier paiement"
                        >
                          🗑️ Suppr.
                        </button>
                        <br />
                        <button 
                          className="btn print" 
                          style={{ fontSize: "0.8em", padding: "4px 8px" }}
                          onClick={() => handlePrintReceipt(paiementsDoc[paiementsDoc.length - 1])}
                          title="Imprimer reçu du dernier paiement"
                        >
                          🖨️ Reçu
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Section détaillée des paiements */}
      {paiements.length > 0 && (
        <>
          <div className="fullscreen-table-title" style={{ marginTop: 30, fontSize: "1.2rem" }}>
            📋 Détail des Transactions ({paiements.length})
          </div>
          <div className="table-pro-full" style={{ marginTop: 3, maxHeight: "45vh" }}>
            <table>
              <thead>
                <tr>
                  <th>📅 Date</th>
                  <th>{relatedTo === "achats" ? "🏪 Fournisseur" : "👤 Client"}</th>
                  <th>💰 Montant</th>
                  <th>💳 Mode</th>
                  <th>📝 Notes</th>
                  <th>👤 Créé par</th>
                  <th>🔧 Actions</th>
                </tr>
              </thead>
              <tbody>
                {paiements.map((paiement) => {
                  const documentFound = documents.find(d => d.id === paiement.docId);
                  const clientFournisseur = documentFound ? 
                    (relatedTo === "achats" ? documentFound.fournisseur : documentFound.client) : 
                    paiement.clientFournisseur || "N/A";
                    
                  return (
                    <tr key={paiement.id}>
                      <td>{paiement.date?.toDate().toLocaleDateString()}</td>
                      <td>
                        <div style={{ fontWeight: "600" }}>{clientFournisseur}</div>
                        {documentFound && (
                          <div style={{ fontSize: "0.8em", color: "#99b2d4" }}>
                            📄 {documentFound.date?.toDate().toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: "#2bd2a6", fontSize: "1.1em" }}>
                          {paiement.montant} DH
                        </strong>
                      </td>
                      <td>
                        <span className="status-chip info" style={{ fontSize: "0.8em" }}>
                          {paiement.mode}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85em", maxWidth: "150px" }}>
                        {paiement.notes ? (
                          <span title={paiement.notes}>
                            📝 {paiement.notes.length > 30 ? paiement.notes.substring(0, 30) + "..." : paiement.notes}
                          </span>
                        ) : "-"}
                      </td>
                      <td style={{ fontSize: "0.85em", color: "#99b2d4" }}>
                        👤 {paiement.creeParNom || "N/A"}
                        <div style={{ fontSize: "0.75em" }}>
                          🕒 {paiement.date?.toDate().toLocaleTimeString()}
                        </div>
                      </td>
                      <td>
                        <button 
                          className="btn print" 
                          style={{ fontSize: "0.8em", padding: "4px 8px", marginBottom: "4px" }}
                          onClick={() => handlePrintReceipt(paiement)}
                          title="Imprimer reçu"
                        >
                          🖨️
                        </button>
                        <br />
                        <button 
                          className="btn danger" 
                          style={{ fontSize: "0.8em", padding: "4px 8px" }}
                          onClick={() => handleDeletePaiement(paiement)}
                          title="Supprimer paiement"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Message si aucun document */}
      {docsAffiches.length === 0 && (
        <div className="paper-card" style={{ textAlign: "center", marginTop: 20 }}>
          <div style={{ fontSize: "1.2rem", color: "#99b2d4", marginBottom: "10px" }}>
            📭 Aucun document trouvé
          </div>
          <div style={{ color: "#7a8fa8" }}>
            {filterStatus === "all" 
              ? `Aucun document ${relatedTo === "achats" ? "d'achat" : "de vente"} disponible.`
              : `Aucun document avec le statut "${filterStatus}" trouvé.`
            }
          </div>
        </div>
      )}

      {/* Résumé rapide en bas */}
      {docsAffiches.length > 0 && (
        <div className="paper-card" style={{ marginTop: 20, background: "#1a2535" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minWidth(150px, 1fr))", gap: 15, textAlign: "center" }}>
            <div>
              <div style={{ color: "#7ee4e6", fontSize: "1.2rem", fontWeight: "700" }}>
                {docsAffiches.length}
              </div>
              <div style={{ color: "#b5c3d8", fontSize: "0.9rem" }}>Documents</div>
            </div>
            <div>
              <div style={{ color: "#2bd2a6", fontSize: "1.2rem", fontWeight: "700" }}>
                {docsAffiches.filter(d => {
                  const total = getTotalDoc(d);
                  const paid = (paiementsByDoc[d.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
                  return total - paid <= 0;
                }).length}
              </div>
              <div style={{ color: "#b5c3d8", fontSize: "0.9rem" }}>Payés</div>
            </div>
            <div>
              <div style={{ color: "#f39c12", fontSize: "1.2rem", fontWeight: "700" }}>
                {docsAffiches.filter(d => {
                  const total = getTotalDoc(d);
                  const paid = (paiementsByDoc[d.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
                  return paid > 0 && total - paid > 0;
                }).length}
              </div>
              <div style={{ color: "#b5c3d8", fontSize: "0.9rem" }}>Partiels</div>
            </div>
            <div>
              <div style={{ color: "#fd6565", fontSize: "1.2rem", fontWeight: "700" }}>
                {docsAffiches.filter(d => {
                  const paid = (paiementsByDoc[d.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
                  return paid === 0;
                }).length}
              </div>
              <div style={{ color: "#b5c3d8", fontSize: "0.9rem" }}>Non payés</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
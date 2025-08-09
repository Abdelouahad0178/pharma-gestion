import React, { useEffect, useState, useCallback } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

export default function Paiements() {
  const { societeId, user, loading } = useUserRole();
  const [waiting, setWaiting] = useState(true);

  const [relatedTo, setRelatedTo] = useState("achats");
  const [paiements, setPaiements] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFiltres, setShowFiltres] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [totalBonSelectionne, setTotalBonSelectionne] = useState(0);
  const [selectedPhone, setSelectedPhone] = useState("");
  const [editingPaiement, setEditingPaiement] = useState(null);
  const [showHistorique, setShowHistorique] = useState(false);

  // Synchronisation du chargement
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // Calcul du total d'un document
  const getTotalDoc = (doc) => {
    if (!doc || !Array.isArray(doc.articles) || doc.articles.length === 0) return 0;
    return doc.articles.reduce((sum, a) => {
      const prix = relatedTo === "achats" ? Number(a.prixAchat || a.prixUnitaire || 0) : Number(a.prixUnitaire || 0);
      const quantite = Number(a.quantite || 0);
      const remise = Number(a.remise || 0);
      return sum + (prix * quantite - remise);
    }, 0) - (Number(doc.remiseGlobale) || 0);
  };

  // Mettre à jour le statut de paiement d'un document ✅ AVEC TRAÇABILITÉ
  const updateDocumentStatus = async (docId, type, totalPaye, totalDoc) => {
    if (!societeId || !user) return;
    
    let nouveauStatut;
    if (totalPaye >= totalDoc) {
      nouveauStatut = "payé";
    } else if (totalPaye > 0) {
      nouveauStatut = "partiel";
    } else {
      nouveauStatut = "impayé";
    }
    
    const docRef = doc(db, "societe", societeId, type, docId);
    await updateDoc(docRef, { 
      statutPaiement: nouveauStatut,
      montantPaye: totalPaye,
      lastPaymentUpdate: Timestamp.now(),
      // 🔧 TRAÇABILITÉ MISE À JOUR STATUT
      modifiePar: user.uid,
      modifieParEmail: user.email,
      modifieLe: Timestamp.now()
    });
  };

  // Écoute en temps réel des documents (achats/ventes)
  useEffect(() => {
    if (!societeId) return;

    const unsubscribe = onSnapshot(
      collection(db, "societe", societeId, relatedTo),
      (snapshot) => {
        const docs = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (Array.isArray(data.articles) && data.articles.some(a => (typeof a.quantite === "number" && (a.prixAchat || a.prixUnitaire)))) {
            docs.push({ id: doc.id, ...data });
          }
        });
        setDocuments(docs);
      }
    );

    return () => unsubscribe();
  }, [societeId, relatedTo]);

  // Écoute en temps réel des paiements
  useEffect(() => {
    if (!societeId) return;

    const q = query(collection(db, "societe", societeId, "paiements"), where("type", "==", relatedTo));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const paie = [];
      snapshot.forEach((doc) => paie.push({ id: doc.id, ...doc.data() }));
      setPaiements(paie);
    });

    return () => unsubscribe();
  }, [societeId, relatedTo]);

  // Réinitialisation lors du changement de type
  useEffect(() => {
    setSelectedDoc("");
    setTotalBonSelectionne(0);
    setSelectedPhone("");
    setEditingPaiement(null);
  }, [relatedTo]);

  // Paiements regroupés par document
  const paiementsByDoc = {};
  paiements.forEach((p) => {
    if (!paiementsByDoc[p.docId]) paiementsByDoc[p.docId] = [];
    paiementsByDoc[p.docId].push(p);
  });

  // Liste de documents affichés (filtrage par statut)
  const docsAffiches = documents.filter((doc) => {
    const total = getTotalDoc(doc);
    const paid = (paiementsByDoc[doc.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
    const solde = total - paid;
    if (filterStatus === "paid") return solde <= 0;
    if (filterStatus === "due") return solde > 0;
    return true;
  });

  // Sélection du document
  const handleSelectDoc = (docId) => {
    setSelectedDoc(docId);
    const doc = documents.find((d) => d.id === docId);
    if (doc) {
      const total = getTotalDoc(doc);
      const paid = (paiementsByDoc[docId] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
      const restant = total - paid;
      setTotalBonSelectionne(total);
      setMontant(restant > 0 ? String(restant) : "");
      setSelectedPhone(
        (relatedTo === "achats" ? doc.telephone : doc.telephoneClient) ||
        doc.telephone ||
        ""
      );
    } else {
      setTotalBonSelectionne(0);
      setSelectedPhone("");
      setMontant("");
    }
  };

  // Ajout/Modification de paiement ✅ AVEC TRAÇABILITÉ COMPLÈTE
  const handleSavePaiement = async (e) => {
    e.preventDefault();
    if (!societeId || !user || !selectedDoc || !montant) return;
    
    const montantNum = Number(montant);
    if (montantNum <= 0) {
      alert("Le montant doit être supérieur à 0");
      return;
    }

    const docData = documents.find(d => d.id === selectedDoc);
    const totalDoc = getTotalDoc(docData);
    const paiementsDoc = paiementsByDoc[selectedDoc] || [];
    const dejaPaye = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
    
    if (editingPaiement) {
      // ✅ MODIFICATION AVEC TRAÇABILITÉ
      const ancienMontant = Number(editingPaiement.montant);
      const nouveauTotal = dejaPaye - ancienMontant + montantNum;
      
      if (nouveauTotal > totalDoc) {
        alert(`Le montant total payé (${nouveauTotal} DH) dépasserait le total du document (${totalDoc} DH)`);
        return;
      }
      
      await updateDoc(doc(db, "societe", societeId, "paiements", editingPaiement.id), {
        montant: montantNum,
        mode,
        // 🔧 CHAMPS DE TRAÇABILITÉ MODIFICATION
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now(),
        // Compatibilité avec ancien système
        modifiedBy: user.displayName || user.email || "Inconnu",
        modifiedAt: Timestamp.now()
      });

      // Enregistrer l'activité de modification du paiement
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "paiement",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          docId: selectedDoc,
          montant: montantNum,
          mode: mode,
          type: relatedTo,
          action: 'modification', // Spécifier l'action
          paiementId: editingPaiement.id
        }
      });
      
      // Mettre à jour le statut du document
      await updateDocumentStatus(selectedDoc, relatedTo, nouveauTotal, totalDoc);
      
      setEditingPaiement(null);
    } else {
      // ✅ CRÉATION AVEC TRAÇABILITÉ
      const nouveauTotal = dejaPaye + montantNum;
      
      if (nouveauTotal > totalDoc) {
        alert(`Le montant total payé (${nouveauTotal} DH) dépasserait le total du document (${totalDoc} DH)`);
        return;
      }
      
      const addedPaiement = await addDoc(collection(db, "societe", societeId, "paiements"), {
        docId: selectedDoc,
        montant: montantNum,
        mode,
        type: relatedTo,
        date: Timestamp.now(),
        // 🔧 CHAMPS DE TRAÇABILITÉ CRÉATION
        creePar: user.uid,
        creeParEmail: user.email,
        creeLe: Timestamp.now(),
        societeId: societeId,
        // Compatibilité avec ancien système
        createdBy: user.displayName || user.email || "Inconnu",
        createdByEmail: user.email
      });

      // Enregistrer l'activité de création du paiement
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "paiement",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          docId: selectedDoc,
          montant: montantNum,
          mode: mode,
          type: relatedTo,
          action: 'création', // Spécifier l'action
          paiementId: addedPaiement.id
        }
      });
      
      // Mettre à jour le statut du document
      await updateDocumentStatus(selectedDoc, relatedTo, nouveauTotal, totalDoc);
    }
    
    // Réinitialiser le formulaire
    setSelectedDoc("");
    setMontant("");
    setMode("Espèces");
    setTotalBonSelectionne(0);
    setSelectedPhone("");
  };

  // Supprimer un paiement ✅ AVEC TRAÇABILITÉ
  const handleDeletePaiement = async (paiement) => {
    if (!societeId || !user) return;
    // IMPORTANT: Remplacer window.confirm par une modale personnalisée dans une application réelle
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce paiement ?")) return;
    
    const docData = documents.find(d => d.id === paiement.docId);
    const totalDoc = getTotalDoc(docData);
    const paiementsDoc = paiementsByDoc[paiement.docId] || [];
    const dejaPaye = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
    const nouveauTotal = dejaPaye - Number(paiement.montant);
    
    await deleteDoc(doc(db, "societe", societeId, "paiements", paiement.id));

    // Enregistrer l'activité de suppression du paiement
    await addDoc(collection(db, "societe", societeId, "activities"), {
      type: "paiement",
      userId: user.uid,
      userEmail: user.email,
      timestamp: Timestamp.now(),
      details: {
        docId: paiement.docId,
        montant: paiement.montant,
        mode: paiement.mode,
        type: paiement.type,
        action: 'suppression', // Spécifier l'action
        paiementId: paiement.id
      }
    });
    
    // Mettre à jour le statut du document avec traçabilité
    await updateDocumentStatus(paiement.docId, relatedTo, nouveauTotal, totalDoc);
  };

  // Éditer un paiement
  const handleEditPaiement = (paiement) => {
    setEditingPaiement(paiement);
    setSelectedDoc(paiement.docId);
    setMontant(String(paiement.montant));
    setMode(paiement.mode);
    handleSelectDoc(paiement.docId);
    setShowForm(true);
  };

  // Obtenir le nom d'utilisateur pour l'affichage
  const getUserDisplayName = (paiement) => {
    // Essayer d'abord les nouveaux champs de traçabilité
    if (paiement.creeParEmail) {
      return paiement.creeParEmail.split('@')[0];
    }
    // Puis les anciens champs
    if (paiement.createdBy && paiement.createdBy !== "Inconnu") {
      return paiement.createdBy;
    }
    if (paiement.createdByEmail) {
      return paiement.createdByEmail.split('@')[0];
    }
    return "Non spécifié";
  };

  // Pour couleurs badges
  const getStatusChip = (solde) => {
    if (solde <= 0) return <span className="status-chip success">Payé</span>;
    return <span className="status-chip danger">{solde} DH dû</span>;
  };

  // Gestion du chargement
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

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Paiements</div>

      {/* Choix type (Achats/Ventes) */}
      <div className="paper-card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label>Type:</label>
        <select className="input" value={relatedTo} onChange={e => setRelatedTo(e.target.value)}>
          <option value="achats">Paiements Achats (Fournisseurs)</option>
          <option value="ventes">Paiements Ventes (Clients)</option>
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
          onClick={()=>{setShowForm(v=>!v); setEditingPaiement(null);}}
          aria-label="Afficher/Masquer le formulaire de paiement"
          title="Afficher/Masquer le formulaire de paiement"
        >
          {showForm ? "➖" : "➕"}
        </button>
        <span style={{fontWeight:700,fontSize:17,letterSpacing:0.02}}>
          {editingPaiement ? "Modifier le paiement" : "Nouveau paiement"}
        </span>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="paper-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, marginBottom: 8 }}>
          <form style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, width: "100%" }} onSubmit={handleSavePaiement}>
            <div style={{ minWidth: 200 }}>
              <label>{relatedTo === "achats" ? "Bon d'Achat" : "Bon de Vente"}</label>
              <select className="input"
                value={selectedDoc}
                onChange={e => handleSelectDoc(e.target.value)}
                required
                disabled={!!editingPaiement}
              >
                <option value="">Sélectionner...</option>
                {documents.map((d) => {
                  const total = getTotalDoc(d);
                  const paid = (paiementsByDoc[d.id] || []).reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
                  const solde = total - paid;
                  
                  // Si on édite, afficher tous les documents, sinon seulement ceux avec solde
                  if (!editingPaiement && solde <= 0) return null;
                  
                  return (
                    <option key={d.id} value={d.id}>
                      {(relatedTo === "achats" ? d.fournisseur : d.client) || "N/A"} - {d.date?.toDate().toLocaleDateString()} 
                      (Total: {total} DH | Payé: {paid} DH | Reste: {solde} DH)
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label>Montant</label>
              <input className="input" type="number" value={montant} onChange={e => setMontant(e.target.value)} required min={0.01} step={0.01} />
            </div>
            <div>
              <label>Mode</label>
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="Espèces">Espèces</option>
                <option value="Carte">Carte</option>
                <option value="Virement">Virement</option>
                <option value="Chèque">Chèque</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <button className="btn success" type="submit">
              {editingPaiement ? "Modifier" : "Ajouter"} Paiement
            </button>
            {editingPaiement && (
              <button className="btn info" type="button" onClick={() => {
                setEditingPaiement(null);
                setSelectedDoc("");
                setMontant("");
                setMode("Espèces");
                setTotalBonSelectionne(0);
                setSelectedPhone("");
              }}>
                Annuler
              </button>
            )}
          </form>
        </div>
      )}

      {/* Infos document sélectionné */}
      {selectedDoc && showForm && (
        <div className="paper-card" style={{ marginBottom: 5 }}>
          <b>Total du bon : </b>{totalBonSelectionne} DH
          {selectedPhone &&
            <span style={{ marginLeft: 18 }}>
              <b>{relatedTo === "achats" ? "Téléphone Fournisseur" : "Téléphone Client"} : </b>{selectedPhone}
            </span>
          }
          {paiementsByDoc[selectedDoc] && (
            <span style={{ marginLeft: 18 }}>
              <b>Déjà payé : </b>{paiementsByDoc[selectedDoc].reduce((sum, p) => sum + Number(p.montant), 0)} DH
            </span>
          )}
          <span style={{ marginLeft: 18 }}>
            <b>Reste à payer : </b>
            {totalBonSelectionne - (paiementsByDoc[selectedDoc] || []).reduce((sum, p) => sum + Number(p.montant), 0)} DH
          </span>
        </div>
      )}

      {/* Toggle Filtres */}
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
          <label>Statut :</label>
          <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Tous</option>
            <option value="paid">Payé</option>
            <option value="due">Dû</option>
          </select>
        </div>
      )}

      {/* Vue récapitulative des documents */}
      <div className="fullscreen-table-title" style={{ marginTop: 26, marginBottom: 0, fontSize: "1.3rem" }}>
        Vue d'overview des {relatedTo === "achats" ? "Achats" : "Ventes"}
      </div>
      <div className="table-pro-full" style={{ marginTop: 3, maxHeight: "40vh" }}>
        <table>
          <thead>
            <tr>
              <th>{relatedTo === "achats" ? "Fournisseur" : "Client"}</th>
              <th>Date</th>
              <th>Total</th>
              <th>Payé</th>
              <th>Reste</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docsAffiches.map((doc) => {
              const total = getTotalDoc(doc);
              const paiementsDoc = paiementsByDoc[doc.id] || [];
              const paid = paiementsDoc.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
              const solde = total - paid;
              
              return (
                <tr key={doc.id}>
                  <td>
                    {(relatedTo === "achats" ? doc.fournisseur : doc.client) || "N/A"}
                    {((relatedTo === "achats" ? doc.telephone : doc.telephoneClient) || doc.telephone) &&
                      <div style={{ fontSize: "0.85em", color: "#39d8fa" }}>
                        <b>📞 {((relatedTo === "achats" ? doc.telephone : doc.telephoneClient) || doc.telephone)}</b>
                      </div>
                    }
                  </td>
                  <td>{doc.date?.toDate().toLocaleDateString()}</td>
                  <td>{total} DH</td>
                  <td>{paid} DH</td>
                  <td>{solde} DH</td>
                  <td>{getStatusChip(solde)}</td>
                  <td>
                    {solde > 0 && (
                      <button 
                        className="btn success" 
                        onClick={() => {
                          handleSelectDoc(doc.id);
                          setShowForm(true);
                        }}
                      >
                        Payer
                      </button>
                    )}
                    {paiementsDoc.length > 0 && (
                      <button 
                        className="btn info" 
                        onClick={() => {
                          setSelectedDoc(doc.id);
                          setShowHistorique(true);
                        }}
                      >
                        Historique
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Historique détaillé des paiements pour un document */}
      {showHistorique && selectedDoc && (
        <div className="modal-overlay" onClick={() => setShowHistorique(false)}>
          <div 
            className="paper-card" 
            style={{ 
              maxWidth: 800, 
              maxHeight: "80vh", 
              overflow: "auto", 
              margin: "50px auto", 
              background: "#213054" 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: "#fff", marginBottom: 20 }}>
              Historique des paiements - {
                documents.find(d => d.id === selectedDoc)?.[relatedTo === "achats" ? "fournisseur" : "client"]
              }
            </h3>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ color: "#7ee4e6" }}>Date</th>
                  <th style={{ color: "#7ee4e6" }}>Montant</th>
                  <th style={{ color: "#7ee4e6" }}>Mode</th>
                  <th style={{ color: "#7ee4e6" }}>Créé par</th>
                  <th style={{ color: "#7ee4e6" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(paiementsByDoc[selectedDoc] || []).map((p) => (
                  <tr key={p.id}>
                    <td style={{ color: "#e8ecf4" }}>
                      {p.date?.toDate().toLocaleString()}
                      {/* Affichage de la modification si applicable */}
                      {p.modifieLe && (
                        <div style={{ fontSize: "11px", color: "#98c4f9", marginTop: 2 }}>
                          Modifié le {p.modifieLe.toDate().toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td style={{ color: "#2bd2a6", fontWeight: "bold" }}>{p.montant} DH</td>
                    <td style={{ color: "#e8ecf4" }}>{p.mode}</td>
                    <td style={{ color: "#e8ecf4" }}>
                      <div>{getUserDisplayName(p)}</div>
                      {/* Affichage du modificateur si applicable */}
                      {p.modifieParEmail && (
                        <div style={{ fontSize: "11px", color: "#98c4f9", marginTop: 2 }}>
                          Modifié par {p.modifieParEmail.split('@')[0]}
                        </div>
                      )}
                    </td>
                    <td>
                      <button 
                        className="btn info" 
                        onClick={() => {
                          handleEditPaiement(p);
                          setShowHistorique(false);
                        }}
                      >
                        Modifier
                      </button>
                      <button 
                        className="btn danger" 
                        onClick={() => {
                          handleDeletePaiement(p);
                          setShowHistorique(false);
                        }}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button 
              className="btn" 
              style={{ marginTop: 20 }}
              onClick={() => setShowHistorique(false)}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

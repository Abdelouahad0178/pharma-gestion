// src/components/SocieteManager.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  getDocs,
  Timestamp
} from "firebase/firestore";
import { useUserRole } from "../contexts/UserRoleContext";

export default function SocieteManager() {
  const { user, societeId, role, refreshUserData } = useUserRole();
  const navigate = useNavigate();
  
  // États
  const [mode, setMode] = useState(""); // "create" ou "join"
  const [nomSociete, setNomSociete] = useState("");
  const [codeSociete, setCodeSociete] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [maSociete, setMaSociete] = useState(null);
  const [societeCreated, setSocieteCreated] = useState(false); // Pour afficher l'écran de succès après création
  const [societeJoined, setSocieteJoined] = useState(false); // Pour afficher l'écran de succès après jonction
  const [newSocieteCode, setNewSocieteCode] = useState(""); // Pour afficher le code créé
  const [newSocieteName, setNewSocieteName] = useState(""); // Pour afficher le nom de la société créée/rejointe
  const [loadingSociete, setLoadingSociete] = useState(true); // Pour le chargement initial
  
  // Logs pour debug
  const log = (message, data = null) => {
    console.log(`[SocieteManager] ${message}`, data || "");
  };

  // Charger les infos de la société actuelle
  useEffect(() => {
    const fetchSociete = async () => {
      setLoadingSociete(true);
      
      // Réinitialiser les états de création/jonction si on a déjà une société
      if (societeId) {
        setSocieteCreated(false);
        setSocieteJoined(false);
        setNewSocieteCode("");
        setNewSocieteName("");
      }
      
      if (!societeId) {
        log("Aucune société associée");
        setLoadingSociete(false);
        return;
      }
      
      try {
        log("Chargement de la société", societeId);
        const societeDoc = await getDoc(doc(db, "societes", societeId));
        
        if (societeDoc.exists()) {
          setMaSociete({ id: societeDoc.id, ...societeDoc.data() });
          log("Société chargée", societeDoc.data());
        } else {
          log("Société introuvable dans Firestore", societeId);
        }
      } catch (e) {
        log("Erreur lors du chargement de la société", e);
      } finally {
        setLoadingSociete(false);
      }
    };
    
    fetchSociete();
  }, [societeId]);

  // Générer un code unique pour la société
  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Créer une nouvelle société - LE CRÉATEUR DEVIENT AUTOMATIQUEMENT DOCTEUR
  const handleCreateSociete = async (e) => {
    e.preventDefault();
    if (!user || !nomSociete.trim()) {
      setError("Veuillez entrer un nom de société");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      log("Création d'une nouvelle société", { nom: nomSociete, createur: user.uid });
      
      // Générer un code unique
      let code = generateCode();
      let codeExists = true;
      
      // Vérifier l'unicité du code
      while (codeExists) {
        const q = query(collection(db, "societes"), where("code", "==", code));
        const snap = await getDocs(q);
        if (snap.empty) {
          codeExists = false;
        } else {
          code = generateCode();
          log("Code déjà existant, génération d'un nouveau", code);
        }
      }
      
      // Créer la société
      const societeData = {
        nom: nomSociete,
        code: code,
        createdAt: Timestamp.now(),
        createdBy: user.uid,
        membres: [user.uid],
        admin: user.uid,
        docteur: user.uid // Stocker l'ID du docteur/pharmacien
      };
      
      const societeRef = await addDoc(collection(db, "societes"), societeData);
      log("Société créée avec succès", { id: societeRef.id, code });
      
      // IMPORTANT : Mettre à jour l'utilisateur avec le rôle DOCTEUR et le societeId
      await updateDoc(doc(db, "users", user.uid), {
        societeId: societeRef.id,
        role: "docteur", // LE CRÉATEUR DEVIENT DOCTEUR
        updatedAt: Timestamp.now()
      });
      log("Utilisateur mis à jour comme DOCTEUR avec societeId", societeRef.id);
      
      // Créer les collections de base pour la société
      await initializeSocieteCollections(societeRef.id);
      
      // Rafraîchir les données du contexte
      if (refreshUserData) {
        await refreshUserData();
      }
      
      // Préparer l'affichage de l'écran de succès
      setNewSocieteCode(code);
      setNewSocieteName(nomSociete);
      setSocieteCreated(true); // Activer l'affichage de l'écran de succès
      setNomSociete("");
      setMode("");
      
    } catch (e) {
      log("Erreur lors de la création", e);
      setError("Erreur lors de la création de la société : " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Rejoindre une société existante - DEVIENT AUTOMATIQUEMENT VENDEUSE
  const handleJoinSociete = async (e) => {
    e.preventDefault();
    if (!user || !codeSociete.trim()) {
      setError("Veuillez entrer un code de société");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      log("Tentative de rejoindre une société", { code: codeSociete.toUpperCase() });
      
      // Rechercher la société par code
      const q = query(collection(db, "societes"), where("code", "==", codeSociete.toUpperCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        log("Société introuvable avec le code", codeSociete);
        throw new Error("Société introuvable. Vérifiez le code fourni par votre pharmacien.");
      }
      
      const societeDoc = snap.docs[0];
      const societeData = societeDoc.data();
      log("Société trouvée", { id: societeDoc.id, nom: societeData.nom });
      
      // Vérifier si l'utilisateur n'est pas déjà le docteur
      if (societeData.docteur === user.uid) {
        throw new Error("Vous êtes déjà le pharmacien de cette société.");
      }
      
      // Ajouter l'utilisateur aux membres si pas déjà présent
      const membres = societeData.membres || [];
      if (!membres.includes(user.uid)) {
        membres.push(user.uid);
        await updateDoc(doc(db, "societes", societeDoc.id), {
          membres: membres,
          updatedAt: Timestamp.now()
        });
        log("Utilisateur ajouté aux membres de la société");
      }
      
      // IMPORTANT : Mettre à jour l'utilisateur avec le rôle VENDEUSE et le societeId
      await updateDoc(doc(db, "users", user.uid), {
        societeId: societeDoc.id,
        role: "vendeuse", // CELUI QUI REJOINT DEVIENT VENDEUSE
        updatedAt: Timestamp.now()
      });
      log("Utilisateur mis à jour comme VENDEUSE avec societeId", societeDoc.id);
      
      // Rafraîchir les données du contexte
      if (refreshUserData) {
        await refreshUserData();
      }
      
      // Préparer l'affichage de l'écran de succès
      setNewSocieteName(societeData.nom);
      setSocieteJoined(true); // Activer l'affichage de l'écran de succès
      setCodeSociete("");
      setMode("");
      
    } catch (e) {
      log("Erreur:", e.message);
      setError(e.message || "Erreur lors de la tentative de rejoindre la société");
    } finally {
      setLoading(false);
    }
  };

  // Accéder au système après création/jonction
  const handleAccessSystem = () => {
    log("Accès au système demandé, redirection vers dashboard");
    navigate("/dashboard");
  };

  // Initialiser les collections de base pour une nouvelle société
  const initializeSocieteCollections = async (societeId) => {
    try {
      log("Initialisation des collections pour la société", societeId);
      
      // Créer un document de paramètres par défaut
      await setDoc(doc(db, "societe", societeId, "parametres", "general"), {
        entete: nomSociete || "Pharmacie",
        pied: "Merci pour votre confiance",
        createdAt: Timestamp.now()
      });
      
      // Créer un premier produit dans le stock pour initialiser la collection
      await addDoc(collection(db, "societe", societeId, "stock"), {
        nom: "Paracétamol 500mg",
        quantite:10,
        prixAchat: 50,
        prixVente: 100,
        seuil: 20,
        datePeremption: "",
        createdAt: Timestamp.now()
      });
      
      log("Collections initialisées avec succès");
    } catch (e) {
      log("Erreur lors de l'initialisation des collections", e);
    }
  };

  // Quitter la société actuelle
  const handleQuitSociete = async () => {
    if (role === "docteur") {
      alert("⚠️ En tant que pharmacien créateur, vous ne pouvez pas quitter la société. Vous devez d'abord transférer vos droits d'administration.");
      return;
    }
    
    if (!window.confirm("Êtes-vous sûr de vouloir quitter cette société ? Vous perdrez l'accès à toutes les données.")) return;
    
    setLoading(true);
    try {
      log("Quitter la société", societeId);
      
      // Retirer l'utilisateur des membres
      if (maSociete && maSociete.membres) {
        const nouveauxMembres = maSociete.membres.filter(m => m !== user.uid);
        await updateDoc(doc(db, "societes", societeId), {
          membres: nouveauxMembres,
          updatedAt: Timestamp.now()
        });
      }
      
      // Retirer le societeId de l'utilisateur et réinitialiser le rôle
      await updateDoc(doc(db, "users", user.uid), {
        societeId: null,
        role: null, // Réinitialiser le rôle
        updatedAt: Timestamp.now()
      });
      
      log("Société quittée avec succès");
      setMaSociete(null);
      
      // Rafraîchir le contexte
      if (refreshUserData) {
        await refreshUserData();
      }
      
      // Réinitialiser les états
      setSocieteCreated(false);
      setSocieteJoined(false);
      setNewSocieteCode("");
      setNewSocieteName("");
      
    } catch (e) {
      log("Erreur lors de la sortie de la société", e);
      setError("Erreur lors de la sortie de la société");
    } finally {
      setLoading(false);
    }
  };

  // Déconnexion
  const handleLogout = () => {
    navigate("/login");
  };

  // Si pas d'utilisateur connecté
  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#a32" }}>
        Veuillez vous connecter pour gérer les sociétés.
      </div>
    );
  }

  // Si en cours de chargement
  if (loadingSociete) {
    return (
      <div style={{ 
        padding: 50, 
        textAlign: "center", 
        color: "#7ee4e6",
        fontSize: "1.2em"
      }}>
        Chargement des informations de société...
      </div>
    );
  }

  // ÉCRAN DE SUCCÈS après création (Pharmacien) - S'affiche SEULEMENT juste après la création
  if (societeCreated && newSocieteCode && !societeId) {
    return (
      <div className="fullscreen-table-wrap">
        <div className="fullscreen-table-title">🎉 Société Créée avec Succès !</div>
        <div className="paper-card" style={{ 
          maxWidth: 600, 
          margin: "30px auto",
          textAlign: "center",
          background: "linear-gradient(135deg, #1a3a2a 0%, #2a5a3a 100%)"
        }}>
          <div style={{ 
            fontSize: "2em", 
            marginBottom: 20,
            animation: "pulse 2s infinite"
          }}>
            ✨🏥✨
          </div>
          
          <h2 style={{ color: "#7ee4e6", marginBottom: 30 }}>
            Félicitations, Docteur !
          </h2>
          
          <p style={{ 
            color: "#e8ecf4", 
            fontSize: "1.1em", 
            marginBottom: 30,
            lineHeight: 1.6
          }}>
            Votre pharmacie "{newSocieteName}" a été créée avec succès.<br/>
            Vous êtes maintenant <strong>Pharmacien Administrateur</strong>.
          </p>
          
          {/* Code de la société */}
          <div style={{ 
            background: "#0a2a1a", 
            borderRadius: 15, 
            padding: 25, 
            marginBottom: 30,
            border: "2px solid #3a7a4a"
          }}>
            <p style={{ color: "#98c4f9", marginBottom: 15 }}>
              Code de votre société à partager avec vos vendeuses :
            </p>
            <div style={{ 
              fontSize: "2.5em", 
              fontWeight: 800,
              color: "#7ee4e6",
              letterSpacing: "0.2em",
              padding: "15px",
              background: "#1a3a2a",
              borderRadius: 10,
              border: "2px dashed #7ee4e6"
            }}>
              {newSocieteCode}
            </div>
            <p style={{ 
              color: "#98c4f9", 
              marginTop: 15,
              fontSize: "0.9em"
            }}>
              📋 Gardez ce code précieusement et partagez-le avec votre équipe
            </p>
          </div>
          
          {/* Bouton d'accès au système */}
          <button 
            className="btn"
            onClick={handleAccessSystem}
            style={{
              fontSize: "1.5em",
              padding: "20px 60px",
              background: "linear-gradient(90deg, #2d8a2d 0%, #4aca4a 100%)",
              boxShadow: "0 6px 30px #2d8a2d60",
              transform: "scale(1)",
              transition: "all 0.3s",
              borderRadius: 15,
              fontWeight: 700,
              letterSpacing: "0.05em"
            }}
            onMouseOver={e => {
              e.target.style.transform = "scale(1.1)";
              e.target.style.boxShadow = "0 8px 40px #2d8a2d80";
            }}
            onMouseOut={e => {
              e.target.style.transform = "scale(1)";
              e.target.style.boxShadow = "0 6px 30px #2d8a2d60";
            }}
          >
            🚀 ACCÉDER AU SYSTÈME DE GESTION
          </button>
          
          <p style={{ 
            color: "#7ee4e6", 
            marginTop: 20,
            fontSize: "0.95em"
          }}>
            Cliquez pour commencer à gérer votre pharmacie
          </p>
        </div>
        
        <style jsx>{`
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  // ÉCRAN DE SUCCÈS après jonction (Vendeuse) - S'affiche SEULEMENT juste après la jonction
  if (societeJoined && newSocieteName && !societeId) {
    return (
      <div className="fullscreen-table-wrap">
        <div className="fullscreen-table-title">✅ Bienvenue dans la Société !</div>
        <div className="paper-card" style={{ 
          maxWidth: 600, 
          margin: "30px auto",
          textAlign: "center",
          background: "linear-gradient(135deg, #2a3a4a 0%, #3a4a5a 100%)"
        }}>
          <div style={{ 
            fontSize: "2em", 
            marginBottom: 20,
            animation: "pulse 2s infinite"
          }}>
            👩‍💼🎯✨
          </div>
          
          <h2 style={{ color: "#7ee4e6", marginBottom: 30 }}>
            Bienvenue dans l'équipe !
          </h2>
          
          <p style={{ 
            color: "#e8ecf4", 
            fontSize: "1.2em", 
            marginBottom: 30,
            lineHeight: 1.6
          }}>
            Vous avez rejoint avec succès la société<br/>
            <strong style={{ color: "#7ee4e6", fontSize: "1.3em" }}>
              "{newSocieteName}"
            </strong>
          </p>
          
          {/* Informations sur le rôle */}
          <div style={{ 
            background: "#1a2a3a", 
            borderRadius: 15, 
            padding: 25, 
            marginBottom: 30,
            border: "2px solid #4a5a6a"
          }}>
            <p style={{ color: "#98c4f9", marginBottom: 15 }}>
              Votre rôle dans la société :
            </p>
            <div style={{ 
              fontSize: "1.8em", 
              fontWeight: 700,
              color: "#e8ecf4",
              padding: "10px",
              background: "#2a3a4a",
              borderRadius: 10
            }}>
              👩‍💼 VENDEUSE
            </div>
            <div style={{ 
              marginTop: 20,
              textAlign: "left",
              color: "#e8ecf4"
            }}>
              <p style={{ marginBottom: 10, fontWeight: 600 }}>
                Vos accès :
              </p>
              <ul style={{ marginLeft: 20, fontSize: "0.95em" }}>
                <li>✅ Enregistrement des ventes</li>
                <li>✅ Consultation du stock</li>
                <li>✅ Création de devis clients</li>
                <li>✅ Suivi des paiements</li>
              </ul>
            </div>
          </div>
          
          {/* Bouton d'accès au système */}
          <button 
            className="btn"
            onClick={handleAccessSystem}
            style={{
              fontSize: "1.5em",
              padding: "20px 60px",
              background: "linear-gradient(90deg, #3272e0 0%, #61c7ef 100%)",
              boxShadow: "0 6px 30px #3272e060",
              transform: "scale(1)",
              transition: "all 0.3s",
              borderRadius: 15,
              fontWeight: 700,
              letterSpacing: "0.05em"
            }}
            onMouseOver={e => {
              e.target.style.transform = "scale(1.1)";
              e.target.style.boxShadow = "0 8px 40px #3272e080";
            }}
            onMouseOut={e => {
              e.target.style.transform = "scale(1)";
              e.target.style.boxShadow = "0 6px 30px #3272e060";
            }}
          >
            🚀 ACCÉDER AU SYSTÈME DE VENTE
          </button>
          
          <p style={{ 
            color: "#7ee4e6", 
            marginTop: 20,
            fontSize: "0.95em"
          }}>
            Cliquez pour commencer votre travail
          </p>
        </div>
        
        <style jsx>{`
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  // Si l'utilisateur a DÉJÀ une société (retour après navigation)
  if (societeId && maSociete) {
    return (
      <div className="fullscreen-table-wrap">
        <div className="fullscreen-table-title">Ma Société</div>
        <div className="paper-card" style={{ maxWidth: 600, margin: "30px auto" }}>
          <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>{maSociete.nom}</h3>
          
          {/* Bouton d'accès au système - toujours visible */}
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <button 
              className="btn"
              onClick={handleAccessSystem}
              style={{
                fontSize: "1.3em",
                padding: "15px 40px",
                background: "linear-gradient(90deg, #2d8a2d 50%, #4aca4a 100%)",
                boxShadow: "0 4px 20px #2d8a2d40",
                transform: "scale(1.05)",
                transition: "all 0.3s"
              }}
              onMouseOver={e => e.target.style.transform = "scale(1.1)"}
              onMouseOut={e => e.target.style.transform = "scale(1.05)"}
            >
              🚀 ACCÉDER AU SYSTÈME
            </button>
          </div>
          
          {/* Informations principales */}
          <div style={{ 
            background: "#1a2b45", 
            borderRadius: 10, 
            padding: 20, 
            marginBottom: 20 
          }}>
            <div style={{ marginBottom: 15 }}>
              <strong style={{ color: "#98c4f9" }}>Code de la société :</strong>
              <span style={{ 
                marginLeft: 10, 
                padding: "8px 20px", 
                background: "#2d3d56", 
                borderRadius: 8,
                fontSize: "1.4em",
                fontWeight: 700,
                color: "#7ee4e6",
                letterSpacing: "0.15em",
                display: "inline-block",
                marginTop: 5
              }}>
                {maSociete.code}
              </span>
            </div>
            
            {role === "docteur" && (
              <div style={{ 
                marginTop: 15, 
                padding: 15, 
                background: "#253a5e", 
                borderRadius: 8,
                border: "1px solid #3a5580"
              }}>
                <p style={{ color: "#98c4f9", marginBottom: 10, fontSize: "0.95em" }}>
                  📋 <strong>Instructions pour ajouter des vendeuses :</strong>
                </p>
                <ol style={{ color: "#e8ecf4", marginLeft: 20, fontSize: "0.9em" }}>
                  <li>Demandez à la vendeuse de créer un compte sur l'application</li>
                  <li>Communiquez-lui le code ci-dessus</li>
                  <li>Elle pourra rejoindre votre société avec ce code</li>
                  <li>Elle aura automatiquement le rôle "Vendeuse"</li>
                </ol>
              </div>
            )}
          </div>

          {/* Informations sur le rôle */}
          <div style={{ 
            background: role === "docteur" ? "#1a3a2a" : "#2a3a4a", 
            borderRadius: 10, 
            padding: 15, 
            marginBottom: 20 
          }}>
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: "#98c4f9" }}>Votre rôle :</strong>
              <span style={{ 
                marginLeft: 10, 
                color: role === "docteur" ? "#7ee4e6" : "#e8ecf4",
                fontWeight: 700,
                fontSize: "1.1em"
              }}>
                {role === "docteur" ? "👨‍⚕️ Pharmacien (Administrateur)" : "👩‍💼 Vendeuse"}
              </span>
            </div>
            
            <div style={{ marginBottom: 10 }}>
              <strong style={{ color: "#98c4f9" }}>Membres de la société :</strong>
              <span style={{ marginLeft: 10, color: "#e8ecf4" }}>
                {maSociete.membres ? maSociete.membres.length : 0} personne(s)
              </span>
            </div>
            
            {role === "docteur" && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ color: "#98c4f9" }}>Statut :</strong>
                <span style={{ marginLeft: 10, color: "#7ee4e6" }}>
                  Créateur et administrateur
                </span>
              </div>
            )}
          </div>

          {/* Permissions selon le rôle */}
          <div style={{ 
            background: "#1a2b45", 
            borderRadius: 10, 
            padding: 15,
            marginBottom: 20
          }}>
            <strong style={{ color: "#98c4f9", display: "block", marginBottom: 10 }}>
              Vos permissions :
            </strong>
            <ul style={{ color: "#e8ecf4", marginLeft: 20, fontSize: "0.9em" }}>
              {role === "docteur" ? (
                <>
                  <li>✅ Accès complet à tous les modules</li>
                  <li>✅ Gestion des achats et fournisseurs</li>
                  <li>✅ Gestion des ventes</li>
                  <li>✅ Gestion complète du stock</li>
                  <li>✅ Paramètres de la société</li>
                  <li>✅ Création de devis et factures</li>
                  <li>✅ Gestion des paiements</li>
                </>
              ) : (
                <>
                  <li>✅ Enregistrement des ventes</li>
                  <li>✅ Consultation du stock</li>
                  <li>✅ Création de devis pour les clients</li>
                  <li>✅ Consultation des paiements clients</li>
                  <li>❌ Pas d'accès aux achats</li>
                  <li>❌ Pas d'accès aux paramètres</li>
                </>
              )}
            </ul>
          </div>
          
          {/* Bouton de déconnexion */}
          <div style={{ textAlign: "center", marginTop: 30 }}>
            <button 
              className="btn danger" 
              onClick={handleLogout}
              style={{ 
                padding: "12px 30px",
                fontSize: "1.1em"
              }}
            >
              🚪 Se déconnecter du système
            </button>
            <p style={{ 
              color: "#98c4f9", 
              marginTop: 10,
              fontSize: "0.85em"
            }}>
              Pour sortir complètement, utilisez ce bouton
            </p>
          </div>
          
          {/* Option pour quitter la société (seulement pour les vendeuses) */}
          {role === "vendeuse" && (
            <div style={{ 
              marginTop: 30, 
              padding: 15, 
              background: "#2a1a1a", 
              borderRadius: 8,
              border: "1px solid #4a3030",
              textAlign: "center"
            }}>
              <button 
                className="btn danger" 
                onClick={handleQuitSociete}
                disabled={loading}
                style={{ width: "100%" }}
              >
                {loading ? "Traitement..." : "⚠️ Quitter définitivement cette société"}
              </button>
              <p style={{ 
                color: "#f99898", 
                fontSize: "0.85em", 
                marginTop: 10 
              }}>
                Attention : Vous perdrez l'accès à toutes les données
              </p>
            </div>
          )}
          
          {role === "docteur" && (
            <div style={{ 
              marginTop: 30, 
              padding: 15, 
              background: "#2a1a1a", 
              borderRadius: 8,
              border: "1px solid #4a3030",
              textAlign: "center"
            }}>
              <p style={{ color: "#f99898", fontSize: "0.9em", margin: 0 }}>
                ⚠️ En tant que créateur, vous ne pouvez pas quitter cette société
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Si pas encore dans une société - Afficher les formulaires de création/jonction
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion de la Société</div>
      
      {/* Messages d'erreur */}
      {error && (
        <div className="status-chip danger" style={{ 
          margin: "20px auto", 
          maxWidth: 500,
          padding: "15px 20px",
          fontSize: "1em"
        }}>
          ❌ {error}
        </div>
      )}
      
      {/* Choix du mode */}
      {!mode && (
        <div className="paper-card" style={{ maxWidth: 600, margin: "50px auto", textAlign: "center" }}>
          <h3 style={{ color: "#7ee4e6", marginBottom: 30 }}>
            Bienvenue dans le système de gestion multi-sociétés
          </h3>
          
          <div style={{ 
            background: "#1a2b45", 
            borderRadius: 10, 
            padding: 20, 
            marginBottom: 30,
            textAlign: "left"
          }}>
            <h4 style={{ color: "#98c4f9", marginBottom: 15 }}>Comment ça fonctionne ?</h4>
            <div style={{ color: "#e8ecf4", fontSize: "0.95em" }}>
              <div style={{ marginBottom: 15 }}>
                <strong style={{ color: "#7ee4e6" }}>👨‍⚕️ Si vous êtes Pharmacien :</strong>
                <ul style={{ marginTop: 5, marginLeft: 20 }}>
                  <li>Créez une nouvelle société</li>
                  <li>Vous deviendrez automatiquement administrateur</li>
                  <li>Vous aurez accès à tous les modules</li>
                  <li>Partagez le code avec vos vendeuses</li>
                </ul>
              </div>
              
              <div>
                <strong style={{ color: "#7ee4e6" }}>👩‍💼 Si vous êtes Vendeuse :</strong>
                <ul style={{ marginTop: 5, marginLeft: 20 }}>
                  <li>Demandez le code à votre pharmacien</li>
                  <li>Rejoignez la société avec ce code</li>
                  <li>Vous aurez accès aux modules de vente</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
            <button 
              className="btn" 
              onClick={() => setMode("create")}
              style={{ 
                minWidth: 200,
                padding: "12px 20px",
                fontSize: "1.1em",
                background: "linear-gradient(90deg, #2d5a2d 50%, #4a8a4a 100%)"
              }}
            >
              👨‍⚕️ Je suis Pharmacien<br/>
              <small style={{ fontSize: "0.8em", opacity: 0.9 }}>Créer une société</small>
            </button>
            <button 
              className="btn info" 
              onClick={() => setMode("join")}
              style={{ 
                minWidth: 200,
                padding: "12px 20px",
                fontSize: "1.1em"
              }}
            >
              👩‍💼 Je suis Vendeuse<br/>
              <small style={{ fontSize: "0.8em", opacity: 0.9 }}>Rejoindre avec un code</small>
            </button>
          </div>
        </div>
      )}
      
      {/* Formulaire de création (Pharmacien) */}
      {mode === "create" && (
        <div className="paper-card" style={{ maxWidth: 500, margin: "30px auto" }}>
          <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
            👨‍⚕️ Créer une nouvelle société (Pharmacien)
          </h3>
          
          <div style={{ 
            background: "#1a3a2a", 
            borderRadius: 8, 
            padding: 15, 
            marginBottom: 20,
            border: "1px solid #2a5a3a"
          }}>
            <p style={{ color: "#98c4f9", margin: 0, fontSize: "0.95em" }}>
              ✅ En créant une société, vous deviendrez automatiquement <strong>Pharmacien Administrateur</strong> avec accès complet à tous les modules.
            </p>
          </div>
          
          <form onSubmit={handleCreateSociete}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, color: "#98c4f9" }}>
                Nom de votre pharmacie
              </label>
              <input
                type="text"
                value={nomSociete}
                onChange={(e) => setNomSociete(e.target.value)}
                placeholder="Ex: Pharmacie Centrale"
                required
                style={{ width: "100%" }}
                disabled={loading}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? "Création en cours..." : "Créer ma société"}
              </button>
              <button 
                type="button" 
                className="btn danger" 
                onClick={() => { setMode(""); setError(""); }}
                disabled={loading}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Formulaire pour rejoindre (Vendeuse) */}
      {mode === "join" && (
        <div className="paper-card" style={{ maxWidth: 500, margin: "30px auto" }}>
          <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
            👩‍💼 Rejoindre une société existante (Vendeuse)
          </h3>
          
          <div style={{ 
            background: "#2a3a4a", 
            borderRadius: 8, 
            padding: 15, 
            marginBottom: 20,
            border: "1px solid #3a4a5a"
          }}>
            <p style={{ color: "#98c4f9", margin: 0, fontSize: "0.95em" }}>
              ℹ️ En rejoignant une société, vous aurez le rôle de <strong>Vendeuse</strong> avec accès aux modules de vente et consultation du stock.
            </p>
          </div>
          
          <form onSubmit={handleJoinSociete}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, color: "#98c4f9" }}>
                Code de la société (fourni par votre pharmacien)
              </label>
              <input
                type="text"
                value={codeSociete}
                onChange={(e) => setCodeSociete(e.target.value.toUpperCase())}
                placeholder="Ex: ABC123"
                required
                style={{ 
                  width: "100%", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.2em",
                  fontSize: "1.2em",
                  fontWeight: 700,
                  textAlign: "center"
                }}
                maxLength={6}
                disabled={loading}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Ce code vous a été communiqué par votre pharmacien
              </small>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? "Vérification..." : "Rejoindre la société"}
              </button>
              <button 
                type="button" 
                className="btn danger" 
                onClick={() => { setMode(""); setError(""); }}
                disabled={loading}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
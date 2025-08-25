// src/components/invitations/Invitations.js
import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function Invitations() {
  const { user, societeId, isOwner, societeName } = useUserRole();
  
  // États
  const [invitationCode, setInvitationCode] = useState("");
  const [societeInfo, setSocieteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // États pour rejoindre une société (si pas de société)
  const [joinCode, setJoinCode] = useState("");
  const [joiningLoading, setJoiningLoading] = useState(false);

  // Charger les informations de la société
  const fetchSocieteInfo = async () => {
    if (!societeId) {
      setLoading(false);
      return;
    }

    try {
      // Charger info société
      const societeRef = doc(db, "societe", societeId);
      const societeSnap = await getDoc(societeRef);
      
      if (societeSnap.exists()) {
        const data = societeSnap.data();
        setSocieteInfo(data);
        setInvitationCode(data.invitationCode || "");
      }
    } catch (error) {
      console.error("Erreur chargement société:", error);
      setError("Erreur lors du chargement des informations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSocieteInfo();
  }, [societeId]);

  // Générer un nouveau code d'invitation
  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Régénérer le code d'invitation
  const handleGenerateNewCode = async () => {
    if (!isOwner || !societeId) {
      setError("Seul le propriétaire peut régénérer le code d'invitation");
      return;
    }

    setError("");
    setSuccess("");

    try {
      // Générer nouveau code unique
      let newCode;
      let attempts = 0;
      do {
        newCode = generateCode();
        attempts++;
        
        // Vérifier unicité
        const q = query(collection(db, "societe"), where("invitationCode", "==", newCode));
        const snap = await getDocs(q);
        if (snap.empty) break;
      } while (attempts < 10);

      if (attempts >= 10) {
        setError("Impossible de générer un code unique. Réessayez plus tard.");
        return;
      }

      // Mettre à jour en base
      await updateDoc(doc(db, "societe", societeId), {
        invitationCode: newCode,
        invitationCodeUpdatedAt: serverTimestamp(),
        invitationCodeUpdatedBy: user.uid
      });

      // Log de l'activité
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "invitation_code_regenerated",
        userId: user.uid,
        userEmail: user.email,
        oldCode: invitationCode,
        newCode: newCode,
        timestamp: serverTimestamp()
      });

      setInvitationCode(newCode);
      setSuccess("Nouveau code d'invitation généré avec succès !");
      
      // Recharger les infos
      fetchSocieteInfo();
    } catch (error) {
      console.error("Erreur génération code:", error);
      setError("Erreur lors de la génération du nouveau code");
    }
  };

  // Rejoindre une société avec un code (pour les utilisateurs sans société)
  const handleJoinSociete = async (e) => {
    e.preventDefault();
    
    if (!user || !joinCode.trim()) {
      setError("Veuillez saisir un code d'invitation");
      return;
    }

    const code = joinCode.toUpperCase().trim();
    
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError("Format de code invalide (6 caractères alphanumériques)");
      return;
    }

    setJoiningLoading(true);
    setError("");
    setSuccess("");

    try {
      // Chercher la société par code
      const q = query(collection(db, "societe"), where("invitationCode", "==", code));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError("Code d'invitation invalide ou expiré");
        setJoiningLoading(false);
        return;
      }

      const societeDoc = snap.docs[0];
      const societeData = societeDoc.data();
      const newSocieteId = societeDoc.id;

      // Mettre à jour l'utilisateur
      await updateDoc(doc(db, "users", user.uid), {
        societeId: newSocieteId,
        role: "vendeuse", // Rôle par défaut pour les invités
        joinedAt: serverTimestamp(),
        invitedBy: societeData.ownerId || societeData.createdBy
      });

      // Ajouter aux membres de la société
      const currentMembers = societeData.membres || [];
      if (!currentMembers.includes(user.uid)) {
        await updateDoc(doc(db, "societe", newSocieteId), {
          membres: [...currentMembers, user.uid]
        });
      }

      // Log de l'activité
      await addDoc(collection(db, "societe", newSocieteId, "activities"), {
        type: "member_joined_with_code",
        userId: user.uid,
        userEmail: user.email,
        invitationCode: code,
        timestamp: serverTimestamp()
      });

      setSuccess(`Vous avez rejoint la pharmacie "${societeData.nom}" avec succès !`);
      setJoinCode("");
      
      // Recharger la page après un délai pour actualiser le contexte
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error("Erreur rejoindre société:", error);
      setError("Erreur lors de la tentative de rejoindre la pharmacie");
    } finally {
      setJoiningLoading(false);
    }
  };

  // Copier le code dans le presse-papier
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(invitationCode);
      setSuccess("Code copié dans le presse-papier !");
      setTimeout(() => setSuccess(""), 2000);
    } catch (error) {
      // Fallback pour les navigateurs qui ne supportent pas l'API
      const textArea = document.createElement("textarea");
      textArea.value = invitationCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setSuccess("Code copié !");
      setTimeout(() => setSuccess(""), 2000);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: "center" }}>
        Chargement...
      </div>
    );
  }

  // Si l'utilisateur n'a pas de société
  if (!societeId) {
    return (
      <div className="fullscreen-table-wrap">
        <div className="fullscreen-table-title">Rejoindre une pharmacie</div>
        
        {error && (
          <div style={{
            padding: "12px 20px",
            background: "#fee2e2",
            color: "#dc2626",
            borderRadius: "6px",
            margin: "10px 0"
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: "12px 20px",
            background: "#dcfce7",
            color: "#16a34a",
            borderRadius: "6px",
            margin: "10px 0"
          }}>
            {success}
          </div>
        )}

        <div className="paper-card" style={{ maxWidth: 500, margin: "20px auto" }}>
          <h3 style={{ color: "#1f2937", marginBottom: "20px" }}>
            Vous n'êtes rattaché à aucune pharmacie
          </h3>
          
          <p style={{ color: "#6b7280", marginBottom: "25px" }}>
            Pour accéder aux fonctionnalités, vous devez rejoindre une pharmacie 
            en utilisant le code d'invitation fourni par le propriétaire.
          </p>

          <form onSubmit={handleJoinSociete}>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ 
                display: "block", 
                fontSize: "14px", 
                color: "#374151", 
                marginBottom: "8px",
                fontWeight: "600"
              }}>
                Code d'invitation (6 caractères)
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Ex: ABC123"
                maxLength={6}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "2px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "16px",
                  textAlign: "center",
                  letterSpacing: "4px",
                  fontWeight: "bold",
                  textTransform: "uppercase"
                }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={joiningLoading}
              className="btn"
              style={{ 
                width: "100%", 
                background: "linear-gradient(90deg, #059669 0%, #34d399 100%)",
                fontSize: "16px"
              }}
            >
              {joiningLoading ? "Vérification..." : "Rejoindre la pharmacie"}
            </button>
          </form>

          <div style={{ 
            marginTop: "20px", 
            padding: "15px", 
            background: "#f0f9ff", 
            borderRadius: "6px",
            border: "1px solid #bae6fd"
          }}>
            <h4 style={{ color: "#0369a1", margin: "0 0 8px 0", fontSize: "14px" }}>
              Comment obtenir un code d'invitation ?
            </h4>
            <p style={{ color: "#0c4a6e", margin: 0, fontSize: "13px" }}>
              Demandez au propriétaire de votre pharmacie de vous fournir le code 
              d'invitation depuis son interface d'administration.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Interface pour les utilisateurs avec société
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">
        Invitations - {societeName || "Pharmacie"}
      </div>

      {error && (
        <div style={{
          padding: "12px 20px",
          background: "#fee2e2",
          color: "#dc2626",
          borderRadius: "6px",
          margin: "10px 0"
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: "12px 20px",
          background: "#dcfce7",
          color: "#16a34a",
          borderRadius: "6px",
          margin: "10px 0"
        }}>
          {success}
        </div>
      )}

      {/* Code d'invitation actuel */}
      <div className="paper-card">
        <h3 style={{ color: "#e2e7edff", marginBottom: "15px" }}>
          Code d'invitation de votre pharmacie
        </h3>
        
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "15px",
          padding: "20px",
          background: "#f8fafc",
          borderRadius: "8px",
          border: "2px solid #e2e8f0"
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: "32px",
              fontWeight: "bold",
              color: "#2563eb",
              letterSpacing: "8px",
              textAlign: "center",
              background: "white",
              padding: "15px",
              borderRadius: "8px",
              border: "2px solid #dbeafe",
              fontFamily: "monospace"
            }}>
              {invitationCode || "Aucun code"}
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              onClick={handleCopyCode}
              className="btn success"
              style={{ minWidth: "120px" }}
              disabled={!invitationCode}
            >
              Copier le code
            </button>
            
            {isOwner && (
              <button
                onClick={handleGenerateNewCode}
                className="btn"
                style={{ 
                  minWidth: "120px",
                  background: "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)"
                }}
              >
                Nouveau code
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: "15px", color: "#e7eaf0ff", fontSize: "14px" }}>
          {isOwner ? (
            <p>
              Partagez ce code avec vos employés pour qu'ils puissent rejoindre votre pharmacie.
              En tant que propriétaire, vous pouvez générer un nouveau code à tout moment.
            </p>
          ) : (
            <p>
              Ce code permet aux nouveaux employés de rejoindre votre pharmacie.
              Seul le propriétaire peut générer un nouveau code.
            </p>
          )}
        </div>
      </div>

      {/* Informations de la société */}
      {societeInfo && (
        <div className="paper-card">
          <h3 style={{ color: "#d6dee9ff", marginBottom: "15px" }}>
            Informations de la pharmacie
          </h3>
          
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
            gap: "15px" 
          }}>
            <div>
              <strong style={{ color: "#f8fafcff" }}>Nom :</strong>
              <p style={{ margin: "5px 0 0 0", color: "#6b7280" }}>{societeInfo.nom}</p>
            </div>
            
            <div>
              <strong style={{ color: "#eaedf1ff" }}>Adresse :</strong>
              <p style={{ margin: "5px 0 0 0", color: "#6b7280" }}>{societeInfo.adresse}</p>
            </div>
            
            {societeInfo.telephone && (
              <div>
                <strong style={{ color: "#374151" }}>Téléphone :</strong>
                <p style={{ margin: "5px 0 0 0", color: "#6b7280" }}>{societeInfo.telephone}</p>
              </div>
            )}
            
            <div>
              <strong style={{ color: "#f1f4f8ff" }}>Créée le :</strong>
              <p style={{ margin: "5px 0 0 0", color: "#6b7280" }}>
                {societeInfo.createdAt?.toDate?.()?.toLocaleDateString?.() || "N/A"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Instructions d'utilisation */}
      <div style={{
        background: "#f0f9ff",
        padding: "20px",
        borderRadius: "8px",
        border: "1px solid #bae6fd",
        marginTop: "20px"
      }}>
        <h4 style={{ color: "#0369a1", margin: "0 0 10px 0" }}>
          Comment inviter de nouveaux employés :
        </h4>
        <ol style={{ color: "#0c4a6e", paddingLeft: "20px" }}>
          <li>Partagez le code d'invitation ci-dessus avec la personne</li>
          <li>Elle doit créer un compte sur la page d'inscription</li>
          <li>Choisir "Rejoindre avec un code d'invitation"</li>
          <li>Saisir le code d'invitation dans le formulaire</li>
          <li>Elle rejoindra automatiquement votre pharmacie en tant que vendeuse</li>
          <li>Vous pourrez ensuite modifier son rôle si nécessaire depuis "Gestion Utilisateurs"</li>
        </ol>
      </div>
    </div>
  );
}
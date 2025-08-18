import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  Timestamp
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

// Fonction pour générer un code d'invitation unique
const generateInvitationCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function GestionInvitations() {
  const { role, loading, societeId, user } = useUserRole();
  const [invitations, setInvitations] = useState([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form d'invitation
  const [emailInvite, setEmailInvite] = useState("");
  const [roleInvite, setRoleInvite] = useState("vendeuse");
  const [noteInvite, setNoteInvite] = useState("");

  // Charger les invitations de la société
  const fetchInvitations = async () => {
    if (!societeId) {
      setInvitations([]);
      setLoadingInvitations(false);
      return;
    }
    
    try {
      setLoadingInvitations(true);
      const q = query(collection(db, "invitations"), where("societeId", "==", societeId));
      const snap = await getDocs(q);
      let arr = [];
      snap.forEach((doc) => {
        const data = doc.data();
        arr.push({ 
          id: doc.id, 
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt),
          usedAt: data.usedAt?.toDate ? data.usedAt.toDate() : null
        });
      });
      
      // Trier par date de création (plus récentes en premier)
      arr.sort((a, b) => b.createdAt - a.createdAt);
      
      setInvitations(arr);
    } catch (error) {
      console.error("Erreur lors du chargement des invitations:", error);
      setInvitations([]);
    } finally {
      setLoadingInvitations(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [societeId]);

  // Créer une nouvelle invitation
  const createInvitation = async (e) => {
    e.preventDefault();
    if (!emailInvite || !societeId) return;

    // Vérifier si une invitation active existe déjà pour cet email
    const existingInvitation = invitations.find(inv => 
      inv.emailInvite === emailInvite && 
      inv.status === "pending" && 
      inv.expiresAt > new Date()
    );

    if (existingInvitation) {
      alert("Une invitation active existe déjà pour cet email !");
      return;
    }

    try {
      setCreating(true);
      
      const code = generateInvitationCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expire dans 7 jours

      await addDoc(collection(db, "invitations"), {
        code,
        emailInvite,
        roleInvite,
        noteInvite,
        societeId,
        status: "pending", // pending, used, expired, cancelled
        createdAt: Timestamp.now(),
        createdBy: user?.email || "Inconnu",
        expiresAt: Timestamp.fromDate(expiresAt),
        usedAt: null,
        usedBy: null
      });

      // Reset form
      setEmailInvite("");
      setRoleInvite("vendeuse");
      setNoteInvite("");
      
      await fetchInvitations();
      alert(`Invitation créée avec succès !\n\nCode d'invitation : ${code}\n\nPartagez ce code avec ${emailInvite}`);
      
    } catch (error) {
      console.error("Erreur lors de la création de l'invitation:", error);
      alert("Erreur lors de la création de l'invitation.");
    } finally {
      setCreating(false);
    }
  };

  // Annuler une invitation
  const cancelInvitation = async (invitationId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir annuler cette invitation ?")) return;

    try {
      await updateDoc(doc(db, "invitations", invitationId), {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        cancelledBy: user?.email || "Inconnu"
      });
      
      await fetchInvitations();
      alert("Invitation annulée avec succès !");
      
    } catch (error) {
      console.error("Erreur lors de l'annulation:", error);
      alert("Erreur lors de l'annulation de l'invitation.");
    }
  };

  // Renouveler une invitation expirée
  const renewInvitation = async (invitation) => {
    if (!window.confirm("Renouveler cette invitation avec un nouveau code ?")) return;

    try {
      const newCode = generateInvitationCode();
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 7);

      await updateDoc(doc(db, "invitations", invitation.id), {
        code: newCode,
        status: "pending",
        expiresAt: Timestamp.fromDate(newExpiresAt),
        renewedAt: Timestamp.now(),
        renewedBy: user?.email || "Inconnu"
      });
      
      await fetchInvitations();
      alert(`Invitation renouvelée !\n\nNouveau code : ${newCode}`);
      
    } catch (error) {
      console.error("Erreur lors du renouvellement:", error);
      alert("Erreur lors du renouvellement de l'invitation.");
    }
  };

  // Supprimer définitivement une invitation
  const deleteInvitation = async (invitationId) => {
    if (!window.confirm("Supprimer définitivement cette invitation ? Cette action est irréversible.")) return;

    try {
      await deleteDoc(doc(db, "invitations", invitationId));
      await fetchInvitations();
      alert("Invitation supprimée définitivement.");
      
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert("Erreur lors de la suppression de l'invitation.");
    }
  };

  // Copier le code dans le presse-papier
  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      alert("Code copié dans le presse-papier !");
    } catch (err) {
      console.error("Erreur lors de la copie:", err);
      // Fallback pour les navigateurs qui ne supportent pas clipboard
      const textArea = document.createElement("textarea");
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert("Code copié !");
    }
  };

  // Statut en badge coloré
  const getStatusBadge = (invitation) => {
    const now = new Date();
    
    if (invitation.status === "used") {
      return <span className="status-chip success">✅ Utilisée</span>;
    }
    if (invitation.status === "cancelled") {
      return <span className="status-chip danger">❌ Annulée</span>;
    }
    if (invitation.expiresAt < now) {
      return <span className="status-chip danger">⏰ Expirée</span>;
    }
    if (invitation.status === "pending") {
      return <span className="status-chip info">⏳ En attente</span>;
    }
    
    return <span className="status-chip">❓ Inconnu</span>;
  };

  // Vérifications d'accès
  if (loading) {
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

  if (role !== "docteur") {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#bc3453" }}>
        Accès refusé : Seuls les docteurs peuvent gérer les invitations.
      </div>
    );
  }

  if (!societeId) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#bc3453" }}>
        Aucune société associée. Contactez l'administrateur.
      </div>
    );
  }

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Invitations</div>
      
      {/* Formulaire de création d'invitation */}
      <div className="paper-card">
        <h3 style={{ color: "#e4edfa", marginBottom: 15 }}>➕ Créer une nouvelle invitation</h3>
        <form onSubmit={createInvitation} style={{ display: "flex", flexWrap: "wrap", gap: 15, alignItems: "end" }}>
          <div>
            <label>Email de la personne à inviter</label>
            <input
              type="email"
              className="input"
              value={emailInvite}
              onChange={(e) => setEmailInvite(e.target.value)}
              placeholder="exemple@email.com"
              required
              style={{ minWidth: 200 }}
            />
          </div>
          <div>
            <label>Rôle à attribuer</label>
            <select
              className="input"
              value={roleInvite}
              onChange={(e) => setRoleInvite(e.target.value)}
            >
              <option value="vendeuse">Vendeuse</option>
              <option value="docteur">Docteur</option>
            </select>
          </div>
          <div>
            <label>Note (optionnel)</label>
            <input
              type="text"
              className="input"
              value={noteInvite}
              onChange={(e) => setNoteInvite(e.target.value)}
              placeholder="Ex: Nouvelle employée"
              style={{ minWidth: 150 }}
            />
          </div>
          <button 
            type="submit" 
            className="btn success"
            disabled={creating || !emailInvite}
            style={{ minWidth: 140 }}
          >
            {creating ? "Création..." : "🎯 Créer invitation"}
          </button>
        </form>
      </div>

      {/* Info box */}
      <div className="paper-card" style={{ background: "#e3f2fd", border: "1px solid #90caf9" }}>
        <h4 style={{ color: "#1565c0", marginTop: 0 }}>ℹ️ Comment ça fonctionne</h4>
        <ul style={{ color: "#0d47a1", lineHeight: 1.6, marginBottom: 0 }}>
          <li><strong>Créez une invitation</strong> avec l'email de la personne</li>
          <li><strong>Un code unique</strong> est généré (ex: ABC12DEF)</li>
          <li><strong>Partagez ce code</strong> avec la personne</li>
          <li><strong>Elle utilise le code</strong> lors de son inscription</li>
          <li><strong>Sécurité :</strong> Impossible de s'inscrire sans code valide</li>
        </ul>
      </div>

      {/* Liste des invitations */}
      <div className="fullscreen-table-title" style={{ fontSize: "1.3rem", marginTop: 20 }}>
        📋 Historique des Invitations
      </div>

      {loadingInvitations ? (
        <div style={{ padding: 40, textAlign: "center", color: "#7ee4e6" }}>
          Chargement des invitations...
        </div>
      ) : invitations.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#bc3453" }}>
          Aucune invitation créée pour le moment.
        </div>
      ) : (
        <div className="table-pro-full" style={{ minHeight: "40vh" }}>
          <table>
            <thead>
              <tr>
                <th>Email Invité</th>
                <th>Rôle</th>
                <th>Code</th>
                <th>Statut</th>
                <th>Créée le</th>
                <th>Expire le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invitation) => {
                const isExpired = invitation.expiresAt < new Date();
                const isPending = invitation.status === "pending" && !isExpired;
                
                return (
                  <tr key={invitation.id}>
                    <td>
                      {invitation.emailInvite}
                      {invitation.noteInvite && (
                        <div style={{ fontSize: "0.8em", color: "#7ee4e6", fontStyle: "italic" }}>
                          {invitation.noteInvite}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ 
                        background: invitation.roleInvite === "docteur" ? "#2bd2a6" : "#61c7ef",
                        color: "#fff",
                        padding: "3px 8px",
                        borderRadius: 10,
                        fontSize: "0.85em"
                      }}>
                        {invitation.roleInvite === "docteur" ? "👨‍⚕️ Docteur" : "👩‍💼 Vendeuse"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code style={{ 
                          background: "#1a2535", 
                          padding: "4px 8px", 
                          borderRadius: 5,
                          fontWeight: "bold",
                          letterSpacing: "1px"
                        }}>
                          {invitation.code}
                        </code>
                        <button
                          onClick={() => copyCode(invitation.code)}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "1.2em",
                            padding: "2px"
                          }}
                          title="Copier le code"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td>{getStatusBadge(invitation)}</td>
                    <td>{invitation.createdAt.toLocaleDateString()}</td>
                    <td>
                      <div style={{ 
                        color: isExpired ? "#f44336" : "#4caf50",
                        fontWeight: isExpired ? "bold" : "normal"
                      }}>
                        {invitation.expiresAt.toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {isPending && (
                          <button 
                            className="btn danger" 
                            onClick={() => cancelInvitation(invitation.id)}
                            style={{ minWidth: 80, fontSize: "0.9em" }}
                          >
                            ❌ Annuler
                          </button>
                        )}
                        
                        {(isExpired || invitation.status === "cancelled") && (
                          <button 
                            className="btn info" 
                            onClick={() => renewInvitation(invitation)}
                            style={{ minWidth: 90, fontSize: "0.9em" }}
                          >
                            🔄 Renouveler
                          </button>
                        )}
                        
                        <button 
                          className="btn danger" 
                          onClick={() => deleteInvitation(invitation.id)}
                          style={{ minWidth: 80, fontSize: "0.9em" }}
                        >
                          🗑️ Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
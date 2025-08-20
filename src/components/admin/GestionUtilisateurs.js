// src/components/admin/GestionUtilisateurs.js
import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  Timestamp
} from "firebase/firestore";

export default function GestionUtilisateurs() {
  const { user, societeId, role, loading } = useUserRole();
  
  // États
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  
  // Formulaire d'invitation
  const [emailInvite, setEmailInvite] = useState("");
  const [roleInvite, setRoleInvite] = useState("vendeuse");
  const [showForm, setShowForm] = useState(false);

  // Vérification des permissions
  const canManageUsers = role === "docteur" || role === "pharmacien";

  // Charger les données
  useEffect(() => {
    if (!canManageUsers || !societeId) {
      setLoadingData(false);
      return;
    }
    
    fetchUtilisateurs();
    fetchInvitations();
  }, [canManageUsers, societeId]);

  const fetchUtilisateurs = async () => {
    try {
      setLoadingData(true);
      
      // Récupérer tous les utilisateurs de la société
      const q = query(
        collection(db, "users"),
        where("societeId", "==", societeId)
      );
      
      const snapshot = await getDocs(q);
      const users = [];
      
      snapshot.forEach((doc) => {
        users.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setUtilisateurs(users);
      
    } catch (err) {
      console.error("Erreur chargement utilisateurs:", err);
      setError("Erreur lors du chargement des utilisateurs");
    } finally {
      setLoadingData(false);
    }
  };

  const fetchInvitations = async () => {
    try {
      // Récupérer les invitations en attente pour cette société
      const q = query(
        collection(db, "invitations"),
        where("societeId", "==", societeId),
        where("status", "==", "pending")
      );
      
      const snapshot = await getDocs(q);
      const invites = [];
      
      snapshot.forEach((doc) => {
        invites.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setInvitations(invites);
      
    } catch (err) {
      console.error("Erreur chargement invitations:", err);
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    
    if (!emailInvite || !roleInvite) return;
    
    try {
      // Vérifier si l'utilisateur existe déjà
      const existingUserQuery = query(
        collection(db, "users"),
        where("email", "==", emailInvite)
      );
      
      const existingUserSnap = await getDocs(existingUserQuery);
      
      if (!existingUserSnap.empty) {
        alert("Cet utilisateur existe déjà dans le système");
        return;
      }

      // Vérifier si une invitation existe déjà
      const existingInviteQuery = query(
        collection(db, "invitations"),
        where("email", "==", emailInvite),
        where("societeId", "==", societeId),
        where("status", "==", "pending")
      );
      
      const existingInviteSnap = await getDocs(existingInviteQuery);
      
      if (!existingInviteSnap.empty) {
        alert("Une invitation est déjà en attente pour cet email");
        return;
      }

      // Créer l'invitation
      await addDoc(collection(db, "invitations"), {
        email: emailInvite,
        role: roleInvite,
        societeId: societeId,
        invitedBy: user.email,
        invitedAt: Timestamp.now(),
        status: "pending"
      });

      alert("Invitation envoyée avec succès !");
      
      // Réinitialiser le formulaire
      setEmailInvite("");
      setRoleInvite("vendeuse");
      setShowForm(false);
      
      // Recharger les invitations
      fetchInvitations();
      
    } catch (err) {
      console.error("Erreur envoi invitation:", err);
      alert("Erreur lors de l'envoi de l'invitation");
    }
  };

  const handleDeleteInvitation = async (invitationId) => {
    if (!window.confirm("Supprimer cette invitation ?")) return;
    
    try {
      await deleteDoc(doc(db, "invitations", invitationId));
      alert("Invitation supprimée");
      fetchInvitations();
    } catch (err) {
      console.error("Erreur suppression invitation:", err);
      alert("Erreur lors de la suppression");
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        role: newRole
      });
      
      alert("Rôle mis à jour avec succès");
      fetchUtilisateurs();
      
    } catch (err) {
      console.error("Erreur mise à jour rôle:", err);
      alert("Erreur lors de la mise à jour du rôle");
    }
  };

  // Écrans d'état
  if (loading) {
    return (
      <div className="fullscreen-table-wrap">
        <div className="fullscreen-table-title">Chargement...</div>
      </div>
    );
  }

  if (!canManageUsers) {
    return (
      <div className="fullscreen-table-wrap">
        <div className="fullscreen-table-title">Accès Refusé</div>
        <div style={{ padding: 40, textAlign: "center", color: "#e53e3e" }}>
          Vous n'avez pas les permissions pour accéder à cette page.
        </div>
      </div>
    );
  }

  if (!societeId) {
    return (
      <div className="fullscreen-table-wrap">
        <div className="fullscreen-table-title">Erreur</div>
        <div style={{ padding: 40, textAlign: "center", color: "#f59e0b" }}>
          Aucune société assignée. Contactez l'administrateur.
        </div>
      </div>
    );
  }

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Utilisateurs</div>
      
      {error && (
        <div style={{ 
          padding: 20, 
          background: "#fef2f2", 
          color: "#dc2626", 
          margin: "20px", 
          borderRadius: 8 
        }}>
          {error}
        </div>
      )}

      {/* Informations société */}
      <div style={{ 
        padding: 20, 
        background: "#f0f9ff", 
        margin: "20px", 
        borderRadius: 8,
        border: "1px solid #0ea5e9"
      }}>
        <strong>Société :</strong> {societeId}<br/>
        <strong>Votre rôle :</strong> {role}<br/>
        <strong>Email :</strong> {user?.email}
      </div>

      {/* Toggle formulaire invitation */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 12, marginBottom: 0 }}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize: "1.32em",
            padding: "2px 13px",
            minWidth: 35,
            background: showForm
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={() => setShowForm(v => !v)}
        >
          {showForm ? "➖" : "➕"}
        </button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>
          Inviter un nouvel utilisateur
        </span>
      </div>

      {/* Formulaire d'invitation */}
      {showForm && (
        <form onSubmit={handleInviteUser} className="paper-card" style={{ display: "flex", gap: 15, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <label>Email de l'utilisateur</label>
            <input
              type="email"
              className="w-full"
              value={emailInvite}
              onChange={(e) => setEmailInvite(e.target.value)}
              required
              placeholder="utilisateur@exemple.com"
            />
          </div>
          
          <div>
            <label>Rôle</label>
            <select
              className="w-full"
              value={roleInvite}
              onChange={(e) => setRoleInvite(e.target.value)}
            >
              <option value="vendeuse">Vendeuse</option>
              <option value="docteur">Pharmacien</option>
            </select>
          </div>
          
          <button type="submit" className="btn">
            Envoyer l'invitation
          </button>
        </form>
      )}

      {/* Liste des utilisateurs actuels */}
      <div className="fullscreen-table-title" style={{ fontSize: "1.3rem", marginTop: 30 }}>
        Utilisateurs Actuels ({utilisateurs.length})
      </div>
      
      <div className="table-pro-full" style={{ marginBottom: 30 }}>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Rôle</th>
              <th>Inscrit le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((utilisateur) => (
              <tr key={utilisateur.id}>
                <td>{utilisateur.email}</td>
                <td>
                  <select
                    value={utilisateur.role || "vendeuse"}
                    onChange={(e) => handleUpdateUserRole(utilisateur.id, e.target.value)}
                    style={{ padding: 5, borderRadius: 4 }}
                  >
                    <option value="vendeuse">Vendeuse</option>
                    <option value="docteur">Pharmacien</option>
                  </select>
                </td>
                <td>
                  {utilisateur.createdAt?.toDate ? 
                    utilisateur.createdAt.toDate().toLocaleDateString() : 
                    "Non spécifié"
                  }
                </td>
                <td>
                  {utilisateur.id !== user.uid && (
                    <button 
                      className="btn danger"
                      onClick={() => {
                        if (window.confirm("Supprimer cet utilisateur ?")) {
                          // Ici vous pouvez implémenter la suppression d'utilisateur
                          alert("Fonctionnalité à implémenter");
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Liste des invitations en attente */}
      <div className="fullscreen-table-title" style={{ fontSize: "1.3rem" }}>
        Invitations en Attente ({invitations.length})
      </div>
      
      <div className="table-pro-full">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Rôle</th>
              <th>Invité par</th>
              <th>Date d'invitation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "#6b7280" }}>
                  Aucune invitation en attente
                </td>
              </tr>
            ) : (
              invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td>{invitation.email}</td>
                  <td>{invitation.role}</td>
                  <td>{invitation.invitedBy}</td>
                  <td>
                    {invitation.invitedAt?.toDate ? 
                      invitation.invitedAt.toDate().toLocaleDateString() : 
                      "Non spécifié"
                    }
                  </td>
                  <td>
                    <button 
                      className="btn danger"
                      onClick={() => handleDeleteInvitation(invitation.id)}
                    >
                      Annuler
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
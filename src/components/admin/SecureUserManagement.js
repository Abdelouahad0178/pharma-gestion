// src/components/admin/SecureUserManagement.js
import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import { 
  collection, getDocs, updateDoc, deleteDoc, doc, 
  query, where, Timestamp, addDoc 
} from "firebase/firestore";

export default function SecureUserManagement() {
  const { 
    user, 
    societeId, 
    isOwner, 
    canManageUsers, 
    canChangeUserRole,
    canModifyUser
  } = useUserRole();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Charger tous les utilisateurs de la société
  const fetchUsers = async () => {
    if (!societeId || !canManageUsers()) {
      setUsers([]);
      return;
    }
    
    try {
      const q = query(collection(db, "users"), where("societeId", "==", societeId));
      const snap = await getDocs(q);
      const usersList = [];
      
      snap.forEach((doc) => {
        const userData = doc.data();
        usersList.push({ 
          id: doc.id, 
          ...userData,
          // Assurer la cohérence des champs booléens
          isOwner: userData.isOwner === true,
          active: userData.active !== false,
          locked: userData.locked === true || userData.isLocked === true,
          deleted: userData.deleted === true
        });
      });
      
      // Trier : propriétaire en premier, puis par rôle, puis par nom
      usersList.sort((a, b) => {
        if (a.isOwner && !b.isOwner) return -1;
        if (!a.isOwner && b.isOwner) return 1;
        if (a.role !== b.role) {
          if (a.role === "docteur" && b.role === "vendeuse") return -1;
          if (a.role === "vendeuse" && b.role === "docteur") return 1;
        }
        return (a.email || "").localeCompare(b.email || "");
      });
      
      setUsers(usersList);
    } catch (error) {
      console.error("Erreur lors du chargement des utilisateurs:", error);
      setError("Erreur lors du chargement des utilisateurs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [societeId, canManageUsers]);

  // SÉCURISÉ: Changer le rôle d'un utilisateur
  const handleRoleChange = async (targetUserId, currentRole, newRole) => {
    setError("");
    setSuccess("");
    
    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) {
      setError("Utilisateur introuvable");
      return;
    }

    // CONTRÔLES DE SÉCURITÉ STRICTS
    if (!canChangeUserRole(targetUserId, targetUser.isOwner, currentRole, newRole)) {
      setError("Action non autorisée : vous ne pouvez pas modifier cet utilisateur");
      return;
    }

    // PROTECTION SUPPLÉMENTAIRE : Vérifier explicitement
    if (targetUser.isOwner) {
      setError("ERREUR DE SÉCURITÉ : Le propriétaire de la société ne peut pas être modifié");
      return;
    }

    if (targetUserId === user.uid) {
      setError("ERREUR DE SÉCURITÉ : Vous ne pouvez pas modifier votre propre rôle");
      return;
    }

    if (!isOwner) {
      setError("ERREUR DE SÉCURITÉ : Seul le propriétaire peut changer les rôles");
      return;
    }

    try {
      await updateDoc(doc(db, "users", targetUserId), {
        role: newRole,
        updatedAt: Timestamp.now(),
        updatedBy: user.uid,
        updatedByOwner: true // Marquer que c'est le propriétaire qui a fait la modification
      });
      
      // Log de sécurité
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "role_change_by_owner",
        ownerId: user.uid,
        ownerEmail: user.email,
        targetUserId: targetUserId,
        targetUserEmail: targetUser.email,
        oldRole: currentRole,
        newRole: newRole,
        timestamp: Timestamp.now(),
        securityLevel: "owner_action"
      });
      
      fetchUsers(); // Recharger
      setSuccess(`Rôle de ${targetUser.email} changé de ${currentRole} vers ${newRole}`);
    } catch (error) {
      console.error("Erreur:", error);
      setError("Erreur lors de la modification du rôle");
    }
  };

  // SÉCURISÉ: Supprimer un utilisateur
  const handleDeleteUser = async (targetUserId) => {
    setError("");
    setSuccess("");
    
    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) {
      setError("Utilisateur introuvable");
      return;
    }

    // CONTRÔLES DE SÉCURITÉ STRICTS
    if (!canModifyUser(targetUserId, targetUser.isOwner)) {
      setError("Action non autorisée");
      return;
    }

    // PROTECTION SUPPLÉMENTAIRE
    if (targetUser.isOwner) {
      setError("ERREUR DE SÉCURITÉ : Le propriétaire ne peut pas être supprimé");
      return;
    }

    if (targetUserId === user.uid) {
      setError("ERREUR DE SÉCURITÉ : Vous ne pouvez pas vous supprimer vous-même");
      return;
    }

    if (!isOwner) {
      setError("ERREUR DE SÉCURITÉ : Seul le propriétaire peut supprimer des utilisateurs");
      return;
    }

    if (!window.confirm(`Voulez-vous vraiment supprimer ${targetUser.email} définitivement ?`)) {
      return;
    }

    try {
      // Marquer comme supprimé au lieu de supprimer physiquement
      await updateDoc(doc(db, "users", targetUserId), {
        deleted: true,
        deletedAt: Timestamp.now(),
        deletedBy: user.uid,
        active: false
      });
      
      // Log de sécurité
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "user_deletion_by_owner",
        ownerId: user.uid,
        ownerEmail: user.email,
        targetUserId: targetUserId,
        targetUserEmail: targetUser.email,
        timestamp: Timestamp.now(),
        securityLevel: "owner_action"
      });
      
      fetchUsers();
      setSuccess(`Utilisateur ${targetUser.email} supprimé`);
    } catch (error) {
      console.error("Erreur:", error);
      setError("Erreur lors de la suppression");
    }
  };

  // SÉCURISÉ: Verrouiller/déverrouiller un compte
  const handleLockToggle = async (targetUserId, currentLocked) => {
    setError("");
    setSuccess("");
    
    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) return;

    // CONTRÔLES DE SÉCURITÉ STRICTS
    if (targetUser.isOwner) {
      setError("ERREUR DE SÉCURITÉ : Le propriétaire ne peut pas être verrouillé");
      return;
    }

    if (!isOwner) {
      setError("ERREUR DE SÉCURITÉ : Seul le propriétaire peut verrouiller des comptes");
      return;
    }

    try {
      await updateDoc(doc(db, "users", targetUserId), {
        locked: !currentLocked,
        lockedAt: !currentLocked ? Timestamp.now() : null,
        lockedBy: !currentLocked ? user.uid : null,
        updatedAt: Timestamp.now()
      });
      
      // Log de sécurité
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: currentLocked ? "user_unlock_by_owner" : "user_lock_by_owner",
        ownerId: user.uid,
        ownerEmail: user.email,
        targetUserId: targetUserId,
        targetUserEmail: targetUser.email,
        timestamp: Timestamp.now(),
        securityLevel: "owner_action"
      });
      
      fetchUsers();
      setSuccess(`Compte ${currentLocked ? 'déverrouillé' : 'verrouillé'}`);
    } catch (error) {
      console.error("Erreur:", error);
      setError("Erreur lors de la modification du statut");
    }
  };

  // Vérifier l'accès
  if (!canManageUsers() || !isOwner) {
    return (
      <div style={{ 
        padding: 30, 
        textAlign: "center", 
        color: "#dc2626",
        background: "#fee2e2",
        borderRadius: "8px",
        margin: "20px"
      }}>
        <h3>Accès refusé</h3>
        <p>Seul le propriétaire de la société peut gérer les utilisateurs.</p>
        {!isOwner && <p><strong>Vous n'êtes pas le propriétaire de cette société.</strong></p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: "center" }}>
        Chargement des utilisateurs...
      </div>
    );
  }

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">
        Gestion sécurisée des utilisateurs
        <div style={{ fontSize: "14px", color: "#6b7280", marginTop: "5px" }}>
          Propriétaire permanent : {user.email}
        </div>
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

      <div style={{
        background: "#e0f2fe",
        padding: "15px",
        borderRadius: "8px",
        marginBottom: "20px",
        borderLeft: "4px solid #0277bd"
      }}>
        <h4 style={{ color: "#01579b", margin: "0 0 10px 0" }}>
          Règles de sécurité strictes
        </h4>
        <ul style={{ color: "#0277bd", marginLeft: "20px" }}>
          <li>Le propriétaire (vous) ne peut jamais être modifié ou supprimé</li>
          <li>Seul le propriétaire peut changer les rôles des autres utilisateurs</li>
          <li>Les docteurs promus ne peuvent pas modifier le propriétaire</li>
          <li>Toutes les actions sont tracées pour la sécurité</li>
        </ul>
      </div>
      
      <div className="table-pro-full">
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Email</th>
              <th>Statut</th>
              <th>Rôle</th>
              <th>État</th>
              <th>Créé le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.filter(u => !u.deleted).map((targetUser) => (
              <tr key={targetUser.id} style={{
                background: targetUser.isOwner ? "#f0f9ff" : "white"
              }}>
                <td style={{ 
                  fontWeight: targetUser.isOwner ? "bold" : "normal",
                  color: targetUser.isOwner ? "#0369a1" : "inherit"
                }}>
                  {targetUser.email}
                  {targetUser.displayName && (
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                      {targetUser.displayName}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>
                  {targetUser.isOwner ? (
                    <span className="status-chip" style={{
                      background: "linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)",
                      color: "#92400e",
                      border: "1px solid #f59e0b"
                    }}>
                      Propriétaire
                    </span>
                  ) : (
                    <span className="status-chip info">Employé</span>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>
                  {targetUser.isOwner ? (
                    <span style={{
                      padding: "4px 12px",
                      background: "#fef3c7",
                      color: "#92400e",
                      borderRadius: "12px",
                      fontWeight: "600"
                    }}>
                      {targetUser.role} (permanent)
                    </span>
                  ) : (
                    <select
                      value={targetUser.role}
                      onChange={(e) => handleRoleChange(
                        targetUser.id, 
                        targetUser.role, 
                        e.target.value
                      )}
                      style={{ padding: "4px 8px", borderRadius: "4px" }}
                      disabled={!canChangeUserRole(
                        targetUser.id, 
                        targetUser.isOwner, 
                        targetUser.role, 
                        "docteur"
                      )}
                    >
                      <option value="vendeuse">Vendeuse</option>
                      <option value="docteur">Docteur</option>
                    </select>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>
                  {targetUser.locked ? (
                    <span className="status-chip danger">Verrouillé</span>
                  ) : targetUser.active ? (
                    <span className="status-chip success">Actif</span>
                  ) : (
                    <span className="status-chip">Inactif</span>
                  )}
                </td>
                <td style={{ textAlign: "center", fontSize: "12px", color: "#6b7280" }}>
                  {targetUser.createdAt?.toDate?.()?.toLocaleDateString?.() || "N/A"}
                </td>
                <td style={{ textAlign: "center" }}>
                  {targetUser.isOwner ? (
                    <span style={{ 
                      color: "#6b7280", 
                      fontStyle: "italic",
                      fontSize: "12px"
                    }}>
                      Intouchable
                    </span>
                  ) : (
                    <div style={{ display: "flex", gap: "5px", justifyContent: "center" }}>
                      <button 
                        className={`btn ${targetUser.locked ? 'success' : 'info'}`}
                        onClick={() => handleLockToggle(targetUser.id, targetUser.locked)}
                        style={{ padding: "4px 8px", fontSize: "12px" }}
                      >
                        {targetUser.locked ? 'Déverrouiller' : 'Verrouiller'}
                      </button>
                      <button 
                        className="btn danger"
                        onClick={() => handleDeleteUser(targetUser.id)}
                        style={{ padding: "4px 8px", fontSize: "12px" }}
                      >
                        Supprimer
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div style={{ 
          padding: "40px", 
          textAlign: "center", 
          color: "#6b7280" 
        }}>
          Aucun utilisateur trouvé dans cette société.
        </div>
      )}
    </div>
  );
}
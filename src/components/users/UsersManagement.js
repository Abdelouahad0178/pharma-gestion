// src/components/users/UsersManagement.js - Version simplifiée sans boucles infinies
import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  doc,
  setDoc,
  updateDoc,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  limit
} from "firebase/firestore";

export default function UsersManagement() {
  const { user, societeId, role, loading, isOwner } = useUserRole();

  // États simplifiés
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("vendeuse");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [notification, setNotification] = useState(null);
  const [invitationCode, setInvitationCode] = useState(null);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [updatingUser, setUpdatingUser] = useState("");

  // Vérification simple des permissions
  const hasAccess = isOwner || ["pharmacien", "admin", "ADMIN", "docteur"].includes((role || "").toLowerCase());

  // Chargement initial (une seule fois)
  useEffect(() => {
    if (!user || !societeId || !hasAccess) return;

    const loadUsers = async () => {
      try {
        const q = query(collection(db, "users"), where("societeId", "==", societeId));
        const snapshot = await getDocs(q);
        const usersList = [];
        
        snapshot.forEach((doc) => {
          const userData = doc.data();
          usersList.push({
            id: doc.id,
            email: userData.email,
            role: userData.role || "vendeuse",
            nom: userData.nom || "",
            prenom: userData.prenom || "",
            actif: userData.actif !== false
          });
        });
        
        setUtilisateurs(usersList);
      } catch (error) {
        console.error("Erreur chargement utilisateurs:", error);
      }
    };

    const loadInvitations = async () => {
      try {
        const q = query(
          collection(db, "invitations"),
          where("societeId", "==", societeId),
          limit(20)
        );
        const snapshot = await getDocs(q);
        const invitationsList = [];
        
        snapshot.forEach((doc) => {
          const inviteData = doc.data();
          invitationsList.push({
            id: doc.id,
            email: inviteData.email,
            role: inviteData.role,
            statut: inviteData.statut || "pending",
            createdAt: inviteData.createdAt
          });
        });
        
        setInvitations(invitationsList);
      } catch (error) {
        console.error("Erreur chargement invitations:", error);
      }
    };

    loadUsers();
    loadInvitations();
  }, [user?.uid, societeId, hasAccess]); // Dépendances stables

  // Fonction simple pour envoyer invitation
  const sendInvitation = async (e) => {
    e.preventDefault();
    
    if (!inviteEmail.trim()) {
      setNotification({ message: "Veuillez saisir un email", type: "error" });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setSendingInvite(true);
    
    try {
      const inviteToken = Math.random().toString(36).substring(2, 15) + 
                         Math.random().toString(36).substring(2, 15);
      
      const invitationData = {
        email: inviteEmail.toLowerCase().trim(),
        role: inviteRole,
        societeId,
        statut: "pending",
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
        invitePar: user.uid,
        inviteParEmail: user.email || "",
        inviteToken
      };

      await setDoc(doc(collection(db, "invitations")), invitationData);
      
      const inviteLink = `${window.location.origin}/accept-invitation?token=${inviteToken}`;
      
      setInvitationCode({
        email: inviteEmail,
        token: inviteToken,
        link: inviteLink,
        role: inviteRole,
        expiresAt: invitationData.expiresAt
      });
      
      setNotification({ message: `Invitation créée pour ${inviteEmail}`, type: "success" });
      setTimeout(() => setNotification(null), 3000);
      
      setShowInviteCode(true);
      setInviteEmail("");
      setShowInviteForm(false);
      
    } catch (error) {
      console.error("Erreur création invitation:", error);
      setNotification({ message: "Erreur lors de la création", type: "error" });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setSendingInvite(false);
    }
  };

  // Fonction simple pour copier
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotification({ message: "Copié!", type: "success" });
      setTimeout(() => setNotification(null), 2000);
    } catch (error) {
      setNotification({ message: "Impossible de copier", type: "error" });
      setTimeout(() => setNotification(null), 2000);
    }
  };

  // Fonction pour verrouiller/déverrouiller un utilisateur
  const toggleUserLock = async (userId, currentStatus, userEmail) => {
    console.log("=== DEBUG VERROUILLAGE ===");
    console.log("User ID:", userId);
    console.log("Current status:", currentStatus);
    console.log("User email:", userEmail);
    console.log("Updating user:", updatingUser);
    console.log("Current user:", user);
    
    if (updatingUser === userId) {
      console.log("STOP: Déjà en cours de mise à jour");
      return;
    }
    
    setUpdatingUser(userId);
    console.log("Starting update...");
    
    try {
      const userDocRef = doc(db, "users", userId);
      const updateData = {
        actif: !currentStatus,
        modifieLe: Timestamp.now(),
        modifiePar: user.uid
      };
      
      console.log("Update data:", updateData);
      
      await updateDoc(userDocRef, updateData);
      console.log("Firestore update successful");
      
      // Mettre à jour localement
      setUtilisateurs(prev => {
        const updated = prev.map(u => 
          u.id === userId ? { ...u, actif: !currentStatus } : u
        );
        console.log("Local state updated");
        return updated;
      });
      
      setNotification({
        message: `${userEmail} ${!currentStatus ? 'déverrouillé' : 'verrouillé'}`,
        type: "success"
      });
      setTimeout(() => setNotification(null), 3000);
      
    } catch (error) {
      console.error("=== ERREUR VERROUILLAGE ===", error);
      setNotification({ message: "Erreur: " + error.message, type: "error" });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      console.log("Clearing updating user state");
      setUpdatingUser("");
    }
  };

  // Fonction pour supprimer un utilisateur
  const deleteUser = async (userId, userEmail) => {
    if (updatingUser === userId) return;
    
    setUpdatingUser(userId);
    
    try {
      // Supprimer de Firestore
      await updateDoc(doc(db, "users", userId), {
        deleted: true,
        deletedAt: Timestamp.now(),
        deletedBy: user.uid
      });
      
      // Retirer de la liste locale
      setUtilisateurs(prev => prev.filter(u => u.id !== userId));
      
      setNotification({
        message: `Utilisateur ${userEmail} supprimé`,
        type: "success"
      });
      setTimeout(() => setNotification(null), 3000);
      
      setConfirmDelete(null);
      
    } catch (error) {
      console.error("Erreur suppression:", error);
      setNotification({ message: "Erreur lors de la suppression", type: "error" });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setUpdatingUser("");
    }
  };

  // Vérifier si l'utilisateur peut être géré
  const canManageUser = (targetUser) => {
    console.log("=== DEBUG PERMISSIONS ===");
    console.log("Target user:", targetUser);
    console.log("Current user ID:", user?.uid);
    console.log("Current user role:", role);
    console.log("Is owner:", isOwner);
    
    // Ne peut pas se gérer soi-même
    if (targetUser.id === user?.uid) {
      console.log("PERMISSION DENIED: Cannot manage self");
      return false;
    }
    
    // Ne peut pas gérer un pharmacien/docteur
    if (["pharmacien", "docteur", "admin"].includes(targetUser.role?.toLowerCase())) {
      console.log("PERMISSION DENIED: Cannot manage admin roles");
      return false;
    }
    
    // Seul le pharmacien/docteur peut gérer
    const hasPermission = ["pharmacien", "docteur", "admin"].includes(role?.toLowerCase()) || isOwner;
    console.log("Has permission:", hasPermission);
    
    return hasPermission;
  };

  // Styles simplifiés
  const styles = {
    container: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      minHeight: "100vh",
      padding: "20px",
      fontFamily: "Inter, Arial, sans-serif"
    },
    card: {
      background: "white",
      borderRadius: "25px",
      boxShadow: "0 30px 60px rgba(0,0,0,0.15)",
      overflow: "hidden",
      margin: "0 auto",
      maxWidth: "1200px"
    },
    header: {
      background: "linear-gradient(135deg, #4a5568 0%, #2d3748 100%)",
      padding: "40px",
      textAlign: "center",
      color: "white"
    },
    title: {
      fontSize: "2.5em",
      fontWeight: 800,
      margin: 0
    },
    content: {
      padding: "40px"
    },
    button: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      border: "none",
      borderRadius: "10px",
      padding: "12px 20px",
      color: "white",
      fontWeight: 700,
      cursor: "pointer"
    },
    input: {
      width: "100%",
      padding: "12px",
      border: "2px solid #e2e8f0",
      borderRadius: "8px",
      marginBottom: "15px"
    },
    notification: {
      position: "fixed",
      top: "30px",
      right: "30px",
      padding: "15px 25px",
      borderRadius: "10px",
      color: "white",
      fontWeight: 600,
      zIndex: 1000
    }
  };

  // Guards simplifiés
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: "center", color: "white", fontSize: "1.5em", paddingTop: "100px" }}>
          Chargement...
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: "center", color: "white", fontSize: "1.5em", paddingTop: "100px" }}>
          Accès refusé. Seuls les administrateurs peuvent gérer les utilisateurs.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Gestion des Utilisateurs</h1>
        </div>

        <div style={styles.content}>
          {/* Notification */}
          {notification && (
            <div
              style={{
                ...styles.notification,
                background: notification.type === "success" 
                  ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)"
                  : "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
              }}
            >
              {notification.message}
            </div>
          )}

          {/* Section Utilisateurs */}
          <div style={{ marginBottom: "40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
              <h2 style={{ color: "#2d3748", margin: 0 }}>Équipe actuelle ({utilisateurs.length})</h2>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  style={{
                    ...styles.button,
                    background: "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)",
                    fontSize: "0.8em",
                    padding: "8px 12px"
                  }}
                  onClick={() => {
                    console.log("Test button clicked!");
                    setNotification({ message: "Test réussi!", type: "success" });
                    setTimeout(() => setNotification(null), 2000);
                  }}
                >
                  Test
                </button>
                <button
                  style={{
                    ...styles.button,
                    background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)"
                  }}
                  onClick={() => setShowInviteForm(true)}
                >
                  Inviter un utilisateur
                </button>
              </div>
            </div>

            {/* Liste utilisateurs */}
            <div style={{ display: "grid", gap: "20px" }}>
              {utilisateurs.map((utilisateur) => (
                <div
                  key={utilisateur.id}
                  style={{
                    background: "#f8fafc",
                    padding: "20px",
                    borderRadius: "15px",
                    border: "2px solid #e2e8f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#2d3748", marginBottom: "5px" }}>
                      {utilisateur.prenom && utilisateur.nom 
                        ? `${utilisateur.prenom} ${utilisateur.nom}`
                        : utilisateur.email
                      }
                      {utilisateur.id === user?.uid && (
                        <span style={{ color: "#48bb78", fontSize: "0.8em", marginLeft: "10px" }}>
                          (Vous)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.9em", color: "#6b7280" }}>
                      {utilisateur.email} • {utilisateur.role}
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                    {/* Statut utilisateur */}
                    <div
                      style={{
                        padding: "6px 12px",
                        borderRadius: "12px",
                        background: utilisateur.actif ? "#c6f6d5" : "#fed7d7",
                        color: utilisateur.actif ? "#22543d" : "#c53030",
                        fontSize: "0.8em",
                        fontWeight: 600
                      }}
                    >
                      {utilisateur.actif ? "Actif" : "Verrouillé"}
                    </div>

                    {/* Actions administrateur */}
                    {canManageUser(utilisateur) && (
                      <div style={{ display: "flex", gap: "8px" }}>
                        {/* Bouton Verrouiller/Déverrouiller */}
                        <button
                          style={{
                            ...styles.button,
                            background: utilisateur.actif 
                              ? "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)"
                              : "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                            padding: "8px 12px",
                            fontSize: "0.8em",
                            opacity: updatingUser === utilisateur.id ? 0.6 : 1,
                            cursor: updatingUser === utilisateur.id ? "not-allowed" : "pointer"
                          }}
                          onClick={() => toggleUserLock(utilisateur.id, utilisateur.actif, utilisateur.email)}
                          disabled={updatingUser === utilisateur.id}
                        >
                          {updatingUser === utilisateur.id 
                            ? "..." 
                            : utilisateur.actif 
                              ? "🔒 Verrouiller" 
                              : "🔓 Déverrouiller"
                          }
                        </button>

                        {/* Bouton Supprimer */}
                        <button
                          style={{
                            ...styles.button,
                            background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
                            padding: "8px 12px",
                            fontSize: "0.8em",
                            opacity: updatingUser === utilisateur.id ? 0.6 : 1,
                            cursor: updatingUser === utilisateur.id ? "not-allowed" : "pointer"
                          }}
                          onClick={() => setConfirmDelete(utilisateur)}
                          disabled={updatingUser === utilisateur.id}
                        >
                          🗑️ Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section Invitations */}
          <div>
            <h2 style={{ color: "#2d3748", marginBottom: "20px" }}>
              Invitations ({invitations.filter(i => i.statut === "pending").length} en attente)
            </h2>

            {invitations.length === 0 ? (
              <div style={{ textAlign: "center", color: "#6b7280", padding: "40px" }}>
                Aucune invitation envoyée
              </div>
            ) : (
              <div style={{ display: "grid", gap: "15px" }}>
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    style={{
                      background: "#f8fafc",
                      padding: "15px",
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#2d3748" }}>
                        {invitation.email}
                      </div>
                      <div style={{ fontSize: "0.8em", color: "#6b7280" }}>
                        Rôle: {invitation.role}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "4px 8px",
                        borderRadius: "8px",
                        background: invitation.statut === "pending" ? "#fff3cd" : "#d4edda",
                        color: invitation.statut === "pending" ? "#856404" : "#155724",
                        fontSize: "0.8em",
                        fontWeight: 600
                      }}
                    >
                      {invitation.statut === "pending" ? "En attente" : "Acceptée"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Invitation */}
      {showInviteForm && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            borderRadius: "20px",
            padding: "30px",
            width: "400px"
          }}>
            <h3 style={{ marginBottom: "20px" }}>Inviter un utilisateur</h3>
            
            <form onSubmit={sendInvitation}>
              <input
                type="email"
                style={styles.input}
                placeholder="Email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                disabled={sendingInvite}
              />

              <select
                style={styles.input}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                disabled={sendingInvite}
              >
                <option value="vendeuse">Vendeuse</option>
                <option value="assistant">Assistant(e)</option>
                <option value="admin">Administrateur</option>
              </select>

              <div style={{ display: "flex", gap: "15px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={{
                    ...styles.button,
                    background: "linear-gradient(135deg, #6b7280 0%, #4a5568 100%)"
                  }}
                  onClick={() => setShowInviteForm(false)}
                  disabled={sendingInvite}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={styles.button}
                  disabled={sendingInvite}
                >
                  {sendingInvite ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Code Invitation */}
      {showInviteCode && invitationCode && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            borderRadius: "20px",
            padding: "30px",
            width: "500px"
          }}>
            <h3 style={{ textAlign: "center", marginBottom: "25px", color: "#48bb78" }}>
              Invitation créée!
            </h3>
            
            <div style={{ marginBottom: "20px" }}>
              <strong>Email:</strong> {invitationCode.email}<br/>
              <strong>Rôle:</strong> {invitationCode.role}
            </div>

            <div style={{ marginBottom: "20px" }}>
              <strong>Code d'invitation:</strong>
              <div style={{
                background: "#f7fafc",
                padding: "10px",
                borderRadius: "8px",
                fontFamily: "monospace",
                fontSize: "1.1em",
                fontWeight: "bold",
                textAlign: "center",
                margin: "10px 0"
              }}>
                {invitationCode.token}
              </div>
            </div>

            <div style={{ marginBottom: "25px" }}>
              <strong>Lien complet:</strong>
              <div style={{
                background: "#f7fafc",
                padding: "10px",
                borderRadius: "8px",
                fontSize: "0.9em",
                wordBreak: "break-all",
                margin: "10px 0"
              }}>
                {invitationCode.link}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <button
                style={{
                  ...styles.button,
                  background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                  flex: 1
                }}
                onClick={() => copyText(invitationCode.link)}
              >
                Copier le lien
              </button>
              <button
                style={{
                  ...styles.button,
                  background: "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)",
                  flex: 1
                }}
                onClick={() => copyText(invitationCode.token)}
              >
                Copier le code
              </button>
            </div>

            <div style={{ textAlign: "center" }}>
              <button
                style={styles.button}
                onClick={() => {
                  setShowInviteCode(false);
                  setInvitationCode(null);
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmation Suppression */}
      {confirmDelete && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            borderRadius: "20px",
            padding: "30px",
            width: "450px",
            textAlign: "center"
          }}>
            <h3 style={{ color: "#e53e3e", marginBottom: "20px", fontSize: "1.5em" }}>
              Confirmer la suppression
            </h3>
            
            <div style={{ marginBottom: "25px", fontSize: "1.1em", lineHeight: "1.5" }}>
              <p style={{ color: "#2d3748", margin: "0 0 15px 0" }}>
                Êtes-vous sûr de vouloir supprimer l'utilisateur :
              </p>
              <div style={{
                background: "#f7fafc",
                padding: "15px",
                borderRadius: "10px",
                margin: "15px 0"
              }}>
                <div style={{ fontWeight: 700, color: "#2d3748", marginBottom: "5px" }}>
                  {confirmDelete.prenom && confirmDelete.nom 
                    ? `${confirmDelete.prenom} ${confirmDelete.nom}`
                    : confirmDelete.email
                  }
                </div>
                <div style={{ fontSize: "0.9em", color: "#6b7280" }}>
                  {confirmDelete.email} • {confirmDelete.role}
                </div>
              </div>
              <p style={{ color: "#e53e3e", margin: "15px 0 0 0", fontSize: "0.9em" }}>
                Cette action est <strong>irréversible</strong>. L'utilisateur ne pourra plus se connecter.
              </p>
            </div>

            <div style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
              <button
                style={{
                  ...styles.button,
                  background: "linear-gradient(135deg, #6b7280 0%, #4a5568 100%)",
                  padding: "12px 25px"
                }}
                onClick={() => setConfirmDelete(null)}
                disabled={updatingUser === confirmDelete.id}
              >
                Annuler
              </button>
              
              <button
                style={{
                  ...styles.button,
                  background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
                  padding: "12px 25px",
                  opacity: updatingUser === confirmDelete.id ? 0.6 : 1,
                  cursor: updatingUser === confirmDelete.id ? "not-allowed" : "pointer"
                }}
                onClick={() => deleteUser(confirmDelete.id, confirmDelete.email)}
                disabled={updatingUser === confirmDelete.id}
              >
                {updatingUser === confirmDelete.id ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
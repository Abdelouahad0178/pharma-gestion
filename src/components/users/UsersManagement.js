// src/components/users/UsersManagement.js - Version responsive complète
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

  // Détection responsive
  const [screenSize, setScreenSize] = useState({
    isMobile: window.innerWidth < 768,
    isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
    isDesktop: window.innerWidth >= 1024
  });

  // Gestionnaire de redimensionnement
  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        isMobile: window.innerWidth < 768,
        isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
        isDesktop: window.innerWidth >= 1024
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  }, [user?.uid, societeId, hasAccess]);

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
    if (updatingUser === userId) return;
    
    setUpdatingUser(userId);
    
    try {
      const userDocRef = doc(db, "users", userId);
      const updateData = {
        actif: !currentStatus,
        modifieLe: Timestamp.now(),
        modifiePar: user.uid
      };
      
      await updateDoc(userDocRef, updateData);
      
      // Mettre à jour localement
      setUtilisateurs(prev => 
        prev.map(u => u.id === userId ? { ...u, actif: !currentStatus } : u)
      );
      
      setNotification({
        message: `${userEmail} ${!currentStatus ? 'déverrouillé' : 'verrouillé'}`,
        type: "success"
      });
      setTimeout(() => setNotification(null), 3000);
      
    } catch (error) {
      console.error("Erreur verrouillage:", error);
      setNotification({ message: "Erreur: " + error.message, type: "error" });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setUpdatingUser("");
    }
  };

  // Fonction pour supprimer un utilisateur
  const deleteUser = async (userId, userEmail) => {
    if (updatingUser === userId) return;
    
    setUpdatingUser(userId);
    
    try {
      await updateDoc(doc(db, "users", userId), {
        deleted: true,
        deletedAt: Timestamp.now(),
        deletedBy: user.uid
      });
      
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
    if (targetUser.id === user?.uid) return false;
    if (["pharmacien", "docteur", "admin"].includes(targetUser.role?.toLowerCase())) return false;
    return ["pharmacien", "docteur", "admin"].includes(role?.toLowerCase()) || isOwner;
  };

  // Styles responsifs dynamiques
  const getResponsiveStyles = () => {
    const { isMobile, isTablet, isDesktop } = screenSize;
    
    return {
      // Container principal
      container: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        minHeight: "100vh",
        padding: isMobile ? "10px" : isTablet ? "15px" : "20px",
        fontFamily: "Inter, Arial, sans-serif",
        overflow: "auto"
      },

      // Carte principale
      card: {
        background: "white",
        borderRadius: isMobile ? "15px" : isTablet ? "20px" : "25px",
        boxShadow: "0 30px 60px rgba(0,0,0,0.15)",
        overflow: "hidden",
        margin: "0 auto",
        maxWidth: isDesktop ? "1200px" : "100%",
        width: "100%"
      },

      // Header
      header: {
        background: "linear-gradient(135deg, #4a5568 0%, #2d3748 100%)",
        padding: isMobile ? "20px 15px" : isTablet ? "30px 20px" : "40px",
        textAlign: "center",
        color: "white"
      },

      title: {
        fontSize: isMobile ? "1.8em" : isTablet ? "2.2em" : "2.5em",
        fontWeight: 800,
        margin: 0,
        wordBreak: "break-word"
      },

      // Content principal
      content: {
        padding: isMobile ? "15px" : isTablet ? "25px" : "40px"
      },

      // Header de section
      sectionHeader: {
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "center",
        marginBottom: isMobile ? "20px" : "30px",
        gap: isMobile ? "15px" : "20px"
      },

      sectionTitle: {
        color: "#2d3748",
        margin: 0,
        fontSize: isMobile ? "1.3em" : isTablet ? "1.5em" : "1.8em",
        fontWeight: 700
      },

      // Boutons header
      headerButtons: {
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: "10px",
        alignSelf: isMobile ? "stretch" : "auto"
      },

      // Bouton standard
      button: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        border: "none",
        borderRadius: isMobile ? "8px" : "10px",
        padding: isMobile ? "12px 16px" : "12px 20px",
        color: "white",
        fontWeight: 700,
        cursor: "pointer",
        fontSize: isMobile ? "0.9em" : "1em",
        minHeight: isMobile ? "44px" : "auto", // Taille tactile
        transition: "all 0.3s ease",
        width: isMobile ? "100%" : "auto"
      },

      // Container utilisateurs
      usersContainer: {
        display: "grid",
        gap: isMobile ? "15px" : "20px",
        marginBottom: "40px"
      },

      // Carte utilisateur - RESPONSIVE FLEX
      userCard: {
        background: "#f8fafc",
        padding: isMobile ? "15px" : "20px",
        borderRadius: isMobile ? "10px" : "15px",
        border: "2px solid #e2e8f0",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? "15px" : "20px",
        position: "relative"
      },

      // Info utilisateur
      userInfo: {
        flex: 1,
        minWidth: 0 // Permet la contraction
      },

      userName: {
        fontWeight: 700,
        color: "#2d3748",
        marginBottom: "5px",
        fontSize: isMobile ? "1em" : "1.1em",
        wordBreak: "break-word"
      },

      userDetails: {
        fontSize: isMobile ? "0.8em" : "0.9em",
        color: "#6b7280",
        wordBreak: "break-word"
      },

      // Actions utilisateur - SCROLL HORIZONTAL MOBILE
      userActions: {
        display: "flex",
        alignItems: "center",
        gap: "15px",
        flexShrink: 0,
        ...(isMobile && {
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          paddingBottom: "5px"
        })
      },

      // Status badge
      statusBadge: {
        padding: "6px 12px",
        borderRadius: "12px",
        fontSize: "0.8em",
        fontWeight: 600,
        whiteSpace: "nowrap",
        flexShrink: 0
      },

      // Boutons d'action - TAILLE TACTILE
      actionButtons: {
        display: "flex",
        gap: "8px",
        flexShrink: 0,
        ...(isMobile && {
          minWidth: "max-content" // Empêche la compression
        })
      },

      actionButton: {
        border: "none",
        borderRadius: isMobile ? "8px" : "10px",
        padding: isMobile ? "10px 14px" : "8px 12px",
        fontSize: isMobile ? "0.85em" : "0.8em",
        fontWeight: 700,
        cursor: "pointer",
        color: "white",
        minHeight: isMobile ? "44px" : "auto",
        minWidth: isMobile ? "44px" : "auto",
        whiteSpace: "nowrap",
        transition: "all 0.3s ease"
      },

      // Input styles
      input: {
        width: "100%",
        padding: isMobile ? "14px 12px" : "12px",
        border: "2px solid #e2e8f0",
        borderRadius: isMobile ? "8px" : "8px",
        marginBottom: "15px",
        fontSize: isMobile ? "16px" : "14px", // 16px évite le zoom sur iOS
        minHeight: isMobile ? "44px" : "auto",
        boxSizing: "border-box"
      },

      // Modal overlay
      modalOverlay: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: isMobile ? "10px" : "20px"
      },

      // Modal content
      modalContent: {
        background: "white",
        borderRadius: isMobile ? "15px" : "20px",
        padding: isMobile ? "20px" : "30px",
        width: "100%",
        maxWidth: isMobile ? "100%" : isTablet ? "500px" : "400px",
        maxHeight: isMobile ? "90vh" : "80vh",
        overflow: "auto"
      },

      // Notification
      notification: {
        position: "fixed",
        top: isMobile ? "15px" : "30px",
        right: isMobile ? "10px" : "30px",
        left: isMobile ? "10px" : "auto",
        padding: isMobile ? "12px 16px" : "15px 25px",
        borderRadius: "10px",
        color: "white",
        fontWeight: 600,
        zIndex: 1001,
        fontSize: isMobile ? "0.9em" : "1em",
        maxWidth: isMobile ? "calc(100vw - 20px)" : "400px"
      },

      // Invitations container
      invitationsContainer: {
        display: "grid",
        gap: isMobile ? "12px" : "15px"
      },

      invitationCard: {
        background: "#f8fafc",
        padding: isMobile ? "12px" : "15px",
        borderRadius: "10px",
        border: "1px solid #e2e8f0",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? "10px" : "15px"
      }
    };
  };

  const styles = getResponsiveStyles();

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
        <div style={{ textAlign: "center", color: "white", fontSize: "1.5em", paddingTop: "100px", padding: "20px" }}>
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
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>
                Équipe actuelle ({utilisateurs.length})
              </h2>
              
              <div style={styles.headerButtons}>
                <button
                  style={{
                    ...styles.button,
                    background: "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)"
                  }}
                  onClick={() => {
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

            {/* Liste utilisateurs avec scroll horizontal sur mobile */}
            <div style={styles.usersContainer}>
              {utilisateurs.map((utilisateur) => (
                <div key={utilisateur.id} style={styles.userCard}>
                  {/* Informations utilisateur */}
                  <div style={styles.userInfo}>
                    <div style={styles.userName}>
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
                    <div style={styles.userDetails}>
                      {utilisateur.email} • {utilisateur.role}
                    </div>
                  </div>
                  
                  {/* Actions utilisateur avec scroll horizontal */}
                  <div style={styles.userActions}>
                    {/* Statut utilisateur */}
                    <div
                      style={{
                        ...styles.statusBadge,
                        background: utilisateur.actif ? "#c6f6d5" : "#fed7d7",
                        color: utilisateur.actif ? "#22543d" : "#c53030"
                      }}
                    >
                      {utilisateur.actif ? "Actif" : "Verrouillé"}
                    </div>

                    {/* Actions administrateur */}
                    {canManageUser(utilisateur) && (
                      <div style={styles.actionButtons}>
                        {/* Bouton Verrouiller/Déverrouiller */}
                        <button
                          style={{
                            ...styles.actionButton,
                            background: utilisateur.actif 
                              ? "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)"
                              : "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                            opacity: updatingUser === utilisateur.id ? 0.6 : 1,
                            cursor: updatingUser === utilisateur.id ? "not-allowed" : "pointer"
                          }}
                          onClick={() => toggleUserLock(utilisateur.id, utilisateur.actif, utilisateur.email)}
                          disabled={updatingUser === utilisateur.id}
                        >
                          {updatingUser === utilisateur.id 
                            ? "..." 
                            : utilisateur.actif 
                              ? "🔒" 
                              : "🔓"
                          }
                          {!screenSize.isMobile && (
                            <span style={{ marginLeft: "5px" }}>
                              {utilisateur.actif ? "Verrouiller" : "Déverrouiller"}
                            </span>
                          )}
                        </button>

                        {/* Bouton Supprimer */}
                        <button
                          style={{
                            ...styles.actionButton,
                            background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
                            opacity: updatingUser === utilisateur.id ? 0.6 : 1,
                            cursor: updatingUser === utilisateur.id ? "not-allowed" : "pointer"
                          }}
                          onClick={() => setConfirmDelete(utilisateur)}
                          disabled={updatingUser === utilisateur.id}
                        >
                          🗑️
                          {!screenSize.isMobile && (
                            <span style={{ marginLeft: "5px" }}>Supprimer</span>
                          )}
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
            <h2 style={styles.sectionTitle}>
              Invitations ({invitations.filter(i => i.statut === "pending").length} en attente)
            </h2>

            {invitations.length === 0 ? (
              <div style={{ textAlign: "center", color: "#6b7280", padding: "40px" }}>
                Aucune invitation envoyée
              </div>
            ) : (
              <div style={styles.invitationsContainer}>
                {invitations.map((invitation) => (
                  <div key={invitation.id} style={styles.invitationCard}>
                    <div style={styles.userInfo}>
                      <div style={{ fontWeight: 600, color: "#2d3748", marginBottom: "5px" }}>
                        {invitation.email}
                      </div>
                      <div style={{ fontSize: "0.8em", color: "#6b7280" }}>
                        Rôle: {invitation.role}
                      </div>
                    </div>
                    
                    <div
                      style={{
                        ...styles.statusBadge,
                        background: invitation.statut === "pending" ? "#fff3cd" : "#d4edda",
                        color: invitation.statut === "pending" ? "#856404" : "#155724"
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
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ marginBottom: "20px", color:"black", fontSize: screenSize.isMobile ? "1.3em" : "1.5em" }}>
              Inviter un utilisateur
            </h3>
            
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

              <div style={{ 
                display: "flex", 
                flexDirection: screenSize.isMobile ? "column" : "row",
                gap: "15px", 
                justifyContent: "flex-end",
                marginTop: "20px"
              }}>
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
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ 
              textAlign: "center", 
              marginBottom: "25px", 
              color: "#48bb78",
              fontSize: screenSize.isMobile ? "1.3em" : "1.5em"
            }}>
              Invitation créée!
            </h3>
            
            <div style={{ marginBottom: "20px", lineHeight: "1.5" }}>
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
                fontSize: screenSize.isMobile ? "0.9em" : "1.1em",
                fontWeight: "bold",
                textAlign: "center",
                margin: "10px 0",
                wordBreak: "break-all"
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
                fontSize: "0.8em",
                wordBreak: "break-all",
                margin: "10px 0",
                maxHeight: "100px",
                overflow: "auto"
              }}>
                {invitationCode.link}
              </div>
            </div>

            <div style={{ 
              display: "flex",
              flexDirection: screenSize.isMobile ? "column" : "row",
              gap: "10px", 
              marginBottom: "20px"
            }}>
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
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ 
              color: "#e53e3e", 
              marginBottom: "20px", 
              fontSize: screenSize.isMobile ? "1.3em" : "1.5em",
              textAlign: "center"
            }}>
              Confirmer la suppression
            </h3>
            
            <div style={{ 
              marginBottom: "25px", 
              fontSize: screenSize.isMobile ? "1em" : "1.1em", 
              lineHeight: "1.5" 
            }}>
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
              <p style={{ 
                color: "#e53e3e", 
                margin: "15px 0 0 0", 
                fontSize: screenSize.isMobile ? "0.9em" : "0.9em",
                textAlign: "center"
              }}>
                Cette action est <strong>irréversible</strong>. L'utilisateur ne pourra plus se connecter.
              </p>
            </div>

            <div style={{ 
              display: "flex", 
              flexDirection: screenSize.isMobile ? "column" : "row",
              gap: "15px", 
              justifyContent: "center" 
            }}>
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

      {/* Styles CSS injectés pour le scroll horizontal */}
      <style>
        {`
          /* Masquer les scrollbars sur mobile tout en gardant le scroll */
          .user-actions-scroll::-webkit-scrollbar {
            display: none;
          }
          
          .user-actions-scroll {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          
          /* Améliorer le scroll sur mobile */
          @media (max-width: 767px) {
            .user-actions-scroll {
              -webkit-overflow-scrolling: touch;
              scroll-behavior: smooth;
            }
            
            /* Indicateur visuel de scroll */
            .user-actions-scroll::after {
              content: '';
              position: absolute;
              right: 0;
              top: 0;
              bottom: 0;
              width: 20px;
              background: linear-gradient(to left, rgba(248, 250, 252, 1) 0%, rgba(248, 250, 252, 0) 100%);
              pointer-events: none;
            }
          }
          
          /* Transitions fluides pour tous les éléments interactifs */
          @media (prefers-reduced-motion: no-preference) {
            button, .user-card, .invitation-card {
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
          }
          
          /* Amélioration pour les écrans tactiles */
          @media (hover: none) and (pointer: coarse) {
            button:active {
              transform: scale(0.98);
            }
            
            .user-card:active {
              transform: translateY(1px);
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          }
          
          /* Focus visible pour l'accessibilité */
          button:focus-visible {
            outline: 2px solid #667eea;
            outline-offset: 2px;
          }
          
          /* Amélioration des modals sur très petits écrans */
          @media (max-width: 320px) {
            .modal-content {
              margin: 5px !important;
              padding: 15px !important;
            }
          }
          
          /* Mode paysage mobile */
          @media (max-height: 500px) and (max-width: 900px) {
            .modal-content {
              max-height: 85vh;
              overflow-y: auto;
            }
          }
          
          /* Animation d'apparition pour les notifications */
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          
          @keyframes slideInDown {
            from {
              transform: translateY(-100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          
          .notification-animation {
            animation: ${screenSize.isMobile ? 'slideInDown' : 'slideInRight'} 0.3s ease-out;
          }
          
          /* Optimisation pour les appareils à faible résolution */
          @media screen and (max-device-pixel-ratio: 1) {
            .user-card, .invitation-card {
              border-width: 1px;
            }
          }
          
          /* Amélioration du contraste pour les utilisateurs malvoyants */
          @media (prefers-contrast: high) {
            .user-card, .invitation-card {
              border-color: #000 !important;
              border-width: 2px !important;
            }
            
            .status-badge {
              border: 2px solid currentColor !important;
            }
          }
        `}
      </style>
    </div>
  );
}
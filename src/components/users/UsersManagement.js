// src/components/users/UsersManagement.js
// Version responsive + permissions GRANULAIRES + soft delete (désactiver/réactiver)
// - Archivage sous societe/{sid}/archives_users/{uid}
// - Invitations: ajoute emailLower pour matcher les règles Firestore

import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  Timestamp,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit,
  arrayRemove,
  arrayUnion,
} from "firebase/firestore";
import CustomPermissionsManager from "../CustomPermissionsManager";
import UserPermissionsDisplay from "../UserPermissionsDisplay";
import permissions, { PERMISSION_LABELS } from "../../utils/permissions";

/* =========================================================
 * 1) Définition des groupes → permissions fines (mapping)
 * ========================================================= */
const PERMISSION_GROUPS = {
  achats: ["voir_achats", "creer_achats", "modifier_achats"],
  // ventes: ["voir_ventes", "creer_ventes", "modifier_ventes"],
  // stock: ["voir_stock", "creer_stock", "modifier_stock"],
  // clients: ["voir_clients", "creer_clients", "modifier_clients"],
};

/* Legacy keys qui doivent être converties vers des clés fines */
const LEGACY_TO_GROUP = {
  achat: "achats",
  achats: "achats",
  ACHAT: "achats",
  ACHATS: "achats",
  "achats:*": "achats",
  "achat:*": "achats",
};

/* =========================================================
 * 2) Helpers de normalisation / migration
 * ========================================================= */
function uniq(arr) {
  return Array.from(new Set(arr));
}

/**
 * Normalise un tableau de permissions custom :
 * - Étend les clés globales vers les clés fines,
 * - retire toutes les globales,
 * - déduplique.
 */
function normalizeCustomPermissions(custom) {
  const input = Array.isArray(custom) ? custom : [];
  let changed = false;
  let output = [...input];

  // Étendre anciennes clés vers fines
  input.forEach((key) => {
    const maybeGroup = LEGACY_TO_GROUP[key] || LEGACY_TO_GROUP[key?.toLowerCase?.()] || null;
    if (maybeGroup && PERMISSION_GROUPS[maybeGroup]) {
      output = output.concat(PERMISSION_GROUPS[maybeGroup]);
      changed = true;
    }
  });

  // Retirer les globales
  const globalKeys = new Set([
    ...Object.keys(LEGACY_TO_GROUP),
    ...Object.keys(LEGACY_TO_GROUP).map((k) => k.toLowerCase()),
  ]);
  output = output.filter((k) => !globalKeys.has(k) && !globalKeys.has(k?.toLowerCase?.()));

  // Dédupliquer
  const deduped = uniq(output);
  if (deduped.length !== input.length || changed || deduped.some((k, i) => k !== input[i])) {
    changed = true;
  }

  return { normalized: deduped, changed };
}

function getDefaultPermissionsForRole(role) {
  const r = (role || "").toLowerCase();
  return Array.isArray(permissions[r]) ? permissions[r] : [];
}

/* =========================================================
 * 3) Composant principal
 * ========================================================= */
export default function UsersManagement() {
  const {
    user,
    societeId,
    role,
    loading,
    isOwner,
    canManageUsers, // selon ton contexte: bool ou fonction. On ne modifie pas son usage actuel.
    refreshCustomPermissions,
  } = useUserRole();

  // États
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("vendeuse");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [notification, setNotification] = useState(null);
  const [invitationCode, setInvitationCode] = useState(null);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [updatingUser, setUpdatingUser] = useState("");

  // Permissions personnalisées (dialogs)
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [viewPermissionsOpen, setViewPermissionsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Responsive
  const [screenSize, setScreenSize] = useState({
    isMobile: typeof window !== "undefined" ? window.innerWidth < 768 : true,
    isTablet: typeof window !== "undefined" ? window.innerWidth >= 768 && window.innerWidth < 1024 : false,
    isDesktop: typeof window !== "undefined" ? window.innerWidth >= 1024 : false,
  });

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        isMobile: window.innerWidth < 768,
        isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
        isDesktop: window.innerWidth >= 1024,
      });
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Accès
  const hasAccess = isOwner || ["pharmacien", "admin", "ADMIN", "docteur"].includes((role || "").toLowerCase());

  // ============== Utils d'affichage ==============
  const getExtraPermissionsCount = (userData) => {
    const defaults = getDefaultPermissionsForRole(userData.role);
    const custom = Array.isArray(userData.customPermissions) ? userData.customPermissions : [];
    return custom.filter((p) => !defaults.includes(p)).length;
  };

  const handleOpenPermissions = (userData) => {
    setSelectedUser(userData);
    setPermissionDialogOpen(true);
  };

  const handleViewPermissions = (userData) => {
    setSelectedUser(userData);
    setViewPermissionsOpen(true);
  };

  const handleClosePermissions = () => {
    setPermissionDialogOpen(false);
    setSelectedUser(null);
  };

  const handleCloseViewPermissions = () => {
    setViewPermissionsOpen(false);
    setSelectedUser(null);
  };

  // Après mise à jour (depuis CustomPermissionsManager) : on rafraîchit + re-normalise
  const handlePermissionsUpdated = async () => {
    await refreshCustomPermissions();

    if (user && societeId && hasAccess) {
      try {
        const qUsers = query(collection(db, "users"), where("societeId", "==", societeId));
        const snapshot = await getDocs(qUsers);
        const usersList = [];

        // Re-normaliser si anciennes clés
        const updates = [];
        snapshot.forEach((d) => {
          const userData = d.data();
          const rawCustom = userData.customPermissions || [];
          const { normalized, changed } = normalizeCustomPermissions(rawCustom);

          if (changed) {
            updates.push(
              updateDoc(doc(db, "users", d.id), {
                customPermissions: normalized,
                modifieLe: Timestamp.now(),
              }).catch((e) => console.error("Migration permissions (save) échouée:", e))
            );
          }

          usersList.push({
            id: d.id,
            email: userData.email,
            role: userData.role || "vendeuse",
            nom: userData.nom || "",
            prenom: userData.prenom || "",
            actif: userData.actif !== false,
            customPermissions: normalized,
          });
        });

        if (updates.length) await Promise.allSettled(updates);
        setUtilisateurs(usersList);
      } catch (error) {
        console.error("Erreur rechargement utilisateurs:", error);
      }
    }

    setNotification({ message: "Permissions mises à jour avec succès", type: "success" });
    setTimeout(() => setNotification(null), 3000);
  };

  /* ===========================
   * Chargement initial + MIGRATION
   * ===========================*/
  useEffect(() => {
    if (!user || !societeId || !hasAccess) return;

    const loadUsers = async () => {
      try {
        const qUsers = query(collection(db, "users"), where("societeId", "==", societeId));
        const snapshot = await getDocs(qUsers);
        const usersList = [];
        const updates = [];

        snapshot.forEach((d) => {
          const userData = d.data();
          // Normalisation / migration des permissions custom
          const rawCustom = userData.customPermissions || [];
          const { normalized, changed } = normalizeCustomPermissions(rawCustom);
          if (changed) {
            updates.push(
              updateDoc(doc(db, "users", d.id), {
                customPermissions: normalized,
                modifieLe: Timestamp.now(),
              }).catch((e) => console.error("Migration permissions (save) échouée:", e))
            );
          }

          usersList.push({
            id: d.id,
            email: userData.email,
            role: userData.role || "vendeuse",
            nom: userData.nom || "",
            prenom: userData.prenom || "",
            actif: userData.actif !== false,
            customPermissions: normalized,
          });
        });

        if (updates.length) await Promise.allSettled(updates);
        setUtilisateurs(usersList);
      } catch (error) {
        console.error("Erreur chargement utilisateurs:", error);
      }
    };

    const loadInvitations = async () => {
      try {
        const qInv = query(collection(db, "invitations"), where("societeId", "==", societeId), limit(20));
        const snapshot = await getDocs(qInv);
        const invitationsList = [];
        snapshot.forEach((d) => {
          const inviteData = d.data();
          invitationsList.push({
            id: d.id,
            email: inviteData.email,
            role: inviteData.role,
            statut: inviteData.statut || "pending",
            createdAt: inviteData.createdAt,
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

  // ====== Invitations ======
  const sendInvitation = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      setNotification({ message: "Veuillez saisir un email", type: "error" });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setSendingInvite(true);
    try {
      const emailLower = inviteEmail.trim().toLowerCase();
      const inviteToken =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);

      const invitationData = {
        email: emailLower,            // on garde l'email normalisé ici
        emailLower,                   // champ explicit pour les règles
        role: inviteRole,
        societeId,
        statut: "pending",
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
        invitePar: user.uid,
        inviteParEmail: user.email || "",
        inviteToken,                  // utilisé par AcceptInvitation et les règles
      };

      await setDoc(doc(collection(db, "invitations")), invitationData);

      const inviteLink = `${window.location.origin}/accept-invitation?token=${inviteToken}`;

      setInvitationCode({
        email: emailLower,
        token: inviteToken,
        link: inviteLink,
        role: inviteRole,
        expiresAt: invitationData.expiresAt,
      });

      setNotification({ message: `Invitation créée pour ${emailLower}`, type: "success" });
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

  /**
   * Soft delete complet :
   * - Si on désactive: archive snapshot + active:false + retire des membres
   * - Si on réactive : active:true + ré-ajoute dans membres
   */
  const toggleUserLock = async (userId, currentStatus, userEmail) => {
    if (updatingUser === userId) return;
    setUpdatingUser(userId);
    try {
      const userRef = doc(db, "users", userId);
      const snap = await getDoc(userRef);
      if (!snap.exists()) throw new Error("Le compte utilisateur n'existe pas.");
      const target = snap.data();

      if (target.societeId !== societeId) {
        throw new Error("Utilisateur d'une autre société ou non rattaché.");
      }

      if (currentStatus) {
        // === Désactivation ===
        // 1) archive snapshot
        const archiveRef = doc(db, "societe", societeId, "archives_users", userId);
        await setDoc(
          archiveRef,
          {
            snapshotAt: serverTimestamp(),
            snapshotBy: user.uid,
            user: {
              uid: userId,
              email: target.email || null,
              displayName: target.displayName || null,
              role: target.role || null,
              active: target.actif !== false,
              joinedAt: target.joinedAt || null,
            },
          },
          { merge: true }
        );

        // 2) Marquer inactif
        await updateDoc(userRef, {
          actif: false,
          disabledAt: serverTimestamp(),
          disabledBy: user.uid,
          disabledReason: "removed_by_admin",
          modifieLe: Timestamp.now(),
        });

        // 3) Retirer des membres
        await updateDoc(doc(db, "societe", societeId), {
          membres: arrayRemove(userId),
        });
      } else {
        // === Réactivation ===
        await updateDoc(userRef, {
          actif: true,
          reenabledAt: serverTimestamp(),
          reenabledBy: user.uid,
          modifieLe: Timestamp.now(),
        });

        // Ré-inscrire dans membres
        await updateDoc(doc(db, "societe", societeId), {
          membres: arrayUnion(userId),
        });
      }

      // Mise à jour locale
      setUtilisateurs((prev) => prev.map((u) => (u.id === userId ? { ...u, actif: !currentStatus } : u)));

      setNotification({
        message: `${userEmail} ${currentStatus ? "désactivé" : "réactivé"}`,
        type: "success",
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

  const canManageUser = (targetUser) => {
    if (targetUser.id === user?.uid) return false;
    if (["pharmacien", "docteur", "admin"].includes(targetUser.role?.toLowerCase())) return false;
    return ["pharmacien", "docteur", "admin"].includes(role?.toLowerCase()) || isOwner;
  };

  // ========== Styles ==========
  const getResponsiveStyles = () => {
    const { isMobile, isTablet, isDesktop } = screenSize;

    return {
      container: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        minHeight: "100vh",
        padding: isMobile ? "10px" : isTablet ? "15px" : "20px",
        fontFamily: "Inter, Arial, sans-serif",
        overflow: "auto",
      },
      card: {
        background: "white",
        borderRadius: isMobile ? "15px" : isTablet ? "20px" : "25px",
        boxShadow: "0 30px 60px rgba(0,0,0,0.15)",
        overflow: "hidden",
        margin: "0 auto",
        maxWidth: isDesktop ? "1200px" : "100%",
        width: "100%",
      },
      header: {
        background: "linear-gradient(135deg, #4a5568 0%, #2d3748 100%)",
        padding: isMobile ? "20px 15px" : isTablet ? "30px 20px" : "40px",
        textAlign: "center",
        color: "white",
      },
      title: {
        fontSize: isMobile ? "1.8em" : isTablet ? "2.2em" : "2.5em",
        fontWeight: 800,
        margin: 0,
        wordBreak: "break-word",
      },
      content: {
        padding: isMobile ? "15px" : isTablet ? "25px" : "40px",
      },
      sectionHeader: {
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "center",
        marginBottom: isMobile ? "20px" : "30px",
        gap: isMobile ? "15px" : "20px",
      },
      sectionTitle: {
        color: "#2d3748",
        margin: 0,
        fontSize: isMobile ? "1.3em" : isTablet ? "1.5em" : "1.8em",
        fontWeight: 700,
      },
      headerButtons: {
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: "10px",
        alignSelf: isMobile ? "stretch" : "auto",
      },
      button: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        border: "none",
        borderRadius: isMobile ? "8px" : "10px",
        padding: isMobile ? "12px 16px" : "12px 20px",
        color: "white",
        fontWeight: 700,
        cursor: "pointer",
        fontSize: isMobile ? "0.9em" : "1em",
        minHeight: isMobile ? "44px" : "auto",
        transition: "all 0.3s ease",
        width: isMobile ? "100%" : "auto",
      },
      usersContainer: {
        display: "grid",
        gap: isMobile ? "15px" : "20px",
        marginBottom: "40px",
      },
      userCard: {
        background: "#f8fafc",
        padding: isMobile ? "15px" : "20px",
        borderRadius: isMobile ? "10px" : "15px",
        border: "2px solid #e2e8f0",
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? "15px" : "20px",
        position: "relative",
      },
      userInfo: { flex: 1, minWidth: 0 },
      userName: {
        fontWeight: 700,
        color: "#2d3748",
        marginBottom: "5px",
        fontSize: isMobile ? "1em" : "1.1em",
        wordBreak: "break-word",
      },
      userDetails: {
        fontSize: isMobile ? "0.8em" : "0.9em",
        color: "#6b7280",
        wordBreak: "break-word",
      },
      permissionsInfo: {
        display: "flex",
        flexWrap: "wrap",
        gap: "5px",
        marginTop: "8px",
      },
      permissionChip: {
        background: "#e0f2fe",
        color: "#0277bd",
        fontSize: "0.75em",
        padding: "3px 8px",
        borderRadius: "12px",
        fontWeight: 600,
      },
      extraPermissionChip: {
        background: "#e8f5e8",
        color: "#2e7d2e",
        fontSize: "0.75em",
        padding: "3px 8px",
        borderRadius: "12px",
        fontWeight: 600,
      },
      userActions: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "15px",
        flexWrap: isMobile ? "wrap" : "nowrap",
      },
      statusBadge: {
        padding: "6px 12px",
        borderRadius: "12px",
        fontSize: "0.8em",
        fontWeight: 600,
        whiteSpace: "nowrap",
        flexShrink: 0,
      },
      actionButtons: {
        display: "flex",
        gap: "8px",
        flexShrink: 0,
        flexWrap: "wrap",
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
        transition: "all 0.3s ease",
      },
      permissionButton: {
        border: "none",
        borderRadius: isMobile ? "6px" : "8px",
        padding: isMobile ? "8px 12px" : "6px 10px",
        fontSize: isMobile ? "0.8em" : "0.75em",
        fontWeight: 600,
        cursor: "pointer",
        color: "white",
        minHeight: isMobile ? "36px" : "auto",
        transition: "all 0.3s ease",
        display: "flex",
        alignItems: "center",
        gap: "4px",
      },
      input: {
        width: "100%",
        padding: isMobile ? "14px 12px" : "12px",
        border: "2px solid ",
        borderRadius: "8px",
        marginBottom: "15px",
        fontSize: isMobile ? "16px" : "14px",
        minHeight: isMobile ? "44px" : "auto",
        boxSizing: "border-box",
      },
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
        padding: isMobile ? "10px" : "20px",
      },
      modalContent: {
        background: "white",
        borderRadius: isMobile ? "15px" : "20px",
        padding: isMobile ? "20px" : "30px",
        width: "100%",
        maxWidth: isMobile ? "100%" : isTablet ? "500px" : "400px",
        maxHeight: isMobile ? "90vh" : "80vh",
        overflow: "auto",
      },
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
        maxWidth: isMobile ? "calc(100vw - 20px)" : "400px",
      },
      invitationsContainer: {
        display: "grid",
        gap: isMobile ? "12px" : "15px",
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
        gap: isMobile ? "10px" : "15px",
      },
    };
  };

  const styles = getResponsiveStyles();

  // ====== Guards ======
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
        <div
          style={{
            textAlign: "center",
            color: "white",
            fontSize: "1.5em",
            paddingTop: "100px",
            padding: "20px",
          }}
        >
          Accès refusé. Seuls les administrateurs peuvent gérer les utilisateurs.
        </div>
      </div>
    );
  }

  const pendingInvites = invitations.filter((i) => i.statut === "pending");
  const showInvitationsSection = invitations.length > 0;

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
                background:
                  notification.type === "success"
                    ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)"
                    : "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)",
              }}
            >
              {notification.message}
            </div>
          )}

          {/* Section Utilisateurs */}
          <div style={{ marginBottom: "40px" }}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Équipe actuelle ({utilisateurs.length})</h2>

              <div style={styles.headerButtons}>
                <button
                  style={{
                    ...styles.button,
                    background: "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                  }}
                  onClick={() => setShowInviteForm(true)}
                >
                  Inviter un utilisateur
                </button>
              </div>
            </div>

            <div style={styles.usersContainer}>
              {utilisateurs.map((u) => {
                const extraCount = getExtraPermissionsCount(u);
                const achatsFins = (u.customPermissions || []).filter((p) =>
                  ["voir_achats", "creer_achats", "modifier_achats"].includes(p)
                );

                return (
                  <div key={u.id} style={styles.userCard}>
                    <div style={styles.userInfo}>
                      <div style={styles.userName}>
                        {u.prenom && u.nom ? `${u.prenom} ${u.nom}` : u.email}
                        {u.id === user?.uid && (
                          <span style={{ color: "#48bb78", fontSize: "0.8em", marginLeft: "10px" }}>
                            (Vous)
                          </span>
                        )}
                      </div>
                      <div style={styles.userDetails}>
                        {u.email} • {u.role === "docteur" ? "Pharmacien" : u.role || "Vendeuse"}
                      </div>

                      {/* Infos permissions */}
                      <div style={styles.permissionsInfo}>
                        <span style={styles.permissionChip}>
                          {getDefaultPermissionsForRole(u.role).length} permissions de base
                        </span>
                        {extraCount > 0 && (
                          <span style={styles.extraPermissionChip}>+{extraCount} permissions supplémentaires ✨</span>
                        )}
                        {achatsFins.length > 0 && (
                          <span style={styles.permissionChip}>
                            Achats: {achatsFins.map((p) => p.replace("_achats", "").toUpperCase()).join(" / ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={styles.userActions}>
                      <div
                        style={{
                          ...styles.statusBadge,
                          background: u.actif ? "#c6f6d5" : "#fed7d7",
                          color: u.actif ? "#22543d" : "#c53030",
                        }}
                      >
                        {u.actif ? "Actif" : "Désactivé"}
                      </div>

                      <div style={styles.actionButtons}>
                        {/* Voir permissions */}
                        <button
                          style={{
                            ...styles.permissionButton,
                            background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                          }}
                          onClick={() => handleViewPermissions(u)}
                          title="Voir les permissions"
                        >
                          👁️
                          {!screenSize.isMobile && <span style={{ marginLeft: 4 }}>Voir</span>}
                        </button>

                        {/* Gérer permissions personnalisées (vendeuse) */}
                        {u.role?.toLowerCase() === "vendeuse" &&
                          (typeof canManageUsers === "function" ? canManageUsers() : canManageUsers) && (
                            <button
                              style={{
                                ...styles.permissionButton,
                                background: "linear-gradient(135deg, #9f7aea 0%, #805ad5 100%)",
                              }}
                              onClick={() => handleOpenPermissions(u)}
                              title="Gérer les permissions personnalisées"
                            >
                              ⚙️
                              {!screenSize.isMobile && <span style={{ marginLeft: 4 }}>Permissions</span>}
                            </button>
                          )}

                        {/* Désactiver / Réactiver */}
                        {canManageUser(u) && (
                          <button
                            style={{
                              ...styles.actionButton,
                              background: u.actif
                                ? "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)"
                                : "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
                              opacity: updatingUser === u.id ? 0.6 : 1,
                              cursor: updatingUser === u.id ? "not-allowed" : "pointer",
                            }}
                            onClick={() => toggleUserLock(u.id, u.actif, u.email)}
                            disabled={updatingUser === u.id}
                            title={u.actif ? "Désactiver" : "Réactiver"}
                          >
                            {updatingUser === u.id ? "..." : u.actif ? "🚫" : "✅"}
                            {!screenSize.isMobile && (
                              <span style={{ marginLeft: 6 }}>{u.actif ? "Désactiver" : "Réactiver"}</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section Invitations */}
          {showInvitationsSection && (
            <div>
              <h2 style={styles.sectionTitle}>
                {pendingInvites.length > 0
                  ? `Invitations (${pendingInvites.length} en attente)`
                  : "Invitations"}
              </h2>

              <div style={styles.invitationsContainer}>
                {invitations.map((inv) => (
                  <div key={inv.id} style={styles.invitationCard}>
                    <div style={styles.userInfo}>
                      <div style={{ fontWeight: 600, color: "#2d3748", marginBottom: "5px" }}>{inv.email}</div>
                      <div style={{ fontSize: "0.8em", color: "#6b7280" }}>Rôle: {inv.role}</div>
                    </div>

                    <div
                      style={{
                        ...styles.statusBadge,
                        background: inv.statut === "pending" ? "#fff3cd" : "#d4edda",
                        color: inv.statut === "pending" ? "#856404" : "#155724",
                      }}
                    >
                      {inv.statut === "pending" ? "En attente" : "Acceptée"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals : Invitation */}
      {showInviteForm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3
              style={{
                marginBottom: "20px",
                color: "black",
                fontSize: screenSize.isMobile ? "1.3em" : "1.5em",
              }}
            >
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
                autoComplete="email"
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

              <div
                style={{
                  display: "flex",
                  flexDirection: screenSize.isMobile ? "column" : "row",
                  gap: "15px",
                  justifyContent: "flex-end",
                  marginTop: "20px",
                }}
              >
                <button
                  type="button"
                  style={{
                    ...styles.button,
                    background: "linear-gradient(135deg, #6b7280 0%, #4a5568 100%)",
                  }}
                  onClick={() => setShowInviteForm(false)}
                  disabled={sendingInvite}
                >
                  Annuler
                </button>
                <button type="submit" style={styles.button} disabled={sendingInvite}>
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
            <h3
              style={{
                textAlign: "center",
                marginBottom: "25px",
                color: "#48bb78",
                fontSize: screenSize.isMobile ? "1.3em" : "1.5em",
              }}
            >
              Invitation créée!
            </h3>

            <div style={{ marginBottom: "20px", lineHeight: "1.5" }}>
              <strong>Email:</strong> {invitationCode.email}
              <br />
              <strong>Rôle:</strong> {invitationCode.role}
            </div>

            <div style={{ marginBottom: "20px" }}>
              <strong>Code d'invitation:</strong>
              <div
                style={{
                  background: "#f7fafc",
                  padding: "10px",
                  borderRadius: "8px",
                  fontFamily: "monospace",
                  fontSize: screenSize.isMobile ? "0.9em" : "1.1em",
                  fontWeight: "bold",
                  textAlign: "center",
                  margin: "10px 0",
                  wordBreak: "break-all",
                }}
              >
                {invitationCode.token}
              </div>
            </div>

            <div style={{ marginBottom: "25px" }}>
              <strong>Lien complet:</strong>
              <div
                style={{
                  background: "#f7fafc",
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "0.8em",
                  wordBreak: "break-all",
                  margin: "10px 0",
                  maxHeight: "100px",
                  overflow: "auto",
                }}
              >
                {invitationCode.link}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: screenSize.isMobile ? "column" : "row",
                gap: "10px",
                marginBottom: "20px",
              }}
            >
              <button
                style={{
                  ...styles.button,
                  background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                  flex: 1,
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

      {/* Dialog Permissions (éditer) */}
      <CustomPermissionsManager
        open={permissionDialogOpen}
        onClose={handleClosePermissions}
        userId={selectedUser?.id}
        userName={
          selectedUser?.prenom && selectedUser?.nom
            ? `${selectedUser.prenom} ${selectedUser.nom}`
            : selectedUser?.email
        }
        societeId={societeId}
        onPermissionsUpdated={handlePermissionsUpdated}
      />

      {/* Dialog Voir permissions */}
      {viewPermissionsOpen && selectedUser && (
        <div style={styles.modalOverlay}>
          <div
            style={{
              ...styles.modalContent,
              maxWidth: screenSize.isMobile ? "100%" : "600px",
              maxHeight: "90vh",
            }}
          >
            <UserPermissionsDisplay
              user={{
                ...selectedUser,
                displayName:
                  selectedUser.prenom && selectedUser.nom
                    ? `${selectedUser.prenom} ${selectedUser.nom}`
                    : selectedUser.email,
              }}
              variant="dialog"
              showDetails={true}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "20px",
                paddingTop: "15px",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <button style={styles.button} onClick={handleCloseViewPermissions}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles supplémentaires */}
      <style>
        {`
          .user-actions-scroll::-webkit-scrollbar { display: none; }
          .user-actions-scroll { -ms-overflow-style: none; scrollbar-width: none; }

          @media (max-width: 767px) {
            .user-actions-scroll { -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
            .user-actions-scroll::after {
              content: '';
              position: absolute;
              right: 0; top: 0; bottom: 0;
              width: 20px;
              background: linear-gradient(to left, rgba(248, 250, 252, 1) 0%, rgba(248, 250, 252, 0) 100%);
              pointer-events: none;
            }
          }

          @media (prefers-reduced-motion: no-preference) {
            button, .user-card, .invitation-card {
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
          }

          @media (hover: none) and (pointer: coarse) {
            button:active { transform: scale(0.98); }
            .user-card:active { transform: translateY(1px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          }

          button:focus-visible {
            outline: 2px solid #667eea;
            outline-offset: 2px;
          }

          @media (max-width: 320px) {
            .modal-content { margin: 5px !important; padding: 15px !important; }
          }

          @media (max-height: 500px) and (max-width: 900px) {
            .modal-content { max-height: 85vh; overflow-y: auto; }
          }
        `}
      </style>
    </div>
  );
}

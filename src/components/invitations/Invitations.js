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
  arrayUnion,
} from "firebase/firestore";

export default function Invitations() {
  const { user, societeId, isOwner, role, societeName } = useUserRole();

  // États
  const [invitationCode, setInvitationCode] = useState("");
  const [societeInfo, setSocieteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Rejoindre une société (code 6 chars)
  const [joinCode, setJoinCode] = useState("");
  const [joiningLoading, setJoiningLoading] = useState(false);

  // Créer une invitation (par e-mail, lien accept-invitation)
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState("vendeuse");
  const [invDays, setInvDays] = useState(7);
  const [lastInviteLink, setLastInviteLink] = useState("");

  // Permissions
  const customPerms = user?.customPermissions || user?.permissions || [];
  const hasManageInvPerm =
    Array.isArray(customPerms) && customPerms.includes("manage_invitations");
  const canManageInvitations =
    isOwner || role === "admin" || role === "pharmacien" || hasManageInvPerm;

  // Charger infos société
  const fetchSocieteInfo = async () => {
    if (!societeId) {
      setLoading(false);
      return;
    }
    try {
      const societeRef = doc(db, "societe", societeId);
      const societeSnap = await getDoc(societeRef);
      if (societeSnap.exists()) {
        const data = societeSnap.data();
        setSocieteInfo(data);
        setInvitationCode(data.invitationCode || "");
      }
    } catch (err) {
      console.error("Erreur chargement société:", err);
      setError(
        err?.code === "permission-denied"
          ? "Permissions insuffisantes pour lire les informations de la pharmacie."
          : "Erreur lors du chargement des informations."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSocieteInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeId]);

  // Générer un code 6 caractères
  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  };

  // Générer un token d'invitation (pour lien accept-invitation)
  const generateInviteToken = (len = 24) => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let t = "";
    for (let i = 0; i < len; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
    return t;
  };

  // Régénérer le code (doc société)
  const handleGenerateNewCode = async () => {
    if (!canManageInvitations || !societeId) {
      setError("Seuls le propriétaire, l'admin ou le pharmacien peuvent régénérer le code.");
      return;
    }
    setError("");
    setSuccess("");
    setLastInviteLink("");

    try {
      // Générer un code unique
      let newCode;
      for (let attempts = 0; attempts < 10; attempts++) {
        const c = generateCode();
        const qSoc = query(collection(db, "societe"), where("invitationCode", "==", c));
        const snap = await getDocs(qSoc);
        if (snap.empty) {
          newCode = c;
          break;
        }
      }
      if (!newCode) {
        setError("Impossible de générer un code unique. Réessayez dans un instant.");
        return;
      }

      await updateDoc(doc(db, "societe", societeId), {
        invitationCode: newCode,
        invitationCodeUpdatedAt: serverTimestamp(),
        invitationCodeUpdatedBy: user.uid,
      });

      // Log activité
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "invitation_code_regenerated",
        userId: user.uid,
        userEmail: user.email || null,
        oldCode: invitationCode || null,
        newCode,
        timestamp: serverTimestamp(),
      });

      setInvitationCode(newCode);
      setSuccess("Nouveau code d'invitation généré avec succès !");
    } catch (err) {
      console.error("Erreur génération code:", err);
      setError(
        err?.code === "permission-denied"
          ? "Permissions insuffisantes pour régénérer le code."
          : "Erreur lors de la génération du nouveau code."
      );
    }
  };

  // Créer une invitation par e-mail (DOC **RACINE**: invitations)
  const handleCreateInvitation = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLastInviteLink("");

    if (!canManageInvitations || !societeId) {
      setError("Seuls le propriétaire, l'admin ou le pharmacien peuvent créer une invitation.");
      return;
    }
    if (!invEmail || !/\S+@\S+\.\S+/.test(invEmail)) {
      setError("Saisissez un e-mail valide pour l'invitation.");
      return;
    }
    if (!["vendeuse", "pharmacien", "admin"].includes(invRole)) {
      setError("Rôle d'invitation invalide.");
      return;
    }

    const days = Math.max(1, Math.min(60, Number(invDays) || 7));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    // Normalisation e-mail
    const emailTrim = invEmail.trim();
    const emailLower = emailTrim.toLowerCase();

    try {
      // Vérifie si une invitation 'pending' existe déjà pour cet email/société
      const qPending = query(
        collection(db, "invitations"),
        where("emailLower", "==", emailLower),
        where("societeId", "==", societeId),
        where("statut", "==", "pending")
      );
      const snapPending = await getDocs(qPending);
      if (!snapPending.empty) {
        setError("Une invitation en attente existe déjà pour cet e-mail.");
        return;
      }

      // Génère un token unique (simple et suffisant)
      const inviteToken = generateInviteToken(28);

      // Crée l'invitation en **racine**
      const invRef = await addDoc(collection(db, "invitations"), {
        email: emailTrim,
        emailLower,               // <— important pour les règles
        societeId,
        role: invRole,
        inviteToken,
        statut: "pending",        // (aligné avec AcceptInvitation.js)
        createdAt: serverTimestamp(),
        expiresAt,                // JS Date -> Timestamp côté Firestore
        invitePar: user.uid,
        inviteParEmail: user.email || null,
      });

      // Log activité côté société (optionnel mais utile)
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "invitation_email_created",
        userId: user.uid,
        userEmail: user.email || null,
        inviteEmail: emailTrim,
        inviteRole: invRole,
        invitationId: invRef.id,
        timestamp: serverTimestamp(),
      });

      // Lien d'invitation (utilisable par l'invité)
      const link = `${window.location.origin}/accept-invitation?token=${inviteToken}`;
      setLastInviteLink(link);

      setSuccess("Invitation créée avec succès ! Lien prêt à être partagé.");
      setInvEmail("");
      setInvRole("vendeuse");
      setInvDays(7);
    } catch (err) {
      console.error("Erreur création invitation:", err);
      setError(
        err?.code === "permission-denied"
          ? "Permissions insuffisantes pour créer l'invitation."
          : "Erreur lors de la création de l'invitation."
      );
    }
  };

  // Rejoindre une société avec un code (utilisateur SANS société)
  const handleJoinSociete = async (e) => {
    e.preventDefault();

    if (!user || !joinCode.trim()) {
      setError("Veuillez saisir un code d'invitation.");
      return;
    }

    const code = joinCode.toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError("Format de code invalide (6 caractères alphanumériques).");
      return;
    }

    setJoiningLoading(true);
    setError("");
    setSuccess("");
    setLastInviteLink("");

    try {
      // Chercher la société par code
      const qSoc = query(collection(db, "societe"), where("invitationCode", "==", code));
      const snap = await getDocs(qSoc);

      if (snap.empty) {
        setError("Code d'invitation invalide ou expiré.");
        setJoiningLoading(false);
        return;
      }

      const societeDoc = snap.docs[0];
      const societeData = societeDoc.data();
      const newSocieteId = societeDoc.id;

      // ⚠️ Suivant tes règles, cette étape peut être refusée pour un user sans société.
      // Si c'est le cas, privilégie le flux par e-mail + invitation (AcceptInvitation).
      await updateDoc(doc(db, "societe", newSocieteId), {
        membres: arrayUnion(user.uid),
      });

      await updateDoc(doc(db, "users", user.uid), {
        societeId: newSocieteId,
        role: "vendeuse",
        joinedAt: serverTimestamp(),
        invitedBy: societeData.ownerId || societeData.createdBy || null,
      });

      await addDoc(collection(db, "societe", newSocieteId, "activities"), {
        type: "member_joined_with_code",
        userId: user.uid,
        userEmail: user.email || null,
        invitationCode: code,
        timestamp: serverTimestamp(),
      });

      setSuccess(`Vous avez rejoint la pharmacie "${societeData.nom}" avec succès !`);
      setJoinCode("");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error("Erreur rejoindre société:", err);
      setError(
        err?.code === "permission-denied"
          ? "Permissions insuffisantes pour rejoindre. Utilisez le lien d'invitation reçu par e-mail ou contactez le propriétaire."
          : "Erreur lors de la tentative de rejoindre la pharmacie."
      );
    } finally {
      setJoiningLoading(false);
    }
  };

  // Copier dans le presse-papier
  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSuccess("Copié dans le presse-papier !");
      setTimeout(() => setSuccess(""), 1800);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setSuccess("Copié !");
      setTimeout(() => setSuccess(""), 1800);
    }
  };

  const handleCopyCode = () => handleCopy(invitationCode);
  const handleCopyInviteLink = () => lastInviteLink && handleCopy(lastInviteLink);

  if (loading) {
    return <div style={{ padding: 30, textAlign: "center" }}>Chargement...</div>;
  }

  // Si l'utilisateur n'a pas de société
  if (!societeId) {
    return (
      <div className="fullscreen-table-wrap">
        <div className="fullscreen-table-title">Rejoindre une pharmacie</div>

        {error && (
          <div style={{ padding: "12px 20px", background: "#fee2e2", color: "#dc2626", borderRadius: 6, margin: "10px 0" }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ padding: "12px 20px", background: "#dcfce7", color: "#16a34a", borderRadius: 6, margin: "10px 0" }}>
            {success}
          </div>
        )}

        <div className="paper-card" style={{ maxWidth: 520, margin: "20px auto" }}>
          <h3 style={{ color: "#1f2937", marginBottom: 20 }}>Vous n'êtes rattaché à aucune pharmacie</h3>
          <p style={{ color: "#6b7280", marginBottom: 25 }}>
            Pour accéder aux fonctionnalités, rejoignez une pharmacie avec un code d'invitation.
          </p>

          <form onSubmit={handleJoinSociete}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 14, color: "#374151", marginBottom: 8, fontWeight: 600 }}>
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
                  padding: 12,
                  border: "2px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 16,
                  textAlign: "center",
                  letterSpacing: "4px",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={joiningLoading}
              className="btn"
              style={{ width: "100%", background: "linear-gradient(90deg, #059669 0%, #34d399 100%)", fontSize: 16 }}
            >
              {joiningLoading ? "Vérification..." : "Rejoindre la pharmacie"}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: 15, background: "#f0f9ff", borderRadius: 6, border: "1px solid #bae6fd" }}>
            <h4 style={{ color: "#0369a1", margin: "0 0 8px 0", fontSize: 14 }}>Comment obtenir un code d'invitation ?</h4>
            <p style={{ color: "#0c4a6e", margin: 0, fontSize: 13 }}>
              Demandez au propriétaire de votre pharmacie le code d'invitation depuis son interface.
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
        Invitations — {societeName || "Pharmacie"}
      </div>

      {error && (
        <div style={{ padding: "12px 20px", background: "#fee2e2", color: "#dc2626", borderRadius: 6, margin: "10px 0" }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: "12px 20px", background: "#dcfce7", color: "#16a34a", borderRadius: 6, margin: "10px 0" }}>
          {success}
        </div>
      )}

      {/* Code d'invitation actuel (doc société) */}
      <div className="paper-card">
        <h3 style={{ color: "#1f2937", marginBottom: 15 }}>Code d'invitation de votre pharmacie</h3>

        <div style={{ display: "flex", alignItems: "center", gap: 15, padding: 20, background: "#f8fafc", borderRadius: 8, border: "2px solid #e2e8f0" }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: "bold",
                color: "#2563eb",
                letterSpacing: "8px",
                textAlign: "center",
                background: "white",
                padding: 15,
                borderRadius: 8,
                border: "2px solid #dbeafe",
                fontFamily: "monospace",
              }}
            >
              {invitationCode || "Aucun code"}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={handleCopyCode} className="btn success" style={{ minWidth: 120 }} disabled={!invitationCode}>
              Copier le code
            </button>

            {canManageInvitations && (
              <button
                onClick={handleGenerateNewCode}
                className="btn"
                style={{ minWidth: 120, background: "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)" }}
              >
                Nouveau code
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 15, color: "#6b7280", fontSize: 14 }}>
          {canManageInvitations ? (
            <p>Partagez ce code avec vos employés. Vous pouvez le régénérer à tout moment.</p>
          ) : (
            <p>Ce code permet aux nouveaux employés de rejoindre la pharmacie.</p>
          )}
        </div>
      </div>

      {/* Création d'une invitation PAR E-MAIL (doc RACINE: invitations) */}
      {canManageInvitations && (
        <div className="paper-card" style={{ marginTop: 20 }}>
          <h3 style={{ color: "#1f2937", marginBottom: 15 }}>Créer une invitation par e-mail</h3>

          <form onSubmit={handleCreateInvitation} style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>E-mail de la personne à inviter</label>
              <input
                type="email"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="ex: nom.prenom@email.com"
                style={{ width: "100%", padding: 12, border: "2px solid #d1d5db", borderRadius: 8, fontSize: 16 }}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>Rôle suggéré</label>
                <select
                  value={invRole}
                  onChange={(e) => setInvRole(e.target.value)}
                  style={{ width: "100%", padding: 12, border: "2px solid #d1d5db", borderRadius: 8, fontSize: 16, background: "white" }}
                >
                  <option value="vendeuse">Vendeuse</option>
                  <option value="pharmacien">Pharmacien</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 14, color: "#374151", fontWeight: 600 }}>Expiration (jours)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={invDays}
                  onChange={(e) => setInvDays(e.target.value)}
                  style={{ width: "100%", padding: 12, border: "2px solid #d1d5db", borderRadius: 8, fontSize: 16 }}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="btn"
                style={{ background: "linear-gradient(90deg, #2563eb 0%, #60a5fa 100%)", fontSize: 16 }}
              >
                Créer l'invitation
              </button>
            </div>

            {lastInviteLink && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <input
                  type="text"
                  readOnly
                  value={lastInviteLink}
                  style={{ flex: 1, padding: 10, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                />
                <button type="button" onClick={handleCopyInviteLink} className="btn" style={{ whiteSpace: "nowrap" }}>
                  Copier le lien
                </button>
              </div>
            )}

            <p style={{ color: "#6b7280", fontSize: 13 }}>
              L'invitation est enregistrée dans la collection <code>invitations</code> (racine).
              Le destinataire utilisera le lien fourni pour créer son compte.
            </p>
          </form>
        </div>
      )}

      {/* Infos société */}
      {societeInfo && (
        <div className="paper-card" style={{ marginTop: 20 }}>
          <h3 style={{ color: "#1f2937", marginBottom: 15 }}>Informations de la pharmacie</h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15 }}>
            <div>
              <strong style={{ color: "#111827" }}>Nom :</strong>
              <p style={{ margin: "5px 0 0 0", color: "#6b7280" }}>{societeInfo.nom}</p>
            </div>

            <div>
              <strong style={{ color: "#111827" }}>Adresse :</strong>
              <p style={{ margin: "5px 0 0 0", color: "#6b7280" }}>{societeInfo.adresse}</p>
            </div>

            {societeInfo.telephone && (
              <div>
                <strong style={{ color: "#111827" }}>Téléphone :</strong>
                <p style={{ margin: "5px 0 0 0", color: "#6b7280" }}>{societeInfo.telephone}</p>
              </div>
            )}

            <div>
              <strong style={{ color: "#111827" }}>Créée le :</strong>
              <p style={{ margin: "5px 0 0 0", color: "#6b7280" }}>
                {societeInfo.createdAt?.toDate?.()?.toLocaleDateString?.() || "N/A"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Guide */}
      <div style={{ background: "#f0f9ff", padding: 20, borderRadius: 8, border: "1px solid #bae6fd", marginTop: 20 }}>
        <h4 style={{ color: "#0369a1", margin: "0 0 10px 0" }}>Comment inviter de nouveaux employés :</h4>
        <ol style={{ color: "#0c4a6e", paddingLeft: 20 }}>
          <li>Créez une invitation par e-mail (Owner/Admin/Pharmacien ou permission “manage_invitations”).</li>
          <li>Partagez le lien généré (bouton “Copier le lien”).</li>
          <li>La personne ouvre le lien et termine l’inscription (AcceptInvitation).</li>
          <li>Elle arrive automatiquement avec le rôle choisi (modifiable ensuite).</li>
        </ol>
      </div>
    </div>
  );
}

// src/components/auth/AcceptInvitation.js
import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../../firebase/config";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [step, setStep] = useState("verification"); // verification | register | complete
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    prenom: "",
    nom: "",
    telephone: "",
  });

  /* ================== Vérification du token ================== */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!token) throw new Error("Token d'invitation manquant.");

        const invitationsRef = collection(db, "invitations");
        const q = query(invitationsRef, where("inviteToken", "==", token));
        const snap = await getDocs(q);

        if (snap.empty) throw new Error("Invitation introuvable ou expirée.");

        const invDoc = snap.docs[0];
        const data = invDoc.data();

        const exp = data?.expiresAt?.toDate ? data.expiresAt.toDate() : null;
        if (exp && new Date() > exp) throw new Error("Cette invitation a expiré.");
        if (data?.statut && data.statut !== "pending") throw new Error("Cette invitation n'est plus valide.");

        if (mounted) {
          setInvitation({ id: invDoc.id, ...data });
          setFormData((p) => ({ ...p, email: data?.email || "" }));
          setStep("register");
        }
      } catch (e) {
        if (mounted) setErr(e.message || "Erreur lors de la vérification.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [token]);

  /* ================== Handlers ================== */
  const handleChange = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!invitation) return setErr("Invitation invalide.");
    if (formData.password !== formData.confirmPassword)
      return setErr("Les mots de passe ne correspondent pas.");
    if ((formData.password || "").length < 6)
      return setErr("Le mot de passe doit contenir au moins 6 caractères.");

    setSubmitting(true);
    try {
      const { password, prenom, nom, telephone } = formData;
      const { societeId, role, inviteToken, email: inviteEmail } = invitation;

      // 1) Créer le compte OU se connecter si l'email existe déjà
      let cred = null;
      try {
        cred = await createUserWithEmailAndPassword(auth, inviteEmail, password);
      } catch (e) {
        if (e?.code === "auth/email-already-in-use") {
          cred = await signInWithEmailAndPassword(auth, inviteEmail, password);
        } else {
          throw e;
        }
      }

      const uid = cred.user.uid;
      const authEmail = cred.user.email; // email exact selon Auth

      // 1bis) Afficher un nom si dispo
      const displayName = [prenom, nom].filter(Boolean).join(" ").trim();
      if (displayName) {
        try { await updateProfile(cred.user, { displayName }); } catch {}
      }

      // 2) Attacher l'utilisateur via users/{uid}
      await setDoc(
        doc(db, "users", uid),
        {
          email: authEmail,                 // <— doit égaler myEmail() ET invitation.email
          displayName: displayName || cred.user.displayName || null,
          role: role || "vendeuse",
          isOwner: false,
          societeId,                        // <— même valeur que dans l'invitation
          prenom: prenom?.trim() || null,
          nom: nom?.trim() || null,
          telephone: (telephone || "").trim(),
          active: true,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          createdByInvitation: invitation.id, // <— vérifié par les règles
          inviteToken: inviteToken || token,  // (facultatif désormais)
        },
        { merge: true }
      );

      // 3) Supprimer l’invitation (non bloquant)
      try {
        await deleteDoc(doc(db, "invitations", invitation.id));
      } catch {}

      setStep("complete");
    } catch (e) {
      console.error("Erreur accept-invitation:", e);
      if (String(e?.code || "").includes("auth/wrong-password")) {
        setErr("Mot de passe incorrect pour cet email. Si vous n’avez pas de compte, choisissez un nouveau mot de passe.");
      } else if (String(e?.code || "").includes("auth/user-not-found")) {
        setErr("Aucun compte avec cet email. Saisissez un mot de passe pour créer le compte.");
      } else if (String(e?.message || "").includes("Missing or insufficient permissions")) {
        setErr("Permissions insuffisantes. Vérifiez que l’invitation correspond EXACTEMENT à l’email et à la société.");
      } else {
        setErr(e?.message || "Erreur lors de l'inscription.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ================== UI (identique) ================== */
  const styles = {
    container: { minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "Inter, Arial, sans-serif" },
    card: { background: "white", borderRadius: "25px", padding: "40px", maxWidth: "500px", width: "100%", boxShadow: "0 30px 60px rgba(0,0,0,0.15)", textAlign: "center" },
    title: { fontSize: "2em", fontWeight: "800", color: "#2d3748", marginBottom: "10px" },
    subtitle: { color: "#6b7280", marginBottom: "30px", fontSize: "1.1em" },
    input: { width: "100%", padding: "15px", border: "2px solid #e2e8f0", borderRadius: "12px", fontSize: "1em", fontWeight: "600", marginBottom: "15px", transition: "border-color 0.3s ease", boxSizing: "border-box" },
    button: { background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", border: "none", borderRadius: "12px", padding: "15px 30px", color: "white", fontWeight: "700", fontSize: "1em", cursor: "pointer", width: "100%", transition: "all 0.3s ease", marginTop: "20px" },
    buttonDisabled: { background: "#9ca3af", cursor: "not-allowed" },
    error: { background: "linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%)", color: "#c53030", padding: "15px", borderRadius: "12px", marginBottom: "20px", fontWeight: "600" },
    success: { background: "linear-gradient(135deg, #c6f6d5 0%, #9ae6b4 100%)", color: "#22543d", padding: "20px", borderRadius: "12px", marginBottom: "20px" },
    roleType: { display: "inline-block", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "5px 15px", borderRadius: "20px", fontSize: "0.9em", fontWeight: "600", margin: "0 5px" },
  };

  if (loading) return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ fontSize: "3em", marginBottom: "20px" }}>⏳</div>
        <h2 style={styles.title}>Vérification…</h2>
        <p style={styles.subtitle}>Vérification de votre invitation en cours</p>
      </div>
    </div>
  );

  if (err && step === "verification") return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ fontSize: "3em", marginBottom: "20px", color: "#e53e3e" }}>❌</div>
        <h2 style={styles.title}>Invitation invalide</h2>
        <div style={styles.error}>{err}</div>
        <button style={styles.button} onClick={() => navigate("/login")}>Retour à la connexion</button>
      </div>
    </div>
  );

  if (step === "complete") return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ fontSize: "3em", marginBottom: "20px", color: "#48bb78" }}>✅</div>
        <h2 style={styles.title}>Bienvenue dans l'équipe !</h2>
        <div style={styles.success}>
          <p><strong>Inscription réussie !</strong></p>
          <p>Votre compte a été créé avec le rôle <span style={styles.roleType}>{invitation?.role || "vendeuse"}</span></p>
          <p>Vous pouvez maintenant accéder à votre espace de travail.</p>
        </div>
        <button style={styles.button} onClick={() => navigate("/dashboard")}>Accéder au tableau de bord</button>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ fontSize: "3em", marginBottom: "20px" }}>👥</div>
        <h2 style={styles.title}>Rejoindre l'équipe</h2>
        <p style={styles.subtitle}>
          Vous avez été invité(e) en tant que <span style={styles.roleType}>{invitation?.role || "vendeuse"}</span>
        </p>

        {err && <div style={styles.error}>{err}</div>}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            style={{ ...styles.input, backgroundColor: "#f7fafc", cursor: "not-allowed" }}
            placeholder="Email"
            value={formData.email}
            readOnly
            autoComplete="email"
          />

          <input
            type="password"
            style={styles.input}
            placeholder="Mot de passe (min. 6 caractères)"
            value={formData.password}
            onChange={(e) => handleChange("password", e.target.value)}
            required
            disabled={submitting}
            autoComplete="new-password"
          />

          <input
            type="password"
            style={styles.input}
            placeholder="Confirmer le mot de passe"
            value={formData.confirmPassword}
            onChange={(e) => handleChange("confirmPassword", e.target.value)}
            required
            disabled={submitting}
            autoComplete="new-password"
          />

          <input
            type="text"
            style={styles.input}
            placeholder="Prénom"
            value={formData.prenom}
            onChange={(e) => handleChange("prenom", e.target.value)}
            disabled={submitting}
            autoComplete="given-name"
          />

          <input
            type="text"
            style={styles.input}
            placeholder="Nom"
            value={formData.nom}
            onChange={(e) => handleChange("nom", e.target.value)}
            disabled={submitting}
            autoComplete="family-name"
          />

          <input
            type="tel"
            style={styles.input}
            placeholder="Téléphone (optionnel)"
            value={formData.telephone}
            onChange={(e) => handleChange("telephone", e.target.value)}
            disabled={submitting}
            autoComplete="tel"
          />

          <button
            type="submit"
            style={{ ...styles.button, ...(submitting ? styles.buttonDisabled : {}) }}
            disabled={submitting}
          >
            {submitting ? "Inscription en cours…" : "Créer mon compte"}
          </button>
        </form>

        <div style={{ marginTop: "30px", padding: "15px", background: "#f7fafc", borderRadius: "10px", fontSize: "0.9em", color: "#4a5568" }}>
          <p style={{ margin: "0 0 10px 0" }}><strong>Vous avez déjà un compte ?</strong></p>
          <button
            style={{ background: "transparent", border: "2px solid #667eea", color: "#667eea", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "0.9em" }}
            onClick={() => navigate("/login")}
          >
            Se connecter
          </button>
        </div>
      </div>
    </div>
  );
}

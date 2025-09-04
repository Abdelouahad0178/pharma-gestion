// src/components/auth/Register.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { doc, setDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";

export default function Register() {
  const navigate = useNavigate();

  // Champs compte
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Champs nouvelle société
  const [pharmaName, setPharmaName] = useState("");
  const [pharmaAddress, setPharmaAddress] = useState("");
  const [pharmaPhone, setPharmaPhone] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // -------- Helpers --------
  const clearErrors = () => {
    setError("");
    setSuccess("");
  };

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  };

  const generateUniqueInviteCode = async (maxTry = 8) => {
    for (let i = 0; i < maxTry; i++) {
      const c = generateCode();
      const q = query(collection(db, "societe"), where("invitationCode", "==", c));
      const snap = await getDocs(q);
      if (snap.empty) return c;
    }
    throw new Error("Impossible de générer un code unique. Réessayez.");
  };

  const newSocieteIdFor = (uid) => `societe_${uid}_${Date.now()}`;

  // -------- Flow: création d'une nouvelle société --------
  const handleCreateCompany = async (e) => {
    e?.preventDefault?.();

    // Validation
    const emailTrim = email.trim();
    const dnameTrim = displayName.trim();
    const pharmaNameTrim = pharmaName.trim();
    const pharmaAddressTrim = pharmaAddress.trim();
    const pharmaPhoneTrim = pharmaPhone.trim();

    if (!emailTrim || !password || !confirmPassword) {
      setError("Veuillez remplir vos informations de compte.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (!pharmaNameTrim || !pharmaAddressTrim) {
      setError("Veuillez renseigner le nom et l'adresse de la pharmacie.");
      return;
    }

    setLoading(true);
    clearErrors();

    try {
      // 1) Créer le compte
      const cred = await createUserWithEmailAndPassword(auth, emailTrim, password);
      const uid = cred.user.uid;

      // Affichage nom si fourni (facultatif)
      if (dnameTrim) {
        try {
          await updateProfile(cred.user, { displayName: dnameTrim });
        } catch {}
      }

      // 2) Générer code d'invitation unique (pour inviter des employés plus tard)
      const invite = await generateUniqueInviteCode();

      // 3) Créer la société
      const societeId = newSocieteIdFor(uid);
      await setDoc(doc(db, "societe", societeId), {
        nom: pharmaNameTrim,
        adresse: pharmaAddressTrim,
        telephone: pharmaPhoneTrim || "",
        invitationCode: invite,          // Disponible pour inviter plus tard
        membres: [uid],                   // Le créateur est membre
        ownerId: uid,                     // Propriétaire permanent
        createdBy: uid,
        createdAt: serverTimestamp(),
        active: true,
        plan: "basic",
      });

      // 4) Créer/compléter le doc utilisateur - CRÉATEUR = PROPRIÉTAIRE
      await setDoc(
        doc(db, "users", uid),
        {
          email: emailTrim,
          displayName: dnameTrim || null,
          role: "docteur",             // Rôle admin
          societeId,                    // Lien vers la société
          isOwner: true,                // Propriétaire permanent
          locked: false,
          active: true,
          adminPopup: null,
          paymentWarning: null,
          createdAt: serverTimestamp(),
          createdBy: uid,
        },
        { merge: true }
      );

      setSuccess("Pharmacie créée avec succès. Vous êtes le propriétaire permanent.");
      navigate("/dashboard");
    } catch (e) {
      console.error(e);
      if (e?.code === "auth/email-already-in-use") {
        setError("Un compte existe déjà avec cet email.");
      } else if (e?.code === "auth/weak-password") {
        setError("Le mot de passe doit contenir au moins 6 caractères.");
      } else {
        setError("Erreur lors de la création de la pharmacie.");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setEmail("");
    setDisplayName("");
    setPassword("");
    setConfirmPassword("");
    setPharmaName("");
    setPharmaAddress("");
    setPharmaPhone("");
    clearErrors();
  };

  // -------- UI --------
  return (
    <div
      className="fullscreen-table-wrap"
      style={{
        minHeight: "100vh",
        justifyContent: "center",
        alignItems: "center",
        display: "flex",
        background: "linear-gradient(120deg, #19392a 0%, #1e6939 100%)",
      }}
    >
      <div
        className="paper-card"
        style={{
          maxWidth: 560,
          width: "96%",
          margin: "0 auto",
          borderRadius: 18,
          padding: "30px 28px 26px 28px",
        }}
      >
        <div
          className="fullscreen-table-title"
          style={{
            background: "#224d32",
            color: "#f1f5fb",
            fontSize: "1.38rem",
            textAlign: "center",
          }}
        >
          Créer un compte (Propriétaire)
        </div>

        {error && (
          <div className="status-chip danger" style={{ margin: "18px auto" }}>
            {error}
          </div>
        )}
        {success && (
          <div className="status-chip success" style={{ margin: "18px auto" }}>
            {success}
          </div>
        )}

        {/* Formulaire : Création d'une nouvelle société (unique) */}
        <form onSubmit={handleCreateCompany} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
          <div
            style={{
              background: "#e8f5e8",
              padding: 15,
              borderRadius: 8,
              border: "1px solid #4caf50",
            }}
          >
            <h4 style={{ color: "#2e7d32", margin: 0 }}>👑 Création d'une nouvelle pharmacie</h4>
            <p style={{ color: "#1b5e20", margin: "6px 0 0 0", fontSize: "0.9em" }}>
              Vous serez créé en tant que <strong>propriétaire permanent</strong> avec tous les privilèges.
              Vous pourrez inviter des employés plus tard avec un code d'invitation.
            </p>
          </div>

          {/* Compte */}
          <input
            className="input"
            type="text"
            placeholder="Nom (facultatif)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            className="input"
            type="email"
            placeholder="Email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className="input"
            type="password"
            placeholder="Mot de passe (min. 6 caractères) *"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <input
            className="input"
            type="password"
            placeholder="Confirmer le mot de passe *"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          {/* Pharmacie */}
          <input
            className="input"
            type="text"
            placeholder="Nom de la pharmacie *"
            value={pharmaName}
            onChange={(e) => setPharmaName(e.target.value)}
            required
          />
          <input
            className="input"
            type="text"
            placeholder="Adresse *"
            value={pharmaAddress}
            onChange={(e) => setPharmaAddress(e.target.value)}
            required
          />
          <input
            className="input"
            type="tel"
            placeholder="Téléphone (optionnel)"
            value={pharmaPhone}
            onChange={(e) => setPharmaPhone(e.target.value)}
          />

          <button className="btn" disabled={loading} style={{ fontSize: "1.05rem" }}>
            {loading ? "Création…" : "👑 Créer ma pharmacie (Propriétaire)"}
          </button>

          <button
            type="button"
            style={{
              background: "transparent",
              border: "1px solid #7ee4e6",
              color: "#7ee4e6",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer",
              width: "100%",
            }}
            onClick={resetAll}
          >
            Réinitialiser le formulaire
          </button>
        </form>

        {/* Lien connexion */}
        <div
          style={{
            marginTop: 20,
            color: "#e1e6ef",
            textAlign: "center",
            fontSize: "1.04rem",
          }}
        >
          Vous avez déjà un compte ?
          <button
            className="btn-neumorph"
            style={{
              background: "transparent",
              color: "#5bed98",
              border: "none",
              marginLeft: 9,
              fontWeight: 700,
              boxShadow: "none",
              padding: 0,
            }}
            onClick={() => navigate("/login")}
            type="button"
          >
            Connectez-vous
          </button>
        </div>
      </div>
    </div>
  );
}

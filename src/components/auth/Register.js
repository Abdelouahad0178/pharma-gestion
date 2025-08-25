// src/components/auth/Register.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";

export default function Register() {
  const navigate = useNavigate();

  // Choix du type d'inscription
  const [registrationType, setRegistrationType] = useState(""); // "new_company" | "invitation"

  // Champs compte
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Champs invitation
  const [invitationCode, setInvitationCode] = useState("");

  // Champs nouvelle société
  const [pharmaName, setPharmaName] = useState("");
  const [pharmaAddress, setPharmaAddress] = useState("");
  const [pharmaPhone, setPharmaPhone] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // -------- Helpers --------
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

  const clearErrors = () => {
    setError("");
    setSuccess("");
  };

  // -------- Flows --------
  const handleCreateCompany = async () => {
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

      // 2) Générer code d'invitation unique
      const invite = await generateUniqueInviteCode();

      // 3) Créer la société
      const societeId = newSocieteIdFor(uid);
      await setDoc(doc(db, "societe", societeId), {
        nom: pharmaNameTrim,                // <- Nom humain utilisé par l'UI
        adresse: pharmaAddressTrim,
        telephone: pharmaPhoneTrim || "",
        invitationCode: invite,            // <- Code partagé aux collaborateurs
        membres: [uid],                    // <- Le créateur est membre
        ownerId: uid,                      // <- NOUVEAU: ID du propriétaire permanent
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
          role: "docteur",                 // <- Admin
          societeId,                       // <- Lien vers la société
          isOwner: true,                   // <- NOUVEAU: Le créateur est propriétaire permanent
          locked: false,
          active: true,
          adminPopup: null,
          paymentWarning: null,
          createdAt: serverTimestamp(),
          createdBy: uid,                  // <- Se crée lui-même
        },
        { merge: true }
      );

      // 5) Log de la création pour traçabilité
      try {
        await setDoc(doc(db, "societe", societeId, "activities", `owner_creation_${uid}`), {
          type: "owner_creation",
          userId: uid,
          userEmail: emailTrim,
          timestamp: serverTimestamp(),
          details: {
            action: "Création de la société et nomination du propriétaire",
            pharmaName: pharmaNameTrim,
            isOwner: true
          }
        });
      } catch (logError) {
        // Log non critique, ne pas faire échouer l'inscription
        console.warn("Erreur lors du log de création:", logError);
      }

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

  const handleJoinWithCode = async () => {
    // Validation
    const emailTrim = email.trim();
    const dnameTrim = displayName.trim();
    const code = (invitationCode || "").toUpperCase().trim();

    if (!emailTrim || !password || !confirmPassword) {
      setError("Veuillez remplir vos informations de compte.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError("Code d'invitation invalide (format ABC123).");
      return;
    }

    setLoading(true);
    clearErrors();

    try {
      // 1) Créer le compte
      const cred = await createUserWithEmailAndPassword(auth, emailTrim, password);
      const uid = cred.user.uid;

      if (dnameTrim) {
        try {
          await updateProfile(cred.user, { displayName: dnameTrim });
        } catch {}
      }

      // 2) Chercher la société par code — (APRES AUTH !)
      const qSoc = query(collection(db, "societe"), where("invitationCode", "==", code));
      const snap = await getDocs(qSoc);

      // 3) Créer le doc user par défaut (même si le code est invalide)
      // EMPLOYÉ = PAS PROPRIÉTAIRE
      await setDoc(
        doc(db, "users", uid),
        {
          email: emailTrim,
          displayName: dnameTrim || null,
          role: "vendeuse",                // <- rôle par défaut pour un invité
          societeId: null,
          isOwner: false,                  // <- NOUVEAU: Les employés ne sont jamais propriétaires
          locked: false,
          active: true,
          adminPopup: null,
          paymentWarning: null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (snap.empty) {
        // Code invalide → laisser rejoindre plus tard sur /invitations
        setSuccess(
          "Compte créé. Le code saisi est invalide — vous pourrez rejoindre depuis la page Invitations."
        );
        navigate("/invitations");
        return;
      }

      const sDoc = snap.docs[0];
      const societeId = sDoc.id;
      const societeData = sDoc.data();

      // 4) Lier l'utilisateur et ajouter aux membres
      await setDoc(doc(db, "users", uid), { 
        societeId,
        createdBy: societeData.ownerId || societeData.createdBy || "unknown" // Référencer le créateur
      }, { merge: true });
      await updateDoc(doc(db, "societe", societeId), { membres: arrayUnion(uid) });

      // 5) Log de l'ajout pour traçabilité
      try {
        await setDoc(doc(db, "societe", societeId, "activities", `employee_join_${uid}`), {
          type: "employee_join",
          userId: uid,
          userEmail: emailTrim,
          timestamp: serverTimestamp(),
          details: {
            action: "Inscription d'un employé avec code d'invitation",
            invitationCode: code,
            role: "vendeuse",
            isOwner: false
          }
        });
      } catch (logError) {
        // Log non critique
        console.warn("Erreur lors du log d'ajout:", logError);
      }

      setSuccess("Compte créé et rattaché à la pharmacie avec succès.");
      navigate("/dashboard");
    } catch (e) {
      console.error(e);
      if (e?.code === "auth/email-already-in-use") {
        setError("Un compte existe déjà avec cet email.");
      } else if (e?.code === "auth/weak-password") {
        setError("Le mot de passe doit contenir au moins 6 caractères.");
      } else {
        setError("Erreur lors de l'inscription.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearErrors();
    if (registrationType === "new_company") {
      await handleCreateCompany();
    } else if (registrationType === "invitation") {
      await handleJoinWithCode();
    } else {
      setError("Veuillez choisir un type d'inscription.");
    }
  };

  const resetAll = () => {
    setRegistrationType("");
    setEmail("");
    setDisplayName("");
    setPassword("");
    setConfirmPassword("");
    setInvitationCode("");
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
          Créer un compte
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

        {/* Choix type d'inscription */}
        {!registrationType && (
          <div style={{ marginTop: 22 }}>
            <h3 style={{ color: "#e4edfa", textAlign: "center", marginBottom: 20 }}>
              Comment souhaitez-vous vous inscrire ?
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setRegistrationType("new_company")}
                style={{
                  background: "#e8f5e8",
                  border: "2px solid #4caf50",
                  color: "#2e7d32",
                }}
              >
                👑 Créer une nouvelle pharmacie (propriétaire permanent)
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => setRegistrationType("invitation")}
                style={{
                  background: "#e3f2fd",
                  border: "2px solid #2196f3",
                  color: "#1565c0",
                }}
              >
                👥 Rejoindre avec un code d'invitation (employé)
              </button>
            </div>

            <div style={{ 
              marginTop: 15, 
              padding: 12, 
              background: "#fff3cd", 
              border: "1px solid #ffeaa7", 
              borderRadius: 6,
              fontSize: "0.9em",
              color: "#856404"
            }}>
              <strong>Note importante :</strong> Le créateur d'une pharmacie devient automatiquement 
              propriétaire permanent avec tous les privilèges. Les employés peuvent être promus docteur 
              mais ne peuvent jamais devenir propriétaires.
            </div>
          </div>
        )}

        {/* Formulaire : Nouvelle société */}
        {registrationType === "new_company" && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
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
                Vous pourrez inviter des employés et changer leurs rôles à tout moment.
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
              ← Retour au choix d'inscription
            </button>
          </form>
        )}

        {/* Formulaire : Rejoindre avec code */}
        {registrationType === "invitation" && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
            <div
              style={{
                background: "#e3f2fd",
                padding: 15,
                borderRadius: 8,
                border: "1px solid #90caf9",
              }}
            >
              <h4 style={{ color: "#1565c0", margin: 0 }}>👥 Rejoindre en tant qu'employé</h4>
              <p style={{ color: "#0d47a1", margin: "6px 0 0 0", fontSize: "0.9em" }}>
                Le code doit être fourni par le propriétaire de la pharmacie.
                Vous serez créé en tant qu'employé (vendeuse par défaut).
              </p>
            </div>

            <input
              className="input"
              type="text"
              placeholder="Code (ex: ABC123)"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ letterSpacing: "0.2em", textTransform: "uppercase", textAlign: "center" }}
              required
            />

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

            <button className="btn" disabled={loading} style={{ fontSize: "1.05rem" }}>
              {loading ? "Inscription…" : "👥 Créer mon compte employé"}
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
              ← Retour au choix d'inscription
            </button>
          </form>
        )}

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
// src/components/auth/Register.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

/* ===== Helper de debug : trace le chemin exact en cas d'échec règles ===== */
async function safeSet(ref, data, options) {
  try {
    await setDoc(ref, data, options);
    console.log("OK:", ref.path, data);
  } catch (e) {
    console.error("FAILED:", ref.path, e.code, e.message, { data });
    throw e;
  }
}

/* Petit sleep pour laisser Firestore propager les changements côté règles */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

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

  // État réseau pour éviter les erreurs Auth offline
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  /* ================= Helpers ================= */
  const clearErrors = () => {
    setError("");
    setSuccess("");
  };

  const generateCode = (len = 8) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I/O/0/1
    let code = "";
    for (let i = 0; i < len; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // 👉 Version SANS getDoc (pas de lecture Firestore, donc pas de permission-denied ici)
  const generateUniqueInviteCode = async () => {
    return generateCode(8);
  };

  const newSocieteIdFor = (uid) => `societe_${uid}_${Date.now()}`;

  /* ============= Flow: création d'une nouvelle société (OWNER) ============= */
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
    if (!isOnline) {
      setError("Vous êtes hors-ligne. Reconnectez-vous puis réessayez.");
      return;
    }

    setLoading(true);
    clearErrors();

    try {
      // 1) Auth: créer le compte OWNER
      const cred = await createUserWithEmailAndPassword(auth, emailTrim, password);
      const uid = cred.user.uid;

      // 1bis) Profile displayName (facultatif)
      if (dnameTrim) {
        try {
          await updateProfile(cred.user, { displayName: dnameTrim });
        } catch {
          // ignore
        }
      }

      // 2) Créer users/{uid} D'ABORD (societeId:null)
      await safeSet(
        doc(db, "users", uid),
        {
          email: emailTrim,
          displayName: dnameTrim || null,
          role: "docteur",      // ou "pharmacien"
          isOwner: true,        // propriétaire permanent
          societeId: null,      // pas encore rattaché
          locked: false,
          active: true,
          adminPopup: null,
          paymentWarning: null,
          createdAt: serverTimestamp(),
          createdBy: uid,
        },
        { merge: true }
      );

      // 3) Générer le code d’invitation (plus de lecture Firestore)
      const invite = await generateUniqueInviteCode();

      // 4) Créer la société avec ownerUid (⚠️ correspond aux règles)
      const societeId = newSocieteIdFor(uid);
      await safeSet(doc(db, "societe", societeId), {
        nom: pharmaNameTrim,
        adresse: pharmaAddressTrim,
        telephone: pharmaPhoneTrim || "",
        invitationCode: invite,
        membres: [uid],
        ownerUid: uid, // <— IMPORTANT pour passer les règles
        createdBy: uid,
        createdAt: serverTimestamp(),
        active: true,
        plan: "basic",
      });

      // 5) Rattacher l'utilisateur à la société
      await safeSet(
        doc(db, "users", uid),
        { societeId },
        { merge: true }
      );

      // 🔁 petite pause pour que les règles voient bien authSocieteId() == societeId
      await sleep(400);

      // 6) (Optionnel) Paramètres par défaut (passe car maintenant sameSoc + owner)
      await safeSet(
        doc(db, "societe", societeId, "parametres", "default"),
        {
          devise: "MAD",
          tva: 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 7) Enregistrer le code d’invitation (utile pour le join employé)
      await safeSet(
        doc(db, "invitations", invite),
        {
          societeId,
          createdBy: uid,
          createdAt: serverTimestamp(),
          active: true,
          type: "employee_join",
        },
        { merge: false }
      );

      setSuccess("Pharmacie créée avec succès. Vous êtes le propriétaire permanent.");
      navigate("/dashboard");
    } catch (e) {
      console.error(e);
      if (e?.code === "auth/email-already-in-use") {
        setError("Un compte existe déjà avec cet email.");
      } else if (e?.code === "auth/weak-password") {
        setError("Le mot de passe doit contenir au moins 6 caractères.");
      } else if (String(e?.message || "").includes("Missing or insufficient permissions")) {
        setError(
          "Permissions Firestore insuffisantes : vérifiez vos règles (création 'societe' avec 'ownerUid' + rattachement 'users/{uid}.societeId' avant les sous-collections), puis republiez."
        );
      } else if (e?.code === "auth/network-request-failed") {
        setError("Problème réseau détecté. Vérifiez votre connexion Internet puis réessayez.");
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

  /* ================= UI ================= */
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

        {!isOnline && (
          <div
            style={{
              background: "#fff3cd",
              border: "1px solid #ffeeba",
              color: "#856404",
              padding: 10,
              borderRadius: 8,
              marginTop: 12,
            }}
          >
            🔌 Vous êtes hors-ligne. La création de compte nécessite Internet.
          </div>
        )}

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

        {/* Formulaire : Création d'une nouvelle société (OWNER uniquement) */}
        <form
          onSubmit={handleCreateCompany}
          style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}
        >
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
              Les employés rejoignent via un <strong>code/lien d’invitation</strong> uniquement.
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

          <button className="btn" disabled={loading || !isOnline} style={{ fontSize: "1.05rem" }}>
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

        {/* Lien connexion + invitation */}
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

        <div
          style={{
            marginTop: 10,
            color: "#e1e6ef",
            textAlign: "center",
            fontSize: "0.98rem",
          }}
        >
          Employé(e) avec un code ?{" "}
          <button
            className="btn-neumorph"
            style={{
              background: "transparent",
              color: "#7ee4e6",
              border: "none",
              marginLeft: 6,
              fontWeight: 700,
              boxShadow: "none",
              padding: 0,
            }}
            onClick={() => navigate("/accept-invitation")}
            type="button"
          >
            Rejoindre via invitation
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { 
  doc, 
  setDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  updateDoc,
  Timestamp 
} from "firebase/firestore";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [codeVerified, setCodeVerified] = useState(false);
  
  // États pour création de société
  const [registrationType, setRegistrationType] = useState(""); // "new_company" ou "invitation"
  const [societeId, setSocieteId] = useState("");
  const [societeName, setSocieteName] = useState("");
  const [societeAddress, setSocieteAddress] = useState("");
  const [societePhone, setSocietePhone] = useState("");
  
  const navigate = useNavigate();

  // Générer un ID de société unique
  const generateSocieteId = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString().slice(-6);
  };

  // Vérifier le code d'invitation
  const verifyInvitationCode = async () => {
    if (!invitationCode.trim()) {
      setError("Veuillez saisir un code d'invitation.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Chercher l'invitation avec ce code
      const q = query(
        collection(db, "invitations"), 
        where("code", "==", invitationCode.trim().toUpperCase()),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError("Code d'invitation invalide ou déjà utilisé.");
        setLoading(false);
        return;
      }

      const invitationDoc = snap.docs[0];
      const invitationData = invitationDoc.data();

      // Vérifier si l'invitation n'est pas expirée
      const expiresAt = invitationData.expiresAt.toDate();
      if (expiresAt < new Date()) {
        setError("Ce code d'invitation a expiré.");
        setLoading(false);
        return;
      }

      // Pré-remplir l'email si il correspond
      if (invitationData.emailInvite && invitationData.emailInvite !== email) {
        setEmail(invitationData.emailInvite);
      }

      setInvitation({ id: invitationDoc.id, ...invitationData });
      setCodeVerified(true);
      setError("");
      
    } catch (err) {
      console.error("Erreur lors de la vérification du code:", err);
      setError("Erreur lors de la vérification du code d'invitation.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-générer l'ID société quand le nom change
  useEffect(() => {
    if (societeName && registrationType === "new_company") {
      setSocieteId(generateSocieteId(societeName));
    }
  }, [societeName, registrationType]);

  // Réinitialiser la vérification si le code change
  useEffect(() => {
    if (codeVerified && invitationCode !== invitation?.code) {
      setCodeVerified(false);
      setInvitation(null);
    }
  }, [invitationCode, invitation?.code, codeVerified]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas !");
      return;
    }

    if (registrationType === "new_company") {
      // ===== CRÉATION D'UNE NOUVELLE SOCIÉTÉ =====
      if (!societeName.trim() || !societeAddress.trim()) {
        setError("Veuillez remplir au moins le nom et l'adresse de votre pharmacie.");
        return;
      }

      // Vérifier que l'ID de société n'existe pas déjà
      const existingCompanyCheck = query(
        collection(db, "users"), 
        where("societeId", "==", societeId)
      );
      const existingSnap = await getDocs(existingCompanyCheck);
      
      if (!existingSnap.empty) {
        // Régénérer un ID unique
        setSocieteId(generateSocieteId(societeName));
        setError("ID de société déjà pris, nouvel ID généré. Veuillez réessayer.");
        return;
      }

    } else if (registrationType === "invitation") {
      // ===== INSCRIPTION VIA INVITATION =====
      if (!codeVerified || !invitation) {
        setError("Veuillez d'abord vérifier votre code d'invitation.");
        return;
      }

      if (invitation.emailInvite && invitation.emailInvite !== email) {
        setError("L'email doit correspondre à celui de l'invitation.");
        return;
      }
    } else {
      setError("Veuillez choisir un type d'inscription.");
      return;
    }

    setLoading(true);

    try {
      if (registrationType === "new_company") {
        // ===== CRÉATION D'UNE NOUVELLE SOCIÉTÉ =====
        
        // Créer le compte du docteur/pharmacien
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        
        await setDoc(doc(db, "users", userCred.user.uid), {
          email,
          role: "docteur",
          societeId: societeId,
          active: true,
          createdAt: Timestamp.now(),
          isCompanyOwner: true // Marquer comme propriétaire de la société
        });

        // Créer le document de la société
        await setDoc(doc(db, "societes", societeId), {
          name: societeName.trim(),
          address: societeAddress.trim(),
          phone: societePhone.trim() || "",
          ownerId: userCred.user.uid,
          ownerEmail: email,
          createdAt: Timestamp.now(),
          active: true,
          plan: "basic" // Plan par défaut pour SaaS
        });

        navigate("/dashboard");
        
      } else {
        // ===== INSCRIPTION VIA INVITATION =====
        
        // Vérifier une dernière fois que l'invitation est toujours valide
        const invitationSnap = await getDocs(query(
          collection(db, "invitations"), 
          where("code", "==", invitation.code),
          where("status", "==", "pending")
        ));

        if (invitationSnap.empty) {
          setError("L'invitation n'est plus valide. Veuillez demander un nouveau code.");
          setLoading(false);
          return;
        }

        // Créer le compte utilisateur
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        
        // Créer le document utilisateur avec les infos de l'invitation
        await setDoc(doc(db, "users", userCred.user.uid), {
          email,
          role: invitation.roleInvite,
          societeId: invitation.societeId,
          active: true,
          createdAt: Timestamp.now(),
          invitedBy: invitation.createdBy,
          invitationCode: invitation.code
        });

        // Marquer l'invitation comme utilisée
        await updateDoc(doc(db, "invitations", invitation.id), {
          status: "used",
          usedAt: Timestamp.now(),
          usedBy: email,
          registeredUserId: userCred.user.uid
        });

        navigate("/dashboard");
      }
      
    } catch (err) {
      console.error("Erreur lors de la création du compte:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError("Un compte existe déjà avec cet email !");
      } else if (err.code === 'auth/weak-password') {
        setError("Le mot de passe doit contenir au moins 6 caractères !");
      } else {
        setError("Erreur lors de la création du compte !");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fullscreen-table-wrap" style={{
      minHeight: "100vh", 
      justifyContent: "center", 
      alignItems: "center", 
      display: "flex",
      background: "linear-gradient(120deg, #19392a 0%, #1e6939 100%)"
    }}>
      <div className="paper-card" style={{
        maxWidth: 520,
        width: "96%",
        margin: "0 auto",
        borderRadius: 18,
        padding: "30px 28px 26px 28px"
      }}>
        <div className="fullscreen-table-title" style={{
          background: "#224d32",
          color: "#f1f5fb",
          fontSize: "1.38rem",
          textAlign: "center"
        }}>
          Créer un compte
        </div>

        {error && (
          <div className="status-chip danger" style={{ margin: "18px auto" }}>
            {error}
          </div>
        )}

        {/* Choix du type d'inscription */}
        {!registrationType && (
          <div style={{ marginTop: 22 }}>
            <h3 style={{ color: "#e4edfa", textAlign: "center", marginBottom: 20 }}>
              Comment souhaitez-vous vous inscrire ?
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              {/* Option 1: Nouvelle société */}
              <div 
                onClick={() => setRegistrationType("new_company")}
                style={{
                  background: "#e8f5e8",
                  border: "2px solid #4caf50",
                  borderRadius: 12,
                  padding: 20,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textAlign: "center"
                }}
                onMouseOver={(e) => e.target.style.transform = "scale(1.02)"}
                onMouseOut={(e) => e.target.style.transform = "scale(1)"}
              >
                <h4 style={{ color: "#2e7d32", marginTop: 0, marginBottom: 8 }}>
                  🏪 Créer une nouvelle pharmacie
                </h4>
                <p style={{ color: "#1b5e20", margin: 0, fontSize: "0.95em" }}>
                  Vous êtes pharmacien/docteur et voulez créer l'espace de votre pharmacie
                </p>
              </div>

              {/* Option 2: Code d'invitation */}
              <div 
                onClick={() => setRegistrationType("invitation")}
                style={{
                  background: "#e3f2fd",
                  border: "2px solid #2196f3",
                  borderRadius: 12,
                  padding: 20,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textAlign: "center"
                }}
                onMouseOver={(e) => e.target.style.transform = "scale(1.02)"}
                onMouseOut={(e) => e.target.style.transform = "scale(1)"}
              >
                <h4 style={{ color: "#1565c0", marginTop: 0, marginBottom: 8 }}>
                  🎯 J'ai un code d'invitation
                </h4>
                <p style={{ color: "#0d47a1", margin: 0, fontSize: "0.95em" }}>
                  Vous avez été invité(e) par votre pharmacien/employeur
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Formulaire de création de nouvelle société */}
        {registrationType === "new_company" && (
          <div style={{ marginTop: 22 }}>
            <div style={{ 
              background: "#e8f5e8", 
              padding: 15, 
              borderRadius: 8, 
              marginBottom: 20,
              border: "1px solid #4caf50"
            }}>
              <h4 style={{ color: "#2e7d32", marginTop: 0, marginBottom: 8 }}>
                🏪 Création d'une nouvelle pharmacie
              </h4>
              <p style={{ color: "#1b5e20", margin: 0, fontSize: "0.9em" }}>
                Vous allez créer un espace dédié pour votre pharmacie avec un compte administrateur
              </p>
            </div>

            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {/* Infos du compte */}
              <div style={{ marginBottom: 15 }}>
                <h4 style={{ color: "#e4edfa", marginBottom: 10, fontSize: "1.1em" }}>
                  👨‍⚕️ Votre compte administrateur
                </h4>
                <input
                  className="input"
                  type="email"
                  placeholder="Votre adresse e-mail"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                
                <input
                  className="input"
                  type="password"
                  placeholder="Mot de passe (min. 6 caractères)"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                
                <input
                  className="input"
                  type="password"
                  placeholder="Confirmer le mot de passe"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {/* Infos de la société */}
              <div style={{ marginBottom: 15 }}>
                <h4 style={{ color: "#e4edfa", marginBottom: 10, fontSize: "1.1em" }}>
                  🏢 Informations de votre pharmacie
                </h4>
                <input
                  className="input"
                  type="text"
                  placeholder="Nom de votre pharmacie *"
                  value={societeName}
                  onChange={(e) => setSocieteName(e.target.value)}
                  required
                />
                
                <input
                  className="input"
                  type="text"
                  placeholder="Adresse complète *"
                  value={societeAddress}
                  onChange={(e) => setSocieteAddress(e.target.value)}
                  required
                />
                
                <input
                  className="input"
                  type="tel"
                  placeholder="Téléphone (optionnel)"
                  value={societePhone}
                  onChange={(e) => setSocietePhone(e.target.value)}
                />

                {/* ID généré automatiquement */}
                {societeId && (
                  <div style={{ 
                    background: "#1a2535", 
                    padding: 10, 
                    borderRadius: 8, 
                    marginTop: 10,
                    border: "1px solid #34518b"
                  }}>
                    <div style={{ color: "#7ee4e6", fontSize: "0.85em", marginBottom: 5 }}>
                      ID unique de votre société (généré automatiquement) :
                    </div>
                    <code style={{ 
                      color: "#fff", 
                      fontWeight: "bold",
                      fontSize: "0.9em"
                    }}>
                      {societeId}
                    </code>
                  </div>
                )}
              </div>
              
              <button 
                className="btn" 
                style={{ width: "100%", fontSize: "1.1rem", padding: "12px" }}
                disabled={loading}
              >
                {loading ? "Création en cours..." : "🎉 Créer ma pharmacie"}
              </button>
            </form>

            <button
              type="button"
              style={{
                background: "transparent",
                border: "1px solid #7ee4e6",
                color: "#7ee4e6",
                padding: "8px 16px",
                borderRadius: 8,
                cursor: "pointer",
                marginTop: 15,
                width: "100%"
              }}
              onClick={() => {
                setRegistrationType("");
                setSocieteName("");
                setSocieteAddress("");
                setSocietePhone("");
                setSocieteId("");
                setEmail("");
                setPassword("");
                setConfirmPassword("");
                setError("");
              }}
            >
              ← Retour au choix d'inscription
            </button>
          </div>
        )}

        {/* Système d'invitation */}
        {registrationType === "invitation" && !codeVerified && (
          <div style={{ marginTop: 22 }}>
            <div style={{ 
              background: "#e3f2fd", 
              padding: 15, 
              borderRadius: 8, 
              marginBottom: 20,
              border: "1px solid #90caf9"
            }}>
              <h4 style={{ color: "#1565c0", marginTop: 0, marginBottom: 10 }}>
                🎯 Code d'invitation requis
              </h4>
              <p style={{ color: "#0d47a1", margin: 0, fontSize: "0.95em" }}>
                Saisissez le code d'invitation que vous a fourni votre pharmacien/employeur.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <input
                className="input"
                type="text"
                placeholder="Code d'invitation (ex: ABC123DE)"
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                required
                style={{ letterSpacing: "2px", fontWeight: "bold" }}
                maxLength={8}
              />
              <button 
                className="btn" 
                style={{ width: "100%", fontSize: "1.1rem" }}
                onClick={verifyInvitationCode}
                disabled={loading || !invitationCode.trim()}
              >
                {loading ? "Vérification..." : "🔍 Vérifier le code"}
              </button>
            </div>

            <button
              type="button"
              style={{
                background: "transparent",
                border: "1px solid #7ee4e6",
                color: "#7ee4e6",
                padding: "8px 16px",
                borderRadius: 8,
                cursor: "pointer",
                marginTop: 15,
                width: "100%"
              }}
              onClick={() => {
                setRegistrationType("");
                setInvitationCode("");
                setError("");
              }}
            >
              ← Retour au choix d'inscription
            </button>
          </div>
        )}

        {/* Formulaire d'inscription via invitation */}
        {codeVerified && invitation && (
          <div style={{ marginTop: 22 }}>
            {/* Confirmation de l'invitation */}
            <div style={{ 
              background: "#e8f5e8", 
              padding: 15, 
              borderRadius: 8, 
              marginBottom: 20,
              border: "1px solid #4caf50"
            }}>
              <h4 style={{ color: "#2e7d32", marginTop: 0, marginBottom: 8 }}>
                ✅ Code d'invitation valide
              </h4>
              <div style={{ color: "#1b5e20", fontSize: "0.9em" }}>
                <div><strong>Rôle attribué :</strong> {invitation.roleInvite === "docteur" ? "👨‍⚕️ Docteur" : "👩‍💼 Vendeuse"}</div>
                {invitation.emailInvite && (
                  <div><strong>Email requis :</strong> {invitation.emailInvite}</div>
                )}
                {invitation.noteInvite && (
                  <div><strong>Note :</strong> {invitation.noteInvite}</div>
                )}
                <div><strong>Invité par :</strong> {invitation.createdBy}</div>
              </div>
            </div>

            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <input
                className="input"
                type="email"
                placeholder="Adresse e-mail"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={invitation.emailInvite} // Désactivé si email imposé par l'invitation
              />
              
              <input
                className="input"
                type="password"
                placeholder="Mot de passe (min. 6 caractères)"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              
              <input
                className="input"
                type="password"
                placeholder="Confirmer le mot de passe"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              
              <button 
                className="btn" 
                style={{ width: "100%", fontSize: "1.1rem" }}
                disabled={loading}
              >
                {loading ? "Création du compte..." : "🎉 Créer mon compte"}
              </button>
            </form>

            <button
              type="button"
              style={{
                background: "transparent",
                border: "1px solid #7ee4e6",
                color: "#7ee4e6",
                padding: "8px 16px",
                borderRadius: 8,
                cursor: "pointer",
                marginTop: 15,
                width: "100%"
              }}
              onClick={() => {
                setCodeVerified(false);
                setInvitation(null);
                setInvitationCode("");
                setEmail("");
                setPassword("");
                setConfirmPassword("");
                setError("");
              }}
            >
              ← Changer de code d'invitation
            </button>
          </div>
        )}

        <div style={{ marginTop: 20, color: "#e1e6ef", textAlign: "center", fontSize: "1.04rem" }}>
          Vous avez déjà un compte ?
          <button className="btn-neumorph" style={{
            background: "transparent", 
            color: "#5bed98", 
            border: "none", 
            marginLeft: 9, 
            fontWeight: 700, 
            boxShadow: "none", 
            padding: 0
          }}
            onClick={() => navigate("/login")}
            onMouseOver={e => (e.target.style.textDecoration = "underline")}
            onMouseOut={e => (e.target.style.textDecoration = "none")}
            type="button"
          >
            Connectez-vous
          </button>
        </div>
      </div>
    </div>
  );
}
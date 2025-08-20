// src/components/invitations/Invitations.js
import React, { useEffect, useState } from "react";
import { db } from "../../firebase/config";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

export default function Invitations() {
  const {
    role,
    user,
    societeId,
    loading,
    societeName: societeNameCtx, // ✅ nom lisible depuis le contexte
  } = useUserRole();

  const [invitationCode, setInvitationCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [societeNameLocal, setSocieteNameLocal] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showJoinForm, setShowJoinForm] = useState(false);

  // Indique si le document société référencé par societeId existe réellement
  const [societeDocExists, setSocieteDocExists] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdminRole = ["docteur", "pharmacien", "admin"].includes(
    (role || "").toLowerCase()
  );

  // Préférence au nom de contexte (fiable), sinon fallback local
  const resolvedSocieteName = societeNameCtx || societeNameLocal || "";

  // --- Génération de code ---
  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  };

  const generateUniqueCode = async (maxTry = 8) => {
    for (let i = 0; i < maxTry; i++) {
      const c = generateCode();
      const q = query(collection(db, "societe"), where("invitationCode", "==", c));
      const snap = await getDocs(q);
      if (snap.empty) return c;
    }
    throw new Error("Impossible de générer un code unique. Réessayez.");
  };

  // --- Self-heal du lien société si le doc n'existe pas ---
  const repairSocieteLink = async () => {
    if (!user) return;

    // 1) Y a-t-il une société où je suis déjà membre ?
    const qMember = query(
      collection(db, "societe"),
      where("membres", "array-contains", user.uid)
    );
    const snapMember = await getDocs(qMember);
    if (!snapMember.empty) {
      const found = snapMember.docs[0];
      await setDoc(doc(db, "users", user.uid), { societeId: found.id }, { merge: true });
      setSuccess("Lien réparé automatiquement à votre société existante.");
      return { fixed: true, created: false };
    }

    // 2) Si je suis admin → créer une nouvelle société
    if (isAdminRole) {
      const newSocieteId = `societe_${user.uid}_${Date.now()}`;
      const newCode = await generateUniqueCode();
      const defaultName =
        user?.displayName || (user?.email ? user.email.split("@")[0] : "Responsable");

      await setDoc(doc(db, "societe", newSocieteId), {
        nom: `Pharmacie de ${defaultName}`,
        invitationCode: newCode,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        membres: [user.uid],
      });
      await setDoc(doc(db, "users", user.uid), { societeId: newSocieteId }, { merge: true });
      setSuccess("Société créée et lien réparé.");
      return { fixed: true, created: true };
    }

    // 3) Sinon → on remet societeId à null pour permettre de rejoindre par code
    await setDoc(doc(db, "users", user.uid), { societeId: null }, { merge: true });
    setSuccess("Lien société supprimé : vous pouvez rejoindre avec un code.");
    return { fixed: true, created: false };
  };

  // --- Abonnement temps réel au doc société (si présent) ---
  useEffect(() => {
    setInvitationCode("");
    setSocieteNameLocal("");
    setError("");
    setSuccess("");
    setSocieteDocExists(false);

    if (!societeId) return;

    setBusy(true);
    const ref = doc(db, "societe", societeId);

    // handler séparé pour pouvoir utiliser async/await
    const handleSnap = async (snap) => {
      try {
        if (snap.exists()) {
          const data = snap.data();
          setSocieteDocExists(true);
          setSocieteNameLocal(data?.nom || data?.name || "");
          setInvitationCode(data?.invitationCode || "");
          // Si pas de code et admin → en générer un
          if (!data?.invitationCode && isAdminRole) {
            const newCode = await generateUniqueCode();
            await updateDoc(ref, { invitationCode: newCode });
            setInvitationCode(newCode);
          }
        } else {
          // Doc manquant → tenter auto-réparation
          setSocieteDocExists(false);
          setInvitationCode("");
          setSocieteNameLocal("");
          setError("Société introuvable. Tentative de réparation…");
          const res = await repairSocieteLink();
          if (!res?.fixed) {
            setError(
              "Société introuvable et réparation impossible. Veuillez rejoindre avec un code."
            );
          } else {
            setError(""); // réparation effectuée, on laisse le contexte se mettre à jour
          }
        }
      } catch (e) {
        console.error(e);
        setSocieteDocExists(false);
        setError("Erreur lors du chargement de la société.");
      } finally {
        setBusy(false);
      }
    };

    const unsubscribe = onSnapshot(ref, handleSnap, (err) => {
      console.error("Erreur abonnement société:", err);
      setBusy(false);
      setError("Erreur lors de l'abonnement à la société.");
    });

    return () => {
      unsubscribe && unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeId, isAdminRole]);

  const createNewSociete = async () => {
    setError("");
    setSuccess("");
    if (!user) return setError("Vous devez être connecté.");
    if (!isAdminRole) return setError("Seul un responsable peut créer une pharmacie.");
    if (societeId && societeDocExists) return setError("Vous avez déjà une pharmacie.");

    try {
      const newSocieteId = `societe_${user.uid}_${Date.now()}`;
      const newCode = await generateUniqueCode();
      const defaultName =
        user?.displayName || (user?.email ? user.email.split("@")[0] : "Responsable");

      await setDoc(doc(db, "societe", newSocieteId), {
        nom: `Pharmacie de ${defaultName}`,
        invitationCode: newCode,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        membres: [user.uid],
      });

      await setDoc(doc(db, "users", user.uid), { societeId: newSocieteId }, { merge: true });

      setSuccess("Société créée avec succès.");
      // Le contexte + l'abonnement mettront à jour l'UI automatiquement
    } catch (e) {
      console.error(e);
      setError("Erreur lors de la création de la société.");
    }
  };

  const joinSociete = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!user) return setError("Vous devez être connecté.");
    const code = (inputCode || "").toUpperCase().trim();
    if (code.length !== 6 || !/^[A-Z0-9]{6}$/.test(code)) {
      return setError("Code invalide. Format attendu : 6 caractères alphanumériques.");
    }

    try {
      const qSoc = query(collection(db, "societe"), where("invitationCode", "==", code));
      const snap = await getDocs(qSoc);
      if (snap.empty) return setError("Code d'invitation invalide.");

      const sDoc = snap.docs[0];
      const newSocieteId = sDoc.id;
      const sData = sDoc.data();

      await setDoc(doc(db, "users", user.uid), { societeId: newSocieteId }, { merge: true });
      await updateDoc(doc(db, "societe", newSocieteId), {
        membres: arrayUnion(user.uid),
      });

      setSuccess(`Vous avez rejoint "${sData?.nom || "la pharmacie"}" avec succès.`);
      setShowJoinForm(false);
      setInputCode("");
      // Le contexte + l'abonnement mettront à jour nom & code
    } catch (e) {
      console.error(e);
      setError("Erreur lors de la connexion à la société.");
    }
  };

  const regenerateCode = async () => {
    setError("");
    setSuccess("");
    if (!societeDocExists || !societeId || !isAdminRole) return;

    const ok = window.confirm(
      "Changer le code d'invitation ? L'ancien ne fonctionnera plus."
    );
    if (!ok) return;

    try {
      const newCode = await generateUniqueCode();
      await updateDoc(doc(db, "societe", societeId), { invitationCode: newCode });
      // onSnapshot mettra à jour `invitationCode` automatiquement
      setSuccess("Nouveau code généré avec succès.");
      setTimeout(() => setSuccess(""), 2500);
    } catch (e) {
      console.error(e);
      setError("Erreur lors de la génération du nouveau code.");
    }
  };

  const copyCode = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(invitationCode || "");
      } else {
        const ta = document.createElement("textarea");
        ta.value = invitationCode || "";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setSuccess("Code copié !");
    } catch {
      setError("Impossible de copier le code.");
    } finally {
      setTimeout(() => setSuccess(""), 2000);
    }
  };

  // --- UI ---
  if (loading || busy) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#1c355e" }}>
        Chargement...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Non connecté.
      </div>
    );
  }

  const showCompanyPanel = Boolean(societeId && societeDocExists);

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Invitations</div>

      {error && (
        <div className="status-chip danger" style={{ margin: "18px auto", textAlign: "center" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="status-chip success" style={{ margin: "18px auto", textAlign: "center" }}>
          {success}
        </div>
      )}

      {/* Si pas de société OU lien cassé → proposer rejoindre/créer */}
      {(!societeId || !societeDocExists) && (
        <div className="paper-card" style={{ maxWidth: 600, margin: "30px auto" }}>
          <h2 style={{ color: "#98c4f9", marginBottom: 20 }}>
            Rejoindre ou créer une pharmacie
          </h2>

          <div style={{ marginBottom: 30 }}>
            <h3 style={{ color: "#7ee4e6", marginBottom: 15 }}>
              Option 1 : Rejoindre une pharmacie existante
            </h3>
            {!showJoinForm ? (
              <button
                className="btn info"
                onClick={() => setShowJoinForm(true)}
                style={{ marginTop: 10 }}
              >
                J'ai un code d'invitation
              </button>
            ) : (
              <form
                onSubmit={joinSociete}
                style={{ display: "flex", flexDirection: "column", gap: 15 }}
              >
                <input
                  type="text"
                  placeholder="Entrez le code (ex: ABC123)"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  style={{
                    fontSize: "1.3rem",
                    textAlign: "center",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                  }}
                  required
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="submit" className="btn success">
                    Rejoindre
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      setShowJoinForm(false);
                      setInputCode("");
                      setError("");
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </div>

          {isAdminRole && (
            <div style={{ borderTop: "1px solid #334568", paddingTop: 20 }}>
              <h3 style={{ color: "#7ee4e6", marginBottom: 15 }}>
                Option 2 : Créer une nouvelle pharmacie
              </h3>
              <p style={{ color: "#b5bed4", marginBottom: 15 }}>
                En tant que responsable, vous pouvez créer votre propre pharmacie
                et inviter des collaborateurs.
              </p>
              <button className="btn" onClick={createNewSociete}>
                Créer ma pharmacie
              </button>
            </div>
          )}
        </div>
      )}

      {/* Panneau société uniquement si le doc existe */}
      {showCompanyPanel && (
        <>
          <div className="paper-card" style={{ maxWidth: 600, margin: "30px auto" }}>
            <h2 style={{ color: "#98c4f9", marginBottom: 20 }}>
              Votre pharmacie : {resolvedSocieteName || "—"}
            </h2>

            {isAdminRole ? (
              <div style={{ textAlign: "center" }}>
                <h3 style={{ color: "#7ee4e6", marginBottom: 15 }}>Code d'invitation</h3>
                <div
                  style={{
                    background: "#1a2332",
                    padding: "20px",
                    borderRadius: 12,
                    marginBottom: 20,
                    border: "2px dashed #61c7ef",
                  }}
                >
                  <div
                    style={{
                      fontSize: "2.5rem",
                      fontWeight: 800,
                      letterSpacing: "0.3em",
                      color: "#61c7ef",
                      marginBottom: 10,
                    }}
                  >
                    {invitationCode || "— — — — — —"}
                  </div>
                  <p style={{ color: "#b5bed4", fontSize: "0.9rem" }}>
                    Partagez ce code avec vos collaborateurs pour qu'ils rejoignent votre pharmacie.
                  </p>
                </div>

                <div
                  style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}
                >
                  <button className="btn info" onClick={copyCode} disabled={!invitationCode}>
                    📋 Copier le code
                  </button>
                  <button className="btn print" onClick={regenerateCode}>
                    🔄 Générer un nouveau code
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "#b5bed4" }}>Vous êtes connecté(e) à cette pharmacie.</p>
                <p style={{ color: "#98c4f9", marginTop: 10 }}>
                  Contactez votre responsable pour obtenir ou partager le code d'invitation.
                </p>
              </div>
            )}
          </div>

          <div className="paper-card" style={{ maxWidth: 600, margin: "30px auto" }}>
            <h3 style={{ color: "#98c4f9", marginBottom: 15 }}>Comment ça marche ?</h3>
            <ol style={{ color: "#b5bed4", lineHeight: 1.8 }}>
              <li>Le responsable génère un code d'invitation unique.</li>
              <li>Les nouveaux collaborateurs créent un compte.</li>
              <li>Ils entrent le code pour rejoindre la pharmacie.</li>
              <li>Tous les membres partagent les mêmes données (stock, ventes, achats, etc.).</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  Timestamp
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

export default function GestionUtilisateurs() {
  const { role, loading, societeId, user } = useUserRole();
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Chargement des utilisateurs de la même société
  const fetchUtilisateurs = async () => {
    if (!societeId) {
      setUtilisateurs([]);
      setLoadingUsers(false);
      return;
    }
    
    try {
      setLoadingUsers(true);
      const q = query(collection(db, "users"), where("societeId", "==", societeId));
      const snap = await getDocs(q);
      let arr = [];
      snap.forEach((doc) => {
        const data = doc.data();
        arr.push({ 
          id: doc.id, 
          ...data,
          active: data.active !== false // Par défaut true si le champ n'existe pas
        });
      });
      
      // Trier par rôle (docteur en premier) puis par email
      arr.sort((a, b) => {
        if (a.role === "docteur" && b.role !== "docteur") return -1;
        if (a.role !== "docteur" && b.role === "docteur") return 1;
        return (a.email || "").localeCompare(b.email || "");
      });
      
      setUtilisateurs(arr);
    } catch (error) {
      console.error("Erreur lors du chargement des utilisateurs:", error);
      setUtilisateurs([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUtilisateurs();
  }, [societeId]);

  // Activer/Désactiver un utilisateur
  const toggleUserStatus = async (utilisateurId, currentStatus) => {
    if (utilisateurId === user?.uid) {
      alert("Vous ne pouvez pas désactiver votre propre compte !");
      return;
    }

    const confirmMessage = currentStatus 
      ? "Êtes-vous sûr de vouloir désactiver cet utilisateur ? Il ne pourra plus se connecter."
      : "Êtes-vous sûr de vouloir réactiver cet utilisateur ?";
    
    if (!window.confirm(confirmMessage)) return;

    try {
      setUpdating(true);
      await updateDoc(doc(db, "users", utilisateurId), {
        active: !currentStatus,
        lastModified: Timestamp.now(),
        modifiedBy: user?.email || "Inconnu"
      });
      
      // Recharger la liste
      await fetchUtilisateurs();
      
      const action = currentStatus ? "désactivé" : "réactivé";
      alert(`Utilisateur ${action} avec succès !`);
    } catch (error) {
      console.error("Erreur lors de la modification du statut:", error);
      alert("Erreur lors de la modification du statut de l'utilisateur.");
    } finally {
      setUpdating(false);
    }
  };

  // Changer le rôle d'un utilisateur
  const changeUserRole = async (utilisateurId, newRole) => {
    if (utilisateurId === user?.uid) {
      alert("Vous ne pouvez pas modifier votre propre rôle !");
      return;
    }

    if (!window.confirm(`Êtes-vous sûr de vouloir changer le rôle de cet utilisateur en "${newRole}" ?`)) {
      return;
    }

    try {
      setUpdating(true);
      await updateDoc(doc(db, "users", utilisateurId), {
        role: newRole,
        lastModified: Timestamp.now(),
        modifiedBy: user?.email || "Inconnu"
      });
      
      await fetchUtilisateurs();
      alert("Rôle modifié avec succès !");
    } catch (error) {
      console.error("Erreur lors de la modification du rôle:", error);
      alert("Erreur lors de la modification du rôle.");
    } finally {
      setUpdating(false);
    }
  };

  // Vérifications d'accès
  if (loading) {
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

  if (role !== "docteur") {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#bc3453" }}>
        Accès refusé : Seuls les docteurs peuvent gérer les utilisateurs.
      </div>
    );
  }

  if (!societeId) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#bc3453" }}>
        Aucune société associée. Contactez l'administrateur.
      </div>
    );
  }

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion des Utilisateurs</div>
      
      <div className="paper-card" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#98c4f9" }}>
            Société ID: <code style={{ background: "#1a2535", padding: "2px 8px", borderRadius: 5 }}>
              {societeId}
            </code>
          </span>
          <span style={{ color: "#7ee4e6" }}>
            {utilisateurs.length} utilisateur(s) trouvé(s)
          </span>
          <button 
            className="btn info" 
            onClick={fetchUtilisateurs}
            disabled={loadingUsers}
            style={{ marginLeft: "auto" }}
          >
            {loadingUsers ? "Chargement..." : "🔄 Actualiser"}
          </button>
        </div>
      </div>

      {loadingUsers ? (
        <div style={{ padding: 40, textAlign: "center", color: "#7ee4e6" }}>
          Chargement des utilisateurs...
        </div>
      ) : utilisateurs.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#bc3453" }}>
          Aucun utilisateur trouvé pour cette société.
        </div>
      ) : (
        <div className="table-pro-full">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Dernière Modif.</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {utilisateurs.map((utilisateur) => (
                <tr key={utilisateur.id}>
                  <td>
                    {utilisateur.email || "Email non disponible"}
                    {utilisateur.id === user?.uid && (
                      <div style={{ fontSize: "0.8em", color: "#7ee4e6", fontWeight: 600 }}>
                        (Vous)
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                      <span style={{ 
                        background: utilisateur.role === "docteur" ? "#2bd2a6" : "#61c7ef",
                        color: "#fff",
                        padding: "3px 10px",
                        borderRadius: 12,
                        fontSize: "0.9em",
                        fontWeight: 600
                      }}>
                        {utilisateur.role === "docteur" ? "👨‍⚕️ Docteur" : "👩‍💼 Vendeuse"}
                      </span>
                      {utilisateur.id !== user?.uid && (
                        <select
                          value={utilisateur.role}
                          onChange={(e) => changeUserRole(utilisateur.id, e.target.value)}
                          disabled={updating}
                          style={{ 
                            fontSize: "0.8em", 
                            padding: "2px 5px",
                            background: "#27385d",
                            border: "1px solid #34518b",
                            color: "#e5eeff",
                            borderRadius: 5
                          }}
                        >
                          <option value="docteur">Docteur</option>
                          <option value="vendeuse">Vendeuse</option>
                        </select>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`status-chip ${utilisateur.active ? "success" : "danger"}`}>
                      {utilisateur.active ? "✅ Actif" : "❌ Désactivé"}
                    </span>
                  </td>
                  <td>
                    {utilisateur.lastModified ? (
                      <div>
                        <div style={{ fontSize: "0.9em" }}>
                          {utilisateur.lastModified.toDate().toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: "0.8em", color: "#7ee4e6" }}>
                          par {utilisateur.modifiedBy || "Inconnu"}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "#999" }}>Jamais modifié</span>
                    )}
                  </td>
                  <td>
                    {utilisateur.id === user?.uid ? (
                      <span style={{ color: "#999", fontSize: "0.9em" }}>
                        Actions non disponibles
                      </span>
                    ) : (
                      <button
                        className={`btn ${utilisateur.active ? "danger" : "success"}`}
                        onClick={() => toggleUserStatus(utilisateur.id, utilisateur.active)}
                        disabled={updating}
                        style={{ minWidth: 120 }}
                      >
                        {updating ? "..." : utilisateur.active ? "🚫 Désactiver" : "✅ Activer"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="paper-card" style={{ marginTop: 20 }}>
        <h3 style={{ color: "#e4edfa", marginBottom: 15 }}>ℹ️ Informations importantes</h3>
        <ul style={{ color: "#99b2d4", lineHeight: 1.6 }}>
          <li><strong>Désactiver un utilisateur :</strong> L'utilisateur sera immédiatement déconnecté et ne pourra plus se reconnecter.</li>
          <li><strong>Réactiver un utilisateur :</strong> L'utilisateur pourra se reconnecter normalement.</li>
          <li><strong>Changer le rôle :</strong> Modifie les permissions de l'utilisateur (Docteur = tous droits, Vendeuse = droits limités).</li>
          <li><strong>Votre compte :</strong> Vous ne pouvez pas modifier votre propre statut ou rôle.</li>
        </ul>
      </div>
    </div>
  );
}
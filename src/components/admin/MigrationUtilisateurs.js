// src/components/admin/MigrationUtilisateurs.js
import React, { useState } from "react";
import { getFirestore, collection, getDocs, updateDoc, doc, writeBatch } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../../firebase/config";

// Pour être sûr qu'on a bien l'instance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function MigrationUtilisateurs() {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState([]);

  const handleMigration = async () => {
    setLoading(true);
    setStatus("Début de la migration...");
    setDetails([]);
    
    try {
      const usersCol = collection(db, "users");
      const snapshot = await getDocs(usersCol);
      
      if (snapshot.empty) {
        setStatus("Aucun utilisateur trouvé.");
        setLoading(false);
        return;
      }

      // Utiliser un batch pour les mises à jour
      const batch = writeBatch(db);
      const usersToUpdate = [];
      
      snapshot.docs.forEach((userDoc) => {
        const userData = userDoc.data();
        
        // Vérifier si le champ 'active' existe déjà
        if (userData.active === undefined) {
          usersToUpdate.push({
            id: userDoc.id,
            email: userData.email || "Email non disponible",
            role: userData.role || "vendeuse"
          });
          
          // Ajouter au batch
          const userRef = doc(db, "users", userDoc.id);
          batch.update(userRef, { 
            active: true,
            migrationDate: new Date(),
            migrationNote: "Champ 'active' ajouté automatiquement lors de la migration"
          });
        }
      });

      if (usersToUpdate.length === 0) {
        setStatus("✅ Tous les utilisateurs ont déjà le champ 'active'. Aucune migration nécessaire.");
        setLoading(false);
        return;
      }

      setStatus(`Mise à jour de ${usersToUpdate.length} utilisateur(s)...`);
      
      // Exécuter le batch
      await batch.commit();
      
      setDetails(usersToUpdate);
      setStatus(`✅ Migration terminée avec succès ! ${usersToUpdate.length} utilisateur(s) mis à jour.`);
      
    } catch (error) {
      console.error("Erreur lors de la migration:", error);
      setStatus("❌ Erreur lors de la migration : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: 40, 
      maxWidth: 800, 
      margin: "50px auto", 
      background: "#fff", 
      borderRadius: 8,
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
    }}>
      <h2 style={{ color: "#122058", marginBottom: 20 }}>
        🔄 Migration - Ajout du champ 'active' aux utilisateurs
      </h2>
      
      <div style={{ 
        background: "#e3f2fd", 
        padding: 15, 
        borderRadius: 8, 
        marginBottom: 20,
        border: "1px solid #90caf9"
      }}>
        <h3 style={{ color: "#1565c0", marginTop: 0 }}>ℹ️ Que fait cette migration ?</h3>
        <ul style={{ color: "#0d47a1", lineHeight: 1.6 }}>
          <li>Ajoute le champ <code>active: true</code> à tous les utilisateurs qui ne l'ont pas encore</li>
          <li>Les utilisateurs existants restent actifs par défaut</li>
          <li>Vous pourrez ensuite utiliser la "Gestion des Utilisateurs" pour désactiver des comptes</li>
          <li>Cette opération est sûre et réversible</li>
        </ul>
      </div>

      <button 
        onClick={handleMigration} 
        disabled={loading}
        style={{
          background: loading ? "#ccc" : "#1976d2",
          color: "white",
          border: "none",
          padding: "12px 24px",
          borderRadius: 8,
          fontSize: 16,
          cursor: loading ? "not-allowed" : "pointer",
          marginBottom: 20
        }}
      >
        {loading ? "Migration en cours..." : "🚀 Lancer la migration"}
      </button>

      {status && (
        <div style={{ 
          padding: 15, 
          backgroundColor: status.includes("✅") ? "#e8f5e8" : status.includes("❌") ? "#ffebee" : "#fff3e0",
          border: `1px solid ${status.includes("✅") ? "#4caf50" : status.includes("❌") ? "#f44336" : "#ff9800"}`,
          borderRadius: 8,
          marginBottom: 20
        }}>
          <strong>{status}</strong>
        </div>
      )}

      {details.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: "#122058" }}>📋 Utilisateurs mis à jour :</h3>
          <div style={{ 
            maxHeight: 300, 
            overflowY: "auto", 
            border: "1px solid #ddd", 
            borderRadius: 8,
            background: "#fafafa"
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#e0e0e0" }}>
                  <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Email</th>
                  <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Rôle</th>
                  <th style={{ padding: 10, textAlign: "center", borderBottom: "1px solid #ccc" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {details.map((user, index) => (
                  <tr key={user.id} style={{ background: index % 2 === 0 ? "#f9f9f9" : "#fff" }}>
                    <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{user.email}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                      <span style={{ 
                        background: user.role === "docteur" ? "#4caf50" : "#2196f3",
                        color: "white",
                        padding: "2px 8px",
                        borderRadius: 12,
                        fontSize: "0.8em"
                      }}>
                        {user.role}
                      </span>
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "center" }}>
                      <span style={{ color: "#4caf50", fontWeight: "bold" }}>✅ Activé</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ 
        marginTop: 30, 
        fontSize: 14, 
        color: "#666",
        background: "#f5f5f5",
        padding: 15,
        borderRadius: 8,
        border: "1px solid #e0e0e0"
      }}>
        <strong>⚠️ Notes importantes :</strong>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>Cette opération ne peut être annulée automatiquement</li>
          <li>Tous les utilisateurs existants seront marqués comme "actifs"</li>
          <li>Vous pourrez ensuite les désactiver individuellement via la gestion des utilisateurs</li>
          <li>Cette migration ne supprime aucune donnée existante</li>
        </ul>
      </div>
    </div>
  );
}
// src/components/admin/UpdateDisplayNames.js
import React, { useState } from "react";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../../firebase/config";

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function UpdateDisplayNames() {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [userUpdates, setUserUpdates] = useState([]);
  const [users, setUsers] = useState([]);

  // Charger tous les utilisateurs
  const loadUsers = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const usersList = [];
      usersSnap.forEach(docSnap => {
        usersList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setUsers(usersList);
      
      // Initialiser les champs de mise à jour
      const updates = usersList.map(user => ({
        id: user.id,
        email: user.email,
        currentName: user.displayName || "",
        newName: user.displayName || ""
      }));
      setUserUpdates(updates);
      
      setStatus(`✅ ${usersList.length} utilisateurs chargés`);
    } catch (error) {
      setStatus(`❌ Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Mettre à jour le nom d'un utilisateur dans l'état local
  const updateUserName = (userId, newName) => {
    setUserUpdates(prev => 
      prev.map(user => 
        user.id === userId ? { ...user, newName } : user
      )
    );
  };

  // Appliquer toutes les mises à jour
  const applyUpdates = async () => {
    setLoading(true);
    setStatus("🔄 Mise à jour en cours...");
    
    try {
      let count = 0;
      for (const update of userUpdates) {
        if (update.newName && update.newName.trim() !== "") {
          await updateDoc(doc(db, "users", update.id), {
            displayName: update.newName.trim()
          });
          count++;
        }
      }
      
      setStatus(`✅ ${count} utilisateurs mis à jour avec succès !`);
      // Recharger pour voir les changements
      setTimeout(() => loadUsers(), 1000);
    } catch (error) {
      setStatus(`❌ Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: 40, 
      maxWidth: 900, 
      margin: "50px auto", 
      background: "#fff", 
      borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
    }}>
      <h2 style={{ color: "#1976d2", marginBottom: 30 }}>
        👥 Gestion des noms d'affichage des utilisateurs
      </h2>
      
      <div style={{ 
        background: "#e3f2fd", 
        padding: 20, 
        borderRadius: 8, 
        marginBottom: 30,
        border: "2px solid #1976d2"
      }}>
        <h3 style={{ margin: "0 0 10px 0", color: "#0d47a1" }}>ℹ️ Information</h3>
        <p style={{ margin: 0, color: "#0d47a1" }}>
          Cette page permet de définir ou modifier les noms d'affichage des utilisateurs existants.
          Ces noms apparaîtront dans l'historique des ventes et achats.
        </p>
      </div>

      <div style={{ display: "flex", gap: 15, marginBottom: 30 }}>
        <button 
          onClick={loadUsers}
          disabled={loading}
          style={{
            padding: "12px 24px",
            fontSize: 16,
            background: "#2196f3",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            fontWeight: 600
          }}
        >
          {loading ? "⏳ Chargement..." : "📋 Charger les utilisateurs"}
        </button>
        
        {userUpdates.length > 0 && (
          <button 
            onClick={applyUpdates}
            disabled={loading}
            style={{
              padding: "12px 24px",
              fontSize: 16,
              background: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontWeight: 600
            }}
          >
            {loading ? "⏳ Mise à jour..." : "💾 Appliquer les modifications"}
          </button>
        )}
      </div>

      {status && (
        <div style={{ 
          marginTop: 20, 
          padding: 15, 
          background: status.includes("❌") ? "#ffebee" : "#e8f5e9",
          color: status.includes("❌") ? "#c62828" : "#2e7d32",
          borderRadius: 6,
          fontWeight: 600
        }}>
          {status}
        </div>
      )}

      {userUpdates.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <h3>Liste des utilisateurs :</h3>
          <table style={{ 
            width: "100%", 
            borderCollapse: "collapse",
            marginTop: 20
          }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: 12, textAlign: "left", borderBottom: "2px solid #ddd" }}>Email</th>
                <th style={{ padding: 12, textAlign: "left", borderBottom: "2px solid #ddd" }}>Rôle</th>
                <th style={{ padding: 12, textAlign: "left", borderBottom: "2px solid #ddd" }}>Nom actuel</th>
                <th style={{ padding: 12, textAlign: "left", borderBottom: "2px solid #ddd" }}>Nouveau nom</th>
              </tr>
            </thead>
            <tbody>
              {userUpdates.map(user => {
                const userData = users.find(u => u.id === user.id);
                return (
                  <tr key={user.id}>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{user.email}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                      <span style={{
                        padding: "4px 12px",
                        borderRadius: 4,
                        background: userData?.role === "docteur" ? "#e3f2fd" : "#f3e5f5",
                        color: userData?.role === "docteur" ? "#1565c0" : "#6a1b9a",
                        fontSize: 14,
                        fontWeight: 600
                      }}>
                        {userData?.role || "vendeuse"}
                      </span>
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                      {user.currentName || <span style={{ color: "#999" }}>Non défini</span>}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                      <input
                        type="text"
                        value={user.newName}
                        onChange={(e) => updateUserName(user.id, e.target.value)}
                        placeholder="Entrez le nom complet"
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 4,
                          border: "1px solid #ddd",
                          fontSize: 14
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ 
        marginTop: 40, 
        padding: 15, 
        background: "#fff3cd", 
        borderRadius: 6,
        fontSize: 14,
        color: "#856404",
        border: "1px solid #ffeaa7"
      }}>
        <strong>💡 Conseil :</strong> Utilisez des noms complets pour une meilleure traçabilité 
        (ex: "Marie Dupont" au lieu de "Marie")
      </div>
    </div>
  );
}
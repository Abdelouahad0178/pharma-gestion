// src/components/admin/MigrationVersSocietes.js
import React, { useState } from "react";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  writeBatch, 
  doc,
  setDoc,
  Timestamp 
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../../firebase/config";

// Pour être sûr qu'on a bien l'instance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function MigrationVersSocietes() {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState([]);
  const [step, setStep] = useState(1);

  // Étape 1: Migrer les données de /users/{uid}/collection vers /societe/{societeId}/collection
  const handleMigrationData = async () => {
    setLoading(true);
    setStatus("Début de la migration des données...");
    setDetails([]);
    
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const migratedUsers = [];
      const batch = writeBatch(db);
      
      for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        // Vérifier que l'utilisateur a un societeId
        if (!userData.societeId) {
          migratedUsers.push({
            userId,
            email: userData.email,
            status: "❌ Aucun societeId",
            collections: []
          });
          continue;
        }
        
        const societeId = userData.societeId;
        const collections = ['achats', 'ventes', 'stock', 'devisFactures', 'paiements', 'retours', 'parametres'];
        const migratedCollections = [];
        
        // Migrer chaque collection
        for (const collectionName of collections) {
          try {
            const oldCollectionRef = collection(db, "users", userId, collectionName);
            const oldDataSnap = await getDocs(oldCollectionRef);
            
            if (!oldDataSnap.empty) {
              // Copier vers la nouvelle structure
              oldDataSnap.docs.forEach((docSnap) => {
                const docData = docSnap.data();
                const newDocRef = doc(db, "societe", societeId, collectionName, docSnap.id);
                batch.set(newDocRef, {
                  ...docData,
                  migratedFrom: userId,
                  migratedAt: Timestamp.now()
                });
              });
              
              migratedCollections.push(`${collectionName} (${oldDataSnap.size} docs)`);
            }
          } catch (error) {
            console.error(`Erreur migration ${collectionName} pour ${userId}:`, error);
            migratedCollections.push(`${collectionName} (ERREUR)`);
          }
        }
        
        migratedUsers.push({
          userId,
          email: userData.email,
          societeId,
          status: "✅ Migré",
          collections: migratedCollections
        });
      }
      
      // Exécuter toutes les migrations
      await batch.commit();
      
      setDetails(migratedUsers);
      setStatus(`✅ Migration des données terminée ! ${migratedUsers.length} utilisateurs traités.`);
      
    } catch (error) {
      console.error("Erreur lors de la migration des données:", error);
      setStatus("❌ Erreur lors de la migration des données : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Étape 2: Créer les documents société manquants
  const handleCreateSocietes = async () => {
    setLoading(true);
    setStatus("Création des documents société...");
    
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const societesSet = new Set();
      const createdSocietes = [];
      
      // Collecter tous les societeId uniques
      usersSnap.docs.forEach((userDoc) => {
        const userData = userDoc.data();
        if (userData.societeId) {
          societesSet.add(userData.societeId);
        }
      });
      
      // Créer les documents société
      for (const societeId of societesSet) {
        try {
          // Trouver le propriétaire (premier docteur de cette société)
          const ownersSnap = await getDocs(collection(db, "users"));
          let owner = null;
          
          for (const userDoc of ownersSnap.docs) {
            const userData = userDoc.data();
            if (userData.societeId === societeId && userData.role === "docteur") {
              owner = {
                id: userDoc.id,
                email: userData.email
              };
              break;
            }
          }
          
          if (!owner) {
            createdSocietes.push({
              societeId,
              status: "❌ Aucun docteur trouvé"
            });
            continue;
          }
          
          // Créer le document société
          await setDoc(doc(db, "societes", societeId), {
            name: `Pharmacie ${societeId}`, // Nom par défaut
            address: "Adresse à renseigner",
            phone: "",
            ownerId: owner.id,
            ownerEmail: owner.email,
            createdAt: Timestamp.now(),
            active: true,
            plan: "basic",
            migratedAt: Timestamp.now()
          });
          
          createdSocietes.push({
            societeId,
            owner: owner.email,
            status: "✅ Créée"
          });
          
        } catch (error) {
          console.error(`Erreur création société ${societeId}:`, error);
          createdSocietes.push({
            societeId,
            status: "❌ Erreur: " + error.message
          });
        }
      }
      
      setDetails(createdSocietes);
      setStatus(`✅ Création des sociétés terminée ! ${createdSocietes.length} sociétés traitées.`);
      
    } catch (error) {
      console.error("Erreur lors de la création des sociétés:", error);
      setStatus("❌ Erreur lors de la création des sociétés : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Étape 3: Marquer les utilisateurs comme isCompanyOwner
  const handleMarkOwners = async () => {
    setLoading(true);
    setStatus("Marquage des propriétaires de société...");
    
    try {
      const societesSnap = await getDocs(collection(db, "societes"));
      const batch = writeBatch(db);
      const markedOwners = [];
      
      societesSnap.docs.forEach((societeDoc) => {
        const societeData = societeDoc.data();
        if (societeData.ownerId) {
          const userRef = doc(db, "users", societeData.ownerId);
          batch.update(userRef, {
            isCompanyOwner: true,
            companyOwnerSince: Timestamp.now()
          });
          
          markedOwners.push({
            societeId: societeDoc.id,
            ownerId: societeData.ownerId,
            ownerEmail: societeData.ownerEmail,
            status: "✅ Marqué comme propriétaire"
          });
        }
      });
      
      await batch.commit();
      
      setDetails(markedOwners);
      setStatus(`✅ Marquage des propriétaires terminé ! ${markedOwners.length} propriétaires marqués.`);
      
    } catch (error) {
      console.error("Erreur lors du marquage des propriétaires:", error);
      setStatus("❌ Erreur lors du marquage des propriétaires : " + error.message);
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
      borderRadius: 8,
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
    }}>
      <h2 style={{ color: "#122058", marginBottom: 20 }}>
        🔄 Migration vers le Système SaaS Multi-tenant
      </h2>
      
      <div style={{ 
        background: "#e3f2fd", 
        padding: 15, 
        borderRadius: 8, 
        marginBottom: 20,
        border: "1px solid #90caf9"
      }}>
        <h3 style={{ color: "#1565c0", marginTop: 0 }}>ℹ️ Que fait cette migration ?</h3>
        
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Étape 1 */}
        <div style={{ 
          background: step === 1 ? "#e8f5e8" : "#f5f5f5", 
          padding: 15, 
          borderRadius: 8,
          border: `2px solid ${step === 1 ? "#4caf50" : "#ddd"}`
        }}>
          <h4 style={{ color: step === 1 ? "#2e7d32" : "#666", marginTop: 0 }}>
            📊 Étape 1 : Migration des Données
          </h4>
          <p style={{ color: "#666", fontSize: "0.9em" }}>
            Copie toutes les données des utilisateurs vers la nouvelle structure société
          </p>
          <button 
            onClick={() => {
              setStep(1);
              handleMigrationData();
            }}
            disabled={loading}
            style={{
              background: loading ? "#ccc" : "#4caf50",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading && step === 1 ? "Migration en cours..." : "🚀 Migrer les données"}
          </button>
        </div>

        {/* Étape 2 */}
        <div style={{ 
          background: step === 2 ? "#e8f5e8" : "#f5f5f5", 
          padding: 15, 
          borderRadius: 8,
          border: `2px solid ${step === 2 ? "#4caf50" : "#ddd"}`
        }}>
          <h4 style={{ color: step === 2 ? "#2e7d32" : "#666", marginTop: 0 }}>
            🏢 Étape 2 : Création des Sociétés
          </h4>
          <p style={{ color: "#666", fontSize: "0.9em" }}>
            Crée les documents société avec les informations des propriétaires
          </p>
          <button 
            onClick={() => {
              setStep(2);
              handleCreateSocietes();
            }}
            disabled={loading}
            style={{
              background: loading ? "#ccc" : "#2196f3",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading && step === 2 ? "Création en cours..." : "🏗️ Créer les sociétés"}
          </button>
        </div>

        {/* Étape 3 */}
        <div style={{ 
          background: step === 3 ? "#e8f5e8" : "#f5f5f5", 
          padding: 15, 
          borderRadius: 8,
          border: `2px solid ${step === 3 ? "#4caf50" : "#ddd"}`
        }}>
          <h4 style={{ color: step === 3 ? "#2e7d32" : "#666", marginTop: 0 }}>
            👑 Étape 3 : Marquage des Propriétaires
          </h4>
          <p style={{ color: "#666", fontSize: "0.9em" }}>
            Marque les docteurs comme propriétaires de leur société
          </p>
          <button 
            onClick={() => {
              setStep(3);
              handleMarkOwners();
            }}
            disabled={loading}
            style={{
              background: loading ? "#ccc" : "#ff9800",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading && step === 3 ? "Marquage en cours..." : "👑 Marquer les propriétaires"}
          </button>
        </div>
      </div>

      {status && (
        <div style={{ 
          padding: 15, 
          backgroundColor: status.includes("✅") ? "#e8f5e8" : status.includes("❌") ? "#ffebee" : "#fff3e0",
          border: `1px solid ${status.includes("✅") ? "#4caf50" : status.includes("❌") ? "#f44336" : "#ff9800"}`,
          borderRadius: 8,
          marginTop: 20
        }}>
          <strong>{status}</strong>
        </div>
      )}

      {details.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: "#122058" }}>📋 Détails de la migration :</h3>
          <div style={{ 
            maxHeight: 400, 
            overflowY: "auto", 
            border: "1px solid #ddd", 
            borderRadius: 8,
            background: "#fafafa"
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#e0e0e0" }}>
                  {step === 1 && (
                    <>
                      <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Email</th>
                      <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Société</th>
                      <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Collections</th>
                      <th style={{ padding: 10, textAlign: "center", borderBottom: "1px solid #ccc" }}>Statut</th>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Société</th>
                      <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Propriétaire</th>
                      <th style={{ padding: 10, textAlign: "center", borderBottom: "1px solid #ccc" }}>Statut</th>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Société</th>
                      <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #ccc" }}>Propriétaire</th>
                      <th style={{ padding: 10, textAlign: "center", borderBottom: "1px solid #ccc" }}>Statut</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {details.map((item, index) => (
                  <tr key={index} style={{ background: index % 2 === 0 ? "#f9f9f9" : "#fff" }}>
                    {step === 1 && (
                      <>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{item.email}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{item.societeId || "N/A"}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: "0.8em" }}>
                          {item.collections.join(", ") || "Aucune"}
                        </td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "center" }}>
                          {item.status}
                        </td>
                      </>
                    )}
                    {step === 2 && (
                      <>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{item.societeId}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{item.owner || "N/A"}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "center" }}>
                          {item.status}
                        </td>
                      </>
                    )}
                    {step === 3 && (
                      <>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{item.societeId}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{item.ownerEmail}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "center" }}>
                          {item.status}
                        </td>
                      </>
                    )}
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
        <strong>⚠️ Instructions :</strong>
        <ol style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>Exécutez les étapes <strong>dans l'ordre</strong> (1, 2, puis 3)</li>
          <li>Attendez que chaque étape soit terminée avant de passer à la suivante</li>
          <li>Vérifiez les résultats de chaque étape avant de continuer</li>
          <li>En cas d'erreur, vous pouvez relancer l'étape concernée</li>
          <li>Cette migration est sûre et ne supprime aucune donnée existante</li>
        </ol>
      </div>
    </div>
  );
}
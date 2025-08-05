import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import { doc, setDoc, getDoc, updateDoc, Timestamp } from "firebase/firestore";

export default function Parametres() {
  const { user, societeId, role, loading } = useUserRole();

  // États pour les paramètres de documents
  const [entete, setEntete] = useState("");
  const [pied, setPied] = useState("");
  
  // États pour les informations de la pharmacie
  const [nomPharmacie, setNomPharmacie] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [rc, setRc] = useState("");
  const [ice, setIce] = useState("");
  const [if_, setIf] = useState("");
  const [cnss, setCnss] = useState("");
  
  // États pour les paramètres de gestion
  const [seuilAlerteGlobal, setSeuilAlerteGlobal] = useState(10);
  const [delaiPeremptionAlerte, setDelaiPeremptionAlerte] = useState(30);
  const [tvaVente, setTvaVente] = useState(20);
  
  // États UI
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("documents");
  const [waiting, setWaiting] = useState(true);

  // Vérification du chargement
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // Chargement des paramètres
  useEffect(() => {
    if (!user || !societeId) return;
    
    const fetchParams = async () => {
      try {
        // Charger les paramètres documents
        const docRef = doc(db, "societe", societeId, "parametres", "documents");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setEntete(data.entete || "");
          setPied(data.pied || "");
        }
        
        // Charger les informations pharmacie
        const infoRef = doc(db, "societe", societeId, "parametres", "informations");
        const infoSnap = await getDoc(infoRef);
        if (infoSnap.exists()) {
          const data = infoSnap.data();
          setNomPharmacie(data.nomPharmacie || "");
          setAdresse(data.adresse || "");
          setTelephone(data.telephone || "");
          setEmail(data.email || "");
          setRc(data.rc || "");
          setIce(data.ice || "");
          setIf(data.if || "");
          setCnss(data.cnss || "");
        }
        
        // Charger les paramètres de gestion
        const gestionRef = doc(db, "societe", societeId, "parametres", "gestion");
        const gestionSnap = await getDoc(gestionRef);
        if (gestionSnap.exists()) {
          const data = gestionSnap.data();
          setSeuilAlerteGlobal(data.seuilAlerteGlobal || 10);
          setDelaiPeremptionAlerte(data.delaiPeremptionAlerte || 30);
          setTvaVente(data.tvaVente || 20);
        }
      } catch (err) {
        console.error("Erreur chargement paramètres:", err);
        setError("Erreur lors du chargement des paramètres");
      }
    };
    
    fetchParams();
  }, [user, societeId]);

  // Sauvegarde des paramètres documents
  const handleSaveDocuments = async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    
    setSaving(true);
    setError("");
    
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "documents"), {
        entete,
        pied,
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde documents:", err);
      setError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Sauvegarde des informations pharmacie
  const handleSaveInformations = async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    
    setSaving(true);
    setError("");
    
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "informations"), {
        nomPharmacie,
        adresse,
        telephone,
        email,
        rc,
        ice,
        if: if_,
        cnss,
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde informations:", err);
      setError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Sauvegarde des paramètres de gestion
  const handleSaveGestion = async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    
    setSaving(true);
    setError("");
    
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "gestion"), {
        seuilAlerteGlobal: Number(seuilAlerteGlobal),
        delaiPeremptionAlerte: Number(delaiPeremptionAlerte),
        tvaVente: Number(tvaVente),
        modifiePar: user.uid,
        modifieParEmail: user.email,
        modifieLe: Timestamp.now()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde gestion:", err);
      setError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Vérifications
  if (waiting) {
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

  if (!societeId) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Aucune société sélectionnée.
      </div>
    );
  }

  if (role !== "docteur") {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Accès refusé. Seul le pharmacien peut accéder aux paramètres.
      </div>
    );
  }

  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Paramètres de la Pharmacie</div>
      
      {/* Messages de statut */}
      {error && (
        <div className="status-chip danger" style={{ margin: "10px auto", maxWidth: 600 }}>
          {error}
        </div>
      )}
      
      {saved && (
        <div className="status-chip success" style={{ margin: "10px auto", maxWidth: 600 }}>
          ✅ Paramètres enregistrés avec succès !
        </div>
      )}
      
      {/* Onglets */}
      <div style={{ 
        display: "flex", 
        gap: 10, 
        marginBottom: 20,
        borderBottom: "2px solid #38507c",
        paddingBottom: 10
      }}>
        <button
          className={`btn ${activeTab === "documents" ? "" : "info"}`}
          onClick={() => setActiveTab("documents")}
          style={{ 
            borderRadius: "8px 8px 0 0",
            marginBottom: -10,
            paddingBottom: 20
          }}
        >
          📄 Documents
        </button>
        <button
          className={`btn ${activeTab === "informations" ? "" : "info"}`}
          onClick={() => setActiveTab("informations")}
          style={{ 
            borderRadius: "8px 8px 0 0",
            marginBottom: -10,
            paddingBottom: 20
          }}
        >
          🏥 Informations
        </button>
        <button
          className={`btn ${activeTab === "gestion" ? "" : "info"}`}
          onClick={() => setActiveTab("gestion")}
          style={{ 
            borderRadius: "8px 8px 0 0",
            marginBottom: -10,
            paddingBottom: 20
          }}
        >
          ⚙️ Gestion
        </button>
      </div>

      {/* Contenu des onglets */}
      <div className="paper-card" style={{ maxWidth: 800, margin: "0 auto" }}>
        
        {/* Onglet Documents */}
        {activeTab === "documents" && (
          <form onSubmit={handleSaveDocuments}>
            <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
              Personnalisation des Documents
            </h3>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                Entête des documents (factures, devis, bons)
              </label>
              <textarea
                className="input"
                style={{ 
                  width: "100%", 
                  minHeight: 100, 
                  resize: "vertical",
                  fontFamily: "monospace"
                }}
                rows={4}
                value={entete}
                onChange={(e) => setEntete(e.target.value)}
                placeholder="Ex : PHARMACIE CENTRALE&#10;123, Avenue Mohammed V&#10;Casablanca - Maroc&#10;Tél: 05 22 XX XX XX"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Cet entête apparaîtra sur tous vos documents imprimés
              </small>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                Pied de page des documents
              </label>
              <textarea
                className="input"
                style={{ 
                  width: "100%", 
                  minHeight: 80, 
                  resize: "vertical",
                  fontFamily: "monospace"
                }}
                rows={3}
                value={pied}
                onChange={(e) => setPied(e.target.value)}
                placeholder="Ex : Merci pour votre confiance !&#10;Horaires : Lun-Sam 8h-20h"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Ce pied de page apparaîtra en bas de tous vos documents
              </small>
            </div>
            
            <button 
              type="submit" 
              className="btn" 
              disabled={saving}
              style={{ width: 200 }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </form>
        )}
        
        {/* Onglet Informations */}
        {activeTab === "informations" && (
          <form onSubmit={handleSaveInformations}>
            <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
              Informations de la Pharmacie
            </h3>
            
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 20
            }}>
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  Nom de la pharmacie
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={nomPharmacie}
                  onChange={(e) => setNomPharmacie(e.target.value)}
                  placeholder="Pharmacie Centrale"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  Téléphone
                </label>
                <input
                  type="tel"
                  className="input"
                  style={{ width: "100%" }}
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="05 22 XX XX XX"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  Email
                </label>
                <input
                  type="email"
                  className="input"
                  style={{ width: "100%" }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@pharmacie.ma"
                  disabled={saving}
                />
              </div>
              
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  Adresse complète
                </label>
                <textarea
                  className="input"
                  style={{ width: "100%", minHeight: 60 }}
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="123, Avenue Mohammed V, Casablanca"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  RC (Registre Commerce)
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={rc}
                  onChange={(e) => setRc(e.target.value)}
                  placeholder="123456"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  ICE
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={ice}
                  onChange={(e) => setIce(e.target.value)}
                  placeholder="000000000000000"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  IF (Identifiant Fiscal)
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={if_}
                  onChange={(e) => setIf(e.target.value)}
                  placeholder="12345678"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label style={{ color: "#98c4f9", fontWeight: 700 }}>
                  CNSS
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={cnss}
                  onChange={(e) => setCnss(e.target.value)}
                  placeholder="1234567"
                  disabled={saving}
                />
              </div>
            </div>
            
            <button 
              type="submit" 
              className="btn" 
              disabled={saving}
              style={{ width: 200, marginTop: 20 }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </form>
        )}
        
        {/* Onglet Gestion */}
        {activeTab === "gestion" && (
          <form onSubmit={handleSaveGestion}>
            <h3 style={{ color: "#7ee4e6", marginBottom: 20 }}>
              Paramètres de Gestion
            </h3>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                Seuil d'alerte stock global (par défaut)
              </label>
              <input
                type="number"
                className="input"
                style={{ width: 200 }}
                value={seuilAlerteGlobal}
                onChange={(e) => setSeuilAlerteGlobal(e.target.value)}
                min="1"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Quantité minimum avant alerte (peut être personnalisé par produit)
              </small>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                Délai d'alerte péremption (jours)
              </label>
              <input
                type="number"
                className="input"
                style={{ width: 200 }}
                value={delaiPeremptionAlerte}
                onChange={(e) => setDelaiPeremptionAlerte(e.target.value)}
                min="1"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Nombre de jours avant péremption pour déclencher une alerte
              </small>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: "block", 
                fontWeight: 700, 
                marginBottom: 8, 
                color: "#98c4f9" 
              }}>
                TVA sur les ventes (%)
              </label>
              <input
                type="number"
                className="input"
                style={{ width: 200 }}
                value={tvaVente}
                onChange={(e) => setTvaVente(e.target.value)}
                min="0"
                max="100"
                step="0.1"
                disabled={saving}
              />
              <small style={{ color: "#7ee4e6", marginTop: 5, display: "block" }}>
                Taux de TVA appliqué sur les ventes (généralement 20% au Maroc)
              </small>
            </div>
            
            <button 
              type="submit" 
              className="btn" 
              disabled={saving}
              style={{ width: 200 }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            
            <div style={{ 
              marginTop: 30, 
              padding: 20, 
              background: "#1a2b45", 
              borderRadius: 10,
              border: "1px solid #2a3b55"
            }}>
              <h4 style={{ color: "#7ee4e6", marginBottom: 10 }}>
                ℹ️ Informations importantes
              </h4>
              <ul style={{ color: "#e8ecf4", marginLeft: 20 }}>
                <li>Les paramètres de gestion s'appliquent à toute la société</li>
                <li>Le seuil d'alerte peut être personnalisé pour chaque produit</li>
                <li>Les alertes de péremption apparaissent dans le tableau de bord</li>
                <li>La TVA est calculée automatiquement sur les factures</li>
              </ul>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
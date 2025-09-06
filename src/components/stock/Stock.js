// src/pages/stock.js
import React, { useEffect, useState } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  Timestamp
} from "firebase/firestore";

/** ==== Helpers Dates (supporte string | number | Date | Firestore Timestamp) ==== */
function toDateSafe(v) {
  try {
    if (!v) return null;
    if (v?.toDate && typeof v.toDate === "function") return v.toDate();      // Firestore Timestamp
    if (typeof v === "object" && v.seconds != null) return new Date(v.seconds * 1000); // {seconds,nanoseconds}
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
function formatDate(v, fallback = "N/A") {
  const d = toDateSafe(v);
  return d ? d.toLocaleDateString() : fallback;
}

export default function Stock() {
  const { user, societeId, loading } = useUserRole();

  // États principaux (UNIQUEMENT multi-lots + retours)
  const [stockEntries, setStockEntries] = useState([]);            // Entrées multi-lots
  const [filteredStockEntries, setFilteredStockEntries] = useState([]); // Entrées filtrées
  const [retours, setRetours] = useState([]);
  const [filteredRetours, setFilteredRetours] = useState([]);

  // Filtres Stock multi-lots
  const [filterEntryNom, setFilterEntryNom] = useState("");
  const [filterEntryFournisseur, setFilterEntryFournisseur] = useState("");
  const [filterEntryLot, setFilterEntryLot] = useState("");
  const [filterEntryDateExp, setFilterEntryDateExp] = useState("");
  const [filterEntryQuantiteMin, setFilterEntryQuantiteMin] = useState("");
  const [filterEntryQuantiteMax, setFilterEntryQuantiteMax] = useState("");
  const [showFiltresEntries, setShowFiltresEntries] = useState(false);

  // Filtres Retours
  const [filterProduit, setFilterProduit] = useState("");
  const [filterMotif, setFilterMotif] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [showFiltresRetours, setShowFiltresRetours] = useState(false);

  // États retour
  const [openRetour, setOpenRetour] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null); // Entrée sélectionnée pour retour
  const [quantiteRetour, setQuantiteRetour] = useState("");
  const [motifRetour, setMotifRetour] = useState("");
  const motifs = ["Expiration", "Destruction", "Cadeau", "Autre"];

  // États d'affichage
  const [waiting, setWaiting] = useState(true);

  // Vérification du chargement
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // Charger les entrées de stock multi-lots
  const fetchStockEntries = async () => {
    if (!societeId) return setStockEntries([]);
    const snap = await getDocs(collection(db, "societe", societeId, "stock_entries"));
    const arr = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    // Trier par nom puis par date d'expiration (sûr)
    arr.sort((a, b) => {
      const byNom = (a.nom || "").localeCompare(b.nom || "");
      if (byNom !== 0) return byNom;
      const da = toDateSafe(a.datePeremption) || new Date(0);
      const dbb = toDateSafe(b.datePeremption) || new Date(0);
      return da - dbb;
    });
    setStockEntries(arr);
    setFilteredStockEntries(arr);
  };

  // Charger Retours
  const fetchRetours = async () => {
    if (!societeId) return setRetours([]);
    const snap = await getDocs(collection(db, "societe", societeId, "retours"));
    const arr = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    arr.sort((a, b) => {
      const da = toDateSafe(a.date) || new Date(0);
      const dbb = toDateSafe(b.date) || new Date(0);
      return dbb - da;
    });
    setRetours(arr);
    setFilteredRetours(arr);
  };

  useEffect(() => {
    fetchStockEntries();
    fetchRetours();
  }, [societeId]);

  // Filtrage Stock multi-lots
  useEffect(() => {
    let filtered = stockEntries;
    if (filterEntryNom)
      filtered = filtered.filter((s) => (s.nom || "").toLowerCase().includes(filterEntryNom.toLowerCase()));
    if (filterEntryFournisseur)
      filtered = filtered.filter((s) =>
        (s.fournisseur || "").toLowerCase().includes(filterEntryFournisseur.toLowerCase())
      );
    if (filterEntryLot)
      filtered = filtered.filter((s) => (s.numeroLot || "").toLowerCase().includes(filterEntryLot.toLowerCase()));
    if (filterEntryDateExp) {
      const max = toDateSafe(filterEntryDateExp);
      filtered = filtered.filter((s) => {
        const ds = toDateSafe(s.datePeremption);
        return ds && max ? ds <= max : true;
      });
    }
    if (filterEntryQuantiteMin)
      filtered = filtered.filter((s) => Number(s.quantite || 0) >= Number(filterEntryQuantiteMin));
    if (filterEntryQuantiteMax)
      filtered = filtered.filter((s) => Number(s.quantite || 0) <= Number(filterEntryQuantiteMax));
    setFilteredStockEntries(filtered);
  }, [
    filterEntryNom,
    filterEntryFournisseur,
    filterEntryLot,
    filterEntryDateExp,
    filterEntryQuantiteMin,
    filterEntryQuantiteMax,
    stockEntries
  ]);

  // Filtrage Retours
  useEffect(() => {
    let filtered = retours;
    if (filterProduit)
      filtered = filtered.filter((r) => (r.produit || "").toLowerCase().includes(filterProduit.toLowerCase()));
    if (filterMotif) filtered = filtered.filter((r) => r.motif === filterMotif);
    if (filterDateMin) {
      const dmin = toDateSafe(filterDateMin);
      filtered = filtered.filter((r) => {
        const dr = toDateSafe(r.date);
        return dmin && dr ? dr >= dmin : true;
      });
    }
    if (filterDateMax) {
      const dmax = toDateSafe(filterDateMax);
      filtered = filtered.filter((r) => {
        const dr = toDateSafe(r.date);
        return dmax && dr ? dr <= dmax : true;
      });
    }
    setFilteredRetours(filtered);
  }, [filterProduit, filterMotif, filterDateMin, filterDateMax, retours]);

  // Ouvrir le modal de retour depuis une entrée (multi-lots)
  const handleOpenRetourEntry = (entry) => {
    setSelectedEntry(entry);
    setQuantiteRetour("");
    setMotifRetour("");
    setOpenRetour(true);
  };

  // Valider un retour (UNIQUEMENT multi-lots)
  const handleRetour = async () => {
    if (!user || !societeId) return;
    if (!selectedEntry) return alert("Erreur: aucune entrée sélectionnée !");
    const maxQuantite = Number(selectedEntry.quantite || 0);
    const q = Number(quantiteRetour || 0);
    if (!q || q <= 0 || q > maxQuantite) return alert("Quantité invalide !");
    if (!motifRetour) return alert("Sélectionnez un motif !");

    const newQuantite = maxQuantite - q;

    // Décrémenter l'entrée
    await updateDoc(doc(db, "societe", societeId, "stock_entries", selectedEntry.id), {
      quantite: newQuantite,
      modifiePar: user.uid,
      modifieParEmail: user.email,
      modifieLe: Timestamp.now()
    });

    // Enregistrer le retour
    const retourData = {
      produit: selectedEntry.nom,
      quantite: q,
      motif: motifRetour,
      date: Timestamp.now(),
      creePar: user.uid,
      creeParEmail: user.email,
      creeLe: Timestamp.now(),
      societeId,
      sourceType: "entry",
      sourceId: selectedEntry.id,
      numeroLot: selectedEntry.numeroLot || null,
      fournisseur: selectedEntry.fournisseur || null,
      datePeremption: selectedEntry.datePeremption || null
    };

    const newRetourRef = await addDoc(collection(db, "societe", societeId, "retours"), retourData);

    await addDoc(collection(db, "societe", societeId, "activities"), {
      type: "retour",
      userId: user.uid,
      userEmail: user.email,
      timestamp: Timestamp.now(),
      details: {
        produit: selectedEntry.nom,
        quantite: q,
        motif: motifRetour,
        action: "création",
        retourId: newRetourRef.id,
        numeroLot: selectedEntry.numeroLot || null,
        fournisseur: selectedEntry.fournisseur || null
      }
    });

    setOpenRetour(false);
    setSelectedEntry(null);
    fetchStockEntries();
    fetchRetours();
  };

  // Annulation de retour : réinjection dans le lot d'origine, ou recréation d'une entrée si elle n'existe plus
  const handleCancelRetour = async (retour) => {
    if (!user || !societeId) return;
    if (!window.confirm("Annuler ce retour et réinjecter dans le stock si possible ?")) return;

    try {
      let reinjected = false;

      if (retour?.sourceType === "entry" && retour?.sourceId) {
        // Tenter de réinjecter directement dans le document d'entrée d'origine
        const entryRef = doc(db, "societe", societeId, "stock_entries", retour.sourceId);
        const entrySnap = await getDoc(entryRef);
        if (entrySnap.exists()) {
          const current = Number(entrySnap.data().quantite || 0);
          await updateDoc(entryRef, {
            quantite: current + Number(retour.quantite || 0),
            modifiePar: user.uid,
            modifieParEmail: user.email,
            modifieLe: Timestamp.now()
          });
          reinjected = true;
        }
      }

      if (!reinjected) {
        // Si l'entrée d'origine a disparu : recréer une nouvelle entrée multi-lots minimale
        await addDoc(collection(db, "societe", societeId, "stock_entries"), {
          nom: retour.produit || "Produit",
          quantite: Number(retour.quantite || 0),
          quantiteInitiale: Number(retour.quantite || 0),
          prixAchat: Number(retour.prixAchat || 0),
          prixVente: Number(retour.prixVente || 0),
          numeroLot: retour.numeroLot || `LOT${Date.now().toString().slice(-6)}`,
          fournisseur: retour.fournisseur || "",
          datePeremption: retour.datePeremption || "",
          statut: "actif",
          creePar: user.uid,
          creeParEmail: user.email,
          creeLe: Timestamp.now(),
          societeId
        });
      }

      // Supprimer le retour
      await deleteDoc(doc(db, "societe", societeId, "retours", retour.id));

      // Log activité
      await addDoc(collection(db, "societe", societeId, "activities"), {
        type: "retour",
        userId: user.uid,
        userEmail: user.email,
        timestamp: Timestamp.now(),
        details: {
          produit: retour.produit,
          quantite: retour.quantite,
          motif: retour.motif,
          action: "annulation_retour",
          retourId: retour.id,
          numeroLot: retour.numeroLot || null
        }
      });

      fetchStockEntries();
      fetchRetours();
    } catch (e) {
      console.error("handleCancelRetour:", e);
      alert("Erreur lors de l'annulation du retour.");
    }
  };

  // Impression stock multi-lots
  const handlePrintStockEntries = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Stock Multi-Lots</title></head><body>
      <h2>Inventaire Stock Multi-Lots</h2>
      <table border="1" cellspacing="0" cellpadding="5">
        <tr><th>Médicament</th><th>Lot</th><th>Fournisseur</th><th>Qté</th><th>Prix Achat</th><th>Prix Vente</th><th>Date Exp.</th></tr>
        ${filteredStockEntries
          .map(
            (p) => `<tr>
              <td>${p.nom || ""}</td>
              <td>${p.numeroLot || "N/A"}</td>
              <td>${p.fournisseur || "N/A"}</td>
              <td>${p.quantite ?? 0}</td>
              <td>${p.prixAchat ?? 0} DH</td>
              <td>${p.prixVente ?? 0} DH</td>
              <td>${formatDate(p.datePeremption)}</td>
            </tr>`
          )
          .join("")}
      </table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Impression retours
  const handlePrintRetours = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Retours</title></head><body>
      <h2>Historique des Retours</h2>
      <table border="1" cellspacing="0" cellpadding="5">
        <tr><th>Produit</th><th>Quantité</th><th>Motif</th><th>Lot</th><th>Fournisseur</th><th>Date</th></tr>
        ${filteredRetours
          .map(
            (r) => `<tr>
              <td>${r.produit || "Non spécifié"}</td>
              <td>${r.quantite ?? 0}</td>
              <td>${r.motif || ""}</td>
              <td>${r.numeroLot || "N/A"}</td>
              <td>${r.fournisseur || "N/A"}</td>
              <td>${formatDate(r.date, "")}</td>
            </tr>`
          )
          .join("")}
      </table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Statistiques (UNIQUEMENT multi-lots)
  const getStats = () => {
    const totalMedicaments = new Set(stockEntries.map((e) => e.nom)).size;
    const totalQuantiteEntries = stockEntries.reduce((sum, e) => sum + Number(e.quantite || 0), 0);
    const totalFournisseurs = new Set(stockEntries.map((e) => e.fournisseur).filter(Boolean)).size;

    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);

    const medicamentsExpires = stockEntries.filter((e) => {
      const d = toDateSafe(e.datePeremption);
      return d && d < now;
    }).length;

    const medicamentsExpireSoon = stockEntries.filter((e) => {
      const d = toDateSafe(e.datePeremption);
      return d && d >= now && d <= soon;
    }).length;

    return {
      totalMedicaments,
      totalQuantiteEntries,
      totalFournisseurs,
      medicamentsExpires,
      medicamentsExpireSoon
    };
  };

  const stats = getStats();

  // AFFICHAGE conditionnel
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

  // --- RENDER --- (ONLY Multi-Lots + Retours)
  return (
    <div className="fullscreen-table-wrap">
      <div className="fullscreen-table-title">Gestion du Stock Multi-Lots</div>

      {/* Statistiques du stock multi-lots */}
      <div
        className="paper-card"
        style={{
          marginBottom: 20,
          padding: 20,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white"
        }}
      >
        <h3 style={{ marginBottom: 15, textAlign: "center", fontSize: "1.2rem" }}>
          📊 Tableau de Bord Stock (Multi-lots)
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 15
          }}
        >
          <div style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", padding: 10, borderRadius: 8 }}>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{stats.totalMedicaments}</div>
            <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>Médicaments uniques</div>
          </div>
          <div style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", padding: 10, borderRadius: 8 }}>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{stats.totalQuantiteEntries}</div>
            <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>Unités (Multi-lots)</div>
          </div>
          <div style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", padding: 10, borderRadius: 8 }}>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{stats.totalFournisseurs}</div>
            <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>Fournisseurs actifs</div>
          </div>
          <div style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", padding: 10, borderRadius: 8 }}>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: stats.medicamentsExpires > 0 ? "#ff6b6b" : "white" }}>
              {stats.medicamentsExpires}
            </div>
            <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>Lots expirés</div>
          </div>
          <div style={{ textAlign: "center", background: "rgba(255,255,255,0.1)", padding: 10, borderRadius: 8 }}>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: stats.medicamentsExpireSoon > 0 ? "#feca57" : "white" }}>
              {stats.medicamentsExpireSoon}
            </div>
            <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>Expirent sous 30j</div>
          </div>
        </div>
      </div>

      {/* Note explicative */}
      <div
        className="paper-card"
        style={{ marginBottom: 15, padding: 15, background: "#e6fffa", border: "2px solid #81e6d9" }}
      >
        <p style={{ margin: 0, color: "#2d3748", fontSize: "0.9rem", textAlign: "center" }}>
          <strong>🏷️ Vue Multi-Lots :</strong> Chaque ligne représente un lot spécifique avec son fournisseur, numéro de lot et date d'expiration.
          Les nouveaux lots sont créés automatiquement lors des achats (réceptions).
        </p>
      </div>

      {/* Filtres Entries */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 16, marginBottom: 0 }}>
        <button
          className="btn"
          type="button"
          style={{
            fontSize: "1.32em",
            padding: "2px 13px",
            minWidth: 35,
            background: showFiltresEntries
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={() => setShowFiltresEntries((v) => !v)}
          aria-label="Afficher/Masquer les filtres Multi-Lots"
          title="Afficher/Masquer les filtres Multi-Lots"
        >
          {showFiltresEntries ? "➖" : "➕"}
        </button>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: 0.02 }}>Filtres Stock Multi-Lots</span>
      </div>
      {showFiltresEntries && (
        <div
          className="paper-card"
          style={{ display: "flex", flexWrap: "wrap", gap: 11, alignItems: "center", marginBottom: 8, marginTop: 7 }}
        >
          <div>
            <label>Nom</label>
            <input value={filterEntryNom} onChange={(e) => setFilterEntryNom(e.target.value)} />
          </div>
          <div>
            <label>Fournisseur</label>
            <input value={filterEntryFournisseur} onChange={(e) => setFilterEntryFournisseur(e.target.value)} />
          </div>
          <div>
            <label>N° Lot</label>
            <input value={filterEntryLot} onChange={(e) => setFilterEntryLot(e.target.value)} />
          </div>
          <div>
            <label>Date Exp. max</label>
            <input type="date" value={filterEntryDateExp} onChange={(e) => setFilterEntryDateExp(e.target.value)} />
          </div>
          <div>
            <label>Qté min</label>
            <input
              type="number"
              value={filterEntryQuantiteMin}
              onChange={(e) => setFilterEntryQuantiteMin(e.target.value)}
            />
          </div>
          <div>
            <label>Qté max</label>
            <input
              type="number"
              value={filterEntryQuantiteMax}
              onChange={(e) => setFilterEntryQuantiteMax(e.target.value)}
            />
          </div>
          <button className="btn info" type="button" onClick={handlePrintStockEntries}>
            🖨 Imprimer Multi-Lots
          </button>
        </div>
      )}

      {/* Tableau Stock Multi-Lots */}
      <div className="table-pro-full" style={{ marginTop: 2, marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Médicament</th>
              <th>N° Lot</th>
              <th style={{ color: "white", fontWeight: "bold" }}>Fournisseur</th>
              <th>Quantité</th>
              <th>Prix Achat</th>
              <th>Prix Vente</th>
              <th style={{ color: "white", fontWeight: "bold" }}>Date Exp.</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStockEntries
              .filter((e) => Number(e.quantite || 0) > 0)
              .map((entry) => {
                const dExp = toDateSafe(entry.datePeremption);
                const now = new Date();
                const isExpired = dExp && dExp < now;
                const isExpiringSoon = dExp && !isExpired && dExp <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                return (
                  <tr
                    key={entry.id}
                    style={{
                      backgroundColor: isExpired ? "#fed7d7" : isExpiringSoon ? "#fefcbf" : "white"
                    }}
                  >
                    <td style={{ fontWeight: "bold" }}>{entry.nom}</td>
                    <td
                      style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "#667eea", fontWeight: "bold" }}
                    >
                      {entry.numeroLot || "N/A"}
                    </td>
                    <td style={{ color: "white", fontWeight: "bold" }}>{entry.fournisseur || "N/A"}</td>
                    <td
                      style={{
                        fontWeight: "bold",
                        color: Number(entry.quantite || 0) <= 5 ? "#e53e3e" : "#48bb78"
                      }}
                    >
                      {entry.quantite}
                    </td>
                    <td>{entry.prixAchat} DH</td>
                    <td style={{ fontWeight: "bold", color: "#667eea" }}>{entry.prixVente} DH</td>
                    <td
                      style={{
                        color: isExpired ? "#e53e3e" : isExpiringSoon ? "#d69e2e" : "white",
                        fontWeight: "bold"
                      }}
                    >
                      {formatDate(entry.datePeremption)}
                      {isExpired && " ⚠️"}
                      {isExpiringSoon && " ⏰"}
                    </td>
                    <td>
                      <button className="btn print" type="button" onClick={() => handleOpenRetourEntry(entry)}>
                        Retour Lot
                      </button>
                    </td>
                  </tr>
                );
              })}
            {filteredStockEntries.filter((e) => Number(e.quantite || 0) > 0).length === 0 && (
              <tr>
                <td
                  colSpan="8"
                  style={{ textAlign: "center", padding: "50px", color: "#6b7280", fontStyle: "italic" }}
                >
                  Aucune entrée de stock multi-lots disponible. Les entrées sont créées automatiquement lors des achats.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Filtres Retours */}
      <div
        className="fullscreen-table-title"
        style={{ marginTop: 24, fontSize: "1.35rem", display: "flex", alignItems: "center", gap: 9 }}
      >
        <button
          className="btn"
          type="button"
          style={{
            fontSize: "1.32em",
            padding: "2px 13px",
            minWidth: 35,
            background: showFiltresRetours
              ? "linear-gradient(90deg,#ee4e61 60%,#fddada 100%)"
              : "linear-gradient(90deg,#3272e0 50%,#61c7ef 100%)"
          }}
          onClick={() => setShowFiltresRetours((v) => !v)}
          aria-label="Afficher/Masquer les filtres Retours"
          title="Afficher/Masquer les filtres Retours"
        >
          {showFiltresRetours ? "➖" : "➕"}
        </button>
        Historique des retours ({retours.length})
      </div>
      {showFiltresRetours && (
        <div
          className="paper-card"
          style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8, marginTop: 7 }}
        >
          <div>
            <label>Produit</label>
            <input value={filterProduit} onChange={(e) => setFilterProduit(e.target.value)} />
          </div>
          <div>
            <label>Motif</label>
            <select value={filterMotif} onChange={(e) => setFilterMotif(e.target.value)}>
              <option value="">Tous</option>
              {motifs.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Date min</label>
            <input type="date" value={filterDateMin} onChange={(e) => setFilterDateMin(e.target.value)} />
          </div>
          <div>
            <label>Date max</label>
            <input type="date" value={filterDateMax} onChange={(e) => setFilterDateMax(e.target.value)} />
          </div>
          <button className="btn print" type="button" onClick={handlePrintRetours}>
            🖨 Imprimer Retours filtrés
          </button>
        </div>
      )}

      {/* Tableau Retours */}
      <div className="table-pro-full" style={{ marginTop: 2 }}>
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Quantité</th>
              <th>Motif</th>
              <th>N° Lot</th>
              <th style={{ color: "#2d3748", fontWeight: "bold" }}>Fournisseur</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRetours.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: "bold" }}>{r.produit || "Non spécifié"}</td>
                <td style={{ fontWeight: "bold", color: "#e53e3e" }}>{r.quantite}</td>
                <td>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "12px",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                      color: "white",
                      backgroundColor:
                        r.motif === "Expiration"
                          ? "#e53e3e"
                          : r.motif === "Destruction"
                          ? "#dd6b20"
                          : r.motif === "Cadeau"
                          ? "#38a169"
                          : "#667eea"
                    }}
                  >
                    {r.motif}
                  </span>
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "#667eea" }}>
                  {r.numeroLot || "N/A"}
                </td>
                <td style={{ color: "#2d3748", fontWeight: "bold" }}>{r.fournisseur || "N/A"}</td>
                <td>{formatDate(r.date, "")}</td>
                <td>
                  <button className="btn success" type="button" onClick={() => handleCancelRetour(r)}>
                    Annuler Retour
                  </button>
                </td>
              </tr>
            ))}
            {filteredRetours.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: "50px", color: "#6b7280", fontStyle: "italic" }}>
                  Aucun retour enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog retour */}
      {openRetour && (
        <div className="modal-overlay">
          <div className="paper-card" style={{ maxWidth: 450, margin: "0 auto", background: "#213054" }}>
            <h3 style={{ color: "#fff" }}>
              Retour - {selectedEntry?.nom}
              {selectedEntry && (
                <div style={{ fontSize: "0.8rem", opacity: 0.8, marginTop: 5 }}>
                  Lot: {selectedEntry.numeroLot} • Fournisseur: {selectedEntry.fournisseur}
                </div>
              )}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRetour();
              }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <label>Quantité à retourner</label>
              <input
                type="number"
                value={quantiteRetour}
                onChange={(e) => setQuantiteRetour(e.target.value)}
                min={1}
                max={Number(selectedEntry?.quantite || 0)}
                required
              />
              <div style={{ fontSize: "0.8rem", color: "#cbd5e0" }}>
                Max disponible: {Number(selectedEntry?.quantite || 0)}
                {selectedEntry?.datePeremption && (
                  <div>Date d'expiration: {formatDate(selectedEntry.datePeremption)}</div>
                )}
              </div>
              <label>Motif</label>
              <select value={motifRetour} onChange={(e) => setMotifRetour(e.target.value)} required>
                <option value="">Choisir un motif</option>
                {motifs.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 10, display: "flex", gap: 7 }}>
                <button className="btn info" type="button" onClick={() => setOpenRetour(false)}>
                  Annuler
                </button>
                <button className="btn print" type="submit">
                  Valider Retour
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

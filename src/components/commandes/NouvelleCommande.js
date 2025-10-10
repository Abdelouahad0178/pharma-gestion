// src/components/commandes/NouvelleCommande.js
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";

// Utils très simples
const num = (v) => {
  if (typeof v === "number") return v || 0;
  const n = parseFloat(String(v ?? "0").replace(",", "."));
  return isNaN(n) ? 0 : n;
};
const safeToFixed = (v, d = 2) => (isNaN(v) ? "0.00" : Number(v).toFixed(d));

export default function NouvelleCommande() {
  const { user, societeId } = useUserRole();

  // Chargement stock (fiches) + lots
  const [stockDocs, setStockDocs] = useState([]);         // societe/{id}/stock
  const [stockEntries, setStockEntries] = useState([]);   // societe/{id}/stock_entries

  useEffect(() => {
    if (!societeId) return;
    const unsub1 = onSnapshot(collection(db, "societe", societeId, "stock"), (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setStockDocs(arr);
    });

    const qLots = query(collection(db, "societe", societeId, "stock_entries"), orderBy("nom"));
    const unsub2 = onSnapshot(qLots, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setStockEntries(arr);
    });

    return () => {
      unsub1?.();
      unsub2?.();
    };
  }, [societeId]);

  // Index des produits en stock (par nom) avec quantité totale + dernier prix connu
  const stockIndexByName = useMemo(() => {
    const map = new Map();
    // Fiche produit
    for (const s of stockDocs) {
      const name = s?.nom ?? s?.name ?? "";
      if (!name) continue;
      const exist = map.get(name) || { nom: name, qte: 0, lastPrice: 0, stockDocId: s.id };
      exist.qte += num(s?.quantite ?? s?.qty ?? 0);
      exist.lastPrice = exist.lastPrice || num(s?.prixVente ?? 0);
      exist.stockDocId = s.id;
      map.set(name, exist);
    }
    // Lots
    for (const lot of stockEntries) {
      const name = lot?.nom ?? lot?.name ?? "";
      if (!name) continue;
      const exist = map.get(name) || { nom: name, qte: 0, lastPrice: 0, stockDocId: null };
      exist.qte += num(lot?.stock1) + num(lot?.stock2);
      exist.lastPrice = exist.lastPrice || num(lot?.prixVente ?? 0);
      map.set(name, exist);
    }
    // tri
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [stockDocs, stockEntries]);

  // ---- UI / Form ----
  const [modeProduit, setModeProduit] = useState("stock"); // "stock" | "nouveau"
  const [client, setClient] = useState("");
  const [qteCommande, setQteCommande] = useState(1);
  const [notes, setNotes] = useState("");

  // Si "stock"
  const [stockNom, setStockNom] = useState("");
  // Si "nouveau"
  const [newNom, setNewNom] = useState("");
  const [newPrix, setNewPrix] = useState("");
  const [newDetails, setNewDetails] = useState("");

  // Détection du produit courant (quel que soit le mode)
  const currentName = modeProduit === "stock" ? stockNom.trim() : newNom.trim();
  const currentStockInfo = useMemo(() => {
    if (!currentName) return null;
    return stockIndexByName.find((x) => x.nom.toLowerCase() === currentName.toLowerCase()) || null;
  }, [currentName, stockIndexByName]);

  // Autofill du prix si on choisit un produit stock
  useEffect(() => {
    if (modeProduit === "stock") {
      const info = currentStockInfo;
      if (info && !newPrix) {
        setNewPrix(info.lastPrice ? String(info.lastPrice) : "");
      }
    }
  }, [modeProduit, currentStockInfo]); // eslint-disable-line

  const etatBadge = () => {
    if (!currentName) return null;
    if (!currentStockInfo) {
      return (
        <span style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>
          État stock : Inconnu (non trouvé)
        </span>
      );
    }
    const q = currentStockInfo.qte;
    const bg = q > 0 ? "linear-gradient(135deg,#dcfce7,#bbf7d0)" : "linear-gradient(135deg,#fee2e2,#fecaca)";
    const col = q > 0 ? "#065f46" : "#991b1b";
    return (
      <span style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, background: bg, color: col, fontWeight: 800 }}>
        État stock : {q}
      </span>
    );
  };

  const canSubmit = () => {
    if (!client || !qteCommande || qteCommande <= 0) return false;
    if (modeProduit === "stock") return !!stockNom;
    return !!newNom;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!societeId || !user) return;
    if (!canSubmit()) return;

    // Normalise les données produit
    const baseProduit = {
      nom: currentName,
      // pour traçabilité, on garde si la commande cible un produit déjà existant
      existInStock: Boolean(currentStockInfo),
      stockDocId: currentStockInfo?.stockDocId || null,
      prixSouhaite: num(newPrix) || (currentStockInfo?.lastPrice ?? 0),
      details: modeProduit === "stock" ? "" : (newDetails || ""),
      source: modeProduit, // "stock" | "nouveau"
    };

    const dataCommande = {
      client: client.trim() || "(client)",
      produit: baseProduit,
      quantite: num(qteCommande),
      notes: (notes || "").trim(),
      statut: "en_attente", // par ex : en_attente | validée | livrée
      createdAt: Timestamp.now(),
      createdBy: user.email || user.uid,
    };

    const ref = doc(collection(db, "societe", societeId, "commandes"));
    await setDoc(ref, dataCommande);

    // Reset rapide
    setClient("");
    setQteCommande(1);
    setNotes("");
    setStockNom("");
    setNewNom("");
    setNewPrix("");
    setNewDetails("");
    alert("Commande enregistrée !");
  };

  return (
    <div style={{ background: "linear-gradient(135deg,#eef2ff,#f5f3ff)", padding: 20, borderRadius: 16 }}>
      <h2 style={{ marginTop: 0, marginBottom: 12, fontWeight: 800, color: "#111827" }}>Nouvelle commande</h2>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        {/* Client & quantité */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Client *</label>
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Nom du client"
              required
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Quantité *</label>
            <input
              type="number"
              min={1}
              value={qteCommande}
              onChange={(e) => setQteCommande(Number(e.target.value))}
              required
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
            />
          </div>
        </div>

        {/* Choix source produit */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Type de produit :</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="modeProduit"
              value="stock"
              checked={modeProduit === "stock"}
              onChange={() => setModeProduit("stock")}
            />
            <span>Produit de stock</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="modeProduit"
              value="nouveau"
              checked={modeProduit === "nouveau"}
              onChange={() => setModeProduit("nouveau")}
            />
            <span>Nouveau produit</span>
          </label>

          {/* État stock toujours visible dès qu'un nom est connu */}
          <div style={{ marginLeft: "auto" }}>{etatBadge()}</div>
        </div>

        {modeProduit === "stock" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Produit (stock) *</label>
              <input
                list="produits-stock"
                value={stockNom}
                onChange={(e) => setStockNom(e.target.value)}
                placeholder="Rechercher / sélectionner…"
                required
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
              />
              <datalist id="produits-stock">
                {stockIndexByName.map((p) => (
                  <option key={p.nom} value={p.nom}>{`${p.nom} — Qté: ${p.qte}`}</option>
                ))}
              </datalist>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>
                Astuce : même si la quantité est 0, l’état stock sera affiché.
              </p>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Prix souhaité (DH)</label>
              <input
                type="number"
                step="0.01"
                value={newPrix}
                onChange={(e) => setNewPrix(e.target.value)}
                placeholder={currentStockInfo?.lastPrice ? `Dernier: ${safeToFixed(currentStockInfo.lastPrice)}` : "Ex. 12.00"}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Nom du produit *</label>
              <input
                value={newNom}
                onChange={(e) => setNewNom(e.target.value)}
                placeholder="Saisir un nom (on vérifie s'il existe déjà)"
                required
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                list="produits-stock-suggestion"
              />
              {/* suggestions pour éviter les doublons */}
              <datalist id="produits-stock-suggestion">
                {stockIndexByName.map((p) => (
                  <option key={p.nom} value={p.nom}>{`Existe déjà — Qté: ${p.qte}`}</option>
                ))}
              </datalist>
              <textarea
                value={newDetails}
                onChange={(e) => setNewDetails(e.target.value)}
                rows={2}
                placeholder="Détails / présentation / dosage (optionnel)"
                style={{ width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb", resize: "vertical" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Prix souhaité (DH)</label>
              <input
                type="number"
                step="0.01"
                value={newPrix}
                onChange={(e) => setNewPrix(e.target.value)}
                placeholder="Ex. 12.00"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
              />
              {currentStockInfo && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>
                  Correspond à un produit existant — dernier prix: {safeToFixed(currentStockInfo.lastPrice || 0)} DH
                </p>
              )}
            </div>
          </div>
        )}

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Notes (optionnel)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Informations supplémentaires…"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb", resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={!canSubmit()}
            style={{
              background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
              color: "white",
              border: "none",
              padding: "12px 20px",
              borderRadius: 12,
              fontWeight: 800,
              cursor: canSubmit() ? "pointer" : "not-allowed",
              opacity: canSubmit() ? 1 : 0.6
            }}
          >
            Enregistrer la commande
          </button>
        </div>
      </form>
    </div>
  );
}

// src/components/paiements/Paiements.js
/*
 * GESTION DES PAIEMENTS (compat Achats multi-lots)
 * - Compatible avec Achats.js: articles { commandee | recu }, remiseGlobale, statutPaiement
 * - Mise à jour automatique du statut (impayé/partiel/payé) côté document source
 * - Historique activities
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { db } from "../../firebase/config";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

/* ===== Utils dates sûrs ===== */
function toDateSafe(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "object" && typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function secondsFromAnyDate(v) {
  const d = toDateSafe(v);
  return d ? Math.floor(d.getTime() / 1000) : 0;
}
function formatDate(v, locale = "fr-FR") {
  const d = toDateSafe(v);
  return d ? d.toLocaleDateString(locale) : "—";
}

/* ===== Composant ===== */
export default function Paiements() {
  const { societeId, user, loading } = useUserRole();

  // Base state
  const [waiting, setWaiting] = useState(true);
  const [relatedTo, setRelatedTo] = useState("achats"); // "achats" | "ventes" (si تحتاج)
  const [documents, setDocuments] = useState([]);
  const [paiements, setPaiements] = useState([]);

  // Form state
  const [selectedDoc, setSelectedDoc] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [editingPaiement, setEditingPaiement] = useState(null);

  // UI state
  const [filterStatus, setFilterStatus] = useState("all"); // all | paid | due
  const [notification, setNotification] = useState(null);

  // Listeners refs
  const documentsUnsubRef = useRef(null);
  const paiementsUnsubRef = useRef(null);

  useEffect(() => setWaiting(loading || !societeId || !user), [loading, societeId, user]);

  const showNotification = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  /* ===== Calcul total d’un document (compatible Achats multi-lots) =====
     - Pour achats: نأخذ a.recu (إن وُجد) وإلا a.commandee
     - prix = prixAchat || prixUnitaire
     - total = Σ (prix * quantite - remise) - remiseGlobale
  */
  const getTotalDoc = useCallback(
    (docu) => {
      if (!docu || !Array.isArray(docu.articles) || docu.articles.length === 0) return 0;
      const lignes = docu.articles.map((a) => a?.recu || a?.commandee || a || {});
      const total = lignes.reduce((sum, item) => {
        const qte = Number(item.quantite || 0);
        const prix =
          relatedTo === "achats"
            ? Number(item.prixAchat || item.prixUnitaire || 0)
            : Number(item.prixUnitaire || item.prixVente || 0);
        const remise = Number(item.remise || 0);
        return sum + (qte * prix - remise);
      }, 0);
      return total - (Number(docu.remiseGlobale) || 0);
    },
    [relatedTo]
  );

  /* ===== Groupage paiements par doc ===== */
  const paiementsByDoc = {};
  paiements.forEach((p) => {
    if (!paiementsByDoc[p.docId]) paiementsByDoc[p.docId] = [];
    paiementsByDoc[p.docId].push(p);
  });

  /* ===== Listeners: documents (achats/ventes) ===== */
  const loadDocuments = useCallback(() => {
    if (!societeId) return;
    if (documentsUnsubRef.current) documentsUnsubRef.current();

    const qCol = collection(db, "societe", societeId, relatedTo);
    documentsUnsubRef.current = onSnapshot(
      qCol,
      (snap) => {
        const arr = [];
        snap.forEach((d) => {
          const data = d.data();
          // accepter soit a.quantite (ventes), soit a.commandee.quantite/recu.quantite (achats)
          const okArticles =
            Array.isArray(data.articles) &&
            data.articles.some(
              (a) =>
                typeof a?.quantite === "number" ||
                typeof a?.commandee?.quantite === "number" ||
                typeof a?.recu?.quantite === "number"
            );
        if (okArticles) arr.push({ id: d.id, ...data });
        });
        arr.sort((a, b) => {
          const sa = secondsFromAnyDate(a.date) || secondsFromAnyDate(a.timestamp);
          const sb = secondsFromAnyDate(b.date) || secondsFromAnyDate(b.timestamp);
          return sb - sa;
        });
        setDocuments(arr);
      },
      (err) => {
        console.error("Err docs:", err);
      }
    );
  }, [societeId, relatedTo]);

  /* ===== Listeners: paiements ===== */
  const loadPaiements = useCallback(() => {
    if (!societeId) return;
    if (paiementsUnsubRef.current) paiementsUnsubRef.current();

    const qy = query(collection(db, "societe", societeId, "paiements"), where("type", "==", relatedTo));
    paiementsUnsubRef.current = onSnapshot(
      qy,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        arr.sort((a, b) => secondsFromAnyDate(b.date) - secondsFromAnyDate(a.date));
        setPaiements(arr);
      },
      (err) => {
        console.error("Err paiements:", err);
      }
    );
  }, [societeId, relatedTo]);

  useEffect(() => {
    if (!societeId) return;
    loadDocuments();
    loadPaiements();
    return () => {
      if (documentsUnsubRef.current) documentsUnsubRef.current();
      if (paiementsUnsubRef.current) paiementsUnsubRef.current();
    };
  }, [societeId, relatedTo, loadDocuments, loadPaiements]);

  useEffect(() => {
    setSelectedDoc("");
    setMontant("");
    setEditingPaiement(null);
  }, [relatedTo]);

  /* ===== Helper: mise à jour statut règlement dans doc source ===== */
  const updateDocumentStatus = useCallback(
    async (docId, totalPaye, totalDoc) => {
      if (!societeId || !user) return;
      try {
        let statut = "impayé";
        if (totalPaye >= totalDoc) statut = "payé";
        else if (totalPaye > 0) statut = "partiel";

        await updateDoc(doc(db, "societe", societeId, relatedTo, docId), {
          statutPaiement: statut,
          montantPaye: totalPaye,
          lastPaymentUpdate: Timestamp.now(),
          modifiePar: user.uid,
          modifieParEmail: user.email,
          modifieLe: Timestamp.now(),
        });
      } catch (e) {
        console.error("Maj statutPaiement:", e);
      }
    },
    [societeId, user, relatedTo]
  );

  /* ===== Sélection doc: pré-remplir montant restant ===== */
  const handleSelectDoc = useCallback(
    (docId) => {
      setSelectedDoc(docId);
      const d = documents.find((x) => x.id === docId);
      if (!d) return setMontant("");
      const total = getTotalDoc(d);
      const deja = (paiementsByDoc[docId] || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
      const restant = total - deja;
      setMontant(restant > 0 ? String(restant) : "");
    },
    [documents, getTotalDoc, paiementsByDoc]
  );

  /* ===== Créer / Modifier paiement ===== */
  const handleSavePaiement = useCallback(
    async (e) => {
      e.preventDefault();
      if (!societeId || !user || !selectedDoc) return;
      const montantNum = Number(montant);
      if (montantNum <= 0) return showNotification("Le montant doit être > 0", "error");

      const docData = documents.find((d) => d.id === selectedDoc);
      const totalDoc = getTotalDoc(docData);
      const dejaPaye = (paiementsByDoc[selectedDoc] || []).reduce(
        (s, p) => s + (Number(p.montant) || 0),
        0
      );

      try {
        if (editingPaiement) {
          const ancien = Number(editingPaiement.montant);
          const nouveauTotal = dejaPaye - ancien + montantNum;
          if (nouveauTotal > totalDoc)
            return showNotification(
              `Le total payé (${nouveauTotal} DH) dépasse le total du document (${totalDoc} DH)`,
              "error"
            );

          await updateDoc(doc(db, "societe", societeId, "paiements", editingPaiement.id), {
            montant: montantNum,
            mode,
            modifiePar: user.uid,
            modifieParEmail: user.email,
            modifieLe: Timestamp.now(),
          });

          await addDoc(collection(db, "societe", societeId, "activities"), {
            type: "paiement",
            userId: user.uid,
            userEmail: user.email,
            timestamp: Timestamp.now(),
            details: {
              docId: selectedDoc,
              montant: montantNum,
              mode,
              type: relatedTo,
              action: "modification",
              paiementId: editingPaiement.id,
            },
          });

          await updateDocumentStatus(selectedDoc, nouveauTotal, totalDoc);
          setEditingPaiement(null);
          showNotification("Paiement modifié ✅");
        } else {
          const nouveauTotal = dejaPaye + montantNum;
          if (nouveauTotal > totalDoc)
            return showNotification(
              `Le total payé (${nouveauTotal} DH) dépasse le total du document (${totalDoc} DH)`,
              "error"
            );

          const added = await addDoc(collection(db, "societe", societeId, "paiements"), {
            docId: selectedDoc,
            montant: montantNum,
            mode,
            type: relatedTo,
            date: Timestamp.now(),
            creePar: user.uid,
            creeParEmail: user.email,
            creeLe: Timestamp.now(),
            societeId,
          });

          await addDoc(collection(db, "societe", societeId, "activities"), {
            type: "paiement",
            userId: user.uid,
            userEmail: user.email,
            timestamp: Timestamp.now(),
            details: {
              docId: selectedDoc,
              montant: montantNum,
              mode,
              type: relatedTo,
              action: "création",
              paiementId: added.id,
            },
          });

          await updateDocumentStatus(selectedDoc, nouveauTotal, totalDoc);
          showNotification("Paiement enregistré ✅");
        }

        // reset
        setSelectedDoc("");
        setMontant("");
        setMode("Espèces");
      } catch (err) {
        console.error("Save paiement:", err);
        showNotification("Erreur lors de l'enregistrement", "error");
      }
    },
    [
      societeId,
      user,
      selectedDoc,
      montant,
      documents,
      getTotalDoc,
      paiementsByDoc,
      mode,
      editingPaiement,
      relatedTo,
      updateDocumentStatus,
      showNotification,
    ]
  );

  /* ===== Suppression ===== */
  const handleDeletePaiement = useCallback(
    async (p) => {
      if (!societeId || !user) return;
      if (!window.confirm("Supprimer ce paiement ?")) return;
      try {
        const docData = documents.find((d) => d.id === p.docId);
        const totalDoc = getTotalDoc(docData);
        const deja = (paiementsByDoc[p.docId] || []).reduce((s, x) => s + (Number(x.montant) || 0), 0);
        const nouveauTotal = deja - Number(p.montant);

        await deleteDoc(doc(db, "societe", societeId, "paiements", p.id));

        await addDoc(collection(db, "societe", societeId, "activities"), {
          type: "paiement",
          userId: user.uid,
          userEmail: user.email,
          timestamp: Timestamp.now(),
          details: {
            docId: p.docId,
            montant: p.montant,
            mode: p.mode,
            type: p.type,
            action: "suppression",
            paiementId: p.id,
          },
        });

        await updateDocumentStatus(p.docId, nouveauTotal, totalDoc);
        showNotification("Paiement supprimé ✅");
      } catch (e) {
        console.error("Delete paiement:", e);
        showNotification("Erreur lors de la suppression", "error");
      }
    },
    [societeId, user, documents, getTotalDoc, paiementsByDoc, updateDocumentStatus, showNotification]
  );

  /* ===== Edition ===== */
  const handleEditPaiement = (p) => {
    setEditingPaiement(p);
    setSelectedDoc(p.docId);
    setMontant(String(p.montant));
    setMode(p.mode);
  };

  /* ===== Filtrage docs (paid/due) ===== */
  const docsAffiches = documents.filter((d) => {
    const total = getTotalDoc(d);
    const paid = (paiementsByDoc[d.id] || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
    const solde = total - paid;
    if (filterStatus === "paid") return solde <= 0;
    if (filterStatus === "due") return solde > 0;
    return true;
  });

  /* ===== UI ===== */
  if (waiting) return <div style={{ padding: 20 }}>Chargement des paiements…</div>;
  if (!user) return <div style={{ padding: 20, color: "#e11d48" }}>Non connecté.</div>;
  if (!societeId) return <div style={{ padding: 20, color: "#e11d48" }}>Aucune société.</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      {notification && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 10,
            color: "white",
            background:
              notification.type === "error"
                ? "#ef4444"
                : notification.type === "info"
                ? "#3b82f6"
                : "#22c55e",
          }}
        >
          {notification.message}
        </div>
      )}

      <h2 style={{ margin: 0 ,color:"black" }}>💳 Paiements</h2>
      <div style={{ display: "flex", gap: 10, margin: "12px 0" }}>
        <button
          onClick={() => setRelatedTo("achats")}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: relatedTo === "achats" ? "#10b981" : "white",
            color: relatedTo === "achats" ? "white" : "#111827",
            cursor: "pointer",
          }}
        >
          Achats
        </button>
        <button
          onClick={() => setRelatedTo("ventes")}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: relatedTo === "ventes" ? "#10b981" : "white",
            color: relatedTo === "ventes" ? "white" : "#111827",
            cursor: "pointer",
          }}
        >
          Ventes
        </button>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ marginLeft: "auto", padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
        >
          <option value="all">Tous</option>
          <option value="paid">Payés</option>
          <option value="due">Avec solde</option>
        </select>
      </div>

      {/* Form paiement */}
      <form
        onSubmit={handleSavePaiement}
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, margin: "10px 0" }}
      >
        <select
          required
          value={selectedDoc}
          onChange={(e) => handleSelectDoc(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
        >
          <option value="">-- Choisir un document --</option>
          {docsAffiches.map((d) => {
            const total = getTotalDoc(d);
            const paid = (paiementsByDoc[d.id] || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
            const solde = total - paid;
            const dateStr =
              (d.date && formatDate(d.date)) || (d.timestamp && formatDate(d.timestamp)) || "";
            return (
              <option key={d.id} value={d.id}>
                {relatedTo === "achats" ? "Achat" : "Vente"} #{d.id.slice(0, 8)} • {dateStr} • Total {total.toFixed(2)} DH • Reste {solde.toFixed(2)} DH
              </option>
            );
          })}
        </select>

        <input
          type="number"
          step="0.01"
          placeholder="Montant (DH)"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          required
          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
        >
          <option>Espèces</option>
          <option>Carte</option>
          <option>Virement</option>
          <option>Chèque</option>
        </select>

        <button
          type="submit"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#4f46e5",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {editingPaiement ? "Modifier" : "Enregistrer"}
        </button>

        {editingPaiement && (
          <button
            type="button"
            onClick={() => {
              setEditingPaiement(null);
              setSelectedDoc("");
              setMontant("");
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#f59e0b",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Annuler
          </button>
        )}
      </form>

      {/* Liste paiements */}
      <div style={{ marginTop: 20, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
        <h3 style={{ margin: 0, color:"red" }}>Historique des paiements</h3>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {paiements.map((p) => {
            const d = documents.find((x) => x.id === p.docId);
            const total = getTotalDoc(d);
            const deja = (paiementsByDoc[p.docId] || []).reduce((s, x) => s + (Number(x.montant) || 0), 0);
            const solde = total - deja;

            return (
              <div
                key={p.id}
                style={{
                  padding: 10,
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {relatedTo === "achats" ? "Achat" : "Vente"} #{p.docId?.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {formatDate(p.date)} • {p.mode}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{Number(p.montant).toFixed(2)} DH</div>
                <div style={{ fontSize: 12, color: solde <= 0 ? "#10b981" : "#ef4444" }}>
                  Solde: {solde.toFixed(2)} DH
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => handleEditPaiement(p)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                     
                      cursor: "pointer",
                    }}
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleDeletePaiement(p)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#ef4444",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })}
          {paiements.length === 0 && <div style={{ color: "#6b7280" }}>Aucun paiement.</div>}
        </div>
      </div>
    </div>
  );
}

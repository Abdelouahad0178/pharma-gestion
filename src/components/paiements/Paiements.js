// src/components/paiements/Paiements.js
/*
 * GESTION DES PAIEMENTS (compat Achats multi-lots)
 * - ✅ N'agrège que les BONS D'ACHAT "REÇUS" (statutReception = reçu | partiel)
 * - ✅ Totaux Achats basés UNIQUEMENT sur les lignes "reçues" (a.recu)
 * - Mise à jour automatique du statut (impayé/partiel/payé) côté document source
 * - Historique activities
 * - UI responsive avec scroll horizontal pour les tableaux
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
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

export default function Paiements() {
  const { societeId, user, loading } = useUserRole();

  /* ===== Styles injectés (scroll horizontal, design cohérent Achats) ===== */
  const injectStyles = useCallback(() => {
    if (document.getElementById("paiements-styles")) return;
    const style = document.createElement("style");
    style.id = "paiements-styles";
    style.textContent = `
      :root{
        --p:#6366f1; --p2:#8b5cf6; --bg:#f8fafc; --card:#ffffff; --border:#e5e7eb; --text:#111827;
      }
      .pay-page{ max-width:1280px; margin:0 auto; padding:16px; }
      .card{ background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; box-shadow:0 6px 20px rgba(99,102,241,.06); }
      .card + .card{ margin-top:16px; }
      .header{
        background:linear-gradient(135deg,var(--p),var(--p2)); color:#fff; border-radius:16px; padding:16px; margin-bottom:16px; box-shadow:0 12px 30px rgba(99,102,241,.25);
      }
      .header h1{ margin:0; font-weight:900; letter-spacing:.3px; }
      .sub{ opacity:.9; margin-top:6px; }

      .notice{ border-radius:12px; padding:12px; font-weight:600; margin-bottom:12px; }
      .notice.success{ background:#dcfce7; color:#065f46; }
      .notice.error{ background:#fee2e2; color:#7f1d1d; }
      .notice.info{ background:#e0f2fe; color:#0c4a6e; }

      .controls{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .btn{
        padding:10px 12px; border-radius:10px; border:1px solid var(--border);
        font-weight:700; cursor:pointer;
      }
      .btn.active{ background:#10b981; color:#fff; border-color:#10b981; }
      .btn.primary{ background:linear-gradient(135deg,var(--p),var(--p2)); color:#fff; border:0; }
      .btn.warn{ background:#f59e0b; color:#fff; border-color:#f59e0b; }
      .btn.danger{ background:#ef4444; color:#fff; border-color:#ef4444; }
      .field, .select{
        padding:10px; border-radius:10px; border:1px solid var(--border); background:#cfd7e5; outline:none;
      }
      .grid-form{ display:grid; grid-template-columns:1fr 1fr 1fr auto auto; gap:10px; }
      @media (max-width:1024px){ .grid-form{ grid-template-columns:1fr 1fr; } }
      @media (max-width:640px){ .grid-form{ grid-template-columns:1fr; } }

      .table-scroll{ width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid var(--border); border-radius:12px; background:#fff; }
      .table{ width:100%; min-width:1100px; border-collapse:collapse; }
      .table thead th{
        position:sticky; top:0; background:linear-gradient(135deg,#f8fafc,#eef2ff);
        color:#111827; font-weight:800; text-transform:uppercase; font-size:12px; letter-spacing:.5px;
        border-bottom:1px solid var(--border); padding:12px 10px; text-align:center; z-index:1;
      }
      .table tbody td{ padding:12px 10px; border-bottom:1px solid var(--border); text-align:center; color:#0f172a; font-weight:600; background:#fff; }
      .left{ text-align:left; }
      .chip{ padding:4px 8px; border-radius:8px; background:#eef2ff; color:var(--p); font-weight:800; display:inline-block; }
      .money{ color:var(--p); font-weight:800; }
      .ok{ color:#10b981; font-weight:700; }
      .due{ color:#ef4444; font-weight:700; }
      .muted{ color:#6b7280; }
    `;
    document.head.appendChild(style);
  }, []);
  useEffect(() => { injectStyles(); }, [injectStyles]);

  // Base state
  const [waiting, setWaiting] = useState(true);
  const [relatedTo, setRelatedTo] = useState("achats"); // "achats" | "ventes"
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

  /* ===== Calcul total d’un document =====
     ACHATS  ➜ somme EXCLUSIVE des lignes "reçues" (a.recu)   ✅
     VENTES  ➜ somme des lignes (prixUnitaire|prixVente) * quantite
     total = Σ(...) - remiseGlobale
  */
  const getTotalDoc = useCallback(
    (docu) => {
      if (!docu || !Array.isArray(docu.articles) || docu.articles.length === 0) return 0;

      if (relatedTo === "achats") {
        // ✅ Seules les lignes recues comptent
        const lignesRecues = docu.articles
          .map((a) => a?.recu || null)
          .filter((r) => r && Number(r.quantite || 0) > 0);

        const total = lignesRecues.reduce((sum, r) => {
          const qte = Number(r.quantite || 0);
          const prix = Number(r.prixAchat || r.prixUnitaire || 0);
          const remise = Number(r.remise || 0);
          return sum + (qte * prix - remise);
        }, 0);

        return total - (Number(docu.remiseGlobale) || 0);
      }

      // ventes (ou autres) : comportement standard
      const lignes = docu.articles.map((a) => a || {});
      const total = lignes.reduce((sum, item) => {
        const qte = Number(item.quantite || 0);
        const prix = Number(item.prixUnitaire || item.prixVente || 0);
        const remise = Number(item.remise || 0);
        return sum + (qte * prix - remise);
      }, 0);
      return total - (Number(docu.remiseGlobale) || 0);
    },
    [relatedTo]
  );

  /* ===== Groupage paiements par doc (mémoisé) ===== */
  const paiementsByDoc = useMemo(() => {
    const b = {};
    paiements.forEach((p) => {
      if (!b[p.docId]) b[p.docId] = [];
      b[p.docId].push(p);
    });
    return b;
  }, [paiements]);

  /* ===== Index des documents (pour affichage nom + N° + totaux/solde) ===== */
  const docIndex = useMemo(() => {
    const m = {};
    documents.forEach((d) => {
      const idShort = String(d.id).slice(0, 8).toUpperCase();
      const numberStr = `#${idShort}`;
      const dateStr = (d.date && formatDate(d.date)) || (d.timestamp && formatDate(d.timestamp)) || "—";
      const total = getTotalDoc(d);
      const paid = (paiementsByDoc[d.id] || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
      const solde = total - paid;

      const fournisseur = d.fournisseur || ""; // pour achats
      const client = d.client || d.patient || ""; // pour ventes
      const name =
        relatedTo === "achats"
          ? (fournisseur || "Fournisseur inconnu")
          : (client || "Client inconnu");

      const label = relatedTo === "achats"
        ? `${name} • Achat ${numberStr}`
        : `${name} • Vente ${numberStr}`;

      m[d.id] = {
        id: d.id,
        numberStr,
        dateStr,
        name,
        label,
        total,
        paid,
        solde,
        raw: d,
      };
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, paiementsByDoc, getTotalDoc, relatedTo]);

  /* ===== Listeners: documents (achats/ventes) =====
     ➜ Achats: ne garder que statutReception ∈ {"reçu","partiel"}  ✅
  */
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

          // Articles présents (compat)
          const okArticles = Array.isArray(data.articles) && data.articles.length > 0;

          if (!okArticles) return;

          if (relatedTo === "achats") {
            const statut = (data.statutReception || "en_attente").toLowerCase();
            // ✅ N'afficher que reçus/partiels (exclure en_attente et annulé)
            if (!["reçu", "recu", "partiel"].includes(statut)) return;
          }

          arr.push({ id: d.id, ...data });
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
              `Le total payé (${nouveauTotal.toFixed(2)} DH) dépasse le total du document (${totalDoc.toFixed(2)} DH)`,
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
              `Le total payé (${nouveauTotal.toFixed(2)} DH) dépasse le total du document (${totalDoc.toFixed(2)} DH)`,
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
  const docsAffiches = useMemo(() => {
    return documents.filter((d) => {
      const total = getTotalDoc(d);
      const paid = (paiementsByDoc[d.id] || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
      const solde = total - paid;
      if (filterStatus === "paid") return solde <= 0;
      if (filterStatus === "due") return solde > 0;
      return true;
    });
  }, [documents, getTotalDoc, paiementsByDoc, filterStatus]);

  /* ===== UI ===== */
  if (waiting) return <div style={{ padding: 20 }}>Chargement des paiements…</div>;
  if (!user) return <div style={{ padding: 20, color: "#e11d48" }}>Non connecté.</div>;
  if (!societeId) return <div style={{ padding: 20, color: "#e11d48" }}>Aucune société.</div>;

  return (
    <div className="pay-page">
      {/* En-tête */}
      <div className="header">
        <h1>Gestion des Paiements</h1>
        <div className="sub">
          Règlements & soldes — {relatedTo === "achats" ? "Bons d'achat reçus uniquement" : "Ventes"}
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`notice ${notification.type || "success"}`}>{notification.message}</div>
      )}

      {/* Onglets + filtre */}
      <div className="card">
        <div className="controls" style={{ marginBottom: 12 }}>
          <button
            onClick={() => setRelatedTo("achats")}
            className={`btn ${relatedTo === "achats" ? "active" : ""}`}
          >
            Achats (reçus)
          </button>
          <button
            onClick={() => setRelatedTo("ventes")}
            className={`btn ${relatedTo === "ventes" ? "active" : ""}`}
          >
            Ventes
          </button>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="select"
            style={{ marginLeft: "auto" }}
          >
            <option value="all">Tous</option>
            <option value="paid">Payés</option>
            <option value="due">Avec solde</option>
          </select>
        </div>

        {/* Form paiement */}
        <form onSubmit={handleSavePaiement} className="grid-form">
          <select
            required
            value={selectedDoc}
            onChange={(e) => handleSelectDoc(e.target.value)}
            className="select"
          >
            <option value="">-- Choisir un document --</option>
            {docsAffiches.map((d) => {
              const meta = docIndex[d.id];
              const statutRec = (d.statutReception || "en_attente").toLowerCase();
              const statutLabel =
                statutRec === "reçu" || statutRec === "recu" ? "Réception complète" :
                statutRec === "partiel" ? "Réception partielle" :
                "—";

              const optLabel = meta
                ? `${meta.name} • Achat ${meta.numberStr} • ${statutLabel} • ${meta.dateStr} • Total ${meta.total.toFixed(2)} DH • Reste ${(meta.solde).toFixed(2)} DH`
                : `Achat #${String(d.id).slice(0,8).toUpperCase()}`;
              return (
                <option key={d.id} value={d.id}>
                  {optLabel}
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
            className="field"
          />

          <select value={mode} onChange={(e) => setMode(e.target.value)} className="select">
            <option>Espèces</option>
            <option>Carte</option>
            <option>Virement</option>
            <option>Chèque</option>
          </select>

          <button type="submit" className="btn primary">
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
              className="btn warn"
            >
              Annuler
            </button>
          )}
        </form>
      </div>

      {/* Historique paiements (TABLE + scroll horizontal) */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Historique des paiements</h3>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="left">Document</th>
                <th>Nom</th>
                <th>N°</th>
                <th>Date</th>
                <th>Mode</th>
                <th>Montant</th>
                <th>Total Doc</th>
                <th>Déjà payé</th>
                <th>Solde</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paiements.map((p) => {
                // NB: Si l'onglet change, on continue d'afficher les paiements de ce type (filter by type déjà appliqué en listener)
                const meta = docIndex[p.docId];
                const name = meta?.name || (relatedTo === "achats" ? "Fournisseur inconnu" : "Client inconnu");
                const numberStr = meta?.numberStr || `#${String(p.docId || "").slice(0,8).toUpperCase()}`;
                const total = meta?.total ?? 0;
                const deja = (paiementsByDoc[p.docId] || []).reduce((s, x) => s + (Number(x.montant) || 0), 0);
                const solde = total - deja;

                return (
                  <tr key={p.id}>
                    <td className="left">
                      <span className="chip">{relatedTo === "achats" ? "Achat reçu" : "Vente"}</span>
                    </td>
                    <td className="left">{name}</td>
                    <td>{numberStr}</td>
                    <td className="muted">{formatDate(p.date)}</td>
                    <td>{p.mode}</td>
                    <td className="money">{Number(p.montant).toFixed(2)} DH</td>
                    <td>{total.toFixed(2)} DH</td>
                    <td>{deja.toFixed(2)} DH</td>
                    <td className={solde <= 0 ? "ok" : "due"}>
                      {solde.toFixed(2)} DH
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button className="btn" onClick={() => handleEditPaiement(p)}>Modifier</button>
                        <button className="btn danger" onClick={() => handleDeletePaiement(p)}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paiements.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 16 }}>
                    Aucun paiement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

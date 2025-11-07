// src/components/caisse/ClotureCaisse.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  limit,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";

/* ================= Utils ================= */

const toNum = (v) => {
  const n = Number(typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (x) => Math.round(x * 100) / 100;

const isTimestamp = (v) =>
  v && typeof v === "object" && (typeof v.toDate === "function" || typeof v.seconds === "number");

const toDateObj = (v) => {
  if (!v) return null;
  if (isTimestamp(v)) return typeof v.toDate === "function" ? v.toDate() : new Date(v.seconds * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const hasTimeInString = (s) => /\d{1,2}:\d{2}/.test(String(s || ""));

/** Choisir une datetime fiable (évite 01:00 par défaut) */
function getBestDate(obj) {
  if (obj?.heureOperation && hasTimeInString(obj.heureOperation)) {
    const base = toDateObj(obj?.date) || new Date();
    try {
      const [h, m = "0", ss = "0"] = String(obj.heureOperation).split(":");
      const dt = new Date(base);
      dt.setHours(Number(h) || 0, Number(m) || 0, Number(ss) || 0, 0);
      if (!Number.isNaN(dt.getTime())) return dt;
    } catch {}
  }
  const cands = [obj?.paidAt, obj?.createdAt, obj?.updatedAt, obj?.timestamp];
  for (const c of cands) {
    const dt = toDateObj(c);
    if (dt) return dt;
  }
  if (obj?.date && (isTimestamp(obj.date) || hasTimeInString(obj.date))) {
    const dt = toDateObj(obj.date);
    if (dt) return dt;
  }
  return null;
}

/** même jour local */
function sameLocalDay(d, ref = new Date()) {
  const dt = toDateObj(d);
  if (!dt) return false;
  return (
    dt.getFullYear() === ref.getFullYear() &&
    dt.getMonth() === ref.getMonth() &&
    dt.getDate() === ref.getDate()
  );
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/** espèces strict (tolérant aux variantes) */
const isCash = (mode) => {
  const m = norm(mode);
  return ["cash", "espece", "especes", "esp", "liquide", "liquides"].includes(m);
};
/** statut PAYÉ strict */
const isPaidStrict = (statut) => {
  const s = norm(statut);
  return s === "paye" || s === "payé" || s === "paid" || s === "regle" || s === "réglé";
};
/** vente de stock1/stock2 ? */
const comesFromStock1or2 = (v) => {
  const candidates = [
    v?.stockSource, v?.sourceStock, v?.stockFrom, v?.entrepot, v?.depot, v?.magasin, v?.origineStock,
    v?.stockId, v?.stock, v?.typeStock,
  ].map(norm).filter(Boolean);

  if (Array.isArray(v?.lignes || v?.items)) {
    (v.lignes || v.items).forEach((ln) => {
      [ln?.stockId, ln?.sourceStock, ln?.lotStock, ln?.stock]
        .map(norm)
        .filter(Boolean)
        .forEach((x) => candidates.push(x));
    });
  }

  const ok = new Set([
    "stock1", "stock 1", "s1", "stk1", "magasin1", "store1", "rayon1", "front1",
    "stock2", "stock 2", "s2", "stk2", "magasin2", "store2", "rayon2", "front2"
  ]);
  const bad = new Set(["stock0", "stk0", "reserve", "magasin0", "wh", "warehouse", "back", "arriere", "arrière"]);

  if (candidates.some((c) => bad.has(c))) return false;
  if (candidates.some((c) => ok.has(c))) return true;
  return false;
};

/** vente retour/avoir ? */
const isReturnOrNegativeSale = (v) => {
  const motif = norm(v?.motif || v?.typeOperation || v?.operation || "");
  if (motif.includes("retour") || motif.includes("avoir")) return true;
  const total =
    (typeof v.montantTotal === "number" && v.montantTotal) ||
    (typeof v.totalTTC === "number" && v.totalTTC) ||
    (typeof v.total === "number" && v.total) ||
    toNum(v.montant);
  return total < 0;
};

function todayId(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const diffMs = (a, b) => Math.abs((a?.getTime?.() || 0) - (b?.getTime?.() || 0));
const linksToSale = (p) => ["venteId", "saleId", "idVente", "refVente"].some((k) => !!p?.[k]);

/* ============ Helpers causes (historique) ============ */

/** Transforme une cause (string | object) en chaîne lisible */
function prettyCause(c) {
  if (typeof c === "string") return c;
  if (c && typeof c === "object") {
    const cause = String(c.cause || c.type || "Opération");
    const dir = c.direction ? ` ${c.direction === "in" ? "↗️" : "↙️"}` : "";
    const amt = Number.isFinite(c.amount) ? ` ${toNum(c.amount).toFixed(2)} DHS` : "";
    return `${cause}${dir}${amt}`.trim();
  }
  try {
    return JSON.stringify(c);
  } catch {
    return String(c);
  }
}

/** Normalise le tableau "causes" (pour anciens enregistrements) */
function normalizeCauses(causes) {
  if (!Array.isArray(causes)) return [];
  return causes.map(prettyCause);
}

/* =========================================================
   Clôture de caisse — AGRÉGATION ventes espèces stock1+stock2
   + paiements non liés à une vente
   + charges (payé+espèces)
   + anti-doublons & heures réelles
   + ▶/▼ détail des ventes avec remises (via remiseTotal de Ventes.js)
========================================================= */

export default function ClotureCaisse() {
  const { societeId, user } = useUserRole();

  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [physicalCash, setPhysicalCash] = useState("");
  const physical = toNum(physicalCash);

  const [closure, setClosure] = useState(null);
  const [closureHistory, setClosureHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("today"); // "today" ou "history"
  const [expandedDay, setExpandedDay] = useState(null);

  // ventes du jour avec remises
  const [ventesRemises, setVentesRemises] = useState([]);
  const [expandRemises, setExpandRemises] = useState(false);

  const closureDocRef = useMemo(() => {
    if (!societeId) return null;
    return doc(db, "societe", societeId, "closures", todayId());
  }, [societeId]);

  // État clôture & préremplissage du solde physique existant
  useEffect(() => {
    if (!closureDocRef) return;
    return onSnapshot(closureDocRef, (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setClosure(data);
        if (typeof data.physicalCash === "number") {
          setPhysicalCash(String(data.physicalCash));
        }
      } else {
        setClosure(null);
      }
    });
  }, [closureDocRef]);

  // Historique des clôtures (30 derniers jours) — normaliser causes
  useEffect(() => {
    if (!societeId) return;
    return onSnapshot(
      query(
        collection(db, "societe", societeId, "closures"),
        orderBy("dateId", "desc"),
        limit(30)
      ),
      (snap) => {
        const history = [];
        snap.forEach((d) => {
          if (d.id !== todayId()) {
            const raw = d.data() || {};
            const normed = {
              id: d.id,
              ...raw,
              causes: normalizeCauses(raw.causes || []), // 🛡️ évite l’objet en React child
            };
            history.push(normed);
          }
        });
        setClosureHistory(history);
      }
    );
  }, [societeId]);

  // Écoutes collections
  useEffect(() => {
    if (!societeId) return;
    setLoading(true);
    const unsubs = [];

    // 1) VENTES (espèces) — AGRÉGÉES stock1+stock2 + collecte remises
    unsubs.push(
      onSnapshot(
        query(collection(db, "societe", societeId, "ventes"), orderBy("date", "desc")),
        (snap) => {
          let totalCashStock12 = 0;
          let lastDate = null;
          let count = 0;
          const remises = [];

          snap.forEach((d) => {
            const v = d.data() || {};
            const at = getBestDate(v);
            if (!sameLocalDay(at)) return;
            if (!comesFromStock1or2(v)) return;
            if (isReturnOrNegativeSale(v)) return;

            const statut = v.statutPaiement || v.statut;
            const mode = v.modePaiement || v.mode || v.moyen;
            if (!isPaidStrict(statut) || !isCash(mode)) return;

            // ✅ Montant net prioritaire (déjà après remise) — vient de Ventes.js
            let amount = 0;
            if (typeof v.montantTotal === "number") {
              amount = v.montantTotal;
            } else if (typeof v.totalTTC === "number") {
              amount = v.totalTTC;
            } else if (typeof v.total === "number") {
              amount = v.total;
            } else if (v.montant) {
              amount = toNum(v.montant);
            } else if (Array.isArray(v.articles) && v.articles.length > 0) {
              // Fallback net : somme (qty*prix - remiseLigne), sans remise globale additionnelle
              const subtotal = v.articles.reduce((s, art) => {
                const qty = Number(art?.quantite) || 0;
                const prix = Number(art?.prixUnitaire ?? art?.prix) || 0;
                const remiseLigne = Number(art?.remise) || 0;
                return s + (qty * prix - remiseLigne);
              }, 0);
              amount = subtotal;
            }

            amount = Math.max(0, toNum(amount));
            if (amount <= 0) return;

            // Détails remises — lire directement remiseTotal si présent
            const remiseTotal = Number(v.remiseTotal) || 0;
            if (remiseTotal > 0.0001) {
              const brut = round2(amount + remiseTotal); // net + remise
              const pct = brut > 0 ? round2((remiseTotal / brut) * 100) : 0;
              remises.push({
                id: d.id,
                at: at || v.date || v.createdAt || new Date(),
                client: v.client || v.nomClient || v.name || "-",
                brut,
                remise: round2(remiseTotal),
                net: round2(amount),
                pct,
              });
            }

            totalCashStock12 += amount;
            count += 1;
            if (!lastDate || toDateObj(at) > lastDate) lastDate = toDateObj(at);
          });

          const arr = [];
          if (totalCashStock12 > 0) {
            arr.push({
              at: lastDate || new Date(),
              amount: round2(totalCashStock12),
              direction: "in",
              mode: "especes",
              source: "ventesAgg",
              cause: `Ventes (espèces) — stock1+stock2 (${count})`,
              refId: `agg-${todayId()}`,
            });
          }
          setVentesRemises(remises.sort((a, b) => (toDateObj(b.at)?.getTime() || 0) - (toDateObj(a.at)?.getTime() || 0)));
          setOps((prev) => mergeAndDedupe(prev, arr, "ventesAgg"));
          setLoading(false);
        },
        () => {
          setOps((prev) => removeSource(prev, "ventesAgg"));
          setVentesRemises([]);
        }
      )
    );

    // 2) PAIEMENTS (ignorer tout ce qui est lié à une vente)
    unsubs.push(
      onSnapshot(
        query(collection(db, "societe", societeId, "paiements"), orderBy("date", "desc")),
        (snap) => {
          const arr = [];
          snap.forEach((d) => {
            const p = d.data() || {};
            const at = getBestDate(p);
            if (!sameLocalDay(at)) return;

            const mode = p.mode ?? p.paymentMode ?? p.moyen ?? p.typePaiement ?? p.modePaiement;
            if (!isCash(mode)) return;

            const t = norm(p.type);
            const op = norm(p.operation || p.sens || "");
            const amount = round2(Math.abs(toNum(p.montant)));

            if (linksToSale(p)) return;
            const isVentePayment = t.includes("vente") || t === "vente" || t === "ventes";
            const isRefund = op.includes("rembourse");
            if (isVentePayment && !isRefund) return;

            let direction = "in";
            let cause = "Règlement client (espèces)";

            if (t.includes("achat")) {
              direction = "out"; cause = "Achat (espèces)";
            } else if (t.includes("fournisseur")) {
              direction = "out"; cause = "Règlement fournisseur (espèces)";
            } else if (t.includes("charge")) {
              direction = "out"; cause = "Charge (espèces)";
            }
            if (isRefund) { direction = "out"; cause = "Remboursement client (espèces)"; }

            if (!t && op === "sortie") direction = "out";
            if (!t && op === "entree") direction = "in";

            arr.push({
              at,
              amount,
              direction,
              mode,
              source: "paiements",
              cause,
              refId: d.id,
            });
          });
          setOps((prev) => mergeAndDedupe(prev, arr, "paiements"));
        },
        () => setOps((prev) => removeSource(prev, "paiements"))
      )
    );

    // 3) CHARGES PERSONNELS (sorties espèces)
    unsubs.push(
      onSnapshot(
        query(collection(db, "societe", societeId, "chargesPersonnels"), orderBy("updatedAt", "desc")),
        (snap) => {
          const arr = [];
          snap.forEach((d) => {
            const c = d.data() || {};
            const at = getBestDate(c);
            if (!sameLocalDay(at)) return;

            const mode = c.modePaiement || c.mode || c.moyen;
            const statut = c.statut || c.status;
            if (!isPaidStrict(statut) || !isCash(mode)) return;

            const amount = round2(
              typeof c.total === "number" ? c.total :
              typeof c.montant === "number" ? c.montant : 0
            );
            if (amount <= 0) return;

            arr.push({
              at,
              amount,
              direction: "out",
              mode,
              source: "chargesPersonnels",
              cause: "Charge personnel (espèces)",
              refId: d.id,
            });
          });
          setOps((prev) => mergeAndDedupe(prev, arr, "chargesPersonnels"));
        },
        () => setOps((prev) => removeSource(prev, "chargesPersonnels"))
      )
    );

    // 4) CHARGES DIVERS (sorties espèces)
    unsubs.push(
      onSnapshot(
        query(collection(db, "societe", societeId, "chargesDivers"), orderBy("updatedAt", "desc")),
        (snap) => {
          const arr = [];
          snap.forEach((d) => {
            const c = d.data() || {};
            const at = getBestDate(c);
            if (!sameLocalDay(at)) return;

            const mode = c.modePaiement || c.mode || c.moyen;
            const statut = c.statut || c.status;
            if (!isPaidStrict(statut) || !isCash(mode)) return;

            const amount = round2(toNum(c.montant ?? c.total ?? c.valeur ?? 0));
            if (amount <= 0) return;

            const lib = c.libelle || c.description || c.titre || c.title || "Charge diverse";

            arr.push({
              at,
              amount,
              direction: "out",
              mode,
              source: "chargesDivers",
              cause: `${lib} (espèces)`,
              refId: d.id,
            });
          });
          setOps((prev) => mergeAndDedupe(prev, arr, "chargesDivers"));
        },
        () => setOps((prev) => removeSource(prev, "chargesDivers"))
      )
    );

    return () => unsubs.forEach((u) => u && u());
  }, [societeId]);

  /* ================== Dé-duplication & priorités ================== */

  const priority = { ventesAgg: 5, ventes: 4, chargesPersonnels: 3, chargesDivers: 2, paiements: 1 };

  const mergeAndDedupe = (prev, incoming, source) => {
    const others = prev.filter((o) => o.source !== source);
    const combined = [...others, ...incoming];

    combined.sort((a, b) => {
      const pa = priority[a.source] || 0;
      const pb = priority[b.source] || 0;
      if (pa !== pb) return pb - pa;
      const ta = toDateObj(a.at)?.getTime() || 0;
      const tb = toDateObj(b.at)?.getTime() || 0;
      return tb - ta;
    });

    const kept = [];
    for (const op of combined) {
      const duplicate = kept.find((k) => isNearDuplicate(k, op));
      if (!duplicate) kept.push(op);
    }

    kept.sort((a, b) => (toDateObj(b.at)?.getTime() || 0) - (toDateObj(a.at)?.getTime() || 0));
    return kept;
  };

  const isNearDuplicate = (a, b) => {
    if (a.direction !== b.direction) return false;
    if (Math.abs(toNum(a.amount) - toNum(b.amount)) > 0.01) return false;

    const ta = toDateObj(a.at);
    const tb = toDateObj(b.at);
    if (!ta || !tb) return false;
    if (diffMs(ta, tb) > 180000) return false;

    if (a.source === b.source && a.refId && b.refId && a.refId === b.refId) return true;

    const pa = priority[a.source] || 0;
    const pb = priority[b.source] || 0;
    if (pa === pb) return false;
    return pb < pa;
  };

  const removeSource = (prev, source) => prev.filter((o) => o.source !== source);

  /* ================== Totaux & écart ================== */

  const totals = useMemo(() => {
    const entree = ops.filter((o) => o.direction === "in").reduce((s, o) => s + toNum(o.amount), 0);
    const sortie  = ops.filter((o) => o.direction === "out").reduce((s, o) => s + toNum(o.amount), 0);
    return { in: round2(entree), out: round2(sortie), solde: round2(entree - sortie) };
  }, [ops]);

  const ecart = useMemo(() => round2(physical - totals.solde), [physical, totals.solde]);

  /* ================= Draft auto-save for current day ================= */

  // Draft totals, ops summary when ops/totals change (if not validated)
  useEffect(() => {
    if (!closureDocRef || closure?.status === "validated" || loading || busy || ops.length === 0) return;

    setDoc(closureDocRef, {
      dateId: todayId(),
      totals,
      count: ops.length,
      causes: summarizeCauses(ops),
      sample: ops.slice(0, 50).map((o) => ({
        at: toDateObj(o.at)?.getTime() || null,
        direction: o.direction,
        amount: toNum(o.amount),
        cause: o.cause,
        source: o.source,
        refId: o.refId,
      })),
      updatedAt: new Date(),
    }, { merge: true }).catch((e) => console.error("[draft totals] ", e));
  }, [ops, totals, closureDocRef, loading, busy, closure?.status]);

  // Draft physicalCash when changed (if not validated)
  useEffect(() => {
    if (!closureDocRef || closure?.status === "validated" || busy || !physicalCash) return;

    updateDoc(closureDocRef, {
      physicalCash: physical,
      updatedAt: new Date(),
    }).catch((e) => console.error("[draft physical] ", e));
  }, [physical, closureDocRef, busy, closure?.status, physicalCash]);

  /* ================= Actions: Valider / Annuler ================= */

  const validated = closure?.status === "validated";

  const summarizeCauses = (arr) => {
    const map = {};
    arr.forEach((o) => {
      map[o.cause] = (map[o.cause] || 0) + 1;
    });
    return Object.keys(map).map((k) => `${k} ×${map[k]}`);
  };

  const handleValidate = useCallback(async () => {
    if (!closureDocRef) return;
    setBusy(true);
    try {
      const snap = await getDoc(closureDocRef);
      if (snap.exists() && snap.data()?.status === "validated") {
        alert("La clôture du jour est déjà validée.");
        return;
      }
      await setDoc(
        closureDocRef,
        {
          status: "validated",
          dateId: todayId(),
          totals,
          count: ops.length,
          causes: summarizeCauses(ops), // écrit des chaînes (pas d’objets)
          validatedAt: new Date(),
          validatedBy: user?.email || user?.uid || "system",
          physicalCash: physical,
          ecart,
          sample: ops.slice(0, 50).map((o) => ({
            at: toDateObj(o.at)?.getTime() || null,
            direction: o.direction,
            amount: toNum(o.amount),
            cause: o.cause,
            source: o.source,
            refId: o.refId,
          })),
        },
        { merge: true }
      );
      try {
        await addDoc(collection(db, "societe", societeId, "caisseMovementsHistory"), {
          dateId: todayId(),
          at: new Date(),
          action: "validate",
          totals,
          physical,
          ecart,
          by: user?.email || user?.uid || "system",
        });
      } catch {}
      alert("✅ Clôture validée avec succès !");
    } catch (e) {
      console.error("[validate] ", e);
      alert("❌ Erreur lors de la validation.");
    } finally {
      setBusy(false);
    }
  }, [closureDocRef, ops, totals, user, societeId, physical, ecart]);

  const handleCancelValidation = useCallback(async () => {
    if (!closureDocRef) return;
    if (!window.confirm("Êtes-vous sûr de vouloir annuler la validation de la clôture ?")) return;

    setBusy(true);
    try {
      const snap = await getDoc(closureDocRef);
      if (!snap.exists() || snap.data()?.status !== "validated") {
        alert("Aucune validation à annuler pour aujourd'hui.");
        return;
      }
      await updateDoc(closureDocRef, {
        status: "canceled",
        canceledAt: new Date(),
        canceledBy: user?.email || user?.uid || "system",
      });
      try {
        await addDoc(collection(db, "societe", societeId, "caisseMovementsHistory"), {
          dateId: todayId(),
          at: new Date(),
          action: "cancel_validation",
          by: user?.email || user?.uid || "system",
        });
      } catch {}
      alert("✅ Validation annulée avec succès !");
    } catch (e) {
      console.error("[cancel validate] ", e);
      alert("❌ Erreur lors de l'annulation.");
    } finally {
      setBusy(false);
    }
  }, [closureDocRef, societeId, user]);

  /* ======================== UI ======================== */

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>💰 Clôture de Caisse</h1>
        </div>
        <div style={styles.dateBox}>
          <div style={styles.dateLabel}>Date du jour</div>
          <div style={styles.dateValue}>{formatDateLong(new Date())}</div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={styles.tabsContainer}>
        <button
          onClick={() => setActiveTab("today")}
          style={{ ...styles.tab, ...(activeTab === "today" ? styles.tabActive : {}) }}
        >
          <span style={styles.tabIcon}>📊</span>
          Clôture du jour
          {validated && <span style={styles.badge}>✓ Validée</span>}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          style={{ ...styles.tab, ...(activeTab === "history" ? styles.tabActive : {}) }}
        >
          <span style={styles.tabIcon}>📅</span>
          Historique
          {closureHistory.length > 0 && <span style={styles.badgeCount}>{closureHistory.length}</span>}
        </button>
      </div>

      {/* Content */}
      {activeTab === "today" ? (
        <TodayView
          totals={totals}
          physical={physical}
          physicalCash={physicalCash}
          setPhysicalCash={setPhysicalCash}
          ecart={ecart}
          validated={validated}
          busy={busy}
          handleValidate={handleValidate}
          handleCancelValidation={handleCancelValidation}
          ops={ops}
          loading={loading}
          ventesRemises={ventesRemises}
          expandRemises={expandRemises}
          setExpandRemises={setExpandRemises}
        />
      ) : (
        <HistoryView
          closureHistory={closureHistory}
          expandedDay={expandedDay}
          setExpandedDay={setExpandedDay}
        />
      )}
    </div>
  );
}

/* ================= Today View Component ================= */

function TodayView({
  totals,
  physical,
  physicalCash,
  setPhysicalCash,
  ecart,
  validated,
  busy,
  handleValidate,
  handleCancelValidation,
  ops,
  loading,
  ventesRemises,
  expandRemises,
  setExpandRemises,
}) {
  return (
    <div style={styles.content}>
      {validated && (
        <div style={styles.validatedBanner}>
          <div style={styles.validatedIcon}>✅</div>
          <div>
            <div style={styles.validatedTitle}>Clôture validée</div>
            <div style={styles.validatedText}>
              Cette clôture a été validée. Vous pouvez l'annuler si nécessaire.
            </div>
          </div>
        </div>
      )}

      <div style={styles.statsGrid}>
        <StatCard icon="📥" label="Entrées Espèces" value={totals.in} color="#10b981" bgColor="#d1fae5" />
        <StatCard icon="📤" label="Sorties Espèces" value={totals.out} color="#ef4444" bgColor="#fee2e2" />
        <StatCard icon="💵" label="Solde Attendu" value={totals.solde} color="#3b82f6" bgColor="#dbeafe" highlighted />
        <StatCard icon="🔍" label="Nombre d'opérations" value={ops.length} isCount color="#8b5cf6" bgColor="#ede9fe" />
      </div>

      <div style={styles.cashSection}>
        <div style={styles.cashCard}>
          <div style={styles.cashHeader}>
            <span style={styles.cashIcon}>💰</span>
            <span style={styles.cashTitle}>Caisse Physique Comptée</span>
          </div>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={physicalCash}
            onChange={(e) => setPhysicalCash(e.target.value)}
            placeholder="Ex: 1520.00"
            style={styles.cashInput}
            disabled={validated}
          />
          <div style={styles.cashHint}>Entrez le montant compté dans la caisse</div>
        </div>

        <div style={styles.ecartCard(ecart)}>
          <div style={styles.ecartHeader}>
            <span style={styles.ecartIcon}>{ecart === 0 ? "✅" : ecart > 0 ? "📈" : "📉"}</span>
            <span style={styles.ecartTitle}>Écart</span>
          </div>
          <div style={styles.ecartValue(ecart)}>
            {ecart >= 0 ? "+" : ""}
            {ecart.toFixed(2)} DHS
          </div>
          <div style={styles.ecartLabel}>
            {ecart === 0 ? "Parfait ! Aucun écart" : ecart > 0 ? "Excédent dans la caisse" : "Manque dans la caisse"}
          </div>
          <div style={styles.ecartFormula}>
            Physique ({physical.toFixed(2)}) - Attendu ({totals.solde.toFixed(2)})
          </div>
        </div>
      </div>

      <div style={styles.actionsRow}>
        <button onClick={handleValidate} disabled={busy || validated} style={styles.btnValidate(busy || validated)}>
          <span style={styles.btnIcon}>✅</span>
          {busy ? "Validation en cours..." : "Valider la clôture du jour"}
        </button>

        {validated && (
          <button
            onClick={handleCancelValidation}
            disabled={busy}
            style={styles.btnCancel(busy)}
            title="Annuler la validation de la clôture"
          >
            <span style={styles.btnIcon}>↩️</span>
            {busy ? "Annulation..." : "Annuler la validation"}
          </button>
        )}
      </div>

      <div style={styles.tableCard}>
        <div style={styles.tableHeader}>
          <div>
            <div style={styles.tableTitle}>📋 Détail des opérations du jour</div>
            <div style={styles.tableSubtitle}>
              {ops.length} opération{ops.length !== 1 ? "s" : ""} en espèces
            </div>
          </div>
        </div>

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Heure</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Montant</th>
                <th style={styles.th}>Description</th>
                <th style={styles.th}>Source</th>
              </tr>
            </thead>
            <tbody>
              {loading && ops.length === 0 ? (
                <tr>
                  <td colSpan={5} style={styles.emptyCell}>
                    <div style={styles.loadingSpinner}>⏳</div>
                    Chargement des opérations...
                  </td>
                </tr>
              ) : ops.length === 0 ? (
                <tr>
                  <td colSpan={5} style={styles.emptyCell}>
                    <div style={styles.emptyIcon}>📭</div>
                    Aucune opération espèces pour aujourd'hui
                  </td>
                </tr>
              ) : (
                ops.map((o, i) => {
                  const isVentesAgg = o.source === "ventesAgg";
                  const hasRemises = ventesRemises.length > 0;
                  return (
                    <React.Fragment key={`${o.source}:${o.refId}:${i}`}>
                      <tr style={styles.tr(i)}>
                        <td style={styles.td}>{fmtTime(getBestDate(o) || o.at)}</td>
                        <td style={styles.tdType(o.direction)}>
                          <span style={styles.typeIcon}>{o.direction === "in" ? "↗️" : "↙️"}</span>
                          {o.direction === "in" ? "Entrée" : "Sortie"}
                        </td>
                        <td style={styles.tdAmount(o.direction)}>
                          {o.direction === "out" ? "-" : "+"}
                          {toNum(o.amount).toFixed(2)} DHS
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {isVentesAgg && hasRemises && (
                              <button
                                type="button"
                                onClick={() => setExpandRemises((v) => !v)}
                                title="Afficher les ventes avec remises"
                                style={styles.detailsBtn(expandRemises)}
                              >
                                {expandRemises ? "▼ Détails remises" : "▶ Détails remises"}
                              </button>
                            )}
                            <span>{o.cause}</span>
                            {isVentesAgg && hasRemises && (
                              <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
                                — {ventesRemises.length} vente(s) avec remise
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={styles.tdSource}>
                          <span style={styles.sourceTag}>{formatSource(o.source)}</span>
                        </td>
                      </tr>

                      {isVentesAgg && expandRemises && hasRemises && (
                        <tr>
                          <td colSpan={5} style={{ background: "#f8fafc", padding: 0 }}>
                            <div style={{ padding: 12 }}>
                              <div style={{ overflowX: "auto" }}>
                                <table
                                  style={{
                                    width: "100%",
                                    borderCollapse: "separate",
                                    borderSpacing: 0,
                                    minWidth: 700,
                                    background: "white",
                                    borderWidth: 1,
                                    borderStyle: "solid",
                                    borderColor: "#e5e7eb",
                                    borderRadius: 10,
                                    overflow: "hidden",
                                  }}
                                >
                                  <thead>
                                    <tr style={{ background: "#f3f4f6" }}>
                                      <th style={subTh}>Heure</th>
                                      <th style={subTh}>Client</th>
                                      <th style={subTh}>Brut</th>
                                      <th style={subTh}>Remise</th>
                                      <th style={subTh}>Net</th>
                                      <th style={subTh}>% Remise</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ventesRemises.map((r, idx) => (
                                      <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 ? "#ffffff" : "#fafafa" }}>
                                        <td style={subTd}>{fmtTime(r.at)}</td>
                                        <td style={{ ...subTd, fontWeight: 600 }}>{String(r.client || "-")}</td>
                                        <td style={subTdRight}>{r.brut.toFixed(2)} DHS</td>
                                        <td style={{ ...subTdRight, color: "#b91c1c", fontWeight: 700 }}>- {r.remise.toFixed(2)} DHS</td>
                                        <td style={{ ...subTdRight, color: "#065f46", fontWeight: 700 }}>{r.net.toFixed(2)} DHS</td>
                                        <td style={subTdRight}>{r.pct.toFixed(2)}%</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    {(() => {
                                      const tBrut = ventesRemises.reduce((s, r) => s + r.brut, 0);
                                      const tRem  = ventesRemises.reduce((s, r) => s + r.remise, 0);
                                      const tNet  = ventesRemises.reduce((s, r) => s + r.net, 0);
                                      const pct   = tBrut > 0 ? (tRem / tBrut) * 100 : 0;
                                      return (
                                        <tr style={{ background: "#f9fafb", fontWeight: 800 }}>
                                          <td style={subTf} colSpan={2}>TOTAL</td>
                                          <td style={subTfRight}>{tBrut.toFixed(2)} DHS</td>
                                          <td style={{ ...subTfRight, color: "#b91c1c" }}>- {tRem.toFixed(2)} DHS</td>
                                          <td style={{ ...subTfRight, color: "#065f46" }}>{tNet.toFixed(2)} DHS</td>
                                          <td style={subTfRight}>{pct.toFixed(2)}%</td>
                                        </tr>
                                      );
                                    })()}
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {ops.length > 0 && (
              <tfoot>
                <tr>
                  <td style={styles.tfoot} colSpan={2}>
                    <strong>Total Solde Attendu</strong>
                  </td>
                  <td style={styles.tfootAmount}>
                    <strong>
                      {totals.solde >= 0 ? "+" : ""}
                      {totals.solde.toFixed(2)} DHS
                    </strong>
                  </td>
                  <td style={styles.tfoot} colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================= History View Component ================= */

function HistoryView({ closureHistory, expandedDay, setExpandedDay }) {
  if (closureHistory.length === 0) {
    return (
      <div style={styles.content}>
        <div style={styles.emptyHistory}>
          <div style={styles.emptyHistoryIcon}>📅</div>
          <div style={styles.emptyHistoryTitle}>Aucun historique</div>
          <div style={styles.emptyHistoryText}>
            Les clôtures validées apparaîtront ici
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.content}>
      <div style={styles.historyHeader}>
        <h3 style={styles.historyTitle}>📜 Historique des clôtures</h3>
        <div style={styles.historyCount}>{closureHistory.length} jour(s)</div>
      </div>

      <div style={styles.historyList}>
        {closureHistory.map((day) => (
          <HistoryCard
            key={day.id}
            day={day}
            expanded={expandedDay === day.id}
            onToggle={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ================= History Card Component ================= */

function HistoryCard({ day, expanded, onToggle }) {
  const isValidated = day.status === "validated";
  const isCanceled = day.status === "canceled";

  const causesSafe = normalizeCauses(day.causes || []); // 🛡️ affichage sûr

  return (
    <div style={styles.historyCard}>
      <div style={styles.historyCardHeader} onClick={onToggle}>
        <div style={styles.historyCardLeft}>
          <div style={styles.historyCardDate}>
            <span style={styles.historyCardIcon}>📅</span>
            {formatDateLong(parseDate(day.dateId || day.id))}
          </div>
          <div style={styles.historyCardStatus(isValidated, isCanceled)}>
            {isValidated ? "✅ Validée" : isCanceled ? "❌ Annulée" : "⏳ En attente"}
          </div>
        </div>
        <div style={styles.historyCardRight}>
          <div style={styles.historyCardSolde}>
            {day.totals?.solde?.toFixed?.(2) || "0.00"} DHS
          </div>
          <button
            type="button"
            data-role="history-toggle"
            style={styles.expandBtn(expanded)}
            title={expanded ? "Réduire" : "Afficher le détail"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={styles.historyCardBody}>
          <div style={styles.historyStatsGrid}>
            <div style={styles.historyStat}>
              <div style={styles.historyStatLabel}>Entrées</div>
              <div style={styles.historyStatValue("#10b981")}>
                +{day.totals?.in?.toFixed?.(2) || "0.00"} DHS
              </div>
            </div>
            <div style={styles.historyStat}>
              <div style={styles.historyStatLabel}>Sorties</div>
              <div style={styles.historyStatValue("#ef4444")}>
                -{day.totals?.out?.toFixed?.(2) || "0.00"} DHS
              </div>
            </div>
            <div style={styles.historyStat}>
              <div style={styles.historyStatLabel}>Caisse physique</div>
              <div style={styles.historyStatValue("#3b82f6")}>
                {day.physicalCash?.toFixed?.(2) || "0.00"} DHS
              </div>
            </div>
            <div style={styles.historyStat}>
              <div style={styles.historyStatLabel}>Écart</div>
              <div
                style={styles.historyStatValue(
                  day.ecart === 0 ? "#10b981" : day.ecart > 0 ? "#3b82f6" : "#ef4444"
                )}
              >
                {day.ecart >= 0 ? "+" : ""}
                {day.ecart?.toFixed?.(2) || "0.00"} DHS
              </div>
            </div>
          </div>

          {causesSafe.length > 0 && (
            <div style={styles.causesSection}>
              <div style={styles.causesSectionTitle}>💡 Résumé des opérations</div>
              <div style={styles.causesList}>
                {causesSafe.slice(0, 5).map((c, i) => (
                  <div key={i} style={styles.causePill}>{c}</div>
                ))}
              </div>
            </div>
          )}

          {day.validatedBy && (
            <div style={{ ...styles.historyFooter, marginTop: 8 }}>
              <div style={styles.historyFooterItem}>
                👤 Validée par: <strong>{day.validatedBy}</strong>
              </div>
              <div style={styles.historyFooterItem}>
                🕐 Le: <strong>{formatDateTime(toDateObj(day.validatedAt))}</strong>
              </div>
              <div style={styles.historyFooterItem}>
                📊 Opérations: <strong>{day.count || 0}</strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================== Styles ================== */

const styles = {
  container: { padding: 20 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { margin: 0, fontWeight: 900, fontSize: 26, color: "#111827" },
  dateBox: { background: "#f9fafb", padding: "8px 12px", borderRadius: 10, borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb" },
  dateLabel: { fontSize: 12, color: "#6b7280" },
  dateValue: { fontWeight: 800, color: "#111827" },

  tabsContainer: { display: "flex", gap: 8, marginBottom: 16 },
  tab: { padding: "8px 12px", borderRadius: 10, borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", cursor: "pointer", fontWeight: 700 },
  tabActive: { background: "#111827", color: "#fff", borderColor: "#111827" },
  tabIcon: { marginRight: 6 },
  badge: { marginLeft: 8, background: "#10b981", color: "#fff", borderRadius: 8, padding: "1px 8px", fontSize: 12, fontWeight: 800 },
  badgeCount: { marginLeft: 8, background: "#3b82f6", color: "#fff", borderRadius: 8, padding: "1px 8px", fontSize: 12, fontWeight: 800 },

  content: {},
  validatedBanner: { display: "flex", gap: 10, alignItems: "center", borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", background: "#f0fdf4", padding: 12, borderRadius: 12, marginBottom: 12 },
  validatedIcon: { fontSize: 22 },
  validatedTitle: { fontWeight: 800, margin: 0 },
  validatedText: { color: "#374151", marginTop: 2 },

  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 },

  cashSection: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  cashCard: { borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", borderRadius: 12, padding: 12, background: "#fff" },
  cashHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  cashIcon: { fontSize: 20 },
  cashTitle: { fontWeight: 800 },
  cashInput: { width: "100%", borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", borderRadius: 10, padding: "10px 12px", fontWeight: 800, fontSize: 16 },
  cashHint: { fontSize: 12, color: "#6b7280", marginTop: 6 },

  ecartCard: (ecart) => ({ borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", borderRadius: 12, padding: 12, background: ecart === 0 ? "#ecfeff" : ecart > 0 ? "#eff6ff" : "#fff7ed" }),
  ecartHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  ecartIcon: { fontSize: 20 },
  ecartTitle: { fontWeight: 800 },
  ecartValue: () => ({ fontWeight: 900, fontSize: 22 }),
  ecartLabel: { fontSize: 12, color: "#6b7280" },
  ecartFormula: { fontSize: 12, color: "#6b7280", marginTop: 2 },

  actionsRow: { display: "flex", gap: 10, marginBottom: 12 },
  btnValidate: (disabled) => ({
    padding: "10px 14px",
    borderRadius: 10,
    borderWidth: 0,
    color: "#fff",
    background: disabled ? "#94a3b8" : "linear-gradient(135deg,#22c55e,#16a34a)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer"
  }),
  btnCancel: (disabled) => ({
    padding: "10px 14px",
    borderRadius: 10,
    borderWidth: 0,
    color: "#fff",
    background: disabled ? "#94a3b8" : "linear-gradient(135deg,#ef4444,#b91c1c)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 4px 12px rgba(185,28,28,0.25)"
  }),
  btnIcon: { marginRight: 8 },

  tableCard: { borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", borderRadius: 12, padding: 12, background: "#fff" },
  tableHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  tableTitle: { fontWeight: 900, margin: 0, fontSize: 16, color: "#111827" },
  tableSubtitle: { fontSize: 12, color: "#6b7280", marginTop: 2 },

  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 720 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", fontWeight: 800, fontSize: 12, color: "#64748b", background: "#f8fafc" },
  tr: (i) => ({ borderBottom: "1px solid #f1f5f9", background: i % 2 ? "white" : "rgba(248,250,252,0.5)" }),
  td: { padding: "10px 12px", fontSize: 14, color: "#111827" },
  tdType: (dir) => ({ padding: "10px 12px", fontWeight: 800, color: dir === "in" ? "#065f46" : "#991b1b" }),
  typeIcon: { marginRight: 8 },
  tdAmount: (dir) => ({ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: dir === "in" ? "#065f46" : "#991b1b" }),
  tdSource: { padding: "10px 12px" },
  sourceTag: { borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", background: "#f9fafb", padding: "2px 8px", borderRadius: 999, fontSize: 12, color: "#374151", fontWeight: 800 },

  detailsBtn: (active) => ({
    borderWidth: 0,
    background: active ? "#f59e0b" : "#fde68a",
    color: "#111827",
    fontWeight: 900,
    borderRadius: 10,
    padding: "6px 10px",
    cursor: "pointer",
    boxShadow: active ? "0 2px 8px rgba(245,158,11,0.35)" : "none",
    transition: "transform 0.05s ease-in-out",
  }),

  emptyCell: { padding: 20, textAlign: "center", color: "#6b7280" },
  emptyIcon: { fontSize: 28, marginBottom: 6 },
  loadingSpinner: { animation: "spin 1s linear infinite" },

  tfoot: { padding: "10px 12px", color: "#6b7280", fontWeight: 700, borderTop: "2px solid #e5e7eb", background: "#fafafa" },
  tfootAmount: { padding: "10px 12px", textAlign: "right", color: "#111827", borderTop: "2px solid #e5e7eb", background: "#fafafa" },

  /* History minimal */
  historyHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  historyTitle: { margin: 0, fontWeight: 900 },
  historyCount: { background: "#eef2ff", color: "#4338ca", borderRadius: 999, padding: "2px 10px", fontWeight: 800 },
  historyList: { display: "grid", gap: 10 },
  historyCard: { borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", borderRadius: 12, background: "#fff" },
  historyCardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, cursor: "pointer" },
  historyCardLeft: { display: "flex", alignItems: "center", gap: 10 },
  historyCardDate: { fontWeight: 800, color: "#111827" },
  historyCardIcon: { marginRight: 6 },
  historyCardStatus: (ok, ko) => ({ fontWeight: 900, color: ok ? "#065f46" : ko ? "#991b1b" : "#1f2937" }),
  historyCardRight: { display: "flex", alignItems: "center", gap: 10 },
  historyCardSolde: { fontWeight: 900 },

  expandBtn: (active) => ({
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: active ? "#4f46e5" : "#a5b4fc",
    padding: "4px 12px",
    borderRadius: 12,
    fontWeight: 900,
    background: active ? "#4f46e5" : "#a5b4fc",
    color: "#ffffff",
    cursor: "pointer",
    boxShadow: active
      ? "0 2px 10px rgba(79,70,229,0.35)"
      : "0 1px 4px rgba(99,102,241,0.25)",
    outline: "none",
    appearance: "none",
    lineHeight: 1.1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
    transition: "transform .05s ease, box-shadow .15s ease",
  }),

  historyCardBody: { padding: 12, borderTop: "1px solid #e5e7eb" },
  historyStatsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 },
  historyStat: { borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", borderRadius: 10, padding: 10, background: "#f9fafb" },
  historyStatLabel: { fontSize: 12, color: "#6b7280" },
  historyStatValue: (c) => ({ fontWeight: 900, color: c }),
  historyFooter: { display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 },
  historyFooterItem: { fontSize: 14, color: "#374151" },
  causesSection: { marginTop: 12 },
  causesSectionTitle: { fontWeight: 900, marginBottom: 8 },
  causesList: { display: "flex", flexWrap: "wrap", gap: 8 },
  causePill: { background: "#eff6ff", color: "#1d4ed8", borderWidth: 1, borderStyle: "solid", borderColor: "#bfdbfe", borderRadius: 999, padding: "2px 8px", fontWeight: 800, fontSize: 12 },
};

/* Sous-table remises: mini styles */
const subTh = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", fontWeight: 800, fontSize: 12, color: "#64748b" };
const subTd = { padding: "8px 10px", fontSize: 13, color: "#111827" };
const subTdRight = { ...subTd, textAlign: "right", fontWeight: 800 };
const subTf = { padding: "10px 10px", borderTop: "2px solid #e5e7eb", color: "#111827" };
const subTfRight = { ...subTf, textAlign: "right" };

/* ================== Helpers UI ================== */

function StatCard({ icon, label, value, color, bgColor, highlighted, isCount }) {
  return (
    <div style={{ borderWidth: 1, borderStyle: "solid", borderColor: "#e5e7eb", borderRadius: 12, padding: 12, background: bgColor }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontWeight: 800, color: "#111827" }}>{label}</span>
      </div>
      <div
        style={{
          fontWeight: 900,
          color: highlighted ? "#111827" : color,
          fontSize: isCount ? 18 : 20,
        }}
      >
        {isCount ? value : `${Number(value || 0).toFixed(2)} DHS`}
      </div>
    </div>
  );
}

function fmtTime(d) {
  const dt = toDateObj(d) || new Date();
  const h = String(dt.getHours()).padStart(2, "0");
  const m = String(dt.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDateLong(d) {
  try {
    const dt = toDateObj(d) || new Date();
    return dt.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "-";
  }
}
function formatDateTime(d) {
  const dt = toDateObj(d);
  if (!dt) return "-";
  return `${dt.toLocaleDateString("fr-FR")} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
}
function formatSource(s) {
  if (s === "ventesAgg") return "Ventes (agrégées)";
  if (s === "paiements") return "Paiements";
  if (s === "chargesPersonnels") return "Charges Pers.";
  if (s === "chargesDivers") return "Charges Divers";
  return String(s || "-");
}
function parseDate(id) {
  try {
    const [y, m, d] = String(id || "").split("-").map((x) => Number(x));
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  } catch { return new Date(); }
}
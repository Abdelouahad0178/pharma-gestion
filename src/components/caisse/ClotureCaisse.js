// src/components/caisse/ClotureCaisse.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  setDoc,
  addDoc,
  limit,
  deleteDoc,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";

/* ================= Utils ================= */

const toNum = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
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

const isCash = (mode) => {
  const m = norm(mode);
  return ["cash", "espece", "especes", "esp", "liquide", "liquides"].includes(m);
};
const isPaidStrict = (statut) => {
  const s = norm(statut);
  return s === "paye" || s === "payé" || s === "paid" || s === "regle" || s === "réglé";
};
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
    "stock1","stock 1","s1","stk1","magasin1","store1","rayon1","front1",
    "stock2","stock 2","s2","stk2","magasin2","store2","rayon2","front2"
  ]);
  const bad = new Set(["stock0","stk0","reserve","magasin0","wh","warehouse","back","arriere","arrière"]);
  if (candidates.some((c) => bad.has(c))) return false;
  if (candidates.some((c) => ok.has(c))) return true;
  return false;
};
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

const saleIdFrom = (obj) => {
  const keys = [
    "venteId","saleId","idVente","refVente","linkedSaleId","venteRef","venteID","vente_id","sale_id"
  ];
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  try {
    const meta = obj?.meta || obj?.metadata || obj?.extra || {};
    for (const k of keys) {
      const v = meta?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  } catch {}
  return null;
};

function prettyCause(c) {
  if (typeof c === "string") return c;
  if (c && typeof c === "object") {
    const cause = String(c.cause || c.type || "Opération");
    const dir = c.direction ? ` ${c.direction === "in" ? "↗️" : "↙️"}` : "";
    const amt = Number.isFinite(c.amount) ? ` ${toNum(c.amount).toFixed(2)} DHS` : "";
    return `${cause}${dir}${amt}`.trim();
  }
  try { return JSON.stringify(c); } catch { return String(c); }
}
function normalizeCauses(causes) {
  if (!Array.isArray(causes)) return [];
  return causes.map(prettyCause);
}

/* =========================================================
   Clôture de caisse — compatible avec tes règles Firestore
========================================================= */

export default function ClotureCaisse() {
  const { societeId, user } = useUserRole();

  /* ===== Thème sombre/clair ===== */
  const systemPrefersDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "dark") return true;
      if (saved === "light") return false;
      return systemPrefersDark;
    } catch {
      return systemPrefersDark;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", isDark);
    } catch {}
  }, [isDark]);

  const styles = useMemo(() => getStyles(isDark), [isDark]);

  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);

  // ===== Brouillon local (dans closuresDrafts)
  const [physicalCashInput, setPhysicalCashInput] = useState("");
  const physical = toNum(physicalCashInput);

  const [closure, setClosure] = useState(null);
  const [closureHistory, setClosureHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("today");
  const [expandedDay, setExpandedDay] = useState(null);

  // 🔎 Filtres de date pour l’historique
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  // Détails remises (agrégé)
  const [ventesRemises, setVentesRemises] = useState([]);
  const [expandRemises, setExpandRemises] = useState(false);

  // IDs des ventes déjà comptées aujourd’hui (espèces directes)
  const countedSaleIdsRef = useRef(new Set());
  // Cache des ventes lues
  const saleCacheRef = useRef(new Map()); // saleId -> saleData/null

  const closureDocRef = useMemo(() => {
    if (!societeId) return null;
    return doc(db, "societe", societeId, "closures", todayId());
  }, [societeId]);

  const draftDocRef = useMemo(() => {
    if (!societeId) return null;
    return doc(db, "societe", societeId, "closuresDrafts", todayId());
  }, [societeId]);

  /* ====== Helpers remises (fusion/déduplication) ====== */
  const upsertRemises = useCallback((prev, incoming) => {
    const map = new Map();
    for (const r of prev) map.set(r.id, r);
    for (const r of incoming) {
      const existing = map.get(r.id);
      if (!existing) {
        map.set(r.id, r);
      } else {
        const ta = toDateObj(existing.at)?.getTime() || 0;
        const tb = toDateObj(r.at)?.getTime() || 0;
        if (tb >= ta) map.set(r.id, r);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (toDateObj(b.at)?.getTime() || 0) - (toDateObj(a.at)?.getTime() || 0)
    );
  }, []);

  // ===== État "closure" du jour (si validée)
  useEffect(() => {
    if (!closureDocRef) return;
    return onSnapshot(closureDocRef, (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setClosure(data);
        if (typeof data.physicalCash === "number") setPhysicalCashInput(String(data.physicalCash));
      } else {
        setClosure(null);
      }
    });
  }, [closureDocRef]);

  // ===== Historique des clôtures (30 jours)
  useEffect(() => {
    if (!societeId) return;
    return onSnapshot(
      query(collection(db, "societe", societeId, "closures"), orderBy("dateId", "desc"), limit(30)),
      (snap) => {
        const history = [];
        snap.forEach((d) => {
          if (d.id !== todayId()) {
            const raw = d.data() || {};
            const normed = { id: d.id, ...raw, causes: normalizeCauses(raw.causes || []) };
            history.push(normed);
          }
        });
        setClosureHistory(history);
      }
    );
  }, [societeId]);

  // ===== Brouillon du jour (closuresDrafts)
  useEffect(() => {
    if (!draftDocRef) return;
    return onSnapshot(draftDocRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data() || {};
        if (typeof d.physicalCash === "number" && !closure) {
          setPhysicalCashInput(String(d.physicalCash));
        }
      }
    });
  }, [draftDocRef, closure]);

  // ===== Écoutes collections
  useEffect(() => {
    if (!societeId) return;
    setLoading(true);
    const unsubs = [];

    /* 1) VENTES (espèces directes, S1+S2) + remises */
    unsubs.push(
      onSnapshot(
        query(collection(db, "societe", societeId, "ventes"), orderBy("date", "desc")),
        (snap) => {
          let totalCashStock12 = 0;
          let lastDate = null;
          let count = 0;
          const remisesDirectes = [];
          const countedIds = new Set();

          snap.forEach((d) => {
            const v = d.data() || {};
            const at = getBestDate(v);
            if (!sameLocalDay(at)) return;
            if (!comesFromStock1or2(v)) return;
            if (isReturnOrNegativeSale(v)) return;

            const statut = v.statutPaiement || v.statut;
            const mode = v.modePaiement || v.mode || v.moyen;
            if (!isPaidStrict(statut) || !isCash(mode)) return;

            let amount = 0;
            if (typeof v.montantTotal === "number") amount = v.montantTotal;
            else if (typeof v.totalTTC === "number") amount = v.totalTTC;
            else if (typeof v.total === "number") amount = v.total;
            else if (v.montant) amount = toNum(v.montant);
            else if (Array.isArray(v.articles) && v.articles.length > 0) {
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

            const remiseTotal = Number(v.remiseTotal) || 0;
            if (remiseTotal > 0.0001) {
              const brut = round2(amount + remiseTotal);
              const pct = brut > 0 ? round2((remiseTotal / brut) * 100) : 0;
              remisesDirectes.push({
                id: d.id,
                type: "Vente directe",
                at: at || v.date || v.createdAt || new Date(),
                client: v.client || v.nomClient || v.name || "-",
                brut,
                remise: round2(remiseTotal),
                net: round2(amount),
                pct,
              });
            }

            countedIds.add(d.id);
            totalCashStock12 += amount;
            count += 1;
            if (!lastDate || toDateObj(at) > lastDate) lastDate = toDateObj(at);
          });

          countedSaleIdsRef.current = countedIds;

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

          setVentesRemises(
            remisesDirectes.sort(
              (a, b) => (toDateObj(b.at)?.getTime() || 0) - (toDateObj(a.at)?.getTime() || 0)
            )
          );
          setOps((prev) => mergeAndDedupe(prev, arr, "ventesAgg"));
          setLoading(false);
        },
        () => {
          setOps((prev) => removeSource(prev, "ventesAgg"));
          setVentesRemises([]);
          countedSaleIdsRef.current = new Set();
        }
      )
    );

    /* 2) PAIEMENTS */
    unsubs.push(
      onSnapshot(
        query(collection(db, "societe", societeId, "paiements"), orderBy("date", "desc")),
        async (snap) => {
          const arr = [];
          const creditRemises = [];
          const fetches = [];

          snap.forEach((d) => {
            const p = d.data() || {};
            const at = getBestDate(p);
            if (!sameLocalDay(at)) return;

            const mode = p.mode ?? p.paymentMode ?? p.moyen ?? p.typePaiement ?? p.modePaiement;
            if (!isCash(mode)) return;

            const t = norm(p.type);
            const op = norm(p.operation || p.sens || "");
            const statut = p.statut || p.status;
            const amount = round2(Math.abs(toNum(p.montant ?? p.total ?? 0)));
            if (amount <= 0) return;

            const saleId = saleIdFrom(p);

            // Crédit réglé aujourd'hui en espèces
            if (saleId && isPaidStrict(statut) && isCash(mode)) {
              if (!countedSaleIdsRef.current.has(saleId)) {
                arr.push({
                  at,
                  amount,
                  direction: "in",
                  mode,
                  source: "paiements",
                  cause: "Règlement de crédit (espèces)",
                  refId: d.id,
                });

                const cached = saleCacheRef.current.get(saleId);
                if (cached !== undefined) {
                  if (cached) {
                    const r = buildRemiseRowFromSale(cached, at, saleId);
                    if (r) creditRemises.push(r);
                  }
                } else {
                  fetches.push(
                    getDoc(doc(db, "societe", societeId, "ventes", saleId))
                      .then((snapSale) => {
                        const data = snapSale.exists() ? { id: snapSale.id, ...snapSale.data() } : null;
                        saleCacheRef.current.set(saleId, data);
                        if (data) {
                          const r = buildRemiseRowFromSale(data, at, saleId);
                          if (r) creditRemises.push(r);
                        }
                      })
                      .catch(() => saleCacheRef.current.set(saleId, null))
                  );
                }
              }
              return;
            }

            // Paiements isolés
            const isVentePayment = t.includes("vente") || t === "vente" || t === "ventes";
            const isRefund = op.includes("rembourse");
            if (isVentePayment && !isRefund) return;

            let direction = "in";
            let cause = "Règlement client (espèces)";
            if (t.includes("achat")) { direction = "out"; cause = "Achat (espèces)"; }
            else if (t.includes("fournisseur")) { direction = "out"; cause = "Règlement fournisseur (espèces)"; }
            else if (t.includes("charge")) { direction = "out"; cause = "Charge (espèces)"; }
            if (isRefund) { direction = "out"; cause = "Remboursement client (espèces)"; }
            if (!t && op === "sortie") direction = "out";
            if (!t && op === "entree") direction = "in";

            arr.push({ at, amount, direction, mode, source: "paiements", cause, refId: d.id });
          });

          if (fetches.length) {
            try { await Promise.all(fetches); } catch {}
          }

          setOps((prev) => mergeAndDedupe(prev, arr, "paiements"));

          if (creditRemises.length) {
            setVentesRemises((prev) => upsertRemises(prev, creditRemises));
          }
        },
        () => setOps((prev) => removeSource(prev, "paiements"))
      )
    );

    /* 3) CHARGES PERSONNELS (sorties espèces) */
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
              at, amount, direction: "out", mode,
              source: "chargesPersonnels", cause: "Charge personnel (espèces)", refId: d.id,
            });
          });
          setOps((prev) => mergeAndDedupe(prev, arr, "chargesPersonnels"));
        },
        () => setOps((prev) => removeSource(prev, "chargesPersonnels"))
      )
    );

  /* 4) CHARGES DIVERS (sorties espèces) */
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
              at, amount, direction: "out", mode,
              source: "chargesDivers", cause: `${lib} (espèces)`, refId: d.id,
            });
          });
          setOps((prev) => mergeAndDedupe(prev, arr, "chargesDivers"));
        },
        () => setOps((prev) => removeSource(prev, "chargesDivers"))
      )
    );

    return () => unsubs.forEach((u) => u && u());
  }, [societeId, upsertRemises]);

  /* ====== Remise à partir d'une vente (pour crédits réglés) ====== */
  function buildRemiseRowFromSale(v, at, saleId) {
    let net = 0;
    if (typeof v.montantTotal === "number") net = v.montantTotal;
    else if (typeof v.totalTTC === "number") net = v.totalTTC;
    else if (typeof v.total === "number") net = v.total;
    else if (v.montant) net = toNum(v.montant);
    else if (Array.isArray(v.articles) && v.articles.length > 0) {
      const subtotal = v.articles.reduce((s, art) => {
        const qty = Number(art?.quantite) || 0;
        const prix = Number(art?.prixUnitaire ?? art?.prix) || 0;
        const remiseLigne = Number(art?.remise) || 0;
        return s + (qty * prix - remiseLigne);
      }, 0);
      net = subtotal;
    }
    net = Math.max(0, toNum(net));

    const remiseTotal = Number(v.remiseTotal) || 0;
    if (remiseTotal <= 0.0001) return null;

    const brut = round2(net + remiseTotal);
    const pct = brut > 0 ? round2((remiseTotal / brut) * 100) : 0;

    return {
      id: `credit-${saleId}`,
      type: "Crédit réglé",
      at: at || v.date || v.createdAt || new Date(),
      client: v.client || v.nomClient || v.name || "-",
      brut,
      remise: round2(remiseTotal),
      net: round2(net),
      pct,
    };
  }

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

  /* ================= Draft auto-save (closuresDrafts) ================= */

  const summarizeCauses = (arr) => {
    const map = {};
    arr.forEach((o) => { map[o.cause] = (map[o.cause] || 0) + 1; });
    return Object.keys(map).map((k) => `${k} ×${map[k]}`);
  };

  useEffect(() => {
    if (!draftDocRef || loading || ops.length === 0) return;
    const payload = {
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
      physicalCash: physical,
      updatedAt: new Date(),
      createdAt: Timestamp.now(), // brouillon: libre
    };
    setDoc(draftDocRef, payload, { merge: true }).catch((e) =>
      console.error("[draft save] ", e)
    );
  }, [ops, totals, physical, draftDocRef, loading]);

  /* ================= Actions: Valider / Annuler ================= */

  const validated = !!closure;

  const handleValidate = useCallback(async () => {
    if (!closureDocRef) return;
    setBusy(true);
    try {
      const snap = await getDoc(closureDocRef);
      if (snap.exists()) {
        alert("La clôture du jour est déjà validée.");
        return;
      }

      const payload = {
        status: "validated",
        dateId: todayId(),
        totals,
        count: ops.length,
        causes: summarizeCauses(ops),
        validatedAt: serverTimestamp(),
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
        createdAt: serverTimestamp(),
      };

      await setDoc(closureDocRef, payload);

      try {
        await addDoc(collection(db, "societe", societeId, "caisseMovementsHistory"), {
          dateId: todayId(),
          at: serverTimestamp(),
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
      if (!snap.exists()) {
        alert("Aucune validation à annuler pour aujourd'hui.");
        return;
      }
      await deleteDoc(closureDocRef);

      try {
        await addDoc(collection(db, "societe", societeId, "caisseMovementsHistory"), {
          dateId: todayId(),
          at: serverTimestamp(),
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

  /* ====== Historique filtré par date ====== */
  const filteredHistory = useMemo(() => {
    if (!historyFrom && !historyTo) return closureHistory;

    return closureHistory.filter((day) => {
      const id = day.dateId || day.id;
      if (!id) return false;
      const dt = parseDate(id);
      const from = historyFrom ? parseDate(historyFrom) : null;
      const to = historyTo ? parseDate(historyTo) : null;
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    });
  }, [closureHistory, historyFrom, historyTo]);

  /* ======================== UI ======================== */

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={styles.title}>💰 Clôture de Caisse</h1>
          <button
            type="button"
            onClick={() => setIsDark((v) => !v)}
            style={styles.themeBtn}
            title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
          >
            <span style={{ marginRight: 8 }}>{isDark ? "🌙" : "☀️"}</span>
            {isDark ? "Sombre" : "Clair"}
          </button>
        </div>
        <div style={styles.dateBox}>
          <div style={styles.dateLabel}></div>
          <div style={styles.dateValue}>{formatDateLong(new Date())}</div>
        </div>
      </div>

      {/* Tabs */}
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
          styles={styles}
          totals={totals}
          physical={physical}
          physicalCashInput={physicalCashInput}
          setPhysicalCashInput={setPhysicalCashInput}
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
          styles={styles}
          closureHistory={filteredHistory}
          expandedDay={expandedDay}
          setExpandedDay={setExpandedDay}
          historyFrom={historyFrom}
          historyTo={historyTo}
          setHistoryFrom={setHistoryFrom}
          setHistoryTo={setHistoryTo}
        />
      )}
    </div>
  );
}

/* ================= Today View Component ================= */

function TodayView({
  styles,
  totals,
  physical,
  physicalCashInput,
  setPhysicalCashInput,
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
  // accepte . et ,
  const handleCashChange = (e) => {
    const raw = e.target.value;
    const cleaned = raw.replace(/[^0-9 ,.\-]/g, "");
    setPhysicalCashInput(cleaned);
  };
  const handleCashKeyDown = (e) => {
    if (e.key === ",") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + "." + el.value.slice(end);
      setPhysicalCashInput(next);
      setTimeout(() => el.setSelectionRange(start + 1, start + 1), 0);
    }
  };

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
        <StatCard styles={styles} icon="📥" label="Entrées Espèces" value={totals.in} color="#10b981" bgColor={styles.bgGreen} />
        <StatCard styles={styles} icon="📤" label="Sorties Espèces" value={totals.out} color="#ef4444" bgColor={styles.bgRed} />
        <StatCard styles={styles} icon="💵" label="Solde Attendu" value={totals.solde} color="#3b82f6" bgColor={styles.bgBlue} highlighted />
        <StatCard styles={styles} icon="🔍" label="Nombre d'opérations" value={ops.length} isCount color="#8b5cf6" bgColor={styles.bgPurple} />
      </div>

      <div style={styles.cashSection}>
        <div style={styles.card}>
          <div style={styles.cashHeader}>
            <span style={styles.cashIcon}>💰</span>
            <span style={styles.cashTitle}>Caisse Physique Comptée</span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            value={physicalCashInput}
            onChange={handleCashChange}
            onKeyDown={handleCashKeyDown}
            placeholder="Ex: 1520,00 ou 1520.00"
            style={styles.cashInput}
            disabled={validated}
          />
        </div>

        <div style={styles.ecartCard(ecart)}>
          <div style={styles.ecartHeader}>
            <span style={styles.ecartIcon}>{ecart === 0 ? "✅" : ecart > 0 ? "📈" : "📉"}</span>
            <span style={styles.ecartTitle}>Écart</span>
          </div>
          <div style={styles.ecartValue(ecart)}>
            {ecart >= 0 ? "+" : ""}{ecart.toFixed(2)} DHS
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
            title="Annuler la validation de la clôture (suppression autorisée le même jour)"
          >
            <span style={styles.btnIcon}>↩️</span>
            {busy ? "Annulation..." : "Annuler la validation"}
          </button>
        )}
      </div>

      <div style={styles.card}>
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
                                title="Afficher les ventes avec remises (ventes directes + crédits réglés)"
                                style={styles.detailsBtn(expandRemises)}
                              >
                                {expandRemises ? "▼ Détails remises" : "▶ Détails remises"}
                              </button>
                            )}
                            <span>{o.cause}</span>
                            {isVentesAgg && hasRemises && (
                              <span style={styles.remiseInfo}>
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
                          <td colSpan={5} style={styles.subTableOuterTd}>
                            <div style={{ padding: 12 }}>
                              <div style={{ overflowX: "auto" }}>
                                <table style={styles.subTable}>
                                  <thead>
                                    <tr style={styles.subTheadTr}>
                                      <th style={styles.subTh}>Heure</th>
                                      <th style={styles.subTh}>Client</th>
                                      <th style={styles.subTh}>Type</th>
                                      <th style={styles.subThRight}>Brut</th>
                                      <th style={styles.subThRight}>Remise</th>
                                      <th style={styles.subThRight}>Net</th>
                                      <th style={styles.subThRight}>% Remise</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ventesRemises.map((r, idx) => (
                                      <tr key={r.id} style={styles.subTr(idx)}>
                                        <td style={styles.subTd}>{fmtTime(r.at)}</td>
                                        <td style={{ ...styles.subTd, fontWeight: 600 }}>{String(r.client || "-")}</td>
                                        <td style={{ ...styles.subTd, fontSize: 12, opacity: 0.85 }}>
                                          {r.type || "Vente directe"}
                                        </td>
                                        <td style={styles.subTdRight}>{r.brut.toFixed(2)} DHS</td>
                                        <td style={{ ...styles.subTdRight, color: styles.negColor, fontWeight: 700 }}>- {r.remise.toFixed(2)} DHS</td>
                                        <td style={{ ...styles.subTdRight, color: styles.posColorDark, fontWeight: 700 }}>{r.net.toFixed(2)} DHS</td>
                                        <td style={styles.subTdRight}>{r.pct.toFixed(2)}%</td>
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
                                        <tr style={styles.subTfootTr}>
                                          <td style={styles.subTf} colSpan={3}>TOTAL</td>
                                          <td style={styles.subTfRight}>{tBrut.toFixed(2)} DHS</td>
                                          <td style={{ ...styles.subTfRight, color: styles.negColor }}>- {tRem.toFixed(2)} DHS</td>
                                          <td style={{ ...styles.subTfRight, color: styles.posColorDark }}>{tNet.toFixed(2)} DHS</td>
                                          <td style={styles.subTfRight}>{pct.toFixed(2)}%</td>
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

function HistoryView({
  styles,
  closureHistory,
  expandedDay,
  setExpandedDay,
  historyFrom,
  historyTo,
  setHistoryFrom,
  setHistoryTo,
}) {
  if (closureHistory.length === 0) {
    return (
      <div style={styles.content}>
        <div style={styles.emptyHistory}>
          <div style={styles.emptyHistoryIcon}>📅</div>
          <div style={styles.emptyHistoryTitle}>Aucun historique</div>
          <div style={styles.emptyHistoryText}>
            Les clôtures validées apparaîtront ici (ou ajustez le filtre de dates)
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

      {/* Filtres de date */}
      <div style={styles.historyFilters}>
        <span style={styles.historyFilterLabel}>Filtrer par date :</span>
        <label style={styles.historyFilterLabel}>
          Du{" "}
          <input
            type="date"
            value={historyFrom}
            onChange={(e) => setHistoryFrom(e.target.value)}
            style={styles.historyFilterInput}
          />
        </label>
        <label style={styles.historyFilterLabel}>
          Au{" "}
          <input
            type="date"
            value={historyTo}
            onChange={(e) => setHistoryTo(e.target.value)}
            style={styles.historyFilterInput}
          />
        </label>
        {(historyFrom || historyTo) && (
          <button
            type="button"
            onClick={() => {
              setHistoryFrom("");
              setHistoryTo("");
            }}
            style={styles.historyFilterReset}
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div style={styles.historyList}>
        {closureHistory.map((day) => (
          <HistoryCard
            key={day.id}
            styles={styles}
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

function HistoryCard({ styles, day, expanded, onToggle }) {
  const isValidated = day.status === "validated";
  const isCanceled = day.status === "canceled"; // (pas utilisé ici, compat)

  const causesSafe = normalizeCauses(day.causes || []);

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
                {day.ecart >= 0 ? "+" : ""}{day.ecart?.toFixed?.(2) || "0.00"} DHS
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

/* ================== Styles (clair/sombre) ================== */

function getStyles(isDark) {
  const base = {
    bg: isDark ? "#0b1220" : "#ffffff",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#e5e7eb" : "#111827",
    textMuted: isDark ? "#9ca3af" : "#374151",
    border: isDark ? "#1f2937" : "#e5e7eb",
    tableHead: isDark ? "#0b1220" : "#f8fafc",
    rowAlt: isDark ? "rgba(15,23,42,0.6)" : "rgba(248,250,252,0.5)",
    pillBg: isDark ? "#111827" : "#f9fafb",
    pillBorder: isDark ? "#1f2937" : "#e5e7eb",
    blue: "#2563eb",
    posColor: "#10b981",
    posColorDark: "#065f46",
    negColor: "#b91c1c",
    bgGreen: isDark ? "rgba(16,185,129,0.15)" : "#d1fae5",
    bgRed: isDark ? "rgba(239,68,68,0.15)" : "#fee2e2",
    bgBlue: isDark ? "rgba(37,99,235,0.15)" : "#dbeafe",
    bgPurple: isDark ? "rgba(139,92,246,0.15)" : "#ede9fe",
    bannerOk: isDark ? "rgba(4,120,87,0.15)" : "#f0fdf4",
    subTableStrip: isDark ? "#0b1220" : "#fafafa",
    subTableHead: isDark ? "#0b1220" : "#f3f4f6",
    subTableBorder: isDark ? "#1f2937" : "#e5e7eb",
  };

  return {
    posColorDark: base.posColorDark,
    negColor: base.negColor,
    bgGreen: base.bgGreen,
    bgRed: base.bgRed,
    bgBlue: base.bgBlue,
    bgPurple: base.bgPurple,

    container: { padding: 20, background: base.bg, color: base.text, minHeight: "100%" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    title: { margin: 0, fontWeight: 900, fontSize: 26, color: base.text },
    themeBtn: {
      border: `1px solid ${base.border}`,
      background: base.card,
      color: base.text,
      padding: "6px 10px",
      borderRadius: 10,
      cursor: "pointer",
      fontWeight: 800,
    },
    dateBox: { background: isDark ? "#0f172a" : "#f9fafb", padding: "8px 12px", borderRadius: 10, border: `1px solid ${base.border}` },
    dateLabel: { fontSize: 12, color: base.textMuted },
    dateValue: { fontWeight: 800, color: base.text },

    tabsContainer: { display: "flex", gap: 8, marginBottom: 16 },
    tab: {
      padding: "8px 12px",
      borderRadius: 10,
      border: `1px solid ${base.border}`,
      cursor: "pointer",
      fontWeight: 700,
      background: base.card,
      color: base.text,
    },
    tabActive: { background: base.text, color: isDark ? "#0b1220" : "#fff", borderColor: base.text },
    tabIcon: { marginRight: 6 },
    badge: { marginLeft: 8, background: base.posColor, color: "#fff", borderRadius: 8, padding: "1px 8px", fontSize: 12, fontWeight: 800 },
    badgeCount: { marginLeft: 8, background: base.blue, color: "#fff", borderRadius: 8, padding: "1px 8px", fontSize: 12, fontWeight: 800 },

    content: {},
    validatedBanner: {
      display: "flex", gap: 10, alignItems: "center",
      border: `1px solid ${base.border}`,
      background: base.bannerOk,
      padding: 12, borderRadius: 12, marginBottom: 12,
      color: base.text
    },
    validatedIcon: { fontSize: 22 },
    validatedTitle: { fontWeight: 800, margin: 0 },
    validatedText: { color: base.textMuted, marginTop: 2 },

    statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 },

    cashSection: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
    card: { border: `1px solid ${base.border}`, borderRadius: 12, padding: 12, background: base.card, color: base.text },

    cashHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
    cashIcon: { fontSize: 20 },
    cashTitle: { fontWeight: 800 },
    cashInput: {
      width: "100%",
      border: `1px solid ${base.border}`,
      background: isDark ? "#0b1220" : "#fff",
      color: base.text,
      borderRadius: 10,
      padding: "10px 12px",
      fontWeight: 800, fontSize: 16,
      outline: "none",
    },

    ecartCard: (ecart) => ({
      border: `1px solid ${base.border}`,
      borderRadius: 12, padding: 12,
      background: ecart === 0 ? (isDark ? "rgba(6,182,212,0.12)" : "#ecfeff") : ecart > 0 ? (isDark ? "rgba(37,99,235,0.12)" : "#eff6ff") : (isDark ? "rgba(245,158,11,0.12)" : "#fff7ed"),
      color: base.text,
    }),
    ecartHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
    ecartIcon: { fontSize: 20 },
    ecartTitle: { fontWeight: 800 },
    ecartValue: () => ({ fontWeight: 900, fontSize: 22 }),
    ecartLabel: { fontSize: 12, color: base.textMuted },
    ecartFormula: { fontSize: 12, color: base.textMuted, marginTop: 2 },

    actionsRow: { display: "flex", gap: 10, marginBottom: 12 },
    btnValidate: (disabled) => ({
      padding: "10px 14px",
      borderRadius: 10,
      borderWidth: 0,
      color: "#fff",
      background: disabled ? (isDark ? "#334155" : "#94a3b8") : "linear-gradient(135deg,#22c55e,#16a34a)",
      fontWeight: 900,
      cursor: disabled ? "not-allowed" : "pointer"
    }),
    btnCancel: (disabled) => ({
      padding: "10px 14px",
      borderRadius: 10,
      borderWidth: 0,
      color: "#fff",
      background: disabled ? (isDark ? "#334155" : "#94a3b8") : "linear-gradient(135deg,#ef4444,#b91c1c)",
      fontWeight: 900,
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled ? "none" : "0 4px 12px rgba(185,28,28,0.25)"
    }),
    btnIcon: { marginRight: 8 },

    tableHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    tableTitle: { fontWeight: 900, margin: 0, fontSize: 16, color: base.text },
    tableSubtitle: { fontSize: 12, color: base.textMuted, marginTop: 2 },

    tableWrapper: { overflowX: "auto" },
    table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 720, color: base.text },
    th: { textAlign: "left", padding: "10px 12px", borderBottom: `2px solid ${base.border}`, fontWeight: 800, fontSize: 12, color: base.textMuted, background: base.tableHead, position: "sticky", top: 0, zIndex: 1 },
    tr: (i) => ({ borderBottom: `1px solid ${base.border}`, background: i % 2 ? base.card : base.rowAlt }),
    td: { padding: "10px 12px", fontSize: 14, color: base.text },
    tdType: (dir) => ({ padding: "10px 12px", fontWeight: 800, color: dir === "in" ? base.posColorDark : base.negColor }),
    typeIcon: { marginRight: 8 },
    tdAmount: (dir) => ({ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: dir === "in" ? base.posColorDark : base.negColor }),
    tdSource: { padding: "10px 12px" },
    sourceTag: { border: `1px solid ${base.pillBorder}`, background: base.pillBg, padding: "2px 8px", borderRadius: 999, fontSize: 12, color: base.text, fontWeight: 800 },

    detailsBtn: (active) => ({
      borderWidth: 0,
      background: active ? (isDark ? "#b45309" : "#f59e0b") : (isDark ? "#7c2d12" : "#fde68a"),
      color: base.text,
      fontWeight: 900,
      borderRadius: 10,
      padding: "6px 10px",
      cursor: "pointer",
      boxShadow: active ? "0 2px 8px rgba(245,158,11,0.35)" : "none",
      transition: "transform 0.05s ease-in-out",
    }),
    remiseInfo: { marginLeft: 8, fontSize: 12, color: base.textMuted },

    emptyCell: { padding: 20, textAlign: "center", color: base.textMuted },
    emptyIcon: { fontSize: 28, marginBottom: 6 },
    loadingSpinner: { animation: "spin 1s linear infinite" },

    tfoot: { padding: "10px 12px", color: base.textMuted, fontWeight: 700, borderTop: `2px solid ${base.border}`, background: isDark ? "#0b1220" : "#fafafa" },
    tfootAmount: { padding: "10px 12px", textAlign: "right", color: base.text, borderTop: `2px solid ${base.border}`, background: isDark ? "#0b1220" : "#fafafa" },

    /* History minimal */
    historyHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    historyTitle: { margin: 0, fontWeight: 900, color: base.text },
    historyCount: { background: isDark ? "#1e3a8a" : "#eef2ff", color: isDark ? "#c7d2fe" : "#4338ca", borderRadius: 999, padding: "2px 10px", fontWeight: 800 },

    historyFilters: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
      marginBottom: 12,
    },
    historyFilterLabel: {
      fontSize: 12,
      color: base.textMuted,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: 4,
    },
    historyFilterInput: {
      borderRadius: 8,
      border: `1px solid ${base.border}`,
      padding: "4px 8px",
      background: isDark ? "#020617" : "#ffffff",
      color: base.text,
      fontSize: 13,
      outline: "none",
    },
    historyFilterReset: {
      borderRadius: 999,
      border: `1px solid ${base.blue}`,
      padding: "4px 10px",
      background: isDark ? "#1d4ed8" : "#2563eb",
      color: "#ffffff",
      fontWeight: 700,
      cursor: "pointer",
      fontSize: 12,
    },

    historyList: { display: "grid", gap: 10 },
    historyCard: { border: `1px solid ${base.border}`, borderRadius: 12, background: base.card, color: base.text },
    historyCardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, cursor: "pointer" },
    historyCardLeft: { display: "flex", alignItems: "center", gap: 10 },
    historyCardDate: { fontWeight: 800, color: base.text },
    historyCardIcon: { marginRight: 6 },
    historyCardStatus: (ok, ko) => ({ fontWeight: 900, color: ok ? base.posColorDark : ko ? base.negColor : base.text }),
    historyCardRight: { display: "flex", alignItems: "center", gap: 10 },
    historyCardSolde: { fontWeight: 900, color: base.text },

    expandBtn: (active) => ({
      border: `1px solid ${active ? base.blue : (isDark ? "#334155" : "#a5b4fc")}`,
      padding: "4px 12px",
      borderRadius: 12,
      fontWeight: 900,
      background: active ? base.blue : (isDark ? "#0b1220" : "#a5b4fc"),
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

    historyCardBody: { padding: 12, borderTop: `1px solid ${base.border}` },
    historyStatsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 },
    historyStat: { border: `1px solid ${base.border}`, borderRadius: 10, padding: 10, background: isDark ? "#0b1220" : "#f9fafb" },
    historyStatLabel: { fontSize: 12, color: base.textMuted },
    historyStatValue: (c) => ({ fontWeight: 900, color: c }),
    historyFooter: { display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, color: base.text },
    historyFooterItem: { fontSize: 14, color: base.textMuted },
    causesSection: { marginTop: 12 },
    causesSectionTitle: { fontWeight: 900, marginBottom: 8, color: base.text },
    causesList: { display: "flex", flexWrap: "wrap", gap: 8 },
    causePill: { background: base.pillBg, color: base.text, border: `1px solid ${base.pillBorder}`, borderRadius: 999, padding: "2px 8px", fontWeight: 800, fontSize: 12 },

    emptyHistory: {
      border: `1px solid ${base.border}`,
      borderRadius: 12,
      padding: 16,
      textAlign: "center",
      background: base.card,
      color: base.text,
    },
    emptyHistoryIcon: { fontSize: 30, marginBottom: 6 },
    emptyHistoryTitle: { fontWeight: 900, marginBottom: 4 },
    emptyHistoryText: { fontSize: 13, color: base.textMuted },

    // Sous-table remises
    subTableOuterTd: { background: isDark ? "#0b1220" : "#f8fafc", padding: 0 },
    subTable: {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      minWidth: 780,
      background: base.card,
      color: base.text,
      border: `1px solid ${base.subTableBorder}`,
      borderRadius: 10,
      overflow: "hidden",
    },
    subTheadTr: { background: base.subTableHead },
    subTh: { textAlign: "left", padding: "8px 10px", borderBottom: `2px solid ${base.subTableBorder}`, fontWeight: 800, fontSize: 12, color: base.textMuted },
    subThRight: { textAlign: "right", padding: "8px 10px", borderBottom: `2px solid ${base.subTableBorder}`, fontWeight: 800, fontSize: 12, color: base.textMuted },
    subTr: (idx) => ({ borderBottom: `1px solid ${base.subTableBorder}`, background: idx % 2 ? base.card : base.subTableStrip }),
    subTd: { padding: "8px 10px", fontSize: 13, color: base.text },
    subTdRight: { padding: "8px 10px", textAlign: "right", fontWeight: 800, color: base.text },
    subTfootTr: { background: isDark ? "#0b1220" : "#f9fafb", fontWeight: 800 },
    subTf: { padding: "10px 10px", borderTop: `2px solid ${base.subTableBorder}`, color: base.text },
    subTfRight: { padding: "10px 10px", textAlign: "right", borderTop: `2px solid ${base.subTableBorder}`, color: base.text },
  };
}

/* ================== Helpers UI ================== */

function StatCard({ styles, icon, label, value, color, bgColor, highlighted, isCount }) {
  return (
    <div style={{ border: `1px solid ${styles.border || 'transparent'}`, borderRadius: 12, padding: 12, background: bgColor }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontWeight: 800 }}>{label}</span>
      </div>
      <div style={{ fontWeight: 900, color: highlighted ? undefined : color, fontSize: isCount ? 18 : 20 }}>
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
  } catch { return "-"; }
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

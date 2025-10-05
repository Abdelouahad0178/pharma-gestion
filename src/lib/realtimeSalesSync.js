// src/lib/realtimeSalesSync.js
import {
  collection, onSnapshot, doc, runTransaction, 
  serverTimestamp, setDoc, Timestamp, query, where, getDocs
} from "firebase/firestore";

const APPLIED_COLL = "sales_applied";
const DISMISSED_COLL = "order_dismissed";

/**
 * Singleton: évite d'attacher plusieurs fois le même listener par societeId
 */
const _activeBySociete = new Map();

/**
 * Normalise la valeur de stock (stock1/stock2)
 */
const normalizeStockValue = (val) => {
  if (val === undefined || val === null) return "unknown";
  if (typeof val === "number") return val === 1 ? "stock1" : val === 2 ? "stock2" : "unknown";
  const raw = String(val).toLowerCase().replace(/[\s_\-]/g, "");
  if (["stock1","s1","magasin1","depot1","principal","primary","p","m1","1"].includes(raw)) return "stock1";
  if (["stock2","s2","magasin2","depot2","secondaire","secondary","s","m2","2"].includes(raw)) return "stock2";
  return "unknown";
};

/**
 * CORRECTION: Trouve le lot même sans stockEntryId
 */
async function findStockEntry(db, societeId, article) {
  if (article?.stockEntryId) {
    // Si on a un stockEntryId, l'utiliser directement
    return article.stockEntryId;
  }

  // Sinon, chercher par produit + numeroLot
  if (article?.produit) {
    const q = query(
      collection(db, "societe", societeId, "stock_entries"),
      where("nom", "==", article.produit)
    );
    
    const snapshot = await getDocs(q);
    const entries = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const totalStock = Math.max(0, Number(data.stock1 || 0) + Number(data.stock2 || 0));
      if (totalStock > 0) {
        entries.push({ id: doc.id, ...data, totalStock });
      }
    });

    // Si on a un numeroLot, chercher exact
    if (article.numeroLot) {
      const exact = entries.find(e => e.numeroLot === article.numeroLot);
      if (exact) return exact.id;
    }

    // Sinon, prendre le premier avec du stock (FIFO)
    if (entries.length > 0) {
      // Trier par date de péremption (FIFO)
      entries.sort((a, b) => {
        const dateA = a.datePeremption?.toDate?.() || new Date("2099-12-31");
        const dateB = b.datePeremption?.toDate?.() || new Date("2099-12-31");
        return dateA - dateB;
      });
      return entries[0].id;
    }
  }

  return null;
}

/**
 * Applique UNE LIGNE de vente au stock (idempotent via collections applied/dismissed)
 * @param {*} db - Instance Firestore
 * @param {string} societeId 
 * @param {string} venteId 
 * @param {number} lineIndex - Index de la ligne dans articles[]
 * @param {object} article - { produit, quantite, stockSource, stockEntryId?, ... }
 * @param {object} user 
 */
async function applySaleLineToStock(db, societeId, venteId, lineIndex, article, user) {
  const opId = `${venteId}#${lineIndex}`;
  
  const appliedRef = doc(db, "societe", societeId, APPLIED_COLL, opId);
  const dismissedRef = doc(db, "societe", societeId, DISMISSED_COLL, opId);

  await runTransaction(db, async (tx) => {
    // Vérifier si déjà appliqué ou ignoré
    const [appliedSnap, dismissedSnap] = await Promise.all([
      tx.get(appliedRef),
      tx.get(dismissedRef)
    ]);

    if (appliedSnap.exists() && appliedSnap.data()?.applied) {
      console.log(`[SYNC] Ligne ${opId} déjà appliquée, skip`);
      return; // déjà fait
    }

    if (dismissedSnap.exists() && dismissedSnap.data()?.dismissed) {
      console.log(`[SYNC] Ligne ${opId} ignorée par l'utilisateur, skip`);
      return; // ignoré volontairement
    }

    const produit = article?.produit || "";
    const qte = Math.max(0, Number(article?.quantite || 0));
    if (!produit || qte <= 0) {
      console.log(`[SYNC] Ligne ${opId} invalide (produit=${produit}, qte=${qte}), skip`);
      return;
    }

    const stockSource = normalizeStockValue(article?.stockSource);
    
    // CORRECTION: Trouver le stockEntryId si absent
    let stockEntryId = article?.stockEntryId;
    if (!stockEntryId) {
      console.log(`[SYNC] Recherche du lot pour ${produit}...`);
      stockEntryId = await findStockEntry(db, societeId, article);
      if (!stockEntryId) {
        console.warn(`[SYNC] Aucun lot trouvé pour ${produit}, abandon`);
        return;
      }
      console.log(`[SYNC] Lot trouvé: ${stockEntryId}`);
    }

    // Charger le lot
    const lotRef = doc(db, "societe", societeId, "stock_entries", stockEntryId);
    const lotSnap = await tx.get(lotRef);

    if (!lotSnap.exists()) {
      console.warn(`[SYNC] Lot ${stockEntryId} introuvable pour ligne ${opId}`);
      return;
    }

    const lotData = lotSnap.data();
    const S1 = Math.max(0, Number(lotData.stock1 || 0));
    const S2 = Math.max(0, Number(lotData.stock2 || 0));
    const Q = Math.max(0, Number(lotData.quantite || S1 + S2));

    // Logique de décrémentation selon stockSource
    let newS1 = S1;
    let newS2 = S2;
    let taken = 0;

    if (stockSource === "stock1") {
      // Prendre d'abord de stock1
      const takeS1 = Math.min(S1, qte);
      const rest = qte - takeS1;
      const takeS2 = Math.min(S2, rest);
      newS1 = S1 - takeS1;
      newS2 = S2 - takeS2;
      taken = takeS1 + takeS2;
    } else if (stockSource === "stock2") {
      // Prendre d'abord de stock2
      const takeS2 = Math.min(S2, qte);
      const rest = qte - takeS2;
      const takeS1 = Math.min(S1, rest);
      newS1 = S1 - takeS1;
      newS2 = S2 - takeS2;
      taken = takeS1 + takeS2;
    } else {
      // Fallback: prendre de stock1 puis stock2
      const takeS1 = Math.min(S1, qte);
      const rest = qte - takeS1;
      const takeS2 = Math.min(S2, rest);
      newS1 = S1 - takeS1;
      newS2 = S2 - takeS2;
      taken = takeS1 + takeS2;
    }

    const newQ = Math.max(0, newS1 + newS2);

    if (taken < qte) {
      console.warn(`[SYNC] Stock insuffisant pour ${opId}: demandé=${qte}, pris=${taken}`);
    }

    // Mettre à jour le lot
    tx.update(lotRef, {
      stock1: newS1,
      stock2: newS2,
      quantite: newQ,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email || user?.uid || "sync_system",
      lastSaleImpact: {
        venteId,
        lineIndex,
        opId,
        qty: taken,
        requested: qte,
        produit: lotData.nom || produit,
        numeroLot: lotData.numeroLot,
        stockSource,
        at: serverTimestamp(),
      },
    });

    // Marquer comme appliqué
    tx.set(appliedRef, {
      applied: true,
      venteId,
      lineIndex,
      opId,
      produit,
      quantite: qte,
      taken,
      stockEntryId,
      stockSource,
      appliedAt: serverTimestamp(),
      appliedBy: user?.uid || "sync_system",
    });

    console.log(`[SYNC] ✅ Ligne ${opId} appliquée: -${taken} (${stockSource}) du lot ${stockEntryId}`);
  });
}

/**
 * Attache un listener temps réel sur TOUTES les ventes et applique l'impact stock
 * ligne par ligne de manière idempotente
 * CORRECTION: Désactivé car maintenant géré dans la transaction de vente
 */
export function attachRealtimeSalesSync(db, { societeId, user, enabled = true }) {
  // CORRECTION: Désactiver ce listener car la sync est maintenant faite directement dans la transaction de vente
  console.log(`[SYNC] ⚠️ Listener temps réel désactivé - sync gérée dans la transaction de vente`);
  return () => {};
  
  /* Code original commenté pour référence
  if (!enabled || !societeId) return () => {};

  // Déjà actif pour cette société?
  if (_activeBySociete.has(societeId)) {
    console.log(`[SYNC] Listener déjà actif pour société ${societeId}`);
    return _activeBySociete.get(societeId);
  }

  console.log(`[SYNC] 🚀 Démarrage du listener temps réel pour société ${societeId}`);

  const ventesRef = collection(db, "societe", societeId, "ventes");

  const unsub = onSnapshot(
    ventesRef,
    async (snap) => {
      try {
        for (const change of snap.docChanges()) {
          if (change.type === "added" || change.type === "modified") {
            const venteId = change.doc.id;
            const vente = change.doc.data();

            const articles = Array.isArray(vente.articles) ? vente.articles : [];
            
            // Traiter chaque ligne
            for (let i = 0; i < articles.length; i++) {
              const article = articles[i];
              try {
                await applySaleLineToStock(db, societeId, venteId, i, article, user);
              } catch (err) {
                console.error(`[SYNC] Erreur ligne ${venteId}#${i}:`, err);
              }
            }
          }
        }
      } catch (err) {
        console.error("[SYNC] Erreur globale listener:", err);
      }
    },
    (err) => {
      console.error("[SYNC] Erreur snapshot listener:", err);
    }
  );

  _activeBySociete.set(societeId, unsub);
  
  return () => {
    console.log(`[SYNC] 🛑 Arrêt du listener pour société ${societeId}`);
    try { unsub(); } catch {}
    _activeBySociete.delete(societeId);
  };
  */
}
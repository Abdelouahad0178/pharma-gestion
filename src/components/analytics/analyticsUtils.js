// src/components/analytics/analyticsUtils.js

/**
 * Convertit un Timestamp Firestore ou une date en objet Date JS
 */
export const safeParseDate = (dateInput) => {
  if (!dateInput) return null;
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === "function") return dateInput.toDate();
    if (dateInput?.seconds != null) return new Date(dateInput.seconds * 1000);
    if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

/**
 * Convertit une valeur en nombre sûr
 */
export const safeNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/**
 * Obtient le numéro de semaine d'une date
 */
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

/**
 * Regroupe les ventes par période
 */
export const groupVentesByPeriod = (ventes, period) => {
  const groups = new Map();
  const now = new Date();

  // Initialiser les périodes vides
  if (period === 'jour') {
    // 30 derniers jours
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const key = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      groups.set(key, { date: key, dateComplete: date, ca: 0, count: 0 });
    }
  } else if (period === 'semaine') {
    // 12 dernières semaines
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - (i * 7));
      const weekNum = getWeekNumber(date);
      const key = `S${weekNum}`;
      groups.set(key, { date: key, dateComplete: date, ca: 0, count: 0 });
    }
  } else if (period === 'mois') {
    // 12 derniers mois
    const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const key = `${mois[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
      groups.set(key, { date: key, dateComplete: date, ca: 0, count: 0 });
    }
  } else {
    // 5 dernières années
    for (let i = 4; i >= 0; i--) {
      const annee = now.getFullYear() - i;
      const key = annee.toString();
      groups.set(key, { date: key, dateComplete: new Date(annee, 0, 1), ca: 0, count: 0 });
    }
  }

  // Remplir avec les vraies données
  ventes.forEach(vente => {
    const date = safeParseDate(vente.date || vente.dateVente || vente.createdAt);
    if (!date) return;

    // Calculer le total de la vente
    let total = 0;
    if (vente.total) {
      total = safeNumber(vente.total);
    } else if (vente.articles && Array.isArray(vente.articles)) {
      total = vente.articles.reduce((sum, art) => {
        const prix = safeNumber(art.prixUnitaire || art.prix || 0);
        const qte = safeNumber(art.quantite || art.qte || 0);
        const remise = safeNumber(art.remise || 0);
        return sum + (prix * qte - remise);
      }, 0);
    }

    let key;
    if (period === 'jour') {
      key = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    } else if (period === 'semaine') {
      const weekNum = getWeekNumber(date);
      key = `S${weekNum}`;
    } else if (period === 'mois') {
      const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      key = `${mois[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
    } else {
      key = date.getFullYear().toString();
    }

    if (groups.has(key)) {
      const group = groups.get(key);
      group.ca += total;
      group.count += 1;
    }
  });

  return Array.from(groups.values());
};

/**
 * Regroupe les achats par période
 */
export const groupAchatsByPeriod = (achats, period) => {
  const groups = new Map();
  const now = new Date();

  // Initialiser les périodes vides (même logique que ventes)
  if (period === 'jour') {
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const key = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      groups.set(key, { date: key, dateComplete: date, achats: 0, count: 0 });
    }
  } else if (period === 'semaine') {
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - (i * 7));
      const weekNum = getWeekNumber(date);
      const key = `S${weekNum}`;
      groups.set(key, { date: key, dateComplete: date, achats: 0, count: 0 });
    }
  } else if (period === 'mois') {
    const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const key = `${mois[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
      groups.set(key, { date: key, dateComplete: date, achats: 0, count: 0 });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const annee = now.getFullYear() - i;
      const key = annee.toString();
      groups.set(key, { date: key, dateComplete: new Date(annee, 0, 1), achats: 0, count: 0 });
    }
  }

  // Remplir avec les vraies données
  achats.forEach(achat => {
    const date = safeParseDate(achat.date || achat.dateAchat || achat.timestamp || achat.createdAt);
    if (!date) return;

    // Calculer le total de l'achat - STRUCTURE CORRIGÉE
    let total = 0;
    if (achat.total) {
      total = safeNumber(achat.total);
    } else if (achat.articles && Array.isArray(achat.articles)) {
      // Les achats ont une structure: articles[].commandee.{prixUnitaire, prixAchat, quantite, remise}
      total = achat.articles.reduce((sum, art) => {
        // Essayer d'accéder à commandee d'abord, sinon l'article directement
        const item = art.commandee || art.recu || art;
        const prix = safeNumber(item.prixUnitaire || item.prixAchat || item.prix || 0);
        const qte = safeNumber(item.quantite || item.qte || 0);
        const remise = safeNumber(item.remise || 0);
        return sum + (prix * qte - remise);
      }, 0);
      
      // Soustraire la remise globale si elle existe
      const remiseGlobale = safeNumber(achat.remiseGlobale || 0);
      total -= remiseGlobale;
    }

    let key;
    if (period === 'jour') {
      key = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    } else if (period === 'semaine') {
      const weekNum = getWeekNumber(date);
      key = `S${weekNum}`;
    } else if (period === 'mois') {
      const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      key = `${mois[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
    } else {
      key = date.getFullYear().toString();
    }

    if (groups.has(key)) {
      const group = groups.get(key);
      group.achats += total;
      group.count += 1;
    }
  });

  return Array.from(groups.values());
};

/**
 * Regroupe les paiements par période
 */
export const groupPaiementsByPeriod = (paiements, period) => {
  const groups = new Map();
  const now = new Date();

  // Initialiser les périodes vides
  if (period === 'jour') {
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const key = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      groups.set(key, { date: key, dateComplete: date, paiements: 0, count: 0 });
    }
  } else if (period === 'semaine') {
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - (i * 7));
      const weekNum = getWeekNumber(date);
      const key = `S${weekNum}`;
      groups.set(key, { date: key, dateComplete: date, paiements: 0, count: 0 });
    }
  } else if (period === 'mois') {
    const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const key = `${mois[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
      groups.set(key, { date: key, dateComplete: date, paiements: 0, count: 0 });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const annee = now.getFullYear() - i;
      const key = annee.toString();
      groups.set(key, { date: key, dateComplete: new Date(annee, 0, 1), paiements: 0, count: 0 });
    }
  }

  // Remplir avec les vraies données
  paiements.forEach(paiement => {
    const date = safeParseDate(paiement.date || paiement.datePaiement || paiement.createdAt);
    if (!date) return;

    const montant = safeNumber(paiement.montant || paiement.total || 0);

    let key;
    if (period === 'jour') {
      key = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    } else if (period === 'semaine') {
      const weekNum = getWeekNumber(date);
      key = `S${weekNum}`;
    } else if (period === 'mois') {
      const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      key = `${mois[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
    } else {
      key = date.getFullYear().toString();
    }

    if (groups.has(key)) {
      const group = groups.get(key);
      group.paiements += montant;
      group.count += 1;
    }
  });

  return Array.from(groups.values());
};

/**
 * Fusionne les données de ventes, achats et paiements
 */
export const mergeAllData = (ventesData, achatsData, paiementsData) => {
  const merged = new Map();

  // Ajouter les ventes
  ventesData.forEach(item => {
    merged.set(item.date, {
      date: item.date,
      dateComplete: item.dateComplete,
      ca: item.ca,
      achats: 0,
      paiements: 0,
      benefice: 0
    });
  });

  // Ajouter les achats
  achatsData.forEach(item => {
    if (merged.has(item.date)) {
      merged.get(item.date).achats = item.achats;
    } else {
      merged.set(item.date, {
        date: item.date,
        dateComplete: item.dateComplete,
        ca: 0,
        achats: item.achats,
        paiements: 0,
        benefice: 0
      });
    }
  });

  // Ajouter les paiements
  paiementsData.forEach(item => {
    if (merged.has(item.date)) {
      merged.get(item.date).paiements = item.paiements;
    } else {
      merged.set(item.date, {
        date: item.date,
        dateComplete: item.dateComplete,
        ca: 0,
        achats: 0,
        paiements: item.paiements,
        benefice: 0
      });
    }
  });

  // Calculer le bénéfice
  const result = Array.from(merged.values()).map(item => ({
    ...item,
    benefice: item.ca - item.achats
  }));

  // Trier par date
  result.sort((a, b) => a.dateComplete - b.dateComplete);

  return result;
};

/**
 * Calcule les statistiques (total, moyenne, max)
 */
export const calculateStats = (data) => {
  if (!data || data.length === 0) {
    return {
      total: { ca: 0, achats: 0, paiements: 0, benefice: 0 },
      avg: { ca: 0, achats: 0, paiements: 0, benefice: 0 },
      max: { ca: 0, achats: 0, paiements: 0, benefice: 0 }
    };
  }

  const total = data.reduce((acc, d) => ({
    ca: acc.ca + (d.ca || 0),
    achats: acc.achats + (d.achats || 0),
    paiements: acc.paiements + (d.paiements || 0),
    benefice: acc.benefice + (d.benefice || 0)
  }), { ca: 0, achats: 0, paiements: 0, benefice: 0 });

  const avg = {
    ca: total.ca / data.length,
    achats: total.achats / data.length,
    paiements: total.paiements / data.length,
    benefice: total.benefice / data.length
  };

  const max = data.reduce((acc, d) => ({
    ca: Math.max(acc.ca, d.ca || 0),
    achats: Math.max(acc.achats, d.achats || 0),
    paiements: Math.max(acc.paiements, d.paiements || 0),
    benefice: Math.max(acc.benefice, d.benefice || 0)
  }), { ca: 0, achats: 0, paiements: 0, benefice: -Infinity });

  return { total, avg, max };
};

/**
 * Formate un montant en DH
 */
export const formatDH = (value) => {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value || 0);
};
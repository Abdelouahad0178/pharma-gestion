// src/utils/permissions.js

/** ===========================================================
 *  Définition des permissions par rôle (par défaut)
 *  -> uniquement des clés FINES (matching EXACT)
 * =========================================================== */
const permissions = {
  docteur: [
    // Dashboard
    "voir_dashboard",

    // Ventes
    "voir_ventes",
    "ajouter_vente",
    "modifier_vente",
    "supprimer_vente",

    // Achats
    "voir_achats",
    "ajouter_achat",
    "modifier_achat",
    "supprimer_achat",

    // Stock
    "voir_stock",
    "ajouter_stock",
    "modifier_stock",
    "supprimer_stock",

    // Retours
    "ajouter_retour",
    "valider_retour",
    "annuler_retour",

    // Devis & Factures
    "voir_devis_factures",
    "ajouter_devis_factures",
    "modifier_devis_factures",
    "supprimer_devis_factures",

    // Paiements
    "voir_paiements",
    "ajouter_paiement",
    "modifier_paiement",
    "supprimer_paiement",

    // Administration
    "parametres",
    "gerer_utilisateurs",
    "voir_rapports",
    "gerer_societe",

    // Permissions générales
    "imprimer_documents",
    "exporter_donnees"
  ],

  vendeuse: [
    // Dashboard
    "voir_dashboard",

    // Ventes
    "voir_ventes",
    "ajouter_vente",
    "modifier_vente",

    // Stock
    "voir_stock",
    "ajouter_stock",
    "modifier_stock",

    // Retours
    "ajouter_retour",

    // Devis & Factures
    "voir_devis_factures",
    "ajouter_devis_factures",

    // Paiements
    "voir_paiements",
    "ajouter_paiement",

    // Permissions générales
    "imprimer_documents"
  ]
};

/** ===========================================================
 *  Liste exhaustive des permissions fines (exact match)
 * =========================================================== */
const ALL_PERMISSIONS = [
  // Dashboard
  "voir_dashboard",

  // Ventes
  "voir_ventes",
  "ajouter_vente",
  "modifier_vente",
  "supprimer_vente",

  // Achats
  "voir_achats",
  "ajouter_achat",
  "modifier_achat",
  "supprimer_achat",

  // Stock
  "voir_stock",
  "ajouter_stock",
  "modifier_stock",
  "supprimer_stock",

  // Retours
  "ajouter_retour",
  "valider_retour",
  "annuler_retour",

  // Devis & Factures
  "voir_devis_factures",
  "ajouter_devis_factures",
  "modifier_devis_factures",
  "supprimer_devis_factures",

  // Paiements
  "voir_paiements",
  "ajouter_paiement",
  "modifier_paiement",
  "supprimer_paiement",

  // Administration
  "parametres",
  "gerer_utilisateurs",
  "voir_rapports",
  "gerer_societe",

  // Permissions générales
  "imprimer_documents",
  "exporter_donnees"
];

/** ===========================================================
 *  Règles d’assignation
 * =========================================================== */
const DOCTOR_ONLY_PERMISSIONS = [
  "parametres",
  "gerer_utilisateurs",
  "voir_rapports",
  "gerer_societe",
  "supprimer_achat",
  "supprimer_vente",
  "supprimer_stock",
  "supprimer_devis_factures",
  "supprimer_paiement",
  "valider_retour",
  "annuler_retour"
];

// Permissions assignables aux vendeuses par le docteur
const ASSIGNABLE_PERMISSIONS = ALL_PERMISSIONS.filter(
  p => !DOCTOR_ONLY_PERMISSIONS.includes(p)
);

/** ===========================================================
 *  Libellés & Groupes (UI)
 * =========================================================== */
const PERMISSION_LABELS = {
  voir_dashboard: "Voir le tableau de bord",

  voir_ventes: "Consulter les ventes",
  ajouter_vente: "Créer des ventes",
  modifier_vente: "Modifier les ventes",
  supprimer_vente: "Supprimer les ventes",

  voir_achats: "Consulter les achats",
  ajouter_achat: "Créer des achats",
  modifier_achat: "Modifier les achats",
  supprimer_achat: "Supprimer les achats",

  voir_stock: "Consulter le stock",
  ajouter_stock: "Ajouter au stock",
  modifier_stock: "Modifier le stock",
  supprimer_stock: "Supprimer du stock",

  ajouter_retour: "Ajouter des retours",
  valider_retour: "Valider les retours",
  annuler_retour: "Annuler les retours",

  voir_devis_factures: "Consulter devis & factures",
  ajouter_devis_factures: "Créer devis & factures",
  modifier_devis_factures: "Modifier devis & factures",
  supprimer_devis_factures: "Supprimer devis & factures",

  voir_paiements: "Consulter les paiements",
  ajouter_paiement: "Enregistrer des paiements",
  modifier_paiement: "Modifier les paiements",
  supprimer_paiement: "Supprimer les paiements",

  parametres: "Paramètres système",
  gerer_utilisateurs: "Gestion des utilisateurs",
  voir_rapports: "Consulter les rapports",
  gerer_societe: "Gestion de la société",

  imprimer_documents: "Imprimer les documents",
  exporter_donnees: "Exporter les données"
};

const PERMISSION_GROUPS = {
  Dashboard: ["voir_dashboard"],
  Ventes: ["voir_ventes", "ajouter_vente", "modifier_vente"],
  Achats: ["voir_achats", "ajouter_achat", "modifier_achat"],
  Stock: ["voir_stock", "ajouter_stock", "modifier_stock"],
  Retours: ["ajouter_retour"],
  "Devis & Factures": ["voir_devis_factures", "ajouter_devis_factures", "modifier_devis_factures"],
  Paiements: ["voir_paiements", "ajouter_paiement", "modifier_paiement"],
  Général: ["imprimer_documents", "exporter_donnees"]
};

/** ===========================================================
 *  Helpers STRICTS (matching EXACT) + Normalisation
 *  -> Empêchent l’effet “une clé = tout le bloc”
 * =========================================================== */

// Mappage de migration (si des anciennes clés globales existent en base)
const LEGACY_TO_FINE = {
  // Achats
  achats: ["voir_achats", "ajouter_achat", "modifier_achat", "supprimer_achat"],
  "achats:*": ["voir_achats", "ajouter_achat", "modifier_achat", "supprimer_achat"],
  achat: ["voir_achats", "ajouter_achat", "modifier_achat", "supprimer_achat"],
  "achat:*": ["voir_achats", "ajouter_achat", "modifier_achat", "supprimer_achat"],

  // Ventes
  ventes: ["voir_ventes", "ajouter_vente", "modifier_vente", "supprimer_vente"],
  "ventes:*": ["voir_ventes", "ajouter_vente", "modifier_vente", "supprimer_vente"],

  // Stock
  stock: ["voir_stock", "ajouter_stock", "modifier_stock", "supprimer_stock"],
  "stock:*": ["voir_stock", "ajouter_stock", "modifier_stock", "supprimer_stock"],

  // Devis & Factures
  "devis-factures": [
    "voir_devis_factures",
    "ajouter_devis_factures",
    "modifier_devis_factures",
    "supprimer_devis_factures"
  ],
  "devis-factures:*": [
    "voir_devis_factures",
    "ajouter_devis_factures",
    "modifier_devis_factures",
    "supprimer_devis_factures"
  ],

  // Paiements
  paiements: ["voir_paiements", "ajouter_paiement", "modifier_paiement", "supprimer_paiement"],
  "paiements:*": ["voir_paiements", "ajouter_paiement", "modifier_paiement", "supprimer_paiement"]
};

/**
 * Normalise une liste de permissions :
 *  - déplie les anciennes clés globales/wildcards en clés fines
 *  - enlève les wildcards et groupes
 *  - dédoublonne + force en lowercase
 */
function normalizePermissions(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = new Set();

  for (const raw of arr) {
    const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!key) continue;

    // Clé globale connue -> dépliage
    if (LEGACY_TO_FINE[key]) {
      for (const fine of LEGACY_TO_FINE[key]) out.add(fine);
      continue;
    }

    // On RÉFUSE les wildcards '*' et les groupes bruts (ex: "achats")
    if (key.includes("*")) continue;
    if (Object.prototype.hasOwnProperty.call(LEGACY_TO_FINE, key)) continue;

    out.add(key);
  }

  return Array.from(out);
}

/** Récupère les permissions par défaut d’un rôle */
function getDefaultPermissionsForRole(role) {
  const r = (role || "").toLowerCase();
  return Array.isArray(permissions[r]) ? [...permissions[r]] : [];
}

/** Match EXACT d’une permission */
function hasPerm(effectivePerms, key) {
  if (!key) return false;
  const set = new Set((effectivePerms || []).map(k => (k || "").toLowerCase()));
  return set.has(key.toLowerCase());
}

/** Toutes requises (exactes) */
function hasAll(effectivePerms, keys) {
  const set = new Set((effectivePerms || []).map(k => (k || "").toLowerCase()));
  return (keys || []).every(k => set.has((k || "").toLowerCase()));
}

/** Au moins une requise (exacte) */
function hasAny(effectivePerms, keys) {
  const set = new Set((effectivePerms || []).map(k => (k || "").toLowerCase()));
  return (keys || []).some(k => set.has((k || "").toLowerCase()));
}

/** ===========================================================
 *  Exports
 * =========================================================== */

// Export par défaut (compatibilité avec votre code existant)
export default permissions;

// Exports nommés
export {
  ALL_PERMISSIONS,
  DOCTOR_ONLY_PERMISSIONS,
  ASSIGNABLE_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_GROUPS,

  // Helpers
  getDefaultPermissionsForRole,
  normalizePermissions,
  hasPerm,
  hasAll,
  hasAny
};

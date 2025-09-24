// src/utils/permissions.js

// Votre structure existante (inchangée)
const permissions = {
  docteur: [
    // Dashboard
    "voir_dashboard",
    
    // Ventes
    "voir_ventes",
    "ajouter_vente",
    "modifier_vente",
    "supprimer_vente",
    
    // Achats (Docteur uniquement)
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
    
    // Devis & Factures (utilise voir_ventes dans App.js)
    "voir_devis_factures",
    "ajouter_devis_factures",
    "modifier_devis_factures",
    "supprimer_devis_factures",
    
    // Paiements (utilise voir_ventes dans App.js)
    "voir_paiements",
    "ajouter_paiement",
    "modifier_paiement",
    "supprimer_paiement",
    
    // Administration (Docteur uniquement)
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
    "modifier_vente", // Peut modifier ses propres ventes
    
    // Stock (lecture et ajout pour mise à jour lors des ventes)
    "voir_stock",
    "ajouter_stock", // Nécessaire pour route /stock selon App.js
    "modifier_stock", // Pour ajustements de stock
    
    // Retours
    "ajouter_retour",
    
    // Devis & Factures (lecture/ajout uniquement)
    "voir_devis_factures", // Même si route utilise voir_ventes
    "ajouter_devis_factures",
    
    // Paiements (lecture/ajout uniquement)  
    "voir_paiements", // Même si route utilise voir_ventes
    "ajouter_paiement",
    
    // Permissions générales
    "imprimer_documents"
  ]
};

// NOUVELLES CONSTANTES pour le système de permissions personnalisées

// Toutes les permissions disponibles dans le système
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

// Permissions réservées exclusivement au docteur (non assignables aux vendeuses)
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
  permission => !DOCTOR_ONLY_PERMISSIONS.includes(permission)
);

// Libellés des permissions pour l'interface utilisateur
const PERMISSION_LABELS = {
  "voir_dashboard": "Voir le tableau de bord",
  "voir_ventes": "Consulter les ventes",
  "ajouter_vente": "Créer des ventes",
  "modifier_vente": "Modifier les ventes",
  "supprimer_vente": "Supprimer les ventes",
  "voir_achats": "Consulter les achats",
  "ajouter_achat": "Créer des achats",
  "modifier_achat": "Modifier les achats",
  "supprimer_achat": "Supprimer les achats",
  "voir_stock": "Consulter le stock",
  "ajouter_stock": "Ajouter au stock",
  "modifier_stock": "Modifier le stock",
  "supprimer_stock": "Supprimer du stock",
  "ajouter_retour": "Ajouter des retours",
  "valider_retour": "Valider les retours",
  "annuler_retour": "Annuler les retours",
  "voir_devis_factures": "Consulter devis & factures",
  "ajouter_devis_factures": "Créer devis & factures",
  "modifier_devis_factures": "Modifier devis & factures",
  "supprimer_devis_factures": "Supprimer devis & factures",
  "voir_paiements": "Consulter les paiements",
  "ajouter_paiement": "Enregistrer des paiements",
  "modifier_paiement": "Modifier les paiements",
  "supprimer_paiement": "Supprimer les paiements",
  "parametres": "Paramètres système",
  "gerer_utilisateurs": "Gestion des utilisateurs",
  "voir_rapports": "Consulter les rapports",
  "gerer_societe": "Gestion de la société",
  "imprimer_documents": "Imprimer les documents",
  "exporter_donnees": "Exporter les données"
};

// Groupes de permissions pour l'organisation dans l'interface
const PERMISSION_GROUPS = {
  "Dashboard": ["voir_dashboard"],
  "Ventes": [
    "voir_ventes", 
    "ajouter_vente", 
    "modifier_vente"
  ],
  "Achats": [
    "voir_achats", 
    "ajouter_achat", 
    "modifier_achat"
  ],
  "Stock": [
    "voir_stock", 
    "ajouter_stock", 
    "modifier_stock"
  ],
  "Retours": [
    "ajouter_retour"
  ],
  "Devis & Factures": [
    "voir_devis_factures", 
    "ajouter_devis_factures", 
    "modifier_devis_factures"
  ],
  "Paiements": [
    "voir_paiements", 
    "ajouter_paiement", 
    "modifier_paiement"
  ],
  "Général": [
    "imprimer_documents", 
    "exporter_donnees"
  ]
};

// Export par défaut (pour maintenir la compatibilité avec votre code existant)
export default permissions;

// Exports nommés pour les nouvelles fonctionnalités
export { 
  ALL_PERMISSIONS, 
  DOCTOR_ONLY_PERMISSIONS, 
  ASSIGNABLE_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_GROUPS
};
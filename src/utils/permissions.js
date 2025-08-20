// src/utils/permissions.js
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

export default permissions;
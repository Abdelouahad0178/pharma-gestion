// src/components/hooks/usePermissions.js
import { useUserRole } from '../../contexts/UserRoleContext';

/**
 * Hook personnalisé pour faciliter la gestion et la vérification des permissions
 * Fournit des méthodes pratiques pour vérifier les permissions utilisateur
 */
export const usePermissions = () => {
  const { 
    can, 
    getUserPermissions, 
    hasCustomPermissions, 
    role, 
    customPermissions,
    getExtraPermissions 
  } = useUserRole();

  return {
    // ===== FONCTIONS DE BASE =====
    
    /**
     * Vérifier une permission spécifique
     * @param {string} permission - La permission à vérifier
     * @returns {boolean}
     */
    can,
    
    /**
     * Obtenir toutes les permissions de l'utilisateur actuel
     * @returns {string[]} - Tableau des permissions
     */
    getAllPermissions: getUserPermissions,
    
    /**
     * Vérifier si l'utilisateur a des permissions personnalisées
     * @returns {boolean}
     */
    hasCustomPermissions,
    
    /**
     * Obtenir les permissions supplémentaires (au-delà des permissions par défaut)
     * @returns {string[]} - Tableau des permissions supplémentaires
     */
    getExtraPermissions,
    
    /**
     * Obtenir le rôle de l'utilisateur
     * @returns {string|null} - 'docteur', 'vendeuse', ou null
     */
    role,
    
    /**
     * Obtenir les permissions personnalisées brutes
     * @returns {string[]} - Tableau des permissions personnalisées
     */
    customPermissions,

    // ===== FONCTIONS DE VÉRIFICATION MULTIPLE =====
    
    /**
     * Vérifier si l'utilisateur a AU MOINS UNE des permissions listées
     * @param {string[]} permissionList - Liste des permissions à vérifier
     * @returns {boolean}
     */
    canAny: (permissionList) => {
      if (!Array.isArray(permissionList)) return false;
      return permissionList.some(permission => can(permission));
    },
    
    /**
     * Vérifier si l'utilisateur a TOUTES les permissions listées
     * @param {string[]} permissionList - Liste des permissions à vérifier
     * @returns {boolean}
     */
    canAll: (permissionList) => {
      if (!Array.isArray(permissionList)) return false;
      return permissionList.every(permission => can(permission));
    },

    // ===== HELPERS SPÉCIFIQUES MÉTIER =====
    
    /**
     * Peut gérer complètement les ventes (voir, ajouter, modifier)
     * @returns {boolean}
     */
    canManageSales: () => {
      return can('voir_ventes') && can('ajouter_vente') && can('modifier_vente');
    },
    
    /**
     * Peut gérer le stock (voir, ajouter, modifier)
     * @returns {boolean}
     */
    canManageStock: () => {
      return can('voir_stock') && can('ajouter_stock') && can('modifier_stock');
    },
    
    /**
     * Peut consulter les achats
     * @returns {boolean}
     */
    canViewPurchases: () => {
      return can('voir_achats');
    },
    
    /**
     * Peut gérer complètement les achats (voir, ajouter, modifier)
     * @returns {boolean}
     */
    canManagePurchases: () => {
      return can('voir_achats') && can('ajouter_achat') && can('modifier_achat');
    },
    
    /**
     * Peut consulter les rapports ou exporter des données
     * @returns {boolean}
     */
    canViewReports: () => {
      return can('voir_rapports') || can('exporter_donnees');
    },
    
    /**
     * Peut gérer les aspects financiers (paiements et devis/factures)
     * @returns {boolean}
     */
    canManageFinances: () => {
      return can('voir_paiements') && can('voir_devis_factures');
    },
    
    /**
     * Peut supprimer des données (réservé au docteur)
     * @returns {boolean}
     */
    canDelete: () => {
      return can('supprimer_vente') || can('supprimer_achat') || can('supprimer_stock');
    },

    // ===== HELPERS DE RÔLE =====
    
    /**
     * L'utilisateur est-il un administrateur (docteur)
     * @returns {boolean}
     */
    isAdmin: () => role === 'docteur',
    
    /**
     * L'utilisateur est-il une vendeuse
     * @returns {boolean}
     */
    isVendeuse: () => role === 'vendeuse',
    
    /**
     * L'utilisateur a-t-il des permissions étendues (vendeuse avec permissions supplémentaires)
     * @returns {boolean}
     */
    hasExtendedPermissions: () => role === 'vendeuse' && hasCustomPermissions(),

    // ===== STATISTIQUES ET INFORMATIONS =====
    
    /**
     * Obtenir des statistiques sur les permissions de l'utilisateur
     * @returns {Object} - Statistiques des permissions
     */
    getPermissionStats: () => {
      const allPermissions = getUserPermissions();
      const extraPermissions = getExtraPermissions();
      return {
        total: allPermissions.length,
        extra: extraPermissions.length,
        default: allPermissions.length - extraPermissions.length,
        hasCustom: hasCustomPermissions(),
        role: role
      };
    },

    // ===== FONCTIONS DE VÉRIFICATION AVANCÉES =====
    
    /**
     * Vérifier les permissions pour une section complète de l'application
     * @param {string} section - 'ventes', 'achats', 'stock', 'finances'
     * @returns {Object} - Permissions détaillées pour cette section
     */
    getSectionPermissions: (section) => {
      const sections = {
        ventes: {
          view: can('voir_ventes'),
          add: can('ajouter_vente'),
          edit: can('modifier_vente'),
          delete: can('supprimer_vente'),
          fullAccess: can('voir_ventes') && can('ajouter_vente') && can('modifier_vente')
        },
        achats: {
          view: can('voir_achats'),
          add: can('ajouter_achat'),
          edit: can('modifier_achat'),
          delete: can('supprimer_achat'),
          fullAccess: can('voir_achats') && can('ajouter_achat') && can('modifier_achat')
        },
        stock: {
          view: can('voir_stock'),
          add: can('ajouter_stock'),
          edit: can('modifier_stock'),
          delete: can('supprimer_stock'),
          fullAccess: can('voir_stock') && can('ajouter_stock') && can('modifier_stock')
        },
        finances: {
          viewPayments: can('voir_paiements'),
          addPayments: can('ajouter_paiement'),
          editPayments: can('modifier_paiement'),
          viewInvoices: can('voir_devis_factures'),
          addInvoices: can('ajouter_devis_factures'),
          editInvoices: can('modifier_devis_factures'),
          fullAccess: can('voir_paiements') && can('voir_devis_factures')
        }
      };
      
      return sections[section] || null;
    },
    
    /**
     * Obtenir une description textuelle des permissions de l'utilisateur
     * @returns {string} - Description des permissions
     */
    getPermissionDescription: () => {
      const stats = {
        total: getUserPermissions().length,
        extra: getExtraPermissions().length
      };
      
      if (role === 'docteur') {
        return `Pharmacien avec accès complet (${stats.total} permissions)`;
      } else if (role === 'vendeuse') {
        if (stats.extra > 0) {
          return `Vendeuse avec ${stats.extra} permission(s) supplémentaire(s) (${stats.total} permissions au total)`;
        } else {
          return `Vendeuse avec permissions standard (${stats.total} permissions)`;
        }
      }
      
      return 'Utilisateur sans rôle défini';
    }
  };
};

export default usePermissions;
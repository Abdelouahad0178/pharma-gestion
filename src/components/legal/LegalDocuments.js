// src/components/legal/LegalDocuments.js - Version SaaS + Back fiable (haut & bas) + lecture ?tab=
import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';

export default function LegalDocuments() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('cgu');

  // Permet d’ouvrir /legal?tab=privacy etc.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t && ['cgu', 'cgv', 'privacy', 'mentions', 'sla'].includes(t)) {
      setActiveTab(t);
    }
  }, [location.search]);

  // Back robuste : s’il n’y a pas d’historique, on va à la Home
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/'); // fallback
    }
  };

  const tabs = [
    { id: 'cgu', label: "CGU - Conditions d'Utilisation", icon: '📜' },
    { id: 'cgv', label: 'CGV - Conditions de Vente', icon: '💰' },
    { id: 'privacy', label: 'Confidentialité & RGPD', icon: '🔒' },
    { id: 'mentions', label: 'Mentions Légales', icon: '⚖️' },
    { id: 'sla', label: 'SLA - Garantie de Service', icon: '⚡' }
  ];

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    card: {
      maxWidth: '1200px',
      margin: '0 auto',
      background: 'white',
      borderRadius: '20px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      overflow: 'hidden'
    },
    header: {
      position: 'relative',
      background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
      padding: '48px 30px 30px',
      color: 'white',
      textAlign: 'center'
    },
    title: {
      margin: '0 0 10px 0',
      fontSize: '2.5em',
      fontWeight: 800
    },
    subtitle: {
      margin: 0,
      opacity: 0.9,
      fontSize: '1.1em'
    },
    backButtonTop: {
      position: 'absolute',
      top: '12px',
      left: '12px',
      zIndex: 5,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 14px',
      background: 'linear-gradient(135deg, #667eea, #764ba2)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'transform 0.2s, opacity .2s',
      fontSize: '0.95em',
      boxShadow: '0 6px 16px rgba(0,0,0,0.25)'
    },
    tabContainer: {
      display: 'flex',
      overflowX: 'auto',
      background: '#f8fafc',
      borderBottom: '2px solid #e2e8f0',
      padding: '10px 20px',
      gap: '10px'
    },
    tab: (active) => ({
      padding: '12px 24px',
      borderRadius: '10px',
      border: 'none',
      background: active ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'white',
      color: active ? 'white' : '#475569',
      fontWeight: active ? 700 : 600,
      fontSize: '0.95em',
      cursor: 'pointer',
      transition: 'all 0.3s',
      whiteSpace: 'nowrap',
      boxShadow: active ? '0 4px 12px rgba(102, 126, 234, 0.4)' : '0 2px 4px rgba(0,0,0,0.1)'
    }),
    content: {
      padding: '40px',
      lineHeight: 1.8,
      color: '#334155'
    },
    section: {
      marginBottom: '30px'
    },
    sectionTitle: {
      fontSize: '1.8em',
      fontWeight: 700,
      color: '#1e293b',
      marginBottom: '15px',
      paddingBottom: '10px',
      borderBottom: '3px solid #667eea'
    },
    subsectionTitle: {
      fontSize: '1.3em',
      fontWeight: 600,
      color: '#475569',
      marginTop: '20px',
      marginBottom: '10px'
    },
    paragraph: {
      marginBottom: '15px'
    },
    list: {
      marginLeft: '20px',
      marginBottom: '15px'
    },
    listItem: {
      marginBottom: '8px'
    },
    highlight: {
      background: '#fef3c7',
      padding: '2px 6px',
      borderRadius: '4px',
      fontWeight: 600
    },
    important: {
      background: '#fef2f2',
      border: '2px solid #fca5a5',
      borderRadius: '10px',
      padding: '15px',
      marginBottom: '20px'
    },
    success: {
      background: '#f0fdf4',
      border: '2px solid #86efac',
      borderRadius: '10px',
      padding: '15px',
      marginBottom: '20px'
    },
    updateDate: {
      textAlign: 'right',
      color: '#64748b',
      fontSize: '0.9em',
      fontStyle: 'italic',
      marginTop: '30px'
    },
    footer: {
      display: 'flex',
      justifyContent: 'flex-start',
      padding: '20px 40px',
      borderTop: '2px solid #e2e8f0'
    },
    backButtonBottom: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #667eea, #764ba2)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'transform 0.2s',
      fontSize: '1em',
      boxShadow: '0 6px 16px rgba(0,0,0,0.15)'
    }
  };

  // Bouton « haut-gauche »
  const BackButtonTop = () => (
    <button
      type="button"
      style={styles.backButtonTop}
      onClick={handleBack}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      aria-label="Revenir en arrière"
    >
      ← Retour
    </button>
  );

  // ============== Rendus des onglets ==============
  const renderCGU = () => (
    <div style={styles.content}>
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Conditions Générales d'Utilisation - Logiciel SaaS</h2>
        <div style={styles.important}>
          <strong>⚠️ Important :</strong> En utilisant Pharma Gestion, vous acceptez les présentes CGU. 
          Ce document régit l'utilisation de notre logiciel de gestion pharmaceutique en ligne.
        </div>
        <h3 style={styles.subsectionTitle}>1. Définitions</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}><strong>Service :</strong> Logiciel SaaS "Pharma Gestion" accessible via Internet</li>
          <li style={styles.listItem}><strong>Éditeur :</strong> [ANAPHARMO], éditeur et hébergeur du logiciel</li>
          <li style={styles.listItem}><strong>Client :</strong> Toute personne morale ou physique souscrivant à un abonnement</li>
          <li style={styles.listItem}><strong>Utilisateur :</strong> Toute personne accédant au Service avec un compte autorisé</li>
          <li style={styles.listItem}><strong>Données :</strong> Toutes informations saisies, stockées ou traitées via le Service</li>
        </ul>
        <h3 style={styles.subsectionTitle}>2. Objet du Service</h3>
        <p style={styles.paragraph}>
          Pharma Gestion est un logiciel SaaS (Software as a Service) destiné à la <strong>gestion complète des pharmacies</strong> :
        </p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Gestion des stocks et inventaires</li>
          <li style={styles.listItem}>Gestion des ventes et facturation</li>
          <li style={styles.listItem}>Gestion des achats fournisseurs</li>
          <li style={styles.listItem}>Suivi des clients et créances</li>
          <li style={styles.listItem}>Tableaux de bord et statistiques</li>
          <li style={styles.listItem}>Sauvegarde automatique des données</li>
        </ul>
        <h3 style={styles.subsectionTitle}>3. Conditions d'accès</h3>
        <p style={styles.paragraph}>L'accès au Service est réservé aux :</p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Pharmaciens titulaires d'officine dûment autorisés au Maroc</li>
          <li style={styles.listItem}>Personnel autorisé des pharmacies (avec validation du titulaire)</li>
          <li style={styles.listItem}>Médecins ayant un accord avec la pharmacie</li>
        </ul>
        <p style={styles.paragraph}>
          L'inscription nécessite : nom, email professionnel, numéro de téléphone, et selon le rôle : 
          numéro d'ordre des pharmaciens (ONP) ou carte professionnelle des médecins.
        </p>
        <h3 style={styles.subsectionTitle}>4. Compte utilisateur</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}><strong>Création :</strong> Un compte propriétaire est créé lors de l'inscription</li>
          <li style={styles.listItem}><strong>Sécurité :</strong> Vous êtes responsable de la confidentialité de vos identifiants</li>
          <li style={styles.listItem}><strong>Utilisateurs multiples :</strong> Le propriétaire peut inviter d'autres utilisateurs</li>
          <li style={styles.listItem}><strong>Permissions :</strong> Chaque utilisateur dispose de droits d'accès personnalisables</li>
          <li style={styles.listItem}><strong>Suspension :</strong> Nous pouvons suspendre un compte en cas de non-paiement ou violation des CGU</li>
        </ul>
        <h3 style={styles.subsectionTitle}>5. Obligations du Client</h3>
        <p style={styles.paragraph}>Le Client s'engage à :</p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Fournir des informations exactes lors de l'inscription</li>
          <li style={styles.listItem}>Utiliser le Service conformément à la législation marocaine</li>
          <li style={styles.listItem}>Ne pas tenter de pirater, décompiler ou reverse-engineer le logiciel</li>
          <li style={styles.listItem}>Ne pas revendre ou sous-louer l'accès au Service</li>
          <li style={styles.listItem}>Effectuer des sauvegardes régulières de ses données (fonction disponible)</li>
          <li style={styles.listItem}>Payer les frais d'abonnement aux échéances convenues</li>
          <li style={styles.listItem}>Respecter les droits d'accès et permissions des utilisateurs</li>
        </ul>
        <h3 style={styles.subsectionTitle}>6. Propriété intellectuelle</h3>
        <p style={styles.paragraph}>
          Le Service, son code source, son interface, sa documentation et tous ses composants sont la propriété exclusive 
          de l'Éditeur. Toute reproduction, copie, modification ou exploitation non autorisée est strictement interdite.
        </p>
        <p style={styles.paragraph}>
          <strong>Vos données vous appartiennent :</strong> Vous conservez tous les droits sur les données que vous saisissez 
          dans le Service. Nous ne revendiquons aucun droit sur vos données.
        </p>
        <h3 style={styles.subsectionTitle}>7. Protection des données (Loi 09-08 & RGPD)</h3>
        <p style={styles.paragraph}>Nous traitons vos données conformément à :</p>
        <ul style={styles.list}>
          <li style={styles.listItem}><strong>Loi 09-08</strong> marocaine sur la protection des données personnelles</li>
          <li style={styles.listItem}><strong>RGPD européen</strong> (pour garantir les meilleures pratiques)</li>
          <li style={styles.listItem}>Notre <strong>Politique de Confidentialité</strong> détaillée</li>
        </ul>
        <p style={styles.paragraph}>
          Vous disposez d'un droit d'accès, rectification, suppression, portabilité et opposition sur vos données. 
          Contact : privacy@pharma-gestion.ma
        </p>
        <h3 style={styles.subsectionTitle}>8. Disponibilité et maintenance</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}><strong>Disponibilité visée :</strong> 99,5% hors maintenance programmée</li>
          <li style={styles.listItem}><strong>Maintenance :</strong> Planifiée en dehors des heures ouvrées avec préavis 48h</li>
          <li style={styles.listItem}><strong>Support technique :</strong> Par email du lundi au vendredi 9h-18h</li>
          <li style={styles.listItem}><strong>Mises à jour :</strong> Automatiques et gratuites pour améliorer le Service</li>
        </ul>
        <h3 style={styles.subsectionTitle}>9. Sauvegarde des données</h3>
        <p style={styles.paragraph}><strong>🔒 Sécurité maximale :</strong></p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Sauvegardes automatiques quotidiennes sur Firebase/Google Cloud</li>
          <li style={styles.listItem}>Redondance géographique des données</li>
          <li style={styles.listItem}>Chiffrement des données en transit (SSL/TLS) et au repos</li>
          <li style={styles.listItem}>Fonction d'export manuel (JSON) disponible à tout moment</li>
        </ul>
        <p style={styles.paragraph}><strong>⚠️ Recommandation :</strong> Effectuez des exports réguliers de vos données importantes.</p>
        <h3 style={styles.subsectionTitle}>10. Responsabilité</h3>
        <p style={styles.paragraph}><strong>Responsabilité de l'Éditeur :</strong></p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Nous mettons tout en œuvre pour assurer le bon fonctionnement du Service</li>
          <li style={styles.listItem}>Notre responsabilité est limitée au montant des sommes payées sur les 12 derniers mois</li>
          <li style={styles.listItem}>Nous ne sommes pas responsables des pertes indirectes (perte de CA, etc.)</li>
        </ul>
        <p style={styles.paragraph}><strong>Responsabilité du Client :</strong></p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Le Client est seul responsable de l'utilisation du Service et des données saisies</li>
          <li style={styles.listItem}>Le Client doit vérifier la conformité de son usage avec la réglementation pharmaceutique</li>
          <li style={styles.listItem}>Le Client doit effectuer des sauvegardes régulières</li>
        </ul>
        <h3 style={styles.subsectionTitle}>11. Résiliation</h3>
        <p style={styles.paragraph}><strong>Résiliation par le Client :</strong></p>
        <ul style={styles.list}>
          <li style={styles.listItem}>À tout moment avec préavis de 30 jours</li>
          <li style={styles.listItem}>Les sommes payées ne sont pas remboursées au prorata</li>
          <li style={styles.listItem}>Export de toutes vos données avant la résiliation effective</li>
        </ul>
        <p style={styles.paragraph}><strong>Résiliation par l'Éditeur :</strong></p>
        <ul style={styles.list}>
          <li style={styles.listItem}>En cas de non-paiement après mise en demeure de 15 jours</li>
          <li style={styles.listItem}>En cas de violation grave des CGU</li>
          <li style={styles.listItem}>En cas d'utilisation frauduleuse ou illégale</li>
        </ul>
        <h3 style={styles.subsectionTitle}>12. Modification des CGU</h3>
        <p style={styles.paragraph}>
          Nous nous réservons le droit de modifier les présentes CGU. Vous serez informé par email 30 jours avant 
          l'entrée en vigueur des modifications substantielles. L'utilisation continue du Service vaut acceptation.
        </p>
        <h3 style={styles.subsectionTitle}>13. Loi applicable et juridiction</h3>
        <p style={styles.paragraph}>
          Les présentes CGU sont régies par le droit marocain. En cas de litige, une solution amiable sera recherchée. 
          À défaut, les tribunaux de <strong>Casablanca</strong> seront seuls compétents.
        </p>
        <h3 style={styles.subsectionTitle}>14. Contact</h3>
        <p style={styles.paragraph}>
          <strong>Service Client :</strong><br />
          Email : support@pharma-gestion.ma<br />
          Téléphone : +212 211223344<br />
          Horaires : Lundi-Vendredi 9h-18h<br />
          Adresse : [AV MED6 N°123 Casablanca MAROC]
        </p>
      </div>
      <div style={styles.updateDate}>
        Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );

  const renderCGV = () => (
    <div style={styles.content}>
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Conditions Générales de Vente - Abonnement SaaS</h2>
        <div style={styles.important}>
          <strong>💰 Vente de service :</strong> Ces CGV régissent la souscription et le paiement des abonnements au logiciel Pharma Gestion.
        </div>
        <h3 style={styles.subsectionTitle}>1. Objet</h3>
        <p style={styles.paragraph}>
          Les présentes Conditions Générales de Vente régissent la souscription d'abonnements au logiciel SaaS 
          <span style={styles.highlight}> Pharma Gestion</span>, permettant la gestion informatisée d'officines pharmaceutiques.
        </p>
        <h3 style={styles.subsectionTitle}>2. Offres et tarifs</h3>
        <div style={styles.success}><strong>📦 Formules d'abonnement disponibles :</strong></div>
        <h4 style={{...styles.subsectionTitle, fontSize: '1.1em'}}>🌟 STARTER - 299 DHS/mois</h4>
        <ul style={styles.list}>
          <li style={styles.listItem}>1 utilisateur (propriétaire)</li>
          <li style={styles.listItem}>Gestion stock, ventes, achats</li>
          <li style={styles.listItem}>Sauvegarde automatique</li>
          <li style={styles.listItem}>Support par email</li>
        </ul>
        <h4 style={{...styles.subsectionTitle, fontSize: '1.1em'}}>💼 PROFESSIONAL - 599 DHS/mois</h4>
        <ul style={styles.list}>
          <li style={styles.listItem}>Jusqu'à 5 utilisateurs</li>
          <li style={styles.listItem}>Toutes fonctionnalités Starter</li>
          <li style={styles.listItem}>Statistiques avancées</li>
          <li style={styles.listItem}>Gestion multi-stocks</li>
          <li style={styles.listItem}>Support prioritaire</li>
        </ul>
        <h4 style={{...styles.subsectionTitle, fontSize: '1.1em'}}>🏢 ENTERPRISE - 999 DHS/mois</h4>
        <ul style={styles.list}>
          <li style={styles.listItem}>Utilisateurs illimités</li>
          <li style={styles.listItem}>Toutes fonctionnalités Professional</li>
          <li style={styles.listItem}>Multi-pharmacies</li>
          <li style={styles.listItem}>API d'intégration</li>
          <li style={styles.listItem}>Support téléphonique dédié</li>
          <li style={styles.listItem}>Formation personnalisée</li>
        </ul>
        <p style={styles.paragraph}><strong>⚠️ Note :</strong> Prix en DHS HT. TVA 20% applicable.</p>
        <h3 style={styles.subsectionTitle}>3. Souscription</h3>
        <p style={styles.paragraph}>La souscription s'effectue en ligne via notre site web :</p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Choix de la formule d'abonnement</li>
          <li style={styles.listItem}>Création du compte propriétaire</li>
          <li style={styles.listItem}>Validation des CGU et CGV (obligatoire)</li>
          <li style={styles.listItem}>Paiement du premier mois</li>
          <li style={styles.listItem}>Activation immédiate après paiement confirmé</li>
        </ul>
        <h3 style={styles.subsectionTitle}>4. Période d'essai</h3>
        <div style={styles.success}><strong>🎁 Essai gratuit de 14 jours</strong></div>
        <ul style={styles.list}>
          <li style={styles.listItem}>Accès complet à toutes les fonctionnalités de votre formule</li>
          <li style={styles.listItem}>Aucune carte bancaire requise pour démarrer</li>
          <li style={styles.listItem}>Annulation possible à tout moment pendant l'essai</li>
          <li style={styles.listItem}>Conversion automatique en abonnement payant si non annulé</li>
        </ul>
        <h3 style={styles.subsectionTitle}>5. Modalités de paiement</h3>
        <p style={styles.paragraph}><strong>Modes de paiement acceptés :</strong></p>
        <ul style={styles.list}>
          <li style={styles.listItem}>💳 Carte bancaire (Visa, Mastercard) - Paiement sécurisé via [Stripe/PayPal]</li>
          <li style={styles.listItem}>🏦 Virement bancaire (pour abonnements annuels uniquement)</li>
          <li style={styles.listItem}>💰 Prélèvement automatique mensuel (après accord)</li>
        </ul>
        <p style={styles.paragraph}><strong>Facturation :</strong></p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Mensuelle : le même jour chaque mois</li>
          <li style={styles.listItem}>Annuelle : réduction de 20% (soit 2 mois gratuits)</li>
          <li style={styles.listItem}>Facture envoyée automatiquement par email</li>
          <li style={styles.listItem}>Accessible dans votre espace client</li>
        </ul>
        <h3 style={styles.subsectionTitle}>6. Durée et renouvellement</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Abonnement à durée indéterminée</li>
          <li style={styles.listItem}>Renouvellement automatique</li>
          <li style={styles.listItem}>Résiliation possible à tout moment avec préavis de 30 jours</li>
          <li style={styles.listItem}>Aucun engagement minimum après la période d'essai</li>
        </ul>
        <h3 style={styles.subsectionTitle}>7. Changement de formule</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}><strong>Upgrade :</strong> immédiat avec prorata</li>
          <li style={styles.listItem}><strong>Downgrade :</strong> à la prochaine échéance</li>
          <li style={styles.listItem}>Modification à tout moment depuis votre espace</li>
        </ul>
        <h3 style={styles.subsectionTitle}>8. Retard ou défaut de paiement</h3>
        <p style={styles.paragraph}>En cas de non-paiement :</p>
        <ul style={styles.list}>
          <li style={styles.listItem}>Rappel automatique par email à J+3</li>
          <li style={styles.listItem}>Suspension après 15 jours (lecture seule)</li>
          <li style={styles.listItem}>Blocage total après 30 jours</li>
          <li style={styles.listItem}>Résiliation après 60 jours avec suppression des données</li>
          <li style={styles.listItem}>Pénalités : 12% l'an + 40€ forfaitaire</li>
        </ul>
        <h3 style={styles.subsectionTitle}>9. Droit de rétractation</h3>
        <p style={styles.paragraph}>
          Délai de 14 jours à compter de la souscription, SAUF usage du Service (renonciation).
          L'essai gratuit de 14 jours permet de tester sans engagement.
        </p>
        <h3 style={styles.subsectionTitle}>10. Remboursement</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Pas de remboursement au prorata</li>
          <li style={styles.listItem}>Accès maintenu jusqu'à fin de période payée</li>
          <li style={styles.listItem}>Exception : dysfonctionnement majeur non résolu sous 7 jours</li>
        </ul>
        <h3 style={styles.subsectionTitle}>11. Augmentation tarifaire</h3>
        <p style={styles.paragraph}>Préavis de <strong>60 jours</strong> par email. Résiliation possible sans pénalité.</p>
        <h3 style={styles.subsectionTitle}>12. Garanties</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Disponibilité 99,5% (hors maintenance)</li>
          <li style={styles.listItem}>Support sous 24h ouvrées</li>
          <li style={styles.listItem}>Chiffrement SSL/TLS, hébergement sécurisé</li>
          <li style={styles.listItem}>Sauvegardes automatiques quotidiennes</li>
          <li style={styles.listItem}>Mises à jour gratuites</li>
        </ul>
        <h3 style={styles.subsectionTitle}>13. Litiges</h3>
        <p style={styles.paragraph}>
          support@pharma-gestion.ma — solution amiable sous 30 jours. À défaut : tribunaux de commerce de Casablanca.
        </p>
        <h3 style={styles.subsectionTitle}>14. Contact commercial</h3>
        <p style={styles.paragraph}>
          sales@pharma-gestion.ma — +212 5XX-XXXXXX — Demande de devis : https://pharma-gestion.ma/devis
        </p>
      </div>
      <div style={styles.updateDate}>
        Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );

  const renderPrivacy = () => (
    <div style={styles.content}>
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Politique de Confidentialité & RGPD</h2>
        <div style={styles.important}>
          <strong>🔒 Votre vie privée est notre priorité.</strong> Nous respectons la loi 09-08 marocaine et le RGPD européen.
        </div>
        <h3 style={styles.subsectionTitle}>1. Responsable du traitement</h3>
        <p style={styles.paragraph}>
          <strong>[VOTRE SOCIÉTÉ]</strong><br />
          ICE : [Numéro ICE]<br />
          Adresse : [Adresse complète]<br />
          Email DPO : privacy@pharma-gestion.ma<br />
          Téléphone : +212 5XX-XXXXXX
        </p>
        <h3 style={styles.subsectionTitle}>2. Données collectées</h3>
        <h4 style={{...styles.subsectionTitle, fontSize: '1.1em'}}>📋 Données du compte client (Pharmacie)</h4>
        <ul style={styles.list}>
          <li style={styles.listItem}>Nom de la pharmacie</li>
          <li style={styles.listItem}>Adresse, ville, téléphone</li>
          <li style={styles.listItem}>Email professionnel</li>
          <li style={styles.listItem}>Numéro d'ordre ONP (pharmacien)</li>
          <li style={styles.listItem}>Informations de facturation</li>
          <li style={styles.listItem}>Formule d'abonnement choisie</li>
        </ul>
        <h4 style={{...styles.subsectionTitle, fontSize: '1.1em'}}>👤 Données utilisateurs</h4>
        <ul style={styles.list}>
          <li style={styles.listItem}>Nom, prénom, email</li>
          <li style={styles.listItem}>Rôle (pharmacien, vendeuse, médecin, admin)</li>
          <li style={styles.listItem}>Permissions d'accès</li>
          <li style={styles.listItem}>Historique de connexion</li>
        </ul>
        <h4 style={{...styles.subsectionTitle, fontSize: '1.1em'}}>💼 Données métier</h4>
        <ul style={styles.list}>
          <li style={styles.listItem}>Produits et stock</li>
          <li style={styles.listItem}>Ventes, achats, factures</li>
          <li style={styles.listItem}>Clients et fournisseurs</li>
          <li style={styles.listItem}>Paiements et transactions</li>
        </ul>
        <h4 style={{...styles.subsectionTitle, fontSize: '1.1em'}}>🔐 Données techniques</h4>
        <ul style={styles.list}>
          <li style={styles.listItem}>Adresse IP, navigateur, système d'exploitation</li>
          <li style={styles.listItem}>Logs de connexion et d'activité</li>
          <li style={styles.listItem}>Cookies techniques</li>
        </ul>
        <h3 style={styles.subsectionTitle}>3. Finalités et bases légales</h3>
        <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '15px'}}>
          <thead>
            <tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0'}}>
              <th style={{padding: '10px', textAlign: 'left', fontWeight: 600}}>Finalité</th>
              <th style={{padding: '10px', textAlign: 'left', fontWeight: 600}}>Base légale</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Gestion de votre abonnement</td>
              <td style={{padding: '10px'}}>Exécution du contrat</td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Facturation et comptabilité</td>
              <td style={{padding: '10px'}}>Obligation légale</td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Support technique</td>
              <td style={{padding: '10px'}}>Exécution du contrat</td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Sécurité et traçabilité</td>
              <td style={{padding: '10px'}}>Intérêt légitime</td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Amélioration du service</td>
              <td style={{padding: '10px'}}>Intérêt légitime</td>
            </tr>
            <tr>
              <td style={{padding: '10px'}}>Communications marketing</td>
              <td style={{padding: '10px'}}>Consentement (opt-in)</td>
            </tr>
          </tbody>
        </table>
        <h3 style={styles.subsectionTitle}>4. Destinataires des données</h3>
        <p style={styles.paragraph}>Vos données sont accessibles uniquement à :</p>
        <ul style={styles.list}>
          <li style={styles.listItem}>👥 Vous et vos utilisateurs autorisés</li>
          <li style={styles.listItem}>🔧 Notre équipe technique (support/maintenance)</li>
          <li style={styles.listItem}>☁️ Firebase/Google Cloud (ISO 27001)</li>
          <li style={styles.listItem}>💳 Processeur de paiement ([Stripe/PayPal])</li>
          <li style={styles.listItem}>⚖️ Autorités légales (réquisition)</li>
        </ul>
        <p style={styles.paragraph}><strong>❌ Jamais :</strong> vente ou location de données.</p>
        <h3 style={styles.subsectionTitle}>5. Durée de conservation</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}><strong>Compte actif :</strong> pendant l'abonnement</li>
          <li style={styles.listItem}><strong>Après résiliation :</strong>
            <ul style={{...styles.list, marginTop: '8px'}}>
              <li>Données de compte : 30 jours</li>
              <li>Données métier : export proposé puis suppression sous 30 jours</li>
              <li>Facturation : 10 ans (fiscal)</li>
            </ul>
          </li>
          <li style={styles.listItem}><strong>Logs techniques :</strong> 12 mois max</li>
        </ul>
        <h3 style={styles.subsectionTitle}>6. Vos droits</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Accès, rectification, suppression</li>
          <li style={styles.listItem}>Portabilité (JSON), limitation, opposition</li>
          <li style={styles.listItem}>Réclamation CNDP</li>
        </ul>
        <p style={styles.paragraph}>
          Exercer vos droits : privacy@pharma-gestion.ma — réponse sous 30 jours (pièce d'identité requise).
        </p>
        <h3 style={styles.subsectionTitle}>7. Sécurité</h3>
        <div style={styles.success}><strong>🛡️ Mesures :</strong></div>
        <ul style={styles.list}>
          <li style={styles.listItem}>HTTPS (SSL/TLS)</li>
          <li style={styles.listItem}>Firebase Auth (authentification forte)</li>
          <li style={styles.listItem}>Contrôle d'accès par rôles</li>
          <li style={styles.listItem}>Sauvegardes quotidiennes chiffrées</li>
          <li style={styles.listItem}>Surveillance 24/7 et logs</li>
          <li style={styles.listItem}>Hébergement certifié (ISO 27001, SOC 2, PCI DSS)</li>
        </ul>
        <h3 style={styles.subsectionTitle}>8. Transferts internationaux</h3>
        <p style={styles.paragraph}>
          Hébergement Firebase GCP (priorité Europe), redondance US, clauses contractuelles types UE.
        </p>
        <h3 style={styles.subsectionTitle}>9. Cookies</h3>
        <p style={styles.paragraph}>Uniquement cookies nécessaires (session, préférences, anti-CSRF). Pas de tracking tiers.</p>
        <h3 style={styles.subsectionTitle}>10. Modifications</h3>
        <p style={styles.paragraph}>Préavis de 30 jours par email pour toute modification substantielle.</p>
        <h3 style={styles.subsectionTitle}>11. Contact DPO</h3>
        <p style={styles.paragraph}>
          dpo@pharma-gestion.ma — [Adresse] (à l’attention du DPO).<br />
          Autorité : CNDP (www.cndp.ma)
        </p>
      </div>
      <div style={styles.updateDate}>
        Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );

  const renderMentions = () => (
    <div style={styles.content}>
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Mentions Légales</h2>
        <h3 style={styles.subsectionTitle}>1. Éditeur du site et du logiciel</h3>
        <p style={styles.paragraph}>
          <strong>Raison sociale :</strong> [VOTRE SOCIÉTÉ]<br />
          <strong>Forme juridique :</strong> [SARL/SA/SARL AU/etc.]<br />
          <strong>Capital social :</strong> [Montant] DHS<br />
          <strong>RC :</strong> [Numéro RC Casablanca]<br />
          <strong>IF :</strong> [Identifiant Fiscal]<br />
          <strong>ICE :</strong> [Identifiant Commun de l'Entreprise]<br />
          <strong>TVA :</strong> [Numéro TVA]<br />
          <strong>Patente :</strong> [Numéro]<br /><br />
          <strong>Siège social :</strong><br />
          [Adresse complète]<br />
          [Code Postal] [Ville], Maroc<br /><br />
          <strong>Contact :</strong><br />
          +212 5XX-XXX-XXX — contact@pharma-gestion.ma<br />
          Site : https://www.pharma-gestion.ma
        </p>
        <h3 style={styles.subsectionTitle}>2. Directeur de publication</h3>
        <p style={styles.paragraph}>
          <strong>Nom :</strong> [Nom Prénom]<br />
          <strong>Qualité :</strong> [Gérant/Président/DG]<br />
          <strong>Email :</strong> direction@pharma-gestion.ma
        </p>
        <h3 style={styles.subsectionTitle}>3. Hébergement</h3>
        <p style={styles.paragraph}>
          Google LLC — Google Cloud Platform / Firebase, 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA.<br />
          Certifications : ISO 27001, SOC 2, PCI DSS — Localisation principale : Europe.
        </p>
        <h3 style={styles.subsectionTitle}>4. Propriété intellectuelle</h3>
        <p style={styles.paragraph}>Le site et le logiciel « Pharma Gestion » (code, UI, logos, contenus, BDD, algorithmes) sont la propriété de [VOTRE SOCIÉTÉ].</p>
        <p style={styles.paragraph}><strong>⚠️ Toute reproduction/modification sans autorisation écrite est interdite.</strong></p>
        <h3 style={styles.subsectionTitle}>5. Marques déposées</h3>
        <p style={styles.paragraph}>"Pharma Gestion" est une marque déposée à l'OMPIC. N° : [Numéro], classes 9 et 42.</p>
        <h3 style={styles.subsectionTitle}>6. Données personnelles</h3>
        <p style={styles.paragraph}>
          Responsable : [VOTRE SOCIÉTÉ] — DPO : dpo@pharma-gestion.ma.<br />
          Voir <Link to="/legal?tab=privacy" style={{color: '#667eea', fontWeight: 600}}>Politique de Confidentialité</Link>.
        </p>
        <h3 style={styles.subsectionTitle}>7. Cookies</h3>
        <p style={styles.paragraph}>Cookies strictement nécessaires (authentification, sécurité, préférences). Pas de publicitaires/tiers.</p>
        <h3 style={styles.subsectionTitle}>8. Liens hypertextes</h3>
        <p style={styles.paragraph}>Liens tiers hors contrôle : aucune responsabilité quant à leur contenu ou politique.</p>
        <h3 style={styles.subsectionTitle}>9. Responsabilité</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Exactitude sans garantie d'absence d'erreurs</li>
          <li style={styles.listItem}>Disponibilité 99,5% hors maintenance</li>
          <li style={styles.listItem}>Absence de virus non garantie</li>
        </ul>
        <h3 style={styles.subsectionTitle}>10. Droit applicable</h3>
        <p style={styles.paragraph}>Droit marocain. Tribunaux compétents : Casablanca.</p>
        <h3 style={styles.subsectionTitle}>11. Médiation</h3>
        <p style={styles.paragraph}>Recours gratuit à un médiateur de la consommation pour litiges.</p>
        <h3 style={styles.subsectionTitle}>12. Crédits</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>React.js (Frontend)</li>
          <li style={styles.listItem}>Firebase (Backend & Base de données)</li>
          <li style={styles.listItem}>Material-UI (Interface)</li>
          <li style={styles.listItem}>Recharts (Graphiques)</li>
        </ul>
        <h3 style={styles.subsectionTitle}>13. Contact</h3>
        <p style={styles.paragraph}>contact@pharma-gestion.ma — +212 5XX-XXX-XXX — Lun-Ven 9h-18h — [Adresse, Ville].</p>
        <h3 style={styles.subsectionTitle}>14. Dernière mise à jour</h3>
        <p style={styles.paragraph}>
          {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  );

  const renderSLA = () => (
    <div style={styles.content}>
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>SLA - Accord de Niveau de Service</h2>
        <div style={styles.success}>
          <strong>⚡ Notre engagement qualité :</strong> Service fiable et performant.
        </div>
        <h3 style={styles.subsectionTitle}>1. Définitions</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}><strong>Disponibilité :</strong> temps de service opérationnel</li>
          <li style={styles.listItem}><strong>Temps d'arrêt :</strong> période d’inaccessibilité</li>
          <li style={styles.listItem}><strong>Maintenance programmée :</strong> annoncée ≥ 48h</li>
          <li style={styles.listItem}><strong>Incident majeur :</strong> interruption totale ≥ 1h</li>
        </ul>
        <h3 style={styles.subsectionTitle}>2. Engagement de disponibilité</h3>
        <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '15px'}}>
          <thead>
            <tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0'}}>
              <th style={{padding: '10px', textAlign: 'left'}}>Indicateur</th>
              <th style={{padding: '10px', textAlign: 'left'}}>Objectif</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Disponibilité mensuelle</td>
              <td style={{padding: '10px'}}><strong>99,5%</strong></td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Temps d'arrêt maximum/mois</td>
              <td style={{padding: '10px'}}>3,6 h (hors maintenance)</td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Maintenance programmée</td>
              <td style={{padding: '10px'}}>≤ 4 h/mois</td>
            </tr>
            <tr>
              <td style={{padding: '10px'}}>RTO</td>
              <td style={{padding: '10px'}}>≤ 4 h</td>
            </tr>
          </tbody>
        </table>
        <h3 style={styles.subsectionTitle}>3. Performance</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Réponse pages ≤ 2 s</li>
          <li style={styles.listItem}>Chargement initial ≤ 3 s</li>
          <li style={styles.listItem}>CRUD ≤ 1 s</li>
          <li style={styles.listItem}>Rapports ≤ 5 s</li>
        </ul>
        <h3 style={styles.subsectionTitle}>4. Support technique</h3>
        <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '15px'}}>
          <thead>
            <tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0'}}>
              <th style={{padding: '10px', textAlign: 'left'}}>Formule</th>
              <th style={{padding: '10px', textAlign: 'left'}}>Canal</th>
              <th style={{padding: '10px', textAlign: 'left'}}>SLA réponse</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Starter</td>
              <td style={{padding: '10px'}}>Email</td>
              <td style={{padding: '10px'}}>≤ 24h ouvrées</td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Professional</td>
              <td style={{padding: '10px'}}>Email prioritaire</td>
              <td style={{padding: '10px'}}>≤ 12h ouvrées</td>
            </tr>
            <tr>
              <td style={{padding: '10px'}}>Enterprise</td>
              <td style={{padding: '10px'}}>Email + Téléphone</td>
              <td style={{padding: '10px'}}>≤ 4h ouvrées</td>
            </tr>
          </tbody>
        </table>
        <p style={styles.paragraph}><strong>Heures ouvrées :</strong> Lun-Ven 9h-18h (GMT+1, Casablanca)</p>
        <h3 style={styles.subsectionTitle}>5. Sauvegardes</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Quotidiennes à 02:00</li>
          <li style={styles.listItem}>Rétention 30 jours</li>
          <li style={styles.listItem}>Multi-zones (EU + US)</li>
          <li style={styles.listItem}>AES-256</li>
          <li style={styles.listItem}>Tests de restauration mensuels</li>
          <li style={styles.listItem}>RPO ≤ 24 h</li>
        </ul>
        <h3 style={styles.subsectionTitle}>6. Sécurité</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>TLS 256-bit</li>
          <li style={styles.listItem}>MFA disponible</li>
          <li style={styles.listItem}>WAF & protection DDoS</li>
          <li style={styles.listItem}>Audit annuel</li>
          <li style={styles.listItem}>ISO 27001 / SOC 2</li>
        </ul>
        <h3 style={styles.subsectionTitle}>7. Maintenance</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>≤ 1 fois / mois</li>
          <li style={styles.listItem}>≤ 4 h, idéalement 22h-02h</li>
          <li style={styles.listItem}>Préavis ≥ 48 h</li>
          <li style={styles.listItem}>Hors calcul de disponibilité</li>
        </ul>
        <h3 style={styles.subsectionTitle}>8. Incidents</h3>
        <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '15px'}}>
          <thead>
            <tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0'}}>
              <th style={{padding: '10px', textAlign: 'left'}}>Niveau</th>
              <th style={{padding: '10px', textAlign: 'left'}}>Description</th>
              <th style={{padding: '10px', textAlign: 'left'}}>Résolution</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Critique</td>
              <td style={{padding: '10px'}}>Service indisponible</td>
              <td style={{padding: '10px'}}>≤ 4 h</td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>Majeur</td>
              <td style={{padding: '10px'}}>Fonction critique HS</td>
              <td style={{padding: '10px'}}>≤ 12 h</td>
            </tr>
            <tr>
              <td style={{padding: '10px'}}>Mineur</td>
              <td style={{padding: '10px'}}>Fonction secondaire HS</td>
              <td style={{padding: '10px'}}>≤ 48 h</td>
            </tr>
          </tbody>
        </table>
        <h3 style={styles.subsectionTitle}>9. Notification</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Alerte immédiate par email (propriétaires)</li>
          <li style={styles.listItem}>Page statut : status.pharma-gestion.ma</li>
          <li style={styles.listItem}>Mises à jour horaires</li>
          <li style={styles.listItem}>Post-mortem sous 5 jours ouvrés</li>
        </ul>
        <h3 style={styles.subsectionTitle}>10. Compensation</h3>
        <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '15px'}}>
          <thead>
            <tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0'}}>
              <th style={{padding: '10px', textAlign: 'left'}}>Disponibilité</th>
              <th style={{padding: '10px', textAlign: 'left'}}>Crédit</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>99,0% – 99,5%</td>
              <td style={{padding: '10px'}}>10%</td>
            </tr>
            <tr style={{borderBottom: '1px solid #f1f5f9'}}>
              <td style={{padding: '10px'}}>98,0% – 99,0%</td>
              <td style={{padding: '10px'}}>25%</td>
            </tr>
            <tr>
              <td style={{padding: '10px'}}>≤ 98,0%</td>
              <td style={{padding: '10px'}}>50%</td>
            </tr>
          </tbody>
        </table>
        <p style={styles.paragraph}><strong>Conditions :</strong> réclamation sous 7 jours, crédit sur facture suivante, max 50% mensuel.</p>
        <h3 style={styles.subsectionTitle}>11. Exclusions</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Maintenance programmée</li>
          <li style={styles.listItem}>Connexion/matériel client</li>
          <li style={styles.listItem}>Force majeure / attaques</li>
          <li style={styles.listItem}>Suspension pour non-paiement</li>
          <li style={styles.listItem}>Modifications non autorisées</li>
        </ul>
        <h3 style={styles.subsectionTitle}>12. Évolution du SLA</h3>
        <p style={styles.paragraph}>Préavis de 30 jours.</p>
        <h3 style={styles.subsectionTitle}>13. Contact</h3>
        <p style={styles.paragraph}>support@pharma-gestion.ma — +212 5XX-XXX-XXX (Enterprise).</p>
      </div>
      <div style={styles.updateDate}>
        Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );

  // ============== Rendu principal ==============
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          {/* Bouton « ← Retour » en haut à gauche */}
          <BackButtonTop />
          <h1 style={styles.title}>⚖️ Documents Légaux</h1>
          <p style={styles.subtitle}>Pharma Gestion - Logiciel SaaS</p>
        </div>

        <div style={styles.tabContainer}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              style={styles.tab(activeTab === tab.id)}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'cgu' && renderCGU()}
        {activeTab === 'cgv' && renderCGV()}
        {activeTab === 'privacy' && renderPrivacy()}
        {activeTab === 'mentions' && renderMentions()}
        {activeTab === 'sla' && renderSLA()}

        {/* Bouton « ← Retour » en bas à gauche */}
        <div style={styles.footer}>
          <button
            type="button"
            style={styles.backButtonBottom}
            onClick={handleBack}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            ← Retour
          </button>
        </div>
      </div>
    </div>
  );
}

// src/utils/dateFormatter.js

/**
 * Formate une date Firestore Timestamp ou Date JavaScript
 * @param {Timestamp|Date|Object} dateInput - La date à formater
 * @returns {string} La date formatée avec l'heure
 */
export function formatActivityDate(dateInput) {
  let date;
  
  // Gérer les différents types d'entrée
  if (!dateInput) {
    return "Date inconnue";
  }
  
  // Si c'est un Timestamp Firestore
  if (dateInput?.toDate && typeof dateInput.toDate === 'function') {
    date = dateInput.toDate();
  }
  // Si c'est déjà un objet Date
  else if (dateInput instanceof Date) {
    date = dateInput;
  }
  // Si c'est un timestamp en secondes (Firestore)
  else if (dateInput?.seconds) {
    date = new Date(dateInput.seconds * 1000);
  }
  // Si c'est une string ISO
  else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  }
  // Si c'est un nombre (timestamp milliseconds)
  else if (typeof dateInput === 'number') {
    date = new Date(dateInput);
  }
  else {
    return "Date invalide";
  }

  // Vérifier que la date est valide
  if (isNaN(date.getTime())) {
    return "Date invalide";
  }

  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Formatage selon la proximité temporelle
  if (diffSeconds < 60) {
    return "À l'instant";
  } else if (diffMinutes < 60) {
    return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  } else if (diffHours < 24) {
    return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  } else if (diffDays === 0) {
    // Aujourd'hui
    return `Aujourd'hui à ${formatTime(date)}`;
  } else if (diffDays === 1) {
    // Hier
    return `Hier à ${formatTime(date)}`;
  } else if (diffDays < 7) {
    // Cette semaine
    return `${getDayName(date)} à ${formatTime(date)}`;
  } else {
    // Plus ancien
    return `${formatFullDate(date)} à ${formatTime(date)}`;
  }
}

/**
 * Formate l'heure au format HH:mm
 */
function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formate la date complète au format DD/MM/YYYY
 */
function formatFullDate(date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Obtient le nom du jour en français
 */
function getDayName(date) {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[date.getDay()];
}

/**
 * Formate une date pour l'affichage dans un champ input date
 */
export function formatDateForInput(dateInput) {
  let date;
  
  if (dateInput?.toDate && typeof dateInput.toDate === 'function') {
    date = dateInput.toDate();
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else if (dateInput?.seconds) {
    date = new Date(dateInput.seconds * 1000);
  } else {
    return "";
  }
  
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Formate une date pour l'affichage complet avec jour de la semaine
 */
export function formatDateComplete(dateInput) {
  let date;
  
  if (dateInput?.toDate && typeof dateInput.toDate === 'function') {
    date = dateInput.toDate();
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else if (dateInput?.seconds) {
    date = new Date(dateInput.seconds * 1000);
  } else {
    return "Date inconnue";
  }
  
  const dayName = getDayName(date);
  const day = date.getDate();
  const monthNames = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  const time = formatTime(date);
  
  return `${dayName} ${day} ${month} ${year} à ${time}`;
}

/**
 * Groupe les activités par période (Aujourd'hui, Hier, Cette semaine, etc.)
 */
export function groupActivitiesByPeriod(activities) {
  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: []
  };
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  activities.forEach(activity => {
    let activityDate;
    
    if (activity.timestamp?.toDate) {
      activityDate = activity.timestamp.toDate();
    } else if (activity.timestamp?.seconds) {
      activityDate = new Date(activity.timestamp.seconds * 1000);
    } else if (activity.date) {
      activityDate = new Date(activity.date);
    } else {
      return;
    }
    
    if (activityDate >= todayStart) {
      groups.today.push(activity);
    } else if (activityDate >= yesterdayStart) {
      groups.yesterday.push(activity);
    } else if (activityDate >= weekStart) {
      groups.thisWeek.push(activity);
    } else if (activityDate >= monthStart) {
      groups.thisMonth.push(activity);
    } else {
      groups.older.push(activity);
    }
  });
  
  return groups;
}

/**
 * Calcule les statistiques des activités par type pour aujourd'hui
 */
export function calculateTodayStats(activities) {
  const stats = {
    ventes: { count: 0, total: 0 },
    achats: { count: 0, total: 0 },
    paiements: { count: 0, total: 0 },
    stock: { count: 0 }
  };
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  activities.forEach(activity => {
    let activityDate;
    
    if (activity.timestamp?.toDate) {
      activityDate = activity.timestamp.toDate();
    } else if (activity.timestamp?.seconds) {
      activityDate = new Date(activity.timestamp.seconds * 1000);
    } else if (activity.date) {
      activityDate = new Date(activity.date);
    } else {
      return;
    }
    
    if (activityDate >= todayStart) {
      switch (activity.type) {
        case 'vente':
          stats.ventes.count++;
          stats.ventes.total += activity.details?.montant || 0;
          break;
        case 'achat':
          stats.achats.count++;
          stats.achats.total += activity.details?.montant || 0;
          break;
        case 'paiement':
          stats.paiements.count++;
          stats.paiements.total += activity.details?.montant || 0;
          break;
        case 'stock_ajout':
        case 'stock_modif':
        case 'stock_retour':
          stats.stock.count++;
          break;
      }
    }
  });
  
  return stats;
}
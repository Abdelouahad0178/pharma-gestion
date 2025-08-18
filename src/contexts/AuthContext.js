// src/contexts/AuthContext.js
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext();
export function useAuth() { return useContext(AuthContext); }

// utils
function toDateSafe(v){ try{ if(!v) return null; if(typeof v?.toDate==='function') return v.toDate(); const d=new Date(v); return isNaN(d.getTime())?null:d; }catch{return null;}}
function formatFR(d){ if(!d) return ''; return d.toLocaleString('fr-FR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}); }

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]   = useState(null);
  const [loading, setLoading]           = useState(true);

  // popups et état de verrouillage
  const [paymentWarning, setPaymentWarning] = useState(null); // {title, message(HTML), details}
  const [adminPopup, setAdminPopup]         = useState(null); // {title, message(HTML), details}
  const [isLocked, setIsLocked]             = useState(false);

  const lockedOnceRef = useRef(false);

  useEffect(() => {
    let unsubUser = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
      if (!user) lockedOnceRef.current = false;

      if (unsubUser) { unsubUser(); unsubUser = null; }
      if (!user) {
        setPaymentWarning(null);
        setAdminPopup(null);
        setIsLocked(false);
        return;
      }

      const ref = doc(db, 'users', user.uid);
      unsubUser = onSnapshot(ref, (snap) => {
        if (!snap.exists()) {
          setPaymentWarning(null);
          setAdminPopup(null);
          setIsLocked(false);
          return;
        }

        const data = snap.data();
        const now = new Date();

        // 1) Verrouillage temps réel => on met le mode verrouillé (mais on NE redirige pas ici)
        const locked = data?.locked === true || data?.status === 'disabled';
        setIsLocked(locked);

        if (locked) {
          const title = data?.adminPopup?.title || '🔒 Compte verrouillé';
          const msg   = data?.adminPopup?.message || "Votre compte a été verrouillé par l’administrateur.";
          const details = data?.adminPopup?.details || '';

          setAdminPopup({
            title,
            message: msg,
            details
          });

          // On stocke aussi un message pour l'écran de login (au cas où)
          if (!lockedOnceRef.current) {
            try { localStorage.setItem('forcedSignOutMessage', `${title} — ${msg}`); } catch {}
            lockedOnceRef.current = true;
          }

          // En mode verrouillé, on n'affiche PAS d'avertissement paiement
          setPaymentWarning(null);
          return;
        }

        // 2) Si pas verrouillé, afficher adminPopup si actif
        if (data.adminPopup?.status === 'active') {
          const exp = toDateSafe(data.adminPopup.expiryDate);
          if (!exp || exp > now) {
            setAdminPopup({
              title:   data.adminPopup.title   || '🔒 Information',
              message: (data.adminPopup.message || 'Message de l’administrateur.')
                       + (exp ? `<br><em>Expire le ${formatFR(exp)}</em>` : ''),
              details: data.adminPopup.details || ''
            });
          } else {
            setAdminPopup(null);
          }
        } else {
          setAdminPopup(null);
        }

        // 3) Si pas verrouillé et pas d’adminPopup prioritaire, afficher paymentWarning si actif
        if (data.paymentWarning?.status === 'active') {
          const exp = toDateSafe(data.paymentWarning.expiryDate);
          if (!exp || exp > now) {
            setPaymentWarning({
              title: '🚨 Avertissement de paiement',
              message: `Votre abonnement requiert une attention immédiate pour éviter toute interruption.${
                exp ? ` Veuillez régulariser avant le <strong>${formatFR(exp)}</strong>.` : ''
              }`,
              details: 'En cas de non-paiement, votre accès pourrait être suspendu.'
            });
          } else {
            setPaymentWarning(null);
          }
        } else {
          setPaymentWarning(null);
        }
      });
    });

    return () => { unsubAuth(); if (unsubUser) unsubUser(); };
  }, []);

  const value = {
    currentUser,
    paymentWarning, setPaymentWarning,
    adminPopup,
    isLocked
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

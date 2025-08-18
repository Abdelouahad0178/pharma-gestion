// src/components/shared/SessionEnforcer.js
import React, { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

export default function SessionEnforcer({ seconds = 6 }) {
  const { isLocked, adminPopup } = useAuth();
  const [left, setLeft] = useState(seconds);
  const tickingRef = useRef(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!isLocked) {
      // reset pour la prochaine fois
      setLeft(seconds);
      if (tickingRef.current) { clearInterval(tickingRef.current); tickingRef.current = null; }
      firedRef.current = false;
      return;
    }

    // démarrer le compte à rebours
    if (!tickingRef.current) {
      tickingRef.current = setInterval(() => {
        setLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
    }

    return () => {
      if (tickingRef.current) { clearInterval(tickingRef.current); tickingRef.current = null; }
    };
  }, [isLocked, seconds]);

  useEffect(() => {
    if (!isLocked) return;
    if (left > 0) return;
    if (firedRef.current) return;
    firedRef.current = true;

    // Stocker le message pour l'écran de login
    try {
      const t = adminPopup?.title || '🔒 Compte verrouillé';
      const m = adminPopup?.message || "Votre compte a été verrouillé par l’administrateur.";
      localStorage.setItem('forcedSignOutMessage', `${t} — ${m}`);
    } catch {}

    (async () => {
      try { await signOut(auth); } catch {}
      // redirection dure (stoppe toute navigation en cours)
      window.location.replace('/login');
    })();
  }, [left, isLocked, adminPopup]);

  if (!isLocked) return null;

  const styles = {
    overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',backdropFilter:'blur(2px)',zIndex:100000,
             display:'flex',alignItems:'center',justifyContent:'center'},
    box:{background:'#1a2a4a',color:'#eaeef7',padding:24,borderRadius:12,border:'1px solid #2b406b',
         width:'92%',maxWidth:560,boxShadow:'0 10px 30px rgba(0,0,0,.6)',textAlign:'center'},
    title:{marginTop:0,color:'#ffd93d'}
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        <h3 style={styles.title}>{adminPopup?.title || '🔒 Compte verrouillé'}</h3>
        <p style={{lineHeight:1.6, marginTop: 8}}>
          {adminPopup?.message || "Votre compte a été verrouillé par l’administrateur."}
        </p>
        {adminPopup?.details ? (
          <p style={{fontSize:13, color:'#b0c4de', marginTop:8}}>{adminPopup.details}</p>
        ) : null}
        <div style={{marginTop:16,fontWeight:700}}>
          Redirection vers la page de connexion dans <span style={{color:'#7ee4e6'}}>{left}</span> seconde(s)…
        </div>
      </div>
    </div>
  );
}

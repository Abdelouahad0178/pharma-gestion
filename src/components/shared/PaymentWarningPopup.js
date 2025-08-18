// src/components/shared/PaymentWarningPopup.js
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function PaymentWarningPopup() {
  const { paymentWarning, setPaymentWarning } = useAuth();
  if (!paymentWarning) return null;

  const styles = {
    overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(2px)'},
    box:{background:'#1a2a4a',color:'#eaeef7',padding:24,width:'92%',maxWidth:520,borderRadius:12,border:'1px solid #2b406b',boxShadow:'0 10px 30px rgba(0,0,0,.5)',position:'relative'},
    title:{margin:0,fontSize:18,color:'#ffd93d'},
    close:{position:'absolute',top:8,right:12,background:'transparent',border:'none',color:'#eaeef7',fontSize:28,cursor:'pointer'},
    details:{color:'#b0c4de',fontSize:13,marginTop:8}
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        <button style={styles.close} onClick={() => setPaymentWarning(null)}>&times;</button>
        <h3 style={styles.title}>{paymentWarning.title}</h3>
        <p style={{lineHeight:1.6,marginTop:10}} dangerouslySetInnerHTML={{ __html: paymentWarning.message }} />
        {paymentWarning.details ? <p style={styles.details}>{paymentWarning.details}</p> : null}
      </div>
    </div>
  );
}

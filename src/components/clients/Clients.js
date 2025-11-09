// src/components/clients/Clients.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  doc,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useUserRole } from '../../contexts/UserRoleContext';

/* ============================ Utils ============================ */
const todayISO = () => new Date().toISOString().split('T')[0];
const toYYYYMM = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
const phoneToWhatsApp = (raw) => {
  if (!raw) return '';
  const normalized = String(raw).replace(/[^\d+]/g, '');
  return normalized.startsWith('+') ? normalized.slice(1) : normalized;
};
const clampMoney = (n) => {
  const x = Number(n || 0);
  return Number.isFinite(x) ? Math.max(0, x) : 0;
};
const makeReadyCode = () => String(Math.floor(100000 + Math.random() * 900000));

const statusLabel = {
  nouvelle: 'Nouvelle',
  en_preparation: 'En préparation',
  pretes: 'Prêtes',
  livree: 'Livrée',
  annulee: 'Annulée'
};

const StatusBadge = ({ status }) => {
  const color =
    { nouvelle:'#f59e0b', en_preparation:'#3b82f6', pretes:'#10b981', livree:'#6366f1', annulee:'#ef4444' }[status] || '#6b7280';
  return (
    <span style={{display:'inline-block',padding:'4px 10px',borderRadius:999,background:`${color}22`,color,fontWeight:600,fontSize:12,whiteSpace:'nowrap'}}>
      {statusLabel[status] || status}
    </span>
  );
};

function btn(bg, color, outlined=false, borderColor){
  return {
    padding:'10px 12px', borderRadius:8,
    border: outlined ? `1px solid ${borderColor || color}` : 'none',
    background: outlined ? 'transparent' : bg,
    color, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap'
  };
}

const modalBackdrop = { 
  position:'fixed', inset:0, background:'rgba(0,0,0,.5)', 
  display:'flex', alignItems:'center', justifyContent:'center', 
  zIndex:1000, padding:'16px', overflowY:'auto'
};

const modalTitle = { fontSize:18, fontWeight:800, color:'#e5edff', marginBottom:12 };

/* ====================== Composant principal ====================== */
export default function Clients(){
  const { societeId, user } = useUserRole();

  // Onglets / recherche
  const [tab, setTab] = useState('nouvelle');
  const [qText, setQText] = useState('');

  // Ordonnances
  const [ordonnances, setOrdonnances] = useState([]);

  // Stock (lecture seule pour options + PV + fournisseur)
  const [stockEntries, setStockEntries] = useState([]);

  // UI erreurs / notifications
  const [uiError, setUiError] = useState('');
  const [uiNotice, setUiNotice] = useState('');

  // Form création
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    numero: '',
    clientName: '',
    clientPhone: '',
    doctorName: '',
    ordonnanceDate: todayISO(),
    notes: '',
    priority: 'normal',
    mode: 'retrait',
    address: '',
    dueAt: '',
    remise: 0,
    frais: 0,
    items: [{
      productId:'',
      productName:'',
      supplier:'',
      qty:1,
      dosage:'',
      unitPrice:'',
      newName:'',
      newPV:'',
      newSupplier:''
    }],
  });

  /* ==================== 🆕 Styles Responsive + Scroll Horizontal ==================== */
  const Styles = () => (
    <style>{`
      * { box-sizing: border-box; }
      
      .clients-root { 
        min-height: 100vh; 
        display: flex; 
        flex-direction: column;
        background: linear-gradient(135deg, #0b0f1a 0%, #1a1f35 100%);
        padding: 12px;
      }
      
      .clients-header { 
        position: sticky; 
        top: 0; 
        z-index: 10; 
        background: rgba(11, 15, 26, 0.95);
        backdrop-filter: blur(10px);
        padding: 16px;
        border-radius: 16px;
        margin-bottom: 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }
      
      .clients-content { 
        flex: 1 1 auto; 
        min-height: 0; 
        overflow: hidden;
      }

      .fullscreen-table-title {
        font-size: clamp(20px, 4vw, 28px);
        font-weight: 800;
        color: #e5edff;
        margin-bottom: 16px;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      /* 🆕 Container avec scroll horizontal */
      .table-scroll-container {
        overflow-x: auto;
        overflow-y: visible;
        -webkit-overflow-scrolling: touch;
        border-radius: 12px;
        background: #0e1730;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      }

      .table-scroll-container::-webkit-scrollbar {
        height: 8px;
      }

      .table-scroll-container::-webkit-scrollbar-track {
        background: #111827;
        border-radius: 4px;
      }

      .table-scroll-container::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #6366f1, #a855f7);
        border-radius: 4px;
      }

      .table-scroll-container::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(135deg, #4f46e5, #9333ea);
      }

      /* Grille responsive du tableau */
      .table-grid {
        display: grid;
        grid-template-columns: 
          minmax(180px, 1.2fr)   /* Client */
          minmax(200px, 1.2fr)   /* Médecin/Infos */
          minmax(220px, 1.3fr)   /* Articles */
          minmax(120px, 0.9fr)   /* Statut */
          minmax(100px, 0.7fr)   /* Total */
          minmax(180px, 1.1fr);  /* Actions */
        gap: 12px;
        padding: 16px;
        min-width: 1000px;
        align-items: start;
      }

      .table-header {
        background: linear-gradient(135deg, #1e293b, #334155);
        border-radius: 12px 12px 0 0;
        color: #cbd5e1;
        font-weight: 700;
        font-size: 13px;
        position: sticky;
        top: 0;
        z-index: 5;
      }

      .table-row {
        background: #0e1730;
        border-bottom: 1px solid rgba(31, 42, 68, 0.5);
        transition: all 0.3s ease;
      }

      .table-row:hover {
        background: rgba(99, 102, 241, 0.05);
        transform: translateX(4px);
      }

      .table-row:last-child {
        border-bottom: none;
        border-radius: 0 0 12px 12px;
      }

      /* Grilles responsive pour formulaires */
      .r-grid-2 { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
        gap: 12px; 
      }
      
      .r-grid-3 { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
        gap: 12px; 
      }
      
      .r-grid-4 { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); 
        gap: 12px; 
      }

      /* Modale responsive */
      .modal-card { 
        background: linear-gradient(135deg, #1e293b, #0f172a);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        max-width: 95vw;
        width: 1000px;
        max-height: 60vh;
        display: flex;
        flex-direction: column;
        border: 1px solid rgba(99, 102, 241, 0.2);
      }
      
      .modal-body-scroll { 
        overflow-y: auto; 
        overflow-x: hidden;
        flex: 1;
        min-height: 0;
        padding-right: 8px;
      }

      .modal-body-scroll::-webkit-scrollbar {
        width: 6px;
      }

      .modal-body-scroll::-webkit-scrollbar-track {
        background: #111827;
        border-radius: 3px;
      }

      .modal-body-scroll::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #6366f1, #a855f7);
        border-radius: 3px;
      }

      /* Paper card */
      .paper-card {
        background: rgba(14, 23, 48, 0.6);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 16px;
        border: 1px solid rgba(31, 42, 68, 0.8);
      }

      /* Form inputs */
      .form-input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #334155;
        background: rgba(17, 24, 39, 0.8);
        color: #e5edff;
        font-size: 14px;
        transition: all 0.3s ease;
      }

      .form-input:focus {
        outline: none;
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
      }

      .form-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .form-label {
        display: block;
        color: #cbd5e1;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
      }

      /* Onglets responsive */
      .tabs-container {
        display: flex;
        gap: 8px;
        background: #111827;
        padding: 6px;
        border-radius: 12px;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .tabs-container::-webkit-scrollbar {
        height: 4px;
      }

      .tabs-container::-webkit-scrollbar-thumb {
        background: #334155;
        border-radius: 2px;
      }

      .tab-button {
        padding: 10px 16px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        color: #fff;
        font-weight: 700;
        white-space: nowrap;
        transition: all 0.3s ease;
        font-size: 14px;
      }

      .tab-button.active {
        background: linear-gradient(135deg, #6366f1, #a855f7);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
      }

      .tab-button:not(.active) {
        background: transparent;
      }

      .tab-button:not(.active):hover {
        background: rgba(99, 102, 241, 0.1);
      }

      /* Actions flexibles */
      .actions-container {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      /* Empty state */
      .empty-state {
        padding: 60px 20px;
        text-align: center;
        color: #9fb3c8;
      }

      .empty-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
      }

      /* 📱 Media Queries Mobile */
      @media (max-width: 768px) {
        .clients-root {
          padding: 8px;
        }

        .clients-header {
          padding: 12px;
        }

        .fullscreen-table-title {
          font-size: 20px;
          margin-bottom: 12px;
        }

        .table-grid {
          padding: 12px;
          gap: 8px;
        }

        .modal-card {
          padding: 16px;
          max-height: 60vh;
        }

        .tab-button {
          padding: 8px 12px;
          font-size: 13px;
        }

        .r-grid-2,
        .r-grid-3,
        .r-grid-4 {
          grid-template-columns: 1fr;
        }

        .actions-container {
          width: 100%;
        }

        .actions-container button {
          flex: 1;
          min-width: 0;
        }
      }

      @media (max-width: 480px) {
        .clients-root {
          padding: 4px;
        }

        .clients-header {
          padding: 8px;
          margin-bottom: 8px;
        }

        .fullscreen-table-title {
          font-size: 18px;
        }

        .modal-card {
          padding: 12px;
          max-height: 60vh;
        }

        .table-grid {
          padding: 8px;
          min-width: 900px;
        }
      }

      /* Animations */
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .table-row {
        animation: slideIn 0.3s ease;
      }

      /* Scroll hint (indicateur de scroll) */
      .scroll-hint {
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        background: linear-gradient(90deg, transparent, rgba(11, 15, 26, 0.9));
        padding: 20px 10px;
        pointer-events: none;
        color: #6366f1;
        font-size: 24px;
        opacity: 0.6;
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }

      .table-scroll-container:hover .scroll-hint {
        opacity: 0;
      }
    `}</style>
  );

  /* ====================== Realtime: Ordonnances ====================== */
  useEffect(()=>{
    setUiError('');
    if(!societeId) return;
    const ref = collection(db, 'societe', societeId, 'ordonnances');
    const qy = query(ref, orderBy('createdAt','desc'));
    return onSnapshot(
      qy,
      snap => {
        const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}));
        setOrdonnances(arr);
      },
      err => {
        console.error('Erreur listener ordonnances:', err);
        setUiError(err?.code === 'permission-denied'
          ? "Permissions insuffisantes pour lire les ordonnances de cette pharmacie."
          : "Erreur lors de la lecture des ordonnances.");
      }
    );
  },[societeId]);

  /* ====================== Realtime: Stock ====================== */
  useEffect(()=>{
    if(!societeId) return;
    const ref = collection(db, 'societe', societeId, 'stock_entries');
    const qy = query(ref, orderBy('nom'));
    return onSnapshot(
      qy,
      snap=>{
        const list=[];
        snap.forEach(dc=>{
          const d = dc.data();
          list.push({
            id: dc.id,
            nom: d.nom || '',
            prixVente: Number(d.prixVente || 0),
            fournisseur: d.fournisseur || ''
          });
        });
        setStockEntries(list);
      },
      err=>{
        console.error('Erreur listener stock_entries:', err);
      }
    );
  },[societeId]);

  /* ====================== Recherche / Filtres ====================== */
  const filtered = useMemo(()=>{
    const base =
      tab==='nouvelle' ? ordonnances.filter(o=>!o.status || o.status==='nouvelle') :
      tab==='en_preparation' ? ordonnances.filter(o=>o.status==='en_preparation') :
      tab==='pretes' ? ordonnances.filter(o=>o.status==='pretes') :
      ordonnances.filter(o=>o.status==='livree' || o.status==='annulee');

    const s = (qText||'').trim().toLowerCase();
    if(!s) return base;
    return base.filter(o=>{
      const hay = [
        o.numero, o.clientName, o.clientPhone, o.doctorName, o.notes, o.ordonnanceDate
      ].filter(Boolean).join(' ').toLowerCase()
      + ' ' + (o.items||[]).map(it=>(it.productName||'').toLowerCase()).join(' ');
      return hay.includes(s);
    });
  },[ordonnances, tab, qText]);

  /* ====================== Helpers formulaire ====================== */
  const addItemRow = ()=> setForm(f=>({...f, items:[...f.items, {
    productId:'', productName:'', supplier:'', qty:1, dosage:'', unitPrice:'',
    newName:'', newPV:'', newSupplier:''
  }]}));

  const removeItemRow = (idx)=>{
    setForm(f=>{
      const items = f.items.slice(); items.splice(idx,1);
      return {...f, items: items.length?items:[{
        productId:'', productName:'', supplier:'', qty:1, dosage:'', unitPrice:'',
        newName:'', newPV:'', newSupplier:''
      }]};
    });
  };

  const chooseStockProduct = (idx, value)=>{
    setForm(f=>{
      const items = f.items.slice();
      if (value === '__create_inline__') {
        items[idx] = { ...items[idx], productId: '', productName: '', supplier:'', newName:'', newPV:'', newSupplier:'', __showInline: true };
      } else {
        const selected = stockEntries.find(s=>s.id===value);
        items[idx] = {
          ...items[idx],
          productId: value || '',
          productName: selected ? selected.nom : '',
          supplier: selected ? (selected.fournisseur || '') : '',
          unitPrice: items[idx].unitPrice || (selected ? selected.prixVente : ''),
          __showInline: false
        };
      }
      return { ...f, items };
    });
  };

  const updateItemField = (idx, key, val)=>{
    setForm(f=>{
      const items = f.items.slice();
      items[idx] = {...items[idx], [key]: val};
      return {...f, items};
    });
  };

  const createInlineItem = (idx)=>{
    setForm(f=>{
      const items = f.items.slice();
      const it = items[idx];
      const name = String(it.newName || '').trim();
      const pv = Number(it.newPV || 0);
      const fourn = String(it.newSupplier || '').trim();

      if(!name){ alert("Entrez le nom du médicament."); return f; }

      items[idx] = {
        ...it,
        productId: '',
        productName: name,
        supplier: fourn || '',
        unitPrice: it.unitPrice || (Number.isFinite(pv) ? pv : ''),
        __showInline: false,
        newName:'', newPV:'', newSupplier:''
      };
      return { ...f, items };
    });
  };

  const totalBrut = useMemo(()=>{
    let t=0;
    for(const it of form.items){
      const pu = Number(it.unitPrice || 0);
      const q = Number(it.qty || 0);
      if (Number.isFinite(pu) && Number.isFinite(q)) t += pu*q;
    }
    return t;
  },[form.items]);
  
  const totalNet = useMemo(()=>Math.max(0, totalBrut - clampMoney(form.remise) + clampMoney(form.frais)), [totalBrut, form.remise, form.frais]);

  /* ====================== Numéro d'ordonnance ====================== */
  const computeNextNumero = ()=>{
    const prefix = `ORD-${toYYYYMM()}-`;
    const seq = ordonnances
      .map(o=>String(o.numero||''))
      .filter(n=>n.startsWith(prefix))
      .map(n=>Number(n.slice(prefix.length)))
      .filter(Number.isFinite);
    const next = (seq.length ? Math.max(...seq) : 0) + 1;
    return `${prefix}${String(next).padStart(4,'0')}`;
  };

  /* ====================== CRUD Ordonnance ====================== */
  const resetForm = useCallback(()=> setForm({
    numero:'', clientName:'', clientPhone:'', doctorName:'', ordonnanceDate:todayISO(),
    notes:'', priority:'normal', mode:'retrait', address:'', dueAt:'', remise:0, frais:0,
    items:[{
      productId:'', productName:'', supplier:'', qty:1, dosage:'', unitPrice:'',
      newName:'', newPV:'', newSupplier:''
    }],
  }),[]);

  const createOrdonnance = async ()=>{
    if(!societeId) {
      alert("Impossible de créer : votre compte n'est rattaché à aucune pharmacie.");
      return;
    }
    const numero = computeNextNumero();

    const cleanedItems = form.items
      .map(it=>({
        productId: it.productId ? String(it.productId) : '',
        productName: (it.productName||'').trim(),
        supplier: (it.supplier||'').trim(),
        qty: Number(it.qty||0),
        dosage: (it.dosage||'').trim(),
        unitPrice: Number(it.unitPrice || 0),
      }))
      .filter(it => it.productId || it.productName);

    const payload = {
      numero,
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim(),
      doctorName: form.doctorName.trim(),
      ordonnanceDate: form.ordonnanceDate || todayISO(),
      notes: form.notes || '',
      priority: form.priority,
      mode: form.mode,
      address: form.mode==='livraison' ? form.address.trim() : '',
      dueAt: form.dueAt || '',
      remise: clampMoney(form.remise),
      frais: clampMoney(form.frais),
      items: cleanedItems,
      status:'nouvelle',
      totalBrut, totalNet,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      createdBy: user?.uid || null,
    };

    if(!payload.clientName || !payload.clientPhone || cleanedItems.length===0){
      alert('Client, téléphone et au moins un médicament sont requis.');
      return;
    }

    try{
      const ref = collection(db, 'societe', societeId, 'ordonnances');
      const docRef = await addDoc(ref, payload);
      console.log('[ORDO] Créée:', docRef.id);
      setUiNotice(`Ordonnance ${numero} créée.`);
      setTimeout(()=>setUiNotice(''), 2500);
      setCreating(false);
      resetForm();
    }catch(e){
      console.error(e);
      const msg = String(e?.code||'');
      if (msg.includes('permission-denied')) {
        alert("Permissions insuffisantes pour créer une ordonnance dans cette pharmacie.");
      } else {
        alert("Erreur lors de la création de l'ordonnance.");
      }
    }
  };

  const updateStatus = async (id, status, extra={})=>{
    if(!societeId || !id) return;
    try{
      const ref = doc(db, 'societe', societeId, 'ordonnances', id);
      await updateDoc(ref, { status, updatedAt: serverTimestamp(), ...extra });
    }catch(e){
      console.error(e);
      alert('Erreur lors de la mise à jour du statut.');
    }
  };

  const removeOrdonnance = async (id)=>{
    if(!societeId || !id) return;
    if(!window.confirm('Supprimer cette ordonnance ?')) return;
    try{
      const ref = doc(db, 'societe', societeId, 'ordonnances', id);
      await deleteDoc(ref);
    }catch(e){
      console.error(e);
      alert('Erreur lors de la suppression.');
    }
  };

  /* ====================== Actions ====================== */
  const markStartPreparation = async (ord)=>{ await updateStatus(ord.id, 'en_preparation'); };

  const markReadyAndNotify = async (ord)=>{
    const code = makeReadyCode();
    await updateStatus(ord.id, 'pretes', { readyCode: code, readyAt: serverTimestamp(), readyBy: user?.uid || null });

    const phone = phoneToWhatsApp(ord.clientPhone);
    if(!phone){ alert('Numéro de téléphone invalide pour WhatsApp.'); return; }

    const total = Number(ord.totalNet ?? ord.totalBrut ?? 0).toFixed(2);
    const lines = [
      `Bonjour ${ord.clientName || ''},`,
      `Votre ordonnance (${ord.numero || ''}) est prête.`,
      '',
      'Détails :',
      ...(ord.items||[]).map(it=>`• ${it.productName} × ${it.qty}${it.dosage?` — ${it.dosage}`:''}`),
      '',
      `Total: ${total} DHS`,
      `Code de retrait: ${code}`,
      '',
      'Merci de vous présenter avec ce code. — Pharmacie'
    ];
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`,'_blank','noopener,noreferrer');
  };

  const markDeliveredWithCode = async (ord)=>{
    const input = window.prompt(`Saisir le code de retrait pour l'ordonnance ${ord.numero || ''} :`);
    if(!input) return;
    const expected = String(ord.readyCode||'').trim();
    if(!expected){ alert('Aucun code enregistré (ordonnance non "Prête").'); return; }
    if(String(input).trim() !== expected){ alert('Code invalide.'); return; }
    await updateStatus(ord.id, 'livree', { deliveredAt: serverTimestamp(), deliveredBy: user?.uid || null });
  };

  /* ====================== UI ====================== */
  if (!societeId) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div className="paper-card" style={{ maxWidth: 560, textAlign:'center' }}>
          <div style={{ fontSize:24, fontWeight:800, color:'#e5edff', marginBottom:16 }}>
            Clients & Suivi des Ordonnances
          </div>
          <h3 style={{ color:'#e5edff', marginBottom:12 }}>Compte non rattaché</h3>
          <p style={{ color:'#9fb3c8' }}>
            Votre compte n'est rattaché à aucune pharmacie. Demandez au propriétaire de vous inviter, 
            ou rattachez-vous avec un code d'invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="clients-root">
      <Styles />

      {/* Header (sticky) */}
      <div className="clients-header">
        <div className="fullscreen-table-title">Clients & Suivi des Ordonnances</div>

        {/* Bandeaux UI */}
        {uiError && (
          <div style={{margin:'8px 0', padding:'10px 12px', borderRadius:8, background:'#fee2e2', color:'#991b1b', fontWeight:600}}>
            {uiError}
          </div>
        )}
        {uiNotice && (
          <div style={{margin:'8px 0', padding:'10px 12px', borderRadius:8, background:'#dcfce7', color:'#065f46', fontWeight:600}}>
            {uiNotice}
          </div>
        )}

        {/* Barre d'actions */}
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 250px', minWidth:0 }}>
            <input
              className="form-input"
              placeholder="Rechercher (client, téléphone, numéro, produit)…"
              value={qText}
              onChange={(e)=>setQText(e.target.value)}
            />
          </div>
          <button onClick={()=>setCreating(true)} style={{...btn('#10b981','#fff')}}>
            + Nouvelle ordonnance
          </button>
        </div>

        {/* Onglets */}
        <div className="tabs-container">
          {[
            { key:'nouvelle', label:'Nouvelles' },
            { key:'en_preparation', label:'En préparation' },
            { key:'pretes', label:'Prêtes' },
            { key:'terminees', label:'Terminées' },
          ].map(t=>(
            <button
              key={t.key}
              onClick={()=>setTab(t.key)}
              className={`tab-button ${tab===t.key ? 'active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 🆕 Contenu avec scroll horizontal */}
      <div className="clients-content">
        <div className="table-scroll-container" style={{ position:'relative' }}>
          {/* Header du tableau */}
          <div className="table-grid table-header">
            <div>Client</div>
            <div>Médecin / Infos</div>
            <div>Articles</div>
            <div>Statut</div>
            <div>Total</div>
            <div style={{textAlign:'right'}}>Actions</div>
          </div>

          {/* Lignes du tableau */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div style={{ fontSize:18, fontWeight:700, color:'#e5edff', marginBottom:8 }}>
                Aucune ordonnance
              </div>
              <div style={{ color:'#9fb3c8' }}>
                {tab === 'nouvelle' && "Aucune nouvelle ordonnance pour le moment"}
                {tab === 'en_preparation' && "Aucune ordonnance en préparation"}
                {tab === 'pretes' && "Aucune ordonnance prête"}
                {tab === 'terminees' && "Aucune ordonnance terminée"}
              </div>
            </div>
          ) : (
            <>
              {filtered.map(o=>{
                const total = Number(o.totalNet ?? o.totalBrut ?? o.total ?? 0).toFixed(2);
                return (
                  <div key={o.id} className="table-grid table-row">
                    {/* Client */}
                    <div>
                      <div style={{ color:'#e5edff', fontWeight:700, marginBottom:4 }}>
                        {o.clientName}
                      </div>
                      <div style={{ color:'#9fb3c8', fontSize:12, marginBottom:2 }}>
                        {o.clientPhone}
                      </div>
                      <div style={{ color:'#6366f1', fontSize:11, fontWeight:600 }}>
                        {o.numero || '—'}
                      </div>
                    </div>

                    {/* Médecin / Infos */}
                    <div>
                      <div style={{ color:'#e5edff', fontWeight:600, marginBottom:4 }}>
                        {o.doctorName || <i style={{color:'#9fb3c8'}}>—</i>}
                      </div>
                      <div style={{ color:'#9fb3c8', fontSize:12, marginBottom:2 }}>
                        {o.ordonnanceDate || <i>—</i>}
                      </div>
                      {o.dueAt && (
                        <div style={{ color:'#f59e0b', fontSize:12, marginBottom:2 }}>
                          ⏰ Échéance: {new Date(o.dueAt).toLocaleDateString()}
                        </div>
                      )}
                      {o.mode==='livraison' && o.address && (
                        <div style={{ color:'#9fb3c8', fontSize:12, marginTop:4, padding:'4px 8px', background:'rgba(99,102,241,0.1)', borderRadius:6 }}>
                          📍 {o.address}
                        </div>
                      )}
                      {o.notes && (
                        <div style={{ color:'#9fb3c8', fontSize:11, marginTop:4, fontStyle:'italic' }}>
                          💬 {o.notes}
                        </div>
                      )}
                    </div>

                    {/* Articles */}
                    <div>
                      {(o.items||[]).map((it,i)=>(
                        <div key={i} style={{ marginBottom:6, padding:'6px 8px', background:'rgba(17,24,39,0.5)', borderRadius:6, borderLeft:'3px solid #6366f1' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            <span style={{ fontWeight:700, color:'#e5edff', fontSize:13 }}>
                              {it.productName || <i style={{color:'#9fb3c8'}}>Produit</i>}
                            </span>
                            <span style={{ fontSize:12, color:'#9fb3c8' }}>
                              × {it.qty}
                            </span>
                          </div>
                          {it.supplier && (
                            <div style={{ fontSize:11, color:'#6366f1', marginTop:2 }}>
                              🏭 {it.supplier}
                            </div>
                          )}
                          {it.dosage && (
                            <div style={{ fontSize:11, color:'#9fb3c8', marginTop:2 }}>
                              💊 {it.dosage}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Statut */}
                    <div>
                      <StatusBadge status={o.status || 'nouvelle'} />
                      {o.status==='pretes' && o.readyCode && (
                        <div style={{ marginTop:8 }}>
                          <div style={{ fontSize:11, color:'#9fb3c8', marginBottom:2 }}>
                            Code:
                          </div>
                          <code style={{ 
                            background:'linear-gradient(135deg, #6366f1, #a855f7)', 
                            border:'1px solid #4f46e5', 
                            padding:'4px 8px', 
                            borderRadius:6, 
                            color:'#fff',
                            fontWeight:700,
                            fontSize:13
                          }}>
                            {o.readyCode}
                          </code>
                        </div>
                      )}
                    </div>

                    {/* Total */}
                    <div>
                      <div style={{ 
                        color:'#10b981', 
                        fontWeight:800, 
                        fontSize:16,
                        padding:'6px 10px',
                        background:'rgba(16,185,129,0.1)',
                        borderRadius:8,
                        display:'inline-block'
                      }}>
                        {total} DHS
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="actions-container">
                      {(!o.status || o.status==='nouvelle') && (
                        <>
                          <button onClick={()=>markStartPreparation(o)} style={btn('#3b82f6','#fff')}>
                            ▶️ Démarrer
                          </button>
                          <button onClick={()=>updateStatus(o.id,'annulee')} style={btn('transparent','#ef4444',true)}>
                            ✕ Annuler
                          </button>
                        </>
                      )}

                      {o.status==='en_preparation' && (
                        <>
                          <button onClick={()=>markReadyAndNotify(o)} style={btn('#10b981','#fff')} title="Marquer prête et notifier WhatsApp">
                            ✅ Prête
                          </button>
                          <button onClick={()=>updateStatus(o.id,'annulee')} style={btn('transparent','#ef4444',true)}>
                            ✕
                          </button>
                        </>
                      )}

                      {o.status==='pretes' && (
                        <>
                          <button onClick={()=>markReadyAndNotify(o)} style={btn('#3b82f6','#fff')} title="Relancer WhatsApp">
                            📲
                          </button>
                          <button onClick={()=>markDeliveredWithCode(o)} style={btn('#6366f1','#fff')}>
                            ✓ Livrée
                          </button>
                          <button onClick={()=>updateStatus(o.id,'annulee')} style={btn('transparent','#ef4444',true)}>
                            ✕
                          </button>
                        </>
                      )}

                      {(o.status==='livree' || o.status==='annulee') && (
                        <button onClick={()=>removeOrdonnance(o.id)} style={btn('transparent','#e11d48',true)}>
                          🗑️ Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Indicateur de scroll (seulement si > 3 items) */}
              {filtered.length > 3 && (
                <div className="scroll-hint" style={{ display: window.innerWidth < 1000 ? 'block' : 'none' }}>
                  →
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modale création */}
      {creating && (
        <div onClick={()=>setCreating(false)} style={modalBackdrop}>
          <div onClick={(e)=>e.stopPropagation()} className="paper-card modal-card">
            <div style={modalTitle}>Nouvelle ordonnance</div>

            <div className="modal-body-scroll">
              <div style={{ display:'grid', gap:12 }}>
                {/* Client */}
                <div className="r-grid-2">
                  <div>
                    <label className="form-label">Client</label>
                    <input className="form-input" value={form.clientName}
                      onChange={(e)=>setForm(f=>({...f,clientName:e.target.value}))} placeholder="Nom du client / patient" />
                  </div>
                  <div>
                    <label className="form-label">Téléphone (WhatsApp)</label>
                    <input className="form-input" value={form.clientPhone}
                      onChange={(e)=>setForm(f=>({...f,clientPhone:e.target.value}))} placeholder="Ex: 06..." />
                  </div>
                </div>

                {/* Médecin / Date */}
                <div className="r-grid-2">
                  <div>
                    <label className="form-label">Médecin</label>
                    <input className="form-input" value={form.doctorName}
                      onChange={(e)=>setForm(f=>({...f,doctorName:e.target.value}))} placeholder="Nom du médecin" />
                  </div>
                  <div>
                    <label className="form-label">Date ordonnance</label>
                    <input type="date" className="form-input" value={form.ordonnanceDate}
                      onChange={(e)=>setForm(f=>({...f,ordonnanceDate:e.target.value}))} />
                  </div>
                </div>

                {/* Priorité / Mode / Adresse / Échéance */}
                <div className="r-grid-4">
                  <div>
                    <label className="form-label">Priorité</label>
                    <select className="form-input" value={form.priority}
                      onChange={(e)=>setForm(f=>({...f,priority:e.target.value}))}>
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Mode</label>
                    <select className="form-input" value={form.mode}
                      onChange={(e)=>setForm(f=>({...f,mode:e.target.value}))}>
                      <option value="retrait">Retrait</option>
                      <option value="livraison">Livraison</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Adresse (si livraison)</label>
                    <input className="form-input" value={form.address}
                      onChange={(e)=>setForm(f=>({...f,address:e.target.value}))}
                      placeholder="Adresse du client" disabled={form.mode!=='livraison'} />
                  </div>
                  <div>
                    <label className="form-label">Échéance</label>
                    <input type="datetime-local" className="form-input" value={form.dueAt}
                      onChange={(e)=>setForm(f=>({...f,dueAt:e.target.value}))} />
                  </div>
                </div>

                {/* Remise / Frais / Notes */}
                <div className="r-grid-2">
                  <div>
                    <label className="form-label">Remise (DHS)</label>
                    <input type="number" min={0} className="form-input" value={form.remise}
                      onChange={(e)=>setForm(f=>({...f,remise:Number(e.target.value)}))} />
                  </div>
                  <div>
                    <label className="form-label">Frais de service (DHS)</label>
                    <input type="number" min={0} className="form-input" value={form.frais}
                      onChange={(e)=>setForm(f=>({...f,frais:Number(e.target.value)}))} />
                  </div>
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={form.notes}
                    onChange={(e)=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Infos supplémentaires…" />
                </div>

                {/* Items */}
                <div className="paper-card" style={{ background:'#0b1220', border:'1px solid #1f2a44' }}>
                  <div style={{ fontWeight:800, color:'#e5edff', marginBottom:8 }}>Médicaments / Produits</div>

                  <div style={{ display:'grid', gap:10 }}>
                    {form.items.map((it, idx)=>(
                      <div key={idx} className="r-grid-4" style={{ alignItems:'start' }}>
                        {/* Sélecteur */}
                        <div>
                          <label className="form-label">Depuis le stock / Nouveau</label>
                          <select
                            className="form-input"
                            value={it.__showInline ? '__create_inline__' : (it.productId || '')}
                            onChange={(e)=>chooseStockProduct(idx, e.target.value)}
                          >
                            <option value="">— Choisir un article (existant) —</option>
                            {stockEntries.map(p=>(
                              <option key={p.id} value={p.id}>
                                {p.nom} — PV: {p.prixVente.toFixed(2)} — {p.fournisseur || '—'}
                              </option>
                            ))}
                            <option value="__create_inline__">➕ Nouveau médicament (sans stock)</option>
                          </select>

                          {/* Bloc création locale */}
                          {it.__showInline && (
                            <div style={{ marginTop:8, padding:10, border:'1px dashed #334155', borderRadius:8 }}>
                              <div className="r-grid-3">
                                <input className="form-input" placeholder="Nom du médicament" value={it.newName}
                                  onChange={(e)=>updateItemField(idx,'newName',e.target.value)} />
                                <input className="form-input" type="number" min={0} placeholder="Prix unitaire (DHS)" value={it.newPV}
                                  onChange={(e)=>updateItemField(idx,'newPV',e.target.value)} />
                                <input className="form-input" placeholder="Fournisseur (optionnel)" value={it.newSupplier}
                                  onChange={(e)=>updateItemField(idx,'newSupplier',e.target.value)} />
                              </div>
                              <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                                <button onClick={()=>createInlineItem(idx)} style={btn('#0ea5e9','#fff')}>Insérer</button>
                                <button onClick={()=>{
                                  updateItemField(idx,'__showInline',false);
                                  updateItemField(idx,'newName','');
                                  updateItemField(idx,'newPV','');
                                  updateItemField(idx,'newSupplier','');
                                }} style={btn('transparent','#9fb3c8',true,'#334155')}>Annuler</button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Prix unitaire */}
                        <div>
                          <label className="form-label">Prix unitaire (DHS)</label>
                          <input className="form-input" type="number" min={0} value={it.unitPrice}
                            onChange={(e)=>updateItemField(idx,'unitPrice',e.target.value)} placeholder="0.00" />
                          {it.supplier && <div style={{ fontSize:11, color:'#6366f1', marginTop:4 }}>
                            🏭 {it.supplier}
                          </div>}
                        </div>

                        {/* Quantité */}
                        <div>
                          <label className="form-label">Quantité</label>
                          <input type="number" min={1} className="form-input" value={it.qty}
                            onChange={(e)=>updateItemField(idx,'qty',Number(e.target.value))} />
                        </div>

                        {/* Actions */}
                        <div style={{ display:'flex', gap:6, paddingTop:28 }}>
                          <button onClick={()=>removeItemRow(idx)} style={btn('transparent','#ef4444',true)} title="Supprimer ligne">
                            🗑️
                          </button>
                        </div>

                        {/* Posologie */}
                        <div style={{ gridColumn:'1 / -1' }}>
                          <label className="form-label">Posologie</label>
                          <input className="form-input" value={it.dosage}
                            onChange={(e)=>updateItemField(idx,'dosage',e.target.value)}
                            placeholder="ex: 1 cp x 3/j pendant 5j" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:12, flexWrap:'wrap', gap:10, alignItems:'center' }}>
                    <button onClick={addItemRow} style={btn('#111827','#fff',false,'#334155')}>+ Ajouter un article</button>
                    <div style={{ color:'#e5edff', fontWeight:800, fontSize:14 }}>
                      Total brut: <span style={{color:'#10b981'}}>{totalBrut.toFixed(2)}</span> DHS • 
                      Total net: <span style={{color:'#10b981'}}>{totalNet.toFixed(2)}</span> DHS
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions bas modale */}
            <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'flex-end', flexWrap:'wrap' }}>
              <button onClick={()=>setCreating(false)} style={btn('transparent','#9fb3c8',true,'#334155')}>Annuler</button>
              <button onClick={createOrdonnance} style={btn('#10b981','#fff')}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
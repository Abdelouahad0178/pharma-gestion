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
    <span style={{display:'inline-block',padding:'4px 10px',borderRadius:999,background:`${color}22`,color,fontWeight:600,fontSize:12}}>
      {statusLabel[status] || status}
    </span>
  );
};
function btn(bg, color, outlined=false, borderColor){
  return {
    padding:'10px 12px', borderRadius:8,
    border: outlined ? `1px solid ${borderColor || color}` : 'none',
    background: outlined ? 'transparent' : bg,
    color, fontWeight:700, cursor:'pointer'
  };
}
const modalBackdrop = { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 };
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
    mode: 'retrait',  // retrait | livraison
    address: '',
    dueAt: '',
    remise: 0,
    frais: 0,
    items: [{
      productId:'',       // id stock (si existant) — sinon vide pour "local"
      productName:'',     // nom affiché
      supplier:'',        // fournisseur (copié du stock si existant, sinon saisi)
      qty:1,
      dosage:'',
      unitPrice:'',       // prix unitaire pour l’ordonnance

      // champs pour création "locale" (sans stock)
      newName:'',
      newPV:'',
      newSupplier:''
    }],
  });

  /* ==================== Styles (responsive + scroll) ==================== */
  const Styles = () => (
    <style>{`
      .clients-root { min-height: 100vh; display: flex; flex-direction: column; }
      .clients-header { position: sticky; top: 0; z-index: 5; background: #0b0f1a; padding-bottom: 8px; }
      .clients-content { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
      .table-wrap { overflow-x: auto; }
      .r-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
      .r-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
      .r-grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
      .modal-card { max-width: 1000px; width: 95%; max-height: 60vh; display: flex; flex-direction: column; padding: 16px; }
      .modal-body-scroll { overflow-y: auto; min-height: 0; }
      @media (max-width: 480px) { .modal-card { padding: 12px;max-height: 41vh; } }
    `}</style>
  );

  /* ====================== Realtime: Ordonnances ====================== */
  useEffect(()=>{
    setUiError('');
    if(!societeId) return;
    // 'societe' (singulier)
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

  /* ====================== Realtime: Stock (nom + PV + fournisseur) ====================== */
  useEffect(()=>{
    if(!societeId) return;
    const ref = collection(db, 'societe', societeId, 'stock_entries'); // "societe" (singulier)
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
        // On ne remonte pas en UI (optionnel) car c’est “confort”
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

  // Choisir un produit existant → copie nom, fournisseur + préremplit le prix unitaire avec PV (modifiable)
  const chooseStockProduct = (idx, value)=>{
    setForm(f=>{
      const items = f.items.slice();
      if (value === '__create_inline__') {
        // Mode "Nouveau (sans stock)"
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

  // Création "locale" : n'ajoute PAS au stock — juste remplir la ligne d'ordonnance
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
        productId: '',             // pas de lien au stock
        productName: name,
        supplier: fourn || '',
        unitPrice: it.unitPrice || (Number.isFinite(pv) ? pv : ''),
        // on masque le bloc inline et on nettoie
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

  /* ====================== Numéro d’ordonnance ====================== */
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
      alert("Impossible de créer : votre compte n’est rattaché à aucune pharmacie.");
      return;
    }
    const numero = computeNextNumero();

    // On ignore les lignes complètement vides (ni id ni nom)
    const cleanedItems = form.items
      .map(it=>({
        productId: it.productId ? String(it.productId) : '',
        productName: (it.productName||'').trim(),
        supplier: (it.supplier||'').trim(),
        qty: Number(it.qty||0),
        dosage: (it.dosage||'').trim(),
        unitPrice: Number(it.unitPrice || 0),
      }))
      .filter(it => it.productId || it.productName); // garder si lié au stock OU saisi localement

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
      alert('Client, téléphone et au moins un médicament (existant du stock ou saisi localement) sont requis.');
      return;
    }

    try{
      // 'societe' (singulier)
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
        alert("Erreur lors de la création de l’ordonnance.");
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
      `Total: ${total} MAD`,
      `Code de retrait: ${code}`,
      '',
      'Merci de vous présenter avec ce code. — Pharmacie'
    ];
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`,'_blank','noopener,noreferrer');
  };

  const markDeliveredWithCode = async (ord)=>{
    const input = window.prompt(`Saisir le code de retrait pour l’ordonnance ${ord.numero || ''} :`);
    if(!input) return;
    const expected = String(ord.readyCode||'').trim();
    if(!expected){ alert('Aucun code enregistré (ordonnance non "Prête").'); return; }
    if(String(input).trim() !== expected){ alert('Code invalide.'); return; }
    await updateStatus(ord.id, 'livree', { deliveredAt: serverTimestamp(), deliveredBy: user?.uid || null });
  };

  /* ====================== UI ====================== */

  // 🔒 Garde explicite si le compte n’est pas rattaché à une pharmacie
  if (!societeId) {
    return (
      <div className="fullscreen-table-wrap" style={{ padding: 20 }}>
        <div className="fullscreen-table-title">Clients & Suivi des Ordonnances</div>
        <div className="paper-card" style={{ maxWidth: 560, margin: '20px auto' }}>
          <h3>Compte non rattaché</h3>
          <p>Votre compte n’est rattaché à aucune pharmacie. Demandez au propriétaire de vous inviter, ou rattachez-vous avec un code d’invitation.</p>
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

        {/* Barre d’actions */}
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <input
              className="form-input"
              placeholder="Rechercher (client, téléphone, numéro, produit)…"
              value={qText}
              onChange={(e)=>setQText(e.target.value)}
            />
          </div>
          <button onClick={()=>setCreating(true)} style={{...btn('#10b981','#fff'), whiteSpace:'nowrap'}}>
            + Nouvelle ordonnance
          </button>
        </div>

        {/* Onglets */}
        <div style={{ display:'flex', gap:8, marginBottom:8, background:'#111827', padding:6, borderRadius:10 }}>
          {[
            { key:'nouvelle', label:'Nouvelles' },
            { key:'en_preparation', label:'En préparation' },
            { key:'pretes', label:'Prêtes' },
            { key:'terminees', label:'Terminées' },
          ].map(t=>(
            <button
              key={t.key}
              onClick={()=>setTab(t.key)}
              style={{
                padding:'10px 14px',
                borderRadius:8,
                border:'none',
                cursor:'pointer',
                color:'#fff',
                fontWeight:700,
                background: tab===t.key ? 'linear-gradient(135deg,#6366f1,#a855f7)' : 'transparent'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu scrollable */}
      <div className="clients-content">
        <div className="paper-card table-wrap" style={{ padding:0, overflow:'hidden' }}>
          {/* En-tête tableau */}
          <div style={{
            display:'grid', gridTemplateColumns:'1.2fr 1.2fr 1.3fr 0.9fr 0.7fr 1.1fr',
            background:'#0b1220', color:'#9fb3c8', padding:'12px 16px', fontWeight:700, fontSize:13, minWidth:780
          }}>
            <div>Client</div>
            <div>Médecin / Infos</div>
            <div>Articles</div>
            <div>Statut</div>
            <div>Total</div>
            <div style={{textAlign:'right'}}>Actions</div>
          </div>

          {filtered.length===0 && <div style={{ padding:20, color:'#9fb3c8' }}>Aucun élément.</div>}

          {filtered.map(o=>{
            const total = Number(o.totalNet ?? o.totalBrut ?? o.total ?? 0).toFixed(2);
            return (
              <div key={o.id} style={{
                display:'grid', gridTemplateColumns:'1.2fr 1.2fr 1.3fr 0.9fr 0.7fr 1.1fr',
                padding:'12px 16px', borderTop:'1px solid #1f2a44', alignItems:'center', background:'#0e1730', minWidth:780
              }}>
                {/* Client */}
                <div>
                  <div style={{ color:'#e5edff', fontWeight:700 }}>
                    {o.clientName} <span style={{opacity:.6, fontWeight:500}}>({o.numero||'—'})</span>
                  </div>
                  <div style={{ color:'#9fb3c8', fontSize:12 }}>{o.clientPhone}</div>
                </div>

                {/* Médecin / Infos */}
                <div>
                  <div style={{ color:'#e5edff', fontWeight:600 }}>{o.doctorName || <i style={{color:'#9fb3c8'}}>—</i>}</div>
                  <div style={{ color:'#9fb3c8', fontSize:12, marginTop:2 }}>
                    {o.ordonnanceDate || <i>—</i>}
                    {o.dueAt ? <span style={{marginLeft:8}}>• Échéance: {new Date(o.dueAt).toLocaleString()}</span> : null}
                  </div>
                  {o.mode==='livraison' && o.address ? (
                    <div style={{ color:'#9fb3c8', fontSize:12, marginTop:6 }}>Adresse: {o.address}</div>
                  ) : null}
                  {o.notes ? <div style={{ color:'#9fb3c8', fontSize:12, marginTop:6 }}>{o.notes}</div> : null}
                </div>

                {/* Articles */}
                <div style={{ color:'#e5edff' }}>
                  {(o.items||[]).map((it,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ fontWeight:600 }}>{it.productName || <i style={{color:'#9fb3c8'}}>Produit</i>}</span>
                      {it.supplier ? <span style={{ fontSize:11, color:'#9fb3c8' }}>• Fournisseur: {it.supplier}</span> : null}
                      <span style={{ fontSize:12, color:'#9fb3c8' }}>× {it.qty}{it.dosage?` • ${it.dosage}`:''}</span>
                    </div>
                  ))}
                </div>

                {/* Statut */}
                <div>
                  <StatusBadge status={o.status || 'nouvelle'} />
                  {o.status==='pretes' && o.readyCode ? (
                    <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:12, color:'#9fb3c8' }}>Code:</span>
                      <code style={{ background:'#111827', border:'1px solid #1f2a44', padding:'2px 6px', borderRadius:6, color:'#e5edff' }}>
                        {o.readyCode}
                      </code>
                    </div>
                  ) : null}
                </div>

                {/* Total */}
                <div style={{ color:'#e5edff', fontWeight:700 }}>{total} MAD</div>

                {/* Actions */}
                <div style={{ textAlign:'right', display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
                  {(!o.status || o.status==='nouvelle') && (
                    <>
                      <button onClick={()=>markStartPreparation(o)} style={btn('transparent','#3b82f6',true)}>Démarrer</button>
                      <button onClick={()=>updateStatus(o.id,'annulee')} style={btn('transparent','#ef4444',true)}>Annuler</button>
                    </>
                  )}

                  {o.status==='en_preparation' && (
                    <>
                      <button onClick={()=>markReadyAndNotify(o)} style={btn('#10b981','#fff')} title="Marquer prête et notifier WhatsApp">
                        ✅ Prête + WhatsApp
                      </button>
                      <button onClick={()=>updateStatus(o.id,'annulee')} style={btn('transparent','#ef4444',true)}>Annuler</button>
                    </>
                  )}

                  {o.status==='pretes' && (
                    <>
                      <button onClick={()=>markReadyAndNotify(o)} style={btn('#3b82f6','#fff')} title="Relancer WhatsApp">📲 Relancer</button>
                      <button onClick={()=>markDeliveredWithCode(o)} style={btn('#6366f1','#fff')}>Marquer livrée</button>
                      <button onClick={()=>updateStatus(o.id,'annulee')} style={btn('transparent','#ef4444',true)}>Annuler</button>
                    </>
                  )}

                  {(o.status==='livree' || o.status==='annulee') && (
                    <button onClick={()=>removeOrdonnance(o.id)} style={btn('transparent','#e11d48',true)}>Supprimer</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modale création — scroll vertical interne */}
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
                      onChange={(e)=>setForm(f=>({...f,clientPhone:e.target.value}))} placeholder="Ex: +2126..." />
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
                    <label className="form-label">Remise (MAD)</label>
                    <input type="number" min={0} className="form-input" value={form.remise}
                      onChange={(e)=>setForm(f=>({...f,remise:Number(e.target.value)}))} />
                  </div>
                  <div>
                    <label className="form-label">Frais de service (MAD)</label>
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
                        {/* Sélecteur depuis le stock + option "Nouveau (sans stock)" */}
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
                                {p.nom} — PV: {p.prixVente.toFixed(2)} — Fournisseur: {p.fournisseur || '—'}
                              </option>
                            ))}
                            <option value="__create_inline__">➕ Nouveau médicament (sans stock)</option>
                          </select>

                          {/* Bloc création locale (n'écrit pas en DB stock) */}
                          {it.__showInline && (
                            <div style={{ marginTop:8, padding:10, border:'1px dashed #334155', borderRadius:8 }}>
                              <div className="r-grid-3">
                                <input className="form-input" placeholder="Nom du médicament" value={it.newName}
                                  onChange={(e)=>updateItemField(idx,'newName',e.target.value)} />
                                <input className="form-input" type="number" min={0} placeholder="Prix unitaire (MAD)" value={it.newPV}
                                  onChange={(e)=>updateItemField(idx,'newPV',e.target.value)} />
                                <input className="form-input" placeholder="Fournisseur (optionnel)" value={it.newSupplier}
                                  onChange={(e)=>updateItemField(idx,'newSupplier',e.target.value)} />
                              </div>
                              <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                                <button onClick={()=>createInlineItem(idx)} style={btn('#0ea5e9','#fff')}>Insérer dans l’ordonnance</button>
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

                        {/* Prix unitaire (ordonnance) */}
                        <div>
                          <label className="form-label">Prix unitaire (MAD)</label>
                          <input className="form-input" type="number" min={0} value={it.unitPrice}
                            onChange={(e)=>updateItemField(idx,'unitPrice',e.target.value)} placeholder="0.00" />
                          {it.supplier ? <div style={{ fontSize:11, color:'#9fb3c8', marginTop:4 }}>
                            Fournisseur: {it.supplier}
                          </div> : null}
                        </div>

                        {/* Quantité */}
                        <div>
                          <label className="form-label">Quantité</label>
                          <input type="number" min={1} className="form-input" value={it.qty}
                            onChange={(e)=>updateItemField(idx,'qty',Number(e.target.value))} />
                        </div>

                        {/* Actions ligne */}
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>removeItemRow(idx)} style={btn('transparent','#ef4444',true)} title="Supprimer ligne">−</button>
                        </div>

                        {/* Posologie (ligne complète) */}
                        <div style={{ gridColumn:'1 / -1' }}>
                          <label className="form-label">Posologie</label>
                          <input className="form-input" value={it.dosage}
                            onChange={(e)=>updateItemField(idx,'dosage',e.target.value)}
                            placeholder="ex: 1 cp x 3/j pendant 5j" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:12, flexWrap:'wrap', gap:10 }}>
                    <button onClick={addItemRow} style={btn('#111827','#fff',false,'#334155')}>+ Ajouter un article</button>
                    <div style={{ color:'#e5edff', fontWeight:800 }}>
                      Total brut: {totalBrut.toFixed(2)} MAD • Total net: {totalNet.toFixed(2)} MAD
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions bas modale */}
            <div style={{ display:'flex', gap:8, marginTop:12, justifyContent:'flex-end', flexWrap:'wrap' }}>
              <button onClick={()=>setCreating(false)} style={btn('transparent','#9fb3c8',true,'#334155')}>Annuler</button>
              <button onClick={createOrdonnance} style={btn('#10b981','#fff')}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

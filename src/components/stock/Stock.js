
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";

// -------- Utils --------
function safeNumber(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function safeParseDate(dateInput) {
  if (!dateInput) return null;
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === "function") {
      return dateInput.toDate();
    }
    if (dateInput?.seconds) {
      return new Date(dateInput.seconds * 1000);
    }
    if (dateInput instanceof Date) return dateInput;
    if (typeof dateInput === "string" || typeof dateInput === "number") {
      const d = new Date(dateInput);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}
function formatDateSafe(dateInput) {
  const d = safeParseDate(dateInput);
  return d ? d.toLocaleDateString("fr-FR") : "";
}
function getDateInputValue(dateInput) {
  const d = safeParseDate(dateInput);
  if (!d) return "";
  return d.toISOString().split("T")[0];
}

// Simple beep feedback (optional)
function useBeeps() {
  const ctxRef = useRef(null);
  const getCtx = () => {
    if (!ctxRef.current) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) {
        try { ctxRef.current = new C(); } catch {}
      }
    }
    return ctxRef.current;
  };
  const play = useCallback((freq = 880, dur = 120, type = "sine", vol = 0.12) => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume?.();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => { try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch {} }, dur);
    } catch {}
  }, []);
  const ok = useCallback(() => { play(1175, 90); setTimeout(() => play(1568, 110), 100); }, [play]);
  const err = useCallback(() => play(220, 220, "square", 0.2), [play]);

  useEffect(() => {
    const unlock = () => { try { getCtx()?.resume?.(); } catch {} };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }, []);

  return { ok, err };
}

// -------- Component --------
export default function Stocks() {
  const { user, societeId, loading } = useUserRole();
  const [waiting, setWaiting] = useState(true);

  // lots in stock_entries
  const [lots, setLots] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  // form fields
  const [nom, setNom] = useState("");
  const [numeroLot, setNumeroLot] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [quantite, setQuantite] = useState(0);
  const [prixAchat, setPrixAchat] = useState(0);
  const [prixVente, setPrixVente] = useState(0);
  const [datePeremption, setDatePeremption] = useState("");
  const [codeBarre, setCodeBarre] = useState("");

  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  const { ok: beepOk, err: beepErr } = useBeeps();

  // ---- Effects order carefully set to avoid "before initialization" issues ----
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  const fetchLots = useCallback(async () => {
    if (!societeId) {
      setLots([]);
      return;
    }
    try {
      const qy = query(collection(db, "societe", societeId, "stock_entries"), orderBy("nom"));
      const snap = await getDocs(qy);
      const arr = [];
      snap.forEach((d) => {
        const data = d.data();
        delete data._exportedAt;
        delete data._collection;
        arr.push({ id: d.id, ...data });
      });
      setLots(arr);
    } catch (e) {
      console.error(e);
      setError("Erreur de chargement du stock");
    }
  }, [societeId]);

  useEffect(() => { fetchLots(); }, [fetchLots]);

  // Keyboard wedge scanning -> fills codeBarre field when form is open
  useEffect(() => {
    const opts = { minChars: 6, endKey: "Enter", timeoutMs: 250 };
    const state = { buf: "", timer: null };

    const onKeyDown = (e) => {
      if (!showForm) return; // only when form open
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === opts.endKey) {
        const code = state.buf;
        state.buf = "";
        clearTimeout(state.timer);
        if (code && code.length >= opts.minChars) {
          setCodeBarre(code);
          beepOk();
        }
        return;
      }
      if (e.key && e.key.length === 1) {
        state.buf += e.key;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
          const code = state.buf;
          state.buf = "";
          if (code && code.length >= opts.minChars) {
            setCodeBarre(code);
            beepOk();
          }
        }, opts.timeoutMs);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(state.timer);
    };
  }, [showForm, beepOk]);

  const resetForm = useCallback(() => {
    setNom("");
    setNumeroLot("");
    setFournisseur("");
    setQuantite(0);
    setPrixAchat(0);
    setPrixVente(0);
    setDatePeremption("");
    setCodeBarre("");
    setIsEditing(false);
    setEditId(null);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  const openEdit = useCallback((lot) => {
    setNom(lot.nom || lot.name || "");
    setNumeroLot(lot.numeroLot || "");
    setFournisseur(lot.fournisseur || "");
    setQuantite(safeNumber(lot.quantite));
    setPrixAchat(safeNumber(lot.prixAchat));
    setPrixVente(safeNumber(lot.prixVente));
    setDatePeremption(getDateInputValue(lot.datePeremption));
    setCodeBarre(lot.codeBarre || "");
    setIsEditing(true);
    setEditId(lot.id);
    setShowForm(true);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    if (!user || !societeId) return;
    if (!nom || !numeroLot || safeNumber(quantite) < 0) {
      setError("Veuillez remplir les champs obligatoires (Nom, N° lot, Quantité)");
      beepErr();
      return;
    }
    setError("");
    try {
      const payload = {
        nom: nom.trim(),
        numeroLot: numeroLot.trim(),
        fournisseur: fournisseur.trim() || null,
        quantite: safeNumber(quantite),
        prixAchat: safeNumber(prixAchat),
        prixVente: safeNumber(prixVente),
        datePeremption: datePeremption ? Timestamp.fromDate(new Date(datePeremption)) : null,
        codeBarre: codeBarre ? String(codeBarre).trim() : null,
        updatedAt: Timestamp.now(),
        updatedBy: user.email || user.uid,
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "societe", societeId, "stock_entries", editId), payload);
        setSuccess("Lot mis à jour");
      } else {
        await addDoc(collection(db, "societe", societeId, "stock_entries"), {
          ...payload,
          createdAt: Timestamp.now(),
          createdBy: user.email || user.uid,
        });
        setSuccess("Lot ajouté");
      }
      beepOk();
      setShowForm(false);
      resetForm();
      await fetchLots();
      setTimeout(() => setSuccess(""), 1800);
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'enregistrement");
      beepErr();
    }
  }, [user, societeId, nom, numeroLot, fournisseur, quantite, prixAchat, prixVente, datePeremption, codeBarre, isEditing, editId, fetchLots, beepOk, beepErr, resetForm]);

  const handleDelete = useCallback(async (lot) => {
    if (!user || !societeId) return;
    if (!window.confirm(`Supprimer le lot ${lot.numeroLot} de ${lot.nom} ?`)) return;
    try {
      await deleteDoc(doc(db, "societe", societeId, "stock_entries", lot.id));
      setSuccess("Lot supprimé");
      beepOk();
      await fetchLots();
      setTimeout(() => setSuccess(""), 1600);
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la suppression");
      beepErr();
    }
  }, [user, societeId, fetchLots, beepOk, beepErr]);

  const lotsFiltres = useMemo(() => {
    if (!search) return lots;
    const s = search.toLowerCase().trim();
    return lots.filter((l) => {
      const nom = (l.nom || "").toLowerCase();
      const nlot = (l.numeroLot || "").toLowerCase();
      const fr = (l.fournisseur || "").toLowerCase();
      const cb = (l.codeBarre || "").toString().toLowerCase();
      return nom.includes(s) || nlot.includes(s) || fr.includes(s) || cb.includes(s);
    });
  }, [lots, search]);

  // onDetected used by camera modal
  const onBarcodeDetected = useCallback((code) => {
    if (!code) return;
    setCodeBarre(String(code));
    setShowScanner(false);
    setShowForm(true);
    beepOk();
  }, [beepOk]);

  // -------- Rendering --------
  if (waiting) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div>Chargement…</div>
      </div>
    );
  }
  if (!user || !societeId) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div>Accès non autorisé.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eef2ff,#fdf2f8)", padding: 20, fontFamily: '"Inter",-apple-system,BlinkMacSystemFont,sans-serif' }}>
      {/* Header */}
      <div style={{ background: "rgba(255,255,255,.95)", borderRadius: 20, padding: 20, marginBottom: 16, boxShadow: "0 10px 30px rgba(0,0,0,.05)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, background: "linear-gradient(135deg,#6366f1,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Stock (Lots)</h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280" }}>Gérer vos lots avec code-barres et dates d'expiration.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, lot, fournisseur, code-barres…"
              style={{ padding: "10px 14px", borderRadius: 12, border: "2px solid #e5e7eb", minWidth: 280, outline: "none" }}
            />
            <button
              onClick={openCreate}
              style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: 12, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}
            >
              + Ajouter un article (lot)
            </button>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div style={{ background: "rgba(254,226,226,.9)", color: "#b91c1c", padding: 12, borderRadius: 12, marginBottom: 12, border: "1px solid rgba(185,28,28,.2)" }}>
          {error} <button onClick={() => setError("")} style={{ marginLeft: 8, border: "none", background: "transparent", cursor: "pointer" }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ background: "rgba(220,252,231,.9)", color: "#166534", padding: 12, borderRadius: 12, marginBottom: 12, border: "1px solid rgba(22,101,52,.2)" }}>
          {success} <button onClick={() => setSuccess("")} style={{ marginLeft: 8, border: "none", background: "transparent", cursor: "pointer" }}>×</button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={{ background: "rgba(255,255,255,.95)", borderRadius: 20, padding: 20, marginBottom: 16, boxShadow: "0 10px 30px rgba(0,0,0,.05)", border: "1px solid rgba(0,0,0,.03)" }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>{isEditing ? "Modifier le lot" : "Ajouter un lot"}</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Nom *</label>
                <input value={nom} onChange={(e) => setNom(e.target.value)} required style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>N° lot *</label>
                <input value={numeroLot} onChange={(e) => setNumeroLot(e.target.value)} required style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Fournisseur</label>
                <input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Quantité *</label>
                <input type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} min={0} required style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Prix achat (DH)</label>
                <input type="number" step="0.01" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Prix vente (DH)</label>
                <input type="number" step="0.01" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Date d'expiration</label>
                <input type="date" value={datePeremption} onChange={(e) => setDatePeremption(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Code-barres</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={codeBarre}
                    onChange={(e) => setCodeBarre(e.target.value)}
                    placeholder="Scannez ou saisissez"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "2px solid #e5e7eb" }}
                  />
                  <button type="button" onClick={() => setShowScanner(true)} style={{ whiteSpace: "nowrap", borderRadius: 10, border: "2px solid #e5e7eb", background: "#111827", color: "#fff", padding: "10px 12px", cursor: "pointer" }}>
                    📷 Scanner
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button type="submit" style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>
                {isEditing ? "Mettre à jour" : "Enregistrer"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} style={{ background: "transparent", border: "2px solid #e5e7eb", borderRadius: 12, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "rgba(255,255,255,.95)", borderRadius: 20, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.05)" }}>
        <div style={{ overflowX: "auto", maxHeight: "72vh", overflowY: "auto" }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "linear-gradient(135deg,#1f2937,#111827)", color: "#fff", zIndex: 1 }}>
              <tr>
                <th style={{ padding: 14, textAlign: "left" }}>Nom</th>
                <th style={{ padding: 14, textAlign: "left" }}>N° lot</th>
                <th style={{ padding: 14, textAlign: "left" }}>Fournisseur</th>
                <th style={{ padding: 14, textAlign: "center" }}>Qté</th>
                <th style={{ padding: 14, textAlign: "right" }}>Prix vente</th>
                <th style={{ padding: 14, textAlign: "center" }}>Expiration</th>
                <th style={{ padding: 14, textAlign: "left" }}>Code-barres</th>
                <th style={{ padding: 14, textAlign: "center", width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lotsFiltres.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Aucun lot</td>
                </tr>
              ) : (
                lotsFiltres.map((l, idx) => {
                  const d = safeParseDate(l.datePeremption);
                  const expired = d && d < new Date();
                  const expSoon = d && !expired && d <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  return (
                    <tr key={l.id} style={{ background: idx % 2 ? "rgba(249,250,251,.6)" : "white", borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 12, fontWeight: 600 }}>{l.nom}</td>
                      <td style={{ padding: 12 }}>{l.numeroLot}</td>
                      <td style={{ padding: 12 }}>{l.fournisseur || "-"}</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{safeNumber(l.quantite)}</td>
                      <td style={{ padding: 12, textAlign: "right" }}>{Number(l.prixVente || 0).toFixed(2)} DH</td>
                      <td style={{ padding: 12, textAlign: "center", fontWeight: 600, color: expired ? "#dc2626" : expSoon ? "#d97706" : "#065f46" }}>
                        {formatDateSafe(l.datePeremption) || "-"}
                        {expired ? " ⚠️" : expSoon ? " ⏰" : ""}
                      </td>
                      <td style={{ padding: 12, fontFamily: "monospace" }}>{l.codeBarre || "-"}</td>
                      <td style={{ padding: 12, textAlign: "center" }}>
                        <button onClick={() => openEdit(l)} style={{ marginRight: 8, background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
                          ✏️ Éditer
                        </button>
                        <button onClick={() => handleDelete(l)} style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
                          🗑️ Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Camera Scanner Modal */}
      <CameraBarcodeInlineModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={onBarcodeDetected}
      />
    </div>
  );
}

// ---- Camera Barcode Modal (function declaration to allow hoisting in JSX use) ----
function CameraBarcodeInlineModal({ open, onClose, onDetected }) {
  const videoRef = React.useRef(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let stream;
    let stopRequested = false;
    let rafId = null;
    let reader = null;
    let controls = null;

    async function start() {
      setError("");
      try {
        if (!open) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if ("BarcodeDetector" in window) {
          const supported = await window.BarcodeDetector.getSupportedFormats?.();
          const detector = new window.BarcodeDetector({
            formats: supported && supported.length ? supported : ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"],
          });
          const scan = async () => {
            if (!open || stopRequested) return;
            try {
              const track = stream.getVideoTracks?.()[0];
              if (!track) return;
              const imageCapture = new ImageCapture(track);
              const bitmap = await imageCapture.grabFrame();
              const codes = await detector.detect(bitmap);
              if (codes && codes[0]?.rawValue) {
                onDetected?.(codes[0].rawValue);
              } else {
                rafId = requestAnimationFrame(scan);
              }
            } catch {
              rafId = requestAnimationFrame(scan);
            }
          };
          rafId = requestAnimationFrame(scan);
        } else {
          try {
            const lib = await import(/* webpackChunkName: "zxing" */ "@zxing/browser");
            const { BrowserMultiFormatReader } = lib;
            reader = new BrowserMultiFormatReader();
            controls = await reader.decodeFromVideoDevice(null, videoRef.current, (result) => {
              const txt = result?.getText?.();
              if (txt) onDetected?.(txt);
            });
          } catch (e) {
            setError("ZXing non installé. Lance: npm i @zxing/browser");
          }
        }
      } catch (e) {
        console.error(e);
        setError(e.message || "Caméra indisponible");
      }
    }

    if (open) start();

    return () => {
      stopRequested = true;
      if (rafId) cancelAnimationFrame(rafId);
      try { controls?.stop(); } catch {}
      try { reader?.reset(); } catch {}
      try {
        const tracks = stream?.getTracks?.() || [];
        tracks.forEach((t) => t.stop());
      } catch {}
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "min(100%, 720px)",
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,.2)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Scanner un code-barres</h3>
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              border: "none",
              borderRadius: 8,
              padding: "6px 10px",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Fermer
          </button>
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            background: "#000",
            aspectRatio: "16/9",
          }}
        >
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div
            style={{
              position: "absolute",
              inset: "15% 10%",
              border: "3px solid rgba(255,255,255,.8)",
              borderRadius: 12,
              boxShadow: "0 0 20px rgba(0,0,0,.5) inset",
            }}
          />
        </div>

        {error ? (
          <p style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{error}</p>
        ) : (
          <p style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
            Astuce : place le code bien à plat et évite les reflets.
          </p>
        )}
      </div>
    </div>
  );
}

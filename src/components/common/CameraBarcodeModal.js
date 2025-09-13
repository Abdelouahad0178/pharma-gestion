// src/components/common/CameraBarcodeModal.js
import React, { useEffect } from "react";
import useCameraBarcode from "../hooks/useCameraBarcode";

export default function CameraBarcodeModal({ open, onClose, onDetected }) {
  const {
    videoRef,
    devices,
    deviceId,
    setDeviceId,
    active,
    start,
    stop,
    torchOn,
    toggleTorch,
  } = useCameraBarcode({ onDetected });

  useEffect(() => {
    if (open) start();
    else stop();
  }, [open, start, stop]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
        display: "grid", placeItems: "center", zIndex: 9999, padding: 16
      }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 16, width: "min(100%, 720px)",
          padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,.2)", position: "relative"
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Scanner un code-barres</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <select
              value={deviceId || ""}
              onChange={(e) => setDeviceId(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8 }}
              title="Choix caméra"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Caméra ${d.deviceId.slice(-4)}`}
                </option>
              ))}
            </select>
            <button
              onClick={toggleTorch}
              title="Torche"
              style={{
                border: "none", borderRadius: 8, padding: "6px 10px",
                background: torchOn ? "#10b981" : "#e5e7eb", cursor: "pointer"
              }}
            >
              🔦 {torchOn ? "ON" : "OFF"}
            </button>
            <button
              onClick={active ? stop : start}
              style={{
                border: "none", borderRadius: 8, padding: "6px 10px",
                background: active ? "#ef4444" : "#3b82f6", color: "#fff", cursor: "pointer"
              }}
            >
              {active ? "Pause" : "Reprendre"}
            </button>
            <button
              onClick={onClose}
              style={{
                border: "none", borderRadius: 8, padding: "6px 10px",
                background: "#111827", color: "#fff", cursor: "pointer"
              }}
            >
              Fermer
            </button>
          </div>
        </div>

        <div style={{
          position: "relative", borderRadius: 12, overflow: "hidden",
          background: "#000", aspectRatio: "16/9"
        }}>
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted playsInline
          />
          {/* Cadre de visée */}
          <div style={{
            position: "absolute", inset: "15% 10%", border: "3px solid rgba(255,255,255,.8)",
            borderRadius: 12, boxShadow: "0 0 20px rgba(0,0,0,.5) inset"
          }} />
        </div>

        <p style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
          Astuce : place le code-barres bien à plat et évite les reflets. La torche peut aider.
        </p>
      </div>
    </div>
  );
}

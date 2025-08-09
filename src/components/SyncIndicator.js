// src/components/SyncIndicator.js
import React, { useState, useEffect } from "react";
import { useUserRole } from "../contexts/UserRoleContext";

export default function SyncIndicator() {
  const { societeId, user } = useUserRole();
  const [syncStatus, setSyncStatus] = useState("idle");
  const [lastSync, setLastSync] = useState(new Date());
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!societeId || !user) return;
    
    // Simuler une synchronisation active
    setSyncStatus("syncing");
    setMessage("Synchronisation en cours...");
    
    const timer = setTimeout(() => {
      setSyncStatus("synced");
      setMessage("Données synchronisées");
      setLastSync(new Date());
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [societeId, user]);

  // Auto-hide message after 3 seconds
  useEffect(() => {
    if (syncStatus === "synced") {
      const timer = setTimeout(() => {
        setSyncStatus("idle");
        setMessage("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [syncStatus]);

  if (syncStatus === "idle") return null;

  const getStatusColor = () => {
    switch (syncStatus) {
      case "syncing":
        return "#ff9800";
      case "synced":
        return "#4caf50";
      case "error":
        return "#f44336";
      default:
        return "#2196f3";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        background: getStatusColor(),
        color: "white",
        padding: "12px 20px",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 14,
        fontWeight: 600,
        zIndex: 9999,
        animation: "slideIn 0.3s ease-out",
        minWidth: 200
      }}
    >
      {syncStatus === "syncing" && (
        <div
          style={{
            width: 16,
            height: 16,
            border: "3px solid rgba(255,255,255,0.3)",
            borderTopColor: "white",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }}
        />
      )}
      {syncStatus === "synced" && <span>✓</span>}
      {syncStatus === "error" && <span>✗</span>}
      
      <div style={{ flex: 1 }}>
        <div>{message}</div>
        {syncStatus === "synced" && (
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            {lastSync.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}

// Ajouter ces styles dans votre CSS global
const styles = `
@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
`;
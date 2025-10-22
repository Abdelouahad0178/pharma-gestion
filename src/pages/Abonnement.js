// src/pages/Abonnement.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";
import { doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";

/**
 * Abonnement – 2 modes:
 *  A) Payment Links (simple, manuel)
 *  B) PayPal JS SDK (auto-activation) — active PRO (1 an) automatiquement
 *
 * ⚙️ Pré-requis auto-activation:
 *   - App PayPal (Live) → CLIENT_ID
 *   - .env : REACT_APP_PAYPAL_CLIENT_ID=xxxxx (LIVE, pas sandbox)
 */

const AMOUNT_USD = "500.00";
const AMOUNT_EUR = "450.00";
const PAY_URL_USD = "https://www.paypal.com/ncp/payment/YQ7K8RNWQQSGG";
const PAY_URL_EUR = "https://www.paypal.com/ncp/payment/DA6BK6X52SUAC";

const CURRENCIES = [
  { code: "USD", label: "DOLLAR (USD)", amount: AMOUNT_USD, url: PAY_URL_USD },
  { code: "EUR", label: "EURO (EUR)", amount: AMOUNT_EUR, url: PAY_URL_EUR },
];

// Charge dynamiquement le script PayPal JS SDK
function usePaypalScript(clientId) {
  const [ready, setReady] = useState(false);
  const addedRef = useRef(false);

  useEffect(() => {
    if (!clientId || addedRef.current) return;
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&currency=USD&intent=CAPTURE`;
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => setReady(false);
    document.body.appendChild(script);
    addedRef.current = true;
  }, [clientId]);

  return ready;
}

// +1 an
function addOneYear(date = new Date()) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

export default function Abonnement() {
  const { user, societeId } = useUserRole();
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("links"); // 'links' | 'auto'

  const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || "";
  const paypalReady = usePaypalScript(PAYPAL_CLIENT_ID);

  const current = useMemo(
    () => CURRENCIES.find((c) => c.code === selectedCurrency) || CURRENCIES[0],
    [selectedCurrency]
  );

  const qrUrl = useMemo(() => {
    const encoded = encodeURIComponent(current.url);
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encoded}`;
  }, [current.url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(current.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      alert("Impossible de copier le lien. Copiez-le manuellement.");
    }
  };

  const handlePayLink = () => {
    window.open(current.url, "_blank", "noopener,noreferrer");
  };

  // ===== Auto-activation après paiement (PayPal Buttons) =====
  useEffect(() => {
    if (!paypalReady || !PAYPAL_CLIENT_ID || tab !== "auto") return;
    if (!window.paypal) return;

    // Nettoie un rendu précédent
    const container = document.getElementById("paypal-buttons-container");
    if (container) container.innerHTML = "";

    window.paypal
      .Buttons({
        style: { shape: "pill", layout: "vertical", label: "paypal" },

        createOrder: (_, actions) => {
          const value = selectedCurrency === "EUR" ? AMOUNT_EUR : AMOUNT_USD;
          const currency = selectedCurrency === "EUR" ? "EUR" : "USD";

          return actions.order.create({
            purchase_units: [
              {
                amount: { value, currency_code: currency },
                description: "Abonnement PRO (1 an)",
              },
            ],
            application_context: {
              brand_name: "Pharma Gestion",
              user_action: "PAY_NOW",
            },
          });
        },

        onApprove: async (_, actions) => {
          const details = await actions.order.capture();

          if (!societeId) {
            alert("Aucune société active. Reconnectez-vous.");
            return;
          }

          try {
            const start = new Date();
            const end = addOneYear(start);

            await updateDoc(doc(db, "societe", societeId), {
              plan: "pro",
              testMode: false,
              pro: true,
              subscription: {
                status: "active",
                plan: "pro",
                startedAt: serverTimestamp(),
                startedAtIso: start.toISOString(),
                expiresAt: Timestamp.fromDate(end),
                expiresAtIso: end.toISOString(),
                provider: "paypal",
                orderId: details?.id || null,
                payerEmail: details?.payer?.email_address || user?.email || null,
                lastPaymentAt: serverTimestamp(),
              },
              paymentWarning: null,
              lastBillingUpdate: serverTimestamp(),
            });

            alert("✅ Paiement validé. Votre abonnement PRO est activé !");
          } catch (e) {
            console.error(e);
            alert(
              "Paiement réussi, mais l’activation a échoué. Contactez le support."
            );
          }
        },

        onError: (err) => {
          console.error("PayPal error:", err);
          alert("Erreur PayPal. Réessayez ou contactez le support.");
        },
      })
      .render("#paypal-buttons-container");
  }, [paypalReady, PAYPAL_CLIENT_ID, tab, selectedCurrency, user, societeId]);

  const autoDisabled = !PAYPAL_CLIENT_ID;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <Link to="/" style={styles.backLink}>← Retour</Link>
          <h1 style={styles.title}>Souscrire un abonnement</h1>
          <p style={styles.subtitle}>
            Passez en <b>version PRO</b> pour 1 an. Choisissez le mode de paiement.
          </p>
        </div>

        <div style={{ padding: 20 }}>
          {/* Onglets */}
          <div style={styles.tabs}>
            <button
              onClick={() => setTab("links")}
              style={{
                ...styles.tabBtn,
                ...(tab === "links" ? styles.tabBtnActive : {}),
              }}
            >
              💳 Lien PayPal (simple)
            </button>

            <button
              onClick={() => !autoDisabled && setTab("auto")}
              style={{
                ...styles.tabBtn,
                ...(tab === "auto" ? styles.tabBtnActive : {}),
                ...(autoDisabled ? styles.tabBtnDisabled : {}),
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
              title={
                PAYPAL_CLIENT_ID
                  ? "PayPal (auto-activation)"
                  : "Configurez REACT_APP_PAYPAL_CLIENT_ID (mode LIVE) pour activer"
              }
              disabled={autoDisabled}
              aria-disabled={autoDisabled}
            >
              {/* Icône PayPal simple (PP) */}
              <span style={styles.ppIcon}>PP</span>
              <span>Auto-activation (PayPal)</span>
              {/* Badge état (LIVE / CONFIG) */}
              <span
                style={{
                  ...styles.badge,
                  ...(autoDisabled ? styles.badgeMuted : styles.badgeLive),
                }}
              >
                {autoDisabled ? "CONFIG" : "LIVE"}
              </span>
            </button>
          </div>

          {tab === "links" ? (
            <>
              {/* Choix devise pour les liens */}
              <div style={styles.options}>
                {CURRENCIES.map((c) => {
                  const active = c.code === selectedCurrency;
                  return (
                    <button
                      key={c.code}
                      onClick={() => setSelectedCurrency(c.code)}
                      style={{
                        ...styles.option,
                        background: active ? "#2563eb" : "#ffffff",
                        color: active ? "#ffffff" : "#111827",
                        border: active ? "2px solid #2563eb" : "1px solid #e5e7eb",
                        boxShadow: active
                          ? "0 10px 24px rgba(37,99,235,.25)"
                          : "0 4px 14px rgba(0,0,0,.06)",
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{c.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6 }}>
                        {c.amount} {c.code}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                        Abonnement annuel
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={styles.payBlock}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  Montant : {current.amount} {current.code}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {/* Bouton pill plus fin */}
                  <button
                    onClick={handlePayLink}
                    style={styles.paypalPill}
                    title="Payer avec PayPal"
                    aria-label="Payer avec PayPal"
                  >
                    <img
                      src="https://www.paypalobjects.com/webstatic/icon/pp258.png"
                      alt=""
                      width="18"
                      height="18"
                      style={{ display: "inline-block", verticalAlign: "middle" }}
                    />
                    <span style={{ marginLeft: 8, fontWeight: 800 }}>
                      Payer avec PayPal
                    </span>
                  </button>

                  {/* Badge durée 1 an */}
                  <span style={styles.badgeDuration}>1 an</span>
                </div>

                <div style={styles.linkRow}>
                  <code style={styles.linkCode}>{current.url}</code>
                  <button
                    onClick={handleCopy}
                    style={styles.copyBtn}
                    title="Copier le lien de paiement"
                    aria-label="Copier le lien de paiement"
                  >
                    {/* Icône clipboard (SVG) */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ flex: "0 0 auto" }}
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>{copied ? "Copié ✓" : "Copier"}</span>
                  </button>
                </div>

                <div style={styles.qrWrap}>
                  <img
                    src={qrUrl}
                    alt={`QR PayPal ${current.code}`}
                    width="220"
                    height="220"
                    style={{ borderRadius: 12, border: "1px solid #eee" }}
                  />
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                    Scannez avec votre smartphone pour ouvrir le paiement.
                  </div>
                </div>

                <div style={styles.note}>
                  Après paiement par lien, l’activation peut nécessiter une validation.
                  Pour une activation immédiate, utilisez l’onglet <b>Auto-activation</b>.
                </div>
              </div>
            </>
          ) : (
            <div style={styles.autoBox}>
              {!PAYPAL_CLIENT_ID ? (
                <div style={styles.envWarn}>
                  ⚠️ Ajoute <code>REACT_APP_PAYPAL_CLIENT_ID</code> dans ton <b>.env</b> (client LIVE),
                  puis redémarre le projet.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 10, fontWeight: 700 }}>
                    Montant : {selectedCurrency === "EUR" ? AMOUNT_EUR + " EUR" : AMOUNT_USD + " USD"}
                  </div>
                  <div id="paypal-buttons-container" />
                  {!paypalReady && (
                    <div style={{ marginTop: 10, color: "#6b7280" }}>
                      Chargement de PayPal...
                    </div>
                  )}
                  <div style={{ marginTop: 14, fontSize: 13, color: "#6b7280" }}>
                    Paiement sécurisé via PayPal. Votre abonnement PRO est activé automatiquement
                    (durée 1 an).
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ Styles ============ */
const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#EEF2FF,#FDF2F8)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    fontFamily: "Inter,system-ui,Arial",
  },
  card: {
    width: "100%",
    maxWidth: 900,
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 24px 60px rgba(0,0,0,.12)",
    overflow: "hidden",
  },
  header: {
    padding: 20,
    background: "linear-gradient(135deg,#1f2937,#111827)",
    color: "#fff",
  },
  backLink: {
    display: "inline-block",
    color: "#93C5FD",
    textDecoration: "none",
    fontWeight: 700,
    marginBottom: 8,
  },
  title: { margin: 0, fontSize: 28, fontWeight: 800 },
  subtitle: { marginTop: 6, opacity: 0.8 },

  tabs: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    borderBottom: "1px solid #e5e7eb",
    paddingBottom: 8,
  },
  tabBtn: {
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    color: "#111827",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
    lineHeight: 1.2,
  },
  tabBtnActive: {
    background: "#111827",
    color: "#ffffff",
    borderColor: "#111827",
  },
  tabBtnDisabled: {
    background: "#E5E7EB",
    color: "#6B7280",
    borderColor: "#D1D5DB",
    cursor: "not-allowed",
    pointerEvents: "none",
    filter: "grayscale(20%)",
  },

  // Icône PP minimaliste
  ppIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 900,
    background: "linear-gradient(135deg,#003087,#009CDE)",
    color: "#fff",
    letterSpacing: 0.3,
  },

  // Badge LIVE / CONFIG
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 900,
    lineHeight: 1,
    border: "1px solid transparent",
  },
  badgeLive: {
    background: "#10B981", // vert
    color: "#ffffff",
    borderColor: "#059669",
  },
  badgeMuted: {
    background: "#E5E7EB", // gris
    color: "#374151",
    borderColor: "#D1D5DB",
  },

  options: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 12,
  },
  option: {
    cursor: "pointer",
    borderRadius: 14,
    padding: "14px 16px",
    transition: "box-shadow .2s, transform .1s",
  },
  payBlock: { marginTop: 18 },

  // Nouveau: bouton PayPal pill, plus fin
  paypalPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#F7BE38",
    color: "#111827",
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 999,
    padding: "8px 14px", // plus fin que l'ancien
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(0,0,0,.06)",
  },

  // Badge "1 an" à côté du bouton PayPal
  badgeDuration: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#E0E7FF",
    color: "#1E3A8A",
    fontWeight: 800,
    fontSize: 12,
    border: "1px solid #C7D2FE",
  },

  linkRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 10 },
  linkCode: {
    display: "inline-block",
    background: "#F3F4F6",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    wordBreak: "break-all",
    flex: 1,
  },

  // Bouton "Copier" transparent, avec icône + tooltip
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    background: "transparent",
    padding: "6px 8px",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 700,
    color: "#2563EB",
    textDecoration: "none",
  },

  qrWrap: { marginTop: 12 },
  note: {
    marginTop: 12,
    fontSize: 13,
    color: "#6b7280",
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
    padding: 10,
    borderRadius: 10,
  },

  autoBox: {
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: 16,
  },
  envWarn: {
    background: "#FEF3C7",
    color: "#92400E",
    border: "1px solid #FCD34D",
    borderRadius: 10,
    padding: 12,
    fontWeight: 700,
  },
};

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * Page d'abonnement simple (PayPal)
 * Choix : USD 500, EUR 450
 *
 * 🧩 Utilisation :
 * - Remplacez PAYPAL_CLIENT_ID par votre vrai Client ID (Sandbox/Live).
 * - Si vous utilisez des variables d'env : process.env.REACT_APP_PAYPAL_CLIENT_ID
 */

const PAYPAL_CLIENT_ID =
  process.env.REACT_APP_PAYPAL_CLIENT_ID || "YOUR_PAYPAL_CLIENT_ID";

// ✅ MAD retiré
const CURRENCIES = [
  { code: "USD", label: "DOLLAR (USD)", amount: "500.00" },
  { code: "EUR", label: "EURO (EUR)", amount: "450.00" },
];

export default function Abonnement() {
  const [selected, setSelected] = useState("USD");
  const [loadingSdk, setLoadingSdk] = useState(false);
  const [sdkError, setSdkError] = useState("");
  const [status, setStatus] = useState(null); // success | cancelled | error | null

  const paypalContainerRef = useRef(null);
  const scriptRef = useRef(null);
  const buttonsRef = useRef(null);

  const amount = CURRENCIES.find((c) => c.code === selected)?.amount || "500.00";

  // Charge/Recharge le SDK PayPal quand la devise change
  useEffect(() => {
    let cancelled = false;

    async function loadSdk() {
      setStatus(null);
      setSdkError("");
      setLoadingSdk(true);

      // Démonte d'éventuels boutons existants
      if (buttonsRef.current) {
        try {
          buttonsRef.current.close();
        } catch {}
        buttonsRef.current = null;
      }

      // Supprime l'ancien script
      if (scriptRef.current) {
        try {
          document.body.removeChild(scriptRef.current);
        } catch {}
        scriptRef.current = null;
      }

      // Nettoie le container
      if (paypalContainerRef.current) {
        paypalContainerRef.current.innerHTML = "";
      }

      // Ajoute le script PayPal pour la devise choisie
      const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
        PAYPAL_CLIENT_ID
      )}&currency=${encodeURIComponent(selected)}&intent=capture`;

      const script = document.createElement("script");
      script.src = sdkUrl;
      script.async = true;

      script.onload = () => {
        if (cancelled) return;
        if (!window.paypal) {
          setSdkError("Le SDK PayPal n'a pas été chargé correctement.");
          setLoadingSdk(false);
          return;
        }

        try {
          const btns = window.paypal.Buttons({
            style: {
              layout: "vertical",
              shape: "pill",
              label: "paypal",
            },
            // Création de la commande
            createOrder: (data, actions) => {
              return actions.order.create({
                intent: "CAPTURE",
                purchase_units: [
                  {
                    description: `Abonnement annuel (${selected})`,
                    amount: {
                      currency_code: selected,
                      value: amount,
                    },
                  },
                ],
                application_context: {
                  shipping_preference: "NO_SHIPPING",
                },
              });
            },
            // Paiement validé
            onApprove: async (data, actions) => {
              try {
                const details = await actions.order.capture();
                // 👉 Ici vous pouvez enregistrer dans Firestore si besoin (id, montant, currency, buyer, etc.)
                console.log("PAYPAL_CAPTURED:", details);
                setStatus({
                  type: "success",
                  message: "Paiement confirmé ✅ Merci !",
                });
              } catch (e) {
                console.error(e);
                setStatus({
                  type: "error",
                  message: "Erreur lors de la capture du paiement.",
                });
              }
            },
            onCancel: () => {
              setStatus({ type: "cancelled", message: "Paiement annulé." });
            },
            onError: (err) => {
              console.error("PayPal Buttons Error:", err);
              setStatus({
                type: "error",
                message: "Une erreur s'est produite avec PayPal.",
              });
            },
          });

          buttonsRef.current = btns;
          btns.render("#paypal-buttons-container");
          setLoadingSdk(false);
        } catch (e) {
          console.error(e);
          setSdkError("Impossible d'initialiser les boutons PayPal.");
          setLoadingSdk(false);
        }
      };

      script.onerror = () => {
        if (!cancelled) {
          setSdkError("Erreur de chargement du SDK PayPal.");
          setLoadingSdk(false);
        }
      };

      document.body.appendChild(script);
      scriptRef.current = script;
    }

    loadSdk();

    return () => {
      cancelled = true;
      if (buttonsRef.current) {
        try {
          buttonsRef.current.close();
        } catch {}
        buttonsRef.current = null;
      }
      if (scriptRef.current) {
        try {
          document.body.removeChild(scriptRef.current);
        } catch {}
        scriptRef.current = null;
      }
    };
  }, [selected]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <Link to="/" style={styles.backLink}>
            ← Retour
          </Link>
          <h1 style={styles.title}>Souscrire un abonnement</h1>
          <p style={styles.subtitle}>
            Choisissez votre devise et payez en toute simplicité via PayPal.
          </p>
        </div>

        <div style={styles.body}>
          {/* Boutons de devises – libellés écrits */}
          <div style={styles.options}>
            {CURRENCIES.map((c) => {
              const active = c.code === selected;
              return (
                <button
                  key={c.code}
                  onClick={() => setSelected(c.code)}
                  style={{
                    ...styles.option,
                    border: active
                      ? "2px solid #2563eb"
                      : "2px solid transparent",
                    boxShadow: active
                      ? "0 10px 24px rgba(37,99,235,.25)"
                      : "0 4px 14px rgba(0,0,0,.08)",
                  }}
                  title={`Choisir ${c.label}`}
                >
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{c.label}</div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      opacity: 0.9,
                      marginTop: 6,
                    }}
                  >
                    {c.amount} {c.code}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                    Abonnement annuel
                  </div>
                </button>
              );
            })}
          </div>

          <div style={styles.payBlock}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              Montant : {amount} {selected}
            </div>

            {sdkError && <div style={styles.alertError}>{sdkError}</div>}

            {status?.type === "success" && (
              <div style={styles.alertOk}>{status.message}</div>
            )}
            {status?.type === "cancelled" && (
              <div style={styles.alertWarn}>{status.message}</div>
            )}
            {status?.type === "error" && (
              <div style={styles.alertError}>{status.message}</div>
            )}

            <div id="paypal-buttons-container" ref={paypalContainerRef} />

            {loadingSdk && (
              <div style={{ marginTop: 10, fontSize: 14, opacity: 0.8 }}>
                Chargement des boutons PayPal…
              </div>
            )}

            <div style={styles.note}>
              En cliquant sur “Payer avec PayPal”, vous serez redirigé sur
              l’interface PayPal sécurisée pour finaliser le paiement.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========== Styles inline =========== */
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
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
  },
  subtitle: {
    marginTop: 6,
    opacity: 0.8,
  },
  body: {
    padding: 20,
  },
  options: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 12,
  },
  option: {
    cursor: "pointer",
    borderRadius: 14,
  
    padding: 16,
    textAlign: "center",
  },
  payBlock: {
    marginTop: 16,
    borderTop: "1px solid #e5e7eb",
    paddingTop: 16,
  },
  alertOk: {
    background: "rgba(220,252,231,.9)",
    color: "#166534",
    border: "1px solid #86EFAC",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    fontWeight: 700,
  },
  alertWarn: {
    background: "rgba(254,243,199,.9)",
    color: "#92400e",
    border: "1px solid #f59e0b",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    fontWeight: 700,
  },
  alertError: {
    background: "rgba(254,226,226,.9)",
    color: "#991b1b",
    border: "1px solid #ef4444",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    fontWeight: 700,
  },
  note: {
    marginTop: 12,
    fontSize: 12,
    color: "#6b7280",
  },
};

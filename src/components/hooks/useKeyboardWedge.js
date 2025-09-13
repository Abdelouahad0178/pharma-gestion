// src/components/hooks/useKeyboardWedge.js
import { useEffect, useRef } from "react";

/**
 * useKeyboardWedge
 * Agrège les frappes d'un lecteur code-barres (mode "clavier wedge")
 * et déclenche onCode(buffer) à Enter ou après un délai d'inactivité.
 *
 * Options:
 * - minChars: longueur min du code (6)
 * - endKey: touche de fin ("Enter")
 * - timeoutMs: délai d'inactivité (120ms)
 * - allowWhileEditing: capter même dans input/textarea (false recommandé)
 */
export default function useKeyboardWedge(
  onCode,
  { minChars = 6, endKey = "Enter", timeoutMs = 120, allowWhileEditing = false } = {}
) {
  const bufRef = useRef("");
  const timerRef = useRef(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flush = () => {
    try {
      const code = String(bufRef.current || "");
      bufRef.current = "";
      clearTimer();
      if (code.length >= Number(minChars || 0) && typeof onCodeRef.current === "function") {
        onCodeRef.current(code);
      }
    } catch {/* no-op */}
  };

  useEffect(() => {
    // Débranche un ancien handler (utile si HMR/StrictMode)
    if (window.__wedgeHandleKeyDown__) {
      document.removeEventListener("keydown", window.__wedgeHandleKeyDown__);
    }

    const handler = (e) => {
      try {
        // Certaines implémentations / extensions envoient des events exotiques
        const key = typeof e?.key === "string" ? e.key : "";
        const end = typeof endKey === "string" && endKey ? endKey : "Enter";

        // reset timer à chaque frappe
        clearTimer();

        // ignorer IME/composition ou mods
        if (e?.isComposing) return;
        if (e?.ctrlKey || e?.metaKey || e?.altKey) return;

        // ne pas capturer quand on tape dans un champ si allowWhileEditing=false
        const t = e?.target;
        const tag = (t && t.tagName) ? String(t.tagName).toLowerCase() : "";
        const isEditable = tag === "input" || tag === "textarea" || (t && t.isContentEditable === true);
        if (isEditable && !allowWhileEditing) return;

        // touche de fin => valider
        if (key === end) {
          e.preventDefault?.();
          e.stopPropagation?.();
          flush();
          return;
        }

        // caractères imprimables (longueur 1) — jamais d'accès à .length sans garde
        if (key && key.length === 1) {
          bufRef.current = String(bufRef.current || "") + key;
          timerRef.current = setTimeout(flush, Math.max(40, Number(timeoutMs || 0) || 120));
          return;
        }

        // touches ignorées
        // (on ne lit rien qui puisse lancer une erreur)
        return;
      } catch {
        // on avale toute erreur pour ne jamais polluer l'app
      }
    };

    window.__wedgeHandleKeyDown__ = handler;
    document.addEventListener("keydown", handler, { passive: false });

    return () => {
      try {
        if (window.__wedgeHandleKeyDown__ === handler) {
          document.removeEventListener("keydown", handler);
          window.__wedgeHandleKeyDown__ = null;
        } else {
          document.removeEventListener("keydown", handler);
        }
      } catch {/* no-op */}
      clearTimer();
      bufRef.current = "";
    };
  }, [minChars, endKey, timeoutMs, allowWhileEditing]);
}

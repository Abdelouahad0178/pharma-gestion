// src/helpers/env.js

/**
 * Détecte si on doit forcer signInWithRedirect au lieu de signInWithPopup.
 * Ce helper gère les contextes problématiques :
 *   - PWA installées (mode standalone)
 *   - Safari / iOS (popups limitées)
 *   - Application dans une iframe
 *   - En-têtes COOP stricts ("same-origin") → popup.close bloqué
 *   - Option : forcer redirect globalement
 */

export function shouldUseRedirect() {
  try {
    // 🔹 1. PWA installée (Android/Chrome ou iOS)
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;

    // 🔹 2. Safari ou WebKit sur iOS → popups peu fiables
    const ua = navigator.userAgent;
    const isSafari =
      /^((?!chrome|android).)*safari/i.test(ua) || /CriOS|FxiOS/i.test(ua);

    // 🔹 3. Si l'app est affichée dans une iframe
    const inIframe = window.self !== window.top;

    // 🔹 4. Détection indirecte d'une politique COOP stricte
    // Si l'en-tête actuel empêche les popups → forcer redirect
    const coopHeader = document?.policy?.crossOriginOpenerPolicy || null;
    const coopBlocked = coopHeader === "same-origin";

    // 🔹 5. Variable manuelle pour forcer le redirect partout
    const forceRedirect = false; // ← Mets "true" pour supprimer complètement les popups

    return (
      forceRedirect ||
      isStandalone ||
      isSafari ||
      inIframe ||
      coopBlocked
    );
  } catch (e) {
    console.warn("[env] Erreur détection redirect, fallback sur popup:", e);
    return false;
  }
}

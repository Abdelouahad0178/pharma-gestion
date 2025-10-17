// src/utils/secureAction.js
export function secureAction(can, permission, fn) {
  return async (...args) => {
    if (!can(permission)) {
      alert("Action refusée : permissions insuffisantes.");
      return;
    }
    return fn(...args);
  };
}

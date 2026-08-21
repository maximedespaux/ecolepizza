// Compteur global de requêtes en cours -> barre de chargement.
let active = 0;
const EVT = "loading:change";

export function startLoading() {
  active += 1;
  window.dispatchEvent(new CustomEvent(EVT, { detail: active }));
}

export function stopLoading() {
  active = Math.max(0, active - 1);
  window.dispatchEvent(new CustomEvent(EVT, { detail: active }));
}

export function onLoadingChange(handler) {
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}

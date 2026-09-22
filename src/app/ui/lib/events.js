// Petit bus d'événements pour rafraîchir les pastilles de navigation
// immédiatement après une action (création/suppression/paiement…).
const BADGES_EVENT = "badges:refresh";

export function bumpBadges() {
  window.dispatchEvent(new Event(BADGES_EVENT));
}

export function onBadgesRefresh(handler) {
  window.addEventListener(BADGES_EVENT, handler);
  return () => window.removeEventListener(BADGES_EVENT, handler);
}

/* UN MÉMO A CHANGÉ ICI : la carte du tableau de bord et le bouton de la barre du haut montrent la
   même liste, et chacun se relit quand l'autre écrit — sans attendre la minute de rafraîchissement.
   (Les changements de l'ÉQUIPE arrivent, eux, par le signal temps réel de `useAutoRefresh`.) */
const MEMOS_EVENT = "memos:change";

export function annoncerMemos() {
  window.dispatchEvent(new Event(MEMOS_EVENT));
}

export function onMemosChange(handler) {
  window.addEventListener(MEMOS_EVENT, handler);
  return () => window.removeEventListener(MEMOS_EVENT, handler);
}

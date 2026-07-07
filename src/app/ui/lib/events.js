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

import { useEffect, useState } from "react";

/**
 * Mode confidentiel PARTAGÉ des montants (pages Ventes & Finance).
 * Un seul état pour toutes les pages : masquer/afficher vaut pour l'ensemble,
 * mémorisé et synchronisé (onglets + composants) via un évènement.
 */
const KEY = "impasto.moneyMasked";
const EVT = "impasto:moneymask";

export function isMoneyMasked() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

// Rôles autorisés par défaut à révéler les montants (bureau). Le formateur ne peut
// pas révéler → les montants restent masqués pour lui.
const REVEAL_ROLES = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"];

/**
 * L'utilisateur peut-il révéler les montants ?
 * Prend en compte un futur réglage par utilisateur (`can_reveal_money`, défini via
 * Accès & rôles) ; à défaut, retombe sur les rôles bureau.
 */
export function canRevealMoney(user) {
  if (user && user.can_reveal_money != null) return !!user.can_reveal_money;
  return REVEAL_ROLES.includes(user?.role);
}

function write(masked) {
  try { localStorage.setItem(KEY, masked ? "1" : "0"); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT));
}

/** Hook : { masked, hide, reveal } synchronisé entre toutes les pages. */
export function useMoneyMask() {
  const [masked, setMasked] = useState(isMoneyMasked);
  useEffect(() => {
    const sync = () => setMasked(isMoneyMasked());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync); // autres onglets
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return {
    masked,
    hide: () => write(true),
    reveal: () => write(false),
  };
}

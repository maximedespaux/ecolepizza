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

// Seul le super administrateur peut révéler les montants d'office. L'administrateur,
// le secrétariat, le formateur, etc. ne le peuvent pas par défaut : il faut leur
// accorder la capacité « Révéler les montants » (Accès & rôles → cap:reveal-money).
const REVEAL_ROLES = ["SUPER_ADMIN"];

// Capacité « accès supplémentaire » stockée dans nav_access (comme une page).
// Cochée dans Accès & rôles (par rôle ou par membre) pour accorder la levée du
// masque à quelqu'un qui ne l'a pas par défaut (ex. un formateur précis).
export const CAP_REVEAL_MONEY = "cap:reveal-money";

/**
 * L'utilisateur peut-il révéler les montants ?
 * Bureau : oui par défaut. Sinon : seulement si la capacité « Révéler les montants »
 * lui a été accordée dans nav_access (via Accès & rôles).
 */
export function canRevealMoney(user) {
  if (!user) return false;
  if (REVEAL_ROLES.includes(user.role)) return true;
  const na = user.nav_access;
  if (na && typeof na === "object" && !Array.isArray(na)) {
    return Object.prototype.hasOwnProperty.call(na, CAP_REVEAL_MONEY);
  }
  if (Array.isArray(na)) return na.includes(CAP_REVEAL_MONEY);
  return false;
}

// « Ne plus demander » la confirmation pour révéler, le temps de la session
// (jusqu'à déconnexion / fermeture de l'onglet). Stocké en sessionStorage — donc
// remis à zéro à chaque nouvelle session ; `clearRevealConfirmSkip()` est aussi
// appelé à la déconnexion.
const SKIP_KEY = "impasto.revealConfirmSkip";
export function isRevealConfirmSkipped() {
  try { return sessionStorage.getItem(SKIP_KEY) === "1"; } catch { return false; }
}
export function setRevealConfirmSkip(on) {
  try { on ? sessionStorage.setItem(SKIP_KEY, "1") : sessionStorage.removeItem(SKIP_KEY); } catch { /* ignore */ }
}
export function clearRevealConfirmSkip() { setRevealConfirmSkip(false); }

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

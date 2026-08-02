import { useEffect, useState } from "react";

/**
 * Mode confidentiel PARTAGÉ des montants (pages Ventes & Finance).
 * Un seul état pour toutes les pages : masquer/afficher vaut pour l'ensemble, et un évènement
 * tient les composants d'accord entre eux.
 *
 * MASQUÉ PAR DÉFAUT. Le défaut était l'inverse : sans clic préalable, les montants s'affichaient.
 * Deux conséquences, et la seconde est la plus gênante. D'abord un écran de caisse ou de
 * comptabilité ouvert devant un stagiaire montrait les chiffres de l'école — c'est le cas que la
 * confidentialité existe pour couvrir. Ensuite, et surtout, la capacité « Révéler les montants »
 * ne servait presque à rien : elle donne le droit de lever un masque qui n'était pas mis. Un
 * droit qui ne conditionne rien n'est pas un droit.
 *
 * ET LE MASQUE REVIENT À CHAQUE SESSION — d'où `sessionStorage` et non `localStorage`. Changer
 * seulement le défaut aurait donné une confidentialité qui s'éteint définitivement au premier
 * clic sur « Afficher » : masqué par défaut une fois, visible pour toujours ensuite. Le reste du
 * dispositif dit déjà que révéler est un acte délibéré et temporaire — il demande confirmation, et
 * son « ne plus demander » est lui-même borné à la session. Le masque suit la même règle.
 *
 * Conséquence assumée : chaque ONGLET repart masqué, `sessionStorage` étant propre à l'onglet.
 * C'est le bon sens pour ce réglage-là — révéler ses montants sur un écran ne devrait pas les
 * révéler sur un autre.
 *
 * L'ancienne clé de `localStorage` n'est plus lue. Elle est effacée au premier changement d'état
 * plutôt qu'à la lecture : un getter qui écrit est un piège pour la prochaine personne.
 */
const KEY = "impasto.moneyMasked";
const EVT = "impasto:moneymask";

export function isMoneyMasked() {
  // Masqué SAUF si l'on a explicitement révélé pendant cette session.
  try { return sessionStorage.getItem(KEY) !== "0"; } catch { return true; }
}

/** Oublie la révélation : appelé à la déconnexion, avec le « ne plus demander ». */
export function clearMoneyReveal() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
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
  try {
    // Masquer, c'est revenir au défaut : on efface au lieu d'écrire « 1 », pour qu'il n'y ait
    // qu'une seule façon d'être masqué.
    if (masked) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, "0");
    localStorage.removeItem(KEY);   // vestige de l'ancien stockage, plus lu nulle part
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT));
}

/** Hook : { masked, hide, reveal } synchronisé entre toutes les pages. */
export function useMoneyMask() {
  const [masked, setMasked] = useState(isMoneyMasked);
  useEffect(() => {
    const sync = () => setMasked(isMoneyMasked());
    window.addEventListener(EVT, sync);
    /* `storage` ne se déclenche que pour `localStorage` : depuis que la révélation vit en
       `sessionStorage`, il ne synchronise plus rien entre onglets — et c'est voulu, chaque onglet
       repart masqué. On le garde pour la déconnexion depuis un autre onglet, qui touche bien le
       `localStorage` et doit remettre cet écran d'accord avec lui-même. */
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return {
    masked,
    hide: () => write(true),
    reveal: () => write(false),
  };
}

import { semaineParDefaut } from "./sessions.js";

/**
 * Signal de rafraîchissement des pastilles de l'espace intervenant (émargement, documents).
 *
 * La barre (IntervenantLayout) porte les compteurs « à signer » ; les pages où l'on signe
 * (émargement, documents) lui disent de recompter après chaque signature, sans quoi la pastille
 * resterait figée jusqu'à la prochaine navigation. Même procédé que `AVATAR_EVENT` pour l'avatar :
 * un évènement de fenêtre, écouté par la barre.
 */
export const INTERVENANT_REFRESH = "intervenant:refresh";

export function rafraichirIntervenant() {
  try { window.dispatchEvent(new Event(INTERVENANT_REFRESH)); } catch { /* pas de window (SSR, test) */ }
}

const cleSemaine = (s) => `${s.year}-${String(s.week).padStart(2, "0")}`;

/**
 * Les émargements RANGÉS PAR SEMAINE, et la semaine à OUVRIR.
 *
 * La barre et la page de l'émargement doivent tomber d'accord sur « la semaine concernée »
 * (sinon la pastille compterait une semaine, la liste en montrerait une autre) : d'où ce point
 * unique. On réutilise `semaineParDefaut` — aujourd'hui si on y enseigne, sinon la plus proche —,
 * la même règle que l'espace stagiaire.
 */
export function semainesEmargement(sheets) {
  const m = new Map();
  for (const s of (sheets || [])) {
    const cle = cleSemaine(s);
    if (!m.has(cle)) m.set(cle, { cle, annee: Number(s.year), semaine: Number(s.week), sessions: [] });
    m.get(cle).sessions.push(s);
  }
  const groupes = [...m.values()].sort((a, b) => (b.annee - a.annee) || (b.semaine - a.semaine));
  return { groupes, defaut: semaineParDefaut(groupes) };
}

/** Combien de demi-journées restent à signer dans la semaine `cle` ("AAAA-SS"). */
export const aSignerDansSemaine = (sheets, cle) =>
  (sheets || []).filter((s) => cleSemaine(s) === cle)
    .reduce((n, s) => n + (s.slots || []).filter((x) => !x.signed).length, 0);

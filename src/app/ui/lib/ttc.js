/**
 * LE TTC D'UN DOCUMENT DE /factures, tel que le PDF le calcule (`ventilerTva`, src/api/lib/facturx.js) :
 * TVA à 20 % sauf exonération — ces documents ne portent pas d'autre taux —, arrondie une fois sur
 * le total. Le règlement saisi doit tomber dessus au centime, et le serveur le revérifie avec
 * `ventilerTva` : deux calculs qui divergeraient d'un centime refuseraient un règlement juste.
 * `factures-modele-reglement.test.js` les confronte sur une plage de montants.
 */
export const arrondi = (n) => Math.round(n * 100) / 100;

export function ttcDe(ht, exonere) {
  const base = arrondi(Number(ht) || 0);
  return Number(exonere) ? base : arrondi(base + Math.round(base * 20) / 100);
}

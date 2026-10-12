/**
 * LE NUMÉRO DE CERTIFICATION d'un dossier (migration 205, demandé le 2026-10-12).
 *
 * Une formation certifiante délivre un parchemin numéroté, unique par organisme. Le numéro est
 * attribué à la clôture du jury aux candidats ADMIS, en une séquence SIMPLE (1, 2, 3…) qui
 * CONTINUE la plus grande déjà posée, puis modifiable à la main.
 *
 * Ce module ne lit rien en base : il porte les règles PURES (qui a droit à un numéro, le prochain
 * de la séquence, un numéro saisi valide) pour qu'elles s'éprouvent seules et ne se recopient pas.
 */

/* Les décisions qui ouvrent droit à un numéro — et à un parchemin : la certification pleine et les
   blocs acquis. Le MÊME ensemble que « admis » sur le procès-verbal (examen.controller, ADMIS) :
   un candidat ajourné, absent ou exclu n'est pas certifié, il n'a pas de numéro. */
const DECISIONS_NUMEROTEES = new Set(['CERTIFIE', 'BLOCS_ACQUIS']);

/**
 * À partir des dossiers admis SANS numéro (déjà ORDONNÉS, p. ex. par nom — pour que les numéros
 * soient déterministes) et du plus grand numéro déjà attribué dans l'organisme, rend la liste
 * `{ id, numero }` à poser : une séquence simple qui continue (max+1, +2…). Les dossiers qui ont
 * DÉJÀ un numéro ne sont pas passés ici : la clôture ne les renumérote pas (idempotence).
 */
function prochainsNumeros(dossiersSansNumero, maxActuel = 0) {
    let n = Number(maxActuel) || 0;
    return (dossiersSansNumero || []).map((d) => ({ id: d.id, numero: ++n }));
}

/**
 * Un numéro SAISI à la main : un entier strictement positif, ou null pour effacer. Rend
 * `{ valeur }` (le nombre ou null) ou `{ erreur }`. Un « 12,5 », un « 0 », un texte → refusé :
 * un numéro de parchemin est un entier, pas un montant.
 */
function numeroSaisi(brut) {
    if (brut === null || brut === undefined || String(brut).trim() === '') return { valeur: null };
    const n = Number(brut);
    if (!Number.isInteger(n) || n <= 0) return { erreur: 'Numéro de certification invalide (entier positif attendu).' };
    return { valeur: n };
}

module.exports = { DECISIONS_NUMEROTEES, prochainsNumeros, numeroSaisi };

/**
 * LE NOMBRE DE DOCUMENTS D'UN TYPE DE REMISE (migration 203) — règles pures, partagées à l'identique
 * par le serveur (ici) et l'écran (src/app/ui/lib/remiseNb.js, confrontés par `remise-nb.test.js`).
 *
 * Un type de remise porte `nb_documents` (0 = pas de limite) et `nb_mode` :
 *   · PLAFOND — « au plus N » : le dépôt plafonne à N ; l'étape est faite dès l'accusé de réception.
 *   · REQUIS  — « il en faut N » : le dépôt plafonne à N ET l'accusé de réception est refusé tant
 *     qu'il manque des documents (moins de N déposés).
 */

const MODES = ['PLAFOND', 'REQUIS'];

/** Le mode normalisé — PLAFOND par défaut (comportement d'avant la 203). */
function nbModeValide(v) {
  return MODES.includes(v) ? v : 'PLAFOND';
}

/** Le nombre visé, borné : entier de 0 (pas de limite) à 99. */
function nbDocumentsValide(v) {
  const n = Math.round(Number(v) || 0);
  return n > 0 ? Math.min(99, n) : 0;
}

/** Le plafond est-il atteint ? (un nombre est fixé, et on a déjà au moins ce nombre de fichiers). */
function plafondAtteint(nbFichiers, nbDocuments) {
  return Number(nbDocuments) > 0 && (Number(nbFichiers) || 0) >= Number(nbDocuments);
}

/** Combien manque-t-il pour un type REQUIS ? 0 si ce n'est pas requis, ou si le compte est atteint. */
function manquePourRequis({ nb_mode, nb_documents, nb_fichiers }) {
  if (nbModeValide(nb_mode) !== 'REQUIS' || !(Number(nb_documents) > 0)) return 0;
  return Math.max(0, Number(nb_documents) - (Number(nb_fichiers) || 0));
}

/** Peut-on accuser réception ? Oui, sauf si le type est REQUIS et qu'il manque des documents. */
function peutAccuser({ nb_mode, nb_documents, nb_fichiers }) {
  return manquePourRequis({ nb_mode, nb_documents, nb_fichiers }) === 0;
}

module.exports = { MODES, nbModeValide, nbDocumentsValide, plafondAtteint, manquePourRequis, peutAccuser };

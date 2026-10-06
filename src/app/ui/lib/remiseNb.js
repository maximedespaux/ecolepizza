/**
 * LE NOMBRE DE DOCUMENTS D'UN TYPE DE REMISE (migration 203) — la MÊME règle que le serveur
 * (src/api/lib/remiseNb.js, où le besoin est raconté). `remise-nb.test.js` confronte les deux.
 * PLAFOND : « au plus N » (dépôt plafonné). REQUIS : « il en faut N » (dépôt plafonné + accusé
 * refusé tant qu'il manque des documents).
 */

export const MODES = ['PLAFOND', 'REQUIS'];

export function nbModeValide(v) {
  return MODES.includes(v) ? v : 'PLAFOND';
}

export function nbDocumentsValide(v) {
  const n = Math.round(Number(v) || 0);
  return n > 0 ? Math.min(99, n) : 0;
}

export function plafondAtteint(nbFichiers, nbDocuments) {
  return Number(nbDocuments) > 0 && (Number(nbFichiers) || 0) >= Number(nbDocuments);
}

export function manquePourRequis({ nb_mode, nb_documents, nb_fichiers }) {
  if (nbModeValide(nb_mode) !== 'REQUIS' || !(Number(nb_documents) > 0)) return 0;
  return Math.max(0, Number(nb_documents) - (Number(nb_fichiers) || 0));
}

export function peutAccuser({ nb_mode, nb_documents, nb_fichiers }) {
  return manquePourRequis({ nb_mode, nb_documents, nb_fichiers }) === 0;
}

/** Le résumé affiché : « 3 / 5 documents », « 2 documents (au plus 5) », ou « 2 documents ». */
export function resumeNb({ nb_mode, nb_documents, nb_fichiers }) {
  const n = Number(nb_fichiers) || 0;
  const cible = Number(nb_documents) || 0;
  if (cible <= 0) return `${n} document${n > 1 ? "s" : ""}`;
  if (nbModeValide(nb_mode) === "REQUIS") return `${n} / ${cible} document${cible > 1 ? "s" : ""}`;
  return `${n} document${n > 1 ? "s" : ""} (au plus ${cible})`;
}

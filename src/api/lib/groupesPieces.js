/**
 * UNE PIÈCE À FOURNIR N'A JAMAIS DE « OU ». Les deux sont exigées, toujours.
 *
 * L'HISTOIRE, parce qu'elle explique la forme de cette règle. Les pièces ont d'abord eu un
 * regroupement « OU » emprunté aux documents (`or_group`, migration 052), pour dire « carte
 * d'identité OU justificatif ». En pratique ça n'a produit que des dégâts :
 *
 * · une variante DÉSACTIVÉE gardait le groupe collé à elle. Sur RS7404, « Justificatif » dormait
 *   attaché à « Pièce d'identité » : le parcours annonçait un choix entre une seule option, et
 *   réactiver la seconde ne rendait pas les deux pièces exigées — il les rendait
 *   INTERCHANGEABLES, en silence. L'organisme croyait demander deux documents, il n'en obtenait
 *   qu'un ;
 * · et l'écran ne laissait aucune place pour poser la seconde pièce APRÈS la première : ajoutée,
 *   elle venait s'empiler dans la carte de la première au lieu de devenir une étape.
 *
 * D'où le retrait complet, demandé par l'organisme. Ce qu'on veut d'une pièce, c'est qu'elle
 * arrive ; s'il faut n'en demander qu'une selon le dossier, `applies_when` (migration 140) le dit
 * déjà, pièce par pièce, et sans rendre les autres facultatives par effet de bord.
 *
 * La colonne `or_group` RESTE en base : elle sert toujours aux documents, et une migration pour
 * effacer des valeurs devenues inertes ne vaut pas son risque. On les ignore, simplement — à la
 * lecture comme à l'écriture, pour que la base se nettoie d'elle-même au premier enregistrement.
 */

/* Une pièce se reconnaît à son `doc_type` À LA LECTURE, mais l'enregistrement n'envoie que
   `{slug, active, or_group, applies_when}` — sans `doc_type`. Les deux marques sont donc
   acceptées : sans ça, la règle vaudrait à l'affichage et pas à la sauvegarde, et la base
   garderait éternellement ses groupes fantômes. */
const estPiece = (s) => s.doc_type === 'PIECE' || String(s.slug || '').startsWith('piece:');

/**
 * Renvoie une COPIE des étapes où aucune pièce ne porte de groupe « OU ».
 * Les documents ne sont pas touchés : leur « OU » passe par les équivalences d'organisme, et
 * l'appliquer ici dissoudrait des équivalences qui ne nous appartiennent pas.
 */
function normaliserGroupesPieces(steps) {
    return steps.map((s) => (estPiece(s) && s.or_group ? { ...s, or_group: null } : s));
}

module.exports = { normaliserGroupesPieces, estPiece };

/**
 * UN « OU » ENTRE PIÈCES N'EXISTE QU'À PARTIR DE DEUX VARIANTES ACTIVES.
 *
 * LE PIÈGE, constaté sur la formation RS7404. Deux pièces partageaient un groupe « OU » —
 * « Pièce d'identité » (active) et « Justificatif » (INACTIVE). À l'écran, le parcours annonçait
 * donc un choix… entre une seule option. Et surtout : réactiver « Justificatif » ne rendait pas
 * les deux pièces exigées, il les rendait INTERCHANGEABLES, en silence, parce que le groupe était
 * resté collé à la variante endormie. L'organisme croyait demander deux documents, il n'en
 * obtenait qu'un.
 *
 * LA RÈGLE : un groupe se compte sur ses membres ACTIFS. En dessous de deux, il ne veut plus rien
 * dire et disparaît. Désactiver une variante dissout donc le choix au lieu de le laisser en
 * embuscade, et la réactiver plus tard donne deux pièces indépendantes — les deux exigées, ce qui
 * est le comportement par DÉFAUT et attendu.
 *
 * Appliquée À LA LECTURE autant qu'à l'écriture : à la lecture pour que les parcours déjà
 * enregistrés se présentent correctement sans qu'on ait à les rouvrir, à l'écriture pour que la
 * base finisse par se nettoyer d'elle-même. Aucune migration : c'est une règle de sens, pas de
 * schéma, et elle vaut avant comme après.
 */

/* Une pièce se reconnaît à son `doc_type` À LA LECTURE, mais l'enregistrement n'envoie que
   `{slug, active, or_group, applies_when}` — sans `doc_type`. Les deux marques sont donc
   acceptées : sans ça, la règle s'appliquerait à l'affichage et pas à la sauvegarde, et la base
   garderait éternellement des groupes fantômes. */
const estPiece = (s) => s.doc_type === 'PIECE' || String(s.slug || '').startsWith('piece:');

/**
 * Renvoie une COPIE des étapes où tout groupe de pièces à moins de deux membres actifs est retiré.
 * Ne touche ni aux documents (leurs équivalences sont gérées par l'organisme, pas ici) ni à
 * l'ordre : seul `or_group` change.
 */
function normaliserGroupesPieces(steps) {
    const actifsParGroupe = new Map();
    for (const s of steps) {
        if (!estPiece(s) || !s.or_group || !s.active) continue;
        actifsParGroupe.set(s.or_group, (actifsParGroupe.get(s.or_group) || 0) + 1);
    }
    return steps.map((s) => {
        if (!estPiece(s) || !s.or_group) return s;
        return (actifsParGroupe.get(s.or_group) || 0) >= 2 ? s : { ...s, or_group: null };
    });
}

module.exports = { normaliserGroupesPieces, estPiece };

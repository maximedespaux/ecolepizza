/**
 * LE LIEN D'UN DOSSIER — la fiche du stagiaire, ouverte sur CE dossier.
 *
 * Du JavaScript pur, sans JSX, pour la raison écrite en tête de `etapes.js` : les tests de
 * `src/api/test` peuvent l'importer et l'éprouver.
 *
 * UNE FICHE, PLUSIEURS DOSSIERS. La fiche porte un onglet par dossier — NIV1H puis RS7404, c'est le
 * parcours ordinaire de l'école — et s'ouvrait toujours sur le premier. Venu d'une ligne qui désigne
 * UN dossier (« Derniers dossiers », sur le tableau de bord, demandé le 2026-09-21), on serait tombé
 * sur un autre sans s'en apercevoir : le parcours affiché n'aurait pas été celui qu'on venait de
 * voir à 62 %. Le lien dit donc lequel (`?dossier=`), et la fiche le sélectionne.
 */

/** L'adresse de la fiche, ouverte sur ce dossier. `e` : une ligne de GET /enrollments. */
export const lienDossier = (e) =>
    `/stagiaires/${encodeURIComponent(e.learner_id)}?dossier=${encodeURIComponent(e.id)}`;

/**
 * Le dossier que la fiche affiche : celui qu'on a choisi — l'onglet, sinon le lien — s'il
 * appartient bien à CE stagiaire, sinon le premier.
 *
 * UN IDENTIFIANT ÉTRANGER NE PASSE PAS. Lien ancien, dossier supprimé depuis, adresse retouchée :
 * repris tel quel, il ferait charger sur cette fiche le parcours d'un AUTRE dossier — peut-être
 * celui d'une autre personne —, et y préparer un document le rattacherait à ce dossier-là.
 */
export function dossierAffiche(enrollments, voulu) {
    const liste = enrollments || [];
    if (voulu != null && voulu !== "") {
        const trouve = liste.find((x) => String(x.id) === String(voulu));
        if (trouve) return trouve.id;
    }
    return liste.length ? liste[0].id : null;
}

/**
 * LES MÉMOS DU PERSONNEL — ce que le serveur accepte d'écrire (demandé le 2026-09-22).
 *
 * Un pense-bête et une liste de choses à faire, dans la barre du haut et sur le tableau de bord.
 * Du JavaScript pur : les tests le lisent sans base. Les règles de visibilité (à qui appartient un
 * mémo, qui le voit, qui le coche) vivent dans le contrôleur, là où sont les requêtes qui les
 * appliquent.
 */

/** La borne de la colonne `memo.texte` (migration 176) : un pense-bête, pas un document. */
const MAX_TEXTE = 1000;

/**
 * « 2026-10-05 » si c'est une VRAIE date, `null` sinon. Le 30 février, « 05/10/2026 » ou un texte
 * libre ne passent pas : une échéance fausse ferait compter un rappel qui n'en est pas un.
 */
function dateValide(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v).trim());
    if (!m) return null;
    const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(annee, mois - 1, jour));
    if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
    if (annee < 2000 || annee > 2100) return null;
    return m[0];
}

/**
 * Le corps d'un NOUVEAU mémo → `{ valeurs }` ou `{ erreur }`.
 *
 * Le texte est obligatoire et borné. L'échéance est facultative, mais si elle est donnée elle doit
 * être une vraie date — la refuser vaut mieux que l'ignorer : on croirait avoir posé un rappel.
 * Le partage n'est vrai que s'il est explicitement vrai : un mémo naît privé.
 */
function lireNouveauMemo(b = {}) {
    const texte = String(b.texte == null ? '' : b.texte).replace(/\r\n?/g, '\n').trim();
    if (!texte) return { erreur: 'Écrivez le mémo avant de l’ajouter.' };
    if (texte.length > MAX_TEXTE) return { erreur: `Un mémo tient en ${MAX_TEXTE} caractères au plus.` };
    let echeance = null;
    if (b.echeance !== undefined && b.echeance !== null && b.echeance !== '') {
        echeance = dateValide(b.echeance);
        if (!echeance) return { erreur: 'Échéance illisible, choisissez une date dans le calendrier.' };
    }
    return { valeurs: { texte, echeance, partage: b.partage === true } };
}

/**
 * Ce qu'une modification demande → `{ fait?, partage? }` ou `{ erreur }`. Deux gestes seulement :
 * cocher (ou décocher), et partager (ou reprendre). Chacun doit être un vrai booléen — « oui »,
 * 1 ou "true" ne cochent rien, pour qu'une réponse illisible ne passe pas pour un accord.
 */
function lireModification(b = {}) {
    const out = {};
    for (const k of ['fait', 'partage']) {
        if (b[k] === undefined) continue;
        if (typeof b[k] !== 'boolean') return { erreur: `« ${k} » attend vrai ou faux.` };
        out[k] = b[k];
    }
    if (!Object.keys(out).length) return { erreur: 'Rien à modifier.' };
    return { modification: out };
}

module.exports = { MAX_TEXTE, dateValide, lireNouveauMemo, lireModification };

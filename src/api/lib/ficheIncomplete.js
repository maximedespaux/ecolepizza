/**
 * CE QUI MANQUE À UNE FICHE STAGIAIRE — le bandeau de la fiche le nomme (demandé le 2026-09-21).
 *
 * POURQUOI UN BANDEAU. La carte « Contact & identité » n'affiche que ce qui est rempli : une ligne
 * vide disparaît (`Row`, StagiaireDetail). Une adresse absente ne laissait donc AUCUNE trace à
 * l'écran — et on ne remarque pas une ligne qui n'est pas là. Or c'est elle qui part chez les
 * partenaires, et elle qui s'imprime sur les documents.
 *
 * DEUX RAISONS DE MANQUER, et le bandeau dit laquelle :
 *   · ce que l'école ENVOIE AUX PARTENAIRES — la liste qu'elle a cochée (organization.
 *     partner_fields, migration 135), mais seulement si un partenaire reçoit effectivement des
 *     coordonnées (`aDesDestinataires`) : la 131 a démarré à zéro destinataire, et annoncer
 *     « transmis aux partenaires » quand rien ne part vers personne serait faux ;
 *   · l'ESSENTIEL, partenaires ou non : de quoi joindre le stagiaire (téléphone et e-mail, déjà
 *     exigés à la création mais pas à la modification — une fiche importée peut n'en avoir aucun)
 *     et son adresse, qui figure sur ses documents.
 *
 * `formation` et `dates_session` ne sont jamais réclamés ici : ils viennent de la session, pas de
 * la fiche. Les champs de l'ENTREPRISE non plus : ils se complètent sur la fiche entreprise.
 */
const { CHAMPS_TRANSMISSIBLES } = require('./consentements.js');

/* La colonne de la fiche derrière chaque champ « stagiaire » du catalogue — LA MÊME que lit
   l'export envoyé aux partenaires (consentement.controller, `valeurs`). Un test vérifie qu'elles
   ne divergent pas : sinon le bandeau dirait complet un champ que l'export enverrait vide. */
const COLONNES = {
    civilite: 'civility', nom: 'last_name', prenom: 'first_name',
    email: 'email', telephone: 'phone',
    adresse: 'address', code_postal: 'zip_code', ville: 'town',
    statut: 'professional_status',
};
/* Le projet est six cases en base ; l'export n'envoie que celles qui sont cochées. Aucune cochée,
   c'est un projet vide. */
const PROJETS = ['project_creation', 'project_takeover', 'project_oven', 'project_truck', 'project_job', 'project_improvement'];

/** Toujours vérifiés, que l'école transmette ou non. */
const ESSENTIELS = ['email', 'telephone', 'adresse', 'code_postal', 'ville'];

// Des espaces ne sont pas une adresse : la saisie les laisse passer, l'export les enverrait tels quels.
const vide = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * @param learner   la ligne `learner` (SELECT *)
 * @param transmis  les clés que l'école envoie aux partenaires — `[]` si personne ne reçoit rien
 * @returns [{ cle, libelle, partenaires }] dans l'ordre du catalogue ; vide si rien ne manque
 */
function champsManquants(learner, transmis = []) {
    const l = learner || {};
    const envoyes = new Set(transmis || []);
    const out = [];
    for (const cle of Object.keys(CHAMPS_TRANSMISSIBLES)) {
        if (cle !== 'projet' && !COLONNES[cle]) continue; // session ou entreprise
        const partenaires = envoyes.has(cle);
        if (!partenaires && !ESSENTIELS.includes(cle)) continue;
        const manque = cle === 'projet'
            ? !PROJETS.some((c) => Number(l[c]) === 1)
            : vide(l[COLONNES[cle]]);
        if (manque) out.push({ cle, libelle: CHAMPS_TRANSMISSIBLES[cle].libelle, partenaires });
    }
    return out;
}

module.exports = { champsManquants, COLONNES, PROJETS, ESSENTIELS };

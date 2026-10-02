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
const { COLONNES_PHRASE, phraseProjet } = require('./projet.js');

/* La colonne de la fiche derrière chaque champ « stagiaire » du catalogue — LA MÊME que lit
   l'export envoyé aux partenaires (consentement.controller, `valeurs`). Un test vérifie qu'elles
   ne divergent pas : sinon le bandeau dirait complet un champ que l'export enverrait vide. */
const COLONNES = {
    civilite: 'civility', nom: 'last_name', prenom: 'first_name',
    email: 'email', telephone: 'phone',
    adresse: 'address', code_postal: 'zip_code', ville: 'town',
    statut: 'professional_status',
};
/* Le projet est une série de cases, dont l'export fait une phrase (lib/projet.js). Il MANQUE quand
   cette phrase serait vide : la même fonction que l'export, donc la même réponse que ce que
   recevrait le partenaire. L'avancement (local trouvé, financement…), qui ne lui part pas, ne suffit
   donc pas à dire le projet renseigné. `PROJETS` : les colonnes que cette règle lit. */
const PROJETS = COLONNES_PHRASE;

/** Toujours vérifiés, que l'école transmette ou non. */
const ESSENTIELS = ['email', 'telephone', 'adresse', 'code_postal', 'ville'];

/* L'ADRESSE POSTALE — les trois champs qu'une ENTREPRISE peut couvrir pour un dossier pro. */
const ADRESSE_POSTALE = new Set(['adresse', 'code_postal', 'ville']);

// Des espaces ne sont pas une adresse : la saisie les laisse passer, l'export les enverrait tels quels.
const vide = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Le CONTEXTE « adresse » d'un stagiaire, tiré de ses dossiers — pour décider si on réclame son
 * adresse postale ou si l'entreprise la couvre.
 * @param dossiers  [{ financing, adresse, code_postal, ville }] — une ligne par dossier, l'adresse
 *   étant celle de l'ENTREPRISE du dossier (vide si le dossier n'en a pas).
 * @returns { aUnDossierParticulier, adresseEntreprise:{adresse,code_postal,ville} }
 */
function contexteAdresse(dossiers) {
    const d = dossiers || [];
    const pro = d.filter((x) => x.financing === 'PROFESSIONNEL');
    const premier = (cle) => { for (const x of pro) if (!vide(x[cle])) return x[cle]; return null; };
    return {
        // Un dossier NON professionnel (particulier) exige l'adresse du stagiaire : ses documents s'y impriment.
        aUnDossierParticulier: d.some((x) => x.financing !== 'PROFESSIONNEL'),
        adresseEntreprise: { adresse: premier('adresse'), code_postal: premier('code_postal'), ville: premier('ville') },
    };
}

/**
 * @param learner   la ligne `learner` (SELECT *)
 * @param transmis  les clés que l'école envoie aux partenaires — `[]` si personne ne reçoit rien
 * @param opts      { aUnDossierParticulier, adresseEntreprise } — le CONTEXTE des dossiers (cf.
 *   contexteAdresse). Décision de l'école (2026-10-02) : pour un stagiaire dont AUCUN dossier n'est
 *   particulier, un champ d'adresse postale que l'entreprise d'un dossier PRO renseigne n'est PLUS
 *   réclamé — l'entreprise paie, et ses coordonnées tiennent lieu des siennes sur les documents et
 *   l'export. L'e-mail et le téléphone restent exigés (c'est par eux qu'on joint la personne). SANS
 *   contexte (appel à deux arguments), on exige comme avant — l'adresse reste toujours réclamée.
 * @returns [{ cle, libelle, partenaires }] dans l'ordre du catalogue ; vide si rien ne manque
 */
function champsManquants(learner, transmis = [], opts = {}) {
    const l = learner || {};
    const envoyes = new Set(transmis || []);
    const aUnDossierParticulier = opts.aUnDossierParticulier !== false; // défaut : on exige (comme avant)
    const entreprise = opts.adresseEntreprise || null;
    const out = [];
    for (const cle of Object.keys(CHAMPS_TRANSMISSIBLES)) {
        if (cle !== 'projet' && !COLONNES[cle]) continue; // session ou entreprise
        /* ADRESSE COUVERTE PAR L'ENTREPRISE : aucun dossier particulier, et l'entreprise d'un dossier
           pro renseigne ce champ → on ne le réclame plus (ni essentiel, ni « envoyé aux partenaires »). */
        if (ADRESSE_POSTALE.has(cle) && !aUnDossierParticulier && entreprise && !vide(entreprise[cle])) continue;
        const partenaires = envoyes.has(cle);
        if (!partenaires && !ESSENTIELS.includes(cle)) continue;
        const manque = cle === 'projet' ? phraseProjet(l) === '' : vide(l[COLONNES[cle]]);
        if (manque) out.push({ cle, libelle: CHAMPS_TRANSMISSIBLES[cle].libelle, partenaires });
    }
    return out;
}

module.exports = { champsManquants, contexteAdresse, COLONNES, PROJETS, ESSENTIELS };

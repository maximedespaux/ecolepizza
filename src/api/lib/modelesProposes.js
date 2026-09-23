/**
 * DES MODÈLES PROPOSÉS À L'OUVERTURE DE L'ÉDITEUR, quand l'organisme n'a encore rien écrit.
 *
 * POURQUOI (2026-09-22). Le « Droit à l'image » de l'école est un fichier Word que l'application
 * n'utilise pas — son modèle s'affiche « à créer » — et ses cases « □ Autorise □ N'autorise pas » ne
 * se cochaient pas en ligne. Le recomposer à la main, jetons compris, c'est le travail qu'on peut lui
 * éviter : l'éditeur s'ouvre sur son document, les cases remplacées par les jetons qui se cochent
 * selon la réponse du stagiaire (cf. lib/consentements.js, `valeursJetons`).
 *
 * RIEN N'EST ÉCRIT EN BASE PAR ICI. Le modèle est seulement PROPOSÉ à l'éditeur, qui le dit ; il ne
 * devient le document de l'organisme que lorsque quelqu'un l'enregistre, après l'avoir relu. Un modèle
 * déjà composé n'est jamais remplacé : la proposition ne vaut que pour une page blanche.
 *
 * La même idée que les modèles du jury (lib/modelesJury.js), sans bouton : un seul modèle, proposé
 * là où l'on vient justement l'écrire.
 */
const { TOKEN_CATALOG } = require('./tokens.js');

const LIBELLES = {};
for (const g of TOKEN_CATALOG) for (const t of g.tokens) LIBELLES[t.key] = t.label;

/** Un jeton, dans la forme que produit l'éditeur, avec le libellé de la palette. */
const jeton = (cle) =>
    `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${LIBELLES[cle]}">${LIBELLES[cle]}</span>`;
const P = (contenu, style = '') => `<p${style ? ` style="${style}"` : ''}>${contenu}</p>`;
const liste = (points) => `<ul>${points.map((p) => `<li><p>${p}</p></li>`).join('')}</ul>`;
const CENTRE = 'text-align: center;';
const JUSTIF = 'text-align: justify;';
const ESPACE = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';

/**
 * LE DOCUMENT DE L'ÉCOLE, DANS SON ORDRE ET SES MOTS — le titre, l'objet, l'identité du stagiaire,
 * puis ses deux autorisations, chacune avec ses cases, et la signature.
 *
 * TROIS ÉCARTS, VOLONTAIRES, que l'écran de l'éditeur ne cache pas (cf. `note`) :
 *   · DEUX PAIRES DE CASES au lieu d'une : l'école a choisi de séparer les photos et les partenaires
 *     (2026-09-22). Un consentement porte sur une chose ; une seule case pour deux engageait sur les
 *     deux à la fois.
 *   · LES SUPPORTS SONT CEUX DE LA QUESTION POSÉE au stagiaire (site internet, réseaux sociaux,
 *     lettres d'information), sans l'adresse du site ni le nom des réseaux : le document et la phrase
 *     figée au registre doivent dire la même chose. L'école peut les nommer, en disant la même chose.
 *   · LA LISTE DES INFORMATIONS TRANSMISES est {Données partenaires} : celle que l'application a
 *     annoncée au stagiaire, et non une liste recopiée qui finirait par la contredire.
 * La ligne « Remise des documents pédagogiques □ Oui » n'y est pas : c'était une troisième case que
 * personne ne pouvait cocher en ligne. Une remise se trace par les « Documents remis au stagiaire »
 * de la formation, dont le stagiaire accuse réception dans son espace.
 */
const DROIT_IMAGE = {
    note: 'Il reprend votre document «\u00a0Droit à l’image\u00a0», avec deux paires de cases (photos, partenaires) '
        + 'qui se cochent selon la réponse du stagiaire. Relisez-le, complétez-le si besoin, puis enregistrez\u00a0: '
        + 'rien n’est enregistré avant.',
    body: [
        P('<span style="font-size: 20pt;"><strong>Autorisation</strong></span>', CENTRE),
        P('<em>Cette autorisation devra être conservée par l’organisateur</em>', CENTRE),
        P('<br>'),
        P('<strong>Objet&nbsp;:</strong>'),
        liste(['Autorisation de publication de photographies', 'Communication des données personnelles à nos partenaires']),
        P('<br>'),
        P(`Je soussigné(e) ${jeton('Personne')}`),
        /* L'ADRESSE SUR SA LIGNE : à la suite, elle poussait le téléphone en bout de ligne, et le
           numéro se coupait en deux au rendu. */
        P(`Adresse&nbsp;: ${jeton('Adresse')}`),
        P(`Mail&nbsp;: ${jeton('Email')}${ESPACE}Téléphone&nbsp;: ${jeton('Téléphone')}`),
        P('<br>'),
        P('<strong>1. Photographies</strong>'),
        P(`${jeton('Case photos oui')} Autorise${ESPACE}${jeton('Case photos non')} N’autorise pas`),
        P(`${jeton('Organisme')} à diffuser des photographies prises au cours de la formation dans le but de `
          + 'promouvoir ses formations. Cette autorisation est valable pour&nbsp;:', JUSTIF),
        liste(['la publication sur son site internet&nbsp;;', 'la publication sur ses réseaux sociaux&nbsp;;',
            'l’envoi de ses lettres d’information, par e-mail ou par SMS.']),
        P('<br>'),
        P('<strong>2. Partenaires</strong>'),
        P(`${jeton('Case partenaires oui')} Autorise${ESPACE}${jeton('Case partenaires non')} N’autorise pas`),
        P(`${jeton('Organisme')} à transmettre ${jeton('Données partenaires')} à ses partenaires, dans le cadre de&nbsp;:`, JUSTIF),
        liste(['la communication d’exclusivités sur leurs produits ou services&nbsp;;',
            'l’envoi d’informations commerciales et promotionnelles liées à leurs activités.']),
        /* CE QUE LA CASE NE GOUVERNE PAS, DIT SOUS LA CASE (2026-09-23). Depuis que l'identité
           est transmise dans tous les cas, un document qui n'en parlerait pas ferait signer que
           « n'autorise pas » retient tout — et le papier signé dirait le contraire de ce que
           l'école fait. La phrase se tait d'elle-même si l'école ne transmet pas le nom : le
           jeton sort vide, et `lignesVides` ne laisse pas de trou. */
        P(`${jeton('Identité partenaires')} sont transmis dans tous les cas, afin que ces partenaires `
            + 'sachent qui l’école a formé.', JUSTIF),
        P('<br>'),
        P(`Fait à ${jeton('Ville organisme')}, le ${jeton('Jour1')}`),
        P('Signature&nbsp;:'),
        P(jeton('Signature stagiaire')),
    ].join(''),
};

/** Par slug : le modèle proposé à une page blanche. */
const MODELES_PROPOSES = { 'droit-image': DROIT_IMAGE };

module.exports = { MODELES_PROPOSES };

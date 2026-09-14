/**
 * LES MODÈLES DE DOCUMENT DU JURY, prêts à poser.
 *
 * POURQUOI ILS SONT ICI, en code, et pas dans une migration. Le corps d'un modèle est du HTML :
 * il porte des `&nbsp;`, des apostrophes et des guillemets. Écrit dans un fichier SQL, chacun de
 * ces caractères devient un piège — la migration 146 a été refusée par le client SQL de
 * l'organisme parce qu'un découpage naïf sur le point-virgule coupait à l'intérieur d'une
 * chaîne. Un `&nbsp;` en contient un. On passe donc par la route d'enregistrement normale des
 * modèles, celle qu'emploie l'éditeur.
 *
 * CE SONT DES POINTS DE DÉPART, pas des documents figés : une fois posés, ils s'ouvrent dans
 * l'éditeur comme n'importe quel modèle et se retouchent librement. Les reposer ne les écrase
 * pas — un modèle déjà présent est laissé tel quel, sinon un clic malheureux effacerait la mise
 * en page de l'organisme.
 */

/** Un jeton, dans la forme que produit l'éditeur (cf. body_html des modèles existants). */
const jeton = (cle, libelle) =>
    `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${libelle}">${libelle}</span>`;

const P = (contenu, style = '') => `<p${style ? ` style="${style}"` : ''}>${contenu}</p>`;
const GAUCHE = 'line-height: 1.2; text-align: left;';
const CENTRE = 'line-height: 1.2; text-align: center;';

/**
 * LA GRILLE DU CANDIDAT — le document signé à la clôture.
 *
 * IL REPREND LES QUATRE COLONNES DU PAPIER (compétence, mise en situation, validation,
 * remarque) parce que c'est cette trace qu'un contrôle vient chercher : « 5 compétences sur 7 »
 * ne dit ni lesquelles ni pourquoi. La synthèse par compétence est là aussi, juste au-dessus du
 * verdict, pour le candidat.
 */
const GRILLE_JURY = {
    slug: 'grille-jury',
    label: 'Grille d’évaluation du jury',
    doc_type: 'EVALUATION',
    /* SIGNATAIRES : le stagiaire et l'organisme passent par les rôles connus. Les membres du
       jury signent dans le tableau {JuryMembres}, à la main sur le document imprimé — ils ne
       sont pas des comptes « signataires » du parcours, et leur nombre varie d'une session à
       l'autre. */
    signers: ['STAGIAIRE', 'ORG'],
    body: [
        P(`<span style="font-size: 20pt;"><strong>Grille d’évaluation</strong></span>`, CENTRE),
        P(`<span style="font-size: 12pt;">${jeton('Formation', 'Intitulé')} ${jeton('Code', 'Code formation')}</span>`, CENTRE),
        P('<br>'),
        P(`<strong>Nom / Prénom du candidat :</strong> ${jeton('Personne', 'Nom complet')}`
          + `&nbsp;&nbsp;&nbsp;&nbsp;<strong>En date du</strong> ${jeton('JuryDate', 'Date de clôture de l’évaluation')}`, GAUCHE),
        P('<br>'),
        P(jeton('JuryCritères', 'Grille complète, critère par critère'), GAUCHE),
        P('<br>'),
        P(`<strong>Nombre de compétences validées : </strong>${jeton('JuryCompétences', 'Compétences validées')}`, GAUCHE),
        P(`<strong>Avis : </strong>${jeton('JuryAvis', 'Avis du jury')}`
          + `&nbsp;&nbsp;·&nbsp;&nbsp;<strong>Rattrapage : </strong>${jeton('JuryRattrapage', 'Rattrapage')}`, GAUCHE),
        P(`<strong>Observations : </strong>${jeton('JuryObservations', 'Observations du jury')}`, GAUCHE),
        P('<br>'),
        P('<strong>Membres du jury</strong>', GAUCHE),
        P(jeton('JuryMembres', 'Membres du jury et signatures'), GAUCHE),
        P('<br>'),
        P(`${jeton('Signature stagiaire', 'Signature du stagiaire')}&nbsp;&nbsp;&nbsp;&nbsp;`
          + `${jeton('Signature organisme', 'Signature de l’organisme')}`, GAUCHE),
    ].join(''),
};

const MODELES = [GRILLE_JURY];

module.exports = { MODELES, GRILLE_JURY, jeton };

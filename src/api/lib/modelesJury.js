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

/**
 * LE PROCÈS-VERBAL DE LA COMMISSION DE DÉLIBÉRATION — un par session, pas par candidat.
 *
 * IL SUIT LE DOCUMENT DE L'ORGANISME dans son ordre : la séance et sa composition, les
 * candidats, la délibération, les aléas, les signatures, puis les deux annexes. Cet ordre n'est
 * pas cosmétique — c'est celui qu'un instructeur lit, et le dossier RNCP n° 21983 a été refusé
 * parce que ses PV ne disaient pas, dans cet ordre-là, quelle certification avait été visée.
 *
 * {Jury mention} N'EST PAS DÉCORATIF : la majorité extérieure et l'absence de lien
 * formateur-candidat sont des conditions de validité de la session. Imprimées, elles sont
 * opposables ; absentes, elles se supposent.
 */
const PV_JURY = {
    slug: 'pv-jury',
    label: 'Procès-verbal de jury de certification',
    doc_type: 'PV',
    /* AUCUN SIGNATAIRE ÉLECTRONIQUE. Le PV se signe à la main, en séance, par les membres
       présents — c'est ce que fait le document papier actuel, avec ses cases vides. Le déclarer
       « à signer par le stagiaire » le ferait apparaître dans le parcours de chacun, alors
       qu'il n'appartient à personne. */
    signers: [],
    body: [
        P(`<span style="font-size: 16pt;"><strong>PROCÈS-VERBAL DE JURY DE CERTIFICATION</strong></span>`, CENTRE),
        P(`<span style="font-size: 12pt;">${jeton('Certification', 'Certification visée')} ${jeton('Code RNCP', 'Numéro RNCP')}</span>`, CENTRE),
        P(`N° ${jeton('PV', 'Numéro de procès-verbal')}`, CENTRE),
        P('<br>'),
        P(`Le ${jeton('Date examen', "Date de la session d'examen")} à ${jeton('PVHeure', 'Heure de la commission')}, `
          + `les membres du jury se sont réunis en commission de délibération à `
          + `${jeton('Lieu examen', 'Lieu de la session (adresse)')}.`, GAUCHE),
        P(`Le jury et la commission de délibération sont composés de : ${jeton('PVJury', 'Composition de la commission')}.`, GAUCHE),
        P(`Un représentant de l’organisme certificateur était présent : `
          + `${jeton('PVReprésentant', 'Représentant du certificateur')}, `
          + `${jeton('PVFonction représentant', 'Fonction du représentant')}.`, GAUCHE),
        P(`${jeton('Jury mention', 'Attestation de composition du jury')}`, GAUCHE),
        P('<br>'),
        P('<strong>1. Candidats</strong>', GAUCHE),
        P(`${jeton('PVInscrits', 'Nombre de candidats inscrits')} candidat(s) inscrit(s) au passage de la `
          + `certification pour la session du ${jeton('Date examen', "Date de la session d'examen")}.`, GAUCHE),
        P('<br>'),
        P('<strong>2. Délibération des résultats</strong>', GAUCHE),
        P(`${jeton('PVAdmis', 'Nombre de candidats admis')} candidat(s) admis · `
          + `${jeton('PVNonAdmis', 'Nombre de candidats non admis')} candidat(s) non admis.`, GAUCHE),
        P(`La liste des candidats avec décision de certification est transmise en annexe 2 du présent procès-verbal.`, GAUCHE),
        P('<br>'),
        P('<strong>3. Aléas et dysfonctionnements</strong>', GAUCHE),
        P(jeton('PVAléas', 'Aléas et dysfonctionnements'), GAUCHE),
        P('<br>'),
        P('<strong>Signatures de la commission de délibération</strong>', GAUCHE),
        P(jeton('PVMembres', 'Émargement des membres de la commission'), GAUCHE),
        P('<br>'),
        P('<strong>Annexe 1 : feuille des membres présents de la commission de délibération</strong>', GAUCHE),
        P(jeton('PVMembres', 'Émargement des membres de la commission'), GAUCHE),
        P('<br>'),
        P('<strong>Annexe 2 : liste des candidats et décision de certification</strong>', GAUCHE),
        P(jeton('PVCandidats', 'Liste des candidats et décisions'), GAUCHE),
    ].join(''),
};

const MODELES = [GRILLE_JURY, PV_JURY];

module.exports = { MODELES, GRILLE_JURY, PV_JURY, jeton };

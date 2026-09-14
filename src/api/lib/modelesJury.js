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
const JUSTIF = 'line-height: 1.3; text-align: justify;';

/**
 * LA GRILLE DU CANDIDAT — le document signé à la clôture.
 *
 * CALQUÉ SUR LE DOCUMENT DE L'ORGANISME, dans son ordre et ses mots : le titre, l'identité du
 * candidat et la date, le tableau à quatre colonnes, puis le pied — compétences validées, avis,
 * rattrapage, signatures du jury. Un modèle « inspiré de » aurait obligé à comparer ligne à
 * ligne avec le papier pour vérifier que rien n'a bougé.
 *
 * LE TABLEAU DES MEMBRES EST POSÉ APRÈS le bloc de synthèse, et non dans une de ses cellules :
 * un tableau imbriqué dans la dernière cellule d'une ligne « retombe » sous la colonne voisine
 * au rendu LibreOffice (cf. CLAUDE.md § 3). La page reste fidèle, la mise en page tient.
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
        P(`<span style="font-size: 13pt;"><strong>${jeton('Formation', 'Intitulé')} ${jeton('Code', 'Code formation')}</strong></span>`, CENTRE),
        P('<br>'),
        P(`<strong>Nom / Prénom du Candidat :</strong>&nbsp; ${jeton('Personne', 'Nom complet')}`
          + `&nbsp;&nbsp;&nbsp;&nbsp;<strong>En date du</strong> ${jeton('JuryDate', 'Date de clôture de l’évaluation')}`, GAUCHE),
        P('<br>'),
        P(jeton('JuryCritères', 'Grille complète, critère par critère'), GAUCHE),
        P('<br>'),
        `<table width="100%"><tbody>`
        + `<tr><td valign="top"><strong>Nombre de compétences validées :</strong></td>`
        + `<td valign="top">${jeton('JuryCompétences', 'Compétences validées')}</td></tr>`
        + `<tr><td valign="top"><strong>Avis</strong></td>`
        + `<td valign="top">${jeton('JuryAvis', 'Avis du jury')}</td></tr>`
        + `<tr><td valign="top"><strong>Rattrapage</strong></td>`
        + `<td valign="top">${jeton('JuryRattrapage', 'Rattrapage')}</td></tr>`
        + `</tbody></table>`,
        P('<br>'),
        P('<strong>Noms &amp; Prénoms du Jury</strong>', GAUCHE),
        P(jeton('JuryMembres', 'Membres du jury et signatures'), GAUCHE),
        P('<br>'),
        P(`<strong>Observations :</strong> ${jeton('JuryObservations', 'Observations du jury')}`, GAUCHE),
        P('<br>'),
        P(`${jeton('Signature stagiaire', 'Signature du stagiaire')}&nbsp;&nbsp;&nbsp;&nbsp;`
          + `${jeton('Signature organisme', 'Signature de l’organisme')}`, GAUCHE),
    ].join(''),
};

/**
 * LE PROCÈS-VERBAL DE LA COMMISSION DE DÉLIBÉRATION — un par session, pas par candidat.
 *
 * REPRIS MOT POUR MOT DU DOCUMENT DE L'ORGANISME, y compris ses formules : « Il a été établi et
 * signé une feuille d'émargement des membres présents, annexée au présent procès-verbal », « le
 * président déclare que la commission peut valablement délibérer ». Ces phrases ne sont pas du
 * remplissage — ce sont elles qui attestent que la séance s'est tenue régulièrement, et un
 * instructeur les cherche à leur place habituelle.
 *
 * {Jury mention} N'EST PAS DÉCORATIF : la majorité extérieure et l'absence de lien
 * formateur-candidat sont des conditions de validité de la session. Imprimées, elles sont
 * opposables ; absentes, elles se supposent.
 *
 * INSCRITS ET PRÉSENTÉS SONT DISTINGUÉS, comme sur le papier : un candidat absent est inscrit
 * et ne s'est pas présenté. Les confondre ferait attester une présence qui n'a pas eu lieu.
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
        P(`<span style="font-size: 18pt;"><strong>PROCÈS-VERBAL DE JURY DE CERTIFICATION</strong></span>`, CENTRE),
        P(`<span style="font-size: 13pt;"><strong>${jeton('Certification', 'Certification visée')} ${jeton('Code RNCP', 'Numéro RNCP')}</strong></span>`, CENTRE),
        /* LE NUMÉRO DE PV EST LE SEUL AJOUT au document de l'organisme. Son absence est
           précisément ce que l'instruction du dossier RNCP n° 21983 a reproché : sans lui, deux
           procès-verbaux d'une même certification ne se distinguent que par leur date. Il est
           posé là où un numéro se cherche — sous le titre — et rien d'autre n'a bougé. */
        P(`<span style="font-size: 11pt;">N° ${jeton('PV', 'Numéro de procès-verbal')}</span>`, CENTRE),
        P('<br>'),
        P(`<strong>Le ${jeton('Date examen', "Date de la session d'examen")} à ${jeton('PVHeure', 'Heure de la commission')}</strong>, `
          + `les membres du jury se sont réunis en commission de délibération au `
          + `<strong>${jeton('Lieu examen', 'Lieu de la session (adresse)')}</strong>. `
          + `Le jury et la commission de délibération sont tous deux composés de :`, JUSTIF),
        P(jeton('PVJuryListe', 'Composition de la commission (une par ligne)'), GAUCHE),
        P('<br>'),
        P(`Un représentant de l’organisme de certification était présent : `
          + `<strong>${jeton('PVReprésentant', 'Représentant du certificateur')}</strong>, `
          + `${jeton('PVFonction représentant', 'Fonction du représentant')}.`, JUSTIF),
        P('<br>'),
        P(`Il a été établi et signé une feuille d’émargement des membres présents, annexée au `
          + `présent procès-verbal.`, JUSTIF),
        P('<br>'),
        P(`Tous les membres étant présents, le président déclare que la commission peut `
          + `valablement délibérer, et que l’ordre du jour est le suivant :`, JUSTIF),
        P('-&nbsp;&nbsp;Candidats&nbsp;;<br>-&nbsp;&nbsp;Délibération des résultats.', GAUCHE),
        P('<br>'),
        P(`<span style="font-size: 12pt;"><strong><u>1. Candidats</u></strong></span>`, GAUCHE),
        P(`<strong>${jeton('PVInscrits', 'Nombre de candidats inscrits')} candidat(s)</strong> sont inscrits au `
          + `passage de la certification « ${jeton('Certification', 'Certification visée')} » pour la session du `
          + `<strong>${jeton('Date examen', "Date de la session d'examen")}</strong>.`, JUSTIF),
        P('<br>'),
        P(`Sur les <strong>${jeton('PVInscrits', 'Nombre de candidats inscrits')} candidat(s) inscrit(s)</strong>, `
          + `<strong>${jeton('PVPrésentés', 'Nombre de candidats présentés')}</strong> se sont présentés au passage de l’examen.`, JUSTIF),
        P(jeton('PVListePrésentés', 'Candidats présentés (une ligne par candidat)'), GAUCHE),
        P('<br>'),
        P(`<span style="font-size: 12pt;"><strong><u>2. Délibération des résultats</u></strong></span>`, GAUCHE),
        P(`-&nbsp;&nbsp;<strong>${jeton('PVInscrits', 'Nombre de candidats inscrits')} candidat(s) inscrit(s)</strong> :`, GAUCHE),
        P(jeton('PVListeCandidats', 'Candidats inscrits (une ligne par candidat)'), GAUCHE),
        P('<br>'),
        P(`-&nbsp;&nbsp;<strong>${jeton('PVAdmis', 'Nombre de candidats admis')} candidat(s) admis</strong> :`, GAUCHE),
        P(jeton('PVListeAdmis', 'Candidats admis (une ligne par candidat)'), GAUCHE),
        P('<br>'),
        P(`-&nbsp;&nbsp;<strong>${jeton('PVNonAdmis', 'Nombre de candidats non admis')} candidat(s) non admis</strong> :`, GAUCHE),
        P(jeton('PVListeNonAdmis', 'Candidats non admis (une ligne par candidat)'), GAUCHE),
        P('<br>'),
        P(`La liste des candidats avec décision de certification est transmise en annexe au `
          + `présent procès-verbal.`, JUSTIF),
        P('<br>'),
        P(`<span style="font-size: 12pt;"><strong><u>3. Aléas et dysfonctionnements</u></strong></span>`, GAUCHE),
        P(jeton('PVAléas', 'Aléas et dysfonctionnements'), JUSTIF),
        P('<br>'),
        P(`${jeton('Jury mention', 'Attestation de composition du jury')}`, JUSTIF),
        P('<br>'),
        P('<strong>Signatures de la commission de délibération</strong>', GAUCHE),
        P(jeton('PVSignatures', 'Cases de signature de la commission'), GAUCHE),
        /* SAUT DE PAGE avant les annexes : elles forment une pièce à part, qu'on détache et
           qu'on fait émarger. Un `<p>` VIDE serait supprimé au rendu (cf. CLAUDE.md § 3) — d'où
           l'espace insécable. */
        `<p class="doc-pagebreak">&nbsp;</p>`,
        P(`<strong>Annexe 1 : Feuille d’émargement des membres présents de la commission de délibération</strong>`, GAUCHE),
        P('<br>'),
        P(jeton('PVMembres', 'Émargement des membres de la commission'), GAUCHE),
        P('<br>'),
        P(`<strong>Annexe 2 : Liste des candidats et décision de certification</strong>`, GAUCHE),
        P('<br>'),
        P(jeton('PVCandidats', 'Annexe 2 : liste des candidats et décisions'), GAUCHE),
    ].join(''),
};

const MODELES = [GRILLE_JURY, PV_JURY];

module.exports = { MODELES, GRILLE_JURY, PV_JURY, jeton };

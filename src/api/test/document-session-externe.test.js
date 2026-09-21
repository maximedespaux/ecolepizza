/**
 * UN DOCUMENT DE SESSION, SIGNÉ PAR UN INTERVENANT EXTERNE.
 *
 * LE BESOIN, dit par l'organisme : « un contrat d'hygiène, signé par l'organisme et une personne
 * externe précise ; c'est un document de LA SESSION, pas de chaque stagiaire ». Puis le geste :
 * « un bouton Envoyer le document, qui ne propose que les modèles dont l'option Intervenant
 * externe est cochée, puis afficher ce qui est envoyé et ce qui est signé ».
 *
 * TROIS CHOSES ÉTAIENT DÉJÀ LÀ, ET UNE DORMAIT.
 *   · le rôle de signataire `EXTERNAL` et sa case « Externe » dans l'éditeur de modèles ;
 *   · `applySlotSignature`, qui appose la signature de l'organisme APRÈS celle d'une partie
 *     (« l'organisme signe en DERNIER ») et re-scelle le PDF ;
 *   · l'espace intervenant, avec une signature enregistrée réutilisée pour les émargements ;
 *   · et `document_signature.user_id`, commentée « signataire attribué (compte) » depuis la
 *     migration 061 — JAMAIS écrite. Deux ans d'échafaudage posé pour exactement cet usage.
 *
 * CE QU'ON N'A PAS AJOUTÉ : aucun drapeau sur le modèle. L'éligibilité se lit sur les
 * signataires déjà déclarés. Deux cases pour la même question finiraient par se contredire.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const BASE = path.join(API, '..', '..', 'database');
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const lire = (p) => sansCommentaires(fs.readFileSync(path.join(API, p), 'utf8'));
const SESSION_CTRL = lire('controllers/documentSession.controller.js');
const INTERV = lire('controllers/intervenant.controller.js');
const ROUTES_S = lire('routes/session.routes.js');
const ROUTES_I = lire('routes/intervenant.routes.js');
const MIG = fs.readFileSync(path.join(BASE, 'migrations', '157_document_session_externe.sql'), 'utf8');

test('LE DOCUMENT APPARTIENT À LA SESSION, À PERSONNE D\'AUTRE', () => {
    assert.match(MIG, /ENUM\('LEARNER','COMPANY','SESSION'\)/);
    assert.match(SESSION_CTRL, /'ENVOYE', 'SESSION', \?\)/);
    assert.match(SESSION_CTRL, /learner_id, type, template_slug, title, status, scope, session_id\)/);
    /* `learner_id` EST EXPLICITEMENT NULL : ce n'est le document de personne en particulier.
       L'organisme l'a dit sans détour — « c'est un document pour la session, pas pour chaque
       stagiaire » — et une première version le rattachait à toutes les inscriptions. */
    assert.match(SESSION_CTRL, /VALUES \(\?, \?, NULL, \?, \?, \?, 'ENVOYE', 'SESSION', \?\)/);
    assert.ok(!/document_formation/.test(SESSION_CTRL),
        'aucun rattachement aux inscriptions : le document ne se duplique pas dans les dossiers');
});

test('SEULS LES MODÈLES « EXTERNE » PEUVENT PARTIR', () => {
    /* Le critère est celui de l'éditeur de modèles, pas un réglage parallèle. Et il est
       RÉAPPLIQUÉ à l'envoi : proposer une liste ne suffit pas, un appel direct contournerait
       l'écran et enverrait un document de stagiaire — qui se retrouverait sans stagiaire, donc
       visible nulle part. */
    assert.match(SESSION_CTRL, /stepSigners\(s\)\.includes\('EXTERNAL'\)/);
    assert.match(SESSION_CTRL, /const modele = \(await modelesExternes\(orgId\)\)\.find\(\(m\) => m\.slug === slug\)/);
    assert.match(SESSION_CTRL, /n'est pas signable par un intervenant externe/);
});

test('ON N\'ENVOIE QU\'À UNE PERSONNE AFFECTÉE À CETTE SESSION', () => {
    /* « Externe » ne veut pas dire « n'importe qui ». Le contrôle porte sur la SESSION et pas
       seulement sur l'organisme : sans ça, on pourrait attribuer un contrat à un intervenant
       d'une autre promotion, qui le verrait apparaître chez lui sans comprendre.
       DEPUIS LE 2026-09-21, les FORMATEURS de la session signent aussi (cadres « Formateur »,
       « Jury 1 »…) : la liste des personnes admises réunit les deux affectations, et elle seule. */
    const zone = SESSION_CTRL.slice(SESSION_CTRL.indexOf('async function personnesDeLaSession'));
    assert.match(zone, /FROM session_trainer st JOIN user u ON u\.id = st\.user_id\s+WHERE st\.session_id = \?/);
    assert.match(zone, /FROM session_intervenant si JOIN user u ON u\.id = si\.user_id\s+WHERE si\.session_id = \? AND si\.organization_id = \?/);
    const envoi = SESSION_CTRL.slice(SESSION_CTRL.indexOf('const envoyerDocumentSession'));
    assert.match(envoi, /await personnesDeLaSession\(conn, orgId, req\.params\.id\)/);
    assert.match(envoi, /if \(attributions\.some\(\(a\) => !nomDe\.has\(a\.userId\)\)\)/, 'CHAQUE personne est vérifiée');
    assert.match(envoi, /n'est pas affectée à cette session/);
});

test('LA CASE EST CRÉÉE VIDE ET ATTRIBUÉE — c\'est le rail dormant qu\'on branche', () => {
    assert.match(SESSION_CTRL, /INSERT INTO document_signature \(id, organization_id, document_id, slot, label, user_id\)/,
        'user_id est enfin écrit : la colonne existait depuis la migration 061 sans jamais servir');
    /* ET LA VALEUR EST BIEN L'INTERVENANT. Première version de cette assertion : elle ne
       regardait que la liste des COLONNES, et restait verte quand on passait NULL à la place de
       `userId` — le document serait alors parti sans destinataire, invisible dans tous les
       espaces. Nommer une colonne ne dit rien de ce qu'on y met. */
    /* DEPUIS LE 2026-09-21, une case PAR CADRE attribué : chacune porte la personne choisie
       (`a.userId`, jamais NULL) et un cadre qui EXISTE dans le modèle — vérifié avant, ou calculé
       par creneauDuModele pour l'ancienne forme à un seul intervenant. */
    assert.match(SESSION_CTRL, /\[crypto\.randomUUID\(\), orgId, docId, a\.slot, libelle\.get\(a\.slot\) \|\| 'Intervenant externe', a\.userId\]/,
        'la case doit porter l\'identifiant de la personne, pas NULL — et le créneau du MODÈLE');
    assert.match(SESSION_CTRL, /attributions = \[\{ slot: await creneauDuModele\(orgId, slug\), userId: String\(b\.user_id\)\.trim\(\) \}\]/,
        'l\'ancienne forme garde le créneau lu dans le modèle');
    assert.match(SESSION_CTRL, /const inconnu = attributions\.find\(\(a\) => !libelle\.has\(a\.slot\)\)/,
        'un créneau inventé recevrait une signature que le document n\'afficherait nulle part');
    /* `signed_at` reste NULL : c'est ce qui distingue « en attente » de « signé », et c'est
       cette ligne que l'espace de l'intervenant lit. */
    assert.ok(!/signed_at = NOW\(\)/.test(SESSION_CTRL.slice(SESSION_CTRL.indexOf('INSERT INTO document_signature'))),
        'la case part vide : le document est envoyé, pas signé');
});

test('L\'INTERVENANT NE SIGNE QUE CE QUI LUI EST ATTRIBUÉ', () => {
    const zone = INTERV.slice(INTERV.indexOf('const signerMonDocument'));
    assert.match(zone, /WHERE ds\.document_id = \? AND ds\.user_id = \? AND ds\.organization_id = \?/,
        'le contrôle porte sur user_id, pas sur l\'organisation : jamais le document d\'un collègue');
    /* Et pas deux fois : seules les cases encore vides se signent (une personne peut en avoir
       plusieurs sur un même document depuis les cadres du jury). */
    assert.match(zone, /const aSigner = lignes\.filter\(\(l\) => !l\.signed_at\);\s+if \(!aSigner\.length\) return res\.status\(409\)/, 'et pas deux fois');
});

test('IL SIGNE D\'UN CLIC, AVEC SA SIGNATURE ENREGISTRÉE', () => {
    /* C'est tout l'intérêt d'avoir un compte plutôt qu'un lien : la signature des émargements
       ressert. Qui n'en a pas est renvoyé vers le dessin — une fois. */
    const zone = INTERV.slice(INTERV.indexOf('const signerMonDocument'));
    assert.match(zone, /SELECT signature_image FROM user WHERE id = \?/);
    assert.match(zone, /Aucune signature enregistrée/);
    assert.match(zone, /applySlotSignature\(conn, orgId, doc, \{/,
        'la signature passe par le chemin commun : organisme en dernier, PDF re-scellé');
});

test('L\'ATTRIBUTION SURVIT À LA SIGNATURE', () => {
    /* `applySlotSignature` ne connaît que le CRÉNEAU : elle réécrit la ligne sans `user_id`.
       Sans cette réaffirmation, l'attribution disparaîtrait au premier passage et le document
       sortirait de l'espace de l'intervenant à la seconde même où il le signe. */
    assert.match(INTERV, /UPDATE document_signature SET user_id = \? WHERE document_id = \? AND slot = \?/);
});

test('LES DEUX PORTES SONT GARDÉES', () => {
    /* La LECTURE est ouverte au personnel — le formateur doit voir où en est la signature.
       L'ENVOI engage l'organisme et reste au bureau, comme toute génération de document. */
    assert.match(ROUTES_S, /router\.get\('\/:id\/documents-externes', authorizeRoles\(\.\.\.STAFF_ROLES\)/);
    assert.match(ROUTES_S, /router\.post\('\/:id\/documents-externes', authorizeRoles\(\.\.\.ADMIN_ROLES\)/);
    /* Et l'espace intervenant est réservé au rôle INTERVENANT, comme le reste de ses routes. */
    assert.match(ROUTES_I, /authorizeRoles\('INTERVENANT'\)/);
    assert.match(ROUTES_I, /router\.post\('\/documents\/:id\/signer', signerMonDocument\)/);
});

test('LA MIGRATION 157 N\'EFFACE RIEN, ET SON REVERT PRÉVIENT', () => {
    assert.ok(!/DELETE|DROP TABLE|TRUNCATE/i.test(MIG));
    const revert = fs.readFileSync(path.join(BASE, 'migrations', '157_revert_document_session_externe.sql'), 'utf8');
    assert.match(revert, /SELECT id, title, session_id FROM generated_document WHERE scope = 'SESSION'/,
        'le revert doit dire comment relever ce qu\'il rendrait invisible');
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   ET LE COFFRE LES RETROUVE.

   Un document de session n'appartient ni à un stagiaire ni à une entreprise. Le coffre range en
   année → semaine → formation → STAGIAIRE : sans troisième nature de feuille, le contrat
   d'hygiène tombait sous un nom vide, entre deux stagiaires — présent et introuvable, ce qui
   est pire qu'absent le jour d'un contrôle.

   UNE SEULE FEUILLE « Documents de session » PAR SEMAINE ET PAR FORMATION : la clé ne porte pas
   l'identifiant du document, sinon chaque contrat ferait son propre dossier à un élément. */
const SUIVI_CTRL = lire('controllers/suivi.controller.js');
const UI_SUIVI = sansCommentaires(
    fs.readFileSync(path.join(API, '..', 'app', 'ui/pages/Suivi.jsx'), 'utf8'));

test('LE COFFRE A UNE CINQUIÈME SOURCE', () => {
    assert.match(SUIVI_CTRL, /res\.json\(\{ data: \[\.\.\.gen, \.\.\.comp, \.\.\.sess, \.\.\.arch, \.\.\.pieces\] \}\)/);
    assert.match(SUIVI_CTRL, /gd\.scope = 'SESSION' AND gd\.status IN \(\?\)/,
        'même filtre de partage que les autres documents : on ne montre pas un brouillon');
    /* JOINTURE INTERNE SUR LA SESSION : un document de session sans session n'a ni année, ni
       semaine, ni formation — aucune branche où se poser. */
    assert.match(SUIVI_CTRL, /JOIN training_session s ON s\.id = gd\.session_id\s*\n\s*LEFT JOIN training_program/);
});

test('LE COFFRE RESTE LISIBLE SANS LA MIGRATION 157', () => {
    /* Règle du projet : le code marche AVANT comme APRÈS. Sans la 157, l'énumération ignore
       'SESSION' — la requête échoue, et le coffre doit montrer ses quatre autres sources plutôt
       que de tomber en 500. */
    const bloc = SUIVI_CTRL.slice(SUIVI_CTRL.indexOf('let sess = [];'));
    const corps = bloc.slice(0, bloc.indexOf('// Documents archivés'));
    assert.match(corps, /ER_BAD_FIELD_ERROR/);
    assert.match(corps, /ER_DATA_TRUNCATED/, 'une énumération sans la valeur rend cette erreur-là');
});

test('LA TROISIÈME FEUILLE EXISTE, ET N\'EN FAIT QU\'UNE', () => {
    assert.match(UI_SUIVI, /const isSess = r\.scope === "SESSION"/);
    assert.match(UI_SUIVI, /: isSess \? "sess:documents"/,
        'clé CONSTANTE : une seule feuille par semaine et par formation, pas une par document');
    assert.match(UI_SUIVI, /: isSess \? "Documents de session"/);
    /* La suppression groupée doit nommer ce qu'elle efface — « Supprimer ce stagiaire » sur des
       documents de session serait un mensonge, et un geste irréversible mal annoncé. */
    assert.match(UI_SUIVI, /L\.session \? "Supprimer ces documents de session"/);
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   VOIR ET TÉLÉCHARGER, DES DEUX CÔTÉS.

   DEMANDÉ : « toujours mettre la possibilité de voir le document et de le télécharger, des deux
   côtés ». L'école relit ce qu'elle a envoyé ; l'intervenant, ce qu'on lui demande de signer —
   et ce second cas est le plus important : signer sans pouvoir ouvrir n'est pas signer.

   LE DÉFAUT QUE ÇA A RÉVÉLÉ. `/documents/:id/pdf` acceptait le personnel, ou le stagiaire
   PROPRIÉTAIRE. Un document de session n'a pas de stagiaire : les deux gardes refusaient donc
   le document à l'intervenant à qui il est justement destiné. On lui demandait de signer un
   document qu'il ne pouvait pas ouvrir.
*/
const DOC_CTRL = lire('controllers/document.controller.js');
const BOUTONS = sansCommentaires(
    fs.readFileSync(path.join(API, '..', 'app', 'ui/components/BoutonsDocument.jsx'), 'utf8'));
const EXTERNES = sansCommentaires(
    fs.readFileSync(path.join(API, '..', 'app', 'ui/components/DocumentsExternes.jsx'), 'utf8'));
const ESPACE = sansCommentaires(
    fs.readFileSync(path.join(API, '..', 'app', 'ui/pages/IntervenantEspace.jsx'), 'utf8'));

test('LE SIGNATAIRE ATTRIBUÉ PEUT OUVRIR CE QU\'ON LUI DEMANDE DE SIGNER', () => {
    const zone = DOC_CTRL.slice(DOC_CTRL.indexOf("const STAFF = ['SUPER_ADMIN'"));
    assert.match(zone, /SELECT id FROM document_signature WHERE document_id = \? AND user_id = \?/);
    assert.match(zone, /\[sdoc\.id, req\.user\.id\]/,
        'la garde porte sur CE document et CE compte : ni le document d\'un collègue, ni un autre');
    /* ET ELLE VIENT APRÈS LES DEUX AUTRES : on n'élargit pas, on ajoute une troisième porte
       étroite. Le personnel et le stagiaire propriétaire passent toujours par les leurs. */
    assert.ok(zone.indexOf('FROM learner WHERE id = ? AND user_id = ?')
        < zone.indexOf('FROM document_signature WHERE document_id = ?'));
});

test('LES DEUX ÉCRANS EMPLOIENT LE MÊME COMPOSANT', () => {
    /* Deux paires de boutons auraient divergé — l'une gagnant un correctif que l'autre n'aurait
       pas eu. C'est la leçon la plus répétée de cette semaine. */
    for (const [quoi, src] of [['la carte de session', EXTERNES], ['l\'espace intervenant', ESPACE]]) {
        assert.match(src, /import BoutonsDocument from/, `${quoi} doit importer le composant`);
        assert.match(src, /<BoutonsDocument id=\{d\.id\} nom=\{d\.title\} \/>/, `${quoi} doit le rendre`);
    }
});

test('L\'URL DU PDF EST LIBÉRÉE, MAIS PAS TOUT DE SUITE', () => {
    /* Révoquer l'URL blob immédiatement donnerait un onglet VIDE — le navigateur n'a pas encore
       chargé le document quand `window.open` rend la main. Ne jamais la révoquer garderait le
       PDF en mémoire pour la durée de la session. */
    assert.match(BOUTONS, /window\.open\(url, "_blank", "noopener"\)/);
    assert.match(BOUTONS, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60000\)/);
});

test('LE NOM DE FICHIER NE PEUT PAS CASSER L\'ENREGISTREMENT', () => {
    // Un titre de modèle est saisi à la main : il peut contenir « / » ou « : ».
    assert.match(BOUTONS, /replace\(\/\[\\\\\/:\*\?"<>\|\]\/g, ""\)/);
});

test('LE CRÉNEAU VIENT DU MODÈLE, PAS D\'UNE CONSTANTE', async () => {
    /* DÉFAUT SIGNALÉ, et il rendait la fonctionnalité inutile : le modèle « Contrat Hygiène »
       place une case `{sig:intervenant}` — c'est l'école qui a choisi ce nom dans l'éditeur. Le
       code écrivait « externe ». La signature atterrissait donc dans un créneau que le document
       n'affiche nulle part : l'intervenant signait, et la case restait vide. D'où « les jetons
       ne marchent pas, sauf la signature de l'organisme ». */
    const { creneauDuModele, SLOT_DEFAUT } = require('../controllers/documentSession.controller.js');
    assert.strictEqual(typeof creneauDuModele, 'function');
    assert.strictEqual(SLOT_DEFAUT, 'externe', 'le repli ne sert qu\'aux modèles sans case');
    assert.match(SESSION_CTRL, /data-token="sig:\(\[\^"\]\+\)"/,
        'la puce de l\'éditeur, telle qu\'elle est enregistrée');
    assert.match(SESSION_CTRL, /\\\{\\s\*sig:/, 'et la forme brute, au cas où');

    /* ET LA LISTE NE CHERCHE PLUS UN NOM EN DUR : elle suit la case ATTRIBUÉE. Sinon un
       document signé dans le créneau du modèle serait affiché « en attente » pour toujours. */
    assert.match(SESSION_CTRL, /ds\.document_id = d\.id AND ds\.user_id IS NOT NULL/);

    /* Côté intervenant aussi : le créneau vient de SA case. */
    assert.match(INTERV, /slot: l\.slot \|\| SLOT_EXTERNE, label: l\.label \|\| 'Intervenant externe'/,
        'le créneau ET le libellé de CHAQUE case (« Jury 1 »…), pas une constante');
    assert.match(INTERV, /\[req\.user\.id, ligne\.doc_id, l\.slot \|\| SLOT_EXTERNE\]/);
    assert.match(INTERV, /SELECT ds\.id, ds\.slot, ds\.signed_at/, 'il faut donc le LIRE');
});

test('LES JETONS DE SESSION SE REMPLISSENT SANS STAGIAIRE', () => {
    /* L'AUTRE MOITIÉ DU DÉFAUT. Le contexte d'un document se construit depuis
       `document_formation`, donc depuis les INSCRIPTIONS. Un document de session n'en a aucune :
       `formations` restait vide et TOUS les jetons de session — {Mardi}, {Jeudi}, {Semaine},
       {Formateur} — rendaient du vide. Seuls tenaient ceux de l'organisme, qui ne dépendent de
       personne : d'où « rien ne marche sauf la signature organisme ». */
    assert.match(DOC_CTRL, /if \(!formations\.length && documentId\) \{/);
    assert.match(DOC_CTRL, /SELECT session_id FROM generated_document WHERE id = \?/);
    assert.match(DOC_CTRL, /FROM training_session s\s*\n\s*LEFT JOIN training_program p ON p\.id = s\.program_id\s*\n\s*WHERE s\.id = \? AND s\.organization_id = \?/,
        'et la session est lue DANS l\'organisme : jamais celle d\'un autre');
    /* NI FINANCEMENT, NI PRIX, NI ENTREPRISE : un contrat d'hygiène n'appartient à aucun
       dossier. Inventer des valeurs de dossier serait pire que de les laisser vides. */
    assert.match(DOC_CTRL, /NULL AS financing, NULL AS enroll_price, NULL AS acompte, NULL AS company_id/);
});

test('L\'ORGANISME PEUT SUPPRIMER CE QU\'IL A ENVOYÉ', () => {
    /* On se trompe de modèle, on se trompe d'intervenant. Sans ce geste, le document restait là
       pour toujours et la carte accumulait des lignes qu'on ne savait plus lire.
       CÔTÉ ORGANISME SEULEMENT — l'intervenant n'efface pas ce qu'on lui demande de signer. */
    assert.match(EXTERNES, /await deleteDocument\(d\.id\)/);
    assert.match(EXTERNES, /\{peutSupprimer && \(\s*\n\s*<button type="button" className="iconbtn del"/);
    // Supprimer passe par DELETE /documents/:id — rubrique /stagiaires côté serveur, pas /sessions.
    assert.match(EXTERNES, /const peutSupprimer = peutEcrire\(user, "\/stagiaires"\);/);
    assert.ok(!/deleteDocument/.test(ESPACE), 'aucune suppression dans l\'espace intervenant');

    /* LA CONFIRMATION NOMME LE DOCUMENT ET SON ÉTAT : effacer un contrat DÉJÀ SIGNÉ n'est pas le
       même geste qu'annuler un envoi de la minute d'avant. La phrase doit le dire AVANT. */
    assert.match(EXTERNES, /Ce document est SIGNÉ depuis le \$\{d\.signe_le\}\. La signature sera perdue\./);
    assert.match(EXTERNES, /Cette action est irréversible/);
});

test('LA SIGNATURE PORTE LE NOM DE L\'INTERVENANT, PAS « Intervenant »', () => {
    /* DÉFAUT CONSTATÉ SUR UN CONTRAT RÉELLEMENT SIGNÉ en production : `signer_name` valait
       « Intervenant » au lieu de « Maurice PENE ». Le jeton d'authentification ne transporte que
       `id`, `email`, `role` et `organization_id` — jamais le nom. `req.user.first_name` était
       donc TOUJOURS `undefined`, et le repli s'appliquait à chaque signature : le nom générique
       se retrouvait imprimé sur le contrat, à la place de celui qui l'a signé.

       LA BASE EST DE TOUTE FAÇON LA BONNE SOURCE : un jeton vit sept jours, un nom peut changer
       entre-temps, et c'est celui du jour de la signature qui doit figurer. */
    const zone = INTERV.slice(INTERV.indexOf('const signerMonDocument'));
    assert.match(zone, /SELECT first_name, last_name FROM user WHERE id = \?/);
    assert.ok(!/req\.user\.first_name/.test(zone),
        'le jeton ne porte pas le nom : le lire là donne `undefined` à tous les coups');
    /* Le repli reste, pour un compte sans nom saisi — « Signataire » depuis que formateurs et jury
       signent aussi par ce chemin : « Intervenant » aurait été faux pour eux. */
    assert.match(zone, /\|\| 'Signataire'/, 'le repli reste, pour un compte sans nom saisi');
});

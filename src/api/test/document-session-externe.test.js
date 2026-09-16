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

test('ON N\'ENVOIE QU\'À UN INTERVENANT AFFECTÉ À CETTE SESSION', () => {
    /* « Externe » ne veut pas dire « n'importe qui ». Le contrôle porte sur la SESSION et pas
       seulement sur l'organisme : sans ça, on pourrait attribuer un contrat à un intervenant
       d'une autre promotion, qui le verrait apparaître chez lui sans comprendre. */
    const zone = SESSION_CTRL.slice(SESSION_CTRL.indexOf('let affecte'));
    assert.match(zone, /FROM session_intervenant si JOIN user u ON u\.id = si\.user_id/);
    assert.match(zone, /si\.session_id = \? AND si\.organization_id = \? AND si\.user_id = \?/);
    assert.match(zone, /n'est pas affecté à cette session/);
});

test('LA CASE EST CRÉÉE VIDE ET ATTRIBUÉE — c\'est le rail dormant qu\'on branche', () => {
    assert.match(SESSION_CTRL, /INSERT INTO document_signature \(id, organization_id, document_id, slot, label, user_id\)/,
        'user_id est enfin écrit : la colonne existait depuis la migration 061 sans jamais servir');
    /* ET LA VALEUR EST BIEN L'INTERVENANT. Première version de cette assertion : elle ne
       regardait que la liste des COLONNES, et restait verte quand on passait NULL à la place de
       `userId` — le document serait alors parti sans destinataire, invisible dans tous les
       espaces. Nommer une colonne ne dit rien de ce qu'on y met. */
    assert.match(SESSION_CTRL, /\[crypto\.randomUUID\(\), orgId, docId, SLOT, 'Intervenant externe', userId\]/,
        'la case doit porter l\'identifiant de l\'intervenant, pas NULL');
    /* `signed_at` reste NULL : c'est ce qui distingue « en attente » de « signé », et c'est
       cette ligne que l'espace de l'intervenant lit. */
    assert.ok(!/signed_at = NOW\(\)/.test(SESSION_CTRL.slice(SESSION_CTRL.indexOf('INSERT INTO document_signature'))),
        'la case part vide : le document est envoyé, pas signé');
});

test('L\'INTERVENANT NE SIGNE QUE CE QUI LUI EST ATTRIBUÉ', () => {
    const zone = INTERV.slice(INTERV.indexOf('const signerMonDocument'));
    assert.match(zone, /WHERE ds\.document_id = \? AND ds\.user_id = \? AND ds\.organization_id = \?/,
        'le contrôle porte sur user_id, pas sur l\'organisation : jamais le document d\'un collègue');
    assert.match(zone, /if \(ligne\.signed_at\) return res\.status\(409\)/, 'et pas deux fois');
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

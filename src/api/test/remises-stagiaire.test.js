const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const CTRL = readFileSync(path.join(__dirname, '../controllers/remise.controller.js'), 'utf8');
const ROUTES = readFileSync(path.join(__dirname, '../routes/remise.routes.js'), 'utf8');
const PARCOURS = readFileSync(path.join(__dirname, '../controllers/formationProgram.controller.js'), 'utf8');
const MIG = readFileSync(path.join(__dirname, '../../../database/migrations/160_remises_stagiaire.sql'), 'utf8');

test('DÉPOSER N\'EST PAS REMETTRE : seul l\'accusé termine l\'étape', async () => {
    /* C'EST LE CŒUR DE LA 160, et la seule chose qui distingue une remise d'un simple fichier
       rangé. Un document déposé que personne n'a confirmé ne prouve RIEN lors d'un contrôle :
       le compter comme terminé ferait monter le score de conformité du dossier sur un fichier
       que le stagiaire n'a peut-être jamais ouvert.

       C'est aussi la différence avec les pièces à fournir, où c'est l'école qui valide. Ici la
       validation appartient à celui qui reçoit. */
    const { stepState } = await import('../../app/ui/lib/etapes.js');
    assert.strictEqual(stepState({ remise: true }), 'todo', 'rien de déposé');
    assert.strictEqual(stepState({ remise: true, remiseStatus: 'REMISE' }), 'progress',
        'déposé mais pas confirmé : EN COURS, jamais terminé');
    assert.strictEqual(stepState({ remise: true, remiseStatus: 'RECUE' }), 'done', 'confirmé par le stagiaire');
});

test('l\'accusé de réception ne peut être signé que par le stagiaire lui-même', () => {
    /* Un membre du personnel qui pourrait accuser à la place du stagiaire fabriquerait la preuve
       que cette preuve est censée engager — exactement ce qu'un contrôle vient chercher. La
       route n'est donc PAS filtrée par rôle (le stagiaire n'est dans aucune liste de personnel) :
       la garde est dans le contrôleur, et elle est plus stricte qu'un rôle. */
    const bloc = CTRL.slice(CTRL.indexOf('const accuser'), CTRL.indexOf('const servirFichier'));
    assert.match(bloc, /r\.user_id !== req\.user\.id/, 'le demandeur doit ÊTRE le stagiaire');
    assert.match(bloc, /res\.status\(403\)/);
    assert.match(ROUTES, /router\.post\('\/:id\/accuser', accuser\);/, 'aucun authorizeRoles sur cette route');
    // Sans fichier il n'y a rien à recevoir : accuser dans le vide produirait une preuve creuse.
    assert.match(bloc, /if \(!r\.n\) return res\.status\(422\)/);
});

test('déposer et retirer sont réservés au personnel', () => {
    /* La différence de fond avec les pièces : là-bas le stagiaire dépose. Ici, un stagiaire
       autorisé à déposer se remettrait un document à lui-même. */
    assert.match(ROUTES, /router\.post\('\/dossier\/:enrollmentId\/:remiseTypeId', authorizeRoles\(\.\.\.STAFF_ROLES\)/);
    assert.match(ROUTES, /router\.delete\('\/fichier\/:id', authorizeRoles\(\.\.\.STAFF_ROLES\)/);
});

test('remplacer ou retirer le fichier annule l\'accusé', () => {
    /* SANS ÇA, LE DOSSIER MENTIRAIT : l'école corrige le document après coup, et l'ancien accusé
       continue d'affirmer que le stagiaire a reçu… ce qu'il n'a jamais vu. Un accusé ne vaut que
       pour le fichier sur lequel il porte. */
    const depot = CTRL.slice(CTRL.indexOf('const deposer'), CTRL.indexOf('const accuser'));
    assert.match(depot, /ON DUPLICATE KEY UPDATE[\s\S]{0,200}accuse_le = NULL/);
    const suppr = CTRL.slice(CTRL.indexOf('const supprimerFichier'));
    assert.match(suppr, /SET statut = \?, accuse_le = NULL/);
    assert.match(suppr, /n\.n \? 'REMISE' : 'ATTENDUE'/, 'plus aucun fichier : la remise redevient attendue');
});

test('servir un fichier ne vaut pas le recevoir', () => {
    /* Déduire la réception d'un téléchargement fabriquerait une preuve que personne n'a donnée —
       ouvrir un fichier n'est pas l'accepter. La route de lecture ne doit donc toucher ni au
       statut ni à la date d'accusé. */
    const bloc = CTRL.slice(CTRL.indexOf('const servirFichier'), CTRL.indexOf('const supprimerFichier'));
    assert.ok(!/UPDATE remise_document/.test(bloc), 'aucune écriture dans une route de lecture');
    assert.ok(!/accuse_le/.test(bloc));
    assert.match(bloc, /Cache-Control', 'no-store, private'/, 'et rien ne traîne dans le cache');
});

test('un stagiaire ne voit que SON dossier', () => {
    // Même garde que pour les pièces : la route est ouverte au stagiaire, donc sans elle il
    // lirait les métadonnées du dossier d'un autre — dont des noms de fichiers nominatifs.
    const bloc = CTRL.slice(CTRL.indexOf('const listDossier'), CTRL.indexOf('/**\n * POST /api/remises/dossier'));
    assert.match(bloc, /dossierDe\(/);
    assert.match(bloc, /e\.user_id !== req\.user\.id && !staff/);
});

test('la remise est la QUATRIÈME nature d\'étape, et le code marche sans la 160', () => {
    assert.match(PARCOURS, /doc_type: 'REMISE'/);
    assert.match(PARCOURS, /\.\.\.pieceSteps, \.\.\.remiseSteps/, 'elle entre bien dans le parcours');
    assert.match(PARCOURS, /UPDATE program_step SET remise_id = \?/, 'clé étrangère, pas un préfixe de slug');
    /* Tables et colonne arrivent avec la 160 : sans elles, le parcours doit rester utilisable.
       Une formation entière deviendrait inaccessible pour une nature d'étape optionnelle. */
    assert.match(PARCOURS, /let remiseSteps = \[\];/);
    assert.match(PARCOURS, /let hasRemise = true;/);
    assert.match(CTRL, /const ABSENTE = \{ message: 'Migration 160 non jouée\.' \};/);
});

test('la migration 160 respecte les règles du dépôt', () => {
    assert.match(MIG, /CREATE TABLE IF NOT EXISTS remise_type/);
    assert.match(MIG, /CREATE TABLE IF NOT EXISTS remise_document/);
    assert.match(MIG, /CREATE TABLE IF NOT EXISTS remise_fichier/);
    assert.match(MIG, /ADD COLUMN IF NOT EXISTS remise_id/, 'rejouable sans risque');
    assert.doesNotMatch(MIG, /^\s*--/m, 'commentaires en blocs, jamais en --');
    const down = readFileSync(path.join(__dirname, '../../../database/migrations/160_revert_remises_stagiaire.sql'), 'utf8');
    /* Ordre INVERSE au revert : les fichiers référencent la remise, la remise référence le type.
       Supprimer le type d'abord échouerait sur la contrainte. */
    assert.ok(down.indexOf('remise_fichier') < down.indexOf('remise_document'));
    assert.ok(down.indexOf('remise_document') < down.indexOf('DROP TABLE IF EXISTS remise_type'));
});

const REVIEW = readFileSync(path.join(__dirname, '../../app/ui/components/RemisesReview.jsx'), 'utf8');
const ESPACE = readFileSync(path.join(__dirname, '../../app/ui/pages/StudentFormationDetail.jsx'), 'utf8');

test('l\'écran de l\'école n\'offre AUCUN bouton « reçu »', () => {
    /* LA RÈGLE SE VOIT, ELLE NE SE DEVINE PAS. Le serveur refuse le personnel sur la route
       d'accusé ; si l'écran proposait quand même le bouton, on aurait une commande qui répond
       par une erreur — pire qu'une commande absente. Surtout, offrir le geste suggérerait qu'il
       est légitime, alors qu'une preuve de remise signée par l'école à la place du stagiaire ne
       vaut rien. */
    assert.ok(!/accuserRemise/.test(REVIEW), 'le côté école n\'appelle jamais l\'accusé');
    assert.match(REVIEW, /deposerRemise/, 'il dépose…');
    assert.match(REVIEW, /supprimerRemiseFichier/, '…et retire, c\'est tout');
    /* Les deux dates se disent séparément : le contrôle lit le DÉLAI entre mise à disposition
       et réception, que fondre les deux effacerait. */
    assert.match(REVIEW, /dateHeure\(r\.remis_le\)/);
    assert.match(REVIEW, /dateHeure\(r\.accuse_le\)/);
});

test('le stagiaire ne peut confirmer que ce qui a été déposé', () => {
    assert.match(ESPACE, /e\.r\.statut === "REMISE" && \([\s\S]{0,300}J'ai bien reçu/,
        'le bouton n\'apparaît qu\'une fois le document là');
    assert.match(ESPACE, /accuserRemise\(r\.remise_id\)/);
    // Confirmer engage : on demande, et la phrase dit ce qu'on signe.
    assert.match(ESPACE, /window\.confirm\(`Confirmer que vous avez bien reçu/);
});

test('les états du stagiaire sont l\'INVERSE de ceux des pièces', () => {
    /* Le piège de symétrie : recopier `PIECE_ETAT` donnerait « ATTENDUE → todo », donc une étape
       « À faire » alors que le stagiaire ne peut RIEN faire — l'école n'a pas encore déposé. Et
       « REMISE → wait » afficherait « En vérification », alors que c'est à LUI de jouer. Les deux
       valeurs sont échangées par rapport aux pièces, et c'est le sens du flux qui le commande. */
    assert.match(ESPACE, /const REMISE_ETAT = \{ RECUE: "done", REMISE: "todo", ATTENDUE: "wait" \};/);
    assert.match(ESPACE, /const PIECE_ETAT = \{ VALIDEE: "done", DEPOSEE: "wait", REFUSEE: "refused", ATTENDUE: "todo" \};/);
    // « En vérification » ne veut rien dire pour un document qu'on reçoit : libellés propres.
    assert.match(ESPACE, /REMISE_LABEL/);
});

test('« sans objet » sort du DÉCOMPTE, il ne le remplit pas', async () => {
    /* LE PIÈGE, et il n'a que deux issues fausses. La compter comme FAITE gonflerait le score de
       conformité d'un dossier avec une étape que personne n'a faite — un contrôle y lirait un
       document remis qui ne l'a jamais été. La compter comme DUE empêcherait le dossier
       d'atteindre cent pour cent à jamais, ce qui est précisément le défaut qu'on corrige.

       Elle sort donc des DEUX côtés de la fraction, d'où un quatrième état de retour. */
    const { stepState, manquesParFormation } = await import('../../app/ui/lib/etapes.js');
    assert.strictEqual(stepState({ remise: true, sansObjet: true }), 'skip');
    assert.strictEqual(stepState({ remise: true, remiseStatus: 'RECUE', sansObjet: true }), 'skip',
        'l\'exclusion prime, même sur un accusé déjà donné');

    // Et le bandeau « Ce qui manque » ne la réclame pas.
    const dossiers = [{ program_code: 'NIV1', documents: [
        { type: 'r1', label: 'Diplôme', remise: true, sansObjet: true },
        { type: 'r2', label: 'Attestation', remise: true, remiseStatus: 'REMISE' },
    ] }];
    const m = manquesParFormation(dossiers);
    assert.deepStrictEqual(m.map((x) => x.label), ['Attestation'],
        'une remise écartée n\'est pas un manque');

    /* Et la grille du suivi Qualiopi (2026-09-24) la montre pour ce qu'elle est : un tiret, ni coche
       ni manque. Elle remplace la feuille de route agrégée des entreprises, qui devait l'écarter AVANT
       d'incrémenter son total — ce total n'existe plus, la case dit l'état elle-même. */
    const { etatCase } = await import('../../app/ui/lib/grilleSuivi.js');
    assert.strictEqual(etatCase({ documents: [{ type: 'r1', remise: true, sansObjet: true }] }, 'r1').etat, 'skip');
});

test('exclure est une décision de l\'école, et n\'efface rien', () => {
    const CTRL2 = readFileSync(path.join(__dirname, '../controllers/remise.controller.js'), 'utf8');
    const R2 = readFileSync(path.join(__dirname, '../routes/remise.routes.js'), 'utf8');
    /* Laisser le stagiaire écarter une étape de son propre dossier reviendrait à lui laisser
       décider de ce qu'on lui doit. */
    assert.match(R2, /sans-objet', authorizeRoles\(\.\.\.STAFF_ROLES\)/);
    const bloc = CTRL2.slice(CTRL2.indexOf('const basculerSansObjet'), CTRL2.indexOf('const servirFichier'));
    /* LA LIGNE EST CRÉÉE SI ELLE N'EXISTE PAS : on écarte le plus souvent AVANT tout dépôt, et
       il n'y a alors rien en base à marquer. Sans l'INSERT, le geste serait impossible au seul
       moment où on y pense — à l'inscription. */
    assert.match(bloc, /INSERT INTO remise_document[\s\S]{0,260}ON DUPLICATE KEY UPDATE sans_objet = VALUES\(sans_objet\)/);
    // Un drapeau, pas un statut : rétablir doit rendre l'étape telle qu'elle était.
    assert.ok(!/statut = 'SANS_OBJET'/.test(bloc));
    assert.ok(!/DELETE|accuse_le = NULL/.test(bloc), 'exclure n\'efface ni fichier ni accusé');
});

test('sans la 161, les remises restent visibles', () => {
    /* DÉFAUT QUE J'AI INTRODUIT PUIS CORRIGÉ EN L'ÉCRIVANT : demander `sans_objet` sans cascade
       faisait échouer la requête ENTIÈRE, et le rattrapage `noTable` rendait une liste vide.
       Toutes les remises auraient disparu de l'écran chez qui a joué la 160 mais pas la 161 —
       une fonctionnalité qui marchait, effacée par l'ajout d'une option. */
    const CTRL2 = readFileSync(path.join(__dirname, '../controllers/remise.controller.js'), 'utf8');
    const bloc = CTRL2.slice(CTRL2.indexOf('async function remisesDuDossier'), CTRL2.indexOf('const listDossier'));
    assert.match(bloc, /const requete = \(col\) =>/, 'la requête est paramétrée…');
    assert.match(bloc, /catch \(e\) \{[\s\S]{0,200}requete\('0'\)/, '…et relue sans la colonne');
});

test('l\'éditeur de parcours range les QUATRE natures à part', () => {
    /* DÉFAUT VU EN PRODUCTION le 2026-09-16, sur un type « OPCO » que l'école venait de créer :
       il apparaissait dans le groupe « Documents », entre « Diplôme » et « Facture Boutique
       Stagiaire ». Le fichier se gardait pourtant de la même confusion pour les pièces, en
       toutes lettres — « ceux-là, l'école les produit ; celle-ci, le stagiaire l'envoie ». Une
       remise ne s'y range pas davantage : l'école la transmet SANS l'avoir produite, et c'est
       le stagiaire qui en accuse réception. Trois sens différents sous une seule étiquette. */
    const F = readFileSync(path.join(__dirname, '../../app/ui/pages/Formations.jsx'), 'utf8');
    assert.match(F, /const isRemise = \(s\) => s\.doc_type === "REMISE";/);
    assert.match(F, /const docs = filtre\(pool\.filter\(\(s\) => !isQuiz\(s\) && !isPiece\(s\) && !isRemise\(s\)\)\);/,
        'les remises sortent du groupe « Documents »');
    assert.match(F, /Documents remis au stagiaire\{remises\.length/, 'et ont leur propre groupe');
    /* Pas de « OU » sur une remise, même règle que les pièces : c'est une étape à part entière,
       pas la variante de quelque chose. */
    assert.match(F, /s\.doc_type !== "PIECE" && s\.doc_type !== "REMISE"/);
    // Son badge dit le geste attendu, qui n'est ni signer ni fournir.
    assert.match(F, /if \(s\.doc_type === "REMISE"\) return "à remettre";/);
});

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

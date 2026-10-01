/**
 * Invariants du back-office — les règles qu'on ne veut pas voir se défaire.
 *
 * Cette revue a fait remonter trois FAMILLES de défauts, pas trois défauts isolés. Chaque
 * famille se reproduit toute seule au prochain écran ajouté si rien ne la surveille :
 *
 *   1. LA PERSONNE À LA PLACE DU DOSSIER — lire (ou écrire) une propriété au niveau `learner`
 *      là où `enrollment` fait foi. Trois occurrences corrigées, une quatrième trouvée ici.
 *   2. LA CLÉ ÉTRANGÈRE NON VÉRIFIÉE — accepter un identifiant dans le corps d'une requête
 *      sans contrôler qu'il appartient à l'organisme. La lecture qui suit est bien filtrée,
 *      mais joint sans filtre : la barrière est contournée par la clé, pas par la porte.
 *   3. LE BLOC RECOPIÉ — la même règle métier écrite à plusieurs endroits, dont un finit par
 *      être oublié lors d'une correction. C'est ce qui affichait 1/2 sur un écran et 1/14 sur
 *      un autre pour le même dossier.
 *
 * Les tests portent sur le CODE RÉEL. Ils n'attrapent pas une jointure qui ramène de mauvaises
 * lignes — ça se vérifie en base — mais ils attrapent le retour d'un patron connu, ce qui est
 * précisément ce qu'on veut d'une revue.
 *
 * Les défauts identifiés mais NON corrigés dans cette passe sont en `{ skip }`, avec leur
 * raison. Ils documentent la dette au lieu de la laisser invisible.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
/** Le code sans ses commentaires : une explication qui cite un défaut ne doit pas le signaler. */
const net = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const controllers = fs.readdirSync(path.join(DIR, 'controllers')).filter((f) => f.endsWith('.js'));

// ============================================================================================
// FAMILLE 1 — la personne à la place du dossier
// ============================================================================================

test('la fiche ne propage plus le financement aux dossiers : il vit sur chaque dossier (2026-10-01)', () => {
    /* AVANT : enregistrer la fiche réécrivait enrollment.financing de TOUS les dossiers de la
       personne — impossible d'avoir RS7404 particulier ET NIV2 professionnel pour le même
       stagiaire. Le « type de devis » se décide désormais à l'inscription et se change dossier par
       dossier (menu du parcours) ; learner.financing n'est qu'un RÉSUMÉ dérivé. La fiche ne doit
       donc plus contenir de propagation vers les dossiers. */
    const learner = net(lire('controllers/learner.controller.js'));
    assert.doesNotMatch(learner, /UPDATE enrollment SET financing/,
        'la fiche ne doit plus réécrire le financement des dossiers');
    const enroll = net(lire('controllers/enrollment.controller.js'));
    assert.match(enroll, /function recalcFinancementStagiaire/,
        'learner.financing est un résumé recalculé des dossiers');
    assert.match(enroll, /e\.financing = 'PROFESSIONNEL'/,
        'le résumé est professionnel si AU MOINS un dossier l’est');
});

test('le type de devis d’un nouveau dossier suit la MÉTHODE d’inscription, pas la fiche', () => {
    /* « Un stagiaire » (sans entreprise) = PARTICULIER ; par une entreprise = PROFESSIONNEL. On ne
       lit PLUS learner.financing à l'inscription : sinon une fiche passée une fois en pro ferait
       naître un dossier individuel en pro. Le type se corrige ensuite dossier par dossier. */
    const enroll = net(lire('controllers/enrollment.controller.js'));
    assert.match(enroll, /financing = company_id \? 'PROFESSIONNEL' : 'PARTICULIER'/,
        'le financement d’un nouveau dossier vient de la méthode d’inscription');
    assert.doesNotMatch(enroll, /financing = l && l\.financing/,
        'un nouveau dossier ne doit plus hériter du financement de la fiche');
});

test("l'entreprise d'un dossier ne se lit jamais sur la fiche personne", () => {
    // Verrouillé plus finement dans dossier-entreprise.test.js ; répété ici parce que c'est
    // le représentant de la famille et que le patron peut revenir par un autre fichier.
    for (const f of controllers) {
        const src = net(lire(`controllers/${f}`));
        assert.doesNotMatch(src, /COALESCE\(\s*e\.company_id\s*,\s*l\.company_id\s*\)/i, f);
        assert.doesNotMatch(src, /COALESCE\(\s*en\.company_id\s*,\s*l\.company_id\s*\)/i, f);
    }
});

test("le déverrouillage de Pizza Quest évalue le dossier en cours", { skip: "défaut connu, non corrigé : espace.controller.js retourne quest_unlocked dès que completed_levels n'est pas vide, sans évaluer le point d'accès du dossier courant" }, () => {
    const src = net(lire('controllers/espace.controller.js'));
    const bloc = src.slice(src.indexOf('const doneSet'), src.indexOf('const doneSet') + 400);
    assert.doesNotMatch(bloc, /let finished = doneSet\.size > 0/,
        'avoir terminé une formation autrefois ne doit pas ouvrir le verrou du dossier actuel');
});

test("l'OPCO d'un dossier ne se lit pas sur la fiche personne", { skip: "défaut connu, non corrigé : enrollment n'a pas de colonne opco — la correction demande une migration, pas une relecture" }, () => {
    let sites = 0;
    for (const f of controllers) {
        const src = net(lire(`controllers/${f}`));
        sites += (src.match(/\.opco \|\| ''\)\.toUpperCase\(\) === 'AGEFICE'/g) || []).length;
    }
    assert.strictEqual(sites, 0, `${sites} sites calculent agefice depuis learner.opco`);
});

// ============================================================================================
// FAMILLE 2 — la clé étrangère non vérifiée
// ============================================================================================

test('les clés étrangères reçues dans un corps de requête sont vérifiées', () => {
    // Un identifiant d'un autre organisme crée chez soi une ligne qui pointe ailleurs ; la
    // lecture suivante joint sans filtre pour afficher un nom, et le nom étranger apparaît.
    const attendu = {
        'controllers/enrollment.controller.js': ['company'],
        'controllers/sale.controller.js': ['learner'],
        'controllers/comptabilite.controller.js': ['partner'],
        // L'apport EN NATURE, dont la Comptabilité affiche le partenaire (2026-09-29).
        'controllers/partner.controller.js': ['partner'],
        'controllers/invoice.controller.js': ['company'],
    };
    for (const [f, tables] of Object.entries(attendu)) {
        const src = net(lire(f));
        assert.match(src, /belongsToOrg/, `${f} : aucun contrôle d'appartenance`);
        for (const t of tables) {
            // `[\s\S]*?` et non `[^)]*` : l'appel passe souvent `db.promise()`, dont la
            // parenthèse fermante coupait la recherche avant d'atteindre le nom de la table.
            assert.match(src, new RegExp(`belongsToOrg\\([\\s\\S]{0,40}?'${t}'`), `${f} : ${t} non vérifié`);
        }
    }
});

test("une garde d'appartenance chargée doit être testée", () => {
    // Le défaut trouvé : `l` et `sess` étaient chargés AVEC le bon filtre, puis jamais testés.
    // La garde était écrite sans être appliquée — le pire des cas, parce qu'elle rassure.
    const src = net(lire('controllers/enrollment.controller.js'));
    const bloc = src.slice(src.indexOf('const createEnrollment'), src.indexOf('INSERT INTO enrollment'));
    assert.match(bloc, /if \(!l\) return res\.status\(422\)/, 'le stagiaire chargé n\'est pas testé');
    assert.match(bloc, /if \(!sess\) return res\.status\(422\)/, 'la session chargée n\'est pas testée');
});

test('le contrôle d\'appartenance vit à un seul endroit', () => {
    // Il existait en copie unique dans invoice.controller, hors de portée des autres. Une
    // règle de sécurité qu'il faut recopier pour l'appliquer finit par ne pas l'être.
    assert.ok(fs.existsSync(path.join(DIR, 'lib/tenancy.js')), 'lib/tenancy.js manquant');
    let definitions = 0;
    for (const f of controllers) {
        if (/async function belongsToOrg/.test(lire(`controllers/${f}`))) definitions++;
    }
    assert.strictEqual(definitions, 0, 'belongsToOrg est redéfini dans un contrôleur');
});

// ============================================================================================
// FAMILLE 3 — le bloc recopié
// ============================================================================================

test('le parcours entreprise est calculé à un seul endroit', () => {
    // Trois copies, dont une oubliée : le Pipeline affichait 1/14 quand le Suivi disait 1/2.
    // Marqueur volontairement ÉTROIT : la projection exacte du bloc qui était recopié.
    // Un marqueur large attrapait des requêtes voisines mais légitimes (liste des documents
    // d'une entreprise, espace du représentant) et aurait fait échouer le test pour rien —
    // un test qui crie à tort finit par être ignoré.
    const marqueur = /SELECT id, type, status, template_slug, quiz_id FROM generated_document/;
    const fautifs = controllers.filter((f) => marqueur.test(net(lire(`controllers/${f}`))));
    assert.deepStrictEqual(fautifs, [],
        `la requête des documents de groupe doit rester dans lib/parcours.js, trouvée dans : ${fautifs.join(', ')}`);
});

test('les variantes mutuellement exclusives tiennent compte de agefice', { skip: "défaut connu, non corrigé : session.controller.js:19 teste financing/rs/hygiene/jours mais oublie agefice — deux variantes qui n'en diffèrent que par là occupent deux colonnes" }, () => {
    const src = net(lire('controllers/session.controller.js'));
    const bloc = src.slice(src.indexOf('conflicts('), src.indexOf('conflicts(') + 300);
    assert.match(bloc, /agefice/, "agefice manque dans la détection des variantes exclusives");
});

test('le contexte de conditions est construit de la même façon partout', { skip: "défaut connu, non corrigé : `jours` vaut `program_days || 1` dans le Suivi et `days` ailleurs ; document.controller omet agefice" }, () => {
    const suivi = net(lire('controllers/suivi.controller.js'));
    const enr = net(lire('controllers/enrollment.controller.js'));
    const avecRepli = /jours: [a-z.]*(program_)?days \|\| 1/;
    assert.strictEqual(avecRepli.test(suivi), avecRepli.test(enr),
        'un même dossier peut avoir deux parcours selon l\'écran qui le regarde');
});

// ============================================================================================
// Ce qui reste volontairement au niveau personne
// ============================================================================================

test('les lectures au niveau personne assumées sont préservées', () => {
    // Toutes les lectures de learner.* ne sont pas des défauts : « à quelle entreprise cette
    // PERSONNE est-elle rattachée » reste une question valide pour sa fiche, la carte et son
    // profil public. Ce test fixe la frontière au lieu de l'interdire en bloc.
    for (const f of ['carte.controller.js', 'learner.controller.js']) {
        assert.match(lire(`controllers/${f}`), /company_id/,
            `${f} : lecture au niveau personne attendue ici`);
    }
});

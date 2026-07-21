/**
 * Pastille « nouveautés » de la Communauté — contrôles sur les requêtes elles-mêmes.
 *
 * POURQUOI CETTE FORME DE TEST. La règle de comptage vit en SQL, pas en JavaScript : la
 * rejouer ici en JS créerait une seconde implémentation, qui dériverait de la vraie sans que
 * rien ne le signale — et un test qui approuve une copie n'approuve rien. On teste donc le
 * SQL RÉEL, extrait des contrôleurs : sa syntaxe, le nombre de paramètres, et la présence des
 * clauses qui portent les décisions produit.
 *
 * CE QUE CES TESTS N'ATTRAPENT PAS, et qu'il faut vérifier en base : qu'une jointure ramène
 * bien les lignes attendues. Ils attrapent en revanche ce qui casse le plus souvent en
 * silence — un `?` de trop ou de moins entre la requête et son tableau de paramètres, qui ne
 * se voit qu'à l'exécution, et une clause de périmètre supprimée par inadvertance.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { Parser } = require('node-sql-parser');

const lire = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const espace = lire('controllers/espace.controller.js');
const recipe = lire('controllers/recipe.controller.js');

/** Extrait la requête entre backticks qui ENTOURE ou suit un repère, et ses paramètres. */
function requeteApres(src, repere) {
    const i = src.indexOf(repere);
    assert.notStrictEqual(i, -1, `repère introuvable : ${repere}`);
    // Le repère peut être un commentaire AVANT la requête, ou un fragment DEDANS. La parité
    // des backticks qui précèdent tranche : un nombre impair veut dire qu'on est à l'intérieur
    // d'un littéral, donc que le backtick ouvrant est derrière nous.
    const dedans = (src.slice(0, i).match(/`/g) || []).length % 2 === 1;
    const debut = dedans ? src.lastIndexOf('`', i) : src.indexOf('`', i);
    const fin = src.indexOf('`', debut + 1);
    const sql = src.slice(debut + 1, fin);
    // Le tableau de paramètres suit la requête, entre crochets.
    const apres = src.slice(fin + 1, fin + 400);
    const m = apres.match(/\[([^\]]*)\]/);
    return { sql, params: m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [] };
}

// Repères choisis sur du code, pas sur des commentaires : une phrase se reformule, un nom
// de table ou de colonne ne bouge qu'en même temps que la requête qu'on veut suivre.
const compteur = requeteApres(espace, 'async function communityNewsCount');
const cartes = requeteApres(recipe, 'SELECT c.recipe_id, COUNT(*) AS n');
const cartesAime = requeteApres(recipe, 'SELECT lk.recipe_id, COUNT(*) AS n');

test('le SQL du compteur est valide en dialecte MariaDB', () => {
    const p = new Parser();
    // Le parseur ne connaît pas `?` : on le remplace par une valeur neutre pour la validation.
    assert.doesNotThrow(() => p.astify(compteur.sql.replace(/\?/g, 'NULL'), { database: 'mariadb' }));
});

test('le SQL des repères de cartes est valide en dialecte MariaDB', () => {
    const p = new Parser();
    assert.doesNotThrow(() => p.astify(cartes.sql.replace(/IN \(\?\)/g, "IN ('x')").replace(/\?/g, 'NULL'), { database: 'mariadb' }));
});

// Le défaut le plus courant, et le plus discret : il ne se manifeste qu'à l'exécution.
test('autant de paramètres que de ? dans le compteur', () => {
    assert.strictEqual((compteur.sql.match(/\?/g) || []).length, compteur.params.length,
        `SQL : ${compteur.params.join(' | ')}`);
});

test('autant de paramètres que de ? dans les repères de cartes', () => {
    assert.strictEqual((cartes.sql.match(/\?/g) || []).length, cartes.params.length,
        `SQL : ${cartes.params.join(' | ')}`);
});

// --- Les décisions produit, telles qu'elles ont été arbitrées ------------------------------

test('mes propres commentaires et mes propres j\'aime ne comptent pas', () => {
    // Sans ces clauses, commenter ou aimer sa propre fiche allumerait sa propre pastille.
    assert.match(compteur.sql, /c\.user_id\s*<>\s*u\.id/, "l'exclusion de l'auteur du commentaire a disparu");
    assert.match(compteur.sql, /lk\.user_id\s*<>\s*u\.id/, "l'exclusion de l'auteur du j'aime a disparu");
    assert.match(cartes.sql, /c\.user_id\s*<>\s*\?/);
});

test('les deux cas retenus pour un commentaire : ma fiche, ou un fil où j\'ai commenté', () => {
    for (const [nom, q] of [['compteur', compteur.sql], ['cartes', cartes.sql]]) {
        assert.match(q, /r\.author_user_id\s*=\s*(u\.id|\?)/, `${nom} : le cas « ma fiche » a disparu`);
        assert.match(q, /EXISTS\s*\(\s*SELECT[\s\S]*recipe_comment m[\s\S]*m\.user_id\s*=\s*(u\.id|\?)/,
            `${nom} : le cas « fil où j'ai commenté » a disparu`);
    }
});

test('un j\'aime ne compte que sur MES fiches', () => {
    // Être informé qu'on a aimé la fiche d'un autre n'apprend rien.
    assert.match(compteur.sql, /r2\.author_user_id\s*=\s*u\.id/);
});

/* Le cœur de la demande : les deux signaux ne s'éteignent PAS au même moment. Si ces deux
   tests tombent ensemble, c'est que la distinction a été perdue en cours de route. */
test('un COMMENTAIRE s\'éteint à la lecture de sa fiche, pas à la visite', () => {
    // recipe_read est ce qui permet à un commentaire de survivre à une visite sans ouverture.
    assert.match(compteur.sql, /LEFT JOIN recipe_read rr/, 'la lecture par fiche a disparu du compteur');
    assert.match(compteur.sql, /COALESCE\(rr\.read_at,/, 'la lecture par fiche ne prime plus');
    assert.match(cartes.sql, /LEFT JOIN recipe_read rr/, 'la lecture par fiche a disparu des repères');
});

test('un J\'AIME s\'éteint à la visite, sans notion de lecture', () => {
    // Le bloc j'aime ne doit PAS consulter recipe_read : le voir suffit.
    const bloc = compteur.sql.slice(compteur.sql.indexOf('recipe_like'));
    assert.doesNotMatch(bloc, /recipe_read/, "le j'aime s'est mis à dépendre de la lecture d'une fiche");
    assert.match(bloc, /community_seen_at/, "le j'aime ne s'éteint plus à la visite");
});

test('la reprise de l\'existant ne réveille pas des mois d\'historique', () => {
    // À la mise en service de la 107, recipe_read est vide. Sans ce repli sur la date de
    // dernière visite, chacun se réveillerait avec tout son historique dans la pastille.
    assert.match(compteur.sql, /COALESCE\(rr\.read_at,\s*u\.community_seen_at,\s*'1970-01-01'\)/);
});

test('une première visite (aucune date) montre tout comme nouveau', () => {
    // '1970-01-01' en dernier recours : sans lui, un COALESCE tout NULL ne ramènerait RIEN.
    for (const [nom, q] of [['compteur', compteur.sql], ['cartes', cartes.sql]]) {
        assert.match(q, /'1970-01-01'/, `${nom} : le recours de première visite a disparu`);
    }
});

test('le compteur reste dans mon organisme et sur les fiches encore partagées', () => {
    // La pastille ne doit annoncer que ce sur quoi on peut réellement cliquer.
    assert.match(compteur.sql, /r\.organization_id\s*=\s*\?/);
    assert.match(compteur.sql, /r\.visibility\s*=\s*'SHARED'/);
    assert.match(compteur.sql, /r2\.organization_id\s*=\s*\?/);
    assert.match(compteur.sql, /r2\.visibility\s*=\s*'SHARED'/);
});

test('les deux compteurs sont des sous-requêtes distinctes, donc pas de produit cartésien', () => {
    // Joindre commentaires ET j'aime dans un même FROM multiplierait les lignes entre elles :
    // 3 commentaires et 4 j'aime donneraient 12. Deux scalaires additionnés en JS l'évitent.
    assert.match(compteur.sql, /\(SELECT COUNT\(\*\)[\s\S]*\) AS comments/);
    assert.match(compteur.sql, /\(SELECT COUNT\(\*\)[\s\S]*\) AS likes/);
});

test('les repères « j\'aime » des cartes ne consultent pas la lecture par fiche', () => {
    // Même règle que dans le compteur : voir un j'aime suffit, le lire n'a pas de sens.
    assert.doesNotMatch(cartesAime.sql, /recipe_read/);
    assert.match(cartesAime.sql, /r\.author_user_id\s*=\s*\?/, "un j'aime ne compte que sur MES fiches");
});

test('autant de paramètres que de ? dans les repères « j\'aime »', () => {
    assert.strictEqual((cartesAime.sql.match(/\?/g) || []).length, cartesAime.params.length,
        `SQL : ${cartesAime.params.join(' | ')}`);
});

test('le SQL des repères « j\'aime » est valide en dialecte MariaDB', () => {
    const p = new Parser();
    assert.doesNotThrow(() => p.astify(cartesAime.sql.replace(/IN \(\?\)/g, "IN ('x')").replace(/\?/g, 'NULL'), { database: 'mariadb' }));
});

// --- Le marquage « vu » --------------------------------------------------------------------

test('les cinq sorties de getMyAccess renvoient community_news', () => {
    // Le piège déjà rencontré avec pending_docs : oublier une sortie fait disparaître la
    // pastille dans un cas précis (formation terminée, aucune inscription…), ce qui ne se
    // remarque que sur le compte concerné.
    const bloc = espace.slice(espace.indexOf('const getMyAccess'), espace.indexOf('const markCommunitySeen'));
    const sorties = bloc.match(/res\.json\(\{\s*data:/g) || [];
    const avec = bloc.match(/community_news/g) || [];
    assert.strictEqual(sorties.length, 5, `attendu 5 sorties, trouvé ${sorties.length}`);
    // 5 sorties + la ligne de calcul = 6 mentions attendues.
    assert.strictEqual(avec.length, 6, `community_news mentionné ${avec.length} fois, attendu 6`);
});

test('le marquage « vu » ne dépend pas de la réussite pour laisser passer le stagiaire', () => {
    const bloc = espace.slice(espace.indexOf('const markCommunitySeen'));
    const fin = bloc.indexOf('\n};');
    const corps = bloc.slice(0, fin);
    assert.match(corps, /UPDATE user SET community_seen_at = NOW\(\)/);
    // En échec on répond quand même 200 : rater le marquage laisse une pastille de trop,
    // ce qui ne justifie pas d'afficher une erreur.
    assert.doesNotMatch(corps, /res\.status\((4|5)\d\d\)/, 'le marquage ne doit pas renvoyer d\'erreur au stagiaire');
});

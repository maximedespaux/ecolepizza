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

/** Extrait la requête entre backticks qui suit un repère, et le tableau de paramètres. */
function requeteApres(src, repere) {
    const i = src.indexOf(repere);
    assert.notStrictEqual(i, -1, `repère introuvable : ${repere}`);
    const debut = src.indexOf('`', i);
    const fin = src.indexOf('`', debut + 1);
    const sql = src.slice(debut + 1, fin);
    // Le tableau de paramètres suit la requête, entre crochets.
    const apres = src.slice(fin + 1, fin + 400);
    const m = apres.match(/\[([^\]]*)\]/);
    return { sql, params: m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [] };
}

const compteur = requeteApres(espace, 'async function communityNewsCount');
const cartes = requeteApres(recipe, 'Nouveautés depuis ma dernière visite');

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

test('mes propres commentaires ne comptent pas', () => {
    // Sans cette clause, commenter sa propre fiche allumerait sa propre pastille.
    for (const [nom, q] of [['compteur', compteur.sql], ['cartes', cartes.sql]]) {
        assert.match(q, /c\.user_id\s*<>\s*\?/, `${nom} : l'exclusion de l'auteur a disparu`);
    }
});

test('les deux cas retenus sont bien là : ma fiche, ou un fil où j\'ai commenté', () => {
    for (const [nom, q] of [['compteur', compteur.sql], ['cartes', cartes.sql]]) {
        assert.match(q, /r\.author_user_id\s*=\s*\?/, `${nom} : le cas « ma fiche » a disparu`);
        assert.match(q, /EXISTS\s*\(\s*SELECT[\s\S]*recipe_comment m[\s\S]*m\.user_id\s*=\s*\?/,
            `${nom} : le cas « fil où j'ai commenté » a disparu`);
    }
});

test('les j\'aime ne sont pas comptés', () => {
    // Décision assumée : bien plus fréquents et sans réponse attendue, ils garderaient la
    // pastille allumée en permanence — et une pastille toujours allumée ne se regarde plus.
    for (const [nom, q] of [['compteur', compteur.sql], ['cartes', cartes.sql]]) {
        assert.doesNotMatch(q, /recipe_like/, `${nom} : les j'aime se sont invités dans le compte`);
    }
});

test('une première visite (date NULL) montre tout comme nouveau', () => {
    for (const [nom, q] of [['compteur', compteur.sql], ['cartes', cartes.sql]]) {
        assert.match(q, /\?\s+IS\s+NULL\s+OR\s+c\.created_at\s*>\s*\?/i,
            `${nom} : sans ce garde, une date NULL ne ramènerait RIEN au lieu de tout`);
    }
});

test('le compteur reste dans mon organisme et sur les fiches encore partagées', () => {
    // La pastille ne doit annoncer que ce sur quoi on peut réellement cliquer.
    assert.match(compteur.sql, /r\.organization_id\s*=\s*\?/);
    assert.match(compteur.sql, /r\.visibility\s*=\s*'SHARED'/);
});

test('le compte porte sur des lignes, donc une fiche à la fois mienne et commentée ne compte pas double', () => {
    // Les deux cas sont réunis par un OR dans un même WHERE : une ligne qui satisfait les
    // deux reste une ligne. Un JOIN ou une UNION ALL à la place aurait doublé le compte.
    assert.match(compteur.sql, /COUNT\(\*\)/);
    assert.doesNotMatch(compteur.sql, /UNION/i);
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

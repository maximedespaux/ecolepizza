/**
 * MIGRATION 146 — la banque Pizza Quest de NIV1 recopiée vers RS7404 et NIV1H.
 *
 * L'ÉTAT DE DÉPART, relevé en production : 26 chapitres et 175 questions, tous rattachés à NIV1
 * (20 chapitres, 139 questions) ou NIV2 (6 chapitres, 36 questions). RS7404 et NIV1H n'ont AUCUN
 * chapitre : leurs stagiaires ouvrent Pizza Quest sur un chemin vide, alors que ces formations
 * couvrent le même socle que NIV1.
 *
 * POURQUOI CE TEST LIT DU SQL. Le projet n'exécute jamais de migration : elle est écrite ici et
 * jouée par l'organisme. Personne ne la relira avant qu'elle ne touche la base de production —
 * ce fichier est donc la seule relecture qu'elle aura. Il vérifie ce qui, sur une migration de
 * DONNÉES, ne se rattrape pas après coup.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MIG = path.join(__dirname, '..', '..', '..', 'database/migrations');
const ALLER = path.join(MIG, '146_quest_niv1_vers_rs7404_niv1h.sql');
const RETOUR = path.join(MIG, '146_revert_quest_niv1_vers_rs7404_niv1h.sql');

const lire = (f) => fs.readFileSync(f, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('l\'aller et son revert existent tous les deux', () => {
    for (const f of [ALLER, RETOUR]) {
        assert.ok(fs.existsSync(f), `${path.basename(f)} manquant`);
    }
});

test('les commentaires sont en blocs, jamais en tirets', () => {
    /* Convention du projet : un commentaire SQL en double tiret dont l'espace manque devient du
       SQL, et un fichier joué en une passe n'offre aucune occasion de s'en apercevoir. */
    for (const f of [ALLER, RETOUR]) {
        for (const [i, l] of lire(f).split('\n').entries()) {
            assert.ok(!/^\s*--/.test(l), `${path.basename(f)} ligne ${i + 1} : commentaire en tirets`);
        }
    }
});

test('aucun littéral de chaîne n\'est laissé ouvert', () => {
    /* LE RISQUE PROPRE À CE FICHIER : douze explications en français, pleines d'apostrophes
       (« l'eau », « qu'elle », « d'où »). Une seule non doublée et tout ce qui suit est avalé
       dans la chaîne — l'erreur ne se verrait qu'au moment de jouer la migration, sur une base
       de production, avec la moitié des instructions déjà passées. */
    const marque = sansCommentaires(lire(ALLER)).replace(/''/g, ' ');
    assert.strictEqual(marque.split("'").length % 2, 1,
        'nombre impair d\'apostrophes : un littéral n\'est pas refermé');
    for (const [i, l] of marque.split('\n').entries()) {
        assert.strictEqual((l.match(/'/g) || []).length % 2, 0,
            `ligne ${i + 1} : apostrophes impaires — ${l.trim().slice(0, 80)}`);
    }
});

/* Découpe un fichier SQL comme le ferait un analyseur CONSCIENT des chaînes et des
   commentaires : seuls comptent les points-virgules qui terminent vraiment une instruction. */
function instructionsReelles(sql) {
    let i = 0, chaine = false, commentaire = false, nb = 0;
    while (i < sql.length) {
        const c = sql[i];
        if (commentaire) {
            if (sql.startsWith('*/', i)) { commentaire = false; i += 2; continue; }
            i += 1; continue;
        }
        if (chaine) {
            if (c === "'") {
                if (sql[i + 1] === "'") { i += 2; continue; }
                chaine = false;
            }
            i += 1; continue;
        }
        if (sql.startsWith('/*', i)) { commentaire = true; i += 2; continue; }
        if (c === "'") { chaine = true; i += 1; continue; }
        if (c === ';') nb += 1;
        i += 1;
    }
    return { nb, chaineOuverte: chaine, commentaireOuvert: commentaire };
}

test('le fichier se découpe pareil pour TOUS les clients SQL', () => {
    /* LE DÉFAUT VÉCU. La migration était syntaxiquement correcte — vingt instructions bien
       formées — et le client de l\'organisme l\'a pourtant refusée : « You have an error in your
       SQL syntax… near \'\'Au-dessus de +63 °C… ». Un client qui découpe un script sur les
       points-virgules SANS tenir compte des chaînes coupait au milieu d\'un texte, et envoyait
       au serveur une moitié d\'instruction.

       ÊTRE CORRECT NE SUFFIT PAS : le fichier doit être INTERPRÉTÉ pareil par un analyseur
       naïf et par un analyseur averti. On compare donc les deux découpages — ils doivent
       donner le même nombre d\'instructions. Cela interdit tout point-virgule ailleurs qu\'en
       fin d\'instruction : ni dans un texte, ni dans un commentaire. */
    for (const f of [ALLER, RETOUR]) {
        const sql = lire(f);
        const vrai = instructionsReelles(sql);
        const naif = sql.split(';').filter((x) => x.trim()).length;
        assert.ok(!vrai.chaineOuverte, `${path.basename(f)} : une chaîne reste ouverte`);
        assert.ok(!vrai.commentaireOuvert, `${path.basename(f)} : un commentaire reste ouvert`);
        assert.strictEqual(naif, vrai.nb,
            `${path.basename(f)} : ${naif} morceaux au découpage naïf contre ${vrai.nb} instructions `
            + 'réelles — un point-virgule traîne dans un texte ou un commentaire, et un client qui '
            + 'découpe naïvement cassera le script');
    }
});

test('aucune apostrophe échappée : on écrit l\'apostrophe française', () => {
    /* `s\'\'arrête` est valide en SQL, mais tous les clients ne comprennent pas le doublement —
       certains y voient une chaîne qui se ferme puis une autre qui s\'ouvre, et la suite du
       fichier part de travers. L\'apostrophe typographique « ’ » ne demande aucun échappement,
       et c\'est de toute façon le bon caractère en français : le projet l\'emploie déjà dans les
       textes destinés aux gens. */
    for (const f of [ALLER, RETOUR]) {
        assert.ok(!lire(f).includes("''"),
            `${path.basename(f)} : apostrophe échappée — écrire « ’ » plutôt que deux quotes`);
    }
});

test('les formations sont désignées par leur CODE, jamais par un identifiant écrit en dur', () => {
    /* Un identifiant recopié à la main rattacherait le contenu à la mauvaise formation SANS
       ERREUR : l'insertion réussirait, et 139 questions atterriraient ailleurs. Le code, lui,
       est lisible et se vérifie d'un coup d'œil. */
    const sql = sansCommentaires(lire(ALLER));
    assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
        'un identifiant est écrit en dur dans la migration');
    for (const code of ['NIV1', 'RS7404', 'NIV1H']) {
        assert.ok(sql.includes(`'${code}'`), `la formation ${code} doit être désignée par son code`);
    }
});

test('la migration se rejoue sans rien dupliquer', () => {
    /* Une migration de DONNÉES n'a pas de garde de schéma qui la protège comme une colonne :
       relancée, elle réinsère. Chaque copie est donc conditionnée à l'absence de contenu sur la
       formation cible — ce qui la rend aussi sûre si quelqu'un a créé des questions à la main
       entre-temps : elle s'abstient au lieu de mélanger deux banques. */
    const sql = sansCommentaires(lire(ALLER));
    const gardes = (sql.match(/NOT EXISTS\s*\(/g) || []).length;
    assert.ok(gardes >= 4, `attendu au moins quatre gardes d'absence, trouvé ${gardes}`);
});

test('les tables de correspondance ne survivent pas à la migration', () => {
    /* Elles ne servent qu'à relier les identifiants engendrés à leur source. Laissées en base,
       elles ressembleraient à du schéma et personne n'oserait plus y toucher. */
    const sql = lire(ALLER);
    for (const t of ['_quest_copie_chapitre', '_quest_copie_question', '_quest_copie_hygiene']) {
        assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `${t} doit être créée`);
        assert.ok(sql.includes(`DROP TABLE IF EXISTS ${t}`), `${t} doit être supprimée à la fin`);
    }
});

test('douze questions d\'hygiène, chacune avec sa réponse et son explication', () => {
    /* Le schéma le dit : l'explication « distingue un quiz d'un outil de révision — sans elle le
       stagiaire retient la bonne case, pas la raison ». Sur de l'hygiène, la raison est tout
       l'enjeu : on ne se lave pas les mains parce que c'est la bonne case. */
    const sql = lire(ALLER);
    const bloc = sql.slice(sql.indexOf('AS texte'));
    const questions = (bloc.match(/UNION ALL SELECT \d+,/g) || []).length + 1;
    assert.strictEqual(questions, 12, `attendu douze questions d'hygiène, trouvé ${questions}`);
    /* La première ligne de données nomme ses colonnes (`1 AS reponse,`), les suivantes n'ont
       que la valeur — c'est la forme d'un UNION. Le motif accepte les deux, sinon il compte
       onze et accuse un fichier correct. */
    const reponses = (bloc.match(/^\s+[01](?: AS reponse)?,$/gm) || []).length;
    assert.strictEqual(reponses, 12, 'chaque question vrai/faux doit porter sa réponse');
});

test('toute copie de questions emporte leurs options', () => {
    /* LE DÉFAUT QUE CE TEST GÈLE. Le bloc d'hygiène créait une table de correspondance
       ancienne → nouvelle question, s'en servait pour poser les questions… et s'arrêtait là.
       Or cette table n'existe QUE pour que les options suivent : sans leur copie, elle ne
       faisait qu'un travail que `uuid()` aurait fait en ligne.

       Inoffensif tant que les questions sont en VRAI/FAUX — elles ne portent aucune option —
       mais si le chapitre existait déjà, créé à la main avec des QCM, ils auraient été copiés
       SANS leurs choix. Des questions à zéro réponse, que rien ne signale : ni erreur SQL, ni
       message à l'écran.

       L'INVARIANT : toute table de correspondance qui sert à insérer des questions doit servir
       aussi à insérer leurs options.

       LE RAISONNEMENT SE FAIT PAR INSTRUCTION, et c'est le cœur du test. Une première version
       cherchait `INSERT INTO quest_option[\s\S]*?FROM _quest_copie_hygiene` sur le fichier
       entier : le quantificateur traversait les instructions et attrapait le `FROM
       _quest_copie_hygiene` du bloc de QUESTIONS, depuis un `INSERT INTO quest_option` situé
       cent lignes plus haut. Le test restait vert alors que la copie d'options avait été
       retirée — il ne prouvait rien. */
    const sansChaines = sansCommentaires(lire(ALLER)).replace(/'(?:[^']|'')*'/g, "''");
    const instructions = sansChaines.split(';').filter((x) => x.trim());

    const tableDe = (st) => (st.match(/FROM\s+(_quest_copie_\w+)/) || [])[1];
    const copiesQuestions = new Set(
        instructions.filter((st) => /INSERT INTO quest_question/.test(st)).map(tableDe).filter(Boolean)
    );
    const copiesOptions = new Set(
        instructions.filter((st) => /INSERT INTO quest_option/.test(st)).map(tableDe).filter(Boolean)
    );

    assert.ok(copiesQuestions.size >= 2,
        `attendu au moins deux copies de questions par correspondance, trouvé ${copiesQuestions.size}`);
    for (const t of copiesQuestions) {
        assert.ok(copiesOptions.has(t),
            `${t} sert à copier des questions mais jamais leurs options : un QCM y perdrait ses choix`);
    }
});

test('le revert retire les deux formations visées, et JAMAIS la source', () => {
    const sql = sansCommentaires(lire(RETOUR));
    assert.match(sql, /DELETE c FROM quest_chapter c/);
    assert.match(sql, /p\.code IN \('RS7404', 'NIV1H'\)/);
    assert.ok(!/'NIV1'/.test(sql),
        'le revert ne doit jamais toucher NIV1, dont la banque est la source');
});

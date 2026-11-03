/**
 * MIGRATION 217 — la banque Pizza Quest de la formation NIV1PRO, tirée du Manuel Niveau I PRO.
 *
 * Un stagiaire inscrit en NIV1PRO ouvrait Pizza Quest sur un chemin VIDE : aucun chapitre
 * n'était rattaché à ce code (relevé avant le seed). Le seed écrit 13 chapitres et ~112
 * questions (QCM, vrai/faux, associations) rattachés à la formation par son CODE.
 *
 * POURQUOI CE TEST LIT DU SQL. Le projet n'exécute jamais de migration : elle est écrite ici et
 * jouée par l'organisme. Personne ne la relira avant qu'elle ne touche la base de production —
 * ce fichier est la seule relecture qu'elle aura. Il gèle ce qui, sur une migration de DONNÉES,
 * ne se rattrape pas : les conventions de rédaction (mêmes défauts vécus que pour la 146) ET la
 * cohérence de chaque question (un QCM a exactement une bonne réponse, un vrai/faux n'a aucune
 * option, une association porte ses paires).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MIG = path.join(__dirname, '..', '..', '..', 'database/migrations');
const ALLER = path.join(MIG, '217_seed_quest_niv1pro.sql');
const RETOUR = path.join(MIG, '217_revert_seed_quest_niv1pro.sql');

const lire = (f) => fs.readFileSync(f, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('l\'aller et son revert existent tous les deux', () => {
    for (const f of [ALLER, RETOUR]) {
        assert.ok(fs.existsSync(f), `${path.basename(f)} manquant`);
    }
});

test('les commentaires sont en blocs, jamais en tirets', () => {
    for (const f of [ALLER, RETOUR]) {
        for (const [i, l] of lire(f).split('\n').entries()) {
            assert.ok(!/^\s*--/.test(l), `${path.basename(f)} ligne ${i + 1} : commentaire en tirets`);
        }
    }
});

test('aucune apostrophe échappée : on écrit l\'apostrophe française « ’ »', () => {
    /* Le doublement '' casse certains clients SQL (défaut vécu, cf. quest-copie-niv1). */
    for (const f of [ALLER, RETOUR]) {
        assert.ok(!lire(f).includes("''"),
            `${path.basename(f)} : apostrophe échappée — écrire « ’ » plutôt que deux quotes`);
    }
});

test('aucun littéral de chaîne n\'est laissé ouvert (apostrophes paires)', () => {
    for (const f of [ALLER, RETOUR]) {
        const marque = sansCommentaires(lire(f));
        assert.strictEqual(marque.split("'").length % 2, 1,
            `${path.basename(f)} : nombre impair d'apostrophes — un littéral n'est pas refermé`);
        for (const [i, l] of marque.split('\n').entries()) {
            assert.strictEqual((l.match(/'/g) || []).length % 2, 0,
                `${path.basename(f)} ligne ${i + 1} : apostrophes impaires — ${l.trim().slice(0, 80)}`);
        }
    }
});

/* Découpe un fichier SQL en étant CONSCIENT des chaînes et des commentaires : seuls comptent
   les points-virgules qui terminent vraiment une instruction. */
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
    /* Un ';' traînant dans un texte ou un commentaire, et un client qui découpe naïvement sur
       les points-virgules envoie au serveur une moitié d'instruction (défaut vécu sur la 146). */
    for (const f of [ALLER, RETOUR]) {
        const sql = lire(f);
        const vrai = instructionsReelles(sql);
        const naif = sql.split(';').filter((x) => x.trim()).length;
        assert.ok(!vrai.chaineOuverte, `${path.basename(f)} : une chaîne reste ouverte`);
        assert.ok(!vrai.commentaireOuvert, `${path.basename(f)} : un commentaire reste ouvert`);
        assert.strictEqual(naif, vrai.nb,
            `${path.basename(f)} : ${naif} morceaux au découpage naïf contre ${vrai.nb} réels `
            + '— un point-virgule traîne dans un texte ou un commentaire');
    }
});

test('la formation est désignée par son CODE, jamais par un identifiant écrit en dur', () => {
    const sql = sansCommentaires(lire(ALLER));
    assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
        'un identifiant est écrit en dur dans la migration');
    assert.match(sql, /WHERE code = 'NIV1PRO'/, 'la formation NIV1PRO est désignée par son code');
});

test('la migration se rejoue sans rien dupliquer : un DELETE par chapitre', () => {
    /* Une migration de DONNÉES n'a pas de garde de schéma. Chaque chapitre est supprimé par son
       titre avant d'être réinséré — relancer le fichier ne double rien. */
    const sql = sansCommentaires(lire(ALLER));
    const suppressions = (sql.match(/DELETE FROM quest_chapter WHERE organization_id = @org AND title = '/g) || []).length;
    const chapitres = (sql.match(/INSERT INTO quest_chapter \(/g) || []).length;
    assert.ok(chapitres >= 13, `attendu au moins 13 chapitres, trouvé ${chapitres}`);
    assert.strictEqual(suppressions, chapitres,
        `chaque chapitre doit être supprimé avant d'être réinséré (${suppressions} DELETE pour ${chapitres} chapitres)`);
});

/* Découpe l'aller en blocs « une question », sur le SET @q = uuid() qui ouvre chacune. */
function blocsQuestion(sql) {
    return sql.split(/\nSET @q = uuid\(\);\n/).slice(1);
}

test('la banque compte une centaine de questions, des trois types', () => {
    const sql = lire(ALLER);
    const blocs = blocsQuestion(sql).filter((b) => /INSERT INTO quest_question/.test(b));
    const parType = { QCM: 0, VF: 0, ASSOC: 0 };
    for (const b of blocs) {
        const t = (b.match(/@ch, '(QCM|VF|ASSOC)'/) || [])[1];
        assert.ok(t, `une question sans type reconnu : ${b.slice(0, 80)}`);
        parType[t] += 1;
    }
    const total = parType.QCM + parType.VF + parType.ASSOC;
    assert.strictEqual(total, blocs.length, 'chaque question porte un type');
    assert.ok(total >= 100, `attendu « l'équivalent de 100 » questions, trouvé ${total}`);
    assert.ok(parType.VF > 0 && parType.ASSOC > 0,
        `la banque doit mêler les trois types (trouvé ${JSON.stringify(parType)})`);
});

test('chaque question est cohérente : QCM à une seule bonne réponse, VF sans option, ASSOC apparié', () => {
    /* L'INVARIANT QUI COMPTE. Un QCM à deux bonnes réponses, ou à aucune, ne se voit ni à l'écran
       ni en base — le jeu prendrait la première ligne is_correct ou n'en trouverait pas. */
    const sql = lire(ALLER);
    for (const b of blocsQuestion(sql)) {
        const m = b.match(/@ch, '(QCM|VF|ASSOC)', '([^']{0,60})/);
        if (!m) continue;                                   // bloc de queue (transition de chapitre)
        const [type, apercu] = [m[1], m[2]];
        const optionsQcm = b.includes('INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES');
        const optionsAssoc = b.includes('INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES');

        if (type === 'QCM') {
            assert.ok(optionsQcm && !optionsAssoc, `QCM sans options simples : « ${apercu}… »`);
            const bons = (b.match(/, 1\)[,;]/g) || []).length;
            const mauvais = (b.match(/, 0\)[,;]/g) || []).length;
            assert.strictEqual(bons, 1, `QCM « ${apercu}… » : ${bons} bonnes réponses (il en faut exactement une)`);
            assert.ok(mauvais >= 2, `QCM « ${apercu}… » : seulement ${mauvais} leurres (il en faut au moins deux)`);
        } else if (type === 'VF') {
            assert.ok(!optionsQcm && !optionsAssoc, `un vrai/faux ne porte AUCUNE option : « ${apercu}… »`);
            assert.match(b, /@d_\w+, [01], \d+\);/, `vrai/faux « ${apercu}… » : vf_answer doit valoir 0 ou 1, pas NULL`);
        } else if (type === 'ASSOC') {
            assert.ok(optionsAssoc && !optionsQcm, `association sans paires (text/match_text) : « ${apercu}… »`);
            const paires = (b.match(/, 1\)[,;]/g) || []).length;
            assert.ok(paires >= 2, `association « ${apercu}… » : ${paires} paire(s), il en faut au moins deux`);
        }
    }
});

test('chaque question renvoie au Manuel Niveau I PRO', () => {
    const sql = lire(ALLER);
    const blocs = blocsQuestion(sql).filter((b) => /INSERT INTO quest_question/.test(b));
    for (const b of blocs) {
        assert.match(b, /'Manuel Niveau I PRO, p\. /,
            `une question sans renvoi au manuel : ${b.slice(0, 80)}`);
    }
});

test('le revert retire NIV1PRO, et JAMAIS une autre formation', () => {
    const sql = sansCommentaires(lire(RETOUR));
    assert.match(sql, /DELETE c FROM quest_chapter c/);
    assert.match(sql, /p\.code = 'NIV1PRO'/);
    for (const autre of ["'NIV1'", "'NIV2'", "'RS7404'", "'NIV1H'"]) {
        assert.ok(!sql.includes(autre),
            `le revert ne doit jamais toucher ${autre} : sa banque n'est pas concernée`);
    }
});

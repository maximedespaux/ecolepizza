/**
 * L'ENVOI D'UN QCM : ENTIER, OU PAS DU TOUT.
 *
 * DÉFAUT DE PRODUCTION, mesuré dans le journal du VPS le 2026-09-15 : `ER_DATA_TOO_LONG` sur
 * `quiz_answer.value`. La colonne était un `varchar(255)` et stocke les identifiants des options
 * cochées séparés par des virgules — un UUID fait 36 caractères, plus la virgule : À SEPT
 * OPTIONS COCHÉES on dépasse. Les stagiaires observés en avaient coché neuf et quatorze.
 *
 * CE QUE ÇA A PRODUIT, et c'est le vrai sujet de ce fichier : la ligne de réponse était DÉJÀ
 * écrite quand la boucle cassait. Il restait une réponse à moitié enregistrée, le document ne
 * passait jamais à SIGNÉ — d'où les stagiaires affichés « En cours » alors qu'ils avaient
 * répondu — et l'écran, voyant une réponse existante, leur refusait de recommencer.
 *
 * DEUX PARADES, ET IL FALLAIT LES DEUX : une colonne qui ne borne plus (migration 151), et une
 * écriture qui ne laisse pas d'état intermédiaire. La première fait disparaître CETTE cause ; la
 * seconde fait que la prochaine, quelle qu'elle soit, ne bloquera personne.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'controllers/quiz.controller.js'), 'utf8');
const BASE = path.join(__dirname, '..', '..', '..', 'database');
const MIG = (f) => fs.readFileSync(path.join(BASE, 'migrations', f), 'utf8');

test('SEPT OPTIONS COCHÉES DÉPASSAIENT 255 CARACTÈRES — l\'arithmétique du défaut', () => {
    /* Le calcul qui explique tout, gelé pour qu'on n'ait pas à le refaire : 36 caractères
       d'UUID, une virgule de séparation. Il dit aussi pourquoi un `varchar` plus large n'aurait
       été qu'un pari repoussé. */
    const uuid = '79a9c065-f11d-4e9d-8ef6-b21c330472de';
    assert.strictEqual(uuid.length, 36);
    const csv = (n) => Array.from({ length: n }, () => uuid).join(',');
    assert.ok(csv(6).length <= 255, 'six options passaient');
    assert.ok(csv(7).length > 255, 'sept ne passaient plus');
    assert.strictEqual(csv(14).length, 517, 'quatorze — le cas réel du journal');
});

test('LA COLONNE NE BORNE PLUS', () => {
    assert.match(MIG('151_quiz_answer_value_long.sql'),
        /ALTER TABLE quiz_answer MODIFY COLUMN value TEXT/);
    /* Le revert doit AVERTIR qu'il tronque : revenir en arrière couperait des réponses déjà
       enregistrées, ce qu'aucune autre migration de ce dépôt ne fait sans le dire. */
    assert.match(MIG('151_revert_quiz_answer_value_long.sql'), /TRONQUE|PERDUES/);
});

test('PLUS DE TRONCATURE SILENCIEUSE sur les grilles', () => {
    /* Le défaut VOISIN, et le pire des deux : les réponses de grille étaient coupées à 255
       caractères CÔTÉ APPLICATION, sans erreur, sans trace, avec une réponse qui avait l'air
       enregistrée. Celui-là ne s'est jamais vu — il ne cassait rien. */
    assert.ok(!SRC.includes("JSON.stringify(compact).slice(0, 255)"),
        'une grille ne doit plus être tronquée en silence');
    assert.match(SRC, /value = JSON\.stringify\(compact\);/);
});

test('L\'ÉCRITURE EST UNE TRANSACTION — entière ou inexistante', () => {
    /* C'est elle qui empêche le blocage, indépendamment de la cause. Sans elle, n'importe quelle
       erreur au milieu de la boucle laisse un stagiaire « En cours » et incapable de repasser
       son test. */
    const i = SRC.indexOf('const cx = await conn.getConnection();');
    assert.ok(i > 0, 'une connexion dédiée doit porter la transaction');
    const bloc = SRC.slice(i, i + 2000);
    assert.match(bloc, /await cx\.beginTransaction\(\);/);
    assert.match(bloc, /INSERT INTO quiz_response/, 'la réponse est dans la transaction');
    assert.match(bloc, /INSERT INTO quiz_answer/, 'les réponses aussi');
    assert.match(bloc, /UPDATE generated_document SET status = 'SIGNE'/, 'et le passage à SIGNÉ');
    assert.match(bloc, /await cx\.rollback\(\)/, 'un échec doit tout défaire');
    assert.match(bloc, /finally \{\s*cx\.release\(\);/, 'et la connexion doit toujours être rendue');
});

test('LA CONNEXION EST PRISE APRÈS ce qui peut lever', () => {
    /* Entre la prise de connexion et la transaction vivaient un sondage de colonne et la
       construction de la preuve. Une exception là aurait fait fuir la connexion — dix fois de
       suite, le pool était vide et l'application entière tombait. Pire panne que le défaut
       qu'on corrige. */
    const iPreuve = SRC.indexOf("colonneExiste(conn, 'quiz_response', 'snapshot')");
    const iCx = SRC.indexOf('const cx = await conn.getConnection();');
    assert.ok(iPreuve > 0 && iCx > iPreuve,
        'la connexion doit être prise APRÈS le sondage et la construction de la preuve');
});

test('LE NETTOYAGE NE VISE QUE LES RÉPONSES À MOITIÉ ÉCRITES', () => {
    /* Une suppression de données se justifie ligne à ligne. La signature d'une soumission
       cassée : moins de réponses que de questions, ET un document non signé. Les deux ensemble,
       jamais l'une seule — sinon on effacerait des réponses valides. */
    const sql = MIG('152_quiz_reponses_incompletes.sql');
    assert.match(sql, /d\.status <> 'SIGNE'/);
    assert.match(sql, /COUNT\(\*\) FROM quiz_answer[\s\S]{0,120}<[\s\S]{0,120}COUNT\(\*\) FROM quiz_question/);
    /* Un questionnaire SANS question compterait 0 < 0 — faux — mais la garde est explicite :
       une condition qui tient par accident se casse au premier changement. */
    assert.match(sql, /FROM quiz_question q WHERE q\.quiz_id = r\.quiz_id\) > 0/);
    /* `quiz_answer` n'a pas de clé étrangère vers `quiz_response` (migration 020) : rien ne les
       emporterait toutes seules. */
    assert.match(sql, /DELETE FROM quiz_answer WHERE response_id IN/);
    assert.match(sql, /DELETE FROM quiz_response WHERE id IN/);
    /* Et le revert doit DIRE qu'il ne restaure rien, plutôt que de laisser chercher. */
    assert.match(MIG('152_revert_quiz_reponses_incompletes.sql'), /aucun retour en arrière/i);
});

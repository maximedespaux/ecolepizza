/**
 * Génère le SQL d'import de la banque Pizza Quest à partir des fichiers JS d'origine.
 *
 * On LIT les sources (niv1Questions.js / niv2Questions.js) plutôt que de recopier les
 * questions à la main : 66 questions, leurs explications et leurs renvois au manuel
 * recopiés à la main, c'est la garantie d'une coquille silencieuse — un accent perdu, une
 * bonne réponse décalée d'un rang. Le script se rejoue si les fichiers évoluent.
 *
 * Usage : node database/tools/export-quest-questions.mjs > database/migrations/102_seed_quest_questions.sql
 */
import { NIV1_CHAPTERS } from '../../src/app/ui/lib/niv1Questions.js';
import { NIV2_CHAPTERS } from '../../src/app/ui/lib/niv2Questions.js';

/* Échappement SQL : quotes doublées et antislashs protégés (MariaDB traite `\` comme une
   échappe par défaut). NULL pour les champs absents, jamais la chaîne 'null'. */
const q = (v) => (v == null || v === ''
    ? 'NULL'
    : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);

const banks = [
    { key: 'niv1', varName: '@prog_niv1', label: 'Niveau I', chapters: NIV1_CHAPTERS },
    { key: 'niv2', varName: '@prog_niv2', label: 'Niveau II', chapters: NIV2_CHAPTERS },
];

const out = [];
const p = (s = '') => out.push(s);

p(`/* 102_seed_quest_questions.sql — DONNÉES (à jouer APRÈS 102_quest_questions.sql).

   Banque Pizza Quest exportée depuis le code (niv1Questions.js / niv2Questions.js).
   Fichier GÉNÉRÉ par database/tools/export-quest-questions.mjs — ne pas éditer à la main :
   modifiez les sources et relancez le script, ou éditez ensuite depuis l'application.

   ${banks.map((b) => `${b.label} : ${b.chapters.length} chapitres, ${b.chapters.reduce((n, c) => n + (c.questions || []).length, 0)} questions`).join('\n   ')}

   AVANT DE JOUER — vérifiez les trois variables ci-dessous. Elles sont devinées à partir de
   votre base ; si votre organisme n'est pas le premier créé, ou si vos formations ne
   s'appellent pas « Niveau I » / « Niveau II », corrigez-les à la main.

   Rejouable : les chapitres déjà importés (même organisme, même titre) sont supprimés puis
   réinsérés, options et questions comprises (ON DELETE CASCADE). Vos éventuelles retouches
   sur ces chapitres seraient donc écrasées — c'est le prix d'un import idempotent. */
`);

p(`/* ---- Cibles de l'import ------------------------------------------------------------ */`);
p(`/* L'organisme destinataire. Par défaut le plus ancien : dans une base mono-organisme,
   c'est le bon. Sinon : SET @org = (SELECT id FROM organization WHERE code = 'XXX'); */`);
p(`SET @org = (SELECT id FROM organization ORDER BY created_at LIMIT 1);`);
p();
p(`/* Les formations qui recevront ces chapitres. Le test « Niveau II » passe AVANT « Niveau I »
   car « niveau i » se retrouve dans « niveau ii » — l'ordre inverse rangerait tout le Niveau II
   dans le Niveau I. NULL est toléré : les chapitres sont alors importés sans formation, à
   rattacher ensuite dans l'application. */`);
p(`SET @prog_niv2 = (SELECT id FROM training_program WHERE organization_id = @org
    AND LOWER(CONCAT(title, ' ', code)) REGEXP 'niveau ii|empatement|empâtement' LIMIT 1);`);
p(`SET @prog_niv1 = (SELECT id FROM training_program WHERE organization_id = @org
    AND LOWER(CONCAT(title, ' ', code)) REGEXP 'niveau i|classique'
    AND LOWER(CONCAT(title, ' ', code)) NOT REGEXP 'niveau ii|empatement|empâtement' LIMIT 1);`);
p();

p(`/* ---- Difficultés -------------------------------------------------------------------- */`);
p(`/* Trois paliers pour démarrer, avec leur XP par défaut. Renommez-les, changez l'XP ou
   supprimez-en depuis l'application : rien ici n'est figé. Les questions importées partent
   toutes en « Normal », faute d'information de difficulté dans les fichiers d'origine. */`);
for (const [slug, name, xp, color, order] of [
    ['facile', 'Facile', 5, '#2f9e6f', 10],
    ['normal', 'Normal', 10, '#2c3371', 20],
    ['difficile', 'Difficile', 20, '#dc3e37', 30],
]) {
    p(`INSERT INTO quest_difficulty (organization_id, name, slug, xp, color, sort_order)
    SELECT @org, ${q(name)}, ${q(slug)}, ${xp}, ${q(color)}, ${order}
    WHERE NOT EXISTS (SELECT 1 FROM quest_difficulty WHERE organization_id = @org AND slug = ${q(slug)});`);
}
p();
p(`SET @diff_normal = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'normal' LIMIT 1);`);
p();

let chapterSeq = 0;
for (const bank of banks) {
    p(`/* ==== ${bank.label} =================================================================== */`);
    p();
    for (const ch of bank.chapters) {
        chapterSeq += 10;
        p(`/* -- ${ch.title} (${(ch.questions || []).length} questions) */`);
        /* Idempotence : on repart d'un chapitre propre. Les questions et options suivent par
           cascade, inutile de les supprimer explicitement. */
        p(`DELETE FROM quest_chapter WHERE organization_id = @org AND title = ${q(ch.title)};`);
        p(`SET @ch = uuid();`);
        p(`INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, ${bank.varName}, ${q(ch.title)}, ${q(ch.ic)}, ${chapterSeq});`);
        p();

        let pos = 0;
        for (const item of ch.questions || []) {
            pos += 10;
            const type = item.t === 'vf' ? 'VF' : item.t === 'assoc' ? 'ASSOC' : 'QCM';
            const vf = type === 'VF' ? (item.a ? 1 : 0) : 'NULL';
            p(`SET @q = uuid();`);
            p(`INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, '${type}', ${q(item.q)}, ${q(item.expl)}, ${q(item.src)}, @diff_normal, ${vf}, ${pos});`);

            if (type === 'QCM') {
                const choices = item.c || [];
                const rows = choices.map((c, i) =>
                    `    (@q, ${(i + 1) * 10}, ${q(c)}, ${i === item.a ? 1 : 0})`).join(',\n');
                p(`INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES\n${rows};`);
            } else if (type === 'ASSOC') {
                const rows = (item.pairs || []).map(([l, r], i) =>
                    `    (@q, ${(i + 1) * 10}, ${q(l)}, ${q(r)}, 1)`).join(',\n');
                p(`INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES\n${rows};`);
            }
            p();
        }
    }
}

p(`/* ---- Contrôle ----------------------------------------------------------------------- */`);
p(`/* Décommentez pour vérifier l'import :
SELECT c.title AS chapitre, COUNT(q.id) AS questions
  FROM quest_chapter c LEFT JOIN quest_question q ON q.chapter_id = c.id
 WHERE c.organization_id = @org GROUP BY c.id ORDER BY c.sort_order; */`);

process.stdout.write(out.join('\n') + '\n');

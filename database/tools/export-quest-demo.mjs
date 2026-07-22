/**
 * Génère le seed SQL des questions « fondamentaux » (ex-DEMO_QUESTIONS de PizzaQuest.jsx).
 *
 * Ces 8 questions servaient de repli aux formations sans banque : Découverte, Niveau I Pro,
 * Expert, Spécialisations. Elles étaient tirées AU HASARD dans une pile unique, et les six
 * « chapitres » affichés (Les farines, L'hydratation, Le pétrissage…) puisaient tous dedans —
 * les titres étaient donc décoratifs, aucune question n'appartenait à un chapitre.
 *
 * En les passant en base, on les RANGE pour de bon : quatre chapitres thématiques, chacun
 * avec ses questions. Les deux titres restés sans question (Le pétrissage, Dressage & service)
 * ne sont pas créés — un chapitre vide n'est pas jouable et n'apparaîtrait nulle part.
 *
 * Le fichier produit n'est PAS rattaché à une formation : l'organisme renseigne lui-même
 * @org et @prog en tête, ces questions étant assez générales pour aller sur n'importe quel
 * niveau (ou sur plusieurs, en rejouant le script avec un autre @prog et d'autres titres).
 *
 * Usage : node database/tools/export-quest-demo.mjs > database/migrations/103_seed_quest_fondamentaux.sql
 */

/* Les questions, telles qu'elles vivaient dans PizzaQuest.jsx (aucune retouche de contenu). */
const QUESTIONS = [
  { q: "Que signifie « TH » dans un empâtement ?", c: ["Taux d'hydratation", "Température de l'huile", "Temps de repos", "Type de farine"], a: 0,
    expl: "Le TH est le poids d'eau rapporté au poids de farine, en pourcentage. C'est LA valeur qui décrit un empâtement : tout le reste se calcule à partir d'elle.", src: "Manuel Niveau I, p. 32" },
  { q: "Pour 1 kg de farine à 65 % d'hydratation, combien d'eau ?", c: ["650 g", "65 g", "165 g", "6,5 kg"], a: 0,
    expl: "L'hydratation se calcule TOUJOURS sur le poids de farine : 1 000 g × 65 % = 650 g d'eau. Jamais sur le poids total de la pâte.", src: "Manuel Niveau I, p. 27 et 32" },
  { q: "La « force » d'une farine se mesure par…", c: ["Le W (force boulangère)", "Sa couleur", "Son prix", "Son taux de sucre"], a: 0,
    expl: "Le W vient de l'alvéographe de Chopin. Il dit combien de temps la pâte tient la fermentation — à ne pas confondre avec le type (T55, T65), qui parle de cendres.", src: "Manuel Niveau I, p. 17-18" },
  { q: "La poolish est une préfermentation…", c: ["Liquide (≈100 % d'hydratation)", "Sèche (≈45 %)", "Sans levure", "À base d'huile"], a: 0,
    expl: "Liquide, parce qu'on y met autant de farine que d'eau. Elle repose 12 à 15 h maximum et donne un goût très prononcé.", src: "Manuel Niveau II, p. 22-23" },
  { q: "La biga est une préfermentation…", c: ["Sèche (≈45–50 %)", "Liquide 100 %", "À base de tomate", "Sans farine"], a: 0,
    expl: "Solide — un « starter » à 45 % d'hydratation, qui repose 16 à 20 h à 19-24 °C. C'est l'opposé du poolish, et elle se stocke bien mieux.", src: "Manuel Niveau II, p. 25" },
  { q: "Le « pointage » désigne…", c: ["La 1re fermentation en masse", "La cuisson", "Le façonnage", "Le nappage"], a: 0,
    expl: "La pâte fermente encore en masse, avant division. Le repos des pâtons après boulage, lui, s'appelle l'apprêt : deux moments distincts qu'on confond souvent.", src: "Manuel Niveau I, p. 28-31" },
  { q: "Le sel dans la pâte sert surtout à…", c: ["Renforcer le gluten & réguler la fermentation", "Colorer la pâte", "Sucrer", "Faire lever plus vite"], a: 0,
    expl: "Il resserre le gluten et freine la levure : goût ET tenue. Sans sel, la fermentation s'emballe et la pâte s'affaisse. Dose usuelle : 17 à 22 g par kilo de farine.", src: "Manuel Niveau I, p. 24" },
  { q: "Température d'un four à bois pour une napolitaine ?", c: ["≈ 430–480 °C", "180 °C", "250 °C", "600 °C"], a: 0,
    expl: "C'est cette chaleur qui cuit la pizza en 60 à 90 secondes et fait gonfler le cornicione. Sous 400 °C, la pâte sèche avant d'avoir levé.", src: "Manuel Niveau I, p. 47-48" },
];

/* Rangement thématique (index dans QUESTIONS). Les titres reprennent ceux qui s'affichaient. */
const CHAPITRES = [
  { title: "Les farines", ic: "wheat", q: [2, 6] },        // force du blé + rôle du sel
  { title: "L'hydratation", ic: "droplet", q: [0, 1] },    // TH et son calcul
  { title: "La fermentation", ic: "refresh", q: [3, 4, 5] }, // poolish, biga, pointage
  { title: "La cuisson", ic: "flame", q: [7] },
];

const esc = (v) => (v == null || v === ''
    ? 'NULL'
    : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);

const out = [];
const p = (s = '') => out.push(s);

p(`/* 103_seed_quest_fondamentaux.sql — DONNÉES (à jouer APRÈS 102_quest_questions.sql).

   « Les fondamentaux » : ${QUESTIONS.length} questions de base (hydratation, farine, fermentation,
   cuisson), rangées en ${CHAPITRES.length} chapitres. Elles proviennent des questions de repli qui
   étaient codées en dur dans le jeu et servies aux formations sans banque.

   Fichier GÉNÉRÉ par database/tools/export-quest-demo.mjs — ne pas éditer à la main :
   modifiez le script et relancez-le, ou éditez ensuite depuis l'application.

   ┌─ À RENSEIGNER AVANT DE JOUER ─────────────────────────────────────────────────────┐
   │ @org  : l'UUID de votre organisme                                                 │
   │ @prog : l'UUID de la formation qui reçoit ces chapitres                           │
   └───────────────────────────────────────────────────────────────────────────────────┘

   Pour retrouver ces identifiants :
     SELECT id, legal_name FROM organization;
     SELECT id, code, title FROM training_program WHERE organization_id = '…' ORDER BY code;

   Ces questions étant générales, rien n'interdit de les poser sur PLUSIEURS formations :
   rejouez le script avec un autre @prog ET d'autres titres de chapitres (sans quoi le
   DELETE de rejouabilité, qui cible le titre, effacerait l'import précédent).

   Commentaires en blocs et type uuid : mêmes raisons qu'en 101 et 102. */
`);

p(`/* ---- Cibles de l'import ------------------------------------------------------------ */`);
p(`SET @org  = 'REMPLACER-PAR-UUID-ORGANISME';`);
p(`SET @prog = 'REMPLACER-PAR-UUID-FORMATION';`);
p();
p(`/* Difficulté « Normal » si elle existe déjà (créée par 102) ; sinon les questions prennent
   l'XP par défaut (10). Aucune difficulté n'est créée ici. */`);
p(`SET @diff = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'normal' LIMIT 1);`);
p();

let ordre = 0;
for (const ch of CHAPITRES) {
    ordre += 10;
    p(`/* -- ${ch.title} (${ch.q.length} question${ch.q.length > 1 ? 's' : ''}) */`);
    p(`DELETE FROM quest_chapter WHERE organization_id = @org AND title = ${esc(ch.title)};`);
    p(`SET @ch = uuid();`);
    p(`INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, ${esc(ch.title)}, ${esc(ch.ic)}, ${ordre});`);
    p();

    let pos = 0;
    for (const i of ch.q) {
        const item = QUESTIONS[i];
        pos += 10;
        p(`SET @q = uuid();`);
        p(`INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', ${esc(item.q)}, ${esc(item.expl)}, ${esc(item.src)}, @diff, NULL, ${pos});`);
        const rows = item.c.map((c, j) =>
            `    (@q, ${(j + 1) * 10}, ${esc(c)}, ${j === item.a ? 1 : 0})`).join(',\n');
        p(`INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES\n${rows};`);
        p();
    }
}

p(`/* ---- Contrôle ----------------------------------------------------------------------- */`);
p(`/* Décommentez pour vérifier :
SELECT p.code AS formation, c.title AS chapitre, COUNT(q.id) AS questions
  FROM quest_chapter c
  LEFT JOIN training_program p ON p.id = c.program_id
  LEFT JOIN quest_question q ON q.chapter_id = c.id
 WHERE c.organization_id = @org GROUP BY c.id ORDER BY c.sort_order; */`);

process.stdout.write(out.join('\n') + '\n');

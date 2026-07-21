/* 103_seed_quest_fondamentaux.sql — DONNÉES (à jouer APRÈS 102_quest_questions.sql).

   « Les fondamentaux » : 8 questions de base (hydratation, farine, fermentation,
   cuisson), rangées en 4 chapitres. Elles proviennent des questions de repli qui
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

/* ---- Cibles de l'import ------------------------------------------------------------ */
SET @org  = '6df7dddf-7df8-11f1-8ce4-525400cc2535';
SET @prog = 'REMPLACER-PAR-UUID-FORMATION';

/* Difficulté « Normal » si elle existe déjà (créée par 102) ; sinon les questions prennent
   l'XP par défaut (10). Aucune difficulté n'est créée ici. */
SET @diff = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'normal' LIMIT 1);

/* -- Les farines (2 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Les farines';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Les farines', 'wheat', 10);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'La « force » d''une farine se mesure par…', 'Le W vient de l''alvéographe de Chopin. Il dit combien de temps la pâte tient la fermentation — à ne pas confondre avec le type (T55, T65), qui parle de cendres.', 'Manuel Niveau I, p. 17-18', @diff, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le W (force boulangère)', 1),
    (@q, 20, 'Sa couleur', 0),
    (@q, 30, 'Son prix', 0),
    (@q, 40, 'Son taux de sucre', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le sel dans la pâte sert surtout à…', 'Il resserre le gluten et freine la levure : goût ET tenue. Sans sel, la fermentation s''emballe et la pâte s''affaisse. Dose usuelle : 17 à 22 g par kilo de farine.', 'Manuel Niveau I, p. 24', @diff, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Renforcer le gluten & réguler la fermentation', 1),
    (@q, 20, 'Colorer la pâte', 0),
    (@q, 30, 'Sucrer', 0),
    (@q, 40, 'Faire lever plus vite', 0);

/* -- L'hydratation (2 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L''hydratation';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'L''hydratation', 'droplet', 20);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que signifie « TH » dans un empâtement ?', 'Le TH est le poids d''eau rapporté au poids de farine, en pourcentage. C''est LA valeur qui décrit un empâtement : tout le reste se calcule à partir d''elle.', 'Manuel Niveau I, p. 32', @diff, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Taux d''hydratation', 1),
    (@q, 20, 'Température de l''huile', 0),
    (@q, 30, 'Temps de repos', 0),
    (@q, 40, 'Type de farine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour 1 kg de farine à 65 % d''hydratation, combien d''eau ?', 'L''hydratation se calcule TOUJOURS sur le poids de farine : 1 000 g × 65 % = 650 g d''eau. Jamais sur le poids total de la pâte.', 'Manuel Niveau I, p. 27 et 32', @diff, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '650 g', 1),
    (@q, 20, '65 g', 0),
    (@q, 30, '165 g', 0),
    (@q, 40, '6,5 kg', 0);

/* -- La fermentation (3 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La fermentation';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La fermentation', 'refresh', 30);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'La poolish est une préfermentation…', 'Liquide, parce qu''on y met autant de farine que d''eau. Elle repose 12 à 15 h maximum et donne un goût très prononcé.', 'Manuel Niveau II, p. 22-23', @diff, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Liquide (≈100 % d''hydratation)', 1),
    (@q, 20, 'Sèche (≈45 %)', 0),
    (@q, 30, 'Sans levure', 0),
    (@q, 40, 'À base d''huile', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'La biga est une préfermentation…', 'Solide — un « starter » à 45 % d''hydratation, qui repose 16 à 20 h à 19-24 °C. C''est l''opposé du poolish, et elle se stocke bien mieux.', 'Manuel Niveau II, p. 25', @diff, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Sèche (≈45–50 %)', 1),
    (@q, 20, 'Liquide 100 %', 0),
    (@q, 30, 'À base de tomate', 0),
    (@q, 40, 'Sans farine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le « pointage » désigne…', 'La pâte fermente encore en masse, avant division. Le repos des pâtons après boulage, lui, s''appelle l''apprêt : deux moments distincts qu''on confond souvent.', 'Manuel Niveau I, p. 28-31', @diff, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La 1re fermentation en masse', 1),
    (@q, 20, 'La cuisson', 0),
    (@q, 30, 'Le façonnage', 0),
    (@q, 40, 'Le nappage', 0);

/* -- La cuisson (1 question) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La cuisson';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La cuisson', 'flame', 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Température d''un four à bois pour une napolitaine ?', 'C''est cette chaleur qui cuit la pizza en 60 à 90 secondes et fait gonfler le cornicione. Sous 400 °C, la pâte sèche avant d''avoir levé.', 'Manuel Niveau I, p. 47-48', @diff, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '≈ 430–480 °C', 1),
    (@q, 20, '180 °C', 0),
    (@q, 30, '250 °C', 0),
    (@q, 40, '600 °C', 0);

/* ---- Contrôle ----------------------------------------------------------------------- */
/* Décommentez pour vérifier :
SELECT p.code AS formation, c.title AS chapitre, COUNT(q.id) AS questions
  FROM quest_chapter c
  LEFT JOIN training_program p ON p.id = c.program_id
  LEFT JOIN quest_question q ON q.chapter_id = c.id
 WHERE c.organization_id = @org GROUP BY c.id ORDER BY c.sort_order; */

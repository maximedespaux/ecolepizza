/* 102_seed_quest_questions.sql — DONNÉES (à jouer APRÈS 102_quest_questions.sql).

   Banque Pizza Quest exportée depuis le code (niv1Questions.js / niv2Questions.js).
   Fichier GÉNÉRÉ par database/tools/export-quest-questions.mjs — ne pas éditer à la main :
   modifiez les sources et relancez le script, ou éditez ensuite depuis l'application.

   Niveau I : 6 chapitres, 30 questions
   Niveau II : 6 chapitres, 36 questions

   AVANT DE JOUER — vérifiez les trois variables ci-dessous. Elles sont devinées à partir de
   votre base ; si votre organisme n'est pas le premier créé, ou si vos formations ne
   s'appellent pas « Niveau I » / « Niveau II », corrigez-les à la main.

   Rejouable : les chapitres déjà importés (même organisme, même titre) sont supprimés puis
   réinsérés, options et questions comprises (ON DELETE CASCADE). Vos éventuelles retouches
   sur ces chapitres seraient donc écrasées — c'est le prix d'un import idempotent. */

/* ---- Cibles de l'import ------------------------------------------------------------ */
/* L'organisme destinataire. Par défaut le plus ancien : dans une base mono-organisme,
   c'est le bon. Sinon : SET @org = (SELECT id FROM organization WHERE code = 'XXX'); */
SET @org = (SELECT id FROM organization ORDER BY created_at LIMIT 1);

/* Les formations qui recevront ces chapitres. Le test « Niveau II » passe AVANT « Niveau I »
   car « niveau i » se retrouve dans « niveau ii » — l'ordre inverse rangerait tout le Niveau II
   dans le Niveau I. NULL est toléré : les chapitres sont alors importés sans formation, à
   rattacher ensuite dans l'application. */
SET @prog_niv2 = (SELECT id FROM training_program WHERE organization_id = @org
    AND LOWER(CONCAT(title, ' ', code)) REGEXP 'niveau ii|empatement|empâtement' LIMIT 1);
SET @prog_niv1 = (SELECT id FROM training_program WHERE organization_id = @org
    AND LOWER(CONCAT(title, ' ', code)) REGEXP 'niveau i|classique'
    AND LOWER(CONCAT(title, ' ', code)) NOT REGEXP 'niveau ii|empatement|empâtement' LIMIT 1);

/* ---- Difficultés -------------------------------------------------------------------- */
/* Trois paliers pour démarrer, avec leur XP par défaut. Renommez-les, changez l'XP ou
   supprimez-en depuis l'application : rien ici n'est figé. Les questions importées partent
   toutes en « Normal », faute d'information de difficulté dans les fichiers d'origine. */
INSERT INTO quest_difficulty (organization_id, name, slug, xp, color, sort_order)
    SELECT @org, 'Facile', 'facile', 5, '#2f9e6f', 10
    WHERE NOT EXISTS (SELECT 1 FROM quest_difficulty WHERE organization_id = @org AND slug = 'facile');
INSERT INTO quest_difficulty (organization_id, name, slug, xp, color, sort_order)
    SELECT @org, 'Normal', 'normal', 10, '#2c3371', 20
    WHERE NOT EXISTS (SELECT 1 FROM quest_difficulty WHERE organization_id = @org AND slug = 'normal');
INSERT INTO quest_difficulty (organization_id, name, slug, xp, color, sort_order)
    SELECT @org, 'Difficile', 'difficile', 20, '#dc3e37', 30
    WHERE NOT EXISTS (SELECT 1 FROM quest_difficulty WHERE organization_id = @org AND slug = 'difficile');

SET @diff_normal = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'normal' LIMIT 1);

/* ==== Niveau I =================================================================== */

/* -- La farine (5 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La farine';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv1, 'La farine', 'wheat', 10);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que mesure le « W » d''une farine ?', 'Le W se mesure à l''alvéographe de Chopin : on gonfle une bulle de pâte jusqu''à ce qu''elle éclate. Plus la farine est forte, plus elle tient une longue fermentation sans s''affaisser.', 'Manuel Niveau I, p. 17-18', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Sa force : la résistance du pâton au travail', 1),
    (@q, 20, 'Son taux d''hydratation', 0),
    (@q, 30, 'Son taux de cendres', 0),
    (@q, 40, 'Sa finesse de mouture', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour une pizza napolitaine, quelle force de farine ?', 'La napolitaine matura longtemps : il faut assez de force pour tenir, mais pas une farine de renfort — trop forte, la pâte devient nerveuse et refuse de s''étaler.', 'Manuel Niveau I, p. 17-18', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'W 250–310', 1),
    (@q, 20, 'W 180–220', 0),
    (@q, 30, 'W 320–380', 0),
    (@q, 40, 'W 400–430', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quoi sert le réseau de gluten dans la pâte ?', 'Le gluten se forme quand la farine rencontre l''eau au pétrissage : c''est le filet qui emprisonne le gaz produit par la fermentation. Sans lui, la pâte ne lèverait pas.', 'Manuel Niveau I, lexique (maille glutineuse)', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'À retenir le gaz des levures et donner de l''élasticité', 1),
    (@q, 20, 'À nourrir les levures', 0),
    (@q, 30, 'À colorer la croûte à la cuisson', 0),
    (@q, 40, 'À faire tenir le sel dans la pâte', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'L''indice W est imprimé sur le sac de farine.', 'Il ne l''est presque jamais. Il faut demander la fiche technique au meunier — ou l''estimer à partir du taux de protéines affiché.', 'Manuel Niveau I, p. 17-18', @diff_normal, 0, 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque force de farine à son usage :', 'La règle est simple : plus la fermentation est longue, plus il faut de force. Les farines de renfort ne s''emploient pas seules, elles corrigent une farine trop faible.', 'Manuel Niveau I, p. 17-18', @diff_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'W 120–150', 'Biscuits & crackers', 1),
    (@q, 20, 'W 250–310', 'Pizza napolitaine', 1),
    (@q, 30, 'W 400–430', 'Renfort (Manitoba)', 1);

/* -- La levure (5 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La levure';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv1, 'La levure', 'yeast', 20);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Au-delà de quelle température de l''eau la levure est-elle détruite ?', 'Au-delà de 50 °C les cellules meurent : l''eau trop chaude tue la fermentation avant même qu''elle démarre. C''est l''erreur classique quand on veut « aider » la levure.', 'Manuel Niveau I, p. 19-21', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '50 °C', 1),
    (@q, 20, '40 °C', 0),
    (@q, 30, '60 °C', 0),
    (@q, 40, '70 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dose usuelle de levure fraîche par kilo de farine ?', 'La dose exacte se règle sur la température de la farine : le manuel donne une table qui va de 4 g (farine froide) à 2 g (farine chaude).', 'Manuel Niveau I, p. 19-21', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2 à 4 g', 1),
    (@q, 20, '1 à 2 g', 0),
    (@q, 30, '5 à 7 g', 0),
    (@q, 40, '8 à 10 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour réhydrater la levure sèche active, l''eau doit être à environ :', '38 °C la réveille sans la brûler — c''est sa température de confort, avec de la marge avant les 50 °C fatals.', 'Manuel Niveau I, p. 19-21', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '38 °C', 1),
    (@q, 20, '25 °C', 0),
    (@q, 30, '45 °C', 0),
    (@q, 40, '55 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Plus la farine est froide, la dose de levure doit être…', 'Le froid ralentit la levure : il en faut davantage pour obtenir la même poussée dans le même temps. La table du manuel va de 4 g à 2 g selon la température de la farine.', 'Manuel Niveau I, p. 19-21', @diff_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Plus élevée', 1),
    (@q, 20, 'Plus faible', 0),
    (@q, 30, 'Identique', 0),
    (@q, 40, 'Divisée par deux', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Une dose de levure trop élevée donne une pâte plus savoureuse et qui se conserve mieux.', 'C''est l''inverse : trop de levure fait lever vite, laisse un goût de levure et donne une pâte qui vieillit mal. L''arôme vient du TEMPS de fermentation, pas de la dose.', 'Manuel Niveau I, p. 19-21', @diff_normal, 0, 50);

/* -- L'eau & la température (5 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L''eau & la température';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv1, 'L''eau & la température', 'droplet', 30);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment nomme-t-on l''eau qui sert à pétrir la pâte ?', 'L''eau de coulage est celle du pétrissage. À ne pas confondre avec l''eau de bassinage, ajoutée en fin de pétrissage pour monter l''hydratation d''un cran.', 'Manuel Niveau I, p. 22 et p. 32', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L''eau de coulage', 1),
    (@q, 20, 'L''eau de bassinage', 0),
    (@q, 30, 'L''eau de frasage', 0),
    (@q, 40, 'L''eau de détrempe', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Formule de l''école (TB 50) : farine à 17 °C → eau de coulage à…', 'TB 50 : 50 − (température de la farine × 2). Ici 50 − (17 × 2) = 16 °C. Le but est d''arriver à une pâte à bonne température en fin de pétrissage.', 'Manuel Niveau I, p. 23', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '16 °C', 1),
    (@q, 20, '33 °C', 0),
    (@q, 30, '34 °C', 0),
    (@q, 40, '24 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle dureté d''eau est idéale pour la pâte ?', 'Les minéraux de l''eau raffermissent le gluten. Trop douce, la pâte devient molle et collante ; trop dure, elle se resserre et fermente mal.', 'Manuel Niveau I, p. 22', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '15 à 30 °f', 1),
    (@q, 20, '0 à 5 °f', 0),
    (@q, 30, '35 à 50 °f', 0),
    (@q, 40, 'Plus de 60 °f', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Température idéale de la pâte en fin de pétrissage ?', 'C''est la température qui lance la fermentation au bon rythme — et c''est exactement ce que le calcul TB 50 cherche à obtenir.', 'Manuel Niveau I, p. 22-23', @diff_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '23 à 25 °C', 1),
    (@q, 20, '18 à 20 °C', 0),
    (@q, 30, '27 à 29 °C', 0),
    (@q, 40, '30 à 32 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Plus l''eau est douce (calcaire proche de 0 °f), meilleure est la pâte.', 'Faux : une eau quasi sans minéraux ne raffermit pas le gluten. La pâte devient collante et manque de tenue. L''idéal reste 15 à 30 °f.', 'Manuel Niveau I, p. 22', @diff_normal, 0, 50);

/* -- Le sel & l'huile (5 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le sel & l''huile';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv1, 'Le sel & l''huile', 'salt', 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dosage usuel du sel par kilo de farine ?', 'En dessous, la pâte fermente trop vite et manque de goût. Au-dessus, le sel freine trop la levure et la pâte ne lève plus correctement.', 'Manuel Niveau I, p. 24', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '17 à 22 g', 1),
    (@q, 20, '8 à 12 g', 0),
    (@q, 30, '25 à 30 g', 0),
    (@q, 40, '35 à 40 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est l''effet du sel sur la fermentation ?', 'Le sel ralentit la levure et resserre le gluten : il apporte le goût ET la tenue, et il évite que la fermentation s''emballe. C''est un régulateur, pas un simple assaisonnement.', 'Manuel Niveau I, p. 24', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Il la freine et la régularise', 1),
    (@q, 20, 'Il l''accélère', 0),
    (@q, 30, 'Il la déclenche', 0),
    (@q, 40, 'Il n''a aucun effet dessus', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Une huile d''olive « extra vierge » a une acidité :', 'L''acidité libre mesure la dégradation de l''huile : plus elle est basse, plus l''huile est intacte. Sous 0,8 %, c''est la catégorie supérieure.', 'Manuel Niveau I, p. 25-26', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Inférieure à 0,8 %', 1),
    (@q, 20, 'Inférieure à 2 %', 0),
    (@q, 30, 'Inférieure à 3,3 %', 0),
    (@q, 40, 'Supérieure à 3,3 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La vraie pizza napolitaine ne contient pas d''huile dans sa pâte.', 'Vrai : farine, eau, sel, levure — rien d''autre. L''huile appartient à la pâte classique, où elle assouplit et aide à la conservation.', 'Manuel Niveau I, p. 25-26', @diff_normal, 1, 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque huile à son acidité :', 'C''est l''acidité qui classe l''huile, pas le goût ni le prix. Au-delà de 3,3 %, l''huile n''est plus commercialisable comme huile d''olive vierge.', 'Manuel Niveau I, p. 25-26', @diff_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Extra vierge', '< 0,8 %', 1),
    (@q, 20, 'Vierge', '≤ 2 %', 1),
    (@q, 30, '1er prix', '> 3,3 %', 1);

/* -- L'empâtement (5 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L''empâtement';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv1, 'L''empâtement', 'refresh', 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans l''empâtement direct, quand ajoute-t-on le sel ?', 'Mis trop tôt, le sel freine l''hydratation de la farine et gêne la formation du gluten. On l''incorpore une fois la pâte formée, puis l''huile en dernier.', 'Manuel Niveau I, p. 28-31', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Vers la fin, petit à petit, avant l''huile', 1),
    (@q, 20, 'Tout au début, avec la farine', 0),
    (@q, 30, 'Dans l''eau de coulage', 0),
    (@q, 40, 'Après le pointage', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le « pointage » désigne…', 'Le pointage est la 1re fermentation, la pâte encore en masse. Le repos des pâtons après boulage, lui, s''appelle l''apprêt — les deux se suivent, ne les confonds pas.', 'Manuel Niveau I, p. 28-31', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le repos de la pâte en masse, après le pétrissage', 1),
    (@q, 20, 'Le repos des pâtons après le boulage', 0),
    (@q, 30, 'La mise en forme du disque', 0),
    (@q, 40, 'La cuisson à blanc du fond', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'L''hydratation minimale en empâtement direct tourne autour de :', 'En dessous, il n''y a pas assez d''eau pour développer le gluten. La table du manuel fait ensuite monter l''hydratation avec la force de la farine.', 'Manuel Niveau I, p. 32', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '54 %', 1),
    (@q, 20, '45 %', 0),
    (@q, 30, '62 %', 0),
    (@q, 40, '70 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En autolyse, dans quel ordre travaille-t-on ?', 'Pendant le repos, la farine s''hydrate seule et le gluten se forme sans travail mécanique. Le sel et la levure sont tenus à l''écart : ils perturberaient ce repos.', 'Manuel Niveau I, p. 28-31', @diff_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Farine + eau, repos, puis sel et levure', 1),
    (@q, 20, 'Tout ensemble d''un coup', 0),
    (@q, 30, 'Farine + levure, repos, puis eau', 0),
    (@q, 40, 'Eau + sel, repos, puis farine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'L''autolyse permet d''obtenir une pâte plus extensible.', 'Vrai : le gluten se détend pendant le repos. La pâte s''étale plus facilement et se déchire moins — précieux sur les hautes hydratations.', 'Manuel Niveau I, p. 28-31', @diff_normal, 1, 50);

/* -- La cuisson & le matériel (5 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La cuisson & le matériel';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv1, 'La cuisson & le matériel', 'flame', 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Température de cuisson d''une pizza napolitaine ?', 'C''est cette chaleur qui cuit la pizza en 60 à 90 secondes et fait gonfler le cornicione d''un coup. Plus bas, la pâte sèche avant de lever.', 'Manuel Niveau I, p. 47', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '400 à 450 °C', 1),
    (@q, 20, '280 à 320 °C', 0),
    (@q, 30, '320 à 360 °C', 0),
    (@q, 40, '480 à 520 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'La chaleur transmise par contact direct avec la sole s''appelle…', 'Trois chaleurs cuisent une pizza : la conduction par la sole (contact), le rayonnement par la voûte, et la convection par l''air chaud qui tourne.', 'Manuel Niveau I, p. 47', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La conduction', 1),
    (@q, 20, 'Le rayonnement', 0),
    (@q, 30, 'La convection', 0),
    (@q, 40, 'L''inertie', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le pétrin à spirale travaille des quantités de pâte de…', 'C''est aussi le plus rapide des trois familles : il échauffe donc davantage l''empâtement, ce qui impose des temps de pétrissage plus courts et plus précis.', 'Manuel Niveau I, p. 51', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '10 à 60 kg', 1),
    (@q, 20, '2 à 5 kg', 0),
    (@q, 30, '60 à 120 kg', 0),
    (@q, 40, '120 à 200 kg', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Un four à bois doit être ramoné 2 fois par an.', 'Vrai — et facture à l''appui, l''assurance l''exige. C''est une contrainte du bois qu''on découvre souvent après l''achat, avec le conduit isolé et le stockage.', 'Manuel Niveau I, p. 48', @diff_normal, 1, 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque type de pizza à sa température de cuisson :', 'Chaque type a sa fenêtre : plus la pâte est fine et la cuisson courte, plus il faut de température. La teglia, épaisse, cuit plus doucement et plus longtemps.', 'Manuel Niveau I, p. 47', @diff_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Classique', '320–360 °C', 1),
    (@q, 20, 'Napolitaine', '400–450 °C', 1),
    (@q, 30, 'Plaque (teglia)', '320 °C', 1);

/* ==== Niveau II =================================================================== */

/* -- Direct ou indirect (6 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Direct ou indirect';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv2, 'Direct ou indirect', 'refresh', 70);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien d''étapes compte un empâtement indirect (biga ou poolish) ?', 'C''est la définition même de l''indirect : on fait d''abord fermenter une partie de la farine et de l''eau (le pré-ferment), puis on incorpore le reste. Le direct, lui, mélange tout d''un coup.', 'Manuel Niveau II, p. 21', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2 étapes : un pré-ferment, puis la pâte finale', 1),
    (@q, 20, '1 seule étape', 0),
    (@q, 30, '3 étapes', 0),
    (@q, 40, 'Autant qu''on veut', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En méthode directe, on…', 'Le direct est la méthode du Niveau I : tout ensemble, une seule fermentation. Simple et rapide, mais moins d''arômes qu''un pré-ferment qui a travaillé une nuit.', 'Manuel Niveau II, p. 21', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Mélange tous les ingrédients en une seule fois', 1),
    (@q, 20, 'Prépare d''abord un pré-ferment', 0),
    (@q, 30, 'Ne met pas de levure', 0),
    (@q, 40, 'Pétrit toujours 20 minutes', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Selon le manuel, quels avantages l''indirect apporte-t-il face au direct ?', 'La longue pré-fermentation développe les arômes et pré-digère les amidons. C''est du temps, pas de la technique : l''indirect ne coûte rien de plus, il demande de l''organisation.', 'Manuel Niveau II, p. 21-22', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Meilleur goût, arômes plus intenses, meilleure digestion', 1),
    (@q, 20, 'Une pâte moins chère', 0),
    (@q, 30, 'Un pétrissage plus court', 0),
    (@q, 40, 'Moins de levure à acheter', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'En 1ère phase d''un empâtement indirect, on prépare un pré-ferment avec de la farine, de l''eau et de la levure, laissé à température ambiante.', 'Vrai : farine, eau, levure — pas de sel ni d''huile, ils viendront en 2ème phase. Le sel freinerait la fermentation qu''on cherche justement à lancer.', 'Manuel Niveau II, p. 23 et 25', @diff_normal, 1, 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La méthode indirecte demande plus de temps de fermentation totale que la méthode directe pour une qualité équivalente.', 'Faux, et c''est tout l''intérêt : à qualité égale l''indirect ne rallonge pas le total, il le RÉPARTIT. Le pré-ferment travaille pendant la nuit, sans toi.', 'Manuel Niveau II, p. 21-22', @diff_normal, 0, 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque méthode à son nombre d''étapes :', 'Poolish et biga sont tous deux des indirects en 2 phases. Ce qui les sépare n''est pas le nombre d''étapes mais la texture du pré-ferment : liquide pour l''un, solide pour l''autre.', 'Manuel Niveau II, p. 21-25', @diff_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Direct', '1 étape', 1),
    (@q, 20, 'Poolish', '2 étapes', 1),
    (@q, 30, 'Biga', '2 étapes', 1);

/* -- Le poolish (6 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le poolish';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv2, 'Le poolish', 'droplet', 80);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le poolish est un pré-ferment…', 'Liquide, parce qu''on met autant de farine que d''eau (100 % d''hydratation). C''est ce qui le distingue de la biga, solide à 45 %.', 'Manuel Niveau II, p. 22', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Liquide', 1),
    (@q, 20, 'Solide', 0),
    (@q, 30, 'Sec', 0),
    (@q, 40, 'Gras', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En 1ère phase d''un poolish, quelle quantité de farine met-on ?', 'Farine = poids de l''eau : c''est la règle du poolish, et c''est elle qui le rend liquide. Attention, on met TOUTE l''eau de la recette en 1ère phase.', 'Manuel Niveau II, p. 23', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le poids de l''eau (donc autant de farine que d''eau)', 1),
    (@q, 20, 'La moitié du poids de l''eau', 0),
    (@q, 30, 'Le double du poids de l''eau', 0),
    (@q, 40, 'Toute la farine de la recette', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle part de la levure part en 1ère phase du poolish ?', '2/3 en 1ère phase pour lancer la pré-fermentation, le tiers restant en 2ème phase avec la farine manquante, le sel et l''huile.', 'Manuel Niveau II, p. 23', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2/3 de la levure', 1),
    (@q, 20, '1/3 de la levure', 0),
    (@q, 30, 'Toute la levure', 0),
    (@q, 40, 'Aucune', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de temps le poolish repose-t-il à température ambiante ?', '12 à 15 h MAXIMUM : au-delà le poolish s''effondre et devient acide. C''est ce qui impose de l''organiser la veille — le manuel le compte parmi ses inconvénients.', 'Manuel Niveau II, p. 22-23', @diff_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '12 à 15 heures maximum', 1),
    (@q, 20, '1 à 2 heures', 0),
    (@q, 30, '24 à 30 heures', 0),
    (@q, 40, '48 heures', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le poolish double voire triple de volume en 1ère phase : attention au débordement du pétrin.', 'Vrai, et le manuel le signale explicitement comme un risque. Un pétrin rempli à ras en 1ère phase déborde pendant la nuit.', 'Manuel Niveau II, p. 22', @diff_normal, 1, 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Une pâte au poolish se conserve une semaine sans problème.', 'Faux : elle doit être utilisée dans les 3 JOURS. Le poolish est aussi très instable en période chaude — c''est le prix de son goût prononcé.', 'Manuel Niveau II, p. 22', @diff_normal, 0, 60);

/* -- La biga (6 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La biga';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv2, 'La biga', 'package', 90);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'La biga est un pré-ferment…', 'Solide — le manuel dit « starter ». À 45 % d''hydratation elle ne coule pas : c''est l''opposé du poolish, et ça change tout son comportement.', 'Manuel Niveau II, p. 25', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Solide (un « starter »)', 1),
    (@q, 20, 'Liquide', 0),
    (@q, 30, 'À 100 % d''hydratation', 0),
    (@q, 40, 'Sans levure', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle hydratation pour la 1ère phase d''une biga ?', '45 % : la table du manuel le montre — biga 20 % pour 10 kg, c''est 2 kg de farine et 0,900 kg d''eau. 0,900 ÷ 2 = 45 %.', 'Manuel Niveau II, p. 25', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '45 % du poids de la farine de la 1ère phase', 1),
    (@q, 20, '100 % du poids de la farine', 0),
    (@q, 30, '60 % du poids de la farine', 0),
    (@q, 40, '25 % du poids de la farine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle dose de levure fraîche en 1ère phase de biga ?', '1 % de la farine de la 1ÈRE PHASE — pas de la farine totale. Pour 2 kg de farine en 1ère phase : 20 g. Le « 2/3 », c''est la règle du poolish, pas celle de la biga.', 'Manuel Niveau II, p. 25', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '1 % du poids de la farine de la 1ère phase', 1),
    (@q, 20, '0,1 % du poids de la farine', 0),
    (@q, 30, '5 % du poids de la farine', 0),
    (@q, 40, '2/3 de la levure totale', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Après 1 à 2 minutes de mélange, à quoi doit ressembler la biga ?', 'Filandreuse et grumeleuse, volontairement : on ne cherche PAS à développer le gluten en 1ère phase. Une biga lisse a été trop pétrie.', 'Manuel Niveau II, p. 25-26', @diff_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Une pâte filandreuse, non homogène', 1),
    (@q, 20, 'Une pâte lisse et homogène', 0),
    (@q, 30, 'Un liquide laiteux', 0),
    (@q, 40, 'Une pâte collante et brillante', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de temps la biga repose-t-elle, et à quelle température ?', '16 à 20 h à température ambiante (19-24 °C). Plus long que le poolish parce qu''elle est solide et moins hydratée : la fermentation y est plus lente.', 'Manuel Niveau II, p. 25-26', @diff_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '16 à 20 h maximum, entre 19 et 24 °C', 1),
    (@q, 20, '12 à 15 h, entre 3 et 4 °C', 0),
    (@q, 30, '2 h à 30 °C', 0),
    (@q, 40, '48 h à température ambiante', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'En 2ème phase de biga, on délaye d''abord 1/4 de l''eau manquante dans la biga pour obtenir un liquide laiteux, qu''on laisse reposer 10 minutes.', 'Vrai : ce « lait de biga » permet de redissoudre le starter solide avant d''incorporer le reste. Sans cette étape, la biga reste en morceaux dans la pâte.', 'Manuel Niveau II, p. 26', @diff_normal, 1, 60);

/* -- Doser sa biga (6 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Doser sa biga';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv2, 'Doser sa biga', 'list-checks', 100);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour 10 kg de farine, une biga à 20 % demande en 1ère phase :', '20 % de 10 kg = 2 kg de farine, hydratée à 45 % → 0,900 kg d''eau. Le leurre « 2 kg + 2 kg » serait un poolish (100 %), pas une biga.', 'Manuel Niveau II, p. 25 (table de dosage)', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2 kg de farine et 0,900 kg d''eau', 1),
    (@q, 20, '2 kg de farine et 2 kg d''eau', 0),
    (@q, 30, '4 kg de farine et 1,800 kg d''eau', 0),
    (@q, 40, '1 kg de farine et 0,450 kg d''eau', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour 10 kg de farine, une biga à 40 % demande en 1ère phase :', '40 % de 10 kg = 4 kg de farine, toujours à 45 % → 1,800 kg d''eau. Le pourcentage de biga change la QUANTITÉ, jamais l''hydratation du starter.', 'Manuel Niveau II, p. 25 (table de dosage)', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '4 kg de farine et 1,800 kg d''eau', 1),
    (@q, 20, '4 kg de farine et 4 kg d''eau', 0),
    (@q, 30, '2 kg de farine et 0,900 kg d''eau', 0),
    (@q, 40, '3 kg de farine et 1,350 kg d''eau', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'La levure sèche instantanée se dose, en 1ère phase, à :', 'Moitié moins que la fraîche (1 %), parce qu''elle est bien plus concentrée. Confondre les deux, c''est doubler la levure et emballer la fermentation.', 'Manuel Niveau II, p. 25', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '0,5 % du poids de la farine de la 1ère phase', 1),
    (@q, 20, '1 % du poids de la farine', 0),
    (@q, 30, '2 % du poids de la farine', 0),
    (@q, 40, 'La même dose que la fraîche', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À W égal, que devient l''eau totale quand le pourcentage de biga augmente ?', 'Elle diminue : à W330, l''eau de 2ème phase passe de 4,800 kg (biga 20 %) à 4,100 kg (biga 40 %). Plus de pâte est déjà hydratée dans le starter.', 'Manuel Niveau II, p. 25 (table de dosage)', @diff_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Elle diminue', 1),
    (@q, 20, 'Elle augmente', 0),
    (@q, 30, 'Elle ne bouge pas', 0),
    (@q, 40, 'Elle double', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Une biga à 30 % pour 10 kg de farine utilise 3 kg de farine et 30 g de levure fraîche en 1ère phase.', 'Vrai : 30 % de 10 kg = 3 kg de farine, et 1 % de 3 kg = 30 g de levure fraîche. La table du manuel donne exactement ces valeurs.', 'Manuel Niveau II, p. 25 (table de dosage)', @diff_normal, 1, 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Plus la farine est forte (W élevé), moins on met d''eau au total.', 'C''est l''inverse : une farine forte ABSORBE plus. La table le montre pour une biga 20 % — W330 : 4,800 kg d''eau ; W390 : 5 kg ; W420 : 5,100 kg.', 'Manuel Niveau II, p. 25 (table de dosage)', @diff_normal, 0, 60);

/* -- Le protocole (6 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le protocole';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv2, 'Le protocole', 'clock', 110);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Après un empâtement indirect (biga ou poolish), que fait-on du pointage ?', 'Pas de pointage — le manuel l''écrit en toutes lettres. La fermentation a déjà eu lieu dans le pré-ferment : en rajouter une ferait sur-fermenter la pâte.', 'Manuel Niveau II, p. 23 et 25', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Pas de pointage : on boule de suite et on bloque au froid', 1),
    (@q, 20, 'Un pointage de 30 minutes', 0),
    (@q, 30, 'Un pointage de 2 heures', 0),
    (@q, 40, 'Un pointage d''une nuit', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de temps dure la détente avant de diviser ?', '5 minutes sous film, juste de quoi détendre le gluten après le rabat pour que la masse se laisse étaler sans se rétracter.', 'Manuel Niveau II, p. 23 et 26', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '5 minutes', 1),
    (@q, 20, '30 minutes', 0),
    (@q, 30, '1 heure', 0),
    (@q, 40, 'Pas de détente', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quelle épaisseur étale-t-on la masse avant de diviser ?', 'Un rectangle de 10 cm : la forme régulière permet de couper des pâtons de poids proche du premier coup, sans réajuster.', 'Manuel Niveau II, p. 23 et 26', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '10 cm, en forme rectangulaire', 1),
    (@q, 20, '1 cm, en forme ronde', 0),
    (@q, 30, '30 cm, en boule', 0),
    (@q, 40, '3 cm, en rectangle', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quelle température bloque-t-on les pâtons en bacs ?', '3 à 4 °C en bacs 60×40 : le froid met la fermentation en pause et te rend maître du moment où tu sors les pâtons. 19-24 °C, c''est le repos du pré-ferment, pas le blocage.', 'Manuel Niveau II, p. 23 et 26', @diff_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Entre 3 et 4 °C', 1),
    (@q, 20, 'Entre 19 et 24 °C', 0),
    (@q, 30, 'À −18 °C', 0),
    (@q, 40, 'À température ambiante', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quand ajoute-t-on le sel et l''huile d''olive ?', 'En fin de 2ème phase seulement. Mis dans le pré-ferment, le sel bloquerait la fermentation qu''on cherche justement à obtenir pendant la nuit.', 'Manuel Niveau II, p. 23 et 26', @diff_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'En fin de pétrissage, on laisse tourner 2 à 3 minutes', 1),
    (@q, 20, 'Tout au début, avec la farine', 0),
    (@q, 30, 'Dans le pré-ferment de 1ère phase', 0),
    (@q, 40, 'Après le blocage au froid', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La 1ère phase de la biga se fait au réfrigérateur, entre 3 et 4 °C.', 'Faux : la biga repose à TEMPÉRATURE AMBIANTE, 19 à 24 °C. Les 3-4 °C, c''est le blocage des pâtons tout à la fin — ne confonds pas les deux moments.', 'Manuel Niveau II, p. 25-26', @diff_normal, 0, 60);

/* -- Choisir son empâtement (6 questions) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Choisir son empâtement';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog_niv2, 'Choisir son empâtement', 'check-circle', 120);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour une pizza à emporter, quel empâtement est le plus adapté ?', 'Le tableau les note tous deux « très adapté » à l''emporter : ils tiennent le transport sans se détremper. Les pâtes très hydratées, elles, ramollissent dans la boîte.', 'Manuel Niveau II, p. 34 (tableau des différences)', @diff_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le direct ou la biga', 1),
    (@q, 20, 'La napolitaine', 0),
    (@q, 30, 'Le poolish', 0),
    (@q, 40, 'La contemporaine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel empâtement est le moins adapté à l''emporté ?', 'La napolitaine est notée « peu adaptée » : très hydratée et cuite en 90 secondes, elle est faite pour être mangée sur place, tout de suite. Dans un carton, elle se détrempe.', 'Manuel Niveau II, p. 34 (tableau des différences)', @diff_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La napolitaine', 1),
    (@q, 20, 'La biga', 0),
    (@q, 30, 'Le direct', 0),
    (@q, 40, 'Le poolish', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Selon le tableau du manuel, quel empâtement est le plus difficile à stocker ?', 'Tous deux sont notés « pas adapté » au stockage. Les indirects, eux, se gardent bien : c''est justement ce qui permet de produire la veille.', 'Manuel Niveau II, p. 34 (tableau des différences)', @diff_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le direct et la contemporaine', 1),
    (@q, 20, 'La biga', 0),
    (@q, 30, 'Le poolish', 0),
    (@q, 40, 'Tous se stockent pareil', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel empâtement est le plus facile à étaler ?', 'Le direct, seul noté « très adapté » à l''étalage. Moins hydraté et moins fermenté, il se laisse travailler — c''est pour ça qu''on l''apprend en premier.', 'Manuel Niveau II, p. 34 (tableau des différences)', @diff_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le direct', 1),
    (@q, 20, 'La napolitaine', 0),
    (@q, 30, 'Le poolish', 0),
    (@q, 40, 'La contemporaine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le direct donne une pâte plus moelleuse que la biga.', 'Faux, c''est même l''inverse marqué du tableau : le direct est « peu adapté » au moelleux, la biga « très adaptée ». La longue fermentation fait la mie.', 'Manuel Niveau II, p. 34 (tableau des différences)', @diff_normal, 0, 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La biga est très adaptée au stockage comme à la texture moelleuse.', 'Vrai, doublement noté « très adapté ». C''est ce qui en fait l''empâtement de la production organisée : on prépare la veille et la pâte est meilleure le lendemain.', 'Manuel Niveau II, p. 34 (tableau des différences)', @diff_normal, 1, 60);

/* ---- Contrôle ----------------------------------------------------------------------- */
/* Décommentez pour vérifier l'import :
SELECT c.title AS chapitre, COUNT(q.id) AS questions
  FROM quest_chapter c LEFT JOIN quest_question q ON q.chapter_id = c.id
 WHERE c.organization_id = @org GROUP BY c.id ORDER BY c.sort_order; */

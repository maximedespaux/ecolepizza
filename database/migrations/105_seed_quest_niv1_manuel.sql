/* 105_seed_quest_niv1_manuel.sql — DONNÉES (à jouer APRÈS 102_quest_questions.sql).

   Banque « Niveau I » tirée du Manuel Technique Niveau I (mise à jour du 14/01/2026).
   15 chapitres, 114 questions — 80 QCM, 19 vrai/faux, 15 associations.
   Difficultés : 21 faciles, 43 normales, 50 difficiles.

   Chaque réponse est vérifiable dans le manuel, à la page indiquée par la source. Les
   fourchettes du manuel sont reprises telles quelles (« 17 à 22 g » et non « 20 g »).

   LA DIFFICULTÉ TIENT AUX LEURRES, pas à l'énoncé — c'est la règle de rédaction du manuel
   lui-même : une mauvaise réponse absurde s'élimine sans rien connaître, et la question ne
   teste plus rien.
     · facile    : les leurres viennent d'un autre domaine ; avoir lu le chapitre suffit.
     · normal    : les leurres sont des valeurs réelles du métier, mais d'un autre usage
                   (la dose de sel proposée pour la levure).
     · difficile : les leurres sont les valeurs VOISINES de la bonne (54 % contre 55 %,
                   38 °C contre 50 °C), ou demandent un calcul. Rien ne se devine.

   Fichier GÉNÉRÉ par database/tools/export-quest-niv1-manuel.mjs — ne pas éditer à la main :
   modifiez le script et relancez-le, ou éditez ensuite depuis l'application.

   ┌─ À RENSEIGNER AVANT DE JOUER ─────────────────────────────────────────────────────┐
   │ @org  : l'UUID de votre organisme                                                 │
   │ @prog : l'UUID de la formation Niveau I qui reçoit ces chapitres                  │
   └───────────────────────────────────────────────────────────────────────────────────┘
     SELECT id, legal_name FROM organization;
     SELECT id, code, title FROM training_program WHERE organization_id = '…' ORDER BY code;

   Les difficultés sont reprises par SLUG (facile / normal / difficile), telles que créées
   par 102_seed_quest_questions.sql. Absentes, les questions prennent l'XP par défaut.

   Rejouable : chaque chapitre est supprimé puis réinséré (questions et options suivent par
   cascade). Vos retouches sur CES chapitres seraient donc écrasées. */

/* ---- Cibles de l'import ------------------------------------------------------------ */
SET @org  = '6df7dddf-7df8-11f1-8ce4-525400cc2535';
SET @prog = 'dce56d25-69a4-4d8a-bd0d-0a3ffff4de83';

SET @d_facile    = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'facile'    LIMIT 1);
SET @d_normal    = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'normal'    LIMIT 1);
SET @d_difficile = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'difficile' LIMIT 1);

/* -- Les céréales & le grain — 7 questions (1 F / 4 N / 2 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Les céréales & le grain';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Les céréales & le grain', 'wheat', 10);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quelle famille botanique appartiennent les céréales ?', 'Les céréales sont des poacées, sauvages ou cultivées, qui produisent des grains comestibles moulus en farine.', 'Manuel Niveau I, p. 5', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Les poacées (graminées)', 1),
    (@q, 20, 'Les solanacées', 0),
    (@q, 30, 'Les légumineuses', 0),
    (@q, 40, 'Les brassicacées', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Laquelle de ces céréales NE contient PAS de gluten ?', 'Sarrasin, maïs, riz, sorgho, quinoa, millet et teff sont sans gluten. Épeautre, seigle et orge en contiennent, comme le blé et le kamut.', 'Manuel Niveau I, p. 5', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le sarrasin', 1),
    (@q, 20, 'L''épeautre', 0),
    (@q, 30, 'Le seigle', 0),
    (@q, 40, 'L''orge', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le blé TENDRE est principalement utilisé pour…', 'Le blé tendre a un albumen moins riche en protéines et en gluten, à texture plus douce : c''est la farine de panification. Le blé dur, à albumen vitreux, part en pâtes, semoule, boulgour et couscous.', 'Manuel Niveau I, p. 6', @d_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La panification (dont la pizza)', 1),
    (@q, 20, 'Les pâtes alimentaires', 0),
    (@q, 30, 'La semoule et le couscous', 0),
    (@q, 40, 'Le boulgour', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Après broyage, quelle granulométrie correspond au blé tendre ?', 'Le blé tendre donne les particules les plus fines, 30 à 200 µm ; le blé dur les grosses particules, 150 à 500 µm. Le µm vaut un millième de millimètre.', 'Manuel Niveau I, p. 6', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '30 à 200 µm', 1),
    (@q, 20, '150 à 500 µm', 0),
    (@q, 30, '500 à 800 µm', 0),
    (@q, 40, '5 à 20 µm', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans le caryopse, quelle part représente l''albumen (amande) ?', 'L''albumen pèse 82 à 85 % du grain, les enveloppes (son) 13 à 15 %, le germe environ 3 %. Le 64-80 % est la part d''amidon dans la farine, pas dans le grain.', 'Manuel Niveau I, p. 7', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '82 à 85 %', 1),
    (@q, 20, '13 à 15 %', 0),
    (@q, 30, 'environ 3 %', 0),
    (@q, 40, '64 à 80 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le blé dur possède un albumen vitreux, plus riche en protéines que le blé tendre.', 'C''est précisément ce qui lui donne sa texture ferme et le destine aux pâtes plutôt qu''à la panification.', 'Manuel Niveau I, p. 5-6', @d_normal, 1, 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque partie du grain à sa proportion :', 'L''essentiel du grain est de l''amande — c''est elle qui donne la farine blanche. Les enveloppes partent au son, le germe est infime mais riche.', 'Manuel Niveau I, p. 7', @d_normal, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Albumen (amande)', '82 à 85 %', 1),
    (@q, 20, 'Enveloppes (son)', '13 à 15 %', 1),
    (@q, 30, 'Germe (embryon)', 'environ 3 %', 1);

/* -- Le gluten — 6 questions (2 F / 3 N / 1 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le gluten';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Le gluten', 'refresh', 20);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelles sont les deux protéines qui forment le réseau de gluten ?', 'Gliadine et gluténine se fusionnent au pétrissage et créent le réseau élastique. Globuline et albumine sont les protéines SOLUBLES de la farine, elles ne forment pas la maille.', 'Manuel Niveau I, p. 8 et 10', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La gliadine et la gluténine', 1),
    (@q, 20, 'La globuline et l''albumine', 0),
    (@q, 30, 'L''amidon et la cellulose', 0),
    (@q, 40, 'La caséine et la lactoglobuline', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle part des protéines du blé le gluten représente-t-il ?', 'Le gluten constitue environ 80 % des protéines du blé. Les 15 % renvoient aux protéines solubles (globuline, albumine).', 'Manuel Niveau I, p. 8', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'environ 80 %', 1),
    (@q, 20, 'environ 15 %', 0),
    (@q, 30, 'environ 50 %', 0),
    (@q, 40, 'environ 95 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que retient le réseau de gluten pendant la fermentation ?', 'C''est le filet qui emprisonne le CO₂ issu de la dégradation des sucres : sans lui, la pâte ne lèverait pas et la mie n''aurait pas d''alvéoles.', 'Manuel Niveau I, p. 8', @d_facile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le gaz carbonique produit par les levures', 1),
    (@q, 20, 'Le sel dissous dans l''eau', 0),
    (@q, 30, 'L''huile d''olive', 0),
    (@q, 40, 'Les cendres de la farine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'C''est en pétrissant LENTEMENT que l''on développe le plus le réseau de gluten.', 'C''est l''inverse : à vitesse rapide, le réseau sera plus important. C''est aussi pour cela que le pétrin à spirale, le plus rapide, accélère la formation de la maille.', 'Manuel Niveau I, p. 8 et 42', @d_normal, 0, 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Sans gluten, une pâte est plus élastique et se lie mieux.', 'L''inverse : sans gluten la pâte est cassante et friable, elle ne se lie pas. On appelle « panifiables » les farines qui en contiennent assez pour que la pâte lève.', 'Manuel Niveau I, p. 8', @d_facile, 0, 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment se nomment les liaisons chimiques qui structurent le réseau de gluten ?', 'Le gluten, combiné à l''eau et à une source d''énergie, forme des ponts disulfures qui créent le réseau.', 'Manuel Niveau I, p. 8', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Les ponts disulfures', 1),
    (@q, 20, 'Les liaisons hydrogène', 0),
    (@q, 30, 'Les ponts salins', 0),
    (@q, 40, 'Les liaisons peptidiques', 0);

/* -- La farine : type & raffinage — 8 questions (0 F / 4 N / 4 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La farine : type & raffinage';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La farine : type & raffinage', 'package', 30);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu''est-ce qui détermine le TYPE d''une farine (T45, T55, T65…) ?', 'Le type est fixé par le poids de cendres contenu dans 100 g de matières sèches. Les cendres sont les matières minérales, principalement présentes dans le son.', 'Manuel Niveau I, p. 14', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Son taux de cendres', 1),
    (@q, 20, 'Son indice de force W', 0),
    (@q, 30, 'Son taux de protéines', 0),
    (@q, 40, 'Sa granulométrie', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quel taux de cendres correspond une farine T65 ?', 'T65 : 0,62 à 0,75, pour un taux d''extraction de 78 % — la farine de la pizza et de la baguette de tradition. 0,50-0,60 est la T55, 0,75-0,90 la T80.', 'Manuel Niveau I, p. 13', @d_difficile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '0,62 à 0,75', 1),
    (@q, 20, '0,50 à 0,60', 0),
    (@q, 30, '0,75 à 0,90', 0),
    (@q, 40, '1,00 à 1,20', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien existe-t-il de types de farine en France ?', 'Six types en France (150, 110, 80, 65, 55, 45) contre cinq en Italie (integrale, 2, 1, 0, 00).', 'Manuel Niveau I, p. 14', @d_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '6', 1),
    (@q, 20, '5', 0),
    (@q, 30, '4', 0),
    (@q, 40, '8', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour 100 kg de blé, quelle quantité de farine cherche-t-on le plus souvent à obtenir ?', '75 kg de farine, 2 % de perte, et les 23 % restants forment les « issues ». Les 78 % et 67 % sont des taux d''extraction de types précis (T65, T45), pas la moyenne recherchée.', 'Manuel Niveau I, p. 14', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '75 kg', 1),
    (@q, 20, '78 kg', 0),
    (@q, 30, '67 kg', 0),
    (@q, 40, '85 kg', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle est la température MAXIMALE du local de stockage de la farine ?', 'Un local sec et ventilé à 16 °C maximum, la farine sur palette pour laisser passer l''air et éviter les blocs, et une protection contre rongeurs et insectes.', 'Manuel Niveau I, p. 12', @d_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '16 °C', 1),
    (@q, 20, '4 °C', 0),
    (@q, 30, '20 °C', 0),
    (@q, 40, '25 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est le taux d''humidité MAXIMAL mentionné obligatoirement sur un sac de farine ?', '15,5 % maximum. C''est l''une des cinq mentions obligatoires, avec le type, la DLUO, le poids et le nom du moulin.', 'Manuel Niveau I, p. 12', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '15,5 %', 1),
    (@q, 20, '14 %', 0),
    (@q, 30, '16 %', 0),
    (@q, 40, '12,5 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Plus une farine est blanche, plus son taux de cendres est faible.', 'La farine la plus blanche est faite essentiellement de l''amande du grain : elle est très pure, donc peu chargée en débris minéraux.', 'Manuel Niveau I, p. 14 et lexique', @d_normal, 1, 70);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque type français à son équivalent italien :', 'La correspondance suit le raffinage : plus le chiffre français est bas, plus la farine est blanche, et plus le « tipo » italien compte de zéros.', 'Manuel Niveau I, p. 13-14', @d_difficile, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'T45', '00', 1),
    (@q, 20, 'T65', '0', 1),
    (@q, 30, 'T80', '1', 1),
    (@q, 40, 'T110', '2', 1);

/* -- L'indice de force (W) — 9 questions (2 F / 3 N / 4 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L''indice de force (W)';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'L''indice de force (W)', 'flask', 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que mesure l''indice W d''une farine ?', 'Le W mesure le travail nécessaire pour déformer le pâton jusqu''à son éclatement — la « force boulangère ». Le taux de cendres, lui, donne le TYPE.', 'Manuel Niveau I, p. 15-16', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Sa force boulangère', 1),
    (@q, 20, 'Son taux d''hydratation', 0),
    (@q, 30, 'Son taux de cendres', 0),
    (@q, 40, 'Sa finesse de mouture', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel appareil sert à déterminer le W ?', 'L''alvéographe de Chopin, ou extensimètre : il déforme la pâte par pression d''air pour mesurer ténacité, extensibilité, élasticité et force.', 'Manuel Niveau I, p. 15 et lexique', @d_facile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L''alvéographe de Chopin', 1),
    (@q, 20, 'Le réfractomètre', 0),
    (@q, 30, 'Le pénétromètre', 0),
    (@q, 40, 'Le densimètre', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'L''indice W est imprimé sur le sac de farine.', 'Le manuel le dit clairement : le W ne figure PAS sur les sacs. Il faut se référer à la fiche technique du meunier — ou, chez 5 Stagioni, au code couleur du sac.', 'Manuel Niveau I, p. 12 et 15', @d_normal, 0, 30);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle force de farine correspond aux pizzas napolitaines ?', 'W 250-310 pour la napolitaine. W 200-250 vise les empâtements directs à levage court, W 330-390 les levages longs et les indirects, W 400-430 les Manitoba de renfort.', 'Manuel Niveau I, p. 15', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'W 250 – 310', 1),
    (@q, 20, 'W 200 – 250', 0),
    (@q, 30, 'W 330 – 390', 0),
    (@q, 40, 'W 400 – 430', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quoi servent les farines dites « Manitoba » (W 400-430) ?', 'Ce sont des farines de force : elles ne s''emploient pas seules mais corrigent une farine trop faible. Les biscuits et crackers relèvent au contraire des W 120-150.', 'Manuel Niveau I, p. 15', @d_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'À renforcer des farines plus faibles', 1),
    (@q, 20, 'À faire des biscuits et crackers', 0),
    (@q, 30, 'À la pizza napolitaine', 0),
    (@q, 40, 'Aux empâtements directs à levage court', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans l''alvéogramme, que mesure le « P » ?', 'P = pression, donc ténacité et fermeté. G est le gonflement (air insufflé), L la largeur (extensibilité), W le travail. Le rapport P/L traduit l''équilibre entre ténacité et extensibilité.', 'Manuel Niveau I, p. 16', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La ténacité et la résistance à la déformation', 1),
    (@q, 20, 'L''extensibilité de la pâte', 0),
    (@q, 30, 'La quantité d''air insufflée', 0),
    (@q, 40, 'Le travail total de déformation', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Plus une farine est riche en protéines, plus son W est élevé.', 'La qualité de la farine dépend de la qualité des protéines : plus la farine en est riche, plus la maille glutamique est forte et plus le W monte.', 'Manuel Niveau I, p. 10', @d_difficile, 1, 70);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Chez 5 Stagioni, associe chaque couleur de sac à sa force :', 'Le W ne figurant pas sur les sacs, le meunier le code par la couleur — d''où l''intérêt de connaître la correspondance quand on réceptionne la marchandise.', 'Manuel Niveau I, p. 12', @d_difficile, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Bleu clair', 'W200', 1),
    (@q, 20, 'Vert', 'W250', 1),
    (@q, 30, 'Bleu foncé', 'W330', 1),
    (@q, 40, 'Rouge', 'W390', 1),
    (@q, 50, 'Marron', 'W420', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque plage de W à son usage :', 'La règle tient en une phrase : plus la fermentation est longue, plus il faut de force.', 'Manuel Niveau I, p. 15', @d_normal, NULL, 90);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'W 120 – 150', 'Biscuits & crackers', 1),
    (@q, 20, 'W 250 – 310', 'Pizzas napolitaines', 1),
    (@q, 30, 'W 330 – 390', 'Levages longs & indirects', 1),
    (@q, 40, 'W 400 – 430', 'Farines de renfort (Manitoba)', 1);

/* -- La levure — 9 questions (2 F / 3 N / 4 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La levure';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La levure', 'yeast', 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle variété de levure utilise-t-on en panification ?', 'Saccharomyces cerevisiae — la « levure de bière » ou « levure de boulanger ». Elle se nourrit de sucres et les transforme en dioxyde de carbone et en alcool.', 'Manuel Niveau I, p. 17 et lexique', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Saccharomyces cerevisiae', 1),
    (@q, 20, 'Candida albicans', 0),
    (@q, 30, 'Aspergillus oryzae', 0),
    (@q, 40, 'Lactobacillus sanfranciscensis', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment se nomme la transformation des sucres en CO₂ et en alcool ?', 'C''est la fermentation alcoolique. Le pointage est la phase de repos qui suit le pétrissage, le frasage le premier mélange des ingrédients.', 'Manuel Niveau I, p. 17', @d_facile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La fermentation alcoolique', 1),
    (@q, 20, 'La panification', 0),
    (@q, 30, 'Le pointage', 0),
    (@q, 40, 'Le frasage', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quelle température l''eau détruit-elle la levure ?', 'Au-delà de 50 °C elle est détruite ; au-delà de 40 °C seulement affaiblie ; en eau froide, simplement ralentie. Pour réhydrater une levure sèche active, on vise 38 °C sans jamais dépasser 50 °C.', 'Manuel Niveau I, p. 17 et 19', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Au-delà de 50 °C', 1),
    (@q, 20, 'Au-delà de 40 °C', 0),
    (@q, 30, 'Au-delà de 38 °C', 0),
    (@q, 40, 'Au-delà de 60 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle dose maximale de levure sèche INSTANTANÉE admet-on par kilo de farine ?', '1 à 2 g pour l''instantanée, contre 2 à 4 g pour la fraîche comme pour la sèche active : l''instantanée est deux fois plus concentrée.', 'Manuel Niveau I, p. 19', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '1 à 2 g', 1),
    (@q, 20, '2 à 4 g', 0),
    (@q, 30, '3 à 5 g', 0),
    (@q, 40, '0,5 à 1 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Entre quelles températures la levure fraîche a-t-elle son action optimale ?', 'La levure fraîche agit au mieux pour une pâte entre 21 et 27 °C selon la saison.', 'Manuel Niveau I, p. 19', @d_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '21 à 27 °C', 1),
    (@q, 20, '10 à 16 °C', 0),
    (@q, 30, '30 à 36 °C', 0),
    (@q, 40, '4 à 10 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de cellules contient 1 g de levure fraîche ?', '1 g de levure fraîche = 10 milliards de cellules. La cellule se reproduit par germination en une heure environ.', 'Manuel Niveau I, p. 18', @d_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '10 milliards', 1),
    (@q, 20, '10 millions', 0),
    (@q, 30, '1 milliard', 0),
    (@q, 40, '100 milliards', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Une dose de levure excessive donne une pâte peu savoureuse qui rassit vite.', 'Une dose trop élevée ne permet pas de respecter les étapes de la panification : la pâte manque de goût et rassit très rapidement.', 'Manuel Niveau I, p. 18', @d_normal, 1, 70);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La levure ne peut vivre qu''en présence d''air.', 'Elle vit avec ou sans air. En aérobie elle respire et se reproduit ; en anaérobie elle puise son énergie dans la fermentation des sucres qu''elle transforme en alcool.', 'Manuel Niveau I, p. 18', @d_difficile, 0, 80);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque température de l''eau à son effet sur la levure :', 'C''est pourquoi on réhydrate à 38 °C : assez chaud pour l''activer, assez loin des 50 °C pour ne pas la tuer.', 'Manuel Niveau I, p. 19', @d_difficile, NULL, 90);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Eau froide', 'Action ralentie', 1),
    (@q, 20, 'Eau tiède (> 40 °C)', 'Levure affaiblie', 1),
    (@q, 30, 'Eau chaude (> 50 °C)', 'Levure détruite', 1);

/* -- L'eau & l'hydratation — 8 questions (1 F / 3 N / 4 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L''eau & l''hydratation';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'L''eau & l''hydratation', 'droplet', 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment se nomme l''eau servant au pétrissage de la pâte ?', 'L''eau de coulage hydrate la farine, dissout le sel et la levure et permet au gluten de former son réseau. L''eau de bassinage, elle, s''ajoute en FIN de pétrissage pour corriger la texture.', 'Manuel Niveau I, p. 20 et 25', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L''eau de coulage', 1),
    (@q, 20, 'L''eau de bassinage', 0),
    (@q, 30, 'L''eau de trempe', 0),
    (@q, 40, 'L''eau de mouillage', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est le taux MINIMUM d''hydratation en empâtement direct ?', 'De 54 % à 60 % en direct, selon la force de la farine. Les 60 % correspondent au haut de la fourchette (W420), pas au minimum.', 'Manuel Niveau I, p. 21 et 25', @d_difficile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '54 %', 1),
    (@q, 20, '50 %', 0),
    (@q, 30, '57 %', 0),
    (@q, 40, '60 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle dureté d''eau est idéale pour la pâte ?', 'Entre 15 et 30 degrés, l''eau est idéale. Trop douce, la pâte colle et des bulles apparaissent à la cuisson ; trop dure, la pâte est dure et lève mal.', 'Manuel Niveau I, p. 20', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Moyennement dure (15 à 30 °F)', 1),
    (@q, 20, 'Très douce (0 à 7 °F)', 0),
    (@q, 30, 'Dure (30 à 40 °F)', 0),
    (@q, 40, 'Très dure (+ 40 °F)', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que faire d''une eau trop DURE pour l''empâtement ?', 'Eau dure : adoucisseur. C''est l''eau DOUCE que l''on corrige en ajoutant un peu de sel dans la pâte.', 'Manuel Niveau I, p. 20', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Utiliser un adoucisseur', 1),
    (@q, 20, 'Ajouter un peu de sel', 0),
    (@q, 30, 'Ajouter un peu de sucre', 0),
    (@q, 40, 'Augmenter la dose de levure', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quels sont les critères ORGANIQUES d''une eau d''empâtement ?', 'Les critères organiques portent sur l''aspect et le goût. Le calcium et le magnésium relèvent des critères CHIMIQUES — ce sont eux qui rendent l''eau calcaire ou séléniteuse.', 'Manuel Niveau I, p. 20', @d_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Incolore, limpide, inodore, sans goût', 1),
    (@q, 20, 'Riche en calcium et en magnésium', 0),
    (@q, 30, 'Légèrement acide et minéralisée', 0),
    (@q, 40, 'Filtrée et déminéralisée', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle hydratation le manuel associe-t-il à une farine W330 ?', 'W330 → 57 %, soit 570 g d''eau au kilo. W300 est à 56 %, W250 à 55 %, W390 à 59 % : un point d''écart à chaque cran.', 'Manuel Niveau I, p. 25 et 27', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '57 %', 1),
    (@q, 20, '56 %', 0),
    (@q, 30, '55 %', 0),
    (@q, 40, '59 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'L''eau d''empâtement doit être potable.', 'Critères organiques, chimiques et bactériologiques conseillés par l''Organisation mondiale de la santé.', 'Manuel Niveau I, p. 20', @d_normal, 1, 70);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque titre hydrométrique à sa qualification :', 'La dureté se mesure en degré français : un degré hydrométrique correspond à du carbonate de calcium dans 100 litres d''eau.', 'Manuel Niveau I, p. 20', @d_difficile, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, '0 à 7 °F', 'Eau très douce', 1),
    (@q, 20, '7 à 15 °F', 'Eau douce', 1),
    (@q, 30, '15 à 30 °F', 'Eau plutôt dure', 1),
    (@q, 40, '+ 40 °F', 'Eau très dure', 1);

/* -- La température de l'eau de coulage — 7 questions (0 F / 2 N / 5 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La température de l''eau de coulage';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La température de l''eau de coulage', 'thermometer', 70);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle température de base (TB) le manuel utilise-t-il ?', 'TB = 50 dans la formule de l''École Pizza. D''autres méthodes de panification utilisent 54 ou 72 : ce n''est pas celle enseignée ici.', 'Manuel Niveau I, p. 21', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '50', 1),
    (@q, 20, '60', 0),
    (@q, 30, '54', 0),
    (@q, 40, '72', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle est la formule de la température de l''eau de coulage ?', 'On double la température de la farine, puis on retranche le résultat de 50. C''est le doublement qui distingue cette formule des autres.', 'Manuel Niveau I, p. 21', @d_difficile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '50 − (température de la farine × 2)', 1),
    (@q, 20, '50 − température de la farine', 0),
    (@q, 30, '(50 + température de la farine) ÷ 2', 0),
    (@q, 40, '50 + (température de la farine × 2)', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Farine à 17 °C : quelle température pour l''eau de coulage ?', '17 × 2 = 34, puis 50 − 34 = 16 °C. C''est le cas type du printemps et de l''automne, pour une pâte finale à 22-25 °C.', 'Manuel Niveau I, p. 21', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '16 °C', 1),
    (@q, 20, '33 °C', 0),
    (@q, 30, '20 °C', 0),
    (@q, 40, '26 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Farine à 10 °C (hiver) : quelle température pour l''eau de coulage ?', '10 × 2 = 20, puis 50 − 20 = 30 °C. La pâte finale se situe alors entre 22 et 27 °C.', 'Manuel Niveau I, p. 21', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '30 °C', 1),
    (@q, 20, '40 °C', 0),
    (@q, 30, '20 °C', 0),
    (@q, 40, '25 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En été, une farine à 28 °C donne un résultat de −6 °C. Que conseille le manuel ?', 'Le calcul donne une eau impossible : il faut anticiper en refroidissant la farine la veille pour minimiser les risques.', 'Manuel Niveau I, p. 21', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Mettre tout ou partie de la farine au frais la veille', 1),
    (@q, 20, 'Utiliser de la glace pilée à la place de l''eau', 0),
    (@q, 30, 'Réduire de moitié la dose de levure', 0),
    (@q, 40, 'Pétrir deux fois moins longtemps', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque saison à sa température d''eau de coulage :', 'Chaque fois : température de la farine × 2, retranchée de 50. Plus la farine est chaude, plus l''eau doit être froide pour compenser.', 'Manuel Niveau I, p. 21', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Été (farine 24 °C)', '2 °C', 1),
    (@q, 20, 'Printemps/automne (farine 17 °C)', '16 °C', 1),
    (@q, 30, 'Hiver (farine 10 °C)', '30 °C', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La température de base sert à obtenir une température de pâte régulière en fin de pétrissage.', 'C''est un gage de régularité dans le déroulement de l''activité fermentaire et du travail de la pâte.', 'Manuel Niveau I, p. 21', @d_normal, 1, 70);

/* -- Le sel — 7 questions (2 F / 2 N / 3 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le sel';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Le sel', 'salt', 80);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle est la dose usuelle de sel par kilo de farine ?', '17 à 22 g au kilo. Les 2 à 4 g sont la dose de LEVURE fraîche : c''est la confusion à ne pas faire.', 'Manuel Niveau I, p. 22', @d_difficile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '17 à 22 g', 1),
    (@q, 20, '10 à 15 g', 0),
    (@q, 30, '25 à 30 g', 0),
    (@q, 40, '2 à 4 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est l''effet du sel sur la fermentation ?', 'Le sel brûle les cellules de levure et diminue le développement de l''anhydride carbonique : il freine et régularise la fermentation.', 'Manuel Niveau I, p. 22', @d_facile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Il la freine et la régularise', 1),
    (@q, 20, 'Il l''accélère', 0),
    (@q, 30, 'Il n''a aucun effet', 0),
    (@q, 40, 'Il la stoppe complètement', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'D''où provient le sel GEMME ?', 'Le sel gemme vient de dépôts géologiques exploités en mines ou carrières ; le sel marin, lui, est recueilli par évaporation dans les marais salants.', 'Manuel Niveau I, p. 22', @d_facile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Des mines et carrières', 1),
    (@q, 20, 'Des marais salants', 0),
    (@q, 30, 'De l''évaporation de l''eau de mer', 0),
    (@q, 40, 'Des sources thermales', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que signifie « le sel est hygroscopique » ?', 'Hygroscopique = absorbe l''humidité de l''AIR. La dessiccation, elle, absorbe l''humidité d''un CORPS — deux termes du lexique qu''on inverse souvent.', 'Manuel Niveau I, lexique p. 43-44', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Il absorbe l''humidité de l''air', 1),
    (@q, 20, 'Il absorbe l''humidité d''un corps', 0),
    (@q, 30, 'Il repousse l''eau', 0),
    (@q, 40, 'Il se dissout instantanément', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le sel renforce la maille glutamique.', 'En eau salée, la gliadine est moins soluble et il se forme une plus grande quantité de gluten, aux fibres plus courtes liées par attraction électrostatique.', 'Manuel Niveau I, p. 22', @d_normal, 1, 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le sel accélère l''oxydation de la pâte.', 'Il la RETARDE : la pâte reste blanche grâce à ses propriétés antioxydantes.', 'Manuel Niveau I, p. 22', @d_difficile, 0, 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque propriété du sel à son effet :', 'Le sel n''est pas qu''un assaisonnement : il agit sur la tenue, la conservation et la cuisson.', 'Manuel Niveau I, p. 22', @d_normal, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Antiseptique', 'Brûle les micro-organismes', 1),
    (@q, 20, 'Hygroscopique', 'Permet d''hydrater davantage', 1),
    (@q, 30, 'Sur la croûte', 'Coloration et croustillant', 1);

/* -- L'huile d'olive — 6 questions (1 F / 3 N / 2 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L''huile d''olive';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'L''huile d''olive', 'oil', 90);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est le rôle principal de l''huile dans un empâtement direct ?', 'L''huile fige le pâton durant sa maturation en chambre froide et le maintient rond pendant 1 à 5 jours. Elle lubrifie aussi la pâte et lui donne souplesse et élasticité.', 'Manuel Niveau I, p. 23', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Figer le pâton et éviter qu''il ne s''affaisse', 1),
    (@q, 20, 'Accélérer la fermentation', 0),
    (@q, 30, 'Remplacer une partie de l''eau', 0),
    (@q, 40, 'Blanchir la mie', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La pizza napolitaine reconnue par l''UNESCO contient de l''huile d''olive.', 'Elle n''en contient pas : la pâte napolitaine est faite pour être utilisée très rapidement, sans longue maturation — donc sans huile pour tenir le pâton.', 'Manuel Niveau I, p. 23', @d_normal, 0, 20);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est le seuil d''acidité d''une huile d''olive EXTRA VIERGE ?', 'Extra vierge : moins de 0,8 %. La vierge monte à 2 % maximum, et le premier prix dépasse 3,3 %.', 'Manuel Niveau I, p. 24', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Inférieure à 0,8 %', 1),
    (@q, 20, 'Maximum 2 %', 0),
    (@q, 30, 'Supérieure à 3,3 %', 0),
    (@q, 40, 'Inférieure à 1,5 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel rang l''huile occupe-t-elle parmi les ingrédients d''une pâte à pizza ?', 'Le manuel la présente comme le cinquième élément — et précise qu''elle n''est pas indispensable, la napolitaine s''en passant.', 'Manuel Niveau I, p. 23', @d_facile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le 5ᵉ, et elle n''est pas indispensable', 1),
    (@q, 20, 'Le 2ᵉ, elle est indispensable', 0),
    (@q, 30, 'Le 3ᵉ, elle remplace le sel', 0),
    (@q, 40, 'Le 1ᵉʳ, avant la farine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de temps dure la maturation d''un pâton en chambre froide selon le manuel ?', 'De 1 à 5 jours : c''est précisément ce que l''huile permet de tenir en maintenant les pâtons ronds.', 'Manuel Niveau I, p. 23', @d_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '1 à 5 jours', 1),
    (@q, 20, '12 à 24 heures', 0),
    (@q, 30, '5 à 10 jours', 0),
    (@q, 40, '1 à 2 heures', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque huile à son acidité :', 'L''acidité va de pair avec les défauts organoleptiques : nuls pour l''extra vierge, 3,5/10 pour la vierge, 6/10 pour le premier prix.', 'Manuel Niveau I, p. 24', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Extra vierge', '< 0,8 %', 1),
    (@q, 20, 'Vierge', '≤ 2 %', 1),
    (@q, 30, '1er prix', '> 3,3 %', 1);

/* -- Substitutions & adjonctions — 7 questions (1 F / 3 N / 3 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Substitutions & adjonctions';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Substitutions & adjonctions', 'shuffle', 100);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu''est-ce qu''une SUBSTITUTION ?', 'La substitution remplace une part du poids de farine initiale. L''ADJONCTION, elle, ajoute un produit mélangé pendant le pétrissage.', 'Manuel Niveau I, p. 25-26', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Remplacer une partie de la farine de blé par une autre farine', 1),
    (@q, 20, 'Ajouter un produit à la pâte pendant le pétrissage', 0),
    (@q, 30, 'Remplacer l''eau par du lait', 0),
    (@q, 40, 'Diminuer la dose de levure', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment nomme-t-on l''eau ajoutée en fin de pétrissage pour corriger la texture ?', 'L''eau de bassinage se rajoute en fin de pétrissage, notamment quand une farine de substitution a asséché la pâte.', 'Manuel Niveau I, p. 25', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L''eau de bassinage', 1),
    (@q, 20, 'L''eau de coulage', 0),
    (@q, 30, 'L''eau de frasage', 0),
    (@q, 40, 'L''eau de rabat', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour 10 % de farine de SOJA, quel complément d''eau par unité de calcul ?', '30 g pour le soja et la semi-complète, mais 40 g pour la farine complète : c''est cette distinction que la question teste.', 'Manuel Niveau I, p. 25', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '30 g', 1),
    (@q, 20, '40 g', 0),
    (@q, 30, '20 g', 0),
    (@q, 40, '50 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel pourcentage de pâte fermentée le manuel recommande-t-il en adjonction ?', '10 à 30 %, à la 8ᵉ minute. Les 3-6 % sont les graines torréfiées, les 1-2 % le charbon végétal, les 4 % le Naturkraft.', 'Manuel Niveau I, p. 26', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '10 à 30 %', 1),
    (@q, 20, '3 à 6 %', 0),
    (@q, 30, '1 à 2 %', 0),
    (@q, 40, '4 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quel moment incorpore-t-on les graines torréfiées ?', 'Avant le sel (10 mn). La pâte fermentée entre à la 8ᵉ minute, le son après l''huile (12 mn), le Naturkraft et le charbon végétal avec la farine.', 'Manuel Niveau I, p. 26', @d_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Avant le sel, à la 10ᵉ minute', 1),
    (@q, 20, 'À la 8ᵉ minute', 0),
    (@q, 30, 'Avec la farine', 0),
    (@q, 40, 'Après l''huile, à la 12ᵉ minute', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le pourcentage d''une adjonction se calcule sur le poids TOTAL de la pâte.', 'Non : il porte toujours sur la quantité de FARINE. Calculer sur le poids total donnerait des doses nettement plus fortes, l''eau représentant plus de la moitié du poids de farine.', 'Manuel Niveau I, p. 26', @d_difficile, 0, 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque adjonction à son dosage :', 'Les ordres de grandeur sont très différents : la pâte fermentée se compte en dizaines de pour cent, le son en unités.', 'Manuel Niveau I, p. 26', @d_difficile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Graines torréfiées', '3 à 6 %', 1),
    (@q, 20, 'Pâte fermentée', '10 à 30 %', 1),
    (@q, 30, 'Naturkraft', '4 %', 1),
    (@q, 40, 'Son', '1 %', 1);

/* -- Le protocole d'empâtement direct — 9 questions (1 F / 4 N / 4 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le protocole d''empâtement direct';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Le protocole d''empâtement direct', 'clock', 110);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que met-on dans le pétrin lors de la 1ʳᵉ phase ?', 'Farine et levure une minute : c''est le temps d''oxygénation. L''eau vient ensuite, le sel et l''huile en dernier.', 'Manuel Niveau I, p. 28', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La farine et la levure, 1 minute', 1),
    (@q, 20, 'L''eau et le sel', 0),
    (@q, 30, 'La farine et l''huile', 0),
    (@q, 40, 'L''eau seule', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de temps pétrit-on après avoir versé l''eau ?', '12 minutes en petite vitesse. Les 2-3 minutes correspondent à la phase finale, après le sel et l''huile.', 'Manuel Niveau I, p. 28', @d_difficile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '12 minutes en petite vitesse', 1),
    (@q, 20, '8 minutes en grande vitesse', 0),
    (@q, 30, '2 à 3 minutes', 0),
    (@q, 40, '20 minutes en petite vitesse', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans quel ordre le sel et l''huile entrent-ils ?', 'Le sel se verse petit à petit, pétrin en marche ; l''huile d''olive arrive au bout d''une minute. On pétrit ensuite 2 à 3 minutes.', 'Manuel Niveau I, p. 28', @d_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le sel petit à petit, puis l''huile 1 minute après', 1),
    (@q, 20, 'L''huile d''abord, puis le sel', 0),
    (@q, 30, 'Les deux en même temps', 0),
    (@q, 40, 'Le sel avec la farine, l''huile avec l''eau', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu''est-ce que le POINTAGE ?', 'Le pointage est la première fermentation, en masse et à température ambiante, juste après le pétrissage. Le façonnage met en forme, le frasage mélange.', 'Manuel Niveau I, p. 28 et lexique', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La première phase de fermentation, en masse', 1),
    (@q, 20, 'Le repos des pâtons après boulage', 0),
    (@q, 30, 'La mise en forme du disque', 0),
    (@q, 40, 'Le premier mélange des ingrédients', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel temps de pointage pour un été chaud et humide ?', '10 à 15 minutes en été, 15 à 30 au printemps et en automne, 20 à 40 en hiver : plus il fait chaud, plus le pointage est court.', 'Manuel Niveau I, p. 28', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '10 à 15 minutes', 1),
    (@q, 20, '15 à 30 minutes', 0),
    (@q, 30, '20 à 40 minutes', 0),
    (@q, 40, '5 minutes', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quelle température bloque-t-on les bacs de pâtons ?', '3 à 4 °C, dans des bacs Gilac 60 × 40 après division, pesée et boulage.', 'Manuel Niveau I, p. 28', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '3 à 4 °C', 1),
    (@q, 20, '0 à 1 °C', 0),
    (@q, 30, '6 à 8 °C', 0),
    (@q, 40, '10 à 12 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de pâtons de 280 g obtient-on avec 1 unité de calcul ?', 'Une unité de calcul — 1 kg de farine et ses ingrédients — donne environ 6 pâtons de 280 g.', 'Manuel Niveau I, p. 27', @d_facile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'environ 6', 1),
    (@q, 20, 'environ 3', 0),
    (@q, 30, 'environ 10', 0),
    (@q, 40, 'environ 12', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque saison à son temps de pointage :', 'Plus il fait chaud, plus la fermentation est vive : le pointage se raccourcit d''autant.', 'Manuel Niveau I, p. 28', @d_difficile, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Été chaud et humide', '10 à 15 mn', 1),
    (@q, 20, 'Printemps / automne', '15 à 30 mn', 1),
    (@q, 30, 'Hiver', '20 à 40 mn', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Il faut garder un verre d''eau de côté au moment de verser l''eau de coulage.', 'On garde toujours un peu d''eau pour le bassinage, afin de rattraper la texture en fin de pétrissage.', 'Manuel Niveau I, p. 28', @d_normal, 1, 90);

/* -- Matières premières & quantités — 8 questions (1 F / 4 N / 3 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Matières premières & quantités';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Matières premières & quantités', 'utensils', 120);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel poids de pâton pour une pizza de Ø 33 cm ?', '280-300 g pour un Ø 33. Le Ø 26 demande 200-220 g, le Ø 29 240-260 g, et la plaque 40 × 60 monte à 1100-1300 g.', 'Manuel Niveau I, p. 30', @d_difficile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '280 à 300 g', 1),
    (@q, 20, '200 à 220 g', 0),
    (@q, 30, '240 à 260 g', 0),
    (@q, 40, '1100 à 1300 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle quantité de sauce tomate pour une pizza de Ø 26 cm ?', '80 g pour un Ø 26, 90 g pour un Ø 29, 100 g pour un Ø 33. Les 50 g correspondent à la crème, pas à la tomate.', 'Manuel Niveau I, p. 30', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '80 g', 1),
    (@q, 20, '50 g', 0),
    (@q, 30, '100 g', 0),
    (@q, 40, '120 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans la recette de sauce tomate, quelle quantité de sel pour 10 kg de tomate ?', '120 g de sel, autant d''huile d''olive et autant de basilic frais. L''origan (8 g) et le sucre (40-80 g) restent facultatifs.', 'Manuel Niveau I, p. 33', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '120 g', 1),
    (@q, 20, '80 g', 0),
    (@q, 30, '200 g', 0),
    (@q, 40, '40 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de temps se conserve la sauce tomate préparée ?', '3 jours au frais. La bolognaise, elle, se garde 48 heures maximum entre 2 et 4 °C.', 'Manuel Niveau I, p. 32-33', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '3 jours', 1),
    (@q, 20, '24 heures', 0),
    (@q, 30, '1 semaine', 0),
    (@q, 40, '48 heures', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle crème le manuel conseille-t-il d''utiliser en priorité ?', 'Liquide ou de liaison : elles épaississent à la cuisson avec une quantité moindre que l''épaisse, et se dosent au biberon.', 'Manuel Niveau I, p. 29', @d_facile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La liquide ou celle de liaison', 1),
    (@q, 20, 'L''épaisse', 0),
    (@q, 30, 'La crème allégée', 0),
    (@q, 40, 'La crème montée', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La crème se dépose du bord de la corniche vers le centre, en spirale.', 'À l''inverse de la sauce tomate. Elle se met après tous les ingrédients, juste avant d''enfourner.', 'Manuel Niveau I, p. 29', @d_difficile, 1, 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque format de pizza à son poids de pâton :', 'Le poids suit la surface, pas le diamètre : une plaque 40 × 60 demande cinq fois le pâton d''un Ø 26.', 'Manuel Niveau I, p. 30', @d_normal, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Ø 26 cm', '200 à 220 g', 1),
    (@q, 20, 'Ø 29 cm', '240 à 260 g', 1),
    (@q, 30, 'Ø 33 cm', '280 à 300 g', 1),
    (@q, 40, 'Plaque 40 × 60', '1100 à 1300 g', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de temps les pommes de terre déjà pelées se gardent-elles au frais ?', '1 à 2 jours seulement. C''est pourquoi on les cuit avec la peau et on ne pèle que la quantité nécessaire avant le service.', 'Manuel Niveau I, p. 34', @d_normal, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '1 à 2 jours', 1),
    (@q, 20, '3 à 4 jours', 0),
    (@q, 30, '1 semaine', 0),
    (@q, 40, 'quelques heures', 0);

/* -- La cuisson & les fours — 10 questions (3 F / 2 N / 5 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La cuisson & les fours';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La cuisson & les fours', 'flame', 130);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Entre quelles températures se situe la cuisson d''une pizza ?', 'De 320 °C pour la plaque à 450 °C pour la napolitaine — bien au-delà d''un four domestique.', 'Manuel Niveau I, p. 38', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '320 à 450 °C', 1),
    (@q, 20, '180 à 250 °C', 0),
    (@q, 30, '250 à 300 °C', 0),
    (@q, 40, '500 à 600 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle température pour une pizza NAPOLITAINE ?', '400-450 °C. La classique cuit à 320-360 °C, la contemporaine à 360-380 °C, la plaque à 320 °C : quatre plages voisines à ne pas confondre.', 'Manuel Niveau I, p. 38', @d_difficile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '400 à 450 °C', 1),
    (@q, 20, '320 à 360 °C', 0),
    (@q, 30, '360 à 380 °C', 0),
    (@q, 40, '320 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment se nomme la chaleur transmise par contact direct avec la sole ?', 'Conduction = contact direct avec la sole. La convection passe par l''air chaud, le rayonnement par la voûte.', 'Manuel Niveau I, p. 38 et lexique', @d_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La conduction', 1),
    (@q, 20, 'La convection', 0),
    (@q, 30, 'Le rayonnement', 0),
    (@q, 40, 'La diffusion', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment se nomme la partie SUPÉRIEURE intérieure du four ?', 'La voûte est en haut, la sole en bas — c''est sur la sole qu''on dépose la pizza. La corniche, elle, est le bord de la pizza.', 'Manuel Niveau I, lexique p. 45-46', @d_facile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La voûte', 1),
    (@q, 20, 'La sole', 0),
    (@q, 30, 'La corniche', 0),
    (@q, 40, 'La chambre', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de fois par an un four à bois doit-il être ramoné ?', 'Deux ramonages par an, facture à l''appui pour l''assurance. C''est l''une des contraintes du four à bois, avec la sécurité des locaux et le conduit isolé réglementé.', 'Manuel Niveau I, p. 39', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2 fois', 1),
    (@q, 20, '1 fois', 0),
    (@q, 30, '4 fois', 0),
    (@q, 40, '3 fois', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Four électrique à 360 °C de voûte et 310 °C de sole : quel temps de cuisson ?', '3 min 30. À 340/300 il faut 4 minutes, à 320/290 cinq minutes : plus la température monte, plus la cuisson raccourcit.', 'Manuel Niveau I, p. 41', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '3 min 30', 1),
    (@q, 20, '4 minutes', 0),
    (@q, 30, '5 minutes', 0),
    (@q, 40, '2 minutes', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est l''avantage d''un four à sole ROTATIVE ?', 'Plus besoin de faire la rotation des pizzas dans le four, et un gain de place puisque le foyer passe sur le côté de la sole.', 'Manuel Niveau I, p. 39-41', @d_facile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Il évite d''avoir à tourner les pizzas', 1),
    (@q, 20, 'Il consomme moins d''électricité', 0),
    (@q, 30, 'Il cuit à plus basse température', 0),
    (@q, 40, 'Il ne nécessite aucun entretien', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Un four hybride permet d''utiliser le bois OU le gaz, au choix selon le service.', 'Non : les fours hybrides ne peuvent utiliser ces deux énergies que SIMULTANÉMENT, en gardant les caractéristiques de chacun.', 'Manuel Niveau I, p. 40', @d_difficile, 0, 80);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque type de pizza à sa température de cuisson :', 'Quatre plages voisines : c''est la napolitaine qui monte le plus haut, pour une cuisson très courte.', 'Manuel Niveau I, p. 38', @d_difficile, NULL, 90);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Classique', '320 à 360 °C', 1),
    (@q, 20, 'Contemporaine', '360 à 380 °C', 1),
    (@q, 30, 'Napolitaine', '400 à 450 °C', 1),
    (@q, 40, 'Plaque', '320 °C', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque mode de transmission de la chaleur à sa source :', 'Les trois agissent ensemble : c''est leur équilibre qui fait une cuisson réussie.', 'Manuel Niveau I, p. 38', @d_normal, NULL, 100);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Rayonnement', 'La voûte du four', 1),
    (@q, 20, 'Convection', 'L''air chaud de la chambre', 1),
    (@q, 30, 'Conduction', 'La sole, par contact', 1);

/* -- Les pétrins — 7 questions (1 F / 2 N / 4 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Les pétrins';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Les pétrins', 'refresh', 140);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle quantité de pâte un pétrin à SPIRALE permet-il de travailler ?', '10 à 60 kg pour la spirale, 10 à 80 kg pour l''axe oblique, 50 à 150 kg pour les bras plongeants.', 'Manuel Niveau I, p. 42', @d_difficile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '10 à 60 kg', 1),
    (@q, 20, '10 à 80 kg', 0),
    (@q, 30, '50 à 150 kg', 0),
    (@q, 40, '5 à 20 kg', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel pétrin est le plus RAPIDE ?', 'La spirale est la plus rapide : elle accélère la formation de la maille gluténique, mais échauffe davantage la pâte et impose des temps de pétrissage plus courts et plus précis.', 'Manuel Niveau I, p. 42', @d_facile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le pétrin à spirale', 1),
    (@q, 20, 'Le pétrin à axe oblique', 0),
    (@q, 30, 'Le pétrin à bras plongeants', 0),
    (@q, 40, 'Ils ont tous la même vitesse', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le pétrin à axe oblique est combien de fois plus lent que la spirale ?', 'Deux fois plus lent. Ses bras soulèvent la pâte et l''oxygènent davantage, ce qui développe une mie très aérée.', 'Manuel Niveau I, p. 42', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2 fois', 1),
    (@q, 20, '3 fois', 0),
    (@q, 30, '1,5 fois', 0),
    (@q, 40, '4 fois', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel pétrin reproduit au plus près les gestes du pizzaïolo ?', 'Les bras plongeants, conseillés pour les gros volumes. Le laminoir, lui, ne pétrit pas : il étale la pâte.', 'Manuel Niveau I, p. 42 et lexique', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le pétrin à bras plongeants', 1),
    (@q, 20, 'Le pétrin à spirale', 0),
    (@q, 30, 'Le pétrin à axe oblique', 0),
    (@q, 40, 'Le laminoir', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque pétrin à la quantité de pâte qu''il travaille :', 'Les bras plongeants sont réservés aux gros volumes ; la spirale, la plus rapide, plafonne plus bas.', 'Manuel Niveau I, p. 42', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'À spirale', '10 à 60 kg', 1),
    (@q, 20, 'À axe oblique', '10 à 80 kg', 1),
    (@q, 30, 'À bras plongeants', '50 à 150 kg', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Une tête relevable facilite la sortie de la pâte et le nettoyage du pétrin.', 'Elle permet aussi d''enlever la cuve pour l''entretien — mais elle est plus onéreuse que la tête fixe.', 'Manuel Niveau I, p. 42', @d_normal, 1, 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le pétrin à spirale donne une mie plus irrégulière que l''axe oblique.', 'C''est le contraire : la spirale donne un empâtement plus lisse avec une mie plus RÉGULIÈRE. C''est l''axe oblique qui produit une mie très aérée.', 'Manuel Niveau I, p. 42', @d_difficile, 0, 70);

/* -- Organisation & tenue professionnelle — 6 questions (3 F / 1 N / 2 D) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Organisation & tenue professionnelle';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Organisation & tenue professionnelle', 'clipboard-check', 150);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quelle température les pâtons doivent-ils être sortis avant le service ?', '15 à 18 °C : c''est ce qui donne la facilité d''étalage et une bonne levée à la cuisson. Les 3-4 °C sont la température de BLOCAGE des bacs, pas celle du service.', 'Manuel Niveau I, p. 37', @d_difficile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '15 à 18 °C', 1),
    (@q, 20, '3 à 4 °C', 0),
    (@q, 30, '22 à 24 °C', 0),
    (@q, 40, '10 à 12 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que signifie le sigle PEPS ?', 'Premier Entré Premier Sorti : la règle de rotation des stocks, à surveiller pour toute la mise en place.', 'Manuel Niveau I, p. 37', @d_facile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Premier Entré Premier Sorti', 1),
    (@q, 20, 'Préparation En Portions Simples', 0),
    (@q, 30, 'Plan d''Entretien du Poste de Service', 0),
    (@q, 40, 'Produit Emballé Prêt à Servir', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel bijou est toléré en cuisine ?', 'Pas de bijoux, hors alliance. Il est par ailleurs interdit de fumer dans les locaux.', 'Manuel Niveau I, p. 2', @d_facile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L''alliance', 1),
    (@q, 20, 'La montre', 0),
    (@q, 30, 'Les bagues', 0),
    (@q, 40, 'Les bracelets', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel élément ne fait PAS partie de la tenue professionnelle listée ?', 'La tenue se compose d''une veste blanche (ou tee-shirt/polo), d''un pantalon de cuisine, de chaussures de sécurité, d''un tablier et d''un torchon.', 'Manuel Niveau I, p. 2', @d_facile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La toque', 1),
    (@q, 20, 'Le tablier', 0),
    (@q, 30, 'Les chaussures de sécurité', 0),
    (@q, 40, 'Le torchon', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que désigne le FLEURAGE ?', 'Le fleurage favorise la glisse au moment de placer la pizza sur la pelle. Replier la pâte, c''est le RABAT ; l''étirer, c''est abaisser.', 'Manuel Niveau I, lexique p. 44', @d_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Déposer une fine couche de farine sur le plan de travail', 1),
    (@q, 20, 'Replier la pâte sur elle-même', 0),
    (@q, 30, 'Étirer la pâte en disque', 0),
    (@q, 40, 'Garnir la pizza', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu''est-ce que le FRASAGE ?', 'Le frasage mélange lentement et grossièrement farine, eau et levure. Le repos qui suit le pétrissage est le POINTAGE, la mise en boule le BOULAGE.', 'Manuel Niveau I, lexique p. 44', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La première étape du pétrissage : mélange lent et grossier', 1),
    (@q, 20, 'Le repos de la pâte après pétrissage', 0),
    (@q, 30, 'La mise en boule des pâtons', 0),
    (@q, 40, 'Le passage au laminoir', 0);

/* ---- Contrôle ----------------------------------------------------------------------- */
/* Décommentez pour vérifier l'import :
SELECT c.title AS chapitre, COUNT(q.id) AS questions
  FROM quest_chapter c LEFT JOIN quest_question q ON q.chapter_id = c.id
 WHERE c.organization_id = @org AND c.program_id = @prog
 GROUP BY c.id ORDER BY c.sort_order; */

/* 217_seed_quest_niv1pro.sql — DONNÉES (à jouer APRÈS 102_quest_questions.sql).

   Banque « Pizza Quest » pour la formation NIV1PRO, tirée du Manuel Technique Niveau I PRO
   (mise à jour du 14/01/2026). Jusqu’ici, un stagiaire inscrit en NIV1PRO ouvrait Pizza
   Quest sur un chemin VIDE : aucune formation n’avait de chapitre rattaché à ce code.

   13 chapitres, 112 questions — 90 QCM, 15 vrai/faux, 7 associations. Chaque réponse est
   vérifiable dans le manuel, à la page indiquée par la source. Les fourchettes du manuel
   sont reprises telles quelles (« 17 à 22 g », « 2 à 4 g ») plutôt qu’arrondies.

   LA DIFFICULTÉ TIENT AUX LEURRES, pas à l’énoncé :
     facile    les leurres viennent d’un autre domaine, avoir lu le chapitre suffit,
     normal    les leurres sont des valeurs réelles du métier mais d’un autre usage,
     difficile les leurres sont les valeurs VOISINES de la bonne, ou demandent un calcul.

   LA FORMATION EST DÉSIGNÉE PAR SON CODE, jamais par un identifiant écrit en dur : le même
   fichier vaut pour n’importe quel organisme, et une faute de frappe ne peut pas rattacher
   la banque à la mauvaise formation. L’apostrophe est la typographique « ’ », jamais deux
   quotes : certains clients SQL coupent un script sur une apostrophe doublée (voir le test
   quest-copie-niv1).

   REJOUABLE : chaque chapitre est supprimé par son titre puis réinséré, questions et options
   suivant par cascade. Une retouche faite à la main sur CES chapitres serait donc écrasée au
   prochain passage — les chapitres NIV1PRO créés à la main sous un AUTRE titre sont préservés.

   VÉRIFICATION, sans SQL : un stagiaire NIV1PRO ouvre Pizza Quest et voit 13 chapitres. Ou
   par l’API, GET /api/mon-espace/quest/<id NIV1PRO>/chapitres rend 13 chapitres. Ou une
   requête, qui doit rendre 112 :
     SELECT COUNT(*) FROM quest_question q JOIN quest_chapter c ON c.id = q.chapter_id
       JOIN training_program p ON p.id = c.program_id WHERE p.code = 'NIV1PRO'

   Son revert retire les chapitres NIV1PRO (et EUX SEULS) — cf. 217_revert_seed_quest_niv1pro.sql. */

/* ---- Cibles : la formation NIV1PRO et son organisme, par CODE ---------------------- */
SET @prog = (SELECT id FROM training_program WHERE code = 'NIV1PRO' LIMIT 1);
SET @org  = (SELECT organization_id FROM training_program WHERE id = @prog);

/* Difficultés reprises par SLUG, telles que créées par 102_seed_quest_questions.sql.
   Absentes, les questions prennent l’XP par défaut (difficulty_id NULL). */
SET @d_facile    = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'facile'    LIMIT 1);
SET @d_normal    = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'normal'    LIMIT 1);
SET @d_difficile = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'difficile' LIMIT 1);

/* Chapitre : L’histoire & le métier — 7 questions (5 QCM, 2 VF, 0 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L’histoire & le métier';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'L’histoire & le métier', 'book', 10);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'De quel pays la pizza est-elle originaire ?', 'La pizza est originaire d’Italie et est aujourd’hui populaire dans le monde entier.', 'Manuel Niveau I PRO, p. 4', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L’Italie', 1),
    (@q, 20, 'La Grèce', 0),
    (@q, 30, 'L’Espagne', 0),
    (@q, 40, 'La France', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans quelle ville la pizza est-elle devenue très populaire au XIXe siècle ?', 'La pizza est devenue très populaire à Naples au XIXe siècle, avant de se répandre dans le reste du pays et du monde.', 'Manuel Niveau I PRO, p. 4', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Naples', 1),
    (@q, 20, 'Rome', 0),
    (@q, 30, 'Milan', 0),
    (@q, 40, 'Venise', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quels deux ingrédients garnissent traditionnellement la pizza ?', 'La pizza est une pâte à pain garnie principalement de sauce tomate et de mozzarella, cuite au four.', 'Manuel Niveau I PRO, p. 4', @d_facile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Sauce tomate et mozzarella', 1),
    (@q, 20, 'Crème et jambon', 0),
    (@q, 30, 'Huile et ail', 0),
    (@q, 40, 'Origan et parmesan', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Dès l’Antiquité, les anciens Romains préparaient déjà une sorte de pain garni de légumes.', 'Oui — mais la pizza telle qu’on la connaît naît en Italie plus tard, quand les boulangers garnissent les pains de tomate, d’ail et d’huile d’olive.', 'Manuel Niveau I PRO, p. 4', @d_normal, 1, 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel bijou reste toléré avec la tenue professionnelle en cuisine ?', 'La règle est « pas de bijoux, hors alliance » — seule l’alliance lisse est tolérée, le reste se retire.', 'Manuel Niveau I PRO, p. 2', @d_facile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L’alliance', 1),
    (@q, 20, 'La montre', 0),
    (@q, 30, 'Les boucles d’oreilles', 0),
    (@q, 40, 'Aucun', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Lequel de ces éléments ne fait PAS partie de la tenue professionnelle décrite ?', 'La tenue se compose de la veste blanche (tee-shirt ou polo), du pantalon de cuisine, des chaussures de sécurité, du tablier et du torchon.', 'Manuel Niveau I PRO, p. 2', @d_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La casquette', 1),
    (@q, 20, 'Le tablier', 0),
    (@q, 30, 'Les chaussures de sécurité', 0),
    (@q, 40, 'Le torchon', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le pantalon en jean est strictement interdit en cuisine.', 'Le pantalon de cuisine est requis, mais le jean est toléré. La tenue reste l’image de l’entreprise — propre avant tout.', 'Manuel Niveau I PRO, p. 2', @d_facile, 0, 70);

/* Chapitre : Les céréales & le grain — 9 questions (7 QCM, 1 VF, 1 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Les céréales & le grain';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Les céréales & le grain', 'wheat', 20);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quelle famille botanique appartiennent les céréales ?', 'Les céréales sont de la famille des poacées, sauvages ou cultivées, qui produisent des grains comestibles moulus en farine.', 'Manuel Niveau I PRO, p. 5', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Les poacées (graminées)', 1),
    (@q, 20, 'Les solanacées', 0),
    (@q, 30, 'Les légumineuses', 0),
    (@q, 40, 'Les brassicacées', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Laquelle de ces céréales NE contient PAS de gluten ?', 'Sarrasin, maïs, riz, sorgho, quinoa, millet et teff sont sans gluten. Épeautre, seigle et orge en contiennent, comme le blé et le kamut.', 'Manuel Niveau I PRO, p. 5', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le sarrasin', 1),
    (@q, 20, 'L’épeautre', 0),
    (@q, 30, 'Le seigle', 0),
    (@q, 40, 'L’orge', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'De quelle céréale le kamut est-il présenté comme le cousin ?', 'Le manuel présente le kamut comme le cousin du blé dur. Il contient du gluten.', 'Manuel Niveau I PRO, p. 5', @d_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Du blé dur', 1),
    (@q, 20, 'Du seigle', 0),
    (@q, 30, 'De l’avoine', 0),
    (@q, 40, 'Du maïs', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le blé TENDRE est principalement utilisé pour…', 'Le blé tendre a un albumen moins riche en protéines, à texture douce — c’est la farine de panification. Le blé dur, vitreux, part en pâtes, semoule, boulgour et couscous.', 'Manuel Niveau I PRO, p. 6', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La panification (dont la pizza)', 1),
    (@q, 20, 'Les pâtes alimentaires', 0),
    (@q, 30, 'La semoule et le couscous', 0),
    (@q, 40, 'Le boulgour', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu’est-ce qui différencie principalement le blé tendre du blé dur ?', 'La différence principale réside dans la composition de leur albumen, et de là leur usage. Le blé dur est plus riche en protéines et plus ferme.', 'Manuel Niveau I PRO, p. 6', @d_normal, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La composition de leur albumen', 1),
    (@q, 20, 'Leur couleur', 0),
    (@q, 30, 'Leur taille', 0),
    (@q, 40, 'Leur odeur', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Après broyage, quelle granulométrie correspond au blé tendre ?', 'Le blé tendre donne les particules les plus fines (30 à 200 µm), le blé dur les grosses (150 à 500 µm). Le µm vaut un millième de millimètre.', 'Manuel Niveau I PRO, p. 6', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '30 à 200 µm', 1),
    (@q, 20, '150 à 500 µm', 0),
    (@q, 30, '500 à 800 µm', 0),
    (@q, 40, '5 à 20 µm', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans le caryopse (grain), quelle part représente l’albumen (amande) ?', 'L’albumen pèse 82 à 85 % du grain, les enveloppes (son) 13 à 15 %, le germe environ 3 %. Le 64-80 % est la part d’amidon dans la farine, pas dans le grain.', 'Manuel Niveau I PRO, p. 7', @d_difficile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '82 à 85 %', 1),
    (@q, 20, '13 à 15 %', 0),
    (@q, 30, 'environ 3 %', 0),
    (@q, 40, '64 à 80 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Dans le grain, le germe (embryon) représente à lui seul près d’un tiers du poids.', 'Le germe ne pèse qu’environ 3 % du grain. L’essentiel (82 à 85 %) est l’amande, d’où l’on tire la farine blanche.', 'Manuel Niveau I PRO, p. 7', @d_normal, 0, 80);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque partie du grain à sa proportion :', 'L’essentiel du grain est l’amande — c’est elle qui donne la farine blanche. Les enveloppes partent au son, le germe est infime mais riche.', 'Manuel Niveau I PRO, p. 7', @d_normal, NULL, 90);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Albumen (amande)', '82 à 85 %', 1),
    (@q, 20, 'Enveloppes (son)', '13 à 15 %', 1),
    (@q, 30, 'Germe (embryon)', 'environ 3 %', 1);

/* Chapitre : Le gluten — 7 questions (5 QCM, 2 VF, 0 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le gluten';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Le gluten', 'refresh', 30);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Le gluten est essentiellement un mélange de quoi ?', 'Le gluten est un mélange de protéines qui, avec l’eau et de l’énergie, forme des ponts disulfures et crée le réseau de gluten.', 'Manuel Niveau I PRO, p. 8', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'De protéines', 1),
    (@q, 20, 'De glucides', 0),
    (@q, 30, 'De lipides', 0),
    (@q, 40, 'De minéraux', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelles sont les deux protéines qui forment le réseau de gluten ?', 'Gliadine et gluténine se fusionnent au pétrissage et créent le réseau élastique. Globuline et albumine sont les protéines SOLUBLES, elles ne forment pas la maille.', 'Manuel Niveau I PRO, p. 8', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La gliadine et la gluténine', 1),
    (@q, 20, 'La globuline et l’albumine', 0),
    (@q, 30, 'L’amidon et la cellulose', 0),
    (@q, 40, 'La caséine et la lactoglobuline', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle part des protéines du blé le gluten représente-t-il ?', 'Le gluten constitue environ 80 % des protéines du blé. Le 15 % renvoie aux protéines solubles (globuline, albumine).', 'Manuel Niveau I PRO, p. 8', @d_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'environ 80 %', 1),
    (@q, 20, 'environ 15 %', 0),
    (@q, 30, 'environ 50 %', 0),
    (@q, 40, 'environ 95 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que retient le réseau de gluten pendant la fermentation ?', 'C’est le filet qui emprisonne le CO₂ issu de la dégradation des sucres — sans lui, la pâte ne lèverait pas et la mie n’aurait pas d’alvéoles.', 'Manuel Niveau I PRO, p. 8', @d_facile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le gaz carbonique produit par les levures', 1),
    (@q, 20, 'Le sel dissous dans l’eau', 0),
    (@q, 30, 'L’huile de la pâte', 0),
    (@q, 40, 'L’oxygène de l’air', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Sans gluten, une pâte est plus cassante et friable, et elle ne se lie pas.', 'Exact. On appelle « panifiables » les farines qui, comme le blé, contiennent assez de gluten pour que la pâte lève.', 'Manuel Niveau I PRO, p. 8', @d_facile, 1, 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Pétrir à vitesse rapide développe DAVANTAGE le réseau de gluten.', 'Oui — le manuel le dit : à vitesse rapide, le réseau de gluten sera plus important.', 'Manuel Niveau I PRO, p. 8', @d_normal, 1, 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Lequel de ces rôles n’est PAS celui du réseau de gluten ?', 'Le gluten retient le gaz, forme les alvéoles, prend du volume, donne de l’élasticité et retient l’eau. La coloration de la croûte relève du sel et de la cuisson.', 'Manuel Niveau I PRO, p. 8', @d_difficile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Colorer la croûte à la cuisson', 1),
    (@q, 20, 'Retenir le gaz carbonique', 0),
    (@q, 30, 'Former de fines alvéoles', 0),
    (@q, 40, 'Donner de l’élasticité à la pâte', 0);

/* Chapitre : La mouture & la farine — 8 questions (6 QCM, 1 VF, 1 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La mouture & la farine';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La mouture & la farine', 'package', 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment se faisait la mouture à l’origine (Égypte antique) ?', 'Au début, on écrasait les grains à la main avec des pierres ou des mortiers — long et peu régulier.', 'Manuel Niveau I PRO, p. 9', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Manuellement, avec des pierres ou des mortiers', 1),
    (@q, 20, 'Avec des moulins à eau', 0),
    (@q, 30, 'Avec des moulins à cylindres', 0),
    (@q, 40, 'Avec des broyeurs électriques', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle invention du XIXe siècle a révolutionné la mouture ?', 'Le moulin à cylindres a permis une farine de qualité supérieure, plus vite. Au Moyen Âge, on utilisait des moulins à eau et à vent.', 'Manuel Niveau I PRO, p. 9', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le moulin à cylindres', 1),
    (@q, 20, 'Le moulin à vent', 0),
    (@q, 30, 'Le mortier en pierre', 0),
    (@q, 40, 'Le tamis électrique', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu’est-ce que la farine, par définition ?', 'La farine est une poudre obtenue après mouture de grains de céréales.', 'Manuel Niveau I PRO, p. 10', @d_facile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Une poudre obtenue après mouture de grains de céréales', 1),
    (@q, 20, 'Une pâte fermentée', 0),
    (@q, 30, 'Un mélange d’eau et de sel', 0),
    (@q, 40, 'Un type de levure', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'De quoi dépend principalement la qualité (W) de la farine ?', 'Plus la farine est riche en protéines, plus la maille glutamique est forte et plus le W est élevé.', 'Manuel Niveau I PRO, p. 10', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'De la qualité des protéines', 1),
    (@q, 20, 'De sa couleur', 0),
    (@q, 30, 'De son prix', 0),
    (@q, 40, 'De son humidité', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelles sont les protéines NON solubles de la farine (la maille glutamique) ?', 'Les non solubles sont la gliadine et la glutamine (la maille glutamique). Les solubles — globuline et albumine — représentent environ 15 %.', 'Manuel Niveau I PRO, p. 10', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Gliadine et glutamine', 1),
    (@q, 20, 'Globuline et albumine', 0),
    (@q, 30, 'Caséine et gluten', 0),
    (@q, 40, 'Amidon et cellulose', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque facteur à ce dont dépend la qualité de la farine :', 'La qualité de la farine dépend du climat, de la nature du sol et de la qualité de la semence — en plus de la richesse en protéines.', 'Manuel Niveau I PRO, p. 10', @d_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Le climat', 'Facteur naturel', 1),
    (@q, 20, 'La nature du sol', 'Facteur naturel', 1),
    (@q, 30, 'La qualité de la semence', 'Facteur agronomique', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de mentions obligatoires la loi européenne impose-t-elle sur un sac de farine ?', 'La loi européenne prévoit 5 mentions obligatoires : DLUO, type (raffinage), nom du moulin, taux d’humidité (15,5 % max) et poids.', 'Manuel Niveau I PRO, p. 12', @d_normal, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '5', 1),
    (@q, 20, '3', 0),
    (@q, 30, '7', 0),
    (@q, 40, '10', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'L’indice de force (W) fait partie des mentions obligatoires imprimées sur le sac.', 'Non — le W ne figure pas sur les sacs. Il est calculé en laboratoire. Les 5 mentions sont la DLUO, le type, le moulin, l’humidité (15,5 % max) et le poids.', 'Manuel Niveau I PRO, p. 12 et 15', @d_difficile, 0, 80);

/* Chapitre : Les types de farine (raffinage) — 9 questions (8 QCM, 1 VF, 0 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Les types de farine (raffinage)';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Les types de farine (raffinage)', 'wheat', 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu’est-ce qui détermine le type d’une farine (T45, T55…) ?', 'C’est le taux de cendres — les matières minérales, en grammes pour 100 g de matière sèche — qui désigne le type de la farine.', 'Manuel Niveau I PRO, p. 14', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Son taux de cendres', 1),
    (@q, 20, 'Son taux de protéines', 0),
    (@q, 30, 'Son prix', 0),
    (@q, 40, 'La couleur de son sac', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Où se trouvent principalement les cendres (matières minérales) du grain ?', 'Les cendres sont des matières minérales principalement contenues dans les sons — d’où un taux plus bas dans une farine très blanche.', 'Manuel Niveau I PRO, p. 14', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Dans les sons', 1),
    (@q, 20, 'Dans l’amande', 0),
    (@q, 30, 'Dans le germe', 0),
    (@q, 40, 'Dans l’eau', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Plus une farine est blanche et raffinée, plus son taux de cendres est faible.', 'Exact — la farine la plus blanche est faite essentiellement de l’amande du grain, très pure, donc pauvre en cendres.', 'Manuel Niveau I PRO, p. 14', @d_facile, 1, 30);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de types de farine existe-t-il en France ?', 'Il existe 6 types en France, définis par leurs taux de cendres. L’Italie en compte 5.', 'Manuel Niveau I PRO, p. 14', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '6', 1),
    (@q, 20, '5', 0),
    (@q, 30, '7', 0),
    (@q, 40, '8', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quel type français correspond la farine italienne « 00 » ?', 'Le « 00 » italien correspond aux T45/T55 françaises (cendres 0,50 à 0,60), utilisées pour la pizza et les pains blancs.', 'Manuel Niveau I PRO, p. 14', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'T45 / T55', 1),
    (@q, 20, 'T80', 0),
    (@q, 30, 'T110', 0),
    (@q, 40, 'T150', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle farine italienne correspond à la T150 française ?', 'La T150 (plus de 1,40 de cendres) correspond à l’Integrale, pour les pains au son.', 'Manuel Niveau I PRO, p. 14', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Integrale', 1),
    (@q, 20, '0', 0),
    (@q, 30, '1', 0),
    (@q, 40, '00', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour 100 kg de blé, quelle quantité de farine cherche-t-on le plus souvent à obtenir ?', 'On vise le plus souvent 75 kg de farine, avec 2 % de perte — les 23 % restants forment les « issues ».', 'Manuel Niveau I PRO, p. 14', @d_normal, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '75 kg', 1),
    (@q, 20, '50 kg', 0),
    (@q, 30, '90 kg', 0),
    (@q, 40, '100 kg', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment nomme-t-on les 23 % restants après extraction de la farine ?', 'Hors 75 kg de farine et 2 % de perte, les 23 % restants forment les « issues ».', 'Manuel Niveau I PRO, p. 14', @d_difficile, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Les issues', 1),
    (@q, 20, 'Les cendres', 0),
    (@q, 30, 'Le gruau', 0),
    (@q, 40, 'Le son fin', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Chez 5 Stagioni, les codes couleur des sacs correspondent à quoi ?', 'Chez 5 Stagioni, la couleur du sac indique le W — par exemple W390 en rouge, W420 en marron, W300 en gamme Napoletana.', 'Manuel Niveau I PRO, p. 12', @d_normal, NULL, 90);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Au W (indice de force)', 1),
    (@q, 20, 'Au type (T45, T55…)', 0),
    (@q, 30, 'Au poids', 0),
    (@q, 40, 'À la DLUO', 0);

/* Chapitre : La force de la farine (W) — 10 questions (8 QCM, 1 VF, 1 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La force de la farine (W)';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La force de la farine (W)', 'chart', 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que mesure l’indice W d’une farine ?', 'Le W est l’indice de force de la farine — il mesure l’extensibilité et la ténacité de la pâte.', 'Manuel Niveau I PRO, p. 15', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Sa force boulangère : extensibilité et ténacité de la pâte', 1),
    (@q, 20, 'Son taux d’humidité', 0),
    (@q, 30, 'Son taux de cendres', 0),
    (@q, 40, 'Sa finesse de mouture', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Avec quel appareil le W est-il mesuré ?', 'Le W est calculé en laboratoire avec l’alvéographe de Chopin, qui gonfle une bulle de pâte jusqu’à l’éclatement.', 'Manuel Niveau I PRO, p. 15', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L’alvéographe de Chopin', 1),
    (@q, 20, 'Le réfractomètre', 0),
    (@q, 30, 'Le pH-mètre', 0),
    (@q, 40, 'Le densimètre', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le W est imprimé directement sur le sac de farine.', 'Non — il ne figure pas sur les sacs. Il faut la fiche technique du meunier, ou l’estimer à partir du taux de protéines.', 'Manuel Niveau I PRO, p. 15', @d_normal, 0, 30);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel W convient aux pizzas napolitaines ?', 'Le W 250-310 est celui des pizzas napolitaines. Les W 200-250 vont aux empâtements directs à levage court.', 'Manuel Niveau I PRO, p. 15', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'W 250 à 310', 1),
    (@q, 20, 'W 120 à 150', 0),
    (@q, 30, 'W 200 à 250', 0),
    (@q, 40, 'W 400 à 430', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel W correspond à des empâtements directs à levage COURT ?', 'Le W 200-250 est destiné aux empâtements directs à levage court. Les W 330-390 vont aux levages longs et aux indirects.', 'Manuel Niveau I PRO, p. 15', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'W 200 à 250', 1),
    (@q, 20, 'W 120 à 150', 0),
    (@q, 30, 'W 330 à 390', 0),
    (@q, 40, 'W 400 à 430', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quoi servent les farines de force W 400-430, dites « Manitoba » ?', 'Les farines de force (W 400-430, dites Manitoba) ne s’emploient pas seules — elles renforcent une farine trop faible.', 'Manuel Niveau I PRO, p. 15', @d_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'À renforcer des farines plus faibles', 1),
    (@q, 20, 'Aux biscuits', 0),
    (@q, 30, 'Aux pizzas napolitaines', 0),
    (@q, 40, 'Aux pains sans gluten', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel W est conseillé pour les biscuits et les crackers ?', 'Le W 120-150 convient aux biscuits et crackers — une farine faible pour une pâte peu levée.', 'Manuel Niveau I PRO, p. 15', @d_difficile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'W 120 à 150', 1),
    (@q, 20, 'W 250 à 310', 0),
    (@q, 30, 'W 330 à 390', 0),
    (@q, 40, 'W 420', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans l’alvéogramme, que mesure le symbole « P » ?', 'P (Pression) mesure la ténacité, la fermeté de la pâte et sa résistance à la déformation.', 'Manuel Niveau I PRO, p. 16', @d_difficile, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La ténacité (fermeté, résistance à la déformation)', 1),
    (@q, 20, 'L’extensibilité', 0),
    (@q, 30, 'Le gonflement', 0),
    (@q, 40, 'Le travail', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que traduit le rapport P/L de la farine ?', 'Le P/L traduit l’équilibre, ou le déséquilibre, entre la ténacité (P) et l’extensibilité (L) de la pâte.', 'Manuel Niveau I PRO, p. 16', @d_difficile, NULL, 90);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L’équilibre entre ténacité et extensibilité', 1),
    (@q, 20, 'Le prix de la farine', 0),
    (@q, 30, 'Le taux de cendres', 0),
    (@q, 40, 'La couleur', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque force de farine à son usage :', 'Plus la fermentation est longue, plus il faut de force. Les farines de renfort corrigent une farine trop faible, on ne les emploie pas seules.', 'Manuel Niveau I PRO, p. 15', @d_normal, NULL, 100);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'W 120 à 150', 'Biscuits et crackers', 1),
    (@q, 20, 'W 250 à 310', 'Pizza napolitaine', 1),
    (@q, 30, 'W 400 à 430', 'Renfort (Manitoba)', 1);

/* Chapitre : La levure — 13 questions (11 QCM, 1 VF, 1 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'La levure';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'La levure', 'yeast', 70);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de types de levures différentes utilise-t-on en pizzeria selon le manuel ?', 'Quatre : levure fraîche, levure sèche active boulangère (à réhydrater), levure sèche instantanée et levain.', 'Manuel Niveau I PRO, p. 17', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '4', 1),
    (@q, 20, '2', 0),
    (@q, 30, '3', 0),
    (@q, 40, '5', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu’est-ce que la levure, biologiquement ?', 'La levure est un micro-organisme, un champignon très diffusé dans la nature.', 'Manuel Niveau I PRO, p. 17', @d_facile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Un micro-organisme (un champignon)', 1),
    (@q, 20, 'Une bactérie', 0),
    (@q, 30, 'Un virus', 0),
    (@q, 40, 'Une algue', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle variété de levure utilise-t-on en panification ?', 'On utilise le saccharomyces cerevisiae — la levure de bière ou de boulanger —, capable de transformer les sucres simples.', 'Manuel Niveau I PRO, p. 17', @d_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Saccharomyces cerevisiae', 1),
    (@q, 20, 'Candida albicans', 0),
    (@q, 30, 'Lactobacillus', 0),
    (@q, 40, 'Penicillium', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment nomme-t-on la transformation des sucres en gaz carbonique et en alcool par la levure ?', 'Cette transformation des sucres par la levure se nomme la fermentation alcoolique.', 'Manuel Niveau I PRO, p. 17', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La fermentation alcoolique', 1),
    (@q, 20, 'La panification', 0),
    (@q, 30, 'L’autolyse', 0),
    (@q, 40, 'La dessiccation', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour réhydrater la levure sèche active, à quelle température doit être l’eau, sans dépasser quel seuil ?', 'L’eau doit être à 38 °C et ne pas dépasser 50 °C — au-delà, la levure meurt.', 'Manuel Niveau I PRO, p. 17', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '38 °C, sans dépasser 50 °C', 1),
    (@q, 20, '20 °C, sans dépasser 30 °C', 0),
    (@q, 30, '50 °C, sans dépasser 60 °C', 0),
    (@q, 40, '10 °C, sans dépasser 20 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de cellules compte environ 1 g de levure fraîche ?', '1 g de levure fraîche contient environ 10 milliards de cellules, qui se reproduisent par germination en une heure environ.', 'Manuel Niveau I PRO, p. 18', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '10 milliards', 1),
    (@q, 20, '1 million', 0),
    (@q, 30, '100 millions', 0),
    (@q, 40, '1000 milliards', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est le rôle principal de la levure dans la pâte ?', 'La levure assure la levée par sa production de gaz carbonique, d’où la légèreté et l’alvéolage. Son alcool contribue aux arômes.', 'Manuel Niveau I PRO, p. 18', @d_facile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Assurer la levée par production de gaz carbonique', 1),
    (@q, 20, 'Saler la pâte', 0),
    (@q, 30, 'Colorer la croûte', 0),
    (@q, 40, 'Durcir la pâte', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque mode de vie de la levure à son effet :', 'Avec air, la levure respire et se reproduit. Sans air, elle puise son énergie dans la fermentation des sucres, transformés en alcool.', 'Manuel Niveau I PRO, p. 18', @d_normal, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Vie aérobie (avec air)', 'Elle respire et se reproduit', 1),
    (@q, 20, 'Vie anaérobie (sans air)', 'Elle fermente les sucres en alcool', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Une dose de levure excessive donne une pâte peu savoureuse qui rassit très vite.', 'Exact — une dose excessive ne respecte pas les étapes de la panification et conduit à une pâte peu savoureuse, à rassissement rapide.', 'Manuel Niveau I PRO, p. 18', @d_normal, 1, 90);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle dose maximale de levure FRAÎCHE admet-on par kilo de farine ?', 'On admet 2 à 4 g de levure fraîche par kilo de farine selon la saison — autant pour la sèche active, moitié moins pour l’instantanée.', 'Manuel Niveau I PRO, p. 19', @d_normal, NULL, 100);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2 à 4 g', 1),
    (@q, 20, '0,5 à 1 g', 0),
    (@q, 30, '5 à 7 g', 0),
    (@q, 40, '10 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle dose maximale de levure sèche INSTANTANÉE admet-on par kilo de farine ?', '1 à 2 g de levure sèche instantanée par kilo de farine, contre 2 à 4 g pour la fraîche et la sèche active.', 'Manuel Niveau I PRO, p. 19', @d_difficile, NULL, 110);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '1 à 2 g', 1),
    (@q, 20, '2 à 4 g', 0),
    (@q, 30, '4 à 6 g', 0),
    (@q, 40, '6 à 8 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À partir de quelle température de l’eau la levure est-elle DÉTRUITE ?', 'Au-dessus de 50 °C la levure est détruite. Au-dessus de 40 °C elle est affaiblie, et dans l’eau froide son action est ralentie.', 'Manuel Niveau I PRO, p. 19', @d_difficile, NULL, 120);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Au-dessus de 50 °C', 1),
    (@q, 20, 'Au-dessus de 30 °C', 0),
    (@q, 30, 'Au-dessus de 40 °C', 0),
    (@q, 40, 'Au-dessus de 60 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Entre quelles températures la levure fraîche a-t-elle son action optimale (pâte) ?', 'La levure fraîche agit de façon optimale pour une pâte entre 21 et 27 °C, selon la saison.', 'Manuel Niveau I PRO, p. 19', @d_difficile, NULL, 130);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '21 et 27 °C', 1),
    (@q, 20, '5 et 10 °C', 0),
    (@q, 30, '30 et 40 °C', 0),
    (@q, 40, '40 et 50 °C', 0);

/* Chapitre : L’eau & l’hydratation — 11 questions (10 QCM, 1 VF, 0 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L’eau & l’hydratation';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'L’eau & l’hydratation', 'droplet', 80);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle qualité première l’eau des empâtements doit-elle avoir ?', 'L’eau doit être potable — critères organiques, chimiques et bactériologiques conseillés par l’OMS.', 'Manuel Niveau I PRO, p. 20', @d_facile, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Être potable', 1),
    (@q, 20, 'Être minérale', 0),
    (@q, 30, 'Être gazeuse', 0),
    (@q, 40, 'Être distillée', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que recouvrent les critères ORGANIQUES de l’eau ?', 'Les critères organiques : eau incolore, limpide, inodore, sans goût.', 'Manuel Niveau I PRO, p. 20', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Incolore, limpide, inodore, sans goût', 1),
    (@q, 20, 'Riche en calcium', 0),
    (@q, 30, 'Chaude et salée', 0),
    (@q, 40, 'Calcaire et séléniteuse', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment appelle-t-on une eau riche en sels de calcium ou de magnésium ?', 'Chargée en sels de calcium ou de magnésium (craie, chaux, plâtre), l’eau est dite « calcaire » ou « séléniteuse ».', 'Manuel Niveau I PRO, p. 20', @d_normal, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Une eau « calcaire » ou « séléniteuse »', 1),
    (@q, 20, 'Une eau douce', 0),
    (@q, 30, 'Une eau distillée', 0),
    (@q, 40, 'L’eau de coulage', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En quelle unité mesure-t-on la dureté de l’eau ?', 'La dureté se mesure en degré français (°f ou °fH), à ne pas confondre avec le °F, degré Fahrenheit.', 'Manuel Niveau I PRO, p. 20', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'En degré français (°f)', 1),
    (@q, 20, 'En degré Fahrenheit', 0),
    (@q, 30, 'En pH', 0),
    (@q, 40, 'En grammes', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle dureté d’eau est idéale pour la pâte ?', 'Une eau moyennement dure (5 à 20 degrés) est idéale. Trop douce, la pâte colle et bulle à la cuisson. Trop dure, elle est dure et peu levée.', 'Manuel Niveau I PRO, p. 20', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Moyennement dure (5 à 20 degrés)', 1),
    (@q, 20, 'Douce (jusqu’à 5 degrés)', 0),
    (@q, 30, 'Dure (plus de 20 degrés)', 0),
    (@q, 40, 'Très dure (plus de 40 degrés)', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment corriger le problème d’une eau trop DURE ?', 'Pour une eau dure, on utilise un adoucisseur. Pour une eau trop douce, on peut au contraire rajouter un peu de sel dans la pâte.', 'Manuel Niveau I PRO, p. 20', @d_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Utiliser un adoucisseur', 1),
    (@q, 20, 'Ajouter du sel', 0),
    (@q, 30, 'Ajouter de la farine', 0),
    (@q, 40, 'Refroidir l’eau', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Comment nomme-t-on l’eau servant au pétrissage de la pâte ?', 'L’eau de pétrissage est l’« eau de coulage ». L’eau ajoutée en fin de pétrissage pour corriger la texture est l’« eau de bassinage ».', 'Manuel Niveau I PRO, p. 20', @d_normal, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'L’eau de coulage', 1),
    (@q, 20, 'L’eau de bassinage', 0),
    (@q, 30, 'L’eau de fermentation', 0),
    (@q, 40, 'L’eau de source', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Lequel de ces rôles n’est PAS un rôle de l’eau de coulage ?', 'L’eau hydrate la farine, dissout sel et levure, forme le gluten et nourrit la fermentation. La coloration de la croûte relève du sel et de la cuisson.', 'Manuel Niveau I PRO, p. 20', @d_difficile, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Colorer la croûte à la cuisson', 1),
    (@q, 20, 'Hydrater la farine', 0),
    (@q, 30, 'Dissoudre le sel et la levure', 0),
    (@q, 40, 'Former le réseau de gluten', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu’est-ce que le taux d’hydratation ?', 'Le taux d’hydratation est la quantité d’eau nécessaire pour hydrater le kilo de farine, par rapport à sa force.', 'Manuel Niveau I PRO, p. 21', @d_normal, NULL, 90);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La quantité d’eau pour hydrater 1 kg de farine selon sa force', 1),
    (@q, 20, 'La température de la pâte', 0),
    (@q, 30, 'Le poids du sel', 0),
    (@q, 40, 'Le temps de pointage', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est le taux d’hydratation minimum avec un empâtement direct ?', 'Le minimum est de 54 %, jusqu’à 60 %, en empâtement direct. On peut rajouter de l’eau si l’on substitue une partie de la farine.', 'Manuel Niveau I PRO, p. 21', @d_difficile, NULL, 100);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '54 %', 1),
    (@q, 20, '50 %', 0),
    (@q, 30, '60 %', 0),
    (@q, 40, '65 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Plus l’indice W de la farine est élevé, plus on peut l’hydrater.', 'Oui — l’eau se dose selon la force : W200 à 54 %, W250 à 55 %, W300 à 56 %… jusqu’à W420 à 60 %.', 'Manuel Niveau I PRO, p. 21 et 27', @d_difficile, 1, 110);

/* Chapitre : Le calcul de la température de l’eau — 6 questions (6 QCM, 0 VF, 0 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le calcul de la température de l’eau';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Le calcul de la température de l’eau', 'thermometer', 90);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle température de base (TB) la formule de l’école utilise-t-elle ?', 'La formule applique une température de base TB = 50, un chiffre de référence pour viser une température de pâte régulière.', 'Manuel Niveau I PRO, p. 21', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '50', 1),
    (@q, 20, '40', 0),
    (@q, 30, '54', 0),
    (@q, 40, '60', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle est la formule de la température de l’eau de coulage ?', 'On calcule Y = température de la farine × 2, puis eau de coulage = TB 50 − Y.', 'Manuel Niveau I PRO, p. 21', @d_difficile, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '50 − (température de la farine × 2)', 1),
    (@q, 20, '50 + température de la farine', 0),
    (@q, 30, '(température de la farine × 2) + 50', 0),
    (@q, 40, '50 ÷ température de la farine', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En été, avec une farine à 24 °C, quelle est la température de l’eau de coulage ?', '24 × 2 = 48, puis 50 − 48 = 2 °C. La pâte visée est alors de 22 à 24 °C.', 'Manuel Niveau I PRO, p. 21', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2 °C', 1),
    (@q, 20, '16 °C', 0),
    (@q, 30, '30 °C', 0),
    (@q, 40, '48 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En hiver, avec une farine à 10 °C, quelle est la température de l’eau de coulage ?', '10 × 2 = 20, puis 50 − 20 = 30 °C. La pâte visée est de 22 à 27 °C.', 'Manuel Niveau I PRO, p. 21', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '30 °C', 1),
    (@q, 20, '2 °C', 0),
    (@q, 30, '16 °C', 0),
    (@q, 40, '20 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Au printemps ou en automne, avec une farine à 17 °C, quelle est l’eau de coulage ?', '17 × 2 = 34, puis 50 − 34 = 16 °C. La pâte visée est de 22 à 25 °C.', 'Manuel Niveau I PRO, p. 21', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '16 °C', 1),
    (@q, 20, '2 °C', 0),
    (@q, 30, '30 °C', 0),
    (@q, 40, '34 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Cas extrême en été, farine à 28 °C (50 − 56 = −6 °C impossible). Que conseille le manuel ?', 'La formule donnerait −6 °C, impossible. Le conseil est d’anticiper en mettant la farine au frais dès la veille.', 'Manuel Niveau I PRO, p. 21', @d_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Mettre la veille une partie ou la totalité de la farine au frais', 1),
    (@q, 20, 'Chauffer l’eau', 0),
    (@q, 30, 'Ajouter du sel', 0),
    (@q, 40, 'Ne rien changer', 0);

/* Chapitre : Le sel — 9 questions (6 QCM, 2 VF, 1 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Le sel';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Le sel', 'salt', 100);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle dose moyenne de sel utilise-t-on par kilo de farine ?', 'La dose moyenne en panification est de 17 à 22 g de sel par kilo de farine.', 'Manuel Niveau I PRO, p. 22', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '17 à 22 g', 1),
    (@q, 20, '5 à 10 g', 0),
    (@q, 30, '25 à 30 g', 0),
    (@q, 40, '40 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel est l’effet du sel sur la fermentation ?', 'Le sel freine et régularise la fermentation — par son action antiseptique, il brûle en partie les cellules de la levure.', 'Manuel Niveau I PRO, p. 23', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Il la freine et la régularise', 1),
    (@q, 20, 'Il l’accélère', 0),
    (@q, 30, 'Il l’arrête totalement', 0),
    (@q, 40, 'Il n’a aucun effet', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Grâce à quelle propriété le sel garde-t-il la pâte blanche ?', 'Le sel retarde l’oxydation de la pâte — elle reste blanche grâce à ses propriétés antioxydantes.', 'Manuel Niveau I PRO, p. 23', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Antioxydante', 1),
    (@q, 20, 'Antiseptique', 0),
    (@q, 30, 'Hygroscopique', 0),
    (@q, 40, 'Hydrosoluble', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que permet la propriété hygroscopique du sel ?', 'Hygroscopique, le sel augmente la densité de la pâte — on peut donc l’hydrater davantage sans qu’elle colle.', 'Manuel Niveau I PRO, p. 23', @d_difficile, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'D’augmenter la densité de la pâte et de l’hydrater davantage sans la rendre collante', 1),
    (@q, 20, 'De colorer la pâte', 0),
    (@q, 30, 'De tuer la levure', 0),
    (@q, 40, 'De sécher la pâte', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le sel renforce la maille glutamique : la gliadine y devient moins soluble.', 'Exact — en eau salée, il se forme plus de gluten, aux fibres plus courtes liées par attraction électrostatique.', 'Manuel Niveau I PRO, p. 23', @d_difficile, 1, 50);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Le sel participe à la coloration de la croûte et à son croustillant.', 'Oui — le sel améliore la coloration et le croustillant de la croûte, et relève la saveur du produit fini.', 'Manuel Niveau I PRO, p. 23', @d_facile, 1, 60);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'D’où provient le sel GEMME ?', 'Le sel gemme est extrait des mines ou carrières. Le sel marin, lui, vient de l’évaporation de l’eau de mer dans les marais salants.', 'Manuel Niveau I PRO, p. 23', @d_normal, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Des mines ou carrières (dépôts géologiques)', 1),
    (@q, 20, 'De l’évaporation de l’eau de mer', 0),
    (@q, 30, 'De la farine', 0),
    (@q, 40, 'Des sources thermales', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque sel à son origine :', 'Le sel gemme provient de dépôts géologiques, le sel marin de l’évaporation de l’eau de mer.', 'Manuel Niveau I PRO, p. 23', @d_facile, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Sel gemme', 'Mines et carrières', 1),
    (@q, 20, 'Sel marin', 'Marais salants (évaporation)', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle action du sel est NÉGATIVE pour la pâte ?', 'Action négative — le sel brûle les cellules de la levure et diminue le dégagement d’anhydride carbonique. D’où l’importance de ne pas le mettre au contact direct de la levure.', 'Manuel Niveau I PRO, p. 23', @d_normal, NULL, 90);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Il brûle les cellules de la levure et réduit la production de gaz', 1),
    (@q, 20, 'Il brûle les moisissures', 0),
    (@q, 30, 'Il améliore la saveur', 0),
    (@q, 40, 'Il améliore la conservation', 0);

/* Chapitre : L’huile d’olive — 8 questions (6 QCM, 1 VF, 1 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'L’huile d’olive';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'L’huile d’olive', 'oil', 110);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel « élément » des ingrédients de la pâte l’huile d’olive représente-t-elle ?', 'L’huile d’olive est le 5e élément des ingrédients d’une pâte à pizza — mais elle n’est pas indispensable.', 'Manuel Niveau I PRO, p. 23', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le 5e', 1),
    (@q, 20, 'Le 1er', 0),
    (@q, 30, 'Le 3e', 0),
    (@q, 40, 'Le 7e', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quoi sert l’huile dans la pâte pendant la maturation en chambre froide ?', 'L’huile fige le pâton durant sa maturation en chambre froide et l’empêche de s’affaisser, de 1 à 5 jours.', 'Manuel Niveau I PRO, p. 23', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'À figer le pâton et l’empêcher de s’affaisser', 1),
    (@q, 20, 'À colorer la pâte', 0),
    (@q, 30, 'À tuer la levure', 0),
    (@q, 40, 'À saler la pâte', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle fonction l’huile donne-t-elle à la pâte ?', 'L’huile lubrifie la pâte et lui apporte un peu de souplesse et d’élasticité.', 'Manuel Niveau I PRO, p. 23', @d_facile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'La lubrifier, lui donner souplesse et élasticité', 1),
    (@q, 20, 'La durcir', 0),
    (@q, 30, 'L’assécher', 0),
    (@q, 40, 'La blanchir', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'La véritable pizza napolitaine (patrimoine UNESCO) ne contient pas d’huile d’olive dans sa pâte.', 'Exact — sa pâte est faite pour être utilisée très vite, sans maturation longue, donc sans huile.', 'Manuel Niveau I PRO, p. 23', @d_normal, 1, 40);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle acidité maximale caractérise une huile d’olive EXTRA VIERGE ?', 'L’extra vierge a une acidité inférieure à 0,8 %, la vierge 2 % maximum, et la « 1er prix » plus de 3,3 %.', 'Manuel Niveau I PRO, p. 24', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Inférieure à 0,8 %', 1),
    (@q, 20, 'Maximale 2 %', 0),
    (@q, 30, 'Supérieure à 3,3 %', 0),
    (@q, 40, '5 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quelle acidité maximale a une huile d’olive VIERGE ?', 'La vierge a une acidité maximale de 2 %, entre l’extra vierge (moins de 0,8 %) et la « 1er prix » (plus de 3,3 %).', 'Manuel Niveau I PRO, p. 24', @d_difficile, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '2 %', 1),
    (@q, 20, '0,8 %', 0),
    (@q, 30, '3,3 %', 0),
    (@q, 40, '6 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Sur l’échelle organoleptique (0 = aucun défaut), que caractérise l’extra vierge ?', 'L’extra vierge est sans défaut organoleptique, avec du fruité. La vierge a peu de défaut (3,5/10), la « 1er prix » des défauts (6/10).', 'Manuel Niveau I PRO, p. 24', @d_difficile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Absence de défaut et présence de fruité', 1),
    (@q, 20, 'Peu de défaut (3,5/10)', 0),
    (@q, 30, 'Défauts (6/10)', 0),
    (@q, 40, 'Défauts (10/10)', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque huile d’olive à son acidité maximale :', 'L’acidité monte à mesure que la qualité baisse — moins de 0,8 % pour l’extra vierge, 2 % pour la vierge, plus de 3,3 % pour la « 1er prix ».', 'Manuel Niveau I PRO, p. 24', @d_normal, NULL, 80);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Extra vierge', 'Moins de 0,8 %', 1),
    (@q, 20, 'Vierge', '2 %', 1),
    (@q, 30, '1er prix', 'Plus de 3,3 %', 1);

/* Chapitre : Substitutions & adjonctions — 8 questions (6 QCM, 1 VF, 1 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Substitutions & adjonctions';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Substitutions & adjonctions', 'shuffle', 120);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu’est-ce qu’une substitution ?', 'La substitution remplace une partie du poids de farine de blé par une ou plusieurs autres farines (complète, soja, châtaigne, seigle…).', 'Manuel Niveau I PRO, p. 25', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Remplacer une partie de la farine de blé par une ou plusieurs autres farines', 1),
    (@q, 20, 'Ajouter un produit à la pâte', 0),
    (@q, 30, 'Remplacer l’eau par du lait', 0),
    (@q, 40, 'Changer la levure', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pourquoi certaines farines de substitution imposent-elles d’ajouter de l’eau de bassinage ?', 'Certaines farines assèchent la pâte — on rajoute alors de l’eau de bassinage en fin de pétrissage pour une texture souple et homogène.', 'Manuel Niveau I PRO, p. 25', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Elles peuvent assécher la pâte', 1),
    (@q, 20, 'Elles colorent la pâte', 0),
    (@q, 30, 'Elles tuent la levure', 0),
    (@q, 40, 'Elles salent la pâte', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Pour 10 % de farine de soja sur 10 unités de calcul, combien d’eau de bassinage ajoute-t-on par unité ?', 'Pour 10 % de soja, on rajoute 30 g d’eau de bassinage par unité de calcul — par exemple 9 kg de farine + 1 kg de soja sur 10 unités.', 'Manuel Niveau I PRO, p. 25', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '30 g', 1),
    (@q, 20, '10 g', 0),
    (@q, 30, '20 g', 0),
    (@q, 40, '40 g', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu’est-ce qu’une adjonction ?', 'L’adjonction est le rajout d’un autre produit mélangé à la pâte au pétrissage. Elle se calcule sur le poids de la farine.', 'Manuel Niveau I PRO, p. 26', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le rajout d’un produit mélangé à la pâte pendant le pétrissage', 1),
    (@q, 20, 'Le remplacement d’une farine par une autre', 0),
    (@q, 30, 'Un temps de repos', 0),
    (@q, 40, 'Une cuisson', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Quel pourcentage de PÂTE FERMENTÉE ajoute-t-on en adjonction ?', 'La pâte fermentée s’ajoute à 10 à 30 %, à la 8e minute du pétrissage.', 'Manuel Niveau I PRO, p. 26', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '10 à 30 %', 1),
    (@q, 20, '1 %', 0),
    (@q, 30, '3 à 6 %', 0),
    (@q, 40, '4 %', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Qu’est-ce que le « Naturkraft » cité parmi les adjonctions ?', 'Le Naturkraft est un levain déshydraté, ajouté à 4 % avec la farine.', 'Manuel Niveau I PRO, p. 26', @d_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Un levain déshydraté', 1),
    (@q, 20, 'Un son torréfié', 0),
    (@q, 30, 'Un charbon végétal', 0),
    (@q, 40, 'Une farine de soja', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'ASSOC', 'Associe chaque adjonction à son dosage recommandé :', 'Chaque adjonction a son dosage et son moment — graines avant le sel, pâte fermentée à la 8e minute, Naturkraft et charbon avec la farine, son après l’huile.', 'Manuel Niveau I PRO, p. 26', @d_difficile, NULL, 70);
INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES
    (@q, 10, 'Graines torréfiées', '3 à 6 %', 1),
    (@q, 20, 'Pâte fermentée', '10 à 30 %', 1),
    (@q, 30, 'Naturkraft', '4 %', 1),
    (@q, 40, 'Charbon végétal', '1 à 2 %', 1);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'Une adjonction se calcule sur le poids total de la pâte, eau comprise.', 'Non — l’adjonction se calcule sur le poids de la FARINE, comme le sel, la levure et l’huile.', 'Manuel Niveau I PRO, p. 26', @d_normal, 0, 80);

/* Chapitre : Protocoles & pétrissage — 7 questions (6 QCM, 1 VF, 0 ASSOC) */
DELETE FROM quest_chapter WHERE organization_id = @org AND title = 'Protocoles & pétrissage';
SET @ch = uuid();
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, 'Protocoles & pétrissage', 'clock', 130);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Combien de pâtons de 280 g obtient-on environ pour 1 unité de calcul ?', 'Une unité de calcul (1 kg de farine) donne environ 6 pâtons de 280 g.', 'Manuel Niveau I PRO, p. 27', @d_normal, NULL, 10);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '6', 1),
    (@q, 20, '4', 0),
    (@q, 30, '10', 0),
    (@q, 40, '12', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En 1re phase de l’empâtement direct, pourquoi laisser tourner farine + levure 1 min ?', 'On met la farine et la levure et on laisse tourner 1 min — c’est le temps d’oxygénation, avant de verser l’eau.', 'Manuel Niveau I PRO, p. 28', @d_normal, NULL, 20);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Pour le temps d’oxygénation', 1),
    (@q, 20, 'Pour saler', 0),
    (@q, 30, 'Pour chauffer', 0),
    (@q, 40, 'Pour colorer', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'En 2e phase de l’empâtement direct, combien de temps pétrit-on à petite vitesse ?', 'On verse l’eau d’un coup — en gardant un verre pour le bassinage — puis on pétrit 12 min à petite vitesse.', 'Manuel Niveau I PRO, p. 28', @d_difficile, NULL, 30);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '12 min', 1),
    (@q, 20, '3 min', 0),
    (@q, 30, '8 min', 0),
    (@q, 40, '20 min', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Dans quel ordre ajoute-t-on sel et huile en 3e phase ?', 'On verse le sel petit à petit, puis l’huile d’olive au bout d’une minute, et on pétrit encore 2 à 3 min.', 'Manuel Niveau I PRO, p. 28', @d_normal, NULL, 40);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Le sel petit à petit, puis l’huile après 1 min', 1),
    (@q, 20, 'L’huile puis le sel', 0),
    (@q, 30, 'Les deux ensemble', 0),
    (@q, 40, 'Le sel seulement', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'À quelle température bloque-t-on les bacs Gilac après avoir boulé ?', 'On divise, pèse et boule, puis on dépose dans des bacs Gilac 60 × 40 cm et on bloque à 3 à 4 °C.', 'Manuel Niveau I PRO, p. 28', @d_difficile, NULL, 50);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, '3 à 4 °C', 1),
    (@q, 20, '0 à 1 °C', 0),
    (@q, 30, '8 à 10 °C', 0),
    (@q, 40, '16 °C', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'QCM', 'Que permet d’obtenir la méthode de l’autolyse ?', 'L’autolyse — farine et eau pétries brièvement puis laissées reposer 40 min — donne une pâte plus extensible.', 'Manuel Niveau I PRO, p. 29', @d_normal, NULL, 60);
INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES
    (@q, 10, 'Une pâte plus extensible', 1),
    (@q, 20, 'Une pâte plus dure', 0),
    (@q, 30, 'Une pâte plus salée', 0),
    (@q, 40, 'Une pâte plus colorée', 0);

SET @q = uuid();
INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, 'VF', 'En empâtement SEMI-DIRECT, on incorpore une pâte fermentée pendant le pétrissage.', 'Oui — on pétrit 8 min, on ajoute la pâte fermentée (un empâtement laissé fermenter 24 h, ou 2 à 5 jours en chambre froide), puis on termine 4 min.', 'Manuel Niveau I PRO, p. 31', @d_normal, 1, 70);


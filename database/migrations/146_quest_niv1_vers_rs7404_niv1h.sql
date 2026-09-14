/*
 * PIZZA QUEST : la banque de NIV1 recopiée vers RS7404 et NIV1H, plus un chapitre d'hygiène.
 *
 * POURQUOI. Seules NIV1 (20 chapitres, 139 questions) et NIV2 (6 chapitres) ont du contenu.
 * RS7404 et NIV1H n'en ont AUCUN : leurs stagiaires ouvrent Pizza Quest sur un chemin vide.
 * Or ces deux formations couvrent le même socle que NIV1 — c'est la même pizza classique.
 *
 * LA COPIE SE FAIT EN BASE, PAS À LA MAIN. Les 139 questions et leurs options sont recopiées
 * par `INSERT … SELECT` : aucun texte n'est retranscrit, donc aucune faute de recopie possible.
 * Deux tables de correspondance portent le lien ancien → nouveau le temps de l'opération, puis
 * disparaissent — sans elles, les `uuid()` engendrés seraient introuvables pour rattacher les
 * questions à leur nouveau chapitre, et les options à leur nouvelle question.
 *
 * ⚠️ CE QUE CETTE MIGRATION CRÉE, CE SONT DES COPIES INDÉPENDANTES. Corriger une faute dans une
 * question de NIV1 ne la corrigera PAS dans RS7404 ni dans NIV1H : il y aura trois textes à
 * tenir. C'est le prix du modèle actuel, où `quest_chapter.program_id` désigne UNE formation et
 * une seule. Partager une même banque entre plusieurs formations demanderait une table de
 * liaison — un autre chantier, à décider séparément.
 *
 * REJOUABLE SANS RISQUE. Chaque copie est conditionnée à l'absence de chapitre sur la formation
 * cible : relancer le fichier ne duplique rien. C'est aussi ce qui la rend sûre si elle est
 * jouée après que quelqu'un a déjà créé du contenu à la main sur RS7404 ou NIV1H — elle
 * s'abstient plutôt que de mélanger deux banques.
 *
 * LE CHAPITRE D'HYGIÈNE, lui, est écrit ici : il n'existe nulle part à copier. Douze questions
 * sur les fondamentaux de l'hygiène alimentaire en restauration commerciale — HACCP, chaîne du
 * froid, contaminations croisées, allergènes, traçabilité, tenue et santé du personnel. Il est
 * posé sur NIV1H, dont l'intitulé porte l'hygiène, ET sur RS7404, certification
 * professionnelle : quiconque manipule des denrées y est tenu. Il n'est PAS ajouté à NIV1, qui
 * ne la couvre pas — la duplication demandée va de NIV1 vers les autres, pas l'inverse.
 */

/* ── Repères ────────────────────────────────────────────────────────────────────────────── */
/* Les formations sont désignées par leur CODE, pas par un identifiant écrit en dur : le même
   fichier vaut alors pour n'importe quel organisme, et une faute de frappe d'identifiant ne
   peut pas rattacher le contenu à la mauvaise formation. */

CREATE TABLE IF NOT EXISTS _quest_copie_chapitre (
    ancien_chapitre  uuid NOT NULL,
    programme_cible  uuid NOT NULL,
    nouveau_chapitre uuid NOT NULL,
    PRIMARY KEY (ancien_chapitre, programme_cible)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS _quest_copie_question (
    ancienne_question uuid NOT NULL,
    nouveau_chapitre  uuid NOT NULL,
    nouvelle_question uuid NOT NULL,
    PRIMARY KEY (ancienne_question, nouveau_chapitre)
) ENGINE=InnoDB;

DELETE FROM _quest_copie_chapitre;
DELETE FROM _quest_copie_question;

/* ── 1. Quels chapitres copier, et vers quelle formation ────────────────────────────────── */
/* La cible est écartée si elle a DÉJÀ un chapitre : on ne mélange pas deux banques. */
INSERT INTO _quest_copie_chapitre (ancien_chapitre, programme_cible, nouveau_chapitre)
SELECT src.id, cible.id, uuid()
  FROM quest_chapter src
  JOIN training_program niv1
    ON niv1.id = src.program_id AND niv1.code = 'NIV1'
  JOIN training_program cible
    ON cible.organization_id = niv1.organization_id
   AND cible.code IN ('RS7404', 'NIV1H')
 WHERE NOT EXISTS (
     SELECT 1 FROM quest_chapter dejala WHERE dejala.program_id = cible.id
 );

/* ── 2. Les chapitres ───────────────────────────────────────────────────────────────────── */
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order, active)
SELECT m.nouveau_chapitre, src.organization_id, m.programme_cible,
       src.title, src.icon, src.sort_order, src.active
  FROM _quest_copie_chapitre m
  JOIN quest_chapter src ON src.id = m.ancien_chapitre;

/* ── 3. Les questions ───────────────────────────────────────────────────────────────────── */
INSERT INTO _quest_copie_question (ancienne_question, nouveau_chapitre, nouvelle_question)
SELECT q.id, m.nouveau_chapitre, uuid()
  FROM quest_question q
  JOIN _quest_copie_chapitre m ON m.ancien_chapitre = q.chapter_id;

INSERT INTO quest_question
       (id, organization_id, chapter_id, type, text, explanation, source,
        difficulty_id, xp, vf_answer, sort_order, active)
SELECT mq.nouvelle_question, q.organization_id, mq.nouveau_chapitre, q.type, q.text,
       q.explanation, q.source, q.difficulty_id, q.xp, q.vf_answer, q.sort_order, q.active
  FROM _quest_copie_question mq
  JOIN quest_question q ON q.id = mq.ancienne_question;

/* ── 4. Les options (QCM et ASSOC ; une question VF n'en a aucune) ──────────────────────── */
INSERT INTO quest_option (id, question_id, sort_order, text, match_text, is_correct)
SELECT uuid(), mq.nouvelle_question, o.sort_order, o.text, o.match_text, o.is_correct
  FROM _quest_copie_question mq
  JOIN quest_option o ON o.question_id = mq.ancienne_question;

DROP TABLE IF EXISTS _quest_copie_question;
DROP TABLE IF EXISTS _quest_copie_chapitre;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5. LE CHAPITRE « HYGIÈNE ALIMENTAIRE »
 *
 * Écrit ici, faute d'exister ailleurs à copier. Douze questions VRAI/FAUX : le schéma précise
 * qu'une question VF ne porte AUCUNE ligne d'option (la réponse est sur la question elle-même).
 * C'est ce qui rend ce bloc exact — un QCM obligerait à retrouver chaque question par son texte
 * pour y rattacher ses choix, et un caractère de travers rattacherait les options à personne.
 * Des QCM peuvent être ajoutés ensuite depuis l'écran d'administration, qui est fait pour ça.
 *
 * L'EXPLICATION EST OBLIGATOIRE ICI, et pas par formalisme : le commentaire du schéma dit que
 * c'est elle qui « distingue un quiz d'un outil de révision — sans elle le stagiaire retient la
 * bonne case, pas la raison ». Sur de l'hygiène, retenir la raison est tout l'enjeu.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/* Le chapitre, sur NIV1H d'abord — il sera recopié vers RS7404 juste après. */
INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order, active)
SELECT uuid(), p.organization_id, p.id, 'Hygiène alimentaire', 'shield', 900, 1
  FROM training_program p
 WHERE p.code = 'NIV1H'
   AND NOT EXISTS (
       SELECT 1 FROM quest_chapter c
        WHERE c.program_id = p.id AND c.title = 'Hygiène alimentaire'
   );

INSERT INTO quest_question
       (id, organization_id, chapter_id, type, text, explanation, difficulty_id, vf_answer, sort_order, active)
SELECT uuid(), c.organization_id, c.id, 'VF', v.texte, v.pourquoi, d.id, v.reponse, v.rang, 1
  FROM quest_chapter c
  JOIN training_program p ON p.id = c.program_id AND p.code = 'NIV1H'
  LEFT JOIN quest_difficulty d
         ON d.organization_id = c.organization_id AND d.slug = 'facile'
  JOIN (
    SELECT 1 AS rang,
           'Le lavage des mains au savon est obligatoire après chaque passage aux toilettes.' AS texte,
           1 AS reponse,
           'Trente secondes au savon, ongles compris, puis séchage à usage unique. Le passage aux toilettes est le cas le plus évident, mais la règle vaut aussi après avoir touché des déchets, un carton de livraison, son téléphone ou son visage.' AS pourquoi
    UNION ALL SELECT 2,
           'Une denrée réfrigérée peut rester à température ambiante tant qu''elle est encore froide au toucher.',
           0,
           'Le toucher ne mesure rien. Entre +4 °C et +63 °C s''étend la zone où les bactéries se multiplient le plus vite : une pâte ou une garniture sortie « juste un moment » y entre en quelques minutes, sans que rien ne se voie ni ne se sente.'
    UNION ALL SELECT 3,
           'Les denrées les plus périssables se conservent entre 0 °C et +4 °C.',
           1,
           'C''est la chaîne du froid positive. Elle ne tue pas les bactéries, elle les ralentit — d''où l''importance de relever les températures des enceintes et de consigner les écarts, plutôt que de s''en remettre au bruit du groupe froid.'
    UNION ALL SELECT 4,
           'Une planche ayant servi à de la viande crue peut servir aux légumes crus après un simple rinçage à l''eau.',
           0,
           'C''est la contamination croisée : le rinçage déplace les micro-organismes sans les éliminer. Il faut nettoyer ET désinfecter, ou changer de planche. Les légumes crus ne subiront aucune cuisson qui rattraperait l''erreur.'
    UNION ALL SELECT 5,
           'Les quatorze allergènes à déclaration obligatoire doivent être indiqués au client, y compris en vente à emporter.',
           1,
           'L''information est due quel que soit le mode de vente, sur place comme à emporter. Elle peut être écrite sur un support consultable, mais elle doit être disponible sans que le client ait à la demander.'
    UNION ALL SELECT 6,
           'Le gluten ne fait pas partie des allergènes à déclaration obligatoire.',
           0,
           'Les céréales contenant du gluten sont le premier des quatorze allergènes de la liste. Dans une pizzeria, c''est l''ingrédient le plus présent : la farine, la semoule de saupoudrage, et parfois des garnitures panées ou des sauces.'
    UNION ALL SELECT 7,
           'Un plat maintenu au chaud doit être conservé à +63 °C au minimum.',
           1,
           'Au-dessus de +63 °C, la multiplication bactérienne s''arrête. En dessous, le plat entre dans la zone dangereuse et le temps commence à compter : un maintien tiède est plus risqué qu''un refroidissement rapide suivi d''une remise en température.'
    UNION ALL SELECT 8,
           'On peut recongeler un produit décongelé s''il n''est resté sorti qu''une heure.',
           0,
           'Jamais. La décongélation réveille les bactéries et la recongélation ne fait que les figer en plus grand nombre, dans un produit dont la structure a déjà souffert. Un produit décongelé se travaille et se consomme, ou se jette.'
    UNION ALL SELECT 9,
           'La méthode HACCP consiste à maîtriser les points critiques du processus plutôt qu''à contrôler seulement le produit fini.',
           1,
           'Contrôler à la fin ne dit que si l''on a échoué. HACCP identifie les dangers étape par étape — réception, stockage, préparation, cuisson, service — et place la surveillance là où la maîtrise est encore possible.'
    UNION ALL SELECT 10,
           'Les bagues et bracelets sont tolérés en cuisine s''ils sont propres.',
           0,
           'Ils retiennent les résidus sous et autour d''eux, empêchent un lavage correct des mains, et peuvent tomber dans une préparation. Seule l''alliance lisse est généralement admise ; le reste se retire avant le service.'
    UNION ALL SELECT 11,
           'Une personne atteinte de troubles digestifs peut travailler au poste de garniture à condition de porter des gants.',
           0,
           'Les gants ne font pas barrière à une infection digestive : ils se contaminent comme une main et donnent l''illusion de la propreté. Un trouble digestif se signale au responsable, qui écarte la personne des denrées.'
    UNION ALL SELECT 12,
           'La traçabilité impose de conserver les étiquettes des lots de denrées utilisées.',
           1,
           'C''est ce qui permet, en cas d''alerte, de savoir quel lot a été servi et quel jour. Sans étiquette conservée, on ne peut ni répondre à un retrait de produit ni démontrer d''où venait une denrée — et c''est tout l''établissement qui est mis en cause.'
  ) AS v
 WHERE c.title = 'Hygiène alimentaire'
   AND NOT EXISTS (
       SELECT 1 FROM quest_question q WHERE q.chapter_id = c.id
   );

/* ── 6. Le même chapitre, recopié vers RS7404 ───────────────────────────────────────────── */
/* Certification professionnelle : quiconque manipule des denrées est tenu à ces règles. On
   repasse par la copie en base plutôt que de réécrire les douze questions — deux textes à
   maintenir pour un même contenu, ce serait la faute qu'on cherche justement à éviter.

   À QUOI SERT LA TABLE DE CORRESPONDANCE CI-DESSOUS. À relier chaque question d'origine à sa
   copie, pour que ses OPTIONS puissent suivre. Les douze questions écrites plus haut sont
   toutes en VRAI/FAUX et n'en portent aucune — mais si ce chapitre existait déjà, créé à la
   main avec des QCM, ceux-ci seraient copiés SANS leurs choix : des questions à zéro réponse,
   que rien ne signalerait ni à l'écran ni en base. Sans la table, on ne saurait pas quelle
   nouvelle question porte quelles options, `uuid()` étant engendré à la volée. */
CREATE TABLE IF NOT EXISTS _quest_copie_hygiene (
    ancienne_question uuid NOT NULL,
    nouvelle_question uuid NOT NULL,
    PRIMARY KEY (ancienne_question)
) ENGINE=InnoDB;
DELETE FROM _quest_copie_hygiene;

INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order, active)
SELECT uuid(), p.organization_id, p.id, 'Hygiène alimentaire', 'shield', 900, 1
  FROM training_program p
 WHERE p.code = 'RS7404'
   AND NOT EXISTS (
       SELECT 1 FROM quest_chapter c
        WHERE c.program_id = p.id AND c.title = 'Hygiène alimentaire'
   );

INSERT INTO _quest_copie_hygiene (ancienne_question, nouvelle_question)
SELECT q.id, uuid()
  FROM quest_question q
  JOIN quest_chapter c    ON c.id = q.chapter_id AND c.title = 'Hygiène alimentaire'
  JOIN training_program p ON p.id = c.program_id AND p.code = 'NIV1H'
 WHERE EXISTS (
     SELECT 1 FROM quest_chapter c2
       JOIN training_program p2 ON p2.id = c2.program_id AND p2.code = 'RS7404'
      WHERE c2.title = 'Hygiène alimentaire'
        AND NOT EXISTS (SELECT 1 FROM quest_question q2 WHERE q2.chapter_id = c2.id)
 );

INSERT INTO quest_question
       (id, organization_id, chapter_id, type, text, explanation, source,
        difficulty_id, xp, vf_answer, sort_order, active)
SELECT m.nouvelle_question, q.organization_id, cible.id, q.type, q.text, q.explanation, q.source,
       q.difficulty_id, q.xp, q.vf_answer, q.sort_order, q.active
  FROM _quest_copie_hygiene m
  JOIN quest_question q ON q.id = m.ancienne_question
  JOIN quest_chapter cible ON cible.title = 'Hygiène alimentaire'
  JOIN training_program p ON p.id = cible.program_id AND p.code = 'RS7404';

/* Les options, s'il y en a — cf. le commentaire de la table ci-dessus. Rien à copier pour des
   questions VRAI/FAUX ; tout à copier si le chapitre en contenait d'autres. */
INSERT INTO quest_option (id, question_id, sort_order, text, match_text, is_correct)
SELECT uuid(), m.nouvelle_question, o.sort_order, o.text, o.match_text, o.is_correct
  FROM _quest_copie_hygiene m
  JOIN quest_option o ON o.question_id = m.ancienne_question;

DROP TABLE IF EXISTS _quest_copie_hygiene;

/* 102_quest_questions.sql
   Banque de questions de Pizza Quest (phase 2 : contenu), jusqu'ici CODÉE EN DUR dans
   src/app/ui/lib/niv1Questions.js et niv2Questions.js. La sortir du code permet à l'organisme
   de l'amender sans livraison, et à chaque organisme d'avoir la sienne.

   Trois types de questions, tels qu'ils existent déjà dans le jeu :
     · QCM   → plusieurs choix, un seul correct ;
     · VF    → vrai / faux ;
     · ASSOC → associations (« relie chaque force de farine à son usage »).

   Un seul jeu de tables pour les trois : `quest_option` porte `text` (le choix, ou le terme
   de gauche d'une association) et `match_text` (le terme de droite, ASSOC uniquement). Une
   table par type aurait triplé le CRUD pour trois variantes du même objet.

   `vf_answer` est sur la question et pas dans les options : un vrai/faux n'a pas de choix à
   rédiger, seulement une réponse. Deux lignes d'options « Vrai » / « Faux » identiques sur
   chaque question seraient du bruit.

   NOTE — commentaires en blocs, et type `uuid` (natif MariaDB, BINARY(16)) : voir 101. */

/* Difficultés, créées par l'organisme. Elles portent l'XP par défaut : régler « Difficile »
   à 20 XP requalifie d'un coup toutes les questions difficiles, sans les rouvrir une à une.
   La question peut malgré tout surcharger son XP (quest_question.xp). */
CREATE TABLE IF NOT EXISTS quest_difficulty (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    name            VARCHAR(80)  NOT NULL,
    slug            VARCHAR(80)  NOT NULL,
    xp              INT          NOT NULL DEFAULT 10,   /* XP par défaut à ce niveau */
    color           VARCHAR(20)  DEFAULT NULL,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_questdiff_slug (organization_id, slug),
    KEY idx_questdiff_org (organization_id, sort_order),
    CONSTRAINT fk_questdiff_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* Chapitre = une étape sur le chemin d'un monde (« La farine », « Le poolish »).
   `program_id` est NULLABLE : un chapitre non rattaché existe sans être joué, ce qui permet
   d'importer la banque avant même de savoir à quelle formation la relier. */
CREATE TABLE IF NOT EXISTS quest_chapter (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    program_id      uuid         DEFAULT NULL,
    title           VARCHAR(160) NOT NULL,
    icon            VARCHAR(40)  DEFAULT NULL,   /* nom d'icône (cf. components/Icon.jsx) */
    sort_order      INT          NOT NULL DEFAULT 0,
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_questch_org (organization_id, sort_order),
    KEY idx_questch_prog (program_id),
    CONSTRAINT fk_questch_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_questch_prog FOREIGN KEY (program_id)
        REFERENCES training_program (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS quest_question (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    chapter_id      uuid         NOT NULL,
    type            ENUM('QCM','VF','ASSOC') NOT NULL DEFAULT 'QCM',
    text            TEXT         NOT NULL,
    /* Le POURQUOI, affiché après la réponse. C'est ce qui distingue un quiz d'un outil de
       révision : sans lui le stagiaire retient la bonne case, pas la raison. */
    explanation     TEXT         DEFAULT NULL,
    source          VARCHAR(255) DEFAULT NULL,   /* renvoi au manuel (page, chapitre) */
    difficulty_id   uuid         DEFAULT NULL,
    /* XP de la question. NULL = on prend celui de la difficulté ; une valeur ici la surcharge. */
    xp              INT          DEFAULT NULL,
    vf_answer       TINYINT(1)   DEFAULT NULL,   /* VF uniquement : 1 = vrai, 0 = faux */
    sort_order      INT          NOT NULL DEFAULT 0,
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_questq_ch (chapter_id, sort_order),
    KEY idx_questq_org (organization_id),
    CONSTRAINT fk_questq_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_questq_ch FOREIGN KEY (chapter_id)
        REFERENCES quest_chapter (id) ON DELETE CASCADE,
    CONSTRAINT fk_questq_diff FOREIGN KEY (difficulty_id)
        REFERENCES quest_difficulty (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* QCM   : une ligne par choix ; is_correct = 1 sur le bon.
   ASSOC : une ligne par paire ; `text` = terme de gauche, `match_text` = terme de droite.
   VF    : aucune ligne (la réponse est sur la question). */
CREATE TABLE IF NOT EXISTS quest_option (
    id          uuid         NOT NULL DEFAULT uuid(),
    question_id uuid         NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    text        VARCHAR(500) NOT NULL,
    match_text  VARCHAR(500) DEFAULT NULL,
    is_correct  TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_questopt_q (question_id, sort_order),
    CONSTRAINT fk_questopt_q FOREIGN KEY (question_id)
        REFERENCES quest_question (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

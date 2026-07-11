-- 063_quiz_grid_rows.sql
-- Questions « grille » (matrice) : les COLONNES réutilisent quiz_option ; les LIGNES
-- sont stockées ici. Types de question ajoutés côté appli : GRID_SINGLE (une réponse
-- par ligne) et GRID_MULTI (plusieurs réponses par ligne).
CREATE TABLE IF NOT EXISTS quiz_row (
    id          uuid         NOT NULL DEFAULT uuid(),
    question_id uuid         NOT NULL,
    position    int          NOT NULL DEFAULT 0,
    text        varchar(500) NOT NULL,
    correct     varchar(255) DEFAULT NULL,  -- JSON des positions de colonnes correctes (QCM noté), sinon NULL
    PRIMARY KEY (id),
    KEY idx_quizrow_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Étend l'enum des types de question (si la colonne est un enum strict).
ALTER TABLE quiz_question
    MODIFY COLUMN type enum('SINGLE','MULTI','SCALE','GRID_SINGLE','GRID_MULTI') NOT NULL DEFAULT 'SINGLE';

-- 020_quiz.sql
-- Module QCM : questionnaires rattachés à une étape documentaire d'une formation,
-- remplis par le stagiaire dans son espace. Types QCU / QCM / échelle ; mode noté
-- (GRADED) ou enquête (SURVEY, ex. satisfaction).

CREATE TABLE IF NOT EXISTS quiz (
    id               uuid         NOT NULL DEFAULT uuid(),
    organization_id  uuid         NOT NULL,
    program_id       uuid         DEFAULT NULL,        -- formation concernée
    slug             varchar(60)  DEFAULT NULL,        -- étape documentaire remplacée (ex. test-positionnement)
    title            varchar(255) NOT NULL,
    kind             enum('GRADED','SURVEY') NOT NULL DEFAULT 'GRADED',
    pass_score       int          DEFAULT NULL,        -- % minimum pour réussir (GRADED)
    active           tinyint(1)   NOT NULL DEFAULT 1,
    created_at       timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_quiz_org (organization_id),
    KEY idx_quiz_prog (program_id, slug),
    CONSTRAINT fk_quiz_org FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_quiz_prog FOREIGN KEY (program_id) REFERENCES training_program (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS quiz_question (
    id          uuid         NOT NULL DEFAULT uuid(),
    quiz_id     uuid         NOT NULL,
    position    int          NOT NULL DEFAULT 0,
    text        text         NOT NULL,
    type        enum('SINGLE','MULTI','SCALE') NOT NULL DEFAULT 'SINGLE',
    scale_max   int          NOT NULL DEFAULT 5,       -- échelle 1..scale_max
    points      int          NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY idx_qq_quiz (quiz_id, position),
    CONSTRAINT fk_qq_quiz FOREIGN KEY (quiz_id) REFERENCES quiz (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS quiz_option (
    id           uuid         NOT NULL DEFAULT uuid(),
    question_id  uuid         NOT NULL,
    position     int          NOT NULL DEFAULT 0,
    text         varchar(500) NOT NULL,
    is_correct   tinyint(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_qo_q (question_id, position),
    CONSTRAINT fk_qo_q FOREIGN KEY (question_id) REFERENCES quiz_question (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS quiz_response (
    id               uuid       NOT NULL DEFAULT uuid(),
    organization_id  uuid       NOT NULL,
    quiz_id          uuid       NOT NULL,
    learner_id       uuid       DEFAULT NULL,
    enrollment_id    uuid       DEFAULT NULL,
    document_id      uuid       DEFAULT NULL,
    score            int        DEFAULT NULL,
    max_score        int        DEFAULT NULL,
    completed_at     timestamp  NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_qr_quiz (quiz_id),
    KEY idx_qr_learner (learner_id),
    CONSTRAINT fk_qr_quiz FOREIGN KEY (quiz_id) REFERENCES quiz (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS quiz_answer (
    id           uuid         NOT NULL DEFAULT uuid(),
    response_id  uuid         NOT NULL,
    question_id  uuid         NOT NULL,
    value        varchar(255) DEFAULT NULL,            -- ids d'options (CSV) ou valeur d'échelle
    PRIMARY KEY (id),
    KEY idx_qa_resp (response_id),
    CONSTRAINT fk_qa_resp FOREIGN KEY (response_id) REFERENCES quiz_response (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

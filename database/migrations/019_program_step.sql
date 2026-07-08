-- 019_program_step.sql
-- Parcours documentaire par formation : quels documents (étapes) sont inclus et
-- dans quel ordre pour une formation donnée. Si une formation n'a aucune ligne,
-- on retombe sur les étapes par défaut applicables (rs / hygiène / jours).

CREATE TABLE IF NOT EXISTS program_step (
    id               uuid       NOT NULL DEFAULT uuid(),
    organization_id  uuid       NOT NULL,
    program_id       uuid       NOT NULL,
    slug             varchar(60) NOT NULL,
    sort_order       int        NOT NULL DEFAULT 100,
    active           tinyint(1) NOT NULL DEFAULT 1,
    created_at       timestamp  NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_progstep (program_id, slug),
    KEY idx_progstep_org (organization_id),
    CONSTRAINT fk_progstep_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_progstep_prog FOREIGN KEY (program_id)
        REFERENCES training_program (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

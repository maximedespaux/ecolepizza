-- 048_condition_fields.sql
-- Champs du dossier activés comme « conditions » (Réglages → Champs du dossier).
-- Une ligne par colonne personnalisée : activation + libellé optionnel. L'absence
-- de ligne = valeur par défaut (cf. DEFAULT_ENABLED côté serveur).
CREATE TABLE IF NOT EXISTS condition_field (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    source_table    varchar(64)  NOT NULL,           -- learner | enrollment | training_program | training_session | company | virtual
    column_name     varchar(64)  NOT NULL,           -- nom de colonne (ou champ virtuel : age, has_company)
    enabled         tinyint(1)   NOT NULL DEFAULT 1,
    label           varchar(160) DEFAULT NULL,       -- libellé personnalisé (sinon commentaire de colonne)
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_condfield_org_col (organization_id, source_table, column_name),
    KEY idx_condfield_org (organization_id),
    CONSTRAINT fk_condfield_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 027_archive_document.sql
-- Coffre documentaire : documents historiques importés (PDF), stockés en base et
-- classés par année / semaine / formation / stagiaire (libellés texte, sans lier
-- de fiche stagiaire ni de session). Affichés dans Suivi Qualiopi → Archives.
CREATE TABLE IF NOT EXISTS archive_document (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    year            int          DEFAULT NULL,
    week            int          DEFAULT NULL,
    formation_label varchar(255) DEFAULT NULL,
    learner_name    varchar(255) DEFAULT NULL,
    title           varchar(255) NOT NULL,
    status          varchar(20)  NOT NULL DEFAULT 'ARCHIVE',
    mime            varchar(100) DEFAULT 'application/pdf',
    file            longblob     DEFAULT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_archdoc_org (organization_id),
    CONSTRAINT fk_archdoc_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
);

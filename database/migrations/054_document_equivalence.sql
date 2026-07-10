-- 054_document_equivalence.sql
-- Équivalences de documents : ensembles de modèles alternatifs (« OU »), choisis
-- selon la condition propre de chaque document. Unique source de vérité du « OU »
-- (parcours, tableau de session, arborescence d'archivage).
CREATE TABLE IF NOT EXISTS document_equivalence (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    label           varchar(160) DEFAULT NULL,          -- intitulé affiché (ex. « Contrat / Convention »)
    members         longtext     NOT NULL,              -- JSON : tableau de slugs de modèles alternatifs
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_equiv_org (organization_id),
    CONSTRAINT fk_equiv_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 058_emargement_template.sql
-- Modèles de feuille d'émargement multiples par organisme (mise en page réutilisable,
-- rattachable au parcours documentaire d'une formation comme un document).
-- + logo d'organisme (affichable dans l'en-tête de l'émargement).
CREATE TABLE IF NOT EXISTS emargement_template (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    slug            varchar(60)  NOT NULL,             -- identifiant d'étape (parcours) unique par organisme
    name            varchar(255) NOT NULL,             -- intitulé affiché
    config          longtext     DEFAULT NULL,         -- mise en page JSON (orientation, colonnes, en-tête…)
    active          tinyint(1)   NOT NULL DEFAULT 1,
    sort_order      int          DEFAULT 100,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_emargtpl_org_slug (organization_id, slug),
    KEY idx_emargtpl_org (organization_id),
    CONSTRAINT fk_emargtpl_org FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS logo_image longtext DEFAULT NULL;

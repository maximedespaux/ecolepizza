-- 047_document_conditions.sql
-- Conditions personnalisées d'application des documents (Modeles → Conditions).
-- Chaque condition = un champ RÉEL du dossier + un opérateur + une valeur ;
-- les étapes documentaires les référencent par `slug` dans applies_when.conditions.
CREATE TABLE IF NOT EXISTS document_condition (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    slug            varchar(60)  NOT NULL,           -- identifiant court (référencé par les modèles)
    label           varchar(160) NOT NULL,           -- intitulé lisible
    field           varchar(60)  NOT NULL,           -- clé du champ (cf. FIELD_CATALOG)
    op              varchar(20)  NOT NULL,           -- opérateur (eq, ne, in, lt, ge, is_true…)
    value           longtext     DEFAULT NULL,       -- valeur (JSON : chaîne, nombre, booléen ou tableau)
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_condition_org_slug (organization_id, slug),
    KEY idx_condition_org (organization_id),
    CONSTRAINT fk_condition_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 033_opco.sql
-- Référentiel OPCO / financeurs (un enregistrement par OPCO), avec coordonnées.
-- Rempli automatiquement pour chaque organisme au premier accès (valeurs par défaut),
-- puis modifiable. `triggers_assiduite` = déclenche l'attestation d'assiduité (ex. AGEFICE).
CREATE TABLE IF NOT EXISTS opco (
    id                 uuid         NOT NULL DEFAULT uuid(),
    organization_id    uuid         NOT NULL,
    code               varchar(40)  DEFAULT NULL,
    name               varchar(160) NOT NULL,
    address            varchar(255) DEFAULT NULL,
    zip_code           varchar(10)  DEFAULT NULL,
    town               varchar(120) DEFAULT NULL,
    email              varchar(255) DEFAULT NULL,
    phone              varchar(30)  DEFAULT NULL,
    website            varchar(160) DEFAULT NULL,
    triggers_assiduite tinyint(1)   NOT NULL DEFAULT 0,
    active             tinyint(1)    NOT NULL DEFAULT 1,
    sort_order         int           NOT NULL DEFAULT 100,
    created_at         timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_opco_org (organization_id),
    CONSTRAINT fk_opco_org FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE
);

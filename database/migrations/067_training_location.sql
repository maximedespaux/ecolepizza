-- 067_training_location.sql
-- Lieux de formation d'un organisme (plusieurs adresses possibles). Une session se
-- déroule dans un lieu (training_session.location_id). Les colonnes du lieu sont
-- disponibles comme jetons de document (field:location.<colonne>).
CREATE TABLE IF NOT EXISTS training_location (
    id CHAR(36) NOT NULL PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    name VARCHAR(160) NOT NULL,
    address VARCHAR(255) NULL,
    zip_code VARCHAR(10) NULL,
    town VARCHAR(120) NULL,
    sort_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_training_location_org (organization_id)
);

ALTER TABLE training_session
    ADD COLUMN IF NOT EXISTS location_id CHAR(36) NULL DEFAULT NULL;

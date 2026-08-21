-- 014_carte_levels.sql
-- Carte des stagiaires : géolocalisation précise (coordonnées par stagiaire) et
-- niveau par formation (code couleur). Ordre d'affichage des formations.
-- Idempotent (MariaDB 10.2+).

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS lat           decimal(9,6) DEFAULT NULL AFTER town,
    ADD COLUMN IF NOT EXISTS lng           decimal(9,6) DEFAULT NULL AFTER lat,
    ADD COLUMN IF NOT EXISTS geo_precision varchar(20)  DEFAULT NULL AFTER lng,   -- housenumber|street|locality|municipality
    ADD COLUMN IF NOT EXISTS geocoded_at   timestamp    NULL DEFAULT NULL AFTER geo_precision;

ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS level      varchar(20) DEFAULT NULL AFTER code,   -- NIV1|NIV1_PRO|NIV2|EXPERT|RS
    ADD COLUMN IF NOT EXISTS sort_order int         NOT NULL DEFAULT 100 AFTER active;

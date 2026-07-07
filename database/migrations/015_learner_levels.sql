-- 015_learner_levels.sql
-- Étiquettes de niveau/accès du stagiaire (plusieurs possibles), gérées par le
-- secrétariat depuis la fiche. Stockées en liste CSV de codes (NIV1,NIV1_PRO,…).
-- Sert au classement et au code couleur de la carte.
-- Idempotent (MariaDB 10.2+).

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS levels varchar(120) DEFAULT NULL AFTER professional_status;

-- 035_access_profile_color.sql
-- Couleur d'identification d'un rôle d'accès (pastille).
ALTER TABLE access_profile
    ADD COLUMN IF NOT EXISTS color varchar(9) DEFAULT NULL AFTER name;

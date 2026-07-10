-- 058_revert_emargement_template.sql — ROLLBACK MANUEL.
ALTER TABLE organization DROP COLUMN IF EXISTS logo_image;
DROP TABLE IF EXISTS emargement_template;

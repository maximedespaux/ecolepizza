-- 057_revert_org_emargement_config.sql — ROLLBACK MANUEL.
ALTER TABLE organization DROP COLUMN IF EXISTS emargement_config;

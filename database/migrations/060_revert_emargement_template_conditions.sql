-- 060_revert_emargement_template_conditions.sql — ROLLBACK MANUEL.
ALTER TABLE emargement_template DROP COLUMN IF EXISTS applies_when;

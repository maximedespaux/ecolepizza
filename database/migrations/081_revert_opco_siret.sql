-- 081_revert_opco_siret.sql — ROLLBACK MANUEL.
ALTER TABLE opco DROP COLUMN IF EXISTS siret;

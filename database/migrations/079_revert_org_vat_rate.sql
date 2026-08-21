-- 079_revert_org_vat_rate.sql — ROLLBACK MANUEL.
ALTER TABLE organization DROP COLUMN IF EXISTS vat_rate;

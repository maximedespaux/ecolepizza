-- 080_revert_condition_field_purposes.sql — ROLLBACK MANUEL.
ALTER TABLE condition_field DROP COLUMN IF EXISTS enabled_condition;

-- 076_revert_emargement_break_position.sql — ROLLBACK MANUEL.
ALTER TABLE organization DROP COLUMN IF EXISTS emargement_break_order;

-- 073_revert_recipe_dough_params.sql — ROLLBACK MANUEL.
ALTER TABLE recipe DROP COLUMN IF EXISTS dough_params;

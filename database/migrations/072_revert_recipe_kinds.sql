-- 072_revert_recipe_kinds.sql — ROLLBACK MANUEL.
ALTER TABLE recipe DROP INDEX IF EXISTS idx_recipe_kind;
ALTER TABLE recipe_ingredient DROP COLUMN IF EXISTS component_recipe_id;
ALTER TABLE recipe
    DROP COLUMN IF EXISTS kind,
    DROP COLUMN IF EXISTS yield_qty,
    DROP COLUMN IF EXISTS yield_unit;

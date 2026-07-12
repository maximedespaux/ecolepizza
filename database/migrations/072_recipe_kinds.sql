-- 072_recipe_kinds.sql
-- Fiches techniques typées + composition : une fiche est une PÂTE, une PRÉPARATION
-- (ex. sauce tomate) ou une RECETTE (pizza complète). Une recette peut « importer »
-- une pâte/préparation comme ingrédient (recipe_ingredient.component_recipe_id), au
-- coût unitaire de la fiche importée (rendement = quantité + unité produite).
ALTER TABLE recipe
    ADD COLUMN IF NOT EXISTS kind ENUM('PATE','PREPARATION','RECETTE') NOT NULL DEFAULT 'RECETTE',
    ADD COLUMN IF NOT EXISTS yield_qty  DECIMAL(10,3) NULL DEFAULT NULL,   -- rendement : quantité produite
    ADD COLUMN IF NOT EXISTS yield_unit VARCHAR(20)   NULL DEFAULT NULL;   -- g | kg | ml | l | piece | pâton | portion

ALTER TABLE recipe_ingredient
    ADD COLUMN IF NOT EXISTS component_recipe_id CHAR(36) NULL DEFAULT NULL; -- fiche importée (pâte/préparation)

ALTER TABLE recipe ADD INDEX IF NOT EXISTS idx_recipe_kind (organization_id, kind);

-- 073_recipe_dough_params.sql
-- Le calculateur de pâte (ex-« Atelier pâte ») est intégré dans la fiche technique de type
-- PÂTE. On mémorise ses réglages en pourcentage boulanger (typologie, empâtement, autolyse,
-- hydratation, sel, huile, levure) pour que la pâte enregistrée/partagée garde sa recette
-- exacte. `addPct` (1 + (hydra+sel+huile+levure)/100) sert au calcul du poids de farine.
ALTER TABLE recipe
    ADD COLUMN IF NOT EXISTS dough_params JSON NULL DEFAULT NULL;

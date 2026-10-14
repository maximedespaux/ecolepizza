/*
  Revert de la 208 : retire la colonne `recipe.allergens`. Les allergènes saisis sont perdus ;
  l'écran et l'impression cessent d'en afficher. Sans autre effet. Rejouable (IF EXISTS).
*/
ALTER TABLE recipe DROP COLUMN IF EXISTS allergens;

/*
  Revert de la 209 : retire les colonnes `applies_when` des deux référentiels.

  Les conditions posées sur des pièces / remises sont PERDUES (elles ne vivent que là) ; les types
  eux-mêmes, leurs dépôts et leurs accusés de réception ne sont PAS touchés. Le parcours revient à
  son comportement d'avant : une pièce / remise active est proposée sans filtre de type (seule
  reste la condition PAR FORMATION, migration 140). Rejouable sans risque.
*/
ALTER TABLE piece_type  DROP COLUMN IF EXISTS applies_when;
ALTER TABLE remise_type DROP COLUMN IF EXISTS applies_when;

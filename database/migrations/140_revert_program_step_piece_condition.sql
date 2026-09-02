/* 140_revert_program_step_piece_condition.sql

   Retire la condition « OU » par formation des pièces à fournir. Sans risque : la colonne
   n'était lue qu'en cascade (le code retombe sur une lecture sans elle), et seules les étapes
   « pièce » regroupées en « OU » l'utilisaient. Après revert, un tel groupe garde sa PREMIÈRE
   variante par défaut (plus de sélection par condition). */
ALTER TABLE program_step
    DROP COLUMN IF EXISTS applies_when;

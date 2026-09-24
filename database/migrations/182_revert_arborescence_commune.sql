/*
  182_revert_arborescence_commune.sql

  CE QUI SE PERD : l'arborescence commune enregistrée (stagiaire et entreprise). Rien d'autre —
  les arborescences de chaque formation (colonnes de 053 et 083) n'ont jamais été touchées par la
  182, et l'export se remet à les suivre, formation par formation, dès ce revert joué.

  Les archives ZIP déjà téléchargées gardent évidemment la forme qu'elles avaient.
*/

ALTER TABLE organization
    DROP COLUMN IF EXISTS archive_tree,
    DROP COLUMN IF EXISTS company_archive_tree;

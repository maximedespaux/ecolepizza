/*
  181_revert_intervenant_horaires.sql

  CE QUI SE PERD : les heures saisies pour chaque demi-journée d'intervenant externe, et elles
  seules. Les affectations et les demi-journées cochées restent intactes, ainsi que les
  signatures déjà déposées.

  Les feuilles d'émargement déjà GÉNÉRÉES en PDF gardent les heures qu'elles portaient : elles
  sont figées au moment de la signature. Seules les feuilles régénérées après ce revert
  repasseront à une case muette, comme avant la 181.
*/

ALTER TABLE session_intervenant_slot
    DROP COLUMN IF EXISTS heure_debut,
    DROP COLUMN IF EXISTS heure_fin;

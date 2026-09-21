/* 168_revert_stagiaire_note_libre.sql
   RETIRE la note libre des fiches stagiaires (migration 168).

   ATTENTION, LES NOTES SAISIES SONT PERDUES : la colonne part avec son contenu, et rien ne la
   conserve ailleurs. Le code d'avant comme celui d'après fonctionnent sans elle — la fiche
   s'enregistre, et dit que la note n'a pas été prise. */

ALTER TABLE learner
    DROP COLUMN IF EXISTS note_libre;

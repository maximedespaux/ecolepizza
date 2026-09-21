/* 169_revert_stagiaire_a_recontacter.sql
   RETIRE le rappel « à recontacter » des fiches stagiaires (migration 169).

   ATTENTION, LES RAPPELS EN COURS SONT PERDUS : la liste de qui attendait un appel part avec les
   colonnes, et rien ne la conserve ailleurs. Le code d'avant comme celui d'après fonctionnent sans
   elles — la fiche s'enregistre et dit que la case n'a pas été prise, la pastille disparaît. */

ALTER TABLE learner
    DROP COLUMN IF EXISTS a_recontacter_depuis,
    DROP COLUMN IF EXISTS a_recontacter;

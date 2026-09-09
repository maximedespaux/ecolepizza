/*
 * Revert de la 143. La colonne porte un texte saisi par l'organisme : le perdre, c'est perdre
 * la formulation exacte des prérequis de chaque formation, qu'aucune autre colonne ne double.
 * À ne jouer que si la 143 vient d'être passée par erreur, avant toute saisie.
 */
ALTER TABLE training_program
    DROP COLUMN IF EXISTS prerequisites;

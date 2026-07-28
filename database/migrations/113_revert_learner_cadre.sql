/* 113_revert_learner_cadre.sql
   Retour arriere de 113.

   ATTENTION : les cadres EXCLUSIFS accordes (Champion, Jury, Fondateur) sont DETRUITS. Ils
   ne se recalculent pas — contrairement aux cadres de parcours, qui se deduisent a tout
   moment de `completed_levels`. Il faudra les reattribuer un par un.

   Les choix de cadre, eux, sont sans gravite : chaque navigateur garde le sien en
   localStorage, et le front retombe sur le cadre de parcours.

   A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE learner
    DROP COLUMN IF EXISTS cadres_exclusifs;

ALTER TABLE learner
    DROP COLUMN IF EXISTS cadre;

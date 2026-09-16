/* 156_revert_qcm_hors_parcours.sql

   ⚠ MÊME AVERTISSEMENT QUE LA 155 : sans la colonne, le code retombe sur l'ancien défaut et les
   QCM créés depuis réapparaissent d'un coup dans tous les parcours. Rien n'est perdu comme
   donnée ; c'est l'intention qui l'est.

   Pour relever les QCM concernés AVANT de reverter :
     SELECT id, title FROM quiz WHERE parcours_defaut = 0; */

ALTER TABLE quiz
    DROP COLUMN IF EXISTS parcours_defaut;

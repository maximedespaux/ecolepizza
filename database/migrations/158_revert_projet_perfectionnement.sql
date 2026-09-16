/* 158_revert_projet_perfectionnement.sql
   Retire la case « Perfectionnement ».

   ⚠️ CE REVERT PERD DES DONNEES : chaque fiche ayant coche la case oublie ce choix, et rien ne
   permettra de le retrouver. Ce n'est pas une colonne technique, c'est une reponse donnee par
   un stagiaire. Ne le jouer que si la 158 vient d'etre jouee par erreur.

   `IF EXISTS` -> rejouable sans risque. */

ALTER TABLE learner
    DROP COLUMN IF EXISTS project_improvement;

/* 193_revert_memo_fichiers.sql

   Retire les pièces jointes des mémos (la table `memo_fichier`).

   ⚠️ CE QUI SE PERD : toutes les pièces jointes, et elles seules. Les mémos gardent leur texte,
   leur échéance, leurs liens et leur partage. Le bouton « Joindre » disparaît de l'écran, et un
   mémo envoyé avec un fichier est de nouveau refusé en entier.

   Sans risque si la 193 n'a jamais été jouée. */
DROP TABLE IF EXISTS memo_fichier;

/* 170_revert_france_travail_chiffre.sql
   CE REVERT NE RÉTRÉCIT PAS LA COLONNE, et c'est voulu.

   Revenir à 60 caractères couperait chaque identifiant chiffré (environ 80 caractères) : hors mode
   strict, sans la moindre erreur, et un chiffré coupé ne se rouvre JAMAIS. Une colonne plus large
   ne gêne en rien l'ancien code, qui y lit et écrit du clair comme avant.

   POUR REVENIR AUX IDENTIFIANTS EN CLAIR, c'est l'outil, AVANT de remettre l'ancien code
     sudo -u impastio node database/tools/chiffrer-france-travail.js --dechiffrer
   (l'ancien code afficherait sinon « enc:… » sur la fiche et sur les documents).

   L'instruction ci-dessous ne fait rien : certains outils refusent un fichier fait uniquement de
   commentaires (« Query was empty »). */

DO 0;

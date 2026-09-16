/* 158_projet_perfectionnement.sql
   « Perfectionnement » — la sixième case de « Votre projet ».

   POURQUOI. Les cinq cases existantes disent toutes un projet de CHANGEMENT : créer, reprendre,
   s'équiper d'un four, d'un camion, ou chercher un poste. Il manquait le cas de qui EXERCE DEJA
   et vient se perfectionner. Faute de case, ces stagiaires ressortaient avec zero projet coche —
   indiscernables de ceux qui n'avaient rien rempli. Or le projet sert aux conditions de
   documents (`learner.project_*`) et part dans la transmission aux partenaires : une case qui
   manque n'est pas une gene d'affichage, c'est une donnee fausse.

   TINYINT(1) NOT NULL DEFAULT 0, exactement comme ses cinq voisines : une case non cochee vaut
   0, jamais NULL. Les fiches existantes prennent donc 0 — ce qui est juste, personne n'a pu
   cocher une case qui n'existait pas.

   LE CODE MARCHE AVANT ET APRES. La liste blanche d'ecriture est filtree sur les colonnes que
   la table PORTE (`learner.controller.js`), et les deux `SELECT` du consentement passent par
   `colonneOuNull`. Sans la colonne, la case n'est simplement pas enregistree ; avec, tout
   fonctionne sans redemarrage — `colonneExiste` ne met rien en cache, precisement pour ca. */

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS project_improvement TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Projet : perfectionnement (deja en exercice). Cf. migration 158.';

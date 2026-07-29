/* 113_learner_cadre.sql
   Le cadre d'avatar : celui qu'on CHOISIT, et ceux que l'ecole ACCORDE.

   POURQUOI. Les cadres remplacent l'XP et les coeurs depuis le 2026-07-28 : ils recompensent
   les formations reellement terminees, pas le temps passe dans le jeu de QCM. Deux manques
   subsistaient, tous deux faute de colonne.

   1. LE CHOIX N'EXISTAIT QUE DANS LE NAVIGATEUR. Un stagiaire qui possede Bronze, Argent, Or
      et Braise choisit celui qu'il porte — le dernier obtenu n'est pas forcement celui qu'il
      prefere montrer. Ce choix vivait en localStorage : personne d'autre ne pouvait le
      connaitre, si bien que la Communaute affichait a tous son cadre de PARCOURS. Le stagiaire
      voyait donc son choix chez lui et l'ancien cadre partout ailleurs.

      `cadre` porte l'identifiant choisi (« bronze », « braise », « maestro », « aucun »…),
      exactement comme `avatar` porte l'identifiant d'avatar depuis la 070. Meme colonne, meme
      forme, meme route d'ecriture : c'est deja le canal qui fonctionne.

      NULL = pas de choix exprime → le front retombe sur le cadre de parcours. Ce n'est PAS la
      meme chose que « aucun », qui est un choix : ne rien porter.

   2. LES CADRES EXCLUSIFS N'AVAIENT AUCUNE SOURCE. Champion (podium du Championnat de France),
      Jury (avoir siege au jury d'un concours) et Fondateur (premiere promotion) ne s'obtiennent
      pas en cumulant : ils se RECOIVENT. Le front les affichait donc tous verrouilles, avec
      leur condition en clair — un objectif visible vaut mieux qu'une case cachee, mais aucun
      ecran ne permettait de les accorder.

      `cadres_exclusifs` est une liste separee par des virgules, sur le modele exact de
      `learner.levels` et `learner.completed_levels` : c'est l'idiome deja en place pour « ce
      que cette personne a obtenu ». Pas de table de liaison pour trois valeurs cosmetiques
      qu'une poignee de stagiaires porteront.

   AUCUNE des deux colonnes ne debloque quoi que ce soit : un cadre est purement decoratif.
   Une donnee fausse ici n'ouvre aucun droit, elle affiche un mauvais anneau.

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS cadre VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'Cadre d avatar choisi (id, cf. ui/lib/cadres.js). NULL = pas de choix, on retombe sur le palier.';

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS cadres_exclusifs VARCHAR(120) NULL DEFAULT NULL
    COMMENT 'Cadres exclusifs accordes par l ecole, separes par des virgules (champion,jury,fondateur).';

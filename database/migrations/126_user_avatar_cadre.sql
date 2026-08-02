/* 126_user_avatar_cadre.sql
   L'avatar et le cadre du PERSONNEL de l'organisme.

   POURQUOI MAINTENANT. L'avatar et le cadre existaient deja, mais sur `learner` — ils etaient
   nes cote stagiaire, avec la progression. Tant que seul l'espace stagiaire ouvrait la
   Communaute, cela suffisait. Depuis que l'ecole y entre par son propre menu et y publie des
   annonces, ses publications s'affichent avec des initiales sur fond gris : un membre du bureau
   n'a pas de fiche `learner`, donc pas d'avatar, donc rien a montrer. Sur un fil ou chacun se
   reconnait a sa pizza, l'ecole etait la seule silhouette anonyme.

   POURQUOI SUR `user` ET NON UNE FICHE `learner` FACTICE. Creer un stagiaire fantome pour
   chaque secretaire polluerait les effectifs, les statistiques Qualiopi, les exports et les
   listes de session. L'avatar appartient au COMPTE, pas au parcours de formation.

   `cadre` — le personnel ne porte PAS les cadres de parcours (Bronze -> Maestro) : ceux-la
   annoncent un nombre de formations terminees, et un secretariat en « Maestro » se lirait comme
   un stagiaire chevronne. Un cadre `ecole` leur est reserve (cf. lib/cadres.js) ; la colonne
   accepte n'importe quelle valeur connue pour ne pas se fermer a un futur cadre de personnel,
   c'est le code qui decide de ce qui est portable par qui.

   NULL = aucun choix exprime. Pour l'avatar, l'affichage retombe sur les initiales, comme
   aujourd'hui. Le code fonctionne AVANT comme APRES : les ecritures sont dans un try/catch sur
   ER_BAD_FIELD_ERROR (cf. `isMissingSchema`), et la lecture passe par un SELECT en cascade qui
   se rabat sur `id` seul si les colonnes n'existent pas encore.

   Meme forme que `learner.avatar` : "id" ou "id|#rrggbb" (l'emoji et la couleur de fond).

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE user
    ADD COLUMN IF NOT EXISTS avatar varchar(40) DEFAULT NULL
    COMMENT 'Avatar du compte : "id" ou "id|#rrggbb". NULL = initiales.';

ALTER TABLE user
    ADD COLUMN IF NOT EXISTS cadre varchar(20) DEFAULT NULL
    COMMENT 'Cadre porte autour de l''avatar. NULL = aucun choix exprime.';

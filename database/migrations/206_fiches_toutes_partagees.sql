/*
  TOUTES LES FICHES TECHNIQUES SUR LA COMMUNAUTÉ (demandé le 2026-10-13 — FACULTATIVE).

  Le code publie désormais toute fiche À SA CRÉATION (`recipe.visibility = 'SHARED'`) et ne touche
  plus la visibilité à la modification : il n'y a plus de choix « privée / partagée » côté auteur.
  Mais les fiches DÉJÀ en base qui étaient privées le restent (le code ne les republie pas toutes
  seules). Cette migration les passe en « partagée », pour que l'état colle à la règle « tout est
  sur la communauté ».

  FACULTATIVE : le code marche sans elle — les NOUVELLES fiches sont partagées de toute façon. À
  jouer seulement si l'école veut publier AUSSI les fiches encore privées.

  ⚠️ ELLE EXPOSE du contenu que des stagiaires avaient gardé PRIVÉ — à décider en connaissance de
  cause. Une fiche RETIRÉE du fil par la modération (repassée en privée) serait republiée elle
  aussi : à jouer quand aucune n'est en attente de retrait.
*/
UPDATE recipe SET visibility = 'SHARED' WHERE visibility = 'PRIVATE';

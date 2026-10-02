/* CE QUI SE PERD : l'historique des connexions par jour — la COURBE « connexions dans le temps »
   de la page Statistiques. `user.last_login_at` reste, donc la répartition par récence, elle, marche
   toujours. Les connexions recommenceront à être comptées si la table est recréée. */
DROP TABLE IF EXISTS connexion_jour;

/* 106_community_seen.sql
   Pastille « nouveautés » de la Communauté : une date de dernière visite par utilisateur.

   POURQUOI UNE DATE, ET PAS UN MARQUEUR PAR COMMENTAIRE
   Une table de lecture (un enregistrement par commentaire et par lecteur) serait plus fine :
   elle saurait dire quels commentaires précis restent à voir. Elle coûterait aussi une
   écriture par commentaire affiché, une ligne par couple, et une purge à prévoir. Une seule
   date par utilisateur répond à la question réellement posée — « y a-t-il du nouveau depuis
   ma dernière visite ? » — pour une colonne et zéro entretien. Le comptage se fait à la
   volée, comme pending_docs le fait déjà pour les documents en attente.

   CE QU'ELLE NE SAIT PAS FAIRE, ASSUMÉ : ouvrir la Communauté marque TOUT comme vu, y
   compris ce qu'on n'a pas lu. C'est le compromis d'une date unique. Si un jour la pastille
   doit ne retomber que sur les fiches réellement ouvertes, il faudra la table de lecture —
   cette colonne resterait alors comme repli.

   SUR user PLUTÔT QUE learner : les commentaires et les fiches sont rattachés à user.id
   (recipe.author_user_id, recipe_comment.user_id), pas à learner.id. Poser la date ailleurs
   imposerait une jointure de plus à chaque calcul, et laisserait sans pastille un
   commentateur qui n'est pas stagiaire.

   NULL = jamais venu. Le comptage traite ce cas comme « tout est nouveau », ce qui est le
   comportement voulu pour une première visite.

   Commentaires en blocs : mêmes raisons qu'en 101/102 (les `--` avalent le fichier quand le
   presse-papier aplatit les retours à la ligne). */

ALTER TABLE user
    ADD COLUMN IF NOT EXISTS community_seen_at datetime DEFAULT NULL
    COMMENT 'Dernière ouverture de la Communaute par cet utilisateur (NULL = jamais)';

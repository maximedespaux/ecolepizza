/* 107_recipe_read.sql
   Lecture d'une fiche, par utilisateur : ce qui permet à un commentaire de rester signalé
   jusqu'à ce qu'on l'ait VRAIMENT ouvert.

   POURQUOI CETTE TABLE, ALORS QUE 106 VENAIT D'ÉVITER D'EN CRÉER UNE
   La 106 pose une date de dernière visite par utilisateur, et j'y écrivais que la table de
   lecture ne se justifierait que si la pastille devait ne retomber que sur les fiches
   réellement ouvertes. C'est exactement ce qui est demandé maintenant. Une date globale ne
   sait pas répondre à « ai-je lu CETTE fiche » : ouvrir la Communauté éteignait tout, y
   compris ce qu'on n'avait pas lu.

   LES DEUX SIGNAUX N'ONT PAS LA MÊME EXIGENCE, et c'est pour ça qu'ils sont stockés
   différemment :
     · un J'AIME ne demande aucune réponse. Le voir suffit. Il s'éteint à la visite suivante,
       ce que la date globale de 106 suffit à porter — cette table ne le concerne pas.
     · un COMMENTAIRE appelle une réponse. Il doit rester visible tant qu'on ne l'a pas
       ouvert, même à travers dix visites. D'où une ligne par fiche et par lecteur.

   Le coût réel est modeste : une ligne par fiche effectivement ouverte, pas par fiche
   affichée. Une galerie de 200 fiches parcourue sans rien ouvrir n'écrit rien.

   CHAR(36) PARTOUT, ET AUCUNE FK SUR user_id : recipe.id et recipe_comment.user_id sont en
   CHAR(36), tandis que user.id est un uuid natif MariaDB — stocké sur 16 octets binaires.
   Une FK entre les deux échoue (errno 150). C'est déjà la raison pour laquelle recipe_like
   et recipe_comment n'ont pas de FK sur user_id ; on suit la même convention.

   ON UPDATE CURRENT_TIMESTAMP : rouvrir une fiche remonte la date, donc les commentaires
   arrivés entre-temps sont marqués lus à leur tour. C'est le comportement voulu — sans quoi
   seule la toute première ouverture compterait.

   Commentaires en blocs : mêmes raisons qu'en 101/102 (les `--` avalent le fichier quand le
   presse-papier aplatit les retours à la ligne). */

CREATE TABLE IF NOT EXISTS recipe_read (
    recipe_id CHAR(36) NOT NULL,
    user_id   CHAR(36) NOT NULL,
    read_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (recipe_id, user_id),
    CONSTRAINT fk_read_recipe FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE,
    INDEX idx_read_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

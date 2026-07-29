/* 114_revert_community_post.sql
   Retour arriere de 114.

   ATTENTION : DETRUIT tout l'espace d'echange — questions, reponses et photos. Rien de tout
   cela ne se recalcule : ce sont des ecrits de stagiaires. A n'executer que sur une base ou
   la fonctionnalite n'a jamais servi, ou apres export.

   L'ordre compte : la contrainte de `resolved_answer_id` pointe de community_post vers
   community_answer, et les deux tables filles pointent en retour vers community_post. On
   retire donc d'abord la contrainte, puis les filles, puis la table mere.

   A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE community_post
    DROP FOREIGN KEY IF EXISTS fk_post_resolved;

DROP TABLE IF EXISTS community_image;
DROP TABLE IF EXISTS community_answer;
DROP TABLE IF EXISTS community_post;

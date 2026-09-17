/* 164_qcm_reponse_libre.sql
   RÉPONSE LIBRE DANS LES QCM — un texte rédigé par le stagiaire, limité en nombre de mots.

   Demandé le 2026-09-17 : une question à réponse ouverte, « quelque chose comme 128 mots ». Les
   cinq types existants (choix unique, choix multiple, échelle, deux grilles) ne laissent choisir
   que parmi ce que l'école a prévu ; aucun ne permet d'expliquer un geste ou de justifier un choix.

   1. LE TYPE `TEXT` REJOINT L'ENUM. C'est la ligne qui compte le plus, et la raison est vécue : un
      ENUM qui ne connaît pas une valeur ne la refuse pas forcément — hors mode strict, MariaDB range
      une CHAÎNE VIDE à la place (constaté sur `notification.type`, où « BOUTIQUE » est devenu ''). Une
      question « réponse libre » enregistrée sans cette migration deviendrait une question sans type
      ni options, que le stagiaire ne pourrait pas remplir. Le code refuse donc d'en enregistrer une
      tant que la migration n'est pas jouée, et le dit.

   2. `max_words` : la limite de la question, en MOTS (128 si l'école n'en fixe pas d'autre). NULL
      pour les autres types, qui n'en ont que faire.

   3. `quiz_answer.value` EN TEXT — c'est déjà l'objet de la migration 151. On le REJOUE ici parce
      qu'une réponse de 128 mots dépasse les 255 caractères de l'ancienne colonne : si la 151 avait
      été oubliée, la réponse serait refusée à l'envoi. Rejouer un MODIFY vers le même type est sans
      effet sur les données.

   Rejouable : `ADD COLUMN IF NOT EXISTS`, et les deux MODIFY aboutissent au même état. */

ALTER TABLE quiz_question
    MODIFY COLUMN type enum('SINGLE','MULTI','SCALE','GRID_SINGLE','GRID_MULTI','TEXT') NOT NULL DEFAULT 'SINGLE';

ALTER TABLE quiz_question
    ADD COLUMN IF NOT EXISTS max_words SMALLINT UNSIGNED DEFAULT NULL AFTER scale_max;

ALTER TABLE quiz_answer MODIFY COLUMN value TEXT DEFAULT NULL;

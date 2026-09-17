/* 164_revert_qcm_reponse_libre.sql
   RETIRE LA RÉPONSE LIBRE DES QCM.

   ⚠ LES QUESTIONS « RÉPONSE LIBRE » SONT SUPPRIMÉES. Il le faut : ramener l'ENUM à cinq valeurs avec
   des lignes `TEXT` en place, c'est un refus (mode strict) ou, pire, une chaîne vide rangée en
   silence (sinon) — des questions sans type, que plus personne ne pourrait ni remplir ni corriger.

   CE QUI RESTE : les réponses déjà données. Leur texte demeure dans `quiz_answer` (sans question à
   laquelle se rattacher), et surtout dans la PREUVE figée de chaque réponse (`quiz_response.snapshot`,
   migration 144), qui recopie l'énoncé et le texte tels qu'ils étaient à l'envoi. Rien de ce qu'un
   stagiaire a écrit ne disparaît donc de la base.

   `quiz_answer.value` n'est PAS ramené à 255 caractères : cette colonne relève de la migration 151
   et de son propre revert. */

DELETE FROM quiz_question WHERE type = 'TEXT';

ALTER TABLE quiz_question DROP COLUMN IF EXISTS max_words;

ALTER TABLE quiz_question
    MODIFY COLUMN type enum('SINGLE','MULTI','SCALE','GRID_SINGLE','GRID_MULTI') NOT NULL DEFAULT 'SINGLE';

/* 102_revert_quest_questions.sql
   Annule 102_quest_questions.sql — et SUPPRIME la banque de questions importée avec elle.
   À ne jouer que si l'on renonce à la banque en base (le jeu retombe alors sur les questions
   codées en dur de src/app/ui/lib/niv1Questions.js et niv2Questions.js, qui restent en place).

   Ordre imposé par les clés étrangères : les options avant les questions, les questions avant
   les chapitres et les difficultés. */

DROP TABLE IF EXISTS quest_option;
DROP TABLE IF EXISTS quest_question;
DROP TABLE IF EXISTS quest_chapter;
DROP TABLE IF EXISTS quest_difficulty;

/* 104_revert_quest_lives.sql
   Annule 104_quest_lives.sql : plus de cœurs dans Pizza Quest, les chapitres se rejouent
   sans limite. Le capital de chaque stagiaire est perdu — sans conséquence, il se
   reconstitue de toute façon tout seul. */

DROP TABLE IF EXISTS learner_quest_life;

ALTER TABLE organization
    DROP COLUMN IF EXISTS quest_max_hearts,
    DROP COLUMN IF EXISTS quest_regen_minutes;

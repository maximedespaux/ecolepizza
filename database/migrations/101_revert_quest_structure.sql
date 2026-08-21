/* 101_revert_quest_structure.sql
   Annule 101_quest_structure.sql. Pizza Quest retrouve sa carte plate : un monde par
   formation du stagiaire, sans thème, sans palier et sans prérequis.

   Commentaires en blocs (et non `--`) pour la même raison que la migration aller : collé
   dans une console SQL qui écrase les retours à la ligne, un `--` commenterait tout le reste
   du script et rien ne s'exécuterait. */

DROP TABLE IF EXISTS quest_prerequisite;
DROP TABLE IF EXISTS quest_category;

ALTER TABLE training_program
    DROP COLUMN IF EXISTS quest_theme_id,
    DROP COLUMN IF EXISTS quest_tier_id;

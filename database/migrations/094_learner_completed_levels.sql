-- 094_learner_completed_levels.sql
-- Formations TERMINÉES (marquées manuellement par l'organisme) : liste de codes/niveaux
-- de formation, séparés par des virgules — indépendante de la complétion automatique
-- des documents. Permet de dire « ce stagiaire a fini CETTE formation, pas celle-là ».
ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS completed_levels VARCHAR(255) DEFAULT NULL AFTER levels;

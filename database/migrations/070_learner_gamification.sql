-- 070_learner_gamification.sql
-- Persistance de l'avancement / profil ludique du stagiaire (espace stagiaire).
-- Jusqu'ici l'avatar et la progression Pizza Quest vivaient en localStorage (par
-- navigateur, non partagé). On les enregistre en base : avatar sur le stagiaire,
-- progression normalisée (un enregistrement par monde/étape avec le nb d'étoiles).
-- Prérequis à l'espace communauté / classement.
ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS avatar VARCHAR(30) NULL DEFAULT NULL;   -- id d'avatar (cf. AVATARS)

CREATE TABLE IF NOT EXISTS learner_quest_progress (
    id              CHAR(36)  NOT NULL PRIMARY KEY,
    organization_id CHAR(36)  NOT NULL,
    learner_id      CHAR(36)  NOT NULL,
    world           VARCHAR(60) NOT NULL,          -- clé du « monde » (formation)
    step            VARCHAR(60) NOT NULL,          -- clé de l'étape / chapitre
    stars           TINYINT   NOT NULL DEFAULT 0,  -- 0..3 étoiles (meilleur score)
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_quest (learner_id, world, step),
    KEY idx_quest_org (organization_id),
    KEY idx_quest_learner (learner_id)
);

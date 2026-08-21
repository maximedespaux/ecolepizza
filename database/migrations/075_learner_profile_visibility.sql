-- 075_learner_profile_visibility.sql
-- Le stagiaire choisit ce que les autres voient sur son profil communauté (onglet Visibilité).
-- JSON de booléens : { company, phone, email }. NULL = valeurs par défaut (entreprise visible,
-- téléphone et e-mail masqués). Le nom, l'avatar, le grade et les compteurs restent publics.
ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS profile_visibility JSON NULL DEFAULT NULL;

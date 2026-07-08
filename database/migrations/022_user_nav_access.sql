-- 022_user_nav_access.sql
-- Accès menu par utilisateur, configurable par le SUPER_ADMIN depuis Équipe & accès.
-- Stocke la liste explicite des chemins de navigation autorisés (JSON, ex. ["/stagiaires","/sessions"]).
-- NULL = aucun accès tant que le super administrateur n'a rien accordé (les rôles
-- propriétaires SUPER_ADMIN / ADMIN_ORGANISME ne sont jamais restreints, côté applicatif).
ALTER TABLE user
    ADD COLUMN IF NOT EXISTS nav_access text DEFAULT NULL AFTER active;

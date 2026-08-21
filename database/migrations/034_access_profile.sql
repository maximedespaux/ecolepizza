-- 034_access_profile.sql
-- Rôles d'accès personnalisés de l'organisme : profils réutilisables d'accès au
-- menu (mêmes chemins/read-write que user.nav_access). On les applique à un membre
-- depuis Équipe & accès (copie l'accès sur l'utilisateur). Pas d'impact sur les
-- permissions serveur (menu uniquement).
CREATE TABLE IF NOT EXISTS access_profile (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    name            varchar(120) NOT NULL,
    nav_access      text         DEFAULT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_ap_org (organization_id),
    CONSTRAINT fk_ap_org FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE
);

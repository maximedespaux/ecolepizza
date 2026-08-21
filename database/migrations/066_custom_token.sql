-- 066_custom_token.sql
-- Jetons PERSONNALISÉS par organisme : valeurs calculées à partir d'autres jetons /
-- champs, sans stockage supplémentaire. `template` peut référencer d'autres jetons
-- ({Jour1}, {field:learner.opco}, {custom:Autre}) et un décalage de jours ({endDate|-1}).
CREATE TABLE IF NOT EXISTS custom_token (
    id CHAR(36) NOT NULL PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    token_key VARCHAR(60) NOT NULL,
    label VARCHAR(120) NOT NULL,
    template TEXT NULL,
    sort_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_custom_token_org_key (organization_id, token_key),
    KEY idx_custom_token_org (organization_id)
);

-- 065_partner_contribution.sql
-- Apports EN NATURE d'un partenaire (matériel, équipement, consommable…), distincts
-- des commissions cash (revenue_extra → chiffre d'affaires). Suivi seul, NON ajouté au CA.
-- Idempotent (MariaDB 10.2+).

CREATE TABLE IF NOT EXISTS partner_contribution (
    id               uuid          NOT NULL DEFAULT uuid(),
    organization_id  uuid          NOT NULL,
    partner_id       uuid          NOT NULL,
    date             date          NOT NULL DEFAULT current_timestamp(),
    type             varchar(30)   NOT NULL DEFAULT 'MATERIEL',   -- MATERIEL | EQUIPEMENT | CONSOMMABLE | AUTRE
    label            varchar(255)  NOT NULL,                       -- ce qui a été reçu
    value            decimal(10,2) NOT NULL DEFAULT 0.00,          -- valeur estimée (toujours renseignée)
    note             varchar(255)  DEFAULT NULL,
    created_at       timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_pcontrib_org (organization_id),
    KEY idx_pcontrib_partner (partner_id),
    CONSTRAINT fk_pcontrib_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_pcontrib_partner FOREIGN KEY (partner_id)
        REFERENCES partner (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

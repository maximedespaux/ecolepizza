-- ============================================================================
--  Migration 005 — Module Comptabilité / Gestion
--  Trois tables pour le tableau de gestion (pas de comptabilité légale) :
--    · expense             — dépenses par poste (matières, salaires, loyer…)
--    · revenue_extra       — produits divers (commissions, subventions…)
--    · accounting_settings — cibles (% du CA) et dividende visé, par organisme
--  Le chiffre d'affaires n'est PAS stocké : il s'additionne à la volée depuis
--  enrollment.price + material_sale + revenue_extra.
--    mysql -u root -p gds_doc_gestionary < database/migrations/005_comptabilite.sql
-- ============================================================================

-- Dépenses de gestion (poste analytique).
CREATE TABLE IF NOT EXISTS expense (
    id               uuid          NOT NULL DEFAULT uuid(),
    organization_id  uuid          NOT NULL,
    date             date          NOT NULL DEFAULT current_timestamp(),
    category         enum('MATIERES_PREMIERES','SALAIRES','LOYER','MARKETING','ENERGIE','DIVERS')
                                   NOT NULL DEFAULT 'DIVERS',
    label            varchar(255)  NOT NULL,
    amount_ht        decimal(10,2) NOT NULL,
    supplier_id      uuid          DEFAULT NULL,          -- partenaire fournisseur (optionnel)
    note             varchar(255)  DEFAULT NULL,
    created_at       timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_expense_org (organization_id),
    KEY idx_expense_date (date),
    CONSTRAINT fk_expense_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Produits divers hors inscriptions et hors ventes de matériel.
CREATE TABLE IF NOT EXISTS revenue_extra (
    id               uuid          NOT NULL DEFAULT uuid(),
    organization_id  uuid          NOT NULL,
    date             date          NOT NULL DEFAULT current_timestamp(),
    label            varchar(255)  NOT NULL,
    category         varchar(30)   NOT NULL DEFAULT 'COMMISSION',  -- COMMISSION | SUBVENTION | AUTRE
    amount           decimal(10,2) NOT NULL,
    note             varchar(255)  DEFAULT NULL,
    created_at       timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_revextra_org (organization_id),
    KEY idx_revextra_date (date),
    CONSTRAINT fk_revextra_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Cibles de gestion (un enregistrement par organisme).
CREATE TABLE IF NOT EXISTS accounting_settings (
    id               uuid          NOT NULL DEFAULT uuid(),
    organization_id  uuid          NOT NULL,
    targets          longtext      DEFAULT NULL,          -- JSON { MATIERES_PREMIERES: 27.5, ... }
    dividende_cible  decimal(5,2)  NOT NULL DEFAULT 10.00,
    created_at       timestamp     NOT NULL DEFAULT current_timestamp(),
    updated_at       timestamp     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_accset_org (organization_id),
    CONSTRAINT fk_accset_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

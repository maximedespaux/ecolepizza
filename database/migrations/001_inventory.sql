-- ============================================================================
--  Migration 001 — Inventaire (stock de matériel à vendre)
--  À exécuter sur la base existante :
--    mysql -u root -p gds_doc_gestionary < database/migrations/001_inventory.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_item (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    name            varchar(255)  NOT NULL,
    category        varchar(120)  DEFAULT NULL,     -- Four, Pétrin, Matière première, Accessoire…
    sku             varchar(60)   DEFAULT NULL,     -- référence / code article
    quantity        int           NOT NULL DEFAULT 0,   -- stock en main
    unit_price      decimal(10,2) DEFAULT NULL,     -- prix de vente unitaire
    threshold       int           NOT NULL DEFAULT 0,   -- seuil d'alerte stock bas
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_inventory_org (organization_id),
    CONSTRAINT fk_inventory_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

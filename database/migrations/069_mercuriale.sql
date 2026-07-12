-- ============================================================================
--  Migration 069 — Mercuriale (liste de prix de référence, comparaison multi-magasins)
--    mysql -u root -p gds_doc_gestionary < database/migrations/069_mercuriale.sql
--  · mercuriale_store  : magasins comparés (une colonne de prix par magasin)
--  · mercuriale_item   : produits (marque, réf., conditionnement, rayon…)
--  · mercuriale_price  : un prix HT par (produit, magasin), avec date de relevé
-- ============================================================================

CREATE TABLE IF NOT EXISTS mercuriale_store (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    name            varchar(120)  NOT NULL,               -- magasin / point de vente (ex. « Metro Toulouse »)
    sort_order      int           NOT NULL DEFAULT 0,
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_merc_store_org (organization_id),
    CONSTRAINT fk_merc_store_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS mercuriale_item (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    rayon           varchar(120)  DEFAULT NULL,           -- Fruits & Légumes, Frais, Poissons…
    marque          varchar(160)  DEFAULT NULL,
    produit         varchar(255)  NOT NULL,
    reference       varchar(80)   DEFAULT NULL,           -- référence / code article
    conditionnement varchar(80)   DEFAULT NULL,           -- « 1 kg », « x6 », « colis de 12 »
    unite           varchar(40)   DEFAULT NULL,           -- kg, L, pièce…
    prix_kg         decimal(10,3) DEFAULT NULL,           -- prix au kg/L si affiché
    notes           varchar(500)  DEFAULT NULL,
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_merc_item_org (organization_id),
    CONSTRAINT fk_merc_item_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS mercuriale_price (
    id          uuid          NOT NULL DEFAULT uuid(),
    item_id     uuid          NOT NULL,
    store_id    uuid          NOT NULL,
    prix_ht     decimal(10,3) DEFAULT NULL,               -- vide = indisponible / non relevé
    date_releve date          DEFAULT NULL,
    note        varchar(120)  DEFAULT NULL,               -- ex. « indispo »
    PRIMARY KEY (id),
    UNIQUE KEY uq_merc_price (item_id, store_id),
    CONSTRAINT fk_merc_price_item FOREIGN KEY (item_id)
        REFERENCES mercuriale_item (id) ON DELETE CASCADE,
    CONSTRAINT fk_merc_price_store FOREIGN KEY (store_id)
        REFERENCES mercuriale_store (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

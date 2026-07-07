-- 016_shop.sql
-- Boutique « Ventes de Matériels et Inventaire » : paramètres de facturation
-- (numérotation, mentions, moyens de paiement, TVA) + moyen de paiement sur la facture.
-- Idempotent (MariaDB 10.2+).

CREATE TABLE IF NOT EXISTS shop_settings (
    id               uuid         NOT NULL DEFAULT uuid(),
    organization_id  uuid         NOT NULL,
    invoice_prefix   varchar(20)  NOT NULL DEFAULT 'F',
    next_number      int          NOT NULL DEFAULT 1,
    payment_methods  varchar(255) NOT NULL DEFAULT 'Espèces,CB,Virement,Chèque',
    legal_mentions   text         DEFAULT NULL,
    tva_applies      tinyint(1)   NOT NULL DEFAULT 1,   -- 1 = TVA appliquée ; 0 = exonérée
    created_at       timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at       timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_shop_org (organization_id),
    CONSTRAINT fk_shop_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS payment_method varchar(30) DEFAULT NULL;

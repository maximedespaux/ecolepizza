-- 095_partner_product.sql
-- Catalogue vitrine des partenaires (onglet « Offres partenaires » de la boutique stagiaire).
--
-- ⚠️ NE PAS CONFONDRE AVEC `inventory_item` :
--   · `inventory_item` = le stock que l'ÉCOLE achète et revend (petit matériel : pelles,
--     louches, spatules…). L'école est le marchand : elle fixe le prix, encaisse, facture,
--     remet en main propre. Aucune commission, aucun tiers.
--   · `partner_product` (ici) = ce que le PARTENAIRE vend (gros matériel, fours, distributeurs,
--     et la traîne du petit matériel). L'école ne vend pas : elle présente, met en relation,
--     et touche une commission. D'où le prix public ET le tarif école : c'est l'écart entre
--     les deux qui donne au stagiaire une raison de passer par nous — donc à nous une trace.
--
-- Volontairement DÉCLARATIF et léger : pas de stock, pas de TVA, pas de SKU. Ce n'est pas un
-- inventaire, c'est une vitrine. Le stock et le SAV restent chez le partenaire.
CREATE TABLE IF NOT EXISTS partner_product (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    partner_id      uuid          NOT NULL,
    name            varchar(255)  NOT NULL,
    category        varchar(120)  DEFAULT NULL,     -- aligné sur inventory_item.category quand ça a du sens
    reference       varchar(80)   DEFAULT NULL,     -- la réf du partenaire (pour sa propre recherche)
    price_public    decimal(10,2) DEFAULT NULL,     -- prix catalogue affiché par le partenaire
    price_school    decimal(10,2) DEFAULT NULL,     -- tarif école négocié. NULL = pas encore négocié
    url             varchar(500)  DEFAULT NULL,     -- fiche produit chez le partenaire
    image_url       varchar(500)  DEFAULT NULL,
    note            varchar(500)  DEFAULT NULL,     -- ce qu'on en dit au stagiaire (conseil pédagogique)
    active          tinyint(1)    NOT NULL DEFAULT 1,
    sort_order      int           NOT NULL DEFAULT 0,
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_pprod_org (organization_id, active),
    KEY idx_pprod_partner (partner_id),
    CONSTRAINT fk_pprod_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_pprod_partner FOREIGN KEY (partner_id)
        REFERENCES partner (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

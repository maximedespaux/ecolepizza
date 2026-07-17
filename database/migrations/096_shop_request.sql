-- 096_shop_request.sql
-- Demandes de la boutique stagiaire : le panier validé devient une DEMANDE, pas une commande.
--
-- Pourquoi pas un vrai e-commerce : le stagiaire est dans le bâtiment cinq jours. Il n'y a ni
-- paiement en ligne, ni port, ni livraison — il choisit, l'école prépare, il retire en main
-- propre et repart avec. Le paiement se fait sur place et passe par `invoice` (qui a déjà
-- `buyer_name` et `payment_method` pour la vente comptoir). D'où `invoice_id` ici : la demande
-- ne duplique pas la facturation, elle y renvoie.
--
-- Deux sources dans la même demande (`shop_request_line.source`) :
--   · ECOLE      → l'école vend (inventory_item) : elle facture, elle encaisse.
--   · PARTENAIRE → le partenaire vend (partner_product) : l'école met en relation et suit la
--     commission. Une même demande peut mélanger les deux — c'est le stagiaire qui compose son
--     labo, il ne sait pas (et n'a pas à savoir) qui vend quoi.
CREATE TABLE IF NOT EXISTS shop_request (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    learner_id      uuid         NOT NULL,               -- l'identité du demandeur
    ref             varchar(24)  NOT NULL,               -- EPJJD-2026-0042 : lisible, dictable au téléphone
    status          enum('NOUVELLE','EN_PREPARATION','PRETE','REMISE','FACTUREE','ANNULEE')
                    NOT NULL DEFAULT 'NOUVELLE',
    note            varchar(500) DEFAULT NULL,           -- le mot du stagiaire
    admin_note      varchar(500) DEFAULT NULL,           -- le suivi côté école (non visible du stagiaire)
    -- Créneau de retrait choisi par le stagiaire, validé contre les horaires d'ouverture
    -- (cf. lib/horaires.js). NULL = « je passerai, sans préciser » : on n'oblige personne à
    -- prendre rendez-vous pour venir chercher une pelle. Sert à faire remonter un
    -- « Récupérer le matériel » sur la page de la session concernée.
    pickup_at       datetime     DEFAULT NULL,
    invoice_id      uuid         DEFAULT NULL,           -- la facture émise, une fois remise
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_shop_ref (ref),
    -- Préfixe « fk_shopreq_ » et pas « fk_shop_ » : les noms de contraintes sont uniques dans
    -- TOUTE la base, pas par table, et `shop_settings` occupe déjà « fk_shop_org ». La collision
    -- fait échouer le CREATE TABLE sur un errno 121 « Duplicate key » — un message qui ne parle
    -- ni de clé étrangère ni de nom, et qui envoie chercher un doublon de données inexistant.
    KEY idx_shop_org (organization_id, status),
    KEY idx_shop_learner (learner_id),
    CONSTRAINT fk_shopreq_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_shopreq_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE CASCADE,
    CONSTRAINT fk_shopreq_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoice (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Le libellé ET le prix sont FIGÉS à la demande, pas lus par jointure.
-- Sinon une hausse de tarif le mois suivant réécrirait le passé : une demande de janvier
-- afficherait les prix de mars, et la facture ne correspondrait plus à ce que le stagiaire
-- avait sous les yeux. Les *_id ne servent qu'à retrouver l'article (ON DELETE SET NULL :
-- supprimer une référence du catalogue ne doit pas effacer l'historique des demandes).
CREATE TABLE IF NOT EXISTS shop_request_line (
    id                 uuid          NOT NULL DEFAULT uuid(),
    request_id         uuid          NOT NULL,
    source             enum('ECOLE','PARTENAIRE') NOT NULL DEFAULT 'ECOLE',
    inventory_item_id  uuid          DEFAULT NULL,
    partner_product_id uuid          DEFAULT NULL,
    label              varchar(255)  NOT NULL,
    qty                int           NOT NULL DEFAULT 1,
    unit_price_ht      decimal(10,2) DEFAULT NULL,       -- NULL = tarif partenaire sur demande
    tax_rate           decimal(5,2)  NOT NULL DEFAULT 20.00,
    -- Ce qu'on BRODE sur l'article (veste Molinel) : « Nom Prénom ».
    -- Par LIGNE et pas par demande : un stagiaire peut commander une veste pour lui et une
    -- pour son associé. Et on ne prend pas le nom du compte : il commande peut-être pour
    -- quelqu'un d'autre, et une broderie ne se découd pas.
    personalization    varchar(120)  DEFAULT NULL,
    -- Déclinaison de l'article : « L · Femme ». Distinct de `personalization` — ce n'est pas
    -- une broderie mais le PRODUIT qu'on sort du carton. L'inventaire ne tient qu'une seule
    -- ligne « Veste brodée Molinel » (pas un SKU par taille), donc la taille ne peut vivre
    -- que sur la demande. Sans elle, l'école ne sait pas quelle veste préparer.
    variant            varchar(60)   DEFAULT NULL,
    -- Ordre d'affichage des lignes, tel que le stagiaire les a mises dans son panier. Sans lui,
    -- MariaDB rend les lignes dans l'ordre qui l'arrange : la demande à l'écran, le bon de
    -- préparation et la facture pourraient lister les mêmes articles dans trois ordres
    -- différents. C'est aussi la colonne du ORDER BY de invoiceShopRequest.
    sort_order         int           NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_sline_request (request_id),
    CONSTRAINT fk_sline_request FOREIGN KEY (request_id)
        REFERENCES shop_request (id) ON DELETE CASCADE,
    CONSTRAINT fk_sline_item FOREIGN KEY (inventory_item_id)
        REFERENCES inventory_item (id) ON DELETE SET NULL,
    CONSTRAINT fk_sline_pprod FOREIGN KEY (partner_product_id)
        REFERENCES partner_product (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 071_recipe_space.sql
-- Espace « fiches techniques » (recettes) partageable entre stagiaires + catalogue
-- d'ingrédients (importé depuis le catalogue Metro). Remplace la Mercuriale.
--   · catalog_product     : ingrédients sélectionnables (nom, marque, prix, image…)
--   · recipe              : une fiche technique (pizza) d'un stagiaire, privée ou partagée
--   · recipe_ingredient   : garnitures d'une recette (lien vers un produit du catalogue)

CREATE TABLE IF NOT EXISTS catalog_product (
    id              CHAR(36)      NOT NULL PRIMARY KEY,
    organization_id CHAR(36)      NOT NULL,
    name            VARCHAR(255)  NOT NULL,               -- nom (nettoyé)
    brand           VARCHAR(160)  DEFAULT NULL,
    ean             VARCHAR(20)   DEFAULT NULL,
    family          VARCHAR(120)  DEFAULT NULL,           -- rayon (cat_2), pour filtrer
    category        VARCHAR(255)  DEFAULT NULL,           -- chemin complet
    type_unity      VARCHAR(20)   DEFAULT NULL,           -- Kg | L | Piece
    unit_ht         DECIMAL(10,4) DEFAULT NULL,           -- prix HT par unité naturelle (€/kg, €/L, €/pièce)
    unit_ttc        DECIMAL(10,4) DEFAULT NULL,
    price_ht        DECIMAL(10,3) DEFAULT NULL,           -- prix HT du conditionnement
    price_ttc       DECIMAL(10,3) DEFAULT NULL,
    image_url       VARCHAR(500)  DEFAULT NULL,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_catalog_org (organization_id),
    KEY idx_catalog_name (organization_id, name)
);

CREATE TABLE IF NOT EXISTS recipe (
    id              CHAR(36)      NOT NULL PRIMARY KEY,
    organization_id CHAR(36)      NOT NULL,
    author_user_id  CHAR(36)      DEFAULT NULL,           -- auteur (compte)
    author_name     VARCHAR(160)  DEFAULT NULL,           -- nom affiché (dénormalisé)
    name            VARCHAR(160)  NOT NULL,
    type            VARCHAR(40)   DEFAULT NULL,            -- Classique, Napolitaine…
    description     TEXT          DEFAULT NULL,
    servings        INT           NOT NULL DEFAULT 6,      -- nb de pizzas
    paton_g         INT           NOT NULL DEFAULT 250,    -- poids d'un pâton (g)
    flour_price     DECIMAL(10,3) NOT NULL DEFAULT 0,      -- €/kg farine
    margin_pct      INT           NOT NULL DEFAULT 70,
    visibility      ENUM('PRIVATE','SHARED') NOT NULL DEFAULT 'PRIVATE',
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_recipe_org (organization_id),
    KEY idx_recipe_author (author_user_id),
    KEY idx_recipe_shared (organization_id, visibility)
);

CREATE TABLE IF NOT EXISTS recipe_ingredient (
    id          CHAR(36)      NOT NULL PRIMARY KEY,
    recipe_id   CHAR(36)      NOT NULL,
    product_id  CHAR(36)      DEFAULT NULL,               -- catalog_product (facultatif)
    label       VARCHAR(255)  NOT NULL,                   -- libellé (repris du produit ou saisi)
    qty         DECIMAL(10,3) NOT NULL DEFAULT 0,
    unit        VARCHAR(10)   NOT NULL DEFAULT 'g',        -- g | piece
    unit_price  DECIMAL(10,4) NOT NULL DEFAULT 0,          -- €/kg ou €/pièce (au moment de l'ajout)
    sort_order  INT           NOT NULL DEFAULT 0,
    CONSTRAINT fk_ring_recipe FOREIGN KEY (recipe_id) REFERENCES recipe (id) ON DELETE CASCADE
);

-- 097_partner_product_specs_prix.sql
-- Deux ajouts à la vitrine partenaires : les caractéristiques qui permettent de CONSEILLER,
-- et les prix constatés chez les revendeurs qui permettent de COMPARER.
--
-- ⚠️ ORDRE : jouer APRÈS la 095 (partner_product).

-- ─────────────────────────────────────────────────────────────────────────────────────────
--  1. Les caractéristiques, en JSON.
--
--  Pourquoi pas une colonne par attribut : un four a une énergie, une capacité en pizzas et
--  une température. Un pétrin a un type, une capacité en KILOS et une tête relevable. Un bac
--  a des dimensions. Trois familles, trois jeux d'attributs sans recouvrement — une table à
--  colonnes vaudrait dire vingt colonnes vides sur vingt-cinq. Le catalogue se compte en
--  dizaines de lignes et est lu d'un bloc : le filtrage se fait côté front, aucune requête
--  n'a besoin d'indexer là-dedans.
--
--  Formes attendues (cf. src/app/ui/lib/materiel.js, qui tient la logique de conseil) :
--    Four   : {"energie":"BOIS|GAZ|ELECTRIQUE|HYBRIDE|CONVOYEUR","pizzas":6,"chambres":1,
--              "temp_max_c":450,"sole_rotative":true,"avpn":false}
--    Pétrin : {"type":"SPIRALE|AXE_OBLIQUE|BRAS_PLONGEANTS","kg":25,"tete_relevable":true,
--              "cuve_amovible":false,"alimentation":"MONO|TRI"}
--    Bac    : {"l":40,"L":60,"h":20,"litres":25}
ALTER TABLE partner_product
    ADD COLUMN specs JSON DEFAULT NULL AFTER note;

-- ─────────────────────────────────────────────────────────────────────────────────────────
--  2. Les prix constatés chez les revendeurs.
--
--  Une TABLE et pas une colonne : tout l'intérêt est de voir l'ÉCART. « 9 302 € chez l'un,
--  8 900 € chez l'autre » ne tient pas dans un decimal — et c'est précisément le levier de
--  négociation qu'on cherche.
--
--  À ne pas confondre avec les colonnes de `partner_product` :
--    · price_public = le tarif catalogue annoncé par LE PARTENAIRE lui-même.
--    · price_school = ce que l'école a négocié pour ses stagiaires.
--    · ici          = ce qu'un REVENDEUR TIERS facture réellement. Ce sont trois choses
--      différentes, et c'est leur écart qui a du sens.
--
--  `seen_at` et `url` ne sont pas du confort : un prix affiché à un stagiaire sans dire d'où
--  il vient ni quand il a été vu devient un piège. Dans six mois il le montre à un fournisseur
--  et il a l'air d'un amateur — exactement ce qu'on voulait éviter en laissant les prix vides.
--  D'où le NOT NULL sur les deux : un prix sans provenance n'entre pas.
CREATE TABLE IF NOT EXISTS partner_product_price (
    id                 uuid          NOT NULL DEFAULT uuid(),
    partner_product_id uuid          NOT NULL,
    reseller           varchar(120)  NOT NULL,          -- « CHR Restauration »
    url                varchar(500)  NOT NULL,          -- la page où le prix a été vu
    price_ht           decimal(10,2) NOT NULL,
    -- Certains revendeurs annoncent livraison et pose comprises : sans ce drapeau, on
    -- comparerait un prix nu à un prix posé et on conclurait n'importe quoi.
    includes_install   tinyint(1)    NOT NULL DEFAULT 0,
    seen_at            date          NOT NULL,          -- le jour où la page affichait ce prix
    created_at         timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    -- Un revendeur ne donne qu'un prix par produit à un instant donné : si on relève à
    -- nouveau le même jour, on écrase au lieu d'empiler des doublons.
    UNIQUE KEY uq_ppp_obs (partner_product_id, reseller, seen_at),
    KEY idx_ppp_product (partner_product_id),
    -- Préfixe « fk_ppprice_ » : les noms de contraintes sont uniques dans TOUTE la base, pas
    -- par table (cf. 096, où « fk_shop_org » était déjà pris par shop_settings).
    CONSTRAINT fk_ppprice_product FOREIGN KEY (partner_product_id)
        REFERENCES partner_product (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

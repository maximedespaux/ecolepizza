-- ============================================================================
--  Catalogue vitrine des partenaires — GAMMES RÉELLES, à valider par Maxime.
--  Cible : `partner_product` (migration 095, à jouer AVANT ce seed).
--    mysql -u root -p gds_doc_gestionary < database/partner_products_seed.sql
--
--  ⚠️ AUCUN PRIX. Ni public, ni école. Deux raisons :
--    · un tarif inventé que le stagiaire montrerait au fournisseur ferait passer
--      l'école pour un amateur — mieux vaut une case vide qu'un chiffre faux.
--    · le tarif école est le RÉSULTAT de la négociation de Maxime. Il n'existe pas
--      encore : `partner.discount_pct` est vide sur les 21 partenaires.
--  Renseigner `price_public` / `price_school` après avoir obtenu les listings.
--
--  ⚠️ CE SONT DES GAMMES, PAS DES RÉFÉRENCES COMMERCIALES. Une gamme (« serieS »)
--  contient plusieurs modèles avec des tailles et des puissances différentes. C'est
--  volontaire : ça donne à Maxime une vitrine juste dès maintenant, et la liste de
--  ce qu'il doit demander à chaque fournisseur. Les références exactes viendront
--  de leurs listings.
--
--  SOURCES (vérifiées le 2026-07-17, pages officielles des fabricants) :
--    · Moretti Forni — https://morettiforni.com/en_US/pizza-ovens
--    · Zanolli       — https://www.zanolli.it/en/pizza-ovens/
--    · Marana Forni  — https://www.maranaforni.fr (catalogue FR)
--  Les revendeurs se contredisent (l'un donnait serieP en gaz, un autre fondait
--  serieS et iDeck en une seule gamme) : seules les pages fabricant font foi ici.
--
--  ⛔ OONI VOLONTAIREMENT ABSENT alors qu'il est partenaire (catégorie FOUR).
--  Koda, Karu et Volt sont des fours DOMESTIQUES (jardin, terrasse), pas des fours
--  de service. Les afficher dans « équipe ta pizzeria » à côté d'un Moretti ferait
--  croire à un stagiaire qu'un Koda tient un service — il ne le tient pas. À mettre
--  ailleurs (démo, événementiel, stagiaire qui débute chez lui), pas ici.
-- ============================================================================

SET @org_id = (SELECT id FROM organization ORDER BY created_at LIMIT 1);

-- --------------------------------------------------------------------------
--  CUISSON — le poste le plus lourd d'une pizzeria
-- --------------------------------------------------------------------------
INSERT INTO partner_product (id, organization_id, partner_id, name, category, note, sort_order)
SELECT uuid(), @org_id, p.id, t.name, t.category, t.note, t.so
FROM (
  SELECT 'serieS — four à sole électrique modulaire' AS name, 'Four' AS category,
         'La gamme la plus configurable de Moretti. Pour une pizzeria qui veut faire évoluer sa cuisson.' AS note, 1 AS so UNION ALL
  SELECT 'Neapolis — four napolitain électrique 510 °C', 'Four',
         'L''électrique qui monte au niveau du bois. Les températures napolitaines sans gérer de flamme.', 2 UNION ALL
  SELECT 'serieP — four à sole traditionnel', 'Four',
         'Le cheval de trait : robuste, simple, pour un service classique au quotidien.', 3 UNION ALL
  SELECT 'iDeck — four à sole essentiel', 'Four',
         'L''entrée de gamme Moretti. Le bon choix pour un premier labo.', 4 UNION ALL
  SELECT 'serieT — four à convoyeur (électrique ou gaz)', 'Four',
         'Convoyeur : cadence et régularité, mais le geste du pizzaïolo disparaît. À réserver au volume.', 5
) t JOIN partner p ON p.organization_id = @org_id AND p.name = 'Moretti Forni'
WHERE NOT EXISTS (SELECT 1 FROM partner_product x WHERE x.partner_id = p.id AND x.name = t.name);

INSERT INTO partner_product (id, organization_id, partner_id, name, category, note, sort_order)
SELECT uuid(), @org_id, p.id, t.name, t.category, t.note, t.so
FROM (
  SELECT 'AVGVSTO® — four dôme électrique' AS name, 'Four' AS category,
         'Le dôme napolitain, en électrique. L''allure de la tradition sans la gestion du feu.' AS note, 1 AS so UNION ALL
  SELECT 'AVGVSTO PR® — four dôme à sole rotative', 'Four',
         'Sole rotative : la cuisson s''égalise toute seule, précieux quand ça envoie.', 2 UNION ALL
  SELECT 'TEOREMA POLIS IoT — four à sole électrique', 'Four',
         'Modulaire et empilable. Le classique de la pizzeria qui veut de la place au sol.', 3 UNION ALL
  SELECT 'CITIZEN E / EP — four à sole électrique', 'Four',
         'Compact : pensé pour les cuisines où la place manque.', 4 UNION ALL
  SELECT 'CITIZEN GAS — four à sole gaz', 'Four',
         'La même chose au gaz, pour qui n''a pas la puissance électrique.', 5 UNION ALL
  SELECT 'SYNTHESIS TOUCH IoT — four tunnel ventilé', 'Four',
         'Tunnel modulaire. Même logique que le convoyeur : du volume, pas du geste.', 6 UNION ALL
  SELECT 'VULCANO — four électrique compact', 'Four',
         'Petit format polyvalent. Dépannage, snack, point chaud.', 7
) t JOIN partner p ON p.organization_id = @org_id AND p.name = 'Zanolli'
WHERE NOT EXISTS (SELECT 1 FROM partner_product x WHERE x.partner_id = p.id AND x.name = t.name);

INSERT INTO partner_product (id, organization_id, partner_id, name, category, note, sort_order)
SELECT uuid(), @org_id, p.id, t.name, t.category, t.note, t.so
FROM (
  SELECT 'Rotoforno Classico — four rotatif (bois, gaz ou combiné)' AS name, 'Four' AS category,
         'Marana a breveté le four rotatif en 1992. La sole tourne : plus besoin de faire tourner la pizza.' AS note, 1 AS so UNION ALL
  SELECT 'Rotoforno SU&GIU® — sole rotative à hauteur réglable', 'Four',
         'Premier four rotatif certifié par l''AVPN. La sole monte et descend : on règle la cuisson du fond sans toucher au ciel.', 2 UNION ALL
  SELECT 'Fours statiques napolitains (bois ou gaz)', 'Four',
         'La tradition sans rotation, pour qui veut garder le geste.', 3
) t JOIN partner p ON p.organization_id = @org_id AND p.name = 'Marana'
WHERE NOT EXISTS (SELECT 1 FROM partner_product x WHERE x.partner_id = p.id AND x.name = t.name);

-- --------------------------------------------------------------------------
--  EMPÂTEMENT & PRÉPARATION
--  Les gammes ci-dessous ne sont PAS vérifiées sur les pages fabricant (contrairement
--  aux fours) : ce sont les postes attendus, à confirmer avec les listings.
--  ⚠️ Ne PAS écrire « à confirmer » dans `note` : cette colonne s'affiche au STAGIAIRE,
--  sur la fiche produit. Un pense-bête interne y donne à lire l'incertitude de l'école.
--  Le rappel existe déjà et ne se voit pas : le prix est vide.
-- --------------------------------------------------------------------------
INSERT INTO partner_product (id, organization_id, partner_id, name, category, note, sort_order)
SELECT uuid(), @org_id, p.id, t.name, t.category, t.note, t.so
FROM (
  SELECT 'Bacs de fermentation 60×40' AS name, 'Bac' AS category,
         'Le bac 60×40 est la référence du manuel : c''est lui qui te sert au blocage à 3-4 °C.' AS note, 1 AS so UNION ALL
  SELECT 'Couvercles et chariots porte-bacs', 'Bac',
         'Pour empiler et déplacer tes bacs sans rompre la chaîne du froid.', 2
) t JOIN partner p ON p.organization_id = @org_id AND p.name = 'Gilac'
WHERE NOT EXISTS (SELECT 1 FROM partner_product x WHERE x.partner_id = p.id AND x.name = t.name);

INSERT INTO partner_product (id, organization_id, partner_id, name, category, note, sort_order)
SELECT uuid(), @org_id, p.id, t.name, t.category, t.note, t.so
FROM (
  SELECT 'Trancheuses à jambon' AS name, 'Préparation' AS category,
         'Poste clé si tu travailles le jambon cru à la commande.' AS note, 1 AS so
) t JOIN partner p ON p.organization_id = @org_id AND p.name = 'Berkel'
WHERE NOT EXISTS (SELECT 1 FROM partner_product x WHERE x.partner_id = p.id AND x.name = t.name);

INSERT INTO partner_product (id, organization_id, partner_id, name, category, note, sort_order)
SELECT uuid(), @org_id, p.id, t.name, t.category, t.note, t.so
FROM (
  SELECT 'Coupe-légumes et cutters' AS name, 'Préparation' AS category,
         'Pour tes produits cuisinés : sauces, garnitures préparées.' AS note, 1 AS so
) t JOIN partner p ON p.organization_id = @org_id AND p.name = 'Robot Coupe'
WHERE NOT EXISTS (SELECT 1 FROM partner_product x WHERE x.partner_id = p.id AND x.name = t.name);

SELECT CONCAT('partner_product : ', COUNT(*), ' ligne(s) en base') AS resultat FROM partner_product;

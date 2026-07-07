-- ============================================================================
--  Données de référence importées de la branche dev (partenaires + produits).
--  Idempotent : réexécutable sans doublon. Cible l'organisme existant.
--    mysql -u root -p gds_doc_gestionary < database/dev_data.sql
-- ============================================================================

SET @org_id = (SELECT id FROM organization ORDER BY created_at LIMIT 1);

-- Retire les 4 partenaires de démonstration fictifs du seed initial.
DELETE FROM partner WHERE organization_id = @org_id AND name IN
  ('Moulins Pyrénéens','Four & Flamme','Salaisons du Sud-Ouest','MatérielPro Pizza');

-- 23 partenaires réels (École Pizza).
INSERT INTO partner (id, organization_id, name, category)
SELECT uuid(), @org_id, t.name, t.category FROM (
  SELECT '5 Stagioni' AS name, 'FARINE' AS category UNION ALL
  SELECT 'Marana' AS name, 'FARINE' AS category UNION ALL
  SELECT 'Demetra' AS name, 'CONSERVE' AS category UNION ALL
  SELECT 'Mutti' AS name, 'CONSERVE' AS category UNION ALL
  SELECT 'Galbani' AS name, 'FROMAGE' AS category UNION ALL
  SELECT 'Rovagnati' AS name, 'CHARCUTERIE' AS category UNION ALL
  SELECT 'Noir de Bigorre' AS name, 'CHARCUTERIE' AS category UNION ALL
  SELECT 'Ephrem' AS name, 'AUTRE' AS category UNION ALL
  SELECT 'Moretti Forni' AS name, 'FOUR' AS category UNION ALL
  SELECT 'Zanolli' AS name, 'FOUR' AS category UNION ALL
  SELECT 'Ooni' AS name, 'FOUR' AS category UNION ALL
  SELECT 'Gi Metal' AS name, 'MATERIEL' AS category UNION ALL
  SELECT 'Robot Coupe' AS name, 'MATERIEL' AS category UNION ALL
  SELECT 'Berkel' AS name, 'MATERIEL' AS category UNION ALL
  SELECT 'Gilac' AS name, 'MATERIEL' AS category UNION ALL
  SELECT 'Adial' AS name, 'MATERIEL' AS category UNION ALL
  SELECT 'Carmat' AS name, 'MATERIEL' AS category UNION ALL
  SELECT 'Kokko' AS name, 'MATERIEL' AS category UNION ALL
  SELECT 'Eligo Pro' AS name, 'DISTRIBUTION' AS category UNION ALL
  SELECT 'GPA' AS name, 'DISTRIBUTION' AS category UNION ALL
  SELECT 'Groupe Lefebvre' AS name, 'DISTRIBUTION' AS category UNION ALL
  SELECT 'Metro' AS name, 'DISTRIBUTION' AS category UNION ALL
  SELECT 'Desther' AS name, 'AUTRE' AS category
) t WHERE NOT EXISTS (SELECT 1 FROM partner p WHERE p.organization_id = @org_id AND p.name = t.name);

-- Catalogue produits (marchandise partenaires) -> inventaire (stock 0, prix a saisir).
INSERT INTO inventory_item (id, organization_id, name, category, quantity, unit_price, threshold)
SELECT uuid(), @org_id, t.name, t.category, 0, NULL, 0 FROM (
  SELECT 'Farine Pizza Napoletana Type 00 (W ~300–310)' AS name, 'Farines' AS category UNION ALL
  SELECT 'Farine Superiore Type 00 (W ~330)' AS name, 'Farines' AS category UNION ALL
  SELECT 'Farine Rinforzato Type 00' AS name, 'Farines' AS category UNION ALL
  SELECT 'Farine Manitoba Type 00 (force élevée)' AS name, 'Farines' AS category UNION ALL
  SELECT 'Mozzarella Fiordilatte (gros brin)' AS name, 'Fromages' AS category UNION ALL
  SELECT 'Mozzarella Fiordilatte Julienne (4×8×30 mm)' AS name, 'Fromages' AS category UNION ALL
  SELECT 'Mozzarella di Bufala' AS name, 'Fromages' AS category UNION ALL
  SELECT 'Grana Padano DOP râpé' AS name, 'Fromages' AS category UNION ALL
  SELECT 'Polpa (pulpe de tomate)' AS name, 'Tomates' AS category UNION ALL
  SELECT 'Pelati (tomates pelées entières)' AS name, 'Tomates' AS category UNION ALL
  SELECT 'Jambon cuit italien' AS name, 'Charcuterie' AS category UNION ALL
  SELECT 'Jambon Noir de Bigorre (local 65)' AS name, 'Charcuterie' AS category UNION ALL
  SELECT 'Huile d''olive extra vierge' AS name, 'Huiles' AS category UNION ALL
  SELECT 'Mozzarella râpée générique' AS name, 'Fromages' AS category UNION ALL
  SELECT 'Levure fraîche de boulanger' AS name, 'Levures' AS category UNION ALL
  SELECT 'Pelle à enfourner perforée' AS name, 'Matériel' AS category
) t WHERE NOT EXISTS (SELECT 1 FROM inventory_item i WHERE i.organization_id = @org_id AND i.name = t.name);

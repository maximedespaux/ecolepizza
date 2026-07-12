-- ============================================================================
--  Catalogue matériel Gi.Metal (Italie) -> inventaire (matériel à vendre).
--  Source : Tarif_materiel_pizza_2026.xlsx (tarif au 1er janvier 2026).
--  Prix = PRIX STAGIAIRE HT (tarif remisé ~-10 %) ; TVA 20 % ; stock initial 0.
--  Idempotent (réexécutable sans doublon, guard sur la référence) et ciblé sur
--  l'organisme principal.
--    mysql -u root -p gds_doc_gestionary < database/gimetal_inventory.sql
-- ============================================================================

SET @org_id = (SELECT id FROM organization ORDER BY created_at LIMIT 1);

INSERT INTO inventory_item (id, organization_id, name, category, sku, quantity, unit_price, tax_rate, threshold)
SELECT uuid(), @org_id, t.name, t.category, t.sku, 0, t.price, 20.00, 0 FROM (
  SELECT 'Rectangulaire perforée 33×33 cm, manche 60 cm (Azzurra)'      AS name, 'Pelle à enfourner'      AS category, 'A-32RF/60'      AS sku, 98.91  AS price UNION ALL
  SELECT 'Rectangulaire perforée 33×33 cm, manche 120 cm (Azzurra)',           'Pelle à enfourner',           'A-32RF/120',           107.82 UNION ALL
  SELECT 'Rectangulaire perforée 36×36 cm, manche 60 cm (Azzurra)',            'Pelle à enfourner',           'A-37RF/60',            116.01 UNION ALL
  SELECT 'Rectangulaire perforée 36×36 cm, manche 120 cm (Azzurra)',           'Pelle à enfourner',           'A-37RF/120',           124.92 UNION ALL
  SELECT 'Rectangulaire perforée 33×33 cm, manche 60 cm (Evoluzione)',         'Pelle à enfourner',           'E-32RF/60',            121.23 UNION ALL
  SELECT 'Rectangulaire perforée 33×33 cm, manche 120 cm (Evoluzione)',        'Pelle à enfourner',           'E-32RF/120',           136.08 UNION ALL
  SELECT 'Ronde perforée Ø 23 cm, manche 75 cm (inox)',                        'Pelle à défourner',           'I-23F/75',             85.41  UNION ALL
  SELECT 'Ronde perforée Ø 23 cm, manche 120 cm (inox)',                       'Pelle à défourner',           'I-23F/120',            88.65  UNION ALL
  SELECT 'Napolitaine rectangulaire perforée 36×36 cm, manche 150 cm',         'Pelle napolitaine',           'AN-37RF/150',          136.26 UNION ALL
  SELECT 'Napolitaine ronde perforée Ø 23 cm, manche 150 cm',                  'Pelle napolitaine',           'IN-23F/150',           94.14  UNION ALL
  SELECT 'Brosse de nettoyage four, manche 120 cm',                            'Nettoyage',                   'AC-SP/120',            80.64  UNION ALL
  SELECT 'Recharge brosse',                                                    'Nettoyage',                   'R-SP',                 27.63  UNION ALL
  SELECT 'Spatule inox 20 cm',                                                 'Spatule',                     'AC-STP20',             17.73  UNION ALL
  SELECT 'Spatule souple 10 cm',                                               'Spatule',                     'AC-STF10',             9.81   UNION ALL
  SELECT 'Spatule rigide',                                                     'Spatule',                     'AC-ST',                7.65   UNION ALL
  SELECT 'Coupe-pâte',                                                         'Coupe-pâte / Roulette',       'AC-TPM',               7.65   UNION ALL
  SELECT 'Roulette à pizza',                                                   'Coupe-pâte / Roulette',       'AC-ROM',               9.45   UNION ALL
  SELECT 'Plaque ronde Ø 28 cm',                                               'Cuisson / Plaque',            'RONDE',                7.65   UNION ALL
  SELECT 'Plaque 40×60 cm',                                                    'Cuisson / Plaque',            'PLAQUE',               25.20  UNION ALL
  SELECT 'Grille perforée 40×60 cm',                                           'Cuisson / Plaque',            'GRILLE PERF.',         21.60  UNION ALL
  SELECT 'Pince plaque',                                                       'Cuisson / Plaque',            'AC-PZP2',              28.80  UNION ALL
  SELECT 'Planche Telgia 30×70 cm',                                            'Cuisson / Plaque',            'PLANCHE TELGIA',       85.50  UNION ALL
  SELECT 'Support mural pour pelle',                                           'Support pelle',               'AC-APL',               28.62  UNION ALL
  SELECT 'Thermomètre',                                                        'Thermomètre',                 'CF913',                17.60  UNION ALL
  SELECT 'Louche pochon bleue',                                                'Louche',                      'AC-BT1',               16.20  UNION ALL
  SELECT 'Louche pochon ivoire',                                               'Louche',                      'AC-BT2',               19.71  UNION ALL
  SELECT 'Louche plate inox',                                                  'Louche',                      'AC-BT3',               19.71  UNION ALL
  SELECT 'Biberon valve 455 ml',                                               'Biberon',                     'VALVE 455 ML',         8.91   UNION ALL
  SELECT 'Biberon couleurs 1 L',                                               'Biberon',                     'COULEURS 1L',          7.20   UNION ALL
  SELECT 'Veste brodée Molinel (uniquement pour nos stagiaires)',              'Textile',                     'VESTE BRODÉ MOLINEL',  58.00
) t WHERE NOT EXISTS (
  SELECT 1 FROM inventory_item i WHERE i.organization_id = @org_id AND i.sku = t.sku
);

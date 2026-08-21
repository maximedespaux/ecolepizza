-- ============================================================================
--  Revert du catalogue Gi.Metal : retire les références seedées par
--  database/gimetal_inventory.sql pour l'organisme principal.
--    mysql -u root -p gds_doc_gestionary < database/gimetal_inventory_revert.sql
-- ============================================================================

SET @org_id = (SELECT id FROM organization ORDER BY created_at LIMIT 1);

DELETE FROM inventory_item
WHERE organization_id = @org_id
  AND sku IN (
    'A-32RF/60','A-32RF/120','A-37RF/60','A-37RF/120','E-32RF/60','E-32RF/120',
    'I-23F/75','I-23F/120','AN-37RF/150','IN-23F/150','AC-SP/120','R-SP',
    'AC-STP20','AC-STF10','AC-ST','AC-TPM','AC-ROM','RONDE','PLAQUE',
    'GRILLE PERF.','AC-PZP2','PLANCHE TELGIA','AC-APL','CF913','AC-BT1',
    'AC-BT2','AC-BT3','VALVE 455 ML','COULEURS 1L','VESTE BRODÉ MOLINEL'
  );

-- 047_revert_document_conditions.sql
-- ROLLBACK MANUEL de 047_document_conditions.sql — à jouer À LA MAIN uniquement.
-- ⚠ Supprime toutes les conditions personnalisées. Les modèles qui les référencent
--   (applies_when.conditions) ignoreront simplement les slugs disparus.
DROP TABLE IF EXISTS document_condition;

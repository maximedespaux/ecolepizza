-- 048_revert_condition_fields.sql
-- ROLLBACK MANUEL de 048_condition_fields.sql. ⚠ Réinitialise le choix des champs
-- activés (retour aux valeurs par défaut). Les conditions existantes restent valides.
DROP TABLE IF EXISTS condition_field;

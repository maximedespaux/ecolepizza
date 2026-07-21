-- 103_revert_hygiene_suite.sql
-- Ordre inverse de la création : hs_entry porte les clés étrangères vers les deux autres tables.
DROP TABLE IF EXISTS hs_entry;
DROP TABLE IF EXISTS hs_preset;
DROP TABLE IF EXISTS hs_cleaning_task;
DROP TABLE IF EXISTS hs_equipment;

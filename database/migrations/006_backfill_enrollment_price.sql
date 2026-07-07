-- ============================================================================
--  Migration 006 — Renseigner le prix des dossiers importés (CA inscriptions)
--  L'import CSV crée les inscriptions sans prix (enrollment.price = NULL), ce qui
--  laisse la part « inscriptions » du chiffre d'affaires à 0 en Comptabilité.
--  On recopie le tarif catalogue de la formation (training_program.price) sur
--  chaque dossier qui n'a pas encore de prix — SANS écraser un prix déjà saisi.
--    mysql -u root -p gds_doc_gestionary < database/migrations/006_backfill_enrollment_price.sql
-- ============================================================================

UPDATE enrollment e
  JOIN training_session s ON s.id = e.session_id
  JOIN training_program p ON p.id = s.program_id
   SET e.price = p.price
 WHERE e.price IS NULL
   AND p.price IS NOT NULL;

-- Vérification : combien de dossiers ont désormais un prix ?
-- SELECT COUNT(*) AS avec_prix FROM enrollment WHERE price IS NOT NULL;

-- 068_revert_signed_pdf.sql — ROLLBACK MANUEL.
DROP TABLE IF EXISTS document_signed_pdf;
ALTER TABLE learner DROP COLUMN IF EXISTS sign_cert;

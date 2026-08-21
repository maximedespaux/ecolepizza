-- 085_company_stamp.sql
-- Cachet / signature enregistrée de l'entreprise (image base64, data URL), utilisée
-- par le représentant pour signer les documents entreprise en un clic.
ALTER TABLE company
    ADD COLUMN IF NOT EXISTS stamp MEDIUMTEXT DEFAULT NULL AFTER user_id;

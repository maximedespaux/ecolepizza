-- 087_template_company_sign.sql
-- Un modèle de document STAGIAIRE peut être « signé par l'entreprise » (devis,
-- convention…) : quand le dossier est financé par une entreprise, c'est le
-- représentant qui signe à la place du stagiaire. Sinon le stagiaire signe lui-même.
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS company_sign TINYINT(1) NOT NULL DEFAULT 0 AFTER stagiaire_sign;

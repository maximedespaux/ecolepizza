-- 079_org_vat_rate.sql
-- Taux de TVA de l'organisme (pour les jetons Prix HT / TVA / Prix TTC des documents).
-- Par défaut 0 : la formation professionnelle est le plus souvent exonérée de TVA
-- (art. 261-4-4° du CGI). Le prix stocké est considéré comme le montant HT (base).
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2) NOT NULL DEFAULT 0;

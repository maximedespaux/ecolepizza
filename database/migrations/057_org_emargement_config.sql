-- 057_org_emargement_config.sql
-- Configuration (JSON) de la feuille d'émargement personnalisable par organisme :
-- titre, couleur d'accent, lignes d'en-tête affichées, lignes participants,
-- pied de page, cachet. NULL = mise en page par défaut.
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS emargement_config longtext DEFAULT NULL;

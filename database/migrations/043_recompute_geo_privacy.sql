-- 043_recompute_geo_privacy.sql
-- Confidentialité de la carte : les particuliers ne sont localisés qu'à la VILLE
-- (jamais l'adresse perso), les professionnels à l'adresse de leur entreprise.
-- On efface les coordonnées à recalculer pour appliquer ces règles au prochain
-- « Géolocaliser » :
--   · professionnels (adresse entreprise) ;
--   · particuliers géocodés trop précisément (numéro/rue).
UPDATE learner
   SET lat = NULL, lng = NULL, geo_precision = NULL, geocoded_at = NULL
 WHERE financing = 'PROFESSIONNEL'
    OR geo_precision IN ('housenumber', 'street');

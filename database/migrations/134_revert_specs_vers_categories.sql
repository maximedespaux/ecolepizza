/* 134_revert_specs_vers_categories.sql
   RETIRE DES CATÉGORIES LES LIBELLÉS RECOPIÉS DEPUIS `specs`.

   ⚠ CE REVERT NE PEUT PAS DISTINGUER ce que la migration a ajouté de ce que l'école a saisi
   elle-même. Si quelqu'un a tapé « Électrique » à la main sur un produit, ce fichier l'effacera
   aussi — les deux valeurs sont rigoureusement identiques en base, rien ne les sépare.

   C'est la limite de toute migration de DONNÉES, par opposition à une migration de schéma : on
   peut reprendre une colonne, pas dénouer une valeur de son voisinage. À ne jouer que peu après
   l'aller, avant que l'école n'ait retouché ses catégories.

   `specs` n'a jamais été supprimée : les caractéristiques d'origine sont donc intactes, et
   rejouer la 134 les remettra. Ce qui se perd ici, c'est uniquement le travail de saisie fait
   ENTRE les deux. */

/* On retire chaque libellé, puis on nettoie les séparateurs devenus doubles ou orphelins. */
UPDATE partner_product SET category = TRIM(BOTH ', ' FROM REPLACE(
    CONCAT(', ', category, ', '),
    CONCAT(', ', CASE JSON_UNQUOTE(JSON_EXTRACT(specs, '$.energie'))
        WHEN 'ELECTRIQUE' THEN 'Électrique' WHEN 'GAZ' THEN 'Gaz' WHEN 'BOIS' THEN 'Bois'
        WHEN 'COMBINE' THEN 'Bois + gaz' WHEN 'HYBRIDE' THEN 'Hybride'
        WHEN 'CONVOYEUR' THEN 'Convoyeur'
        ELSE JSON_UNQUOTE(JSON_EXTRACT(specs, '$.energie')) END, ', '), ', '))
  WHERE specs IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(specs, '$.energie')) IS NOT NULL;

UPDATE partner_product SET category = TRIM(BOTH ', ' FROM REPLACE(
    CONCAT(', ', category, ', '),
    CONCAT(', ', JSON_UNQUOTE(JSON_EXTRACT(specs, '$.temp_max_c')), ' °C, '), ', '))
  WHERE specs IS NOT NULL AND JSON_EXTRACT(specs, '$.temp_max_c') IS NOT NULL;

UPDATE partner_product SET category = TRIM(BOTH ', ' FROM REPLACE(
    CONCAT(', ', category, ', '),
    CONCAT(', ', JSON_UNQUOTE(JSON_EXTRACT(specs, '$.pizzas')), ' pizzas, '), ', '))
  WHERE specs IS NOT NULL AND JSON_EXTRACT(specs, '$.pizzas') IS NOT NULL;

UPDATE partner_product SET category = TRIM(BOTH ', ' FROM REPLACE(
    CONCAT(', ', category, ', '), ', sole rotative, ', ', '))
  WHERE specs IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(specs, '$.sole_rotative')) IN ('true', '1');

UPDATE partner_product SET category = TRIM(BOTH ', ' FROM REPLACE(
    CONCAT(', ', category, ', '), ', AVPN, ', ', '))
  WHERE specs IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(specs, '$.avpn')) IN ('true', '1');

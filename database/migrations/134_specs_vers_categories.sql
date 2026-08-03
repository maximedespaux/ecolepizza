/* 134_specs_vers_categories.sql
   LES CARACTÉRISTIQUES FIGÉES DEVIENNENT DES CATÉGORIES LIBRES.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE BASCULE.

   Les fiches produits portaient DEUX rangées d'étiquettes qui se recoupaient : les catégories
   saisies par l'école (« Four, 400 °C, électrique »), et des caractéristiques calculées depuis la
   colonne JSON `specs` (« Électrique, 400 °C, 9 pizzas »). Sur un même four, « 400 °C » et
   « électrique » s'affichaient donc DEUX FOIS, l'une à côté de l'autre.

   Le vrai défaut n'est pas le doublon, c'est que `specs` est une liste FERMÉE : `energie`,
   `temp_max_c`, `pizzas`, `sole_rotative`, `avpn`. Ajouter un critère — « deux chambres », « pierre
   réfractaire », « hotte intégrée » — demande de modifier le code. Une catégorie libre séparée
   par des virgules n'a pas cette limite, et l'école la remplit elle-même.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   ⚠ À JOUER AVANT DE DÉPLOYER LE CODE QUI RETIRE LES BADGES, sans quoi douze produits sur seize
   perdent l'affichage de leurs caractéristiques entre les deux. Rien n'est détruit — `specs`
   reste en place — mais l'information disparaît de l'écran tant que cette migration n'est pas
   passée.

   ELLE RECOPIE EXACTEMENT CE QUI ÉTAIT AFFICHÉ, dans le même ordre et avec les mêmes libellés
   (« Électrique », « 450 °C », « 9 pizzas », « sole rotative », « AVPN ») : le stagiaire ne doit
   voir aucune différence, à ceci près que les doublons disparaissent.

   `chambres` N'EST PAS REPRISE : elle existe dans le JSON mais n'a jamais été affichée. La
   recopier ferait APPARAÎTRE une information nouvelle sous couvert de migration — si l'école la
   veut, elle l'ajoutera elle-même, en connaissance de cause.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   REJOUABLE SANS RISQUE. Chaque libellé n'est ajouté que s'il n'est pas DÉJÀ présent dans
   `category` (comparaison insensible à la casse, sur la valeur entourée de virgules pour ne pas
   confondre « 400 °C » avec « 1400 °C »). Rejouer le fichier ne duplique donc rien.

   `specs` N'EST PAS SUPPRIMÉE, et ce n'est pas un oubli : `specs.devis` pilote toujours le message
   « Sur devis auprès du partenaire » du comparateur de prix. Seuls les BADGES cessent d'en être
   tirés. */

/* La recherche d'un libellé se fait sur `category` ENTOURÉE DE VIRGULES, et espaces retirés
   autour des séparateurs : sans cela, « 400 °C » se retrouverait dans « 1400 °C » et le libellé
   ne serait jamais ajouté. */

/* --- 1. Énergie ------------------------------------------------------------------------------ */
UPDATE partner_product SET category = CONCAT(COALESCE(NULLIF(category, ''), ''),
        IF(COALESCE(category, '') = '', '', ', '),
        CASE JSON_UNQUOTE(JSON_EXTRACT(specs, '$.energie'))
            WHEN 'ELECTRIQUE' THEN 'Électrique' WHEN 'GAZ' THEN 'Gaz' WHEN 'BOIS' THEN 'Bois'
            WHEN 'COMBINE' THEN 'Bois + gaz' WHEN 'HYBRIDE' THEN 'Hybride'
            WHEN 'CONVOYEUR' THEN 'Convoyeur'
            ELSE JSON_UNQUOTE(JSON_EXTRACT(specs, '$.energie')) END)
  WHERE specs IS NOT NULL
    AND JSON_UNQUOTE(JSON_EXTRACT(specs, '$.energie')) IS NOT NULL
    AND CONCAT(',', REPLACE(LOWER(COALESCE(category, '')), ', ', ','), ',') NOT LIKE
        CONCAT('%,', LOWER(CASE JSON_UNQUOTE(JSON_EXTRACT(specs, '$.energie'))
            WHEN 'ELECTRIQUE' THEN 'Électrique' WHEN 'GAZ' THEN 'Gaz' WHEN 'BOIS' THEN 'Bois'
            WHEN 'COMBINE' THEN 'Bois + gaz' WHEN 'HYBRIDE' THEN 'Hybride'
            WHEN 'CONVOYEUR' THEN 'Convoyeur'
            ELSE JSON_UNQUOTE(JSON_EXTRACT(specs, '$.energie')) END), ',%');

/* --- 2. Température maximale ----------------------------------------------------------------- */
UPDATE partner_product SET category = CONCAT(COALESCE(NULLIF(category, ''), ''),
        IF(COALESCE(category, '') = '', '', ', '),
        CONCAT(JSON_UNQUOTE(JSON_EXTRACT(specs, '$.temp_max_c')), ' °C'))
  WHERE specs IS NOT NULL
    AND JSON_EXTRACT(specs, '$.temp_max_c') IS NOT NULL
    AND CONCAT(',', REPLACE(LOWER(COALESCE(category, '')), ', ', ','), ',') NOT LIKE
        CONCAT('%,', LOWER(CONCAT(JSON_UNQUOTE(JSON_EXTRACT(specs, '$.temp_max_c')), ' °c')), ',%');

/* --- 3. Nombre de pizzas ---------------------------------------------------------------------- */
UPDATE partner_product SET category = CONCAT(COALESCE(NULLIF(category, ''), ''),
        IF(COALESCE(category, '') = '', '', ', '),
        CONCAT(JSON_UNQUOTE(JSON_EXTRACT(specs, '$.pizzas')), ' pizzas'))
  WHERE specs IS NOT NULL
    AND JSON_EXTRACT(specs, '$.pizzas') IS NOT NULL
    AND CONCAT(',', REPLACE(LOWER(COALESCE(category, '')), ', ', ','), ',') NOT LIKE
        CONCAT('%,', LOWER(CONCAT(JSON_UNQUOTE(JSON_EXTRACT(specs, '$.pizzas')), ' pizzas')), ',%');

/* --- 4. Sole rotative ------------------------------------------------------------------------- */
UPDATE partner_product SET category = CONCAT(COALESCE(NULLIF(category, ''), ''),
        IF(COALESCE(category, '') = '', '', ', '), 'sole rotative')
  WHERE specs IS NOT NULL
    AND JSON_UNQUOTE(JSON_EXTRACT(specs, '$.sole_rotative')) IN ('true', '1')
    AND CONCAT(',', REPLACE(LOWER(COALESCE(category, '')), ', ', ','), ',') NOT LIKE '%,sole rotative,%';

/* --- 5. AVPN ---------------------------------------------------------------------------------- */
UPDATE partner_product SET category = CONCAT(COALESCE(NULLIF(category, ''), ''),
        IF(COALESCE(category, '') = '', '', ', '), 'AVPN')
  WHERE specs IS NOT NULL
    AND JSON_UNQUOTE(JSON_EXTRACT(specs, '$.avpn')) IN ('true', '1')
    AND CONCAT(',', REPLACE(LOWER(COALESCE(category, '')), ', ', ','), ',') NOT LIKE '%,avpn,%';

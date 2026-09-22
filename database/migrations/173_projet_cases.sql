/* 173_projet_cases.sql
   « VOTRE PROJET » S'ÉTOFFE — quinze cases, demandées par l'école le 2026-09-22.

   LE TYPE D'ACTIVITÉ : pizzeria sur place, à emporter ou livraison, pizza à la part, distributeur
   automatique, traiteur ou événementiel, pizza en complément d'un commerce existant (boulangerie,
   bar, camping). L'ÉQUIPEMENT : pétrin, laminoir ou façonneuse, saladette ou vitrine réfrigérée, et
   le four DÉJÀ ACHETÉ (sous la case « Four », avec son type, cf. la 172). L'AVANCEMENT : local
   trouvé, financement obtenu, ouverture prévue sous six mois, accompagnement souhaité. Et l'intérêt
   pour une formation complémentaire.

   CHACUNE SA COLONNE, TINYINT(1) NOT NULL DEFAULT 0, comme les neuf cases déjà en place : c'est la
   forme que lisent les conditions de documents — une colonne booléenne devient une condition
   cochable sans rien écrire de plus. Les fiches existantes prennent 0, ce qui est juste : personne
   n'a pu cocher une case qui n'existait pas.

   CE QUI PART AUX PARTENAIRES : le type d'activité et l'équipement, qui disent « la nature du
   projet » à laquelle le stagiaire a consenti. PAS l'avancement ni l'intérêt pour une formation :
   ce sont des signaux commerciaux qu'on ne lui a pas annoncés (cf. src/api/lib/projet.js).

   LE CODE MARCHE AVANT ET APRÈS : la liste blanche d'écriture est filtrée sur les colonnes que la
   table porte, et les lectures de l'export et de la liste sont tolérantes. Sans la migration, les
   nouvelles cases ne s'enregistrent pas — et le formulaire le DIT.

   Rejouable sans risque (ADD COLUMN IF NOT EXISTS). AUCUN POINT-VIRGULE dans les commentaires ni les
   chaînes : le client SQL de l'organisme découpe sur ce caractère (cf. la 146). */

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS project_dine_in TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : pizzeria sur place (salle). Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_takeaway TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : a emporter ou livraison. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_by_slice TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : pizza a la part (al taglio). Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_vending TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : distributeur automatique. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_catering TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : traiteur ou evenementiel. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_add_on TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : pizza en complement d un commerce existant. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_kneader TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : petrin. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_sheeter TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : laminoir ou faconneuse. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_fridge_counter TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : saladette ou vitrine refrigeree. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_oven_owned TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : four deja achete. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_premises TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : local trouve. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_funded TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : financement obtenu. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_opening_soon TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : ouverture prevue sous 6 mois. Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_support TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : accompagnement souhaite (business plan). Cf. migration 173.',
    ADD COLUMN IF NOT EXISTS project_more_training TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : interesse par une formation complementaire. Cf. migration 173.';

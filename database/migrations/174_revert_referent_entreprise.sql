/* 174_revert_referent_entreprise.sql
   Retour arriere de 174.

   LE PRENOM N'EST PAS PERDU : avant de retirer sa colonne, il rejoint representative_name, dans la
   forme d'avant la 174, tout en capitales (« JEAN DUPONT »). Ce qui se perd, c'est le LIEN vers le
   stagiaire referent : l'entreprise garde son nom, mais ne suivra plus sa fiche.

   A ne jouer QU'APRES la 174, et avec l'ancien code : sans ses colonnes, l'UPDATE echoue sur une
   colonne inconnue (sans dommage, rien n'est alors a defaire). AUCUN POINT-VIRGULE dans les
   commentaires ni les chaines (cf. la 146). */

UPDATE company
   SET representative_name = UPPER(TRIM(CONCAT(representative_first_name, ' ', COALESCE(representative_name, ''))))
 WHERE representative_first_name IS NOT NULL AND TRIM(representative_first_name) <> '';

ALTER TABLE company
    DROP FOREIGN KEY IF EXISTS fk_company_referent_learner;

ALTER TABLE company
    DROP COLUMN IF EXISTS representative_learner_id,
    DROP COLUMN IF EXISTS representative_first_name;

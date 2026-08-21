/* 135_revert_partner_champs_transmis.sql
   REPREND LES DEUX COLONNES.

   ⚠ CE QUI SE PERD N'EST PAS SYMÉTRIQUE. Le choix de l'école (`partner_fields`) se reconfigure en
   trois clics ; `consent_record.champs` est une PREUVE, et elle est irremplaçable : elle dit ce
   qui a été annoncé à chaque personne le jour de sa réponse. Une fois la colonne reprise, plus
   rien ne distingue un « oui » donné pour trois champs d'un « oui » donné pour huit.

   Le code retombe alors sur les six champs d'origine pour tout le monde — ce qui redevient juste,
   puisque c'est ce que le texte annonçait avant cette migration, mais devient FAUX si l'école
   avait entre-temps restreint sa liste.

   Noter la liste retenue avant de jouer ce fichier. */

ALTER TABLE organization
    DROP COLUMN IF EXISTS partner_fields;

ALTER TABLE consent_record
    DROP COLUMN IF EXISTS champs;

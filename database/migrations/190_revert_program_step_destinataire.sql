/* 190_revert_program_step_destinataire.sql
   Retire le destinataire des jalons du parcours. Les jalons adresses a l'entreprise redeviennent
   des jalons du stagiaire : ils reviennent dans le decompte du stagiaire et sortent de celui de
   l'entreprise (un dossier a 100 % peut redescendre le temps qu'ils soient recus cote stagiaire).
   Le code retombe sur la branche « colonne absente » : tout va au stagiaire, comme avant la 190.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaines (cf. la 146). */

ALTER TABLE program_step
    DROP COLUMN IF EXISTS destinataire;

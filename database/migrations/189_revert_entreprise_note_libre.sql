/* 189_revert_entreprise_note_libre.sql
   Retire la note libre de l'entreprise. Les notes deja saisies sont perdues (aucune autre colonne
   ne les conserve). Le code retombe alors sur la branche « colonne absente » : la fiche
   s'enregistre comme avant et dit que la note n'a pas ete prise.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaines (cf. la 146). */

ALTER TABLE company
    DROP COLUMN IF EXISTS note_libre;

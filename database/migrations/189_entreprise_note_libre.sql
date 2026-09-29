/* 189_entreprise_note_libre.sql
   UNE NOTE EN TEXTE SIMPLE SUR LA FICHE DE L'ENTREPRISE, 128 MOTS AU PLUS.

   Demande du 2026-09-29 : comme la note libre du stagiaire (168), une section « Note » sur la
   fiche entreprise, en texte simple, limitee a 128 mots. Ecrite et lue par L'ECOLE (le bureau)
   seule : le representant de l'entreprise ne la voit pas dans son espace.

   TEXT ET NON VARCHAR, MEME RAISON QUE LA 168 : la limite est en MOTS, pas en caracteres. Le
   serveur la verifie a l'enregistrement (company.controller, refus au-dela de 128 mots) avec le
   meme compte que l'ecran pendant la frappe, et refuse aussi un texte de plus de 5000 caracteres
   (un collage sans espace ne compterait qu'un seul mot).

   « note_libre » ET NON « note », comme pour le stagiaire : dans cette base une note est aussi une
   note d'EVALUATION (grilles, notation, jury). Le nom dit qu'il s'agit d'un texte, pas d'un chiffre.

   SANS ELLE, la fiche s'enregistre comme avant et DIT que la note n'a pas ete prise (champ
   facultatif, reponse `ignores`). Rejouable sans risque : colonne ajoutee si absente.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaines (le client SQL de l'organisme decoupe
   sur ce caractere, cf. la 146). */

ALTER TABLE company
    ADD COLUMN IF NOT EXISTS note_libre TEXT DEFAULT NULL;

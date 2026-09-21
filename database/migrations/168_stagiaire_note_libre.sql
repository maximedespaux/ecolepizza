/* 168_stagiaire_note_libre.sql
   UNE NOTE EN TEXTE SIMPLE SUR LA FICHE DU STAGIAIRE, 128 MOTS AU PLUS.

   Demandé le 2026-09-21 : dans la fiche d'un stagiaire, à la création comme en modification, une
   section « Note » sous « Votre projet », en texte simple, limitée à 128 mots. Elle s'affiche sur
   la fiche, dans la carte « Projet ».

   « note_libre » ET NON « note » : dans cette base, une note est aussi une note d'ÉVALUATION
   (grilles, notation, jury). Le nom dit qu'il s'agit d'un texte, pas d'un chiffre.

   TEXT ET NON VARCHAR : la limite est en MOTS, pas en caractères. Le serveur la vérifie à
   l'enregistrement (learner.controller, refus au-delà de 128 mots) avec le même compte que
   l'écran pendant la frappe, et refuse aussi un texte de plus de 5000 caractères — un collage sans
   espace ne compterait qu'un seul mot.

   ÉCRITE PAR L'ÉCOLE SEULE. L'espace du stagiaire écrit sa propre liste de champs, où elle n'est
   pas, et aucune de ses réponses ne renvoie la fiche entière.

   SANS ELLE, la fiche s'enregistre comme avant et DIT que la note n'a pas été prise (champ
   facultatif, réponse `ignores`). Rejouable sans risque : colonne ajoutée si absente.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaînes : le client SQL de l'organisme découpe
   sur ce caractère (cf. la 146). */

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS note_libre TEXT DEFAULT NULL;

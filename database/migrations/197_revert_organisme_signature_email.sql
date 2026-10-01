/*
  REVERT de la 197 — retire la signature des e-mails.

  CE QUI SE PERD : la signature enregistrée (logo propre, badges, réseaux, texte des labels). Les
  e-mails reviennent aussitôt à leur pied de page en texte (nom, e-mail, téléphone, adresse), qui
  n'a jamais cessé d'exister — le code retombe dessus dès que la colonne n'est plus là.
*/
ALTER TABLE organization DROP COLUMN IF EXISTS email_signature;

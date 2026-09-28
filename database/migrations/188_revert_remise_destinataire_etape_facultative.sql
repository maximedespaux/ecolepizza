/*
  188_revert_remise_destinataire_etape_facultative.sql

  CE QUI SE PERD :
    · le destinataire des types de remise : tout redevient remis au STAGIAIRE. Un document déjà
      déposé pour une entreprise passe dans l'espace du stagiaire, et c'est lui qui devra en
      accuser réception s'il ne l'a pas été. Les accusés déjà donnés restent (statut et date) ;
    · les étapes facultatives : toutes comptent de nouveau dans l'avancement, et un dossier à
      100 % peut redescendre.
*/

ALTER TABLE program_step
    DROP COLUMN IF EXISTS facultatif;

ALTER TABLE remise_type
    DROP COLUMN IF EXISTS destinataire;

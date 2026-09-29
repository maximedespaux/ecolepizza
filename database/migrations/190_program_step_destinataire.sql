/* 190_program_step_destinataire.sql
   LE DESTINATAIRE D'UN JALON DU PARCOURS : le stagiaire (defaut) ou son ENTREPRISE.

   Demande du 2026-09-29 : un document remis comme les CGV peut etre adresse a l'entreprise du
   stagiaire OU au stagiaire lui-meme, et ce choix se fait JALON PAR JALON, dans Formations ->
   Parcours documentaire (a cote de la case « Facultatif » de la 188). Comme n'importe quel jalon
   du parcours : adresse a l'entreprise, il parait et se compte DU COTE ENTREPRISE (fiche
   entreprise, espace du representant), et sort du decompte du stagiaire.

   PORTE PAR program_step, PAS PAR document_template : c'est un reglage PAR FORMATION (le meme
   document peut aller a l'entreprise dans une formation et au stagiaire dans une autre), exactement
   comme `active`, `or_group`, `applies_when` et `facultatif` (188). A ne pas confondre avec
   `remise_type.destinataire` (188), qui vise les Documents remis et garde son propre chemin.

   varchar(12) NOT NULL DEFAULT 'STAGIAIRE', MEME FORME que `remise_type.destinataire` : deux
   valeurs, 'STAGIAIRE' ou 'ENTREPRISE', le defaut etant le comportement d'avant (tout au stagiaire).

   LE CODE MARCHE AVANT ET APRES. Sans la colonne, tout va au stagiaire, et choisir « entreprise »
   sur un jalon repond « migration 190 non jouee » plutot que d'etre ignore en silence. Une
   entreprise SANS espace (aucun compte de representant) recoit de toute facon au stagiaire : sinon
   personne ne pourrait recevoir le document, comme pour les remises (188).

   ⚠ LA PRESENCE DE LA CLE NE PROUVE RIEN : sans la colonne, l'API rend `destinataire: 'STAGIAIRE'`.
   Verification sur une VALEUR : cocher « Entreprise » sur un jalon, enregistrer sans avertissement,
   puis GET /api/formations/:id/steps rend `destinataire: 'ENTREPRISE'` sur ce jalon. Ou une requete,
   qui doit rendre 1 :
     SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE()
       AND table_name = 'program_step' AND column_name = 'destinataire'.

   Rejouable sans risque (ADD COLUMN IF NOT EXISTS). Revert fourni.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaines (le client SQL de l'organisme decoupe
   sur ce caractere, cf. la 146). */

ALTER TABLE program_step
    ADD COLUMN IF NOT EXISTS destinataire varchar(12) NOT NULL DEFAULT 'STAGIAIRE';

/* 167_organisme_forme_juridique.sql
   LA FORME JURIDIQUE DE L'ORGANISME, ET SA VILLE EN CAPITALES.

   Demandé le 2026-09-21 : dans Paramètres → Organisme, choisir le statut juridique de l'organisme
   dans une liste (SAS, SARL, EI…, en capitales), et écrire la ville en capitales.

   LA FORME JURIDIQUE N'AVAIT PAS DE COLONNE. Le jeton {Forme juridique organisme} existait, mais
   seule l'ENTITÉ ÉMETTRICE d'une facture (billing_profile, migration 113) la portait : hors
   facture, le jeton sortait vide sur tous les documents — convention, contrat, attestation.
   La colonne est facultative, comme les autres réglages récents : sans elle, l'écran enregistre
   le reste et le dit (organization.controller, OPTIONAL).

   LA VILLE suit la règle posée pour les stagiaires et les entreprises par la 162 : capitales,
   accents conservés. Le code l'applique désormais à chaque enregistrement de l'organisme, et cette
   instruction reprend la ville DÉJÀ saisie (« Lannemezan » sur le papier à en-tête le jour de la
   demande). Comparaison sur les OCTETS, pour la raison écrite dans la 162 : la collation ignore
   la casse, et « Lannemezan » y serait égal à « LANNEMEZAN ».

   AUCUN POINT-VIRGULE dans les commentaires ni les chaînes : le client SQL de l'organisme découpe
   sur ce caractère (cf. la 146). Rejouable sans risque : colonne ajoutée si absente, ville
   modifiée seulement si elle n'est pas déjà en capitales. */

ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS legal_status VARCHAR(40) DEFAULT NULL AFTER short_name;

UPDATE organization
   SET town = UPPER(TRIM(town))
 WHERE town IS NOT NULL
   AND CAST(town AS BINARY) <> CAST(UPPER(TRIM(town)) AS BINARY);

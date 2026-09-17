/* 165_titres_documents.sql
   LE TITRE DES DOCUMENTS DÉJÀ CRÉÉS : le code du type remplacé par l'intitulé du modèle.

   Vu le 2026-09-17 sur la fiche d'un stagiaire RS7404 : « R_GLEMENT_EXAMEN », « LIVRET_ACCUEIL ».
   Quand personne ne saisissait de titre, un document prenait le libellé de son TYPE dans une table
   du code qui ne connaît que les types d'origine (devis, contrat, CGV…). Pour tous les autres — le
   livret d'accueil, et chaque modèle créé par l'école, dont le type est le slug en capitales — il
   gardait le CODE brut, et c'est ce nom qui figurait ensuite dans le courriel d'envoi et sur le
   fichier téléchargé. Le code prend désormais l'intitulé du modèle (`titreParDefaut`) ; cette
   migration corrige les documents qui existent déjà.

   CE QUE ÇA CHANGE, relevé en production le 2026-09-17 par l'API (coffre documentaire, documents
   partagés) : 9 documents sur 1 226 — 5 « LIVRET_ACCUEIL » et 4 « R_GLEMENT_EXAMEN », tous envoyés,
   aucun signé. Des documents préparés mais pas encore envoyés peuvent s'y ajouter : cette liste-là
   ne les montre pas.

   CE QUI EST TOUCHÉ, ET RIEN D'AUTRE : un document dont le titre est EXACTEMENT son type. C'est
   la signature du repli — personne ne tape « LIVRET_ACCUEIL » à la main.

   ⚠ LA COMPARAISON SE FAIT SUR LES OCTETS, pour la raison écrite dans la 162 : la collation
   ignore la casse, et un titre « Cgv » saisi à la main serait pris pour le repli « CGV ».

   LES DOCUMENTS SIGNÉS NE BOUGENT PAS. Le titre entre dans le `<title>` du HTML rendu, et
   l'empreinte d'une signature est calculée sur ce HTML : renommer un document signé, ce serait
   modifier après coup ce qui a été signé. Aucun n'est concerné aujourd'hui ; la règle vaut pour
   ceux qu'une base plus ancienne porterait.

   DEUX SOURCES D'INTITULÉ, dans cet ordre :
   1. la ligne `document_template` de l'organisme — le modèle tel que l'école l'a nommé ;
   2. à défaut, l'intitulé du SOCLE écrit dans le code (lib/documents.js, DEFAULT_STEPS), pour un
      modèle jamais personnalisé, qui n'a pas de ligne en base — ou dont la ligne ne porte pas
      d'intitulé. Seuls les types absents de la table du code y figurent ; un test vérifie que ces
      intitulés recopiés restent ceux du code.

   Rejouable sans risque : un document corrigé n'a plus pour titre son type, il n'est plus
   sélectionné. Migration de DONNÉES : elle se vérifie sur la fiche, pas au schéma. */

UPDATE generated_document d
  JOIN document_template t
    ON t.organization_id = d.organization_id AND t.slug = d.template_slug
   SET d.title = TRIM(t.label)
 WHERE d.status NOT IN ('SIGNE', 'ARCHIVE')
   AND CAST(d.title AS BINARY) = CAST(d.type AS BINARY)
   AND t.label IS NOT NULL AND TRIM(t.label) <> '';

UPDATE generated_document d
   SET d.title = CASE d.template_slug
         WHEN 'livret-accueil' THEN 'Livret d''accueil'
         WHEN 'attestation-assiduite' THEN 'Attestation d''assiduité'
         WHEN 'diplome' THEN 'Diplôme'
         WHEN 'evaluation-satisfaction' THEN 'Évaluation de satisfaction'
       END
 WHERE d.status NOT IN ('SIGNE', 'ARCHIVE')
   AND CAST(d.title AS BINARY) = CAST(d.type AS BINARY)
   AND d.template_slug IN ('livret-accueil', 'attestation-assiduite', 'diplome', 'evaluation-satisfaction');

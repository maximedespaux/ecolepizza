/* 157_document_session_externe.sql
   UN DOCUMENT DE SESSION, SIGNÉ PAR UN INTERVENANT EXTERNE.

   LE BESOIN. Un contrat d'hygiène ne concerne ni un stagiaire ni une entreprise : il concerne
   LA SESSION, et il est signé par l'intervenant externe qui y est affecté, puis contresigné par
   l'organisme. Rien ne permettait de le produire : un document est soit par stagiaire
   (`scope = 'LEARNER'`), soit par entreprise (`'COMPANY'`, migration 077).

   UNE TROISIÈME PORTÉE, ET RIEN DE PLUS. `session_id` existe déjà sur la table depuis la 077 :
   il ne manquait que la valeur d'énumération pour dire « ce document appartient à la session ».
   `learner_id` et `company_id` restent NULL — ce n'est le document de personne en particulier.

   CE QU'ON N'A PAS AJOUTÉ, ET POURQUOI. Aucun drapeau sur le modèle : l'éligibilité se lit sur
   les SIGNATAIRES déjà déclarés. Un modèle dont la case « Externe » est cochée est un document
   qu'un intervenant peut signer ; c'est exactement le critère que l'organisme a en tête, et il
   se règle déjà dans l'éditeur de modèles. Ajouter une seconde case aurait créé deux vérités
   sur la même question — et l'occasion qu'elles se contredisent.

   LA CASE DU SIGNATAIRE EST ATTRIBUÉE À UN COMPTE. `document_signature.user_id` existe depuis
   la migration 061, commentée « signataire attribué (compte) », et n'a JAMAIS été écrite : deux
   ans d'échafaudage posé pour précisément cet usage. C'est lui qu'on branche — l'intervenant
   retrouve dans son espace ce qui lui est attribué, et le signe avec sa signature enregistrée,
   sans lien partageable ni jeton qui circule par courriel.

   L'ORGANISME SIGNE APRÈS, TOUT SEUL : `applySlotSignature` appose déjà la signature visible de
   l'organisme quand une partie signe (« l'organisme signe en DERNIER »), puis re-scelle le PDF.
   Aucun code à écrire pour ça. */

ALTER TABLE generated_document
    MODIFY COLUMN scope ENUM('LEARNER','COMPANY','SESSION') NOT NULL DEFAULT 'LEARNER';

/* Retrouver les documents d'une session, et eux seuls, sans balayer la table. */
ALTER TABLE generated_document
    ADD INDEX IF NOT EXISTS idx_doc_session_scope (organization_id, session_id, scope);

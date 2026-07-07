# 04 — Génération documentaire

Dans `rewrite`, un document n'est pas un `.docx` converti par un service externe :
c'est un **rendu HTML serveur** (fidèle, imprimable depuis le navigateur) pour les
documents courants, et un **PDF Factur-X** pour les factures. Pas de docxtemplater,
pas de Gotenberg.

## Pipeline

1. **Sélection** — `documentSetFor()` (`lib/documents.js`) calcule le jeu de
   documents du dossier selon `financing`, `rs_code`, `hygiene`, `jours`
   (cf. `03_WORKFLOWS.md`).
2. **Préparation** — l'admin crée un `generated_document` (statut `A_FAIRE`),
   éventuellement relié à plusieurs inscriptions via `document_formation`
   (regroupement de formations sur un même document).
3. **Fusion & aperçu** — `renderDocumentHTML(type, ctx, title)` (`lib/render.js`)
   assemble le contexte (organisme + stagiaire + entreprise + formations) et
   produit le HTML du document. Toutes les valeurs sont échappées (`esc()`).
4. **Envoi** — `POST /documents/:id/send` passe le statut à `ENVOYE` (`sent_at`).
   Tant qu'un document n'est pas envoyé, le stagiaire ne peut pas le remplir/signer.
5. **Signature** — le stagiaire signe depuis « Mon espace » (cf. `05_SIGNATURE.md`) ;
   statut `SIGNE`, `signed_at`, `signer_name`, `signature_data` enregistrés.

## Contexte de fusion

`loadContext()` (`document.controller.js`) charge :

- l'**organisme** (`organization`) — identité, SIRET, coordonnées ;
- le **stagiaire** (`learner`) ;
- l'**entreprise** (`company`) si au moins une formation est financée en
  professionnel ;
- les **formations** du document (jointure `document_formation` → `enrollment` →
  `training_session` → `training_program`) : code, titre, durée, heures, prix,
  hygiène, `rs_code`, dates, semaine/année, financement.

## Types de documents

`DEVIS`, `CONTRAT`, `CONVENTION`, `DROIT_IMAGE`, `CONVOCATION`, `INVITATION`,
`CERTIFICAT_REALISATION`, `PROGRAMME`, `ATTESTATION_HYGIENE`, `FICHE_SEMAINE`,
`TEST_POSITIONNEMENT`, `EMARGEMENT`, `EVALUATION_MANAGEUR`, `EVALUATION_FINANCEUR`,
`CGV`. Les libellés d'affichage sont dans `TYPE_LABELS` (`document.controller.js`).

Documents signables par le stagiaire : `DEVIS`, `CONTRAT`, `CONVENTION`,
`DROIT_IMAGE`.

## Factures — Factur-X (facture électronique)

Les factures suivent la réglementation française de facturation électronique via
`lib/facturx.js` :

- **PDF/A-3** avec **XML CII EN 16931** embarqué (profil BASIC), construit avec
  `pdf-lib` ; `AFRelationship /Alternative`, tableau `/AF`, métadonnées XMP.
- TVA en **exonération** (art. 261-4-4° CGI) pour la formation professionnelle.
- Mentions obligatoires émises systématiquement (conditions de paiement, identifiant
  fiscal vendeur — n° TVA sinon SIRET) pour passer la validation EN 16931
  (règles BR-CO-25, BR-S-02).

Endpoints : `GET /factures/:id/facturx` (PDF), `GET /factures/:id/xml` (XML seul).

## Différences vs `dev`

`dev` s'appuie sur 24 modèles `.docx`, docxtemplater et Gotenberg (LibreOffice)
pour produire des PDF, plus un classement type Google Drive. `rewrite` obtient un
résultat équivalent (aperçu fidèle, impression, envoi, signature) **sans aucun
service externe**, en rendant le document en HTML côté serveur ; seules les
factures deviennent un vrai PDF (Factur-X) parce que la réglementation l'exige.

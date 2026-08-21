# 05 — Signature électronique

`rewrite` implémente une **signature par tracé manuscrit** (canvas), simple et
autonome — **pas de prestataire Yousign**, pas de clé API, pas de webhook. C'est
une signature électronique simple avec horodatage, adaptée aux documents de
l'organisme (devis, contrat/convention, droit à l'image).

## Flux réel

1. L'admin **prépare** puis **envoie** le document (statut `A_FAIRE` → `ENVOYE`).
   Un stagiaire ne peut rien signer tant que le document n'est pas envoyé.
2. Le stagiaire ouvre le document depuis **« Mon espace »**. Le contrôleur vérifie
   la **propriété** (`learner.user_id = req.user.id`) : il ne voit que ses documents.
3. Il signe dans `SignatureModal.jsx` (composant `<canvas>` : tracé à la souris/au
   doigt, converti en image `dataURL`).
4. `POST /documents/:id/sign` avec `{ signer_name, signature_data }` :
   - re-vérifie l'accès (propriétaire, ou personnel autorisé) ;
   - passe le statut à `SIGNE`, enregistre `signed_at`, `signer_name`,
     `signature_data` (le tracé) sur `generated_document` ;
   - journalise l'action (`audit_log`) ;
   - crée une **notification** « Document signé » pour l'organisme.
5. L'aperçu du document réaffiche ensuite le tracé signé (`signature_data`).

## Preuve conservée

- Nom du signataire (`signer_name`) et **horodatage** serveur (`signed_at`).
- Image du **tracé** (`signature_data`).
- Entrée d'**audit** horodatée (`audit_log`).

Ce niveau correspond à une signature simple. Les tables `signature_request` /
`signature_recipient` (héritées de la pile `dev`/Yousign) n'étaient pas utilisées
et ont été supprimées lors du nettoyage (migration 007) : tout est porté par
`generated_document`.

## Différences vs `dev`

`dev` décrit Yousign v3 (création de demande, upload PDF, signataires, OTP
e-mail/SMS, webhook HMAC `signature_request.done`, niveaux eIDAS avancé/qualifié).
Rien de tout cela n'est utilisé dans `rewrite` : la signature est **locale**,
gratuite et sans dépendance, ce qui suffit au périmètre actuel. Un connecteur
externe resterait une évolution possible sans changer le modèle de données.

# 05 — Signature électronique (Yousign v3)

**La signature s'exécute exclusivement côté serveur.** La clé API ne doit jamais
atteindre le navigateur. Module : `src/lib/signature/yousign.ts`.

## Flux

1. `createSignatureRequest(name, level)` → demande en brouillon.
2. `uploadDocument(requestId, pdf, filename)` → attache le PDF.
3. `addSigner(requestId, documentId, signer)` → ajoute chaque signataire avec son
   mode d'authentification (`otp_email` / `otp_sms`).
4. `activate(requestId)` → envoie les invitations.
5. On sauvegarde `providerRequestId` dans `SignatureRequest`.
6. **Webhook** `signature_request.done` (HMAC SHA-256, en-tête
   `X-Yousign-Signature-256`) : vérification, puis `downloadSignedDocument()` +
   dossier de preuve → stockage Drive/S3 → statut `SIGNEE` → email automatique.

## Réglages par défaut (par type de document)

| Document | Niveau | Auth |
|---|---|---|
| Devis | simple | OTP email/SMS |
| Contrat / Convention | avancée | OTP SMS |
| Droit à l'image | simple | OTP email |
| Certificat | signature organisme (cachet) | — |

Sandbox gratuit : `https://api-sandbox.yousign.app/v3`. Niveaux eIDAS : simple,
avancé, qualifié.

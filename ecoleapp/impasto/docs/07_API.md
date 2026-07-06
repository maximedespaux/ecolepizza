# 07 — API

API REST scopée par organisme. Auth : session NextAuth (interne) ou clé d'API
(`ApiKey`, hashée) pour l'accès externe. Rate limit + `AuditLog`.

## Endpoints (point 18)

```
GET    /api/stagiaires            # liste (filtre ?q=)
POST   /api/stagiaires            # création (Zod)
GET    /api/formations
POST   /api/sessions
POST   /api/documents/generate    # génère DOCX/PDF d'un dossier
POST   /api/signatures/send       # envoie en signature (Yousign)
GET    /api/documents/:id/download
POST   /api/webhooks/yousign      # HMAC SHA-256
POST   /api/webhooks/stripe
```

## Conventions

- Réponses : `{ "data": ... }` (succès) ou `{ "error": ..., "details": ... }`.
- Codes : 200/201 succès, 400 JSON invalide, 401 webhook/clé invalide,
  403 permission, 422 validation, 429 rate limit.
- Sécurité : clé `Authorization: Bearer <api_key>`, permissions par rôle,
  journalisation systématique.

Déjà implémenté : `GET/POST /api/stagiaires`, `POST /api/webhooks/yousign`.
À venir (Phase 1+) : formations, sessions, documents/generate, signatures/send.

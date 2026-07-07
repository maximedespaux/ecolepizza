# 07 — API

API REST scopée par organisme (`organizationId`). Réponses `{ data }` (succès) ou
`{ error, details }` (échec). Validation **Zod**, journalisation **AuditLog** sur les
écritures. Codes : 200/201 succès · 400 JSON invalide · 401 auth/OTP · 403 permission ·
404 introuvable · 409 conflit/garde-fou · 422 validation.

## Endpoints (34 routes)

### CRM / dossiers
```
GET    /api/stagiaires            POST /api/stagiaires
GET    /api/stagiaires/[id]       (+ PATCH/DELETE)
GET    /api/enrollments           POST /api/enrollments
PATCH  /api/enrollments/[id]      # avance le pipeline (blocage strict avant « Inscrit »)
DELETE /api/enrollments/[id]      # garde-fou si documents/factures liés
```

### Formations & sessions
```
GET/POST   /api/formations        PATCH/DELETE /api/formations/[id]
PUT        /api/formations/reorder # glisser-déposer (ordre)
GET/POST   /api/sessions          GET /api/sessions/[id]
PATCH      /api/sessions/[id]     # statut ou déplacement (semaine/année → dates)
DELETE     /api/sessions/[id]     # garde-fou si stagiaires inscrits
```

### Documents & signature
```
GET  /api/documents               GET /api/documents/[id]
POST /api/documents/generate      # sur une SESSION programmée → jeu de docs 1→N
GET  /api/documents/[id]/download # ?format=pdf | ?signed=1 | ?inline=1 | ?learnerId=…
POST /api/signatures              # crée la demande + token
GET  /api/signatures/[token]      POST /api/signatures/[token]/otp
POST /api/signatures/[token]/sign # OTP + consentement + tracé → hash PDF + PDF signé
```
> `download?learnerId=…` applique le **contrôle d'accès étudiant côté serveur**
> (propriété + dossier complet). Sans `learnerId` (admin) → accès complet.

### Comptabilité / gestion
```
GET  /api/comptabilite            # onglet Gestion (CA, postes, marge, dividendes)
GET  /api/comptabilite/performance# onglet Performance (récap annuel + N-1)
POST/DELETE /api/comptabilite/depenses[/[id]]
POST/DELETE /api/comptabilite/revenus[/[id]]
PUT  /api/comptabilite/cibles     # cibles de gestion éditables
```

### Développement & divers
```
GET  /api/carte                   # stagiaires géolocalisés (niveau, upsell)
GET/POST /api/partenaires         PATCH/DELETE /api/partenaires/[id]
GET/POST /api/ventes              DELETE /api/ventes/[id]
GET  /api/audit                   GET/PATCH /api/organisation
POST /api/students/login          POST /api/students/access
POST /api/webhooks/yousign        # HMAC SHA-256
```

## Conventions

- Sécurité : scope `organizationId` systématique ; contrôle d'accès étudiant vérifié
  **côté serveur** (pas seulement l'UI) ; webhooks vérifiés (HMAC).
- Idempotence : `documents/generate` ne recrée pas une session/inscription existante.
- Rate limit + clé `Authorization: Bearer <api_key>` (hashée) prévus pour l'accès externe.

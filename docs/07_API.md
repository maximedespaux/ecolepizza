# 07 — API REST

Serveur Express (`src/api`). Base : `http://localhost:3000/api`. Toutes les
réponses sont en JSON : `{ data }` / `{ message }` en succès, `{ error }` /
`{ message }` en erreur. Chaque endpoint (hors auth/login) exige un **JWT** (cookie
httpOnly) et est **scopé par `organization_id`** pris du jeton. Les écritures
sensibles sont journalisées (`audit_log`).

## Rôles et gardes

`middlewares/auth.middleware.js` expose :

- `authenticateToken` — vérifie le JWT (HS256), remplit `req.user`.
- `authorizeRoles(...roles)` — restreint à une liste de rôles.
- Groupes : `STAFF_ROLES` = bureau **+ formateur** ; `ADMIN_ROLES` = bureau
  (super admin, admin organisme, secrétariat) ; `AUDIT_ROLES` = bureau + auditeur.

Le **formateur** est le seul rôle « staff » exclu de `ADMIN_ROLES` : les routes
réservées au bureau sont gardées par `ADMIN_ROLES`, les routes pédagogiques par
`STAFF_ROLES` (détail par page dans `08_PAGES.md`).

## Endpoints (par domaine)

### Authentification
```
POST /auth                 # connexion (limiteur anti-force brute)
GET  /auth/me              # session courante
POST /auth/logout
```

### CRM / dossiers
```
GET/POST      /stagiaires             # lecture STAFF ; création bureau
GET           /stagiaires/:id         # lecture STAFF
PATCH/DELETE  /stagiaires/:id         # bureau
POST          /stagiaires/:id/reset-password   # bureau
GET/POST      /companies
GET/POST      /enrollments            # bureau
PATCH         /enrollments/:id        # bureau — avance le crm_stage (pipeline)
DELETE        /enrollments/:id        # bureau
GET/POST/DELETE /enrollments/:id/notes[/:noteId]   # notes CRM (bureau)
```

### Formations & sessions
```
GET           /formations             # STAFF (le formateur consulte les programmes)
GET           /formations/:id         # STAFF
POST          /formations             # bureau
GET           /sessions  /sessions/:id   # lecture STAFF (émargement)
POST/DELETE   /sessions[/:id]         # bureau
GET/POST      /attendance/:sessionId[/generate]   # émargement — STAFF (formateur inclus)
PATCH         /attendance/record/:id  # présence — STAFF
```

### Documents & signature
```
GET   /documents?learner_id=…         # liste — STAFF
POST  /documents                      # préparer — bureau
POST  /documents/:id/send             # envoyer — bureau
DELETE/documents/:id                  # bureau
GET   /documents/:id                  # lecture (propriétaire stagiaire ou personnel)
POST  /documents/:id/sign             # signature par tracé (propriétaire ou personnel)
```

### Comptabilité / gestion
```
GET   /comptabilite                   # onglet Gestion (CA, postes, marge, dividendes) — bureau
GET   /comptabilite/performance       # onglet Performance (récap N-1) — bureau
POST/DELETE /comptabilite/depenses[/:id]      # bureau
PUT   /comptabilite/cibles            # cibles éditables — bureau
GET   /comptabilite/revenus?annee=…   # produits divers — STAFF (formateur inclus)
POST/DELETE /comptabilite/revenus[/:id]       # STAFF (formateur inclus)
```

### Ventes, inventaire, facturation
```
GET/POST/DELETE /ventes[/:id]         # ventes de matériel — bureau
POST  /ventes/checkout                # panier → décrément stock + facture auto — bureau
GET/POST /inventaire  + PATCH/POST/DELETE /inventaire/:id[...]   # stock — bureau
GET/POST/PATCH/DELETE /factures[...]  # factures & paiements — bureau
GET   /factures/:id/facturx           # PDF Factur-X (PDF/A-3 + XML)
GET   /factures/:id/xml               # XML CII seul
```

### Espace stagiaire
```
GET /mon-espace                       # situation documentaire du stagiaire connecté
GET /mon-espace/formations[/:id]      # formations et leurs documents
```

### Divers
```
GET/POST      /partenaires            # annuaire — bureau
GET           /suivi                  # suivi Qualiopi — bureau + auditeur
GET/PATCH     /organisation           # réglages organisme — bureau
GET           /audit                  # journal d'audit — bureau + auditeur
GET           /notifications  + PATCH /:id/read  + POST /read-all
GET           /badges                 # pastilles (stock bas, impayés) — silencieux
POST          /user                   # création de compte — bureau (org du jeton)
```

## Conventions

- **Scope** : `organization_id` toujours pris du jeton, jamais du corps.
- **Idempotence / garde-fous** : suppressions vérifiées (`affectedRows`), stock
  contrôlé avant décrément au checkout.
- **Chargement** : le front affiche une barre de progression globale sauf pour les
  requêtes marquées « silencieuses » (badges, notifications en polling).

## Différences vs `dev`

Absents ici (spécifiques à la pile `dev`) : `/api/carte` (géolocalisation),
`/api/students/login|access`, `/api/webhooks/yousign`, `/api/formations/reorder`,
`/api/signatures/*`. Les fonctions correspondantes sont soit réalisées autrement
(signature locale), soit non portées faute de colonnes/services (carte).

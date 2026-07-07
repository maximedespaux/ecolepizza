# 01 — Architecture

## Décision : front et API séparés, simples

Deux applications indépendantes qui communiquent en REST/JSON :

- **`src/app`** — SPA React (Vite + React Router). Aucune logique serveur ; elle
  consomme l'API via `ui/api/apiClient.js` (fetch + cookie de session).
- **`src/api`** — serveur Express. Toute la logique métier, l'accès MySQL, la
  génération documentaire et les gardes de sécurité vivent ici.

Pas de rendu côté serveur, pas d'ORM, pas de build partagé : chaque côté a son
`package.json`. C'est volontairement minimal.

## Couches (côté API)

1. **Routes** — `src/api/routes/*.routes.js` : déclarent les endpoints et les
   **gardes de rôle** (`authenticateToken` + `authorizeRoles(...)`).
2. **Contrôleurs** — `src/api/controllers/*.controller.js` : validation, requêtes
   SQL (`mysql2`, callbacks ou `db.promise()`), réponses `{ data }` / `{ error }`.
3. **Domaine** — `src/api/lib/*` : règles métier pures et réutilisables
   (`documents.js`, `compta.js`, `render.js`, `facturx.js`, `crypto.js`,
   `audit.js`), testables hors Express.
4. **Config** — `src/api/config/` : connexion MySQL (`database.js`) et `.env`.

## Couches (côté front)

- **`layouts/`** — `AppLayout` (bureau : barre latérale + topbar) et
  `StudentLayout` (espace stagiaire : en-tête simple).
- **`pages/`** — une page par écran (voir `08_PAGES.md`).
- **`components/`** — briques réutilisables (`PageHead`, `Card`, `Kpi`, `Field`,
  `Badge`, `SignatureModal`, `Emargement`, `Roadmap`, `LoadingBar`…).
- **`context/`** — `UserContext` (session/rôle), `ThemeContext` (clair/sombre).
- **`lib/`** — `nav.js` (menu + rôles), `format.js`, `calendar.js`,
  `loading.js` (barre de chargement globale), `events.js` (rafraîchissement des
  pastilles).
- **`api/apiClient.js`** — toutes les fonctions d'appel réseau.
- **`styles/app.css`** — design system maison (tokens `--navy`, `--ember1`,
  `--surface`… ; classes `.card .btn .kpi .pagehead .field .inp .badge`…).

## Arborescence réelle

```txt
ecolepizza/
├── database/
│   ├── schema.sql            # toutes les tables (SQL brut MySQL/MariaDB)
│   ├── seed.sql              # organisme + formations + démo
│   └── migrations/           # 001…005 (ajouts incrémentaux, exécutés à la main)
├── document/                 # spécifications formelles (fonctionnel/technique/qualité)
├── docs/                     # cette documentation (logique des modules/pages)
└── src/
    ├── api/
    │   ├── server.js         # montage des routes + middlewares de sécurité
    │   ├── config/           # database.js + .env
    │   ├── routes/           # *.routes.js (gardes de rôle)
    │   ├── controllers/      # *.controller.js
    │   ├── middlewares/      # auth.middleware.js, rateLimit.js
    │   ├── lib/              # documents, render, facturx, compta, crypto, audit…
    │   └── scripts/          # import-stagiaires.js (import CSV)
    └── app/
        └── ui/
            ├── main.jsx      # routes + gardes (RoleRoute), branche stagiaire/bureau
            ├── layouts/  pages/  components/  context/  lib/  api/  styles/
```

## Sécurité (principes réellement appliqués)

- **Multi-tenant** : chaque requête est filtrée par `organization_id`, pris **du
  jeton** (jamais du corps de la requête).
- **JWT** signé HS256 avec expiration ; cookie httpOnly `sameSite: Lax`.
- **Gardes de rôle** par route (`authorizeRoles`) — trois niveaux internes :
  bureau (`ADMIN_ROLES`), **formateur** (accès pédagogique restreint) et auditeur
  (`AUDIT_ROLES`). Détail dans `08_PAGES.md`.
- **Contrôle de propriété stagiaire côté serveur** : un stagiaire ne lit/signe
  que ses propres documents (vérifié dans le contrôleur, pas seulement l'UI).
- **Anti-force brute** : limiteur en mémoire sur la connexion (`rateLimit.js`).
- **Données sensibles** : n° de sécurité sociale chiffré AES-256-GCM (`crypto.js`).
- **En-têtes de sécurité** de base + limite de taille de corps (`server.js`).
- **Journal d'audit** : `logAudit()` trace les actions sensibles (`audit_log`).
- **Secrets** en variables d'environnement uniquement (`config/.env`).

## Chaîne documentaire (rewrite)

```txt
Dossier (enrollment) + règles          renderDocumentHTML(type, ctx)
  documentSetFor()  ─────────────────►  aperçu HTML fidèle (impression navigateur)
        │                                        │
        │  admin : préparer → ENVOYER            │  stagiaire : lire → SIGNER (tracé)
        ▼                                        ▼
  generated_document (A_FAIRE → ENVOYE → SIGNE, signature_data stockée)

Facture ──► lib/facturx.js ──► PDF/A-3 + XML CII EN 16931 (Factur-X BASIC)
```

Contrairement à `dev` (docxtemplater + Gotenberg + Yousign), `rewrite` génère un
**aperçu HTML** pour les documents courants et un **PDF Factur-X** pour les
factures, sans service externe.

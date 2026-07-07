# Impasto — ERP de formation (École Pizzaïolo Jean-Jacques Despaux)

Application de secrétariat pour organisme de formation : CRM/pipeline, dossiers
stagiaires, génération documentaire, signature électronique (tracé manuscrit),
émargement, suivi Qualiopi, facturation électronique (Factur-X), comptabilité de
gestion, ventes de matériel et espace stagiaire.

> Ces documents décrivent **la logique de chaque module et de chaque page** telle
> qu'elle est réellement implémentée dans la branche `rewrite`. Ils reprennent le
> contenu métier des docs de la branche `dev` mais **adaptés à la pile actuelle**
> (voir ci-dessous). Toute mention de Prisma, Docker, Gotenberg, Yousign,
> NextAuth ou Stripe présente dans `dev` **ne s'applique pas ici** — la logique
> équivalente est réalisée autrement, décrite dans chaque chapitre.

## Pile technique (à ne pas changer — « keep it simple »)

| Couche | Technologie |
|---|---|
| Front | **React 19 + Vite + React Router** (CSS maison, pas de Tailwind) |
| API | **Node.js + Express** |
| Base | **MySQL / MariaDB** via `mysql2` (**SQL brut**, pas d'ORM) |
| Auth | **JWT** (cookie httpOnly) + **bcrypt** |
| Données sensibles | n° de sécurité sociale chiffré **AES-256-GCM** au repos |
| Documents | rendu **HTML** serveur (aperçu/impression) ; factures **Factur-X** (PDF/A-3 + XML EN 16931) |
| Signature | **tracé manuscrit** (canvas) + horodatage, stocké sur le document |

Pas de conteneur, pas de service de conversion externe, pas de dépendance
cloud : l'application tourne avec `node` + un serveur MySQL local.

## Démarrage

```bash
# 1. Base de données
mysql -u root -p < database/schema.sql          # crée les tables
mysql -u root -p gds_doc_gestionary < database/seed.sql   # données de démo
# migrations additionnelles éventuelles :
mysql -u root -p gds_doc_gestionary < database/migrations/005_comptabilite.sql

# 2. API
cd src/api && npm install && npm run dev         # http://localhost:3000

# 3. Front
cd src/app && npm install && npm run dev         # http://localhost:5173
```

Variables d'environnement de l'API dans `src/api/config/.env`
(`JWT_SECRET`, `SSN_ENC_KEY` = 64 caractères hexadécimaux, connexion MySQL).

## État des modules

| Module | État |
|---|---|
| Schéma MySQL (SQL brut) | ✅ `database/schema.sql` |
| CRUD Stagiaires / Formations / Sessions | ✅ |
| **Pipeline CRM** (10 étapes `crm_stage`) | ✅ `pages/Pipeline.jsx` |
| **Génération documentaire** (aperçu HTML, envoi, signature) | ✅ `lib/documents.js`, `lib/render.js`, `document.controller.js` |
| **Signature électronique** (tracé + horodatage) | ✅ `SignatureModal.jsx`, `POST /documents/:id/sign` |
| **Émargement** (feuilles + présence) | ✅ `Emargement.jsx`, `attendance.controller.js` |
| **Suivi Qualiopi** (score de conformité, feuille de route) | ✅ `Suivi.jsx`, `suivi.controller.js` |
| **Facturation Factur-X** (PDF/A-3 + XML) | ✅ `lib/facturx.js` |
| **Comptabilité** (Gestion + Performance N-1) | ✅ `Comptabilite.jsx`, `lib/compta.js` |
| **Ventes de matériel** (panier → facture auto) | ✅ `Ventes.jsx`, `sale.controller.js` |
| **Inventaire** (stock, seuils) | ✅ `Inventaire.jsx` |
| **Espace stagiaire** (documents, formations, atelier pâte) | ✅ `MonEspace.jsx`, `MesFormations.jsx`, `Atelier.jsx` |
| **Journal d'audit** | ✅ `Audit.jsx`, `lib/audit.js` |
| Rôles (bureau / **formateur** / auditeur / stagiaire) | ✅ voir `08_PAGES.md` |

## Sommaire

- `01_ARCHITECTURE.md` — couches, arborescence, conventions.
- `02_DATABASE.md` — tables MySQL, énumérations, relations.
- `03_WORKFLOWS.md` — cycle de vie d'un dossier et automatisations.
- `04_DOCUMENTS.md` — génération documentaire (règles + rendu).
- `05_SIGNATURE.md` — signature électronique par tracé.
- `06_QUALIOPI.md` — suivi Qualiopi et score de conformité.
- `07_API.md` — endpoints REST réels.
- `08_PAGES.md` — **logique de chaque page** (le cœur de cette documentation).
- `10_COMPTABILITE.md` — logique détaillée du module Comptabilité / Gestion.

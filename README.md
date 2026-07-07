# Impasto — ERP de formation (École Pizza Jean-Jacques Despaux)

Application SaaS de secrétariat pour organisme de formation : CRM/pipeline, dossiers
stagiaires, **génération documentaire réelle (DOCX + PDF)**, **signature électronique**
(simple + dossier de preuve), suivi Qualiopi, **comptabilité de gestion**, carte des
stagiaires, espace stagiaire, et API.

> Destiné d'abord à l'École Pizzaïolo Jean-Jacques Despaux (Lannemezan, 65), puis
> revendable à d'autres centres. Multi-tenant dès la conception (`organizationId`).

---

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript**
- **PostgreSQL** + **Prisma** (multi-tenant)
- **Tailwind** + design system CSS maison (`src/app/globals.css`)
- **Gotenberg** (LibreOffice/Chromium headless) pour DOCX→PDF, HTML→PDF et fusion PDF
- **docxtemplater** + **pizzip** pour le remplissage des modèles Word
- Signature **propriétaire, niveau simple (SES)** + dossier de preuve (SHA-256, horodatage, IP)
- Stockage de fichiers **géré par l'app** (`.storage/`, abstraction remplaçable par Drive/S3)

---

## Démarrage

### 1. Dépendances
```bash
npm install
```

### 2. Base de données PostgreSQL
Deux options :
- **Postgres.app** (macOS, sans Docker) — créez un rôle/base `impasto` (voir `DATABASE_URL`).
- **Docker** : `docker compose up -d db`

### 3. Moteur PDF (Gotenberg) — requis pour les PDF et les signatures
```bash
docker compose up -d gotenberg   # http://localhost:3001
```
> Sur macOS sans Docker Desktop, **OrbStack** convient (pas de droits root). Sans moteur
> PDF, la génération DOCX fonctionne mais les PDF/signatures PDF sont indisponibles
> (message explicite renvoyé).

### 4. Variables d'environnement
```bash
cp .env.example .env      # puis renseigner au minimum DATABASE_URL et NEXTAUTH_SECRET
```
Clés utiles : `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOTENBERG_URL` (défaut `http://localhost:3001`),
`YOUSIGN_*`, `GOOGLE_*`, `STRIPE_*` (intégrations optionnelles).

### 5. Schéma + données de démonstration
```bash
npm run db:push     # applique le schéma Prisma
npm run db:seed     # organisme + 9 formations + 23 partenaires + démo compta
```

### 6. Lancer
```bash
npm run dev         # http://localhost:3000 → /dashboard
```

> ⚠️ Ne pas lancer `npm run build` (production) pendant que `npm run dev` tourne : les
> deux écrivent dans `.next` et se corrompent. Arrêter le dev avant de builder.

---

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` / `npm run start` | build + serveur de production |
| `npm run typecheck` | `tsc --noEmit` (garde-fou principal, pas de suite de tests) |
| `npm run lint` | `next lint` |
| `npm run db:push` | synchronise le schéma (dev) |
| `npm run db:migrate` | migration versionnée |
| `npm run db:seed` | données de démonstration (idempotent) |
| `npm run db:studio` | explorateur Prisma |

---

## Architecture

Application Next.js unique (pas de monorepo). Modules métier rangés dans `src/lib/*`.
Alias d'import : `@/*` → `src/*`.

**Quatre couches** :
1. **Présentation** — `src/app/(app)/*/page.tsx` (Server Components lisant Prisma) +
   `src/components/*Client.tsx` (interactivité). Écritures via API Routes.
2. **API** — `src/app/api/*/route.ts` : REST, validation Zod, scopé `organizationId`,
   convention `{ data }` / `{ error }`, `AuditLog` sur les actions sensibles.
3. **Domaine** — `src/lib/*` : logique métier pure (documents, signature, compta, pédago).
4. **Intégrations** — Gotenberg, Yousign, Google, Stripe : côté serveur uniquement.

### Invariants
- **Multi-tenant** : tout est filtré par `organizationId`.
- **Journal d'audit inviolable** : chaque `prisma.auditLog.create()` est chaîné en SHA-256
  (extension Prisma dans `src/lib/db.ts`). Toujours utiliser le singleton `prisma` de `@/lib/db`.
- **Langue** : UI, commentaires et documents en **français**.

### Arborescence
```txt
impasto/
├── prisma/
│   ├── schema.prisma          # 31 modèles + enums (voir docs/02_DATABASE.md)
│   └── seed.ts                # organisme + catalogue + démo (idempotent)
├── src/
│   ├── app/
│   │   ├── (app)/             # pages connectées (AppShell + rôles)
│   │   │   ├── dashboard, stagiaires, calendrier, sessions, documents,
│   │   │   ├── suivi, comptabilite, formations, partenaires, carte,
│   │   │   ├── ventes, reglages, audit, mon-espace
│   │   ├── login, signer/[token]
│   │   └── api/               # 34 routes REST (voir docs/07_API.md)
│   ├── components/            # *Client.tsx + calendrier/ + student/ + ui/
│   └── lib/
│       ├── db.ts, audit.ts, toast.ts, pedago.ts
│       ├── auth/              # roles, profiles (démo), password
│       ├── compta/            # targets (cibles de gestion)
│       ├── documents/         # rules, tokens, templates, template-files,
│       │                      # generate (Gotenberg), produce, conformite
│       ├── signature/         # proof (SHA-256/OTP), attestation, yousign
│       ├── storage/           # local (mini-Drive app), drive (stub)
│       └── ecole-pizza/       # organisme, catalogue(s), partenaires, assets
├── templates/                 # 24 modèles Word (.docx) École Pizza
├── public/ecole/              # visuels des niveaux + logo
├── docs/                      # documentation (ce dossier)
├── docker-compose.yml         # PostgreSQL + Gotenberg
└── .storage/                  # fichiers générés/signés (non versionné)
```

---

## Modules construits

| Module | Détails |
|---|---|
| **CRM / Pipeline** | Kanban 8 colonnes (Contacté → Documents envoyés → Devis signé → Acompte reçu → Inscrit → En formation → Suivi 6 mois → Archivé). **Blocage strict** : « Inscrit » exige devis signé **et** acompte reçu. Glisser-déposer. |
| **Sessions & Calendrier** | Vue mois/semaine + pipeline. Création, **déplacement** (semaine ISO → dates recalculées) et **suppression** de sessions (garde-fou si stagiaires inscrits). |
| **Génération documentaire** | Sur **session programmée** → jeu de documents (1→N), rendu **DOCX fidèle** (docxtemplater) et **PDF** (Gotenberg), rangés par stagiaire dans `.storage/`. |
| **Signature électronique** | Dessin (canvas) + OTP + consentement → **empreinte SHA-256 du vrai PDF** + **PDF signé** (document + attestation de preuve fusionnés) rangé. Signer le devis débloque le pipeline. |
| **Espace stagiaire** | Documents **groupés par formation**, ordre fixe (Inscription / Fin), **accès conditionné** au dossier complet (devis signé + acompte reçu), vérifié **côté serveur**. Parcours pédagogique gamifié. |
| **Comptabilité / Gestion** | Onglet **Gestion** (CA auto = inscriptions + ventes matériel + produits divers ; postes vs cibles éditables ; marge/dividendes réalistes ; camemberts) + onglet **Performance** (récap annuel, comparaison N-1, ticket moyen…). |
| **Formations** | Catalogue éditable, **glisser-déposer** pour réordonner, visuels de niveau. |
| **Carte des stagiaires** | Leaflet, filtres par niveau, recherche, **ciblage 🎓 Niveau I → II/Expert**. |
| **Partenaires · Ventes · Suivi Qualiopi · Audit · Réglages** | annuaire, ventes matériel, conformité, journal chaîné, identité organisme. |

---

## Rôles

`SECRETARIAT` (admin, voit tout) · `FORMATEUR` (co-admin) · `STAGIAIRE` (ses données) ·
plus `SUPER_ADMIN`, `ADMIN_ORGANISME`, `ENTREPRISE`, `FINANCEUR`, `AUDITEUR`.
Matrice d'accès dans `src/lib/auth/roles.ts` ; navigation adaptée dans `AppShell`.

> L'authentification serveur (NextAuth) n'est pas encore câblée : un sélecteur de profil
> de démo (localStorage) permet de prévisualiser l'app par rôle ; une connexion stagiaire
> réelle existe (`/api/students/login`, mot de passe haché).

---

## Documentation

`docs/00_README.md` (vue d'ensemble) · `01_ARCHITECTURE.md` · `02_DATABASE.md` ·
`03_WORKFLOWS.md` · `04_DOCUMENTS.md` · `05_SIGNATURE.md` · `06_QUALIOPI.md` ·
`07_API.md` · `08_MISE_A_JOUR.md`. Guide pour agents IA : `CLAUDE.md`.

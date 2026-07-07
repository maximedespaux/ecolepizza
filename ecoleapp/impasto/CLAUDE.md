# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Langue

La base de code (commentaires, termes métier, interface, docs) est **en français** — écris tes réponses,
tes commentaires et les chaînes visibles par l'utilisateur en français.

## Projet

**Impasto** — un ERP/SaaS pour un organisme de formation (École Pizza Jean-Jacques Despaux) :
CRM, dossiers stagiaires, génération documentaire réelle (DOCX→PDF), signature électronique, émargement,
conformité Qualiopi, facturation, extranets et API.

Les docs de conception sont dans `docs/` (`00_README.md` … `09_*`). Elles décrivent l'architecture visée et
la feuille de route par phases ; certaines décrivent des fonctionnalités encore « à câbler / à venir », donc
vérifie le code réel avant de t'y fier.

## Commandes

```bash
npm run dev          # serveur Next → http://localhost:3000
npm run build        # next build
npm run lint         # next lint
npm run typecheck    # tsc --noEmit  (à lancer après toute modif non triviale — aucun jeu de tests n'existe)

docker compose up -d # PostgreSQL :5432 + Gotenberg :3001 (LibreOffice → PDF)

npm run db:push      # applique le schéma Prisma à la base (pas de fichiers de migration)
npm run db:migrate   # prisma migrate dev
npm run db:generate  # prisma generate (régénère le client après une modif du schéma)
npm run db:seed      # tsx prisma/seed.ts — organisme École Pizza + 9 formations
npm run db:studio    # Prisma Studio
```

Aucun framework de test n'est configuré. `npm run typecheck` est le principal garde-fou de correction.
Variables d'env requises (voir `.env.example`) : `DATABASE_URL`, `NEXTAUTH_SECRET` au minimum ; puis
`GOTENBERG_URL`, `YOUSIGN_*`, `GOOGLE_*`, `STRIPE_*` pour les intégrations.

## Architecture

Application **Next.js 15 App Router** unique (TypeScript, React 19, Tailwind) — volontairement pas un monorepo.
Les « packages » du cahier des charges existent sous forme de dossiers de modules dans `src/lib/*`.
Alias d'import : `@/*` → `src/*`.

Quatre couches :
1. **Présentation** — `src/app/(app)/*/page.tsx` sont des Server Components qui lisent Prisma directement ;
   chacune est associée à un `src/components/*Client.tsx` (Client Component) pour l'interactivité. Les écritures
   passent par les API Routes.
2. **API** — `src/app/api/*/route.ts` : REST, validation Zod, scopé par `organizationId`. Convention de réponse :
   `{ data }` en succès / `{ error, details }` en échec. Codes : 201 création, 400 JSON invalide, 401 auth,
   403 permission, 422 validation.
3. **Domaine** — `src/lib/*` : logique métier pure (documents, signature, dates, catalogue).
4. **Intégrations** — Yousign, Google, Stripe, Gotenberg : côté serveur uniquement, secrets via `process.env`.

### Multi-tenant (invariant critique)
Presque chaque modèle Prisma porte un `organizationId`. **Toute requête doit être scopée par ce champ.** Les API
Routes appellent aujourd'hui un `getOrganizationId()` bouchonné qui retourne l'organisme de démo `"org-ecole-pizza"` —
le scoping réel via la session NextAuth n'est pas encore branché. En ajoutant des requêtes, garde le filtre
`organizationId` même tant que le bouchon est en place.

### Authentification — deux systèmes en parallèle
- **Sélecteur de rôle de démo** (`src/components/RoleProvider.tsx`, `src/lib/auth/profiles.ts`) : impersonation de
  rôle côté client, basée sur localStorage, pour prévisualiser l'app selon chaque rôle. **Ce n'est pas une vraie auth.**
  L'accès aux pages par rôle est défini dans `src/lib/auth/roles.ts` (`NAV_ACCESS`, `canAccess`, `homeFor`).
- **Connexion stagiaire réelle** (`src/app/api/students/login/route.ts` + `src/lib/auth/password.ts`) : email +
  mot de passe haché contre le modèle `User`. Les modèles NextAuth existent au schéma mais le provider n'est pas
  entièrement branché.

### Journal d'audit (chaîne inviolable)
`src/lib/audit.ts` + une extension Prisma `$extends` dans `src/lib/db.ts` : **chaque `prisma.auditLog.create()` est
automatiquement chaîné en SHA-256** à l'entrée précédente (`prevHash` → `hash`). Ne fixe pas toi-même
`hash`/`prevHash`/`createdAt` ; appelle simplement `auditLog.create` avec `{ organizationId, action, entity,
entityId, metadata }` après une action sensible. Utilise toujours le singleton `prisma` exporté par `@/lib/db`
(jamais `new PrismaClient()`) pour que l'extension s'applique.

### Génération documentaire
DOCX/PDF réels à partir des modèles Word du dossier `/templates` :
- `src/lib/documents/template-files.ts` — sélectionne le bon modèle `.docx` selon le contexte (financement
  particulier/professionnel, certification RS7404, durée de session pour les feuilles d'émargement).
- `src/lib/documents/tokens.ts` — jetons de fusion + `DOCXTEMPLATER_DELIMITERS`.
- `src/lib/documents/generate.ts` — `renderDocx()` remplit le modèle (docxtemplater/pizzip), `docxToPdf()`
  convertit via Gotenberg. Une variable absente rend une chaîne vide, pas une erreur.
- `src/lib/documents/rules.ts` / `conformite.ts` — quels documents un dossier requiert, dates ISO, conformité.

### Données métier
`src/lib/ecole-pizza/*` contient l'identité de l'organisme et le catalogue (formations, produits, ressources,
partenaires) — la source de vérité unique utilisée par le seed et par l'app.

### Modèle de données
`prisma/schema.prisma` — 28 modèles, multi-tenant, plus les modèles NextAuth et les enums métier
(`Role`, `Financement`, `SessionStatus`, `CrmStage`, `DocumentType`, `DocumentStatus`, …).

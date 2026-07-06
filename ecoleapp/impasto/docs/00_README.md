# Impasto — ERP de formation (École Pizza Jean-Jacques Despaux)

Application SaaS de secrétariat pour organisme de formation : CRM, dossiers
stagiaires, génération documentaire réelle (DOCX/PDF), signature électronique,
émargement, suivi Qualiopi, facturation, extranets et API.

Ce dépôt remplace le prototype HTML statique (localStorage) par une vraie
architecture **app + serveur + base + API + webhooks**.

## Stack

Next.js 15 (App Router, TypeScript) · PostgreSQL · Prisma · NextAuth ·
docxtemplater + Gotenberg (LibreOffice) · Yousign v3 · Google APIs · Stripe.

## Démarrage rapide

```bash
# 1. Dépendances
npm install

# 2. Base de données + conversion PDF (Docker)
docker compose up -d        # PostgreSQL :5432 + Gotenberg :3001

# 3. Variables d'environnement
cp .env.example .env.local  # puis renseigner au minimum DATABASE_URL et NEXTAUTH_SECRET

# 4. Schéma + données de démo
npm run db:push             # crée les tables
npm run db:seed             # organisme École Pizza + 9 formations

# 5. Lancer
npm run dev                 # http://localhost:3000  → /dashboard
```

Outils utiles : `npm run db:studio` (explorateur Prisma), `npm run typecheck`.

## État (Phase 1 — fondation posée)

| Brique | État |
|---|---|
| Schéma Prisma (20 modèles) | ✅ `prisma/schema.prisma` |
| Données École Pizza (identité + 9 formations) | ✅ `src/lib/ecole-pizza/`, seed |
| Règles métier documents + dates ISO | ✅ `src/lib/documents/rules.ts` |
| Registre des 24 templates + jetons | ✅ `src/lib/documents/templates.ts` |
| Génération DOCX→PDF | ✅ module `src/lib/documents/generate.ts` (à brancher) |
| Client Yousign v3 | ✅ `src/lib/signature/yousign.ts` |
| Webhook Yousign (HMAC) | ✅ `src/app/api/webhooks/yousign/route.ts` |
| Stockage Drive | ✅ stub `src/lib/storage/drive.ts` |
| API stagiaires (GET/POST + Zod + audit) | ✅ `src/app/api/stagiaires/route.ts` |
| Dashboard connecté (Prisma) | ✅ `src/app/dashboard/page.tsx` |
| Authentification NextAuth | ⏳ à câbler |

## Feuille de route

- **Phase 1** Auth · CRUD stagiaires/formations/sessions · génération DOCX/PDF · suivi.
- **Phase 2** Google (Gmail, Drive, Calendar, import Sheets/Forms).
- **Phase 3** Signature Yousign · webhooks · preuve · PDF signé.
- **Phase 4** Qualiopi (checklist, preuves, score de conformité, export audit).
- **Phase 5** Facturation · Stripe · relances.
- **Phase 6** Extranets stagiaire / formateur / entreprise.
- **Phase 7** Assistant IA administratif.

Voir `docs/01_ARCHITECTURE.md` à `docs/07_API.md`.

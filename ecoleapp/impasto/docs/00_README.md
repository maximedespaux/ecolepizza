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

## État

| Brique | État |
|---|---|
| Schéma Prisma (31 modèles) | ✅ `prisma/schema.prisma` |
| Données École Pizza (identité + 9 formations + 23 partenaires) | ✅ `src/lib/ecole-pizza/`, seed |
| CRUD Stagiaires / Formations / Sessions | ✅ (+ glisser-déposer formations) |
| **CRM / Pipeline** 8 colonnes + blocage strict | ✅ `components/calendrier/PipelineBoard.tsx` |
| **Génération DOCX + PDF** (Gotenberg) rangés par stagiaire | ✅ `documents/generate.ts`, `storage/local.ts` |
| **Signature électronique** (dessin + OTP + SHA-256 + PDF signé) | ✅ `signatures/[token]/sign`, `signature/attestation.ts` |
| **Espace stagiaire** (docs par formation, accès conditionné serveur) | ✅ `MonEspaceClient.tsx` |
| **Comptabilité** (Gestion + Performance N-1) | ✅ `ComptabiliteClient.tsx`, `lib/compta/` |
| **Carte des stagiaires** (filtres, recherche, ciblage upsell) | ✅ `CarteClient.tsx` |
| Suivi Qualiopi · Partenaires · Ventes · Audit chaîné | ✅ |
| Authentification NextAuth (serveur) | ⏳ à câbler (démo par profil + login stagiaire réel) |
| Google (Gmail/Drive/Calendar) · Stripe · Brevo (emails) | ⏳ à venir |

## Feuille de route restante

- **Pipeline T2** — profil stagiaire (financement paramétrable, docs, conformité, suivi 6 mois, archivage).
- **Auth serveur** (NextAuth) + rôles réels.
- **Automatisations / relances** (Brevo + planificateur).
- **Google** (Drive réel, import Sheets/Forms) · **Stripe** (paiement acompte) · **Assistant IA**.

Voir `docs/01_ARCHITECTURE.md` à `docs/08_MISE_A_JOUR.md` et le `README.md` racine.

# 08 — Mise à jour : front + connectivité + Partenaires

Cette livraison ajoute, par-dessus la Phase 1 déjà en place :

- **Shell de navigation** (`src/components/AppShell.tsx`) reliant toutes les pages,
  avec le **logo École Pizza**, bascule de thème (four à bois / semoule) et menu mobile.
- **Routes connectées** sous le groupe `src/app/(app)/` :
  dashboard, stagiaires, sessions, documents, suivi (Qualiopi), formations,
  **partenaires** (nouveau), carte (à venir), réglages.
- **Stagiaires fonctionnels** : liste + recherche + création reliées à l'API.
- **Partenaires** (nouvelle fonctionnalité « Contrat partenaires ») : annuaire des
  23 partenaires de l'école, filtres par catégorie, création — modèles Prisma
  `Partner` + `PartnerContract`.
- **API** : `/api/formations`, `/api/sessions`, `/api/partenaires` (en plus de stagiaires).

## Appliquer la mise à jour (sans casser l'existant)

Depuis votre dossier projet `impasto` (celui qui contient déjà `package.json`,
`node_modules`, `.env`) :

1. Décompressez `ecole-pizza-app.zip` dans un dossier temporaire.
2. Copiez par-dessus votre projet (en écrasant) **uniquement** :
   - le dossier `src/`
   - le dossier `public/`
   - les fichiers `prisma/schema.prisma` et `prisma/seed.ts`
   - `docs/`
   Ne touchez pas à `.env`, `.env.local`, ni `node_modules`.
3. Mettez la base à jour (nouvelles tables Partenaires) et rechargez les données :
   ```powershell
   npm run db:push
   npm run db:seed
   npm run dev
   ```
4. Ouvrez `http://localhost:3000` → la barre latérale apparaît, toutes les pages
   sont navigables, et « Partenaires » liste vos 23 partenaires.

Aucune nouvelle dépendance npm n'est requise.

## Confidentialité (RGPD)

- Les **photos de stagiaires**, **photos personnelles** et **contrats partenaires
  réels** que vous avez fournis **n'ont pas été intégrés** au dépôt.
- Seuls le **logo** et les **noms de marques** des partenaires (données B2B
  publiques) ont été repris.
- Les données personnelles vivent uniquement dans votre PostgreSQL local et, en
  Phase 2, dans votre Google Drive privé. Le `.gitignore` exclut `.env*`.

## Rôles (préparés, branchement à venir)

`src/lib/auth/roles.ts` définit Secrétariat (Admin), Formateur (Co-Admin),
Stagiaire (accès par niveau/spécialisation), Entreprise, Financeur, Auditeur, et
la matrice d'accès par page. L'authentification NextAuth les activera au prochain module.

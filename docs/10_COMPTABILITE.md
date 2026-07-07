# 10 — Comptabilité / Gestion (logique, point par point)

Tableau de **gestion** (pas de comptabilité légale). Objectif : piloter le CA, les
postes de dépense (vs cibles), la marge et les dividendes réalistes, avec une
comparaison annuelle. Ce document décrit la logique de bout en bout, **adaptée à la
pile `rewrite`** (React + Express + MySQL, SQL brut) — pas de Prisma ni de Zod.

## 0. Fichiers (rewrite)

| Rôle | Fichier |
|---|---|
| Page (React) | `src/app/ui/pages/Comptabilite.jsx` |
| Surface allégée « produit divers » (formateur) | `src/app/ui/pages/ProduitDivers.jsx` |
| Règles (cibles, statut, conseil) | `src/api/lib/compta.js` |
| Contrôleur (agrégation + écritures) | `src/api/controllers/comptabilite.controller.js` |
| Routes + gardes de rôle | `src/api/routes/comptabilite.routes.js` |
| Client API | `src/app/ui/api/apiClient.js` (`getComptabilite`, `getComptaPerformance`, `createExpense`…) |
| Palette daltonisme (donuts) | `src/app/ui/styles/app.css` — variables `--cat-*` / `--ca-*` (clair + sombre) |
| Tables | `expense`, `revenue_extra`, `accounting_settings` (`database/migrations/005_comptabilite.sql`) |

## 1. Données sources (SQL brut, scopé `organization_id`)

- **`enrollment.price`** → CA inscriptions (rattaché à l'année via `training_session.year`).
- **`material_sale`** (`amount × quantity`, par `date`) → CA ventes de matériel.
- **`revenue_extra`** (`amount`, par `date`) → CA produits divers (commissions, subventions).
- **`expense`** (`amount_ht`, enum `category`, par `date`) → dépenses.
- **`accounting_settings`** (`targets` JSON + `dividende_cible`) → cibles éditables (1 ligne / organisme).

**Fenêtre annuelle :** inscriptions filtrées par `training_session.year = annee` ;
matériel / produits divers / dépenses par `YEAR(date) = annee`.

## 2. Onglet « Gestion » — calculs (`GET /api/comptabilite?annee=YYYY`)

### a) Chiffre d'affaires (3 sources, sans double-comptage)
```
caInscriptions = Σ enrollment.price            (sessions de l'année)
caMateriel     = Σ (amount × quantity)          (material_sale de l'année)
caExtra        = Σ amount                        (revenue_extra de l'année)
CA             = caInscriptions + caMateriel + caExtra
```
> `revenue_extra` ne refait PAS les ventes matériel (déjà comptées via `material_sale`) :
> il ne contient que commissions / subventions / remboursements.

### b) Postes de dépense (6 catégories — `lib/compta.js`)
`MATIERES_PREMIERES · SALAIRES · LOYER · MARKETING · ENERGIE · DIVERS`. Pour chacun :
```
total  = Σ amount_ht de la catégorie
pct    = CA>0 ? round(total/CA × 1000)/10 : 0        // % du CA, 1 décimale
cible  = targets[cat]                                 // éditable
statut = pct ≤ cible        → "vert"
         pct ≤ cible × 1.2  → "orange"                // +20 % relatif toléré
         sinon              → "rouge"
conseil = conseilFor(cat, statut, pct, cible)
```
**Cibles par défaut (% du CA)** : matières 27,5 · salaires 30 · loyer 10 · marketing 7,5 ·
énergie 5 · divers 5. **Dividendes visés : 10.**

### c) Marge & dividendes (vue réaliste — le cœur du module)
```
totalDepenses     = Σ postes.total
marge             = CA − totalDepenses               (margePct = marge/CA)
dividendeVise     = max(0, round(CA × cible%/100))    // ambition
dividendePossible = max(0, round(marge))              // ce qu'il reste réellement
dividendeRealiste = min(dividendeVise, dividendePossible)   // jamais > marge
partRealistePct   = round(dividendeRealiste/CA × 1000)/10
statut            = marge ≤ 0                 → "impossible"
                    dividendePossible ≥ visé  → "atteignable"
                    sinon                     → "partiel"
```
Règle clé : **on ne distribue jamais plus que la marge**. Sur données incomplètes
(marge négative), le dividende réaliste est 0 avec un message explicite.

### d) Divers
- `targets = mergeTargets(settings.targets)` : fusionne les cibles enregistrées (0–100) avec les défauts.
- `annees` : liste triée desc. (sessions + année courante) pour le sélecteur d'année.

## 3. Onglet « Performance » (`GET /api/comptabilite/performance?annee=YYYY`)

`computeYear(annee)` est appelée pour **N et N-1** et renvoie :
```
caTotal, caInscriptions, caMateriel, caExtra
nbInscriptions   = nb enrollment de l'année
nbStagiaires     = nb learner_id DISTINCTS
nbSessions       = count training_session de l'année
ticketMoyen      = round(caInscriptions / nbInscriptions)
stagiairesMoyens = round(nbInscriptions / nbSessions × 10)/10
depensesTotal, marge, postes{cat: total}
```
La réponse renvoie `current` + `previous` ; **les écarts (Δ % et couleur) sont calculés
côté client**. Convention : hausse = **vert**, SAUF pour les dépenses (invert : hausse = **rouge**).

## 4. UI (`Comptabilite.jsx`)

1. En-tête (`PageHead`) : titre + **sélecteur d'année** dans les actions.
2. Barre d'onglets : **Gestion | Performance** (état `tab`, classe `.tab`).
3. **Gestion** :
   - 4 KPI (CA · Dépenses · Marge colorée selon signe · Dividendes réalistes).
   - **Composition du CA** (3 tuiles `CaPart`, % du total, pastille couleur).
   - **2 camemberts (donut SVG maison)** : répartition du CA et dépenses par poste.
   - Bloc **Dividendes** : 3 mini-KPI + **jauge** part réaliste vs objectif (repère sur la cible)
     + message + barre 100 % « Où va le CA ? » (postes + marge verte).
   - **Postes vs cible** : barre par poste + marqueur de cible + pastille couleur + conseil ;
     bouton « Modifier les cibles » → `PUT /cibles`.
   - Formulaires **dépense** / **produit divers** + listes supprimables.
4. **Performance** : 8 cartes comparatives N/N-1 (▲/▼ % colorés) + tableau **Dépenses par poste
   N vs N-1** (écart en €).

### Camembert (donut) — logique SVG sans librairie
- `total = Σ valeurs` ; `r = (size − thickness)/2` ; `circ = 2πr`.
- Groupe pivoté `rotate(-90)` (démarrage en haut).
- Chaque part = un `<circle>` avec `stroke-dasharray = "dash (circ−dash)"` où
  `dash = fraction × circ − 2px` (écart entre parts) et `stroke-dashoffset = −offset` cumulé.
- Survol : la part active grossit (`thickness+5`), les autres passent en `opacity 0.3`, le
  **centre affiche le détail** (libellé/montant/%) ; légende synchronisée.
- Couleurs = **variables CSS validées daltonisme** (`--cat-mp`, `--ca-insc`…), déclinées
  clair/sombre dans `app.css` (palette Okabe-Ito).

## 5. Contrats API

```
GET  /api/comptabilite?annee=YYYY
     → { annee, ca:{total,inscriptions,materiel,extra}, postes[], totalDepenses,
         marge, margePct, dividendeCible, dividendeVise, dividendePossible,
         dividendeRealiste, partRealistePct, dividendeStatut, dividendeMessage,
         targets, depenses[], revenus[], annees[] }

GET  /api/comptabilite/performance?annee=YYYY
     → { annee, anneePrec, current, previous, postesLabels[] }

POST /api/comptabilite/depenses  { label, categorie, montantHT, date }   (+ DELETE /[id])
GET  /api/comptabilite/revenus?annee=YYYY                                  # liste (formateur inclus)
POST /api/comptabilite/revenus   { label, categorie, montant, date }     (+ DELETE /[id])
PUT  /api/comptabilite/cibles    { targets:{CAT:pct…}, dividendeCible }   (upsert accounting_settings)
```
Toutes scopées `organization_id` (pris du jeton), avec **journalisation `audit_log`**.

**Gardes de rôle** (`comptabilite.routes.js`) : le tableau complet (Gestion,
Performance, dépenses, cibles) est réservé au **bureau** (`ADMIN_ROLES`) ; seuls
les **produits divers** (`GET/POST/DELETE /revenus`) sont ouverts au **formateur**
(`STAFF_ROLES`), via la page allégée `ProduitDivers.jsx` (cf. `08_PAGES.md`).

## 6. Reproduire (ordre conseillé)

1. Tables `expense`, `revenue_extra`, `accounting_settings` (migration 005).
2. `lib/compta.js` (catégories, libellés, défauts, `statutFor`, `conseilFor`, `mergeTargets`).
3. Contrôleur : `getGestion` (agrégation §2) + `getPerformance` (§3) + écritures (§5).
4. Client : sélecteur année → GET → KPI / composition / donuts / dividendes / postes /
   formulaires ; onglet Performance → GET performance → cartes N/N-1.
5. Variables CSS de palette (validées daltonisme) pour les donuts (clair + sombre).

## Différences vs `dev`

Même logique métier et mêmes formules. Ici : **SQL brut** (au lieu de Prisma),
validation manuelle dans le contrôleur (au lieu de Zod), fenêtre annuelle via
`YEAR(date)` / `training_session.year` (au lieu de bornes UTC Prisma). La palette
daltonisme est identique en intention, définie dans `app.css`.

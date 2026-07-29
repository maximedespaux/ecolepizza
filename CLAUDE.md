# Impasto / ecolepizza — instructions de travail

Ce fichier est chargé automatiquement à chaque session. Il porte les **règles permanentes** et
l'**état de reprise**. Pour le détail (audits, dette, plan de refonte), lire `CHANTIERS.md`.

**Langue : tout le code, les commentaires, les commits et l'interface sont en FRANÇAIS.**

---

## 1. Le projet

**Impasto** — gestion de l'École Pizza (Jean-Jacques Despaux, Lannemezan) : stagiaires,
sessions, documents/parcours, signatures, boutique + facturation Factur-X, Qualiopi.

- **Front** : React 19 + Vite — `src/app/ui` (dev sur `:5173`)
- **API** : Node/Express — `src/api` (dev sur `:3000`, sous nodemon → reload auto)
- **Base** : MariaDB **distante** — `database/migrations/`
- CSS unique et manuel : `src/app/ui/styles/app.css`

---

## 2. Règles absolues

### 2.1 Ne JAMAIS toucher la base en direct
Claude **n'exécute aucun SQL** sur la base. On écrit une migration numérotée **plus son revert**
(`NNN_nom.sql` + `NNN_revert_nom.sql`) dans `database/migrations/` ; **l'utilisateur les joue
lui-même**. Conventions :

- commentaires en **blocs** `/* … */` (jamais `--`), en tête, qui expliquent le **POURQUOI** ;
- `ADD COLUMN IF NOT EXISTS` / `DROP COLUMN IF EXISTS` → rejouable sans risque ;
- **le code doit marcher AVANT et APRÈS** la migration (colonne optionnelle : `hasColumn()`,
  cascade de `SELECT`, `try/catch` sur `ER_BAD_FIELD_ERROR` / `ER_NO_SUCH_TABLE`).

### 2.2 Aucune restriction de document codée en dur
La disponibilité/applicabilité d'un document est pilotée **uniquement** par les conditions de
l'organisme (`applies_when` + conditions perso). Une tentative de gate en dur par type de
document a déjà été **revertée** par l'utilisateur. Ne pas réintroduire.

### 2.3 Fichiers sensibles
- `SECURITY_AUDIT.md` est **gitignoré**, local — ne jamais le committer.
- Ne jamais lire les `.env`. Catalogue Metro en lecture seule (aucun achat).

### 2.4 Le build qui passe ne prouve RIEN
Pas d'ESLint dans le projet. `esbuild` ne détecte pas les références non définies. Après toute
suppression de variable / refactor, **vérifier à la main** (et dans le navigateur).

Compile-check d'un fichier JSX :
```bash
esbuild src/app/ui/pages/X.jsx --loader:.jsx=jsx --jsx=automatic --bundle \
  --external:react --external:react-dom --external:react-router-dom \
  --external:@tiptap/* --external:../* --external:./* --outfile=/dev/null
```

### 2.5 Tests
`cd src/api && npm test` (node:test). **~296 tests, 0 échec — garder ce niveau.**
Un test doit geler un **défaut réel** : on l'écrit, puis on **réintroduit volontairement le
défaut** pour vérifier qu'il vire au rouge. Les commentaires de test disent *pourquoi* le défaut
existait. Beaucoup de tests lisent le **source** (regex sur le contrôleur) : renommer une
variable peut casser un test — c'est voulu, ça signale un contrat.

---

## 3. Pièges connus (payés cher, ne pas re-découvrir)

**Rendu PDF = LibreOffice** (`soffice --convert-to pdf`) — il ignore une partie du CSS :

- largeur de tableau : **l'attribut HTML** `width="100%"` est respecté, **pas** le CSS ;
- bordures de cellule : injectées **en ligne** (`applyTableBorders`), le CSS est ignoré ;
- ProseMirror fige des largeurs de colonnes **en pixels** → converties en % (`largeurTables`) ;
- **côte à côte** : un tableau imbriqué dans la dernière cellule d'une ligne « retombe » sous la
  colonne voisine multi-lignes. D'où les colonnes en **`float:left`** (`columnsToFloats`), pas en
  tableau de mise en page ;
- un `<p>` vide est supprimé → on y met un `&nbsp;` ;
- saut de page : uniquement sur un `<p>` **non vide** (`p.doc-pagebreak`).

**Éditeur (Tiptap/ProseMirror)** : ne conserve que les attributs `data-*` sur les tableaux (d'où
`data-border` / `data-width`). Un marqueur de bloc (`{#Articles}`) doit vivre **dans une cellule**,
jamais directement dans un `<tbody>` (il serait remonté hors du tableau).

**Jetons** : les jetons s'insèrent en **puces** `<span data-token="Clé">`, jamais en `{Clé}` brut
(sauf les marqueurs de bloc `{#Articles}` / `{#Stagiaires}`, qui sont des délimiteurs).

---

## 4. Migrations écrites, **en attente** que l'utilisateur les joue

`118` est appliquée. Restent (au moins) :

| N° | Objet |
|----|-------|
| 119 | `document_template.buyer_audience` — destinataire d'un modèle de facture (repli serveur) |
| 120 | DROP `billing_profile.default_template_slug` |
| 121 | `invoice.template_slug` — **modèle de facture choisi à la vente** |

Le code fonctionne sans elles (colonnes optionnelles), mais la fonctionnalité n'est complète
qu'une fois jouées. D'autres migrations plus anciennes (106→117) peuvent aussi être en attente —
**demander confirmation** avant de supposer qu'une colonne existe.

---

## 5. Où en est le chantier « facturation / modèles » (session du 2026-07-29)

- **Facture choisie à la vente** : la caisse (`Ventes.jsx`) impose un **« Modèle de facture »**
  (obligatoire) ; le slug est figé sur `invoice.template_slug` ; `buildInvoicePdf` le priorise,
  sinon repli `pickInvoiceTemplate` (destinataire → réglage → modèle unique).
- **Entités émettrices** : l'entité « organisme » est semée et reste le défaut ; le bouton
  « Par défaut » a été **retiré** de l'écran Facturation. Plus de modèle par entité.
- **Éditeur** : bloc **deux colonnes** (texte à côté d'un tableau) ; **papier à en-tête
  automatique** désactivable par modèle (`layout.noLetterhead`) ; **couleur par catégorie** de
  jeton (palette, Champs documents, puces insérées) via `src/app/ui/lib/categoryColors.js` —
  un jeton dupliqué garde la couleur de sa catégorie **d'origine** (`t.origin`) ; libellés courts
  + **info-bulle généreuse** au survol.
- **Acheteur** : ses coordonnées viennent des **Champs documents**
  (`field:company.*` / `field:learner.*`, remplis par `invoiceCtx`), regroupées dans un groupe de
  palette « Acheteur (facture) ». Colonnes techniques/sensibles exclues.
- **Slug renommable** : `PUT /templates/:slug/rename` renomme **en cascade** (parcours, réglage
  boutique, factures, documents générés, points de rupture, slugs dans le JSON). Socle non
  renommable, collision refusée.

**Reste ouvert / idées non faites** : donner un préfixe de numéro distinct à chaque entité
émettrice (sinon collision de numéros) ; la 2ᵉ entité « Boutique » a encore `legal_name = "d"` ;
ajouter des `desc` explicites aux autres groupes de jetons.

---

## 6. Méthode de travail attendue

1. **Lire le code avant de proposer** — ce projet a beaucoup de contraintes non devinables.
2. **Poser une question** quand le besoin est ambigu (l'utilisateur tranche vite et bien).
3. **Vérifier dans le navigateur** (l'app tourne en local) — pas seulement « ça compile ».
4. **Tester** (`npm test`), puis **committer** en français, avec le *pourquoi* dans le corps.
5. Commentaires de code : expliquer **pourquoi**, surtout quand c'est contre-intuitif (les
   contournements LibreOffice/ProseMirror sont documentés à leur emplacement — les garder à jour).

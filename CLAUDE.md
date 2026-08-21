# Impastio / ecolepizza — instructions de travail

Ce fichier est chargé automatiquement à chaque session. Il porte les **règles permanentes** et
l'**état de reprise**. Pour le détail (audits, dette, plan de refonte), lire `CHANTIERS.md`.

**Langue : tout le code, les commentaires, les commits et l'interface sont en FRANÇAIS.**

---

## ⚠️ QUESTION OUVERTE — À TRANCHER, ET À REPOSER TANT QU'ELLE NE L'EST PAS

> ### Combien de temps garde-t-on la copie d'une pièce d'identité ?
>
> Les **pièces justificatives déposées par les stagiaires** (migration 127) contiennent des
> copies de cartes d'identité : une **donnée personnelle sensible**, soumise au RGPD.
>
> **État actuel : suppression MANUELLE uniquement.** C'est un choix d'attente, explicitement
> provisoire, pris le 2026-08-01 faute de décision. Il signifie qu'un scan de carte d'identité
> reste en base indéfiniment tant que personne ne clique sur « Supprimer ».
>
> **Ce que dit le principe de minimisation** : la copie sert à VÉRIFIER une identité, pas à
> l'archiver. Le contrôle Qualiopi porte sur la trace de vérification (« vérifiée le 12/03 par
> X »), pas sur le scan lui-même. Les deux autres options écartées pour l'instant étaient
> l'effacement automatique **à la validation**, et **à la clôture de la session**.
>
> **Ce qu'il reste à décider** : la durée, et ce qui déclenche l'effacement. Tant que ce n'est
> pas tranché, l'organisme accumule des copies de pièces d'identité sans limite de durée — ce
> qui est exactement ce que le RGPD interdit.
>
> **CONSIGNE EXPLICITE DE L'UTILISATEUR** : reposer la question à chaque occasion jusqu'à ce
> qu'elle soit tranchée. Ne pas la laisser s'enterrer. Quand la réponse arrive, remplacer ce
> bloc par la règle retenue et écrire la purge correspondante.

---

## 1. Le projet

**Impastio** — gestion de l'École Pizza (Jean-Jacques Despaux, Lannemezan) : stagiaires,
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
`cd src/api && npm test` (node:test), **~0,4 s**. État de référence :
**373 tests — 366 réussis, 0 échec, 7 ignorés. Garder ce niveau.**

Les **7 ignorés sont volontaires** : ce sont des défauts connus et non corrigés, chacun en
`{ skip: "…" }` avec sa raison écrite (`backoffice-invariants`, `finance`). C'est un registre de
dette, pas un oubli — ne pas les « réparer » en les supprimant.

Un test doit geler un **défaut réel** : on l'écrit, puis on **réintroduit volontairement le
défaut** pour vérifier qu'il vire au rouge. Les commentaires de test disent *pourquoi* le défaut
existait. Beaucoup de tests lisent le **source** (regex sur le contrôleur) : renommer une
variable peut casser un test — c'est voulu, ça signale un contrat. **Corollaire** : ne pas
déplacer une fonction hors de son contrôleur sans vérifier qui lit ce fichier au `readFileSync`
— treize fichiers de test le font.

Si `npm test` ne rend plus la main, chercher un `require` qui ouvre une connexion : le pool est
**paresseux** (cf. `config/database.js`) précisément pour ça, et le redevenir immédiat casserait
la commande.

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
- saut de page : uniquement sur un `<p>` **non vide** (`p.doc-pagebreak`) ;
- **hauteur de tableau : AUCUNE forme n'est respectée.** Ni `height` en attribut (sur `<table>`
  comme sur `<tr>`), ni `height` en CSS (table ou cellule), ni `padding-bottom` en mm. Les six
  variantes rendues côte à côte sortaient toutes à la hauteur du seul contenu. **Seul le contenu
  fait la hauteur** → pour réserver de la place, on ajoute des lignes `&nbsp;<br>`
  (`lignesVides`, cf. tableau à hauteur réservée) ;
- alignement vertical : **l'attribut** `valign="top"`, **pas** `vertical-align` en CSS (même
  logique que la largeur — sans l'attribut, le contenu reste centré dans une cellule haute).

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
| 122 | `invoice_line.discount_pct` + `unit_price_gross_ht` — **la remise, conservée comme donnée** (jetons `{Remise}` / `{Total remise}`) |
| 123 | `company.vat_number` — **n° de TVA du client** (jeton `field:company.vat_number`) |
| 125 | `inventory_item.learner_discount_pct` + `learner_discount_eur` + remise figée sur la ligne — **remise stagiaire en % ou en €**, visible seulement dans leur boutique. **À REJOUER** : la colonne « euros » a été ajoutée après coup (fichier entièrement rejouable) |
| 126 | `user.avatar` + `user.cadre` — **avatar et cadre du PERSONNEL** de l'organisme (il n'a pas de fiche `learner`). Sans elle, l'école reste anonyme dans la Communauté chez les AUTRES |
| 127 | `piece_type` + `piece_depot` + `piece_fichier` + `program_step.piece_id` — **pièces justificatives fournies par le stagiaire** (identité recto/verso…). **Porte une question RGPD non tranchée, cf. le bloc en tête de ce fichier** |
| 128 | `learner.cadre` élargie à 32 caractères — les **cadres de Pizza Quest** s'enregistrent en `palier|#rrggbb` (couleur de la formation). Le plus long tient dans les 16 actuels *au caractère près* : la migration écarte le mur, le code marche avant comme après |

**Jouées le 2026-08-03** : `129` (catégories de partenaires), `130` (registre des consentements +
journal des transmissions), `131` (`partner.recoit_coordonnees` + suivi de contrat).

| N° | Objet | État |
|----|-------|------|
| 136 | **Rattrapage `partner_disclosure`** — `ADD COLUMN IF NOT EXISTS` sur les six colonnes. ⚠️ **`CREATE TABLE IF NOT EXISTS` (migration 130) ne complète PAS une table déjà présente** : elle est ignorée en bloc, sans erreur. Rejouer la 130 n'ajoute donc rien — il faut la 136 | **à jouer** |
| 135 | `organization.partner_fields` + **`consent_record.champs`** — l'école choisit ce qu'elle transmet aux partenaires, et **ce qui a été ANNONCÉ à chaque personne est figé sur sa réponse**. L'export n'envoie que l'INTERSECTION des deux : restreindre s'applique à tout le monde, élargir ne vaut que pour les consentements suivants | **jouée** |
| 134 | **`specs` → `category`** — les caractéristiques figées (énergie, °C, pizzas, sole rotative, AVPN) recopiées dans les catégories libres, puis les badges retirés du code. ⚠️ **À jouer AVANT de déployer**, sinon 12 produits sur 16 perdent l'affichage de leurs caractéristiques entre les deux. `specs` reste en base : `specs.devis` pilote toujours « Sur devis » | **à jouer** |
| 133 | `partner.logo_url` + `inventory_item.image_url` — **images par LIEN**, hébergées chez le fournisseur. `partner_product.image_url` existait déjà (095) sans écran pour la remplir. ⚠️ Une image distante est **une requête vers un tiers** faite par le navigateur du stagiaire : la page Confidentialité le déclare désormais, et les images sont posées en `no-referrer` | **à jouer** |
| 132 | `UNIQUE (organization_id, name)` sur `partner` — l'annuaire portait **deux fiches « Berkel »**, la vide a été supprimée. Un homonyme se paie cher ici : la demande de consentement NOMME les destinataires et son texte est figé comme preuve (« …, Berkel, Berkel, … »), et le semis des produits joint **sur le nom**. **Elle échoue s'il reste des doublons — c'est voulu** ; la requête pour les trouver est en tête du fichier | **à jouer** |

⚠️ **La 131 démarre à zéro destinataire**, volontairement : `DEFAULT 0` signifie qu'aucun
partenaire ne reçoit de coordonnées tant que l'école ne l'a pas coché sur sa fiche. À 1, la
migration aurait fait de vingt-trois annuaires des destinataires de données personnelles sans que
personne ne l'ait décidé. **L'école doit donc cocher les quelques partenaires réellement
concernés** — rien ne se transmet avant.

Le code fonctionne sans elles (colonnes optionnelles), mais la fonctionnalité n'est complète
qu'une fois jouées. D'autres migrations plus anciennes (106→117) peuvent aussi être en attente —
**demander confirmation** avant de supposer qu'une colonne existe.

**124 : ABANDONNÉE, à reverter si elle a été jouée.** Elle stockait sur `shop_request` le
destinataire de la facture choisi par le stagiaire au panier. Le choix est revenu à l'école, qui
le fait à l'émission — elle seule connaît l'accord de prise en charge. Son fichier **aller a été
supprimé** (aucune base neuve ne doit la jouer) ; seul `124_revert_…` subsiste, pour les bases qui
l'ont déjà reçue. Sans risque à ne pas jouer : quatre colonnes inertes.

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
- **Remise (migration 122)** : elle n'était écrite **nulle part** — fondue dans le prix net, sa
  seule trace étant du texte dans le libellé (« Biberon valve (remise 10%) »). Deux colonnes sur
  `invoice_line` : le **taux** (affichage fidèle à la saisie) et le **prix brut** (les euros, par
  soustraction de deux montants déjà arrondis). Repasser par le taux pour retrouver les euros
  fait dériver d'un centime — cf. le test `remise.test.js`, qui le démontre sur 9,99 € × 9.
  Jetons : `{Remise}` dans le bloc `{#Articles}` (« 10 % » ou « — »), `{Total remise}` en global.
  **Les deux remises s'excluent désormais** (ligne OU globale) : elles se cumulaient, et 10 % +
  5 % faisaient 14,5 %, ce qui rendait la facture invérifiable par le client. La caisse désactive
  l'une dès que l'autre est saisie, et le serveur **refuse** le cumul (422).
- **Tableau à hauteur réservée** (`data-rows="inline"` + `data-minlines="N"`) : sur une facture,
  un bloc `{#Articles}` produit normalement une **ligne de tableau par article**, donc un tableau
  qui grandit et rétrécit — totaux et signature se déplacent d'une facture à l'autre. Ce mode
  garde **une seule ligne** et empile les articles dans la cellule avec les `<br>` du gabarit ;
  `data-minlines` réserve un plancher **en lignes** (pas en mm : LibreOffice ignore toute hauteur,
  cf. § 3). Bouton `≣` + liste « lignes réservées » dans la barre d'outils, actifs sur un tableau.
  Côté rendu : `expandInlineTables` (htmlfill) passe **avant** le cas général, sinon la forme
  « ligne » d'`expandListBlocks` dupliquerait quand même le `<tr>`. Tests :
  `test/tableau-hauteur-reservee.test.js`.

  **Le bloc ENJAMBE la ligne** dans les vrais modèles : `{#Articles}` ouvre dans la PREMIÈRE
  cellule et `{/Articles}` ferme dans la DERNIÈRE (`facture-stagiaire` : 7 cellules, marqueurs
  en 0 et 6). D'où `empilerDansLaLigne`, qui répète le contenu de **chaque cellule sur place**.
  Répéter naïvement ce qui sépare les marqueurs recopiait les `</td><td>` et la ligne gagnait des
  **colonnes** au lieu de lignes. Deux pièges à garder en tête si on y retouche : une cellule
  peut contenir **plusieurs `<p>`** (un vide traîne dans « Taux TVA » / « Taux TTC »), qu'il faut
  aplatir en un seul, sinon la colonne se désaligne ; et un `<p>` fait de `&nbsp;<br>` ne doit
  **pas** être pris pour un `<p>` vide par la règle d'`htmlfill` (sinon la hauteur réservée
  disparaît sur une facture sans article). **Ces trois défauts ne se voyaient qu'à l'aperçu PDF
  du vrai modèle** — les premiers tests, écrits sur une forme mono-cellule inventée, passaient
  au vert.

- **Identités d'exemple de l'aperçu** (`lib/echantillons.js`) : une personne fictive est tirée au
  hasard par aperçu, et **tous** les jetons qui la concernent en découlent (nom, adresse, e-mail,
  téléphone, plus les `field:learner.*` / `field:company.*`). Avant, les échantillons étaient
  indépendants — un même aperçu montrait trois identités — et deux d'entre eux portaient le **nom
  réel de l'utilisateur**, ce qui rendait l'aperçu indiscernable d'une vraie facture. Le groupe
  **Organisme reste sur les valeurs RÉELLES** de l'école (papier à en-tête fidèle) : c'est voulu.
  `identiteExemple(graine)` permet un tirage stable si l'on veut comparer deux aperçus sans que
  le nom change de longueur entre les deux. Tests : `test/apercu-echantillons.test.js`.

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

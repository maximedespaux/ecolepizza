# Impastio / ecolepizza — instructions de travail

Ce fichier est chargé automatiquement à chaque session. Il porte les **règles permanentes** et
l'**état de reprise**. Pour le détail (audits, dette, plan de refonte), lire `CHANTIERS.md`.

**Langue : tout le code, les commentaires, les commits et l'interface sont en FRANÇAIS.**

---

## Conservation des pièces d'identité — **TRANCHÉ le 2026-09-15**

> ### Règle retenue : suppression MANUELLE, et rien d'automatique.
>
> Les **pièces justificatives déposées par les stagiaires** (migration 127) contiennent des
> copies de cartes d'identité. La question « combien de temps les garde-t-on ? » est restée
> ouverte du 2026-08-01 au 2026-09-15. **L'utilisateur a tranché : on garde la suppression
> manuelle.** Ce n'est plus un choix d'attente, c'est la règle.
>
> **Ce que ça veut dire concrètement** : aucune purge n'est écrite, `piece_depot.purge_at` reste
> NULL partout, et un fichier ne disparaît que si quelqu'un clique sur « Supprimer » — le
> stagiaire tant que sa pièce n'est pas validée, le personnel à tout moment (cf.
> `supprimerFichier`, qui EST la purge manuelle). Les copies sont chiffrées au repos
> (AES-256-GCM) et n'apparaissent en clair dans aucune sauvegarde.
>
> **Ce qui reste vrai, dit une fois et pas davantage** : le principe de minimisation demande
> qu'une donnée serve à quelque chose. Une copie conservée après vérification ne sert plus à
> rien — le contrôle Qualiopi porte sur la trace (« vérifiée le 12/03 par X »), pas sur le scan.
> Le risque est donc assumé, pas ignoré.
>
> **NE PLUS REPOSER LA QUESTION.** Elle a été posée à chaque occasion pendant six semaines,
> c'était la consigne ; la réponse est arrivée. Pour changer d'avis un jour, tout est déjà en
> place : remplir `purge_at` à la validation ou à la clôture, et écrire la purge
> correspondante — aucune migration ni reprise de données ne sera nécessaire.

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
`esbuild` et `vite build` sont des EMPAQUETEURS, pas des analyseurs : ils ne détectent aucune
référence non définie. Un composant peut se rendre parfaitement et n'échouer qu'au clic.

**ESLint EXISTE depuis le 2026-09-16** — il était installé depuis toujours, mais sans fichier de
configuration : la commande répondait « couldn't find an eslint.config file », donc personne ne
la lançait, et ce paragraphe a longtemps affirmé qu'il n'y en avait pas. Un outil installé mais
muet est pire qu'un outil absent : on se croit couvert.

```bash
cd src/app && npm run lint     # interface — navigateur, ESM, JSX, react-hooks
cd src/api && npm run lint     # API — Node, CommonJS (emprunte le binaire du front)
```

**`no-undef` est la règle pour laquelle tout ceci existe.** Deux défauts du même jour tenaient
entièrement dedans : un état React appelé depuis un AUTRE composant (deux cent trois
`ReferenceError` en production, rien à l'écran), et une fonction appelée sans son `require`.

Sévérités : **erreur** pour ce qui casse à l'exécution, **avertissement** pour ce qui salit. Le
dépôt porte une centaine d'avertissements — variables inutilisées, dépendances d'effet — et les
passer en erreur rendrait la commande rouge en permanence ; un contrôle toujours rouge ne se lit
plus. `npm run lint` doit sortir en **0 erreur** : c'est ça, le contrat.

⚠️ **Il ne remplace pas la vérification à la main.** Un linteur ne sait pas qu'une liste est
coupée avant d'être triée, ni qu'un accusé de réception ne doit pas être signé par l'école.
Après toute suppression de variable / refactor : **relire**, et **ouvrir le navigateur**.

Compile-check d'un fichier JSX :
```bash
esbuild src/app/ui/pages/X.jsx --loader:.jsx=jsx --jsx=automatic --bundle \
  --external:react --external:react-dom --external:react-router-dom \
  --external:@tiptap/* --external:../* --external:./* --outfile=/dev/null
```

### 2.5 Tests
`cd src/api && npm test` (node:test), **~0,4 s**. État de référence, **relevé le 2026-09-22** :
**1778 tests — 1771 réussis, 0 échec, 7 ignorés. Garder ce niveau.**

Ce compteur disait « 373 / 366 » jusqu'au 2026-09-16 : le même travers que le § 4 — un chiffre
précis, donc crédible, et faux depuis des semaines. Un relevé périmé À LA BAISSE est le pire des
deux : il fait croire que neuf cents tests ont disparu. **Le remettre à jour en même temps que
les migrations.**

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

## 4. Migrations — **la 175 est jouée, À CONSTATER (relevé le 2026-09-22, au soir)**

**175 : JOUÉE selon l'utilisateur (2026-09-22, vers 18 h 40), PAS ENCORE CONSTATÉE.** À 18 h 41, le code de
la PR #168 était en ligne (fusionnée à 18 h 39), mais aucun modèle n'avait été enregistré depuis : le
journal ne pouvait encore rien dire. Le Droit à l'image, enregistré à 18 h 12, l'a été sous l'ANCIEN code,
dont la ligne d'audit était refusée — ni sa présence ni son absence ne prouvent quoi que ce soit. Les lignes
`template.save` à `entity_id: null` des 1er et 2 août sont anciennes, et ne comptent pas non plus : seule une
ligne ÉCRITE APRÈS 18 h 39 tranche. Constater par l'une des deux voies décrites ci-dessous.

(`175_audit_identifiant_texte.sql`, le journal d'audit qui perdait en silence les
modèles et les rôles). `audit_log.entity_id` passe de `uuid` à `varchar(64)`. Un modèle de document se
désigne par son SLUG (« grille-jury ») et un rôle système par son NOM (« FORMATEUR ») : la colonne uuid
refusait la LIGNE ENTIÈRE, et `GET /api/audit?q=template` ne rendait aucune ligne `template.save`. Sept
appels de `logAudit` sur 139 sont concernés — `template.save` (deux), `.upload`, `.delete`, `.reset`,
`.duplicate`, et `accessprofile.system`. Aucune jointure ni aucun index ne porte sur la colonne ; la cloche
n'en tire un lien que pour Learner, Company et TrainingSession, toujours en UUID. Sans la migration, le code
garde la ligne SANS son identifiant, et la console le dit une seule fois (`lib/audit.js`).
**Elle se vérifie par l'API, sans SQL** : enregistrer un modèle — l'enregistrement du Droit à l'image, attendu
ci-dessous, fait l'affaire —, puis `GET /api/audit?q=template` : la ligne `template.save` porte
`entity_id: "droit-image"`. Une ligne à `entity_id: null` : le code est déployé, la 175 pas encore. Aucune
ligne : ni l'un ni l'autre. Ou une requête, qui doit rendre `varchar` et `64` :
`SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='audit_log' AND column_name='entity_id';`
Son revert remet `uuid` après avoir passé à NULL les identifiants qui n'en sont pas (les lignes restent) :
laissé à lui-même, l'ALTER échouerait en mode strict. ⚠️ Les traces de modèles et de rôles d'AVANT n'existent
nulle part — MariaDB les a refusées —, et les lignes « [object Object] » des catégories de partenaires (même
défaut de famille, corrigé le même jour : l'appel passait un objet) ne disent pas de quelle catégorie il
s'agissait.

**LE DROIT À L'IMAGE EST ENREGISTRÉ — constaté le 2026-09-22 à 18 h 40 par l'API** : `GET /templates`
rend `has_body: true` (daté de 18 h 12) et `GET /templates/droit-image/body` rend le corps sans `propose`, mot
pour mot la proposition de l'éditeur (14 jetons, 3315 caractères). Ce corps est ANTÉRIEUR aux espaces
insécables du commit ec3121df : ses « : » et « ; » suivent une espace ordinaire. Rendu à la même date avec
les vraies longueurs (raison sociale, les 12 informations annoncées aux partenaires), aucun ne commençait une
ligne — rien à reprendre tant que personne ne s'en plaint.
Ce qui suit est l'historique de ce chantier, gardé pour ses explications. La réponse du
stagiaire (photos, et partenaires à part) vit au registre des consentements — finalité `droit_image`,
aucune migration : la 130 a été pensée pour — et le document l'imprime par les jetons « Autorisations »
({Case photos oui}…). Mais le modèle `droit-image` de production ne sert PAS : son fichier Word est en
base avec un genre resté « builder » sans corps, donc `getTemplateContent` rend `null` et la liste des
modèles dit « à créer » (même cas pour `convention` et `convocation`, relevé le même jour). L'éditeur
propose le document de l'école recomposé avec les cases (`lib/modelesProposes.js`) : il fallait l'ouvrir
dans Modèles → Droit à l'image, le relire, puis ENREGISTRER — rien n'est écrit avant (fait). Un document qui
porte ces jetons ne se signe qu'une fois la question répondue (`consentementsManquants`), par toutes
les routes, et garde la réponse du jour de sa signature (`reponsesDuDocument`).

**L'OUTIL `database/tools/completer-entreprises.js` A ÉTÉ LANCÉ ET APPLIQUÉ** — l'utilisateur l'a annoncé le
2026-09-22 au soir. Il passe chaque fiche entreprise au registre (l'API officielle « Recherche
d'entreprises », les données que republient Pappers et societe.com), complète ce qui est vide, supprime
les fiches introuvables ou radiées, et ne touche à AUCUNE fiche rattachée (stagiaire, inscription,
facture, document, vente, compte de représentant, cachet, référent stagiaire). Règles de décision :
`src/api/lib/registreEntreprises.js`. Relevé le soir même par l'API : **257 entreprises restent** (471 à
l'import), dont 3 avec une date de création et 6 avec un SIRET — le registre n'a donc presque rien
complété : sans SIRET, il ne complète que sur un nom SANS AMBIGUÏTÉ au même code postal.
⚠️ Sa sauvegarde (`sauvegarde-….json`, ce que `--restaurer` remet) est dans `/tmp/impastio-entreprises`,
que le redémarrage du serveur efface ; les sauvegardes nocturnes de la base, elles, gardent l'état
d'avant quatorze jours (jusque vers le 6 octobre 2026). Relancer l'outil plus tard est sans risque : il
refait un essai d'abord, et ne revient jamais sur une fiche rattachée.

**171, 172, 173 et 174 sont jouées — l'utilisateur l'a annoncé le 2026-09-22 au soir ; constaté le jour même
par l'API, sans SQL, le code déployé (l'interface servie porte le bloc « Référent », les quinze cases et le
pied des fenêtres corrigé) :**

- **174** : `GET /companies/:id` (`SELECT *`) renvoie `representative_first_name` et
  `representative_learner_id`. ⚠️ La clé étrangère `fk_company_referent_learner`, posée par une DEUXIÈME
  instruction, ne se voit pas par l'API ; pour lever le doute, une requête — elle doit rendre 1 :
  `SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='impastio' AND CONSTRAINT_NAME='fk_company_referent_learner';`
- **173** : `GET /stagiaires/:id` (`SELECT *`) renvoie les quinze clés.
- **172** : `GET /stagiaires/:id` renvoie les trois clés du type de four.
- **171** : les 1080 fiches lues une à une par l'API (des comptes, aucun nom rapatrié) : 10 portent un lieu
  de naissance, 0 hors capitales. C'est l'état que produit la 171 — sans prouver à lui seul qu'elle a
  tourné (les dix pouvaient déjà l'être), ce qui ne change rien : c'est l'état voulu.

Ce qu'elles font, et leurs reverts :

**174** (`174_referent_entreprise.sql`, le référent d'une entreprise : un stagiaire choisi, ou une
personne en nom et prénom). Deux colonnes : `company.representative_first_name` (le prénom —
`representative_name` porte alors le NOM seul ; les fiches d'avant gardent leur nom complet, que
`nomReferent` lit tel quel) et `company.representative_learner_id` (le stagiaire référent, FK ON DELETE SET
NULL ; ses civilité, prénom et nom sont recopiés, et suivent sa fiche). Sans elle, le prénom rejoint le nom
dans la forme d'avant (« JEAN DUPONT ») et le lien n'est pas gardé — l'écran le dit (« sauf le lien vers le
stagiaire référent »). Elle se vérifie par l'API : `GET /companies/:id` (`SELECT *`) renvoie les deux clés.
Son revert replie le prénom dans le nom, puis retire les colonnes : seul le lien se perd. L'outil
`completer-entreprises.js` écrit donc désormais le prénom et le nom du dirigeant à part.

**173** (`173_projet_cases.sql`, quinze cases de plus dans « Votre projet », TINYINT(1)
comme les autres : le TYPE D'ACTIVITÉ — `project_dine_in`, `project_takeaway`, `project_by_slice`,
`project_vending`, `project_catering`, `project_add_on` —, l'ÉQUIPEMENT — `project_kneader`,
`project_sheeter`, `project_fridge_counter`, et `project_oven_owned` (« déjà acheté », sous « Four ») —,
l'AVANCEMENT — `project_premises`, `project_funded`, `project_opening_soon`, `project_support` — et
`project_more_training`). Indépendante de la 172. Sans elle, ces cases ne s'enregistrent pas, et le
formulaire le DIT (« sauf les nouvelles cases du projet : la migration 173 n'est pas jouée ») ; l'export
et la liste les lisent NULL (`colonnesProjetSql`). Elle se vérifie par l'API : `GET /stagiaires/:id`
(`SELECT *`) renvoie les quinze clés. Son revert retire les colonnes — les cases cochées sont perdues.
⚠️ L'avancement et la formation complémentaire NE PARTENT PAS aux partenaires (le stagiaire consent à
« la nature de mon projet ») : l'export ne les lit même pas. **Une case de plus** s'écrit dans le
catalogue de l'écran (`src/app/ui/lib/projet.js`), dans celui du serveur (`src/api/lib/projet.js`) si elle
part aux partenaires, dans `LEARNER_FIELDS` / `CASES` / `conditions.js`, et dans une migration —
`projet-cases.test.js` refuse qu'un seul de ces endroits l'oublie.

**172** (`172_projet_types_four.sql`, le TYPE de four sous la case « Four » de « Votre
projet » : `project_oven_wood`, `project_oven_electric`, `project_oven_gas`, TINYINT(1) comme les six
cases du projet). Sans elle, les types ne s'enregistrent pas, et le formulaire le DIT (« sauf le type de
four : la migration 172 n'est pas jouée ») ; l'export des partenaires dit « four » comme avant
(`colonnesProjetSql`). Elle se vérifie par l'API : `GET /stagiaires/:id` (`SELECT *`) renvoie les trois clés.
Son revert retire les colonnes — les types cochés sont perdus, la case « Four » reste.

**171** (`171_lieu_naissance_capitales.sql`, le lieu de naissance des fiches DÉJÀ en base
passé en capitales, « comme la ville » — même forme que la 162, octets comparés). Migration de
DONNÉES : invisible à tout contrôle de schéma. Sans elle, rien ne casse : le code met déjà le lieu
en capitales à chaque enregistrement (`CAPITALES_STAGIAIRE`, fiche ET espace stagiaire) ; seules les
fiches non rouvertes gardent leur casse d'origine. Elle se vérifie sur le contenu — doit rendre 0 :

```sql
SELECT COUNT(*) FROM learner WHERE birth_place IS NOT NULL
   AND CAST(birth_place AS BINARY) <> CAST(UPPER(TRIM(birth_place)) AS BINARY);
```

Son revert ne fait rien (`DO 0`), et l'explique : la casse d'origine n'est conservée nulle part.

**170 est jouée, ET LA REPRISE EST FAITE** (`170_france_travail_chiffre.sql`, identifiant France
Travail chiffré au repos, AES-256-GCM, même clé que le n° de sécurité sociale) — constaté le
2026-09-21 : `chiffrer-france-travail.js --verifier` rend « 2 chiffré(s) et rouvrable(s), 0 encore
en clair, 0 illisible(s) », la clé confrontée à un témoin existant ; et l'API rend ces deux
identifiants EN CLAIR sur la fiche (lus sur les 4 demandeurs d'emploi, aucun « enc:… ») — le code
déployé déchiffre. Le revert NE rétrécit PAS la colonne (il couperait les chiffrés) : pour revenir
au clair, `sudo -u impastio node /opt/impastio/database/tools/chiffrer-france-travail.js
--dechiffrer` AVANT de remettre l'ancien code. Le chemin ABSOLU compte : un chemin relatif se
résout depuis le dossier courant (lancé depuis `src/api`, « Cannot find module »).
⚠️ Les sauvegardes nocturnes d'AVANT la reprise contiennent encore ces identifiants en clair :
elles s'effacent d'elles-mêmes au fil de la rotation (14 jours, vers le 5 octobre 2026).

**169 est jouée** (`169_stagiaire_a_recontacter.sql`, le rappel « À recontacter ») — constaté le
2026-09-21 au soir : `GET /stagiaires/:id` (`SELECT *`) renvoie les clés `a_recontacter` et
`a_recontacter_depuis`, et `GET /stagiaires/a-recontacter` répond 200 (un rappel déjà posé).

⚠️ **UNE SAISIE RESTE À FAIRE, pas une migration : la forme juridique de l'organisme est VIDE.**
La colonne existe (167 jouée), mais `GET /organisation` rend `legal_status: null` : les deux
enregistrements de l'après-midi l'ont ignorée, la colonne n'existant pas encore. À choisir dans
Paramètres → Organisme, puis enregistrer. Tant qu'elle est vide, le jeton {Forme juridique organisme}
sort vide hors facture.

**168 est jouée** (`168_stagiaire_note_libre.sql`, colonne `learner.note_libre`, la note en texte
simple sous « Votre projet », 128 mots au plus, recomptés par le serveur avec le même compte que
l'écran, `lib/reponseLibre.js`) — l'utilisateur a relevé `information_schema` = 1 le 2026-09-21, et
l'API le confirme le même soir : `GET /stagiaires/:id` (`SELECT *`) renvoie la clé `note_libre`.
« note_libre » et pas « note » : ici, une note est aussi une note d'évaluation. Son revert retire la
colonne — les notes saisies sont perdues.

**167 est jouée** (`167_organisme_forme_juridique.sql`, colonne `organization.legal_status`, liste en
capitales de `lib/formesJuridiques.js`, et la ville de l'organisme passée en capitales) — constaté le
2026-09-21 au soir : `GET /organisation` renvoie la clé `legal_status`. Son revert retire la colonne ;
la ville reste en capitales (casse d'origine perdue, comme pour la 162).

**LE PIÈGE QU'ELLE A MONTRÉ, à ne pas re-découvrir** : annoncée jouée une première fois, elle ne
l'était pas — à 17 h 02, `GET /organisation` rendait 28 colonnes, `short_name` comprise (celle
qu'elle suit), et pas `legal_status`. Et **la ville en capitales ne prouvait rien** : l'organisme
avait été enregistré deux fois dans l'après-midi (journal : `organization.update` à 16 h 16 et
16 h 38), et le code met la ville en capitales à CHAQUE enregistrement. Une migration qui fait
DEUX choses se vérifie sur celle que le code ne sait pas refaire seul — ici, la colonne.

**164, 165 et 166 sont jouées — l'utilisateur l'a annoncé le 2026-09-21 ; constaté le jour même, sans
SQL, pour les deux qui se voient :**

- **166** (`166_grille_jury_sans_code.sql`, puce {Code} retirée de l'en-tête du modèle `grille-jury`,
  qui imprimait « … RS7404 RS7404 ») : `GET /templates/grille-jury/body` ne porte plus de
  `data-token="Code"`, et l'Aperçu de l'éditeur rend l'intitulé seul. Migration de DONNÉES (motif
  `REGEXP_REPLACE` sans barre oblique inverse ni point-virgule, cf. la 146) ; son revert REMET la
  puce juste après {Formation}. Les grilles signées gardent leur PDF figé.
- **165** (`165_titres_documents.sql`, titres « LIVRET_ACCUEIL » / « R_GLEMENT_EXAMEN » remplacés par
  l'intitulé du modèle) : sur les 60 documents des quatre stagiaires RS7404, aucun titre n'est plus un
  code. Migration de DONNÉES ; les documents SIGNÉS ne sont pas renommés (le titre entre dans le HTML
  dont la signature prend l'empreinte). Son revert ne fait rien, et l'explique.
- **164** (`164_qcm_reponse_libre.sql`, type de question `TEXT` + colonne `max_words`) : ⚠️ elle ne
  se vérifie PAS par l'API — les lectures demandent `max_words` par `colonneOuNull`, qui rend la clé
  dans les deux branches. Elle se vérifie à l'usage : enregistrer un QCM avec une question « Réponse
  libre » réussit (sans elle, 422). Son revert SUPPRIME les questions TEXT.

**162 et 163 sont jouées — constaté le 2026-09-17 par l'API, sans SQL :**

- **163** (`quiz_program`, un QCM pour plusieurs formations) : `GET /quizzes` rend DEUX formations
  (NIV1H et RS7404) pour « Évaluation de satisfaction ». Sans la table, le repli ne lit que
  `quiz.program_id` et n'en rendrait jamais qu'une. ⚠️ `created_at` y porte la DATE DE
  RATTACHEMENT, dont dépend la garde des anciens stagiaires (releaseAutoQuizzes) : ne jamais
  « supprimer puis réinsérer » ses lignes.
- **162** (villes en capitales, migration de DONNÉES) : plus aucune ville en minuscules — 0 sur les
  990 stagiaires qui en ont une, 0 entreprise — contre 7 stagiaires et 1 entreprise le matin même.
  Le code ne met une ville en capitales qu'à l'enregistrement d'une fiche : huit fiches rouvertes
  une à une dans la journée n'expliquent pas ce zéro, la migration si.

**158, 159 et 160 sont jouées** : `GET /stagiaires/:id` et `GET /companies/:id` font un
`SELECT *`, et renvoient les clés `project_improvement` (158) et `date_creation` (159) ; la 160
(types de remise) a été constatée par l'utilisateur, qui a créé le type « OPCO ».

**161 (`remise_document.sans_objet`) est jouée — constaté le 2026-09-21 par l'utilisateur : la requête
sur `information_schema` rend 1.** Elle ne se vérifiait PAS par l'API : la liste relit la colonne
en cascade et renvoie la clé `sans_objet` dans les DEUX branches. Seule une remise réellement marquée
« sans objet » la trahirait — et il n'y en a aucune : **relevé le 2026-09-21, l'étape de remise « OPCO »
existe dans les 10 formations et y est INACTIVE partout**, donc aucun dossier n'affiche de remise. Une
requête suffit — même forme que pour la 156 ci-dessous, avec `table_name='remise_document' AND
column_name='sans_objet'`. Sans la colonne, rien ne se voit tant que l'étape reste inactive ; le jour
où elle s'active, marquer une remise « sans objet » répondrait « Migration 161 non jouée. » (503).

Les migrations **153 à 157 sont jouées**. Elles avaient été annoncées « en attente » dans ce
paragraphe et y sont restées après avoir été jouées : exactement le travers décrit plus bas.

**Comment ça a été vérifié, sans SQL et sans croire ce fichier** — les contrôleurs relisent ces
colonnes en CASCADE (`ER_BAD_FIELD_ERROR` → on retombe sur la forme d'avant), donc leur présence
se lit dans la RÉPONSE de l'API : la colonne n'apparaît dans la charge utile que si la première
branche a réussi.

| # | Colonne ajoutée | Ce qui l'a prouvée en production |
|---|---|---|
| 153 | `archive_document.empreinte` + `.octets` | la reprise du coffre a écrit puis rouvert 1150 lignes (`--verifier`), et l'écran de stockage répond par la branche `octets IS NOT NULL` |
| 154 | `archive_document.dossier` | `GET /suivi/archives` renvoie la clé `dossier` |
| 155 | `document_template.parcours_defaut` | `GET /templates` renvoie la clé `parcours_defaut` — c'est la tête de cascade |
| 157 | `generated_document.scope` = `…,'SESSION'` | un document de session a été créé le 2026-09-16 : sans la migration, l'ENUM aurait refusé l'INSERT |

⚠️ **156 (`quiz.parcours_defaut`) n'a PAS pu être vérifiée par l'API** : aucune réponse ne porte
la colonne — le parcours la CONSOMME (`active: q.parcours_defaut !== 0`) sans la renvoyer, et la
liste des QCM ne la demande jamais. L'utilisateur a rapporté l'avoir jouée. Pour lever le doute,
une seule requête :

```sql
SELECT COUNT(*) FROM information_schema.COLUMNS
 WHERE table_schema='impastio' AND table_name='quiz' AND column_name='parcours_defaut';
```

Si elle rend 0, rejouer `156_qcm_hors_parcours.sql` — c'est sans risque (`ADD COLUMN IF NOT
EXISTS`), et en attendant un QCM nouvellement créé entre dans TOUS les parcours, ce qui est
précisément ce que la migration corrige.

**Vérifié le 2026-08-22 contre la base de production** (VPS, 85 tables), colonne par colonne et
index par index. Les 119 et 120 ont été jouées ce jour-là ; tout le reste l'avait été sur
AlwaysData et est arrivé avec l'import.

**LA BASE EST L'AUTORITÉ, PAS CE FICHIER.** Ce paragraphe a remplacé une liste qui annonçait une
dizaine de migrations en attente alors qu'il n'en restait aucune — parce que personne ne la
mettait à jour en les jouant. Une note de ce genre se périme en silence, et on lui fait confiance
justement parce qu'elle a l'air précise. Avant de supposer qu'une colonne manque, interroger
`information_schema` :

```sql
SELECT COUNT(*) FROM information_schema.COLUMNS
 WHERE table_schema='impastio' AND table_name='…' AND column_name='…';
```

Deux pièges rencontrés en faisant ce contrôle, à ne pas re-découvrir :

- **un index ne se cherche pas par un nom approximatif.** La 132 a été annoncée « à jouer » alors
  qu'elle était en base : la requête filtrait sur `index_name LIKE '%name%'` au lieu du vrai nom,
  `uq_partner_nom` ;
- **une migration de DONNÉES est invisible à tout contrôle de schéma.** La 134 recopie `specs`
  vers `category` sur `partner_product` sans rien changer à la structure. Elle se vérifie sur le
  contenu : les catégories portent bien « Four, Électrique, 450 °C, 4 pizzas ».

**124 : ABANDONNÉE, à reverter si elle a été jouée.** Elle stockait sur `shop_request` le
destinataire de la facture choisi par le stagiaire au panier. Le choix est revenu à l'école, qui
le fait à l'émission — elle seule connaît l'accord de prise en charge. Son fichier **aller a été
supprimé** ; seul `124_revert_…` subsiste. Sans risque à ne pas jouer : quatre colonnes inertes.

⚠️ **La 131 a démarré à zéro destinataire**, volontairement : `DEFAULT 0` signifie qu'aucun
partenaire ne reçoit de coordonnées tant que l'école ne l'a pas coché sur sa fiche. À 1, elle
aurait fait de vingt-trois annuaires des destinataires de données personnelles sans que personne
ne l'ait décidé. **L'école doit donc cocher les quelques partenaires réellement concernés** —
rien ne se transmet avant.

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
- **Slug NON renommable** (retiré le 2026-09-09, à la demande de l'organisme). Il a existé un
  `PUT /templates/:slug/rename` qui répercutait le nouveau slug en cascade sur dix tables. Un slug
  est un IDENTIFIANT : seule sa stabilité compte, et l'intitulé — libre, lui — porte déjà tout ce
  qu'on lit à l'écran. Une cascade qui rate une référence ne se voit pas le jour du renommage mais
  des semaines plus tard, sur un document qui ne se génère plus. Le slug se choisit donc à la
  **création** et ne bouge plus ; pour en changer, on **duplique** le modèle sous le slug voulu.
  Le libellé d'audit `template.rename` est CONSERVÉ pour les lignes déjà journalisées.
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

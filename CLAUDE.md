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
> NULL partout, et rien ne s'efface avec le temps. Un fichier ne disparaît que par un geste humain :
> - le **retrait**, fichier par fichier, par l'école — à tout moment, pièce validée comprise : la
>   corbeille de la revue des pièces, sur la fiche stagiaire (`supprimerFichier`, qui EST la
>   purge manuelle) ;
> - le **refus** de la pièce, qui efface ses fichiers et ne garde que le statut et le motif
>   (`verifier`, depuis le 2026-09-02) ;
> - la **suppression du dossier**, que ses pièces suivent par cascade (migration 127).
>
> Le stagiaire n'a **pas** de corbeille (décidé par l'école le 2026-09-28) : le serveur le laisse
> encore retirer son propre fichier tant que la pièce n'est pas validée, mais aucun écran ne le lui
> propose. Les copies sont chiffrées au repos (AES-256-GCM) et n'apparaissent en clair dans aucune
> sauvegarde.
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

⚠️ **Une page rendue HORS de l'application n'a PAS ses couleurs** (banc d'essai, capture, page de
test qui charge `app.css` à la main). Toutes les variables de thème — `--border`, `--surface`,
`--muted`… — sont déclarées sous `[data-theme="light"]` / `[data-theme="dark"]`, posé sur `<html>`
par `index.html` puis par `ThemeContext`. Sans cet attribut, `var(--border)` vaut **vide**, et une
déclaration qui l'emploie est invalidée EN ENTIER : `border-left:2px solid var(--border)` ne
dessine alors aucun trait, en silence. Une marge posée dans la même règle, elle, s'applique — d'où
une mise en page qui *paraît* juste, sans ses filets ni ses fonds. **Toute page de vérification
doit donc porter `<html data-theme="light">`.** Relevé le 2026-09-23 : trois filets successifs ont
été « vérifiés » sur un banc sans thème, où aucun n'existait.

Compile-check d'un fichier JSX :
```bash
esbuild src/app/ui/pages/X.jsx --loader:.jsx=jsx --jsx=automatic --bundle \
  --external:react --external:react-dom --external:react-router-dom \
  --external:@tiptap/* --external:../* --external:./* --outfile=/dev/null
```

### 2.5 Tests
`cd src/api && npm test` (node:test), **~7 s** (315 fichiers ; « ~0,4 s » datait des 373 tests). État de
référence, **relevé le 2026-10-07** : **2650 tests — 2643 réussis, 0 échec, 7 ignorés. Garder ce niveau.**

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
  logique que la largeur — sans l'attribut, le contenu reste centré dans une cellule haute) ;
- **`object-fit` est ignoré** : une image prend EXACTEMENT la boîte de ses attributs `width`/`height`.
  Toutes les signatures de la feuille d'émargement sortaient écrasées (un tracé de 520 × 150 dans une
  case presque carrée), et le cachet de l'école élargi d'un tiers dans les cadres de 200 × 64 des
  documents — un cachet rond en ovale. La boîte se calcule aux proportions de l'image
  (`ajuster` / `cadrer`, lib/imagesPdf.js), et **`hspace` / `vspace` sont honorés** : ils rendent au
  cadre son encombrement exact (mesuré au rendu), la mise en page ne bouge pas ;
- **une image WebP en `data:` ne s'ouvre pas** : icône d'image cassée dans le PDF — or le navigateur
  réduit en WebP les cachets, logos et signatures déposés (lib/image.js, depuis le 2026-09-23). Le même
  WebP s'ouvre en fichier, ou DANS UN SVG : `htmlToPdf` l'y enveloppe (`imagesLisiblesParLibreOffice`) ;
- un `<th>` met en gras **tout** son contenu, classes comprises → `<td>` et `<b>` sur le seul intitulé ;
- un `<p>` d'espacement juste avant un tableau reste **attaché** à ce tableau : il a fait passer un pied
  de page entier en page 2, la place restant libre. L'air se donne par les cellules ;
- `<hr color>` sort en double filet gris → une bordure basse de cellule ;
- une espace insécable rend son groupe **insécable en largeur** : « Rattrapage : » (14 mm) a fait
  élargir une colonne entière, et serrer toutes les autres. Dans une colonne étroite, préférer un
  retour à la ligne.

**Éditeur (Tiptap/ProseMirror)** : ne conserve que les attributs `data-*` sur les tableaux (d'où
`data-border` / `data-width`). Un marqueur de bloc (`{#Articles}`) doit vivre **dans une cellule**,
jamais directement dans un `<tbody>` (il serait remonté hors du tableau).

**Jetons** : les jetons s'insèrent en **puces** `<span data-token="Clé">`, jamais en `{Clé}` brut
(sauf les marqueurs de bloc `{#Articles}` / `{#Stagiaires}`, qui sont des délimiteurs).

**La palette est complète PAR CONSTRUCTION (2026-09-26)** : tout jeton de `TOKEN_CATALOG` y est proposé
dans son groupe (`completerLaPalette`, template.controller.js) — plus de second geste à oublier. Les seules
exceptions sont écrites : un JUMEAU proposé (le Champ document qui imprime la même valeur, `JUMEAUX` —
égalités éprouvées une à une par `palette-complete.test.js`), un ancien nom (`{Date}`, `{PrixFormation}`), un
cadre du bloc Signatures, un groupe masqué, une donnée de facture seulement. Ce qui n'est pas proposé reste
RECONNU (`connus`). Un jeton nommé qui a un champ équivalent : l'ajouter à `JUMEAUX`, jamais le cacher à la main.
Une colonne ajoutée aux tables du dossier doit recevoir un libellé français (`FR_LABELS`, lib/conditions.js) ou
être écartée : le test lit `schema.sql` et toutes les migrations, et rougit sinon.
**La clé d'un jeton personnalisé est un IDENTIFIANT**, comme un slug : la fenêtre ne la laisse plus modifier une
fois enregistrée, et le serveur refuse (409) de retirer une clé qu'un modèle ou un autre jeton emploie — la
corriger (« Acomtpe » → « Acompte ») avait laissé un blanc à la place de l'acompte dans quatre modèles.
L'éditeur barre et nomme toute puce qui ne désigne plus rien, et affiche le libellé ACTUEL d'une puce figée sous
un libellé périmé (`libelleAffiche`, `ANCIENS_LIBELLES`).

**Un onglet d'éditeur resté ouvert RÉÉCRIT l'ancienne version** : l'éditeur enregistre ce qu'il a chargé, sans
regarder si le modèle a changé depuis. Le 2026-09-26, le devis RS7404 retravaillé (00 h 10–00 h 17) a été remplacé
une heure plus tard par l'ancienne mise en forme, depuis un onglet ouvert avant. Avant toute écriture de modèles
hors de l'éditeur (outil, migration), faire fermer ou recharger les onglets « Modèles → éditeur ».

**Un montant TAPÉ ne passe jamais par `Number()`, ni par un champ `type="number"`** (2026-09-29/30).
`Number("12,5")` vaut NaN ; et un champ numérique ne rend jamais ce qu'on a tapé : il lit la virgule selon les
réglages de l'APPAREIL — la langue de la page n'y change rien (relevé dans Chromium) — et rend VIDE ce qu'il ne sait
pas lire (règle HTML) : 0, sans un mot — une remise à 0 %, une TVA à 0 %. Les champs d'argent sont en texte
(`inputMode="decimal"`), lus par `lireMontant` (lib/montantSaisi.js, écran et serveur, tenus d'accord par un test) ;
l'illisible est refusé en disant « écrivez-le par exemple 315,93 » ; la base garde le point (`toFixed(2)`) ; une
valeur de la base s'affiche avec une virgule (`montantEnSaisie`). Un écran qui calcule à chaque frappe (fiche
technique) passe par `ChampMontant`. Tests : `montant-saisi*.test.js`.

**Une liste déroulante dont la valeur n'est dans AUCUNE option affiche la PREMIÈRE, sans un mot** (2026-09-30) : ni
React ni le navigateur ne préviennent. Or mysql2 rend un DECIMAL en CHAÎNE, avec ses décimales (« 10.00 » — pas de
`decimalNumbers`, config/database.js) : donné tel quel à une liste qui propose « 10 », il n'y désigne rien. La fenêtre
« Modifier l'article » de l'inventaire affichait ainsi « 20 % » pour un article à 10 %, à 5,5 % ou exonéré, à côté d'un
TTC calculé au vrai taux ; seul l'article à 20 % s'affichait juste, par hasard. Une valeur de la base se ramène à
l'écriture des options AVANT d'entrer dans l'état (`tauxEnListe`, Inventaire.jsx), et une valeur enregistrée hors de
la liste y reste proposée (`tauxProposes` ; même idée pour la forme juridique, Reglages.jsx). Tests : `inventaire-tva.test.js`.

**« Un centime de tolérance » se compte en centimes ENTIERS** (2026-09-30).
`Math.abs(somme - ttc) > 0.01` n'est pas une tolérance d'un centime : en flottant, 120,01 − 120 vaut
0,01000000000000512 (refusé) et 60,01 − 60 vaut 0,00999999999999801 (accepté). Comparer `Math.round(x * 100)`.

**Un montant ANNONCÉ est le total de la FACTURE — TRANCHÉ le 2026-09-30.** La facture arrondit la TVA PAR TAUX
(`ventilerTva`, Factur-X l'exige). Le panier du stagiaire, « Mes demandes », la carte d'une demande et la fenêtre
« Facturer la demande » additionnaient les TTC de ligne, la caisse arrondissait la TVA une fois sur le tout : sur près
d'un panier à deux taux sur quatre, on encaissait un centime de plus ou de moins que la facture (33,33 € à 20 % et
7,77 € à 5,5 % : 48,19 € encaissés, 48,20 € facturés). Tous passent désormais par `lib/ttc.js` — côté écran une COPIE de
`ventilerTva`, opération pour opération ; côté serveur un appel à `ventilerTva` : `totalFacture`, `totalDemande`
(l'école au centime, le partenaire ventilé À PART : il facture lui-même) et `ttcDeLigne` (la colonne « Total TTC » du
PDF, qui donne aussi le prix TTC d'un article et le montant de la notification d'une commande). Conséquence connue en
tranchant : plusieurs articles au MÊME taux peuvent ne pas s'additionner (2 × 25,00 € = 49,99 €), exactement comme sur
la facture. C'était déjà le cas avant, et plus souvent. Une somme de TTC de ligne réintroduite fait rougir
`total-facture-ecrans.test.js`. La tolérance d'un centime RESTE, à `invoiceShopRequest` comme à la caisse : une page
ouverte avant le déploiement envoie encore l'ancien total (`boutique-reglement.test.js`, `caisse-reglement.test.js`).
/factures compare encore en flottant, sans effet : son écran (`ttcDe`) calcule comme le PDF, un test le tient.

**LA CAISSE, CORRIGÉE LE MÊME JOUR** : elle comparait en flottant, et APRÈS avoir pris le numéro, décrémenté le stock et
écrit la vente ; son écran arrondissait par `Math.round`, son serveur par `toFixed`, et la vente d'UN article à 1,00 € ou
29,00 € HT à 5,5 % (0,45 € à 10 %) était refusée, écritures faites. Désormais tout se vérifie AVANT le numéro, en
centimes entiers, et l'écran comme le serveur calculent le total de la facture (`totalFacture`, ci-dessus —
`lib/totalCaisse.js`, qui arrondissait la TVA une fois sur le tout, est retirée). Tests : `caisse-reglement.test.js`.
**Tranché le même jour, pour les factures NOUVELLES** : sur plusieurs lignes d'un même taux, `ventilerTva`
arrondissait une somme FLOTTANTE, qui passe parfois sous un demi-centime — le PDF imprimait alors un centime de TVA de
moins que l'arrondi exact (0,26 % de paniers tirés au hasard ; jamais sur une ligne seule, jamais à 20 %). Une facture
née depuis la migration 192 compte en centimes entiers, taux par taux ; une facture d'avant garde son calcul (cf. § 4,
192). Les écrans suivent la facture qu'ils annoncent : le serveur leur dit laquelle (`tva_centimes`, cf. § 4, 192), et
la copie de `lib/ttc.js` porte les deux calculs. Tests : `facture-tva-centimes.test.js`, `total-facture-ecrans.test.js`.

**Une facture ÉMISE se RECALCULE à chaque téléchargement** (2026-09-30) : rien n'est figé — ni PDF, ni TVA, ni TTC.
Le PDF et le XML Factur-X se refont depuis les seuls HT (`invoice.amount_net`, `invoice_line`) par `loadInvoiceData`
puis `ventilerTva`. Toute correction du CALCUL change donc le duplicata de pièces déjà remises au client. Une telle
correction ne s'applique qu'aux factures NOUVELLES, par un drapeau que le code qui CRÉE la facture écrit (jamais une
valeur par défaut de la colonne, sinon l'ordre migration/déploiement compterait) : la 108 pour le taux, la 192 pour les
centimes. Trois points créent une facture (caisse, /factures, demande boutique) ; un test refuse qu'un quatrième oublie
le drapeau.

---

## 4. Migrations — **la 203 à jouer ; la 202, la 201 et la 200, la 199 et la 198 à jouer ; la 197 jouée (2026-10-01) ; la 196, la 195, la 194 et la 193 à jouer, la 192 jouée (2026-09-30) ; la 191 à jouer, la 190 à reverter (2026-09-29) ; la 186 et la 188 à jouer ; toutes jouées jusqu'à la 185 ; la 177 et la 175 à constater (relevé le 2026-09-28)**

**203 est À JOUER** (`203_remise_nb_documents.sql`, le NOMBRE DE DOCUMENTS par type de remise — demandé le
2026-10-06). Deux colonnes sur `remise_type` : `nb_documents` (smallint, 0 = pas de limite) et `nb_mode`
(varchar, 'PLAFOND' par défaut ou 'REQUIS'). Au lieu de créer quatre ou cinq types pour un même envoi (l'AGEFICE
en plusieurs pièces), un seul type en porte plusieurs : **PLAFOND** « au plus N » (le dépôt plafonne, l'étape est
faite dès l'accusé), **REQUIS** « il en faut N » (le dépôt plafonne ET l'accusé de réception est refusé tant qu'il
manque des documents). L'ACCUSÉ RESTE UNIQUE pour toute la remise (choix de l'école, pas un par document). La
**complétion ne change pas** (parcours, conformité, groupe INCHANGÉS) : elle reste « accusé de réception » — on ne
la franchit qu'une fois les N déposés, parce que l'accusé lui-même est bloqué avant (`accuser` → 422 ;
`manquePourRequis`, lib/remiseNb.js, partagé écran/serveur). Le plafond est vérifié au dépôt (`deposer` → 422) AVANT
l'upsert, pour qu'un refus n'efface pas un accusé. Sans la migration, rien ne casse : tout type est « illimité »
(le comportement d'avant), et fixer un nombre répond 503 « migration 203 non jouée » (comme le destinataire sans la
188). **Elle se vérifie par l'API, sans SQL** : enregistrer un type avec « 3 requis » répond 200 (et non 503), puis
`GET /api/remises` rend `nb_documents: 3` et `nb_mode: 'REQUIS'`. Ou une requête, qui doit rendre 2 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='remise_type' AND column_name IN ('nb_documents','nb_mode');`
⚠️ Son revert retire les deux colonnes : les types reviennent à « sans limite, sans requis » ; les fichiers déjà
déposés et les accusés donnés restent. Tests : `remise-nb.test.js`.

**202 est À JOUER** (`202_community_newsletter.sql`, la NEWSLETTER — une annonce de la Communauté envoyée aussi par
e-mail aux stagiaires, demandée le 2026-10-04). Une colonne `community_post.newsletter_envoye_le` (datetime) : une
TRACE (afficher « Newsletter envoyée le… », empêcher un second envoi). Modèle « soft opt-in client existant » décidé
avec l'école : on écrit aux stagiaires SANS second « oui », mais CHAQUE e-mail porte un lien de DÉSINSCRIPTION en un
clic — un jeton JWT signé (`lib/newsletter.js`, rien à stocker) qui ne vaut QUE pour ça et n'expire pas (se désinscrire
doit toujours marcher). La désinscription s'écrit au registre des consentements (130, déjà jouée), finalité
`'newsletter'` — gardée HORS de `FINALITES` (sinon elle redeviendrait une case « Oui » à cocher dans l'écran de
consentement) : `enregistrerNewsletter` / `desinscritsNewsletter` / `estInscritNewsletter` (consentements.js). Le PUBLIC
= stagiaires de l'org AYANT UN COMPTE ACTIF (`learner.user_id` + `user.active = 1`), avec e-mail, moins les désinscrits,
dédoublonné par adresse. ⚠️ **Restreint aux titulaires d'un compte le 2026-10-05** (limite d'envoi OVH ~1000/j + un cap
horaire ; l'envoi est UN e-mail par personne, pas un Cci — écrire à tous les anciens stagiaires = rafale + rebonds, le
pire signal de spam). Élargir « le reste » demandera une FILE qui respecte la limite et étale l'envoi, pas un simple
relâchement du filtre d'audience.
Case « Envoyer aussi en newsletter » sur le formulaire d'annonce (bureau), avec le nombre de destinataires affiché
AVANT (`GET /api/community/newsletter/apercu`). Envoi fire-and-forget (`declencherNewsletter`, jamais bloquant),
journalisé dans `mail_envoi` (178). Désinscription PUBLIQUE sans login (`/api/public/newsletter/:token`, page front
`/desinscription/:token`) : le GET valide sans rien changer (anti pré-chargement), seul le POST désinscrit. Le
stagiaire gère aussi sa réception depuis « Mon profil » (`GET/PUT /api/mon-espace/newsletter`, source
`espace_stagiaire`) — un interrupteur « Recevoir / Ne plus recevoir », jamais une question en attente (opt-out, pas
dans `FINALITES`). **AUCUNE
donnée ne dépend de la 202** : l'envoi marche avant comme après (la date est écrite en try/catch, le fil relu en
cascade). **Elle se vérifie par l'API, sans SQL** : `GET /api/community/posts` rend la clé `newsletter_envoye_le` sur
une annonce envoyée en newsletter. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='community_post' AND column_name='newsletter_envoye_le';`
⚠️ Son revert retire la colonne (on n'affiche plus « envoyée le… ») ; les e-mails partis sont partis, les
désinscriptions (consent_record) restent. Tests : `newsletter.test.js`.

**201 est À JOUER** (`201_document_jetons_figes.sql`, les DONNÉES d'un document FIGÉES à son émission — demandé le
2026-10-04, « URGENT »). Une colonne `generated_document.jetons_figes` (longtext, JSON CHIFFRÉ au repos comme
`saisies`). Un document se rendait à CHAQUE ouverture depuis les données vivantes du dossier : {Date}/{Today} (« Date
du jour », `new Date()`) redatait un devis émis en mai à la date de relecture, et prix/adresses/dates auraient suivi
tout changement depuis. DEUX niveaux de correctif : (1) SANS migration, la DATE est déjà figée — `loadContext` lit
`sent_at` (à défaut `signed_at`) et la passe au rendu (`ctx.figeLe`, lu par `resolveTokens` à la place de
`new Date()`) ; un brouillon pas encore émis garde la date vivante. (2) AVEC la colonne, `loadContext` CRISTALLISE à la
première lecture après l'émission (figeLe non nul) les données de fusion — stagiaire, entreprise, formations, champs du
dossier (`fields`), financeur, date — puis les SERT aux lectures suivantes. Point d'étranglement UNIQUE : tout rendu
(aperçu, PDF, Word, archive, empreinte, PDF scellé, espace entreprise, lien de signature) passe par `loadContext`.
NE SONT PAS FIGÉS, volontairement : l'ORGANISME (l'émetteur / le papier à en-tête — figer son logo dans chaque document
gonflerait la base), les SIGNATURES et le cachet apposé (complétés APRÈS l'envoi), les ZONES (`saisies`), les
CONSENTEMENTS (déjà figés à la signature), les jetons PERSONNALISÉS (recalculés) et les résultats d'EXAMEN/JURY
(finalisés, porteurs des signatures des membres). Idempotent (`WHERE jetons_figes IS NULL`), tolérant (colonne absente →
rendu vivant, date figée ; `ER_BAD_FIELD_ERROR`/`ER_NO_SUCH_TABLE` avalés) ; une feuille d'émargement n'est jamais figée
ici. Sans la migration, rien ne casse : seule la date est figée, le reste reste vivant comme avant. **Elle se vérifie
par l'API, sans SQL** : ouvrir deux fois un devis ENVOYÉ en changeant une donnée du dossier entre les deux (p. ex.
l'adresse du stagiaire) — le PDF ne bouge pas. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='generated_document' AND column_name='jetons_figes';`
⚠️ Son revert supprime la colonne : les documents non signés se remettent à se rendre depuis les données vivantes (la
date reste figée, via `sent_at`) ; les signés gardent leur PDF scellé. Tests : `jetons-figes.test.js`,
`jeton-date-figee.test.js`.

**200 est À JOUER** (`200_connexion_jour.sql`, les STATISTIQUES de connexion — page Statistiques, Qualité &
conformité, demandée le 2026-10-02). Une table `connexion_jour` (user_id, jour, organization_id, est_stagiaire ;
clé primaire (user_id, jour)). `user.last_login_at` ne garde que la DERNIÈRE connexion : impossible d'en tirer une
courbe. On enregistre donc, à chaque connexion réussie, le JOUR — une ligne par compte et par jour (INSERT IGNORE,
requête À PART et tolérée dans le handler de connexion ; `est_stagiaire` fige le rôle du jour pour séparer stagiaires
et équipe sans jointure). La page (`GET /api/statistiques/connexions`, rôles AUDIT = bureau + auditeur) montre DEUX
vues, stagiaires et équipe séparés : la RÉPARTITION PAR RÉCENCE (lue sur `last_login_at`, dispo tout de suite) et les
CONNEXIONS PAR JOUR sur DEUX SEMAINES (lues sur `connexion_jour`). Les règles pures (tranches, fenêtre, densification)
sont dans `lib/statsConnexions.js`. Sans la migration, rien ne casse : la connexion n'écrit pas la ligne (requête à
part), et la page rend la récence mais pas la courbe (`par_jour: null` → « se remplira à partir du déploiement »).
**Elle se vérifie par l'API, sans SQL** : se connecter, puis `GET /api/statistiques/connexions` rend `par_jour` non
nul (14 jours) avec au moins une connexion aujourd'hui ; sans la table, `par_jour` est null. Ou une requête, qui doit
rendre 1 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='connexion_jour';`
⚠️ Son revert supprime la table : l'historique des connexions par jour (la courbe) est perdu ; `last_login_at` reste,
donc la récence aussi. Tests : `statistiques-connexions.test.js`.
ENRICHIE le 2026-10-04 (sans migration) : la courbe passe AVANT la récence ; fenêtre réglable (7/14/30 j, `?jours=`) ;
la part STAGIAIRE de chaque barre est colorée PAR FORMATION (les COULEURS EXISTANTES de l'app — `colorForLevel`,
lib/levels.js, surcharges de l'organisme comprises ; légende dynamique), un stagiaire inscrit à
k formations étant RÉPARTI 1/k dans chacune (« niv1 niv2 → 50/50 », `pondererFormations` : la somme des parts d'un jour
= les stagiaires distincts ; « Sans formation » pour un connecté sans inscription) ; le survol donne le détail pondéré
(badges colorés « NIV2 : 4,5 »…) ; un résumé (personnes DISTINCTES + jour le plus actif) ; « les plus assidus » ; et les
NOMS des stagiaires à relancer (jamais connectés, +30 j) sous la récence. `formations_cle` (ordre global) part à l'écran
pour les couleurs + la légende. Règles pures : `pondererFormations`, `relancer` (statsConnexions.js).
ENRICHIE à nouveau le 2026-10-05 (sans migration) : la RÉCENCE (« Depuis la dernière connexion ») est AUSSI colorée PAR
FORMATION, comme la courbe — la TRANCHE de récence joue le rôle du « jour » et réutilise `pondererFormations` (même 1/k,
même « Sans formation »). Lu sur `enrollment` (PAS `connexion_jour`), donc dispo MÊME sans la 200. `recence_formations`
(tranche → parts colorées) part à l'écran ; une formation vue SEULEMENT en récence s'unifie à `formations_cle` (mêmes
couleurs, même légende). Tests : `statistiques-connexions.test.js`.

**199 est À JOUER** (`199_user_desactivation.sql`, la DÉSACTIVATION volontaire d'un profil stagiaire — demandée le
2026-10-02). Une colonne `user.deactivated_at` (datetime). Un stagiaire désactive son profil depuis « Mon profil →
Compte » : ça pose seulement la DATE, la connexion reste ouverte. TOUTE CONNEXION l'efface (se reconnecter = garder
son profil — requête À PART de celle de `last_login_at`, pour qu'une colonne absente ne casse pas la trace de
connexion). Au bout de **15 SEMAINES** sans connexion, un passage QUOTIDIEN (`lib/purgeComptesDesactives.js`, lancé de
`server.js`) SUPPRIME ses données non essentielles — progression Pizza Quest (`learner_quest_progress`,
`learner_quest_life`), mercuriale (`mercuriale_item`), fiches techniques (`recipe` + cascade, et ses `recipe_like` /
`recipe_comment` / `recipe_read` sur les fiches des autres), avatar/cadre (`learner.avatar`/`cadre`) — et COUPE son
accès (`active = 0`). Ce qui RESTE toujours : documents, pièces, parcours, émargement, factures, consentements (les
preuves), plus `levels`/`completed_levels` et `cadres_exclusifs` (accès formation + cadres de l'école). La purge est
TOLÉRANTE (une table absente — cœurs retirés en 115, mercuriale — n'arrête pas les autres) et IDÉMPOTENTE (`active = 0`
exclut du passage suivant). La désactivation est RÉSERVÉE aux STAGIAIRES (le serveur refuse 403 au bureau : sinon on
couperait l'accès de l'école après 15 semaines). Sans la migration, rien ne casse : le bouton s'affiche mais la
désactivation répond 503, et le passage sort sans rien faire (colonne absente). ⚠️ Son revert efface les demandes de
désactivation EN ATTENTE (aucune donnée n'est supprimée pour autant) ; les comptes DÉJÀ purgés restent désactivés et
vidés — le revert ne leur rend rien. **Elle se vérifie par l'API, sans SQL** : en tant que stagiaire, `POST
/api/auth/deactivate` répond 200 (et non 503), puis `GET /api/auth/me` rend `deactivated_at` rempli ; une reconnexion
le remet à null. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='user' AND column_name='deactivated_at';`
Tests : `desactivation-profil.test.js`.

**198 est À JOUER** (`198_mail_regle_formation.sql`, PLUSIEURS FORMATIONS pour un envoi programmé — demandée le 2026-10-01 :
« pour qui → Formation → Toutes, une, plusieurs »). Une table d'association `mail_regle_formation` (regle_id, program_id),
comme `mail_regle_doc` : clé primaire sur le couple, les deux liens ON DELETE CASCADE. Une règle ne filtrait que sur UNE
formation (`mail_regle.program_id`, NULL = toutes) ; elle peut désormais en viser plusieurs. La table FAIT AUTORITÉ quand
elle porte des lignes ; sinon on retombe sur `program_id` (`formationsDeRegle`, reglesDocument.js) — avant comme après la
migration. `program_id` reste EN PHASE : une SEULE formation choisie y est écrite (un revert de la 198 la garde) ; zéro ou
plusieurs → NULL (une règle multi redevient « toutes » au revert, perte assumée). Les deux points de filtrage suivent : le
passage des règles de DATE (`passageMailsProgrammes.js`, `AND s.program_id IN (?)`) et le crochet des règles de DOCUMENT
(`regleViseDocument` : le document doit être de l'une des formations visées). L'écran (Formations → cases « Toutes / une /
plusieurs ») ne propose le multi que si la table existe (`formations_multiples` dans `GET /api/mailing/regles`) ; sinon un
select d'une formation, comme avant. Sans la migration, rien ne casse : une règle à UNE formation marche (program_id),
viser PLUSIEURS répond 503 « migration 198 non jouée » (au lieu d'un repli silencieux sur « toutes »). **Elle se vérifie
par l'API, sans SQL** : enregistrer une règle sur DEUX formations répond 200, puis `GET /api/mailing/regles` rend
`program_ids` à deux éléments et `formations_multiples: true`. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='mail_regle_formation';`
⚠️ Son revert supprime la table : les règles à UNE formation la gardent (program_id), celles à plusieurs redeviennent
« toutes formations ». Tests : `mail-regle-formations.test.js`.

**197 est JOUÉE — constaté le 2026-10-01 par l'API, sans SQL** : `GET /api/mailing/signature` répond 200 `disponible: true`
(et non 503). Son paragraphe garde ce qu'elle fait et son revert.

**197** (`197_organisme_signature_email.sql`, la SIGNATURE des e-mails — demandée le 2026-10-01). Une colonne
JSON sur `organization` : `email_signature`, à l'image de `logo_image` (une data URL en base). Elle porte les champs
modifiables (sous-titre « Administration », site, liens Facebook/Instagram/YouTube, mention des labels) ET les images de la
signature — un logo PROPRE à la signature (choisi par l'école, indépendant du logo de l'organisme) et jusqu'à 4 badges
(Qualiopi/ICPF/cofrac…) — en data URL **PNG** (jamais WebP : Outlook ne l'affiche pas ; l'écran force le PNG,
`reduireEnPngDataUrl`, le serveur refuse le reste). La signature paraît au bas de **CHAQUE** e-mail : un seul point
d'injection, `coquille()` (mailTemplates.js, le squelette commun à tous les gabarits, message de groupe compris), qui rend
`signatureHtml(signature(), o)` à la place du pied de page texte quand elle est configurée ; les images voyagent en pièce
jointe `cid:`, ajoutées à chaque envoi par `mailer.js` (`signatureAttachments()`, même chemin que le logo). L'aperçu repasse
les `cid:` en `data:` (`logoPourApercu`, étendu). Le nom, le téléphone, l'e-mail et l'adresse viennent de l'organisme, pas
de la config. Règles : `lib/signatureEmail.js` (parse, validation, HTML, pièces jointes), lue par orgContext (4ᵉ requête
isolée, cascade ER_BAD_FIELD_ERROR), l'éditeur dans Mailing → Signature. Le corps de l'enregistrement est plafonné (4
badges, 200 Ko/image) pour tenir sous les 2 Mo d'`express.json`. Sans la migration, rien ne casse : les e-mails gardent leur
pied de page texte, l'onglet Signature le dit (« migration 197 non jouée ») et l'enregistrement répond 503. **Elle se
vérifie par l'API, sans SQL** : enregistrer une signature dans Mailing → Signature répond 200 (et non 503), puis
`GET /api/mailing/signature` la rend. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='organization' AND column_name='email_signature';`
⚠️ Son revert efface la signature (les e-mails reviennent au pied de page texte). Tests : `signature-email.test.js`.

**196 est À JOUER** (`196_mail_regles_document.sql`, les règles d'e-mail déclenchées par un DOCUMENT + le CIBLAGE d'un
stagiaire/entreprise — demandé le 2026-09-30, en prolongement des envois programmés (178/179)). Une règle partait jusqu'ici
d'une DATE (fin de session, début, inscription) décalée, filtrée au plus par formation, et allait au stagiaire. On ajoute
deux déclencheurs d'ÉVÉNEMENT — `document_envoye`, `document_signe` (valeurs de la colonne `declencheur` qui existe déjà) —
qui partent À L'INSTANT où le document change d'état, pour un MODÈLE au choix (`template_slug`) ; et, sur toutes les règles,
`destinataire` ('stagiaire' / 'entreprise' / 'stagiaire_entreprise') + `learner_id` / `company_id` (viser une personne ou une
entreprise précise). Une table `mail_regle_doc` (regle, document, destinataire) déduplique les événements — `mail_regle_envoi`
reste pour les règles de date. **Décidé avec l'école (AskUserQuestion) : les deux événements, filtrables par modèle ; le
stagiaire ET/OU l'entreprise ; à l'instant.** LE CROCHET (`lib/crochetMailsDocument.js`, `declencherPuisOublier`) est appelé
après CHAQUE transition d'envoi/signature (sendDocument, sendPreparedDoc, signDocument via `applyLearnerSignature` /
`applySlotSignature`, et le QCM APRÈS son commit), à part et JAMAIS bloquant : un e-mail raté ne fait pas échouer une
signature. L'envoyeur est partagé avec le passage (`lib/envoiGroupe.js`, une seule copie — server.js le disait déjà). Le
destinataire « entreprise » = l'e-mail du compte du représentant (`user.email` via `company.user_id`), sinon `company.email`.
Le jeton {Document} (titre du document) s'ajoute aux jetons des règles. Sans la migration, rien ne casse : les règles de
date marchent comme avant, créer une règle d'événement ou avec ciblage répond 503, et le crochet ne trouve pas de colonnes
(il sort). **Elle se vérifie par l'API, sans SQL** : `GET /api/mailing/regles` rend `destinataire` sur une règle ; créer une
règle « document signé » répond 200 (et non 503). Ou une requête, qui doit rendre 5 (4 colonnes + la table) :
`SELECT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='mail_regle' AND column_name IN ('template_slug','destinataire','learner_id','company_id')) + (SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='mail_regle_doc');`
⚠️ Son revert retire les colonnes et la table : les règles d'événement déjà créées deviennent inertes (le passage ignore un
déclencheur inconnu), les règles de date repartent au stagiaire sans ciblage. Tests : `reglesDocument` + `crochet-mails-document`
(le cœur), `mails-programmes` (lireRegle événement), et l'envoyeur partagé (`mails-programmes`, `mailing-personnalise`).

**195 est À JOUER** (`195_reglement_moyen_paiement.sql`, le MOYEN DE PAIEMENT du règlement — demandé le 2026-09-30, dans la
foulée de la carte « Règlement » (194) : « le type de paiement, et si chèque un n°, si virement une référence »). Quatre
colonnes sur `enrollment` : `acompte_moyen` / `acompte_ref` / `solde_moyen` / `solde_ref` (varchar, non enum : un moyen de
plus ne demandera pas de migration). **SÉPARÉMENT acompte et solde** (un acompte par chèque, un solde par virement). La
LISTE des moyens (ESPECES, CHEQUE, VIREMENT, CARTE) vit dans `lib/moyensPaiement.js`, en DEUX exemplaires tenus d'accord par
un test (serveur `src/api/lib`, écran `src/app/ui/lib`) ; seuls le chèque et le virement demandent une référence. Ça se
saisit sur la carte « Règlement » (fiche stagiaire), à côté du « payé le … » de la 194, et ça s'imprime par QUATRE JETONS
NOUVEAUX du groupe « Stagiaire » : {Moyen acompte}, {Réf acompte}, {Moyen solde}, {Réf solde} ({Moyen…} imprime le LIBELLÉ
« Chèque », pas le code). ⚠️ **{Acompte} et {Reste à payer} ont été DÉPLACÉS** du groupe de palette « Prix et financement »
vers « Stagiaire » à cette occasion (même valeur, même résolution — seule leur place dans la palette change ; les deux
modèles de facture sont `company_level=0`, donc le groupe « Stagiaire » reste visible dans leur éditeur). Les colonnes sont
ÉCARTÉES des « Champs documents » (`EXCLUDED_EXACT`, lib/conditions.js) : offertes comme champs, elles imprimeraient le code
brut. Sans la migration, rien ne casse : la carte n'affiche pas le sélecteur et le dit (« migration 195 non jouée »), la
saisie répond 503, et les jetons sortent vides (donc facultatifs, `OPTIONAL_TOKENS`). Sur une facture de groupe, le moyen
est celui du PREMIER dossier (règlement global). **Elle se vérifie par l'API, sans SQL** : choisir « Chèque » + un n° pour
l'acompte d'un dossier répond 200 (et non 503), puis `GET /api/stagiaires/:id/reglements` rend `acompte.moyen: "CHEQUE"` et
`acompte.ref`. Ou une requête, qui doit rendre 4 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='enrollment' AND column_name IN ('acompte_moyen','acompte_ref','solde_moyen','solde_ref');`
⚠️ Son revert efface les moyens et références saisis ; les montants et les dates (194) restent. Tests :
`moyens-paiement.test.js` (les deux listes d'accord + validation), `reglement-dossier.test.js` (le moyen traverse le calcul),
`reglement-fiche.test.js` (503 sans la 195, moyen inconnu refusé), `facture-formation-tokens.test.js` (les jetons sur la
facture), `palette-complete.test.js` (le déplacement de groupe).

**194 est À JOUER** (`194_enrollment_reglement.sql`, le SUIVI DU RÈGLEMENT d'un dossier — carte « Règlement » de la
fiche stagiaire, demandée le 2026-09-30 : « savoir si le stagiaire a payé l'acompte et le reste »). Deux colonnes DATE
sur `enrollment` : `acompte_paye_le` et `solde_paye_le`. LOGIQUE HYBRIDE, la facture d'abord (règle pure, éprouvée sans
base : `lib/reglementDossier.js`) : une ligne (acompte / solde) portée par une FACTURE se lit d'après la table `payment`
(règlements REUSSI) et ne se saisit pas ; SANS facture, l'école coche « payé le … » — ce sont ces deux dates. Le MONTANT
de l'acompte, lui, réutilise la colonne `enrollment.acompte` qui existait DÉJÀ mais n'avait aucun chemin d'écriture : la
carte lui en donne un (acompte convenu, saisi à la main). ⚠️ EFFET DE BORD ASSUMÉ : un modèle qui emploie le jeton
{Acompte} (le CHAMP, pas le jeton personnalisé de l'organisme) ou {Reste à payer} imprimera désormais ce montant au lieu
d'un blanc — ces jetons lisent `enrollment.acompte`, resté nul jusqu'ici. Le reste à payer = prix − acompte (prix = prix
du dossier, sinon tarif de la formation, `montantDuDossier`). Écriture réservée à qui peut ÉCRIRE la rubrique Stagiaires
(`peutEcrire`, délégation comprise — le serveur l'exige aussi, `authorizeRoles` honore la délégation sur /stagiaires).
Sans la migration, rien ne casse : la carte lit le règlement d'après les seules factures, le montant de l'acompte se
saisit quand même (sa colonne préexiste), et cocher « payé le … » répond 503 « migration 194 non jouée ». **Elle se
vérifie par l'API, sans SQL** : cocher « acompte payé le … » sur un dossier SANS facture répond 200 (et non 503), puis
`GET /api/stagiaires/:id/reglements` rend `acompte.date` rempli et `acompte.source: "manuel"`. Ou une requête, qui doit
rendre 2 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='enrollment' AND column_name IN ('acompte_paye_le','solde_paye_le');`
⚠️ Son revert efface les deux dates cochées à la main (les paiements portés par des factures restent, ils vivent dans
`payment`) ; la colonne `acompte` n'est PAS touchée (elle préexiste). Tests : `reglement-dossier.test.js` (la règle pure),
`reglement-fiche.test.js` (les routes : 422 montant illisible, 503 sans la 194, GET assemblé).

**193 est À JOUER** (`193_memo_fichiers.sql`, les PIÈCES JOINTES d'un mémo — demandées le 2026-09-30 : « joindre une image au
mémo, deux au plus, une image collée ou un PDF »). Une table `memo_fichier` : `memo_id` (ON DELETE CASCADE : les pièces partent
avec leur mémo, et seulement avec lui), `nom`, `mime`, `octets` (le poids en clair), `bytes` (CHIFFRÉS au repos, comme les
photos de la Communauté), `rang`. À PART de `memo`, parce que la liste se relit toutes les minutes : elle ne lit que le nom, le
type et le poids, le fichier ne voyage qu'à l'ouverture. DEUX par mémo, c'est le serveur qui compte ; le TYPE se lit dans les
octets (JPEG, PNG, WebP, PDF — `lib/memoFichiers.js`), jamais dans ce que l'envoi déclare ; une image est réduite par le
navigateur (`lib/image.js`, profil `memo` : 1 800 px, 450 Ko visés, 900 au plus) et refusée au-delà de 1 Mo, un PDF au-delà de
5 Mo (multer s'arrête à 6 Mo, pour que ce soit le contrôleur qui réponde). Les pièces se posent à la CRÉATION du mémo, dans le
MÊME envoi (multipart ; sans pièce, le mémo reste en JSON) : fichier refusé, table absente ou écriture ratée, le mémo n'est pas
créé à moitié. Une pièce ne s'ouvre que pour qui VOIT le mémo (`memoVisible` : l'auteur, l'équipe s'il est partagé, le collègue
mentionné), sous le type prouvé, `nosniff`, et SANS cache — la règle `no-store` de toute l'API, c'est une note privée. Les noms
voyagent à part (`noms`) : multer lit un nom de fichier en latin1. Sans la migration, rien ne casse : pas de trombone
(`pieces_jointes: false` dans `GET /api/memos`), un mémo envoyé avec un fichier répond 503, les autres marchent comme avant.
**Elle se vérifie par l'API, sans SQL** : `GET /api/memos` rend `pieces_jointes: true`. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='memo_fichier';`
⚠️ Son revert supprime toutes les pièces jointes, et elles seules. Tests : `memos-fichiers.test.js`.
LE BROUILLON D'UN MÉMO, lui, n'a PAS de migration (même jour) : ce qu'on écrit vit hors du panneau (`lib/brouillonMemo.js`),
tient à sa fermeture ET au rechargement (`sessionStorage`, propre à l'onglet, gravé avec l'identifiant du compte et effacé à la
déconnexion), jusqu'à l'envoi ou « Effacer ». Les fichiers joints du brouillon restent en mémoire : ils tiennent à la
fermeture, pas au rechargement. Tests : `brouillon-memo.test.js`.

**192 est JOUÉE — constaté le 2026-09-30 par l'API, sans SQL** : `GET /api/factures` (`SELECT i.*`) rend la clé `tva_centimes` ;
sans la colonne, elle n'existerait pas. Aucune facture n'avait encore été créée depuis (toutes à 0). Son paragraphe garde ce
qu'elle fait et son revert.

**192** (`192_facture_tva_centimes.sql`, avant ou après le code, l'ordre ne compte pas : la TVA d'une
NOUVELLE facture en centimes entiers — décidé avec l'école le 2026-09-30). Une colonne sur `invoice` : `tva_centimes`
(tinyint, 0 par défaut). `ventilerTva` additionnait en flottant les HT d'un même taux : sur un demi-centime, le PDF et le
XML imprimaient un centime de moins que l'arrondi exact (429,35 € HT à 10 % en quatre lignes : 472,28 € au lieu de
472,29 €), et les écrans qui recopient leur calcul (`lib/ttc.js`) faisaient encaisser autant.
Rien n'étant figé à l'émission (cf. § 3), seules les factures NÉES depuis la migration comptent en centimes entiers : le
code qui les crée (caisse, /factures, demande boutique) écrit `tva_centimes = 1` quand la colonne existe ; les factures
existantes restent à 0, l'ancien calcul, à l'identique. Le 1 est écrit par le code, JAMAIS par défaut : jouée avant le
déploiement, les factures que l'ancien code crée entre-temps restent à 0 ; jouée après, celles d'entre-temps reçoivent 0
à l'ajout de la colonne. La vérification du règlement (caisse, demande boutique, /factures) calcule comme la facture
qu'elle précède, et LES ÉCRANS AUSSI : le serveur leur dit le calcul par `tva_centimes` — les réglages de la caisse
(`GET /ventes/settings`, pour la caisse), chaque demande de la liste (`GET /boutique/demandes`, pour sa carte et la
fenêtre « Facturer la demande ») et de « Mes demandes » (qui le donne aussi, à la racine, pour le panier). Une demande
déjà facturée suit SA facture (`tvaCentimesDeLaDemande`, lib/ttc.js) ; les autres, celle qui naîtra. Un article seul ne
change jamais : `ttcDeLigne` et le prix d'un article s'accordent avec les deux calculs. Sans la migration, rien ne
change. **Elle se vérifie par l'API, sans SQL** : créer une facture après l'avoir
jouée, puis `GET /api/factures` (`SELECT i.*`) — la nouvelle ligne porte `tva_centimes: 1`, les anciennes 0 ; sans elle,
la clé n'existe pas. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='invoice' AND column_name='tva_centimes';`
⚠️ Son revert fait repasser à l'ancien calcul les factures créées depuis : celles dont la TVA tombait sur un demi-centime
se réimprimeraient avec un centime de moins que l'exemplaire remis. Tests : `facture-tva-centimes.test.js`.

**191 est À JOUER** (`191_fiche_photo.sql`, la PHOTO d'une fiche technique — demandée le 2026-09-29 avec le nouvel
éditeur). Une table `recipe_photo` : une photo par fiche (`recipe_id` en clé primaire, ON DELETE CASCADE), octets CHIFFRÉS
au repos comme ceux de la Communauté, `empreinte` (12 caractères du SHA-256) dans l'adresse de l'image pour que le cache
suive une photo remplacée, `octets` en clair. « PAS GRASSE », demandé par l'école : le navigateur réduit (`lib/image.js`,
profil `fiche` : 1 000 px, 160 Ko visés, 220 au plus), le serveur refuse au-delà de 250 Ko (`MAX_PHOTO_FICHE`,
`lib/photoFiche.js`), multer s'arrête à 400 Ko pour que ce soit le contrôleur qui réponde (413 lisible). Le FORMAT se lit
dans les octets (JPEG, PNG, WebP — `lib/formatImage.js`), jamais dans le type déclaré. Seul l'auteur pose ou retire la
photo ; la LIRE, c'est pouvoir ouvrir la fiche (`lib/ficheAccessible.js`, la règle unique, que les j'aime et commentaires
partagent). Contrôleur à part (`photoFiche.controller.js`) : c'est le seul endroit des recettes qui rouvre le cache
(`cache-documents.test.js`). Collation `utf8mb4_general_ci`, celle de `recipe` (cf. 107) — sinon la clé étrangère est
refusée. Sans la migration, rien ne casse : l'emplacement dit « Photo pas encore disponible », l'envoi répond 503, les
listes s'affichent sans photo. **Elle se vérifie par l'API, sans SQL** : poser une photo sur une fiche, puis
`GET /api/recipes/:id` rend `photo_disponible: true` et `photo_v` rempli. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='recipe_photo';`
⚠️ Son revert supprime toutes les photos, et elles seules. Tests : `fiche-photo.test.js`.

**190 : ABANDONNÉE, et JOUÉE — à reverter** (`190_revert_program_step_destinataire.sql`, un `DROP COLUMN IF EXISTS
destinataire` sur `program_step`). Jouée le 2026-09-28 pour essayer le destinataire des jalons (CGV reçues par l'entreprise) ;
l'école a préféré dupliquer le document en « Groupe », et la PR #246 a retiré le code et les deux fichiers. Le revert revient
seul, comme celui de la 187 : jouer ce fichier retire la colonne restée en base. Plus rien ne la lit. Sans risque s'il est
rejoué. La 191 ne réutilise PAS le numéro : 190 reste celui d'une migration jouée.

**188 est À JOUER** (`188_remise_destinataire_etape_facultative.sql`, demandée le 2026-09-28 : « pour les Documents remis,
choisir qui les reçoit, le stagiaire ou l'entreprise dans son espace ; et dans le parcours, une option facultatif qui ne compte
pas dans la complétion »). Deux colonnes.
`remise_type.destinataire` ('STAGIAIRE' par défaut, ou 'ENTREPRISE', choisi dans Modèles → Documents remis) : une remise
adressée à l'entreprise paraît dans l'ESPACE ENTREPRISE (carte « Documents remis à votre entreprise », `GET /api/rep/remises`),
c'est le compte du représentant qui en accuse réception, et le stagiaire ne la voit pas. UNE SEULE RÈGLE, `pourEntreprise`
(remise.controller.js) : un stagiaire inscrit SANS entreprise, ou dont l'entreprise n'a PAS D'ESPACE (`company.user_id` vide),
la reçoit lui-même, sinon personne ne pourrait l'accuser (le bureau ne le peut pas, cf. 160) ; le panneau du bureau le dit.
`program_step.facultatif` (0 par défaut) : une case « Facultatif » par JALON dans Formations → Parcours documentaire, la même
dans la section entreprise. L'étape reste visible et faisable, mais n'entre dans AUCUN côté de la fraction (faite ou non),
n'est jamais la prochaine étape, ne ferme aucun point d'accès, ne compte pas dans « x/y signés » ; la grille du Suivi la
montre faite, ou hors décompte, jamais comme un manque. Le rang du pipeline (« Étape 3/10 ») se compte parmi les étapes DUES
(`parc.rang`). DÉFAUT TROUVÉ EN L'ÉCRIVANT : les remises tenaient pour du personnel tout rôle ni STAGIAIRE ni INTERVENANT, si
bien qu'un compte ENTREPRISE aurait lu les remises et les fichiers de n'importe quel dossier ; la liste est désormais écrite
(`ROLES_BUREAU`). Le même défaut vivait quatre fois dans `piece.controller.js` : corrigé le même jour (`ROLES_PERSONNEL`, PR #230).
Sans la migration, rien ne casse : tout va au stagiaire, choisir l'entreprise répond 503 « Migration 188 non jouée » au lieu
d'être ignoré, toutes les étapes comptent, et l'enregistrement du parcours dit combien de cases « Facultatif » n'ont pas tenu.
⚠️ **LA PRÉSENCE DES CLÉS NE PROUVE RIEN** : sans les colonnes, l'API rend `destinataire: "STAGIAIRE"` et `facultatif: false`.
**Elle se vérifie par l'API sur une VALEUR** : enregistrer un type de remise « L'entreprise » (503 sans elle), puis
`GET /api/remises` rend `destinataire: "ENTREPRISE"` ; ou cocher « Facultatif », enregistrer sans avertissement, puis
`GET /api/formations/:id/steps` rend `facultatif: true` sur l'étape. Ou une requête, qui doit rendre 2 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND ((table_name='remise_type' AND column_name='destinataire') OR (table_name='program_step' AND column_name='facultatif'));`
⚠️ Son revert remet tout au stagiaire (une remise déposée pour une entreprise passe dans l'espace du stagiaire, les accusés
donnés restent) et fait recompter toutes les étapes : un dossier à 100 % peut redescendre. Tests :
`remise-destinataire-facultatif.test.js`.

**186 est À JOUER, de préférence AVANT de déployer le code** (`186_audit_precisions.sql`, ce que désigne une ligne du
journal — demandé le 2026-09-28 : « Document signé ×2 » ne disait pas LESQUELS). La cloche (Alertes, Activité de l'équipe),
le journal d'audit et l'« Activité récente » du tableau de bord NOMMENT désormais ce que chaque ligne désigne — « Document
signé (Devis particulier, Convention de formation) » —, le stagiaire concerné, et mènent à SA fiche (ou SA session, selon
la rubrique), en relisant l'identifiant là où l'objet vit (`lib/precisionsActivite.js`, requêtes bornées à l'organisme, UUID
seulement). Cela marche SANS la migration, lignes d'avant comprises, TANT QUE L'OBJET EXISTE. La 186 ajoute à `audit_log`
`libelle` (le nom FIGÉ de l'objet) et `learner_id` (le stagiaire), écrits par les appelants qui SUPPRIMENT (document, réponse
QCM, entreprise, retrait d'une session) ou dont l'identifiant ne désigne pas le dossier (note d'évaluation, écrite sous
l'EXERCICE) : `logAudit`, cinquième argument `{ libelle, stagiaire }`. JAMAIS le nom d'une personne : il se relit dans la fiche,
un stagiaire effacé disparaît de la cloche. POURQUOI AVANT : déployé sans elle, rien ne casse (la trace est gardée sans ses
précisions, la console le dit une fois), mais les suppressions faites entre-temps resteront « Document supprimé », sans nom.
Regroupement : un seul axe par groupe (plusieurs documents d'UN stagiaire, ou UN document pour plusieurs) ; « ×N » seulement
quand les noms ne le disent pas. Trois libellés changent au journal : « Document généré en PDF / en Word », « Émargement
signé par un intervenant », « Présence rattrapée par l'école ». **Elle se vérifie par l'API, sans SQL** : supprimer un
document d'un stagiaire APRÈS l'avoir jouée, puis `GET /api/audit` — la ligne `document.delete` porte `objet` (le titre) et
`stagiaire`. Ou une requête, qui doit rendre 2 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='audit_log' AND column_name IN ('libelle','learner_id');`
⚠️ Son revert efface les noms figés : les suppressions redeviennent « Document supprimé ». Tests : `activite-precisions.test.js`.

**185 est JOUÉE — constaté le 2026-09-28 par l'API, sans SQL** : `PUT /api/documents/:id/saisies` sur un document sans zone
répond 422 « aucune zone à remplir », et non 503 « migration 185 non jouée » (le contrôle de la colonne passe AVANT celui des
zones, et rien ne s'écrit). Le même jour, l'attestation porte déjà « Date signature » après « Le : » ; ses cinq lignes de
pointillés attendent encore leurs zones.

**185** (`185_document_zones_a_remplir.sql`, les ZONES À REMPLIR par le stagiaire — demandées le 2026-09-28).
Une colonne sur `generated_document` : `saisies` (longtext, JSON CHIFFRÉ comme la signature). L'attestation sur l'honneur
d'expérience (`attestation-honneur`) porte des pointillés — entreprise, fonction, type d'activité, « du … au … » — que
l'école ne connaît pas : l'attestation se signait en blanc. Une ZONE est une puce `saisie:<texte|date>:<identifiant>`,
posée par le bloc « Zones à remplir » de l'éditeur (règles : `src/api/lib/zonesARemplir.js`, clé : `src/app/ui/lib/
zonesARemplir.js`, tenues d'accord par un test). **Décidé par l'école le même jour** : le stagiaire la remplit depuis son
espace, OU LE BUREAU POUR LUI (les trois rôles qui signent à sa place) ; TOUTES sont obligatoires — le bouton « Signer »
attend, et `signDocument` comme le lien public refusent (422) ; signé, le document les fige (409). Vide, une zone
s'imprime en POINTILLÉS, comme avant. Sans la migration, rien ne casse ni ne bloque : pointillés, signature comme avant,
l'écran le dit et l'enregistrement répond 503. **Elle se vérifie par l'API** : `GET /api/documents/:id` d'un document dont
le modèle porte une zone rend `zones_indisponibles: false`. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='generated_document' AND column_name='saisies';`
⚠️ Son revert efface les réponses des documents non signés (les signés gardent leur PDF scellé). **À FAIRE PAR L'ÉCOLE
ENSUITE** : dans Modèles → Attestation sur l'honneur, remplacer chaque ligne de pointillés par une zone (Texte, ou Date pour
« du » et « au »), et poser la puce « Date signature » après « Le : », qui imprime aujourd'hui un blanc.

**184, 183 ET L'OUTIL `harmoniser-modeles.js` : FAITS — constaté le 2026-09-26 par l'API, sans SQL.** 184 : les présences de
`GET /api/attendance/:sessionId` portent la clé `rattrapage_motif`. 183 : plus aucune puce `custom:Acomtpe` dans les 19
modèles. L'outil : les dix modèles sont en Arial de bout en bout, leurs pieds sont EXACTEMENT ceux qu'il écrit — leurs
corps ne portent plus son empreinte parce que chacun a été rouvert et enregistré dans l'éditeur ensuite (journal : dix
`template.save` entre 07 h 36 et 08 h 01), ce qui réécrit le HTML sans rien changer à la mise en forme. Relancer son
essai dirait donc « modifié depuis la relecture » pour les dix : c'est attendu. Leurs paragraphes ci-dessous gardent ce
qu'ils font et leurs reverts.

**184** (`184_emargement_rattrapage.sql`, le rattrapage d'une demi-journée
d'émargement par l'école — revue des feuilles d'émargement du 2026-09-26). Trois colonnes sur `attendance_record` :
`rattrapage_motif`, `rattrapage_par`, `rattrapage_le`. **Décidé par l'école le même jour : le stagiaire ne signe plus
que PENDANT la demi-journée**, de son heure de début (horaires de la formation ; 8h30 / 13h30 à défaut) jusqu'à minuit
(`fenetreSignature`, lib/emargement.js) — relevé sur les deux sessions du 14/09 : sept après-midi signés dès 8h40, et
quinze signatures sur cinquante faites le lendemain ; une signature ne se remplace plus. Une demi-journée manquée se
RATTRAPE par le personnel (Sessions → Émargement, « Rattraper »), avec un motif imprimé dans la case et le nom de qui
l'a enregistrée ; le stagiaire peut signer sur le poste de l'école, sinon la présence est attestée sans signature.
POURQUOI AVANT : la fenêtre, elle, est dans le code — déployé sans la 184, un oubli ne se rattrape pas (503) tant qu'elle
n'est pas jouée. Jouée avant, elle ne gêne pas l'ancien code (colonnes nulles, que personne ne lit). **Elle se vérifie
par l'API** : rattraper une demi-journée, puis `GET /api/attendance/:sessionId` — la présence porte `rattrapage_motif`.
Ou une requête, qui doit rendre 3 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='attendance_record' AND column_name IN ('rattrapage_motif','rattrapage_par','rattrapage_le');`
⚠️ Son revert efface motifs et auteurs ; une présence attestée sans signature redevient une case vide sur les feuilles
régénérées. Le reste de la revue est dans le code, sans migration : les demi-journées suivent les HORAIRES (« 17h00 -
19h00 » est un après-midi ; « Mettre à jour les feuilles » retire une demi-journée hors horaires si elle ne porte ni
signature ni intervenant) ; la feuille imprime le lieu de la SESSION, la déclaration d'activité, l'employeur, « Non
signé » dans une case vide d'un jour clos, un total d'heures, et se date de sa dernière signature ; la veille se clôt
chaque nuit (`cloreLaVeille`, server.js) ; `PATCH /attendance/record/:id` (présent sans signature ni motif) est retiré.
Tests : `emargement-feuille.test.js`.

**L'OUTIL `database/tools/harmoniser-modeles.js`** (la charte des documents, demandée le 2026-09-26 :
« comme le devis RS7404 retravaillé, fais tous les autres »). Il applique `lib/charteDocuments.js` à DIX modèles —
les trois devis, la convention, le contrat, le contrat d'hygiène, les CGV, l'invitation, le droit à l'image,
l'attestation d'hygiène : Arial, titres bleus, texte en 9 pt (CGV 8 pt), avertissements rouges gardés. Les six
modèles imposés (AGEFICE, certificat de réalisation, jury, factures) s'impriment déjà en Arial : non touchés.
Chaque modèle a été rendu avant/après et relu page à page ; l'outil porte l'EMPREINTE des versions relues et
n'écrit que celles-là (un modèle modifié depuis est ignoré, et nommé). Essai par défaut, sauvegarde avant
écriture, `UPDATE` gardé par le contenu lu, `--restaurer`. Fermer les onglets d'éditeur de modèles AVANT
`--appliquer` (cf. § 3). **Il se vérifie en relançant l'essai** : les dix lignes disent « déjà harmonisé ».
Seul changement de charpente : deux sauts de page retirés (CGV, contrat d'hygiène) et un posé (CGV), nommés
dans les profils. La 183 peut être jouée avant ou après : les deux états sont connus.

**183** (`183_jeton_acompte.sql`, migration de DONNÉES — l'acompte revient dans le devis, la
convention et le contrat). Relevé le 2026-09-26 par l'API : quatre modèles de production (`devis-particulier`,
`devis-professionnel-copie`, `convention`, `contrat`) portent une puce `{custom:Acomtpe}`, alors que le jeton
personnalisé s'appelle `Acompte` — sa clé avait été corrigée dans la fenêtre des jetons perso, et rien n'avait
suivi. Une puce qui ne désigne plus rien s'imprime VIDE, sans erreur : « votre règlement de  € », « un paiement
de  € ». La migration fait pointer ces puces (corps, en-tête, pied ; forme en texte comprise) vers `custom:Acompte`,
seulement dans un organisme qui a un jeton `Acompte` et plus de jeton `Acomtpe`. Le code l'empêche désormais (clé
figée, refus 409). Sans elle, rien ne casse de plus qu'aujourd'hui : l'éditeur montre la puce BARRÉE et la nomme
en tête du modèle. **Elle se vérifie dans l'éditeur** (Modèles → Convention : plus de bandeau « jeton qui n'existe
plus », la puce n'est plus barrée, l'aperçu imprime le montant), ou par une requête qui doit rendre 0 :
`SELECT COUNT(*) FROM document_template WHERE CONCAT_WS(' ', body_html, header_html, footer_html) LIKE '%custom:Acomtpe%';`
Son revert ne fait rien (`DO 0`), et l'explique : revenir, ce serait remettre un blanc dans le contrat. ⚠️ Les
documents déjà SIGNÉS gardent leur PDF figé, sans l'acompte ; les autres se rendent depuis le modèle.

**176, 178, 179, 180, 181 et 182 sont jouées — constaté le 2026-09-25 par l'API, sans SQL :** `GET /api/memos`
rend une liste (176) ; `GET /api/mailing/modeles` rend `disponible: true` et un texte `perso: true` (178) ;
`GET /api/mailing/regles` rend `disponible: true` (179) ; `GET /api/mailing/images` répond sans « Migration 180 non
jouée » (180) ; `GET /api/sessions/:id/intervenants` rend `horaires: true` (181) ; `GET /api/formations/arborescence`
rend `disponible: true` et `propose: false` (182). Leurs paragraphes ci-dessous gardent ce qu'elles font et leurs
reverts. ⚠️ **177 n'est PAS constatée** : les mémos lus portent la clé `liens`, mais elle existe aussi sans la table
(repli de `memo.controller.js`) — seule la requête `information_schema` de son paragraphe tranche, ou un mémo écrit
avec @.

**182** (`182_arborescence_commune.sql`, l'arborescence d'archivage UNE fois pour toutes les
formations — demandée le 2026-09-24). Deux colonnes sur `organization` : `archive_tree` et `company_archive_tree`
(longtext, NULL par défaut). L'arborescence se réglait formation par formation, à la main, et NE SERVAIT À RIEN :
l'export ZIP qu'elle devait ranger (« étape 2 » du 2026-07-10) n'avait jamais été écrit. Il existe désormais :
`GET /api/suivi/archives/zip` (?session= | ?dossier= | ?annee=&semaine=&formation=), sous la garde du coffre
(AUDIT_ROLES), appelé par trois boutons (session, fiche stagiaire, lignes du coffre). Un document qu'une formation
n'a pas est sauté ; un « OU » se lit dans ses membres D'AUJOURD'HUI. **Décidé par l'école le 2026-09-25 : ce que
l'arborescence ne range pas n'est PAS archivé** — l'aperçu le dit, `_sommaire.txt` le nomme —, sauf ce qu'elle ne
peut pas nommer (PDF importé, document hors parcours), qui garde sa place par défaut ; l'arborescence STAGIAIRE range
le dossier de chaque stagiaire (inscrit seul ou par une entreprise) et les documents de session, l'arborescence
ENTREPRISE des copies et les documents de groupe ; **les évaluations (QCM) ne s'archivent plus**, ni au coffre ni dans
l'archive : ce ne sont pas des documents (aucun PDF), leurs réponses vivent dans Résultats QCM. Règles :
`lib/arborescenceArchive.js` (serveur) et `lib/arborescence.js` (écran), tenues d'accord par un test.
⚠️ **AFFINÉ le 2026-10-06** : un QCM dont le RÉSULTAT a été IMPORTÉ (un `document_fichier` — le PDF d'un Google Form,
un scan) REVIENT dans le coffre et l'archive, comme les autres documents importés (`condQcm`, suivi.controller.js) : il a
un vrai PDF à montrer. Un QCM répondu DANS l'app (sans fichier) reste exclu. La corbeille du coffre, elle, protège toujours
le QCM (`quiz_id IS NULL` au DELETE) : son résultat se gère sur la fiche, pas depuis le coffre. **Même jour**, le coffre
gagne un « + » pour ajouter des fichiers au dossier d'une ENTREPRISE (ref `fichier-co:<id>`), comme le « + » du stagiaire
(migration aucune — `archive_document` existe déjà).
Sans la migration, rien ne casse : l'éditeur commun (Formations → Arborescence d'archivage) le dit et ne propose
pas d'enregistrer, et l'archive suit l'arborescence de chaque formation (053, 083), telle qu'elle est. Tant que
rien n'est enregistré, l'éditeur s'ouvre sur la PROPOSITION : les arborescences de RS7404, NIV1, NIV1H (et le
squelette de NIV2) fusionnées, conflits et retraits nommés — relire, puis ENREGISTRER. **Elle se vérifie par l'API,
sans SQL** : enregistrer l'arborescence commune, puis `GET /api/formations/arborescence` rend `disponible: true`
et `propose: false`. Ou une requête, qui doit rendre 2 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='organization' AND column_name IN ('archive_tree','company_archive_tree');`
⚠️ Son revert efface l'arborescence commune, et elle seule : l'archive se remet à suivre celle de chaque formation.
⚠️ L'ancien `PUT /formations/:id/archive-tree` est RETIRÉ (plus rien ne l'appelait) ; les colonnes des formations
restent, lues en repli.

**181** (`181_intervenant_horaires.sql`, les heures d'un intervenant externe,
demi-journée par demi-journée — demandé le 2026-09-23). Deux colonnes `time` sur
`session_intervenant_slot` : `heure_debut` et `heure_fin`. Une case cochée disait QU'il est venu,
jamais QUAND, et un intervenant externe ne suit pas les horaires des stagiaires (l'expert hygiène
passe de 10 h à 12 h 30) : la ligne « Horaires » en tête de feuille parle des stagiaires, et la case
de l'intervenant ne portait qu'une signature muette. La plage s'imprime désormais AU-DESSUS de sa
signature, dans la même écriture que cette ligne (`lib/plageHoraire.js`, seule règle de lecture et
de format, partagée par le contrôleur et la feuille). LES DEUX HEURES VONT ENSEMBLE : une plage à
moitié saisie, ou dont la fin n'est pas après le début, n'est pas enregistrée — la demi-journée,
elle, l'est toujours. Sans la migration, rien ne casse : l'écran n'affiche pas les champs d'heures
et le dit, l'enregistrement garde les demi-journées et répond « migration 181 non jouée », la
feuille sort comme avant. ⚠️ La requête des intervenants de la feuille vivait EN DOUBLE (archive et
aperçu) ; elle est désormais unique (`chargerIntervenants`) — n'ajouter les heures qu'à l'une aurait
donné un aperçu qui ne ressemble pas au PDF, ce qui ne se voit qu'une fois le document signé.
**Elle se vérifie par l'API, sans SQL** : saisir une heure sur une demi-journée, puis
`GET /api/sessions/:id/intervenants` — la ligne porte `debut` et `fin` remplis, et `horaires: true`.
Ou une requête, qui doit rendre 2 :
`SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='session_intervenant_slot' AND column_name IN ('heure_debut','heure_fin');`
⚠️ Son revert efface les heures saisies, et elles seules : affectations, demi-journées et signatures
restent. Les feuilles déjà générées en PDF gardent les heures qu'elles portaient.

**180** (`180_mail_images.sql`, les images des e-mails — à jouer APRÈS la 178). Une table
`mail_image` : nom, type MIME, octets. Le fichier part EN BASE, jamais sur le disque du serveur — même
modèle que `community_image` (114) et `learner_avatar` (094), pour qu'un déploiement ou une restauration
n'ait aucun dossier à recopier. Dans un message, l'image s'écrit `![légende](image:<id>)` ; elle voyage
avec le courrier EN PIÈCE JOINTE (`cid:`), jamais par une URL que le client mail irait chercher — il la
bloquerait, et une image distante trace qui ouvre. L'aperçu, lui, la porte en `data:` : son iframe est en
bac à sable, sans origine ni cookie. Sans la migration, le bouton « Image » répond 503, les marqueurs déjà
écrits s'effacent au rendu, et le reste du message part normalement. **Elle se vérifie par l'API** :
déposer une image dans Mailing → la bibliothèque la liste. Ou une requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='mail_image';`
⚠️ Son revert supprime la table : les messages déjà envoyés gardent leur image (elle est partie avec eux),
mais un texte programmé qui la citait la rendra vide.

**179** (`179_mails_programmes.sql`, les envois programmés : « 3 mois après la fin de la
session », demandé le 2026-09-23 — à jouer APRÈS la 178, dont elle prolonge l'écran). Deux tables.
`mail_regle` : un nom, un déclencheur (`fin_session`, `debut_session`, `inscription`), un sens
(avant/après), un nombre et une unité (jour/mois/année), un filtre de formation facultatif, l'objet et le
message. `mail_regle_envoi` : ce qui est déjà parti, une ligne par règle et par dossier — c'est cette clé
primaire (regle_id, enrollment_id) qui empêche le deuxième envoi, même si deux passages se chevauchaient.
UNE RÈGLE NE RATTRAPE JAMAIS LE PASSÉ : la colonne `depuis` porte la date de création, et le passage ne
regarde jamais une date cible antérieure. Sans ce garde-fou, une règle « trois mois après la fin » créée un
matin écrirait d'un coup à trois ans d'anciens stagiaires. LE CALCUL DE DATE VIT DANS `lib/mailsProgrammes.js`,
pas dans une requête : les mois s'y comptent en mois (le 31 janvier plus un mois est le 28 février), et il
s'éprouve sans base. Le passage (`lib/passageMailsProgrammes.js`) tourne toutes les 30 minutes depuis
`server.js` et rattrape les jours manqués — un serveur arrêté une nuit ne perd aucun envoi.
Sans elle, rien ne casse : l'onglet « Envois programmés » dit « pas encore disponible » et le passage
s'arrête sans rien écrire. **Elle se vérifie par l'API, sans SQL** : créer une règle, puis `GET
/api/mailing/regles` rend la liste (et non `disponible: false`). Ou une requête, qui doit rendre 2 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name IN ('mail_regle','mail_regle_envoi');`
⚠️ Son revert SUPPRIME les deux tables — dont la MÉMOIRE de ce qui est parti : une règle recréée ensuite
réécrirait à des stagiaires déjà touchés (bornée toutefois par le nouveau `depuis`).

**178** (`178_mails_personnalises.sql`, les e-mails de l'école écrits par l'école, demandé le
2026-09-23). Deux tables. `mail_modele` : le texte d'un e-mail AUTOMATIQUE quand l'école l'a réécrit — une
ligne par type (credentials, reset, forgot, security, notifications), avec l'objet, le titre et deux zones
de prose. Rien n'y est créé d'avance : sans ligne, c'est le texte livré avec l'application qui sert, et
c'est le cas normal ; « revenir au texte d'origine » SUPPRIME la ligne. `mail_envoi` : la trace d'un envoi
à un groupe (objet, corps, cible, nombre d'envoyés et d'échecs, identifiants des destinataires), au même
titre que le journal des transmissions aux partenaires.
CE QUI EST MODIFIABLE, ET CE QUI NE L'EST PAS : la prose, jamais la charpente. L'encadré des identifiants,
le bouton, et les deux phrases « Si c'est bien vous » / « Si ce n'est PAS vous » d'une alerte de sécurité
restent dans le code — une école qui réécrirait tout pourrait envoyer une alerte sans son garde-fou. Le
texte saisi est du TEXTE : il est échappé au rendu (`lib/mailsPersonnalises.js`), les liens écrits en clair
deviennent cliquables, et un jeton inconnu est REFUSÉ à l'enregistrement plutôt qu'imprimé en accolades
chez un stagiaire.
Sans elle, rien ne casse : les e-mails gardent leur texte d'origine, l'écran des textes dit « pas encore
disponible » et l'envoi à un groupe répond 503. ⚠️ Le cache des textes (`lib/orgContext.js`) est rechargé à
CHAQUE enregistrement en plus du sondage des dix minutes : sans ce rappel, l'école attendrait dix minutes
pour voir sa propre correction partir. **Elle se vérifie par l'API, sans SQL** : réécrire un e-mail dans
Paramètres → Mailing → Textes, puis `GET /api/mailing/modeles` — la ligne porte `perso: true`. Ou une
requête, qui doit rendre 2 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name IN ('mail_modele','mail_envoi');`
⚠️ Son revert SUPPRIME les deux tables : les textes réécrits reviennent à ceux d'origine sans prévenir, et
l'historique des envois disparaît.

**176** (`176_memos.sql`, les mémos du personnel : un pense-bête et une liste de choses à
faire, demandés le 2026-09-22). Une table `memo` — auteur, texte, échéance facultative, partage,
`fait_le`/`fait_par`. Un mémo est PRIVÉ ; son auteur peut le partager, et alors tout le personnel le
voit et peut le cocher, mais lui seul le supprime ou le reprend (le privé d'un autre répond 404, jamais
403 : un 403 dirait qu'il existe). Le bouton de la barre du haut, à côté de la cloche, compte les mémos
ÉCHUS ou dus AUJOURD'HUI — pas les lignes de la liste, un compteur qui ne descend jamais cesse d'être
lu — et la même liste s'affiche sur le tableau de bord. AUCUNE TRACE AU JOURNAL D'AUDIT, exprès : il
alimente l'« Activité récente » que tout le bureau lit, et les pense-bêtes privés y défileraient.
Sans la migration, rien ne casse : la liste et la carte disent « pas encore disponibles (migration 176
non jouée) », le compteur reste vide et l'écriture répond 503. **Elle se vérifie par l'API, sans SQL** :
écrire un mémo depuis le bouton, puis `GET /api/memos` rend une liste (et non `data: null`). Ou une
requête, qui doit rendre 1 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='memo';`
⚠️ Son revert SUPPRIME la table : tous les mémos, privés et partagés, faits ou non.

**177 — À CONSTATER** (`177_memo_liens.sql`, ce qu'un mémo DÉSIGNE : les liens écrits avec @ et #, demandés
le 2026-09-22 après la 176 — à jouer APRÈS elle, la table s'y accroche par une clé étrangère). `@` trouve
QUI (stagiaire, entreprise, membre de l'équipe), `#` trouve QUOI (session, partenaire, facture) : la liste
vit dans `lib/memos.js`, des DEUX côtés, tenue par un test. Le texte du mémo reste ce qu'on a tapé — les
liens vivent dans `memo_lien`, en puces sous la phrase, ce qui évite d'analyser de la prose à chaque
affichage. `cible_id` n'a PAS de clé étrangère (elle vise six tables) : d'où `libelle`, le nom figé au
moment du choix, qui reste lisible si la fiche disparaît. MENTIONNER UN COLLÈGUE est le seul lien qui fait
plus que lier : le mémo lui devient visible même non partagé, il peut le cocher (pas le supprimer ni le
partager), et une SECONDE pastille — bleue, à gauche de celle des échéances — compte sur son bouton ce
qu'il n'a pas encore ouvert. Elle s'éteint à l'écran dès l'ouverture, et le serveur n'est prévenu qu'à la
FERMETURE : marqué à l'ouverture, « Nouveau pour vous » disparaissait de la liste au moment même où elle
s'affichait. Chacun ne se voit proposer que les rubriques qu'il peut ouvrir (`nav_access`), et jamais
lui-même. Sans la migration, les mémos marchent sans liens, et un mémo à liens n'est pas créé à moitié
(503, et le mémo est retiré). **Elle se vérifie par l'API, sans SQL** : écrire un mémo en choisissant
quelqu'un derrière @, puis `GET /api/memos` — la ligne porte `liens: [...]`. Ou une requête, qui doit
rendre 1 :
`SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='memo_lien';`
⚠️ Son revert efface tous les liens et toutes les mentions. Les mémos, eux, gardent leur texte.


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

**187 : ABANDONNÉE, à reverter si elle a été jouée** (`187_revert_moyens_paiement.sql`, un `DROP TABLE IF EXISTS
moyen_paiement`). La PR #228 (moyens de paiement en une liste dans Paramètres → Facturation, modèle pré-sélectionné à la
caisse) a été fusionnée et déployée le 2026-09-28 alors que la demande portait sur /factures ; la PR suivante la retire en
entier. Son fichier aller est supprimé, seul le revert subsiste. Sans risque à ne pas jouer si la 187 ne l'a jamais été.

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

- **Facture de formation NARRATIVE** (2026-09-30, modèle `facture-formation`, doc_type FACTURE) :
  une facture n'exposait que l'acheteur, l'organisme, les lignes et les totaux — les jetons de
  FORMATION, les DATES et l'ACOMPTE sortaient vides (`invoiceCtx` posait `formations: []`). Désormais,
  quand une facture désigne un DOSSIER (par `invoice.enrollment_id` ou la 1ʳᵉ `invoice_line`),
  `loadInvoiceData` charge sa formation/session (`data.formation`) et `invoiceCtx` en remplit les
  Champs documents (`field:training_program.*`, `field:training_session.*`) ET `formations[0]` — d'où
  {Formation}, {Heures}, {Jour1}, {endDate}, {Acompte}, {Reste à payer}. Le prix de référence de
  `formations[0]` est le **total HT de la facture** (`v.base`), pas le tarif catalogue : {Prix},
  {Coût horaire} et {Reste à payer} comptent dessus. « Pour le compte de » nomme le STAGIAIRE du
  dossier même quand l'acheteur est l'entreprise (`learner` forcé). Additif : une facture SANS dossier
  (boutique, nom libre) ne change pas. Trois jetons ajoutés au catalogue : **{Coût horaire}** (montant
  ÷ heures, arrondi au centime) et **{Début/Fin en toutes lettres}** (« lundi 18 mai 2026 »,
  `frDateLong`, découpe la chaîne pour ne pas décaler d'un fuseau). Aucune migration : {Acompte} lit
  `enrollment.acompte` (déjà écrit par la carte Règlement, cf. § 4, 194). Le PDF se vérifie sur
  l'instance déployée (LibreOffice), les jetons par `facture-formation-tokens.test.js`.
- **Facture de formation d'ENTREPRISE (plusieurs stagiaires)** (2026-09-30, modèle
  `facture-formation-entreprise`) : une facture d'entreprise porte une ligne par stagiaire.
  `loadInvoiceData` charge désormais TOUS les dossiers de la facture (par `enrollment_id` ou ses
  `invoice_line`) et en tire l'ACOMPTE TOTAL (somme des acomptes des dossiers → {Acompte}/{Reste à
  payer} comptent sur la somme, pas sur le premier) et la LISTE des stagiaires
  (`data.groupStagiaires`). `invoiceCtx` expose `groupStagiaires`, d'où **le bloc {#Stagiaires}** et
  {Nombre stagiaires} FONCTIONNENT désormais sur une facture (avant : réservés aux documents
  entreprise). La formation reste celle du PREMIER dossier (même session pour tous). Le cas mono-
  dossier (facture-formation) est inchangé : somme d'un seul acompte, liste d'un seul stagiaire.

- **Jetons personnalisés : un CALCUL ENTRE JETONS** (2026-09-30). Le modificateur `|` savait déjà
  opérer sur un nombre EN DUR (`{Prix|/3}`, `{Prix|-450}`, `{Prix|*20%}`) ; il accepte désormais un
  AUTRE JETON comme opérande — **`{Prix|/{Heures}}`** (coût horaire), **`{Prix|-{Acompte}}`** (reste).
  `injecterOperandes` (customtokens.js + la copie conforme jetonsPerso.js) ramène `{Base|op {Opérande}}`
  à la forme à opérande littérale que le calcul existant résout, en lisant le NOMBRE de l'opérande ;
  un opérande sans nombre retombe sur la valeur de base (un reste sans acompte = le prix). Aucune
  migration, aucune donnée : le modèle d'un jeton perso est déjà du texte libre. Tests :
  `jetons-perso-calcul.test.js` (valeurs + aperçu/serveur à l'identique).

- **Un devis qui couvre PLUSIEURS formations (NIV1 + NIV2) — NATIVEMENT** (2026-10-03, demandé par
  l'école pour l'entreprise Gervais Christelle). Deux manques se cumulaient : (1) les jetons
  `field:training_program.*` / `field:training_session.*` (dont le devis professionnel est fait :
  intitulé, objectifs, prérequis, prix, déroulé…) se chargeaient depuis `document_formation … LIMIT 1`
  — la SEULE première inscription (`document.controller`, `loadContext`), donc NIV1 seul ; (2) {Semaine}
  et les dates ne lisaient que `formations[0]`. **Corrigé sans bloc à écrire** : `loadContext` agrège
  désormais TOUTES les inscriptions du document (`enrIdsDoc = formations.map(f => f.__eid)`,
  `agregerChamps`, lib/agregationChamps.js) — montants et durées SOMMÉS (prix, acompte, heures, jours),
  textes longs en BLOCS par formation (objectifs…), le reste joint « et » ; **seules les tables
  training_program / training_session / enrollment s'agrègent** (le stagiaire, l'entreprise et
  l'organisme ne changent pas d'une inscription à l'autre → première valeur, comme avant). Côté jetons
  nommés (`resolveTokens`) : {Formation} joint « et » (`joindreFr`), {Semaine} devient « Semaines 6 et
  12 — 2026 », et un jeton {Périodes} apparie les dates (« du 18/05 au 22/05/2026 et du 01/06 au
  03/06/2026 ») — à poser à la place de « du {Jour1} au {endDate} », qui restent, eux, une période
  globale (premier début, dernière fin). **Une SEULE formation : tout est inchangé** (somme d'un, pas de
  bloc, « Semaine 6 — 2026 »). Aucune migration. Tests : `multi-formation-natif.test.js`.
- **UN devis d'entreprise qui réunit plusieurs formations en UN document** (2026-10-03, décidé avec
  l'école — AskUserQuestion « fusionner l'étape Devis »). Les documents de GROUPE (company_level) sont
  rattachés à UNE session : la fiche entreprise appelait `createCompanyDocument` une fois par formation
  cochée → un devis PAR formation (le vrai « ça ne marche pas » de Gervais Christelle, que l'agrégation
  native ne pouvait pas corriger — chaque document ne tenait qu'une session). Désormais
  `createCompanyDocument` accepte une **liste** de sessions (`session_ids` ; `session_id` seul reste
  accepté pour l'import d'un signé et les anciens appels), réunit leurs inscriptions (un document par
  OPCO) et les lie TOUTES par `document_formation`. **C'est ce lien, et non plus `session_id`, qui
  détecte l'étape** : `getCompanyParcours` (branche `company_level`) cherche les documents de groupe par
  inscription liée (`df.enrollment_id IN` les inscriptions du groupe de la session), si bien qu'UN devis
  fusionné coche l'étape « Devis » de CHAQUE formation couverte. `listCompanyDocuments` rend
  `session_ids` (les sessions des inscriptions liées) ; l'écran (`documentsDeLEtape`,
  `documentsEntrepriseHorsParcours`, lib/documentsDossier.js) rattache un document à CHAQUE session
  couverte. Le PDF agrège les formations via loadContext/agregationChamps (ci-dessus). L'ancrage
  `session_id` = 1re session du groupe (archive, listing). Nettoyage et reprise d'un OPCO signé : par
  session OU par inscription liée. Aucune migration. Tests : `devis-groupe-multi-session.test.js`.
- **Complément — le bloc {#Formations}…{/Formations}** (même jour, pour un devis en TABLEAU itemisé) :
  `formationRowTokens(f,i)` (tokens.js) + `expandListBlocks(out, 'Formations', ctx.formations, …)`
  (htmlfill.js) répètent une ligne par formation ({Formation}/{Prix}/{Heures}…), le prix de ligne étant
  `enroll_price || price` (la base de `totalPrice`, somme au centime). `findMissingTokens` ignore les
  jetons DANS le bloc (`stripGroupBlocks` étendu à {#Formations}). Éditeur : groupe Formation, bouton
  « Bloc « par formation » » (`BLOC_FORMATIONS`) + palette `FORMATION_ROW_TOKENS`. Tests :
  `formations-bloc.test.js`.
- **Un document ÉMIS NE BOUGE PLUS — ses données sont FIGÉES à l'émission** (2026-10-04, « URGENT ») :
  cf. §4, migration 201. En deux temps. (1) La « Date du jour » ({Date}/{Today}) se résolvait par `new Date()`
  à chaque rendu — un devis des archives se redatait du jour. Elle est désormais figée à `sent_at` (à défaut
  `signed_at`), via `ctx.figeLe` que `loadContext` pose et que `resolveTokens` lit (sinon `new Date()`) — SANS
  migration, vrai même pour les documents déjà émis. (2) Avec la 201, `loadContext` CRISTALLISE le reste des
  données (stagiaire, entreprise, formations, `fields`, financeur, date) dans `generated_document.jetons_figes`
  à la première lecture après l'émission, puis les sert. Point d'étranglement UNIQUE (`loadContext`) : aucun
  point d'envoi à toucher. **Restent vivants** : l'organisme (émetteur/logo), les signatures et le cachet, les
  zones (`saisies`), les consentements (figés à la signature), les jetons perso, les résultats examen/jury.
  Les documents de concern de l'école (devis, convention, contrat, CGV, attestation, droit image) n'ont ni
  examen ni jury : ils sont donc intégralement figés. Tests : `jeton-date-figee.test.js`, `jetons-figes.test.js`.
- **L'ATTESTATION DE SIGNATURE (dossier de preuve)** (2026-10-04) : `GET /api/documents/:id/preuve` rend un PDF
  qui met noir sur blanc le FAISCEAU DE PREUVES d'un document signé — par signataire : nom, compte, date/heure,
  **adresse IP**, **appareil** (user-agent), et l'**empreinte SHA-256** du contenu. Ces traces étaient déjà
  consignées à chaque signature (`generated_document.signer_ip`/`signer_user_agent`/`signed_hash`/`signed_at`,
  `document_signature` pour les cadres, `org_signed_at` pour le contreseing) mais dormaient en base. **AUCUNE
  migration** : on ne fait que lire et mettre en forme. Trois sources réunies sans doublon par
  `collecterSignataires` ; mise en forme pure et testable dans `lib/attestationSignature.js` (styles en ligne,
  bordures par l'attribut `border`, couleurs littérales — rendu LibreOffice, cf. §3) ; PDF scellé par le cachet
  de l'organisme (son intégrité est donc protégée aussi). Pièce SÉPARÉE du document signé (fusionner casserait
  sa signature). Même garde que le téléchargement (personnel, stagiaire propriétaire, signataire attribué).
  Bouton « Attestation de signature (preuve) » sur un document SIGNÉ (DocumentViewModal). C'est le niveau A du
  renforcement de preuve ; restent possibles l'horodatage RFC 3161 (PAdES-T, appel TSA externe) et le certificat
  qualifié (QES, prestataire payant). Signature auto-signée = avancée, non qualifiée (« Source de confiance :
  Aucun » attendu dans un validateur eIDAS). Tests : `attestation-signature.test.js`.
- **HORODATAGE RFC 3161 des signatures — PAdES-T** (2026-10-04, niveau B) : l'« heure déclarée de dépôt » d'une
  signature était l'horloge DU SERVEUR, invérifiable. Chaque VRAIE signature (stagiaire, représentant,
  contreseing de l'organisme — `timestamp: true` sur `signPdf`) est désormais horodatée par une autorité (TSA) :
  on n'envoie que l'EMPREINTE SHA-256 de la valeur de signature, jamais le document. `lib/horodatage.js` construit
  la requête RFC 3161, appelle la TSA, lit le jeton À L'OCTET PRÈS (sa signature interne ne tolère pas un octet
  de plus — garde de ré-encodage) et l'ajoute en ATTRIBUT NON SIGNÉ du CMS (`id-aa-timeStampToken`) : il S'AJOUTE
  à la signature sans jamais l'invalider. Le cachet « à la volée » d'un téléchargement (`sealPdf`, fréquent) n'est
  PAS horodaté — seules les signatures stockées le sont (`SignerP12Horodate` étend le signataire de @signpdf). La
  place réservée dans le PDF passe à 32 Ko quand on horodate (le jeton + la chaîne TSA pèsent ~5 Ko ; vérifié en
  vrai contre DigiCert et freetsa.org). **TOLÉRANT** : TSA injoignable/lente/de travers → on garde la signature
  NON horodatée (PAdES-B) plutôt que de bloquer une signature — un horodatage ne doit jamais empêcher de signer.
  **Configurable par l'ENV** : `TSA_URL` (défaut `http://timestamp.digicert.com` ; **vide = coupé** ; pointer une
  TSA QUALIFIÉE pour un horodatage qualifié eIDAS), `TSA_TIMEOUT_MS` (défaut 10 s). Aucune migration. Reste C
  (certificat qualifié QES, prestataire payant) pour retirer « Source de confiance : Aucun ». Tests :
  `horodatage.test.js` (mécanique ASN.1 + replis, sans réseau).

**Reste ouvert / idées non faites** : donner un préfixe de numéro distinct à chaque entité émettrice
(sinon collision de numéros) ; la 2ᵉ entité « Boutique » a encore `legal_name = "d"` ; ajouter des
`desc` explicites aux autres groupes de jetons.

---

## 6. Méthode de travail attendue

1. **Lire le code avant de proposer** — ce projet a beaucoup de contraintes non devinables.
2. **Poser une question** quand le besoin est ambigu (l'utilisateur tranche vite et bien).
3. **Vérifier dans le navigateur** (l'app tourne en local) — pas seulement « ça compile ».
4. **Tester** (`npm test`), puis **committer** en français, avec le *pourquoi* dans le corps.
5. Commentaires de code : expliquer **pourquoi**, surtout quand c'est contre-intuitif (les
   contournements LibreOffice/ProseMirror sont documentés à leur emplacement — les garder à jour).

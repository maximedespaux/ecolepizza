# Chantiers Impasto — état des lieux et reprise

> Document de reprise rédigé le 2026-07-28. Il consigne ce qui a été fait, **comment travailler
> sur ce projet sans casser** (leçons payées cher), et tout ce qui reste, classé par valeur.
> Les constats viennent de deux audits complets (espace stagiaire, espace admin) + du travail
> de la journée. Chaque ligne porte son chemin `fichier:ligne`.

---

## 1. Le projet en dix lignes

**Impasto** — application de gestion de l'École Pizza (Jean-Jacques Despaux, Lannemezan).
Deux mondes dans une même application :

- **Espace stagiaire** — ludique, façon Duolingo. Police ronde Fredoka, coins doux, retour
  tactile, cadres de progression. Tout est porté par la classe `.stu-app` (`StudentLayout`).
- **Espace admin / secrétariat** — sobre, façon Apple. Blancs, hiérarchie nette. 30 pages.

**Stack** : React 19 + Vite (`src/app`, front sur `:5173`) · Node/Express (`src/api`, `:3000`) ·
MariaDB distante. CSS unique et manuel : `src/app/ui/styles/app.css` (~2 400 lignes).
Charte : navy `#2c3371`, tomate `#dc3e37`, orange `#ff6900`, or `#fcb900`.

**Contraintes permanentes** : ne jamais lire les `.env` · catalogue Metro en lecture seule,
aucun achat · manuels de l'école confidentiels (lecture seule, pour calibrer des valeurs) ·
toute migration en prod demande l'accord explicite de Maxime.

---

## 2. Méthode — à lire avant de toucher au code

### 2.1 Le build qui passe ne prouve RIEN

`esbuild` ne détecte pas les **références non définies**. Une variable supprimée mais encore
utilisée compile parfaitement et plante à l'exécution. Deux pages ont été livrées cassées le
2026-07-28 pour cette raison : profil inaccessible (`grade` supprimé mais encore lu) et
`/empatements` en modification (composant inséré dans le mauvais scope).

**Le projet n'a AUCUNE configuration ESLint.** Recette qui marche, à rejouer après toute
suppression de variable ou refactor :

```bash
# config temporaire, HORS dépôt
cat > /tmp/eslint.check.mjs <<'JS'
export default [{
  files: ["**/*.{js,jsx}"],
  languageOptions: { ecmaVersion: 2022, sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
    globals: { window:"readonly", document:"readonly", localStorage:"readonly",
      sessionStorage:"readonly", navigator:"readonly", fetch:"readonly", console:"readonly",
      setTimeout:"readonly", clearTimeout:"readonly", setInterval:"readonly",
      clearInterval:"readonly", requestAnimationFrame:"readonly", performance:"readonly",
      URL:"readonly", URLSearchParams:"readonly", Blob:"readonly", CustomEvent:"readonly",
      Event:"readonly", matchMedia:"readonly", getComputedStyle:"readonly", location:"readonly",
      crypto:"readonly", process:"readonly", module:"writable", require:"readonly" } },
  rules: { "no-undef": "error" },
}];
JS
cd src/app && npx eslint --config /tmp/eslint.check.mjs ui
cd ../api && npx eslint --config /tmp/eslint.check.mjs controllers routes lib middlewares
```

Ce balayage a révélé, en plus des deux régressions, **deux bugs préexistants** (corrigés) :
`telechargerFacture` hors portée dans `Ventes.jsx` et `SIG_W`/`SIG_H` non importés dans
`api/lib/htmlfill.js`.

### 2.2 Vérifier au navigateur, pas seulement au build

Les pages stagiaire sont derrière authentification et il n'existe **pas de compte de démo**.
Méthode utilisée : créer une page de prévisualisation temporaire `ui/pages/_StuPreview.jsx`
avec des données factices + une route `/__stu` marquée `TEMP-PREVIEW`, capturer, **puis
retirer les deux**. Toujours vérifier après coup qu'il ne reste aucune trace :
`grep -rn "__stu\|TEMP-PREVIEW" src/app/ui/`.

Deux pièges de mesure rencontrés :
- Lire un état React **juste après** un `.click()` renvoie la valeur d'AVANT (mise à jour
  asynchrone) → vérifier dans un appel séparé.
- Un toast auto-effacé (2,6 s) disparaît **entre deux appels d'outil** → lui passer
  `duration={60000}` le temps du test.

### 2.3 Pièges CSS déjà payés

- **Ne poser AUCUNE règle de position/z-index sur les enfants de `.stu-app`.** `> *` écrase le
  `position:fixed` des modales ; viser `> .stu-head` écrase le `sticky`/`z-index:30` de
  l'en-tête, qui repasse alors sous le voile du tiroir (`.stu-scrim`, z-index 29,
  `backdrop-filter:blur`) → menu flou **et** clics interceptés. Le halo est en
  `::before{position:fixed;z-index:-1}` et le fond reste au `body`.
- **Une classe qui reçoit un anneau `::before` DOIT avoir `position:relative` et des
  dimensions**, sinon l'anneau s'accroche au premier ancêtre positionné et dessine une ellipse
  géante sur toute la page (`.pf-cadre-ex`, corrigé).
- Une couleur passée en **style inline** écrase toute classe → décider la couleur côté JSX.
- En thème sombre, une couleur de programme foncée disparaît → dériver via
  `color-mix(… 62%, #fff)`.

---

## 3. Ce qui a été fait (2026-07-28)

**Retiré** : suite Maîtrise sanitaire (HACCP) — code supprimé, tables `hs_*` **encore en base**
(elles contenaient des données de test ; commande de suppression donnée à Maxime, non exécutée).
XP et cœurs de Pizza Quest et du profil.

**Ajouté** :
- Couche `.stu-app` (Fredoka, coins 22px, fond chaud, retour tactile, `stuPop`) — principe :
  **redéfinir les tokens**, pas réécrire les composants.
- `components/SaveToast.jsx` — les 3 assistants enregistraient EN SILENCE. Prop = **compteur**,
  pas booléen (sinon deux enregistrements de suite ne rejouent pas l'animation).
- `components/WGauge.jsx` — bande des familles d'usage + seuil biga/poolish (W 320).
- `lib/cadres.js` + `components/AvatarCadre.jsx` — 6 cadres de parcours (formations terminées)
  + 3 exclusifs (Champion / Jury / Fondateur). Sélecteur dans le profil, affichage dans la
  Communauté (cartes + fiche profil + détail).
- `components/StuJourney.jsx` — barre de parcours + carte « prochaine étape ».
- `lib/errors.js` — bus d'erreurs global, **écrit mais PAS branché** (cf. §4).
- Photo `public/brand/atelier.jpg` (labo + four Marana Forni), récupérée du site avec accord.

**Corrigé** : `window.prompt` silencieux dans les 3 assistants · `flourTemp || 17` qui écrasait
un 0 °C légitime (helper `tempFarine`, testé sur 7 cas) · `bp.name` → `bp.label`
(`garnitures.js:162`) · onglet interne « À valider » exposé aux stagiaires (`Notions.jsx`) ·
bloc de débogage « Effacer ma progression » visible par tous (`PizzaQuest.jsx`) ·
**2 failles de contrôle d'accès** (cf. §5.1).

**Dosage validé par Maxime** : UNE seule photo de hero (accueil). Les emojis ⭐/❤️/🤍 de Pizza
Quest sont **volontaires** — c'est un jeu. La règle « pas d'emoji comme icône » vaut partout
ailleurs.

---

## 3 bis. Passe UI/UX de l'espace stagiaire (2026-07-28, soir)

Onze commits sur `max`, arbre propre. Ce qui a changé, et pourquoi :

- **Communauté en PUBLICATIONS** (`f4a16e2`) — l'auteur et son cadre passent en tête de carte,
  à 38 px ; même en-tête dans la modale de détail. Cadres aussi sur les pastilles de
  commentateurs et sur l'avatar de la barre (`AvatarCadre` enfin branché). Modale profil :
  halo tiré de la couleur de l'avatar, compteurs animés.
- **Cadres animés** — Braise a des FLAMMES (couronne floutée qui tourne à 3,1 s pendant que
  la luminosité vacille à 1,7 s : c'est le décalage qui empêche l'œil de voir la boucle),
  Maestro des ÉTINCELLES à CONTRE-SENS de son anneau. Découpés au masque et non glissés en
  `z-index:-1` — un enfant en z-index négatif passe sous le fond de son parent, donc sous
  l'avatar.
- **Pizza Quest** (`d42edae`, `5f533c6`, `f2a5fb0`) — jauge de progression sur chaque touche,
  largeur fixe (les rangées incomplètes étiraient la dernière carte du double), trait vertical
  entre paliers, relief « pâte à modeler », **difficulté en trois étoiles** à la place des
  emojis-ingrédients, QCM avec la même matière que les touches.
- **Deux mécaniques fantômes retirées** : les ❤️ du QCM (`setHearts` n'était plus appelé —
  trois vies figées) et le « +90 XP » du Constructeur. Toutes deux promettaient une monnaie
  supprimée le matin même.
- **Modales** (`8672022`, `6e493ce`) — la couche `.stu-app` leur est rendue (les portails
  sortaient de StudentLayout et revenaient en registre administration, IntroGuide compris),
  et `lib/useEchap.js` ferme avec Échap, une modale à la fois.
- **§4.1 fait** (`c6b5df2`) — cf. ci-dessous.

**Reste sur l'espace stagiaire** : Boutique, Notions, Mercuriale, les 3 assistants et
StudentFormationDetail n'ont pas encore eu leur passe. Les points §4.3 (contrastes `--dim`,
cibles tactiles, `role="dialog"`, hiérarchie de titres) et §4.4 (métier) restent ouverts.

---

## 3 ter. Cadres, espace d'échange, admin (2026-07-28, suite)

**Deux migrations JOUÉES sur la base de production**, avec l'accord de Maxime :

- **113 — `learner.cadre` + `learner.cadres_exclusifs`.** Le choix de cadre est désormais
  PUBLIC (les autres stagiaires le voient) et les trois cadres exclusifs sont attribuables
  depuis la fiche stagiaire (`StagiaireDetail`, via la liste blanche `LEARNER_FIELDS`, donc
  réservé aux administrateurs et journalisé). Le code fonctionne dans les deux états : les
  nouvelles colonnes sont demandées par des requêtes SÉPARÉES, sans quoi une base sans 113
  aurait perdu avatars et compteurs avec les cadres.
- **114 — `community_post` / `community_answer` / `community_image`.** Table à part de
  `recipe` : une question n'a ni ingrédient, ni rendement, ni coût, et l'ENUM
  `recipe.kind` aurait imposé une garde « sauf si c'est une question » à chaque calcul.

**✅ L'espace d'échange est complet** (API + front, `54e6a4d`) : fil UNIQUE fiches + questions,
filtre « Entraide », réponses, « ça m'a aidé » (l'auteur seul, et réversible), photo réduite
côté navigateur (`lib/image.js` — le serveur ne traite aucune image). Cycle API vérifié sur la
base réelle. ⚠️ **Le rendu n'a jamais été vu à l'écran** : la session du navigateur était
passée en administration et `/communaute` est une route stagiaire. À regarder en priorité.

**Corrections de fond livrées dans la foulée :**
- **Empâtements : une fiche pouvait afficher 140 % de farine** (`4b47460`). Le plafond de
  substitution de 60 % n'était appliqué qu'à la farine de base ; les lignes affichaient les
  pourcentages bruts, poids compris. `subsPlafonnees()` met à l'échelle en gardant les
  rapports (70/30 → 42/18). Vérifié sur cinq cas.
- **Hiérarchie de titres** (`129ca25`) — `Card` codait un `<h3>` en dur, donc `h1 → h3` sans
  `h2` sur chaque page. Niveau paramétrable, `h2` par défaut.
- **Contrastes `--dim`** sur `.field-opt`, `.ate-lbl`, `.stu-next-lbl` · **cible tactile**
  `.cart-qty .iconbtn` passée de 30 à 40 px.
- **Plus aucun `window.alert`** (`ea8c99a`). Les gardes `confirm`/`prompt` devant les
  suppressions de masse sont conservées : une garde doit interrompre.

**Admin — étapes 1 à 3 du plan §5.5 faites.**
- **§5.2, les bugs** (`400486d`) : `EmptyState` qui jetait `title`/`text` (7 appels muets),
  `.tablewrap` en `overflow:hidden` qui coupait 147 px de colonnes sur `/factures` à 800 px,
  `StatusMessage` qui affichait « Chargement… » en vert, icône `€` inexistante dans `Opcos`.
- **§5.5 étape 3 — lecture seule** (`5d0e06c`) : `blockMutations` ignorait `iconbtn del`, la
  convention de bouton destructeur de **19 pages**. Le serveur protégeait (pas de faille),
  mais l'écran annonçait « lecture seule » et laissait cliquer. Les contrôles bloqués sont
  désormais visiblement éteints, avec une échappatoire déclarée `[data-lecture-ok]`.
  ⚠️ La liste de sélecteurs est **dupliquée entre `AppLayout.jsx` et `app.css`** — les deux
  doivent bouger ensemble, chacune porte l'avertissement.
- **§5.5 étape 2 — chargement/vide/erreur** (`2886789`) : `components/Squelette.jsx`
  (`Squelette`, `SqueletteTable`, `ListeEtat`). Posé sur les deux pages qui restaient
  **blanches** (`StagiaireDetail`, `SessionDetail`). En-têtes de tableau collants, survol de
  ligne avec filet à gauche.

- **§5.5 étape 4 — `<DataTable>`** (`287da55`) : tableau au large, **cartes sous 700 px**. La
  bascule est une **requête de conteneur** et non une media query — le même tableau peut vivre
  pleine page ou dans une colonne étroite, c'est sa place réelle qui doit décider. Deux
  marqueurs de colonne ne servent qu'en mode carte : `principal` (devient le titre, perd son
  intitulé) et `actions` (passe en pied). Le `<thead>` est masqué en `clip-path` et non en
  `display:none`, pour rester lu par un lecteur d'écran.

**✅ CONVERSION FAITE — 15 tableaux sur 17.** `Opcos` · `Partenaires` · `Entreprises` ·
`Equipe` · `Formations` (glisser-déposer préservé) · `Factures` · `Comptabilite` (ligne de
totaux) · `Dashboard` · `Platform` · `Quiz` · `AccessRoles` ×2 · `StagiaireDetail` ·
`Modeles` ×2. Tous deviennent des cartes sous 700 px de conteneur.

**✅ `Modeles` converti aussi.** Ses trois colonnes calculées par des fonctions immédiates sont
devenues des fonctions NOMMÉES hors du rendu (`cellSignature`, `cellEtat`, `estEmarg`) — c'est
ce qui rendait la conversion risquée, et accessoirement le tableau illisible.

**✅ `Ventes` converti — il ne reste AUCUN tableau non converti.** Ses lignes se déplient sur
leurs articles : `DataTable` a reçu `detail`, qui renvoie le contenu à montrer sous la ligne
ou `null` quand elle est repliée. **C'est la page qui tient cet état**, jamais le tableau —
elle seule sait quoi ouvrir. Une `<tr>` sœur (une cellule ne peut pas contenir une rangée),
recollée sous sa carte en mode étroit par une marge négative.

**Ce que le mode carte a appris en chemin** — trois marqueurs de colonne, tous nés d'un défaut
constaté à l'écran et invisible dans le code :
- `principal` → devient le titre (et la ligne passe en `flex` pour le hisser en tête, sans
  toucher à l'ordre du tableau : Formations range le code avant l'intitulé, ce qui est juste
  en colonnes et se lit à l'envers en carte).
- `actions` → passe en pied.
- `sansCarte` → disparaît (un chevron « ouvrir » n'apprend rien au pied d'une carte qu'on
  ouvre en entier).
- Et une cellule qui renvoie `null` **efface sa ligne** en carte : « VILLE — » sur trois lignes
  n'apprend rien. Mesuré sur Entreprises : 350 px → 135 px par carte.

⚠️ **Un titre de carte doit TOUJOURS nommer.** Factures affichait « — · 6 dossiers » quand le
client est inconnu : en colonnes le tiret se lit très bien (la colonne d'à côté porte le
numéro), en carte il devient le titre. Repli sur le numéro.

**Corrigé pendant les conversions** : le bouton « Envoyer » d'un QCM non envoyable n'était
qu'atténué à 45 % d'opacité, donc **cliquable** — il partait et l'erreur arrivait après. Et la
ligne cliquable d'`Entreprises` ne répondait qu'à la souris.

**RESTE par ailleurs :**
1. **Passer les ~29 pages de `useState([])` à `useState(null)`.** Tant qu'elles sont à `[]`,
   elles annoncent « Aucun résultat » pendant tout le chargement. `DataTable` affiche déjà le
   squelette pour `null` — il ne manque que l'initialisation.
   `grep -lE "useState\(\[\]\)" ui/pages/*.jsx`.
2. `pages/FicheRecette.jsx` (1028 lignes, routé nulle part) et les routes serveur des cœurs
   (`lireCoeurs`, `/quest/hearts`), survivantes du retrait de la mécanique.

Un lanceur de migration existe (le client `mysql` n'est pas installé sur la machine) :
`node <scratchpad>/migrer.js database/migrations/NNN.sql` — il réutilise
`src/api/config/database.js`, qui charge le `.env` lui-même.

---

## 4. Chantiers — ESPACE STAGIAIRE (par valeur/effort décroissant)

### 4.1 ✅ Trois corrections courtes — FAIT le 2026-07-28 (commit c6b5df2)

1. ✅ **La classe `.hint` n'existait pas dans le CSS.** Comptée à l'exécution : **303 usages
   dans 53 fichiers**. Règle posée à `app.css:79`, volontairement sans marge (la plupart des
   appels posent la leur).

2. ✅ **`Field.jsx` ne générait ni `id` ni `htmlFor`** — `useId()` dans `Field` ET
   `SelectField`, un `id` passé explicitement l'emporte. **Reste à faire** : reporter sur les
   `className="field"` ad hoc (`ProfileModal`, `Boutique`, les 3 assistants), qui n'utilisent
   pas le composant. ⚠️ `Field` n'est employée QUE côté administration : non vérifiable depuis
   une session stagiaire, relue et passée au lint seulement.

3. ✅ **Cartes de formation et `ConstructorGame` au clavier** — `role`/`tabIndex`/`onKeyDown`
   (Entrée et Espace, avec `preventDefault` sinon la page défile en même temps). Dans le
   mini-jeu, une case n'est focalisable que si elle a quelque chose à faire.
   Corrigé au passage : les dix cartes portaient le **même nom accessible**, et ce nom se
   décidait sur `locked` au lieu de `openable` — une formation terminée sans inscription
   rattachée annonçait « voir mes documents » puis ouvrait « Formation non suivie ».

### 4.2 Branché à moitié / à finir

4. **Brancher le bus d'erreurs** (`lib/errors.js` est écrit). Il reste : publier depuis
   `apiClient.request()` sur chaque échec, créer `components/ErrorBar.jsx`, le monter dans
   `main.jsx`. ⚠️ `login()` doit passer `handled: true` — la page de connexion affiche déjà son
   propre message, un bandeau en plus ferait doublon au pire moment.
   → couvre d'un coup les **~40 `catch` silencieux** recensés (Boutique ×4, Communauté ×10,
   les 3 assistants ×5 chacun, PizzaQuest ×8, `MonEspace.jsx:75`).

5. **Fuite de la couche `.stu-app` sur les portails React.** `IntroGuide.jsx:54-108` et les
   2 modales de `Communaute.jsx` font `createPortal(…, document.body)` → sortent de `.stu-app`
   et perdent Fredoka, les coins 22px et le retour tactile. Or `IntroGuide` est **le tout
   premier écran vu par un nouveau stagiaire**.

6. **Cadres : le choix n'existe que dans SON navigateur.** ✅ Corrigé le 2026-07-28 (commit
   774b219) pour l'utilisateur courant : `useCadreChoisi` porte le choix en état React et la
   Communauté l'applique **en direct** (avant, `CADRE_EVENT` était émis mais personne ne
   l'écoutait, et la Communauté lisait de toute façon le cadre de parcours).
   **Reste à faire** : persister le choix côté serveur pour que les AUTRES le voient. Le canal
   existe déjà tout tracé — l'avatar fait exactement cela (`learner.avatar`,
   `PUT /api/mon-espace/avatar`, relu par `getMyProfile` et `authorProfile`). Il faut une
   colonne `learner.cadre` → **migration, donc accord explicite de Maxime**.
   Séparément : `attribues = []` en dur dans `ProfileModal`, les 3 cadres exclusifs
   s'affichent donc tous verrouillés → même colonne + écran d'attribution côté admin.

6 bis. **`components/AvatarCadre.jsx` n'est appelé nulle part.** Écrit le 2026-07-28 pour
   porter le cadre partout, jamais branché. Conséquence visible : l'avatar de l'en-tête
   (`StudentLayout.jsx:218`) ne porte pas son cadre, alors que le profil promet en toutes
   lettres « Il entoure ton avatar **partout**, y compris dans la Communauté ».

### 4.3 Accessibilité et finition

7. **`--dim` comme couleur de texte : ~2,6:1 en clair, ~3,8:1 en sombre** — sous le seuil AA de
   4,5:1. Concerne `.ate-lbl`, `.stu-next-lbl`, `.pq-tier-label`, `.field-opt`, `.stu-sub`.
   Le calcul est **déjà documenté dans le code** (`app.css:1389`) pour un cas analogue résolu
   avec `--muted` : il suffit de généraliser.

8. **34 modales, zéro `role="dialog"`/`aria-modal`, aucune fermeture par Échap.** Concerne
   signer un document, répondre à un QCM, éditer son profil.

9. **Cibles tactiles sous 40 px** : `.cart-qty .iconbtn` (30 px, `app.css:1416`) et
   `.comm-face` (21 px avec chevauchement, `app.css:1920`). Le raisonnement est **déjà écrit**
   juste à côté pour `.shop-add` (44 px, `app.css:1403-1406`).

10. **`title` sur bouton désactivé = invisible** au doigt et pour un lecteur d'écran.
    Concerne toutes les explications de verrouillage : `LockedBtn`, `DrawerLink` verrouillé,
    `FormationCard` (`MonEspace.jsx:243`), `FCard` (`PizzaQuest.jsx:442`).

11. **Hiérarchie de titres cassée partout** : `Card.jsx:7` code un `<h3>` en dur → toute page
    enchaîne `h1` → `h3` sans `h2`. → prop `level`/`as`.

12. **États vides incohérents** : les 3 assistants affichent du texte brut
    (`PateWizard.jsx:530`, `GarnitureWizard.jsx:156`, `RealisationWizard.jsx:154`) alors que
    tout le reste utilise `<EmptyState>`. Et partout, les listes démarrent à `[]` au lieu de
    `null` → **flash de l'état vide** avant la réponse serveur.

13. **Navigation par onglets en bas sur mobile** (idée non validée par Maxime, à lui soumettre).
    Sous 900 px, la nav passe par un tiroir : deux taps pour atteindre un outil. Une barre
    d'onglets fixe en bas (Accueil · Quest · Outils · Boutique · Communauté) ramènerait à un
    seul tap — c'est le patron de toutes les applications d'apprentissage. Le tiroir resterait
    pour le débordement (profil, entreprise, déconnexion).
14. `Mercuriale.jsx:161` — `window.prompt` subsistant (le même anti-pattern retiré ailleurs).
15. Menu « Outils » sans `aria-expanded`/`aria-haspopup` ni fermeture Échap
    (`StudentLayout.jsx:66-76`).
16. **`EmargementStagiaire.jsx` est une page orpheline** : route `/emargement` existante, aucun
    lien n'y mène, et elle fait doublon avec la section émargement de
    `StudentFormationDetail.jsx` — **sans** la logique de verrouillage `emargement_gate`.
    → supprimer ou relier, mais choisir.

### 4.4 Métier / pédagogie

16. **Cumul des farines de substitution non plafonné** (`dough.js:114-127,199-207`) :
    Tipo 1 à 50 % + Tipo 2 à 50 % → la fiche affiche **140 %** de farine. Le plafond de 60 %
    n'est appliqué qu'au calcul de la farine de base, pas aux lignes affichées.
17. **Wizard Réalisation : perte des étapes 1-2.** Le bouton « Créer un empâtement » fait un
    `nav()` complet (`RealisationWizard.jsx:117,201-202`) → l'état local est perdu.
    → modale, ou état en session.
18. **`margin_pct` sans borne** (`RealisationWizard.jsx:28,257`, défaut 300) : une marge
    négative passe sans un mot, alors que Notions enseigne une cible de 25-30 % de coût matière.
19. **`1.68` magique non sourcé** dans le coût des fiches « legacy » (`Communaute.jsx:220`) —
    calcul parallèle, désynchronisé de `computeBuild`.
20. **Emojis comme icônes dans `garnitures.js`** (bases, produits, laitiers, services, fours) →
    se propagent dans GarnitureWizard, RealisationWizard et Communauté. Le modèle SVG existe
    déjà : `CatGlyph` dans `Boutique.jsx:69-77`.
21. **Horaires de retrait figés en dur** (`Boutique.jsx:506`) alors que `CreneauCalendrier`
    les tient de l'API — doublon de source de vérité.
22. **Atelier « produit cuisiné » annoncé mais inexistant** (`GarnitureWizard.jsx:227`) : les
    modes « Cuisinée maison » ne font que demander un libellé + un prix, aucun rendement.

### 4.5 Demandes de Maxime non commencées

23. **Curation du catalogue Metro pour les garnitures.** Ne garder que ce qui sert en
    pizzeria : produits bruts ou prêts à l'emploi. **Exclure** cure-dents, pâtes à croûte, etc.
    **Garder** les cartons à pizza — seul non-comestible utile. → inspecter d'abord les familles
    réelles du catalogue (`catalog_product.family`) avant d'écrire les règles de tri.

24. **Espace d'échange dans la Communauté** (Maxime : « je sais pas quoi faire »).
    Proposition faite, **en attente de son arbitrage** :
    - Un **fil unique**, trois natures : 🍕 Fiche (existant) · ❓ **Question** (nouveau, avec
      réponse marquable « ça m'a aidé ») · 📣 Annonce (école, épinglée).
    - Pas de forum à catégories : ~30 stagiaires actifs → cinq salles vides.
    - **Photo** sur les publications — aujourd'hui on partage des chiffres, jamais le résultat,
      alors que c'est un métier manuel.
    - Format « post » : avatar + cadre + nom **en haut** de la carte (aujourd'hui le titre
      d'abord). Une réponse d'un Maestro ne se lit pas comme celle d'un Bronze.
    - Priorité : la **question** d'abord (transforme une bibliothèque en lieu d'entraide et
      construit une base de connaissance), la photo ensuite, les annonces en dernier.
    - À NE PAS faire : messages privés (charge de modération), likes sur commentaires
      (hiérarchise les gens, pas les réponses).
    - **Deux questions en suspens** : fiches et questions dans le même fil ou deux onglets ?
      Stockage d'images côté serveur ou texte seul pour commencer ?
    - Demande une migration : `kind` sur les publications, table de réponses, champ image.

---

## 5. Chantiers — ESPACE ADMIN

### 5.1 Sécurité — 2 failles corrigées, 2 restantes

**✅ Corrigé le 2026-07-28** (`api/middlewares/sectionAccess.middleware.js`) :
- `SECTION_BY_BASE` ignorait `companies`, `opcos`, `quest`, `boutique` → un secrétariat passé
  en **Lecture** sur ces rubriques **pouvait quand même écrire** via l'API.
- `/produit-divers` appelle `DELETE /comptabilite/revenus/:id` : le contrôle concluait
  « rubrique Comptabilité » et refusait au formateur sur **sa propre page**. Helper
  `sectionFor(base, reste)` ajouté.

**⚠️ Restant :**
- **`/roles` est délégable à n'importe qui** : `GRANTABLE_NAV` (`nav.js:179-181`) ne filtre que
  `/equipe`. Et `Guard` (`main.jsx:73-83`) **ignore sa prop `roles`** pour les non-propriétaires.
  L'API protège bien (`accessProfile.routes.js:7`) — donc pas de fuite de données, mais une page
  qui s'ouvre pour ne renvoyer que des 403. Le garde-fou manquant deviendrait une vraie
  escalade sur une page moins bien protégée.
- **`invoice.routes.js:9`** monte `STAFF_ROLES` sur le routeur entier, écriture comprise → un
  formateur peut créer/modifier/supprimer des factures. Toutes les routes voisines
  (`company`, `partner`, `session`, `sale`, `inventory`, `carte`) restreignent l'écriture à
  `ADMIN_ROLES`. `nav.js:45` classe pourtant `/factures` en ADMIN seul.
- `/parametres` et `/notifications` (`main.jsx:211-212`) sont montées **sans `<Guard>`** —
  impact réel faible, mais exception non documentée dans une convention systématique.

### 5.2 Bugs UI concrets

- **`EmptyState` ignore silencieusement `title=`/`text=`** — le composant n'accepte que
  `icon` et `children` (`components/EmptyState.jsx:7-14`). **6 appels** passent des props
  perdues → l'utilisateur ne voit **qu'une icône, sans aucun texte** :
  `DemandesBoutique.jsx:219`, `QuestManager.jsx:383` et `:481`, + 3 dans `Boutique.jsx`.
- **`Opcos.jsx:40`** : `<EmptyState icon="€">` — le jeu d'icônes ne connaît que `"euro"`.
- **`.tablewrap` est en `overflow:hidden`** (`app.css:226`), pas `overflow-x:auto`. Utilisé par
  la quasi-totalité des pages à tableau → sur écran étroit les colonnes sont **coupées et
  invisibles**, sans indication. Perte d'information silencieuse, pas un simple débordement.
- **`EntrepriseDetail.jsx:242`** : `StatusMessage` reçoit `{type:"info"}` — or le composant ne
  connaît que `"error"` et « le reste » → le message « Chargement… » s'affiche **en vert, comme
  une confirmation de succès**.
- `Notifications.jsx:25,29` — « Tout marquer comme lu » ne fait rien en cas d'échec, sans un mot.

### 5.3 Structure et cohérence

- **Seules 4 pages sur 30 ont un vrai état de chargement** (`Dashboard`, `Pipeline`,
  `Comptabilite`, `ProduitDivers`). Deux affichent une page blanche (`StagiaireDetail:183`,
  `SessionDetail:113`). `Formations.jsx` n'a **ni état vide ni chargement**. La majorité
  initialise à `[]` → faux état vide avant réponse.
  → bon modèle à généraliser : `DemandesBoutique.jsx:183,218` (`null` = chargement, `[]` = vide).
- **Deux conventions de bouton destructeur** : `iconbtn del` (12 pages) vs `btn ghost danger`
  (7 pages). Ce n'est pas qu'esthétique : `AppLayout.jsx:14` n'intercepte en lecture seule que
  `.btn.primary, .btn.danger, .danger, [type=submit]` → **le mode lecture seule protège ou non
  selon la classe CSS choisie par la page**.
- Bouton de fermeture de modale : `×` littéral vs `<Icon name="x">` — partage ~50/50 sur toute
  l'application. Aucun composant `Modal` partagé n'existe, chaque écran recopie
  `.overlay`/`.mhead`/`.mfoot`.
- `window.alert()` dans `DemandesBoutique.jsx:78,196-197` et `Quiz.jsx:94` — seul point de
  contact avec le navigateur brut, contraire à la charte sobre.
- Limites d'upload incohérentes : 1 Mo (`Reglages:98`), 1,5 Mo (`EmargementEditor:65`),
  2 Mo (`Quiz:247`) — aucune constante partagée.
- **`title` partout, `aria-label` presque nulle part** sur les boutons icône :
  `EntrepriseDetail` 13/0, `QuestManager` 14/0, `StagiaireDetail` 11/0, `Suivi` 12/0,
  `Factures` 10/0, `Quiz` 10/0. Et couverture incomplète **dans une même page**
  (`Stagiaires.jsx:226` sans, lignes 227-246 avec).

### 5.4 Code mort

- **`pages/FicheRecette.jsx` — 1028 lignes, le plus gros fichier de page du projet, routé
  nulle part.** Remplacé par les 3 assistants. → supprimer ou documenter comme legacy.
- `resetQuestProgress` subsiste dans `apiClient.js:506` + sa route serveur, plus appelé.
- Aucun `TODO`/`FIXME`/`console.log` dans `pages/*.jsx` — à mettre au crédit du projet.

### 5.5 Plan de refonte admin proposé (5 étapes)

1. **Corriger les bugs ci-dessus** — quelques heures, aucun risque visuel, meilleur rapport
   valeur/effort de tout l'audit.
2. **Unifier chargement / vide / erreur** — un hook + un rendu unique, imposé aux ~20 pages qui
   n'ont rien. Le changement le plus visible, chaque page, chaque jour.
3. **Faire correspondre lecture seule front et back** — remplacer l'interception par sélecteur
   CSS fragile par une désactivation explicite basée sur `navMode`, et une seule classe de
   bouton destructeur.
4. **Composant `<DataTable>` unique** avec `overflow-x:auto` (ou bascule en cartes sous 700 px).
   Le plus gros chantier visuel — après la fiabilisation.
5. **Polish transverse** : `aria-label` systématique, modale de confirmation maison à la place
   de `window.alert/confirm/prompt`, fermeture de modale unifiée, limites d'upload partagées.

---

## 6. En attente d'une décision de Maxime

- **Tables `hs_*`** (maîtrise sanitaire) toujours en base, orphelines. Commande de suppression
  fournie, non exécutée — elles contenaient un relevé qu'il avait saisi.
- **Colonne `learner.cadre`** — pour que le cadre choisi soit visible des autres stagiaires
  (§4.2 point 6). Petite migration, sur le modèle exact de `learner.avatar`.
- **Espace d'échange** : les deux questions du §4.24.
- **Cadres exclusifs** : qui les attribue, et via quel écran ?
- **Photos** : ~40 images disponibles sur ecole-pizza.com (autorisation donnée). Une seule
  utilisée. `moyens-techniques3-min-2.jpg` et `fond-aliments*.jpg` non exploitées.

---

## 7. Dépendances npm — état de `npm audit` (2026-07-29)

**API (`src/api`) : 0 vulnérabilité.**

**Front (`src/app`) : 2 alertes « high » restantes, volontairement non corrigées.**

`react-router` 7.12 → 8.2 est signalé par [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
(« RSC Mode CSRF Bypass »). **On reste en 7.18 sciemment**, pour trois raisons :

1. L'avis dit lui-même : *« This only affects your application if you are using the unstable RSC
   APIs. »* Impasto est une SPA Vite — `BrowserRouter`, `Routes`, `Link`, `useNavigate`,
   `useParams`, `Outlet`. Aucun RSC, aucun `loader`/`action`, aucun rendu serveur. **La faille
   n'est pas atteignable ici.**
2. Il n'existe **aucun correctif en 7.x** : la seule version corrigée est `react-router@8.3.0`.
3. `react-router-dom` **n'existe plus en 8.x** (fusionné dans `react-router`). Corriger imposerait
   donc de réécrire les imports de **34 fichiers** + de monter le plancher de `react` à `^19.2.7`,
   pour zéro gain de sécurité réel.

→ `npm audit` affichera donc 2 « high » tant qu'on ne migre pas en v8. **C'est attendu.** À
revoir le jour où l'on migrera react-router pour d'autres raisons (et pas avant).

**Ce qui a été corrigé** : la chaîne `eslint` 9 → 10 (`@eslint/js`, `eslint-plugin-react-hooks`
5 → 7, `eslint-plugin-react-refresh` 0.4 → 0.5), qui traînait un `brace-expansion` 1.1.16
vulnérable (DoS) via `minimatch@3` — 5 alertes supprimées. Aucun impact runtime : ce sont des
`devDependencies`, jamais embarquées dans le bundle. À noter d'ailleurs qu'**il n'y a pas de
fichier `eslint.config.js`** dans le projet : le script `npm run lint` ne peut pas s'exécuter en
l'état (cf. CLAUDE.md § 2.4, « pas d'ESLint dans le projet »).

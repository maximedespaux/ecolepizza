// Notions & lexique — contenu repris du Manuel Technique Niveau I « Pizza classique » (École Pizza,
// éd. 2026) : farine, levure, eau, sel, huile, unités de calcul, protocoles, adjonctions,
// substitutions, allergènes. + un volet GESTION (notions de gestion de carte/rentabilité).
// Les valeurs chiffrées sont celles du manuel — elles alimentent aussi le calculateur (dough.js).

// --- Volet TECHNIQUE (manuel) ---------------------------------------------------------------
export const FICHES = [
  {
    key: "farine", title: "La farine", icon: "wheat", color: "#fcb900",
    intro: "Tout part du grain : sa mouture donne le type, sa protéine donne la force.",
    sections: [
      { t: "Le grain (caryopse)", schema: "caryopse", ul: [
        "Le son : l'enveloppe, riche en fibres et en minéraux — c'est lui qui donne les cendres.",
        "L'amande (endosperme) : la réserve d'amidon et de protéines → la farine blanche.",
        "Le germe : l'embryon, riche en matières grasses (retiré car il rancit).",
      ] },
      { t: "Blé tendre ≠ blé dur", p: "Le blé tendre a un albumen farineux et se broie en particules fines → panification (pain, pizza). Le blé dur, à grain très dur et vitreux, donne de grosses particules (semoule) → pâtes." },
      { t: "Le gluten", p: "Formé au pétrissage par l'hydratation de deux protéines : la gliadine (extensibilité) et la gluténine (ténacité). En se liant, elles tissent la « maille glutinique » qui retient le gaz de la fermentation." },
      { t: "Taux de cendres → le type", p: "On brûle 100 g de matière sèche : ce qui reste (les minéraux, surtout contenus dans le son) donne le taux de cendres. Plus il est élevé, plus la farine est complète. Il existe 6 types en France et 5 en Italie." },
      { t: "La force W", p: "Le W (« work », force boulangère) mesure le travail nécessaire pour déformer le pâton jusqu'à éclatement. Il ne figure pas sur les sacs : il est mesuré en laboratoire à l'alvéographe de Chopin.", table: {
        head: ["Force W", "Usage"],
        rows: [["W 120–150", "Biscuits et crackers"], ["W 200–250", "Empâtements directs à levage court"], ["W 250–310", "Pizzas napolitaines"], ["W 330–390", "Directs à levage long et indirects"], ["W 400–430", "Farines de force (Manitoba) — renforcent une farine faible"]],
      } },
      { t: "Lire un alvéogramme", table: {
        head: ["Symbole", "Signification"],
        rows: [
          ["P — Pression", "Ténacité, fermeté de la pâte, résistance à la déformation"],
          ["L — Largeur", "Extensibilité : élasticité et allongement au façonnage"],
          ["G — Gonflement", "Quantité d'air insufflée jusqu'à éclatement"],
          ["W — Work", "Le travail total = la force boulangère"],
          ["P/L", "L'équilibre (ou le déséquilibre) entre ténacité et extensibilité"],
        ],
      } },
    ],
  },
  {
    key: "levure", title: "La levure", icon: "yeast", color: "#ff6900",
    intro: "Un champignon vivant : il mange le sucre et rend du gaz.",
    sections: [
      { t: "Qu'est-ce que c'est ?", p: "Un micro-organisme (champignon) : la variété Saccharomyces cerevisiae (levure de bière ou de boulanger). Elle transforme les sucres de la farine en dioxyde de carbone et en alcool — c'est la fermentation alcoolique. Le CO₂ fait lever, la maille glutinique le retient." },
      { t: "4 types utilisés en pizzeria", ul: [
        "Le levain (naturel)",
        "La levure fraîche (boulangère)",
        "La levure sèche active — à réhydrater dans une eau à 38 °C, sans jamais dépasser 50 °C (elle meurt)",
        "La levure sèche instantanée",
      ] },
      { t: "Doses maximales par kg de farine", table: {
        head: ["Température de la farine", "Fraîche", "Sèche active", "Sèche instantanée"],
        rows: [["10 → 16 °C", "4 g", "4 g", "2 g"], ["16,1 → 21 °C", "3,5 g", "3,5 g", "1,75 g"], ["21,1 → 26 °C", "3 g", "3 g", "1,5 g"], ["26,1 → 31 °C", "2,5 g", "2,5 g", "1,25 g"], ["31,1 → 36 °C", "2 g", "2 g", "1 g"]],
      }, note: "Plus la farine est chaude, moins on met de levure. La levure fraîche agit au mieux sur une pâte entre 21 et 27 °C." },
      { t: "L'incorporer", ul: [
        "Émiettée dans la farine en début de pétrissage, ou délayée dans l'eau de coulage si elle est modérée.",
        "Eau froide → action ralentie.",
        "Eau tiède (> 40 °C) → levure affaiblie.",
        "Eau chaude (> 50 °C) → levure détruite.",
      ] },
    ],
  },
  {
    key: "eau", title: "L'eau", icon: "droplet", color: "#3aa0e0",
    intro: "L'eau de coulage : elle hydrate, dissout, et déclenche tout.",
    sections: [
      { t: "Son rôle", ul: [
        "Hydrater la farine.",
        "Dissoudre le sel et la levure.",
        "Permettre au gluten de se former en réseau (maille glutinique).",
        "Rendre possible la fermentation et les actions enzymatiques.",
      ] },
      { t: "Critères", p: "Elle doit être potable (critères de l'OMS). Organiques : incolore, limpide, inodore, sans goût. Chimiques : chargée en sels de calcium ou de magnésium, on la dit « calcaire » ou « séléniteuse »." },
      { t: "La dureté (en degré français °f)", schema: "eau", table: {
        head: ["Titre hydrotimétrique", "Dureté"],
        rows: [["0 → 7 °f", "Eau très douce"], ["7 → 15 °f", "Eau douce"], ["15 → 30 °f", "Eau plutôt dure — idéale pour la pâte"], ["30 → 40 °f", "Eau dure"], ["+ de 40 °f", "Eau très dure"]],
      }, note: "Eau trop douce → pâte collante et bulles à la cuisson : on peut rajouter un peu de sel. Eau trop dure → pâte dure et peu levée : il faut un adoucisseur. (°f ≠ °F Fahrenheit)" },
      { t: "Température de l'eau de coulage — la base 50", p: "Formule de l'école : on prend la température de la farine, on la multiplie par 2, et on retire le résultat de la base 50.", note: "TB 50 − (température farine × 2) = température de l'eau de coulage. Ex. farine à 17 °C → 17 × 2 = 34 → 50 − 34 = 16 °C d'eau. Objectif : une pâte à 22-25 °C en fin de pétrissage." },
    ],
  },
  {
    key: "sel", title: "Le sel", icon: "package", color: "#7fa8c9",
    intro: "17 à 22 g par kilo de farine — il fait bien plus que saler.",
    sections: [
      { t: "D'où il vient", p: "Le sel gemme est extrait des mines et carrières (dépôts géologiques) ; le sel marin est recueilli par évaporation de l'eau de mer dans les marais salants." },
      { t: "Ce qu'il fait dans la pâte", ul: [
        "Renforce la maille glutinique : la gliadine devient moins soluble, on forme plus de gluten, aux fibres plus courtes et mieux liées.",
        "Améliore les qualités plastiques : ténacité, élasticité, maniabilité.",
        "Freine et régularise la fermentation (il brûle aussi les cellules de levure : moins de CO₂).",
        "Antiseptique : il brûle les micro-organismes responsables des moisissures.",
        "Fixe l'eau et améliore la rétention gazeuse.",
        "Hygroscopique : il densifie la pâte — on peut donc l'hydrater davantage sans la rendre collante.",
        "Donne la coloration et le croustillant de la croûte, et la saveur.",
        "Antioxydant : la pâte reste blanche ; il améliore la conservation et retarde la dessiccation.",
      ] },
      { t: "Dose usuelle", note: "17 g à 22 g par kilo de farine (soit ≈ 2 % de la farine)." },
    ],
  },
  {
    key: "huile", title: "L'huile d'olive", icon: "droplet", color: "#7bb661",
    intro: "Le 5ᵉ élément — utile, mais pas indispensable.",
    sections: [
      { t: "Son rôle", ul: [
        "Lubrifie la pâte : un peu de souplesse et d'élasticité.",
        "Fige le pâton pendant sa maturation en chambre froide et l'empêche de s'affaisser.",
        "Surtout sur l'empâtement direct, pour garder des pâtons bien ronds sur 1 à 5 jours de maturation.",
      ] },
      { t: "La napolitaine n'en contient pas", p: "La « Pizza Napolitaine », reconnue au Patrimoine mondial de l'UNESCO, ne contient pas d'huile d'olive : sa pâte est faite pour être utilisée très rapidement, sans longue maturation." },
      { t: "Les qualités (acidité)", table: {
        head: ["Huile", "Acidité", "Défauts organoleptiques"],
        rows: [["Extra vierge", "< 0,8 %", "Aucun défaut, fruité présent"], ["Vierge", "≤ 2 %", "Peu de défauts (3,5/10), fruité présent"], ["1er prix", "> 3,3 %", "Défauts marqués (6/10)"]],
      }, note: "Échelle des défauts : 0 = aucun défaut, 10 = très défectueuse." },
    ],
  },
  {
    key: "unites", title: "Les unités de calcul", icon: "calculator", color: "#e0ac48",
    intro: "Tout se raisonne pour 1 kg de farine.",
    sections: [
      { t: "L'unité de calcul", p: "1 unité de calcul = 1 kg de farine. Tous les autres ingrédients (eau, sel, huile, levure) s'expriment en pourcentage de ce kilo — c'est le « pourcentage boulanger ». C'est ce qui permet de passer de 1 à 10 unités sans refaire les calculs." },
      { t: "Le repère", note: "1 unité de calcul (1 kg de farine) → environ 6 pâtons de 280 g. 10 unités → environ 60 pâtons de 280 g." },
    ],
  },
  {
    key: "protocole", title: "Le protocole (direct)", icon: "refresh", color: "#dc3e37",
    intro: "L'ordre et les temps ne s'inventent pas.",
    sections: [
      { t: "Le pétrissage, phase par phase", ul: [
        "1ʳᵉ phase — Farine + levure, laisser tourner 1 mn (temps d'oxygénation).",
        "2ᵉ phase — Verser l'eau d'un coup (en gardant toujours un verre d'eau pour le bassinage). Pétrir 12 mn en petite vitesse.",
        "3ᵉ phase — Verser le sel petit à petit ; au bout d'1 mn, verser l'huile d'olive. Pétrir encore 2 à 3 mn.",
        "Prendre la température et vérifier la texture : homogène, souple, sans dépasser les degrés imposés.",
      ] },
      { t: "Pointage", p: "Le temps de repos en masse après le pétrissage. Déposer la pâte sur le marbre en un gros pâton en faisant un rabat, couvrir d'un film plastique.", table: {
        head: ["Saison", "Temps de pointage"],
        rows: [["Été chaud et humide", "10 à 15 mn"], ["Printemps / automne", "15 à 30 mn"], ["Hiver", "20 à 40 mn"]],
      } },
      { t: "Détente & division", p: "Laisser une détente de 5 mn. Étaler la masse en rectangle d'environ 10 cm d'épaisseur. Diviser, peser, bouler, déposer en bacs (60 × 40) puis bloquer à 3-4 °C." },
    ],
  },
  {
    key: "adjonctions", title: "Les adjonctions", icon: "plus", color: "#b9822f",
    intro: "Ajouter un produit à la pâte — au bon moment.",
    sections: [
      { t: "Définition", p: "L'adjonction, c'est le rajout d'un autre produit mélangé à la pâte pendant le pétrissage. Elle se calcule toujours sur le poids de la farine." },
      { t: "Pourcentages et moment", table: {
        head: ["Adjonction", "%", "À quel moment ?"],
        rows: [["Graines torréfiées", "3 à 6 %", "Avant le sel (10ᵉ mn) — complément en eau de bassinage"], ["Pâte fermentée", "10 à 30 %", "À la 8ᵉ minute"], ["Naturkraft (levain déshydraté)", "4 %", "Avec la farine"], ["Son", "1 %", "Après l'huile (12ᵉ mn)"], ["Charbon végétal", "1 à 2 %", "Avec la farine"]],
      }, note: "Autres adjonctions possibles : levain naturel." },
    ],
  },
  {
    key: "substitutions", title: "Les substitutions", icon: "wheat", color: "#e0ac48",
    intro: "Remplacer une part du blé — et compenser en eau.",
    sections: [
      { t: "Définition", p: "La substitution, c'est le remplacement d'une partie du poids de la farine de blé initiale par une ou plusieurs autres farines (complète, semi-complète, soja, châtaigne, seigle, orge, mix…), en respectant le poids initial." },
      { t: "Le poids d'eau pour 1 kg de farine(s)", table: {
        head: ["Force W", "Hydratation mini", "+ Soja / semi-complète 10 %", "+ Farine complète 10 %"],
        rows: [
          ["W200", "54 % — 540 g", "+30 g → 570 g", "+40 g → 580 g"],
          ["W250", "55 % — 550 g", "+30 g → 580 g", "+40 g → 590 g"],
          ["W300", "56 % — 560 g", "+30 g → 590 g", "+40 g → 600 g"],
          ["W330", "57 % — 570 g", "+30 g → 600 g", "+40 g → 610 g"],
          ["W390", "59 % — 590 g", "+30 g → 620 g", "+40 g → 630 g"],
          ["W420", "60 % — 600 g", "+30 g → 630 g", "+40 g → 640 g"],
        ],
      }, note: "Le taux minimum d'hydratation va de 54 % à 60 % en empâtement direct. Certaines farines assèchent la pâte : plus le type est élevé, plus le son boit — la complète demande plus d'eau (+40 g) que la semi-complète (+30 g). Ce complément se rajoute en fin de pétrissage : c'est l'eau de bassinage." },
    ],
  },
  {
    key: "allergenes", title: "Les allergènes", icon: "shield", color: "#d7402e",
    intro: "14 allergènes à déclarer — une obligation, pas une option.",
    sections: [
      { t: "Les 14 allergènes à déclaration obligatoire", ul: [
        "Gluten · Crustacés · Œufs · Poissons · Arachides · Soja · Lait",
        "Fruits à coque · Céleri · Moutarde · Sésame · Lupin · Mollusques",
        "Sulfites et anhydride sulfureux (ex. vinaigre balsamique, charcuteries…)",
      ] },
      { t: "Modalités d'affichage", p: "Le professionnel doit mettre à disposition un document écrit, clair et accessible, et un affichage doit informer le client de sa disponibilité — par exemple : « La liste des allergènes présents dans nos plats est disponible sur demande. » L'information peut être donnée sur carte, tableau, classeur ou support numérique." },
      { t: "Bonnes pratiques", ul: ["Fiches recettes avec allergènes", "Formation des équipes", "Vérification des fournisseurs", "Mise à jour régulière"] },
      { t: "Points de vigilance", ul: ["Information fiable et à jour", "Tous les plats concernés", "Personnel formé", "Attention aux contaminations croisées"] },
    ],
  },
];

// --- Volet GESTION --------------------------------------------------------------------------
export const GESTION = [
  {
    key: "cout", title: "Le coût matière", icon: "coins", color: "#e0ac48",
    intro: "La cible 25-30 % : ce que la pizza coûte vraiment.",
    sections: [
      { t: "Le ratio", p: "Le coût matière, c'est la somme des ingrédients d'une pizza (pâton + base + garniture). Rapporté au prix de vente HT, il donne le ratio de coût matière — l'indicateur n°1 d'une carte saine." },
      { t: "L'objectif", schema: "cout", note: "Vise 25 à 30 % du prix de vente HT. Au-delà de 30 %, la pizza commence à manger la marge : il faut revoir le grammage, le produit, ou le prix. La cible bouge selon le service : en livraison, les commissions de plateforme ponctionnent le prix de vente — il faut donc un coût matière plus serré pour s'en sortir." },
      { t: "Le calcul", table: {
        head: ["Grandeur", "Formule"],
        rows: [
          ["Ratio coût matière", "coût matière ÷ prix de vente HT × 100"],
          ["Prix de vente HT conseillé", "coût matière ÷ objectif (ex. ÷ 0,30)"],
          ["Marge brute", "prix de vente HT − coût matière"],
          ["Prix TTC", "prix HT × 1,10 (TVA restauration 10 %)"],
        ],
      }, note: "Attention : la marge brute n'est pas le bénéfice — il reste les salaires, le loyer, l'énergie et les charges à payer dessus." },
    ],
  },
  {
    key: "tmt", title: "Le ticket moyen", icon: "receipt", color: "#3aa0e0",
    intro: "Ce que ta carte promet vs ce que le client dépense.",
    sections: [
      { t: "Ticket moyen théorique (TMT)", p: "Ce que ta carte « annonce » : on additionne le prix de tous les plats principaux, on divise par leur nombre, et on multiplie par 2 (le client prend rarement qu'un seul article).", note: "TMT = (somme des prix ÷ nombre de plats) × 2" },
      { t: "Ticket moyen réel (TMR)", p: "Ce que le client dépense vraiment : chiffre d'affaires ÷ nombre de tickets." },
      { t: "Lire l'écart", schema: "ticket", table: {
        head: ["Situation", "Lecture"],
        rows: [
          ["TMT ≈ TMR", "Carte et demande alignées — c'est l'objectif"],
          ["TMT < TMR", "Le client dépense plus que la carte ne le suggère : marge de manœuvre pour monter les prix ou pousser les ventes additionnelles"],
          ["TMT > TMR", "Problème de positionnement : la carte est perçue trop chère par rapport à la valeur"],
        ],
      }, note: "Tolérance admise : ±20 %. Au-delà, il faut corriger." },
    ],
  },
  {
    key: "omnes", title: "La règle d'Omnès", icon: "list-checks", color: "#7bb661",
    intro: "4 principes pour étaler les prix de sa carte sans perdre le client.",
    sections: [
      { t: "De quoi on parle", p: "Omnès ne parle pas de théorie : il parle des produits de ta carte. On prend une famille (tes pizzas), on aligne leurs prix, et on vérifie quatre choses. Les deux premières se lisent sur la carte, les deux suivantes se lisent dans tes ventes." },
      { t: "1 — Ouverture de gamme", p: "L'écart entre ta pizza la moins chère et la plus chère, dans une même famille.", note: "Prix le plus haut ÷ prix le plus bas → viser entre 2,5 et 3. Trop serré, tu ne captes ni les petits budgets ni les gros ; trop large, ta carte perd sa cohérence." },
      { t: "2 — Dispersion des prix", schema: "omnes", p: "On découpe la gamme en trois tranches de prix égales (basse, médiane, haute) et on compte combien de pizzas tombent dans chacune.", table: {
        head: ["Tranche", "Part idéale des produits"],
        rows: [["Basse", "25 %"], ["Médiane", "50 %"], ["Haute", "25 %"]],
      }, note: "Le gros de l'offre doit être au milieu : c'est là que le client se décide. Autrement dit, la tranche médiane doit peser autant que les deux autres réunies." },
      { t: "3 — La réaction des clients (offre vs demande)", p: "Le principe le plus important à terme, parce qu'il ne se lit pas sur la carte mais dans le tiroir-caisse : ce que tu proposes correspond-il à ce que les clients prennent vraiment ? On compare le prix moyen offert (ta carte) au prix moyen demandé (tes ventes réelles).", note: "Si tes clients achètent surtout dans la tranche basse alors que ton offre est centrée sur la médiane, ta carte est décalée par rapport à ta clientèle — c'est elle qu'il faut suivre, pas l'inverse." },
      { t: "4 — La promotion (mise en avant)", p: "Un plat que tu mets en avant — suggestion, ardoise, menu — doit être positionné dans la zone médiane, là où se trouve la demande.", note: "Un produit en promotion n'est pas un produit à bas prix : c'est un plat proposé à un prix attractif dans le but d'augmenter sa popularité." },
    ],
  },
  {
    key: "bcg", title: "La matrice BCG", icon: "target", color: "#dc3e37",
    intro: "Classer ses pizzas : lesquelles garder, pousser, ou retirer.",
    sections: [
      { t: "Le principe", p: "On croise deux axes pour chaque pizza de la carte : sa popularité (combien il s'en vend) et sa marge (ce qu'elle rapporte). Quatre familles apparaissent — on ne traite pas une pizza de la même façon selon sa case. C'est le « menu engineering » de Michael Kasavana et Donald Smith (1982, Michigan State University)." },
      { t: "⚠ La marge se compte en euros, pas en %", p: "L'axe des marges est la marge contributive : prix de vente HT − coût matière, en euros par pizza. Pas la marge en pourcentage.", note: "Une pizza à faible marge % mais gros volume peut rapporter beaucoup plus qu'une pizza à forte marge % qui ne se vend pas. On classe chaque pizza par rapport à la MOYENNE de la carte : au-dessus de la moyenne = « forte », en dessous = « faible » — sur les deux axes." },
      { t: "Les 4 cases", schema: "bcg", table: {
        head: ["Case", "Popularité / Marge", "Que faire ?"],
        rows: [
          ["⭐ Étoiles", "Forte / Forte", "Les chouchous : garder telles quelles, les mettre en avant, ne pas y toucher"],
          ["🐴 Vaches à lait", "Forte / Faible", "Ça se vend mais ça rapporte peu : baisser le coût matière ou monter légèrement le prix"],
          ["❓ Dilemmes", "Faible / Forte", "Ça rapporte mais personne ne la prend : mieux la placer sur la carte, la renommer, la suggérer"],
          ["💀 Poids morts", "Faible / Faible", "Ni vendue ni rentable : à retirer de la carte"],
        ],
      }, note: "À refaire à chaque changement de carte : une étoile peut devenir un poids mort en une saison." },
    ],
  },
];

// --- LEXIQUE --------------------------------------------------------------------------------
export const LEXIQUE = [
  { t: "Adjonction", d: "Produit rajouté à la pâte pendant le pétrissage (graines, son, charbon…), calculé sur le poids de la farine." },
  { t: "Albumen (amande)", d: "Le cœur du grain : réserve d'amidon et de protéines, c'est lui qui donne la farine blanche." },
  { t: "Alvéographe de Chopin", d: "L'appareil de laboratoire qui mesure la force de la farine (W) en gonflant une bulle de pâte jusqu'à éclatement." },
  { t: "Autolyse", d: "Repos de la farine et de l'eau seules (≈ 40 mn) avant d'ajouter levure, sel et huile : la pâte devient plus extensible." },
  { t: "Bassinage", d: "Eau ajoutée en petits filets en fin de pétrissage, pour compenser les farines ou produits qui boivent, jusqu'à une texture souple et homogène." },
  { t: "Biga", d: "Préferment sec italien (≈ 45-50 % d'hydratation)." },
  { t: "Caryopse", d: "Le grain de blé : son, amande et germe." },
  { t: "Cendres (taux de)", d: "Les minéraux restants après combustion de 100 g de matière sèche : ils déterminent le type de la farine." },
  { t: "Coulage (eau de)", d: "L'eau du pétrissage : elle hydrate la farine, dissout sel et levure et déclenche la fermentation." },
  { t: "Détente", d: "Court repos (≈ 5 mn) de la masse après le pointage, avant division et boulage." },
  { t: "Dureté de l'eau", d: "Teneur en sels minéraux, mesurée en degré français (°f). 15 à 30 °f est l'idéal pour la pâte." },
  { t: "Empâtement direct", d: "Tous les ingrédients sont mélangés en une seule fois, sans préferment." },
  { t: "Empâtement indirect", d: "Une partie de la pâte est préfermentée (poolish, biga) avant le pétrissage final." },
  { t: "Fermentation alcoolique", d: "La levure transforme les sucres de la farine en dioxyde de carbone (qui fait lever) et en alcool." },
  { t: "Germe", d: "L'embryon du grain, riche en matières grasses : on le retire car il fait rancir la farine." },
  { t: "Gliadine", d: "Protéine du blé qui apporte l'extensibilité de la pâte." },
  { t: "Gluten", d: "Réseau formé à l'hydratation par la gliadine et la gluténine : c'est lui qui retient le gaz." },
  { t: "Gluténine", d: "Protéine du blé qui apporte la ténacité de la pâte." },
  { t: "Hydratation (TH)", d: "Quantité d'eau rapportée au poids de farine, en %. De 54 % à 60 % en empâtement direct, selon la force W." },
  { t: "Hygroscopique", d: "Qui capte l'humidité — propriété du sel, qui permet d'hydrater davantage sans rendre la pâte collante." },
  { t: "Maille glutinique", d: "Le filet tissé par le gluten, qui emprisonne le CO₂ de la fermentation." },
  { t: "Manitoba", d: "Farine de force (W 400-430) servant à renforcer une farine plus faible." },
  { t: "Maturation", d: "Le temps (souvent au froid) pendant lequel la pâte développe arômes et digestibilité." },
  { t: "P/L", d: "Rapport entre ténacité (P) et extensibilité (L) : l'équilibre de la pâte." },
  { t: "Pointage", d: "Le repos en masse juste après le pétrissage : 10 à 40 mn selon la saison." },
  { t: "Poolish", d: "Préferment liquide (≈ 100 % d'hydratation)." },
  { t: "Pourcentage boulanger", d: "Tout est exprimé en % du poids de farine, la farine valant 100 %." },
  { t: "Saccharomyces cerevisiae", d: "L'espèce de levure utilisée en panification (levure de bière ou de boulanger)." },
  { t: "Séléniteuse", d: "Se dit d'une eau chargée en sels de calcium ou de magnésium — dite aussi « calcaire »." },
  { t: "Son", d: "L'enveloppe du grain : fibres et minéraux. Plus il est présent (type élevé), plus la farine boit d'eau." },
  { t: "Substitution", d: "Remplacer une part de la farine de blé par une autre farine (complète, soja, seigle…), à poids constant." },
  { t: "TB 50", d: "Température de base de l'école : 50 − (température de la farine × 2) = température de l'eau de coulage." },
  { t: "Type / Tipo", d: "Classement de la farine par taux de cendres : 6 types en France, 5 en Italie (T45↔00 … T150↔intégrale)." },
  { t: "Unité de calcul", d: "1 kg de farine — la base de tous les calculs (≈ 6 pâtons de 280 g)." },
  { t: "W (force boulangère)", d: "Le travail nécessaire pour déformer le pâton jusqu'à éclatement : la « force » de la farine." },
  // Gestion
  { t: "Coût matière", d: "Somme des ingrédients d'une pizza. Cible : 25 à 30 % du prix de vente HT — plus serré en livraison (commissions).", g: true },
  { t: "Marge contributive", d: "Prix de vente HT − coût matière, en euros par pizza. C'est l'axe des marges de la matrice BCG (et non la marge en %).", g: true },
  { t: "Matrice BCG", d: "Le « menu engineering » de Kasavana & Smith (1982) : on classe chaque pizza par popularité × marge contributive, comparées à la moyenne de la carte → étoiles, vaches à lait, dilemmes, poids morts.", g: true },
  { t: "Marge brute", d: "Prix de vente HT − coût matière (avant salaires, loyer et charges).", g: true },
  { t: "Ouverture de gamme", d: "Prix le plus haut ÷ prix le plus bas d'une même famille. À viser entre 2,5 et 3 (1ᵉʳ principe d'Omnès).", g: true },
  { t: "Règle d'Omnès", d: "4 principes d'étalement des prix d'une carte : ouverture de gamme (2,5 à 3), dispersion (25/50/25), réaction des clients (offre vs demande) et promotion (mise en avant en zone médiane).", g: true },
  { t: "Ticket moyen réel", d: "Chiffre d'affaires ÷ nombre de tickets : ce que le client dépense vraiment.", g: true },
  { t: "Ticket moyen théorique", d: "(Somme des prix ÷ nombre de plats) × 2 : ce que la carte suggère. Écart toléré avec le réel : ±20 %.", g: true },
];

// --- À VALIDER ------------------------------------------------------------------------------
// Éléments trouvés en ligne qui complètent/contredisent ce qu'on affiche. RIEN n'est appliqué
// tant que Maxime n'a pas tranché : c'est un onglet de proposition, pas de vérité.
// kind : "conflit" (contradit l'existant) · "ajout" (manque) · "precision" (affine)
export const A_VALIDER = [
  // Vidé le 2026-07-16 : les 4 propositions (ouverture de gamme 2,5-3, les 2 principes d'Omnès
  // manquants, la précision BCG marge contributive/Kasavana-Smith, la cible coût matière 25-30 %)
  // ont été validées par Maxime et appliquées aux fiches, aux schémas et au lexique.
  // Les prochaines trouvailles à arbitrer se rajoutent ici.
];

// --- EXEMPLES -------------------------------------------------------------------------------
// Chaque fiche se termine par un cas concret, chiffré : c'est ce qui fait comprendre.
// Les exemples s'appuient tous sur la même carte fictive de 8 pizzas (cf. schéma d'Omnès),
// pour que le stagiaire suive un seul fil rouge d'une notion à l'autre.
export const EXEMPLES = {
  farine: "Tu achètes un sac « Tipo 00 ». Le W n'est pas dessus → tu demandes la fiche technique au meunier : W 300. C'est une farine à napolitaine ou à direct long. Pour 1 kg, tu couleras 560 g d'eau (56 %). Si le meunier t'annonce P/L = 0,55, elle est équilibrée : elle s'étalera sans se rétracter.",
  levure: "On est en été, ta farine est à 24 °C. Tu lis la table à la ligne « 21,1 → 26 °C » : 3 g de levure fraîche par kilo. Tu les émiettes dans la farine. Si tu n'as que de la sèche instantanée, c'est la moitié : 1,5 g. Et tu ne la délaies surtout pas dans de l'eau à 45 °C — tu la tuerais à moitié.",
  eau: "Ta farine est à 17 °C. 17 × 2 = 34 ; 50 − 34 = 16 °C → tu coules à 16 °C. Ton eau de ville titre 22 °f : elle est « plutôt dure », donc dans la zone idéale (15-30) — tu ne touches à rien. Si elle titrait 5 °f, ta pâte collerait : tu rajouterais un peu de sel.",
  sel: "Pour 1 kg de farine : 20 g de sel (2 %), soit le milieu de la fourchette 17-22 g. Tu le verses petit à petit à la 12ᵉ minute, jamais en contact direct avec la levure au départ — il la brûlerait et ta pâte ne lèverait pas.",
  huile: "Tu fais des pâtons à garder 3 jours en chambre froide → 25 g d'huile d'olive extra vierge (2,5 %) par kilo : ils resteront ronds. Tu fais une napolitaine pour le service du soir → 0 g d'huile : elle part dans l'heure, elle n'en a pas besoin (et le cahier des charges l'interdit).",
  unites: "Tu as besoin de 60 pâtons de 280 g pour le service. 60 ÷ 6 = 10 unités de calcul → 10 kg de farine, 6,2 kg d'eau (62 %), 200 g de sel (2 %), 250 g d'huile (2,5 %), 30 g de levure. Tu n'as rien recalculé : tu as juste multiplié par 10.",
  protocole: "9 h, plein hiver, ton labo est frais. Farine + levure 1 mn, eau d'un coup puis 12 mn en petite vitesse, sel, puis l'huile 1 mn après, encore 3 mn. Tu sondes : 24 °C, c'est bon. Pointage 30 mn (hiver), détente 5 mn, tu étales à 10 cm, tu divises en pâtons de 280 g, tu boules et tu bloques à 4 °C.",
  adjonctions: "Tu veux une pâte aux graines. 4 % sur 1 kg de farine = 40 g de graines torréfiées. Tu les ajoutes avant le sel, vers la 10ᵉ minute. Elles boivent : tu gardes un peu d'eau de bassinage pour rattraper la texture en fin de pétrissage.",
  substitutions: "W330 avec 10 % de soja : 900 g de blé + 100 g de soja. Eau = 570 g de coulage (57 %) + 30 g de bassinage = 600 g au total. Si tu mets de la farine complète à la place du soja, elle boit plus : +40 g au lieu de +30 → 610 g.",
  allergenes: "Une Reine : gluten (la pâte), lait (la mozzarella), et souvent des sulfites (le jambon). Tu le notes sur ta fiche recette, tu affiches « La liste des allergènes est disponible sur demande » — et tu fais attention à la planche qui a servi au poisson juste avant.",
  // Gestion
  cout: "Ta Chorizo coûte 3,60 € de matière et se vend 16,50 € TTC, soit 15,00 € HT. Ratio = 3,60 ÷ 15 = 24 % → tu es même sous la cible 25-30 %, c'est très sain. Si tu la bradais à 11 € TTC (10 € HT), le ratio grimperait à 36 % : tu travaillerais à perte une fois le loyer et les salaires payés. Et si tu la vends en livraison avec 30 % de commission, ces 24 % de départ deviennent vite intenables.",
  tmt: "Ta carte : 8 pizzas, 129,50 € au total → 16,19 € de moyenne → TMT = 16,19 × 2 = 32,38 €. Ce mois-ci : 29 000 € de CA pour 1 000 tickets → TMR = 29 €. Écart = −10 % : dans la tolérance des ±20 %, ta carte et ta clientèle sont alignées. À −30 %, il faudrait revoir la carte : elle serait perçue trop chère.",
  omnes: "Carte de 8 pizzas, de la Marinara à 9 € à la Truffe à 24 €. Ouverture de gamme = 24 ÷ 9 = 2,67 → pile dans la fourchette 2,5-3 ✓. Tranches de 5 € : 2 pizzas de 9 à 14 €, 4 de 14 à 19 €, 2 de 19 à 24 € → 25 / 50 / 25 ✓. Restent les principes 3 et 4 : ouvre ta caisse et vérifie que tes clients achètent bien au milieu — et que ta suggestion du moment y est aussi.",
  bcg: "Marge contributive moyenne de ta carte : 10 € par pizza. La Margherita (11,50 €) ne laisse que 8 € — sous la moyenne — mais se vend 300 fois sur 1 000 : c'est une vache à lait, tu montes son prix de 50 centimes ou tu rognes son coût. La Truffe (24 €) laisse 14 € mais ne part que 20 fois : dilemme, tu la passes en suggestion du chef. La Chorizo laisse 11,40 € et se vend bien : étoile, tu n'y touches pas. La Marinara ne se vend pas et ne rapporte rien : tu la sors.",
};

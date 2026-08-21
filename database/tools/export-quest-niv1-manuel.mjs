/**
 * Banque de questions « Niveau I » tirée du Manuel Technique Niveau I (mise à jour 14/01/2026).
 *
 * Toutes les réponses sont vérifiables dans le manuel, page indiquée par `src`. Rien n'est
 * inventé : quand le manuel donne une fourchette (« 17 à 22 g »), c'est cette fourchette qui
 * fait foi, pas une valeur arrondie.
 *
 * LA DIFFICULTÉ SE JOUE DANS LES LEURRES, pas dans l'énoncé. C'est le principe de rédaction
 * du manuel lui-même : une mauvaise réponse absurde s'élimine sans rien connaître, et la
 * question ne teste plus rien. D'où trois niveaux :
 *   · facile    — les leurres appartiennent à un autre domaine (une couleur contre une force
 *                 de farine) : il suffit d'avoir lu le chapitre ;
 *   · normal    — les leurres sont des valeurs réelles du métier, mais d'un autre usage
 *                 (la dose de sel proposée pour la levure) : il faut savoir lequel est lequel ;
 *   · difficile — les leurres sont les valeurs VOISINES de la bonne (54 % contre 55 %, 38 °C
 *                 contre 50 °C), ou demandent un calcul : rien ne se devine.
 *
 * Usage : node database/tools/export-quest-niv1-manuel.mjs > database/migrations/105_seed_quest_niv1_manuel.sql
 */

export const CHAPITRES = [
  /* ------------------------------------------------------------------ 1 */
  { title: "Les céréales & le grain", ic: "wheat", q: [
    { t: "qcm", d: "facile", q: "À quelle famille botanique appartiennent les céréales ?",
      c: ["Les poacées (graminées)", "Les solanacées", "Les légumineuses", "Les brassicacées"], a: 0,
      expl: "Les céréales sont des poacées, sauvages ou cultivées, qui produisent des grains comestibles moulus en farine.", src: "Manuel Niveau I, p. 5" },
    { t: "qcm", d: "normal", q: "Laquelle de ces céréales NE contient PAS de gluten ?",
      c: ["Le sarrasin", "L'épeautre", "Le seigle", "L'orge"], a: 0,
      expl: "Sarrasin, maïs, riz, sorgho, quinoa, millet et teff sont sans gluten. Épeautre, seigle et orge en contiennent, comme le blé et le kamut.", src: "Manuel Niveau I, p. 5" },
    { t: "qcm", d: "normal", q: "Le blé TENDRE est principalement utilisé pour…",
      c: ["La panification (dont la pizza)", "Les pâtes alimentaires", "La semoule et le couscous", "Le boulgour"], a: 0,
      expl: "Le blé tendre a un albumen moins riche en protéines et en gluten, à texture plus douce : c'est la farine de panification. Le blé dur, à albumen vitreux, part en pâtes, semoule, boulgour et couscous.", src: "Manuel Niveau I, p. 6" },
    { t: "qcm", d: "difficile", q: "Après broyage, quelle granulométrie correspond au blé tendre ?",
      c: ["30 à 200 µm", "150 à 500 µm", "500 à 800 µm", "5 à 20 µm"], a: 0,
      expl: "Le blé tendre donne les particules les plus fines, 30 à 200 µm ; le blé dur les grosses particules, 150 à 500 µm. Le µm vaut un millième de millimètre.", src: "Manuel Niveau I, p. 6" },
    { t: "qcm", d: "difficile", q: "Dans le caryopse, quelle part représente l'albumen (amande) ?",
      c: ["82 à 85 %", "13 à 15 %", "environ 3 %", "64 à 80 %"], a: 0,
      expl: "L'albumen pèse 82 à 85 % du grain, les enveloppes (son) 13 à 15 %, le germe environ 3 %. Le 64-80 % est la part d'amidon dans la farine, pas dans le grain.", src: "Manuel Niveau I, p. 7" },
    { t: "vf", d: "normal", q: "Le blé dur possède un albumen vitreux, plus riche en protéines que le blé tendre.", a: true,
      expl: "C'est précisément ce qui lui donne sa texture ferme et le destine aux pâtes plutôt qu'à la panification.", src: "Manuel Niveau I, p. 5-6" },
    { t: "assoc", d: "normal", q: "Associe chaque partie du grain à sa proportion :",
      pairs: [["Albumen (amande)", "82 à 85 %"], ["Enveloppes (son)", "13 à 15 %"], ["Germe (embryon)", "environ 3 %"]],
      expl: "L'essentiel du grain est de l'amande — c'est elle qui donne la farine blanche. Les enveloppes partent au son, le germe est infime mais riche.", src: "Manuel Niveau I, p. 7" },
  ] },

  /* ------------------------------------------------------------------ 2 */
  { title: "Le gluten", ic: "refresh", q: [
    { t: "qcm", d: "normal", q: "Quelles sont les deux protéines qui forment le réseau de gluten ?",
      c: ["La gliadine et la gluténine", "La globuline et l'albumine", "L'amidon et la cellulose", "La caséine et la lactoglobuline"], a: 0,
      expl: "Gliadine et gluténine se fusionnent au pétrissage et créent le réseau élastique. Globuline et albumine sont les protéines SOLUBLES de la farine, elles ne forment pas la maille.", src: "Manuel Niveau I, p. 8 et 10" },
    { t: "qcm", d: "normal", q: "Quelle part des protéines du blé le gluten représente-t-il ?",
      c: ["environ 80 %", "environ 15 %", "environ 50 %", "environ 95 %"], a: 0,
      expl: "Le gluten constitue environ 80 % des protéines du blé. Les 15 % renvoient aux protéines solubles (globuline, albumine).", src: "Manuel Niveau I, p. 8" },
    { t: "qcm", d: "facile", q: "Que retient le réseau de gluten pendant la fermentation ?",
      c: ["Le gaz carbonique produit par les levures", "Le sel dissous dans l'eau", "L'huile d'olive", "Les cendres de la farine"], a: 0,
      expl: "C'est le filet qui emprisonne le CO₂ issu de la dégradation des sucres : sans lui, la pâte ne lèverait pas et la mie n'aurait pas d'alvéoles.", src: "Manuel Niveau I, p. 8" },
    { t: "vf", d: "normal", q: "C'est en pétrissant LENTEMENT que l'on développe le plus le réseau de gluten.", a: false,
      expl: "C'est l'inverse : à vitesse rapide, le réseau sera plus important. C'est aussi pour cela que le pétrin à spirale, le plus rapide, accélère la formation de la maille.", src: "Manuel Niveau I, p. 8 et 42" },
    { t: "vf", d: "facile", q: "Sans gluten, une pâte est plus élastique et se lie mieux.", a: false,
      expl: "L'inverse : sans gluten la pâte est cassante et friable, elle ne se lie pas. On appelle « panifiables » les farines qui en contiennent assez pour que la pâte lève.", src: "Manuel Niveau I, p. 8" },
    { t: "qcm", d: "difficile", q: "Comment se nomment les liaisons chimiques qui structurent le réseau de gluten ?",
      c: ["Les ponts disulfures", "Les liaisons hydrogène", "Les ponts salins", "Les liaisons peptidiques"], a: 0,
      expl: "Le gluten, combiné à l'eau et à une source d'énergie, forme des ponts disulfures qui créent le réseau.", src: "Manuel Niveau I, p. 8" },
  ] },

  /* ------------------------------------------------------------------ 3 */
  { title: "La farine : type & raffinage", ic: "package", q: [
    { t: "qcm", d: "normal", q: "Qu'est-ce qui détermine le TYPE d'une farine (T45, T55, T65…) ?",
      c: ["Son taux de cendres", "Son indice de force W", "Son taux de protéines", "Sa granulométrie"], a: 0,
      expl: "Le type est fixé par le poids de cendres contenu dans 100 g de matières sèches. Les cendres sont les matières minérales, principalement présentes dans le son.", src: "Manuel Niveau I, p. 14" },
    { t: "qcm", d: "difficile", q: "À quel taux de cendres correspond une farine T65 ?",
      c: ["0,62 à 0,75", "0,50 à 0,60", "0,75 à 0,90", "1,00 à 1,20"], a: 0,
      expl: "T65 : 0,62 à 0,75, pour un taux d'extraction de 78 % — la farine de la pizza et de la baguette de tradition. 0,50-0,60 est la T55, 0,75-0,90 la T80.", src: "Manuel Niveau I, p. 13" },
    { t: "qcm", d: "normal", q: "Combien existe-t-il de types de farine en France ?",
      c: ["6", "5", "4", "8"], a: 0,
      expl: "Six types en France (150, 110, 80, 65, 55, 45) contre cinq en Italie (integrale, 2, 1, 0, 00).", src: "Manuel Niveau I, p. 14" },
    { t: "qcm", d: "difficile", q: "Pour 100 kg de blé, quelle quantité de farine cherche-t-on le plus souvent à obtenir ?",
      c: ["75 kg", "78 kg", "67 kg", "85 kg"], a: 0,
      expl: "75 kg de farine, 2 % de perte, et les 23 % restants forment les « issues ». Les 78 % et 67 % sont des taux d'extraction de types précis (T65, T45), pas la moyenne recherchée.", src: "Manuel Niveau I, p. 14" },
    { t: "qcm", d: "normal", q: "Quelle est la température MAXIMALE du local de stockage de la farine ?",
      c: ["16 °C", "4 °C", "20 °C", "25 °C"], a: 0,
      expl: "Un local sec et ventilé à 16 °C maximum, la farine sur palette pour laisser passer l'air et éviter les blocs, et une protection contre rongeurs et insectes.", src: "Manuel Niveau I, p. 12" },
    { t: "qcm", d: "difficile", q: "Quel est le taux d'humidité MAXIMAL mentionné obligatoirement sur un sac de farine ?",
      c: ["15,5 %", "14 %", "16 %", "12,5 %"], a: 0,
      expl: "15,5 % maximum. C'est l'une des cinq mentions obligatoires, avec le type, la DLUO, le poids et le nom du moulin.", src: "Manuel Niveau I, p. 12" },
    { t: "vf", d: "normal", q: "Plus une farine est blanche, plus son taux de cendres est faible.", a: true,
      expl: "La farine la plus blanche est faite essentiellement de l'amande du grain : elle est très pure, donc peu chargée en débris minéraux.", src: "Manuel Niveau I, p. 14 et lexique" },
    { t: "assoc", d: "difficile", q: "Associe chaque type français à son équivalent italien :",
      pairs: [["T45", "00"], ["T65", "0"], ["T80", "1"], ["T110", "2"]],
      expl: "La correspondance suit le raffinage : plus le chiffre français est bas, plus la farine est blanche, et plus le « tipo » italien compte de zéros.", src: "Manuel Niveau I, p. 13-14" },
  ] },

  /* ------------------------------------------------------------------ 4 */
  { title: "L'indice de force (W)", ic: "flask", q: [
    { t: "qcm", d: "facile", q: "Que mesure l'indice W d'une farine ?",
      c: ["Sa force boulangère", "Son taux d'hydratation", "Son taux de cendres", "Sa finesse de mouture"], a: 0,
      expl: "Le W mesure le travail nécessaire pour déformer le pâton jusqu'à son éclatement — la « force boulangère ». Le taux de cendres, lui, donne le TYPE.", src: "Manuel Niveau I, p. 15-16" },
    { t: "qcm", d: "facile", q: "Quel appareil sert à déterminer le W ?",
      c: ["L'alvéographe de Chopin", "Le réfractomètre", "Le pénétromètre", "Le densimètre"], a: 0,
      expl: "L'alvéographe de Chopin, ou extensimètre : il déforme la pâte par pression d'air pour mesurer ténacité, extensibilité, élasticité et force.", src: "Manuel Niveau I, p. 15 et lexique" },
    { t: "vf", d: "normal", q: "L'indice W est imprimé sur le sac de farine.", a: false,
      expl: "Le manuel le dit clairement : le W ne figure PAS sur les sacs. Il faut se référer à la fiche technique du meunier — ou, chez 5 Stagioni, au code couleur du sac.", src: "Manuel Niveau I, p. 12 et 15" },
    { t: "qcm", d: "difficile", q: "Quelle force de farine correspond aux pizzas napolitaines ?",
      c: ["W 250 – 310", "W 200 – 250", "W 330 – 390", "W 400 – 430"], a: 0,
      expl: "W 250-310 pour la napolitaine. W 200-250 vise les empâtements directs à levage court, W 330-390 les levages longs et les indirects, W 400-430 les Manitoba de renfort.", src: "Manuel Niveau I, p. 15" },
    { t: "qcm", d: "normal", q: "À quoi servent les farines dites « Manitoba » (W 400-430) ?",
      c: ["À renforcer des farines plus faibles", "À faire des biscuits et crackers", "À la pizza napolitaine", "Aux empâtements directs à levage court"], a: 0,
      expl: "Ce sont des farines de force : elles ne s'emploient pas seules mais corrigent une farine trop faible. Les biscuits et crackers relèvent au contraire des W 120-150.", src: "Manuel Niveau I, p. 15" },
    { t: "qcm", d: "difficile", q: "Dans l'alvéogramme, que mesure le « P » ?",
      c: ["La ténacité et la résistance à la déformation", "L'extensibilité de la pâte", "La quantité d'air insufflée", "Le travail total de déformation"], a: 0,
      expl: "P = pression, donc ténacité et fermeté. G est le gonflement (air insufflé), L la largeur (extensibilité), W le travail. Le rapport P/L traduit l'équilibre entre ténacité et extensibilité.", src: "Manuel Niveau I, p. 16" },
    { t: "vf", d: "difficile", q: "Plus une farine est riche en protéines, plus son W est élevé.", a: true,
      expl: "La qualité de la farine dépend de la qualité des protéines : plus la farine en est riche, plus la maille glutamique est forte et plus le W monte.", src: "Manuel Niveau I, p. 10" },
    { t: "assoc", d: "difficile", q: "Chez 5 Stagioni, associe chaque couleur de sac à sa force :",
      pairs: [["Bleu clair", "W200"], ["Vert", "W250"], ["Bleu foncé", "W330"], ["Rouge", "W390"], ["Marron", "W420"]],
      expl: "Le W ne figurant pas sur les sacs, le meunier le code par la couleur — d'où l'intérêt de connaître la correspondance quand on réceptionne la marchandise.", src: "Manuel Niveau I, p. 12" },
    { t: "assoc", d: "normal", q: "Associe chaque plage de W à son usage :",
      pairs: [["W 120 – 150", "Biscuits & crackers"], ["W 250 – 310", "Pizzas napolitaines"], ["W 330 – 390", "Levages longs & indirects"], ["W 400 – 430", "Farines de renfort (Manitoba)"]],
      expl: "La règle tient en une phrase : plus la fermentation est longue, plus il faut de force.", src: "Manuel Niveau I, p. 15" },
  ] },

  /* ------------------------------------------------------------------ 5 */
  { title: "La levure", ic: "yeast", q: [
    { t: "qcm", d: "facile", q: "Quelle variété de levure utilise-t-on en panification ?",
      c: ["Saccharomyces cerevisiae", "Candida albicans", "Aspergillus oryzae", "Lactobacillus sanfranciscensis"], a: 0,
      expl: "Saccharomyces cerevisiae — la « levure de bière » ou « levure de boulanger ». Elle se nourrit de sucres et les transforme en dioxyde de carbone et en alcool.", src: "Manuel Niveau I, p. 17 et lexique" },
    { t: "qcm", d: "facile", q: "Comment se nomme la transformation des sucres en CO₂ et en alcool ?",
      c: ["La fermentation alcoolique", "La panification", "Le pointage", "Le frasage"], a: 0,
      expl: "C'est la fermentation alcoolique. Le pointage est la phase de repos qui suit le pétrissage, le frasage le premier mélange des ingrédients.", src: "Manuel Niveau I, p. 17" },
    { t: "qcm", d: "difficile", q: "À quelle température l'eau détruit-elle la levure ?",
      c: ["Au-delà de 50 °C", "Au-delà de 40 °C", "Au-delà de 38 °C", "Au-delà de 60 °C"], a: 0,
      expl: "Au-delà de 50 °C elle est détruite ; au-delà de 40 °C seulement affaiblie ; en eau froide, simplement ralentie. Pour réhydrater une levure sèche active, on vise 38 °C sans jamais dépasser 50 °C.", src: "Manuel Niveau I, p. 17 et 19" },
    { t: "qcm", d: "difficile", q: "Quelle dose maximale de levure sèche INSTANTANÉE admet-on par kilo de farine ?",
      c: ["1 à 2 g", "2 à 4 g", "3 à 5 g", "0,5 à 1 g"], a: 0,
      expl: "1 à 2 g pour l'instantanée, contre 2 à 4 g pour la fraîche comme pour la sèche active : l'instantanée est deux fois plus concentrée.", src: "Manuel Niveau I, p. 19" },
    { t: "qcm", d: "normal", q: "Entre quelles températures la levure fraîche a-t-elle son action optimale ?",
      c: ["21 à 27 °C", "10 à 16 °C", "30 à 36 °C", "4 à 10 °C"], a: 0,
      expl: "La levure fraîche agit au mieux pour une pâte entre 21 et 27 °C selon la saison.", src: "Manuel Niveau I, p. 19" },
    { t: "qcm", d: "normal", q: "Combien de cellules contient 1 g de levure fraîche ?",
      c: ["10 milliards", "10 millions", "1 milliard", "100 milliards"], a: 0,
      expl: "1 g de levure fraîche = 10 milliards de cellules. La cellule se reproduit par germination en une heure environ.", src: "Manuel Niveau I, p. 18" },
    { t: "vf", d: "normal", q: "Une dose de levure excessive donne une pâte peu savoureuse qui rassit vite.", a: true,
      expl: "Une dose trop élevée ne permet pas de respecter les étapes de la panification : la pâte manque de goût et rassit très rapidement.", src: "Manuel Niveau I, p. 18" },
    { t: "vf", d: "difficile", q: "La levure ne peut vivre qu'en présence d'air.", a: false,
      expl: "Elle vit avec ou sans air. En aérobie elle respire et se reproduit ; en anaérobie elle puise son énergie dans la fermentation des sucres qu'elle transforme en alcool.", src: "Manuel Niveau I, p. 18" },
    { t: "assoc", d: "difficile", q: "Associe chaque température de l'eau à son effet sur la levure :",
      pairs: [["Eau froide", "Action ralentie"], ["Eau tiède (> 40 °C)", "Levure affaiblie"], ["Eau chaude (> 50 °C)", "Levure détruite"]],
      expl: "C'est pourquoi on réhydrate à 38 °C : assez chaud pour l'activer, assez loin des 50 °C pour ne pas la tuer.", src: "Manuel Niveau I, p. 19" },
  ] },

  /* ------------------------------------------------------------------ 6 */
  { title: "L'eau & l'hydratation", ic: "droplet", q: [
    { t: "qcm", d: "facile", q: "Comment se nomme l'eau servant au pétrissage de la pâte ?",
      c: ["L'eau de coulage", "L'eau de bassinage", "L'eau de trempe", "L'eau de mouillage"], a: 0,
      expl: "L'eau de coulage hydrate la farine, dissout le sel et la levure et permet au gluten de former son réseau. L'eau de bassinage, elle, s'ajoute en FIN de pétrissage pour corriger la texture.", src: "Manuel Niveau I, p. 20 et 25" },
    { t: "qcm", d: "difficile", q: "Quel est le taux MINIMUM d'hydratation en empâtement direct ?",
      c: ["54 %", "50 %", "57 %", "60 %"], a: 0,
      expl: "De 54 % à 60 % en direct, selon la force de la farine. Les 60 % correspondent au haut de la fourchette (W420), pas au minimum.", src: "Manuel Niveau I, p. 21 et 25" },
    { t: "qcm", d: "difficile", q: "Quelle dureté d'eau est idéale pour la pâte ?",
      c: ["Moyennement dure (15 à 30 °F)", "Très douce (0 à 7 °F)", "Dure (30 à 40 °F)", "Très dure (+ 40 °F)"], a: 0,
      expl: "Entre 15 et 30 degrés, l'eau est idéale. Trop douce, la pâte colle et des bulles apparaissent à la cuisson ; trop dure, la pâte est dure et lève mal.", src: "Manuel Niveau I, p. 20" },
    { t: "qcm", d: "normal", q: "Que faire d'une eau trop DURE pour l'empâtement ?",
      c: ["Utiliser un adoucisseur", "Ajouter un peu de sel", "Ajouter un peu de sucre", "Augmenter la dose de levure"], a: 0,
      expl: "Eau dure : adoucisseur. C'est l'eau DOUCE que l'on corrige en ajoutant un peu de sel dans la pâte.", src: "Manuel Niveau I, p. 20" },
    { t: "qcm", d: "normal", q: "Quels sont les critères ORGANIQUES d'une eau d'empâtement ?",
      c: ["Incolore, limpide, inodore, sans goût", "Riche en calcium et en magnésium", "Légèrement acide et minéralisée", "Filtrée et déminéralisée"], a: 0,
      expl: "Les critères organiques portent sur l'aspect et le goût. Le calcium et le magnésium relèvent des critères CHIMIQUES — ce sont eux qui rendent l'eau calcaire ou séléniteuse.", src: "Manuel Niveau I, p. 20" },
    { t: "qcm", d: "difficile", q: "Quelle hydratation le manuel associe-t-il à une farine W330 ?",
      c: ["57 %", "56 %", "55 %", "59 %"], a: 0,
      expl: "W330 → 57 %, soit 570 g d'eau au kilo. W300 est à 56 %, W250 à 55 %, W390 à 59 % : un point d'écart à chaque cran.", src: "Manuel Niveau I, p. 25 et 27" },
    { t: "vf", d: "normal", q: "L'eau d'empâtement doit être potable.", a: true,
      expl: "Critères organiques, chimiques et bactériologiques conseillés par l'Organisation mondiale de la santé.", src: "Manuel Niveau I, p. 20" },
    { t: "assoc", d: "difficile", q: "Associe chaque titre hydrométrique à sa qualification :",
      pairs: [["0 à 7 °F", "Eau très douce"], ["7 à 15 °F", "Eau douce"], ["15 à 30 °F", "Eau plutôt dure"], ["+ 40 °F", "Eau très dure"]],
      expl: "La dureté se mesure en degré français : un degré hydrométrique correspond à du carbonate de calcium dans 100 litres d'eau.", src: "Manuel Niveau I, p. 20" },
  ] },

  /* ------------------------------------------------------------------ 7 */
  { title: "La température de l'eau de coulage", ic: "thermometer", q: [
    { t: "qcm", d: "normal", q: "Quelle température de base (TB) le manuel utilise-t-il ?",
      c: ["50", "60", "54", "72"], a: 0,
      expl: "TB = 50 dans la formule de l'École Pizza. D'autres méthodes de panification utilisent 54 ou 72 : ce n'est pas celle enseignée ici.", src: "Manuel Niveau I, p. 21" },
    { t: "qcm", d: "difficile", q: "Quelle est la formule de la température de l'eau de coulage ?",
      c: ["50 − (température de la farine × 2)", "50 − température de la farine", "(50 + température de la farine) ÷ 2", "50 + (température de la farine × 2)"], a: 0,
      expl: "On double la température de la farine, puis on retranche le résultat de 50. C'est le doublement qui distingue cette formule des autres.", src: "Manuel Niveau I, p. 21" },
    { t: "qcm", d: "difficile", q: "Farine à 17 °C : quelle température pour l'eau de coulage ?",
      c: ["16 °C", "33 °C", "20 °C", "26 °C"], a: 0,
      expl: "17 × 2 = 34, puis 50 − 34 = 16 °C. C'est le cas type du printemps et de l'automne, pour une pâte finale à 22-25 °C.", src: "Manuel Niveau I, p. 21" },
    { t: "qcm", d: "difficile", q: "Farine à 10 °C (hiver) : quelle température pour l'eau de coulage ?",
      c: ["30 °C", "40 °C", "20 °C", "25 °C"], a: 0,
      expl: "10 × 2 = 20, puis 50 − 20 = 30 °C. La pâte finale se situe alors entre 22 et 27 °C.", src: "Manuel Niveau I, p. 21" },
    { t: "qcm", d: "difficile", q: "En été, une farine à 28 °C donne un résultat de −6 °C. Que conseille le manuel ?",
      c: ["Mettre tout ou partie de la farine au frais la veille", "Utiliser de la glace pilée à la place de l'eau", "Réduire de moitié la dose de levure", "Pétrir deux fois moins longtemps"], a: 0,
      expl: "Le calcul donne une eau impossible : il faut anticiper en refroidissant la farine la veille pour minimiser les risques.", src: "Manuel Niveau I, p. 21" },
    { t: "assoc", d: "difficile", q: "Associe chaque saison à sa température d'eau de coulage :",
      pairs: [["Été (farine 24 °C)", "2 °C"], ["Printemps/automne (farine 17 °C)", "16 °C"], ["Hiver (farine 10 °C)", "30 °C"]],
      expl: "Chaque fois : température de la farine × 2, retranchée de 50. Plus la farine est chaude, plus l'eau doit être froide pour compenser.", src: "Manuel Niveau I, p. 21" },
    { t: "vf", d: "normal", q: "La température de base sert à obtenir une température de pâte régulière en fin de pétrissage.", a: true,
      expl: "C'est un gage de régularité dans le déroulement de l'activité fermentaire et du travail de la pâte.", src: "Manuel Niveau I, p. 21" },
  ] },

  /* ------------------------------------------------------------------ 8 */
  { title: "Le sel", ic: "salt", q: [
    { t: "qcm", d: "difficile", q: "Quelle est la dose usuelle de sel par kilo de farine ?",
      c: ["17 à 22 g", "10 à 15 g", "25 à 30 g", "2 à 4 g"], a: 0,
      expl: "17 à 22 g au kilo. Les 2 à 4 g sont la dose de LEVURE fraîche : c'est la confusion à ne pas faire.", src: "Manuel Niveau I, p. 22" },
    { t: "qcm", d: "facile", q: "Quel est l'effet du sel sur la fermentation ?",
      c: ["Il la freine et la régularise", "Il l'accélère", "Il n'a aucun effet", "Il la stoppe complètement"], a: 0,
      expl: "Le sel brûle les cellules de levure et diminue le développement de l'anhydride carbonique : il freine et régularise la fermentation.", src: "Manuel Niveau I, p. 22" },
    { t: "qcm", d: "facile", q: "D'où provient le sel GEMME ?",
      c: ["Des mines et carrières", "Des marais salants", "De l'évaporation de l'eau de mer", "Des sources thermales"], a: 0,
      expl: "Le sel gemme vient de dépôts géologiques exploités en mines ou carrières ; le sel marin, lui, est recueilli par évaporation dans les marais salants.", src: "Manuel Niveau I, p. 22" },
    { t: "qcm", d: "difficile", q: "Que signifie « le sel est hygroscopique » ?",
      c: ["Il absorbe l'humidité de l'air", "Il absorbe l'humidité d'un corps", "Il repousse l'eau", "Il se dissout instantanément"], a: 0,
      expl: "Hygroscopique = absorbe l'humidité de l'AIR. La dessiccation, elle, absorbe l'humidité d'un CORPS — deux termes du lexique qu'on inverse souvent.", src: "Manuel Niveau I, lexique p. 43-44" },
    { t: "vf", d: "normal", q: "Le sel renforce la maille glutamique.", a: true,
      expl: "En eau salée, la gliadine est moins soluble et il se forme une plus grande quantité de gluten, aux fibres plus courtes liées par attraction électrostatique.", src: "Manuel Niveau I, p. 22" },
    { t: "vf", d: "difficile", q: "Le sel accélère l'oxydation de la pâte.", a: false,
      expl: "Il la RETARDE : la pâte reste blanche grâce à ses propriétés antioxydantes.", src: "Manuel Niveau I, p. 22" },
    { t: "assoc", d: "normal", q: "Associe chaque propriété du sel à son effet :",
      pairs: [["Antiseptique", "Brûle les micro-organismes"], ["Hygroscopique", "Permet d'hydrater davantage"], ["Sur la croûte", "Coloration et croustillant"]],
      expl: "Le sel n'est pas qu'un assaisonnement : il agit sur la tenue, la conservation et la cuisson.", src: "Manuel Niveau I, p. 22" },
  ] },

  /* ------------------------------------------------------------------ 9 */
  { title: "L'huile d'olive", ic: "oil", q: [
    { t: "qcm", d: "normal", q: "Quel est le rôle principal de l'huile dans un empâtement direct ?",
      c: ["Figer le pâton et éviter qu'il ne s'affaisse", "Accélérer la fermentation", "Remplacer une partie de l'eau", "Blanchir la mie"], a: 0,
      expl: "L'huile fige le pâton durant sa maturation en chambre froide et le maintient rond pendant 1 à 5 jours. Elle lubrifie aussi la pâte et lui donne souplesse et élasticité.", src: "Manuel Niveau I, p. 23" },
    { t: "vf", d: "normal", q: "La pizza napolitaine reconnue par l'UNESCO contient de l'huile d'olive.", a: false,
      expl: "Elle n'en contient pas : la pâte napolitaine est faite pour être utilisée très rapidement, sans longue maturation — donc sans huile pour tenir le pâton.", src: "Manuel Niveau I, p. 23" },
    { t: "qcm", d: "difficile", q: "Quel est le seuil d'acidité d'une huile d'olive EXTRA VIERGE ?",
      c: ["Inférieure à 0,8 %", "Maximum 2 %", "Supérieure à 3,3 %", "Inférieure à 1,5 %"], a: 0,
      expl: "Extra vierge : moins de 0,8 %. La vierge monte à 2 % maximum, et le premier prix dépasse 3,3 %.", src: "Manuel Niveau I, p. 24" },
    { t: "qcm", d: "facile", q: "Quel rang l'huile occupe-t-elle parmi les ingrédients d'une pâte à pizza ?",
      c: ["Le 5ᵉ, et elle n'est pas indispensable", "Le 2ᵉ, elle est indispensable", "Le 3ᵉ, elle remplace le sel", "Le 1ᵉʳ, avant la farine"], a: 0,
      expl: "Le manuel la présente comme le cinquième élément — et précise qu'elle n'est pas indispensable, la napolitaine s'en passant.", src: "Manuel Niveau I, p. 23" },
    { t: "qcm", d: "normal", q: "Combien de temps dure la maturation d'un pâton en chambre froide selon le manuel ?",
      c: ["1 à 5 jours", "12 à 24 heures", "5 à 10 jours", "1 à 2 heures"], a: 0,
      expl: "De 1 à 5 jours : c'est précisément ce que l'huile permet de tenir en maintenant les pâtons ronds.", src: "Manuel Niveau I, p. 23" },
    { t: "assoc", d: "difficile", q: "Associe chaque huile à son acidité :",
      pairs: [["Extra vierge", "< 0,8 %"], ["Vierge", "≤ 2 %"], ["1er prix", "> 3,3 %"]],
      expl: "L'acidité va de pair avec les défauts organoleptiques : nuls pour l'extra vierge, 3,5/10 pour la vierge, 6/10 pour le premier prix.", src: "Manuel Niveau I, p. 24" },
  ] },

  /* ------------------------------------------------------------------ 10 */
  { title: "Substitutions & adjonctions", ic: "shuffle", q: [
    { t: "qcm", d: "facile", q: "Qu'est-ce qu'une SUBSTITUTION ?",
      c: ["Remplacer une partie de la farine de blé par une autre farine", "Ajouter un produit à la pâte pendant le pétrissage", "Remplacer l'eau par du lait", "Diminuer la dose de levure"], a: 0,
      expl: "La substitution remplace une part du poids de farine initiale. L'ADJONCTION, elle, ajoute un produit mélangé pendant le pétrissage.", src: "Manuel Niveau I, p. 25-26" },
    { t: "qcm", d: "normal", q: "Comment nomme-t-on l'eau ajoutée en fin de pétrissage pour corriger la texture ?",
      c: ["L'eau de bassinage", "L'eau de coulage", "L'eau de frasage", "L'eau de rabat"], a: 0,
      expl: "L'eau de bassinage se rajoute en fin de pétrissage, notamment quand une farine de substitution a asséché la pâte.", src: "Manuel Niveau I, p. 25" },
    { t: "qcm", d: "difficile", q: "Pour 10 % de farine de SOJA, quel complément d'eau par unité de calcul ?",
      c: ["30 g", "40 g", "20 g", "50 g"], a: 0,
      expl: "30 g pour le soja et la semi-complète, mais 40 g pour la farine complète : c'est cette distinction que la question teste.", src: "Manuel Niveau I, p. 25" },
    { t: "qcm", d: "normal", q: "Quel pourcentage de pâte fermentée le manuel recommande-t-il en adjonction ?",
      c: ["10 à 30 %", "3 à 6 %", "1 à 2 %", "4 %"], a: 0,
      expl: "10 à 30 %, à la 8ᵉ minute. Les 3-6 % sont les graines torréfiées, les 1-2 % le charbon végétal, les 4 % le Naturkraft.", src: "Manuel Niveau I, p. 26" },
    { t: "qcm", d: "normal", q: "À quel moment incorpore-t-on les graines torréfiées ?",
      c: ["Avant le sel, à la 10ᵉ minute", "À la 8ᵉ minute", "Avec la farine", "Après l'huile, à la 12ᵉ minute"], a: 0,
      expl: "Avant le sel (10 mn). La pâte fermentée entre à la 8ᵉ minute, le son après l'huile (12 mn), le Naturkraft et le charbon végétal avec la farine.", src: "Manuel Niveau I, p. 26" },
    { t: "vf", d: "difficile", q: "Le pourcentage d'une adjonction se calcule sur le poids TOTAL de la pâte.", a: false,
      expl: "Non : il porte toujours sur la quantité de FARINE. Calculer sur le poids total donnerait des doses nettement plus fortes, l'eau représentant plus de la moitié du poids de farine.", src: "Manuel Niveau I, p. 26" },
    { t: "assoc", d: "difficile", q: "Associe chaque adjonction à son dosage :",
      pairs: [["Graines torréfiées", "3 à 6 %"], ["Pâte fermentée", "10 à 30 %"], ["Naturkraft", "4 %"], ["Son", "1 %"]],
      expl: "Les ordres de grandeur sont très différents : la pâte fermentée se compte en dizaines de pour cent, le son en unités.", src: "Manuel Niveau I, p. 26" },
  ] },

  /* ------------------------------------------------------------------ 11 */
  { title: "Le protocole d'empâtement direct", ic: "clock", q: [
    { t: "qcm", d: "normal", q: "Que met-on dans le pétrin lors de la 1ʳᵉ phase ?",
      c: ["La farine et la levure, 1 minute", "L'eau et le sel", "La farine et l'huile", "L'eau seule"], a: 0,
      expl: "Farine et levure une minute : c'est le temps d'oxygénation. L'eau vient ensuite, le sel et l'huile en dernier.", src: "Manuel Niveau I, p. 28" },
    { t: "qcm", d: "difficile", q: "Combien de temps pétrit-on après avoir versé l'eau ?",
      c: ["12 minutes en petite vitesse", "8 minutes en grande vitesse", "2 à 3 minutes", "20 minutes en petite vitesse"], a: 0,
      expl: "12 minutes en petite vitesse. Les 2-3 minutes correspondent à la phase finale, après le sel et l'huile.", src: "Manuel Niveau I, p. 28" },
    { t: "qcm", d: "normal", q: "Dans quel ordre le sel et l'huile entrent-ils ?",
      c: ["Le sel petit à petit, puis l'huile 1 minute après", "L'huile d'abord, puis le sel", "Les deux en même temps", "Le sel avec la farine, l'huile avec l'eau"], a: 0,
      expl: "Le sel se verse petit à petit, pétrin en marche ; l'huile d'olive arrive au bout d'une minute. On pétrit ensuite 2 à 3 minutes.", src: "Manuel Niveau I, p. 28" },
    { t: "qcm", d: "normal", q: "Qu'est-ce que le POINTAGE ?",
      c: ["La première phase de fermentation, en masse", "Le repos des pâtons après boulage", "La mise en forme du disque", "Le premier mélange des ingrédients"], a: 0,
      expl: "Le pointage est la première fermentation, en masse et à température ambiante, juste après le pétrissage. Le façonnage met en forme, le frasage mélange.", src: "Manuel Niveau I, p. 28 et lexique" },
    { t: "qcm", d: "difficile", q: "Quel temps de pointage pour un été chaud et humide ?",
      c: ["10 à 15 minutes", "15 à 30 minutes", "20 à 40 minutes", "5 minutes"], a: 0,
      expl: "10 à 15 minutes en été, 15 à 30 au printemps et en automne, 20 à 40 en hiver : plus il fait chaud, plus le pointage est court.", src: "Manuel Niveau I, p. 28" },
    { t: "qcm", d: "difficile", q: "À quelle température bloque-t-on les bacs de pâtons ?",
      c: ["3 à 4 °C", "0 à 1 °C", "6 à 8 °C", "10 à 12 °C"], a: 0,
      expl: "3 à 4 °C, dans des bacs Gilac 60 × 40 après division, pesée et boulage.", src: "Manuel Niveau I, p. 28" },
    { t: "qcm", d: "facile", q: "Combien de pâtons de 280 g obtient-on avec 1 unité de calcul ?",
      c: ["environ 6", "environ 3", "environ 10", "environ 12"], a: 0,
      expl: "Une unité de calcul — 1 kg de farine et ses ingrédients — donne environ 6 pâtons de 280 g.", src: "Manuel Niveau I, p. 27" },
    { t: "assoc", d: "difficile", q: "Associe chaque saison à son temps de pointage :",
      pairs: [["Été chaud et humide", "10 à 15 mn"], ["Printemps / automne", "15 à 30 mn"], ["Hiver", "20 à 40 mn"]],
      expl: "Plus il fait chaud, plus la fermentation est vive : le pointage se raccourcit d'autant.", src: "Manuel Niveau I, p. 28" },
    { t: "vf", d: "normal", q: "Il faut garder un verre d'eau de côté au moment de verser l'eau de coulage.", a: true,
      expl: "On garde toujours un peu d'eau pour le bassinage, afin de rattraper la texture en fin de pétrissage.", src: "Manuel Niveau I, p. 28" },
  ] },

  /* ------------------------------------------------------------------ 12 */
  { title: "Matières premières & quantités", ic: "utensils", q: [
    { t: "qcm", d: "difficile", q: "Quel poids de pâton pour une pizza de Ø 33 cm ?",
      c: ["280 à 300 g", "200 à 220 g", "240 à 260 g", "1100 à 1300 g"], a: 0,
      expl: "280-300 g pour un Ø 33. Le Ø 26 demande 200-220 g, le Ø 29 240-260 g, et la plaque 40 × 60 monte à 1100-1300 g.", src: "Manuel Niveau I, p. 30" },
    { t: "qcm", d: "normal", q: "Quelle quantité de sauce tomate pour une pizza de Ø 26 cm ?",
      c: ["80 g", "50 g", "100 g", "120 g"], a: 0,
      expl: "80 g pour un Ø 26, 90 g pour un Ø 29, 100 g pour un Ø 33. Les 50 g correspondent à la crème, pas à la tomate.", src: "Manuel Niveau I, p. 30" },
    { t: "qcm", d: "difficile", q: "Dans la recette de sauce tomate, quelle quantité de sel pour 10 kg de tomate ?",
      c: ["120 g", "80 g", "200 g", "40 g"], a: 0,
      expl: "120 g de sel, autant d'huile d'olive et autant de basilic frais. L'origan (8 g) et le sucre (40-80 g) restent facultatifs.", src: "Manuel Niveau I, p. 33" },
    { t: "qcm", d: "normal", q: "Combien de temps se conserve la sauce tomate préparée ?",
      c: ["3 jours", "24 heures", "1 semaine", "48 heures"], a: 0,
      expl: "3 jours au frais. La bolognaise, elle, se garde 48 heures maximum entre 2 et 4 °C.", src: "Manuel Niveau I, p. 32-33" },
    { t: "qcm", d: "facile", q: "Quelle crème le manuel conseille-t-il d'utiliser en priorité ?",
      c: ["La liquide ou celle de liaison", "L'épaisse", "La crème allégée", "La crème montée"], a: 0,
      expl: "Liquide ou de liaison : elles épaississent à la cuisson avec une quantité moindre que l'épaisse, et se dosent au biberon.", src: "Manuel Niveau I, p. 29" },
    { t: "vf", d: "difficile", q: "La crème se dépose du bord de la corniche vers le centre, en spirale.", a: true,
      expl: "À l'inverse de la sauce tomate. Elle se met après tous les ingrédients, juste avant d'enfourner.", src: "Manuel Niveau I, p. 29" },
    { t: "assoc", d: "normal", q: "Associe chaque format de pizza à son poids de pâton :",
      pairs: [["Ø 26 cm", "200 à 220 g"], ["Ø 29 cm", "240 à 260 g"], ["Ø 33 cm", "280 à 300 g"], ["Plaque 40 × 60", "1100 à 1300 g"]],
      expl: "Le poids suit la surface, pas le diamètre : une plaque 40 × 60 demande cinq fois le pâton d'un Ø 26.", src: "Manuel Niveau I, p. 30" },
    { t: "qcm", d: "normal", q: "Combien de temps les pommes de terre déjà pelées se gardent-elles au frais ?",
      c: ["1 à 2 jours", "3 à 4 jours", "1 semaine", "quelques heures"], a: 0,
      expl: "1 à 2 jours seulement. C'est pourquoi on les cuit avec la peau et on ne pèle que la quantité nécessaire avant le service.", src: "Manuel Niveau I, p. 34" },
  ] },

  /* ------------------------------------------------------------------ 13 */
  { title: "La cuisson & les fours", ic: "flame", q: [
    { t: "qcm", d: "facile", q: "Entre quelles températures se situe la cuisson d'une pizza ?",
      c: ["320 à 450 °C", "180 à 250 °C", "250 à 300 °C", "500 à 600 °C"], a: 0,
      expl: "De 320 °C pour la plaque à 450 °C pour la napolitaine — bien au-delà d'un four domestique.", src: "Manuel Niveau I, p. 38" },
    { t: "qcm", d: "difficile", q: "Quelle température pour une pizza NAPOLITAINE ?",
      c: ["400 à 450 °C", "320 à 360 °C", "360 à 380 °C", "320 °C"], a: 0,
      expl: "400-450 °C. La classique cuit à 320-360 °C, la contemporaine à 360-380 °C, la plaque à 320 °C : quatre plages voisines à ne pas confondre.", src: "Manuel Niveau I, p. 38" },
    { t: "qcm", d: "normal", q: "Comment se nomme la chaleur transmise par contact direct avec la sole ?",
      c: ["La conduction", "La convection", "Le rayonnement", "La diffusion"], a: 0,
      expl: "Conduction = contact direct avec la sole. La convection passe par l'air chaud, le rayonnement par la voûte.", src: "Manuel Niveau I, p. 38 et lexique" },
    { t: "qcm", d: "facile", q: "Comment se nomme la partie SUPÉRIEURE intérieure du four ?",
      c: ["La voûte", "La sole", "La corniche", "La chambre"], a: 0,
      expl: "La voûte est en haut, la sole en bas — c'est sur la sole qu'on dépose la pizza. La corniche, elle, est le bord de la pizza.", src: "Manuel Niveau I, lexique p. 45-46" },
    { t: "qcm", d: "difficile", q: "Combien de fois par an un four à bois doit-il être ramoné ?",
      c: ["2 fois", "1 fois", "4 fois", "3 fois"], a: 0,
      expl: "Deux ramonages par an, facture à l'appui pour l'assurance. C'est l'une des contraintes du four à bois, avec la sécurité des locaux et le conduit isolé réglementé.", src: "Manuel Niveau I, p. 39" },
    { t: "qcm", d: "difficile", q: "Four électrique à 360 °C de voûte et 310 °C de sole : quel temps de cuisson ?",
      c: ["3 min 30", "4 minutes", "5 minutes", "2 minutes"], a: 0,
      expl: "3 min 30. À 340/300 il faut 4 minutes, à 320/290 cinq minutes : plus la température monte, plus la cuisson raccourcit.", src: "Manuel Niveau I, p. 41" },
    { t: "qcm", d: "facile", q: "Quel est l'avantage d'un four à sole ROTATIVE ?",
      c: ["Il évite d'avoir à tourner les pizzas", "Il consomme moins d'électricité", "Il cuit à plus basse température", "Il ne nécessite aucun entretien"], a: 0,
      expl: "Plus besoin de faire la rotation des pizzas dans le four, et un gain de place puisque le foyer passe sur le côté de la sole.", src: "Manuel Niveau I, p. 39-41" },
    { t: "vf", d: "difficile", q: "Un four hybride permet d'utiliser le bois OU le gaz, au choix selon le service.", a: false,
      expl: "Non : les fours hybrides ne peuvent utiliser ces deux énergies que SIMULTANÉMENT, en gardant les caractéristiques de chacun.", src: "Manuel Niveau I, p. 40" },
    { t: "assoc", d: "difficile", q: "Associe chaque type de pizza à sa température de cuisson :",
      pairs: [["Classique", "320 à 360 °C"], ["Contemporaine", "360 à 380 °C"], ["Napolitaine", "400 à 450 °C"], ["Plaque", "320 °C"]],
      expl: "Quatre plages voisines : c'est la napolitaine qui monte le plus haut, pour une cuisson très courte.", src: "Manuel Niveau I, p. 38" },
    { t: "assoc", d: "normal", q: "Associe chaque mode de transmission de la chaleur à sa source :",
      pairs: [["Rayonnement", "La voûte du four"], ["Convection", "L'air chaud de la chambre"], ["Conduction", "La sole, par contact"]],
      expl: "Les trois agissent ensemble : c'est leur équilibre qui fait une cuisson réussie.", src: "Manuel Niveau I, p. 38" },
  ] },

  /* ------------------------------------------------------------------ 14 */
  { title: "Les pétrins", ic: "refresh", q: [
    { t: "qcm", d: "difficile", q: "Quelle quantité de pâte un pétrin à SPIRALE permet-il de travailler ?",
      c: ["10 à 60 kg", "10 à 80 kg", "50 à 150 kg", "5 à 20 kg"], a: 0,
      expl: "10 à 60 kg pour la spirale, 10 à 80 kg pour l'axe oblique, 50 à 150 kg pour les bras plongeants.", src: "Manuel Niveau I, p. 42" },
    { t: "qcm", d: "facile", q: "Quel pétrin est le plus RAPIDE ?",
      c: ["Le pétrin à spirale", "Le pétrin à axe oblique", "Le pétrin à bras plongeants", "Ils ont tous la même vitesse"], a: 0,
      expl: "La spirale est la plus rapide : elle accélère la formation de la maille gluténique, mais échauffe davantage la pâte et impose des temps de pétrissage plus courts et plus précis.", src: "Manuel Niveau I, p. 42" },
    { t: "qcm", d: "difficile", q: "Le pétrin à axe oblique est combien de fois plus lent que la spirale ?",
      c: ["2 fois", "3 fois", "1,5 fois", "4 fois"], a: 0,
      expl: "Deux fois plus lent. Ses bras soulèvent la pâte et l'oxygènent davantage, ce qui développe une mie très aérée.", src: "Manuel Niveau I, p. 42" },
    { t: "qcm", d: "normal", q: "Quel pétrin reproduit au plus près les gestes du pizzaïolo ?",
      c: ["Le pétrin à bras plongeants", "Le pétrin à spirale", "Le pétrin à axe oblique", "Le laminoir"], a: 0,
      expl: "Les bras plongeants, conseillés pour les gros volumes. Le laminoir, lui, ne pétrit pas : il étale la pâte.", src: "Manuel Niveau I, p. 42 et lexique" },
    { t: "assoc", d: "difficile", q: "Associe chaque pétrin à la quantité de pâte qu'il travaille :",
      pairs: [["À spirale", "10 à 60 kg"], ["À axe oblique", "10 à 80 kg"], ["À bras plongeants", "50 à 150 kg"]],
      expl: "Les bras plongeants sont réservés aux gros volumes ; la spirale, la plus rapide, plafonne plus bas.", src: "Manuel Niveau I, p. 42" },
    { t: "vf", d: "normal", q: "Une tête relevable facilite la sortie de la pâte et le nettoyage du pétrin.", a: true,
      expl: "Elle permet aussi d'enlever la cuve pour l'entretien — mais elle est plus onéreuse que la tête fixe.", src: "Manuel Niveau I, p. 42" },
    { t: "vf", d: "difficile", q: "Le pétrin à spirale donne une mie plus irrégulière que l'axe oblique.", a: false,
      expl: "C'est le contraire : la spirale donne un empâtement plus lisse avec une mie plus RÉGULIÈRE. C'est l'axe oblique qui produit une mie très aérée.", src: "Manuel Niveau I, p. 42" },
  ] },

  /* ------------------------------------------------------------------ 15 */
  { title: "Organisation & tenue professionnelle", ic: "clipboard-check", q: [
    { t: "qcm", d: "difficile", q: "À quelle température les pâtons doivent-ils être sortis avant le service ?",
      c: ["15 à 18 °C", "3 à 4 °C", "22 à 24 °C", "10 à 12 °C"], a: 0,
      expl: "15 à 18 °C : c'est ce qui donne la facilité d'étalage et une bonne levée à la cuisson. Les 3-4 °C sont la température de BLOCAGE des bacs, pas celle du service.", src: "Manuel Niveau I, p. 37" },
    { t: "qcm", d: "facile", q: "Que signifie le sigle PEPS ?",
      c: ["Premier Entré Premier Sorti", "Préparation En Portions Simples", "Plan d'Entretien du Poste de Service", "Produit Emballé Prêt à Servir"], a: 0,
      expl: "Premier Entré Premier Sorti : la règle de rotation des stocks, à surveiller pour toute la mise en place.", src: "Manuel Niveau I, p. 37" },
    { t: "qcm", d: "facile", q: "Quel bijou est toléré en cuisine ?",
      c: ["L'alliance", "La montre", "Les bagues", "Les bracelets"], a: 0,
      expl: "Pas de bijoux, hors alliance. Il est par ailleurs interdit de fumer dans les locaux.", src: "Manuel Niveau I, p. 2" },
    { t: "qcm", d: "facile", q: "Quel élément ne fait PAS partie de la tenue professionnelle listée ?",
      c: ["La toque", "Le tablier", "Les chaussures de sécurité", "Le torchon"], a: 0,
      expl: "La tenue se compose d'une veste blanche (ou tee-shirt/polo), d'un pantalon de cuisine, de chaussures de sécurité, d'un tablier et d'un torchon.", src: "Manuel Niveau I, p. 2" },
    { t: "qcm", d: "normal", q: "Que désigne le FLEURAGE ?",
      c: ["Déposer une fine couche de farine sur le plan de travail", "Replier la pâte sur elle-même", "Étirer la pâte en disque", "Garnir la pizza"], a: 0,
      expl: "Le fleurage favorise la glisse au moment de placer la pizza sur la pelle. Replier la pâte, c'est le RABAT ; l'étirer, c'est abaisser.", src: "Manuel Niveau I, lexique p. 44" },
    { t: "qcm", d: "difficile", q: "Qu'est-ce que le FRASAGE ?",
      c: ["La première étape du pétrissage : mélange lent et grossier", "Le repos de la pâte après pétrissage", "La mise en boule des pâtons", "Le passage au laminoir"], a: 0,
      expl: "Le frasage mélange lentement et grossièrement farine, eau et levure. Le repos qui suit le pétrissage est le POINTAGE, la mise en boule le BOULAGE.", src: "Manuel Niveau I, lexique p. 44" },
  ] },
];

/* -------------------------------------------------------------------------- */

const esc = (v) => (v == null || v === ''
    ? 'NULL'
    : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);

const out = [];
const p = (s = '') => out.push(s);

const nbQ = CHAPITRES.reduce((n, c) => n + c.q.length, 0);
const parType = CHAPITRES.flatMap((c) => c.q).reduce((m, q) => ({ ...m, [q.t]: (m[q.t] || 0) + 1 }), {});
const parDiff = CHAPITRES.flatMap((c) => c.q).reduce((m, q) => ({ ...m, [q.d]: (m[q.d] || 0) + 1 }), {});

p(`/* 105_seed_quest_niv1_manuel.sql — DONNÉES (à jouer APRÈS 102_quest_questions.sql).

   Banque « Niveau I » tirée du Manuel Technique Niveau I (mise à jour du 14/01/2026).
   ${CHAPITRES.length} chapitres, ${nbQ} questions — ${parType.qcm || 0} QCM, ${parType.vf || 0} vrai/faux, ${parType.assoc || 0} associations.
   Difficultés : ${parDiff.facile || 0} faciles, ${parDiff.normal || 0} normales, ${parDiff.difficile || 0} difficiles.

   Chaque réponse est vérifiable dans le manuel, à la page indiquée par la source. Les
   fourchettes du manuel sont reprises telles quelles (« 17 à 22 g » et non « 20 g »).

   LA DIFFICULTÉ TIENT AUX LEURRES, pas à l'énoncé — c'est la règle de rédaction du manuel
   lui-même : une mauvaise réponse absurde s'élimine sans rien connaître, et la question ne
   teste plus rien.
     · facile    : les leurres viennent d'un autre domaine ; avoir lu le chapitre suffit.
     · normal    : les leurres sont des valeurs réelles du métier, mais d'un autre usage
                   (la dose de sel proposée pour la levure).
     · difficile : les leurres sont les valeurs VOISINES de la bonne (54 % contre 55 %,
                   38 °C contre 50 °C), ou demandent un calcul. Rien ne se devine.

   Fichier GÉNÉRÉ par database/tools/export-quest-niv1-manuel.mjs — ne pas éditer à la main :
   modifiez le script et relancez-le, ou éditez ensuite depuis l'application.

   ┌─ À RENSEIGNER AVANT DE JOUER ─────────────────────────────────────────────────────┐
   │ @org  : l'UUID de votre organisme                                                 │
   │ @prog : l'UUID de la formation Niveau I qui reçoit ces chapitres                  │
   └───────────────────────────────────────────────────────────────────────────────────┘
     SELECT id, legal_name FROM organization;
     SELECT id, code, title FROM training_program WHERE organization_id = '…' ORDER BY code;

   Les difficultés sont reprises par SLUG (facile / normal / difficile), telles que créées
   par 102_seed_quest_questions.sql. Absentes, les questions prennent l'XP par défaut.

   Rejouable : chaque chapitre est supprimé puis réinséré (questions et options suivent par
   cascade). Vos retouches sur CES chapitres seraient donc écrasées. */
`);

p(`/* ---- Cibles de l'import ------------------------------------------------------------ */`);
p(`SET @org  = 'REMPLACER-PAR-UUID-ORGANISME';`);
p(`SET @prog = 'REMPLACER-PAR-UUID-FORMATION-NIVEAU-I';`);
p();
p(`SET @d_facile    = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'facile'    LIMIT 1);`);
p(`SET @d_normal    = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'normal'    LIMIT 1);`);
p(`SET @d_difficile = (SELECT id FROM quest_difficulty WHERE organization_id = @org AND slug = 'difficile' LIMIT 1);`);
p();

const VAR_DIFF = { facile: '@d_facile', normal: '@d_normal', difficile: '@d_difficile' };
let ordreCh = 0;

for (const ch of CHAPITRES) {
    ordreCh += 10;
    const stats = ch.q.reduce((m, q) => ({ ...m, [q.d]: (m[q.d] || 0) + 1 }), {});
    p(`/* -- ${ch.title} — ${ch.q.length} questions (${stats.facile || 0} F / ${stats.normal || 0} N / ${stats.difficile || 0} D) */`);
    p(`DELETE FROM quest_chapter WHERE organization_id = @org AND title = ${esc(ch.title)};`);
    p(`SET @ch = uuid();`);
    p(`INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order)
    VALUES (@ch, @org, @prog, ${esc(ch.title)}, ${esc(ch.ic)}, ${ordreCh});`);
    p();

    let pos = 0;
    for (const q of ch.q) {
        pos += 10;
        const type = q.t === 'vf' ? 'VF' : q.t === 'assoc' ? 'ASSOC' : 'QCM';
        const vf = type === 'VF' ? (q.a ? 1 : 0) : 'NULL';
        p(`SET @q = uuid();`);
        p(`INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, vf_answer, sort_order)
    VALUES (@q, @org, @ch, '${type}', ${esc(q.q)}, ${esc(q.expl)}, ${esc(q.src)}, ${VAR_DIFF[q.d]}, ${vf}, ${pos});`);
        if (type === 'QCM') {
            const rows = q.c.map((c, i) => `    (@q, ${(i + 1) * 10}, ${esc(c)}, ${i === q.a ? 1 : 0})`).join(',\n');
            p(`INSERT INTO quest_option (question_id, sort_order, text, is_correct) VALUES\n${rows};`);
        } else if (type === 'ASSOC') {
            const rows = q.pairs.map(([g, d], i) => `    (@q, ${(i + 1) * 10}, ${esc(g)}, ${esc(d)}, 1)`).join(',\n');
            p(`INSERT INTO quest_option (question_id, sort_order, text, match_text, is_correct) VALUES\n${rows};`);
        }
        p();
    }
}

p(`/* ---- Contrôle ----------------------------------------------------------------------- */`);
p(`/* Décommentez pour vérifier l'import :
SELECT c.title AS chapitre, COUNT(q.id) AS questions
  FROM quest_chapter c LEFT JOIN quest_question q ON q.chapter_id = c.id
 WHERE c.organization_id = @org AND c.program_id = @prog
 GROUP BY c.id ORDER BY c.sort_order; */`);

// N'écrit le SQL que si le script est LANCÉ (pas s'il est importé pour vérification).
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.stdout.write(out.join('\n') + '\n');
}

/**
 * LES EMPÂTEMENTS INDIRECTS — Poolish, Biga, pizza contemporaine.
 *
 * Utilisé par le Niveau II et par la première partie du Niveau Expert.
 *
 * Deux défauts du manuel Niveau II d'origine sont corrigés ici, et signalés
 * dans A-VERIFIER.md :
 *  · la page « Différences entre les empâtements » existait EN DOUBLE (p. 34
 *    et p. 35 du PDF), avec une note de digestibilité différente d'une copie à
 *    l'autre — impossible de savoir laquelle faisait foi ;
 *  · le « Quiz des farines » existait lui aussi en deux versions, cinq mêmes
 *    questions reformulées, l'une derrière l'autre.
 */
import { chapitre, cote, photo, duo, enc, tbl, averif, reperes, proto, bilan } from "../gabarit.mjs";

/* ===========================================================================
   POOLISH & BIGA — la comparaison d'entrée
   =========================================================================== */
export const poolishEtBiga = (m) => m.p(`
${chapitre(m.chapSuivant(), "Poolish &amp; Biga",
  "Deux méthodes indirectes. Une même idée&nbsp;: faire travailler une partie de la pâte AVANT de la pâte elle-même.")}
        <p class="intro">Les termes « Biga » et « Poolish » sont de plus en plus souvent utilisés
        dans le monde de la pizza. Il s'agit de <strong>deux méthodes différentes</strong> de
        préparation de la pâte.</p>
        <p>Il y a de nombreux avantages à utiliser la méthode indirecte plutôt que la méthode
        directe&nbsp;: un <strong>meilleur goût</strong> et des arômes plus intenses, une
        <strong>digestion supérieure</strong>, et un développement plus franc durant la cuisson.</p>
${tbl(["Empâtement", "Méthode", ["Étapes", "c"], "Ce que l'on fait"], [
    [["<strong>Direct</strong>", ""], "Direct", ["<span class='val'>1</span>", "c"],
     "Mélanger tous les ingrédients en une seule fois."],
    [["<strong>Biga</strong> &amp; <strong>Poolish</strong>", ""], "Indirect", ["<span class='val'>2</span>", "c"],
     "<strong>1<sup>re</sup> phase</strong> — préparer une pâte (un pré-ferment) avec de la farine, de l'eau et de la levure, laissée à température ambiante.<br><strong>2<sup>e</sup> phase</strong> — mélanger cette première phase avec tous les autres ingrédients pour former la pâte."],
  ], { titre: "Direct, indirect : la seule vraie différence" })}
        <p>En conclusion, la Biga et le Poolish sont deux techniques très utiles pour améliorer la
        qualité et les saveurs des pizzas <strong>en un temps plus court que l'empâtement
        direct</strong>. Utilisées correctement, elles donnent des résultats surprenants en termes de
        texture, de goût et de digestibilité. Il faut pour cela prendre en compte la qualité de la
        farine, la température de fermentation, le temps de maturation et les proportions des
        ingrédients.</p>
${enc("conseil", "Le prérequis qu'on oublie", `<p>Un indirect demande une farine
        <strong>W 330 minimum</strong>. En dessous, le réseau ne tient pas seize heures de
        pré-fermentation&nbsp;: la pâte se liquéfie et rien ne la rattrape.</p>`)}
${photo("gluten-reseau", "Réseau de gluten très développé, étiré à la main",
  "Un indirect bien mené se reconnaît au réseau&nbsp;: fin, translucide, il s'étire sans se déchirer.")}
`, { chap: "Poolish & Biga", num: m._c });

/* ===========================================================================
   POOLISH
   =========================================================================== */
export const poolish = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Le Poolish", "Un pré-ferment LIQUIDE&nbsp;: autant d'eau que de farine, très peu de levure, 12 à 15 heures.")}
${cote(`
          <p>L'empâtement poolish est une technique de fermentation utilisée dans la production de
          pizza. Il s'agit d'une <strong>pré-fermentation lente</strong> qui consiste à mélanger de
          la farine, de l'eau et de la levure pour former une pâte <strong>sous forme
          liquide</strong>.</p>
          <p>Cette pâte est laissée à fermenter pendant <strong>12 à 15 heures</strong> avant d'être
          mélangée avec le reste des ingrédients.</p>
          <p>L'utilisation d'un poolish ajoute de la saveur et de la texture, facilite la levée et
          l'alvéolage lors de la cuisson, et améliore la conservation de la pâte.</p>`,
  "poolish-verre", "Verre gradué marqué 0 H, 3 H, 9 H, 12 H pour suivre la pousse du poolish")}
        <p class="legende" style="margin-top:-2mm">Le verre gradué&nbsp;: le seul moyen fiable de
        savoir où en est un poolish. On repère le niveau à 0 h, et on lit la pousse.</p>
${bilan([
    "Extensibilité de la pâte",
    "Goût très prononcé",
    "Pâte croustillante",
    "Alvéolage de la mie très développé",
    "Bonne digestibilité",
  ], [
    "Doit être utilisé dans les 3 jours",
    "Très instable pendant les périodes chaudes",
    "Organisation en deux phases à anticiper",
    "Il double, voire triple, de volume en 1<sup>re</sup> phase — <strong>risque de débordement du pétrin</strong>",
  ])}
        <p class="mention">Comparaison faite à taux d'hydratation égal.</p>
`, { chap: "Le Poolish", num: n });

  m.p(`
        <h3 class="sec">Protocole — au pétrin à spirale (10 à 30 litres)</h3>
${reperes([["Farine 1<sup>re</sup> phase", "= poids", "de l'eau"], ["Levure 1<sup>re</sup> phase", "2/3", "du total"], ["Repos", "12 – 15", "h"]])}
${tbl(["", "1<sup>re</sup> phase", "2<sup>e</sup> phase"], [
    [["Eau", "fort"], "<strong>La totalité</strong>", "—"],
    [["Farine", "fort"], "<strong>= au poids de l'eau</strong>", "La farine restante"],
    [["Levure", "fort"], "<strong>2/3</strong> de la levure", "<strong>1/3</strong> de la levure"],
    [["Sel", "fort"], "—", "La totalité"],
    [["Huile d'olive", "fort"], "—", "La totalité"],
  ], { titre: "Ce qui va dans quelle phase", compact: true })}
${proto([
  { n: 1, titre: "Première phase — le poolish", corps: `
            <p>Peser la <strong>totalité de l'eau</strong> et les <strong>2/3 de la levure</strong>
            (voir le tableau des saisons). Mélanger le tout dans une bassine en fouettant
            énergiquement. Verser le mélange dans le pétrin et ajouter la farine — <strong>son poids
            est égal à celui de l'eau</strong>. Pétrir <strong>5 mn</strong>.</p>` },
  { repos: "12 à 15 h", texte: "À température ambiante, <b>maximum</b>. Le poolish double ou triple : prévoir un contenant qui le supporte." },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Verser la <strong>farine et la levure manquantes</strong> dans le pétrin, sur la
            première phase. Pétrir <strong>7 mn</strong>, ajouter le <strong>sel</strong> et
            l'<strong>huile d'olive</strong>, laisser tourner <strong>2 à 3 mn</strong>.</p>
            <p>La pâte est finie. Prendre la température et vérifier la texture&nbsp;: homogène et
            souple, sans dépasser les degrés imposés.</p>` },
  { repos: "5 mn", texte: "<b>Détente</b> — sur le marbre, en un gros pâton, avec un rabat, couvert d'un film plastique." },
  { n: "→", titre: "Division et boulage", corps: `
            <p>Étaler la masse en rectangle de 10&nbsp;cm d'épaisseur. Diviser, peser, bouler,
            déposer dans des bacs Gilac 60 × 40&nbsp;cm et bloquer à <strong>3 à 4&nbsp;°C</strong>.</p>` },
])}
${enc("alerte", "Pas de pointage", `<p>Contrairement au direct, l'indirect <strong>ne passe pas par
        un pointage</strong>&nbsp;: la fermentation a déjà eu lieu en première phase. On boule tout
        de suite et on bloque au froid.</p>`)}
`);
  return m;
};

/* ===========================================================================
   BIGA
   =========================================================================== */
export const biga = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "La Biga", "Un pré-ferment SOLIDE et filandreux&nbsp;: 45&nbsp;% d'eau, 16 à 20 heures, et une pâte que la météo n'atteint pas.")}
${cote(`
          <p>L'empâtement Biga est une autre technique de fermentation. C'est une pré-fermentation
          proche du poolish, qui consiste à mélanger farine, eau et levure pour former une
          <strong>pâte filandreuse, non homogène</strong>.</p>
          <p>Elle est laissée en pré-fermentation <strong>16 à 20 heures</strong> avant d'être
          mélangée au reste des ingrédients.</p>
          <p>La Biga est <strong>moins aérée et plus ferme</strong> que le poolish en fin de
          pétrissage. Les pizzas produites ont généralement un goût plus complexe et une texture
          plus alvéolée.</p>`,
  "biga-main", "Biga filandreuse soulevée à la main", { sens: "gauche" })}
        <h4 class="sous">Définition</h4>
        <p>Mot d'origine italienne. Elle se réalise en <strong>deux phases distinctes</strong>&nbsp;:
        d'abord un <strong>pré-ferment solide</strong> (le <em>starter</em>) avec un temps de repos à
        température ambiante&nbsp;; ensuite l'incorporation du reste des ingrédients pour terminer
        l'empâtement. Les ingrédients&nbsp;: farine, eau, sel, huile.</p>
${bilan([
    "Peut être faite en plusieurs pourcentages, selon un temps d'utilisation de 24 h à 96 h",
    "Pâte <strong>très stable</strong> aux conditions météorologiques",
    "Alvéolage de la mie bien développé",
    "Bonne digestibilité",
  ], [
    "Organisation en deux phases à anticiper",
  ])}
        <p class="mention">Comparaison faite à taux d'hydratation égal.</p>
`, { chap: "La Biga", num: n });

  m.p(`
        <h3 class="sec">Les quantités — exemple pour 10 kg de farine</h3>
${tbl(["1<sup>re</sup> phase — le starter", ["Biga 20 %", "c"], ["Biga 30 %", "c"], ["Biga 40 %", "c"]], [
    [["Farine", "fort"], ["<span class='val'>2 kg</span>", "c"], ["<span class='val'>3 kg</span>", "c"], ["<span class='val'>4 kg</span>", "c"]],
    [["Eau <span class='mention'>(45 % du poids de farine)</span>", "fort"], ["<span class='val'>0,900 kg</span>", "c"], ["<span class='val'>1,350 kg</span>", "c"], ["<span class='val'>1,800 kg</span>", "c"]],
    [["Levure fraîche ou sèche active", "fort"], ["<span class='val'>20 g</span>", "c"], ["<span class='val'>30 g</span>", "c"], ["<span class='val'>40 g</span>", "c"]],
    [["Levure sèche instantanée", "fort"], ["<span class='val'>10 g</span>", "c"], ["<span class='val'>15 g</span>", "c"], ["<span class='val'>20 g</span>", "c"]],
  ], { compact: true })}
        <p class="mention">Levure fraîche ou sèche active&nbsp;: <strong>1&nbsp;%</strong> du poids
        de farine de la 1<sup>re</sup> phase. Sèche instantanée&nbsp;: <strong>0,5&nbsp;%</strong>.
        Aucune levure en 2<sup>e</sup> phase.</p>
${tbl(["2<sup>e</sup> phase", ["Biga 20 %", "c"], ["Biga 30 %", "c"], ["Biga 40 %", "c"]], [
    { groupe: "Farine restante et eau, selon la force" },
    [["Farine", "fort"], ["<span class='val'>8 kg</span>", "c"], ["<span class='val'>7 kg</span>", "c"], ["<span class='val'>6 kg</span>", "c"]],
    [["Eau — <strong>W 330</strong>", ""], ["4,800 kg", "c"], ["4,350 kg", "c"], ["4,100 kg", "c"]],
    [["Eau — <strong>W 390</strong>", ""], ["5 kg", "c"], ["4,550 kg", "c"], ["4,100 kg", "c"]],
    [["Eau — <strong>W 420</strong>", ""], ["5,100 kg", "c"], ["4,650 kg", "c"], ["4,200 kg", "c"]],
    { groupe: "Le reste, quel que soit le pourcentage" },
    [["Huile", "fort"], ["<span class='val'>250 g</span>", "c"], ["<span class='val'>250 g</span>", "c"], ["<span class='val'>250 g</span>", "c"]],
    [["Sel", "fort"], ["<span class='val'>200 g</span>", "c"], ["<span class='val'>200 g</span>", "c"], ["<span class='val'>200 g</span>", "c"]],
  ], { compact: true })}
${enc("conseil", "Choisir son pourcentage", `<p>Le pourcentage de Biga, c'est la part de la farine
        totale qui passe par le pré-ferment. Plus il est élevé, plus le goût est marqué et plus la
        pâte se garde longtemps&nbsp;: <strong>20&nbsp;%</strong> pour une utilisation à 24 h,
        <strong>40&nbsp;%</strong> pour tenir jusqu'à 96 h. <strong>Pas de pointage&nbsp;:</strong>
        bouler tout de suite et bloquer en chambre froide.</p>`)}
`);

  m.p(`
        <h3 class="sec">Protocole — au pétrin à spirale (10 à 30 litres)</h3>
${reperes([["Eau 1<sup>re</sup> phase", "45", "% de la farine"], ["Levure", "1", "% de la farine"], ["Repos", "16 – 20", "h à 19-24 °C"]])}
${proto([
  { n: 1, titre: "Première phase — réaliser la Biga", corps: `
            <p>Mettre la farine dans le pétrin, y incorporer l'eau et la levure délayée. Mélanger
            <strong>1 à 2 mn</strong> seulement, afin d'obtenir une pâte <strong>filandreuse et non
            homogène</strong> — c'est volontaire, elle ne doit surtout pas être lisse.</p>
            <p>Mettre la Biga dans un seau, couvrir d'un torchon.</p>` },
  { repos: "16 à 20 h", texte: "À température ambiante entre <b>19 et 24 °C</b>, maximum 20 heures." },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Verser <strong>un quart de l'eau manquante</strong> dans la Biga et mélanger à la
            main pour obtenir un <strong>liquide laiteux</strong>. Laisser reposer
            <strong>10 mn</strong>.</p>
            <p>Verser dans le pétrin la farine + les <strong>trois quarts d'eau restants</strong> +
            le liquide laiteux. Pétrir <strong>3 mn</strong>. Ajouter la Biga <strong>petit à
            petit</strong> en continuant le pétrissage environ <strong>7 mn</strong>.</p>
            <p>Verser le <strong>sel</strong> et l'<strong>huile d'olive</strong>, laisser tourner
            <strong>2 à 3 mn</strong>. Prendre la température et vérifier la texture.</p>` },
  { repos: "5 mn", texte: "<b>Détente</b> — sur le marbre, un rabat, couvert d'un film plastique." },
  { n: "→", titre: "Division et boulage", corps: `
            <p>Étaler la masse en rectangle de 10&nbsp;cm d'épaisseur. Diviser, peser, bouler,
            déposer en bacs Gilac 60 × 40&nbsp;cm, bloquer entre <strong>3 et 4&nbsp;°C</strong>.</p>` },
])}
${duo(["biga-melange", "Biga mélangée à la main dans une bassine"], ["biga-texture", "Texture filandreuse de la Biga"],
  "À gauche le geste de la première phase, à droite la texture recherchée&nbsp;: des filaments, pas une pâte.")}
`);
  return m;
};

/* ===========================================================================
   PIZZA CONTEMPORAINE
   =========================================================================== */
export const contemporaine = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "La pizza contemporaine", "Une napolitaine poussée plus loin&nbsp;: hydratation haute, maturation longue, corniche « nuage ».")}
        <p class="intro">La pizza contemporaine est une évolution moderne de la pizza, qui se
        distingue par un empâtement innovant et une réalisation plus sophistiquée.</p>
        <p>C'est une approche de la pizza napolitaine, réalisée sur un empâtement
        <strong>direct ou indirect</strong> avec une hydratation plus élevée — environ
        <strong>70&nbsp;%</strong> selon le W de la farine — afin d'obtenir des corniches plus
        développées et une mie alvéolée et aérienne. Le temps de cuisson est plus rapide que pour une
        pizza classique&nbsp;: le four est réglé entre <strong>400 et 420&nbsp;°C</strong>. Les
        pâtons s'utilisent entre <strong>24 et 96 heures</strong>.</p>
${reperes([["Hydratation", "≈ 70", "%"], ["Four", "400 – 420", "°C"], ["Utilisation", "24 – 96", "h"]])}
        <h3 class="sec">Une histoire courte</h3>
        <div class="proto">
          <div class="phase" data-n="1"><div class="phase-t">Naissance</div>
            <p>La pizza napolitaine traditionnelle&nbsp;: tomate, mozzarella, basilic.</p></div>
          <div class="phase" data-n="2"><div class="phase-t">Les expérimentations</div>
            <p>Certains pizzaïolos commencent à sortir du cadre.</p></div>
          <div class="phase" data-n="3"><div class="phase-t">Les techniques de boulangerie</div>
            <p>Introduction des maturations longues et des hautes hydratations.</p></div>
          <div class="phase" data-n="4"><div class="phase-t">Années 2010</div>
            <p>Des figures comme Franco Pepe, Simone Padoan et Gabriele Bonci révolutionnent la
            pizza&nbsp;: corniche très alvéolée façon « nuage », garnitures gastronomiques.</p></div>
          <div class="phase" data-n="5"><div class="phase-t">Aujourd'hui</div>
            <p>Un courant gastronomique reconnu mondialement. Chaque chef propose sa signature, avec
            sa pâte et ses garnitures.</p></div>
        </div>
${bilan(["Nouvelle tendance", "Mie alvéolée et aérienne", "Corniche développée et moelleuse", "Bonne digestibilité"],
        ["Doit être utilisée dans les 3 jours", "Cuisson rapide — moins de marge d'erreur"],
        ["Pour le client", "Pour le pizzaïolo"])}
`, { chap: "La pizza contemporaine", num: n });

  m.p(`
        <h3 class="sec">Contemporaine ou napolitaine&nbsp;?</h3>
${tbl(["", "Pizza contemporaine", "Pizza napolitaine"], [
    [["Origine", "fort"], "Italie, mouvement moderne (années 2010)", "Naples, tradition UNESCO"],
    [["Pâte", "fort"], "Hydratation <strong>68 %</strong> et plus<br>Fermentation <strong>48 à 72 h</strong>", "Hydratation <strong>58 à 62 %</strong> max.<br>Fermentation <strong>8 à 24 h</strong>"],
    [["<em>Cornicione</em>", "fort"], "Très développé, volumineux, aspect nuage", "Moelleux, alvéolé, taches léopard"],
    [["Taille", "fort"], "Ø 26 à 29 cm, individuelle ou à partager", "Ø 30 à 32 cm, fine au centre"],
    [["Fours", "fort"], "Bois / électrique / hybride", "Bois / électrique / hybride"],
    [["Cuisson", "fort"], "<strong>400 à 430 °C</strong>, 2 à 3 mn", "<strong>450 à 480 °C</strong>, 60 à 90 s"],
    [["Garniture", "fort"], "Créative, gastronomique, ajouts après cuisson", "<em>Marinara</em>&nbsp;: tomate San Marzano, ail, origan, huile<br><em>Margherita</em>&nbsp;: tomate San Marzano, mozzarella, basilic, huile"],
    [["Philosophie", "fort"], "Interprétation moderne, signature du pizzaïolo", "Respect de la tradition"],
  ])}
${enc("verif", "Deux jeux de températures dans les manuels", `<p>Le chapitre d'introduction annonce
        un four à <strong>400–420&nbsp;°C</strong> pour la contemporaine, ce tableau
        <strong>400–430&nbsp;°C</strong>, et le chapitre « La cuisson » du Niveau&nbsp;I la donne à
        <strong>360–380&nbsp;°C</strong>. Trois plages pour un même produit.
        ${averif("à trancher — Jean-Jacques")}</p>`)}
`);

  m.p(`
        <h3 class="sec">Unité de calcul — direct et sur Biga 100 %</h3>
${tbl(["Ingrédient", ["1 kg", "c"], ["3 kg", "c"], ["10 kg", "c"]], [
    [["Farine de blé", "fort"], ["<span class='val'>1 kg</span>", "c"], ["<span class='val'>3 kg</span>", "c"], ["<span class='val'>10 kg</span>", "c"]],
    { groupe: "Eau de coulage, selon la force" },
    [["W 300 — 56 %", ""], ["560 g", "c"], ["1,68 kg", "c"], ["5,6 kg", "c"]],
    [["W 330 — 57 %", ""], ["570 g", "c"], ["1,71 kg", "c"], ["5,7 kg", "c"]],
    [["W 390 — 59 %", ""], ["590 g", "c"], ["1,77 kg", "c"], ["5,9 kg", "c"]],
    { groupe: "Le reste" },
    [["Levure fraîche", "fort"], ["<span class='val'>5 g</span>", "c"], ["<span class='val'>15 g</span>", "c"], ["<span class='val'>50 g</span>", "c"]],
    [["Sel", "fort"], ["<span class='val'>25 g</span>", "c"], ["<span class='val'>75 g</span>", "c"], ["<span class='val'>250 g</span>", "c"]],
    [["Eau de bassinage <span class='mention'>(W 300 · 330 · 390)</span>", "fort"], ["<span class='val'>110 g</span>", "c"], ["<span class='val'>330 g</span>", "c"], ["<span class='val'>1,1 kg</span>", "c"]],
    [["Lemady", "fort"], ["<span class='val'>15 g</span>", "c"], ["<span class='val'>45 g</span>", "c"], ["<span class='val'>150 g</span>", "c"]],
    [["<em>ou</em> Malt", "fort"], ["<span class='val'>2 g</span>", "c"], ["<span class='val'>6 g</span>", "c"], ["<span class='val'>20 g</span>", "c"]],
  ], { compact: true })}
${enc("note", "Lire l'hydratation en deux temps", `<p>L'eau de coulage seule donne 56 à 59&nbsp;%,
        ce qui n'a l'air de rien. C'est l'<strong>eau de bassinage</strong> — 1,1 kg pour 10 kg de
        farine, soit 11 points — qui porte le total à <strong>67 à 70&nbsp;%</strong>. Elle ne
        s'ajoute qu'en fin de pétrissage, quand le réseau est déjà construit et capable de
        l'absorber.</p>`)}
${enc("verif", "Le sel de la contemporaine", `<p>25&nbsp;g par kilo de farine, contre 17 à 22&nbsp;g
        pour un empâtement classique. C'est cohérent avec une forte hydratation (le sel resserre le
        réseau et permet d'hydrater davantage), mais l'écart mérite d'être confirmé.
        ${averif("à confirmer")}</p>`)}
`);

  m.p(`
        <h3 class="sec">Méthodologie — contemporaine en empâtement direct</h3>
        <p class="mention">Pour 10 kg de farine. Le tableau dit à quelle phase entre chaque ingrédient.</p>
${tbl(["Ingrédient", ["1<sup>re</sup>", "c"], ["2<sup>e</sup>", "c"], ["3<sup>e</sup>", "c"], ["4<sup>e</sup>", "c"], ["5<sup>e</sup>", "c"]], [
    [["Farine de blé", "fort"], ["3,3 kg", "c"], ["6,7 kg", "c"], ["", "c"], ["", "c"], ["", "c"]],
    [["Eau de coulage <span class='mention'>W 300 / 330 / 390</span>", "fort"], ["<span class='val'>5,6 / 5,7 / 5,9 kg</span>", "c"], ["", "c"], ["", "c"], ["", "c"], ["", "c"]],
    [["Sel", "fort"], ["<span class='val'>250 g</span>", "c"], ["", "c"], ["", "c"], ["", "c"], ["", "c"]],
    [["Lemady <em>ou</em> malt", "fort"], ["<span class='val'>150 g / 20 g</span>", "c"], ["", "c"], ["", "c"], ["", "c"], ["", "c"]],
    [["Levure fraîche ou sèche active", "fort"], ["", "c"], ["<span class='val'>50 g</span>", "c"], ["", "c"], ["", "c"], ["", "c"]],
    [["<em>ou</em> sèche instantanée", "fort"], ["", "c"], ["<span class='val'>25 g</span>", "c"], ["", "c"], ["", "c"], ["", "c"]],
    [["Eau de bassinage", "fort"], ["", "c"], ["", "c"], ["", "c"], ["<span class='val'>1,1 kg</span>", "c"], ["", "c"]],
  ], { compact: true })}
${proto([
  { n: 1, titre: "La crème", corps: `
            <p>Mettre l'<strong>eau et le sel</strong>, mélanger à la main pour dissoudre le sel.
            Incorporer petit à petit <strong>un tiers de la farine</strong> + le lemady ou le malt,
            à petite vitesse, pendant <strong>2 mn</strong>, jusqu'à obtenir une crème.</p>` },
  { n: 2, titre: "La levure", corps: `<p>Ajouter la <strong>levure</strong>.</p>` },
  { n: 3, titre: "Le corps de la pâte", corps: `
            <p>Incorporer la <strong>farine manquante</strong> petit à petit et pétrir
            <strong>7 mn</strong> à petite vitesse.</p>` },
  { n: 4, titre: "Le bassinage", corps: `
            <p>Ajouter l'<strong>eau de bassinage</strong> petit à petit, à <strong>grande
            vitesse</strong>, jusqu'à ce que la pâte <strong>se décolle du bord de la cuve</strong>.</p>` },
  { repos: "30 à 40 mn", texte: "<b>Pointage</b> — en masse, dans un bac couvert, à température ambiante." },
  { n: 5, titre: "Boulage", corps: `
            <p>Déposer sur le plan de travail, faire un rabat. Diviser, peser, bouler&nbsp;: des
            pâtons d'environ <strong>290 g</strong>. Bloquer en chambre froide entre
            <strong>2 et 4&nbsp;°C</strong>.</p>` },
])}
${enc("conseil", "La vitesse fait le gluten", `<p>Plus on pétrit rapidement, plus on développe le
        réseau — <strong>jusqu'à une température maximale de 25&nbsp;°C</strong>. Au-delà, la
        vitesse ne construit plus, elle détruit. Cet empâtement s'utilise dans les
        <strong>24 à 72 h</strong>, stocké en chambre froide.</p>`)}
`);

  m.p(`
        <h3 class="sec">Méthodologie — contemporaine sur Biga 100 %</h3>
        <p class="mention">Pour 10 kg de farine.</p>
${tbl(["Ingrédient", ["1<sup>re</sup> phase", "c"], ["2<sup>e</sup> phase", "c"], ["3<sup>e</sup> phase", "c"]], [
    [["Farine de blé", "fort"], ["<span class='val'>10 kg</span>", "c"], ["", "c"], ["", "c"]],
    [["Eau — W 300", ""], ["4,5 kg", "c"], ["1,1 kg", "c"], ["", "c"]],
    [["Eau — W 330", ""], ["4,5 kg", "c"], ["1,2 kg", "c"], ["", "c"]],
    [["Eau — W 390", ""], ["4,5 kg", "c"], ["1,4 kg", "c"], ["", "c"]],
    [["Levure fraîche ou sèche active", "fort"], ["<span class='val'>50 g</span>", "c"], ["", "c"], ["", "c"]],
    [["<em>ou</em> sèche instantanée", "fort"], ["<span class='val'>25 g</span>", "c"], ["", "c"], ["", "c"]],
    [["Sel", "fort"], ["", "c"], ["<span class='val'>250 g</span>", "c"], ["", "c"]],
    [["Lemady <em>ou</em> malt <span class='mention'>(facultatif)</span>", "fort"], ["", "c"], ["<span class='val'>150 g / 20 g</span>", "c"], ["", "c"]],
    [["Eau de bassinage à 6 °C", "fort"], ["", "c"], ["", "c"], ["<span class='val'>≈ 1,1 kg</span>", "c"]],
  ], { compact: true })}
${proto([
  { n: 1, titre: "Première phase — la Biga", corps: `
            <p>Mettre les <strong>10 kg de farine</strong> dans le pétrin, incorporer
            <strong>4,5 kg d'eau</strong> et la totalité de la levure délayée. Pétrir environ
            <strong>2 mn</strong> pour obtenir une pâte filandreuse non homogène. Mettre la Biga
            dans un seau et couvrir d'un torchon.</p>` },
  { repos: "16 à 20 h", texte: "À température ambiante entre <b>20 et 22 °C</b>." },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Mettre la Biga dans le pétrin. Dans un seau, mélanger l'<strong>eau de coulage
            restante</strong> et les <strong>250 g de sel</strong>&nbsp;; verser petit à petit sur la
            Biga et pétrir <strong>2 mn</strong>. Verser le lemady ou le malt en laissant tourner, et
            mélanger encore <strong>8 mn</strong>.</p>` },
  { n: 3, titre: "Le bassinage", corps: `
            <p>Ajouter l'<strong>eau de bassinage</strong> par petits filets pendant
            <strong>2 à 3 mn</strong> en vitesse rapide. La pâte doit se <strong>décoller du bord de
            la cuve</strong>&nbsp;: bien hydratée, lisse, élastique et brillante.</p>` },
  { repos: "30 à 40 mn", texte: "<b>Pointage</b> — en masse, dans un bac couvert." },
  { n: "→", titre: "Boulage", corps: `
            <p>Déposer sur le plan de travail, faire un rabat. Diviser, peser, bouler&nbsp;: des
            pâtons d'environ <strong>290 g</strong>. Bloquer entre <strong>2 et 4&nbsp;°C</strong>.</p>` },
])}
${enc("alerte", "Pas d'huile", `<p>L'huile <strong>n'est pas recommandée</strong> ici&nbsp;: c'est
        un empâtement à fermentation courte, elle n'a rien à figer. Cet empâtement s'utilise dans les
        <strong>24 à 96 h</strong>, un peu comme un empâtement napolitain, stocké en chambre
        froide.</p>`)}
`);
  return m;
};

/* ===========================================================================
   DIFFÉRENCES ENTRE LES EMPÂTEMENTS
   =========================================================================== */
export const differences = (m) => m.p(`
${chapitre(m.chapSuivant(), "Différences entre les empâtements",
  "Le tableau à consulter avant de choisir&nbsp;: cinq empâtements, jugés du point de vue du client puis de celui du pizzaïolo.")}
${tbl(["Critère", ["Direct", "c"], ["Biga", "c"], ["Poolish", "c"], ["Napolitaine", "c"], ["Contemporaine", "c"]], [
    { groupe: "Expérience client" },
    [["Praticité à emporter", ""], ["++", "c"], ["++", "c"], ["+", "c"], ["–", "c"], ["–", "c"]],
    [["Praticité sur place", ""], ["+", "c"], ["++", "c"], ["++", "c"], ["++", "c"], ["++", "c"]],
    [["Texture croustillante", ""], ["+", "c"], ["++", "c"], ["++", "c"], ["–", "c"], ["+", "c"]],
    [["Texture moelleuse", ""], ["–", "c"], ["+", "c"], ["+", "c"], ["++", "c"], ["++", "c"]],
    [["Digestibilité", ""], ["+", "c"], ["++", "c"], ["++", "c"], ["++", "c"], ["++", "c"]],
    { groupe: "Travail du pizzaïolo" },
    [["Fréquence de production", ""], ["++", "c"], ["–", "c"], ["–", "c"], ["++", "c"], ["– ou ++", "c"]],
    [["Facilité de stockage", ""], ["– –", "c"], ["++", "c"], ["++", "c"], ["– –", "c"], ["– –", "c"]],
    [["Complexité du processus", ""], ["– –", "c"], ["+", "c"], ["+", "c"], ["+", "c"], ["+", "c"]],
    [["Gestion des fermentations", ""], ["+", "c"], ["++", "c"], ["++", "c"], ["–", "c"], ["++", "c"]],
    [["Adaptabilité aux rushs", ""], ["++", "c"], ["+", "c"], ["+", "c"], ["+", "c"], ["+", "c"]],
    [["Facilité d'étalage", ""], ["++", "c"], ["+", "c"], ["–", "c"], ["–", "c"], ["–", "c"]],
    [["Influence de la température du four", ""], ["+", "c"], ["+", "c"], ["+", "c"], ["++", "c"], ["++", "c"]],
  ], { titre: "Ce que chaque empâtement fait bien — et moins bien", compact: true })}
        <p class="mention"><strong>++</strong> très adapté · <strong>+</strong> adapté ·
        <strong>–</strong> peu adapté · <strong>– –</strong> pas adapté</p>
${enc("verif", "Un tableau, deux versions", `<p>Ce tableau figurait <strong>deux fois</strong> dans
        le manuel Niveau&nbsp;II d'origine, sur deux pages consécutives, avec une ligne
        « Digestibilité » différente d'une copie à l'autre. La version retenue ici est celle de la
        première page. ${averif("à confirmer — Jean-Jacques")}</p>`)}
`, { chap: "Différences entre les empâtements", num: m._c });

/* ===========================================================================
   QUIZ DES FARINES
   =========================================================================== */
export const quiz = (m) => m.p(`
${chapitre(m.chapSuivant(), "Quiz — le type de farine",
  "Cinq questions pour vérifier que le lien entre extraction, cendres, hydratation et fermentation est acquis.")}
        <div class="proto">
          <div class="phase" data-n="1">
            <div class="phase-t">Pourquoi le taux d'extraction est-il déterminant&nbsp;?</div>
            <p>Plus il est élevé, plus la farine contient de fibres et de minéraux, ce qui impacte
            l'absorption d'eau et la fermentation.<br>
            Taux élevé (T150) → absorbe plus d'eau, fermentation plus lente, pâte dense.<br>
            Taux faible (<em>Tipo 00</em>) → absorbe moins d'eau, pâte plus extensible et légère.</p>
          </div>
          <div class="phase" data-n="2">
            <div class="phase-t">Quel impact d'une farine à plus de 80 % d'extraction&nbsp;?</div>
            <p>Pâte plus dense et moins aérée&nbsp;; moins d'élasticité, donc étalage plus
            difficile&nbsp;; fermentation plus lente et absorption d'eau plus importante.</p>
          </div>
          <div class="phase" data-n="3">
            <div class="phase-t">Quelle farine pour une napolitaine AVPN, et pourquoi&nbsp;?</div>
            <p><em>Tipo 00</em> (T45 ou T55)&nbsp;: faible taux de cendres et grande extensibilité,
            idéale pour la cuisson rapide à haute température (400 à 485&nbsp;°C).</p>
          </div>
          <div class="phase" data-n="4">
            <div class="phase-t">Taux de cendres ou taux d'extraction&nbsp;?</div>
            <p><strong>Cendres</strong> = quantité de minéraux (plus il est élevé, plus la farine est
            complète). <strong>Extraction</strong> = proportion du blé moulu restant après
            raffinage.<br>
            Une farine riche en cendres favorise une fermentation plus longue et un goût plus
            prononcé&nbsp;; une farine raffinée produit une pâte légère et douce.</p>
          </div>
          <div class="phase" data-n="5">
            <div class="phase-t">Comment ajuster une Biga en T80 plutôt qu'en T65&nbsp;?</div>
            <p>Hydratation <strong>+3 à 5 %</strong>, car la T80 absorbe plus d'eau&nbsp;;
            fermentation légèrement prolongée&nbsp;; surveiller l'excès d'acidité dû à l'activité
            enzymatique plus élevée.</p>
          </div>
        </div>
${enc("verif", "Le quiz existait en double", `<p>Le manuel d'origine posait ces cinq questions
        <strong>deux fois de suite</strong>, dans deux formulations différentes, sur deux pages
        consécutives. Une seule version est conservée. ${averif("à confirmer")}</p>`)}
`, { chap: "Quiz — le type de farine", num: m._c });

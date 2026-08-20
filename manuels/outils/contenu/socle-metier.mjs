/**
 * SOCLE — le métier : protocoles, matières premières garnies, matériel,
 * organisation, cuisson, fours et pétrins.
 *
 * Suite de socle-matieres.mjs. Même règle : les valeurs viennent du manuel
 * Niveau I d'origine, et les contradictions internes sont signalées, pas
 * corrigées en silence.
 */
import { chapitre, cote, photo, duo, enc, tbl, averif, reperes, proto, bilan } from "../gabarit.mjs";
import * as SC from "../schemas.mjs";

/* Le tableau de pointage revient sur les trois protocoles directs : une seule
   définition, trois usages — c'est exactement le genre de duplication qui a
   fait diverger les manuels d'origine. */
const POINTAGE = tbl(["Saison", ["Temps de pointage", "c"]], [
  [["Été chaud et humide", "fort"], ["<span class='val'>10 à 15 mn</span>", "c"]],
  [["Printemps / automne", "fort"], ["<span class='val'>15 à 30 mn</span>", "c"]],
  [["Hiver", "fort"], ["<span class='val'>20 à 40 mn</span>", "c"]],
], { titre: "Temps de pointage suivant la saison", compact: true });

/** La fin commune aux trois protocoles directs : détente, division, blocage. */
const FIN_DIRECTE = [
  { repos: "5 mn", texte: "<b>Détente</b> — la pâte se relâche avant d'être divisée." },
  {
    n: "»", titre: "Division et boulage", corps: `
            <p>Étaler la masse en forme rectangulaire, d'une épaisseur de 10&nbsp;cm.
            <strong>Diviser, peser, bouler</strong> et déposer dans des bacs Gilac 60 <span class='gly'>×</span> 40&nbsp;cm.
            Bloquer à <strong>3 à 4&nbsp;°C</strong>.</p>`,
  },
];

/* ===========================================================================
   L'EMPÂTEMENT DIRECT
   =========================================================================== */
export const direct = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'empâtement direct",
  "Tous les ingrédients en une seule fois. Au pétrin à spirale, de 10 à 30 litres.")}
${reperes([["Hydratation", "54 – 60", "%"], ["T° pâte finale", "max. 25", "°C"], ["Pétrissage", "env. 15", "mn"]])}
${proto([
  { n: 1, titre: "Première phase", corps: `
            <p>Mettre la <strong>farine et la levure</strong>, laisser tourner <strong>1 mn</strong>
            — c'est le temps d'oxygénation.</p>` },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Verser l'<strong>eau d'un coup</strong> — <em>garder toujours un verre d'eau pour le
            bassinage</em>. Pétrir <strong>12 mn en petite vitesse</strong>.</p>` },
  { n: 3, titre: "Troisième phase", corps: `
            <p>Verser le <strong>sel</strong> petit à petit tout en laissant tourner le pétrin&nbsp;;
            au bout d'<strong>1 mn</strong>, verser l'<strong>huile d'olive</strong>. Pétrir encore
            <strong>2 à 3 mn</strong>.</p>
            <p>La pâte est finie. <strong>Prendre la température</strong> et vérifier la texture&nbsp;:
            elle doit être homogène et souple, et ne pas dépasser les degrés imposés.</p>` },
  { repos: "10 à 40 mn", texte: "<b>Pointage</b> — sur le marbre, en un gros pâton, avec un rabat, couvert d'un film plastique." },
  ...FIN_DIRECTE,
])}
${POINTAGE}
${enc("conseil", "Prendre la température, vraiment", `<p>C'est le seul contrôle objectif de tout le
        protocole. Une pâte à 27&nbsp;°C au lieu de 24 fermentera trop vite et sera ingérable le
        lendemain — et rien dans son aspect ne le dira au moment où elle sort du pétrin.</p>`)}
`, { chap: "L'empâtement direct", num: m._c });

/* ===========================================================================
   L'AUTOLYSE
   =========================================================================== */
export const autolyse = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'autolyse",
  "Farine et eau seules, un repos, puis le reste. Une méthode qui donne une pâte plus extensible.")}
${reperes([["Hydratation 1<sup>re</sup> phase", "57", "%"], ["Repos", "40", "mn"], ["Bassinage", "2 – 3", "%"]])}
${proto([
  { n: 1, titre: "Première phase — l'autolyse", corps: `
            <p>Verser la <strong>totalité de la farine et de l'eau de coulage</strong> à hauteur de
            <strong>57&nbsp;% d'hydratation</strong>. Pétrir <strong>3 mn</strong> environ, afin
            d'obtenir une pâte <strong>non homogène</strong>.</p>` },
  { repos: "40 mn", texte: "À température ambiante. C'est ici que les enzymes travaillent, sans levure ni sel." },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Pétrir à nouveau <strong>7 mn</strong> environ en ajoutant la <strong>levure</strong>
            au début — <em>garder toujours un verre d'eau pour le bassinage</em>.</p>` },
  { n: 3, titre: "Troisième phase", corps: `
            <p>Verser le <strong>sel</strong> petit à petit puis l'<strong>huile</strong> tout en
            laissant tourner. Pétrir environ <strong>2 à 3 mn</strong>.</p>` },
  { n: 4, titre: "Quatrième phase — le bassinage", corps: `
            <p>Corriger la texture par bassinage&nbsp;: verser <strong>2 à 3&nbsp;% d'eau</strong> par
            petits filets, afin d'obtenir une pâte souple et extensible.</p>` },
  { repos: "10 à 40 mn", texte: "<b>Pointage</b> — sur le marbre, un rabat, couvert d'un film plastique." },
  ...FIN_DIRECTE,
])}
${POINTAGE}
${enc("note", "Ce que l'autolyse achète", `<p>Un repos sans levure et sans sel laisse les enzymes de
        la farine amorcer seules le réseau. La pâte devient <strong>plus extensible</strong>&nbsp;:
        elle s'étale sans revenir. C'est le geste qui règle le plus souvent un problème d'étalage,
        avant même de changer de farine.</p>`)}
`, { chap: "L'autolyse", num: m._c });

/* ===========================================================================
   LES ADJONCTIONS
   =========================================================================== */
export const adjonctions = (m) => m.p(`
${chapitre(m.chapSuivant(), "Les adjonctions",
  "Un produit ajouté à la pâte pendant le pétrissage. Toujours calculé sur le poids de la farine.")}
${tbl(["Adjonction", ["Pourcentage", "c"], "À quel moment&nbsp;?", "Complément d'eau"], [
    [["Graines torréfiées", "fort"], ["<span class='val'>3 à 6 %</span>", "c"], "Avant le sel (10 mn)", ["Eau de bassinage", "c"]],
    [["Pâte fermentée", "fort"], ["<span class='val'>10 à 30 %</span>", "c"], "À la 8<sup>e</sup> minute", ["Eau de bassinage", "c"]],
    [["Naturkraft <span class='mention'>(levain déshydraté)</span>", "fort"], ["<span class='val'>4 %</span>", "c"], "Avec la farine", ["Eau de bassinage", "c"]],
    [["Son", "fort"], ["<span class='val'>1 %</span>", "c"], "Après l'huile (12 mn)", ["Eau de bassinage", "c"]],
    [["Charbon végétal", "fort"], ["<span class='val'>1 à 2 %</span>", "c"], "Avec la farine", ["Eau de bassinage", "c"]],
  ], { titre: "Pourcentage recommandé sur la quantité de farine" })}
        <h3 class="sec">Le listing des adjonctions</h3>
        <ul class="liste serre">
          <li>Graines torréfiées</li>
          <li>Pâte fermentée</li>
          <li>Levain naturel</li>
          <li>Naturkraft (levain déshydraté)</li>
          <li>Son</li>
          <li>Charbon végétal</li>
        </ul>
${enc("conseil", "Une adjonction assèche", `<p>Graines, son et charbon <strong>boivent</strong>.
        Le complément se fait toujours à l'<strong>eau de bassinage</strong>, en fin de pétrissage,
        et jamais en augmentant l'eau de coulage du départ&nbsp;: on ajusterait à l'aveugle une pâte
        qui n'a pas encore montré sa texture.</p>`)}
${photo("rabat", "Rabat de la pâte en masse")}
`, { chap: "Les adjonctions", num: m._c });

/* ===========================================================================
   L'EMPÂTEMENT SEMI-DIRECT
   =========================================================================== */
export const semiDirect = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'empâtement semi-direct",
  "Un direct auquel on ajoute de la pâte fermentée. Le raccourci vers les arômes de l'indirect.")}
${reperes([["Pâte fermentée", "10 – 30", "%"], ["Ajout", "8<sup>e</sup>", "minute"], ["T° pâte finale", "max. 25", "°C"]])}
${proto([
  { n: 1, titre: "Première phase", corps: `
            <p>Mettre la <strong>farine et la levure</strong>, laisser tourner <strong>1 mn</strong>
            (temps d'oxygénation).</p>` },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Verser l'<strong>eau d'un coup</strong> — <em>garder toujours un verre d'eau pour le
            bassinage</em>. Pétrir <strong>8 mn en petite vitesse</strong>, ajouter la
            <strong>pâte fermentée</strong>, puis terminer le pétrissage pendant
            <strong>4 mn</strong>.</p>` },
  { n: 3, titre: "Troisième phase", corps: `
            <p>Verser le <strong>sel</strong> petit à petit&nbsp;; au bout d'<strong>1 mn</strong>,
            verser l'<strong>huile d'olive</strong>. Pétrir environ <strong>2 à 3 mn</strong>.</p>
            <p>Prendre la température et vérifier la texture&nbsp;: homogène, souple, sans dépasser
            les degrés imposés.</p>` },
  { repos: "10 à 40 mn", texte: "<b>Pointage</b> — sur le marbre, un rabat, couvert d'un film plastique." },
  ...FIN_DIRECTE,
])}
${POINTAGE}
${enc("note", "Qu'est-ce que la pâte fermentée", `<p>C'est un empâtement, direct ou indirect, qu'on a
        laissé fermenter <strong>24 heures à température ambiante</strong>, ou <strong>2 à 5 jours
        en chambre froide</strong>. Autrement dit&nbsp;: un reste de la veille, utilisé comme
        ferment. Rien ne se jette.</p>`)}
`, { chap: "L'empâtement semi-direct", num: m._c });

/* ===========================================================================
   LES SUBSTITUTIONS
   =========================================================================== */
export const substitutions = (m) => m.p(`
${chapitre(m.chapSuivant(), "Les substitutions",
  "Remplacer une part de la farine de blé par une autre farine — en respectant le poids total, et en compensant l'eau.")}
        <p>La substitution, c'est le remplacement d'une partie du poids de la farine initiale de blé
        par une ou plusieurs autres farines&nbsp;: complète, semi-complète, soja, châtaigne, seigle,
        orge, mix. <strong>Le poids initial de farine ne change pas</strong> — seule sa composition
        change.</p>
${tbl([["Force W", ""], ["Hydratation<br>minimale", "c"], ["Eau", "c"], ["Soja / semi-complète 10 %<br>complément", "c"], ["Total<br>eau", "c"], ["Farine complète 10 %<br>complément", "c"], ["Total<br>eau", "c"]], [
    [["W 200", "fort"], ["54 %", "c"], ["540 g", "c"], ["+ 30 g", "c"], ["<span class='val'>570 g</span>", "c"], ["+ 40 g", "c"], ["<span class='val'>580 g</span>", "c"]],
    [["W 250", "fort"], ["55 %", "c"], ["550 g", "c"], ["+ 30 g", "c"], ["<span class='val'>580 g</span>", "c"], ["+ 40 g", "c"], ["<span class='val'>590 g</span>", "c"]],
    [["W 300", "fort"], ["56 %", "c"], ["560 g", "c"], ["+ 30 g", "c"], ["<span class='val'>590 g</span>", "c"], ["+ 40 g", "c"], ["<span class='val'>600 g</span>", "c"]],
    [["W 330", "fort"], ["57 %", "c"], ["570 g", "c"], ["+ 30 g", "c"], ["<span class='val'>600 g</span>", "c"], ["+ 40 g", "c"], ["<span class='val'>610 g</span>", "c"]],
    [["W 390", "fort"], ["59 %", "c"], ["590 g", "c"], ["+ 30 g", "c"], ["<span class='val'>620 g</span>", "c"], ["+ 40 g", "c"], ["<span class='val'>630 g</span>", "c"]],
    [["W 420", "fort"], ["60 %", "c"], ["600 g", "c"], ["+ 30 g", "c"], ["<span class='val'>630 g</span>", "c"], ["+ 40 g", "c"], ["<span class='val'>640 g</span>", "c"]],
  ], { titre: "Poids d'eau pour 1 kg de farine(s)", compact: true })}
${cote(`
          <h3 class="sec">Exemple — 10 unités en W 330, dont 10 % de soja</h3>
          <ol class="etapes">
            <li><strong>9 kg</strong> de farine de blé + <strong>1 kg</strong> de farine de soja</li>
            <li>Eau de base&nbsp;: 570 g <span class='gly'>×</span> 10 = <strong>5,700 kg</strong></li>
            <li>Complément&nbsp;: 30 g <span class='gly'>×</span> 10 unités = <strong>0,300 kg</strong></li>
            <li><strong>Eau totale = 6 kg</strong></li>
          </ol>`,
  "farine-cuve", "Deux farines mélangées dans la cuve")}
${enc("alerte", "Certaines farines assèchent", `<p>Vous devez réagir&nbsp;: il sera toujours possible
        d'ajouter un peu d'<strong>eau de bassinage</strong> en fin de pétrissage pour retrouver une
        texture homogène avec une bonne élasticité. Le tableau donne le complément
        <em>attendu</em>&nbsp;; la pâte donne le complément <em>réel</em>.</p>`)}
        <p class="mention">Schéma des substitutions — © École Pizza | Jean-Jacques Despaux</p>
`, { chap: "Les substitutions", num: m._c });

/* ===========================================================================
   LES ALLERGÈNES
   =========================================================================== */
export const allergenes = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Les allergènes",
  "L'information sur les allergènes est <strong>obligatoire</strong> en restauration. Ce n'est pas une bonne pratique&nbsp;: c'est la loi.")}
${enc("note", "Cadre réglementaire", `<p>Règlement (UE) n°&nbsp;1169/2011 — Décret n°&nbsp;2015-447
        du 17 avril 2015. Les professionnels doivent mettre à disposition du consommateur la liste
        des allergènes présents dans les plats.</p>`)}
        <h3 class="sec">Les 14 allergènes majeurs</h3>
        <p>Conformément à la réglementation, les allergènes ci-dessous incluent toute présence
        <strong>directe ou sous forme de produits dérivés</strong>. Il faut vérifier l'étiquetage
        des produits utilisés.</p>
${tbl(["Allergène", "Exemple de produit dérivé à surveiller"], [
    [["1. Gluten", "fort"], "Farine de blé, semoule, chapelure"],
    [["2. Crustacés", "fort"], "Bisque"],
    [["3. Œufs", "fort"], "Mayonnaise, certaines pâtes fraîches"],
    [["4. Poissons", "fort"], "Pâte d'anchois, sauce Worcestershire"],
    [["5. Arachides", "fort"], "Huile d'arachide"],
    [["6. Soja", "fort"], "Farine de soja, lécithine"],
    [["7. Lait <span class='mention'>(y compris lactose)</span>", "fort"], "Fromage, crème, beurre"],
    [["8. Fruits à coque", "fort"], "Pesto (pignon)"],
    [["9. Céleri", "fort"], "<strong>Sauce tomate</strong> — le piège le plus fréquent"],
    [["10. Moutarde", "fort"], "Sauces, marinades"],
    [["11. Sésame", "fort"], "Graines de finition, pains"],
    [["12. Lupin", "fort"], "Farines de substitution"],
    [["13. Mollusques", "fort"], "Cocktail de fruits de mer"],
    [["14. Sulfites <span class='mention'>(anhydride sulfureux)</span>", "fort"], "Vinaigre balsamique, charcuteries"],
  ], { compact: true })}
`, { chap: "Les allergènes", num: n });

  m.p(`
        <h3 class="sec">Modalités d'affichage</h3>
        <p>Le professionnel doit mettre à disposition un <strong>document écrit, clair et
        accessible</strong>. Un affichage doit informer le client de la disponibilité de ces
        informations. Par exemple&nbsp;:</p>
${enc("note", "Formulation type", `<p style="font-size:11pt">« La liste des allergènes présents dans
        nos plats est disponible sur demande. »</p>`)}
        <p>L'information peut être donnée sur&nbsp;: <strong>carte</strong> — <strong>tableau</strong>
        — <strong>classeur</strong> — <strong>support numérique</strong>.</p>
${bilan(
    ["Fiches recettes avec allergènes", "Formation des équipes", "Vérification des fournisseurs", "Mise à jour régulière"],
    ["Information fiable et à jour", "Tous les plats concernés", "Personnel formé", "Attention aux contaminations croisées"],
    ["Bonnes pratiques", "Points de vigilance"])}
        <h3 class="sec">Exemple — tableau des allergènes sur trois pizzas</h3>
${tbl(["Allergène", ["Reine", "c"], ["Calzone", "c"], ["Océane", "c"]], [
    ["Gluten", ["<span class='coche'></span>", "c"], ["<span class='coche'></span>", "c"], ["<span class='coche'></span>", "c"]],
    ["Crustacés", ["", "c"], ["", "c"], ["", "c"]],
    ["Œufs", ["", "c"], ["<span class='coche'></span>", "c"], ["", "c"]],
    ["Poissons", ["", "c"], ["", "c"], ["<span class='coche'></span>", "c"]],
    ["Arachides", ["", "c"], ["", "c"], ["", "c"]],
    ["Soja", ["", "c"], ["", "c"], ["", "c"]],
    ["Lait", ["<span class='coche'></span>", "c"], ["<span class='coche'></span>", "c"], ["<span class='coche'></span>", "c"]],
    ["Fruits à coque", ["", "c"], ["", "c"], ["", "c"]],
    ["Céleri", ["", "c"], ["", "c"], ["", "c"]],
    ["Moutarde", ["", "c"], ["", "c"], ["", "c"]],
    ["Sésame", ["", "c"], ["", "c"], ["", "c"]],
    ["Lupin", ["", "c"], ["", "c"], ["", "c"]],
    ["Mollusques", ["", "c"], ["", "c"], ["", "c"]],
    ["Sulfites", ["", "c"], ["", "c"], ["", "c"]],
  ], { compact: true })}
${enc("verif", "Le céleri de la sauce tomate", `<p>Le tableau d'origine ne cochait pas le céleri,
        alors que le chapitre précédent le donne en exemple pour la sauce tomate. Selon la marque de
        pulpe employée, la ligne « Céleri » doit être cochée sur toutes les pizzas à base tomate.
        ${averif("à trancher selon le fournisseur")}</p>`)}
`);
  return m;
};

/* ===========================================================================
   LES MATIÈRES PREMIÈRES
   =========================================================================== */
export const matieres = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Les matières premières", "La tomate, les crèmes — les deux bases sur lesquelles tout le reste se pose.")}
${cote(`
          <h3 class="sec">La tomate</h3>
          <p>Elle peut être mentionnée « <strong>faite maison</strong> » sans cuisson, juste en la
          cuisinant à froid sur un produit brut.</p>
          <ul class="liste">
            <li><strong>Tomate concassée</strong> — tomate entière cuite à mixer, ou <em>polpa</em></li>
            <li><strong>Sauce pizza</strong> — tomate déjà aromatisée, liée, prête à l'emploi.
            Certaines marques préconisent de rajouter de l'eau pour liquéfier une tomate trop épaisse</li>
            <li><strong>Tomate fraîche</strong> — coupée en rondelles d'environ 8&nbsp;mm, mises à
            macérer une nuit avec un assaisonnement (sel, huile d'olive, origan et/ou basilic frais),
            puis déposées crues sur la pâte</li>
          </ul>`,
  "tomate", "Grappe de tomates")}
        <h3 class="sec">Les bases crème</h3>
        <p>Plusieurs dérivés de crème fraîche&nbsp;: <strong>épaisse</strong>, <strong>liquide</strong>
        (30 à 40&nbsp;% de matières grasses), <strong>de liaison</strong>.</p>
${enc("conseil", "Le conseil", `<p>Utiliser principalement la crème <strong>liquide ou de
        liaison</strong>&nbsp;: elles épaississent à la cuisson avec une quantité moindre que
        l'épaisse, et se mettent au biberon — gain de temps réel au service.</p>
        <p>La crème se pose <strong>après tous les ingrédients, juste avant d'enfourner</strong>, en
        démarrant du bord de la corniche en spirale vers le centre — <em>au contraire de la sauce
        tomate</em>.</p>`)}
        <h4 class="sous">Ce que la base crème permet</h4>
        <ul class="liste serre">
          <li>Sauces&nbsp;: poivre vert, forestière, roquefort…</li>
          <li>Crèmes de légumes&nbsp;: poivrons, cèpes, artichaut, asperge…</li>
          <li>Chorizo, spianata piquante…</li>
          <li>Saumon ou truite fumée…</li>
        </ul>
`, { chap: "Les matières premières", num: n });

  m.p(`
        <h3 class="sec">Les familles de produits</h3>
        <div class="bilan" style="grid-template-columns:1fr 1fr">
          <div class="plus" style="background:var(--papier-2);border-top-color:var(--accent)">
            <h4 style="color:var(--accent)">La mozzarella</h4>
            <ul style="list-style:none;padding:0">
              <li style="padding-left:0">Pain, brins (gros ou fins), cossette, cerise</li>
              <li style="padding-left:0"><em>Di bufala</em>, <em>fior di latte</em>, <em>provola</em></li>
            </ul>
            <h4 style="color:var(--accent);margin-top:3mm">L'emmental</h4>
            <ul style="list-style:none;padding:0"><li style="padding-left:0">Brins ou mini-dés</li></ul>
          </div>
          <div class="moins" style="background:var(--papier-2);border-top-color:var(--accent)">
            <h4 style="color:var(--accent)">Les viandes</h4>
            <ul style="list-style:none;padding:0">
              <li style="padding-left:0">Merguez, haché de bœuf, viande kebab</li>
              <li style="padding-left:0">Filet de dinde ou de poulet, magret de canard</li>
            </ul>
          </div>
        </div>
${tbl(["Famille", "Avant la cuisson", "Pendant / après la cuisson"], [
    [["Charcuterie", "fort"], "Jambon blanc, chorizo, spianata, bacon, lardons allumettes", "<strong>Après</strong>&nbsp;: jambon sec, coppa, speck, mortadelle"],
    [["Fruits de mer<br>et poissons", "fort"], "Cocktail de fruits de mer, saumon frais, thon", "<strong>Après</strong>&nbsp;: saumon ou truite fumée, anchois"],
    [["Fromages<br>d'accompagnement", "fort"], "Chèvre, brie, raclette, reblochon", "<strong>Début ou fin</strong>&nbsp;: roquefort, gorgonzola, bleu<br><strong>Fin</strong>&nbsp;: mimolette, brebis, parmesan, burrata"],
    [["Légumes &amp; fruits<br><span class='mention'>selon région et saison</span>", "fort"], "Aubergine, champignons de Paris, pomme de terre, poivrons, tomates fraîches, artichaut, asperge, oignon, olives", "Ananas, pommes fruits — souvent meilleurs posés à la sortie du four"],
  ], { compact: true })}
${duo(["mozzarella", "Mozzarella coupée en dés"], ["trancheur", "Trancheur Berkel et charcuterie"],
  "La mise en place se juge à la régularité de la coupe&nbsp;: une tranche irrégulière cuit irrégulièrement.")}
`);
  return m;
};

/* ===========================================================================
   LES QUANTITÉS
   =========================================================================== */
export const quantites = (m) => m.p(`
${chapitre(m.chapSuivant(), "Les quantités des matières premières",
  "Le grammage par diamètre. C'est ce tableau qui fait la marge autant que la carte.")}
${tbl(["Ingrédient", ["Ø 26 cm", "c"], ["Ø 29 cm", "c"], ["Ø 33 cm", "c"], ["Plaque 40 <span class='gly'>×</span> 60 cm", "c"]], [
    [["Pâton", "fort"], ["<span class='val'>200 à 220 g</span>", "c"], ["<span class='val'>240 à 260 g</span>", "c"], ["<span class='val'>280 à 300 g</span>", "c"], ["<span class='val'>1 100 à 1 300 g</span>", "c"]],
    [["Sauce tomate", "fort"], ["80 g", "c"], ["90 g", "c"], ["100 g", "c"], ["700 à 800 g", "c"]],
    [["Crème", "fort"], ["50 g", "c"], ["60 g", "c"], ["70 g", "c"], ["épaisse 500 g<br>liquide 400 g", "c"]],
    [["Charcuterie", "fort"], ["30 à 60 g", "c"], ["60 à 80 g", "c"], ["80 à 100 g", "c"], ["300 g", "c"]],
    [["Viande", "fort"], ["40 à 70 g", "c"], ["80 à 110 g", "c"], ["90 à 130 g", "c"], ["300 g", "c"]],
    [["Légumes", "fort"], ["60 à 80 g", "c"], ["80 à 100 g", "c"], ["100 à 120 g", "c"], ["350 à 450 g", "c"]],
    [["Mozzarella / emmental", "fort"], ["60 à 80 g", "c"], ["80 à 100 g", "c"], ["100 à 120 g", "c"], ["300 g", "c"]],
  ], { titre: "Quantités conseillées par taille de pizza" })}
${enc("conseil", "Pourquoi ce tableau est un outil de gestion", `<p>Vingt grammes de mozzarella en
        trop par pizza, sur cent pizzas par jour, font deux kilos&nbsp;: à peu près une journée de
        marge perdue chaque semaine. Peser pendant la formation, c'est apprendre le geste juste pour
        ne plus avoir à peser ensuite.</p>`)}
${duo(["napo-garniture", "Garnissage d'une pizza au poste"], ["mozzarella-main", "Mozzarella travaillée à la main"],
  "La régularité du grammage se voit à l'œil une fois le geste installé.")}
`, { chap: "Les quantités des matières premières", num: m._c });

/* ===========================================================================
   FICHES TECHNIQUES
   =========================================================================== */
export const fiches = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Fiches techniques", "La recette écrite, avec ses allergènes. Le document qu'un contrôle demande.")}
        <h3 class="sec">Le pâton</h3>
        <p class="mention"><strong>Nom du produit</strong>&nbsp;: pâton à pizza ·
        <strong>Type</strong>&nbsp;: pâte levée traditionnelle ·
        <strong>Quantité finale</strong>&nbsp;: 6 pâtons de 280 g (1,68 kg de pâte)</p>
${tbl(["Ingrédient", ["Quantité", "c"], "Remarques"], [
    [["Farine type 00", "fort"], ["<span class='val'>1 000 g</span>", "c"], "Riche en gluten et en protéines"],
    [["Eau", "fort"], ["<span class='val'>620 ml</span>", "c"], "Froide, environ 18&nbsp;°C"],
    [["Sel fin", "fort"], ["<span class='val'>20 g</span>", "c"], "Dissous dans l'eau"],
    [["Levure fraîche", "fort"], ["<span class='val'>3 g</span>", "c"], "Diluée dans un peu d'eau tiède"],
    [["Huile d'olive", "fort"], ["<span class='val'>25 g</span>", "c"], "En fin de pétrissage"],
  ])}
${enc("verif", "620 ml, soit 62 % d'hydratation", `<p>Le chapitre « L'eau » donne 54 à 60&nbsp;% pour
        un empâtement direct. Cette fiche est donc <strong>au-dessus de la plage annoncée</strong> —
        ce qui se défend sur une farine type 00 très forte et une maturation longue, mais mérite
        d'être dit. ${averif("valeur à confirmer — Jean-Jacques")}</p>`)}
        <div class="bilan" style="grid-template-columns:1fr 1fr">
          <div class="plus" style="background:var(--papier-2);border-top-color:var(--accent)">
            <h4 style="color:var(--accent)">Empâtement direct</h4>
            <ol class="etapes" style="font-size:8.8pt">
              <li><strong>Mélange initial</strong>&nbsp;: verser l'eau froide dans le pétrin, ajouter la farine progressivement, mélanger 2 mn</li>
              <li><strong>Incorporation</strong>&nbsp;: ajouter la levure, pétrir 10 à 12 mn ; verser le sel, pétrir 30 s à 1 mn ; ajouter l'huile</li>
              <li><strong>Pétrissage</strong>&nbsp;: jusqu'à disparition des traces d'huile et obtention d'une pâte lisse, souple et homogène — température finale 23 à 25&nbsp;°C</li>
            </ol>
          </div>
          <div class="moins" style="background:var(--papier-2);border-top-color:var(--accent)">
            <h4 style="color:var(--accent)">Semi-direct sur autolyse</h4>
            <ol class="etapes" style="font-size:8.8pt">
              <li><strong>Autolyse</strong>&nbsp;: eau froide, farine progressivement, mélanger 2 mn</li>
              <li><strong>Repos</strong>&nbsp;: 20 mn</li>
              <li><strong>Incorporation</strong>&nbsp;: levure diluée, sel dissous, huile d'olive</li>
              <li><strong>Pétrissage</strong>&nbsp;: jusqu'à une pâte lisse, souple, homogène, sans trace d'huile — 23 à 25&nbsp;°C</li>
            </ol>
          </div>
        </div>
        <h4 class="sous">Allergènes présents</h4>
        <p><strong>Gluten</strong> (farine de blé).</p>
`, { chap: "Fiches techniques", num: n, sous: "Le pâton" });

  m.p(`
<h3 class="sec" style="margin-top:0">La Margherita</h3>
        <p class="mention"><strong>Nom du produit</strong>&nbsp;: pizza Margherita ·
        <strong>Type</strong>&nbsp;: pizza classique, base tomate ·
        <strong>Quantité finale</strong>&nbsp;: 1 pizza Ø 29 cm (env. 280 g de pâte crue)</p>
${tbl(["Ingrédient", ["Quantité", "c"], "Remarques"], [
    [["Pâte à pizza", "fort"], ["<span class='val'>280 g</span>", "c"], "Pâton — voir fiche technique précédente"],
    [["Pulpe fine de tomate", "fort"], ["<span class='val'>100 g</span>", "c"], "Assaisonnée&nbsp;: sel, huile, basilic"],
    [["Mozzarella", "fort"], ["<span class='val'>100 g</span>", "c"], "Égouttée, tranchée ou en brins"],
    [["Huile d'olive extra vierge", "fort"], ["<span class='val'>5 g</span>", "c"], "Filet avant ou après cuisson"],
    [["Feuilles de basilic frais", "fort"], ["<span class='val'>4 feuilles</span>", "c"], "À ajouter après cuisson"],
  ])}
${proto([
  { n: 1, titre: "Étaler", corps: "<p>Étaler le pâton sur un plan fariné jusqu'à <strong>29 cm</strong> de diamètre.</p>" },
  { n: 2, titre: "Garnir", corps: "<p>Garnir avec la pulpe de tomate assaisonnée, puis répartir uniformément la mozzarella.</p>" },
  { n: 3, titre: "Cuire", corps: "<p>Cuire dans un four à pizza à <strong>340 – 360&nbsp;°C</strong> pendant <strong>3 à 4 mn</strong>.</p>" },
  { n: 4, titre: "Finir", corps: "<p>À la sortie du four, ajouter un filet d'huile d'olive et les feuilles de basilic.</p>" },
])}
        <h4 class="sous">Allergènes présents</h4>
        <p><strong>Gluten</strong> (farine de blé) · <strong>Lait</strong> (mozzarella) ·
        traces possibles de <strong>fruits à coque</strong> selon l'environnement de fabrication.</p>
${enc("verif", "100 g de tomate pour un Ø 29", `<p>Le tableau des quantités donne 90&nbsp;g de sauce
        et 80 à 100&nbsp;g de mozzarella pour ce diamètre. L'écart est faible mais réel&nbsp;:
        aligner l'un sur l'autre. ${averif("à trancher")}</p>`)}
`, { sous: "La Margherita" });

  m.p(`
<h3 class="sec" style="margin-top:0">Fiche vierge — à photocopier</h3>
        <p class="mention">À remplir pour chacune de vos recettes : c'est ce document qui sert à calculer un prix de revient.</p>
${tbl(["Nom de la recette", ["Date", "c"], "Procédé technique"], [
    [["<span class='arempl'>· · · · · · · · · · · · · · · · · · · ·</span>", ""], ["<span class='arempl'>· · · · · · · ·</span>", "c"], "<span class='arempl'>· · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·</span>"],
  ], { compact: true })}
${tbl(["Ingrédients", ["Unité de mesure", "c"], ["Prix / kg / L / u", "c"], ["Poids / kg / L / u", "c"], ["Coût", "d"]],
  Array.from({ length: 12 }, () => [
    "<span class='arempl'>· · · · · · · · · · · · · · · ·</span>",
    ["<span class='arempl'>· · · · ·</span>", "c"], ["<span class='arempl'>· · · · ·</span>", "c"],
    ["<span class='arempl'>· · · · ·</span>", "c"], ["<span class='arempl'>· · · · ·</span>", "d"],
  ]).concat([[["<strong>Total</strong>", ""], ["", "c"], ["", "c"], ["<strong>… kg</strong>", "c"], ["<strong>… <span class='gly'>€</span></strong>", "d"]]]),
  { compact: true })}
${enc("conseil", "Le prix au kilo de pâte", `<p>La dernière ligne, « total prix au kilo », est la
        seule qui compte pour fixer un prix de vente. Un pâton de 280&nbsp;g ne coûte que quelques
        dizaines de centimes&nbsp;: c'est la garniture qui fait le prix de revient, et c'est elle
        qu'il faut chiffrer.</p>`)}
`, { sous: "Fiche vierge", plein: true });
  return m;
};

/* ===========================================================================
   LES CONSEILS DU CUISINIER
   =========================================================================== */
export const conseils = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Les conseils du cuisinier", "Charcuteries et viandes&nbsp;: comment les préparer pour qu'elles tiennent la cuisson.")}
        <h3 class="sec">Le jambon</h3>
${tbl(["Qualité", "Comment le poser"], [
    [["Premier prix ou gamme moyenne", "fort"], "En <strong>chiffonnade</strong> (fines tranches), <strong>sous</strong> le fromage de recouvrement (mozzarella, emmental, comté). Il ne sèchera pas à la cuisson et donnera du volume à la pizza."],
    [["Jambon de qualité<br><span class='mention'>nature, aux herbes, à la truffe…</span>", "fort"], "Il est impératif de le <strong>mettre en valeur</strong>&nbsp;: toujours en chiffonnade, et déposé <strong>à la sortie du four</strong>."],
  ], { compact: true })}
        <h3 class="sec">Les lardons allumettes</h3>
        <ol class="etapes">
          <li>Les poser <strong>crus</strong> sur la pizza en début de cuisson.</li>
          <li>S'ils sont trop salés ou trop gras&nbsp;: les <strong>blanchir 1 mn</strong>, bien
          égoutter, laisser refroidir et stocker au frais dans un bac hermétique.</li>
        </ol>
        <h3 class="sec">La bolognaise</h3>
        <p class="mention">1 kg de viande · 3 oignons</p>
        <p>Dans une sauteuse, faire revenir les oignons émincés dans un filet d'huile d'olive.
        Ajouter la viande hachée et remuer pour faire suer&nbsp;; cuire environ <strong>20 mn</strong>
        à feu moyen. Saler et poivrer, verser un cinquième de tomate aromatisée ou concassée, ajouter
        un bouquet garni selon le goût et laisser cuire à petit feu <strong>30 mn</strong>. Rectifier
        l'assaisonnement.</p>
${enc("alerte", "Conservation", `<p>Réserver au frais entre <strong>2 et 4&nbsp;°C</strong>,
        <strong>48 heures maximum</strong>, dans un bac hermétique.</p>`)}
        <h3 class="sec">Le magret de canard <span class="mention">(+ 400 g)</span></h3>
        <p>Quadriller le côté gras au couteau. Mettre les magrets côté gras dans une poêle bien
        chaude afin de faire fondre le gras au maximum&nbsp;; laisser saisir <strong>2 mn</strong>
        pour que la peau soit bien dorée. Retourner côté viande, cuire environ <strong>1 mn</strong>,
        saler, poivrer et faire des allers-retours pendant <strong>7 à 8 mn</strong>. À mi-cuisson,
        sortir l'excédent de graisse pour finir sur une cuisson rosée.</p>
        <p>Laisser refroidir, réserver au froid en bacs hermétiques, puis passer au trancheur
        (<strong>3 à 4 mm</strong>). Disposer les tranches <strong>froides</strong> sur la pizza en
        fin de cuisson, avec ou sans sauce.</p>
`, { chap: "Les conseils du cuisinier", num: n });

  m.p(`
        <h3 class="sec">Le filet de volaille</h3>
        <p>Émincer les filets en lamelles d'environ <strong>1 cm</strong>, mettre dans un récipient
        en assaisonnant selon le goût. Ajouter un filet d'huile d'olive, mélanger et réserver en
        chambre froide. Laisser mariner <strong>24 heures</strong> et disposer
        <strong>cru</strong> sur la pizza, avant la cuisson.</p>
        <div class="bilan" style="grid-template-columns:1fr 1fr">
          <div class="plus" style="background:var(--papier-2);border-top-color:var(--accent)">
            <h4 style="color:var(--accent)">Poulet aux épices — 1 kg de filet</h4>
            <ul style="list-style:none;padding:0">
              <li style="padding-left:0">12 g de sel · 2 g de poivre</li>
              <li style="padding-left:0">25 g d'épices</li>
              <li style="padding-left:0">80 g d'eau</li>
            </ul>
          </div>
          <div class="moins" style="background:var(--papier-2);border-top-color:var(--accent)">
            <h4 style="color:var(--accent)">Poulet persillé — 1 kg de filet</h4>
            <ul style="list-style:none;padding:0">
              <li style="padding-left:0">12 g de sel · 2 g de poivre</li>
              <li style="padding-left:0">80 g de persillade</li>
              <li style="padding-left:0">50 g d'huile d'olive</li>
            </ul>
          </div>
        </div>
        <h3 class="sec">La sauce tomate</h3>
${tbl(["Ingrédient", ["Poids", "c"]], [
    [["Tomate concassée ou en pulpe", "fort"], ["<span class='val'>10 kg</span>", "c"]],
    [["Sel", "fort"], ["<span class='val'>120 g</span>", "c"]],
    [["Huile d'olive", "fort"], ["<span class='val'>120 g</span>", "c"]],
    [["Basilic frais", "fort"], ["<span class='val'>120 g</span>", "c"]],
    [["Origan <span class='mention'>(facultatif)</span>", "fort"], ["<span class='val'>8 g</span>", "c"]],
    [["Sucre <span class='mention'>(facultatif)</span>", "fort"], ["<span class='val'>40 à 80 g</span> <span class='mention'>suivant l'acidité et le goût</span>", "c"]],
  ], { compact: true })}
        <p>Verser la tomate dans un fût avec couvercle. Ajouter le basilic haché, l'huile d'olive et
        le sel, mélanger&nbsp;; si l'acidité est trop marquée, ajouter le sucre et remélanger.
        Réserver au frais. <strong>Conservation&nbsp;: 3 jours.</strong></p>
        <h3 class="sec">Le cocktail de fruits de mer surgelés</h3>
        <p class="mention">1 kg de fruits de mer · persillade · sel · poivre · huile d'olive</p>
        <p>Mettre à ébullition 1 litre d'eau. Dès le frémissement, verser le cocktail
        <strong>décongelé de la veille</strong>. Laisser chauffer <strong>1 mn</strong> environ,
        <strong>sans amener à ébullition</strong>. Bien égoutter, ajouter la persillade, l'huile,
        le sel et le poivre. Laisser refroidir et réserver en bac hermétique au frais.</p>
`);

  m.p(`
        <h3 class="sec">Le thon</h3>
        <ol class="etapes">
          <li><strong>Thon rouge frais</strong> — couper en fines tranches. Il peut être macéré dans
          une préparation de tomate, poivron, oignon.</li>
          <li><strong>Thon en boîte</strong> (entier ou miettes, albacore) — de qualité moyenne par
          rapport au thon rouge. Il peut être mélangé cru avec des petits légumes en dés, façon
          niçoise, et posé sur la pizza <strong>en fin de cuisson</strong>.</li>
        </ol>
        <h3 class="sec">Les champignons de Paris</h3>
        <p>Choisir des champignons très frais, en bouchons, fermes. Les nettoyer au papier absorbant
        — ou les passer rapidement sous l'eau <strong>sans les faire tremper</strong> — les émincer
        et les réserver en bac hermétique au frais.</p>
${enc("conseil", "L'astuce anti-noircissement", `<p>Pour les garder plusieurs jours, les
        <strong>tasser</strong> sans trop les abîmer&nbsp;: moins de contact avec l'air, moins
        d'oxydation.</p>`)}
        <h3 class="sec">Les pommes de terre</h3>
        <p>Utiliser des pommes de terre fraîches <strong>avec la peau</strong>. Bien les laver en les
        frottant, les cuire à la vapeur ou à l'eau <strong>sans les saler</strong>, bien égoutter,
        stocker en bacs hermétiques après refroidissement et réserver au froid. Avant le service,
        peler et couper en rondelles ou en cubes <strong>la quantité juste nécessaire</strong>.</p>
${enc("alerte", "Une fois pelées", `<p>Les pommes de terre déjà pelées ne se gardent que
        <strong>1 à 2 jours</strong> au frais.</p>`)}
        <h3 class="sec">Les poivrons</h3>
        <p>Utiliser des poivrons frais, les laver et les sécher. Brûler la peau au chalumeau, sur la
        flamme, ou au four avec les résistances supérieures seules. Quand la peau a cloqué et noirci,
        la décoller au couteau d'office, retirer les pépins et les membranes blanches, puis tailler
        en lanières ou en brunoise.</p>
        <h3 class="sec">L'ananas</h3>
        <p>Peler l'ananas frais et faire de fines tranches en carpaccio — le trancheur est souhaité.
        Réserver au frais.</p>
${enc("conseil", "Deux détails", `<p>Disposer le carpaccio d'ananas <strong>à la sortie du
        four</strong>. Et bien enlever les petits yeux disposés tout autour&nbsp;: ils sont durs et
        se remarquent immédiatement en bouche.</p>`)}
`);
  return m;
};

/* ===========================================================================
   LE MATÉRIEL
   =========================================================================== */
export const materiel = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Le matériel dans une pizzeria", "Le gros matériel — celui qui décide de l'implantation et du budget.")}
${cote(`
          <ul class="liste serre">
            <li>Four</li>
            <li>Tour réfrigéré 40 <span class='gly'>×</span> 60 cm ou GN 1/1 <span class="mention">(dimensions des bacs à pâtons)</span></li>
            <li>Vitrine réfrigérée</li>
            <li>Lave-mains fémoral</li>
            <li>Pétrin</li>
            <li>Plan de travail</li>
            <li>Trancheur</li>
            <li>Robot coupe-légumes</li>
            <li>Plonge batterie et légumes</li>
            <li>Congélateur</li>
            <li>Chambre froide</li>
            <li>Armoire réfrigérée 40 <span class='gly'>×</span> 60 cm</li>
          </ul>`,
  "petrins", "Rangée de pétrins à spirale")}
${enc("note", "À prévoir en plus", `<p><strong>Pizzeria à emporter</strong> et
        <strong>distributeur à pizzas</strong>&nbsp;: cellule de refroidissement et échelle. Sans
        cellule, on ne peut pas refroidir assez vite pour respecter la chaîne du froid, et le
        distributeur n'est pas envisageable.</p>`)}
`, { chap: "Le matériel dans une pizzeria", num: n });

  m.p(`
        <h3 class="sec">Le petit matériel</h3>
        <div class="deux-col">
          <ul class="liste serre">
            <li>Louche plate ou pochon</li>
            <li>Cornes</li>
            <li>Coupe-pâte</li>
            <li>Spatule</li>
            <li>Brosse alimentaire soie</li>
            <li>Tamis</li>
            <li>Roulette</li>
            <li>Thermomètre</li>
            <li>Bacs gastro inox avec couvercles</li>
            <li>Bacs plastiques avec couvercles <span class="mention">(mise en place)</span></li>
            <li>Bacs à pâtons 40 <span class='gly'>×</span> 60 cm ou GN 1/1</li>
            <li>Biberon plastique et biberon à valve</li>
            <li>Bassine, cul-de-poule</li>
            <li>Coutellerie</li>
            <li>Ciseaux</li>
            <li>Planche à découper</li>
            <li>Pinceau</li>
            <li>Pelle pomme</li>
            <li>Balance <span class="mention">(précision 1 g minimum)</span></li>
            <li>Pelle à enfourner</li>
            <li>Pelle à défourner</li>
            <li>Brosse pour four, laiton ou fibres naturelles</li>
            <li>Support essuie-tout</li>
            <li>Papier sulfurisé</li>
            <li>Ouvre-boîte</li>
            <li>Film alimentaire étirable</li>
            <li>Poubelle à pédale</li>
            <li>Plaque à pizza 40 <span class='gly'>×</span> 60 cm <span class="mention">(pizza traiteur)</span></li>
            <li>Rouleau à pâtisserie <span class="mention">(plaque traiteur)</span></li>
          </ul>
        </div>
${duo(["petit-materiel", "Bac de petit matériel avec sa liste manuscrite"], ["bacs-gilac", "Bacs Gilac empilés"],
  "La balance au gramme et le thermomètre sont les deux seuls outils qui rendent un protocole reproductible.")}
`);
  return m;
};

/* ===========================================================================
   L'ORGANISATION
   =========================================================================== */
export const organisation = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'organisation en pizzeria",
  "« C'est comme un chef d'orchestre avant l'ouverture du rideau. »")}
        <h3 class="sec">La mise en place</h3>
        <p>C'est la règle essentielle avant l'ouverture&nbsp;: tout doit être prêt, dans des bacs
        gastro réfrigérés.</p>
        <ul class="liste">
          <li>Les <strong>charcuteries</strong> tranchées</li>
          <li>Les <strong>fromages</strong> tranchés et/ou coupés</li>
          <li>Les <strong>viandes</strong> taillées et/ou émincées et assaisonnées, crues ou cuites</li>
          <li>Les <strong>légumes</strong> lavés, taillés et/ou émincés et assaisonnés, crus ou cuits</li>
          <li>Pour l'<strong>épicerie</strong>&nbsp;: origan, olives, crème balsamique, confitures, fruits secs…</li>
          <li>Les <strong>cartons</strong> déjà pliés et stockés dans un endroit sec</li>
        </ul>
${enc("conseil", "Le conseil", `<p>Toute la mise en place sera stockée en bacs hermétiques ou sous
        vide — <strong>attention au PEPS</strong>&nbsp;: premier entré, premier sorti. Une partie
        sera déposée dans les bacs inox pour le service, face au plan de travail, et rechargée au
        fur et à mesure des besoins.</p>`)}
        <h3 class="sec">Les pâtons</h3>
        <p>Les pâtons sont sortis <strong>à l'avance</strong> pour qu'ils soient à bonne température,
        <strong>15 à 18&nbsp;°C</strong>&nbsp;: c'est ce qui donne la facilité d'étalage et une bonne
        levée de la pâte à la cuisson.</p>
        <h3 class="sec">En face du poste de fabrication</h3>
        <ul class="liste serre">
          <li>La <strong>sauce tomate</strong> avec la louche</li>
          <li>Les <strong>crèmes</strong> et le miel, stockés dans les biberons</li>
          <li>La <strong>mozzarella</strong> ou l'emmental</li>
        </ul>
${photo("salle-cuisson", "Enfournement au four électrique",
  "Le poste de cuisson&nbsp;: tout ce qui est utile est à portée de bras, rien d'autre n'est là.")}
`, { chap: "L'organisation en pizzeria", num: m._c });

/* ===========================================================================
   LA CUISSON
   =========================================================================== */
export const cuisson = (m, { avecPlaque = false } = {}) => m.p(`
${chapitre(m.chapSuivant(), "La cuisson de la pizza",
  "Trois chaleurs travaillent en même temps. Savoir laquelle domine, c'est savoir régler son four.")}
${tbl(["Type de pizza", ["Température du four", "c"]], [
    [["Classique", "fort"], ["<span class='val'>320 – 360 °C</span>", "c"]],
    [["Contemporaine", "fort"], ["<span class='val'>360 – 380 °C</span>", "c"]],
    [["Napolitaine", "fort"], ["<span class='val'>400 – 450 °C</span>", "c"]],
    ...(avecPlaque
      ? [[["Plaque <em>In Teglia</em>", "fort"], ["<span class='val'>320 °C</span>", "c"]],
         [["<em>In Pala</em>", "fort"], ["<span class='val'>290 °C</span>", "c"]]]
      : [[["Plaque", "fort"], ["<span class='val'>320 °C</span>", "c"]]]),
  ], { titre: "La température idéale varie entre 320 et 450 °C" })}
        <h3 class="sec">Les trois chaleurs</h3>
${SC.troisChaleurs()}
${enc("conseil", "Un fond pâle, une garniture brûlée", `<p>Ce n'est pas un problème de temps, c'est
        un problème d'équilibre&nbsp;: trop de voûte, pas assez de sole. Sur un four digital, on
        corrige par la répartition ; sur un four mécanique, en descendant la voûte et en montant la
        sole de quelques degrés.</p>`)}
`, { chap: "La cuisson de la pizza", num: m._c });

/* ===========================================================================
   LES FOURS
   =========================================================================== */
export const fours = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Les fours", "Bois, gaz, électrique, hybride, convoyeur. Chaque énergie a son contrat.")}
        <h3 class="sec">Les fours à bois</h3>
${cote(`
          <p>D'un point de vue commercial, le four à bois a toujours été un gage de qualité par
          rapport à un four électrique. Le temps de cuisson est très rapide et idéal pour la
          napolitaine et la contemporaine. Le four garde sa chaleur pour le lendemain.</p>`,
  "four-bois", "Four à bois traditionnel")}
${bilan(
    ["Cuisson très rapide, idéale napolitaine et contemporaine", "Garde sa chaleur pour le lendemain", "Argument commercial fort"],
    ["Sécurité des locaux", "Sorties de fumées avec conduit isolé réglementé", "Ramonage <strong>2 fois par an</strong> — facture à l'appui pour l'assurance", "Qualité du bois (séchage) et son stockage"])}
${tbl(["Modèle", "Ce qui le caractérise"], [
    [["Four à bois traditionnel", "fort"], "Capacité de <strong>2 à 5 pizzas</strong> suivant le diamètre. On en trouve bâtis ou en kit."],
    [["Four à bois à sole rotative", "fort"], "L'évolution du traditionnel&nbsp;: <strong>gain de place</strong> (le foyer est sur le côté de la sole) et <strong>plus besoin de faire tourner les pizzas</strong> dans le four."],
  ], { compact: true })}
${photo("four-marana", "Four à sole rotative Marana Forni")}
`, { chap: "Les fours", num: n });

  m.p(`
        <h3 class="sec">Les fours à gaz</h3>
        <p>Il existe des fours à gaz pour enfourner <strong>4 à 6 pizzas</strong> à la fois par
        chambre&nbsp;; il peut y avoir une ou deux chambres superposées. Mêmes caractéristiques que
        les fours électriques.</p>
${tbl(["Modèle", "Ce qui le caractérise"], [
    [["Four à gaz à sole rotative", "fort"], "Même évolution que pour le bois&nbsp;: gain de place, plus de rotation des pizzas."],
    [["Four hybride", "fort"], "Fonctionnement bois <strong>et</strong> gaz. Ces énergies ne peuvent être utilisées que <strong>simultanément</strong>, en gardant les caractéristiques des deux."],
    [["Four convoyeur", "fort"], "Évite les rotations, cuisson parfaite et uniforme. Souvent utilisé par les chaînes et les franchises, et pratique pour une cuisson à 80&nbsp;% destinée aux distributeurs à pizzas."],
  ], { compact: true })}
        <h3 class="sec">Les fours électriques</h3>
        <p>Il existe des fours électriques pour enfourner <strong>4, 6 ou 9 pizzas</strong> à la fois
        par chambre&nbsp;; il peut y avoir une ou deux chambres superposées.</p>
${tbl(["Commande", "Ce que cela change"], [
    [["Digitale", "fort"], "Réglage beaucoup plus précis suivant les modes et les temps de cuisson (classique ou <em>teglia</em>). Fours plus récents, excellente isolation."],
    [["Mécanique", "fort"], "Réglage simple à deux boutons, affichage de 1 à 10&nbsp;: températures moins précises. Ancienne génération, moins bien isolée donc <strong>consommation plus forte</strong>. Prix plus attractifs."],
    [["Sole rotative", "fort"], "La nouveauté et l'avenir&nbsp;: gain de temps (plus de rotation dans la chambre), cuissons fiables et régulières."],
  ], { compact: true })}
${photo("four-electrique", "Enfournement dans un four électrique à chambres")}
`);

  m.p(`
        <h3 class="sec">Trois réglages, trois temps de cuisson</h3>
        <p>Le même produit, à trois couples voûte/sole différents. Plus on monte, plus on va
        vite — mais moins on a de marge d'erreur.</p>
${tbl(["", ["Voûte", "c"], ["Sole", "c"], ["Temps de cuisson", "c"]], [
    [["Réglage doux", "fort"], ["<span class='val'>320 °C</span>", "c"], ["<span class='val'>290 °C</span>", "c"], ["<span class='val'>5 mn</span>", "c"]],
    [["Réglage moyen", "fort"], ["<span class='val'>340 °C</span>", "c"], ["<span class='val'>300 °C</span>", "c"], ["<span class='val'>4 mn</span>", "c"]],
    [["Réglage rapide", "fort"], ["<span class='val'>360 °C</span>", "c"], ["<span class='val'>310 °C</span>", "c"], ["<span class='val'>3 mn 30</span>", "c"]],
  ], { titre: "Fours électriques — trois couples de température" })}
${enc("conseil", "Choisir son réglage selon le service", `<p>Le réglage rapide n'est pas
        « meilleur »&nbsp;: il ne pardonne rien. En début d'apprentissage, ou sur un service calme,
        le réglage doux laisse le temps de corriger une pizza mal placée. On monte en température
        quand le geste est sûr et que le rush l'impose.</p>`)}
${photo("four-flamme", "Flamme dans la chambre d'un four à bois")}
`);
  return m;
};

/* ===========================================================================
   LES PÉTRINS
   =========================================================================== */
export const petrins = (m) => m.p(`
${chapitre(m.chapSuivant(), "Les pétrins",
  "Trois familles, trois vitesses, trois façons de construire le réseau gluténique.")}
        <h3 class="sec">Le pétrin à spirale — à tête fixe ou relevable</h3>
${cote(`
          <p>Il permet de travailler des quantités de pâte de <strong>10 à 60 kg</strong>. Sa vitesse
          est plus rapide que celle des pétrins à bras plongeants ou à axe oblique.</p>
          <p>L'échauffement de l'empâtement dû à cette vitesse est donc accentué et demande
          <strong>plus de précision dans les temps de pétrissage</strong>, qui sont forcément plus
          courts. Du fait de sa vitesse, il accélère la formation du réseau gluténique&nbsp;:
          l'empâtement est plus lisse, avec une mie plus régulière.</p>`,
  "petrin-spirale", "Pétrin à spirale, gros plan sur la cuve")}
${tbl(["Tête", "Ce que cela change"], [
    [["Fixe", "fort"], "Plus contraignant pour sortir la pâte du pétrin et pour le nettoyage."],
    [["Relevable", "fort"], "Plus de facilité à sortir la pâte, possibilité d'enlever la cuve pour l'entretien. <strong>Plus onéreux.</strong>"],
  ], { compact: true })}
        <h3 class="sec">Le pétrin à axe oblique</h3>
        <p>Il permet de travailler des quantités de <strong>10 à 80 kg</strong>. Sa vitesse est
        <strong>deux fois plus lente</strong> que celle du pétrin à spirale. Les bras soulèvent la
        pâte et l'oxygènent davantage, ce qui développe une mie très aérée. Entretien facile, mais
        il prend beaucoup de place.</p>
        <h3 class="sec">Le pétrin à bras plongeants</h3>
        <p>Il permet de travailler de <strong>50 à 150 kg</strong>. Il reproduit au plus près les
        gestes du pizzaïolo. Le développement du réseau gluténique est plus rapide qu'à l'axe oblique
        et plus lent qu'à la spirale. Il permet un brassage beaucoup plus aéré, donc une mie plus
        développée. Son entretien est plus difficile et il prend plus de place&nbsp;: il est
        conseillé pour de <strong>gros volumes</strong>.</p>
${enc("note", "Le pétrin de l'école", `<p>Tous les protocoles de ce manuel sont écrits pour un
        <strong>pétrin à spirale de 10 à 30 litres</strong>, celui de vos postes. Sur un axe oblique
        ou des bras plongeants, les temps de pétrissage sont à rallonger — la vitesse n'est pas la
        même, le réseau met plus longtemps à se construire.</p>`)}
`, { chap: "Les pétrins", num: m._c });

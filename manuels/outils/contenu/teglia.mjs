/**
 * IN TEGLIA & IN PALA — la pizza vendue à la part.
 *
 * Utilisé par la spécialisation In Teglia & In Pala et par la seconde partie
 * du Niveau Expert.
 *
 * TROIS ERREURS DU MANUEL D'ORIGINE SONT CORRIGÉES ICI (et consignées dans
 * A-VERIFIER.md, parce qu'une correction non signalée est une correction
 * qu'on ne peut pas contester) :
 *  1. la page du protocole Biga de l'In Teglia portait l'en-tête « EMPÂTEMENT
 *     DIRECT — IN PALA », soit deux erreurs sur une ligne ;
 *  2. le protocole « Biga — In Pala » était une COPIE de celui de l'In Teglia :
 *     il faisait bouler des pâtons de 1,3 kg et les mettre en plaque, alors que
 *     l'In Pala se fait en pâtons de 600 à 900 g posés sur la pelle ;
 *  3. la répartition de chaleur de l'In Pala annonçait « sole 60 % / voûte
 *     25 % », soit 85 % — le reste des tableaux somme bien à 100 %.
 */
import { chapitre, cote, photo, duo, enc, tbl, averif, reperes, proto, bilan } from "../gabarit.mjs";

/* Le tableau de cuisson revient sur les quatre protocoles : une seule source. */
const cuissonTbl = (sole, voute, temps, pctSole) => tbl(
  ["Type de four", "Réglage", ["Sole", "c"], ["Voûte", "c"], ["Temps de cuisson", "c"]],
  [
    [["Fours électriques digitaux", "fort"], "Température totale 300&nbsp;°C",
     [`<span class='val'>${pctSole} %</span>`, "c"], [`<span class='val'>${100 - pctSole} %</span>`, "c"],
     [`<span class='val' rowspan='2'>${temps}</span>`, "c"]],
    [["Fours mécaniques", "fort"], "Réglage direct en degrés",
     [`<span class='val'>${sole} °C</span>`, "c"], [`<span class='val'>${voute} °C</span>`, "c"],
     [`<span class='val'>${temps}</span>`, "c"]],
  ], { titre: "Cuisson", compact: true });

/* ===========================================================================
   DOSAGES SUR FORTES HYDRATATIONS
   --------------------------------------------------------------------------
   Ce chapitre n'existait dans AUCUN manuel. Il est écrit pour régler un vrai
   problème : le manuel Expert donnait la levure et le sel DEUX FOIS, à trente
   pages d'écart, avec des valeurs différentes (2-4 g/kg puis 4 g/kg ;
   17-22 g/kg puis 25-30 g/kg) et sans un mot d'explication. Les deux séries
   sont justes — elles ne s'appliquent simplement pas au même produit. Le dire
   valait mieux que de laisser choisir au hasard.
   =========================================================================== */
export const dosagesFortesHydratations = (m) => m.p(`
${chapitre(m.chapSuivant(), "Les dosages sur forte hydratation",
  "Pourquoi la levure et le sel ne se dosent pas pareil à 55&nbsp;% et à 80&nbsp;% d'hydratation.")}
${enc("alerte", "Ne pas mélanger les deux séries", `<p>Les tableaux du Niveau&nbsp;I s'appliquent à
        un empâtement <strong>classique</strong>, autour de 55 à 60&nbsp;% d'hydratation. Ceux de ce
        chapitre s'appliquent à l'<em>in teglia</em>, l'<em>in pala</em> et la contemporaine, à
        <strong>70 à 90&nbsp;%</strong>. Utiliser les uns à la place des autres donne, dans un sens,
        une pâte qui ne lève pas, et dans l'autre, une pâte immangeable de sel.</p>`)}
${tbl(["", "Empâtement classique<br><span class='mention'>55 – 60 % d'hydratation</span>", "Forte hydratation<br><span class='mention'>70 – 90 %</span>"], [
    [["Levure fraîche", "fort"], ["<span class='val'>2 à 4 g / kg</span><br><span class='mention'>selon la température de la farine</span>", ""], ["<span class='val'>4 g / kg</span><br><span class='mention'>toutes saisons</span>", ""]],
    [["Levure sèche active", "fort"], ["<span class='val'>2 à 4 g / kg</span>", ""], ["<span class='val'>4 g / kg</span>", ""]],
    [["Levure sèche instantanée", "fort"], ["<span class='val'>1 à 2 g / kg</span>", ""], ["<span class='val'>2 g / kg</span>", ""]],
    [["Sel", "fort"], ["<span class='val'>17 à 22 g / kg</span>", ""], ["<span class='val'>25 à 30 g / kg</span><br><span class='mention'>selon le taux d'hydratation</span>", ""]],
  ], { titre: "Les deux séries, côte à côte" })}
        <h3 class="sec">Pourquoi ces écarts</h3>
${tbl(["Ce qui change", "L'explication"], [
    [["La levure ne varie plus avec la saison", "fort"], "Sur une pâte très hydratée, la fermentation est pilotée par le <strong>temps de repos long</strong> (2 h + 1 h + 3 à 4 h, ou une nuit au frais) et par la température de la pièce, pas par les quelques degrés de la farine. La dose se cale une fois pour toutes en haut de la plage."],
    [["Le sel monte de moitié", "fort"], "Le sel <strong>fixe l'eau</strong> et <strong>resserre le réseau gluténique</strong>. C'est lui qui rend manipulable une pâte à 80&nbsp;%&nbsp;: sans lui elle s'étale sans tenue. C'est aussi lui qui <strong>freine</strong> une fermentation qui, à cette hydratation, part très vite."],
    [["Le Lemady ou le malt apparaissent", "fort"], "Une pâte très hydratée cuit à température plus basse et plus longtemps&nbsp;: elle ne colore pas. Les sucres et enzymes apportés compensent, et donnent en même temps de la tenue à la mie."],
  ], { compact: true })}
${enc("conseil", "Le repère à retenir", `<p><strong>Plus la pâte est hydratée, plus elle a besoin de
        sel et de temps.</strong> Si vous ne deviez retenir qu'une phrase de ce chapitre, c'est
        celle-là.</p>`)}
`, { chap: "Les dosages sur forte hydratation", num: m._c });

/* ===========================================================================
   UNITÉS DE CALCUL TEGLIA / PALA
   =========================================================================== */
export const unitesTeglia = (m) => m.p(`
${chapitre(m.chapSuivant(), "Les unités de calcul",
  "Rien à voir avec la pizza classique&nbsp;: ici l'hydratation démarre à 70&nbsp;% et monte à 90&nbsp;%.")}
${tbl(["Ingrédient", ["1 kg", "c"], ["3 kg", "c"], ["10 kg", "c"]], [
    [["<strong>Farine de blé</strong>", ""], ["<span class='val'>1 kg</span>", "c"], ["<span class='val'>3 kg</span>", "c"], ["<span class='val'>10 kg</span>", "c"]],
    { groupe: "Eau, suivant le W de la farine" },
    [["W 300 — 70 à 75 %", ""], ["<span class='val'>700 à 750 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["W 330 — 75 à 80 %", ""], ["<span class='val'>750 à 800 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["W 390 — 80 à 85 %", ""], ["<span class='val'>800 à 850 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["W 420 — 85 à 90 %", ""], ["<span class='val'>850 à 900 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    { groupe: "Levure" },
    [["Fraîche", ""], ["<span class='val'>4 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["Sèche active", ""], ["<span class='val'>4 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["Sèche instantanée", ""], ["<span class='val'>2 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    { groupe: "Le reste" },
    [["Sel", ""], ["<span class='val'>25 à 30 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["Huile", ""], ["<span class='val'>30 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    { groupe: "Facultatif" },
    [["Miel", ""], ["<span class='val'>10 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["Lemady, sucre, malt", ""], ["<span class='val'>15 à 20 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
  ], { compact: true })}
${reperes([["10 unités — <em>in teglia</em>", "13", "pâtons de 1,350 kg"], ["10 unités — <em>in pala</em>", "20", "pâtons de 900 g"]])}
${enc("conseil", "Pourquoi le sel monte à 25-30 g", `<p>À 80&nbsp;% d'hydratation, une pâte salée à
        20&nbsp;g/kg se tient à peine. Le sel resserre le réseau et fixe l'eau&nbsp;: c'est lui qui
        rend une hydratation aussi haute manipulable. Le dosage suit l'hydratation, pas la
        recette.</p>`)}
`, { chap: "Les unités de calcul", num: m._c });

/* ===========================================================================
   IN TEGLIA
   =========================================================================== */
export const inTeglia = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "<em>In Teglia</em>", "La pizza en plaque, romaine, vendue au poids ou à la part. <em>Al taglio</em> = à la part.")}
${cote(`
          <p>La pizza <em>in teglia</em> est cuite dans une <strong>plaque rectangulaire</strong>,
          également connue sous le nom de pizza <em>al taglio</em>. Cette plaque, en acier ou en
          aluminium, est souvent huilée pour empêcher la pâte de coller.</p>
          <p>Ce style est originaire de <strong>Rome</strong>, apparu dans les années 1950. Vendue
          au poids, elle est idéale à emporter ou en restauration rapide, garnie de tomates, de
          mozzarella, d'huile d'olive, de basilic et de tout autre ingrédient au choix.</p>
          <p><em>In teglia</em> signifie « dans la plaque » en italien&nbsp;: <em>teglia</em>
          désigne le support de cuisson.</p>`,
  "salle-cuisson", "Enfournement d'une plaque au four électrique")}
${bilan([
    "Les fonds peuvent être faits à l'avance, cuits et non garnis, stockés emballés ou filmés en chambre froide ou au congélateur",
    "Ne nécessite pas de long temps de maturation",
    "Se sert à la part ou au poids — pizzeria, boulangerie, traiteur, snacking",
  ], [
    "Pétrissage plus long que pour une pizza classique",
    "Ne peut pas être fait en plein service (température du four plus faible)",
    "La mise en plaque demande plus de temps et de dextérité que la <em>pala</em>",
  ])}
`, { chap: "In Teglia", num: n });

  m.p(`
        <h3 class="sec">Les quantités — pour 10 kg de farine</h3>
${tbl(["Empâtement direct · W 330 à 390 · <strong>hydratation 80 % minimum</strong>", ["1<sup>re</sup> phase", "c"], ["2<sup>e</sup> phase", "c"]], [
    [["Farine W 330 – 390", "fort"], ["<span class='val'>10 kg</span>", "c"], ["—", "c"]],
    [["Eau", "fort"], ["<span class='val'>6 kg</span>", "c"], ["<span class='val'>2 kg</span>", "c"]],
    [["Levure sèche instantanée", "fort"], ["<span class='val'>20 g</span>", "c"], ["—", "c"]],
    [["<em>ou</em> fraîche / sèche active", "fort"], ["<span class='val'>40 g</span>", "c"], ["—", "c"]],
    [["Lemady", "fort"], ["<span class='val'>150 g</span>", "c"], ["—", "c"]],
    [["Sel", "fort"], ["—", "c"], ["<span class='val'>250 g</span>", "c"]],
    [["Huile", "fort"], ["—", "c"], ["<span class='val'>300 g</span>", "c"]],
  ], { compact: true })}
${tbl(["Biga 100 % · W 390 · <strong>hydratation 75 % minimum</strong>", ["1<sup>re</sup> phase", "c"], ["2<sup>e</sup> phase", "c"]], [
    [["Farine W 390", "fort"], ["<span class='val'>10 kg</span>", "c"], ["—", "c"]],
    [["Eau", "fort"], ["<span class='val'>4,5 kg</span>", "c"], ["<span class='val'>3 kg</span>", "c"]],
    [["Levure sèche instantanée", "fort"], ["<span class='val'>50 g</span>", "c"], ["—", "c"]],
    [["<em>ou</em> fraîche / sèche active", "fort"], ["<span class='val'>100 g</span>", "c"], ["—", "c"]],
    [["Lemady", "fort"], ["—", "c"], ["<span class='val'>150 g</span>", "c"]],
    [["Sel", "fort"], ["—", "c"], ["<span class='val'>250 g</span>", "c"]],
    [["Huile", "fort"], ["—", "c"], ["<span class='val'>300 g</span>", "c"]],
  ], { compact: true })}
${enc("note", "Deux voies pour un même produit", `<p>Le <strong>direct à 80&nbsp;%</strong> se fait
        dans la journée&nbsp;; la <strong>Biga à 75&nbsp;%</strong> demande une veille mais donne
        plus de goût et une pâte plus stable. Le pourcentage d'hydratation le plus bas ne veut pas
        dire une pâte plus sèche&nbsp;: la Biga en absorbe une partie avant même le pétrissage.</p>`)}
`);

  m.p(`
        <h3 class="sec">Protocole — <em>in teglia</em>, empâtement direct</h3>
${reperes([["Hydratation", "80", "% minimum"], ["T° pâte", "≤ 25", "°C"], ["Pâtons", "≈ 1,3", "kg"]])}
${proto([
  { n: 1, titre: "Première phase", corps: `
            <p>Mettre dans le pétrin la <strong>farine, la levure et le Lemady</strong> en totalité.
            Tourner <strong>1 mn</strong> — temps d'oxygénation. Ajouter <strong>60&nbsp;% de
            l'eau</strong>, soit 6&nbsp;kg. Pétrir <strong>8 mn</strong>.</p>` },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Ajouter le <strong>sel</strong> et faire un <strong>bassinage</strong> avec le restant
            d'eau (2&nbsp;kg) en alternant les vitesses 1 et 2&nbsp;: comptez environ
            <strong>5 mn</strong>. Ajouter l'<strong>huile d'olive</strong> et pétrir
            <strong>3 mn</strong>. <strong>La pâte ne doit pas dépasser 25&nbsp;°C.</strong></p>` },
  { repos: "2 h", texte: "En masse, dans une bassine, en une grosse boule couverte, à température ambiante." },
  { n: 3, titre: "Diviser et bouler", corps: `
            <p>Diviser la boule en <strong>4 parties</strong>. Faire les rabats et bouler. Mettre
            dans des bacs.</p>` },
  { repos: "1 h", texte: "Toujours couvert, à température ambiante." },
  { n: 4, titre: "Mise en boules", corps: `
            <p>Faire un dernier rabat, diviser et mettre en boules d'environ
            <strong>1,300 kg</strong> dans des bacs individuels huilés.</p>` },
  { n: 5, titre: "Deux voies possibles", corps: `
            <p><strong>A.</strong> Laisser les boules à température ambiante, <strong>22 à
            25&nbsp;°C pendant 3 à 4 h</strong>, puis plaquer.<br>
            <strong>B.</strong> Mettre les boules au repos <strong>12 à 24 h à 10-12&nbsp;°C</strong>,
            et les sortir <strong>3 à 4 h avant</strong> de les plaquer.</p>` },
  { n: 6, titre: "Plaquer", corps: `
            <p>Mettre sur le marbre une quantité suffisante de <strong>semoule extra-fine</strong>
            et y déposer l'empâtement. Effectuer les premiers gestes d'étalage, déposer sur la plaque
            <strong>légèrement huilée</strong>, terminer uniformément l'étalage sur la plaque.</p>` },
])}
${cuissonTbl(320, 240, "15 mn", 75)}
`);

  m.p(`
        <h3 class="sec">Protocole — <em>in teglia</em> sur Biga 100 %</h3>
${reperes([["Hydratation", "75", "% minimum"], ["Repos Biga", "16 – 20", "h"], ["Pâtons", "≈ 1,3", "kg"]])}
${enc("verif", "Un en-tête faux dans le manuel d'origine", `<p>Cette page portait le titre
        « <em>Empâtement direct W 330 à 390 — In Pala</em> » alors qu'elle décrit la
        <strong>Biga de l'In Teglia</strong>&nbsp;: ni le mode d'empâtement ni le produit n'étaient
        les bons. Le titre a été rétabli. ${averif("à confirmer — Jean-Jacques")}</p>`)}
${proto([
  { n: 1, titre: "Première phase — la Biga", corps: `
            <p>Faire un <strong>fraisage</strong> avec la farine, l'eau et la levure dans le pétrin,
            environ <strong>2 mn</strong>. Terminer à la main afin d'obtenir un produit
            <strong>filandreux et non homogène</strong>. Couvrir d'un torchon.</p>` },
  { repos: "16 à 20 h", texte: "À une température de <b>20 à 22 °C</b>." },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Mélanger préalablement <strong>1,5 kg d'eau</strong> avec les <strong>150 g de
            Lemady</strong> et verser sur la Biga. Laisser reposer <strong>10 mn</strong>, puis
            pétrir environ <strong>8 mn</strong>.</p>
            <p>Verser le <strong>sel</strong> et l'eau manquante (1,5 kg) par petits filets — le
            bassinage prend environ <strong>5 mn</strong>. Verser l'<strong>huile d'olive</strong> et
            pétrir à grande vitesse <strong>1 mn</strong>.</p>` },
  { repos: "2 h", texte: "En masse, en une grosse boule couverte, à <b>22 à 25 °C</b>." },
  { n: 3, titre: "Diviser et bouler", corps: `
            <p>Diviser en <strong>4 parties</strong>, faire les rabats, bouler, mettre en bacs.</p>` },
  { repos: "1 h", texte: "Couvert, à température ambiante." },
  { n: 4, titre: "Mise en boules, puis plaquage", corps: `
            <p>Dernier rabat, diviser, mettre en boules d'environ <strong>1,300 kg</strong> dans des
            bacs individuels huilés. Ensuite&nbsp;: <strong>3 à 4 h à 22-25&nbsp;°C</strong>, ou
            <strong>12 à 24 h à 10-12&nbsp;°C</strong> puis 3 à 4 h de remise en température.</p>
            <p>Étaler sur semoule extra-fine et terminer sur la plaque légèrement huilée.</p>` },
])}
${cuissonTbl(320, 240, "15 mn", 75)}
`);
  return m;
};

/* ===========================================================================
   IN PALA
   =========================================================================== */
export const inPala = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "<em>In Pala</em>", "La pizza allongée, cuite directement sur la sole, transférée à la pelle. Plus fine et plus croustillante que la <em>teglia</em>.")}
${cote(`
          <p>La pizza <em>in pala</em> est posée sur une <strong>pelle rectangulaire</strong> en bois
          ou en aluminium, qui sert à la transférer dans le four, <strong>sur la sole</strong>.</p>
          <p>Cette méthode a été créée à Naples&nbsp;; ce sont des boulangers romains, plus
          précisément du Latium, qui l'ont développée. La pizza <em>in pala</em> a la forme d'une
          pâte <strong>allongée et aplatie</strong>. Technique proche de l'<em>in teglia</em>, elle
          s'en différencie par son mode de cuisson — <strong>directement sur la pierre</strong> —
          avec un poids et un temps de cuisson inférieurs.</p>
          <p>Elle a une croûte <strong>plus fine et plus croustillante</strong> que l'<em>in
          teglia</em>.</p>`,
  "napo-pelle", "Transfert d'une pizza sur la pelle", { sens: "gauche" })}
${reperes([["Pâtons", "600 – 900", "g"], ["Four", "280 – 290", "°C"], ["Cuisson", "7 – 10", "mn"]])}
${bilan([
    "Les pâtes cuites peuvent être faites à l'avance et stockées, filmées, au frais ou au congélateur",
    "Travail facile, sans temps de maturation obligatoire",
    "Manipulation de l'étalage et mise en pelle faciles",
    "Cuisson rapide",
  ], [
    "Pétrissage plus long que pour une pizza classique",
    "Ne peut pas être fait en plein service (température du four plus faible)",
  ])}
`, { chap: "In Pala", num: n });

  m.p(`
        <h3 class="sec">Les quantités — pour 10 kg de farine</h3>
${tbl(["Empâtement direct · W 330 à 390 · <strong>hydratation 80 % minimum</strong>", ["1<sup>re</sup> phase", "c"], ["2<sup>e</sup> phase", "c"]], [
    [["Farine W 330 – 390", "fort"], ["<span class='val'>10 kg</span>", "c"], ["—", "c"]],
    [["Eau", "fort"], ["<span class='val'>6 kg</span>", "c"], ["<span class='val'>2 kg</span>", "c"]],
    [["Levure sèche instantanée", "fort"], ["<span class='val'>20 g</span>", "c"], ["—", "c"]],
    [["<em>ou</em> fraîche / sèche active", "fort"], ["<span class='val'>40 g</span>", "c"], ["—", "c"]],
    [["Lemady", "fort"], ["<span class='val'>150 g</span>", "c"], ["—", "c"]],
    [["Sel", "fort"], ["—", "c"], ["<span class='val'>250 g</span>", "c"]],
    [["Huile", "fort"], ["—", "c"], ["<span class='val'>300 g</span>", "c"]],
  ], { compact: true })}
${tbl(["Biga 100 % · W 390 · <strong>hydratation 75 % minimum</strong>", ["1<sup>re</sup> phase", "c"], ["2<sup>e</sup> phase", "c"]], [
    [["Farine W 390", "fort"], ["<span class='val'>10 kg</span>", "c"], ["—", "c"]],
    [["Eau", "fort"], ["<span class='val'>4,5 kg</span>", "c"], ["<span class='val'>3 kg</span>", "c"]],
    [["Levure sèche instantanée", "fort"], ["<span class='val'>50 g</span>", "c"], ["—", "c"]],
    [["<em>ou</em> fraîche / sèche active", "fort"], ["<span class='val'>100 g</span>", "c"], ["—", "c"]],
    [["Lemady", "fort"], ["—", "c"], ["<span class='val'>150 g</span>", "c"]],
    [["Sel", "fort"], ["—", "c"], ["<span class='val'>250 g</span>", "c"]],
    [["Huile", "fort"], ["—", "c"], ["<span class='val'>300 g</span>", "c"]],
  ], { compact: true })}
${enc("verif", "Les mêmes quantités que l'<em>in teglia</em>", `<p>À la virgule près. C'est
        cohérent — les deux produits partent du même empâtement, seuls le façonnage, le poids du
        pâton et la cuisson changent — mais autant le dire clairement plutôt que de laisser croire
        à une recopie. ${averif("à confirmer")}</p>`)}
`);

  m.p(`
        <h3 class="sec">Protocole — <em>in pala</em>, empâtement direct</h3>
${reperes([["Hydratation", "80", "% minimum"], ["Pâtons", "600 – 900", "g"], ["Longueur", "≈ 25", "cm"]])}
        <p class="mention">Le pétrissage est identique à celui de l'<em>in teglia</em> direct
        (chapitre précédent). Ce qui change commence au façonnage.</p>
${proto([
  { repos: "2 h", texte: "En masse, en une grosse boule couverte, à <b>22 à 25 °C</b>." },
  { n: 1, titre: "Diviser et faire la clé", corps: `
            <p>Diviser en masses de <strong>600 à 900 g</strong>, dans une bassine de farine
            d'étalage. Donner une forme <strong>rectangulaire d'environ 25&nbsp;cm</strong> en
            ramenant les bords vers le haut central et en les collant entre eux&nbsp;: c'est la
            <strong>clé</strong>.</p>
            <p>Les poser dans un bac Gilac 40 × 60&nbsp;cm, <strong>partie lisse dessus, clé
            dessous</strong>. Le bac contient 4 pâtons. Couvrir.</p>` },
  { repos: "1 h", texte: "Pousse à <b>22 à 25 °C</b>." },
  { n: 2, titre: "Deux voies possibles", corps: `
            <p><strong>A.</strong> Laisser à température ambiante, <strong>22 à 25&nbsp;°C pendant 3
            à 4 h</strong>.<br>
            <strong>B.</strong> Repos <strong>12 à 24 h à 10-12&nbsp;°C</strong>, puis sortir
            <strong>3 à 4 h avant</strong> la mise sur pelle.</p>` },
  { n: 3, titre: "Mise en pelle", corps: `
            <p>Prendre le pâton <strong>délicatement</strong>, le déposer sur le plan de travail
            fariné et lui donner une forme rectangulaire <strong>sans faire trop de pression</strong>,
            juste du bout des doigts, afin de <strong>garder le maximum de gaz</strong> dans la
            pâte.</p>
            <p>Déposer sur la planche en bois ou sur la pelle en aluminium en l'étirant à la
            longueur souhaitée. La glisser sur la sole et cuire.</p>` },
])}
${cuissonTbl(290, 240, "7 à 10 mn", 75)}
${enc("verif", "La répartition sole / voûte", `<p>Le manuel d'origine indiquait
        « sole 60&nbsp;% / voûte 25&nbsp;% » — soit 85&nbsp;% d'un total qui devrait faire 100. Les
        trois autres tableaux de cuisson donnent <strong>75 / 25</strong>&nbsp;; c'est cette valeur
        qui a été retenue. ${averif("à confirmer — Jean-Jacques")}</p>`)}
`);

  m.p(`
        <h3 class="sec">Protocole — <em>in pala</em> sur Biga 100 %</h3>
${reperes([["Hydratation", "75", "% minimum"], ["Repos Biga", "16 – 20", "h"], ["Pâtons", "600 – 900", "g"]])}
${enc("verif", "Le protocole d'origine était celui de l'<em>in teglia</em>", `<p>Il faisait bouler des
        pâtons de <strong>1,300 kg</strong> et les faisait <strong>plaquer</strong> — ce qui décrit
        exactement l'In Teglia, alors que la page portait le titre In Pala. Le façonnage a été
        rétabli d'après le protocole direct de l'In Pala, qui est cohérent avec le reste du
        chapitre&nbsp;: pâtons de 600 à 900 g, clé dessous, mise sur pelle.
        ${averif("À VALIDER en priorité — Jean-Jacques")}</p>`)}
${proto([
  { n: 1, titre: "Première phase — la Biga", corps: `
            <p>Fraisage avec la farine, l'eau et la levure au pétrin, environ <strong>2 mn</strong>.
            Terminer à la main pour obtenir un produit filandreux et non homogène. Couvrir d'un
            torchon.</p>` },
  { repos: "16 à 20 h", texte: "À une température de <b>20 à 22 °C</b>." },
  { n: 2, titre: "Deuxième phase", corps: `
            <p>Mélanger <strong>1,5 kg d'eau</strong> avec les <strong>150 g de Lemady</strong>,
            verser sur la Biga, laisser reposer <strong>10 mn</strong>, pétrir environ
            <strong>8 mn</strong>.</p>
            <p>Verser le <strong>sel</strong> et l'eau manquante (1,5 kg) en bassinage,
            <strong>5 mn</strong> environ. Verser l'<strong>huile</strong> et pétrir à grande vitesse
            <strong>1 mn</strong>.</p>` },
  { repos: "2 h", texte: "En masse, en une grosse boule couverte, à <b>22 à 25 °C</b>." },
  { n: 3, titre: "Façonnage <em>in pala</em>", corps: `
            <p>Diviser en masses de <strong>600 à 900 g</strong>. Forme rectangulaire d'environ
            25&nbsp;cm, bords ramenés vers le haut central et collés — la <strong>clé</strong>.
            Poser en bac Gilac, partie lisse dessus, clé dessous, 4 pâtons par bac, couvrir.</p>` },
  { repos: "1 h", texte: "Pousse à <b>22 à 25 °C</b>, puis 3 à 4 h à température ambiante, ou 12 à 24 h à 10-12 °C." },
  { n: 4, titre: "Mise en pelle", corps: `
            <p>Étirer du bout des doigts pour garder le gaz, déposer sur la pelle, glisser sur la
            sole.</p>` },
])}
${cuissonTbl(290, 240, "7 à 10 mn", 75)}
`);
  return m;
};

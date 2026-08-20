/**
 * SOCLE — les matières premières (chapitres « théorie » du Niveau I).
 *
 * C'est la partie commune à Niveau I, RS 7404, Niveau I option hygiène et
 * Niveau I Pro. Le Niveau II, l'Expert et l'In Teglia en reprennent un
 * sous-ensemble (farine, W, levure, eau, sel, huile, substitutions,
 * adjonctions, unités de calcul).
 *
 * Toutes les valeurs viennent du manuel Niveau I d'origine (v. 14/01/2026).
 * Là où le manuel se contredit lui-même, la contradiction est signalée par
 * un encadré « à vérifier » plutôt que tranchée en douce — cf. A-VERIFIER.md.
 */
import { chapitre, cote, photo, duo, enc, tbl, averif, reperes , retenir } from "../gabarit.mjs";
import * as SC from "../schemas.mjs";

/* ===========================================================================
   L'HISTOIRE DE LA PIZZA
   =========================================================================== */
export const histoire = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'histoire de la pizza",
  "Une pâte à pain garnie, cuite au four. Tout le reste est une affaire de deux mille ans de variations.")}
${cote(`
          <p>La pizza est une préparation alimentaire qui consiste en une pâte à pain garnie de
          différents ingrédients, principalement de la sauce tomate et de la mozzarella, et qui
          est cuite au four. Elle est originaire d'Italie et est aujourd'hui très populaire dans
          le monde entier.</p>
          <p>L'histoire de la pizza remonte à l'Antiquité, où les anciens Romains préparaient déjà
          une sorte de pain garni de légumes et d'autres ingrédients. Cependant, la pizza telle que
          nous la connaissons aujourd'hui est née en Italie au <span style="white-space:nowrap">XVIII<sup>e</sup></span> siècle&nbsp;:
          les boulangers italiens préparaient des pains garnis de tomates, d'ail et d'huile d'olive,
          cuits au four et vendus dans les rues.</p>`,
  "four-flamme", "Flamme dans un four à bois", { sens: "gauche" })}
        <p>La pizza est devenue très populaire à Naples au <span style="white-space:nowrap">XIX<sup>e</sup></span> siècle,
        et a commencé à se répandre dans le reste du pays puis dans le monde. Au cours du
        <span style="white-space:nowrap">XX<sup>e</sup></span> siècle, elle est devenue un plat international, et de
        nombreuses variantes ont été créées, avec des garnitures allant des légumes aux viandes en
        passant par les fruits de mer.</p>
        <p>Aujourd'hui, la pizza est préparée et consommée dans le monde entier, avec des
        ingrédients et des styles de cuisson très variés. Elle est considérée comme l'un des plats
        les plus populaires et les plus appréciés de la cuisine internationale.</p>
${enc("note", "Cinq ingrédients", `<p>Farine, eau, levure, sel — et l'huile d'olive, qui est le
        cinquième élément mais n'est pas indispensable. Tout ce manuel tient dans la manière
        d'assembler ces cinq-là.</p>`)}
`, { chap: "L'histoire de la pizza", num: m._c });

/* ===========================================================================
   LES CÉRÉALES · LE BLÉ TENDRE ET LE BLÉ DUR
   =========================================================================== */
export const cereales = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Les céréales",
  "Famille des poacées (les graminées). Elles produisent les grains comestibles que l'on moud en farine.")}
        <div class="panneaux">
          <div class="alerte">
            <h4>Céréales contenant du gluten</h4>
            <ul>
              <li>Blé · Seigle · Orge · Épeautre</li>
              <li>Kamut (cousin du blé dur)</li>
              <li>Triticale</li>
              <li>Avoine <span class="mention">(dans certains cas)</span></li>
            </ul>
          </div>
          <div class="sur">
            <h4>Céréales sans gluten</h4>
            <ul>
              <li>Maïs · Riz · Sorgho</li>
              <li>Quinoa · Sarrasin · Millet · Teff</li>
              <li>Pois · Fèves · Lupin</li>
            </ul>
          </div>
        </div>
${enc("alerte", "L'avoine, un cas à part", `<p>L'avoine ne contient pas de gluten au sens strict,
        mais elle est presque toujours cultivée, transportée et moulue avec du blé&nbsp;: la
        contamination croisée est la règle, pas l'exception. Une farine d'avoine n'est « sans
        gluten » que si elle est certifiée comme telle.</p>`)}
${cote(`
          <h3 class="sec">Le blé tendre et le blé dur</h3>
          <p>Le blé tendre et le blé dur diffèrent principalement par la composition de leur
          <strong>albumen</strong>, la partie du grain située entre la coque extérieure et le germe.</p>
          <p>Le <strong>blé dur</strong> a un albumen vitreux contenant une quantité élevée de
          protéines et de gluten, ce qui lui donne une texture ferme. Il sert à produire les pâtes
          alimentaires, la semoule, le boulgour, le couscous.</p>
          <p>Le <strong>blé tendre</strong> a un albumen qui contient moins de protéines et de
          gluten. Sa texture est plus douce&nbsp;: c'est lui qui donne la farine de boulangerie, de
          pâtisserie — et de pizza.</p>`,
  "farine-bassine", "Farine versée dans une bassine")}
${tbl(["Au broyage", "Blé dur", "Blé tendre"], [
    ["Taille des particules", ["<span class='val'>150 à 500 µm</span>", "c"], ["<span class='val'>30 à 200 µm</span>", "c"]],
    ["Granulométrie", ["Grosses particules", "c"], ["Particules plus fines", "c"]],
    ["Destination", ["<strong>Pasta</strong> — pâtes, semoule, couscous", "c"], ["<strong>Panification</strong> — pain, pizza, pâtisserie", "c"]],
  ], { titre: "Ce que le broyage sépare", compact: true })}
        <p class="mention">µm = micromètre, unité de mesure mille fois plus petite qu'un millimètre.</p>
${retenir([
  "Le <strong>blé tendre</strong> fait la farine de pizza&nbsp;; le blé dur fait les pâtes. Ce n'est pas une question de qualité mais d'albumen.",
  "Six céréales portent du gluten, dix n'en portent pas — et l'<strong>avoine</strong> n'en porte pas mais en côtoie toujours.",
])}
`, { chap: "Les céréales", num: n, sous: "Le blé tendre et le blé dur" });
  return m;
};

/* ===========================================================================
   LE CARYOPSE
   =========================================================================== */
export const caryopse = (m) => m.p(`
${chapitre(m.chapSuivant(), "Le caryopse, ou le grain",
  "Trois parties, trois destins&nbsp;: l'amande devient farine, les enveloppes deviennent son, le germe part avec les issues.")}
        <div class="cote cote-large">
          <div>
${tbl(["Partie du grain", "Ce qu'elle contient", ["Part du grain", "d"]], [
    ["<strong>Albumen</strong> ou amande", "Albumen amylacé (l'amidon), assise protéique. C'est ce qui devient la farine.", ["<span class='val'>82 à 85 %</span>", "d"]],
    ["<strong>Péricarpe</strong> (le son)", "Épicarpe, mésocarpe, endocarpe, testa, bande hyaline, couche à aleurone. Riche en fibres et en minéraux.", ["<span class='val'>13 à 15 %</span>", "d"]],
    ["<strong>Embryon</strong> ou germe", "Scutellum, axe embryonnaire. Riche en lipides — c'est ce qui fait rancir une farine complète.", ["<span class='val'>env. 3 %</span>", "d"]],
  ], { compact: true })}
${enc("note", "Pourquoi le germe part", `<p>Le germe est gras. Laissé dans la farine, il la fait
        rancir en quelques semaines. C'est la raison pour laquelle une farine blanche se garde
        longtemps et une farine complète beaucoup moins&nbsp;: la conservation est le prix du
        raffinage.</p>`)}
          </div>
          <img src="assets/img/patons.jpg" alt="Pâtons en gros plan">
        </div>
${SC.caryopse()}
${retenir([
  "L'<strong>amande</strong> fait 82 à 85&nbsp;% du grain&nbsp;: c'est elle, et elle seule, qui devient la farine blanche.",
  "Le <strong>germe</strong> est gras. C'est parce qu'on le retire qu'une farine blanche se garde, et qu'une complète rancit.",
])}
`, { chap: "Le caryopse", num: m._c });

/* ===========================================================================
   LE GLUTEN
   =========================================================================== */
export const gluten = (m) => m.p(`
${chapitre(m.chapSuivant(), "Le gluten",
  "Ce n'est pas un ingrédient&nbsp;: c'est un réseau qui se construit sous vos mains, pendant le pétrissage.")}

${SC.reseauGluten()}
        <h3 class="sec">Ce que permet le réseau</h3>
        <ul class="liste">
          <li>Retenir le gaz carbonique produit par les levures pendant la fermentation</li>
          <li>Former de fines alvéoles dans la mie</li>
          <li>Prendre du volume durant la cuisson</li>
          <li>Donner de l'élasticité à la pâte</li>
          <li>Retenir l'eau dans la pâte</li>
        </ul>
${enc("conseil", "Le geste qui change tout", `<p>Si la pâte est mélangée à vitesse rapide, le réseau
        de gluten sera plus important. C'est le levier le plus direct dont vous disposez au pétrin —
        avant même la farine.</p>`)}
        <p>On appelle <strong>farines panifiables</strong> celles qui, comme le blé, contiennent
        suffisamment de gluten pour que la pâte lève. Sans gluten, une pâte est beaucoup plus
        cassante et friable&nbsp;: elle ne se lie pas.</p>
${enc("verif", "Terminologie à unifier", `<p>Les manuels d'origine emploient indifféremment
        « maille glutamique », « maille glutineuse » et « réseau gluténique », et écrivent parfois
        <em>glutamine</em> au lieu de <em>gluténine</em>. Trois mots pour une seule chose, et une
        protéine mal nommée. Ce manuel retient <strong>gluténine</strong> et <strong>réseau
        gluténique</strong> partout. ${averif("à valider — Jean-Jacques")}</p>`)}
${retenir([
  "Le gluten <strong>n'existe pas dans la farine sèche</strong>&nbsp;: il se forme quand l'eau et le pétrissage réunissent la gliadine et la gluténine.",
  "Ce réseau est un <strong>filet</strong>. Sans lui, le gaz de la levure traverse la pâte et s'échappe.",
  "Pétrir <strong>vite</strong> développe le réseau — c'est le levier le plus direct au pétrin, avant même de changer de farine.",
])}
`, { chap: "Le gluten", num: m._c });

/* ===========================================================================
   L'ÉVOLUTION DES MOUTURES
   =========================================================================== */
export const moutures = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'évolution des moutures",
  "De la pierre au cylindre&nbsp;: à chaque progrès technique, une farine plus régulière.")}
        <div class="proto">
          <div class="phase" data-n="1">
            <div class="phase-t">Égypte antique</div>
            <p>La mouture se fait manuellement, en écrasant les grains entre des pierres ou dans des
            mortiers. Méthode très longue, peu efficace, et qui ne donne pas une farine de qualité
            constante.</p>
          </div>
          <div class="phase" data-n="2">
            <div class="phase-t">Au Moyen Âge</div>
            <p>Apparition des moulins à eau et à vent. Plus rapides et plus efficaces que la mouture
            manuelle, ils restent limités par la puissance de l'eau et du vent.</p>
          </div>
          <div class="phase" data-n="3">
            <div class="phase-t">Au <span style="white-space:nowrap">XIX<sup>e</sup></span> siècle</div>
            <p>L'invention du <strong>moulin à cylindres</strong> permet d'obtenir une farine de
            qualité supérieure, plus rapidement. C'est la révolution de la meunerie moderne.</p>
          </div>
          <div class="phase" data-n="4">
            <div class="phase-t">Aujourd'hui</div>
            <p>Les moulins modernes combinent broyeurs à cylindres, tamiseurs et équipements de
            tri pour produire des farines de qualités différentes, calibrées selon les besoins.</p>
          </div>
        </div>
${duo(["farine-cuve", "Farine versée dans la cuve d'un pétrin"], ["fleurage", "Fleurage&nbsp;: farine jetée sur le marbre"],
  "La régularité d'une farine industrielle est ce qui rend un protocole reproductible d'un jour à l'autre.")}
${retenir([
  "Ce que la meunerie moderne a apporté n'est pas la finesse, c'est la <strong>régularité</strong>.",
  "Un protocole n'est reproductible que parce que la farine du lundi ressemble à celle du vendredi.",
])}
`, { chap: "L'évolution des moutures", num: m._c });

/* ===========================================================================
   LA FARINE — fabrication, sac et stockage
   =========================================================================== */
export const farineFabrication = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "La farine", "Poudre obtenue après mouture des grains de céréales. Cinq sous-chapitres&nbsp;: comment elle est faite, comment elle est vendue, comment elle est classée, ce qui fait sa qualité, et l'indice qui la résume.")}
        <h3 class="sec">9.1 · La fabrication de la farine</h3>
        <div class="proto">
          <div class="phase" data-n="1"><div class="phase-t">Réception</div><p>Contrôle du blé à l'arrivée au moulin.</p></div>
          <div class="phase" data-n="2"><div class="phase-t">Stockage</div><p>En silo, au sec et ventilé.</p></div>
          <div class="phase" data-n="3"><div class="phase-t">Nettoyage</div><p>Élimination des impuretés, des pierres, des grains cassés.</p></div>
          <div class="phase" data-n="4"><div class="phase-t">Préparation</div><p>Conditionnement du grain avant broyage (humidification contrôlée).</p></div>
          <div class="phase" data-n="5"><div class="phase-t">Mouture</div><p>Broyage à cylindres et tamisage successifs. En sortent le <strong>son</strong>, les <strong>farines</strong> et les <strong>gruaux</strong>.</p></div>
        </div>
        <h3 class="sec">Le taux d'extraction</h3>
        <p>Pour <strong>100&nbsp;kg de blé</strong>, la quantité moyenne de farine que l'on cherche
        le plus souvent à obtenir est de <strong>75&nbsp;kg</strong>. Il y a environ
        <strong>2&nbsp;%</strong> de perte, et les <strong>23&nbsp;%</strong> restants forment
        ce que la meunerie appelle les « issues ».</p>
${reperes([["Blé entrant", "100", "kg"], ["Farine", "75", "kg"], ["Issues", "23", "kg"], ["Pertes", "2", "kg"]])}
        <p>La farine la plus blanche est faite essentiellement avec l'amande du grain. Elle est très
        pure parce que son <strong>taux de cendres</strong> — la quantité de débris minéraux encore
        mélangés — est très faible.</p>
`, { chap: "La farine", num: n, sous: "9.1 La fabrication de la farine" });

  m.p(`
        <h3 class="sec">9.2 · Le sac de farine et le stockage</h3>
${cote(`
          <h4 class="sous">a. Mentions obligatoires sur le sac</h4>
          <p>La loi européenne prévoit que le sac porte ces <strong>cinq informations
          obligatoires</strong>&nbsp;:</p>
          <ol class="etapes">
            <li>La <strong>DLUO</strong> (date limite d'utilisation optimale)</li>
            <li>Le <strong>type</strong> (raffinage)</li>
            <li>Le <strong>nom du moulin</strong> ou du producteur</li>
            <li>Le <strong>taux d'humidité</strong> — 15,5&nbsp;% maximum</li>
            <li>Le <strong>poids</strong></li>
          </ol>`,
  "farine-cuve2", "Sac de farine versé dans la cuve")}
        <h4 class="sous">b. Conditions de stockage</h4>
        <ul class="liste">
          <li>Un local <strong>sec et ventilé</strong>, à <strong>16&nbsp;°C maximum</strong></li>
          <li>Stocker les sacs <strong>sur palette</strong> pour laisser passer l'air et éviter que la farine ne se prenne en blocs</li>
          <li>Une protection contre les <strong>rongeurs et les insectes</strong></li>
        </ul>
        <h4 class="sous">Un exemple de code couleur — 5 Stagioni</h4>
        <p>Le W ne figure pas sur les sacs&nbsp;: certains moulins le signalent par la couleur du
        conditionnement. Chez 5 Stagioni, sur la gamme <em>Farina di grano</em>&nbsp;:</p>
${tbl(["Force", "Couleur du sac", "Force", "Couleur du sac"], [
    [["W 200", "fort"], "Bleu clair", ["W 330", "fort"], "Bleu foncé"],
    [["W 250", "fort"], "Vert", ["W 390", "fort"], "Rouge"],
    [["W 300", "fort"], "Napoletana", ["W 420", "fort"], "Marron"],
  ], { compact: true })}
${tbl(["Gamme <em>Biologica</em>", "Force"], [
    ["Biologica", ["W 250", "fort"]],
    ["Biologica integrale", ["W 330", "fort"]],
  ], { compact: true })}
${enc("verif", "Un repère de marque, pas une norme", `<p>Ce code couleur appartient à un seul
        meunier et peut changer d'une gamme à l'autre. Vérifier la fiche technique du moulin avant
        de s'y fier. ${averif("gamme en cours à confirmer")}</p>`)}
`, { sous: "9.2 Le sac de farine et le stockage" });
  return m;
};

/* ===========================================================================
   LES TYPES DE FARINE (RAFFINAGE)
   =========================================================================== */
export const farineTypes = (m, { autonome = false } = {}) => {
  const n = autonome ? m.chapSuivant() : null;
  return m.p(`
${autonome
  ? chapitre(n, "Le type de farine (raffinage)",
      "Six types en France, cinq en Italie. Le classement se fait au taux de cendres.")
  : '<h3 class="sec">9.3 · Les types de farine (raffinage)</h3>'}
        <p>C'est en fonction du <strong>poids de cendres contenu dans 100&nbsp;g de matières
        sèches</strong> que l'on désigne les grands types de farine. Les cendres sont des matières
        minérales, principalement contenues dans le son. Il existe <strong>six types en
        France</strong> et <strong>cinq en Italie</strong>.</p>
${tbl([["Type France", ""], ["<em>Tipo</em> Italie", ""], ["Taux de cendres", "c"], ["Taux d'extraction", "c"], "Utilisation"], [
    [["T45", "fort"], "—", ["0,50 moyen", "c"], ["67", "c"], "Pizza, pâtisserie"],
    [["T55", "fort"], ["<em>00</em>", "c"], ["0,50 à 0,60", "c"], ["75", "c"], "Pizza, pains blancs"],
    [["T65", "fort"], ["<em>0</em>", "c"], ["0,62 à 0,75", "c"], ["78", "c"], "Pizza, baguette de tradition, pains spéciaux"],
    [["T80", "fort"], ["<em>1</em>", "c"], ["0,75 à 0,90", "c"], ["80 – 85", "c"], "Pains semi-complets"],
    [["T110", "fort"], ["<em>2</em>", "c"], ["1,00 à 1,20", "c"], ["85 – 90", "c"], "Pains complets"],
    [["T150", "fort"], ["<em>Integrale</em>", "c"], ["plus de 1,40", "c"], ["92 – 98", "c"], "Pains complets ou autres"],
  ], { titre: "Le raffinage et les types — France / Italie" })}
${enc("conseil", "Comment lire ce tableau", `<p>De haut en bas, la farine devient plus complète&nbsp;:
        plus de cendres, plus de son, plus de fibres. Conséquence directe au pétrin&nbsp;: elle
        <strong>boit davantage</strong> d'eau, la fermentation <strong>ralentit</strong>, et la
        pâte est <strong>plus dense</strong>. Descendre d'une ligne, c'est ajouter de l'eau et du
        temps.</p>`)}
${SC.raffinage()}
`, autonome
  ? { chap: "Le type de farine (raffinage)", num: n }
  : { sous: "9.3 Les types de farine (raffinage)" });
};

/* ===========================================================================
   LA QUALITÉ DE LA FARINE
   =========================================================================== */
export const farineQualite = (m) => m.p(`
        <h3 class="sec">9.4 · La qualité de la farine</h3>
        <p class="intro">La farine est une poudre obtenue après mouture de grains de céréales.
        Sa qualité — c'est-à-dire son <strong>W</strong> — dépend de la <strong>qualité de ses
        protéines</strong>.</p>
${reperes([["Le climat", "1"], ["La nature du sol", "2"], ["La qualité de la semence", "3"]])}
        <p class="legende" style="margin-top:-2mm">Les trois facteurs dont dépend la qualité de la farine, en amont du moulin.</p>
        <h4 class="sous">Deux familles de protéines</h4>
${tbl(["Famille", "Protéines", "Rôle"], [
    [["Solubles", "fort"], "Globuline et albumine <span class='mention'>(env. 15 %)</span>", "Ne participent pas au réseau."],
    [["Non solubles", "fort"], "Gliadine et <strong>gluténine</strong>", "Forment le <strong>réseau gluténique</strong> au contact de l'eau."],
  ], { compact: true })}
${enc("note", "La règle", `<p>Plus la farine est riche en protéines, plus le réseau gluténique
        sera fort, et plus le <strong>W</strong> sera élevé. C'est toute la logique du chapitre
        suivant.</p>`)}
${cote(`
          <h4 class="sous">Ce que cela change au poste</h4>
          <p>Une farine faible en protéines donne une pâte qui s'étale sans résister, mais qui ne
          tient pas une longue maturation&nbsp;: elle se relâche, le pâton s'affaisse.</p>
          <p>Une farine forte tient plusieurs jours au froid mais résiste à l'étalage tant qu'elle
          n'a pas eu le temps de se détendre. Elle demande de l'anticipation.</p>`,
  "maturation", "Pâtons en maturation, alvéoles visibles", { sens: "gauche" })}
`, { sous: "9.4 La qualité de la farine" });

/* ===========================================================================
   L'INDICE DE FORCE (W)
   =========================================================================== */
export const farineW = (m, { autonome = false } = {}) => {
  const n = autonome ? m.chapSuivant() : null;
  m.p(`
${autonome
  ? chapitre(n, "L'indice de force de la farine (W)",
      "L'indice qui dit ce qu'une farine sait faire — et ce qu'elle ne saura pas faire.")
  : '<h3 class="sec">9.5 · L\'indice de force de la farine (W)</h3>'}
        <p>Le <strong>W</strong> est l'indice de qualité de la farine. <strong>Il ne figure pas sur
        les sacs.</strong> Il est calculé en laboratoire par des appareils spéciaux, dont
        l'<strong>alvéographe de Chopin</strong>, qui mesure l'extensibilité et la ténacité de la
        pâte.</p>
${tbl([["Indice W", ""], "Usage"], [
    [["W 120 – 150", "fort"], "Biscuits et crackers"],
    [["W 200 – 250", "fort"], "Pizzas faites avec des empâtements <strong>directs à levage court</strong>"],
    [["W 250 – 310", "fort"], "Pizzas <strong>napolitaines</strong>"],
    [["W 330 – 390", "fort"], "Pizzas faites avec des empâtements <strong>directs à levage long</strong> et <strong>indirects</strong>"],
    [["W 400 – 430", "fort"], "Farines de force dites <strong>Manitoba</strong>, qui servent à renforcer des farines plus faibles"],
  ], { titre: "À quoi sert quelle force" })}
${enc("conseil", "Le repère qui compte", `<p>Le seuil pratique à retenir est <strong>W 330</strong>&nbsp;:
        en dessous, la farine ne tient pas une pré-fermentation de 16 à 20 heures (Biga) ni une
        maturation longue. C'est la frontière entre le Niveau&nbsp;I et le Niveau&nbsp;II.</p>`)}
${photo("etalage-formateur", "Étalage par le formateur, pizza en cours")}
`, autonome
  ? { chap: "L'indice de force de la farine (W)", num: n }
  : { sous: "9.5 L'indice de force de la farine (W)" });

  m.p(`
        <h3 class="sec">Lire un alvéogramme</h3>
        <p>L'alvéographe insuffle de l'air dans un disque de pâte jusqu'à le faire éclater, et trace
        la courbe de la résistance. Cinq symboles s'en déduisent&nbsp;:</p>
${tbl([["Symbole", ""], "Signification"], [
    [["P — Pression", "fort"], "Mesure la <strong>ténacité</strong>, la fermeté de la pâte et sa résistance à la déformation."],
    [["G — Gonflement", "fort"], "Correspond à la quantité d'air insufflée à la pâte jusqu'à son éclatement."],
    [["L — Largeur", "fort"], "Longueur du graphique&nbsp;: il représente l'<strong>extensibilité</strong> de la courbe et indique l'élasticité de la pâte et l'allongement au façonnage."],
    [["W — <em>Work</em> (travail)", "fort"], "Mesure le travail nécessaire pour déformer le pâton jusqu'à son éclatement. On parle aussi de <strong>force boulangère</strong>."],
    [["P/L", "fort"], "Rapport qui traduit l'<strong>équilibre</strong> — ou le déséquilibre — entre la ténacité et l'extensibilité."],
  ])}
${enc("note", "Le P/L, l'indice qu'on oublie", `<p>Deux farines de même W peuvent se comporter à
        l'opposé l'une de l'autre. Un P/L élevé donne une pâte tenace qui revient sous les doigts&nbsp;;
        un P/L bas, une pâte molle qui se déchire. Pour la pizza, on cherche un P/L compris entre
        <strong>0,50 et 0,70</strong> — c'est d'ailleurs ce qu'imposent les cahiers des charges
        napolitains.</p>`)}
${SC.alveographe()}
`);
  return m;
};

/* ===========================================================================
   LA LEVURE
   =========================================================================== */
export const levure = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "La levure",
  "Un champignon microscopique, <em>Saccharomyces cerevisiae</em>. Il mange le sucre de la farine et rend du gaz et de l'alcool.")}
${cote(`
          <p>La levure est un micro-organisme très répandu dans la nature. La production de levure
          industrielle pour la panification a commencé au début du siècle dernier. En panification,
          on utilise la variété <em>Saccharomyces cerevisiae</em> — la levure de bière, ou de
          boulanger.</p>
          <p>Elle a la particularité d'utiliser les sucres simples pour deux raisons&nbsp;: elle
          s'en nourrit, et elle possède la propriété de transformer les sucres naturellement
          présents dans la farine en <strong>dioxyde de carbone</strong> et en
          <strong>alcool</strong>. Cette transformation se nomme la
          <strong>fermentation alcoolique</strong>.</p>`,
  "levure", "Levure fraîche émiettée sur une planche")}
        <h3 class="sec">Quatre types de levure en pizzeria</h3>
${tbl(["Type", "Particularité"], [
    [["Levure fraîche", "fort"], "La référence de l'école. Se conserve au froid, s'émiette."],
    [["Levure sèche active", "fort"], "<strong>À réhydrater.</strong> L'eau doit être à 38&nbsp;°C — <strong>ne jamais dépasser 50&nbsp;°C</strong>, la levure meurt."],
    [["Levure sèche instantanée", "fort"], "S'incorpore directement à la farine. Dosage divisé par deux."],
    [["Levain", "fort"], "Écosystème microbien naturel, liquide ou solide. Demande un entretien quotidien."],
  ], { compact: true })}
${enc("alerte", "La température tue", `<p>Délayée dans de l'eau <strong>froide</strong>, la levure
        voit son action ralentie. Dans de l'eau <strong>tiède</strong> (au-dessus de 40&nbsp;°C),
        elle est affaiblie. Dans de l'eau <strong>chaude</strong> (au-dessus de 50&nbsp;°C), elle
        est <strong>détruite</strong>. Un empâtement qui ne lève pas commence presque toujours par
        là.</p>`)}
`, { chap: "La levure", num: n });

  m.p(`
        <h3 class="sec">Le rôle de la levure</h3>
        <ul class="liste">
          <li>Elle assure la <strong>levée de la pâte</strong> par sa production de dioxyde de carbone, donc la légèreté et l'alvéolage du produit fini</li>
          <li>Elle contribue à la <strong>formation des arômes</strong> par la production d'alcool</li>
        </ul>
        <h3 class="sec">Avec ou sans air</h3>
${tbl(["Mode de vie", "Ce qui se passe"], [
    [["Vie aérobie", "fort"], "En présence d'air, la levure respire&nbsp;: l'énergie utilisée lui permet de <strong>se reproduire</strong>."],
    [["Vie anaérobie", "fort"], "En l'absence d'air, elle puise son énergie dans la <strong>fermentation des sucres</strong>, qu'elle transforme en alcool. C'est cette fonction qui est utilisée en fabrication industrielle."],
  ], { compact: true })}
${cote(`
          <h3 class="sec">La reproduction</h3>
          <p>La cellule de levure se reproduit par bourgeonnement d'une cellule mère&nbsp;: en une
          heure environ, elle en produit une autre parfaitement identique.</p>
          <p style="margin-top:3mm"><strong>1&nbsp;g de levure fraîche = 10 milliards de cellules.</strong></p>`,
  "poolish-bol", "Pré-ferment dans un bol, vu de dessus", { sens: "gauche" })}
${enc("alerte", "Trop de levure", `<p>Une dose de levure excessivement élevée ne permet pas de
        respecter les étapes de la panification. Elle conduit à une pâte à pizza peu savoureuse et
        à un <strong>rassissement très rapide</strong>. Le goût vient du temps, pas de la levure.</p>`)}
${SC.levure()}
`);

  m.p(`
        <h3 class="sec">Le dosage</h3>
        <p>La dose de levure varie en fonction des <strong>techniques de fermentation</strong>
        (directe, indirecte), des <strong>modes de pétrissage</strong>, et des <strong>conditions
        de température et d'hygrométrie</strong> environnantes.</p>
${reperes([["Fraîche", "2 – 4", "g / kg"], ["Sèche active", "2 – 4", "g / kg"], ["Sèche instantanée", "1 – 2", "g / kg"]])}
        <p class="legende" style="margin-top:-2mm">Doses maximales admises par kilo de farine, selon les saisons.</p>
${tbl([["Température de la farine", ""], ["Levure fraîche", "c"], ["Sèche active à réhydrater", "c"], ["Sèche instantanée", "c"]], [
    [["10 à 16 °C", "fort"], ["<span class='val'>4 g</span>", "c"], ["<span class='val'>4 g</span>", "c"], ["<span class='val'>2 g</span>", "c"]],
    [["16,1 à 21 °C", "fort"], ["<span class='val'>3,5 g</span>", "c"], ["<span class='val'>3,5 g</span>", "c"], ["<span class='val'>1,75 g</span>", "c"]],
    [["21,1 à 26 °C", "fort"], ["<span class='val'>3 g</span>", "c"], ["<span class='val'>3 g</span>", "c"], ["<span class='val'>1,5 g</span>", "c"]],
    [["26,1 à 31 °C", "fort"], ["<span class='val'>2,5 g</span>", "c"], ["<span class='val'>2,5 g</span>", "c"], ["<span class='val'>1,25 g</span>", "c"]],
    [["31,1 à 36 °C", "fort"], ["<span class='val'>2 g</span>", "c"], ["<span class='val'>2 g</span>", "c"], ["<span class='val'>1 g</span>", "c"]],
  ], { titre: "Dose par kilo de farine, selon la température de la farine" })}
${enc("conseil", "Lire le tableau à l'envers", `<p>Plus la farine est chaude, <strong>moins</strong>
        on met de levure&nbsp;: la chaleur fait déjà le travail. C'est la même logique que le calcul
        de la température de l'eau (chapitre suivant) — on compense la saison, on ne la subit pas.</p>`)}
        <h4 class="sous">Incorporation</h4>
        <p>La levure peut être <strong>émiettée dans la farine</strong> en début de pétrissage, ou
        <strong>délayée dans l'eau de coulage</strong> si la température de celle-ci est modérée.
        La levure fraîche a son action optimale pour une pâte dont la température se situe entre
        <strong>21 et 27&nbsp;°C</strong> suivant la saison.</p>
${retenir([
  "La levure transforme les sucres de la farine en <strong>gaz</strong> et en <strong>alcool</strong> — la levée et les arômes sortent de la même réaction.",
  "Au-dessus de <strong>50&nbsp;°C</strong>, elle meurt. Un empâtement qui ne lève pas commence presque toujours par là.",
  "Plus la farine est chaude, <strong>moins</strong> on met de levure&nbsp;: la chaleur fait déjà le travail.",
])}
`);
  return m;
};

/* ===========================================================================
   L'EAU
   =========================================================================== */
export const eau = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "L'eau (H<sub>2</sub>O)",
  "L'eau servant au pétrissage se nomme <strong>eau de coulage</strong>. Trois choses comptent&nbsp;: sa qualité, sa quantité, sa température.")}
${cote(`
          <h3 class="sec">Ce que fait l'eau de coulage</h3>
          <ul class="liste">
            <li>Elle <strong>hydrate la farine</strong></li>
            <li>Elle <strong>dissout</strong> le sel et la levure</li>
            <li>Elle permet au gluten de se former en <strong>réseau</strong></li>
            <li>Elle est indispensable au développement de la <strong>fermentation</strong> et aux actions enzymatiques</li>
          </ul>`,
  "eau", "Eau versée dans un pichet doseur")}
        <h3 class="sec">Les critères de l'eau</h3>
        <p>L'eau doit être <strong>potable</strong> — critères organiques, chimiques et
        bactériologiques conseillés par l'Organisation mondiale de la santé.</p>
${tbl(["Critère", "Exigence"], [
    [["Organique", "fort"], "Incolore, limpide, inodore, sans goût."],
    [["Chimique", "fort"], "Lorsqu'elle contient des sels de calcium ou de magnésium (craie, chaux, plâtre), on dit que l'eau est <strong>calcaire</strong> ou <em>séléniteuse</em>."],
  ], { compact: true })}
        <h3 class="sec">La dureté</h3>
        <p>La dureté est la conséquence de la présence de sels minéraux. Elle se mesure en
        <strong>degré français</strong> (°f ou °fH — à ne pas confondre avec °F, le degré
        Fahrenheit). Un degré français correspond à 4&nbsp;mg de calcium ou 2,4&nbsp;mg de magnésium
        par litre d'eau.</p>
${tbl([["Titre hydrotimétrique", ""], "Qualification", "Effet sur la pâte"], [
    [["0 à 7 °f", "fort"], "Eau très douce", "Pâte collante. Probabilité d'apparition de bulles à la cuisson."],
    [["7 à 15 °f", "fort"], "Eau douce", "Pâte collante&nbsp;; on peut ajouter un peu de sel."],
    [["15 à 30 °f", "fort"], "Eau plutôt dure", "<strong>Idéale pour la pâte.</strong>"],
    [["30 à 40 °f", "fort"], "Eau dure", "Pâte dure et peu levée&nbsp;; utiliser un adoucisseur."],
    [["plus de 40 °f", "fort"], "Eau très dure", "Pâte dure et peu levée&nbsp;; adoucisseur nécessaire."],
  ])}
`, { chap: "L'eau", num: n });

  m.p(`
${enc("verif", "Deux versions dans le manuel d'origine", `<p>Le texte annonçait « douce jusqu'à
        5&nbsp;° », « moyennement dure entre 15 et 30&nbsp;° » et « dure&nbsp;: plus de 20&nbsp;° » —
        trois seuils qui se chevauchent et qui ne correspondent pas au tableau ci-dessus. C'est le
        <strong>tableau</strong> qui a été retenu ici, parce qu'il est cohérent de bout en bout.
        ${averif("à confirmer — Jean-Jacques")}</p>`)}
        <h3 class="sec">Corriger une eau mal adaptée</h3>
${tbl(["Problème", "Correction"], [
    [["Eau douce", "fort"], "On peut ajouter un peu de sel en plus dans la pâte."],
    [["Eau dure", "fort"], "On doit utiliser un <strong>adoucisseur</strong>."],
  ], { compact: true })}
        <h3 class="sec">Le taux d'hydratation</h3>
        <p>C'est la quantité d'eau nécessaire pour hydrater le kilo de farine, par rapport à sa
        force. Le taux minimum d'hydratation est de <strong>54&nbsp;%</strong>, jusqu'à
        <strong>60&nbsp;%</strong> avec un empâtement direct. Il est toujours possible de rajouter
        de l'eau si l'on substitue une partie de la farine de base par une autre — farine complète,
        semi-complète, soja, châtaigne, seigle, orge, mix.</p>
${tbl([["Force de la farine", ""], ["Hydratation minimale", "c"], ["Eau pour 1 kg de farine", "c"]], [
    [["W 200", "fort"], ["<span class='val'>54 %</span>", "c"], ["<span class='val'>540 g</span>", "c"]],
    [["W 250", "fort"], ["<span class='val'>55 %</span>", "c"], ["<span class='val'>550 g</span>", "c"]],
    [["W 300", "fort"], ["<span class='val'>56 %</span>", "c"], ["<span class='val'>560 g</span>", "c"]],
    [["W 330", "fort"], ["<span class='val'>57 %</span>", "c"], ["<span class='val'>570 g</span>", "c"]],
    [["W 390", "fort"], ["<span class='val'>59 %</span>", "c"], ["<span class='val'>590 g</span>", "c"]],
    [["W 420", "fort"], ["<span class='val'>60 %</span>", "c"], ["<span class='val'>600 g</span>", "c"]],
  ], { titre: "Hydratation minimale selon la force" })}
${enc("conseil", "Gardez toujours un verre d'eau", `<p>Sur chaque protocole de ce manuel, une
        consigne revient&nbsp;: <em>garder toujours un verre d'eau pour le bassinage</em>. Le
        tableau donne un point de départ, pas une vérité&nbsp;: la farine du jour, l'hygrométrie du
        labo et la substitution éventuelle décalent toujours un peu le résultat. Les deux ou trois
        derniers pourcents se versent à la main, en regardant la pâte.</p>`)}
`);
  return m;
};

/* ===========================================================================
   LE CALCUL DE LA TEMPÉRATURE DE L'EAU — TB 50
   =========================================================================== */
export const temperature = (m) => m.p(`
${chapitre(m.chapSuivant(), "Le calcul de la température de l'eau",
  "La température de base&nbsp;: un chiffre de référence qui garantit une pâte régulière, été comme hiver.")}
        <p>La <strong>température de base</strong> est un chiffre de référence utilisé dans une
        formule de calcul, afin d'obtenir une température optimale en fin de pétrissage — gage de
        régularité dans le déroulement de l'activité fermentaire et du travail de la pâte.</p>
        <p>Après plusieurs années d'expérience, nous appliquons une formule simple et efficace,
        dite <strong>TB&nbsp;50</strong>&nbsp;:</p>
${tbl(["Saison", ["T° farine", "c"], ["<span class='gly'>×</span> 2 = Y", "c"], ["TB <span class='gly'>−</span> Y", "c"], ["Eau de coulage", "c"], ["T° de la pâte visée", "c"]], [
    [["Été", "fort"], ["24 °C", "c"], ["48", "c"], ["50 <span class='gly'>−</span> 48", "c"], ["<span class='val'>2 °C</span>", "c"], ["22 à 24 °C", "c"]],
    [["Printemps / automne", "fort"], ["17 °C", "c"], ["34", "c"], ["50 <span class='gly'>−</span> 34", "c"], ["<span class='val'>16 °C</span>", "c"], ["22 à 25 °C", "c"]],
    [["Hiver", "fort"], ["10 °C", "c"], ["20", "c"], ["50 <span class='gly'>−</span> 20", "c"], ["<span class='val'>30 °C</span>", "c"], ["22 à 27 °C", "c"]],
  ], { titre: "La formule appliquée aux trois saisons" })}
${SC.temperatureBase()}
        <h3 class="sec">Le cas extrême de l'été</h3>
${tbl(["Saison", ["T° farine", "c"], ["<span class='gly'>×</span> 2 = Y", "c"], ["TB <span class='gly'>−</span> Y", "c"], ["Eau de coulage", "c"]], [
    [["Été caniculaire", "fort"], ["28 °C", "c"], ["56", "c"], ["50 <span class='gly'>−</span> 56", "c"], ["<span class='val impossible'><span class='gly'>−</span> 6 °C</span>", "c"]],
  ], { compact: true })}
${retenir([
  "<strong>TB 50</strong>&nbsp;: température de la farine × 2, puis 50 moins ce résultat = l'eau de coulage.",
  "Plus la farine est chaude, plus l'eau doit être froide. Quand le calcul donne l'impossible, c'est la farine qu'il fallait rafraîchir la veille.",
])}
`, { chap: "Le calcul de la température de l'eau", num: m._c });

/* ===========================================================================
   LE SEL
   =========================================================================== */
export const sel = (m) => m.p(`
${chapitre(m.chapSuivant(), "Le sel",
  "Il freine la fermentation, resserre le réseau, colore la croûte et fait le goût. Quatre effets pour un seul ingrédient.")}
${cote(`
          <p>Le <strong>sel gemme</strong> est extrait des mines ou des carrières provenant de
          dépôts géologiques&nbsp;; le <strong>sel marin</strong> est recueilli par évaporation de
          l'eau de mer dans les marais salants.</p>
          <h3 class="sec">Rôle du sel en panification</h3>
          <ul class="liste serre">
            <li>Il <strong>freine et régularise</strong> la fermentation</li>
            <li>Il contribue à la <strong>fixation de l'eau</strong> et améliore la rétention gazeuse</li>
            <li>Il participe à la bonne <strong>coloration de la croûte</strong> et à son croustillant</li>
            <li>Il <strong>améliore la saveur</strong> du produit fini</li>
            <li>Il <strong>retarde l'oxydation</strong> de la pâte, qui reste blanche</li>
          </ul>`,
  "sel", "Sel qui s'écoule d'une main")}
        <h3 class="sec">Sur le réseau gluténique</h3>
        <p>Le sel améliore les qualités plastiques de la pâte en renforçant sa ténacité, son
        élasticité et sa maniabilité&nbsp;: il <strong>renforce le réseau gluténique</strong>, la
        gliadine devenant moins soluble. Dans l'eau salée il se forme une plus grande quantité de
        gluten, avec des fibres plus courtes liées entre elles par attraction électrostatique.</p>
        <h3 class="sec">Deux propriétés à connaître</h3>
${tbl(["Propriété", "Effet"], [
    [["Antiseptique", "fort"], "<strong>Positif</strong> — il brûle les micro-organismes responsables du développement des moisissures.<br><strong>Négatif</strong> — il brûle aussi les cellules de levure et diminue le développement de l'anhydride carbonique."],
    [["Hygroscopique", "fort"], "Il augmente la densité de la pâte&nbsp;: on peut l'hydrater davantage sans la rendre collante. Il améliore la conservation de la pâte et retarde sa dessiccation."],
  ], { compact: true })}
${reperes([["Dose usuelle", "17 – 22", "g / kg de farine"]])}
${enc("alerte", "Jamais avec la levure", `<p>Le sel se verse <strong>petit à petit, en fin de
        pétrissage</strong>, et jamais en contact direct avec la levure&nbsp;: mis ensemble dans
        l'eau, il en tue une partie avant même le démarrage.</p>`)}
${retenir([
  "Il <strong>renforce le réseau</strong>&nbsp;: la gliadine devient moins soluble.",
  "Dose usuelle&nbsp;: <strong>17 à 22&nbsp;g par kilo de farine</strong> — et jamais en contact direct avec la levure.",
])}
`, { chap: "Le sel", num: m._c });

/* ===========================================================================
   L'HUILE
   =========================================================================== */
export const huile = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "L'huile",
  "Le cinquième élément — celui dont on peut se passer, et dont la napolitaine se passe.")}
${cote(`
          <p>L'huile d'olive est le cinquième élément des ingrédients d'une pâte à pizza,
          <strong>mais elle n'est pas indispensable</strong>.</p>
          <p>Dans la pâte, elle permet de <strong>figer le pâton</strong> durant sa maturation en
          chambre froide et évite qu'il ne s'affaisse. Elle a pour fonction de
          <strong>lubrifier</strong> la pâte et de lui donner un peu de souplesse et d'élasticité.</p>
          <p>Elle intervient surtout sur l'<strong>empâtement direct</strong>, afin de maintenir les
          pâtons en forme et bien ronds pendant un temps de maturation de 1 à 5 jours.</p>`,
  "huile", "Filet d'huile d'olive versé", { sens: "gauche" })}
${enc("note", "La napolitaine, sans huile", `<p>La « Pizza Napolitaine », reconnue par le patrimoine
        mondial de l'UNESCO, <strong>ne contient pas d'huile d'olive</strong> dans la pâte. La pâte
        napolitaine est faite pour être utilisée très rapidement, sans maturation longue&nbsp;: elle
        n'a pas besoin d'être figée. L'huile arrive sur la garniture, pas dans l'empâtement.</p>`)}
${reperes([["Dose usuelle", "25", "g / kg de farine"], ["Moment", "En fin", "de pétrissage"]])}
`, { chap: "L'huile", num: n });

  m.p(`
        <h3 class="sec">Les catégories d'huile d'olive</h3>
${tbl(["Catégorie", ["Acidité", "c"], "Caractéristiques organoleptiques"], [
    [["Huile d'olive <strong>extra vierge</strong>", ""], ["<span class='val'>&lt; 0,8 %</span>", "c"], "Absence de défaut, présence de fruité."],
    [["Huile d'olive <strong>vierge</strong>", ""], ["<span class='val'>max. 2 %</span>", "c"], "Peu de défauts (3,5 / 10), présence de fruité."],
    [["Huile d'olive <strong>premier prix</strong>", ""], ["<span class='val'>&gt; 3,3 %</span>", "c"], "Défauts marqués (6 / 10)."],
  ], { titre: "Acidité et défauts" })}
        <p class="mention">Échelle des défauts&nbsp;: 0 = aucun défaut, 10 = défauts maximaux.</p>
${cote(`
          <h3 class="sec">Deux huiles, deux usages</h3>
          <p>Une <strong>huile de pétrissage</strong> n'a pas besoin d'être exceptionnelle&nbsp;:
          elle sera chauffée à 320&nbsp;°C et ses arômes disparaîtront. Une huile vierge fait
          l'affaire.</p>
          <p>Une <strong>huile de finition</strong>, versée à la sortie du four, est goûtée telle
          quelle&nbsp;: c'est là que l'extra vierge se justifie, et c'est le seul endroit où le
          client la perçoit.</p>`,
  "huile-verre", "Huile d'olive dans un verre")}
`);
  return m;
};

/* ===========================================================================
   LES UNITÉS DE CALCUL
   =========================================================================== */
export const unites = (m) => m.p(`
${chapitre(m.chapSuivant(), "Les unités de calcul",
  "Une unité = 1 kg de farine. Tout le reste s'en déduit, et se multiplie.")}
${tbl(["Ingrédient", ["1 kg", "c"], ["3 kg", "c"], ["10 kg", "c"]], [
    [["<strong>Farine de blé</strong>", ""], ["<span class='val'>1 kg</span>", "c"], ["<span class='val'>3 kg</span>", "c"], ["<span class='val'>10 kg</span>", "c"]],
    { groupe: "Eau, suivant le W de la farine" },
    [["W 200 — 54 %", ""], ["<span class='val'>540 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["W 250 — 55 %", ""], ["<span class='val'>550 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["W 300 — 56 %", ""], ["<span class='val'>560 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["W 330 — 57 %", ""], ["<span class='val'>570 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["W 390 — 59 %", ""], ["<span class='val'>590 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["W 420 — 60 %", ""], ["<span class='val'>600 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    { groupe: "Les autres ingrédients" },
    [["Huile", ""], ["<span class='val'>25 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["Sel", ""], ["<span class='val'>20 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    { groupe: "Levure" },
    [["Fraîche", ""], ["<span class='val'>2 à 4 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["Sèche active", ""], ["<span class='val'>2 à 4 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["Sèche instantanée", ""], ["<span class='val'>1 à 2 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    { groupe: "Facultatif" },
    [["Miel", ""], ["<span class='val'>0,6 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
    [["Sucre, malt", ""], ["<span class='val'>1,8 g</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"], ["<span class='arempl'>· · · · · ·</span>", "c"]],
  ], { titre: "L'unité de calcul de l'empâtement direct", compact: true })}
${enc("conseil", "À compléter pendant le stage", `<p>Les colonnes 3&nbsp;kg et 10&nbsp;kg sont
        volontairement laissées vides&nbsp;: c'est l'exercice. Une unité de calcul donne environ
        <strong>1,68&nbsp;kg de pâte</strong>, soit six pâtons de 280&nbsp;g — à vous de trouver
        combien en donnent dix.</p>`)}
${SC.uniteCalcul()}
`, { chap: "Les unités de calcul", num: m._c });

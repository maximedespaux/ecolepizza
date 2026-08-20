/**
 * SPÉCIALISATION PIZZA NAPOLITAINE — manuel CRÉÉ, il n'en existait aucun.
 *
 * D'OÙ VIENNENT LES VALEURS
 * Deux cahiers des charges différents coexistent, et l'école forme sur les
 * deux. Ils ne disent PAS la même chose — jusqu'à inverser sole et voûte :
 *  · la STG — règlement (UE) n° 97/2010, « Pizza Napoletana », spécialité
 *    traditionnelle garantie. C'est le texte européen, opposable ;
 *  · l'AVPN — <em>disciplinare</em> 2024 de l'<em>Associazione Verace Pizza
 *    Napoletana</em>, cahier des charges privé de l'association qui délivre
 *    l'agrément et auprès de laquelle l'école est certifiée.
 *
 * Ces deux jeux de valeurs sont déjà implémentés dans le calculateur
 * d'empâtement d'Impasto (`NAPO_SPECS` dans FicheRecette.jsx) : ce manuel et
 * l'application disent la même chose, volontairement.
 *
 * Le troisième jeu, « École », correspond aux réglages retenus par
 * Jean-Jacques pour la formation. Il est signalé comme tel.
 */
import { chapitre, cote, photo, duo, enc, tbl, averif, reperes, proto, bilan , retenir } from "../gabarit.mjs";
import * as SC from "../schemas.mjs";

/* ===========================================================================
   HISTOIRE ET RECONNAISSANCES
   =========================================================================== */
export const histoireNapo = (m) => m.p(`
${chapitre(m.chapSuivant(), "La pizza napolitaine",
  "Un produit protégé par un règlement européen, et une association qui délivre un agrément. Deux choses distinctes.")}
${cote(`
          <p class="intro">La <em>pizza napoletana</em> est née à Naples. Ce qui la distingue d'une
          pizza « italienne » ordinaire n'est pas une recette secrète&nbsp;: c'est un
          <strong>cahier des charges écrit</strong>, avec des valeurs mesurables.</p>
          <p>Elle se reconnaît à son <em>cornicione</em> — le bord soufflé, de 1 à 2&nbsp;cm — à son
          centre très fin, à ses taches brunes de cuisson (la <em>leopardatura</em>), et à un temps
          de cuisson qui se compte en secondes.</p>`,
  "napo-four", "Pizza napolitaine dans le four à bois")}
        <h3 class="sec">Deux reconnaissances à ne pas confondre</h3>
${tbl(["", "STG — Spécialité traditionnelle garantie", "AVPN — <em>Vera Pizza Napoletana</em>"], [
    [["Nature", "fort"], "Signe officiel européen, inscrit au <strong>règlement (UE) n° 97/2010</strong>.", "Cahier des charges <strong>privé</strong> d'une association napolitaine (<em>disciplinare</em>, version 2024)."],
    [["Ce qu'il protège", "fort"], "Une <strong>recette et un savoir-faire</strong>, pas une origine géographique&nbsp;: on peut faire une <em>Pizza Napoletana</em> STG hors d'Italie.", "L'usage de la marque et du logo <em>Vera Pizza Napoletana</em>."],
    [["Qui contrôle", "fort"], "Organisme certificateur, selon le droit européen.", "L'association elle-même, par agrément et visite."],
    [["Ce que l'école en fait", "fort"], "Le référentiel enseigné en formation.", "L'école est <strong>agréée AVPN</strong>&nbsp;: c'est ce cahier qui s'applique à ses propres productions."],
  ])}
${enc("note", "Pourquoi ce manuel donne les deux", `<p>Parce qu'ils ne disent pas la même chose. Sur
        la farine, la levure, la fermentation et jusqu'à la répartition sole/voûte du four, les deux
        textes divergent. Un pizzaïolo qui vise l'agrément AVPN et un pizzaïolo qui revendique la STG
        ne travaillent pas exactement pareil&nbsp;: autant le savoir.</p>`)}
`, { chap: "La pizza napolitaine", num: m._c });

/* ===========================================================================
   LES DEUX CAHIERS DES CHARGES — LE TABLEAU CENTRAL
   =========================================================================== */
export const cahiers = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Les deux cahiers des charges",
  "Le tableau à connaître par cœur. Trois colonnes&nbsp;: le texte européen, le cahier de l'association, et le réglage de l'école.")}
${tbl(["", "STG <span class='mention'>UE 97/2010</span>", "AVPN <span class='mention'>2024</span>", "École <span class='mention'>formation</span>"], [
    { groupe: "La farine" },
    [["Type", "fort"], "<em>Tipo 00</em> (T45/T55)", "<em>00</em>, ou <em>0</em>&nbsp;; <em>tipo 1</em> admis à 5-20 %", "<em>Tipo 00</em>"],
    [["Force W", "fort"], ["<span class='val'>220 – 380</span>", ""], ["<span class='val'>250 – 320</span>", ""], ["<span class='val'>280 – 310</span>", ""]],
    [["P/L", "fort"], ["<span class='val'>0,50 – 0,70</span>", ""], ["<span class='val'>0,50 – 0,70</span> <span class='mention'>(idéal 0,60)</span>", ""], "—"],
    [["Absorption", "fort"], ["<span class='val'>55 – 62 %</span>", ""], ["<span class='val'>55 – 62 %</span>", ""], "—"],
    [["Gluten sec", "fort"], ["<span class='val'>9,5 – 11 %</span>", ""], ["<span class='val'>9,5 – 11,5 %</span>", ""], "—"],
    [["Protéines", "fort"], "—", ["<span class='val'>11,5 – 13,5 %</span>", ""], "—"],
    { groupe: "La recette, pour 1 litre d'eau" },
    [["Sel", "fort"], ["<span class='val'>50 – 55 g</span>", ""], ["<span class='val'>40 – 60 g</span>", ""], "—"],
    [["Levure fraîche", "fort"], ["<span class='val'>3 g</span>", ""], ["<span class='val'>0,1 – 3 g</span>", ""], "Table du manuel Niveau I"],
    [["Farine", "fort"], ["<span class='val'>1,8 kg</span>", ""], ["<span class='val'>1,600 – 1,800 kg</span>", ""], "—"],
    [["Hydratation obtenue", "fort"], ["<span class='val'>env. 55,5 %</span>", ""], ["<span class='val'>55,5 – 62,5 %</span>", ""], ["<span class='val'>jusqu'à 68 %</span>", ""]],
    [["Huile dans la pâte", "fort"], ["<strong>Aucune</strong>", ""], ["<strong>Aucune</strong>", ""], ["<strong>Aucune</strong>", ""]],
    { groupe: "La fermentation" },
    [["Température", "fort"], ["<span class='val'>25 °C</span>", ""], ["<span class='val'>18 – 20 °C</span>, 60-70 % HR", ""], "—"],
    [["Déroulé", "fort"], "Pointage <strong>2 h</strong> puis apprêt <strong>4 à 6 h</strong>", "Deux étapes, chambre contrôlée", "—"],
    [["pH de la pâte", "fort"], ["<span class='val'>5,87</span>", ""], "—", "—"],
    { groupe: "Le pâton et la pizza" },
    [["Poids du pâton", "fort"], ["<span class='val'>180 – 250 g</span>", ""], ["<span class='val'>200 – 280 g</span>", ""], "—"],
    [["Diamètre", "fort"], ["<span class='val'>max. 35 cm</span>", ""], ["<span class='val'>22 – 35 cm</span>", ""], "—"],
    [["Épaisseur au centre", "fort"], ["<span class='val'>0,4 cm</span>", ""], ["<span class='val'>env. 0,4 cm</span>", ""], "—"],
    [["<em>Cornicione</em>", "fort"], ["<span class='val'>1 – 2 cm</span>", ""], "Surélevé", "—"],
  ], { titre: "STG, AVPN, École — valeurs comparées", compact: true })}
`, { chap: "Les deux cahiers des charges", num: n });

  m.p(`
        <h3 class="sec">La cuisson — là où les deux textes se contredisent</h3>
${tbl(["", "STG <span class='mention'>UE 97/2010</span>", "AVPN <span class='mention'>2024</span>"], [
    [["Sole", "fort"], ["<span class='val'>485 °C</span>", "c"], ["<span class='val'>380 – 430 °C</span>", "c"]],
    [["Voûte", "fort"], ["<span class='val'>430 °C</span>", "c"], ["<span class='val'>485 °C</span>", "c"]],
    [["Temps", "fort"], ["<span class='val'>60 à 90 s</span>", "c"], ["<span class='val'>60 à 90 s</span>", "c"]],
    [["Four", "fort"], ["Four à bois", "c"], ["Four à bois — gaz et électrique acceptés s'ils sont conformes", "c"]],
    [["T° de la pâte en fin de cuisson", "fort"], ["<span class='val'>60 – 65 °C</span>", "c"], ["—", "c"]],
  ], { compact: true })}
${enc("alerte", "Sole et voûte sont inversées d'un texte à l'autre", `<p>Ce n'est pas une coquille de
        ce manuel&nbsp;: les deux cahiers des charges donnent bien des valeurs
        <strong>croisées</strong>. Conséquence pratique&nbsp;: un four réglé pour la STG cuit
        davantage par le dessous, un four réglé AVPN davantage par le dessus. Le temps, lui, est le
        même dans les deux cas — <strong>60 à 90 secondes</strong>.</p>`)}
${enc("verif", "À trancher pour la formation", `<p>Le manuel ne peut pas enseigner les deux réglages
        en même temps devant le même four. Il faut décider lequel est celui de l'école — a priori
        l'AVPN, puisque l'école est agréée. ${averif("à trancher — Jean-Jacques")}</p>`)}
${photo("napo-four", "Cuisson d'une napolitaine dans le four à bois",
  "Soixante à quatre-vingt-dix secondes. Le geste de rotation est ce qui décide de la régularité.")}
${retenir([
  "La <strong>STG</strong> est un règlement européen&nbsp;; l'<strong>AVPN</strong> est le cahier privé de l'association qui délivre l'agrément.",
  "Ils divergent sur la farine, la levure, la fermentation — et jusqu'à <strong>inverser sole et voûte</strong>.",
])}
`);
  return m;
};

/* ===========================================================================
   UNITÉ DE CALCUL NAPOLITAINE
   =========================================================================== */
export const uniteNapo = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'unité de calcul napolitaine",
  "Attention&nbsp;: ici l'unité de base est le <strong>litre d'eau</strong>, pas le kilo de farine. C'est l'inverse du reste du manuel.")}
${enc("alerte", "Ne pas confondre les deux logiques", `<p>Dans toutes les autres formations de
        l'école, l'unité de calcul part d'<strong>1 kg de farine</strong> et l'eau s'en déduit
        (54 à 60&nbsp;%). Les deux cahiers des charges napolitains font l'inverse&nbsp;: ils partent
        d'<strong>1 litre d'eau</strong> et donnent la farine. Sur une même feuille, les deux
        raisonnements donnent des nombres très différents&nbsp;— vérifiez toujours de quel côté vous
        partez.</p>`)}
${tbl(["Base : 1 litre d'eau", ["STG", "c"], ["AVPN", "c"]], [
    [["Eau", "fort"], ["<span class='val'>1 L</span>", "c"], ["<span class='val'>1 L</span>", "c"]],
    [["Sel", "fort"], ["<span class='val'>50 à 55 g</span>", "c"], ["<span class='val'>40 à 60 g</span>", "c"]],
    [["Levure fraîche", "fort"], ["<span class='val'>3 g</span>", "c"], ["<span class='val'>0,1 à 3 g</span>", "c"]],
    [["Farine <em>tipo 00</em>", "fort"], ["<span class='val'>1,800 kg</span>", "c"], ["<span class='val'>1,600 à 1,800 kg</span>", "c"]],
    [["Huile", "fort"], ["<strong>0</strong>", "c"], ["<strong>0</strong>", "c"]],
    [["Hydratation résultante", "fort"], ["<span class='val'>env. 55,5 %</span>", "c"], ["<span class='val'>55,5 à 62,5 %</span>", "c"]],
  ], { titre: "Ce que donne un litre d'eau" })}
        <h3 class="sec">Combien de pâtons&nbsp;?</h3>
        <p>Un litre d'eau et 1,8 kg de farine donnent environ <strong>2,850 kg de pâte</strong>
        (eau + farine + sel + levure). À 250 g le pâton, cela fait environ
        <strong>11 pizzas</strong>&nbsp;; à 200 g, environ <strong>14</strong>.</p>
${reperes([["Pâte obtenue", "env. 2,85", "kg"], ["Pâtons de 250 g", "env. 11", "pizzas"], ["Pâtons de 200 g", "env. 14", "pizzas"]])}
        <h4 class="sous">Conversion&nbsp;: du litre d'eau au kilo de farine</h4>
        <p>Pour retrouver la logique habituelle de l'école&nbsp;: <strong>1 kg de farine</strong>
        correspond à <strong>555 ml d'eau</strong> en STG (55,5&nbsp;%), et de <strong>555 à
        625 ml</strong> en AVPN. Le sel passe alors à <strong>28 à 31 g/kg</strong> en STG, soit
        nettement plus que les 17 à 22&nbsp;g de la pizza classique.</p>
${enc("conseil", "Le sel napolitain surprend", `<p>Près du double de la pizza classique, à
        hydratation pourtant modérée. C'est la contrepartie d'une pâte sans huile et à fermentation
        courte&nbsp;: le sel est le seul frein dont dispose le pizzaïolo, et il porte tout le goût.</p>`)}
${retenir([
  "On part d'un <strong>litre d'eau</strong>, pas d'un kilo de farine.",
  "<strong>Aucune huile</strong> dans la pâte, et un sel presque double de la pizza classique.",
])}
`, { chap: "L'unité de calcul napolitaine", num: m._c });

/* ===========================================================================
   PROTOCOLE STG
   =========================================================================== */
export const protoStg = (m) => m.p(`
${chapitre(m.chapSuivant(), "Protocole — la pâte STG",
  "Le déroulé du règlement européen&nbsp;: à température ambiante, pointage puis apprêt, sans froid.")}
${reperes([["Hydratation", "env. 55,5", "%"], ["Fermentation", "25", "°C"], ["Total", "6 – 8", "h"]])}
${proto([
  { n: 1, titre: "Dissoudre", corps: `
            <p>Verser <strong>1 litre d'eau</strong> dans le pétrin. Y dissoudre le
            <strong>sel</strong> (50 à 55 g).</p>` },
  { n: 2, titre: "Amorcer", corps: `
            <p>Ajouter <strong>10&nbsp;%</strong> de la farine prévue, puis la <strong>levure
            fraîche</strong> (3 g). <em>Le sel et la levure ne doivent jamais se rencontrer dans
            l'eau pure&nbsp;: la farine sert d'écran.</em></p>` },
  { n: 3, titre: "Incorporer", corps: `
            <p>Ajouter la <strong>farine restante</strong> progressivement, jusqu'aux
            <strong>1,8 kg</strong>. Pétrir jusqu'à obtenir une pâte lisse, souple et non
            collante — comptez <strong>10 à 20 mn</strong>. Température de pâte visée&nbsp;:
            <strong>25&nbsp;°C</strong>.</p>` },
  { repos: "2 h", texte: "<b>Pointage</b> — en masse, couvert, à température ambiante 25 °C." },
  { n: 4, titre: "<em>Staglio</em> — la coupe à la main", corps: `
            <p>Diviser <strong>à la main</strong> en pâtons de <strong>180 à 250 g</strong>, et
            bouler. Le <em>staglio a mano</em> fait partie du cahier des charges&nbsp;: pas de
            diviseuse.</p>` },
  { repos: "4 à 6 h", texte: "<b>Apprêt</b> — en bacs couverts, à température ambiante. La pâte est prête quand le pâton s'étale sous son propre poids." },
])}
${enc("note", "Le pH, un contrôle rarement fait", `<p>Le règlement donne un pH de
        <strong>5,87</strong> en fin d'apprêt. Un pH-mètre de poche suffit à le vérifier&nbsp;: c'est
        le seul contrôle objectif du degré de maturation, là où l'œil et le doigt restent
        subjectifs.</p>`)}
${photo("napo-etalage", "Étalage d'un pâton napolitain à la main")}
`, { chap: "Protocole — la pâte STG", num: m._c });

/* ===========================================================================
   PROTOCOLE AVPN
   =========================================================================== */
export const protoAvpn = (m) => m.p(`
${chapitre(m.chapSuivant(), "Protocole — la pâte AVPN",
  "Le cahier de l'association&nbsp;: moins de levure, fermentation plus fraîche et plus longue, chambre contrôlée.")}
${reperes([["Hydratation", "55,5 – 62,5", "%"], ["Chambre", "18 – 20", "°C"], ["Humidité", "60 – 70", "% HR"]])}
${proto([
  { n: 1, titre: "Dissoudre", corps: `
            <p><strong>1 litre d'eau</strong>, <strong>40 à 60 g de sel</strong> dissous.</p>` },
  { n: 2, titre: "Amorcer", corps: `
            <p>Environ <strong>10&nbsp;%</strong> de la farine, puis la <strong>levure</strong>&nbsp;:
            <strong>0,1 à 3 g</strong> de levure fraîche selon la température, l'humidité et le temps
            de fermentation visé. Sèche&nbsp;: un tiers de cette dose. Levain naturel&nbsp;: moins de
            10&nbsp;% du poids de farine.</p>` },
  { n: 3, titre: "Pétrir", corps: `
            <p>Incorporer la farine restante (<strong>1,600 à 1,800 kg</strong>). Pétrissage
            d'environ <strong>10 mn</strong>, <strong>20 mn maximum</strong>. Température de pâte et
            de service&nbsp;: <strong>16 à 22&nbsp;°C</strong>.</p>` },
  { repos: "1re étape", texte: "Fermentation en masse, en chambre contrôlée à <b>18-20 °C, 60-70 % d'humidité</b>." },
  { n: 4, titre: "<em>Staglio</em>", corps: `
            <p>Diviser à la main en pâtons de <strong>200 à 280 g</strong>, bouler serré.</p>` },
  { repos: "2e étape", texte: "Apprêt en bacs, même chambre contrôlée, jusqu'à maturité du pâton." },
])}
${enc("conseil", "0,1 g de levure, ce n'est pas une erreur", `<p>La plage AVPN va de
        <strong>0,1 à 3 g</strong> par litre d'eau. Le bas de la plage correspond à une fermentation
        très longue en chambre fraîche&nbsp;; le haut, à un service le jour même. C'est le
        <strong>temps</strong> qui fait le goût, pas la levure — et c'est exactement l'inverse du
        réflexe qu'on a quand la pâte ne monte pas assez vite.</p>`)}
${enc("alerte", "Jamais d'huile dans la pâte", `<p>Ni STG ni AVPN n'autorisent l'huile dans
        l'empâtement. La pâte napolitaine est faite pour être utilisée rapidement&nbsp;: elle n'a
        rien à figer. L'huile d'olive arrive <strong>sur la garniture</strong>, en filet, avant ou
        après la cuisson.</p>`)}
`, { chap: "Protocole — la pâte AVPN", num: m._c });

/* ===========================================================================
   ÉTALAGE ET FAÇONNAGE
   =========================================================================== */
export const etalage = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'étalage napolitain",
  "Tout se joue là&nbsp;: chasser le gaz vers le bord, et ne jamais toucher le <em>cornicione</em>.")}
${cote(`
          <p>L'étalage napolitain se fait <strong>uniquement à la main</strong>. Ni rouleau, ni
          laminoir&nbsp;: les deux écrasent les alvéoles et il n'y a plus de corniche.</p>
          <ol class="etapes">
            <li>Fariner le plan de travail à la <strong>semoule extra-fine</strong> ou à la farine
            d'étalage.</li>
            <li>Poser le pâton et <strong>presser du bout des doigts, du centre vers le bord</strong>,
            en s'arrêtant à <strong>1 à 2&nbsp;cm</strong> du bord&nbsp;: c'est ce geste qui pousse le
            gaz dans la corniche.</li>
            <li>Retourner, répéter, puis <strong>étirer</strong> la pâte en la faisant tourner sur
            elle-même.</li>
            <li>Vérifier l'épaisseur au centre&nbsp;: <strong>0,4&nbsp;cm</strong>.</li>
          </ol>`,
  "napo-etalage", "Étalage à la main, du centre vers le bord")}
${SC.cornicione()}
${reperes([["Centre", "0,4", "cm"], ["<em>Cornicione</em>", "1 – 2", "cm"], ["Diamètre", "22 – 35", "cm"]])}
${enc("alerte", "Les trois fautes classiques", `<p><strong>1.</strong> Écraser la corniche en
        posant la garniture trop au bord&nbsp;: elle ne gonflera pas.
        <strong>2.</strong> Trop fariner&nbsp;: la farine brûle à 450&nbsp;°C et donne un goût
        amer.
        <strong>3.</strong> Étaler un pâton trop froid&nbsp;: il revient sous les doigts et se
        déchire au centre. Le pâton napolitain se travaille <strong>à température ambiante</strong>.</p>`)}
${retenir([
  "On presse <strong>du centre vers le bord</strong> en s'arrêtant à 1-2&nbsp;cm&nbsp;: c'est ce geste qui chasse le gaz dans la corniche.",
  "Ni rouleau ni laminoir&nbsp;: ils écrasent les alvéoles, et il n'y a plus de corniche.",
])}
`, { chap: "L'étalage napolitain", num: m._c });

/* ===========================================================================
   MATIÈRES PREMIÈRES ET RECETTES
   =========================================================================== */
export const recettes = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Les matières premières", "Deux recettes seulement font la napolitaine&nbsp;: la <em>Marinara</em> et la <em>Margherita</em>.")}
${tbl(["Produit", "Ce qu'en disent les cahiers des charges"], [
    [["Tomate", "fort"], "Tomates pelées San Marzano, <em>pomodorini</em> ou tomates fraîches. <strong>Écrasées à la main</strong>, jamais mixées&nbsp;: le mixeur oxyde et fait ressortir l'acidité."],
    [["Mozzarella", "fort"], "<em>Mozzarella di bufala campana</em> AOP, ou <em>fior di latte</em> (lait de vache). Égouttée plusieurs heures — une mozzarella trop humide noie la pizza."],
    [["Basilic", "fort"], "Frais, en feuilles entières. Posé <strong>avant</strong> la cuisson pour la Margherita traditionnelle."],
    [["Huile d'olive", "fort"], "Extra vierge, <strong>en filet sur la garniture</strong>, jamais dans la pâte."],
    [["Ail &amp; origan", "fort"], "Pour la <em>Marinara</em> uniquement&nbsp;: ail en lamelles fines, origan séché."],
  ], { compact: true })}
${duo(["mozzarella-bufala", "Mozzarella di bufala"], ["tomate", "Grappe de tomates"],
  "La mozzarella s'égoutte la veille&nbsp;; la tomate s'écrase à la main le jour même.")}
`, { chap: "Les matières premières", num: n });

  m.p(`
        <h3 class="sec">Fiche technique — <em>Marinara</em></h3>
        <p class="mention">La plus ancienne des deux. Sans fromage.</p>
${tbl(["Ingrédient", ["Quantité", "c"], "Remarques"], [
    [["Pâton napolitain", "fort"], ["<span class='val'>200 à 250 g</span>", "c"], "Étalé à 30-32 cm"],
    [["Tomate San Marzano", "fort"], ["<span class='val'>80 g</span>", "c"], "Écrasée à la main, salée"],
    [["Ail", "fort"], ["<span class='val'>2 à 3 g</span>", "c"], "En fines lamelles"],
    [["Origan séché", "fort"], ["<span class='val'>1 g</span>", "c"], "Réparti à la pincée"],
    [["Huile d'olive extra vierge", "fort"], ["<span class='val'>5 g</span>", "c"], "En spirale, avant cuisson"],
  ], { compact: true })}
        <h3 class="sec">Fiche technique — <em>Margherita</em></h3>
${tbl(["Ingrédient", ["Quantité", "c"], "Remarques"], [
    [["Pâton napolitain", "fort"], ["<span class='val'>200 à 250 g</span>", "c"], "Étalé à 30-32 cm"],
    [["Tomate San Marzano", "fort"], ["<span class='val'>80 g</span>", "c"], "Écrasée à la main, salée"],
    [["Mozzarella <em>di bufala</em> ou <em>fior di latte</em>", "fort"], ["<span class='val'>80 à 100 g</span>", "c"], "Égouttée, en lamelles"],
    [["Basilic frais", "fort"], ["<span class='val'>3 à 4 feuilles</span>", "c"], "Avant cuisson"],
    [["Huile d'olive extra vierge", "fort"], ["<span class='val'>5 g</span>", "c"], "En spirale"],
  ], { compact: true })}
        <h4 class="sous">Allergènes</h4>
        <p><em>Marinara</em>&nbsp;: <strong>gluten</strong>. — <em>Margherita</em>&nbsp;:
        <strong>gluten</strong>, <strong>lait</strong>.</p>
${enc("conseil", "L'ordre de garnissage", `<p>Tomate d'abord, en spirale du centre vers le bord, en
        s'arrêtant à la corniche. Mozzarella ensuite, <strong>répartie et non tassée</strong>.
        Basilic, puis le filet d'huile en dernier. Une garniture posée trop tôt sur une pâte étalée
        détrempe le centre&nbsp;: on garnit juste avant d'enfourner.</p>`)}
${photo("napo-huile", "Filet d'huile d'olive sur une Margherita crue")}
`);
  return m;
};

/* ===========================================================================
   CUISSON ET DÉFAUTS
   =========================================================================== */
export const cuissonNapo = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "La cuisson napolitaine",
  "Soixante à quatre-vingt-dix secondes. Aucune autre cuisson de ce manuel ne demande autant d'attention par seconde.")}
${reperes([["Temps", "60 – 90", "s"], ["Sole", "380 – 485", "°C"], ["Voûte", "430 – 485", "°C"]])}
        <p>La pizza est enfournée <strong>directement sur la sole</strong>, sans plaque. Le pizzaïolo
        la fait <strong>tourner</strong> à la pelle pendant la cuisson pour l'exposer régulièrement à
        la flamme&nbsp;: c'est ce geste qui produit une corniche uniforme et la
        <em>leopardatura</em>.</p>
        <h3 class="sec">Reconnaître une cuisson réussie</h3>
${tbl(["Signe", "Ce qu'il indique"], [
    [["<em>Cornicione</em> gonflé, 1 à 2 cm", "fort"], "Le gaz a bien été poussé vers le bord à l'étalage, et la pâte était mûre."],
    [["Taches brunes irrégulières <span class='mention'>(<em>leopardatura</em>)</span>", "fort"], "Très haute température, temps très court. Des taches régulières et uniformes signalent au contraire un four trop doux et une cuisson trop longue."],
    [["Centre souple, non croustillant", "fort"], "Normal&nbsp;: la napolitaine se plie en quatre (<em>a portafoglio</em>). Un centre cassant veut dire trop de cuisson."],
    [["Dessous marqué mais non noirci", "fort"], "Sole à la bonne température. Un dessous pâle&nbsp;: sole trop froide. Noirci&nbsp;: trop chaude, ou pizza laissée trop longtemps au même endroit."],
  ], { compact: true })}
`, { chap: "La cuisson napolitaine", num: n });

  m.p(`
        <h3 class="sec">Défauts et corrections</h3>
${tbl(["Le défaut", "La cause probable", "La correction"], [
    [["Pas de corniche", "fort"], "Garniture posée jusqu'au bord, ou pâte pas assez mûre.", "S'arrêter à 1-2 cm du bord&nbsp;; allonger l'apprêt."],
    [["Pâte qui se déchire au centre", "fort"], "Pâton trop froid, ou étalage trop appuyé.", "Remettre à température ambiante&nbsp;; alléger la pression des doigts."],
    [["Fond détrempé", "fort"], "Mozzarella trop humide, ou pizza garnie trop à l'avance.", "Égoutter la mozzarella la veille&nbsp;; garnir juste avant d'enfourner."],
    [["Goût amer", "fort"], "Excès de farine d'étalage brûlée sur la sole.", "Fariner moins&nbsp;; brosser la sole entre les fournées."],
    [["Corniche brûlée, centre cru", "fort"], "Voûte trop forte par rapport à la sole.", "Rééquilibrer sole/voûte&nbsp;; éloigner la pizza de la flamme."],
    [["Pâte qui colle à la pelle", "fort"], "Pas assez de semoule, ou pâton trop hydraté pour la farine utilisée.", "Semouler la pelle&nbsp;; vérifier que le W de la farine tient l'hydratation choisie."],
  ], { compact: true })}
${enc("conseil", "Le thermomètre infrarouge", `<p>À ces températures, le thermostat du four ment
        souvent de 30 à 50&nbsp;°C. Un thermomètre infrarouge pointé sur la sole coûte peu et donne
        la seule valeur qui compte&nbsp;: celle de l'endroit exact où va se poser la pizza.</p>`)}
${photo("napo-poste", "Deux pizzaïolos au poste, four napolitain")}
${retenir([
  "<strong>60 à 90 secondes</strong>, sur la sole, en faisant tourner la pizza à la pelle.",
  "Des taches brunes <strong>irrégulières</strong> signent la bonne cuisson&nbsp;; des taches régulières signent un four trop doux.",
])}
`);
  return m;
};

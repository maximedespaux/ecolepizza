/**
 * Pages communes à tous les manuels : préface, tenue, schéma des formations,
 * équipe — et le LEXIQUE, qui est la pièce la plus partagée de toutes.
 *
 * Le lexique est ici sous forme de DONNÉES, pas de HTML. Chaque manuel n'en
 * retient que les termes qu'il emploie : sortir « Biga » dans le manuel
 * Niveau I, qui ne parle que de direct, n'aide personne. `lexique(m, clés)`
 * fabrique la ou les pages nécessaires.
 */
import { chapitre, cote, photo, enc, ECOLE } from "../gabarit.mjs";
import * as SC from "../schemas.mjs";

/* ===========================================================================
   PRÉFACE
   =========================================================================== */
export const preface = (m) => m.p(`
${chapitre(m.chapSuivant(), "Préface")}
${cote(`
          <p class="intro">Tombé amoureux de la cuisine dans mon enfance, j'ai eu de nombreuses
          expériences dans le monde de la restauration.</p>
          <p>Quand je me convertis au métier de pizzaïolo, je ne me doute pas de la richesse
          de ce savoir-faire.</p>
          <p>C'est grâce aux championnats du monde de la pizza, puis au Championnat de France,
          que ma technique s'est étoffée.</p>
          <p>Au travers de mes formations, je partage avec vous mes techniques, mon savoir-faire
          et ma passion des bonnes choses.</p>
          <p style="margin-top:6mm"><strong>Jean-Jacques Despaux</strong><br>
          <span class="mention">Maître Artisan Pizzaïolo · Maître Instructeur Pizzaïolo<br>
          Président de l'École Pizza</span></p>`,
  "formateur", "Jean-Jacques Despaux en formation avec un stagiaire")}
${enc("note", "Ce manuel", `<p>Ce document est le support pédagogique remis à chaque stagiaire.
        Il suit l'ordre de la formation : les matières premières d'abord, le protocole ensuite,
        la cuisson et l'organisation pour finir. Les pages « Notes » sont faites pour être
        écrites — les valeurs relevées pendant le stage n'ont de valeur que notées.</p>`)}
`, { chap: "Préface", num: m._c });

/* ===========================================================================
   TENUE PROFESSIONNELLE
   =========================================================================== */
export const tenue = (m) => m.p(`
${chapitre(m.chapSuivant(), "Tenue professionnelle",
  "La tenue est l'image de l'entreprise. Tout professionnel de la restauration se tient d'avoir une tenue propre.")}
${cote(`
          <h3 class="sec">La tenue est obligatoire</h3>
          <ul class="liste">
            <li>Veste blanche de cuisinier, tee-shirt ou polo</li>
            <li>Pantalon de cuisine (jean toléré)</li>
            <li>Chaussures de sécurité</li>
            <li>Tablier</li>
            <li>Torchon</li>
          </ul>
          <h3 class="sec">Dans les locaux</h3>
          <ul class="liste">
            <li><strong>Pas de bijoux</strong> — l'alliance est tolérée</li>
            <li><strong>Interdiction de fumer</strong> dans les locaux</li>
            <li>Cheveux attachés, ongles courts et sans vernis</li>
          </ul>`,
  "veste", "Veste de cuisinier brodée École Pizza")}
${enc("alerte", "Pourquoi c'est une règle et pas un conseil", `<p>Une bague retient les résidus de
        pâte et se retrouve dans le produit ; une chaussure de ville ne protège pas d'une plaque
        sortie du four à 320&nbsp;°C. La tenue relève de la sécurité au poste autant que de
        l'hygiène alimentaire.</p>`)}
`, { chap: "Tenue professionnelle", num: m._c });

/* ===========================================================================
   SCHÉMA DES FORMATIONS
   =========================================================================== */
export const schema = (m) => m.p(`
${chapitre(m.chapSuivant(), "Schéma des formations",
  "Deux portes d'entrée, puis des approfondissements. Le Niveau&nbsp;I ou le Niveau&nbsp;I&nbsp;Pro sont le prérequis de tout le reste.")}
${SC.formations()}
        <h4 class="sous">Nos formations</h4>
        <table class="tbl tbl-compact">
          <thead><tr><th>Parcours</th><th>Durée</th><th>Contenu</th><th>Prérequis</th></tr></thead>
          <tbody>
            <tr><td class="fort">Niveau I — Pizza classique</td><td class="val">5 j · 35 h</td>
                <td>Empâtement direct, de la farine à la sortie du four</td><td>Aucun</td></tr>
            <tr><td class="fort">Niveau I — option hygiène</td><td class="val">5 j · 44 h</td>
                <td>Niveau I + hygiène alimentaire en restauration commerciale</td><td>Aucun</td></tr>
            <tr><td class="fort">Fabriquer des pizzas artisanales</td><td class="val">5 j · 35 h</td>
                <td>Même contenu que le Niveau I, parcours certifiant RS&nbsp;7404</td>
                <td>Professionnels des métiers de bouche</td></tr>
            <tr><td class="fort">Niveau I Pro — Pizza classique</td><td class="val">2 j · 15 h</td>
                <td>Le protocole direct et l'étalage à la main, compactés</td>
                <td>Professionnels des métiers de bouche</td></tr>
            <tr><td class="fort">Niveau II — Empâtements indirects</td><td class="val">3 j · 21 h</td>
                <td>Poolish, Biga, pizza contemporaine</td><td>Niveau I ou Niveau I Pro</td></tr>
            <tr><td class="fort">Niveau Expert</td><td class="val">4 j · 28 h</td>
                <td>Indirects + In Teglia et In Pala</td><td>Niveau I ou Niveau I Pro</td></tr>
          </tbody>
        </table>
        <h4 class="sous">Nos spécialisations</h4>
        <table class="tbl tbl-compact">
          <thead><tr><th>Parcours</th><th>Durée</th><th>Contenu</th><th>Prérequis</th></tr></thead>
          <tbody>
            <tr><td class="fort">In Teglia &amp; In Pala</td><td class="val">2 j · 14 h</td>
                <td>Pizza sur plaque et sur pelle, vendue à la part</td><td>Niveau I ou Niveau I Pro</td></tr>
            <tr><td class="fort">Pizza napolitaine</td><td class="val">5 j · 35 h</td>
                <td>Empâtement napolitain, Margherita et Marinara</td><td>Niveau I ou Niveau I Pro</td></tr>
          </tbody>
        </table>
${enc("note", "Durées", `<p>Les durées et les tarifs en vigueur figurent sur le programme officiel
        de chaque formation et sur ${ECOLE.site}. Ce sont eux qui font foi&nbsp;: ce tableau situe
        les parcours les uns par rapport aux autres, il ne remplace pas le programme.</p>`)}
`, { chap: "Schéma des formations", num: m._c });

/* ===========================================================================
   ÉQUIPE PÉDAGOGIQUE
   =========================================================================== */
export const equipe = (m) => m.p(`
${chapitre(m.chapSuivant(), "L'équipe École Pizza")}
        <div class="equipe">
          <div class="membre">
            <div class="rond">JJ&nbsp;D</div>
            <div class="nom">Jean-Jacques<br>Despaux</div>
            <div class="role">Référent pédagogique</div>
          </div>
          <div class="membre">
            <div class="rond">MC&nbsp;D</div>
            <div class="nom">Marie-Christine<br>Despaux</div>
            <div class="role">Référente administrative</div>
          </div>
          <div class="membre">
            <div class="rond">M&nbsp;D</div>
            <div class="nom">Maxime<br>Despaux</div>
            <div class="role">Formateur</div>
          </div>
        </div>
        <div style="margin-top:8mm">
${photo("groupe", "Le formateur et un groupe de stagiaires autour d'une démonstration",
  "Chaque stagiaire dispose de son poste&nbsp;: un pétrin, un four, une balance.")}
        </div>
${enc("note", "Nous joindre", `<p><strong>${ECOLE.raison}</strong> — ${ECOLE.adresse}<br>
        Secrétariat ${ECOLE.tel} · ${ECOLE.courriel} · ${ECOLE.site}</p>`)}
`, { chap: "L'équipe École Pizza", num: m._c });

/* ===========================================================================
   LEXIQUE — données
   =========================================================================== */
export const MOTS = {
  abaisser: ["Abaisser", "Technique manuelle ou mécanique d'étirement de la pâte pour former la pizza (l'abaisse)."],
  aerobie: ["Aérobie", "Se dit de micro-organismes qui ne peuvent vivre qu'en présence d'oxygène."],
  alveographe: ["Alvéographe de Chopin", "Extensimètre qui détermine le comportement mécanique d'une pâte de farine, sa « force boulangère ». Il la déforme par pression d'air pour mesurer la ténacité, l'extensibilité, l'élasticité et la force (W)."],
  amande: ["Amande", "Le cœur du grain de blé, ce qui est écrasé pour faire la farine. Elle représente 81 à 88&nbsp;% de son poids."],
  amidon: ["Amidon", "L'élément principal d'une farine. Glucide complexe présent entre 64 et 80&nbsp;% de la composition totale."],
  amylases: ["Amylases", "Enzymes qui participent à la décomposition de l'amidon de la farine."],
  anaerobie: ["Anaérobie", "Se dit de micro-organismes qui vivent sans oxygène."],
  autolyse: ["Autolyse", "Technique boulangère qui consiste à mélanger la farine et l'eau avec un temps de repos après le frasage, afin d'obtenir une pâte non homogène plus extensible."],
  bac: ["Bac à pâtons", "Caisse plastique de différentes tailles qui sert à stocker les pâtons pour les laisser reposer avant la fabrication des pizzas."],
  bassinage: ["Bassinage", "Eau ajoutée en petits filets en fin de pétrissage pour corriger la texture sans casser le réseau déjà formé."],
  biga: ["Biga", "Empâtement indirect, levain-levure solide composé de farine, d'eau et de levure. Elle apporte des arômes, de la digestibilité et du croustillant à la pâte."],
  ble: ["Blé", "Céréale de la famille <em>Triticum</em>. Le mot désigne aussi le grain (caryopse) produit par ces plantes. Il peut être tendre ou dur."],
  boulage: ["Boulage", "Technique manuelle ou mécanique pour réaliser des petites boules de pâte (pâtons), destinées à la fabrication de la pizza."],
  conduction: ["Conduction", "Transmission de la chaleur par contact direct avec une surface chaude (la sole)."],
  convection: ["Convection", "Transmission de chaleur par une source chaude qui chauffe l'air dans une chambre de cuisson."],
  corne: ["Corne", "Ustensile en forme de demi-lune qui permet de décoller la pâte pour faciliter sa manipulation."],
  corniche: ["Corniche", "Partie extérieure de la pâte qui gonfle pendant la cuisson (aussi appelée trottoir, ou <em>cornicione</em> en italien)."],
  coupepate: ["Coupe-pâte", "Ustensile qui permet de couper la pâte lors de la fabrication."],
  couvrir: ["Couvrir", "Protéger la pâte lors de son repos pour éviter le séchage."],
  culdepoule: ["Cul-de-poule", "Récipient en inox ou en verre, demi-sphérique, pour les préparations."],
  dessiccation: ["Dessiccation", "Qui absorbe l'humidité d'un corps."],
  detente: ["Détente", "Phase de repos de la pâte avant les rabats. Elle permet au réseau de gluten de se former&nbsp;: la pâte devient plus élastique."],
  faconnage: ["Façonnage", "Mise en forme du pâton pour réaliser un disque."],
  farine: ["Farine", "Poudre obtenue par la mouture des grains de céréales."],
  fermentation: ["Fermentation", "Réaction naturelle obtenue par le mélange des ingrédients, qui permet et participe au développement de la pâte à pizza."],
  fleurage: ["Fleurage", "Fine couche de farine d'étalage ou de semoule extra-fine déposée sur le plan de travail, qui favorise la glisse au moment de placer la pizza sur la pelle."],
  force: ["Force boulangère (W)", "Indice qui classe les farines suivant la qualité du blé. Il est mesuré à l'alvéographe de Chopin."],
  frasage: ["Frasage", "Première étape du pétrissage&nbsp;: mélanger lentement et grossièrement la farine, l'eau et la levure."],
  garnir: ["Garnir", "Confectionner la pizza en déposant les ingrédients choisis."],
  glucose: ["Glucose", "Sucre simple, principal glucide du métabolisme de l'amidon (transformé par l'amylase)."],
  gluten: ["Gluten", "Substance composée de protéines qui subsiste après l'élimination de l'amidon dans la farine. Elle forme, avec l'eau, le réseau qui retient le gaz."],
  hydratation: ["Hydratation", "Quantité de liquide (eau, huile) à l'intérieur de la pâte, mesurée en pourcentage du poids de farine."],
  hygroscopique: ["Hygroscopique", "Qui absorbe l'humidité de l'air."],
  indirect: ["Indirect", "Empâtement en deux étapes, avec une pré-fermentation avant le pétrissage final (Poolish, Biga)."],
  ingredient: ["Ingrédient", "Élément qui entre dans la composition d'une recette."],
  laminoir: ["Laminoir", "Appareil mécanique qui sert à étaler une pâte à pizza de façon homogène."],
  levain: ["Levain naturel", "Écosystème microbien issu du mélange de farine et d'eau, qui permet de faire lever une pâte. Il peut être liquide ou solide."],
  levure: ["Levure", "Champignon unicellulaire apte à provoquer la fermentation des matières organiques."],
  lipides: ["Lipides", "Avec les glucides et les protéines, l'un des trois nutriments de base. Ils regroupent les corps gras non solubles dans l'eau."],
  maille: ["Maille glutineuse", "Formée par le gluten et l'eau lors du pétrissage. Elle retient le gaz et permet le développement de la pâte par son extensibilité."],
  panifiable: ["Panifiable", "Se dit des farines qui, comme celle du blé, contiennent assez de gluten pour que la pâte lève."],
  panification: ["Panification", "L'ensemble des étapes de fabrication qui mènent au résultat final, la pâte."],
  paton: ["Pâton", "Morceau de pâte façonné en boule pour faire une pizza."],
  petrin: ["Pétrin", "Appareil mécanique qui sert à pétrir la pâte. Plusieurs modèles&nbsp;: à bras plongeants, à spirale, à axe oblique."],
  petrissage: ["Pétrissage", "Malaxage de l'ensemble des éléments afin d'obtenir l'homogénéisation de la pâte."],
  napolitaine: ["Pizza napolitaine", "Pizza originaire de Naples, au rebord marqué (<em>cornicione</em>). La véritable napolitaine répond aux critères de la STG (Spécialité traditionnelle garantie)."],
  teglia: ["Pizza <em>in teglia</em> / <em>al taglio</em>", "Pizza romaine vendue en plaque, au poids ou à la part."],
  pointage: ["Pointage", "Première phase de fermentation de la pâte, en masse, à température ambiante."],
  poolish: ["Poolish", "Empâtement indirect, levain-levure liquide composé d'eau et de farine à quantités égales et de levure. Méthode qui augmente la digestibilité de la pâte."],
  protocole: ["Protocole", "Descriptif technique qui énonce les conditions, les règles et l'ensemble des étapes de fabrication de la pâte (la recette)."],
  rabat: ["Rabat", "Geste qui consiste à replier la pâte sur elle-même plusieurs fois pour lui donner de la force et l'oxygéner."],
  rafraichir: ["Rafraîchir", "Apporter de l'eau et de la farine pour nourrir un levain naturel et le garder en vie."],
  rayonnement: ["Rayonnement", "Transmission de la chaleur sans contact direct, émise par la voûte, la résistance ou la flamme. Elle permet la coloration et la réaction de Maillard."],
  reseau: ["Réseau gluténique", "Formé par le gluten lors du pétrissage. Il retient le gaz et permet le développement de la pâte par son extensibilité."],
  rouleau: ["Rouleau", "Ustensile qui permet d'étaler la pâte."],
  saccharomyce: ["<em>Saccharomyces cerevisiae</em>", "Levure particulière parmi tous les ferments et levains. Dans le langage courant&nbsp;: « levure de bière » ou « levure de boulanger »."],
  sel: ["Sel", "Chlorure de sodium. Il compense un éventuel manque de sels minéraux dans l'eau et donne à la pâte sa saveur."],
  sole: ["Sole", "Partie inférieure, à l'intérieur du four, où l'on dépose la pizza pour la cuire."],
  son: ["Son", "Partie extérieure du grain d'une céréale. Riche en fibres, en protéines, en vitamines et en minéraux."],
  tamiser: ["Tamiser", "Filtrer à l'aide d'un tamis un produit en poudre (farine) afin d'en extraire la meilleure partie."],
  type: ["Type de farine", "Classification des farines par le taux de cendres. Plus la farine est blanche, plus elle est raffinée et plus le taux de cendres est bas (ex.&nbsp;: T45)."],
  voute: ["Voûte", "Partie supérieure, à l'intérieur du four."],
  w: ["W", "Force boulangère de la farine."],
};

/* Termes des manuels de spécialité, absents du socle. */
export const MOTS_PLUS = {
  contemporaine: ["Pizza contemporaine", "Évolution moderne de la napolitaine&nbsp;: hydratation élevée, maturation longue, corniche très développée et alvéolée."],
  lemady: ["Lemady", "Améliorant de panification à base de malt et d'enzymes, utilisé sur les fortes hydratations pour la coloration et la tenue. <em>Le sucre ou le malt jouent le même rôle à dose plus faible.</em>"],
  malt: ["Malt", "Céréale germée puis séchée, riche en enzymes. Apporte des sucres fermentescibles et favorise la coloration de la croûte."],
  pala: ["Pizza <em>in pala</em>", "Pizza allongée cuite directement sur la sole, transférée avec une pelle rectangulaire en bois ou en aluminium. Croûte plus fine et plus croustillante que l'<em>in teglia</em>."],
  starter: ["Starter", "Le pré-ferment de la première phase d'un empâtement indirect."],
  maturation: ["Maturation", "Transformation enzymatique de la pâte au froid, distincte de la fermentation&nbsp;: elle développe les arômes et la digestibilité sans faire gonfler."],
  avpn: ["AVPN", "<em>Associazione Verace Pizza Napoletana</em>. Association napolitaine qui délivre l'agrément « Vera Pizza Napoletana » et publie son propre cahier des charges (<em>disciplinare</em>)."],
  stg: ["STG", "Spécialité traditionnelle garantie. Signe européen de qualité qui protège une recette et un savoir-faire, non une origine géographique. La « Pizza Napoletana » est STG depuis 2010."],
  cornicione: ["<em>Cornicione</em>", "Le bord de la pizza napolitaine, soufflé et alvéolé, d'une hauteur de 1 à 2&nbsp;cm."],
  leopardatura: ["<em>Leopardatura</em>", "Les taches brunes caractéristiques de la corniche napolitaine, produites par la très haute température en un temps très court."],
  pms: ["Plan de maîtrise sanitaire (PMS)", "Ensemble des documents qui décrivent les moyens mis en œuvre par un établissement pour assurer la sécurité sanitaire de ses productions."],
  bph: ["Bonnes pratiques d'hygiène (BPH)", "Les gestes et règles de base — hygiène du personnel, des locaux, du matériel, de la chaîne du froid — qui précèdent et soutiennent l'HACCP."],
  haccp: ["HACCP", "<em>Hazard Analysis Critical Control Point</em>. Méthode d'analyse des dangers et de maîtrise des points critiques, obligatoire en restauration commerciale."],
  ccp: ["CCP", "<em>Critical Control Point</em>, point critique pour la maîtrise&nbsp;: une étape où un contrôle est indispensable pour éliminer un danger ou le ramener à un niveau acceptable."],
  tracabilite: ["Traçabilité", "Capacité à retrouver, à toute étape, l'origine et le devenir d'une denrée. Obligatoire depuis le règlement (CE) n°&nbsp;178/2002."],
};

/**
 * Fabrique la ou les pages de lexique.
 * @param {Manuel} m
 * @param {string[]} cles  termes retenus, dans n'importe quel ordre
 * @param {number} parPage nombre de termes par page (24 tient confortablement)
 */
export function lexique(m, cles, parPage = 26) {
  const tous = { ...MOTS, ...MOTS_PLUS };
  const retenus = cles
    .map((c) => [c, tous[c]])
    .filter(([, v]) => v)
    .sort((a, b) => sansAccent(a[1][0]).localeCompare(sansAccent(b[1][0]), "fr"));

  const num = m.chapSuivant();
  for (let i = 0; i < retenus.length; i += parPage) {
    const tranche = retenus.slice(i, i + parPage);
    let lettreEnCours = "";
    const html = tranche.map(([, [terme, def]]) => {
      const l = sansAccent(terme)[0].toUpperCase();
      const titre = l !== lettreEnCours ? ((lettreEnCours = l), `<div class="lettre">${l}</div>`) : "";
      return `${titre}<div class="mot"><dl><dt>${terme}&nbsp;:</dt> <dd>${def}</dd></dl></div>`;
    }).join("\n          ");

    m.p(`
${i === 0 ? chapitre(num, "Lexique", "Les mots du métier, tels qu'ils sont employés pendant la formation.") : ""}
        <div class="lex">
          ${html}
        </div>`,
      i === 0 ? { chap: "Lexique", num, plein: true } : { plein: true });
  }
  return m;
}

/** Trie « Épeautre » avec les E et « Alvéographe » avec les A. */
const sansAccent = (s) =>
  String(s).replace(/<[^>]+>/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Les termes du socle direct — la liste par défaut du Niveau I. */
export const LEX_SOCLE = Object.keys(MOTS);

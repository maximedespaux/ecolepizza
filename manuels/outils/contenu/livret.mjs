/**
 * LIVRET D'ACCUEIL — refonte du document de novembre 2023.
 *
 * Le contenu est celui du livret existant. Quatre points ont été relevés et
 * sont signalés dans le document lui-même autant que dans A-VERIFIER.md :
 *  · le certificat Qualiopi reproduit était valable du 17/05/2021 au
 *    16/05/2024 — il est EXPIRÉ ;
 *  · la page « Accès au centre de formation » figurait DEUX FOIS à l'identique ;
 *  · deux numéros de téléphone différents cohabitaient pour le même
 *    secrétariat ;
 *  · le « Règlement intérieur » est annoncé au sommaire et ABSENT du document.
 */
import { chapitre, cote, photo, duo, enc, tbl, averif, reperes, proto, bilan, ECOLE } from "../gabarit.mjs";

/* ===========================================================================
   MOT D'ACCUEIL
   =========================================================================== */
export const accueil = (m) => m.p(`
${chapitre(m.chapSuivant(), "Mot d'accueil", "Bienvenue à l'École Pizza.")}
${cote(`
          <p class="intro">Passionné par la cuisine depuis mon enfance, j'ai eu de belles
          expériences dans le monde de la restauration.</p>
          <p>Quand je me convertis au métier de la pizza, je ne me doute pas de la richesse de ce
          savoir-faire. C'est aussi grâce à des formations en Italie et à la participation à de
          nombreux championnats nationaux et internationaux que mon métier de pizzaïolo s'est
          étoffé. Il suffisait d'une remise en question&nbsp;!</p>
          <p>C'est au travers de la formation que je partage avec vous mes techniques, mes astuces,
          ma passion.</p>
          <p style="margin-top:5mm"><strong>Jean-Jacques Despaux</strong><br>
          <span class="mention">Président de l'École Pizza</span></p>`,
  "accueil", "L'accueil du centre de formation")}
        <h3 class="sec">Pourquoi nous&nbsp;?</h3>
        <p>L'École Pizza | Jean-Jacques Despaux a été créée en <strong>2007</strong> afin
        d'accompagner les demandeurs d'emploi, les restaurateurs, les porteurs de projet, les
        particuliers — toute personne désirant apprendre le métier de pizzaïolo ou ajouter des
        compétences à son expérience professionnelle.</p>
        <p>Dans cet élan, en <strong>2016</strong>, des travaux sont effectués au rez-de-chaussée du
        bâtiment afin d'assurer aux stagiaires une formation de qualité, avec des
        <strong>postes de travail individuels</strong> équipés du matériel nécessaire.</p>
${reperes([["Depuis", "2007", ""], ["Pizzaïolos formés", "+ 1 600", ""], ["Postes individuels", "8", ""]])}
`, { chap: "Mot d'accueil", num: m._c });

/* ===========================================================================
   CERTIFICATION
   =========================================================================== */
export const certification = (m) => m.p(`
${chapitre(m.chapSuivant(), "Notre certification",
  "La certification qualité a été délivrée au titre de la catégorie d'action suivante&nbsp;: <strong>actions de formation</strong>.")}
        <div class="duo" style="align-items:center">
          <img src="assets/logo/qualiopi.png" alt="Qualiopi — processus certifié"
               style="height:auto;object-fit:contain;background:#fff;padding:6mm;border:.25mm solid var(--trait)">
          <img src="assets/logo/icpf.png" alt="ICPF &amp; Cofrac"
               style="height:auto;object-fit:contain;background:#fff;padding:6mm;border:.25mm solid var(--trait)">
        </div>
${tbl(["", ""], [
    [["Organisme certifié", "fort"], ECOLE.raison],
    [["Adresse", "fort"], "101 rue Alsace Lorraine, 65300 Lannemezan — France métropolitaine"],
    [["Numéro de déclaration d'activité", "fort"], "76650098965"],
    [["Certificateur", "fort"], "ICPF — accréditation Cofrac n° 5-0616, portée disponible sur cofrac.fr"],
    [["Vérifiable sur", "fort"], "certif-icpf.org"],
  ], { compact: true })}
${enc("alerte", "Le certificat reproduit dans le livret précédent était expiré", `<p>Le livret de
        novembre 2023 reproduisait le certificat <strong>B01371</strong>, valable
        <strong>du 17/05/2021 au 16/05/2024</strong>. Il ne peut plus être diffusé en l'état&nbsp;:
        un stagiaire ou un financeur qui le lit aujourd'hui y voit une certification périmée.
        <br><strong>À faire&nbsp;:</strong> insérer ici le scan du certificat en cours de validité,
        avec ses dates. ${averif("certificat à jour à fournir — Marie-Christine")}</p>`)}
${enc("note", "Ce que Qualiopi certifie", `<p>Qualiopi atteste de la <strong>qualité du processus</strong>
        mis en œuvre par l'organisme — pas de la qualité d'une formation en particulier. C'est ce qui
        rend les formations de l'école <strong>finançables</strong> par les opérateurs de compétences
        et les financeurs publics.</p>`)}
`, { chap: "Notre certification", num: m._c });

/* ===========================================================================
   LE FORMATEUR
   =========================================================================== */
export const formateur = (m) => m.p(`
${chapitre(m.chapSuivant(), "Votre formateur", "Jean-Jacques Despaux — Maître Artisan Pizzaïolo, Maître Instructeur Pizzaïolo.")}
${reperes([["Métier de la pizza", "27", "ans"], ["Métier de la cuisine", "17", "ans"], ["Maître Artisan", "2011", ""], ["Maître Instructeur", "2007", ""]])}
${cote(`
          <h3 class="sec">Titres obtenus</h3>
          <ul class="liste serre">
            <li><strong>2013</strong> — 2<sup>e</sup> mondial, Championnat du Monde à Parme (Italie), <em>Pizza Due</em></li>
            <li><strong>2012</strong> — 3<sup>e</sup> mondial, Championnat du Monde à Salsomaggiore (Italie), <em>Pizza Due</em></li>
            <li><strong>2012</strong> — 1<sup>er</sup> prix en créativité, Championnat Mondial de Pizzaïoli à Naples (Italie)</li>
            <li><strong>2010</strong> — 1<sup>er</sup> prix du World Pizza Plate à Paris, toutes catégories</li>
            <li><strong>2006</strong> — 3<sup>e</sup> français, Championnat de France</li>
            <li><strong>2005</strong> — 3<sup>e</sup> français, Championnat de France</li>
            <li><strong>2004</strong> — 1<sup>er</sup> français au Championnat Européen à Marbella (Espagne)</li>
          </ul>`,
  "formateur", "Jean-Jacques Despaux en formation")}
${enc("note", "Organisateur du Championnat de France de la pizza", `<p>L'École Pizza organise le
        <strong>Championnat de France de la pizza</strong> et les étapes du <strong>France Pizza
        Tour</strong>, en partenariat avec l'Association des pizzerias françaises.</p>`)}
`, { chap: "Votre formateur", num: m._c });

/* ===========================================================================
   ACCÈS
   =========================================================================== */
export const acces = (m) => m.p(`
${chapitre(m.chapSuivant(), "Accès au centre de formation",
  "Le centre est situé en centre-ville de Lannemezan.")}
${tbl(["", ""], [
    [["Adresse", "fort"], `<strong>${ECOLE.raison}</strong><br>101 rue Alsace Lorraine, 65300 Lannemezan`],
    [["Téléphone", "fort"], "05 62 50 18 64 — secrétariat"],
    [["Courriel", "fort"], "contact@ecole-pizza.com"],
    [["Site", "fort"], "www.ecole-pizza.com"],
  ], { compact: true })}
        <h3 class="sec">Transports et logement</h3>
${tbl(["", "Détail", ["Distance depuis l'école", "c"]], [
    [["Gare SNCF", "fort"], "Lannemezan", ["<span class='val'>2 km</span>", "c"]],
    [["Autoroute", "fort"], "A64, sortie 16 de Lannemezan", ["<span class='val'>4 km</span>", "c"]],
    [["Hôtel de la Demi-Lune", "fort"], "462 route de Toulouse, 65300 Lannemezan — 05 62 98 33 33", ["<span class='val'>2 km</span>", "c"]],
  ], { compact: true })}
${enc("verif", "Deux numéros de téléphone dans le livret précédent", `<p>La page « Accès » portait
        le <strong>05 62 40 25 98</strong> alors que le pied de page et la page « Formateur »
        donnaient le <strong>05 62 50 18 64</strong>, tous deux présentés comme celui du secrétariat.
        C'est le second qui a été retenu ici, parce qu'il apparaît partout ailleurs.
        ${averif("à confirmer — Marie-Christine")}</p>`)}
${enc("verif", "Cette page figurait en double", `<p>Les pages 6 et 7 du livret de 2023 étaient
        <strong>rigoureusement identiques</strong>. Une seule est conservée. Si un plan d'accès ou
        une photo de façade devait occuper la seconde, il reste à le fournir.
        ${averif("visuel d'accès à fournir")}</p>`)}
${photo("couloir", "Le couloir du centre de formation")}
`, { chap: "Accès au centre de formation", num: m._c });

/* ===========================================================================
   LE CENTRE ET LES MOYENS
   =========================================================================== */
export const centre = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Le centre de formation", "Chaque stagiaire a son poste. Un four chacun, un pétrin chacun, en totale autonomie.")}
${tbl(["Espace", "Ce qu'on y fait"], [
    [["Salle théorique", "fort"], "Les apports théoriques, les quiz, les corrections collectives."],
    [["Salle de pétrissage", "fort"], "Un poste individuel par stagiaire, avec pétrin et balance. Coin cuisine pour la mise en place."],
    [["Salle de cuisson", "fort"], "Un poste individuel par stagiaire, avec four."],
    [["Cuisine", "fort"], "Préparation des matières premières, tranchage, cuisson des garnitures."],
    [["Salle de détente", "fort"], "Coin café, prise des repas."],
    [["Vestiaires", "fort"], "Deux vestiaires, femmes et hommes."],
  ], { compact: true })}
${reperes([["Surface", "220", "m²"], ["Postes individuels", "8", ""], ["Pétrins", "8", ""], ["Balances", "8", ""]])}
${duo(["equipe-petrins", "L'équipe devant la rangée de pétrins"], ["salle-theorique", "La salle théorique"],
  "À gauche la salle de pétrissage, à droite la salle théorique.")}
`, { chap: "Le centre de formation", num: n });

  m.p(`
        <h3 class="sec">Les moyens techniques</h3>
${tbl(["Équipement", ["Nombre", "c"]], [
    [["Postes individuels", "fort"], ["<span class='val'>8</span>", "c"]],
    [["Pétrins", "fort"], ["<span class='val'>8</span>", "c"]],
    [["Balances", "fort"], ["<span class='val'>8</span>", "c"]],
    [["Fours électriques", "fort"], ["<span class='val'>6</span>", "c"]],
    [["Four à bois à sole rotative", "fort"], ["<span class='val'>1</span>", "c"]],
    [["Four à bois traditionnel", "fort"], ["<span class='val'>1</span>", "c"]],
  ], { compact: true })}
        <h3 class="sec">Trois postes, selon votre projet</h3>
${tbl(["Poste", "Ce qu'on y travaille"], [
    [["Poste empâtement", "fort"], "Pesée, pétrissage, pointage, division, boulage, stockage."],
    [["Poste cuisson", "fort"], "Étalage, garnissage, enfournement, gestion des températures."],
    [["Poste cuisine", "fort"], "Mise en place, tranchage, cuissons de garniture, sauce tomate."],
  ], { compact: true })}
${duo(["petrin-spirale", "Pétrin à spirale"], ["four-marana", "Four à bois à sole rotative"],
  "Le matériel de l'école est celui qu'on retrouve en pizzeria&nbsp;: on n'apprend pas sur du matériel de démonstration.")}
`);
  return m;
};

/* ===========================================================================
   LES FORMATIONS
   =========================================================================== */
export const formations = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Nos formations", "Six formations et deux spécialisations. Le Niveau I ou le Niveau I Pro ouvrent tout le reste.")}
${tbl(["Formation", ["Durée", "c"], "Objectif", "Prérequis"], [
    [["<strong>Niveau I</strong><br>Pizza classique", ""], ["<span class='val'>5 j · 35 h</span>", "c"],
     "Réaliser des pizzas classiques, de l'élaboration de l'empâtement direct jusqu'à la sortie du four.", "Aucun"],
    [["<strong>Niveau I — option hygiène</strong>", ""], ["<span class='val'>5 j · 44 h</span>", "c"],
     "Le Niveau I, en appliquant les gestes et la réglementation d'hygiène adaptés à la restauration commerciale.", "Aucun"],
    [["<strong>Fabriquer des pizzas artisanales</strong><br><span class='mention'>RS 7404</span>", ""], ["<span class='val'>5 j · 35 h</span>", "c"],
     "Fabriquer des pizzas artisanales, de l'empâtement direct ou semi-direct jusqu'à la présentation du produit fini.", "Professionnels des métiers de bouche"],
    [["<strong>Niveau I Pro</strong><br>Pizza classique", ""], ["<span class='val'>2 j · 15 h</span>", "c"],
     "Mettre en pratique le protocole de l'empâtement direct et l'étalage à la main.", "Professionnels des métiers de bouche"],
    [["<strong>Niveau II</strong><br>Empâtements indirects", ""], ["<span class='val'>3 j · 21 h</span>", "c"],
     "Maîtriser les empâtements indirects Poolish et Biga, et la pizza contemporaine.", "Niveau I ou Niveau I Pro"],
    [["<strong>Niveau Expert</strong><br>Spécialités italiennes", ""], ["<span class='val'>4 j · 28 h</span>", "c"],
     "Réaliser les empâtements indirects Poolish, Biga, contemporaine, In Teglia et In Pala, et un empâtement direct In Teglia et In Pala.", "Niveau I ou Niveau I Pro"],
  ])}
${enc("verif", "Une durée qui a changé", `<p>Le livret de 2023 annonçait le Niveau&nbsp;II sur
        <strong>2 jours</strong>. Les documents de formation 2026 le donnent sur
        <strong>3 jours / 21 heures</strong>. C'est cette dernière valeur qui est reprise ici.
        ${averif("à confirmer")}</p>`)}
`, { chap: "Nos formations", num: n });

  m.p(`
        <h3 class="sec">Nos spécialisations</h3>
${tbl(["Spécialisation", ["Durée", "c"], "Objectif", "Prérequis"], [
    [["<strong>In Teglia &amp; In Pala</strong>", ""], ["<span class='val'>2 j · 14 h</span>", "c"],
     "Élaborer une pizza sur plaque, spécialité italienne, destinée à être vendue à la part.", "Niveau I ou Niveau I Pro"],
    [["<strong>Pizza napolitaine</strong><br><span class='mention'>agréée AVPN</span>", ""], ["<span class='val'>5 j · 35 h</span>", "c"],
     "Réaliser des pizzas napolitaines, de l'élaboration de l'empâtement jusqu'à la sortie du four.", "Niveau I ou Niveau I Pro"],
  ])}
        <h3 class="sec">L'option hygiène</h3>
        <p>Le stage spécifique en hygiène alimentaire, adapté à l'activité des établissements de
        restauration commerciale, se décompose en un <strong>apport théorique</strong>, des
        <strong>études de cas</strong>, des observations et du <strong>travail pratique</strong>, en
        utilisant le guide de bonnes pratiques d'hygiène.</p>
        <ul class="liste">
          <li>Aliments et risques pour le consommateur</li>
          <li>Les fondamentaux de la réglementation communautaire et nationale</li>
          <li>Le plan de maîtrise sanitaire</li>
        </ul>
${enc("note", "À l'issue de la formation", `<p>Une <strong>attestation de formation</strong> est
        délivrée, en conformité avec la réglementation en vigueur.</p>`)}
${photo("hygiene-tableau", "Séance d'hygiène au tableau")}
`);
  return m;
};

/* ===========================================================================
   TENUE, SÉCURITÉ, HYGIÈNE
   =========================================================================== */
export const securite = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Tenue, sécurité et hygiène", "Ce qui est attendu de vous dès le premier jour.")}
${cote(`
          <h3 class="sec">La tenue professionnelle est obligatoire</h3>
          <p>Elle doit être propre et composée de&nbsp;:</p>
          <ul class="liste">
            <li>Veste blanche de cuisinier, tee-shirt ou polo</li>
            <li>Pantalon de cuisine (jean toléré)</li>
            <li>Chaussures de sécurité</li>
            <li>Tablier</li>
            <li>Torchon</li>
          </ul>
          <p><strong>Pas de bijoux</strong> — l'alliance est tolérée.
          <strong>Interdiction de fumer</strong> dans les locaux.</p>`,
  "veste", "Veste de cuisinier École Pizza")}
        <h3 class="sec">Sécurité</h3>
${tbl(["", ""], [
    [["Extincteurs", "fort"], "À côté du bureau · sortie de secours (salle des pétrins) · à l'entrée (salle des cuissons)."],
    [["Coupure de courant", "fort"], "Contacter <strong>immédiatement</strong> le formateur et <strong>ne pas remettre le courant</strong> soi-même."],
  ], { compact: true })}
        <h4 class="sous">Pictogrammes à connaître</h4>
        <ul class="liste serre">
          <li><strong>Inflammable</strong></li>
          <li><strong>Corrosif</strong></li>
          <li><strong>Nocif, irritant</strong></li>
          <li><strong>Dangereux</strong></li>
          <li><strong>Polluant pour l'environnement</strong></li>
        </ul>
        <h3 class="sec">Hygiène</h3>
        <p>Les mains sont le <strong>premier vecteur de contamination</strong>&nbsp;: il faut les
        laver le plus régulièrement possible, et <strong>obligatoirement</strong> lors de la prise de
        poste, après une opération contaminante, après avoir fumé, mangé ou s'être mouché, après le
        nettoyage et la désinfection, après être allé aux toilettes, et avant de manipuler des
        produits sensibles.</p>
`, { chap: "Tenue, sécurité et hygiène", num: n });

  m.p(`
${chapitre(m.chapSuivant(), "Règlement intérieur", "Les règles de vie du centre pendant votre séjour en formation.")}
${enc("alerte", "Ce chapitre est à fournir", `<p>Le « Règlement intérieur » figurait au sommaire du
        livret de 2023 <strong>mais n'existait dans aucune de ses 25 pages</strong>. C'est le seul
        manque réel du document — et ce n'est pas un détail&nbsp;: le règlement intérieur d'un
        organisme de formation est <strong>obligatoire</strong>, il doit être porté à la connaissance
        du stagiaire, et il est demandé en audit.</p>
        <p><strong>À faire&nbsp;:</strong> insérer ici le règlement intérieur en vigueur, ou le
        rédiger s'il n'existe pas. ${averif("document à fournir — Marie-Christine")}</p>`)}
${enc("note", "Ce qu'il doit couvrir", `<p>À titre indicatif, les rubriques attendues&nbsp;: les
        règles de <strong>discipline</strong> et les sanctions applicables&nbsp;; les mesures
        d'<strong>hygiène et de sécurité</strong>&nbsp;; la <strong>représentation des
        stagiaires</strong> pour les formations longues&nbsp;; les <strong>horaires</strong> et les
        conditions d'<strong>absence</strong>&nbsp;; l'usage du matériel&nbsp;; la procédure de
        <strong>réclamation</strong> et le <strong>référent handicap</strong>.</p>`)}
`, { chap: "Règlement intérieur", num: m._c });
  return m;
};

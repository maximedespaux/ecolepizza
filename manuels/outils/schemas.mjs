/**
 * LES SCHÉMAS — SVG écrits à la main, un par mécanisme.
 *
 * POURQUOI ILS EXISTENT
 * Les manuels d'origine portaient huit légendes du type « Schéma du caryopse —
 * © École Pizza | Jean-Jacques Despaux »… sous des dessins qui n'ont jamais été
 * repris. La légende annonçait une figure absente. Ces schémas comblent ce
 * manque, et en ajoutent là où une phrase ne suffit pas.
 *
 * LA RÈGLE : un schéma se justifie quand il montre un MÉCANISME que le lecteur
 * devrait sinon reconstruire à partir du texte — où va l'eau, ce qui se passe
 * entre deux phases, ce qui change d'une option à l'autre. Une boîte étiquetée
 * « levure » n'apprend rien de plus que le mot ; le bourgeonnement d'une cellule
 * en une heure, si. Quand une phrase va plus vite, on écrit la phrase.
 *
 * COMMENT ILS SONT FAITS
 *  · SVG en clair dans la page, aucune librairie, aucune image externe ;
 *  · les couleurs passent par les variables CSS du document : un schéma prend
 *    donc AUTOMATIQUEMENT la couleur de son parcours, sans être redessiné ;
 *  · `viewBox` seul dimensionne — la feuille de style met la largeur à 100 % ;
 *  · les identifiants de <marker> sont suffixés par le nom du schéma : un
 *    manuel affiche plusieurs figures, et deux `id="fleche"` dans le même
 *    document se marchent dessus (la première gagne, les autres perdent leur
 *    pointe de flèche) ;
 *  · `role="img"` + `aria-label` portent la même affirmation que la légende,
 *    pour qui ne voit pas la figure.
 *
 * LES FLÈCHES SONT ÉTIQUETÉES. Une flèche nue veut dire « lié d'une manière ou
 * d'une autre » ; « x2 », « 50 moins Y », « invalide » est une information.
 */

/** Enveloppe commune : figure + légende + accessibilité. */
const figure = (nom, viewBox, corps, legende, claim) => `
        <figure class="schema">
          <svg viewBox="${viewBox}" role="img" aria-label="${claim.replace(/"/g, "&quot;")}">
            <defs>
              <marker id="f-${nom}" viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" class="s-pointe"/>
              </marker>
            </defs>
${corps}
          </svg>
          <figcaption class="legende">${legende}</figcaption>
        </figure>`;

/* ===========================================================================
   1 · LE CARYOPSE — anatomie
   Le grain en coupe. Ce que le schéma ajoute au tableau : les trois parties ne
   sont pas une liste, elles sont EMBOÎTÉES, et leur taille relative est
   l'information (l'amande fait 82 à 85 % à elle seule).
   =========================================================================== */
export const caryopse = () => figure("caryopse", "0 24 660 202", `
            <!-- Le grain, en coupe longitudinale : trois enveloppes emboîtées. -->
            <ellipse cx="200" cy="125" rx="150" ry="92" class="s-boite"/>
            <ellipse cx="200" cy="125" rx="139" ry="82" class="s-son"/>
            <ellipse cx="200" cy="125" rx="128" ry="72" class="s-amande"/>
            <!-- Le germe, à la pointe basse : petit, gras, et c'est lui qu'on retire. -->
            <ellipse cx="200" cy="196" rx="34" ry="20" class="s-germe"/>
            <text x="200" y="120" class="s-txt s-centre s-sur">Albumen</text>
            <text x="200" y="140" class="s-lbl s-centre s-sur">L'AMANDE</text>
            <text x="200" y="200" class="s-lbl s-centre s-sur">GERME</text>

            <!-- Les rappels chiffrés, alignés sur une même colonne. -->
            <line x1="330" y1="60"  x2="415" y2="60"  class="s-fil" marker-end="url(#f-caryopse)"/>
            <line x1="345" y1="118" x2="415" y2="118" class="s-fil" marker-end="url(#f-caryopse)"/>
            <line x1="238" y1="196" x2="415" y2="176" class="s-fil" marker-end="url(#f-caryopse)"/>

            <text x="425" y="52"  class="s-lbl">ENVELOPPES · LE SON</text>
            <text x="425" y="72"  class="s-val">13 à 15 %</text>
            <text x="425" y="110" class="s-lbl">ALBUMEN · DEVIENT LA FARINE</text>
            <text x="425" y="130" class="s-val">82 à 85 %</text>
            <text x="425" y="168" class="s-lbl">GERME · GRAS, IL FAIT RANCIR</text>
            <text x="425" y="188" class="s-val">env. 3 %</text>`,
  "Le caryopse du froment en coupe. Le raffinage consiste à ne garder que l'amande&nbsp;: c'est elle qui fait la farine blanche.",
  "Coupe d'un grain de blé : l'amande occupe 82 à 85 % du grain, les enveloppes 13 à 15 %, le germe environ 3 %.");

/* ===========================================================================
   2 · L'ALVÉOGRAPHE DE CHOPIN — un vrai graphique
   Ce que le tableau des symboles ne peut pas montrer : P, L et W sont trois
   lectures d'UNE SEULE courbe. W est une AIRE, pas un point — c'est ce qui
   explique que deux farines de même W se comportent différemment.
   =========================================================================== */
export const alveographe = () => figure("alveo", "0 10 660 288", `
            <!-- Les axes -->
            <line x1="70" y1="250" x2="620" y2="250" class="s-axe"/>
            <line x1="70" y1="250" x2="70"  y2="35"  class="s-axe"/>
            <text x="70" y="25" class="s-lbl">PRESSION</text>
            <text x="620" y="272" class="s-lbl s-droite">TEMPS · ALLONGEMENT</text>

            <!-- L'aire sous la courbe : c'est ELLE qui est le W. -->
            <path d="M70 250 C 120 250, 150 70, 215 70 C 300 70, 360 118, 470 165 L 470 250 Z"
                  class="s-aire"/>
            <path d="M70 250 C 120 250, 150 70, 215 70 C 300 70, 360 118, 470 165"
                  class="s-courbe"/>
            <!-- La rupture : la bulle éclate, la courbe s'arrête là. -->
            <circle cx="470" cy="165" r="5" class="s-accent"/>
            <text x="484" y="160" class="s-lbl">RUPTURE</text>

            <!-- P : la hauteur du sommet = ténacité -->
            <line x1="215" y1="70" x2="215" y2="250" class="s-cote"/>
            <line x1="118" y1="70" x2="205" y2="70"  class="s-cote"/>
            <text x="126" y="62" class="s-txt">P</text>
            <text x="140" y="62" class="s-lbl s-fin">TÉNACITÉ</text>

            <!-- L : la largeur = extensibilité -->
            <line x1="70" y1="268" x2="470" y2="268" class="s-cote" marker-end="url(#f-alveo)"/>
            <text x="262" y="288" class="s-txt s-centre">L</text>
            <text x="278" y="288" class="s-lbl">EXTENSIBILITÉ</text>

            <!-- W : l'aire -->
            <text x="250" y="180" class="s-txt s-fort">W</text>
            <text x="272" y="180" class="s-lbl">= L'AIRE SOUS LA COURBE</text>
            <text x="250" y="200" class="s-lbl s-fin">le travail nécessaire pour faire éclater le pâton</text>`,
  "L'alvéogramme de Chopin. <strong>P</strong> se lit en hauteur, <strong>L</strong> en largeur, et <strong>W</strong> est l'aire — pas un point sur la courbe. C'est pour cela que deux farines de même W peuvent se comporter à l'opposé&nbsp;: leur rapport P/L diffère.",
  "Courbe d'alvéogramme : P est la hauteur du sommet, L la largeur totale jusqu'à la rupture, W l'aire sous la courbe.");

/* ===========================================================================
   3 · L'UNITÉ DE CALCUL — la multiplication
   Le tableau donne les grammes. Ce que le schéma ajoute : d'où sortent les six
   pâtons, et pourquoi 1,68 kg et pas autre chose.
   =========================================================================== */
export const uniteCalcul = () => figure("unite", "0 20 660 172", `
            <!-- L'entrée : les cinq ingrédients d'une unité -->
            <rect x="10" y="30" width="176" height="150" rx="6" class="s-boite"/>
            <text x="98" y="54" class="s-lbl s-centre">1 UNITÉ DE CALCUL</text>
            <text x="30" y="82"  class="s-txt">Farine</text>       <text x="176" y="82"  class="s-val s-fin s-droite">1 000 g</text>
            <text x="30" y="104" class="s-txt">Eau</text>          <text x="176" y="104" class="s-val s-fin s-droite">540 – 600 g</text>
            <text x="30" y="126" class="s-txt">Sel</text>          <text x="176" y="126" class="s-val s-fin s-droite">20 g</text>
            <text x="30" y="148" class="s-txt">Huile</text>        <text x="176" y="148" class="s-val s-fin s-droite">25 g</text>
            <text x="30" y="170" class="s-txt">Levure</text>       <text x="176" y="170" class="s-val s-fin s-droite">2 – 4 g</text>

            <line x1="196" y1="105" x2="248" y2="105" class="s-fil" marker-end="url(#f-unite)"/>
            <text x="222" y="96" class="s-lbl s-centre">PÉTRIN</text>

            <!-- La masse obtenue -->
            <rect x="258" y="62" width="130" height="86" rx="6" class="s-plein"/>
            <text x="323" y="96"  class="s-lbl s-centre s-sur">PÂTE OBTENUE</text>
            <text x="323" y="124" class="s-txt s-centre s-sur s-gros">1,68 kg</text>

            <line x1="398" y1="105" x2="450" y2="105" class="s-fil" marker-end="url(#f-unite)"/>
            <text x="424" y="96" class="s-lbl s-centre">÷ 280 g</text>

            <!-- Les six pâtons -->
            <circle cx="484" cy="76"  r="21" class="s-paton"/>
            <circle cx="534" cy="76"  r="21" class="s-paton"/>
            <circle cx="584" cy="76"  r="21" class="s-paton"/>
            <circle cx="484" cy="134" r="21" class="s-paton"/>
            <circle cx="534" cy="134" r="21" class="s-paton"/>
            <circle cx="584" cy="134" r="21" class="s-paton"/>
            <text x="534" y="180" class="s-txt s-centre s-fort">6 pâtons de 280 g</text>`,
  "Une unité de calcul part d'<strong>un kilo de farine</strong>. Les 1,68 kg de pâte sont la somme de tout ce qui entre au pétrin — c'est pour cela que le poids final ne dépend pas que de la farine.",
  "Une unité de calcul : 1 kg de farine plus l'eau, le sel, l'huile et la levure donnent 1,68 kg de pâte, soit six pâtons de 280 grammes.");

/* ===========================================================================
   4 · LES TROIS CHALEURS DU FOUR — coupe
   Le texte les nomme. Le schéma dit d'OÙ chacune vient, et donc laquelle
   corriger quand le fond est pâle ou la garniture brûlée.
   =========================================================================== */
export const troisChaleurs = () => figure("chaleurs", "0 26 660 232", `
            <!-- La chambre du four -->
            <path d="M60 200 L60 110 A 270 130 0 0 1 600 110 L600 200 Z" class="s-boite"/>
            <rect x="60" y="200" width="540" height="26" rx="3" class="s-sole"/>
            <text x="330" y="218" class="s-lbl s-centre s-sur">LA SOLE</text>

            <!-- La pizza, posée dessus -->
            <ellipse cx="330" cy="196" rx="86" ry="9" class="s-pizza"/>

            <!-- 1. Rayonnement : de la voûte, en droite ligne -->
            <line x1="255" y1="86" x2="300" y2="176" class="s-ray" marker-end="url(#f-chaleurs)"/>
            <line x1="330" y1="74" x2="330" y2="176" class="s-ray" marker-end="url(#f-chaleurs)"/>
            <line x1="405" y1="86" x2="360" y2="176" class="s-ray" marker-end="url(#f-chaleurs)"/>
            <text x="330" y="56" class="s-txt s-centre s-fort">1 · Rayonnement</text>
            <text x="330" y="40" class="s-lbl s-centre">LA VOÛTE — COLORATION, RÉACTION DE MAILLARD</text>

            <!-- 2. Convection : l'air tourne -->
            <path d="M150 170 C 110 130, 130 96, 180 96" class="s-conv" marker-end="url(#f-chaleurs)"/>
            <path d="M510 170 C 550 130, 530 96, 480 96" class="s-conv" marker-end="url(#f-chaleurs)"/>
            <text x="120" y="196" class="s-txt s-fort">2 · Convection</text>
            <text x="120" y="212" class="s-lbl">L'AIR CHAUD</text>
            <text x="120" y="226" class="s-lbl s-fin">cuit la garniture</text>

            <!-- 3. Conduction : par contact -->
            <line x1="330" y1="232" x2="330" y2="206" class="s-cond" marker-end="url(#f-chaleurs)"/>
            <text x="470" y="250" class="s-txt s-fort">3 · Conduction</text>
            <text x="352" y="250" class="s-lbl">PAR CONTACT — CUIT LE FOND, FAIT LE CROUSTILLANT</text>`,
  "Les trois chaleurs travaillent en même temps, mais pas au même endroit. Un fond pâle sous une garniture brûlée n'est pas un problème de temps&nbsp;: c'est trop de voûte et pas assez de sole.",
  "Coupe d'un four : le rayonnement vient de la voûte, la convection de l'air qui tourne, la conduction de la sole par contact direct.");

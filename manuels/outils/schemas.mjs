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
            <text x="352" y="240" class="s-txt s-fort">3 · Conduction</text>
            <text x="352" y="254" class="s-lbl">PAR CONTACT AVEC LA SOLE — ELLE CUIT LE FOND</text>
            <text x="352" y="266" class="s-lbl">ET FAIT LE CROUSTILLANT</text>`,
  "Les trois chaleurs travaillent en même temps, mais pas au même endroit. Un fond pâle sous une garniture brûlée n'est pas un problème de temps&nbsp;: c'est trop de voûte et pas assez de sole.",
  "Coupe d'un four : le rayonnement vient de la voûte, la convection de l'air qui tourne, la conduction de la sole par contact direct.");

/* ===========================================================================
   5 · LES TYPES DE FARINE — une échelle, pas six cases
   Le tableau aligne six lignes qui ont l'air indépendantes. Ce que le schéma
   ajoute : type, cendres et extraction sont TROIS LECTURES DU MÊME GESTE — la
   part du grain que le moulin garde — et il montre où ça mène au pétrin :
   vers le complet, la farine boit plus et fermente plus lentement.
   =========================================================================== */
export const raffinage = () => figure("raffinage", "0 10 660 252", `
            <!-- Le sens de l'échelle, nommé à ses deux bouts. -->
            <text x="90" y="22" class="s-lbl">LE PLUS BLANC</text>
            <line x1="176" y1="18" x2="532" y2="18" class="s-fil" marker-end="url(#f-raffinage)"/>
            <text x="640" y="22" class="s-lbl s-droite">LE PLUS COMPLET</text>

            <!-- Les deux nomenclatures. Le T45 n'a pas d'équivalent italien. -->
            <text x="100" y="44" class="s-lbl s-droite">TYPE FRANÇAIS</text>
            <text x="138" y="44" class="s-txt s-fort s-centre">T45</text>
            <text x="233" y="44" class="s-txt s-fort s-centre">T55</text>
            <text x="328" y="44" class="s-txt s-fort s-centre">T65</text>
            <text x="423" y="44" class="s-txt s-fort s-centre">T80</text>
            <text x="518" y="44" class="s-txt s-fort s-centre">T110</text>
            <text x="613" y="44" class="s-txt s-fort s-centre">T150</text>

            <text x="100" y="61" class="s-lbl s-droite">TYPE ITALIEN</text>
            <text x="138" y="61" class="s-txt s-centre">—</text>
            <text x="233" y="61" class="s-txt s-centre">00</text>
            <text x="328" y="61" class="s-txt s-centre">0</text>
            <text x="423" y="61" class="s-txt s-centre">1</text>
            <text x="518" y="61" class="s-txt s-centre">2</text>
            <text x="613" y="61" class="s-txt s-centre">Integrale</text>

            <!-- Le cadre vaut 100 % du grain ; l'aplat est ce qui reste dans le sac.
                 La hauteur EST le taux d'extraction : 67 % contre 95 %, à l'échelle. -->
            <text x="100" y="106" class="s-lbl s-droite">LE GRAIN</text>
            <text x="100" y="118" class="s-lbl s-droite">ENTIER</text>

            <rect x="111" y="72" width="54" height="68" rx="3" class="s-boite"/>
            <rect x="206" y="72" width="54" height="68" rx="3" class="s-boite"/>
            <rect x="301" y="72" width="54" height="68" rx="3" class="s-boite"/>
            <rect x="396" y="72" width="54" height="68" rx="3" class="s-boite"/>
            <rect x="491" y="72" width="54" height="68" rx="3" class="s-boite"/>
            <rect x="586" y="72" width="54" height="68" rx="3" class="s-boite"/>

            <rect x="112" y="95" width="52" height="44" rx="2" class="s-plein"/>
            <rect x="207" y="89" width="52" height="50" rx="2" class="s-plein"/>
            <rect x="302" y="88" width="52" height="51" rx="2" class="s-plein"/>
            <rect x="397" y="85" width="52" height="54" rx="2" class="s-plein"/>
            <rect x="492" y="81" width="52" height="58" rx="2" class="s-plein"/>
            <rect x="587" y="76" width="52" height="63" rx="2" class="s-plein"/>

            <!-- Les deux zones nommées une fois, sur le T45 : c'est là que l'écart est le plus large. -->
            <text x="138" y="88" class="s-lbl s-centre">RETIRÉ</text>
            <text x="138" y="121" class="s-lbl s-centre s-sur">GARDÉ</text>

            <text x="100" y="158" class="s-lbl s-droite">EXTRACTION</text>
            <text x="138" y="158" class="s-val s-centre">67 %</text>
            <text x="233" y="158" class="s-val s-centre">75 %</text>
            <text x="328" y="158" class="s-val s-centre">78 %</text>
            <text x="423" y="158" class="s-val s-centre">80 à 85 %</text>
            <text x="518" y="158" class="s-val s-centre">85 à 90 %</text>
            <text x="613" y="158" class="s-val s-centre">92 à 98 %</text>

            <!-- Les cendres montent dans le même sens : ce sont les minéraux du son, restés dedans. -->
            <text x="100" y="176" class="s-lbl s-droite">CENDRES</text>
            <text x="100" y="188" class="s-lbl s-droite">EN %</text>
            <text x="138" y="182" class="s-val s-fin s-centre">0,50 moyen</text>
            <text x="233" y="182" class="s-val s-fin s-centre">0,50 à 0,60</text>
            <text x="328" y="182" class="s-val s-fin s-centre">0,62 à 0,75</text>
            <text x="423" y="182" class="s-val s-fin s-centre">0,75 à 0,90</text>
            <text x="518" y="182" class="s-val s-fin s-centre">1,00 à 1,20</text>
            <text x="613" y="182" class="s-val s-fin s-centre">plus de 1,40</text>

            <text x="100" y="208" class="s-lbl s-droite">USAGE</text>
            <text x="138" y="202" class="s-lbl s-centre">PIZZA,</text>
            <text x="138" y="214" class="s-lbl s-centre">PÂTISSERIE</text>
            <text x="233" y="202" class="s-lbl s-centre">PIZZA,</text>
            <text x="233" y="214" class="s-lbl s-centre">PAINS BLANCS</text>
            <text x="328" y="202" class="s-lbl s-centre">PIZZA, BAGUETTE</text>
            <text x="328" y="214" class="s-lbl s-centre">DE TRADITION</text>
            <text x="423" y="202" class="s-lbl s-centre">PAINS</text>
            <text x="423" y="214" class="s-lbl s-centre">SEMI-COMPLETS</text>
            <text x="518" y="202" class="s-lbl s-centre">PAINS</text>
            <text x="518" y="214" class="s-lbl s-centre">COMPLETS</text>
            <text x="613" y="202" class="s-lbl s-centre">PAINS</text>
            <text x="613" y="214" class="s-lbl s-centre">COMPLETS</text>

            <!-- Ce que l'échelle change au pétrin : la conséquence, pas la nomenclature. -->
            <text x="150" y="232" class="s-lbl s-centre">LE SON RETIENT L'EAU</text>
            <text x="430" y="232" class="s-lbl s-centre">LE SON GÊNE LE RÉSEAU DE GLUTEN</text>
            <text x="640" y="232" class="s-lbl s-droite">PLUS DE SON</text>
            <line x1="90" y1="240" x2="640" y2="240" class="s-cond" marker-end="url(#f-raffinage)"/>
            <text x="150" y="256" class="s-txt s-centre s-fort">La farine boit plus</text>
            <text x="430" y="256" class="s-txt s-centre s-fort">La fermentation est plus lente</text>`,
  "Type, cendres et extraction ne sont pas trois étiquettes indépendantes&nbsp;: c'est <strong>une seule échelle</strong>, celle de ce que le moulin garde du grain. La hauteur de l'aplat est le taux d'extraction, à l'échelle&nbsp;: le T45 jette un tiers du grain, la T150 le garde presque entier. Vers la droite, il faut donc <strong>plus d'eau et plus de temps</strong> — et la pizza se joue au bout blanc, du T45 au T65.",
  "Échelle des farines du plus blanc au plus complet : du T45, sans équivalent italien, qui garde 67 % du grain pour 0,50 de cendres, jusqu'au T150 ou integrale, qui en garde 92 à 98 % pour plus de 1,40 de cendres. Plus la farine est complète, plus elle boit d'eau et plus elle fermente lentement. La pizza se fait en T45, T55 et T65, soit 00 et 0 en Italie.");

/* ===========================================================================
   5 · LE RÉSEAU GLUTÉNIQUE — la construction, en trois temps
   Le texte nomme le gluten comme s'il était un ingrédient de la farine. Il ne
   l'est pas : le schéma montre qu'on le FABRIQUE (deux protéines séparées, que
   l'eau et le pétrissage lient), et surtout que le résultat est un FILET —
   d'où le gaz de la levure qui reste dedans au lieu de traverser la pâte.
   Les billes des panneaux 2 et 3 sont celles du panneau 1 : même objet, monté.
   =========================================================================== */
export const reseauGluten = () => figure("gluten", "0 34 660 200", `
            <!-- 1 · La farine sèche : les deux protéines sont là, mais sans contact.
                 Rondes d'un côté, en longues chaînes de l'autre — les deux formes
                 se retrouvent telles quelles dans le réseau des panneaux suivants. -->
            <rect x="10" y="40" width="164" height="150" rx="6" class="s-boite"/>
            <text x="92" y="62" class="s-lbl s-centre">1 · LA FARINE SÈCHE</text>
            <circle cx="36" cy="84"  r="8" class="s-accent"/>
            <circle cx="64" cy="100" r="8" class="s-accent"/>
            <circle cx="40" cy="118" r="8" class="s-accent"/>
            <path d="M100 82 Q117 72 134 82 Q151 92 168 82"    class="s-courbe"/>
            <path d="M100 100 Q117 110 134 100 Q151 90 168 100" class="s-courbe"/>
            <path d="M100 118 Q117 108 134 118 Q151 128 168 118" class="s-courbe"/>
            <text x="51"  y="140" class="s-lbl s-centre">GLIADINE</text>
            <text x="51"  y="154" class="s-lbl s-centre s-fin">EXTENSIBLE</text>
            <text x="133" y="140" class="s-lbl s-centre">GLUTÉNINE</text>
            <text x="133" y="154" class="s-lbl s-centre s-fin">ÉLASTIQUE</text>
            <!-- Le trait de somme : le chiffre porte sur les DEUX colonnes. -->
            <line x1="26" y1="162" x2="158" y2="162" class="s-cote"/>
            <text x="30" y="178" class="s-val">80 %</text>
            <text x="68" y="178" class="s-lbl">DES PROTÉINES</text>

            <line x1="182" y1="115" x2="240" y2="115" class="s-fil" marker-end="url(#f-gluten)"/>
            <text x="211" y="104" class="s-lbl s-centre">+ EAU</text>
            <text x="211" y="132" class="s-lbl s-centre">PÉTRISSAGE</text>

            <!-- 2 · Le réseau : les billes sont désormais ENFILÉES sur les chaînes.
                 Mailles serrées — le filet est monté, mais pas encore sollicité. -->
            <rect x="248" y="40" width="164" height="150" rx="6" class="s-boite"/>
            <text x="330" y="62" class="s-lbl s-centre">2 · LE RÉSEAU SE FORME</text>
            <path d="M264 80 Q286 72 308 80 Q330 88 352 80 Q374 72 396 80" class="s-courbe"/>
            <path d="M264 112 Q286 120 308 112 Q330 104 352 112 Q374 120 396 112" class="s-courbe"/>
            <path d="M264 144 Q286 136 308 144 Q330 152 352 144 Q374 136 396 144" class="s-courbe"/>
            <path d="M264 176 Q286 184 308 176 Q330 168 352 176 Q374 184 396 176" class="s-courbe"/>
            <path d="M264 80 Q256 96 264 112 Q272 128 264 144 Q256 160 264 176" class="s-courbe"/>
            <path d="M308 80 Q316 96 308 112 Q300 128 308 144 Q316 160 308 176" class="s-courbe"/>
            <path d="M352 80 Q344 96 352 112 Q360 128 352 144 Q344 160 352 176" class="s-courbe"/>
            <path d="M396 80 Q404 96 396 112 Q388 128 396 144 Q404 160 396 176" class="s-courbe"/>
            <circle cx="264" cy="80"  r="6" class="s-accent"/><circle cx="308" cy="80"  r="6" class="s-accent"/>
            <circle cx="352" cy="80"  r="6" class="s-accent"/><circle cx="396" cy="80"  r="6" class="s-accent"/>
            <circle cx="264" cy="112" r="6" class="s-accent"/><circle cx="308" cy="112" r="6" class="s-accent"/>
            <circle cx="352" cy="112" r="6" class="s-accent"/><circle cx="396" cy="112" r="6" class="s-accent"/>
            <circle cx="264" cy="144" r="6" class="s-accent"/><circle cx="308" cy="144" r="6" class="s-accent"/>
            <circle cx="352" cy="144" r="6" class="s-accent"/><circle cx="396" cy="144" r="6" class="s-accent"/>
            <circle cx="264" cy="176" r="6" class="s-accent"/><circle cx="308" cy="176" r="6" class="s-accent"/>
            <circle cx="352" cy="176" r="6" class="s-accent"/><circle cx="396" cy="176" r="6" class="s-accent"/>

            <line x1="420" y1="115" x2="478" y2="115" class="s-fil" marker-end="url(#f-gluten)"/>
            <text x="449" y="104" class="s-lbl s-centre">+ LEVURE</text>
            <text x="449" y="132" class="s-lbl s-centre">CO2</text>

            <!-- 3 · Le même filet, mais chargé : les mailles ont grandi autour des
                 bulles et les brins du pourtour bombent vers l'extérieur. C'est le
                 gaz qui pousse, et le réseau qui tient — la pâte lève de là. -->
            <rect x="486" y="40" width="164" height="150" rx="6" class="s-boite"/>
            <text x="568" y="62" class="s-lbl s-centre">3 · LE GAZ EST RETENU</text>
            <path d="M502 80 Q535 68 568 80 Q601 68 634 80" class="s-courbe"/>
            <path d="M502 128 Q535 130 568 128 Q601 126 634 128" class="s-courbe"/>
            <path d="M502 176 Q535 188 568 176 Q601 188 634 176" class="s-courbe"/>
            <path d="M502 80 Q490 128 502 176" class="s-courbe"/>
            <path d="M568 80 Q570 128 568 176" class="s-courbe"/>
            <path d="M634 80 Q646 128 634 176" class="s-courbe"/>
            <circle cx="535" cy="104" r="21" class="s-paton"/>
            <text x="535" y="108" class="s-lbl s-centre">CO2</text>
            <circle cx="601" cy="104" r="21" class="s-paton"/>
            <text x="601" y="108" class="s-lbl s-centre">CO2</text>
            <circle cx="535" cy="152" r="21" class="s-paton"/>
            <text x="535" y="156" class="s-lbl s-centre">CO2</text>
            <circle cx="601" cy="152" r="21" class="s-paton"/>
            <text x="601" y="156" class="s-lbl s-centre">CO2</text>
            <circle cx="502" cy="80"  r="6" class="s-accent"/><circle cx="568" cy="80"  r="6" class="s-accent"/>
            <circle cx="634" cy="80"  r="6" class="s-accent"/><circle cx="502" cy="128" r="6" class="s-accent"/>
            <circle cx="568" cy="128" r="6" class="s-accent"/><circle cx="634" cy="128" r="6" class="s-accent"/>
            <circle cx="502" cy="176" r="6" class="s-accent"/><circle cx="568" cy="176" r="6" class="s-accent"/>
            <circle cx="634" cy="176" r="6" class="s-accent"/>

            <!-- La ligne de commentaire, une base commune sous les trois panneaux. -->
            <text x="92"  y="210" class="s-lbl s-centre">ELLES NE SE TOUCHENT PAS</text>
            <text x="92"  y="226" class="s-lbl s-centre s-fin">la farine sèche ne tient pas</text>
            <text x="330" y="210" class="s-lbl s-centre">UN SEUL RÉSEAU CONTINU</text>
            <text x="330" y="226" class="s-lbl s-centre s-fin">il s'étire sans se rompre</text>
            <text x="568" y="210" class="s-lbl s-centre">LE GAZ NE PEUT PAS SORTIR</text>
            <text x="568" y="226" class="s-lbl s-centre s-fin">la pâte lève, la mie s'alvéole</text>`,
  "Le gluten n'existe pas dans la farine sèche&nbsp;: on le <strong>fabrique</strong>, avec de l'eau et du pétrissage. Ce qu'on obtient est un <strong>filet</strong> — et c'est lui, pas la levure, qui fait lever la pâte&nbsp;: sans réseau, le CO2 traverse la pâte et s'échappe.",
  "Le gluten n'existe pas dans la farine sèche : la gliadine et la gluténine, 80 % des protéines du blé, y restent séparées ; l'eau et le pétrissage les lient en un réseau continu et élastique ; ce filet retient les bulles de dioxyde de carbone de la levure, et c'est lui qui fait lever la pâte.");

/* ===========================================================================
   5 · LA TEMPÉRATURE DE BASE — la règle TB 50
   Le texte donne une soustraction ; le schéma en fait un PARTAGE. La barre vaut
   toujours 50 : ce que la farine y prend en double, l'eau ne l'a plus. On voit
   alors pourquoi une farine chaude appelle une eau froide — et, au cas extrême,
   pourquoi le calcul SORT de la barre et ne donne plus rien de versable.
   =========================================================================== */
export const temperatureBase = () => figure("tb50", "0 2 660 244", `
            <!-- La règle, et la clé de lecture des deux parts de la barre. -->
            <text x="10" y="19" class="s-txt s-fort">La règle TB 50</text>
            <rect x="150" y="7" width="13" height="13" class="s-plein"/>
            <text x="169" y="19" class="s-lbl">FARINE <tspan class='gly'>×</tspan> 2 = Y</text>
            <rect x="300" y="7" width="13" height="13" class="s-aire"/>
            <text x="319" y="19" class="s-lbl">50 <tspan class='gly'>−</tspan> Y = CE QUI RESTE</text>

            <!-- Les trois colonnes : ce qu'on mesure, le partage, ce qu'on verse. -->
            <text x="142" y="38" class="s-lbl s-droite">TEMPÉRATURE FARINE</text>
            <text x="375" y="38" class="s-lbl s-centre">LE TOTAL FAIT TOUJOURS 50</text>
            <text x="654" y="38" class="s-lbl s-droite">L'EAU DE COULAGE</text>
            <line x1="150" y1="44" x2="600" y2="44" class="s-cote"/>
            <line x1="150" y1="44" x2="150" y2="50" class="s-cote"/>

            <!-- HIVER · farine 10 » Y 20 » il reste 30. L'échelle : 9 px pour 1 unité. -->
            <text x="142" y="62" class="s-lbl s-droite">HIVER</text>
            <text x="142" y="77" class="s-txt s-droite">farine 10 °C</text>
            <rect x="150" y="54" width="450" height="26" class="s-aire"/>
            <rect x="150" y="54" width="180" height="26" class="s-plein"/>
            <text x="240" y="72" class="s-txt s-centre s-sur">10 <tspan class='gly'>×</tspan> 2 = 20</text>
            <text x="465" y="72" class="s-lbl s-centre">CE QUI RESTE</text>
            <text x="654" y="72" class="s-val s-droite">30 °C</text>

            <!-- PRINTEMPS ET AUTOMNE · farine 17 » Y 34 » il reste 16. -->
            <text x="142" y="102" class="s-lbl s-droite">PRINTEMPS · AUTOMNE</text>
            <text x="142" y="117" class="s-txt s-droite">farine 17 °C</text>
            <rect x="150" y="94" width="450" height="26" class="s-aire"/>
            <rect x="150" y="94" width="306" height="26" class="s-plein"/>
            <text x="303" y="112" class="s-txt s-centre s-sur">17 <tspan class='gly'>×</tspan> 2 = 34</text>
            <text x="654" y="112" class="s-val s-droite">16 °C</text>

            <!-- ÉTÉ · farine 24 » Y 48 » il ne reste que 2 : le filet de pâle, à droite. -->
            <text x="142" y="142" class="s-lbl s-droite">ÉTÉ</text>
            <text x="142" y="157" class="s-txt s-droite">farine 24 °C</text>
            <rect x="150" y="134" width="450" height="26" class="s-aire"/>
            <rect x="150" y="134" width="432" height="26" class="s-plein"/>
            <text x="366" y="152" class="s-txt s-centre s-sur">24 <tspan class='gly'>×</tspan> 2 = 48</text>
            <text x="654" y="152" class="s-val s-droite">2 °C</text>

            <!-- CAS EXTRÊME · farine 28 » Y 56 : plus aucune part pâle, la barre déborde. -->
            <text x="142" y="182" class="s-lbl s-droite">CAS EXTRÊME</text>
            <text x="142" y="197" class="s-txt s-droite">farine 28 °C</text>
            <rect x="150" y="174" width="504" height="26" class="s-plein"/>
            <text x="375" y="192" class="s-txt s-centre s-sur">28 <tspan class='gly'>×</tspan> 2 = 56</text>
            <text x="627" y="191" class="s-lbl s-centre s-sur">IMPASSE</text>

            <!-- La butée : le 50 de la règle, que rien ne devrait franchir. -->
            <line x1="600" y1="44" x2="600" y2="206" class="s-cote"/>
            <line x1="600" y1="206" x2="654" y2="206" class="s-cote"/>
            <line x1="654" y1="200" x2="654" y2="206" class="s-cote"/>

            <!-- La frontière des deux parts, ligne après ligne : elle ne recule jamais. -->
            <path d="M330 54 L330 80 L456 94 L456 120 L582 134 L582 160 L654 174 L654 200"
                  class="s-fil" marker-end="url(#f-tb50)"/>
            <text x="448" y="131" class="s-lbl s-droite">FARINE PLUS CHAUDE » EAU PLUS FROIDE</text>

            <!-- Ce que vaut le dépassement, en degrés. -->
            <text x="654" y="222" class="s-val s-droite"><tspan class='gly'>−</tspan>6 °C</text>
            <text x="10" y="222" class="s-txt s-fort">Le dépassement, c'est de l'eau négative.</text>
            <text x="304" y="222" class="s-lbl">ELLE N'EXISTE PAS</text>
            <text x="10" y="240" class="s-txt">Il fallait mettre la farine au frais la veille.</text>`,
  "La règle TB&nbsp;50 en une barre&nbsp;: elle vaut toujours 50, et la farine y prend <strong>deux fois</strong> sa température. L'eau n'a que le reste — d'où le contre-sens apparent&nbsp;: <strong>plus la farine est chaude, plus l'eau doit être froide</strong>. À 28&nbsp;°C, la farine prend tout et déborde&nbsp;: l'eau devrait être à <span class='gly'>−</span>6&nbsp;°C, et il n'y a plus de calcul qui rattrape une farine qu'on n'a pas rafraîchie la veille.",
  "La règle TB 50 : la température de la farine multipliée par deux se retranche de 50 pour donner l'eau de coulage. Farine à 10 °C, eau à 30 °C ; farine à 17 °C, eau à 16 °C ; farine à 24 °C, eau à 2 °C ; farine à 28 °C, eau à −6 °C, ce qui est impossible.");

/* ===========================================================================
   5 · LA SUBSTITUTION — ce qui change, et ce qui ne change pas
   Le texte donne les nombres ; il ne montre pas que le kilo de soja PREND LA
   PLACE d'un kilo de blé. Ici les deux barres s'arrêtent sur le même trait
   d'aplomb — 10 kg avant, 10 kg après — et seule l'eau, traitée à part comme
   une addition, dépasse son total de départ. D'où le bassinage.
   =========================================================================== */
export const substitution = () => figure("subst", "0 20 660 253", `
            <!-- 1 · LA FARINE : deux barres de MÊME longueur, la seconde entamée par le soja. -->
            <text x="10" y="28" class="s-lbl">1 · LA FARINE — 10 UNITÉS EN W 330, LE TOTAL NE BOUGE PAS</text>

            <!-- Le trait d'aplomb : posé AVANT les barres, il ne se voit que dans les
                 intervalles — et prouve que les deux s'arrêtent au même endroit. -->
            <line x1="530" y1="32" x2="530" y2="152" class="s-cote"/>

            <text x="138" y="60" class="s-lbl s-droite">SANS SUBSTITUTION</text>
            <rect x="150" y="36" width="380" height="38" rx="4" class="s-plein"/>
            <text x="164" y="60" class="s-lbl s-sur">FARINE DE BLÉ W 330</text>
            <text x="516" y="60" class="s-txt s-fort s-sur s-droite">10 kg</text>

            <text x="138" y="112" class="s-lbl s-droite">AVEC 10 % DE SOJA</text>
            <rect x="150" y="88" width="342" height="38" rx="4" class="s-plein"/>
            <text x="164" y="112" class="s-lbl s-sur">FARINE DE BLÉ W 330</text>
            <text x="478" y="112" class="s-txt s-fort s-sur s-droite">9 kg</text>
            <!-- Le kilo de soja n'allonge pas la barre : il en occupe le dernier dixième. -->
            <rect x="492" y="88" width="38" height="38" rx="4" class="s-boite"/>
            <line x1="534" y1="107" x2="562" y2="107" class="s-fil" marker-end="url(#f-subst)"/>
            <text x="560" y="102" class="s-lbl">FARINE DE SOJA</text>
            <text x="560" y="120" class="s-val">1 kg = 10 %</text>

            <!-- La cote : un seul et même total, avant comme après. -->
            <line x1="150" y1="132" x2="150" y2="152" class="s-cote"/>
            <line x1="308" y1="142" x2="150" y2="142" class="s-cote" marker-end="url(#f-subst)"/>
            <line x1="372" y1="142" x2="530" y2="142" class="s-cote" marker-end="url(#f-subst)"/>
            <text x="340" y="147" class="s-val s-centre">10 kg</text>
            <text x="340" y="168" class="s-lbl s-centre">MÊME POIDS TOTAL DE FARINE — ON REMPLACE, ON N'AJOUTE PAS</text>

            <!-- 2 · L'EAU : le seul poste où la substitution fait vraiment une addition. -->
            <text x="10" y="192" class="s-lbl">2 · L'EAU — LE SEUL POSTE QUI AUGMENTE</text>

            <rect x="10" y="200" width="186" height="52" rx="6" class="s-boite"/>
            <text x="103" y="222" class="s-lbl s-centre">EAU DE BASE · 570 g <tspan class='gly'>×</tspan> 10</text>
            <text x="103" y="242" class="s-val s-centre">5,700 kg</text>

            <text x="212" y="233" class="s-txt s-centre s-gros">+</text>

            <rect x="228" y="200" width="186" height="52" rx="6" class="s-boite"/>
            <text x="321" y="222" class="s-lbl s-centre">COMPLÉMENT · 30 g <tspan class='gly'>×</tspan> 10</text>
            <text x="321" y="242" class="s-val s-centre">0,300 kg</text>
            <text x="321" y="270" class="s-lbl s-centre">VERSÉ EN BASSINAGE, EN FIN DE PÉTRISSAGE</text>

            <text x="430" y="233" class="s-txt s-centre s-gros">=</text>

            <rect x="446" y="200" width="204" height="52" rx="6" class="s-plein"/>
            <text x="548" y="220" class="s-lbl s-centre s-sur">EAU TOTALE</text>
            <text x="548" y="244" class="s-txt s-centre s-sur s-gros">6 kg</text>`,
  "Substituer, ce n'est pas ajouter&nbsp;: le kilo de soja <strong>prend la place</strong> d'un kilo de blé, et la farine reste à 10&nbsp;kg. Seule l'eau grandit — 30&nbsp;g de plus par unité, versés en bassinage.",
  "Substitution de 10 % de soja sur 10 unités en W 330 : 9 kg de farine de blé et 1 kg de soja font toujours 10 kg de farine, tandis que l'eau passe de 5,700 kg à 6 kg par un complément de 30 grammes par unité, versé en bassinage en fin de pétrissage.");

/* ===========================================================================
   5 · LA MARCHE EN AVANT — flux
   Le texte énumère les cinq zones, et une liste se retient comme une liste :
   sans ordre contraignant. Le schéma ajoute ce que l'énumération ne dit pas —
   le sens est irréversible, chaque flèche fait franchir une barrière précise,
   et quand un seul plan sert à tout, c'est le TEMPS qui remplace l'espace.
   Le garnissage ferme la démonstration : le seul poste où le cru et le prêt à
   consommer se croisent forcément, sur le même plan et avec les mêmes mains.
   =========================================================================== */
export const marcheEnAvant = () => figure("marche", "0 6 660 224", `
            <!-- Le flux, du plus sale au plus propre. Cinq stations sur un rail. -->
            <line x1="26" y1="72" x2="646" y2="72" class="s-fil" marker-end="url(#f-marche)"/>
            <text x="26"  y="34" class="s-lbl">LE PLUS SALE</text>
            <text x="634" y="34" class="s-lbl s-droite">LE PLUS PROPRE</text>

            <rect x="12"  y="48" width="112" height="46" rx="6" class="s-boite"/>
            <rect x="140" y="48" width="112" height="46" rx="6" class="s-boite"/>
            <rect x="268" y="48" width="112" height="46" rx="6" class="s-boite"/>
            <rect x="396" y="48" width="112" height="46" rx="6" class="s-boite"/>
            <rect x="524" y="48" width="112" height="46" rx="6" class="s-plein"/>
            <text x="68"  y="70" class="s-txt s-centre">Réception</text>
            <text x="196" y="70" class="s-txt s-centre">Stockage</text>
            <text x="324" y="70" class="s-txt s-centre">Préparation</text>
            <text x="452" y="70" class="s-txt s-centre">Cuisson</text>
            <text x="580" y="70" class="s-txt s-centre s-sur">Service</text>
            <text x="68"  y="86" class="s-lbl s-centre">CARTONS</text>
            <text x="196" y="86" class="s-lbl s-centre">FROID · SEC</text>
            <text x="324" y="86" class="s-lbl s-centre">TAILLE · CUISSON</text>
            <text x="452" y="86" class="s-lbl s-centre">FOUR</text>
            <text x="580" y="86" class="s-lbl s-centre s-sur">PRÊT À SERVIR</text>

            <!-- La règle, énoncée par le dessin : le retour est barré. -->
            <path d="M580 106 C 480 142, 180 142, 68 106" class="s-cote"/>
            <line x1="310" y1="122" x2="346" y2="142" class="s-cond"/>
            <line x1="346" y1="122" x2="310" y2="142" class="s-cond"/>
            <text x="328" y="166" class="s-txt s-centre s-fort">Un produit ne revient jamais en arrière</text>
            <text x="328" y="182" class="s-lbl s-centre">ET NE CROISE JAMAIS UN FLUX PLUS SALE QUE LUI</text>

            <!-- Quand les locaux ne le permettent pas. -->
            <text x="328" y="208" class="s-lbl s-centre">LOCAUX TROP PETITS ? MARCHE EN AVANT DANS LE TEMPS :</text>
            <text x="328" y="222" class="s-lbl s-centre">LE SALE ET LE PROPRE À DES MOMENTS DIFFÉRENTS, NETTOYAGE ENTRE LES DEUX</text>`,
  "La marche en avant est une règle de <strong>sens unique</strong>&nbsp;: chaque station est plus propre que la précédente. En pizzeria, le point sensible est le poste de garnissage, où le cru et le prêt-à-consommer se croisent sur le même plan et sous les mêmes mains.",
  "Le flux va de la réception au service, du plus sale au plus propre. Un produit ne revient jamais en arrière et ne croise jamais un flux plus sale que lui.");

export const formations = () => figure("form", "0 4 660 250", `
            <!-- Les deux portes d'entrée, sans prérequis. -->
            <rect x="8"   y="10" width="314" height="46" rx="6" class="s-plein"/>
            <rect x="338" y="10" width="314" height="46" rx="6" class="s-plein"/>
            <text x="165" y="30" class="s-txt s-centre s-sur">Niveau I — Pizza classique</text>
            <text x="165" y="46" class="s-lbl s-centre s-sur">5 JOURS · 35 H — SANS PRÉREQUIS</text>
            <text x="495" y="30" class="s-txt s-centre s-sur">Niveau I Pro — Pizza classique</text>
            <text x="495" y="46" class="s-lbl s-centre s-sur">2 JOURS · 15 H — MÉTIERS DE BOUCHE</text>

            <!-- Deux variantes de la même porte : même socle, autre habillage. -->
            <rect x="8"   y="64" width="314" height="38" rx="6" class="s-boite"/>
            <rect x="338" y="64" width="314" height="38" rx="6" class="s-boite"/>
            <text x="165" y="80" class="s-txt s-centre">Option hygiène</text>
            <text x="165" y="95" class="s-lbl s-centre">5 JOURS · 44 H</text>
            <text x="495" y="80" class="s-txt s-centre">Fabriquer des pizzas artisanales</text>
            <text x="495" y="95" class="s-lbl s-centre">RS 7404 · 5 JOURS · 35 H</text>

            <!-- Le passage obligé. -->
            <line x1="330" y1="108" x2="330" y2="146" class="s-fil" marker-end="url(#f-form)"/>
            <text x="342" y="132" class="s-lbl">PRÉREQUIS DE TOUT CE QUI SUIT</text>

            <!-- Les quatre approfondissements. -->
            <rect x="8"   y="154" width="152" height="76" rx="6" class="s-boite"/>
            <rect x="172" y="154" width="152" height="76" rx="6" class="s-boite"/>
            <rect x="336" y="154" width="152" height="76" rx="6" class="s-boite"/>
            <rect x="500" y="154" width="152" height="76" rx="6" class="s-boite"/>
            <text x="84"  y="178" class="s-txt s-centre">Niveau II</text>
            <text x="84"  y="196" class="s-lbl s-centre">EMPÂTEMENTS</text>
            <text x="84"  y="209" class="s-lbl s-centre">INDIRECTS</text>
            <text x="84"  y="224" class="s-val s-centre">3 j · 21 h</text>
            <text x="248" y="178" class="s-txt s-centre">Niveau Expert</text>
            <text x="248" y="196" class="s-lbl s-centre">INDIRECTS</text>
            <text x="248" y="209" class="s-lbl s-centre">+ TEGLIA ET PALA</text>
            <text x="248" y="224" class="s-val s-centre">4 jours</text>
            <text x="412" y="178" class="s-txt s-centre">In Teglia &amp; In Pala</text>
            <text x="412" y="196" class="s-lbl s-centre">SPÉCIALISATION</text>
            <text x="412" y="209" class="s-lbl s-centre">VENTE À LA PART</text>
            <text x="412" y="224" class="s-val s-centre">2 j · 14 h</text>
            <text x="576" y="178" class="s-txt s-centre">Pizza napolitaine</text>
            <text x="576" y="196" class="s-lbl s-centre">SPÉCIALISATION</text>
            <text x="576" y="209" class="s-lbl s-centre">STG ET AVPN</text>
            <text x="576" y="224" class="s-val s-centre">5 j · 35 h</text>`,
  "Deux portes d'entrée, et tout le reste derrière elles. Le Niveau&nbsp;I et le Niveau&nbsp;I&nbsp;Pro ouvrent les mêmes suites&nbsp;: le choix entre les deux se fait sur le temps disponible et le statut, pas sur le programme.",
  "Arbre des formations : le Niveau I ou le Niveau I Pro sont le prérequis du Niveau II, du Niveau Expert, de la spécialisation In Teglia et In Pala et de la spécialisation Pizza napolitaine.");

/* ===========================================================================
   11 · LA LEVURE — un seul processus, deux produits
   Le texte dit que la levure fait lever ET qu'elle donne des arômes. Ce que le
   dessin ajoute : c'est la MÊME réaction qui rend les deux, et c'est pour cela
   qu'une pâte qui lève trop vite n'a pas le temps d'avoir du goût.
   =========================================================================== */
export const levure = () => figure("lev", "0 6 660 224", `
            <!-- À gauche : le bourgeonnement, une cellule en une heure. -->
            <text x="8" y="24" class="s-lbl">1 · LA REPRODUCTION</text>
            <circle cx="66"  cy="76" r="30" class="s-plein"/>
            <circle cx="96"  cy="54" r="13" class="s-paton"/>
            <text x="66" y="82" class="s-lbl s-centre s-sur">MÈRE</text>
            <line x1="128" y1="76" x2="186" y2="76" class="s-fil" marker-end="url(#f-lev)"/>
            <text x="157" y="66" class="s-lbl s-centre">1 HEURE</text>
            <circle cx="216" cy="76" r="30" class="s-plein"/>
            <circle cx="278" cy="76" r="30" class="s-plein"/>
            <text x="216" y="82" class="s-lbl s-centre s-sur">MÈRE</text>
            <text x="278" y="82" class="s-lbl s-centre s-sur">FILLE</text>
            <text x="8" y="132" class="s-txt">Deux cellules identiques, toutes les heures.</text>
            <text x="8" y="152" class="s-val">1 g de levure fraîche = 10 milliards de cellules</text>

            <!-- À droite : la fermentation alcoolique. -->
            <line x1="330" y1="20" x2="330" y2="222" class="s-cote"/>
            <text x="352" y="24" class="s-lbl">2 · LA FERMENTATION ALCOOLIQUE</text>
            <rect x="352" y="40" width="128" height="44" rx="6" class="s-boite"/>
            <text x="416" y="60" class="s-txt s-centre">Sucres</text>
            <text x="416" y="76" class="s-lbl s-centre">DE LA FARINE</text>
            <line x1="488" y1="62" x2="524" y2="62" class="s-fil" marker-end="url(#f-lev)"/>
            <text x="506" y="52" class="s-lbl s-centre">LEVURE</text>
            <rect x="530" y="24" width="122" height="38" rx="6" class="s-plein"/>
            <rect x="530" y="68" width="122" height="32" rx="6" class="s-plein"/>
            <text x="591" y="40" class="s-lbl s-centre s-sur">DIOXYDE</text>
            <text x="591" y="54" class="s-lbl s-centre s-sur">DE CARBONE</text>
            <text x="591" y="89" class="s-lbl s-centre s-sur">ALCOOL</text>
            <text x="352" y="128" class="s-txt">Le gaz fait LEVER la pâte.</text>
            <text x="352" y="148" class="s-txt">L'alcool fait les ARÔMES.</text>
            <text x="352" y="176" class="s-lbl">UNE SEULE RÉACTION REND LES DEUX —</text>
            <text x="352" y="192" class="s-lbl">UNE PÂTE QUI LÈVE TROP VITE</text>
            <text x="352" y="208" class="s-lbl">N'A PAS EU LE TEMPS D'AVOIR DU GOÛT.</text>`,
  "Le gaz et l'arôme sortent du <strong>même</strong> processus. C'est la raison pour laquelle une dose de levure excessive donne une pâte qui gonfle vite et ne sent rien&nbsp;: le temps manque, pas la levure.",
  "La levure se reproduit par bourgeonnement en une heure, et transforme les sucres de la farine en dioxyde de carbone, qui fait lever, et en alcool, qui donne les arômes.");

/* ===========================================================================
   12 · DIRECT, POOLISH, BIGA — la frise
   La figure la plus utile du Niveau II. Elle montre que l'indirect n'est pas
   « plus compliqué » mais « plus tôt », et rend visible ce que les stagiaires
   ratent le plus souvent : l'indirect ne passe PAS par un pointage.
   =========================================================================== */
export const directIndirect = () => figure("frise", "0 8 660 224", `
            <text x="96"  y="26" class="s-lbl">LA VEILLE</text>
            <text x="356" y="26" class="s-lbl">LE JOUR MÊME</text>
            <line x1="348" y1="32" x2="348" y2="196" class="s-cote"/>

            <!-- DIRECT : tout le jour même, et il POINTE. -->
            <text x="8" y="60" class="s-txt s-fort">Direct</text>
            <rect x="356" y="42" width="92" height="34" rx="4" class="s-plein"/>
            <rect x="458" y="42" width="92" height="34" rx="4" class="s-boite"/>
            <rect x="560" y="42" width="92" height="34" rx="4" class="s-boite"/>
            <text x="402" y="58" class="s-lbl s-centre s-sur">PÉTRISSAGE</text>
            <text x="402" y="70" class="s-lbl s-centre s-sur">EN UNE FOIS</text>
            <text x="504" y="58" class="s-lbl s-centre">POINTAGE</text>
            <text x="504" y="70" class="s-lbl s-centre">10 à 40 mn</text>
            <text x="606" y="58" class="s-lbl s-centre">DIVISION</text>
            <text x="606" y="70" class="s-lbl s-centre">FROID 3-4 °C</text>

            <!-- POOLISH : une phase la veille, un long repos, PAS de pointage. -->
            <text x="8" y="116" class="s-txt s-fort">Poolish</text>
            <text x="8" y="130" class="s-lbl">LIQUIDE</text>
            <rect x="96"  y="102" width="78"  height="34" rx="4" class="s-plein"/>
            <rect x="180" y="102" width="160" height="34" rx="4" class="s-aire"/>
            <rect x="356" y="102" width="92"  height="34" rx="4" class="s-plein"/>
            <rect x="560" y="102" width="92"  height="34" rx="4" class="s-boite"/>
            <text x="135" y="124" class="s-lbl s-centre s-sur">1re PHASE</text>
            <text x="260" y="124" class="s-txt s-centre">REPOS 12 à 15 h</text>
            <text x="402" y="124" class="s-lbl s-centre s-sur">2e PHASE</text>
            <text x="504" y="118" class="s-lbl s-centre">PAS DE</text>
            <text x="504" y="130" class="s-lbl s-centre">POINTAGE</text>
            <text x="606" y="118" class="s-lbl s-centre">DIVISION</text>
            <text x="606" y="130" class="s-lbl s-centre">FROID 3-4 °C</text>

            <!-- BIGA : même forme, repos plus long, pâte plus stable. -->
            <text x="8" y="172" class="s-txt s-fort">Biga</text>
            <text x="8" y="186" class="s-lbl">SOLIDE</text>
            <rect x="96"  y="158" width="78"  height="34" rx="4" class="s-plein"/>
            <rect x="180" y="158" width="160" height="34" rx="4" class="s-aire"/>
            <rect x="356" y="158" width="92"  height="34" rx="4" class="s-plein"/>
            <rect x="560" y="158" width="92"  height="34" rx="4" class="s-boite"/>
            <text x="135" y="180" class="s-lbl s-centre s-sur">1re PHASE</text>
            <text x="260" y="180" class="s-txt s-centre">REPOS 16 à 20 h</text>
            <text x="402" y="180" class="s-lbl s-centre s-sur">2e PHASE</text>
            <text x="504" y="174" class="s-lbl s-centre">PAS DE</text>
            <text x="504" y="186" class="s-lbl s-centre">POINTAGE</text>
            <text x="606" y="174" class="s-lbl s-centre">DIVISION</text>
            <text x="606" y="186" class="s-lbl s-centre">FROID 3-4 °C</text>

            <text x="330" y="220" class="s-lbl s-centre">LÀ OÙ LE DIRECT POINTE, L'INDIRECT A DÉJÀ FERMENTÉ LA VEILLE</text>`,
  "L'indirect n'est pas <strong>plus compliqué</strong>, il est <strong>plus tôt</strong>. La fermentation a eu lieu la veille&nbsp;: c'est pour cela qu'on ne pointe pas, et c'est l'erreur la plus fréquente en Niveau&nbsp;II.",
  "Frise comparée : l'empâtement direct se fait le jour même avec un pointage de 10 à 40 minutes ; le poolish et la biga commencent la veille par une première phase suivie d'un repos de 12 à 20 heures, et ne comportent pas de pointage.");

export const cornicione = () => figure("corn", "0 10 660 200", `
            <!-- La coupe : deux bourrelets, un centre très fin. -->
            <path d="M60 168 C 60 116, 96 108, 128 136 L 200 152 L 460 152 L 532 136
                     C 564 108, 600 116, 600 168 Z" class="s-plein"/>
            <line x1="60" y1="168" x2="600" y2="168" class="s-axe"/>

            <!-- La cote du centre. -->
            <line x1="330" y1="152" x2="330" y2="196" class="s-cote"/>
            <text x="342" y="190" class="s-lbl">ÉPAISSEUR AU CENTRE · 0,4 cm</text>

            <!-- La cote de la corniche. -->
            <line x1="42" y1="112" x2="42" y2="168" class="s-cote"/>
            <text x="8" y="100" class="s-lbl">CORNICIONE</text>
            <text x="8" y="86"  class="s-val">1 à 2 cm</text>
            <line x1="618" y1="112" x2="618" y2="168" class="s-cote"/>

            <!-- La cote du diamètre. -->
            <line x1="60" y1="208" x2="600" y2="208" class="s-cote" marker-end="url(#f-corn)"/>
            <text x="330" y="204" class="s-lbl s-centre">DIAMÈTRE 22 à 35 cm</text>

            <!-- Le geste : on presse du centre vers le bord, le gaz s'y accumule. -->
            <line x1="316" y1="60" x2="176" y2="60" class="s-fil" marker-end="url(#f-corn)"/>
            <line x1="344" y1="60" x2="484" y2="60" class="s-fil" marker-end="url(#f-corn)"/>
            <circle cx="330" cy="60" r="7" class="s-accent"/>
            <text x="330" y="40" class="s-txt s-centre s-fort">Le geste d'étalage</text>
            <text x="330" y="82" class="s-lbl s-centre">DU CENTRE VERS LE BORD — ON S'ARRÊTE À 1-2 cm</text>
            <text x="330" y="98" class="s-lbl s-centre">C'EST CE GESTE QUI CHASSE LE GAZ DANS LA CORNICHE</text>`,
  "La corniche n'est pas un ourlet qu'on ajoute&nbsp;: c'est le gaz que le geste d'étalage a poussé vers le bord. Garnir jusqu'au bord l'écrase, et elle ne gonflera pas.",
  "Coupe d'une pizza napolitaine : le centre fait 0,4 cm d'épaisseur, la corniche 1 à 2 cm, le diamètre 22 à 35 cm. L'étalage presse du centre vers le bord en s'arrêtant à 1 ou 2 cm.");

/* ===========================================================================
   14 · LA ZONE DE DANGER — l'échelle des températures (module hygiène)
   Le tableau donne quatre valeurs. L'échelle montre que la zone dangereuse est
   LARGE, qu'elle sépare le froid du chaud, et que les deux transitions se
   jouent sur un temps compté.
   =========================================================================== */
export const zoneDanger = () => figure("temp", "0 4 660 268", `
            <!-- L'échelle, du chaud en haut au froid en bas. -->
            <rect x="40" y="12"  width="132" height="52" rx="4" class="s-plein"/>
            <rect x="40" y="64"  width="132" height="120" class="s-aire"/>
            <rect x="40" y="184" width="132" height="40" class="s-boite"/>
            <rect x="40" y="224" width="132" height="40" rx="4" class="s-boite"/>

            <text x="106" y="34"  class="s-lbl s-centre s-sur">LIAISON CHAUDE</text>
            <text x="106" y="52"  class="s-txt s-centre s-sur">+63 °C et plus</text>
            <text x="106" y="118" class="s-txt s-centre s-fort">ZONE DANGEREUSE</text>
            <text x="106" y="136" class="s-lbl s-centre">+10 à +63 °C</text>
            <text x="106" y="208" class="s-txt s-centre">0 à +4 °C</text>
            <text x="106" y="248" class="s-txt s-centre"><tspan class='gly'>−</tspan>18 °C et moins</text>

            <!-- Ce que chaque palier veut dire, aligné en colonne. -->
            <line x1="180" y1="38"  x2="232" y2="38"  class="s-fil" marker-end="url(#f-temp)"/>
            <line x1="180" y1="124" x2="232" y2="124" class="s-fil" marker-end="url(#f-temp)"/>
            <line x1="180" y1="204" x2="232" y2="204" class="s-fil" marker-end="url(#f-temp)"/>
            <line x1="180" y1="244" x2="232" y2="244" class="s-fil" marker-end="url(#f-temp)"/>
            <text x="242" y="42"  class="s-txt">Maintien au chaud avant service</text>
            <text x="242" y="118" class="s-txt s-fort">Une population bactérienne peut</text>
            <text x="242" y="136" class="s-txt s-fort">DOUBLER TOUTES LES 20 MINUTES</text>
            <text x="242" y="208" class="s-txt">Froid positif — denrées très périssables</text>
            <text x="242" y="248" class="s-txt">Congélation, au cœur du produit</text>

            <!-- Les deux transitions : on traverse la zone, on n'y séjourne pas. -->
            <rect x="242" y="152" width="200" height="30" rx="4" class="s-boite"/>
            <rect x="450" y="152" width="202" height="30" rx="4" class="s-boite"/>
            <text x="252" y="164" class="s-lbl">REFROIDISSEMENT RAPIDE</text>
            <text x="252" y="177" class="s-val">+63 » +10 °C en moins de 2 h</text>
            <text x="460" y="164" class="s-lbl">REMISE EN TEMPÉRATURE</text>
            <text x="460" y="177" class="s-val">+63 °C en moins d'1 h</text>`,
  "La zone dangereuse est <strong>large</strong> — cinquante-trois degrés. On la traverse vite, on n'y séjourne pas&nbsp;: c'est tout le sens des deux durées maximales.",
  "Échelle des températures : au-dessus de 63 °C la liaison chaude, entre 10 et 63 °C la zone dangereuse où les bactéries doublent toutes les vingt minutes, de 0 à 4 °C le froid positif, à moins 18 °C la congélation.");

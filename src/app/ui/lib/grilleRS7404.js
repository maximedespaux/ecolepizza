/**
 * LA GRILLE D'ÉVALUATION « Fabriquer des pizzas artisanales RS7404 », en données.
 *
 * POURQUOI ELLE EST ICI. Trente-huit critères aux libellés longs, sept compétences et quatre
 * formes de règle : les retaper à la main serait une demi-journée, et une faute de frappe dans
 * un critère d'examen ne se voit qu'au moment où un candidat la conteste. Ce fichier n'est
 * qu'un POINT DE DÉPART proposé par un bouton — rien n'est enregistré tant que l'organisme n'a
 * pas cliqué sur « Enregistrer la grille », et tout y reste modifiable ensuite.
 *
 * SOURCE : le PDF « 2-grille évaluation RS7404 » de l'école, 4 pages, relu page par page.
 *
 * ⚠️ NE PAS CONFONDRE AVEC `protocoles.js`, qui décrit une AUTRE certification — le titre RNCP
 * « Artisan pizzaïolo », 4 blocs et 836 points, noté en points. Celle-ci est la certification
 * du Répertoire Spécifique RS7404, et son jury ne pose pas de points : il coche des critères.
 *
 * `min` = nombre de critères à valider ; `null` signifie « tous », ce qui reste juste si un
 * critère est ajouté. `oblig` marque un critère sans lequel la compétence tombe, quel que soit
 * le compte — c'est ce que la grille imprime en rouge.
 *
 * DEUX COQUILLES DU DOCUMENT SONT REPRODUITES TELLES QUELLES : C5.1 répète « au moment de
 * l'enfournement » et C5.5 finit par « etc...), etc.). ». C'est le document de l'organisme ;
 * le corriger d'autorité ferait diverger l'écran du papier que le jury a en main.
 */
export const GRILLE_RS7404 = {
  label: "Grille d'évaluation — Fabriquer des pizzas artisanales RS7404",
  competences: [
    {
      code: "C1", label: "Fabriquer une pâte à pizza artisanale", min: null,
      criteres: [
        "Utilisation correcte des ingrédients de base (farine, levure, eau, sel, huile), avec des dosages adaptés selon la recette donnée.",
        "Respect de l'ordre d'incorporation des ingrédients dans chaque protocole (ex : autolyse avant le sel dans le semi-direct).",
        "Application correcte et rigoureuse des 2 protocoles - empâtement direct et semi-direct - (enchaînement logique des étapes, bonne gestion du pétrissage).",
        "Respect des temps de pétrissage, d'autolyse et de repos (pointage) prévus dans les deux protocoles.",
        "Obtention d'une pâte homogène, souple, non collante, à bonne température (± 22-26 °C), adaptée au boulage manuel.",
        "Capacité à expliquer, de manière simple mais juste, les différences entre les deux protocoles et leur impact sur la pâte (texture, goût, structure).",
      ],
    },
    {
      code: "C2", label: "Bouler manuellement", min: 5,
      criteres: [
        "Division de la pâte en pâtons de poids identique. Poids des pâtons conforme 280gr (écart toléré : ±5 g).",
        "Mise en forme du pâton en posant la main en dôme au-dessus de la pâte, puis en effectuant un mouvement circulaire continu pour former progressivement une boule",
        { label: "Obtention d'un pâton bien rond, régulier et uniforme.", oblig: true },
        "Surface lisse et sans déchirure visible.",
        "Pâton ayant une bonne fermeté (boule serrée et compacte)",
        "Temps imparti respecté (6 pâtons boulés en 2 minutes)",
      ],
    },
    {
      code: "C3", label: "Façonner un fond de pizza", min: null,
      criteres: [
        "Étalage manuel (pression, rotation, étirement) sans déchirer la pâte. Mouvements rotatifs avec une faible pression sur la pâte pour l'agrandir",
        "Obtention d'une forme ronde régulière de diamètre min de 29 cm",
        "Épaisseur uniforme sur l'ensemble de la pâte en laissant un rebord plus épais à l'extérieur du disque",
        "Étalage de 3 pâtons temps limité à 3 mn",
      ],
    },
    {
      code: "C4", label: "Réaliser une pizza", min: null,
      criteres: [
        "Respect du temps imparti : Les 3 pizzas sont finalisées dans le temps défini par l'exercice en 15 mn maximum",
        "Étalage correct de la base : La base est répartie de manière uniforme jusqu'à environ 1 à 2 cm du bord, sans surcharge ni zones sèches",
        "Respect de l'ordre des étapes de montage : Les ingrédients sont déposés dans le bon ordre selon la recette (ex. base → fromage → garniture principale → herbes)",
        "Respect des grammages : Les quantités d'ingrédients sont conformes à la fiche recette (tolérance ± 5g si manuel, ± 10g si visuel)",
        "Répartition harmonieuse des ingrédients : Garniture bien répartie, couvrant la surface de manière équilibrée",
        "Apparence finale professionnelle : La pizza est appétissante, bien structurée et conforme au rendu attendu",
      ],
    },
    {
      code: "C5", label: "Cuire une pizza", min: 4,
      criteres: [
        "La pizza ne présente aucune déformation au moment de l'enfournement au moment de l'enfournement.",
        "La rotation de la pizza dans le four est effectuée à l'aide de la pelle en veillant à la cuisson.",
        "Le défournement intervient quand la pâte est cuite à cœur, le bord croustillant, la garniture fondante ou gratinée selon les attentes ; la cuisson est régulière et homogène, sans brûlure excessive (<25%) ni zone insuffisamment cuite.",
        "Les gestes liés à la cuisson (enfournement, rotation, défournement) sont fluides, efficaces et adaptés au rythme de production",
        { label: "Les règles de sécurité sont respectées (utilisation des pelles, port de gants, poste sécurisée, etc...), etc.).", oblig: true },
      ],
    },
    {
      code: "C6", label: "Présenter une pizza", min: 4,
      criteres: [
        "Le support est adapté au mode de consommation choisi (assiette, planche, boîte, plateau)",
        "Le support est propre, sans coulures ni résidus visibles.",
        "La pizza est de forme ronde sans déformations visibles (ovale, asymétrie etc…)",
        "La garniture est uniformément répartie, sans surcharge, sans débordement excessif sur le rebord.",
        "La pizza présente un contraste appétissant, avec des couleurs vives et une bonne lisibilité des ingrédients.",
      ],
    },
    {
      code: "C7", label: "Respecter la réglementation", min: null,
      criteres: [
        "Lavage systématique des mains avant le boulage",
        "Nettoyage du poste de travail à chaque étape avec des produits adaptés (compatibles avec les aliments)",
        "Port d'une tenue professionnelle complète adaptée (couvre-chef, tablier propre, chaussures fermées anti-dérapante)",
        "Utilisation de Gants thermiques / pelles à four",
        "Application du DUERP (risque de TMS-dos, brûlures, …)",
        "Explication des allergènes présents dans la fiche recette",
      ],
    },
  ],
};

/** Mise en forme pour l'éditeur : chaque critère devient { label, obligatoire }, numéroté C1.1… */
export function grilleDepart() {
  return GRILLE_RS7404.competences.map((c) => ({
    id: null, code: c.code, label: c.label, min_valides: c.min,
    criteres: c.criteres.map((cr, i) => ({
      id: null,
      label: `${c.code}.${i + 1} - ${typeof cr === "string" ? cr : cr.label}`,
      obligatoire: typeof cr === "string" ? 0 : (cr.oblig ? 1 : 0),
    })),
  }));
}

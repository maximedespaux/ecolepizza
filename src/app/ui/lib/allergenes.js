/**
 * RÉFÉRENTIEL DES ALLERGÈNES — quel ingrédient porte quoi.
 *
 * ⚠️ LE FICHIER À FAIRE VALIDER PAR L'ÉCOLE. Tout le reste du projet peut se relire ; celui-ci
 * doit se relire. Un stagiaire à qui l'on dit qu'un produit est sûr le répétera à un client, et
 * l'erreur ne se rattrape pas au comptoir. Il est écrit en un seul endroit, en clair, pour être
 * corrigible en une ligne — c'est la seule forme acceptable pour une donnée de cette nature.
 *
 * POURQUOI ICI, ET PAS DANS LE JEU QUI S'EN SERT. La table vivait dans `CommandePiege.jsx`, donc
 * dans un jeu. Or la même question se pose aux fiches recettes, à la boutique, à la carte : c'est
 * une donnée de l'organisme, pas un décor de mini-jeu. `garnitures.js` porte déjà les 44 produits
 * et leurs catégories mais AUCUN allergène — c'est cette couche-là qui manquait.
 *
 * POURQUOI UN MODULE ET PAS UN JSON. Un JSON ne porte pas de commentaires, et c'est précisément
 * sur ce fichier qu'il en faut : « souvent » n'est pas « toujours », et la raison d'un « à
 * vérifier » doit voyager avec lui. Un tableau nu se recopierait sans sa nuance.
 *
 * DEUX NIVEAUX DE CERTITUDE, ET LA DISTINCTION EST TOUT :
 *   · `allergenes` — CERTAIN, par composition. Un chèvre est un fromage, un anchois un poisson.
 *     Ça se vérifie en lisant le mot, sans connaître le fournisseur.
 *   · `verifier` — DÉPEND DU FOURNISSEUR. Le manuel écrit « SOUVENT des sulfites (le jambon) » :
 *     répondre « non » avec aplomb sur une charcuterie est faux même quand on tombe juste. La
 *     bonne réponse professionnelle est « je vérifie la fiche ».
 *
 * LA CATÉGORIE DONNE LE DÉFAUT, L'INGRÉDIENT CORRIGE. Ranger « Poulet » en Charcuterie est
 * commode pour une carte, mais un blanc de poulet ne porte pas les sulfites d'un saucisson : la
 * catégorie ment, l'exception la reprend. C'est ce qui permet d'ajouter un produit sans relire
 * toute la table — et de repérer d'un coup d'œil les cas qui sortent du rang.
 *
 * Sources : les 14 allergènes et les mentions « sulfites (ex. vinaigre balsamique, charcuteries…) »
 * viennent de la fiche « Les allergènes » du Manuel Technique Niveau I (cf. `lib/notions.js`).
 * Le reste est déduit de la composition, ou marqué à vérifier.
 */

/** Les 14 à déclaration obligatoire — la liste du manuel, dans son ordre. */
export const ALLERGENES = [
  { cle: "gluten", nom: "Gluten" },
  { cle: "crustaces", nom: "Crustacés" },
  { cle: "oeufs", nom: "Œufs" },
  { cle: "poissons", nom: "Poissons" },
  { cle: "arachides", nom: "Arachides" },
  { cle: "soja", nom: "Soja" },
  { cle: "lait", nom: "Lait" },
  { cle: "fruits_a_coque", nom: "Fruits à coque" },
  { cle: "celeri", nom: "Céleri" },
  { cle: "moutarde", nom: "Moutarde" },
  { cle: "sesame", nom: "Sésame" },
  { cle: "lupin", nom: "Lupin" },
  { cle: "mollusques", nom: "Mollusques" },
  { cle: "sulfites", nom: "Sulfites" },
];
export const nomAllergene = (cle) => (ALLERGENES.find((a) => a.cle === cle) || {}).nom || cle;

/**
 * Le défaut par catégorie de `garnitures.js`. Une catégorie absente d'ici ne porte rien —
 * Légumes, Aromates : c'est le cas le plus fréquent, et l'écrire ligne à ligne ferait du bruit.
 */
export const PAR_CATEGORIE = {
  Fromage: { allergenes: ["lait"] },
  // « Sulfites et anhydride sulfureux (ex. vinaigre balsamique, CHARCUTERIES…) » — manuel.
  // « Souvent », donc à vérifier : c'est la nuance que le mot porte, et elle change la réponse.
  Charcuterie: { verifier: ["sulfites"] },
  Mer: { allergenes: ["poissons"] },
};

/**
 * Les exceptions, par clé de produit. Trois raisons d'en avoir une :
 *   1. la catégorie ment (le poulet n'est pas une charcuterie au sens des sulfites) ;
 *   2. le produit est composé (le pesto porte les pignons ET le parmesan) ;
 *   3. le produit n'a pas de catégorie (les bases et les fromages, rangés à part dans
 *      `garnitures.js`).
 */
export const PAR_INGREDIENT = {
  /* ═══════════════════════════════════════════════════════════════════════════════════════
     — FARINES DE SUBSTITUTION —  ⚠️ À FAIRE VALIDER, comme le reste de ce fichier.

     LA PÂTE EST UN INGRÉDIENT, et c'est ce qui permet à tout le reste de marcher sans une
     ligne de logique en plus : une farine posée dans la composition passe par `verdict()`
     comme une garniture. Les clés reprennent celles de `SUBSTITUTIONS` (lib/dough.js,
     manuel p.32), préfixées, pour qu'aucune liste ne soit recopiée.

     LE GLUTEN N'EST PAS RÉPÉTÉ ICI. Une substitution remplace une PART du poids de blé, à
     poids total constant (manuel : Les substitutions · Définition) : le blé reste
     majoritaire, la pâte porte toujours du gluten quelle que soit la farine ajoutée. Le
     marquer sur chaque farine laisserait croire qu'une pâte sans farine marquée en serait
     exempte — l'inverse exact de la leçon.

     ET UNE SEULE DE CES FARINES AJOUTE UN DES 14 : le soja. C'est le point qui vaut d'être
     enseigné, parce que l'intuition dit le contraire :
      · CHÂTAIGNE — sonne comme un fruit à coque, n'en est pas un. Le règlement (UE)
        1169/2011, annexe II, point 8, NOMME les fruits à coque concernés : amande, noisette,
        noix, noix de cajou, noix de pécan, noix du Brésil, pistache, macadamia. La châtaigne
        n'y figure pas. Un allergique aux fruits à coque n'a donc rien à en craindre au titre
        des 14 — ce qui ne dispense jamais d'écouter le client.
      · SARRASIN — sans gluten par nature, et absent des 14 malgré des allergies connues.
      · MAÏS, SEIGLE, ÉPEAUTRE, BLÉS T80/T110/T150 — aucun des 14 en propre. Les trois
        derniers et le seigle sont des céréales à gluten, déjà couvert par la pâte. */
  farine_soja: { allergenes: ["soja"] },
  farine_chataigne: {},
  farine_sarrasin: {},
  farine_seigle: {},
  farine_mais: {},
  farine_epeautre: {},

  // — Bases —
  tomate: {},
  creme: { allergenes: ["lait"] },
  creme_chorizo: { allergenes: ["lait"], verifier: ["sulfites"] },
  ratatouille: {},
  blanche: {},
  // Pesto : pignons de pin (fruits à coque) et parmesan (lait). Une recette industrielle peut
  // remplacer les pignons par de la noix de cajou — fruits à coque dans les deux cas.
  pesto: { allergenes: ["fruits_a_coque", "lait"] },
  // Sauce BBQ : moutarde, soja et sulfites selon la marque. Rien de certain — tout à vérifier.
  bbq: { verifier: ["moutarde", "soja", "sulfites"] },

  // — Fromages : la catégorie suffit, mais `garnitures.js` les range hors catégorie (GARN_DAIRY).
  mozzarella: { allergenes: ["lait"] }, mozza_bufala: { allergenes: ["lait"] },
  stracciatella: { allergenes: ["lait"] }, burrata: { allergenes: ["lait"] },
  ricotta: { allergenes: ["lait"] }, chevre: { allergenes: ["lait"] },
  gorgonzola: { allergenes: ["lait"] }, parmesan: { allergenes: ["lait"] },
  reblochon: { allergenes: ["lait"] }, feta: { allergenes: ["lait"] },
  scamorza: { allergenes: ["lait"] },

  // — Bases ajoutées : elles ouvrent trois allergènes que rien d'autre ne portait. —
  // Moutarde-miel : la moutarde est certaine, c'est le nom du produit.
  moutarde_miel: { allergenes: ["moutarde"] },
  // Satay : cacahuète par définition, et presque toujours du soja (sauce) et du sésame (huile).
  // L'arachide est certaine ; le reste dépend de la recette du fournisseur.
  satay: { allergenes: ["arachides"], verifier: ["soja", "sesame"] },

  // — Exceptions dans les catégories —
  // Un blanc de poulet n'est pas un produit de salaison : il ne porte pas les sulfites que la
  // catégorie « Charcuterie » lui prêterait.
  poulet: {},
  // Les noix SONT l'allergène, rangées en « Douceurs » avec le miel et la figue qui n'ont rien.
  noix: { allergenes: ["fruits_a_coque"] },
  oeuf: { allergenes: ["oeufs"] },

  /* — MER : la catégorie dit « poissons », et c'est FAUX pour la moitié des produits. Les 14
     distinguent poissons, crustacés et mollusques : une allergie aux crustacés n'est pas une
     allergie au poisson, et servir des moules à quelqu'un d'allergique aux crustacés parce que
     « c'est de la mer » est exactement le genre de raccourci qui envoie aux urgences. */
  crevettes: { allergenes: ["crustaces"] },
  moules: { allergenes: ["mollusques"] },
  calamars: { allergenes: ["mollusques"] },

  /* — CHARCUTERIES : le défaut de la catégorie (sulfites à vérifier) leur va, sauf deux. —
     La mortadelle porte SOUVENT des pistaches — c'est même ce qui la caractérise chez beaucoup
     de fabricants. Fruits à coque à vérifier, en plus des sulfites de sa catégorie. */
  mortadelle: { verifier: ["sulfites", "fruits_a_coque"] },

  /* Les fruits SECS sont presque toujours traités à l'anhydride sulfureux — c'est ce qui leur
     garde leur couleur. « Presque toujours » n'est pas « toujours » : à vérifier, comme les
     charcuteries. Le manuel nomme d'ailleurs les deux dans la même ligne. */
  abricot_sec: { verifier: ["sulfites"] },

  // — Fruits à coque et graines : ils SONT l'allergène, rangés en « Douceurs » ou « Aromates »
  //   avec des produits qui ne portent rien.
  pignons: { allergenes: ["fruits_a_coque"] },
  amande: { allergenes: ["fruits_a_coque"] },
  pistache: { allergenes: ["fruits_a_coque"] },
  sesame: { allergenes: ["sesame"] },

  // — Fromages ajoutés : même famille, même allergène. Écrits un à un parce que `GARN_DAIRY`
  //   n'a pas de `cat` dans `garnitures.js` — leur défaut serait introuvable.
  emmental: { allergenes: ["lait"] }, comte: { allergenes: ["lait"] },
  raclette: { allergenes: ["lait"] }, brie: { allergenes: ["lait"] },
  bleu: { allergenes: ["lait"] }, cheddar: { allergenes: ["lait"] },
  mascarpone: { allergenes: ["lait"] },
};

/**
 * Ce que porte un ingrédient : l'exception si elle existe, le défaut de sa catégorie sinon.
 *
 * L'exception REMPLACE le défaut, elle ne s'y ajoute pas — sans quoi « poulet: {} » ne pourrait
 * jamais annuler les sulfites de sa catégorie, et l'exception ne servirait à rien.
 */
export function porte(cle, categorie) {
  const exception = PAR_INGREDIENT[cle];
  const source = exception || PAR_CATEGORIE[categorie] || {};
  return { allergenes: source.allergenes || [], verifier: source.verifier || [] };
}

/**
 * Le verdict d'une composition face à un allergène : « non », « verifier » ou « oui ».
 *
 * UN ALLERGÈNE CERTAIN L'EMPORTE SUR UN DOUTE. Une pizza qui porte du pesto (fruits à coque,
 * certain) et du jambon cru (sulfites, à vérifier) doit répondre « non » à une allergie aux
 * fruits à coque, sans discussion : le doute sur un autre produit ne dilue pas une certitude.
 *
 * @param ingredients [{ cle, categorie, label }]
 * @returns { rep, causes } — `causes` sert à expliquer, jamais à décider
 */
export function verdict(ingredients, allergene) {
  const certains = [], douteux = [];
  for (const i of ingredients) {
    const p = porte(i.cle, i.categorie);
    if (p.allergenes.includes(allergene)) certains.push(i.label);
    else if (p.verifier.includes(allergene)) douteux.push(i.label);
  }
  if (certains.length) return { rep: "non", causes: certains };
  if (douteux.length) return { rep: "verifier", causes: douteux };
  return { rep: "oui", causes: [] };
}

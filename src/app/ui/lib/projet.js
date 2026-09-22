/**
 * « VOTRE PROJET » — LES CASES, LEURS GROUPES ET LEURS LIBELLÉS, en un seul endroit.
 *
 * Du JavaScript pur, sans JSX (cf. l'en-tête d'`etapes.js`) : les tests de `src/api/test`
 * l'importent. Le formulaire (EditStagiaireModal) et la fiche (StagiaireDetail) le lisent tous deux.
 *
 * POURQUOI UN CATALOGUE. Six cases tenaient dans une ligne de code, recopiée à trois endroits du
 * formulaire (état initial, conversion en booléens, cases rendues) et une fois sur la fiche. Le projet
 * en compte désormais vingt-quatre (migrations 172 et 173) : quatre copies de vingt-quatre cases
 * divergeraient au premier ajout, et une case oubliée dans la conversion s'enregistre en chaîne vide,
 * sans un mot. Le côté serveur a son pendant (src/api/lib/projet.js) ; un test vérifie que les deux
 * connaissent les mêmes cases.
 *
 * QUATRE QUESTIONS DISTINCTES (demandé le 2026-09-22) : la NATURE du projet, le TYPE D'ACTIVITÉ,
 * l'ÉQUIPEMENT qu'il appelle, et son AVANCEMENT. `migration` : la case n'existe en base qu'après
 * elle — le formulaire dit quand elle n'a pas pu être enregistrée.
 */
export const GROUPES_PROJET = [
  {
    titre: "Nature du projet", ligne: "Nature",
    cases: [
      { k: "project_creation", l: "Création" },
      { k: "project_takeover", l: "Reprise" },
      { k: "project_job", l: "Cherche poste pizzaïolo(la)" },
      /* « Perfectionnement » (migration 158) : qui exerce déjà et vient se perfectionner n'avait
         aucune case, et ressortait avec un projet VIDE, indiscernable d'une fiche non remplie. */
      { k: "project_improvement", l: "Perfectionnement", migration: 158 },
    ],
  },
  {
    titre: "Type d'activité", ligne: "Activité",
    cases: [
      { k: "project_dine_in", l: "Pizzeria sur place", migration: 173 },
      { k: "project_takeaway", l: "À emporter / livraison", migration: 173 },
      { k: "project_by_slice", l: "Pizza à la part", migration: 173 },
      { k: "project_vending", l: "Distributeur automatique", migration: 173 },
      { k: "project_catering", l: "Traiteur / événementiel", migration: 173 },
      { k: "project_add_on", l: "En complément d'un commerce (boulangerie, bar, camping…)", migration: 173 },
    ],
  },
  {
    titre: "Équipement", ligne: "Équipement",
    cases: [
      /* Le FOUR, précisé une fois coché : son type (172) et s'il est déjà acheté (173) — la
         première question d'un fabricant de fours. Bois ET gaz : un four mixte. */
      { k: "project_oven", l: "Four", precisions: [
        { k: "project_oven_wood", l: "Bois", migration: 172 },
        { k: "project_oven_electric", l: "Électrique", migration: 172 },
        { k: "project_oven_gas", l: "Gaz", migration: 172 },
        { k: "project_oven_owned", l: "Déjà acheté", migration: 173 },
      ] },
      { k: "project_truck", l: "Camion / Remorque" },
      { k: "project_kneader", l: "Pétrin", migration: 173 },
      { k: "project_sheeter", l: "Laminoir / façonneuse", migration: 173 },
      { k: "project_fridge_counter", l: "Saladette / vitrine réfrigérée", migration: 173 },
    ],
  },
  {
    /* L'AVANCEMENT reste à l'école : il ne part pas aux partenaires (le stagiaire consent à « la
       nature de mon projet », pas à son financement ni à sa date d'ouverture). */
    titre: "Avancement", ligne: "Avancement",
    cases: [
      { k: "project_premises", l: "Local trouvé", migration: 173 },
      { k: "project_funded", l: "Financement obtenu", migration: 173 },
      { k: "project_opening_soon", l: "Ouverture prévue sous 6 mois", migration: 173 },
      { k: "project_support", l: "Accompagnement souhaité (business plan)", migration: 173 },
      { k: "project_more_training", l: "Intéressé par une formation complémentaire", migration: 173 },
    ],
  },
];

const toutes = GROUPES_PROJET.flatMap((g) => g.cases.flatMap((c) => [c, ...(c.precisions || [])]));

/** Toutes les cases du projet, précisions du four comprises. */
export const CASES_PROJET = toutes.map((c) => c.k);

/** Les précisions du four : « Four » décoché les emporte. */
export const PRECISIONS_FOUR = GROUPES_PROJET.flatMap((g) => g.cases).find((c) => c.k === "project_oven").precisions.map((p) => p.k);

/** La migration qui a créé chaque case tardive : { project_oven_wood: 172, … }. */
export const MIGRATION_DES_CASES = Object.fromEntries(toutes.filter((c) => c.migration).map((c) => [c.k, c.migration]));

/**
 * Les lignes de la carte « Projet » de la fiche : une par groupe renseigné — « Nature : Création ·
 * Perfectionnement », « Équipement : Four (bois, gaz) · Pétrin ». Les groupes vides n'apparaissent pas.
 */
export function lignesProjet(l) {
  const coche = (k) => !!l && Number(l[k]) === 1;
  return GROUPES_PROJET.map((g) => ({
    label: g.ligne,
    value: g.cases.filter((c) => coche(c.k)).map((c) => {
      const precisions = (c.precisions || []).filter((p) => coche(p.k)).map((p) => p.l.toLocaleLowerCase("fr"));
      return precisions.length ? `${c.l} (${precisions.join(", ")})` : c.l;
    }).join(" · "),
  })).filter((r) => r.value);
}

/**
 * Conseil matériel — fours et pétrins.
 *
 * ⚠️ TOUT ce fichier vient des MANUELS DE L'ÉCOLE, pas du web. C'est ce qui fait sa valeur :
 * n'importe quel revendeur sait réciter une fiche technique, personne d'autre ne dit à un
 * stagiaire qu'un four à bois impose un ramonage deux fois par an avec facture à l'appui pour
 * l'assurance. Si on complète un jour avec une source externe, on le marque — un conseil de
 * l'école et une donnée constructeur n'engagent pas la même chose.
 *
 * Sources (manuel « Niveau I — Pizza classique », éd. 2026-07-05) :
 *   p.47  la cuisson : températures par type de pizza, les trois chaleurs
 *   p.48  fours à bois (traditionnel, sole rotative) + les contraintes
 *   p.49  fours à gaz, hybride, convoyeur
 *   p.50  fours électriques (digital / mécanique / sole rotative) + table temps de cuisson
 *   p.51  les pétrins (spirale tête fixe/relevable, axe oblique, bras plongeants)
 * Livret d'accueil p.10 : la formation « Pizza Napolitaine » est agréée et certifiée AVPN.
 * Manuel Niveau II p.36-37 : une napolitaine AVPN se cuit entre 400 et 485 °C.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────
   CE QUE TU VEUX CUIRE — p.47
   C'est la PREMIÈRE question, et elle décide de tout le reste : la température requise
   élimine des énergies et des modèles avant même de parler budget.
   ──────────────────────────────────────────────────────────────────────────────────────── */
export const TYPES_PIZZA = [
  { id: "classique", label: "Classique", tmin: 320, tmax: 360,
    aide: "La pizza de tous les jours. La plus large gamme de fours convient." },
  { id: "contemporaine", label: "Contemporaine", tmin: 360, tmax: 380,
    aide: "Plus haute hydratation, cuisson plus vive qu'une classique." },
  { id: "napolitaine", label: "Napolitaine", tmin: 400, tmax: 450,
    aide: "Cuisson très courte à très haute température. C'est elle qui exclut le plus de fours.",
    avpn: { tmin: 400, tmax: 485, note: "Une napolitaine AVPN se cuit entre 400 et 485 °C (manuel Niveau II). Sous 400 °C, ce n'est pas une napolitaine." } },
  { id: "teglia", label: "In teglia / à la plaque", tmin: 320, tmax: 320,
    aide: "Cuisson en plaque, à la part. Température modérée mais longue." },
];

/* p.50 — la table de cuisson du manuel. Sert à montrer qu'une voûte plus chaude ne fait pas
   « mieux » : elle fait plus vite, et ce n'est pas la même pizza. */
export const TABLE_CUISSON = [
  { voute: 360, sole: 310, minutes: 3.5 },
  { voute: 340, sole: 300, minutes: 4 },
  { voute: 320, sole: 290, minutes: 5 },
];

/* p.47 — les trois chaleurs. Utile pour comprendre pourquoi une sole rotative change la vie :
   la conduction est le seul mode qui dépend d'un CONTACT, donc d'un point fixe. */
export const CHALEURS = [
  { id: "rayonnement", label: "Rayonnement", texte: "La chaleur se diffuse par la voûte du four vers la pizza." },
  { id: "convection", label: "Convection", texte: "L'air chaud tourne naturellement dans le four et vient à la pizza." },
  { id: "conduction", label: "Conduction", texte: "La sole (le sol du four) chauffe la pizza par contact direct." },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
   L'ÉNERGIE — p.48 à 50
   `contraintes` n'est pas du remplissage : ce sont les lignes que le stagiaire découvre
   normalement APRÈS avoir signé. Le ramonage biannuel avec facture pour l'assurance, le
   conduit isolé réglementé, le stockage du bois — un revendeur ne les met pas en avant.
   ──────────────────────────────────────────────────────────────────────────────────────── */
export const ENERGIES = [
  {
    id: "BOIS", label: "Bois", tmax: 500,
    resume: "Le gage de qualité commercial. Cuisson très rapide, idéale napolitaine et contemporaine.",
    pour: [
      "Argument commercial fort : le bois se voit et se vend.",
      "Cuisson très rapide — le terrain naturel de la napolitaine.",
      "Le four garde sa chaleur pour le lendemain.",
    ],
    contraintes: [
      "Sécurité des locaux.",
      "Sortie des fumées : conduit isolé réglementé.",
      "Ramonage 2 fois par an — facture à l'appui, exigée par l'assurance.",
      "Qualité du bois (séchage) et place pour le stocker.",
    ],
    variantes: [
      { id: "traditionnel", label: "Traditionnel", texte: "2 à 5 pizzas selon le diamètre. Bâti sur place ou en kit." },
      { id: "sole_rotative", label: "Sole rotative", texte: "L'évolution du traditionnel : foyer sur le côté (gain de place) et plus besoin de tourner les pizzas." },
    ],
  },
  {
    id: "GAZ", label: "Gaz", tmax: 450,
    resume: "4 à 6 pizzas par chambre, 1 ou 2 chambres superposées. Mêmes caractéristiques que l'électrique.",
    pour: [
      "Pas de conduit à bois, pas de ramonage.",
      "Montée en température rapide et maîtrisée.",
      "La solution quand la puissance électrique du local ne suit pas.",
    ],
    contraintes: [
      "Raccordement gaz et ses contrôles.",
      "Extraction obligatoire malgré tout.",
    ],
    variantes: [
      { id: "chambre", label: "À chambre", texte: "4 à 6 pizzas par chambre, 1 ou 2 chambres superposées." },
      { id: "sole_rotative", label: "Sole rotative", texte: "Foyer sur le côté : gain de place, plus de rotation des pizzas." },
    ],
  },
  {
    id: "ELECTRIQUE", label: "Électrique", tmax: 450,
    resume: "4, 6 ou 9 pizzas par chambre, 1 ou 2 chambres. Le plus simple à installer.",
    pour: [
      "Aucun conduit à bois, aucun ramonage, aucun stockage.",
      "Réglage fin de la voûte et de la sole séparément.",
      "Le plus simple à faire accepter par un bailleur ou une copropriété.",
    ],
    contraintes: [
      "Demande de la puissance électrique — à vérifier AVANT de signer un bail.",
      "Les modèles à commande mécanique sont mal isolés : la facture s'en ressent.",
    ],
    variantes: [
      { id: "digital", label: "Commande digitale", texte: "Réglage bien plus précis selon les modes et les temps (classique ou teglia). Fours récents, excellente isolation." },
      { id: "mecanique", label: "Commande mécanique", texte: "Deux boutons, affichage de 1 à 10, températures moins précises. Ancienne génération, moins bien isolée donc plus gourmande — mais les prix sont plus attractifs." },
      { id: "sole_rotative", label: "Sole rotative", texte: "La nouveauté : plus de rotation des pizzas dans la chambre, cuissons fiables et régulières." },
    ],
  },
  {
    id: "HYBRIDE", label: "Hybride bois + gaz", tmax: 500,
    resume: "Fonctionne au bois ET au gaz — mais uniquement SIMULTANÉMENT.",
    pour: ["L'aspect et le goût du bois, avec l'appoint du gaz pour tenir la température."],
    contraintes: [
      "Les deux énergies ne s'utilisent que simultanément : tu gardes TOUTES les contraintes du bois (conduit, ramonage, stockage) ET celles du gaz.",
    ],
    variantes: [],
  },
  {
    id: "CONVOYEUR", label: "Convoyeur", tmax: 350,
    resume: "Cuisson parfaite et uniforme sans rotation. Pour le volume — le geste disparaît.",
    pour: [
      "Cadence et régularité : la pizza sort toujours pareil, quel que soit l'opérateur.",
      "Pratique pour une cuisson à 80 % destinée aux distributeurs à pizzas.",
    ],
    contraintes: [
      "Le geste du pizzaïolo disparaît. Souvent utilisé par les chaînes et les franchises.",
      "N'atteint pas les températures d'une napolitaine.",
    ],
    variantes: [],
  },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
   LES PÉTRINS — p.51
   Le choix ne se joue PAS sur la capacité seule. Trois familles, trois pâtes différentes :
   la vitesse échauffe, l'oxygénation aère. C'est un choix de produit avant d'être un choix
   de volume.
   ──────────────────────────────────────────────────────────────────────────────────────── */
export const PETRINS = [
  {
    id: "SPIRALE", label: "Spirale", kg_min: 10, kg_max: 60, vitesse: "rapide",
    resume: "Le plus rapide. Empâtement plus lisse, mie plus régulière.",
    pour: [
      "Accélère la formation de la maille gluténique.",
      "L'empâtement est plus lisse, avec une mie plus régulière.",
      "Le plus répandu — donc le plus facile à faire réparer.",
    ],
    contraintes: [
      "Sa vitesse échauffe l'empâtement : les temps de pétrissage sont plus courts et demandent plus de précision.",
    ],
    variantes: [
      { id: "tete_fixe", label: "Tête fixe", texte: "Plus contraignant pour sortir la pâte et pour le nettoyage." },
      { id: "tete_relevable", label: "Tête relevable", texte: "Plus facile pour sortir la pâte, cuve démontable pour l'entretien. Plus onéreux." },
    ],
  },
  {
    id: "AXE_OBLIQUE", label: "Axe oblique", kg_min: 10, kg_max: 80, vitesse: "2× plus lent que le spirale",
    resume: "Les bras soulèvent la pâte et l'oxygènent : mie très aérée.",
    pour: [
      "Les bras soulèvent la pâte et l'oxygènent davantage → une mie très aérée.",
      "Entretien facile.",
      "Sa lenteur échauffe peu la pâte : plus de marge sur les temps.",
    ],
    contraintes: ["Il prend beaucoup de place."],
    variantes: [],
  },
  {
    id: "BRAS_PLONGEANTS", label: "Bras plongeants", kg_min: 50, kg_max: 150, vitesse: "entre les deux",
    resume: "Reproduit au plus près le geste du pizzaïolo. Conseillé pour les gros volumes.",
    pour: [
      "Reproduit au plus près les gestes du pizzaïolo.",
      "Brassage beaucoup plus aéré → une mie plus développée.",
      "Maille gluténique : plus rapide que l'axe oblique, plus lente que le spirale.",
    ],
    contraintes: [
      "Entretien plus difficile.",
      "Prend plus de place.",
      "Le plancher bas est haut : 50 kg de pâte minimum, ce n'est pas un premier labo.",
    ],
    variantes: [],
  },
];

/* ────────────────────────────────────────────────────────────────────────────────────────
   LA LOGIQUE DE CONSEIL
   Des règles, pas des opinions : chacune se rattache à une valeur des manuels.
   ──────────────────────────────────────────────────────────────────────────────────────── */

/** Température requise pour une liste de types de pizza. On prend le MAXIMUM : un four qui
 *  monte haut sait toujours descendre, l'inverse est faux. */
export function tempRequise(typeIds, avpn = false) {
  const types = TYPES_PIZZA.filter((t) => typeIds.includes(t.id));
  if (!types.length) return null;
  let need = Math.max(...types.map((t) => t.tmin));
  // L'AVPN est plus exigeant que « napolitaine » tout court : le manuel Niveau II donne
  // 400-485 °C. On ne descend pas sous 400 si le stagiaire vise la certification.
  if (avpn && typeIds.includes("napolitaine")) need = Math.max(need, 400);
  return need;
}

/** Les énergies qui atteignent la température voulue. Le convoyeur tombe de lui-même sur une
 *  napolitaine — c'est le but : la règle explique le refus au lieu de masquer le modèle. */
export function energiesPour(typeIds, avpn = false) {
  const need = tempRequise(typeIds, avpn);
  return ENERGIES.map((e) => ({
    ...e,
    possible: need == null || e.tmax >= need,
    pourquoi_pas: need != null && e.tmax < need
      ? `Monte à ${e.tmax} °C ; il t'en faut ${need}.`
      : null,
  }));
}

/** Le pétrin selon le volume de pâte par fournée. Renvoie la famille adaptée + pourquoi les
 *  autres ne le sont pas. Les bornes viennent du manuel p.51, pas d'un avis. */
export function petrinsPour(kg) {
  if (!kg || kg <= 0) return PETRINS.map((p) => ({ ...p, possible: true, pourquoi_pas: null }));
  return PETRINS.map((p) => {
    const trop_petit = kg > p.kg_max;
    const trop_gros = kg < p.kg_min;
    return {
      ...p,
      possible: !trop_petit && !trop_gros,
      pourquoi_pas: trop_petit ? `Sa cuve plafonne à ${p.kg_max} kg.`
        : trop_gros ? `Il démarre à ${p.kg_min} kg : en dessous, la pâte ne sera pas travaillée.`
        : null,
    };
  });
}

/** 1 kg de farine ≈ 6 pâtons de 280 g (manuel Niveau I p.27). Sert à traduire « je fais
 *  N pizzas par service » en kilos de pâte — la seule unité que comprend un pétrin. */
export const PATONS_PAR_KG_FARINE = 6;
export function kgPateDepuisPizzas(pizzas, grammesParPaton = 280) {
  if (!pizzas) return 0;
  return +((pizzas * grammesParPaton) / 1000).toFixed(1);
}

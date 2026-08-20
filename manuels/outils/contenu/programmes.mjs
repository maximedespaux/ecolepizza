/**
 * LES PROGRAMMES ET LES PLANNINGS — pages 12 à 21 du livret d'accueil.
 *
 * Ces pages avaient été résumées en un tableau de synthèse dans la première
 * version : c'était une perte. Le programme théorique/pratique heure par heure
 * est ce qu'un stagiaire lit avant de s'inscrire, ce qu'un financeur demande, et
 * ce qu'un audit Qualiopi vérifie. Il est ici repris INTÉGRALEMENT, dans l'ordre
 * et avec les libellés d'origine.
 *
 * LES HORAIRES SONT CEUX DU LIVRET, remis au propre : la couche texte du PDF les
 * rendait dans le désordre (« 13H00-17H1508H45-12H00 »). Les totaux ont été
 * recalculés et recoupés avec les durées annoncées — voir A-VERIFIER.md pour les
 * trois qui ne tombent pas juste.
 */
import { chapitre, enc, tbl, averif } from "../gabarit.mjs";

/* Les cinq trames horaires du centre. Une journée = matin + après-midi. */
const J = {
  lundiLong:   ["Lundi", "08 h 45 – 12 h 00", "13 h 00 – 17 h 15"],   // 7 h 30
  lundiCourt:  ["Lundi", "—", "13 h 00 – 17 h 15"],
  pleine:      ["", "08 h 00 – 12 h 00", "13 h 00 – 16 h 30"],        // 7 h 30
  pleineLongue:["", "08 h 00 – 12 h 00", "13 h 00 – 17 h 30"],        // 8 h 30
  derniere:    ["Vendredi", "08 h 00 – 12 h 00", "13 h 00 – 14 h 00"],// 5 h 00
};
const jour = (nom, trame) => [nom, trame[1], trame[2]];

/** Rend le tableau de planning. */
const planning = (lignes) => tbl(
  ["Jour", ["Matin", "c"], ["Après-midi", "c"]],
  lignes.map(([j, m, a]) => [[`<strong>${j}</strong>`, ""], [m, "c"], [a, "c"]]),
  { titre: "Planning", compact: true },
);

/** Rend une liste d'objectifs. */
const objectifs = (titre, heures, items) => `
        <h4 class="sous">${titre} <span class="mention">— ${heures}</span></h4>
        <ul class="liste serre">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

/* ===========================================================================
   LE CATALOGUE — un objet par formation, repris mot pour mot du livret
   =========================================================================== */
export const PROGRAMMES = {
  niveau1: {
    titre: "Niveau I — Pizza classique",
    duree: "5 jours · 35 heures",
    theorie: ["12 heures", [
      "Identifier les composants du blé, le type et la force de la farine",
      "Citer les ingrédients de la pâte à pizza avec le poids par unité de calcul",
      "Donner le taux d'hydratation en fonction du W de la farine",
      "Énumérer les différentes levures et comprendre leurs actions",
      "Indiquer les différentes matières grasses et expliquer leurs rôles",
      "Expliquer le rôle du sel en panification",
      "Calculer la température de base pour l'eau de coulage",
    ]],
    pratique: ["23 heures", [
      "Fabriquer un empâtement direct",
      "Pointer, diviser, peser, bouler et bloquer",
      "Contrôler l'étiquetage avec DLC et DLUO",
      "Élaborer la sauce tomate",
      "Réaliser la mise en place des matières premières (tranchage et cuisson)",
      "Étaler les pâtons à la main",
      "Réaliser des pizzas classiques et des calzones en effectuant le chiquetage",
      "Élaborer une pizza traiteur, par le formateur",
      "Effectuer le travail de pelles pour enfourner et défourner en gérant les cuissons",
      "Décrire les différents matériels utilisés en pizzeria",
      "Gérer l'organisation en pizzeria",
      "Nettoyer et ranger le poste de travail et le matériel",
    ]],
    planning: [
      jour("Lundi", J.lundiLong), jour("Mardi", J.pleine),
      jour("Mercredi", J.pleine), jour("Jeudi", J.pleine), J.derniere,
    ],
  },

  pro: {
    titre: "Niveau I Pro — Pizza classique",
    duree: "2 jours · 15 heures",
    prerequis: "Professionnels des métiers de bouche",
    theorie: ["4 heures", [
      "Connaître les composants du blé, le type et la force de la farine",
      "Citer les ingrédients de la pâte à pizza avec le poids par unité de calcul",
      "Donner le taux d'hydratation en fonction du W de la farine",
      "Énumérer les différentes levures et comprendre leurs actions",
      "Indiquer les différentes matières grasses et expliquer leurs rôles",
      "Expliquer le rôle du sel en panification",
      "Calculer la température de base pour l'eau de coulage",
    ]],
    pratique: ["11 heures", [
      "Fabriquer l'empâtement direct",
      "Pointer, diviser, peser, bouler et bloquer — <em>boulage avec test de rapidité</em>",
      "Élaborer la sauce tomate",
      "Étaler les pâtons à la main et réaliser des pizzas classiques — <em>avec test de rapidité</em>",
      "Effectuer le travail de pelle pour enfourner et défourner en gérant les cuissons",
    ]],
    planning: [jour("Lundi", J.lundiLong), jour("Mardi", J.pleine)],
  },

  niveau2: {
    titre: "Niveau II — Empâtements indirects",
    duree: "3 jours · 21 heures",
    prerequis: "Niveau I ou Niveau I Pro",
    theorie: ["4 heures", [
      "Identifier les empâtements indirects Poolish et Biga",
      "Connaître les quantités nécessaires et le protocole des empâtements indirects « Poolish &amp; Biga »",
    ]],
    pratique: ["11 heures", [
      "Réaliser la 1<sup>re</sup> et la 2<sup>e</sup> phase des empâtements indirects « Poolish &amp; Biga »",
      "Contrôler la pousse",
      "Diviser, peser, bouler et bloquer la pâte",
      "Étaler les pâtons",
      "Réaliser des pizzas classiques et créatives",
      "Évaluer les différences entre les empâtements « Poolish &amp; Biga »",
    ]],
    planning: [jour("Lundi", J.lundiLong), jour("Mardi", J.pleine)],
    alerte: `Le livret de 2023 donne ce programme sur <strong>2 jours et 15 heures</strong>
      (4 h de théorie + 11 h de pratique) alors que les dossiers de formation 2026 annoncent
      <strong>3 jours et 21 heures</strong>. Le planning ci-dessus est celui du livret&nbsp;: il
      lui manque une journée.`,
  },

  expert: {
    titre: "Niveau Expert — Spécialités italiennes",
    duree: "4 jours",
    prerequis: "Niveau I ou Niveau I Pro",
    theorie: ["8 heures", [
      "Identifier les empâtements indirects Poolish, Biga, Contemporaine, In Teglia et In Pala",
      "Nommer les ingrédients et le poids pour chaque empâtement",
      "Décrire le protocole pour chaque empâtement",
    ]],
    pratique: ["24 heures", [
      "<strong>Poolish &amp; Biga</strong> — réaliser la 1<sup>re</sup> et la 2<sup>e</sup> phase des empâtements indirects",
      "Contrôler la pousse · diviser, peser, bouler et bloquer la pâte · étaler les pâtons",
      "Réaliser des pizzas classiques et créatives",
      "Évaluer les différences entre les empâtements « Poolish &amp; Biga »",
      "<strong>In Teglia &amp; In Pala</strong> — réaliser l'empâtement direct et les empâtements indirects (50 % et 100 % Biga), 1<sup>re</sup> et 2<sup>e</sup> phase",
      "Mettre sur plaque ou sur pelle, garnir et cuire les deux empâtements",
      "Découper la <em>teglia</em> et la <em>pala</em>",
      "Évaluer les différences entre les différents empâtements",
      "<strong>Contemporaine</strong> — démonstration de pizzas contemporaines",
    ]],
    planning: [
      jour("Lundi", J.lundiLong), jour("Mardi", J.pleineLongue),
      jour("Mercredi", J.pleineLongue), jour("Jeudi", J.pleine),
    ],
    alerte: `Le programme totalise <strong>32 heures</strong> (8 + 24) et le planning ci-dessus
      aussi. Aucun document de l'école ne donne de durée en heures pour l'Expert&nbsp;: seule
      « 4 jours » est écrite partout. La couverture du manuel n'annonce donc pas d'heures.`,
  },

  teglia: {
    titre: "Spécialisation In Teglia &amp; In Pala",
    duree: "2 jours · 14 heures",
    prerequis: "Niveau I ou Niveau I Pro",
    theorie: ["4 heures", [
      "Différencier les dénominations <em>In Teglia</em> et <em>In Pala</em>",
      "Sélectionner les farines adaptées et les ingrédients de la pâte",
      "Expliquer le protocole des deux empâtements, direct et indirect",
      "Donner le taux d'hydratation",
    ]],
    pratique: ["11 heures", [
      "Réaliser l'empâtement direct et les empâtements indirects (50 % et 100 % Biga), 1<sup>re</sup> et 2<sup>e</sup> phase",
      "Contrôler la pousse",
      "Diviser, peser, bouler et bloquer la pâte",
      "Étaler les pâtons",
      "Mettre sur plaque ou sur pelle, garnir et cuire les deux empâtements",
      "Découper la <em>teglia</em> et la <em>pala</em>",
      "Évaluer les différences entre les différents empâtements",
    ]],
    planning: [jour("Lundi", J.lundiLong), jour("Mardi", J.pleine)],
    alerte: `Le programme totalise <strong>15 heures</strong> (4 + 11) alors que la formation est
      annoncée à <strong>14 heures</strong> partout ailleurs.`,
  },

  napolitaine: {
    titre: "Spécialisation Pizza napolitaine",
    duree: "5 jours · 35 heures",
    prerequis: "Niveau I ou Niveau I Pro",
    theorie: ["7 heures", [
      "Décrire l'histoire de la pizza napolitaine et expliquer le dépôt de la marque auprès de la Commission européenne — Spécialité traditionnelle garantie, par l'association <em>Verace Pizza Napoletana</em>",
      "Nommer les ingrédients de la pâte à pizza avec le poids par unité de calcul",
      "Expliquer le protocole de l'empâtement en maîtrisant la température en fin de pétrissage",
      "Énumérer les matières premières utilisées et leurs dosages pour la réalisation des pizzas « Margherita » et « Marinara »",
    ]],
    pratique: ["28 heures", [
      "Peser les matières premières pour la pâte",
      "Réaliser le protocole de l'empâtement en maîtrisant la température en fin de pétrissage, à la main et au pétrin",
      "Diviser, bouler, peser, stocker en bac",
      "Étaler les abaisses à la main",
      "Élaborer une sauce tomate",
      "Garnir de sauce tomate et cuire les fonds de pâte",
      "Réaliser des pizzas napolitaines",
      "Gérer la température des fours",
      "Effectuer le travail de pelles pour enfourner et défourner",
    ]],
    planning: [
      jour("Lundi", J.lundiLong), jour("Mardi", J.pleine),
      jour("Mercredi", J.pleine), jour("Jeudi", J.pleine), J.derniere,
    ],
  },

  hygiene: {
    titre: "Option — Hygiène alimentaire",
    duree: "Option supplémentaire",
    theorie: ["Apport théorique", [
      "Aliments et risques pour le consommateur",
      "Les fondamentaux de la réglementation communautaire et nationale",
      "Le plan de maîtrise sanitaire",
    ]],
    pratique: ["Études de cas et travail pratique", [
      "Études de cas et observations",
      "Travail pratique en utilisant le guide de bonnes pratiques d'hygiène",
    ]],
    note: `Le stage spécifique en hygiène alimentaire est adapté à l'activité des établissements
      de restauration commerciale. <strong>À l'issue de la formation, une attestation est
      délivrée</strong>, en conformité avec la réglementation en vigueur.`,
  },
};

/**
 * Une page de programme. `cles` : les entrées de PROGRAMMES à rendre, une par
 * page. Le premier appel ouvre le chapitre, les suivants le prolongent.
 */
export function pagesProgrammes(m, cles) {
  const n = m.chapSuivant();
  cles.forEach((cle, i) => {
    const p = PROGRAMMES[cle];
    m.p(`
${i === 0 ? chapitre(n, "Les programmes", "Le détail de chaque formation, heure par heure, et son planning.") : ""}
        <h3 class="sec">${p.titre}</h3>
        <p class="mention"><strong>${p.duree}</strong>${p.prerequis ? ` · Prérequis&nbsp;: ${p.prerequis}` : ""}</p>
${objectifs("Programme théorique", p.theorie[0], p.theorie[1])}
${objectifs("Programme pratique", p.pratique[0], p.pratique[1])}
${p.planning ? planning(p.planning) : ""}
${p.note ? enc("note", "À savoir", `<p>${p.note}</p>`) : ""}
${p.alerte ? enc("verif", "Durée à confirmer", `<p>${p.alerte} ${averif("à trancher — Marie-Christine")}</p>`) : ""}
`, i === 0 ? { chap: "Les programmes", num: n, sous: p.titre } : { sous: p.titre });
  });
  return m;
}

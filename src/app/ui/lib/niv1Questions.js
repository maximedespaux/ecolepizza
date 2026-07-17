// Banque de questions — Niveau I (Pizza classique), tirée du Manuel Technique Niveau I.
// Formats : "qcm" (choix), "vf" (vrai/faux), "assoc" (associations).
//
// NIVEAU D'ENTRÉE, VOLONTAIREMENT ACCESSIBLE (arbitrage Maxime, 2026-07-17) : la formation
// dure 5 jours, il faut compacter. On garde ce qu'un pizzaïolo utilise au labo (doses,
// températures, gestes) et on laisse tomber la trivia académique (noms latins des levures,
// noms des protéines du gluten, procédé d'obtention du sel) — ça ne fait pas une meilleure
// pizza. Le calcul appliqué et le diagnostic sont réservés au Niveau II et à l'Expert.
//
// ⚠️ DISTRACTEURS PLAUSIBLES — la règle la plus importante de ce fichier. Une mauvaise
// réponse absurde (« la couleur du sac », « Escherichia coli », « 100 °C ») s'élimine SANS
// rien connaître : la question ne teste plus rien. Chaque leurre doit donc être une valeur
// crédible du métier (une autre plage de W réelle, une dose voisine, un autre grade d'huile).
//
// La bonne réponse est écrite en premier (a: 0) pour se relire facilement — le jeu mélange
// les choix à l'affichage (cf. PizzaQuest.jsx), donc la position ne trahit rien.
// Vrai/faux équilibrés (autant de vrai que de faux), sinon répondre « vrai » partout suffit.
//
// Contenu fidèle au manuel ; à faire relire par un formateur avant diffusion large.

export const NIV1_CHAPTERS = [
  {
    title: "La farine", ic: "wheat", questions: [
      { t: "qcm", q: "Que mesure le « W » d'une farine ?", c: ["Sa force : la résistance du pâton au travail", "Son taux d'hydratation", "Son taux de cendres", "Sa finesse de mouture"], a: 0 },
      { t: "qcm", q: "Pour une pizza napolitaine, quelle force de farine ?", c: ["W 250–310", "W 180–220", "W 320–380", "W 400–430"], a: 0 },
      { t: "qcm", q: "À quoi sert le réseau de gluten dans la pâte ?", c: ["À retenir le gaz des levures et donner de l'élasticité", "À nourrir les levures", "À colorer la croûte à la cuisson", "À faire tenir le sel dans la pâte"], a: 0 },
      { t: "vf", q: "L'indice W est imprimé sur le sac de farine.", a: false },
      { t: "assoc", q: "Associe chaque force de farine à son usage :", pairs: [["W 120–150", "Biscuits & crackers"], ["W 250–310", "Pizza napolitaine"], ["W 400–430", "Renfort (Manitoba)"]] },
    ],
  },
  {
    title: "La levure", ic: "yeast", questions: [
      { t: "qcm", q: "Au-delà de quelle température de l'eau la levure est-elle détruite ?", c: ["50 °C", "40 °C", "60 °C", "70 °C"], a: 0 },
      { t: "qcm", q: "Dose usuelle de levure fraîche par kilo de farine ?", c: ["2 à 4 g", "1 à 2 g", "5 à 7 g", "8 à 10 g"], a: 0 },
      { t: "qcm", q: "Pour réhydrater la levure sèche active, l'eau doit être à environ :", c: ["38 °C", "25 °C", "45 °C", "55 °C"], a: 0 },
      { t: "qcm", q: "Plus la farine est froide, la dose de levure doit être…", c: ["Plus élevée", "Plus faible", "Identique", "Divisée par deux"], a: 0 },
      { t: "vf", q: "Une dose de levure trop élevée donne une pâte plus savoureuse et qui se conserve mieux.", a: false },
    ],
  },
  {
    title: "L'eau & la température", ic: "droplet", questions: [
      { t: "qcm", q: "Comment nomme-t-on l'eau qui sert à pétrir la pâte ?", c: ["L'eau de coulage", "L'eau de bassinage", "L'eau de frasage", "L'eau de détrempe"], a: 0 },
      { t: "qcm", q: "Formule de l'école (TB 50) : farine à 17 °C → eau de coulage à…", c: ["16 °C", "33 °C", "34 °C", "24 °C"], a: 0 },
      { t: "qcm", q: "Quelle dureté d'eau est idéale pour la pâte ?", c: ["15 à 30 °f", "0 à 5 °f", "35 à 50 °f", "Plus de 60 °f"], a: 0 },
      { t: "qcm", q: "Température idéale de la pâte en fin de pétrissage ?", c: ["23 à 25 °C", "18 à 20 °C", "27 à 29 °C", "30 à 32 °C"], a: 0 },
      { t: "vf", q: "Plus l'eau est douce (calcaire proche de 0 °f), meilleure est la pâte.", a: false },
    ],
  },
  {
    title: "Le sel & l'huile", ic: "salt", questions: [
      { t: "qcm", q: "Dosage usuel du sel par kilo de farine ?", c: ["17 à 22 g", "8 à 12 g", "25 à 30 g", "35 à 40 g"], a: 0 },
      { t: "qcm", q: "Quel est l'effet du sel sur la fermentation ?", c: ["Il la freine et la régularise", "Il l'accélère", "Il la déclenche", "Il n'a aucun effet dessus"], a: 0 },
      { t: "qcm", q: "Une huile d'olive « extra vierge » a une acidité :", c: ["Inférieure à 0,8 %", "Inférieure à 2 %", "Inférieure à 3,3 %", "Supérieure à 3,3 %"], a: 0 },
      { t: "vf", q: "La vraie pizza napolitaine ne contient pas d'huile dans sa pâte.", a: true },
      { t: "assoc", q: "Associe chaque huile à son acidité :", pairs: [["Extra vierge", "< 0,8 %"], ["Vierge", "≤ 2 %"], ["1er prix", "> 3,3 %"]] },
    ],
  },
  {
    title: "L'empâtement", ic: "refresh", questions: [
      { t: "qcm", q: "Dans l'empâtement direct, quand ajoute-t-on le sel ?", c: ["Vers la fin, petit à petit, avant l'huile", "Tout au début, avec la farine", "Dans l'eau de coulage", "Après le pointage"], a: 0 },
      { t: "qcm", q: "Le « pointage » désigne…", c: ["Le repos de la pâte en masse, après le pétrissage", "Le repos des pâtons après le boulage", "La mise en forme du disque", "La cuisson à blanc du fond"], a: 0 },
      { t: "qcm", q: "L'hydratation minimale en empâtement direct tourne autour de :", c: ["54 %", "45 %", "62 %", "70 %"], a: 0 },
      { t: "qcm", q: "En autolyse, dans quel ordre travaille-t-on ?", c: ["Farine + eau, repos, puis sel et levure", "Tout ensemble d'un coup", "Farine + levure, repos, puis eau", "Eau + sel, repos, puis farine"], a: 0 },
      { t: "vf", q: "L'autolyse permet d'obtenir une pâte plus extensible.", a: true },
    ],
  },
  {
    title: "La cuisson & le matériel", ic: "flame", questions: [
      { t: "qcm", q: "Température de cuisson d'une pizza napolitaine ?", c: ["400 à 450 °C", "280 à 320 °C", "320 à 360 °C", "480 à 520 °C"], a: 0 },
      { t: "qcm", q: "La chaleur transmise par contact direct avec la sole s'appelle…", c: ["La conduction", "Le rayonnement", "La convection", "L'inertie"], a: 0 },
      { t: "qcm", q: "Le pétrin à spirale travaille des quantités de pâte de…", c: ["10 à 60 kg", "2 à 5 kg", "60 à 120 kg", "120 à 200 kg"], a: 0 },
      { t: "vf", q: "Un four à bois doit être ramoné 2 fois par an.", a: true },
      { t: "assoc", q: "Associe chaque type de pizza à sa température de cuisson :", pairs: [["Classique", "320–360 °C"], ["Napolitaine", "400–450 °C"], ["Plaque (teglia)", "320 °C"]] },
    ],
  },
];

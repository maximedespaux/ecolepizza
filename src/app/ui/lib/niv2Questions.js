// Banque de questions — Niveau II (Empâtements indirects « Poolish · Biga »), tirée du
// Manuel Technique NIVEAU II. Le Niveau I couvre déjà gluten / farine / levure / eau / sel /
// huile : cette banque porte sur ce que le Niveau II apporte VRAIMENT — la méthode indirecte,
// le poolish, la biga, leurs protocoles, et le choix d'un empâtement selon le service.
//
// Formats : "qcm" (choix), "vf" (vrai/faux), "assoc" (associations).
// La bonne réponse d'un qcm est écrite en premier (a: 0) pour se relire facilement — le jeu
// mélange les choix à l'affichage (cf. PizzaQuest.jsx), donc la position ne trahit rien.
// Les vrai/faux sont volontairement équilibrés (autant de vrai que de faux) : sinon répondre
// toujours « vrai » suffit à passer.
//
// `expl` = LE POURQUOI affiché après la réponse, `src` = la page du manuel pour y retourner.
// Les pages citées ont été vérifiées dans le PDF (protocole poolish p. 22-23, définition et
// table de dosage biga p. 25, tableau des différences p. 34) — on ne cite pas une page au
// jugé, le stagiaire ira l'ouvrir.
//
// Contenu fidèle au manuel ; à faire relire par un formateur avant diffusion large.

export const NIV2_CHAPTERS = [
  {
    title: "Direct ou indirect", ic: "refresh", questions: [
      { t: "qcm", q: "Combien d'étapes compte un empâtement indirect (biga ou poolish) ?", c: ["2 étapes : un pré-ferment, puis la pâte finale", "1 seule étape", "3 étapes", "Autant qu'on veut"], a: 0,
        expl: "C'est la définition même de l'indirect : on fait d'abord fermenter une partie de la farine et de l'eau (le pré-ferment), puis on incorpore le reste. Le direct, lui, mélange tout d'un coup.", src: "Manuel Niveau II, p. 21" },
      { t: "qcm", q: "En méthode directe, on…", c: ["Mélange tous les ingrédients en une seule fois", "Prépare d'abord un pré-ferment", "Ne met pas de levure", "Pétrit toujours 20 minutes"], a: 0,
        expl: "Le direct est la méthode du Niveau I : tout ensemble, une seule fermentation. Simple et rapide, mais moins d'arômes qu'un pré-ferment qui a travaillé une nuit.", src: "Manuel Niveau II, p. 21" },
      { t: "qcm", q: "Selon le manuel, quels avantages l'indirect apporte-t-il face au direct ?", c: ["Meilleur goût, arômes plus intenses, meilleure digestion", "Une pâte moins chère", "Un pétrissage plus court", "Moins de levure à acheter"], a: 0,
        expl: "La longue pré-fermentation développe les arômes et pré-digère les amidons. C'est du temps, pas de la technique : l'indirect ne coûte rien de plus, il demande de l'organisation.", src: "Manuel Niveau II, p. 21-22" },
      { t: "vf", q: "En 1ère phase d'un empâtement indirect, on prépare un pré-ferment avec de la farine, de l'eau et de la levure, laissé à température ambiante.", a: true,
        expl: "Vrai : farine, eau, levure — pas de sel ni d'huile, ils viendront en 2ème phase. Le sel freinerait la fermentation qu'on cherche justement à lancer.", src: "Manuel Niveau II, p. 23 et 25" },
      { t: "vf", q: "La méthode indirecte demande plus de temps de fermentation totale que la méthode directe pour une qualité équivalente.", a: false,
        expl: "Faux, et c'est tout l'intérêt : à qualité égale l'indirect ne rallonge pas le total, il le RÉPARTIT. Le pré-ferment travaille pendant la nuit, sans toi.", src: "Manuel Niveau II, p. 21-22" },
      { t: "assoc", q: "Associe chaque méthode à son nombre d'étapes :", pairs: [["Direct", "1 étape"], ["Poolish", "2 étapes"], ["Biga", "2 étapes"]],
        expl: "Poolish et biga sont tous deux des indirects en 2 phases. Ce qui les sépare n'est pas le nombre d'étapes mais la texture du pré-ferment : liquide pour l'un, solide pour l'autre.", src: "Manuel Niveau II, p. 21-25" },
    ],
  },
  {
    title: "Le poolish", ic: "droplet", questions: [
      { t: "qcm", q: "Le poolish est un pré-ferment…", c: ["Liquide", "Solide", "Sec", "Gras"], a: 0,
        expl: "Liquide, parce qu'on met autant de farine que d'eau (100 % d'hydratation). C'est ce qui le distingue de la biga, solide à 45 %.", src: "Manuel Niveau II, p. 22" },
      { t: "qcm", q: "En 1ère phase d'un poolish, quelle quantité de farine met-on ?", c: ["Le poids de l'eau (donc autant de farine que d'eau)", "La moitié du poids de l'eau", "Le double du poids de l'eau", "Toute la farine de la recette"], a: 0,
        expl: "Farine = poids de l'eau : c'est la règle du poolish, et c'est elle qui le rend liquide. Attention, on met TOUTE l'eau de la recette en 1ère phase.", src: "Manuel Niveau II, p. 23" },
      { t: "qcm", q: "Quelle part de la levure part en 1ère phase du poolish ?", c: ["2/3 de la levure", "1/3 de la levure", "Toute la levure", "Aucune"], a: 0,
        expl: "2/3 en 1ère phase pour lancer la pré-fermentation, le tiers restant en 2ème phase avec la farine manquante, le sel et l'huile.", src: "Manuel Niveau II, p. 23" },
      { t: "qcm", q: "Combien de temps le poolish repose-t-il à température ambiante ?", c: ["12 à 15 heures maximum", "1 à 2 heures", "24 à 30 heures", "48 heures"], a: 0,
        expl: "12 à 15 h MAXIMUM : au-delà le poolish s'effondre et devient acide. C'est ce qui impose de l'organiser la veille — le manuel le compte parmi ses inconvénients.", src: "Manuel Niveau II, p. 22-23" },
      { t: "vf", q: "Le poolish double voire triple de volume en 1ère phase : attention au débordement du pétrin.", a: true,
        expl: "Vrai, et le manuel le signale explicitement comme un risque. Un pétrin rempli à ras en 1ère phase déborde pendant la nuit.", src: "Manuel Niveau II, p. 22" },
      { t: "vf", q: "Une pâte au poolish se conserve une semaine sans problème.", a: false,
        expl: "Faux : elle doit être utilisée dans les 3 JOURS. Le poolish est aussi très instable en période chaude — c'est le prix de son goût prononcé.", src: "Manuel Niveau II, p. 22" },
    ],
  },
  {
    title: "La biga", ic: "package", questions: [
      { t: "qcm", q: "La biga est un pré-ferment…", c: ["Solide (un « starter »)", "Liquide", "À 100 % d'hydratation", "Sans levure"], a: 0,
        expl: "Solide — le manuel dit « starter ». À 45 % d'hydratation elle ne coule pas : c'est l'opposé du poolish, et ça change tout son comportement.", src: "Manuel Niveau II, p. 25" },
      { t: "qcm", q: "Quelle hydratation pour la 1ère phase d'une biga ?", c: ["45 % du poids de la farine de la 1ère phase", "100 % du poids de la farine", "60 % du poids de la farine", "25 % du poids de la farine"], a: 0,
        expl: "45 % : la table du manuel le montre — biga 20 % pour 10 kg, c'est 2 kg de farine et 0,900 kg d'eau. 0,900 ÷ 2 = 45 %.", src: "Manuel Niveau II, p. 25" },
      { t: "qcm", q: "Quelle dose de levure fraîche en 1ère phase de biga ?", c: ["1 % du poids de la farine de la 1ère phase", "0,1 % du poids de la farine", "5 % du poids de la farine", "2/3 de la levure totale"], a: 0,
        expl: "1 % de la farine de la 1ÈRE PHASE — pas de la farine totale. Pour 2 kg de farine en 1ère phase : 20 g. Le « 2/3 », c'est la règle du poolish, pas celle de la biga.", src: "Manuel Niveau II, p. 25" },
      { t: "qcm", q: "Après 1 à 2 minutes de mélange, à quoi doit ressembler la biga ?", c: ["Une pâte filandreuse, non homogène", "Une pâte lisse et homogène", "Un liquide laiteux", "Une pâte collante et brillante"], a: 0,
        expl: "Filandreuse et grumeleuse, volontairement : on ne cherche PAS à développer le gluten en 1ère phase. Une biga lisse a été trop pétrie.", src: "Manuel Niveau II, p. 25-26" },
      { t: "qcm", q: "Combien de temps la biga repose-t-elle, et à quelle température ?", c: ["16 à 20 h maximum, entre 19 et 24 °C", "12 à 15 h, entre 3 et 4 °C", "2 h à 30 °C", "48 h à température ambiante"], a: 0,
        expl: "16 à 20 h à température ambiante (19-24 °C). Plus long que le poolish parce qu'elle est solide et moins hydratée : la fermentation y est plus lente.", src: "Manuel Niveau II, p. 25-26" },
      { t: "vf", q: "En 2ème phase de biga, on délaye d'abord 1/4 de l'eau manquante dans la biga pour obtenir un liquide laiteux, qu'on laisse reposer 10 minutes.", a: true,
        expl: "Vrai : ce « lait de biga » permet de redissoudre le starter solide avant d'incorporer le reste. Sans cette étape, la biga reste en morceaux dans la pâte.", src: "Manuel Niveau II, p. 26" },
    ],
  },
  {
    title: "Doser sa biga", ic: "list-checks", questions: [
      { t: "qcm", q: "Pour 10 kg de farine, une biga à 20 % demande en 1ère phase :", c: ["2 kg de farine et 0,900 kg d'eau", "2 kg de farine et 2 kg d'eau", "4 kg de farine et 1,800 kg d'eau", "1 kg de farine et 0,450 kg d'eau"], a: 0,
        expl: "20 % de 10 kg = 2 kg de farine, hydratée à 45 % → 0,900 kg d'eau. Le leurre « 2 kg + 2 kg » serait un poolish (100 %), pas une biga.", src: "Manuel Niveau II, p. 25 (table de dosage)" },
      { t: "qcm", q: "Pour 10 kg de farine, une biga à 40 % demande en 1ère phase :", c: ["4 kg de farine et 1,800 kg d'eau", "4 kg de farine et 4 kg d'eau", "2 kg de farine et 0,900 kg d'eau", "3 kg de farine et 1,350 kg d'eau"], a: 0,
        expl: "40 % de 10 kg = 4 kg de farine, toujours à 45 % → 1,800 kg d'eau. Le pourcentage de biga change la QUANTITÉ, jamais l'hydratation du starter.", src: "Manuel Niveau II, p. 25 (table de dosage)" },
      { t: "qcm", q: "La levure sèche instantanée se dose, en 1ère phase, à :", c: ["0,5 % du poids de la farine de la 1ère phase", "1 % du poids de la farine", "2 % du poids de la farine", "La même dose que la fraîche"], a: 0,
        expl: "Moitié moins que la fraîche (1 %), parce qu'elle est bien plus concentrée. Confondre les deux, c'est doubler la levure et emballer la fermentation.", src: "Manuel Niveau II, p. 25" },
      { t: "qcm", q: "À W égal, que devient l'eau totale quand le pourcentage de biga augmente ?", c: ["Elle diminue", "Elle augmente", "Elle ne bouge pas", "Elle double"], a: 0,
        expl: "Elle diminue : à W330, l'eau de 2ème phase passe de 4,800 kg (biga 20 %) à 4,100 kg (biga 40 %). Plus de pâte est déjà hydratée dans le starter.", src: "Manuel Niveau II, p. 25 (table de dosage)" },
      { t: "vf", q: "Une biga à 30 % pour 10 kg de farine utilise 3 kg de farine et 30 g de levure fraîche en 1ère phase.", a: true,
        expl: "Vrai : 30 % de 10 kg = 3 kg de farine, et 1 % de 3 kg = 30 g de levure fraîche. La table du manuel donne exactement ces valeurs.", src: "Manuel Niveau II, p. 25 (table de dosage)" },
      { t: "vf", q: "Plus la farine est forte (W élevé), moins on met d'eau au total.", a: false,
        expl: "C'est l'inverse : une farine forte ABSORBE plus. La table le montre pour une biga 20 % — W330 : 4,800 kg d'eau ; W390 : 5 kg ; W420 : 5,100 kg.", src: "Manuel Niveau II, p. 25 (table de dosage)" },
    ],
  },
  {
    title: "Le protocole", ic: "clock", questions: [
      { t: "qcm", q: "Après un empâtement indirect (biga ou poolish), que fait-on du pointage ?", c: ["Pas de pointage : on boule de suite et on bloque au froid", "Un pointage de 30 minutes", "Un pointage de 2 heures", "Un pointage d'une nuit"], a: 0,
        expl: "Pas de pointage — le manuel l'écrit en toutes lettres. La fermentation a déjà eu lieu dans le pré-ferment : en rajouter une ferait sur-fermenter la pâte.", src: "Manuel Niveau II, p. 23 et 25" },
      { t: "qcm", q: "Combien de temps dure la détente avant de diviser ?", c: ["5 minutes", "30 minutes", "1 heure", "Pas de détente"], a: 0,
        expl: "5 minutes sous film, juste de quoi détendre le gluten après le rabat pour que la masse se laisse étaler sans se rétracter.", src: "Manuel Niveau II, p. 23 et 26" },
      { t: "qcm", q: "À quelle épaisseur étale-t-on la masse avant de diviser ?", c: ["10 cm, en forme rectangulaire", "1 cm, en forme ronde", "30 cm, en boule", "3 cm, en rectangle"], a: 0,
        expl: "Un rectangle de 10 cm : la forme régulière permet de couper des pâtons de poids proche du premier coup, sans réajuster.", src: "Manuel Niveau II, p. 23 et 26" },
      { t: "qcm", q: "À quelle température bloque-t-on les pâtons en bacs ?", c: ["Entre 3 et 4 °C", "Entre 19 et 24 °C", "À −18 °C", "À température ambiante"], a: 0,
        expl: "3 à 4 °C en bacs 60×40 : le froid met la fermentation en pause et te rend maître du moment où tu sors les pâtons. 19-24 °C, c'est le repos du pré-ferment, pas le blocage.", src: "Manuel Niveau II, p. 23 et 26" },
      { t: "qcm", q: "Quand ajoute-t-on le sel et l'huile d'olive ?", c: ["En fin de pétrissage, on laisse tourner 2 à 3 minutes", "Tout au début, avec la farine", "Dans le pré-ferment de 1ère phase", "Après le blocage au froid"], a: 0,
        expl: "En fin de 2ème phase seulement. Mis dans le pré-ferment, le sel bloquerait la fermentation qu'on cherche justement à obtenir pendant la nuit.", src: "Manuel Niveau II, p. 23 et 26" },
      { t: "vf", q: "La 1ère phase de la biga se fait au réfrigérateur, entre 3 et 4 °C.", a: false,
        expl: "Faux : la biga repose à TEMPÉRATURE AMBIANTE, 19 à 24 °C. Les 3-4 °C, c'est le blocage des pâtons tout à la fin — ne confonds pas les deux moments.", src: "Manuel Niveau II, p. 25-26" },
    ],
  },
  {
    title: "Choisir son empâtement", ic: "check-circle", questions: [
      { t: "qcm", q: "Pour une pizza à emporter, quel empâtement est le plus adapté ?", c: ["Le direct ou la biga", "La napolitaine", "Le poolish", "La contemporaine"], a: 0,
        expl: "Le tableau les note tous deux « très adapté » à l'emporter : ils tiennent le transport sans se détremper. Les pâtes très hydratées, elles, ramollissent dans la boîte.", src: "Manuel Niveau II, p. 34 (tableau des différences)" },
      { t: "qcm", q: "Quel empâtement est le moins adapté à l'emporté ?", c: ["La napolitaine", "La biga", "Le direct", "Le poolish"], a: 0,
        expl: "La napolitaine est notée « peu adaptée » : très hydratée et cuite en 90 secondes, elle est faite pour être mangée sur place, tout de suite. Dans un carton, elle se détrempe.", src: "Manuel Niveau II, p. 34 (tableau des différences)" },
      { t: "qcm", q: "Selon le tableau du manuel, quel empâtement est le plus difficile à stocker ?", c: ["Le direct et la contemporaine", "La biga", "Le poolish", "Tous se stockent pareil"], a: 0,
        expl: "Tous deux sont notés « pas adapté » au stockage. Les indirects, eux, se gardent bien : c'est justement ce qui permet de produire la veille.", src: "Manuel Niveau II, p. 34 (tableau des différences)" },
      { t: "qcm", q: "Quel empâtement est le plus facile à étaler ?", c: ["Le direct", "La napolitaine", "Le poolish", "La contemporaine"], a: 0,
        expl: "Le direct, seul noté « très adapté » à l'étalage. Moins hydraté et moins fermenté, il se laisse travailler — c'est pour ça qu'on l'apprend en premier.", src: "Manuel Niveau II, p. 34 (tableau des différences)" },
      { t: "vf", q: "Le direct donne une pâte plus moelleuse que la biga.", a: false,
        expl: "Faux, c'est même l'inverse marqué du tableau : le direct est « peu adapté » au moelleux, la biga « très adaptée ». La longue fermentation fait la mie.", src: "Manuel Niveau II, p. 34 (tableau des différences)" },
      { t: "vf", q: "La biga est très adaptée au stockage comme à la texture moelleuse.", a: true,
        expl: "Vrai, doublement noté « très adapté ». C'est ce qui en fait l'empâtement de la production organisée : on prépare la veille et la pâte est meilleure le lendemain.", src: "Manuel Niveau II, p. 34 (tableau des différences)" },
    ],
  },
];

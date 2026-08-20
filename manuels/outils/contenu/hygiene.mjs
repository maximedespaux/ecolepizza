/**
 * MODULE HYGIÈNE ALIMENTAIRE — écrit de zéro, aucun manuel n'existait.
 *
 * D'OÙ VIENT LE PLAN
 * Des objectifs pédagogiques que l'école publie déjà sur son propre programme
 * « NIVEAU I — Pizza classique & hygiène alimentaire », qui reprennent les
 * trois blocs du référentiel de la formation obligatoire en hygiène :
 *   1. Aliments et risques pour le consommateur
 *   2. Les fondamentaux de la réglementation communautaire et nationale
 *   3. Le plan de maîtrise sanitaire
 *
 * LES RÉFÉRENCES RÉGLEMENTAIRES SONT CITÉES, PAS PARAPHRASÉES. Chaque valeur
 * qui dépend de l'établissement (et non de la loi) porte un « à vérifier » :
 * un manuel de formation ne peut pas décider à la place du PMS d'une pizzeria.
 *
 * Ce module NE remplace PAS l'attestation de formation spécifique en hygiène
 * alimentaire : il l'accompagne. Voir l'encadré en fin de chapitre 1.
 */
import { chapitre, cote, photo, duo, enc, tbl, averif, reperes, proto, bilan , retenir } from "../gabarit.mjs";
import * as SC from "../schemas.mjs";

/* ===========================================================================
   1 · ALIMENTS ET RISQUES POUR LE CONSOMMATEUR
   =========================================================================== */
export const risques = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Aliments et risques pour le consommateur",
  "Quatre familles de dangers. Trois se voient rarement, et c'est précisément pour cela qu'on les écrit.")}
${tbl(["Famille de danger", "Ce que c'est", "Exemple en pizzeria"], [
    [["<strong>Microbiologique</strong>", ""], "Bactéries, virus, parasites, moisissures.", "<em>Salmonella</em> sur une charcuterie mal conservée&nbsp;; <em>Listeria</em> sur un produit prêt à consommer."],
    [["<strong>Chimique</strong>", ""], "Produits de nettoyage, résidus, migration de matériaux.", "Bidon de dégraissant stocké au-dessus d'un bac de mise en place."],
    [["<strong>Physique</strong>", ""], "Corps étrangers.", "Éclat de verre, morceau de plastique de film étirable, bijou."],
    [["<strong>Allergénique</strong>", ""], "Les 14 allergènes à déclaration obligatoire.", "Farine de blé, lait de la mozzarella, céleri de la sauce tomate."],
  ], { titre: "Les quatre dangers" })}
        <h3 class="sec">Le danger microbien</h3>
        <p>Une bactérie a besoin de peu de choses pour se multiplier&nbsp;: de la
        <strong>chaleur</strong>, de l'<strong>eau</strong>, des <strong>nutriments</strong> et du
        <strong>temps</strong>. En retirer un seul suffit à la freiner — c'est tout le principe de la
        chaîne du froid et de la cuisson.</p>
${SC.zoneDanger()}
${enc("alerte", "La zone dangereuse", `<p>Entre <strong>+10 et +63&nbsp;°C</strong>, une population
        bactérienne peut doubler toutes les vingt minutes. Un bac de garniture laissé deux heures
        sur le plan de travail en plein service ne « se réchauffe » pas&nbsp;: il se
        <strong>multiplie</strong>. C'est le point où se joue l'essentiel de la sécurité en
        pizzeria.</p>`)}
`, { chap: "Aliments et risques pour le consommateur", num: n });

  m.p(`
        <h3 class="sec">Les trois modes de contamination</h3>
${tbl(["Mode", "Comment ça arrive", "Comment on l'évite"], [
    [["Contamination initiale", "fort"], "Le danger est déjà dans la matière première à la réception.", "Contrôle à réception, choix des fournisseurs, étiquetage, DLC."],
    [["Contamination croisée", "fort"], "Le danger passe d'un produit, d'une surface ou d'une main à un autre produit.", "Séparer le cru et le prêt-à-consommer&nbsp;; laver les mains&nbsp;; planches et couteaux dédiés."],
    [["Multiplication", "fort"], "Le danger était présent en quantité négligeable et s'est développé.", "Chaîne du froid, refroidissement rapide, respect des durées de vie."],
  ], { compact: true })}
        <h3 class="sec">Ce que le pizzaïolo maîtrise vraiment</h3>
        <p>Les cinq leviers de la méthode des <strong>5 M</strong> — la grille la plus simple pour
        chercher l'origine d'un problème sanitaire.</p>
${tbl(["Le M", "Ce qu'il recouvre", "Au poste"], [
    [["<strong>Main-d'œuvre</strong>", ""], "Les personnes.", "Lavage des mains, tenue, état de santé, formation."],
    [["<strong>Matière</strong>", ""], "Les denrées.", "Réception, étiquetage, DLC/DLUO, stockage, allergènes."],
    [["<strong>Matériel</strong>", ""], "Les équipements.", "Nettoyage, désinfection, entretien, étalonnage des thermomètres."],
    [["<strong>Milieu</strong>", ""], "Les locaux.", "Marche en avant, séparation propre/sale, températures, nuisibles."],
    [["<strong>Méthode</strong>", ""], "Les façons de faire.", "Protocoles écrits, autocontrôles, traçabilité."],
  ], { compact: true })}
${enc("note", "Un danger n'est pas un risque", `<p>Le <strong>danger</strong> est ce qui peut nuire
        (une bactérie). Le <strong>risque</strong> est la probabilité que cela arrive, croisée avec
        la gravité. La démarche HACCP ne supprime pas les dangers — elle ramène les risques à un
        niveau acceptable, et le prouve par écrit.</p>`)}
${enc("alerte", "Ce module ne vaut pas l'attestation", `<p>La formation spécifique en hygiène
        alimentaire adaptée à l'activité des établissements de restauration commerciale fait l'objet
        d'une <strong>attestation distincte</strong>, délivrée à l'issue du module et conforme à la
        réglementation en vigueur. Ce manuel en est le support&nbsp;; il ne s'y substitue pas.</p>`)}
${retenir([
  "Quatre dangers&nbsp;: <strong>microbiologique, chimique, physique, allergénique</strong>. Trois se voient rarement.",
  "Entre <strong>+10 et +63&nbsp;°C</strong>, une population bactérienne peut doubler toutes les vingt minutes.",
  "Un <strong>danger</strong> n'est pas un <strong>risque</strong>&nbsp;: l'HACCP ne supprime pas les dangers, il ramène les risques à un niveau acceptable — et le prouve par écrit.",
])}
`);
  return m;
};

/* ===========================================================================
   2 · LA RÉGLEMENTATION
   =========================================================================== */
export const reglementation = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Les fondamentaux de la réglementation",
  "Le « paquet hygiène » européen, et ce qu'il impose concrètement à une pizzeria.")}
${tbl(["Texte", "Ce qu'il pose"], [
    [["Règlement (CE) n° <strong>178/2002</strong>", ""], "Principes généraux de la législation alimentaire. Institue la <strong>traçabilité</strong> et l'obligation de <strong>retrait / rappel</strong> d'un produit dangereux."],
    [["Règlement (CE) n° <strong>852/2004</strong>", ""], "Hygiène des denrées alimentaires. Impose la <strong>démarche HACCP</strong> et les <strong>bonnes pratiques d'hygiène</strong> à tout exploitant du secteur alimentaire."],
    [["Règlement (CE) n° <strong>853/2004</strong>", ""], "Règles spécifiques aux denrées d'<strong>origine animale</strong> (viandes, produits laitiers, produits de la pêche)."],
    [["Règlement (UE) n° <strong>1169/2011</strong>", ""], "Information du consommateur&nbsp;: c'est lui qui rend obligatoire l'<strong>information sur les allergènes</strong>."],
    [["Arrêté du <strong>5 octobre 2011</strong>", ""], "Fixe le contenu et la durée de la <strong>formation spécifique en hygiène alimentaire</strong> exigée en restauration commerciale."],
  ], { titre: "Les textes à connaître" })}
${enc("verif", "Le texte national sur le commerce de détail", `<p>Les règles sanitaires applicables
        aux activités de commerce de détail, d'entreposage et de transport sont fixées par arrêté
        ministériel, plusieurs fois modifié depuis 2009. <strong>Vérifier la version en vigueur</strong>
        avant chaque session&nbsp;: c'est le texte qui change le plus souvent de tout ce tableau.
        ${averif("référence à actualiser à chaque mise à jour")}</p>`)}
        <h3 class="sec">Déclaration, agrément, dérogation</h3>
${tbl(["Situation", "Formalité"], [
    [["Restauration commerciale classique", "fort"], "<strong>Déclaration</strong> d'activité auprès de la préfecture (DDPP / DDETSPP)."],
    [["Manipulation de denrées d'origine animale remises à un intermédiaire", "fort"], "<strong>Agrément sanitaire</strong>, ou <strong>dérogation à l'obligation d'agrément</strong> en dessous de certains seuils."],
    [["Vente directe au consommateur final", "fort"], "Déclaration suffisante dans le cas général."],
  ], { compact: true })}
${enc("verif", "Les seuils de dérogation", `<p>Ils dépendent des quantités cédées et de la distance
        de livraison, et sont révisés régulièrement. À confirmer auprès de la DDPP pour toute
        activité qui livre des professionnels. ${averif("seuils à confirmer")}</p>`)}
`, { chap: "Les fondamentaux de la réglementation", num: n });

  m.p(`
        <h3 class="sec">La traçabilité</h3>
        <p>Le principe posé par le règlement 178/2002 tient en une phrase&nbsp;: pouvoir dire
        <strong>d'où vient</strong> chaque denrée et <strong>où elle est allée</strong>. En
        pizzeria, cela se traduit par&nbsp;:</p>
        <ul class="liste">
          <li>Conserver les <strong>bons de livraison</strong> et les <strong>factures</strong></li>
          <li>Garder les <strong>étiquettes</strong> des produits utilisés — au minimum le numéro de
          lot et la DLC — pendant toute la durée de vie du produit fini</li>
          <li>Étiqueter les <strong>préparations maison</strong> (sauce tomate, viandes cuites) avec
          la date de fabrication et la date limite d'utilisation</li>
          <li>Savoir <strong>retirer</strong> un lot en cas d'alerte, et le <strong>signaler</strong>
          à l'autorité compétente</li>
        </ul>
${enc("conseil", "L'étiquette maison, en trois lignes", `<p><strong>Ce que c'est · fabriqué
        le · à consommer avant le.</strong> Trois lignes au marqueur sur du ruban adhésif blanc, sur
        chaque bac de mise en place. C'est le geste le plus rentable de tout ce chapitre&nbsp;: il
        prend cinq secondes et il est la première chose qu'un contrôleur regarde.</p>`)}
        <h3 class="sec">Les contrôles officiels</h3>
${tbl(["Ce qui est regardé", "Ce qu'il faut pouvoir montrer"], [
    [["Les locaux et le matériel", "fort"], "Propreté, état, séparation propre/sale, marche en avant."],
    [["La chaîne du froid", "fort"], "Relevés de température, thermomètres en état, enceintes à la bonne température."],
    [["Les denrées", "fort"], "Étiquetage, DLC, absence de produits déconditionnés non identifiés."],
    [["Le personnel", "fort"], "Tenue, lavage des mains, <strong>attestations de formation</strong>."],
    [["Les documents", "fort"], "Le <strong>plan de maîtrise sanitaire</strong> et ses enregistrements."],
  ], { compact: true })}
${enc("alerte", "Ce qui n'est pas écrit n'existe pas", `<p>Un établissement peut travailler
        parfaitement et être sanctionné&nbsp;: à l'inspection, c'est la <strong>preuve</strong> qui
        est demandée, pas la parole. Les relevés, les plans de nettoyage signés et les étiquettes
        conservées sont ce qui transforme une bonne pratique en conformité.</p>`)}
${retenir([
  "Le règlement <strong>852/2004</strong> impose la démarche HACCP à tout exploitant&nbsp;; le <strong>178/2002</strong> impose la traçabilité.",
  "<strong>Ce qui n'est pas écrit n'existe pas</strong>&nbsp;: à l'inspection, c'est la preuve qui est demandée, pas la parole.",
])}
`);
  return m;
};

/* ===========================================================================
   3 · LE PLAN DE MAÎTRISE SANITAIRE
   =========================================================================== */
export const pms = (m) => {
  const n = m.chapSuivant();
  m.p(`
${chapitre(n, "Le plan de maîtrise sanitaire",
  "Le PMS, c'est le classeur qui décrit ce que vous faites pour que ce que vous vendez soit sûr. Trois volets.")}
${tbl(["Volet", "Contenu"], [
    [["1. Les <strong>bonnes pratiques d'hygiène</strong> (BPH)", ""], "Hygiène du personnel, plan de nettoyage-désinfection, maîtrise des températures, approvisionnement en eau, lutte contre les nuisibles, gestion des déchets, maintenance."],
    [["2. Le plan <strong>HACCP</strong>", ""], "L'analyse des dangers propre à l'établissement, les points critiques identifiés, les limites fixées, la surveillance et les corrections."],
    [["3. La <strong>traçabilité</strong> et la gestion des <strong>non-conformités</strong>", ""], "Comment on retrouve un lot, et ce qu'on fait quand une limite est dépassée."],
  ], { titre: "Les trois volets du PMS" })}
${enc("note", "Le guide de bonnes pratiques", `<p>Un <strong>GBPH</strong> — guide de bonnes
        pratiques d'hygiène — validé pour le secteur de la restauration peut servir de base au PMS.
        Il ne dispense pas de l'adapter à l'établissement&nbsp;: un PMS recopié tel quel ne décrit
        pas votre cuisine, et ne protège personne.</p>`)}
        <h3 class="sec">Les sept principes de l'HACCP</h3>
        <div class="proto">
          <div class="phase" data-n="1"><div class="phase-t">Analyser les dangers</div>
            <p>Lister, à chaque étape, ce qui peut mal tourner — et pourquoi.</p></div>
          <div class="phase" data-n="2"><div class="phase-t">Déterminer les points critiques (CCP)</div>
            <p>Les étapes où un contrôle est <strong>indispensable</strong> pour éliminer le danger
            ou le ramener à un niveau acceptable.</p></div>
          <div class="phase" data-n="3"><div class="phase-t">Fixer les limites critiques</div>
            <p>Une valeur mesurable&nbsp;: une température, une durée, un pH.</p></div>
          <div class="phase" data-n="4"><div class="phase-t">Surveiller</div>
            <p>Décider qui mesure, avec quoi, à quelle fréquence, et où c'est noté.</p></div>
          <div class="phase" data-n="5"><div class="phase-t">Corriger</div>
            <p>Prévoir à l'avance ce qu'on fait quand la limite est dépassée.</p></div>
          <div class="phase" data-n="6"><div class="phase-t">Vérifier</div>
            <p>S'assurer que le système fonctionne&nbsp;: relectures, analyses, audits.</p></div>
          <div class="phase" data-n="7"><div class="phase-t">Documenter</div>
            <p>Tenir les enregistrements. Sans eux, rien de ce qui précède n'est démontrable.</p></div>
        </div>
`, { chap: "Le plan de maîtrise sanitaire", num: n });

  m.p(`
        <h3 class="sec">Les températures réglementaires</h3>
${tbl(["Étape", ["Température", "c"], "Remarque"], [
    [["Congélation", "fort"], ["<span class='val'>max. <span class='gly'>−</span>18 °C</span>", "c"], "Au cœur du produit."],
    [["Froid positif — denrées très périssables", "fort"], ["<span class='val'>0 à +4 °C</span>", "c"], "Sauf indication plus stricte du fabricant, <strong>qui prime toujours</strong>."],
    [["Liaison chaude", "fort"], ["<span class='val'>min. +63 °C</span>", "c"], "Maintien au chaud avant service."],
    [["Refroidissement rapide", "fort"], ["<span class='val'>+63 » +10 °C<br>en moins de 2 h</span>", "c"], "C'est le rôle de la cellule&nbsp;: un bac laissé refroidir à l'air ne tient pas ce délai."],
    [["Remise en température", "fort"], ["<span class='val'>min. +63 °C<br>en moins d'1 h</span>", "c"], "—"],
  ], { titre: "Les repères à retenir" })}
${enc("verif", "L'étiquette du fabricant prime", `<p>Quand un produit porte « à conserver entre
        +2 et +4&nbsp;°C », c'est cette valeur qui s'applique, pas le repère général. Les
        températures de votre PMS doivent être celles de <strong>vos</strong> produits et de
        <strong>vos</strong> enceintes. ${averif("à adapter établissement par établissement")}</p>`)}
        <h3 class="sec">Le plan de nettoyage-désinfection</h3>
        <p>Un plan de nettoyage répond à cinq questions, pour chaque zone et chaque
        équipement&nbsp;: <strong>quoi</strong>, <strong>quand</strong>, <strong>avec quoi</strong>,
        <strong>comment</strong>, <strong>qui</strong>.</p>
${tbl(["Zone / équipement", ["Fréquence", "c"], "Produit", "Méthode"], [
    [["Plan de travail, marbre", "fort"], ["Après chaque service", "c"], "Détergent-désinfectant agréé contact alimentaire", "Nettoyer, rincer, désinfecter, laisser agir le temps indiqué, rincer"],
    [["Pétrin — cuve et spirale", "fort"], ["Après chaque empâtement", "c"], "Détergent alimentaire", "Démonter ce qui se démonte&nbsp;; la pâte séchée protège les bactéries"],
    [["Trancheur", "fort"], ["Après chaque utilisation", "c"], "Détergent-désinfectant", "Démontage complet, lame comprise"],
    [["Chambre froide, tour réfrigéré", "fort"], ["Hebdomadaire", "c"], "Détergent-désinfectant", "Vider, nettoyer, contrôler les joints"],
    [["Sole du four", "fort"], ["Quotidienne", "c"], "<strong>Brosse sèche uniquement</strong>", "Jamais d'eau ni de détergent sur une sole réfractaire"],
    [["Sols et siphons", "fort"], ["Quotidienne", "c"], "Détergent-désinfectant", "Du plus propre vers le plus sale"],
  ], { compact: true })}
${enc("verif", "Ce tableau est un modèle, pas votre plan", `<p>Les fréquences et les produits
        dépendent de vos équipements, de votre volume et des fiches techniques de vos fournisseurs
        de produits d'entretien. ${averif("à personnaliser")}</p>`)}
`);

  m.p(`
        <h3 class="sec">L'hygiène du personnel</h3>
${cote(`
          <h4 class="sous">Le lavage des mains est obligatoire</h4>
          <ul class="liste">
            <li>À la <strong>prise de poste</strong></li>
            <li>Après une <strong>opération contaminante</strong> — poubelle, cartons, coquilles</li>
            <li>Après avoir <strong>fumé, mangé ou s'être mouché</strong></li>
            <li>Après les opérations de <strong>nettoyage et de désinfection</strong></li>
            <li>Après être allé aux <strong>toilettes</strong></li>
            <li>Avant de manipuler des <strong>produits sensibles</strong></li>
          </ul>`,
  "hygiene-salle", "Formation en salle, tenue et charlotte")}
${enc("alerte", "Les mains sont le premier vecteur", `<p>Devant les surfaces, devant le matériel,
        devant l'air. Un lave-mains à commande non manuelle, avec savon et essuie-mains à usage
        unique, n'est pas un confort&nbsp;: c'est une obligation.</p>`)}
        <h3 class="sec">Santé et tenue</h3>
        <ul class="liste">
          <li>Toute <strong>plaie</strong> doit être protégée par un pansement étanche et coloré,
          recouvert d'un gant si elle est aux mains</li>
          <li>Une personne atteinte de <strong>troubles digestifs</strong> ne manipule pas de
          denrées</li>
          <li>Tenue propre, changée quotidiennement&nbsp;; <strong>cheveux couverts</strong>&nbsp;;
          <strong>pas de bijou</strong> hors alliance&nbsp;; ongles courts, sans vernis ni faux
          ongles</li>
        </ul>
        <h3 class="sec">La marche en avant</h3>
${SC.marcheEnAvant()}
${enc("conseil", "En pizzeria, le point sensible est le poste de garnissage", `<p>C'est là que se
        croisent des produits crus (viandes, œufs) et des produits prêts à consommer (jambon sec,
        mozzarella, basilic), sur le même plan, avec les mêmes mains. Séparer ces deux familles dans
        le tour réfrigéré et se laver les mains entre les deux règle l'essentiel du risque de
        contamination croisée.</p>`)}
`);

  m.p(`
        <h3 class="sec">Les autocontrôles — ce que l'on note, et où</h3>
${tbl(["Enregistrement", ["Fréquence", "c"], "Ce qu'on y porte"], [
    [["Contrôle à réception", "fort"], ["Chaque livraison", "c"], "Fournisseur, produit, température relevée, état de l'emballage, DLC, acceptation ou refus."],
    [["Températures des enceintes", "fort"], ["1 à 2 fois par jour", "c"], "Enceinte, température lue, heure, initiales."],
    [["Huiles de friture", "fort"], ["Selon usage", "c"], "Sans objet en pizzeria, sauf activité de friture."],
    [["Nettoyage-désinfection", "fort"], ["Selon le plan", "c"], "Zone, date, produit, opérateur."],
    [["Traçabilité des lots", "fort"], ["En continu", "c"], "Étiquettes conservées, préparations maison datées."],
    [["Non-conformités", "fort"], ["À chaque écart", "c"], "Ce qui s'est passé, ce qui a été fait, ce qui a été décidé pour que cela ne se reproduise pas."],
  ], { compact: true })}
${enc("conseil", "Le registre des non-conformités n'est pas un aveu", `<p>Beaucoup d'exploitants
        n'osent pas y écrire, de peur que cela se retourne contre eux. C'est l'inverse&nbsp;: un
        registre vide signale un système qui ne détecte rien. Un registre où l'on voit un écart
        constaté, une correction appliquée et une mesure prise démontre exactement ce que
        l'inspection cherche — <strong>un exploitant qui maîtrise</strong>.</p>`)}
        <h3 class="sec">Le PMS d'une pizzeria, en une page</h3>
${proto([
  { n: 1, titre: "Réception", corps: "<p>Contrôler la température, l'état, la DLC. Refuser ce qui n'est pas conforme et le noter.</p>" },
  { n: 2, titre: "Stockage", corps: "<p>Ranger immédiatement, respecter le <strong>PEPS</strong> — premier entré, premier sorti. Protéger, étiqueter, séparer le cru du prêt-à-consommer.</p>" },
  { n: 3, titre: "Mise en place", corps: "<p>Sortir la quantité nécessaire, dater les préparations, remettre au froid sans attendre.</p>" },
  { n: 4, titre: "Service", corps: "<p>Bacs de garniture au froid, réapprovisionnés par petites quantités. Mains lavées entre le cru et le prêt-à-consommer.</p>" },
  { n: 5, titre: "Fin de service", corps: "<p>Refroidissement rapide de ce qui doit l'être, nettoyage selon le plan, relevés notés.</p>" },
])}
${retenir([
  "Trois volets&nbsp;: les <strong>bonnes pratiques d'hygiène</strong>, le <strong>plan HACCP</strong>, la <strong>traçabilité</strong> et les non-conformités.",
  "Un PMS recopié d'un guide ne décrit pas votre cuisine, et ne protège personne.",
  "Un <strong>registre de non-conformités vide</strong> signale un système qui ne détecte rien — pas un établissement irréprochable.",
])}
`);
  return m;
};

#!/usr/bin/env node
/**
 * Construit les neuf manuels de l'École Pizza.
 *
 *     node manuels/outils/construire.mjs
 *
 * Écrit un fichier .html par parcours à la racine de `manuels/`, plus la page
 * d'accueil `index.html`. Aucune dépendance : Node seul suffit.
 *
 * Les fichiers produits SONT versionnés. Ce script sert à les régénérer quand
 * le contenu change — personne n'a besoin de Node pour lire ou imprimer un
 * manuel, seulement pour le refaire.
 *
 * C'est ici, et nulle part ailleurs, qu'on lit CE QUE CONTIENT chaque manuel :
 * une suite d'appels, un par chapitre. Ajouter un chapitre à un parcours, c'est
 * ajouter une ligne.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { manuel, ECOLE } from "./gabarit.mjs";
import * as C from "./contenu/commun.mjs";
import * as MP from "./contenu/socle-matieres.mjs";
import * as ME from "./contenu/socle-metier.mjs";
import * as IN from "./contenu/indirects.mjs";
import * as TP from "./contenu/teglia.mjs";
import * as NA from "./contenu/napolitaine.mjs";
import * as HY from "./contenu/hygiene.mjs";
import * as LI from "./contenu/livret.mjs";
import * as PR from "./contenu/programmes.mjs";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ===========================================================================
   BLOCS RÉUTILISABLES
   Un « bloc » est une suite de chapitres qui va toujours ensemble. Composer
   des blocs plutôt que des chapitres évite d'en oublier une pièce.
   =========================================================================== */

/** Ouverture commune à tous les documents. */
const ouverture = (m) => { C.preface(m); C.tenue(m); C.schema(m); return m; };

/** Le tronc théorique complet — de la céréale à l'unité de calcul. */
const theorieComplete = (m) => {
  MP.cereales(m); MP.caryopse(m); MP.gluten(m); MP.moutures(m);
  MP.farineFabrication(m); MP.farineTypes(m); MP.farineQualite(m); MP.farineW(m);
  MP.levure(m); MP.eau(m); MP.temperature(m); MP.sel(m); MP.huile(m); MP.unites(m);
  return m;
};

/**
 * Le tronc théorique réduit des manuels de spécialité. Les manuels d'origine
 * du Niveau II, de l'Expert et de l'In Teglia reprennent exactement ces
 * chapitres-là : ce sont des rappels pour des stagiaires qui ont déjà fait le
 * Niveau I, pas un second cours.
 */
const theorieRappel = (m) => {
  MP.farineTypes(m, { autonome: true });
  MP.farineW(m, { autonome: true });
  MP.levure(m); MP.eau(m); MP.sel(m); MP.huile(m);
  ME.substitutions(m); ME.adjonctions(m);
  return m;
};

/** Fermeture commune : lexique, équipe, sommaire, dos. */
const fermeture = (m, mots) => { C.lexique(m, mots); C.equipe(m); m.sommaire(); m.dos(); return m; };

/** Les termes du lexique employés par les manuels indirects et de spécialité. */
const LEX_INDIRECTS = [
  "autolyse", "bassinage", "biga", "poolish", "starter", "maturation", "levain", "rafraichir",
  "gluten", "reseau", "maille", "force", "w", "alveographe", "type", "farine", "panifiable",
  "levure", "saccharomyce", "fermentation", "aerobie", "anaerobie", "hydratation", "sel",
  "pointage", "detente", "rabat", "faconnage", "boulage", "paton", "petrin", "petrissage",
  "frasage", "corniche", "sole", "voute", "conduction", "convection", "rayonnement",
  "indirect", "contemporaine", "lemady", "malt", "protocole", "bac", "fleurage", "abaisser",
];
const LEX_TEGLIA = [...LEX_INDIRECTS, "teglia", "pala", "laminoir", "corne", "coupepate"];
const LEX_NAPO = [
  "napolitaine", "cornicione", "leopardatura", "avpn", "stg", "gluten", "reseau", "force", "w",
  "alveographe", "type", "farine", "panifiable", "levure", "saccharomyce", "fermentation",
  "hydratation", "sel", "pointage", "detente", "faconnage", "boulage", "paton", "petrin",
  "petrissage", "abaisser", "corniche", "sole", "voute", "conduction", "convection",
  "rayonnement", "fleurage", "maturation", "protocole", "bac",
];

/* ===========================================================================
   1 · LES QUATRE MANUELS ISSUS DU SOCLE
   =========================================================================== */

/** Niveau I, RS 7404 : le contenu de référence, inchangé. */
function socleComplet(d) {
  const m = manuel(d);
  m.couverture();
  ouverture(m);
  MP.histoire(m);
  theorieComplete(m);
  ME.direct(m); ME.autolyse(m); ME.adjonctions(m); ME.semiDirect(m); ME.substitutions(m);
  ME.allergenes(m); ME.matieres(m); ME.quantites(m); ME.fiches(m); ME.conseils(m);
  ME.materiel(m); ME.organisation(m); ME.cuisson(m); ME.fours(m); ME.petrins(m);
  return fermeture(m, C.LEX_SOCLE);
}

const documents = [];

documents.push(socleComplet({
  id: "niveau-1", parcours: "niveau1", genre: "Formation",
  titre: "Niveau I | Pizza classique",
  duree: "5 jours · 35 h",
  objectif: "Réaliser des pizzas classiques, de l'élaboration de l'empâtement direct jusqu'à la sortie du four.",
  image: "couv-niveau1",
}));

documents.push(socleComplet({
  id: "rs-pizzas-artisanales", parcours: "rs", genre: "Parcours certifiant",
  titre: "Fabriquer des | pizzas artisanales",
  mention: "RS 7404",
  duree: "5 jours · 35 h",
  objectif: "Fabriquer des pizzas artisanales, de l'élaboration de l'empâtement direct ou semi-direct jusqu'à la présentation du produit fini.",
  image: "couv-rs",
}));

/* --- Niveau I option hygiène : le socle + le module hygiène --------------- */
{
  const m = manuel({
    id: "niveau-1-hygiene", parcours: "hygiene", genre: "Formation",
    titre: "Niveau I | option hygiène",
    mention: "Hygiène alimentaire en restauration commerciale",
    duree: "5 jours · 44 h",
    objectif: "Réaliser des pizzas classiques, de l'élaboration de l'empâtement direct jusqu'à la sortie du four, en appliquant les gestes et la réglementation d'hygiène adaptés à la restauration commerciale.",
    image: "couv-hygiene",
  });
  m.couverture();
  ouverture(m);
  MP.histoire(m);
  theorieComplete(m);
  ME.direct(m); ME.autolyse(m); ME.adjonctions(m); ME.semiDirect(m); ME.substitutions(m);
  ME.allergenes(m); ME.matieres(m); ME.quantites(m); ME.fiches(m); ME.conseils(m);
  ME.materiel(m); ME.organisation(m); ME.cuisson(m); ME.fours(m); ME.petrins(m);
  m.intercalaire({
    partie: "Seconde partie",
    titre: "Hygiène alimentaire",
    texte: "Aliments et risques pour le consommateur · les fondamentaux de la réglementation communautaire et nationale · le plan de maîtrise sanitaire.",
    image: "hygiene-salle",
  });
  HY.risques(m); HY.reglementation(m); HY.pms(m);
  fermeture(m, [...C.LEX_SOCLE, "pms", "bph", "haccp", "ccp", "tracabilite"]);
  documents.push(m);
}

/* --- Niveau I Pro : la référence compactée sur deux jours ----------------- */
{
  const m = manuel({
    id: "niveau-1-pro", parcours: "pro", genre: "Formation",
    titre: "Niveau I Pro | Pizza classique",
    mention: "Professionnels des métiers de bouche",
    duree: "2 jours · 15 h",
    objectif: "Mettre en pratique le protocole de l'empâtement direct ainsi que l'étalage à la main.",
    image: "couv-pro",
  });
  m.couverture();
  ouverture(m);
  /* LE SOMMAIRE DU MANUEL PRO D'ORIGINE, À L'IDENTIQUE.
     La première version coupait l'histoire de la pizza, les céréales, le
     caryopse, les moutures et le chapitre du sac de farine, au motif qu'un
     professionnel des métiers de bouche les connaît. C'était un choix de trop :
     le manuel Pro EXISTE et il contient ces chapitres. Ce qu'il ne contient pas
     — autolyse, semi-direct, allergènes, matières premières, quantités, fiches,
     conseils du cuisinier, matériel, organisation, cuisson, fours, pétrins —
     reste dehors. C'est bien un manuel de deux jours, mais c'est SON découpage,
     pas le nôtre. */
  MP.histoire(m);
  MP.cereales(m); MP.caryopse(m); MP.gluten(m); MP.moutures(m);
  MP.farineFabrication(m); MP.farineTypes(m); MP.farineQualite(m); MP.farineW(m);
  MP.levure(m); MP.eau(m); MP.temperature(m); MP.sel(m); MP.huile(m);
  ME.substitutions(m); ME.adjonctions(m);
  MP.unites(m);
  ME.direct(m);
  fermeture(m, C.LEX_SOCLE);
  documents.push(m);
}

/* ===========================================================================
   2 · NIVEAU II — LES EMPÂTEMENTS INDIRECTS
   =========================================================================== */
{
  const m = manuel({
    id: "niveau-2", parcours: "niveau2", genre: "Formation",
    titre: "Niveau II | Empâtements indirects",
    mention: "Prérequis : Niveau I ou Niveau I Pro",
    duree: "3 jours · 21 h",
    objectif: "Réaliser des empâtements indirects — Poolish, Biga, Contemporaine.",
    image: "couv-niveau2",
  });
  m.couverture();
  ouverture(m);
  theorieRappel(m);
  MP.unites(m);
  IN.poolishEtBiga(m); IN.poolish(m); IN.biga(m); IN.contemporaine(m);
  IN.differences(m); IN.quiz(m);
  fermeture(m, LEX_INDIRECTS);
  documents.push(m);
}

/* ===========================================================================
   3 · NIVEAU EXPERT — REFAIT
   --------------------------------------------------------------------------
   Le manuel d'origine juxtaposait deux parties sans les articuler, et
   RÉPÉTAIT en seconde partie des chapitres déjà donnés en première (la levure
   et le sel y figuraient deux fois, avec des valeurs différentes : 2-4 g/kg
   puis 4 g/kg, 17-22 g/kg puis 25-30 g/kg). Ce n'était pas une erreur : les
   dosages CHANGENT effectivement entre un empâtement classique et un
   empâtement à 80 % d'hydratation. Mais rien ne le disait, et deux tableaux
   contradictoires à trente pages d'écart laissent le stagiaire choisir au
   hasard.
   Ici les rappels sont donnés UNE fois, en ouverture, et un chapitre explique
   explicitement pourquoi les dosages montent sur les fortes hydratations.
   =========================================================================== */
{
  const m = manuel({
    id: "expert", parcours: "expert", genre: "Formation",
    titre: "Niveau Expert | Spécialités italiennes",
    mention: "Prérequis : Niveau I ou Niveau I Pro",
    duree: "4 jours",
    objectif: "Réaliser les empâtements indirects Poolish, Biga, Contemporaine, In Teglia et In Pala, ainsi qu'un empâtement direct In Teglia et In Pala.",
    image: "couv-expert",
  });
  m.couverture();
  ouverture(m);
  theorieRappel(m);

  m.intercalaire({
    partie: "Première partie",
    titre: "Poolish &amp; Biga",
    texte: "Les deux pré-ferments, la pizza contemporaine, et ce qui les sépare de l'empâtement direct.",
    image: "biga-main",
  });
  MP.unites(m);
  IN.poolishEtBiga(m); IN.poolish(m); IN.biga(m); IN.contemporaine(m); IN.differences(m);

  m.intercalaire({
    partie: "Seconde partie",
    titre: "In Teglia &amp; In Pala",
    texte: "Renforcer vos compétences en pratiquant les empâtements à forte hydratation, sur plaque et sur pelle.",
    image: "four-electrique",
  });
  TP.dosagesFortesHydratations(m);
  TP.unitesTeglia(m);
  TP.inTeglia(m); TP.inPala(m);
  ME.cuisson(m, { avecPlaque: true });
  fermeture(m, LEX_TEGLIA);
  documents.push(m);
}

/* ===========================================================================
   4 · SPÉCIALISATION IN TEGLIA & IN PALA
   =========================================================================== */
{
  const m = manuel({
    id: "teglia-pala", parcours: "teglia", genre: "Spécialisation",
    titre: "In Teglia | &amp; In Pala",
    mention: "Prérequis : Niveau I ou Niveau I Pro",
    duree: "2 jours · 14 h",
    objectif: "Réaliser une pizza In Teglia et In Pala, spécialités italiennes destinées à être vendues à la part.",
    image: "couv-teglia",
  });
  m.couverture();
  ouverture(m);
  theorieRappel(m);
  ME.petrins(m);
  ME.cuisson(m, { avecPlaque: true });
  TP.dosagesFortesHydratations(m);
  TP.unitesTeglia(m);
  TP.inTeglia(m); TP.inPala(m);
  fermeture(m, LEX_TEGLIA);
  documents.push(m);
}

/* ===========================================================================
   5 · SPÉCIALISATION NAPOLITAINE — CRÉÉE
   =========================================================================== */
{
  const m = manuel({
    id: "napolitaine", parcours: "napolitaine", genre: "Spécialisation",
    titre: "Pizza | napolitaine",
    mention: "Verace Pizza Napoletana · STG UE 97/2010",
    duree: "5 jours · 35 h",
    objectif: "Réaliser des pizzas napolitaines, de l'élaboration de l'empâtement jusqu'à la sortie du four, conformément aux cahiers des charges STG et AVPN.",
    image: "couv-napolitaine",
  });
  m.couverture();
  ouverture(m);
  NA.histoireNapo(m);
  NA.cahiers(m);
  MP.farineTypes(m, { autonome: true });
  MP.farineW(m, { autonome: true });
  MP.levure(m); MP.eau(m); MP.sel(m);
  NA.uniteNapo(m);
  NA.protoStg(m); NA.protoAvpn(m);
  NA.etalage(m);
  NA.recettes(m);
  NA.cuissonNapo(m);
  fermeture(m, LEX_NAPO);
  documents.push(m);
}

/* ===========================================================================
   6 · LIVRET D'ACCUEIL
   =========================================================================== */
{
  const m = manuel({
    id: "livret-accueil", parcours: "livret", genre: "Document d'accueil",
    titre: "Livret | d'accueil",
    duree: "À lire avant le premier jour",
    objectif: "Tout ce qu'il faut savoir avant d'arriver : où nous trouver, comment se déroule votre formation, ce qui est attendu de vous.",
    image: "couv-livret",
  });
  m.couverture();
  /* L'ordre est celui du sommaire du livret d'origine : le certificat d'abord,
     le mot d'accueil ensuite. */
  LI.certification(m);
  LI.accueil(m);
  LI.formateur(m);
  LI.acces(m);
  LI.centre(m);
  LI.formations(m);
  /* Les programmes détaillés et les plannings — pages 12 à 21 du livret. La
     première version les avait résumés en un tableau : c'est précisément ce
     qu'un stagiaire lit avant de s'inscrire et ce qu'un audit vérifie. */
  PR.pagesProgrammes(m, ["niveau1", "pro", "niveau2", "expert", "teglia", "napolitaine", "hygiene"]);
  LI.securite(m);
  C.equipe(m);
  m.sommaire();
  m.dos();
  documents.push(m);
}

/* ===========================================================================
   ÉCRITURE
   =========================================================================== */
mkdirSync(RACINE, { recursive: true });
for (const d of documents) {
  writeFileSync(resolve(RACINE, `${d.id}.html`), d.rendre(), "utf8");
  console.log(`  ${String(d.pages.length).padStart(3)} pages   ${d.id}.html`);
}

/* --- La page d'accueil ---------------------------------------------------- */
const carte = (d) => `
      <a class="doc" href="${d.id}.html" data-parcours="${d.parcours}">
        <span class="doc-img"><img src="assets/img/${d.image}.jpg" alt=""></span>
        <span class="doc-bande"></span>
        <span class="doc-txt">
          <span class="doc-genre">${d.genre}${d.mention ? ` · ${d.mention}` : ""}</span>
          <span class="doc-titre">${d.titre.replace(" | ", " ")}</span>
          <span class="doc-obj">${d.objectif}</span>
          <span class="doc-pied"><span>${d.duree}</span><span>${d.pages.length} pages</span></span>
        </span>
      </a>`;

writeFileSync(resolve(RACINE, "index.html"), `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manuels de formation — ${ECOLE.nom}</title>
<link rel="icon" href="assets/logo/logo.png">
<link rel="stylesheet" href="manuel.css">
<style>
  /* Page d'accueil : elle n'est pas destinée à l'impression, elle n'utilise
     donc pas le gabarit A4. Le peu de style qu'elle demande vit ici. */
  body{background:#f2f3f7}
  .acc-tete{background:#0f1017; color:#fff; padding:52px 32px 44px}
  .acc-tete .dedans{max-width:1180px; margin:0 auto}
  .acc-tete img{width:52mm; margin-bottom:22px}
  .acc-tete h1{font-size:34pt; line-height:1.05; letter-spacing:-.025em; margin-bottom:10px}
  .acc-tete p{max-width:620px; color:rgba(255,255,255,.72); font-size:12pt}
  .acc-grille{max-width:1180px; margin:0 auto; padding:34px 32px 60px;
              display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:22px}
  .doc{display:flex; flex-direction:column; background:#fff; border-radius:5mm; overflow:hidden;
       text-decoration:none; color:var(--encre); box-shadow:0 1px 3px rgba(15,16,23,.12);
       transition:transform .16s ease, box-shadow .16s ease}
  .doc:hover{transform:translateY(-3px); box-shadow:0 10px 26px rgba(15,16,23,.18)}
  .doc-img{display:block; height:150px; overflow:hidden}
  .doc-img img{width:100%; height:100%; object-fit:cover}
  .doc-bande{display:block; height:5px; background:var(--accent)}
  .doc-txt{display:flex; flex-direction:column; flex:1; padding:18px 20px 16px; gap:7px}
  .doc-genre{font:700 8pt/1.3 var(--titre); letter-spacing:.14em; text-transform:uppercase; color:var(--accent-encre)}
  .doc-titre{font:700 16pt/1.15 var(--titre); letter-spacing:-.02em}
  .doc-obj{font-size:10pt; line-height:1.45; color:var(--encre-2); flex:1}
  .doc-pied{display:flex; justify-content:space-between; padding-top:11px; margin-top:4px;
            border-top:1px solid var(--trait); font:600 9pt/1 var(--titre); color:var(--encre-3)}
  .acc-note{max-width:1180px; margin:0 auto; padding:0 32px 60px}
  @media print{ .acc-tete{background:#fff; color:#000} .doc{box-shadow:none; border:1px solid #ddd} }
</style>
</head>
<body>

<header class="acc-tete">
  <div class="dedans">
    <img src="assets/logo/logo-blanc.png" alt="${ECOLE.nom}">
    <h1>Les manuels de formation</h1>
    <p>Neuf documents, un par parcours. Chacun s'ouvre dans le navigateur et s'imprime
    directement en A4 — bouton « Imprimer / PDF » en haut de chaque manuel.</p>
  </div>
</header>

<main class="acc-grille">
${documents.map(carte).join("\n")}
</main>

<section class="acc-note">
  <div class="enc enc-verif">
    <span class="enc-t">Points à vérifier</span>
    <p>Les manuels signalent en violet les valeurs à confirmer et les incohérences relevées dans
    les documents d'origine. La liste complète est dans <strong>A-VERIFIER.md</strong>, à la racine
    du dossier <code>manuels/</code>.</p>
  </div>
</section>

</body>
</html>
`, "utf8");

console.log(`\n${documents.length} manuels + index.html écrits dans ${RACINE}`);

/**
 * Gabarit des manuels — construction d'un document page à page.
 *
 * POURQUOI UN GÉNÉRATEUR PLUTÔT QUE NEUF FICHIERS HTML ÉCRITS À LA MAIN
 * Quatre des neuf manuels dérivent du même socle (Niveau I) : la farine, la
 * levure, l'eau, le sel, l'huile, les substitutions et le lexique y sont
 * IDENTIQUES. Écrits à la main, ces chapitres existeraient en quatre copies —
 * et le jour où le dosage de levure change, trois copies resteraient fausses.
 * C'est exactement ce qui est arrivé aux manuels d'origine (cf. A-VERIFIER.md :
 * en-têtes Teglia/Pala inversés, page dupliquée du Niveau II, protocole In Pala
 * recopié de l'In Teglia). Ici le chapitre est écrit une fois et composé.
 *
 * Les fichiers .html produits sont versionnés : personne n'a besoin de Node
 * pour LIRE ou IMPRIMER un manuel, seulement pour le regénérer.
 */

/* ---------------------------------------------------------------------------
   Identité de l'organisme — un seul endroit, repris sur chaque couverture.
   --------------------------------------------------------------------------- */
export const ECOLE = {
  nom: "École Pizza",
  raison: "École Pizzaïolo Jean-Jacques Despaux",
  siret: "879 955 136 00012",
  naf: "8559A",
  nda: "76 65 00989 65",
  ndaTexte: "NDA 76 65 00989 65 auprès du préfet de la région Occitanie",
  adresse: "101 rue Alsace Lorraine, 65300 Lannemezan",
  tel: "05 62 50 18 64",
  courriel: "contact@ecole-pizza.com",
  site: "www.ecole-pizza.com",
  maj: "14/01/2026",
};

/* Échappe le strict nécessaire : les contenus sont écrits par nous, pas saisis. */
export const esc = (s) => String(s).replace(/&(?![a-z#]+;)/g, "&amp;").replace(/</g, "&lt;");

/* ===========================================================================
   COMPOSANTS
   Chacun rend une chaîne HTML. Ils portent les classes de manuel.css et rien
   d'autre : aucun style en ligne, pour qu'un changement de charte reste dans
   la feuille de style.
   =========================================================================== */

/** Bandeau de tête d'une page courante. */
export const entete = (parcours, chapitre = "") => `
      <div class="entete">
        <span class="entete-parcours">${parcours}</span>
        <span class="entete-chap">${chapitre}</span>
      </div>`;

/** Photo pleine largeur avec légende. */
export const photo = (fichier, alt, legende = "") => `
        <figure class="photo">
          <img src="assets/img/${fichier}.jpg" alt="${esc(alt)}">
          ${legende ? `<figcaption class="legende">${legende}</figcaption>` : ""}
        </figure>`;

/** Texte à côté d'une image. `sens` vaut "droite" (défaut) ou "gauche". */
export const cote = (texte, fichier, alt, { sens = "droite", large = false } = {}) => {
  const img = `<img src="assets/img/${fichier}.jpg" alt="${esc(alt)}">`;
  const cls = `cote${sens === "gauche" ? " inverse" : ""}${large ? " cote-large" : ""}`;
  return sens === "gauche"
    ? `<div class="${cls}">${img}<div>${texte}</div></div>`
    : `<div class="${cls}"><div>${texte}</div>${img}</div>`;
};

/** Deux images côte à côte. */
export const duo = (a, b, legende = "") => `
        <figure class="photo">
          <div class="duo">
            <img src="assets/img/${a[0]}.jpg" alt="${esc(a[1])}">
            <img src="assets/img/${b[0]}.jpg" alt="${esc(b[1])}">
          </div>
          ${legende ? `<figcaption class="legende">${legende}</figcaption>` : ""}
        </figure>`;

/** Encadré. `genre` : conseil | alerte | verif | note. */
export const enc = (genre, titre, corps) =>
  `<div class="enc enc-${genre}"><span class="enc-t">${titre}</span>${corps}</div>`;

/**
 * LE RAPPEL DE CHAPITRE — « ce qu'il faut retenir ».
 *
 * Il ferme un chapitre par ce qui doit rester quand tout le reste est oublié.
 * Trois points au plus : au-delà, ce n'est plus un rappel, c'est un résumé, et
 * un résumé ne se retient pas mieux que le chapitre.
 * Il prend la couleur du parcours — c'est le repère qui court d'un chapitre à
 * l'autre et qui dit au stagiaire où s'arrêter quand il révise.
 */
export const retenir = (points) => `
        <div class="retenir">
          <span class="retenir-t">Ce qu'il faut retenir</span>
          <ul>${points.map((x) => `<li>${x}</li>`).join("")}</ul>
        </div>`;

/** Marqueur « à vérifier » : une valeur que le formateur doit confirmer. */
export const averif = (quoi = "à vérifier") => `<span class="averif">${quoi}</span>`;

/** Titre de chapitre. */
export const chapitre = (n, titre, chapo = "") => `
        <div class="chap">
          <div class="chap-num-bloc">
            <div class="chap-num">${n}</div>
            <div class="chap-marque"><i class="m1"></i><i class="m2"></i></div>
          </div>
          <div class="chap-txt">
            <h2>${titre}</h2>
            ${chapo ? `<p class="chapo">${chapo}</p>` : ""}
          </div>
        </div>`;

/** Bandeau de repères chiffrés (hydratation, W, température…). */
export const reperes = (liste) => `
        <div class="reperes">
          ${liste.map(([k, v, u = ""]) => `
          <div class="repere"><span class="k">${k}</span><span class="v">${v}${u ? ` <span class="u">${u}</span>` : ""}</span></div>`).join("")}
        </div>`;

/** Protocole : suite de phases et de temps de repos. */
export const proto = (blocs) => `
        <div class="proto">
          ${blocs.map((b) => b.repos
            ? `<div class="repos"><span class="repos-d">${b.repos}</span><span class="repos-l">${b.texte}</span></div>`
            : `<div class="phase" data-n="${b.n}"><div class="phase-t">${b.titre}</div>${b.corps}</div>`
          ).join("")}
        </div>`;

/** Avantages / inconvénients. */
export const bilan = (plus, moins, titres = ["Avantages", "Inconvénients"]) => `
        <div class="bilan">
          <div class="plus"><h4>${titres[0]}</h4><ul>${plus.map((x) => `<li>${x}</li>`).join("")}</ul></div>
          <div class="moins"><h4>${titres[1]}</h4><ul>${moins.map((x) => `<li>${x}</li>`).join("")}</ul></div>
        </div>`;

/** Tableau. `entetes` : tableau de chaînes ou de [libellé, classe]. */
export const tbl = (entetes, lignes, { titre = "", compact = false, classes = "" } = {}) => {
  const th = entetes.map((e) => {
    const [lib, cls] = Array.isArray(e) ? e : [e, ""];
    return `<th${cls ? ` class="${cls}"` : ""}>${lib}</th>`;
  }).join("");
  const tr = lignes.map((l) => {
    if (l.groupe) return `<tr class="grp"><td colspan="${entetes.length}">${l.groupe}</td></tr>`;
    const cells = (l.cells || l).map((c) => {
      const [txt, cls] = Array.isArray(c) ? c : [c, ""];
      return `<td${cls ? ` class="${cls}"` : ""}>${txt}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  // Un tableau dont tous les en-têtes sont vides est une simple grille de
  // libellés (« Adresse | … »). Lui laisser une bande d'accent vide en tête
  // donnerait un bandeau de couleur qui ne dit rien.
  const sansEntete = entetes.every((e) => !(Array.isArray(e) ? e[0] : e));
  return `
        <table class="tbl${compact ? " tbl-compact" : ""}${sansEntete ? " tbl-nue" : ""}${classes ? ` ${classes}` : ""}">
          ${titre ? `<caption>${titre}</caption>` : ""}
          ${sansEntete ? "" : `<thead><tr>${th}</tr></thead>`}
          <tbody>${tr}</tbody>
        </table>`;
};

/* ===========================================================================
   LE DOCUMENT
   =========================================================================== */

export class Manuel {
  /**
   * @param {object} d
   * @param {string} d.id        nom du fichier produit, sans extension
   * @param {string} d.parcours  clé de couleur : niveau1 | rs | hygiene | …
   * @param {string} d.genre     « Formation » ou « Spécialisation »
   * @param {string} d.titre     titre affiché ; « | » coupe la 2ᵉ ligne, mise en accent
   * @param {string} d.duree     « 5 jours — 35 heures »
   * @param {string} d.objectif  objectif pédagogique officiel
   * @param {string} d.image     nom du visuel de couverture (assets/img/…)
   * @param {string} [d.mention]  ligne complémentaire sous le titre (ex. « RS 7404 »)
   * @param {string} [d.imageDos] visuel du dos de couverture — « four-flamme » par défaut
   */
  constructor(d) {
    Object.assign(this, d);
    this.pages = [];     // { html, pleine, folio }
    this.entrees = [];   // entrées du sommaire
    this.folio = 0;
  }

  /** Page pleine (couverture, intercalaire, dos) — non numérotée. */
  pleine(html) {
    this.pages.push({ html, pleine: true });
    return this;
  }

  /**
   * Page courante, numérotée. `chap` alimente l'en-tête ET le sommaire :
   * une page sans `chap` prolonge le chapitre précédent (pas de doublon
   * dans le sommaire, en-tête conservé).
   */
  p(corps, { chap = null, num = null, sous = null, plein = false } = {}) {
    this.folio += 1;
    const courant = chap || this.dernierChap || "";
    if (chap) {
      this.dernierChap = chap;
      this.entrees.push({ num, lib: chap, page: this.folio, sous: false });
    }
    if (sous) this.entrees.push({ num: null, lib: sous, page: this.folio, sous: true });

    this.pages.push({
      folio: this.folio,
      html: `${entete(this.etiquette(), courant)}
      <div class="corps${plein ? " plein" : ""}">
${corps}
      </div>
      <div class="pied">
        <span>${ECOLE.raison} · ${ECOLE.adresse}</span>
        <span class="folio">${this.folio}</span>
      </div>`,
    });
    return this;
  }

  /** Séparateur de partie (manuel Expert) — non numéroté, mais listé. */
  intercalaire({ partie, titre, texte, image }) {
    this.entrees.push({ partie: true, lib: titre, page: this.folio + 1 });
    return this.pleine(`
      <div class="inter">
        <figure class="photo-pleine"><img src="assets/img/${image}.jpg" alt=""></figure>
        <div class="part-n">${partie}</div>
        <h2>${titre}</h2>
        <div class="regle"></div>
        <p>${texte}</p>
      </div>`);
  }

  /** L'étiquette de parcours qui court en tête de chaque page. */
  etiquette() {
    return this.titre.replace(" | ", " ");
  }

  /**
   * Numéro du chapitre suivant. Chaque manuel a SA numérotation : le même
   * chapitre « La levure » est le 10ᵉ du Niveau I et le 6ᵉ du Niveau II. Un
   * compteur porté par le document évite de saisir ces numéros à la main —
   * c'est cette saisie qui a produit les « 8. L'eau / 9. Le sel / 7. L'huile /
   * 8. Les substitutions » du sommaire du Niveau II d'origine.
   */
  chapSuivant() {
    this._c = (this._c || 0) + 1;
    return this._c;
  }

  /* --- Couverture --------------------------------------------------------- */
  couverture() {
    const [t1, t2] = this.titre.split(" | ");
    return this.pleine(`
      <div class="couv">
        <div class="couv-visuel">
          <img src="assets/img/${this.image}.jpg" alt="">
          <div class="couv-haut">
            <img class="couv-logo" src="assets/logo/logo-blanc.png" alt="${ECOLE.nom}">
            <span class="couv-duree">${this.duree}</span>
          </div>
        </div>
        <div class="couv-bande"></div>
        <div class="couv-bas">
          <div class="couv-genre">${this.genre}${this.mention ? ` · ${this.mention}` : ""}</div>
          <h1 class="couv-titre">${t1}${t2 ? `<span class="fin">${t2}</span>` : ""}</h1>
          <div class="couv-regle"></div>
          <p class="couv-objectif"><span class="lbl">Objectif de la formation</span>${this.objectif}</p>
          <div class="couv-legal">
            <span>
              ${ECOLE.raison} · SIRET ${ECOLE.siret} · NAF ${ECOLE.naf}<br>
              ${ECOLE.ndaTexte}<br>
              ${ECOLE.adresse} · ${ECOLE.courriel}
              <span class="couv-labels">
                <img src="assets/logo/qualiopi.png" alt="Qualiopi">
                <img src="assets/logo/icpf.png" alt="ICPF &amp; Cofrac">
              </span>
            </span>
            <span class="maj">Version 2.0<br>Mise à jour le ${ECOLE.maj}</span>
          </div>
        </div>
      </div>`);
  }

  /* --- Dos de couverture --------------------------------------------------- */
  dos() {
    return this.pleine(`
      <div class="dos">
        <figure class="dos-photo"><img src="assets/img/${this.imageDos || "four-flamme"}.jpg" alt=""></figure>
        <img class="dos-logo" src="assets/logo/logo-blanc.png" alt="${ECOLE.nom}">
        <div class="parcours">${this.etiquette()}</div>
        <h2>Merci de nous<br>avoir choisis&nbsp;!</h2>
        <div class="dos-regle"></div>
        <div class="legal">
          ${ECOLE.raison}<br>
          SIRET ${ECOLE.siret} · NAF ${ECOLE.naf} · ${ECOLE.ndaTexte}<br>
          ${ECOLE.adresse} · ${ECOLE.tel} · ${ECOLE.courriel} · ${ECOLE.site}
        </div>
      </div>`);
  }

  /**
   * Sommaire — inséré APRÈS coup, en 2ᵉ position, une fois les folios connus.
   * C'est la seule façon d'avoir des numéros de page justes sans les saisir à
   * la main : les manuels d'origine les saisissaient, et ceux du Niveau II ne
   * correspondent plus au contenu (cf. A-VERIFIER.md).
   */
  sommaire() {
    const ligne = (e) => {
      if (e.partie) return `<li class="part"><span>${e.lib}</span><span>p. ${e.page}</span></li>`;
      return `<li${e.sous ? ' class="sous"' : ""}>
              <span class="ligne">
                <span class="num">${e.num != null ? `${e.num}.` : ""}</span>
                <span class="lib">${e.lib}</span>
                <span class="pts"></span>
                <span class="pg">${e.page}</span>
              </span>
            </li>`;
    };

    /* DEUX COLONNES, MAIS PAS EN `columns` CSS.
       Le multi-colonnes a besoin d'une hauteur définie pour s'équilibrer. Dans
       un conteneur flex de hauteur calculée, l'impression la résout autrement
       que l'écran : le sommaire sortait en UNE colonne dans le PDF, débordait
       de la page et recouvrait le pied. Une grille de deux <ol>, remplis par
       le générateur, donne exactement le même rendu partout. */
    const n = this.entrees.length;
    const deux = n > 22;
    const coupe = deux ? Math.ceil(n / 2) : n;
    const dense = n > 40;
    const colonnes = deux
      ? `<div class="somm-cols">
          <ol class="somm${dense ? " somm-dense" : ""}">${this.entrees.slice(0, coupe).map(ligne).join("")}</ol>
          <ol class="somm${dense ? " somm-dense" : ""}" start="${coupe + 1}">${this.entrees.slice(coupe).map(ligne).join("")}</ol>
        </div>`
      : `<ol class="somm">${this.entrees.map(ligne).join("")}</ol>`;

    const html = `${entete(this.etiquette(), "Sommaire")}
      <div class="corps plein">
        <div class="somm-sur">${this.genre}${this.mention ? ` · ${this.mention}` : ""}</div>
        <h2 class="somm-titre">Sommaire</h2>
        ${colonnes}
      </div>
      <div class="pied">
        <span>${ECOLE.raison} · Mise à jour le ${ECOLE.maj}</span>
        <span class="folio"></span>
      </div>`;
    this.pages.splice(1, 0, { html });
    return this;
  }

  /* --- Rendu final --------------------------------------------------------- */
  rendre() {
    const corps = this.pages.map((p) =>
      `    <section class="page${p.pleine ? " page-pleine" : ""}">${p.html}\n    </section>`
    ).join("\n");

    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${this.etiquette()} — ${ECOLE.nom}</title>
<meta name="description" content="${esc(this.objectif)}">
<link rel="icon" href="assets/logo/logo.png">
<link rel="stylesheet" href="manuel.css">
</head>
<body data-parcours="${this.parcours}">

<!-- Barre d'écran : elle disparaît à l'impression (cf. manuel.css §17). -->
<div class="barre">
  <span class="pastille"></span>
  <span class="nom">${this.etiquette()}</span>
  <span>${this.duree}</span>
  <span class="sep"></span>
  <a href="index.html">Tous les manuels</a>
  <button class="primaire" onclick="print()">Imprimer / PDF</button>
</div>

${corps}

</body>
</html>
`;
  }
}

/** Raccourci de création. */
export const manuel = (d) => new Manuel(d);

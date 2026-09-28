/**
 * LES DOCUMENTS D'UN DOSSIER DU COFFRE, RANGÉS COMME L'ARCHIVE LES RANGE — Suivi Qualiopi → Archives
 * (demandé le 2026-09-28 : « certains dossiers ne sont pas créés, comme Justificatifs »).
 *
 * L'ÉCRAN RANGEAIT À SA FAÇON : année, semaine, formation, stagiaire, puis une liste à plat. Il ne
 * lisait pas l'arborescence d'archivage, si bien que le sous-dossier « Justificatifs » qu'elle place
 * sous chaque stagiaire n'y apparaissait jamais, et qu'un document qu'elle ne range pas — et que
 * l'archive ZIP n'emporte donc pas — s'y montrait comme les autres.
 *
 * Le serveur donne à chaque ligne la place même que l'archive lui donne (`rangement`, cf.
 * rangementPourLEcran, lib/arborescenceArchive.js) ; ici, on la lit. Sans elle (serveur d'avant, ou
 * rangement indisponible), tout reste à la racine : l'écran d'avant.
 *
 * Du JavaScript pur, sans JSX : les tests de `src/api/test` l'importent et l'éprouvent.
 */

/**
 * @param docs les lignes du coffre d'une même feuille (un stagiaire, une entreprise, une session)
 * @returns {{ racine, dossiers: [{ nom, docs }], entreprise, ailleurs, hors }}
 *   · racine : à la racine de son dossier ;
 *   · dossiers : ses sous-dossiers (« Justificatifs »), triés par nom ;
 *   · entreprise : rangés dans le dossier de l'entreprise (l'AGEFICE que l'école y range) ;
 *   · ailleurs : rangés plus haut dans l'archive ;
 *   · hors : que l'arborescence ne range pas — l'archive ZIP ne les emporte pas.
 */
export function rangerDansLeDossier(docs) {
  const racine = []; const entreprise = []; const ailleurs = []; const hors = [];
  const parDossier = new Map();
  for (const d of docs || []) {
    const r = d && d.rangement;
    if (!r) { racine.push(d); continue; }
    if (r.hors_archive) { hors.push(d); continue; }
    if (r.ailleurs === "entreprise") { entreprise.push(d); continue; }
    if (r.ailleurs) { ailleurs.push(d); continue; }
    const nom = (r.sous_dossiers || []).filter(Boolean).join(" / ");
    if (!nom) { racine.push(d); continue; }
    if (!parDossier.has(nom)) parDossier.set(nom, []);
    parDossier.get(nom).push(d);
  }
  const dossiers = [...parDossier].map(([nom, liste]) => ({ nom, docs: liste }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return { racine, dossiers, entreprise, ailleurs, hors };
}

/**
 * LE DOSSIER (l'inscription) D'UNE FEUILLE « STAGIAIRE » DU COFFRE — là où « Ajouter des fichiers »
 * dépose (2026-09-28). Une feuille regroupe les documents d'un stagiaire pour UNE semaine et UNE
 * formation : ceux qui connaissent leur dossier le partagent. `null` : feuille faite des seuls PDF
 * importés à l'ancienne, rattachés par un nom.
 */
export function dossierDeLaFeuille(docs) {
  const d = (docs || []).find((x) => x && x.enrollment_id);
  return d ? d.enrollment_id : null;
}

/** L'extension d'un fichier du coffre, d'après son type : un scan ajouté au dossier est une image. */
const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
export const extensionDuCoffre = (mime) => EXTENSIONS[String(mime || "").toLowerCase()] || ".pdf";

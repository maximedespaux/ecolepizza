/**
 * L'ARBORESCENCE D'ARCHIVAGE COMMUNE, CÔTÉ ÉCRAN (2026-09-24) — la même règle d'identité que le
 * serveur (src/api/lib/arborescenceArchive.js), tenue par un test : un QCM se désigne par son TITRE
 * (chaque formation a le sien), un « OU » par son groupe, tout le reste par son identifiant.
 *
 * C'est elle qui dit, dans l'aperçu d'une formation, quel document l'arborescence range et lequel
 * elle ne nomme pas — sans elle, l'écran annoncerait une place que l'archive ne donnerait pas.
 */

/** Un titre comparable : sans accents, sans casse, espaces réduits. */
export const normaliserTitre = (t) => String(t == null ? "" : t).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

/** L'identité d'un document placé dans l'arborescence — la même quelle que soit la formation. */
export function cleItem(it) {
  if (!it || typeof it !== "object") return null;
  if (it.group) return `ou:${it.group}`;
  if (it.type === "quiz" && it.titre) return `qcm:${normaliserTitre(it.titre)}`;
  if (it.ref) return `ref:${it.ref}`;
  return null;
}

/**
 * Les documents (clés de la palette) qu'un item couvre. Un « OU » couvre les membres
 * d'AUJOURD'HUI de son groupe (`groupes` : clé → [slugs]), pas l'instantané enregistré avec lui.
 */
export function clesCouvertes(it, groupes) {
  if (!it) return [];
  if (it.group) {
    const membres = (groupes && groupes.get(it.group)) || it.members || [];
    return membres.map((s) => `ref:${s}`);
  }
  const c = cleItem(it);
  return c ? [c] : [];
}

/** Toutes les clés que l'arborescence range, dossier par dossier. */
export function clesRangees(tree, groupes) {
  const out = new Set();
  const parcourir = (dossiers) => {
    for (const d of dossiers || []) {
      for (const it of d.items || []) for (const c of clesCouvertes(it, groupes)) out.add(c);
      parcourir(d.children);
    }
  };
  parcourir(tree && tree.folders);
  return out;
}

/**
 * L'aperçu d'une formation : ce que l'arborescence commune range pour elle, et ce qu'elle ne range pas
 * — qui ne sera PAS dans l'archive (décidé par l'école le 2026-09-25 : ne pas placer un document,
 * c'est ne pas en vouloir de copie). Le serveur exclut exactement cette liste (offertsDesFormations).
 * @param documents les clés de ce que la formation a dans cet arbre (formationDansLArbre)
 * @param aRanger   celles dont l'absence se signale — par défaut toutes ; côté entreprise, les seuls
 *                  documents de groupe : ceux des stagiaires n'y sont que des copies, facultatives
 */
export function apercuFormation(tree, documents, groupes, aRanger = documents) {
  const siens = new Set(documents || []);
  const ranges = clesRangees(tree, groupes);
  return {
    /** L'item concerne-t-il cette formation ? Sinon il est simplement sauté pour elle. */
    concerne: (it) => clesCouvertes(it, groupes).some((c) => siens.has(c)),
    nonPlaces: [...new Set(aRanger || [])].filter((c) => !ranges.has(c)),
  };
}

const union = (...listes) => [...new Set(listes.flatMap((l) => l || []))];

/**
 * CE QUE PROPOSE CHAQUE ARBRE, et ce qu'une formation y a (2026-09-25). La palette vient du serveur
 * (GET /formations/arborescence) : pour chaque document, les formations qui l'ont dans le parcours du
 * dossier (`formations`) et à l'arrivée par entreprise (`formations_entreprise`, leur volet entreprise,
 * que la palette ignorait : le devis professionnel n'était proposé NULLE PART).
 *
 * DEUX ARBRES, DEUX RÔLES (côté serveur : placesDansLArchive) :
 *   · STAGIAIRE — le dossier de CHAQUE stagiaire, inscrit seul ou par une entreprise : tous leurs
 *     documents, sauf ceux de groupe (🏢), qui vont à l'entreprise ; et les documents de SESSION
 *     (`session`, « Contrat Hygiène »), qu'aucun parcours ne porte ;
 *   · ENTREPRISE — des COPIES pour l'entreprise, de ce qu'on y range ; et la seule place de ses
 *     documents de groupe. Tout ce qu'une entreprise ou ses stagiaires peuvent avoir y est proposé —
 *     pas un document de session, qui n'a pas d'entreprise.
 */
export function paletteDeLArbre(documents, kind) {
  const docs = (documents || []).map((d) => ({ ...d, formations: union(d.formations, d.formations_entreprise) }));
  return kind === "entreprise"
    ? docs.filter((d) => d.formations.length)
    : docs.filter((d) => !d.company_level && (d.formations.length || d.session));
}

/** Ce que seule l'AUTRE arborescence range (le groupe côté entreprise, la session côté stagiaire) : la
    liste de celle-ci le dit, au lieu d'un « aucun document ne correspond » qui laisse chercher. */
export function horsDeLArbre(documents, kind) {
  const siens = new Set(paletteDeLArbre(documents, kind).map((d) => d.cle));
  return paletteDeLArbre(documents, kind === "entreprise" ? "stagiaire" : "entreprise").filter((d) => !siens.has(d.cle));
}

/**
 * Ce qu'une formation a dans un arbre (`documents`, ce qui la concerne), et ce qui, non rangé, ne sera
 * pas archivé (`aRanger`) — la liste même que le serveur exclut (offertsDesFormations) :
 *   · stagiaire : tout ce qu'ont ses dossiers, seuls ou par une entreprise, et ses documents de
 *     session — sauf le groupe ;
 *   · entreprise : ce qu'a son arrivée par entreprise ; seuls ses documents de groupe se signalent.
 */
export function formationDansLArbre(formation, kind, documents) {
  if (!formation) return null;
  const deGroupe = new Set((documents || []).filter((d) => d.company_level).map((d) => d.cle));
  const tous = union(formation.documents, formation.documents_entreprise);
  if (kind === "entreprise") {
    return { ...formation, documents: formation.documents_entreprise || formation.documents || [], aRanger: tous.filter((c) => deGroupe.has(c)) };
  }
  const siens = union(tous, formation.documents_session).filter((c) => !deGroupe.has(c));
  return { ...formation, documents: siens, aRanger: siens };
}

/** Un document SANS STAGIAIRE — de groupe, ou de session seulement — ne se range pas dans un dossier
    « un par stagiaire » : il n'aurait aucun nom à y prendre (le serveur le remonterait d'un cran). */
export const sansStagiaire = (d) => !!d && (!!d.company_level || (!!d.session && !(d.formations || []).length));

/** Les groupes « OU » d'aujourd'hui, depuis la carte slug → { group } des équivalences. */
export function groupesDepuis(eqMap) {
  const g = new Map();
  for (const [slug, v] of eqMap || []) {
    if (!v || !v.group) continue;
    if (!g.has(v.group)) g.set(v.group, []);
    g.get(v.group).push(slug);
  }
  return g;
}

/** Les dossiers, transformés récursivement : `fn` rend le dossier modifié, ou null pour le retirer. */
export const transformerDossiers = (folders, fn) =>
  (folders || []).map((f) => fn({ ...f, children: transformerDossiers(f.children, fn) })).filter(Boolean);

/**
 * PLACER UN DOCUMENT, C'EST AUSSI LE DÉPLACER (2026-09-25). L'archive range un document au PREMIER
 * dossier qui le nomme : le laisser à deux endroits faisait croire à deux copies, et c'est l'ordre
 * de l'arbre, invisible, qui décidait. Il quitte donc sa place d'avant — et un « OU » emporte avec lui
 * les modèles seuls qu'il contient (`groupes` : ses membres d'aujourd'hui). L'arbre reçu n'est pas
 * modifié : l'écran compare les références pour savoir quoi redessiner.
 */
export function placerDocument(folders, dossierId, item, groupes) {
  const couverts = new Set([cleItem(item), ...(item && item.group ? clesCouvertes(item, groupes) : [])]);
  const sans = transformerDossiers(folders, (f) => ({ ...f, items: (f.items || []).filter((it) => !couverts.has(cleItem(it))) }));
  return transformerDossiers(sans, (f) => (f.id === dossierId ? { ...f, items: [...(f.items || []), item] } : f));
}

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
 * L'aperçu d'une formation : ce que l'arborescence commune range pour elle, et ce qu'elle ne nomme
 * pas (qui ira dans le dossier du stagiaire — rien n'est perdu, mais mieux vaut le savoir).
 * @param documents les clés du parcours de la formation (GET /formations/arborescence)
 */
export function apercuFormation(tree, documents, groupes) {
  const siens = new Set(documents || []);
  const ranges = clesRangees(tree, groupes);
  return {
    /** L'item concerne-t-il cette formation ? Sinon il est simplement sauté pour elle. */
    concerne: (it) => clesCouvertes(it, groupes).some((c) => siens.has(c)),
    nonPlaces: [...siens].filter((c) => !ranges.has(c)),
  };
}

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

/**
 * LES POINTS DE LA CARTE — qui regrouper, et ce que disent leurs bulles (demandé le 2026-09-22).
 *
 * Du JavaScript pur, sans JSX ni Leaflet (cf. l'en-tête d'`etapes.js`) : les tests de
 * `src/api/test` l'importent et l'éprouvent.
 *
 * UN PARTICULIER EST SITUÉ À SA VILLE, jamais à son adresse — c'est une donnée personnelle
 * (carte.controller, `aAdresseEntreprise`). Tous ceux d'une même ville partageaient donc EXACTEMENT
 * le même point : empilés, un seul se voyait et se cliquait. À Lannemezan, la ville de l'école, un
 * clic montrait un nom sur des dizaines. Ils forment désormais UN point, qui porte leur nombre et,
 * au clic, leur liste.
 *
 * LES STAGIAIRES D'UNE ENTREPRISE (`entreprise`, dit par le serveur) sont à l'adresse EXACTE de
 * l'entreprise : chacun garde son point.
 */
import { colorForLevel, LEVEL_LABEL } from "./levels.js";

/**
 * ÉCHAPPER TOUT CE QUI VIENT DE LA BASE avant de l'écrire dans une bulle. Leaflet pose le contenu
 * d'une info-bulle ou d'un encart en innerHTML : un nom écrit tel quel y est du HTML exécuté. Or le
 * stagiaire modifie lui-même son nom et sa ville depuis son espace (PUT /mon-espace/infos) — un nom
 * piégé s'exécutait dans la session de l'administrateur qui survolait son point, là où le jeton de
 * connexion se lit (localStorage).
 */
export const echapper = (v) => String(v ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** La couleur d'un point : celle de sa formation (la plus récente), sinon de son niveau. */
export const couleurDuPoint = (p) => colorForLevel(p.program_code || p.level);
const formationDuPoint = (p) => p.program_code || LEVEL_LABEL[p.level] || "Formation non définie";

/**
 * Les points à dessiner : un par ville pour les stagiaires situés à leur ville, un par stagiaire
 * pour ceux d'une entreprise, dans l'ordre reçu.
 * @returns [{ lat, lng, ville, points, groupe }] — `groupe` : plus d'un stagiaire au même point
 */
export function grouperPoints(points) {
  const out = [];
  const parVille = new Map();
  for (const p of points || []) {
    if (p.entreprise) {
      out.push({ lat: p.lat, lng: p.lng, ville: p.town || "", points: [p], groupe: false });
      continue;
    }
    /* Même département, même ville — la casse n'y change rien. Sans ville (situé par son seul
       code postal), le regroupement se fait sur la position elle-même. */
    const ville = (p.town || "").trim().toLocaleUpperCase("fr");
    const cle = ville ? `${p.dept}|${ville}` : `@${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
    let g = parVille.get(cle);
    if (!g) {
      g = { lat: p.lat, lng: p.lng, ville: p.town || "", points: [], groupe: false };
      parVille.set(cle, g);
      out.push(g);
    }
    g.points.push(p);
  }
  for (const g of out) g.groupe = g.points.length > 1;
  return out;
}

/** La couleur d'un point de ville : la formation la plus suivie parmi ses stagiaires. */
export function couleurDuGroupe(g) {
  const n = new Map();
  for (const p of g.points) { const c = couleurDuPoint(p); n.set(c, (n.get(c) || 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** L'encart d'un stagiaire seul — son entreprise, s'il est situé chez elle. */
export function encartStagiaire(p) {
  return `<b>${echapper(p.name)}</b>`
    + (p.entreprise ? `<br>${echapper(p.entreprise)}` : "")
    + `<br>${echapper(p.town)}`
    + `<br><span style="color:${echapper(couleurDuPoint(p))}">${echapper(formationDuPoint(p))}</span>`;
}

/** L'encart d'une ville : ses stagiaires, par ordre alphabétique, chacun avec sa formation. */
export function encartVille(g) {
  const tries = [...g.points].sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
  return `<b>${echapper(g.ville)}</b> · ${g.points.length} stagiaires`
    + `<ul class="pt-liste">${tries.map((p) => `<li><i style="background:${echapper(couleurDuPoint(p))}"></i>`
      + `${echapper(p.name)} <span>${echapper(formationDuPoint(p))}</span></li>`).join("")}</ul>`;
}

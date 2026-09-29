/**
 * UN MONTANT SAISI, lu comme on l'écrit en France : « 315,93 », « 1 234,56 », « 12,5 € ».
 *
 * La même règle que le serveur (src/api/lib/montantSaisi.js, où le défaut est raconté : une
 * dépense de 315,93 € refusée parce que `Number("315,93")` vaut NaN) ; montant-saisi.test.js
 * confronte les deux sur les mêmes cas. L'écran s'en sert pour VALIDER avant l'envoi : il
 * refusait lui aussi la virgule, avec des messages qui ne le disaient pas (« La valeur est
 * obligatoire » sous une valeur bien remplie).
 */
export function lireMontant(v) {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  let s = String(v).replace(/[\s\u00a0\u202f€]/g, "");
  const virgule = s.lastIndexOf(",");
  const point = s.lastIndexOf(".");
  if (virgule >= 0 && point >= 0) {
    const decimal = virgule > point ? "," : ".";
    s = s.split(decimal === "," ? "." : ",").join("").replace(decimal, ".");
  } else if (virgule >= 0) {
    s = s.replace(",", ".");
  }
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}

/**
 * L'INVERSE, pour PRÉ-REMPLIR un champ texte avec un montant venu de la base : « 39.90 » → « 39,90 ».
 *
 * Les champs d'argent sont en texte (`inputMode="decimal"`), plus en `type="number"` : un champ
 * numérique lit la virgule selon la langue de l'APPAREIL, et là où elle n'est pas le séparateur
 * décimal, « 12,5 » y devient une valeur vide — donc 0, sans un mot. Mais le champ numérique
 * AFFICHAIT la virgule ; un champ texte montre ce qu'on lui donne, et la base parle avec un point.
 * Mêmes chiffres, seul le séparateur change : lireMontant relit les deux formes.
 */
export function montantEnSaisie(v) {
  return v == null ? "" : String(v).replace(".", ",");
}

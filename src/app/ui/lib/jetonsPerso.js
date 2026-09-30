/**
 * L'APERÇU DES JETONS PERSONNALISÉS — le même calcul que le serveur, dans le navigateur.
 *
 * COPIE CONFORME de `src/api/lib/customtokens.js` (seule la forme d'export change : l'API est en
 * CommonJS, l'interface en modules). L'aperçu de la fenêtre « Jetons perso » en avait sa propre
 * version, annoncée « mêmes règles que le serveur » — et restée en arrière dès que le serveur a
 * appris à calculer un montant : « {Prix|-450} » s'y affichait inchangé pendant que le document,
 * lui, soustrayait. Un aperçu qui ment est pire que pas d'aperçu : on corrige une formule juste.
 *
 * `src/api/test/jetons-perso-calcul.test.js` fait tourner les deux copies côte à côte sur les
 * mêmes formules. Modifier l'une sans l'autre le fait virer au rouge. Les POURQUOI détaillés
 * (calcul en entiers, séparateurs de milliers, « % » refusé après + ou −) sont écrits côté serveur.
 */

const pad = (n) => String(n).padStart(2, "0");

// Parse une date « JJ/MM/AAAA » ou « AAAA-MM-JJ » → Date, sinon null.
function parseDate(v) {
  const s = String(v || "").trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function shiftDate(value, days) {
  const d = parseDate(value);
  if (!d) return value;
  d.setDate(d.getDate() + days);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Calcul sur l'écriture décimale, en entiers : les flottants se trompent d'un centime.
const puissance10 = (e) => 10n ** BigInt(e);

function decimal(ecriture) {
  const t = String(ecriture).replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  const [entier, fraction = ""] = t.split(".");
  return { m: BigInt(entier + fraction), e: fraction.length };
}

function enCentimes(num, den) {
  if (den < 0n) { num = -num; den = -den; }
  const c = ((num < 0n ? -num : num) * 200n + den) / (2n * den);
  return num < 0n ? -c : c;
}

export function calculer(value, op, n, pct = false) {
  const s = String(value == null ? "" : value);
  const m = s.match(/-?\d(?:[\d\s\u00a0\u202f]*\d)?(?:[.,]\d+)?/);
  if (!m) return null;
  const brut = m[0];
  const a = decimal(brut);
  const b = decimal(n);
  if (!a || !b) return null;
  if (pct) b.e += 2;
  let num, den;
  if (op === "*") { num = a.m * b.m; den = puissance10(a.e + b.e); }
  else if (op === "/") {
    if (b.m === 0n) return null;
    num = a.m * puissance10(b.e); den = b.m * puissance10(a.e);
  } else {
    const e = Math.max(a.e, b.e);
    num = a.m * puissance10(e - a.e) + b.m * puissance10(e - b.e); den = puissance10(e);
  }
  const r = Number(enCentimes(num, den)) / 100;
  const milliers = /[\s\u00a0\u202f]/.test(brut) || s.includes("€");
  const formate = milliers ? r.toLocaleString("fr-FR") : String(r).replace(".", ",");
  return s.replace(brut, formate);
}

const REFERENCE = /\{\s*([^{}|]+?)\s*(?:\|\s*(?:([+-]?\d+(?:[.,]\d+)?)|([*/])\s*(\d+(?:[.,]\d+)?)\s*(%?))\s*)?\}/g;

// Le NOMBRE contenu dans la valeur d'un jeton (« 1 780 € » → « 1780 »), pour lire l'OPÉRANDE d'un
// calcul entre jetons ; null s'il n'y en a pas. Cf. injecterOperandes (POURQUOI côté serveur).
function nombreDe(value) {
  const m = String(value == null ? "" : value).match(/-?\d(?:[\d\s\u00a0\u202f]*\d)?(?:[.,]\d+)?/);
  return m ? m[0].replace(/[\s\u00a0\u202f]/g, "") : null;
}

// {Base|op {Opérande}} : un calcul entre deux jetons, ramené à un opérande LITTÉRAL que le calcul
// existant sait résoudre. Copie conforme du serveur (customtokens.js).
const REF_CALC = /\{\s*([^{}|]+?)\s*\|\s*([+\-*/])\s*\{\s*([^{}|]+?)\s*\}\s*\}/g;
function injecterOperandes(template, values) {
  return String(template || "").replace(REF_CALC, (tout, base, op, operande) => {
    const n = nombreDe(values[operande]);
    if (n == null) return `{${base}}`;
    if (op === "+" || op === "-") {
      const signe = (op === "-") !== n.startsWith("-") ? "-" : "+";
      return `{${base}|${signe}${n.replace(/^-/, "")}}`;
    }
    return `{${base}|${op}${n}}`;
  });
}

/** Remplit un modèle de jeton personnalisé à partir d'une table de valeurs { clé: valeur }. */
export function applyTemplate(template, values) {
  return String(injecterOperandes(template, values)).replace(REFERENCE, (tout, ref, decalage, op, facteur, pct) => {
    let v = values[ref];
    if (v == null) v = "";
    if (decalage) {
      if (parseDate(v)) {
        v = shiftDate(v, Math.trunc(Number(decalage.replace(",", "."))));
      } else {
        const r = calculer(v, "+", decalage);
        if (r != null) v = r;
      }
    } else if (op) {
      if (op === "/" && /^[0.,]+$/.test(facteur)) return tout;
      if (!parseDate(v)) {
        const r = calculer(v, op, facteur, pct === "%");
        if (r != null) v = r;
      }
    }
    return String(v);
  });
}

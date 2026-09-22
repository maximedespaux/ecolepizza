/**
 * LIRE ET ÉCRIRE UN CSV — TEL QU'EXCEL LE FAIT EN FRANCE (demandé le 2026-09-22, pour l'import).
 *
 * Du JavaScript pur, sans JSX : les tests de `src/api/test` l'importent.
 *
 * TROIS PIÈGES D'EXCEL, que les exports de l'application connaissent déjà (ExportPartenaire,
 * ResultatsQCM) et que la lecture doit connaître aussi :
 *   · le SÉPARATEUR est le point-virgule — la virgule y sert aux décimales. On le devine sur la ligne
 *     d'en-tête (point-virgule, virgule ou tabulation), hors des guillemets ;
 *   · l'ENCODAGE : « CSV UTF-8 » commence par un BOM, mais « CSV (séparateur : point-virgule) » s'écrit
 *     en Windows-1252. Lu comme de l'UTF-8, « Pâtisserie » devient « P�tisserie ». On tente l'UTF-8
 *     strict, et l'on retombe sur Windows-1252 s'il échoue ;
 *   · une cellule peut porter des guillemets, des points-virgules, des retours à la ligne (RFC 4180).
 */

/** Les octets d'un fichier → son texte, BOM retiré. */
export function decoderCsv(octets) {
  const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let texte;
  try { texte = new TextDecoder("utf-8", { fatal: true }).decode(u8); }
  catch { texte = new TextDecoder("windows-1252").decode(u8); }
  return texte.replace(/^\uFEFF/, "");
}

/** Le séparateur, deviné sur la première ligne, hors guillemets : le plus fréquent, le point-virgule à égalité. */
export function separateur(texte) {
  const premiere = String(texte).split(/\r\n|\n|\r/, 1)[0] || "";
  let hors = ""; let dans = false;
  for (const ch of premiere) { if (ch === '"') dans = !dans; else if (!dans) hors += ch; }
  const n = (c) => hors.split(c).length - 1;
  const [meilleur] = [";", ",", "\t"].map((c) => [c, n(c)]).sort((a, b) => b[1] - a[1]);
  return meilleur[1] > 0 ? meilleur[0] : ";";
}

/**
 * Le CSV → { entetes, lignes: [{ numero, cellules }] }. `numero` : la ligne du FICHIER où commence
 * l'enregistrement (l'en-tête est la ligne 1), pour que les messages désignent ce qu'on voit dans
 * Excel. Les lignes entièrement vides sont ignorées.
 */
export function lireCsv(texte, sep = separateur(texte)) {
  const t = String(texte);
  const enregistrements = [];
  let cellule = ""; let ligne = []; let dans = false; let numero = 1; let debut = 1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dans) {
      if (c === '"') {
        if (t[i + 1] === '"') { cellule += '"'; i++; } else dans = false;
      } else {
        if (c === "\n") numero++;
        cellule += c;
      }
    } else if (c === '"') {
      dans = true;
    } else if (c === sep) {
      ligne.push(cellule); cellule = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      ligne.push(cellule);
      enregistrements.push({ numero: debut, cellules: ligne });
      ligne = []; cellule = ""; numero++; debut = numero;
    } else {
      cellule += c;
    }
  }
  if (cellule !== "" || ligne.length) { ligne.push(cellule); enregistrements.push({ numero: debut, cellules: ligne }); }
  const pleins = enregistrements.filter((e) => e.cellules.some((x) => x.trim() !== ""));
  const [tete, ...lignes] = pleins;
  return { entetes: tete ? tete.cellules.map((x) => x.trim()) : [], lignes };
}

/* Une cellule pour Excel : entre guillemets dès qu'elle porte le séparateur, un guillemet ou un retour. */
const cellule = (v) => { const s = String(v ?? ""); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Le texte d'un CSV « Excel FR » : BOM (sans lui, Excel lit « Ã© »), point-virgule, fins de ligne CRLF. */
export const ecrireCsv = (lignes) => `\uFEFF${lignes.map((l) => l.map(cellule).join(";")).join("\r\n")}\r\n`;

/** Un en-tête comparable : sans casse, sans accents, sans ce qui est entre parenthèses (« Date de naissance (JJ/MM/AAAA) »). */
export const cleEntete = (h) => String(h ?? "").replace(/\([^)]*\)/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

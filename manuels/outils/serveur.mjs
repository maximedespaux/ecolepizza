/**
 * Petit serveur statique pour relire les manuels dans le navigateur.
 *
 *     node manuels/outils/serveur.mjs        puis http://localhost:4173
 *
 * Les manuels s'ouvrent aussi par un double-clic sur le .html. Ce serveur ne
 * sert qu'à la planche de relecture `_revue.html`, qui charge les manuels en
 * `fetch()` — et un `fetch()` en `file://` est refusé par le navigateur.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".md": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  let chemin = decodeURIComponent(req.url.split("?")[0]);
  if (chemin === "/") chemin = "/index.html";
  // `normalize` + retrait des « ../ » de tête : on ne sort pas de manuels/.
  const cible = join(RACINE, normalize(chemin).replace(/^(\.\.[/\\])+/, ""));
  try {
    const contenu = await readFile(cible);
    res.writeHead(200, { "content-type": TYPES[extname(cible)] || "application/octet-stream" });
    res.end(contenu);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 " + chemin);
  }
}).listen(PORT, () => console.log(`Manuels sur http://localhost:${PORT}`));

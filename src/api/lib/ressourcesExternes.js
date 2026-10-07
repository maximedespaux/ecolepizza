/**
 * ANTI-SSRF DU RENDU PDF (audit sécurité du 2026-10-07).
 *
 * LibreOffice, à qui l'on donne le HTML d'un modèle, CHARGE les ressources externes qu'il contient :
 * `<img src="http://…">`, `url(http://…)` en CSS, `@import`, `<link>`, `<object>`, `<iframe>`. Or le
 * corps d'un modèle est écrit VERBATIM par le personnel (template.controller) et n'est pas désinfecté
 * avant rendu. Un membre du bureau pouvait donc y glisser `<img src="http://169.254.169.254/…">` (les
 * métadonnées d'instance cloud) ou `file:///…` (lecture de fichier locale limitée à une image) : à
 * chaque rendu — aperçu, génération, scellement — le SERVEUR émettait la requête (SSRF aveugle vers
 * le réseau interne / le lien-local). Atteignable par un compte STAFF, pas par un stagiaire ni une
 * entreprise (toutes leurs valeurs sont échappées en amont) ; inter-organisme pour un SUPER_ADMIN.
 *
 * ON NE GARDE QUE LES RESSOURCES `data:`. Logos, cachets et signatures sont déjà stockés en data URL
 * (base64 en base) : rien de légitime n'est distant dans ces documents. Tout chargement de ressource
 * dont l'URL n'est pas une data URL est donc neutralisé AVANT le rendu. C'est la moitié « code » du
 * correctif ; l'autre est de lancer `soffice` SANS accès réseau sortant (pare-feu / namespace, côté
 * VPS) — défense en profondeur, car une version de LibreOffice pourrait suivre un autre vecteur.
 *
 * Ne touche QUE le HTML envoyé à LibreOffice (porte unique `htmlToPdf`, lib/docxpdf.js). Le HTML
 * servi au navigateur n'est pas concerné : un navigateur n'exécute rien ici (CSP `default-src 'none'`
 * côté API, iframe en bac à sable côté app) et c'est un contexte, non un rendu serveur.
 */

/* Balises dont le seul rôle est de charger/inclure une ressource externe : retirées entièrement
   (avec leur éventuel contenu pour les paires). `img` n'y est PAS : on garde la balise, on vide son
   `src` non-data (une image data: légitime doit rester). */
const BALISES_RESSOURCE = /<\s*(link|object|iframe|embed|base|frame|frameset|applet)\b[^>]*?>(?:[\s\S]*?<\s*\/\s*\1\s*>)?/gi;

/* Un attribut qui charge une ressource (`src`, `href`, `xlink:href`) dont la valeur n'est PAS une
   data URL. On garde le nom de l'attribut (backref \1) et on vide la valeur, sans supposer le type
   de guillemet (\2). `(?!\s*data:)` épargne les images/signatures/cachets légitimes en data URL. */
const ATTR_RESSOURCE = /\b(xlink:href|href|src)\s*=\s*("|')(?!\s*data:)[^"']*\2/gi;

/* CSS : `url(http://…)` / `url(file://…)` → `url()` (une data URL est épargnée) ; et toute règle
   `@import …;` retirée. Couvre les blocs <style> comme les attributs style="" en ligne. */
const CSS_URL = /url\(\s*(['"]?)(?!\s*data:)[^)'"]*\1\s*\)/gi;
const CSS_IMPORT = /@import[^;]+;/gi;

/**
 * Retire du HTML tout chargement de ressource EXTERNE (non-data) avant rendu LibreOffice.
 * Idempotent, tolérant (entrée vide/non chaîne → rendue telle quelle).
 */
function neutraliserRessourcesExternes(html) {
    if (!html || typeof html !== 'string') return html;
    return html
        .replace(BALISES_RESSOURCE, '')
        .replace(ATTR_RESSOURCE, '$1=""')
        .replace(CSS_URL, 'url()')
        .replace(CSS_IMPORT, '');
}

module.exports = { neutraliserRessourcesExternes };

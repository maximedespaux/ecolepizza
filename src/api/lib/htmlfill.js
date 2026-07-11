// Rendu des modèles construits dans l'application (éditeur intégré).
// Le corps est du HTML contenant des jetons, soit sous forme de « puce »
// (<span data-token="Clé">…</span>) produite par l'éditeur, soit en texte brut
// {Clé} (modèles convertis depuis les anciens fichiers Word). Les deux formes
// sont remplacées par la valeur réelle issue du catalogue partagé.
const { resolveTokens, RAW_TOKENS, signatureBox } = require('./tokens.js');

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const decodeEnt = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * Remplace les jetons (puces + {Clé}) du corps par les valeurs du contexte.
 * `valuesOverride` (facultatif) = table { clé: valeur } utilisée telle quelle
 * (ex. valeurs d'exemple pour l'aperçu d'un modèle, sans dossier réel).
 */
function fillHtml(bodyHtml, ctx, valuesOverride) {
    const values = valuesOverride || resolveTokens(ctx);
    const slotSigs = (ctx && ctx.slotSignatures) || {}; // { slotKey: { data, name, date, label } }
    let out = String(bodyHtml || '');

    const render = (key) => (RAW_TOKENS.has(key) ? values[key] : escapeHtml(values[key]));
    // Jeton de signature multiple « sig:<slot> » : cadre de signature (rempli si signé, sinon vide).
    const renderSlot = (key, label) => {
        const s = slotSigs[key.slice(4)];
        return signatureBox(s && s.data, label || (s && s.label) || 'Signature');
    };

    // 1) Puces de l'éditeur : <span … data-token="Clé" …>label</span>
    out = out.replace(/<span[^>]*\sdata-token="([^"]+)"[^>]*>[\s\S]*?<\/span>/g, (m, rawKey) => {
        const key = decodeEnt(rawKey);
        if (key.startsWith('sig:')) {
            const lm = m.match(/\sdata-label="([^"]*)"/);
            return renderSlot(key, lm ? decodeEnt(lm[1]) : '');
        }
        return key in values ? render(key) : '';
    });

    // 2) Jetons en texte brut {Clé} (modèles hérités). On ne remplace que les clés connues.
    for (const [key] of Object.entries(values)) {
        if (!out.includes('{' + key + '}')) continue;
        out = out.split('{' + key + '}').join(render(key));
    }
    // 2b) Signatures multiples en texte brut {sig:<slot>}.
    out = out.replace(/\{(sig:[^{}]+)\}/g, (m, key) => renderSlot(key, ''));

    // 3) Lignes vides : LibreOffice supprime un <p> vide (perte de l'espacement voulu par
    //    l'utilisateur). On y place un espace insécable pour qu'il occupe bien une ligne.
    out = out.replace(/<p\b([^>]*)>(?:\s|&nbsp;| |<br\s*\/?>)*<\/p>/gi, '<p$1> </p>');
    return out;
}

/** En-tête (papier à en-tête) construit à partir de l'organisme. */
function letterhead(org = {}) {
    const line2 = [org.address, [org.zip_code, org.town].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
    const line3 = [
        org.siret && `SIRET ${org.siret}`,
        org.nda && `Déclaration d'activité ${org.nda}`,
        org.phone, org.email,
    ].filter(Boolean).join(' · ');
    return `<header class="doc-head">
      <div class="org">${escapeHtml(org.legal_name || org.short_name || '')}</div>
      ${line2 ? `<div class="org-l">${escapeHtml(line2)}</div>` : ''}
      ${line3 ? `<div class="org-l">${escapeHtml(line3)}</div>` : ''}
    </header>`;
}

// CSS partagé par tous les rendus (corps, aperçu, bandeaux en-tête/pied). Sans la
// règle @page : chaque rendu fixe ses propres marges.
const DOC_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "Liberation Sans", Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  .doc-head { border-bottom: 1.5px solid #c0392b; padding-bottom: 8px; margin-bottom: 22px; }
  .doc-head .org { font-size: 15pt; font-weight: 700; color: #c0392b; }
  .doc-head .org-l { font-size: 8.5pt; color: #555; }
  .doc-foot { border-top: 1px solid #999; margin-top: 26px; padding-top: 8px; font-size: 8.5pt; color: #555; }
  h1 { font-size: 16pt; } h2 { font-size: 13pt; } h3 { font-size: 11.5pt; }
  p { margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #999; padding: 5px 7px; font-size: 10pt; text-align: left; }
  ul, ol { margin: 0 0 8px 18px; }
  img { max-width: 100%; }
  .doc-body { margin-top: 4px; }
  /* Saut de page manuel : LibreOffice ne respecte le saut que sur un <p> non vide,
     d'où l'espace insécable ; on annule sa hauteur pour qu'il reste invisible. */
  p.doc-pagebreak { page-break-after: always; height: 0; margin: 0; padding: 0; font-size: 0; line-height: 0; }`;

/** Document HTML complet (en-tête + corps rempli + pied de page + CSS) prêt pour le PDF. */
function renderTemplateHtml(bodyHtml, ctx, opts = {}) {
    const filled = fillHtml(bodyHtml, ctx);
    const org = ctx.org || {};
    // En-tête : personnalisé (éditeur) prioritaire, sinon papier à en-tête auto.
    let head = '';
    if (opts.headerHtml && opts.headerHtml.trim()) {
        head = `<header class="doc-head custom">${fillHtml(opts.headerHtml, ctx)}</header>`;
    } else if (opts.letterhead !== false) {
        head = letterhead(org);
    }
    const foot = (opts.footerHtml && opts.footerHtml.trim())
        ? `<footer class="doc-foot">${fillHtml(opts.footerHtml, ctx)}</footer>` : '';
    const title = escapeHtml(opts.title || '');
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
${DOC_CSS}
</style></head>
<body>${head}<main class="doc-body">${filled}</main>${foot}</body></html>`;
}

/**
 * Corps SEUL (sans en-tête ni pied), avec marges @page réservant la place des
 * bandeaux répétés sur chaque page (superposés ensuite via pdf-lib, cf. pdfcompose).
 * topMm/bottomMm = marges haut/bas ; les côtés restent à 18mm.
 */
function renderBodyOnlyDoc(bodyHtml, ctx, { topMm = 20, bottomMm = 20, sideMm = 18, values } = {}) {
    const filled = fillHtml(bodyHtml, ctx, values);
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: ${topMm}mm ${sideMm}mm ${bottomMm}mm ${sideMm}mm; }
${DOC_CSS}
</style></head>
<body><main class="doc-body">${filled}</main></body></html>`;
}

module.exports = { fillHtml, renderTemplateHtml, renderBodyOnlyDoc, letterhead, escapeHtml, DOC_CSS };

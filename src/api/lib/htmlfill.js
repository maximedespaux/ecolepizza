// Rendu des modèles construits dans l'application (éditeur intégré).
// Le corps est du HTML contenant des jetons, soit sous forme de « puce »
// (<span data-token="Clé">…</span>) produite par l'éditeur, soit en texte brut
// {Clé} (modèles convertis depuis les anciens fichiers Word). Les deux formes
// sont remplacées par la valeur réelle issue du catalogue partagé.
const { resolveTokens, RAW_TOKENS, signatureBox, expandGroupBlocks, expandListBlocks, articleRowTokens, paiementRowTokens } = require('./tokens.js');
const { resolveCustomTokens } = require('./customtokens.js');

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
    let values = valuesOverride || resolveTokens(ctx);
    // Champs « documents » (colonnes du dossier activées) : jetons field:<table.column>,
    // remplis depuis les valeurs réelles du dossier (ctx.fields). Fusionnés aux jetons
    // intégrés pour que les modèles existants continuent de fonctionner.
    if (ctx && ctx.fields) {
        values = { ...values };
        for (const [k, v] of Object.entries(ctx.fields)) {
            values['field:' + k] = v == null ? '' : (v === true ? 'Oui' : v === false ? 'Non' : String(v));
        }
    }
    // Jetons personnalisés (calculés à partir des autres) : jetons custom:<clé>.
    if (ctx && ctx.customTokens && ctx.customTokens.length) {
        values = { ...values, ...resolveCustomTokens(ctx.customTokens, values) };
    }
    const slotSigs = (ctx && ctx.slotSignatures) || {}; // { slotKey: { data, name, date, label } }
    const mainSig = (ctx && ctx.signature) || {};       // signature « stagiaire » du document
    let out = String(bodyHtml || '');
    // Jeton PERSO « par stagiaire » : son modèle CONTIENT un bloc {#Stagiaires}…{/Stagiaires}.
    // On l'inline (puce ou {custom:clé}) par son modèle AVANT le développement du bloc,
    // pour qu'il soit répété par stagiaire.
    if (ctx && Array.isArray(ctx.customTokens)) {
        const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const d of ctx.customTokens) {
            if (!d || !d.token_key || !/\{#\s*Stagiaires\s*\}/.test(d.template || '')) continue;
            const key = 'custom:' + d.token_key;
            out = out.replace(new RegExp('<span[^>]*\\sdata-token="' + esc(key) + '"[^>]*>[\\s\\S]*?<\\/span>', 'g'), d.template);
            out = out.split('{' + key + '}').join(d.template);
        }
    }
    // Blocs répétés par stagiaire du groupe : {#Stagiaires}…{/Stagiaires} (documents entreprise).
    // Les jetons personnalisés ({custom:…}) y sont recalculés PAR stagiaire.
    out = expandGroupBlocks(out, ctx && ctx.groupStagiaires, ctx && ctx.customTokens, values);
    // Lignes d'une facture : {#Articles}…{/Articles}. Même mécanisme, autre liste.
    if (ctx && Array.isArray(ctx.articles)) {
        out = expandListBlocks(out, 'Articles', ctx.articles, articleRowTokens);
    }
    // Règlements : {#Paiements}…{/Paiements} — un moyen par ligne, avec son montant.
    if (ctx && Array.isArray(ctx.payments)) {
        out = expandListBlocks(out, 'Paiements', ctx.payments, paiementRowTokens);
    }

    const render = (key) => (RAW_TOKENS.has(key) ? values[key] : escapeHtml(values[key]));
    // Un emplacement nommé désigne-t-il le stagiaire ? (Stagiaire 1…, élève, apprenant…)
    const STAG_SLOT = /(stagiaire|eleve|élève|apprenant|participant|candidat|beneficiaire|bénéficiaire)/i;
    // Jeton de signature multiple « sig:<slot> » : cadre de signature (rempli si signé, sinon vide).
    // Repli : un emplacement « stagiaire » non signé séparément reprend la signature
    // du stagiaire du document (bouton « Signer » unique) — sinon il resterait vide.
    const renderSlot = (key, label) => {
        const slot = key.slice(4);
        const s = slotSigs[slot];
        let data = s && s.data;
        if (!data && mainSig.data && STAG_SLOT.test(slot + ' ' + (label || (s && s.label) || '')))
            data = mainSig.data;
        return signatureBox(data, label || (s && s.label) || 'Signature');
    };
    // Taille du cadre de signature portée par le jeton (data-w / data-h) : on
    // remplace les dimensions par défaut du cadre rendu par celles choisies.
    const sigSizeOf = (spanHtml) => {
        const wm = /\sdata-w="(\d+)"/.exec(spanHtml);
        const hm = /\sdata-h="(\d+)"/.exec(spanHtml);
        if (!wm && !hm) return null;
        return { w: wm ? parseInt(wm[1], 10) : SIG_W, h: hm ? parseInt(hm[1], 10) : SIG_H };
    };
    // Le cadre de signature est une <img> avec attributs width/height (défaut
    // SIG_W × SIG_H) ; on remplace ces attributs par la taille choisie sur le jeton.
    const resizeSig = (html, size) => String(html)
        .replace(/\bwidth="\d+"/, `width="${size.w}"`)
        .replace(/\bheight="\d+"/, `height="${size.h}"`);

    // 1) Puces de l'éditeur : <span … data-token="Clé" …>label</span>
    out = out.replace(/<span[^>]*\sdata-token="([^"]+)"[^>]*>[\s\S]*?<\/span>/g, (m, rawKey) => {
        const key = decodeEnt(rawKey);
        const size = sigSizeOf(m);
        if (key.startsWith('sig:')) {
            const lm = m.match(/\sdata-label="([^"]*)"/);
            const box = renderSlot(key, lm ? decodeEnt(lm[1]) : '');
            return size ? resizeSig(box, size) : box;
        }
        if (!(key in values)) return '';
        const v = render(key);
        return size && RAW_TOKENS.has(key) ? resizeSig(v, size) : v;
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
    // 3b) Blocs « colonnes » de l'éditeur → colonnes FLOTTANTES (côte à côte fiable sous
    //     LibreOffice, y compris quand une colonne contient un tableau). Fait AVANT les bordures.
    out = columnsToFloats(out);
    // 4) Bordures de tableau : LibreOffice IGNORE le CSS des bordures de cellule ; on injecte
    //    le style EN LIGNE sur chaque cellule selon le style choisi (data-border).
    out = applyTableBorders(out);
    return out;
}

/**
 * Parcourt les <table>…</table> ÉQUILIBRÉS de premier niveau (gère l'imbrication) et remplace
 * chacun par `fn(attrs, inner)`. Contrairement à une regex non gourmande — qui s'arrête au
 * PREMIER </table> et casse dès qu'un tableau en contient un autre — ce scanner compte les
 * ouvertures/fermetures pour trouver la vraie fermeture. Indispensable depuis qu'une colonne
 * peut contenir un tableau (bloc « deux colonnes »).
 */
function mapOuterTables(html, fn) {
    const s = String(html || '');
    const low = s.toLowerCase();
    let out = '', idx = 0;
    while (idx < s.length) {
        const open = low.indexOf('<table', idx);
        if (open === -1) { out += s.slice(idx); break; }
        const gt = s.indexOf('>', open);
        if (gt === -1) { out += s.slice(idx); break; }
        out += s.slice(idx, open);
        const attrs = s.slice(open + 6, gt); // ce qui suit « <table »
        let depth = 1, j = gt + 1, closeStart = -1, closeEnd = -1;
        while (j < s.length && depth > 0) {
            const no = low.indexOf('<table', j);
            const nc = low.indexOf('</table', j);
            if (nc === -1) break;
            if (no !== -1 && no < nc) { depth++; j = no + 6; }
            else { depth--; if (depth === 0) { closeStart = nc; closeEnd = s.indexOf('>', nc) + 1; } j = nc + 7; }
        }
        if (closeStart === -1) { out += s.slice(open); break; } // non équilibré : laissé tel quel
        out += fn(attrs, s.slice(gt + 1, closeStart));
        idx = closeEnd;
    }
    return out;
}

/**
 * Applique `transform(attrs, inner)` à CHAQUE tableau, à tous les niveaux. Les tableaux
 * imbriqués sont traités récursivement puis mis de côté (jetons \x00…\x00) : `transform` ne
 * voit donc QUE les cellules/colonnes DIRECTES du tableau courant — jamais celles d'un tableau
 * contenu (un tableau de totaux dans une colonne garde ainsi ses bordures et sa largeur).
 */
function processTables(html, transform) {
    return mapOuterTables(html, (attrs, inner) => {
        const stash = [];
        const flat = mapOuterTables(inner, (a2, i2) => {
            stash.push(processTables(`<table${a2}>${i2}</table>`, transform));
            return '\x00T' + (stash.length - 1) + '\x00';
        });
        return transform(attrs, flat).replace(/\x00T(\d+)\x00/g, (m, n) => stash[+n]);
    });
}

// Applique le style de bordure d'un tableau (data-border : solid|dashed|none, défaut solid)
// en INLINE sur chaque cellule (seule forme respectée par LibreOffice) + un padding.
function applyTableBorders(html) {
    return processTables(html, (attrs, inner) => {
        const bm = /data-border\s*=\s*["']?(solid|dashed|none)/i.exec(attrs);
        const kind = bm ? bm[1].toLowerCase() : 'solid';
        const border = kind === 'none' ? 'none' : kind === 'dashed' ? '1px dashed #999' : '1px solid #999';
        const cell = `padding:5px 7px;border:${border};`;
        const newInner = inner.replace(/<(td|th)\b([^>]*)>/gi, (cm, tag, cattrs) => {
            if (/\bstyle\s*=\s*["']/.test(cattrs)) {
                return `<${tag}${cattrs.replace(/\bstyle\s*=\s*(["'])/i, (sm, q) => `style=${q}${cell}`)}>`;
            }
            return `<${tag}${cattrs} style="${cell}">`;
        });
        return `<table${attrs}>${newInner}</table>`;
    });
}

/** Index juste après le <div> ouvert en `open` : renvoie { innerStart, innerEnd, end } de la
 *  balise appariée (compte l'imbrication des <div>), ou null si déséquilibré. */
function matchDiv(s, low, open) {
    const gt = s.indexOf('>', open);
    if (gt === -1) return null;
    let depth = 1, j = gt + 1;
    while (j < s.length && depth > 0) {
        const no = low.indexOf('<div', j);
        const nc = low.indexOf('</div', j);
        if (nc === -1) return null;
        if (no !== -1 && no < nc) { depth++; j = no + 4; }
        else { depth--; if (depth === 0) return { innerStart: gt + 1, innerEnd: nc, end: s.indexOf('>', nc) + 1 }; j = nc + 5; }
    }
    return null;
}

/** Prochain <div dont la balise ouvrante satisfait `re`, à partir de `from` (-1 sinon). */
function findDiv(s, low, from, re) {
    let i = from;
    while (i < s.length) {
        const o = low.indexOf('<div', i);
        if (o === -1) return -1;
        const gt = s.indexOf('>', o);
        if (gt === -1) return -1;
        if (re.test(s.slice(o, gt + 1))) return o;
        i = o + 4;
    }
    return -1;
}

/**
 * Convertit les blocs « colonnes » de l'éditeur (<div data-cols>…<div data-col>…</div>…</div>)
 * en colonnes FLOTTANTES (float:left).
 *
 * POURQUOI PAS UN TABLEAU DE MISE EN PAGE. C'était le premier choix — une cellule par colonne.
 * Mais LibreOffice place mal un TABLEAU imbriqué dans la DERNIÈRE cellule d'une ligne dès que la
 * cellule voisine fait plusieurs lignes : le tableau (les totaux, typiquement) « retombe » SOUS
 * la colonne au lieu de rester à côté. Reproduit au rendu, indépendamment du CSS (colgroup,
 * table-layout:fixed, cellules enveloppées… rien n'y faisait). Les colonnes flottantes n'ont pas
 * ce défaut : texte, tableau ou image tiennent côte à côte quel que soit le côté choisi.
 *
 * `box-sizing:border-box` (DOC_CSS) fait que la gouttière (padding-right) n'élargit pas la
 * colonne : les largeurs en % somment donc bien à 100 %. Récursif (colonnes dans une colonne).
 */
function columnsToFloats(html) {
    const s = String(html || '');
    const low = s.toLowerCase();
    const RE_COLS = /\bdata-cols\b/;
    let out = '', idx = 0;
    while (idx < s.length) {
        const open = findDiv(s, low, idx, RE_COLS);
        if (open === -1) { out += s.slice(idx); break; }
        const m = matchDiv(s, low, open);
        if (!m) { out += s.slice(idx); break; }
        out += s.slice(idx, open) + buildFloatRow(s.slice(m.innerStart, m.innerEnd));
        idx = m.end;
    }
    return out;
}

function buildFloatRow(inner) {
    const s = String(inner);
    const low = s.toLowerCase();
    const RE_COL = /\bdata-col\b/; // \b : ne matche pas « data-cols »
    const cols = [];
    let idx = 0;
    while (idx < s.length) {
        const open = findDiv(s, low, idx, RE_COL);
        if (open === -1) break;
        const m = matchDiv(s, low, open);
        if (!m) break;
        const tag = s.slice(open, s.indexOf('>', open) + 1);
        const wm = /data-w\s*=\s*"(\d+(?:\.\d+)?)"/i.exec(tag);
        cols.push({ w: wm ? parseFloat(wm[1]) : null, html: columnsToFloats(s.slice(m.innerStart, m.innerEnd)) });
        idx = m.end;
    }
    if (!cols.length) return '';
    const n = cols.length;
    const equal = Math.floor((100 / n) * 10) / 10; // arrondi bas : jamais > 100 % au total
    const boxes = cols.map((c, i) => {
        const w = c.w != null ? c.w : equal;
        const gut = i < n - 1 ? ';padding-right:12px' : ''; // gouttière sauf après la dernière
        return `<div class="col-box" style="float:left;width:${w}%${gut}">${c.html}</div>`;
    }).join('');
    // overflow:hidden = la rangée englobe ses colonnes flottées ; le clear final relance le flux
    // normal (le contenu suivant passe DESSOUS, jamais à côté).
    return `<div class="cols-row" style="width:100%;overflow:hidden;margin:8px 0">${boxes}<div style="clear:both"></div></div>`;
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
  body { font-family: "Liberation Sans", Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.35; }
  .doc-head { border-bottom: 1.5px solid #c0392b; padding-bottom: 8px; margin-bottom: 22px; }
  .doc-head .org { font-size: 15pt; font-weight: 700; color: #c0392b; }
  .doc-head .org-l { font-size: 8.5pt; color: #555; }
  .doc-foot { border-top: 1px solid #999; margin-top: 26px; padding-top: 8px; font-size: 8.5pt; color: #555; }
  h1 { font-size: 16pt; } h2 { font-size: 13pt; } h3 { font-size: 11.5pt; }
  p { margin: 0 0 5px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #999; padding: 5px 7px; font-size: 10pt; text-align: left; }
  ul, ol { margin: 0 0 8px 18px; }
  img { max-width: 100%; }
  .doc-body { margin-top: 4px; }
  /* Saut de page manuel : LibreOffice ne respecte le saut que sur un <p> non vide,
     d'où l'espace insécable ; on annule sa hauteur pour qu'il reste invisible. */
  p.doc-pagebreak { page-break-after: always; height: 0; margin: 0; padding: 0; font-size: 0; line-height: 0; }`;

/**
 * Donne aux tableaux la largeur que la feuille de style leur promet déjà.
 *
 * LIBREOFFICE IGNORE `width: 100%` EN CSS SUR UN TABLEAU. Il n'honore que l'attribut HTML.
 * Résultat : `DOC_CSS` déclare depuis toujours des tableaux pleine largeur, et le PDF sortait
 * des tableaux serrés sur la moitié gauche de la page, colonnes écrasées — « Qté » revenait à
 * la ligne en « Q / té ». La règle CSS n'était pas fausse, elle n'était simplement jamais lue.
 *
 * Vérifié en rendant les deux formes côte à côte : seule celle portant l'attribut occupe la
 * largeur utile. On ne pouvait pas le savoir en relisant le code — c'est une propriété du
 * moteur de conversion, pas du nôtre.
 *
 * ON N'ÉCRASE PAS UNE LARGEUR EXPLICITE. Un tableau auquel l'organisme a donné sa propre
 * largeur dans l'éditeur la garde : la valeur par défaut ne doit pas défaire un choix.
 *
 * Posé ici plutôt que dans chaque générateur de tableau : la règle vaut pour TOUS les tableaux
 * d'un document — ceux du code comme ceux dessinés à la main dans l'éditeur.
 */
/** Retire toute largeur fixe (attribut width réel — pas data-width — et width:…px en style) des
 *  attributs d'un <table>. `(?<!-)` protège `data-width`. */
function sansLargeur(attrs) {
    return attrs
        .replace(/(?<!-)\bwidth\s*=\s*"[^"]*"/i, '')
        .replace(/style\s*=\s*"([^"]*)"/i, (s, st) => {
            const x = st.replace(/(?:min-|max-)?width\s*:\s*[^;]+;?/gi, '').trim();
            return x ? `style="${x}"` : '';
        })
        .replace(/\s+/g, ' ').trim();
}

/** Le tableau porte-t-il une largeur EXPLICITE de l'auteur (%, cm, mm, em) ? On la respecte —
 *  contrairement à une largeur en PIXELS, que l'éditeur fige et qu'on veut pouvoir étirer. */
function largeurExplicite(attrs) {
    const w = /(?<!-)\bwidth\s*=\s*"([^"]*)"/i.exec(attrs);
    if (w && /(%|cm|mm|em)/i.test(w[1])) return true;
    const s = /style\s*=\s*"([^"]*)"/i.exec(attrs);
    if (s && /\bwidth\s*:\s*[\d.]+\s*(%|cm|mm|em)/i.test(s[1])) return true;
    return false;
}

/** Convertit les largeurs de colonnes en PIXELS (ProseMirror : <col style="width:101px">) en
 *  POURCENTAGES, pour qu'elles s'adaptent à la largeur de la table au lieu de la figer. */
function colsEnPourcent(inner) {
    const cols = [...inner.matchAll(/<col\b[^>]*>/gi)].map((c) => c[0]);
    const px = cols.map((c) => {
        const m = /width\s*:\s*([\d.]+)px/i.exec(c) || /\bwidth\s*=\s*"?([\d.]+)(?:px)?"?/i.exec(c);
        return m ? parseFloat(m[1]) : null;
    });
    if (!cols.length || !px.every((v) => v != null)) return inner;
    const tot = px.reduce((s, v) => s + v, 0) || 1;
    let i = 0;
    return inner.replace(/<col\b[^>]*>/gi, () => `<col width="${Math.round((px[i++] / tot) * 1000) / 10}%">`);
}

function largeurTables(html) {
    return processTables(html, (attrs, inner) => {
        const mode = (/data-width\s*=\s*["']?(auto|half)/i.exec(attrs) || [])[1];

        // « auto » = ajusté au contenu : colonnes libres, cellules non coupées (c'est ce qui
        // évitait « Quantité » coupé en « Quanti / té »). LibreOffice ne suit pas table-layout,
        // d'où le white-space:nowrap injecté.
        if (/auto/i.test(mode || '')) {
            const body = inner
                .replace(/<col\b[^>]*>/gi, '<col>')
                .replace(/<(td|th)\b([^>]*)>/gi, (cm, tag, cattrs) => (
                    /\bstyle\s*=\s*["']/.test(cattrs)
                        ? `<${tag}${cattrs.replace(/\bstyle\s*=\s*(["'])/i, (sm, q) => `style=${q}white-space:nowrap;`)}>`
                        : `<${tag}${cattrs} style="white-space:nowrap">`
                ));
            return `<table ${sansLargeur(attrs)}>${body}</table>`;
        }
        // « half » = compact, aligné à droite (encadré de totaux…). L'alignement est RÉINJECTÉ à
        // chaque rendu, car l'éditeur ne conserve que les attributs data-*.
        if (/half/i.test(mode || '')) {
            return `<table ${sansLargeur(attrs)} align="right" width="45%">${colsEnPourcent(inner)}</table>`;
        }
        // Une largeur EXPLICITE de l'auteur (40 %, 8 cm…) est respectée telle quelle.
        if (largeurExplicite(attrs)) return `<table${attrs}>${inner}</table>`;
        // PLEINE LARGEUR (défaut) : le tableau doit occuper 100%. L'ÉDITEUR (ProseMirror) fige
        // pourtant des largeurs de colonnes en PIXELS qui, seules, empêchent l'étirement — c'est
        // ce qui faisait qu'un tableau « pleine largeur » ne prenait pas toute la largeur. On les
        // convertit en pourcentages (proportions gardées) et on force width="100%".
        return `<table ${sansLargeur(attrs)} width="100%">${colsEnPourcent(inner)}</table>`;
    });
}

/** Document HTML complet (en-tête + corps rempli + pied de page + CSS) prêt pour le PDF. */
function renderTemplateHtml(bodyHtml, ctx, opts = {}) {
    const filled = largeurTables(fillHtml(bodyHtml, ctx));
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
    const filled = largeurTables(fillHtml(bodyHtml, ctx, values));
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: ${topMm}mm ${sideMm}mm ${bottomMm}mm ${sideMm}mm; }
${DOC_CSS}
</style></head>
<body><main class="doc-body">${filled}</main></body></html>`;
}

module.exports = { fillHtml, renderTemplateHtml, renderBodyOnlyDoc, letterhead, escapeHtml, DOC_CSS };

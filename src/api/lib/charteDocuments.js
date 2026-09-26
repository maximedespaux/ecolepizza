/**
 * LA CHARTE DES DOCUMENTS DE L'ÉCOLE — la mise en forme du devis RS7404 retravaillé, étendue aux autres
 * modèles (demandé le 2026-09-26 ; choix de l'école le même jour : le bleu de la charte pour tous les
 * titres, le texte en 9 pt — 8 pt pour les CGV —, et la police SEULE pour les modèles imposés).
 *
 * SEULE LA FORME CHANGE. Aucun mot, aucune puce, aucun bloc n'est ajouté, retiré ou déplacé — hormis les
 * sauts de page qu'un profil nomme — et deux contrôles le prouvent sur chaque modèle : `contenu` (le texte,
 * les jetons, les images, les blocs) et `charpente` (tableaux, colonnes, listes, sauts de page).
 *
 *   · Arial partout, écrit sur chaque passage ;
 *   · titre du document : 12 pt, gras, bleu ; titre de section : taille du texte + 1, gras, souligné (les
 *     deux-points hors du soulignement), bleu ; sous-titre : gras, bleu ; UN seul bleu, rgb(84, 141, 212) ;
 *   · texte : 9 pt (CGV : 8 pt), noir — le ROUGE des avertissements reste rouge, les renvois bleus
 *     (« Voir l'annexe 2 ») prennent le bleu de la charte ;
 *   · petites mentions (astérisques) : 1 pt de moins ; mention de version : 8 pt, gris ; pied : 8 pt ;
 *   · modèles imposés (AGEFICE, certificat de réalisation, jury, factures) : la police seulement.
 *
 * LE RÔLE D'UN BLOC SE LIT, IL NE SE DEVINE PAS : un titre est court, gras ou souligné ou coloré, centré
 * ou numéroté ; un avertissement, rouge, finit par un point ; un libellé va jusqu'aux deux-points. Ce qui
 * échappe aux règles (un titre aligné à gauche, l'intitulé de la formation en titre de programme) se
 * nomme dans le PROFIL du modèle (`surcharges`), à côté de l'outil qui l'applique :
 * database/tools/harmoniser-modeles.js.
 *
 * Pas de DOMParser : il n'existe pas sous Node, et un sérialiseur réécrirait les entités et les attributs
 * à sa façon. D'où un analyseur minimal qui garde chaque attribut et chaque texte tels qu'ils sont écrits :
 * relu puis réécrit sans changement, un modèle ressort identique à l'octet.
 *
 * Tests : test/charte-documents.test.js.
 */

/* ══ 1. LECTURE ET RÉÉCRITURE EXACTES DU HTML ═══════════════════════════════════════════════════════════
 * Le HTML d'un modèle, tel que l'éditeur (Tiptap) l'enregistre. Relu puis réécrit sans changement, un
 * modèle ressort identique à l'octet (vérifié sur les seize modèles de production) : seuls les nœuds que
 * la charte touche (`modifie`) voient leurs attributs réécrits.
 */
const VIDES = new Set(['br', 'img', 'hr', 'col', 'input', 'meta', 'link', 'wbr']);

function attributs(brut) {
    const liste = [];
    const re = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
    let m;
    while ((m = re.exec(brut))) liste.push([m[1], m[2] === undefined ? null : m[2]]);
    return liste;
}

function lire(html) {
    const racineNoeud = { tag: '#racine', attrs: [], enfants: [] };
    const pile = [racineNoeud];
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
        const parent = pile[pile.length - 1];
        if (m[4] !== undefined) { parent.enfants.push({ texte: m[4] }); continue; }
        const tag = m[2].toLowerCase();
        if (m[1]) {
            // Fermeture : on remonte jusqu'à la balise ouverte correspondante.
            for (let i = pile.length - 1; i > 0; i--) {
                if (pile[i].tag === tag) { pile.length = i; break; }
            }
            continue;
        }
        let brut = m[3];
        const auto = /\/\s*$/.test(brut);
        if (auto) brut = brut.replace(/\/\s*$/, '');
        const noeud = { tag, attrs: attributs(brut), enfants: [], auto, brutAttrs: m[3] };
        parent.enfants.push(noeud);
        if (!VIDES.has(tag) && !auto) pile.push(noeud);
    }
    return racineNoeud;
}

function ecrireAttrs(n) {
    if (!n.modifie) return n.brutAttrs;
    return n.attrs.map(([k, v]) => (v === null ? ` ${k}` : ` ${k}=${v}`)).join('') + (n.auto ? '/' : '');
}

function ecrire(n) {
    if (n.texte !== undefined) return n.texte;
    if (n.tag === '#racine') return n.enfants.map(ecrire).join('');
    const ouvre = `<${n.tag}${ecrireAttrs(n)}>`;
    if (VIDES.has(n.tag) || n.auto) return ouvre;
    return ouvre + n.enfants.map(ecrire).join('') + `</${n.tag}>`;
}

function attr(n, nom) {
    const a = n.attrs && n.attrs.find(([k]) => k.toLowerCase() === nom);
    if (!a || a[1] === null) return a ? '' : null;
    return a[1].replace(/^["']|["']$/g, '');
}
function poserAttr(n, nom, valeur) {
    const i = n.attrs.findIndex(([k]) => k.toLowerCase() === nom);
    const v = `"${valeur}"`;
    if (valeur === null) { if (i >= 0) n.attrs.splice(i, 1); } else if (i >= 0) n.attrs[i] = [n.attrs[i][0], v]; else n.attrs.push([nom, v]);
    n.modifie = true;
}
/** Le style en ligne, en paires ordonnées [propriété, valeur]. */
/* `&quot;` porte un point-virgule : `font-family: &quot;Noto Sans&quot;, sans-serif` se coupait en
   morceaux. On décode les guillemets avant de découper, et on les réencode à l'écriture. */
function styles(n) {
    const s = attr(n, 'style');
    if (!s) return [];
    return s.replace(/&quot;/g, '"').split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
        const i = x.indexOf(':');
        return [x.slice(0, i).trim().toLowerCase(), x.slice(i + 1).trim()];
    });
}
function styleTexte(paires) {
    return paires.map(([k, v]) => `${k}: ${String(v).replace(/"/g, '&quot;')};`).join(' ');
}
function poserStyles(n, paires) {
    poserAttr(n, 'style', paires.length ? styleTexte(paires) : null);
}
const A = { lire, ecrire, attr, poserAttr, styles, poserStyles, styleTexte, VIDES };

/* ══ 2. CE QU'UN MODÈLE DIT, BLOC PAR BLOC ══════════════════════════════════════════════════════════════
 * Pour chaque paragraphe (ou titre, ou cellule sans paragraphe),
 * ses « passages » de texte avec le style effectif de chacun — taille, couleur, gras, souligné,
 * italique, police — hérité de toutes les balises qui l'entourent. C'est sur cette lecture que la
 * charte décide du rôle d'un bloc (titre, texte, mention…).
 */
const BLOCS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const CONTENEURS = new Set(['td', 'th', 'li', 'div', 'blockquote']);
const TAILLE_TITRE = { h1: 16, h2: 13, h3: 11.5, h4: 11, h5: 11, h6: 11 }; // DOC_CSS (htmlfill.js)

function pt(v) {
    const m = /([\d.]+)\s*(pt|px)/.exec(v || '');
    if (!m) return null;
    return m[2] === 'px' ? Math.round(Number(m[1]) * 0.75 * 100) / 100 : Number(m[1]);
}
function couleur(v) { return (v || '').replace(/\s+/g, '').toLowerCase() || null; }

/** Hérite le style d'un nœud : balises de mise en forme et `style` en ligne. */
function herite(base, n) {
    const s = { ...base };
    if (n.tag === 'strong' || n.tag === 'b') s.gras = true;
    if (n.tag === 'em' || n.tag === 'i') s.italique = true;
    if (n.tag === 'u') s.souligne = true;
    if (n.tag === 's') s.barre = true;
    if (n.tag === 'a') s.lien = true;
    if (n.tag === 'sup') s.exposant = true;
    if (/^h[1-6]$/.test(n.tag)) { s.gras = true; if (s.taille == null) s.tailleTitre = TAILLE_TITRE[n.tag]; }
    if (n.tag === 'th') s.gras = true;
    for (const [k, v] of A.styles(n)) {
        if (k === 'font-size' && pt(v) != null) s.taille = pt(v);
        if (k === 'color') s.couleur = couleur(v);
        if (k === 'font-family') s.police = v;
        if (k === 'font-weight' && /bold|[6-9]00/.test(v)) s.gras = true;
        if (k === 'font-style' && /italic/.test(v)) s.italique = true;
        if (k === 'text-decoration' && /underline/.test(v)) s.souligne = true;
    }
    return s;
}

/** Les blocs d'un arbre, dans l'ordre, avec leurs passages. */
function blocs(arbre) {
    const out = [];
    function visite(n, style, chemin, blocCourant) {
        if (n.texte !== undefined) {
            if (blocCourant) blocCourant.passages.push({ texte: n.texte, style, noeud: n });
            return;
        }
        const estJeton = n.tag === 'span' && /\bdoc-token\b/.test(A.attr(n, 'class') || '');
        if (estJeton) {
            if (blocCourant) blocCourant.passages.push({ jeton: A.attr(n, 'data-token'), libelle: A.attr(n, 'data-label'), style, noeud: n });
            return;
        }
        const s = herite(style, n);
        let bloc = blocCourant;
        const ici = [...chemin, n.tag];
        // Un paragraphe/titre ouvre un bloc ; une cellule ou une puce qui porte DIRECTEMENT du texte aussi.
        if (BLOCS.has(n.tag) || (CONTENEURS.has(n.tag) && n.enfants.some((e) => e.texte !== undefined && e.texte.trim()))) {
            bloc = { tag: n.tag, noeud: n, chemin: ici, passages: [], style: s };
            out.push(bloc);
        }
        if (n.tag === 'img' && bloc) bloc.passages.push({ image: true, style: s, noeud: n });
        if (n.tag === 'br' && bloc) bloc.passages.push({ saut: true, style: s, noeud: n });
        for (const e of n.enfants || []) visite(e, s, ici, bloc);
    }
    for (const e of arbre.enfants) visite(e, {}, [], null);
    for (const b of out) {
        b.texte = b.passages.map((p) => (p.jeton ? `{${p.jeton}}` : p.saut ? '\n' : p.texte || '')).join('')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        b.align = (A.styles(b.noeud).find(([k]) => k === 'text-align') || [])[1] || null;
        b.interligne = (A.styles(b.noeud).find(([k]) => k === 'line-height') || [])[1] || null;
        b.dansTableau = b.chemin.includes('td') || b.chemin.includes('th');
        b.dansListe = b.chemin.includes('li');
    }
    return out;
}

/** Les passages « visibles » d'un bloc : du texte non blanc, ou un jeton. */
function visibles(b) {
    return b.passages.filter((p) => p.jeton || (p.texte && p.texte.replace(/&nbsp;/g, ' ').trim()));
}
const L = { blocs, visibles, herite, pt, couleur };

/* ══ 3. LA CHARTE ═══════════════════════════════════════════════════════════════════════════════════════ */

const BLEU = 'rgb(84, 141, 212)';
const NOIR = 'rgb(0, 0, 0)';
const GRIS = 'rgb(128, 128, 128)';
const ARIAL = 'Arial, sans-serif';

const rvb = (c) => { const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(c || ''); return m ? m.slice(1).map(Number) : null; };
function famille(c) {
    const v = rvb(c);
    if (!v) return null;
    const [r, g, b] = v;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 24) return r < 70 ? 'noir' : 'gris';
    if (r > 150 && g < 110 && b < 110) return 'rouge';
    if (r > 200 && g > 120 && b < 80) return 'orange';
    if (b > r + 30) return 'bleu';
    return 'autre';
}

/* ── Aplatir un bloc en passages marqués, et le réécrire ─────────────────────────────────────── */
function aplatir(bloc) {
    const passages = [];
    (function visite(n, m) {
        for (const e of n.enfants) {
            if (e.texte !== undefined) { passages.push({ texte: e.texte, m }); continue; }
            if (e.tag === 'br') { passages.push({ brut: A.ecrire(e), neutre: true, m }); continue; }
            if (e.tag === 'img') { passages.push({ brut: A.ecrire(e), image: true, m }); continue; }
            if (e.tag === 'span' && /\bdoc-token\b/.test(A.attr(e, 'class') || '')) {
                passages.push({ brut: A.ecrire(e), jeton: A.attr(e, 'data-token'), m });
                continue;
            }
            const m2 = { ...m, style: m.style.slice() };
            if (e.tag === 'strong' || e.tag === 'b') m2.gras = true;
            else if (e.tag === 'em' || e.tag === 'i') m2.italique = true;
            else if (e.tag === 'u') m2.souligne = true;
            else if (e.tag === 's' || e.tag === 'strike') m2.barre = true;
            else if (e.tag === 'a') m2.lien = `<a${e.brutAttrs}>`;
            else if (e.tag === 'span') {
                for (const [k, v] of A.styles(e)) {
                    const i = m2.style.findIndex(([x]) => x === k);
                    if (i >= 0) m2.style[i] = [k, v]; else m2.style.push([k, v]);
                }
            } else throw new Error(`balise inattendue dans un bloc : <${e.tag}>`);
            visite(e, m2);
        }
    })(bloc, { gras: false, italique: false, souligne: false, barre: false, lien: null, style: [] });
    return passages;
}

const ORDRE = ['lien', 'style', 'gras', 'italique', 'souligne', 'barre'];
const BALISE = { gras: 'strong', italique: 'em', souligne: 'u', barre: 's' };
function valeur(m, k) {
    if (k === 'style') return m.style.length ? A.styleTexte(m.style) : null;
    return m[k] || null;
}
function ouvrir([k, v]) {
    if (k === 'lien') return v;
    if (k === 'style') return `<span style="${v}">`;
    return `<${BALISE[k]}>`;
}
function fermer([k]) {
    if (k === 'lien') return '</a>';
    if (k === 'style') return '</span>';
    return `</${BALISE[k]}>`;
}
/* Réécrit les passages en gardant ouvertes les marques communes à deux passages voisins — la même
   forme que produit l'éditeur, qui relira ce HTML sans rien perdre. */
function ecrirePassages(passages) {
    let out = '';
    const pile = [];
    for (const p of passages) {
        if (!p.neutre) {
            const voulues = ORDRE.map((k) => [k, valeur(p.m, k)]).filter(([, v]) => v);
            let i = 0;
            while (i < pile.length && i < voulues.length && pile[i][0] === voulues[i][0] && pile[i][1] === voulues[i][1]) i++;
            while (pile.length > i) out += fermer(pile.pop());
            for (let j = i; j < voulues.length; j++) { out += ouvrir(voulues[j]); pile.push(voulues[j]); }
        }
        out += p.brut !== undefined ? p.brut : p.texte;
    }
    while (pile.length) out += fermer(pile.pop());
    return out;
}

/* ── Styles d'un passage ─────────────────────────────────────────────────────────────────────── */
function lireStyle(m, k) { const x = m.style.find(([y]) => y === k); return x ? x[1] : null; }
function poser(m, k, v) {
    const i = m.style.findIndex(([y]) => y === k);
    if (v === null) { if (i >= 0) m.style.splice(i, 1); return; }
    if (i >= 0) m.style[i] = [k, v]; else m.style.push([k, v]);
}
/** Les trois propriétés de la charte dans l'ordre de l'éditeur : couleur, police, taille. */
function ordonner(m) {
    const tete = ['color', 'font-family', 'font-size'];
    m.style.sort((a, b) => {
        const ia = tete.indexOf(a[0]), ib = tete.indexOf(b[0]);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}
function police(m) {
    const actuelle = lireStyle(m, 'font-family') || '';
    // Les émojis (cases cochées…) gardent leur police de secours.
    poser(m, 'font-family', /Color Emoji/i.test(actuelle) ? `${ARIAL}, "Noto Color Emoji"` : ARIAL);
}

const nettoie = (t) => String(t || '').replace(/&nbsp;/g, ' ').replace(/ /g, ' ');
const plein = (p) => !p.neutre && (p.jeton || p.image || (p.texte !== undefined && nettoie(p.texte).trim()));
function texteDe(passages) {
    return nettoie(passages.map((p) => (p.jeton ? `{${p.jeton}}` : p.texte || '')).join('')).replace(/\s+/g, ' ').trim();
}
const taille = (m, defaut) => { const v = L.pt(lireStyle(m, 'font-size')); return v == null ? defaut : v; };
const colore = (p) => ['rouge', 'bleu', 'orange'].includes(famille(lireStyle(p.m, 'color')));
const marque = (p) => p.texte !== undefined && (p.m.gras || p.m.souligne || ['rouge', 'bleu'].includes(famille(lireStyle(p.m, 'color'))));
/** Les lignes d'un bloc : les passages entre deux sauts de ligne. */
function lignes(passages) {
    const out = [[]];
    for (const p of passages) { if (p.neutre) out.push([]); else out[out.length - 1].push(p); }
    return out;
}
/** Une ligne qui est un titre de section : grasse, soulignée ou colorée, courte, finie par deux-points. */
function ligneTitre(ligne) {
    const txt = ligne.filter(plein);
    if (!txt.length || txt.some((p) => p.jeton || p.image)) return false;
    const t = texteDe(ligne);
    return t.length <= 80 && /:\s*$/.test(t) && txt.every((p) => p.m.gras) && (txt.every((p) => p.m.souligne) || txt.every(colore));
}

/* ── Rôle d'un bloc ──────────────────────────────────────────────────────────────────────────── */
function roleDe(b, passages, ctx) {
    const vis = passages.filter(plein);
    if (!vis.length) return 'vide';
    const t = texteDe(passages);
    if (/^V\s?\d+(\.\d+)?\s.*mise à jour/i.test(t) || /^version mise à jour/i.test(t)) return 'version';
    if (b.dansTableau) return 'cellule';
    const texte = vis.filter((p) => !p.image);
    if (!texte.length) return 'vide';
    const titreBalise = /^h[1-6]$/.test(b.tag);
    const gras = texte.every((p) => p.m.gras || titreBalise);
    const souligne = texte.every((p) => p.m.souligne);
    const tousColores = texte.every(colore);
    const deuxPoints = /:\s*$/.test(t);
    const jeton = texte.some((p) => p.jeton);
    /* Un titre ne finit pas par un point : « Cette formation est financée … Formation. », en rouge et en
       titre h2, est un AVERTISSEMENT, pas un titre de section. */
    const court = t.length <= 120 && !/[.!?]\s*$/.test(t.replace(/^[IVXLC\d]+\.\s*/, ''));
    const centre = b.align === 'center';
    const majuscules = t === t.toUpperCase() && /[A-ZÀ-Ý]{4}/.test(t);
    const grand = texte.some((p) => taille(p.m, 11) >= 14);
    const numerote = /^((\d+|[IVXLC]+)[.)]|Article\s+\d+(er)?\b)/i.test(t);
    // La première ligne d'un bloc (avant un saut de ligne) : « PROPOSITION COMMERCIALE » puis « (Offre…) ».
    const premiere = lignes(passages).find((l) => l.some(plein)) || [];
    const tPremiere = texteDe(premiere);
    const premiereTitre = premiere.filter(plein).every((p) => p.m.gras && !p.jeton) && tPremiere === tPremiere.toUpperCase() && /[A-ZÀ-Ý]{4}/.test(tPremiere);
    /* Le titre du document : le premier h1, ou un bloc centré, gras ou coloré, en capitales ou en grand
       (14 pt et plus). Les h1 SUIVANTS sont des titres de section — le contrat d'hygiène titre ainsi
       ses articles. */
    if (court && centre && grand) return 'titreDocument';
    if (court && b.tag === 'h1' && !ctx.titreDocumentVu) return 'titreDocument';
    if (court && b.tag === 'h1') return 'titre';
    if (court && centre && (gras || tousColores) && majuscules) return 'titreDocument';
    // La suite d'un titre de document sur la ligne d'après : « DE L'ÉCOLE PIZZAIOLO … », sous « CONDITIONS GÉNÉRALES… ».
    if (court && centre && ctx.precedent === 'titreDocument' && gras && tousColores) return 'titreDocument';
    if (centre && premiereTitre && tPremiere.length <= 80) return 'titreDocument';
    if (court && gras && souligne) return 'titre';
    /* Gras et coloré, sans soulignement : un titre de section dans un document qui n'en souligne aucun
       (les CGV) ; un SOUS-titre dans un document dont les sections sont soulignées (« Prérequis », dans
       l'annexe 2 de la convention, sous « Annexe 2 : … » souligné). */
    if (court && gras && tousColores) return ctx.titresSoulignes ? 'sousTitre' : 'titre';
    if (court && souligne && deuxPoints && !jeton) return 'titre';
    if (court && gras && deuxPoints && !jeton) return 'titre';
    if (court && gras && numerote && !jeton) return 'titre';           // « 1. Photographies »
    /* Un sous-titre : court, coloré en rouge, ou gras. Une ligne BLEUE non grasse est un renvoi
       (« Voir l'annexe 2 ») : du texte, qui garde son bleu. Une PHRASE (finie par un point) n'en est pas
       un, si courte soit-elle : un avertissement rouge de moins de 80 caractères devenait un sous-titre bleu. */
    const rouges = texte.every((p) => famille(lireStyle(p.m, 'color')) === 'rouge');
    const phrase = /[.!?]\s*$/.test(t);
    if (t.length <= 80 && !jeton && !phrase && ((tousColores && (gras || rouges)) || (titreBalise && gras))) return 'sousTitre';
    // Une petite mention sous un titre : « Déclaration d'activité enregistrée… » en 8 pt, dans un texte en 10.
    if (texte.every((p) => taille(p.m, 11) <= 8) && ctx.corpsOrigine > 8.5) return 'petit';
    /* Une information MISE EN AVANT : centrée, en gras ou en grand (12 pt) — la formation et ses dates
       dans l'invitation. Elle garde un point de plus que le texte, et son gras. */
    if (centre && (gras || texte.some((p) => taille(p.m, 11) >= 12))) return 'miseEnAvant';
    const lib = lectureLibelle(passages);
    if (lib) return lib;
    if (/^\*/.test(t)) return 'petit';
    return 'corps';
}

/** « Libellé : valeur » — un libellé marqué jusqu'aux deux-points, puis la valeur. 'titreTexte' quand
    un saut de ligne suit le libellé (un titre et son texte dans le même paragraphe), 'libelle' sinon. */
function lectureLibelle(passages) {
    const premiere = lignes(passages).find((l) => l.some(plein)) || [];
    const pleins = premiere.filter(plein);
    let i = 0;
    let vu = '';
    while (i < pleins.length && !pleins[i].jeton && (marque(pleins[i]) || /^[\s:]*$/.test(nettoie(pleins[i].texte)))) {
        vu += nettoie(pleins[i].texte);
        i++;
        if (/:/.test(vu)) break;
    }
    if (!i || !/[^\s:]/.test(vu) || vu.split(':')[0].trim().length > 60) return null;
    /* Une ligne ENTIÈREMENT rouge est un avertissement (« Virement : … – IBAN : … », dans le devis) : elle
       garde son rouge. Un libellé rouge suivi d'une valeur noire (« Durée et lieu : », dans l'annexe de
       la convention) est un libellé, qui prend le bleu. */
    if (pleins.every((p) => famille(lireStyle(p.m, 'color')) === 'rouge')) return null;
    const suite = i < pleins.length && !pleins[i].jeton ? nettoie(pleins[i].texte) : '';
    if (!/:/.test(vu) && !/^\s*:/.test(suite)) return null;
    const valeurSurLaLigne = /:\s*\S/.test(vu) || i < pleins.length;
    if (valeurSurLaLigne) return 'libelle';
    // Rien après le libellé sur sa ligne : un titre, suivi de son texte sur la ligne d'après.
    return lignes(passages).filter((l) => l.some(plein)).length > 1 ? 'titreTexte' : null;
}

/* ── Couper un passage aux deux-points : le libellé, la ponctuation, le reste ────────────────────── */
const DEUX_POINTS = /^([\s\S]*?)((?:\s|&nbsp;| )*:(?:\s|&nbsp;| )*)([\s\S]*)$/;
function couper(p) {
    const m = DEUX_POINTS.exec(p.texte || '');
    if (!m) return null;
    const morceau = (texte) => ({ texte, m: { ...p.m, style: p.m.style.slice() } });
    return { avant: m[1] ? morceau(m[1]) : null, ponctuation: morceau(m[2]), apres: m[3] ? morceau(m[3]) : null };
}

/* ── Appliquer la charte à un bloc ───────────────────────────────────────────────────────────── */
/** Rend les passages restylés — ceux d'un libellé ou d'un titre coupés aux deux-points. */
function restyler(b, passages, role, ctx) {
    const corps = b.zoneInfo && ctx.zoneInfo ? ctx.zoneInfo : ctx.corps;
    function texteCourant(m) {
        const f = famille(lireStyle(m, 'color'));
        if (f === 'rouge') return;                        // avertissement : reste rouge
        poser(m, 'color', f === 'bleu' ? BLEU : NOIR);    // renvoi : le bleu de la charte
    }
    const S = {
        titreDoc: (m) => { poser(m, 'font-size', `${ctx.titreDocument}pt`); poser(m, 'color', BLEU); m.gras = true; m.souligne = false; },
        accompagnement: (m) => { poser(m, 'font-size', `${corps + 1}pt`); poser(m, 'color', NOIR); m.gras = false; },
        titre: (m) => { poser(m, 'font-size', `${corps + 1}pt`); poser(m, 'color', BLEU); m.gras = true; m.souligne = true; },
        ponctuationTitre: (m) => { poser(m, 'font-size', `${corps + 1}pt`); poser(m, 'color', BLEU); m.gras = true; m.souligne = false; },
        sousTitre: (m) => { poser(m, 'font-size', `${corps}pt`); poser(m, 'color', BLEU); m.gras = true; m.souligne = false; },
        libelle: (m) => { poser(m, 'font-size', `${corps}pt`); poser(m, 'color', BLEU); m.gras = true; m.souligne = true; },
        ponctuationLibelle: (m) => { poser(m, 'font-size', `${corps}pt`); poser(m, 'color', BLEU); m.gras = true; m.souligne = false; },
        valeur: (m) => { poser(m, 'font-size', `${corps}pt`); texteCourant(m); m.souligne = false; },
        corps: (m) => { poser(m, 'font-size', `${corps}pt`); texteCourant(m); },
        miseEnAvant: (m) => { poser(m, 'font-size', `${corps + 1}pt`); texteCourant(m); },
        petit: (m) => { poser(m, 'font-size', `${corps - 1}pt`); texteCourant(m); },
        version: (m) => { poser(m, 'font-size', '8pt'); poser(m, 'color', GRIS); m.gras = false; },
        cellule: (m) => { poser(m, 'font-size', `${ctx.cellule || corps}pt`); texteCourant(m); },
        tel: () => {},
    };

    // 1. Le sous-rôle de chaque passage, et les coupes aux deux-points.
    const sortie = [];
    const pousser = (p, sr) => { sortie.push({ ...p, sr }); };
    /** Un libellé (ou un titre) jusqu'aux premiers deux-points de `ligne`, puis la valeur. */
    function libelleDans(ligne, srLib, srPonct, srValeur) {
        let fini = false;
        for (const p of ligne) {
            if (fini || p.jeton || p.image) { pousser(p, srValeur); fini = true; continue; }
            if (!/:/.test(nettoie(p.texte))) { pousser(p, srLib); continue; }
            const c = couper(p);
            if (c.avant) pousser(c.avant, srLib);
            pousser(c.ponctuation, srPonct);
            if (c.apres) pousser(c.apres, srValeur);
            fini = true;
        }
    }
    const parLigne = lignes(passages);
    const neutres = passages.filter((p) => p.neutre);
    /* Un titre de document SANS AUCUN gras (« Invitation à la formation » en 16 pt, le titre d'un cadre
       dont la cellule d'en-tête fait le gras) est un titre tout entier. Seul un titre qui MÊLE gras et
       maigre a un accompagnement : « PROPOSITION COMMERCIALE », puis « (Offre…) ». */
    const unGras = passages.some((p) => plein(p) && p.m.gras);
    const toutGras = !unGras || passages.filter(plein).every((p) => p.m.gras) || b.tag === 'h1';
    let premiereVue = false;
    parLigne.forEach((ligne, k) => {
        if (k > 0) pousser(neutres[k - 1], 'tel');
        const pleine = ligne.some(plein);
        const premiere = pleine && !premiereVue;
        if (pleine) premiereVue = true;
        if (role === 'couverture' || role === 'vide') { for (const p of ligne) pousser(p, 'tel'); return; }
        if (role === 'titreDocument') { for (const p of ligne) pousser(p, p.m.gras || toutGras ? 'titreDoc' : 'accompagnement'); return; }
        if (role === 'titre') {
            // Les deux-points de fin, hors du soulignement : « Objectifs pédagogiques : ».
            const derniers = ligne.filter((p) => p.texte !== undefined && nettoie(p.texte).trim());
            const dernier = derniers[derniers.length - 1];
            for (const p of ligne) {
                const c = p === dernier && /:\s*$/.test(nettoie(p.texte)) ? couper(p) : null;
                if (c && !c.apres) { if (c.avant) pousser(c.avant, 'titre'); pousser(c.ponctuation, 'ponctuationTitre'); } else pousser(p, 'titre');
            }
            return;
        }
        if ((role === 'libelle' || role === 'titreTexte') && premiere) {
            if (role === 'titreTexte') libelleDans(ligne, 'titre', 'ponctuationTitre', 'valeur');
            else libelleDans(ligne, 'libelle', 'ponctuationLibelle', 'valeur');
            return;
        }
        if (['corps', 'libelle', 'titreTexte'].includes(role) && ligneTitre(ligne)) {
            // Un titre plus loin dans le paragraphe, après un saut de ligne : « Délai d'accès : ».
            libelleDans(ligne, 'titre', 'ponctuationTitre', 'valeur');
            return;
        }
        const sr = { sousTitre: 'sousTitre', petit: 'petit', version: 'version', cellule: 'cellule', miseEnAvant: 'miseEnAvant' }[role] || 'corps';
        for (const p of ligne) pousser(p, sr);
    });

    // 2. Le style de chaque passage.
    for (const p of sortie) {
        if (p.neutre) continue;
        p.soulignait = p.m.souligne;
        const m = p.m = { ...p.m, style: p.m.style.slice() };
        police(m);
        S[p.sr](m);
        ordonner(m);
    }
    return rognerSoulignements(sortie);
}

/* ── Le soulignement s'arrête aux lettres ─────────────────────────────────────────────────────────
   « _Intitulé de la formation » : l'espace de tête, qui n'était pas souligné, l'est devenu en entrant
   dans le libellé ; « Financement CPF :_ » : l'espace insécable d'après les deux-points, pris dans le
   titre. Dans une suite soulignée qui porte du texte, les blancs des deux bouts sortent du
   soulignement. Une suite faite de blancs SEULS, déjà soulignée à l'origine, est une ligne à remplir
   (« Signature : ______ ») : elle reste telle quelle. */
const BLANCS_TETE = /^((?:\s|&nbsp;| )+)([\s\S]*)$/;
const BLANCS_QUEUE = /^([\s\S]*?)((?:\s|&nbsp;| )+)$/;
const blanc = (p) => p.texte !== undefined && !nettoie(p.texte).trim();
function rognerSoulignements(sortie) {
    const out = [];
    let suite = [];
    const copie = (p, texte, souligne) => ({ ...p, texte, m: { ...p.m, style: p.m.style.slice(), souligne } });
    function vider() {
        if (!suite.length) return;
        const touchable = suite.every((p) => p.sr !== 'tel');
        const porteTexte = suite.some((p) => !blanc(p));
        if (!touchable) { out.push(...suite); suite = []; return; }
        if (!porteTexte) {
            // Des blancs seuls : soulignés par la charte, on les rend ; soulignés à l'origine, on les garde.
            for (const p of suite) out.push(p.soulignait ? p : copie(p, p.texte, false));
            suite = [];
            return;
        }
        let debut = 0;
        let fin = suite.length - 1;
        const tete = [];
        const queue = [];
        while (blanc(suite[debut])) tete.push(copie(suite[debut], suite[debut].texte, false)), debut++;
        while (blanc(suite[fin])) queue.unshift(copie(suite[fin], suite[fin].texte, false)), fin--;
        const milieu = suite.slice(debut, fin + 1);
        const premier = milieu[0];
        if (premier.texte !== undefined) {
            const m = BLANCS_TETE.exec(premier.texte);
            if (m) { tete.push(copie(premier, m[1], false)); milieu[0] = copie(premier, m[2], true); }
        }
        const dernier = milieu[milieu.length - 1];
        if (dernier.texte !== undefined) {
            const m = BLANCS_QUEUE.exec(dernier.texte);
            if (m) { milieu[milieu.length - 1] = copie(dernier, m[1], true); queue.unshift(copie(dernier, m[2], false)); }
        }
        out.push(...tete, ...milieu, ...queue);
        suite = [];
    }
    for (const p of sortie) {
        if (!p.neutre && p.m.souligne) { suite.push(p); continue; }
        vider();
        out.push(p);
    }
    vider();
    return out;
}

/* ── Le document entier ───────────────────────────────────────────────────────────────────────── */
/** La taille du texte courant d'origine : celle qui porte le plus de caractères, hors tableaux. */
function corpsDominant(lus) {
    const poids = {};
    for (const b of lus) {
        if (b.dansTableau) continue;
        for (const p of b.passages) {
            if (!p.texte) continue;
            const t = p.style.taille || p.style.tailleTitre || 11;
            poids[t] = (poids[t] || 0) + nettoie(p.texte).trim().length;
        }
    }
    const top = Object.entries(poids).sort((a, b) => b[1] - a[1])[0];
    return top ? Number(top[0]) : 11;
}
/** Le document souligne-t-il ses titres de section ? (gras ET soulignés, hors tableaux) */
function titresSoulignes(lus) {
    return lus.some((b) => {
        if (b.dansTableau) return false;
        const vis = b.passages.filter((p) => p.texte && nettoie(p.texte).trim());
        return vis.length && vis.every((p) => p.style.gras && p.style.souligne) && nettoie(vis.map((p) => p.texte).join('')).trim().length <= 120;
    });
}
const saut = (b) => /\bdoc-pagebreak\b/.test(A.attr(b.noeud, 'class') || '');
function retirerNoeud(n, cible) {
    for (let i = 0; i < (n.enfants || []).length; i++) {
        if (n.enfants[i] === cible) { n.enfants.splice(i, 1); return true; }
        if (retirerNoeud(n.enfants[i], cible)) return true;
    }
    return false;
}
/* Un saut de page posé pour l'ANCIENNE taille du texte peut, à la nouvelle, laisser une page presque
   vide (les CGV : trois lignes sur la page 3 ; le contrat d'hygiène : trois puces seules sur la
   page 2). Le profil nomme le bloc qui SUIT chacun de ces sauts ; ceux-là seuls sont retirés, et le
   contrôle vérifie que rien d'autre n'a bougé (`sansSauts`). */
function retirerSauts(arbre, profil) {
    if (!profil.sautsRetires || !profil.sautsRetires.length) return 0;
    const lus = L.blocs(arbre);
    let n = 0;
    lus.forEach((b, i) => {
        if (!saut(b)) return;
        const suivant = lus.slice(i + 1).find((x) => !saut(x) && L.visibles(x).length);
        const t = suivant ? suivant.texte.replace(/\s+/g, ' ').trim() : '';
        if (suivant && profil.sautsRetires.some((re) => re.test(t)) && retirerNoeud(arbre, b.noeud)) n++;
    });
    return n;
}
/* Et l'inverse : un titre de section tombé seul en bas de page, son texte sur la suivante (« Financement
   par le Compte Personnel de Formation », au bas de la page 1 des CGV). Le saut se pose AVANT le bloc
   nommé, s'il est au premier niveau du modèle — jamais dans un tableau ni une liste. */
const SAUT = () => ({ tag: 'p', attrs: [['class', '"doc-pagebreak"'], ['contenteditable', '"false"']], enfants: [{ texte: '&nbsp;' }],
    auto: false, brutAttrs: ' class="doc-pagebreak" contenteditable="false"' });
function ajouterSauts(arbre, profil) {
    let n = 0;
    for (const re of profil.sautsAjoutes || []) {
        const b = L.blocs(arbre).find((x) => !saut(x) && re.test(x.texte.replace(/\s+/g, ' ').trim()));
        const i = b ? arbre.enfants.indexOf(b.noeud) : -1;
        if (i < 0) continue;
        arbre.enfants.splice(i, 0, SAUT());
        n++;
    }
    return n;
}
/** Le modèle d'origine, avec les seuls sauts de page que le profil retire ou ajoute : la référence du contrôle. */
function sansSauts(html, profil) {
    const arbre = A.lire(html);
    return retirerSauts(arbre, profil) + ajouterSauts(arbre, profil) ? A.ecrire(arbre) : html;
}

/**
 * Harmonise le corps d'un modèle. `profil` : { type: 'charte' | 'police', corps, interligne, titreDocument,
 * zoneInfo, cellule, couverture, surcharges: [{ si: RegExp (texte du bloc), gras?, role }], sautsRetires:
 * [RegExp (bloc qui suit le saut)], sautsAjoutes: [RegExp (bloc devant lequel poser un saut)] }.
 * Rend { html, roles, sautsRetires, sautsAjoutes } — `roles` dit quel bloc a pris quel rôle.
 */
function harmoniser(html, profil) {
    const arbre = A.lire(html);
    const sautsRetires = retirerSauts(arbre, profil);
    const sautsAjoutes = ajouterSauts(arbre, profil);
    const lus = L.blocs(arbre);
    const ctx = { corps: profil.corps || 9, titreDocument: profil.titreDocument || 12, zoneInfo: profil.zoneInfo, cellule: profil.cellule,
        corpsOrigine: corpsDominant(lus), titresSoulignes: titresSoulignes(lus) };
    const roles = [];
    // La couverture d'un devis : tout ce qui précède le premier saut de page garde sa taille.
    const finCouverture = profil.couverture ? lus.findIndex(saut) : -1;
    let zone = 'avant';
    lus.forEach((b, i) => {
        if (saut(b)) return;
        const passages = aplatir(b.noeud);
        let role;
        if (i < finCouverture) role = 'couverture';
        else if (profil.type === 'police') role = 'vide';
        else {
            role = roleDe(b, passages, ctx);
            const t = texteDe(passages);
            /* `gras` départage deux blocs au même texte : l'intitulé de la formation en gras 12 pt, titre du
               programme dans l'annexe 2, et le même intitulé en maigre dans l'article 1. */
            const toutGras = passages.filter(plein).every((p) => p.m.gras);
            for (const s of profil.surcharges || []) {
                if (!s.si.test(t) || (s.gras !== undefined && s.gras !== toutGras)) continue;
                role = s.role;
                break;
            }
        }
        if (role === 'titreDocument') ctx.titreDocumentVu = true;
        if (role !== 'vide') ctx.precedent = role;
        // La zone d'informations d'un devis : du titre de la page à la première section.
        if (role === 'titreDocument' && zone === 'avant') zone = 'info';
        else if ((role === 'titre' || role === 'titreTexte') && zone === 'info') zone = 'apres';
        b.zoneInfo = zone === 'info' && role !== 'titreDocument';
        roles.push({ i, role, texte: texteDe(passages).slice(0, 70), zoneInfo: b.zoneInfo });
        // Un bloc titre (h1…h6) devenu paragraphe garde le gras que la balise lui donnait.
        const enParagraphe = /^h[1-6]$/.test(b.noeud.tag) && ['corps', 'libelle', 'petit', 'titreTexte'].includes(role);
        if (enParagraphe) for (const p of passages) p.m = { ...p.m, gras: true };
        const restyles = restyler(b, passages, role, ctx);
        b.noeud.enfants = [{ texte: ecrirePassages(restyles) }];
        if (enParagraphe) b.noeud.tag = 'p';
        // L'interligne du texte courant, comme le devis ; les tableaux gardent le leur.
        if (profil.interligne && profil.type !== 'police' && !b.dansTableau && !['vide', 'couverture'].includes(role)) {
            const st = A.styles(b.noeud);
            const k = st.findIndex(([x]) => x === 'line-height');
            if (k >= 0) st[k] = ['line-height', String(profil.interligne)]; else st.unshift(['line-height', String(profil.interligne)]);
            A.poserStyles(b.noeud, st);
        }
    });
    return { html: A.ecrire(arbre), roles, sautsRetires, sautsAjoutes };
}

/** Le pied de page : 8 pt, Arial, sans couleur imposée — celui du devis RS7404. Un modèle imposé
    (profil « police ») garde le sien, en Arial. */
function harmoniserPied(html, profil) {
    if (!html) return { html, roles: [] };
    const policeSeule = profil && profil.type === 'police';
    const arbre = A.lire(html);
    for (const b of L.blocs(arbre)) {
        const passages = aplatir(b.noeud);
        for (const p of passages) {
            if (p.neutre) continue;
            const m = p.m = { ...p.m, style: p.m.style.slice() };
            police(m);
            if (!policeSeule) {
                poser(m, 'font-size', '8pt');
                poser(m, 'color', null);
                m.gras = false;
            }
            ordonner(m);
        }
        b.noeud.enfants = [{ texte: ecrirePassages(passages) }];
    }
    return { html: A.ecrire(arbre), roles: [] };
}

/* ── Contrôle : le CONTENU (texte, jetons, blocs) ne bouge pas ─────────────────────────────────── */
function contenu(html) {
    const arbre = A.lire(html);
    const morceaux = [];
    const BLOCS_C = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'tr', 'table', 'br', 'li']);
    (function v(n) {
        for (const e of n.enfants || []) {
            if (e.texte !== undefined) { morceaux.push(e.texte.replace(/&nbsp;/g, ' ')); continue; }
            if (e.tag === 'span' && /\bdoc-token\b/.test(A.attr(e, 'class') || '')) {
                morceaux.push(`{${[A.attr(e, 'data-token'), A.attr(e, 'data-label'), A.attr(e, 'data-w') || '', A.attr(e, 'data-h') || ''].join('|')}}`);
                continue;
            }
            if (e.tag === 'img') { morceaux.push(`[img ${A.attr(e, 'src')} ${A.attr(e, 'width')}x${A.attr(e, 'height')}]`); continue; }
            if (e.tag === 'hr') { morceaux.push('[hr]'); continue; }
            const bloc = BLOCS_C.has(e.tag);
            if (bloc) morceaux.push('¶');
            v(e);
            if (bloc) morceaux.push('¶');
        }
    })(arbre);
    return morceaux.join('').replace(/¶+/g, '¶').replace(/^¶|¶$/g, '');
}
/** La charpente : blocs, tableaux, colonnes, sauts de page — tout sauf l'inline et les styles. */
function charpente(html) {
    const arbre = A.lire(html);
    const out = [];
    const INLINE = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'br', 'img']);
    const nom = (t) => (t === 'p' || /^h[1-6]$/.test(t) ? 'p|h' : t);
    (function v(n) {
        for (const e of n.enfants || []) {
            if (e.texte !== undefined || INLINE.has(e.tag)) continue;
            const garde = e.attrs.filter(([k]) => k !== 'style').map(([k, x]) => `${k}=${x}`).join(' ');
            out.push(`<${nom(e.tag)} ${garde}>`);
            v(e);
            out.push(`</${nom(e.tag)}>`);
        }
    })(arbre);
    return out.join('');
}

module.exports = { harmoniser, harmoniserPied, sansSauts, contenu, charpente, famille, BLEU, NOIR, GRIS, ARIAL, lire, ecrire, blocs };

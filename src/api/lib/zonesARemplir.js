/**
 * LES ZONES À REMPLIR PAR LE STAGIAIRE — demandé le 2026-09-28 : l'attestation sur l'honneur
 * d'expérience professionnelle porte des pointillés (« Entreprise / structure : ……… », « Période
 * d'exercice : du ……… au ……… ») où le stagiaire écrit ce que l'école ne connaît pas et ne stocke nulle
 * part. En ligne, personne ne pouvait les remplir : l'attestation se signait avec ses blancs.
 *
 * UNE ZONE EST UNE PUCE DU MODÈLE : `saisie:<type>:<identifiant>`, son libellé en `data-label` —
 * posée par l'éditeur (bouton « Zone à remplir »). Deux types :
 *   · `texte` : une ligne, MAX_TEXTE caractères au plus ;
 *   · `date`  : une date du calendrier (AAAA-MM-JJ), imprimée JJ/MM/AAAA.
 * Tant qu'elle n'est pas remplie, la zone s'imprime en POINTILLÉS, comme avant : un document
 * imprimé vierge se remplit toujours au stylo.
 *
 * DÉCIDÉ PAR L'ÉCOLE LE 2026-09-28 : le stagiaire remplit, ou l'école pour lui (il signe au bureau,
 * ou donne ses réponses au téléphone) ; TOUTES les zones sont obligatoires avant de signer — une
 * attestation aux blancs ne prouve rien. Une fois signé, le document fige ses réponses.
 *
 * Les réponses vivent sur le document (`generated_document.saisies`, migration 185), CHIFFRÉES comme
 * sa signature : c'est le parcours professionnel de quelqu'un.
 */
const { encrypt, decrypt } = require('./crypto.js');

const PREFIXE = 'saisie:';
const TYPES = ['texte', 'date'];
const MAX_TEXTE = 200;

const decoder = (s) => String(s == null ? '' : s)
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `saisie:date:debut` → { type: 'date', id: 'debut' } ; autre chose → null. */
function lireCle(cle) {
    const m = /^saisie:([a-z]+):([a-z0-9-]{1,60})$/.exec(String(cle || ''));
    return m && TYPES.includes(m[1]) ? { type: m[1], id: m[2] } : null;
}

/**
 * LES ZONES D'UN MODÈLE, dans l'ordre du document (corps, en-tête, pied donnés dans cet ordre) —
 * [{ cle, type, libelle }]. Une même zone posée deux fois (au corps et au pied, par exemple) ne se
 * demande qu'une fois, sous son premier libellé.
 */
function zonesDuHtml(...parties) {
    const zones = [];
    const vues = new Set();
    for (const html of parties) {
        for (const [balise] of String(html || '').matchAll(/<span\b[^>]*\sdata-token="saisie:[^"]*"[^>]*>/g)) {
            const cle = decoder((/\sdata-token="([^"]*)"/.exec(balise) || [])[1]);
            const lu = lireCle(cle);
            if (!lu || vues.has(cle)) continue;
            vues.add(cle);
            const libelle = decoder((/\sdata-label="([^"]*)"/.exec(balise) || [])[1]).trim() || lu.id;
            zones.push({ cle, type: lu.type, libelle });
        }
    }
    return zones;
}

/** Une date AAAA-MM-JJ qui existe au calendrier (le 31/02 n'en est pas une). */
function dateValide(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/**
 * LES RÉPONSES REÇUES, mises au propre → { valeurs, erreurs }. Seules les zones du modèle comptent
 * (une clé inconnue est ignorée : le modèle a pu changer) ; une réponse vide n'est pas gardée ; un
 * texte tient sur une ligne (les sauts de ligne deviennent des espaces).
 */
function normaliserSaisies(zones, recues) {
    const valeurs = {};
    const erreurs = [];
    const source = recues && typeof recues === 'object' ? recues : {};
    for (const z of zones) {
        const brut = source[z.cle];
        if (brut == null) continue;
        let v = String(brut).replace(/\s+/g, ' ').trim();
        if (!v) continue;
        if (z.type === 'date') {
            if (!dateValide(v)) { erreurs.push(`« ${z.libelle} » : date invalide.`); continue; }
        } else if (v.length > MAX_TEXTE) {
            erreurs.push(`« ${z.libelle} » : ${MAX_TEXTE} caractères au plus (${v.length}).`);
            continue;
        }
        valeurs[z.cle] = v;
    }
    return { valeurs, erreurs };
}

/** Les zones sans réponse. */
const zonesManquantes = (zones, saisies) => zones.filter((z) => !(saisies && saisies[z.cle]));

/** « Entreprise / structure », « Du » et « Au » — pour les messages. */
function libellesEnClair(zones) {
    const l = zones.map((z) => `« ${z.libelle} »`);
    return l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : (l[0] || '');
}

/** Ce que la zone imprime : la réponse (échappée, dates en JJ/MM/AAAA), sinon des pointillés à remplir au stylo. */
function rendreZone(cle, saisies) {
    const lu = lireCle(cle);
    if (!lu) return '';
    const v = saisies && saisies[cle];
    if (!v) return lu.type === 'date' ? '........ / ........ / ............' : '.'.repeat(60);
    if (lu.type === 'date' && dateValide(v)) return v.split('-').reverse().join('/');
    return echapper(v);
}

/** Les réponses d'un document, telles que stockées (JSON chiffré) → objet ; illisible ou vide → {}. */
function lireSaisies(stocke) {
    if (!stocke) return {};
    try {
        const o = JSON.parse(decrypt(stocke));
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch { return {}; }
}
const ecrireSaisies = (valeurs) => encrypt(JSON.stringify(valeurs || {}));

module.exports = { PREFIXE, TYPES, MAX_TEXTE, lireCle, zonesDuHtml, normaliserSaisies, zonesManquantes, libellesEnClair, rendreZone, lireSaisies, ecrireSaisies, dateValide };

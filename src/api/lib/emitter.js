/**
 * L'entité émettrice d'une facture — le vendeur sous lequel elle sort.
 *
 * Un seul endroit pour trois questions qui, éparpillées, divergeraient : quelle entité applique
 * une facture, sous quel numéro, et avec quelle identité. La facture et la vente en caisse
 * appellent toutes deux ces helpers, plutôt que d'en réimplémenter chacune sa version.
 *
 * TOUT EST OPTIONNEL AU DEGRÉ PRÈS DE LA MIGRATION. Tant que la 113 n'est pas jouée, la table
 * n'existe pas : chaque fonction retombe silencieusement sur l'organisme, comportement d'avant.
 */

const isMissingSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

/** Charge une entité émettrice par son id (bornée à l'organisme). null si absente / non migrée. */
async function loadEmitter(conn, orgId, profileId) {
    if (!profileId) return null;
    try {
        const [[row]] = await conn.query(
            'SELECT * FROM billing_profile WHERE id = ? AND organization_id = ?', [profileId, orgId]);
        return row || null;
    } catch (e) {
        if (isMissingSchema(e)) return null;
        throw e;
    }
}

/** L'émettrice par défaut de l'organisme, ou null (aucune, ou migration non jouée). */
async function defaultEmitter(conn, orgId) {
    try {
        const [[row]] = await conn.query(
            'SELECT * FROM billing_profile WHERE organization_id = ? AND is_default = 1 LIMIT 1', [orgId]);
        return row || null;
    } catch (e) {
        if (isMissingSchema(e)) return null;
        throw e;
    }
}

/**
 * Résout l'émettrice à appliquer : celle demandée si elle appartient à l'organisme, sinon la
 * défaut, sinon rien (l'appelant retombe alors sur l'organisme).
 */
async function resolveEmitter(conn, orgId, requestedId) {
    if (requestedId) {
        const asked = await loadEmitter(conn, orgId, requestedId);
        if (asked) return asked;
    }
    return defaultEmitter(conn, orgId);
}

/**
 * Rend un numéro de facture selon le GABARIT de l'entité.
 *
 * Le numéro n'était modelable que par son préfixe. `number_format` compose la forme entière avec
 * des jetons, pour qu'un organisme organise ses numéros comme il l'entend :
 *
 *   {PREFIX}   le préfixe de l'entité        {YYYY} année 4 chiffres   {YY} année 2 chiffres
 *   {MM} mois   {DD} jour                      {SEQ} séquence (4 chiffres)   {SEQ:n} sur n chiffres
 *
 * « TXT.{YYYY}.901.{SEQ:4} » → « TXT.2026.901.0001 ». Format vide/NULL = la forme historique.
 *
 * On N'INVENTE RIEN hors des jetons : tout le reste est du texte littéral, recopié tel quel. Un
 * jeton inconnu resterait donc visible dans le numéro — préférable à une substitution silencieuse
 * qui masquerait une faute de frappe.
 */
function formatNumber(emitter, seq, date = new Date()) {
    const fmt = (emitter.number_format && String(emitter.number_format).trim()) || '{PREFIX}-{YYYY}-{SEQ}';
    const y = date.getFullYear();
    const pad = (n, w) => String(n).padStart(w, '0');
    return fmt
        .replace(/\{PREFIX\}/g, emitter.invoice_prefix || 'F')
        .replace(/\{YYYY\}/g, String(y))
        .replace(/\{YY\}/g, pad(y % 100, 2))
        .replace(/\{MM\}/g, pad(date.getMonth() + 1, 2))
        .replace(/\{DD\}/g, pad(date.getDate(), 2))
        .replace(/\{SEQ(?::(\d+))?\}/g, (_, w) => pad(seq, w ? Number(w) : 4));
}

/**
 * Numéro suivant pour une émettrice, et incrément de SON compteur.
 *
 * Chaque entité tient une séquence CONTINUE (la loi l'exige) : on n'entremêle pas les compteurs.
 * La forme suit le gabarit de l'entité (cf. formatNumber) ; {SEQ} y est la seule part variable,
 * ce qui garantit l'unicité — la validation à l'enregistrement refuse un format qui l'omet.
 *
 * L'incrément est fait AVANT d'insérer la facture : deux ventes simultanées ne doivent pas lire
 * le même compteur. On rend le numéro déjà réservé.
 */
async function nextNumberForEmitter(conn, emitter) {
    const n = Number(emitter.next_number) || 1;
    const number = formatNumber(emitter, n, new Date());
    await conn.query('UPDATE billing_profile SET next_number = ? WHERE id = ?', [n + 1, emitter.id]);
    return number;
}

/**
 * La SÉQUENCE que porte un numéro, relue par le gabarit de l'entité : l'inverse de `formatNumber`.
 *
 * Le gabarit devient un motif — chaque jeton par ce qu'il imprime, le reste recopié tel quel —
 * plutôt que de recomposer le numéro avec la date du document : une date relue de la base peut
 * avoir glissé d'un fuseau, et un numéro qui porte {MM} ou {DD} ne se reconnaîtrait plus.
 * `null` quand le numéro ne suit pas ce gabarit : une autre entité, un gabarit changé depuis, un
 * ancien compteur. Dans le doute, on ne rend rien.
 */
function sequenceDuNumero(emitter, number) {
    const fmt = (emitter.number_format && String(emitter.number_format).trim()) || '{PREFIX}-{YYYY}-{SEQ}';
    const litteral = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const motif = fmt.split(/(\{PREFIX\}|\{YYYY\}|\{YY\}|\{MM\}|\{DD\}|\{SEQ(?::\d+)?\})/).map((part) => {
        if (part === '{PREFIX}') return litteral(emitter.invoice_prefix || 'F');
        if (part === '{YYYY}') return '\\d{4}';
        if (part === '{YY}' || part === '{MM}' || part === '{DD}') return '\\d{2}';
        if (/^\{SEQ/.test(part)) return '(\\d+)';
        return litteral(part);
    }).join('');
    const m = new RegExp(`^${motif}$`).exec(String(number || ''));
    return m && m[1] !== undefined ? Number(m[1]) : null;
}

/**
 * REND UN NUMÉRO À SA SÉQUENCE — quand un document est supprimé (demandé le 2026-09-30 : « j'ai créé
 * FACT-2026-0008, je le supprime : le suivant devrait être encore FACT-2026-0008 »).
 *
 * Le compteur d'une entité ne savait qu'avancer : un brouillon créé puis supprimé laissait un trou
 * dans une numérotation que la loi veut CONTINUE. Il recule d'un cran, à une condition : le numéro
 * rendu est le DERNIER donné par cette entité. Rendre le 0007 quand le 0008 existe ferait ressortir
 * un second 0008.
 *
 * C'est l'entité qui a numéroté le document qui recule (`profileId`), jamais l'entité par défaut :
 * chacune tient sa séquence. L'UPDATE est gardé par la valeur lue — une facture créée entre-temps
 * a déjà pris le numéro suivant, et le compteur ne bouge plus.
 *
 * Rend `{ rendu: true }`, ou `{ rendu: false, raison }` : 'sans_entite', 'autre_gabarit' (le numéro
 * ne suit pas le format de l'entité) ou 'pas_le_dernier'.
 */
async function rendreLeNumero(conn, orgId, profileId, number) {
    const emitter = await loadEmitter(conn, orgId, profileId);
    if (!emitter) return { rendu: false, raison: 'sans_entite' };
    const seq = sequenceDuNumero(emitter, number);
    if (seq === null) return { rendu: false, raison: 'autre_gabarit' };
    const prochain = Number(emitter.next_number) || 1;
    if (seq !== prochain - 1) return { rendu: false, raison: 'pas_le_dernier' };
    const [r] = await conn.query(
        'UPDATE billing_profile SET next_number = ? WHERE id = ? AND organization_id = ? AND next_number = ?',
        [seq, emitter.id, orgId, prochain]
    );
    return r && r.affectedRows === 1 ? { rendu: true } : { rendu: false, raison: 'pas_le_dernier' };
}

module.exports = {
    loadEmitter, defaultEmitter, resolveEmitter, formatNumber, nextNumberForEmitter, isMissingSchema,
    sequenceDuNumero, rendreLeNumero,
};

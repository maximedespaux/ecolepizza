/**
 * LES MOYENS DE PAIEMENT DE L'ÉCOLE — une seule liste, chacun avec son modèle de facture
 * (migration 187, demandé le 2026-09-28).
 *
 * Décidé par l'école : la liste se tient dans Paramètres → Facturation ; à la caisse et en
 * facturant une demande boutique, choisir un moyen PRÉ-SÉLECTIONNE son modèle, qui reste
 * modifiable ; un règlement ventilé suit sa PREMIÈRE ligne. Un moyen sans modèle est
 * « Automatique » : la règle d'avant (selon l'acheteur, cf. pickInvoiceTemplate).
 *
 * AVANT la liste, les moyens vivaient en texte à virgules dans deux endroits qui ne se parlaient
 * pas — chaque entité émettrice (lue par la caisse) et les anciens réglages boutique (lus en
 * facturant une demande, et que plus aucun écran ne modifie). `moyensDAvant` les réunit : c'est
 * la liste qu'on propose tant que la migration n'est pas jouée, et celle qui remplit la table à
 * la première lecture.
 */
const crypto = require('crypto');

const DEFAUT = ['Espèces', 'CB', 'Virement', 'Chèque'];
/* La taille de `invoice.payment_method` : un moyen seul n'y est jamais coupé. */
const MAX_LIBELLE = 30;

const sansTable = (e) => !!e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

/** Un libellé mis au propre (espaces resserrés) — la longueur se vérifie à part, pour le dire. */
const nettoyer = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/* CASSE ET ACCENTS CONFONDUS : la même égalité que la clé unique de la table
   (utf8mb4_general_ci). « Cheque » et « Chèque » sont un seul moyen — deux lignes presque
   jumelles dans la caisse se choisiraient au hasard. */
const cle = (s) => nettoyer(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** « Espèces,CB, Virement » → ['Espèces', 'CB', 'Virement'], sans vide. */
const decouper = (liste) => String(liste || '').split(',').map(nettoyer).filter(Boolean);

/** Ajoute ce qui manque, dans l'ordre, sans doublon (casse et accents confondus). */
function reunir(...listes) {
    const vus = new Set();
    const out = [];
    for (const m of listes.flat()) {
        const k = cle(m);
        if (!k || vus.has(k)) continue;
        vus.add(k);
        out.push(nettoyer(m).slice(0, MAX_LIBELLE));
    }
    return out;
}

/**
 * LES MOYENS DÉJÀ EN USAGE, réunis dans l'ordre où la caisse les proposait : l'entité par défaut
 * d'abord, puis les autres entités, puis les réglages boutique. Aucun nulle part → les quatre
 * habituels. Une table absente n'est pas une erreur : elle ne contribue simplement rien.
 */
async function moyensDAvant(conn, orgId) {
    const listes = [];
    try {
        const [rows] = await conn.query(
            'SELECT payment_methods FROM billing_profile WHERE organization_id = ? ORDER BY is_default DESC, created_at',
            [orgId]);
        for (const r of rows || []) listes.push(decouper(r.payment_methods));
    } catch (e) { if (!sansTable(e)) throw e; }
    try {
        const [rows] = await conn.query('SELECT payment_methods FROM shop_settings WHERE organization_id = ?', [orgId]);
        for (const r of rows || []) listes.push(decouper(r.payment_methods));
    } catch (e) { if (!sansTable(e)) throw e; }
    const tous = reunir(...listes);
    return tous.length ? tous : [...DEFAUT];
}

const LIRE = `SELECT id, libelle, template_slug, sort_order FROM moyen_paiement
               WHERE organization_id = ? ORDER BY sort_order, libelle`;

/**
 * La liste de l'organisme → `{ disponible, moyens: [{ id, libelle, template_slug, sort_order }] }`.
 *
 * LA PREMIÈRE LECTURE SÈME LA LISTE avec les moyens déjà en usage : l'école retrouve les siens,
 * « Chèque vacances » compris, sans rien ressaisir. Une seule fois — la suppression du dernier moyen
 * est refusée (il en faut un à la caisse), donc une liste vide veut toujours dire « jamais semée ».
 * `INSERT IGNORE` sur la clé unique : deux premières lectures simultanées ne doublent rien.
 *
 * Sans la migration 187 : `disponible: false`, et les moyens d'avant, SANS modèle — la caisse
 * continue de proposer ce qu'elle proposait.
 */
async function lireMoyens(conn, orgId) {
    let rows;
    try {
        [rows] = await conn.query(LIRE, [orgId]);
    } catch (e) {
        if (!sansTable(e)) throw e;
        const anciens = await moyensDAvant(conn, orgId);
        return { disponible: false, moyens: anciens.map((libelle, i) => ({ id: null, libelle, template_slug: null, sort_order: i })) };
    }
    if (!rows || !rows.length) {
        const anciens = await moyensDAvant(conn, orgId);
        for (let i = 0; i < anciens.length; i++) {
            await conn.query(
                'INSERT IGNORE INTO moyen_paiement (id, organization_id, libelle, sort_order) VALUES (?, ?, ?, ?)',
                [crypto.randomUUID(), orgId, anciens[i], i]);
        }
        [rows] = await conn.query(LIRE, [orgId]);
    }
    return { disponible: true, moyens: rows || [] };
}

/**
 * LE MODÈLE D'UN RÈGLEMENT : celui de son PREMIER moyen (décidé par l'école), ou `null` —
 * « Automatique », ou moyen inconnu de la liste (un nom saisi avant elle), ou migration absente.
 * Le modèle n'est pas vérifié ici : l'édition de la facture ignore déjà un slug qui n'est pas un
 * modèle FACTURE actif, et retombe sur la règle de l'acheteur (buildInvoicePdf).
 */
async function modeleDuReglement(conn, orgId, parts, moyenSeul) {
    const premier = (Array.isArray(parts) && parts.length ? parts[0].method : moyenSeul) || '';
    if (!cle(premier)) return null;
    let rows;
    try {
        [rows] = await conn.query('SELECT libelle, template_slug FROM moyen_paiement WHERE organization_id = ?', [orgId]);
    } catch (e) {
        if (sansTable(e)) return null;
        throw e;
    }
    const m = (rows || []).find((r) => cle(r.libelle) === cle(premier));
    return (m && m.template_slug) || null;
}

module.exports = { DEFAUT, MAX_LIBELLE, nettoyer, cle, decouper, reunir, moyensDAvant, lireMoyens, modeleDuReglement, sansTable };

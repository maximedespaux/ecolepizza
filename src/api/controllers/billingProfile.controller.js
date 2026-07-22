const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

/**
 * Entités émettrices : les identités de vendeur sous lesquelles un organisme facture.
 *
 * Voir migration 113 pour le POURQUOI. Ici, la règle qui compte : une entité émettrice est une
 * identité RÉELLE et COMPLÈTE, jamais une simple étiquette de nom. Le XML Factur-X porte le nom,
 * le SIRET, la TVA et l'adresse du vendeur ; ils basculent ensemble. Le code refuse donc une
 * entité sans raison sociale. Le préfixe de numéro n'est plus un champ à part (115) : il vit dans
 * le gabarit ; l'unicité des numéros repose sur uq_invoice_number, sur le numéro lui-même.
 *
 * Fonctionnement dégradé : si la migration 113 n'est pas jouée, la table n'existe pas. Les
 * lectures renvoient une liste vide (l'organisme reste l'unique émetteur), les écritures
 * répondent un 422 lisible plutôt qu'un 500.
 */

const isMissingSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

/** Colonnes modifiables par l'utilisateur (le compteur, l'id et le préfixe interne n'en sont pas). */
const CHAMPS = [
    'label', 'legal_name', 'legal_status', 'capital', 'rcs', 'siret', 'vat_number', 'naf_ape',
    'nda', 'address', 'zip_code', 'town', 'country', 'phone', 'email', 'iban', 'bic', 'bank_name',
    'logo_image', 'signature_image',
    'number_format', 'tva_applies', 'payment_methods',
];

const COLS = `id, label, legal_name, legal_status, capital, rcs, siret, vat_number, naf_ape,
    nda, address, zip_code, town, country, phone, email, iban, bic, bank_name,
    invoice_prefix, next_number, is_default,
    number_format, tva_applies, payment_methods, is_organization`;

/** L'INSERT qui recopie l'organisme dans une entité. `asOrg` la marque comme l'entité organisme
 *  et défaut ; sinon (117 non jouée) c'est une entité ordinaire. */
async function insertOrgProfile(conn, orgId, org, asOrg) {
    const cols = ['id', 'organization_id', 'label', 'legal_name', 'siret', 'vat_number', 'naf_ape',
        'nda', 'address', 'zip_code', 'town', 'phone', 'email', 'iban', 'bic', 'bank_name',
        'logo_image', 'signature_image', 'invoice_prefix', 'is_default'];
    const vals = [crypto.randomUUID(), orgId, org.legal_name, org.legal_name, org.siret, org.vat_number,
        org.naf_ape, org.nda, org.address, org.zip_code, org.town, org.phone, org.email,
        org.iban, org.bic, org.bank_name, org.logo_image, org.signature_image, 'F', 1];
    if (asOrg) { cols.push('is_organization'); vals.push(1); }
    await conn.query(`INSERT INTO billing_profile (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
}

/**
 * Garantit que l'ENTITÉ ORGANISME existe, et qu'elle est le vendeur par défaut.
 *
 * L'organisme est l'émetteur naturel : c'est sous son identité qu'on facture, et les autres
 * entités ne sont que des alternatives. On recopie donc son identité dans une entité marquée
 * `is_organization`, désignée par défaut. Une COPIE, pas un lien : une facture fige l'identité
 * de son émetteur, modifier l'organisme plus tard ne récrit pas les factures émises.
 *
 * DÉFAUT CORRIGÉ ICI : on ne semait qu'en l'absence TOTALE d'entité. Un organisme ayant déjà
 * créé « Boutique » se retrouvait sans entité organisme, et son défaut tombait sur l'alternative.
 * On sème désormais dès qu'aucune entité `is_organization` n'existe, même si d'autres sont là —
 * et on rétrograde les autres, pour que l'organisme redevienne le défaut.
 *
 * Sans la 117, la colonne manque : on retombe sur l'ancien comportement (semer si vide).
 */
async function ensureOrgProfile(conn, orgId) {
    const [[org]] = await conn.query('SELECT * FROM organization WHERE id = ?', [orgId]);
    if (!org || !org.legal_name) return; // rien à recopier
    try {
        const [[exist]] = await conn.query(
            'SELECT id FROM billing_profile WHERE organization_id = ? AND is_organization = 1 LIMIT 1', [orgId]);
        if (exist) return; // l'entité organisme est déjà là
        // L'organisme devient LE défaut : on rétrograde les autres, puis on l'insère par défaut.
        await conn.query('UPDATE billing_profile SET is_default = 0 WHERE organization_id = ?', [orgId]);
        await insertOrgProfile(conn, orgId, org, true);
    } catch (e) {
        if (!isMissingSchema(e)) throw e;
        // 117 non jouée : on ne sait pas marquer l'entité organisme. Ancien comportement — semer
        // seulement si AUCUNE entité n'existe, pour ne pas dupliquer.
        const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM billing_profile WHERE organization_id = ?', [orgId]);
        if (n === 0) await insertOrgProfile(conn, orgId, org, false);
    }
}

/** GET /api/emetteurs — liste des entités émettrices de l'organisme. */
const list = async (req, res) => {
    const conn = db.promise();
    const orgId = req.user.organization_id;
    const requete = () => conn.query(
        `SELECT ${COLS} FROM billing_profile WHERE organization_id = ? ORDER BY is_organization DESC, is_default DESC, label`, [orgId]);
    try {
        // L'entité organisme est garantie AVANT la lecture : elle doit toujours être là, défaut.
        try { await ensureOrgProfile(conn, orgId); } catch (e) { if (!isMissingSchema(e)) console.error('semis émetteur :', e.message); }
        const [rows] = await requete();
        res.json({ data: rows });
    } catch (e) {
        // COLS cite is_organization : sans la 117, la lecture échoue. On relit sans cette colonne.
        if (isMissingSchema(e)) {
            try {
                const [rows] = await conn.query(
                    `SELECT ${COLS.replace(', is_organization', '')} FROM billing_profile WHERE organization_id = ? ORDER BY is_default DESC, label`, [orgId]);
                return res.json({ data: rows.map((r) => ({ ...r, is_organization: 0 })) });
            } catch (e2) {
                if (isMissingSchema(e2)) return res.json({ data: [] }); // table absente (113 non jouée)
                console.error('Erreur liste émetteurs :', e2);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
        }
        console.error('Erreur liste émetteurs :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** Prépare et valide le corps. Renvoie { erreur } ou { valeurs }. */
function preparer(body) {
    const legalName = String(body.legal_name || '').trim();
    if (!legalName) {
        return { erreur: 'La raison sociale est obligatoire : elle identifie le vendeur sur la facture et dans le XML.' };
    }
    // {SEQ} est la seule part qui varie d'une facture à l'autre. Un format qui l'omet
    // fabriquerait des doublons de numéro, rejetés à l'unicité — autant le refuser tout de suite.
    const fmt = String(body.number_format || '').trim();
    if (fmt && !/\{SEQ(?::\d+)?\}/.test(fmt)) {
        return { erreur: 'Le format de numéro doit contenir {SEQ} : c\'est la partie qui change à chaque facture. Sans elle, deux factures porteraient le même numéro.' };
    }
    const v = {};
    for (const c of CHAMPS) v[c] = body[c] == null ? null : body[c];
    v.legal_name = legalName;
    v.label = String(body.label || '').trim() || legalName; // à défaut, le label EST la raison sociale
    v.country = (String(body.country || 'FR').trim().toUpperCase().slice(0, 2)) || 'FR';
    v.number_format = fmt || null;
    v.tva_applies = body.tva_applies == null ? 1 : (body.tva_applies ? 1 : 0); // 1 par défaut
    v.payment_methods = String(body.payment_methods || '').trim() || null;
    return { valeurs: v };
}

/** POST /api/emetteurs */
const create = async (req, res) => {
    const { erreur, valeurs } = preparer(req.body);
    if (erreur) return res.status(422).json({ message: erreur });
    const conn = db.promise();
    const orgId = req.user.organization_id;
    try {
        // La toute première entité devient le défaut : sans défaut, une facture ne saurait pas
        // sous quel nom sortir, et exiger un choix dès la première serait un piège.
        const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM billing_profile WHERE organization_id = ?', [orgId]);
        const id = crypto.randomUUID();
        const cols = ['id', 'organization_id', ...CHAMPS, 'is_default'];
        const vals = [id, orgId, ...CHAMPS.map((c) => valeurs[c]), n === 0 ? 1 : 0];
        await conn.query(
            `INSERT INTO billing_profile (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
        logAudit(req, 'billing_profile.create', 'BillingProfile', id);
        res.status(201).json({ id, message: 'Entité émettrice créée.' });
    } catch (e) {
        if (isMissingSchema(e)) return res.status(422).json({ message: 'Fonction indisponible : la migration 113 n\'est pas encore appliquée.' });
        console.error('Erreur création émetteur :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PATCH /api/emetteurs/:id */
const update = async (req, res) => {
    const { erreur, valeurs } = preparer(req.body);
    if (erreur) return res.status(422).json({ message: erreur });
    const conn = db.promise();
    try {
        const [r] = await conn.query(
            `UPDATE billing_profile SET ${CHAMPS.map((c) => `${c} = ?`).join(', ')}
             WHERE id = ? AND organization_id = ?`,
            [...CHAMPS.map((c) => valeurs[c]), req.params.id, req.user.organization_id]
        );
        if (!r.affectedRows) return res.status(404).json({ message: 'Entité introuvable.' });
        logAudit(req, 'billing_profile.update', 'BillingProfile', req.params.id);
        res.json({ message: 'Entité mise à jour.' });
    } catch (e) {
        console.error('Erreur mise à jour émetteur :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/emetteurs/:id/defaut — désigne l'émettrice appliquée sans choix.
 *
 * Un seul défaut à la fois : on remet les autres à 0 dans la même transaction. Deux défauts
 * laisseraient le choix au hasard d'un tri, exactement ce qu'un défaut est censé éviter.
 */
const setDefault = async (req, res) => {
    const conn = db.promise();
    const orgId = req.user.organization_id;
    try {
        const [[row]] = await conn.query('SELECT id FROM billing_profile WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!row) return res.status(404).json({ message: 'Entité introuvable.' });
        await conn.query('UPDATE billing_profile SET is_default = 0 WHERE organization_id = ?', [orgId]);
        await conn.query('UPDATE billing_profile SET is_default = 1 WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        logAudit(req, 'billing_profile.default', 'BillingProfile', req.params.id);
        res.json({ message: 'Entité émettrice par défaut mise à jour.' });
    } catch (e) {
        console.error('Erreur défaut émetteur :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/emetteurs/:id
 *
 * La FK invoice.billing_profile_id est ON DELETE SET NULL : les factures déjà émises survivent,
 * PDF figé et numéro conservé. On REFUSE de supprimer l'entité organisme — c'est l'émetteur de
 * base, et elle serait de toute façon re-semée au prochain chargement.
 */
const remove = async (req, res) => {
    const conn = db.promise();
    const orgId = req.user.organization_id;
    try {
        // `is_organization` peut ne pas exister (117 non jouée) : on lit défensivement.
        let row;
        try {
            [[row]] = await conn.query('SELECT is_default, is_organization FROM billing_profile WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        } catch (e) {
            if (!isMissingSchema(e)) throw e;
            [[row]] = await conn.query('SELECT is_default FROM billing_profile WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        }
        if (!row) return res.status(404).json({ message: 'Entité introuvable.' });
        if (row.is_organization) {
            return res.status(422).json({ message: 'L\'entité de l\'organisme ne peut pas être supprimée : c\'est votre émetteur par défaut. Vous pouvez en désigner un autre par défaut, ou modifier celle-ci.' });
        }
        await conn.query('DELETE FROM billing_profile WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        // Si on a supprimé le défaut et qu'il reste des entités, on en promeut une : ne jamais
        // laisser l'organisme sans défaut alors qu'il a encore des émettrices.
        if (row.is_default) {
            const [[next]] = await conn.query('SELECT id FROM billing_profile WHERE organization_id = ? ORDER BY label LIMIT 1', [orgId]);
            if (next) await conn.query('UPDATE billing_profile SET is_default = 1 WHERE id = ?', [next.id]);
        }
        logAudit(req, 'billing_profile.delete', 'BillingProfile', req.params.id);
        res.json({ message: 'Entité supprimée.' });
    } catch (e) {
        console.error('Erreur suppression émetteur :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { list, create, update, setDefault, remove };

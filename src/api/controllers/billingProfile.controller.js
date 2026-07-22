const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

/**
 * Entités émettrices : les identités de vendeur sous lesquelles un organisme facture.
 *
 * Voir migration 113 pour le POURQUOI. Ici, la règle qui compte : une entité émettrice est une
 * identité RÉELLE et COMPLÈTE, jamais une simple étiquette de nom. Le XML Factur-X porte le nom,
 * le SIRET, la TVA et l'adresse du vendeur ; ils basculent ensemble. Le code refuse donc une
 * entité sans raison sociale, et garde chaque préfixe de numérotation unique dans l'organisme —
 * deux séquences au même préfixe finiraient par produire le même numéro de facture.
 *
 * Fonctionnement dégradé : si la migration 113 n'est pas jouée, la table n'existe pas. Les
 * lectures renvoient une liste vide (l'organisme reste l'unique émetteur), les écritures
 * répondent un 422 lisible plutôt qu'un 500.
 */

const isMissingSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

/** Colonnes modifiables par l'utilisateur (le compteur et l'id n'en sont pas). */
const CHAMPS = [
    'label', 'legal_name', 'legal_status', 'capital', 'rcs', 'siret', 'vat_number', 'naf_ape',
    'nda', 'address', 'zip_code', 'town', 'country', 'phone', 'email', 'iban', 'bic', 'bank_name',
    'logo_image', 'signature_image', 'invoice_prefix', 'default_template_slug',
];

/** Nettoie un préfixe : lettres, chiffres et tiret, en capitales, courts. Un préfixe vide
 *  rendrait la numérotation ambiguë ; on retombe alors sur 'F'. */
const nettoiePrefixe = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20) || 'F';

/** GET /api/emetteurs — liste des entités émettrices de l'organisme. */
const list = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, label, legal_name, legal_status, capital, rcs, siret, vat_number, naf_ape,
                    nda, address, zip_code, town, country, phone, email, iban, bic, bank_name,
                    invoice_prefix, next_number, default_template_slug, is_default
             FROM billing_profile WHERE organization_id = ?
             ORDER BY is_default DESC, label`,
            [req.user.organization_id]
        );
        res.json({ data: rows });
    } catch (e) {
        if (isMissingSchema(e)) return res.json({ data: [] });
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
    const v = {};
    for (const c of CHAMPS) v[c] = body[c] == null ? null : body[c];
    v.legal_name = legalName;
    v.label = String(body.label || '').trim() || legalName; // à défaut, le label EST la raison sociale
    v.country = (String(body.country || 'FR').trim().toUpperCase().slice(0, 2)) || 'FR';
    v.invoice_prefix = nettoiePrefixe(body.invoice_prefix);
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
        if (e && e.code === 'ER_DUP_ENTRY') {
            return res.status(422).json({ message: `Le préfixe « ${valeurs.invoice_prefix} » est déjà utilisé par une autre entité. Chaque entité numérote ses factures à part : donnez-lui un préfixe distinct.` });
        }
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
        if (e && e.code === 'ER_DUP_ENTRY') {
            return res.status(422).json({ message: `Le préfixe « ${valeurs.invoice_prefix} » est déjà utilisé par une autre entité.` });
        }
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
 * PDF figé et numéro conservé. On refuse seulement de supprimer le DERNIER défaut tant qu'il
 * reste d'autres entités sans défaut — sinon l'organisme se retrouverait sans émettrice désignée.
 */
const remove = async (req, res) => {
    const conn = db.promise();
    const orgId = req.user.organization_id;
    try {
        const [[row]] = await conn.query('SELECT is_default FROM billing_profile WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!row) return res.status(404).json({ message: 'Entité introuvable.' });
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

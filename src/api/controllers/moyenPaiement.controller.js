const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { loadOrgSteps } = require('./template.controller.js');
const { MAX_LIBELLE, nettoyer, lireMoyens, sansTable } = require('../lib/moyensPaiement.js');

/**
 * MOYENS DE PAIEMENT — la liste de l'école, dans Paramètres → Facturation (migration 187).
 *
 * Chaque moyen porte le modèle de facture qu'il PRÉ-SÉLECTIONNE à la caisse et en facturant une
 * demande boutique (cf. lib/moyensPaiement.js). Lecture : tout le personnel — la caisse en a
 * besoin. Écriture : le bureau, comme les entités émettrices.
 *
 * RENOMMER NE RÉCRIT RIEN : une facture émise porte le NOM du moyen tel qu'il était, figé. Et
 * supprimer le DERNIER moyen est refusé — une caisse sans moyen ne pourrait plus encaisser, et une
 * liste vide serait relue comme « jamais semée ».
 */

const MIGRATION = 'Migration 187 non jouée : la liste des moyens de paiement n\'est pas encore disponible.';
const doublon = (e) => !!e && e.code === 'ER_DUP_ENTRY';

function verifierLibelle(v) {
    const libelle = nettoyer(v);
    if (!libelle) return { erreur: 'Nommez le moyen de paiement.' };
    if (libelle.length > MAX_LIBELLE) {
        return { erreur: `${MAX_LIBELLE} caractères au plus : c'est ce qui s'imprime sur la facture.` };
    }
    return { libelle };
}

/**
 * LE MODÈLE DOIT ÊTRE UNE FACTURE, et active — refusé ici plutôt que découvert au moment d'éditer
 * la facture d'un client, c'est-à-dire trop tard. Vide = « Automatique » (`slug: null`).
 */
async function verifierModele(orgId, valeur) {
    const s = String(valeur == null ? '' : valeur).trim();
    if (!s) return { slug: null };
    const step = (await loadOrgSteps(orgId)).find((x) => x.slug === s);
    if (!step) return { erreur: 'Modèle introuvable.' };
    const nom = step.label || step.slug;
    if (String(step.doc_type || '').toUpperCase() !== 'FACTURE') {
        return { erreur: `« ${nom} » n'est pas un modèle de facture.` };
    }
    if (!step.active) return { erreur: `« ${nom} » est désactivé : réactivez-le dans Modèles de documents.` };
    return { slug: step.slug };
}

/** GET /api/moyens-paiement — `{ disponible, data: [{ id, libelle, template_slug, sort_order }] }`. */
const lister = async (req, res) => {
    try {
        const { disponible, moyens } = await lireMoyens(db.promise(), req.user.organization_id);
        res.json({ disponible, data: moyens });
    } catch (err) {
        console.error('Erreur moyens de paiement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/moyens-paiement — `{ libelle, template_slug? }`, ajouté en fin de liste. */
const creer = async (req, res) => {
    const orgId = req.user.organization_id;
    const l = verifierLibelle(req.body?.libelle);
    if (l.erreur) return res.status(422).json({ message: l.erreur });
    try {
        const m = await verifierModele(orgId, req.body?.template_slug);
        if (m.erreur) return res.status(422).json({ message: m.erreur });
        const conn = db.promise();
        /* LA LISTE EST SEMÉE AVANT L'AJOUT : sur une table encore vide, le premier moyen ajouté
           la rendrait non vide — et les moyens d'avant ne seraient jamais repris. */
        const { disponible } = await lireMoyens(conn, orgId);
        if (!disponible) return res.status(503).json({ message: MIGRATION });
        const [[max]] = await conn.query(
            'SELECT COALESCE(MAX(sort_order), -1) AS n FROM moyen_paiement WHERE organization_id = ?', [orgId]);
        const id = crypto.randomUUID();
        await conn.query(
            'INSERT INTO moyen_paiement (id, organization_id, libelle, template_slug, sort_order) VALUES (?, ?, ?, ?, ?)',
            [id, orgId, l.libelle, m.slug, Number(max && max.n) + 1]);
        logAudit(req, 'moyen_paiement.create', 'MoyenPaiement', id, { libelle: l.libelle });
        res.status(201).json({ data: { id, libelle: l.libelle, template_slug: m.slug } });
    } catch (err) {
        if (doublon(err)) return res.status(409).json({ message: `« ${l.libelle} » existe déjà.` });
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION });
        console.error('Erreur ajout moyen de paiement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PATCH /api/moyens-paiement/:id — `{ libelle? , template_slug? }`. */
const modifier = async (req, res) => {
    const orgId = req.user.organization_id;
    const b = req.body || {};
    const champs = [];
    const valeurs = [];
    let libelle = null;
    try {
        if (b.libelle !== undefined) {
            const l = verifierLibelle(b.libelle);
            if (l.erreur) return res.status(422).json({ message: l.erreur });
            champs.push('libelle = ?'); valeurs.push(l.libelle); libelle = l.libelle;
        }
        if (b.template_slug !== undefined) {
            const m = await verifierModele(orgId, b.template_slug);
            if (m.erreur) return res.status(422).json({ message: m.erreur });
            champs.push('template_slug = ?'); valeurs.push(m.slug);
        }
        if (!champs.length) return res.status(422).json({ message: 'Rien à modifier.' });
        const conn = db.promise();
        const [[avant]] = await conn.query(
            'SELECT libelle FROM moyen_paiement WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!avant) return res.status(404).json({ message: 'Moyen de paiement introuvable.' });
        await conn.query(
            `UPDATE moyen_paiement SET ${champs.join(', ')} WHERE id = ? AND organization_id = ?`,
            [...valeurs, req.params.id, orgId]);
        logAudit(req, 'moyen_paiement.update', 'MoyenPaiement', req.params.id, { libelle: libelle || avant.libelle });
        res.json({ success: true });
    } catch (err) {
        if (doublon(err)) return res.status(409).json({ message: `« ${libelle} » existe déjà.` });
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION });
        console.error('Erreur modification moyen de paiement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/moyens-paiement/:id — jamais le dernier. */
const supprimer = async (req, res) => {
    const orgId = req.user.organization_id;
    try {
        const conn = db.promise();
        const [rows] = await conn.query('SELECT id, libelle FROM moyen_paiement WHERE organization_id = ?', [orgId]);
        const cible = (rows || []).find((r) => String(r.id).toLowerCase() === String(req.params.id).toLowerCase());
        if (!cible) return res.status(404).json({ message: 'Moyen de paiement introuvable.' });
        if (rows.length <= 1) {
            return res.status(409).json({ message: 'Il faut au moins un moyen de paiement : la caisse n\'aurait plus rien à proposer.' });
        }
        await conn.query('DELETE FROM moyen_paiement WHERE id = ? AND organization_id = ?', [cible.id, orgId]);
        logAudit(req, 'moyen_paiement.delete', 'MoyenPaiement', cible.id, { libelle: cible.libelle });
        res.json({ success: true });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION });
        console.error('Erreur suppression moyen de paiement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/moyens-paiement/ordre — `{ ids }`, TOUTE la liste dans son nouvel ordre. Le premier est
 * celui que la caisse propose d'office. Une liste qui ne correspond pas exactement (un moyen ajouté
 * ou retiré depuis un autre poste) est refusée : l'appliquer rangerait une liste que personne n'a vue.
 */
const ordonner = async (req, res) => {
    const orgId = req.user.organization_id;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((i) => String(i).toLowerCase()) : null;
    if (!ids) return res.status(422).json({ message: 'Ordre attendu.' });
    try {
        const conn = db.promise();
        const [rows] = await conn.query('SELECT id FROM moyen_paiement WHERE organization_id = ?', [orgId]);
        const connus = new Set((rows || []).map((r) => String(r.id).toLowerCase()));
        if (ids.length !== connus.size || new Set(ids).size !== ids.length || !ids.every((i) => connus.has(i))) {
            return res.status(409).json({ message: 'La liste a changé entre-temps : rechargez la page.' });
        }
        for (let i = 0; i < ids.length; i++) {
            await conn.query('UPDATE moyen_paiement SET sort_order = ? WHERE id = ? AND organization_id = ?', [i, ids[i], orgId]);
        }
        logAudit(req, 'moyen_paiement.ordre', 'MoyenPaiement', null);
        res.json({ success: true });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION });
        console.error('Erreur ordre des moyens de paiement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { lister, creer, modifier, supprimer, ordonner };

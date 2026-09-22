const crypto = require('crypto');
const db = require('../config/database.js');
const { lireNouveauMemo, lireModification } = require('../lib/memos.js');

/**
 * LES MÉMOS DU PERSONNEL — pense-bête et liste de choses à faire (migration 176, 2026-09-22).
 *
 * QUI VOIT QUOI, la règle choisie par l'école et que chaque requête applique elle-même :
 *   · un mémo appartient à son AUTEUR, qui seul le voit ;
 *   · PARTAGÉ, tout le personnel de l'organisme le voit, et chacun peut le cocher — c'est une tâche
 *     d'équipe, et celui qui la fait n'est pas forcément celui qui l'a notée ;
 *   · seul l'auteur le SUPPRIME ou cesse de le PARTAGER. Un collègue qui supprimerait le rappel
 *     d'un autre lui ferait perdre ce qu'il comptait faire, sans qu'il le sache.
 * Le mémo PRIVÉ d'un autre n'existe pas pour moi : il répond 404, jamais 403 — un 403 dirait qu'il
 * existe, et c'est déjà trop dire d'une note personnelle.
 *
 * AUCUNE TRACE AU JOURNAL D'AUDIT, et c'est voulu. Le journal alimente l'« Activité récente » du
 * tableau de bord, que tout le bureau lit : chaque pense-bête privé y apparaîtrait. Un mémo n'est
 * pas un acte de gestion de l'organisme, c'est une note de travail.
 *
 * SANS LA MIGRATION 176, rien ne casse : la liste répond `data: null` avec une phrase, le compteur
 * zéro, et l'écriture est refusée (503) avec la même phrase — l'écran l'affiche au lieu d'un vide.
 */

const TABLE_ABSENTE = (e) => e && e.code === 'ER_NO_SUCH_TABLE';
const PAS_ENCORE = 'Les mémos ne sont pas encore disponibles (migration 176 non jouée).';

/* Qui peut voir ce mémo : son auteur, ou tout le monde s'il est partagé. */
const VISIBLE = '(m.auteur_id = ? OR m.partage = 1)';

const nom = (prenom, nomFamille) => [prenom, nomFamille].filter(Boolean).join(' ').trim() || null;

/* Une ligne → ce que l'écran affiche. `mien` décide des boutons : supprimer et partager ne
   s'offrent qu'à l'auteur. Le nom de l'auteur n'est donné que pour les mémos des AUTRES. */
function versEcran(r, moi) {
    const mien = String(r.auteur_id) === String(moi);
    return {
        id: r.id,
        texte: r.texte,
        echeance: r.echeance || null,
        partage: Number(r.partage) === 1,
        fait_le: r.fait_le || null,
        fait_par: r.fait_le ? nom(r.fait_par_prenom, r.fait_par_nom) : null,
        cree_le: r.cree_le || null,
        mien,
        auteur: mien ? null : nom(r.auteur_prenom, r.auteur_nom),
    };
}

function echec(res, e, ou) {
    if (TABLE_ABSENTE(e)) return res.status(503).json({ message: PAS_ENCORE });
    console.error(`Erreur mémos (${ou}) :`, e);
    return res.status(500).json({ error: 'Internal Server Error' });
}

/** GET /api/memos — mes mémos et ceux que l'équipe partage : à faire d'abord (échéance la plus
 *  proche en tête, sans échéance ensuite), faits à la fin. */
const listMemos = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT m.id, m.texte, DATE_FORMAT(m.echeance, '%Y-%m-%d') AS echeance, m.partage,
                    DATE_FORMAT(m.fait_le, '%Y-%m-%d %H:%i') AS fait_le,
                    DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i') AS cree_le,
                    m.auteur_id, a.first_name AS auteur_prenom, a.last_name AS auteur_nom,
                    f.first_name AS fait_par_prenom, f.last_name AS fait_par_nom
               FROM memo m
               LEFT JOIN user a ON a.id = m.auteur_id
               LEFT JOIN user f ON f.id = m.fait_par
              WHERE m.organization_id = ? AND ${VISIBLE}
              ORDER BY (m.fait_le IS NOT NULL), (m.echeance IS NULL), m.echeance, m.fait_le DESC, m.created_at DESC`,
            [req.user.organization_id, req.user.id]);
        res.json({ data: rows.map((r) => versEcran(r, req.user.id)) });
    } catch (e) {
        if (TABLE_ABSENTE(e)) return res.json({ data: null, message: PAS_ENCORE });
        return echec(res, e, 'liste');
    }
};

/**
 * GET /api/memos/compte — combien de mémos visibles, non faits, sont ÉCHUS ou dus AUJOURD'HUI.
 * C'est le chiffre du bouton de la barre du haut. « Aujourd'hui » est celui de la base (CURDATE,
 * fuseau de la session) : l'écran et le compteur disent le même jour.
 */
const countMemos = async (req, res) => {
    try {
        const [[r]] = await db.promise().query(
            `SELECT COUNT(*) AS n FROM memo m
              WHERE m.organization_id = ? AND ${VISIBLE}
                AND m.fait_le IS NULL AND m.echeance IS NOT NULL AND m.echeance <= CURDATE()`,
            [req.user.organization_id, req.user.id]);
        res.json({ data: { echus: Number(r && r.n) || 0, disponible: true } });
    } catch (e) {
        if (TABLE_ABSENTE(e)) return res.json({ data: { echus: 0, disponible: false } });
        return echec(res, e, 'compte');
    }
};

/** POST /api/memos — { texte, echeance?, partage? }. Un mémo naît privé, sauf demande explicite. */
const createMemo = async (req, res) => {
    const lu = lireNouveauMemo(req.body || {});
    if (lu.erreur) return res.status(422).json({ message: lu.erreur });
    const { texte, echeance, partage } = lu.valeurs;
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO memo (id, organization_id, auteur_id, texte, echeance, partage)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, req.user.id, texte, echeance, partage ? 1 : 0]);
        res.status(201).json({ data: { id } });
    } catch (e) {
        return echec(res, e, 'création');
    }
};

/* Le mémo `id`, s'il est visible par ce compte. `null` sinon — privé d'un autre, ou inexistant :
   les deux se répondent pareil. */
async function memoVisible(conn, req) {
    const [[m]] = await conn.query(
        `SELECT m.id, m.auteur_id, m.partage FROM memo m
          WHERE m.id = ? AND m.organization_id = ? AND ${VISIBLE}`,
        [req.params.id, req.user.organization_id, req.user.id]);
    return m || null;
}

/** PATCH /api/memos/:id — { fait? } (cocher : l'auteur, ou n'importe qui sur un mémo partagé)
 *  et/ou { partage? } (l'auteur seul). */
const updateMemo = async (req, res) => {
    const lu = lireModification(req.body || {});
    if (lu.erreur) return res.status(422).json({ message: lu.erreur });
    const { fait, partage } = lu.modification;
    try {
        const conn = db.promise();
        const m = await memoVisible(conn, req);
        if (!m) return res.status(404).json({ message: 'Mémo introuvable.' });
        const mien = String(m.auteur_id) === String(req.user.id);
        if (partage !== undefined && !mien) {
            return res.status(403).json({ message: 'Seul l’auteur d’un mémo peut le partager ou le reprendre.' });
        }
        const champs = [];
        const valeurs = [];
        /* COCHER GARDE QUI ET QUAND : sur un mémo partagé, ce n'est pas forcément l'auteur. Décocher
           efface les deux — le mémo redevient à faire, sans trace d'un « fait » qui n'en est plus un. */
        if (fait !== undefined) {
            champs.push(fait ? 'fait_le = NOW()' : 'fait_le = NULL', 'fait_par = ?');
            valeurs.push(fait ? req.user.id : null);
        }
        if (partage !== undefined) { champs.push('partage = ?'); valeurs.push(partage ? 1 : 0); }
        await conn.query(
            `UPDATE memo SET ${champs.join(', ')} WHERE id = ? AND organization_id = ?`,
            [...valeurs, m.id, req.user.organization_id]);
        res.json({ success: true });
    } catch (e) {
        return echec(res, e, 'modification');
    }
};

/** DELETE /api/memos/:id — l'auteur seul. */
const deleteMemo = async (req, res) => {
    try {
        const conn = db.promise();
        const m = await memoVisible(conn, req);
        if (!m) return res.status(404).json({ message: 'Mémo introuvable.' });
        if (String(m.auteur_id) !== String(req.user.id)) {
            return res.status(403).json({ message: 'Seul l’auteur d’un mémo peut le supprimer.' });
        }
        await conn.query('DELETE FROM memo WHERE id = ? AND organization_id = ? AND auteur_id = ?',
            [m.id, req.user.organization_id, req.user.id]);
        res.json({ success: true });
    } catch (e) {
        return echec(res, e, 'suppression');
    }
};

/** DELETE /api/memos/faits — « Effacer les faits » : MES mémos cochés, jamais ceux des autres,
 *  même partagés et cochés par moi. */
const clearDoneMemos = async (req, res) => {
    try {
        const [r] = await db.promise().query(
            'DELETE FROM memo WHERE organization_id = ? AND auteur_id = ? AND fait_le IS NOT NULL',
            [req.user.organization_id, req.user.id]);
        res.json({ data: { effaces: Number(r && r.affectedRows) || 0 } });
    } catch (e) {
        return echec(res, e, 'effacement');
    }
};

module.exports = { listMemos, countMemos, createMemo, updateMemo, deleteMemo, clearDoneMemos, PAS_ENCORE };

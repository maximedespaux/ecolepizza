/**
 * PIÈCES REMISES PAR L'ORGANISME AU STAGIAIRE — référentiel, dépôts, accusés de réception.
 *
 * LE MIROIR EXACT DE `piece.controller.js`, et le quatrième cas d'une grille qui en compte
 * quatre. Le même fichier pour tout le monde : un modèle de document dont le corps est un PDF,
 * servi tel quel (livret d'accueil, règlement intérieur). Un fichier propre à un stagiaire qu'il
 * FOURNIT : les pièces justificatives (migration 127). Un fichier reçu de l'extérieur : le
 * document importé (145). Manquait celui-ci — un fichier propre à un stagiaire que l'ÉCOLE lui
 * remet : un diplôme obtenu ailleurs, l'attestation d'un certificateur, une carte
 * professionnelle, un courrier nominatif.
 *
 * TROIS DIFFÉRENCES AVEC LES PIÈCES, et elles expliquent tout ce fichier :
 *
 *   · LE SENS DU DÉPÔT EST INVERSÉ. Seule l'école dépose ; le stagiaire ne peut que recevoir.
 *     Un stagiaire qui pourrait déposer ici se remettrait un diplôme à lui-même.
 *   · L'ACCUSÉ DE RÉCEPTION REMPLACE LA VÉRIFICATION. Là-bas l'école contrôle ce qu'elle
 *     reçoit ; ici c'est le stagiaire qui confirme ce qu'il a reçu. L'étape n'est donc PAS
 *     terminée au dépôt — déposer n'est pas remettre.
 *   · ON NE DÉDUIT JAMAIS LA RÉCEPTION D'UN TÉLÉCHARGEMENT. Ouvrir un fichier n'est pas
 *     l'accepter, et un contrôle Qualiopi ne se satisfait pas d'un journal d'accès. Il faut le
 *     geste, et il est horodaté.
 *
 * PAS DE STATUT DE REFUS, contrairement aux pièces. Le stagiaire qui reçoit le mauvais document
 * appelle l'école, qui remplace le fichier. Un aller-retour modélisé ici ajouterait un état à
 * comprendre pour un cas que le téléphone règle en une minute.
 *
 * Les fichiers vivent en BLOB CHIFFRÉ, comme les pièces : rien sur disque, donc rien à nettoyer,
 * la suppression suit la cascade, et rien n'apparaît en clair dans une sauvegarde.
 */
const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { encryptBytes, decryptBytes } = require('../lib/crypto.js');

// Migration 160 non jouée : on dégrade au lieu de renvoyer une 500 incompréhensible.
const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const ABSENTE = { message: 'Migration 160 non jouée.' };

const STATUTS = ['ATTENDUE', 'REMISE', 'RECUE'];

/* Ce qu'on accepte. Un document remis est le plus souvent un PDF scanné — un diplôme, une
 * attestation — d'où un plafond plus large qu'une photo. Pas de type bureautique : un document
 * remis se lit, il ne s'édite pas, et accepter du .docx ouvrirait la porte aux macros. */
const MIMES = ['application/pdf', 'image/webp', 'image/jpeg', 'image/png'];
const MAX_OCTETS = 10 * 1024 * 1024;
const LIB_FORMAT = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'application/pdf': 'PDF' };
const formatsLisibles = (mimes) => mimes.map((m) => LIB_FORMAT[m] || m).join(', ');

/* ─── Référentiel : ce que l'organisme PEUT remettre ─────────────────────────────────────── */

const listTypes = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT id, code, label, consigne, active FROM remise_type WHERE organization_id = ? ORDER BY label',
            [req.user.organization_id]);
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur types de remise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const champsType = (b) => ({
    code: String(b.code || '').trim().toUpperCase().replace(/\s+/g, '_').slice(0, 60),
    label: String(b.label || '').trim().slice(0, 160),
    consigne: String(b.consigne || '').trim().slice(0, 400) || null,
    active: b.active === false || b.active === 0 ? 0 : 1,
});

const createType = async (req, res) => {
    try {
        const c = champsType(req.body || {});
        if (!c.code || !c.label) return res.status(422).json({ message: 'Un code et un intitulé sont requis.' });
        const id = crypto.randomUUID();
        await db.promise().query(
            'INSERT INTO remise_type (id, organization_id, code, label, consigne, active) VALUES (?, ?, ?, ?, ?, ?)',
            [id, req.user.organization_id, c.code, c.label, c.consigne, c.active]);
        logAudit(req, 'remise_type.create', 'RemiseType', id);
        res.status(201).json({ success: true, id });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Ce code existe déjà pour un autre type de remise.' });
        }
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur création type de remise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const updateType = async (req, res) => {
    try {
        const c = champsType(req.body || {});
        if (!c.code || !c.label) return res.status(422).json({ message: 'Un code et un intitulé sont requis.' });
        const [r] = await db.promise().query(
            'UPDATE remise_type SET code = ?, label = ?, consigne = ?, active = ? WHERE id = ? AND organization_id = ?',
            [c.code, c.label, c.consigne, c.active, req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Type de remise introuvable.' });
        logAudit(req, 'remise_type.update', 'RemiseType', req.params.id);
        res.json({ success: true });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Ce code existe déjà pour un autre type de remise.' });
        }
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur mise à jour type de remise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Supprimer un type de remise.
 *
 * ON REFUSE SI DES REMISES EXISTENT, et on dit combien. La cascade effacerait les fichiers ET
 * les accusés de réception — c'est-à-dire la preuve, opposable lors d'un contrôle, qu'un
 * document a bien été remis. Un type devenu inutile se DÉSACTIVE : il disparaît des parcours
 * sans rien effacer de ce qui a déjà eu lieu.
 */
const deleteType = async (req, res) => {
    try {
        const conn = db.promise();
        const [[n]] = await conn.query('SELECT COUNT(*) AS n FROM remise_document WHERE remise_type_id = ?', [req.params.id]);
        if (n.n > 0) {
            return res.status(409).json({
                message: `Ce type a déjà servi ${n.n} fois. Le supprimer effacerait les fichiers remis `
                    + 'et les accusés de réception, qui sont des preuves de remise. Désactivez-le plutôt : '
                    + 'il disparaîtra des parcours sans rien effacer.',
            });
        }
        const [r] = await conn.query('DELETE FROM remise_type WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Type de remise introuvable.' });
        logAudit(req, 'remise_type.delete', 'RemiseType', req.params.id);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur suppression type de remise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ─── Les remises d'un dossier ───────────────────────────────────────────────────────────── */

async function remisesDuDossier(conn, orgId, enrollmentId) {
    /* CASCADE SUR `sans_objet` (migration 161), et ce n'est pas du zèle : demander une colonne
       absente fait échouer la requête ENTIÈRE, et `noTable` la rattrape en rendant une liste
       vide. Toutes les remises auraient donc disparu de l'écran chez qui a joué la 160 mais pas
       la 161 — une fonctionnalité qui marchait, effacée par l'ajout d'une option. On relit sans
       la colonne, et personne n'est exclu : le comportement d'avant la 161. */
    const requete = (col) =>
        `SELECT rt.id AS remise_type_id, rt.code, rt.label, rt.consigne,
                r.id AS remise_id, r.statut, ${col} AS sans_objet,
                DATE_FORMAT(r.remis_le, '%Y-%m-%d %H:%i') AS remis_le,
                DATE_FORMAT(r.accuse_le, '%Y-%m-%d %H:%i') AS accuse_le,
                COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), u.email) AS remis_par
           FROM enrollment e
           JOIN training_session s ON s.id = e.session_id
           JOIN program_step ps ON ps.program_id = s.program_id AND ps.active = 1 AND ps.remise_id IS NOT NULL
           JOIN remise_type rt ON rt.id = ps.remise_id
           LEFT JOIN remise_document r ON r.enrollment_id = e.id AND r.remise_type_id = rt.id
           LEFT JOIN user u ON u.id = r.remis_par
          WHERE e.id = ? AND e.organization_id = ?
          ORDER BY ps.sort_order, rt.label`;
    let rows;
    try { [rows] = await conn.query(requete('COALESCE(r.sans_objet, 0)'), [enrollmentId, orgId]); }
    catch (e) {
        if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e;
        [rows] = await conn.query(requete('0'), [enrollmentId, orgId]);
    }
    const ids = rows.map((r) => r.remise_id).filter(Boolean);
    let parRemise = {};
    if (ids.length) {
        // Les octets ne sortent JAMAIS de la liste : de quoi afficher un lien, rien de plus.
        const [fs] = await conn.query(
            'SELECT id, remise_id, nom, mime, taille, sort_order FROM remise_fichier WHERE remise_id IN (?) ORDER BY sort_order, created_at',
            [ids]);
        parRemise = fs.reduce((acc, f) => { (acc[f.remise_id] ||= []).push(f); return acc; }, {});
    }
    return rows.map((r) => ({
        ...r, statut: r.statut || 'ATTENDUE', sans_objet: !!r.sans_objet,
        fichiers: parRemise[r.remise_id] || [],
    }));
}

/**
 * Le dossier appartient-il au demandeur ? (stagiaire) — sinon il faut être du personnel.
 *
 * COPIE DÉLIBÉRÉE de `dossierDe` dans `piece.controller.js`. L'extraire dans une bibliothèque
 * partagée casserait `securite-comptes.test.js`, qui découpe ce fichier-là ENTRE
 * `const listDossier` et `async function dossierDe` pour vérifier que la garde de propriété y
 * est bien appelée. Les six lignes sont donc recopiées, et la même garde est testée des deux
 * côtés — c'est la protection qui compte, pas l'endroit où elle est écrite.
 */
async function dossierDe(conn, enrollmentId, orgId) {
    const [[e]] = await conn.query(
        `SELECT e.id, e.organization_id, l.user_id
           FROM enrollment e JOIN learner l ON l.id = e.learner_id
          WHERE e.id = ? AND e.organization_id = ?`,
        [enrollmentId, orgId]);
    return e || null;
}

/** GET /api/remises/dossier/:enrollmentId — l'école comme le stagiaire, chacun le sien. */
const listDossier = async (req, res) => {
    try {
        const conn = db.promise();
        /* GARDE DE PROPRIÉTÉ, même règle que pour les pièces : la route est ouverte au stagiaire
           (il doit voir ce qu'on lui remet), donc sans elle il lirait les MÉTADONNÉES du dossier
           d'un autre — intitulés, dates, et NOMS de fichiers, qui portent souvent un nom de
           personne. Les octets restent protégés à part (`servirFichier` re-vérifie). */
        const e = await dossierDe(conn, req.params.enrollmentId, req.user.organization_id);
        if (!e) return res.status(404).json({ message: 'Dossier introuvable.' });
        const staff = req.user.role !== 'STAGIAIRE' && req.user.role !== 'INTERVENANT';
        if (e.user_id !== req.user.id && !staff) return res.status(403).json({ message: "Dossier d'un autre stagiaire." });
        res.json({ data: await remisesDuDossier(conn, req.user.organization_id, req.params.enrollmentId) });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur remises du dossier :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/remises/dossier/:enrollmentId/:remiseTypeId — l'école dépose un fichier.
 *
 * L'ÉCOLE SEULEMENT (la route porte `authorizeRoles`). C'est la différence de fond avec les
 * pièces : un stagiaire qui déposerait ici se remettrait un document à lui-même, et l'accusé de
 * réception qu'il signerait ensuite ne vaudrait rien.
 *
 * DÉPOSER NE TERMINE PAS L'ÉTAPE. La remise passe à REMISE, pas à RECUE : c'est le stagiaire qui
 * conclut. Un dépôt qui vaudrait remise ferait compter dans le score de conformité un document
 * que personne n'a jamais ouvert.
 *
 * REMPLACER UN FICHIER REMET L'ACCUSÉ À ZÉRO. Si l'école corrige le document après coup, l'ancien
 * accusé ne porte plus sur ce qui est remis : le laisser ferait dire au dossier que le stagiaire
 * a reçu un document qu'il n'a jamais vu.
 */
const deposer = async (req, res) => {
    try {
        const f = req.file;
        if (!f || !f.buffer?.length) return res.status(422).json({ message: 'Fichier requis.' });
        if (f.buffer.length > MAX_OCTETS) {
            return res.status(413).json({ message: `Fichier trop lourd (${Math.round(MAX_OCTETS / 1024 / 1024)} Mo maximum).` });
        }
        if (!MIMES.includes(String(f.mimetype))) {
            return res.status(415).json({ message: `Format refusé. Acceptés : ${formatsLisibles(MIMES)}.` });
        }
        const conn = db.promise();
        const e = await dossierDe(conn, req.params.enrollmentId, req.user.organization_id);
        if (!e) return res.status(404).json({ message: 'Dossier introuvable.' });
        const [[rt]] = await conn.query('SELECT label FROM remise_type WHERE id = ? AND organization_id = ?',
            [req.params.remiseTypeId, req.user.organization_id]);
        if (!rt) return res.status(404).json({ message: 'Type de remise introuvable.' });

        await conn.query(
            `INSERT INTO remise_document (id, organization_id, enrollment_id, remise_type_id, statut, remis_par, remis_le)
             VALUES (?, ?, ?, ?, 'REMISE', ?, NOW())
             ON DUPLICATE KEY UPDATE statut = 'REMISE', remis_par = VALUES(remis_par), remis_le = NOW(),
                                     accuse_le = NULL`,
            [crypto.randomUUID(), req.user.organization_id, req.params.enrollmentId, req.params.remiseTypeId, req.user.id]);
        const [[r]] = await conn.query(
            'SELECT id FROM remise_document WHERE enrollment_id = ? AND remise_type_id = ?',
            [req.params.enrollmentId, req.params.remiseTypeId]);
        const [[n]] = await conn.query('SELECT COALESCE(MAX(sort_order), 0) AS m FROM remise_fichier WHERE remise_id = ?', [r.id]);
        await conn.query(
            'INSERT INTO remise_fichier (id, remise_id, sort_order, nom, mime, bytes, taille) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), r.id, n.m + 1, String(f.originalname || '').slice(0, 200) || null,
                f.mimetype, encryptBytes(f.buffer), f.buffer.length]); // `taille` = taille CLAIRE
        logAudit(req, 'remise.depot', 'RemiseDocument', r.id);
        res.status(201).json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur dépôt de remise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/remises/:id/accuser — le STAGIAIRE confirme avoir reçu.
 *
 * LE GESTE EST À LUI, ET À PERSONNE D'AUTRE. Un membre du personnel qui pourrait accuser à sa
 * place produirait une preuve fabriquée par celui qu'elle est censée engager — exactement ce
 * qu'un contrôle vient chercher. La route refuse donc le personnel, explicitement.
 *
 * On n'accuse que ce qui a été remis : sans fichier, il n'y a rien à recevoir.
 */
const accuser = async (req, res) => {
    try {
        const conn = db.promise();
        const [[r]] = await conn.query(
            `SELECT r.id, r.statut, l.user_id, (SELECT COUNT(*) FROM remise_fichier rf WHERE rf.remise_id = r.id) AS n
               FROM remise_document r
               JOIN enrollment e ON e.id = r.enrollment_id
               JOIN learner l ON l.id = e.learner_id
              WHERE r.id = ? AND r.organization_id = ?`,
            [req.params.id, req.user.organization_id]);
        if (!r) return res.status(404).json({ message: 'Remise introuvable.' });
        if (r.user_id !== req.user.id) {
            return res.status(403).json({ message: "L'accusé de réception ne peut être signé que par le stagiaire lui-même." });
        }
        if (!r.n) return res.status(422).json({ message: 'Aucun fichier remis : il n\'y a rien à recevoir.' });
        if (r.statut === 'RECUE') return res.json({ success: true }); // déjà fait : pas une erreur
        await conn.query("UPDATE remise_document SET statut = 'RECUE', accuse_le = NOW() WHERE id = ?", [r.id]);
        logAudit(req, 'remise.accusee', 'RemiseDocument', r.id);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur accusé de réception :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/remises/dossier/:enrollmentId/:remiseTypeId/sans-objet — exclure CETTE personne.
 *
 * POURQUOI CE GESTE EXISTE. Une remise cochée dans un parcours s'applique à tous les stagiaires
 * de la formation. Or certaines ne concernent qu'une partie d'entre eux — un diplôme que
 * plusieurs ont déjà, une carte professionnelle acquise ailleurs. L'étape restait « à faire »
 * pour des gens qui n'attendaient rien, et leur dossier paraissait incomplet à vie.
 *
 * POURQUOI PAS `applies_when`, QUI EXISTE DÉJÀ. Cette colonne-là porte une RÈGLE, évaluée sur
 * les données de la fiche : « seulement si le financement est X ». Elle répond parfaitement
 * quand la distinction se lit dans une donnée. Ici c'est l'autre cas — un jugement au cas par
 * cas, qu'aucune règle n'anticipe. Les deux coexistent sans se remplacer.
 *
 * LA LIGNE EST CRÉÉE SI ELLE N'EXISTE PAS : on exclut le plus souvent AVANT tout dépôt, et il
 * n'y a alors rien en base à marquer. C'est ce qui rend l'exclusion utilisable au moment où on
 * y pense — à l'inscription — plutôt qu'après un dépôt qu'on ne voulait pas faire.
 *
 * ON NE TOUCHE NI AUX FICHIERS NI À L'ACCUSÉ. Exclure n'efface rien : rétablir rend l'étape
 * telle qu'elle était. Un drapeau, pas un statut — cf. migration 161.
 */
const basculerSansObjet = async (req, res) => {
    try {
        const conn = db.promise();
        const e = await dossierDe(conn, req.params.enrollmentId, req.user.organization_id);
        if (!e) return res.status(404).json({ message: 'Dossier introuvable.' });
        const [[rt]] = await conn.query('SELECT id FROM remise_type WHERE id = ? AND organization_id = ?',
            [req.params.remiseTypeId, req.user.organization_id]);
        if (!rt) return res.status(404).json({ message: 'Type de remise introuvable.' });
        const exclu = req.body && req.body.sans_objet === false ? 0 : 1;
        await conn.query(
            `INSERT INTO remise_document (id, organization_id, enrollment_id, remise_type_id, statut, sans_objet)
             VALUES (?, ?, ?, ?, 'ATTENDUE', ?)
             ON DUPLICATE KEY UPDATE sans_objet = VALUES(sans_objet)`,
            [crypto.randomUUID(), req.user.organization_id, req.params.enrollmentId, req.params.remiseTypeId, exclu]);
        logAudit(req, exclu ? 'remise.sans_objet' : 'remise.reintegree', 'RemiseDocument', req.params.remiseTypeId);
        res.json({ success: true, sans_objet: !!exclu });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: 'Migration 161 non jouée.' });
        console.error('Erreur exclusion de remise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/remises/fichier/:id — servir un fichier.
 *
 * `inline` avec son nom : un document remis se REGARDE avant d'en accuser réception. Aucun
 * cache : le fichier porte un nom, parfois une date de naissance, et n'a pas à traîner dans le
 * cache d'un navigateur partagé.
 *
 * ⚠️ SERVIR NE VAUT PAS RECEVOIR. Cette route ne touche NI au statut NI à `accuse_le` : déduire
 * la réception d'un téléchargement fabriquerait une preuve que personne n'a donnée.
 */
const servirFichier = async (req, res) => {
    try {
        const conn = db.promise();
        const [[f]] = await conn.query(
            `SELECT rf.mime, rf.bytes, rf.nom, r.organization_id, l.user_id
               FROM remise_fichier rf
               JOIN remise_document r ON r.id = rf.remise_id
               JOIN enrollment e ON e.id = r.enrollment_id
               JOIN learner l ON l.id = e.learner_id
              WHERE rf.id = ?`, [req.params.id]);
        if (!f || f.organization_id !== req.user.organization_id) {
            return res.status(404).json({ message: 'Fichier introuvable.' });
        }
        const staff = req.user.role !== 'STAGIAIRE' && req.user.role !== 'INTERVENANT';
        if (f.user_id !== req.user.id && !staff) return res.status(403).json({ message: "Fichier d'un autre stagiaire." });
        const nom = (f.nom || 'document').replace(/[^\w .\-()]/g, '_');
        res.setHeader('Content-Type', f.mime);
        res.setHeader('Content-Disposition', `inline; filename="${nom}"`);
        res.setHeader('Cache-Control', 'no-store, private');
        res.send(decryptBytes(f.bytes));
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur fichier de remise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/remises/fichier/:id — l'école retire un fichier remis.
 *
 * RETIRER LE FICHIER ANNULE L'ACCUSÉ, pour la même raison qu'un remplacement : un accusé sans
 * document ne prouve plus rien, et le laisser ferait dire au dossier qu'un stagiaire a reçu ce
 * qui n'existe plus. La remise redevient ATTENDUE quand il ne reste aucun fichier.
 */
const supprimerFichier = async (req, res) => {
    try {
        const conn = db.promise();
        const [[f]] = await conn.query(
            `SELECT rf.id, r.id AS remise_id, r.organization_id
               FROM remise_fichier rf JOIN remise_document r ON r.id = rf.remise_id
              WHERE rf.id = ?`, [req.params.id]);
        if (!f || f.organization_id !== req.user.organization_id) {
            return res.status(404).json({ message: 'Fichier introuvable.' });
        }
        await conn.query('DELETE FROM remise_fichier WHERE id = ?', [f.id]);
        const [[n]] = await conn.query('SELECT COUNT(*) AS n FROM remise_fichier WHERE remise_id = ?', [f.remise_id]);
        await conn.query(
            `UPDATE remise_document SET statut = ?, accuse_le = NULL WHERE id = ?`,
            [n.n ? 'REMISE' : 'ATTENDUE', f.remise_id]);
        logAudit(req, 'remise.fichier_supprime', 'RemiseDocument', f.remise_id);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur suppression fichier de remise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    listTypes, createType, updateType, deleteType,
    listDossier, remisesDuDossier, deposer, accuser, basculerSansObjet, servirFichier, supprimerFichier,
    STATUTS, MIMES, MAX_OCTETS,
};

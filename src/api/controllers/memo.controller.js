const crypto = require('crypto');
const db = require('../config/database.js');
const { lireNouveauMemo, lireModification, lireLiens, TYPES_LIEN, GENRES } = require('../lib/memos.js');
const { aLaCapacite } = require('../lib/capacites.js');
const { encryptBytes, decryptBytes } = require('../lib/crypto.js'); // pièces jointes chiffrées au repos
const { lireFichiers, lireNoms, PIECES_INDISPONIBLES } = require('../lib/memoFichiers.js');
const { STAFF_ROLES } = require('../middlewares/auth.middleware.js');

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
const PAS_DE_LIENS = 'Les liens des mémos arrivent avec la migration 177 (non jouée).';

/* LES PIÈCES JOINTES (migration 193) — deux au plus par mémo : une image ou un PDF.
 *
 * Elles suivent la règle de leur mémo, sans en ajouter une : qui VOIT le mémo ouvre ses pièces
 * (`memoVisible`), et elles partent avec lui. Elles se posent à la CRÉATION et ne se retouchent
 * plus — comme le texte, qu'aucune route ne modifie.
 *
 * MÊME CASCADE QUE LES LIENS : sans la 193, la table manque, la liste rend des mémos sans pièce et
 * dit que les pièces ne sont pas disponibles (`pieces_jointes: false`, l'écran cache alors le
 * bouton « Joindre »), et un mémo envoyé AVEC un fichier n'est pas créé à moitié. */
async function piecesDisponibles(conn) {
    try { await conn.query('SELECT 1 FROM memo_fichier LIMIT 1'); return true; }
    catch (e) { if (TABLE_ABSENTE(e)) return false; throw e; }
}

/* UN ENVOI AVEC FICHIERS ARRIVE EN MULTIPART, où tout champ est du TEXTE : « true » n'y est pas
   `true`, et les liens y sont un tableau écrit en JSON. On les remet dans la forme que le JSON
   donnait — `lireNouveauMemo` garde sa règle stricte (un mémo ne se partage que sur un vrai `true`),
   et c'est ici, et seulement pour cette forme d'envoi, que le texte est relu. */
function corpsDuMemo(req) {
    const b = req.body || {};
    if (!Array.isArray(req.files)) return b;
    let liens = b.liens;
    if (typeof liens === 'string' && liens) { try { liens = JSON.parse(liens); } catch { liens = 'illisible'; } }
    return { ...b, partage: b.partage === true || b.partage === 'true', liens };
}

/* LES MENTIONS (migration 177) — @ pour qui, # pour quoi.
 *
 * Mentionner un COLLÈGUE lui montre le mémo, même non partagé avec l'équipe, et allume une pastille
 * sur son bouton tant qu'il ne l'a pas ouvert : c'est `memo_lien` de type « membre », `vu_le` à NULL.
 * Les autres types ne font que lier une fiche.
 *
 * TOUT PASSE PAR UNE CASCADE : sans la 177, la table manque, et chaque lecture retombe sur la forme
 * d'avant — des mémos sans liens, sans pastille. Le code marche donc avant comme après. */
const JOINTURE_PING = 'LEFT JOIN memo_lien p ON p.memo_id = m.id AND p.type = \'membre\' AND p.cible_id = ?';
const VISIBLE_AVEC_PING = '(m.auteur_id = ? OR m.partage = 1 OR p.memo_id IS NOT NULL)';

/* Qui peut voir ce mémo : son auteur, ou tout le monde s'il est partagé. */
const VISIBLE = '(m.auteur_id = ? OR m.partage = 1)';

const nom = (prenom, nomFamille) => [prenom, nomFamille].filter(Boolean).join(' ').trim() || null;

/* Une ligne → ce que l'écran affiche. `mien` décide des boutons : supprimer et partager ne
   s'offrent qu'à l'auteur. Le nom de l'auteur n'est donné que pour les mémos des AUTRES. */
function versEcran(r, moi, liens = [], fichiers = []) {
    const mien = String(r.auteur_id) === String(moi);
    return {
        // Le nom, le type et le poids seulement : les octets ne voyagent qu'à l'ouverture.
        fichiers,
        /* MENTIONNÉ ET PAS ENCORE OUVERT : ce que compte la pastille, et ce que la liste met en tête. */
        nouveau: !!r.ping && !r.ping_vu && !r.fait_le,
        liens,
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
    const conn = db.promise();
    const colonnes = `m.id, m.texte, DATE_FORMAT(m.echeance, '%Y-%m-%d') AS echeance, m.partage,
                    DATE_FORMAT(m.fait_le, '%Y-%m-%d %H:%i') AS fait_le,
                    DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i') AS cree_le,
                    m.auteur_id, a.first_name AS auteur_prenom, a.last_name AS auteur_nom,
                    f.first_name AS fait_par_prenom, f.last_name AS fait_par_nom`;
    const fin = `ORDER BY (m.fait_le IS NOT NULL), (m.echeance IS NULL), m.echeance, m.fait_le DESC, m.created_at DESC`;
    try {
        let rows;
        let liens = [];
        try {
            /* AVEC LA 177 : les mémos où je suis mentionné entrent dans la liste, et `ping_vu` dit
               si je les ai déjà ouverts — c'est la pastille du bouton. */
            [rows] = await conn.query(
                `SELECT ${colonnes}, p.memo_id AS ping, p.vu_le AS ping_vu
                   FROM memo m
                   LEFT JOIN user a ON a.id = m.auteur_id
                   LEFT JOIN user f ON f.id = m.fait_par
                   ${JOINTURE_PING}
                  WHERE m.organization_id = ? AND ${VISIBLE_AVEC_PING}
                  ${fin}`,
                [req.user.id, req.user.organization_id, req.user.id]);
            if (rows.length) {
                [liens] = await conn.query(
                    'SELECT memo_id, type, cible_id, libelle FROM memo_lien WHERE memo_id IN (?) ORDER BY type, libelle',
                    [rows.map((r) => r.id)]);
            }
        } catch (e) {
            if (!TABLE_ABSENTE(e)) throw e;
            // Sans la 177 : ni liens ni mentions, le reste inchangé (cf. la cascade en tête).
            [rows] = await conn.query(
                `SELECT ${colonnes} FROM memo m
                   LEFT JOIN user a ON a.id = m.auteur_id
                   LEFT JOIN user f ON f.id = m.fait_par
                  WHERE m.organization_id = ? AND ${VISIBLE} ${fin}`,
                [req.user.organization_id, req.user.id]);
        }
        const parMemo = new Map();
        for (const l of liens) {
            if (!parMemo.has(l.memo_id)) parMemo.set(l.memo_id, []);
            parMemo.get(l.memo_id).push({ type: l.type, id: l.cible_id, libelle: l.libelle });
        }
        /* LES PIÈCES JOINTES (193), sans leurs octets. Sans la table, aucune — et l'écran le sait. */
        let pieces = true;
        const fichiersDe = new Map();
        if (rows.length) {
            try {
                const [fichiers] = await conn.query(
                    'SELECT id, memo_id, nom, mime, octets FROM memo_fichier WHERE memo_id IN (?) ORDER BY memo_id, rang',
                    [rows.map((r) => r.id)]);
                for (const f of fichiers) {
                    if (!fichiersDe.has(f.memo_id)) fichiersDe.set(f.memo_id, []);
                    fichiersDe.get(f.memo_id).push({ id: f.id, nom: f.nom, mime: f.mime, octets: Number(f.octets) || 0 });
                }
            } catch (e) {
                if (!TABLE_ABSENTE(e)) throw e;
                pieces = false;
            }
        } else {
            pieces = await piecesDisponibles(conn);
        }
        res.json({
            data: rows.map((r) => versEcran(r, req.user.id, parMemo.get(r.id) || [], fichiersDe.get(r.id) || [])),
            pieces_jointes: pieces,
        });
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
    const conn = db.promise();
    try {
        let echus = 0;
        let nouveaux = 0;
        try {
            const [[r]] = await conn.query(
                `SELECT
                    SUM(m.fait_le IS NULL AND m.echeance IS NOT NULL AND m.echeance <= CURDATE()) AS echus,
                    SUM(m.fait_le IS NULL AND p.memo_id IS NOT NULL AND p.vu_le IS NULL) AS nouveaux
                   FROM memo m ${JOINTURE_PING}
                  WHERE m.organization_id = ? AND ${VISIBLE_AVEC_PING}`,
                [req.user.id, req.user.organization_id, req.user.id]);
            echus = Number(r && r.echus) || 0;
            nouveaux = Number(r && r.nouveaux) || 0;
        } catch (e) {
            if (!TABLE_ABSENTE(e)) throw e;
            const [[r]] = await conn.query(
                `SELECT COUNT(*) AS n FROM memo m
                  WHERE m.organization_id = ? AND ${VISIBLE}
                    AND m.fait_le IS NULL AND m.echeance IS NOT NULL AND m.echeance <= CURDATE()`,
                [req.user.organization_id, req.user.id]);
            echus = Number(r && r.n) || 0;
        }
        res.json({ data: { echus, nouveaux, disponible: true } });
    } catch (e) {
        if (TABLE_ABSENTE(e)) return res.json({ data: { echus: 0, nouveaux: 0, disponible: false } });
        return echec(res, e, 'compte');
    }
};

/**
 * POST /api/memos/vus — « j'ai ouvert mon mémo » : les mentions qui me visent cessent d'être neuves.
 * C'est un GESTE, pas un rafraîchissement : seul l'ouverture du panneau l'appelle, sinon la pastille
 * s'éteindrait toute seule au premier sondage, sans que personne n'ait rien lu.
 */
const marquerVus = async (req, res) => {
    try {
        const [r] = await db.promise().query(
            `UPDATE memo_lien l JOIN memo m ON m.id = l.memo_id
                SET l.vu_le = NOW()
              WHERE l.type = 'membre' AND l.cible_id = ? AND l.vu_le IS NULL AND m.organization_id = ?`,
            [req.user.id, req.user.organization_id]);
        res.json({ data: { vus: Number(r && r.affectedRows) || 0 } });
    } catch (e) {
        if (TABLE_ABSENTE(e)) return res.json({ data: { vus: 0 } });
        return echec(res, e, 'lecture des mentions');
    }
};

/** POST /api/memos — { texte, echeance?, partage?, liens? }, en JSON ; ou en multipart avec
 *  `fichiers` (deux au plus). Un mémo naît privé, sauf demande explicite. */
const createMemo = async (req, res) => {
    const corps = corpsDuMemo(req);
    const lu = lireNouveauMemo(corps);
    if (lu.erreur) return res.status(422).json({ message: lu.erreur });
    const lus = lireLiens(corps.liens);
    if (lus.erreur) return res.status(422).json({ message: lus.erreur });
    /* Les pièces sont lues AVANT toute écriture : un fichier refusé ne doit pas laisser un mémo. */
    const joints = lireFichiers(req.files, lireNoms(corps.noms));
    if (joints.erreur) return res.status(joints.statut).json({ message: joints.erreur });
    const { texte, echeance, partage } = lu.valeurs;
    /* ON NE SE MENTIONNE PAS SOI-MÊME : le mémo est déjà le sien, et la pastille s'allumerait pour
       son propre auteur. Le lien est retiré en silence — c'est un clic de trop, pas une faute. */
    const liens = lus.liens.filter((l) => !(l.type === 'membre' && l.id === String(req.user.id).toLowerCase()));
    const conn = db.promise();
    try {
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO memo (id, organization_id, auteur_id, texte, echeance, partage)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, req.user.id, texte, echeance, partage ? 1 : 0]);
        if (liens.length) {
            try {
                await conn.query(
                    'INSERT INTO memo_lien (memo_id, type, cible_id, libelle) VALUES ?',
                    [liens.map((l) => [id, l.type, l.id, l.libelle])]);
            } catch (e) {
                if (!TABLE_ABSENTE(e)) throw e;
                /* SANS LA 177, UN MÉMO À LIENS N'EST PAS À MOITIÉ CRÉÉ : on retire celui qu'on vient
                   d'écrire et on le dit. Le garder sans ses liens ferait disparaître en silence la
                   personne mentionnée — donc la raison même du mémo. */
                await conn.query('DELETE FROM memo WHERE id = ? AND organization_id = ?', [id, req.user.organization_id]);
                return res.status(503).json({ message: PAS_DE_LIENS });
            }
        }
        if (joints.fichiers.length) {
            try {
                await conn.query(
                    'INSERT INTO memo_fichier (id, memo_id, nom, mime, octets, bytes, rang) VALUES ?',
                    [joints.fichiers.map((f, i) => [crypto.randomUUID(), id, f.nom, f.mime, f.octets, encryptBytes(f.contenu), i])]);
            } catch (e) {
                /* UN MÉMO N'EST PAS CRÉÉ SANS CE QU'ON Y A JOINT : « voir la capture » sans la
                   capture ne veut plus rien dire. On retire celui qu'on vient d'écrire (ses liens
                   partent avec lui), que la table manque ou que l'écriture ait échoué. */
                await conn.query('DELETE FROM memo WHERE id = ? AND organization_id = ?', [id, req.user.organization_id]);
                if (TABLE_ABSENTE(e)) return res.status(503).json({ message: PIECES_INDISPONIBLES });
                throw e;
            }
        }
        res.status(201).json({ data: { id } });
    } catch (e) {
        return echec(res, e, 'création');
    }
};

/**
 * GET /api/memos/cibles?q=&genre=@|# — ce que @ et # proposent, six par type au plus.
 *
 * CHACUN NE CHERCHE QUE CE QU'IL PEUT OUVRIR : les types sont filtrés par la rubrique qu'ils
 * demandent (`TYPES_LIEN.capacite`), lue UNE FOIS dans `nav_access`. Proposer une facture à qui n'a
 * pas la rubrique lui ferait noter un numéro qu'il ne pourra pas ouvrir — et le lui apprendrait.
 */
const chercherCibles = async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60);
    const genre = GENRES.includes(req.query.genre) ? req.query.genre : null;
    const conn = db.promise();
    try {
        const [[compte]] = await conn.query('SELECT nav_access FROM user WHERE id = ?', [req.user.id]);
        const plein = ['SUPER_ADMIN', 'ADMIN_ORGANISME'].includes(req.user.role);
        const peut = (cap) => !cap || plein || aLaCapacite(compte && compte.nav_access, cap);
        const types = Object.entries(TYPES_LIEN)
            .filter(([, t]) => (!genre || t.genre === genre) && peut(t.capacite));
        /* Le caractère d'échappement de LIKE est écrit en clair : un « % » tapé par l'utilisateur
           doit chercher un « % », pas tout le fichier. */
        const like = `%${q.replace(/[%_]/g, ' ')}%`;
        const org = req.user.organization_id;
        const sorties = [];
        for (const [type] of types) {
            if (type === 'stagiaire') {
                const [r] = await conn.query(
                    `SELECT id, first_name, last_name, town FROM learner
                      WHERE organization_id = ?
                        AND (first_name LIKE ? OR last_name LIKE ? OR CONCAT_WS(' ', first_name, last_name) LIKE ?)
                      ORDER BY last_name, first_name LIMIT 6`, [org, like, like, like]);
                sorties.push(...r.map((x) => ({ type, id: x.id, libelle: `${x.first_name || ''} ${x.last_name || ''}`.trim(), detail: x.town || null })));
            } else if (type === 'entreprise') {
                const [r] = await conn.query(
                    'SELECT id, name, town FROM company WHERE organization_id = ? AND name LIKE ? ORDER BY name LIMIT 6', [org, like]);
                sorties.push(...r.map((x) => ({ type, id: x.id, libelle: x.name, detail: x.town || null })));
            } else if (type === 'membre') {
                const [r] = await conn.query(
                    `SELECT id, first_name, last_name, role FROM user
                      WHERE organization_id = ? AND role IN (?) AND id <> ?
                        AND (first_name LIKE ? OR last_name LIKE ? OR CONCAT_WS(' ', first_name, last_name) LIKE ?)
                      ORDER BY last_name, first_name LIMIT 6`, [org, STAFF_ROLES, req.user.id, like, like, like]);
                sorties.push(...r.map((x) => ({ type, id: x.id, libelle: `${x.first_name || ''} ${x.last_name || ''}`.trim(), detail: x.role })));
            } else if (type === 'session') {
                const [r] = await conn.query(
                    `SELECT s.id, s.week, s.year, DATE_FORMAT(s.start_date, '%d/%m/%Y') AS debut, p.code, p.title
                       FROM training_session s LEFT JOIN training_program p ON p.id = s.program_id
                      WHERE s.organization_id = ?
                        AND (p.code LIKE ? OR p.title LIKE ? OR CAST(s.week AS CHAR) LIKE ?)
                      ORDER BY s.start_date DESC LIMIT 6`, [org, like, like, like]);
                sorties.push(...r.map((x) => ({
                    type, id: x.id,
                    libelle: `Semaine ${x.week} · ${x.code || x.title || ''}`.trim(),
                    detail: x.debut || String(x.year || ''),
                })));
            } else if (type === 'partenaire') {
                const [r] = await conn.query(
                    'SELECT id, name FROM partner WHERE organization_id = ? AND name LIKE ? ORDER BY name LIMIT 6', [org, like]);
                sorties.push(...r.map((x) => ({ type, id: x.id, libelle: x.name, detail: null })));
            } else if (type === 'facture') {
                const [r] = await conn.query(
                    `SELECT id, number, type AS genre, DATE_FORMAT(created_at, '%d/%m/%Y') AS le
                       FROM invoice WHERE organization_id = ? AND number LIKE ?
                      ORDER BY created_at DESC LIMIT 6`, [org, like]);
                sorties.push(...r.map((x) => ({ type, id: x.id, libelle: x.number, detail: `${x.genre || ''} ${x.le || ''}`.trim() })));
            }
        }
        res.json({ data: sorties });
    } catch (e) {
        return echec(res, e, 'recherche de cibles');
    }
};

/* Le mémo `id`, s'il est visible par ce compte. `null` sinon — privé d'un autre, ou inexistant :
   les deux se répondent pareil. */
async function memoVisible(conn, req) {
    try {
        /* AVEC LA 177, ÊTRE MENTIONNÉ SUFFIT : un collègue qui m'écrit « @moi appeler le
           fournisseur » me confie une tâche — je dois pouvoir la cocher, même s'il ne l'a pas
           partagée avec toute l'équipe. */
        const [[m]] = await conn.query(
            `SELECT m.id, m.auteur_id, m.partage FROM memo m ${JOINTURE_PING}
              WHERE m.id = ? AND m.organization_id = ? AND ${VISIBLE_AVEC_PING}`,
            [req.user.id, req.params.id, req.user.organization_id, req.user.id]);
        return m || null;
    } catch (e) {
        if (!TABLE_ABSENTE(e)) throw e;
        const [[m]] = await conn.query(
            `SELECT m.id, m.auteur_id, m.partage FROM memo m
              WHERE m.id = ? AND m.organization_id = ? AND ${VISIBLE}`,
            [req.params.id, req.user.organization_id, req.user.id]);
        return m || null;
    }
}

/**
 * GET /api/memos/:id/fichiers/:fichier — une pièce jointe, à qui VOIT son mémo : l'auteur, l'équipe
 * s'il est partagé, le collègue mentionné. 404 pour tout le reste, sans dire si elle existe.
 *
 * Servie sous le type PROUVÉ à l'envoi (lib/memoFichiers.js), `nosniff` pour que le navigateur ne
 * le rediscute pas, et « inline » : une image s'affiche, un PDF s'ouvre dans l'onglet. Aucun cache
 * — la règle de toute l'API (server.js) : c'est une note privée, elle ne reste pas sur le poste.
 */
const getFichier = async (req, res) => {
    try {
        const conn = db.promise();
        const m = await memoVisible(conn, req);
        if (!m) return res.status(404).end();
        const [[f]] = await conn.query(
            'SELECT nom, mime, bytes FROM memo_fichier WHERE id = ? AND memo_id = ?', [req.params.fichier, m.id]);
        if (!f) return res.status(404).end();
        const clair = decryptBytes(f.bytes);
        if (clair === null) return res.status(404).end();
        res.set('Content-Type', f.mime);
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.nom)}`);
        res.send(clair);
    } catch (e) {
        if (TABLE_ABSENTE(e)) return res.status(404).end();
        console.error('Erreur mémos (pièce jointe) :', e);
        res.status(500).end();
    }
};

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

module.exports = { listMemos, countMemos, createMemo, getFichier, updateMemo, deleteMemo, clearDoneMemos, marquerVus, chercherCibles, PAS_ENCORE, PAS_DE_LIENS };

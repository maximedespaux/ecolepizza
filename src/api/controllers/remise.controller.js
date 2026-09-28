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
const { colonneExiste } = require('../lib/colonnes.js');
const { companyStepSlugs } = require('../lib/parcours.js');

// Migration 160 non jouée : on dégrade au lieu de renvoyer une 500 incompréhensible.
const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const ABSENTE = { message: 'Migration 160 non jouée.' };

const STATUTS = ['ATTENDUE', 'REMISE', 'RECUE'];

/* À QUI UN DOCUMENT EST REMIS (migration 188, décidé par l'école le 2026-09-28) : le stagiaire, ou
 * son ENTREPRISE — qui le voit alors dans son espace et en accuse réception. Un stagiaire inscrit
 * sans entreprise le reçoit lui-même : personne d'autre ne pourrait le recevoir.
 * UNE ENTREPRISE SANS ESPACE (aucun compte de représentant, `company.user_id` vide) non plus : rien
 * ne s'afficherait nulle part, personne ne pourrait en accuser réception, et l'étape resterait
 * ouverte pour toujours — le bureau ne le peut pas à sa place, c'est voulu. Le stagiaire la reçoit
 * donc, comme s'il était inscrit seul ; l'écran du bureau le dit (`entreprise_sans_espace`). */
const DESTINATAIRES = ['STAGIAIRE', 'ENTREPRISE'];
const pourEntreprise = (r) => r.destinataire === 'ENTREPRISE' && !!r.company_id && !!r.representant;
const entrepriseSansEspace = (r) => r.destinataire === 'ENTREPRISE' && !!r.company_id && !r.representant;
// La colonne du destinataire, ou sa valeur d'avant la 188 : tout au stagiaire.
const colDestinataire = async (conn, alias = 'rt') =>
    (await colonneExiste(conn, 'remise_type', 'destinataire') ? `${alias}.destinataire` : "'STAGIAIRE'");
// Le compte du représentant de l'entreprise (migration 084) — sans lui, aucun.
const colRepresentant = async (conn) => (await colonneExiste(conn, 'company', 'user_id') ? 'c.user_id' : 'NULL');

/* LE BUREAU, NOMMÉ. On testait « ni stagiaire ni intervenant » : un compte ENTREPRISE passait donc
 * pour du personnel, et aurait lu les remises — et les fichiers — de n'importe quel dossier.
 * Depuis que les entreprises reçoivent des remises (188), la liste est explicite. */
const ROLES_BUREAU = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR'];
const estBureau = (u) => !!u && ROLES_BUREAU.includes(u.role);

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
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT id, code, label, consigne, active, ${await colDestinataire(conn, 'remise_type')} AS destinataire
               FROM remise_type WHERE organization_id = ? ORDER BY label`,
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
    destinataire: DESTINATAIRES.includes(b.destinataire) ? b.destinataire : 'STAGIAIRE',
});

/* LE DESTINATAIRE S'ÉCRIT QUAND LA COLONNE EXISTE (188). Sans elle, « stagiaire » est ce que tout le
   monde reçoit déjà : on enregistre sans. « Entreprise » en revanche serait IGNORÉ en silence — le
   document partirait au stagiaire alors qu'on a choisi l'entreprise —, d'où un refus qui le dit. */
async function colonnesDestinataire(conn, c) {
    if (await colonneExiste(conn, 'remise_type', 'destinataire')) return { ok: true, avec: true };
    return c.destinataire === 'ENTREPRISE' ? { ok: false } : { ok: true, avec: false };
}
const MIGRATION_188 = { message: "Migration 188 non jouée : une remise ne peut pas encore être adressée à l'entreprise." };

const createType = async (req, res) => {
    try {
        const c = champsType(req.body || {});
        if (!c.code || !c.label) return res.status(422).json({ message: 'Un code et un intitulé sont requis.' });
        const conn = db.promise();
        const d = await colonnesDestinataire(conn, c);
        if (!d.ok) return res.status(503).json(MIGRATION_188);
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO remise_type (id, organization_id, code, label, consigne, active${d.avec ? ', destinataire' : ''})
             VALUES (?, ?, ?, ?, ?, ?${d.avec ? ', ?' : ''})`,
            [id, req.user.organization_id, c.code, c.label, c.consigne, c.active, ...(d.avec ? [c.destinataire] : [])]);
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
        const conn = db.promise();
        const d = await colonnesDestinataire(conn, c);
        if (!d.ok) return res.status(503).json(MIGRATION_188);
        const [r] = await conn.query(
            `UPDATE remise_type SET code = ?, label = ?, consigne = ?, active = ?${d.avec ? ', destinataire = ?' : ''}
              WHERE id = ? AND organization_id = ?`,
            [c.code, c.label, c.consigne, c.active, ...(d.avec ? [c.destinataire] : []), req.params.id, req.user.organization_id]);
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
    const dest = await colDestinataire(conn);
    const representant = await colRepresentant(conn);
    const requete = (col) =>
        `SELECT rt.id AS remise_type_id, rt.code, rt.label, rt.consigne,
                ${dest} AS destinataire, e.company_id, c.name AS entreprise, ${representant} AS representant,
                ps.active AS actif_parcours, ps.slug AS slug_etape, s.program_id,
                r.id AS remise_id, r.statut, ${col} AS sans_objet,
                DATE_FORMAT(r.remis_le, '%Y-%m-%d %H:%i') AS remis_le,
                DATE_FORMAT(r.accuse_le, '%Y-%m-%d %H:%i') AS accuse_le,
                COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), u.email) AS remis_par
           FROM enrollment e
           JOIN training_session s ON s.id = e.session_id
           JOIN program_step ps ON ps.program_id = s.program_id AND ps.remise_id IS NOT NULL
           JOIN remise_type rt ON rt.id = ps.remise_id
           LEFT JOIN remise_document r ON r.enrollment_id = e.id AND r.remise_type_id = rt.id
           LEFT JOIN user u ON u.id = r.remis_par
           LEFT JOIN company c ON c.id = e.company_id
          WHERE e.id = ? AND e.organization_id = ?
          ORDER BY ps.sort_order, rt.label`;
    let lues;
    try { [lues] = await conn.query(requete('COALESCE(r.sans_objet, 0)'), [enrollmentId, orgId]); }
    catch (e) {
        if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e;
        [lues] = await conn.query(requete('0'), [enrollmentId, orgId]);
    }
    /* LES REMISES QUE CE DOSSIER DOIT SE LISENT DANS SON PARCOURS (2026-09-28). Arrivé par une
       entreprise dont la formation a une section « À l'arrivée via une entreprise », son parcours EST
       cette section : elle REMPLACE celui du dossier (companyParcours, lib/parcours.js). Une remise qui
       n'est QUE là — « entreprise seulement », inactive au parcours du dossier — lui est donc due. On
       ne lisait que `ps.active = 1` : l'AGEFICE de LA CUISINE DE JULIEN s'affichait dans le parcours
       du stagiaire, et nulle part où la déposer. Sans section, les étapes actives du dossier, comme
       avant. */
    const premier = lues[0];
    const section = premier && premier.company_id ? await companyStepSlugs(conn, orgId, premier.program_id) : [];
    const rows = (section.length
        ? lues.filter((r) => section.includes(r.slug_etape))
        : lues.filter((r) => Number(r.actif_parcours) === 1))
        .map(({ actif_parcours: _a, slug_etape: _s, program_id: _p, ...r }) => r);
    const ids = rows.map((r) => r.remise_id).filter(Boolean);
    let parRemise = {};
    if (ids.length) {
        // Les octets ne sortent JAMAIS de la liste : de quoi afficher un lien, rien de plus.
        const [fs] = await conn.query(
            'SELECT id, remise_id, nom, mime, taille, sort_order FROM remise_fichier WHERE remise_id IN (?) ORDER BY sort_order, created_at',
            [ids]);
        parRemise = fs.reduce((acc, f) => { (acc[f.remise_id] ||= []).push(f); return acc; }, {});
    }
    /* `pour_entreprise` : le destinataire EFFECTIF de ce dossier. Adressée à l'entreprise mais
       stagiaire inscrit seul, ou entreprise sans espace : c'est lui qui la reçoit (2026-09-28).
       L'identifiant du compte du représentant ne sort pas d'ici : il n'a servi qu'à trancher. */
    return rows.map(({ representant: _rep, ...r }) => ({
        ...r, statut: r.statut || 'ATTENDUE', sans_objet: !!r.sans_objet,
        destinataire: r.destinataire === 'ENTREPRISE' ? 'ENTREPRISE' : 'STAGIAIRE',
        pour_entreprise: pourEntreprise({ ...r, representant: _rep }),
        entreprise_sans_espace: entrepriseSansEspace({ ...r, representant: _rep }),
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

/**
 * GET /api/remises/groupe/:companyId/:sessionId — les remises des stagiaires qu'une entreprise envoie à
 * une session : une ligne par dossier, avec SES remises (2026-09-28). La fiche entreprise dépose de là
 * ce qui est remis à l'entreprise — l'AGEFICE —, sans passer par la fiche de chaque stagiaire.
 * Les MÊMES remises que le panneau de la fiche stagiaire (`remisesDuDossier`) : deux écrans qui
 * compteraient chacun à sa façon finiraient par se contredire.
 * LE BUREAU SEULEMENT : on y lit les noms des stagiaires et les fichiers d'un dossier.
 */
const remisesDuGroupe = async (req, res) => {
    try {
        if (!estBureau(req.user)) return res.status(403).json({ message: 'Réservé au bureau.' });
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [dossiers] = await conn.query(
            `SELECT e.id AS enrollment_id, e.learner_id, l.first_name, l.last_name
               FROM enrollment e JOIN learner l ON l.id = e.learner_id
              WHERE e.company_id = ? AND e.session_id = ? AND e.organization_id = ?
              ORDER BY l.last_name, l.first_name`,
            [req.params.companyId, req.params.sessionId, orgId]);
        const data = [];
        for (const d of dossiers) data.push({ ...d, remises: await remisesDuDossier(conn, orgId, d.enrollment_id) });
        res.json({ data });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur remises du groupe :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

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
        const staff = estBureau(req.user);
        if (e.user_id !== req.user.id && !staff) return res.status(403).json({ message: "Dossier d'un autre stagiaire." });
        const remises = await remisesDuDossier(conn, req.user.organization_id, req.params.enrollmentId);
        /* LE STAGIAIRE NE VOIT PAS CE QUI EST REMIS À SON ENTREPRISE : ce n'est pas à lui d'en
           accuser réception, et ce document ne lui est pas destiné. Le bureau voit tout. */
        res.json({ data: staff ? remises : remises.filter((r) => !r.pour_entreprise) });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur remises du dossier :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/rep/remises — ce que l'école a remis À L'ENTREPRISE du compte connecté (migration 188).
 *
 * RÉSERVÉ PAR LES DONNÉES, comme tout l'espace entreprise : les dossiers dont `enrollment.company_id`
 * est une entreprise rattachée à ce compte (`company.user_id`), et seulement les remises adressées à
 * l'entreprise. Rien n'est proposé avant le dépôt (ATTENDUE : rien à recevoir), ni ce que l'école a
 * écarté (« sans objet »). Les octets ne sortent pas d'ici : de quoi afficher un lien, rien de plus.
 */
const remisesDeLEntreprise = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        if (!await colonneExiste(conn, 'remise_type', 'destinataire')
            || !await colonneExiste(conn, 'company', 'user_id')) return res.json({ data: [] });
        const [entreprises] = await conn.query(
            'SELECT id FROM company WHERE user_id = ? AND organization_id = ?', [req.user.id, orgId]);
        if (!entreprises.length) return res.json({ data: [] });
        const sansObjet = await colonneExiste(conn, 'remise_document', 'sans_objet') ? ' AND COALESCE(r.sans_objet, 0) = 0' : '';
        const [rows] = await conn.query(
            `SELECT r.id AS remise_id, r.statut, rt.label, rt.consigne,
                    DATE_FORMAT(r.remis_le, '%Y-%m-%d %H:%i') AS remis_le,
                    DATE_FORMAT(r.accuse_le, '%Y-%m-%d %H:%i') AS accuse_le,
                    l.first_name, l.last_name, p.code AS formation, c.name AS entreprise
               FROM remise_document r
               JOIN remise_type rt ON rt.id = r.remise_type_id
               JOIN enrollment e ON e.id = r.enrollment_id
               JOIN learner l ON l.id = e.learner_id
               JOIN company c ON c.id = e.company_id
               LEFT JOIN training_session s ON s.id = e.session_id
               LEFT JOIN training_program p ON p.id = s.program_id
              WHERE r.organization_id = ? AND e.company_id IN (?) AND rt.destinataire = 'ENTREPRISE'
                AND r.statut IN ('REMISE', 'RECUE')${sansObjet}
              ORDER BY r.statut = 'RECUE', r.remis_le DESC`,
            [orgId, entreprises.map((c) => c.id)]);
        const ids = rows.map((r) => r.remise_id);
        let parRemise = {};
        if (ids.length) {
            const [fs] = await conn.query(
                'SELECT id, remise_id, nom, mime, taille, sort_order FROM remise_fichier WHERE remise_id IN (?) ORDER BY sort_order, created_at',
                [ids]);
            parRemise = fs.reduce((acc, f) => { (acc[f.remise_id] ||= []).push(f); return acc; }, {});
        }
        res.json({ data: rows.map((r) => ({ ...r, fichiers: parRemise[r.remise_id] || [] })) });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur remises de l\'entreprise :', err);
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
 * POST /api/remises/:id/accuser — le DESTINATAIRE confirme avoir reçu : le stagiaire, ou le compte
 * de son entreprise quand la remise est adressée à l'entreprise (migration 188).
 *
 * LE GESTE EST AU DESTINATAIRE, ET À PERSONNE D'AUTRE. Un membre du personnel qui pourrait accuser à sa
 * place produirait une preuve fabriquée par celui qu'elle est censée engager — exactement ce
 * qu'un contrôle vient chercher. La route refuse donc le personnel, explicitement.
 *
 * On n'accuse que ce qui a été remis : sans fichier, il n'y a rien à recevoir.
 */
const accuser = async (req, res) => {
    try {
        const conn = db.promise();
        const [[r]] = await conn.query(
            `SELECT r.id, r.statut, l.user_id, e.company_id, ${await colRepresentant(conn)} AS representant,
                    ${await colDestinataire(conn)} AS destinataire,
                    (SELECT COUNT(*) FROM remise_fichier rf WHERE rf.remise_id = r.id) AS n
               FROM remise_document r
               JOIN enrollment e ON e.id = r.enrollment_id
               JOIN learner l ON l.id = e.learner_id
               JOIN remise_type rt ON rt.id = r.remise_type_id
               LEFT JOIN company c ON c.id = e.company_id
              WHERE r.id = ? AND r.organization_id = ?`,
            [req.params.id, req.user.organization_id]);
        if (!r) return res.status(404).json({ message: 'Remise introuvable.' });
        /* LE DESTINATAIRE, ET LUI SEUL (188) : le stagiaire, ou le compte de son entreprise quand la
           remise lui est adressée — et qu'elle en a un (`pourEntreprise`). Un stagiaire qui
           représente aussi son entreprise passe par là. */
        if (pourEntreprise(r) ? r.representant !== req.user.id : r.user_id !== req.user.id) {
            return res.status(403).json({ message: pourEntreprise(r)
                ? "Ce document est remis à l'entreprise : c'est elle qui en accuse réception, depuis son espace."
                : "L'accusé de réception ne peut être signé que par le stagiaire lui-même." });
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
            `SELECT rf.mime, rf.bytes, rf.nom, r.organization_id, l.user_id, e.company_id,
                    ${await colRepresentant(conn)} AS representant, ${await colDestinataire(conn)} AS destinataire
               FROM remise_fichier rf
               JOIN remise_document r ON r.id = rf.remise_id
               JOIN remise_type rt ON rt.id = r.remise_type_id
               JOIN enrollment e ON e.id = r.enrollment_id
               JOIN learner l ON l.id = e.learner_id
               LEFT JOIN company c ON c.id = e.company_id
              WHERE rf.id = ?`, [req.params.id]);
        if (!f || f.organization_id !== req.user.organization_id) {
            return res.status(404).json({ message: 'Fichier introuvable.' });
        }
        // Le bureau ; sinon le DESTINATAIRE de la remise — le stagiaire, ou le compte de son entreprise.
        const destinataire = pourEntreprise(f) ? f.representant : f.user_id;
        if (!estBureau(req.user) && destinataire !== req.user.id) return res.status(403).json({ message: "Ce document ne vous est pas adressé." });
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
    listDossier, remisesDuDossier, remisesDuGroupe, remisesDeLEntreprise, deposer, accuser, basculerSansObjet, servirFichier, supprimerFichier,
    STATUTS, MIMES, MAX_OCTETS, DESTINATAIRES, ROLES_BUREAU,
};

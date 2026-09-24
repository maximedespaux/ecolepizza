const crypto = require('crypto');
const { colonneOuNull, colonneExiste } = require('../lib/colonnes.js');
const { appliquerReferent, nomReferent } = require('../lib/referentEntreprise.js');
const { MAX_LIGNES, analyserEntreprises, bilan } = require('../lib/importFiches.js');
const bcrypt = require('bcrypt');
const db = require('../config/database.js');
const { parcoursManquant } = require('../lib/parcoursRequis.js');
/* La section « À l'arrivée via une entreprise » — la MÊME lecture que celle du parcours, pas
   une relecture du JSON écrite une seconde fois ici. */
const { companyStepSlugs, etatDeGroupe, pourcentFait, needsSignature, SENT } = require('../lib/parcours.js');
const { generatePassword } = require('../lib/crypto.js');
// Même lacune que pour le stagiaire : l'entreprise, qui signe les conventions et reçoit les
// factures, n'apparaissait nulle part dans le journal.
const { logAudit } = require('../lib/audit.js');
/* Les conventions de saisie d'un stagiaire viennent de SON contrôleur, pas d'une copie : nom en
   capitales, e-mail en minuscules, espaces épurés. L'inscription de groupe ne les appliquait pas
   — un lot de douze arrivait en « dupont », « Dupont », « DUPONT » selon ce qu'avait tapé
   l'entreprise, et c'est exactement le mélange que la convention existe pour empêcher. */
const { normaliserSaisie, RE_EMAIL } = require('./learner.controller.js');
const { capitaliser, CAPITALES_ENTREPRISE } = require('../lib/saisie.js');
const { sendMail, appUrl } = require('../lib/mailer.js');
const { representativeEmail } = require('../lib/mailTemplates.js');
const { createStagiaireAccount } = require('./learner.controller.js');
const { loadOrgSteps } = require('./template.controller.js');
const { formationSteps, enrollmentSteps } = require('./formationProgram.controller.js');
const { companySignsDoc, stepSigners, typeDuModele, groupesParOpco, cleOpco } = require('../lib/documents.js');
const { loadConditionMap, champsDesConditions, loadDossierFactsMap } = require('../lib/conditions.js');
const { loadEquivalences, equivalenceMap } = require('../lib/equivalence.js');
const { SQL_BADGE_FORMATION } = require('../lib/badges.js');

// Résout, pour chaque stagiaire de l'entreprise dans la session, les documents (slugs)
// applicables à son dossier (conditions + variantes « OU »). Base du parcours de groupe.
async function resolveGroupSteps(conn, orgId, companyId, sessionId) {
    const [[sess]] = await conn.query(
        `SELECT s.id, s.year, s.week,
                DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date,
                p.id AS program_id, p.title AS program_title, p.code AS program_code, p.days, p.hygiene, p.rs_code
         FROM training_session s JOIN training_program p ON p.id = s.program_id
         WHERE s.id = ? AND s.organization_id = ?`, [sessionId, orgId]);
    if (!sess) return null;
    const program = { id: sess.program_id, code: sess.program_code, days: sess.days, hygiene: sess.hygiene, rs_code: sess.rs_code };
    const [enr] = await conn.query(
        `SELECT e.id, e.learner_id, e.financing, l.opco FROM enrollment e JOIN learner l ON l.id = e.learner_id
         WHERE e.company_id = ? AND e.session_id = ? AND e.organization_id = ?`, [companyId, sessionId, orgId]);
    const condById = await loadConditionMap(conn, orgId);
    const eqMap = equivalenceMap(await loadEquivalences(conn, orgId));
    const catalog = await champsDesConditions(conn, orgId, condById);
    const factsMap = await loadDossierFactsMap(conn, orgId, enr.map((e) => e.id), catalog);
    const enrollments = [];
    for (const e of enr) {
        const ctx = {
            financing: e.financing, rsCode: sess.rs_code, hygiene: !!sess.hygiene, jours: sess.days,
            agefice: (e.opco || '').toUpperCase() === 'AGEFICE', ...(factsMap.get(e.id) || {}),
        };
        const resolved = await enrollmentSteps(conn, orgId, program, ctx, condById, eqMap);
        enrollments.push({ id: e.id, learner_id: e.learner_id, opco: e.opco || null, slugs: new Set(resolved.filter((s) => !s.quiz_id).map((s) => s.slug)) });
    }
    return { sess, program, enrollments, allSteps: await formationSteps(conn, orgId, program) };
}

const clean = (v) => (v === undefined || v === '' ? null : v);
const isMissingSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');

/** GET /api/companies — entreprises de l'organisme (avec nb de stagiaires rattachés). */
/* ASYNCHRONE DEPUIS LA 159 : il fallait sonder `information_schema` avant de composer le
   SELECT, ce qu'un rappel ne permet pas. Le reste du fichier est déjà en `db.promise()`. */
const getCompanies = async (req, res) => {
  try {
    const conn = db.promise();
    /* LE STAGIAIRE RÉFÉRENT DÉSIGNÉ (migration 174) passe avant la déduction par l'e-mail : c'est un
       choix de l'école, l'autre n'est qu'une coïncidence d'adresses. Sans la colonne, la déduction seule. */
    const lien = await colonneExiste(conn, 'company', 'representative_learner_id');
    const [results] = await conn.query(
        /* `learner_id` / `learner_name` : LE stagiaire dont l'adresse est EXACTEMENT celle de
           l'entreprise — c.-à-d. le cas « le référent EST un stagiaire » (petite société au nom
           du propriétaire). Sert à afficher côté admin un lien vers sa fiche. Une adresse vide
           (`c.email <> ''` échoue, et `NULL <> ''` vaut NULL) ne correspond à personne : pas de
           lien pour une entreprise sans e-mail ou dont l'e-mail ne pointe sur aucun stagiaire. */
        `SELECT c.id, c.organization_id, c.name, c.siret, c.town, c.email, c.phone, c.opco,
                c.representative_civ, c.representative_name, c.created_at,
                ${await colonneOuNull(conn, 'company', 'representative_first_name', 'c.')},
                ${await colonneOuNull(conn, 'company', 'date_creation', 'c.')},
                (SELECT COUNT(*) FROM learner l WHERE l.company_id = c.id) AS learner_count,
                ${lien ? `(SELECT rl.id FROM learner rl WHERE rl.id = c.representative_learner_id AND rl.organization_id = c.organization_id)` : 'NULL'} AS referent_id,
                ${lien ? `(SELECT CONCAT_WS(' ', rl.first_name, rl.last_name) FROM learner rl
                   WHERE rl.id = c.representative_learner_id AND rl.organization_id = c.organization_id)` : 'NULL'} AS referent_name,
                (SELECT sl.id FROM learner sl
                   WHERE sl.organization_id = c.organization_id AND c.email <> '' AND sl.email = c.email
                   ORDER BY sl.created_at LIMIT 1) AS learner_id,
                (SELECT CONCAT_WS(' ', sl.first_name, sl.last_name) FROM learner sl
                   WHERE sl.organization_id = c.organization_id AND c.email <> '' AND sl.email = c.email
                   ORDER BY sl.created_at LIMIT 1) AS learner_name
         FROM company c
         WHERE c.organization_id = ?
         ORDER BY c.name`,
        [req.user.organization_id]);
    res.json({ data: results.map(({ referent_id, referent_name, ...c }) => (referent_id
        ? { ...c, learner_id: referent_id, learner_name: referent_name, referent_stagiaire: true }
        : c)) });
  } catch (err) {
    console.error('Erreur récupération entreprises :', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/** GET /api/companies/:id — une entreprise + ses stagiaires. */
const getCompany = async (req, res) => {
    try {
        const conn = db.promise();
        const [[company]] = await conn.query('SELECT * FROM company WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const [learners] = await conn.query(
            `SELECT l.id, l.civility, l.first_name, l.last_name, l.email, l.phone, l.financing,
                    /* Les dossiers QUE CETTE ENTREPRISE porte, pas tous ceux du stagiaire.
                       Le compte portait sur l'ensemble de ses inscriptions : une personne
                       venue une fois par son employeur, puis inscrite d'elle-même ailleurs,
                       s'affichait « 2 dossiers » sur la fiche de l'employeur — dont un qui ne
                       le regarde pas et qu'il ne peut d'ailleurs pas ouvrir. */
                    (SELECT COUNT(*) FROM enrollment e
                      WHERE e.learner_id = l.id AND e.company_id = c.id) AS enrollment_count
             FROM learner l
             JOIN company c ON c.id = l.company_id
             WHERE l.company_id = ? AND l.organization_id = ?
             ORDER BY l.last_name, l.first_name`,
            [req.params.id, req.user.organization_id]
        );
        // Sessions où l'entreprise a des stagiaires inscrits (pour le parcours entreprise).
        let sessions = [];
        try {
            [sessions] = await conn.query(
                `SELECT DISTINCT s.id, s.week, s.year, p.code AS program_code, p.title AS program_title
                 FROM enrollment e
                 JOIN training_session s ON s.id = e.session_id
                 JOIN training_program p ON p.id = s.program_id
                 WHERE e.company_id = ? AND e.organization_id = ?
                 ORDER BY s.year DESC, s.week DESC`,
                [req.params.id, req.user.organization_id]
            );
        } catch (e) { if (!isMissingSchema(e)) throw e; }
        /* État du COMPTE REPRÉSENTANT, pour l'écran. Le bouton « créer / réinitialiser » n'a de sens
           que si le compte n'existe pas encore, ou si c'est un compte représentant DÉDIÉ. Quand le
           référent est une VRAIE personne déjà connectée (stagiaire lié ou membre du bureau), le
           réinitialiser reviendrait à écraser SON compte : createRepresentativeAccount refuse de le
           faire (isRealPerson). L'écran masque donc le bouton dans ce cas. Mêmes rôles ici. */
        let representative = { linked: false, is_person: false, role: null, name: null };
        if (company.user_id) {
            const [[u]] = await conn.query('SELECT id, role, first_name, last_name FROM user WHERE id = ? AND organization_id = ?', [company.user_id, req.user.organization_id]);
            if (u) {
                const [[lc]] = await conn.query('SELECT COUNT(*) AS n FROM learner WHERE user_id = ?', [u.id]);
                const isPerson = lc.n > 0 || ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR'].includes(u.role);
                representative = { linked: true, is_person: isPerson, role: u.role, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null };
            }
        }
        /* LE STAGIAIRE RÉFÉRENT (migration 174), pour que la fiche le montre choisi — il n'est pas
           forcément parmi les stagiaires rattachés. Même organisme, toujours. */
        let referentStagiaire = null;
        if (company.representative_learner_id) {
            const [[rl]] = await conn.query(
                'SELECT id, civility, first_name, last_name, email FROM learner WHERE id = ? AND organization_id = ?',
                [company.representative_learner_id, req.user.organization_id]);
            referentStagiaire = rl || null;
        }
        res.json({ data: { ...company, learners, sessions, representative, referent_stagiaire: referentStagiaire } });
    } catch (err) {
        console.error('Erreur lecture entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const COMPANY_COLS = ['name', 'siret', 'naf_ape', 'legal_status', 'address', 'zip_code', 'town', 'email', 'phone', 'opco', 'representative_civ', 'representative_name', 'representative_role'];

/* Colonnes arrivées par migration, donc pas forcément là. Écrire `vat_number` sur une base où
 * la 123 n'a pas été jouée ferait échouer TOUTE la création d'entreprise en ER_BAD_FIELD_ERROR —
 * on perdrait la fiche entière pour un champ facultatif. On sonde une fois par requête. */
/* `date_creation` (migration 159) — la date d'IMMATRICULATION de l'entreprise, à ne pas
   confondre avec `created_at`, qui dit quand sa fiche est entrée dans l'application. Les quatre
   cent soixante et onze fiches importées portent toutes le même `created_at`, à la seconde
   près : il ne dit rien de l'entreprise. C'est la date du Kbis que réclament une convention,
   un dossier OPCO ou un contrôle. */
/* `representative_first_name` et `representative_learner_id` (migration 174) : le prénom du
   référent, et le stagiaire choisi comme référent (lib/referentEntreprise.js). */
const COMPANY_COLS_OPT = ['vat_number', 'date_creation', 'representative_first_name', 'representative_learner_id'];
async function colonnesEntreprise(conn) {
    const dispo = [];
    for (const c of COMPANY_COLS_OPT) {
        try {
            const [r] = await conn.query(
                `SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'company' AND column_name = ? LIMIT 1`, [c]);
            if (r.length) dispo.push(c);
        } catch { /* introspection indisponible : on s'en passe */ }
    }
    return [...COMPANY_COLS, ...dispo];
}

/* CONVENTIONS DE SAISIE — mêmes raisons que pour un stagiaire (cf. learner.controller), et
   appliquées ici aussi parce que le formulaire n'est pas le seul chemin d'entrée :
   · NOM DU RÉFÉRENT en majuscules : il ressort tel quel sur les conventions et les liens de
     signature, et « dupont » / « Dupont » / « DUPONT » empêchent tout tri comme tout regroupement ;
   · VILLE en majuscules aussi (2026-09-17), pour la même raison et comme celle du stagiaire ;
   · E-MAIL en minuscules, sans espaces, refusé s'il est malformé : c'est l'adresse à laquelle
     partent la convention et le lien de signature du représentant.
   La RAISON SOCIALE, en revanche, n'est PAS mise en capitales : « SARL Le Petit Four » a une
   casse officielle, et l'écraser ferait mentir tous les documents qui la reprennent. */
const RE_EMAIL_ENT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* NUMÉRO DE TVA INTRACOMMUNAUTAIRE — treize caractères, ni plus ni moins.
 *
 * DEUX FORMES ACCEPTÉES, et c'est délibéré. La forme officielle française est « FR » suivi de
 * onze chiffres (deux de clé, puis le SIREN) : c'est elle que les modèles de l'application
 * donnent en exemple, et c'est elle que Factur-X transmet sous `schemeID="VA"` — un identifiant
 * intracommunautaire sans son code pays n'y est pas valide. Mais treize chiffres nus se
 * rencontrent sur les documents que l'école reçoit, et refuser ce qu'on lit sur une facture
 * obligerait à deviner la transformation. On accepte donc les deux, sans jamais en réécrire une
 * en l'autre : ajouter « FR » nous-mêmes reviendrait à inventer un pays.
 *
 * Les espaces sont retirés (« FR 76 123456789 » se recopie tel quel depuis un courrier) et les
 * lettres passent en capitales — « fr76… » désigne le même numéro. */
const RE_TVA = /^(FR[0-9]{11}|[0-9]{13})$/;

function normaliserEntreprise(b) {
    // Nom du référent et ville en capitales : la liste est dans lib/saisie.js, partagée avec les
    // deux autres chemins qui écrivent une entreprise (saisie en ligne, espace stagiaire).
    const out = capitaliser(b, CAPITALES_ENTREPRISE);
    if (out.name != null) out.name = String(out.name).trim();
    if (out.email != null) out.email = String(out.email).trim().toLowerCase();
    if (out.vat_number != null) {
        const v = String(out.vat_number).replace(/[\s.]/g, '').toUpperCase();
        out.vat_number = v || null;   // champ vidé = effacé, pas une chaîne vide
    }
    /* Un `<input type="date">` vidé envoie la CHAÎNE VIDE, que MariaDB range en '0000-00-00' ou
       refuse selon son mode strict. Vide veut dire inconnue : on écrit NULL. */
    if (out.date_creation != null) out.date_creation = String(out.date_creation).trim() || null;
    return out;
}

/* Renvoie le message d'erreur, ou null. Le champ reste FACULTATIF : beaucoup d'entreprises
   n'en fournissent pas, et l'exiger rendrait irréparables les quatre cent soixante-neuf fiches
   déjà en base, toutes sans numéro. On ne contrôle que ce qui est saisi. */
function erreurTva(vat) {
    if (!vat) return null;
    if (!RE_TVA.test(vat)) {
        return 'Numéro de TVA invalide : treize caractères attendus — « FR » suivi de onze chiffres '
            + '(FR76123456789), ou treize chiffres.';
    }
    return null;
}

/** POST /api/companies — crée une entreprise. */
const createCompany = async (req, res) => {
    const b = normaliserEntreprise(req.body || {});
    /* CINQ CHAMPS EXIGÉS À LA CRÉATION — ce sont ceux qui figurent sur une convention.
     *
     * Une entreprise sans SIRET ni référent se découvre au moment d'éditer la convention, c'est-
     * à-dire au pire moment : la session démarre, le document ne peut pas se remplir, et il faut
     * rappeler le client. Les exiger à la saisie déplace ce coût là où il est indolore.
     *
     * `updateCompany` ne les réclame PAS, pour la même raison que la fiche stagiaire : imposer
     * un SIRET pour corriger un code postal rendrait les anciennes fiches irréparables. */
    /* Le référent se donne par son nom, OU par le stagiaire choisi : ses noms sont alors recopiés
       plus bas (appliquerReferent), après ce contrôle, qui doit rester sans base. */
    const referentChoisi = !!String(b.representative_learner_id || '').trim();
    const manquants = [
        ['name', "Nom de l'entreprise"], ['siret', 'SIRET'], ['email', 'E-mail'],
        ['phone', 'Téléphone'], ['representative_name', 'Nom du référent'],
    ].filter(([k]) => !(k === 'representative_name' && referentChoisi) && !String(b[k] || '').trim()).map(([, libelle]) => libelle);
    if (manquants.length) {
        return res.status(422).json({ error: `Champ${manquants.length > 1 ? 's' : ''} requis : ${manquants.join(', ')}.` });
    }
    if (b.email && !RE_EMAIL_ENT.test(b.email)) return res.status(422).json({ error: 'Adresse e-mail invalide.' });
    const mauvaiseTva = erreurTva(b.vat_number);
    if (mauvaiseTva) return res.status(422).json({ error: mauvaiseTva });
    try {
        const id = crypto.randomUUID();
        const colonnes = await colonnesEntreprise(db.promise());
        const referent = await appliquerReferent(db.promise(), req.user.organization_id, b, colonnes);
        if (referent.erreur) return res.status(422).json({ error: referent.erreur });
        const cols = colonnes.filter((k) => b[k] !== undefined);
        await db.promise().query(
            `INSERT INTO company (id, organization_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
            [id, req.user.organization_id, ...cols.map((k) => clean(b[k]))]
        );
        logAudit(req, 'company.create', 'Company', id);
        res.status(201).json({ message: 'Entreprise créée', data: { id }, ...(referent.ignores.length ? { ignores: referent.ignores } : {}) });
    } catch (err) {
        console.error('Erreur création entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/companies/:id — met à jour une entreprise. */
const updateCompany = async (req, res) => {
    const b = normaliserEntreprise(req.body || {}); // mêmes conventions qu'à la création
    if (b.email && !RE_EMAIL_ENT.test(b.email)) return res.status(422).json({ error: 'Adresse e-mail invalide.' });
    /* MÊME CONTRÔLE QU'À LA CRÉATION. La fiche se corrige aussi par cette route, et un numéro
       mal formé y entrerait sans rien rencontrer — puis ressortirait sur une facture Factur-X. */
    const mauvaiseTva = erreurTva(b.vat_number);
    if (mauvaiseTva) return res.status(422).json({ error: mauvaiseTva });
    try {
        const conn = db.promise();
        const [[c]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!c) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const colonnes = await colonnesEntreprise(conn);
        const referent = await appliquerReferent(conn, req.user.organization_id, b, colonnes);
        if (referent.erreur) return res.status(422).json({ error: referent.erreur });
        const cols = colonnes.filter((k) => b[k] !== undefined);
        if (cols.length) {
            await conn.query(
                `UPDATE company SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND organization_id = ?`,
                [...cols.map((k) => clean(b[k])), req.params.id, req.user.organization_id]
            );
        }
        logAudit(req, 'company.update', 'Company', req.params.id);
        // Ce qui n'a pu être gardé (migration 174 non jouée) : l'écran le dit, plutôt qu'un succès qui ment.
        res.json({ success: true, ...(referent.ignores.length ? { ignores: referent.ignores } : {}) });
    } catch (err) {
        console.error('Erreur mise à jour entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/companies/:id/register — inscrit un GROUPE de stagiaires sous l'entreprise.
 * Corps : {
 *   session_id?,
 *   stagiaires: [{ civility, first_name, last_name, email, phone }]  // nouveaux à créer
 *   learner_ids: [id, …]                                             // stagiaires existants à rattacher
 * }
 * Nouveaux : créés (financement PRO, rattachés, compte si e-mail libre). Existants : rattachés
 * à l'entreprise (financement PRO). Tous inscrits à la session si fournie (sans doublon).
 */
const registerCompanyStagiaires = async (req, res) => {
    const orgId = req.user.organization_id;
    const list = Array.isArray(req.body?.stagiaires) ? req.body.stagiaires : [];
    const learnerIds = Array.isArray(req.body?.learner_ids) ? req.body.learner_ids.filter(Boolean) : [];
    const sessionId = req.body?.session_id || null;
    if (!list.length && !learnerIds.length) return res.status(422).json({ error: 'Aucun stagiaire à inscrire.' });

    /* PRÉNOM **ET** NOM, la règle du formulaire — cette voie ne l'appliquait pas.
     *
     * Le test était `if (!first && !last) continue;` : un ET, donc une ligne où seul le prénom
     * était rempli passait la garde et atterrissait en base à moitié nommée. Aucun message : la
     * ligne était simplement acceptée. La même personne passait ou non selon la porte empruntée —
     * refusée par 422 dans la fiche stagiaire, admise en silence par l'inscription de groupe.
     *
     * Une ligne ENTIÈREMENT vide reste ignorée, et ce n'est pas une exception mais la distinction
     * utile : c'est le résidu d'un copier-coller, pas une saisie fautive. Ce qu'on refuse, c'est
     * la ligne À MOITIÉ remplie, la seule qui trahisse une intention incomplète.
     *
     * Contrôle AVANT la boucle, pour la raison déjà écrite plus bas à propos des parcours :
     * refuser au dixième d'une liste de vingt laisserait neuf fiches créées et onze non, un état
     * que personne ne peut rattraper à la main. Et le RANG est nommé : « une ligne est
     * incomplète » sur une liste de vingt collées d'un coup oblige à toutes les relire. */
    const rempli = (v) => String(v ?? '').trim(); // `clean` ne coupe PAS les espaces : « \u00a0 » resterait « rempli »
    const incompletes = []; const emailsFautifs = [];
    list.forEach((s, i) => {
        const first = rempli(s.first_name); const last = rempli(s.last_name);
        if ((first || last) && !(first && last)) incompletes.push(i + 1);
        const mail = rempli(s.email);
        if (mail && !RE_EMAIL.test(mail.toLowerCase())) emailsFautifs.push(i + 1);
    });
    const rangs = (l) => `ligne${l.length > 1 ? 's' : ''} ${l.join(', ')}`;
    if (incompletes.length) {
        return res.status(422).json({ error: `Prénom et nom requis pour chaque stagiaire — ${rangs(incompletes)}.` });
    }
    /* L'e-mail est validé ici pour la même raison que dans la fiche stagiaire : il SERT
       d'identifiant de connexion. Une adresse malformée ne fait pas échouer l'import, elle crée
       douze fiches dont l'une n'aura jamais de compte, sans que personne ne l'apprenne. */
    if (emailsFautifs.length) {
        return res.status(422).json({ error: `Adresse e-mail invalide — ${rangs(emailsFautifs)}.` });
    }
    try {
        const conn = db.promise();
        const [[company]] = await conn.query('SELECT id, opco FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });

        // Badge (niveau/code) de la session, pour le rattacher aux stagiaires inscrits.
        let badge = null;
        if (sessionId) {
            const [[sess]] = await conn.query(
                /* Même règle qu'à l'inscription depuis la fiche : le CODE, jamais le
                   niveau (cf. lib/badges.js). Elle était écrite deux fois — et deux copies
                   d'une même règle finissent par diverger. */
                `SELECT ${SQL_BADGE_FORMATION} FROM training_session s
                 JOIN training_program p ON p.id = s.program_id WHERE s.id = ? AND s.organization_id = ?`,
                [sessionId, orgId]
            );
            if (!sess) return res.status(404).json({ message: 'Session introuvable.' });
            badge = sess.badge || null;

            /* CETTE VOIE PASSE TOUJOURS PAR UNE ENTREPRISE : les deux parcours sont donc exigés,
             * celui du dossier ET celui de l'arrivée via une entreprise. Le contrôle est fait
             * ICI, avant la boucle : refuser au dixième stagiaire d'une liste de vingt laisserait
             * neuf dossiers créés et onze non — un état que personne ne peut rattraper à la main. */
            const refus = await parcoursManquant(conn, orgId, sessionId, true);
            if (refus) return res.status(422).json({ error: refus });
        }

        // Inscrit un stagiaire (existant) à la session, sans doublon ; ajoute le badge.
        async function enrollLearner(learnerId) {
            if (!sessionId) return false;
            const [[ex]] = await conn.query('SELECT id FROM enrollment WHERE learner_id = ? AND session_id = ?', [learnerId, sessionId]);
            if (ex) {
                await conn.query("UPDATE enrollment SET company_id = ?, financing = 'PROFESSIONNEL' WHERE id = ?", [company.id, ex.id]);
            } else {
                await conn.query(
                    `INSERT INTO enrollment (id, organization_id, learner_id, session_id, company_id, financing, crm_stage, conformite_score)
                     VALUES (UUID(), ?, ?, ?, ?, 'PROFESSIONNEL', 'INSCRIT', 'ROUGE')`,
                    [orgId, learnerId, sessionId, company.id]
                );
            }
            if (badge) {
                const [[l]] = await conn.query('SELECT levels FROM learner WHERE id = ?', [learnerId]);
                const set = new Set((l?.levels || '').split(',').map((x) => x.trim()).filter(Boolean));
                if (!set.has(badge)) { set.add(badge); await conn.query('UPDATE learner SET levels = ? WHERE id = ?', [[...set].join(','), learnerId]); }
            }
            return true;
        }

        const created = [];
        /* Ce que l'écran doit savoir d'un compte créé : les identifiants sont-ils partis ? Le mot de
           passe n'est rendu QUE s'ils ne partent pas (cf. createEnrollment) — l'écran l'ignorait
           jusqu'ici, et il était donc perdu quand l'envoi était coupé. */
        const identifiants = (account) => ({
            password: account && !account.envoye ? account.password : null,
            identifiants_envoyes: account ? account.envoye : null,
        });

        // 1) Stagiaires EXISTANTS : rattachés à l'entreprise + inscrits.
        if (learnerIds.length) {
            const [rows] = await conn.query(
                'SELECT id, user_id, email, first_name, last_name, phone FROM learner WHERE id IN (?) AND organization_id = ?',
                [learnerIds, orgId]
            );
            for (const l of rows) {
                await conn.query("UPDATE learner SET company_id = ?, financing = 'PROFESSIONNEL' WHERE id = ? AND organization_id = ?", [company.id, l.id, orgId]);
                const enrolled = await enrollLearner(l.id);
                /* Compte de connexion si absent — et SEULEMENT avec une session. Rattacher quelqu'un à
                   son entreprise ne lui ouvre rien : c'est l'inscription qui donne un espace à
                   remplir (cf. createLearner). Sans session, « rattacher un stagiaire existant »
                   lui envoyait quand même ses identifiants. */
                let account = null;
                if (sessionId && !l.user_id && l.email) {
                    account = await createStagiaireAccount(conn, orgId, { email: l.email, first_name: l.first_name, last_name: l.last_name, phone: l.phone });
                    if (account) await conn.query('UPDATE learner SET user_id = ? WHERE id = ?', [account.userId, l.id]);
                }
                created.push({ learner_id: l.id, name: [l.first_name, l.last_name].filter(Boolean).join(' '), email: l.email || null, ...identifiants(account), account: !!(l.user_id || account), enrolled, existing: true });
            }
        }

        // 2) NOUVEAUX stagiaires : créés puis inscrits.
        for (const s of list) {
            // Mêmes conventions que la fiche stagiaire : nom en capitales, e-mail en minuscules.
            const n = normaliserSaisie(s);
            const first = clean(n.first_name), last = clean(n.last_name);
            if (!first && !last) continue; // ligne vide d'un copier-coller — les incomplètes ont déjà été refusées
            const email = clean(n.email);
            // Même règle : un compte pour qui entre dans une session, pas pour une fiche seule.
            const account = sessionId && email ? await createStagiaireAccount(conn, orgId, { email, first_name: first, last_name: last, phone: clean(n.phone) }) : null;
            const learnerId = crypto.randomUUID();
            await conn.query(
                `INSERT INTO learner (id, organization_id, company_id, user_id, civility, first_name, last_name, email, phone, financing, opco, levels)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROFESSIONNEL', ?, ?)`,
                [learnerId, orgId, company.id, account?.userId || null, clean(n.civility), first, last, email, clean(n.phone), company.opco || null, badge || null]
            );
            let enrolled = false;
            if (sessionId) {
                await conn.query(
                    `INSERT INTO enrollment (id, organization_id, learner_id, session_id, company_id, financing, crm_stage, conformite_score)
                     VALUES (UUID(), ?, ?, ?, ?, 'PROFESSIONNEL', 'INSCRIT', 'ROUGE')`,
                    [orgId, learnerId, sessionId, company.id]
                );
                enrolled = true;
            }
            /* UNE TRACE PAR STAGIAIRE, pas une pour le lot. L'inscription de groupe est le
               chemin le plus courant vers une fiche neuve dans cet organisme — la journaliser en
               bloc dirait « douze stagiaires ont été créés » sans pouvoir dire lesquels, ce qui
               est précisément ce qu'un contrôle vient vérifier. Le fil d'activité, lui, regroupe
               les lignes identiques à l'affichage (cf. lib/activite.js) : la trace reste fine,
               la cloche reste lisible. */
            logAudit(req, 'learner.create', 'Learner', learnerId);
            created.push({ learner_id: learnerId, name: [first, last].filter(Boolean).join(' '), email: email || null, ...identifiants(account), account: !!account, enrolled, existing: false });
        }

        res.status(201).json({ message: `${created.length} stagiaire(s) inscrit(s).`, data: { created } });
    } catch (err) {
        console.error('Erreur inscription groupe entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/companies/:id/doc-templates?session_id= — documents de GROUPE (company_level)
 * de la formation de la session : étapes actives, dans l'ordre du parcours (program_step).
 */
const companyDocTemplates = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        let program = null;
        if (req.query.session_id) {
            const [[s]] = await conn.query(
                `SELECT p.id, p.code, p.days, p.hygiene, p.rs_code
                 FROM training_session s JOIN training_program p ON p.id = s.program_id
                 WHERE s.id = ? AND s.organization_id = ?`, [req.query.session_id, orgId]);
            program = s || null;
        }
        let out, breakSlug = null;
        if (program) {
            // Respecte l'ordre + l'inclusion du parcours (documents de groupe) de la formation.
            const steps = await formationSteps(conn, orgId, program);
            /* UN DOCUMENT « ENTREPRISE SEULEMENT » N'EST PAS ACTIF, et c'est tout son intérêt —
               la MÊME garde que `generateGroupDocuments`, qui l'avait reçue en premier. Celle-ci
               était restée sur `s.active` seul, et le défaut était complet : la section
               « À l'arrivée via une entreprise » n'ACTIVE rien quand on y ajoute un document de
               groupe (c'est voulu : l'activer le donnerait aussi aux arrivées individuelles).
               L'étape s'affichait donc dans le parcours de la fiche entreprise — cette liste-là
               ne filtre pas sur `active` —, son bouton « Préparer le document » s'ouvrait, et
               l'envoi répondait « Ce document n'existe pas dans les formations sélectionnées ».
               Aucun document de groupe ajouté par l'écran d'aujourd'hui ne pouvait être préparé. */
            const intake = new Set(await companyStepSlugs(conn, orgId, program.id));
            out = steps
                .filter((s) => s.company_level && (s.active || intake.has(s.slug)))
                .map((s) => ({ slug: s.slug, label: s.label, doc_type: s.doc_type }));
        } else {
            // Sans session : tous les modèles entreprise de l'organisme.
            const steps = await loadOrgSteps(orgId);
            out = steps.filter((s) => s.active && s.company_level).map((s) => ({ slug: s.slug, label: s.label, doc_type: s.doc_type }));
        }
        res.json({ data: out, break_slug: breakSlug });
    } catch (err) {
        console.error('Erreur modèles entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/companies/:id/documents?session_id= — documents « entreprise » générés. */
const listCompanyDocuments = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const params = [orgId, req.params.id];
        let where = "organization_id = ? AND company_id = ? AND scope = 'COMPANY'";
        if (req.query.session_id) { where += ' AND session_id = ?'; params.push(req.query.session_id); }
        const [rows] = await conn.query(
            `SELECT id, type, template_slug, title, status, session_id,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
                    DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i') AS sent_at,
                    DATE_FORMAT(signed_at, '%Y-%m-%d %H:%i') AS signed_at
             FROM generated_document WHERE ${where} ORDER BY created_at DESC`, params);
        res.json({ data: rows });
    } catch (err) {
        if (isMissingSchema(err)) return res.json({ data: [] }); // migration 077 non jouée
        console.error('Erreur documents entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/companies/:id/documents — génère un document « entreprise » (liste le groupe). */
const createCompanyDocument = async (req, res) => {
    const orgId = req.user.organization_id;
    const { session_id, template_slug } = req.body || {};
    if (!session_id || !template_slug) return res.status(422).json({ error: 'Session et modèle requis.' });
    try {
        const conn = db.promise();
        const [[company]] = await conn.query('SELECT id, opco FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const [[sess]] = await conn.query('SELECT id FROM training_session WHERE id = ? AND organization_id = ?', [session_id, orgId]);
        if (!sess) return res.status(404).json({ message: 'Session introuvable.' });

        const steps = await loadOrgSteps(orgId);
        const step = steps.find((s) => s.slug === template_slug && s.active && s.company_level);
        if (!step) return res.status(422).json({ error: 'Modèle « entreprise » introuvable.' });

        const [enr] = await conn.query(
            `SELECT e.id, l.opco FROM enrollment e JOIN learner l ON l.id = e.learner_id
             WHERE e.session_id = ? AND e.company_id = ? AND e.organization_id = ?`,
            [session_id, company.id, orgId]
        );
        if (!enr.length) return res.status(422).json({ error: 'Aucun stagiaire de cette entreprise dans cette session.' });

        // La colonne `opco` (migration 089) est-elle présente ? Si oui, on produit UN
        // document par OPCO (un dirigeant a souvent un OPCO ≠ de ses salariés) ; sinon
        // un seul document pour tout le groupe (ancien comportement).
        let opcoSupported = true;
        try { await conn.query('SELECT opco FROM generated_document LIMIT 1'); }
        catch (e) { if (e && e.code === 'ER_BAD_FIELD_ERROR') opcoSupported = false; else if (!isMissingSchema(e)) throw e; }

        // Regroupement par OPCO : un stagiaire sans OPCO hérite de celui de l'entreprise
        // (évite un 2e document « sans OPCO »). Clé normalisée (casse/espaces) pour ne
        // pas scinder « OCAPIAT » et « Ocapiat ». LA RÈGLE EST PARTAGÉE avec le rendu
        // (lib/documents.js) : chaque document doit LISTER exactement le groupe qui l'a fait naître.
        let groups = new Map();
        if (opcoSupported) {
            groups = groupesParOpco(enr, company.opco);
        } else {
            groups.set('', { opco: null, ids: enr.map((e) => e.id) });
        }

        // Nettoyage global : on retire TOUTES les versions non signées de ce document
        // (toutes OPCO confondues) pour éviter les doublons issus d'un ancien regroupement
        // (ex. une version « sans OPCO » restée d'une génération précédente).
        try {
            await conn.query(
                "DELETE FROM generated_document WHERE organization_id = ? AND company_id = ? AND session_id = ? AND template_slug = ? AND status <> 'SIGNE'",
                [orgId, company.id, session_id, template_slug]);
        } catch (e) { if (!isMissingSchema(e)) throw e; }
        // OPCO déjà signés (on ne les régénère pas : on garde la version signée).
        const signedOpcos = new Set();
        if (opcoSupported) {
            try {
                const [srows] = await conn.query(
                    "SELECT opco FROM generated_document WHERE organization_id = ? AND company_id = ? AND session_id = ? AND template_slug = ? AND status = 'SIGNE'",
                    [orgId, company.id, session_id, template_slug]);
                for (const r of srows) signedOpcos.add(cleOpco(r.opco));
            } catch (e) { if (!isMissingSchema(e)) throw e; }
        }

        // Jamais `step.doc_type` brut : il est vide sur un modèle sans « Type », et la colonne le refuse.
        const type = typeDuModele(step);
        let created = 0;
        for (const g of groups.values()) {
            if (signedOpcos.has(cleOpco(g.opco))) continue; // déjà signé → conservé

            const id = crypto.randomUUID();
            const title = step.label + (g.opco ? ` — ${g.opco}` : '');
            try {
                if (opcoSupported) {
                    await conn.query(
                        `INSERT INTO generated_document (id, organization_id, learner_id, type, template_slug, title, status, scope, company_id, session_id, opco)
                         VALUES (?, ?, NULL, ?, ?, ?, 'A_FAIRE', 'COMPANY', ?, ?, ?)`,
                        [id, orgId, type, template_slug, title, company.id, session_id, g.opco]);
                } else {
                    await conn.query(
                        `INSERT INTO generated_document (id, organization_id, learner_id, type, template_slug, title, status, scope, company_id, session_id)
                         VALUES (?, ?, NULL, ?, ?, ?, 'A_FAIRE', 'COMPANY', ?, ?)`,
                        [id, orgId, type, template_slug, title, company.id, session_id]);
                }
            } catch (e) {
                if (isMissingSchema(e)) return res.status(422).json({ message: 'Documents entreprise non initialisés (migration 077).' });
                throw e;
            }
            for (const eid of g.ids) await conn.query('INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)', [id, eid]);
            created++;
        }
        res.status(201).json({ message: `${created} document(s) entreprise préparé(s).`, data: { created } });
    } catch (err) {
        console.error('Erreur création document entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/companies/:id — supprime une entreprise (les stagiaires sont détachés, pas supprimés : FK ON DELETE SET NULL). */
const deleteCompany = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query('DELETE FROM company WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Entreprise introuvable.' });
        logAudit(req, 'company.delete', 'Company', req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/companies/:id/learners/:learnerId — détache un stagiaire de l'entreprise. */
const detachLearner = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query(
            'UPDATE learner SET company_id = NULL WHERE id = ? AND company_id = ? AND organization_id = ?',
            [req.params.learnerId, req.params.id, req.user.organization_id]
        );
        if (!r.affectedRows) return res.status(404).json({ message: 'Stagiaire non rattaché à cette entreprise.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur détachement stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Libellé « qui signe » d'une étape (pour la timeline de groupe).
function signerSub(signers, companyLevel) {
    const parties = (signers || []).filter((r) => r !== 'ORG');
    if (companyLevel) return 'Document de groupe · signé par l\'entreprise';
    if (parties.includes('ENTREPRISE')) return 'À signer par l\'entreprise';
    if (parties.includes('STAGIAIRE')) return 'À signer par le stagiaire';
    if (parties.includes('EXTERNAL')) return 'À signer par un signataire externe';
    return 'Sans signature (organisme)';
}

/**
 * GET /api/companies/:id/parcours?session_id= — parcours documentaire COMPLET du groupe
 * (même style « timeline » que la fiche stagiaire) : TOUTES les étapes documentaires de
 * la formation applicables aux stagiaires du groupe, avec, pour chacune, ses signataires
 * et l'avancement (générés / signés) sur le groupe. Les documents signés par le stagiaire
 * apparaissent aussi (unification), avec l'action « générer + envoyer » au groupe.
 */
const getCompanyParcours = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[company]] = await conn.query('SELECT id, name FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const empty = { header: {}, steps: [], percent: 0, currentIndex: 0, currentKey: null, total_stagiaires: 0 };
        const sessionId = req.query.session_id;
        if (!sessionId) return res.json({ data: empty });

        const grp = await resolveGroupSteps(conn, orgId, company.id, sessionId);
        if (!grp) return res.status(404).json({ message: 'Session introuvable.' });

        // Section « à l'arrivée via une entreprise » (migration 092) : c'est ELLE qui
        // définit le parcours de l'entreprise. On n'inclut donc QUE ses documents
        // (dans l'ordre défini) — les étapes stagiaire propres à une inscription
        // « seule » (hors section entreprise) sont ignorées ici.
        let intakeOrder = [];
        try {
            const [[pr]] = await conn.query('SELECT company_steps FROM training_program WHERE id = ? AND organization_id = ?', [grp.program.id, orgId]);
            let cs = pr && pr.company_steps;
            if (typeof cs === 'string') { try { cs = JSON.parse(cs); } catch { cs = []; } }
            intakeOrder = Array.isArray(cs) ? cs : [];
        } catch (e) { if (!isMissingSchema(e)) throw e; }
        const intakeSet = new Set(intakeOrder);

        // Le parcours entreprise = TOUTES les étapes de la section (documents de groupe,
        // documents stagiaire ET QCM), dans l'ordre défini. Repli : si aucune section
        // définie, on retombe sur tous les documents actifs (comportement legacy).
        const bySlug = new Map(grp.allSteps.map((s) => [s.slug, s]));
        const docSteps = intakeSet.size
            ? intakeOrder.map((sl) => bySlug.get(sl)).filter((s) => s && s.doc_type !== 'EMARGEMENT')
            : grp.allSteps.filter((s) => s.active && !s.quiz_id && s.doc_type !== 'EMARGEMENT');

        let steps = [];
        for (const s of docSteps) {
            const signers = stepSigners(s);
            let gen = 0, total = 0, signed = 0, recu = 0, docId = null; // `recu` : reçus (envoyés), pour un document SANS signature
            if (s.company_level) {
                // Document de GROUPE : UNE signature collective (organisme + entreprise),
                // pas une par stagiaire. On le représente comme une seule étape signée /
                // à signer (peu importe le nombre de stagiaires ou d'OPCO).
                let docs = [];
                try {
                    [docs] = await conn.query(
                        "SELECT id, status FROM generated_document WHERE organization_id = ? AND company_id = ? AND session_id = ? AND template_slug = ? AND scope = 'COMPANY' ORDER BY created_at DESC",
                        [orgId, company.id, sessionId, s.slug]);
                } catch (e) { if (!isMissingSchema(e)) throw e; }
                const allSigned = docs.length > 0 && docs.every((d) => d.status === 'SIGNE');
                gen = docs.length ? 1 : 0;
                signed = allSigned ? 1 : 0;
                recu = docs.some((d) => SENT.includes(d.status)) ? 1 : 0;
                total = 1; // une signature collective
                docId = docs[0] ? docs[0].id : null;
            } else if (s.quiz_id) {
                // QCM : concerne tous les stagiaires du groupe ; l'envoi se fait depuis
                // chaque fiche stagiaire (lecture seule ici). Comptage par quiz_id.
                const ids = grp.enrollments.map((e) => e.id);
                total = ids.length;
                let rows = [];
                if (ids.length) {
                    [rows] = await conn.query(
                        `SELECT DISTINCT df.enrollment_id, gd.status FROM generated_document gd
                         JOIN document_formation df ON df.document_id = gd.id
                         WHERE gd.organization_id = ? AND df.enrollment_id IN (?) AND gd.quiz_id = ?`,
                        [orgId, ids, s.quiz_id]);
                }
                gen = new Set(rows.map((r) => r.enrollment_id)).size;
                signed = new Set(rows.filter((r) => r.status === 'SIGNE').map((r) => r.enrollment_id)).size;
            } else {
                const applicable = grp.enrollments.filter((e) => e.slugs.has(s.slug));
                total = applicable.length;
                const ids = applicable.map((e) => e.id);
                let rows = [];
                if (ids.length) {
                    [rows] = await conn.query(
                        `SELECT DISTINCT df.enrollment_id, gd.status FROM generated_document gd
                         JOIN document_formation df ON df.document_id = gd.id
                         WHERE gd.organization_id = ? AND df.enrollment_id IN (?) AND gd.template_slug = ?`,
                        [orgId, ids, s.slug]);
                }
                gen = new Set(rows.map((r) => r.enrollment_id)).size;
                signed = new Set(rows.filter((r) => r.status === 'SIGNE').map((r) => r.enrollment_id)).size;
                recu = new Set(rows.filter((r) => SENT.includes(r.status)).map((r) => r.enrollment_id)).size;
            }
            /* UN DOCUMENT SANS SIGNATURE (ni QCM, ni signataire hors organisme — un CGV, un livret)
               est FAIT dès qu'il est REÇU, pas signé : il n'attend personne (même règle que le
               dossier d'un stagiaire, cf. lib/parcours.js `stepDone`). Sans ça, un CGV restait
               éternellement « 0/1 signés » et bloquait la complétion du groupe. */
            const attendSignature = !!s.quiz_id || needsSignature(s);
            const done = total > 0 && (attendSignature ? signed >= total : recu >= total);
            steps.push({
                key: s.slug, label: s.label,
                sub: s.quiz_id ? 'QCM' : signerSub(signers, s.company_level),
                signers, company_level: !!s.company_level, doc_type: s.doc_type,
                signable: s.quiz_id ? false : signers.some((r) => r !== 'ORG'), quiz: !!s.quiz_id,
                gen, total, signed, docId,
                _done: done,
            });
        }
        let currentIndex = steps.findIndex((s) => !s._done);
        if (currentIndex < 0) currentIndex = steps.length;
        // Même règle que le dossier d'un stagiaire (lib/parcours.js) : l'état réel, l'avancement de toutes les étapes faites.
        const faites = steps.filter((s) => s._done).length;
        steps.forEach((s, i) => {
            s.status = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo';
            s.etat = etatDeGroupe({ done: s._done, gen: s.gen, total: s.total });
            delete s._done;
        });

        res.json({
            data: {
                header: {
                    title: grp.sess.program_title || '—', code: grp.sess.program_code || '',
                    session: grp.sess.week ? `SEM ${grp.sess.week}/${grp.sess.year || ''}` : '',
                    financing: 'Groupe entreprise', opco: null,
                },
                total_stagiaires: grp.enrollments.length,
                percent: pourcentFait(faites, steps.length),
                currentIndex,
                currentKey: currentIndex < steps.length ? steps[currentIndex].key : null,
                steps,
            },
        });
    } catch (err) {
        console.error('Erreur parcours entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/companies/:id/group-documents — génère (et envoie) un document du parcours
 * pour tout le groupe. Corps : { session_id, slug, send? }.
 *  · document de groupe (company_level) → un doc par OPCO (délégué à createCompanyDocument) ;
 *  · sinon → un doc par stagiaire dont le dossier appelle CE document, puis (send) envoi.
 */
const generateGroupDocuments = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const { session_id, slug, send } = req.body || {};
        if (!session_id || !slug) return res.status(422).json({ error: 'Session et document requis.' });
        const [[company]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const grp = await resolveGroupSteps(conn, orgId, company.id, session_id);
        if (!grp) return res.status(404).json({ message: 'Session introuvable.' });
        /* UN DOCUMENT « ENTREPRISE SEULEMENT » N'EST PAS ACTIF, et c'est tout son intérêt.
           La section « À l'arrivée via une entreprise » REMPLACE le parcours du dossier : on y
           place une convention de formation professionnelle ou un accord de prise en charge,
           qui n'ont aucun sens pour un particulier. Les activer dans le parcours du dossier les
           donnerait justement à ceux qu'ils ne concernent pas.
           La garde acceptait `s.active` seul : l'étape s'affichait dans le parcours entreprise
           — cette liste-là ne filtre pas sur `active` — mais la générer répondait
           « Document introuvable dans le parcours ». Visible et impossible. */
        const intake = new Set(await companyStepSlugs(conn, orgId, grp.program.id));
        const step = grp.allSteps.find((s) => s.slug === slug && (s.active || intake.has(slug)));
        if (!step) return res.status(422).json({ error: 'Document introuvable dans le parcours.' });
        if (step.company_level) return res.status(422).json({ error: 'Document de groupe : utilisez « Générer » (entreprise).' });

        const { prepareLearnerDoc, sendPreparedDoc } = require('./document.controller.js');
        /* À QUI. Le cas ordinaire reste celui-ci : les dossiers dont le parcours APPELLE ce
           document — c'est ce qui fait respecter ses conditions (financement, niveau…).
           Une étape « entreprise seulement » n'est dans AUCUN parcours individuel, par
           construction : `enrollmentSteps` écarte ce qui est inactif. Filtrer dessus rendrait
           zéro destinataire et « 0 document(s) préparé(s) », sans rien expliquer. Elle vise
           donc TOUT le groupe — et c'est exactement pourquoi on l'a mise là. */
        const seulementEntreprise = !step.active && intake.has(slug);
        const applicable = seulementEntreprise ? grp.enrollments : grp.enrollments.filter((e) => e.slugs.has(slug));
        let created = 0, sent = 0;
        for (const e of applicable) {
            const docId = await prepareLearnerDoc(conn, orgId, { learnerId: e.learner_id, type: typeDuModele(step), templateSlug: slug, enrollmentIds: [e.id] });
            created++;
            if (send) { try { await sendPreparedDoc(conn, orgId, docId); sent++; } catch (err) { console.error('Envoi groupe ignoré :', err.message); } }
        }
        res.status(201).json({ message: `${created} document(s) préparé(s)${send ? `, ${sent} envoyé(s)` : ''}.`, data: { created, sent } });
    } catch (err) {
        console.error('Erreur génération de groupe :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/companies/:id/learner-documents?session_id= — documents des STAGIAIRES du
 * groupe (dans la session) que le stagiaire devrait signer : le représentant de
 * l'entreprise les signe à leur place (lien de signature, slot « stagiaire »). Le
 * stagiaire en récupère la copie signée dans son espace (c'est son document).
 */
const getCompanyLearnerDocuments = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[company]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const sessionId = req.query.session_id;
        if (!sessionId) return res.json({ data: [] });

        const orgSteps = await loadOrgSteps(orgId);
        const [rows] = await conn.query(
            `SELECT DISTINCT gd.id, gd.title, gd.type, gd.status, gd.template_slug,
                    l.id AS learner_id, l.civility, l.first_name, l.last_name
             FROM enrollment e
             JOIN learner l ON l.id = e.learner_id
             JOIN document_formation df ON df.enrollment_id = e.id
             JOIN generated_document gd ON gd.id = df.document_id AND gd.learner_id = l.id
             WHERE e.company_id = ? AND e.session_id = ? AND e.organization_id = ?
             ORDER BY l.last_name, l.first_name, gd.created_at`,
            [company.id, sessionId, orgId]
        );
        // Ne garde que les documents « signés par l'entreprise » (devis, convention…) :
        // ce sont ceux dont la signature incombe au représentant.
        const out = rows.filter((d) => companySignsDoc(orgSteps, d));
        res.json({ data: out });
    } catch (err) {
        console.error('Erreur documents stagiaires (entreprise) :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/companies/:id/representative-account — crée (ou réinitialise) le compte
 * de connexion du REPRÉSENTANT de l'entreprise (rôle ENTREPRISE), pour qu'il signe
 * lui-même les documents de niveau entreprise. Renvoie l'e-mail + le mot de passe
 * (affiché une seule fois).
 */
const createRepresentativeAccount = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[company]] = await conn.query('SELECT * FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        /* LE PRÉNOM, S'IL EST SAISI À PART (migration 174) : plus besoin de le deviner au premier mot
           du nom. Les fiches d'avant gardent la coupe au premier mot. */
        const prenom = String(company.representative_first_name || '').trim();
        const [first, ...rest] = prenom
            ? [prenom, ...String(company.representative_name || '').trim().split(/\s+/)]
            : String(nomReferent(company) || company.name || 'Représentant').trim().split(/\s+/);
        const last = rest.join(' ') || '';

        const linkCompany = async (uid) => {
            try { await conn.query('UPDATE company SET user_id = ? WHERE id = ? AND organization_id = ?', [uid, company.id, orgId]); }
            catch (e) { if (!isMissingSchema(e)) throw e; } // migration 084 non jouée
        };
        /* LE RÉFÉRENT EST UN STAGIAIRE QUI A DÉJÀ SON COMPTE (migration 174) : c'est ce compte-là qu'on
           rattache, quelle que soit l'adresse de l'entreprise. Il signe depuis son espace habituel,
           onglet Entreprise ; son mot de passe et son rôle ne sont pas touchés. L'e-mail de
           l'entreprise ne sert plus à le retrouver — une adresse générique n'y menait pas. */
        if (company.representative_learner_id) {
            const [[su]] = await conn.query(
                `SELECT u.id, u.role, u.email FROM learner l JOIN user u ON u.id = l.user_id
                  WHERE l.id = ? AND l.organization_id = ? AND u.organization_id = ?`,
                [company.representative_learner_id, orgId, orgId]);
            if (su) {
                await linkCompany(su.id);
                const { subject, html } = representativeEmail({
                    firstName: first, email: su.email, password: null, companyName: company.name, loginUrl: `${appUrl()}/login`,
                });
                sendMail({ to: su.email, subject, html, kind: 'credentials' });
                return res.status(200).json({ data: { email: su.email, linked: true, existing_role: su.role } });
            }
            // Pas encore de compte (il naît à l'inscription à une session) : on suit la voie de l'e-mail.
        }

        const email = (company.email || '').trim();
        if (!email) return res.status(422).json({ message: "Renseigne d'abord l'e-mail de l'entreprise." });

        // Compte existant pour cet e-mail dans l'organisme ? (le référent peut DÉJÀ être un
        // stagiaire / membre du bureau — cas fréquent d'une société au nom du propriétaire).
        const linkedId = company.user_id || null;
        const [[u]] = await conn.query('SELECT id, role FROM user WHERE email = ? AND organization_id = ?', [email, orgId]);
        const existing = u || (linkedId ? { id: linkedId, role: null } : null);


        /* E-mail au représentant : « voici votre accès pour signer les documents de l'entreprise ».
           Best-effort (ne bloque JAMAIS la création du compte, cf. lib/mailer.js) et soumis à
           l'interrupteur « Mailing » de l'organisme — kind 'credentials', même catégorie qu'un
           compte créé avec identifiants. `motDePasse` null quand l'accès est rattaché à un compte
           existant (le référent est déjà stagiaire) : l'e-mail renvoie alors vers sa connexion habituelle. */
        const prevenirRepresentant = (motDePasse) => {
            const { subject, html } = representativeEmail({
                firstName: first, email, password: motDePasse, companyName: company.name, loginUrl: `${appUrl()}/login`,
            });
            sendMail({ to: email, subject, html, kind: 'credentials' });
        };

        if (existing) {
            // Ce compte appartient-il à une vraie personne à NE PAS écraser (stagiaire lié,
            // ou membre du bureau) ? Si oui, on ne touche NI son rôle NI son mot de passe :
            // on rattache juste l'entreprise à son compte -> il gagne l'accès « Entreprise »
            // en plus, via sa connexion habituelle.
            const [[lc]] = await conn.query('SELECT COUNT(*) AS n FROM learner WHERE user_id = ?', [existing.id]);
            const isRealPerson = lc.n > 0 || ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR'].includes(existing.role);
            if (isRealPerson) {
                await linkCompany(existing.id);
                prevenirRepresentant(null); // pas de mot de passe : il garde sa connexion habituelle
                return res.status(200).json({ data: { email, linked: true, existing_role: existing.role } });
            }
            // Compte représentant dédié déjà en place : on réinitialise juste le mot de passe.
            const password = generatePassword();
            await conn.query("UPDATE user SET role = 'ENTREPRISE', password = ?, first_name = ?, last_name = ? WHERE id = ? AND organization_id = ?",
                [await bcrypt.hash(password, 10), first || 'Représentant', last, existing.id, orgId]);
            await linkCompany(existing.id);
            prevenirRepresentant(password);
            return res.status(200).json({ data: { email, password } });
        }

        // Aucun compte pour cet e-mail : on crée un compte représentant dédié.
        const password = generatePassword();
        const userId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO user (id, organization_id, role, first_name, last_name, email, phone, password)
             VALUES (?, ?, 'ENTREPRISE', ?, ?, ?, ?, ?)`,
            [userId, orgId, first || 'Représentant', last, email, company.phone || null, await bcrypt.hash(password, 10)]);
        await linkCompany(userId);
        prevenirRepresentant(password);
        res.status(201).json({ data: { email, password } });
    } catch (err) {
        console.error('Erreur compte représentant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/companies/import — l'import CSV des entreprises (demandé le 2026-09-22 ; lib/importFiches.js).
 * Même contrat que celui des stagiaires : sans `essai: false`, rien ne s'écrit ; l'import refait les
 * contrôles ; chaque fiche est créée comme à la main (colonnes présentes, prénom du référent replié
 * dans son nom avant la migration 174, trace au journal).
 */
const importCompanies = async (req, res) => {
    const lignes = Array.isArray(req.body?.lignes) ? req.body.lignes : null;
    const essai = req.body?.essai !== false;
    if (!lignes || !lignes.length) return res.status(422).json({ error: 'Aucune ligne à importer.' });
    if (lignes.length > MAX_LIGNES) return res.status(422).json({ error: `Trop de lignes (${lignes.length}) : ${MAX_LIGNES} au plus par import.` });
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [existantes] = await conn.query('SELECT name, siret, zip_code FROM company WHERE organization_id = ?', [orgId]);
        const resultats = analyserEntreprises(lignes, { existantes, normaliser: normaliserEntreprise, reEmail: RE_EMAIL_ENT, erreurTva });
        if (!essai) {
            const colonnes = await colonnesEntreprise(conn);
            for (const r of resultats.filter((x) => x.statut === 'a_creer')) {
                const id = crypto.randomUUID();
                try {
                    await appliquerReferent(conn, orgId, r.valeurs, colonnes);
                    const cols = colonnes.filter((k) => r.valeurs[k] !== undefined);
                    await conn.query(
                        `INSERT INTO company (id, organization_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
                        [id, orgId, ...cols.map((k) => clean(r.valeurs[k]))]);
                    logAudit(req, 'company.create', 'Company', id);
                    r.statut = 'cree';
                } catch (e) {
                    console.error('Import entreprises, ligne', r.ligne, ':', e.message);
                    r.statut = 'erreur'; r.motif = 'l\'écriture a échoué';
                }
            }
        }
        const sortie = resultats.map(({ valeurs, ...r }) => r);
        res.json({ data: { essai, bilan: bilan(sortie), resultats: sortie } });
    } catch (err) {
        console.error('Erreur import entreprises :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { importCompanies, getCompanies, getCompany, createCompany, updateCompany, deleteCompany, registerCompanyStagiaires, detachLearner, companyDocTemplates, listCompanyDocuments, createCompanyDocument, getCompanyParcours, generateGroupDocuments, getCompanyLearnerDocuments, createRepresentativeAccount, normaliserEntreprise, RE_EMAIL_ENT };

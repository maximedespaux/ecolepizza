/**
 * LE CROCHET DES RÈGLES D'E-MAIL DÉCLENCHÉES PAR UN DOCUMENT (migration 196) — « quand la Convention
 * est signée, écrire au stagiaire », demandé le 2026-09-30.
 *
 * L'ÉCOLE A CHOISI L'IMMÉDIAT : le message part quand le document change d'état (envoyé / signé), pas
 * au passage des trente minutes. On accroche donc les points de signature et d'envoi du contrôleur
 * des documents. DEUX EXIGENCES :
 *   · UN E-MAIL RATÉ NE DOIT JAMAIS FAIRE ÉCHOUER UNE SIGNATURE — `declencherPuisOublier` rend la main
 *     aussitôt et avale toute erreur ; le contrôleur l'appelle sans l'attendre ;
 *   · ON N'ENVOIE PAS DEUX FOIS — `mail_regle_doc` (règle, document, destinataire) garde la trace.
 *
 * Le cœur `declencherReglesDocument` prend `envoyer` en paramètre : le test n'ouvre ni base ni SMTP.
 */
const { estDeclencheurDoc, regleViseDocument, destinatairesDe } = require('./reglesDocument.js');
const { rendre } = require('./mailsPersonnalises.js');
const { colonneExiste, tableExiste } = require('./colonnes.js');

/**
 * Le cœur, éprouvable. `conn` = base, `envoyer({to,objet,corps,orgId})` injecté.
 * Renvoie `{ envoyes, echecs, regles }`.
 */
async function declencherReglesDocument(conn, { orgId, documentId, evenement, envoyer, orgName }) {
    if (!estDeclencheurDoc(evenement)) return { envoyes: 0, echecs: 0, regles: 0 };
    /* Sans la 196, rien : ni colonnes de ciblage/destinataire, ni table de déduplication. */
    if (!(await colonneExiste(conn, 'mail_regle', 'destinataire')) || !(await tableExiste(conn, 'mail_regle_doc'))) {
        return { envoyes: 0, echecs: 0, regles: 0 };
    }
    const [regles] = await conn.query(
        `SELECT id, template_slug, destinataire, learner_id, company_id, program_id, objet, corps
           FROM mail_regle WHERE organization_id = ? AND actif = 1 AND declencheur = ?`,
        [orgId, evenement]);
    if (!regles.length) return { envoyes: 0, echecs: 0, regles: 0 };

    /* LES FORMATIONS DE CHAQUE RÈGLE (migration 198) : la table d'association fait autorité quand elle
       porte des lignes ; sinon on garde `program_id` (cf. formationsDeRegle). Table absente → chaque
       règle reste sur son unique program_id, comme avant. */
    if (await tableExiste(conn, 'mail_regle_formation')) {
        const [liens] = await conn.query(
            'SELECT regle_id, program_id FROM mail_regle_formation WHERE regle_id IN (?)',
            [regles.map((r) => r.id)]);
        const parRegle = new Map();
        for (const l of liens) {
            if (!parRegle.has(l.regle_id)) parRegle.set(l.regle_id, []);
            parRegle.get(l.regle_id).push(l.program_id);
        }
        for (const r of regles) r.program_ids = parRegle.get(r.id) || [];
    }

    // Le document et son stagiaire.
    const [docs] = await conn.query(
        `SELECT gd.id, gd.learner_id, gd.template_slug, gd.title,
                l.email AS stagiaire_email, l.first_name, l.last_name
           FROM generated_document gd
           LEFT JOIN learner l ON l.id = gd.learner_id
          WHERE gd.id = ? AND gd.organization_id = ?`,
        [documentId, orgId]);
    const doc = docs[0];
    if (!doc) return { envoyes: 0, echecs: 0, regles: 0 };

    /* L'entreprise et la formation, par l'inscription liée au document (un document de stagiaire).
       Un document sans inscription (session, importé) n'en a pas : les filtres correspondants ne
       s'appliqueront alors qu'aux règles qui ne les exigent pas. */
    const [ctxs] = await conn.query(
        `SELECT e.company_id, s.program_id, p.title AS formation, p.code,
                DATE_FORMAT(s.start_date, '%Y-%m-%d') AS debut, DATE_FORMAT(s.end_date, '%Y-%m-%d') AS fin
           FROM document_formation df
           JOIN enrollment e ON e.id = df.enrollment_id
           JOIN training_session s ON s.id = e.session_id
           LEFT JOIN training_program p ON p.id = s.program_id
          WHERE df.document_id = ? LIMIT 1`,
        [documentId]);
    const ctx = ctxs[0] || null;
    const company_id = (ctx && ctx.company_id) || null;
    const program_id = (ctx && ctx.program_id) || null;

    /* L'adresse de l'entreprise = celle du compte du représentant (son espace), sinon celle de la
       fiche entreprise. Une entreprise sans espace ni e-mail ne reçoit rien (destinatairesDe l'écarte). */
    let entrepriseEmail = null;
    if (company_id) {
        const [cos] = await conn.query(
            'SELECT c.email AS cemail, u.email AS uemail FROM company c LEFT JOIN user u ON u.id = c.user_id WHERE c.id = ?',
            [company_id]);
        entrepriseEmail = (cos[0] && (cos[0].uemail || cos[0].cemail)) || null;
    }

    const docInfo = { template_slug: doc.template_slug, learner_id: doc.learner_id, company_id, program_id };
    let envoyes = 0;
    let echecs = 0;
    for (const r of regles) {
        if (!regleViseDocument(r, docInfo)) continue;
        const cibles = destinatairesDe(r, { stagiaireEmail: doc.stagiaire_email, entrepriseEmail });
        for (const cible of cibles) {
            /* Déjà parti pour ce document et ce destinataire ? On ne recommence pas. */
            const [deja] = await conn.query(
                'SELECT 1 AS x FROM mail_regle_doc WHERE regle_id = ? AND document_id = ? AND destinataire = ?',
                [r.id, documentId, cible.type]);
            if (deja.length) continue;
            const valeurs = {
                'Prénom': doc.first_name || '', Nom: doc.last_name || '', Organisme: orgName || 'École Pizza',
                Formation: (ctx && (ctx.formation || ctx.code)) || '',
                Session: [ctx && ctx.code, ctx && ctx.debut].filter(Boolean).join(' du '),
                'Date de fin': (ctx && ctx.fin) || '', 'Date de début': (ctx && ctx.debut) || '',
                Document: doc.title || '',
            };
            const res = await envoyer({
                to: cible.email, objet: rendre(r.objet, valeurs), corps: rendre(r.corps, valeurs), orgId,
            });
            const statut = res && res.sent ? 'envoye' : 'echec';
            if (statut === 'envoye') envoyes += 1; else echecs += 1;
            await conn.query(
                'INSERT IGNORE INTO mail_regle_doc (regle_id, document_id, destinataire, statut) VALUES (?, ?, ?, ?)',
                [r.id, documentId, cible.type, statut]);
        }
    }
    return { envoyes, echecs, regles: regles.length };
}

/**
 * Le crochet que le contrôleur appelle après un envoi / une signature. NON ATTENDU : il rend la main
 * tout de suite et N'ÉCHOUE JAMAIS — une signature ne doit pas tomber parce qu'un e-mail n'est pas
 * parti. `db` = le module de base (config/database.js).
 */
function declencherPuisOublier(db, { orgId, documentId, evenement }) {
    Promise.resolve()
        .then(() => {
            const { construireEnvoyeur } = require('./envoiGroupe.js');
            const org = require('./orgContext.js');
            return declencherReglesDocument(db.promise(), {
                orgId, documentId, evenement,
                envoyer: construireEnvoyeur(),
                orgName: org.orgInfo().short_name || org.orgInfo().legal_name || null,
            });
        })
        .then((r) => { if (r && (r.envoyes || r.echecs)) console.log(`[mailing/doc] ${evenement} : ${r.envoyes} envoyé(s), ${r.echecs} échec(s)`); })
        .catch((err) => console.error('Crochet e-mail document :', err && err.message));
}

module.exports = { declencherReglesDocument, declencherPuisOublier };

const crypto = require('crypto');
const db = require('../config/database.js');
const { belongsToOrg } = require('../lib/tenancy.js');
const { logAudit } = require('../lib/audit.js');
/* Les montants arrivent TAPÉS, en français : « 315,93 ». `Number()` n'y voyait rien (cf. le
   fichier) — une dépense ainsi saisie était refusée, une cible ignorée en silence. */
const { lireMontant } = require('../lib/montantSaisi.js');
/* QUAND UN STAGIAIRE EST FACTURÉ, et à quel prix : la règle vit à part, la Facturation dit « déjà
   facturé » avec elle (cf. le fichier). */
const { DATE_SESSION, FACTURES_DU_DOSSIER, montantDuDossier } = require('../lib/inscriptionsFacturees.js');
const {
    EXPENSE_CATEGORIES, CATEGORY_LABELS, DEFAULT_DIVIDENDE_CIBLE,
    REVENU_CATEGORIES, statutFor, conseilFor, mergeTargets,
} = require('../lib/compta.js');

const num = (v) => (v == null ? 0 : Number(v));
const currentYear = () => new Date().getFullYear();

/**
 * Agrège les trois sources de CA + les dépenses pour une PÉRIODE : une année, ou un mois de cette
 * année (`mois` de 1 à 12 ; 0 = l'année entière).
 *
 * UNE SEULE RÈGLE D'ATTRIBUTION, ET C'EST UN CHANGEMENT DE SENS ASSUMÉ. Cette fonction datait le
 * CA des inscriptions à l'ANNÉE DE LA SESSION (`training_session.year`) pendant que le gain du
 * mois, lui, le datait à l'ENCAISSEMENT (`enrollment.created_at`). Deux règles sur la même page :
 * les douze mois ne s'additionnaient pas en l'année, et le sélecteur de mois ne pouvait donc
 * piloter qu'une seule tuile — d'où l'impression, juste, que changer de mois ne changeait rien.
 *
 * Tout était passé à l'« encaissement » : une inscription comptait le mois où le dossier avait été
 * ENREGISTRÉ (`enrollment.created_at`) — ce qui n'est pas un encaissement, seulement une saisie.
 *
 * LA RÈGLE D'AUJOURD'HUI — décidée par l'école le 2026-09-29, après « les stagiaires venus ce mois-ci
 * comptent 0 € en Inscriptions ». Deux défauts s'additionnaient :
 *   · la SOMME portait sur `enrollment.price`, que l'application n'écrit JAMAIS (ni l'inscription, ni
 *     l'inscription par une entreprise, ni aucun écran) : tout dossier créé ici comptait 0 €, quand
 *     le devis et la convention, eux, retombent sur le tarif de la formation ;
 *   · la DATE était celle de la saisie du dossier, pas celle où le stagiaire vient.
 * Désormais un stagiaire compte :
 *   · le MOIS OÙ COMMENCE SA SESSION (`DATE_SESSION`, lib/inscriptionsFacturees.js), session
 *     annulée exclue ;
 *   · dès qu'une FACTURE ou un ACOMPTE ÉMIS le désigne (`FACTURES_DU_DOSSIER`) — c'est ainsi que
 *     l'école dit qu'il est vendu, en le choisissant sur une facture ;
 *   · au PRIX DE SON DOSSIER s'il en a un, sinon au TARIF DE LA FORMATION — la règle des documents
 *     (`enroll_price || price`, lib/tokens.js). Le montant de la facture n'est PAS repris : un acompte
 *     n'en porte qu'une part, et une facture de solde peut déduire l'acompte ou non.
 * Les douze mois s'additionnent toujours exactement en l'année : chaque dossier n'a qu'une date.
 * Les dossiers des sessions de la période qui n'ont pas encore de facture sont rendus aussi
 * (`inscriptions`, `facturee: false`) : l'écran les nomme, un total qui cache ce qu'il écarte ne
 * se vérifie pas.
 *
 * `nbSessions` reste compté sur l'ANNÉE DE SESSION (`training_session.year`), pour le « stagiaires
 * moyens par session » de l'onglet Performance, qui est annuel.
 */
async function computePeriode(conn, orgId, annee, mois = 0) {
    // Le filtre de mois n'existe que pour un vrai mois ; à 0 il disparaît de toutes les requêtes
    // d'un coup — une seule condition, pas deux variantes de chaque requête à garder synchrones.
    const parMois = (col) => (mois ? ` AND MONTH(${col}) = ?` : '');
    const arg = () => (mois ? [orgId, annee, mois] : [orgId, annee]);
    const [dossiers] = await conn.query(
        `SELECT e.id, e.learner_id, l.last_name, l.first_name, p.code AS program_code,
                DATE_FORMAT(${DATE_SESSION}, '%Y-%m-%d') AS debut,
                e.price AS prix_dossier, p.price AS tarif, ${FACTURES_DU_DOSSIER} AS factures
         FROM enrollment e
         JOIN training_session s ON s.id = e.session_id AND s.organization_id = e.organization_id
         JOIN training_program p ON p.id = s.program_id
         LEFT JOIN learner l ON l.id = e.learner_id
         WHERE e.organization_id = ? AND s.status <> 'ANNULEE'
           AND YEAR(${DATE_SESSION}) = ?${parMois(DATE_SESSION)}
         ORDER BY debut, l.last_name, l.first_name`,
        arg()
    );
    const inscriptions = dossiers.map((d) => ({
        id: d.id, learner_id: d.learner_id, nom: d.last_name, prenom: d.first_name,
        formation: d.program_code, debut: d.debut, factures: d.factures || null, facturee: !!d.factures,
        ...montantDuDossier(d.prix_dossier, d.tarif),
    }));
    const comptees = inscriptions.filter((d) => d.facturee);
    const inscr = {
        ca: comptees.reduce((s, d) => s + d.montant, 0),
        nb: comptees.length,
        nb_stagiaires: new Set(comptees.map((d) => d.learner_id)).size,
    };
    const [[mat]] = await conn.query(
        `SELECT COALESCE(SUM(amount * quantity), 0) AS ca
         FROM material_sale
         WHERE organization_id = ? AND YEAR(date) = ?${parMois('date')}`,
        arg()
    );
    const [[extra]] = await conn.query(
        `SELECT COALESCE(SUM(amount), 0) AS ca
         FROM revenue_extra
         WHERE organization_id = ? AND YEAR(date) = ?${parMois('date')}`,
        arg()
    );
    /* Le NOMBRE de sessions reste annuel : il ne sert qu'au « stagiaires moyens par session » de
       l'onglet Performance, qui compare deux années entières. */
    const [[sess]] = await conn.query(
        'SELECT COUNT(*) AS nb FROM training_session WHERE organization_id = ? AND year = ?',
        [orgId, annee]
    );
    const [postesRows] = await conn.query(
        `SELECT category, COALESCE(SUM(amount_ht), 0) AS total
         FROM expense
         WHERE organization_id = ? AND YEAR(date) = ?${parMois('date')}
         GROUP BY category`,
        arg()
    );

    const postes = {};
    for (const c of EXPENSE_CATEGORIES) postes[c] = 0;
    for (const r of postesRows) if (postes[r.category] !== undefined) postes[r.category] = num(r.total);

    const caInscriptions = num(inscr.ca);
    const caMateriel = num(mat.ca);
    const caExtra = num(extra.ca);
    const caTotal = caInscriptions + caMateriel + caExtra;
    const depensesTotal = Object.values(postes).reduce((s, v) => s + v, 0);

    return {
        annee, mois,
        caTotal, caInscriptions, caMateriel, caExtra,
        nbInscriptions: num(inscr.nb),
        nbStagiaires: num(inscr.nb_stagiaires),
        nbSessions: num(sess.nb),
        ticketMoyen: num(inscr.nb) ? Math.round(caInscriptions / num(inscr.nb)) : 0,
        stagiairesMoyens: num(sess.nb) ? Math.round((num(inscr.nb) / num(sess.nb)) * 10) / 10 : 0,
        depensesTotal,
        marge: caTotal - depensesTotal,
        postes,
        // Les dossiers de la période, facturés ou non : l'écran de gestion les nomme. Des noms de
        // stagiaires — `getPerformance` ne les renvoie donc pas (`sansListes`).
        inscriptions,
    };
}

/* `computeMonth` a disparu : elle calculait le gain d'un mois avec la règle de l'encaissement,
   pendant que le tableau annuel utilisait celle de l'année de session. Les deux règles se sont
   rejointes dans `computePeriode` — c'était la condition pour que le sélecteur de mois pilote
   TOUTE la page, et pour que les douze mois s'additionnent exactement en l'année. */

async function loadSettings(conn, orgId) {
    const [rows] = await conn.query('SELECT * FROM accounting_settings WHERE organization_id = ?', [orgId]);
    const row = rows[0];
    let targetsRaw = null;
    if (row && row.targets) { try { targetsRaw = JSON.parse(row.targets); } catch { targetsRaw = null; } }
    return {
        targets: mergeTargets(targetsRaw),
        dividendeCible: row ? num(row.dividende_cible) : DEFAULT_DIVIDENDE_CIBLE,
    };
}

/* La table des apports en nature arrive avec la migration 065 : sans elle, rien à lister. */
const sansTable = (e) => e && e.code === 'ER_NO_SUCH_TABLE';

/**
 * LES APPORTS EN NATURE de la période — un pétrin, un four, de la farine offerts par un partenaire.
 *
 * Ils se saisissent sur la page Partenaires, au même formulaire que les commissions, et ne
 * paraissaient NULLE PART ici : l'école a relevé, le 2026-09-29, des apports « qui ne remontent
 * pas en comptabilité ». Ils n'entrent toujours PAS dans le chiffre d'affaires, et c'est voulu :
 * rien n'a été encaissé, et leur valeur compterait sinon dans le résultat, donc dans les
 * dividendes « possibles » — un pétrin ne se distribue pas. `computePeriode` ne les lit donc
 * jamais ; ils sont listés À PART, pour la même période que tout le reste.
 *
 * Le nom du partenaire est joint DANS l'organisme : `createContribution` ne vérifiait pas le
 * partenaire reçu, et une ligne d'avant ce contrôle pourrait en désigner un d'ailleurs.
 */
async function apportsEnNature(conn, orgId, annee, mois) {
    try {
        const [rows] = await conn.query(
            `SELECT c.id, DATE_FORMAT(c.date, '%Y-%m-%d') AS date, c.type, c.label, c.value, p.name AS partner_name
             FROM partner_contribution c
             LEFT JOIN partner p ON p.id = c.partner_id AND p.organization_id = c.organization_id
             WHERE c.organization_id = ? AND YEAR(c.date) = ?${mois ? ' AND MONTH(c.date) = ?' : ''}
             ORDER BY c.date DESC, c.created_at DESC`,
            mois ? [orgId, annee, mois] : [orgId, annee]
        );
        return rows.map((r) => ({ ...r, value: num(r.value) }));
    } catch (e) {
        if (sansTable(e)) return [];
        throw e;
    }
}

/**
 * CE QUE LE MOIS AFFICHÉ CACHE : pour chaque liste, les AUTRES mois de l'année qui ont des lignes.
 *
 * La page s'ouvre sur le mois courant. Un apport saisi avec la date où il a été reçu — juillet,
 * pour une commission de juillet — n'y paraît donc pas, et rien ne disait où le trouver : la
 * liste disait « aucun », ce qui est vrai du mois et faux de l'année. L'écran nomme maintenant
 * les mois où chercher. Rien à dire sur l'année entière, qui montre déjà tout.
 */
const LISTES_DATEES = [['depenses', 'expense'], ['revenus', 'revenue_extra'], ['enNature', 'partner_contribution']];
async function autresMois(conn, orgId, annee, mois) {
    const out = { depenses: [], revenus: [], enNature: [] };
    if (!mois) return out;
    await Promise.all(LISTES_DATEES.map(async ([cle, table]) => {
        try {
            const [rows] = await conn.query(
                `SELECT MONTH(date) AS mois, COUNT(*) AS nb FROM ${table}
                 WHERE organization_id = ? AND YEAR(date) = ? AND MONTH(date) <> ?
                 GROUP BY MONTH(date) ORDER BY mois`,
                [orgId, annee, mois]
            );
            out[cle] = rows.map((r) => ({ mois: num(r.mois), nb: num(r.nb) }));
        } catch (e) {
            if (!sansTable(e)) throw e;
        }
    }));
    return out;
}

/**
 * LES ANNÉES À PROPOSER : celles des sessions, et celles de tout ce qui se SAISIT à une date libre.
 * La liste ne venait que des sessions : une subvention de 2024, dans une année sans session,
 * était enregistrée sans qu'aucune année du sélecteur ne permette de la revoir.
 */
async function anneesSaisies(conn, orgId) {
    const annees = [];
    const [rows] = await conn.query(
        `SELECT YEAR(date) AS year FROM revenue_extra WHERE organization_id = ?
         UNION SELECT YEAR(date) FROM expense WHERE organization_id = ?
         UNION SELECT YEAR(date) FROM material_sale WHERE organization_id = ?`,
        [orgId, orgId, orgId]
    );
    annees.push(...rows.map((r) => num(r.year)));
    try {
        const [nature] = await conn.query(
            'SELECT DISTINCT YEAR(date) AS year FROM partner_contribution WHERE organization_id = ?', [orgId]);
        annees.push(...nature.map((r) => num(r.year)));
    } catch (e) {
        if (!sansTable(e)) throw e;
    }
    return annees.filter((a) => a > 0);
}

/**
 * GET /api/comptabilite?annee=YYYY — tableau de gestion (module A).
 */
const getGestion = async (req, res) => {
    const orgId = req.user.organization_id;
    const annee = Number(req.query.annee) || currentYear();
    // Mois demandé : absent → mois courant ; vide ou 0 → ANNÉE ENTIÈRE (le total de l'année) ;
    // sinon borné à [1,12] pour qu'un ?mois=13 ne produise pas une requête vide silencieuse.
    const rawMois = req.query.mois;
    let mois;
    if (rawMois === undefined) mois = new Date().getMonth() + 1;
    else if (rawMois === '' || Number(rawMois) === 0) mois = 0;
    else mois = Math.min(12, Math.max(1, Number(rawMois)));
    try {
        const conn = db.promise();
        const [year, settings] = await Promise.all([
            computePeriode(conn, orgId, annee, mois),
            loadSettings(conn, orgId),
        ]);
        /* LES LISTES SUIVENT LE MOIS, ELLES AUSSI. Elles restaient annuelles quand les totaux
           passaient au mois : on lisait « 2 300 € de dépenses en mars » au-dessus d'une liste de
           quarante lignes couvrant toute l'année, sans moyen de retrouver les trois qui font le
           chiffre. Une liste qui ne justifie pas le total qu'elle accompagne est pire qu'absente. */
        const parMois = (col) => (mois ? ` AND MONTH(${col}) = ?` : '');
        const argListe = mois ? [orgId, annee, mois] : [orgId, annee];
        const [depenses] = await conn.query(
            `SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, label, category, amount_ht, note
             FROM expense WHERE organization_id = ? AND YEAR(date) = ?${parMois('date')}
             ORDER BY date DESC, created_at DESC`,
            argListe
        );
        /* Le partenaire d'un produit divers est nommé dans la liste : « Commission partenaire »
           ne disait pas LEQUEL. Sous-requête bornée à l'organisme, comme la jointure des apports. */
        const [revenus] = await conn.query(
            `SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, label, category, amount, note,
                    (SELECT p.name FROM partner p
                      WHERE p.id = revenue_extra.partner_id AND p.organization_id = revenue_extra.organization_id) AS partner_name
             FROM revenue_extra WHERE organization_id = ? AND YEAR(date) = ?${parMois('date')}
             ORDER BY date DESC, created_at DESC`,
            argListe
        );
        const [enNature, ailleurs, [yearsRows], saisies] = await Promise.all([
            apportsEnNature(conn, orgId, annee, mois),
            autresMois(conn, orgId, annee, mois),
            conn.query('SELECT DISTINCT year FROM training_session WHERE organization_id = ? ORDER BY year DESC', [orgId]),
            anneesSaisies(conn, orgId),
        ]);

        const ca = year.caTotal;
        const postes = EXPENSE_CATEGORIES.map((cat) => {
            const total = year.postes[cat];
            const pct = ca > 0 ? Math.round((total / ca) * 1000) / 10 : 0;
            const cible = settings.targets[cat];
            const statut = statutFor(pct, cible);
            return { categorie: cat, label: CATEGORY_LABELS[cat], total, pct, cible, statut, conseil: conseilFor(cat, statut, pct, cible) };
        });

        const marge = year.marge;
        const margePct = ca > 0 ? Math.round((marge / ca) * 1000) / 10 : 0;
        const dividendeCible = settings.dividendeCible || DEFAULT_DIVIDENDE_CIBLE;
        const dividendeVise = Math.max(0, Math.round(ca * (dividendeCible / 100)));
        const dividendePossible = Math.max(0, Math.round(marge));
        const dividendeRealiste = Math.min(dividendeVise, dividendePossible);
        const partRealistePct = ca > 0 ? Math.round((dividendeRealiste / ca) * 1000) / 10 : 0;
        const dividendeStatut = marge <= 0 ? 'impossible' : dividendePossible >= dividendeVise ? 'atteignable' : 'partiel';
        const dividendeMessage =
            marge <= 0
                ? "Aucune distribution possible : les dépenses dépassent le CA. Réduisez d'abord les postes en rouge."
                : dividendePossible >= dividendeVise
                    ? `Objectif atteignable : la marge couvre les ${dividendeCible}% visés.`
                    : `Distribution réaliste plafonnée par la marge (${dividendeRealiste.toLocaleString('fr-FR')} € sur ${dividendeVise.toLocaleString('fr-FR')} € visés).`;

        const annees = Array.from(new Set([annee, currentYear(), ...yearsRows.map((r) => num(r.year)), ...saisies]))
            .filter((a) => a > 0).sort((a, b) => b - a);

        res.json({
            data: {
                annee,
                ca: { total: ca, inscriptions: year.caInscriptions, materiel: year.caMateriel, extra: year.caExtra },
                postes, totalDepenses: year.depensesTotal,
                marge, margePct,
                /* LA PÉRIODE COUVERTE PAR TOUS LES CHIFFRES CI-DESSUS. Il y avait ici un bloc
                   « gain du mois » séparé : il était le SEUL chiffre à suivre le sélecteur, tout
                   le reste restant annuel. Maintenant que la page entière suit le mois, un second
                   total mensuel ne ferait que répéter le premier. On ne garde que le numéro, pour
                   que l'écran puisse écrire « Résultat mars 2026 » au lieu de « Résultat 2026 ». */
                mois: { numero: mois },
                dividendeCible, dividendeVise, dividendePossible, dividendeRealiste,
                partRealistePct, dividendeStatut, dividendeMessage,
                targets: settings.targets,
                depenses: depenses.map((d) => ({ ...d, amount_ht: num(d.amount_ht) })),
                revenus: revenus.map((r) => ({ ...r, amount: num(r.amount) })),
                /* Les stagiaires venus dans la période : ceux qui comptent (une facture ou un acompte
                   émis les désigne), et ceux qui attendent leur facture — cf. `computePeriode`. */
                inscriptions: year.inscriptions.filter((d) => d.facturee),
                aFacturer: year.inscriptions.filter((d) => !d.facturee),
                // Hors chiffre d'affaires, et hors résultat : cf. `apportsEnNature`.
                enNature,
                totalEnNature: enNature.reduce((s, c) => s + c.value, 0),
                autresMois: ailleurs,
                annees,
            },
        });
    } catch (err) {
        console.error('Erreur comptabilité (gestion) :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/comptabilite/performance?annee=YYYY — récap annuel + comparaison N-1.
 */
const getPerformance = async (req, res) => {
    const orgId = req.user.organization_id;
    const annee = Number(req.query.annee) || currentYear();
    try {
        const conn = db.promise();
        /* Deux années entières : sans la liste des dossiers, qui porte des noms de stagiaires et
           que cet onglet n'affiche pas. */
        const sansListes = (periode) => { const reste = { ...periode }; delete reste.inscriptions; return reste; };
        const [current, previous] = (await Promise.all([
            computePeriode(conn, orgId, annee),
            computePeriode(conn, orgId, annee - 1),
        ])).map(sansListes);
        const postesLabels = EXPENSE_CATEGORIES.map((c) => ({ categorie: c, label: CATEGORY_LABELS[c] }));
        res.json({ data: { annee, anneePrec: annee - 1, current, previous, postesLabels } });
    } catch (err) {
        console.error('Erreur comptabilité (performance) :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/comptabilite/depenses — enregistrer une dépense.
 */
const createExpense = async (req, res) => {
    const { label, categorie, montantHT, date, note } = req.body;
    const cat = EXPENSE_CATEGORIES.includes(categorie) ? categorie : 'DIVERS';
    const amount = lireMontant(montantHT);
    if (!label || !String(label).trim() || !Number.isFinite(amount) || amount < 0) {
        return res.status(422).json({ error: 'Libellé et montant valides requis.' });
    }
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO expense (id, organization_id, date, category, label, amount_ht, note)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, date || new Date().toISOString().slice(0, 10),
             cat, String(label).trim().slice(0, 255), amount.toFixed(2), note ? String(note).slice(0, 255) : null]
        );
        logAudit(req, 'expense.create', 'Expense', id);
        res.status(201).json({ message: 'Dépense enregistrée', id });
    } catch (err) {
        console.error('Erreur création dépense :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/comptabilite/depenses/:id
 */
const deleteExpense = async (req, res) => {
    try {
        const [r] = await db.promise().query(
            'DELETE FROM expense WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ message: 'Dépense introuvable' });
        logAudit(req, 'expense.delete', 'Expense', req.params.id);
        res.status(200).json({ success: true, message: 'Dépense supprimée' });
    } catch (err) {
        console.error('Erreur suppression dépense :', err);
        res.status(400).json({ message: 'Erreur suppression' });
    }
};

/**
 * GET /api/comptabilite/revenus?annee=YYYY — liste des produits divers de l'année.
 * Accessible au formateur (surface allégée « Produit divers »).
 */
const listRevenues = async (req, res) => {
    const orgId = req.user.organization_id;
    const annee = Number(req.query.annee) || currentYear();
    try {
        const [rows] = await db.promise().query(
            `SELECT re.id, DATE_FORMAT(re.date, '%Y-%m-%d') AS date, re.label, re.category, re.amount, re.note,
                    re.partner_id, p.name AS partner_name
             FROM revenue_extra re
             LEFT JOIN partner p ON p.id = re.partner_id
             WHERE re.organization_id = ? AND YEAR(re.date) = ?
             ORDER BY re.date DESC, re.created_at DESC`,
            [orgId, annee]
        );
        const data = rows.map((r) => ({ ...r, amount: num(r.amount) }));
        const total = data.reduce((s, r) => s + r.amount, 0);
        res.json({ data, total, annee });
    } catch (err) {
        console.error('Erreur liste produits divers :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/comptabilite/revenus — enregistrer un produit divers.
 */
const createRevenue = async (req, res) => {
    const { label, categorie, montant, date, note, partner_id } = req.body;
    const cat = REVENU_CATEGORIES.includes(categorie) ? categorie : 'COMMISSION';
    const amount = lireMontant(montant);
    if (!label || !String(label).trim() || !Number.isFinite(amount) || amount < 0) {
        return res.status(422).json({ error: 'Libellé et montant valides requis.' });
    }
    if (cat === 'COMMISSION' && !partner_id) {
        return res.status(422).json({ error: 'Une commission doit être rattachée à un partenaire.' });
    }
    try {
        // `partner_id` vient du corps : listRevenues joint `partner` sans filtre pour afficher
        // son nom, un identifiant étranger ferait donc apparaître le partenaire d'un autre
        // organisme dans nos produits.
        if (!await belongsToOrg(db.promise(), 'partner', partner_id, req.user.organization_id)) {
            return res.status(422).json({ error: 'Partenaire inconnu.' });
        }
        const id = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO revenue_extra (id, organization_id, date, label, category, partner_id, amount, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, date || new Date().toISOString().slice(0, 10),
             String(label).trim().slice(0, 255), cat, partner_id || null, amount.toFixed(2), note ? String(note).slice(0, 255) : null]
        );
        logAudit(req, 'revenueextra.create', 'RevenueExtra', id);
        res.status(201).json({ message: 'Produit enregistré', id });
    } catch (err) {
        console.error('Erreur création produit :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/comptabilite/revenus/:id — modifie un produit / une commission.
 */
const updateRevenue = async (req, res) => {
    const b = req.body || {};
    const fields = {};
    if (b.label !== undefined) fields.label = String(b.label).trim().slice(0, 255);
    if (b.categorie !== undefined) fields.category = REVENU_CATEGORIES.includes(b.categorie) ? b.categorie : 'COMMISSION';
    /* Un montant illisible est REFUSÉ : il était ignoré, et la correction répondait « Produit mis
       à jour » en gardant l'ancien montant — le libellé changeait, pas la somme. */
    if (b.montant !== undefined) {
        const a = lireMontant(b.montant);
        if (!Number.isFinite(a) || a < 0) return res.status(422).json({ error: 'Montant illisible : écrivez-le par exemple 315,93.' });
        fields.amount = a.toFixed(2);
    }
    if (b.date !== undefined) fields.date = b.date || null;
    if (b.partner_id !== undefined) fields.partner_id = b.partner_id || null;
    if (b.note !== undefined) fields.note = b.note ? String(b.note).slice(0, 255) : null;
    if (fields.label !== undefined && !fields.label) return res.status(422).json({ error: 'Libellé requis.' });
    if (fields.category === 'COMMISSION' && fields.partner_id === null) {
        return res.status(422).json({ error: 'Une commission doit être rattachée à un partenaire.' });
    }
    const keys = Object.keys(fields);
    if (!keys.length) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    try {
        // Le WHERE protège bien la LIGNE modifiée ; il ne dit rien du partenaire qu'on y pose.
        if (fields.partner_id !== undefined
            && !await belongsToOrg(db.promise(), 'partner', fields.partner_id, req.user.organization_id)) {
            return res.status(422).json({ error: 'Partenaire inconnu.' });
        }
        const [r] = await db.promise().query(
            `UPDATE revenue_extra SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND organization_id = ?`,
            [...keys.map((k) => fields[k]), req.params.id, req.user.organization_id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ message: 'Produit introuvable' });
        logAudit(req, 'revenueextra.update', 'RevenueExtra', req.params.id);
        res.json({ success: true, message: 'Produit mis à jour' });
    } catch (err) {
        console.error('Erreur maj produit :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/comptabilite/revenus/:id
 */
const deleteRevenue = async (req, res) => {
    try {
        const [r] = await db.promise().query(
            'DELETE FROM revenue_extra WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ message: 'Produit introuvable' });
        logAudit(req, 'revenueextra.delete', 'RevenueExtra', req.params.id);
        res.status(200).json({ success: true, message: 'Produit supprimé' });
    } catch (err) {
        console.error('Erreur suppression produit :', err);
        res.status(400).json({ message: 'Erreur suppression' });
    }
};

/**
 * PUT /api/comptabilite/cibles — cibles (% du CA) + dividende visé.
 */
const saveTargets = async (req, res) => {
    const targets = mergeTargets(req.body.targets);
    let dividende = lireMontant(req.body.dividendeCible);
    if (!Number.isFinite(dividende) || dividende < 0 || dividende > 100) dividende = DEFAULT_DIVIDENDE_CIBLE;
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [existing] = await conn.query('SELECT id FROM accounting_settings WHERE organization_id = ?', [orgId]);
        if (existing.length) {
            await conn.query(
                'UPDATE accounting_settings SET targets = ?, dividende_cible = ? WHERE organization_id = ?',
                [JSON.stringify(targets), dividende.toFixed(2), orgId]
            );
        } else {
            await conn.query(
                'INSERT INTO accounting_settings (id, organization_id, targets, dividende_cible) VALUES (?, ?, ?, ?)',
                [crypto.randomUUID(), orgId, JSON.stringify(targets), dividende.toFixed(2)]
            );
        }
        logAudit(req, 'accountingsettings.update', 'AccountingSettings');
        res.status(200).json({ data: { targets, dividendeCible: dividende } });
    } catch (err) {
        console.error('Erreur enregistrement cibles :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getGestion, getPerformance, createExpense, deleteExpense,
    listRevenues, createRevenue, updateRevenue, deleteRevenue, saveTargets,
};

const crypto = require('crypto');
const db = require('../config/database.js');
const { belongsToOrg } = require('../lib/tenancy.js');
const { logAudit } = require('../lib/audit.js');
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
 * Tout est passé à l'ENCAISSEMENT : une inscription compte le mois où elle a été ENREGISTRÉE.
 * C'est la seule règle qui a un sens à l'échelle du mois (un mois n'a pas d'année de session), et
 * c'est celle qui répond à la question qu'on pose à cet écran — combien est entré, combien est
 * sorti. Conséquence à connaître : une inscription saisie en décembre pour une session de l'an
 * prochain compte en décembre, plus dans l'année de la session. Le résultat annuel affiché peut
 * donc différer de ce qu'il montrait avant ce changement.
 *
 * `nbSessions` et `stagiairesMoyens` restent comptés sur l'ANNÉE DE SESSION : une session n'est
 * pas un encaissement, elle a lieu à sa date, et un « nombre de sessions de mars » n'aurait aucun
 * rapport avec les inscriptions encaissées en mars.
 */
async function computePeriode(conn, orgId, annee, mois = 0) {
    // Le filtre de mois n'existe que pour un vrai mois ; à 0 il disparaît de toutes les requêtes
    // d'un coup — une seule condition, pas deux variantes de chaque requête à garder synchrones.
    const parMois = (col) => (mois ? ` AND MONTH(${col}) = ?` : '');
    const arg = () => (mois ? [orgId, annee, mois] : [orgId, annee]);
    const [[inscr]] = await conn.query(
        `SELECT COALESCE(SUM(e.price), 0) AS ca, COUNT(*) AS nb,
                COUNT(DISTINCT e.learner_id) AS nb_stagiaires
         FROM enrollment e
         WHERE e.organization_id = ? AND YEAR(e.created_at) = ?${parMois('e.created_at')}`,
        arg()
    );
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
    /* Les SESSIONS restent annuelles : une session a lieu à sa date, pas au moment où on encaisse.
       Les rapporter au mois donnerait un « stagiaires par session » qui divise des inscriptions
       encaissées en mars par des sessions tenues en mars — deux populations sans rapport. */
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
        const [revenus] = await conn.query(
            `SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, label, category, amount, note
             FROM revenue_extra WHERE organization_id = ? AND YEAR(date) = ?${parMois('date')}
             ORDER BY date DESC, created_at DESC`,
            argListe
        );
        const [yearsRows] = await conn.query(
            'SELECT DISTINCT year FROM training_session WHERE organization_id = ? ORDER BY year DESC',
            [orgId]
        );

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

        const annees = Array.from(new Set([annee, currentYear(), ...yearsRows.map((r) => r.year)])).sort((a, b) => b - a);

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
        const [current, previous] = await Promise.all([
            computePeriode(conn, orgId, annee),
            computePeriode(conn, orgId, annee - 1),
        ]);
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
    const amount = Number(montantHT);
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
    const amount = Number(montant);
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
    if (b.montant !== undefined) { const a = Number(b.montant); if (Number.isFinite(a) && a >= 0) fields.amount = a.toFixed(2); }
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
    let dividende = Number(req.body.dividendeCible);
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

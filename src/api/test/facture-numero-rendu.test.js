/**
 * UN DOCUMENT SUPPRIMÉ REND SON NUMÉRO — demandé par l'école le 2026-09-30 : « j'ai créé
 * FACT-2026-0008, je le supprime : le suivant sera FACT-2026-0009, il devrait être encore
 * FACT-2026-0008 », puis « pareil pour les autres entités émettrices ».
 *
 * LE DÉFAUT : le compteur d'une entité (`billing_profile.next_number`) ne savait qu'avancer. Un
 * brouillon créé puis supprimé laissait un TROU dans une numérotation que la loi veut continue — et
 * la suppression elle-même ne laissait aucune trace au journal.
 *
 * CE QUI EST GARDÉ ICI, et les deux limites qui comptent autant que la règle :
 *   · le numéro n'est rendu que si le document n'a JAMAIS ÉTÉ ÉMIS : un numéro émis a pu partir
 *     chez un client, le redonner ferait deux factures différentes du même numéro ;
 *   · et s'il portait le DERNIER numéro de sa séquence : rendre le 0007 quand le 0008 existe ferait
 *     ressortir un second 0008.
 * C'est l'entité qui a numéroté le document qui recule, jamais l'entité par défaut.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ORG = '11111111-1111-4111-8111-111111111111';

// ── Une base en mémoire : deux entités émettrices, leurs compteurs, et des documents ────────────
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();
let profils, factures, requetes, journal, sansMigration113;
function remettre() {
    profils = {
        p1: { id: 'p1', organization_id: ORG, invoice_prefix: 'FACT', number_format: null, next_number: 9, is_default: 1 },
        p2: { id: 'p2', organization_id: ORG, invoice_prefix: 'BQ', number_format: '{PREFIX}-{YY}{MM}-{SEQ:5}', next_number: 43, is_default: 0 },
    };
    factures = [
        { id: 'f7', organization_id: ORG, number: 'FACT-2026-0007', status: 'BROUILLON', billing_profile_id: 'p1' },
        { id: 'f8', organization_id: ORG, number: 'FACT-2026-0008', status: 'BROUILLON', billing_profile_id: 'p1' },
        { id: 'b42', organization_id: ORG, number: 'BQ-2609-00042', status: 'BROUILLON', billing_profile_id: 'p2' },
    ];
    requetes = []; journal = []; sansMigration113 = false;
}
async function requete(sql, params) {
    const q = plat(sql);
    requetes.push({ q, params });
    if (/^SELECT id, number, status, billing_profile_id FROM invoice/.test(q)) {
        if (sansMigration113) throw Object.assign(new Error('Unknown column billing_profile_id'), { code: 'ER_BAD_FIELD_ERROR' });
        return [factures.filter((f) => f.id === params[0] && f.organization_id === params[1])];
    }
    if (/^SELECT id, number, status, NULL AS billing_profile_id FROM invoice/.test(q)) {
        return [factures.filter((f) => f.id === params[0] && f.organization_id === params[1]).map((f) => ({ ...f, billing_profile_id: null }))];
    }
    if (/^DELETE FROM invoice WHERE id = \? AND organization_id = \?/.test(q)) {
        const avant = factures.length;
        factures = factures.filter((f) => !(f.id === params[0] && f.organization_id === params[1]));
        return [{ affectedRows: avant - factures.length }];
    }
    if (/^SELECT billing_profile_id, number FROM invoice WHERE organization_id = \? AND billing_profile_id IS NOT NULL/.test(q)) {
        return [factures.filter((f) => f.organization_id === params[0] && f.billing_profile_id).map((f) => ({ billing_profile_id: f.billing_profile_id, number: f.number }))];
    }
    if (/^SELECT \* FROM billing_profile WHERE id = \? AND organization_id = \?/.test(q)) {
        const p = profils[params[0]];
        return [p && p.organization_id === params[1] ? [{ ...p }] : []];
    }
    if (/^UPDATE billing_profile SET next_number = \? WHERE id = \? AND organization_id = \? AND next_number = \?/.test(q)) {
        const p = profils[params[1]];
        if (!p || p.organization_id !== params[2] || p.next_number !== params[3]) return [{ affectedRows: 0 }];
        p.next_number = params[0];
        return [{ affectedRows: 1 }];
    }
    if (/^UPDATE billing_profile SET next_number = \? WHERE id = \?/.test(q)) { // nextNumberForEmitter
        profils[params[1]].next_number = params[0];
        return [{ affectedRows: 1 }];
    }
    return [[]];
}
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: requete }),
    // logAudit écrit en mode rappel : on garde ce qu'il trace.
    query: (sql, params, cb) => { journal.push({ q: plat(sql), params }); const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };
const { formatNumber, sequenceDuNumero, rendreLeNumero, nextNumberForEmitter, dernieresSequences } = require('../lib/emitter.js');
const facturesCtrl = require('../controllers/invoice.controller.js');
const entitesCtrl = require('../controllers/billingProfile.controller.js');

async function supprimer(id) {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    requetes = [];
    await facturesCtrl.deleteInvoice({ user: { organization_id: ORG, id: 'u1' }, params: { id } }, res);
    return res;
}
const reculs = () => requetes.filter((r) => /^UPDATE billing_profile SET next_number/.test(r.q));

test('LA SÉQUENCE SE RELIT DANS LE NUMÉRO, quel que soit le gabarit de l\'entité', () => {
    const d = new Date('2026-12-31T23:59:00');
    for (const number_format of [null, 'TXT.{YYYY}.901.{SEQ:4}', '{PREFIX}-{YY}{MM}{DD}-{SEQ:6}', '{SEQ}/{YYYY}', '{PREFIX}({SEQ})']) {
        for (const n of [1, 9, 10, 9999, 10000, 123456]) {
            const e = { invoice_prefix: 'A+B', number_format };
            assert.strictEqual(sequenceDuNumero(e, formatNumber(e, n, d)), n, `${number_format} · ${n}`);
        }
    }
    // Le numéro d'une AUTRE entité, ou d'un gabarit changé depuis : on ne devine pas.
    assert.strictEqual(sequenceDuNumero({ invoice_prefix: 'FACT' }, 'F-2026-0008'), null);
    assert.strictEqual(sequenceDuNumero({ invoice_prefix: 'FACT', number_format: '{PREFIX}/{SEQ}' }, 'FACT-2026-0008'), null);
});

test('LE CAS RELEVÉ : FACT-2026-0008 supprimé, le suivant est encore FACT-2026-0008', async () => {
    remettre();
    const res = await supprimer('f8');
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps.numero_rendu, true);
    assert.match(res.corps.message, /Le prochain document reprendra le numéro FACT-2026-0008\./);
    assert.strictEqual(profils.p1.next_number, 8, 'le compteur recule d\'un cran');
    // Et la création suivante le redonne bien, par le chemin habituel.
    const suivant = await nextNumberForEmitter({ query: requete }, { ...profils.p1 });
    assert.match(suivant, /^FACT-\d{4}-0008$/);
    assert.strictEqual(profils.p1.next_number, 9);
});

test('PAREIL POUR LES AUTRES ENTITÉS : c\'est le compteur de CELLE qui a numéroté qui recule', async () => {
    remettre();
    const res = await supprimer('b42');
    assert.strictEqual(res.corps.numero_rendu, true);
    assert.strictEqual(profils.p2.next_number, 42, 'l\'entité « BQ », avec son propre gabarit');
    assert.strictEqual(profils.p1.next_number, 9, 'l\'entité par défaut n\'a pas bougé');
    assert.deepStrictEqual(reculs()[0].params, [42, 'p2', ORG, 43], 'gardé par l\'organisme ET par la valeur lue');
});

test('PAS LE DERNIER : le 0007 n\'est pas rendu quand le 0008 existe', async () => {
    remettre();
    const res = await supprimer('f7');
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.corps.numero_rendu, false);
    assert.match(res.corps.message, /FACT-2026-0007 ne sera pas repris : un numéro plus récent a déjà été donné/);
    assert.strictEqual(profils.p1.next_number, 9, 'reculer ferait ressortir un second 0008');
    assert.strictEqual(reculs().length, 0);
    assert.ok(!factures.some((f) => f.id === 'f7'), 'le document est supprimé quand même');
});

test('UN DOCUMENT ÉMIS GARDE SON NUMÉRO : il a pu partir chez un client', async () => {
    for (const status of ['EMISE', 'PAYEE', 'IMPAYEE', 'ANNULEE']) {
        remettre();
        factures.find((f) => f.id === 'f8').status = status;
        const res = await supprimer('f8');
        assert.strictEqual(res.corps.numero_rendu, false, status);
        assert.match(res.corps.message, /ne sera pas repris : le document avait été émis/, status);
        assert.strictEqual(profils.p1.next_number, 9, status);
        assert.strictEqual(reculs().length, 0, status);
    }
});

test('UNE FACTURE CRÉÉE ENTRE-TEMPS a pris le numéro suivant : le compteur ne recule plus', async () => {
    remettre();
    // Lu à 9, mais passé à 10 avant l'UPDATE : la garde `AND next_number = ?` ne trouve rien.
    const conn = { query: async (sql, params) => {
        const q = plat(sql);
        if (/^SELECT \* FROM billing_profile/.test(q)) { const copie = { ...profils.p1 }; profils.p1.next_number = 10; return [[copie]]; }
        return requete(sql, params);
    } };
    assert.deepStrictEqual(await rendreLeNumero(conn, ORG, 'p1', 'FACT-2026-0008'), { rendu: false, raison: 'pas_le_dernier' });
    assert.strictEqual(profils.p1.next_number, 10);
    // Et sans entité, ou avec un numéro d'un autre gabarit : rien, et c'est dit.
    assert.deepStrictEqual(await rendreLeNumero({ query: requete }, ORG, null, 'FACT-2026-0008'), { rendu: false, raison: 'sans_entite' });
    assert.deepStrictEqual(await rendreLeNumero({ query: requete }, ORG, 'p1', 'F-2026-0008'), { rendu: false, raison: 'autre_gabarit' });
});

test('LA SUPPRESSION EST JOURNALISÉE, avec le numéro — et un identifiant inconnu ne supprime rien', async () => {
    remettre();
    await supprimer('f8');
    const trace = journal.find((j) => /INSERT INTO audit_log/.test(j.q));
    assert.ok(trace, 'aucune trace au journal : un numéro qui ressort ailleurs doit pouvoir s\'expliquer');
    assert.ok(trace.params.includes('invoice.delete') && trace.params.includes('FACT-2026-0008'));

    remettre();
    const inconnu = await supprimer('nulle-part');
    assert.strictEqual(inconnu.code, 404);
    assert.ok(!requetes.some((r) => /^DELETE/.test(r.q)));
    assert.strictEqual(journal.length, 0);
});

test('SANS LA MIGRATION 113 (aucune entité), la suppression marche comme avant', async () => {
    remettre();
    sansMigration113 = true;
    const res = await supprimer('f8');
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps.numero_rendu, false);
    assert.strictEqual(res.corps.message, 'Document supprimé.');
    assert.ok(!factures.some((f) => f.id === 'f8'));
});

/* ── LES SUPPRESSIONS D'AVANT ─────────────────────────────────────────────────────────────────────
 * Le jour de la demande, l'école en était à FACT-2026-0009 sans FACT-2026-0008 : le brouillon avait
 * été supprimé AVANT que la suppression sache rendre son numéro, et le compteur ne se règle nulle
 * part. Une action le ramène juste après le dernier document qui EXISTE — jamais ailleurs. */
async function reprendre(id) {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    requetes = [];
    await entitesCtrl.reprendreNumerotation({ user: { organization_id: ORG, id: 'u1' }, params: { id } }, res);
    return res;
}

test('LE DERNIER DOCUMENT EXISTANT de chaque entité, lu par SON gabarit', async () => {
    remettre();
    factures.push({ id: 'vieux', organization_id: ORG, number: 'F-2025-0900', status: 'PAYEE', billing_profile_id: 'p1' });
    const max = await dernieresSequences({ query: requete }, ORG, Object.values(profils));
    assert.strictEqual(max.get('p1'), 8, 'F-2025-0900 ne suit pas le gabarit de l\'entité : on ne devine pas sa séquence');
    assert.strictEqual(max.get('p2'), 42);
    assert.deepStrictEqual([...(await dernieresSequences({ query: requete }, ORG, [])).keys()], []);
});

test('REPRENDRE LA NUMÉROTATION : le compteur revient juste après le dernier document, et c\'est journalisé', async () => {
    remettre();
    // Le cas de l'école : le 0008 a été supprimé par l'ancien code, le compteur est resté à 9.
    factures = factures.filter((f) => f.id !== 'f8');
    const res = await reprendre('p1');
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(profils.p1.next_number, 8);
    assert.match(res.corps.message, /^Le prochain document portera le numéro FACT-\d{4}-0008\.$/);
    assert.deepStrictEqual(reculs()[0].params, [8, 'p1', ORG, 9], 'gardé par l\'organisme ET par la valeur lue');
    const trace = journal.find((j) => /INSERT INTO audit_log/.test(j.q));
    assert.ok(trace && trace.params.includes('billing_profile.compteur'), 'redonner des numéros est une décision : elle se trace');
    assert.strictEqual(profils.p2.next_number, 43, 'une seule entité à la fois');

    // Plus rien à reprendre : le refus le dit, et le compteur ne descend JAMAIS sous un document existant.
    const encore = await reprendre('p1');
    assert.strictEqual(encore.code, 409);
    assert.strictEqual(profils.p1.next_number, 8);
    // Une entité sans aucun document repart à 1.
    remettre();
    factures = [];
    await reprendre('p2');
    assert.strictEqual(profils.p2.next_number, 1);
    // Une entité inconnue (ou d'un autre organisme) : rien.
    assert.strictEqual((await reprendre('ailleurs')).code, 404);
});

test('LA LISTE DES ENTITÉS dit où en sont leurs documents, et l\'écran ne propose de reprendre que s\'il y a de quoi', () => {
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'billingProfile.controller.js'), 'utf8');
    assert.match(ctrl, /for \(const r of rows\) r\.sequence_max = max\.get\(r\.id\) \|\| 0;/);
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'billingProfile.routes.js'), 'utf8');
    assert.match(routes, /router\.put\('\/:id\/compteur', authorizeRoles\(\.\.\.ADMIN_ROLES\), reprendreNumerotation\)/, 'le bureau seulement');
    const ecran = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'components', 'BillingProfiles.jsx'), 'utf8');
    assert.match(ecran, /r\.sequence_max != null && Number\(r\.next_number\) - 1 > Number\(r\.sequence_max\)/);
    assert.match(ecran, /À ne faire que s'ils n'ont jamais été remis à un client/, 'la question dit ce que reprendre veut dire');
    // Le compteur ne devient PAS un champ : une faute de frappe y ferait un trou, ou un doublon.
    assert.doesNotMatch(ctrl.slice(ctrl.indexOf('const CHAMPS'), ctrl.indexOf('];', ctrl.indexOf('const CHAMPS'))), /next_number/);
});

test('L\'ÉCRAN dit ce qu\'il advient du numéro : avant, et après', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Factures.jsx'), 'utf8');
    assert.match(page, /onClick=\{\(\) => remove\(i\)\}/, 'le document entier : son statut décide de la question');
    assert.match(page, /inv\.status === "BROUILLON"\s+\? `Supprimer le brouillon \$\{inv\.number\} \?/);
    assert.match(page, /a été émis : son numéro ne sera pas repris/);
    assert.match(page, /setStatus\(\{ type: "success", message: r\.message \|\| "Document supprimé\." \}\)/,
        'la réponse du serveur s\'affiche : c\'est elle qui sait si le numéro est rendu');
});

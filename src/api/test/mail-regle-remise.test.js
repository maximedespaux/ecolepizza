/**
 * RÈGLE D'E-MAIL DÉCLENCHÉE PAR UNE REMISE (demandé le 2026-10-19) — « quand l'école remet l'AGEFICE,
 * écrire ». Un déclencheur d'ÉVÉNEMENT de plus, à côté de « document envoyé / signé », mais sur une
 * REMISE (remise_type/remise_document, migration 160) et non un generated_document.
 *
 * Ce qu'on gèle :
 *   · `remise_remise` est un événement (immédiat), reconnu à côté des documents ;
 *   · le « modèle ciblé » d'une règle de remise = l'ID du TYPE de remise, rangé dans template_slug ;
 *   · le crochet n'envoie qu'aux règles qui visent CE type, remplit {Document} = le libellé de la remise ;
 *   · sans la 196, rien ne part ;
 *   · le dépôt d'une remise (deposer) appelle le crochet, à part et non bloquant.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = require('../lib/reglesDocument.js');
const { declencherReglesRemise } = require('../lib/crochetMailsDocument.js');

/* ─── Domaine PUR ─────────────────────────────────────────────────────────────────────────────── */

test('remise_remise est un ÉVÉNEMENT, à part des documents et des dates', () => {
    assert.ok(R.estDeclencheurRemise('remise_remise'));
    assert.ok(R.estDeclencheurEvenement('remise_remise'), 'un événement');
    assert.ok(R.estDeclencheurEvenement('document_signe'), 'les documents aussi sont des événements');
    assert.strictEqual(R.estDeclencheurRemise('document_signe'), false, 'un document n\'est pas une remise');
    assert.strictEqual(R.estDeclencheurEvenement('fin_session'), false, 'une date n\'est pas un événement');
});

test('regleViseRemise : le « modèle » ciblé est l\'ID DU TYPE de remise (template_slug réutilisé)', () => {
    const rem = { remise_type_id: 'rt1', learner_id: 'l1', company_id: 'c1', program_id: 'p1' };
    assert.ok(R.regleViseRemise({}, rem), 'sans filtre : toute remise');
    assert.ok(R.regleViseRemise({ template_slug: 'rt1' }, rem), 'le type ciblé correspond');
    assert.strictEqual(R.regleViseRemise({ template_slug: 'rt2' }, rem), false, 'un AUTRE type ne déclenche pas');
    assert.strictEqual(R.regleViseRemise({ company_id: 'c2' }, rem), false, 'une autre entreprise écarte');
    assert.strictEqual(R.regleViseRemise({ program_id: 'p2' }, rem), false, 'une autre formation écarte');
    assert.ok(R.regleViseRemise({ template_slug: 'rt1', company_id: 'c1', program_id: 'p1' }, rem), 'tout correspond');
});

/* ─── Crochet (base simulée, SMTP injecté) ────────────────────────────────────────────────────── */

function faireConn(reponses) {
    return { query: async (sql) => {
        const s = String(sql).replace(/\s+/g, ' ').trim();
        const r = reponses.find(([re]) => re.test(s));
        return [r ? (typeof r[1] === 'function' ? r[1]() : r[1]) : []];
    } };
}
const EXISTE = [/information_schema\.columns/, [{ 1: 1 }]];
const TABLE = [/information_schema\.tables/, [{ 1: 1 }]];
const SANS_FORMATION = [/FROM mail_regle_formation WHERE regle_id IN/, []];
const REMISE = [/FROM remise_document rd/, [{
    id: 'rd1', remise_type_id: 'rt-agefice', remise_label: 'AGEFICE', company_id: 'c1', learner_id: 'l1', program_id: 'p1',
    formation: 'Pizzaïolo', code: 'RS7404', stagiaire_email: 's@ex.fr', first_name: 'Léa', last_name: 'Roux', debut: '2026-05-18', fin: '2026-05-22',
}]];
const ENTREPRISE = [/FROM company c LEFT JOIN user u/, [{ uemail: 'rep@ex.fr', cemail: 'contact@ex.fr' }]];
const PAS_ENVOYE = [/FROM mail_regle_doc WHERE regle_id/, []];
const INSERT = [/INSERT IGNORE INTO mail_regle_doc/, [{}]];
const envoiFactice = () => { const envois = []; return { envois, envoyer: async (m) => { envois.push(m); return { sent: true }; } }; };

test('une règle « remise déposée » ciblant AGEFICE part pour CE type, au stagiaire, {Document} rempli', async () => {
    const { envois, envoyer } = envoiFactice();
    const conn = faireConn([
        EXISTE, TABLE,
        [/FROM mail_regle WHERE organization_id = \? AND actif = 1 AND declencheur = 'remise_remise'/,
            [{ id: 'r1', template_slug: 'rt-agefice', destinataire: 'stagiaire', learner_id: null, company_id: null, program_id: null,
                objet: 'Pensez à signer {Document}', corps: 'Bonjour {Prénom}, votre {Document} est prêt.' }]],
        SANS_FORMATION, REMISE, ENTREPRISE, PAS_ENVOYE, INSERT,
    ]);
    const r = await declencherReglesRemise(conn, { orgId: 'o1', remiseDocumentId: 'rd1', envoyer, orgName: 'École Pizza' });
    assert.strictEqual(r.envoyes, 1);
    assert.strictEqual(envois.length, 1);
    assert.strictEqual(envois[0].to, 's@ex.fr');
    assert.match(envois[0].objet, /AGEFICE/, '{Document} = le libellé de la remise');
    assert.match(envois[0].corps, /Léa/, '{Prénom} rempli');
});

test('un AUTRE type de remise ne déclenche pas la règle ciblée', async () => {
    const { envois, envoyer } = envoiFactice();
    const conn = faireConn([
        EXISTE, TABLE,
        [/declencheur = 'remise_remise'/, [{ id: 'r1', template_slug: 'rt-fafcea', destinataire: 'stagiaire', objet: 'x', corps: 'y' }]],
        SANS_FORMATION, REMISE, ENTREPRISE, PAS_ENVOYE, INSERT,
    ]);
    const r = await declencherReglesRemise(conn, { orgId: 'o1', remiseDocumentId: 'rd1', envoyer, orgName: 'X' });
    assert.strictEqual(r.envoyes, 0);
    assert.strictEqual(envois.length, 0);
});

test('« stagiaire et entreprise » : deux e-mails', async () => {
    const { envois, envoyer } = envoiFactice();
    const conn = faireConn([
        EXISTE, TABLE,
        [/declencheur = 'remise_remise'/, [{ id: 'r1', template_slug: null, destinataire: 'stagiaire_entreprise', objet: 'o', corps: 'c' }]],
        SANS_FORMATION, REMISE, ENTREPRISE, PAS_ENVOYE, INSERT,
    ]);
    const r = await declencherReglesRemise(conn, { orgId: 'o1', remiseDocumentId: 'rd1', envoyer, orgName: 'X' });
    assert.strictEqual(r.envoyes, 2, 'un au stagiaire, un à l\'entreprise');
    assert.deepStrictEqual(envois.map((e) => e.to).sort(), ['rep@ex.fr', 's@ex.fr']);
});

test('sans la 196 (colonne destinataire absente), rien ne part', async () => {
    const { envois, envoyer } = envoiFactice();
    const conn = faireConn([[/information_schema\.columns/, []]]);
    const r = await declencherReglesRemise(conn, { orgId: 'o1', remiseDocumentId: 'rd1', envoyer, orgName: 'X' });
    assert.strictEqual(r.regles, 0);
    assert.strictEqual(envois.length, 0);
});

/* ─── Le crochet est bien accroché au dépôt d'une remise ──────────────────────────────────────── */

test('le dépôt d\'une remise (deposer) appelle le crochet APRÈS l\'écriture, non bloquant', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'remise.controller.js'), 'utf8');
    assert.match(src, /declencherPuisOublierRemise\(db, \{ orgId: req\.user\.organization_id, remiseDocumentId: r\.id \}\)/);
    // Après le logAudit du dépôt (donc après l'INSERT) : on n'écrit pas un e-mail sur une remise pas déposée.
    assert.match(src, /logAudit\(req, 'remise\.depot'[\s\S]{0,400}?declencherPuisOublierRemise/);
});

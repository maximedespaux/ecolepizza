/**
 * LE CROCHET DES RÈGLES D'E-MAIL DÉCLENCHÉES PAR UN DOCUMENT (migration 196) —
 * lib/crochetMailsDocument.js, cœur `declencherReglesDocument` (base simulée, SMTP injecté).
 *
 * CE QUE CES TESTS GÈLENT :
 *   · une règle « document signé » filtrée par modèle ne part que pour CE modèle ;
 *   · « le stagiaire ET l'entreprise » envoie deux e-mails, et enregistre deux traces ;
 *   · on n'envoie pas deux fois (mail_regle_doc) ;
 *   · sans la 196 (colonnes absentes), rien ne part ;
 *   · un déclencheur qui n'est pas un événement de document ne touche même pas la base.
 */
const test = require('node:test');
const assert = require('node:assert');
const { declencherReglesDocument } = require('../lib/crochetMailsDocument.js');

/* Une base factice : chaque requête est appariée par motif ; la réponse est le tableau de lignes. */
function faireConn(reponses, journal) {
    return {
        query: async (sql, params) => {
            const s = String(sql).replace(/\s+/g, ' ').trim();
            if (journal) journal.push({ s, params });
            const r = reponses.find(([re]) => re.test(s));
            const lignes = r ? (typeof r[1] === 'function' ? r[1](params) : r[1]) : [];
            return [lignes];
        },
    };
}
const EXISTE = [/information_schema\.columns/, [{ 1: 1 }]];
const TABLE = [/information_schema\.tables/, [{ 1: 1 }]];
const DOC = [/FROM generated_document gd/, [{ id: 'd1', learner_id: 'l1', template_slug: 'convention', title: 'Convention de formation', stagiaire_email: 's@ex.fr', first_name: 'Anthony', last_name: 'MUNOZ' }]];
const CTX = [/FROM document_formation df/, [{ company_id: 'c1', program_id: 'p1', formation: 'Pizzaïolo', code: 'RS7404', debut: '2026-05-18', fin: '2026-05-22' }]];
const ENTREPRISE = [/FROM company c LEFT JOIN user u/, [{ uemail: 'rep@ex.fr', cemail: 'contact@ex.fr' }]];
const PAS_ENVOYE = [/FROM mail_regle_doc WHERE regle_id/, []];
const INSERT = [/INSERT IGNORE INTO mail_regle_doc/, [{}]];

function envoiFactice() {
    const envois = [];
    return { envois, envoyer: async (m) => { envois.push(m); return { sent: true }; } };
}

test('UNE RÈGLE « document signé » filtrée par modèle part pour CE modèle, au stagiaire', async () => {
    const { envois, envoyer } = envoiFactice();
    const conn = faireConn([
        EXISTE, TABLE,
        [/FROM mail_regle WHERE organization_id = \? AND actif = 1 AND declencheur = \?/,
            [{ id: 'r1', template_slug: 'convention', destinataire: 'stagiaire', learner_id: null, company_id: null, program_id: null, objet: 'Merci {Prénom}', corps: 'Votre {Document} est signée.' }]],
        DOC, CTX, ENTREPRISE, PAS_ENVOYE, INSERT,
    ]);
    const r = await declencherReglesDocument(conn, { orgId: 'o1', documentId: 'd1', evenement: 'document_signe', envoyer, orgName: 'École Pizza' });
    assert.strictEqual(r.envoyes, 1);
    assert.strictEqual(envois.length, 1);
    assert.strictEqual(envois[0].to, 's@ex.fr');
    assert.strictEqual(envois[0].objet, 'Merci Anthony', 'le jeton {Prénom} est rempli');
    assert.match(envois[0].corps, /Convention de formation/, '{Document} = le titre du document');
});

test('UN AUTRE MODÈLE ne déclenche pas la règle filtrée', async () => {
    const { envois, envoyer } = envoiFactice();
    const conn = faireConn([
        EXISTE, TABLE,
        [/FROM mail_regle WHERE .* declencheur = \?/, [{ id: 'r1', template_slug: 'contrat', destinataire: 'stagiaire', objet: 'x', corps: 'y' }]],
        DOC, CTX, ENTREPRISE, PAS_ENVOYE, INSERT,
    ]);
    const r = await declencherReglesDocument(conn, { orgId: 'o1', documentId: 'd1', evenement: 'document_signe', envoyer, orgName: 'X' });
    assert.strictEqual(r.envoyes, 0);
    assert.strictEqual(envois.length, 0);
});

test('« STAGIAIRE ET ENTREPRISE » : deux e-mails, deux traces', async () => {
    const { envois, envoyer } = envoiFactice();
    const journal = [];
    const conn = faireConn([
        EXISTE, TABLE,
        [/FROM mail_regle WHERE .* declencheur = \?/, [{ id: 'r1', template_slug: null, destinataire: 'stagiaire_entreprise', objet: 'o', corps: 'c' }]],
        DOC, CTX, ENTREPRISE, PAS_ENVOYE, INSERT,
    ], journal);
    const r = await declencherReglesDocument(conn, { orgId: 'o1', documentId: 'd1', evenement: 'document_signe', envoyer, orgName: 'X' });
    assert.strictEqual(r.envoyes, 2);
    assert.deepStrictEqual(envois.map((e) => e.to).sort(), ['rep@ex.fr', 's@ex.fr']);
    const inserts = journal.filter((q) => /INSERT IGNORE INTO mail_regle_doc/.test(q.s));
    assert.strictEqual(inserts.length, 2, 'une trace par destinataire');
});

test('ON N\'ENVOIE PAS DEUX FOIS : une trace existante coupe l\'envoi', async () => {
    const { envois, envoyer } = envoiFactice();
    const conn = faireConn([
        EXISTE, TABLE,
        [/FROM mail_regle WHERE .* declencheur = \?/, [{ id: 'r1', template_slug: null, destinataire: 'stagiaire', objet: 'o', corps: 'c' }]],
        DOC, CTX, ENTREPRISE,
        [/FROM mail_regle_doc WHERE regle_id/, [{ x: 1 }]], // déjà parti
        INSERT,
    ]);
    const r = await declencherReglesDocument(conn, { orgId: 'o1', documentId: 'd1', evenement: 'document_signe', envoyer, orgName: 'X' });
    assert.strictEqual(r.envoyes, 0);
    assert.strictEqual(envois.length, 0);
});

test('SANS LA 196 (colonnes absentes) : rien ne part', async () => {
    const { envois, envoyer } = envoiFactice();
    const conn = faireConn([[/information_schema\.columns/, []]]); // destinataire n'existe pas
    const r = await declencherReglesDocument(conn, { orgId: 'o1', documentId: 'd1', evenement: 'document_signe', envoyer, orgName: 'X' });
    assert.strictEqual(r.envoyes, 0);
    assert.strictEqual(envois.length, 0);
});

test('UN DÉCLENCHEUR QUI N\'EST PAS UN ÉVÉNEMENT DE DOCUMENT ne touche pas la base', async () => {
    const { envois, envoyer } = envoiFactice();
    const journal = [];
    const conn = faireConn([EXISTE, TABLE], journal);
    const r = await declencherReglesDocument(conn, { orgId: 'o1', documentId: 'd1', evenement: 'fin_session', envoyer, orgName: 'X' });
    assert.strictEqual(r.envoyes, 0);
    assert.strictEqual(journal.length, 0, 'aucune requête : on sort avant');
    assert.strictEqual(envois.length, 0);
});

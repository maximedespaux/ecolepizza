/**
 * UN STAGIAIRE INSCRIT PAR UNE ENTREPRISE OUVRE, EN LECTURE, LES DOCUMENTS DE GROUPE DE SON DOSSIER.
 *
 * LE DÉFAUT GELÉ ICI, constaté le 2026-10-08 sur l'espace stagiaire. Les documents de GROUPE (devis,
 * convention, CGV — signés par l'entreprise) sont créés SANS `learner_id` : ils appartiennent à la
 * société. Mais ils sont liés à CHAQUE inscription du groupe par `document_formation`, et l'espace
 * du stagiaire les affiche dans « Mes documents ». Or toutes les routes de lecture d'un document
 * gardaient par « un non-membre du personnel ne lit QUE son propre document (doc.learner_id = moi) » :
 * un document de groupe (learner_id NULL) était donc REFUSÉ au stagiaire — « Accès refusé » sur un
 * document pourtant listé dans son parcours.
 *
 * LA RÈGLE RETENUE (décidée avec l'école) : il peut les OUVRIR en lecture, pas les signer. La lecture
 * passe par `lecteurDuDocument`, partagée par les quatre routes de lecture ; la SIGNATURE garde son
 * propre contrôle (signDocument), inchangé.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { lecteurDuDocument } = require('../controllers/document.controller.js');

// Un `conn` factice : chaque requête répond selon ce qu'elle cherche, sans base.
function connFactice({ owner = false, lie = false, signe = false } = {}) {
    return {
        async query(sql) {
            if (/FROM learner WHERE id = \? AND user_id = \?/.test(sql)) return [owner ? [{ id: 'l1' }] : []];
            if (/FROM document_formation df/.test(sql)) return [lie ? [{ ok: 1 }] : []];
            if (/FROM document_signature WHERE document_id/.test(sql)) return [signe ? [{ id: 's1' }] : []];
            throw new Error('requête inattendue : ' + sql);
        },
    };
}
const docGroupe = { id: 'd1', learner_id: null, organization_id: 'o1' }; // document de GROUPE (pas de learner_id)
const stagiaire = { role: 'STAGIAIRE', id: 'u1' };

test('le personnel lit tout, sans la moindre requête', async () => {
    const conn = { query() { throw new Error('aucune requête attendue pour le personnel'); } };
    for (const role of ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR']) {
        assert.strictEqual(await lecteurDuDocument(conn, { role, id: 'x' }, docGroupe), true, role);
    }
});

test('LE DÉFAUT CORRIGÉ : un stagiaire ouvre un document de GROUPE rattaché à son dossier', async () => {
    // Devis / convention / CGV : pas de learner_id, mais liés à son inscription par document_formation.
    assert.strictEqual(await lecteurDuDocument(connFactice({ lie: true }), stagiaire, docGroupe), true);
});

test('un stagiaire SANS lien ni case de signature ne lit pas (anti-IDOR conservé)', async () => {
    // Le document d'un AUTRE : ni le sien, ni lié à son dossier, ni une case à lui → refusé.
    assert.strictEqual(await lecteurDuDocument(connFactice({}), stagiaire, docGroupe), false);
});

test('le document NOMINATIF du stagiaire reste lisible par lui', async () => {
    const docPropre = { id: 'd2', learner_id: 'l1', organization_id: 'o1' };
    assert.strictEqual(await lecteurDuDocument(connFactice({ owner: true }), stagiaire, docPropre), true);
});

test('le signataire attribué (document sans learner_id) ouvre ce qu\'on lui fait signer', async () => {
    assert.strictEqual(await lecteurDuDocument(connFactice({ signe: true }), { role: 'EXTERNE', id: 'u2' }, docGroupe), true);
});

test('les QUATRE lectures emploient la règle partagée ; SIGNER garde son propre contrôle', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    for (const [h, borne] of [['const getDocument = async', 1200], ['async function fillForRequest', 1200], ['const downloadProof = async', 1200]]) {
        const z = src.slice(src.indexOf(h), src.indexOf(h) + borne);
        assert.match(z, /lecteurDuDocument\(conn, req\.user,/, `${h} doit employer lecteurDuDocument`);
    }
    // Le téléchargement du PDF aussi (chemin du PDF signé).
    assert.match(src, /const allowed = await lecteurDuDocument\(conn, req\.user, sdoc\);/);
    // La SIGNATURE, elle, n'emploie PAS cette règle de lecture : ouvrir n'est pas signer.
    const sign = src.slice(src.indexOf('const signDocument = async'), src.indexOf('const signDocument = async') + 5000);
    assert.doesNotMatch(sign, /lecteurDuDocument/, 'signDocument garde son contrôle, la lecture ne l\'élargit pas');
    // Le lien de lecture est BORNÉ à l'organisme du document (pas de fuite inter-organisme).
    assert.match(src, /WHERE df\.document_id = \? AND l\.user_id = \? AND e\.organization_id = \?/);
});

/**
 * PIÈCES JUSTIFICATIVES : QUI PASSE OUTRE LA PROPRIÉTÉ D'UN DOSSIER (2026-09-28).
 *
 * LE DÉFAUT. Les quatre routes des dossiers — lister, déposer, servir, retirer — n'ont que
 * `authenticateToken` : le stagiaire doit pouvoir y déposer. Le contrôleur décidait donc seul qui
 * agit POUR L'ÉCOLE, et il le décidait par exclusion : « tout sauf STAGIAIRE et INTERVENANT ». Un
 * compte ENTREPRISE — le représentant qui signe les documents de son entreprise — passait pour le
 * bureau. Pour peu qu'il ait les identifiants, il listait les pièces de n'importe quel dossier de
 * l'organisme, téléchargeait les copies DÉCHIFFRÉES des cartes d'identité, déposait un fichier que
 * la règle « un dépôt fait par l'école vaut vérification » validait aussitôt, et en effaçait.
 * FINANCEUR de même, et tout rôle qu'on ajouterait demain.
 *
 * LA RÈGLE. Le bureau est NOMMÉ (`ROLES_PERSONNEL`, AUDITEUR compris) ; tout autre compte n'a que
 * son propre dossier.
 *
 * ÉPROUVÉ SUR LES HANDLERS, pas sur un motif du source : ce qui compte est ce qu'un compte
 * ENTREPRISE obtient, quelle que soit la façon d'écrire la garde. Un test par handler, pour que
 * l'ancienne garde remise dans UN SEUL des quatre fasse virer SON test au rouge — vérifié en la
 * réintroduisant, dans les quatre à la fois puis dans un seul.
 */
const test = require('node:test');
const assert = require('node:assert');

/* ── Une base factice : un dossier, une pièce, un fichier ───────────────────────────────────────── */
const PROPRIETAIRE = 'u-titulaire'; // le stagiaire du dossier ; aucun `compte(role)` par défaut ne porte cet identifiant
const SCAN = Buffer.from('%PDF-1.7 recto verso'); // hors format chiffré : `decryptBytes` le rend tel quel
let etat;
function reinitialiser(o = {}) {
    etat = { statut: 'DEPOSEE', fichiers: 1, ecritures: [], journal: [], ...o };
}
reinitialiser();
const cheminDb = require.resolve('../config/database.js');
const faux = {
    promise: () => ({
        query: async (sql) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (/^(INSERT|UPDATE|DELETE)/i.test(q)) etat.ecritures.push(q.split(' ').slice(0, 3).join(' '));
            if (/^SELECT max_octets, mimes FROM piece_type LIMIT 1/.test(q)) return [[]];
            if (/^SELECT label, fichiers_attendus/.test(q)) return [[{ label: "Carte d'identité", fichiers_attendus: 2, max_octets: null, mimes: null }]];
            if (/FROM enrollment e JOIN learner l/.test(q)) return [[{ id: 'enr-1', organization_id: 'o1', user_id: PROPRIETAIRE }]];
            if (/^SELECT pt\.id AS piece_type_id/.test(q)) {
                return [[{ piece_type_id: 'pt-1', code: 'CNI', label: "Carte d'identité", depot_id: 'dep-1', statut: etat.statut }]];
            }
            if (/^SELECT id, depot_id, nom, mime, taille, sort_order FROM piece_fichier/.test(q)) {
                return [[{ id: 'f-1', depot_id: 'dep-1', nom: 'cni-dupont.pdf', mime: 'application/pdf', taille: SCAN.length, sort_order: 1 }]];
            }
            if (/^SELECT id FROM piece_depot WHERE enrollment_id = \? AND piece_type_id = \?/.test(q)) return [[{ id: 'dep-1' }]];
            if (/^SELECT COUNT\(\*\) AS n FROM piece_fichier WHERE depot_id = \?/.test(q)) return [[{ n: etat.fichiers }]];
            if (/^SELECT COALESCE\(MAX\(sort_order\), 0\)/.test(q)) return [[{ m: etat.fichiers }]];
            if (/^SELECT pf\.mime, pf\.bytes, pf\.nom, d\.organization_id, l\.user_id FROM piece_fichier pf/.test(q)) {
                return [[{ mime: 'application/pdf', bytes: SCAN, nom: 'cni-dupont.pdf', organization_id: 'o1', user_id: PROPRIETAIRE }]];
            }
            if (/^SELECT pf\.depot_id, d\.organization_id, d\.statut, l\.user_id FROM piece_fichier pf/.test(q)) {
                return [[{ depot_id: 'dep-1', organization_id: 'o1', statut: etat.statut, user_id: PROPRIETAIRE }]];
            }
            if (/^DELETE FROM piece_fichier WHERE id = \?/.test(q)) { etat.fichiers -= 1; return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
    // `logAudit` écrit par la forme à rappel : on en garde l'ACTION (4ᵉ valeur), pour savoir ce qui a été tracé.
    query: (sql, params, cb) => { etat.journal.push(params[3]); if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { listDossier, deposer, servirFichier, supprimerFichier } = require('../controllers/piece.controller.js');

async function appeler(fn, req) {
    const r = { code: 200, corps: null, octets: null };
    const res = {
        status(c) { r.code = c; return this; }, json(b) { r.corps = b; return this; },
        set() { return this; }, send(b) { r.octets = b; return this; }, end() { return this; },
    };
    await fn({ headers: {}, ip: '127.0.0.1', ...req }, res);
    return r;
}
const compte = (role, id = `u-${role.toLowerCase()}`) => ({ organization_id: 'o1', id, role });
const ROUTES = {
    listDossier: (user) => appeler(listDossier, { user, params: { enrollmentId: 'enr-1' } }),
    deposer: (user) => appeler(deposer, {
        user, params: { enrollmentId: 'enr-1', pieceTypeId: 'pt-1' },
        file: { originalname: 'autre.pdf', buffer: Buffer.from('%PDF-1.7 x'), mimetype: 'application/pdf' },
    }),
    servirFichier: (user) => appeler(servirFichier, { user, params: { id: 'f-1' } }),
    supprimerFichier: (user) => appeler(supprimerFichier, { user, params: { id: 'f-1' } }),
};

/* ── Le défaut : un représentant d'entreprise passait pour le bureau ────────────────────────────── */
for (const [nom, appel] of Object.entries(ROUTES)) {
    test(`${nom} : un compte ENTREPRISE, sur un dossier qui n'est pas le sien, reçoit 403 — et rien ne sort ni ne s'écrit`, async () => {
        /* Pièce VALIDÉE : c'est l'état où seul le bureau peut encore retirer un fichier. Pris pour
           le bureau, le représentant en effaçait un ; pris pour ce qu'il est, il ne passe pas la
           propriété du dossier, et le 403 arrive avant même la question du statut. */
        reinitialiser({ statut: 'VALIDEE' });
        const r = await appel(compte('ENTREPRISE', 'u-representant'));
        assert.strictEqual(r.code, 403, `reçu ${r.code} : « tout sauf STAGIAIRE et INTERVENANT » comptait le représentant au bureau`);
        assert.strictEqual(r.octets, null, 'aucun octet de pièce d\'identité ne sort');
        assert.ok(!r.corps || !('data' in r.corps), 'ni libellé, ni statut, ni nom de fichier du dossier');
        assert.deepStrictEqual(etat.ecritures, [], 'rien ne s\'écrit ni ne s\'efface');
        assert.deepStrictEqual(etat.journal, [], 'et rien ne se trace : il ne s\'est rien passé');
    });
}

test('hors du bureau, tout compte est un étranger au dossier : FINANCEUR, un rôle ajouté demain, un autre stagiaire, un intervenant', async () => {
    /* `NOUVEAU_ROLE` n'existe pas : il tient la place du rôle qu'on ajoutera sans penser à cette
       garde. Une liste de refus l'aurait compté au bureau ; une liste nommée le refuse d'office. */
    for (const role of ['FINANCEUR', 'NOUVEAU_ROLE', 'STAGIAIRE', 'INTERVENANT']) {
        for (const [nom, appel] of Object.entries(ROUTES)) {
            reinitialiser({ statut: 'VALIDEE' });
            const r = await appel(compte(role));
            assert.strictEqual(r.code, 403, `${role} sur ${nom} : reçu ${r.code}`);
            assert.deepStrictEqual(etat.ecritures, [], `${role} sur ${nom} : rien ne doit s'écrire`);
        }
    }
});

/* ── Ce que la correction ne doit pas coûter ────────────────────────────────────────────────────── */
test('le bureau garde la main sur les quatre routes — AUDITEUR compris', async () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR']) {
        reinitialiser();
        const liste = await ROUTES.listDossier(compte(role));
        assert.strictEqual(liste.code, 200, `${role} : la liste du dossier`);
        assert.strictEqual(liste.corps.data[0].fichiers[0].nom, 'cni-dupont.pdf');
        const fichier = await ROUTES.servirFichier(compte(role));
        assert.strictEqual(fichier.code, 200, `${role} : l'ouverture du fichier`);
        assert.ok(SCAN.equals(fichier.octets), `${role} : le fichier, en clair`);
        const depot = await ROUTES.deposer(compte(role));
        assert.strictEqual(depot.code, 201, `${role} : le dépôt — ${JSON.stringify(depot.corps)}`);
        assert.deepStrictEqual(etat.journal, ['piece.depot', 'piece.validee'], `${role} : un dépôt du bureau vaut vérification`);
        reinitialiser({ statut: 'VALIDEE', fichiers: 2 });
        const retrait = await ROUTES.supprimerFichier(compte(role));
        assert.strictEqual(retrait.code, 200, `${role} : le retrait d'un fichier d'une pièce validée`);
        assert.deepStrictEqual(etat.ecritures, ['DELETE FROM piece_fichier']);
    }
});

test('le stagiaire garde SON dossier : il le lit, ouvre ses fichiers, y dépose pour contrôle — sans retirer une pièce validée', async () => {
    const lui = compte('STAGIAIRE', PROPRIETAIRE);
    reinitialiser();
    assert.strictEqual((await ROUTES.listDossier(lui)).code, 200);
    assert.strictEqual((await ROUTES.servirFichier(lui)).code, 200);
    assert.strictEqual((await ROUTES.deposer(lui)).code, 201);
    assert.deepStrictEqual(etat.journal, ['piece.depot'], 'son dépôt attend l\'école : aucune validation d\'office');
    reinitialiser({ statut: 'VALIDEE' });
    assert.strictEqual((await ROUTES.supprimerFichier(lui)).code, 409, 'une pièce validée ne se retire que par l\'école');
});

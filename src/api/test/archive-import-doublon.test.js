/**
 * LE COFFRE ACCEPTAIT DEUX FOIS LE MÊME DOCUMENT.
 *
 * LE DÉFAUT, constaté en production : huit documents en double parmi mille cent quarante-sept.
 * Un import se relance facilement — on reprend un dossier « pour être sûr », on redépose un lot
 * déjà traité — et `importArchive` insérait sans jamais regarder ce qui était déjà là.
 *
 * LA RÈGLE : même nom, même place, même contenu ⇒ déjà là. La PLACE compte autant que le nom,
 * parce que le même PDF classé sous deux stagiaires n'est PAS un doublon — c'est le même
 * document rangé à deux endroits, et les deux ont lieu d'être.
 *
 * ELLE DIFFÈRE VOLONTAIREMENT DE CELLE DE L'ÉCRAN DE STOCKAGE, qui regroupe par empreinte SEULE
 * et montre qui détient chaque copie. Cet écran peut se permettre de ne pas trancher : il
 * affiche et laisse décider. Un import, lui, décide seul — il ne peut donc refuser que ce qui
 * n'a jamais lieu d'être. Les harmoniser ferait perdre le cas légitime d'un côté, ou laisserait
 * passer les vrais doublons de l'autre.
 *
 * CE TEST APPELLE LA FONCTION plutôt que de lire son source. Une garde qui « existe » dans le
 * fichier mais qu'une condition contourne ne protège rien, et c'est précisément ce genre de
 * défaut qui part en production : la syntaxe est valide, les tests de source sont verts.
 */
const test = require('node:test');
const assert = require('node:assert');

const cheminDb = require.resolve('../config/database.js');

/* Faux coffre : une ligne déjà archivée, « Contrat PENE signé SEM 40 », 1234 octets. */
const DEJA = { title: 'Contrat PENE signé SEM 40', year: 2025, week: 40, formation: 'NIV1', learner: 'PENE Jean' };
const CONTENU = Buffer.from('%PDF-1.7 contrat de PENE, exactement le même fichier');

let inserts = [];
let sondes = [];   // paramètres envoyés à la requête de détection
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/SELECT 1 AS oui FROM archive_document/i.test(sql)) {
                sondes.push({ sql, params });
                const [, titre, an, sem, form, stag] = params;
                const memeEndroit = titre === DEJA.title && an === DEJA.year && sem === DEJA.week
                    && form === DEJA.formation && stag === DEJA.learner;
                return [memeEndroit ? [{ oui: 1 }] : []];
            }
            if (/INSERT INTO archive_document/i.test(sql)) { inserts.push(params); return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { importArchive } = require('../controllers/suivi.controller.js');

function requete(fichiers, chemins) {
    return {
        files: fichiers,
        body: { paths: JSON.stringify(chemins) },
        user: { organization_id: 'o1', id: 'u1' },
        ip: '127.0.0.1', headers: {},
    };
}
function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}
const pdf = (nom, buf) => ({ originalname: nom, mimetype: 'application/pdf', buffer: buf });
const CHEMIN = `2025/S40/${DEJA.formation}/${DEJA.learner}/${DEJA.title}.pdf`;

test('le même document, à la même place, n\'entre pas deux fois', async () => {
    inserts = []; sondes = [];
    const res = reponse();
    await importArchive(requete([pdf(`${DEJA.title}.pdf`, CONTENU)], [CHEMIN]), res);
    assert.strictEqual(res.code, 201);
    assert.strictEqual(res.corps.data.imported, 0, 'rien ne doit être inséré');
    assert.strictEqual(res.corps.data.doublons, 1, 'il doit être compté comme déjà présent');
    assert.strictEqual(inserts.length, 0);
});

test('le doublon est compté À PART des fichiers non PDF', async () => {
    /* Un fichier écarté parce qu'il est déjà là et un fichier écarté parce que ce n'est pas un
       PDF n'appellent pas le même geste : le premier ne demande rien, le second signale un lot
       mal préparé. Les confondre ferait chercher une erreur là où l'import a bien travaillé. */
    inserts = []; sondes = [];
    const res = reponse();
    await importArchive(requete([
        pdf(`${DEJA.title}.pdf`, CONTENU),
        { originalname: 'notes.txt', mimetype: 'text/plain', buffer: Buffer.from('x') },
    ], [CHEMIN, '2025/S40/NIV1/PENE Jean/notes.txt']), res);
    assert.strictEqual(res.corps.data.doublons, 1);
    assert.strictEqual(res.corps.data.skipped, 1);
    assert.strictEqual(res.corps.data.imported, 0);
});

test('le même contenu rangé AILLEURS reste accepté', async () => {
    /* C'est le cas légitime que l'écran de stockage décrit : une pièce commune présente dans
       plusieurs dossiers. Une garde qui le refuserait empêcherait de classer un document
       partagé sous un second stagiaire. */
    inserts = []; sondes = [];
    const res = reponse();
    await importArchive(
        requete([pdf(`${DEJA.title}.pdf`, CONTENU)], [`2025/S40/NIV1/AUTRE Personne/${DEJA.title}.pdf`]),
        res);
    assert.strictEqual(res.corps.data.imported, 1, 'la même pièce sous un autre stagiaire doit entrer');
    assert.strictEqual(res.corps.data.doublons, 0);
});

test('un ré-export du même document est reconnu, malgré des octets différents', async () => {
    /* C'EST LE CŒUR DE LA RÈGLE, et ce qui la distingue de celle qu'on croit évidente.
    
           Mesuré sur les doublons réellement présents dans le coffre : « Droit image GERVAIS
           Raphaelle » pèse 817 196 octets d'un côté et 731 771 de l'autre ; « Invitation LAMBERT
           Sylvain », 300 290 contre 298 524. Ce sont des RÉ-EXPORTS du même document — le même
           Google Doc réimprimé en PDF donne des octets différents (horodatage interne,
           compression). Trois paires sur quatre avaient des tailles distinctes.
    
           Une règle « nom + poids » en aurait donc laissé passer trois sur quatre, et une empreinte
           de contenu, quatre sur quatre — c'est d'ailleurs pourquoi l'écran de stockage, qui
           regroupe par empreinte, n'en signalait AUCUN alors qu'ils sont là.
    
           CE QUE CETTE RÈGLE REFUSE AUSSI, ET QUI EST ASSUMÉ : une version corrigée déposée sous le
           même nom au même endroit. Dans un coffre, un nom à un endroit désigne un document et un
           seul ; pour remplacer, on supprime puis on réimporte. L'import nomme ce qu'il a écarté,
           précisément pour qu'on s'en aperçoive. */
    inserts = []; sondes = [];
    const res = reponse();
    await importArchive(
        requete([pdf(`${DEJA.title}.pdf`, Buffer.from('%PDF-1.7 ré-export, octets différents, même document'))],
            [CHEMIN]), res);
    assert.strictEqual(res.corps.data.doublons, 1,
        'un ré-export du même document doit être reconnu : c\'est le cas vécu');
    assert.strictEqual(res.corps.data.imported, 0);
    const { sql } = sondes[sondes.length - 1];
    assert.ok(!sql.includes('LENGTH(file)'),
        'comparer le poids laisserait passer trois ré-exports sur quatre');
    assert.ok(!sql.includes('MD5(file)'),
        'comparer le contenu les laisserait TOUS passer');
});

test('l\'import nomme ce qu\'il a écarté', async () => {
    /* Un compte ne dit pas LEQUEL — et c'est lequel qui compte quand on voulait remplacer une
       version par sa correction : il faut alors supprimer l'ancienne avant de réimporter. */
    inserts = []; sondes = [];
    const res = reponse();
    await importArchive(requete([pdf(`${DEJA.title}.pdf`, CONTENU)], [CHEMIN]), res);
    assert.deepStrictEqual(res.corps.data.noms_doublons, [DEJA.title]);
});

test('l\'identité interrogée porte le nom ET la place', () => {
    /* CE QUE LES AUTRES TESTS NE PROUVENT PAS. La fausse base porte la règle : si le contrôleur
       cessait d'envoyer le stagiaire, elle recevrait `undefined`, ne trouverait rien, et
       l'insertion aurait lieu — le test « rangé ailleurs » resterait vert en ayant perdu tout
       son sens. On vérifie donc ce qui est ENVOYÉ, pas seulement ce qui est décidé. */
    assert.ok(sondes.length >= 1, 'la détection doit être interrogée');
    const { sql, params } = sondes[sondes.length - 1];
    for (const colonne of ['title', 'year', 'week', 'formation_label', 'learner_name']) {
        assert.ok(sql.includes(colonne), `la détection doit comparer ${colonne}`);
    }
    assert.strictEqual(params.length, 6, 'organisation, titre, année, semaine, formation, stagiaire');
});

test('un document jamais vu entre normalement', async () => {
    inserts = []; sondes = [];
    const res = reponse();
    await importArchive(
        requete([pdf('Attestation MARTIN.pdf', Buffer.from('%PDF-1.7 autre'))],
            ['2025/S41/NIV2/MARTIN Paul/Attestation MARTIN.pdf']), res);
    assert.strictEqual(res.corps.data.imported, 1);
    assert.strictEqual(inserts.length, 1);
});

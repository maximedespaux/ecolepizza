/**
 * « SESSION EXPIRÉE » SUR UN JETON FRAIS — un défaut causé par la correction des fuseaux.
 *
 * CE QUI S'EST PASSÉ. Pour remettre les horodatages à l'heure de Lannemezan, la session MariaDB
 * a été réglée sur `Europe/Paris`. Elle rend donc ses dates en heure de Paris — mais le pilote
 * construit l'objet `Date` dans le fuseau du PROCESSUS, et le VPS tourne en UTC. Toute date
 * relue et comparée à l'heure courante atterrissait DEUX HEURES DANS L'AVENIR.
 *
 * SUR `sessions_valid_after`, l'effet était brutal : la borne étant dans l'avenir, TOUT jeton
 * fraîchement émis était refusé « Session expirée » pendant deux heures après une coupure de
 * session. Or créer un compte stagiaire COUPE ses sessions (le compte peut être compromis) —
 * la personne recevait donc ses accès et ne pouvait pas s'en servir de la journée… enfin, de
 * l'après-midi.
 *
 * LA PARADE : ne plus reconstruire de date. Un entier d'époque n'a pas de fuseau, et le
 * changement d'heure ne peut pas le décaler.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const cheminDb = require.resolve('../config/database.js');

/* CE QUE RENDAIT RÉELLEMENT LE PILOTE : la ligne porte les deux formes, pour que le test
   distingue le code qui lit la colonne (et se trompe) de celui qui lit l'époque. */
const MAINTENANT = Math.floor(Date.now() / 1000);
const COUPE_IL_Y_A_UNE_MINUTE = MAINTENANT - 60;
let ligne = {
    active: 1, role: 'STAGIAIRE', organization_id: 'o1',
    /* La Date telle que la construisait le pilote : décalée de deux heures vers l'avenir. */
    sessions_valid_after: new Date((COUPE_IL_Y_A_UNE_MINUTE + 7200) * 1000),
    sva_epoch: COUPE_IL_Y_A_UNE_MINUTE,
};

const faux = {
    promise: () => ({ query: async () => [[ligne]] }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-pour-le-fuseau';
const { authenticateToken } = require('../middlewares/auth.middleware.js');

function appel(iat) {
    const token = jwt.sign({ id: 'u1', role: 'STAGIAIRE', organization_id: 'o1', iat },
        /* PAS de `noTimestamp` : il EFFACE l'`iat` fourni, et le contrôle de session porte
           précisément sur lui — le test passerait alors au vert sans rien éprouver. */
        process.env.JWT_SECRET, { algorithm: 'HS256' });
    return new Promise((resolve) => {
        const res = { code: 200, corps: null };
        res.status = (c) => { res.code = c; return res; };
        res.json = (b) => { res.corps = b; resolve(res); return res; };
        authenticateToken({ cookies: { auth_token: token }, headers: {} }, res, () => resolve(res));
    });
}

test('UN JETON FRAÎCHEMENT ÉMIS PASSE, même juste après une coupure de session', async () => {
    /* LE TEST QUI COMPTE. La coupure date d'une minute, le jeton de maintenant : la connexion
       doit passer. Avec l'ancienne lecture — la colonne reconstruite en Date — la borne tombait
       deux heures plus tard et ce jeton était refusé. */
    const res = await appel(MAINTENANT);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps, null, 'aucune erreur ne doit être rendue');
});

test('un jeton ANTÉRIEUR à la coupure reste refusé', async () => {
    /* La protection ne doit pas disparaître avec le défaut : c'est elle qui déconnecte
       réellement un pirate dont on annule le méfait, là où un JWT sans état survivrait des
       jours. */
    const res = await appel(COUPE_IL_Y_A_UNE_MINUTE - 10);
    assert.strictEqual(res.code, 401);
    assert.strictEqual(res.corps.message, 'Session expirée');
});

test('un compte sans coupure n\'est jamais gêné', async () => {
    const avant = ligne;
    ligne = { active: 1, role: 'STAGIAIRE', organization_id: 'o1', sessions_valid_after: null, sva_epoch: null };
    const res = await appel(MAINTENANT - 86400);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    ligne = avant;
});

test('un compte désactivé reste refusé', async () => {
    const avant = ligne;
    ligne = { ...ligne, active: 0 };
    const res = await appel(MAINTENANT);
    assert.strictEqual(res.code, 401);
    assert.strictEqual(res.corps.message, 'Compte inactif');
    ligne = avant;
});

/* ---------------------------------------------------------------------------------------- */

const AUTH = fs.readFileSync(path.join(__dirname, '..', 'middlewares/auth.middleware.js'), 'utf8');
const PUBLIC = fs.readFileSync(path.join(__dirname, '..', 'controllers/public.controller.js'), 'utf8');

test('AUCUNE DATE N\'EST RECONSTRUITE à partir de la colonne', () => {
    /* La forme du défaut, gelée : `new Date(colonne)` interprète dans le fuseau du processus une
       valeur rendue dans celui de la session. Tant que la comparaison porte sur des entiers
       d'époque, il n'y a plus rien à interpréter. */
    assert.match(AUTH, /UNIX_TIMESTAMP\(sessions_valid_after\) AS sva_epoch/);
    assert.ok(!/new Date\(rows\[0\]\.sessions_valid_after\)/.test(AUTH),
        'la borne ne doit pas repasser par un objet Date');
});

test('L\'EXPIRATION D\'UN LIEN DE SIGNATURE EST TRANCHÉE PAR LA BASE', () => {
    /* Même cause, effet plus discret : un lien survivait DEUX HEURES à son échéance. Comparer
       deux instants dans la base supprime l'interprétation — et le changement d'heure avec. */
    assert.match(PUBLIC, /expires_at IS NOT NULL AND expires_at < NOW\(\)/);
    assert.ok(!/new Date\(link\.expires_at\)/.test(PUBLIC),
        'l\'échéance ne doit pas être reconstruite côté application');
});

test('la correction survit au changement d\'heure', () => {
    /* Un décalage FIGÉ (« +02:00 » écrit quelque part) serait juste six mois par an. L'époque,
       elle, n'a pas de saison. */
    assert.ok(!/\+0[12]:00/.test(AUTH), 'aucun décalage codé en dur dans le contrôle de session');
});

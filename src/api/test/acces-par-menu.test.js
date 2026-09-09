/**
 * L'ACCÈS AU MENU ACCORDE VRAIMENT — et ne peut pas servir d'escalade.
 *
 * LE DÉFAUT GELÉ ICI. `nav_access` ne savait que RESTREINDRE. On pouvait accorder à un formateur
 * la rubrique « Sessions » en écriture — menu visible, case « modification » cochée, et le Guard
 * du front laissait passer, lui qui se règle DÉJÀ sur le menu et non sur le rôle — puis l'API
 * répondait « Accès refusé » : soixante-sept routes mutantes sont gardées par
 * `authorizeRoles(...ADMIN_ROLES)`, une liste où FORMATEUR ne figure pas. L'écran promettait un
 * droit que le serveur ne donnait jamais.
 *
 * La contrepartie d'une délégation, c'est qu'elle doit être BORNÉE. Les quatre bornes sont
 * testées ici, parce que les desserrer se fait en une ligne et ne se voit pas :
 *   1. seuls les rôles configurables se délèguent (jamais un stagiaire) ;
 *   2. « read » ouvre la lecture, jamais l'écriture ;
 *   3. les rubriques qui DISTRIBUENT les accès ne se délèguent jamais ;
 *   4. une rubrique inconnue refuse — l'absence de correspondance ne doit pas ouvrir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
    accesParMenuAutorise, sectionDeLaRequete, SECTIONS_NON_DELEGUEES,
} = require('../middlewares/sectionAccess.middleware.js');

const sect = (p) => sectionDeLaRequete({ path: p });

test('LE DÉFAUT CORRIGÉ : « modification » accordée sur la rubrique autorise enfin l\'écriture', () => {
    assert.strictEqual(accesParMenuAutorise({ role: 'FORMATEUR', method: 'POST', section: '/sessions', mode: 'write' }), true);
    assert.strictEqual(accesParMenuAutorise({ role: 'SECRETARIAT', method: 'DELETE', section: '/formations', mode: 'write' }), true);
    assert.strictEqual(accesParMenuAutorise({ role: 'AUDITEUR', method: 'PATCH', section: '/suivi', mode: 'write' }), true);
});

test('« lecture » ouvre la consultation, JAMAIS l\'écriture', () => {
    assert.strictEqual(accesParMenuAutorise({ role: 'FORMATEUR', method: 'GET', section: '/factures', mode: 'read' }), true);
    assert.strictEqual(accesParMenuAutorise({ role: 'FORMATEUR', method: 'POST', section: '/factures', mode: 'read' }), false);
    // Rubrique non accordée : rien, pas même la lecture.
    assert.strictEqual(accesParMenuAutorise({ role: 'FORMATEUR', method: 'GET', section: '/factures', mode: null }), false);
});

test('AUCUNE ESCALADE : hors rôles configurables, le nav_access n\'accorde rien', () => {
    for (const role of ['STAGIAIRE', 'ENTREPRISE', 'INTERVENANT']) {
        assert.strictEqual(accesParMenuAutorise({ role, method: 'POST', section: '/stagiaires', mode: 'write' }), false,
            `${role} ne doit JAMAIS obtenir une écriture bureau par son nav_access`);
    }
});

test('les rubriques qui distribuent les accès ne se délèguent jamais', () => {
    for (const section of SECTIONS_NON_DELEGUEES) {
        assert.strictEqual(accesParMenuAutorise({ role: 'SECRETARIAT', method: 'POST', section, mode: 'write' }), false,
            `${section} déléguée = un membre peut se promouvoir lui-même`);
    }
    // Et structurellement : leurs bases API ne se rattachent à AUCUNE rubrique.
    assert.strictEqual(sect('/api/equipe/abc'), null);
    assert.strictEqual(sect('/api/user/abc'), null);
    assert.strictEqual(sect('/api/access-profiles/abc'), null);
});

test('une rubrique inconnue REFUSE (l\'absence de correspondance n\'ouvre pas)', () => {
    assert.strictEqual(accesParMenuAutorise({ role: 'FORMATEUR', method: 'POST', section: null, mode: 'write' }), false);
    assert.strictEqual(sect('/api/mercuriale'), null, 'liste de prix personnelle : hors rubriques');
});

test('les bases nouvellement cartographiées mènent à leur rubrique de menu', () => {
    assert.strictEqual(sect('/api/attendance/123/sign'), '/sessions');
    assert.strictEqual(sect('/api/enrollments/123'), '/stagiaires');
    assert.strictEqual(sect('/api/conditions'), '/modeles');
    assert.strictEqual(sect('/api/emargement-templates/1'), '/modeles');
    assert.strictEqual(sect('/api/equivalences/1'), '/modeles');
    assert.strictEqual(sect('/api/emetteurs/1'), '/reglages-facturation');
});

test('pièces : déposer reste un acte de participant, vérifier un acte de dossier', () => {
    assert.strictEqual(sect('/api/pieces/dossier/e1/p1'), null, 'déposer sa pièce n\'est pas une écriture de rubrique');
    assert.strictEqual(sect('/api/pieces/fichier/f1'), null, 'retirer son fichier non plus');
    assert.strictEqual(sect('/api/pieces/depot/d1'), '/stagiaires', 'valider / refuser = acte de dossier');
    assert.strictEqual(sect('/api/pieces'), '/modeles', 'gérer le référentiel des types = Modèles');
});

test('RÉGRESSION : la rubrique se lit sur le chemin COMPLET, pas sur le req.path du routeur', () => {
    /* Sous app.use('/api/carte', …), Express donne req.path === '/'. S'y fier faisait perdre la
       rubrique, donc refuser TOUTES les délégations — et ça ne se voyait pas : le premier jeu de
       tests fabriquait un faux `req` portant le chemin complet, c'est-à-dire la forme du niveau
       app, jamais celle que voit authorizeRoles. Le vert était trompeur. */
    assert.strictEqual(sectionDeLaRequete({ originalUrl: '/api/carte', baseUrl: '/api/carte', path: '/' }), '/carte');
    assert.strictEqual(sectionDeLaRequete({ baseUrl: '/api/carte', path: '/' }), '/carte', 'sans originalUrl : baseUrl + path');
    assert.strictEqual(sectionDeLaRequete({ originalUrl: '/api/stagiaires?actifs=1', baseUrl: '/api/stagiaires', path: '/' }),
        '/stagiaires', 'la chaîne de requête ne fausse pas la rubrique');
    assert.strictEqual(sectionDeLaRequete({ originalUrl: '/api/pieces/dossier/e1/p1', baseUrl: '/api/pieces', path: '/dossier/e1/p1' }),
        null, 'les exceptions de sous-chemin restent respectées');
});

test('BOUT EN BOUT (Express) : la délégation traverse un routeur monté', async () => {
    /* Le seul test qui aurait attrapé le défaut ci-dessus : il passe par un VRAI routeur monté,
       là où req.path se réduit à « / ». `req._navAccess` est pré-rempli pour ne pas toucher la
       base (cache de navAccessDe) — le pool reste donc fermé et npm test rend la main. */
    const express = require('express');
    const { authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

    const appliPour = (role, nav) => {
        const app = express();
        app.use((req, _res, next) => { req.user = { id: 'u1', role }; req._navAccess = JSON.stringify(nav); next(); });
        const r = express.Router();
        r.get('/', authorizeRoles(...ADMIN_ROLES), (_req, res) => res.status(200).end());
        app.use('/api/carte', r);
        return app;
    };
    const appel = (app) => new Promise((ok) => {
        const srv = app.listen(0, () => {
            require('http').get({ host: '127.0.0.1', port: srv.address().port, path: '/api/carte' },
                (res) => { srv.close(); ok(res.statusCode); });
        });
    });

    assert.strictEqual(await appel(appliPour('FORMATEUR', { '/carte': 'write' })), 200,
        'formateur avec « Modifier » sur Carte : doit passer malgré ADMIN_ROLES');
    assert.strictEqual(await appel(appliPour('FORMATEUR', { '/stagiaires': 'write' })), 403,
        'accordé ailleurs ≠ accordé ici');
    assert.strictEqual(await appel(appliPour('STAGIAIRE', { '/carte': 'write' })), 403,
        'un stagiaire ne s\'élève jamais, même avec la rubrique en écriture');
});

test('authorizeRoles : le rôle d\'abord, l\'accès menu ensuite, et jamais d\'octroi sur erreur', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'middlewares', 'auth.middleware.js'), 'utf8');
    const fn = /function authorizeRoles[\s\S]*?\n\}/.exec(src);
    assert.ok(fn, 'authorizeRoles introuvable');
    assert.match(fn[0], /if \(req\.user && roles\.includes\(req\.user\.role\)\) return next\(\);/,
        'le rôle reste le chemin rapide (aucune lecture en base pour un admin)');
    assert.match(fn[0], /await accesAccordeParMenu\(req\)/, 'sinon, l\'accès menu décide');
    const bloc = /catch \(e\) \{([\s\S]*?)\n {8}\}/.exec(fn[0]);
    assert.ok(bloc && !/next\(/.test(bloc[1]),
        'base injoignable : on REFUSE — accorder un droit qu\'on n\'a pas pu vérifier serait pire');
});

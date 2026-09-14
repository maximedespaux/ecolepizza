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
 *   3. les rubriques qui DISTRIBUENT les accès ne se délèguent qu'en LECTURE ;
 *   4. une rubrique inconnue refuse — l'absence de correspondance ne doit pas ouvrir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
    accesParMenuAutorise, sectionDeLaRequete, SECTIONS_LECTURE_SEULE,
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

test('les rubriques qui distribuent les accès ne s\'écrivent JAMAIS par délégation', () => {
    /* LA BORNE QUI NE BOUGE PAS. Écrire sur « Équipe » ou « Rôles d\'accès », c\'est distribuer
       les accès : un membre pourrait se promouvoir, ou s\'ouvrir toutes les autres rubriques.
       L\'escalade de privilèges par la porte de service.

       LE MODE STOCKÉ N\'Y CHANGE RIEN, et c\'est le cœur du test : on passe `write` exprès. Si la
       garantie dépendait de ce que l\'écran propose, une base modifiée à la main la
       contournerait. Elle tient dans la décision, pas dans les cases. */
    for (const section of SECTIONS_LECTURE_SEULE) {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
            assert.strictEqual(
                accesParMenuAutorise({ role: 'SECRETARIAT', method, section, mode: 'write' }), false,
                `${method} ${section} délégué = un membre peut se promouvoir lui-même`);
        }
    }
});

test('… mais elles se CONSULTENT quand elles sont accordées', () => {
    /* CE QUI A CHANGÉ, ET POURQUOI. Elles étaient totalement fermées à la délégation : un
       secrétariat à qui l\'on accordait « Rôles d\'accès » voyait la page s\'ouvrir et l\'API
       répondre « Accès refusé » — le menu promettait, le serveur refusait, et l\'organisme devait
       déranger un propriétaire pour une simple lecture.
       Consulter ne donne aucun pouvoir : c\'est écrire qui en donne, et cela reste fermé. */
    for (const section of SECTIONS_LECTURE_SEULE) {
        for (const mode of ['read', 'write']) {
            assert.strictEqual(
                accesParMenuAutorise({ role: 'SECRETARIAT', method: 'GET', section, mode }), true,
                `GET ${section} accordé doit être lisible (mode ${mode})`);
        }
        assert.strictEqual(
            accesParMenuAutorise({ role: 'SECRETARIAT', method: 'GET', section, mode: null }), false,
            `${section} NON accordée reste fermée`);
    }
});

test('les bases API de ces rubriques sont enfin rattachées', () => {
    /* Elles ne l\'étaient pas, et c\'est ce qui rendait la délégation inopérante : sans rubrique
       pour le chemin demandé, il n\'y a rien à comparer au menu et la garde de rôle refuse
       seule. Une base absente n\'est jamais un trou de sécurité — c\'est un écran qui ne marche
       pas, en silence. */
    assert.strictEqual(sect('/api/equipe/abc'), '/equipe');
    assert.strictEqual(sect('/api/access-profiles/abc'), '/roles');
    /* `/api/user` reste hors rubriques : aucune route d\'organisme n\'y est montée, et lui
       ouvrir une rubrique par anticipation serait accorder sans savoir quoi. */
    assert.strictEqual(sect('/api/user/abc'), null);
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

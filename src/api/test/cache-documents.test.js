/**
 * AUCUN DOCUMENT NE RESTE SUR LE DISQUE DU POSTE — le pendant, côté navigateur, du
 * chiffrement au repos.
 *
 * LE DÉFAUT. Une réponse 200 sans `Cache-Control` ni validateur n'est pas « non mise en
 * cache » : le navigateur applique alors une HEURISTIQUE et la garde volontiers sur son
 * disque. Sur les quinze routes qui servent un document — contrat signé, facture, feuille
 * d'émargement, PDF importé — DEUX posaient l'en-tête. Les treize autres laissaient une copie
 * en clair dans le profil du navigateur, lisible après la déconnexion. Chiffrer 681 Mo en base
 * et laisser ces copies-là, c'est fermer une porte et en ouvrir une autre.
 *
 * POURQUOI LE DÉFAUT EST DÉSORMAIS « FERMÉ » ET POSÉ UNE SEULE FOIS. Ajouter la ligne dans
 * chaque contrôleur, c'était accepter que la seizième route l'oublie — et un oubli ne se voit
 * pas : la page s'affiche, tout marche. L'en-tête est donc posé avec les autres en-têtes de
 * sécurité, pour toute l'API ; ce qui veut être gardé le DIT explicitement. L'API ne sert
 * aucune ressource statique, la position fermée ne coûte donc rien.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

const API = path.join(__dirname, '..');
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const SERVEUR = sansCommentaires(fs.readFileSync(path.join(API, 'server.js'), 'utf8'));

test('L\'API NE MET RIEN EN CACHE PAR DÉFAUT', () => {
    assert.match(SERVEUR, /res\.set\('Cache-Control', 'no-store'\)/,
        'l\'en-tête doit être posé pour toute l\'API, pas route par route');
    /* AVANT LES ROUTES, sinon il ne s'applique à rien : un middleware posé après ne voit que
       ce qu'aucune route n'a traité. Même piège que le gestionnaire d'erreurs, déjà gelé
       ailleurs — d'où la vérification sur l'ORDRE et pas seulement sur la présence. */
    const posé = SERVEUR.indexOf("res.set('Cache-Control', 'no-store')");
    const premiereRoute = SERVEUR.search(/app\.use\('\/api\//);
    assert.ok(premiereRoute > 0, 'les routes doivent être montées sous /api');
    assert.ok(posé < premiereRoute, 'l\'en-tête est posé APRÈS les routes : il ne protège rien.');
});

test('LES DEUX SEULES EXCEPTIONS LE DISENT, ET ELLES GAGNENT', async () => {
    /* CE SUR QUOI REPOSE TOUT LE MONTAGE : `res.set` REMPLACE une valeur déjà posée. Si elle
       s'ajoutait, la photo de profil et l'image de publication hériteraient de `no-store` et
       seraient retéléchargées à chaque écran du fil. Vérifié pour de vrai, sur un serveur
       Express réel, plutôt que supposé. */
    const app = express();
    app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    app.get('/document', (req, res) => res.send('pdf'));
    app.get('/avatar', (req, res) => { res.set('Cache-Control', 'private, max-age=86400'); res.send('img'); });

    const serveur = http.createServer(app);
    await new Promise((r) => serveur.listen(0, r));
    const port = serveur.address().port;
    const entete = (chemin) => new Promise((resolve) => {
        http.get({ port, path: chemin }, (res) => { res.resume(); resolve(res.headers['cache-control']); });
    });
    try {
        assert.strictEqual(await entete('/document'), 'no-store', 'un document ne se garde pas');
        assert.strictEqual(await entete('/avatar'), 'private, max-age=86400',
            'une exception explicite remplace le défaut — elle ne s\'y ajoute pas');
    } finally {
        await new Promise((r) => serveur.close(r));
    }
});

test('LES ROUTES QUI SERVENT UN DOCUMENT NOMINATIF NE RÉOUVRENT PAS LE CACHE', () => {
    /* Le défaut est fermé en un point ; ce test garde la liste de ceux qui pourraient le
       rouvrir. Seules les images d'écran ont une raison d'être gardées : elles reviennent
       plusieurs fois par page et ne portent aucune pièce de dossier. */
    const permis = new Set(['espace.controller.js', 'community.controller.js', 'events.controller.js']);
    const dossier = path.join(API, 'controllers');
    const fautifs = [];
    for (const f of fs.readdirSync(dossier)) {
        if (permis.has(f) || !f.endsWith('.js')) continue;
        const src = sansCommentaires(fs.readFileSync(path.join(dossier, f), 'utf8'));
        for (const m of src.match(/Cache-Control['"],\s*['"][^'"]*/g) || []) {
            if (!/no-store|no-cache/.test(m)) fautifs.push(`${f} : ${m}`);
        }
    }
    assert.deepStrictEqual(fautifs, [], 'un document nominatif ne se met pas en cache disque.');
});

/**
 * LE CADRE ÉTAIT ÉCRIT EN BASE, ET JAMAIS RELU PAR SON PROPRIÉTAIRE.
 *
 * Le défaut, tel qu'il a été rapporté : « j'ai changé mon cadre sur deux navigateurs différents,
 * aucun des deux ne change ». Il ne s'agissait pas d'une écriture perdue — la route acceptait
 * bien la valeur, et la Communauté montrait aux AUTRES le bon cadre. Relevé sur l'instant, les
 * trois couches disaient trois choses :
 *
 *     base « or »   ·   localStorage « champion »   ·   écran « champion »
 *
 * `cadrePorte`, `useCadreChoisi` et la modale de profil lisent tous `getCadreChoisi(uid)`,
 * c'est-à-dire le `localStorage` et rien d'autre. La base était donc en écriture seule pour
 * celui qu'elle concerne : chaque poste gardait son propre choix et ignorait la valeur partagée.
 * Deux navigateurs, deux vérités, et une troisième en base — celle que tout le monde voit.
 *
 * CE QUI LE RENDAIT INVISIBLE À LA RELECTURE : `hydrateProfile` réconcilie déjà le serveur vers
 * le local, pour l'avatar ET pour la progression de quête. Le cadre manquait dans la même
 * fonction, à deux lignes de l'avatar. Rien n'avait l'air absent.
 *
 * L'ARBITRAGE GELÉ ICI : le serveur gagne au CHARGEMENT, le local gagne au CLIC. La base est ce
 * que les autres voient ; un écran qui la contredit a tort. Mais au clic, l'affichage doit
 * répondre tout de suite — d'où l'écriture locale immédiate, puis l'envoi.
 *
 * ET LA COURSE, qui est un vrai défaut et pas une précaution théorique : la modale est cliquable
 * AVANT que sa requête de profil ne revienne. Sans témoin de montage, une réponse en retard
 * réappliquerait l'ancienne valeur par-dessus le choix qu'on vient de faire, et l'utilisateur
 * verrait son cadre revenir tout seul au précédent.
 *
 * Ces tests lisent le SOURCE : `lib/cadres.js` et `lib/gamification.js` importent React et le
 * client HTTP, qu'on ne peut pas charger depuis les tests d'API. Ils prouvent que le câblage est
 * écrit, pas qu'il s'exécute — la vérification à l'écran a été faite en plus, base « or » →
 * local « or » → écran `cadre-or` après rechargement.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');

test('le profil renvoyé par le serveur porte le cadre', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'espace.controller.js'), 'utf8');
    // Découpe sur la FIN de la fonction, pas sur une longueur devinée : une fenêtre fixe
    // coupait juste avant le `res.json` et faisait échouer un contrat pourtant respecté.
    const debut = src.indexOf('const getMyProfile');
    const corps = src.slice(debut, src.indexOf('\n};', debut));
    assert.match(corps, /SELECT cadre, cadres_exclusifs FROM learner/,
        "getMyProfile doit lire la colonne `cadre` — sans elle le client n'a rien à adopter.");
    assert.match(corps, /res\.json\(\{ data: \{[^}]*\bcadre\b/,
        'et la renvoyer dans `data.cadre`.');
});

test("hydrateProfile adopte le cadre du serveur, comme il le fait déjà pour l'avatar", () => {
    const src = lire('lib/gamification.js');
    const corps = src.slice(src.indexOf('export async function hydrateProfile'));
    assert.match(corps, /adopterCadreServeur\(uid, data\.cadre\)/,
        "C'EST LA LIGNE QUI MANQUAIT. L'avatar et la progression étaient réconciliés serveur → "
        + 'local ; le cadre non, si bien que chaque navigateur gardait le sien.');
    // L'ordre importe peu, la présence dans la MÊME fonction beaucoup : c'est le seul endroit
    // appelé au montage des deux layouts (stagiaire et intervenant).
    assert.ok(corps.indexOf('data.avatar') < corps.indexOf('data.cadre'),
        'Les deux réglages se suivent : les séparer, c\'est reperdre le second.');
});

test('les deux layouts appellent hydrateProfile — sinon la réconciliation ne tourne jamais', () => {
    for (const f of ['layouts/StudentLayout.jsx', 'layouts/IntervenantLayout.jsx']) {
        assert.match(lire(f), /hydrateProfile\(user\.id\)/,
            `${f} doit hydrater le profil : c'est de là que part la relecture du cadre.`);
    }
});

test("adopterCadreServeur n'appelle pas l'API — elle vient d'en recevoir la valeur", () => {
    const src = lire('lib/cadres.js');
    const corps = src.slice(src.indexOf('export function adopterCadreServeur'),
        src.indexOf('export function setCadreChoisi'));
    assert.ok(corps.length > 0, 'adopterCadreServeur doit exister et précéder setCadreChoisi.');
    assert.doesNotMatch(corps, /saveMyCadre/,
        "Réexpédier au serveur ce qu'il vient d'envoyer est au mieux inutile, au pire un "
        + "aller-retour qui écrase un choix fait entre-temps sur un autre appareil.");
    assert.match(corps, /if \(!cadre\) return/,
        "Aucun choix en base (colonne nulle) : on garde ce que le navigateur connaît, on n'efface pas.");
    assert.match(corps, /CADRE_EVENT/,
        "Sans l'événement, les composants montés (useCadreChoisi) gardent l'ancien cadre à l'écran "
        + 'jusqu\'au prochain rendu.');
    assert.match(corps, /localStorage\.getItem\(CLE\(uid\)\) === cadre/,
        "Valeur identique : pas d'événement, donc pas de rendu inutile à chaque chargement.");
});

test('la modale ne réapplique pas une réponse en retard par-dessus un clic', () => {
    const src = lire('components/ProfileModal.jsx');
    assert.match(src, /const auMontage = useRef\(getCadreChoisi\(uid\)\)/,
        'Témoin de montage : sans lui, impossible de savoir si on a cliqué pendant le chargement.');
    assert.match(src, /r\?\.data\?\.cadre && getCadreChoisi\(uid\) === auMontage\.current/,
        "LE SERVEUR NE GAGNE QU'AU REPOS. La modale est cliquable avant que sa requête ne revienne ; "
        + 'sans cette garde, le cadre choisi revenait tout seul au précédent.');
});

/**
 * Audit « capacité sans porte », et la trace de la modération.
 *
 * LE DÉFAUT RÉCURRENT DE CE PROJET. Six fois dans une seule session, une capacité existait côté
 * serveur sans qu'aucun écran ne l'atteigne : la pastille de stock calculée puis jetée, le
 * contrôle des infos manquantes, les produits partenaires, le son de notification, la modération
 * de la communauté, l'épingle des annonces, le PATCH sur les revenus. À chaque fois du code
 * complet, testé, jamais exécuté.
 *
 * Le balayage des fonctions du client API sans appelant en a sorti cinq de plus. Elles ne sont
 * PAS toutes du même genre, et c'est tout l'intérêt de regarder avant de couper :
 *
 *   · `getQuestLives` / `loseQuestLife` — pointaient vers `/mon-espace/quest/vies`, une route qui
 *     n'existe dans AUCUN fichier de routes. Du code mort désignant du vide (les vies ont disparu
 *     avec l'XP, remplacées par les cadres). RETIRÉES.
 *   · `saveShopSettings` — supplantée par les ENTITÉS ÉMETTRICES, qui éditent déjà préfixe,
 *     numéro, moyens de paiement et TVA. `shop_settings` n'est plus qu'un repli jamais atteint.
 *     RETIRÉE côté client.
 *   · `setDefaultEmitter` — le bouton « Par défaut » a été ôté volontairement (CLAUDE.md §5) ;
 *     la fonction a survécu à son bouton. RETIRÉE. La route reste : `is_default` pilote toujours
 *     le choix de l'entité, c'est l'écran qui ne le change plus.
 *   · `resetTemplate` — LA SEULE vraie capacité sans porte. Elle ramène un document du socle à sa
 *     version livrée. Aucun écran ne l'offrait : on pouvait personnaliser, jamais défaire. La
 *     seule issue était « Supprimer définitivement », qui pose un tombstone et fait DISPARAÎTRE
 *     le document — deux gestes très différents derrière un seul bouton. PORTE OUVERTE.
 *
 * ET LA MODÉRATION NE LAISSAIT AUCUNE TRACE. `community.controller` n'avait pas un seul
 * `logAudit` : supprimer la publication de quelqu'un — l'acte le plus lourd, et le seul
 * irréversible — passait inaperçu, alors que retirer une fiche du fil, qui se défait, était
 * journalisé. La trace manquait exactement là où elle compte.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcClient = fs.readFileSync(path.join(APP, 'ui/api/apiClient.js'), 'utf8');
const srcModeles = fs.readFileSync(path.join(APP, 'ui/pages/Modeles.jsx'), 'utf8');
const srcComm = fs.readFileSync(path.join(API, 'controllers/community.controller.js'), 'utf8');

test('aucune fonction du client API ne reste sans appelant', () => {
    /* Le balayage qui a servi à l'audit, gelé : il rattrapera la prochaine. Une fonction sans
       appelant est soit du code mort, soit — bien pire — une capacité que personne ne peut
       atteindre. Les deux méritent d'être vues. */
    const exportees = [...srcClient.matchAll(/^export function ([a-zA-Z0-9_]+)/gm)].map((m) => m[1]);
    assert.ok(exportees.length > 50, 'le balayage doit trouver les exports');
    const ecrans = [];
    const parcourir = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) parcourir(p);
            else if (/\.jsx?$/.test(e.name) && !p.endsWith('apiClient.js')) ecrans.push(fs.readFileSync(p, 'utf8'));
        }
    };
    parcourir(path.join(APP, 'ui'));
    const orphelines = exportees.filter((f) => !ecrans.some((src) => new RegExp(`\\b${f}\\b`).test(src)));
    assert.deepStrictEqual(orphelines, [],
        `fonction(s) du client API sans appelant :\n  ${orphelines.join('\n  ')}`);
});

test('les quatre fonctions mortes ont bien disparu', () => {
    for (const f of ['saveShopSettings', 'setDefaultEmitter', 'getQuestLives', 'loseQuestLife']) {
        assert.doesNotMatch(srcClient, new RegExp(`^export function ${f}\\b`, 'm'), `${f} doit etre retiree`);
    }
    // Retirées MAIS expliquées : un lecteur qui cherche « pourquoi n'y a-t-il pas de bouton
    // Par défaut » doit trouver la réponse là où il cherche.
    assert.match(srcClient, /`setDefaultEmitter` a été retiré/, 'la raison doit rester ecrite');
    assert.match(srcClient, /Les VIES de Pizza Quest n'existent plus/, 'idem');
});

test('« Revenir à l\'origine » ouvre enfin la porte de resetTemplate', () => {
    assert.match(srcModeles, /await resetTemplate\(t\.slug\)/, 'la route doit etre appelee');
    /* Réservé au SOCLE : un modèle créé de toutes pièces n'a pas de version d'origine où revenir,
       et « réinitialiser » y voudrait dire « supprimer ». */
    assert.match(srcModeles, /\{!estEmarg\(t\) && t\.is_default && \(/, 'reserve aux documents du socle');
    // La confirmation distingue les deux gestes que le seul bouton « Supprimer » confondait.
    assert.match(srcModeles, /Le document reste dans la /, 'dire ce qui NE se passe pas');
});

test('la modération de la communauté laisse une trace', () => {
    for (const code of ['community.post_supprime', 'community.reponse_supprimee', 'community.post_modifie']) {
        assert.ok(srcComm.includes(code), `${code} doit etre journalise`);
    }
    /* SEULEMENT quand on agit sur le message d'un AUTRE : supprimer sa propre publication ne
       regarde personne, et journaliser tout noierait les actes de modération dans le bruit. */
    assert.match(srcComm, /if \(p\.author_user_id !== req\.user\.id\) logAudit/, 'publication d\'un autre');
    assert.match(srcComm, /if \(a\.user_id !== req\.user\.id\) logAudit/, 'reponse d\'un autre');
    assert.match(srcComm, /if \(!auteur && champs\.length\) logAudit/, 'correction du texte d\'un autre');
});

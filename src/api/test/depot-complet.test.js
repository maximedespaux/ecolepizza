/**
 * CE QUI EST SUR LE DISQUE N'EST PAS CE QUI EST DÉPLOYÉ.
 *
 * LE DÉFAUT, vécu deux fois. `.gitignore` porte `database/*` — un répertoire exclu ne se
 * rouvre pas, et git cesse d'y descendre. La première fois, c'étaient les MIGRATIONS : chaque
 * nouvelle migration était écartée sans un mot, `git status` ne la montrait pas, `git add -A`
 * passait dessus. Corrigé par `!database/migrations/`. La seconde fois, c'était
 * `database/tools/` : trois `.mjs` y étaient déjà SUIVIS — et un fichier suivi ignore le
 * `.gitignore` —, si bien que le répertoire avait l'air versionné. Un outil neuf y a été
 * avalé, le commit est parti complet en apparence, les tests sont passés au vert en lisant le
 * fichier SUR LE DISQUE, et le VPS a déployé tout sauf lui. L'erreur ne s'est vue qu'au
 * moment de lancer l'outil en production.
 *
 * CE QUE CE TEST GÈLE : tout fichier présent dans ces deux répertoires est SUIVI par git.
 * C'est la seule vérification qui distingue « ça marche chez moi » de « c'est déployé ». Elle
 * attrapera la troisième occurrence, sur un répertoire auquel personne n'a encore pensé.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RACINE = path.join(__dirname, '..', '..', '..');
const git = (...args) => spawnSync('git', args, { cwd: RACINE, encoding: 'utf8' });

/* Hors dépôt git (archive, tarball) le contrôle n'a pas de sens : on l'ignore plutôt que de
   faire échouer une suite pour une raison qui ne regarde pas le code. */
const dansUnDepot = git('rev-parse', '--is-inside-work-tree').status === 0;

test('TOUT CE QUI EST DANS database/ EST VERSIONNÉ', { skip: dansUnDepot ? false : 'hors dépôt git' }, () => {
    const suivis = new Set(git('ls-files', 'database').stdout.split('\n').filter(Boolean));
    const oublies = [];
    for (const dossier of ['database/migrations', 'database/tools']) {
        for (const f of fs.readdirSync(path.join(RACINE, dossier))) {
            const rel = `${dossier}/${f}`;
            if (fs.statSync(path.join(RACINE, rel)).isDirectory()) continue;
            if (!suivis.has(rel)) oublies.push(rel);
        }
    }
    /* LE MESSAGE DIT LE GESTE. Ce test vire au rouge pendant qu'on écrit une migration, tant
       qu'on ne l'a pas ajoutée — c'est voulu, et c'est même le moment le plus utile pour le
       dire. Encore faut-il qu'il dise QUOI FAIRE : `git add` suffit (un fichier indexé est
       suivi, le commit peut attendre). Sans cette phrase, on cherche une erreur dans le code. */
    assert.deepStrictEqual(oublies, [],
        `Ces fichiers existent sur ce poste et NULLE PART AILLEURS : ils ne seront pas déployés.\n`
        + `  Geste : git add ${oublies.join(' ')}`);
});

test('L\'OUTIL DE REPRISE DU COFFRE EST BIEN DANS LE DÉPÔT', { skip: dansUnDepot ? false : 'hors dépôt git' }, () => {
    /* Nommé à part parce que c'est lui qui a révélé le défaut, et parce qu'un test qui lit son
       SOURCE (`coffre-chiffre.test.js`) passerait au vert sur un poste où le fichier traîne
       sans être suivi — en échouant, lui, sur un clone neuf. */
    assert.strictEqual(git('ls-files', '--error-unmatch', 'database/tools/chiffrer-coffre.js').status, 0,
        'chiffrer-coffre.js doit être suivi : sans lui, la reprise ne peut pas être lancée sur le VPS.');
});

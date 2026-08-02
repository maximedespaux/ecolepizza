/**
 * Une fonction appelée mais jamais importée.
 *
 * LE DÉFAUT GELÉ ICI, et il est arrivé pour de vrai. `resetMyQuest` appelait `logAudit`, que
 * `espace.controller.js` n'importait pas. Le contrôleur se charge sans broncher — JavaScript ne
 * résout un identifiant qu'à l'exécution — et le plantage n'est tombé qu'AU CLIC, sur la ligne
 * d'audit, c'est-à-dire APRÈS le DELETE. La table était déjà vide quand l'erreur est remontée :
 * l'appelant a vu un 500 et n'a pas nettoyé son côté, laissant un état incohérent.
 *
 * NI LE BUILD NI LE TEST NE L'ONT VU. `esbuild` ne détecte pas les références non définies
 * (CLAUDE.md §2.4), et le test que j'avais écrit vérifiait par regex que la LIGNE `logAudit(...)`
 * existait — ce qui était vrai, et ne prouvait rien. Un motif sur le source atteste d'un texte,
 * jamais d'un symbole résolu.
 *
 * CE TEST BALAIE TOUT LE SERVEUR plutôt que le seul cas rencontré : le défaut n'a rien de
 * particulier à `logAudit` ni à ce contrôleur, et le prochain se produira ailleurs. Il est
 * volontairement STATIQUE — charger un contrôleur ouvre le pool de connexions et la commande ne
 * rend plus la main (cf. CLAUDE.md §2.5).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const DOSSIERS = ['controllers', 'lib', 'middlewares', 'routes'];

/** Tous les fichiers .js du serveur, hors tests et node_modules. */
function fichiers() {
    const out = [];
    for (const d of DOSSIERS) {
        const abs = path.join(API, d);
        if (!fs.existsSync(abs)) continue;
        for (const f of fs.readdirSync(abs)) if (f.endsWith('.js')) out.push(path.join(d, f));
    }
    return out;
}

/* Les symboles qu'on surveille : des fonctions PARTAGÉES, importées d'un module, et dont l'oubli
   ne se voit qu'à l'exécution de la ligne qui les appelle — souvent un cas rare. Les globales du
   langage et de Node n'y sont pas : elles n'ont pas d'import à oublier. */
const SURVEILLES = ['logAudit', 'notify', 'encrypt', 'decrypt'];

test('aucune fonction partagée n\'est appelée sans être importée', () => {
    const fautes = [];
    for (const rel of fichiers()) {
        const src = fs.readFileSync(path.join(API, rel), 'utf8');
        for (const nom of SURVEILLES) {
            /* Un APPEL, et pas une définition, un export ou une mention en commentaire. On coupe
               les commentaires avant de chercher : une ligne « // pense à logAudit() » ferait un
               faux positif, et un test qui crie à tort finit ignoré. */
            const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            const appelle = new RegExp(`(?<![.\\w])${nom}\\s*\\(`).test(sansCommentaires);
            if (!appelle) continue;
            const definit = new RegExp(`(function\\s+${nom}\\b|const\\s+${nom}\\s*=)`).test(sansCommentaires);
            const importe = new RegExp(`require\\([^)]*\\)[^;]*\\b${nom}\\b|\\b${nom}\\b[^=;]*=\\s*require`).test(sansCommentaires)
                || new RegExp(`\\{[^}]*\\b${nom}\\b[^}]*\\}\\s*=\\s*require`).test(sansCommentaires);
            if (!definit && !importe) fautes.push(`${rel} appelle ${nom}() sans l'importer`);
        }
    }
    assert.deepStrictEqual(fautes, [], `\n  ${fautes.join('\n  ')}`);
});

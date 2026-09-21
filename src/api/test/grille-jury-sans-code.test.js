/**
 * LA GRILLE DU JURY N'IMPRIME PLUS « RS7404 RS7404 ».
 *
 * Vu le 2026-09-21 en rendant le vrai modèle : l'en-tête écrivait {Formation} puis {Code}, et
 * l'intitulé de la formation de l'école contient déjà son code. Demandé : retirer {Code}.
 *
 * DEUX ENDROITS, et le second est celui qui compte : le modèle LIVRÉ (lib/modelesJury.js), qui ne
 * sert qu'à poser un modèle absent, et le modèle EN BASE, que seule la migration 166 corrige.
 * Aucun serveur MariaDB n'étant disponible pour l'essayer, ce test rejoue sa logique en
 * JavaScript sur le VRAI balisage des puces : le motif est lu dans le fichier même de la
 * migration, et le revert est simulé position par position.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MIG = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
const ALLER = fs.readFileSync(path.join(MIG, '166_grille_jury_sans_code.sql'), 'utf8');
const RETOUR = fs.readFileSync(path.join(MIG, '166_revert_grille_jury_sans_code.sql'), 'utf8');
/** Un motif SQL (PCRE, classes POSIX) → une RegExp JavaScript équivalente. */
const enJs = (motif) => new RegExp(motif.replace(/\[\[:space:\]\]/g, '\\s'), 'g');
const sansCommentaires = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '');

// Le balisage réel : la forme posée par l'application, et celle que l'éditeur réenregistre.
const PUCE = (cle, lib) => `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${lib}">${lib}</span>`;
const EN_TETE = `<p style="text-align: center;"><span style="font-size: 13pt;"><strong>${PUCE('Formation', 'Intitulé')} ${PUCE('Code', 'Code formation')}</strong></span></p>`;
const EDITEUR = EN_TETE.replace(PUCE('Code', 'Code formation'), '<span data-token="Code" class="doc-token" data-label="Code" contenteditable="false">Code</span>');

test('le modèle LIVRÉ ne porte plus {Code}, et garde {Formation}', () => {
    const { GRILLE_JURY } = require('../lib/modelesJury.js');
    assert.ok(!GRILLE_JURY.body.includes('data-token="Code"'), '{Code} imprimait le code une seconde fois');
    assert.ok(GRILLE_JURY.body.includes('data-token="Formation"'));
});

test('LA MIGRATION retire la puce {Code} et son espace — sous les deux formes, et rien d\'autre', () => {
    const m = /REGEXP_REPLACE\(body_html, '([^']+)', ''\)/.exec(ALLER);
    assert.ok(m, 'motif introuvable dans la 166');
    const motif = enJs(m[1]);
    for (const [forme, html] of [['posée', EN_TETE], ['réenregistrée par l\'éditeur', EDITEUR]]) {
        const apres = html.replace(motif, '');
        assert.ok(!apres.includes('data-token="Code"'), `puce {Code} ${forme} : retirée`);
        assert.ok(apres.includes(PUCE('Formation', 'Intitulé')), `{Formation} intact (${forme})`);
        assert.match(apres, /Intitulé<\/span><\/strong>/, 'pas d\'espace orpheline avant la fin du titre');
    }
    // {Code RNCP} n'est pas {Code} : la clé est comparée guillemets compris.
    const rncp = `<p>${PUCE('Code RNCP', 'Code RNCP')}</p>`;
    assert.strictEqual(rncp.replace(motif, ''), rncp);
    // Seul le modèle de la grille est visé, et seulement s'il porte encore la puce.
    assert.match(ALLER, /WHERE slug = 'grille-jury'\s+AND body_html LIKE '%data-token="Code"%';/);
});

test('LE REVERT la remet exactement là où elle était', () => {
    const motif = /REGEXP_INSTR\(body_html, '([^']+)'\)/.exec(RETOUR);
    const puce = / ' (<span[^']+<\/span>)'\)/.exec(RETOUR);
    assert.ok(motif && puce, 'revert illisible');
    // INSERT(corps, REGEXP_INSTR + CHAR_LENGTH(REGEXP_SUBSTR), 0, ' ' + puce) — en caractères.
    const inserer = (corps) => {
        const r = new RegExp(motif[1]).exec(corps);
        const fin = r.index + r[0].length;
        return corps.slice(0, fin) + ' ' + puce[1] + corps.slice(fin);
    };
    const aller = EN_TETE.replace(enJs(/REGEXP_REPLACE\(body_html, '([^']+)', ''\)/.exec(ALLER)[1]), '');
    assert.strictEqual(inserer(aller), EN_TETE, 'aller puis retour : le modèle d\'origine, au caractère près');
    /* LA POSITION, lue dans la SQL elle-même : début de la puce {Formation} PLUS sa longueur, avec
       le même motif des deux côtés — donc juste APRÈS elle. La simulation ci-dessus suppose
       « après » : sans cette ligne, un revert qui insérerait AVANT passerait quand même. */
    assert.match(RETOUR, /REGEXP_INSTR\(body_html, '([^']+)'\)\s+\+ CHAR_LENGTH\(REGEXP_SUBSTR\(body_html, '\1'\)\)/);
    assert.match(RETOUR, /AND body_html NOT LIKE '%data-token="Code"%';/, 'rien à remettre si la puce est déjà là');
});

test('LES DEUX FICHIERS PASSENT LE CLIENT SQL DE L\'ORGANISME', () => {
    /* La 146 a été refusée : un découpage naïf sur le point-virgule coupait À L'INTÉRIEUR d'une
       chaîne. Ici, un seul point-virgule par fichier — celui qui termine l'instruction — et aucune
       barre oblique inverse, dont le sens dépend du mode SQL du serveur. */
    for (const [nom, sql] of [['166', ALLER], ['166 revert', RETOUR]]) {
        assert.strictEqual((sql.match(/;/g) || []).length, 1, `${nom} : un seul point-virgule, en fin d'instruction`);
        assert.match(sql, /;\s*$/, `${nom} : ce point-virgule termine le fichier`);
        assert.ok(!sansCommentaires(sql).includes('\\'), `${nom} : aucune barre oblique inverse`);
    }
});

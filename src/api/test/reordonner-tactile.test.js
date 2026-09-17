/**
 * RÉORDONNER AU DOIGT — les cartes du parcours documentaire, de la section entreprise et la liste
 * des formations.
 *
 * Signalé le 2026-09-17 : « sur tablette et téléphone, on ne peut pas déplacer les cartes au
 * toucher ». Les trois listes reposaient sur le glisser-déposer HTML5 (`draggable`, `onDrop`),
 * une API de SOURIS : un doigt posé sur une carte fait défiler la page, et aucun `dragstart` ne
 * part. Elles passent par `lib/useReordonner.js`, en Pointer Events.
 *
 * Ce qu'on ne peut pas exécuter ici (pas de navigateur), on le garde par le contrat du source :
 * saisie au doigt par la POIGNÉE seulement, `touch-action:none` sur elle, carte entière à la
 * souris sauf ses commandes. Ce qui se calcule, on le calcule.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app/ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');
const sansCommentaires = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('déplacer : la règle de l\'ancien dépôt, dans les deux sens', async () => {
    const { deplacerDans } = await import('../../app/ui/lib/useReordonner.js');
    const l = ['A', 'B', 'C', 'D'];
    assert.deepStrictEqual(deplacerDans(l, 0, 2), ['B', 'C', 'A', 'D'], 'vers la fin : prend la place visée');
    assert.deepStrictEqual(deplacerDans(l, 3, 1), ['A', 'D', 'B', 'C'], 'vers le début : passe devant la carte visée');
    assert.deepStrictEqual(l, ['A', 'B', 'C', 'D'], 'la liste d\'origine n\'est pas touchée (état React)');
    // Un dépôt sur place ou hors liste rend la MÊME liste : aucun enregistrement pour rien.
    assert.strictEqual(deplacerDans(l, 1, 1), l);
    assert.strictEqual(deplacerDans(l, -1, 2), l);
    assert.strictEqual(deplacerDans(l, 0, 9), l);
    assert.strictEqual(deplacerDans(l, null, 1), l);
});

test('près d\'un bord, la liste défile d\'elle-même ; loin des bords, jamais', async () => {
    const { vitesseBord } = await import('../../app/ui/lib/useReordonner.js');
    assert.strictEqual(vitesseBord(400, 0, 800), 0, 'au milieu, rien ne bouge');
    assert.ok(vitesseBord(10, 0, 800) < 0, 'contre le haut : on remonte');
    assert.ok(vitesseBord(795, 0, 800) > 0, 'contre le bas : on descend');
    assert.ok(Math.abs(vitesseBord(-50, 0, 800)) <= 18, 'plafonnée, même doigt sorti du conteneur');
    assert.ok(Math.abs(vitesseBord(5, 0, 800)) > Math.abs(vitesseBord(40, 0, 800)), 'plus on approche, plus vite');
});

test('les trois listes ont quitté le glisser-déposer HTML5', () => {
    const page = sansCommentaires(lire('pages/Formations.jsx'));
    assert.doesNotMatch(page, /\bdraggable\b|onDragStart|onDragOver|onDrop\b|onDragEnd/,
        'une seule de ces API suffit à rendre une liste inerte au toucher');
    assert.strictEqual((page.match(/useReordonner\(/g) || []).length, 3, 'formations, jalons, section entreprise');
    assert.strictEqual((page.match(/\{\.\.\.glisser\.poignee\(i\)\}/g) || []).length, 3, 'chaque liste expose sa poignée');
});

test('au doigt, on saisit par la POIGNÉE — la carte reste libre pour faire défiler', () => {
    const src = sansCommentaires(lire('lib/useReordonner.js'));
    const poignee = src.slice(src.indexOf('const poignee = (index) =>'), src.indexOf('return { saisi'));
    assert.match(poignee, /touchAction: "none"/, 'sans lui, le navigateur fait défiler au lieu de laisser glisser');
    assert.match(poignee, /e\.stopPropagation\(\)/, 'la carte ne démarre pas une seconde saisie');
    const carte = src.slice(src.indexOf('const proprietes = (index) =>'), src.indexOf('const poignee'));
    assert.match(carte, /if \(e\.pointerType !== "mouse" \|\| e\.button !== 0 \|\| e\.target\.closest\(COMMANDES\)\) return;/,
        'la carte entière ne se saisit qu\'à la souris, et jamais par ses boutons');
    assert.match(src, /const COMMANDES = "button, a, input, select, textarea, label/);
});

test('un clic reste un clic, et un glissé ne dépose que dans SA liste', () => {
    const src = sansCommentaires(lire('lib/useReordonner.js'));
    assert.match(src, /Math\.hypot\(c\.x - c\.x0, c\.y - c\.y0\) < SEUIL/, 'seuil avant de devenir un glissé');
    assert.match(src, /if \(!annule && c\.actif && c\.vise !== c\.index\) deplacer\(c\.index, c\.vise\);/,
        'rien ne se déplace sans glissé réel, ni sur place, ni après une annulation');
    assert.match(src, /setPointerCapture\(e\.pointerId\)/);
    assert.match(src, /el\.getAttribute\("data-reordonner"\) === liste/, 'deux listes à l\'écran ne s\'échangent pas leurs cartes');
});

test('en carte (téléphone), la poignée de la liste des formations ne disparaît plus', () => {
    const page = lire('pages/Formations.jsx');
    assert.match(page, /\{ k: "poignee", t: "", poignee: true,/);
    assert.doesNotMatch(page, /k: "poignee"[^\n]*sansCarte/, '`sansCarte` la retirait : plus aucune prise pour le doigt');
    assert.match(lire('components/DataTable.jsx'), /c\.poignee && "dt-poignee"/);
    const css = lire('styles/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(css, /\.dt td\.dt-poignee\{position:absolute;/);
    assert.match(css, /@media \(pointer:coarse\)\{\.drag-handle\{display:inline-grid;place-items:center;width:40px;height:40px/);
});

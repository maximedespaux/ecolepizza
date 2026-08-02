/**
 * Les choix « OU » mal conditionnés se signalent AVANT qu'on ne bute dessus.
 *
 * LE DÉFAUT GELÉ ICI. Un groupe cassé ne se manifestait qu'au moment d'y ajouter une variante :
 * on cliquait, on recevait un refus. Le reste du temps il produisait silencieusement le mauvais
 * document — ou aucun — sans que rien ne l'annonce. C'est le genre de défaut qu'on découvre le
 * jour où un stagiaire reçoit le devis d'un autre.
 *
 * DEUX CAS DÉTECTÉS, et seulement ceux-là parce qu'ils se DÉMONTRENT :
 *   · conditions identiques — deux variantes s'appliquent au même cas, l'une des deux sortira
 *     arbitrairement ;
 *   · groupe à une seule variante — un « OU » qui n'offre plus de choix, ce qui arrive après une
 *     suppression ou un renommage. Si la variante restante porte une condition, le jalon ne
 *     produit RIEN dans les autres cas.
 * « Il manque peut-être un cas » n'en fait pas partie : on ne connaît pas l'ensemble des cas
 * possibles, et une alerte qu'on ne peut pas justifier apprend à ignorer les alertes.
 *
 * OÙ CELA S'AFFICHE. Une pastille « ! » sur la formation dans la liste — elle dit QU'IL Y EN A —
 * et le TEXTE en tête du parcours, là où on le corrige. Pas seulement une info-bulle : elle ne
 * se lit que si on la cherche, et personne ne survole un jalon qu'il croit correct.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { diagnostiquerGroupe, alertesParSlug } = require('../lib/equivalence.js');

const APP = path.join(__dirname, '..', '..', 'app');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Formations.jsx'), 'utf8');
const srcCss = fs.readFileSync(path.join(APP, 'ui/styles/app.css'), 'utf8');
const srcCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers/formationProgram.controller.js'), 'utf8');

const { validateMembers } = require('../lib/equivalence.js');

const bySlug = new Map([
    ['part', { label: 'Devis particulier', applies_when: { conditions: ['financeur-particulier'] } }],
    ['pro', { label: 'Devis professionnel', applies_when: { conditions: ['financeur-professionnel'] } }],
    // Document de GROUPE : il ne s'affiche jamais dans le flux du parcours, il vit dans l'onglet
    // « À l'arrivée via une entreprise ». C'est ce qui rendait le refus incompréhensible.
    ['ent', { label: 'Devis entreprise', company_level: true, applies_when: { conditions: ['financeur-professionnel'] } }],
]);

test('le refus SITUE le document qu\'on ne voit pas', () => {
    /* LE CAS RÉEL, et il a fallu lire la base pour le comprendre. Le groupe « OU » du jalon
     * « Devis particulier » contenait aussi « Devis entreprise » — un document de GROUPE, donc
     * affiché dans un AUTRE onglet, invisible depuis le parcours du dossier. Ajouter « Devis
     * professionnel » était refusé à cause de lui, et le message le nommait sans dire ni qu'il
     * était déjà là, ni où le trouver. On concluait, à juste titre, que « les conditions ne sont
     * pourtant pas les mêmes » — en comparant particulier et professionnel, qui diffèrent bien. */
    const r = validateMembers(['part', 'ent', 'pro'], bySlug, 'pro');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /est DÉJÀ dans ce choix/, 'dire lequel etait deja la');
    assert.match(r.error, /onglet « À l'arrivée via une entreprise »/, 'et OU le trouver');
    assert.match(r.error, /Retirez « Devis entreprise » de ce choix/, 'le geste de sortie nomme la bonne cible');
});

test('sans indication d\'ajout, le message reste symétrique', () => {
    // Les autres appelants ne passent pas `ajoute` : le message doit rester correct sans lui.
    const r = validateMembers(['ent', 'pro'], bySlug);
    assert.strictEqual(r.ok, false);
    // La situation du document contient elle-même des guillemets : le motif ne peut pas les exclure.
    assert.match(r.error, /« Devis entreprise »[\s\S]*?et « Devis professionnel »/);
});

test('un groupe sain ne déclenche rien', () => {
    // Une alerte qui se déclenche à tort apprend à ignorer les alertes.
    assert.strictEqual(diagnostiquerGroupe(['part', 'pro'], bySlug), null);
});

test('deux variantes au même cas sont signalées, et NOMMÉES', () => {
    const pb = diagnostiquerGroupe(['pro', 'ent'], bySlug);
    assert.strictEqual(pb.type, 'conditions-identiques');
    /* Le message doit nommer les DEUX documents et la condition partagée : « il y a un problème »
       oblige à le chercher soi-même. */
    assert.match(pb.texte, /« Devis professionnel » et « Devis entreprise »/);
    assert.match(pb.texte, /« financeur-professionnel »/);
    assert.match(pb.texte, /l'un des deux sortira au hasard/, 'la consequence, pas seulement la cause');
    assert.match(pb.texte, /Donnez-leur des conditions différentes/, 'et le geste de sortie');
});

test('un membre disparu laisse un « OU » sans choix, et on le dit', () => {
    const pb = diagnostiquerGroupe(['part', 'disparu'], bySlug);
    assert.strictEqual(pb.type, 'groupe-incomplet');
    assert.match(pb.texte, /« disparu » n'existe plus/, 'le membre manquant est nomme');
    assert.match(pb.texte, /aucun document ne sera produit dans les autres cas/,
        'la consequence reelle : un trou dans le parcours');
});

test('l\'alerte est indexée sur CHAQUE membre du groupe', () => {
    /* Le jalon peut être affiché sous n'importe laquelle de ses variantes : marquer un seul slug
       laisserait le repère invisible une fois sur deux. */
    const m = alertesParSlug([{ key: 'g', label: 'Devis', members: ['pro', 'ent'] }], bySlug);
    assert.deepStrictEqual([...m.keys()], ['pro', 'ent']);
    assert.strictEqual(m.get('pro').groupe, 'Devis');
});

test('le diagnostic ne peut pas faire tomber la liste des formations', () => {
    /* Un diagnostic est un CONFORT. S'il échoue — table absente, données bancales — la liste des
       formations doit sortir quand même : l'inverse ferait disparaître la page pour un badge. */
    assert.match(srcCtrl, /\} catch \(e\) \{ console\.error\('Diagnostic conditions \(non bloquant\) :', e\.message\); \}/,
        'le diagnostic doit etre isole dans son propre catch');
    // Compté par GROUPE et non par étape : un « OU » à deux variantes cassées est UN problème.
    assert.match(srcCtrl, /\.add\(alertes\.get\(a\.slug\)\.groupe\)/, 'on compte les groupes, pas les slugs');
});

test('la pastille dit qu\'il y en a, le texte dit lequel', () => {
    assert.match(srcPage, /\{p\.alertes_conditions > 0 && \(/, 'pastille dans la liste');
    assert.match(srcPage, /<div className="alerte-conditions">/, 'texte en tete du parcours');
    assert.match(srcPage, /<span className="pastille-alerte pf-alerte"/, 'repere sur le jalon concerne');
    /* Ambre et non rouge : ce n'est pas une erreur bloquante, c'est un réglage qui produira le
       mauvais document un jour. Le rouge est réservé à ce qui casse tout de suite. */
    assert.match(srcCss, /\.pastille-alerte\{[^}]*color:var\(--ember2\)/, 'ambre, pas rouge');
});

test('la composition réelle d\'un choix « OU » est visible, et modifiable', () => {
    /* LE CŒUR DU MALENTENDU, et il aura fallu lire la base pour le voir. On voulait grouper
     * « Devis particulier » et « Devis professionnel » — deux conditions bien distinctes — et le
     * refus parlait d'un troisième document. Ce troisième, « Devis entreprise », est un document
     * de GROUPE : membre à part entière du choix, mais filtré du flux du parcours, donc affiché
     * NULLE PART depuis cet écran. Et un quatrième membre, mort après un renommage, s'y cachait
     * aussi.
     *
     * On ne pouvait qu'AJOUTER à un groupe, jamais en retirer : la composition n'était ni visible
     * ni modifiable. Le panneau la montre désormais — chaque membre situé (document de groupe,
     * membre disparu) et retirable. */
    const srcPageNow = fs.readFileSync(path.join(APP, 'ui/pages/Formations.jsx'), 'utf8');
    assert.match(srcPageNow, /Déjà dans ce choix :/, 'la composition doit etre affichee');
    assert.match(srcPageNow, /\{m\.company_level && <span className="hint"> · document de groupe<\/span>\}/,
        'un document de groupe doit etre SITUE : il ne s\'affiche pas dans le flux');
    assert.match(srcPageNow, /\{m\._absent && <span className="hint"> · n'existe plus<\/span>\}/,
        'un membre mort doit se voir, c\'est lui qui bloque');
    assert.match(srcPageNow, /onClick=\{\(\) => onRetirerOu\?\.\(m\.slug\)\}/, 'et chacun doit pouvoir sortir');
    /* Un « OU » à moins de deux membres n'a plus d'objet : on dissout le groupe plutôt que de
       laisser un choix qui n'en est pas un. */
    assert.match(srcPageNow, /if \(restants\.length < 2\) await deleteEquivalence\(eq\.id\);/,
        'un groupe reduit a un membre doit etre dissous');
});

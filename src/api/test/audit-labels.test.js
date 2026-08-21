/**
 * Le journal d'audit affiche des libellés lisibles, pas des codes techniques.
 *
 * Ces tests lisent les codes RÉELLEMENT posés par `logAudit` dans les contrôleurs et vérifient
 * que chacun a sa traduction. Un test qui poserait sa propre liste de codes ne prouverait rien :
 * il approuverait la table contre elle-même. On confronte la table à la source — le jour où un
 * contrôleur ajoute un code sans libellé, c'est ici que ça se voit, pas sur l'écran de l'ADMIN.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/** Charge le module UI (ESM) dans ce contexte CommonJS. */
const { auditLabel, entityLabel, ACTION_LABEL, ENTITY_LABEL } = (() => {
    const p = path.join(__dirname, '..', '..', 'app/ui/lib/auditLabels.js');
    const src = fs.readFileSync(p, 'utf8')
        .replace(/export \{[^}]*\};\s*$/, 'module.exports = { auditLabel, entityLabel, ACTION_LABEL, ENTITY_LABEL };');
    const m = { exports: {} };
    new Function('module', 'exports', src)(m, m.exports);
    return m.exports;
})();

/** Les couples (action, entité) tels que les contrôleurs les journalisent. */
function couplesReels() {
    const dir = path.join(__dirname, '..', 'controllers');
    const couples = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        for (const m of src.matchAll(/logAudit\(req,\s*'([^']+)'(?:\s*,\s*'([^']+)')?/g)) {
            couples.push([m[1], m[2] || null]);
        }
    }
    return couples;
}

test('chaque code d\'audit réellement posé a un libellé lisible', () => {
    const bruts = [];
    for (const [action, entity] of couplesReels()) {
        const { label } = auditLabel(action, entity);
        // Le libellé ne doit jamais être le code brut : ni le code d'action, ni un verbe
        // technique laissé nu (« CREATE »).
        if (label === action || /^(CREATE|UPDATE|DELETE)$/.test(label)) bruts.push(`${action} / ${entity || '—'}`);
    }
    assert.deepStrictEqual(bruts, [], `codes sans libellé lisible :\n  ${bruts.join('\n  ')}`);
});

test('chaque entité réellement journalisée est connue de la table', () => {
    // On vise l'ABSENCE de la table, pas l'égalité des chaînes : « Quiz » et « Archive » se
    // traduisent légitimement par eux-mêmes. Comparer label !== entity les signalerait à tort,
    // et masquerait le vrai défaut — une entité qu'on a oublié de déclarer.
    const inconnues = new Set();
    for (const [, entity] of couplesReels()) {
        if (entity && !(entity in ENTITY_LABEL)) inconnues.add(entity);
    }
    assert.deepStrictEqual([...inconnues], [], `entités non déclarées : ${[...inconnues].join(', ')}`);
});

test('le code emblématique de la demande est traduit', () => {
    // « invoice.facturx » était le symptôme signalé : le journal l'affichait tel quel.
    const { label } = auditLabel('invoice.facturx', 'Invoice');
    assert.match(label, /Factur-X/);
    assert.notStrictEqual(label, 'invoice.facturx');
});

test('les verbes génériques sont désambiguïsés par l\'entité', () => {
    // « CREATE » seul n'apprend rien ; le sujet vient de l'entité.
    assert.strictEqual(auditLabel('CREATE', 'quest_chapter').label, 'Chapitre (Pizza Quest) créé');
    assert.strictEqual(auditLabel('DELETE', 'quest_question').label, 'Question (Pizza Quest) supprimée');
});

test('le participe s\'accorde au genre de l\'entité', () => {
    // Une entité féminine reçoit « créée », pas « créé » : un détail, mais un journal truffé de
    // fautes d'accord se lit comme un brouillon, pas comme une pièce de traçabilité.
    assert.match(auditLabel('CREATE', 'quest_category').label, /créée$/); // catégorie, f.
    assert.match(auditLabel('CREATE', 'quest_chapter').label, /créé$/);  // chapitre, m.
});

test('les tons distinguent la nature de l\'action', () => {
    // La couleur répond « dois-je m'en inquiéter ? » avant la lecture. Une suppression est
    // rouge, une création verte, une modification ambre — quelle que soit l'entité.
    assert.strictEqual(auditLabel('template.delete').tone, 'r');
    assert.strictEqual(auditLabel('DELETE', 'quest_question').tone, 'r');
    assert.strictEqual(auditLabel('invoice.create').tone, 'g');
    assert.strictEqual(auditLabel('organization.update').tone, 'a');
});

test('un code inconnu retombe sur lui-même plutôt que de disparaître', () => {
    // Un code ajouté demain sans libellé doit rester visible tel quel : illisible vaut mieux
    // qu'invisible sur un journal d'audit.
    const { label, tone } = auditLabel('futur.code.inedit', null);
    assert.strictEqual(label, 'futur.code.inedit');
    assert.strictEqual(tone, 'n');
});

test('tous les tons employés existent dans le composant Badge', () => {
    // Un ton inventé rendrait une pastille sans style. Badge connaît g/a/r/b/n.
    const valides = new Set(['g', 'a', 'r', 'b', 'n']);
    for (const [action, [, tone]] of Object.entries(ACTION_LABEL)) {
        assert.ok(valides.has(tone), `ton inconnu « ${tone} » pour ${action}`);
    }
});

test('chaque entité déclare un genre exploitable pour l\'accord', () => {
    for (const [ent, [, genre]] of Object.entries(ENTITY_LABEL)) {
        assert.ok(genre === 'm' || genre === 'f', `${ent} : genre « ${genre} » invalide`);
    }
});

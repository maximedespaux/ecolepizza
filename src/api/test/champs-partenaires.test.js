/**
 * QUELLES INFORMATIONS PARTENT CHEZ LES PARTENAIRES — le choix de l'école, et ce qu'il engage.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TIENT TOUT : LA PHRASE SE DÉRIVE DES CHAMPS.
 *
 * Tant que le texte était figé et la liste de champs écrite à côté, les deux pouvaient diverger
 * en silence — l'école retirait le téléphone de l'export et la phrase continuait de l'annoncer,
 * ou l'inverse : un consentement obtenu pour six champs servant à en transmettre sept. En
 * dérivant l'un de l'autre, l'écart devient impossible à produire.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ET L'ASYMÉTRIE ENTRE RETIRER ET AJOUTER, qui est le cœur du sujet.
 *
 * Un consentement porte sur ce qui a été DIT. Retirer un champ s'applique tout de suite à tout le
 * monde : on transmet moins que ce qui a été accepté, ce qui est toujours permis. Ajouter un
 * champ ne vaut QUE pour les réponses suivantes — la personne ne pouvait pas consentir à ce
 * qu'elle ignorait. D'où l'intersection à l'export, et `consent_record.champs` qui fige ce qui a
 * été annoncé à chacun.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const MIG = path.join(API, '..', '..', 'database', 'migrations');
const lib = require('../lib/consentements.js');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('la phrase se construit depuis les champs, et rien d\'autre', () => {
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'lib/consentements.js'), 'utf8'));
    assert.doesNotMatch(src, /formulation:\s*\n?\s*'J\\'accepte/,
        'Aucune formulation ne doit rester écrite en dur à côté de la liste des champs.');
    assert.match(src, /function formulationPour\(champs\)/);
});

test("l'ordre de la phrase ne dépend pas de l'ordre de saisie", () => {
    /* Deux écoles qui cochent les mêmes cases dans un ordre différent doivent obtenir LE MÊME
       texte : sinon le registre garde deux preuves qui n'ont pas l'air d'être la même, et
       comparer une réponse ancienne à la formulation du jour devient impossible. */
    const a = lib.formulationPour(['email', 'nom', 'telephone']);
    const b = lib.formulationPour(['telephone', 'email', 'nom']);
    assert.strictEqual(a, b);
    assert.ok(a.indexOf('mon nom') < a.indexOf('mon adresse e-mail'), "l'ordre d'annonce est fixe");
});

test('une clé inconnue ne peut pas entrer dans la phrase', () => {
    /* La liste vient d'un réglage écrit en base : sans filtrage, une valeur bricolée à la main
       apparaîtrait telle quelle dans un texte à valeur de preuve. */
    assert.deepStrictEqual(lib.champsValides('nom,bidon,email'), ['nom', 'email']);
    assert.ok(!lib.formulationPour(['nom', 'bidon']).includes('bidon'));
});

test('aucun champ coché se DIT, au lieu de produire une phrase bancale', () => {
    /* « J'accepte que l'école communique à ses partenaires » ne veut rien dire, et on le ferait
       pourtant accepter. Tout décocher est un réglage légitime — l'école cesse de transmettre —
       et le texte doit l'énoncer. */
    const p = lib.formulationPour([]);
    assert.match(p, /Aucune information/);
    assert.ok(!p.includes("J'accepte"));
});

test("l'écran et le serveur annoncent les champs avec les MÊMES mots", () => {
    /* DUPLICATION INÉVITABLE, MAIS BORNÉE : l'aperçu doit se former à la frappe, avant tout
       enregistrement, donc l'écran recompose la phrase. Si les deux rédactions divergeaient,
       l'école validerait un texte que le stagiaire ne lirait jamais — et la preuve stockée
       porterait sur l'autre. Ce test les tient collées. */
    const comp = fs.readFileSync(path.join(UI, 'components/ChampsPartenaires.jsx'), 'utf8');
    const bloc = comp.slice(comp.indexOf('const ANNONCES = {'));
    for (const [cle, v] of Object.entries(lib.CHAMPS_TRANSMISSIBLES)) {
        assert.ok(bloc.includes(`${cle}: "${v.annonce.replace(/'/g, "'")}"`)
            || bloc.includes(v.annonce),
            `l'écran doit annoncer « ${cle} » avec les mots du serveur : « ${v.annonce} »`);
    }
    /* Et l'inverse : pas de champ côté écran que le serveur ignore — il apparaîtrait dans
       l'aperçu, puis disparaîtrait de la vraie phrase. */
    for (const m of bloc.matchAll(/^\s{2}([a-z_]+):/gm)) {
        assert.ok(lib.CHAMPS_TRANSMISSIBLES[m[1]], `« ${m[1] }» est annoncé par l'écran seul`);
    }
});

test('la migration 135 fige ce qui a été annoncé, pas seulement le choix du jour', () => {
    const sql = fs.readFileSync(path.join(MIG, '135_partner_champs_transmis.sql'), 'utf8');
    assert.match(sql, /ALTER TABLE organization\s+ADD COLUMN IF NOT EXISTS partner_fields/,
        'le choix de l\'école');
    assert.match(sql, /ALTER TABLE consent_record\s+ADD COLUMN IF NOT EXISTS champs/,
        'ET ce qui a été annoncé à chaque personne — la seconde est la plus importante');
    /* LE DÉFAUT DOIT ÊTRE LES SIX D'ORIGINE : une base qui joue la migration ne doit rien voir
       changer, ni dans le texte, ni dans l'export. */
    assert.match(sql, /DEFAULT 'nom,prenom,email,telephone,formation,dates_session'/);
    assert.ok(fs.existsSync(path.join(MIG, '135_revert_partner_champs_transmis.sql')));
});

test('sans la migration, tout continue comme avant', () => {
    /* Le code doit marcher AVANT comme APRÈS : sans `partner_fields`, on retombe sur les six
       champs d'origine — c'est-à-dire exactement ce qui était annoncé jusqu'alors. */
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'lib/consentements.js'), 'utf8'));
    assert.match(src, /return \[\.\.\.FINALITES\.partenaires\.champsParDefaut\];/,
        'le repli doit exister');
    assert.deepStrictEqual(lib.FINALITES.partenaires.champsParDefaut,
        ['nom', 'prenom', 'email', 'telephone', 'formation', 'dates_session']);
    /* Et une réponse ANTÉRIEURE (champs à NULL) se lit comme ces six-là : c'était la seule liste
       possible à l'époque, donc la seule chose qu'on sache de ce qui lui a été montré. */
    assert.match(src, /champsAnnonces: r\.champs \? champsValides\(r\.champs\) : \[\.\.\.FINALITES\.partenaires\.champsParDefaut\]/);
});

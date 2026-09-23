/**
 * UN REFUS RETIRE LES COORDONNÉES, PAS LA PERSONNE (décidé par l'école le 2026-09-23).
 *
 * CE QUI SE PASSAIT. Un refus retirait le stagiaire de la liste ENTIÈREMENT : le partenaire ne
 * savait même pas qu'il avait été formé. L'école a besoin de dire QUI elle a formé ; le stagiaire
 * refuse d'être DÉMARCHÉ. Les deux tiennent ensemble — le nom part, les coordonnées non.
 *
 * TROIS ÉTATS, TROIS TRAITEMENTS, et c'est le troisième qui fait la règle :
 *   · ACCEPTÉ → tout ce que l'école a coché, croisé avec ce qui lui avait été annoncé ;
 *   · REFUSÉ → nom et prénom, rien d'autre ;
 *   · JAMAIS SOLLICITÉ → rien du tout. Cette personne n'a jamais lu la phrase : personne ne peut
 *     transmettre en son nom, et c'est ce qui distingue « il a dit non » de « on ne lui a rien
 *     demandé ».
 *
 * ⚠️ LA RÈGLE VAUT AUSSI POUR LES REFUS DÉJÀ ENREGISTRÉS — l'école l'a demandé explicitement. Leur
 * phrase annonçait « mon nom, mon prénom, mon adresse e-mail… » : le registre garde cette phrase,
 * si bien que l'écart reste lisible ligne par ligne.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const lib = require('../lib/consentements.js');

test('la phrase ANNONCE l\'identité, et ne la met pas sous le « j\'accepte »', () => {
    /* UN CONSENTEMENT PORTE SUR CE QU'ON PEUT REFUSER. Laisser « mon nom » dans le « j'accepte »
       ferait croire que refuser le retient — c'est faux depuis que l'identité part dans tous les
       cas, et un texte faux au registre est pire que pas de texte du tout. */
    const p = lib.formulationPour(['nom', 'prenom', 'email', 'telephone']);
    assert.match(p, /^L'école communique mon nom et mon prénom à ses partenaires/);
    assert.match(p, /Cela ne dépend pas de ma réponse/);
    assert.match(p, /J'accepte que l'école y ajoute mon adresse e-mail et mon téléphone/);
    assert.ok(!/J'accepte que l'école communique mon nom/.test(p), 'le nom n\'est plus consenti');
    /* ET LA PHRASE LE REDIT AU MOMENT DU RETRAIT : « je peux revenir sur ce choix » sans préciser
       ce qui reste transmis laisserait croire qu'on récupère tout. */
    assert.match(p, /mon nom et mon prénom continueront d'être transmis/);

    /* L'ÉCOLE PEUT NE TRANSMETTRE QUE L'IDENTITÉ : il n'y a alors rien à accepter, et la phrase
       le dit plutôt que de demander un accord sur rien. */
    const seule = lib.formulationPour(['nom', 'prenom']);
    assert.match(seule, /Aucune autre information n'est transmise, et il n'y a donc rien à accepter ici/);
    assert.ok(!/J'accepte/.test(seule));

    /* Et si l'école ne transmet RIEN, la phrase reste celle d'avant : pas d'annonce fantôme. */
    assert.strictEqual(lib.formulationPour([]),
        'Aucune information n\'est actuellement transmise aux partenaires de l\'école.');
});

test('l\'export garde les refus avec leur seul nom, et laisse dehors les non sollicités', () => {
    const src = sansCommentaires(lire(path.join(API, 'controllers/consentement.controller.js')));
    /* LES TROIS ÉTATS SE LISENT DANS LE CODE, chacun par sa comparaison explicite : `accorde`
       vaut `true`, `false` ou `null`, et un `!accorde` mêlerait le refus au silence. */
    assert.match(src, /const retenus = uniques\.filter\(\(l\) => etats\.get\(l\.id\)\?\.accorde === true\);/);
    assert.match(src, /const refuses = uniques\.filter\(\(l\) => etats\.get\(l\.id\)\?\.accorde === false\);/);
    assert.match(src, /for \(const l of refuses\) champsParStagiaire\.set\(l\.id, identite\);/,
        'un refus ne laisse QUE les champs d\'identité');
    assert.match(src, /const identite = choisis\.filter\(\(c\) => consentements\.estIdentite\(c\)\);/,
        'et cette identité reste bornée par ce que l\'école a choisi de transmettre');

    /* LA LISTE RESTE ALPHABÉTIQUE : ranger les refus à la fin désignerait à un tiers qui a
       refusé — exactement l'information qu'il n'a pas à recevoir. */
    assert.match(src, /const tous = \[\.\.\.retenus, \.\.\.refuses\]\.sort\(/);
    assert.match(src, /localeCompare\([^)]*'fr'\)/);

    /* LE JOURNAL PORTE CE QUI EST RÉELLEMENT PARTI, refus compris : c'est la seule preuve dont
       l'école dispose, et n'y inscrire que les accords la ferait mentir. */
    assert.match(src, /const envoyes = \[\.\.\.retenus, \.\.\.refuses\];/);
    assert.match(src, /envoyes\.map\(\(l\) => l\.id\)\.join\(','\), envoyes\.length,/);
    assert.match(src, /\$\{refuses\.length\} refus \(nom, prénom seuls\)/);

    /* ET L'ÉCRAN PEUT LE DIRE : sans ces deux nombres, une colonne e-mail à moitié vide se lirait
       comme une fiche incomplète, et non comme un refus respecté. */
    assert.match(src, /acceptes: retenus\.length, refus: refuses\.length,/);
});

test('les écrans disent ce qui part malgré un refus', () => {
    const session = sansCommentaires(lire(path.join(UI, 'components/SessionConsentements.jsx')));
    /* LES ASSERTIONS PORTENT SUR DES FRAGMENTS D'UNE SEULE LIGNE : ces textes sont écrits en
       concaténation, et une phrase entière ne s'y retrouve jamais d'un bloc. */
    assert.match(session, /nom et son prénom, eux, sont transmis dans tous les cas/);
    assert.match(session, /un refus retire les/);
    assert.match(session, /coordonnées, pas la personne/);
    assert.match(session, /jamais sollicitée, en revanche, ne figure nulle/);
    const exp = sansCommentaires(lire(path.join(UI, 'components/ExportPartenaire.jsx')));
    assert.match(exp, /n'y laisse que son nom et son prénom/);
    assert.match(exp, /jamais été sollicité<\/b> n'y figure/);
    assert.match(exp, /\{resultat\.acceptes\} ont accepté, \{resultat\.refus\} n'ont donné que leur nom/);
    /* LE RÉGLAGE DE L'ÉCOLE LE DIT AUSSI : c'est là qu'on décide des champs, donc là qu'on doit
       apprendre que deux d'entre eux ne dépendent pas de la réponse. */
    const champs = sansCommentaires(lire(path.join(UI, 'components/ChampsPartenaires.jsx')));
    assert.match(champs, /Le nom et le prénom sont transmis même\s*\n?\s*en cas de refus/);
});

test('l\'aperçu du réglage écrit la MÊME phrase que le serveur', () => {
    /* La phrase se forme à la frappe, avant tout enregistrement : l'écran la recompose donc de
       son côté. Les deux doivent dire mot pour mot la même chose — sans quoi l'école réglerait
       ses champs sur un texte que le stagiaire ne lira jamais. */
    const champs = lire(path.join(UI, 'components/ChampsPartenaires.jsx'));
    for (const bout of ["L'école communique ", ' à ses partenaires, afin qu\'ils sachent qui elle a formé. ',
        'Cela ne dépend pas de ma réponse ci-dessous. ', "J'accepte que l'école y ajoute ",
        "continueront d'être transmis"]) {
        assert.ok(champs.includes(bout), `l'aperçu doit contenir « ${bout} »`);
    }
    assert.match(champs, /const IDENTITE = \["nom", "prenom"\];/);
    assert.deepStrictEqual(lib.CHAMPS_IDENTITE, ['nom', 'prenom'],
        'la même liste des deux côtés, sinon l\'aperçu ment');
});

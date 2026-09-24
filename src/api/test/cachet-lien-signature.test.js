/**
 * SIGNER UNE CONVENTION AVEC LE CACHET ENREGISTRÉ, PAR LE LIEN — EN UN CLIC (demandé le 2026-09-24).
 *
 * DÉFAUT GELÉ : le lien public de signature ne savait QUE dessiner. L'employeur qui reçoit une
 * convention à co-signer redessinait sa signature à la main, alors que son cachet est déjà
 * enregistré (espace représentant, ou image importée). Désormais, si l'entreprise du document a un
 * cachet, le lien propose « Signer avec le cachet » : le serveur relit le cachet LUI-MÊME — rien de
 * l'image ne transite par la page publique — et l'appose dans le cadre `representant`.
 *
 * LE PIÈGE, gelé ici : l'entreprise d'une convention vient du DOSSIER (enrollment.company_id),
 * jamais de la fiche du stagiaire — celle-ci garde à vie le premier employeur (cf.
 * docSignedByCompany). Se tromper de source apposerait le cachet d'une entreprise qui n'a rien à
 * voir avec la session.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');

const PUB = lire('controllers/public.controller.js');

test('le lien accepte « use_saved » — mais seulement pour le cadre du représentant', () => {
    const sub = PUB.slice(PUB.indexOf('const submitSign'), PUB.indexOf('module.exports'));
    assert.match(sub, /if \(\(req\.body \|\| \{\}\)\.use_saved\) \{/, 'le corps peut demander le cachet enregistré');
    assert.match(sub, /if \(link\.slot !== 'representant'\) return res\.status\(422\)/,
        'le cachet ne s\'applique qu\'au cadre du représentant (pas au stagiaire)');
    assert.match(sub, /const cachet = await cachetDuDocument\(conn, doc\);/);
    assert.match(sub, /signature_data = cachet\.stamp;/, 'le cachet relu devient la signature');
    assert.match(sub, /if \(!signer_name\) signer_name = cachet\.name/, 'à défaut de nom, celui de l\'entreprise');
    /* Défense en profondeur : le cachet relu repasse la validation stricte, au même titre qu'un tracé. */
    assert.ok(sub.indexOf('use_saved') < sub.indexOf('estSignatureValide(signature_data)'),
        'la validation stricte de la signature SUIT la résolution du cachet');
});

test('l\'entreprise d\'une convention vient du DOSSIER, jamais de la fiche du stagiaire', () => {
    const debut = PUB.indexOf('async function cachetDuDocument');
    const fn = PUB.slice(debut, debut + 1000);
    /* Document de GROUPE : la fiche entreprise portée par le document. */
    assert.match(fn, /if \(doc\.company_id\) \{[\s\S]*?FROM company WHERE id = \?/);
    /* CONVENTION : le DOSSIER (enrollment.company_id via document_formation). */
    assert.match(fn, /JOIN enrollment e ON e\.id = df\.enrollment_id/);
    assert.match(fn, /JOIN company c ON c\.id = e\.company_id/);
    /* Surtout PAS la fiche du stagiaire (employeur figé à vie). */
    assert.doesNotMatch(fn, /learner\.company_id|FROM learner/);
});

test('la page publique annonce la disponibilité du cachet SANS livrer l\'image', () => {
    const get = PUB.slice(PUB.indexOf('const getSignPage'), PUB.indexOf('const submitSign'));
    assert.match(get, /if \(link\.slot === 'representant'\)/, 'le cachet ne concerne que le représentant');
    assert.match(get, /cachet_disponible: cachetDisponible/);
    /* On ne renvoie QUE le booléen : la charge utile publique ne porte aucun champ « stamp ». */
    const reponse = get.slice(get.indexOf('res.json'));
    assert.doesNotMatch(reponse, /stamp/, 'l\'image du cachet ne quitte pas le serveur');
});

test('le lien public offre un bouton « un clic » qui poste use_saved', () => {
    const ui = lireUi('pages/SignerPublic.jsx');
    assert.match(ui, /submitPublicSign\(token, \{ use_saved: true/, 'un clic → use_saved');
    assert.match(ui, /data\.cachet_disponible &&/, 'le bouton n\'apparaît que si un cachet existe');
});

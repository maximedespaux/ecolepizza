/**
 * LA LIGNE DE DÉTAIL DU PARCOURS — demandé le 2026-10-06 : « sous Parcours, mettre le badge de la
 * formation, et rendre la session cliquable pour l'atteindre facilement ».
 *
 * Sur la fiche stagiaire ET la fiche entreprise (deux écrans, UN composant : EnrollmentParcours),
 * la ligne « NIV2 · SEM 51/2026 · … » affichait trois textes collés. Désormais :
 *   · la FORMATION est un BADGE de sa couleur (la couleur propre de l'organisme, migration 041, ou
 *     `colorOf(code)` à défaut) — comme les badges de formation partout ailleurs dans l'app ;
 *   · la SESSION est un LIEN vers sa fiche (`/sessions/:id`), joignable d'un clic.
 *
 * Rien à migrer : la session (`session_id`) était déjà chargée, la couleur s'ajoute aux requêtes
 * (colonne présente depuis la 041). Le serveur les pose dans `header`, l'écran les rend.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
const lireApi = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test("L'ÉCRAN : la formation en badge de sa couleur, la session en lien vers sa fiche", () => {
    const parc = lireUi('components/EnrollmentParcours.jsx');
    // Les deux dépendances neuves : le lien de route et la couleur de secours.
    assert.match(parc, /import \{ Link \} from "react-router-dom";/);
    assert.match(parc, /import \{ colorOf \} from "\.\.\/lib\/format\.js";/);

    // Le BADGE de formation : couleur propre, sinon la couleur déterministe du code (comme ailleurs).
    assert.match(parc, /background: h\.color \|\| colorOf\(h\.code\)/, 'couleur propre, sinon colorOf(code)');
    assert.match(parc, /className="badge n mono"/);

    // La SESSION cliquable vers sa fiche, et SEULEMENT si on a son identifiant (sinon simple texte).
    assert.match(parc, /h\.session_id\s*\?\s*<Link key="sess" to=\{`\/sessions\/\$\{h\.session_id\}`\}/);
    assert.match(parc, /: <span key="sess">\{h\.session\}<\/span>/, 'sans identifiant : du texte, pas un lien mort');

    /* LE FINANCEMENT RESTE HORS de ces pastilles (il a son propre menu) — le même garde-fou que
       type-devis-dossier, redit ici : on ne doit pas le faire réapparaître dans la ligne. */
    assert.doesNotMatch(parc, /teteItems\.push\([^)]*h\.financing/);
    assert.match(parc, /<select className="parc-devis"/, 'le menu « type de devis » est toujours là');
});

test('LE SERVEUR : header porte color + session_id, des deux côtés (stagiaire et entreprise)', () => {
    // Fiche stagiaire (document.controller sert le parcours du dossier par enrollment.controller).
    const enr = lireApi('controllers/enrollment.controller.js');
    assert.match(enr, /p\.color AS program_color,/, 'la requête ramène la couleur de la formation');
    assert.match(enr, /color: e\.program_color \|\| null,/, 'le header porte la couleur');
    assert.match(enr, /session_id: e\.session_id \|\| null,/, 'le header porte l\'identifiant de session');

    // Fiche entreprise (parcours de groupe).
    const co = lireApi('controllers/company.controller.js');
    assert.match(co, /p\.color AS program_color,/, 'la requête de session ramène la couleur');
    assert.match(co, /color: grp\.sess\.program_color \|\| null,/, 'le header de groupe porte la couleur');
    assert.match(co, /session_id: grp\.sess\.id \|\| null,/, 'le header de groupe porte l\'identifiant de session');
});

/**
 * LES HEURES D'UN INTERVENANT EXTERNE, demi-journée par demi-journée (demandé le 2026-09-23,
 * migration 181).
 *
 * LE BESOIN. Une case cochée disait QU'il est venu, jamais QUAND — et un intervenant externe ne
 * suit pas les horaires des stagiaires : l'expert hygiène passe de 10 h à 12 h 30 un mardi matin,
 * le jury siège de 14 h à 16 h. La ligne « Horaires » en haut de la feuille parle des stagiaires ;
 * la case de l'intervenant, elle, ne portait qu'une signature muette. Un contrôle qui vérifie le
 * temps facturé par l'intervenant n'avait rien à lire.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · la plage est lue en UN seul endroit, et une plage à moitié saisie ou à l'envers n'en est pas
 *     une — la demi-journée reste cochée, la case reste muette ;
 *   · la feuille imprime les heures AU-DESSUS de la signature, et l'aperçu le fait AUSSI (la même
 *     fonction sert aux deux : un aperçu qui ne ressemble pas au PDF ne se voit qu'une fois signé) ;
 *   · sans la 181, tout continue de marcher — et l'écran DIT que les heures ne sont pas gardées,
 *     au lieu de les avaler en silence.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { lirePlage, plageFr } = require('../lib/plageHoraire.js');
const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

test('une plage se lit en entier, ou pas du tout', () => {
    assert.deepStrictEqual(lirePlage('09:00', '12:30'), { debut: '09:00:00', fin: '12:30:00' });
    assert.deepStrictEqual(lirePlage('9:00', '12:30'), { debut: '09:00:00', fin: '12:30:00' }, 'une heure sans zéro de tête reste lisible');
    assert.deepStrictEqual(lirePlage('09:00:00', '12:30:00'), { debut: '09:00:00', fin: '12:30:00' }, 'et la forme que rend la base aussi');

    /* UNE SEULE DES DEUX NE DIT RIEN D'EXPLOITABLE : « il est arrivé à 10 h » n'est pas une
       présence, et la feuille ne saurait qu'en faire. */
    assert.strictEqual(lirePlage('09:00', ''), null);
    assert.strictEqual(lirePlage('', '12:30'), null);
    /* UNE FIN QUI N'EST PAS APRÈS LE DÉBUT donnerait un volume horaire négatif. « 00:00 » est
       justement ce que rend un champ vidé puis revalidé par certains navigateurs. */
    assert.strictEqual(lirePlage('09:00', '09:00'), null);
    assert.strictEqual(lirePlage('14:00', '09:00'), null);
    assert.strictEqual(lirePlage('00:00', '00:00'), null);
    assert.strictEqual(lirePlage('25:00', '26:00'), null, 'une heure qui n’existe pas n’en est pas une');

    /* MÊME ÉCRITURE QUE LA LIGNE « Horaires » de la feuille : deux formes sur le même tableau se
       liraient comme deux informations différentes. */
    assert.strictEqual(plageFr('09:00', '12:30'), '9h00 - 12h30');
    assert.strictEqual(plageFr('14:00', '17:05'), '14h00 - 17h05');
    assert.strictEqual(plageFr('09:00', null), '', 'incomplète : la case reste muette');
});

test('la feuille imprime les heures AU-DESSUS de la signature, et l\'aperçu fait pareil', () => {
    const E = lire('lib/emargement.js');
    assert.match(E, /const cell = \(dataUrl, applies, heures, etat = \{\}\) =>/);
    assert.match(E, /const h = heures \? `<div class="hr">\$\{esc\(heures\)\}<\/div>` : '';/);
    /* AU-DESSUS, PAS À CÔTÉ : une colonne de demi-journée fait 12 à 20 mm, deux informations
       côte à côte n'y tiendraient pas. */
    assert.match(E, /\$\{h\}<img src="\$\{v\}"/, 'les heures précèdent l’image de signature');
    /* ET LA CASE NE GRANDIT PAS : LibreOffice n'honore aucune hauteur de tableau, c'est le
       CONTENU qui la fait — une ligne de plus et la feuille passe sur deux pages. */
    assert.match(E, /const imgH = heures \? Math\.max\(4, sigH - dens\.sub \* 0\.4\) : sigH;/);

    /* UNE SEULE REQUÊTE POUR LES DEUX CHEMINS. Elle vivait en double — la feuille archivée et son
       aperçu — et n'ajouter les heures qu'à l'une aurait donné un aperçu qui ne ressemble pas au
       PDF : le défaut le plus coûteux ici, puisqu'on ne le voit qu'une fois le document signé.
       Depuis le 2026-09-26, TOUT le chargement est commun (`chargerFeuille`) : les intervenants n'y
       sont plus lus qu'une fois, et les deux chemins passent par lui. */
    assert.strictEqual((E.match(/chargerIntervenants\(conn, e\.session_id\)/g) || []).length, 1);
    assert.strictEqual((E.match(/await chargerFeuille\(conn, orgId, enrollmentId\)/g) || []).length, 2,
        'la feuille archivée ET le document signé lisent la même feuille');
    assert.strictEqual((E.match(/JOIN session_intervenant_slot sis ON sis\.session_intervenant_id = si\.id/g) || []).length, 1,
        'la requête des intervenants ne doit plus exister qu’en un exemplaire');
    assert.match(E, /heuresDe: \(k\) => iv\.heures\[k\] \|\| '',/);
    assert.match(E, /p\.heuresDe \? p\.heuresDe\(k\) : ''/);
});

test('sans la 181, les demi-journées marchent — et on le DIT', () => {
    const C = lire('controllers/intervenant.controller.js');
    /* CASCADE SUR ER_BAD_FIELD_ERROR des deux côtés : le code doit rendre la même forme AVANT et
       APRÈS la migration, les heures en moins. */
    assert.match(C, /if \(e && e\.code !== 'ER_BAD_FIELD_ERROR'\) throw e;/);
    assert.match(lire('lib/emargement.js'), /if \(err && err\.code !== 'ER_BAD_FIELD_ERROR'\) throw err;/);
    /* LA DEMI-JOURNÉE EST ENREGISTRÉE QUOI QU'IL ARRIVE : ce qui compte d'abord, c'est qu'il
       était là. Un 503 aurait fait croire que rien n'était passé, et l'école aurait tout
       ressaisi — d'où un message, pas un refus. */
    assert.match(C, /migration 181 n’est pas jouée/);
    assert.match(C, /res\.json\(\{\s*success: true, horaires,/);
    assert.match(C, /const p = lirePlage\(s\.debut, s\.fin\);/, 'la règle vient du lib partagé, pas d’une regex écrite ici');

    /* L'ÉCRAN NE PROPOSE PAS UNE SAISIE QUE L'ENREGISTREMENT JETTERAIT. */
    const UI = lireUi('components/SessionIntervenants.jsx');
    assert.match(UI, /const heuresPossibles = data\?\.horaires !== false;/);
    assert.match(UI, /\{ligne && heuresPossibles && \(/);
    assert.match(UI, /la migration 181 n'est pas jouée/);
});

test('les heures se saisissent SOUS la case cochée, et seulement là', () => {
    const UI = lireUi('components/SessionIntervenants.jsx');
    /* DEUX CHAMPS `time`, pas un texte libre : le clavier d'un téléphone propose alors des
       heures, et le navigateur refuse « 25:00 » avant même l'envoi. */
    assert.strictEqual((UI.match(/<input type="time"/g) || []).length, 2);
    assert.match(UI, /onChange=\{\(e\) => changerHeure\(si, d, h\.slot, "debut", e\.target\.value\)\}/);
    assert.match(UI, /onChange=\{\(e\) => changerHeure\(si, d, h\.slot, "fin", e\.target\.value\)\}/);
    /* COCHER OUVRE LA LIGNE AVEC SES DEUX CHAMPS VIDES : quarante paires de champs sur les
       demi-journées non assurées feraient un mur à ne pas remplir. */
    assert.match(UI, /: \[\.\.\.\(si\.slots \|\| \[\]\), \{ date, slot, debut: "", fin: "" \}\]/);
    /* UN ALLER-RETOUR PAR FRAPPE ferait clignoter la ligne sans rien garder : on écrit quand la
       paire est complète, ou à la sortie du champ. */
    assert.match(UI, /if \(ligne && ligne\.debut && ligne\.fin\) enregistrer/);
    assert.match(UI, /onBlur=\{\(\) => poserHeures\(si\)\}/);
    /* LES DEUX CHAMPS SOUS LA CASE, jamais à côté : la colonne fait la largeur de son intitulé. */
    assert.match(lireUi('styles/app.css'), /\.interv-heures\{display:flex;[^}]*margin-top:3px\}/);
});

test('la 181 ajoute deux colonnes NULLES, et son revert dit ce qu\'il détruit', () => {
    const MIG = path.join(API, '..', '..', 'database', 'migrations');
    const aller = fs.readFileSync(path.join(MIG, '181_intervenant_horaires.sql'), 'utf8');
    assert.match(aller, /ADD COLUMN IF NOT EXISTS heure_debut time DEFAULT NULL/);
    assert.match(aller, /ADD COLUMN IF NOT EXISTS heure_fin   time DEFAULT NULL/);
    /* NULLES PAR DÉFAUT : les demi-journées déjà cochées restent valides et sans heures, et la
       feuille n'invente pas un « 00h00 - 00h00 » pour elles. */
    assert.match(aller, /NULLES PAR DÉFAUT/);
    assert.ok(!/^\s*--/m.test(aller), 'commentaires en blocs');
    assert.ok(!/\\/.test(aller), 'aucune barre oblique inverse');
    const revert = fs.readFileSync(path.join(MIG, '181_revert_intervenant_horaires.sql'), 'utf8');
    assert.match(revert, /CE QUI SE PERD/);
    assert.match(revert, /DROP COLUMN IF EXISTS heure_debut/);
});

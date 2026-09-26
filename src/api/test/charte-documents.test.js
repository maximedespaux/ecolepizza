/**
 * LA CHARTE DES DOCUMENTS — la mise en forme du devis RS7404 retravaillé, étendue aux autres modèles
 * (demandé le 2026-09-26). Les dix modèles ont été rendus en PDF avant et après, et relus page à page ;
 * chaque test ci-dessous gèle un défaut TROUVÉ pendant cette relecture, sur la vraie fonction
 * (lib/charteDocuments.js), ou une garantie de l'outil qui l'applique (database/tools/harmoniser-modeles.js).
 *
 * Les fragments de HTML sont écrits comme l'éditeur les enregistre : un <p> avec interligne et
 * alignement, des <span style="…"> pour la couleur, la police et la taille, <strong>/<u> pour le reste.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../lib/charteDocuments.js');

const BLEU = 'rgb(84, 141, 212)';
const PROFIL = { type: 'charte', corps: 9, interligne: 1.15 };
const p = (inner, style = 'line-height: 1;') => `<p style="${style}">${inner}</p>`;
const s = (texte, style) => `<span style="${style}">${texte}</span>`;
/** Les paragraphes du résultat, dans l'ordre. */
const paragraphes = (html) => html.match(/<(p|h\d)\b[^>]*>[\s\S]*?<\/\1>/g) || [];

test('relu puis réécrit sans changement, un modèle ressort identique À L\'OCTET', () => {
    const html = '<h1 style="line-height: 1;"><span style="color: rgb(191, 0, 0); font-family: &quot;Noto Sans&quot;, sans-serif;"><strong><u>Article 1er</u></strong></span></h1>'
        + '<table data-border="solid" class="tbl-b-solid"><colgroup><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>7</p></th></tr></tbody></table>'
        + '<ul><li><p><span style="font-size: 8pt;">Poste &amp; four</span></p></li></ul><p class="doc-pagebreak" contenteditable="false">&nbsp;</p>'
        + '<p><img src="data:image/png;base64,QUJD" width="120" height="40"><span class="doc-token" contenteditable="false" data-token="field:learner.last_name" data-label="Nom">Nom</span><br></p>';
    assert.strictEqual(C.ecrire(C.lire(html)), html);
});

test('un titre de document SANS AUCUN GRAS prend le titre de la charte — l\'invitation ne rétrécit plus', () => {
    /* LE DÉFAUT : « Invitation à la formation », en Calibri 16 pt et sans gras, était reconnu comme titre
       de document… puis écrit en « accompagnement » (10 pt, noir, maigre) : la règle réservait le titre aux
       passages gras. Le titre de l'invitation sortait à la taille du texte. */
    const html = p(s('Invitation à la formation', 'font-family: Calibri, sans-serif; font-size: 16pt;'), 'line-height: 1; text-align: center;')
        + p(s('Participant (e)', 'font-family: Calibri, sans-serif; font-size: 11pt;'));
    const [titre, texte] = paragraphes(C.harmoniser(html, PROFIL).html);
    assert.match(titre, new RegExp(`color: ${BLEU.replace(/[()]/g, '\\$&')}; font-family: Arial, sans-serif; font-size: 12pt;"><strong>Invitation à la formation`));
    assert.match(texte, /color: rgb\(0, 0, 0\); font-family: Arial, sans-serif; font-size: 9pt;">Participant \(e\)/);
});

test('… et un titre qui MÊLE gras et maigre garde son accompagnement : « PROPOSITION COMMERCIALE », puis « (Offre…) »', () => {
    const html = p(s('<strong>PROPOSITION COMMERCIALE</strong><br>(Offre valable jusqu\'au 02/06/2025)', 'font-family: Arial, sans-serif; font-size: 11pt;'), 'line-height: 1; text-align: center;');
    const [bloc] = paragraphes(C.harmoniser(html, PROFIL).html);
    assert.match(bloc, /font-size: 12pt;"><strong>PROPOSITION COMMERCIALE<br><\/strong><\/span>/);
    assert.match(bloc, /color: rgb\(0, 0, 0\); font-family: Arial, sans-serif; font-size: 10pt;">\(Offre valable/, 'la seconde ligne : 10 pt, noire, maigre');
});

test('LE SOULIGNEMENT S\'ARRÊTE AUX LETTRES — ni l\'espace de tête d\'un libellé, ni celle d\'après les deux-points', () => {
    /* LE DÉFAUT : « _Intitulé de la formation » dans l'annexe 1 de la convention — l'espace insécable de
       tête, maigre et non souligné à l'origine, était pris dans le libellé et souligné avec lui ; et
       « Financement CPF :_ » dans le devis, l'espace d'après les deux-points pris dans le titre. */
    const libelle = C.harmoniser(p(s('&nbsp;<u>Intitulé de la formation</u> : ', 'color: rgb(0, 0, 0); font-family: Arial, sans-serif; font-size: 10pt;')
        + s('<span class="doc-token" contenteditable="false" data-token="field:training_program.title" data-label="Intitulé">Intitulé</span>', 'font-size: 10pt;')), PROFIL).html;
    assert.match(libelle, /<strong>&nbsp;<u>Intitulé de la formation<\/u> : <\/strong>/, 'l\'espace de tête hors du soulignement');
    const titre = C.harmoniser(p(s('<strong><u>Financement CPF</u> :</strong>', `color: ${BLEU}; font-family: Arial, sans-serif; font-size: 10pt;`)
        + s('<strong>&nbsp;</strong>', 'color: rgb(0, 0, 0); font-family: Arial, sans-serif; font-size: 10pt;')), PROFIL).html;
    assert.match(titre, /<strong><u>Financement CPF<\/u> :&nbsp;<\/strong>/, 'l\'espace d\'après les deux-points hors du soulignement');
});

test('… mais une LIGNE À REMPLIR, soulignée à l\'origine, le reste', () => {
    const html = C.harmoniser(p(s('<strong>Signature :</strong> <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>', 'font-family: Arial, sans-serif; font-size: 10pt;')), PROFIL).html;
    assert.match(html, /<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<\/u>/);
});

test('un AVERTISSEMENT rouge reste rouge, et n\'est pas pris pour un titre parce qu\'il est en h2', () => {
    /* Les lignes CPF du devis : rouges, en h2 — et finies par un point. Un titre ne finit pas par un point ;
       un sous-titre non plus : une phrase rouge de moins de 80 caractères devenait un sous-titre BLEU. */
    const html = C.harmoniser('<h2 style="line-height: 1.2;"><span style="color: rgb(255, 0, 0); font-family: Arial, sans-serif; font-size: 8pt;">Cette formation est financée dans le cadre du CPF.</span></h2>', PROFIL).html;
    assert.match(html, /^<p style="line-height: 1\.15;"><span style="color: rgb\(255, 0, 0\); font-family: Arial, sans-serif; font-size: 9pt;"><strong>Cette formation/,
        'un paragraphe (plus un titre), rouge, gras comme le h2 le rendait');
});

test('un renvoi BLEU non gras (« Voir l\'annexe 2 ») est du texte : il prend le bleu de la charte, sans devenir un titre', () => {
    const html = C.harmoniser(p(s('Voir l’annexe 2', 'color: rgb(74, 134, 232); font-family: Arial, sans-serif; font-size: 10pt;')), PROFIL).html;
    assert.match(html, new RegExp(`color: ${BLEU.replace(/[()]/g, '\\$&')}; font-family: Arial, sans-serif; font-size: 9pt;">Voir`));
    assert.doesNotMatch(html, /<strong>|<u>/);
});

test('une SURCHARGE de profil peut exiger le gras : le même intitulé est titre en gras, texte en maigre', () => {
    /* La convention imprime {Intitulé de la formation} deux fois : en maigre dans l'article 1, en gras 12 pt
       en tête du programme (annexe 2). Seul le second est un titre. */
    const jeton = '<span class="doc-token" contenteditable="false" data-token="field:training_program.title" data-label="Intitulé">Intitulé</span>';
    const html = p(s(jeton, 'font-size: 10pt;'), 'line-height: 1; text-align: center;') + p(s(`<strong>${jeton}</strong>`, 'font-size: 12pt;'), 'line-height: 1; text-align: center;');
    const profil = { ...PROFIL, surcharges: [{ si: /^\{field:training_program\.title\}$/, gras: true, role: 'titreDocument' }] };
    const r = C.harmoniser(html, profil);
    assert.deepStrictEqual(r.roles.map((x) => x.role), ['corps', 'titreDocument']);
});

test('LES SAUTS DE PAGE : seuls ceux que le profil nomme sont retirés ou posés — et le contrôle le sait', () => {
    const saut = '<p class="doc-pagebreak" contenteditable="false">&nbsp;</p>';
    const html = p('Un') + saut + p(s('<strong>Propriété intellectuelle</strong>', 'font-size: 7pt;')) + saut + p('Deux')
        + p(s('<strong>Financement par le CPF</strong>', 'font-size: 7pt;'))
        + '<table><tbody><tr><td><p>Financement par le CPF</p></td></tr></tbody></table>';
    const profil = { type: 'charte', corps: 8, sautsRetires: [/^Propriété intellectuelle$/], sautsAjoutes: [/^Financement par le CPF$/] };
    const r = C.harmoniser(html, profil);
    assert.strictEqual(r.sautsRetires, 1, 'le saut d\'avant « Propriété intellectuelle », pas celui d\'avant « Deux »');
    assert.strictEqual(r.sautsAjoutes, 1, 'posé devant le paragraphe, jamais dans le tableau');
    assert.strictEqual((r.html.match(/doc-pagebreak/g) || []).length, 2);
    assert.ok(r.html.indexOf(saut) < r.html.indexOf('Deux') && r.html.indexOf('Deux') < r.html.lastIndexOf(saut));
    // La référence du contrôle porte les mêmes sauts : contenu et charpente y sont identiques.
    const reference = C.sansSauts(html, profil);
    assert.strictEqual(C.charpente(reference), C.charpente(r.html));
    assert.strictEqual(C.contenu(reference), C.contenu(r.html));
    assert.notStrictEqual(C.charpente(html), C.charpente(r.html), 'et sans elle, la différence se verrait');
    // Un bloc nommé qui ne vit QUE dans un tableau ne reçoit pas de saut : il couperait la ligne du tableau.
    const seulDansUnTableau = C.harmoniser('<table><tbody><tr><td><p>Financement par le CPF</p></td></tr></tbody></table>', profil);
    assert.strictEqual(seulDansUnTableau.sautsAjoutes, 0);
    assert.doesNotMatch(seulDansUnTableau.html, /doc-pagebreak/);
});

test('un modèle IMPOSÉ (profil « police ») ne change que de police — corps et pied', () => {
    const corps = p(s('<strong>CERTIFICAT DE REALISATION</strong>', 'color: rgb(0, 0, 153); font-family: Calibri, sans-serif; font-size: 14pt;'), 'text-align: center;');
    const r = C.harmoniser(corps, { type: 'police' }).html;
    assert.strictEqual(r, p(s('<strong>CERTIFICAT DE REALISATION</strong>', 'color: rgb(0, 0, 153); font-family: Arial, sans-serif; font-size: 14pt;'), 'text-align: center;'));
    const pied = p(s('101 rue Alsace Lorraine', 'color: rgb(0, 0, 0); font-family: Calibri, sans-serif; font-size: 10pt;'));
    assert.match(C.harmoniserPied(pied, { type: 'police' }).html, /color: rgb\(0, 0, 0\); font-family: Arial, sans-serif; font-size: 10pt;/);
    assert.match(C.harmoniserPied(pied, PROFIL).html, /"font-family: Arial, sans-serif; font-size: 8pt;"/, 'la charte, elle, pose 8 pt sans couleur');
});

test('la mention de version : 8 pt, gris, maigre — et le texte, les jetons, la charpente ne bougent jamais', () => {
    const html = p(s('<strong>V1.0 Mise à jour le 14/01/2026</strong>', 'color: rgb(74, 134, 232); font-family: Carlito, sans-serif; font-size: 10pt;'), 'text-align: right;')
        + p(s('<strong><u>Objet, durée et effectif</u></strong>', 'color: rgb(255, 0, 0); font-size: 10pt;'))
        + '<ul><li><p>' + s('Poste de travail individuel', 'font-size: 11pt;') + '</p></li></ul>';
    const r = C.harmoniser(html, PROFIL).html;
    assert.match(r, /color: rgb\(128, 128, 128\); font-family: Arial, sans-serif; font-size: 8pt;">V1\.0 Mise à jour/);
    assert.strictEqual(C.contenu(r), C.contenu(html));
    assert.strictEqual(C.charpente(r), C.charpente(html));
});

/* ── L'OUTIL : ce qui s'écrit est ce qui a été relu ─────────────────────────────────────────────────── */
let table = [];
let journal = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            journal.push(q.split(' ')[0]);
            if (q.startsWith('SELECT slug, label, kind, deleted, body_html, footer_html FROM document_template')) {
                return [table.filter((l) => l.organization_id === params[0] && params[1].includes(l.slug)).map((l) => ({ ...l }))];
            }
            if (q.startsWith('UPDATE document_template SET body_html = ?, footer_html = ?')) {
                const [corps, pied, org, slug, corpsLu, piedLu] = params;
                const l = table.find((x) => x.organization_id === org && x.slug === slug);
                // Le garde-fou est DANS la requête : on vérifie qu'il y est, puis on le joue.
                assert.match(q, /CAST\(body_html AS BINARY\) = CAST\(\? AS BINARY\) AND CAST\(COALESCE\(footer_html, ''\) AS BINARY\) = CAST\(\? AS BINARY\)/);
                if (!l || l.body_html !== corpsLu || (l.footer_html || '') !== piedLu) return [{ affectedRows: 0 }];
                Object.assign(l, { body_html: corps, footer_html: pied });
                return [{ affectedRows: 1 }];
            }
            return [[]];
        },
    }),
    end: async () => {},
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const outil = require('../../../database/tools/harmoniser-modeles.js');

const ORG = { id: 'org1', code: 'EP' };
const DROIT = p(s('<strong>Objet et champ</strong>', 'color: rgb(74, 134, 232); font-family: Arial, sans-serif; font-size: 7pt;'))
    + p(s('Toute action de formation <img src="data:image/png;base64,QUJD" width="10" height="10"> implique…', 'font-family: Arial, sans-serif; font-size: 7pt;'));
function relu() {
    // Les empreintes de ce modèle-ci, calculées comme l'outil les calcule : l'état lu, et le résultat.
    const h = outil.harmoniserModele('droit-image', { body_html: DROIT, footer_html: null });
    return { 'droit-image': [{ avant: [outil.empreinte(DROIT), outil.empreinte(null)], apres: [outil.empreinte(h.corps), outil.empreinte(h.pied)] }] };
}
const neuf = () => [{ organization_id: 'org1', slug: 'droit-image', label: 'Droit à l\'image', kind: 'builder', deleted: 0, body_html: DROIT, footer_html: null }];

test('L\'OUTIL n\'écrit QUE la version relue : modifiée depuis, elle est ignorée ; déjà harmonisée, reconnue', async () => {
    table = neuf();
    const conn = faux.promise();
    let [e] = await outil.examiner(conn, { organisme: ORG, slugs: ['droit-image'], relu: relu() });
    assert.strictEqual(e.etat, 'pret');
    assert.strictEqual(e.apres.footer_html, null, 'un pied NULL le reste — on n\'écrit pas \'\' à sa place');
    table[0].body_html += p('ajout de l\'école');
    [e] = await outil.examiner(conn, { organisme: ORG, slugs: ['droit-image'], relu: relu() });
    assert.strictEqual(e.etat, 'ignore');
    assert.match(e.raison, /modifié depuis la relecture/);
    table = neuf();
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'charte-'));
    const { bilan } = await outil.appliquer(conn, { organisme: ORG, slugs: ['droit-image'], dossier, relu: relu() });
    assert.deepStrictEqual(bilan.ecrits, ['droit-image']);
    [e] = await outil.examiner(conn, { organisme: ORG, slugs: ['droit-image'], relu: relu() });
    assert.strictEqual(e.etat, 'deja', 'relancer ne fait rien');
});

test('L\'OUTIL sauvegarde AVANT d\'écrire, n\'écrase pas un enregistrement fait entre-temps, et sait revenir', async () => {
    table = neuf();
    journal = [];
    const conn = faux.promise();
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'charte-'));
    // Un enregistrement depuis l'éditeur ENTRE la lecture et l'écriture : la requête le voit.
    const avant = conn.query;
    let sauvegardesAvantUpdate = null;
    conn.query = async (sql, params) => {
        if (/^UPDATE/.test(sql.trim())) {
            sauvegardesAvantUpdate = fs.readdirSync(dossier).length;
            table[0].body_html = DROIT + p('enregistré à l\'instant');
        }
        return avant(sql, params);
    };
    let r = await outil.appliquer(conn, { organisme: ORG, slugs: ['droit-image'], dossier, relu: relu() });
    assert.deepStrictEqual(r.bilan.ecrits, []);
    assert.match(r.bilan.sautes[0].raison, /non écrasé/);
    assert.match(table[0].body_html, /enregistré à l'instant/);
    // La sauvegarde est partie AVANT la tentative d'écriture, en 600, et sans écraser une autre.
    const f = r.sauvegarde;
    assert.ok(fs.existsSync(f));
    assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
    assert.deepStrictEqual(journal, ['SELECT', 'UPDATE']);
    assert.strictEqual(sauvegardesAvantUpdate, 1, 'la sauvegarde existait déjà quand la première écriture est partie');
    // Et l'aller-retour : appliquer, puis restaurer, rend le modèle d'origine à l'octet.
    table = neuf();
    const conn2 = faux.promise();
    r = await outil.appliquer(conn2, { organisme: ORG, slugs: ['droit-image'], dossier, relu: relu(), maintenant: new Date(Date.now() + 1000) });
    assert.notStrictEqual(table[0].body_html, DROIT);
    const b = await outil.restaurer(conn2, { sauvegarde: JSON.parse(fs.readFileSync(r.sauvegarde, 'utf8')) });
    assert.deepStrictEqual(b.restaures, ['droit-image']);
    assert.strictEqual(table[0].body_html, DROIT);
    assert.strictEqual(table[0].footer_html, null);
});

test('L\'OUTIL : dix modèles, chacun avec son profil ET sa version relue — les six modèles imposés n\'y sont pas', () => {
    const attendus = ['devis-rs7404', 'devis-particulier', 'devis-professionnel-copie', 'convention', 'contrat', 'contrat-hygiene', 'cgv', 'invitation', 'droit-image', 'attestation-hygiene'];
    assert.deepStrictEqual(Object.keys(outil.PROFILS).sort(), [...attendus].sort());
    assert.deepStrictEqual(Object.keys(outil.RELU).sort(), [...attendus].sort());
    for (const imposes of ['attestation-assiduite', 'certificat-realisation', 'grille-jury', 'pv-jury', 'facture-entreprise', 'facture-stagiaire']) {
        assert.ok(!outil.PROFILS[imposes], `${imposes} s'imprime déjà en Arial : il n'est pas réécrit`);
    }
    // Les quatre modèles que la migration 183 réécrit ont leurs deux états.
    for (const slug of ['devis-particulier', 'devis-professionnel-copie', 'convention', 'contrat']) assert.strictEqual(outil.RELU[slug].length, 2, slug);
});

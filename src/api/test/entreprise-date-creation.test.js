const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const CTRL = readFileSync(path.join(__dirname, '../controllers/company.controller.js'), 'utf8');
const LISTE = readFileSync(path.join(__dirname, '../../app/ui/pages/Entreprises.jsx'), 'utf8');
const FICHE = readFileSync(path.join(__dirname, '../../app/ui/pages/EntrepriseDetail.jsx'), 'utf8');

test('la date affichée est celle du KBIS, pas celle de la fiche', () => {
    /* LE MALENTENDU QUI A COÛTÉ UN ALLER-RETOUR. Une première version affichait
       `company.created_at` — la date d'ENTRÉE DE LA FICHE dans l'application. Ça n'intéresse
       personne : les quatre cent soixante et onze entreprises importées portent toutes le
       12/07/2026 à 15:44, à la seconde près. Ce que l'école demande, et ce qu'exigent une
       convention, un dossier OPCO ou un contrôle, c'est la date d'IMMATRICULATION.

       Les deux dates portent maintenant des mots distincts — et une seule s'affiche. */
    assert.ok(!/cree_le/.test(CTRL), 'le serveur n\'expose plus la date d\'entrée de la fiche');
    assert.ok(!/cree_le/.test(LISTE) && !/cree_le/.test(FICHE), 'les écrans non plus');
    assert.match(LISTE, /enTete\("date_creation", "Date de création"\)/, 'colonne triable dans la liste');
    assert.match(FICHE, /\{ k: "date_creation", label: "Date de création", type: "date" \}/, 'champ sur la fiche');
    assert.match(LISTE, /date_creation: ""/, '…et à la création d\'une entreprise');
});

test('la colonne peut ne pas être là — le code marche avant ET après la 159', () => {
    /* Même idiome que `vat_number` (migration 123) : écrire une colonne absente ferait échouer
       TOUTE la création d'entreprise en ER_BAD_FIELD_ERROR — on perdrait la fiche entière pour
       un champ facultatif. La liste, elle, passe par `colonneOuNull`, qui rend
       « NULL AS date_creation » : l'écran reçoit toujours la même forme d'objet. */
    assert.match(CTRL, /const COMPANY_COLS_OPT = \['vat_number', 'date_creation'\];/);
    assert.match(CTRL, /colonneOuNull\(conn, 'company', 'date_creation', 'c\.'\)/);
    /* Sonder information_schema demande d'attendre : le gestionnaire de liste était en style
       rappel, où `await` est une erreur de syntaxe — pas un défaut d'exécution qu'on verrait
       en testant, le fichier entier refusait de se charger. */
    assert.match(CTRL, /const getCompanies = async \(req, res\) =>/);
});

test('un champ « date » reste vide si on lui donne la forme longue', () => {
    /* DEUX PIÈGES SILENCIEUX, tous deux sans message d'erreur :

       1. `type` n'était passé qu'au `select` : un champ déclaré « date » serait resté une zone
          de texte libre, sans calendrier ni contrôle de forme ;
       2. une colonne `DATE` revient du pilote en « 2020-03-15T00:00:00.000Z », pas en
          « 2020-03-15 ». Un `<input type="date">` nourri de la forme longue s'affiche VIDE —
          on rouvre une fiche et la date qu'on vient d'enregistrer a l'air perdue. */
    assert.match(FICHE, /type=\{type \|\| "text"\}/, 'le type déclaré atteint l\'input');
    assert.match(FICHE, /date_creation: d\.date_creation \? String\(d\.date_creation\)\.slice\(0, 10\) : ""/,
        'la valeur du formulaire est tronquée à « aaaa-mm-jj »');
    /* L'AFFICHAGE, lui, ne tronque pas : `dateFr` sait lire la forme longue et rend 15/03/2020. */
    assert.match(FICHE, /créée le \$\{dateFr\(data\.date_creation\)\}/);
    assert.match(LISTE, /dateFr\(c\.date_creation\)/);
});

test('un champ vidé efface la date au lieu d\'écrire une date nulle', () => {
    // Un `<input type="date">` vidé envoie la chaîne vide, que MariaDB range en '0000-00-00'
    // ou refuse selon son mode strict. Inconnue veut dire NULL.
    assert.match(CTRL, /out\.date_creation = String\(out\.date_creation\)\.trim\(\) \|\| null;/);
});

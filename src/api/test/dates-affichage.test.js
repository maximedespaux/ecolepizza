/**
 * UNE DATE AFFICHÉE PASSE PAR `dateHeure`, TOUJOURS.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, SIGNALÉ PAR L'ÉCOLE : le tableau de bord affichait « 2026-08-21 14:32 » sous
 * « Activité récente ». Ce n'est pas une coquille isolée — c'est le format que le SERVEUR envoie,
 * et c'est délibéré de sa part : `DATE_FORMAT(…, '%Y-%m-%d %H:%i')` produit une chaîne qui se
 * TRIE par comparaison de texte. En `jj-mm-aaaa`, le 31 janvier passerait devant le 1er décembre.
 * L'ISO est donc le bon format de TRANSPORT, et `format.js` le dit déjà en toutes lettres.
 *
 * Le défaut est de l'oublier à l'AFFICHAGE. Vingt-neuf rendus le faisaient, sur treize écrans :
 * tableau de bord, notifications, notes, émargement, suivi, fiches stagiaire et entreprise,
 * espace stagiaire, journal des transmissions, QCM, consentement. Chacun pris isolément passe
 * pour un oubli ; ensemble, ils montraient un ISO à l'utilisateur sur la moitié de l'application.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE EST LISIBLE DANS LA SYNTAXE, et c'est ce qui la rend testable : une interpolation
 * précédée de `=` est une VALEUR TRANSMISE, jamais un affichage. Trois familles en dépendent, et
 * toutes trois CASSERAIENT si on les formatait :
 *
 *   • `value={form.birthday}` — un `<input type="date">` n'accepte QUE `aaaa-mm-jj`. Lui donner
 *     « 21-08-2026 » vide le champ, en silence ;
 *   • `startDate={session.start_date}` — sert à `businessDays()` et à interroger l'API ;
 *   • `date={post.created_at}` — le composant qui la reçoit appelle `dateHeure` lui-même.
 *
 * Tout le reste — `{x.created_at}` en JSX, `${x.signed_at}` dans un gabarit — est du texte lu par
 * quelqu'un, et doit donc être formaté.
 *
 * ⚠ CE TEST LIT LE SOURCE. Ajouter un champ de date au serveur oblige à l'ajouter à `CHAMPS`
 * ci-dessous, sinon la règle ne le couvre pas. C'est voulu : la liste est le contrat.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');

/* Les colonnes que le serveur renvoie en ISO — relevé sur les `DATE_FORMAT` des contrôleurs. */
const CHAMPS = ['created_at', 'updated_at', 'signed_at', 'sent_at', 'decide_at', 'depose_le',
    'verifie_le', 'completed_at', 'reminder_at', 'pickup_at', 'due_date', 'contrat_debut',
    'contrat_fin', 'birthday', 'start_date', 'end_date', 'trainer_signed_at', 'repondu_lui_meme'];

const EXPR = String.raw`[A-Za-z_$][\w$]*(?:\?\.|\.)[\w$.?]*\b(?:` + CHAMPS.join('|') + ')';
/* `(?<!=)` : on laisse passer les valeurs d'attribut — cf. les trois familles en tête. */
const BRUT = new RegExp(String.raw`(?<![=$])\$?\{\s*(${EXPR})\s*\}`, 'g');

/** Tous les .jsx de l'interface, chemin relatif à `ui/`. */
function fichiersJsx(dir = UI, base = '') {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) out.push(...fichiersJsx(path.join(dir, e.name), rel));
        else if (e.name.endsWith('.jsx')) out.push(rel);
    }
    return out;
}

test("aucune date n'est affichée au format ISO du serveur", () => {
    const fautifs = [];
    for (const rel of fichiersJsx()) {
        const src = fs.readFileSync(path.join(UI, rel), 'utf8');
        src.split('\n').forEach((ligne, i) => {
            for (const m of ligne.matchAll(BRUT)) fautifs.push(`${rel}:${i + 1} → ${m[1]}`);
        });
    }
    assert.deepStrictEqual(fautifs, [],
        'Ces dates sortiraient en « 2026-08-21 14:32 » : les passer par `dateHeure` de lib/format.js.');
});

test("les valeurs transmises, elles, RESTENT en ISO", () => {
    /* Le pendant du test précédent, et il compte autant : une correction trop large casserait
       ces trois-là sans qu'aucun test ne s'en aperçoive — un `<input type="date">` nourri de
       « 21-08-2026 » s'affiche simplement VIDE, sans erreur ni message. */
    const champ = fs.readFileSync(path.join(UI, 'components/EditStagiaireModal.jsx'), 'utf8');
    assert.match(champ, /type="date" value=\{form\.birthday\}/,
        'Un <input type="date"> n\'accepte que aaaa-mm-jj.');

    const session = fs.readFileSync(path.join(UI, 'pages/SessionDetail.jsx'), 'utf8');
    assert.match(session, /startDate=\{session\.start_date\} endDate=\{session\.end_date\}/,
        'Ces bornes servent au calcul des jours ouvrés et à la requête, pas à l\'affichage.');

    const post = fs.readFileSync(path.join(UI, 'components/QuestionPost.jsx'), 'utf8');
    assert.match(post, /date=\{post\.created_at\}/, 'Le composant destinataire formate lui-même…');
    assert.match(post, /\{dateHeure\(date\)\}/, '…et c\'est ici qu\'il le fait.');
});

test('une date affichée est au format FRANÇAIS : jj/mm/aaaa', () => {
    /* DÉFAUT SIGNALÉ PAR L'ÉCOLE, sur la fiche stagiaire. Elle y lisait TROIS formats à la fois :
         · « 1987-03-12 »       — la date de naissance et « Contact le », tronquées par un `d10`
                                  local qui avait l'air de formater et ne faisait que couper ;
         · « 12-03-1987 »       — `dateHeure`, qui n'est le format d'AUCUN pays : ni l'ISO
                                  (1987-03-12), ni le français (12/03/1987) ;
         · « 12/03/1987 »       — un helper `fr` défini dans une cellule de tableau, seul à
                                  rendre le bon format, et par `new Date(iso)` — donc en UTC.
       Trois rendus, trois résultats, un seul écran. */
    const fmt = fs.readFileSync(path.join(UI, 'lib/format.js'), 'utf8');
    assert.match(fmt, /return `\$\{p\.j\}\/\$\{p\.mo\}\/\$\{p\.a\}`/, 'dateFr rend jj/mm/aaaa');
    assert.match(fmt, /return `\$\{p\.j\}\/\$\{p\.mo\}\/\$\{p\.a\}` \+ \(p\.h \? ` \$\{p\.h\}:\$\{p\.mi\}` : ""\)/,
        'dateHeure aussi, l\'heure en plus');
    assert.ok(!/\$\{j\}-\$\{mo\}-\$\{a\}/.test(fmt), 'plus de tiret : ce n\'était le format de personne');
});

test('les DEUX rendus jj/mm/aaaa donnent exactement la même chose', async () => {
    /* `lib/contrat.js` a sa propre implémentation (`frISO`) et LA GARDE — j'ai essayé de la
       remplacer par un import de `dateFr`, et ça casse `contrat-partenaire.test.js` en entier :
       ce test lit le fichier comme du TEXTE et l'évalue par `new Function`, seul moyen d'éprouver
       le vrai calcul du navigateur depuis des tests CommonJS. Un `import` en tête et tout tombe
       sur « Cannot use import statement outside a module ».

       La duplication est donc SUBIE, pas choisie. Ce qui la rendrait dangereuse, c'est son
       silence : on corrigerait l'une, l'autre continuerait. On compare donc les deux sur des
       entrées réelles — y compris les vides et les formes inattendues, là où deux
       implémentations « équivalentes » cessent le plus souvent de l'être. */
    const { dateFr } = await import('../../app/ui/lib/format.js');
    const { frISO } = await import('../../app/ui/lib/contrat.js');
    for (const v of ['2027-01-15', '2026-08-01 14:32', '2026-08-01T09:05', '', null, undefined]) {
        assert.strictEqual(frISO(v), dateFr(v), `divergence sur ${JSON.stringify(v)}`);
    }
    assert.strictEqual(dateFr('2027-01-15'), '15/01/2027');
});

test('la fiche stagiaire n\'a plus de raccourci local qui rend de l\'ISO', () => {
    /* `d10(l.birthday)` PASSAIT AU TRAVERS du garde-fou ci-dessus : celui-ci interdit d'afficher
       un champ de date brut (`{l.birthday}`), mais ne voit pas un appel de fonction — qui, lui,
       a l'air de formater. Le contournement était involontaire et c'est bien ce qui le rend
       durable : rien ne le signalait. */
    const fiche = fs.readFileSync(path.join(UI, 'pages/StagiaireDetail.jsx'), 'utf8');
    assert.ok(!/const d10 = /.test(fiche), 'le raccourci est supprimé');
    assert.ok(!/d10\(/.test(fiche), '…et plus appelé nulle part');
    assert.ok(!/toLocaleDateString/.test(fiche), 'ni de `new Date(iso)`, qui se lit en UTC');
    assert.match(fiche, /value=\{dateFr\(l\.birthday\)\}/);
    assert.match(fiche, /value=\{dateFr\(l\.contacted_at\)\}/);
});

test('les champs de SAISIE gardent l\'ISO — le défaut inverse', () => {
    /* `dateOnly` dans la modale ressemble à `d10` et DOIT rester tel quel : il alimente des
       `<input type="date">`, qui n'acceptent que `aaaa-mm-jj`. Lui appliquer le format français
       viderait les champs « Date de naissance » et « Contact le » en SILENCE — pas d'erreur, pas
       de message, juste une case vide au moment de rouvrir une fiche. Le voir un jour et le
       « corriger » par symétrie est un piège évident : ce test est là pour ça. */
    const modale = fs.readFileSync(path.join(UI, 'components/EditStagiaireModal.jsx'), 'utf8');
    assert.match(modale, /const dateOnly = \(v\) => \(v \? String\(v\)\.slice\(0, 10\) : ""\);/);
    assert.match(modale, /form\.birthday = dateOnly\(d\.birthday\);/);
    assert.ok(!/dateFr\(/.test(modale), 'aucune date française ne doit entrer dans un champ de saisie');
});

test('aucune date STOCKÉE n\'est rendue par `new Date(…).toLocaleDateString`', () => {
    /* LE PIÈGE, écrit noir sur blanc dans lib/contrat.js après l'avoir subi : `new Date('2027-01-15')`
       se lit en UTC, et l'affichage se fait en heure LOCALE — sur tout fuseau négatif, la date
       recule d'un jour. Afficher la veille d'une échéance de contrat, ou une naissance au 11 mars
       quand la base dit le 12, est le genre d'erreur qu'on ne remarque qu'en la subissant.

       Quatre endroits le faisaient encore : la fiche stagiaire, l'aperçu d'un document, la
       comptabilité, les apports partenaires et les demandes boutique. Ils rendaient le BON
       format — c'est ce qui les rendait invisibles.

       `new Date()` SANS ARGUMENT reste permis : c'est la date du jour, prise à l'heure locale,
       sans chaîne à interpréter (cf. EmargementEditor, qui date le document qu'il compose). */
    const fautifs = [];
    for (const rel of fichiersJsx()) {
        const src = fs.readFileSync(path.join(UI, rel), 'utf8');
        src.split('\n').forEach((ligne, i) => {
            /* Les lignes de COMMENTAIRE sont ignorées : `format.js` et `contrat.js` citent le
               motif pour en avertir, et un test qui condamne son propre avertissement finit
               par faire supprimer l'avertissement. */
            if (/^\s*(\*|\/\/|\/\*)/.test(ligne)) return;
            const m = /new Date\(([^)]+)\)\.toLocaleDateString/.exec(ligne);
            /* `T00:00:00` force la lecture en heure LOCALE : c'est ce qui rend l'appel sûr, et
               c'est donc lui qu'on exige — pas l'absence de `new Date`, qui condamnerait les
               rendus « lundi 14 septembre » que `dateFr` ne sait pas produire. */
            if (m && !/T00:00:00/.test(m[1])) fautifs.push(`${rel}:${i + 1}`);
        });
    }
    assert.deepStrictEqual(fautifs, [], 'passer par `dateFr` de lib/format.js, qui découpe la chaîne');
});

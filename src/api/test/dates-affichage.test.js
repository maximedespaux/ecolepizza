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

/**
 * TOUT CODE JOURNALISÉ DOIT SE LIRE EN FRANÇAIS — y compris ceux fabriqués à l'exécution.
 *
 * LE DÉFAUT : « partner.destinataire.non » s'affichait tel quel dans le journal et, depuis que
 * l'activité alimente la cloche, sur l'écran de tout le personnel. Ça ne veut rien dire. Trois
 * points d'appel construisent leur code au vol (`consent.${accorde ? … }`), donc échappent à
 * toute table exhaustive : c'est la règle par PRÉFIXE qui les rattrape.
 *
 * PIRE QUE L'ILLISIBLE, LE FAUX : `partner_disclosure.create` se lisait « Partenaire créé »,
 * mot pour mot le libellé de `partner.create`. Or c'est l'ENVOI EFFECTIF des coordonnées de
 * stagiaires à une entreprise — l'événement RGPD le plus lourd du journal, rendu indiscernable
 * d'une création de fiche. Un test qui vérifie seulement « ça ne rend pas le code brut » aurait
 * laissé passer ; d'où les assertions nominatives qui suivent.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CTRL = path.join(__dirname, '..', 'controllers');
const AUDIT_LABELS = path.join(__dirname, '..', '..', 'app/ui/lib/auditLabels.js');
const charger = () => import(`file://${AUDIT_LABELS}`);

/** Tous les codes possibles, littéraux ET développés depuis les gabarits. */
function tousLesCodes() {
    const out = new Map(); // code -> entité
    for (const f of fs.readdirSync(CTRL).filter((f) => f.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(CTRL, f), 'utf8');
        for (const m of src.matchAll(/logAudit\(\s*req\s*,\s*'([^']+)'\s*(?:,\s*'([^']+)')?/g)) {
            out.set(m[1], m[2] || null);
        }
        /* Les codes en gabarit : un ternaire de deux littéraux est DÉVELOPPÉ (deux codes réels),
           toute autre interpolation devient un jeton quelconque — c'est le cas qui exige une
           règle par préfixe, puisque la valeur n'est connue qu'à l'exécution. */
        for (const m of src.matchAll(/logAudit\(\s*req\s*,\s*`([^`]+)`\s*(?:,\s*'([^']+)')?/g)) {
            let formes = [m[1]];
            const ternaire = /\$\{[^}]*\?\s*'([^']+)'\s*:\s*'([^']+)'\}/;
            let t;
            while ((t = ternaire.exec(formes[0]))) {
                formes = formes.flatMap((f) => [f.replace(ternaire, t[1]), f.replace(ternaire, t[2])]);
            }
            for (const f2 of formes) out.set(f2.replace(/\$\{[^}]*\}/g, 'valeurQuelconque'), m[2] || null);
        }
    }
    return out;
}

test('aucun code journalisé ne s\'affiche en code brut', async () => {
    const { auditLabel } = await charger();
    const codes = tousLesCodes();
    assert.ok(codes.size > 85, `on attend ~90 codes, trouvé ${codes.size}`);

    const bruts = [...codes].filter(([code, ent]) => auditLabel(code, ent).label === code);
    assert.deepStrictEqual(bruts.map(([c]) => c), [], 'ces codes n\'ont aucun libellé');
    // Et les trois familles à code variable sont bien couvertes par la règle de préfixe.
    for (const c of ['consent.accorde.partenaires', 'consent.refuse.partenaires', 'consent.accorde.x.espace']) {
        assert.notStrictEqual(auditLabel(c, null).label, c, `${c} devrait être lisible`);
    }
});

test('deux événements DIFFÉRENTS ne portent pas le même libellé', async () => {
    const { auditLabel } = await charger();
    const vus = new Map();
    for (const [code, ent] of tousLesCodes()) {
        const { label } = auditLabel(code, ent);
        // `CREATE`/`UPDATE`/`DELETE` sont volontairement génériques : leur sens vient de
        // l'entité passée à côté (quest_question, quest_chapter…), pas du code.
        if (['CREATE', 'UPDATE', 'DELETE'].includes(code)) continue;
        /* Les familles à préfixe partagent un libellé À DESSEIN : « consentement accordé » est
           UN événement, enregistré depuis deux entrées (l'espace stagiaire et l'écran de
           consentement), avec la finalité collée au code. Ce que ce test traque, ce sont deux
           événements DIFFÉRENTS confondus — pas un même événement écrit deux fois. */
        if (code.startsWith('consent.')) continue;
        assert.ok(!vus.has(label), `« ${label} » sert à la fois à ${vus.get(label)} et à ${code}`);
        vus.set(label, code);
    }
});

test('la transmission de coordonnées ne se lit pas « Partenaire créé »', async () => {
    const { auditLabel } = await charger();
    const envoi = auditLabel('partner_disclosure.create', 'Partner').label;
    assert.notStrictEqual(envoi, auditLabel('partner.create', 'Partner').label);
    assert.match(envoi, /transmis/i, 'le libellé doit dire qu\'il y a eu ENVOI de données');
    // Et le fait de désigner un destinataire se lit, dans les deux sens.
    assert.match(auditLabel('partner.destinataire.oui', 'Partner').label, /destinataire/i);
    assert.match(auditLabel('partner.destinataire.non', 'Partner').label, /retiré/i);
});

test('un TYPE de pièce n\'est pas une pièce déposée', async () => {
    const { auditLabel } = await charger();
    // « Pièce justificative créée » laissait croire qu'un stagiaire venait d'en déposer une.
    assert.match(auditLabel('piecetype.create', 'PieceType').label, /^Type de pièce/);
    assert.match(auditLabel('piece.depot', 'PieceDepot').label, /déposée/);
});

test('le journal parle la langue de l\'interface : QCM, pas Quiz', async () => {
    const { auditLabel } = await charger();
    for (const c of ['quiz.create', 'quiz.save', 'quiz.send', 'quiz.submit']) {
        const { label } = auditLabel(c, 'Quiz');
        assert.match(label, /QCM/, `${c} doit dire QCM`);
        assert.doesNotMatch(label, /Quiz/, `${c} ne doit plus dire « Quiz »`);
    }
});

test('la création d\'un stagiaire et d\'une entreprise est journalisée', async () => {
    /* Elles ne l'étaient PAS. Le journal couvrait les factures, les modèles, les partenaires —
       pas la fiche autour de laquelle tourne l'application : aucune trace de qui a créé ou
       supprimé qui, et la cloche muette sur l'événement le plus courant de la journée. */
    const L = fs.readFileSync(path.join(CTRL, 'learner.controller.js'), 'utf8');
    const C = fs.readFileSync(path.join(CTRL, 'company.controller.js'), 'utf8');
    for (const [src, quoi] of [[L, 'learner'], [C, 'company']]) {
        for (const geste of ['create', 'update', 'delete']) {
            assert.match(src, new RegExp(`logAudit\\(req, '${quoi}\\.${geste}'`), `${quoi}.${geste} doit être journalisé`);
        }
    }
    // L'identifiant doit accompagner la création, sinon la trace ne dit pas LEQUEL.
    assert.match(L, /const learnerId = crypto\.randomUUID\(\)/, 'l\'id est tiré côté serveur…');
    assert.match(L, /logAudit\(req, 'learner\.create', 'Learner', learnerId\)/, '…et joint à la trace');

    const { sectionDeLEntite } = require('../lib/activite.js');
    assert.strictEqual(sectionDeLEntite('Company'), '/entreprises', 'sinon l\'entreprise n\'est visible que des propriétaires');
    assert.strictEqual(sectionDeLEntite('Learner'), '/stagiaires');
});

test('TOUT chemin qui crée un stagiaire ou une entreprise laisse une trace', () => {
    /* La première passe n'avait journalisé que le CRUD principal. Il restait quatre chemins
       muets, et ce sont les plus courants de cet organisme :
         · l'inscription d'un GROUPE crée les fiches en lot (company.controller) ;
         · la fiche stagiaire crée une entreprise « en passant », à la création comme à la
           modification (learner.controller, saisie inline) ;
         · le STAGIAIRE lui-même en saisit une depuis son espace (espace.controller) — celle-là
           surtout : sans trace, l'école découvre une entreprise dans sa base sans savoir ni
           quand ni par qui.
       Ce test compte les INSERT et exige autant de logAudit : un chemin ajouté demain sans sa
       trace fait virer au rouge, ce qu'une liste de cas écrite à la main n'aurait pas fait. */
    const compte = (s, re) => [...s.matchAll(re)].length;
    for (const f of ['learner.controller.js', 'company.controller.js', 'espace.controller.js']) {
        const src = fs.readFileSync(path.join(CTRL, f), 'utf8');
        // « INSERT INTO learner ( » et non « learner » seul : learner_avatar et
        // learner_quest_progress ne créent pas de stagiaire.
        assert.strictEqual(
            compte(src, /INSERT INTO learner \(/g),
            compte(src, /logAudit\(req, 'learner\.create'/g),
            `${f} : autant de traces que de créations de stagiaire`);
        assert.strictEqual(
            compte(src, /INSERT INTO company \(/g),
            compte(src, /logAudit\(req, 'company\.create'/g),
            `${f} : autant de traces que de créations d'entreprise`);
    }
});

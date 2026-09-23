/**
 * LES ENVOIS PROGRAMMÉS — « trois mois après la fin de la session » (2026-09-23, migration 179).
 *
 * CE QUE CES TESTS GÈLENT, et chacun protège d'un envoi qu'on ne rattrape pas :
 *   · une règle NE RATTRAPE JAMAIS LE PASSÉ — sans cette borne, « trois mois après la fin »
 *     créée aujourd'hui écrirait d'un coup à trois ans d'anciens stagiaires ;
 *   · on n'envoie JAMAIS DEUX FOIS, même si deux passages se chevauchent ;
 *   · un échec est GARDÉ, sinon le passage recommencerait toutes les demi-heures sur une adresse
 *     qui n'existe pas ;
 *   · les mois se comptent en MOIS (le 31 janvier plus un mois n'est pas le 3 mars) ;
 *   · les jours manqués se rattrapent : un serveur arrêté une nuit ne doit pas perdre un envoi.
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

const prog = require('../lib/mailsProgrammes.js');
const { passerLesReglesMail, JETONS_REGLE } = require('../lib/passageMailsProgrammes.js');

test('un décalage en mois compte des MOIS, pas des jours', () => {
    /* « Trois mois après le 30 novembre » est le 28 février — pas le 28 ni le 29 selon l'humeur
       d'un calcul en 90 jours. Et le 31 janvier plus un mois est le 28 février : on BORNE au
       dernier jour du mois d'arrivée, sinon la date déborderait sur mars. */
    assert.strictEqual(prog.dateCible({ depart: '2026-11-30', sens: 'apres', decalage: 3, unite: 'mois' }), '2027-02-28');
    assert.strictEqual(prog.dateCible({ depart: '2026-01-31', sens: 'apres', decalage: 1, unite: 'mois' }), '2026-02-28');
    assert.strictEqual(prog.dateCible({ depart: '2024-01-31', sens: 'apres', decalage: 1, unite: 'mois' }), '2024-02-29',
        'une année bissextile a bien un 29 février');
    /* Un an après le 29 février n'existe pas : on prend le 28. */
    assert.strictEqual(prog.dateCible({ depart: '2024-02-29', sens: 'apres', decalage: 1, unite: 'annee' }), '2025-02-28');
    /* AVANT, c'est le même calcul dans l'autre sens — « 7 jours avant le 5 octobre ». */
    assert.strictEqual(prog.dateCible({ depart: '2026-10-05', sens: 'avant', decalage: 7, unite: 'jour' }), '2026-09-28');
    /* Zéro, c'est le jour même : une convocation « le jour du début » doit être possible. */
    assert.strictEqual(prog.dateCible({ depart: '2026-10-05', sens: 'apres', decalage: 0, unite: 'jour' }), '2026-10-05');
    assert.strictEqual(prog.dateCible({ depart: null, decalage: 1, unite: 'jour' }), null);
});

test('une règle refuse ce qui ne partirait jamais', () => {
    const base = { nom: 'Suivi', declencheur: 'fin_session', objet: 'x', corps: 'y' };
    /* UNE INSCRIPTION NE SE CONNAÎT PAS À L'AVANCE : une règle « 3 jours avant l'inscription »
       s'enregistrerait sans jamais rien envoyer, et personne ne saurait pourquoi. */
    assert.match(prog.lireRegle({ ...base, declencheur: 'inscription', sens: 'avant', decalage: 3 },
        { jetons: [] }).erreur || '', /ne se connaît pas à l’avance/);
    /* UN DÉCALAGE BORNÉ : « 4000 jours après » n'est pas une règle, c'est une faute de frappe qui
       dormirait onze ans avant de se voir. */
    assert.match(prog.lireRegle({ ...base, decalage: 4000, unite: 'jour' }, { jetons: [] }).erreur || '', /ne peut pas dépasser/);
    /* Un nom, un objet, un corps : sans eux, la liste et le courrier seraient illisibles. */
    assert.match(prog.lireRegle({ ...base, nom: '' }, { jetons: [] }).erreur || '', /nom/);
    assert.match(prog.lireRegle({ ...base, objet: '' }, { jetons: [] }).erreur || '', /objet/);
    assert.match(prog.lireRegle({ ...base, corps: '' }, { jetons: [] }).erreur || '', /message/);
    /* Un jeton inconnu est refusé ici comme ailleurs : il partirait en accolades. */
    assert.match(prog.lireRegle({ ...base, corps: 'Bonjour {Prenom}' }, { jetons: JETONS_REGLE }).erreur || '',
        /\{Prenom\} n’existe pas/);
    assert.ok(prog.lireRegle({ ...base, corps: 'Bonjour {Prénom}' }, { jetons: JETONS_REGLE }).valeurs);
});

/* ── LE PASSAGE, sur une base et un SMTP factices ──────────────────────────────────────────── */
function fausseBase({ regles, lignes, deja = [] }) {
    const ecrits = [];
    return {
        ecrits,
        query: async (sql, params) => {
            if (/FROM mail_regle WHERE actif = 1/.test(sql)) return [regles];
            if (/FROM enrollment e/.test(sql)) return [lignes];
            if (/FROM mail_regle_envoi WHERE regle_id/.test(sql)) return [deja.map((id) => ({ enrollment_id: id }))];
            if (/^\s*INSERT IGNORE INTO mail_regle_envoi/.test(sql)) { ecrits.push(params); return [{}]; }
            return [[]];
        },
    };
}
const REGLE = {
    id: 'r1', organization_id: 'o1', nom: 'Suivi à froid', declencheur: 'fin_session',
    sens: 'apres', decalage: 3, unite: 'mois', program_id: null,
    objet: 'Alors, {Prénom} ?', corps: 'Vous avez terminé {Formation}.', depuis: '2026-09-01',
};
const dossier = (id, fin, email = 'c@exemple.fr') => ({
    enrollment_id: id, learner_id: 'l' + id, first_name: 'Camille', last_name: 'BERGER',
    email, formation: 'Pizzaiolo niveau 1', code: 'NIV1', debut: '2026-06-01', fin, inscrit_le: '2026-05-01',
});

test('ce qui est échu part, ce qui ne l\'est pas attend, et le passé n\'est jamais rattrapé', async () => {
    const envoyes = [];
    const conn = fausseBase({
        regles: [REGLE],
        lignes: [
            dossier('e1', '2026-06-23'),   // cible = 23/09 → aujourd'hui : part
            dossier('e2', '2026-07-10'),   // cible = 10/10 → plus tard : attend
            /* CELUI-CI EST LE CŒUR DE LA RÈGLE : sa session s'est terminée en janvier, sa cible
               (avril) est ANTÉRIEURE à la création de la règle. Il ne doit RIEN recevoir. */
            dossier('e3', '2026-01-15'),
        ],
    });
    const r = await passerLesReglesMail({
        conn, orgName: 'École Pizza', zone: 'UTC', instant: new Date('2026-09-23T08:00:00Z'),
        envoyer: async (m) => { envoyes.push(m); return { sent: true }; },
    });
    assert.strictEqual(r.envoyes, 1, 'un seul envoi');
    assert.strictEqual(envoyes[0].to, 'c@exemple.fr');
    assert.strictEqual(envoyes[0].objet, 'Alors, Camille ?', 'les jetons sont remplacés');
    assert.match(envoyes[0].corps, /Pizzaiolo niveau 1/);
    assert.deepStrictEqual(conn.ecrits.map((p) => p[1]), ['e1'], 'et une seule trace');
});

test('on n\'envoie jamais deux fois, et un échec est gardé', async () => {
    /* DÉJÀ PARTI : la trace suffit à l'écarter, sans relire quoi que ce soit d'autre. */
    const conn = fausseBase({ regles: [REGLE], lignes: [dossier('e1', '2026-06-23')], deja: ['e1'] });
    const r = await passerLesReglesMail({
        conn, zone: 'UTC', instant: new Date('2026-09-23T08:00:00Z'),
        envoyer: async () => { throw new Error('ne devrait pas envoyer'); },
    });
    assert.strictEqual(r.envoyes, 0);

    /* UN ÉCHEC S'ÉCRIT AUSSI : sinon le passage suivant recommencerait toutes les demi-heures
       sur une adresse qui n'existe pas. */
    const conn2 = fausseBase({ regles: [REGLE], lignes: [dossier('e1', '2026-06-23')] });
    const r2 = await passerLesReglesMail({
        conn: conn2, zone: 'UTC', instant: new Date('2026-09-23T08:00:00Z'),
        envoyer: async () => ({ sent: false, reason: 'adresse inconnue' }),
    });
    assert.strictEqual(r2.echecs, 1);
    assert.deepStrictEqual(conn2.ecrits[0].slice(1), ['e1', 'le1', 'echec']);

    /* PAS D'ADRESSE, PAS DE TRACE : la fiche peut se compléter, et le message partira ensuite. */
    const conn3 = fausseBase({ regles: [REGLE], lignes: [dossier('e1', '2026-06-23', null)] });
    const r3 = await passerLesReglesMail({
        conn: conn3, zone: 'UTC', instant: new Date('2026-09-23T08:00:00Z'),
        envoyer: async () => ({ sent: true }),
    });
    assert.strictEqual(r3.envoyes, 0);
    assert.strictEqual(conn3.ecrits.length, 0, 'rien n’est marqué : ce n’est pas un envoi manqué, c’est une fiche à compléter');
});

test('un jour manqué se rattrape', async () => {
    /* Un serveur arrêté une nuit, un redéploiement au mauvais moment : sans fenêtre, l'envoi
       serait perdu pour toujours — et personne ne s'en apercevrait, puisque rien n'échoue. */
    const conn = fausseBase({ regles: [REGLE], lignes: [dossier('e1', '2026-06-18')] }); // cible = 18/09
    const r = await passerLesReglesMail({
        conn, zone: 'UTC', instant: new Date('2026-09-23T08:00:00Z'),
        envoyer: async () => ({ sent: true }),
    });
    assert.strictEqual(r.envoyes, 1, 'cinq jours plus tard, il part quand même');
});

test('sans la 179, le passage ne fait rien et ne se plaint pas', async () => {
    const conn = { query: async () => { const e = new Error('table'); e.code = 'ER_NO_SUCH_TABLE'; throw e; } };
    assert.deepStrictEqual(await passerLesReglesMail({ conn, envoyer: async () => ({ sent: true }) }),
        { envoyes: 0, echecs: 0, regles: 0 });
});

test('le serveur repasse, et la règle ne se fait pas couper par les interrupteurs des cinq', () => {
    const srv = sansCommentaires(lire(path.join(API, 'server.js')));
    assert.match(srv, /setInterval\(passerMails, 30 \* 60 \* 1000\)/, 'toutes les demi-heures : la granularité est le JOUR');
    assert.match(srv, /setTimeout\(passerMails, 2 \* 60 \* 1000\)/, 'et un passage peu après le démarrage');
    /* PAS DE `kind` : les interrupteurs de la 138 coupent les cinq e-mails du code. Une règle
       posée par l'école s'arrête par SON interrupteur, là où elle a été écrite. */
    assert.match(srv, /return sendMail\(\{ to, replyTo: repondreA, subject, html, attachments: piecesImages\(images\) \}\);/);
});

test('l\'écran dit qu\'une règle ne rattrape pas le passé, et montre ce qu\'elle a fait', () => {
    const page = sansCommentaires(lire(path.join(UI, 'pages/Mailing.jsx')));
    assert.match(page, /Une règle ne\s*\n?\s*rattrape jamais le passé/);
    assert.match(page, /\{r\.phrase\}/, 'la règle se lit en clair dans la liste');
    assert.match(page, /aucun envoi pour l'instant/, 'et ce qu’elle a déjà envoyé se voit');
    assert.match(page, /r\.actif \? "Active" : "En pause"/);
    /* SUPPRIMER SE CONFIRME : la mémoire des envois part avec la règle. */
    assert.match(page, /window\.confirm\(`Supprimer « \$\{r\.nom\} » \?/);
    const css = lire(path.join(UI, 'styles/app.css'));
    assert.match(css, /\.mail-regles li\.off\{opacity/, 'une règle en pause se voit sans se lire');
});

test('la 179 crée les deux tables, avec la clé qui empêche le doublon', () => {
    const MIG = path.join(API, '..', '..', 'database', 'migrations');
    const aller = lire(path.join(MIG, '179_mails_programmes.sql'));
    assert.match(aller, /CREATE TABLE IF NOT EXISTS mail_regle/);
    assert.match(aller, /PRIMARY KEY \(regle_id, enrollment_id\)/,
        'la base elle-même refuse le deuxième envoi');
    assert.match(aller, /depuis\s+date\s+NOT NULL/, 'le garde-fou du passé est une colonne, pas une intention');
    assert.ok(!/--/.test(aller), 'commentaires en blocs');
    assert.ok(!/\\/.test(aller), 'aucune barre oblique inverse');
    assert.match(lire(path.join(MIG, '179_revert_mails_programmes.sql')), /CE QUI SE PERD/);
});

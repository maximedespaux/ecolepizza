/**
 * LE PASSAGE DES ENVOIS PROGRAMMÉS — ce qui doit partir aujourd'hui (migration 179).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * COMMENT IL TRAVAILLE. Pour chaque règle active : on ramène les dossiers dont la date de départ
 * tombe dans une fenêtre LARGE, on calcule la date d'envoi exacte en JavaScript (lib/
 * mailsProgrammes.js, éprouvable sans base), et on garde ceux dont cette date est passée sans
 * être avant la création de la règle. Ce qui est déjà parti est écarté par `mail_regle_envoi`.
 *
 * POURQUOI UNE FENÊTRE LARGE PUIS UN FILTRE EN JS. La borne SQL n'a qu'un rôle : ne pas relire
 * tout l'historique à chaque passage. Elle est volontairement généreuse — la précision est dans
 * le calcul de date, qui connaît les mois courts et les années bissextiles, là où un
 * `DATE_ADD(..., INTERVAL 3 MONTH)` dans un `WHERE` deviendrait la règle sans que personne ne
 * puisse l'éprouver.
 *
 * ON N'ENVOIE JAMAIS DEUX FOIS. `mail_regle_envoi` porte une clé primaire (règle, dossier) : même
 * si deux passages se chevauchaient, la base refuserait le doublon. L'ÉCHEC EST ÉCRIT LUI AUSSI —
 * sinon le passage suivant recommencerait en boucle sur une adresse qui n'existe pas, toutes les
 * demi-heures, jusqu'à ce que le fournisseur s'en aperçoive.
 *
 * SANS LA 179, LE PASSAGE NE FAIT RIEN et ne se plaint pas : la table manque, on s'arrête. C'est
 * la même tolérance que partout ailleurs — le code marche avant comme après la migration.
 */
const { FUSEAU } = require('./fuseau.js');
const { DECLENCHEURS, MAX_PAR_PASSAGE, dateCible, jourDe } = require('./mailsProgrammes.js');
const { rendre } = require('./mailsPersonnalises.js');

/** Aujourd'hui, dans le fuseau de l'organisme — le serveur, lui, tourne en UTC. */
function aujourdhuiA(zone = FUSEAU, instant = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
}

/* Combien de jours, au pire, représente le décalage d'une règle — pour la borne SQL seulement. */
const JOURS_MAX = { jour: 1, mois: 31, annee: 366 };
const decale = (jour, n) => new Date(Date.UTC(...jour.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v))) + n * 86400000)
    .toISOString().slice(0, 10);

/** Les jetons qu'un message programmé peut porter. L'écran propose exactement ceux-là. */
const JETONS_REGLE = ['Prénom', 'Nom', 'Organisme', 'Formation', 'Session', 'Date de fin', 'Date de début'];

/**
 * Un passage. `envoyer` et `notifierEchec` sont injectés : le test n'ouvre ni base ni SMTP.
 * Renvoie `{ envoyes, echecs, regles }` — de quoi écrire une ligne de journal utile.
 */
async function passerLesReglesMail({ conn, envoyer, orgName, zone = FUSEAU, instant = new Date() }) {
    const aujourdhui = aujourdhuiA(zone, instant);
    let regles;
    try {
        [regles] = await conn.query(
            `SELECT id, organization_id, nom, declencheur, sens, decalage, unite, program_id,
                    objet, corps, DATE_FORMAT(depuis, '%Y-%m-%d') AS depuis
               FROM mail_regle WHERE actif = 1`);
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) return { envoyes: 0, echecs: 0, regles: 0 };
        throw err;
    }
    let envoyes = 0;
    let echecs = 0;
    for (const r of regles) {
        const d = DECLENCHEURS[r.declencheur];
        if (!d) continue;
        /* La fenêtre SQL : généreuse des deux côtés, la précision vient du calcul de date. */
        const marge = (Math.max(0, Number(r.decalage) || 0) * (JOURS_MAX[r.unite] || 1)) + 2;
        const bas = decale(r.depuis, r.sens === 'avant' ? -2 : -marge);
        const haut = decale(aujourdhui, r.sens === 'avant' ? marge : 2);
        const params = [r.organization_id, bas, haut];
        if (r.program_id) params.push(r.program_id);
        const [lignes] = await conn.query(
            `SELECT e.id AS enrollment_id, l.id AS learner_id, l.first_name, l.last_name, l.email,
                    p.title AS formation, p.code AS code,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS debut,
                    DATE_FORMAT(s.end_date, '%Y-%m-%d') AS fin,
                    DATE_FORMAT(e.created_at, '%Y-%m-%d') AS inscrit_le
               FROM enrollment e
               JOIN learner l ON l.id = e.learner_id
               JOIN training_session s ON s.id = e.session_id
               LEFT JOIN training_program p ON p.id = s.program_id
              WHERE e.organization_id = ? AND ${d.colonne} BETWEEN ? AND ?
                    ${r.program_id ? 'AND s.program_id = ?' : ''}
              ORDER BY ${d.colonne}`, params);
        if (!lignes.length) continue;

        const [deja] = await conn.query('SELECT enrollment_id FROM mail_regle_envoi WHERE regle_id = ?', [r.id]);
        const faits = new Set(deja.map((x) => x.enrollment_id));

        for (const ligne of lignes) {
            if (envoyes + echecs >= MAX_PAR_PASSAGE) break;
            if (faits.has(ligne.enrollment_id)) continue;
            const depart = r.declencheur === 'fin_session' ? ligne.fin
                : r.declencheur === 'debut_session' ? ligne.debut : ligne.inscrit_le;
            const cible = dateCible({ depart: jourDe(depart), sens: r.sens, decalage: r.decalage, unite: r.unite });
            /* LA DOUBLE BORNE EST LA RÈGLE : échue (cible ≤ aujourd'hui) ET postérieure à la
               création (cible ≥ depuis). Sans la seconde, créer une règle « trois mois après la
               fin » écrirait d'un coup à trois ans d'anciens stagiaires. */
            if (!cible || cible > aujourdhui || cible < r.depuis) continue;
            /* PAS D'ADRESSE, PAS D'ENVOI — et on ne marque rien : la fiche peut se compléter, et
               le message partira au passage suivant. */
            if (!ligne.email) continue;

            const valeurs = {
                'Prénom': ligne.first_name || '', Nom: ligne.last_name || '',
                Organisme: orgName || 'École Pizza',
                Formation: ligne.formation || ligne.code || '',
                Session: [ligne.code, ligne.debut].filter(Boolean).join(' du '),
                'Date de fin': ligne.fin || '', 'Date de début': ligne.debut || '',
            };
            const r2 = await envoyer({
                to: ligne.email,
                objet: rendre(r.objet, valeurs),
                corps: rendre(r.corps, valeurs),
            });
            const statut = r2 && r2.sent ? 'envoye' : 'echec';
            if (statut === 'envoye') envoyes += 1; else echecs += 1;
            /* `INSERT IGNORE` : deux passages qui se chevauchent ne doivent pas faire tomber le
               second sur une erreur de clé — la trace du premier suffit. */
            await conn.query(
                'INSERT IGNORE INTO mail_regle_envoi (regle_id, enrollment_id, learner_id, statut) VALUES (?, ?, ?, ?)',
                [r.id, ligne.enrollment_id, ligne.learner_id, statut]);
        }
    }
    return { envoyes, echecs, regles: regles.length };
}

module.exports = { passerLesReglesMail, aujourdhuiA, JETONS_REGLE };

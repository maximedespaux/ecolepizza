/**
 * REPRISE : chiffre au repos les identifiants France Travail DÉJÀ saisis (migration 170).
 *
 * Depuis le 2026-09-21, `learner.france_travail_id` s'écrit chiffré (AES-256-GCM, lib/crypto.js),
 * comme le n° de sécurité sociale. Ce qui avait été saisi avant est resté EN CLAIR. Chiffrer
 * demande la CLÉ, que SQL n'a pas : d'où ce script, sur le modèle de `chiffrer-coffre.js`, dont il
 * reprend le garde-fou de clé tel quel.
 *
 * CE QU'IL FAIT, ligne par ligne : il lit l'identifiant, le chiffre, RELIT le chiffré pour
 * confirmer qu'on retrouve exactement l'original, et seulement alors écrit — et seulement si la
 * fiche n'a pas changé entre-temps (`WHERE france_travail_id = <valeur lue>`) : une fiche
 * enregistrée à l'instant par l'écran n'est jamais écrasée. Un aller-retour raté saute la ligne et
 * la signale ; on ne remplace jamais une valeur par ce qu'on ne sait pas rouvrir.
 *
 * IL N'AFFICHE JAMAIS UN IDENTIFIANT : des comptes, et l'`id` interne des fiches en défaut.
 *
 * L'ORDRE (cf. la migration 170) :
 *   1. jouer la 170 — sans elle le script REFUSE : un chiffré ne tient pas dans 60 caractères ;
 *   2. déployer le code qui chiffre et déchiffre — sinon l'ancien code afficherait « enc:… » ;
 *   3. lancer ce script :
 *
 *   sudo -u impastio node database/tools/chiffrer-france-travail.js --essai       # n'écrit rien
 *   sudo -u impastio node database/tools/chiffrer-france-travail.js               # chiffre
 *   sudo -u impastio node database/tools/chiffrer-france-travail.js --verifier    # rouvre tout, n'écrit rien
 *   sudo -u impastio node database/tools/chiffrer-france-travail.js --dechiffrer  # retour au clair
 *   … --sans-temoin   # seulement si aucune valeur déjà chiffrée n'existe pour confronter la clé
 *
 * REJOUABLE ET REPRENABLE : un identifiant déjà chiffré est reconnu (« enc: ») et sauté.
 */
const db = require('../../src/api/config/database.js');
const { encrypt, decrypt } = require('../../src/api/lib/crypto.js');
const { largeurColonne } = require('../../src/api/lib/colonnes.js');
/* Le garde-fou de clé du coffre, et pas une copie : une clé absente, ou présente mais FAUSSE
   (régénérée par erreur), se détecte ici exactement comme là-bas — le témoin le plus sûr étant
   `learner.social_security`, chiffré avec la même clé. Importer ne lance rien : le script du coffre
   ne s'exécute que lancé directement (`require.main === module`). */
const { cleConfirmee } = require('./chiffrer-coffre.js');

const ESSAI = process.argv.includes('--essai');
const DECHIFFRER = process.argv.includes('--dechiffrer');
const VERIFIER = process.argv.includes('--verifier');
const SANS_TEMOIN = process.argv.includes('--sans-temoin');
const PREFIXE = 'enc:';
// La largeur posée par la 170 (et celle du n° de sécurité sociale).
const LARGEUR_REQUISE = 255;

/** La colonne a-t-elle la place de recevoir un chiffré (migration 170 jouée) ? */
async function colonnePrete(conn) {
    return (await largeurColonne(conn, 'learner', 'france_travail_id')) >= LARGEUR_REQUISE;
}

/** Chiffre les identifiants encore en clair. → { vus, chiffres, echecs: [id…] } */
async function chiffrer(conn, { essai = ESSAI } = {}) {
    const [rows] = await conn.query(
        `SELECT id, france_travail_id AS v FROM learner
          WHERE france_travail_id IS NOT NULL AND france_travail_id <> '' AND france_travail_id NOT LIKE 'enc:%'`);
    const bilan = { vus: rows.length, chiffres: 0, echecs: [] };
    for (const r of rows) {
        const clair = String(r.v);
        const chiffre = encrypt(clair);
        // L'ALLER-RETOUR AVANT D'ÉCRIRE, et la place : sinon la ligne est sautée, et dite.
        if (!chiffre || decrypt(chiffre) !== clair || chiffre.length > LARGEUR_REQUISE) { bilan.echecs.push(r.id); continue; }
        if (essai) { bilan.chiffres++; continue; }
        const [res] = await conn.query(
            'UPDATE learner SET france_travail_id = ? WHERE id = ? AND france_travail_id = ?', [chiffre, r.id, r.v]);
        // 0 ligne : la fiche a changé depuis la lecture (enregistrée à l'instant) — on ne l'écrase pas.
        if (res && res.affectedRows === 1) bilan.chiffres++; else bilan.echecs.push(r.id);
    }
    return bilan;
}

/** Contrôle en LECTURE SEULE : chaque identifiant chiffré se rouvre-t-il ? → { chiffres, clairs, illisibles: [id…] } */
async function verifier(conn) {
    const [rows] = await conn.query(
        `SELECT id, france_travail_id AS v FROM learner WHERE france_travail_id IS NOT NULL AND france_travail_id <> ''`);
    const bilan = { chiffres: 0, clairs: 0, illisibles: [] };
    for (const r of rows) {
        if (!String(r.v).startsWith(PREFIXE)) bilan.clairs++;
        else if (decrypt(r.v) === null) bilan.illisibles.push(r.id);
        else bilan.chiffres++;
    }
    return bilan;
}

/** Remet en clair (avant un retour à l'ancien code). Un chiffré illisible n'est JAMAIS remplacé par du vide. */
async function dechiffrer(conn, { essai = ESSAI } = {}) {
    const [rows] = await conn.query(`SELECT id, france_travail_id AS v FROM learner WHERE france_travail_id LIKE 'enc:%'`);
    const bilan = { vus: rows.length, dechiffres: 0, illisibles: [] };
    for (const r of rows) {
        const clair = decrypt(r.v);
        if (clair === null) { bilan.illisibles.push(r.id); continue; }
        if (essai) { bilan.dechiffres++; continue; }
        const [res] = await conn.query(
            'UPDATE learner SET france_travail_id = ? WHERE id = ? AND france_travail_id = ?', [clair, r.id, r.v]);
        if (res && res.affectedRows === 1) bilan.dechiffres++; else bilan.illisibles.push(r.id);
    }
    return bilan;
}

if (require.main === module) (async () => {
    const conn = db.promise();
    console.log(VERIFIER
        ? '\nIdentifiants France Travail — contrôle en LECTURE SEULE\n'
        : `\nIdentifiants France Travail — ${DECHIFFRER ? 'DÉCHIFFREMENT' : 'chiffrement'}${ESSAI ? ' (essai : aucune écriture)' : ''}\n`);
    try {
        if (!await cleConfirmee(conn, VERIFIER ? { essai: true } : { essai: ESSAI, sansTemoin: SANS_TEMOIN })) { process.exitCode = 1; return; }
        if (VERIFIER) {
            const b = await verifier(conn);
            console.log(`  ${b.chiffres} chiffré(s) et rouvrable(s), ${b.clairs} encore en clair, ${b.illisibles.length} illisible(s).`);
            if (b.illisibles.length) console.log(`  Fiches illisibles : ${b.illisibles.join(', ')}`);
            if (b.illisibles.length || b.clairs) process.exitCode = 1;
            return;
        }
        if (!DECHIFFRER && !await colonnePrete(conn)) {
            console.error('  ARRÊT — la colonne learner.france_travail_id n\'a pas la place d\'un chiffré.');
            console.error('  Jouer d\'abord la migration 170 (170_france_travail_chiffre.sql).\n');
            process.exitCode = 1;
            return;
        }
        const b = DECHIFFRER ? await dechiffrer(conn) : await chiffrer(conn);
        const faits = DECHIFFRER ? b.dechiffres : b.chiffres;
        const ratés = DECHIFFRER ? b.illisibles : b.echecs;
        console.log(`  ${b.vus} identifiant(s) à reprendre, ${faits} ${DECHIFFRER ? 'remis en clair' : 'chiffré(s)'}${ESSAI ? ' (essai)' : ''}, ${ratés.length} en défaut.`);
        if (ratés.length) { console.log(`  Fiches en défaut (à relancer ou à voir) : ${ratés.join(', ')}`); process.exitCode = 1; }
        if (!ESSAI && !DECHIFFRER) console.log('\n  Contrôle conseillé : relancer avec --verifier.');
        console.log('');
    } catch (err) {
        console.error('\nÉchec :', err.message, '\n');
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();

module.exports = { chiffrer, verifier, dechiffrer, colonnePrete, LARGEUR_REQUISE };

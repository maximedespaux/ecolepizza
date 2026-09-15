/**
 * REPRISE : chiffre au repos ce qui est déjà en base — coffre documentaire, photos de profil,
 * images de la communauté.
 *
 * POURQUOI UN SCRIPT ET PAS UNE MIGRATION. Chiffrer demande la CLÉ, que SQL n'a pas. Une
 * migration ne peut donc pas faire ce travail : elle peut seulement préparer les colonnes
 * (c'est la 153), le reste passe forcément par du code qui lit `SSN_ENC_KEY`.
 *
 * CE QUE FAIT LE SCRIPT, ligne par ligne : il lit les octets, vérifie qu'ils ne sont pas DÉJÀ
 * chiffrés, les chiffre, RELIT le résultat pour confirmer qu'on retrouve exactement l'original,
 * et seulement alors écrit. Un aller-retour raté arrête tout — on ne remplace jamais un
 * document par quelque chose qu'on ne sait pas rouvrir.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LES DEUX GARDE-FOUS, ET POURQUOI ILS EXISTENT
 *
 * 1. SANS `SSN_ENC_KEY`, `lib/crypto.js` se rabat sur une clé de DÉVELOPPEMENT dérivée d'une
 *    chaîne publique, écrite en clair dans le dépôt. Chiffrer 681 Mo avec elle reviendrait à ne
 *    rien chiffrer du tout, tout en ayant l'air de l'avoir fait — le pire des deux mondes. Le
 *    script refuse donc de démarrer si la variable est absente.
 *
 * 2. UNE CLÉ PRÉSENTE MAIS FAUSSE serait pire encore : les archives deviendraient illisibles
 *    pour le serveur, qui en utilise une autre, et on ne s'en apercevrait qu'en ouvrant un
 *    document. Avant de toucher quoi que ce soit, le script cherche donc une valeur DÉJÀ
 *    chiffrée par l'application (signature d'organisme, PDF signé, signature de document) et
 *    vérifie qu'il sait la rouvrir. S'il n'y arrive pas, il s'arrête.
 *
 * ⚠ AVANT DE LANCER : la clé est-elle sauvegardée HORS du serveur ? Elle a déjà été perdue une
 * fois (août 2026) ; ce jour-là, quatre valeurs de test l'ont payé. Après cette reprise, la
 * perdre coûterait le coffre entier — 681 Mo de preuve Qualiopi.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * USAGE (sur le VPS, en tant que l'utilisateur qui peut lire config/.env) :
 *
 *   sudo -u impastio node database/tools/chiffrer-coffre.js --essai     # ne touche à rien
 *   sudo -u impastio node database/tools/chiffrer-coffre.js
 *   sudo -u impastio node database/tools/chiffrer-coffre.js --dechiffrer
 *   … --sans-temoin   # seulement si aucune valeur déjà chiffrée n'existe pour confronter la clé
 *
 *   sudo -u impastio node database/tools/chiffrer-coffre.js --verifier
 *
 * `--verifier` n'écrit RIEN : il rouvre chaque ligne, une par une, et contrôle que le document
 * est intact. Trois questions par ligne — se déchiffre-t-il ? est-ce toujours un PDF ? son
 * empreinte correspond-elle à celle mémorisée ? C'est la vérification qui remplace « ouvrir
 * deux ou trois documents pour voir » : elle les ouvre TOUS.
 *
 * Il est REJOUABLE et REPRENABLE : une ligne déjà chiffrée est reconnue et sautée. Interrompu,
 * il se relance et continue là où il en était.
 */
const db = require('../../src/api/config/database.js');
const { encryptBytes, decryptBytes, decrypt } = require('../../src/api/lib/crypto.js');
const { empreinteClaire } = require('../../src/api/lib/coffre.js');
const { colonneExiste } = require('../../src/api/lib/colonnes.js');

const ESSAI = process.argv.includes('--essai');
const DECHIFFRER = process.argv.includes('--dechiffrer');
const SANS_TEMOIN = process.argv.includes('--sans-temoin'); // passer outre l'absence de témoin
const VERIFIER = process.argv.includes('--verifier'); // contrôle en LECTURE SEULE, n'écrit jamais
const MARQUEUR = Buffer.from('encb1');

const estChiffre = (buf) => !!buf && buf.length >= MARQUEUR.length && buf.subarray(0, MARQUEUR.length).equals(MARQUEUR);
const mo = (n) => (n / (1024 * 1024)).toFixed(1) + ' Mo';

/** Les tables reprises. `mesures` = les colonnes de mesure du clair (coffre uniquement). */
const CIBLES = [
    { table: 'archive_document', cle: 'id', colonne: 'file', libelle: 'coffre documentaire', mesures: true },
    { table: 'learner_avatar', cle: 'learner_id', colonne: 'bytes', libelle: 'photos de profil' },
    { table: 'community_image', cle: 'id', colonne: 'bytes', libelle: 'images de la communauté' },
];

/**
 * La clé en mémoire est-elle bien celle avec laquelle l'application a déjà chiffré ?
 *
 * ON NE SE CONTENTE PAS DE « LA VARIABLE EST DÉFINIE ». Une clé régénérée par erreur passerait
 * ce test-là et rendrait le coffre illisible pour le serveur — on ne s'en apercevrait qu'en
 * ouvrant un document, des semaines plus tard. On cherche donc une valeur DÉJÀ chiffrée par
 * l'application et on vérifie qu'on sait la rouvrir.
 *
 * POURQUOI LA LISTE EST AUSSI LONGUE. Les trois premières sondes n'ont RIEN trouvé en
 * production, et le script a continué en avertissant — ce qui, à quelques secondes de réécrire
 * 660 Mo, est la mauvaise réponse. Trois sondes disaient « base neuve ? » d'une base de 1,4 Go
 * vieille d'un an. L'explication est dans l'histoire : les quatre valeurs chiffrées qui
 * existaient ont été VIDÉES du dump avant l'import de 2026-08 (la clé d'AlwaysData avait été
 * perdue), et il se trouve que trois d'entre elles étaient exactement mes trois sondes. On
 * ratisse donc tout ce que l'application chiffre, texte ET octets.
 */
const SONDES_TEXTE = [
    ['organization', 'signature_image'], ['organization', 'sign_cert'],
    ['document_signature', 'signature_data'],
    ['generated_document', 'signature_data'], ['generated_document', 'org_signature_data'],
    ['document_signed_pdf', 'pdf'],
    ['attendance_record', 'signature_data'], ['attendance_trainer_sign', 'signature_data'],
    ['user', 'signature_image'], ['learner', 'sign_cert'], ['learner', 'social_security'],
];
/* Les colonnes d'OCTETS ne portent pas le préfixe « enc: » mais le marqueur binaire « encb1 » :
   elles se sondent autrement, et se vérifient avec `decryptBytes`. */
const SONDES_OCTETS = [
    ['piece_fichier', 'bytes'], ['document_fichier', 'bytes'],
];

async function cleConfirmee(conn, { essai = ESSAI, sansTemoin = SANS_TEMOIN } = {}) {
    if (!String(process.env.SSN_ENC_KEY || '').trim()) {
        console.error('\n  ARRÊT — SSN_ENC_KEY absente.\n');
        console.error('  Sans elle, lib/crypto.js se rabat sur une clé de développement dérivée');
        console.error('  d\'une chaîne publique : le contenu serait « chiffré » avec un secret que');
        console.error('  tout le monde peut lire. Lancer ce script depuis un compte qui voit');
        console.error('  src/api/config/.env (sur le VPS : sudo -u impastio node …).\n');
        return false;
    }

    const essayees = [];
    for (const [table, colonne, octets] of [
        ...SONDES_TEXTE.map((s) => [...s, false]),
        ...SONDES_OCTETS.map((s) => [...s, true]),
    ]) {
        if (!await colonneExiste(conn, table, colonne)) continue;
        essayees.push(`${table}.${colonne}`);
        const [rows] = await conn.query(
            `SELECT \`${colonne}\` AS v FROM \`${table}\`
              WHERE ${octets ? `LEFT(\`${colonne}\`, 5) = 'encb1'` : `\`${colonne}\` LIKE 'enc:%'`} LIMIT 1`);
        if (!rows.length) continue;
        const ouvert = octets ? decryptBytes(rows[0].v) : decrypt(rows[0].v);
        if (ouvert === null) {
            console.error('\n  ARRÊT — la clé chargée n\'ouvre PAS ce que l\'application a déjà chiffré.');
            console.error(`  Témoin essayé : ${table}.${colonne}.\n`);
            console.error('  Chiffrer le coffre avec cette clé-là le rendrait illisible pour le serveur.');
            console.error('  Vérifier SSN_ENC_KEY avant de recommencer.\n');
            return false;
        }
        console.log(`  Clé vérifiée sur un témoin existant (${table}.${colonne}) — elle ouvre bien.`);
        return true;
    }

    /* AUCUN TÉMOIN : on ne DEVINE pas. En essai, on laisse voir ce qui serait fait ; pour
       écrire, il faut le dire explicitement. Le cas n'est pas théorique — `dotenv` n'écrase pas
       une variable déjà présente dans l'environnement, si bien qu'un `SSN_ENC_KEY=…` posé dans
       le shell l'emporterait SILENCIEUSEMENT sur le fichier .env que lit l'application. */
    console.warn('\n  AUCUN TÉMOIN — aucune valeur déjà chiffrée trouvée pour confronter la clé.');
    console.warn(`  Sondé : ${essayees.join(', ') || 'aucune colonne connue'}.\n`);
    if (essai) {
        console.warn('  Essai : on continue pour montrer ce qui serait fait, sans rien écrire.\n');
        return true;
    }
    if (sansTemoin) {
        console.warn('  --sans-temoin : vous passez outre. La reprise commence.\n');
        return true;
    }
    console.error('  Pour écrire quand même, relancer avec --sans-temoin — après avoir vérifié');
    console.error('  que SSN_ENC_KEY n\'est pas posée dans l\'environnement du shell (elle');
    console.error('  l\'emporterait sur le fichier .env sans le dire).\n');
    return false;
}

/**
 * CONTRÔLE EN LECTURE SEULE — la vérification d'après.
 *
 * POURQUOI ELLE EXISTE. Après la reprise, la façon évidente de s'assurer que rien n'est cassé
 * est d'ouvrir deux ou trois documents dans l'application. Cela prouve deux ou trois documents.
 * Sur 1151 pièces de preuve Qualiopi, ce n'est pas une vérification, c'est un sondage — et la
 * ligne abîmée, s'il y en a une, ne se découvrirait qu'un jour de contrôle.
 *
 * TROIS QUESTIONS PAR LIGNE, et il faut les trois :
 *   · le contenu se DÉCHIFFRE-t-il ? Le tag GCM détecte toute altération — une réponse `null`
 *     signale une clé qui ne correspond pas ou des octets abîmés ;
 *   · est-ce encore un PDF ? Un déchiffrement qui « réussit » sur des octets quelconques est
 *     impossible avec GCM, mais l'en-tête `%PDF` coûte deux octets à vérifier et attrape ce
 *     qu'une erreur de colonne ou un import raté aurait pu laisser passer AVANT le chiffrement ;
 *   · l'empreinte mémorisée correspond-elle au contenu rouvert ? C'est la seule question qui
 *     compare l'AVANT et l'APRÈS : elle a été calculée sur le document en clair au moment de
 *     l'écriture, et se recalcule ici sur ce qu'on vient de rouvrir. Si les deux coïncident,
 *     le document est bit pour bit celui qui est entré.
 */
async function verifier(conn, cible) {
    const { table, cle, colonne, libelle } = cible;
    if (!await colonneExiste(conn, table, colonne)) {
        console.log(`\n· ${libelle} — table absente.`);
        return 0;
    }
    const mesure = cible.mesures && await colonneExiste(conn, table, 'empreinte');
    const [ids] = await conn.query(
        `SELECT \`${cle}\` AS id FROM \`${table}\` WHERE \`${colonne}\` IS NOT NULL ORDER BY \`${cle}\``);
    console.log(`\n· ${libelle} (${table}) — ${ids.length} ligne(s) à rouvrir`);

    let ok = 0; let clair = 0; let octets = 0;
    const vides = []; const ennuis = [];
    for (const { id } of ids) {
        const [[row]] = await conn.query(
            `SELECT \`${colonne}\` AS v${mesure ? ', empreinte, octets AS taille' : ''}
               FROM \`${table}\` WHERE \`${cle}\` = ?`, [id]);
        const buf = row && row.v;
        /* UNE LIGNE VIDE SE NOMME. Elle passait en `continue` muet — et sur la production, le
           contrôle a rapporté « 1150 conformes » pour « 1151 à rouvrir » sans dire où était la
           1151e. Un compte qui ne tombe pas juste est un défaut du RAPPORT avant d'être un
           défaut des données : la seule chose qu'on demande à une vérification, c'est de ne
           rien laisser hors du compte. Un document de zéro octet n'est pas une anomalie de
           chiffrement — c'est une pièce du coffre qui ne s'ouvrira jamais, et ça se sait. */
        if (!buf || !buf.length) { vides.push(String(id)); continue; }

        if (!estChiffre(buf)) { clair++; continue; } // pas encore repris : ce n'est pas une anomalie

        const ouvert = decryptBytes(buf);
        if (ouvert === null) { ennuis.push(`${id} : ILLISIBLE (clé ou contenu altéré)`); continue; }
        if (cible.mesures && !ouvert.subarray(0, 4).equals(Buffer.from('%PDF'))) {
            ennuis.push(`${id} : rouvert, mais ce n'est pas un PDF`);
            continue;
        }
        if (mesure && row.empreinte && empreinteClaire(ouvert) !== row.empreinte) {
            ennuis.push(`${id} : empreinte différente — le contenu n'est pas celui qui est entré`);
            continue;
        }
        if (mesure && row.taille != null && Number(row.taille) !== ouvert.length) {
            ennuis.push(`${id} : taille mémorisée ${row.taille}, rouverte ${ouvert.length}`);
            continue;
        }
        ok++; octets += ouvert.length;
    }
    console.log(`  Rouverts et conformes : ${ok} (${mo(octets)})`
        + (clair ? ` — encore en clair : ${clair}` : '')
        + (vides.length ? ` — VIDES : ${vides.length}` : '')
        /* Le message ne vaut que pour le coffre : les autres tables n'ont jamais eu de colonne
           d'empreinte, et leur annoncer « migration 153 non jouée » était faux — c'est ce qu'a
           affiché la production sous « photos de profil » et « images de la communauté ». */
        + (cible.mesures && !mesure ? ' — sans empreinte mémorisée (migration 153 non jouée)' : ''));
    for (const v of vides) console.error(`  ✗ ${v} : document VIDE (0 octet) — il ne s'ouvrira jamais`);
    for (const e of ennuis) console.error(`  ✗ ${e}`);
    /* LE COMPTE DOIT TOMBER JUSTE, et c'est ce qui le prouve : tout ce qui est entré ressort
       dans exactement une catégorie. Un écart signifie qu'une ligne a échappé au contrôle —
       précisément ce qu'on ne veut pas découvrir un jour d'audit. */
    const compte = ok + clair + vides.length + ennuis.length;
    if (compte !== ids.length) {
        console.error(`  ✗ ${ids.length - compte} ligne(s) NON CLASSÉE(S) — le contrôle est incomplet.`);
        return ennuis.length + (ids.length - compte);
    }
    return ennuis.length + vides.length;
}

async function reprendre(conn, cible, mesures) {
    const { table, cle, colonne, libelle } = cible;
    if (!await colonneExiste(conn, table, colonne)) {
        console.log(`\n· ${libelle} — table absente, rien à faire.`);
        return;
    }
    const [ids] = await conn.query(
        `SELECT \`${cle}\` AS id FROM \`${table}\` WHERE \`${colonne}\` IS NOT NULL ORDER BY \`${cle}\``);
    console.log(`\n· ${libelle} (${table}) — ${ids.length} ligne(s) à examiner`);

    let faites = 0; let sautees = 0; let vides = 0; let octets = 0;
    for (const { id } of ids) {
        /* UNE LIGNE À LA FOIS : un PDF du coffre pèse jusqu'à 25 Mo, et tout charger d'un coup
           ferait tenir 681 Mo en mémoire — sur un VPS qui sert l'application en même temps. */
        const [[row]] = await conn.query(
            `SELECT \`${colonne}\` AS octets FROM \`${table}\` WHERE \`${cle}\` = ?`, [id]);
        const buf = row && row.octets;
        /* Vide : il n'y a rien à chiffrer, mais ce n'est pas « déjà en état » pour autant. Les
           confondre, c'est ce qui a fait annoncer 1151 lignes reprises pour 1150 documents. */
        if (!buf || !buf.length) { vides++; continue; }

        const chiffre = estChiffre(buf);
        if (DECHIFFRER ? !chiffre : chiffre) { sautees++; continue; }

        const source = DECHIFFRER ? decryptBytes(buf) : buf;
        if (source === null) {
            console.error(`  ✗ ${table} ${id} : illisible (clé ?) — laissée intacte.`);
            continue;
        }
        const cible2 = DECHIFFRER ? source : encryptBytes(source);

        /* ALLER-RETOUR VÉRIFIÉ AVANT D'ÉCRIRE. C'est la seule garantie qui compte : on ne
           remplace un document que si l'on vient de prouver qu'on sait retrouver l'original,
           octet pour octet. Sans ce contrôle, une clé subtilement fausse détruirait le coffre
           en silence, ligne après ligne. */
        if (!DECHIFFRER) {
            const relu = decryptBytes(cible2);
            if (!relu || !relu.equals(source)) {
                console.error(`  ✗ ${table} ${id} : aller-retour raté — ARRÊT, rien d'autre ne sera écrit.`);
                throw new Error('vérification de chiffrement échouée');
            }
        }

        if (!ESSAI) {
            const set = [`\`${colonne}\` = ?`];
            const vals = [cible2];
            if (mesures && cible.mesures) {
                set.push('empreinte = ?', 'octets = ?');
                vals.push(empreinteClaire(source), source.length);
            }
            vals.push(id);
            await conn.query(`UPDATE \`${table}\` SET ${set.join(', ')} WHERE \`${cle}\` = ?`, vals);
        }
        faites++; octets += source.length;
        if (faites % 50 === 0) process.stdout.write(`  … ${faites} (${mo(octets)})\n`);
    }
    console.log(`  ${ESSAI ? 'À reprendre' : 'Reprises'} : ${faites} (${mo(octets)}) — déjà en état : ${sautees}`
        + (vides ? ` — vides, rien à chiffrer : ${vides}` : ''));
}

/* `require.main === module` : LANCÉ, pas REQUIS. Sans cette garde, un test qui importe ce
   fichier pour éprouver ses garde-fous ouvrirait une connexion à la base DISTANTE et ne rendrait
   jamais la main — le défaut exact que `config/database.js` documente à propos du pool
   paresseux. Le rendre importable est ce qui permet de VÉRIFIER qu'il refuse d'écrire sans
   témoin, au lieu de se contenter de relire son source. */
if (require.main === module) (async () => {
    const conn = db.promise();
    console.log(VERIFIER
        ? '\nContrôle du chiffrement au repos — LECTURE SEULE, aucune écriture\n'
        : `\nReprise du chiffrement au repos — ${DECHIFFRER ? 'DÉCHIFFREMENT' : 'chiffrement'}${ESSAI ? ' (essai : aucune écriture)' : ''}\n`);
    try {
        /* En contrôle, l'absence de témoin n'a pas à bloquer : rien ne s'écrit, et une clé qui
           ne correspondrait pas se signalerait d'elle-même — toutes les lignes ressortiraient
           illisibles, ce qui EST le résultat qu'on est venu chercher. */
        if (!await cleConfirmee(conn, VERIFIER ? { essai: true } : undefined)) { process.exitCode = 1; return; }
        if (VERIFIER) {
            let ennuis = 0;
            for (const cible of CIBLES) ennuis += await verifier(conn, cible);
            console.log(ennuis
                ? `\n${ennuis} ligne(s) en défaut — voir ci-dessus.\n`
                : '\nTout est rouvrable et conforme.\n');
            if (ennuis) process.exitCode = 1;
            return;
        }
        const mesures = await colonneExiste(conn, 'archive_document', 'empreinte');
        if (!mesures) {
            console.warn('  Colonnes de mesure absentes (migration 153 non jouée) : l\'écran de');
            console.warn('  stockage retombera sur une mesure faite en base. Jouer la 153 puis');
            console.warn('  relancer ce script remplira empreinte/octets.\n');
        }
        for (const cible of CIBLES) await reprendre(conn, cible, mesures);
        console.log(`\nTerminé.${ESSAI ? ' (essai — rien n\'a été écrit)' : ''}\n`);
    } catch (err) {
        console.error('\nÉchec :', err.message, '\n');
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();

module.exports = { cleConfirmee, verifier, estChiffre, SONDES_TEXTE, SONDES_OCTETS };

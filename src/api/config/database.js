const mysql = require('mysql2');
const { FUSEAU, decalageCourant } = require('../lib/fuseau.js');
const dotenv = require('dotenv');
const path = require('path');

// Charge les variables d'environnement depuis config/.env (à côté de ce fichier).
dotenv.config({ path: path.join(__dirname, '.env') });

/**
 * POOL CRÉÉ À LA PREMIÈRE UTILISATION, JAMAIS AU `require`.
 *
 * Le défaut que ça corrige : `npm test` ne rendait JAMAIS la main (constaté au-delà de huit
 * minutes sans la moindre sortie). Ce module ouvrait une connexion et armait les minuteurs de
 * `enableKeepAlive` dès qu'on le requérait — or 43 fichiers le requièrent, dont les contrôleurs.
 * Il suffisait donc qu'un test importe un contrôleur pour tirer une connexion à la base
 * DISTANTE, et le pool ouvert gardait la boucle d'événements vivante indéfiniment. Les tests
 * passaient tous en moins d'une milliseconde ; c'est la SORTIE du processus qui ne venait pas.
 *
 * Trois fichiers étaient concernés (facture-acheteur-champs, facture-destinataire,
 * questcontent), et tous trois ne testent que des fonctions PURES — `pickInvoiceTemplate`,
 * `invoiceCtx`, `parseQuestionBody` — qui n'ont jamais eu besoin de la base.
 *
 * POURQUOI ICI ET PAS EN EXTRAYANT CES FONCTIONS. C'était l'autre piste, et elle a l'air plus
 * propre : sortir les fonctions pures des contrôleurs dans des modules sans dépendance. Mais
 * treize fichiers de test lisent le SOURCE des contrôleurs au `readFileSync` (cf. CLAUDE.md
 * § 2.5 — c'est voulu, ça gèle un contrat), dont un lit `invoice.controller.js` lui-même.
 * Déplacer le code hors de ce fichier aurait cassé ce test — ou pire, l'aurait laissé au vert
 * en inspectant un fichier ne contenant plus rien à vérifier. Et l'extraction n'aurait réglé
 * que les trois fichiers du jour : le quarante et unième contrôleur testé demain aurait buté
 * sur le même mur. La paresse règle la cause, ici, en un seul endroit.
 *
 * Effet de bord supprimé au passage : requérir un module ne se connecte plus tout seul à une
 * base distante. Le contrôle de connexion au démarrage n'a pas disparu, il est devenu explicite
 * — `verifierConnexion()`, appelée par server.js.
 */
let pool = null;
let poolPromise = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER_ADMIN,
            password: process.env.DB_PASSWORD_ADMIN,
            database: process.env.DB_NAME_ADMIN,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            // Anti « stale pool » : la base distante ferme les connexions inactives (wait_timeout)
            // et mysql2 continue de les distribuer → 500 « Internal Server Error » sur les
            // requêtes. On maintient les connexions vivantes et on recycle celles restées inactives.
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            idleTimeout: 60000,
        });
        reglerFuseau(pool);
    }
    return pool;
}

/**
 * FUSEAU DE SESSION — sans lui, l'application affichait l'heure d'UTC.
 *
 * LE DÉFAUT, mesuré en production : il était 18:47 à Lannemezan, l'en-tête `Date` du serveur
 * disait 16:47 (UTC, cohérent), et la dernière ligne du journal d'audit portait 16:38. Deux
 * heures de retard partout où l'on lit un horodatage — journal, cloche, publications de la
 * communauté. Le VPS tourne en UTC, MariaDB en hérite, et `DATE_FORMAT` rend donc de l'UTC.
 *
 * POURQUOI RÉGLER LA SESSION SUFFIT, ET POURQUOI IL N'Y A AUCUNE MIGRATION DE DONNÉES. Une
 * colonne `TIMESTAMP` est stockée en UTC par MariaDB et CONVERTIE à la lecture selon le fuseau
 * de session. Les trente-neuf colonnes de ce schéma qui en sont — `created_at` du journal, des
 * notifications, des publications — se remettent donc à l'heure toutes seules, lignes anciennes
 * comprises. Corriger les données aurait été une faute : elles sont justes, c'est leur lecture
 * qui ne l'était pas.
 *
 * ⚠️ LES COLONNES `DATETIME` NE SE CONVERTISSENT PAS. Ce schéma en compte une petite dizaine —
 * horodatages de signature, `paid_at`, les `*_seen_at`. Elles gardent la valeur écrite : les
 * anciennes, posées sous une session UTC, resteront deux heures en arrière ; les nouvelles
 * seront à l'heure de Paris. Les remettre d'aplomb demande un `CONVERT_TZ` par colonne, donc
 * une migration à part — et un contrôle préalable, car `CONVERT_TZ` rend NULL si les tables de
 * fuseaux de MySQL ne sont pas chargées, ce qui EFFACERAIT les horodatages qu'on veut corriger.
 *
 * ON NE FAIT JAMAIS ÉCHOUER L'APPLICATION POUR UN FUSEAU. Le nom « Europe/Paris » exige les
 * tables de fuseaux côté serveur ; à défaut, on retombe sur le décalage courant calculé ici,
 * qui suit l'heure d'été puisqu'il est recalculé à chaque nouvelle connexion du pool. Le repli
 * se DIT dans le journal : un décalage figé se périmerait au prochain changement d'heure si
 * personne n'apprenait qu'il est en place.
 */
function reglerFuseau(p) {
    p.on('connection', (conn) => {
        conn.query(`SET time_zone = ${conn.escape(FUSEAU)}`, (err) => {
            if (!err) return;
            const repli = decalageCourant(FUSEAU);
            conn.query(`SET time_zone = ${conn.escape(repli)}`, (err2) => {
                if (err2) {
                    console.error(`Fuseau de session : ni « ${FUSEAU} » ni « ${repli} » acceptés `
                        + `(${err2.message}). Les horodatages resteront en UTC.`);
                } else {
                    console.warn(`Fuseau de session : « ${FUSEAU} » inconnu du serveur — repli sur `
                        + `${repli}. Chargez les tables de fuseaux (mysql_tzinfo_to_sql) pour que `
                        + `le changement d'heure suive tout seul.`);
                }
            });
        });
    });
}

/**
 * Façade délibérément ÉTROITE : elle n'expose que ce que le code utilise réellement
 * (`db.promise()` 243 fois, `db.query()` 47 fois), plus de quoi ouvrir et fermer.
 *
 * Volontairement pas un Proxy « qui suit tout » : n'importe quelle inspection de l'objet —
 * un `console.log`, une sonde `.then` d'un `await` malencontreux — créerait le pool et
 * ramènerait exactement le blocage qu'on vient de retirer. Ajouter une méthode ici est un
 * geste conscient d'une ligne.
 */
module.exports = {
    // Mémorisé : `pool.promise()` fabrique une enveloppe à chaque appel, et il y a 243 appels.
    promise() {
        if (!poolPromise) poolPromise = getPool().promise();
        return poolPromise;
    },
    query(...args) {
        return getPool().query(...args);
    },
    getConnection(...args) {
        return getPool().getConnection(...args);
    },
    /** Ferme le pool s'il a été ouvert. Sans lui, un processus de test qui a touché la base
     *  ne rendrait toujours pas la main. Sans objet si personne n'a rien demandé. */
    async end() {
        if (!pool) return;
        const p = pool;
        pool = null;
        poolPromise = null;
        await p.promise().end();
    },
    /** Contrôle de connexion au démarrage — explicite depuis que le pool est paresseux. */
    verifierConnexion() {
        getPool().getConnection((err, connection) => {
            if (err) {
                console.error('Erreur de connexion à la base de données :', err.message);
            } else {
                console.log('Connexion à la base de données réussie.');
                connection.release();
            }
        });
    },
};

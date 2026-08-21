const mysql = require('mysql2');
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
    }
    return pool;
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

const mysql = require('mysql2');
const dotenv = require('dotenv');
const path = require('path');

// Charge les variables d'environnement depuis config/.env (à côté de ce fichier).
dotenv.config({ path: path.join(__dirname, '.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER_ADMIN,
    password: process.env.DB_PASSWORD_ADMIN,
    database: process.env.DB_NAME_ADMIN,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Test de connexion au démarrage.
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Erreur de connexion à la base de données :', err.message);
    } else {
        console.log('Connexion à la base de données réussie.');
        connection.release();
    }
});

module.exports = pool;

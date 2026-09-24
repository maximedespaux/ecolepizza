/**
 * UNE ARCHIVE ZIP ÉCRITE AU FIL DE L'EAU (2026-09-24) — l'export d'une session, d'une semaine ou
 * d'une année du coffre, sans jamais tenir le tout en mémoire.
 *
 * POURQUOI PAS PizZip, pourtant déjà installé. PizZip construit l'archive EN MÉMOIRE et ne la rend
 * qu'à la fin. Le coffre pèse 681 Mo et une année en porte la moitié : la tenir deux fois (les
 * fichiers, puis l'archive) sur une machine de 3,7 Go qui sert aussi la base et LibreOffice, c'est
 * risquer la panne de tout le site pour un téléchargement. Ici, chaque document part dès qu'il est
 * prêt, et seul celui qu'on écrit est en mémoire.
 *
 * « STOCKÉ » ET NON COMPRESSÉ : un PDF est déjà compressé, une photo de pièce d'identité aussi. Les
 * recompresser coûterait du processeur pour quelques pour cent.
 *
 * LES LIMITES DU FORMAT SANS ZIP64 : 65 535 fichiers et 4 Go. Le coffre entier en est loin (1 272
 * documents, 681 Mo). Si l'une est atteinte, on S'ARRÊTE par une erreur plutôt que d'écrire une
 * archive que rien n'ouvrirait.
 */
const zlib = require('zlib');
const { once } = require('events');

/* CRC-32 : celui de zlib quand Node le fournit (22.2 et après), sinon la table classique — le
   serveur de production ne suit pas forcément la version du poste de développement. */
const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32Table(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
const crc32 = (buf) => (typeof zlib.crc32 === 'function' ? zlib.crc32(buf) >>> 0 : crc32Table(buf));

/** Date au format MS-DOS (celui du ZIP), à la seconde paire, jamais avant 1980. */
function dateDos(d) {
    const date = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
    const annee = Math.min(2107, Math.max(1980, date.getFullYear()));
    return {
        heure: ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xFFFF,
        jour: (((annee - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF,
    };
}

function erreur(code, message) { const e = new Error(message); e.code = code; return e; }

/**
 * @param sortie un flux inscriptible (la réponse HTTP)
 * @returns {{ ajouter(nom, donnees, date?): Promise, terminer(): Promise, nombre: number }}
 */
function ecrivainZip(sortie) {
    let position = 0;
    const centrale = [];
    /* LA CONTRE-PRESSION EST RESPECTÉE : si le navigateur lit moins vite qu'on n'écrit, on attend
       qu'il rattrape, au lieu d'empiler l'archive entière dans la mémoire du serveur. Et si la
       connexion se ferme en route (téléchargement annulé), on s'arrête là. */
    const ecrire = async (buf) => {
        if (sortie.destroyed || sortie.writableEnded) throw erreur('ZIP_ABANDON', 'Téléchargement interrompu.');
        position += buf.length;
        if (!sortie.write(buf)) {
            await Promise.race([once(sortie, 'drain'), once(sortie, 'close')]);
            if (sortie.destroyed) throw erreur('ZIP_ABANDON', 'Téléchargement interrompu.');
        }
    };
    return {
        async ajouter(nom, donnees, date) {
            if (centrale.length >= 0xFFFF) throw erreur('ZIP_LIMITE', 'Plus de 65 535 fichiers : exportez une période plus courte.');
            const nomBuf = Buffer.from(String(nom), 'utf8');
            const data = Buffer.isBuffer(donnees) ? donnees : Buffer.from(donnees == null ? '' : donnees);
            if (position + 30 + nomBuf.length + data.length > 0xFFFFFFFF) {
                throw erreur('ZIP_LIMITE', 'Archive de plus de 4 Go : exportez une période plus courte.');
            }
            const crc = crc32(data);
            const { heure, jour } = dateDos(date);
            const debut = position;
            const tete = Buffer.alloc(30);
            tete.writeUInt32LE(0x04034b50, 0);   // en-tête local
            tete.writeUInt16LE(20, 4);           // version nécessaire : 2.0
            tete.writeUInt16LE(0x0800, 6);       // noms en UTF-8 (« Évaluations », « Droit à l'image »)
            tete.writeUInt16LE(0, 8);            // méthode : stocké
            tete.writeUInt16LE(heure, 10);
            tete.writeUInt16LE(jour, 12);
            tete.writeUInt32LE(crc, 14);
            tete.writeUInt32LE(data.length, 18); // taille compressée = taille réelle
            tete.writeUInt32LE(data.length, 22);
            tete.writeUInt16LE(nomBuf.length, 26);
            tete.writeUInt16LE(0, 28);
            await ecrire(tete);
            await ecrire(nomBuf);
            await ecrire(data);
            centrale.push({ nomBuf, crc, taille: data.length, heure, jour, debut });
        },
        async terminer() {
            const debutCentrale = position;
            for (const e of centrale) {
                const c = Buffer.alloc(46);
                c.writeUInt32LE(0x02014b50, 0);  // entrée du répertoire central
                c.writeUInt16LE(20, 4);          // créé par : 2.0
                c.writeUInt16LE(20, 6);          // version nécessaire
                c.writeUInt16LE(0x0800, 8);
                c.writeUInt16LE(0, 10);
                c.writeUInt16LE(e.heure, 12);
                c.writeUInt16LE(e.jour, 14);
                c.writeUInt32LE(e.crc, 16);
                c.writeUInt32LE(e.taille, 20);
                c.writeUInt32LE(e.taille, 24);
                c.writeUInt16LE(e.nomBuf.length, 28);
                // extra, commentaire, disque, attributs internes et externes : 0
                c.writeUInt32LE(e.debut, 42);
                await ecrire(c);
                await ecrire(e.nomBuf);
            }
            const fin = Buffer.alloc(22);
            fin.writeUInt32LE(0x06054b50, 0);    // fin du répertoire central
            fin.writeUInt16LE(centrale.length, 8);
            fin.writeUInt16LE(centrale.length, 10);
            fin.writeUInt32LE(position - debutCentrale, 12);
            fin.writeUInt32LE(debutCentrale, 16);
            await ecrire(fin);
        },
        get nombre() { return centrale.length; },
    };
}

module.exports = { ecrivainZip, crc32, crc32Table };

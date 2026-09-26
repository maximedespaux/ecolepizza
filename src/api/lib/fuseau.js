/**
 * FUSEAU DE LA BASE — l'application affichait l'heure d'UTC.
 *
 * MESURÉ EN PRODUCTION : il était 18:47 à Lannemezan, l'en-tête `Date` du serveur disait 16:47
 * (UTC, cohérent), et la dernière ligne du journal d'audit portait 16:38. Deux heures de retard
 * partout où l'on lit un horodatage — journal, cloche, publications de la communauté. Le VPS
 * tourne en UTC, MariaDB en hérite, et `DATE_FORMAT` rend donc de l'UTC.
 *
 * CE FICHIER EXISTE POUR ÊTRE ÉPROUVÉ SEUL. Le calcul du décalage de repli est la seule partie
 * qui puisse se tromper en silence : un signe inversé décalerait de quatre heures au lieu de
 * deux, et personne ne s'en apercevrait avant l'hiver. `config/database.js` porte, lui, une
 * façade délibérément étroite qu'on ne doit pas élargir pour les besoins d'un test.
 */

/** Fuseau visé. Configurable, parce qu'un autre organisme n'est pas forcément à Paris. */
const FUSEAU = process.env.DB_TIMEZONE || 'Europe/Paris';

/**
 * Décalage courant d'un fuseau, au format accepté par `SET time_zone` (« +02:00 »).
 *
 * SERT DE REPLI quand le serveur ne connaît pas les noms de fuseaux : `SET time_zone =
 * 'Europe/Paris'` exige les tables chargées par `mariadb-tzinfo-to-sql` (`mysql_tzinfo_to_sql`
 * avant MariaDB 11), absentes de beaucoup
 * d'installations. Le décalage, lui, est toujours accepté.
 *
 * IL SUIT L'HEURE D'ÉTÉ parce qu'il est recalculé à chaque nouvelle connexion du pool, et non
 * figé au démarrage. On compare le même instant lu dans le fuseau visé et en UTC : la
 * différence EST le décalage, sans table à tenir ni règle de changement d'heure à écrire.
 */
function decalageCourant(zone = FUSEAU) {
    const d = new Date();
    const enZone = new Date(d.toLocaleString('en-US', { timeZone: zone }));
    const enUtc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    const minutes = Math.round((enZone - enUtc) / 60000);
    const signe = minutes < 0 ? '-' : '+';
    const abs = Math.abs(minutes);
    return `${signe}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/**
 * Le jour (AAAA-MM-JJ) et l'heure (en minutes) dans le fuseau de l'organisme.
 * LE SERVEUR TOURNE EN UTC : `new Date().getHours()` y rend deux heures de moins qu'à Lannemezan
 * l'été, et la date de la veille entre minuit et deux heures.
 *
 * Vivait dans lib/relancesEmargement.js ; elle sert désormais aussi à la fenêtre de signature du
 * stagiaire et à la feuille imprimée (lib/emargement.js), qui ne peuvent pas dépendre des relances.
 */
function maintenantA(zone = FUSEAU, instant = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(instant).map((x) => [x.type, x.value]));
    return { jour: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

module.exports = { FUSEAU, decalageCourant, maintenantA };

/*
 * COMMUNAUTÉ : des horodatages qui se convertissent enfin au fuseau de lecture.
 *
 * LE DÉFAUT. Mesuré en production : il était 18:47 à Lannemezan, l'en-tête `Date` du serveur
 * disait 16:47 (UTC, cohérent), et les horodatages affichés portaient deux heures de retard.
 * Le VPS tourne en UTC et MariaDB en hérite.
 *
 * Le correctif principal est ailleurs — la session pose désormais « Europe/Paris »
 * (`lib/fuseau.js`). Il suffit aux colonnes `TIMESTAMP`, que MariaDB stocke en UTC et CONVERTIT
 * à la lecture : le journal d'audit et les notifications se remettent à l'heure toutes seules,
 * lignes anciennes comprises, sans qu'on touche à une donnée.
 *
 * MAIS LES TROIS TABLES DE LA COMMUNAUTÉ SONT EN `DATETIME` (migration 114), et un `DATETIME` ne
 * se convertit PAS : il rend ce qu'on y a écrit. Leurs lignes, posées sous une session UTC,
 * resteraient deux heures en arrière pour toujours, pendant que les nouvelles seraient à
 * l'heure de Paris — deux régimes dans la même colonne, ce qui est pire que le défaut.
 *
 * POURQUOI CONVERTIR LE TYPE PLUTÔT QUE LES VALEURS. Un `UPDATE … CONVERT_TZ(...)` corrigerait
 * les lignes présentes et rien d'autre : le problème reviendrait à la prochaine table créée en
 * DATETIME. Surtout, `CONVERT_TZ` rend NULL quand les tables de fuseaux de MySQL ne sont pas
 * chargées — il EFFACERAIT les horodatages qu'on veut corriger — et rejouer l'UPDATE décalerait
 * une seconde fois. Changer le type règle la cause.
 *
 * LE `SET time_zone = '+00:00'` CI-DESSOUS EST LE CŒUR DE L'OPÉRATION. En passant de DATETIME à
 * TIMESTAMP, MariaDB interprète la valeur existante COMME ÉTANT dans le fuseau de la session,
 * puis la range en UTC. Les valeurs présentes SONT de l'UTC : il faut donc que la session soit
 * en UTC à cet instant précis, sinon elles seraient prises pour de l'heure de Paris et
 * décalées à l'envers. C'est la seule ligne de ce fichier qu'il ne faut pas retirer.
 *
 * REJOUABLE. Convertir un TIMESTAMP en TIMESTAMP ne déplace aucune valeur : relancer ce fichier
 * ne décale rien, contrairement à un UPDATE.
 */

SET time_zone = '+00:00';

ALTER TABLE community_post
    MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE community_answer
    MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE community_image
    MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

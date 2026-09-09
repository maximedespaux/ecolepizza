/**
 * LECTURE D'UNE CAPACITÉ DANS `nav_access` — la règle, écrite une seule fois.
 *
 * Une capacité est un droit nominatif qui ne se dit pas en « lecture / modification » : modérer
 * la communauté, révéler les montants, supprimer une notification. Elle se range dans le même
 * `nav_access` que les rubriques, sous une clé préfixée `cap:`, et se coche dans « Équipe &
 * accès ».
 *
 * POURQUOI CE FICHIER. Le format de `nav_access` a trois formes historiques (nul, JSON en
 * chaîne, ancien tableau où tout est accordé). `moderation.js` savait les lire, `moneyPrivacy.js`
 * côté écran aussi, et une troisième copie allait naître avec la suppression des notifications.
 * Trois lectures d'un même droit finissent par diverger — et une divergence sur un droit de
 * suppression ne se remarque qu'après coup, quand quelque chose a déjà disparu.
 *
 * RELUE EN BASE À CHAQUE APPEL, jamais prise dans le jeton : celui-ci vit jusqu'à sept jours,
 * et retirer une capacité doit prendre effet tout de suite. C'est déjà le choix de
 * `sectionAccess.middleware` et de `moderation.js`, pour la même raison.
 */
const db = require('../config/database.js');

/** Cette carte d'accès porte-t-elle cette capacité ? Pure — les trois formats sont gérés ici. */
function aLaCapacite(navAccess, cap) {
    if (!navAccess) return false;
    let map = navAccess;
    if (typeof map === 'string') { try { map = JSON.parse(map); } catch { return false; } }
    if (Array.isArray(map)) return map.includes(cap);              // ancien format = tout accordé
    return !!map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, cap);
}

/**
 * Version qui interroge la base. `rolesDoffice` = les rôles qui l'ont sans qu'on la leur accorde ;
 * cette liste DOIT être la même que le `defaultRoles` affiché dans « Équipe & accès », sinon
 * l'écran annonce un droit que le serveur donne quand même (ou l'inverse) — un test le vérifie.
 */
async function aLaCapaciteEnBase(user, cap, rolesDoffice = []) {
    if (!user) return false;
    if (rolesDoffice.includes(user.role)) return true;
    try {
        const [[row]] = await db.promise().query('SELECT nav_access FROM user WHERE id = ?', [user.id]);
        return aLaCapacite(row && row.nav_access, cap);
    } catch { return false; } // dans le doute on refuse : un refus se rattrape, pas une suppression
}

module.exports = { aLaCapacite, aLaCapaciteEnBase };

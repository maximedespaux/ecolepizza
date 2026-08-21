/**
 * Horaires d'ouverture de l'École Pizza — SOURCE UNIQUE, et vraiment unique.
 *
 * Le front NE RECOPIE PAS cette table : il demande les créneaux à l'API
 * (`GET /api/mon-espace/boutique/creneaux`) et se contente de les afficher. Une table
 * dupliquée des deux côtés finit toujours par diverger — et ça donne un stagiaire à qui on
 * propose un créneau que le serveur refuse ensuite, sans qu'il comprenne pourquoi.
 * Corollaire : pour changer les horaires, on ne touche qu'à ce fichier.
 *
 * ⚠️ Le mercredi n'ouvre QUE le matin. C'est le piège classique de ce genre de table :
 * on écrit une règle « 9h-12h30 / 14h-17h » pour tout le monde, et on donne rendez-vous
 * à quelqu'un un mercredi à 15h — porte close.
 */

/* Clé = getDay() JS : 0 = dimanche … 6 = samedi. Plages en minutes depuis minuit. */
const HM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

const OPENING = {
    1: [['09:00', '12:30'], ['14:00', '17:00']], // lundi
    2: [['09:00', '12:30'], ['14:00', '17:00']], // mardi
    3: [['09:00', '12:30']],                     // mercredi — MATIN SEULEMENT
    4: [['09:00', '12:30'], ['14:00', '17:00']], // jeudi
    5: [['09:00', '12:30'], ['14:00', '17:00']], // vendredi
    6: [],                                        // samedi — fermé
    0: [],                                        // dimanche — fermé
};

/** Un jour où l'école ouvre — sert de définition du « jour ouvré » ici. */
const estOuvre = (dow) => (OPENING[dow] || []).length > 0;

/**
 * Le premier jour de retrait possible, à `n` JOURS OUVRÉS d'aujourd'hui.
 * Sert au délai de fabrication du textile brodé.
 *
 * Ouvrés et pas calendaires : une veste commandée un jeudi serait « prête » le mardi en
 * 5 jours calendaires, alors que le brodeur n'aurait travaillé que 3 jours. Le week-end ne
 * compte donc pas.
 *
 * @returns "YYYY-MM-DD" en heure LOCALE (jamais toISOString, cf. isOpenAt).
 */
function minPickupDate(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0); // midi : à l'abri des bascules d'heure d'été
    let ajoutes = 0;
    while (ajoutes < n) { d.setDate(d.getDate() + 1); if (estOuvre(d.getDay())) ajoutes += 1; }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Créneaux de 30 mn d'un jour donné, en « HH:MM ». Vide si fermé. */
function slotsForDay(dow, stepMin = 30) {
    const out = [];
    for (const [from, to] of OPENING[dow] || []) {
        // Le dernier créneau COMMENCE avant la fermeture : un retrait à 17h00 pile,
        // alors qu'on ferme à 17h00, n'a aucun sens.
        for (let t = HM(from); t + stepMin <= HM(to); t += stepMin) {
            out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
        }
    }
    return out;
}

/**
 * Valide un créneau reçu du client. Renvoie { ok, reason }.
 *
 * @param iso  "YYYY-MM-DDTHH:MM" en HEURE LOCALE, sans Z ni décalage.
 *
 * ⚠️ NE JAMAIS construire cette chaîne avec `toISOString()` : il repasse en UTC, donc un
 * lundi 00h00 à Paris devient un dimanche 22h00 — et le créneau tombe le mauvais jour.
 * Le bug est silencieux (la date reste « valide ») et il a déjà piégé le test de ce fichier.
 * On parle d'une porte physique à Lannemezan : la seule heure qui existe, c'est l'heure locale.
 * Côté front, formater à la main : `${y}-${mm}-${dd}T${hh}:${mi}`.
 */
function isOpenAt(iso) {
    if (!iso) return { ok: true }; // pas de créneau = « je passerai », c'est permis
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(iso));
    if (!m) return { ok: false, reason: 'Créneau illisible.' };
    const [, Y, Mo, D, H, Mi] = m.map(Number);
    const d = new Date(Y, Mo - 1, D, H, Mi);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: 'Date invalide.' };

    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d < today) return { ok: false, reason: 'Ce créneau est déjà passé.' };

    const slots = slotsForDay(d.getDay());
    if (!slots.length) return { ok: false, reason: 'L’école est fermée ce jour-là.' };
    const hhmm = `${String(H).padStart(2, '0')}:${String(Mi).padStart(2, '0')}`;
    if (!slots.includes(hhmm)) return { ok: false, reason: 'L’école est fermée à cette heure-là.' };
    return { ok: true };
}

module.exports = { OPENING, slotsForDay, isOpenAt, minPickupDate };

/**
 * CADRES DE PIZZA QUEST — la progression du jeu, portée sur l'avatar.
 *
 * POURQUOI UNE AUTRE FAMILLE. Les cadres existants (`lib/cadres.js`, côté client) récompensent
 * les formations RÉELLEMENT TERMINÉES : Bronze à une, Maestro à huit. C'est un rythme d'années.
 * Entre deux formations, un stagiaire qui joue tous les jours et boucle ses chapitres ne voyait
 * strictement rien changer — Pizza Quest ne laissait aucune trace hors de Pizza Quest, alors que
 * c'est le seul endroit où il revient de lui-même.
 *
 * TROIS PALIERS PAR FORMATION, et pas un de plus. Ils reprennent les trois moments qui se
 * remarquent en jouant :
 *   · MOITIÉ  — la moitié des chapitres terminés. Le palier du milieu, celui qui dit « continue ».
 *   · BOUCLÉ  — tous les chapitres terminés, quelles que soient les étoiles.
 *   · SANS FAUTE — tous les chapitres à 3 étoiles. Celui-là se mérite : 3 étoiles demandent 90 %
 *     de bonnes réponses (cf. PizzaQuest.jsx), et il faut les avoir sur CHAQUE chapitre.
 *
 * LA COULEUR VIENT DE LA FORMATION. Un cadre « Sans faute » n'existe pas dans l'absolu : il est
 * sans faute SUR une formation, et il en porte la couleur (`training_program.color`, la même que
 * la pastille du monde dans le jeu). Deux stagiaires « Sans faute » sur deux formations
 * différentes ne portent donc pas le même cadre — c'est ce qui rend la récompense lisible :
 * on voit DE QUOI quelqu'un est venu à bout, pas seulement qu'il a joué.
 *
 * D'où la forme `palier|#rrggbb` pour la valeur enregistrée — exactement la convention déjà
 * utilisée par les avatars (`id|#rrggbb`, cf. gamification.js). La couleur voyage avec le choix,
 * donc la Communauté affiche le bon cadre sans avoir à retrouver de quelle formation il vient.
 *
 * UN MONDE SANS CHAPITRE NE DONNE RIEN. Une formation dont la banque de questions est vide
 * aurait « tous ses chapitres terminés » à zéro sur zéro — et distribuerait le palier le plus
 * dur à qui n'a rien joué. C'est le premier défaut que gèle le test.
 */

/* LA COULEUR D'UNE FORMATION N'EST PRESQUE JAMAIS EN BASE. Mesuré sur la base réelle : sur six
   formations, deux portent une couleur, quatre ont `color = NULL`. Se contenter de la colonne
   aurait donné le MÊME cadre rouge de repli à presque tout le monde — et la promesse « la
   couleur de ta formation » n'aurait tenu que pour deux formations sur six.
   Le jeu, lui, ne s'est jamais contenté de la colonne : il retombe sur `colorOf` (ui/lib/levels.js),
   qui donne à chaque code une couleur stable. Le cadre reprend LA MÊME, sans quoi l'anneau ne
   serait pas de la couleur du monde qu'il récompense — et c'est tout ce qui le rend lisible.
   Les deux tables sont épinglées ensemble par `test/cadres-quest.test.js`. */
const PALETTE = {
    NIV1: '#1e3a8a', NIV1_PRO: '#dc2626', NIV1PRO: '#dc2626', NIV1H: '#1e3a8a',
    NIV2: '#eab308', NIV2C: '#eab308', EXPERT: '#374151',
    RS: '#16a34a', RS7404: '#16a34a',
    NAPO: '#2f9e6f', TEGLIA: '#b8860b',
};
const INCONNU = '#9aa0b4';

/** HSL -> #rrggbb. Le client peut écrire `hsl(...)` en CSS ; la base, elle, stocke un hexa. */
function hslEnHexa(h, s, l) {
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const canal = (n) => {
        const k = (n + h / 30) % 12;
        const v = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
        return Math.round(255 * v).toString(16).padStart(2, '0');
    };
    return `#${canal(0)}${canal(8)}${canal(4)}`;
}

/**
 * Miroir de `hashColor` (ui/lib/levels.js) : une teinte stable pour un code non répertorié.
 *
 * UNE COULEUR TIRÉE DU CODE, ET NON AU HASARD. L'effet recherché est le même — chaque formation
 * sans couleur en base reçoit la sienne, au lieu que toutes se ressemblent — mais un vrai tirage
 * aléatoire serait ingérable ICI : la teinte est ENREGISTRÉE dans le cadre porté et sert à en
 * vérifier la possession. Retirée à chaque lecture, elle invaliderait le cadre à la seconde
 * suivante, et deux stagiaires de la même formation n'auraient pas le même anneau.
 * Le hachage donne le désordre voulu sans l'instabilité. Dès que l'école enregistre une couleur,
 * c'est la sienne qui prime (cf. `couleurFormation`).
 */
function couleurDeHachage(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return hslEnHexa(h % 360, 52, 42);
}

/** La couleur d'une formation : la sienne, celle de la palette, ou une teinte stable de son code. */
function couleurFormation(code, couleurEnBase) {
    if (/^#[0-9a-fA-F]{6}$/.test(couleurEnBase || '')) return couleurEnBase;
    if (!code) return INCONNU;
    const K = String(code).trim().toUpperCase();
    return PALETTE[String(code).trim()] || PALETTE[K] || couleurDeHachage(K);
}

/** Les trois paliers, du plus facile au plus rare. L'ordre compte : on ne garde que le meilleur. */
const PALIERS = [
    { id: 'qdemi', nom: 'Sur la voie', desc: 'La moitié des chapitres terminés' },
    { id: 'qfini', nom: 'Monde bouclé', desc: 'Tous les chapitres terminés' },
    { id: 'qparfait', nom: 'Sans faute', desc: 'Tous les chapitres à 3 étoiles' },
];
const PALIER_IDS = PALIERS.map((p) => p.id);

/**
 * LES EXPLOITS — sept cadres qui ne tiennent PAS à une formation, mais à l'ensemble du jeu.
 *
 * POURQUOI EN AJOUTER. Les trois paliers récompensent une formation à la fois : on les gagne
 * vite, puis plus rien ne bouge tant qu'on n'attaque pas un autre monde. Ceux-ci récompensent
 * ce que les premiers ignorent — la LARGEUR (avoir touché à plusieurs mondes) et la DURÉE
 * (le total d'étoiles, qui ne cesse jamais de monter). Il y a donc toujours un objectif devant,
 * y compris pour qui a déjà bouclé sa formation.
 *
 * PAS DE COULEUR DE FORMATION : ils n'appartiennent à aucune. Leur valeur enregistrée est donc
 * leur seul identifiant, sans le `|#rrggbb` des paliers — et ils tiennent largement dans la
 * colonne.
 *
 * `test(bilan)` reçoit le bilan de TOUS les mondes : total d'étoiles, mondes touchés, bouclés,
 * sans faute, et le nombre de mondes qui ont des chapitres. Les seuils sont volontairement
 * espacés : deux cadres qui tombent le même jour n'en font qu'un.
 */
const EXPLOITS = [
    { id: 'qpas', nom: 'Premier pas', desc: 'Un premier chapitre terminé',
        test: (b) => b.chapitresFaits >= 1 },
    { id: 'qtouche', nom: 'Touche-à-tout', desc: 'Joué dans 3 formations différentes',
        test: (b) => b.mondesTouches >= 3 },
    { id: 'qcent', nom: 'Centurion', desc: '100 étoiles récoltées',
        test: (b) => b.etoiles >= 100 },
    { id: 'qcollec', nom: 'Collectionneur', desc: '3 formations entièrement terminées',
        test: (b) => b.mondesBoucles >= 3 },
    { id: 'qlegende', nom: 'Légende', desc: '250 étoiles récoltées',
        test: (b) => b.etoiles >= 250 },
    { id: 'qintouch', nom: 'Intouchable', desc: '3 formations sans la moindre faute',
        test: (b) => b.mondesParfaits >= 3 },
    /* LE GRAND CHELEM demande AU MOINS DEUX MONDES : sans ce garde-fou, un organisme n'ayant
       écrit les questions que d'une seule formation le distribuerait en même temps que « Monde
       bouclé » — le cadre le plus rare du jeu, gagné sans rien de plus. */
    { id: 'qchelem', nom: 'Grand Chelem', desc: 'Toutes les formations jouables, sans faute',
        test: (b) => b.mondesJouables >= 2 && b.mondesParfaits >= b.mondesJouables },
];
const EXPLOIT_IDS = EXPLOITS.map((e) => e.id);

/** Une valeur de cadre enregistrée : « qparfait|#dc3e37 » -> { id, couleur }. */
function parseCadre(valeur) {
    const [id, couleur] = String(valeur || '').split('|');
    return { id: id || null, couleur: /^#[0-9a-fA-F]{6}$/.test(couleur || '') ? couleur : null };
}

/**
 * Le palier atteint sur UN monde, ou null.
 *
 * @param etoiles  { [chapitre]: étoiles } — la progression du stagiaire sur ce monde
 * @param nbChapitres  nombre de chapitres actifs de la formation
 */
function palierDuMonde(etoiles = {}, nbChapitres = 0) {
    // Zéro chapitre : rien à terminer, donc rien à récompenser. Sans ce garde-fou, « tous les
    // chapitres à 3 étoiles » serait VRAI sur une banque vide (0 sur 0) et le palier le plus
    // rare tomberait dans l'escarcelle de qui n'a jamais joué.
    if (!nbChapitres) return null;
    const faits = Object.keys(etoiles).filter((k) => Number(etoiles[k]) > 0).length;
    const parfaits = Object.keys(etoiles).filter((k) => Number(etoiles[k]) >= 3).length;
    if (parfaits >= nbChapitres) return 'qparfait';
    if (faits >= nbChapitres) return 'qfini';
    // `Math.ceil` : sur 5 chapitres, la moitié c'est 3 — pas 2,5, et pas 2. On ne fête pas un
    // palier avant qu'il ne soit franchi.
    if (faits >= Math.ceil(nbChapitres / 2)) return 'qdemi';
    return null;
}

/**
 * Tous les cadres de quête possédés, un par monde où un palier est atteint.
 *
 * @param progression  { [codeMonde]: { [chapitre]: étoiles } }
 * @param mondes       [{ code, title, color, chapitres }]
 * @returns [{ id, valeur, palier, nom, code, title, color }] — `valeur` est ce qui s'enregistre.
 */
function cadresQuest(progression = {}, mondes = []) {
    const out = [];
    /* Le bilan de TOUS les mondes, pour les exploits. Il se construit dans la même boucle : le
       recalculer ailleurs, à partir des mêmes données, ferait deux règles à tenir d'accord. */
    const bilan = { etoiles: 0, chapitresFaits: 0, mondesTouches: 0, mondesBoucles: 0, mondesParfaits: 0, mondesJouables: 0 };
    for (const m of mondes) {
        const etoiles = progression[m.code] || {};
        const nb = m.chapitres || 0;
        /* UN MONDE SANS CHAPITRE NE COMPTE POUR RIEN, bilan compris. La règle vaut déjà pour les
           paliers ; l'oublier ici laissait une progression ORPHELINE — celle d'une formation dont
           l'école a depuis vidé la banque — décrocher « Premier pas ». Un exploit doit se rejouer :
           s'il tient à des chapitres qui n'existent plus, personne ne peut plus l'obtenir. */
        if (!nb) continue;
        bilan.mondesJouables += 1;
        for (const v of Object.values(etoiles)) {
            const n = Number(v) || 0;
            bilan.etoiles += n;
            if (n > 0) bilan.chapitresFaits += 1;
        }
        if (Object.values(etoiles).some((v) => Number(v) > 0)) bilan.mondesTouches += 1;

        const palier = palierDuMonde(etoiles, nb);
        if (!palier) continue;
        if (palier === 'qfini' || palier === 'qparfait') bilan.mondesBoucles += 1;
        if (palier === 'qparfait') bilan.mondesParfaits += 1;
        const p = PALIERS.find((x) => x.id === palier);
        // La couleur du MONDE, exactement celle qu'affiche le jeu : sa colonne si l'école l'a
        // choisie, sinon la teinte stable de son code (cf. couleurFormation ci-dessus).
        const color = couleurFormation(m.code, m.color);
        out.push({ id: palier, valeur: `${palier}|${color}`, palier, nom: p.nom, desc: p.desc,
            code: m.code, title: m.title || m.code, color });
    }
    for (const e of EXPLOITS) {
        if (!e.test(bilan)) continue;
        out.push({ id: e.id, valeur: e.id, palier: e.id, nom: e.nom, desc: e.desc, global: true });
    }
    return out;
}

/**
 * Le stagiaire possède-t-il ce cadre de quête ?
 *
 * On compare la VALEUR ENTIÈRE, pas le seul palier — et pour les paliers la valeur contient la
 * couleur. Sans cela, un stagiaire « Sans faute » sur la formation bleue pourrait porter le rouge
 * d'une formation qu'il n'a jamais jouée : le cadre affirmerait quelque chose de faux, ce qui est
 * pire que de ne rien dire. Les exploits, eux, n'ont pas de couleur — leur valeur est leur id.
 */
function possedeCadreQuest(valeur, cadres = []) {
    const v = String(valeur || '').toLowerCase();
    const { id } = parseCadre(valeur);
    if (!PALIER_IDS.includes(id) && !EXPLOIT_IDS.includes(id)) return false;
    return cadres.some((c) => String(c.valeur).toLowerCase() === v);
}

module.exports = { PALIERS, PALIER_IDS, EXPLOITS, EXPLOIT_IDS, PALETTE, parseCadre, palierDuMonde, cadresQuest, possedeCadreQuest, couleurFormation };

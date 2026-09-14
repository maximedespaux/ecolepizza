/**
 * « ENVOI DU FICHIER ÉCHOUÉ » — UN MESSAGE QUI NE DIT RIEN.
 *
 * LE DÉFAUT, rencontré en déposant deux justificatifs : l'un passait, l'autre était refusé avec
 * « Envoi du fichier échoué ». Aucune raison, aucune piste. Les deux fichiers pesaient 356 Ko
 * et 5 205 Ko — et le navigateur ne rend PAS la liste des fichiers dans l'ordre où on les
 * désigne, ce qui brouillait encore la lecture : le « premier » refusé n'était pas le premier
 * choisi.
 *
 * DEUX CAUSES.
 *
 * 1. AUCUN GESTIONNAIRE D'ERREURS dans toute l'API. Ce qui échoue AVANT le code métier —
 *    multer refusant un fichier trop lourd, un corps JSON illisible — tombait sur le
 *    gestionnaire par défaut d'Express, qui répond en HTML. Le front lit du JSON : il n'y
 *    trouvait ni `message` ni `error`, et affichait son texte de repli. Le serveur savait
 *    exactement ce qui n'allait pas ; rien ne le transmettait.
 *
 * 2. LA COUPURE DE TRANSPORT IGNORAIT LE RÉGLAGE DE LA PIÈCE. `MAX_OCTETS` (3 Mo) n'est que le
 *    plafond COMMUN, celui d'une pièce sans réglage propre ; chaque pièce peut relever le sien
 *    jusqu'à 25 Mo. Mais multer était calé sur `MAX_OCTETS + 512 Ko`, soit 3,5 Mo pour tout le
 *    monde : régler une pièce à 10 Mo ne changeait rien, le fichier mourait avant d'atteindre
 *    le code qui connaît la limite. Le réglage par pièce était un affichage.
 *
 * TROISIÈME CORRECTION, née du même cas : la boucle d'envoi s'arrêtait au premier refus. C'était
 * défendable pour un quota atteint, faux pour une taille ou un format — motifs PROPRES au
 * fichier. Elle continue, et nomme chaque fichier refusé : sans le nom, il reste à deviner
 * lequel manque.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const SERVEUR = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes/piece.routes.js'), 'utf8');
const FICHE = fs.readFileSync(path.join(RACINE, 'app/ui/pages/StagiaireDetail.jsx'), 'utf8');
const ESPACE = fs.readFileSync(path.join(RACINE, 'app/ui/pages/StudentFormationDetail.jsx'), 'utf8');

const { MAX_OCTETS, MAX_OCTETS_ABSOLU, champsType } = require('../controllers/piece.controller.js');

test('une erreur hors contrôleur revient en JSON, jamais en HTML', () => {
    /* QUATRE ARGUMENTS : c'est à l'arité qu'Express reconnaît un gestionnaire d'erreurs. En
       retirer un le rendrait muet sans rien casser d'autre — la panne serait invisible. */
    assert.match(SERVEUR, /app\.use\(\(err, req, res, next\) => \{/,
        'le gestionnaire doit prendre (err, req, res, next), sinon Express ne l\'appelle jamais');
    assert.match(SERVEUR, /LIMIT_FILE_SIZE/, 'un fichier trop lourd doit répondre lisiblement');
    assert.match(SERVEUR, /res\.status\(413\)/);
    assert.match(SERVEUR, /res\.status\(500\)\.json\(\{ error: 'Internal Server Error' \}\)/,
        'le détail d\'une erreur ne sort jamais : il porte chemins et fragments de requêtes');
});

test('le gestionnaire est posé APRÈS les routes', () => {
    /* Placé avant, il ne verrait rien : Express traverse la pile dans l'ordre de déclaration. */
    assert.ok(SERVEUR.indexOf("app.use('/api/pieces'") < SERVEUR.indexOf('app.use((err, req, res, next)'),
        'un gestionnaire d\'erreurs déclaré avant les routes n\'est jamais atteint');
});

test('la coupure de transport se cale sur le plafond ABSOLU, pas sur le plafond commun', () => {
    assert.match(ROUTES, /fileSize: MAX_OCTETS_ABSOLU \+ 512 \* 1024/,
        'calée sur MAX_OCTETS, elle tranchait à 3,5 Mo même pour une pièce réglée plus haut');
    assert.doesNotMatch(ROUTES, /fileSize: MAX_OCTETS \+/);
    assert.ok(MAX_OCTETS_ABSOLU > MAX_OCTETS, 'le plafond absolu doit dépasser le plafond commun');
});

test('le plafond réglable par pièce ne dépasse jamais ce que le transport laisse passer', () => {
    /* Le réglage d'écran et la coupure de transport doivent venir du MÊME nombre, sinon on peut
       régler une pièce à une taille que multer refusera — avec le message vide d'avant. */
    const enorme = champsType({ label: 'X', max_octets: 999 * 1024 * 1024 });
    assert.strictEqual(enorme.max_octets, MAX_OCTETS_ABSOLU,
        'un réglage démesuré doit être ramené au plafond absolu');
});

for (const [nom, SRC] of [['la fiche stagiaire', FICHE], ['l\'espace du stagiaire', ESPACE]]) {
    test(`${nom} nomme les fichiers refusés et ne s'arrête pas au premier`, () => {
        assert.match(SRC, /echecs\.push\(`\$\{f\.name\}/,
            'chaque refus doit porter le NOM du fichier, sinon on devine lequel manque');
        assert.doesNotMatch(SRC, /catch \(err\) \{[^}]*break;/,
            'un refus propre au fichier (taille, format) ne condamne pas les suivants');
        assert.match(SRC, /echecs\.join\(" · "\)/, 'tous les refus doivent être rendus');
    });
}

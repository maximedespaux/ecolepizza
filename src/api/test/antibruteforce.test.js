/**
 * Le limiteur anti-force brute doit tenir contre celui qu'il vise.
 *
 * LE DÉFAUT GELÉ ICI, et il annulait la protection ENTIÈRE. L'adresse du client était lue dans
 * `x-forwarded-for`, sans condition — or cet en-tête est fourni par le CLIENT, et aucun
 * `trust proxy` n'était configuré. Il suffisait d'en envoyer un différent à chaque requête
 * (`X-Forwarded-For: 1.2.3.4`, puis `1.2.3.5`…) pour obtenir une clé neuve à chaque fois et ne
 * jamais atteindre le plafond. La protection se désactivait en une ligne de curl.
 *
 * Mesuré avant/après sur l'API en marche : trois tentatives avec un `X-Forwarded-For` différent
 * à chaque coup renvoient désormais 429 — elles renvoyaient 401 indéfiniment.
 *
 * DEUX AUTRES DÉFAUTS, de disponibilité ceux-là, et propres à ce métier. Une école de formation
 * est derrière UN SEUL IP public : toute la promotion partage l'adresse.
 *  · Le compteur montait aussi sur les SUCCÈS : une classe qui se connecte le matin épuisait le
 *    plafond en quelques secondes, sans que personne n'ait rien tenté de forcer.
 *  · La clé était l'IP SEULE : les fautes de frappe d'un stagiaire pénalisaient ses camarades.
 *
 * L'identifiant tenté entre dans la clé, qu'il existe ou non : le 429 arrive au même moment pour
 * un compte réel et pour un e-mail inventé. Sans cela, il dirait quels comptes existent — et le
 * soin pris ailleurs (hash leurre pour égaliser le temps de réponse) serait perdu.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const srcLim = fs.readFileSync(path.join(API, 'middlewares/rateLimit.js'), 'utf8');
const srcServer = fs.readFileSync(path.join(API, 'server.js'), 'utf8');
const srcRoutes = fs.readFileSync(path.join(API, 'routes/auth.routes.js'), 'utf8');

test('le client ne choisit pas sa propre identité', () => {
    // `req.ip` n'honore `x-forwarded-for` que si `trust proxy` le permet — sinon c'est la SOCKET.
    assert.match(srcLim, /const ipDe = \(req\) => req\.ip \|\| req\.socket\?\.remoteAddress/,
        'l\'adresse doit venir de `req.ip`');
    /* C'est la LECTURE de l'en-tête qu'on interdit, pas le mot : le commentaire qui explique le
       piège vaut mieux que son absence, et une assertion sur la chaîne nue échouait dessus. */
    assert.doesNotMatch(srcLim, /req\.headers\s*\[\s*['"]x-forwarded-for/i,
        'lire l\'en-tete brut rendait le limiteur contournable en une ligne de curl');
    assert.match(srcServer, /app\.set\('trust proxy', process\.env\.TRUST_PROXY \|\| false\)/,
        'et il faut le declarer explicitement, faux par defaut');
});

test('seuls les ÉCHECS comptent, et un succès efface l\'ardoise', () => {
    /* Compter les succès, derrière le NAT d'une école, fermait la porte à la classe entière un
       matin de rentrée. Le comptage se fait donc APRÈS coup, sur le statut réel. */
    assert.match(srcLim, /res\.on\('finish'/, 'le comptage doit attendre l\'issue de la requete');
    assert.match(srcLim, /const rate = res\.statusCode === 401 \|\| res\.statusCode === 403;/,
        'seuls 401 et 403 sont des echecs d\'authentification');
    assert.match(srcLim, /echecs\.delete\(cleFine\); \/\/ un succès efface l'ardoise/,
        'un succes doit remettre le compteur a zero');
    // Une 500 n'est pas la faute de qui se connecte : elle ne doit pas non plus compter.
    assert.match(srcLim, /\} else if \(res\.statusCode < 400\) \{/,
        'une erreur serveur ne compte ni comme echec ni comme succes');
});

test('deux seaux : la personne, puis l\'adresse — et l\'ordre de grandeur compte', () => {
    assert.match(srcLim, /const cleFine = `\$\{key\}:\$\{ip\}:\$\{qui\}`/, 'cle par personne');
    assert.match(srcLim, /const cleIp = `\$\{key\}:\$\{ip\}`/, 'cle par adresse');
    /* Le second seau arrête l'essai d'un même mot de passe sur cent comptes, que le premier
       laisserait passer. Il doit rester BEAUCOUP plus large : une promotion partage l'IP. */
    const m = /rateLimit\(\{ windowMs: 15 \* 60000, max: (\d+), maxIp: (\d+), key: 'login' \}\)/.exec(srcRoutes);
    assert.ok(m, 'plafonds de connexion introuvables');
    const [, max, maxIp] = m.map(Number);
    assert.ok(maxIp >= max * 5,
        `le plafond par adresse (${maxIp}) doit rester tres au-dessus de celui par personne (${max})`);
    assert.ok(max <= 10, 'plus de dix essais sur un compte, ce n\'est plus une faute de frappe');
});

test('le 429 ne dit pas quels comptes existent', () => {
    // L'identifiant tenté entre dans la clé qu'il existe ou non : même seuil, même instant.
    assert.match(srcLim, /identifiant = \(req\) => String\(req\.body\?\.email \|\| ''\)\.toLowerCase\(\)\.trim\(\)/,
        'la cible tentee, telle qu\'elle est saisie');
    // Le changement de mot de passe vise le compte CONNECTÉ, pas un e-mail du corps.
    assert.match(srcRoutes, /identifiant: \(req\) => String\(req\.user\?\.id \|\| ''\)/,
        'sur un compte deja authentifie, la cle est le jeton');
});

test('le nettoyage ne retient pas le processus', () => {
    /* `npm test` doit rendre la main. Un `setInterval` non `unref` suffirait à le faire tourner
       indéfiniment — le pool de connexions a déjà été rendu paresseux pour cette raison exacte
       (cf. config/database.js). */
    assert.match(srcLim, /\}, windowMs\)\.unref\?\.\(\);/, 'l\'intervalle de purge doit etre unref');
    assert.match(srcLim, /for \(const \[k, arr\] of echecs\)/, 'et purger vraiment : une Map qui enfle est un DoS');
});

test('l\'attente annoncée est celle qui reste, pas la fenêtre entière', () => {
    // Annoncer 15 minutes à qui n'en a plus que deux le fait patienter pour rien.
    assert.match(srcLim, /const plusVieux = Math\.min\(\.\.\.\[\.\.\.parCompte, \.\.\.parIp\]\.filter\(Number\.isFinite\)\)/,
        'l\'attente se calcule sur le plus vieil echec encore dans la fenetre');
    assert.match(srcLim, /res\.set\('Retry-After', String\(reste\)\)/, 'et elle est annoncee dans l\'en-tete');
    // Le corps la répète : en cross-origin, le navigateur ne peut pas lire `Retry-After`.
    assert.match(srcLim, /Réessayez dans \$\{reste\} seconde/, 'et dans le corps, seul lisible par le front');
});

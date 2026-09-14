/**
 * LES HORODATAGES AVAIENT DEUX HEURES DE RETARD.
 *
 * MESURÉ EN PRODUCTION : il était 18:47 à Lannemezan, l'en-tête `Date` du serveur disait 16:47
 * (UTC, cohérent), et la dernière ligne du journal d'audit portait « 2026-09-14 16:38 ». Deux
 * heures de retard partout où l'on lit un horodatage — journal d'audit, cloche, publications de
 * la communauté. Le VPS tourne en UTC, MariaDB en hérite, et `DATE_FORMAT` rend donc de l'UTC.
 *
 * AUCUNE MIGRATION DE DONNÉES, ET C'EST LE POINT IMPORTANT. Une colonne `TIMESTAMP` est stockée
 * en UTC par MariaDB et CONVERTIE à la lecture selon le fuseau de session. Les colonnes
 * concernées en sont : régler la session suffit, et les lignes anciennes se remettent à l'heure
 * toutes seules. Corriger les données aurait été une faute — elles sont justes, c'est leur
 * lecture qui ne l'était pas. Une migration aurait décalé une seconde fois ce qui l'était déjà.
 *
 * CE QUE CE TEST ÉPROUVE. Le calcul du décalage de repli est la seule partie qui puisse se
 * tromper en silence : un signe inversé décalerait de quatre heures au lieu de deux, et
 * personne ne s'en apercevrait avant l'hiver.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { decalageCourant, FUSEAU } = require('../lib/fuseau.js');

const BASE = path.join(__dirname, '..', '..', '..', 'database');
/* SCHÉMA + MIGRATIONS. `schema.sql` est un instantané qui se périme : `community_post` est
   arrivée par la 114 et n'y figure pas. Chercher une table dans le seul instantané ferait
   échouer le test sur une table pourtant bien définie. */
const SCHEMA = [
    fs.readFileSync(path.join(BASE, 'schema.sql'), 'utf8'),
    /* LES REVERTS SONT EXCLUS. Ils décrivent le chemin INVERSE : le `MODIFY created_at DATETIME`
       de la 147_revert ferait croire que la communauté finit en DATETIME — et, si l'on balaie
       tout le corpus sans distinguer les tables, il écraserait même le type d'`audit_log`. */
    ...fs.readdirSync(path.join(BASE, 'migrations'))
        .filter((f) => f.endsWith('.sql') && !f.includes('_revert_')).sort()
        .map((f) => fs.readFileSync(path.join(BASE, 'migrations', f), 'utf8')),
].join('\n');
const DB = fs.readFileSync(path.join(__dirname, '..', 'config/database.js'), 'utf8');

test('la 147 force la session en UTC avant de convertir le type', () => {
    /* LA LIGNE QU'IL NE FAUT PAS RETIRER. En passant de DATETIME à TIMESTAMP, MariaDB interprète
       la valeur existante COMME ÉTANT dans le fuseau de la session, puis la range en UTC. Les
       valeurs présentes SONT de l'UTC : sans `SET time_zone = '+00:00'`, elles seraient prises
       pour de l'heure de Paris et décalées À L'ENVERS — deux heures d'erreur de plus, dans
       l'autre sens, sur une opération qu'on ne rejoue pas pour vérifier. */
    const BASE_MIG = path.join(BASE, 'migrations');
    for (const f of ['147_communaute_horodatage_utc.sql', '147_revert_communaute_horodatage_utc.sql']) {
        const sql = fs.readFileSync(path.join(BASE_MIG, f), 'utf8');
        assert.match(sql, /SET time_zone = '\+00:00';/, `${f} doit forcer la session en UTC`);
        assert.ok(sql.indexOf("SET time_zone") < sql.indexOf('ALTER TABLE'),
            `${f} : le fuseau doit être posé AVANT la première conversion`);
    }
});

test('le décalage est calculé dans le bon sens', () => {
    /* LE SIGNE EST TOUT. À l'envers, Paris deviendrait -02:00 et l'application afficherait
       quatre heures de retard au lieu de deux — un défaut plus grave que celui qu'on corrige,
       et tout aussi silencieux. */
    assert.strictEqual(decalageCourant('UTC'), '+00:00');
    assert.match(decalageCourant('Europe/Paris'), /^\+0[12]:00$/,
        'Paris vaut +01:00 en hiver, +02:00 en été — jamais un décalage négatif');
    assert.match(decalageCourant('America/New_York'), /^-0[45]:00$/,
        'un fuseau à l\'ouest doit sortir NÉGATIF');
});

test('les fuseaux à décalage non entier sont rendus correctement', () => {
    /* `+05:30` n'est pas une curiosité : c'est l'Inde. Un calcul en heures entières le
       tronquerait à +05:00 sans rien signaler. */
    assert.strictEqual(decalageCourant('Asia/Kolkata'), '+05:30');
    assert.match(decalageCourant('Australia/Adelaide'), /^\+(09:30|10:30)$/);
});

test('le format est celui qu\'accepte `SET time_zone`', () => {
    for (const zone of ['Europe/Paris', 'UTC', 'America/New_York', 'Asia/Kolkata']) {
        assert.match(decalageCourant(zone), /^[+-][0-9]{2}:[0-9]{2}$/,
            `${zone} doit sortir au format ±HH:MM, seul accepté par MariaDB`);
    }
});

test('le fuseau par défaut est celui de l\'école, et reste configurable', () => {
    /* Un autre organisme n'est pas forcément à Paris : le nom se surcharge par
       l'environnement, sans toucher au code. */
    assert.strictEqual(FUSEAU, process.env.DB_TIMEZONE || 'Europe/Paris');
});

test('le fuseau est posé sur CHAQUE connexion, pas une seule fois', () => {
    /* Le pool ouvre et recycle des connexions au fil de la vie du serveur — `idleTimeout` les
       ferme après une minute d'inactivité. Régler le fuseau une seule fois au démarrage
       laisserait toutes les suivantes en UTC, et l'heure redeviendrait fausse par intermittence :
       le pire des symptômes, parce qu'on ne le reproduit pas.
       C'est aussi ce qui fait suivre l'heure d'été au repli, recalculé à chaque connexion. */
    assert.match(DB, /p\.on\('connection', \(conn\) => \{/);
    assert.match(DB, /SET time_zone = \$\{conn\.escape\(FUSEAU\)\}/);
});

test('l\'application ne tombe jamais pour un fuseau', () => {
    /* `SET time_zone = 'Europe/Paris'` exige les tables de fuseaux côté serveur, absentes de
       beaucoup d'installations. Faire échouer la connexion pour un problème d'AFFICHAGE serait
       disproportionné : on retombe sur le décalage, et on le DIT — un décalage figé se
       périmerait au prochain changement d'heure si personne n'apprenait qu'il est en place. */
    const bloc = DB.slice(DB.indexOf('function reglerFuseau'));
    const corps = bloc.slice(0, bloc.indexOf('\n}'));
    assert.match(corps, /decalageCourant\(FUSEAU\)/, 'un repli doit exister');
    assert.match(corps, /console\.warn/, 'le repli doit se dire');
    assert.doesNotMatch(corps, /throw |process\.exit/, 'jamais d\'arrêt pour un fuseau');
});

test('les horodatages visés finissent en TIMESTAMP — sinon régler la session ne suffirait pas', () => {
    /* C'EST LA PRÉMISSE DE TOUTE LA CORRECTION. Un `TIMESTAMP` se convertit à la lecture, un
       `DATETIME` non.

       ON RAISONNE SUR L'ÉTAT FINAL, pas sur le `CREATE TABLE`. `community_post` est née en
       DATETIME (migration 114) et devient TIMESTAMP par la 147 : ne lire que la création
       accuserait un schéma pourtant correct — et à l'inverse, ne lire que les ALTER manquerait
       les tables nées du bon type. */
    const typeFinal = (table, colonne) => {
        const creation = SCHEMA.search(new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table} \\(`));
        assert.ok(creation > 0, `table ${table} introuvable dans le schéma ni dans les migrations`);
        let type = null;
        const corps = SCHEMA.slice(creation, SCHEMA.indexOf(');', creation));
        const m = corps.match(new RegExp(`${colonne}\\s+(timestamp|datetime)`, 'i'));
        if (m) type = m[1].toLowerCase();
        /* Les ALTER qui suivent, dans l'ordre des fichiers : le dernier gagne. CHAQUE `ALTER`
           est borné à son instruction — sans quoi un MODIFY portant sur une AUTRE table serait
           attribué à celle-ci, et le type rendu serait celui d'une table voisine. */
        const re = new RegExp(`ALTER TABLE ${table}\\b`, 'g');
        let a;
        while ((a = re.exec(SCHEMA))) {
            const instruction = SCHEMA.slice(a.index, SCHEMA.indexOf(';', a.index));
            const mm = instruction.match(new RegExp(`MODIFY ${colonne} (TIMESTAMP|DATETIME)`, 'i'));
            if (mm) type = mm[1].toLowerCase();
        }
        return type;
    };

    for (const table of ['audit_log', 'notification', 'community_post', 'community_answer']) {
        assert.strictEqual(typeFinal(table, 'created_at'), 'timestamp',
            `${table}.created_at doit finir en TIMESTAMP pour se convertir à la lecture`);
    }
});

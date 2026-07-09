const db = require('../config/database.js');
const { geocodeBatch } = require('../lib/geocode.js');

// Déduit le département français à partir d'un code postal.
function deptOf(zip) {
    if (zip == null) return null;
    const z = String(zip).trim();
    if (!/^\d{2}/.test(z)) return null;
    if (/^9[678]\d/.test(z)) return z.slice(0, 3); // DOM 971-976, 984-988…
    return z.slice(0, 2);                            // « 20 » = Corse
}

/**
 * GET /api/carte — répartition géographique des stagiaires.
 * Renvoie l'agrégat par département (depuis le code postal) ET les points
 * précis géocodés (lat/lng) avec le niveau de la formation la plus récente.
 */
const getCarte = (req, res) => {
    const orgId = req.user.organization_id;
    // Niveau = celui de la formation de l'inscription la plus récente du stagiaire.
    const sql = `
        SELECT l.id, l.first_name, l.last_name, l.town, l.zip_code, l.address,
               l.lat, l.lng, l.geo_precision, l.levels,
               (SELECT p.level
                  FROM enrollment e
                  JOIN training_session s ON s.id = e.session_id
                  JOIN training_program p ON p.id = s.program_id
                 WHERE e.learner_id = l.id
                 ORDER BY e.created_at DESC LIMIT 1) AS level,
               (SELECT GROUP_CONCAT(DISTINCT p.code)
                  FROM enrollment e
                  JOIN training_session s ON s.id = e.session_id
                  JOIN training_program p ON p.id = s.program_id
                 WHERE e.learner_id = l.id) AS formation_codes
          FROM learner l
         WHERE l.organization_id = ?`;
    db.query(sql, [orgId], (err, rows) => {
        if (err) {
            console.error('Erreur carte :', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        const map = new Map(); // dept -> { count, towns: Map }
        const points = [];
        let total = 0, ungeo = 0, geocoded = 0, pending = 0;

        for (const r of rows) {
            const d = deptOf(r.zip_code);
            if (d) {
                total++;
                if (!map.has(d)) map.set(d, { count: 0, towns: new Map() });
                const e = map.get(d);
                e.count++;
                const t = (r.town || '').trim();
                if (t) e.towns.set(t, (e.towns.get(t) || 0) + 1);
            } else {
                ungeo++;
            }
            if (r.lat != null && r.lng != null) {
                geocoded++;
                // Priorité à l'étiquette du stagiaire (1re du CSV), sinon niveau de sa formation.
                const badges = (r.levels || '').split(',').map((s) => s.trim()).filter(Boolean);
                const formations = (r.formation_codes || '').split(',').map((s) => s.trim()).filter(Boolean);
                points.push({
                    id: r.id,
                    name: [r.first_name, r.last_name].filter(Boolean).join(' '),
                    town: r.town || '',
                    dept: d,
                    lat: Number(r.lat), lng: Number(r.lng),
                    level: badges[0] || r.level || null,
                    formations, // codes des formations suivies (pour le filtre)
                });
            } else if (r.address || r.zip_code) {
                pending++; // géocodable mais pas encore géocodé
            }
        }

        const byDept = [...map.entries()]
            .map(([dept, e]) => ({
                dept, count: e.count,
                towns: [...e.towns.entries()].map(([town, n]) => ({ town, n }))
                    .sort((a, b) => b.n - a.n).slice(0, 10),
            }))
            .sort((a, b) => b.count - a.count);

        res.json({ data: { total, ungeo, geocoded, pending, byDept, points } });
    });
};

/**
 * POST /api/carte/geocode — géocode les stagiaires ayant une adresse mais pas
 * encore de coordonnées (par lots pour rester poli avec l'API publique).
 */
const GEOCODABLE = `(l.zip_code IS NOT NULL OR l.town IS NOT NULL OR c.address IS NOT NULL OR c.zip_code IS NOT NULL)`;

const geocodeLearners = (req, res) => {
    const orgId = req.user.organization_id;
    const limit = Math.min(Number(req.body?.limit) || 80, 200);
    db.query(
        `SELECT l.id, l.financing, l.zip_code, l.town, l.company_id,
                c.address AS c_address, c.zip_code AS c_zip, c.town AS c_town
           FROM learner l LEFT JOIN company c ON c.id = l.company_id
          WHERE l.organization_id = ? AND l.lat IS NULL AND ${GEOCODABLE}
          LIMIT ?`,
        [orgId, limit],
        async (err, rows) => {
            if (err) {
                console.error('Erreur sélection géocodage :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!rows.length) return res.json({ data: { done: 0, remaining: 0 } });

            // Adresse géocodée selon le financement :
            //  · professionnel avec entreprise → adresse EXACTE de l'entreprise ;
            //  · particulier → VILLE uniquement (confidentialité : jamais l'adresse perso).
            const inputs = rows.map((r) => {
                const pro = r.financing === 'PROFESSIONNEL' && (r.c_address || r.c_zip || r.c_town);
                return pro
                    ? { id: r.id, address: r.c_address, zip_code: r.c_zip, town: r.c_town }
                    : { id: r.id, address: null, zip_code: r.zip_code, town: r.town };
            });

            const conn = db.promise();
            try {
                const done = await geocodeBatch(inputs, async (id, geo) => {
                    if (!geo) return;
                    await conn.query(
                        'UPDATE learner SET lat = ?, lng = ?, geo_precision = ?, geocoded_at = NOW() WHERE id = ? AND organization_id = ?',
                        [geo.lat, geo.lng, geo.precision, id, orgId]
                    );
                });
                const [[{ remaining }]] = await conn.query(
                    `SELECT COUNT(*) AS remaining FROM learner l LEFT JOIN company c ON c.id = l.company_id
                      WHERE l.organization_id = ? AND l.lat IS NULL AND ${GEOCODABLE}`,
                    [orgId]
                );
                res.json({ data: { done, remaining } });
            } catch (e) {
                console.error('Erreur géocodage :', e);
                res.status(500).json({ error: 'Géocodage impossible' });
            }
        }
    );
};

module.exports = { getCarte, geocodeLearners };

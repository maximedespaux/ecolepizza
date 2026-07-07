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
               l.lat, l.lng, l.geo_precision,
               (SELECT p.level
                  FROM enrollment e
                  JOIN training_session s ON s.id = e.session_id
                  JOIN training_program p ON p.id = s.program_id
                 WHERE e.learner_id = l.id
                 ORDER BY e.created_at DESC LIMIT 1) AS level
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
                points.push({
                    id: r.id,
                    name: [r.first_name, r.last_name].filter(Boolean).join(' '),
                    town: r.town || '',
                    dept: d,
                    lat: Number(r.lat), lng: Number(r.lng),
                    level: r.level || null,
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
const geocodeLearners = (req, res) => {
    const orgId = req.user.organization_id;
    const limit = Math.min(Number(req.body?.limit) || 80, 200);
    db.query(
        `SELECT id, address, zip_code, town FROM learner
          WHERE organization_id = ? AND lat IS NULL
            AND (address IS NOT NULL OR zip_code IS NOT NULL)
          LIMIT ?`,
        [orgId, limit],
        async (err, rows) => {
            if (err) {
                console.error('Erreur sélection géocodage :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (!rows.length) return res.json({ data: { done: 0, remaining: 0 } });

            const conn = db.promise();
            try {
                const done = await geocodeBatch(rows, async (id, geo) => {
                    if (!geo) return;
                    await conn.query(
                        'UPDATE learner SET lat = ?, lng = ?, geo_precision = ?, geocoded_at = NOW() WHERE id = ? AND organization_id = ?',
                        [geo.lat, geo.lng, geo.precision, id, orgId]
                    );
                });
                const [[{ remaining }]] = await conn.query(
                    `SELECT COUNT(*) AS remaining FROM learner
                      WHERE organization_id = ? AND lat IS NULL
                        AND (address IS NOT NULL OR zip_code IS NOT NULL)`,
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

const db = require('../config/database.js');

// Déduit le département français à partir d'un code postal.
// Métropole : 2 premiers chiffres ; Corse : « 20 » ; Outre-mer (97x/98x) : 3 chiffres.
function deptOf(zip) {
    if (zip == null) return null;
    const z = String(zip).trim();
    if (!/^\d{2}/.test(z)) return null;
    if (/^9[678]\d/.test(z)) return z.slice(0, 3); // 971-976, 984-988…
    const d = z.slice(0, 2);
    return d; // « 20 » = Corse (regroupée)
}

/**
 * GET /api/carte — répartition géographique des stagiaires par département,
 * calculée depuis learner.zip_code (aucune géolocalisation stockée requise).
 */
const getCarte = (req, res) => {
    db.query(
        'SELECT zip_code, town FROM learner WHERE organization_id = ?',
        [req.user.organization_id],
        (err, rows) => {
            if (err) {
                console.error('Erreur carte :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            const map = new Map(); // dept -> { count, towns: Map(town -> n) }
            let total = 0;
            let ungeo = 0;
            for (const r of rows) {
                const d = deptOf(r.zip_code);
                if (!d) { ungeo++; continue; }
                total++;
                if (!map.has(d)) map.set(d, { count: 0, towns: new Map() });
                const e = map.get(d);
                e.count++;
                const t = (r.town || '').trim();
                if (t) e.towns.set(t, (e.towns.get(t) || 0) + 1);
            }
            const byDept = [...map.entries()]
                .map(([dept, e]) => ({
                    dept,
                    count: e.count,
                    towns: [...e.towns.entries()]
                        .map(([town, n]) => ({ town, n }))
                        .sort((a, b) => b.n - a.n)
                        .slice(0, 10),
                }))
                .sort((a, b) => b.count - a.count);
            res.json({ data: { total, ungeo, byDept } });
        }
    );
};

module.exports = { getCarte };

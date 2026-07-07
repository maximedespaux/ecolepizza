// Limiteur de débit en mémoire (sans dépendance) — anti-force brute.
// Suffisant pour un mono-serveur ; pour du multi-instance, utiliser Redis.
function rateLimit({ windowMs = 60000, max = 10, key = 'default' } = {}) {
    const hits = new Map(); // clé -> [timestamps]

    // Nettoyage périodique pour éviter la croissance mémoire.
    setInterval(() => {
        const cutoff = Date.now() - windowMs;
        for (const [k, arr] of hits) {
            const kept = arr.filter((t) => t > cutoff);
            if (kept.length) hits.set(k, kept); else hits.delete(k);
        }
    }, windowMs).unref?.();

    return (req, res, next) => {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.ip || req.socket?.remoteAddress || 'unknown';
        const id = `${key}:${ip}`;
        const now = Date.now();
        const arr = (hits.get(id) || []).filter((t) => now - t < windowMs);
        arr.push(now);
        hits.set(id, arr);
        if (arr.length > max) {
            res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
            return res.status(429).json({ message: 'Trop de tentatives. Réessayez dans un instant.' });
        }
        next();
    };
}

module.exports = { rateLimit };

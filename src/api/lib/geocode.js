// Géocodage d'adresses françaises via l'API publique et gratuite de l'État
// (Base Adresse Nationale) : https://api-adresse.data.gouv.fr — sans clé.
// Convertit adresse + code postal + ville en coordonnées (lat/lng).

const ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Géocode une adresse. Renvoie { lat, lng, precision, score } ou null.
 * precision : housenumber | street | locality | municipality (type BAN).
 */
async function geocodeAddress({ address, zip_code, town }) {
    const q = [address, town].filter(Boolean).join(' ').trim();
    if (!q && !zip_code) return null;

    const params = new URLSearchParams({ q: q || town || zip_code, limit: '1' });
    if (zip_code) params.set('postcode', String(zip_code).trim());

    let res;
    try {
        res = await fetch(`${ENDPOINT}?${params.toString()}`, {
            headers: { 'User-Agent': 'Impasto/1.0 (geocoding)' },
        });
    } catch {
        return null; // réseau indisponible : on n'échoue pas le lot
    }
    if (!res.ok) return null;
    let json;
    try { json = await res.json(); } catch { return null; }

    const f = json.features && json.features[0];
    if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) return null;
    const [lng, lat] = f.geometry.coordinates; // BAN : [lon, lat]
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return {
        lat, lng,
        precision: f.properties?.type || null,
        score: f.properties?.score || 0,
    };
}

/**
 * Géocode une liste de stagiaires ({id, address, zip_code, town}) en séquence,
 * avec une petite pause pour rester poli avec l'API. Appelle onResult(id, geo)
 * pour chaque résultat (geo peut être null). Renvoie le nombre géocodé.
 */
async function geocodeBatch(rows, onResult, { delayMs = 120 } = {}) {
    let done = 0;
    for (const r of rows) {
        const geo = await geocodeAddress(r);
        await onResult(r.id, geo);
        if (geo) done++;
        await sleep(delayMs);
    }
    return done;
}

module.exports = { geocodeAddress, geocodeBatch };

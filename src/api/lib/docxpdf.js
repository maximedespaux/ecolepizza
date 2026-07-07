// Conversion .docx -> PDF via LibreOffice headless (soffice). Aucune modification
// possible du document rendu au client. Nécessite LibreOffice installé sur le
// serveur (macOS : /Applications/LibreOffice.app ; Linux : paquet libreoffice).
// Le chemin peut être forcé via la variable d'environnement SOFFICE_PATH.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let cachedBin;
function findSoffice() {
    if (cachedBin !== undefined) return cachedBin;
    const candidates = [
        process.env.SOFFICE_PATH,
        '/Applications/LibreOffice.app/Contents/MacOS/soffice', // macOS
        '/opt/homebrew/bin/soffice', '/usr/local/bin/soffice',
        '/usr/bin/soffice', '/usr/bin/libreoffice',
        'soffice', 'libreoffice',
    ].filter(Boolean);
    for (const c of candidates) {
        try {
            if (c.includes('/')) { if (fs.existsSync(c)) { cachedBin = c; return c; } }
            else { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [c]); if (r.status === 0) { cachedBin = c; return c; } }
        } catch { /* continue */ }
    }
    cachedBin = null;
    return null;
}

/** Convertit un Buffer .docx en Buffer PDF. Lève une erreur (code NO_SOFFICE) si LibreOffice est absent. */
function docxToPdf(docxBuffer) {
    const bin = findSoffice();
    if (!bin) {
        const e = new Error('LibreOffice introuvable — installez-le ou définissez SOFFICE_PATH.');
        e.code = 'NO_SOFFICE';
        throw e;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impasto-pdf-'));
    const inPath = path.join(dir, 'doc.docx');
    const outPath = path.join(dir, 'doc.pdf');
    try {
        fs.writeFileSync(inPath, docxBuffer);
        // Profil utilisateur isolé par appel -> évite le verrou « another instance ».
        const r = spawnSync(bin, [
            '--headless', '--norestore',
            `-env:UserInstallation=file://${path.join(dir, 'profile')}`,
            '--convert-to', 'pdf', '--outdir', dir, inPath,
        ], { timeout: 90000 });
        if (!fs.existsSync(outPath)) {
            const msg = (r.stderr && r.stderr.toString()) || (r.error && r.error.message) || 'conversion échouée';
            throw new Error('Conversion PDF impossible : ' + msg.slice(0, 200));
        }
        return fs.readFileSync(outPath);
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

module.exports = { docxToPdf, findSoffice };

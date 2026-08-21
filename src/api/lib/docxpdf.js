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

/**
 * Le filtre d'export PDF de LibreOffice, en PDF/A-3 quand on le demande.
 *
 * POURQUOI PASSER PAR LIBREOFFICE plutôt que de rendre le PDF conforme après coup. PDF/A-3
 * n'est pas une case à cocher : il exige que TOUTES les polices soient embarquées, qu'aucune
 * couleur ne soit exprimée dans un espace dépendant du périphérique sans profil de sortie, et
 * que le fichier porte un OutputIntent avec un profil ICC. Une facture ordinaire produisait
 * 113 échecs sur la seule règle DeviceRGB — un par élément coloré.
 *
 * Rattraper ça avec pdf-lib voudrait dire réécrire chaque opérateur de couleur du flux de
 * contenu et embarquer un profil ICC à la main. LibreOffice le fait déjà, correctement, en
 * changeant un paramètre d'export. La conformité appartient au moteur de rendu ; l'ajouter
 * après coup, c'est réparer ce qu'on aurait pu ne pas casser.
 *
 * `SelectPdfVersion` : 0 = PDF ordinaire, 1 = PDF/A-1, 2 = PDF/A-2, 3 = PDF/A-3.
 */
const FILTRE_PDF = 'pdf';
const FILTRE_PDFA3 = 'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":3}}';

/**
 * Convertit un Buffer source (.docx ou .html) en Buffer PDF via LibreOffice.
 * @param {boolean} [pdfa] exporter en PDF/A-3 (archivage longue durée, requis par Factur-X)
 */
function convertToPdf(inputBuffer, ext, pdfa) {
    const bin = findSoffice();
    if (!bin) {
        const e = new Error('LibreOffice introuvable — installez-le ou définissez SOFFICE_PATH.');
        e.code = 'NO_SOFFICE';
        throw e;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impastio-pdf-'));
    const inPath = path.join(dir, `doc.${ext}`);
    const outPath = path.join(dir, 'doc.pdf');
    try {
        fs.writeFileSync(inPath, inputBuffer);
        // Profil utilisateur isolé par appel -> évite le verrou « another instance ».
        const r = spawnSync(bin, [
            '--headless', '--norestore',
            `-env:UserInstallation=file://${path.join(dir, 'profile')}`,
            '--convert-to', pdfa ? FILTRE_PDFA3 : FILTRE_PDF, '--outdir', dir, inPath,
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

/** Convertit un Buffer .docx en Buffer PDF. Lève une erreur (code NO_SOFFICE) si LibreOffice est absent. */
function docxToPdf(docxBuffer) {
    return convertToPdf(docxBuffer, 'docx');
}

/**
 * Convertit une chaîne HTML complète en Buffer PDF (modèles construits dans l'app).
 * @param {boolean} [pdfa] exporter en PDF/A-3 — réservé aux factures, cf. FILTRE_PDFA3
 */
function htmlToPdf(html, pdfa) {
    return convertToPdf(Buffer.from(html, 'utf8'), 'html', pdfa);
}

module.exports = { docxToPdf, htmlToPdf, convertToPdf, findSoffice };

/**
 * L'ATTESTATION DE SIGNATURE — le « dossier de preuve » d'un document signé (demandé le 2026-10-04).
 *
 * POURQUOI. Les signatures posées par l'application sont des signatures électroniques AVANCÉES
 * (PAdès, empreinte SHA-256 : le document est infalsifiable). Mais la VALEUR PROBANTE d'une telle
 * signature — face à un contrôle (Qualiopi, OPCO, financeur) ou à une contestation — tient au
 * FAISCEAU DE PREUVES de l'acte : qui a signé, quand, depuis quelle adresse IP, avec quel appareil,
 * et sur quel contenu exact. L'application consigne déjà tout cela à chaque signature (`signer_ip`,
 * `signer_user_agent`, `signed_at`, `signed_hash`, chiffrés au repos) — mais rien ne le RENDAIT :
 * la preuve dormait en base. Cette attestation la met noir sur blanc, dans un PDF que l'école peut
 * présenter. Ce fichier ne fait que la METTRE EN FORME : il ne décide de rien, ne lit pas la base.
 *
 * RENDU PAR LIBREOFFICE : styles en ligne, couleurs littérales (aucune variable de thème), bordures
 * de tableau par l'ATTRIBUT `border` (le CSS de bordure de cellule est ignoré — cf. CLAUDE.md §3).
 */

// Échappement HTML local (pas de dépendance : ce module se teste seul).
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Une valeur absente s'imprime « — », jamais « null » ni un blanc muet.
const ou = (v) => { const s = (v == null ? '' : String(v)).trim(); return s ? esc(s) : '—'; };

/**
 * Construit le HTML de l'attestation de signature (document complet, prêt pour htmlToPdf).
 * @param {object}  p.org          organisme émetteur (identité imprimée en tête)
 * @param {object}  p.doc          { id, title, type_label, sent_at, empreinte, nb_revisions }
 * @param {Array}   p.signataires  [{ role, nom, compte, date, ip, appareil, empreinte }]
 * @param {string}  p.genereLe     date/heure de génération de l'attestation (déjà formatée)
 */
function construireAttestationHtml({ org = {}, doc = {}, signataires = [], genereLe = '' } = {}) {
    const orgNom = org.legal_name || org.short_name || org.manager || 'Organisme';
    const orgAdresse = [org.address, [org.zip_code, org.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const orgLignes = [
        org.siret ? `SIRET ${esc(org.siret)}` : '',
        org.declaration_number ? `Déclaration d'activité n° ${esc(org.declaration_number)}` : '',
        org.email ? esc(org.email) : '',
    ].filter(Boolean).join(' · ');

    const lignes = signataires.map((s) => `
        <tr>
          <td valign="top"><b>${ou(s.role)}</b></td>
          <td valign="top">${ou(s.nom)}${s.compte ? `<br><span style="color:#666;font-size:8.5pt">${esc(s.compte)}</span>` : ''}</td>
          <td valign="top">${ou(s.date)}</td>
          <td valign="top">${ou(s.ip)}</td>
          <td valign="top" style="font-size:8pt;color:#444">${ou(s.appareil)}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Attestation de signature</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1a1a1a; }
  h1 { font-size: 15pt; margin: 0 0 2mm; color: #0b4a8a; }
  h2 { font-size: 11pt; margin: 6mm 0 2mm; color: #0b4a8a; border-bottom: 1px solid #cfd8e3; padding-bottom: 1mm; }
  .muted { color: #666; }
  .emetteur { font-size: 9pt; color: #333; margin-bottom: 4mm; }
  .champ { margin: 1mm 0; }
  .champ b { display: inline-block; min-width: 46mm; color: #333; }
  .emp { font-family: "Courier New", monospace; font-size: 8pt; word-break: break-all; color: #333; }
  .note { font-size: 8.5pt; color: #444; margin-top: 2mm; line-height: 1.45; }
  table { border-collapse: collapse; }
  th { background: #eef3f9; color: #0b4a8a; font-size: 8.5pt; text-align: left; }
</style></head>
<body>
  <h1>Attestation de signature électronique</h1>
  <div class="emetteur">
    <b>${esc(orgNom)}</b>${orgAdresse ? ` — ${esc(orgAdresse)}` : ''}${orgLignes ? `<br>${orgLignes}` : ''}
  </div>

  <h2>Document signé</h2>
  <div class="champ"><b>Intitulé</b>${ou(doc.title)}</div>
  <div class="champ"><b>Type</b>${ou(doc.type_label)}</div>
  <div class="champ"><b>Référence</b><span class="emp">${ou(doc.id)}</span></div>
  <div class="champ"><b>Envoyé le</b>${ou(doc.sent_at)}</div>
  <div class="champ"><b>Empreinte du contenu (SHA-256)</b><span class="emp">${ou(doc.empreinte)}</span></div>

  <h2>Signataires (${signataires.length})</h2>
  <table width="100%" border="1" cellspacing="0" cellpadding="6">
    <tr>
      <th width="20%">Rôle</th><th width="26%">Signataire</th><th width="20%">Date et heure</th>
      <th width="14%">Adresse IP</th><th width="20%">Appareil</th>
    </tr>
    ${lignes || '<tr><td colspan="5">Aucune signature enregistrée.</td></tr>'}
  </table>

  <h2>Nature et valeur probante</h2>
  <p class="note">
    Les signatures consignées ci-dessus sont des <b>signatures électroniques avancées</b> (format PAdES).
    L'intégrité du document est garantie par une <b>empreinte cryptographique SHA-256</b> : toute
    modification postérieure du document signé invaliderait la signature. Pour chaque signataire sont
    enregistrés le nom, la date et l'heure, l'adresse IP et l'appareil utilisés au moment de la
    signature, constituant un <b>faisceau de preuves</b> de l'acte de signature. La présente attestation
    est scellée électroniquement par l'organisme ; sa propre intégrité est donc également protégée.
  </p>
  <p class="note muted">Attestation générée le ${esc(genereLe)}. Les dates et heures sont celles enregistrées par le serveur au moment de chaque signature.</p>
</body></html>`;
}

module.exports = { construireAttestationHtml };

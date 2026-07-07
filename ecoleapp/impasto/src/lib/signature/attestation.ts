// Page « Attestation de signature électronique » (niveau simple / SES).
// Convertie en PDF (Gotenberg Chromium) puis fusionnée derrière le document signé.

export interface AttestationParams {
  organisme: string;
  docLabel: string;
  formation: string | null;
  signataireNom: string;
  signataireEmail: string | null;
  hash: string;
  signatureDataUrl: string; // image PNG du tracé
  ip: string;
  navigateur: string;
  signeLe: string; // ISO
  otpEnvoyeLe: string | null;
  requestId: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const frDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function attestationHtml(p: AttestationParams): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 10px;border-bottom:1px solid #eadfce;color:#6b5b45;width:38%">${k}</td><td style="padding:7px 10px;border-bottom:1px solid #eadfce;color:#22180f"><b>${v}</b></td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <style>
    @page { margin: 24mm 18mm; }
    body { font-family: Helvetica, Arial, sans-serif; color:#22180f; font-size:12px; }
    h1 { color:#16243d; font-size:19px; margin:0 0 2px; }
    .org { color:#c1272d; font-weight:700; font-size:13px; }
    .sub { color:#777; font-size:11px; margin-top:2px; }
    .card { border:1px solid #e3d9c5; border-radius:10px; overflow:hidden; margin-top:16px; }
    table { width:100%; border-collapse:collapse; }
    .hash { font-family:'Courier New',monospace; font-size:10px; word-break:break-all; }
    .sig { margin-top:16px; }
    .sig img { border:1px solid #e3d9c5; border-radius:8px; max-height:120px; background:#fff; padding:6px; }
    .foot { margin-top:22px; color:#8a7a63; font-size:10px; border-top:1px solid #eadfce; padding-top:10px; }
    .seal { display:inline-block; border:2px solid #2f9e6f; color:#2f9e6f; border-radius:8px; padding:4px 10px; font-weight:700; font-size:11px; }
  </style></head><body>
    <div class="org">${esc(p.organisme)}</div>
    <h1>Attestation de signature électronique</h1>
    <div class="sub">Signature électronique simple (SES) avec dossier de preuve — valeur probante conformément au règlement eIDAS (art. 25).</div>

    <div style="margin-top:14px"><span class="seal">✓ Document signé</span></div>

    <div class="card"><table>
      ${row("Document", esc(p.docLabel))}
      ${p.formation ? row("Formation", esc(p.formation)) : ""}
      ${row("Signataire", esc(p.signataireNom))}
      ${p.signataireEmail ? row("E-mail", esc(p.signataireEmail)) : ""}
      ${row("Signé le", frDateTime(p.signeLe))}
      ${row("Authentification", "Code à usage unique (OTP) — envoyé le " + frDateTime(p.otpEnvoyeLe))}
      ${row("Adresse IP", esc(p.ip))}
      ${row("Navigateur", esc(p.navigateur).slice(0, 90))}
      ${row("Référence", esc(p.requestId))}
    </table></div>

    <div class="card" style="margin-top:12px"><table>
      <tr><td style="padding:7px 10px;color:#6b5b45">Empreinte SHA-256 du document</td></tr>
      <tr><td style="padding:0 10px 10px" class="hash">${esc(p.hash)}</td></tr>
    </table></div>

    <div class="sig">
      <div style="color:#6b5b45;margin-bottom:6px">Tracé manuscrit du signataire :</div>
      <img src="${p.signatureDataUrl}" alt="signature" />
    </div>

    <div class="foot">
      Ce dossier de preuve atteste que le signataire a validé un code de vérification, donné son consentement explicite
      et apposé sa signature manuscrite. Toute altération du document invalide l'empreinte SHA-256 ci-dessus.
    </div>
  </body></html>`;
}

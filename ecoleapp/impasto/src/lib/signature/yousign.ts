// Module signature — client Yousign v3. À n'utiliser QUE côté serveur.
// La clé API vient de process.env et ne doit jamais être renvoyée au client.

const BASE = process.env.YOUSIGN_API_BASE ?? "https://api-sandbox.yousign.app/v3";

function headers() {
  const key = process.env.YOUSIGN_API_KEY;
  if (!key) throw new Error("YOUSIGN_API_KEY manquante (configuration serveur).");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export type Niveau = "electronic_signature" | "advanced_electronic_signature" | "qualified_electronic_signature";

export interface SignerInput {
  nom: string;
  email: string;
  telephone?: string;
  auth: "otp_email" | "otp_sms";
}

/** 1) Crée une demande de signature (brouillon). */
export async function createSignatureRequest(name: string, level: Niveau) {
  const res = await fetch(`${BASE}/signature_requests`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, delivery_mode: "email", timezone: "Europe/Paris", signature_level: level }),
  });
  if (!res.ok) throw new Error(`Yousign createSignatureRequest: ${res.status}`);
  return res.json() as Promise<{ id: string }>;
}

/** 2) Attache le document PDF à signer. Renvoie l'id du document Yousign. */
export async function uploadDocument(requestId: string, pdf: Buffer, filename: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
  form.append("nature", "signable_document");
  const res = await fetch(`${BASE}/signature_requests/${requestId}/documents`, {
    method: "POST",
    headers: { Authorization: headers().Authorization },
    body: form,
  });
  if (!res.ok) throw new Error(`Yousign uploadDocument: ${res.status}`);
  return res.json() as Promise<{ id: string }>;
}

/** 3) Ajoute un signataire avec son mode d'authentification (OTP email/SMS). */
export async function addSigner(requestId: string, documentId: string, signer: SignerInput) {
  const [first_name, ...rest] = signer.nom.split(" ");
  const res = await fetch(`${BASE}/signature_requests/${requestId}/signers`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      info: { first_name, last_name: rest.join(" ") || first_name, email: signer.email, phone_number: signer.telephone, locale: "fr" },
      signature_authentication_mode: signer.auth,
      fields: [{ document_id: documentId, type: "signature", page: 1, x: 350, y: 700 }],
    }),
  });
  if (!res.ok) throw new Error(`Yousign addSigner: ${res.status}`);
  return res.json();
}

/** 4) Active la demande : déclenche l'envoi des invitations à signer. */
export async function activate(requestId: string) {
  const res = await fetch(`${BASE}/signature_requests/${requestId}/activate`, {
    method: "POST",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Yousign activate: ${res.status}`);
  return res.json();
}

/** 5) (après webhook) Récupère le PDF signé. */
export async function downloadSignedDocument(requestId: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/signature_requests/${requestId}/documents/download`, {
    headers: { Authorization: headers().Authorization },
  });
  if (!res.ok) throw new Error(`Yousign download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// POST /api/signatures/[token]/sign  — valide OTP + consentement + signature,
// calcule le hash du document et construit le dossier de preuve.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256, DOC_LABEL } from "@/lib/signature/proof";

const Input = z.object({
  otp: z.string().min(1),
  consent: z.literal(true),
  signature: z.string().startsWith("data:image"),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Merci de saisir le code, cocher le consentement et signer." }, { status: 422 });

  const request = await prisma.signatureRequest.findUnique({ where: { token }, include: { document: true, recipients: true } });
  if (!request) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  if (request.status === "SIGNEE") return NextResponse.json({ error: "Ce document est déjà signé." }, { status: 409 });
  if (!request.otpCode || parsed.data.otp.trim() !== request.otpCode) {
    return NextResponse.json({ error: "Code de vérification incorrect." }, { status: 401 });
  }

  const now = new Date();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const ua = req.headers.get("user-agent") || "inconnu";
  const rec = request.recipients[0];

  // Empreinte du document (contenu = données de fusion figées).
  const docHash = sha256(JSON.stringify({ id: request.document.id, type: request.document.type, data: request.document.mergeData ?? {} }));

  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  const nowIso = now.toISOString();
  const proof = {
    document: { id: request.document.id, type: request.document.type, libelle: DOC_LABEL[request.document.type] ?? request.document.type },
    empreinteSHA256: docHash,
    signataire: { nom: rec?.nom ?? "—", email: rec?.email ?? null, ip, navigateur: ua },
    authentification: { mode: "OTP_EMAIL", codeValide: true, envoyeLe: iso(request.otpSentAt) },
    consentement: { accepte: true, le: nowIso },
    signature: { le: nowIso, image: "capturée (data URL)" },
    evenements: [
      { action: "Demande envoyée", le: iso(request.sentAt) },
      { action: "Code OTP envoyé", le: iso(request.otpSentAt) },
      { action: "Code OTP validé", le: nowIso },
      { action: "Consentement donné", le: nowIso },
      { action: "Document signé", le: nowIso },
    ],
  };

  await prisma.$transaction([
    prisma.signatureRequest.update({
      where: { token },
      data: {
        status: "SIGNEE", consentAt: now, signatureDataUrl: parsed.data.signature,
        docHash, signerIp: ip, signerUserAgent: ua, completedAt: now, proof,
      },
    }),
    ...(rec ? [prisma.signatureRecipient.update({ where: { id: rec.id }, data: { status: "SIGNE", signedAt: now } })] : []),
    prisma.generatedDocument.update({ where: { id: request.documentId }, data: { status: "SIGNE" } }),
  ]);
  // Événement d'audit chaîné (hors transaction pour préserver la chaîne d'intégrité).
  await prisma.auditLog.create({ data: { organizationId: request.organizationId, action: "document.signed", entity: "SignatureRequest", entityId: request.id, metadata: { docHash } } });

  return NextResponse.json({ data: { signed: true, docHash, proof } });
}

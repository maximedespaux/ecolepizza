// POST /api/signatures/[token]/sign  — valide OTP + consentement + signature dessinée,
// hache le VRAI PDF, construit un PDF signé (document + attestation) rangé dans
// l'espace du stagiaire, et débloque le pipeline si c'est le devis.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256, DOC_LABEL } from "@/lib/signature/proof";
import { produceDocx } from "@/lib/documents/produce";
import { docxToPdf, htmlToPdf, mergePdfs, gotenbergAvailable } from "@/lib/documents/generate";
import { attestationHtml } from "@/lib/signature/attestation";
import { saveFile, documentKey, signedKey } from "@/lib/storage/local";
import { ECOLE_PIZZA } from "@/lib/ecole-pizza/organisme";

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

  const request = await prisma.signatureRequest.findUnique({
    where: { token },
    include: { document: true, recipients: true, enrollment: { include: { session: { include: { program: true } } } } },
  });
  if (!request) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  if (request.status === "SIGNEE") return NextResponse.json({ error: "Ce document est déjà signé." }, { status: 409 });
  if (!request.otpCode || parsed.data.otp.trim() !== request.otpCode) {
    return NextResponse.json({ error: "Code de vérification incorrect." }, { status: 401 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const ua = req.headers.get("user-agent") || "inconnu";
  const rec = request.recipients[0];
  const docLabel = DOC_LABEL[request.document.type] ?? request.document.type;
  const enrId = request.enrollmentId ?? "orphan"; // enrollmentId est optionnel au schéma

  // 1) Rendu du document + empreinte du VRAI PDF (repli sur les données si moteur PDF absent).
  let docHash: string;
  let signedStored = false;
  const produced = await produceDocx(request.documentId);

  if (produced.ok && (await gotenbergAvailable())) {
    try {
      const pdf = await docxToPdf(produced.docx, produced.base + ".docx");
      docHash = sha256(pdf);
      saveFile(documentKey(request.organizationId, enrId, request.documentId, "pdf"), pdf);
      // 2) Attestation → PDF, fusionnée derrière le document → PDF signé rangé.
      const attest = await htmlToPdf(attestationHtml({
        organisme: ECOLE_PIZZA.raisonSociale, docLabel,
        formation: request.enrollment?.session.program.titre ?? null,
        signataireNom: rec?.nom ?? "—", signataireEmail: rec?.email ?? null,
        hash: docHash, signatureDataUrl: parsed.data.signature, ip, navigateur: ua,
        signeLe: nowIso, otpEnvoyeLe: request.otpSentAt ? request.otpSentAt.toISOString() : null, requestId: request.id,
      }));
      const signed = await mergePdfs([pdf, attest]);
      saveFile(signedKey(request.organizationId, enrId, request.documentId), signed);
      signedStored = true;
    } catch {
      docHash = sha256(JSON.stringify({ id: request.document.id, type: request.document.type, data: request.document.mergeData ?? {} }));
    }
  } else {
    docHash = sha256(JSON.stringify({ id: request.document.id, type: request.document.type, data: request.document.mergeData ?? {} }));
  }

  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  const proof = {
    document: { id: request.document.id, type: request.document.type, libelle: docLabel },
    empreinteSHA256: docHash,
    pdfSigne: signedStored,
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
      data: { status: "SIGNEE", consentAt: now, signatureDataUrl: parsed.data.signature, docHash, signerIp: ip, signerUserAgent: ua, completedAt: now, proof },
    }),
    ...(rec ? [prisma.signatureRecipient.update({ where: { id: rec.id }, data: { status: "SIGNE", signedAt: now } })] : []),
    prisma.generatedDocument.update({ where: { id: request.documentId }, data: { status: "SIGNE" } }),
    // Lien pipeline : signer le DEVIS valide le jalon « devis signé ».
    ...(request.document.type === "DEVIS" && request.enrollmentId
      ? [prisma.enrollment.update({ where: { id: request.enrollmentId }, data: { devisSigne: true } })]
      : []),
  ]);
  await prisma.auditLog.create({ data: { organizationId: request.organizationId, action: "document.signed", entity: "SignatureRequest", entityId: request.id, metadata: { docHash, type: request.document.type, pdfSigne: signedStored } } });

  return NextResponse.json({ data: { signed: true, docHash, pdfSigne: signedStored, proof } });
}

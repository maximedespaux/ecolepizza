// POST /api/signatures/[token]/otp  — (ré)génère et « envoie » un code OTP.
// DÉMO : pas d'email réel → le code est renvoyé dans la réponse (à afficher).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { genOtp } from "@/lib/signature/proof";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const request = await prisma.signatureRequest.findUnique({ where: { token }, include: { recipients: true } });
  if (!request) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  if (request.status === "SIGNEE") return NextResponse.json({ error: "Document déjà signé" }, { status: 409 });

  const otp = genOtp();
  await prisma.signatureRequest.update({ where: { token }, data: { otpCode: otp, otpSentAt: new Date(), status: "EN_COURS" } });
  await prisma.auditLog.create({ data: { organizationId: request.organizationId, action: "otp.sent", entity: "SignatureRequest", entityId: request.id } });

  const email = request.recipients[0]?.email ?? null;
  return NextResponse.json({ data: { sent: true, email, otpDemo: otp } });
}

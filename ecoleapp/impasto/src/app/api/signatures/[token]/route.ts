// GET /api/signatures/[token]  — infos de la demande pour la page de signature.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DOC_LABEL } from "@/lib/signature/proof";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const request = await prisma.signatureRequest.findUnique({
    where: { token },
    include: {
      recipients: true,
      document: true,
      enrollment: { include: { session: { include: { program: true } } } },
    },
  });
  if (!request) return NextResponse.json({ error: "Lien de signature invalide" }, { status: 404 });

  const org = await prisma.organization.findUnique({ where: { id: request.organizationId } });
  const rec = request.recipients[0];
  return NextResponse.json({
    data: {
      token: request.token,
      status: request.status,
      signedAt: request.completedAt,
      docHash: request.docHash,
      docType: request.document.type,
      docLabel: DOC_LABEL[request.document.type] ?? request.document.type,
      formation: request.enrollment?.session.program.titre ?? null,
      signataire: rec ? { nom: rec.nom, email: rec.email } : null,
      organisme: org?.raisonSociale ?? "École Pizza",
      // indique si un OTP a déjà été envoyé (pour l'UI)
      otpSent: !!request.otpSentAt,
    },
  });
}

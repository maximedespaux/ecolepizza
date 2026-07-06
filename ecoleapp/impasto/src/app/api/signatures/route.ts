// POST /api/signatures  — créer (ou réutiliser) une demande de signature pour un document.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { genToken } from "@/lib/signature/proof";

const ORG = "org-ecole-pizza";
const Input = z.object({ documentId: z.string().min(1) });

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée" }, { status: 422 });

  const document = await prisma.generatedDocument.findUnique({
    where: { id: parsed.data.documentId },
    include: { enrollment: { include: { learner: true } }, signatureRequest: true },
  });
  if (!document) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  const learner = document.enrollment.learner;
  const nom = [learner.prenom, learner.nom].filter(Boolean).join(" ") || learner.nom;
  const token = document.signatureRequest?.token ?? genToken();

  const request = await prisma.signatureRequest.upsert({
    where: { documentId: document.id },
    create: {
      organizationId: ORG, enrollmentId: document.enrollmentId, documentId: document.id,
      status: "ENVOYEE", authMode: "OTP_EMAIL", level: "SIMPLE", token, sentAt: new Date(),
      recipients: { create: { role: "STAGIAIRE", nom, email: learner.email, telephone: learner.telephone, ordre: 1 } },
    },
    update: { status: "ENVOYEE", sentAt: new Date(), token },
  });

  await prisma.generatedDocument.update({ where: { id: document.id }, data: { status: "ENVOYE" } });
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "signature.sent", entity: "SignatureRequest", entityId: request.id } });

  return NextResponse.json({ data: { token, requestId: request.id } }, { status: 201 });
}

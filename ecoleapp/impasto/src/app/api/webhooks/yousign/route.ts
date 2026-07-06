// Webhook Yousign (point 8). Vérifie la signature HMAC SHA-256 de l'en-tête
// X-Yousign-Signature-256, enregistre l'événement, puis (Phase 3) télécharge le
// PDF signé + la preuve et met à jour le document.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-yousign-signature-256") ?? "";
  const secret = process.env.YOUSIGN_WEBHOOK_SECRET ?? "";

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const valid =
    secret.length > 0 &&
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  const payload = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  const eventType: string | undefined = payload?.event_name ?? payload?.event;

  await prisma.webhookEvent.create({
    data: { source: "YOUSIGN", eventType, payload, signatureValid: valid },
  });

  if (!valid) {
    return NextResponse.json({ error: "Signature HMAC invalide" }, { status: 401 });
  }

  // TODO Phase 3 :
  // if (eventType === "signature_request.done") {
  //   → récupérer le PDF signé + dossier de preuve via l'API Yousign
  //   → stocker sur Drive/S3, mettre SignatureRequest.status = SIGNEE
  //   → GeneratedDocument.status = SIGNE, envoyer l'email, AuditLog
  // }

  return NextResponse.json({ received: true });
}

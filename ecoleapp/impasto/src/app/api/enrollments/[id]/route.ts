// API REST — Inscription (une).
// PATCH  /api/enrollments/[id]   → faire avancer l'étape CRM, financement, prix, acompte
// DELETE /api/enrollments/[id]   → retirer l'inscription (bloqué si documents/factures liés)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, Financement, CrmStage } from "@prisma/client";
import { prisma } from "@/lib/db";

// Étapes qui exigent devis signé ET acompte reçu (blocage strict du pipeline).
const REQUIRE_CONFIRMED = new Set<CrmStage>(["INSCRIT", "EN_FORMATION", "TERMINE", "EVALUATION_ENVOYEE"]);

const ORDRE_DOC = ["PROGRAMME", "FICHE_SEMAINE", "TEST_POSITIONNEMENT", "DEVIS", "CONTRAT", "CONVENTION", "DROIT_IMAGE", "CONVOCATION", "INVITATION", "CGV", "EMARGEMENT", "EVALUATION_FINANCEUR", "EVALUATION_MANAGEUR", "ATTESTATION_HYGIENE", "CERTIFICAT_REALISATION"];
const num = (v: unknown) => (v == null ? 0 : Number(v));

// GET /api/enrollments/[id] — profil complet du dossier (pipeline T2).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e = await prisma.enrollment.findUnique({
    where: { id },
    include: {
      learner: { include: { company: true } },
      session: { include: { program: true } },
      documents: { select: { id: true, type: true, status: true, numberPrefix: true } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!e) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  const documents = [...e.documents].sort((a, b) => ORDRE_DOC.indexOf(a.type) - ORDRE_DOC.indexOf(b.type));
  const prix = num(e.prix), acompte = num(e.acompte), priseEnCharge = num(e.priseEnCharge);
  const resteAcharge = Math.max(0, prix - priseEnCharge - acompte);
  const modeFinancement = priseEnCharge > 0 ? "PRIS_EN_CHARGE" : "AUTO"; // auto-financement vs tiers

  return NextResponse.json({
    data: {
      ...e,
      prix, acompte, priseEnCharge,
      documents,
      finance: { prix, acompte, priseEnCharge, resteAcharge, modeFinancement },
    },
  });
}

const Patch = z.object({
  crmStage: z.nativeEnum(CrmStage).optional(),
  financement: z.nativeEnum(Financement).optional(),
  prix: z.coerce.number().nonnegative().optional(),
  acompte: z.coerce.number().nonnegative().optional(),
  priseEnCharge: z.coerce.number().nonnegative().optional(),
  devisSigne: z.boolean().optional(),
  acompteRecu: z.boolean().optional(),
  // Suivi 6 mois
  aRecontacter: z.boolean().optional(),
  note: z.string().trim().min(1).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });

  const current = await prisma.enrollment.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Inscription introuvable" }, { status: 404 });

  const data: Prisma.EnrollmentUpdateInput = {};
  if (parsed.data.financement !== undefined) data.financement = parsed.data.financement;
  if (parsed.data.prix !== undefined) data.prix = new Prisma.Decimal(parsed.data.prix);
  if (parsed.data.acompte !== undefined) data.acompte = new Prisma.Decimal(parsed.data.acompte);
  if (parsed.data.priseEnCharge !== undefined) data.priseEnCharge = new Prisma.Decimal(parsed.data.priseEnCharge);
  if (parsed.data.devisSigne !== undefined) data.devisSigne = parsed.data.devisSigne;
  if (parsed.data.acompteRecu !== undefined) data.acompteRecu = parsed.data.acompteRecu;

  if (parsed.data.crmStage !== undefined) {
    const target = parsed.data.crmStage;
    // Atterrir sur une colonne-jalon valide les drapeaux correspondants.
    let devisSigne = parsed.data.devisSigne ?? current.devisSigne;
    let acompteRecu = parsed.data.acompteRecu ?? current.acompteRecu;
    if (target === "DEVIS_SIGNE") devisSigne = true;
    if (target === "ACOMPTE_PAYE") { devisSigne = true; acompteRecu = true; } // acompte implique devis

    // Blocage strict : « Inscrit » et au-delà exigent devis signé + acompte reçu.
    if (REQUIRE_CONFIRMED.has(target) && !(devisSigne && acompteRecu)) {
      const manque = [!devisSigne && "le devis signé", !acompteRecu && "l'acompte reçu"].filter(Boolean).join(" et ");
      return NextResponse.json(
        { error: `Impossible d'inscrire : il manque ${manque}. Passez d'abord par « Devis signé » puis « Acompte reçu ».` },
        { status: 409 },
      );
    }
    data.crmStage = target;
    data.devisSigne = devisSigne;
    data.acompteRecu = acompteRecu;
  }

  const enrollment = await prisma.enrollment.update({
    where: { id },
    data,
    include: { learner: { include: { company: true } }, session: { include: { program: true } } },
  });

  // Suivi 6 mois : « à recontacter » (sur le stagiaire) + note de suivi.
  if (parsed.data.aRecontacter !== undefined) {
    await prisma.learner.update({ where: { id: current.learnerId }, data: { aRecontacter: parsed.data.aRecontacter } });
  }
  if (parsed.data.note) {
    await prisma.enrollmentNote.create({ data: { enrollmentId: id, body: parsed.data.note } });
  }

  await prisma.auditLog.create({
    data: { organizationId: enrollment.session.organizationId, action: "enrollment.update", entity: "Enrollment", entityId: id },
  });
  return NextResponse.json({ data: enrollment });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: { session: true, _count: { select: { documents: true, invoices: true, signatures: true } } },
  });
  if (!enrollment) return NextResponse.json({ error: "Inscription introuvable" }, { status: 404 });

  // Garde-fou : on ne supprime pas une inscription qui a déjà des documents/factures/signatures.
  const c = enrollment._count;
  if (c.documents > 0 || c.invoices > 0 || c.signatures > 0) {
    return NextResponse.json(
      { error: "Suppression bloquée : des documents, factures ou signatures sont liés à cette inscription." },
      { status: 409 },
    );
  }

  // Les notes internes (EnrollmentNote) sont supprimées avec l'inscription.
  await prisma.$transaction([
    prisma.enrollmentNote.deleteMany({ where: { enrollmentId: id } }),
    prisma.enrollment.delete({ where: { id } }),
  ]);

  await prisma.auditLog.create({
    data: { organizationId: enrollment.session.organizationId, action: "enrollment.delete", entity: "Enrollment", entityId: id },
  });
  return NextResponse.json({ ok: true });
}

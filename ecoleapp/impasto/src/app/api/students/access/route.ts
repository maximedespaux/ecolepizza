// POST /api/students/access  — le secrétariat génère un accès stagiaire.
// Crée/rafraîchit le compte (email = identifiant), hache un mot de passe et
// renvoie les identifiants à communiquer au stagiaire (« envoi par mail »).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, generatePassword } from "@/lib/auth/password";

const ORG = "org-ecole-pizza";
const Input = z.object({ learnerId: z.string().min(1) });

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée" }, { status: 422 });

  const learner = await prisma.learner.findUnique({ where: { id: parsed.data.learnerId } });
  if (!learner) return NextResponse.json({ error: "Stagiaire introuvable" }, { status: 404 });
  const email = learner.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Ce stagiaire n'a pas d'email — ajoutez-en un dans sa fiche." }, { status: 422 });

  const password = generatePassword();
  const passwordHash = hashPassword(password);
  const name = [learner.prenom, learner.nom].filter(Boolean).join(" ") || learner.nom;

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, role: "STAGIAIRE", organizationId: ORG, learnerId: learner.id, passwordHash, accessSentAt: new Date() },
    update: { name, role: "STAGIAIRE", learnerId: learner.id, passwordHash, accessSentAt: new Date() },
  });

  await prisma.auditLog.create({ data: { organizationId: ORG, action: "student.access", entity: "User", entityId: user.id, metadata: { email } } });

  // password renvoyé en clair une seule fois (à transmettre / envoyer par mail).
  return NextResponse.json({ data: { email, password, name } }, { status: 201 });
}

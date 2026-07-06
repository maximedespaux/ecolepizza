// POST /api/students/login  — connexion stagiaire (identifiant = email + mot de passe).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";

const Input = z.object({ email: z.string().min(1), password: z.string().min(1) });
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Identifiants requis" }, { status: 422 });

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { learner: true } });
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 401 });
  }

  const name = user.name ?? user.learner?.nom ?? "Stagiaire";
  const niveau = user.learner?.niveauRealise;
  const profile = {
    id: user.id, role: user.role, name,
    subtitle: niveau ? `Stagiaire · Niveau ${niveau}` : "Stagiaire",
    initials: initials(name), home: "/mon-espace", learnerId: user.learnerId ?? undefined,
  };
  await prisma.auditLog.create({ data: { organizationId: user.organizationId ?? undefined, action: "student.login", entity: "User", entityId: user.id } });
  return NextResponse.json({ data: { profile } });
}

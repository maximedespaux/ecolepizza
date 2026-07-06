// GET  /api/audit  → événements récents + vérification d'intégrité de la chaîne.
// POST /api/audit  → « sceller » : (re)calcule la chaîne pour tous les événements.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashEntry, GENESIS } from "@/lib/audit";

interface Row {
  id: string; action: string; entity: string; entityId: string | null;
  metadata: unknown; createdAt: Date; hash: string | null; prevHash: string | null;
}

function verify(entries: Row[]): { ok: boolean; total: number; brokenAt: number | null; reason?: string } {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.hash) return { ok: false, total: entries.length, brokenAt: i, reason: "non scellé" };
    if ((e.prevHash || GENESIS) !== prev) return { ok: false, total: entries.length, brokenAt: i, reason: "maillon rompu" };
    const recomputed = hashEntry({ action: e.action, entity: e.entity, entityId: e.entityId, metadata: e.metadata, at: e.createdAt.toISOString(), prevHash: prev });
    if (recomputed !== e.hash) return { ok: false, total: entries.length, brokenAt: i, reason: "contenu altéré" };
    prev = e.hash;
  }
  return { ok: true, total: entries.length, brokenAt: null };
}

export async function GET() {
  const entries = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, action: true, entity: true, entityId: true, metadata: true, createdAt: true, hash: true, prevHash: true },
  });
  const check = verify(entries as Row[]);
  const recent = entries.slice(-60).reverse();
  return NextResponse.json({ verify: check, total: entries.length, data: recent });
}

export async function POST() {
  const entries = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, action: true, entity: true, entityId: true, metadata: true, createdAt: true, hash: true, prevHash: true },
  });
  let prev = GENESIS;
  let sealed = 0;
  for (const e of entries as Row[]) {
    const hash = hashEntry({ action: e.action, entity: e.entity, entityId: e.entityId, metadata: e.metadata, at: e.createdAt.toISOString(), prevHash: prev });
    if (e.hash !== hash || (e.prevHash || GENESIS) !== prev) {
      await prisma.auditLog.update({ where: { id: e.id }, data: { hash, prevHash: prev } });
      sealed++;
    }
    prev = hash;
  }
  return NextResponse.json({ sealed, total: entries.length });
}

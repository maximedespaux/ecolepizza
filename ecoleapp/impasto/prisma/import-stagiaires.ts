// Import des stagiaires historiques (carte des stagiaires École Pizza).
// Idempotent : re-jouable sans doublon (id stable basé sur email ou nom+CP).
//   npx tsx prisma/import-stagiaires.ts
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();
const ORG = "org-ecole-pizza";

interface Row {
  n: string; v?: string; cp?: string; ent?: string; e?: string; t?: string;
  niv?: string; an?: string; st?: string; d?: string; lat?: number; lng?: number;
}

const clean = (s?: string) => (s ?? "").trim() || null;
const stableId = (r: Row) => {
  const key = (r.e && r.e.trim().toLowerCase()) || `${r.n}|${r.cp ?? ""}`;
  return "imp_" + createHash("sha1").update(key).digest("hex").slice(0, 22);
};

async function main() {
  const rows: Row[] = JSON.parse(readFileSync(join(process.cwd(), "prisma/data/stagiaires-carte.json"), "utf-8"));
  let created = 0, updated = 0, sansFormation = 0;

  for (const r of rows) {
    const id = stableId(r);
    if (!clean(r.niv)) sansFormation++;
    const data = {
      organizationId: ORG,
      nom: r.n.trim(),
      ville: clean(r.v),
      codePostal: clean(r.cp),
      email: clean(r.e),
      telephone: clean(r.t),
      departement: clean(r.d),
      lat: typeof r.lat === "number" ? r.lat : null,
      lng: typeof r.lng === "number" ? r.lng : null,
      niveauRealise: clean(r.niv),
      anneeRealisee: clean(r.an),
      statut: clean(r.st),
      entrepriseNom: clean(r.ent),
      importSource: "carte-2026",
    };
    const res = await prisma.learner.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    if (res.createdAt.getTime() === res.updatedAt.getTime()) created++; else updated++;
  }

  const total = await prisma.learner.count({ where: { organizationId: ORG } });
  console.log(`✅ Import terminé : ${created} créés, ${updated} mis à jour.`);
  console.log(`   ${sansFormation} sans formation renseignée (→ à compléter / recontacter).`);
  console.log(`   Total stagiaires en base : ${total}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

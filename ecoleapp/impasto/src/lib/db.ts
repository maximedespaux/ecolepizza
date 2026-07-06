import { PrismaClient } from "@prisma/client";
import { hashEntry, GENESIS } from "./audit";

function makeClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Extension : chaîne chaque AuditLog (hash SHA-256 incluant le hash précédent).
  return base.$extends({
    query: {
      auditLog: {
        async create({ args, query }) {
          try {
            const last = await base.auditLog.findFirst({
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: { hash: true },
            });
            const prevHash = last?.hash || GENESIS;
            const at = new Date();
            const d = args.data as Record<string, unknown>;
            d.createdAt = at;
            d.prevHash = prevHash;
            d.hash = hashEntry({
              action: String(d.action), entity: String(d.entity),
              entityId: (d.entityId as string | undefined) ?? null,
              metadata: d.metadata ?? null, at: at.toISOString(), prevHash,
            });
          } catch {
            // Le chaînage ne doit jamais empêcher l'écriture de l'événement.
          }
          return query(args);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof makeClient> };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

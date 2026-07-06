// Journal d'audit chaîné (tamper-evident).
// Chaque événement est haché avec le hash du précédent → toute altération casse la chaîne.
import { createHash } from "crypto";

export const GENESIS = "GENESIS";

export function hashEntry(e: {
  action: string; entity: string; entityId: string | null; metadata: unknown; at: string; prevHash: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      action: e.action, entity: e.entity, entityId: e.entityId ?? null,
      metadata: e.metadata ?? null, at: e.at, prevHash: e.prevHash,
    }))
    .digest("hex");
}

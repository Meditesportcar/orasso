// Modèles de messages réutilisables d'un événement à l'autre (lot 20, docs/01). Ceux d'Orasso (`structure_id` nul,
// seedés) sont proposés à toutes les structures en lecture seule ; chaque structure a les siens (50 au plus).
import { TEMPLATES_PER_STRUCTURE, type TemplateCreate, type TemplateView } from "@orasso/shared";
import { and, asc, count, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { messageTemplates } from "../../db/schema";
import { AppError, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { requireStructureReader, requireStructureSpeaker } from "./guards";

type TemplateRow = typeof messageTemplates.$inferSelect;

const serialize = (t: TemplateRow): TemplateView => ({
  id: t.id,
  kind: t.kind,
  name: t.name,
  subject: t.subject,
  body: t.body,
  orasso: t.structureId === null,
  updatedAt: t.updatedAt.toISOString(),
});

export const templatesService = {
  /** `GET /structures/:id/templates` : modèles Orasso puis ceux de la structure. */
  async list(v: Viewer, structureId: string): Promise<{ items: TemplateView[] }> {
    await requireStructureReader(v, structureId);
    const rows = await db
      .select()
      .from(messageTemplates)
      .where(or(isNull(messageTemplates.structureId), eq(messageTemplates.structureId, structureId)))
      .orderBy(asc(messageTemplates.name));
    const orasso = rows.filter((r) => r.structureId === null);
    const mine = rows.filter((r) => r.structureId !== null);
    return { items: [...orasso, ...mine].map(serialize) };
  },

  async create(v: Viewer, structureId: string, input: TemplateCreate): Promise<TemplateView> {
    const s = await requireStructureSpeaker(v, structureId);
    return withTx(async (tx) => {
      // Plafond par structure tenu face à deux créations simultanées.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`templates:${s.id}`}))`);
      const [n] = await tx.select({ n: count() }).from(messageTemplates).where(eq(messageTemplates.structureId, s.id));
      if ((n?.n ?? 0) >= TEMPLATES_PER_STRUCTURE) {
        throw new AppError(429, "rate_limited", `${TEMPLATES_PER_STRUCTURE} modèles au plus par structure.`);
      }
      const [row] = await tx
        .insert(messageTemplates)
        .values({ structureId: s.id, kind: input.kind, name: input.name, subject: input.subject, body: input.body })
        .returning();
      if (!row) throw new Error("Modèle non enregistré");
      return serialize(row);
    });
  },

  /** Seulement un modèle de la structure : un modèle Orasso ou d'une autre structure → 404. */
  async update(v: Viewer, structureId: string, id: string, input: Partial<TemplateCreate>): Promise<TemplateView> {
    const s = await requireStructureSpeaker(v, structureId);
    const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    if (Object.keys(values).length === 0) {
      const [current] = await db
        .select()
        .from(messageTemplates)
        .where(and(eq(messageTemplates.id, id), eq(messageTemplates.structureId, s.id)));
      if (!current) throw notFound("Modèle introuvable");
      return serialize(current);
    }
    const [row] = await db
      .update(messageTemplates)
      .set(values)
      .where(and(eq(messageTemplates.id, id), eq(messageTemplates.structureId, s.id)))
      .returning();
    if (!row) throw notFound("Modèle introuvable");
    return serialize(row);
  },

  async remove(v: Viewer, structureId: string, id: string) {
    const s = await requireStructureSpeaker(v, structureId);
    const [row] = await db
      .delete(messageTemplates)
      .where(and(eq(messageTemplates.id, id), eq(messageTemplates.structureId, s.id)))
      .returning({ id: messageTemplates.id });
    if (!row) throw notFound("Modèle introuvable");
  },
};

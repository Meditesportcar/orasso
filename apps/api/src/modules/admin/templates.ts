// Modèles de messages d'Orasso (lot 33, docs/02 « réglages : modèles ») : `message_templates` sans structure, proposés
// en lecture seule à toutes les structures (lot 20). Créés, modifiés et retirés par le super admin, tracés.
import type { TemplateCreate, TemplateView } from "@orasso/shared";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { messageTemplates } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { audit } from "./audit";

type Row = typeof messageTemplates.$inferSelect;

const serialize = (t: Row): TemplateView => ({
  id: t.id,
  kind: t.kind,
  name: t.name,
  subject: t.subject,
  body: t.body,
  orasso: true,
  updatedAt: t.updatedAt.toISOString(),
});

export const orassoTemplatesService = {
  async list(v: Viewer): Promise<TemplateView[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select()
      .from(messageTemplates)
      .where(isNull(messageTemplates.structureId))
      .orderBy(asc(messageTemplates.name));
    return rows.map(serialize);
  },

  async create(v: Viewer, input: TemplateCreate): Promise<TemplateView> {
    await requirePlatformRole(v, "super_admin");
    const [row] = await db
      .insert(messageTemplates)
      .values({ structureId: null, kind: input.kind, name: input.name, subject: input.subject, body: input.body })
      .returning();
    if (!row) throw new Error("Modèle non enregistré");
    await audit(db, v, {
      action: "template.create",
      targetType: "message_template",
      targetId: row.id,
      reason: row.name,
    });
    return serialize(row);
  },

  async update(v: Viewer, id: string, input: Partial<TemplateCreate>): Promise<TemplateView> {
    await requirePlatformRole(v, "super_admin");
    const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    const [row] = Object.keys(values).length
      ? await db
          .update(messageTemplates)
          .set(values)
          .where(and(eq(messageTemplates.id, id), isNull(messageTemplates.structureId)))
          .returning()
      : await db
          .select()
          .from(messageTemplates)
          .where(and(eq(messageTemplates.id, id), isNull(messageTemplates.structureId)));
    if (!row) throw notFound("Modèle introuvable");
    await audit(db, v, { action: "template.update", targetType: "message_template", targetId: id, reason: row.name });
    return serialize(row);
  },

  async remove(v: Viewer, id: string) {
    await requirePlatformRole(v, "super_admin");
    const [row] = await db
      .delete(messageTemplates)
      .where(and(eq(messageTemplates.id, id), isNull(messageTemplates.structureId)))
      .returning({ id: messageTemplates.id, name: messageTemplates.name });
    if (!row) throw notFound("Modèle introuvable");
    await audit(db, v, { action: "template.delete", targetType: "message_template", targetId: id, reason: row.name });
  },
};

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { devices, profileInterests, profiles } from "../../db/schema";
import type { Executor } from "../../lib/tx";

export type Profile = typeof profiles.$inferSelect;
export type Device = typeof devices.$inferSelect;

export const profilesRepo = {
  byUserId(userId: string, ex: Executor = db) {
    return ex.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
  },
  byPseudo(pseudo: string, ex: Executor = db) {
    return ex.query.profiles.findFirst({ where: sql`lower(${profiles.pseudo}) = lower(${pseudo})` });
  },
  async pseudoTaken(pseudo: string, exceptUserId?: string, ex: Executor = db) {
    const found = await this.byPseudo(pseudo, ex);
    return Boolean(found && found.userId !== exceptUserId);
  },
  async insert(values: typeof profiles.$inferInsert, ex: Executor = db) {
    const [row] = await ex.insert(profiles).values(values).onConflictDoNothing().returning();
    return row ?? null;
  },
  async update(userId: string, values: Partial<typeof profiles.$inferInsert>, ex: Executor = db) {
    const [row] = await ex.update(profiles).set(values).where(eq(profiles.userId, userId)).returning();
    return row;
  },
  async interests(userId: string, ex: Executor = db) {
    const rows = await ex
      .select({ id: profileInterests.categoryId })
      .from(profileInterests)
      .where(eq(profileInterests.userId, userId));
    return rows.map((r) => r.id);
  },
  async setInterests(userId: string, categoryIds: string[], ex: Executor) {
    await ex.delete(profileInterests).where(eq(profileInterests.userId, userId));
    if (categoryIds.length) {
      await ex.insert(profileInterests).values(categoryIds.map((categoryId) => ({ userId, categoryId })));
    }
  },
  activeDevices(userId: string, ex: Executor = db) {
    return ex.query.devices.findMany({ where: and(eq(devices.userId, userId), isNull(devices.revokedAt)) });
  },
};

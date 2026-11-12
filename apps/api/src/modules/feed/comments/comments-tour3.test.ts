// Commentaires du Fil (lot R8k1, tour 3) : copie du signalement, ordre des verrous à l'anonymisation, groupe recomposé.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, quietHours, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { feedPostComments, feedPosts, notifications, profiles, reports } from "../../../db/schema";
import { withTx } from "../../../lib/tx";
import { accountService } from "../../account/service";
import { moderationService } from "../../moderation/service";
import { notificationsService } from "../../notifications/service";
import { comment, dbPost, person } from "./testkit";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
});

const notifs = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type as never)));

async function admin() {
  const a = await person("Mod_Admin", { twoFactor: true });
  await db.update(profiles).set({ platformRole: "super_admin" }).where(eq(profiles.userId, a.id));
  return a;
}

describe("copie protégée du signalement", () => {
  async function reportedUnderLeavingPost() {
    const owner = await person("Proprio_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(owner);
    const c = await comment(lea, id, "Un commentaire insultant d'un tiers");
    const report = await call(nina, "POST", `/feed-comments/${c.json.id}/report`, { reason: "insult" });
    expect(report.status).toBe(201);
    return { owner, lea, nina, id, c, report };
  }

  it("le propriétaire de la publication supprime son compte pendant l'instruction : le dossier garde le texte signalé", async () => {
    const { owner, c, report } = await reportedUnderLeavingPost();
    await accountService.anonymize(owner.id, null);
    expect(await db.select().from(feedPostComments).where(eq(feedPostComments.id, c.json.id))).toHaveLength(0);
    const detail = await call(await admin(), "GET", `/admin/reports/${report.json.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json.target.text).toBe("Un commentaire insultant d'un tiers");
    expect(detail.json.target.title).toContain("Lea_11");
    expect(detail.json.target.gone).toBe(false);
  });

  it("la copie reste après la décision et part avec le signalement, à son échéance", async () => {
    const { owner, report } = await reportedUnderLeavingPost();
    await accountService.anonymize(owner.id, null);
    const mod = await admin();
    const decided = await call(mod, "POST", `/admin/reports/${report.json.id}/status`, {
      status: "resolved_no_action",
      note: null,
    });
    expect(decided.status).toBe(200);
    const [kept] = await db.select().from(reports).where(eq(reports.id, report.json.id));
    expect(kept?.context?.[0]?.body).toBe("Un commentaire insultant d'un tiers");
    expect(JSON.stringify((await call(mod, "GET", `/admin/reports/${report.json.id}`)).json)).toContain("insultant");
    // Pas encore échu : rien ne part ; échu : le signalement et sa copie sont purgés.
    await moderationService.purge();
    expect(await db.select().from(reports).where(eq(reports.id, report.json.id))).toHaveLength(1);
    await db
      .update(reports)
      .set({ retainUntil: new Date(Date.now() - 1000) })
      .where(eq(reports.id, report.json.id));
    await moderationService.purge();
    expect(await db.select().from(reports).where(eq(reports.id, report.json.id))).toHaveLength(0);
  });
});

describe("ordre des verrous : le Journal du compte supprimé", () => {
  it("un commentaire en cours tient la publication puis la notification ; l'anonymisation prend la publication d'abord", async () => {
    const owner = await person("Proprio_66");
    const lea = await person("Lea_11");
    const id = await dbPost(owner);
    await comment(lea, id, "Une première notification pour le propriétaire");
    expect(await notifs(owner.id, "feed_comment")).toHaveLength(1);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let locked: () => void = () => {};
    const hasPost = new Promise<void>((r) => {
      locked = r;
    });
    // Un commentaire simulé : la publication, une pause, puis la ligne de notification du propriétaire.
    const writer = withTx(async (tx) => {
      await tx.select({ id: feedPosts.id }).from(feedPosts).where(eq(feedPosts.id, id)).for("update");
      locked();
      await gate;
      await tx
        .update(notifications)
        .set({ title: "mise à jour" })
        .where(and(eq(notifications.userId, owner.id), eq(notifications.type, "feed_comment")));
    });
    await hasPost;
    const leaving = accountService.anonymize(owner.id, null);
    await new Promise((r) => setTimeout(r, 600));
    release();
    const [w, l] = await Promise.allSettled([writer, leaving]);
    expect([w.status, l.status]).toEqual(["fulfilled", "fulfilled"]);
    expect(await notifs(owner.id, "feed_comment")).toHaveLength(0);
  });
});

describe("groupe recomposé à la livraison différée", () => {
  it("deux réponses au même commentaire, la seconde supprimée : le groupe est livré sur la première", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const paul = await person("Paul_34");
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    clock.set(new Date("2026-06-15T21:00:00Z"));
    quietHours(true);
    const top = await comment(lea, id, "Premier niveau");
    const first = await comment(nina, id, "Première réponse", { parentId: top.json.id });
    clock.advance(1000);
    const second = await comment(paul, id, "Seconde réponse", { parentId: top.json.id });
    const [group] = await notifs(lea.id, "feed_comment_reply");
    expect(group?.data).toMatchObject({ commentId: second.json.id });
    expect((await call(paul, "DELETE", `/feed-comments/${second.json.id}`)).status).toBe(204);
    expect(await notifs(lea.id, "feed_comment_reply")).toHaveLength(1);
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    const [after] = await notifs(lea.id, "feed_comment_reply");
    expect(after?.data).toMatchObject({ commentId: first.json.id });
    expect(after?.deliveredAt).not.toBeNull();
  });

  it("le groupe d'un auteur de publication reste tant qu'un commentaire lisible existe", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    clock.set(new Date("2026-06-15T21:00:00Z"));
    quietHours(true);
    const a = await comment(lea, id, "Un");
    clock.advance(1000);
    const b = await comment(nina, id, "Deux");
    await call(nina, "DELETE", `/feed-comments/${b.json.id}`);
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    const [kept] = await notifs(author.id, "feed_comment");
    expect(kept?.data).toMatchObject({ commentId: a.json.id });
  });
});

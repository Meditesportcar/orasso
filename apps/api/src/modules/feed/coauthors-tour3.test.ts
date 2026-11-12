// Collaboration (R8o), tour 3 : l'ancien responsable ne garde rien, le journal des envois suit le compte, un UUID de casse
// différente n'est pas un conflit, et « Demandes » se compte avec la seule invitation à publier.
import { randomUUID } from "node:crypto";
import { fromWallTime, inboxRowCounts, requestRowCounts } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createPro,
  createStructure,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { notifications, partnerships, structureMembers } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { accountService } from "../account/service";
import { person } from "./fil-test-helpers";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  quietHours(false);
  useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
});

async function photoOf(u: TestUser) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">${Array.from({ length: 40 }, (_, i) => `<rect x="${(i * 1080) / 40}" y="0" width="13" height="1350" fill="${i % 2 ? "#fff" : "#000"}"/>`).join("")}</svg>`;
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append(
    "file",
    new File([new Uint8Array(await sharp(Buffer.from(svg)).jpeg().toBuffer())], "photo.jpg", { type: "image/jpeg" }),
  );
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return { photos: [{ uploadKey: ((await res.json()) as { key: string }).key, noPlateConfirmed: true }] };
}
const publishWith = async (u: TestUser, coAuthor: { kind: string; id: string }, extra: Record<string, unknown> = {}) =>
  call(u, "POST", "/me/feed-posts", {
    caption: "x",
    ...(await photoOf(u)),
    coAuthor,
    clientId: randomUUID(),
    ...extra,
  });
const coNotifs = (userId: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.type} like 'coauthor\_%'`));

describe("notifications d'invitation après un changement de responsables", () => {
  it("un ancien responsable retiré avant la suppression du compte de l'auteur ne garde rien", async () => {
    const kenji = await person("Kenji_66");
    const owner = await signUp("Orga_T3", { twoFactor: true });
    const second = await signUp("CoOrga_T3");
    const structure = await createStructure(owner.id);
    await addMember(structure.id, second.id, "co_organizer");
    const sent = await publishWith(kenji, { kind: "structure", id: structure.id });
    expect(sent.status).toBe(201);
    expect(await coNotifs(second.id)).toHaveLength(1);
    await db
      .delete(structureMembers)
      .where(and(eq(structureMembers.structureId, structure.id), eq(structureMembers.userId, second.id)));
    await accountService.anonymize(kenji.id, null, {});
    expect(await coNotifs(second.id)).toHaveLength(0);
    expect(await coNotifs(owner.id)).toHaveLength(0);
  });
});

describe("journal des envois", () => {
  it("part avec le compte (service de compte réel) ; la purge ne touche que l'inviteur", async () => {
    const kenji = await person("Kenji_66");
    const other = await person("Autre_Inv");
    const damien = await person("Damien_66");
    await publishWith(kenji, { kind: "user", id: damien.id });
    await publishWith(other, { kind: "user", id: damien.id });
    await db.execute(sql`update feed_coauthor_invite_log set invited_at = now() - interval '3 days'`);
    await publishWith(kenji, { kind: "user", id: damien.id });
    const left = await db.execute(sql`select invited_by from feed_coauthor_invite_log`);
    // La purge de Kenji n'a pas effacé la vieille ligne d'un autre compte.
    expect(left.rows.some((r) => (r as { invited_by: string }).invited_by === other.id)).toBe(true);
    await accountService.anonymize(kenji.id, null, {});
    const after = await db.execute(sql`select invited_by from feed_coauthor_invite_log where invited_by = ${kenji.id}`);
    expect(after.rows).toHaveLength(0);
  });
});

describe("même partenaire, UUID de casses différentes", () => {
  it("le pro partenaire co-auteur et le même UUID en majuscules à la main : pas de conflit", async () => {
    const kenji = await person("Kenji_66");
    const pro = await createPro((await signUp("Garagiste_T3")).id, { name: "Pro T3", verifiedAt: new Date() });
    await db.insert(partnerships).values({ proId: pro.id, userId: kenji.id, message: "ok", status: "active" });
    const sent = await publishWith(kenji, { kind: "pro", id: pro.id }, { commercialPartnerId: pro.id.toUpperCase() });
    // Le même partenaire, d'une autre casse : publié, avec sa mention.
    expect(sent.status).toBe(201);
    expect(sent.json.commercialPartner?.name).toBe("Pro T3");
  });
});

describe("« Demandes » avec la seule invitation à publier", () => {
  it("le résumé garde `pendingRequests` sans l'invitation (ancienne appli) et donne `pendingCoauthors` ; la ligne se compte", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    await publishWith(kenji, { kind: "user", id: damien.id });
    const summary = (await call(damien, "GET", "/me/inbox/summary")).json;
    expect(summary.pendingRequests).toBe(0);
    expect(summary.pendingCoauthors).toBe(1);
    expect(inboxRowCounts(summary).activityRequests).toBe(1);
    expect(requestRowCounts(summary).activityRequests).toBe(1);
  });
});

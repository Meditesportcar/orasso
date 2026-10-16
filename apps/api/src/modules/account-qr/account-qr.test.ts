// QR de compte dynamique (ARCHITECTURE.md § 3.3) : fenêtres valides et expirées, rejeu, secret régénéré.
import { createHash, randomBytes } from "node:crypto";
import { accountQrPayload, fromWallTime } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createPro, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { profiles } from "../../db/schema";
import { hmacSha1 } from "./service";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let kenji: TestUser;
let pro: TestUser;
let secret: Uint8Array;
let shortId: Uint8Array;

/** Ce que l'appli affiche à l'instant `at`, hors ligne, avec le secret reçu au login. */
const payloadAt = (at: Date) => accountQrPayload(secret, shortId, at, hmacSha1);
const verify = async (payload: string) => (await call(pro, "POST", "/account-qr/verify", { payload })).json;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
  kenji = await signUp("Kenji_66");
  pro = await signUp("Garage_Pro");
  await createPro(pro.id);
  const res = await call(kenji, "GET", "/me/account-qr-secret");
  expect(res.status).toBe(200);
  expect(res.json).toMatchObject({ stepSeconds: 60, digits: 8 });
  secret = Buffer.from(res.json.secret, "base64url");
  shortId = Buffer.from(res.json.shortId, "base64url");
});

describe("QR de compte", () => {
  it("code de la fenêtre courante : pseudo et grade, sans remise si le pro n'en accorde pas ; rejeu refusé", async () => {
    const payload = payloadAt(clock.now);
    expect(await verify(payload)).toEqual({ valid: true, pseudo: "Kenji_66", grade: "rodage", discount: null });
    expect(await verify(payload)).toEqual({ valid: false, reason: "replayed" });
  });

  it("dérive d'une minute acceptée, deux minutes refusées (capture prêtée expirée)", async () => {
    expect((await verify(payloadAt(new Date(clock.now.getTime() - 60_000)))).valid).toBe(true);
    expect((await verify(payloadAt(new Date(clock.now.getTime() + 60_000)))).valid).toBe(true);
    expect(await verify(payloadAt(new Date(clock.now.getTime() - 120_000)))).toEqual({
      valid: false,
      reason: "expired",
    });
    clock.advance(3 * 60_000);
    expect((await verify(payloadAt(new Date(clock.now.getTime() - 3 * 60_000)))).reason).toBe("expired");
  });

  it("secret régénéré : les anciens codes ne passent plus", async () => {
    const old = payloadAt(clock.now);
    const rotated = await call(kenji, "POST", "/me/account-qr-secret/rotate");
    expect(rotated.json.shortId).toBe(Buffer.from(shortId).toString("base64url"));
    expect(await verify(old)).toEqual({ valid: false, reason: "expired" });
    secret = Buffer.from(rotated.json.secret, "base64url");
    expect((await verify(payloadAt(clock.now))).valid).toBe(true);
  });

  it("profil créé sans identifiant court (code du lot 05 après retour arrière) : rempli par la base", async () => {
    await db.execute(sql`insert into "user" (id, name, email) values ('ancien0001', 'Ancien', 'ancien@orasso.test')`);
    await db.execute(sql`insert into profiles (user_id, pseudo, account_qr_secret, invite_token)
      values ('ancien0001', 'Ancien_66', ${randomBytes(32)}, 'jeton-ancien')`);
    const row = await db.query.profiles.findFirst({ where: eq(profiles.userId, "ancien0001") });
    expect(row?.accountQrShortId.toString("hex")).toBe(
      createHash("sha256").update("ancien0001").digest().subarray(0, 8).toString("hex"),
    );
  });

  it("QR inconnu ou mal formé ; connexion requise", async () => {
    expect(await verify("OA1AAAAAAAAAAA.12345678")).toEqual({ valid: false, reason: "unknown" });
    expect(await verify("bonjour")).toEqual({ valid: false, reason: "malformed" });
    expect((await call(null, "POST", "/account-qr/verify", { payload: payloadAt(clock.now) })).status).toBe(401);
  });

  it("réservé aux pros : un passionné simple ou un pro non publié reçoit 403", async () => {
    const other = await signUp("Autre_66");
    const res = await call(other, "POST", "/account-qr/verify", { payload: payloadAt(clock.now) });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("forbidden");
    const draft = await signUp("Brouillon_Pro");
    await createPro(draft.id, { publishedAt: null });
    expect((await call(draft, "POST", "/account-qr/verify", { payload: payloadAt(clock.now) })).status).toBe(403);
  });

  it("remise selon le grade du porteur, renvoyée et comptée dans les statistiques du pro", async () => {
    const proRow = await db.query.proProfiles.findFirst();
    await call(pro, "PUT", `/pros/${proRow?.id}/discounts`, { discounts: { rodage: 5, sport: 15 } });
    const first = await verify(payloadAt(clock.now));
    expect(first).toEqual({ valid: true, pseudo: "Kenji_66", grade: "rodage", discount: { percent: 5 } });
    await db.update(profiles).set({ grade: "sport" }).where(eq(profiles.userId, kenji.id));
    clock.advance(60_000);
    expect((await verify(payloadAt(clock.now))).discount).toEqual({ percent: 15 });
    // Grade sans remise : valide, aucune remise, rien de compté.
    await db.update(profiles).set({ grade: "legende" }).where(eq(profiles.userId, kenji.id));
    clock.advance(60_000);
    expect(await verify(payloadAt(clock.now))).toMatchObject({ valid: true, discount: null });
    const stats = await call(pro, "GET", `/pros/${proRow?.id}/stats?days=7`);
    expect(stats.json.discounts).toBe(2);
    expect(stats.json.discountsByGrade).toEqual({ rodage: 1, sport: 1 });
  });

  it("échecs comptés par vérificateur : au-delà de 10 en 10 minutes, même un code juste est refusé", async () => {
    for (let i = 0; i < 10; i++) expect((await verify("OA1AAAAAAAAAAA.12345678")).valid).toBe(false);
    const blocked = await call(pro, "POST", "/account-qr/verify", { payload: payloadAt(clock.now) });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("rate_limited");
  });
});

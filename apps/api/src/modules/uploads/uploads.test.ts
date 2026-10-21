import { randomUUID } from "node:crypto";
import { MEDIA_GALLERY_MAX_PHOTOS, type UploadResult } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { call, createEvent, createStructure, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { uploads } from "../../db/schema";
import { storage } from "../../lib/storage";
import { MAX_PENDING_UPLOADS } from "./service";

const files: string[] = [];
afterEach(async () => {
  await Promise.all(files.splice(0).map((key) => storage.remove(key)));
});
afterAll(() => pool.end());
beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-10-21T10:00:00Z"));
});

async function send(u: TestUser, purpose = "media_content") {
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(image)], "photo.png", { type: "image/png" }));
  const res = await app.request("/api/me/uploads", { method: "POST", body: form, headers: { cookie: u.cookie } });
  const json = (await res.json()) as UploadResult;
  if (res.status === 201) files.push(json.key);
  return { status: res.status, json };
}

describe("envois en attente", () => {
  it("envoie et publie une galerie entière de 30 photos ; les photos rattachées ne sont plus supprimables", async () => {
    const u = await signUp("Media_Galerie");
    const orga = await signUp("Orga_Galerie", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id);
    await call(u, "PUT", "/me/media-profile", {
      name: "Galerie auto",
      formats: ["photo"],
      website: "https://photo.example",
    });
    await call(orga, "PUT", `/events/${event.id}/press-settings`, { accreditationOpen: true });
    const accreditation = await call(u, "POST", `/events/${event.id}/accreditations`, { formats: ["photo"] });
    expect(
      (
        await call(orga, "POST", `/events/${event.id}/applications/${accreditation.json.id}/decide`, {
          decision: "accept",
          sendReasons: true,
          note: null,
        })
      ).status,
    ).toBe(200);
    const sent: UploadResult[] = [];
    for (let i = 0; i < MEDIA_GALLERY_MAX_PHOTOS; i++) {
      const res = await send(u);
      expect(res.status, `photo ${i + 1}`).toBe(201);
      expect(res.json.key).toContain(res.json.id);
      sent.push(res.json);
    }
    const published = await call(u, "POST", "/me/media-contents", {
      eventId: event.id,
      kind: "gallery",
      title: "Trente photos",
      photoKeys: sent.map((s) => s.key),
    });
    expect(published.status).toBe(201);
    expect(published.json.photos).toHaveLength(30);
    expect((await call(u, "DELETE", `/me/uploads/${sent[0]!.id}`)).status).toBe(404);
    expect(await storage.get(sent[0]!.key)).not.toBeNull();
  });

  it("conserve une marge, borne le quota et permet le remplacement immédiat des photos retirées", async () => {
    const u = await signUp("Media_Remplace");
    const sent: UploadResult[] = [];
    expect(MAX_PENDING_UPLOADS).toBeGreaterThan(MEDIA_GALLERY_MAX_PHOTOS);
    for (let i = 0; i < MAX_PENDING_UPLOADS; i++) {
      const res = await send(u);
      expect(res.status).toBe(201);
      sent.push(res.json);
    }
    expect((await send(u)).status).toBe(429);
    for (const removed of sent.slice(0, 5)) {
      expect((await call(u, "DELETE", `/me/uploads/${removed.id}`)).status).toBe(204);
      expect(await storage.get(removed.key)).toBeNull();
      expect(await db.query.uploads.findFirst({ where: eq(uploads.key, removed.key) })).toBeUndefined();
      expect((await send(u)).status).toBe(201);
    }
  });

  it("suppression : connexion, identifiant valide et propriété ; fichier privé également effacé", async () => {
    const u = await signUp("Auteur_Envoi");
    const other = await signUp("Autre_Envoi");
    const sent = (await send(u, "message")).json;
    expect((await call(null, "DELETE", `/me/uploads/${sent.id}`)).status).toBe(401);
    expect((await call(other, "DELETE", `/me/uploads/${sent.id}`)).status).toBe(404);
    expect(await storage.get(sent.key)).not.toBeNull();
    expect((await call(u, "DELETE", "/me/uploads/invalide")).status).toBe(400);
    expect((await call(u, "DELETE", `/me/uploads/${randomUUID()}`)).status).toBe(404);
    expect((await call(u, "DELETE", `/me/uploads/${sent.id}`)).status).toBe(204);
    expect(await storage.get(sent.key)).toBeNull();
    expect((await call(u, "DELETE", `/me/uploads/${sent.id}`)).status).toBe(404);
  });
});

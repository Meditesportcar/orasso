// Outils des tests des albums (lot R9e) : un événement publié, un média accrédité, des envois de photos de test (petits WebP
// générés), la lecture des pixels d'une zone. Pas de test ici.
import { randomBytes } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";

import { call, createEvent, createStructure, signUp, type TestUser } from "../../../test/helpers";
import { app } from "../../app";
import { db } from "../../db/client";
import { applications, eventAlbumPhotos, eventAlbums, mediaProfiles } from "../../db/schema";
import { storage } from "../../lib/storage";

export const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

export const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

export const PROFILE = {
  name: "Sud Cars",
  formats: ["photo", "video"],
  description: "Média auto du Sud : photos, vidéos et articles.",
  website: "https://sudcars.example",
  departments: [],
};

/** Un média : son compte, son profil, et son accréditation (insérée directement) sur les événements voulus. */
export async function mediaUser(pseudo: string, name = "Sud Cars") {
  const user = await signUp(pseudo);
  const res = await call(user, "PUT", "/me/media-profile", { ...PROFILE, name });
  if (res.status !== 200) throw new Error(`Profil média ${res.status} : ${res.text}`);
  return { user, mediaId: res.json.id as string };
}

/** Une accréditation (`status`) du média à l'événement, insérée directement (le tri est testé ailleurs). */
export async function accredit(
  u: TestUser,
  mediaProfileId: string,
  eventId: string,
  status: "accepted" | "pending" | "refused" | "withdrawn" = "accepted",
) {
  const [row] = await db
    .insert(applications)
    .values({
      eventId,
      userId: u.id,
      kind: "media",
      mediaProfileId,
      mediaFormats: ["photo"],
      status,
      rulesAcceptedAt: new Date(0),
      followStructure: false,
    })
    .returning();
  if (!row) throw new Error("accréditation");
  return row;
}

export async function setAccreditation(id: string, status: "accepted" | "pending" | "refused" | "withdrawn") {
  await db.update(applications).set({ status }).where(eq(applications.id, id));
}

/** Un organisateur, sa structure et un événement publié (début demain, quatre heures). */
export async function organizerEvent(over: Parameters<typeof createEvent>[1] = {}) {
  const orga = await signUp("Damien_66", { twoFactor: true });
  const structure = await createStructure(orga.id);
  const event = await createEvent(structure.id, {
    // Unique à chaque appel : un reste d'une remise à zéro sous charge ne peut pas faire doublon (`events_slug_key`).
    slug: `rassemblement-du-lydia-${randomBytes(3).toString("hex")}`,
    title: "Rassemblement du Lydia",
    startsAt: paris(11, 9, 10),
    endsAt: paris(11, 9, 18),
    department: "66",
    ...over,
  });
  return { orga, structure, event };
}

/** Image de test (damier) : une zone floutée perd ses détails fins. */
export async function checker(width = 400, height = 200): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      raw.fill(on ? 240 : 20, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

export type Sent = { id: string; key: string; width: number; height: number };

/** `POST /me/uploads` (multipart) : `purpose` et, au besoin, des cadres de plaque à flouter à l'envoi. */
export async function sendUpload(u: TestUser, purpose = "album_photo", plateRects?: unknown): Promise<Sent> {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(await checker())], "photo.png", { type: "image/png" }));
  if (plateRects !== undefined) form.append("plateRects", JSON.stringify(plateRects));
  const res = await app.request("/api/me/uploads", { method: "POST", body: form, headers: { cookie: u.cookie } });
  if (res.status !== 201) throw new Error(`Envoi ${res.status} : ${await res.text()}`);
  return (await res.json()) as Sent;
}

export const RECT = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

/** Ajoute une photo à l'album : envoi, puis `POST /me/albums/:id/photos`. */
export async function addPhoto(
  u: TestUser,
  albumId: string,
  over: { decision?: "blurred" | "kept" | "none"; clientId?: string; rects?: unknown; upload?: Sent } = {},
) {
  const decision = over.decision ?? "none";
  const rects = decision === "none" ? undefined : (over.rects ?? [RECT]);
  const sent = over.upload ?? (await sendUpload(u, "album_photo", decision === "blurred" ? rects : undefined));
  const res = await call(u, "POST", `/me/albums/${albumId}/photos`, {
    uploadKey: sent.key,
    plateDecision: decision,
    ...(rects ? { plateRects: rects } : {}),
    clientId: over.clientId ?? crypto.randomUUID(),
  });
  return { ...res, sent };
}

/** Un brouillon créé par l'API. */
export async function draftOf(u: TestUser, eventId: string, over: Record<string, unknown> = {}) {
  const res = await call(u, "POST", "/me/albums", { eventId, ...over });
  if (res.status !== 201 && res.status !== 200) throw new Error(`Brouillon ${res.status} : ${res.text}`);
  return res.json as { id: string; photosCount: number; status: string };
}

/** Un album publié avec `n` photos (ajoutées par l'API), prêt à être lu. */
export async function publishedAlbum(u: TestUser, eventId: string, n = 2, over: Record<string, unknown> = {}) {
  const album = await draftOf(u, eventId, over);
  for (let i = 0; i < n; i++) {
    const res = await addPhoto(u, album.id, { decision: "none" });
    if (res.status !== 201) throw new Error(`Ajout ${res.status} : ${res.text}`);
  }
  const pub = await call(u, "POST", `/me/albums/${album.id}/publish`);
  if (pub.status !== 200) throw new Error(`Publication ${pub.status} : ${pub.text}`);
  return pub.json as { id: string };
}

/** Écart-type des pixels d'une zone d'un fichier du stockage (un damier net varie beaucoup, une zone floutée presque plus). */
export async function spread(key: string, box: { left: number; top: number; width: number; height: number }) {
  const file = await storage.get(key);
  if (!file) throw new Error(`Fichier absent : ${key}`);
  const { data } = await sharp(file).extract(box).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  return Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
}

export const INSIDE = { left: 120, top: 70, width: 160, height: 60 };
export const OUTSIDE = { left: 0, top: 0, width: 80, height: 40 };

export async function photoRows(albumId: string) {
  return db
    .select()
    .from(eventAlbumPhotos)
    .where(eq(eventAlbumPhotos.albumId, albumId))
    .orderBy(eventAlbumPhotos.position);
}

export async function albumRow(id: string) {
  const [row] = await db.select().from(eventAlbums).where(eq(eventAlbums.id, id));
  return row;
}

export async function softDeleteMedia(mediaId: string) {
  await db.update(mediaProfiles).set({ deletedAt: new Date() }).where(eq(mediaProfiles.id, mediaId));
}

export const hex = () => randomBytes(8).toString("hex");

/** Les clés (récursives) d'un JSON, pour vérifier une liste blanche. */
export function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysOf(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

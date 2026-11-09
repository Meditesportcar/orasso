import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { apiCall, type Cookie, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7f3 (publier une story) : comptes de recette, photo paysage de démonstration (plaque déjà floutée : aucune plaque
// lisible), et la lecture du fichier publié (largeur et hauteur du WebP, sans dépendance d'image).
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const FIXTURES = resolve(import.meta.dirname, "fixtures");

export const CAPTURES = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7f3-captures/apres`;

/** Photo paysage (1067 × 640, extrait d'une photo du seed dont la plaque est floutée). */
export const landscape = () => ({
  name: "paysage.jpg",
  mimeType: "image/jpeg",
  buffer: readFileSync(`${FIXTURES}/story-paysage-gt86.jpg`),
});

export type Who = { pseudo: string; email: string; cookie: Cookie; id: string };

/** Un compte neuf (connexion par le formulaire avec le mot de passe de recette). */
export async function who(prefix: string, visibility: "public" | "private" = "public"): Promise<Who> {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  if (visibility === "private")
    expect((await apiCall(cookie, "PATCH", "/me/profile", { visibility })).status).toBe(200);
  return { pseudo, email, cookie, id: me.data.user.id };
}

/** `follower` suit `target` ; si le compte est privé, `target` accepte. */
export async function follow(follower: Who, target: Who) {
  const res = await apiCall<{ mine: string }>(follower.cookie, "POST", `/users/${target.pseudo}/follow`);
  expect(res.status).toBeLessThan(300);
  if (res.data.mine === "pending") {
    expect((await apiCall(target.cookie, "POST", `/me/follow-requests/${follower.id}/accept`)).status).toBeLessThan(
      300,
    );
  }
}

type StoryRow = { id: string; mediaUrl: string; caption: string | null; audience: string; tags: { id: string }[] };

/** Les stories de `authorId` visibles par `viewer`. */
export async function storiesOf(viewer: Who | { cookie: Cookie }, authorId: string): Promise<StoryRow[]> {
  const res = await apiCall<{ stories: StoryRow[] }>(viewer.cookie, "GET", `/stories/by-author/u:${authorId}`);
  expect(res.status).toBe(200);
  return res.data.stories;
}

/** Largeur et hauteur d'un WebP (VP8, VP8L ou VP8X). */
export function webpSize(buf: Buffer): { width: number; height: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw new Error("pas un WebP");
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  throw new Error(`WebP inconnu : ${kind}`);
}

/** Le fichier d'une story, tel que `viewer` le reçoit (route protégée), ses dimensions comprises. */
export async function storyFile(viewer: { cookie: Cookie }, story: { mediaUrl: string }) {
  const res = await fetch(`${API}${story.mediaUrl}`, { headers: { cookie: viewer.cookie } });
  expect(res.status).toBe(200);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, ...webpSize(buf) };
}

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";

export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "orasso-demo-2026";
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;

export type Cookie = string;
export type CreatedEvent = { id: string; slug: string; title: string };

/** Appel direct de l'API (comme le ferait le site), avec un cookie de session. */
export async function apiCall<T = unknown>(
  cookie: Cookie | null,
  method: string,
  path: string,
  json?: unknown,
): Promise<{ status: number; data: T; cookie: Cookie | null }> {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      origin: WEB,
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const setCookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T, cookie: setCookie || null };
}

export async function login(email: string, password = SEED_PASSWORD): Promise<Cookie> {
  const res = await apiCall(null, "POST", "/auth/sign-in/email", { email, password });
  if (res.status !== 200 || !res.cookie) throw new Error(`Connexion impossible pour ${email} (${res.status})`);
  return res.cookie;
}

/** Connexion par le formulaire du site. */
export async function loginInBrowser(page: Page, email: string, password = SEED_PASSWORD, retour = "/app/acces") {
  await page.goto(`/connexion?retour=${encodeURIComponent(retour)}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
}

/** J+2 simulé : recule les dates de l'événement puis règle les points (script de l'API, développement seulement). */
export function simulateSettle(slug: string): void {
  const apiDir = resolve(import.meta.dirname, "../../api");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/simulate-settle.ts", slug], {
    cwd: apiDir,
    stdio: "pipe",
    env: { ...process.env },
  });
}

/** Photo de test : un PNG uni de 320 × 240 (le serveur le recompresse en WebP), sans dépendance d'image. */
export function samplePhoto(rgb: [number, number, number] = [138, 74, 42]): Buffer {
  const width = 320;
  const height = 240;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    const tag = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tag, body])));
    return Buffer.concat([head, tag, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Données de test créées par l'API (comme le ferait le site) ----------

let counter = 0;
export const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export const randomPlate = () => {
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${letter()}${letter()}-${String(Math.floor(100 + Math.random() * 900))}-${letter()}${letter()}`;
};

/** Un événement publié par MéditeSportCar, demain (la fenêtre du staff s'ouvre la veille à 00:00). */
export async function createEvent(
  organizer: Cookie,
  opts: {
    title?: string;
    capacity?: number | null;
    admission?: "open" | "filtered";
    rulesText?: string;
    publicAccess?: "free" | "free_reservation" | "paid_orasso" | "closed";
  } = {},
): Promise<CreatedEvent> {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(organizer, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  if (!structureId) throw new Error("Structure MéditeSportCar introuvable : le seed a-t-il tourné ?");
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 5 * 3600 * 1000);
  const title = opts.title ?? `E2E ${unique()}`;
  const created = await apiCall<{ id: string; slug: string }>(organizer, "POST", `/structures/${structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.6988,
    lng: 3.0334,
    admittedVehicleTypes: ["car", "moto"],
    capacity: opts.capacity === undefined ? 40 : opts.capacity,
    maxVehiclesPerUser: 2,
    admission: opts.admission ?? "filtered",
    publicAccess: opts.publicAccess ?? "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: opts.rulesText ?? "Pas de burn, pas de bruit inutile, on respecte les riverains.",
    description: "Événement de test créé par le test de bout en bout.",
  });
  if (created.status !== 201) {
    throw new Error(`Création de l'événement : ${created.status} ${JSON.stringify(created.data)}`);
  }
  const published = await apiCall(organizer, "POST", `/events/${created.data.id}/publish`);
  if (published.status !== 200) throw new Error(`Publication : ${published.status} ${JSON.stringify(published.data)}`);
  return { id: created.data.id, slug: created.data.slug, title };
}

export async function signUpApi(pseudo: string, email = `${pseudo.toLowerCase()}@e2e.orasso.test`): Promise<Cookie> {
  const res = await apiCall(null, "POST", "/auth/sign-up/email", { email, password: SEED_PASSWORD, name: pseudo });
  if (res.status !== 200 || !res.cookie) throw new Error(`Inscription ${pseudo} : ${res.status}`);
  return res.cookie;
}

/** Ajoute un véhicule (avec une photo) au garage ; renvoie son identifiant. */
export async function addVehicleApi(cookie: Cookie, plate: string): Promise<string> {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const make = makes.data.find((m) => m.name === "BMW") ?? makes.data[0];
  const models = await apiCall<{ id: string; isOther: boolean }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${make?.id}/models`,
  );
  const model = models.data.find((m) => !m.isOther) ?? models.data[0];
  const created = await apiCall<{ id: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: make?.id,
    modelId: model?.id,
    year: 1995,
    plate,
  });
  if (created.status !== 201) throw new Error(`Véhicule : ${created.status} ${JSON.stringify(created.data)}`);
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(samplePhoto())], { type: "image/png" }), "photo.png");
  const res = await fetch(`${API}/api/me/vehicles/${created.data.id}/photos`, {
    method: "POST",
    headers: { origin: WEB, cookie },
    body: form,
  });
  if (res.status !== 201) throw new Error(`Photo : ${res.status}`);
  return created.data.id;
}

export async function applyApi(cookie: Cookie, eventId: string, vehicleId: string): Promise<string> {
  const res = await apiCall<{ id: string }[]>(cookie, "POST", `/events/${eventId}/applications`, {
    vehicleIds: [vehicleId],
    rulesAccepted: true,
    followStructure: true,
    newsletterOptIn: false,
    companions: 0,
  });
  if (res.status !== 201) throw new Error(`Candidature : ${res.status} ${JSON.stringify(res.data)}`);
  return res.data[0]?.id ?? "";
}

export async function decideApi(
  organizer: Cookie,
  eventId: string,
  applicationId: string,
  decision: "accept" | "waitlist" | "refuse",
) {
  const res = await apiCall(organizer, "POST", `/events/${eventId}/applications/${applicationId}/decide`, {
    decision,
    ...(decision === "refuse" ? { reasons: ["full"], sendReasons: true } : {}),
  });
  if (res.status !== 200) throw new Error(`Décision : ${res.status} ${JSON.stringify(res.data)}`);
}

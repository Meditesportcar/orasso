// Requêtes de test avec l'en-tête de l'acteur (lot R9a) : `callAs(u, "s:<uuid>", "GET", "/stories/bar")`.
import { ACTOR_HEADER } from "@orasso/shared";

import { app } from "../src/app";
import type { TestUser } from "./helpers";

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

/** `actor` : la valeur de `X-Orasso-Actor` (`null` = pas d'en-tête). */
export async function callAs(u: TestUser | null, actor: string | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u ? { cookie: u.cookie } : {}),
      ...(actor !== null ? { [ACTOR_HEADER]: actor } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text, headers: res.headers };
}

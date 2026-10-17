// Horloge simulée (lot 34a, développement seulement) : « heure système + décalage », le décalage vivant dans la table
// `dev_clock` (une ligne) pour survivre aux redémarrages et être lu par les scripts. `now()` étant synchrone, le décalage
// est gardé en mémoire et relu en base toutes les quelques secondes (un script `pnpm dev:clock` écrit dans le même
// décalage). Sans DEV_CLOCK, `installDevClock` ne fait rien : l'horloge reste celle du système.
import { CLOCK_OFFSET_HEADER } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { db } from "../db/client";
import { devClock } from "../db/schema";
import { env } from "../env";
import { type Clock, deps } from "./deps";

/** Relecture du décalage en base : un autre processus (le script) a pu le changer. */
export const OFFSET_POLL_MS = 2_000;

let offsetMs = 0;
/** Change à chaque écriture locale du décalage : une relecture partie avant ne doit pas écraser une écriture plus récente. */
let version = 0;
let poller: NodeJS.Timeout | null = null;

/** Décalage connu de ce processus (0 si l'horloge n'est pas installée). */
export const currentOffsetMs = () => offsetMs;

/** Pour les scripts et les tests : décalage appliqué tout de suite, sans attendre la relecture. */
export function setCachedOffset(ms: number) {
  version++;
  offsetMs = Math.max(0, Math.trunc(ms));
}

/** Heure système, sans décalage (journaux, curseurs techniques, calculs de décalage). */
export const realNowMs = () => Date.now();

export const simulatedClock: Clock = { now: () => new Date(realNowMs() + offsetMs) };

export async function readStoredOffset(): Promise<number> {
  const [row] = await db.select({ offsetMs: devClock.offsetMs }).from(devClock).where(eq(devClock.id, 1));
  return Math.max(0, Number(row?.offsetMs ?? 0));
}

/** Relit le décalage en base et l'applique. */
export async function refreshOffset(): Promise<number> {
  const seen = version;
  const stored = await readStoredOffset();
  if (seen === version) setCachedOffset(stored);
  return offsetMs;
}

/**
 * Branche l'horloge simulée sur `deps.clock` quand DEV_CLOCK est posée (l'API et les scripts), après avoir lu le
 * décalage. `poll: false` pour un script de courte durée. Sans DEV_CLOCK : rien.
 */
export async function installDevClock({ poll = true } = {}): Promise<boolean> {
  if (!env.DEV_CLOCK) return false;
  await refreshOffset();
  deps.clock = simulatedClock;
  if (poll && !poller) {
    poller = setInterval(() => {
      refreshOffset().catch(() => {});
    }, OFFSET_POLL_MS);
    poller.unref();
  }
  return true;
}

/** Ajoute `x-orasso-clock-offset` (ms) à chaque réponse quand DEV_CLOCK est posée ; sans elle, ne touche à rien. */
export const clockOffsetHeader = createMiddleware(async (c, next) => {
  await next();
  if (!env.DEV_CLOCK || c.req.header("upgrade")) return;
  try {
    c.res.headers.set(CLOCK_OFFSET_HEADER, String(offsetMs));
  } catch {
    // En-têtes en lecture seule (réponse issue d'un `fetch`) : on recopie la réponse.
    c.res = new Response(c.res.body, c.res);
    c.res.headers.set(CLOCK_OFFSET_HEADER, String(offsetMs));
  }
});

export function stopDevClockPolling() {
  if (poller) clearInterval(poller);
  poller = null;
}

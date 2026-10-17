// Sources externes de l'Accueil (lot 30, ARCHITECTURE-SUITE § 13.3, S35) : cache en base `external_cache`, un seul appel à
// la fois par clé, délai d'attente après un échec, jamais bloquant. Une requête d'utilisateur ne déclenche un appel que
// si la clé n'a pas de cache valable ; elle n'attend jamais plus que `EXTERNAL_BUDGET_MS`.
import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { externalCache } from "../../db/schema";
import { env } from "../../env";
import { now } from "../deps";

type FetchLike = typeof fetch;
let fetchImpl: FetchLike | null = null;

/** Tests : remplace l'appel réseau (`null` pour revenir au vrai service). Réinitialise les échecs mémorisés. */
export function setExternalFetch(f: FetchLike | null) {
  fetchImpl = f;
  failures.clear();
  flights.clear();
}

/** Les tests n'appellent jamais le réseau : sans `setExternalFetch`, les sources externes y sont désactivées. */
export function externalEnabled(): boolean {
  return env.NODE_ENV !== "test" || fetchImpl !== null;
}

const TIMEOUT_MS = 20_000;
/** Une requête d'utilisateur n'attend pas une source externe plus de 2,5 s (l'appel continue et remplit le cache). */
export const EXTERNAL_BUDGET_MS = 2500;
/** Après un échec, la source n'est pas réinterrogée avant ce délai (on sert l'ancien cache s'il existe). */
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

/** Taille maximale d'une réponse externe lue (2 Mo) : une source qui répond n'importe quoi ne remplit pas la mémoire. */
export const MAX_EXTERNAL_BYTES = 2 * 1024 * 1024;

/** JSON d'une réponse, lu par morceaux et abandonné au-delà de `MAX_EXTERNAL_BYTES`. */
export async function readBoundedJson(res: Response, max = MAX_EXTERNAL_BYTES): Promise<unknown> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new Error("réponse trop volumineuse");
  const reader = res.body?.getReader();
  if (!reader) return JSON.parse(await res.text());
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error("réponse trop volumineuse");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Appel HTTP identifié (`User-Agent`), borné dans le temps. */
export async function externalRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("user-agent", env.EXTERNAL_USER_AGENT);
  headers.set("accept", "application/json");
  const res = await (fetchImpl ?? fetch)(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

const failures = new Map<string, number>();
const flights = new Map<string, Promise<unknown>>();

export type CachedSourceOptions<T> = {
  key: string;
  /** Durée de validité du cache. */
  ttlMs: number;
  /** Au-delà, même l'ancien cache n'est plus servi (des prix de la semaine dernière ne valent rien). */
  maxStaleMs: number;
  /** Faux (source désactivée par `off`) : on ne lit que le cache, jamais la source. */
  enabled?: boolean;
  /** Appelle la source ; lève une erreur ou renvoie `null` si elle ne répond pas. */
  load: () => Promise<T | null>;
};

/**
 * Données d'une source, du cache si valable, sinon d'un appel (regroupé par clé). Source désactivée, en échec récent
 * ou injoignable : l'ancien cache tant qu'il n'est pas trop vieux, sinon `null`. Ne lève jamais.
 */
export async function cachedSource<T>(opts: CachedSourceOptions<T>): Promise<T | null> {
  const { key, ttlMs, maxStaleMs, load, enabled = true } = opts;
  const t = now().getTime();
  let row: typeof externalCache.$inferSelect | undefined;
  try {
    row = await db.query.externalCache.findFirst({ where: eq(externalCache.key, key) });
  } catch {
    return null;
  }
  const age = row ? t - row.fetchedAt.getTime() : Number.POSITIVE_INFINITY;
  if (row && age < ttlMs) return row.data as T;
  const stale = row && age < maxStaleMs ? (row.data as T) : null;
  if (!enabled || !externalEnabled()) return stale;
  const failedAt = failures.get(key);
  if (failedAt !== undefined && t - failedAt < RETRY_AFTER_FAILURE_MS) return stale;

  let flight = flights.get(key) as Promise<T | null> | undefined;
  if (!flight) {
    flight = (async () => {
      try {
        const data = await load();
        if (data === null) throw new Error("réponse inutilisable");
        const values = { key, fetchedAt: now(), data: data as unknown };
        await db.insert(externalCache).values(values).onConflictDoUpdate({ target: externalCache.key, set: values });
        failures.delete(key);
        return data;
      } catch (error) {
        failures.set(key, now().getTime());
        console.warn(`Source externe ${key} indisponible :`, error instanceof Error ? error.message : error);
        return stale;
      } finally {
        flights.delete(key);
      }
    })();
    flights.set(key, flight);
  }
  return flight;
}

/** Attend au plus `EXTERNAL_BUDGET_MS` : au-delà, `fallback` (l'appel continue en arrière-plan et remplit le cache). */
export async function withinBudget<T>(promise: Promise<T>, fallback: T, budgetMs = EXTERNAL_BUDGET_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), budgetMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Réglages administrables de la plateforme (lot 33, ARCHITECTURE-SUITE § 16) : lecture par les vrais services
// (inscription, sponsorisés, prestataires, règlement des points, grades, listes) avec un cache de 60 s, invalidé à
// chaque écriture par l'administration. Une valeur absente ou abîmée en base = la valeur par défaut (constantes).
import {
  type AdminSettingKey,
  type AdminSettingValues,
  adminSettingDefaults,
  adminSettingKeys,
  adminSettingSchemas,
  type PointsConfig,
  pointsConfigFrom,
} from "@orasso/shared";
import { inArray } from "drizzle-orm";

import { db } from "../db/client";
import { platformSettings } from "../db/schema";
import { now } from "./deps";

export const SETTINGS_CACHE_MS = 60_000;

type Row = { value: unknown; updatedAt: Date; updatedBy: string | null };
let cache: { at: number; values: AdminSettingValues; rows: Map<string, Row> } | null = null;

async function load() {
  const t = now().getTime();
  if (cache && t - cache.at < SETTINGS_CACHE_MS) return cache;
  const rows = await db.query.platformSettings.findMany({
    where: inArray(platformSettings.key, [...adminSettingKeys]),
  });
  const values = structuredClone(adminSettingDefaults);
  const byKey = new Map<string, Row>();
  for (const r of rows) {
    byKey.set(r.key, { value: r.value, updatedAt: r.updatedAt, updatedBy: r.updatedBy });
    const key = r.key as AdminSettingKey;
    const parsed = adminSettingSchemas[key].safeParse(r.value);
    // Valeur écrite par une version plus ancienne et devenue invalide : on garde la valeur par défaut.
    if (parsed.success) (values as Record<string, unknown>)[key] = parsed.data;
  }
  cache = { at: t, values, rows: byKey };
  return cache;
}

export const settingsStore = {
  async get<K extends AdminSettingKey>(key: K): Promise<AdminSettingValues[K]> {
    return structuredClone((await load()).values[key]);
  },

  async all(): Promise<{ values: AdminSettingValues; rows: Map<string, Row> }> {
    const c = await load();
    // Copies : un appelant qui modifie le résultat ne touche pas au cache (relecture).
    return { values: structuredClone(c.values), rows: new Map(c.rows) };
  },

  /** Après une écriture (ou dans les tests) : la prochaine lecture repart de la base. */
  invalidate() {
    cache = null;
  },
};

/** Barème des points et seuils des grades en vigueur (cache de 60 s, constantes partagées par défaut). */
export async function getPointsConfig(): Promise<PointsConfig> {
  return pointsConfigFrom(structuredClone((await load()).values));
}

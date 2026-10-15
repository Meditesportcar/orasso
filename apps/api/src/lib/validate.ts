import type { Context } from "hono";
import type { z } from "zod";

import { validation } from "./errors";

/** Valide une entrée avec un schéma zod partagé ; `400 validation_error` avec le détail des champs sinon. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    throw validation("Données invalides", { fields });
  }
  return result.data;
}

export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    throw validation("Corps JSON attendu");
  }
  return parse(schema, data);
}

export function query<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return parse(schema, c.req.query());
}

/** Paramètre de chemin au format uuid (évite une erreur PostgreSQL sur un identifiant mal formé). */
export function uuidParam(c: Context, name: string): string {
  const v = c.req.param(name) ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw validation(`${name} invalide`);
  return v;
}

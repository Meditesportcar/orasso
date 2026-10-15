import { z } from "zod";

/** Codes d'erreur de l'API (ARCHITECTURE.md § 5.1) : `{"error":{"code","message","details"}}`. */
export const errorCodes = [
  "validation_error",
  "unauthenticated",
  "two_factor_required",
  "forbidden",
  "not_found",
  "conflict",
  "invalid_transition",
  "event_full",
  "plate_taken",
  "offer_expired",
  "locked",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "internal",
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export type ApiError = { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } };

/** Date ISO 8601 en entrée (avec fuseau), convertie en Date. */
export const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

/** Texte facultatif : chaîne vide → null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Pagination par curseur : `?limit=20&cursor=<opaque>` → `{items, nextCursor}`. */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
export type Page<T> = { items: T[]; nextCursor: string | null };

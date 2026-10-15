import type { ErrorCode } from "@orasso/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Erreur métier : convertie en `{"error":{"code","message","details"}}` (ARCHITECTURE.md § 5.1). */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (message = "Introuvable") => new AppError(404, "not_found", message);
export const forbidden = (message = "Accès refusé") => new AppError(403, "forbidden", message);
export const unauthenticated = () => new AppError(401, "unauthenticated", "Connexion requise");
export const conflict = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);
export const invalidTransition = (from: string | null, to: string) =>
  new AppError(409, "invalid_transition", `Transition interdite : ${from ?? "∅"} → ${to}`, { from, to });
export const validation = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, "validation_error", message, details);

export function errorResponse(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: "internal", message: "Erreur interne" } }, 500);
}

// Contexte de la requête HTTP en cours (lot 33) : méthode, chemin, adresse et appareil, lisibles par les gardes sans
// changer leur signature. Sert au mode assistance (S41) : `requireOrganizer` distingue une lecture d'une écriture d'un
// super admin dans l'espace d'une structure. Hors requête (tâches, scripts, WebSocket) : `null`.
import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";
import { createMiddleware } from "hono/factory";

export type RequestInfo = { method: string; path: string; ip: string | null; userAgent: string | null };

const storage = new AsyncLocalStorage<RequestInfo>();

/** Première adresse de `x-forwarded-for` (posée par nginx), si c'est bien une adresse IP. */
export function forwardedIp(header: string | undefined | null): string | null {
  const ip = header?.split(",")[0]?.trim() ?? "";
  return isIP(ip) ? ip : null;
}

export const requestContext = {
  get(): RequestInfo | null {
    return storage.getStore() ?? null;
  },
  /** Écriture (méthode autre que GET / HEAD / OPTIONS) ? `false` hors requête. */
  isWrite(): boolean {
    const m = storage.getStore()?.method.toUpperCase();
    return Boolean(m) && m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
  },
};

export const requestContextMiddleware = createMiddleware(async (c, next) => {
  const info: RequestInfo = {
    method: c.req.method,
    path: c.req.path,
    ip: forwardedIp(c.req.header("x-forwarded-for")),
    userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
  };
  await storage.run(info, next);
});

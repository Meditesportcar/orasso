// Contexte de la requête HTTP en cours (lot 33) : méthode, chemin, adresse et appareil, lisibles par les gardes sans
// changer leur signature. Sert au mode assistance (S41) : `requireOrganizer` distingue une lecture d'une écriture d'un
// super admin dans l'espace d'une structure, et la trace `structure.assist` n'est écrite qu'une fois par requête, après
// la réponse et seulement si l'écriture a réussi. Hors requête (tâches, scripts, WebSocket) : `null`.
import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";
import { createMiddleware } from "hono/factory";

import { db } from "../db/client";
import { adminAuditLog } from "../db/schema";

/** Écriture d'un super admin sur demande d'aide, à tracer si la requête réussit. */
export type AssistWrite = { actorUserId: string; structureId: string; assistanceRequestId: string };

export type RequestInfo = {
  method: string;
  path: string;
  ip: string | null;
  userAgent: string | null;
  assist?: AssistWrite;
};

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
  /** Exécute `fn` comme pendant une requête (tests). */
  run<T>(info: RequestInfo, fn: () => Promise<T>): Promise<T> {
    return storage.run(info, fn);
  },
  /** Note l'écriture en assistance (la première de la requête) ; tracée après la réponse si elle réussit. */
  noteAssist(write: AssistWrite) {
    const store = storage.getStore();
    if (store && !store.assist) store.assist = write;
  },
};

export const requestContextMiddleware = createMiddleware(async (c, next) => {
  const info: RequestInfo = {
    method: c.req.method,
    path: c.req.path,
    ip: forwardedIp(c.req.header("x-forwarded-for")),
    userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
  };
  await storage.run(info, async () => {
    await next();
    if (info.assist && c.res.status < 400) {
      await db.insert(adminAuditLog).values({
        actorUserId: info.assist.actorUserId,
        action: "structure.assist",
        targetType: "structure",
        targetId: info.assist.structureId,
        structureId: info.assist.structureId,
        assistanceRequestId: info.assist.assistanceRequestId,
        reason: `${info.method} ${info.path}`.slice(0, 300),
        ip: info.ip,
        userAgent: info.userAgent,
      });
    }
  });
});

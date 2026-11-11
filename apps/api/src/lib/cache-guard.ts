import { createMiddleware } from "hono/factory";

/**
 * Filet de sécurité (correctif cache et session, 11/11) : une réponse qui porte un `Set-Cookie` (cookie de session
 * renouvelé par `loadSession`, connexion...) ne doit jamais être gardée par un cache partagé (CDN, proxy), qui la
 * redonnerait à un autre visiteur. Si son `Cache-Control` est public, il devient `private` (même durée, sans
 * `s-maxage` ni `proxy-revalidate`, qui ne visent que les caches partagés).
 */
export function privateIfSetCookie(cacheControl: string): string {
  const parts = cacheControl
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "" && !/^(s-maxage|proxy-revalidate)\b/i.test(p));
  return parts.map((p) => (/^public$/i.test(p) ? "private" : p)).join(", ");
}

export const cacheGuard = createMiddleware(async (c, next) => {
  await next();
  const cacheControl = c.res.headers.get("cache-control");
  if (!cacheControl || !/(^|[\s,])public([\s,]|$)/i.test(cacheControl)) return;
  if (c.res.headers.getSetCookie().length === 0) return;
  const safe = privateIfSetCookie(cacheControl);
  try {
    c.res.headers.set("cache-control", safe);
  } catch {
    // En-têtes figés (réponse venue d'ailleurs, Better Auth) : copie de la réponse. Hono recopie les anciens en-têtes
    // dans la nouvelle réponse à l'affectation ; la valeur est donc reposée après.
    c.res = new Response(c.res.body, c.res);
    c.res.headers.set("cache-control", safe);
  }
});

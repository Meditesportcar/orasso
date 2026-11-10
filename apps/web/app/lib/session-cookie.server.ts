// Lot R3d, tour 2 (relecture Codex) : la session glissante d'un an l'est aussi pour le navigateur. L'API prolonge la
// session au plus une fois par jour et renvoie alors un cookie renouvelé (`Set-Cookie` du cookie de session, nouvelle
// durée) ; les appels faits par le rendu serveur avec le cookie du visiteur le recueillent ici, et le middleware du site
// (`root.tsx`) le transmet à la réponse, page ou données. Un cookie déjà posé par la page (connexion, déconnexion,
// `withCookies`) n'est jamais doublé ni contredit.
import { AsyncLocalStorage } from "node:async_hooks";

// Better Auth n'est pas configuré avec un préfixe de cookie (`apps/api/src/auth.ts`) : ses noms par défaut, préfixés
// `__Secure-` en HTTPS. Un seul endroit les écrit côté site.
const COOKIE_PREFIX = "better-auth";
const SESSION_COOKIE = new RegExp(`^(__Secure-)?${COOKIE_PREFIX}\\.session_token=`);

const collected = new AsyncLocalStorage<string[]>();

/** Un `Set-Cookie` de l'API, reçu pour le cookie du visiteur : gardé s'il touche le cookie de session. */
export function collectSessionCookies(headers: Headers): void {
  const bag = collected.getStore();
  if (!bag) return;
  for (const cookie of headers.getSetCookie()) if (SESSION_COOKIE.test(cookie)) bag.push(cookie);
}

/** Exécute le rendu d'une requête en recueillant les cookies de session renouvelés, puis les ajoute à la réponse. */
export async function withRenewedSessionCookie(next: () => Promise<Response>): Promise<Response> {
  const bag: string[] = [];
  const response = await collected.run(bag, next);
  if (bag.length === 0) return response;
  const already = response.headers.getSetCookie().some((c) => SESSION_COOKIE.test(c));
  if (already) return response;
  // Le dernier reçu fait foi (plusieurs appels de l'API dans la même page).
  const last = bag[bag.length - 1];
  if (!last) return response;
  try {
    response.headers.append("set-cookie", last);
    return response;
  } catch {
    // En-têtes figés (redirection) : une copie de la réponse.
    const copy = new Response(response.body, response);
    copy.headers.append("set-cookie", last);
    return copy;
  }
}

/** `Set-Cookie` qui effacent les cookies de session du navigateur (déconnexion non confirmée par l'API, suppression de compte). */
export function expiredSessionCookies(): string[] {
  return ["session_token", "session_data"].flatMap((suffix) =>
    [`${COOKIE_PREFIX}.${suffix}`, `__Secure-${COOKIE_PREFIX}.${suffix}`].map(
      (name) => `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${name.startsWith("__Secure") ? "; Secure" : ""}`,
    ),
  );
}

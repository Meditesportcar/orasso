// Lot R3d, tour 2 (relecture Codex) : la session glissante d'un an l'est aussi pour le navigateur. L'API prolonge la
// session au plus une fois par jour et renvoie alors un cookie renouvelé (`Set-Cookie` du cookie de session, nouvelle
// durée) ; les appels faits par le rendu serveur avec le cookie du visiteur le recueillent ici, et le middleware du site
// (`root.tsx`) le transmet à la réponse, page ou données. Un cookie déjà posé par la page (connexion, déconnexion,
// `withCookies`) n'est jamais doublé ni contredit.
import { AsyncLocalStorage } from "node:async_hooks";

const SESSION_COOKIE = /^(__Secure-)?better-auth\.session_token=/;

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

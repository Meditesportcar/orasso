// robots.txt du site public. Les espaces connectés et les liens à jeton ne sont pas indexés. La version de test
// (dev.orasso.fr) répond avant le site : nginx sert son propre robots.txt qui interdit tout, et pose `X-Robots-Tag`.
import { originOf } from "../lib/api.server";
import type { Route } from "./+types/robots";

export function loader({ request }: Route.LoaderArgs) {
  const origin = originOf(request);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /app",
    "Disallow: /orga/",
    "Disallow: /admin",
    "Disallow: /express/",
    "Disallow: /invitation/",
    "Disallow: /connexion",
    "Disallow: /inscription",
    "Disallow: /deconnexion",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

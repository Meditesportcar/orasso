// Plan du site pour les moteurs de recherche : pages fixes, événements (à venir et passés), structures vérifiées.
import type { EventCard, Page, ProCard, StructureCard } from "@orasso/shared";

import { api, originOf } from "../lib/api.server";
import type { Route } from "./+types/sitemap";

const escapeXml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Toutes les pages d'une liste paginée par curseur (au plus 10 pages de 100). */
async function allPages<T>(request: Request, path: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const sep: string = path.includes("?") ? "&" : "?";
    const res: Awaited<ReturnType<typeof api<Page<T>>>> = await api<Page<T>>(
      request,
      `${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!res.ok) break;
    out.push(...res.data.items);
    cursor = res.data.nextCursor;
    if (!cursor) break;
  }
  return out;
}

export async function loader({ request }: Route.LoaderArgs) {
  const origin = originOf(request);
  const [upcoming, past, structures, pros] = await Promise.all([
    allPages<EventCard>(request, "/events"),
    allPages<EventCard>(request, "/events?scope=past"),
    allPages<StructureCard>(request, "/structures"),
    allPages<ProCard>(request, "/pros"),
  ]);
  const urls = [
    "/",
    "/evenements",
    "/organisateurs",
    "/professionnels",
    "/pros",
    ...[...upcoming, ...past].map((e) => `/e/${e.slug}`),
    ...structures.map((s) => `/o/${s.slug}`),
    ...pros.map((p) => `/p/${p.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${escapeXml(origin + u)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

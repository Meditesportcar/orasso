// Export de mes données (lot M5, parité de l'appli : lot 35c) : `GET /app/mes-donnees` relaie `GET /me/export` de l'API
// et le rend en fichier JSON à enregistrer. Rien n'est gardé en cache (données personnelles).
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/mes-donnees";

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const res = await api<unknown>(request, "/me/export");
  if (!res.ok) {
    return new Response(res.error.message, {
      status: res.status,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(res.data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="orasso-mes-donnees-${day}.json"`,
      "cache-control": "private, no-store",
    },
  });
}

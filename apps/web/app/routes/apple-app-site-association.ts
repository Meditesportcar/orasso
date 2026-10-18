// Universal Links iOS (lot 36), préparés sans être activés : pas encore de compte Apple Developer, donc pas d'identifiant
// d'équipe. `APPLE_TEAM_ID` posé (et `associatedDomains` ajouté à `apps/mobile/app.json`, voir docs/JOURNAL-DES-CHOIX.md)
// suffit à les activer ; sans lui, le fichier répond 404 (rien n'est annoncé à iOS).
import type { Route } from "./+types/apple-app-site-association";

/** Chemins ouverts dans l'appli : les mêmes que les App Links Android. */
export const APP_LINK_PATHS = ["/verification-email", "/e/*"];

export function loader(_: Route.LoaderArgs) {
  const team = process.env.APPLE_TEAM_ID?.trim();
  if (!team) return new Response("Not Found", { status: 404 });
  const body = {
    applinks: {
      details: [{ appIDs: [`${team}.fr.orasso.app`], components: APP_LINK_PATHS.map((p) => ({ "/": p })) }],
    },
  };
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}

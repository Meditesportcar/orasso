// Liens du site ouverts dans l'appli (lot 36, Android App Links sur `/e/…` et `/verification-email`) : les chemins du
// site qui n'ont pas le même nom dans l'appli sont réécrits ici, avant la navigation d'Expo Router.
//   /e/<slug>/candidater → /candidater/<slug>
//   /e/<slug>/crew       → /crew/inscription?event=<slug>
// Lot 40 (navigation v2) : les anciens chemins de l'espace utilisateur du site et des onglets de l'appli mènent à leur
// nouvelle place (`/acces` et `/moi` redirigent vers l'onglet Sorties ou Profil de la casquette active).
//   /app/acces, /app/sorties → /acces (paramètres gardés)
//   /app/activite[/demandes], /app/messages[/demandes|/<id>] → /activite…, /messages… (lot R7c2 : la Boîte a disparu)
//   /app/boite → /messages, /app/boite/demandes → /activite/demandes, /app/boite/<id> → /messages/<id>, /app/journal → /activite
//   /app/moi, /app/profil    → /moi
// Les autres chemins (`/e/<slug>`, `/verification-email?token=…`) existent tels quels dans l'appli.
import { inboxPathOf } from "../lib/links";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, "https://orasso.fr");
    const apply = /^\/e\/([^/]+)\/candidater\/?$/.exec(url.pathname);
    if (apply?.[1]) return `/candidater/${apply[1]}`;
    const crew = /^\/e\/([^/]+)\/crew\/?$/.exec(url.pathname);
    if (crew?.[1]) return `/crew/inscription?event=${encodeURIComponent(crew[1])}`;
    if (/^\/app\/(acces|sorties)\/?$/.test(url.pathname)) return `/acces${url.search}`;
    const inbox = inboxPathOf(url.pathname.replace(/\/+$/, ""));
    if (inbox) return inbox;
    if (/^\/app\/(moi|profil)\/?$/.test(url.pathname)) return "/moi";
    return path;
  } catch {
    return path;
  }
}

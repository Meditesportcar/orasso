// Liens du site ouverts dans l'appli (lot 36, Android App Links sur `/e/…` et `/verification-email`) : les chemins du
// site qui n'ont pas le même nom dans l'appli sont réécrits ici, avant la navigation d'Expo Router.
//   /e/<slug>/candidater → /candidater/<slug>
//   /e/<slug>/crew       → /crew/inscription?event=<slug>
// Lot 40 (navigation v2) : les anciens chemins de l'espace utilisateur du site et des onglets de l'appli mènent à leur
// nouvelle place (`/acces` et `/moi` redirigent vers l'onglet Sorties ou Profil de la casquette active).
//   /app/acces, /app/sorties → /acces (paramètres gardés)
//   /app/boite[/<id>]        → /boite[/<id>] (la Boîte n'est plus un onglet ; `/demandes` → segment Demandes)
//   /app/moi, /app/profil    → /moi
// Les autres chemins (`/e/<slug>`, `/verification-email?token=…`) existent tels quels dans l'appli.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, "https://orasso.fr");
    const apply = /^\/e\/([^/]+)\/candidater\/?$/.exec(url.pathname);
    if (apply?.[1]) return `/candidater/${apply[1]}`;
    const crew = /^\/e\/([^/]+)\/crew\/?$/.exec(url.pathname);
    if (crew?.[1]) return `/crew/inscription?event=${encodeURIComponent(crew[1])}`;
    if (/^\/app\/(acces|sorties)\/?$/.test(url.pathname)) return `/acces${url.search}`;
    const inbox = /^\/app\/boite(?:\/([0-9a-f-]{36}|demandes))?\/?$/.exec(url.pathname);
    if (inbox) return inbox[1] === "demandes" ? "/boite?segment=demandes" : inbox[1] ? `/boite/${inbox[1]}` : "/boite";
    if (/^\/app\/(moi|profil)\/?$/.test(url.pathname)) return "/moi";
    return path;
  } catch {
    return path;
  }
}

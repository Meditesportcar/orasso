// Liens du site ouverts dans l'appli (lot 36, Android App Links sur `/e/…` et `/verification-email`) : les chemins du
// site qui n'ont pas le même nom dans l'appli sont réécrits ici, avant la navigation d'Expo Router.
//   /e/<slug>/candidater → /candidater/<slug>
//   /e/<slug>/crew       → /crew/inscription?event=<slug>
// Les autres chemins (`/e/<slug>`, `/verification-email?token=…`) existent tels quels dans l'appli.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = new URL(path, "https://orasso.fr");
    const apply = /^\/e\/([^/]+)\/candidater\/?$/.exec(url.pathname);
    if (apply?.[1]) return `/candidater/${apply[1]}`;
    const crew = /^\/e\/([^/]+)\/crew\/?$/.exec(url.pathname);
    if (crew?.[1]) return `/crew/inscription?event=${encodeURIComponent(crew[1])}`;
    return path;
  } catch {
    return path;
  }
}

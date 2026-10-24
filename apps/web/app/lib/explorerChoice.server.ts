// Le choix de l'Explorer du site reste (lot R1, comme l'appli) : les réglages sont dans l'adresse ; le dernier choix
// (segment, vue, tri, « Autour de… », distance, filtres) est aussi gardé dans un cookie de préférence, et une arrivée
// sur `/app/explorer` sans réglage le reprend. Jamais la position (`lat`, `lng`) : « Autour de moi » ne garde que le
// mode. Ni le texte de recherche, ni la page suivante. Le cookie s'efface à la déconnexion (comme celui du département).

export const EXPLORER_COOKIE = "orasso-explorer";
const MAX_AGE = 180 * 24 * 3600;

/** Les réglages gardés : ceux des sélecteurs et des filtres, rien d'autre. */
const KEPT = [
  "segment",
  "vue",
  "tri",
  "autour",
  "ailleurs",
  "rayon",
  "format",
  "quand",
  "affinites",
  "suivis",
  "metier",
  "lieu",
  "montrer",
  "interet",
  "grade",
] as const;
const VALUE = /^[A-Za-z0-9_-]{1,40}$/;

/** Les réglages gardables d'une adresse (`null` s'il n'y en a aucun, ou pour les résultats d'une recherche). */
export function keptExplorerParams(params: URLSearchParams): string | null {
  if (params.get("segment") === "resultats") return null;
  const out = new URLSearchParams();
  for (const key of KEPT) {
    const value = params.get(key);
    if (value && VALUE.test(value)) out.set(key, value);
  }
  const text = out.toString();
  return text || null;
}

/** Le choix gardé dans le cookie, relu prudemment (seules les clés et valeurs gardables reviennent). */
export function readExplorerCookie(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== EXPLORER_COOKIE) continue;
    try {
      return keptExplorerParams(new URLSearchParams(decodeURIComponent(rest.join("="))));
    } catch {
      return null;
    }
  }
  return null;
}

function secure(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https" ? "; Secure" : "";
}

export function setExplorerCookie(request: Request, kept: string): string {
  return `${EXPLORER_COOKIE}=${encodeURIComponent(kept)}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}

export function clearExplorerCookie(request: Request): string {
  return `${EXPLORER_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}

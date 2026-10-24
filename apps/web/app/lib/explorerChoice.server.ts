// Le choix de l'Explorer du site reste (lot R1, comme l'appli) : les réglages sont dans l'adresse ; le dernier choix
// (segment, vue, tri, « Autour de… », distance, filtres) est aussi gardé dans un cookie de préférence, et une arrivée
// sur `/app/explorer` sans réglage le reprend. Jamais la position (`lat`, `lng`) : « Autour de moi » ne garde que le
// mode. Ni le texte de recherche, ni la page suivante. Le cookie s'efface à la déconnexion (comme celui du département).
// Tour 2 (relectures Opus et Codex) :
//   - le cookie appartient à un compte : il porte un identifiant opaque du compte (un haché, comme `pushRecipientId`) ;
//     une valeur d'un autre compte (session expirée puis autre connexion, sans déconnexion) est ignorée et effacée ;
//   - « Tous les formats » se restaure tel quel : `format=` (vide) est un choix, distinct de l'absence de `format` (qui
//     laisse les types des préférences s'appliquer) ;
//   - seulement des réglages relatifs : pas de dates absolues (`du`, `au`), qui seraient vite passées.
import { createHash } from "node:crypto";

import { getMe } from "./api.server";

export const EXPLORER_COOKIE = "orasso-explorer";
const MAX_AGE = 180 * 24 * 3600;

/** Les réglages gardés : ceux des sélecteurs et des filtres, relatifs, rien d'autre. */
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
/** Gardés même vides : le vide y est un choix (« Tous les formats »). */
const EMPTY_IS_A_CHOICE = new Set<string>(["format"]);
const VALUE = /^[A-Za-z0-9_-]{1,40}$/;
const OWNER = /^[0-9a-f]{16}$/;

/** Identifiant opaque du compte dans le cookie (16 caractères hexadécimaux, jamais l'identifiant lui-même). */
export function explorerOwner(userId: string): string {
  return createHash("sha256").update(`orasso-explorer:${userId}`).digest("hex").slice(0, 16);
}

/** Les réglages gardables d'une adresse (`null` s'il n'y en a aucun, ou pour les résultats d'une recherche). */
export function keptExplorerParams(params: URLSearchParams): string | null {
  if (params.get("segment") === "resultats") return null;
  const out = new URLSearchParams();
  for (const key of KEPT) {
    const value = params.get(key);
    if (value === null) continue;
    if (VALUE.test(value)) out.set(key, value);
    else if (value === "" && EMPTY_IS_A_CHOICE.has(key)) out.set(key, "");
  }
  const text = out.toString();
  return text || null;
}

/** La valeur du cookie : le compte, puis ses réglages. */
export function encodeExplorerChoice(owner: string, kept: string): string {
  return encodeURIComponent(`${owner}|${kept}`);
}

/**
 * Lecture prudente d'une valeur du cookie : `null` si elle est illisible ou d'avant le tour 2 (sans compte) ; seules les
 * clés et valeurs gardables reviennent.
 */
export function decodeExplorerChoice(raw: string): { owner: string; kept: string | null } | null {
  let text: string;
  try {
    text = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const at = text.indexOf("|");
  const owner = at < 0 ? "" : text.slice(0, at);
  if (!OWNER.test(owner)) return null;
  return { owner, kept: keptExplorerParams(new URLSearchParams(text.slice(at + 1))) };
}

function readRaw(request: Request): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === EXPLORER_COOKIE) return rest.join("=");
  }
  return null;
}

function secure(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https" ? "; Secure" : "";
}

export function clearExplorerCookie(request: Request): string {
  return `${EXPLORER_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}

/**
 * Ce que l'Explorer fait du choix gardé pour cette requête : y renvoyer (arrivée sans réglage), le remplacer (réglages
 * choisis), ou effacer le cookie d'un autre compte. Sans compte connecté : rien.
 */
export function explorerChoiceStep(
  request: Request,
  url: URL,
  userId: string | null,
): { redirectTo: string | null; setCookie: string | null } {
  const raw = readRaw(request);
  if (!userId) return { redirectTo: null, setCookie: null };
  const owner = explorerOwner(userId);
  const stored = raw ? decodeExplorerChoice(raw) : null;
  const foreign = raw !== null && raw !== "" && stored?.owner !== owner;
  const clear = foreign ? clearExplorerCookie(request) : null;
  if (url.search === "") {
    if (!foreign && stored?.kept) return { redirectTo: `/app/explorer?${stored.kept}`, setCookie: null };
    return { redirectTo: null, setCookie: clear };
  }
  const kept = keptExplorerParams(url.searchParams);
  if (!kept) return { redirectTo: null, setCookie: clear };
  const cookie = `${EXPLORER_COOKIE}=${encodeExplorerChoice(owner, kept)}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
  return { redirectTo: null, setCookie: cookie };
}

/** Le même, pour le compte de la session (une lecture de `/me`). */
export async function explorerChoice(request: Request, url: URL) {
  const me = await getMe(request);
  return explorerChoiceStep(request, url, me?.user.id ?? null);
}

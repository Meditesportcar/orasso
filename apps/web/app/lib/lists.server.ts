// Listes administrables (lot 33) lues par le site : `GET /settings/public`, gardées 60 s en mémoire du serveur (même
// durée que le cache de l'API). Indisponible → constantes de `packages/shared` (repli, jamais bloquant).
import { defaultPublicSettings, type PublicSettings } from "@orasso/shared";

import { api } from "./api.server";

let cache: { at: number; value: PublicSettings } | null = null;

export async function publicSettings(request: Request): Promise<PublicSettings> {
  const t = Date.now();
  if (cache && t - cache.at < 60_000) return cache.value;
  const res = await api<PublicSettings>(request, "/settings/public");
  if (!res.ok) return cache?.value ?? defaultPublicSettings;
  cache = { at: t, value: res.data };
  return res.data;
}

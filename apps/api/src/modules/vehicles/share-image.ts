// Affiche à partager d'un véhicule (lot 31, lot 50 ; lot M6 : maquettes 2.1 à 2.3) : story 9:16 ou post 4:5, trois
// styles, rendue par `share-story.ts`. Ce fichier rassemble ce que l'affiche montre (jamais la plaque : la fonction ne
// lit pas le champ ; la photo est celle que le serveur a floutée) et la garde une heure en cache.
import { type PlateRect, type ShareFormat, type ShareStyle, shareSheetLabels } from "@orasso/shared";

import { env } from "../../env";
import { storage } from "../../lib/storage";
import type { VehicleWithAll } from "./repo";
import { renderStory, type ShareStat } from "./share-story";

const fr = new Intl.NumberFormat("fr-FR");
const plainSpaces = (s: string) => s.replace(/[ {2}]/g, " ");

/** Ce que la story montre en plus de la fiche : style, zones à masquer (filet de sécurité de l'appli). */
export type ShareExtras = { style?: ShareStyle; masks?: PlateRect[] };

/** « Toyota · A90 · Blanche » : marque, génération, couleur (sans les morceaux absents ou « Autre »). */
export function storyLine(v: Pick<VehicleWithAll, "make" | "generation" | "color">): string {
  return [
    v.make.isOther ? null : v.make.name,
    v.generation && !v.generation.isOther ? v.generation.name : null,
    v.color?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Nom de l'affiche : le modèle (la marque et la génération sont sur la ligne du dessous). */
export function storyName(v: Pick<VehicleWithAll, "model" | "make">): string {
  if (!v.model.isOther) return v.model.name;
  return v.make.isOther ? "Véhicule" : v.make.name;
}

/** Puissance, poids, année : lisibles par tous (plus de grade, retour 17). */
export function storyStats(v: Pick<VehicleWithAll, "powerHp" | "weightKg" | "year">): ShareStat[] {
  return [
    v.powerHp ? { label: "Puissance", value: String(v.powerHp), unit: "ch" } : null,
    v.weightKg ? { label: "Poids", value: plainSpaces(fr.format(v.weightKg)), unit: "kg" } : null,
    v.year ? { label: "Année", value: String(v.year) } : null,
  ].filter((s): s is ShareStat => s !== null);
}

/** « Retrouve-la » (voiture, moto) ou « Retrouve-le » (camion). */
const findIt = (v: Pick<VehicleWithAll, "vehicleType">) =>
  v.vehicleType === "truck" ? shareSheetLabels.findIt.replace("-la", "-le") : shareSheetLabels.findIt;

/** Rend l'affiche. `pseudo` : le propriétaire. */
export async function renderShareImage(
  v: VehicleWithAll,
  pseudo: string,
  format: ShareFormat,
  extras: ShareExtras = {},
): Promise<Buffer> {
  const cover = v.photos[0];
  const photo = cover ? await storage.get(cover.storageKey) : null;
  const site = new URL(env.PUBLIC_URL);
  return renderStory({
    format,
    style: extras.style ?? "night",
    photo,
    name: storyName(v),
    line: storyLine(v),
    tags: v.categories
      .map((c) => c.category)
      .filter((c) => c.active)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.label)
      .slice(0, 3),
    stats: storyStats(v),
    certified: Boolean(v.certifiedAt),
    pseudo,
    findIt: findIt(v),
    site: site.host,
    qrUrl: `${site.origin}/v/${v.id}`,
    masks: extras.masks,
  });
}

// --- Cache (une heure par véhicule, format et style) ----------------------------------------------------------------
const TTL_MS = 3_600_000;
const MAX_ENTRIES = 60;
const cache = new Map<string, { at: number; data: Buffer }>();

export function shareImageCacheKey(v: VehicleWithAll, format: ShareFormat, extras: ShareExtras = {}): string {
  return [
    v.id,
    format,
    extras.style ?? "night",
    (extras.masks ?? []).map((m) => `${m.x},${m.y},${m.w},${m.h},${m.angle ?? 0}`).join(";"),
    v.updatedAt.getTime(),
    v.photos.map((p) => p.id).join(","),
    v.categories.map((c) => c.categoryId).join(","),
    v.certifiedAt ? "c" : "",
  ].join("|");
}

export async function cachedShareImage(
  v: VehicleWithAll,
  pseudo: string,
  format: ShareFormat,
  at: number = Date.now(),
  extras: ShareExtras = {},
): Promise<Buffer> {
  const key = `${shareImageCacheKey(v, format, extras)}|${pseudo}`;
  const hit = cache.get(key);
  if (hit && at - hit.at < TTL_MS) return hit.data;
  const data = await renderShareImage(v, pseudo, format, extras);
  for (const [k, e] of cache) if (at - e.at >= TTL_MS) cache.delete(k);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at, data });
  return data;
}

export const clearShareImageCache = () => cache.clear();

// Affiche à partager d'un véhicule (lot 31, lot 50 ; lot M6 : maquettes 2.1 à 2.3) : story 9:16 ou post 4:5, trois
// styles, rendue par `share-story.ts`. Ce fichier rassemble ce que l'affiche montre (jamais la plaque : la fonction ne
// lit pas le champ ; la photo est celle que le serveur a floutée) et la garde une heure en cache.
import { type PlateRect, type ShareFormat, type ShareStyle, type ShareZone, shareSheetLabels } from "@orasso/shared";

import { env } from "../../env";
import { AppError } from "../../lib/errors";
import { storage } from "../../lib/storage";
import type { VehicleWithAll } from "./repo";
import { renderStory, type ShareStat, type StoryInput, storyZones } from "./share-story";

const fr = new Intl.NumberFormat("fr-FR");
// Espace insécable (U+00A0) et fine insécable (U+202F) du format fr-FR : remplacées par une espace simple.
const plainSpaces = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

/** Ce que la story montre en plus de la fiche : style, zones à masquer (filet de sécurité de l'appli). */
export type ShareExtras = { style?: ShareStyle; masks?: PlateRect[] };

/** « Toyota · A90 · Blanche » : marque, génération, couleur (sans les morceaux absents ou « Autre »). */
export function storyLine(
  v: Pick<VehicleWithAll, "make" | "generation" | "color"> & Pick<VehicleWithAll, "proposedMake">,
): string {
  return [
    v.make.isOther ? (v.proposedMake ?? null) : v.make.name,
    v.generation && !v.generation.isOther ? v.generation.name : null,
    v.color?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Nom de l'affiche : le modèle (la marque et la génération sont sur la ligne du dessous). Lot R4a : un modèle tapé
 * (« 207 CC ») y figure aussi.
 */
export function storyName(
  v: Pick<VehicleWithAll, "model" | "make"> & Pick<VehicleWithAll, "proposedMake" | "proposedModel">,
): string {
  if (!v.model.isOther) return v.model.name;
  if (v.proposedModel) return v.proposedModel;
  return v.make.isOther ? (v.proposedMake ?? "Véhicule") : v.make.name;
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

// --- File de rendu (lot M6, tour 2) ----------------------------------------------------------------------------------
// Un rendu d'affiche est lourd (image, QR, SVG → PNG) : au plus MAX_RENDERS en même temps, les suivants attendent leur
// tour ; au-delà de MAX_WAITING en attente, `429 rate_limited` plutôt que d'empiler sans fin.
export const MAX_RENDERS = 2;
export const MAX_WAITING = 20;

/** File simple : au plus `limit` tâches en cours, `maxWaiting` en attente, `429` au-delà. */
export function createRenderQueue(limit = MAX_RENDERS, maxWaiting = MAX_WAITING) {
  let running = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    const start = waiting.shift();
    if (start) start();
  };
  return {
    get running() {
      return running;
    },
    get waiting() {
      return waiting.length;
    },
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (running >= limit) {
        if (waiting.length >= maxWaiting) {
          throw new AppError(429, "rate_limited", "Trop d'affiches en préparation, réessaie dans un instant.", {
            retryAfter: 5,
          });
        }
        // Le créneau est transmis tel quel par `next` (pas de `running--` entre-temps) : jamais plus de `limit`.
        await new Promise<void>((resolve) => waiting.push(resolve));
      } else {
        running++;
      }
      try {
        return await task();
      } finally {
        if (waiting.length) next();
        else running--;
      }
    },
  };
}

const renderQueue = createRenderQueue();

/** Rend l'affiche (dans la file : deux rendus à la fois au plus). `pseudo` : le propriétaire. */
export function renderShareImage(
  v: VehicleWithAll,
  pseudo: string,
  format: ShareFormat,
  extras: ShareExtras = {},
): Promise<Buffer> {
  return renderQueue.run(() => renderShareImageNow(v, pseudo, format, extras));
}

async function renderShareImageNow(
  v: VehicleWithAll,
  pseudo: string,
  format: ShareFormat,
  extras: ShareExtras = {},
): Promise<Buffer> {
  const cover = v.photos[0];
  const photo = cover ? await storage.get(cover.storageKey) : null;
  return renderStory(storyInput(v, pseudo, format, extras, photo));
}

/** Lot R3a, tour 2 : les zones des textes d'Orasso sur l'affiche de ce véhicule (sans rendre la photo). */
export function shareZones(
  v: VehicleWithAll,
  pseudo: string,
  format: ShareFormat,
  style: ShareStyle,
): Promise<ShareZone[]> {
  return renderQueue.run(() => storyZones(storyInput(v, pseudo, format, { style }, null)));
}

/** Ce que montre l'affiche d'un véhicule (le rendu et les zones partent de la même mise en page). */
function storyInput(
  v: VehicleWithAll,
  pseudo: string,
  format: ShareFormat,
  extras: ShareExtras,
  photo: Buffer | null,
): StoryInput {
  const site = new URL(env.PUBLIC_URL);
  return {
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
  };
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

// Cibles « véhicule » et « photo » (photo d'un véhicule). Un véhicule se traite par la sanction de son propriétaire ;
// une photo peut être supprimée par le super administrateur. Jamais la plaque.
import { eq } from "drizzle-orm";

import { db } from "../../../db/client";
import { vehiclePhotos } from "../../../db/schema";
import { notFound } from "../../../lib/errors";
import { storage } from "../../../lib/storage";
import { socialProfile } from "../../social/profile";
import { vehiclesRepo } from "../../vehicles/repo";
import { vehicleLabel } from "../../vehicles/serializers";
import { goneView, type TargetRules, UUID_RE } from "./types";

export const vehicleTarget: TargetRules = {
  type: "vehicle",
  async resolve(v, targetId) {
    if (!UUID_RE.test(targetId)) throw notFound("Véhicule introuvable");
    const seen = await socialProfile.vehicleOf(v, targetId);
    return { ownerId: seen.owner.userId };
  },
  async view(report) {
    const row = UUID_RE.test(report.targetId) ? await vehiclesRepo.findFullById(report.targetId) : undefined;
    if (!row) return goneView("Véhicule supprimé");
    return {
      title: vehicleLabel(row),
      text: row.description,
      imageUrl: storage.url(row.photos[0]?.storageKey ?? null),
      link: `/v/${row.id}`,
      gone: false,
      removed: false,
    };
  },
};

async function photoRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db.select().from(vehiclePhotos).where(eq(vehiclePhotos.id, id));
  return row;
}

export const photoTarget: TargetRules = {
  type: "photo",
  async resolve(v, targetId) {
    const photo = await photoRow(targetId);
    if (!photo) throw notFound("Photo introuvable");
    // La photo n'est visible que si la fiche complète l'est (compte public ou ami).
    const seen = await socialProfile.vehicleOf(v, photo.vehicleId);
    if (!seen.detailed && seen.owner.userId !== v.user.id) throw notFound("Photo introuvable");
    return { ownerId: seen.owner.userId };
  },
  async view(report) {
    const photo = await photoRow(report.targetId);
    if (!photo) return { ...goneView("Photo"), removed: report.status === "resolved_action" };
    const row = await vehiclesRepo.findFullById(photo.vehicleId);
    return {
      title: row ? `Photo de ${vehicleLabel(row)}` : "Photo",
      text: null,
      imageUrl: storage.url(photo.storageKey),
      link: row ? `/v/${row.id}` : null,
      gone: false,
      removed: false,
    };
  },
  async remove(tx, _v, report) {
    const deleted = await tx
      .delete(vehiclePhotos)
      .where(eq(vehiclePhotos.id, report.targetId))
      .returning({ key: vehiclePhotos.storageKey });
    return deleted.map((d) => d.key);
  },
};

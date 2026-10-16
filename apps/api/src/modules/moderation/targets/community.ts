// Cibles « crew » (chef ; retrait = crew dissous par la modération), « fiche pro » et « prestataire » (titulaire ; pas
// de retrait : on sanctionne le titulaire, sa fiche disparaît alors des listes et des pages).
import { eq } from "drizzle-orm";

import { db } from "../../../db/client";
import { crews, proProfiles, providerProfiles } from "../../../db/schema";
import { notFound } from "../../../lib/errors";
import { storage } from "../../../lib/storage";
import { crewsService } from "../../crews/service";
import { prosService } from "../../pros/service";
import { providersService } from "../../providers/service";
import { goneView, type TargetRules, UUID_RE } from "./types";

async function crewRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db.select().from(crews).where(eq(crews.id, id));
  return row;
}

export const crewTarget: TargetRules = {
  type: "crew",
  async resolve(v, targetId) {
    const crew = await crewRow(targetId);
    if (!crew || crew.deletedAt) throw notFound("Crew introuvable");
    await crewsService.viewById(v, crew.id);
    return { ownerId: crew.createdBy };
  },
  async view(report) {
    const crew = await crewRow(report.targetId);
    if (!crew) return goneView("Crew supprimé");
    return {
      title: crew.name,
      text: crew.description,
      imageUrl: storage.url(crew.logoKey),
      link: `/c/${crew.slug}`,
      gone: false,
      removed: Boolean(crew.deletedAt),
    };
  },
  async remove(tx, _v, report, after) {
    const [crew] = await tx.select().from(crews).where(eq(crews.id, report.targetId)).for("update");
    if (!crew || crew.deletedAt) return [];
    return crewsService.archiveInTx(tx, after, crew, "moderation");
  },
};

async function proRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db.select().from(proProfiles).where(eq(proProfiles.id, id));
  return row;
}

export const proTarget: TargetRules = {
  type: "pro",
  async resolve(v, targetId) {
    const pro = await proRow(targetId);
    if (!pro || pro.deletedAt) throw notFound("Fiche pro introuvable");
    await prosService.getPublic(pro.slug, v);
    return { ownerId: pro.ownerUserId };
  },
  async view(report) {
    const pro = await proRow(report.targetId);
    if (!pro || pro.deletedAt) return goneView("Fiche pro supprimée");
    return {
      title: pro.name,
      text: pro.description,
      imageUrl: storage.url(pro.logoKey),
      link: `/p/${pro.slug}`,
      gone: false,
      removed: false,
    };
  },
};

async function providerRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db.select().from(providerProfiles).where(eq(providerProfiles.id, id));
  return row;
}

export const providerTarget: TargetRules = {
  type: "provider",
  async resolve(_v, targetId) {
    const p = await providerRow(targetId);
    if (!p || p.deletedAt) throw notFound("Prestataire introuvable");
    await providersService.getPublic(p.id);
    return { ownerId: p.userId };
  },
  async view(report) {
    const p = await providerRow(report.targetId);
    if (!p || p.deletedAt) return goneView("Prestataire supprimé");
    return { title: p.name, text: p.description, imageUrl: null, link: null, gone: false, removed: false };
  },
};

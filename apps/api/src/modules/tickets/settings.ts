// Réglages de la plateforme modifiables par le super admin (interrupteurs de la billetterie, lot 14).
import {
  type PlatformSettingKey,
  type PlatformSettings,
  platformSettingDefaults,
  platformSettingKeys,
  presentationForced,
} from "@orasso/shared";
import { inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { adminAuditLog, platformSettings } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { stripePlatform } from "../../lib/stripe";

export const settingsService = {
  /** Valeur d'un interrupteur (défaut du code tant que personne ne l'a modifié). */
  async get(key: PlatformSettingKey): Promise<boolean> {
    const row = await db.query.platformSettings.findFirst({ where: (t, { eq }) => eq(t.key, key) });
    return typeof row?.value === "boolean" ? row.value : platformSettingDefaults[key];
  },

  async all(): Promise<Record<PlatformSettingKey, boolean>> {
    const rows = await db.query.platformSettings.findMany({
      where: inArray(platformSettings.key, [...platformSettingKeys]),
    });
    const out = { ...platformSettingDefaults };
    for (const r of rows) {
      if (typeof r.value === "boolean" && (platformSettingKeys as readonly string[]).includes(r.key)) {
        out[r.key as PlatformSettingKey] = r.value;
      }
    }
    return out;
  },

  /** `GET /admin/settings` */
  async view(v: Viewer): Promise<PlatformSettings> {
    await requirePlatformRole(v, "super_admin");
    return {
      ...(await this.all()),
      presentationForced: presentationForced(now()),
      stripe: stripePlatform(),
    };
  },

  /** `PUT /admin/settings/:key` : tracé dans le journal d'administration. */
  async set(v: Viewer, key: PlatformSettingKey, value: boolean, ip?: string | null): Promise<PlatformSettings> {
    await requirePlatformRole(v, "super_admin");
    // Le mode présentation (aucun encaissement réel) ne se coupe pas avant l'ouverture des paiements.
    if (key === "ticketing.presentation_mode" && !value && presentationForced(now())) {
      throw conflict("conflict", "Le mode présentation est imposé jusqu'au 21 juin 2027.");
    }
    await db
      .insert(platformSettings)
      .values({ key, value, updatedBy: v.user.id })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: v.user.id, updatedAt: now() } });
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "settings.update",
      targetType: "setting",
      targetId: key,
      reason: String(value),
      ip: ip ?? null,
    });
    return this.view(v);
  },
};

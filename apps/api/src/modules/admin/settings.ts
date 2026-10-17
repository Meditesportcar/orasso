// Réglages de la plateforme (lot 33, ARCHITECTURE-SUITE § 16) : interrupteurs, barème des points et seuils des grades,
// listes administrables. Validation par clé (schéma partagé), écriture tracée (`settings.update`), cache des services
// invalidé aussitôt (`lib/settings.ts`). Les interrupteurs de la billetterie restent ceux du lot 14 (même route).
import {
  type AdminSettingEntry,
  type AdminSettingKey,
  adminSettingDefaults,
  adminSettingKeys,
  adminSettingSchemas,
  type PublicSettings,
} from "@orasso/shared";

import { db } from "../../db/client";
import { platformSettings } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";
import { settingsStore } from "../../lib/settings";
import { withTx } from "../../lib/tx";
import { parse } from "../../lib/validate";
import { audit } from "./audit";

export const isAdminSettingKey = (key: string): key is AdminSettingKey =>
  (adminSettingKeys as readonly string[]).includes(key);

export const adminSettingsService = {
  /** Les réglages du lot 33, avec leur valeur par défaut et la dernière modification. */
  async entries(v: Viewer): Promise<AdminSettingEntry[]> {
    await requirePlatformRole(v, "super_admin");
    settingsStore.invalidate();
    const { values, rows } = await settingsStore.all();
    return adminSettingKeys.map((key) => {
      const r = rows.get(key);
      return {
        key,
        value: values[key],
        defaultValue: adminSettingDefaults[key],
        updatedAt: r?.updatedAt.toISOString() ?? null,
        updatedBy: r?.updatedBy ?? null,
      };
    });
  },

  /** `PUT /admin/settings/:key {value}` pour une clé du lot 33 : 400 si la valeur ne passe pas son schéma. */
  async set(v: Viewer, key: AdminSettingKey, raw: unknown) {
    await requirePlatformRole(v, "super_admin");
    const value = parse(adminSettingSchemas[key] as (typeof adminSettingSchemas)[AdminSettingKey], raw);
    await withTx(async (tx) => {
      await tx
        .insert(platformSettings)
        .values({ key, value, updatedBy: v.user.id })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: v.user.id, updatedAt: now() } });
      await audit(tx, v, {
        action: "settings.update",
        targetType: "setting",
        targetId: key,
        reason: JSON.stringify(value).slice(0, 500),
      });
    });
    settingsStore.invalidate();
    return this.entries(v);
  },

  /** `GET /settings/public` (sans connexion) : listes proposées au site et à l'appli, interrupteurs utiles. */
  async publicSettings(): Promise<PublicSettings> {
    const { values } = await settingsStore.all();
    return {
      refusalReasons: values["lists.refusal_reasons"],
      vendorTypes: values["lists.vendor_types"],
      proActivities: values["lists.pro_activities"],
      signupEnabled: values["signup.enabled"],
      providersEnabled: values["providers.enabled"],
      malusPoints: values["points.malus"],
    };
  },
};

/** Lecture directe (tests, seed) sans passer par le cache. */
export async function settingRow(key: string) {
  return db.query.platformSettings.findFirst({ where: (t, { eq }) => eq(t.key, key) });
}

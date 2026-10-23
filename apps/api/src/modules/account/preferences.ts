// « Tes préférences » (lot M6, maquette 8.3) : `GET` et `PATCH /me/preferences`. Rien de nouveau à ranger pour les
// départements, la distance et les notifications : ce sont les réglages du compte (`departments`, `radius_km`,
// `muted_types`) ; s'y ajoutent les types d'événements préférés et la date de la première visite de l'étape (la règle
// « une fois, après le premier véhicule » de l'appli). L'Explorer (lot M4) lit ces préférences pour s'ouvrir filtré.
import {
  type EventFormat,
  eventFormats,
  mutableTypesByFamily,
  type NotificationFamily,
  type NotificationPrefs,
  notificationTypes,
  type PreferenceNotification,
  type Preferences,
  type PreferencesUpdate,
  preferenceNotifications,
  preferenceNotificationTypes,
} from "@orasso/shared";

import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { profilesRepo } from "../profiles/repo";

type ProfileRow = Viewer["profile"];

const known = new Set<string>(eventFormats);

const familyOf = (type: string): NotificationFamily | undefined =>
  (notificationTypes as Record<string, NotificationFamily>)[type];

export function preferencesOf(p: ProfileRow): Preferences {
  const muted = new Set(p.mutedTypes);
  // Un interrupteur dit la vérité : allumé seulement si la famille est active ET le type n'est pas coupé.
  const notifications = Object.fromEntries(
    preferenceNotifications.map((k) => {
      const type = preferenceNotificationTypes[k];
      return [
        k,
        (p.notificationPrefs as Record<string, boolean> | null)?.[familyOf(type) ?? ""] !== false && !muted.has(type),
      ];
    }),
  ) as Record<PreferenceNotification, boolean>;
  return {
    eventFormats: p.preferredFormats.filter((f): f is EventFormat => known.has(f)),
    // La vraie valeur du compte (jusqu'à 300 km) : l'écran la montre telle quelle, le curseur s'arrête à 200.
    radiusKm: p.radiusKm,
    departments: p.departments,
    notifications,
    seenAt: p.preferencesSeenAt ? p.preferencesSeenAt.toISOString() : null,
  };
}

export const preferencesService = {
  get(v: Viewer): Preferences {
    return preferencesOf(v.profile);
  },

  /** Enregistre ce qui est envoyé et marque l'étape comme vue (un envoi vide = « Passer »). */
  async update(v: Viewer, input: PreferencesUpdate): Promise<Preferences> {
    const muted = new Set(v.profile.mutedTypes);
    const prefs: Record<string, boolean> = { ...v.profile.notificationPrefs };
    let prefsChanged = false;
    for (const key of preferenceNotifications) {
      const on = input.notifications?.[key];
      if (on === undefined) continue;
      const type = preferenceNotificationTypes[key];
      if (!on) {
        muted.add(type);
        continue;
      }
      muted.delete(type);
      // Réactiver un type dont la famille est coupée : on rallume la famille et on coupe les autres types réglables
      // de cette famille, pour ne réactiver que celui-ci.
      const family = familyOf(type);
      if (family && prefs[family] === false) {
        prefs[family] = true;
        prefsChanged = true;
        for (const other of mutableTypesByFamily()[family] ?? []) if (other !== type) muted.add(other);
      }
    }
    const row = await profilesRepo.update(v.user.id, {
      ...(input.eventFormats ? { preferredFormats: [...new Set(input.eventFormats)] } : {}),
      ...(input.radiusKm !== undefined ? { radiusKm: input.radiusKm } : {}),
      ...(input.departments ? { departments: [...new Set(input.departments)] } : {}),
      ...(input.notifications ? { mutedTypes: [...muted] } : {}),
      ...(prefsChanged ? { notificationPrefs: prefs as NotificationPrefs } : {}),
      preferencesSeenAt: v.profile.preferencesSeenAt ?? now(),
    });
    if (!row) throw notFound();
    return preferencesOf(row);
  },
};

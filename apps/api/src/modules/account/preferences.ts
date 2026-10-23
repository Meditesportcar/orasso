// « Tes préférences » (lot M6, maquette 8.3) : `GET` et `PATCH /me/preferences`. Rien de nouveau à ranger pour les
// départements, la distance et les notifications : ce sont les réglages du compte (`departments`, `radius_km`,
// `muted_types`) ; s'y ajoutent les types d'événements préférés et la date de la première visite de l'étape (la règle
// « une fois, après le premier véhicule » de l'appli). L'Explorer (lot M4) lit ces préférences pour s'ouvrir filtré.
import {
  clampPreferenceRadius,
  type EventFormat,
  eventFormats,
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

export function preferencesOf(p: ProfileRow): Preferences {
  const muted = new Set(p.mutedTypes);
  const notifications = Object.fromEntries(
    preferenceNotifications.map((k) => [k, !muted.has(preferenceNotificationTypes[k])]),
  ) as Record<PreferenceNotification, boolean>;
  return {
    eventFormats: p.preferredFormats.filter((f): f is EventFormat => known.has(f)),
    radiusKm: clampPreferenceRadius(p.radiusKm),
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
    for (const key of preferenceNotifications) {
      const on = input.notifications?.[key];
      if (on === undefined) continue;
      if (on) muted.delete(preferenceNotificationTypes[key]);
      else muted.add(preferenceNotificationTypes[key]);
    }
    const row = await profilesRepo.update(v.user.id, {
      ...(input.eventFormats ? { preferredFormats: [...new Set(input.eventFormats)] } : {}),
      ...(input.radiusKm !== undefined ? { radiusKm: input.radiusKm } : {}),
      ...(input.departments ? { departments: [...new Set(input.departments)] } : {}),
      ...(input.notifications ? { mutedTypes: [...muted] } : {}),
      preferencesSeenAt: v.profile.preferencesSeenAt ?? now(),
    });
    if (!row) throw notFound();
    return preferencesOf(row);
  },
};

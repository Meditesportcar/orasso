// « Tes préférences » (lot M6, maquette 8.3) : `GET` et `PATCH /me/preferences`. Rien de nouveau à ranger pour les
// départements, la distance, les centres d'intérêt et l'interrupteur : ce sont les réglages du compte (`departments`,
// `radius_km` nullable = partout en France, `profile_interests`, `muted_types` pour `event_nearby_interest`) ; s'y
// ajoutent les types d'événements préférés et la date de la première visite de l'étape (la règle « une fois, après le
// premier véhicule » de l'appli). L'Explorer (lot M4) lit ces préférences pour s'ouvrir filtré, sans s'y enfermer.
import {
  type EventFormat,
  eventFormats,
  mutableTypesByFamily,
  type NotificationFamily,
  type NotificationPrefs,
  newEventsNotificationType,
  notificationTypes,
  type Preferences,
  type PreferencesUpdate,
} from "@orasso/shared";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { categories } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { profilesRepo } from "../profiles/repo";

type ProfileRow = Viewer["profile"];

const known = new Set<string>(eventFormats);

const familyOf = (type: string): NotificationFamily | undefined =>
  (notificationTypes as Record<string, NotificationFamily>)[type];

export function preferencesOf(p: ProfileRow, interests: string[]): Preferences {
  // L'interrupteur dit la vérité : allumé seulement si la famille est active ET le type n'est pas coupé.
  const newEvents =
    (p.notificationPrefs as Record<string, boolean> | null)?.[familyOf(newEventsNotificationType) ?? ""] !== false &&
    !p.mutedTypes.includes(newEventsNotificationType);
  return {
    eventFormats: p.preferredFormats.filter((f): f is EventFormat => known.has(f)),
    radiusKm: p.radiusKm,
    departments: p.departments,
    interests,
    newEvents,
    seenAt: p.preferencesSeenAt ? p.preferencesSeenAt.toISOString() : null,
  };
}

export const preferencesService = {
  async get(v: Viewer): Promise<Preferences> {
    return preferencesOf(v.profile, await profilesRepo.interests(v.user.id));
  },

  /** Enregistre ce qui est envoyé et marque l'étape comme vue (un envoi vide = « Passer »). */
  async update(v: Viewer, input: PreferencesUpdate): Promise<Preferences> {
    if (input.interests?.length) {
      const found = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(inArray(categories.id, input.interests), eq(categories.active, true)));
      if (found.length !== new Set(input.interests).size) throw validation("Centre d'intérêt inconnu");
    }
    const muted = new Set(v.profile.mutedTypes);
    const prefs: Record<string, boolean> = { ...v.profile.notificationPrefs };
    let prefsChanged = false;
    if (input.newEvents !== undefined) {
      const type = newEventsNotificationType;
      if (!input.newEvents) muted.add(type);
      else {
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
    }
    const { row, interests } = await withTx(async (tx) => {
      const updated = await profilesRepo.update(
        v.user.id,
        {
          ...(input.eventFormats ? { preferredFormats: [...new Set(input.eventFormats)] } : {}),
          ...(input.radiusKm !== undefined ? { radiusKm: input.radiusKm } : {}),
          ...(input.departments ? { departments: [...new Set(input.departments)] } : {}),
          ...(input.newEvents !== undefined ? { mutedTypes: [...muted] } : {}),
          ...(prefsChanged ? { notificationPrefs: prefs as NotificationPrefs } : {}),
          preferencesSeenAt: v.profile.preferencesSeenAt ?? now(),
        },
        tx,
      );
      if (input.interests) await profilesRepo.setInterests(v.user.id, [...new Set(input.interests)], tx);
      return { row: updated, interests: await profilesRepo.interests(v.user.id, tx) };
    });
    if (!row) throw notFound();
    return preferencesOf(row, interests);
  },
};

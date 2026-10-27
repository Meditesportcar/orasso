import { type NotificationFamily, type NotificationType, notificationTypes } from "../enums";
import { retiredNotificationTypes } from "../notifications/social";

/** Familles jamais coupées (relances du staff, sécurité du compte). */
export const UNMUTABLE_FAMILIES: readonly NotificationFamily[] = ["staff", "account"];

/**
 * Préférences par famille et par type (ARCHITECTURE-SUITE § 0.2) : livrée si la famille est activée **et** le type
 * n'est pas coupé ; `staff` et `account` passent toujours. Un type inconnu suit sa famille si on la connaît.
 */
export function shouldDeliver(
  prefs: Partial<Record<string, boolean>> | null | undefined,
  mutedTypes: readonly string[] | null | undefined,
  type: string,
): boolean {
  const family = (notificationTypes as Record<string, NotificationFamily>)[type];
  if (family && UNMUTABLE_FAMILIES.includes(family)) return true;
  if (family && prefs?.[family] === false) return false;
  return !(mutedTypes ?? []).includes(type);
}

/**
 * Types qu'on peut couper un par un, groupés par famille (écrans Moi du site et de l'appli). Lot R6b, tour 2 : sans les
 * types retirés (anciennes demandes d'ami), qui ne partent plus.
 */
export function mutableTypesByFamily(): Partial<Record<NotificationFamily, NotificationType[]>> {
  const out: Partial<Record<NotificationFamily, NotificationType[]>> = {};
  for (const [type, family] of Object.entries(notificationTypes) as [NotificationType, NotificationFamily][]) {
    if (UNMUTABLE_FAMILIES.includes(family) || retiredNotificationTypes.includes(type)) continue;
    const list = out[family] ?? [];
    list.push(type);
    out[family] = list;
  }
  return out;
}

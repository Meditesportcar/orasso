// Notifier une structure (lot R9d) : une ligne `notify` **par responsable** (propriétaire et co-organisateurs actifs), marquée
// de la `structure_id`. La ligne vit dans l'Activité de la structure et jamais dans la cloche personnelle (T26) ; la livraison
// (push préfixé du nom de la structure, e-mail, préférences, mutes, heures calmes) reste celle de chaque personne, par `notify`.
import type { NotificationType } from "@orasso/shared";
import { eq } from "drizzle-orm";

import { structures } from "../../db/schema";
import { realtime } from "../../lib/realtime";
import { structureManagers } from "../../lib/structureManagers";
import type { Executor } from "../../lib/tx";
import { type NotifyInput, notificationsService } from "./service";

export type NotifyStructureOptions = {
  /** Personnes à ne pas prévenir (celle qui vient d'agir au nom de la structure, celles qui ne lisent pas le contenu…). */
  exclude?: Iterable<string>;
};

/**
 * Rend les personnes prévenues. `input.groupKey` devient `s:<structureId>:<groupKey>` : un regroupement de structure ne se mêle
 * jamais à une ligne personnelle du même compte. `input.after` (le `after` de la transaction de l'appelant) : un seul
 * `inbox.changed` par personne, après la validation ; sans lui, il part tout de suite.
 */
export async function notifyStructure(
  ex: Executor,
  structureId: string,
  type: NotificationType,
  input: NotifyInput,
  opts: NotifyStructureOptions = {},
): Promise<string[]> {
  const [structure] = await ex
    .select({ name: structures.name, slug: structures.slug })
    .from(structures)
    .where(eq(structures.id, structureId));
  if (!structure) return [];
  const skip = new Set<string>(opts.exclude ?? []);
  if (input.actor) skip.add(input.actor.userId);
  const recipients = (await structureManagers(ex, structureId)).filter((id) => !skip.has(id));
  for (const userId of recipients) {
    await notificationsService.notify(ex, userId, type, {
      ...input,
      // `notify` publie lui-même `inbox.changed` quand une occurrence rejoint une ligne déjà livrée : un seul signal par
      // personne, celui de ce module (ci-dessous), donc le sien est ignoré.
      after: () => undefined,
      structureId,
      data: { ...input.data, structureId, structureName: structure.name, structureSlug: structure.slug },
      groupKey: input.groupKey ? `s:${structureId}:${input.groupKey}` : undefined,
    });
  }
  const publish = () => {
    for (const userId of recipients) realtime.publish(`user:${userId}`, "inbox.changed", {});
    notificationsService.kick();
  };
  if (input.after) input.after(publish);
  else publish();
  return recipients;
}

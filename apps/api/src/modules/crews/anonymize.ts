// Compte supprimé (anonymisé) : ce que les crews gardent de lui disparaît (lot 19). Appelé une fois par
// `accountService.anonymize`, dans sa transaction, **avant** l'anonymisation de la messagerie ; rend les clés des
// fichiers à effacer après la validation (logos des crews dissous).
import { and, eq, inArray, sql } from "drizzle-orm";

import { crewMembers, crews, messages, notifications } from "../../db/schema";
import type { Tx } from "../../lib/tx";
import { crewsService } from "./service";

/** Types de notification des crews qui citent une personne (`data.actor`). */
const CREW_TYPES = [
  "crew_request",
  "crew_invitation",
  "crew_request_accepted",
  "crew_member_joined",
  "crew_registration_to_confirm",
  "crew_member_confirmed",
  "crew_member_declined",
  "crew_member_expired",
];

/**
 * - crews dont il est le chef : dissous (S15 : pas de transfert), logo effacé, membres prévenus, discussion lisible ;
 * - ses appartenances, demandes et invitations : supprimées ; les crews qu'il quitte sont recomptés et leur discussion
 *   resynchronisée (ses messages sont effacés par l'anonymisation de la messagerie, appelée ensuite) ;
 * - les messages d'information qui citent son pseudo (« X a rejoint le crew ») : pseudo retiré ;
 * - les notifications des autres qui le citent (demande, invitation, venue confirmée…) : supprimées.
 * Ses candidatures en crew restent régies par l'anonymisation des candidatures (désistées si à venir).
 */
export async function anonymizeCrewsForDeletedAccount(tx: Tx, userId: string): Promise<string[]> {
  const keys: string[] = [];
  const afterCallbacks: (() => unknown)[] = [];
  const after = (cb: () => unknown) => afterCallbacks.push(cb);
  const led = await tx
    .select()
    .from(crews)
    .where(and(eq(crews.createdBy, userId), sql`${crews.deletedAt} is null`))
    .for("update");
  for (const crew of led) keys.push(...(await crewsService.archiveInTx(tx, after, crew, "account_deleted")));
  const memberships = await tx
    .delete(crewMembers)
    .where(eq(crewMembers.userId, userId))
    .returning({ crewId: crewMembers.crewId, status: crewMembers.status });
  const touched = [...new Set(memberships.filter((m) => m.status === "active").map((m) => m.crewId))];
  if (touched.length) {
    const rows = await tx.select().from(crews).where(inArray(crews.id, touched));
    for (const crew of rows) {
      await crewsService.recount(tx, crew.id);
      await crewsService.syncConversation(tx, crew);
    }
  }
  // Les invitations qu'il a envoyées en tant que chef ont disparu avec la dissolution ; `invited_by` des autres lignes
  // (invitations acceptées) ne doit plus le désigner.
  await tx.update(crewMembers).set({ invitedBy: null }).where(eq(crewMembers.invitedBy, userId));
  await tx.execute(sql`
    update ${messages} m
    set body = jsonb_build_object('code', m.body::jsonb ->> 'code', 'userId', null, 'pseudo', null)::text
    where m.kind = 'system'
      and m.conversation_id in (select c.id from conversations c where c.kind = 'crew')
      and m.body::jsonb ->> 'userId' = ${userId}`);
  await tx
    .delete(notifications)
    .where(
      and(inArray(notifications.type, CREW_TYPES), sql`${notifications.data} -> 'actor' ->> 'userId' = ${userId}`),
    );
  // Diffusions (dissolution) : rien à faire de plus dans la transaction de l'anonymisation ; les appareils des membres
  // rechargent au prochain accès. Les fichiers sont effacés par l'appelant après la validation.
  void afterCallbacks;
  return keys;
}

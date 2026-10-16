// Registre des règles d'accès par sorte de conversation (ARCHITECTURE-SUITE § 3.2). Les lots 19 (`crew`) et 20
// (`structure_staff`, `event_staff`) ajoutent leur fichier `access/<kind>.ts` et **une ligne** ci-dessous.
import type { ConversationKind } from "@orasso/shared";

import { crewRules } from "./crew";
import { directRules } from "./direct";
import { eventStaffRules } from "./event_staff";
import { organizerRules } from "./organizer";
import { structureStaffRules } from "./structure_staff";
import type { KindRules } from "./types";

const registry = new Map<ConversationKind, KindRules>();

export function registerConversationKind(rules: KindRules) {
  registry.set(rules.kind, rules);
}

registerConversationKind(directRules);
registerConversationKind(organizerRules);
registerConversationKind(crewRules);
registerConversationKind(structureStaffRules);
registerConversationKind(eventStaffRules);

/** Règles d'une sorte ; une sorte sans règles (pas encore livrée) n'ouvre aucun accès. */
export function rulesOf(kind: ConversationKind): KindRules | null {
  return registry.get(kind) ?? null;
}

export function registeredKinds(): KindRules[] {
  return [...registry.values()];
}

export type { ConversationRow, Description, KindRules, ParticipantRow, Reader, Side } from "./types";

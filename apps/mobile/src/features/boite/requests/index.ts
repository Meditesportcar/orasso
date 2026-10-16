// Registre des cartes de Boîte > Demandes (ARCHITECTURE-SUITE § 3.5, anti-conflits) : chaque lot ajoute son fichier
// `requests/<kind>.tsx` et une ligne ci-dessous (crew, confirmation de venue en crew, invitation à un événement,
// transfert de plaque, invitation staff…).
import type { InboxRequestCounts } from "@orasso/shared";
import type { ComponentType } from "react";

import { ContactRequests } from "./contact";
import { FriendRequests } from "./friend";
import type { RequestSectionProps } from "./types";

export type RequestSection = { kind: keyof InboxRequestCounts; Section: ComponentType<RequestSectionProps> };

export const requestSections: RequestSection[] = [
  { kind: "friend", Section: FriendRequests },
  { kind: "contact", Section: ContactRequests },
];

export type { RequestSectionProps } from "./types";

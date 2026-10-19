// Registre des cartes de Boîte > Demandes (ARCHITECTURE-SUITE § 3.5, anti-conflits) : chaque lot ajoute son fichier
// `requests/<kind>.tsx` et une ligne ci-dessous (crew, confirmation de venue en crew, invitation à un événement,
// transfert de plaque, invitation staff…).
import type { InboxRequestCounts } from "@orasso/shared";
import type { ComponentType } from "react";

import { ContactRequests } from "./contact";
import { CrewRequests } from "./crew";
import { CrewConfirmations } from "./crewConfirmation";
import { EventInvitations } from "./eventInvitation";
import { FriendRequests } from "./friend";
import { PlateTransferRequests } from "./plateTransfer";
import { StaffInvitations } from "./staffInvitation";
import type { RequestSectionProps } from "./types";

/** `plateTransfer` (lot 40) : pas de compteur dans `GET /inbox/summary`, la carte se charge seule. */
export type RequestSection = {
  kind: keyof InboxRequestCounts | "plateTransfer";
  Section: ComponentType<RequestSectionProps>;
};

export const requestSections: RequestSection[] = [
  { kind: "friend", Section: FriendRequests },
  { kind: "contact", Section: ContactRequests },
  { kind: "crewConfirmation", Section: CrewConfirmations },
  { kind: "crew", Section: CrewRequests },
  { kind: "staffInvitation", Section: StaffInvitations },
  { kind: "eventInvitation", Section: EventInvitations },
  { kind: "plateTransfer", Section: PlateTransferRequests },
];

export type { RequestSectionProps } from "./types";

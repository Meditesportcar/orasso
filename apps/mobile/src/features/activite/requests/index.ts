// Registre des cartes de demande (lot R7c2) : `kind` de `GET /me/requests` → carte. Chaque sorte de demande a son
// fichier dans ce dossier et une ligne ci-dessous ; le lot R7m1 y ajoute `partnership` sans toucher le reste. Une sorte
// sans carte n'est pas affichée (jamais d'écran cassé pour une sorte que cette version de l'appli ne connaît pas).
import type { RequestKind } from "@orasso/shared";
import type { ComponentType } from "react";

import { ContactRequest } from "./contact";
import { CrewInvitation, CrewRequest } from "./crew";
import { EventInvitationRequest } from "./eventInvitation";
import { FollowRequest } from "./follow";
import { PartnershipRequest } from "./partnership";
import { PlateTransferRequest } from "./plateTransfer";
import { StaffInvitation } from "./staffInvitation";
import type { RequestCardProps } from "./types";

export const requestCards: Partial<Record<RequestKind, ComponentType<RequestCardProps>>> = {
  follow: FollowRequest,
  contact: ContactRequest,
  crew: CrewRequest,
  crew_invitation: CrewInvitation,
  staff: StaffInvitation,
  event_invitation: EventInvitationRequest,
  plate_transfer: PlateTransferRequest,
  partnership: PartnershipRequest,
};

export type { RequestCardProps } from "./types";

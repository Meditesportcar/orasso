// Compteur de la Boîte (lot 25) : invitations à un événement en attente de réponse (Demandes). Enregistré au chargement
// du module (importé par `invitations/routes.ts`).
import { registerInboxCounter } from "../messaging/inbox";
import { invitationsService } from "./service";

registerInboxCounter("eventInvitation", (userId, ex) => invitationsService.pendingCount(userId, ex));

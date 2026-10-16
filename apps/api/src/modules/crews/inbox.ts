// Compteurs de la Boîte (lot 19) : demandes de crew (reçues par un chef, invitations reçues) et venues en crew à
// confirmer. Enregistrés au chargement du module (importé par `crews/routes.ts`).
import { registerInboxCounter } from "../messaging/inbox";
import { crewRegistrationService } from "./registration";
import { crewsService } from "./service";

registerInboxCounter("crew", (userId, ex) => crewsService.pendingCount(userId, ex));
registerInboxCounter("crewConfirmation", (userId, ex) => crewRegistrationService.confirmationCount(userId, ex));

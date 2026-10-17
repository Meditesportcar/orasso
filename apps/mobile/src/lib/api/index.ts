// Les routes de l'API utilisées par l'appli, typées avec `@orasso/shared`, un fichier par domaine (lot 15,
// anti-conflits) : un lot ajoute son fichier et une ligne dans `api` ci-dessous. Aucune règle métier ici : elles sont
// toutes dans l'API (CLAUDE.md).
import { accountApi } from "./account";
import { afterEventApi } from "./after-event";
import { applicationsApi } from "./applications";
import { communicationApi } from "./communication";
import { crewsApi } from "./crews";
import { eventsApi } from "./events";
import { explorerApi } from "./explorer";
import { garageApi } from "./garage";
import { invitationsApi } from "./invitations";
import { messagingApi } from "./messaging";
import { moderationApi } from "./moderation";
import { orgaApi } from "./orga";
import { prosApi } from "./pros";
import { providersApi } from "./providers";
import { securityApi } from "./security";
import { settingsApi } from "./settings";
import { socialApi } from "./social";
import { staffApi } from "./staff";
import { weatherApi } from "./weather";

export type { NotificationItem } from "./account";
export { authApi } from "./auth";
export type { FieldAlert, FieldIncident } from "./orga";

export const api = {
  ...accountApi,
  ...prosApi,
  ...providersApi,
  ...garageApi,
  ...eventsApi,
  ...explorerApi,
  ...applicationsApi,
  ...staffApi,
  ...weatherApi,
  ...socialApi,
  ...settingsApi,
  ...securityApi,
  ...messagingApi,
  ...crewsApi,
  ...communicationApi,
  ...moderationApi,
  ...invitationsApi,
  ...afterEventApi,

  ...orgaApi,
};

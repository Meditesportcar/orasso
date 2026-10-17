// Les routes de l'API utilisées par l'appli, typées avec `@orasso/shared`, un fichier par domaine (lot 15,
// anti-conflits) : un lot ajoute son fichier et une ligne dans `api` ci-dessous. Aucune règle métier ici : elles sont
// toutes dans l'API (CLAUDE.md).
import { accountApi } from "./account";
import { afterEventApi } from "./after-event";
import { applicationsApi } from "./applications";
import { communicationApi } from "./communication";
import { crewsApi } from "./crews";
import { eventEditorApi } from "./eventEditor";
import { eventsApi } from "./events";
import { explorerApi } from "./explorer";
import { garageApi } from "./garage";
import { homeApi } from "./home";
import { invitationsApi } from "./invitations";
import { listsApi } from "./lists";
import { messagingApi } from "./messaging";
import { moderationApi } from "./moderation";
import { orgaApi } from "./orga";
import { prosApi } from "./pros";
import { providersApi } from "./providers";
import { securityApi } from "./security";
import { settingsApi } from "./settings";
import { socialApi } from "./social";
import { staffApi } from "./staff";
import { structureApi } from "./structure";
import { ticketingApi } from "./ticketing";
import { triageApi } from "./triage";
import { weatherApi } from "./weather";

export type { NotificationItem } from "./account";
export { authApi } from "./auth";
export type { GeocodeMatch } from "./eventEditor";
export type { FieldAlert, FieldIncident } from "./orga";
export type { StructureBan } from "./structure";
export type { DecideBody, DecideManyResult, TriageListQuery } from "./triage";

export const api = {
  ...accountApi,
  ...listsApi,
  ...prosApi,
  ...providersApi,
  ...garageApi,
  ...homeApi,
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
  ...structureApi,
  ...triageApi,
  ...ticketingApi,
  ...eventEditorApi,
};

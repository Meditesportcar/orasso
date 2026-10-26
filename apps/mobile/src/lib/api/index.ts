// Les routes de l'API utilisées par l'appli, typées avec `@orasso/shared`, un fichier par domaine (lot 15,
// anti-conflits) : un lot ajoute son fichier et une ligne dans `api` ci-dessous. Aucune règle métier ici : elles sont
// toutes dans l'API (CLAUDE.md).
import { accountApi } from "./account";
import { adminApi } from "./admin";
import { afterEventApi } from "./after-event";
import { applicationsApi } from "./applications";
import { communicationApi } from "./communication";
import { crewPageApi } from "./crewPage";
import { crewsApi } from "./crews";
import { eventEditorApi } from "./eventEditor";
import { eventsApi } from "./events";
import { explorerApi } from "./explorer";
import { garageApi } from "./garage";
import { homeApi } from "./home";
import { invitationsApi } from "./invitations";
import { lineupApi } from "./lineup";
import { listsApi } from "./lists";
import { mediaApi } from "./media";
import { messagingApi } from "./messaging";
import { moderationApi } from "./moderation";
import { networkApi } from "./network";
import { orgaApi } from "./orga";
import { passportApi } from "./passport";
import { prosApi } from "./pros";
import { providersApi } from "./providers";
import { securityApi } from "./security";
import { settingsApi } from "./settings";
import { socialApi } from "./social";
import { staffApi } from "./staff";
import { structureApi } from "./structure";
import { ticketingApi } from "./ticketing";
import { ticketsApi } from "./tickets";
import { triageApi } from "./triage";
import { weatherApi } from "./weather";

export type { NotificationItem } from "./account";
export type { AdminSettings, NewsletterDraft, PlacementCreate, StructureRegistryRow } from "./admin";
export { authApi } from "./auth";
export type { CrewOutingInput, CrewSettingsInput } from "./crewPage";
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
  ...lineupApi,
  ...mediaApi,
  ...explorerApi,
  ...applicationsApi,
  ...staffApi,
  ...weatherApi,
  ...socialApi,
  ...networkApi,
  ...settingsApi,
  ...securityApi,
  ...messagingApi,
  ...crewsApi,
  ...communicationApi,
  ...moderationApi,
  ...invitationsApi,
  ...afterEventApi,
  ...passportApi,
  ...adminApi,

  ...orgaApi,
  ...structureApi,
  ...triageApi,
  ...ticketingApi,
  ...ticketsApi,
  ...eventEditorApi,
  ...crewPageApi,
};

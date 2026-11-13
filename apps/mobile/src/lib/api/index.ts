// Les routes de l'API utilisées par l'appli, typées avec `@orasso/shared`, un fichier par domaine (lot 15,
// anti-conflits) : un lot ajoute son fichier et une ligne dans `api` ci-dessous. Aucune règle métier ici : elles sont
// toutes dans l'API (CLAUDE.md).
import { accountApi } from "./account";
import { activityApi } from "./activity";
import { adminApi } from "./admin";
import { afterEventApi } from "./after-event";
import { albumsApi } from "./albums";
import { applicationsApi } from "./applications";
import { coauthorsApi } from "./coauthors";
import { communicationApi } from "./communication";
import { crewFeedApi } from "./crewFeed";
import { crewPageApi } from "./crewPage";
import { crewsApi } from "./crews";
import { eventEditorApi } from "./eventEditor";
import { eventInvitesApi } from "./eventInvites";
import { eventJournalApi } from "./eventJournal";
import { eventNotificationsApi } from "./eventNotifications";
import { eventsApi } from "./events";
import { explorerApi } from "./explorer";
import { feedApi } from "./feed";
import { feedCommentsApi } from "./feedComments";
import { garageApi } from "./garage";
import { homeApi } from "./home";
import { invitationsApi } from "./invitations";
import { lineupApi } from "./lineup";
import { listsApi } from "./lists";
import { mediaApi } from "./media";
import { memoriesApi } from "./memories";
import { messagingApi } from "./messaging";
import { moderationApi } from "./moderation";
import { networkApi } from "./network";
import { orgaApi } from "./orga";
import { pagesApi } from "./pages";
import { partnershipsApi } from "./partnerships";
import { passportApi } from "./passport";
import { practicalApi } from "./practical";
import { presenceApi } from "./presence";
import { prosApi } from "./pros";
import { providersApi } from "./providers";
import { publicationsApi } from "./publications";
import { securityApi } from "./security";
import { settingsApi } from "./settings";
import { shareApi } from "./share";
import { socialApi } from "./social";
import { spotApi } from "./spot";
import { staffApi } from "./staff";
import { storiesApi } from "./stories";
import { storiesPublishApi } from "./storiesPublish";
import { storiesVideoApi } from "./storiesVideo";
import { structureApi } from "./structure";
import { stylesApi } from "./styles";
import { ticketingApi } from "./ticketing";
import { ticketsApi } from "./tickets";
import { triageApi } from "./triage";
import { votesApi } from "./votes";
import { weatherApi } from "./weather";

export type { NotificationItem } from "./account";
export type { AdminSettings, NewsletterDraft, PlacementCreate, StructureRegistryRow } from "./admin";
export { authApi } from "./auth";
export type { CrewOutingInput, CrewSettingsInput } from "./crewPage";
export type { GeocodeMatch } from "./eventEditor";
export type { FieldAlert, FieldIncident } from "./orga";
export type { StructureBan } from "./structure";
export type { StyleProposalPage } from "./styles";
export type { DecideBody, DecideManyResult, TriageListQuery } from "./triage";

export const api = {
  ...accountApi,
  ...activityApi,
  ...listsApi,
  ...prosApi,
  ...providersApi,
  ...garageApi,
  ...homeApi,
  ...eventsApi,
  ...lineupApi,
  ...mediaApi,
  ...albumsApi,
  ...explorerApi,
  ...applicationsApi,
  ...staffApi,
  ...weatherApi,
  ...practicalApi,
  ...socialApi,
  ...networkApi,
  ...settingsApi,
  ...securityApi,
  ...messagingApi,
  ...crewsApi,
  ...crewFeedApi,
  ...communicationApi,
  ...moderationApi,
  ...invitationsApi,
  ...afterEventApi,
  ...passportApi,
  ...memoriesApi,
  ...presenceApi,
  ...partnershipsApi,
  ...adminApi,

  ...orgaApi,
  ...structureApi,
  ...triageApi,
  ...votesApi,
  ...ticketingApi,
  ...ticketsApi,
  ...eventEditorApi,
  ...eventNotificationsApi,
  ...crewPageApi,
  ...eventInvitesApi,
  ...stylesApi,
  ...spotApi,
  ...feedApi,
  ...feedCommentsApi,
  ...coauthorsApi,
  ...shareApi,
  ...storiesApi,
  ...storiesPublishApi,
  ...storiesVideoApi,
  ...publicationsApi,
  ...eventJournalApi,
  ...pagesApi,
};

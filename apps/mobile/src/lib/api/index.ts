// Les routes de l'API utilisées par l'appli, typées avec `@orasso/shared`, un fichier par domaine (lot 15,
// anti-conflits) : un lot ajoute son fichier et une ligne dans `api` ci-dessous. Aucune règle métier ici : elles sont
// toutes dans l'API (CLAUDE.md).
import { accountApi } from "./account";
import { applicationsApi } from "./applications";
import { eventsApi } from "./events";
import { garageApi } from "./garage";
import { prosApi } from "./pros";
import { staffApi } from "./staff";
import { weatherApi } from "./weather";

export type { NotificationItem } from "./account";
export { authApi } from "./auth";

export const api = {
  ...accountApi,
  ...prosApi,
  ...garageApi,
  ...eventsApi,
  ...applicationsApi,
  ...staffApi,
  ...weatherApi,
};

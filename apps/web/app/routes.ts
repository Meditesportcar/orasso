import type { RouteConfig } from "@react-router/dev/routes";

import adminRoutes from "./routes.admin";
import appRoutes from "./routes.app";
import orgaRoutes from "./routes.orga";
import proRoutes from "./routes.pro";
import publicRoutes from "./routes.public";

// Routes du site, un fichier par espace (lot 15, anti-conflits) : un lot ajoute ses routes dans le fichier de son
// espace, jamais ici.
export default [...publicRoutes, ...appRoutes, ...orgaRoutes, ...proRoutes, ...adminRoutes] satisfies RouteConfig;

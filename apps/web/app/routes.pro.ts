import { index, type RouteConfig, route } from "@react-router/dev/routes";

// Espace pro (`/pro/:pro/*`).
export default [
  // Espace pro (Sable imposé), barre latérale : fiche, publications, statistiques, abonnement en présentation.
  route("pro/:pro", "layouts/pro.tsx", [
    index("routes/pro-fiche.tsx"),
    route("publications", "routes/pro-publications.tsx"),
    route("statistiques", "routes/pro-statistiques.tsx"),
    route("abonnement", "routes/pro-abonnement.tsx"),
  ]),
] satisfies RouteConfig;

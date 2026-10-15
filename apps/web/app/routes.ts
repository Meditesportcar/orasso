import { index, layout, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  // Page de démonstration du système de design : non liée, non référencée (lot 03).
  route("_ds", "routes/ds.tsx"),
  route("deconnexion", "routes/deconnexion.tsx"),

  // Pages publiques : en-tête avec le logo, pied « Propulsé par Orasso ».
  layout("layouts/public.tsx", [
    route("e/:slug", "routes/event.tsx"),
    route("e/:slug/candidater", "routes/candidater.tsx"),
    route("connexion", "routes/connexion.tsx"),
    route("connexion/verification", "routes/verification.tsx"),
    route("inscription", "routes/inscription.tsx"),
    route("conditions", "routes/legal.tsx", { id: "legal-conditions" }),
    route("confidentialite", "routes/legal.tsx", { id: "legal-confidentialite" }),
    route("mentions-legales", "routes/legal.tsx", { id: "legal-mentions" }),
    route("contact", "routes/legal.tsx", { id: "legal-contact" }),
  ]),

  // Mon compte (connecté) : mêmes sections que l'appli.
  layout("layouts/app.tsx", [
    route("app", "routes/app-home.tsx"),
    route("app/explorer", "routes/app-bientot.tsx", { id: "app-explorer" }),
    route("app/boite", "routes/app-bientot.tsx", { id: "app-boite" }),
    route("app/acces", "routes/acces.tsx"),
    route("app/garage", "routes/garage.tsx"),
    route("app/garage/nouveau", "routes/garage-nouveau.tsx"),
    route("app/securite", "routes/securite.tsx"),
  ]),

  // Espace organisateur (Sable imposé), barre latérale.
  route("orga/:structure", "layouts/orga.tsx", [
    index("routes/orga-index.tsx"),
    route("e/:eventId/candidatures", "routes/orga-candidatures.tsx"),
    route("e/:eventId/jour-j", "routes/orga-jour-j.tsx"),
  ]),
] satisfies RouteConfig;

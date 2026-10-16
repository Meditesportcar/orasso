import { layout, type RouteConfig, route } from "@react-router/dev/routes";

// Mon compte (`/app/*`, connecté).
export default [
  // Mon compte (connecté) : mêmes sections que l'appli.
  layout("layouts/app.tsx", [
    route("app", "routes/app-home.tsx"),
    route("app/explorer", "routes/app-bientot.tsx", { id: "app-explorer" }),
    route("app/boite", "routes/app-bientot.tsx", { id: "app-boite" }),
    route("app/acces", "routes/acces.tsx"),
    route("app/garage", "routes/garage.tsx"),
    route("app/garage/nouveau", "routes/garage-nouveau.tsx"),
    route("app/garage/:id", "routes/garage-vehicule.tsx"),
    route("app/moi", "routes/moi.tsx"),
    route("app/securite", "routes/securite.tsx"),
    route("app/structure/nouvelle", "routes/structure-nouvelle.tsx"),
    route("app/pro/nouvelle", "routes/pro-nouvelle.tsx"),
    route("app/billets", "routes/billets.tsx"),
  ]),
] satisfies RouteConfig;

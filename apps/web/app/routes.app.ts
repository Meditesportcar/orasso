import { layout, type RouteConfig, route } from "@react-router/dev/routes";

// Mon compte (`/app/*`, connecté).
export default [
  // Mon compte (connecté) : mêmes sections que l'appli.
  layout("layouts/app.tsx", [
    route("app", "routes/app-home.tsx"),
    route("app/explorer", "routes/app-explorer.tsx"),
    route("app/boite", "routes/app-bientot.tsx", { id: "app-boite" }),
    route("app/acces", "routes/acces.tsx"),
    route("app/garage", "routes/garage.tsx"),
    route("app/garage/nouveau", "routes/garage-nouveau.tsx"),
    route("app/moi", "routes/moi.tsx"),
    route("app/securite", "routes/securite.tsx"),
    route("app/structure/nouvelle", "routes/structure-nouvelle.tsx"),
    route("app/pro/nouvelle", "routes/pro-nouvelle.tsx"),
    route("app/billets", "routes/billets.tsx"),
    // Social (lot 17) : amis, Journal, profils et véhicules des autres (connectés seulement).
    route("app/amis", "routes/amis.tsx"),
    route("app/journal", "routes/journal.tsx"),
    route("u/:pseudo", "routes/profil.tsx"),
    route("v/:id", "routes/vehicule.tsx"),
  ]),
] satisfies RouteConfig;

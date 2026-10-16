import { layout, type RouteConfig, route } from "@react-router/dev/routes";

// Mon compte (`/app/*`, connecté).
export default [
  // Mon compte (connecté) : mêmes sections que l'appli.
  layout("layouts/app.tsx", [
    route("app", "routes/app-home.tsx"),
    route("app/explorer", "routes/app-explorer.tsx"),
    // Boîte (lot 18) : conversations, demandes, conversation en temps réel.
    route("app/boite", "routes/boite.tsx"),
    route("app/boite/demandes", "routes/boite-demandes.tsx"),
    route("app/boite/:id", "routes/boite-conversation.tsx"),
    route("app/acces", "routes/acces.tsx"),
    route("app/garage", "routes/garage.tsx"),
    route("app/garage/nouveau", "routes/garage-nouveau.tsx"),
    route("app/garage/:id", "routes/garage-vehicule.tsx"),
    route("app/moi", "routes/moi.tsx"),
    route("app/securite", "routes/securite.tsx"),
    route("app/structure/nouvelle", "routes/structure-nouvelle.tsx"),
    route("app/pro/nouvelle", "routes/pro-nouvelle.tsx"),
    route("app/prestataire", "routes/prestataire.tsx"),
    route("app/billets", "routes/billets.tsx"),
    // Social (lot 17) : amis, Journal, profils et véhicules des autres (connectés seulement).
    route("app/amis", "routes/amis.tsx"),
    route("app/journal", "routes/journal.tsx"),
    route("u/:pseudo", "routes/profil.tsx"),
    route("v/:id", "routes/vehicule.tsx"),
  ]),
] satisfies RouteConfig;

import { index, type RouteConfig, route } from "@react-router/dev/routes";

// Espace organisateur (`/orga/:structure/*`).
export default [
  // Espace organisateur (Sable imposé), barre latérale.
  route("orga/:structure", "layouts/orga.tsx", [
    index("routes/orga-index.tsx"),
    route("structure", "routes/orga-structure.tsx"),
    route("nouvel-evenement", "routes/orga-evenement-nouveau.tsx"),
    route("e/:eventId", "routes/orga-evenement.tsx"),
    route("e/:eventId/modifier", "routes/orga-evenement-modifier.tsx"),
    route("e/:eventId/candidatures", "routes/orga-candidatures.tsx"),
    route("e/:eventId/jour-j", "routes/orga-jour-j.tsx"),
    route("e/:eventId/billets", "routes/orga-billets.tsx"),
    // Lot 25 : invitations nominatives.
    route("e/:eventId/invitations", "routes/orga-invitations.tsx"),
    // Lot 20 : communication (consignes, annonces, messages groupés, modèles, messages des participants, staff).
    route("communication", "routes/orga-communication.tsx"),
    route("communication/conversation/:id", "routes/orga-conversation.tsx"),
  ]),
] satisfies RouteConfig;

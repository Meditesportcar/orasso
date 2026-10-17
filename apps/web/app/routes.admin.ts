import { index, type RouteConfig, route } from "@react-router/dev/routes";

// Administration (super admin seulement ; le modérateur n'a que les signalements) : layout à barre latérale, une page =
// une route enfant.
export default [
  route("admin", "layouts/admin.tsx", [
    // Lot 33 : accueil (toutes les files et leurs compteurs).
    index("routes/admin/index.tsx"),
    // Lot 13 : structures à vérifier (déplacée de l'accueil au lot 33).
    route("verification", "routes/admin/verification.tsx"),
    // Lot 31 : certifications de véhicules, transferts de plaque à arbitrer.
    route("certifications", "routes/admin/certifications.tsx"),
    route("transferts", "routes/admin/transferts.tsx"),
    // Lot 32 : file des signalements (modérateur et super admin), sanctions et contestations (super admin).
    route("signalements", "routes/admin/signalements.tsx"),
    route("sanctions", "routes/admin/sanctions.tsx"),
    // Lot 27 : badges des structures (rappels, suspension, levée) et fiche d'une structure (propriétaire).
    route("badges", "routes/admin/badges.tsx"),
    route("structures/:id", "routes/admin/structure.tsx"),
    // Lot 34a : horloge simulée (développement seulement : la page répond 404 sans DEV_CLOCK).
    route("horloge", "routes/admin/horloge.tsx"),
    // Lot 33 : registres, base véhicules, journal, mode assistance, contestations de malus, réglages, newsletter,
    // emplacements sponsorisés.
    route("utilisateurs", "routes/admin/utilisateurs.tsx"),
    route("utilisateurs/:id", "routes/admin/utilisateur.tsx"),
    route("structures", "routes/admin/structures.tsx"),
    route("pros", "routes/admin/pros.tsx"),
    route("vehicules", "routes/admin/vehicules.tsx"),
    route("journal", "routes/admin/journal.tsx"),
    route("assistance", "routes/admin/assistance.tsx"),
    route("contestations", "routes/admin/contestations.tsx"),
    route("reglages", "routes/admin/reglages.tsx"),
    route("newsletter", "routes/admin/newsletter.tsx"),
    route("sponsorises", "routes/admin/sponsorises.tsx"),
  ]),
] satisfies RouteConfig;

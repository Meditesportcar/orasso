import { index, layout, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  // Page de démonstration du système de design : non liée, non référencée (lot 03).
  route("_ds", "routes/ds.tsx"),
  route("deconnexion", "routes/deconnexion.tsx"),
  // Référencement (lot 13) : plan du site et robots.txt.
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),

  // Pages publiques : en-tête avec le logo, pied « Propulsé par Orasso ».
  layout("layouts/public.tsx", [
    index("routes/home.tsx"),
    route("evenements", "routes/evenements.tsx"),
    route("e/:slug", "routes/event.tsx"),
    route("e/:slug/candidater", "routes/candidater.tsx"),
    route("o/:slug", "routes/structure.tsx"),
    route("organisateurs", "routes/organisateurs.tsx"),
    route("professionnels", "routes/professionnels.tsx"),
    route("pros", "routes/pros.tsx"),
    route("p/:slug", "routes/pro.tsx"),
    route("invitation/:jeton", "routes/invitation.tsx"),
    route("express/:jeton", "routes/express.tsx"),
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
    route("app/structure/nouvelle", "routes/structure-nouvelle.tsx"),
    route("app/pro/nouvelle", "routes/pro-nouvelle.tsx"),
    route("app/billets", "routes/billets.tsx"),
  ]),

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
  ]),

  // Espace pro (Sable imposé), barre latérale : fiche, publications, statistiques, abonnement en présentation.
  route("pro/:pro", "layouts/pro.tsx", [
    index("routes/pro-fiche.tsx"),
    route("publications", "routes/pro-publications.tsx"),
    route("statistiques", "routes/pro-statistiques.tsx"),
    route("abonnement", "routes/pro-abonnement.tsx"),
  ]),

  // Administration (super admin seulement).
  route("admin", "routes/admin.tsx"),
] satisfies RouteConfig;

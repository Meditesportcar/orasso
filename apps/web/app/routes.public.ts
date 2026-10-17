import { index, layout, type RouteConfig, route } from "@react-router/dev/routes";

// Pages publiques et pages techniques (démonstration, déconnexion, référencement).
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
    // Inscription en crew par le chef (lot 19).
    route("e/:slug/crew", "routes/crew-inscription.tsx"),
    route("o/:slug", "routes/structure.tsx"),
    route("organisateurs", "routes/organisateurs.tsx"),
    route("professionnels", "routes/professionnels.tsx"),
    route("pros", "routes/pros.tsx"),
    route("p/:slug", "routes/pro.tsx"),
    route("invitation/:jeton", "routes/invitation.tsx"),
    // Invitation nominative à un événement, lien envoyé par e-mail (lot 25).
    route("invitation-evenement/:jeton", "routes/invitation-evenement.tsx"),
    route("express/:jeton", "routes/express.tsx"),
    route("connexion", "routes/connexion.tsx"),
    route("connexion/verification", "routes/verification.tsx"),
    // Compte et sécurité (lot 15).
    route("mot-de-passe-oublie", "routes/mot-de-passe-oublie.tsx"),
    route("reinitialisation", "routes/reinitialisation.tsx"),
    route("verification-email", "routes/verification-email.tsx"),
    route("ami/:jeton", "routes/ami.tsx"),
    // Désinscription de la newsletter, lien signé sans connexion (lot 33).
    route("desinscription/:token", "routes/desinscription.tsx"),
    route("inscription", "routes/inscription.tsx"),
    route("conditions", "routes/legal.tsx", { id: "legal-conditions" }),
    route("confidentialite", "routes/legal.tsx", { id: "legal-confidentialite" }),
    route("mentions-legales", "routes/legal.tsx", { id: "legal-mentions" }),
    route("contact", "routes/legal.tsx", { id: "legal-contact" }),
  ]),
] satisfies RouteConfig;
